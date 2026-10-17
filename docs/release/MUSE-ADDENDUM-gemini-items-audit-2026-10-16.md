# Muse addendum — Gemini review items 1–3: audit result (all three satisfied by existing code)

Filed by Muse, Oct 16, 2026, ~23:00 EDT. Evidence: code read from branch `rc-2026-10-17` tonight (server + client; local copies with SHA-256 in Muse's audit workspace). **Conclusion: no new development and no risky change is needed for any of the three items. Claude has nothing extra to build for them.**

## Item 1 — Switching between Poker and Business/Opportunity must not disturb connection, timers or game state: PASS

- One WebSocket per client, created only in `connect()` (boot / auth) in `public/app.js`. The tab-bar click handler only changes the active tab variable, opens the club list view and re-renders — it never closes or reopens the socket.
- The action clock is rendered by a global `setInterval(tickClock, 200)` from the server-provided `deadline` (with `clockSkew` correction) — independent of which view is on screen. Game state lives server-side; returning to the table re-renders from state.
- Server side (verified in the RC pre-audit): a single socket carries club and table traffic; nothing about a client view switch reaches the game engine.

## Item 2 — In-game Poker priority; out-of-game clubs clearly accessible: PASS

- Default tab is Tournament; tab order: Tournament · Leaderboard · Learn · Business · Director.
- While the clubs are closed, the Business tab is hidden from members (`bizTab.hidden`), a member somehow on that tab is returned to Tournament, and members see the "Coming soon" announcement card instead. The owner opens the clubs from the Director tab switch (with a confirm step) — accessibility outside game time is one owner action, by design.
- In-game priority is implemented, not just layout: the Opportunity request badge on the Business tab and the "Community Opportunities" Home section are suppressed while the member is seated in a running tournament (`public/app.js` render logic + `OppClub.badge` / `mountHome` calls).

## Item 3 — Professional empty states; demo data never shown as real: PASS

- Both club clients render designed empty states (`bz-empty` cards with art, a heading, an explanation and a next action): "No member businesses yet", "No open listings yet", "No requests yet", "You have no listings", "All clear" (moderation queue), plus search/filter no-match states with a reset button. No blank or broken empty pages found.
- Demo data cannot reach production: `seedDemo` in both server modules and its boot call site are gated on `STAGING=1`, run once, and only into an empty store; production does not set `STAGING`. On staging the demo entries are labelled as demo. The only client-side "demo" is the practice-table card, whose copy states plainly that it runs only on the phone, saves nothing and awards no points.

## Note for the release record

These verdicts are code-level. The deploy-day smoke (§5 of the checklist) still includes one live pass: open both clubs as a member after the owner switch, switch tabs mid-hand on a demo table, and confirm the clock and connection hold — behaviour evidence on top of the code evidence.

— Muse
