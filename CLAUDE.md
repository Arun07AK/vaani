# VAANI — Real-Time ISL Synthesis

**Submission:** Hack Helix 2026 (TIET Thapar, Track 4 Problem 01). v1 through v4.2 shipped. v4.3 attempted and rolled back.

**Live URL:** https://vaani-gold.vercel.app — hits the same backend the Chrome extension uses.

**Current HEAD:** `ea59864` on `main`. `bun run typecheck` and `bun run test` (12/12) green.

---

## One-liner

Speak English or Hindi → a 3D VRM avatar signs it back in Indian Sign Language, in real time. Whisper transcribes → gpt-4.1 applies ISL grammar → a resolution cascade (mocap / phonological composition / fingerspelling) drives 44 bones + 15 facial morph targets.

---

## Shipped surfaces

| Surface | Path | Status |
|---|---|---|
| Web app — main | `/` on vaani-gold.vercel.app | live |
| Web app — headless embed | `/embed` on vaani-gold.vercel.app | live (consumed by the Chrome extension) |
| Chrome extension (MV3) | `vaani-ext/` | manual install via Load Unpacked |
| Transcribe endpoint | `/api/transcribe` | Whisper-1, accepts `en-IN`/`hi-IN` (server strips region → `en`/`hi`) |
| Glossify endpoint | `/api/glossify-llm` | gpt-4.1 with strict JSON schema, temperature 0.1 |

Explicitly NOT in-tree any more:
- **`vaani-desktop/`** — Tauri 2 + ScreenCaptureKit macOS buddy app. Attempted in v4.3, worked through phase 3 (live system audio capture), rolled back because the user wanted a clean pre-v4.3 state. See commits `65c5a46` → `efe8079` in history for the code, and `c6587ca` for the revert. If reviving, that commit range has the working SCStream + Tauri scaffold.

---

## Architecture — pipeline + file map

```
mic / tab audio
    │
    ▼
  /api/transcribe (Whisper-1, 25 MB cap, ISO 639-1 lang)
    │
    ▼
  transcript text
    │
    ▼
  /api/glossify-llm (gpt-4.1, strict JSON schema)
    │                  ├─ SYSTEM_PROMPT encodes ISL grammar (topic-comment, SOV, WH-final, NEG-final, time-fronted, NMM flags)
    │                  ├─ OUTPUT DISCIPLINE forbids numerals, punctuation, emoji, apostrophes
    │                  └─ returns { glossed: string[], nmms: ("wh"|"neg"|"yn"|null)[] }
    │
    ▼  (rules fallback: lib/glossify.ts — 10 patterns, 12 Vitest tests)
    │
  gloss sequence
    │
    ▼
  lib/useTranscriptPipeline.ts — 3-tier resolver per gloss:
    │    Tier 1 — captured mocap JSON  (public/signs/captures/ · 14 signs)
    │    Tier 2 — phonological composition (116-entry lib/signDecomposition.ts)
    │    Tier 2b — compound split (GOOD-MORNING → GOOD + MORNING)
    │    Tier 3 — fingerspell A-Z (220 ms per letter)
    │    (tier-4 silent pose-preset was removed — dropped glosses are skipped,
    │     their NMM carries forward via `pendingNmm`)
    │
    ▼  queue capped at MAX_QUEUE_DEPTH=8 so avatar stays within ~5 s of audio
    │
  lib/stores/pipeline.ts — useCaptureQueue (append, preserve current)
    │
    ▼
  app/_components/AvatarStage.tsx → VRMAvatar.tsx
    │   per-frame: sample capture/composition → drive 44 VRM bones + ARKit morphs
    │   (composeSign in lib/signCompose.ts layers handshape + palm + location + movement)
    │   (nmmMorphTargets in lib/vrmPoses.ts drives browInnerUp, browDown, etc.)
    │
    ▼
  rendered at 60 fps via @react-three/fiber
```

### Key files — UI / pipeline split

**Presentational (change freely):**
- `app/page.tsx`, `app/layout.tsx`, `app/globals.css`
- `app/_components/MicControl.tsx` — hold-to-talk mic, type fallback, language toggle
- `app/_components/GlossOverlay.tsx` — chip row
- `app/embed/page.tsx` — headless variant for the extension
- `tailwind.config.ts`
- `vaani-ext/popup.html`, `popup.js`, `pip.html`, `pip.js`

**Logic / do not touch for UI work:**
- `app/_components/AvatarStage.tsx`, `VRMAvatar.tsx` — 3D render, mocap/composition sampler, morph-target driver
- `lib/useTranscriptPipeline.ts`, `useSpeech.ts`, `useMic.ts`, `useTranscriptionStore`
- `lib/stores/pipeline.ts` — store shapes are contracts
- `lib/signDecomposition.ts`, `handshapes.ts`, `locations.ts`, `palmOrientations.ts`, `movements.ts`, `signCompose.ts`, `fingerspelling.ts`
- `lib/glossify.ts` + its Vitest file
- `app/api/transcribe/route.ts`, `app/api/glossify-llm/route.ts`
- `vaani-ext/background.js`, `offscreen.js`, `manifest.json`

### Behavior contracts that must stay byte-identical

1. Mic button is `onPointerDown` / `onPointerUp` / `onPointerLeave` — not `onClick`. Hold-to-talk.
2. Language toggle reads + writes `useSpeechASR`'s `lang` + `setLang`. No parallel state.
3. `/embed`'s postMessage contract: receives `{type:"vaani.transcript", text}` and `{type:"vaani.reset"}`, sends `{type:"vaani.embed-ready"}` on mount + 500 ms retry. The Chrome extension (pip.js) depends on this exact shape.
4. Chrome extension IPC: popup → background (`vaani.toggle-capture`) → offscreen (`vaani.start/stop`) → all surfaces broadcast (`vaani.transcript`, `vaani.log`, `vaani.offscreen-ready`, `vaani.capture-active`, `vaani.capture-error`). See `vaani-ext/README.md` if it exists, else trace from `background.js`.
5. The 3D canvas DOM node must remain unclipped — no `overflow-hidden` on parents that would cut the WebGL viewport, no `transform` that fights the canvas.

---

## Rendering depth — what makes the avatar good

**44 bones addressable** — 14 body + 30 fingers (5 fingers × 3 joints × 2 hands). Every single MCP/PIP/DIP can be driven independently.

**15+ ARKit morph targets** driven via `vrm.expressionManager`:
- `browInnerUp` — WH-questions (raised) + YN-questions (sustained)
- `browDownLeft` / `browDownRight` — NEG signs
- `mouthFunnel`, `mouthPucker`, `eyeWideLeft`, `eyeWideRight` — auxiliary NMMs

**Phonological primitives** (`lib/*.ts`):
- 18 handshapes (FIST, FLAT_5, V, W, Y, BABY_O, POINT_INDEX, CLAW, …)
- 14 body-landmark locations (CHEST, CHIN, MOUTH, TEMPLE, FOREHEAD, EAR, SHOULDER_SAME/OPPOSITE, …)
- 6 palm orientations
- 16 movement modulators (HOLD, TAP_ONCE/TWICE, WIGGLE_FINGERS, CIRCLE_CW, ARC_UP/OUT/FORWARD, CLAP_TWICE, BRUSH_ACROSS, SIDE_TO_SIDE, …)

**116-gloss decomposition dictionary** — each entry authored as a tuple `(handshape, palm, location, movement, durationMs)` cross-referenced against ISLRTC Sign Learn + indiansignlanguage.org.

**14 captured mocap JSONs** in `public/signs/captures/` — HELLO, THANK-YOU, MY, YOU, FRIEND, NAME, WATER, WANT, WHAT, SEE, YES, NO, I (+ THANK). Captured via an internal MediaPipe Holistic + Kalidokit retargeting pipeline (browser-based tool at `/tools/capture`).

**Fingerspelling** — 26-letter one-handed ISL alphabet, 220 ms per letter.

---

## Stack (actual as shipped)

- **Next.js 16.2.4** app router (`/app`), **React 19.2**, **TypeScript strict**
- **Tailwind CSS 4** + **shadcn/ui** (Button + utils added)
- **Three.js 0.184** + **@react-three/fiber 9.6** + **@react-three/drei 10.7**
- **@pixiv/three-vrm 3.5** — VRM 1.0 humanoid rig loader
- **OpenAI SDK 6.34** — Whisper + gpt-4.1
- **zustand 5** — pipeline state stores
- **compromise** — browser NLP (used in rule-based glossify fallback)
- **hound** (unused since v4.3 rollback — previously used for WAV encoding in the desktop app)
- **lucide-react** — icons (only icon library; do not add others)
- **Bun 1.3.12**, Node 20.20 via nvm

### Session setup

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20
# every session before any bun/next/npm command — default shell may have Node 18
```

### Commands

```bash
bun run dev                       # local dev at http://localhost:3002
bun run typecheck                 # tsc --noEmit, must pass
bun run test                      # vitest (12 glossify tests must stay green)
bun run build                     # Next.js production build
vercel deploy --prod --yes        # deploy to vaani-gold.vercel.app
```

### Chrome extension install

1. `chrome://extensions` → enable Developer Mode
2. Load Unpacked → pick `vaani-ext/` directory
3. Start audio on a YouTube/Meet/Zoom tab **first**, then click the VAANI icon
4. Reload after any change to `offscreen.js` / `background.js` (Chrome caches service workers aggressively)

---

## Important gotchas

**Whisper lang code.** `/api/transcribe` strips region suffix (`en-IN` → `en`). Clients can send either shape. The lang-strip bug was caught once — see commit `1f365e8`.

**gpt-4.1 vs gpt-5-mini.** We tried gpt-5-mini earlier. It forbids `temperature`, so output drifted into numerics (`"2"` instead of `"TWO"`), emoji, and punctuation — each of which missed every resolution tier and caused silent idle gaps. Pinned back to `gpt-4.1` with `temperature: 0.1`. See commit `efdfb0d`.

**Queue backlog.** Whisper chunks arrive every ~3 s, each sign plays for ~1.4 s, so a continuous-speech stream grows the capture queue faster than it drains. The pipeline caps the queue at 8 items (MAX_QUEUE_DEPTH) and drops oldest (never `current`). Raise the cap only if you're confident the avatar can catch up.

**Tier-4 silent idle.** Removed in `efdfb0d`. If a gloss doesn't resolve through mocap / decomp / fingerspell, it's dropped entirely. Its NMM carries forward to the next resolvable item via `pendingNmm`.

**Chrome tabCapture + AudioContext.** The raw MediaStream fed to MediaRecorder sometimes produces empty WebM chunks (~982 B container overhead) on Chrome ≥ 130 because the AudioContext tap consumes the stream. **This was fixed once (via `createMediaStreamDestination` for the recorder) and then rolled back** in commit `c6587ca` because the user said it had been working before. If this symptom reappears, the fix to restore is in commit `3838c6c`.

**Vercel upload rate limit.** `vercel deploy` uploads the repo on each run. If anything at repo root balloons the upload (e.g. Rust `target/`, `node_modules/` in non-ignored subprojects), Vercel's free-tier api-upload-free quota caps at 5000 files/day and returns "Too many requests — try again in 24 hours." If this happens, either add the bloated dir to `.vercelignore` or use `vercel deploy --prod --yes --archive=tgz` (single tarball upload).

**Webview cold start.** When the Chrome extension PiP opens, the iframe takes ~500-800 ms to mount. `embed/page.tsx` signals readiness with a postMessage on mount AND a second retry at 500 ms. `pip.js` / `main.ts` must NOT enqueue transcripts until the ready signal arrives, otherwise the first few get dropped.

---

## Working conventions

1. **User is a strong engineer.** Skip hand-holding, default to ambitious solutions, flag trade-offs explicitly.
2. **Never add `Co-Authored-By` lines** in git commits.
3. **Opinionated over generic.** If there's a right answer, state it.
4. **One commit per surface** when doing multi-file UI work (makes rollback surgical).
5. **Preserve the test suite.** 12/12 glossify tests stay green on every commit.
6. **`/effort xhigh`** default. Opus 4.7 for architecture / Q&A / gnarly debug; Sonnet 4.6 for routine implementation.
7. **Avoid `git reset --hard` + `git push --force`** on main. Use `git revert` so history and rollback-of-rollback are available.

### Commit style

- `feat: …` for new capability
- `fix: …` for bug repair (name the user-visible symptom)
- `refactor: …` for code changes without behavior change
- `chore: …` for infra / tooling
- `revert: …` for rollback commits (link the original SHA)
- Bodies explain the *why* and any subtle contract that must be preserved. See recent commits (`efdfb0d`, `c6587ca`) for style reference.

---

## Scope-cut fallbacks (battle-tested during the build)

- **If animation blending isn't clean:** drop composition tier, use only mocap + fingerspell. Captured signs still render correctly.
- **If ASR fails live:** type-input path is always wired and uses the same gloss → avatar pipeline; pitch adjusts to "type-driven demo, mic works on laptop."
- **If Chrome extension regresses pre-demo:** fall back to the web app + screen-share — same UI, same avatar, same quality.
- **If Vercel is down:** run `bun run dev` locally, screen-share from localhost.
- **Pre-recorded 60-sec demo video** is the ultimate safety net (record before any high-stakes demo).

---

## Major history (commits worth remembering)

- `ea59864` — current HEAD; .cursor/ gitignore
- `efdfb0d` — **chrome ext word-skipping fix**: tier-4 removed, queue cap, gpt-4.1 + temperature 0.1, fingerspell 350 → 220 ms
- `c6587ca` — **revert** of v4.3 macOS + the ext AudioContext-destination fix
- `efe8079`, `3f13813`, `5efad10`, `65c5a46` — v4.3 macOS desktop (rolled back; reference for SCStream + Tauri code if reviving)
- `1f365e8` — server lang-strip (kept through the rollback)
- `b9e3d66` — gpt-5 model bump + two-hand symmetry
- `aca8856` — ARKit morph-target NMMs
- `59fd751` — v4.1 sign fidelity: phonological composition + fingerspelling

---

## The one rule above all rules

> **If unsure what to do next, ask: "Will a judge notice this in 60 seconds?"**
> Yes → do it now. No → do it later or never.
