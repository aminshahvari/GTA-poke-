# 04. Phase 1 robustness tests and the regular test suite, now

Labels: **IMPLEMENTED**, **TESTED** (run now; output in `logs/`), **PROPOSED**, **NOT VERIFIED**.

## 1. `node test/phase1/run.js` at `a3c67e9` (TESTED now)

Full output: `logs/phase1-run.log` (HEAD `a3c67e9ab2ecb84c7e67c0de19ca7d418efd4b6d`, Node v22.22.0, 2026-10-16 19:39 UTC). Summary table as printed:

```
test                   | result | expected  | verdict          | secs   | reason
------------------------------------------------------------------------------------------------------------------------
db_failure             | PASS   | FAIL      | UNEXPECTED PASS  | 2.3    | state after db outage + restart is consistent
finish_crash           | PASS   | FAIL      | UNEXPECTED PASS  | 2.1    | result recorded exactly once in both crash points
sigterm_mid_hand       | PASS   | PASS      | ok               | 3.3    | state after SIGTERM + restart consistent
duplicate_actions      | PASS   | PASS      | ok               | 2.4    | 10 decisions, 20 duplicate sends + stale acts all ignored; points = history pts for all 5 members
two_instances          | PASS   | PASS      | ok               | 7.2    | only one instance dealt; state not clobbered
lease_fencing          | PASS   | PASS      | ok               | 0.9    | stale-epoch flush rolled back; old instance closed sockets (4001) and exited without writing
reconnect              | PASS   | PASS      | ok               | 1.3    | server re-sent turn (same seq, legal, deadline) and cards on reconnect; act on new socket applied
fair_after_interrupt   | FAIL   | FAIL      | known bug        | 1.9    | interrupted deal (hand 3, cards players saw before the crash) is not in the report; hand 3 has 1 record(s) with different cards
sessions_owner_reset   | FAIL   | FAIL      | known bug        | 1.1    | owner tokens from before resetOwner still valid (setup token=true, login token=true); removed member's open socket got 1 club broadcast(s) after removal (sees t

9 tests: 7 pass, 2 fail (2 expected), 0 unexpected failures
exit code: 0
```

Some `note:` lines printed by the older tests still cite line numbers from before B1 (for example `server/store.js:39-47` for "per-key async upserts"); those notes are static text in the test files from `96de056`, not live findings. The verdicts are what count.

## 2. The two failing tests

### 2.1 `fair_after_interrupt` (expected failure; batch **B5**)

**What the test does** (`test/phase1/t_fair_after_interrupt.js`): three players on a fake-Postgres server; on hand ≥ 3, after the flop, the server is killed with SIGKILL; a new server resumes; the tournament is played to the end; the published fair report is run through the browser verifier (`public/fair-verify.js`); it asserts that the hole cards players actually saw in the interrupted hand appear in the report.

**Output now:** `interrupted deal (hand 3, cards players saw before the crash) is not in the report; hand 3 has 1 record(s) with different cards`; verifier `sealOk=true ok=4 bad=0`.

**Why it fails (code read at `a3c67e9`, IMPLEMENTED behaviour):**
1. The deck for a hand comes from `fair.deckForHand` (`server/fair.js:46-52`), which mixes the tournament seed with a **fresh beacon value** fetched when the hand starts (`fetchBeacon`, or a local random value when the beacon is unavailable or `NO_BEACON` is set, `:47-49`). The record `rec` is kept on the table object (`tb.fairRec`, `server/club.js:214`).
2. The record is written to storage **only when the hand completes** (`fair.saveHand(...)` at `server/club.js:313`; `server/fair.js:55-58`).
3. A crash mid-hand loses `tb.fairRec`. On restart `resume()` rebuilds tables from `live`, which holds the stacks **at the start** of the hand and the same `handNo` (`server/club.js:148-163`, `:164-172`); the hand is replayed under the **same hand number** with a **new beacon**, therefore a **different deck** (note text at `server/club.js:157`).
4. Result: the report contains one record for hand 3 (the replay), all decks verify, but the cards players saw before the crash are in no record. A player who remembers their pre-crash cards cannot verify them.

**Fix batch:** **B5** "Fair records for replayed hands; verify page flags gaps" (status report section 7). Needs owner policy first (status report section 6 item 3: pause instead of server randomness when drand is down; seal before seating). NOT IMPLEMENTED.

**User impact.**
- Production `4d1be3b`: same behaviour (TESTED now, `logs/phase1-production-4d1be3b.log`: `fair_after_interrupt FAIL ... known bug`). Happens only when the server restarts during a hand (deploy, crash, Render restart). Chips are not affected (the hand is replayed from starting stacks); the fairness proof has a gap for the interrupted deal. No money is involved (free club).
- Staging `a3c67e9`: same. The B1 lease makes deploy restarts cleaner but does not change this; the ping-pong of `02-deploy-race.md` creates **more** interrupted hands per deploy, so more gaps.

### 2.2 `sessions_owner_reset` (expected failure; batches **B6** and **B7**)

**What the test does** (`test/phase1/t_sessions_owner_reset.js`, without `FAST`, so rate limits are live): (a) the owner signs up and signs in (two tokens), then uses `resetOwner` with the setup code; the old tokens must stop working; (b) a member with an open websocket is removed by the owner; that socket must get nothing more; (c) wrong `resetOwner` codes are rate limited, and it records what the real owner gets afterwards.

**Output now:** `owner tokens from before resetOwner still valid (setup token=true, login token=true); removed member's open socket got 1 club broadcast(s) after removal (sees tourney "After removal")`; notes: `wrong codes: statuses 400 ×10, 429, 429 (limited from attempt 11)`, `after the lockout the real owner with the correct code gets 429 ... anyone can lock the owner out of recovery for 10 min`.

**Why it fails (code read at `a3c67e9`):**
1. `resetOwner` changes the PIN and **adds** a session (`server/index.js:89-96`, `newSession` `:33`), but never deletes the owner's existing `session:*` keys. Sessions have no expiry (`userByToken` `:34-38` checks only that the session and user exist and the user is not removed). So a token stolen before the reset keeps working after it. → **B6** (server-side sign-out, PIN change ends sessions).
2. `remove` deletes the member's sessions and marks them removed (`server/index.js:408`) but does not close their open websocket. `broadcastClub` sends the full club view to **every socket with `ws.user` set** (`server/index.js:309-313`); it does not re-check `removed`. Only incoming messages re-check (`:361-362`). So a removed member's open tab keeps receiving the member list, tournament state, etc. until it disconnects. → **B7** (removed member gets nothing more).
3. (Not counted as a failure by the test, but recorded.) The per-account limit for `resetOwner` uses one shared key `acct:#owner` (`server/index.js:50`, checked at `:170-171`, recorded at `:174`): 10 wrong codes from anywhere lock the real owner out of recovery for 10 minutes. → **B6** (owner-reset lockout fix).

**User impact.**
- Production `4d1be3b`: same three behaviours (TESTED now, `logs/phase1-production-4d1be3b.log`). Practical risk is low in a small invite-only club, but: a lost or shared owner token cannot be revoked by a PIN reset; a removed member who keeps the app open still sees club updates (names, tournament) until they close it or the connection drops; a stranger who knows the site can block owner PIN recovery for 10 minutes at a time.
- Staging `a3c67e9`: same. Business Club and Opportunity Club data are **not** in the websocket view (HTTP only, which re-checks `removed` and returns 401: TESTED in `01-opportunity-acceptance.md` S6.8), so the leak is limited to poker club state.

## 3. `db_failure` and `finish_crash`: "UNEXPECTED PASS"

Both tests are marked `EXPECT_FAIL = true` (`test/phase1/t_db_failure.js:8`, `t_finish_crash.js:10`) and both pass at `a3c67e9`, so `run.js` prints "UNEXPECTED PASS" (`test/phase1/run.js` `verdict()`); it does not fail the run.

Why they pass, per `batch-report-b1.md` ("Note on db_failure / finish_crash") and confirmed by reading the code:
- B1 (`7b9a2eb`) made every flush **one transaction** (`server/store.js:59-81`), so `tourney`, `live` and `history:*` written in one synchronous step land together or not at all. That removes the partial-write states these tests detect.
- In the same commit the fake database (`test/phase1/pgstub.js`, changed in `7b9a2eb`: `git log -- test/phase1/pgstub.js` → `7b9a2eb`, `96de056`) was changed so a fault fires **after a whole commit is on disk** (`check()` `pgstub.js:56-65`, `commit` handling `:70`), matching real Postgres atomicity. A crash "between per-key writes" can no longer happen, so the tests cannot reproduce the old failure.
- The flags stay `EXPECT_FAIL = true` on purpose because B2/B3 still have open items not covered by those tests passing: rebuild a missing `history:` on boot, never add a second result row, health detail and a 50-run acceptance (status report section 7). Flip the flags when B2/B3 land.

On production `4d1be3b` both still FAIL (TESTED now, `logs/phase1-production-4d1be3b.log`): `db_failure` *in places AND seated with chips ... tourney.remaining=2 but 8 seated in live*; `finish_crash` *history for t... exists 0 times (tourney.status=finished)*.

Note on the production run: the same test files from `a3c67e9` were copied onto a temporary checkout of `4d1be3b`; tests that expect B1 report "REGRESSION" there (`sigterm_mid_hand`, `two_instances`) and `lease_fencing` errors because production has no lease row. That is expected: production does not have B1.

## 4. `npm test` now (TESTED)

| Run | When (UTC) | Result | Log |
|---|---|---|---|
| 1 | 19:39 | **exit 1**: `t_server.js` `FAIL table chat not delivered to tablemates` (the chain stops at the first failing file, so later files did not run) | `logs/npm-test.log` |
| 2 | 20:01 | **exit 0**: all 13 files passed (`evaluator`, 42 rules, sim, server, coach, players, push, extra-time, security, business units, business club, opportunity club, csp + vendor) | `logs/t_server-repeat.log` |
| 3 | 20:03 | **exit 0**: all 13 files passed | `logs/t_server-repeat.log` |

Summary lines of a passing run:
```
evaluator: all passed
42 passed, 0 failed
server test: 23 players, max 3 tables, 0 hand-for-hand rounds, 3 tied, 243 chip checks, 568 actions, 65s, champion Friend 22
server test passed
coach test passed
players test passed
push test passed
extra-time test passed
security test passed
business units passed (card parser, validators, staging seed)
business club test passed
opportunity club test passed
csp + vendor test passed
npm test exit: 0
```

## 5. `test/t_server.js` flaky history

`t_server.js` is a pre-existing, timing-sensitive test: a random 23-player tournament over websockets with fixed 100–300 ms sleeps between steps (`test/t_server.js:92-106` for the chat checks). Today's runs at `a3c67e9` (this package):

| Source | Runs | Passed | Failed | Failure messages |
|---|---|---|---|---|
| `npm test` run 1 (`logs/npm-test.log`) | 1 | 0 | 1 | `table chat not delivered to tablemates` |
| 8 standalone runs (`logs/t_server-repeat.log`) | 8 | 7 | 1 | `chat leaked to another table` |
| `npm test` runs 2–3 | 2 | 2 | 0 | |
| **Total at `a3c67e9`** | **11** | **9** | **2** | both in the table-chat block |

Earlier history (copied from `bc1-evidence/flaky-history.md`, see [`external/bc1-flaky-history.md`](external/bc1-flaky-history.md)): base without BC1 15/19 passed; BC1 branch 13/23 passed (this includes 3/3 full `npm test` runs at `7e946e3`). Cumulative across all recorded runs: **37 of 53** passed (28 of 42 before today, 9 of 11 today).

**Assessment (NOT VERIFIED as root cause).** Both failure messages come from the chat block, which decides who is a "tablemate" from each client's last received `club.myTable` (`test/t_server.js:93-94`). Club broadcasts are debounced by 60 ms (`server/index.js:309-313`) and players are moved between tables during balancing, so the test's grouping can be stale for a moment; the server decides delivery at send time from `club.tableOf()` (`server/index.js:280-282, 287`). A stale grouping explains both "not delivered to tablemates" and "leaked to another table" without a server bug. A real leak has not been shown; it is also not ruled out. PROPOSED: replace the fixed sleeps with "wait until" polling and compute tablemates from the server's table snapshot at send time.

## 6. How to re-run

```
node test/phase1/run.js                 # all 9; exit 0 when only expected failures fail
node test/phase1/run.js fair            # one test by name
npm test
for i in 1 2 3 4 5 6 7 8; do node test/t_server.js | tail -2; done
```
