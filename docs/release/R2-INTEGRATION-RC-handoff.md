# Integration release candidate for tonight: Muse handoff (NOT deployed)

Claude, 2026-10-18, ~16:50 UTC (12:50 EDT). Ordered by the founder's "Final integration directive" and "Tournament night emergency directive" (16:12–16:14 UTC).

**Candidate app SHA: `443a27ffd3b02cbf8c922e7fe71e716bccf91867`** on branch `r2-integration`. Any later commit on this branch is docs-only or test-only. Verify with `git diff 443a27f <head> -- public server package.json package-lock.json` = empty.

## Composition
| Part | SHA | Muse status |
|---|---|---|
| Stabilization RC (viewport, practice card, invite rows) | `8eee0a5` | PASS (`1f61b65`) |
| t_hotfix readiness wait + practice-card-while-seated coverage (test only) | `e774397` | new |
| Invite privacy (no `invitedBy` in member payloads) | `06e6e9c`, merged in `0b208c3` | PASS on branch (`9b80941`) |
| Table redesign | `1cb2b89`, merged in `13ff0d1` | PASS on branch (`8e2f914`), with one MINOR |
| Landscape helper fix (Muse MINOR on `1cb2b89`) | `443a27f` | new |

Both merges were clean; there were no conflicts.

The diff against live `5c7ee11` in server and package files is exactly the invite-privacy change:
- `server/index.js`: +3/−1, the member payload filter;
- `package.json`: `t_invite_privacy` added to `npm test`.

Nothing else on the server, so engine, fairness, storage and keys are untouched.

**Excluded:**
- gameplay options (`e391f8d`);
- club switching (`1463d1c`);
- the Celestia campaign (`dd68f4c`);
- the Rewards Shop, which is unchanged.

## The helper fix (`443a27f`)
- **Sideways (`#game.land`):** the helper shows the hand name and chance to win on row 1. The advice gets up to 3 full lines under them, and the dock's measured height follows (`reserveDock` sample: 3 lines when `land`).
- **Short screens (`#game.h700`, which includes sideways):** the advice drops its own ", you have N%" (`span.h-have`, hidden), because the same figure sits right above or beside it.
- **Portrait ≥700 px tall:** unchanged.
- **Advice markup:** now built from fixed strings and numbers only. `esc()` was removed from `advice` because it now contains the span; no user text ever enters it.
- **New `t_table_layout` assertions,** at every size (incl. 844×390) and 2–9 players: the advice is not cut off (scroll vs client box), and the chance to win is not shown twice on h700.

## Claude's test runs on `443a27f` (Chromium, real font cache)
| Test | Result |
|---|---|
| `npm test` (incl. `t_security`, `t_invite_privacy` 7/0, `t_clubs`, `t_csp`, sim 20) | exit 0 |
| `t_sim 3000` | random-action 3000 tournaments / 30,787 hands, 0 problems; 3000 AI tournaments, 0 problems |
| `t_stability` | 146 / 0 |
| `t_table_layout` | 432 / 0 (on `1cb2b89` with the new assertions: 1 helper-cut-off failure at 375×667, 2 players) |
| `t_hotfix` | 42 / 0 |
| `t_premium_ui` | 296 / 0 |
| `t_clubs_closed` | 25 / 0 |
| `t_mobile_ux`, `t_table_small`, `t_welcome` | pass |

**Known limits:**
- No Safari or WebKit testing.
- The helper's one-line clamp on 600–700 px portrait still applies to a long advice text. The test covers the texts its table states produce.
- On ≤600 px headers, average stack and rank are dropped (from `a6ef217`).

## Preview
`blindrise-preview` was moved to `443a27f` at ~16:50 UTC for the founder's iPhone acceptance (portrait and landscape). It runs on test data only.

## Release gates (unchanged)
1. Muse PASS on this exact app SHA.
2. Founder iPhone OK on the preview.
3. Idle service, reconfirmed right before the merge.
4. Fresh export: time, size and Completed recorded.
5. Founder GO naming the SHA.

The deploy is a fast-forward of `main` from `5c7ee11`. **Rollback target:** `dep-dba1ktbrjlhs73c6fdig` (`5c7ee11`). There is no data change either way: removing the `invitedBy` filter just restores today's payload. All of this must be done by 21:00 EDT. Fallback: `8eee0a5` alone.
