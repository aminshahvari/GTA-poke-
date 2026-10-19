# P1 design: premium pre-game Business Spotlight

Status: **design only. No code exists for the pre-game presentation.** Production `4423a07` has only the single owner-picked Exchange Spotlight (`bizSpotlight`, `server/business.js:123-129`, `:232-239`), shown on Home and in the directory.

Scope: before a tournament's first hand, a short, premium (navy-and-gold) presentation of **one owner-approved featured business** from the club's Exchange.

Constraints: only businesses the owner approved **and** whose owner consented; **no payment flow**, no fees, no paid placement, no bidding; no click or view tracking per business (no referral tracking); no contact details beyond what the business already shows to members; never shown during a hand; never covers cards or action buttons; no betting language; investment solicitation stays closed (content rules apply).

## 1. Behaviour

- The presentation appears in the **lobby countdown** (registration closed / "Finding your seat…", `public/app.js:354`) and as the table's pre-deal state before hand 1. It ends automatically when hand 1 is dealt, or on "Skip".
- At most one business per tournament, chosen by rotation among approved ones. Never during play, never on the practice table, never at a shared cross-club game unless every participating club approved that business (default: none).
- Content: logo, business name, category, one-line description (≤120 chars, content-checked), up to 3 services, and the contacts the business already shows to members. Footer: "Featured by your club. Not paid. Not an endorsement." plus the free-social-play line.

## 2. Architecture

### 2.1 Data model (club-scoped)

| Key | Value |
|---|---|
| `bizfeature:<uid>` | `{ uid, status: requested\|approved\|paused\|revoked, consentAt, consentNoticeV, tagline (≤120), approvedAt, approvedBy, revokedAt }` |
| `bizfeaturerot` | `{ order: [uid], next: n, lastShown: { tid: uid } }` |

Existing `bizSpotlight` (Home pick) is unchanged and independent.

### 2.2 Endpoints and messages

| Call | Who | Effect |
|---|---|---|
| `bizFeatureRequest { tagline }` | owner of a published, visible profile | Creates `requested` with consent time + notice version |
| `bizFeatureWithdraw {}` | that business owner | `revoked`; removed from rotation immediately |
| `bizFeatureQueue {}` | club owner | Lists requests and approved businesses |
| `bizFeatureDecide { uid, approve }` | club owner | `approved` / declined; decline leaves no record visible to others |
| `bizFeaturePause { uid, paused }` | club owner | |

Socket: `clubView.tourney` gains `feature: { uid, name, category, tagline, services, contacts(shown only), logoV }` **only** while status is registration-closed / pre-first-hand; `null` otherwise. Logo via the existing token-gated logo route.

### 2.3 Authorization and isolation

- Approval needs club owner (or admin if the roles design grants it — decision 4). Consent needs the business owner. Both are required; either can end it at any time.
- The payload contains only fields the business already shows to members; never `fullName`/contacts that are switched off, never an invite code.
- Under club switching every key is club-scoped; a business is never featured in another club.
- Hidden/moderated or deleted profiles (`bizModerate`, `removeUser`) drop out of rotation automatically.
- No per-business counters, views or clicks are stored.

## 3. Phased plan

| Step | Ships | Size |
|---|---|---|
| F0 | Owner decisions | owner |
| F1 | Data model + request/withdraw/queue/decide/pause, flag `BIZ_FEATURE` | S |
| F2 | Rotation + `tourney.feature` in the pre-first-hand window | S |
| F3 | Client presentation card (lobby countdown + pre-deal table), Skip, auto-end at deal | M |
| F4 | Director queue UI; UI tests (overlap, timing, reduced motion) | S |
| F5 | Muse premium-UI review; staging with fake demo businesses; production GO | Muse / owner |

## 4. Owner decisions needed

1. Approve pre-game business presentations at all.
2. Confirm no payment of any kind is ever accepted for featuring.
3. Maximum length: auto-end at first deal only, or also a cap (suggested 20 s).
4. Who approves: club owner only (recommended) or admins too.
5. Footer wording ("Featured by your club. Not paid. Not an endorsement.").
6. Allow at shared cross-club games (recommended: no).

## 5. Acceptance tests

1. Flag off: club payload and Exchange answers byte-identical to `4423a07`; new calls 404.
2. `bizFeatureRequest` from a member without a published profile → 400; with one → `requested`, `consentAt` set.
3. Non-owner calls `bizFeatureDecide` → 403.
4. A `requested` (not approved) business never appears in `tourney.feature`.
5. With two approved businesses and two tournaments, each tournament shows exactly one, rotating.
6. `tourney.feature` is `null` once hand 1 is dealt, while running, and on the practice table.
7. A business owner withdraws → `tourney.feature` is `null` on the next club update.
8. Feature payload contains no contact whose `show` switch is off, no `fullName` if hidden, no invite code.
9. Moderating (hiding) a featured profile removes it from rotation.
10. No `bizfeature*` record contains view/click counts after a full tournament.
11. UI 320×568, 393×659, 844×390, desktop: card never covers the action dock; Skip works; it disappears at the first deal; reduced motion respected; navy-and-gold tokens only.
12. `CLUB_SWITCHING=1`: a club-A approved business never appears in club B's payload.
