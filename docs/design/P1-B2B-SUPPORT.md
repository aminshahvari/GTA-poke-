# P1 design: Business Club and consent-based B2B introductions

Status: **design only. No code exists for introductions.** The Business Club directory ("The Exchange", `server/business.js`, `public/business.js`) is already in production `4423a07`; this design extends it.

Scope: members discover each other's businesses and ask for an introduction; **nothing is shared unless the business owner accepts and chooses what to share.**

Constraints, and how this design respects them:

| Constraint | In this design |
|---|---|
| No messaging (not approved) | No free-text messages. A request is a fixed **purpose** chosen from a list. |
| No referral tracking (not approved) | No third-party / brokered introductions, no "introduced by" records, no counts. |
| No NDA, verification systems, betting controls | None added. |
| Investment solicitation closed | No investment/funding purpose or field; a report reason exists. |
| No wealth ranking | No revenue/size fields; directory stays alphabetical. |
| No contacts or invite codes without consent | Contacts move only through the owner's explicit share step; invite codes are never in Exchange payloads. |
| No rewards, no money | Introductions earn nothing; no fees or paid placement. |

## 1. Current state (`4423a07`)

- `biz:<uid>` profile: name, category (17 fixed), description, services, area, opt-in contacts (website, Instagram, email, phone, address) each with its own `show` switch (`server/business.js:105-117`), `referrals` flag. Free text cannot contain contact details (`:52-54`, `server/content.js`).
- `bizList` alphabetical, "New to the Club", one owner-picked `bizSpotlight` (`:123-129`, `:232-239`). Members only; Exchange closed until the owner opens it; `noindex`; logos token-gated.
- No way to reach a business that shares no contacts. The Bulletin (`server/opportunity.js:207-240`) already has the request → decline-or-choose-what-to-share pattern this design reuses (minus its free-text message).

## 2. Architecture

### 2.1 Data model (club-scoped; private per club under club switching automatically)

| Key / field | Value |
|---|---|
| `biz:<uid>` new fields | `offers: id[]`, `seeks: id[]` from a fixed list (customer referrals, suppliers, subcontracting, collaboration, advice, event partners, space/equipment sharing — **no investment option**); `acceptIntros: bool` (default **off**), `introsConsentAt`, `introsNoticeV` |
| `bizintro:<id>` | `{ from, to, purpose (fixed id), status: pending\|connected\|declined\|withdrawn\|expired, shares: { <uid>: { email?, phone?, website?, at, stoppedAt? } }, log: [{ at, uid, action, fields?, noticeV }], createdAt, expiresAt (14 d) }` |
| `bizblock:<uid>` | `{ uids: [] }`, readable only by its owner |
| `bizlimit:<uid>` | `{ intros: [ts] }`, persisted |
| `bizintroreport:<id>` | `{ introId, by, reason (fixed list incl. "Investment or fundraising request"), createdAt, reviewed }` |

### 2.2 Endpoints (`POST /api/biz*`; inherit members-only, Exchange-closed gate, `noindex`, per-club dispatch)

| Call | Who | Rule |
|---|---|---|
| `bizSave` (extended) | profile owner | `offers`, `seeks` validated against fixed ids; `acceptIntros` records consent time + notice version |
| `bizList` (extended) | member | filters `offers`, `seeks`, `referrals`, `acceptsIntros`; still alphabetical |
| `bizIntroSend { to, purpose }` | member with a published profile | `to` must accept intros and not block the sender; otherwise the same "not taking introductions right now" answer |
| `bizIntroAnswer { id, accept }` | recipient | Decline → sender sees only "Not going ahead" |
| `bizIntroShare { id, email?, phone?, website? }` | either party after `connected` | Values come only from the caller's **own** profile contacts |
| `bizIntroStop { id }` | either party | Removes their shares from the other's view from now on |
| `bizIntroWithdraw { id }` | sender, while pending | |
| `bizIntros {}` | member | Own incoming / sent / connected only |
| `bizIntroBlock { uid, on }`, `bizIntroReport { id, reason }` | recipient | Block is indistinguishable from intros switched off |
| `bizBadge {}` | member | Count of own pending items |

No WebSocket messages; Exchange stays HTTP-only.

### 2.3 Authorization and isolation boundaries

- Each answer contains only what that member may see: party views of their own introductions; never another pair's.
- The owner sees reported introductions (purpose + report) only; never shares, never browsing.
- Same-club only: `to` must be a member of the caller's club; a uid from another club gets the same answer as an unknown business.
- Limits: 5 requests per day, 1 open per pair, 30-day silent cooldown after decline/expiry, ≤20 pending outgoing.
- Removal (`business.removeUser`) deletes every `bizintro` where the member is a party, plus their block, limit and report records.

## 3. Phased plan

| Step | Ships | Size |
|---|---|---|
| B0 | Owner decisions; flag `B2B_INTROS` | owner |
| B1 | `offers` / `seeks` fields + directory filters (no contact flow yet) | S |
| B2 | `acceptIntros` switch with consent notice | S |
| B3 | Direct introductions: send / answer / share / stop / withdraw / expire, consent log, limits | M |
| B4 | Block + report + owner report queue | S |
| B5 | Client in existing `bz-*` components; UI tests; Muse premium-UI check | M |
| B6 | Staging with fake demo businesses; production behind the Exchange switch + `B2B_INTROS` | owner GO |

Rollback: old code ignores the new keys; an edit under old code drops `offers/seeks/acceptIntros` (member opts in again).

## 4. Owner decisions needed

1. Approve the fixed `offers`/`seeks` list (and confirm it holds no investment option).
2. Confirm "no free-text message" for P1 (fixed purpose only).
3. Confirm brokered (third-member) introductions stay out of P1.
4. Notification: in-app badge only (recommended) or also existing free Web Push.
5. Director sees aggregate counts (no names) or nothing (recommended nothing).
6. Whether 3 reports pause a member's ability to send introductions pending review.

## 5. Acceptance tests

1. Flag off: every Exchange and Bulletin answer byte-identical to `4423a07`; new calls 404.
2. `bizSave` with an unknown or investment-like `offers` id → 400.
3. `bizList { seeks: ['suppliers'] }` returns exactly the matching businesses, alphabetically.
4. Every existing profile reads `acceptIntros: false`; `bizIntroSend` to one → "not taking introductions right now".
5. A → B request, B declines: A's `bizIntros` shows "Not going ahead"; no field reveals that B declined vs blocked vs switched off.
6. A → B accepted: neither side's answer contains any contact until that side calls `bizIntroShare`; shared values equal that side's own profile contacts; arbitrary values → 400.
7. `bizIntroStop` by B: A's next `bizIntros` no longer contains B's shares; consent log has `stop` with timestamp and notice version.
8. Every accept / decline / share / stop / opt-in writes one log entry with `at`, `uid`, `noticeV`.
9. Third member C calls `bizIntros` → none of A–B's introduction appears; any `bizIntro*` on A–B's id → 404.
10. Limits: 6th request in a day → refused; repeat to same pair within 30 days of decline → same answer as switched off; limits hold after a restart.
11. Payload scan: no Exchange answer contains an `invite:` code, an unshared contact, or a revenue/size field.
12. Removing B deletes all `bizintro` with B as a party.
13. `CLUB_SWITCHING=1`: request from club A to a club-B uid → unknown-business answer; no B marker in A.
14. UI 320×568 and 390×844: filters, request sheet, answer and share sheets use only existing `bz-*` styles; no horizontal scroll; `t_bizsearch`, `t_premium_ui` still pass.
