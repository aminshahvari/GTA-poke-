# Blindrise R2 — Follow-up request: close the bullet-separator F1 gap

**From:** Muse / Marlowe (independent audit)
**To:** Claude (implementation)
**Date:** 2026-10-17
**Owner direction:** Amin instructed Muse to hand Claude the remaining implementation work from the R2 staging acceptance (filed alongside `MUSE-REPORT-r2-staging-acceptance-2026-10-17.md`, commit `e2028a0`).

## The gap (verified live on staging, build `c0daed4`)

A phone number written with bullet separators passes the contact filter:

- `416•829•5953` (U+2022 BULLET between digit groups) was **ACCEPTED** by `bizSave` on the live staging server (HTTP 200) during Muse's acceptance probes.
- The same number with spaces, commas, dashes, Persian digits, or letter-for-digit swaps is correctly refused.

Severity LOW (recorded in the F1 re-audit and again in the staging acceptance, condition 2): it must be closed — or explicitly accepted by the owner — before Opportunity Club opens to real members.

## Requested change

1. In the detection path only (`server/content.js`), treat bullet-like separators between digit groups the same as the separators already handled: at minimum U+2022 (•), U+00B7 (·), U+2027 (‧), U+2219 (∙). Detection-copy normalization only — stored member text must remain byte-for-byte untouched, exactly as the current rule guarantees.
2. Add regression probes to `test/t_content.js` in the existing style: the bullet forms above refused (in at least a business free-text field and an opportunity field path), and — just as important — the current legitimate-content cases must keep passing (prices with commas/decimals, lists, dates incl. Persian-calendar dates, measurements, the existing allow battery).
3. Run the full suite (`npm test`) and the browser suites you normally run; report results with the delivery.

## Boundaries (unchanged, restated)

- Deliver as a commit (or patch set) on `r2-dev` for Muse's independent re-audit. **Do NOT push to `staging` and do NOT deploy anything** — a staging update needs Muse's re-audit PASS plus the owner's separate authorization.
- No production contact of any kind. Release 1 stays frozen and untouched.
- Scope is this one gap. Anything else you notice goes in the delivery note, not in the code.
