# MUSE ADDENDUM — Gemini UX Addendum: 10 hypotheses tested (Release 1)

Filed by: Muse (Marlowe), independent auditor
Date: 2026-10-16 (late evening EDT)
Subject: Gemini's second UX report, treated per the owner's directive as
HYPOTHESES to test, not proven defects. Each item: verdict PASS / FAIL /
NOT VERIFIED + real severity BLOCKER / MAJOR / POLISH, from RC code
(rc-2026-10-17, files pulled and hash-recorded in rc-preaudit/ + client2/)
and the live staging walk (9026503, premium quality audit). Only proven
critical problems may stop Release 1. Where Claude already fixed an item,
that is recorded with evidence; no duplicate development is requested.

## Results

| # | Hypothesis | Verdict | Severity |
|---|---|---|---|
| 1 | iOS input auto-zoom (form fonts < 16px) | PASS with exceptions | POLISH |
| 2 | Tabular numbers for timers/chips | PASS | — |
| 3 | Safe-area insets + dynamic viewport | PASS (safe-area); dvh/svh absent | POLISH |
| 4 | Connecting / Reconnecting UI | PASS (code); live force-disconnect NOT VERIFIED | — |
| 5 | Time Left / Current Blinds readability | PASS | — |
| 6 | Consistency (colors, icons, cards, type) | PASS (see icons.js note) | — |
| 7 | Card-suit glyphs on iOS | PASS (approach); device rendering NOT VERIFIED | — |
| 8 | Table render quality / canvas sharpness | PASS | POLISH (confetti only) |
| 9 | Real-mobile performance / layout | NOT VERIFIED | device gate |
| 10 | No regression (Tournament / WebSocket / Director) | No regression found in reviewed diff; final verdict pending freeze + gate-3 suites | gate |

## Evidence per item

1. **iOS auto-zoom.** The pattern that prevents iOS focus zoom (>=16px on
   form controls) IS applied to the main forms: style.css `.glass
   input/select` 16px, `.form input/select` 16px, `.chat-form input`
   16px, `.start-pick select` 16px, `.bz-form textarea` 16px. Two
   sub-16px exceptions: `.copy-row input` 13px (the invite-link copy
   field) and `.op-select` 15px (an Opportunity select). Neither is a
   primary form; worst case is a slight zoom on those two controls.
   POLISH, Release 2 tidy-up; not a launch issue.

2. **Tabular numbers.** style.css defines `.num{font-variant-numeric:
   tabular-nums}` and `.hn` tabular; the turn-seconds element carries
   class `num`, as do bet/pot amounts. Timers and chip counts do not
   jitter. PASS.

3. **Safe area / viewport.** index.html viewport meta includes
   `viewport-fit=cover`. `env(safe-area-inset-bottom)` padding is applied
   to the table controls, chat sheet, and opportunity sheet;
   `env(safe-area-inset-top/bottom)` on the auth screen. No `dvh`/`svh`
   units are used; two sheets still cap height in `vh` (chat 58vh/34vh,
   opportunity sheet 92vh) — a minor cosmetic risk when mobile browser
   chrome shows/hides. Safe-area half PASS; dynamic-viewport half
   partially addressed. POLISH.

4. **Reconnecting UI.** `#offline` banner "Reconnecting..." exists
   (index.html), styled as a fixed top-center pill, shown on socket
   close and hidden after successful auth. Retry logic: fast retry
   250–1000 ms on close code 4001 (deploy handover), otherwise
   exponential backoff capped at 8000 ms. PASS at code level. A forced
   live disconnect was not performed during the staging walk, so the
   banner's live appearance is NOT VERIFIED; the deploy-day smoke can
   observe it during the real handover.

5. **Timer / blinds readability.** Turn bar 6px with gradient fill
   (green, turning red when low, gold on extra time) plus a seconds
   readout; clock label switches between "Time left" and "Blinds up
   next hand"; current blinds shown with a small muted label. The
   premium-quality staging walk found the timer bar and hand panel
   legible in play. PASS.

6. **Consistency.** One theme: a single `:root` palette (ink, panel,
   gold, blue, red, felt) and one type pairing (IBM Plex Sans / Sans
   Condensed) across poker, Business, and Opportunity; the staging walk
   found one coherent design system with no template drift. Icons are
   inline SVG from a single shared library (`Icons.svg/el/cat`, loaded
   via `/icons.js` in index.html). icons.js VERIFIED on the RC branch:
   exists (69 lines, 5.96 KB, SHA-256
   d64790d602d50b2205f610a3a913a3e6b142a7040639a4cedefd05774cd46a0d),
   defines exactly `window.Icons = { el, svg, cat }` — the three methods
   app.js and business.js call — with a safe fallback (`P[name] ||
   P.other`) so an unknown icon name renders a placeholder instead of
   throwing. Inline SVG only, nothing fetched: CSP-clean. PASS.

7. **Suit glyphs.** Cards render as TEXT with the standard glyphs
   (spade/heart/diamond/club) and a CSS red class for hearts/diamonds —
   the iOS-safe approach, not emoji images. Approach PASS. Actual
   rendering on a real iPhone is NOT VERIFIED and rides on the owner's
   real-phone pass (same gate as item 9 and the card scanner).

8. **Table rendering.** The poker table is DOM/CSS, not canvas — it is
   resolution-independent and was polished in the live demo-table
   screenshots. Canvas appears only in: the decorative globe background
   (fixed 900px buffer), confetti (sized to innerWidth without
   devicePixelRatio scaling — a celebration effect only), and image
   preprocessing for avatars and the card scanner. Any softness is
   confined to effects, never the table. PASS; confetti DPR is POLISH.

9. **Real-mobile performance/layout.** NOT VERIFIED. The audit browser
   cannot emulate a true 390x844 device viewport; the app rendered as a
   centered phone-width column, representative of layout but not a
   substitute for the owner's real-phone pass (iPhone Safari / Android
   Chrome), which also decides the card scanner's R1 vs R2 placement.

10. **No regression.** WebSocket connect/reconnect code is UNCHANGED in
    the fresh RC pull (connect, auth handler, close-code handling all
    identical to the audited code). The Premium Home restructure
    (renderHome) is the main new regression surface; it is guarded by
    the gate-3 targeted suites on the frozen RC and the deploy-day
    smoke. The Director tab was not live-audited (auditor's staging
    account is a player account). Final verdict at freeze; no code-level
    regression found in the surface reviewed.

## Also closed in this pass

- **/login fix VERIFIED** (premium audit POLISH item): server/index.js
  at 9e124ba, SHA-256 2f982d8f738d1b195568662da02ebe439fcd9ca558d0b39ffc0b4c8ebc9190b8,
  line 197 serves index.html for `/`, `/login`, and `/join/...` — the
  bare unstyled 404 is gone.
- **M-2 fix** was verified earlier at code level in the fresh
  business.js (search makes spotlight, "New to the Club", and the count
  agree; designed empty state with Clear search).

## Bottom line

No BLOCKER and no MAJOR arises from Gemini's 10 hypotheses. Two items
are device-dependent (7 rendering, 9) and ride on the owner's real-phone
pass; one (10) closes at RC freeze with the gate-3 suites. Nothing here
changes Release 1 scope, and no new development is requested from this
addendum.

— Muse (Marlowe), independent auditor. Silence is not approval; this
addendum is evidence for the Release 1 report, not a deploy verdict.
