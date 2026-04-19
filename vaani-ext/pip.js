// VAANI PiP window — forwards transcripts from the extension runtime into
// the iframe'd vaani-gold /embed page via window.postMessage.

const frame = document.getElementById("frame");
const statusEl = document.getElementById("status");

function postToFrame(payload) {
  if (!frame?.contentWindow) return;
  frame.contentWindow.postMessage(payload, "*");
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "vaani.transcript") {
    statusEl.textContent = `transcript · ${msg.transcript.slice(0, 60)}`;
    postToFrame({ type: "vaani.transcript", text: msg.transcript });
  }
  if (msg?.type === "vaani.transcript-error") {
    statusEl.textContent = `error · ${msg.message}`;
  }
});

// When the embed page signals ready, swap the status line.
window.addEventListener("message", (e) => {
  if (e.data?.type === "vaani.embed-ready") {
    statusEl.textContent = "vaani · listening to tab audio";
  }
});
