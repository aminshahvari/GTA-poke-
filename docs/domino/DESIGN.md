# Blindrise Domino module: audit, design and plan

Branch `domino`, cut from production `ed83a5f`. The feature is off unless `DOMINO=1`. With it off, every domino API call returns 404, nothing is pushed, and no screen changes.

## 1. Architecture audit (what exists, and what domino reuses)

| Area | Where | What it means for domino |
|---|---|---|
| Storage | `server/store.js` | Every record is a key in an in-memory map, persisted to one Postgres table `kv(k text primary key, v jsonb)` (or a JSON file in dev/tests). Reads are synchronous. Postgres runs single-writer under a lease row with an epoch: a new deploy takes the lease, and the old instance stops writing (`lease lost ... 503`). Domino uses the same store. It adds no table, no column and no index. |
| Club isolation | `store.scoped(cid)` in `server/store.js:113`; contexts in `server/clubs.js` (`build`, `get`, `memberships`) | A club's code gets a store that prefixes its keys with `club:<id>:` and only shows its own members. Each club gets its own domino instance built with that scoped store (`makeDomino(s)` in `build`), so domino code cannot read another club's keys. |
| Authentication | `userByToken` / `session:` keys, `ctxFor(ur, x-club)` in `server/index.js:510` | Every POST resolves the club from the `x-club` header and only if the caller belongs to it (otherwise 403). Suspended clubs get 403. Domino routes go through this same path (`CLUB_API` → `clubApi`). |
| Roles | `isOwner(u)` = the member's role in *this* club (`server/index.js:46`) | The domino director is the club's owner. In the Blindrise club that is the founder. |
| Who may host | `hosts(c)` (`server/index.js`, owner decision of 2026-10-20) | Domino follows the same rule: create and start need `hosts(c)`. Clubs members open are practice-only unless the founder allows them. |
| Poker engine | `server/club.js`, `server/engine.js` | Domino never imports these. Its stats keys (`dom:stats:`) are separate. Poker scoring and rules are unchanged; the only shared-file edits are routing in `server/index.js` and one line in `server/clubs.js`. |
| Real time | One WebSocket per app (`/ws`, `hello` with token + club), `sendWS`, `broadcastClub` | Domino adds one message type, `{ t: 'domino', v }`. It is sent to the club's open sockets on every change, and in full on `hello` (reconnect). |
| Writes over HTTP | `POST /api/<name>`, JSON, rate limited per IP | Scorepad taps go over HTTP, not WS, because the client can retry on a lost answer and the request id makes the retry safe. |
| Production and staging | Production: `srv-db81l3eq1p3s7397u4s0`, auto-deploys `main`, `CLUB_SWITCHING=1`, own Postgres. Preview: `srv-db9u5ndg1s2s73a268hg` on branch `preview-premium-ui` with `STAGING=1`, a separate database and fake data. | Domino can run on Preview with `DOMINO=1` without touching production. Production gets the code only on the owner's GO, and with `DOMINO` unset the feature stays dark. |

## 2. Data layout and migration

All keys live inside the club's scope (stored as `club:<id>:dom:...` for clubs other than main):

| Key | Value |
|---|---|
| `dom:current` | id of the tournament the club shows |
| `dom:t:<tid>` | `{ id, name, rules, structure: elim\|pods, podSize, advance, playoff, tables, roundMin, status: registering\|running\|finished\|cancelled, entrants:[{uid,at}], teams:[{id,members}], matches:[{id,round,slot,teams,next,bye,pod}], pods, createdAt, startedAt, endedAt, by }` |
| `dom:m:<tid>-<place>` | the match record (`server/domino/match.js`): `{ id, tid, round, slot, sides:[[uid],[uid]], table, status, rules, events:[...], startedAt, endsAt, confirm, dispute, result, counted }` |
| `dom:stats:<uid>` | `{ played, won, lost, hands, points }`, domino only |
| `dom:log:<time>-<rand>` | director actions: create, teams, start, cancel, override (with reason). Written once, never changed. |

**Migration:** none. Every key is new and nothing existing is read or changed. On rollback, the code ignores the `dom:` keys and they stay in the database untouched; a later deploy picks them up again. A clean removal, if ever wanted, is a single `delete from kv where k like 'dom:%' or k like 'club:%:dom:%'`. Nobody runs that without the owner's word.

**Why not new SQL tables:** the store is single-writer and in memory, and every other feature uses it. A second persistence path would need its own fencing on deploy. The match record is small: a 150-point match is about 30–60 events.

## 3. API and WebSocket contracts

All calls are `POST /api/<name>` with `Authorization: Bearer <token>` and `x-club: <club id>`. They return 404 unless `DOMINO=1`. Errors are `{ error }` with status 400, 403, 404 or 409.

| Call | Who | Body | Result |
|---|---|---|---|
| `dominoState` | member | `{}` | view (below) |
| `dominoCreate` | director, club hosts | `{ name?, preset: allfives\|block\|draw, format: hu\|pairs, target?, blocked?: opponents\|difference, structure?: elim\|pods, podSize?, advance?: 0\|1\|2, tables: 1..50, roundMin?: 0\|20\|30\|45\|60 }` | view |
| `dominoJoin` / `dominoLeave` | member, while registering | `{}` | view |
| `dominoTeams` | director, partnership | `{ mode: random }` or `{ mode: manual, pairs: [[uid,uid],...] }` | view |
| `dominoStart` | director, club hosts | `{}` | view: teams, bracket or pods built, tables assigned, clocks started |
| `dominoCancel` | director | `{ reason? }` | view |
| `dominoOp` | players in the match, director | `{ mid, op }` (see below) | `{ match, dup }`; 409 `{ error, current }` when stale |
| `dominoLog` | director | `{}` | the last 100 log entries |

`op`, always with `opId` (8–64 chars `[A-Za-z0-9_-]`, unique per tap):

- `{ type: count, side, points, base }`: All Fives scoring play (5–60, step 5).
- `{ type: hand, end: domino, out: uid, pips: {uid: n}, base }` or `{ type: hand, end: blocked, pips, base }`.
- `{ type: undo, target: seq, base }` or `{ type: correct, target: seq, with: {count or hand facts}, base }`.
- `{ type: confirm }` or `{ type: dispute, reason }`: players, in review.
- `{ type: override, winner: 0|1, reason }`: director only, any time after the start.

Rules for every `op`:
- `base` is the event count the sender last saw. If it doesn't match, the server answers 409 with `current`, and the client re-reads.
- The same `opId` from the same person returns `{ dup: true }` and changes nothing.
- The same `opId` from someone else gets a 409.

**Push:** `{ t: 'domino', v }` goes to every open socket in the club on each change, and on `hello`. `v` contains:
- `now`, `owner`, `canHost` and `mine` (the reader's live match id);
- `stats` (the reader's domino stats);
- `t`: `{ id, name, rules, structure, status, tables, roundMin, entrants:[{uid,name}], registered, teams, matches:[match view], standings }`.

A match view carries `scores`, `hands` and `seq`, plus `events` (each with `worth`, or `undone`), `endsAt`, `timeUp`, `confirm`, `dispute`, `result` and `table`.

**Client contract:**
- Keep pending taps in memory with their `opId` and resend them after a reconnect.
- On 409, apply the pushed state and ask the person to tap again on the new score. Never silently resend with a new `base`.
- Show `endsAt` against `now` for the clock, never the phone's own time alone.

## 4. Policies (explicit)

- **Totals:** the server folds every score from the events. A total sent by a client is ignored (tested).
- **Concurrent edits:** two writes from the same view mean one wins and one gets 409 (tested over HTTP with simultaneous requests). The Node event loop applies writes one at a time, so a match record cannot be half-written.
- **Duplicates:** the per-tap `opId` makes retries safe. Bracket advancement is idempotent: the same winner twice is placed once. Stats are counted once per match (`counted` flag).
- **Undo and corrections:** nothing is deleted. Undo marks an entry, and a correction replaces one with the new facts. Both keep who did it and when.
- **Result verification:** reaching the target, or time with a leader, moves the match to *review*. Both sides confirm, and then it is *final*. Any score change in review goes back to *live* and clears confirmations. A side can *dispute* with a reason; the match then waits for the director. The director cannot confirm for players but can *override* with a reason at any time. The override is in the match record and in the director's log.
- **Changing a final result:** an override on a final match moves stats with it. It moves the bracket winner only if the next match has not started. If it has, the override is refused, and the director must reset that next match first.
- **Match time** (`roundMin`, 0 = untimed): the clock is server time (`endsAt`).
  - When it runs out, the hand in play finishes.
  - After a finished hand, the side ahead wins (to review).
  - If the score is level, they play another hand, and keep going until it isn't (sudden death).
  - The server checks every 5 s.
- **Pods into a playoff** (`advance`: 0, 1 or 2 per pod):
  - When every pod match is final, the top teams of each pod go into a knockout. Pod winners are seeded first, then the runners-up, and the better record seeds higher within each group.
  - Two teams from the same pod are kept apart in the first playoff round where a swap allows it.
  - If the director changes a pod result before any playoff hand is recorded, the playoff is drawn again. After that, a pod override is refused (409).
- **No-shows:** not automated. The director overrides with the reason "no-show".
- **Tables:** each live match holds one numbered table. Ready matches take free tables in round order. A player in a live match is never seated twice, and a match without a free table shows as waiting.

## 5. What is built (Phase 1, on `domino`)

| Item | Status |
|---|---|
| 1. Tournaments and registration | Built: create, join, leave, start, cancel |
| 2. All Fives, Block, Draw presets | Built, with fixtures (`docs/domino/RULES.md`) |
| 3. Heads-up and partnership | Built |
| 4. Teams and physical tables | Built: random or manual pairs; table allocation |
| 5. Mobile Smart Scorepad | Built: full-screen pad (`public/domino.js`), +points buttons, hand sheet with pips, undo, confirm and dispute; taps resent after a reconnect |
| 6. Append-only events, undo, corrections, idempotency | Built |
| 7. Real-time, server-authoritative | Built: WS push and full state on reconnect |
| 8. Dual verification, disputes, override, audit | Built |
| 9. Single elimination and round-robin pods | Built, including pods feeding a playoff |
| 10. Director controls and synced timers | Built: Director card (create, start, cancel, override, log); clocks from server `endsAt` |

Phase 2 (not started): networking profiles with privacy controls, overall club rankings built from placements (never from mixing raw poker and domino scores), sponsor display, read-only TV view and the Blindrise Open for dominoes. Built so far: pods feeding a playoff, club domino rankings (`test/t_domino_playoff.js`), and the director's read-only TV board (`test/ui/t_domino_ui.js`).

**Club rankings:** ranked by titles (tournaments won), then match wins, then win rate, then matches played. Titles are worked out from the stored results each time, so a director's override after the end moves the title. No points are invented, nothing is mixed with poker, and players who left the club are not shown.

## 6. Staging plan

1. Point Preview (`srv-db9u5ndg1s2s73a268hg`) at a branch with `domino` merged onto what it runs. Set `DOMINO=1` there only. Its database is separate and has fake data, and no real player data goes there.
2. Muse runs the acceptance list (section 8) against Preview and the branch's tests.
3. The owner plays a real table on Preview with phones (2 and 4 players) before any production GO.
4. Production: on the owner's GO naming the SHA, deploy with `DOMINO` **unset**, so the code is shipped but dark. Turning it on is a separate GO, by setting `DOMINO=1`.

## 7. Rollback

- **Code:** redeploy the previous SHA. The `dom:` keys stay, unused.
- **Feature:** unset `DOMINO`. Everything returns 404 and nothing shows. No restart is needed beyond Render's env redeploy, and no poker game is affected if it's done between games.

## 8. Acceptance tests

| Area | Where |
|---|---|
| Scoring fixtures, blocked hands, rounding, partnership scoring | `test/t_domino_engine.js` |
| Concurrent submissions (pure and over HTTP), duplicate taps, reconnect state | `t_domino_engine`, `t_domino` |
| Authorization: players only, director-only override and log, hosting rule, flag off | `t_domino` |
| Club isolation: another club's member gets 403; a match id from another club is not found there | `t_domino` |
| Verification, dispute, override, bracket advancement with tables | both |
| Poker regression | full `npm test` and the UI suite; poker view checked unchanged after a domino tournament (`t_domino`) |
| Mobile layouts | `test/ui/t_domino_ui.js` at 390x844 and 320x568: no sideways scroll, live update on the other phone, dual confirm |

## 9. Risks and recommendation

- **Rules variants:** house rules differ, for example blocked-hand scoring, targets and All Fives end rounding. The presets are configurable and documented, but the owner should confirm the defaults (`RULES.md`).
- **Physical-table trust:** the scorepad records what players enter. Dual confirmation and disputes catch disagreement, not collusion.
- **Legal:** same footing as poker: no money, no buy-ins, no prizes in the app. Hosting stays with Blindrise per the 2026-10-20 decision.
- **One process:** like poker, everything runs in one instance. A deploy during a live domino round restarts clocks from stored `endsAt` values, and the stored records survive.

**Recommendation: NO-GO for production enablement** until Muse PASSes and the owner has played on Preview. **GO** to continue on the branch and stage on Preview.
