# Spec: Show Cards (players may show their own cards after the hand)

Branch `gameplay-options`. Off by default and not active in production; gating is in `GAMEPLAY-OPTIONS-design.md` §1. The tournament option is "Show cards" (stored as `showMuck`, the original name).

**2026-10-19 change (owner P0, branch `claude/rabbit-hunt-show-cards-w5t68a`):** the offer is no longer only for the winner of an uncontested pot. After every hand, every player who was dealt in and whose cards are still face down (folded players included) may show one card, the other, or both. The rows below describe the current rule.

## Rule
- The offer opens once the hand's result exists (the pot has been paid), on every hand, showdown or not.
- Who is offered: every player dealt into the hand whose cards are still face down. That is folded players, and the winner of a pot nobody called. Hands already face up under the club's rules (every hand at showdown, all-in run-outs) are not offered: there is nothing left to show.
- Choices: Show left, Show right, Show both. The winner of an uncontested pot also gets Muck. Doing nothing shows nothing.
- A player who showed one card may still show the other. Nothing can be hidden again once shown. Muck and Show both are final.
- Only the holder can show their own cards. A request from anyone else, for another hand, before the result, or after the window closes is ignored.

## Muse conditions (overnight audit, Area 4) and how they are met
| Condition | Implementation | Evidence |
|---|---|---|
| Strictly opt-in by the card holder | `club.show(uid, msg)` acts only on the requesting uid's own seat in that hand, and only if those cards are still face down (`canShow`). Anyone else is refused, and doing nothing shows nothing. | `t_extras.js`: requests from hands already face up ignored, a muck shows nothing. `t_extras_parity.js`: requests from someone not in the hand, from a face-up hand, for another hand, or after Muck/Show both are refused (see the handoff for counts). |
| Never reveal another player's cards | `shownByChoice()` reveals only `p.cards[j]` for the indexes stored under that same player's uid (`tb.show.picks[uid]`). | Parity test: no card is face up without today's reason or the holder's own pick, in every public view. Mutations (another player's pick shown; a face-up hand allowed to answer) both fail it (see the handoff). |
| Not while the hand is live; post-hand (or all-in) only | The offer is created inside the `showdown` event, after `distribute()` has paid the pot. `show()` requires `h.result`, a matching hand number and an open window. All-in hands already show under today's rule. | `t_extras.js`: no offer and no extra face-up card before the result. Parity test: "extras visible before the result" 0 times. |
| Use the existing `shown` field of the public snapshot, no new channel | The chosen cards appear in `seats[i].shown`, the same field showdown uses: `[card, null]` for one card, both for both. The only new field is `showOffer: { done, can }`: `can` lists the uids still able to show (who was dealt in is already public) and carries no cards. Nothing goes out by private message. | `club.js` `snapshot()`. Browser test: a spectator sees exactly one or both cards. |

## Timing
- The window is the time the result is up, at least 2.5 s.
- Outside hand-for-hand, a card shown near the end stays up for 2 more seconds.
- In hand-for-hand the window is fixed (no extension).
- The offer is cleared when the next hand starts.

## Edge cases
| Case | Behaviour |
|---|---|
| Folded player | May show after the result, like anyone else whose cards are face down. Before the result nothing of theirs is shown. |
| Player away or disconnected | Shows nothing. If they return inside the window they can still answer. |
| Split pot, side pots, showdown | Players at showdown are already face up; folded players at that table may still show. |
| Uncalled bet returned | It's an uncontested pot, so the offer applies. |
| Final table, heads-up | Same rule. |
| Spectators | See whatever each player chose to show, like players do. |
| Restart during the window | The offer is lost (memory only). The hand result is as today. |

## Not covered (limitations)
- The choice isn't written to the player's hand history or coach notes.
- Folded players can show (owner P0 request, 2026-10-19).
