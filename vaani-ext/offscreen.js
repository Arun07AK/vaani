// VAANI offscreen document — owns the MediaStream from tab capture,
// chunks it to 3s rolling windows, POSTs each to /api/transcribe,
// broadcasts transcripts back to the service worker / PiP window.
//
// Visible pipeline heartbeat: every transition sends a vaani.log event
// that the PiP window renders in its status bar.

const VERCEL_BASE =
  typeof location !== "undefined" && location.hostname === "localhost"
    ? "http://localhost:3002"
    : "https://vaani-gold.vercel.app";
const TRANSCRIBE_URL = `${VERCEL_BASE}/api/transcribe`;
// Shorter chunks → faster signing cadence. Trade-off: marginally less
// context per Whisper request, accepted for smoother avatar reactions.
const CHUNK_MS = 1500;

// #region agent log
const DBG = (location, message, data) => {
  try {
    fetch('http://127.0.0.1:7391/ingest/0ca204d3-54b2-4929-9009-05fc8cd40158', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '3103cc' },
      body: JSON.stringify({ sessionId: '3103cc', location, message, data, timestamp: Date.now() }),
    }).catch(() => {});
  } catch {}
};
let _lastStopAt = 0;
let _lastStartAt = 0;
// #endregion

let mediaStream = null;
let audioContext = null;
let recorder = null;
let chunks = [];
let chunkTimer = null;
let active = false;
let chunkCounter = 0;

function say(type, payload) {
  try {
    chrome.runtime.sendMessage({ type, ...payload });
  } catch (e) {
    // extension was reloaded; ignore
  }
}

function log(msg) {
  console.log("[vaani offscreen]", msg);
  say("vaani.log", { message: msg });
}

// Announce readiness as soon as the listener is wired up.
function ready() {
  say("vaani.offscreen-ready", {});
  log("offscreen ready");
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "vaani.start") {
    void startRecording(msg.streamId);
  } else if (msg?.type === "vaani.stop") {
    stopRecording();
  }
});

// Must be dispatched AFTER the listener is registered.
ready();

function pickMime() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

async function startRecording(streamId) {
  if (active) {
    log("already active; ignoring duplicate start");
    return;
  }
  active = true;
  chunkCounter = 0;

  try {
    log(`acquiring media stream (id=${streamId.slice(0, 8)}\u2026)`);
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });

    // Keep tab audio audible — tabCapture mutes it by default.
    audioContext = new AudioContext();
    const src = audioContext.createMediaStreamSource(mediaStream);
    src.connect(audioContext.destination);

    const mime = pickMime();
    log(`MediaRecorder mime=${mime ?? "default"}`);
    recorder = new MediaRecorder(mediaStream, mime ? { mimeType: mime } : undefined);
    chunks = [];

    recorder.addEventListener("dataavailable", (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    });
    recorder.addEventListener("stop", () => {
      const mimeType = recorder?.mimeType || mime || "audio/webm";
      // #region agent log
      _lastStopAt = Date.now();
      const recordedMs = _lastStartAt ? _lastStopAt - _lastStartAt : -1;
      DBG('offscreen.js:stopHandler', 'recorder.stop fired (post-fix)', {
        chunkCounter: chunkCounter + 1, chunksCount: chunks.length,
        recordingDurationMs: recordedMs, runId: 'post-fix',
      });
      // #endregion
      // Snapshot chunks and restart the recorder SYNCHRONOUSLY so capture
      // resumes within ms — the network round-trip happens off the critical
      // path. Previously we awaited flush before restart, which dropped
      // 0.5–2s of audio per chunk.
      const snapshot = chunks;
      chunks = [];
      if (active) {
        try {
          recorder.start();
          scheduleChunkStop();
          // #region agent log
          const gapMs = Date.now() - _lastStopAt;
          _lastStartAt = Date.now();
          DBG('offscreen.js:stopHandler', 'recorder restarted (post-fix)', {
            gapMsBetweenChunks: gapMs, chunkCounter, runId: 'post-fix',
          });
          // #endregion
        } catch (e) {
          say("vaani.capture-error", {
            message: `recorder.start after stop failed: ${e instanceof Error ? e.message : String(e)}`,
          });
          active = false;
        }
      }
      // Fire-and-forget upload: doesn't block the next chunk's capture.
      void flushChunksToTranscribe(mimeType, snapshot);
    });

    recorder.start();
    // #region agent log
    _lastStartAt = Date.now();
    DBG('offscreen.js:startRecording', 'initial recorder.start', { mime });
    // #endregion
    scheduleChunkStop();
    say("vaani.capture-active", {});
    log("capture active \u00b7 listening for tab audio");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[vaani offscreen] start failed", err);
    say("vaani.capture-error", { message });
    active = false;
  }
}

function scheduleChunkStop() {
  if (chunkTimer) clearTimeout(chunkTimer);
  chunkTimer = setTimeout(() => {
    if (recorder && recorder.state === "recording") recorder.stop();
  }, CHUNK_MS);
}

function stopRecording() {
  active = false;
  if (chunkTimer) clearTimeout(chunkTimer);
  try {
    if (recorder && recorder.state !== "inactive") recorder.stop();
  } catch {}
  try {
    mediaStream?.getTracks().forEach((t) => t.stop());
  } catch {}
  try {
    audioContext?.close();
  } catch {}
  mediaStream = null;
  audioContext = null;
  recorder = null;
  chunks = [];
  log("capture stopped");
}

async function flushChunksToTranscribe(mime, chunkSnapshot) {
  // Backwards-compat: callers may omit the snapshot (use the live chunks ref).
  const source = chunkSnapshot ?? chunks;
  if (source.length === 0) return;
  chunkCounter += 1;
  const n = chunkCounter;
  const blob = new Blob(source, { type: mime });
  if (blob.size < 5000) {
    log(`chunk ${n} \u00b7 skipped (too small, ${blob.size}b)`);
    // #region agent log
    DBG('offscreen.js:flushChunks', 'chunk SKIPPED (too small)', {
      chunk: n, blobSize: blob.size, threshold: 5000,
    });
    // #endregion
    return;
  }

  log(`chunk ${n} \u00b7 uploading ${blob.size}b`);
  const form = new FormData();
  const ext = mime.includes("mp4") ? "m4a" : "webm";
  form.append("audio", new File([blob], `chunk.${ext}`, { type: mime }));

  // #region agent log
  const uploadStartedAt = Date.now();
  // #endregion
  try {
    const res = await fetch(TRANSCRIBE_URL, { method: "POST", body: form });
    if (!res.ok) {
      log(`chunk ${n} \u00b7 transcribe HTTP ${res.status}`);
      // #region agent log
      DBG('offscreen.js:flushChunks', 'transcribe non-OK', {
        chunk: n, status: res.status, uploadMs: Date.now() - uploadStartedAt,
      });
      // #endregion
      return;
    }
    const data = await res.json();
    const transcript = (data?.transcript || "").trim();
    // #region agent log
    DBG('offscreen.js:flushChunks', 'transcribe response', {
      chunk: n, blobSize: blob.size, uploadMs: Date.now() - uploadStartedAt,
      transcript: transcript.slice(0, 120), transcriptLen: transcript.length,
    });
    // #endregion
    if (transcript) {
      log(`chunk ${n} \u00b7 transcript (len=${transcript.length})`);
      say("vaani.transcript", { transcript });
    } else {
      log(`chunk ${n} \u00b7 empty transcript`);
    }
  } catch (err) {
    log(`chunk ${n} \u00b7 fetch error: ${err instanceof Error ? err.message : String(err)}`);
    // #region agent log
    DBG('offscreen.js:flushChunks', 'fetch threw', {
      chunk: n, error: err instanceof Error ? err.message : String(err),
    });
    // #endregion
  }
}
