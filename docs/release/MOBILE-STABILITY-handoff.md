# Mobile stability: the table stops jumping on phones (handoff)

Claude, 2026-10-18, from Sean's overnight work order (Priority 1), extended by the owner's 04:04 directive and Muse's overnight audit (Area 2). Branch `mobile-stability`, based on `r2-hotfix` `fcabb5d` (live R2 `5c7ee11` + the Director invite-row fix + the members' practice card). **Not deployed, not merged.** Server, engine (`server/engine.js`) and game rules are unchanged: `git diff fcabb5d -- server package.json package-lock.json` is empty. Only `public/app.js`, `public/style.css`, `public/index.html` and a new test change.

## What players saw, and why (measured)

"Screen jumping and layout shifting during live gameplay" on iPhone. `test/ui/t_stability.js` drives one hand through the states a phone sees (my turn, turn off, a bet with its badge, my turn on the flop, fold, showdown, next hand) by writing table states into the page's own socket. At each step it records where the felt, the board and every seat's avatar are, and collects layout shift (PerformanceObserver `layout-shift`). It does this at 320x568, 375x667, 390x844, 393x852, 430x932 and 844x390, as a player and as a spectator. Before the fix, at `fcabb5d`:

1. **The table area changed height on every turn (main cause, players only).** The table is laid out for the room between the header and the bottom bar, and the bottom bar (the hand helper over the action bar) changed height whenever its contents did. It had the action bar on my turn, a waiting line with pre-action buttons otherwise, a helper with zero, one or two hint lines, or no helper after a fold. On phones of 600 px or less, the header's second row was also hidden on my turn. Each change resized the table area. A ResizeObserver then re-laid out the table, so the felt moved and rescaled and every seat moved: up to 78 px at 390x844, with a 78 px height range and CLS 0.05 to 0.20.
2. **The layout depended on the text in the middle of the felt (players and spectators).** The geometry cache key included the pot's text length and the message line's text. The solver also reserved room only for a pot or message that was currently showing, and sized the chip labels from the biggest bet so far. So the showdown text, a pot crossing a digit, or a big bet re-ran the layout, and seats and the board moved 5 to 30 px.
3. **A seat moved when its cards changed.** A seat is centred on its position, and its hole cards were part of its height. Dealing, folding or showing cards at showdown moved the avatar 5 to 7 px.
4. **The page followed every change of the browser window.** `html`, `body` and `.app` used `height:100%`, with no dvh/svh and no visualViewport handling. Safari's toolbar sliding in or out, or a keyboard, re-laid out the table mid-hand: 90 px when going from 390x844 to 390x754, as Muse measured. The short-phone sizes were `max-height` media queries, so they could also flip mid-hand.

## What changed

- **A fixed-height bottom dock** (`#dock` wraps the helper and the controls). `reserveDock()` measures hidden copies of the tallest normal states and sets their height; the copies follow the fonts and the size rules. The tallest states are your turn with the helper's hint, and the waiting line with the pre-action buttons. The helper and the controls each keep their own height inside the dock. The raise panel, the one taller state, grows upward over the bottom of the table instead of pushing it. The helper is hidden while that panel is open. Nothing is hidden on your turn any more.
- **A layout that holds for the whole hand.** The pot and the message line always get a fixed room: a six-digit pot and two lines of text. A longer message is cut to two lines, and the full text is its tooltip. Chip labels never read wider than `88,888`: bigger bets read `125K` and pots of a million or more read `1.23M`. The exact amounts stay on the Call/Raise buttons and badges.
- **Seats anchored by avatar and name plate.** The hole cards sit above the seat, outside the flow.
- **Viewport.** `html` and `body` use `100dvh` with a `100%` fallback. The table area's height is decided when a hand starts, or when the screen turns, from the room the screen has with the browser bars showing (`100svh`), and is then held for the hand. If the screen still gets shorter mid-hand, the felt keeps its size and the dock stays at the bottom of the screen, over the table's lower edge, until the next hand. The short-screen sizes (`h700`, `h600`) are now classes set at the same moment, which replaced the media queries. They keep the same rules and the same specificity, through `:where()`.
- **The shortest screens (height 600 px or less: iPhone SE 1st gen, phones held sideways)** have a one-row header. The chat and Lobby buttons sit beside the clock, and the ante takes the second line in place of the next level. The table name, average stack and rank row is not shown there (it was hidden on your turn before). This gives the felt that row's room for the whole game.
- **Keyboard.** With the chat box focused, the chat sheet is kept above the keyboard with `visualViewport`, and its height is at least 190 px so the message box is never cut off. When the box loses focus, the page is scrolled back to the top if iOS left it scrolled. None of this re-lays out the table.
- **Fewer rebuilds.** Seats, chips and the dealer button are redrawn only when their own HTML changes (`patchKids`), so avatars and animations don't flicker on every update.
- **Helper.** It shows one hint: your turn's advice, otherwise a draw. That hint takes two lines at most, or one on short screens.

## Numbers (Chromium, phone emulation with touch, real fonts)

Movement over one hand, the largest across every step (before `fcabb5d` → after):

| Size, role | felt (px) | board (px) | seats (px) | table area height range (px) | CLS |
|---|---|---|---|---|---|
| 320x568 player | 45.0 → **0.0** | 39.5 → **0.0** | 40.1 → **0.0** | 44.6 → **0.0** | 0.2030 → **0.0000** |
| 320x568 spectator | 0.0 → **0.0** | 0.0 → **0.0** | 5.1 → **0.0** | 0.0 → **0.0** | 0.0000 → **0.0000** |
| 375x667 player | 59.9 → **0.0** | 45.8 → **0.0** | 74.7 → **0.0** | 77.9 → **0.0** | 0.1463 → **0.0000** |
| 375x667 spectator | 0.0 → **0.0** | 30.0 → **0.0** | 17.2 → **0.0** | 0.0 → **0.0** | 0.0050 → **0.0000** |
| 390x844 player | 77.8 → **0.0** | 39.5 → **0.0** | 78.6 → **0.0** | 78.5 → **0.0** | 0.0513 → **0.0000** |
| 390x844 spectator | 0.0 → **0.0** | 10.0 → **0.0** | 6.2 → **0.0** | 0.0 → **0.0** | 0.0008 → **0.0000** |
| 393x852 player | 74.6 → **0.0** | 39.5 → **0.0** | 76.4 → **0.0** | 78.5 → **0.0** | 0.0159 → **0.0000** |
| 393x852 spectator | 0.0 → **0.0** | 10.0 → **0.0** | 6.2 → **0.0** | 0.0 → **0.0** | 0.0008 → **0.0000** |
| 430x932 player | 56.8 → **0.0** | 39.5 → **0.0** | 67.5 → **0.0** | 78.5 → **0.0** | 0.0745 → **0.0000** |
| 430x932 spectator | 0.0 → **0.0** | 0.0 → **0.0** | 6.2 → **0.0** | 0.0 → **0.0** | 0.0000 → **0.0000** |
| 844x390 player | 39.5 → **0.0** | 49.5 → **0.0** | 46.2 → **0.0** | 44.6 → **0.0** | 0.1188 → **0.0000** |
| 844x390 spectator | 0.0 → **0.0** | 10.0 → **0.0** | 6.7 → **0.0** | 0.0 → **0.0** | 0.0007 → **0.0000** |

Mid-hand viewport changes for a seated player: the largest movement of the felt, board and seats against the same hand before the change (before → after).

- **Toolbar in:** the screen gets 90 px shorter.
- **Toolbar hidden:** the screen gets 80 px taller.
- **Rotate and back:** portrait, then landscape, then portrait again.
- **Keyboard:** chat focused and the screen 300 px shorter.

| Size | toolbar in | toolbar out again | toolbar hidden | rotate and back | keyboard open | keyboard closed |
|---|---|---|---|---|---|---|
| 320x568 | 91.0 → **0.0** | 0.0 → **0.0** | 60.5 → **0.0** | 0.0 → **0.0** | 215.6 → **0.0** | 0.0 → **0.0** |
| 375x667 | 67.3 → **0.0** | 0.0 → **0.0** | 43.7 → **0.0** | 0.0 → **0.0** | 240.6 → **0.0** | 0.0 → **0.0** |
| 390x844 | 90.0 → **0.0** | 0.0 → **0.0** | 67.5 → **0.0** | 0.0 → **0.0** | 241.7 → **0.0** | 0.0 → **0.0** |
| 393x852 | 90.0 → **0.0** | 0.0 → **0.0** | 65.8 → **0.0** | 0.0 → **0.0** | 242.0 → **0.0** | 0.0 → **0.0** |
| 430x932 | 90.0 → **0.0** | 0.0 → **0.0** | 56.9 → **0.0** | 0.0 → **0.0** | 262.7 → **0.0** | 0.0 → **0.0** |

The same matrix also asserts several things after the fix:

- the action buttons stay on the shortened screen;
- the landscape table fits, with every seat and the buttons on screen;
- the chat box is on screen with the keyboard open;
- the action buttons are reachable on the short screen once the chat is closed;
- the page is not left scrolled.

Room for the table (table area height, px), before (smallest to largest during a hand) → after (constant):

| Size | 320x568 | 375x667 | 390x844 | 393x852 | 430x932 | 844x390 |
|---|---|---|---|---|---|---|
| Room | 333–378 → **375** | 398–476 → **399** | 518–596 → **516** | 526–604 → **524** | 606–684 → **604** | 155–200 → **197** |

The held size equals the old "your turn" size, which is the size players saw when it mattered. The space that used to open up after a fold now stays empty under the table.

## Tests (all on `mobile-stability`)

| Test | Result | Baseline at `fcabb5d` |
|---|---|---|
| `npm test` | pass | pass |
| `t_stability` (new) | **146/0** | 84/62 (`REPORT=1`, same file) |
| `t_premium_ui` | 296/0 | 295/0 (the Lobby button is now on screen during your turn at 320x568, so it checks one more step) |
| `t_mobile_ux` | pass | pass |
| `t_table_small` | pass | pass |
| `t_clubs_closed` | 25/0 | 25/0 |
| `t_welcome` | pass | pass |
| `t_hotfix` | 43/0 | 39/0 (the count depends on what the probe finds; all pass) |

`t_mobile_ux` failed once in one full run, in its Business directory part ("6 businesses -> 6", then a strict-mode locator error on "Share contact"). It passed on the rerun and on `fcabb5d`. That part never opens the table, and nothing in this change touches Business.

Run: `PLAYWRIGHT=/opt/node-tools/node_modules/playwright-core NODE_PATH=/opt/node-tools/node_modules CHROMIUM=/opt/pw-browsers/chromium node test/ui/t_stability.js` (`ROOT=<checkout> REPORT=1` for "before" numbers, `JSON=`, `SHOTS=`, `ONLY=390x844`).

Evidence is in `docs/evidence/mobile-stability/`:

- `before.log` / `after.log`: the full test output;
- `before.json` / `after.json`: every measurement;
- `contact-390x844.jpg` and `contact-320x568.jpg`: every step of the hand, before over after.

## Limits

- **Only Chromium was available.** WebKit was not downloaded, as instructed. Safari's toolbar and keyboard are emulated by resizing the page, which is what Android Chrome does. iOS Safari instead changes the visual viewport without resizing the layout, which this design ignores on purpose, so it should be at least as stable there. Only a real iPhone can confirm it (steps below).
- **The first hand after the page loads** can be re-laid out once, by a pixel or a few, when the web fonts arrive after the table was first drawn. This is the only re-layout inside a hand.
- On the shortest screens, blinds of 10,000/20,000 and above are shortened with "…" in the one-row header; the time and the buttons keep their room.
- A result longer than two lines under the board is cut to two lines; the seats' Winner and hand badges still show it.
- If the screen gets shorter during a hand than it was when the hand started (in practice only on Android, or a browser that resizes for the keyboard), the bottom of the table sits under the action bar until the next hand. The felt does not move.

## iPhone Safari check (Muse / the owner, about 10 minutes, on a preview build of this branch)

Use one iPhone in Safari, and the home-screen app too if it is installed. Use the practice table (Lounge → Try a practice table) or a staging tournament.

1. Play a few hands. Watch the felt's edge and the seats when your turn starts and ends, when you fold, at the showdown and when the next hand is dealt. Nothing should move or change size.
2. During your turn, tap Raise: the amount panel opens over the bottom of the table and nothing on the felt moves. Tap Back.
3. Mid-hand, scroll or tap near the bottom so Safari's toolbar slides in and out (or rotate the phone and back). The felt and seats stay put. After a rotation, the table comes back exactly as it was.
4. Open the chat and tap the message box. The keyboard opens, the chat sheet sits right above it and the table does not move. Close the keyboard and the chat: the page is not scrolled up and the action buttons are on screen.
5. iPhone SE (or any 568 px-tall phone): the header is one row with the chat and Lobby buttons beside the clock. Both work, and the blinds are readable.
6. Spectator: Lobby → watch another table. Nothing moves during its hands.

Pass is all six. Report any step that fails, with a screenshot.
