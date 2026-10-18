# Multi-club architecture: feasibility and risk

**Directive principles covered:** 2 (one identity, many clubs), 3 (branded clubs), 4 (common marketplace), 5 (isolation).

**Baseline:** the code at `5c7ee11` is strictly **one club per deployment**. The full gap table is in `docs/strategy/STRATEGY-REVIEW.md` §4. Summary of what is global today:
- the `owner` key and `OWNER_CODE`;
- `settings`;
- a single `tourney`;
- `name:` uniqueness;
- sessions with no club scope;
- one store lease;
- the whole kv store cached in memory.

No figures here are revenue or market claims. Effort is S, M or L for one engineer-equivalent of agent time. All of it is inferred.

## Target model (proposal)
| Concept | Design |
|---|---|
| **Identity** | One platform `account` (name, PIN or a later email login). Accounts are global. A display name may be shown per club |
| **Membership** | `membership(club, account)` with a role: owner, admin or member. A per-club profile (avatar, stats) |
| **Club** | `club:<id>` holds branding (name, colours, logo), settings, owner/admin ids, a public profile and the verification state |
| **Isolation** | Every club-scoped key is `c:<clubId>:…`: invites, tourney, history, pstat, biz, opp, oppreq, rewards, chat. Every request resolves (account, club) and checks membership before touching a key. One club cannot list another club's members |
| **Marketplace** | A separate **public projection**: `pub:club:<id>`, `pub:biz:<id>`, `pub:event:<id>`. Written only from fields the club marks public. It never reads membership or contact keys |
| **Communications** | Per-club, per-member opt-in flags. No cross-club messaging without the member's consent |
| **Admin and recovery** | Per-club owner recovery through the platform (not an env secret per club). A platform admin role, held by the founder, with an audit log |

## Staged path
| Stage | What | Effort | Risk | Migration |
|---|---|---|---|---|
| 0 | **One deployment per club.** A new Render service and database per club, from today's code, with its own OWNER_CODE. Branding stays hard-coded unless stage 1 is done | S per club | Low for code; cost and operations grow linearly; separate member identities | None |
| 1 | **Branding config** in `settings` (club name, accent, logo) read by the client. Still one club per deployment | S–M | Low (client-heavy; additive key) | None (additive) |
| 2 | **Tenant keys inside one deployment.** Prefix keys, scope sessions, per-club tournament loops, per-club leases or a single writer per club | L | **High.** Touches every server module and rewrites all keys | **Required:** key-rewrite migration, rehearsed on an export copy, with rollback. Separate owner approval |
| 3 | **Shared identity** across clubs (global account + memberships), with name collisions resolved | M–L | High (auth change, needs the owner's explicit request) | Required |
| 4 | **Public marketplace** projection and pages | M | Medium (privacy). Needs a Muse privacy audit of every projected field | Additive |
| 5 | **Business verification** (manual by the platform admin first) | S–M | Medium (false claims) | Additive |

## Key risks
- **Cross-tenant leak:** one missed scope check exposes another club's members. Mitigation: a single data-access layer that requires `clubId`, plus a cross-tenant test that asserts zero reads outside the scope.
- **Memory:** the whole-store cache grows with clubs. Stage 2 needs per-club lazy loading (inferred).
- **Shared tournament loop:** timers per club in one process. Hand-for-hand and lease fencing are per process today.
- **Data migration:** irreversible without a rehearsed rollback. The standing rule needs separate approval for any migration.
- **Legal:** a platform hosting many clubs looks more like an "operator". Counsel review is needed before scale, per the legal notes.

## Recommendation
- Pilot with **stage 0** if a second club is needed before the design is approved.
- In parallel, write the stage 2–3 design and a migration rehearsal plan as documents only, for owner approval.
- Do not build stage 2 until the Celestia pilot shows demand. That threshold is the owner's decision.
