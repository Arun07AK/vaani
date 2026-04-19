// VAANI PiP window — forwards transcripts from the extension runtime
// into the iframe'd /embed page via window.postMessage, and drives a
// concise status chip + next-up gloss preview. The postToFrame function
// is byte-identical to the pre-redesign version (behavior contract).

const frame = document.getElementById("frame");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const nextText = document.getElementById("next-text");
const closeBtn = document.getElementById("close-btn");
const langSeg = document.getElementById("lang-seg");

function postToFrame(payload) {
  if (!frame?.contentWindow) return;
  try {
    frame.contentWindow.postMessage(payload, "*");
  } catch (e) {
    console.warn("[vaani pip] postMessage failed", e);
  }
}

function setStatus(tone, text) {
  if (!statusDot || !statusText) return;
  statusDot.className = `dot ${tone}`;
  statusText.textContent = text;
}

function setNext(gloss, isHindi) {
  if (!nextText) return;
  nextText.classList.toggle("deva", !!isHindi);
  nextText.textContent = gloss || "—";
}

// --- inbound runtime messages ---------------------------------------------
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  switch (msg.type) {
    case "vaani.transcript": {
      setStatus("ok", "signing");
      // Preview the first few words of the transcript as the "next" label.
      const preview = (msg.transcript || "").trim().split(/\s+/).slice(0, 3).join(" ");
      setNext(preview, /[\u0900-\u097F]/.test(msg.transcript || ""));
      postToFrame({ type: "vaani.transcript", text: msg.transcript });
      break;
    }
    case "vaani.log": {
      // Extension heartbeat — infer a state from the log text.
      const m = String(msg.message || "").toLowerCase();
      if (m.includes("uploading") || m.includes("transcribing")) {
        setStatus("warn", "transcribing");
      } else if (m.includes("skipped") || m.includes("silent")) {
        setStatus("idle", "silent");
      } else if (m.includes("transcript")) {
        setStatus("info", "listening");
      } else {
        setStatus("info", "listening");
      }
      break;
    }
    case "vaani.capture-active":
      setStatus("info", "listening");
      break;
    case "vaani.capture-error":
      setStatus("err", "error");
      setNext(
        String(msg.message || "").slice(0, 60),
        false,
      );
      break;
    default:
      break;
  }
});

// Iframe ready heartbeat — lets us move from "connecting" → "listening"
window.addEventListener("message", (e) => {
  if (e.data?.type === "vaani.embed-ready") {
    setStatus("info", "listening");
  }
});

// Close button — end capture + close the window.
closeBtn?.addEventListener("click", async () => {
  try {
    await chrome.runtime.sendMessage({ type: "vaani.toggle-capture", active: false });
  } catch (e) {
    // If the service worker has already torn down, that's fine.
  }
  window.close();
});

// Language toggle — preference only (the actual ASR lang is driven from
// the iframe's own <MicControl>; the popup stores it; see popup.js).
langSeg?.querySelectorAll("button").forEach((b) => {
  b.addEventListener("click", async () => {
    const lang = b.dataset.lang;
    langSeg.querySelectorAll("button").forEach((bb) => {
      const on = bb.dataset.lang === lang;
      bb.classList.toggle("on", on);
      bb.setAttribute("aria-selected", String(on));
    });
    try {
      await chrome.storage.local.set({ "vaani.lang": lang });
    } catch {}
  });
});

// Hydrate initial language from storage so the footer reflects the popup's choice.
(async function init() {
  try {
    const stored = await chrome.storage.local.get(["vaani.lang"]);
    const lang = stored["vaani.lang"] || "en";
    langSeg?.querySelectorAll("button").forEach((b) => {
      const on = b.dataset.lang === lang;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", String(on));
    });
  } catch {}
})();
