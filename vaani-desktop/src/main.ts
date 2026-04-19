import { listen } from "@tauri-apps/api/event";

type TranscriptPayload = { text: string; language?: string };
type StatusPayload = {
  kind: "idle" | "listening" | "processing" | "error";
  message: string;
};

const EMBED_ORIGIN = "https://vaani-gold.vercel.app";

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

function post(msg: unknown) {
  if (!iframe?.contentWindow) return;
  iframe.contentWindow.postMessage(msg, EMBED_ORIGIN);
}

// Heartbeat so we know the embed is up.
window.addEventListener("message", (e) => {
  const data = e.data as { type?: string } | undefined;
  if (!data?.type) return;
  if (data.type === "vaani.embed-ready") {
    setStatus("listening", "listening to system audio");
  }
});

// Rust → iframe bridge.
listen<TranscriptPayload>("vaani-transcript", (e) => {
  post({ type: "vaani.transcript", text: e.payload.text });
});

listen<void>("vaani-reset", () => {
  post({ type: "vaani.reset" });
});

listen<StatusPayload>("vaani-status", (e) => {
  setStatus(e.payload.kind, e.payload.message);
});

setStatus("idle", "connecting…");
