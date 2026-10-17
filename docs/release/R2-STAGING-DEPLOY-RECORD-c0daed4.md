# Release 2 — staging deploy record: c0daed4 (2026-10-17)

Claude. Owner authorization: SEAN, thread, 2026-10-17 15:59:52 UTC ("I authorize deployment of the Muse-audited F1 commit c0daed4 to STAGING ONLY ..."). Audit: `MUSE-REPORT-f1-reaudit-2026-10-17.md` (PASS, c0daed4).

## Pre-deploy checks (on a clean detached checkout of the exact SHA)
| Check | Result |
|---|---|
| SHA | `c0daed48c9b78f38811fc479bb324ddfda2adb20` |
| Working tree | clean (`git status --porcelain` = 0 lines) |
| Fast-forward | staging was `8919df3e06dc24b2c1417229ecc2055765d95ea8`, an ancestor of c0daed4 |
| Code delta vs 8919df3 | `server/content.js`, `test/t_content.js` only (2 files, +63/-4) — the audited delta |
| `npm test` | exit 0 (`docs/evidence/r2/c0daed4-predeploy-npm-test.log`; content 261 probes) |
| Phase 1 | 12/12 pass (`docs/evidence/r2/c0daed4-predeploy-phase1.log`) |
| Rollback target | `8919df3e06dc24b2c1417229ecc2055765d95ea8` (then `a8eef11` for R1) |

## Deploy
`git push origin c0daed48c9b78f38811fc479bb324ddfda2adb20:refs/heads/staging` → `8919df3..c0daed4 -> staging`. No env, secret, database or Render setting change. `main` = `d00b592` (untouched).

| Item | Value |
|---|---|
| Deploy id | `dep-db9poou1egvs73d1f8hg` (trigger new_commit) |
| Live commit | `c0daed48c9b78f38811fc479bb324ddfda2adb20` |
| Started / live | 16:03:47 / 16:04:26 UTC |
| New instance (pgwq4) | `store: postgres, 74 keys, lease epoch 34` · `Blindrise poker club on :10000` · `fair deal: drand beacon ok (round 33149897)` |
| Old instance (dmgsp, 8919df3) | `shutting down: lease lost: epoch 34 held by ...pgwq4:82, ours was 33` · `final save skipped or incomplete {... "leaseLost":true,"dirty":0,"lastWriteError":null}` · `lease lost: staying up and answering 503 until SIGTERM` — the designed fenced handover (B1), nothing unsaved (dirty 0) |
| Production | gta-poker live on `d00b592`, unchanged |

## For Muse (independent)
Boot verification (above lines; also whether the old instance's SIGTERM/exit line appears), then staging smoke: test-player sign-in, table renders, one full hand (pace with B5 flush), clubs on staging, and the F1 checks on staging (`۴۱۶ ۵۵۵ ۰۱۰۰`, `416,829,5953`, `416 555 O1OO` refused; a Persian price text saved unchanged). Claude cannot reach *.onrender.com.

## Rollback
`git push --force-with-lease=staging:c0daed48c9b78f38811fc479bb324ddfda2adb20 origin 8919df3e06dc24b2c1417229ecc2055765d95ea8:refs/heads/staging` (or `a8eef118bf38de9d6ffdb0a1394595161909b5a8` for Release 1). Code-only.

## Still open
Real-device pass (iPhone Safari tab + home screen, Android Chrome) — NOT verified. Content audit on production data before any club opens. Muse's LOW `416•829•5953` (bullet separator) not fixed in this build. Production NO-GO.
