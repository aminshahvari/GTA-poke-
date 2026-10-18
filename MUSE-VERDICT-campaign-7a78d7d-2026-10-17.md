# Muse verdict — Blindrise campaign invite (public onboarding) `7a78d7d`

**Candidate:** `7a78d7d4ae8eed5e8cfe5a10f5bd3dfd173f5489` on `public-onboarding`, built on live production `bf24ceb` (correct lineage).
**Criteria:** `MUSE-CRITERIA-campaign-invite-2026-10-17.md` (filed on `r2-dev` @ `4c0cd22`).
**Auditor:** Muse (independent). **Date:** 2026-10-17. **Production touched:** no. **No deployment during a tournament; none authorized by this verdict.**

## Verdict: PASS — with one MINOR wording item (C3)

### Criterion by criterion
- **C1 — Labeled campaign link: PASS.** Owner-only `campaign` API; source label validated (2–24 chars); cap (1–2000) and expiry (1 h–30 d) stored on the invite; the source is also stored on each created member (Muse's store probe: invite `campaign.source = probe-two`, member record `campaign: "probe-two"`). The members payload does **not** carry the campaign field (field list verified in code; Claude's suite asserts the serialized view contains no campaign tag) — source is director-visible only. Campaign members also cannot see other members' `invitedBy`.
- **C2 — Never auto-enrol: PASS.** `redeem()` skips tournament sign-up when `inv.campaign` is set; Claude's suites prove a campaign joiner lands in the lobby, unseated, while personal/group/member joiners are still signed up as before. Muse's probes confirm no regression to the ordinary paths.
- **C3 — Join-time reveal notice: PASS with MINOR.** The consent screen (shown before the name/PIN form) states: private members' club; free, no real money; 19+; **what other members see** (display name, picture, tournament results, rating and play stats); nickname advice; an explicit agreement line. **MINOR:** it does not yet say "your contact details and any business are visible only if you choose to publish or share them." On this lineage the clubs are closed, so no contact/business surface exists and nothing is exposed; add the sentence before this build is merged with any clubs-open lineage.
- **C4 — Boundaries preserved: PASS.** Cap holds sequentially (Claude) and **under race in Muse's own probe: 10 concurrent redemptions against cap 3 → exactly 3 accounts**. Expiry enforced (expired link: `campaignInfo` reports `open:false`, the join page shows "This link has closed", redemption refused with the generic message). Revocation via the owner `revoke` path stops a campaign link immediately (Claude's suite). Responses stay generic — a bogus code, an expired link and a used link are indistinguishable in kind. Extra control beyond criteria: at most 5 campaign joins per connection per hour by default (configurable), verified by Claude's suite including that another connection is unaffected.
- **C5 — Director reporting reconciles: PASS.** `campaignReport()` (owner-only view) reports per link: source, joined vs cap, remaining, expiry, status (active/full/expired/cancelled) and how many joiners have played a hand. Counts derive from the invite's recorded uses; Muse's probe reconciled store uses ↔ members created 1:1.
- **C6 — Instagram in-app-browser safe: PASS.** Claude's UI suite: Instagram user-agent completes consent → join → lobby with no popup dependence; with storage blocked it still reaches the lobby (in-memory session fallback in code); a keep-your-PIN note is shown. A device-level "this phone already joined" nudge points returning visitors to sign-in.
- **C7 — Scope fence: PASS.** Server diff vs `bf24ceb` is `server/index.js` only (+48/−11), confined to the invite/redemption surface, the member source field, the owner report and the dispatcher passing the client IP; client diff confined to the join/consent flow and Director campaign management. No engine, F1 or club changes. Campaign links are excluded from the ordinary invite lists and from the owner's reusable group-link lookup, so the private group-link behavior is unchanged.

### Muse's own runs
- `test/t_campaign.js`: **68 checks pass**; `test/ui/t_campaign_ui.js`: **12 checks pass**; full `npm test` on this lineage: **exit 0** (t_campaign is wired into the suite).
- Independent probes: cap race (above), duplicate-name refusal, expired-link behavior, bogus-code behavior, store reconciliation.

### Standing conditions
Merging this into a release line produces a new SHA that needs a delta audit. Deployment remains a separate founder GO, never during a tournament. When the founder uses it for the Instagram channel: create the link in the Director with a clear source label (e.g. `instagram-oct`), a cap sized to the audience, and an expiry matched to the campaign.
