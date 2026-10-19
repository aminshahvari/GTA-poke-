# P1 roadmap

Written 2026-10-19 against production `main` `4423a07`. **Every item below is design only. None of them is a completed or released feature.** "Branch" means unreleased, non-production code.

| # | Item | Doc | Status | Code today | Depends on |
|---|---|---|---|---|---|
| 1 | Free-social-play notice + persistent label | [P1-SOCIAL-PLAY-NOTICE.md](P1-SOCIAL-PLAY-NOTICE.md) | design only | candidate on branch `social-play-notice` (not merged, not audited) | — |
| 2 | Independent clubs, shared identity | [P1-INDEPENDENT-CLUBS.md](P1-INDEPENDENT-CLUBS.md) | design only | foundation on branch `club-switching-fix` `139a7c4`, flag-off, Muse delta audit pending | `noMain` guard decision |
| 3 | Email registration, existing accounts kept | [P1-EMAIL-REGISTRATION.md](P1-EMAIL-REGISTRATION.md) | design only | none | email provider + domain approval |
| 4 | Business Club: consent-based B2B introductions | [P1-B2B-SUPPORT.md](P1-B2B-SUPPORT.md) | design only | Exchange directory in production; no introductions | — |
| 5 | Premium pre-game Business Spotlight | [P1-BUSINESS-SPOTLIGHT.md](P1-BUSINESS-SPOTLIGHT.md) | design only | single owner Spotlight on Home in production; no pre-game presentation | — |
| 6 | Opt-in shared social games across clubs | [P1-SHARED-SOCIAL-GAMES.md](P1-SHARED-SOCIAL-GAMES.md) | design only | none | item 2 live |

## Recommended order

1. **Social-play notice** — client-only, no data, lowest risk; reinforces the no-betting position before anything else grows.
2. **Independent clubs** — finish what exists: Muse delta audit, production `noMain` guard, then the roles/leave/request additions. Item 6 needs it.
3. **Email registration** — server work can proceed with the `log` transport in parallel with 2; release waits on provider/domain approval.
4. **Business Spotlight (pre-game)** — small, builds on the existing Exchange and Spotlight; no payment flow.
5. **B2B introductions** — larger consent surface; fixed purposes only, no messaging.
6. **Shared social games** — last: the widest isolation surface, and it needs item 2 in production.

## Constraints every item respects

No real money; no betting or new betting controls; no rewards for invites or introductions; no ranking members by wealth; no personal contacts or invite codes exposed without consent; no paid service without owner approval (email provider is the only one proposed); no messaging, NDA, referral tracking or verification systems; investment solicitation stays closed; Business Spotlight is owner-approved only with no payment flow.

## Owner decisions, all items

| Item | Decisions (one line each in the item's doc) |
|---|---|
| Notice | wording; once per tournament vs per table; also on registration/welcome |
| Clubs | `noMain` guard release; admin role; main-removal keeps other clubs; sign-in-then-join; `/avatar` restriction; request+approval creation; privacy wording |
| Email | provider; domain; PIN still required; code is a credential not a verification system; owner excluded from email reset; count-only for owner; daily cap; privacy wording |
| B2B | `offers`/`seeks` list; no free-text message; no brokered intros; badge vs push; Director counts; report pause |
| Spotlight | approve at all; never paid; duration cap; who approves; footer wording; shared games no |
| Shared games | approve at all; no points; club names shown; who proposes; club tag default off; size caps |
