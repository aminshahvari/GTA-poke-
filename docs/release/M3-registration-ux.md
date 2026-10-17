# M-3: tournament registration UX — investigation (no logic changed)

Claude, 2026-10-17. Code read on `rc-2026-10-17` (`public/app.js` eventHTML ~297-320, `server/club.js` join/leave 75-85, `server/index.js` ws cases `join`/`leave`). Muse's M-3 screenshot was not available to me, so the screen Muse saw is matched to the states below by inference [A].

## Current intended behaviour

| Tournament state | Member registered? | What the card shows | Server rule |
|---|---|---|---|
| registering | no | **Join tournament** (primary) | `join`: adds to `regs` |
| registering | yes | "You're in. Your table opens by itself…" + reminder offer + a secondary **Leave** button | `leave`: removes from `regs`, only while `registering`; ignored otherwise |
| running | seated | **Go to my table** | — |
| running | out | "You finished Nth. You can still watch." | — |
| running | not playing, late reg open | **Join now** (late registration) | `join` → `lateJoin` |
| running | not playing, late reg closed | "You are not playing in this one. You can watch any table." | — |
| finished / cancelled | — | results / cancelled note | — |

Permissions: each member joins or leaves only themselves. The owner can also remove a registrant from the Director tab (× on the player chip) while registering. Nobody can unregister once the tournament is running: chips are already dealt, a player leaves by busting.

## Gaps that fit "no clear registration or cancellation control"

1. While registering, the cancel control is a plain secondary button labelled only **Leave**, with no confirmation, under the player list. Easy to miss, and "Leave" does not say what it leaves.
2. There is no "Registered" status at the top of the card; the only sign is a sentence under the buttons.
3. Running, registered but not yet at a table (the moment between seating/balancing and the next club update): the card falls through to "You are not playing in this one", which reads wrong for a registered player [A: brief window, not reproduced].

## Minimal safe improvement (UI only; needs the owner's OK before it is built)

- Rename **Leave** → **Cancel my registration**, ask for confirmation, keep it secondary.
- Add a green "You're registered" pill next to "Registration open".
- Running + registered + no table yet: show "Finding your seat…" instead of "not playing".

No server, registration or cancellation logic changes. Same `join`/`leave` messages.

## Regression risk

Low: text and one confirm dialog in `eventHTML`. Covered by a browser check of the four registering/running states; `t_server.js` exercises join/leave/late join unchanged.
