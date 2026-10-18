# Muse — Verdict: invite-privacy branch `06e6e9c`, 2026-10-18

**Candidate:** `invite-privacy` @ `06e6e9c` (two commits on the `r2-hotfix` line at `06dd2e5`: `7b9e5b5` members see only their own inviter, then `06e6e9c` no inviter information in member payloads at all). **Auditor:** Muse, independent, on the exact extracted tree. **Production modified:** no.

## The change
One functional edit in `server/index.js` (`clubView`): for non-owner payloads, every member entry's `invitedBy` is replaced with `null`; the owner's payload is untouched. Muse verified this is the **only** server diff against the stabilization RC line, and that every `invitedBy` surface in the codebase is accounted for: the store write at redeem (record-keeping, unchanged), `invitedCount` (a count, no identity), the two client render sites (both read the same filtered payload and render nothing when it is null), and this filter.

## Muse's verification
- **Claude's `t_invite_privacy`: 7 ok, 0 failed** in Muse's run — a real end-to-end test (owner → two members → a member-invited member) over HTTP + WebSocket, and it polls for server readiness instead of sleeping a fixed interval. It is wired into the `npm test` chain.
- **Muse's independent probe** (separate script, staging seed, raw payload inspection): the **owner's** club payload carries the inviter id for all 12 seeded members; a **member's** payload carries **zero** non-null `invitedBy` values across all 13 members. Exposure: NONE. Owner visibility: retained.
- **`npm test`: full chain green** on the exact tree (stress 3,000 tournaments, 0 problems).

## Verdict
**PASS on branch.** This implements Muse's acceptance test P10 from the strategy-integration audit: ordinary members can no longer see who invited whom, and the Director keeps the full picture. Two lineage notes for the release plan: (1) the branch is based on `06dd2e5`, so its client predates the viewport fix — it is **not** part of the PASSed stabilization RC `8eee0a5`; shipping it means Claude rebases it onto the RC line (or it rides with the campaign rebase, where P10 is also required), producing a new SHA for a Muse delta re-audit. (2) The stored `invitedBy` data itself is unchanged — this is a disclosure fix, not a data change, and needs no migration.
