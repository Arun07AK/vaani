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
const CHUNK_MS = 3000;

let mediaStream = null;
let audioContext = null;
let recorder = null;
let chunks = [];
let chunkTimer = null;
let active = false;
let chunkCounter = 0;
let consecutiveSilentChunks = 0;

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

    // Diagnostics: confirm the tab capture actually has an audio track.
    const tabTracks = mediaStream.getAudioTracks();
    if (tabTracks.length === 0) {
      log("no audio tracks on tab capture — tab is silent or capture failed");
      say("vaani.capture-error", {
        message:
          "tab capture has no audio track — play audio on the captured tab before starting VAANI",
      });
      active = false;
      return;
    }
    const s = tabTracks[0].getSettings?.() || {};
    log(
      `tab audio: ${tabTracks.length} track(s) \u00b7 ${s.sampleRate ?? "?"}Hz \u00b7 ${s.channelCount ?? "?"}ch`,
    );

    audioContext = new AudioContext();
    const src = audioContext.createMediaStreamSource(mediaStream);

    // Keep tab audio audible for the user.
    src.connect(audioContext.destination);

    // Separate recording branch through the audio graph. Feeding the raw
    // tabCapture stream directly into MediaRecorder AND into the AudioContext
    // produces empty WebM chunks (~900 B container overhead) on some Chrome
    // versions because the AudioContext tap can starve the recorder's view
    // of the stream. Routing through a MediaStreamDestination gives the
    // recorder its own processed-audio stream.
    const recDest = audioContext.createMediaStreamDestination();
    src.connect(recDest);
    const recStream = recDest.stream;
    log(
      `recorder stream: ${recStream.getAudioTracks().length} track(s) via AudioContext destination`,
    );

    const mime = pickMime();
    log(`MediaRecorder mime=${mime ?? "default"}`);
    recorder = new MediaRecorder(recStream, mime ? { mimeType: mime } : undefined);
    chunks = [];

    recorder.addEventListener("dataavailable", (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    });
    recorder.addEventListener("stop", async () => {
      const mimeType = recorder?.mimeType || mime || "audio/webm";
      await flushChunksToTranscribe(mimeType);
      if (active) {
        chunks = [];
        try {
          recorder.start();
          scheduleChunkStop();
        } catch (e) {
          say("vaani.capture-error", {
            message: `recorder.start after stop failed: ${e instanceof Error ? e.message : String(e)}`,
          });
          active = false;
        }
      }
    });

    recorder.start();
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
  consecutiveSilentChunks = 0;
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

async function flushChunksToTranscribe(mime) {
  if (chunks.length === 0) return;
  chunkCounter += 1;
  const n = chunkCounter;
  const blob = new Blob(chunks, { type: mime });
  if (blob.size < 5000) {
    consecutiveSilentChunks += 1;
    log(`chunk ${n} \u00b7 skipped (too small, ${blob.size}b)`);
    if (consecutiveSilentChunks === 5) {
      log(
        "5 silent chunks in a row \u00b7 play audio on the captured tab or reload VAANI after starting playback",
      );
    }
    return;
  }
  consecutiveSilentChunks = 0;

  log(`chunk ${n} \u00b7 uploading ${blob.size}b`);
  const form = new FormData();
  const ext = mime.includes("mp4") ? "m4a" : "webm";
  form.append("audio", new File([blob], `chunk.${ext}`, { type: mime }));

  try {
    const res = await fetch(TRANSCRIBE_URL, { method: "POST", body: form });
    if (!res.ok) {
      log(`chunk ${n} \u00b7 transcribe HTTP ${res.status}`);
      return;
    }
    const data = await res.json();
    const transcript = (data?.transcript || "").trim();
    if (transcript) {
      log(`chunk ${n} \u00b7 transcript (len=${transcript.length})`);
      say("vaani.transcript", { transcript });
    } else {
      log(`chunk ${n} \u00b7 empty transcript`);
    }
  } catch (err) {
    log(`chunk ${n} \u00b7 fetch error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
