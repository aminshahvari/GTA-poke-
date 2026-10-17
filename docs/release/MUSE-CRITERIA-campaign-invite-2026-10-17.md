# Blindrise Public Onboarding — Reconciliation & Muse's Audit Criteria

**From:** Muse / Marlowe — 2026-10-17. **For:** Claude's implementation branch. **Production base:** the live build `bf24ceb` lineage (this feature is a production-line release, NOT an R2-line feature).

## Reconciliation of the reports (verified in the live production code)

1. **PIN:** Every joining member sets **their own PIN (4–8 digits)** and confirms 19+ and the club rules. There is **no email anywhere** and **no shared password**. Any description of "register with email" or "no PIN" is wrong; "no shared password" is right.
2. **Invitations:** BOTH kinds already exist in production. **Personal links are single-use.** **Group links already exist too** — owner: up to 100 joins / 30 days; member: up to 10 / 7 days (owner can disable member invites); cap, expiry and revocation are enforced in `redeem()`; the Director UI already lists each link with "N of max joined · until date" and a Cancel button. What does NOT exist: a campaign **label/source** on a link, and per-join source recording beyond `invitedBy`.
3. **Automatic tournament enrollment: EXISTS today, for every redemption.** `redeem()` signs a new member into a tournament that is registering — or running with late registration open ("the link is usually sent for a tournament"). The invite UI copy promises this behavior. It is the one substantive conflict with the founder's requirements.

## What Claude builds (smallest scoped delta on the production lineage)

- **C1 — Campaign link = a group link with a label.** Director creates it with a chosen label (e.g. "Instagram"), cap and expiry (within the existing maxima or configurable up to them). The label is stored on the invite, shown in the Director list next to the joined count, and recorded on each member it creates (director-visible only; never exposed to other members).
- **C2 — Campaign joins NEVER auto-enroll.** A redemption via a labeled campaign link creates the member and lands them in The Lounge — no `club.join`, even if a tournament is registering or late-open. (If the implementation instead changes all group links, the invite UI copy must be updated to match, and the change called out in the handoff. Personal single-use invites keep today's behavior.)
- **C3 — Join-time reveal notice.** The campaign join screen (before name/PIN submission) states plainly: your name and avatar are visible to club members; members can see that you are a member; your contact details and business are visible only if you choose to publish or share them; the club is private and invitation-only beyond this campaign. The existing 19+/rules agreement stays.
- **C4 — Boundaries preserved.** Cap and expiry enforced in the redemption path; revocation immediate; name uniqueness global; the existing failure rate-limiting on `/api/redeem` keeps working for invalid/exhausted/expired attempts; exhausted/expired/revoked responses stay generic ("full, expired or was cancelled") with a pointer to ask the organizer — no enumeration, no member data. Two simultaneous redemptions at cap−1 produce exactly one join (Muse will race-test).
- **C5 — Reporting.** Director sees, per campaign link: joins count, cap, expiry, and the joined members (via existing uses). Counts must equal actual created members (Muse will reconcile).
- **C6 — Mobile / Instagram browser.** The join flow must complete in Instagram's in-app browser: no popups, no new-tab dependence, first-party storage only; the join screen reminds the member to remember their PIN (in-app browsers may not persist the session). Claude tests; Muse verifies code + local renders 320–430 px.
- **C7 — Scope fence.** Server changes confined to the invite/redemption surface, the member record's source field, and Director campaign UI. No engine, gameplay, store-schema (beyond additive fields), F1, or club changes. Clubs stay as production has them. Existing invites and members untouched; the whole existing suite keeps passing.

## Tonight (no build required)

The existing owner group link can be shared **only** when no tournament is registering or running, and even then joiners are auto-enrolled if a tournament opens — so for tonight's tournament window the safe paths remain personal invites via DM, or the group link after the event with the auto-enrollment behavior understood. The campaign candidate above removes that caveat.

*Audit loop: Claude posts the branch + handoff; Muse audits against C1–C7 with independent probes (boundary, race, duplicates, reporting reconciliation, IG-browser code review); defects return as a filed note on the branch; repeat until PASS. No deployment during a tournament or without the founder's release GO.*
