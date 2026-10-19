# Oval table (Muse correction brief R1–R8): release candidate handoff, 2026-10-19

Branch `table-stadium` (also on the preview service, branch `preview-premium-ui`). Code SHA **`8881f80`** (docs-only commits may sit above it).
Base: production `49cca50` (main `c2dd01e`, docs only above it; `8881f80` contains main). Nothing merged to main, nothing deployed to production, no Render setting changed.

## Scope
- Client only: `public/app.js`, `public/style.css`, `public/index.html`. `git diff 49cca50 8881f80 -- server package.json package-lock.json` is empty.
- No rule, points, prize, fairness, auth or data change. Colours, fonts and branding unchanged (geometry and layout only).
- Includes the free-social-play line and start-of-game notice (`91bb563`, merged in `6aa7d91`), which has not had its own production audit.

## Since `86b4211` (the last commit the owner reviewed on device)
- `cdb1f25`: when you are the dealer, your D button sits left of your cards by your avatar (it read as the next seat's on the right; t_positions caught it). A spectator's foot seat marks its shown cards as shown (t_extras_ui).
- `8881f80`: while the hand helper shows your hand's name, the bar doesn't repeat it ("You're all-in", or who the table waits for).

## R1–R8 measurements (t_table_layout, `8881f80`, Chromium, iPhone safe areas as in the test)
Felt = green plus rail; "foot" = the felt's bottom edge, "dock" = the dock's top edge (px from the top of the screen).

| Screen | Players | Felt (w×h) | h/w (R2) | Foot | Dock | Result |
|---|---|---|---|---|---|---|
| 320x568 | 2 | 173x234 | 1.35 | 349 | 399 | 25 pass |
| 320x568 | 6 | 184x249 | 1.35 | 356 | 399 | 29 pass |
| 320x568 | 9 | 184x249 | 1.35 | 356 | 399 | 27 pass, 2 fail (C3) |
| 375x667 | 2 | 242x327 | 1.35 | 444 | 494 | 25 pass |
| 375x667 | 6 | 242x327 | 1.35 | 444 | 494 | 29 pass |
| 375x667 | 9 | 253x342 | 1.35 | 451 | 494 | 29 pass |
| 390x844 | 2 | 274x411 | 1.50 | 619 | 669 | 25 pass |
| 390x844 | 6 | 274x411 | 1.50 | 619 | 669 | 29 pass |
| 390x844 | 9 | 274x411 | 1.50 | 619 | 669 | 29 pass |
| 393x852 | 2 | 277x416 | 1.50 | 627 | 677 | 25 pass |
| 393x852 | 6 | 277x416 | 1.50 | 627 | 677 | 29 pass |
| 393x852 | 9 | 277x416 | 1.50 | 627 | 677 | 29 pass |
| 430x932 | 2 | 314x471 | 1.50 | 707 | 757 | 25 pass |
| 430x932 | 6 | 314x471 | 1.50 | 707 | 757 | 29 pass |
| 430x932 | 9 | 314x471 | 1.50 | 707 | 757 | 29 pass |

Every row also checks: R3 rail 16 px; R4a each avatar centre on the rail band within 6 px; R4b no plate or badge on the green; R4c card backs at most 25% on the green; R4d no seat overlaps another seat or the board; R6 your plate centred under the felt, your cards over the bottom rail; R7 Fold / Call / Raise in one row under the table, the helper one line in the dock.
R5 (t_social_play): the felt holds only the board, pot, bets, button and the result; the free-play notice is in the dock, never on the felt, at every size.

Screenshot matrix (5 phones × 2 / 6 / 9 players, your turn): `docs/evidence/table-oval/8881f80/matrix-r8.png`.
Other states: `393x852-hand-over.png`, `393x659-showdown.png`, `393x659-watching.png`, `390x844-raise-panel.png`, `852x393-landscape-helper.png` in the same folder.

## Tests on a clean `8881f80` checkout
All on a clean `git worktree` of `8881f80` (Chromium):
- `npm test`: exit 0 (incl. rules, fair deal, t_extras 28/0, content and CSP tests).
- t_table_layout 3962 ok, 34 failed: 2 at 320x568 9 players (C3), 32 at 320x500 (outside R8). Every other size, every player count: pass.
- t_mobile_ux 71 ok, 2 failed: both 320x568 9 players (C3, the same seats touching).
- t_table_small: 2 crowded layouts, both 320x568 9 players (C3).
- t_social_play 630/0, t_stability 220/0, t_positions 356/0, t_premium_ui 296/0, t_hotfix 42/0, t_clubs_closed 25/0, t_welcome pass, t_extras_ui 13/0.

## Known limit (C3): 320×568, 9 players
On the smallest phone at a full table, the two lowest left seats touch: Ben's action badge over Alexandra's card backs, and Ben's card backs over Christina's plate (R4d). Nothing is hidden that matters (names, stacks, the board, the pot and your seat stay clear).
Measured: the layout needs about 30 px more height there. That height is the room the dock keeps for the raise panel; giving it to the table makes the raise panel cover your own seat on that phone, which is worse. A clean fix needs a redesign of the full-table seats or of the raise panel on the smallest phones. 2 to 8 players at 320×568 and every count on 375 and up are clean.
Also outside the R8 list: at 320×500 the table is wider than R2 (h/w 1.29) and seats touch from 4 players up.

## Rollback
Redeploy `49cca50`. No data, setting or server change to undo.
