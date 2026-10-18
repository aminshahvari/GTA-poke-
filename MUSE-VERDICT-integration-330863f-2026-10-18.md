# MUSE VERDICT — Integrated candidate `330863f` (r2-integration)
**Date:** 2026-10-18 (~14:10 EDT) · **Auditor:** Muse · **Verdict: CONDITIONAL PASS**

Supersedes `443a27f` (FAIL — confirmed hero-seat overlap, `MUSE-DEFECT-landscape-hero-overlap-2026-10-18.md`, AC1–AC5). Full evidence: `BLINDRISE-CONSOLIDATED-TOURNAMENT-NIGHT-2026-10-18.md` §5a.

## Results against AC1–AC5
- **AC1 PASS** — Muse overlap probe (intra-seat + cross-seat + dock, 9-handed, hero's turn, production fonts): zero issues at 844×390, 932×430, 390×844, 568×320. Landscape: hero cards beside the plate, 8 px gap. Portrait / small-landscape: cards end 2 px above the plate. (443a27f measured ~14 px overlap at 844×390, overlaps at all four sizes.) Muse screenshot at 844×390 visually confirms.
- **AC2 PASS** — no seat element clipped at the bottom edge at any probed size; names/stacks fully inside the table area (area still ends ~2 px above the viewport bottom in landscape, as designed).
- **AC3 PASS** — zero seat/dock overlaps at all probed sizes incl. 568×320.
- **AC4 PASS WITH DISCLOSED EXCEPTION** — `t_table_layout` gained the required intra-seat assertions (21-size matrix). Muse run under production fonts: **2298 ok / 6 failed**, identical to Claude's disclosed set: 320×500 at 7p (Ben×Christina touch), 8p + 9p (chip stack touches hero's cards); 568×320 9p (Alexandra's card backs × Ben's plate); 812×320@44px-inset 4p (top badge × board area). Accepted by Muse as known limits for tonight (extreme geometries; the defect class this release fixes is eliminated) and recorded as post-tournament backlog — NOT waived silently. Also disclosed: felt-ratio minimum <800 px tall relaxed 0.95 → 0.8 (cosmetic; old candidate measured 0.86–0.94 there too).
- **AC5 PASS** — server diff vs production `5c7ee11` = exactly the invitedBy privacy hunk (+3/−1, `server/index.js`); package.json diff = only the `t_invite_privacy` chain line; server/package diff vs `443a27f` empty.

## Regression
npm chain exit 0 · `t_stability` 210/210 · `t_hotfix` 42/42 · `t_premium_ui` 296/296 · extraction hash-verified (app.js SHA-256 `35986e95…`).

## Preview
blindrise-preview.onrender.com serves `330863f` byte-for-byte (hash-verified by Muse 14:10 EDT; health mode "file"). The handoff's "preview not moved" note is stale — the hash is the authority.

## Conditions
Deployment requires ALL of: fresh verified backup with recorded artifact; rollback readiness (target = live deploy of `5c7ee11`); idle service reconfirmed immediately beforehand; **owner iPhone acceptance on the preview**; owner explicit GO naming `330863f`. All changes complete by 21:00 EDT; no deployment during the 22:00 tournament. Fallback if any gate fails: production stays on `5c7ee11`.

Not in this candidate: the sibling dealer/blind/pot/stale-pill/double-tap fix set (separate future candidate, per handoff; verified absent by diff).
