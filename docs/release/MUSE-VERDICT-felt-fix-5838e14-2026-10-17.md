# Blindrise Shape A — Green Felt Fix Audit

**Auditor:** Muse / Marlowe — 2026-10-17 (independent)
**Candidate:** `5838e14c06eb47bb83e1fd7fd2784c536d0cbd30` on `shape-a-felt`, one commit on the live production build `bf24ceb`.
**Regression audited:** Shape A's premium block painted production's single-layer `.felt` with the navy rail gradient, covering the green playing surface.

## Verdict: PASS — ready for the founder's deployment GO (after tonight's tournament)

**1. Diff — strictly CSS-only, VERIFIED.** One commit; code change is exactly **+2 lines in `public/style.css`** (one comment, one rule) plus Claude's comparison screenshot. No JS, HTML, server, package or test changes. Gameplay, backend, database, authentication and invitation code are untouched by construction.
**2. Root cause — CONFIRMED as Claude described.** In the approved design the base stylesheet carries two layers: `.felt` is the navy rail and `.felt::before` (content-bearing, inset 14 px) is the green surface. Production's stylesheet has no content-bearing `::before`, and Shape A's premium block supplied only its box-shadow — so nothing drew the green and the navy covered the whole table.
**3. The fix draws the approved surface, with the approved values.** The added rule gives `#game .felt::before` its content, position, 14 px inset (the design's `--rw`), 999 px radius, and `radial-gradient(ellipse 70% 60% at 50% 42%, #1b7a52, #0d4a33 78%)` — the gradient geometry identical to the approved base rule, and the two hex values **exactly equal to the approved design's `--felt-hi` / `--felt`** (production's own variables are blue — `#245c9f` / `#163a6c` — and the fix correctly does not use them).
**4. Visual match — VERIFIED by Muse's own renders** (premium battery screenshot mode, fix build vs current production build as ROOT baseline): at 390×844 the felt samples **#0d4a32** on the fix (the approved felt tone) against **#0d1322** navy on the current build; at 320×568 the fix's felt is green-dominant where the current build is blue-dominant. Muse's inspection of the fix's live-table render: green cloth inside the navy rail with the fine gold ring, watermark legible, seats, cards, pot and coach panel all painting correctly above the restored layer — the approved preview's table, restored. The felt component exists only on the game screen, so the live table renders govern every presentation of it.
**5. Regressions — NONE.** Muse's runs on the candidate: full `npm test` **exit 0**; `t_welcome` **pass** (auth + invitation flows); premium battery **207 ok / 1 failed — the same single known failure** (320×568 Chat/Lobby tap-target heights, pre-existing production geometry, already classified cosmetic and non-blocking in the Shape A verdict). Table renders were produced at 320/375/390/430 widths with no new findings.
**6. Rollback — EXACT.** Return `main` to `bf24ceb` (equivalently Render rollback to the current live Shape A deployment). CSS-only change; no data involvement.

*Deployment is NOT authorized by this verdict: per the founder's instruction, production stays untouched during tonight's tournament, and the merge takes a separate founder GO after the event.*
