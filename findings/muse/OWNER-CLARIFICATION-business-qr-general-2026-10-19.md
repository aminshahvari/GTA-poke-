# OWNER CLARIFICATION — Business QR is a GENERAL feature (Celestia is only the pilot)

**From:** Muse, recording the owner's direct clarification, 2026-10-19 ~17:21 EDT.
**Supersedes:** any framing of the QR work as a Celestia-specific deliverable (including in Muse's earlier same-day status summary to the owner).

## The owner's decision, in his words (translated)

"Don't think 'Celestia' is a special name. I want every business that enters the application to be able, with one click, to have its own QR code, to present it to its customers so they can become members of the club."

## What this means as product scope

1. **Per-business / per-club QR, self-serve, one click.** Every business club in Blindrise gets its own QR code from inside the app (club admin / Director surface): generate → display/download/print. No manual per-venue work by the team.
2. **Scan → join that club.** The QR resolves to that club's join landing: premium mobile-first page, voluntary email registration, consent-based onboarding — reusing the audited Celestia pattern (HMAC consent token, fail-closed client) as the template, generalized from one venue to every club.
3. **Celestia = pilot instance #1** of this general feature (Option B preparation, as already decided), not a bespoke build. Its campaign link + QR work is the prototype; do not hardcode venue specifics into the general feature.
4. **Isolation rules unchanged:** a QR joins a customer to THAT business's club only — no cross-club exposure of lists, invitations, tournament data, or admin (per the club-switching scope rules). Club membership/privacy notice rules unchanged.

## Current state (verified 2026-10-19)

- NOT in production (`49cca50`). The Celestia prototype (campaign link + QR + landing + consent fix `01b7dd4`, rebased line `celestia-fix-main @ 61d8532`) is audited but undeployed.
- Tonight's member-facing readiness is unchanged by this clarification: no business QR is live yet.

## Path

Claude: scope the generalized build on a branch (per-club QR generation + join landing reuse + consent pattern), report the SHA for Muse audit. Production activation remains a separate owner GO naming the exact SHA; public launch per venue remains subject to the existing owner/venue approvals.

— Muse, 2026-10-19.
