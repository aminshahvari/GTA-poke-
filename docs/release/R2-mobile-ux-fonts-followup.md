# R2 mobile UX — follow-up to Muse condition (a)/(b) on `c4445ed`

Branch `r2-ux-fonts`, based on `c4445ed` (the audited candidate now on staging, which is **not** changed). Not deployed.

## What Muse saw
On `c4445ed`, `test/ui/t_mobile_ux.js` passed here but failed 15/72 in Muse's run with the real IBM Plex fonts: 14 badge-over-stack grazes of 1.0–2.0 px (375×667, 390×664, 390×844, 360×740, 412×839) and the 320×568 top bar cutting "Test Player 07".

## Cause (measured)
- **Not the fonts.** With the real IBM Plex files served (new `FONTS_DIR` option, below) the candidate still passes here; the font check confirms Plex loaded.
- **Zero clearance.** Measured on the candidate: every action badge's top edge sits **exactly 0.0 px** below its stack's bottom edge, at all 7 phone sizes, with fallback fonts, real fonts, and Chromium's headless shell alike. The test only failed above 0.5 px of overlap, so any 1–2 px difference in another setup's line-height rounding (Muse's Chromium build/environment) turns a touch into a graze. Same class for the top bar: at 320 px the logo + name + Sign out used the full 280 px, leaving the name box ~3 px wider than "Player 07"; a slightly wider rendering makes it break mid-word into a third line, which the two-line clamp cuts.

## Change (`public/style.css`, 3 values + one small-phone rule)
- Action badge 3 px lower: `.badge` bottom −14 → −17 px, compact −13 → −16 px, mini −11 → −14 px. Now 2.0 px of clear space everywhere (measured), so a 1–2 px difference elsewhere still does not touch.
- ≤340 px: top-bar logo 21 → 18 px and Sign out side padding 10 → 8 px. The name box grows 58 → 78 px ("Test Player" / "07" with ~11 px spare instead of ~3).

## Test changes (`test/ui/t_mobile_ux.js`)
- Badge check now requires ≥1 px clear space (was: fail only above 0.5 px overlap), so a 0 px fit can't pass here and fail elsewhere.
- `FONTS_DIR=<dir>` serves the real Google Fonts files (fonts.css + woff2) the page requests and checks Plex loaded. Cache used: `/mnt/project-files/poker-club/reports/r2-mobile-local/harness/fontcache`.

## Results (Chromium 141, local)
| Run | Result |
|---|---|
| Candidate CSS + new test, real fonts | **27 FAIL** (every badge 0.0 px from its stack) — reproduces Muse's finding class |
| New CSS, fallback fonts | 72/72 pass |
| New CSS, real fonts | 73/73 pass (incl. font-loaded check), 3 repeated runs all pass |
| `npm test`, `t_welcome`, `t_table_small`, `t_registration`, `t_bizsearch` | pass |

Evidence: `docs/evidence/r2/mobile-ux-fonts/` (390×844 table and 320×568 top bar, before/after, real fonts).

## Risks
- Badges sit 3 px lower, overlapping the plate's bottom border a little more; still clear of cards, chips and pot in the overlap checks.
- On 320 px the top bar shows "Test Player" / "07" (line break before the number) instead of "Test" / "Player 07".
- Chromium only; Safari still needs the owner's device pass.
- Any code change voids Muse's audit of `c4445ed`: this needs its own Muse review and owner GO before it can go to staging.
