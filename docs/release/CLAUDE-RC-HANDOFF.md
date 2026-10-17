# Claude → Muse: Release 1 candidate handoff (2026-10-17)

**Frozen RC code SHA: `a8eef118bf38de9d6ffdb0a1394595161909b5a8`** (branch `rc-2026-10-17`; later commits are docs only).
Production today: `main` @ `d00b592`. Audit diff: `git diff d00b592..a8eef11` (code) and, for the delta since the last staging Muse audited, `git diff 9026503..a8eef11`.

## Staging
`gta-poker-staging` deploy `dep-db9f30e7bikc73dmentg` = `a8eef11`, live 03:55:10 UTC. Boot log: `store: postgres, 74 keys, lease epoch 24 (…-rhfr8:81)`, `fair deal: drand beacon ok`. One epoch claim, no write errors seen. Claude cannot reach `*.onrender.com` from its container, so the running-staging walk (mobile + desktop) is Muse's / the owner's; Claude's screenshots are local runs of the same SHA with fake data.

## What changed since staging `9026503` (all on the RC)
| Commit | What | Risk area |
|---|---|---|
| `a824b0a` | merge `main` (Coming soon card) + owner switch for both clubs (server 403/404 for members while closed; Director toggle) | authorization |
| `d3ff7c1` | static files `no-cache` + ETag/304 instead of `no-store` | caching |
| `c806166` | B7: removed member's sockets closed (4003) | privacy |
| `dee22db` (merged) | Premium Home (M-1), business/opportunity card restyle, `public/icons.js` | UI, XSS (textContent/esc only) |
| `9e124ba` | M-2 business search consistency; `/login` serves the app | UI |
| `4aefa37` | M-3 registration clarity (UI only, owner-approved) | UI |
| `edccaf0` (merged) | oval table, egg/tomato splat, winner chip animation (visual only) | UI, timing (effects layer only) |
| `a8eef11` | `t_clubs` race fix (waits for the view reflecting the change) + evidence logs | tests |

No server changes to poker rules, points, registration logic, clock, or the websocket protocol. No schema change; new setting `settings.clubsOn` only.

## Evidence (in `docs/evidence/r1/`)
- `npm-test-run1.log`, `npm-test-run2.log`: full suite exit 0 twice on the frozen tree.
- `phase1.log`: 12 tests, 10 pass, 2 expected fails (B5 fair_after_interrupt, B6 sessions_owner_reset part a).
- `ui-tests.log`: `test/ui/t_bizsearch.js` (M-2) and `test/ui/t_registration.js` (M-3) pass; both fail on the pre-fix code (checked).
- Screens: `/mnt/project-files/poker-club/reports/r1-screens/home/` (incl. `09-websocket-check.log`: one socket, never reopened, clock running while switching Poker ⇄ Business) and `/table/` (incl. `phone-egg-tomato-win.webm`).
- Known defects: `R1-manifest.md` §10.

## Gate 3 suites on the exact RC
lease suite (phase1) ✓ · `t_business` ✓ · `t_opportunity` ✓ · `t_clubs` ✓ · Muse acceptance (41) and moderation (15) suites: Muse's own, to run on `a8eef11`.

## Open owner decisions
B6 fix (auth) · accept B5/F1 for R1 · scanner real-phone test (else R2) · rotate OWNER_CODE before deploy · pre-deploy DB export.
