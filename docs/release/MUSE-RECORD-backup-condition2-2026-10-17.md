# BLINDRISE RELEASE 1 — CONDITION 2 EVIDENCE: PRODUCTION DB EXPORT

Recorded by: Muse (Marlowe), independent auditor.
Authorization: owner's chat message, 2026-10-17 ~00:40 EDT — create ONE
manual export of production database `gta-poker-db` via the existing
authenticated Render session; no restore, delete, modification, or
migration; no environment, service, merge, or deploy action; frozen
code untouched.
Database: `gta-poker-db`, ID `dpg-db81kuom7kps73cmh9dg-a`, Render
workspace PRO, account seanshahvari@gmail.com.
Basis: MUSE-REPORT-release1-rc-audit-2026-10-17.md (CONDITIONAL GO),
condition 2; MUSE-PLAN-release1-execution-2026-10-17.md, section 2.

## Before state (read independently, 2026-10-17 ~00:40 EDT)

- Recovery page exports table: **0 rows** — no export existed.
- (This read also established that the export described in the owner's
  earlier status message had not taken effect; the owner then issued
  the authorization under which this export was created.)
- Database info: status **Available**; storage **8.36% used of 1 GB**;
  PostgreSQL 17; Oregon; plan Basic 0.1c-256mb.
- Point-in-time recovery line (verbatim): "You can choose to restore
  from any timestamp in the past 3 days." Export retention line
  (verbatim): "All database export files are retained for at least
  7 days."

## Action taken (exactly one)

- Recovery → **Create export** clicked exactly once, 2026-10-17.
- No restore, delete, environment, service, or code action of any
  kind was taken. No database contents were read or copied into this
  record — metadata only.

## The export

| Field | Value |
|---|---|
| Created | October 17, 2026 at 12:41 AM (page display; no timezone shown). Download filename timestamp: `2026-10-17T04_41Z` (UTC) = 00:41 EDT — consistent. |
| Status | Completed (green check on the row; file link present; exactly 1 export row in final state) |
| Export ID | Not displayed by the Render UI (ID cell empty) |
| Retention | At least 7 days (page text) |
| Size (page) | Not displayed by the Render UI |
| Downloaded file | `2026-10-17T04_41Z.dir.tar.gz` |
| Downloaded size | **149,302 bytes** |
| Downloaded SHA-256 | `41e6a2b386844339a317a9b7a0dec97af77e44cb4262f1cb43b4e57e7856a491` |
| Archive structure | tar integrity OK; members: `toc.dat` (2,274 B) + one data member `3360.dat` (**1,833,057 B** uncompressed) — the single state table's data, ~1.9 KB average per key across ~944 keys |

## Plausibility judgment (auditor)

PASS. The pre-agreed failure signature (0 B or a few KB) is absent by
two orders of magnitude. The uncompressed data volume (~1.83 MB of
JSON state) is the right order of magnitude for this application's
single-table key/value store; the 8.36%-of-1 GB storage figure is
Render's allocated footprint (WAL, indexes, page overhead), not the
logical data size, so a ~146 KB compressed export is consistent.
Archive integrity verified locally (tar listing clean); no data member
was opened or inspected.

## Verdict

**Condition 2: COMPLETE — PASS.** A valid, completed, downloaded
pre-deploy backup of production now exists (Render-side copy retained
at least 7 days; local copy hashed above).

Remaining conditions: 3 (OWNER_CODE rotation — inside the deploy
window only), 4 (between-games window confirmation — deploy time).
Final deployment approval: NOT issued. **Production remains NO-GO.**

— Muse (Marlowe), independent auditor.
