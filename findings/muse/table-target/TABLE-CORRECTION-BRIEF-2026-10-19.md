# TABLE CORRECTION BRIEF — build THIS table (owner reference governs)

**From:** Muse (independent audit), on the owner's direct instruction, 2026-10-19.
**Applies to:** `preview-premium-ui` / `table-stadium`, current tip `75365c0`.
**Reference image (owner-supplied, governing):** `owner-reference-2026-10-19.jpg`, filed with this brief on the `ai-hub` branch at `findings/muse/table-target/`. When this text and the image ever disagree, the image wins.
**Status of prior directions:** the full-height "WPT stadium" direction is CANCELLED by the owner. Commits `1a451c2`, `487102f`, `75365c0` implement a design the owner has rejected repeatedly. Do not iterate on it further.

---

## 1. What the owner wants (read the reference image)

A classic WPT/WSOP-style mobile poker table:

- A **complete racetrack oval**, entirely visible on screen, with a **thick, padded rail** (wide dark rim with a gold trim line on its inner edge). The rail is a major visual element, not a 1 px border.
- **Players sit ON the rail band, behind the table** — compact seat units anchored to the rail: a round avatar (~40–44 px) centered on the rail; the player's two card-backs **fanned behind the avatar, outside the felt**; a **slim horizontal name/stack plate** (pill) hanging on the OUTER side of the rail, carrying the position badge (D / SB / BB). **No part of any seat unit sprawls across the green.** In the current build the pods are tall boxes centered on the felt's edge with the cards lying on the felt — that is the defect.
- On the felt, and ONLY on the felt: the board, the pot, each player's bet (chip + amount, in front of their seat), the dealer button, and showdown overlays. Nothing else lives on the green.
- **Hero sits bottom-CENTER**: plate below the bottom rail (outside the felt), hole cards face-up, large, centered, overlapping the bottom rail from inside.
- **Dock = one bottom bar below the table**, fully off the felt: a slim timer/raise-slider row, then **three buttons in a ROW — FOLD | CALL | RAISE** — full width. Not a right-hand column.
- HUD stays a slim top strip (level / blinds / clock / lobby).
- Approximate vertical budget at phone sizes: HUD ≈ 7% vh, table zone ≈ 72% vh, dock ≈ 16% vh, margins make up the rest.

## 2. Why the current build fails (root cause, from your own code)

This is not a tuning problem; the geometry model is wrong in three places:

1. **The felt is not a table, it's a capsule.** In `tableGeo()` (WPT branch) the felt height is `fh = H + W/2 − top` — deliberately extended half a screen-width BELOW the viewport ("its sides run straight to the bottom of the screen", commit `487102f`; "the felt fills the screen from the header down", `1a451c2`). A real table is a complete oval that fits between the HUD and the dock. Delete the off-screen extension entirely: felt height is derived from its own aspect ratio and the space between HUD and dock, never from `H + below`.
2. **Seats are centered ON the felt boundary.** The seat ring is computed so a seat's middle sits "just inside" the rail, and `.seat` uses `translate(-50%,-50%)`, so half of every ~84 px pod — plate included — lands on the playing surface and the hole cards render on the green. In the target, the seat unit is anchored to the RAIL BAND: avatar center within the rail band, plate fully outside the felt's inner edge, cards behind the avatar.
3. **The dock has nowhere to go, so it renders on the felt.** Because the capsule consumes the whole screen height, the helper, timer, hero cards, and the FOLD/CALL/RAISE column all paint over the green. With a complete oval (rule R1 below) the dock gets its own zone and this resolves structurally.

## 3. Non-negotiable geometry rules (measurable — Muse will measure them)

- **R1 — Complete oval.** The entire felt + rail bounding box is inside the viewport at every supported size. Felt bottom ≤ the dock's top edge; zero overlap between the felt and ANY control (buttons, slider, helper, hero plate).
- **R2 — Proportions.** Portrait racetrack: height / width ≈ 1.35–1.50. Felt width = viewport width minus the room the outside plates need (plates may touch the screen edge; the felt may not).
- **R3 — Rail.** A visible padded rail band ≈ 14–18 px wide around the felt, gold trim line on its inner edge, at all sizes.
- **R4 — Seats on the rail.** For every seat: (a) avatar center lies within the rail band (±6 px); (b) the name/stack plate's intersection with the felt's INNER ellipse (the green) is **0 px²**; (c) hole card-backs sit behind the avatar, outside the green (a ≤ 25% peek over the rail's inner edge is acceptable, lying flat on the green is not); (d) seat units never overlap each other at 2–9 players.
- **R5 — Felt contents.** Board, pot, bets, dealer button, winner/showdown overlay only. The social-play notice is a one-time toast + the persistent dock line — never a card parked on the felt.
- **R6 — Hero bottom-center.** Plate centered below the bottom rail, outside the felt; hero cards face-up overlapping the bottom rail, centered.
- **R7 — Dock.** Below the table: timer/slider row, then FOLD | CALL | RAISE in one row. The hand helper renders in the dock zone (a pill above the buttons is fine) — never on the felt.
- **R8 — All sizes, all counts.** Rules hold at 320×568, 375×667, 390×844, 393×852, 430×932, for 2, 6, and 9 players, preflop and postflop, portrait; landscape keeps the same oval-and-ring composition centered (no second geometry model).

## 4. Acceptance — self-verify BEFORE you report (this is the step that keeps being skipped)

The owner has rejected this table repeatedly because builds arrive unverified against his picture. This time:

1. Extend `t_table_layout` with automated assertions for R1, R2, R4(b), and R7 (bounding-box / ellipse-intersection checks on the real rendered layout, all sizes in R8, 6- and 9-handed).
2. Produce a screenshot matrix (the R8 sizes × preflop/flop, 6-handed) and attach it to your report on this issue.
3. In your report, state each rule R1–R8 and its measured result. "Looks right" is not a result.
4. Muse will independently re-measure the same rules on the same SHA. A build failing any of R1/R4/R7 is a FAIL without discussion; expect the loop to be short if the measurements above are honest.

## 5. Scope and process

- Client-only change (`public/app.js`, `public/style.css`, layout tests). **Server diff must remain zero.**
- Keep the social-play notice work already merged (`6aa7d91`) — repositioned per R5, not removed.
- Keep the WPT column work that is still valid inside the dock (fixed rows, 44 px targets) — reworked into the R7 row layout.
- Winner-line fix (full split/multi-pot text) must not regress: the winner announcement renders whole (overlay over the pot zone per R5 is acceptable and matches the reference style).
- Build on the table branch, deploy to preview, report the exact SHA + matrix + measurements on Issue #4. Production is not touched; release remains a separate owner GO.

— Muse, 2026-10-19. Owner reference image attached to the Issue #4 filing and stored with this brief on `ai-hub`.
