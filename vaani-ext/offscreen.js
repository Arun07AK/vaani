// VAANI offscreen document — owns the MediaStream from tab capture,
// runs an AudioWorklet to produce 16kHz mono PCM chunks, POSTs each
// ~3-second chunk to the Vercel /api/transcribe endpoint, and relays the
// transcript to the service worker (which broadcasts it to the PiP window).

const VERCEL_BASE =
  (typeof location !== "undefined" && location.hostname === "localhost")
    ? "http://localhost:3002"
    : "https://vaani-gold.vercel.app";

const TRANSCRIBE_URL = `${VERCEL_BASE}/api/transcribe`;
const CHUNK_MS = 3000; // 3-second rolling windows

let mediaStream = null;
let audioContext = null;
let recorder = null;
let chunks = [];
let chunkTimer = null;
let active = false;

chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg?.type === "vaani.start") {
    await startRecording(msg.streamId);
  }
  if (msg?.type === "vaani.stop") {
    stopRecording();
  }
});

async function startRecording(streamId) {
  if (active) return;
  active = true;
  try {
    // The media stream from tabCapture behind a streamId token.
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });

    // Keep tab audio audible to the user — tabCapture mutes it otherwise.
    audioContext = new AudioContext();
    const src = audioContext.createMediaStreamSource(mediaStream);
    src.connect(audioContext.destination);

    const mime = pickMime();
    recorder = new MediaRecorder(mediaStream, mime ? { mimeType: mime } : undefined);
    chunks = [];

    recorder.addEventListener("dataavailable", (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    });
    recorder.addEventListener("stop", async () => {
      await flushChunksToTranscribe(recorder.mimeType || mime || "audio/webm");
      if (active) {
        // Start next rolling window.
        chunks = [];
        recorder.start();
        scheduleChunkStop();
      }
    });

    recorder.start();
    scheduleChunkStop();
  } catch (err) {
    console.error("[vaani offscreen] start failed", err);
    sendTranscriptError(err instanceof Error ? err.message : String(err));
    active = false;
  }
}

function pickMime() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
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
}

async function flushChunksToTranscribe(mime) {
  if (chunks.length === 0) return;
  const blob = new Blob(chunks, { type: mime });
  if (blob.size < 5000) return; // skip silence / tiny chunks

  const form = new FormData();
  const ext = mime.includes("mp4") ? "m4a" : "webm";
  form.append("audio", new File([blob], `chunk.${ext}`, { type: mime }));

  try {
    const res = await fetch(TRANSCRIBE_URL, { method: "POST", body: form });
    if (!res.ok) throw new Error(`transcribe ${res.status}`);
    const data = await res.json();
    const transcript = (data?.transcript || "").trim();
    if (transcript) {
      chrome.runtime.sendMessage({ type: "vaani.transcript", transcript });
    }
  } catch (err) {
    console.warn("[vaani offscreen] transcribe failed", err);
  }
}

function sendTranscriptError(message) {
  chrome.runtime.sendMessage({ type: "vaani.transcript-error", message });
}
