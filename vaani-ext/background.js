// VAANI extension — MV3 service worker.
// Role: on user click in the popup, grab a tab-capture streamId for the
// active tab, hand it to an offscreen document (which holds the
// MediaStream because MV3 service workers can't), and relay
// transcripts from the offscreen doc to all other extension views
// (the floating popup window that renders the avatar).

const OFFSCREEN_URL = chrome.runtime.getURL("offscreen.html");

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
      "VAANI captures the active tab's audio and posts chunks to the transcription backend.",
  });
}

async function closeOffscreen() {
  if (await hasOffscreenDocument()) {
    try {
      await chrome.offscreen.closeDocument();
    } catch (e) {
      console.warn("[vaani bg] closeOffscreen", e);
    }
  }
}

async function startCapture(tabId) {
  await ensureOffscreen();

  const streamId = await new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || "tabCapture failed"));
      } else if (!id) {
        reject(new Error("tabCapture returned empty stream id"));
      } else {
        resolve(id);
      }
    });
  });

  // Give the offscreen document a moment to mount the message listener.
  await new Promise((r) => setTimeout(r, 150));

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
    (async () => {
      try {
        if (msg.active) {
          await startCapture(msg.tabId);
          sendResponse({ ok: true });
        } else {
          await stopCapture();
          sendResponse({ ok: true });
        }
      } catch (err) {
        console.error("[vaani bg] toggle-capture", err);
        sendResponse({ error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return true; // async
  }
  // Pass-through: offscreen → popup/pip windows.
  // chrome.runtime.sendMessage already broadcasts to all extension contexts,
  // so no manual relay is needed here.
  return false;
});

// Icon click = shortcut to popup behavior (popup still handles the window),
// but also safe as a direct trigger if popup is bypassed.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  try {
    await startCapture(tab.id);
  } catch (err) {
    console.error("[vaani bg] action click", err);
  }
});
