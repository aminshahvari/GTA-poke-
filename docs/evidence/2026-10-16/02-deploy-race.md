# 02. Staging deploy race: lease "ping-pong" on October 16, 2026

Labels: **IMPLEMENTED** (in the code at the cited commit), **TESTED** (a test or script in this package ran and showed it), **PROPOSED** (design only, nothing built), **NOT VERIFIED** (inferred or could not be checked from this sandbox).
Code citations are `file:line` at staging tip `a3c67e9` unless another commit is named. Production is `main` at `4d1be3b`.

## 1. Summary

During the staging deploy of `5a5b7d9` (Opportunity Club merge) the single-writer lease from B1 (`7b9a2eb`) changed hands three times in about 23 seconds instead of once. No data was lost (every losing process had `dirty:0`), but each handover dropped every websocket and replayed any hand in progress. The next deploy (`a3c67e9`) had a single clean handover. The cause is a combination of (a) the server exiting when it loses the lease and (b) Render restarting that exited process inside the old instance while the overlap is still open; the restarted old process then claims a brand-new epoch, because claiming is unconditional. A local reproduction with the real store code shows the same pattern. The fix is **PROPOSED, NOT IMPLEMENTED**. Production (`4d1be3b`) has no lease at all, so it has the older, worse overlap problem instead.

## 2. Evidence: Render log lines

The sandbox cannot reach Render. These lines were **copied from Render logs by the coordinator** (staging service, UTC, October 16, 2026). They are quoted verbatim; the `...` inside them is the coordinator's abbreviation.

| Time (UTC) | Instance | Log line (verbatim) | Reading |
|---|---|---|---|
| 19:18:29.49 | `9mhp7` (new, deploy `5a5b7d9`) | `store: postgres, 65 keys, lease epoch 7 (...-hibernate-6dd5c78cb7-9mhp7:82)` | New instance claims the lease, epoch 6 → 7, pid 82 |
| 19:18:29.49 | `9mhp7` | `staging: seeded 5 fake demo opportunity listings` | New code adds 5 `opp:` keys + `oppDemoSeeded` (65 + 6 = 71 keys, matching the later boots) |
| 19:18:30.68 | `ckzdq` (old) | `store: lease lost: epoch 7 held by ...9mhp7:82, ours was 6` | Old process notices within one heartbeat |
| 19:18:30.68 | `ckzdq` | `final save skipped or incomplete {mode:postgres,epoch:6,leaseLost:true,dirty:0,lastWriteError:null}` | Old process exits with nothing unsaved |
| 19:18:43.36 | `ckzdq` | `store: postgres, 71 keys, lease epoch 8 (...-hibernate-6d7675c4d4-ckzdq:70)` | **Old instance's process restarted (pid 82 → 70) and claimed epoch 8** |
| 19:18:44.50 | `9mhp7` | `store: lease lost: epoch 8 held by ...ckzdq:70, ours was 7` | New process loses the lease to the restarted old one |
| 19:18:44.50 | `9mhp7` | `final save skipped or incomplete {...epoch:7,leaseLost:true,dirty:0...}` | New process exits, nothing unsaved |
| 19:18:52.48 | `9mhp7` | `store: postgres, 71 keys, lease epoch 9 (...-hibernate-6dd5c78cb7-9mhp7:64)` | **New instance's process restarted (pid 82 → 64) and claimed epoch 9**; stable afterwards |
| 19:26:12.15 | `tmlnm` (new, deploy `a3c67e9`) | `store: postgres, 71 keys, lease epoch 10` | Next deploy |
| 19:26:13.79 | `9mhp7` (old) | `shutting down: lease lost: epoch 10 held by ...tmlnm:82, ours was 9` | Old process stops |
| 19:26:13.79 | `9mhp7` | `final save skipped or incomplete {...epoch:9,...dirty:0...}` | Single clean handover |

The pid suffix in the instance string (`INSTANCE = (RENDER_INSTANCE_ID || os.hostname()) + ':' + process.pid`, `server/store.js:13`) changes from `:82` to `:70` for `ckzdq` and from `:82` to `:64` for `9mhp7` while the instance name stays the same. That is the evidence that a **new process started inside the same instance**, not a new instance. [TESTED by log reading; the Render-side reason for the restart is NOT VERIFIED]

Not in the captured lines: what happened to the restarted `ckzdq` process after 19:18:52 (it must have lost the lease to epoch 9 and stopped or been retired). NOT VERIFIED.

## 3. Root cause (code read at `a3c67e9`)

### 3.1 What B1 does (IMPLEMENTED in `7b9a2eb`, unchanged at `a3c67e9`)

| Step | Code |
|---|---|
| Boot: create the `kv` table, insert `lease = {epoch: 0}` if missing | `server/store.js:35-37` |
| Boot: **claim** the lease in one transaction: read the row `FOR UPDATE`, write `epoch + 1` with our instance id. No condition: any booting process always takes over | `server/store.js:28, 38` |
| Boot: then load every key into the in-memory `Map` | `server/store.js:39-41` |
| Heartbeat every 3 s (`BEAT_MS = 3000`) so an idle process notices a lost lease | `server/store.js:11, 43` |
| Every flush is one transaction: lock the lease row, compare epoch, write all dirty keys (and the heartbeat) or roll back | `server/store.js:59-71` |
| Epoch mismatch → `lost = true`, `onLost()` fires; no more writes ever | `server/store.js:65, 75` |
| `onLost` → `shutdown(message, leaseLost = true)` | `server/index.js:437` |
| `shutdown`: stop the game loops, freeze the store, skip the final save (lease lost), log `final save ...` with `store.health()`, close every socket with `4001 'server moved'`, close the HTTP server, **`process.exit(1)` after 300 ms** | `server/index.js:427-436` |
| SIGTERM / SIGINT → same shutdown, but with a final save (10 s cap) and exit code 0 | `server/index.js:431, 435, 438-439` |
| Boot order: `store.init()` (claims the lease) → staging seed → `club.resume()` → `server.listen()`; `/healthz` is 503 until `ready` | `server/index.js:441-457, 154` |

### 3.2 Why it ping-ponged

1. Render starts the new instance (`9mhp7`) while the old one (`ckzdq`) still runs (deploy overlap). The new process claims epoch 7 at boot (`store.js:38`). [IMPLEMENTED behaviour; TESTED locally]
2. The old process's next heartbeat fails the epoch check (`store.js:65`), it shuts down and calls `process.exit(1)` (`index.js:435`). [IMPLEMENTED; TESTED: `test/phase1/t_lease_fencing.js`, and `logs/race-repro-run.log`]
3. Render restarts the exited process inside the old instance, because that instance has not been retired yet (overlap still open). [inferred from the pid change; Render's restart policy for a process that exits during an overlap is NOT VERIFIED; whether exit code 0 instead of 1 would avoid the restart is also NOT VERIFIED]
4. The restarted **old** process runs `store.init()` like any fresh boot and claims epoch 8 unconditionally (`store.js:38`). Nothing checks whether the current holder is alive (fresh `at`) or running newer code. [IMPLEMENTED; TESTED locally]
5. The new process loses the lease (step 2 again, mirrored), exits, Render restarts it, it claims epoch 9. It settled because the old instance was eventually retired. [log evidence; NOT VERIFIED why exactly then]

Root cause in one sentence: **lease loss is handled by exiting, and a (re)started process always takes the lease, so a supervisor that restarts exited processes during the overlap turns one handover into several.**

Side effect worth noting: between 19:18:43 and about 19:18:52 the lease was held by the **old code** (the version before `5a5b7d9`, without Opportunity Club). Requests that reached it during that time were served by old code; `/api/opp*` does not exist there and would have answered 404. [inferred; NOT VERIFIED from logs]

### 3.3 Local reproduction (TESTED)

`scripts/race-repro.js` starts two real server processes on one fake Postgres (`test/phase1/pgstub.js`, which runs the real `server/store.js` Postgres code path), gives them the two instance names from the logs through `RENDER_INSTANCE_ID`, and plays Render's part with a tiny supervisor: during a 14 s "overlap" any process that exits is restarted in the same instance after 1.5 s; at the end the old instance gets SIGTERM and is not restarted. No app code is changed. Output (`logs/race-repro-run.log`, abbreviated; full output in the log):

```
  0.10s  OLD  boot pid ...: "store: postgres, 0 keys, lease epoch 1 (srv-hibernate-6d7675c4d4-ckzdq:...)"
  0.81s  NEW  boot pid ...: "store: postgres, 8 keys, lease epoch 2 (srv-hibernate-6dd5c78cb7-9mhp7:...)"
  3.39s  OLD  exit {"code":1} | shutting down: lease lost: epoch 2 held by ...9mhp7, ours was 1 | final save skipped or incomplete {...,"dirty":0,...}
  4.89s  OLD  supervisor restarts OLD in the same instance (restart #1)
  4.99s  OLD  boot pid ...: "store: postgres, 8 keys, lease epoch 3 (...ckzdq:...)"
  7.11s  NEW  exit {"code":1} | shutting down: lease lost: epoch 3 held by ...ckzdq, ours was 2 | ...
  8.70s  NEW  boot ... lease epoch 4
 11.29s  OLD  exit {"code":1} | ... lease lost: epoch 4 ...
 12.88s  OLD  boot ... lease epoch 5
 14.82s  OLD  end of overlap: supervisor sends SIGTERM to OLD and stops restarting it
 15.00s  NEW  exit {"code":1} | ... lease lost: epoch 5 ...
 16.59s  NEW  boot ... lease epoch 6        (stable)
 19.82s  cli  the member connected to the first OLD process was closed with code 4001 "server moved"
summary: lease epoch went from 1 to 6 (5 handovers for what should have been 1); restarts OLD=2 NEW=2
REPRODUCED: a restarted OLD process re-claimed the lease during the overlap (ping-pong).
```

The number of flips depends only on how long the overlap stays open and how fast the supervisor restarts; staging saw 3 handovers, the local run 5 (shorter restart delay).

One more detail from the local run: when the overlap ended, the restarted **OLD** process happened to hold the lease, so its SIGTERM shutdown did a normal final save (`final save done {"epoch":5,...}`) before NEW took over again. With real deploys that means **old code can be the last writer** before the new code settles. With identical data formats that is harmless; after a change in the stored format it would not be. TESTED locally; not observed on staging (the captured lines do not show it).

## 4. Where state lives (IMPLEMENTED, code read)

| What | Where | Survives a handover? |
|---|---|---|
| All durable club data (users, sessions, invites, tournament `tourney`, `live` snapshot, `history:*`, `fair:*`, `biz:*`, `opp:*`, `oppreq:*`, `oppreport:*`, `opplimit:*`, rewards ...) | In-memory `Map` (`server/store.js:14`), flushed to Postgres table `kv (k text primary key, v jsonb)` in single transactions guarded by the epoch (`server/store.js:59-81`) | Yes, if it was flushed. Each new process reloads all keys at boot (`store.js:39-40`) |
| Local file | Only when `DATABASE_URL` is not set (`server/store.js:44-48`): local dev and tests. On Render staging the logs say `store: postgres`, so there is no local file there | n/a on Render |
| The hand in progress | Not stored mid-hand. `live` holds the stacks as of the **start** of each table's current hand (`server/club.js:164-172`); on resume the hand is replayed from those stacks (`server/club.js:148-163`, note text at `:157`) | Replayed, not continued |
| Login / PIN rate-limit counters | `attempts` Map (`server/index.js:42-45`) | No (reset) |
| Websocket sessions, watchers | `sockets` Set (`server/index.js:203`) | No: closed with 4001 (`index.js:433`), the app reconnects |
| Table chat log and chat rate | `chatLogs`, `chatRate` (`server/index.js:279`) | No |
| Household/IP link cache, members view memo | `linkCache` (`index.js:216`), `memo` (`index.js:241`) | No (rebuilt) |
| Pending decisions and live tables | `tables`, `waiters` (`server/club.js:27-28`) | Rebuilt from `live` |
| Hand-for-hand state | `hfh = { on, round, done }` (`server/club.js:279`) | No: round restarts (listed for B8 in the status report) |
| Skill-question answers for prize claims | `pending` Map (`server/rewards.js:23`) | No (the member asks again) |
| Opportunity edit/report/reply rate limit | `writes` Map (`server/opportunity.js:37`) | No. The per-day listing and per-hour request limits are stored (`opplimit:<uid>`, `server/opportunity.js:43-49`) and survive |
| Business Club save rate limit | `saves` Map (`server/business.js:33`) | No |

## 5. What the October 16 ping-pong affected

| Effect | Status |
|---|---|
| Every connected member's websocket was closed (4001) at each of the 3 handovers; the app reconnects in about 1 s (batch report B1) | inferred from code (`index.js:433`); member-side experience NOT VERIFIED |
| Any hand in progress was replayed from its starting stacks at each handover | inferred from code (`club.js:148-172`); whether a tournament was running on staging at 19:18 is NOT VERIFIED (staging has fake members only) |
| Lost writes | **None indicated**: every losing process logged `dirty:0` and `lastWriteError:null`; stale-epoch flushes roll back by design (`store.js:63-75`) [log evidence + TESTED: `t_lease_fencing`] |
| Requests served by old code for about 9 s (19:18:43 to 19:18:52) | inferred; NOT VERIFIED |
| In-memory items reset 3 times (rate-limit counters, chat log, hand-for-hand round) | inferred from code |
| Window of up to one heartbeat (≤ 3 s) after a takeover where the losing process can still answer a request with 200 whose write is then rolled back | TESTED in `t_lease_fencing` (an invite created on the losing process got 200 and was not stored); not observed on staging (`dirty:0`) |

## 6. Production impact

Production `main` at `4d1be3b` has **no lease, no epoch, no transactions, no SIGTERM handler, and `/healthz` always returns 200**: `git show 4d1be3b:server/store.js` (59 lines) writes each dirty key with its own `insert ... on conflict` (`4d1be3b server/store.js:39-48`), and `4d1be3b server/index.js:143` answers `/healthz` with `{ ok: true }` unconditionally. [code read]

So production cannot ping-pong, but during every Render deploy overlap **both** old and new processes run the tournament and write the same rows. The phase-1 test suite run against production code in this package (`logs/phase1-production-4d1be3b.log`, TESTED now) shows:

- `two_instances` FAIL: *both instances dealt hands for the same tournament; persisted live.handNo went backwards 8 times (instances overwrite each other)*.
- `sigterm_mid_hand` FAIL: a bust shown to clients is not persisted; the busted player is seated again after restart.
- `db_failure`, `finish_crash` FAIL (non-transactional writes).

(In that run the verdict column says "REGRESSION" for tests that pass on staging; that only means "expected to pass with B1", which production does not have. `lease_fencing` errors because there is no lease row.)

Practical meaning: deploying to production while a tournament runs risks duplicated or rolled-back game state; the existing rule "deploy production only between games" stays essential. The ping-pong itself is a **staging-only** issue today, and must be fixed before B1 goes to production, or B1 would bring it there.

## 7. Fix status

**NOT IMPLEMENTED.** No app code was changed in this package (`git diff a3c67e9 -- . ':!docs'` is empty).

### 7.1 PROPOSED fix

1. **Never exit on lease loss.** In `shutdown(why, leaseLost = true)`: stop the game loops, freeze the store, close sockets with 4001, keep the HTTP server up but answer every request with 503 and `/healthz` 503, refuse websocket upgrades (or accept and close with 4001 immediately), and **never call `process.exit`**. Exit only on SIGTERM (exit 0). A process that is alive cannot be "restarted", so the supervisor never brings old code back.
2. **Never re-claim after losing.** A module flag (`lost`) already stops writes; keep it and make sure no code path calls `init()` again.
3. **Optional, defense in depth: refuse to claim a fresh lease held by newer code.** Store a deploy identifier in the lease row (`RENDER_GIT_COMMIT`, already read at `server/index.js:275`) plus the heartbeat time `at`. At boot, if the row's `at` is fresh (for example within 3 × `BEAT_MS`) and its commit is different from ours, and ours is known to be older (for example the lease row carries a monotonically increasing `deployedAt` from `RENDER_DEPLOY_ID`/start time, or a list of known commits), then do not claim: stay unready (503) and retry or exit 0. Caveat: "older" needs a reliable ordering; comparing git hashes alone cannot order commits, so this needs a deploy timestamp or a build number. Keep step 1 as the primary fix.
4. Keep the Render health check on `/healthz` so traffic only goes to the process that holds the lease.

### 7.2 PROPOSED test design

| Test | Setup | Pass condition |
|---|---|---|
| `lease_lost_stays_alive` | Two servers on `pgstub`; B takes the lease | A does **not** exit within 10 s; A's `/healthz` = 503 with `leaseLost:true`; every A API call = 503; A's sockets closed with 4001; A writes nothing (db unchanged except B's keys) |
| `restart_pingpong` (the repro above as a test) | Supervisor restarts exited processes during a 15 s overlap | Lease epoch increases exactly once (1 → 2); OLD restarts = 0 |
| `sigterm_after_loss` | After A lost the lease, send SIGTERM | A exits 0 within 1 s, with no final save |
| `no_claim_over_fresh_newer` (only if step 3 is built) | Lease row with a fresh `at` and a newer deploy marker; boot an older process | The older process stays 503, does not change the lease row |
| Regression | `test/phase1/run.js` | `two_instances`, `lease_fencing`, `sigterm_mid_hand` still PASS |

### 7.3 Risk of the fix

A process that lost the lease and stays alive holds memory until Render sends SIGTERM (bounded by the overlap). If Render never sends SIGTERM to a process that is alive but failing health checks, it could linger; to be checked on staging. NOT VERIFIED.

## 8. How to re-run

```
node docs/evidence/2026-10-16/scripts/race-repro.js            # 14 s overlap, 1.5 s restart delay
node docs/evidence/2026-10-16/scripts/race-repro.js 30 8000    # closer to staging's 8-13 s restart delay
node test/phase1/run.js lease                                  # existing lease_fencing test
```
