# Desktop responsive layout: handoff for Muse (NOT authorized to deploy)

Claude, 2026-10-18, for the founder's "Desktop responsive UX fix" directive (00:00 UTC) and the additions at 00:05 UTC. Nothing here was deployed or merged. `main`, `r2-release`, `shape-a-table`, `public-onboarding`, Render and production are untouched.

## Candidate
- Branch `desktop-ux`. The exact SHA is the head of this branch, the commit that adds this file. Muse audits that SHA.
- History: `bf24ceb` (live Shape A) → `5838e14` (felt fix, Muse PASS `20284ab`) → `2bffbb7` (desktop CSS and `t_desktop`, WIP checkpoint) → this commit (evidence and handoff, docs only).
- Diff against live production `bf24ceb`:
  - `public/style.css`: +87 lines (the 2-line felt fix from `5838e14` plus the 85-line desktop block), 0 removed.
  - `test/ui/t_desktop.js`: new test.
  - Docs and evidence.
  - **`server/`, `package.json`, `package-lock.json`, `public/app.js`, `public/index.html`: no change.** Check with `git diff --quiet bf24ceb <sha> -- server package.json package-lock.json public/app.js public/index.html`.
- No gameplay, auth, member data or API change. Not a single line of JavaScript changes.

## What changes on screen
Every desktop rule sits in one block at the end of `public/style.css` ("Desktop responsive layout (desktop-ux)"). All its top-level rules are inside `@media (min-width:768px)` or wider. **Phones (320–430 px) cannot match any of them.**

| Width | Change |
|---|---|
| ≥ 768 | The app fills the window instead of the 540 px phone column. Lobby header, body and tab bar align on one centred column (max 1200 px, min 24 px gutters). Dialogs are up to 520 px wide. Table chat is a floating side panel. On the table, the clock and stats rows follow the column; the helper and action buttons are centred at 760 px; the table area keeps a table's proportions (`min(100% − 48px, (100dvh − 300px) × 1.9)`). |
| ≥ 1024 | **Desktop navigation**: the same tab buttons (same ids and order) move from the bottom bar into the header as pill tabs. **Lounge**: the Strategy Table door is full width; Exchange, Bulletin and Scanner sit in one row of three. **Leaderboard, Salon and Director** use a 1000 px column so forms and tables do not stretch. **Strategy Table**: seats ×1.2, pot/board/message ×1.25, dealer ×1.25, larger stats, bet labels and action buttons, room above the felt for the top seats. |
| ≥ 1280 | **Lounge** cards (Coming soon, picture, tournament, friends…) in a two-column grid under the full-width welcome. |
| ≥ 1280 and ≥ 860 tall | Seats ×1.35, centre ×1.4. |
| ≥ 1600 and ≥ 1000 tall | Seats ×1.6, centre ×1.55. |

Side effect worth knowing: the sign-in and welcome screen already had a wide layout (brand left, form right, `min-width:860px`). The 540 px column used to block it. It now shows as designed, with no sideways scroll at 390, 768, 1440 or 1920 (`docs/evidence/desktop-ux/after/welcome-*.png`).

Felt size (width × height, px) measured by `t_desktop` on a 9-handed table:

| Window | Felt |
|---|---|
| 390 phone | 313 × 379 (unchanged) |
| 768 | 590 × 507 |
| 1024 | 729 × 297 |
| 1280 | 779 × 321 |
| 1440 | 935 × 390 |
| 1920 | 1215 × 516 |

Before the change, every desktop width showed 436 px.

## For Muse: verify felt integration
- **Rule**: `#game .felt::before{content:"";position:absolute;inset:14px;border-radius:999px;background:radial-gradient(ellipse 70% 60% at 50% 42%,#1b7a52,#0d4a33 78%)}`, with its comment line.
- **From commit**: `5838e14` (branch `shape-a-felt`, Muse PASS `20284ab`). It is not cherry-picked: `desktop-ux` is built directly on `5838e14`, so the commit is in the history unchanged (`git merge-base --is-ancestor 5838e14 <sha>`).
- **It applies at every width**, phones included. That is the only mobile difference from live `bf24ceb`, and it is the already-approved fix.
- **Renders that show it**:
  - after: `docs/evidence/desktop-ux/after/table-390x844.png`, `table-1024x768.png`, `table-1440x900.png`, `table-1920x1080.png`;
  - before (navy, live `bf24ceb`): the same names under `before/`;
  - side by side: `contact-1440-before-after.png`.
- The desktop block does not restyle the felt. It only resizes the table area and scales the seats and centre.

## Mobile unchanged: proof
1. **Construction**: the desktop block adds 85 lines and removes none. Every top-level rule in it is `@media (min-width:768px)` or wider (checked by parsing the block).
2. **Computed styles, same page, same data**: `t_desktop` with `BASE_CSS=<5838e14 style.css>` checks phones at 320, 375, 390 and 430. On each of the Lounge, Leaderboard, profile, Director and table screens, it reads the computed style of every element and its `::before`/`::after` with this build's CSS. It then swaps in the base stylesheet on the same page and reads them again. **20 of 20 screens are identical** (615 to 1071 element boxes per screen). The two countdown bars (`#turnBar`, `.shot i`) are skipped because a timer redraws them between readings; this was confirmed by comparing the build with itself.
3. **Negative control**: the same check against live `bf24ceb`'s CSS flags exactly 1 element per screen, the felt rule (`docs/evidence/desktop-ux/mobile-css-negative-control-390.txt`). So the check does detect a one-rule change.
4. `t_premium_ui` (4 phones, every screen): 207 ok, 1 failed on this build and the same 207/1 on base `5838e14`. The failure is the known 320 px Chat/Lobby buttons at 32 px tall during raise sizing, the same on live production.

Plain screenshot diffs between two separate runs are not a valid proof here. Avatar colours, the hand helper's win % and the timer differ from run to run, so they were not used.

## Tests (on `2bffbb7`; this commit adds docs only)

| Test | Result |
|---|---|
| `npm test` | exit 0, all passed |
| `t_welcome` | 32 ok, passed |
| `t_premium_ui` | 207 ok / 1 failed (same as base, see above) |
| `t_desktop` (new), with `BASE_CSS` = `5838e14` CSS and FONTS_DIR | **195 ok, 0 failed, 2 known** |

`t_desktop` runs at 320, 375, 390, 430, 768, 1024, 1280, 1440 and 1920. At each width it checks:
- no sideways scroll on Lounge, Leaderboard, profile, Director and table;
- the content width: phones full, tablet ≥ 90 %, desktop 900–1240 px;
- Lounge, Leaderboard and Salon tabs visible and at least 40 × 40;
- at ≥ 1024, the four doors in at most two rows;
- the profile dialog fits, and on desktop is no wider than 640 px;
- Director opens;
- table: Fold, Call and Raise on screen and at least 40 px tall; 9 seats drawn; every seat between the header and the controls and inside the window; no two avatars overlapping; at ≥ 1280, avatars ≥ 46 px and board cards ≥ 58 px;
- the felt grows with the window from 768 up, and at 1920 is at least twice as wide as on a 390 phone;
- on phones, the computed-style identity above.

The **2 known** results are a 9-handed table on the two shortest phones (320×568, 375×667), where top seats reach past the header. Live production does the same. Phones were deliberately left unchanged. On the R2 line the small-table solver handles it (`t_table_small`).

Logs: `docs/evidence/desktop-ux/t_desktop-full.log`, `t_desktop-summary.txt`.

Command: `PLAYWRIGHT_CORE=… CHROMIUM=… FONTS_DIR=… BASE_CSS=<base style.css> SHOTS=<dir> node test/ui/t_desktop.js`.

## Safari status
**Not tested in Safari.** Only Chromium is available in this environment. Two features matter for Safari:
- `:has()` (Lounge two-column grid; narrower column for Leaderboard, Salon and Director) needs Safari 15.4 or later. Older Safari simply keeps one column at 1200 px.
- `100dvh` (table proportions) needs Safari 15.4 or later. Without it, the table area falls back to the full column width.

### Safari acceptance steps for Muse
macOS Safari (latest), signed in as a member on a local or preview build of this SHA, then as the owner for Director. Do it at window widths of 1280, 1440 and 1920 (Develop → Enter Responsive Design Mode, or resize the window), and once in a narrow window of about 400 px.

| Screen | Check |
|---|---|
| Every screen, every width | No sideways scroll. Nothing is cut off at the right edge. |
| Lounge | Top navigation pills in the header (Lounge, Leaderboard, Salon, plus Director for the owner); the selected pill is gold. The Strategy Table door is full width, and three "Opening soon" doors sit in one row whose labels don't cover their titles. At ≥ 1280, the cards below are in two columns. The BLINDRISE gradient wordmark in the header renders as gold text, not a gold box (`background-clip:text`). |
| Strategy Table (join a test tournament or use Director → Open demo table) | The felt is **green** inside the navy rail. The seats sit evenly around the oval, with none overlapping the header or the controls, and names and stacks are readable. The pot and board are centred. Fold, Call and Raise are visible and centred. Raise opens the sizing panel, and Back closes it. The chat panel floats at the bottom right. |
| Leaderboard | A centred 1000 px column. Rows align and the profile dialog opens centred. |
| Director | A centred 1000 px column. Forms and members list readable; Create invite link opens its dialog. |
| Dialogs | Centred, no wider than 520 px, buttons wrap rather than overflow; the frosted glass backdrop (`backdrop-filter`) renders. |
| Welcome / sign-in (signed out) | Brand on the left, cards or form on the right; the frosted cards and form (`backdrop-filter`) and the gold gradient wordmark render. |
| Narrow window (~400 px) | Looks exactly like the phone layout: bottom tab bar, phone table. |

Owner's quick version on the MacBook: open the preview in Safari full screen. Check that the Lounge has the top navigation and the wide layout and that the table is large with green felt, then shrink the window to phone width and check that it becomes the phone layout.

## Port notes: R2 is next
Muse has since **PASSED the R2 release candidate `e659f09`** (verdict `bad2324` on `r2-release`), and it is on the preview. So the likely next step is to carry this block onto `r2-release`, as a new candidate for its own audit. This build is on the production line (`bf24ceb`) and is not R2. Porting needs:
- **Felt**: drop the `5838e14` rule. R2 has its own two-layer felt (`.felt::before` with `--rw`); only the desktop block moves.
- **Clubs**: when the clubs are open, R2 has a fifth tab (`biz-tab`). Five pills at 112 px plus the logo and member chip are tight at 1024. Check 1024 with clubs open, and reduce the pill `min-width` or hide the labels between 1024 and 1150 if needed. The Exchange and Bulletin screens (`.bz-home`, `.op-home`, chips rows) need the same wide-screen check.
- **Table**: R2's table solver adds `compact` and `mini` classes and sizes seats itself. Re-run `t_table_small` and `t_mobile_ux` with the block, and check that the seat scale (`--dk-seat`) does not fight the solver at ≥ 1024.
- **Lounge**: R2's Lounge has working Exchange and Bulletin doors. The three-door row still applies, and the `:has(> .lx-hello)` hook depends on R2's markup keeping `.lx-hello` as the first child of `#lobbyBody`.
- Re-run `t_desktop` (with `BASE_CSS` = R2's own CSS), `t_premium_ui`, `t_clubs_closed` and `npm test` on the port.

## Rollback
CSS only, no data. Before a deploy: don't merge. After a deploy: `git revert` the desktop commits on `main`, or Render rollback to the previous deploy. Members' data, sessions and invites are unaffected either way.

## Deploy conditions (unchanged, founder-held)
Muse PASS on the exact SHA, then the founder's GO naming it, then a quiet window with no game running or registering, a fresh backup, and a phone and desktop smoke test. Not during an active event.
