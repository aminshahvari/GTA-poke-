### 1. Recommended Composition: The "Balanced Hybrid"

Candidate A is superior for a "premium" feel, but its 6px dead band is too restrictive for functional UI. Candidate B wastes 33% of the viewport, making a 9-seat game feel cramped. 

**Recommendation: Hybrid Stadium**
*   **Felt Aspect Ratio:** 1.68 – 1.72. This maximizes lateral space for 9 seats while preventing the "tall/narrow" look.
*   **Felt Bottom Placement:** 82% – 85% of viewport height.
*   **Max Dead Band:** 16px – 24px. This provides enough "air" for the hero seat to breathe without the UI feeling disconnected.

**Rationale:** This hybrid preserves the immersive "full-screen" look of Candidate A while carving out a dedicated 15-18% "Utility Zone" at the bottom for the action dock and hand-helper.

### 2. Winner Announcements: Multi-Line Dynamic Overlay

To solve clipping for split-pots and multi-pot wins, move the announcement logic away from a single fixed line on the felt.

*   **Placement:** Centered overlay positioned directly over the community cards (the "Pot Zone").
*   **Typography:** Use a two-line dynamic stack. 
    *   *Line 1:* Winner Name(s) (e.g., "Player 4 & Player 7").
    *   *Line 2:* Hand Rank + Amount (e.g., "Full House - 450 BB").
*   **Visuals:** Use a semi-transparent dark pill background (60% opacity) with white/gold text.
*   **Timing:** 
    *   **Showdown:** 1.5s delay to allow card reading.
    *   **Duration:** 3.0s – 4.0s (scaled by pot complexity).
    *   **Clearance:** The overlay must fade out immediately when the "Next Hand" animation begins to ensure the end-of-hand state is distinct.

### 3. Hand-Helper Placement: The Utility Dock

The hand-helper (hand name, equity, advice) must be decoupled from the felt to avoid overlapping hero cards or seat tags.

*   **Placement:** Integrated into the top-tier of the **Action Dock** (the area below the 85% felt line).
*   **Layout:** A horizontal "Status Bar" spanning the full width of the phone.
    *   **Left:** Current Hand Rank (e.g., "Flush Draw").
    *   **Center:** Equity/Strength Bar (visual gradient).
    *   **Right:** Strategic Advice/Odds.
*   **Hierarchy:** This bar sits directly above the primary action buttons (Fold/Call/Raise). 
*   **Benefit:** By placing it in the dock, it remains persistent throughout the hand without obscuring the hero’s hole cards or the felt’s visual integrity. This solves the "unused lower screen" feedback by filling the gap with high-value data.
---
*Provenance (Muse hub log): Gemini strategy exchange #1. Called 2026-10-19T15:05:19-04:00 via gemini_exchange.py, model gemini-3-flash-preview, max-output-tokens 1500, single bounded call under the owner-approved CAD $10/month cap. Prompt: the two audited stadium compositions (Candidate A elongated full-span vs Candidate B compact-above-dock), the D1 winner-line clipping defect, and owner feedback; asked for measurable composition guidance, a non-clipping winner-announcement pattern, and hand-helper placement. The response above is Gemini's, verbatim. Status: design REFERENCE for Claude + owner — not an instruction, not acceptance.*
