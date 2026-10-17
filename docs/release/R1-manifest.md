# Blindrise Release 1: release manifest (draft, 2026-10-17)

Status: **FROZEN for audit.** Release candidate code = `a8eef118bf38de9d6ffdb0a1394595161909b5a8` (branch `rc-2026-10-17`; later commits on the branch are documentation only, and any code change re-freezes with a new SHA). Staging `gta-poker-staging` deploys this SHA from branch `staging`. **Release remains NO-GO until Muse's verdict and the owner's explicit approval.**
Production today: `main` @ `d00b592` (Coming soon card). Production DB: `gta-poker-db` (paid plan `0.1c-256mb`, Postgres 17, IP allowlist empty = no external connections).

Labels: **[V]** verified with evidence in this repo; **[A]** assumed / not verified. Muse column: audit status by Muse (independent), never filled by Claude.

## 1. Features (status at freeze `a8eef11`)

| Feature | Build | Tests (Claude) | Muse | Release |
|---|---|---|---|---|
| Poker core | DONE (live today) | `npm test` exit 0 ×2 on the frozen tree; phase1 10 pass / 2 expected (B5, B6) | baseline audited | R1 |
| B1 single writer + P0 stay-up-fenced | DONE | phase1 `two_instances`, `lease_fencing`, `lease_lost_stays_alive`, `restart_pingpong`, `sigterm_*` PASS | CONDITIONAL PASS; G2 CLOSED | R1 |
| Business Club | DONE | `t_business`, `t_bizunit`; M-2 fix + `test/ui/t_bizsearch.js` | VERIFIED on staging (pre-redesign) | R1, clubs closed by default |
| Opportunity Club | DONE | `t_opportunity` | VERIFIED on staging; F1 open (before opening clubs) | R1, clubs closed by default |
| Owner switch for both clubs | DONE (`a824b0a`) | `t_clubs` (5/5 after race fix) | to audit in RC diff | R1 |
| Premium Home (M-1) | DONE (`dee22db`) | screenshots `r1-screens/home/`, websocket/timer check `09-websocket-check.log` | to audit | R1 |
| Registration clarity (M-3, owner-approved, UI only) | DONE (`4aefa37`) | `test/ui/t_registration.js` (fails on old code) | to audit | R1 |
| Oval table, egg/tomato splat, winner chips (visual only) | DONE (`edccaf0`) | screenshots + video `r1-screens/table/` | to audit | R1 |
| B7 removed member's sockets closed | DONE (`c806166`) | phase1 sessions part (c) | to audit | R1 |
| App files revalidate (ETag / 304) | DONE (`d3ff7c1`) | `t_csp` | to audit | R1 |
| `/login` opens the app | DONE (`9e124ba`) | manual | to audit | R1 |
| Business card scanner | in code (BC1) | synthetic-card browser test; **no real phone** | code VERIFIED, device NOT VERIFIED | R2 unless the owner tests on a phone |
| Friend invitations, mobile sign-up | live today | `t_server`, `t_security` | spot-audit | R1 (unchanged) |
| B6 owner sessions survive resetOwner | NOT FIXED (owner decision pending) | phase1 expected FAIL | — | R2 by default |
| Scheduled breaks, late-reg level 1-12 | NOT STARTED (owner: R2) | — | proposal reviewed | R2 |
| Multi-club | NOT STARTED | — | — | R2 |

Staging demo listings/businesses: created only when `STAGING=1` and the store has none (`server/business.js` seedDemo, `server/opportunity.js` seedDemo). Production does not set `STAGING`, so they never appear there [V code read]; staging and production have separate databases [V Render].

## 2. Gates (per Muse's release checklist, `RELEASE-CHECKLIST-blindrise-release1.md`)

| Gate | Status | Note |
|---|---|---|
| G1 (fenced-instance exit line never observed) | OPEN, non-blocker | capture the old instance's logs for 30+ min during the production deploy |
| G2 (independent read of staging DB) | **CLOSED** by Muse 2026-10-16 (Route 1) | `docs/evidence/p0/MUSE-G2-RESULT-2026-10-16.md` |
| G3 (deploy-window availability) | OPEN, blocker only for mid-game deploys | measure the switch window and 503s from production logs during the deploy |
| M1 (production identity) | **RESOLVED** by Muse | `gta-poker` deploys `main`, auto-deploy on commit, live `d00b592` |

Auto-deploy is on: **merging into `main` is the production deploy**. Nothing is merged to `main` before the owner's explicit approval.

**Muse question (M1 note): game state at 20:18 EDT on Oct 16 when `d00b592` auto-deployed.** The tournament was set for 21:00 EDT and was registering, not running; Claude pushed `d00b592` to `main` at 20:18 EDT on the owner's written approval and checked the boot (944 keys, no errors). Players had already registered on the old code; no anomaly was reported in the game that followed [A: no request logs on Render; based on the boot log and the owner's report].

## 3. Data migration

- No SQL migration. Table `kv (k text primary key, v jsonb)` is unchanged; `create table if not exists` only.
- New keys only: `lease` (B1), `biz:*`, `bizpref:*`, `bizSpotlight`, `opp:*`, `oppreq:*`, `oppreport:*`, `opplimit:*`, and field `settings.clubsOn`. Existing keys are not rewritten by the upgrade itself [V code read; A: verify with a key count before/after].
- Boot log after deploy must show `store: postgres, N keys, lease epoch 1` with N equal to the pre-deploy count (944 at the last production boot) plus at most a few session keys.

## 4. Backup (owner step, before deploy)

1. Deploy only when no tournament is registering-with-players or running.
2. Render dashboard → `gta-poker-db` → Recovery / Backups: create a manual export (logical backup) and download it. Record time and file size in this manifest. [A: available on paid plans; owner to confirm in the dashboard]
3. Note the current production commit (`d00b592`) for rollback.

## 5. Deploy (owner-authorized only)

1. Merge the frozen RC SHA into `main` (production auto-deploys from `main`).
2. Watch logs: one `lease epoch 1` line, no `store write failed`, no `fenced` on the new instance; old instance stops after Render's switch.
3. Smoke test on the phone: sign in, lobby loads, leaderboard, Learn, Director tab, Business tab hidden for a member account (clubs closed), demo table hand.
4. Only then, if the owner wants, open the clubs in the Director tab.

Disruption window: about 1 to 2 minutes of reconnecting sockets during Render's switch; HTTP stays up [V staging C1; A for production load].

## 6. Rollback

- App: revert `main` to `d00b592` (git revert of the merge, push) → Render redeploys the old code. Old code ignores the new keys and the `lease` row [V code read of `d00b592` store: loads all keys, never reads `lease`].
- Data: only if data was damaged, restore the export from step 4 (owner action in Render).
- Clubs only: close them in the Director tab; no deploy needed.

## 7. Known risks

1. First B1 deploy overlaps with old unfenced code for up to ~90 s: deploy between games only.
2. Up to ~3 s window where the old server can answer a request that is never saved.
3. Phase1 `fair_after_interrupt` and `sessions_owner_reset` still fail (B5, B6 not started).
4. `test/t_server.js` is a known flaky timing test.

## 8. Owner UX checks for R1 (from the Gemini review, 2026-10-17)

| Check | Existing behaviour | Evidence |
|---|---|---|
| Switching Poker ⇄ Business/Opportunities never disrupts the connection, timer or game state | Business is a tab in the same page; the websocket is shared and not reopened on tab change [V code read: `public/app.js` tab click handler only re-renders] | browser check pending (screens in `r1-screens/home/`) |
| Poker first during play; Business/Opportunities easy to reach otherwise | Home sections hidden while seated in a running tournament [V OC1 report 19a/19b] | re-check on the new Home |
| Professional empty states; demo data never shown as real members | Empty states exist (BC1 report); demo rows only with `STAGING=1` [V code read] | screenshots pending |

## 9. Release 2 backlog (not in R1)

Multi-club rollout; owner reset of a member's PIN if not approved today; business card scanner if not tested on a real phone; Gemini proposals for review: Tablemates, Smart Club Lounge, AI Matching, VIP Invitations, Club Assist.

## 10. Known visual defects at freeze (self-review; Chromium only, no real iOS/Android device)

| Severity | Where | Defect |
|---|---|---|
| MAJOR | Table, short phones (375x667) with 7-9 players | cramped: some bet chips touch the message line, top seats close to the pot pill, chips can overlap if most seats bet at once. 360x780, 390x844, desktop clean |
| POLISH | Table, 360 px, 8-9 players | two bet chips can touch when nearly every seat bets |
| POLISH | Table, showdown | revealed cards cover the top half of the avatar (intended) |
| POLISH | Table | slight shift when the hand-strength box appears/disappears (pre-existing) |
| POLISH | Table | resizing mid-animation can misplace a splat/winner stack until it fades |
| POLISH | Home cards | long industry names truncated with "…" |
| POLISH | Home cards | Demo tag overlaps the industry icon (staging only) |
| POLISH | Desktop | text cards capped at 820 px while grids run full width |
| POLISH | Style | 17 industry colour tokens outside the base palette |
| POLISH | Home, registering | long tournament note makes the hero tall on phones |
| NOT VERIFIED | all | automated contrast check; iPhone Safari; Android Chrome on a device |
| NOTE | staging screenshots | this container cannot reach `*.onrender.com`; screenshots are from a local run of the exact frozen SHA with fake data. Staging itself must be checked by Muse / the owner |
