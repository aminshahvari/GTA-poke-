# Capability inventory against the product vision (2026-10-18)

Baseline is live production `5c7ee11`. Branch items name their SHA. The full feature list with test evidence is in `docs/strategy/STRATEGY-REVIEW.md` §1 (`a4ce7ea`); this file maps it to the vision's phases.

Labels:
- **IMPLEMENTED:** live, with code or test evidence.
- **PARTIAL:** some of it is live, or it exists on an unreleased branch.
- **PROPOSED:** no code exists.
- **NOT VERIFIED:** claimed or plausible, but not checked here.

Line numbers refer to `server/index.js` at `5c7ee11` unless another file is named.

## Phase 1: Foundation and pilot readiness
| Item | Label | Evidence |
|---|---|---|
| Stable mobile layout | PARTIAL | Static sizes pass (`t_mobile_ux`, `t_premium_ui` 295/0). The iPhone viewport jump is reproduced by Muse; the fix is on the `mobile-stability` branch (in progress) and goes to `r2-hotfix` |
| Polished social game interface | IMPLEMENTED | Premium navy/gold, Muse PASS `bad2324`. Table redesign for 2–9 is on `table-redesign` `1cb2b89` (pushed 05:24 UTC, stacked on `mobile-stability`; not yet audited) |
| Real iPhone Safari verification | NOT VERIFIED | Only Chromium is available to Claude. The owner's phone smoke test is still owed |
| **Email onboarding** | PROPOSED | **No email exists anywhere in sign-up or sign-in.** Identity is display name + 4–8 digit PIN (`redeem`, `:73`). The only `email` in the server is an optional Business Club contact field (`server/business.js:22,78`). No mail sending, and no member PIN recovery |
| Invitation links | IMPLEMENTED | Single, owner group (100 people / 30 days) and member (10 / 7 days) links; revoke; auto-join tournament (`:73-90`, `:128-149`, `:433`). Used live on Oct 17 |
| **QR invitation flow** | PROPOSED | **No QR generation or QR library in the code** (searched `server/`, `public/`). Any QR today would have to be generated outside the app |
| **Invite attribution** | PARTIAL | Live: each member record stores `invitedBy` (the user who made the link, `:84`), and each link stores the ids that used it (`uses` / `usedBy`). Director shows "N of M joined" per link. There is no source or venue label on live. On `public-onboarding` `8b2b1fa`: a public "campaign" link with an owner-set `source` label, its own cap/expiry, a per-source report (joined, played at least one hand) and per-IP sign-up limits. That work is Muse PASS but built on the old Shape A line, so it needs a rebase onto R2 and a delta audit |
| Privacy-conscious analytics | PARTIAL | No analytics or tracking code on live (searched; none). The only "analytics" is the campaign report on `8b2b1fa` (counts per source, names visible to the owner only) |
| Printable restaurant assets | PROPOSED | Draft layout only, with a QR placeholder: `docs/vision/print/celestia-a5-draft.html` (this branch) |
| Preserve approved features | IMPLEMENTED | Exchange design untouched by every open branch (client diffs reviewed per branch) |

## Phase 2: Self-service business clubs
| Item | Label | Evidence |
|---|---|---|
| Business profiles (one per member) | IMPLEMENTED | `server/business.js`; 17 categories, Spotlight, search; Muse audited |
| A business operating its own club | PROPOSED | One club per deployment: one `owner` key, one `OWNER_CODE`, one `settings` (`:26`, `:63-100`, `:126`) |
| Business verification / ownership | PROPOSED | No verification. Profiles are self-declared by members |
| Custom branding per club | PROPOSED | Brand is hard-coded ("Blindrise" in `public/index.html` title/OG, `public/app.js`). No branding settings |
| Unique QR / URL per club | PROPOSED (URL: PARTIAL) | Per-link URLs exist (`/join/<code>`); per-club URLs do not |
| Business-admin permissions | PROPOSED | Roles are `owner` / `member` only |
| One identity across many clubs | PROPOSED | Names are unique per deployment (`name:<lower>`); no cross-club identity |
| Member-consented communications | PARTIAL | Web Push opt-in for tournament notices (`server/push.js`); contact sharing only by explicit opt-in (`oppreq.shared`). No business-to-member messaging |
| Club engagement analytics | PROPOSED | — |

## Phase 3: Shared marketplace
| Item | Label | Evidence |
|---|---|---|
| Discovery of businesses | PARTIAL | Members-only directory inside one club (The Exchange), behind the clubs switch. Not public |
| Public club profiles, events, promotions | PROPOSED | Tournaments are the only events; no promotions object |
| Cross-club isolation | PROPOSED | Isolation exists today only because each deployment is one club |

## Phase 4: Social engagement
| Item | Label | Evidence |
|---|---|---|
| Free tournaments, chat, throws, Learn | IMPLEMENTED | `server/club.js`, `:307-330`, `public/learn.js` |
| Points / rewards shop | IMPLEMENTED | `server/rewards.js`: points come only from finishing places; not transferable; skill-testing question. **Note:** these are game-outcome-linked rewards. Principle 10 applies to new engagement features; the existing shop is covered by the legal notes and is unchanged |
| Show Cards / hand delay / Rabbit Hunt | PARTIAL | `gameplay-options` `e391f8d`, default-off behind `GAMEPLAY_OPTIONS`; fairness parity 3,000/3,000; Muse PASS on branch (`aed6f2c` §2c) |
| Trivia, team challenges, icebreakers, introductions | PROPOSED | — |

## Phase 5: Commercialization
| Item | Label | Evidence |
|---|---|---|
| Subscriptions, sponsorship, premium tools | PROPOSED | No payment code. The legal notes require legal advice before any revenue |
| Referral attribution | PARTIAL | Same as invite attribution above |
