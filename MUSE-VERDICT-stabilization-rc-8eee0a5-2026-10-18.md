# Muse — Verdict: combined R2 stabilization candidate `8eee0a5`, 2026-10-18

**Candidate:** `r2-hotfix` code SHA `8eee0a5` ("R2 stabilization RC: merge mobile-stability a6ef217 (viewport fix) into r2-hotfix"); branch tip `e74619b` adds the handoff document only (Muse verified: docs-only diff). **Auditor:** Muse, independent, on the exact extracted tree. **Production modified:** no. **This verdict is an audit PASS, not a deployment authorization.**

## What the candidate is
The merge the stabilization audit required: `mobile-stability` `a6ef217` (viewport stability) combined with the `r2-hotfix` line through `06dd2e5` (Lounge practice card, invite-row fixes). Diff vs deployed `5c7ee11` is **client-only** — `public/app.js`, `public/index.html`, `public/style.css`. Server and package files are byte-identical to production.

## Muse's verification on the exact tree
- **Viewport probe (Muse's own):** table-area height change **0 px**, hero-seat centre movement **0.0 px** across the 844→754 px chrome cycle; geometry fully restored on return. The deployed build moved 1:1. **The jump is fixed in the combined candidate.**
- **`t_stability`: 146 ok, 0 failed.**
- **`t_hotfix`: 39 ok, 0 failed** — with one disclosed accommodation. The shipped test (byte-identical to the version Muse PASSed on `06dd2e5`) boots its server with a fixed 1,500 ms sleep; on the current machine the server's boot + staging seed takes longer, and the unmodified test died three times with `ECONNREFUSED` before its first assertion. Muse verified the server boots and serves correctly under the test's exact environment (manual login returned a token), then ran the test in a scratch copy with only the boot sleep extended to 7,000 ms: **all 39 assertions pass against the exact candidate code**. Classification: harness fragility, not a product defect — the same family as the `t_table_small` settle-timing finding. **Recommendation to Claude:** make `t_hotfix` poll for server readiness instead of sleeping a fixed interval.
- **Premium battery: 296 ok, 0 failed.**
- **`npm test`: full chain green**, including the random-action stress (3,000 tournaments, 0 problems) and content-rule suite (414 probes).

## Verdict
**PASS** — the combined stabilization candidate `8eee0a5` satisfies every criterion set in Muse's stabilization and strategy-integration audits. Remaining release gates, unchanged: (1) the founder's real-iPhone smoke pass on this build; (2) a fresh production backup inside the deploy window, with the artifact recorded (the G4 lesson); (3) a quiet window with no active game or tournament; (4) the founder's explicit GO naming `8eee0a5`. On merge, production Auto-Deploy will ship it — the rollback target remains deploy `dep-dba1b6m1egvs73d8ut00` (`5838e14`).

**Not covered by this verdict:** the `invite-privacy` branch (the `invitedBy` fix — separate candidate, audit queued) and `table-redesign` (roadmap M1.2 visual candidate, audit queued). Neither is part of this release.
