import { invoke } from "@tauri-apps/api/core";
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
  // eslint-disable-next-line no-console
  console.log(`[vaani] status: ${kind} — ${message}`);
}

let embedReady = false;
const pending: Array<{ type: string; text?: string }> = [];

function post(msg: { type: string; text?: string }) {
  if (!iframe?.contentWindow) {
    console.warn("[vaani] iframe contentWindow null; dropping", msg);
    return;
  }
  iframe.contentWindow.postMessage(msg, "*");
  console.log("[vaani] posted to iframe:", msg.type, msg.text?.slice(0, 60) ?? "");
}

function flush() {
  console.log(`[vaani] flushing ${pending.length} pending transcript(s)`);
  while (pending.length) {
    const msg = pending.shift();
    if (msg) post(msg);
  }
}

function send(msg: { type: string; text?: string }) {
  if (!embedReady) {
    console.log("[vaani] embed not ready — queuing", msg.type);
    pending.push(msg);
    return;
  }
  post(msg);
}

window.addEventListener("message", (e) => {
  const data = e.data as { type?: string } | undefined;
  if (!data?.type) return;
  console.log("[vaani] iframe → parent:", data.type);
  if (data.type === "vaani.embed-ready") {
    embedReady = true;
    setStatus("listening", "listening to system audio");
    flush();
  }
});

async function bootstrap() {
  await listen<TranscriptPayload>("vaani-transcript", (e) => {
    const t = (e.payload.text ?? "").trim();
    if (!t) return;
    const preview = t.length > 32 ? t.slice(0, 32) + "…" : t;
    console.log("[vaani] vaani-transcript received:", t);
    setStatus("processing", `sign: ${preview}`);
    send({ type: "vaani.transcript", text: t });
  });

  await listen<void>("vaani-reset", () => {
    console.log("[vaani] vaani-reset received");
    send({ type: "vaani.reset" });
  });

  await listen<StatusPayload>("vaani-status", (e) => {
    // Avoid clobbering the "sign: <preview>" we just set from the transcript.
    if (e.payload.kind === "processing" && e.payload.message === "transcribing…") {
      return;
    }
    setStatus(e.payload.kind, e.payload.message);
  });

  setStatus("idle", "connecting…");

  // Tell Rust we're ready to receive events. The audio drain loop is blocked
  // on this exact call so nothing gets emitted into a not-yet-listening DOM.
  try {
    await invoke("frontend_ready");
    console.log("[vaani] frontend_ready sent to Rust");
  } catch (err) {
    console.error("[vaani] frontend_ready invoke failed:", err);
  }
}

bootstrap().catch((err) => console.error("[vaani] bootstrap failed:", err));
