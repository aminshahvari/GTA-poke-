# R2 mobile UX fixes — handoff for Muse

Branch `r2-mobile-ux`, based on `r2-dev` `523a284` (F1 candidate `6f57c75` + Muse's re-audit, unchanged). Client only:
`public/app.js`, `public/style.css`, `public/index.html`, `public/business.js`, `public/opportunity.js`, plus
`test/ui/t_mobile_ux.js`. No server, engine, points, rules or content-filter change. Nothing deployed.
Source of the issues: the 9-phone local run (`/mnt/project-files/poker-club/reports/r2-mobile-local/SUMMARY.md`, issues 1, 2, 5, 6, 7).

## What changed

| # | Issue (from the 9-phone run) | Cause | Fix |
|---|---|---|---|
| 1 | Orange "BET n" badge covers that player's stack | The badge's class was the action name, so a Bet badge was `badge bet` and also picked up the `.bet` chip-pile rule (`position:absolute; transform:translate(-50%,-50%)`), which pulled it up onto the stack. On the compact look (360×740) every badge also touched the stack line by about 1 px. | Badge classes are now `act-bet`, `act-raise`, `act-all-in`, `act-call`, `act-check`, `act-fold` (`app.js` seat render + the layout's measuring copy; `style.css` colour rules). On the compact look the badge sits 1 px lower (`bottom:-13px`) so it clears the stack line. |
| 2 | The after-hand coach tip (and helper) shrink the table, seats then cover the pot, D button / chips on the board | The coach tip was a block between the table and the action bar, so opening it took ~100 px off the table, and it stayed open into the next decision. | The coach tip now floats over the bottom of the table (`#coachTip` moved inside `#tableArea`, `position:absolute`, shadow) so the table keeps its size, and it closes as soon as it's your turn to act (`renderTable`). It still closes on tap and after 10–14 s. The hand helper is unchanged (it is meant for your decision and the layout already sizes the table for it). |
| 3 | Names unreadable on 320–375 px ("Test Playe…" at every seat; "Test…" in the top bar) | Long names cut by the 58–76 px name plate. | Seat names use a short form that still tells players apart: names of 10 characters or fewer unchanged; otherwise the first name ("Sean Shahvari" → "Sean"), or first name + a short/numeric last word or last initial when someone else shares the first name ("Test Player 07" → "Test 07", "Sean S."). The full name is in the plate's `title`. Top bar on phones ≤ 380 px: your name wraps to two lines (tighter padding), so "Test Player 07" shows in full at 320 px. |
| 4 | Business directory not refreshed after someone publishes ("0 of 5" until reload) | The list was loaded once and cached for the session; only your own publish cleared it. | Opening the Business tab (or switching back to the Business segment) shows the cached list at once and refetches `bizList` in the background; if anything changed it re-renders, keeping the search text and focus. |
| 5 | Share-contact error cut off at 320×568 | The error and button sit at the end of a sheet that 320×568 leaves scrolled to the top; nothing scrolled it. | Errors in the opportunity sheets (share, contact request, report) scroll the sheet to its end so the message and its button are both on screen. Sheet height also uses `dvh` where supported. |

## Tests
- **New `test/ui/t_mobile_ux.js`** (Chromium, mobile emulation, touch): 72 checks, pass. A 9-handed flop with every
  action badge (Bet, Call, Raise, All-in, Check), the names "Test Player 01–09", at 320×568, 375×667, 375×629,
  390×664, 390×844, 360×740 and 412×839:
  - no badge over its own stack or name; nothing on the felt overlaps on your turn and on your next decision;
  - every seat name is different and no opponent's name is cut off;
  - the coach tip opens without changing the table height and stays above the action bar; it closes on your turn and the
    table is back to its size;
  - top bar shows "Test Player 07" in full at 320×568, no sideways scroll;
  - directory goes 5 → 6 businesses after another member publishes, on switching back to the tab; the new business is
    found by search, no reload;
  - share-sheet error ("…web address from note…") and its button are on screen at 320×568.
  - **Baseline (same test on the unfixed code): 51 checks failed** (all five items).
  - Log: `docs/evidence/r2/mobile-ux/t_mobile_ux.log`.
- Existing: `npm test` pass (all suites, content 353 probes unchanged); `test/ui/t_table_small.js`, `t_registration.js`,
  `t_bizsearch.js` pass; `test/browser/scan_csp.js` pass.
- **9-phone harness re-run** (`a_play.js layout 6`, the same real-tap 9-player run as the original report, on this branch's
  code; the result file's `sha` field shows the base `523a284` because it ran on the working tree before the commit):
  **2 of 206 live-table measurements had an overlap (was 126 of 501)**, **0 badge-over-own-stack**, no page scroll.
  Both remaining overlaps are on the iPhone 13 mini (375×629) with the full hand helper showing a long draw line: the D
  button touching the pot by 0.5 px, and one "200" chip touching the board (`iphone13mini-overlap-2.png`). Results:
  `/mnt/project-files/poker-club/reports/r2-mobile-ux-recheck/` (`A-layout-result.json`, `shots-A-layout/`).

## Screenshots (`docs/evidence/r2/mobile-ux/`, 1×)
`*-before.png` = unfixed code, `*-after.png` = this branch, same test state:
`table-375x667-turn` (badges, names), `table-360x740-turn`, `table-375x629-coachtip`, `table-390x664-coachtip`,
`topbar-320x568`, `share-error-320x568`; plus `table-375x629-turn-after` (tip closed on your turn) and
`table-320x568-waiting-after` (the known case below).

## Risks and limits
- **Chromium only.** iPhone Safari / WebKit was not available; real phones still need the owner's check (the tip overlay,
  two-line top-bar name and `dvh` sheet height are the WebKit-sensitive bits).
- **The floating coach tip covers the bottom of the table** (your cards and the two lowest seats) while it is open. It
  only shows between your decisions, closes on your turn, on tap, or after 10–14 s.
- **Short seat names** change what everyone sees: long two-word names show as the first name unless that is ambiguous at
  the table. Owner may prefer a different rule (for example full names on wide screens).
- **Known, not fixed here (pre-existing layout limit):** on a 320×568 phone, while someone else is acting with all nine
  players betting (pre-action buttons and the hand line showing), two chip labels touch the pot / D button. Your-turn
  states at 320×568 are clean. Reported by the test as NOTE, not failed.
- **Residual from the 9-phone re-run:** on a 375×629 phone with the hand helper's long draw line, a chip can touch the
  board (2 of 206 measurements). Same pre-existing solver limit as above; a follow-up could cap the helper at two lines.
- Not in this branch (outside the five items): the hero's own cards covering the hero's name (issue 4 of the run), small
  secondary tap targets, and the personal-invite auto-registration (separate investigation).
