// VAANI PiP window — forwards transcripts from the extension runtime
// into the iframe'd vaani-gold /embed page via window.postMessage, and
// surfaces pipeline heartbeat messages in the status bar so the user
// can see capture liveness in real time.

const frame = document.getElementById("frame");
const statusEl = document.getElementById("status");

function postToFrame(payload) {
  if (!frame?.contentWindow) return;
  try {
    frame.contentWindow.postMessage(payload, "*");
  } catch (e) {
    console.warn("[vaani pip] postMessage failed", e);
  }
}

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  switch (msg.type) {
    case "vaani.transcript":
      setStatus(`transcript \u00b7 ${msg.transcript.slice(0, 64)}`);
      postToFrame({ type: "vaani.transcript", text: msg.transcript });
      break;
    case "vaani.log":
      setStatus(`vaani \u00b7 ${msg.message}`);
      break;
    case "vaani.capture-active":
      setStatus("vaani \u00b7 capture active");
      break;
    case "vaani.capture-error":
      setStatus(`vaani \u00b7 error: ${msg.message}`);
      break;
    default:
      break;
  }
});

window.addEventListener("message", (e) => {
  if (e.data?.type === "vaani.embed-ready") {
    setStatus("vaani \u00b7 avatar ready");
  }
});
