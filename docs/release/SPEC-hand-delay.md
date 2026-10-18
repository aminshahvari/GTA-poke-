# Spec: Hand delay (pause between hands)

Branch `gameplay-options`. Off by default and not active in production; gating is in `GAMEPLAY-OPTIONS-design.md` §1. The tournament option is "Pause between hands", stored as `handPause`, with values Standard (0), 2, 3, 4, 5 or 6 s.

## Rule
**The value is the time from the pot being pushed to the next deal, for a hand won without showdown.**
- The result stays up for X − 1.2 s, with a minimum of 0.8 s.
- After that the existing 1.2 s idle between hands runs, unchanged.
- Standard keeps today's 1.8 s + 1.2 s.

**Showdowns never get a shorter result than today's 4.5 s:** 2–5 s change nothing, and 6 s gives 4.8 s.

**When Show Cards is on,** an uncontested result stays up at least 2.5 s so the winner can choose.

The rule is the pure function `resultMs(setting, showdown, offer, base)` in `server/club.js`; `t_extras.js` tests every branch.

## Muse conditions (overnight audit, Area 4) and how they are met
| Condition | Implementation | Evidence |
|---|---|---|
| Server-driven | The wait happens in the server's table loop (`resultWait`). The client only renders what it is sent. | `club.js` `tableIO.event` |
| Identical for all tables in hand-for-hand | The setting is per tournament, not per table, and `resultMs` takes no table input. In hand-for-hand (`hfh.on`) the 2 s extension after a late show is turned off, so every table's wait follows the same fixed rule. Tables still wait for each other before the next round, as today. | `resultWait`: `hfh.on ? 0 : s.until` |
| No interaction with the action clock | The action clock (`ask()`, `actMs()`, extra-time cards) runs only while a player is acting. The pause runs only after the pot is awarded, when nobody is acting. | No change to `ask`, `extend` or `actMs` (diff) |
| No interaction with the level timer | Levels run on wall-clock time in `tick()`, which is unchanged. A longer pause means fewer hands per level, and blinds rise at the same times. | No change to `tick`, `pause` or `unpause` (diff) |

## Other interactions
| Area | Effect |
|---|---|
| Late registration | Closes at the end of a level, so it is unaffected. |
| Balancing and breaking tables | `afterHand` runs after the wait, in the same order as today. |
| Owner pause | The next deal still waits for unpause. |
| Disconnects | Unchanged. |
| Fair deal / drand | The beacon is fetched at the next deal. With 2 s, two hands may share a drand round (quicknet ticks every 3 s), and their decks still differ because the key includes the table and the hand number. |
