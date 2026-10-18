# Spec: Rabbit Hunt

Branch `gameplay-options`. Off by default in every tournament and not active in production; gating is in `GAMEPLAY-OPTIONS-design.md` §1. The tournament option is "Rabbit hunt", stored as `rabbit`.

## Rule
- When a hand ends without showdown on the flop or the turn, the table shows the turn and river (or just the river) that would have come.
- They appear faded, with a dashed gold edge, in the empty board slots, while the result is up.
- A hand that ends before the flop shows none.
- Everyone viewing the table sees them, spectators included.
- They are cosmetic: they decide nothing.

## Muse conditions (overnight audit, Area 4) and how they are met
| Condition | Implementation | Evidence |
|---|---|---|
| Only after the hand fully ends | `rabbitCards()` runs inside the `showdown` event, after `distribute()` has paid the pot. The snapshot carries `rabbit` only when a result exists. | `t_extras.js` and the parity test: rabbit never visible before the result. |
| Next cards of the committed, sealed deck, sliced: never re-drawn, never an RNG re-run | `rabbitCards(h)` copies `h.deck`, the deck from `fair.deckFrom(seed\|beacon\|table\|hand)` already committed for this hand. It then repeats the table's own dealing (burn, card) on the copy. No RNG is called and `h.deck` is not changed. | `t_extras.js` part 1: 300 decks, rabbit = `dealt(deck, n, 5).board` positions, deck untouched. Parity test: 2,764 rabbit hands checked against the deck rebuilt from the seed and the seal. A mutation that skips the burn fails it. |
| Verifies against the seal | The hand's fair record stores `rabbit` next to `board`. `public/fair-verify.js` checks it once the seed is revealed, after checking SHA-256(seed) = seal. | `t_extras.js`: the browser verifier accepts the real report and rejects one forged rabbit card. |
| Cosmetic only | Nothing reads `h.rabbit` except the snapshot and the fair record. Chips, pots, places and points are computed before it exists. | Parity test: 3,000 tournaments with the extras on vs off give identical outcomes (stacks, pots, boards, busts and places hashed per hand) and identical public views apart from the extras' own fields. |
| Off by default in tournaments | Stored only when the owner picks "Show the unused cards". The default is off, and the option exists only with the server switch. | `t_extras.js` part 3, `t_extras_ui.js` |

## Privacy
- Rabbit cards are cards nobody holds.
- They reveal nothing about anyone's hole cards beyond the removal effect.
- Each hand uses a fresh drand beacon, so they can't predict later hands.

## Not covered (limitations)
- Not in the player's hand history.
- The fair report page lists the board but not the rabbit cards; the verifier does check them.
