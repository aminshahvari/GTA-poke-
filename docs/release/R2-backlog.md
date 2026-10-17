# Release 2 backlog (prioritized, not started)

Claude, 2026-10-17. Sources: Muse R1 RC audit (CONDITIONAL GO, §§4-7), owner decisions of Oct 16-17, R1 manifest §10. **Nothing here is being built.** R1 stays frozen at `a8eef118bf38de9d6ffdb0a1394595161909b5a8`; each item below starts only with the owner's go and ships only after Muse's audit.

| # | Item | Why / acceptance | Kind | Needs owner first |
|---|---|---|---|---|
| 1 | **B6** sessions: revoke all sessions on PIN change / `resetOwner`; per-source recovery rate limit so strangers cannot lock the owner out | phase1 `sessions_owner_reset` passes fully | auth (security) | approval (auth change) |
| 2 | **Chat isolation test + `t_server.js` de-flake** | dedicated cross-table chat isolation test green; 20 consecutive green `t_server` runs | reliability / privacy | — |
| 3 | **F1** listing content rule: enforce server-side (Claude's probe matrix as a committed test) *or* correct the UI copy | must be done before Opportunity Club is opened to members | privacy | choose enforce vs. copy |
| 4 | **B5** fairness record for an interrupted hand | phase1 `fair_after_interrupt` passes under the owner's policy | fairness proof | policy: what the record shows |
| 5 | **Table crowding at 375x667, 7-9 players** (MAJOR visual) | no chip/label overlap at 375x667, 360x780, 390x844 with 9 players all betting | UI | — |
| 6 | **Scanner device matrix** (iPhone Safari, Android Chrome: capture, WASM, first load, OCR, review keyboard) | passes on real phones, or the scan entry points are hidden | device QA | owner's phone pass |
| 7 | **Scheduled breaks** + **late-registration level 1-12** (owner decisions recorded in `BREAKS-proposal.md`: break ≠ pause; late reg open through a break while the window is open; preferred close at start of level 9) | `t_breaks.js` per proposal; restart mid-break; no change when Off | tournament clock | approved for R2 |
| 8 | Business Report/Flag | members can report a business like a listing | moderation | — |
| 9 | Moderation audit log, re-report rules, hidden-cap fix | Muse's moderation findings | moderation | — |
| 10 | `/livez` health endpoint (C2 Option B) | liveness separate from leadership | ops | Render setting later |
| 11 | Self-host Google Fonts | no third-party font request | privacy / perf | — |
| 12 | Owner reset of a member's PIN | members who forget a PIN don't need a new account | auth | approval (auth change) |
| 13 | Visual POLISH list (manifest §10 + Muse §5): chips touching at 360 px, showdown cards over avatars, hand-helper layout shift, resize mid-animation, truncated industry names, Demo tag overlap, 820 px desktop cap, industry colour tokens, tall hero, hero name plate overlap | — | UI | — |
| 14 | Multi-club (shared identity, separate memberships, isolation) | design + security audit first | architecture | approval |
| 15 | Gemini proposals for review: Tablemates, Smart Club Lounge, AI Matching, VIP Invitations, Club Assist | product review only | product | approval |

## R1 release conditions (Muse §6) — owner actions, not code

1. Written acceptance of B5, B6 and unverified chat isolation as known issues (or wait for the B6 fix + re-audit).
2. Pre-deploy backup of `gta-poker-db` (manual export, time + size recorded).
3. OWNER_CODE rotated on the production service.
4. Between-games window confirmed.
5. Clubs stay closed at deploy.
