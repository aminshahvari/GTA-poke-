# Muse — Verdict: table-redesign branch `1cb2b89`, 2026-10-18

**Candidate:** `table-redesign` @ `1cb2b89`, one commit on `mobile-stability` `a6ef217` (roadmap milestone M1.2): a broader, shorter phone felt with side seats on the rail's inner edge, a real phone-landscape layout (table full width, helper + action bar in a right column), a one-line board caption. **Auditor:** Muse, independent, on the exact extracted tree. **Production modified:** no. **Not a deployment approval.**

## Scope check
Client-only: `public/app.js` (seat geometry), `public/style.css`, `public/index.html`, plus the new `test/ui/t_table_layout.js` and a handoff doc. **Server and package diff vs deployed `5c7ee11`: 0 lines.** The approved navy-and-gold design system is untouched in structure (premium battery below).

## Muse's verification on the exact tree
- **`t_table_layout` (new): 288 ok, 0 failed** — 2–9 players across phone sizes including landscape, no overlaps, action bar on screen.
- **Viewport invariance preserved:** Muse's probe shows table-area Δ **0 px** and hero-seat movement **0.0 px** across the chrome cycle — the redesign keeps the `a6ef217` stability property (the hero seat sits higher by design on the shorter felt).
- **`t_stability`: 146/146. Premium battery: 296/0. `t_mobile_ux`: pass. `t_table_small`: pass in this run** (with its known load-flakiness caveat). **`npm test`: full chain green** (stress 3,000 tournaments, 0 problems).
- **Visual check (Muse's settled-state screenshots, 9-handed):** portrait 390×844 — all nine seats on the felt, names/stacks/action badges readable, board and pot clear, hero cards and controls fully on screen. Landscape 844×390 — the new layout works: table left, helper/timer/actions in a right column, nothing clipped off the table (the old build put seats off the felt in landscape).

## Findings
- **MINOR (landscape):** the helper line truncates mid-sentence in the right column ("…you have 11%: f…") with the equity figure repeated at the edge. Readable, but it is a visible truncation in the new layout — fix or explicitly accept.
- Cosmetic, pre-existing patterns unchanged: the top-strip "Your rank" label truncates at 390 px; long seat names ellipsize at 9-handed.

## Verdict
**PASS on branch.** The redesign achieves M1.2's acceptance shape without weakening stability or the design system. Lineage conditions before any release: the branch is based on `a6ef217` and contains **neither** the invite-row hotfix (`06dd2e5`) **nor** the invite-privacy fix — it must be rebased onto the stabilization RC line (`8eee0a5`) into a new SHA for a Muse delta re-audit, and the founder's real-device pass (portrait + landscape) remains a gate.
