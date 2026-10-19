# Muse DEFECT — integrated candidate 443a27f: helper advice still truncated in PORTRAIT at 320×568

**From:** Muse (independent audit), 2026-10-18 ~12:50 EDT
**Candidate:** `r2-integration` @ `443a27f` (8eee0a5 + 06e6e9c + 1cb2b89 + helper fix)
**Severity:** MINOR layout defect — but RELEASE-BLOCKING for tonight's candidate, because the tournament-night directive's acceptance is that helper advice is never truncated, and the fix commit's own new assertion now proves one case still truncates.
**Scope of the rest of the audit so far (all PASS on this exact tree):** npm chain exit 0 (incl. t_invite_privacy 7/7, t_security clean); t_stability 146/146; t_hotfix 42/42; t_mobile_ux pass; server diff vs production 5c7ee11 = exactly the invitedBy privacy hunk; package.json diff = test chain only. Engine/fairness files untouched.

## The failure
`t_table_layout` on the integrated tree: **431 ok, 1 failed** —
`FAIL 320x568 2 players: the helper's advice is not cut off ("💡 Call needs 31%, you have 65%: calling pays. You can raise for value.")`

Every other size/player combination passes, including all landscape cases (the 443a27f fix works sideways) and the "chance to win shows once" checks.

## Muse's independent reproduction (320×568, 2 players, same injected state as the suite)
- `#game` classes: `screen h700 h600 seated`
- `.h-have` span: `display:none` ✓ (the duplicate-figure part of the fix works here)
- Visible advice: `💡 Call needs 31%: calling pays. You can raise for value.`
- `.h-line`: **clientWidth 235, scrollWidth 324** → ~89 px of the sentence is not rendered
- `.h-line` computed style: `overflow:hidden`, **`-webkit-line-clamp: 1`** — in portrait the line is still clamped to ONE line
- `#helper` itself is not clipped (clientHeight 32 = scrollHeight 32); the clipping is inside `.h-line`

Root cause: 443a27f gave the LANDSCAPE helper up to three lines and dropped the duplicated figure on short screens, but the portrait `.h-line` remains single-line-clamped. At 320 px wide, the longest advice variant ("…calling pays. You can raise for value.") exceeds one line even with the figure dropped. This case never failed before because the no-truncation assertion itself was added by 443a27f.

## Requested fix (implementation choice is Claude's)
Make the portrait short-screen helper able to show the full advice — e.g. allow `.h-line` up to 2 lines under `h700`/`h600` with the `reserveDock` model aligned so the dock reserves the measured height — or shorten the advice copy. Either way:
- Full `t_table_layout` matrix green (all sizes × 2–9 players), including 320×568 at every player count
- The "chance to win shows once" checks stay green
- No change to server code, engine, or fairness (client-only, like the rest of this candidate)
- New SHA on `r2-integration`; Muse delta re-audit follows on the exact SHA

**Clock:** tournament tonight 22:00 EDT; Muse verdict is due by 19:00 EDT; production changes freeze at 21:00 EDT. A fix landing by ~17:00 EDT keeps the integrated candidate on schedule. If it cannot land safely, the fallback stands: ship `8eee0a5` alone under its own gates rather than an unverified candidate.
