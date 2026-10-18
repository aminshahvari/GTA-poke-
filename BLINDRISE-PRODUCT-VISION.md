# Blindrise: product vision

**Source:** the owner's directive "Official Product Vision & Phased Development Directive" of **2026-10-18**, sent by the Product Owner via the Project Manager. This file records it faithfully. Where it differs from today's product, see the capability inventory: `docs/vision/CAPABILITY-INVENTORY.md`.

**Scope:** Blindrise only. It is entirely separate from any other product of the owner.

## Mission
Blindrise must evolve from a social gaming community into a premium, scalable, community-powered platform that helps people connect and local businesses grow.

Gaming and shared experiences are conversation starters. Community belonging creates retention. Business networking, discovery, referrals and events create long-term commercial value.

## Approved brand identity
- Primary slogan: **Play. Connect. Belong. Grow.**
- Community message: **Together We Rise.**
- Business message: **Turn Customers Into a Community.**
- Restaurant campaign: **Your Night. Your People. Your Club.**

Preserve the premium navy-and-gold design language and the existing approved Business Club / Exchange experience.

## Non-negotiable product principles
1. Free and simple entry for individuals and small businesses.
2. One shared Blindrise identity with membership in multiple clubs.
3. Each business may eventually operate its own branded club.
4. All participating businesses can be discovered in a common public marketplace.
5. Private membership records, contact information, permissions and club-specific data must remain appropriately isolated.
6. Encourage cooperation, referrals and community growth, not merely paid advertising.
7. Design mobile-first with excellent performance, accessibility and premium visual quality.
8. Build for expansion beyond the initial GTA Iranian community.
9. Monetization must not compromise the free core experience.
10. No gambling, wagering, or game-outcome-linked prizes of monetary value in the proposed community engagement features.

## Phases (summary; details, dependencies and acceptance criteria are in `ROADMAP.md`)
1. **Foundation and restaurant pilot readiness.**
   - Stable mobile layout and polished game interface.
   - Reliable email onboarding and invitation links.
   - QR invitation flow with real, verified destinations.
   - Invite attribution and privacy-conscious analytics.
   - Premium printable restaurant assets.
   - Preserve approved features.
   - Initial pilot: **Celestia Restaurant & Lounge**, 10178 Yonge St, Richmond Hill, Ontario ("Celestia × Blindrise").
2. **Self-service business clubs.**
   - Verification and ownership; branding and profile.
   - A unique QR and URL per club; business-admin permissions.
   - One identity across many clubs.
   - Consented communications; basic analytics.
3. **Shared club marketplace.**
   - Discovery of businesses, public club profiles, events, public promotions and community activities.
   - Private member data is never shared across clubs.
4. **Social engagement and inter-club activities.**
   - Opt-in, non-wagering activities: trivia, team challenges, icebreakers, collaborative events, cross-club gatherings, and introductions with mutual consent.
   - Dining loyalty stays separate from game results.
5. **Commercialization.**
   - Optional business subscriptions and premium tools: promotions and events, aggregated analytics, CRM-style engagement, multi-location management, referral attribution, and optional sponsorship.
   - No unsupported revenue, market-size, valuation or conversion claims.

## Release boundaries (standing)
- No production deploy, configuration, secret or data change without the owner's explicit authorization naming the exact SHA.
- Every release needs an independent Muse review of that exact SHA. A merge to `main` is a production deploy.
- Unfinished features stay disabled.
- Proposed features are never described or advertised as available. That includes Celestia membership benefits, which are not approved.
- Investment solicitation stays closed pending Ontario legal review. No real money and no rewards for invites.
