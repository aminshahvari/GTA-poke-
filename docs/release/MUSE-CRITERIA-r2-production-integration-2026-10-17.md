# Blindrise R2 Production Integration — Muse's Audit Criteria for the Integrated Candidate

**From:** Muse / Marlowe — 2026-10-17. **Production baseline (verified live by Muse, 2026-10-17 ~19:22 EDT):** `main` = `bf24ceb8c15132183a3f50d6c8589e54cc543b40` (Shape A), health OK, served `app.js`/`style.css` hash-match that commit. Production Auto-Deploy is ON: a merge is a deploy, so this candidate merges only on the founder's explicit GO at the deployment gate.

## Required composition (Claude delivers ONE exact SHA + handoff)

1. **R2 line:** `c4445ed` (staging-deployed; Muse staging acceptance PASS, filed `6ca8696`) — F1 final, clubs, mobile UX, Welcome merge.
2. **UX-fonts follow-up:** `30853e1` on `r2-ux-fonts` (badge clearance + 320 px top-bar slack; Muse's RC conditions a/b) — must be IN the candidate, or the handoff must state why not.
3. **Premium UI:** the audited `7dabbc3` delta (The Lounge / Strategy Table / Exchange / Bulletin / Salon), so the integrated build keeps the live Shape A look. Note: Shape A's two production-only adaptations (in-flow "Opening soon" label; dialog button wrap, Muse MINOR-2) must be preserved or shown unnecessary in this lineage.
4. **Felt:** this lineage's two-layer felt is native — the candidate's table must render the green felt inside the navy rail (Muse will render-check). The Shape A felt fix `5838e14` is production-lineage-specific; do not cherry-pick it blindly — show the felt correct in THIS lineage instead.
5. **Excluded, explicitly:** Feedback Hub (`67ed7fc`) is NOT in this candidate. Campaign-invite changes (criteria C1–C7, filed `4c0cd22`) are NOT in this candidate. Avatar/table-polish work (`shape-a-table`, `rc-table`) is NOT in this candidate. Any of these appearing in the diff restarts the audit.

## Audit checks Muse will run on the exact SHA

- **Lineage & diff:** exact tip SHA; merge-base and full diff vs `bf24ceb` (production) and vs `c4445ed` (staging-proven build). The server delta vs `c4445ed` should be zero or near-zero; every server line that differs gets individual scrutiny, because `c4445ed` carries the live staging evidence.
- **Clubs closed by default (hard gate):** booted locally with NO `STAGING`/`CLUBS_DEFAULT` env and a fresh store, the club payload must report `features.clubs === false` and the client must present The Exchange / The Bulletin as Opening Soon (the live production behavior today). Code path: `clubsOn()` falls back to env only when `settings.clubsOn` is not boolean; the production store has never had a `clubsOn` writer (verified at R1, still true — production has run R1/Shape A code only). Handoff must confirm production env carries no `STAGING`/`CLUBS_DEFAULT` flags.
- **Preservation:** auth (name+PIN, sessions), invitations (personal single-use + group links, incl. redeem auto-join behavior unchanged), gameplay/engine, member data shapes — all byte- or behavior-verified against the staging-proven build. Full `npm test` exit 0 on Muse's run.
- **UI batteries on Muse's runs:** `t_premium_ui`, `t_mobile_ux` (expect the ux-fonts fix to clear or shrink Muse's RC discrepancy — 15 fails at `c4445ed`; result reported either way), `t_welcome`, `t_registration`, `t_table_small`, `t_bizsearch`; scanner CSP pass ±SIMD. Renders: table felt at 390×844; Lounge at 320×568 with clubs closed.
- **Rollback prep (handoff must state):** exact rollback = return `main` to `bf24ceb` / Render rollback to the live Shape A deployment (name its deploy ID); code-only, no data migration in either direction; staging remains on `c4445ed` untouched.

## Deployment gate (unchanged, founder-held)

Fresh production backup immediately before merge · no game running, outside tournament hours, monitored first boot · owner's real-device pass still owed before this gate can clear (staging device steps in the RC handoff) · separate explicit founder GO naming the exact SHA. This criteria file authorizes nothing.

## After deployment, before clubs open

The production content/privacy audit procedure (Muse's companion document, same date) runs read-only on production data. One `clubsOn` switch controls BOTH clubs, so the audit must clear Business AND Opportunity datasets before the founder flips it — club opening is a separate founder GO after that audit reports.
