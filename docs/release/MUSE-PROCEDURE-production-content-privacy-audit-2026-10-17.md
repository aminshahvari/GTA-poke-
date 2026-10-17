# Blindrise — Production Content & Privacy Audit Procedure (post-R2-deploy, pre-club-opening)

**Owner of the procedure:** Muse / Marlowe. **When it runs:** after the R2 production deployment (clubs still closed), before the founder authorizes opening the clubs. **Nature:** read-only. Nothing in this procedure writes to production data; remediation is done by the owner in the app, then the audit re-runs.

## Why

Business and Opportunity text written before the final F1 contact filter (or outside filtered fields) may contain phone numbers / contact details that the club's consent model says must live only in gated contact fields. `scripts/content-audit.js` (in the R2 candidate) finds those fields using the same `server/content.js` rules the live filter enforces.

## Inputs

- A FRESH production database export (created at the deployment gate; `.dir.tar.gz`, retained ≥7 days). The audit runs against the export (kv table as one JSON object) on Muse's machine, OR via `node scripts/content-audit.js --db` inside a READ ONLY transaction that is rolled back (Render shell). The export route is preferred: it never touches the live service.
- The exact deployed SHA (the audit is valid only for the data + rules of that moment; re-run after any remediation).

## Steps

1. **Extract** the kv export from the backup archive (work on a copy; the archive itself stays untouched; file permissions 600; no contents leave Muse's machine).
2. **Run** `node scripts/content-audit.js <kv.json>`. The script prints ONLY: record key, field name, violation KIND (e.g. phone-like pattern) — never the text. Verified property of the audited script version; re-verify the script blob matches the audited candidate before running.
3. **Report to the founder, counts only:** total records scanned (Business profiles, Opportunity listings, Opportunity requests), fields flagged per dataset, per kind. No raw text, no member names, no record contents in chat or in the report. Record keys (IDs) go only into the remediation list handed to the owner.
4. **Remediate (owner, in-app):** for each flagged record, the owner opens the listing/profile in the Director view and edits the flagged field to move contact details into the proper contact field (or removes them). Muse does not edit member content.
5. **Re-run** from a NEW export (or the same export only if remediation happened against a staging copy — production remediation requires a fresh export to prove the live data is clean). Gate clears when the run reports **0 fields to review**, or the founder explicitly accepts named exceptions in writing.
6. **Privacy cross-checks (same sitting, read-only):** (a) F1 live state — the deployed build's `server/content.js` blob hash equals the audited candidate's; (b) club payload gating — with clubs closed, a member payload carries `features.clubs === false` (owner confirms the doors read Opening Soon); (c) contact-share model unchanged — code-confirmed in the integration audit (contact details served only after an explicit share; verified live on staging).

## The opening decision

One switch (`settings.clubsOn`, owner-only Director toggle) opens BOTH clubs. Therefore: **Business and Opportunity datasets must BOTH clear step 5 before the flip**, and the flip itself is a **separate founder GO**, after this audit reports. After the flip, the owner spot-checks one Business profile and one Opportunity listing as a member would see them; Muse verifies the served client/build is unchanged (hashes) and records the opening in the release file.

## Failure handling

Any step that cannot be verified (export unreadable, script blob differs, counts inconsistent between runs) = STOP, report to the founder, clubs stay closed. A flagged field is a data-cleanup item, not a code defect — it does not block the poker product, only the club opening.
