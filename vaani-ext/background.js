// VAANI extension — MV3 service worker.
// Role: on icon click, capture the active tab's audio and route PCM
// chunks to an offscreen document (which owns the audio pipeline because
// MV3 service workers can't hold MediaStreams), and open a Document
// Picture-in-Picture window that shows the VRM avatar signing.

const OFFSCREEN_URL = chrome.runtime.getURL("offscreen.html");
const PIP_URL = chrome.runtime.getURL("pip.html");

async function hasOffscreenDocument() {
  if (typeof chrome.runtime.getContexts !== "function") return false;
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [OFFSCREEN_URL],
  });
  return contexts.length > 0;
}

async function ensureOffscreen() {
  if (await hasOffscreenDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ["USER_MEDIA"],
    justification:
      "VAANI captures the active tab's audio, resamples it, and POSTs chunks to the transcription backend.",
  });
}

async function closeOffscreen() {
  if (await hasOffscreenDocument()) {
    await chrome.offscreen.closeDocument();
  }
}

async function startCapture(tabId) {
  await ensureOffscreen();

  // tabCapture in MV3 needs a media stream ID handed to the offscreen doc.
  const streamId = await new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId(
      { targetTabId: tabId },
      (id) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(id);
      },
    );
  });

  chrome.runtime.sendMessage({
    type: "vaani.start",
    streamId,
    tabId,
  });
}

async function stopCapture() {
  chrome.runtime.sendMessage({ type: "vaani.stop" });
  await closeOffscreen();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "vaani.toggle-capture") {
    if (msg.active) void startCapture(msg.tabId);
    else void stopCapture();
    sendResponse({ ok: true });
  }
  // Forward transcript events from offscreen → any open PiP/popup window.
  if (msg?.type === "vaani.transcript") {
    chrome.runtime.sendMessage(msg);
  }
  return true;
});

// Also expose a direct icon-click toggle for speed.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  await startCapture(tab.id);
});
