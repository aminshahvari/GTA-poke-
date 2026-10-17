# R2 Production Beta — readiness report (NOT authorized to deploy)

Claude, 2026-10-17 ~20:55 UTC, on the owner's "Controlled Production Beta" direction (20:36 UTC). For Muse's independent blocker/cosmetic call and the owner's GO decision.

## Verdict (Claude): READY FOR BETA once 3 open gates close — no code blocker known
Open gates: (1) owner real-device pass on staging, (2) Muse's beta-criteria verdict, (3) owner GO naming the SHA and a between-games window. Clubs stay closed at deploy; they open only after the content audit (below).

## Release conditions (owner's list)
| # | Condition | State | Evidence |
|---|---|---|---|
| 1 | Exact integrated SHA verified | **DONE** | `c4445ed1046e6cc44306bf9728d8c6eeae037d93` (code = `3dad54f`, Muse CONDITIONAL PASS `d7f2ad4`). Fast-forward of production `49d9ece` (contains the live Welcome UI). |
| 2 | Staging healthy | **DONE** | `dep-db9tnnqvcj2c739mu5a0`, live 20:35:19 UTC; lease epoch 37, old instance fenced with dirty 0, no errors (`R2-STAGING-DEPLOY-RECORD-c4445ed.md`). |
| 3 | Real-device smoke tests | **OPEN — owner** | Checklist sent 20:36 UTC (`R2-RC-HANDOFF.md`). Claude cannot reach the hosts; all machine tests are Chromium. |
| 4 | Read-only production content audit before clubs open | **READY, runs after deploy** | `R2-content-audit-procedure.md`, `scripts/content-audit.js --db` (one READ ONLY transaction; Muse PASS as tooling). Production has no business/opportunity records yet, so the first run is expected to find 0 records — it must still run before opening. |
| 5 | Rollback verified and ready | **DONE (rehearsed locally)** | Production 49d9ece → R2 c4445ed → back to 49d9ece → forward again, on one data file: all sessions kept both ways, PIN login + invite work both ways, 49d9ece ignores R2 keys (biz/opp/lease), R2 data survives a rollback (`docs/evidence/r2/rollback-rehearsal/`). Target: Render rollback to `dep-db9sr9e1egvs73d4qgh0` (49d9ece) + `git revert` on main. |
| 6 | Separate owner GO | **OPEN — owner** | |

## What a production deploy of R2 changes (vs live 49d9ece)
- Server: `store.js` (single-writer lease fencing), `fair.js`/`club.js` (B5 interrupted-hand voiding), `index.js` (B6 sign-out on PIN change/remove, recovery limits, chat isolation, clubs switch), `content.js` (F1), `business.js`, `opportunity.js` (new). Dependency: `ws` 8.18.0 → 8.22.0.
- Sessions: token format and lookup unchanged → **nobody is signed out** by the deploy (rehearsed).
- Clubs: closed for members by default in production (`clubsOn()` needs the Director switch; no `STAGING`/`CLUBS_DEFAULT` env there). The owner can see and use them while closed (by design, for setup). Scanner is inside Business Club → closed with it.
- Data: no migration; new keys only. First boot claims the `lease` row.

## Deploy-moment risks (must-dos, not code defects)
- **First fenced deploy overlaps the old unfenced code for up to ~90 s** (R1-manifest risk 1): deploy only between games, owner confirms no tournament running/registering with players.
- Measure the switch window / 503s from Render request logs and capture the old instance's logs (R1 gaps G1/G3).
- Release 1 condition 3 (OWNER_CODE rotation inside the window) is still recorded as outstanding — owner/Muse to confirm whether it applies to this deploy.

## Issues triage (Claude's proposal; Muse to rule)
**Genuine blockers if seen in the device pass** (none seen so far by machine): sign-in/registration/invite failure on iPhone Safari; table actions not tappable; hole cards or chat visible to the wrong player; any data loss.

**Acceptable as documented cosmetic for a Beta:**
- Action badge grazes the stack box by 1–2 px with real fonts (Muse cond. a; being fixed on `r2-ux-fonts`, not in this candidate).
- Own full name cut in the top bar at 320 px (Muse cond. b).
- 2 small overlaps at 375×629 with a long helper line; at 320×568 chip labels touching pot/D button when all nine bet (pre-existing, not your turn).
- Own cards over own name; small secondary buttons (+30s, presets, −/+).
- Coach tip covers your cards between turns (closes on your turn).
- F1 residuals: non-North-American phones after a leading number; spelled digits with commas; size lists with dashes/underscores refused (safe direction).
- First scan on slow 3G ~37 s (6 MB OCR download), no progress estimate.

**Behaviour, owner decision (not a regression):** every invite link (personal too) auto-registers the new member for an open tournament — same as production today (`r2-invite-notes` `dedbb5c`).

## Proposed beta sequence (each step on the owner's word)
1. Owner device pass on staging → Muse beta verdict.
2. Owner GO + window (between games, outside tournament hours) → fast-forward `main` 49d9ece → c4445ed; watch Render; record deploy id, boot, fencing, 503 window.
3. Phone check on production (sign-in, table, invite) → rollback if any blocker.
4. Owner GO for the read-only content audit → run in Render Shell → owner reviews findings.
5. Owner opens clubs with the Director switch (can close again instantly).
