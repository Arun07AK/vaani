# Contributors

This file is the canonical record of who contributed to VAANI and in what capacity. Referenced by [LICENSE.md](./LICENSE.md) §1 (Declaration of authorship).

---

## Engineering — 100% Arun AK

**Arun AK** — Solo engineering builder.
- GitHub: [@Arun07AK](https://github.com/Arun07AK)
- LinkedIn: [arun-ak-thapar](https://www.linkedin.com/in/arun-ak-thapar/)
- Thapar Institute of Engineering and Technology, CSE 2nd year

### What Arun built

Every technical subsystem of VAANI is his sole work:

- **Web application** (Next.js 16 + React 19, `app/`)
- **Chrome MV3 extension** (`vaani-ext/` — popup, background service worker, offscreen audio capture, floating PiP window)
- **Backend API routes** — `/api/transcribe` (OpenAI Whisper integration) and `/api/glossify-llm` (GPT-4.1 with strict JSON-schema ISL grammar engine)
- **ISL grammar engine** — topic-comment reordering, SOV transform, WH-final, NEG-final, time-fronting rules (`lib/glossify.ts` + 12 Vitest tests)
- **116-entry phonological decomposition dictionary** (`lib/signDecomposition.ts`) — each gloss authored as handshape + palm orientation + body location + movement modulator
- **VRM avatar rigging** — 44 bones + 15 ARKit facial morph targets driven independently at 60 fps (`app/_components/VRMAvatar.tsx`)
- **Motion-capture toolkit** — built from scratch using MediaPipe Holistic + Kalidokit; produced 14 authored sign clips from ISLRTC reference material (`/tools/capture`)
- **3-tier resolution cascade** — mocap → phonological composition → ISL fingerspelling fallback (`lib/useTranscriptPipeline.ts`)
- **Design system** — 5-color palette, typography stack (Inter + JetBrains Mono + Noto Sans Devanagari), CSS tokens, all UI components
- **Deployment & infrastructure** — Vercel production, Chrome Web Store submission, CI/build configuration

Git history serves as the authoritative timeline. Every commit is authored by Arun AK.

---

## Support team — Hack Helix 2026 submission

These teammates contributed to the non-engineering side of the hackathon submission. None of them wrote code, designed UI, authored assets, or built any subsystem of the VAANI product. Their contributions were advisory and logistical.

| Name | Contribution during Hack Helix 2026 |
|---|---|
| **Aniket** | Pitch preparation and stage delivery across three judging rounds |
| **Avnish** | Problem-space research |
| **Rajeev** | Guidance and research |
| **Amarjeet** | Guidance |
| **Ishaan** | Problem-statement selection at hackathon start |

The author is grateful to each of them. Their support made the submission possible. Their credit is intentional and sincere — **but distinct from engineering authorship.**

---

## Attribution requirements

Per [LICENSE.md](./LICENSE.md) §4:

- The engineering build of VAANI must be attributed to **Arun AK** in any external reference, presentation, article, post, or media derived from this work.
- Support team members may be credited by name with their **specific role as listed in the table above** — Aniket for pitch, Avnish for research, etc.
- Support team members may **not** be credited as "co-builder," "co-engineer," "co-creator," or any variant that implies engineering involvement.
- Any blanket "built by [team]" attribution is incorrect and violates the license.

### Examples

✅ *"VAANI was built solo by Arun AK, with Aniket on pitch delivery and Avnish/Rajeev on research."*

✅ *"VAANI is Arun AK's solo build from Hack Helix 2026."*

✅ *"The VAANI pitch was delivered by Aniket Sharma, presenting work engineered by Arun AK."*

❌ *"We built VAANI."* (if "we" implies shared engineering)

❌ *"VAANI by Team VAANI."* (no such team — the engineering is solo)

❌ *"VAANI — a team project at Hack Helix 2026."* (misrepresents the build structure)

---

## Updates

If a support team member's role changes or expands in the future, updates to this file require:

1. A pull request describing the change with specifics (what, when, how verified)
2. Review + approval from Arun AK (sole Code Owner per [CODEOWNERS](./.github/CODEOWNERS))
3. A synchronised update to [LICENSE.md](./LICENSE.md) §1 team-roles table

No teammate can edit this file to upgrade their own attribution.

---

*Last updated: 2026-04-20*
