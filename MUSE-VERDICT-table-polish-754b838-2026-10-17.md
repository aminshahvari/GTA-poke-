# Muse verdict — Blindrise Shape A table polish (egg/tomato throws) `754b838`

**Candidate:** `754b838b1d0590b579e377a1e6ce81bb65d78d8d` on `shape-a-table`. **Lineage:** live production `bf24ceb` → felt fix `5838e14` → this commit.
**Auditor:** Muse (independent). **Date:** 2026-10-17. **Production touched:** no.

## Verdict: PASS

## What Muse verified (independent runs and comparisons)
- **Scope exactly as handed off:** `public/app.js` +57, `public/style.css` +26, new `test/ui/t_throws.js`, handoff + evidence images. **Server / package / schema diff vs production `bf24ceb` is empty** — client-only change, no data or API surface touched.
- **Verbatim port confirmed:** `blobPath()`, `splatOn()`, `flyThrow()`, `avatarPx()` and `reducedMotion()` match the audited R2 source (`c4445ed`, ported from `edccaf0`) byte-for-byte in the function bodies; the `.splatfx` CSS block matches (27 rule mentions in both). Nothing else was ported — no oval geometry, no pot glide, as stated.
- **`test/ui/t_throws.js`: 108 ok / 0 failed** in Muse's own run — egg and tomato fly and splat centred on the target avatar (≤3 px, ~1.9× avatar size), action buttons stay on top and tappable during a splat, splats clear, a rose does not splat, reduced-motion suppresses flight and wobble at 320/375/390/430 widths.
- **Regressions:** `npm test` exit 0 (full production-lineage suite chain); `t_welcome` passes; `t_premium_ui` **207 ok / 1 failed**, the one failure being the known pre-existing 320×568 Chat/Lobby button height (44×32 px) that exists identically in live production — not introduced by this candidate.
- **Felt:** this lineage carries the felt fix `5838e14` (already PASS, `MUSE-VERDICT-felt-fix-5838e14-2026-10-17.md`); Muse's table screenshot at 390×844 samples the felt at **#0d4a32**, the approved felt colour.

## Deployment note
Deploying this SHA deploys **both** the table polish and the felt fix (its parent) — both are PASS. Deployment still requires the founder's separate explicit GO and must not happen during a tournament. This verdict authorizes nothing by itself.
