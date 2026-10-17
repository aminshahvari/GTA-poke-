# R2 staging deploy record — c4445ed (owner GO 20:33 UTC, staging only)

- Before: `staging` = `c0daed48c9b7…` (`dep-db9poou1egvs73d1f8hg`). Candidate verified: exists, fast-forward of staging, contains production `49d9ece`; server/package delta since c0daed4 = `server/content.js` only (F1). No env, secret, DB or Render setting changed.
- Push: `c0daed4..c4445ed -> staging` (fast-forward) 20:34:39 UTC.
- Render: `dep-db9tnnqvcj2c739mu5a0`, live 20:35:19 UTC, commit `c4445ed1046e6cc44306bf9728d8c6eeae037d93`, https://gta-poker-staging.onrender.com
- Boot: `store: postgres, 2611 keys, lease epoch 37`; `resumed running tournament` (a staging test tournament was running; resumed from the database); `Blindrise poker club on :10000`; `fair deal: drand beacon ok`.
- Handover: old instance `…-95vvx` → `lease lost: epoch 37 held by …, ours was 36`, `final save skipped … dirty: 0`, answering 503 until SIGTERM. No error lines after live.
- Production untouched: `gta-poker` still `49d9ece` (`dep-db9sr9e1egvs73d4qgh0`).
- Smoke: Claude cannot reach the staging host (network policy); automated smoke = the candidate's local suites (npm test, t_welcome, t_mobile_ux, t_table_small, t_registration, t_bizsearch, scan_csp ×2), all pass on c4445ed. Live checks on staging = owner/Muse device pass (R2-RC-HANDOFF.md).
- Rollback: `git push --force-with-lease=staging:c4445ed1046e6cc44306bf9728d8c6eeae037d93 origin c0daed48c9b78f38811fc479bb324ddfda2adb20:refs/heads/staging` or Render → Rollback to `dep-db9poou1egvs73d1f8hg`. Code-only, no data change.
