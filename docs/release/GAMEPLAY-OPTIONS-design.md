# Table extras: show or muck, pause between hands, rabbit hunt (design)

Branch `gameplay-options`, built on `r2-hotfix` `fcabb5d`. Not deployed and not active anywhere in production.

## 1. Gating (all off by default)

Two locks, both needed before anything changes:

1. **Server switch.** The extras exist only when the server runs with `GAMEPLAY_OPTIONS=1`, or `STAGING=1` (preview and local tests). Production has neither, so on production after a deploy:
   - `create`/`edit` ignore the three fields. Nothing is stored (the test reads the data file to prove it).
   - The club view has no `features.tableExtras`, and the Director form shows no extra fields.
   - Table snapshots carry exactly today's fields. A `show` message is ignored.
   - Fair records have no `rabbit` field.
2. **Per tournament.** With the switch on, each tournament still starts with all three off. The owner turns them on in Director's tournament form ("Show or muck", "Rabbit hunt", "Pause between hands"). A repeating tournament copies them to the next one.

The engine (`server/engine.js`) is untouched, so dealing, betting, pots, side pots, odd chips, payouts and points cannot change. All the new logic sits in `server/club.js` after `h.result` exists, which is after the engine has awarded the pot.

## 2–4. The three features

Each has its own spec, with Muse's Area 4 conditions mapped to code and evidence:
- `SPEC-show-cards.md`
- `SPEC-hand-delay.md`
- `SPEC-rabbit-hunt.md`

Independent fairness test: `test/t_extras_parity.js`. It plays the 3,000-tournament stress twice from identical seeds, with the extras off and on, through the club's real post-hand code and public snapshot. It checks:
- outcomes and chips are identical, and the public views are identical apart from the extras' own fields;
- no hole card leaks;
- the rabbit cards equal the sealed deck's next positions.

## 5. Edge cases

| Case | Behaviour |
|---|---|
| All-in run-out | The board always reaches 5 cards and the hand goes to showdown: no rabbit, no offer. Hands are tabled as today. |
| Split pot | Only happens at showdown: no offer, no rabbit. |
| Uncalled bet returned | It's the same uncontested pot: the offer and rabbit apply. |
| Winner disconnected or away | They get the offer but can't answer, so it counts as a muck. If they come back inside the window they can still show. |
| Winner busts in the same hand | Impossible: the winner just won chips. |
| Final table / heads-up | Same rules. |
| Table breaks right after the hand | `afterHand` runs after the window closes, so the offer ends before anyone is moved. |
| Spectators | See shown cards and rabbit cards; they never see hole cards nobody chose to show. |
| Coach / hand history | Unchanged. A show choice and rabbit cards are not added to the player's hand history (see limitations). |
| Practice table (client-only demo) | Unchanged: no extras. |

## 6. Files

| File | Change |
|---|---|
| `server/club.js` | Options parsed behind `GP()`; `resultExtras`, `resultWait`/`resultMs`, `rabbitCards`, `show`; snapshot fields only when present. |
| `server/fair.js` | Adds `rabbit` to the hand record only when present. |
| `server/index.js` | `show` message; tourney fields and `features.tableExtras` only when `GP()`. |
| `public/app.js` | Director fields and notes, the Show left / Show right / Show both / Muck row, faded rabbit cards, one-card show rendering. |
| `public/fair-verify.js` | Checks `rabbit` when present. |
| `public/style.css` | Styles for the rabbit cards and the show row. |
| `test/t_extras.js` | New test, added to `npm test`. |
| `test/ui/t_extras_ui.js` | New browser test. |
| `test/t_extras_parity.js` | New fairness/parity test (300 tournaments in `npm test`, 3,000 by argument). |
