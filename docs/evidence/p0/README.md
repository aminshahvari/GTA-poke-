# P0 remediation: deploy race (lease ping-pong)

Branch `p0-deploy-race`, from `staging` at `a3c67e9`. Fix commit: `78fbfb0` (code and tests; unchanged since). Merged into `staging` as `9026503` and **deployed to staging only** (section 3). Not merged into `main`; production untouched (`main` stays at `4d1be3b`).

> **Correction log (C3).** The first version of this README (commit `78fbfb0`) was written before any staging deploy and said "not deployed to staging" and, in section 3, "Two staging deployments ... NOT VERIFIED". Both statements were true when written and are now out of date: the staging deploys are recorded in section 3 (added in `7ec0539`, wording fixed in `9b36126`) and the controlled C1 deploy in section 5; the C2 health-check proposal is `c2-healthcheck-proposal.md`. The original text is preserved in git history (`git show 78fbfb0:docs/evidence/p0/README.md`). No evidence file from `78fbfb0` (`logs/phase1-run*.log`, `logs/race-repro-after-fix.log`, `logs/npm-test.log`, `server-index.diff`, `race-repro.js`) was changed; new evidence is only added as new files.
Spec: evidence package `audit-evidence-2026-10-16`, `docs/evidence/2026-10-16/02-deploy-race.md`, sections 7.1 and 7.2.

Labels: **IMPLEMENTED**, **TESTED** (local), **NOT IMPLEMENTED**, **NOT VERIFIED**.

## 1. What changed

| 7.1 step | Status | Where |
|---|---|---|
| 1. Never exit on lease loss: stop game loops, freeze store, close sockets 4001, keep HTTP up answering 503 (`/healthz` 503), refuse websockets (accept and close 4001), exit only on SIGTERM (code 0) | IMPLEMENTED, TESTED | `server/index.js` `shutdown()` / `onSignal()` and the `wss.on('connection')` guard; full diff in `server-index.diff` |
| 2. Never re-claim after losing | IMPLEMENTED (unchanged invariant), TESTED | `store.init()` is only called once at boot; the `lost` flag in `server/store.js` stops all writes and the heartbeat; a fenced process never exits, so it is never restarted into a new `init()` |
| 3. Optional: refuse to claim a fresh lease held by newer code | NOT IMPLEMENTED (optional; needs a reliable deploy ordering) | — |
| 4. Render health check on `/healthz` | NOT DONE: Render configuration change, needs owner authorization | — |

Behaviour after the fix:
- **Lease lost** (a newer instance took over): log `lease lost: staying up and answering 503 until SIGTERM; this process will not claim the lease again`; every HTTP request 503; `/healthz` 503 with `leaseLost: true`; open sockets closed 4001; new sockets closed 4001 at once; nothing written; process stays alive (keep-alive timer, and it starts listening if the loss happened during boot).
- **SIGTERM after lease loss**: exits 0 immediately (nothing to save).
- **SIGTERM while holding the lease**: unchanged (final save capped at 10 s, sockets 4001, exit 0). The old code exited 1 on lease loss; that path is gone.

## 2. Tests

Three new regression tests (7.2), added to `test/phase1/run.js`:

| Test | Pass condition | Old code `a3c67e9` | This branch |
|---|---|---|---|
| `lease_lost_stays_alive` | A does not exit within 10 s; `/healthz` 503 `leaseLost:true`; API 503; open sockets 4001; new websocket 4001; database unchanged | **FAIL** (A exited code 1; connection refused) | PASS |
| `restart_pingpong` | 12 s overlap with a supervisor that restarts exited processes: lease epoch 1 → 2 exactly; 0 restarts; NEW healthy at epoch 2; OLD exits 0 on SIGTERM | **FAIL** (epoch 1 → 5, restarts OLD=2 NEW=1, OLD exit 1) | PASS |
| `sigterm_after_loss` | fenced A exits 0 within 1 s of SIGTERM, no final save, nothing written, B healthy | **FAIL** (A never fenced: it had already exited) | PASS (exit 0 in 7–8 ms) |

The "old code" column was produced by copying only these three test files into a clean checkout of `a3c67e9` and running them.

**Two existing tests had their assertions updated, because they asserted the old behaviour ("A exits"):**
- `lease_fencing`: was "A must exit"; now "A must NOT exit (stays up fenced)". All other checks unchanged (stale flush rolled back, nothing written, sockets 4001, epochs 1/2).
- `two_instances`: was "A must exit"; now "A must not exit and must be fenced (`/healthz` 503, `leaseLost`)"; sockets must close 4001 in all cases (before, only checked if A exited). The A chip read was dropped because A now answers 503.

Phase 1 suite, three consecutive runs (`logs/phase1-run{1,2,3}.log`): **12 tests: 10 pass, 2 fail (2 expected), 0 unexpected failures** each time. The 7 previously passing checks still pass (`db_failure`, `finish_crash` [both "unexpected pass" as before], `sigterm_mid_hand`, `duplicate_actions`, `two_instances`, `lease_fencing`, `reconnect`), plus the 3 new ones. The 2 expected failures are unchanged (`fair_after_interrupt` → B5, `sessions_owner_reset` → B6/B7).

Race reproduction (`race-repro.js`, the evidence-package script pointed at this branch; `logs/race-repro-after-fix.log`): **lease epoch 1 → 2, exactly one handover, restarts OLD=0 NEW=0**; OLD exited 0 on SIGTERM at the end of the overlap; the member on OLD was closed with 4001. Before the fix the same script showed epoch 1 → 6.

`npm test` (`logs/npm-test.log`): exit 0, all suites passed (including the known flaky `t_server.js` on this run).

## 3. Staging deploys (Render logs)

Raw lines: `logs/render-staging-deploys.log`. Staging ran commit `9026503` (this branch merged into `staging`).

| Deploy | Old -> new instance | Lease epoch | Handovers | Old server after loss |
|---|---|---|---|---|
| 1 (push, 20:52) | old was asleep (free plan) | 11 | none, no overlap; not counted | n/a |
| 2 (redeploy, 20:55) | cgmzn -> 6vf5h | 11 -> 12 | **exactly 1** | fenced, "staying up and answering 503", never reclaimed |
| 3 (redeploy, 20:59) | 6vf5h -> ld76p | 12 -> 13 | **exactly 1** | fenced, "staying up and answering 503", never reclaimed |

Deploys 2 and 3 are the two consecutive deploys where both old and new servers ran the fix. Before the fix, the local race reproduction (section 2) went epoch 1 -> 6.

### Still not verified

- **Risk 7.3 (SIGTERM to the fenced process):** the line "SIGTERM after lease loss: exiting" did **not** appear for cgmzn or 6vf5h; neither logged anything after fencing. Render may have stopped the instance without a SIGTERM reaching the process, or the last lines were lost when the instance was removed. Either way neither process claimed the lease again or wrote to the database (no epoch beyond the next deploy's).
- **Health check path** (`/healthz`) is not set on either Render service.

## 5. C1: one controlled staging deploy (Muse condition C1)

Raw record: `logs/render-c1-controlled-deploy.log`. One deploy only (`dep-db99g30n74is73et5bp0`, 21:33 UTC); no repeat deploys.

**Pre-checks.** Staging live on `9026503`, whose server/lib/test code is identical to the reviewed fix `78fbfb0`. Service: free plan, 1 instance, `healthCheckPath` unset, start command `npm start`, auto-deploy from `staging`. Rollback target: `a3c67e9` (deploy `dep-db97kbvavr4c73dr7hrg`). The instance was asleep, so the owner signed in to wake it (epoch 14 at 21:29:23) before the deploy. `/healthz` and the staging database cannot be reached from this environment (outbound access to onrender.com is refused; the database has an empty IP allowlist), so health was taken from Render logs, events and metrics.

**Timeline.** 21:33:42.849 new instance `gllcb` claimed **epoch 15**; 21:33:43.66 Render marked the previous deploy deactivated; 21:33:43.81 live. Observed until 22:06 (32 minutes after the handover).

| Check | Result | Evidence |
|---|---|---|
| Exactly one leadership handoff | **PASS**: 14 -> 15, nothing else | only two epoch lines in the window |
| No lease reacquisition | **PASS**: no epoch 16, old instance never logged again | logs through 22:06:01 |
| No stale writes | **PASS (indirect)**: no "lease lost", no rolled-back flush, no "store write failed" from any instance | logs; the database itself could not be queried |
| "SIGTERM after lease loss: exiting" | **NOT OBSERVED** | no line at all from `4l5gs` after 21:29:23 |
| Render-confirmed removal of the old instance | **PARTIAL**: Render metrics for `4l5gs` stop after the 21:33 sample and the old deploy is `deactivated` at 21:33:43; Render has no explicit "instance terminated" event | `get_metrics`, `list_deploys`, `list_events` |
| No unexpected availability regression | **NOT MEASURED**: free plan has no request logs and the site cannot be reached from here; no `server_failed` / `server_restarted` events | `list_events` |

**Difference from deploys 2 and 3.** There the old instance logged "lease lost: staying up and answering 503" 0.1 to 0.6 s after the new claim. This time the old instance logged nothing after the claim, although its 3 s heartbeat would have detected the loss. So it was either stopped before its next heartbeat or its last lines were not shipped. Across the whole day no "shutting down: SIGTERM" line from any instance appears in Render logs either, even where the old code would have logged one, so lines written while an instance is being stopped appear not to reach Render's log stream. **Inferred, not verified**: one possible cause is the `npm start` wrapper (signal and output handling between npm and node).

### Remaining risks
1. SIGTERM handling of a fenced process is proven locally (`sigterm_after_loss`, exit 0 in under 10 ms) but not on Render.
2. Fenced window: in deploys 2 and 3 the old instance answered 503 for 2 to 10 s before Render switched traffic; clients reconnect (code 4001), but requests in that window fail.
3. Health check path: see `c2-healthcheck-proposal.md`; setting `/healthz` as it is could re-create the ping-pong.
4. The staging database and HTTP endpoints could not be inspected directly from this environment.

## 4. Re-run

```
npm ci
node test/phase1/run.js
node docs/evidence/p0/race-repro.js        # optional args: overlapSeconds restartDelayMs
npm test
```
