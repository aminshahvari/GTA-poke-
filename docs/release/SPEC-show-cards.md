# Spec: Show Cards (show or muck after an uncontested pot)

Branch `gameplay-options`. Off by default and not active in production; gating is in `GAMEPLAY-OPTIONS-design.md` §1. The tournament option is "Show or muck", stored as `showMuck`.

## Rule
- The offer is made only when a hand ends without showdown, that is, everyone else folded.
- Only the player left, the winner, is offered it.
- The choices are Show left, Show right, Show both or Muck. Doing nothing counts as Muck.
- One answer per hand: later answers are ignored.
- Showdown hands are unchanged: the club rule turns every hand at showdown face up. All-in hands are tabled during the run-out, as today.

## Muse conditions (overnight audit, Area 4) and how they are met
| Condition | Implementation | Evidence |
|---|---|---|
| Strictly opt-in by the card holder | `club.show(uid, msg)` accepts only the uid recorded as the winner (`tb.show.uid`). A non-winner is refused, and doing nothing shows nothing. | `t_extras.js`: loser requests ignored, a muck shows nothing. `t_extras_parity.js`: a non-winner's request is refused in 12,829 offers. |
| Never reveal another player's cards | `shownByChoice()` reveals only `p.cards` of the player whose uid is the winner's, and only the indexes they picked. | Parity test: no card is face up without today's reason or the holder's own pick, across 1,130,434 public views. A mutation that drops the uid check fails it, with 168 problems. |
| Not while the hand is live; post-hand (or all-in) only | The offer is created inside the `showdown` event, after `distribute()` has paid the pot. `show()` requires `h.result`, a matching hand number and an open window. All-in hands already show under today's rule. | `t_extras.js`: no offer and no extra face-up card before the result. Parity test: "extras visible before the result" 0 times. |
| Use the existing `shown` field of the public snapshot, no new channel | The chosen cards appear in `seats[i].shown`, the same field showdown uses: `[card, null]` for one card, both for both. The only new field is `showOffer: { uid, done }`, which names the winner (already public from the result line) and carries no cards. Nothing goes out by private message. | `club.js` `snapshot()`. Browser test: a spectator sees exactly one or both cards. |

## Timing
- The window is the time the result is up, at least 2.5 s.
- Outside hand-for-hand, a card shown near the end stays up for 2 more seconds.
- In hand-for-hand the window is fixed (no extension).
- The offer is cleared when the next hand starts.

## Edge cases
| Case | Behaviour |
|---|---|
| Winner away or disconnected | Counts as a muck. If they return inside the window they can still answer. |
| Split pot, side pots | Showdown only, so no offer. |
| Uncalled bet returned | It's an uncontested pot, so the offer applies. |
| Final table, heads-up | Same rule. |
| Spectators | See whatever the winner chose to show, like players do. |
| Restart during the window | The offer is lost (memory only). The hand result is as today. |

## Not covered (limitations)
- The choice isn't written to the player's hand history or coach notes.
- Folded players can't show. That is an owner decision.
