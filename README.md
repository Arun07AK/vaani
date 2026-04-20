# VAANI

Real-time **Indian Sign Language** translator. Speech (English or Hindi) in, a 3D avatar signing in ISL out. Runs as a web app, as a Chrome extension that floats over any tab, and wires straight into a shared backend that handles transcription, grammar, and sign resolution.

**Built solo by [Arun AK](https://github.com/Arun07AK) in 24 hours at Hack Helix 2026, Thapar University** (Track 4 · Problem 01).

> ⚠ **This repository is not open-source.** VAANI is copyrighted, original engineering work of Arun AK. See [LICENSE.md](./LICENSE.md) — reproducing, redistributing, or claiming this work as your own (in hackathons, portfolios, LinkedIn posts, startup pitches, or anywhere else) is explicitly prohibited. You may read, learn from, and cite the work with attribution.

**▶ Demos (all unlisted):**
- Web app — https://youtu.be/csMj22E60-o
- Chrome extension in action — https://youtu.be/NP_Ad4kkmSY
- Motion-capture training toolkit (built from scratch) — https://youtu.be/wFh8U9Rtheg

**UI preview (no translation without your own key):** https://vaani-gold.vercel.app

---

## What it does

Three surfaces, one engine:

- **Web app** — speak or type, watch the 3D avatar sign in real time.
- **Chrome extension** — a floating PiP window that sits on top of any tab (YouTube, Netflix, Zoom, Meet) and signs what's playing.
- **English + Hindi** — same avatar, same engine, both languages out of the box.

Under the hood:

- **Whisper-1** transcribes the audio (auto-detects EN / HI)
- **GPT-4.1** with a strict JSON schema applies ISL grammar — topic-comment reordering, SOV, WH-final, NEG-final, raised-brow non-manual markers on questions
- **3-tier resolver** per gloss: real mocap → procedural composition → letter-by-letter fingerspelling
- **VRM rig** with 44 bones + 15 facial morph targets driven independently at 60 fps (React Three Fiber)
- The motion-capture toolkit (`/tools/capture`) was built from scratch with MediaPipe + Kalidokit — no licensed animation dataset

See `CLAUDE.md` for the full architecture + file map.

---

## ⚠ Testing requires your own OpenAI API key

The translation pipeline makes two paid API calls per sentence — **Whisper-1** for transcription and **GPT-4.1** for ISL grammar. The live deployment at vaani-gold.vercel.app **does not** have an API key attached any more, so the UI loads but pressing the mic or typing a sentence returns `OPENAI_API_KEY not set on server`. This is intentional — API keys cost money and leaving one on a public demo lets strangers run up the bill.

**To actually try VAANI hands-on:**

1. Watch the demos end-to-end — [web app](https://youtu.be/csMj22E60-o) · [Chrome extension](https://youtu.be/NP_Ad4kkmSY) · [training toolkit](https://youtu.be/wFh8U9Rtheg) — OR
2. Clone this repo and bring your own key:
   ```bash
   git clone https://github.com/Arun07AK/vaani.git
   cd vaani
   bun install
   cp .env.local.example .env.local
   # open .env.local, replace `sk-...` with your real key
   bun run dev        # → http://localhost:3002
   ```

**Getting a key:**
- https://platform.openai.com/api-keys
- Cost is about 2 paise / $0.0003 per sentence (one Whisper chunk + one glossify call). A 5-minute hands-on test runs ≈ $0.05–0.10.
- Set a [usage cap](https://platform.openai.com/account/limits) of $5 if you're worried about surprises.
- Never commit the real key. `.env.local` is already in `.gitignore`.

---

## Running it locally

Prereqs: **Node 20** (via `nvm use 20`), **Bun 1.3**, and an OpenAI API key.

```bash
git clone https://github.com/Arun07AK/vaani.git
cd vaani
bun install

cp .env.local.example .env.local
# edit .env.local — put your OpenAI key

bun run dev
# → http://localhost:3002
```

### Commands

```bash
bun run typecheck      # tsc --noEmit
bun run test           # vitest — 12/12 grammar tests
bun run build          # production build
vercel deploy --prod   # deploy to your own Vercel (needs OPENAI_API_KEY in Vercel env)
```

### Chrome extension — local dev

1. `chrome://extensions` → enable **Developer Mode**
2. **Load unpacked** → select the `vaani-ext/` directory
3. Start audio on the target tab **first** (YouTube / Zoom / Meet / Netflix), *then* click the VAANI icon in the Chrome toolbar
4. By default the extension POSTs to the hosted backend at `vaani-gold.vercel.app`. To point it at your local `bun run dev`, edit `TRANSCRIBE_URL` in `vaani-ext/offscreen.js` and reload the extension.

---

## Stack

| Layer | Stack |
|---|---|
| App | Next.js 16 (App Router, React 19, TypeScript strict) |
| UI | Tailwind CSS 4, shadcn/ui, Inter + JetBrains Mono + Noto Sans Devanagari |
| 3D | Three.js 0.184, @react-three/fiber, @pixiv/three-vrm |
| ASR | OpenAI Whisper-1 |
| LLM | OpenAI GPT-4.1 (strict JSON schema) |
| Mocap | MediaPipe Holistic + Kalidokit (offline, produces JSON captures) |
| State | zustand 5 |
| Extension | Chrome MV3 (manifest 3.0, offscreen audio capture, floating PiP via `chrome.windows.create`) |
| Package manager | Bun 1.3 |

---

## Architecture — translation pipeline

```
mic / tab audio
    → /api/transcribe           (Whisper-1)
    → transcript text
    → /api/glossify-llm          (GPT-4.1 · strict JSON schema)
    → ISL gloss sequence         (topic-comment · SOV · WH-final · NEG-final · brow-raise NMM)
    → 3-tier resolver:
        1. captured mocap         (14 signs · public/signs/captures/*.json)
        2. phonological composition (116 words · handshape + palm + location + movement)
        3. fingerspelling          (ISL one-handed alphabet · 26 letters)
    → capture queue (zustand)
    → VRMAvatar — 44 bones + 15 ARKit morphs per frame · 60 fps
```

---

## Repo layout

| Path | Role |
|---|---|
| `app/` | Next.js app — `/` is the main web app, `/embed` is the headless variant the Chrome extension iframes |
| `app/api/` | `transcribe` (Whisper) and `glossify-llm` (GPT-4.1) route handlers |
| `app/_components/` | `AvatarStage`, `VRMAvatar`, `MicControl`, `GlossOverlay`, `TopRule`, `AvatarCell` |
| `lib/` | Grammar (`glossify.ts` + 12 tests), decomposition (`signDecomposition.ts`), resolver (`useTranscriptPipeline.ts`), primitives (`handshapes`, `locations`, `palmOrientations`, `movements`, `signCompose`), stores (`stores/pipeline.ts`) |
| `public/signs/captures/` | 14 mocap-captured JSON sign clips + `manifest.json` |
| `public/avatars/vaani.vrm` | VRM 1.0 humanoid rig |
| `vaani-ext/` | Chrome MV3 extension — `popup.html`, `background.js`, `offscreen.js`, `pip.html`, `pip.js`, `manifest.json` |

---

## Credits

**Solo engineering build by [Arun AK](https://github.com/Arun07AK)** — Thapar Institute of Engineering and Technology, CSE 2nd year.

All engineering, UI/UX, motion-capture toolkit, grammar engine, avatar rigging, Chrome extension, and product design: **Arun AK, end-to-end, 100%.**

Support roles on the Hack Helix 2026 submission (none of whom touched the engineering):

| Teammate | Role |
|---|---|
| Aniket | Pitch preparation & stage delivery |
| Avnish | Research |
| Rajeev | Guidance & research |
| Amarjeet | Guidance |
| Ishaan | Problem-statement selection at hackathon start |

Built over 24 hours at Hack Helix 2026 (Thapar Institute of Engineering and Technology, Track 4 · Problem 01).

---

## License

**VAANI is proprietary, not open-source.** All Rights Reserved © 2026 Arun AK. See [LICENSE.md](./LICENSE.md) for the full terms.

**Summary:**

- ✅ You may clone this repo for personal learning and experimentation on your own machine.
- ✅ You may cite VAANI with attribution (name + `github.com/Arun07AK/vaani`) in articles, research, and portfolios.
- ❌ You may **not** reproduce, fork publicly, host, or redistribute this project under your own name or team's name.
- ❌ You may **not** claim authorship of VAANI or any of its subsystems — in hackathons, portfolios, LinkedIn posts, startup pitches, resumes, or academic submissions.
- ❌ You may **not** use the demo videos, carousel PDF, or screenshots in your own presentations without written permission.
- ❌ You may **not** commercially deploy or monetize VAANI or its derivatives.
- ❌ You may **not** train ML models on this code or its captured data.

Third-party components retain their original licenses: the VRM humanoid rig is CC-licensed from VRoid Hub. Motion-capture JSONs were generated from publicly-available ISLRTC "Sign Learn" reference material using the internal `/tools/capture` pipeline; redistributed here for research/educational use only — commercial use requires independent clearance from ISLRTC.

If you see this work presented as someone else's — on LinkedIn, at a hackathon, in a portfolio, anywhere — please [file a takedown with the hosting platform](./LICENSE.md#6-enforcement-and-takedown) and DM the author.
