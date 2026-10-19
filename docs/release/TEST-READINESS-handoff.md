# Test readiness: corrective action handoff

Branch `test-readiness`, based on `main` at 4423a07 (production). Changes are in test code only.
Nothing under `server/` or `public/` changed, and `package.json` is unchanged. No assertion was
skipped, loosened or deleted.

## Problem

Test scripts spawned `node server/index.js` and then made requests too early. Some waited a fixed
time (`t_extra` 700 ms, `t_security` 900 ms). Others polled `/health`, a route that does not exist,
so any HTTP answer counted as "up". Others polled `/healthz` but, after 40 to 60 tries, carried on
silently even when the server had not started. On a slow or busy machine the first request could
reach a server that was not listening yet. Muse saw one `npm test` run exit 1 this way.

## What changed

- **New `test/ready.js`.** This is the shared helper.
  - `watchServer(srv, { forward })` drains the server's stderr and keeps a 4 KB tail. With
    `forward: true` it also echoes stderr to the test's stderr, for tests that used `inherit`.
  - `waitReady(base, srv, opts)` polls `GET /healthz` every 100 ms until it returns 200. The server
    returns 503 until its `listen` callback sets `ready`.
  - Each request has its own timeout (at most 2 s). The overall timeout is 15 s by default and can
    be changed with `READY_TIMEOUT_MS`.
  - If the server process exits first, the wait fails at once.
  - On failure it prints `FAIL <test>: server not ready …` with the URL, port, elapsed ms, last
    error (for example `ECONNREFUSED` or `HTTP 503`) and the server stderr tail. It then kills the
    server and exits 1.
  - `{ fatal: false }` returns `null` instead of exiting. `t_server` uses this for its retry on a
    port collision; its last try is fatal.
- **Every test that spawns a server** now spawns it through `watchServer` (stderr piped) and calls
  `await waitReady(...)` before its first request. This includes the restart in `t_opportunity`.
  - Files in `test/`: `t_business`, `t_chat`, `t_clubs`, `t_content`, `t_csp`, `t_extra`,
    `t_invite_privacy`, `t_opportunity`, `t_security`, `t_server`.
  - Files in `test/ui/`: `t_bizsearch`, `t_clubs_closed`, `t_hotfix`, `t_mobile_ux`, `t_positions`,
    `t_premium_ui`, `t_registration`, `t_stability`, `t_table_layout`, `t_table_small`, `t_welcome`.
- **`t_hotfix`.** Its local `serverReady()` (commit e774397 on r2-hotfix, which is also on main) is
  replaced by the shared helper. The behaviour is the same (poll `/healthz`, bounded), except the
  interval is now 100 ms and the limit 15 s.
- **`t_server` rewards and group-invite block.** This was the one flake found under CPU load. The
  load run failed with `FAIL member could add a reward` because a fixed `sleep(150)` came before
  the reply arrived. The fixed sleeps in that block are replaced with the file's existing bounded
  `until(cond, 5000)`, which waits for the reply the next check needs. The checks themselves are
  unchanged.

## How to run

    npm test
    # UI tests (sandbox paths)
    PLAYWRIGHT=/opt/node-tools/node_modules/playwright-core NODE_PATH=/opt/node-tools/node_modules \
    CHROMIUM=/opt/pw-browsers/chromium FONTS_DIR=<fontcache> node test/ui/t_stability.js

## Results (this branch)

`npm test` runs all 17 scripts, chained with `&&`. A pass means exit 0, with 16 "passed" or
"0 failed" summary lines plus `t_sim` reporting "problems 0".

- **Normal load.** 6 of 6 runs passed: 3 before the `t_server` fix and 3 on the final code
  (115 to 280 s each).
- **Under CPU load (3 × `node -e "for(;;){}"` on 4 cores):**
  - Load run 1, before the `t_server` fix, failed with `FAIL member could add a reward`. That is a
    mid-test fixed sleep, not startup.
  - After the fix, 2 of 2 load runs passed (load runs 3 and 4).
  - No readiness failure appeared in any run.

**UI tests, one run each on the final code:**

| Test | Result | Time |
|---|---|---|
| `t_stability` | 220 ok, 0 failed | 219 s |
| `t_hotfix` | 42 ok, 0 failed | 64 s |
| `t_premium_ui` | 296 ok, 0 failed | 59 s |
| `t_positions` | 351 ok, 0 failed | 204 s |
| `t_clubs_closed` | 25 ok, 0 failed | 19 s |
| `t_mobile_ux` | passed (exit 0) | 39 s |
| `t_table_small` | passed (exit 0) | 32 s |
| `t_welcome` | passed (exit 0) | 34 s |
| `t_table_layout` | 2304 ok, 0 failed | 139 s |

**Diagnostic check.** A fake server that never listens, with a 1 s timeout, printed
`FAIL demo: server not ready within 1000 ms`, the URL, port, elapsed time, `last error: ECONNREFUSED`
and its stderr tail, then exited 1. A fake server that crashes printed
`server process ended: exit code 3` after 168 ms and exited 1.

## Limits

- `test/phase1/*` and `test/browser/scan_csp.js` also spawn servers. They are outside the scope
  given (`test/*.js`, `test/ui/*.js`) and were not changed.
- Readiness means `/healthz` answers 200. That covers listening plus the store being loaded. It
  says nothing about later timing in a test.
- Fixed sleeps after startup were not audited test by test, apart from the `t_server` block that
  failed under load. Other mid-test fixed sleeps could still flake on a much slower machine.
- The sandbox was shared with other sessions running UI tests at the same time, so the "normal"
  runs were already under some background load.
