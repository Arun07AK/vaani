// VAANI extension — MV3 service worker.
// Orchestrates tab-capture: popup asks us to start → we create the
// offscreen document (owns MediaStream because SWs can't), await its
// "ready" heartbeat, fetch a tabCapture streamId while the user
// gesture is still fresh, hand it off, and wait for the offscreen to
// confirm "capture-active" before ACKing the popup.

const OFFSCREEN_URL = chrome.runtime.getURL("offscreen.html");

// --- offscreen lifecycle ---------------------------------------------------

async function hasOffscreenDocument() {
  if (typeof chrome.runtime.getContexts !== "function") return false;
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [OFFSCREEN_URL],
  });
  return contexts.length > 0;
}

let offscreenReadyPromise = null;

function waitForOffscreenReady() {
  if (offscreenReadyPromise) return offscreenReadyPromise;
  offscreenReadyPromise = new Promise((resolve) => {
    const listener = (msg) => {
      if (msg?.type === "vaani.offscreen-ready") {
        chrome.runtime.onMessage.removeListener(listener);
        resolve(true);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    // In case the offscreen was already mounted and we missed the beat.
    setTimeout(() => {
      chrome.runtime.onMessage.removeListener(listener);
      resolve(false);
    }, 3000);
  });
  return offscreenReadyPromise;
}

async function ensureOffscreen() {
  if (await hasOffscreenDocument()) {
    offscreenReadyPromise = Promise.resolve(true); // already up
    return;
  }
  offscreenReadyPromise = null;
  const ready = waitForOffscreenReady();
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ["USER_MEDIA"],
    justification:
      "VAANI captures tab audio via MediaRecorder and posts chunks to the transcription backend.",
  });
  await ready;
}

async function closeOffscreen() {
  if (await hasOffscreenDocument()) {
    try {
      await chrome.offscreen.closeDocument();
    } catch (e) {
      console.warn("[vaani bg] closeOffscreen", e);
    }
  }
  offscreenReadyPromise = null;
}

// --- capture orchestration -------------------------------------------------

function waitForCaptureActive() {
  return new Promise((resolve) => {
    const listener = (msg) => {
      if (msg?.type === "vaani.capture-active") {
        chrome.runtime.onMessage.removeListener(listener);
        resolve({ ok: true });
      } else if (msg?.type === "vaani.capture-error") {
        chrome.runtime.onMessage.removeListener(listener);
        resolve({ ok: false, error: msg.message });
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    setTimeout(() => {
      chrome.runtime.onMessage.removeListener(listener);
      resolve({ ok: false, error: "offscreen didn't confirm capture within 5s" });
    }, 5000);
  });
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

  const activePromise = waitForCaptureActive();

  // Post to offscreen. With the ready-handshake above, the listener is live.
  chrome.runtime.sendMessage({ type: "vaani.start", streamId, tabId });

  const result = await activePromise;
  if (!result.ok) throw new Error(result.error);
}

async function stopCapture() {
  chrome.runtime.sendMessage({ type: "vaani.stop" });
  await closeOffscreen();
}

// --- message router --------------------------------------------------------

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
    return true; // keep message channel open for async sendResponse
  }
  // Other messages (vaani.transcript / vaani.log / vaani.offscreen-ready /
  // vaani.capture-active / vaani.capture-error) are broadcast via
  // chrome.runtime.sendMessage and reach every extension view automatically.
  return false;
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  try {
    await startCapture(tab.id);
  } catch (err) {
    console.error("[vaani bg] action click", err);
  }
});
