import { listen } from "@tauri-apps/api/event";

type TranscriptPayload = { text: string; language?: string };
type StatusPayload = {
  kind: "idle" | "listening" | "processing" | "error";
  message: string;
};

const iframe = document.getElementById("avatar") as HTMLIFrameElement | null;
const dot = document.getElementById("status-dot");
const text = document.getElementById("status-text");

function setStatus(kind: StatusPayload["kind"], message: string) {
  if (dot) {
    dot.className = "";
    if (kind !== "idle") dot.classList.add(kind);
  }
  if (text) text.textContent = message;
}

// Buffer transcripts that arrive before the iframe signals ready. Flush on
// embed-ready so nothing is dropped during the cold-start window.
let embedReady = false;
const pending: Array<{ type: string; text?: string }> = [];

function post(msg: { type: string; text?: string }) {
  if (!iframe?.contentWindow) return;
  // Target "*" is fine — embed explicitly handles cross-origin postMessage
  // and reads data.type itself. A strict origin gets rejected when the
  // iframe's navigation hasn't committed yet, dropping the first transcript.
  iframe.contentWindow.postMessage(msg, "*");
}

function flush() {
  while (pending.length) {
    const msg = pending.shift();
    if (msg) post(msg);
  }
}

function send(msg: { type: string; text?: string }) {
  if (!embedReady) {
    pending.push(msg);
    return;
  }
  post(msg);
}

window.addEventListener("message", (e) => {
  const data = e.data as { type?: string } | undefined;
  if (data?.type === "vaani.embed-ready") {
    embedReady = true;
    setStatus("listening", "listening to system audio");
    flush();
  }
});

listen<TranscriptPayload>("vaani-transcript", (e) => {
  const t = (e.payload.text ?? "").trim();
  if (!t) return;
  // Echo a short preview so we can visually confirm the event arrived on the
  // TS side even if the iframe forward is misrouted.
  const preview = t.length > 32 ? t.slice(0, 32) + "…" : t;
  setStatus("processing", `sign: ${preview}`);
  send({ type: "vaani.transcript", text: t });
});

listen<void>("vaani-reset", () => {
  send({ type: "vaani.reset" });
});

listen<StatusPayload>("vaani-status", (e) => {
  // Rust → UI status updates. Don't clobber an in-flight transcript preview.
  if (e.payload.kind === "processing" && e.payload.message === "transcribing…") {
    return;
  }
  setStatus(e.payload.kind, e.payload.message);
});

setStatus("idle", "connecting…");
