# VAANI Chrome Extension

Floating ISL avatar that signs the audio of any web tab in real time.

## Architecture

```
popup.html ──click──▶ background.js ──tabCapture──▶ offscreen.js
                            │                            │
                            ▼                            ▼
                      PiP window                   /api/transcribe
                      (pip.html)                        │
                            │                            ▼
                            │              transcript ─ relay ─▶ background
                            ▼                                         │
                      iframe to                                       │
                      vaani-gold.vercel.app/embed   ◀── postMessage ──┘
```

Single source of truth for avatar rendering stays on the Vercel app —
the extension is a thin shell that grabs audio and forwards transcripts.

## Load unpacked (development)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select this `vaani-ext/` directory
4. Pin the extension to the toolbar
5. Open a YouTube / WhatsApp Web / news-video tab
6. Click the VAANI icon → "Cast tab to VAANI"
7. A Picture-in-Picture window pops out with the avatar; tab audio continues to play; transcripts post to the iframe every ~3 seconds

## Icons

Replace `icons/icon{16,32,48,128}.png` with the final brand marks before submission.
Chrome will warn about missing icons in dev but still loads the extension.

## Backend dependency

The extension POSTs to `https://vaani-gold.vercel.app/api/transcribe`. For
local dev against `http://localhost:3002`, edit `VERCEL_BASE` in
`offscreen.js` or add a host permission for `http://localhost:3002/*`.

The embedded `/embed` route on the Vercel app must accept transcripts via
`window.postMessage({ type: "vaani.transcript", text })`.

## TODO

- [ ] Real icons (16/32/48/128)
- [ ] Streaming Whisper instead of 3s rolling windows (lower latency)
- [ ] Firefox MV3 port (when Mozilla finishes `tabCapture` parity)
- [ ] Edge port (one-line manifest change)
- [ ] Chrome Web Store submission package
