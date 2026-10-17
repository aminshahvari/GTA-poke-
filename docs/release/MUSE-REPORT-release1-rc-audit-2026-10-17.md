# BLINDRISE RELEASE 1 — INDEPENDENT RC AUDIT REPORT

Auditor: Muse (Marlowe), independent audit role
Implementer: Claude
Owner / final approver: Amin Shahvari
Date: 2026-10-17 (audit executed 2026-10-16 23:55 – 2026-10-17 00:20 EDT)
Target: repo `aminshahvari/GTA-poke-`, branch `rc-2026-10-17`,
**frozen code SHA `a8eef118bf38de9d6ffdb0a1394595161909b5a8`** (verified:
branch tip `0c2c8de` is documentation-only above the frozen code commit).
Handoff audited: `docs/release/CLAUDE-RC-HANDOFF.md`.
Restrictions honored: read-only audit; no production deployment, no
production configuration change, no database modification, no merge.
No PASS in this report rests solely on Claude's claims: every verdict is
backed by my own code read, my own test executions on the frozen tree, my
own Render reads, or my own walk of the running staging app, and is
labelled with its method.

## FINAL RECOMMENDATION: CONDITIONAL GO

The frozen candidate is fit to deploy to production **when the five
conditions in section 6 are met**. I found **no release-blocking defect
in the candidate itself**. The conditions are owner actions and
acceptances, not code fixes: nothing needs to go back to Claude before
the deploy. If any condition cannot be met, the recommendation reverts
to NO-GO until it is.

Production is untouched by this audit. Reminder of the standing rule:
production auto-deploy is ON, so **merging the frozen SHA into `main`
IS the deployment** — the owner's explicit approval must come first.

---

## 1. The owner's eight required verifications

### 1.1 Staging deployment SHA, boot logs, database integrity, lease fencing, drand, regression tests — VERIFIED
- Render (my read): staging `gta-poker-staging` LIVE deploy
  `dep-db9f30e7bikc73dmentg` = commit `a8eef118bf38de9d6ffdb0a1394595161909b5a8`,
  live 2026-10-17 03:55:10 UTC, from branch `staging`, Auto-Deploy on.
- Boot log (verbatim): `store: postgres, 74 keys, lease epoch 24
  (srv-db8qnn6i0phs738m9ajg-hibernate-6bdd8dd6c7-rhfr8:81)` — exactly one
  lease claim for this deploy; no later epoch claim in the following
  hour. Key count 74 is consistent with my independent database read of
  2026-10-16 (G2: 74 state keys + the lease row).
- `fair deal: drand beacon ok (round 33135314)` at boot. In code
  (`server/fair.js`, unchanged), each hand's deck is
  SHA-256(seed | drand quicknet beacon | table | hand); on beacon
  failure the code falls back to a local random value and logs it.
  Zero `fenced` lines, zero `store write failed`, zero boot errors.
- Lease fencing: my own phase1 run on the frozen tree (section 3)
  passes two_instances, lease_fencing, lease_lost_stays_alive,
  restart_pingpong, both sigterm cases, db_failure, finish_crash,
  duplicate_actions, reconnect — the exact failure set that production
  code `4d1be3b` failed on 2026-10-16 now passes.
- Regression tests: section 3 (all suites executed by me on the frozen
  tree, not taken from Claude's logs).

### 1.2 M-1, M-2, M-3, B7, redesigned table, club visibility, performance — VERIFIED (details in section 2)
Club visibility specifically: `clubsOn()`/`clubsClosedFor()` in
`server/index.js` — a stored `settings.clubsOn` boolean wins; otherwise
clubs are ON only when `STAGING=1` or `CLUBS_DEFAULT=on`, so
**production defaults to CLOSED**; member API calls to club endpoints
return 403 while closed, business logos return 404, the Director toggle
is owner-only, and the owner always bypasses. Verified in code and by
`t_clubs` passing on my run. Clubs ship closed; opening them later is a
separate owner action (gate: F1 decision, section 4.3).

### 1.3 B5, B6, F1 — reproduced and classified (section 4)
B5: reproduced by me; MAJOR, not a blocker; owner acceptance required.
B6: reproduced by me (both halves); MAJOR, not a blocker; owner
acceptance required (fix offered as an owner decision for R2).
F1: confirmed present in frozen code; does NOT block this deploy (clubs
ship closed); DOES block switching Opportunity Club on until the owner
decides (enforce server-side, or correct the UI copy).

### 1.4 Table at 320 / 375 / 390 px with 7–9 players — PARTIALLY VERIFIED; one MAJOR visual defect
- Code: table geometry is computed in pixels from the actual table area;
  seats are positioned on the oval with collision-aware chip placement,
  and a compact mode shrinks seats on narrow areas. No fixed-width
  layout that could break at 320 px.
- Live (my walk, staging RC): the oval table renders correctly in play —
  seats, board, pot, dealer button, bet labels, FOLD/CALL/RAISE and the
  turn timer all readable, no overlap at the audit browser's phone-width
  column (6-max demo). The egg-throw splat animation works.
- Claude's own device-width screenshots (manifest section 10, Chromium)
  report the table clean at 390x844 and 360x780.
- **MAJOR (visual, Claude self-reported, consistent with the geometry
  code): at 375x667 (short phones, e.g. iPhone SE class) with 7–9
  players the table is cramped** — bet chips can touch the message line
  and overlap when most seats bet at once. No information is lost and no
  control becomes inaccessible; it is a readability defect on one
  viewport class, not a functional failure. **Not a release blocker**;
  recorded as the top visual defect and a required Release 2 fix.
- NOT VERIFIED: exact rendering on real 320/375/390 devices (iPhone
  Safari, Android Chrome). My audit browser cannot emulate true device
  viewports; this rides on the owner's real-phone pass (section 6).

### 1.5 Registration, invitations, tournament functionality, Opportunity privacy, club isolation — VERIFIED
Live on the running staging RC (my walk, test account):
- Registration: Join works; the card then shows the green
  "You're registered" pill and "Cancel my registration"; cancelling asks
  for confirmation ("Keep my seat" / "Cancel my registration") — M-3
  behaving exactly as specified, live.
- Invitations: the invite dialog renders a personal link
  (`/join/<code>`, "Up to 10 people can join with your link") with share
  actions and copy. Nothing was sent.
- Tournament functionality: lobby, tournament card, demo-table play,
  hand helper, extra-time control, throw items — all working. Server
  side covered by `t_server` (pass on re-run), `t_players`, `t_clubs`,
  `t_rules`, `t_sim` (3,000 simulated tournaments, 0 problems) on my runs.
- Opportunity privacy: a listing's contact path is a private request
  form; the UI states plainly "Your phone and email are not shared" and
  only the poster sees the request. No contact data is exposed in
  listings (also code-verified: no `opp` data is ever sent in clubView).
- Club isolation: the app is single-club by design (verified as fact in
  the evidence audit; multi-club is Release 2 and out of scope).
  Member-only boundaries hold: club data requires membership (401/403 in
  the acceptance runs), removed members lose access immediately (B7).

### 1.6 Scanner — code VERIFIED; device behavior NOT VERIFIED → Release 2 unless phone-tested
The card scanner is on-device Tesseract 5.1.1, fully self-hosted
(vendored files byte-identical to the audited set), the photo is never
uploaded, and the flow is scan → review/correct → save draft → publish
separately. All of that is code-verified. The following require a real
iPhone and have never been run: camera/photo capture and orientation;
the WASM SIMD core executing in iOS Safari/WebKit; first load of
engine + language data (~6 MB) over a real network; OCR accuracy on a
real printed card under real lighting; the review screen with a touch
keyboard. Default: scanner ships in the code but is a Release 2 feature
for support purposes unless the owner runs the phone test today.

### 1.7 OWNER_CODE rotation and pre-deployment backup — BOTH STILL OUTSTANDING
- OWNER_CODE is the environment-held setup code that gates first-time
  owner setup and `resetOwner` PIN recovery (`server/index.js:53–57,
  89–91`). It does not rotate itself. **Rotation has not been done**;
  it is a pre-deploy owner step (change the value on the production
  service, which restarts it — do it in the same between-games window).
  Condition of GO (section 6).
- Pre-deployment database backup: **not yet created**. Owner step in
  Render (`gta-poker-db` → Recovery/Backups → manual export, download,
  record time + size). Gate 5 of the release checklist; condition of GO.

### 1.8 Scope comparison — COMPLETE
Everything in the frozen candidate maps to Release 1 scope. Incomplete
or nonessential items are already outside it: scheduled breaks (owner
decided Release 2 on 2026-10-16), multi-club (R2), owner reset of a
member's PIN (not started; R2 unless the owner approves), scanner
device support (R2 unless phone-tested). No incomplete feature is
riding into production hidden inside this candidate: I accounted for
every server change since the audited staging build (section 2).

---

## 2. Change-by-change audit since audited staging `9026503`

Every server change in `git diff 9026503..a8eef11` is one of the
following; `server/store.js`, `server/business.js`,
`server/opportunity.js`, `server/club.js`, and the fairness/engine code
are byte-identical to the audited staging build.

| Change | Commit | Verdict | Evidence |
|---|---|---|---|
| Owner switch for both clubs (closed by default in production) | `a824b0a` | VERIFIED | code read (gate logic above); `t_clubs` pass on my run |
| Static files `no-cache` + ETag/304 (was `no-store`) | `d3ff7c1` | VERIFIED | code read: app files get `Cache-Control: no-cache` + content-hash ETag, 304 on match; `no-cache` forces revalidation, so no stale-client risk after deploys; vendor files keep 1-year immutable (pinned versions only) |
| B7: removed member's sockets closed (4003), broadcasts stop | `c806166` | VERIFIED | one-line code read (sessions deleted, `ws.user` nulled, socket closed 4003); behavior confirmed in my phase1 run (no removed-member issue raised) |
| Premium Home (M-1) + `public/icons.js` | `dee22db` | VERIFIED | code read earlier + live on staging (Home: Poker → Business → Opportunities, section pills); `icons.js` verified present, defines `Icons.svg/el/cat` with safe fallbacks, inline SVG only (CSP-clean); tab switching never reopens the socket (code) and my walk switched tabs mid-demo with no reconnect banner or stuck state |
| M-2 business search consistency + `/login` serves the app | `9e124ba` | VERIFIED | code read + LIVE on staging: no-match search hides spotlight and the New-to-the-Club rail, count reads "0 of 5 businesses", designed empty state with Clear search |
| M-3 registration clarity (UI only, owner-approved) | `4aefa37` | VERIFIED | 8-line client diff read line by line (pill, "Cancel my registration" + confirm modal, "Finding your seat…"); LIVE on staging (section 1.5); server logic untouched |
| Oval table, egg/tomato splat, winner chip glide (visual only) | `edccaf0` | VERIFIED as visual-only | touches only `public/app.js` + `public/style.css`; live demo-table play incl. a landed egg splat; one MAJOR crowding defect at 375x667 (section 1.4) |
| `t_clubs` race fix + evidence logs | `a8eef11` | VERIFIED | test-only change (waits for the view reflecting the toggle); suite passes on my run |

M-1 note: Premium Home structurally resolves the lobby-overload MAJOR
from my premium-quality audit (Poker first, sections one tap away,
clubs suppressed while seated in a running tournament — the last point
code-verified; live in a real tournament it is covered by the deploy-day
smoke).

## 3. Test evidence — MY OWN runs on the frozen tree `a8eef11`

I cloned the repo, checked out the exact frozen SHA, installed
dependencies, and executed:

- `npm test` chain: `t_eval` PASS (200,000 hands), `t_rules` PASS
  (42/42), `t_sim` PASS (3,000 tournaments, 0 problems; 20 AI
  tournaments, 0 problems), `t_server` **FAIL run 1** ("throw not
  delivered"), **PASS run 2** (53 s). The single failure is the
  documented pre-existing `t_server.js` flake (historical record: fails
  intermittently on pre-RC code too; a dedicated de-flake + a cross-table
  chat isolation test are Release 2 P1 items). `npm test` alone is
  therefore not a release gate, per the checklist; the targeted suites
  are.
- Remaining suites run individually, ALL PASS: `t_coach`, `t_players`,
  `t_push`, `t_extra`, `t_security`, `t_bizunit`, **`t_business`,
  `t_opportunity`, `t_clubs`** (the gate-3 targeted suites), `t_csp`.
- Phase1 robustness suite: **12 tests, 10 PASS, 2 expected FAIL,
  0 unexpected** — the 2 expected fails are B5 and B6 (section 4).
  Lease/fencing/restart set all PASS (section 1.1).
- `sessions_owner_reset` full output (my run): the only issues raised
  are B6's; the removed-member part (B7) raises no issue — the fix holds
  under test, not just in code.
- UI browser tests (`test/ui/t_bizsearch.js`, `t_registration.js`):
  NOT run by me (they need Playwright/Chromium, not available in my
  environment). Their behaviors were instead verified by me live on
  staging (sections 1.5, 2) and in code. Claude's committed logs show
  both passing, and both failing on the pre-fix code.
- Opportunity acceptance (41 checks) and moderation (15 checks) suites
  from the evidence audit: the server code they exercised
  (`server/business.js`, `server/opportunity.js`) is byte-identical in
  the frozen tree to the build that passed 41/41 and 15/15, and
  `t_business`/`t_opportunity` pass on my run — VERIFIED by inheritance
  plus re-run of the repo suites.

## 4. B5, B6, F1 — reproduction and classification

### 4.1 B5 `fair_after_interrupt` — REPRODUCED (by me, phase1)
Reproduction: phase1 starts a hand, the server is interrupted mid-deal,
and on restart the interrupted hand is replayed with a different deck;
the fairness report then holds 1 record for hand 3 with different cards
than the players saw. Impact: the fairness *proof* for that one
interrupted hand cannot be verified after the fact. Chips, stacks,
points and results are unaffected; no player gains or loses anything.
Classification: **MAJOR (fairness-proof integrity), NOT a release
blocker.** Pre-existing in live production today; this release neither
causes nor worsens it, and deploys are between games by rule. It needs
an owner policy first (what the records should show for an interrupted
hand), then a fix — Release 2. Ships in R1 only with the owner's
explicit written acceptance.

### 4.2 B6 `sessions_owner_reset` — REPRODUCED (by me, phase1, both halves)
Reproduction: (a) owner tokens issued before `resetOwner` remain valid
after the owner resets their PIN — a PIN reset does not revoke existing
sessions; (b) 10 wrong setup-code attempts from any source trigger the
rate limit, and the real owner presenting the correct code then gets
429 "Too many tries" — locked out of recovery for 10 minutes.
Impact: (a) matters only if an owner token has leaked; (b) is a
nuisance denial of the recovery path, self-healing in 10 minutes.
Classification: **MAJOR (auth hardening), NOT a release blocker.**
Pre-existing; fixing it means changing session revocation in auth code
the night before a release, which is its own risk and would need its
own audit. Claude has the fix scoped (revoke ALL sessions on PIN
change/resetOwner + per-source recovery rate limit). Owner decision:
accept for R1 and fix in R2 (my recommendation), or hold the release
for the fix + re-audit.

### 4.3 F1 listing content rule — CONFIRMED in frozen code
`server/opportunity.js:52–54`: links are blocked only for scheme /
`www.` / bare-domain forms on a 27-TLD list. Phone numbers in every
format, and emails on unlisted TLDs, pass into listing text. Business
Club free text has no content rule at all. (The consent-based private
contact architecture does not depend on this filter.)
Classification: **NOT a deploy blocker** — clubs ship CLOSED in this
release. **Hard blocker for switching Opportunity Club ON**: before the
owner opens the clubs, F1 must be resolved one of two ways — enforce
the rule server-side (Claude's probe matrix as a committed test), or
correct the UI copy so it no longer promises a rule that is not
enforced. Owner decision, needed at club-opening time, not tonight.

### 4.4 Also carried as known / not verified
- Cross-table chat isolation: NOT VERIFIED. The flaky `t_server.js`
  includes a "chat leaked to another table" assertion; a real leak has
  neither been shown nor excluded. Pre-existing; R2 P1 (dedicated
  isolation test + de-flake). Covered by the owner's gate-8 acceptance
  or fixed first.
- G1: the fenced instance's "SIGTERM after lease loss: exiting" line
  has never been observed in Render logs. The husk is inert by
  construction and by my phase1 runs. Deploy-day duty: capture the old
  instance's logs for 30+ minutes during the train deploy.
- G3: deploy-window availability has never been measurable on the free
  staging plan. Known bound ~2–10 s of 503s before the traffic switch.
  Deploy-day duty: measure from production request logs. Blocker only
  for mid-game deploys, which are prohibited by rule.

## 5. Defect summary

CRITICAL: none.
RELEASE-BLOCKING: none in the candidate. (F1 blocks club *opening*,
not this deploy.)
MAJOR:
1. B5 — fairness proof gap for an interrupted hand (acceptance or R2).
2. B6 — PIN reset does not revoke sessions; recovery lockout by
   strangers (acceptance or fix-first; R2 fix scoped).
3. Table crowding at 375x667 with 7–9 players (visual; R2 fix).
4. M-1 residual: Premium Home is in and structurally resolves the
   lobby overload; its in-tournament behavior gets its final live
   confirmation in the deploy-day smoke.
POLISH (from Claude's section-10 self-review and my walk; all R2):
bet chips touching at 360 px with 8–9 players; showdown cards covering
the top half of avatars (intended); layout shift when the hand-strength
box appears; splat/winner-stack misplacement if the window is resized
mid-animation; long industry names truncated on Home cards; demo tag
overlapping the industry icon (staging only); desktop text cards capped
at 820 px; 17 industry color tokens outside the base palette; tall hero
card for long tournament notes; hero name plate slightly overlapping
the corner of the hero's hole cards on the demo table (my walk).
NOT VERIFIED: real-device rendering (320/375/390, iPhone Safari,
Android Chrome); automated contrast check; scanner on a real phone;
cross-table chat isolation; Director tab live behavior with the RC
(my staging account is a player account; Director functions are covered
by `t_clubs`, `t_server`, and code review).

## 6. Conditions of GO (all five, before the merge to `main`)

1. **Owner acceptance, in writing**, of B5, B6, and the unverified
   cross-table chat isolation shipping as known issues in Release 1
   (fixes in Release 2) — or the release waits for the B6 fix and a
   re-audit.
2. **Pre-deployment database backup**: manual export of `gta-poker-db`
   created and downloaded in Render; time and file size recorded.
3. **OWNER_CODE rotated** on the production service before the deploy.
4. **Between-games window**: deploy only when no tournament is running
   AND none is registering with players; the owner confirms the window.
5. **Clubs stay CLOSED at deploy.** Opening them is a separate later
   owner action, gated on the F1 decision (section 4.3) and the
   real-device check.

Deploy-day monitoring (from the release checklist runbook): watch for
exactly one `lease epoch 1` claim and a boot line with N ≈ 944 keys
(the last production count) plus at most a few session keys; no
`store write failed`; no `fenced` on the new instance; capture the old
instance's logs 30+ minutes (G1); measure the switch window and 503s
from production request logs (G3); phone smoke (sign in, lobby,
leaderboard, Learn, Director tab, Business tab hidden for a member,
one demo-table hand); then a G2-method read-only production DB read
(persisted `lease.epoch` == 1, instance match, key count vs the ~944
expectation). Any failed check: rollback first (revert `main` to
`d00b592`), report second.

## 7. Required Claude fixes

For Release 1: **none.** No code change is required from Claude before
this deploy, and any code change from here re-freezes the candidate
under a new SHA and voids this verdict until re-audited.
For Release 2 (required, in priority order): B6 fix (revoke all
sessions on PIN change/resetOwner + per-source recovery rate limit);
chat isolation test + `t_server.js` de-flake (acceptance: 20
consecutive green `t_server` runs and the isolation test green);
F1 enforcement if the owner chooses it; B5 per the owner's policy;
375x667 table crowding; Business Report/Flag; moderation audit log +
re-report rules + hidden-cap fix; `/livez`; scanner device matrix;
scheduled breaks (owner-approved for R2); Google Fonts self-hosting.

— Muse (Marlowe), independent auditor. This report is the Release 1
verdict of record. Silence is not approval: deployment requires the
owner's explicit approval after this report, with the section 6
conditions met.
