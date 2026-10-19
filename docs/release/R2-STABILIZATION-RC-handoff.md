# R2 stabilization release candidate: Muse handoff (NOT deployed)

Claude, 2026-10-18. This answers Muse's `d9836df` (MUSE-AUDIT-r2-stabilization-fcabb5d) recommendation step 1: one new SHA on `r2-hotfix` containing (a) the viewport stabilization with a resize-stability test and (b) the invite-row rule extended to personal invite rows. Ordered by the founder's directives of 04:04 UTC (Tasks 1–2) and 05:22 UTC (item 7).

**Candidate code SHA: `8eee0a5`** on `r2-hotfix`. It is the merge of `mobile-stability` `a6ef217b8735c6240eb43c15ad82c73ae1e02210` into `06dd2e5`. The branch head above it only adds this document.

- Base: live production `5c7ee11`.
- `git diff 5c7ee11 8eee0a5 -- server package.json package-lock.json` is empty, so this is a client-only change.
- A merge to `main` is a production deploy. It needs the founder's GO naming the SHA, a verified quiet window and a fresh backup filed with time and size.

## Contents
| Commit | What | Handoff |
|---|---|---|
| `fafe8eb` | Director invite-link names no longer wrap one letter per line | `R2-HOTFIX-handoff.md` |
| `fcabb5d` | "Try a practice table" card on members' Lounge (not while seated in a running tournament) | same |
| `06dd2e5` | Invite-row rule covers all invite rows, including "Unused invite"; row test tightened (≥96 px, ≤2 lines) | same, "Re-audit fix" |
| `a6ef217` | Viewport stability: dvh with % fallback, table geometry fixed per hand, fixed-height action bar, keyboard handling, one-row header at ≤600 px height | `MOBILE-STABILITY-handoff.md` |

Out of this candidate, each on its own branch for a separate audit:
- the table redesign `table-redesign` `1cb2b89`, which changes the approved appearance;
- gameplay options `gameplay-options` `e391f8d`;
- invite-source privacy `invite-privacy`;
- the campaign link and `/v/celestia`.

## Test evidence on `8eee0a5`
These are Claude's runs, Chromium only, with the real IBM Plex font cache (`FONTS_DIR`).

| Test | Result |
|---|---|
| `npm test` | exit 0 |
| `t_stability` (new; 6 sizes incl. 844×390; player and spectator; toolbar in/out, keyboard, rotation) | 146 ok / 0 failed (on `fcabb5d`: 84 / 62) |
| `t_hotfix` | 43 ok / 0 failed |
| `t_premium_ui` | 296 ok / 0 failed (+1 check: Lobby button visible on your turn at 320×568) |
| `t_clubs_closed` | 25 / 0 |
| `t_mobile_ux` | passed |
| `t_table_small` | passed |
| `t_welcome` | passed |

Movement measured by `t_stability`, worst case before → after:
- felt, board and seats during a hand: 78.6 → 0 px;
- CLS: 0.203 → 0;
- toolbar in mid-hand: 90 → 0 px;
- keyboard: 262.7 → 0 px.

## What Muse should verify
1. The viewport probe (Muse's own): table geometry is invariant under chrome-size height changes at 390×844 → 754 and back.
2. `t_hotfix` passes in Muse's environment, including "Unused invite" at 375 px. This is where Muse's previous run failed (54 px, 3 lines).
3. The regression suites are green, and the server and package diff against `5c7ee11` is empty.
4. Known limits:
   - Only Chromium was tested. Safari's toolbar and keyboard were emulated by resizing.
   - On screens ≤600 px tall the header is one row, without average stack or rank.
   - Seats are slightly smaller in two cases: 375×667 with 8 players, and 320×568 with 5.
   - Muse's earlier `t_table_small` flakiness under load is not addressed here.
5. An iPhone Safari check by the founder (steps in `MOBILE-STABILITY-handoff.md`, about 10 minutes), ideally on a preview build of this SHA. Claude has not moved the preview service.

## Rollback
Render rollback to `dep-dba1ktbrjlhs73c6fdig` (`5c7ee11`), then `git revert` on `main`. There is no data change.
