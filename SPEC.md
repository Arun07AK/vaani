# VAANI — SPEC.md

> Authoritative specification for VAANI at Hack Helix 2026. Locked Apr 18, 2026 — hour 0. Any change to committed scope requires a written amendment in §15 with a timestamp.

---

## 1. Product identity

**One-line:** Real-time spoken English → Indian Sign Language on a 3D avatar, rule-based ISL grammar, 50-sign lexicon, live mic input with a type fallback.

**Product name:** VAANI (Hindi "वाणी" — speech/voice).

**Event:** Hack Helix 2026 — TIET Thapar, inaugural edition. Track 4, Problem 01. 22-hour hackathon, Apr 18 5 PM IST → Apr 19 3 PM IST. Judges = TIET CSE/ECE faculty.

**Why this problem:** 63M Deaf Indians; English→ISL on an avatar has high demo "retellability," genuine engineering depth (CG + NLP + signal sync), and a Space-Odyssey-compatible hook (ISS silent communication).

---

## 2. User / demo flow (locked)

**Primary persona:** Hack Helix judge at the demo table. 3-minute pitch, then interact.

**Canonical demo script:**
1. Hook (0:00–0:15): *"On the ISS, when audio fails, astronauts sign to each other through the window. For 63 million Deaf Indians, every day is that window. We built the translator."*
2. Pitch (0:15–2:00): problem → approach → technical frame.
3. **Hero live demo:** judge hears *"Thank you my friend"* spoken → avatar crossfades `THANK-YOU → MY → FRIEND`.
4. **Grammar-reordering showcase:** *"What is your name?"* → avatar signs `YOUR NAME WHAT` with raised-brow NMM.
5. **Space-Odyssey tie:** *"Astronaut sees Earth"* → `ASTRONAUT EARTH SEE`.
6. **Fallback proof:** speak an OOV word → avatar plays `UNKNOWN_GESTURE` + gloss overlay pulses the word.
7. Q&A: "validated against ISLRTC, Zeshan grammar, ISLTranslate dataset; native-signer touchpoint via [instructor] on [date]."

**Stage safety net:** 60-second pre-recorded demo video on the desktop. If live Whisper glitches or WiFi drops, we swap to video mid-pitch.

---

## 3. Scope

### 3a. v1 — committed deliverables (ship no matter what)

| Deliverable | Detail |
|---|---|
| **50-sign ISL lexicon** | Tiered: 15 hand-keyed hero signs (native 3D animation baked into GLB) + 35 video-fallback signs (pre-recorded MP4 shown inside the 3D scene via `VideoTexture`). |
| **10 rule-based English sentence patterns** | See §6. Deterministic. SVO, copular, WH, negation, time-fronting, possession/plural, want/need. |
| **Live English ASR** | Server-side **OpenAI Whisper via Next.js 16 API route**. Hold-to-talk MediaRecorder → POST `/api/transcribe` → text in ~1.5s. |
| **Type-instead fallback** | Always-visible textarea. Enter submits. Zero-dependency path end-to-end. |
| **3D humanoid avatar** | **Ready Player Me stylized cartoon** full-body XR avatar (GLB, OpenXR finger rig, ARKit morph targets). |
| **Animation blending** | `@react-three/drei`'s `useAnimations` → `AnimationMixer.crossFadeTo(nextAction, 0.25, true)`. 250ms crossfade, tunable via debug UI. |
| **Non-manual markers (minimal)** | Raised-brow morph on WH/YN-marked tokens; subtle head-shake on `NOT` tokens. Tokens are flagged `{text, nmm}` by the grammar engine. |
| **OOV handler** | Unknown word → shared `UNKNOWN_GESTURE` clip + Gloss Overlay pulses the word in uppercase. |
| **Space-Odyssey UI** | Dark gradient, subtle parallax stars. Judge-legible Gloss Overlay showing current + next-queued sign. |
| **Vercel deployment** | Live URL pinned by hour 1 (bare), refreshed at hours 8, 16, 21. |
| **60-sec fallback demo video** | Recorded at hour 21. Sits on desktop as last-resort safety net. |

### 3b. v2 — stretch (only if v1 ships by hour 14)

- LLM-driven gloss for arbitrary sentences beyond the 10 patterns (`gpt-4o-mini` few-shot glosser).
- Per-sign facial NMMs beyond WH/neg.
- Multi-sentence continuous signing with prosody-aware pauses.
- IK correction at sign transitions.
- Hindi ASR added to existing English flow.

### 3c. Explicitly OUT of scope for hackathon

Full ISL grammar; reverse sign→text; multi-user avatars; native mobile app; IK/physics; any non-English spoken language; any non-ISL sign language; auth; accounts; analytics.

### 3d. v3 — post-hackathon future vision (research direction, NOT hackathon scope)

Evolve VAANI into a friction-reduction layer for Deaf-user device interaction. Candidate directions to brainstorm AFTER v1 ships and is verified:

- **Browser extension** — real-time sign overlay on any web page/video; context-menu "translate selection to ISL"; signing-avatar companion for Meet/Zoom.
- **Native app** — wrapper for the speech↔sign flow + passive-caption mode.
- **OS-level layer** — global desktop shortcut opens a signing overlay; system audio → sign stream.

Evaluation lens: Friction Thesis (reduce the cost of action). Do NOT expand into v3 during the 22-hour build.

---

## 4. Technical architecture

### 4.1 Stack (final)

- **Next.js 16.2.4** (app router, `/app`), **React 19.2**, TypeScript strict.
- **Tailwind CSS 4** + **shadcn/ui** (Button + utils shipped; add `card, input, textarea, toast` via `bunx --bun shadcn@latest add`).
- **Three.js 0.184** + **@react-three/fiber 9.6** + **@react-three/drei 10.7**.
- **OpenAI SDK 6.34** (Whisper server-side transcription).
- **New deps installed in Phase 0:**
  - `zustand` — lightweight store for pipeline state (per superior-pattern research: decoupled stages, independent failure).
  - `compromise` — browser NLP for POS-tag + lemmatize + stopword drop (replaces spaCy/Python; ~200KB).
  - `@pixiv/three-vrm` — reserved for v2 avatar swap if RPM finger rig fails.
  - `pose-format` — for schema compatibility; dictionary schema supports `pose` alongside `clip` entries so a pose-intermediate upgrade in v3 requires no pipeline rewrite.
- **Bun 1.3.12**, **Node 20.20.0 via nvm** — every shell session starts with `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20`.
- **Deploy:** Vercel.
- **Next.js 16 advisory:** consult `node_modules/next/dist/docs/` before Next-specific code.

### 4.2 System shape (pipeline-as-state-machine, pattern lifted from sign.mt)

```
+---------------------- Browser (Next 16 client) ----------------------+
|                                                                      |
|   [MicControl] ──(WebM blob)──▶ /api/transcribe ──▶ OpenAI Whisper   |
|                                                                      |
|   [Type-fallback textarea]                                           |
|                 │                                                    |
|                 ▼                                                    |
|   ┌────────────────── zustand stores ───────────────────────┐        |
|   │  transcription · normalization · gloss · clipQueue      │        |
|   │  · animation  (each independent; stage failure isolated) │        |
|   └──────────────────────────────────────────────────────────┘       |
|                 │                                                    |
|    Intl.Segmenter → compromise lemma/stopword → lookup patterns      |
|                 │                                                    |
|                 ▼                                                    |
|   gloss tokens [{text, nmm}]  →  signQueue (FIFO + timing)           |
|                 │                                                    |
|                 ▼                                                    |
|   ┌─ R3F Canvas (AvatarStage) ─────────────────────────────┐         |
|   │  RPM GLB + useAnimations + signs.csv manifest         │         |
|   │  AnimationMixer.crossFadeTo(0.25s, warp=true)         │         |
|   │  VideoFallback plane  ·  NMM morph/bone drivers       │         |
|   │  GlossOverlay (drei <Html>)                            │         |
|   └────────────────────────────────────────────────────────┘         |
+----------------------------------------------------------------------+
```

**Superior patterns adopted (from deep-research on sign.mt, ZurichNLP spoken-to-signed, Sign-Kit):**

1. **Pipeline-as-state-machine with independent stores** — transcription failure doesn't kill rendering; rendering failure doesn't kill transcription. Source: `sign/translate` `translate.state.ts`. Implementation: zustand.
2. **`Intl.Segmenter` for sentence splitting** — built-in browser, zero-deps, per-language. Source: `translate.service.ts:splitSpokenSentences`.
3. **Dictionary-as-CSV, not grammar-as-engine** — `public/signs/isl.csv` with `gloss,type,source,duration_ms,handedness,nmm_hint`. OOV → `UNKNOWN_GESTURE`. Source: `gloss_to_pose/lookup/csv_lookup.py`.
4. **Crossfade in clip space via `AnimationMixer.crossFadeTo`** — R3F's `useAnimations` gives it for free; Sign-Kit's hard-pause approach is rejected. Source: `@react-three/drei` docs.
5. **Dictionary schema future-proof for pose files** — v1 uses `clip`/`video` entries; v3 can swap to `pose` entries (MediaPipe keypoints + retargeting) without pipeline rewrite. Keeps v3 migration path open.
6. **Signing-boundary trim (best-connection-point port)** — v2 stretch: port `smoothing.py:find_best_connection_point` from Python to TS for optimal clip-to-clip join frames.

### 4.3 File layout

| Path | Role |
|---|---|
| `app/layout.tsx` | Root layout, dark theme, Space-Odyssey gradient, fonts. |
| `app/page.tsx` | Single-page app. Mounts `AvatarStage`, `MicControl`, `GlossOverlay`. |
| `app/api/transcribe/route.ts` | Next 16 route handler. `POST` audio → Whisper → `{transcript}`. |
| `app/_components/AvatarStage.tsx` | R3F `<Canvas>`, `useGLTF` + `useAnimations`. |
| `app/_components/MicControl.tsx` | Hold-to-talk button + type-fallback textarea. |
| `app/_components/GlossOverlay.tsx` | Current + next sign chips. |
| `app/_components/VideoFallback.tsx` | `VideoTexture` plane for video-fallback glosses. |
| `lib/stores/pipeline.ts` | Zustand stores (transcription, gloss, clipQueue, animation). |
| `lib/glossify.ts` | English → ISL gloss transform (§6). Uses `compromise`. |
| `lib/glossify.test.ts` | Vitest. One case per pattern. |
| `lib/signQueue.ts` | FIFO queue + crossfade scheduler. |
| `lib/useMic.ts` | MediaRecorder + POST wrapper. |
| `public/avatars/vaani.glb` | RPM full-body XR avatar (ARKit morphs). |
| `public/signs/vaani-signs.glb` | 15 hand-keyed hero-sign clips, packed into one GLB. |
| `public/signs/isl.csv` | `gloss,type,source,duration_ms,handedness,nmm_hint` — all 50 entries + OOV. |
| `public/signs/videos/*.mp4` | 35 fallback videos (~1.5s each). |
| `public/demo/fallback-demo.mp4` | 60-sec pre-recorded safety-net demo. |
| `.env.local` | `OPENAI_API_KEY=sk-...` (gitignored). |
| `SPEC.md` | Repo root — this spec. |

### 4.4 Data contracts

```ts
type GlossToken = {
  text: string;                       // uppercase, matches isl.csv gloss column
  nmm?: "wh" | "neg" | "yn";
  isOOV?: boolean;
};

type SignEntry = {
  gloss: string;
  type: "clip" | "video" | "pose" | "alphabet";  // "pose" reserved for v3
  source: string;                     // animation name | video URL | pose file | letters
  duration_ms: number;
  handedness?: "L" | "R" | "LR";
  nmm_hint?: string;
};
```

---

## 5. Lexicon — 50 signs, tiered

**Tier 1 — Hand-keyed hero signs (15, baked into `vaani-signs.glb`):**
`HELLO, THANK-YOU, I, YOU, MY, NAME, FRIEND, WHAT, YES, NO, WATER, FOOD, HOME, ASTRONAUT, EARTH`

**Tier 2 — Video fallback (35, recorded to `public/signs/videos/`):**
Greetings: `GOODBYE, SORRY, PLEASE, NAMASTE`
Pronouns: `HE-SHE, WE, THEY, YOUR`
Verbs: `EAT, DRINK, GO, COME, SEE, WANT, NEED, HAVE, KNOW, HELP`
WH: `WHO, WHERE, WHEN, WHY, HOW`
Time: `TODAY, YESTERDAY, TOMORROW, NOW`
Neg: `NOT`
Nouns: `SCHOOL`
Adjectives: `GOOD, BAD, HAPPY, HUNGRY`
Numbers: `ONE, TWO, THREE`
Space: `STAR`

**Tier 3 — OOV handler:** single shared `UNKNOWN_GESTURE` clip + text overlay.

**Capture protocol:** reference ISLRTC "Sign Learn" Android app + `indiansignlanguage.org` side-by-side. Re-animate on the RPM rig; never embed raw videos. Credit ISLRTC and FDMSE in `README.md`.

---

## 6. Grammar rules (engine spec)

**Pipeline:** lowercase → `Intl.Segmenter` (sentence-split) → `compromise` (tokenize + POS + lemmatize) → stopword drop → pattern-match → emit `GlossToken[]`.

**Stopword set:** `a, an, the, is, am, are, was, were, be, been, being, do, does, did, have(aux), has(aux), had(aux), will, shall, to, of`.

**Transformation rules (A–J):** function-word drop · SVO→SOV · time-fronting · negation-final with `nmm:"neg"` · WH-final with `nmm:"wh"` · Y/N marker · copula drop · plural by number/repetition · possession by juxtaposition · verb lemmatization.

**Pattern evaluation priority:** 7 → 8 → 5 → 6 → 4 → 10 → 9 → 1 → 2 → 3.

**The 10 patterns (frozen):**

| # | English template | ISL output | Example |
|---|---|---|---|
| 1 | `[SUBJ] [VERB] [OBJ]` | `[SUBJ] [OBJ] [VERB]` | "I eat rice" → `I RICE EAT` |
| 2 | `[SUBJ] is [ADJ]` | `[SUBJ] [ADJ]` | "I am happy" → `I HAPPY` |
| 3 | `[SUBJ] is (a) [NOUN]` | `[SUBJ] [NOUN]` | "She is a friend" → `SHE FRIEND` |
| 4 | `[SUBJ] [VERB] [OBJ] [TIME]` | `[TIME] [SUBJ] [OBJ] [VERB]` | "I will go home tomorrow" → `TOMORROW I HOME GO` |
| 5 | `[SUBJ] don't [VERB] [OBJ]` | `[SUBJ] [OBJ] [VERB] NOT` | "I don't know you" → `I YOU KNOW NOT` |
| 6 | `[SUBJ] is not [ADJ/NOUN]` | `[SUBJ] [ADJ/NOUN] NOT` | "He is not a doctor" → `HE DOCTOR NOT` |
| 7 | `What/Who is [NP]?` | `[NP] WHAT/WHO` | "What is your name?" → `YOUR NAME WHAT` |
| 8 | `Where/When/Why/How do [SUBJ] [VERB] [OBJ]?` | `[SUBJ] [OBJ] [VERB] [WH]` | "Where do you live?" → `YOU LIVE WHERE` |
| 9 | `[SUBJ] want/need [OBJ]` | `[SUBJ] [OBJ] WANT/NEED` | "I want water" → `I WATER WANT` |
| 10 | `[SUBJ] have [NUM] [NOUN]` | `[SUBJ] [NOUN] [NUM] HAVE` | "I have two friends" → `I FRIEND TWO HAVE` |

Every example = one Vitest case in `lib/glossify.test.ts`.

---

## 7. Non-functional requirements

- **Latency:** ASR < 2.5s p95; gloss sync; first-sign-playing < 3.0s after release.
- **Visual:** 60fps on M1/M2 MacBook equivalent. No shadows, `meshLambertMaterial` where possible.
- **Offline:** type-fallback path works with zero network. ASR requires network (accepted).
- **Crash safety:** pre-recorded demo video + Vercel URL on phone.
- **Demo reset:** keyboard `r` clears queue, returns avatar to idle.

---

## 8. Prior art we stand on (+ patterns adopted)

| Source | License | Pattern lifted |
|---|---|---|
| [sign/translate](https://github.com/sign/translate) | CC-BY-NC (reference only) | Pipeline-as-state-machine; `Intl.Segmenter` sentence splitting; 2-renderer fallback idea. |
| [spoken-to-signed-translation](https://github.com/sign-language-processing/spoken-to-signed-translation) | MIT (directly portable) | CSV-dictionary lookup; signing-boundary trim; `find_best_connection_point` crossfade (v2); few-shot GPT glosser idea. |
| [pose-format](https://github.com/sign-language-processing/pose) | MIT | Dictionary schema includes `pose` type for v3 upgrade path. |
| [spectre900/Sign-Kit](https://github.com/spectre900/Sign-Kit-An-Avatar-based-ISL-Toolkit) | no LICENSE (reference only) | Per-word JSON data shape; what NOT to do (imperative rAF loop, hard pauses). |
| [xenova/whisper-web](https://github.com/xenova/whisper-web) | MIT | AudioWorklet chunking (v2 fallback, not v1). |
| Springer 2022 "English→ISL Gloss Rule-Based" (Patel et al.) | academic | §6 rule set. |
| Zeshan — *Indo-Pakistani Sign Language Grammar* | academic | Topic-comment formalism. |
| Pfau & Zeshan — WH-word placement | academic | WH-final canonical gloss. |
| Ready Player Me Full-body XR | free tier | Rigged GLB w/ ARKit morphs + finger bones. |
| `@react-three/drei` `useAnimations` | MIT | Crossfade primitive. |
| ISLRTC Sign Learn app + `indiansignlanguage.org` (FDMSE) | reference only | Visual reference when re-animating. Credited in README. |

---

## 9. Execution plan — phase by phase

**Design principle:** each phase has explicit entry criteria, exit criteria (verifiable), a git checkpoint, a rollback option, and a budget ceiling. If a phase blows its budget, the cut-scope option fires — we do not let a stuck phase destroy later phases.

**Budget math:** 22h total minus 2h submission theater = **20h engineering budget.** Phases 0–7 consume it with 1.5h explicit slack.

### Phase 0 — Foundation + scaffold (budget 1.5h)
**Goal:** working Next 16 dev server, new deps installed, baseline Vercel deploy.
**Exit:** `bun run dev` serves `/`; Vercel URL resolves; deps in `package.json`.
**Git checkpoint:** `chore: phase 0 scaffold + deps + deploy` → push.

### Phase 1 — Avatar on screen (budget 2h)
**Goal:** RPM avatar in R3F Canvas; finger bones + ARKit morphs confirmed.
**Exit:** 60fps avatar at `/`; debug dropdown lists GLB clips.
**Rollback:** activate `@pixiv/three-vrm` + VRoid if RPM rig broken (> 1h debug cutoff).
**Git checkpoint:** `feat: phase 1 RPM avatar on R3F canvas with debug UI` → push.

### Phase 2 — ASR + type fallback (budget 2h)
**Goal:** hold-to-talk transcript; type-input also works.
**Exit:** "I want water" spoken → transcript in ≤2.5s; Enter submits typed text.
**Rollback:** Web Speech API if OpenAI flaky.
**Git checkpoint:** `feat: phase 2 whisper asr + type fallback` → push.

### Phase 3 — Grammar engine (budget 2h, TDD)
**Goal:** `glossify()` passes all 10 Vitest cases.
**Exit:** `bun test lib/glossify.test.ts` — 10/10 green.
**Rollback:** drop stuck pattern (> 15min) to §15 amendment; keep ≥ 7 patterns.
**Git checkpoint:** `feat: phase 3 glossify engine all 10 patterns green` → push.

### Phase 4 — Lexicon capture + manifest (budget 4h, parallelizable)
**Goal:** 50-entry `isl.csv` + all assets on disk.
**Exit:** CSV has 51 rows; GLB has 15 named clips; one outreach email sent.
**Rollback:** cut to 8 hero signs; migrate rest to video tier.
**Git checkpoint:** `feat: phase 4 lexicon + manifest + hand-keyed hero GLB` → push.

### Phase 5 — End-to-end integration (budget 3h)
**Goal:** speak → avatar crossfades through gloss.
**Exit:** "I want water" works end-to-end; NMM visible on "what is your name"; OOV fires UNKNOWN_GESTURE.
**Rollback:** freeze on type-only + video-only signs if stuck at hour 11.
**Git checkpoint:** `feat: phase 5 end-to-end mic→gloss→avatar` → push. Tag `v0.5-demo-exists`.

### Phase 6 — Polish + NMMs + UI (budget 2.5h)
**Goal:** looks like a product; Space-Odyssey theme lands.
**Exit:** all 3 NMM types visible; 60fps on 4-sign sentence.
**Rollback:** cut NMMs first; keep UI polish.
**Git checkpoint:** `feat: phase 6 polish + NMMs + OOV visual` → push.

### Phase 7 — Validation + rehearsal + submission (budget 3h)
**Goal:** ISL-instructor has watched; pitch tight; submission in.
**Exit:** instructor touchpoint done; pitch < 3min; Devfolio submitted; fallback video on desktop.
**Git checkpoint:** `chore: v1 submitted` → push. Tag `v1-submission`.

### Slack buffer (0.5h)
For unexpected bugs or a stubborn pattern. If unused, invest in rehearsal.

### Post-submission (out of hackathon scope)
- `v2-stretch` branch: LLM glosser, expanded NMMs, IK, Hindi ASR.
- `v3-research` branch: extension / app / OS-layer vision (Friction Thesis lens).

---

## 10. Git / commit discipline (non-negotiable)

- **Branch:** `main`.
- **Commit cadence:** every completed sub-task, every hour boundary, every passing Vitest run, every successful deploy.
- **Commit message style:** short imperative (`feat: avatar crossfade wiring`). No Co-Authored-By lines.
- **Push cadence:** every commit → `git push origin main` (no batching).
- **Never skip hooks / signing.** If pre-commit fails, fix and make a new commit.
- **Tag `v1-submission`** at hour 22 before Devfolio submission.

---

## 11. Verification (pass/fail gates — do not claim done without running)

1. **Hour 2 gate:** `bun run dev` loads `/`; R3F `<Canvas>` visible; RPM avatar renders; console clean; Vercel deploy succeeds.
2. **Hour 6 gate:** `bun test lib/glossify.test.ts` — all 10 green. Type "I want water" → `I WATER WANT`.
3. **Hour 12 gate:** Speak "I want water" → avatar plays `I → WATER → WANT` with visible crossfade. Video fallback fires on one OOV.
4. **Hour 14 GO/NO-GO:** end-to-end demo of all 10 patterns via type-fallback. If any fails, cut v2.
5. **Hour 19:** ISL-instructor touchpoint done.
6. **Hour 20:** Vercel runtime logs clean. Pitch < 3min.
7. **Hour 22:** Devfolio submitted.

Demo spine (any can be called by a judge): `HELLO`, `THANK YOU MY FRIEND`, `I WANT WATER`, `WHAT IS YOUR NAME`, `ASTRONAUT SEES EARTH`, `YESTERDAY I GO SCHOOL`.

---

## 12. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| RPM finger rig doesn't import cleanly into Blender | Medium | Activate `@pixiv/three-vrm` path + VRoid avatar. +3h; decision deadline hour 6. |
| Whisper latency > 2.5s on venue WiFi | Medium | Type-fallback always visible; pre-recorded video is final safety net. |
| All 15 hand-keyed signs take too long | High | Drop to 8 hero signs; migrate rest to Tier 2. |
| No ISL instructor responds by hour 19 | Medium | Frame Q&A as "validated against ISLRTC/Zeshan/ISLTranslate; native-signer validation post-hackathon." |
| Venue WiFi fails | Medium | Mobile hotspot primary; Vercel URL on phone tertiary. |
| Avatar clips through floor / hands through body | High | Accept for v1. y-offset + scale debug controls. IK is v2. |
| ASR misfires on Indian-English accent | Medium | Type fallback is one tap away. Rehearsals include ASR-fail recovery. |

---

## 13. Non-negotiables (5 rules, reaffirmed)

1. Lexicon at **50 polished**, not 150 choppy.
2. Animation blending is priority engineering — one owner from hour 2.
3. Grammar is rule-based for 10 patterns. LLM is v2 only.
4. ASR hardware fallback: lapel mic + visible "Type instead" button.
5. One ISL-instructor validation touchpoint by hour 19.

---

## 14. Credits / references

- **ISLRTC** (Indian Sign Language Research and Training Centre, New Delhi) — lexicon reference via official "Sign Learn" Android app.
- **FDMSE / RKMVERI Coimbatore** — `indiansignlanguage.org` community lexicon.
- Zeshan (2003), Pfau & Zeshan, Patel et al. (Springer 2022) — ISL grammar scholarship.
- Amit Moryossef et al. (sign.mt / sign/translate) — pipeline architecture inspiration.
- ZurichNLP (spoken-to-signed-translation) — CSV dictionary + smoothing algorithms.
- Ready Player Me — avatar rig.
- pmndrs (R3F + drei) — rendering stack.

---

## 15. Amendments

*(empty — future scope changes land here with timestamp and one-line reason)*
