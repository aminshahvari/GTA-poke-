# Release 2 — staging update plan: 8919df3 → c0daed4 (NOT deployed)

Claude, 2026-10-17. Prepared on the owner's request (15:57 UTC). **Waiting for the owner's explicit authorization; nothing has been pushed to `staging`.**

## Current state (read 2026-10-17)
- `staging` = `8919df3e06dc24b2c1417229ecc2055765d95ea8` (live, deploy `dep-db9pi4psrm7s739pgagg`). c0daed4 is **not** deployed.
- `main` = `d00b59278427fe2ae315a700f2966b8941c1d5d3` (production, untouched).
- Target: `c0daed48c9b78f38811fc479bb324ddfda2adb20`, Muse F1 re-audit **PASS** (`MUSE-REPORT-f1-reaudit-2026-10-17.md`, §9).

## Delta 8919df3 → c0daed4 (code only)
`server/content.js` (+48/-4) and `test/t_content.js` (+19). No other code; no package change; no schema/data change. c0daed4 is a direct descendant of 8919df3 (fast-forward).

## Deploy step (only after the owner says go)
`git push origin c0daed48c9b78f38811fc479bb324ddfda2adb20:refs/heads/staging` (fast-forward). Render `gta-poker-staging` auto-deploys. No env, secret, database or Render setting change; `main` untouched.

## Evidence Claude will record after the deploy
Render deploy id, live commit = c0daed48…, boot lines (`store: postgres, ~74 keys, lease epoch N+1`, `Blindrise poker club on :10000`, `fair deal: drand beacon ok`), no fenced/failed/error/SIGTERM lines, production still on d00b592.

## Muse (independent)
Boot verification + staging smoke: test-player sign-in, table renders, one full hand (pace with B5 flush), Business/Opportunity on staging, and on staging a listing with `۴۱۶ ۵۵۵ ۰۱۰۰` / `416,829,5953` / `416 555 O1OO` refused while a Persian price text saves unchanged.

## Rollback
- To the previous staging build: `git push --force-with-lease=staging:c0daed48c9b78f38811fc479bb324ddfda2adb20 origin 8919df3e06dc24b2c1417229ecc2055765d95ea8:refs/heads/staging`.
- Full back to Release 1: same with `a8eef118bf38de9d6ffdb0a1394595161909b5a8`.
- Code-only; the content rule stores nothing new, so no data change either way.

## Not in this update
- Muse's new LOW finding (`416•829•5953`, bullet separator) is **not** fixed here: c0daed4 ships exactly as audited. Recorded for a separate, audited follow-up.
- `b977f2f` (phase1 test flags) and docs commits after c0daed4 are not code the server runs; not deployed.

## Gates still open after this
1. Owner's real-device pass on staging (iPhone Safari tab + home screen, Android Chrome): scanner + camera permission, 9-player table, touch controls, layout. Not verified.
2. `scripts/content-audit.js` on production data before either club opens.
3. Production: NO-GO; Release 1's parked conditions first.
