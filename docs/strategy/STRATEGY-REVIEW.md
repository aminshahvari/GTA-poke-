# Blindrise product strategy review (Claude, 2026-10-18)

Ordered by the founder, 04:20 UTC, "Product strategy review". This is a read-only analysis: no code, settings or production were changed. It covers Blindrise only.

**Baseline:** live production is `5c7ee11` (Render deploy `dep-dba1ktbrjlhs73c6fdig`, live 01:02 UTC Oct 18). File references below are at `5c7ee11` unless a branch is named.

**Labels:**
- **verified:** a test was run here, or Muse issued a verdict.
- **code read:** the source was inspected, but nothing was executed.
- **inferred:** reasoning only.

---

## 0. Gemini recommendations vs reality: WAITING FOR THE REPORT

The Gemini competitive report the founder refers to is **not available to Claude**. It is not attached to the 04:20 message, not in the project's uploaded files and not in any branch. The only Gemini material on file is the earlier **UX** reviews (Muse `MUSE-NOTE-gemini-review-items-2026-10-16.md` and `MUSE-ADDENDUM-ux-gemini2-2026-10-16.md` on `r2-dev`), which Muse already tested and closed. They are not a competitive report.

This section stays empty until the report is shared. Each Gemini recommendation will then be mapped to one of these:
- **already live** (with evidence);
- **on a branch**;
- **roadmap**;
- **conflicts with a constraint**, such as no real money, no rewards for invites, no wealth ranking, Ontario legal review, or the approved Exchange design.

Nothing in sections 1–6 depends on its content.

---

## 1. Feature inventory: implemented vs roadmap

### Live on `5c7ee11`
| Feature | Evidence | Verified how |
|---|---|---|
| NLHE tournament engine: side pots, splits, hand evaluation | `server/engine.js`; `test/t_eval.js`, `t_rules.js` | verified: `npm test` (see §7); Muse stress run of 3,000 tournaments, 30,795 hands, 0 problems (`d9836df`, Area 3) |
| Multi-table tournaments: table size 6/8/9, balancing, hand-for-hand, late registration by level | `server/club.js:51-59` (`tableSize`, `lateLevels`), `:102` `lateOpen`, `:285` `hfh` | verified: `t_sim.js`, Muse |
| Provably fair deck: secret seed, public SHA-256 seal, drand beacon, client verifier | `server/fair.js:2-30`, `public/fair-verify.js` | code read; Muse code-verified the seal chain (`d9836df` Area 6) |
| Director: create, edit, start, pause, cancel, kick, mute, remove, chat off | `server/index.js:398-434` (WebSocket cases) | code read; `t_server.js`, `t_security.js` |
| Invite-only membership: single links, member links, 100-use group link, revoke | `server/index.js:73-90`, `:131-145`, `:431-433` | verified: Muse audits; used live on Oct 17 |
| Name + PIN sign-in, per-IP and per-account rate limits, owner recovery code | `server/index.js:47-60`, `:92-105` | verified: `t_security.js`; Muse R2 audit |
| Points and rewards shop: earned only by finishing places, not transferable, skill-testing question | `server/rewards.js:1-12` | code read; `t_extra.js` |
| Player profiles, avatars, lifetime stats, skill tier | `server/players.js` | `t_players.js` |
| Hand history and coaching notes (80 hands per player) | `server/coach.js` | `t_coach.js` |
| Web Push notifications: registration open, starting soon, starting now | `server/push.js` | `t_push.js` |
| Table chat with throws (egg/tomato), rate limit | `server/index.js:307-330` | `t_chat.js` |
| Household / multi-account flagging for the owner | `server/index.js:250`, `:293` | code read |
| Learn tab (lessons) and client-only practice table | `public/learn.js`; demo in Director (members: Salon → Lessons) | `t_premium_ui` 295/0 |
| Business Club "The Exchange": profiles, 17 categories, search, Member Spotlight, logos, opt-in contact details | `server/business.js:1-25`; `public/business.js:99`, `:134`, `:151` | verified: `t_business.js`, `t_bizunit.js`, `t_bizsearch`; Muse live probes on staging |
| Opportunity Club "The Bulletin": need/offer listings, private contact requests, reports, auto-hide after 3 reports, spam limits | `server/opportunity.js:1-30` | verified: `t_opportunity.js`; Muse |
| F1 contact filter on club text (links, emails, socials, phones, including spelled-out digits) | `server/content.js` | verified: `t_content.js`; Muse separator/bullet audits |
| Business-card scanner (on-device OCR) | `public/cardparse.js`, `scripts/vendor-tesseract.js` | code read |
| Clubs switch (owner-only, one switch for both clubs) | `server/index.js:126` (`settings.clubsOn`), `:398` | verified: `t_clubs.js`, `t_clubs_closed` 25/0 |
| Premium navy and gold UI (Lounge, five tabs, Strategy Table, Exchange, Bulletin, Salon) | `public/style.css`, `public/app.js:220-240` | verified: `t_premium_ui` 295/0, `t_mobile_ux`; Muse PASS `bad2324` |
| Postgres kv with lease/epoch fencing, healthz | `server/store.js` | verified: Muse; production boot "lease epoch 1" |
| PWA (manifest, service worker, home-screen icon) | `public/manifest.webmanifest`, `public/sw.js` | code read |

### On a branch, unmerged (not live)
| Feature | Branch @ SHA | State |
|---|---|---|
| Members' Lounge practice-table card, Director invite rows fixed at 320–430 px | `r2-hotfix` @ `06dd2e5` | Muse CONDITIONAL on `fcabb5d`; the condition is fixed in `06dd2e5` and needs a re-audit |
| Mobile viewport stability (dvh, visualViewport) | `mobile-stability` (in progress) | not delivered yet; Muse Area 1 FAIL until it is |
| Table layout redesign for 2–9 players | `table-redesign` (in progress, stacked on mobile-stability) | not delivered |
| Show Cards, hand-to-hand delay, Rabbit Hunt, default-off | `gameplay-options` (in progress) | not delivered; Muse's fairness conditions are filed (`d9836df` Area 6) |
| Public campaign signup link (consent notice, PIN reminder, who-joined report) | `public-onboarding` @ `8b2b1fa` | Muse PASS (`91bfd7f`), but built on the old Shape A `bf24ceb`: it must be rebased onto R2 and delta-audited |
| Desktop responsive layout (CSS-only, ≥768 px) | `desktop-ux` @ `ad3b30f` | not audited; built on `5838e14`, so it needs a port to R2 |
| Feedback Hub (members send Bug/Idea/UX notes; owner inbox) | `r2-feedback` @ `67ed7fc` | Muse PASS (`fd7c911`, 31 probes); never released |
| Shape A table polish | `shape-a-table` @ `754b838` | obsolete: R2 has its own splats (Muse NO-GO for production) |

### Roadmap only (no code anywhere)
- Multi-club / multi-tenant hosting (§4).
- Tournament lifecycle logging and results export: today the server logs no tournament events (Muse, overnight Area 1).
- An admin data export inside Director: today backups are Render exports only.
- Real iPhone Safari / WebKit test coverage: only Chromium is available in this environment.
- Investment or fundraising content in the clubs: **closed** pending Ontario legal review. There is no code for it.

---

## 2. Mobile UX and onboarding: stabilization priorities (ranked)

1. **Viewport jump on iPhone (P0).** Muse reproduced it: going from 844 to 754 px viewport height moves the table area −90 px and the hero seat −80 px, and seats rescale from 100 to 88 px (`MUSE-REPORT-overnight-audit-2026-10-18.md` Area 2; `d9836df` Area 1). The cause is in code: `html,body,.app{height:100%}`, the table is `flex:1`, and there is no `dvh` and no `visualViewport` handling. The fix is in progress on `mobile-stability` and will land on `r2-hotfix` as one SHA for Muse.
2. **Real-device Safari check (P0, owner).** All browser evidence is Chromium. The founder's 12-step phone smoke test (`docs/release/R2-DEPLOY-RUNBOOK.md` §4) on the live build is still owed (Muse remaining risk 3).
3. **Lounge hotfix: practice card and invite rows (P0).** Done on `r2-hotfix` `06dd2e5`: `t_hotfix` 39/0, and the stricter test fails on `fcabb5d` (36/3). It awaits Muse's re-audit.
4. **Test harness reliability (P1).** `t_table_small` at 320×568 measures the animated chips after a fixed 700 ms, which is flaky under load (Muse `d9836df` Area 2). The fix is to wait for the animation to end before measuring.
5. **Campaign link rebase (P1).** `8b2b1fa` needs a rebase onto R2 before any public onboarding, then a delta audit.
6. **Desktop port (P2).** Port `ad3b30f` onto R2, then Muse audits it. Desktop is not the primary device.
7. **Onboarding copy and first-run flow (P2, inferred).** New members redeem a link, choose a name and PIN, and are auto-joined to an open tournament. There is no PIN recovery for members, only the owner's reset. Any new mandatory onboarding gate needs separate approval.

---

## 3. Business Club and Opportunity Club readiness

**Built and audited** (server byte-identical to the staging-accepted `c4445ed`; Muse `d9836df` Area 5):
- profiles with categories, search and Member Spotlight;
- need/offer listings with private contact requests;
- contact details shared only after the poster opts in (`oppreq.shared`);
- reports with auto-hide;
- spam windows;
- the F1 filter on all free text.
- The approved navy and gold Exchange design stays as it is. **No redesign is proposed.**

**Gated or open:**
- **Club switch state conflict.** The founder wrote at 01:55 UTC that he opened the section. Muse `d9836df` says the clubs are closed. This must be confirmed (`docs/release/R2-RELEASE-EVIDENCE-2026-10-18.md` §4.2 on `r2-release`).
- **Content audit on a fresh export.** The last run found 0 club records and 0 fields to review on the Oct 17 00:41 EDT export. The script and filter blobs are identical in live `5c7ee11`, `r2-dev` and the audited `c4445ed`. Preparation: `/mnt/project-files/blindrise/overnight/BUSINESS-CLUB-content-audit-prep.md`.
- **Investment solicitation stays closed** pending Ontario legal review. Inferred gap: no server rule specifically blocks investment asks in Opportunity text, so today this rests on moderation (reports and the owner's hide). Adding a keyword rule would change content rules, so it needs owner approval and a Muse audit.
- **Not built, by design:** payments, ads and paid placement. The legal notes (`docs/ontario-social-club-legal-notes.md` §8 NEVER 11) say not to introduce any revenue without legal advice first.

**Readiness verdict (inferred from the evidence above):** technically ready for a small invite-only membership. Operational readiness depends on the switch confirmation and a fresh-export audit.

---

## 4. Multi-tenant architecture: gap analysis

Today the app is **one club per deployment**. Verified by code read at `5c7ee11`:

| Area | Today | Needed for multi-club |
|---|---|---|
| Storage | One Postgres table `kv(k,v)` and an in-memory cache of all keys (`server/store.js`). Keys are global: `user:`, `name:`, `invite:`, `session:`, `biz:`, `opp:`, `history:`, `reward:` and others | A tenant prefix or column (`club:<id>:…` or a `club_id` column with an index); a per-tenant cache or lazy load. The whole-store memory cache does not scale to many clubs (inferred) |
| Single-writer lease | One `lease` row; one process owns everything | Per-tenant leases or a sharding plan, so one deploy doesn't fence all clubs |
| Owner | One `owner` key (`server/index.js:26`); setup and recovery use one `OWNER_CODE` env var (`:63-100`) | A per-club owner record; recovery by email or platform admin instead of a shared env secret |
| Settings | One `settings` key (`clubsOn`, `chatOff`, `membersInvite`) | Per-club settings |
| Tournaments | One `tourney` key (`server/club.js:34`): one tournament at a time per deployment | Per-club tournament state and timers; the scheduler loop is per process today |
| Names | `name:<lowercase>` is unique across the whole deployment | Uniqueness per club, or global accounts with per-club membership |
| Auth | Sessions are bound to a user, with no club scope | Session → (user, club) scoping; every WebSocket and API handler checks the club |
| Isolation | Implicit (one club) | An explicit club check on every read and write; cross-tenant tests |
| Billing | None. Any revenue first needs legal advice (legal notes §8) | Platform billing for club operators, kept separate from play: no fees tied to entry or prizes |
| Migrations | No schema migrations exist; kv keys are additive | A key-rewrite migration with a rehearsed rollback. **Needs separate owner approval** (standing rule) and a Muse audit |

Effort to make it multi-tenant: **L** (inferred). It touches every server module: store, index, club, business, opportunity, rewards, players, push. Risk: **high**, because it rewrites data keys. A cheaper interim option is **one deployment per club**: a new Render service and database for each club, using today's code unchanged. Effort **S per club**, isolation is strong, and the operating cost grows linearly.

---

## 5. Top five commercialization priorities: effort and risk

**Assumptions:**
- no real money in play, no rake and no paid entry;
- no rewards for invites;
- no ranking by wealth or spending;
- any revenue only after Ontario legal advice;
- every step needs a Muse verdict and the owner's GO;
- one engineer-equivalent of agent time.

| # | Priority | Effort | Risk | Notes |
|---|---|---|---|---|
| 1 | Mobile stability and a real-iPhone pass (viewport, hotfix, Safari smoke test) | S | Low (client-only) | Prerequisite for everything; in progress |
| 2 | Controlled public onboarding (campaign link on R2, consent and PIN reminder, who-joined report) | S–M | Medium (exposure, spam) | `8b2b1fa` exists; needs a rebase and a delta audit. Instagram assessment on file |
| 3 | Club-operator offering via one deployment per club (white-label name and branding) | M | Medium (ops cost; OWNER_CODE handling per club) | No code migration. Needs a runbook and a branding config |
| 4 | Business Exchange value (spotlight scheduling, member directory quality, Feedback Hub `67ed7fc` release) | S–M | Low–Medium (privacy) | Keep the approved design; the content audit applies |
| 5 | Sponsorship or operator subscription (platform revenue) | M (product) plus legal | **High (legal)** | Blocked on Ontario legal review: it must never touch entry, chips, points or prizes (legal notes §8) |

True multi-tenant (§4) is **L / high** and is deliberately not in the top five for the next 90 days (inferred recommendation).

---

## 6. 30/60/90-day proposal and execution order for Muse review

Every item ends with a Muse verdict on an exact SHA and the founder's GO naming that SHA, in a quiet window with a fresh backup. Nothing auto-deploys: a merge to `main` is a deploy.

**Days 0–30: stabilize**
1. `r2-hotfix` one-SHA release: viewport fix, practice card, invite rows. Then Muse re-audit, founder GO and the phone smoke test.
2. Resolve the clubs switch state and run the content audit on a fresh export.
3. Close the R2 release record: backup evidence and the OWNER_CODE decision (rotation recommended in the hotfix window).
4. Harness fix for `t_table_small`; add a resize-stability test to the regression suite.
5. Table redesign for 2–9 players and the desktop port (each its own SHA).
6. Gameplay options specs, then a Muse fairness review. Implementation stays default-off.

**Days 31–60: grow carefully**
7. Campaign link rebased onto R2, then a delta audit and a controlled launch with the who-joined report.
8. Feedback Hub release (already Muse PASS on `67ed7fc`; needs a port onto the current line).
9. Tournament lifecycle logging (results and standings written to logs or a results export), so results can be verified without database access.
10. Ontario legal review commissioned for any revenue model (owner).

**Days 61–90: operator pilot**
11. One-deployment-per-club pilot for a second club: runbook, branding config, per-club OWNER_CODE handling. No shared data.
12. Multi-tenant design document only (§4), with a migration rehearsal plan, for a separate approval decision.
13. Revenue experiment only if legal advice clears it, and only on the operator side, never for players.

**Proposed execution order for Muse:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 11 → 12. Items 10 and 13 are owner and legal.

---

## 7. Test status (this review)
- `npm test` on `5c7ee11` (clean worktree, this session, 2026-10-18 ~04:35 UTC): **exit 0**. Evaluator all passed; rules 42/0; random-action stress 3,000 tournaments, 30,616 hands, 0 problems; 20 AI tournaments 0 problems; server, chat, coach, players, push, extra-time, security, business, opportunity, clubs-switch and CSP suites passed; content rule test 414 probes passed.
- UI suites on `r2-hotfix` `06dd2e5` (earlier tonight, Claude): `t_hotfix` 39/0, `t_premium_ui` 295/0, `t_clubs_closed` 25/0, `t_mobile_ux` pass, `t_welcome` pass, `npm test` exit 0.
- Muse on `fcabb5d`: `npm test` exit 0, premium 295/0, `t_hotfix` 38/1 (the failure is fixed in `06dd2e5`).
