# Table redesign: a broader, better-balanced table on phones (handoff)

Claude, 2026-10-18, from Sean's overnight work order (Priority 2). Branch `table-redesign`, stacked on `mobile-stability`. **Not deployed, not merged.** This is presentation only. Game mechanics, the server, the engine and the Exchange/Business Club screens are unchanged: `git diff fcabb5d -- server package.json package-lock.json` is empty, and no Business/Opportunity file is touched. The navy rail with its gold edge and the green felt are kept as they were; only the shape and the placement change.

## What changed

**The felt on a phone held upright is broader and shorter.** It used to be capped at 1.6× as tall as wide and, in practice, ran 1.34–1.43× on 390–430 px phones: tall, narrow and empty in the middle. Now:

- The table tries a broad oval first (1.2×), then 1.3×, before it ever makes the seats smaller.
- The side seats sit on the rail's inner edge instead of its middle, so the felt gains about 36 px of width.
- If that crowds a full table, the layout tries the seats on the middle of the rail before it shrinks them.
- Whatever height is left over is shared above and below the table.

**Phones held sideways get a real landscape layout.** The table used to be squeezed into the 540 px column under the action bar: 532×200 px of room, with seats falling off the table and onto the board. Now:

- The table takes the whole width on the left, under a one-row header.
- The helper and the action bar stand in a column on the right.
- The raise panel opens in that column and never covers the table.

**Player positions for 2 to 9 seats** come from the same ring walk as before: you at the bottom, the others evenly spaced, with extra room beside your wider seat at 6 or more. The ring is now broader, so side seats are further from the board. Seats, chips and the dealer button never overlap at any phone size or table size tested (below).

**Readability and spacing:**

- The line under the board keeps one line on the felt (the winner).
- A finished hand's whole result is written in full in the bar under the table, where there is room. Before, a two-line result could run into the seats.
- Bets read in a short form above 10,000 (`12.5K`, `125K`, `1.23M`) so a big bet doesn't push the seats into smaller sizes. The exact amounts are on the Call/Raise buttons and the badges.

## Test: `test/ui/t_table_layout.js` (new)

The test covers 2 to 9 seated players, at 320x568, 375x667, 390x844, 393x852, 430x932 and 844x390 (landscape). Each case is your turn, with a raise, a call and a fold at the table. For each case it asserts that:

- the right number of seats is drawn;
- no seat (avatar, plate, badge, cards) overlaps another seat or the board;
- every seat is inside the screen and the table area;
- your cards are on screen and clear of the action bar;
- Fold, Call and Raise are on screen;
- the felt's height/width is between 0.95 and 1.42 upright, and at most 0.8 sideways.

| | Result |
|---|---|
| `table-redesign` | **288/0** |
| `fcabb5d` (live code, `ROOT=… REPORT=1`) | 265/23: the 430x932 felt is 1.43 tall, and at 844x390 seats overlap the board or fall outside the table area for every table size |

Felt size (px, width x height, and height/width) and seat size, before `fcabb5d` → after:

| Size | 2–8 players | 9 players |
|---|---|---|
| 320x568 | 235x285–243x298 (1.21–1.22) → 269x300–273x312 (1.11–1.14) | 243x298 → 273x312, small seats both |
| 375x667 | 292x302 (1.03) → 292x326–326x326 (1.00–1.12) | 300x316 → 330x338, small seats both |
| 390x844 | 301x403 (**1.34**) → **337x402 (1.19)**, normal seats | same |
| 393x852 | 304x411 (**1.35**) → **340x407 (1.20)**, normal seats | same |
| 430x932 | 342x490 (**1.43**) → **378x453 (1.20)**, normal seats | same |
| 844x390 | 462x120 (0.26), seats off the table → **460x263–468x275 (0.57–0.59)**, all seats on the table | same |

Seat sizes match the live code everywhere except two cases, which use the smallest seats where the live code used the middle size:

- 375x667 with 8 players;
- 320x568 with 5 players.

This comes from Stage 1's fixed room for the pot and the line under the board, which keeps the table still. Every other case uses the same size as before or a larger one; landscape 2, 4, 5 and 7 players are larger than before.

All other tests on this branch:

| Test | Result |
|---|---|
| `npm test` | pass |
| `t_stability` | 146/0 |
| `t_premium_ui` | 296/0 |
| `t_mobile_ux` | pass |
| `t_table_small` | pass |
| `t_clubs_closed` | 25/0 |
| `t_welcome` | pass |
| `t_hotfix` | 39/0 |

`t_stability.js` changed in one place: "your cards stay clear of the action bar" now checks overlap in both directions, because sideways the bar stands beside the table, not under it.

## Evidence

All of it is in `/mnt/project-files/blindrise/overnight/table-redesign/`:

- `contact-sheet.png`: before (live code) over after, for 2, 6 and 9 players at 390x844 and at 320x568;
- `contact-landscape.png`: 844x390, 6 players, before and after;
- `before/` and `after/`: the single screenshots (`<size>-<n>p.png`).

In the repository, `docs/evidence/table-redesign/before.log` and `after.log` hold the full `t_table_layout` output for every size and table size.

## Limits

- Only Chromium was available; WebKit was not downloaded. The shapes are computed by the page's own code from measured sizes, so Safari should match, but only a phone can confirm it. Use the iPhone steps in `MOBILE-STABILITY-handoff.md`, and also look at a full table and at the phone held sideways.
- Sideways, your cards still cover the top of your own name plate, as they did before.
- In the sideways layout the right column is 300 px or 36% of the screen, whichever is smaller. Very wide phones get a wider table, not a wider bar.
- No rule, number or text of the game changed, apart from the short form of large bets on the felt and the full result written in the bar.
