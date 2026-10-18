# MUSE VERDICT — Candidate `4423a07` (r2-integration)
**Date:** 2026-10-18 (~17:47 EDT) · **Auditor:** Muse · **Verdict: PASS**

Composition: `4423a07` = `958e7c0` (Round 2, Muse PASS ON BRANCH) + one commit: the iPhone rotation re-layout fix (`public/app.js` +22/−1, `test/ui/t_stability.js` +18). Extraction hash-verified (app.js SHA-256 `c056b1cb…`).

## The delta, verified line by line
New `settleTurn()`: on `orientationchange` / `screen.orientation` change / width-changing `resize`, it re-checks at 60/200/450/900 ms and drops the held layout lock ONLY when the width differs from the last settled width AND the live size differs from the size recorded when the lock was taken (`LOCK.iw`/`LOCK.ih`, newly stored in `newLock`). Height-only changes (toolbar, keyboard) never arm it and never drop the lock — the viewport-stability hold that the stabilization release exists for is preserved. No other app.js lines changed. The new `t_stability` late-turn case simulates iPhone Safari's late height reporting (old height held through the event, real height arriving silently) and asserts seat drift and game classes match a normal turn, both directions; no existing assertion/threshold/tolerance changed.

## Regression (Muse's runs, production fonts)
npm chain exit 0 · `t_stability` **220/0** (210 + 10 new late-turn checks) · `t_table_layout` 2304/0 · `t_positions` 356/0 · `t_premium_ui` 296/0 · `t_hotfix` 42/42. Overlap probe: zero issues at 844×390, 932×430, 390×844; at 568×320 the hero geometry is identical to `958e7c0`'s verified-clean run (the probe's 16 flags there are the known hidden-element artifacts of the micro look). Server diff vs production `5c7ee11` = the invitedBy privacy hunk only; package.json diff = the `t_invite_privacy` chain line only. Engine/fairness untouched.

## Identity checks
Preview (blindrise-preview.onrender.com) serves `4423a07` byte-for-byte (app.js SHA-256 `c056b1cb…`, Muse-verified during this audit) — so the owner's iPhone acceptance attaches to the exact audited build. Production still serves `5c7ee11` (hash `820b846f…`, healthz ok, postgres).

## Reconciliation with prior verdicts (explicit, per owner directive on Issue #3)
- `330863f` CONDITIONAL PASS stands on its own evidence; it remains the fallback candidate for tonight if `4423a07`'s remaining gates fail.
- `958e7c0` "not a tournament-night candidate" ruling: its grounds were (a) tonight's no-gameplay-changes exclusion and (b) no owner device acceptance. The owner has since (i) tested `4423a07` — the `958e7c0` descendant — on his iPhone and accepted it (recorded 21:26 UTC), and (ii) issued an explicit written directive making `4423a07` tonight's candidate. The exclusion is the owner's to lift, and he lifted it for this exact SHA. The ruling is therefore superseded BY THE OWNER for `4423a07` only; it was not silently substituted — this paragraph is the reconciliation.
- Gameplay-surface scope of `4423a07` vs `5c7ee11` = exactly the Round-2 set already audited (whole-live-pot readout, dealer/blind chip ownership, no stale pill on the acting seat, double-tap lock) plus this rotation fix. Nothing else.

## Remaining gates (not Muse's to close)
Owner iPhone acceptance: RECORDED for this SHA. Still required before any deploy: (1) Claude's live idle check on production; (2) fresh backup taken and VERIFIED, with the artifact recorded; (3) rollback readiness (target = live deploy of `5c7ee11`); (4) owner GO naming `4423a07`. All by 21:00 EDT; no deployment during the 22:00 tournament. If any gate is missing at 21:00: NO-GO — fall back to `330863f` under its own gates, else production stays on `5c7ee11`.
