# Blindrise: premium internal redesign handoff (r2-premium-ui)

**This is not part of the audited R2 release candidate.** It needs Muse's independent review and separate owner authorization before any deploy beyond the preview service.

- Branch: `r2-premium-ui`. Base: `c4445ed` (the audited R2 RC). Exact SHA: the commit that contains this file (see `git log -1`).
- Preview: https://blindrise-preview.onrender.com (STAGING=1, file mode, fake seed data). The coordinator fast-forwards `preview-premium-ui` to each tested SHA.
- `server/`, `package.json` and `package-lock.json` are byte-identical to `c4445ed`. Poker engine, rules, permissions and APIs are untouched. There are no new dependencies and no new external origins; the font URL is unchanged.

## What changed

The Welcome screen's midnight navy, champagne gold and glass now run through every signed-in screen.

- **Tokens.** One set of `--lx-*` tokens on `:root` covers palette, type scale, radii, spacing and the 44 px tap size. Inside `#lobby`, `#game` and `#modalRoot` the old slate tokens point at them. `#auth` (Welcome and sign-in) is unchanged.
- **Member Home (new).** At the top of Home there is a personal greeting with the member's avatar, first name, role, skill tier and points. Below it are four doors: Poker Club (with live status, and it returns you to your table when seated), Business Club, Opportunity Club and Card Scanner.
  - While the clubs are closed, members see those three doors as "Opening soon", as on the Welcome screen. The owner always sees them open.
- **Navigation.** The five tabs moved to a bottom tab bar with icons, in thumb reach. They keep the same buttons, ids, order and visibility rules. The top bar has the gold crest and wordmark; below 380 px it shows the crest only, so the member's full name still fits.
- **Cards and type.** Glass cards with hairline gold borders. Cormorant Garamond is used for headings, names and big numbers; eyebrows are gold small caps. Buttons are gold pills for primary actions and ghost for secondary ones. Fields and pills are refined to match.
- **Leaderboard.** Serif rank numerals, gold for the top three, a highlighted own row, and rows at least 48 px tall.
- **Learn.** Glass segment controls, serif lesson headings, gold stat numerals.
- **Director.** The same card system. At 320 px, rows wrap instead of scrolling sideways.
- **Business, Opportunity and Scanner.** Headings, cards, chips and segment tabs are brought into the same system. The "I need help" and "I can help" cards are recolored gold and emerald.
- **Table.**
  - Chrome: navy and gold, with a gold-outlined level badge.
  - Felt: the same green felt with a gold rail line, gold-trimmed card backs, navy name plates with gold hairlines, and a gold ring on the acting player.
  - Actions: Fold is ghost, Call is emerald, Raise is gold, All-in is garnet.
  - Compact controls (the Lobby and chat buttons, +30s, sizing presets, −/+) keep their size, so the table keeps its room on short phones. An invisible margin makes each touch area at least 44 px.
  - No blur or animation was added to the table.
- **Profile and dialogs.** Navy glass sheets with serif titles. A pre-existing 320 px sideways overflow in the profile sheet is fixed.

## Brand direction applied (founder, via coordinator)

These change user-facing labels only. Routes, element ids, API fields and handlers are unchanged.

- **The Lounge** is the member home. It carries the brand line ("Blindrise · Private Members Club", "Pull Up a Chair.", "Good Company. Meaningful Connections.") and the tab is now named Lounge.
- **The Strategy Table** always appears together with "Poker". The door reads "Poker · …", the Home section is "The Strategy Table" with "Poker · Club tournaments", and the leaderboard page is "Poker · The Strategy Table / Club standings".
- **The Exchange** is Business Club, both on the tab and in the headings ("The Exchange · Business Club").
- **The Bulletin** is Opportunity Club. The Business tab's inner segments still read "Businesses" and "Opportunities", so tests and members can still find them.
- **The Salon** is Learn, both on the tab and in the page title.
- **Business Card Scanner** keeps its name.
- **Look:** midnight navy and champagne gold, with ivory and stone accents, serif editorial headings and generous spacing.
- **Calm:** nothing pulses. The "live" dot no longer blinks on Home, and there are no urgency badges.
- **Leaderboard:** presented as "Recognition for good play". Points are unchanged.
- **Wording:** no copy implies that Blindrise endorses or guarantees any business or listing.
- **Photography:** monogram avatars with a lit face and a gold hairline. No photos and no new image origins.

## Remaining work

- Real member and club photography, once it is licensed.
- The Business tab's inner segment labels: they could take the new names after the tests that use them are updated.
- A real-iPhone pass on the preview service.

## JS changes (presentation only)

- `public/app.js`:
  - `memberHomeHTML()` and a click handler for its doors (`[data-lx]`). `renderHome` prepends it. It reads only `club.me`, `club.tourney`, `club.shop` and `memberOf()`.
  - `pageHead()` titles on Leaderboard and Learn.
  - Label strings: the Home section names and the poker section heading.
- `public/opportunity.js`: two label strings.
- `public/business.js`: two label strings, and `BizClub.show(seg)`, which opens the Business tab on `biz`, `opp` or `scan`, the same views the existing buttons open.
- `public/index.html`: inline SVG icons inside the tab buttons (labels wrapped in `<span>`), and the crest in the top bar.

## Tests (see the commit message for the exact counts)

- `test/ui/t_premium_ui.js` (new) runs at 320×568, 375×667, 390×844 and 430×932, on every screen:
  - no sideways scroll;
  - tap targets of at least 44 px, using real hit-testing;
  - text of at least 11 px (labels drawn on the felt are exempt);
  - the key controls work: tabs, Member Home doors, Home section switcher, leaderboard rows opening a profile, Learn lessons, Director, business directory, Opportunities list and detail, the business form, the card scanner, the profile sheet, and the table's Fold/Call/Raise, sizing and Back.
- `npm test`, `t_welcome`, `t_registration`, `t_mobile_ux`, `t_table_small` and `t_bizsearch` all pass.
- Screenshots are in `docs/evidence/r2/premium-ui/` (`before/` is `c4445ed`, `after/` is this branch; 390 and 320 wide, real fonts).

## Known limits

- During your turn on phones up to 600 px tall, the Lobby button folds away with the stats row. This is the existing design and is unchanged.
- The hero's own cards still overlap the hero's name plate (pre-existing and accepted).
- Not yet checked on a real iPhone. The preview service is for that.
