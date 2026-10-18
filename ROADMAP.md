# Blindrise roadmap (phased)

**Source:** `BLINDRISE-PRODUCT-VISION.md` (the owner's directive, 2026-10-18).

**Status:** current state per `docs/vision/CAPABILITY-INVENTORY.md` (labels: IMPLEMENTED / PARTIAL / PROPOSED / NOT VERIFIED).

**Gates on every milestone:**
1. Isolated branch.
2. Tests green.
3. Muse verdict on the exact SHA.
4. Owner GO naming that SHA.
5. Quiet window and fresh backup.

A merge to `main` is a production deploy. Any data migration or mandatory onboarding gate needs **separate** owner approval.

## Phase 1: Foundation and Celestia pilot readiness
| Milestone | Depends on | Acceptance criteria |
|---|---|---|
| M1.1 Mobile stability release (`r2-hotfix`: viewport fix, Lounge practice card, invite rows) | none | Muse viewport probe: table geometry invariant (±2 px) when the viewport height changes 844↔754, on rotation and on keyboard open; `t_hotfix` 39/0; regression suites green; owner iPhone smoke test of 12 steps passes |
| M1.2 Table redesign for 2–9 players | M1.1 | `t_table_layout` at 2–9 players × 320/375/390/430 px: no overlaps, action bar on screen; navy and gold kept; engine diff empty |
| M1.3 Release record closed | none | Backup evidence filed or marked missing; OWNER_CODE decision recorded |
| M1.4 Public campaign link on R2 (venue attribution) | M1.1 | `t_campaign` and `t_campaign_ui` green on R2; Muse delta audit; no auto-join from public links; per-source report correct |
| M1.5 Optional `/v/<source>` stable venue path | M1.4, owner decision | Tests in `INVITES-AND-VENUE-ATTRIBUTION.md` §5; Muse C1–C6 |
| M1.6 Celestia print assets | M1.4 (and M1.5 if chosen), owner decisions 1–5 in `CELESTIA-PILOT.md` | Pilot acceptance P1–P9 |
| M1.7 Email onboarding (optional sign-in email, member PIN recovery) | owner decision (auth change) | Email optional and never shown to members; verified-link flow; no change for existing PIN users; Muse security audit. **PROPOSED, not started** |
| M1.8 Privacy-conscious analytics | M1.4 | Aggregate counts only (joins, first hand, weekly active); no third-party scripts; no new personal fields |

## Phase 2: Self-service business clubs
Depends on Phase 1 and the multi-club decision (`MULTI-CLUB-FEASIBILITY.md`).

| Milestone | Acceptance criteria |
|---|---|
| M2.1 Branding config (stage 1) | Club name, accent and logo from settings; defaults identical to today (pixel diff on `t_premium_ui`) |
| M2.2 Multi-club design and migration rehearsal (documents) | Owner approval of the design; rehearsal on an export copy with rollback proven |
| M2.3 Tenant keys and shared identity (stages 2–3) | Cross-tenant test: zero reads outside the scope; all suites green per club; migration and rollback rehearsed |
| M2.4 Business-admin role, verification (manual) and per-club QR/URL | Role tests; verification audit log; QR decode test |
| M2.5 Consented communications and basic club analytics | Opt-in default off; unsubscribe works; aggregates only |

## Phase 3: Shared marketplace
| Milestone | Depends on | Acceptance criteria |
|---|---|---|
| M3.1 Public projection and discovery pages | M2.3 | Muse privacy audit: every projected field is opted public; no membership or contact data reachable; search and categories keep the approved Exchange look |

## Phase 4: Social engagement (opt-in, non-wagering)
| Milestone | Acceptance criteria |
|---|---|
| M4.1 Trivia and team challenges | No stakes, no prizes of monetary value, no link to dining offers; opt-in |
| M4.2 Introductions with mutual consent | Both sides must accept; no contact shared before that |
| M4.3 Gameplay options (Show Cards, hand delay, Rabbit Hunt), on `gameplay-options` `e391f8d`, default-off | Muse fairness review; flags-off parity; owner decisions on the rules |

## Phase 5: Commercialization
| Milestone | Depends on | Acceptance criteria |
|---|---|---|
| M5.1 Legal review | none | Counsel opinion on file before any revenue |
| M5.2 Optional business tools / subscriptions | M5.1, Phase 2 | Never tied to entry, chips, points or prizes; the free core is unchanged |

## Proposed order
M1.1 → M1.3 → M1.4 → (owner decisions) → M1.5 / M1.6 → M1.2 → M1.8 → M2.1 → M2.2 → M5.1 (in parallel) → the rest. M1.7 when the owner asks for an auth change.
