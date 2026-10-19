# MUSE VERDICT — Round-2 candidate `958e7c0` (r2-integration)
**Date:** 2026-10-18 (~15:15 EDT) · **Auditor:** Muse · **Verdict: PASS ON BRANCH — NOT a tournament-night candidate**

Full evidence: `BLINDRISE-CONSOLIDATED-TOURNAMENT-NIGHT-2026-10-18.md` §5b.

## Verified
- Layout matrix fully green on Muse's runs (production fonts): `t_table_layout` 2304/0, `t_positions` 356/0, npm chain exit 0, `t_stability` 210/210, `t_premium_ui` 296/296, `t_hotfix` 42/42 (handoff claims 50/0 — count differs, zero failures both).
- The green matrix was earned with layout changes (micro look, pot-at-left, nearest-clean-spot chip placement, 12 %+3 px ownership), NOT test loosening: the test diff only filters undrawn (`getClientRects()`) elements from measurement; no assertion/threshold/tolerance changed.
- Overlap probe: zero issues at 844×390, 932×430, 390×844; at 568×320 the micro look is active, hero clean, no cross-seat contacts (the probe's 16 flags there are hidden-element measurement artifacts — opponents' backs are display:none in micro mode).
- Gameplay UI fixes are client-only and covered by `t_positions`: dealer/blind chip ownership; whole-live-pot readout (`d.pot` + in-hand street bets — fixes a display defect where the centre understated the live pot, e.g. 150 shown vs 950 live; server accounting was never wrong); no stale action pill on the acting seat; double-tap lock with same-seq resend after 4 s.
- Server diff vs production `5c7ee11` = the invitedBy privacy hunk only; package.json diff = the `t_invite_privacy` chain line only. Engine/fairness untouched.

## Notes
- Preview (blindrise-preview.onrender.com) serves `958e7c0` byte-for-byte as of ~15:10 EDT (app.js SHA-256 `0dd9ba05…`), despite the handoff's "not moved" note. Owner iPhone checks on the preview now exercise THIS build, not `330863f`.
- Disclosed flake: "BB chips nearest their seat" failed once in 18 runs under parallel load (harness settle timing); test now waits for layout settle. Standing harness-fragility pattern, not a product defect.

## Ruling
`330863f` remains tonight's only CONDITIONAL-PASS candidate. `958e7c0` ships only after: owner decision to include gameplay-surface changes, owner iPhone acceptance of this exact build, and the full §7 gates with a GO naming `958e7c0`. Recommended path: `330863f` tonight (if gates are met), `958e7c0` as the first post-tournament release.
