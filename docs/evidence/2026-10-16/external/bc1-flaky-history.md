# `test/t_server.js` flaky-test history

`test/t_server.js` is a pre-existing timing-sensitive test (random 23-player tournament over WebSockets with fixed 100–200 ms sleeps). Its failures are always chat / throw / late-registrant-seating timing checks, never chips, points or Business Club checks. It does not load any client file, the CSP or `/vendor/`.

| Date (UTC) | Commit | What | Runs | Passed | Failed | Source |
|---|---|---|---|---|---|---|
| 2026-10-16 | 1e6953f (base, before BC1) | t_server in the BC1 worktree before any change | 3 | 1 | 2 | BC1 report §5 |
| 2026-10-16 | 1e6953f (clean copy) | t_server | 12 | 12 | 0 | BC1 report §5 |
| 2026-10-16 | 1e6953f + BC1 server files only | t_server | 5 | 5 | 0 | BC1 report §5 |
| 2026-10-16 | 18bb929 (full BC1 branch) | t_server | 16 | 8 | 8 | BC1 report §5 |
| 2026-10-16 | 1e6953f (staging without BC1) | t_server | 4 | 2 | 2 | coordinator check / BC1 report follow-up |
| 2026-10-16 | 18bb929 (BC1) | t_server | 4 | 2 | 2 | coordinator check |
| 2026-10-16 19:13–19:17 | 7e946e3 (security closure) | full `npm test` (incl. t_server, t_csp) | 3 | 3 | 0 | `npm-test.log` (this folder) |

Totals so far: base without BC1 15/19 passed; BC1 branch (18bb929 + 7e946e3) 13/23 passed. Both fail sometimes, so the flakiness predates BC1; whether BC1 makes it more frequent is not proven either way (the samples are small and were taken on a shared, busy machine). Recommendation: replace the fixed sleeps in t_server's chat/throw/late-seat checks with "wait until" polling, separately from BC1.
