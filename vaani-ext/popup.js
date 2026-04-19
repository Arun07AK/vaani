const btn = document.getElementById("start");

btn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (!("documentPictureInPicture" in window)) {
    alert("This Chrome version doesn't support Document Picture-in-Picture (need 116+).");
    return;
  }

  // Open the Document PiP window from the popup context — user gesture is present.
  const pipWin = await window.documentPictureInPicture.requestWindow({
    width: 360,
    height: 480,
  });

  // Build the PiP DOM with safe DOM APIs (no innerHTML).
  const doc = pipWin.document;
  doc.title = "VAANI";

  const meta = doc.createElement("meta");
  meta.setAttribute("charset", "utf-8");
  doc.head.appendChild(meta);

  Object.assign(doc.body.style, {
    margin: "0",
    background: "#05050f",
    color: "#ededec",
    fontFamily: "system-ui",
    height: "100vh",
  });

  const iframe = doc.createElement("iframe");
  iframe.src = chrome.runtime.getURL("pip.html");
  iframe.setAttribute("allow", "autoplay");
  Object.assign(iframe.style, {
    border: "0",
    width: "100%",
    height: "100%",
    display: "block",
  });
  doc.body.appendChild(iframe);

  // Kick off tab capture via the service worker.
  await chrome.runtime.sendMessage({
    type: "vaani.toggle-capture",
    active: true,
    tabId: tab.id,
  });

  window.close();
});
