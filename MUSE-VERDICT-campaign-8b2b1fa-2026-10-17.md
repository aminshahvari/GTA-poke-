# Muse verdict — Blindrise campaign invite (public onboarding) `8b2b1fa`

**Candidate:** `8b2b1fa61fbd504e64d623b7c0c468c1ada29cee` on `public-onboarding`. **Supersedes** `7a78d7d` (Muse verdict of the same date is obsolete for release purposes; the remediation it requested is verified closed below).
**Criteria:** `MUSE-CRITERIA-campaign-invite-2026-10-17.md` (on `r2-dev` @ `4c0cd22`).
**Auditor:** Muse (independent). **Date:** 2026-10-17. **Production touched:** no. **No deployment authorized by this verdict; never during a tournament.**

## Verdict: PASS — all criteria C1–C7 met; the previous MINOR is closed; no open items

### Remediation verification (the delta vs `7a78d7d` is 3 code lines + tests + docs)
- **C3 notice — MINOR CLOSED.** The consent screen now also states: "Membership is visible — other members can see that you are a member"; **"Contact details stay private — your contact details and business are visible only if you choose to publish or share them"**; and "Invitation-only — apart from this public link, the club is private and joined by invitation." Combined with the original bullets (private club, free/no real money, 19+, what members see, nickname advice) the join-time notice now covers every point in C3.
- **C5 reporting — extended and verified.** `campaignReport()` now includes the joiners' display names per link (`members`), rendered in the Director as "Who joined". Muse's own probe: the owner's report shows joined = 3 with the three names after a race test; **a campaign joiner's payload and an ordinary member's payload contain no `campaigns` key, no source label and no name list** — the names are director-only, as required.
- **C6 PIN reminder — moved before registration.** The name/PIN form reached after consent now reads: "Remember your PIN: there is no email reset, and in-app browsers such as Instagram's may not keep you signed in." — shown before the account is created, not after.

### Re-verified at this exact SHA (Muse's own runs)
- `test/t_campaign.js`: **75 checks pass** (up from 68; the new checks cover the remediations). `test/ui/t_campaign_ui.js`: **12 pass**. `test/ui/t_welcome.js`: pass. Full `npm test` on this lineage: **exit 0**.
- **Cap race re-run:** 9 concurrent redemptions against cap 3 → **exactly 3 accounts**.
- **Boundaries unchanged and re-confirmed:** no auto-enrolment for campaign joins; duplicate names refused; expired/revoked links refuse generically; per-connection join throttle intact; campaign links stay out of the ordinary invite lists and the owner's reusable group-link lookup.
- **Scope fence intact:** server diff vs `bf24ceb` confined to the invite surface in `server/index.js`; the only `package.json` change is the test script including `t_campaign.js`. No engine, F1 or club changes. Lineage remains the live production line (`bf24ceb` → `7a78d7d` → `8b2b1fa`).
- `t_premium_ui`: 207 ok / 1 failed — the one failure is the known pre-existing 320×568 Chat/Lobby button-height item from live production, unchanged by this build, as Claude reported.

### Standing conditions
This build stays separate from R2. If it is ever merged into a release line, the combined SHA needs a delta audit. Deployment is a separate founder GO, never during a tournament. For the Instagram launch: create the link in the Director with a clear source label (e.g. `instagram-oct`), a cap sized to the audience, and an expiry matched to the campaign; the link can be cancelled instantly from the same screen.
