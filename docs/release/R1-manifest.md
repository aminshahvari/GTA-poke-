# Blindrise Release 1: release manifest (draft, 2026-10-17)

Status: **DRAFT. Not a release candidate yet.** The RC SHA is filled in when the branch is frozen.
Production today: `main` @ `d00b592` (Coming soon card). Production DB: `gta-poker-db` (paid plan `0.1c-256mb`, Postgres 17, IP allowlist empty = no external connections).

Labels: **[V]** verified with evidence in this repo; **[A]** assumed / not verified. Muse column: audit status by Muse (independent), never filled by Claude.

## 1. Features

| Feature | Build status | Tests (Claude) | Muse | Release |
|---|---|---|---|---|
| Poker core: login, invite-only sign-up, scheduling, clock, blinds/antes, action timer, seating/balancing, late reg, points, leaderboard, director, results | DONE (on production today) | `npm test` exit 0 on `a824b0a` [V] | NOT VERIFIED | R1 |
| B0 sign-in limit keyed on `cf-connecting-ip` | DONE, on production (`4d1be3b`) | `t_security` [V] | NOT VERIFIED | already live |
| B1 single writer (lease + epoch fencing, graceful SIGTERM, `/healthz`) | DONE on staging | phase1 `two_instances`, `lease_fencing`, `sigterm_mid_hand` PASS [V] | NOT VERIFIED | R1 (gated by G2) |
| P0 stay-up-fenced (no lease ping-pong) | DONE on staging (`78fbfb0`) | C1 controlled deploy record [V] | G2 **OPEN** | R1 (gated by G2) |
| Business Club (profile, logo, category, contact by consent, search, Home carousel, moderation) | DONE on staging | `t_business`, `t_bizunit` [V] | NOT VERIFIED | R1, behind owner switch |
| Opportunity Club (need/can help, private request, share contact by consent, report, director queue) | DONE on staging | `t_opportunity` [V] | NOT VERIFIED | R1, behind owner switch |
| Owner switch for both clubs (closed by default in production) | DONE (`a824b0a`) | `t_clubs` [V] | NOT VERIFIED | R1 |
| Business card scanner (on-device OCR, review screen, save draft, separate publish) | DONE in code | unit + browser test with synthetic card [V]; **not tested on a real phone** [A] | NOT VERIFIED | R2 unless tested on a real phone today |
| Friend invitations (member links, group link) and mobile sign-up | DONE (on production today) | `t_server`, `t_security` [V] | NOT VERIFIED | already live |
| Premium Home: Poker / Business / Opportunities | IN PROGRESS | | | R1 if done + screenshots |
| Oval table, egg/tomato splat, winner chip animation (visual only) | IN PROGRESS | | | R1 if done |
| Owner reset of a member's PIN | NOT STARTED (needs owner's yes: auth change) | | | R1 or R2 |
| Multi-club | NOT STARTED (design only) | | | R2 |

Staging demo listings/businesses: created only when `STAGING=1` and the store has none (`server/business.js` seedDemo, `server/opportunity.js` seedDemo). Production does not set `STAGING`, so they never appear there [V code read]; staging and production have separate databases [V Render].

## 2. Gates

| Gate | Status | Note |
|---|---|---|
| G1 | UNKNOWN to Claude | Muse's G1 text not received in this thread |
| G2 (independent read of staging DB) | **OPEN** per Muse assessment 2026-10-16 | needs owner to authorize Route 1 (temporary Starter + Render Shell) or Route 2 (owner /32 allowlist) |
| G3 | UNKNOWN to Claude | Muse's G3 text not received |

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
