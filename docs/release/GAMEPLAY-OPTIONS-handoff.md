# Table extras (show or muck, hand delay, rabbit hunt): handoff for Muse

Claude, 2026-10-18, overnight work order, Priority 3. Branch `gameplay-options`, built on `r2-hotfix` `fcabb5d` (R2 live `5c7ee11` plus the hotfix). Nothing has been deployed, merged to main or changed on Render.

## What to audit
- Design overview and gating: `GAMEPLAY-OPTIONS-design.md`.
- One spec per feature, each mapping Muse's Area 4 conditions to code and evidence:
  - `SPEC-show-cards.md`
  - `SPEC-hand-delay.md`
  - `SPEC-rabbit-hunt.md`
- Code:
  - `server/club.js`
  - `server/fair.js` (one line)
  - `server/index.js` (three lines)
  - `public/app.js`
  - `public/fair-verify.js` (one check)
  - `public/style.css`
- `server/engine.js` is untouched: `git diff fcabb5d -- server/engine.js` is empty.

## How "off" is guaranteed
1. **Server switch.** Without `GAMEPLAY_OPTIONS=1` (or `STAGING=1`), which is the production state:
   - the options are ignored and not stored;
   - the Director form has no fields;
   - the table view has exactly today's fields;
   - `show` messages do nothing;
   - fair records have no `rabbit` field.

   `t_extras.js` part 3 and `t_extras_ui.js` prove each of these.
2. **Per tournament.** With the switch on, every tournament still starts with all three off.

## Tests (run on the final head)
| Suite | Result |
|---|---|
| `npm test` (18 suites, now including `t_extras.js` and `t_extras_parity.js 300`) | exit 0. Rules 42/0; t_extras 27/0; parity 300/300 identical. |
| `t_sim.js 3000` (3,000 random-action + 3,000 AI tournaments; engine unchanged) | exit 0. Random-action: 30,369 hands, 0 problems. AI: 3,000 tournaments, average 143 hands, 0 problems. |
| `t_extras_parity.js 3000` (extras off vs on, identical seeds) | identical outcomes 3000/3000; identical public views 3000/3000; 2,764 rabbit hands checked against the seal; 12,829 show offers; problems 0 |
| Mutation checks on the parity test | show without the uid check: 168 problems (caught); rabbit without the burn: 10 problems (caught) |
| `t_extras_ui.js` (new, browser, 390px) | 12/0 |
| `t_premium_ui` | 295/0 |
| `t_mobile_ux` (72 checks), `t_table_small` (20), `t_welcome` (32) | passed |
| `t_clubs_closed` | 25/0 |
| `t_hotfix` | 39/0 |

Screenshots of the form, the show row, the rabbit cards and the spectator view were taken locally (`t_extras_ui.js <dir>`); they are not committed.

## Decisions for the owner
1. Turning the extras on anywhere outside staging needs `GAMEPLAY_OPTIONS=1` on the service, which means a restart in a no-game window, plus a deploy GO. Even then each tournament starts with them off.
2. Show Cards: only the winner of an uncontested pot can show (current). The alternative is to let folded players show too.
3. Rabbit hunt: shown automatically to the whole table (current). The alternative is to show it only when someone asks.
4. Hand delay: the value counts from the pot push to the next deal; showdowns keep at least today's 4.5 s result.
5. Show window: at least 2.5 s, even when the pause is set to 2 s.

## Limitations
- Chromium only; not tested in iPhone Safari.
- Show choices and rabbit cards are not written to hand history or coach notes. The fair report page doesn't list rabbit cards, though the verifier checks them.
- The client-only practice table has no extras.
- Offers in progress are lost on a server restart, as hands in progress already are.

## Rollback
- Unset `GAMEPLAY_OPTIONS`, or deploy without this branch.
- No data migration. The added keys (`showMuck`, `rabbit`, `handPause` on a tourney; `rabbit` on a fair record) are ignored by older code.
