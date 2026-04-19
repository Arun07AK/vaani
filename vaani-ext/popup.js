const btn = document.getElementById("start");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const hostEl = document.getElementById("host");
const audioToggle = document.getElementById("audio-toggle");
const langSeg = document.getElementById("lang-seg");

function setStatus(tone, text) {
  if (!statusDot || !statusText) return;
  statusDot.className = `dot ${tone}`;
  statusText.textContent = text;
}

function setHost(url) {
  if (!hostEl) return;
  try {
    const u = new URL(url);
    hostEl.textContent = u.host + (u.pathname !== "/" ? u.pathname : "");
  } catch {
    hostEl.textContent = "—";
  }
}

// --- seed from storage + active tab ----------------------------------------
(async function init() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) setHost(tab.url);
    const stored = await chrome.storage.local.get([
      "vaani.lang",
      "vaani.audible",
    ]);
    const lang = stored["vaani.lang"] || "en";
    const audible = stored["vaani.audible"] !== false;

    langSeg.querySelectorAll("button").forEach((b) => {
      const on = b.dataset.lang === lang;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", String(on));
    });

    audioToggle.classList.toggle("on", audible);
    audioToggle.setAttribute("aria-pressed", String(audible));
    audioToggle.textContent = audible ? "on" : "off";
  } catch (e) {
    // storage not available in dev — ignore
  }
})();

// --- audio-audible toggle (preference only; consumed by offscreen.js later)
audioToggle.addEventListener("click", async () => {
  const on = !audioToggle.classList.contains("on");
  audioToggle.classList.toggle("on", on);
  audioToggle.setAttribute("aria-pressed", String(on));
  audioToggle.textContent = on ? "on" : "off";
  try {
    await chrome.storage.local.set({ "vaani.audible": on });
  } catch {}
});

// --- language segmented toggle --------------------------------------------
langSeg.querySelectorAll("button").forEach((b) => {
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

// --- cast tab to VAANI (behavior contract: sendMessage + windows.create
//     stay byte-identical to the original popup.js implementation) ----------
btn.addEventListener("click", async () => {
  btn.disabled = true;
  setStatus("info", "starting capture…");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus("err", "no active tab");
      btn.disabled = false;
      return;
    }

    // Start capture FIRST — the popup user gesture is what authorizes
    // tabCapture.getMediaStreamId for the target tab. Opening a new
    // window before this call breaks that context.
    const response = await chrome.runtime.sendMessage({
      type: "vaani.toggle-capture",
      active: true,
      tabId: tab.id,
    });

    if (!response || response.error) {
      setStatus("err", `${response?.error ?? "no response"}`);
      btn.disabled = false;
      return;
    }

    setStatus("ok", "capture active");

    // Capture is live. Now open the floating window to render the avatar.
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

    setTimeout(() => window.close(), 300);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus("err", msg.slice(0, 40));
    btn.disabled = false;
  }
});
