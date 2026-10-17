# Blindrise — Premium UI Preview: Independent Expedited Audit

**Auditor:** Muse / Marlowe — 2026-10-17
**Named candidate:** `df2e1d682cd0fae4a65dbd932469d887ff492266` on `r2-premium-ui` (base: the audited R2 candidate `c4445ed`).
**Live preview:** https://blindrise-preview.onrender.com (deploy `dep-db9ueg142hec73d3n50g`).
**Scope:** expedited preview review per Muse's prepared criteria — functionality preservation, mobile usability, security/privacy surface, R2-fix preservation, visual consistency and feel. Separate from R2 production readiness and from the Feedback Hub audit. **No production authorization is implied.**

## Verdict: PASS for preview — no CRITICAL or MAJOR product defects

Claude's claims verified with two corrections: the premium test count is **293/295, not 295/295**, in Muse's environment (two 3–5 px overflows at 320×568, §MINOR-1/2), and **the live preview does not serve the named SHA** (§Process note — the delta was audited too and is benign).

## Claim-by-claim verification (Muse's own runs)

- **Client-only changes — TRUE for both commits.** Diff vs `c4445ed`: zero changes under `server/`, `package.json`, `package-lock.json` at `df2e1d6`, and zero again in the live increment. No new dependencies, no new external origins.
- **Regression tests — PASS.** Full `npm test` exit 0 at `df2e1d6`. Browser: `t_welcome`, `t_registration`, `t_table_small`, `t_bizsearch` all pass; scanner CSP passes with SIMD and `--no-simd`. Authentication, registration, table, clubs and scanner behavior are preserved.
- **Premium UI checks — 293 ok / 2 failed** (`t_premium_ui`, Muse's run, identical result at `df2e1d6` and at the live increment): the failures are the two 320×568 sideways overflows in §MINOR-1/2. Everything else — no-scroll at 375/390/430, ≥44 px tap targets by real hit-testing, ≥11 px text, all key controls exercised (tabs, Member Home doors, section switcher, leaderboard→profile, Learn, Director, directory, opportunity list/detail, business form, scanner, profile sheet, table Fold/Call/Raise/sizing/Back) — passes.
- **R2 mobile fixes — PRESERVED, one improved.** `t_mobile_ux` on the premium tree: 58 ok / 14 failed vs the RC's 57/15 — **no new failures**, the same 1–2 px badge/stack grazes as the RC, and **the 320×568 top-bar check now PASSES** ("Test Player 07" shown in full — the crest-only header below 380 px works; Muse's own renders confirm the full name fits at both 320 and 390 px).

## Process note (important, zero product impact)

The preview service **does not serve `df2e1d6`**: its `style.css` hash matches **`7dabbc3`** ("Premium UI increment 2") on the separate `preview-premium-ui` branch — one commit ahead, exactly as Claude's handoff warned ("the coordinator fast-forwards preview-premium-ui to each tested SHA"). So the founder's hands-on review was of `7dabbc3`, not the named SHA. Muse audited the delta as well: +90/−19, client-only, and purely presentational — section naming (Home → **The Lounge**, Poker → **The Strategy Table**, Business → **The Exchange**, Opportunities → **The Bulletin**, Learn → **The Salon**), the brand line ("Blindrise · Private Members Club", motto "Pull Up a Chair. Good Company. Meaningful Connections."), and refined tokens. Same 293/2 test result. **This verdict therefore covers both `df2e1d6` and the live `7dabbc3`. Condition for future decision reviews: pin the preview to the exact audited SHA** — a moving preview silently changes what "reviewed" means.

## Visual & feel assessment (Muse's own renders, real fonts, local build of the live increment)

**It reads as a premium private members' club, not a casino dashboard.** The vocabulary does the work: a personal greeting by first name, "MEMBER" standing, doors instead of game tiles, trust copy ("Members' businesses, shared in trust"), and the Lounge/Strategy Table/Exchange/Bulletin/Salon naming. The table keeps the calm green felt with navy/gold plates — no neon, no slot-machine chrome, no urgency mechanics. Design language is consistent across Home, Leaderboard, Learn, Director, both clubs, scanner, profile and dialogs (one token system, serif display type, gold hairlines).

**Sticky header / navigation (owner's specific question):** the layout is a fixed full-viewport column — brand header (crest, member chip, sign-out) and the 61 px bottom tab bar never move; content scrolls in `#lobbyBody`; the section pill nav (`NAV.home-nav`, 65 px) is `position: sticky` inside that flow. Scrolled-state renders at 320×568 show stable chrome, no content sliding under the header, and the member's full name readable at all times. Screen-space cost on the smallest phone: header ≈64 px + tab bar 61 px are always spoken for (≈22% of 568 px), plus the sticky pill row while scrolling — noticeable but the content remains fully usable; see MINOR-3.

## Findings

**CRITICAL:** none.
**MAJOR:** none.

**MINOR-1 — Opportunities sideways overflow, 320×568 (3 px).** The filter-chip row (`.bz-chips`) extends to x=323 inside the 320 px scroller; the third chip's edge is clipped and the pane can nudge sideways. Content remains reachable. Fix before production (R2's standard was zero sideways scroll); does not block the preview.
**MINOR-2 — Profile sheet button overflow, 320×568 (5 px).** A red button (`.btn-red`) is 291 px wide in a 286 px glass sheet. Same class as MINOR-1.
**MINOR-3 — Two navigation layers + sticky cost.** The sticky section pills (Poker/Exchange/Bulletin) duplicate the bottom tab bar's job and consume 65 px while scrolling on small phones; consider whether both layers earn their space. Also at 320 px "The Strategy Table" heading wraps to three lines and its subtitle truncates ("Poker · Club tou…").
**MINOR-4 — Accessibility residuals (not formally measured).** Text-size and tap-target floors pass in tests; Muse did not run contrast metering on the new gold-on-navy eyebrows or a reduced-motion pass — recommend both before production, with the Welcome footer microcopy (≈4.0–4.5:1) as the known floor item.
**Noted, per owner instruction routed to the Founder Vision backlog (not findings here):** the "0 points" standing on Member Home, and community-gravity improvements. The preview is not blocked by them.

## Bottom line

The premium preview preserves everything R2 fixed, fixes one R2 nit outright (small-phone top bar), keeps the server untouched, and lands the founder's members'-club feel convincingly. Remaining items are two 3–5 px overflows on the smallest phone, navigation-layer economy, and pinning future previews to the audited SHA. **Cleared to keep showing as a preview. Not a production candidate** — that path still runs through the R2 gates.
