# Integration release candidate for tonight: Muse handoff (NOT deployed)

Claude, 2026-10-18, ~16:50 UTC (12:50 EDT). Ordered by the founder's "Final integration directive" and "Tournament night emergency directive" (16:12–16:14 UTC).

**Candidate app SHA: `958e7c0`** on branch `r2-integration` (updated ~18:44 UTC). It supersedes `330863f` (round 1) and `443a27f`, which failed the founder's iPhone landscape check. Any later commit on this branch is docs-only or test-only. Verify with `git diff 958e7c0 <head> -- public server package.json package-lock.json` = empty.

## Round 2 (`958e7c0`): the current candidate
`958e7c0` builds on `330863f`. It closes the 6 remaining `t_table_layout` failures with layout changes, not with test thresholds. It also merges the sibling gameplay-UI branch (`origin/r2-int-gameplay-ui`, `a6ecb98`), which brings:
- stricter chip and dealer-button ownership;
- the whole live pot;
- no stale action pill on the acting seat;
- one action per turn (double-tap lock);
- `t_positions`.

See `docs/release/GAMEPLAY-UI-FIXES-handoff.md` for those.

The merge had one conflict, at the chip-ownership anchors in `tableGeo`. I kept the sibling's rule (hero anchored at the centre of cards and plate together, a 12 % + 3 px margin) and re-added `hp` and `side0`, which this branch uses for the hero's cards beside the plate.

It is still client and tests only: `git diff 443a27f 958e7c0 -- server package.json package-lock.json` is empty.

### Layout changes
- **`micro` look:** tried only after every normal, compact and mini layout fails to fit cleanly. In practice that means full tables on the smallest screens: 320×500, 568×320 and 320×568 at 7–9 players.
  - Other players' two card backs are not drawn. A small card mark on the plate's top edge, beside the avatar, shows they are still in the hand. Your own cards are unchanged.
  - Opponent seats are a little narrower (58 px), with the same 10 px names and 11 px stacks as mini.
  - Chip labels are slimmer (9.5 px, the size mini's tight labels already used).
  - It is also tried with a little less extra room either side of your seat, which gives the seats along the top more room.
- **Pot at the board's left:** used when the felt is too short for the pot above the board. Board and pot are centred together, and it is allowed only when both fit the felt's width. This fixes 812×320 at 4 players, where the top seat's badge touched the board.
- **Chip placement:**
  - Your own chips may sit just off the felt beside your plate when the felt in front of your cards has no clean spot.
  - When a chip has no clean spot in the normal search, the layout takes the nearest clean spot on a 4 px grid (on the felt, or just off it beside its seat) before accepting one on top of a seat.
  - Every spot still obeys the 12 % + 3 px ownership rule, so `t_positions` stays green.
- **Seat measurement** ignores elements that are not drawn (`seatSizes`).

### Test changes in round 2
- `t_table_layout` and `t_table_small` ignore undrawn elements when they measure seats. A hidden card has a zero box at the page's corner, which would otherwise read as a seat outside the table. No threshold changed in round 2.
- **AC1, as checked:** "every seat's cards vs its own plate" means **zero overlap between each player's hole cards and that same player's name plate, stack and badge.**
  - `t_table_layout` checks every seat's cards against every seat's plate box, its own included, at every size and 2–9 players.
  - For your seat the plate box also includes your avatar.
  - Other players' card backs tuck behind the top of their own avatar by design, and the `micro` look doesn't draw them.

### Results on `958e7c0` (Chromium, production font cache)
| Test | Result |
|---|---|
| `t_table_layout`, full matrix, 19 sizes × 2–9 players | **2304 / 0** |
| `t_positions` | 356 / 0 |
| `t_stability` | 210 / 0, 0.0 px felt, seat and board movement, including rotation mid-hand |
| `t_hotfix` | 50 / 0 |
| `t_premium_ui` | 296 / 0 |
| `t_clubs_closed` | 25 / 0 |
| `t_mobile_ux`, `t_table_small`, `t_welcome` | pass |
| `npm test` (incl. `t_invite_privacy` 7/0) | exit 0 |
| `t_sim 3000` | random-action 3000 tournaments / 30,981 hands, 0 problems; 3000 AI tournaments, 0 problems |

**Timing of runs:** `t_table_small` was re-run after its measurement fix. The only edit after these runs is two CSS comments.

### Screenshots
Updated after round 2, in `/mnt/project-files/blindrise/overnight/table-redesign/landscape-fix/`:
- `contact-before-after.png` and `pair-*.png`;
- `after/`;
- `after-extra/`: 844×340, 812×320@44, 568×320, 320×568, 320×500 and 390×844 at 4, 6, 7 and 9 players.

### Limits
- No Safari or WebKit run, and no real-device check. The founder's iPhone acceptance is still required.
- On the smallest screens with a full table, the pot can sit at the board's left, partly on the rail, and chips or the D button can sit just off the felt beside their seat.

`blindrise-preview` was not moved by this work. The coordinator put `330863f` on it for an early iPhone look.

## Landscape iPhone fix, round 1 (`330863f`)
`443a27f` **failed the founder's iPhone landscape check** (16:54 UTC; screenshot `owner-iphone-landscape-443a27f.png`). Muse confirmed the defect in `MUSE-DEFECT-landscape-hero-overlap-2026-10-18.md` (`42f9764`). **Do not approve `443a27f`.**

`330863f` sits on `42f9764`. It is client and tests only: `git diff 443a27f 330863f -- server package.json package-lock.json` is empty.

It was built in parallel with a sibling fix to dealer/blind mapping, the pot total, the stale action pill and the double-tap lock. That fix is not in this commit, and nothing here touches those code paths.

### What changed (`public/app.js`, `public/style.css`)

**Sideways layout (`#game.land`)**
- It now triggers from 560 px wide; it was 640.
- The page uses a grid: the table plus a helper and controls column of `clamp(210px, 27vw, 260px)`.
- A one-row header of ≤40 px, which every sideways size asserts.
- `env(safe-area-inset-*)` padding on left, right and bottom, through `--sa-l/r/b`. Nothing sits under the notch, the Dynamic Island or the home bar.
- No horizontal or vertical scroll at any tested size.
- **Your seat sideways:** your cards sit beside your plate, so they never cover your name, stack or avatar.
- **Phones narrower than 700 px (`land-s`):** your cards are 10% smaller and sit above the plate, with a 2 px gap.
- **Clearance:** top seats and your seat keep ≥8 px from the table area's edges. Corner seats keep room for their badge.
- **Caches:** seat measurements and layouts are cached per sideways mode, so turning the phone relays out cleanly.

**Portrait**
- Your plate no longer tucks up under your cards; they used to overlap by about 8 px.

**Hand helper**
- **Label:** the chance to win reads "Win 65%" on short screens and appears once. The advice never repeats it on screens ≤700 px tall.
- **Advice length:** up to 2 lines upright and 3 lines sideways. The dock reserves that height for the whole hand, so nothing moves. This also covers Muse's `1bc40fe` portrait item, which was later withdrawn as a font artifact (`551d8ad`), as robustness.
- **Draw odds:** short screens show them as "~N%".
- **Rendering:** advice and draw text come from `adviceFor()` and `drawHTML()`, built from fixed strings and numbers. They are exposed read-only as `window.__helperText`, so the test can render the longest variants deterministically.

**Other**
- **Watching column:** sideways, the line under the table is held at 2 lines (dock reserve plus clamp). This fixes a small layout shift for spectators at showdown in the narrow column.
- **Demo banner:** hidden while a hand is live.

### Test changes
**`t_table_layout`**
- **Matrix:**
  - Portrait 320×568, 375×667, 390×844, 393×852, 430×932, plus browser-chrome variants 320×500, 390×760, 430×850.
  - Landscape 956×440, 932×430, 956×370@59L/21B, 932×360@59R/21B, 852×393@59L/21B, 844×390, 852×330, 844×340, 812×320@44L/21B, 667×375@21B, 568×320.
  - Safe-area insets are injected as CSS variables.
- **New assertions:**
  - no seat's cards over any name plate, stack or badge, including your own cards over your plate and avatar (Muse AC1);
  - every seat inside the table area and clear of the dock (AC2, AC3);
  - seats and buttons inside the safe area;
  - nothing scrolls;
  - sideways, a header ≤40 px and 8 px edge clearance;
  - 10 worst-case helper texts written into the helper at every size: not clipped, % shown once.
- **Felt ratio:** below 800 px tall the minimum is relaxed from 0.95 to 0.8. `443a27f` measured 0.86–0.94 at those sizes too.
- **Opponents' card backs:** they still tuck behind the top of their own avatar by design. Their name, stack and badge stay clear.

**`t_stability`:** adds landscape 956×440, 956×370, 667×375 and 568×320. Each runs as a player and as a spectator. Portrait runs rotate mid-hand to landscape and back.

### Results on `330863f` (Chromium, production font cache)
| Test | Result |
|---|---|
| `npm test` | exit 0 (`t_invite_privacy` 7/0) |
| `t_table_layout` (full new matrix, 2–9 players) | **2298 ok / 6 failed** (exit 1; the 6 are the known limits below) |
| ⤷ the original six sizes (320×568 … 430×932, 844×390) | 688 / 0 |
| `t_stability` | 210 / 0: 0.0 px felt, seat and board movement; rotation back to portrait is 0 px |
| `t_hotfix` | 42 / 0 |
| `t_premium_ui` | 296 / 0 |
| `t_clubs_closed` | 25 / 0 |
| `t_mobile_ux`, `t_table_small`, `t_welcome` | pass |
| `t_sim 3000` | random-action 3000 tournaments / 30,374 hands, 0 problems; 3000 AI tournaments, 0 problems |

The same new `t_table_layout`, run against `443a27f` at 956×440, 956×370@59, 844×390 and 667×375 (6 and 9 players), gave **89 ok / 39 failed**. That includes "Test's cards x Test's plate" at every one of those sizes, which is the founder's defect.

### Screenshots
All in `/mnt/project-files/blindrise/overnight/table-redesign/landscape-fix/`:
- `contact-before-after.png`, plus `pair-*.png`: before (`443a27f`) and after, at 956×440, 956×370 with a 59 px left inset, 844×390 and 667×375, for 6 and 9 players;
- `before/` and `after/`: the raw shots;
- `after-extra/`: 844×340, 812×320@44, 568×320, 320×568 and 390×844;
- `owner-report-443a27f.png`: the founder's screenshot.

### Known limits of round 1 (all closed in round 2, see above)
These were the 6 `t_table_layout` failures on `330863f`, all on sizes added in round 1:
- **320×500, 7–9 players** (iPhone SE 1st gen upright with Safari's bars):
  - 7 players: Ben's and Christina's seats touch;
  - 8–9 players: a 200 chip stack touches the edge of your cards.
  - `443a27f` failed this size at every player count (cards over your plate).
- **568×320, 9 players** (iPhone SE 1st gen sideways): Alexandra's card backs touch Ben's plate. 8 players is clean.
- **812×320 with a 44 px inset, 4 players** (in-app browser sideways): the top player's badge touches the board area.
- **Not covered:**
  - no Safari or WebKit run, and no real-device check;
  - the founder's iPhone acceptance is still required.

`blindrise-preview` was not moved by this fix; the coordinator later put `330863f` on it.

## Composition (as of `443a27f`; `330863f` and `958e7c0` add the client fixes and the gameplay-UI merge above)
| Part | SHA | Muse status |
|---|---|---|
| Stabilization RC (viewport, practice card, invite rows) | `8eee0a5` | PASS (`1f61b65`) |
| t_hotfix readiness wait + practice-card-while-seated coverage (test only) | `e774397` | new |
| Invite privacy (no `invitedBy` in member payloads) | `06e6e9c`, merged in `0b208c3` | PASS on branch (`9b80941`) |
| Table redesign | `1cb2b89`, merged in `13ff0d1` | PASS on branch (`8e2f914`), with one MINOR |
| Landscape helper fix (Muse MINOR on `1cb2b89`) | `443a27f` | new |

Both merges were clean; there were no conflicts.

The diff against live `5c7ee11` in server and package files is exactly the invite-privacy change:
- `server/index.js`: +3/−1, the member payload filter;
- `package.json`: `t_invite_privacy` added to `npm test`.

Nothing else on the server, so engine, fairness, storage and keys are untouched.

**Excluded:**
- gameplay options (`e391f8d`);
- club switching (`1463d1c`);
- the Celestia campaign (`dd68f4c`);
- the Rewards Shop, which is unchanged.

## The helper fix (`443a27f`)
- **Sideways (`#game.land`):** the helper shows the hand name and chance to win on row 1. The advice gets up to 3 full lines under them, and the dock's measured height follows (`reserveDock` sample: 3 lines when `land`).
- **Short screens (`#game.h700`, which includes sideways):** the advice drops its own ", you have N%" (`span.h-have`, hidden), because the same figure sits right above or beside it.
- **Portrait ≥700 px tall:** unchanged.
- **Advice markup:** now built from fixed strings and numbers only. `esc()` was removed from `advice` because it now contains the span; no user text ever enters it.
- **New `t_table_layout` assertions,** at every size (incl. 844×390) and 2–9 players: the advice is not cut off (scroll vs client box), and the chance to win is not shown twice on h700.

## Claude's test runs on `443a27f` (Chromium, real font cache)
| Test | Result |
|---|---|
| `npm test` (incl. `t_security`, `t_invite_privacy` 7/0, `t_clubs`, `t_csp`, sim 20) | exit 0 |
| `t_sim 3000` | random-action 3000 tournaments / 30,787 hands, 0 problems; 3000 AI tournaments, 0 problems |
| `t_stability` | 146 / 0 |
| `t_table_layout` | 432 / 0 (on `1cb2b89` with the new assertions: 1 helper-cut-off failure at 375×667, 2 players) |
| `t_hotfix` | 42 / 0 |
| `t_premium_ui` | 296 / 0 |
| `t_clubs_closed` | 25 / 0 |
| `t_mobile_ux`, `t_table_small`, `t_welcome` | pass |

**Known limits:**
- No Safari or WebKit testing.
- The helper's one-line clamp on 600–700 px portrait still applies to a long advice text. The test covers the texts its table states produce.
- On ≤600 px headers, average stack and rank are dropped (from `a6ef217`).

## Preview
`blindrise-preview` was moved to `443a27f` at ~16:50 UTC for the founder's iPhone acceptance (portrait and landscape); that check failed in landscape. It runs on test data only. It was not moved to `330863f` by this fix.

## Release gates (unchanged)
1. Muse PASS on this exact app SHA.
2. Founder iPhone OK on the preview.
3. Idle service, reconfirmed right before the merge.
4. Fresh export: time, size and Completed recorded.
5. Founder GO naming the SHA.

The deploy is a fast-forward of `main` from `5c7ee11`. **Rollback target:** `dep-dba1ktbrjlhs73c6fdig` (`5c7ee11`). There is no data change either way: removing the `invitedBy` filter just restores today's payload. All of this must be done by 21:00 EDT. Fallback: `8eee0a5` alone.
