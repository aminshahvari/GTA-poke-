# R2: table crowding on short phones (iPhone SE class)

Claude, 2026-10-17, branch `r2-se` (from `r2-dev`). Visual/layout only: no gameplay, rule, points or server change.

## Finding

Auditor (MAJOR, visual): at 375x667 with 7 to 9 players the oval table is cramped. Bet chips touch the message line and overlap each other when most seats bet at once.

## Cause

Four things together. All are in `public/app.js` (`tableGeo`, `renderTable`) and `public/style.css`.

1. **The layout went stale on your turn.** `renderTable` worked out the geometry first and drew the action bar and hand helper after it. The table area then shrank by 150 to 250px and nothing laid the seats out again. The seats are placed in percent, so they squeezed together. The chips are placed in pixels, so they piled up. The raise panel shrank the area further without any relayout. At 320x568 the area went to 0px tall, and at 375x667 it went to 176px. The worst "before" shots show this: seats spilling over the helper.
2. **Guessed sizes.** The collision model used fixed box sizes: chip labels 62px wide, plates ±42px, no action badge under the plate, and the pot and message as fixed boxes. Real labels like `125,000` are about 74px wide. Compact plates were wider than modelled, and the badges hang about 10px lower. A layout that was "clean" on paper therefore overlapped on screen.
3. **Wasted room.** On phone widths, an area only slightly taller than wide got a short landscape felt, because of the 1.15 ratio switch, and left space empty. The board's centre column (pot, board, message) was centred as a whole, so a two-line message moved the board away from where the model put it.
4. **Too much chrome on short screens.** On your turn the header, the helper, the +30s row, the timer, the buttons and the raise panel together left too little for 9 seats.

## Fix

- **Relayout whenever the table area changes size.** A `ResizeObserver` on `#tableArea` covers the action bar, the raise panel and the helper. The layout also measures again once the web fonts have loaded. Recent layouts are cached by area size, so switching between Actions and Raise is instant.
- **Measured, not guessed.** `seatSizes()` measures hidden copies of a seat, your seat, a bet label (normal and small), and the dealer button in each look. It uses the widest case: a long name, 7-digit stacks, a `Raise 888,888` badge, and the widest bet at the table. The pot and message line are drawn first and measured as drawn. `.center` now keeps the board exactly where the layout puts it, with the pot above it and the message below.
- **Escalating looks.** The search stops at the first look where nothing touches:
  1. normal seats
  2. a squarer seat ring (seats pushed into the corners of the same oval felt)
  3. compact seats
  4. new `mini` seats: 26px avatars, 10px names, smaller chips, pot and button

  For each look it tries the board at its place or nudged ±10/20px, chips placed in three orders, and normal then smaller chip labels. Each chip and the dealer button must stay nearer their own seat than any other, so it stays clear whose chips they are. The button may sit just off the felt beside its seat. If nothing is clean, it searches the roomiest look that seats everyone for the fewest overlaps.
- **More room on phones (CSS only):**
  - The +30s button now shares one row with the timer bar.
  - At `max-height:700px`: a slimmer header, 50px action buttons, a tighter raise panel, and the "Raise to" amount line is hidden (the amount is on the Raise button).
  - At `max-height:860px`, while the raise panel is open: the helper and the header's second row (table, average stack, chat, lobby) step aside. Back brings them back.
  - At `max-height:600px` (iPhone SE 1st gen class): the helper becomes one row (advice plus % to win). On your turn the second header row steps aside, and the whole header does while the raise panel is open.
  - At `max-width:360px`: the five raise presets fit on one row.

Desktop: a full table with bets now uses normal seats on a slightly squarer ring. With fewer players, or when nothing overlaps, the layout is the same as before.

## Evidence

The new browser test is `test/ui/t_table_small.js`. It covers 9 and 7 players at 320x568, 375x667, 360x780, 390x844 and 1280x800 (desktop), and both your-turn panels (FOLD/CALL/RAISE and the raise slider). In every case:

- every seat has a bet
- the hand helper is on
- a two-line note sits under the board

It checks the bounding boxes of every chip, card, avatar, plate, badge, the dealer button, board, pot and message line for overlaps. It also checks that everything stays inside the table area, that every control is fully on screen, and that the page doesn't scroll.

```
PLAYWRIGHT=/opt/node-tools/node_modules/playwright CHROMIUM=/opt/pw-browsers/chromium node test/ui/t_table_small.js
```

- **Before (r2-dev code): fails 19 of 20 cases.** The worst is 320x568 with the raise panel open, where the table area is 0px tall and 291 overlaps are found. At 375x667, 9-handed: 21 overlaps (actions) and 91 (raise panel). Even desktop 1280x800 failed.
- **After: all 20 pass**, and repeated runs are stable. Table area after: 312x378 / 312x373 (320x568), 367x398 / 367x412 (375x667), 352x458 / 352x437 (360x780), 382x522 / 382x500 (390x844), 532x478 / 532x456 (desktop).
- `npm test` passes. In one of the runs, `t_server.js` failed once on "throw not delivered", a timing-dependent chat check in a server-only test that loads none of the changed files. It passed on rerun, both on this branch and on the unchanged code. `test/ui/t_registration.js` passes.
- Spot checks without a test: 2, 4, 6 and 9 players between hands and at showdown, watching (not seated), and the demo table at 320/375/1280. No overlaps and no page errors.

Screenshots (all 20 cases) are in `poker-club/reports/r2-screens/table-small/`: `before/` and `after/`, named `<viewport>-<players>p-<actions|sizing>.png`, plus `test-output-before.txt` and `test-output-after.txt`.

## Still needs a real iPhone

- **Measured in Chromium only (no WebKit here).** Safari's font metrics and `:has()` support matter. `:has()` needs iOS 15.4 or later. On older iOS the helper and header simply don't step aside: the table is smaller but the relayout still keeps it clean.
- **Safari's own toolbars.** In a browser tab (not added to the home screen), a 667px phone gives roughly 550 to 600px of page, and the SE 1st gen gives about 460px. The relayout follows the real height, but please look at an SE 2/3 in Safari with 9 players betting, both as a tab and from the home screen, with the raise panel open.
- **Notch and home-indicator safe areas** (`env(safe-area-inset-*)`) are not exercised in Chromium.
- **Speed.** The layout costs about 10 to 60ms on desktop Chromium; the hardest case is about 150ms at 320x568 with 9 players when no perfectly clean layout exists. It only runs when the area size, the widest bet's digit count, the pot's digit count or the note changes, and results are cached. It is worth feeling on an older iPhone.
- **Not changed (out of scope):** at showdown the winner's chip pile ("+24,000") can sit over the board on very small tables. That is the existing win animation, shown after the bets are gone.
