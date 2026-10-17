# Shape A — Premium UI on the production backend (UI-only release candidate)

**Branch:** `shape-a-premium-ui` · **Base:** production `49d9ece` (live, deploy `dep-db9sr9e1egvs73d4qgh0`) · exact SHA: see the commit that adds this file (reported in the thread).
**Not** R2, **not** Feedback Hub. Built for Muse's Shape A release review; no merge or deploy without Muse's verdict and the founder's GO.

## What it is
The Muse-audited premium look (`7dabbc3`, client delta vs `c4445ed`) ported onto `49d9ece`:
- `public/style.css`: the premium block appended verbatim from `7dabbc3`, plus two small rules (below).
- `public/index.html`: crest logo; bottom tab bar with icons. Tabs: **Lounge** (was "Tournament"), Leaderboard, **Salon** (was "Learn"), Director (owner only). No Business tab (not in this build).
- `public/app.js`: `memberHomeHTML()` (The Lounge) and `pageHead()` from `7dabbc3`; Leaderboard eyebrow "Recognition for good play"; page titles on Leaderboard and Learn.

## Adapted for production (no R2 features)
- **Doors:** only The Strategy Table (Poker) is a working button (back to your table when seated, otherwise scrolls to the tournament). The Exchange, The Bulletin and Business Card Scanner are shown **"Opening soon"**, `aria-disabled`, not buttons, and do nothing when tapped, matching the live Welcome screen.
- Not ported (R2-only): Business/Opportunity screens and their JS, scanner, Home section switcher, `BizClub.show`.
- Added rule: "Opening soon" label sits in the card's flow (in `7dabbc3` it was absolutely placed and overlapped the Scanner title; Muse's staging-mode review saw only the open state).
- Added rule: dialog button rows wrap (Muse MINOR-2, profile sheet 320 px). MINOR-1 (Opportunities chips) does not apply: no Opportunities screen here.

## Unchanged (verify: `git diff --stat 49d9ece <SHA> -- server package.json package-lock.json` is empty)
server/, package files, schema, env vars, auth, invites, sessions, engine, permissions. Rollback = Render rollback to `dep-db9sr9e1egvs73d4qgh0`; no data written by this build differs from `49d9ece`.

## Tests on the candidate
- `npm test`: exit 0. `test/ui/t_welcome.js` (incl. invite link → join → lobby, sign-in): pass.
- `test/ui/t_premium_ui.js` (ported; creates the director and 12 members through the normal API): **207 ok / 1 failed** at 320/375/390/430. The one failure: 320×568 table with the Raise panel open, Chat/Lobby buttons' extended hit area not provable by the 4-point tap test. Baseline `49d9ece` on the same table checks: **36 ok / 16 failed** (same geometry, smaller targets, 10 px labels) — see `docs/evidence/shape-a/BASELINE-49d9ece-table-sizing-320x568.png`. Pre-existing table layout, improved, not fixed.
- Screenshots: `docs/evidence/shape-a/` (390 and 320).

## Known limits
- Table squeeze at 320×568 with the Raise panel open is the production table layout (R2 has the fixes); unchanged by this build.
- Home shows tournament points next to the member's name (as audited in `7dabbc3`); the founder's polish list proposes changing that later.
