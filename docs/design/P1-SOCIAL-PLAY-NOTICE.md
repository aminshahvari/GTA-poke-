# P1 design: free-social-play notices (game start + persistent label)

Status: **design only in production.** A client-only implementation exists on the **non-production branch `social-play-notice`** (`91bb563`, cut from `4423a07`). It is not merged, not released and not audited by Muse. Treat it as a candidate, not a shipped feature.

Scope: make it unmistakable that Blindrise is free social play with no betting and no real money:

1. a clear **notice at the start of each game** (each tournament, each new practice table, later each shared game);
2. a **subtle persistent label** at the table.

Constraints: must not block cards or action buttons; must not overlap seats, cards, chips, buttons or the result ("winner") line in portrait or landscape; navy-and-gold design; no new betting controls.

## 1. Architecture

Client only. No server change, no new key, no new endpoint or socket message.

| Piece | Where | Rule |
|---|---|---|
| Persistent label "Free social play · No betting · No real money" | `#playLine` inside `#dock` (`public/index.html`), counted in the dock's reserved height by `reserveDock` (`public/app.js`) | 11 px text (the premium-UI minimum). Upright and seated it fills the gap that already exists between the helper and the action bar (6+6 px, or 6+4 px on short screens); the 1–3 px more its 11 px text needs come out of the helper's own padding, so the table area and the action bar stay pixel-identical to `4423a07` (measured at 320×500, 320×568, 393×659, 390×844). Watching, it sits in the action bar's top padding (1 px added on short screens). Sideways it is one more row of the dock column (wraps to two lines). Never over the table area. |
| Start notice "Free social play / No betting, no real money." | `#playNote` inside `#tableArea`, `renderPlayNote(d)` called at the end of `renderTable` | Shown once per game key (`t:<tourney.id>` or `demo:<start>`), placed over the board's empty slots and the empty message line under them before the flop (the layout already keeps that space clear of seats, cards and chips), text fitted at 13–11 px, wrapping if needed. Hidden on tap, when the flop is dealt, when the hand ends, or after 10 s. `role="status"`, `aria-live="polite"`. |
| Dismissal memory | `localStorage['stacked:playnote']` (try/catch), plus memory | A reload in the same tournament does not show it again; a new tournament does. |

Authorization / isolation: not applicable (static text, no data). For shared games (`P1-SHARED-SOCIAL-GAMES.md`) the game key becomes `sg:<gid>`.

## 2. Phased plan

| Step | Ships | Status |
|---|---|---|
| N1 | Label + start notice, client only, UI test `test/ui/t_social_play.js` | **On branch `social-play-notice`, not released** |
| N2 | Muse audit (layout + premium UI) on the branch; merge with `table-oval` if that lands first | Muse |
| N3 | Release with the next approved production build | owner GO |
| N4 | Same notice text on the registration confirmation and the welcome screen (optional) | decision 3 |

Merge note: the `table-oval` branch also changes table layout. This change touches only `#dock` content, `reserveDock`'s measured copy, one call at the end of `renderTable`, and an appended CSS block, so conflicts should be limited to adjacent lines; layout tests must be re-run after merging.

## 3. Owner decisions needed

1. Approve the wording: notice "Free social play / No betting, no real money."; label "Free social play · No betting · No real money".
2. Notice once per tournament per device (as built) vs on every table move.
3. Also show the line on registration and welcome screens (N4).

## 4. Acceptance tests (implemented in `test/ui/t_social_play.js`)

Sizes 320×568, 375×667, 393×659, 430×739, 667×375, 844×390 and 1280×800; tables of 2, 6 and 9.

1. At the start of a tournament the notice shows (text ≥ 11 px, not cut off) and contains "free social play", "no betting" and "no real money".
2. The notice lies over the board's slot rectangle (plus the empty message line) and overlaps no seat, card, chip, dealer button, pot, result line or button.
3. Fold / Call / Raise are the topmost elements at their centres while the notice shows.
4. A tap dismisses it; the next hand of the same tournament and a page reload do not show it again; a new tournament id shows it again.
5. It is gone once the flop is dealt.
6. Opening a practice table shows it.
7. In each of your turn, a finished hand (Winner badge + result line) and watching, the label is shown, says all three phrases, is not cut off (≥ 11 px), lies inside the dock and not over the table area, and overlaps no seat, card, chip, dealer button, pot, board, helper, result line or button; the page does not scroll.
8. `t_table_layout`, `t_stability`, `t_positions`, `t_mobile_ux`, `t_premium_ui` pass unchanged (no assertion loosened).
