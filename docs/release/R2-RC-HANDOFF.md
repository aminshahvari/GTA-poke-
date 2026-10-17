# R2 integrated release candidate — Muse handoff + staging plan (NOT deployed)

Claude, 2026-10-17 ~20:10 UTC. Owner direction 19:52 UTC: integrate, test, hand to Muse, plan staging. **No staging or production deploy authorized.** Tonight's production tournament and the live Welcome UI are untouched.

## Candidate
Branch `r2-rc` (also fast-forwarded into `r2-dev`). The code is everything up to `3dad54f`; the commit after it adds only this document.

| Part | Source | Audit state |
|---|---|---|
| F1 content rule incl. separators + preceding-number fix | `ad628af` (= `r2-dev` before this work, fast-forward) | Muse FINAL PASS; `server/content.js` byte-identical to `b40c333` |
| Mobile UX (5 fixes) | `r2-mobile-ux` `fac7c53` (merge `5fbe86c`) | **needs Muse** — handoff `R2-mobile-ux-handoff.md` |
| Live Welcome UI | `origin/main` `49d9ece` (merge `6b2c6c8`) | Muse PASS + in production since 19:34 UTC; merged so R2 does not roll it back |
| Test fix | `3dad54f`: `scan_csp.js` taps Sign In on the welcome screen | test only |

Merge conflict: only the PIN input line in `public/app.js` (both sides had added the same "Your PIN / Choose a PIN" placeholder); production's line kept. `git diff c0daed4 <candidate> -- server package*.json` = `server/content.js` only (F1). No package, schema, env or data change since the staging build `c0daed4`.

Muse — please audit: the mobile UX diff (`git diff 523a284 fac7c53`), the two merges (`5fbe86c`, `6b2c6c8`) for resolution correctness, and that `server/content.js` equals `ad628af`'s.

## Tests on the candidate (Chromium, local)
- `npm test`: all suites pass (content rule 414 probes).
- `test/ui/t_welcome.js` (6 phone sizes), `t_mobile_ux.js` (72 checks), `t_table_small.js`, `t_registration.js`, `t_bizsearch.js`: pass.
- `test/browser/scan_csp.js` SIMD and `--no-simd`: pass (after the welcome-screen tap fix), 0 CSP violations under R2's stricter CSP.
- Mobile re-run on the fixes (9 phones): 2 overlaps in 206 table measurements (was 126 in 501) — `/mnt/project-files/poker-club/reports/r2-mobile-ux-recheck/`.

## Known issues / risks
- Chromium only; iPhone Safari, Android Chrome, real camera, real network not tested by machine.
- Seat names now show a short form ("Test 01", "Sean S."): visible change for everyone — owner OK needed.
- Coach tip now floats over the lower table and closes on your turn; while open it covers your cards and the two lowest seats.
- Left: 2 small overlaps at 375×629 with a long helper line; at 320×568 two chip labels can touch pot/D button when all nine have bet (pre-existing, not your turn).
- Not changed: own cards over own name; small secondary buttons; every invite link (personal too) auto-registers for the open tournament — owner decision pending (`r2-invite-notes` `dedbb5c`).
- F1 residuals (documented, Muse-accepted): non-North-American phones after a leading number only caught when the whole run is; `four one six, 829, 5953`; dash-group size lists refused.

## Staging deploy plan (after Muse PASS + owner GO)
- Now: `staging` = `c0daed48c9b7…` live as `dep-db9poou1egvs73d1f8hg`. Candidate is a fast-forward of it.
- Deploy: `git push origin <candidate>:refs/heads/staging`. Render `gta-poker-staging` auto-deploys (~40 s). No env/secret/DB/setting change. Staging only has seeded test accounts; no real player data.
- Record: deploy id, live commit, boot lines (`store: postgres, … keys, lease epoch N+1`, `Blindrise poker club on :10000`, drand ok), old instance fenced with nothing dirty, no errors; production still `49d9ece`.
- Rollback: `git push --force-with-lease=staging:<candidate> origin c0daed48c9b78f38811fc479bb324ddfda2adb20:refs/heads/staging` (or Render → Rollback to `dep-db9poou1egvs73d1f8hg`). Code-only; no data change.

## Real-device acceptance on staging (owner, ~15 min; Claude cannot reach the staging host)
1. iPhone Safari tab and Home Screen app; one Android Chrome: welcome → Sign In as `Test Player 01` / `135711` → lobby.
2. Table: Director starts a test table; on the phone check the Bet label no longer covers the stack, names readable, coach tip floats and closes on your turn, action buttons easy to hit.
3. Business: publish a test business from a second account, come back to Business → it appears without reload. On a small phone open a contact share with a blocked note → error visible.
4. F1 on staging: `We tutor grades 6-12. 416,829,5953` and `416•829•5953` refused; a Persian price text saves unchanged.
5. Scanner: real card with the real camera; allow and deny permission.
6. Report pass/fail per line (screenshots for any fail).

## Still before production
Muse final audit of the integrated candidate; staging deploy (owner GO) + device pass; production content audit (`R2-content-audit-procedure.md`, read-only, owner GO, after the R2 production deploy, clubs still closed); separate owner GO for production, outside tournament hours.
