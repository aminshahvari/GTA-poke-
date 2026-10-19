# Muse ADDENDUM — DEFECT WITHDRAWN: portrait helper truncation was a Muse-environment font artifact

**From:** Muse (independent audit), 2026-10-18 ~13:05 EDT
**Re:** `MUSE-DEFECT-integration-helper-portrait-2026-10-18.md` (filed on this branch @ `1bc40fe`) against integrated candidate `443a27f`
**Correction:** the defect is **WITHDRAWN as a release blocker**. The failure was real in Muse's sandbox and is NOT reproducible under the fonts the product actually ships. Claude's reported evidence (432/0 with the real font cache) is confirmed by Muse's own rerun.

## What happened
- Muse's run of `t_table_layout` on `443a27f` (sandbox Chromium, no webfont access): **431 ok, 1 failed** — 320×568, 2 players, helper advice clipped (`.h-line` scrollWidth 324 > clientWidth 235). Muse's probe confirmed the metrics, and the defect was filed in good faith on that evidence.
- The test's `FONTS_DIR` mechanism exists precisely because text metrics are font-dependent. Muse's sandbox Chromium cannot reach Google Fonts, so it rendered with a **wider fallback font**. The product's real font stack (IBM Plex Sans / IBM Plex Sans Condensed / Cormorant Garamond) is narrower for this text.
- Muse downloaded the production font set through the proxy (23 woff2 files, the exact css2 response for the app's own font URL) and reran:
  - `ONLY=320x568 NS=2` with `FONTS_DIR`: **9 ok, 0 failed**
  - Full `t_table_layout` matrix with `FONTS_DIR`: **432 ok, 0 failed, exit 0** — identical to Claude's handoff evidence (`bcf397e`).
- Claude's handoff had also disclosed the residual clamp behavior in its Known limits; the disclosure and Muse's corrected evidence now agree.

## Residual observation (backlog, NOT a tonight blocker)
If a client device fails to load the webfonts entirely (offline first-load, blocked CDN), fallback-font metrics return and the longest advice variant can clip at 320 px portrait. Proportionate handling: a backlog robustness item (let the portrait helper take the lines it needs, as landscape does), to be verified under BOTH font conditions whenever it is picked up. It does not gate tonight's candidate: production renders with the webfonts, and the founder's real-iPhone acceptance on the preview remains the decisive real-device check.

## Audit state on 443a27f after this correction
npm chain exit 0 (incl. t_invite_privacy 7/7) · t_table_layout 432/0 (real fonts) · t_stability 146/146 · t_hotfix 42/42 · premium 296/296 · t_mobile_ux pass · viewport probe Δ0 px / 0.0 px · invite-privacy probe: member payloads zero non-null invitedBy, owner retains all · server diff vs 5c7ee11 = the privacy hunk only. **No open defects from Muse on this SHA.** Remaining gates are the release gates (founder iPhone acceptance, fresh verified backup in the window, idle reconfirmation, founder GO naming the SHA).
