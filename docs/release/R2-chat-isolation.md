# R2: cross-table chat isolation + t_server.js de-flake

Claude, 2026-10-17, branch `r2-chat` (from `r2-dev` @ 4b1650f). Local only: throwaway servers on free ports, temp data dirs, no DATABASE_URL, no production.

## Verdict

Cross-table chat isolation is now **VERIFIED** by a dedicated deterministic test, `test/t_chat.js` (added to `npm test` right after `t_server.js`).
No chat, throw or chat-log leak exists in the server. One minor per-table broadcast leak was found and fixed: the `closed` (table closed) notice went to **every** socket, including unauthenticated ones and sockets of members who were just signed out by a removal. Now only signed-in sockets get it (`server/index.js`, `onTableClosed`: `if(ws.user)`). Payload was only `{ t: 'closed', tid }` (tournament id + table number), so the exposure was small, but it reached people with no session.

## Delivery paths read (server/index.js, server/club.js)

| Message | Path | Who gets it |
|---|---|---|
| `chat` text and `throw` (tomato, egg, rose, … and tier perks) | `chat()` → `chatTo(tid)` | signed-in sockets seated at `tid` (live `club.tableOf`) or watching `tid` (`ws.watch`) |
| sender's table | `chat()` | `club.tableOf(sender)`; the owner, unseated, talks into the table they watch; a railbird gets "Sit at a table to chat." |
| throw target | `chat()` | must be seated at the sender's table, not the sender; else silently dropped |
| `chatlog` | `chatLogFor` on `hello` (own table) and `watch` | the requesting socket; log of that `tid` only; deleted when the table closes |
| `table` snapshot | `pushTable` | signed-in sockets seated there or watching it; hole cards only to the seated owner of them |
| `closed` | `onTableClosed` | **was: all sockets** → now signed-in sockets |
| `coach` | `onCoach` | that user's sockets only |
| reactions | — | none exist besides throwables |

Mute and chat-off are read from the store on every send. Removing a member deletes their sessions, nulls `ws.user` and closes their sockets with 4003; their old token then gets `auth: false`. Signing out in the app deletes the token and reloads, leaving a socket with no session.

Watching is by design: any member can rail any table (and hear its chat, without hole cards), including a player seated elsewhere. A moved player stops hearing the old table as soon as it is not their seat and not the table their client watches; `public/app.js` re-sends `watch` for the new seat when `club.myTable` changes (within the 60 ms club broadcast), and the test mimics exactly that.

## What t_chat.js proves

Owner + 17 players (6-max, 3 tables) + 3 railbirds + signed-out sockets. Each player has two sockets: a raw one that never watches (seat-only routing) and an app-like one that follows its seat like `app.js`. Determinism:

- every check runs with the tournament **paused** and seating read from the server (`/debug/chips` detail) until two reads match, never from a client's lagging `club.myTable`;
- after each send the sender does a round trip (`hands`), which proves the server handled the message and already wrote any broadcast to every socket; then **every** other socket does its own round trip (`hands`, or a refused message for a signed-out socket). Anything sent to a socket before that reply has arrived, so "got nothing" is proven, not timed;
- rate limits are paced per member; free port via `listen(0)`.

Checked, on every table, at start, after a rebalance and after a break:

- a chat line and an egg / tomato throw reach exactly once every socket seated at or watching the sender's table, and nothing else;
- nothing reaches players at other tables, players watching another table, railbirds of other tables, members in the lobby, the owner when not watching, removed members (seated and railbird) or signed-out sockets (no hello, bad token, removed member's old token, a player who signed out);
- throws at a player at another table, at yourself, or of an unknown item go nowhere;
- railbirds cannot chat; the owner chats only into the table being watched;
- `chatlog` on watch holds that table's lines only; a closed table's log is empty;
- mute: muted chat and throw get `chaterr` and reach nobody; unmuted chat works again;
- rebalance (busts at the short table, a player moved in from a full one) and break (busts at the biggest table until a table closes): the moved player hears the new table both ways (line from a new mate, own line, own throw), no longer hears the old table, and the app-like socket followed the seat;
- no socket ever gets a `table` snapshot for a table it is not seated at unless it watches it; hole cards only to the seated player; signed-out sockets never get `chat`, `chatlog`, `table`, `coach`, `club` or `closed`.

Mutation check (server edited by hand, then reverted): making `chatTo` send to every signed-in socket → 908 failures; letting a throw target any player → 16 failures; the old `closed` broadcast → 5 failures (signed-out sockets). Unmodified server: passes.

t_chat.js, 10 consecutive runs: 10/10 green, 13–23 s each, ~1,900–2,170 checks per run, 1–2 players moved by rebalance and 1–4 by break each run. A typical run:

```
chat test: 2030 checks, 2 moved by rebalance, 2 moved by break (t…-2), no-delivery proofs: owner not watching 45, player at another table 932, railbird of another table 151, signed-out socket 182, removed member 90, member in lobby 106
chat test passed
```

## t_server.js de-flake

| Flake | Cause | Fix (test only) |
|---|---|---|
| `throw not delivered` | the chat block picked the throw target from each client's `club.myTable`, which lags the server by the 60 ms club debounce, while hands kept running; a target busted or moved between the check and the send, so the server correctly dropped the throw. The guard compared two equally stale views. | pause the tournament for the chat block, take seating from the server once two reads match, resume afterwards (before late registration, which needs an unpaused clock) |
| `chat leaked to another table` / `not delivered to tablemates` (occasional) | same stale mates/others split | same |
| ECONNRESET / wrong server | `PORT = 3900 + random(90)` collided with servers other sessions run here, and the fixed `sleep(700)` could talk to a server not yet up (or someone else's) | free port via `net.listen(0)`, wait for `/healthz` while our child is alive, retry on a new port if it exited (EADDRINUSE); data file in a fresh temp dir, removed at exit; child killed on exit |
| assertions after fixed sleeps (create/join/start/late join) | timing under load | wait for the asserted condition (bounded), then assert |

No server change was needed for these; the server was right each time.

## Evidence: 20 consecutive `node test/t_server.js`

**20 / 20 green**, run sequentially on 4b1650f + this change (2026-10-17, started 05:21:50Z), on a machine where other sessions were running servers at the same time. Runtime 61–117 s each (median ~75 s; the tournament length is random). Per-run lines:

```
run 1 rc=0 77s | 23 players, max 4 tables, 0 hand-for-hand rounds, 2 tied, 267 chip checks, 562 actions, 72s, champion Friend 5 
run 2 rc=0 74s | 23 players, max 4 tables, 0 hand-for-hand rounds, 2 tied, 257 chip checks, 589 actions, 69s, champion Friend 8 
run 3 rc=0 66s | 23 players, max 3 tables, 0 hand-for-hand rounds, 5 tied, 224 chip checks, 598 actions, 61s, champion Friend 18 
run 4 rc=0 79s | 23 players, max 4 tables, 0 hand-for-hand rounds, 4 tied, 275 chip checks, 767 actions, 74s, champion Friend 9 
run 5 rc=0 64s | 23 players, max 3 tables, 0 hand-for-hand rounds, 12 tied, 221 chip checks, 500 actions, 60s, champion Friend 3 
run 6 rc=0 75s | 23 players, max 4 tables, 0 hand-for-hand rounds, 2 tied, 257 chip checks, 665 actions, 69s, champion Sean 
run 7 rc=0 75s | 23 players, max 3 tables, 0 hand-for-hand rounds, 9 tied, 266 chip checks, 493 actions, 71s, champion Friend 10 
run 8 rc=0 61s | 23 players, max 4 tables, 0 hand-for-hand rounds, 4 tied, 203 chip checks, 460 actions, 55s, champion Friend 11 
run 9 rc=0 76s | 23 players, max 3 tables, 0 hand-for-hand rounds, 5 tied, 264 chip checks, 577 actions, 71s, champion Friend 14 
run 10 rc=0 61s | 23 players, max 4 tables, 0 hand-for-hand rounds, 6 tied, 206 chip checks, 528 actions, 56s, champion Friend 1 
run 11 rc=0 117s | 23 players, max 3 tables, 0 hand-for-hand rounds, 11 tied, 425 chip checks, 628 actions, 113s, champion Friend 7 
run 12 rc=0 77s | 23 players, max 4 tables, 0 hand-for-hand rounds, 6 tied, 269 chip checks, 533 actions, 72s, champion Friend 9 
run 13 rc=0 76s | 23 players, max 4 tables, 0 hand-for-hand rounds, 3 tied, 263 chip checks, 489 actions, 71s, champion Friend 15 
run 14 rc=0 75s | 23 players, max 4 tables, 0 hand-for-hand rounds, 2 tied, 263 chip checks, 516 actions, 71s, champion Friend 1 
run 15 rc=0 74s | 23 players, max 3 tables, 0 hand-for-hand rounds, 10 tied, 259 chip checks, 448 actions, 70s, champion Friend 21 
run 16 rc=0 77s | 23 players, max 4 tables, 0 hand-for-hand rounds, 4 tied, 269 chip checks, 747 actions, 72s, champion Friend 11 
run 17 rc=0 76s | 23 players, max 4 tables, 0 hand-for-hand rounds, 7 tied, 261 chip checks, 510 actions, 70s, champion Sean 
run 18 rc=0 79s | 23 players, max 3 tables, 0 hand-for-hand rounds, 6 tied, 277 chip checks, 536 actions, 74s, champion Friend 8 
run 19 rc=0 75s | 23 players, max 3 tables, 0 hand-for-hand rounds, 7 tied, 263 chip checks, 509 actions, 71s, champion Friend 9 
run 20 rc=0 76s | 23 players, max 4 tables, 0 hand-for-hand rounds, 8 tied, 265 chip checks, 603 actions, 71s, champion Friend 14 
```

Each line ended with `server test passed`. Note: the single pre-change baseline run here took 34 s; post-change runs mostly took 55–75 s. The pause itself costs ~1–2 s; the rest is tournament length (hands played varies run to run) and was not investigated further [unverified cause].

## Full suite

`npm test` (with `t_chat.js` added after `t_server.js`): exit 0, every suite printed passed (evaluator, rules 42/0, sim, server, chat, coach, players, push, extra-time, security, business units, business club, opportunity club, clubs switch, csp + vendor).
