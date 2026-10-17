# BLINDRISE RELEASE 1 — FORMAL OWNER RISK ACCEPTANCE (RECORD)

Recorded by: Muse (Marlowe), independent auditor, under the owner's
authorization in the message quoted below.
Owner: Amin Shahvari
Date/time of acceptance: 2026-10-17, 00:37 EDT (America/Toronto)
Release: Blindrise Release 1, frozen code
`a8eef118bf38de9d6ffdb0a1394595161909b5a8` (branch `rc-2026-10-17`)
Basis: MUSE-REPORT-release1-rc-audit-2026-10-17.md (CONDITIONAL GO),
condition 1; MUSE-PLAN-release1-execution-2026-10-17.md, section 1.

## The owner's acceptance (his words, 2026-10-17)

> BLINDRISE RELEASE 1 — FORMAL OWNER RISK ACCEPTANCE
>
> I explicitly accept the following known risks for Blindrise
> Release 1:
>
> 1. B5 — fair_after_interrupt: An interrupted hand may have an
>    unverifiable fairness record after a server restart.
> 2. B6 — sessions_owner_reset: Existing owner sessions are not
>    revoked after a PIN reset, and the recovery path may be
>    temporarily rate-limited.
> 3. Cross-table chat isolation — NOT VERIFIED: Isolation between
>    table chats has not been conclusively verified. This is an
>    accepted uncertainty, not confirmation that a leak exists.
>
> I accept these three items for Release 1, with remediation and
> independent verification required in Release 2.
>
> Authorization scope:
>
> * Muse is authorized to record this written risk acceptance in the
>   release documentation.
> * Claude must keep the frozen Release 1 code unchanged.
> * No Merge, Production Deploy, OWNER_CODE rotation, database
>   modification, or other production-changing action is authorized.
> * Production remains NO-GO until all remaining release conditions
>   are independently verified and I issue separate explicit final
>   deployment approval.
>
> — Amin Shahvari

## Auditor's record

- **Condition 1 of the CONDITIONAL GO is COMPLETE** as of the owner's
  message above: B5, B6, and the unverified cross-table chat isolation
  are accepted known issues for Release 1.
- The acceptance carries a Release 2 obligation, recorded here so it
  cannot drift: B5 remediation per owner policy, the B6 fix (revoke
  all sessions on PIN change / resetOwner + per-source recovery rate
  limit), and a dedicated cross-table chat isolation test — each with
  independent verification by Muse in Release 2.
- Scope honored in recording this: no merge, no deploy, no OWNER_CODE
  rotation, no database or production change of any kind was made or
  authorized by this record. The frozen code is unchanged.
- Remaining conditions at the time of this record: Condition 2
  (production database export) outstanding — owner action;
  Condition 3 (OWNER_CODE rotation) outstanding — to be executed
  inside the deploy window under the final approval, not before;
  Condition 4 (between-games window confirmation) outstanding — at
  deploy time; Condition 5 (clubs closed) verified by construction
  (MUSE-PLAN section 5), with the member-view confirmation due in the
  deploy-day smoke.
- **Production remains NO-GO** until the remaining conditions are met
  and the owner issues his separate explicit final deployment
  approval.

— Muse (Marlowe), independent auditor.
