# R2 production release candidate: handoff (NOT authorized to deploy)

Claude, 2026-10-17, on the owner's "Prepare R2 production release autonomously" directive (23:20). For Muse's independent audit of this exact candidate and the owner's separate GO. Nothing here was deployed; `main`, staging, Render settings and the production database are untouched.

## Candidate
- Branch `r2-release`. Exact SHA: the head of this branch (the commit that adds this file); Muse audits that SHA.
- Parents:
  - `origin/r2-premium-ui` `87dc8fb` (R2 RC `c4445ed` + premium UI `7dabbc3` + Muse preview verdict).
  - `origin/r2-rc` `0c13010` (docs only: staging record, readiness report, Muse beta criteria).
  - `origin/main` `bf24ceb` (live Shape A).
- **`main` fast-forwards to the candidate** (`git merge-base --is-ancestor origin/main r2-release` → true).
- **`server/`, `package.json`, `package-lock.json` are byte-identical to the audited R2 RC `c4445ed`** (`git diff --quiet c4445ed r2-release -- server package.json package-lock.json`).

## Changes on top of the audited parents
| Commit | What |
|---|---|
| Merge of `main` | Conflicts in `public/app.js`, `public/index.html`, `public/style.css`, `test/ui/t_premium_ui.js` resolved to the R2 premium versions. Shape A's production-only adaptations are dropped because R2 has the real features: inert doors without a clubs switch, no Exchange tab, single-layer felt. Shape A docs and evidence are carried over. |
| `a1fd5d3` | Muse MINOR-1 (`.op-filters .bz-chips` inside its column at 320 px). Muse MINOR-2 (dialog button rows wrap). Shape A's in-flow "Opening soon" label: in R2's closed state the absolute pill covered the door title, which the new test caught. New `test/ui/t_clubs_closed.js`. |
| this commit | This handoff and the rollback rehearsal evidence. |

Already in R2, so no port is needed: green felt (`.felt::before`, the cause of the navy table in Shape A) and the egg/tomato splats (`splatOn`, `.splatfx`). The `shape-a-felt` and `shape-a-table` branches become unnecessary once R2 ships.

What a deploy changes compared with live `bf24ceb` is the same as the R2 readiness report (`R2-PRODUCTION-BETA-READINESS.md`):
- `store.js`: lease fencing.
- `fair.js` / `club.js`: B5 voiding of interrupted hands.
- `index.js`: B6, recovery limits, chat isolation, clubs switch.
- `content.js`, `business.js`, `opportunity.js`.
- `ws` 8.18.0 → 8.22.0.
- No migration; new keys only.

## Tests (all on this candidate, local Chromium)
| Test | Result |
|---|---|
| `npm test` (16 suites incl. sim stress 3000 tournaments) | exit 0, all passed |
| t_premium_ui (4 phones) | 295 ok / 0 failed |
| t_clubs_closed (new, production defaults: no STAGING) | 25 ok / 0 failed |
| t_mobile_ux | 72 ok / 0 |
| t_welcome | 32 ok / 0 |
| t_table_small | 20 ok / 0 |
| t_registration, t_bizsearch | passed (exit 0) |
| scan_csp, SIMD and `--no-simd` | both passed, 0 page errors, 0 CSP violations |

`t_clubs_closed` checks, with production defaults (no `STAGING`, no `CLUBS_DEFAULT`):
- Members do not see the Exchange tab. The Exchange, Bulletin and Scanner doors read "Opening soon", are not buttons, do nothing when tapped, and no label covers a title at 320 and 390. There is no sideways scroll.
- `bizList` and `oppList` return 403 for a member and 200 for the owner.
- The owner opens the clubs in Director: members see them without reloading. Closing them again hides them and the APIs return 403 again.

## Rollback rehearsal: live `bf24ceb` → candidate → `bf24ceb` → candidate (one data file)
Evidence is in `docs/evidence/r2-release/rollback-rehearsal/` (script and output). The rehearsal passed:
- Sessions are kept in both directions for every member, and PIN login works in both directions.
- Single invites work in both directions.
- **The owner's 100-use group link** made on `bf24ceb` joins a member on the candidate, joins another after the rollback, and the owner gets the same link back. It ends at 2 of 100 uses.
- `bf24ceb` ignores R2 keys, and R2 business data survives the round trip.

**Rollback target**: Render rollback to `dep-db9vl2142hec73d4pds0` (`bf24ceb`), which Render confirms is live as of this writing. Then `git revert` on `main`, or reset the branch only with the owner's word.

## Deploy-moment risks (must-dos, not defects)
1. **First fenced deploy overlaps the old unfenced code for up to ~90 s.** Deploy only when no game is running or registering. The owner confirms this.
2. **Fresh verified backup** right before the deploy: Render → Recovery → Create export, as done at 18:40 EDT.
3. `ws` 8.18 → 8.22 (patch-level, covered by every socket test above).
4. **OWNER_CODE rotation** (Release 1 condition 3) is still open, and the owner decides whether it applies to this window.
5. **Invite auto-registration is unchanged**: every invite joins an open tournament, as production does today. The A/B/C decision is still with the owner. Invite semantics were not changed.
6. Clubs stay **closed** after deploy for everyone except the owner.

## Sequence after deploy (each step on the owner's word)
1. Owner GO naming this SHA and a quiet window. Take the backup, then fast-forward `main`. Watch Render: boot, `store: postgres`, lease epoch, no errors.
2. Phone check: sign-in, table, invite link. If there is a blocker, roll back to the target above.
3. Read-only content audit in the Render Shell: `node scripts/content-audit.js --db` (`R2-content-audit-procedure.md`). Expected result: `0 field(s) to review`.
4. Owner opens the clubs with the Director switch, which can be closed again instantly.

## Excluded on purpose
- Feedback Hub, the public campaign link (`public-onboarding`) and any new feature.
- Founder polish proposals (21:37), which wait for authorization.
- Investment features, which stay closed pending legal review.
