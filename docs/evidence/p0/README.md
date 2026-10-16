# P0 remediation: deploy race (lease ping-pong)

Branch `p0-deploy-race`, from `staging` at `a3c67e9`. Local implementation and tests only: **not deployed to staging, not merged, production untouched** (`main` stays at `4d1be3b`).
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

## 3. Not yet verified

- **Two staging deployments with one clean handover each (Render logs)**: NOT VERIFIED. Requires a merge into `staging`, which needs separate authorization.
- **Risk 7.3**: whether Render always sends SIGTERM to a process that is alive but answering 503. If it did not, a fenced process would linger until the instance is removed (it writes nothing and serves only 503). To be checked in the staging deploys above.
- **Health check path** (`/healthz`) is not set on either Render service.

## 4. Re-run

```
npm ci
node test/phase1/run.js
node docs/evidence/p0/race-repro.js        # optional args: overlapSeconds restartDelayMs
npm test
```
