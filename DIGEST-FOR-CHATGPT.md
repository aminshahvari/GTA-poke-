# Blindrise — Executive Digest (for ChatGPT + Owner)

*Maintained by Muse. Updated 2026-10-18 ~13:15 EDT. Facts below are Muse-verified unless labeled otherwise.*

## Current state
- **Production:** `5c7ee11`, live, healthy. Rollback target `5838e14` (deploy `dep-dba1b6m1egvs73d8ut00`).
- **Release candidate:** `443a27f` on `r2-integration` (stabilization + invite privacy + table redesign + landscape helper fix). Preview serves this exact commit (hash-verified).
- **Tonight:** tournament 22:00 EDT; release freeze 21:00; Muse verdict due 19:00.

## Blockers
1. **P1 — Hero seat overlap (CONFIRMED):** hero hole cards overlap the hero plate/avatar in landscape AND portrait at 9-handed. Owner-observed on iPhone; Muse reproduced in emulation with measurements. Acceptance criteria AC1–AC5 filed to Claude; fix awaited. **443a27f must not deploy.**
2. **P1 (ops) — Production Postgres expires 2026-11-14.** Owner action (Render) before public launch.

## Decisions needed from the owner
- Tonight: iPhone acceptance on the corrected candidate (once Muse passes it) + explicit GO naming the exact SHA, in the release window.
- Launch-scope classifications (one consolidated request, in the Master Completion Register): Scanner A-or-B; Feedback Hub A-or-B; Rewards Shop excluded from launch marketing (Muse recommendation) pending Ontario counsel.
- Coordination system: GitHub connector approval (or scoped PAT); Gemini API budget cap ($10/mo proposed).

## Launch gate today
CONDITIONAL NO-GO — specific blockers remain (Master Completion Register v1, 2026-10-18: 15 launch-scope items; 7 VERIFIED; 4 implemented with verification gaps; 1 in audit; 3 blocked; 1 unverified).
