# R2-B5: fairness record for a hand interrupted by a restart

## Problem
A fair record (`fair:<tourney>:<table>:<hand>:<at>`) was written only when a hand finished (server/club.js, after `E.playHand`).
After a crash/restart, `resume()` replays the hand in progress under the same hand number with a new beacon and deck,
so the cards players actually saw before the crash were in no record and could not be verified.
Reproduced by `test/phase1/t_fair_after_interrupt.js`.

## Policy chosen (owner default; can be changed)
- Gameplay, chips, hand replay and poker rules are **unchanged**. The interrupted hand is still replayed from its starting stacks under the same number.
- Only the fairness record changes: the deal is saved **at deal time** and on each new street, and the save is committed before the cards are sent (bounded wait of 1 s, so a slow or down database never stalls a table).
- On resume, any deal record still marked live is kept as its own record with `void: 'interrupted'`, next to the replayed hand's normal record.
- A record still live when the report is published for some other reason (a hand that threw, a mid-hand cancel) is shown as `void: 'unfinished'`.
- Void records verify exactly like normal ones (same key formula `seed|beacon|tid|hand`); they decided no chips.
- Old reports (no `void` field) verify exactly as before.

Alternatives the owner may prefer: give the replay a new hand number (changes the hand numbering players see); or not publish void deals at all (the earlier behaviour).

## What changed
- `server/fair.js`: `saveDeal()` writes the record with `live: true`; `saveHand()` overwrites the same key with the finished record; `voidLive(tourneyId)` turns live records into `void: 'interrupted'`; `report()` shows leftover live records as `void: 'unfinished'` and strips the internal `live` flag.
- `server/club.js`: `resume()` calls `fair.voidLive(t.id)` before rebuilding tables; `tableIO().event()` calls `fair.saveDeal` on `deal`/`board` events and awaits `store.flush()` (max 1 s) before publishing.
- `public/fair-verify.js`: counts void records (`out.void`); verification itself is unchanged.
- `public/app.js` (`showFair`): void records are labelled "Interrupted by a server restart — replayed" (or "Unfinished — no result"), plus a note with the count.
- `test/phase1/t_fair_after_interrupt.js`: asserts the policy; `EXPECT_FAIL = false`.

## Test evidence
- `node test/phase1/t_fair_after_interrupt.js` (3 runs in a row):
  `PASS fair_after_interrupt: report verifies, non-void hand numbers contiguous, interrupted deal recorded as void and verifies`
  `note: verifier: sealOk=true ok=8 bad=0 void=1 ...; killed on ... hand 3 after board 6s 4c Ad; restart replays it as hand 3 with a new deck; old deal kept as void`
- `node test/phase1/run.js`: 12 tests, 11 pass, 1 fail (1 expected: sessions_owner_reset), 0 unexpected failures.
  db_failure and finish_crash show UNEXPECTED PASS; they do the same on unmodified r2-dev (not caused by this change).
- `npm test`: exit 0, every suite passed (t_server passed on the first run).

## How to reproduce
```
npm ci
node test/phase1/t_fair_after_interrupt.js   # or: node test/phase1/run.js fair
```
The test kills the server (SIGKILL) after the flop of hand 3 or later, restarts it on the same store, finishes the tournament,
then runs the browser verifier on the published report. It checks that the deal players saw is present, verifies, carries
`void: 'interrupted'` with the board seen before the crash, that a replayed non-void record exists for that hand, and that
non-void hand numbers per table are 1..N with no gaps or duplicates.
