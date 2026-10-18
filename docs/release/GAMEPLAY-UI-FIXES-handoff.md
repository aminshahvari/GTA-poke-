# Gameplay UI fixes: dealer and blinds, total pot, stale pill, double tap

Branch `r2-int-gameplay-ui`, cut from `origin/r2-integration` (551d8ad). Client and tests only.
`git diff origin/r2-integration HEAD -- server package-lock.json` is empty.

This covers items 1, 3, 4.1 and 4.3 of the 17:01 UTC remediation plan. Item 2 (landscape layout, hero
cards), the helper label (4.2) and the demo banner are on the sibling branch and are not touched here.

## Item 1 (P0-3): do D, SB and BB render correctly?

**Classification: (a) for the reported screenshot, plus a separate (b) placement fix.**

### The screenshot: a correct deal that looked wrong (a)

- Ana had the button, Ben was SB (100, then folded) and Carla was BB (200).
- The hero called 200. Carla then raised to 500 on her option, so the hero faced 300 more.
- The hero's seat still showed its old CALL pill, which made the deal look out of order. Item 4.1 removes that pill.
- The centre said "Pot 150", which was the antes only. The real live pot was 950. Item 3 fixes that.

### The engine is correct (not c, not d)

- In `server/engine.js:142-153` (`setPositions`):
  - SB is `nextLive(btn)` and BB is `nextLive(sb)`.
  - Heads-up, the button posts SB and the other seat posts BB (line 146).
  - The dead-button rule follows from line 151.
- `server/engine.js:234-235` (`playHand`) posts the blinds and tags them `SB` / `BB`.
- The demo table loads the same file as `/engine.js`, so the demo deals the same way.
- The new test checks the demo's real hands from the DOM.

### The client seat order is correct

- `public/app.js:728` (`tableGeo`/`layout`) walks the seat ring clockwise from the bottom centre.
- `layoutOf` (`public/app.js:830`) maps seats in table order with the hero at position 0.
- On screen, seat order is therefore clockwise and matches `nextLive`. This was verified for every button position.

### Fixed client drawing bug (b)

- The D button or a blind's chips could land nearer to, or level with, a neighbouring seat than their own seat.
- This happened on 9-handed tables and on the seats either side of the hero, so the chips read as someone else's.
- Fixes in `public/app.js`:
  - **Line 770:** the hero's anchor is now the middle of the hero's cards and name plate together.
  - **Line 772:** `mine()` requires a placement to be clearly nearer its own seat (more than 1.12× + 3 px).
  - **Line 784:** the fallback in `place()` also respects that rule. It used to fall back to an unconstrained spot.

## Item 3 (P0-2): the centre pot shows the whole live pot

- `public/app.js:1157`: the pot now equals `d.pot` plus each in-hand seat's street bet.
- The snapshot's `pot` already leaves out the street bets (`server/club.js:484`). Adding them once gives the same total that the coach's pot odds use (`legal.pot = potTotal`).
- When the bets are swept in, they leave the seats as they join `d.pot`, so nothing is counted twice. The test covers this.

## Item 4.1: no stale pill on the seat whose turn it is

- `public/app.js:1201`: the acting seat shows no badge from its last action, and the gold ring marks it.
- Other seats keep their pills.
- Winner, hand-name and Away badges are unchanged.

## Item 4.3: one action per turn (double-tap lock)

- `public/app.js:1298-1310` (`sendAction`): the first tap disables every action button until the table state moves on.
- A second tap, or a pre-action racing the button, sends nothing.
- If nothing moves within 4 s (a lost message), the buttons come back for the same turn so the action can be sent again.
- The resend carries the same tid, hand and seq. The server's `act` takes only the first action for a turn and ignores duplicates (`server/club.js:260`).

## Tests

### New test: `test/ui/t_positions.js` — 356 ok, 0 failed (351 when the demo deals fewer distinct hands)

- **Configs:** 6-handed with the hero on seat 0 and on seat 4, 9-handed, and heads-up. Every button position is covered at 390×844 and 844×390.
- **Checks on each render:**
  - seats are drawn clockwise in seat order;
  - D, SB chips and BB chips sit clearly nearest their own seat;
  - the acting seat has no old pill, while a non-acting seat keeps its pill;
  - the centre pot equals pot + street bets;
  - when the bets are swept in, the pot is counted once.
- **Double tap:**
  - a triple tap sends one action;
  - the buttons are locked while it is sending;
  - after the 4 s timeout the buttons are back and the resend uses the same seq;
  - the next turn's action is sent.
- **Demo table** (the Director's demo at 844×390, at least 4 hands):
  - SB is next clockwise from D and BB is after it (heads-up variant included);
  - the blind chips sit nearest their blinds;
  - the pot equals antes plus chips.

### Regression

| Suite | Result |
| --- | --- |
| `npm test` | all pass |
| t_stability | 146 ok, 0 failed |
| t_table_layout | 432 ok, 0 failed |
| t_hotfix | 42 ok, 0 failed |
| t_premium_ui | 296 ok, 0 failed |
| t_mobile_ux | passed |
| t_table_small | passed |
| t_clubs_closed | 25 ok, 0 failed |
| t_welcome | passed |

These were run with the production font cache (`FONTS_DIR`), Playwright core and the bundled Chromium.

## Limits

- **Chromium only.** iOS Safari has not been checked on a device.
- **Flaky check under load.** With the test running several copies at once on a loaded machine, the check "BB chips nearest their seat" in 9-handed with the button on seat 8 failed once in 18 runs. It passed in every single run.
  - The test now waits for the layout to settle before measuring.
  - If that check fails, the test prints where everything was drawn.
- **The timeout resend relies on the server.** The re-enabled buttons after 4 s depend on the server ignoring a duplicate action for the same turn (it does today).
- **The demo checks read only the DOM.** The app is wrapped, so the test can't see the engine state directly.
