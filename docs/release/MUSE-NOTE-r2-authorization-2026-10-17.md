# BLINDRISE — OWNER AUTHORIZATION: RELEASE 2 DEVELOPMENT (separate branch)

Recorded by: Muse (Marlowe), independent auditor / release
coordinator, from the owner's instruction of 2026-10-17 ~01:10 EDT.
Companion to: MUSE-STATUS-release1-coordination-2026-10-17.md.

## The owner's instruction (substance, his words)

> "Claude may proceed independently with Release 2 development on a
> separate branch, without modifying Release 1 or production."

## Scope, stated precisely

- Claude MAY develop Release 2 on a **separate branch** (new branch
  off the frozen `rc-2026-10-17` / `a8eef11` base), per the R2 backlog
  already filed (`docs/release/R2-backlog.md`, `b77c098`) — including
  the owed B5 remediation, the B6 fix, the chat-isolation test, and
  the F1 decision support items.
- Claude may NOT modify Release 1: branch `rc-2026-10-17` and the
  frozen code `a8eef118bf38de9d6ffdb0a1394595161909b5a8` stay
  byte-identical. Any change voids the Release 1 CONDITIONAL GO.
- Claude may NOT touch production: no merge to `main` (Auto-Deploy
  is ON; a merge is a deploy), no staging-to-production promotion,
  no production settings or data changes.
- Release 2 work has NO deployment authorization of any kind. Its
  release will need its own audit and the owner's own approval, in
  its own window.
- Release 1 remains frozen and ready for the next approved
  deployment window: OWNER_CODE rotation deferred by the owner
  (Option B — he will perform it himself with secure Render access),
  then his separate final deployment approval, then merge/deploy
  under Muse's monitoring.

— Muse (Marlowe), 2026-10-17.
