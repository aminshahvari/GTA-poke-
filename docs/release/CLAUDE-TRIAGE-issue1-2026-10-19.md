# CLAUDE TRIAGE — GitHub Issue #1 (Gemini audit concerns)

**Date:** 2026-10-19 · **Author:** Claude (read-only technical triage) · **Code baseline:** production `main` = `4423a074e946c31b4aeccb7b4a0f4baa8c70fcdc` · **Gemini's baseline:** `5c7ee11587051102355ade13c3376a7a20f6c236`

Read-only. No code changed, nothing merged, nothing deployed, production/Render/secrets/real data not touched. Every run below used local temp data (`DATA_FILE` in a temp dir, or a throwaway local Postgres 16 cluster created and deleted for this triage). Evidence files: `docs/evidence/issue1-claude/`.

## Summary

| # | Concern | Classification | Severity (current prod `4423a07`) | Key evidence |
|---|---|---|---|---|
| 1 | Per-table concurrency / serialization / races | **Unsupported** as an active defect (one residual item *requires testing* on Render) | None open; residual Low | `club.js:245-267` exact tid/hand/seq waiter match; all state mutation is synchronous on one event loop; phase1 `duplicate_actions`, `two_instances` PASS; `t_server` 215 chip checks PASS |
| 2 | Persistence across Render restart/deploy | **Already fixed** (B1 lease/epoch fencing + P0 fenced husk); `data/` concern **unsupported** for production | None open; Low residuals | `store.js:30-43, 59-81`; `index.js:459-480`; real-Postgres handover probe A→B→C PASS 17/17; prod boot log `store: postgres, 1814 keys, lease epoch 2`, old instance `dirty:0` |
| 3 | WS reconnect restoration + hole-card privacy | **Unsupported** (no leak, restoration works); one **confirmed test gap** | None open; test gap Low | `club.js:470-496` (`snapshot`/`cardsFor`), `index.js:340-349` (`pushTable`); privacy probe 0 failures over 40k+ table messages incl. railbird + 260 mid-hand reconnects; `t_server.js:66` "shown early" assertion is dead code |
| 4 | Mobile viewport stability / visual regression | **Confirmed at `5c7ee11`, already fixed at `4423a07`** (Chromium); real-WebKit residual *requires testing* | Was High (members' iPhones); now Low residual | `t_stability` against `5c7ee11`: **126 ok / 94 FAIL** (felt moved 45 px, CLS 0.203); against `4423a07`: **220/0**; `t_table_layout` 2304/0 |
| 5 | Business Club / Opportunity Club completeness | **Partially confirmed**: core features built and tested, member access gated by an owner switch; listed follow-ups not built | Medium (product readiness, not a defect) | `index.js:119-127,188,400`; `server/business.js` (293 lines), `server/opportunity.js` (321), `public/business.js` (525), `public/opportunity.js` (407); `t_business`, `t_bizunit`, `t_opportunity`, `t_clubs` PASS; `R2-backlog.md` items 6, 8, 9 open |

What changed between Gemini's `5c7ee11` and production `4423a07`: 31 commits. Server: only the `invitedBy` filter in `clubView` (`server/index.js:285-287`). `store.js`, `club.js`, `engine.js`, `fair.js`, `business.js`, `opportunity.js` are byte-identical. The rest is `public/app.js`, `public/style.css`, `public/index.html` (layout/viewport) and UI tests. So concerns 1-3 and 5 apply the same to both SHAs; concern 4 is where they differ.

## Test runs (this triage, Node v22.22.0, at `4423a07`)

| Run | Result |
|---|---|
| `node test/t_server.js` | PASS: 23 players, 215 chip checks, 382 hands fair-verified |
| `node test/t_security.js` | PASS 3/3 reruns. The first run failed at "owner set up" (400). The test picks a fixed random port in 3990-3998 and waits a fixed 900 ms. Another session's servers were running on this machine, so this is a **test flake, not a product defect** (`t_server.js` already uses `freePort()` for this reason) |
| `t_chat`, `t_extra`, `t_business`, `t_opportunity`, `t_clubs`, `t_invite_privacy` (7/0), `t_bizunit` | all PASS |
| `node test/phase1/run.js` | **12/12 PASS** (db_failure, finish_crash, sigterm_mid_hand, duplicate_actions, two_instances, lease_fencing, lease_lost_stays_alive, restart_pingpong, sigterm_after_loss, reconnect, fair_after_interrupt, sessions_owner_reset) |
| `test/ui/t_stability.js` (Chromium 1194, Playwright) | **220 ok / 0 failed** |
| `test/ui/t_table_layout.js` | **2304 ok / 0 failed** |
| `t_stability.js` with `ROOT=` a `5c7ee11` checkout | **126 ok / 94 failed** |
| `probe_privacy.js` (new, evidence only) | 3 runs, 0 failures (details in §3) |
| `probe_pg_handover.js` (new, evidence only, real `pg` + local Postgres 16) | 17/17 ok (details in §2) |

---

## 1. Per-table concurrency, state serialization, race conditions

**Classification: unsupported as an active defect.** Severity: none open. One residual item (deploy overlap, below) is Low and *requires testing* on Render.

How the code serializes:
- The whole club runs on one Node event loop, in one process. Each table has one `loop(tb)` coroutine (`club.js:297-328`), and each waits on `E.playHand`. Every state mutation (`saveT`, `club.js:35`, `afterHand` `:333-355`, `balance` `:388-410`, `lateJoin` `:412-428`, owner WS controls `index.js:400-436`) is a synchronous read-modify-write with no `await` between the read and the write. So another table's coroutine or a WS handler cannot interleave inside it.
- Player decisions: `ask()` (`club.js:235-259`) registers one waiter per uid with `{tid, hand, seq}`. `act()` (`:260-267`) resolves only on an exact tid/hand/seq match, so duplicate, stale, out-of-turn and other-socket acts return `false`. A timeout deletes the waiter before any late act arrives (`:251`). `extend()` checks that `tb.acting.uid` is the caller (`:269-277`).
- Table breaking never moves players out of a table that is in a hand. `balance()` breaks the smallest table only if `!smallest.inHand`, otherwise it marks `toBreak` (`:396`). It moves players only from the table that just finished its hand (`:402-409`). A player seated into a destination mid-hand is not in `h.players`, so they are not dealt into the running hand (`engine.js:228-229` builds the hand roster at hand start).
- Broken or closed tables end their loop (`tb.broken` checked at `:299,301,308`). `stopAll()` (`:182-185`) resolves every waiter, and `shutdown()` calls `store.freeze()` synchronously right after (`index.js:463`). So hands that auto-complete after a stop cannot persist anything.
- Persistence batching: `store.set` marks keys dirty, and one `drain()` per tick writes all dirty keys in one transaction behind the lease check (`store.js:53-81`). A failed batch stays dirty and is retried. Writes made in one synchronous step land in the same batch.

Evidence: phase1 `duplicate_actions` PASS (20 duplicate sends and stale acts ignored; points match history). `two_instances` PASS (only one instance dealt). `t_server` PASS with 215 chip-conservation checks across 3 tables, breaks and late registration. The privacy probe (§3) checked that a player's own cards never change within a hand across 260 mid-hand reconnects.

Residual, **requires testing** (Low): during a deploy overlap the new instance resumes and starts dealing (`index.js:495`, `club.resume`) before clients have moved over. The old instance notices the lost lease on its next flush or 3 s heartbeat (`store.js:43,65`). Players who are still on the old socket can time out on the new instance and be marked `away` until their client reconnects and sends `back` (`app.js:115`, `club.js:278-280`). In the local probe, A fenced within the heartbeat window and every client was reseated on B with chips conserved. Act timers are 10-30 s, so the window is short. On Render it has never been measured (Muse/R1 gate G3). Not a chip-integrity issue: the interrupted hand is replayed from `live` start stacks (`club.js:148-173`) and voided in the fair record (`fair.js:63-65`).

## 2. Data persistence across Render restart / deploy

**Classification: already fixed** (single-writer lease + epoch fencing, and the P0 "fenced husk" behaviour). The `.gitignore data/` concern is **unsupported** for production. Severity: none open.

- `data/` is the **file-mode** path only: `store.js:44-48` (`DATA_FILE` or `data/club.json`) is used only when `DATABASE_URL` is unset (`store.js:31`). The README documents it (`README.md` env table). Production uses Postgres. The boot log quoted in the triage request, `store: postgres, 1814 keys, lease epoch 2`, is the exact line printed by `store.js:41`, so production is in Postgres mode.
- Postgres mode (`store.js:30-43`): it creates `kv`, then claims the lease (epoch + 1) in a transaction **before** loading state. Every flush (`:59-81`) locks the lease row `FOR UPDATE` and aborts with `lease lost` if the epoch is not ours. A lost lease is permanent (`lost = true`) and fires `onLost`.
- On lease loss `index.js:459-480` stops the game, freezes the store, closes sockets with 4001, answers 503 on `/healthz` and the API, and never reclaims. It exits only on SIGTERM, without a save (`:477`). On SIGTERM while holding the lease it saves (bounded 10 s) and exits.
- The prod log line `lease lost ... dirty:0` from the old instance means it had no unsaved keys when it was fenced. Nothing was dropped at that handover.
- `index.js:444-449` refuses to start staging if `DATABASE_URL` points at the production DB host.

Reproduction (real `server/store.js` with the real `pg` driver against a throwaway local Postgres 16, not production): `docs/evidence/issue1-claude/probe_pg_handover.js` → `probe_pg_handover.log`, **17/17 ok**:
- A runs a tournament (epoch 1, 156 rows). B boots on the same DB: epoch 2, resumes the running tournament.
- A fences: healthz 503, `leaseLost true`, logs `lease lost: epoch 2 held by B…`, closes every socket with 4001, API 503.
- All players reconnect to B, still seated. Accounts made on A sign in on B. Chips conserved: 80000/80000.
- The DB lease row stays with B (A never reclaims).
- SIGTERM to B gives `final save done … dirty:0`. C boots with `store: postgres, 248 keys, lease epoch 3`, owner signs in, tournament still running.
- The fenced A exits 0 on SIGTERM without saving.
- Note: A had `dirty 2` at the moment it was fenced in this probe. Those are writes for the in-flight hand made after B's claim. They are discarded **by design**, and B replays that hand from its start stacks. Production's `dirty:0` shows the same path with nothing to discard.

Low residuals (not defects in code):
- State kept only in memory is lost on any restart: table chat logs (`index.js:305`), login rate-limit counters (`:48`), the hand-for-hand round counter (`club.js:285`, recomputed on resume), and the current decision clock (the interrupted hand restarts).
- Render-side verification (staging handovers, health-check path, SIGTERM-to-503 behaviour) is Muse's open P0 verification backlog. Not re-run here because it needs Render access.
- Muse reports a production Postgres expiry of 2026-11-14. I did not verify it (no Render access), but if it is right it is the only hard persistence deadline.

## 3. WebSocket disconnect/reconnect restoration and hole-card privacy

**Classification: unsupported.** No leak found, and restoration works. **Confirmed test gap** (Low): the existing early-show assertion never runs.

Restoration:
- On `hello` the server authenticates, sends `club`, and, if the user is seated, calls `pushTable(mine)` (that player's own `you` cards plus the current `acting`/`seq`/`deadline`/`legal`) and the chat log (`index.js:380-386`). The deadline is not reset.
- The client re-sends `watch` and `back` on auth (`app.js:115`). `back` clears `away` (`club.js:278-280`). Close code 4001 reconnects in 0.25-1 s (`app.js:137`).
- Every later message re-checks that the session and user still exist (`index.js:388-389`).
- phase1 `reconnect` PASS: same seq, legal actions and deadline re-sent; an act on the new socket is applied.
- Muse's "no ack/nack" point is partly mitigated in `4423a07`. The client's one-action-per-turn lock (`app.js:1322-1333`, from `a6ecb98`) brings the buttons back after 4 s if the table has not moved, so an act lost in a dead socket can be re-sent. This was not in `5c7ee11`.

Privacy, by construction:
- Shared snapshot: a seat carries `shown` cards only when `p.shown && !p.folded` (`club.js:482`). `shown` is reset each hand (`engine.js:229`). It is set only (a) when at most one live player can still act after a betting round, i.e. all-in, hands tabled per TDA (`engine.js:249,259`), or (b) at showdown (`engine.js:265`).
- Private cards: `you` is `cardsFor(tid, uid)` for the requesting uid only, and only when that uid is seated at that table (`index.js:345-347`, `club.js:492-496`). Watchers (`watch`, `index.js:393`) get `you: null`.
- Hand history and coach copies keep other players' cards only if shown (`coach.js:85-88`). Coach messages go only to that uid (`index.js:364`).
- The fair report hides the seed and all deal records until the tournament is `finished`/`cancelled` (`fair.js:73-79`). `t_server.js:103` checks that the seed does not leak while running.

Reproduction: `docs/evidence/issue1-claude/probe_privacy.js`. Setup: 13 players at 6-max, plus an unregistered **railbird** that cycles `watch` across every table. A random player is `terminate()`d and reconnects mid-hand every ~0.5 s and then watches a different table. Every `table` message checks: `you` only to the seated owner of those cards, never to the railbird; any opponent's `shown` only when `result` is set or at most one live player can act (street ≥ flop); folded hands never shown; shown cards equal the cards that player was privately dealt. Three runs:
- `{"tableMsgs":32700,"watcherMsgs":2568,"shownMidHand":985,"shownAtResult":1801,"youMsgs":11933,"reconnects":61,"hands":142,"fails":0}`
- `{"tableMsgs":7663,…,"reconnects":14,"fails":0}`
- a 90 s run: `81607` table messages, `185` reconnects, `623` hands, `0` fails.

Findings to record:
- **Test gap (Low, confirmed):** `test/t_server.js:66` guards its "shown early" check with `tb.legal && tb.legal.canRaise === undefined`. `legal` always carries `canRaise` when present, so the check can never fail. The suite therefore has no working pre-showdown leak assertion. Recommend committing the probe's invariant as a test. Not done here (read-only).
- **Product note (Info, by design):** after a tournament ends, `fair.report` publishes every dealt hand, **including folded/mucked hole cards**, to any member who asks (`fair.js:56` snapshots all players' cards). This is needed for provable-fairness verification and is never pre-showdown. The owner should still know that mucked hands become visible after the event.
- **Info:** any signed-in member can rail any table (`index.js:393`), seeing public state only.

## 4. Mobile table viewport stability and visual regression

**Classification: confirmed at Gemini's `5c7ee11`; already fixed in production `4423a07`** under Chromium emulation. Real iOS Safari (WebKit) *requires testing*. There is no WebKit run in this repo or this triage. Severity: was High for members on phones; now a Low residual.

- Same current `t_stability.js` run against both trees: `5c7ee11` gives **126 ok / 94 FAIL**. At 320x568: opening the raise panel moves the felt 56 px, the felt moves 45 px through a hand, seats move 40 px, the table area height range is 44.6 px, layout shift is 0.203 (limit 0.01), and the Safari toolbar sliding in moves the table 91 px (`t_stability-at-5c7ee11.log`). `4423a07` gives **220 ok / 0 FAIL** (`t_stability.log`).
- `t_table_layout.js` at `4423a07`: **2304 ok / 0** (2-9 players × 21 portrait/landscape sizes, including safe-area insets). This matches Muse's 220/0 and 2304/0.
- Fix lineage: `a6ef217` (no jump/rescale mid-hand) → `8eee0a5` (stabilization RC) → `1cb2b89` (table redesign) → `330863f` (landscape hero overlap) → `958e7c0` (round-2 layout matrix) → `4423a07` (`settleTurn()` re-layout when iOS reports the rotated size late).
- Limits:
  - Chromium cannot emulate WebKit's `visualViewport` timing, toolbar behaviour or `env(safe-area-inset-*)`. The tests inject insets through CSS vars and simulate the late-size report.
  - The only WebKit evidence is the owner's iPhone acceptance of `4423a07`, as recorded in Muse's `MUSE-VERDICT-integration-4423a07-2026-10-18.md`. I did not verify it independently.
  - Not run here: `t_positions`, `t_premium_ui`, `t_hotfix`, `t_mobile_ux`, `t_table_small` (Muse reports them green).

## 5. Business Club and Opportunity Club feature completeness

**Classification: partially confirmed.** The core features are built, tested and wired into production code, but members can use them only when the owner turns them on. Several planned follow-ups are not built. Severity: Medium, as a product-readiness item rather than a defect.

**Live in code at `4423a07`:**
- Wiring: both APIs are mounted (`index.js:119-122`). Member access is gated by `clubsOn()` (`index.js:126-127`), which defaults to **off** in production (only `STAGING=1` or `CLUBS_DEFAULT=on` default it on). The owner switch is the WS message `clubs` (`index.js:400`). Members get 403 "Business Club opens soon." while it is closed (`index.js:188`). Logos are token-gated and noindex (`index.js:200-207`, `NOINDEX` on `/api/biz*`, `/api/opp*`).
- Business Club (`server/business.js:143-250`): profile save/publish/delete, directory list/search by category, detail view, feed, owner spotlight and moderation (hide), intro prompt. Contact details are opt-in per field (`:105-115`), logos are JPEG-validated (`:92-94`), saves are rate-limited (`:33-39`), and free text is checked by the contact-detail content rule (`server/content.js`, applied at `business.js:54`). Client: `public/business.js` (directory, editor, business-card **scan** via self-hosted Tesseract + `public/cardparse.js`).
- Opportunity Club (`server/opportunity.js:118-290`): "need help / can help" listings with expiry, close/delete, my listings, badge, contact **requests** with accept/decline and reply details, reports, and owner moderation. Content rule enforced server-side (`:60`), so backlog item F1 is implemented. Client: `public/opportunity.js`.
- Member removal also deletes their business profile and listings (`index.js:436`, `business.removeUser`, `opportunity.removeUser`). Staging-only demo data cannot appear in production (`business.js:276`, `opportunity.js:308`).
- Tests at `4423a07`: `t_business`, `t_bizunit`, `t_opportunity`, `t_clubs` PASS (this run); UI `t_bizsearch`, `t_clubs_closed` exist (not run here).

**Planned / not built** (from `docs/release/R2-backlog.md`, `R1-manifest.md`):
- Business Report/Flag (backlog 8; no `bizReport` in code).
- Moderation audit log, re-report rules, hidden-cap fix (9).
- Scanner real-device matrix: iPhone Safari / Android Chrome are NOT VERIFIED (6; `R1-manifest.md:23`).
- No push notification for Opportunity contact requests (there is no `push` call in `opportunity.js`).
- Multi-club (14), and the Gemini product proposals (Tablemates, Smart Club Lounge, AI Matching, VIP Invitations, Club Assist) (15). These are not started and are owner-decision items.

**Unverified (production state):** whether the owner has turned `settings.clubsOn` on in production, and whether the pre-open content audit (`R2-content-audit-procedure.md`, `scripts/content-audit.js --db`) has been run on current data. I did not read production, and I cannot classify "live for members" without that.

---

## Comparison with Muse's independent audit (`MUSE-AUDIT-issue1-gemini-triage-2026-10-18.md`, read after the classifications above were formed)

**Agreements:**
- P0 race not active.
- Production persistence not at risk from `data/`. Postgres lease/epoch fencing is the real store.
- Reconnect has no integrity issue, and hole cards reach a client only through `cardsFor` for the requester's uid.
- In-process concurrency is sound (tid/hand/seq waiter match). Both of us got phase1 12/12 independently.
- The mobile defect was real at `5c7ee11` and is fixed in the `4423a07` line (identical 220/0 and 2304/0 counts).
- Clubs are complete at code level, gated by the Director switch, and their production data/switch state is unverified.

**Differences and additions:**
1. **Production baseline.** Muse's audit (filed ~21:56 UTC) says "Production remains on `5c7ee11`". Per the triage request, production now runs `main = 4423a07` (boot at 21:54 UTC on 18 Oct, `lease epoch 2`). So concern 4's fix **is now in production**, not pending. The epoch-2 boot plus the old instance's `lease lost … dirty:0` is a real-world clean handover: one deploy, no unsaved keys. That is partial evidence toward Muse's open "staging handover never run" item, though not a substitute for the G3 timing and 503 measurement.
2. **New evidence Muse did not have:**
   - The handover reproduced against **real Postgres** with the real `pg` driver (Muse's and phase1's runs use `pgstub.js`, a file-backed fake pool).
   - A railbird plus mid-hand-reconnect privacy probe across 40k+ messages.
   - A same-test before/after run (`5c7ee11` 94 FAIL vs `4423a07` 0 FAIL).
3. **Test gap Muse did not report:** `t_server.js:66`'s early-show check is unreachable, so the "structural" privacy guarantee had no working regression test until a probe like the one here is committed.
4. **Ack/nack:** I agree it is backlog. `4423a07`'s client 4-second action-lock release (`app.js:1322-1333`) already lets a player re-send an act lost in a dead socket, so the user-facing impact is smaller than described at `5c7ee11`.
5. **Mucked-card disclosure** after a tournament ends (fair report): not mentioned by Muse. It is by design, but it is an owner-visibility item.
6. **`t_security.js` flake** (fixed random port and fixed sleep): a test-reliability item, not product.

No disagreement on any verdict. The P0, persistence and reconnect conclusions are the same.

## Recommendations (not authorized here; owner/Muse decide)
1. Commit the privacy invariant (railbird + reconnect + all-in tabling) as a regression test, and fix or remove `t_server.js:66`.
2. Make `t_security.js` use `freePort()` and a `/healthz` wait, like `t_server.js`.
3. Measure the deploy-overlap window on Render (G3): time from the new instance's first deal to the old instance's fence, and any `away` marks.
4. Before members rely on the clubs: confirm the `clubsOn` state, run the content audit on current data, and decide the scanner device pass and Business Report/Flag.
5. Owner: confirm the production Postgres plan expiry date reported by Muse.
