# Rabbit Hunt + Show Cards: staging candidate handoff (owner P0, 2026-10-19)

Branch `claude/rabbit-hunt-show-cards-w5t68a`. Code SHA **`49cca50`** (docs-only commits may sit above it).
Base: production `4423a07`. Nothing merged to main, nothing deployed to production, no Render setting changed.

## What it is
- `0a7d3e8`: the existing `gameplay-options` work (`e391f8d`, Muse PASS on branch, `aed6f2c` §2c) cherry-picked onto `4423a07`. Conflicts were only in `package.json` (test list), `public/style.css` (appended rules) and `server/index.js` (invite-privacy member filter kept, `tableExtras` flag added).
- `49cca50`: Show Cards widened to the owner's rule (below), tests updated, spec updated.

## Owner rules and where they are met
| Owner rule | How |
|---|---|
| Rabbit: only after the hand is officially finished | `rabbitCards()` runs in the `showdown` event after the pot is paid; the snapshot carries `rabbit` only when `result` exists. |
| Rabbit: never changes results, chips, hand history | Cards are sliced from a copy of the hand's committed deck (no RNG, `h.deck` untouched). Nothing reads `h.rabbit` except the public snapshot and the fair record. Parity: 3,000 tournaments on vs off, identical outcomes and identical public views apart from the extras' fields. |
| Rabbit: correct for all players | Sent in the same public table snapshot every player and spectator receives. Recorded in the fair record and checked by `fair-verify.js` against the seal. |
| Show: one or both cards, voluntarily, after the hand | Every player dealt in whose cards are still face down (folded players included; the winner of an uncontested pot) gets Show left / Show right / Show both; the uncontested winner also gets Muck. One card can be followed by the other. Nothing can be un-shown. |
| Show: others see it correctly | Chosen cards go out in `seats[i].shown`, the same field as showdown, to everyone at the table and spectators. |
| Show: never without consent | `club.show(uid, …)` acts only on the requester's own seat, only after the result, only for the current hand, only while the window is open, only for cards still face down. Parity test checks every public view: a card is face up only by today's rules or its holder's own pick. Mutation (another player's pick displayed) → 687 problems; mutation (face-up hand allowed to answer) → 1,136 problems. |

Rabbit rule detail: shown for hands that end on the flop or the turn; none for a hand that ends preflop (walks would show five cards every orbit). Hands that reach the river have nothing to hunt.

## How it is switched on (decision for the owner)
1. Server switch: `GAMEPLAY_OPTIONS=1` on the service (preview already has `STAGING=1`, which also enables it). Without it nothing is stored, offered or sent (t_extras part 3, t_extras_ui).
2. Per tournament: Director → new or edit tournament → "Show cards: Players may show", "Rabbit hunt: Show the unused cards". Default off. A tournament still in registration can be edited.
3. "Pause between hands" is also on the form (from the original work); leave it on Standard unless wanted.

## Tests on `49cca50`
Full run on a clean `49cca50` checkout (Chromium for the browser suites), all exit 0:
`npm test` (now incl. t_extras and parity 300); t_stability 220/0; t_table_layout 2304/0; t_positions 356/0; t_hotfix 42/0; t_premium_ui 296/0; t_clubs_closed 25/0; t_mobile_ux, t_table_small, t_welcome pass. `git diff 4423a07 49cca50 -- server/engine.js` is empty.

Targeted results:
- `t_extras.js` 28/0 (real server over WebSockets, folded players' shows reach the spectator, muck and repeat requests, chips conserved, fair report verifies incl. a forged rabbit card rejected; extras-off server has exactly today's fields).
- `t_extras_parity.js 3000`: 31,051 hands, 1,130,434 views; outcomes 3000/3000 and views 3000/3000 identical; 2,764 rabbit hands verified against the seal; 23,070 offers, 31,784 shows (24,027 by folded players); problems 0.
- `t_extras_ui.js` 13/0 at 390x844 and at 844x390 (`VP=844x390`).

## Limitations
- Chromium only here; iPhone Safari needs the owner's device test.
- Show choices and rabbit cards are not written to hand history or coach notes (by design: hand history is unchanged).
- An offer in progress is lost on a server restart, as hands in progress already are.
- The client-only practice table has no extras.

## Rollback
Unset `GAMEPLAY_OPTIONS` (or turn the options off in the tournament), or deploy without this branch. No data migration; added keys are ignored by older code.
