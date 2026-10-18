# R2 hotfix: invite-link names in Director (NOT deployed)

Claude, 2026-10-18, from Sean's iPhone screenshots after the R2 deploy. Branch `r2-hotfix`, cut from live production `5c7ee11`. Exact SHA: the head of this branch. A merge is a deploy; it waits for the owner's GO and a quiet window.

## What was wrong
In Director > Members, member invite links ("Soltan's link") showed the name vertically, one letter per line, at phone widths. `.trow b` has `flex:1` (basis 0) plus `min-width:0; overflow-wrap:anywhere`, so the joined count and the buttons kept their width and the name got what was left, as little as 11–34 px. The "Group link" name had the same problem at 320–390 px with the test fonts.

## Fix (CSS only, 4 added lines in `public/style.css`, nothing removed)
For invite rows with a joined count (`.trow` whose Copy button has `data-group="1"`, so group links and member links), the name and the Copy and Cancel buttons sit on the first line, with the name at least 6em wide. The "N of M joined · until …" line goes below them. The "Unused invite" (personal link) rows and all other `.trow` rows are unchanged. Uses `:has()`, which needs Safari 15.4 or later; older browsers keep today's look.

## Seat badge and top-seat cards (Sean's demo-table screenshot)
**Not reproduced on R2.** At 390×844 and 430×932, over about 17 s of demo play per size, no action badge covered a stack and the top seat's cards stayed below the info bar (worst overlap 0 px in both checks). Sean's screenshot was taken on the earlier Shape A build `5838e14`, whose seat layout R2 replaced. No change made.

## Tests (on this branch)
| Test | Result |
|---|---|
| `test/ui/t_hotfix.js` (new: invite rows at 320/375/390/430, demo table at 390/430) | 32 ok / 0 failed (on `5c7ee11` without the fix: 21 ok / 11 failed) |
| `npm test` | exit 0 |
| t_premium_ui | 295 ok / 0 failed |
| t_mobile_ux | passed |
| t_clubs_closed | 25 ok / 0 failed |
| t_welcome | passed |

Evidence: `docs/evidence/r2-hotfix/before-*.png` and `after-*.png` (invite rows at four widths, demo table at two).

## Rollback
CSS only, no data. Render rollback to the `5c7ee11` deploy `dep-dba1ktbrjlhs73c6fdig`, then `git revert` on `main`.

## Addition: practice table on members' Home (founder request, 01:56 UTC)
Members only found the demo under Salon → Lessons; the owner has it in Director. `renderHome` now adds the same "Try a practice table" card to members' Lounge, except while they are seated in a running tournament. The owner's Home is unchanged. Client only (`public/app.js`, 3 lines).
Tests: t_hotfix 39 ok / 0 failed (adds: card shown at 320/390, practice table opens, no sideways scroll, owner Home without the extra card); t_premium_ui 295/0; t_clubs_closed 25/0; t_mobile_ux pass; t_welcome pass; npm test exit 0.

## Re-audit fix: "Unused invite" row (Muse overnight report, Area 6)
Muse ran `t_hotfix` on `fcabb5d` and got 38 ok / 1 failed. At 375 px an "Unused invite" row squeezed to 54 px and 3 lines, because the fix only covered rows with `data-group="1"`. Claude's run passed only because its threshold was 48 px and its fonts were slightly narrower: it measured 53 px and 2 lines.
- Fix: the two rules now select every invite row (`.trow:has(> [data-copy])`): group, member and single links. Other `.trow` rows are unchanged. The change is CSS only, the same 2 lines with a broader selector.
- Test tightened: an invite name must be at least 96 px wide and at most 2 lines. On `fcabb5d` the tightened test fails: 36 ok / 3 failed ("Unused invite" is 79 px at 320, 53 px at 375 and 68 px at 390). On this head it passes: 39 ok / 0 failed ("Unused invite" is 158/133/148/188 px, 1 line, at 320/375/390/430).
- Regression on this head: `npm test` exit 0; t_premium_ui 295/0; t_clubs_closed 25/0; t_mobile_ux passed; t_welcome passed. All UI tests ran with the real IBM Plex font cache (`FONTS_DIR`).
- Still untested on real Safari or WebKit (only Chromium is available here). `:has()` needs iOS 15.4 or later.
