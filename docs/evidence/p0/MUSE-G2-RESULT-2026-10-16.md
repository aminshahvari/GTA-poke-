# G2 — Result: independent read-only staging database verification

Executed by Muse (Marlowe) under the owner's Route 1 authorization of 2026-10-16 20:02 EDT (temporary paid instance + internal Shell; see `MUSE-ASSESSMENT-g2-db-verification-2026-10-16.md`).
Procedure and judgement criteria: `g2-staging-db-verification.md` @ `b4dac87`, sections 3–4 (Claude). This file is the "Result" record for that procedure.
Target: `gta-poker-staging-db` via the staging web service's internal `DATABASE_URL`. The external IP allowlist was never touched (still empty). Production untouched.

## Verdict: G2 CLOSED — all four checks PASS

| # | Check (per b4dac87 §4) | Result |
|---|---|---|
| 1 | Persisted `lease.epoch` equals the latest legitimate startup's claimed epoch | **PASS** — persisted 20; the Shell-attached instance's boot line claims epoch 20 |
| 2 | `lease.instance` matches that startup | **PASS** — `srv-db8qnn6i0phs738m9ajg-675476774d-8cdz9:84`, identical to the boot line |
| 3 | `state_keys` equals that startup's key count | **PASS** — 74 = 74 (total rows 75 = 74 + the lease row) |
| 4 | `lease.at` consistent with the instance's activity | **PASS** — `at` = 2026-10-17T00:56:29.6Z, ~2.6 s before the query (3 s heartbeat cadence; instance awake) |

No unexplained epoch exists: the full chain is logged boots, each +1 — 16 (wake, 23:31 UTC) → 17 (first upgrade) → 18 (first downgrade) → 19 (wake) → 20 (this run's upgrade). Any epoch without a matching boot line would have been a FAIL; there is none.

## Execution record (2026-10-17 UTC)

- Baseline boot line (Phase 0, before this run's upgrade, 00:35:39 UTC):
  `store: postgres, 74 keys, lease epoch 19 (srv-db8qnn6i0phs738m9ajg-hibernate-7bbfd77947-7th57:82)`
- Upgrade boot line (Free → Starter restart, 00:37:41 UTC) — the comparison target:
  `store: postgres, 74 keys, lease epoch 20 (srv-db8qnn6i0phs738m9ajg-675476774d-8cdz9:84)`
- The query ran inside Render Shell on that instance, over the internal connection, in a `READ ONLY` transaction that was rolled back. The executed script is byte-identical to the parent-verified canonical script: SHA-256 `93222929d6804679b5b313243b630830ac9ef5e68ba8becd9713d033a827e6ec` (572 bytes), confirmed by `sha256sum` in the Shell before execution. (Typing the script into the web terminal dropped one character twice; the file was repaired deterministically and only run after its hash matched the canonical value — the gate, not the typing, is what the result rests on.)
- Raw output (`node q.js`, 00:56:32 UTC):
  - now: `2026-10-17T00:56:32.272Z`
  - lease: `{"at":1792198589631,"epoch":20,"instance":"srv-db8qnn6i0phs738m9ajg-675476774d-8cdz9:84"}`
  - state_keys: `74`; total_rows: `75`
  - prefixes: biz 5, bizDemoSeeded 1, bizSpotlight 1, invite 14, name 13, opp 5, oppDemoSeeded 1, owner 1, push 1, session 17, tourney 1, user 13, vapid 1 (sums to 74)
- Revert: Starter → Free confirmed at 00:57 UTC (deploy `dep-db9cfo0m7kps73cs8eg0` succeeded; service page reads Free; Shell is a paid feature again). Paid window ≈ 20 minutes, prorated cost in cents. The first attempt earlier in the evening (same authorization) was stopped by the integrity gate before any query ran and was likewise reverted.

## Effect on the P0 re-audit

G2 is removed from the outstanding-gaps table of `MUSE-AUDIT-p0-reaudit-c1c2c3-2026-10-16.md`. The re-audit verdict remains **CONDITIONAL PASS**: G1 (fenced-process termination on Render never directly observed — not a production blocker) and G3 (deploy-window availability unmeasured — blocks mid-game deploys only; the between-games rule stands) remain as recorded. Database safety for the C1 deploy is now verified directly, not inferred from logs.
