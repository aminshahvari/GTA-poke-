# MUSE ADDENDUM — Issue #4: owner-approved table direction supersedes Muse criterion G1
**Date:** 2026-10-19 (~10:30 EDT) · **Author:** Muse · **Re:** owner directive "BLINDRISE — OWNER-APPROVED MOBILE TABLE REDESIGN" (relayed by the owner in chat 2026-10-19, with the approved Blindrise concept image)

## What changed, stated plainly
This morning's Muse Issue #4 audit proposed criterion G1: portrait felt aspect h/w ≤ 1.05 (near-round). The owner has now decided the open design question himself, in the opposite direction: **an approved, tall, vertically elongated oval** (straight sides, rounded ends, WPT-style proportions per his reference), with the explicit instruction not to substitute a round table. **G1 is withdrawn and replaced.** The basis change is the owner's explicit design approval of the concept he supplied — recorded here so no one audits the candidate against a dead criterion.

Re-reading the owner's original complaint against his approved concept, the defect was never tallness itself: the shipped table is tall AND floating — it ends at 67% of the screen with a dead void beneath. The approved concept is tall AND viewport-filling: table and seats span the height, hero at the bottom, controls integrated. "Tall/narrow + empty below" is what he rejected; "tall + full" is what he approved.

## Revised acceptance criteria for Claude's candidate (replacing §4 of the Issue #4 audit)
- **G1′ Proportions:** vertically elongated oval, straight sides + rounded ends, matching the approved concept's composition as closely as the real components allow; felt + perimeter seats span the portrait viewport (composition anchored top-to-bottom, no floating table).
- **G2 Viewport use (unchanged in substance):** below-table dead space ≤ 12 px unassigned band inside the table area; no large void under the composition at 390×844 or on short Safari viewports.
- **G3 Winner legibility (unchanged):** result text fully rendered, scrollHeight ≤ clientHeight, at 320–430 px widths.
- **G4 Overlay discipline (unchanged):** coach/reset overlays cover 0 px² of hero cards, dismissible, auto-expiring.
- **G5 End-of-hand state (unchanged):** legible on-table winner + amount + hand for the full result pause.
- **G6 Landscape + stability (unchanged):** landscape composition stable and readable; no overlap/clipping for 2–9 seats anywhere; the rotation/settle behaviour of 4423a07 must not regress.
- **Identity (owner, explicit):** geometry/layout ONLY — existing navy/gold/green identity, typography, components and interactions preserved; no WPT logos/artwork; game logic untouched.
- **Evidence:** exact SHA + real-size portrait/landscape screenshots + geometry numbers, then Muse audit, then owner iPhone acceptance. Production stays on 4423a07; no merge/deploy without separate owner GO.

## One caution for the implementer (recorded, not a reopening)
The concept is a mock: its right-side raise-preset stack overlaps the felt edge and its hero cards overlap the bottom rail. The audit will measure the real build's overlaps and control obstruction — "as closely as practical" governs where the mock and the no-overlap rule conflict.
