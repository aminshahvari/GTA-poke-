# BUILD BRIEF — Per-club QR code + join landing (GENERAL feature, all clubs)

**Owner-approved 2026-10-19 ~18:40 EDT.** The owner approved Muse's preview mockups (owner view + join landing, `~/workspace/blindrise-qr-preview/preview-a-owner-qr.png` and `preview-b-join-landing.png`) and directed: build exactly this, fast, so it can go live right after the table ships tonight, and he can OPEN it for all clubs.

**Sequence:** (1) table ships first; (2) this build. Build on a branch off current production main; do NOT bundle with the table candidate.

## What to build (MVP — owner's words: it must exist and work tonight; polish later)

1. **Per-club join URL.** Every club has a public join URL of the form `/join/<club-slug>` (slug from the club name, stable per club). Works for ALL existing clubs and every club created later — no per-club manual setup.
2. **Owner QR view (matches preview A).** In the club's management surface (Director / My Club area for that club): the club card (name, member count, LIVE state), a big QR code encoding that club's join URL, the URL in text, and **Share / Download / Print** actions for the QR image. The QR exists the moment the club exists — generated from the URL, nothing stored per club beyond the slug.
3. **Customer join landing (matches preview B).** Opening the join URL (e.g. by scanning) shows a premium mobile-first landing for THAT club: club avatar initials + name, "Join the <Club> Club", the three perk lines, an **email field**, a **consent checkbox** (pre-checked state per the audited Celestia pattern — fail-closed: no consent, no registration), a gold **JOIN THE CLUB** button, and the fine print: "Free social play · No betting · No real money" + "Your email goes to this club only — never shared with other clubs."
4. **Registration effect.** A successful join registers the email as a member/lead of THAT club only (reuse the Celestia campaign registration path generalized per club: same consent token pattern as celestia-fix, HMAC, fail-closed client). No cross-club visibility: the registrant must not appear in, or be inferable from, any other club's lists.
5. **Open for all clubs.** No feature flag that leaves some clubs out: when this ships, every club's management surface shows its QR. (If a Director-level master switch exists in the pattern, default it ON per the owner's explicit direction to open it for all clubs tonight.)

## Hard limits (unchanged gates)

- Client + minimal server work only as needed for the join registration; reuse existing club/registration infrastructure — no new data model for members beyond what the Celestia path already uses.
- The QR must encode ONLY the public join URL — no tokens, no member data, no secrets in the code image or the URL.
- No changes to club-switching, noMain guard, or the table line in this branch.
- Branch only; report the exact SHA + preview evidence (screenshots of both screens for one real club) for Muse's fast audit. **Production activation is a separate owner GO naming the exact SHA.**

## Acceptance (Muse fast audit, tonight)

- QR on the preview service decodes to the club's join URL; the landing renders that club's name; a test registration lands in that club only (checked against a second club); consent unchecked → registration rejected; existing clubs all show the QR view.

— Muse, for Claude, 2026-10-19.
