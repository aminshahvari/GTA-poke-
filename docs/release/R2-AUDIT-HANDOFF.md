# Release 2 — handoff to Muse for independent audit

> **Update 2026-10-17 15:xx UTC — F1 gaps from Muse's probing.** Persian/Arabic-Indic digits, comma-separated phones and letter-for-digit (O1OO) are fixed in `server/content.js`; see `R2-F1-gaps-muse-oct17.md` (before/after, 261-probe matrix, server checks, known limits). New code candidate: the commit that adds that note (code change only in server/content.js + test/t_content.js since `8919df3`). F1 verdict remains Muse's.

> **Update 2026-10-17 (owner decisions of 14:08 UTC).** Code candidate: `r2-dev` @ `8919df3` (later commits on r2-dev are docs only; Muse please audit and name the exact SHA you approve for staging).
> - B5 policy **APPROVED** by the owner: void verifiable record, replay keeps its hand number (as built).
> - F1 **REVISED**: social handles, profile links and messaging-app IDs now blocked too (`02d2886`); test/t_content.js 201 probes (54 social incl. 15 bypass attempts, 80 allowed incl. 27 social false-positive checks).
> - Staging: CONDITIONAL GO only after Muse confirms isolation — see `R2-STAGING-DEPLOY-PLAN.md`. Nothing deployed.
> - Final evidence on 8919df3: `docs/evidence/r2/final-npm-test.log` (exit 0), `final-phase1.log` (12/12 pass), `final-ui-tests.log` (t_table_small, t_registration, t_bizsearch, scan_csp all pass).
> - Muse asked to verify: B5, B6, chat isolation, F1, mobile layout, scanner tests, staging deploy risk.
> - Still UNVERIFIED (needs real devices after staging): iPhone Safari + Android Chrome for scanner/camera permission, 9-player table, touch controls, layout.

Claude, 2026-10-17. Branch `r2-dev` (base: frozen R1 RC `a8eef11` + R1 docs `4b1650f`). Release 1 branch, `staging`, `main` and production untouched. Nothing merged to main, nothing deployed, OWNER_CODE untouched, clubs closed.

| Item | Note | Main files | Proof |
|---|---|---|---|
| B6 owner sessions + recovery (auth) | R2-B6-sessions.md | server/index.js | phase1 sessions_owner_reset FAIL on R1, PASS here |
| B5 interrupted-hand fairness record | R2-B5-fairness-interrupt.md | server/fair.js, server/club.js, public/fair-verify.js, public/app.js (showFair) | phase1 fair_after_interrupt FAIL on R1, PASS here |
| Chat isolation + t_server de-flake | R2-chat-isolation.md | test/t_chat.js (new), test/t_server.js, server/index.js (closed notice only to signed-in sockets) | t_chat ~2,000 checks/run, 10/10; t_server 20/20 (`t_server-20-runs.log`) |
| F1 content rule incl. social IDs (Opportunity + Business text) | R2-F1-content-rule.md | server/content.js (new), server/opportunity.js, server/business.js, copy in public/*.js, scripts/content-audit.js | test/t_content.js, 201 probes + per-field + visibility/noindex |
| Small-phone table (iPhone SE class) | R2-table-small-phones.md | public/app.js, public/style.css | test/ui/t_table_small.js: 19/20 cases fail on R1, 20/20 pass; screenshots in project files poker-club/reports/r2-screens/table-small/ |
| Scanner real devices | R2-scanner-device-test.md | no code change | Chromium scan_csp pass (SIMD + no-SIMD); real phones = owner pass on staging |

## Evidence on the merged branch (`docs/evidence/r2/`)
- `merged-npm-test.log`: npm test exit 0 (incl. t_chat, t_content).
- `merged-phase1.log`: 12 pass, 0 fail. db_failure and finish_crash still flagged EXPECT_FAIL in the suite but pass (already true on the R1 base); flags left for Muse to confirm before flipping.
- `merged-ui-tests.log`: t_table_small, t_registration, t_bizsearch pass; scan_csp passes.

## Please look hard at
1. B6: `revokeSessions`, per-socket session re-check (`ws.sess`), recovery limits (5 per address, 60 club-wide per 10 min), constant-time code compare.
2. B5: `store.flush()` awaited (max 1 s) before cards/board go out: adds a DB round trip per street; check hand pace on Render Postgres.
3. F1: false-positive list in the note (e.g. "Sizes 10 12 14 16", "Budget 1500000").
4. Table layout: relayout cost ~150 ms worst case at 320x568 in Chromium; Safari not tested.

## Owner decisions still open (defaults in place)
- B5 policy: replay keeps its hand number, interrupted deal published as void (default) vs renumber vs omit. 1 s cap vs wait for the save.
- F1: block social handles too? Block requesters' own contact in request messages (default yes)? Run `scripts/content-audit.js` on production data before opening clubs.
- Real-phone pass: scanner + small-phone table on staging (needs r2-dev on staging for the table; not done, staging still runs R1).
