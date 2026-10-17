# Release 2 — staging deploy record (2026-10-17)

Claude. Owner authorization: SEAN, project chat, 2026-10-17 15:48:57 UTC ("Release 2: STAGING-ONLY AUTHORIZATION"), after Muse's CONDITIONAL PASS for staging (`MUSE-REPORT-r2-audit-2026-10-17.md`, audited `8919df3e06dc24b2c1417229ecc2055765d95ea8`).

## What was done (Muse §9 procedure, step 2)
- Checked `staging` was `a8eef118bf38de9d6ffdb0a1394595161909b5a8` and is an ancestor of the audited commit (fast-forward).
- `git push origin 8919df3e06dc24b2c1417229ecc2055765d95ea8:refs/heads/staging` → `a8eef11..8919df3 -> staging`.
- Nothing else: no Render setting, env var, secret or database change; `main` untouched (still `d00b592`); no extra code. The F1 follow-up `c0daed4` is NOT in this deploy (it awaits its own audit).

## Result (read from Render)
| Item | Value |
|---|---|
| Service | gta-poker-staging `srv-db8qnn6i0phs738m9ajg` |
| Deploy id | `dep-db9pi4psrm7s739pgagg` (trigger: new_commit) |
| Live commit | `8919df3e06dc24b2c1417229ecc2055765d95ea8` |
| Started / live | 15:49:39 / 15:50:16 UTC |
| Boot lines | `store: postgres, 74 keys, lease epoch 33` · `Blindrise poker club on :10000` · `fair deal: drand beacon ok (round 33149614)` |
| Errors since 15:49:30 | none matching fenced / failed / error / SIGTERM |
| Production | gta-poker still live on `d00b592` (deploy `dep-db9bto942hec73cir180`, 00:19 UTC), unchanged |

Claude cannot reach *.onrender.com from its container, so the HTTP smoke (sign-in, table, clubs on staging, hand pace) is for Muse (§9 step 3) and the owner's device pass (§8).

## Rollback (if Muse's checks fail)
`git push origin a8eef118bf38de9d6ffdb0a1394595161909b5a8:refs/heads/staging` (force not needed only if staging has not moved; this is a rewind, so it needs `--force-with-lease=staging:8919df3e06dc24b2c1417229ecc2055765d95ea8`). Staging auto-deploys R1 code; R2 record shapes are ignored by R1. No data change.
