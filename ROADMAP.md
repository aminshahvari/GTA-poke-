# Blindrise roadmap (phased)

**Source:** `BLINDRISE-PRODUCT-VISION.md` (the owner's directive, 2026-10-18). Re-ordered on the owner's Strategy Integration Directive (05:22 UTC): stabilization first, then legal and privacy readiness, then a measurable Celestia invitation pilot. Multi-club and commercial work come only after that.

**Status:** current state per `docs/vision/CAPABILITY-INVENTORY.md` (labels: IMPLEMENTED / PARTIAL / PROPOSED / NOT VERIFIED).

**Gates on every milestone:**
1. Isolated branch.
2. Tests green.
3. Muse verdict on the exact SHA.
4. Owner GO naming that SHA.
5. Quiet window and fresh backup.

A merge to `main` is a production deploy. Any data migration or mandatory onboarding gate needs **separate** owner approval. A public QR campaign, any gameplay activation and any commercialization each need their own founder authorization.

## Stage A: Stabilization
| Milestone | Depends on | Acceptance criteria |
|---|---|---|
| A1 Combined mobile-stability + hotfix RC: one SHA containing `mobile-stability` `a6ef217` and `r2-hotfix` `06dd2e5` | none | Muse viewport probe: table geometry invariant (±2 px) when the viewport height changes 844↔754, on rotation and on keyboard open; `t_hotfix` 39/0 (invite rows); `t_stability` green; regression suites green; owner's 12-step iPhone smoke test passes |
| A2 Table redesign for 2–9 players (`table-redesign` `1cb2b89`) | A1 | `t_table_layout` at 2–9 players × 320/375/390/430 px: no overlaps, action bar on screen; navy and gold kept; engine diff empty; Muse verdict |
| A3 Test-harness reliability | none | `t_table_small` waits for chip animations to finish before measuring (Muse `d9836df` finding); green on 3 consecutive runs under load |

## Stage B: Legal and privacy readiness (before anything public)
| Milestone | Depends on | Acceptance criteria |
|---|---|---|
| B1 Release record closed | none | `docs/release/R2-RELEASE-EVIDENCE-2026-10-18.md` complete: the backup export from the R2 window filed, or recorded as not taken; OWNER_CODE decision (A/B/C) recorded |
| B2 Invitation-source privacy (`invite-privacy` `06e6e9c`) | A1 (can ship with or after it) | Muse P10: a member payload carries no `invitedBy` for anyone; the owner's still does; `t_invite_privacy` 7/0; suites green. See `docs/vision/INVITE-SOURCE-PRIVACY.md` |
| B3 Clubs switch state and content audit | none | Switch state confirmed by the owner; Muse content audit on a fresh export reports 0 fields to review (or named exceptions accepted in writing) |
| B4 Counsel review | none | Written opinion on file covering: a public table card in a licensed venue; the rewards shop and points (game-outcome linked); consent wording. Muse condition `aed6f2c` §2(b): the rewards shop's status is an **explicit owner decision**, not a drafting inference |
| B5 Consent surface | Stage C1 | The campaign consent page (Muse C1–C7 PASS on `8b2b1fa`) is live on the R2 line; no auto-enrolment from public links |

## Stage C: Measurable Celestia invitation pilot (six weeks, two social events)
| Milestone | Depends on | Acceptance criteria |
|---|---|---|
| C1 Campaign link on R2 (venue attribution) | A1, B2 | `public-onboarding` rebased onto R2. `t_campaign` and `t_campaign_ui` green on R2; Muse delta audit; per-source report correct; no auto-join |
| C2 Stable `/v/celestia` path | C1, owner decision | `docs/vision/V-REDIRECT-DESIGN.md` tests V1–V12; Muse C1–C9 |
| C3 Print assets | C1 (and C2 if chosen), B4, Celestia's written consent | Pilot tests P1–P11 in `CELESTIA-PILOT.md`; the URL printed in words under the QR |
| C4 Pilot run and review | C3, founder authorization of the public campaign | Six weeks, two non-wagering social events. Metrics are below; the review happens at week 3 and week 6 |

**Pilot metrics.** These are aggregate counts only, read by the owner in Director, with no new personal data and no third-party scripts.

| Metric | How it is counted | Success threshold |
|---|---|---|
| Sign-ups per source (`celestia` vs others) | Campaign report: joined count per link | **OWNER DECISION** (placeholder; no number is proposed) |
| First-event attendance | Owner's head count at each of the two events, and/or the count of `celestia` joiners who played at least one hand | **OWNER DECISION** |
| Repeat engagement | `celestia` joiners active again 2+ weeks after joining, and 30-day retention (played or signed in within 30 days) | **OWNER DECISION** |
| Venue feedback | Collected by the owner from Celestia's management at weeks 3 and 6 (free text, kept by the owner) | Qualitative |
| QR scans | **Not counted** unless the owner approves the optional aggregate hit counter on `/v/` (one integer per source, no IP, no timestamps) | n/a |

The events are social and non-wagering. No prize, discount or offer is tied to game results. Dining offers, if Celestia ever makes one, stay separate from Blindrise points and play.

## Stage D and later: the original phases, unchanged in content, now after Stage C
These need the pilot review (C4) and the owner's go-ahead before design work turns into code.

### Phase 2: Self-service business clubs
Depends on Stage C and the multi-club decision (`MULTI-CLUB-FEASIBILITY.md`).

| Milestone | Acceptance criteria |
|---|---|
| M2.1 Branding config (stage 1) | Club name, accent and logo from settings; defaults identical to today (pixel diff on `t_premium_ui`) |
| M2.2 Multi-club design and migration rehearsal (documents) | Owner approval of the design; rehearsal on an export copy with rollback proven |
| M2.3 Tenant keys and shared identity | Cross-tenant test: zero reads outside the scope; suites green per club; migration and rollback rehearsed |
| M2.4 Business-admin role, manual verification, per-club QR/URL | Role tests; verification audit log; QR decode test |
| M2.5 Consented communications and basic club analytics | Opt-in, default off; unsubscribe works; aggregates only |

### Phase 3: Shared marketplace
| Milestone | Depends on | Acceptance criteria |
|---|---|---|
| M3.1 Public projection and discovery pages | M2.3 | Muse privacy audit: every projected field is opted public; no membership or contact data reachable; the approved Exchange look kept |

### Phase 4: Social engagement (opt-in, non-wagering)
| Milestone | Acceptance criteria |
|---|---|
| M4.1 Trivia and team challenges | No stakes, no prizes of monetary value, no link to dining offers; opt-in |
| M4.2 Introductions with mutual consent | Both sides accept; no contact shared before that |
| M4.3 Gameplay options (`gameplay-options` `e391f8d`, default-off; Muse PASS on branch) | Owner decisions on the rules; activation is a separate authorization |

### Phase 5: Commercialization
| Milestone | Depends on | Acceptance criteria |
|---|---|---|
| M5.1 Legal review (commercial) | B4 | Counsel opinion on file before any revenue |
| M5.2 Optional business tools / subscriptions | M5.1, Phase 2, pilot evidence | Never tied to entry, chips, points or prizes; the free core is unchanged; no revenue, market-size or conversion claims without independent evidence |

Optional, any time on the owner's request: email onboarding (an auth change; PROPOSED, not started).

## Proposed order
A1 → B1, B2, B3 (in parallel) → A2, A3 → C1 → B4, B5 → owner decisions → C2, C3 → founder authorization → C4 (six weeks) → pilot review → Phase 2 design (M2.1, M2.2) → the rest.

## Gemini report comparison: PENDING (report not received)
The full Gemini Deep Research report ("گزارش پژوهش عمیق و اعتبارسنجی تجاری: فرصت بازار محلی پلتفرم Blindrise در منطقه تورنتو بزرگ (GTA)") has **not** been received or reviewed by Claude or Muse. The founder sent a short summary at 05:23 UTC; it is recorded below and nothing more is claimed.

**Method, for when the full report arrives.** Each claim gets one of four classes:
- **verified fact**, with a source we checked;
- **estimate**, a modelled number with the method stated;
- **assumption**, an untested belief about behaviour or demand;
- **unsupported projection**, a revenue, price, valuation or conversion figure with no evidence.

Only verified facts may be quoted as facts in any Blindrise material. Estimates and assumptions are quoted with their label; unsupported projections are not quoted.

### SECONDARY SUMMARY / UNVERIFIED — full report not received or reviewed
| # | Point (as summarized by the founder) | Class | Note |
|---|---|---|---|
| 1 | A modelled count of Iranian restaurants, cafés and lounges, and of Iranian-owned businesses and professionals, in the GTA | **Estimate** (unverified) | Model and sources unseen. The figures are not repeated here so they are not mistaken for counts |
| 2 | Restaurant challenges: retention, weekday traffic, thin margins, acquisition cost | **Assumption** (plausible, general industry claim; no source seen) | Testable only through the pilot's venue feedback |
| 3 | Competitors: Square, Toast, OpenTable, SevenRooms, Loopy Loyalty, Luma, Eventbrite, Meetup, Instagram, WhatsApp, Telegram | **Assumption** (the products exist; that they are the relevant competitors is a positioning judgement) | No feature or pricing comparison was reviewed |
| 4 | Differentiation: a premium local community linking people, venues and businesses through real-world social activities | **Assumption** (a positioning hypothesis) | The pilot tests part of it (repeat engagement, venue feedback) |
| 5 | Celestia validation: six-week invitation pilot, two social events, opt-in sign-ups, actual attendance, repeat engagement, venue-owner feedback | **Assumption** (a proposed method, not a finding) | Adopted as Stage C4 above, with aggregate metrics and owner-set thresholds |
| 6 | Hypothetical models: free business clubs, optional premium subscriptions, local sponsorships; prices, revenue, market sizes and valuations need independent validation | **Unsupported projection** (by the report's own statement) | Phase 5 only, after counsel and pilot evidence |
| 7 | Conclusion: conditional support for a small measurable pilot; no justification yet for full multi-tenant SaaS or claims of commercial demand | **Assumption** (the report's judgement) | Agrees with this roadmap's order: the pilot (Stage C) comes before multi-club (Phase 2) or any SaaS or commercial work (Phase 5) |

No point in this summary is a verified fact by our own checking.
