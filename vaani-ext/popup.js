const btn = document.getElementById("start");
const statusEl = document.createElement("div");
statusEl.style.cssText =
  "margin-top:10px;font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#8b8b88;min-height:14px;word-break:break-word";
document.body.appendChild(statusEl);

function log(msg) {
  statusEl.textContent = msg;
  console.log("[vaani popup]", msg);
}

btn.addEventListener("click", async () => {
  btn.disabled = true;
  log("getting active tab\u2026");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      log("no active tab found");
      btn.disabled = false;
      return;
    }

    // Start capture FIRST — the popup user gesture is what authorizes
    // tabCapture.getMediaStreamId for the target tab. Opening a new
    // window before this call breaks that context.
    log("starting tab capture\u2026");
    const response = await chrome.runtime.sendMessage({
      type: "vaani.toggle-capture",
      active: true,
      tabId: tab.id,
    });

    if (!response || response.error) {
      log(`capture failed: ${response?.error ?? "no response"}`);
      btn.disabled = false;
      return;
    }

    // Capture is live. Now open the floating window to render the avatar.
    log("opening vaani window\u2026");
    const width = 380;
    const height = 520;
    const left = (screen.availWidth || 1440) - width - 20;
    const top = 60;

    await chrome.windows.create({
      url: chrome.runtime.getURL("pip.html"),
      type: "popup",
      width,
      height,
      left,
      top,
      focused: false,
    });

    log("active \u2014 closing popup\u2026");
    setTimeout(() => window.close(), 300);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`error: ${msg}`);
    btn.disabled = false;
  }
});
