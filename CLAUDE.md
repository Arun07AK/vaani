# VAANI — Real-Time ISL Synthesis (Hack Helix 2026)

**Project repo for AK's Hack Helix 2026 submission — Track 4 Problem 01.**

> ⚠️ **Next.js 16 breaking changes:** See `AGENTS.md` — Next.js 16 has API / convention / file-structure differences from training data. Read `node_modules/next/dist/docs/` before writing Next-specific code. Heed deprecation notices.

## What this is

**VAANI** converts spoken English into Indian Sign Language (ISL) on a 3D avatar in real time. Mic → Whisper transcript → rule-based ISL grammar engine → 3D avatar signs via Three.js + Mixamo rigged model with animation blending.

Hack Helix 2026 — inaugural edition, TIET Thapar, Apr 18 (5 PM IST) → Apr 19. 22-hr build. **Submission deadline: Apr 19 ~3 PM (hour 22 of event).**

## Event context

- **First edition** of Hack Helix (no historical PSs / winners).
- **Judges:** TIET CSE/ECE faculty — rubric leans **technical excellence + problem authenticity** (NOT VC pitch, NOT sponsor-native).
- **No sponsors confirmed** publicly as of kickoff.
- **Prize pool:** ~₹1.06L. Winner ~₹44K / 1st RU / 2nd RU / Best First Year Team / Best All Girls Team.
- **Fest theme:** "Space Odyssey" — opening pitch hook should bridge space → problem for free bonus points.
- **Problem statements PDF:** `../HELIX-2026/Problem_statement.pdf` (17 problems across 5 tracks, if re-scoping).

## Why VAANI won the PS selection

After 4 parallel research agents + brainstorming-skill decision loop + explicit removal of PULZ/URF authenticity bias + stress-test across 4 candidates (ISL / Cold Chain / Hallucination Audit / Dataset Bias):

- **Highest retellability** in the PDF ("the one with the 3D avatar signing a judge's sentence").
- **Interaction Primitive archetype** — judges watch physical motion on stage.
- **Space Odyssey hook lands strongest** (ISS silent communication analog).
- **Track 4 less crowded** than Track 5 / Track 2.
- **Genuine engineering depth** (CG + NLP + signal sync integration), not just pipeline glue.

**Variance is real:** ceiling is top-1 if execution is crisp, floor is middle-pack if lexicon incomplete or animation choppy. Full team capability absorbs the risk.

## Committed scope (locked Apr 18, hour 0)

### v1 — guaranteed demo
- **50 polished signs** (NOT 150 choppy)
- **10 rule-based English sentence patterns** (topic-comment reordering for ISL gloss) — NOT LLM for arbitrary input
- **English Whisper ASR** (Hindi deferred to v2 — English locked by user in scoping interview)
- **3D humanoid avatar** (style pending: stylized cartoon / minimalist silhouette / abstract geometric. Realistic ruled out — uncanny-valley risk in 22 hr.)
- **Animation blending** via Three.js AnimationMixer + crossfade (priority engineering work)
- **Mic input with "Type instead" fallback button** (Whisper failures happen — hardware-grade backup mandatory)

### v2 — stretch (only if v1 ships by hour 14)
- ISL topic-comment reordering for arbitrary input via LLM
- Non-manual markers (facial expressions, head tilts, brow position)
- Multi-sentence continuous signing
- IK correction at transition frames for hand position accuracy
- Hindi ASR added to existing English flow

### NOT IN SCOPE
- Full ISL grammar coverage (scope trap)
- Reverse-direction (sign-to-text via video recognition)
- Multi-user / collaborative avatars
- Native mobile app (web PWA only)

### One-line product identity
> "Real-time speech-to-ISL synthesis on a 3D avatar — rule-based grammar + 50-sign lexicon, live English mic input with type-fallback."

## The 5 execution rules (non-negotiable)

1. **Lexicon at 50 polished signs, not 150 choppy.** Depth beats breadth. Judges won't count vocabulary; they'll judge the 10 signs in your demo.
2. **Animation blending is priority engineering.** One teammate OWNS Three.js AnimationMixer + crossfade + IK correction from hour 2.
3. **Grammar is rule-based for 10 sentence patterns.** Deterministic demo. LLM for arbitrary input is v2 only.
4. **ASR hardware fallback:** lapel mic at venue + visible "Type instead" button. One bad ASR moment on stage kills the illusion.
5. **ONE ISL-instructor validation call by hour 19.** DM 3 ISL teachers on Instagram/LinkedIn. Even one 10-min video call watching your demo becomes the Q&A defense weapon: *"We validated with [Name], certified ISL instructor."*

## Team role split (4 roles, ~30 hr total w/ overlap)

| Role | Budget | Owns |
|---|---|---|
| Avatar + blending | 14 hr | Three.js + Mixamo import + AnimationMixer + IK + demo screen polish |
| Grammar + ASR | 6 hr | Rule engine for 10 patterns + Whisper wiring + type-fallback button |
| Lexicon capture | 6 hr | 50 signs captured (ISLRTC / YouTube reference) + gloss→animation map |
| Pitch + outreach | 4 hr | Pitch draft + ISL instructor outreach + demo rehearsal + README |

## Stack (already scaffolded in this repo)

- **Next.js 16** (app router, `/app` not `/src/app`) + **React 19** + **TypeScript (strict)**
- **Tailwind CSS 4** + **shadcn/ui** (Button + utils initialized; add more via `bunx --bun shadcn@latest add <component>`)
- **Three.js 0.184** + **@react-three/fiber 9.6** + **@react-three/drei 10.7** (avatar + animation)
- **OpenAI SDK 6.34** (Whisper transcription)
- **lucide-react** (icons)
- Package manager: **Bun 1.3.12**
- Node: **20.20.0** via nvm — **critical:** every `bun` / `npm` / `npx` invocation must run under `nvm use 20` first. Default shell may have Node 18 which breaks Next 16.
- Deploy: **Vercel** (set up hour 1)

### Node 20 activation for every session
```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20
```
Run this once at the start of every shell session before any `bun` / `next` / `npm` command.

## Session defaults (Claude Code)

- **Auto mode ON** (Shift+Tab → "Auto"). ~84% fewer permission prompts.
- **`/effort xhigh`** default.
- **Model routing** (from `../HELIX-2026/kit/MODEL-RULE.md` Option B — winner pattern):
  - **Opus 4.7 `/effort max`** → SPEC.md interview, architecture decisions, pitch draft (hour 8), Q&A stress test (hour 22), gnarly debug (one turn only).
  - **Sonnet 4.6 `/effort xhigh`** → 90% of implementation (Three.js blending, Whisper wiring, React UI, grammar rules).
  - **Haiku 4.5 via subagent** → Mixamo catalog browsing, ISL sign reference search, file discovery.
- **`/clear` past 50% context.** 4.7's tokenizer fills ~30% faster than 4.6.
- **`/rewind`, NOT git worktrees** (March 2026 worktree silent-failure bug).
- **Subagents for INVESTIGATION, not implementation.**
- **Be literal in prompts.** 4.7 doesn't silently generalize. List edge cases explicitly.

## Reference materials (parent workspace)

Live at `../HELIX-2026/`. Don't duplicate — reference these:

- **`../HELIX-2026/PROCESS-ORDER.md`** — 10-phase playbook + 16 prompts (SPEC.md interview, feature-build, parallel subagent dispatch, pitch draft, screenshot polish, README gen, Q&A stress, Devfolio copy, debug-when-stuck)
- **`../HELIX-2026/prework.md`** — §6 decision heuristic (confirms T4 P01 pick)
- **`../HELIX-2026/kit/MODEL-RULE.md`** — full model routing matrix
- **`../HELIX-2026/kit/SNIPPETS.md`** — 13 tech recipes (Whisper #6, Three.js #11, WebGPU #9, Service Worker #10)
- **`../HELIX-2026/kit/PITCH-TEMPLATE.md`** — 6-slot pitch scaffold
- **`../HELIX-2026/kit/QA-DEFENSE-KIT.md`** — regenerate 15 answers for VAANI-specific at hour 20
- **`../HELIX-2026/kit/EDGE-CASE-PLAYBOOK.md`** — fallback table for WiFi/laptop/ASR failures
- **`../HELIX-2026/kit/SPONSOR-JUDGE-INTEL.md`** — current intel (no sponsors, TIET faculty expected)

## Pitch frame (draft — sharpen at hour 8)

**0:00–0:15 HOOK (Space Odyssey):**
> "On the ISS, when audio fails, astronauts sign to each other through the window. For 63 million Deaf Indians, every day is that window. We built the translator."

**0:15–0:30 STAKES:**
> "India has 18 million Deaf citizens. ISL interpreters number under 300. Every conversation with a hearing person is either lost, filtered through text, or waited on for an interpreter who may never come."

**0:30–0:45 REVEAL:**
> "VAANI is a real-time ISL synthesis engine — speak English, watch a 3D avatar sign it back, under 3 seconds end-to-end."

**0:45–2:15 DEMO:**
Judge speaks into lapel mic ("My name is Priya, I'm a student at TIET"). Transcript appears. ISL gloss appears. Avatar signs in real time. **The wow moment is here, around 0:45.**

**2:15–2:45 DEPTH:**
> "Three engineering layers. One: rule-based ISL grammar transforms for 10 topic-comment patterns — ISL isn't English word-order. Two: Three.js AnimationMixer with crossfade between signs, plus IK correction at hand transitions — the animations you're seeing aren't playbacks, they're blended in real time. Three: 50-sign lexicon validated with [ISL instructor Name]."

**2:45–3:00 CLOSE:**
> "Day-2 ship: open-source the ISL gloss library + grammar rules. Ask: any faculty with connections to ISLRTC — we want to validate with the Deaf community before wider release."

## Open-source references (lift from at hour 1)

- **Sign-Kit** (github.com/spectre900/Sign-Kit-An-Avatar-based-ISL-Toolkit) — MERN + Three.js ISL avatar, closest reference implementation
- **SignAvatars** (github.com/ZhengdiYu/SignAvatars) — ECCV 2024 rigged sign-language dataset
- **Mixamo** (mixamo.com) — free rigged humanoid models + animation library
- **ISLRTC online portal** — authoritative ISL sign video reference for lexicon capture

## Pending scope decisions (resolve in first turn after fresh terminal start)

1. **Avatar style** — stylized cartoon / minimalist silhouette / abstract geometric. (Recommended: stylized cartoon for safer demo.)
2. **Codename confirmation** — VAANI (placeholder, already applied to folder + package.json). Alternatives: MUDRA / ISLA / Kinesis. Rename folder + package.json if changing.
3. **10 sentence patterns** — pick the 10 English topic-comment structures for grammar engine (e.g., "My name is X," "I am a student," "Where is the library?"). Affects lexicon.
4. **ISL instructor outreach targets** — DM 3 before leaving for venue.

## First turn in fresh Claude Code session

```
1. Read this CLAUDE.md in full.
2. Read ../HELIX-2026/PROCESS-ORDER.md §1.4–§1.5 (scope lock + SPEC.md interview).
3. Switch model: Opus 4.7 /effort max (for SPEC.md decisional output).
4. Run the SPEC.md interview prompt (below).
5. Review SPEC.md. Edit wrong lines.
6. /clear. Switch to Sonnet 4.6 /effort xhigh. Start executing against SPEC.md.
7. Follow PROCESS-ORDER.md Phases 2 → 10.
```

## Working style (carry over from event context)

- **User is a strong engineer** — handles complex architectures, AI pipelines, infra. **Do NOT oversimplify** or avoid ambitious solutions.
- **No authenticity bias** — ISL chosen on technical/retellability merit after explicit PULZ/URF removal. Continue pitch without leaning on personal story.
- **Must win.** Maximum EV, not safe floor.
- **Never add Co-Authored-By lines** in git commits.
- **Opinionated and practical** over generic.
- **Flag trade-offs explicitly.**

## Scope-cut rules (if things go sideways)

**If animation blending isn't clean by hour 14:**
- Drop v2 stretch (LLM grammar, non-manual markers, IK correction)
- Ship 30 signs instead of 50
- Pre-record cleanest 3-sentence demo as backup video (60-90 sec unlisted YouTube)
- Lean into ISL-instructor validation call as primary Q&A defense weapon

**If ASR fails repeatedly in practice:**
- Type-input becomes primary demo flow, mic becomes bonus
- Pitch adjusts: *"On stage we're using type for reliability — live mic works on my laptop, happy to show after."*

**If critical risks can't be mitigated by hour 14:**
- Fallback pick: **Cold Chain Integrity Auditor (T3 P02)**. Research in `../HELIX-2026/prework.md`. Not zero cost to switch but recoverable if caught early.

## Every-4-hour self-audit

1. Can a fresh browser click through the entire demo path?
2. Is the pitch timed to under 3 min?
3. Is the submission form draft-ready on Devfolio?

If any answer is "no" at hour 16, pause all feature work until all three are "yes."

## The one rule above all rules

> **If unsure what to do next, ask: "Will a judge notice this in 60 seconds?"**
> Yes → do it now. No → do it later or never.
