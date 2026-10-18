# Muse DEFECT (CONFIRMED, release-blocking) — hero seat composition overlaps; landscape table sits flush to the bottom edge

**From:** Muse (independent audit), 2026-10-18 ~13:05 EDT
**Candidate:** `r2-integration` @ `443a27f` — **do not deploy this SHA.** Owner-observed on a real iPhone (preview) and independently reproduced by Muse in emulation with the production font set.
**Owner's report:** in landscape, the table is positioned too low and the bottom player's (hero's) cards and information overlap. Owner has NOT approved iPhone acceptance.

## Muse's reproduction (injected 9-handed table, hero's turn, production fonts)
**844×390 (iPhone landscape):**
- Hero hole cards: y 272–348 · Hero plate: y 334–371 → **cards overlap the plate by ~14 px**
- Hero avatar: y 340–366 → **cards overlap the avatar as well**
- Table area: y 51–**388 of 390** → the table area is flush with the viewport's bottom edge (2 px margin) — the "table too low" the owner saw; the hero seat group is squeezed at the bottom of the felt.

**Also reproduced:**
- 932×430 landscape: hero cards overlap hero plate.
- **390×844 PORTRAIT, 9-handed: hero cards overlap hero plate** — the intra-seat overlap is not landscape-only; landscape makes it worst.
- 568×320 small landscape: hero avatar AND plate overlap the **dock**, plus cards overlap plate.

## Why the suite did not catch it
`t_table_layout` builds each seat's box as the UNION of avatar + plate + badges + hole cards, then checks union-vs-union overlaps and union-inside-area. Overlap *within* one seat (cards over its own plate/avatar) is invisible to it, and the area check passes because the union is inside. The assertions need an intra-seat term (AC4).

## Acceptance criteria for the corrected candidate (Muse will verify on the exact SHA)
- **AC1:** At every matrix size (portrait and landscape) and 2–9 players, the hero's hole cards have **zero overlap** with the hero's plate and avatar (bounding boxes; ≤1 px rounding tolerance). The same holds for every seat's cards vs its own plate.
- **AC2:** In landscape, no seat element is flush-clipped at the viewport's bottom edge: every seat's full group (avatar, plate, cards) renders inside the table area with its information (name/stack) fully visible — nothing covered by the seat's own cards.
- **AC3:** No seat element overlaps the dock at any size, including 568×320.
- **AC4:** `t_table_layout` gains intra-seat assertions implementing AC1–AC3 (so the blind spot closes permanently), and the full matrix passes **432+/0 under the production font set**; all other suites stay green (npm, t_stability, t_hotfix, premium, t_mobile_ux).
- **AC5:** Client-only change. Server diff vs production `5c7ee11` remains exactly the invitedBy privacy hunk; package.json diff remains the test chain only.

## Rest of the audit on 443a27f (for the record)
Mobile stability (viewport probe Δ0/0.0 px), invitation privacy (probe: zero exposure; t_invite_privacy 7/7), tournament integrity (npm chain incl. sim/stress green) — all PASS on this SHA and are being re-verified in depth under the owner's final-audit directive (dealer/blinds vs engine state, pot accounting, coaching labels, single-action processing). The layout defect is the sole release blocker known on this candidate.

**Clock:** fix + Muse re-audit must complete before the 21:00 EDT freeze; tournament 22:00 EDT. Fallback if a safe corrected candidate cannot be audited in time: preserve production `5c7ee11` (owner's ruling), or ship `8eee0a5` alone under its own gates.
