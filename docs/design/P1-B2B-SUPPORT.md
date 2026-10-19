# P1 design: business-to-business support in the Exchange

Status: **design only. No code changed.** Written 2026-10-19 against production `main` = `4423a07`. Where it matters, it also reads the unreleased `club-switching` branch (`06f8662`).

**Approved scope:** members can discover businesses, make consent-based introductions and support each other, all through the **existing** Business Club ("The Exchange"). The approved premium navy-and-gold Exchange design is kept: no new visual language, only existing `bz-*` components and tokens.

Standing constraints:

- No real money: no paid introductions, no fees, no paid placement.
- No rewards for invites or introductions.
- Investment solicitation stays **closed** pending the Ontario legal review.
- Nothing ranks members by wealth.
- No personal contact details are exposed without consent.
- Invite codes are never exposed.

---

## 1. Current state at `4423a07`

### The Exchange today (`server/business.js`, `public/business.js`)

**Directory**

- `biz:<uid>` holds one profile per member (`server/business.js:5-10`).
- The fields are name, optional full name and title, category (17 fixed industries, `:14-21`), description, services, area, and contacts (website, Instagram, email, phone, address). There is also a `referrals` flag ("Open to referrals and collaborations", `public/business.js:331`).
- Each contact field shows to members only if its owner switched it on (`show`, `server/business.js:105-117`, `:170-171`).

**Free-text fields can't carry contact details**

- Name, description and services may not contain web addresses, emails, handles or phone numbers (`server/business.js:52-54`, rules in `server/content.js`).
- Contacts go only in the opt-in contact fields.

**Discovery**

- `bizList` returns the whole directory sorted **alphabetically** (`server/business.js:206-214`), with the "New to the Club" list (30 days, `:122`) and one owner-chosen Spotlight (`:123-129`, `:232-239`).
- Search and category chips run on the phone (`public/business.js:109-160`); `test/ui/t_bizsearch.js` covers them.

**Detail page**

- It shows the contacts the member chose. If none are shown it says *"This member has not shared contact details here yet. Say hello at the next tournament."* (`public/business.js:195-213`).
- There is **no in-app way** to reach a business that shares no contacts.

**Access and moderation**

- Signed-in members only (`member()`, `server/business.js:30`).
- The Exchange stays closed to members until the owner opens it (`server/index.js:124-127`, `:188`).
- Answers carry `X-Robots-Tag: noindex` (`server/index.js:159-160`, `:175`).
- Logos are only served with a token (`server/index.js:200-207`, `server/business.js:251-258`).
- The owner can hide a profile or spotlight one (`server/business.js:231-248`).

**Removal**

- `removeUser(uid)` deletes the profile, the logo and the preferences (`server/business.js:260-264`).
- It is called when a member is removed (`server/index.js:436`) and when a member deletes their own profile (`:195-199`).

### The Bulletin (Opportunity Club, `server/opportunity.js`), the consent pattern this design reuses

**Listings**

- "I need help" and "I can help" listings, `opp:<id>`.

**Contact requests (`oppreq:<id>`, `server/opportunity.js:207-221`)**

- A member sends a short private message.
- The message may not contain contact details (`:213`).

**The poster's answer (`oppReply`, `:222-240`)**

- The poster declines, or chooses which of email, phone and a note to share.
- Nothing is shared automatically.

**Limits and moderation**

- Limits are stored, so a restart does not reset them (`opplimit:`, `:44-50`): 10 requests per hour, 10 listings per day.
- Reports use fixed reasons (`:20-22`); 3 reports auto-hide a listing (`:249-263`); the owner has a review queue (`:264-286`).

**Client**

- The share sheet is `shareSheet` (`public/opportunity.js:216-243`).
- The request sheet is `contactSheet` (`:183-197`).

### Club switching (branch)

`business.js` and `opportunity.js` are loaded once **per club**, each with that club's scoped store (branch `server/clubs.js:24-34`). Every `biz*` and `opp*` key is therefore already private to a club. The branch tests say a club B business is invisible from main.

### What is missing for the approved capability

1. **Discovery by need.** A business can't say what it **offers to** or **is looking for from** other businesses, and nobody can filter on the existing `referrals` flag.
2. **Introductions.** There is no consent-based way to connect two businesses:
   - neither directly, when a business hides its contacts;
   - nor through a third member who knows both.
3. **Mutual support.** Nothing lets a business record that another member's business helped it. The only signal is the owner's Spotlight.

---

## 2. Approach

All of this is inside the Exchange, on the existing pages. Each feature is a small extension of a pattern that already exists:

| Need | Built from |
|---|---|
| Discover | `bizList` and the directory filters, plus two fixed-choice profile fields |
| Introductions | The Bulletin's request → decline-or-share flow, for businesses instead of listings, plus a double-opt-in version made by a third member |
| Mutual support | Short written recommendations between businesses that have had an accepted introduction. They show on a profile only after the recipient approves. No scores, counts or ranking. |

---

## 3. Architecture

### 3.1 Discover

**New optional profile fields in `bizSave`** (`server/business.js:149-185`). Both are fixed lists, not free text, so no contact details and no investment wording can creep in:

- `offers: []`, "What we offer other businesses";
- `seeks: []`, "What we're looking for".

The choices:

- Customer referrals
- Suppliers or vendors
- Subcontracting or overflow work
- Collaboration or joint projects
- Advice or mentoring
- Event partners
- Space or equipment sharing

**There is deliberately no** "investment", "funding", "capital", "partners with money" or "lenders" choice. Investment solicitation stays closed.

**Directory filters**

- **Open to referrals:** the existing `referrals` flag.
- **Offers** and **Looking for:** the two new lists.
- **Accepts introductions:** see 3.2.

The filters reuse the existing chip row and the client-side filtering (`public/business.js:109-160`). The server also accepts `offers`, `seeks` and `referrals` on `bizList`, as it does for `category` today.

**"Good fits for you"** is a private card on the member's own "My business" page.

- It lists businesses whose `offers` match the member's `seeks`, and the other way round.
- The list is alphabetical, with at most 12.
- It is computed on request and never stored.
- Nobody else sees it.

**Sort order is unchanged:** alphabetical in the directory, newest first in "New to the Club", Spotlight first on Home. Nothing sorts by size, revenue, recommendation count or activity.

### 3.2 Introductions

The data lives in club-scoped keys, which are automatically private per club under club switching.

**Opt-in on the profile.** A new switch: "Accept introduction requests from members" (`acceptIntros`). **It is off by default for every existing profile.** Being "Open to referrals" is not consent to be contacted. Turning the switch on records `introsConsentAt` and the notice version.

There are two kinds of introduction.

#### A. Direct request: member → business

1. Member A opens a business B that accepts introductions and taps **Request an introduction**.
2. A picks a purpose from the `offers`/`seeks` list. There is no investment option.
3. A writes a short message: up to 500 characters, with the same content rules as Bulletin messages, so no contact details.
4. B sees it in **Introductions → Incoming** and either:
   - **declines**, in which case A sees only "Not going ahead" with no reason; or
   - **accepts and chooses what to share**: email, phone or a note, any subset, prefilled from B's *own* business contacts and visible only to B. This is the `oppReply` share step (`server/opportunity.js:222-240`).
5. After B accepts, A gets the same optional share step back. A's details are never shared automatically.

A request expires after 14 days with no answer.

#### B. Introduction made by a member: C introduces A and B

1. Member C, who knows both, taps **Introduce to…** on business B's page, picks member A from the directory and writes a short note saying why.
   - Both A and B must have published, visible businesses.
   - Both must have `acceptIntros` switched on.
2. **Double opt-in.** A and B each get the introduction separately, and each answers on their own. **Nothing is shared and neither learns the other's answer until both accept.**
   - If both accept, each then chooses what to share, as in step 4 of the direct request.
   - If either declines or lets it expire, both see "Not going ahead" and nobody learns who declined.
3. C sees only "Pending", "Connected" or "Not going ahead". C never sees what was shared.

**Withdrawing**

- The requester (or C) can withdraw while the introduction is still pending.
- After a connection, either side can **stop sharing**. Their shared details are removed from the other side's view from then on. The design states plainly in the UI that details already seen cannot be "unseen".

**Blocking.** On any incoming request a business can choose "Don't accept introductions from this member". Later requests from that member get the same answer as a business that has switched introductions off ("This business isn't taking introductions right now"), so the block is never revealed.

### 3.3 Mutual support: recommendations

- After an introduction is **Connected**, either side may write one short recommendation of the other business: up to 300 characters, the same content rules, no contact details.
- The recipient sees it as **Pending** and chooses **Show on my profile** or **Keep private**. They can hide it later at any time, and the author can delete it.
- Shown recommendations appear on the business page under **"Members say"**:
  - as text with the author's club name and date, newest first;
  - **with no count, no stars and no score**;
  - never on directory cards and never used for sorting.
- No rewards, points, tiers or badges come from recommendations or introductions.

**Owner decision:** recommendations are the proposed reading of "mutual support". If the owner prefers, P1 can ship discovery and introductions only, and recommendations follow.

### 3.4 Data model (additive keys and fields; all club-scoped)

| Key or field | Value |
|---|---|
| `biz:<uid>` (new fields) | `offers: string[]`, `seeks: string[]` (fixed ids), `acceptIntros: bool`, `introsConsentAt`, `introsNotice` (notice version) |
| `bizintro:<id>` | `{ id, kind: 'direct'\|'brokered', by, a, b, purpose, message, status: pending\|connected\|declined\|withdrawn\|expired, answers: { <uid>: { state: accept\|decline, at } }, shares: { <uid>: { email?, phone?, note?, at, stoppedAt? } }, log: [{ at, uid, action, fields?, notice }], createdAt, expiresAt }` |
| `bizrec:<id>` | `{ id, introId, from, to, text, status: pending\|shown\|private, createdAt, decidedAt }` |
| `bizblock:<uid>` | `{ uids: [] }`, readable only by its owner |
| `bizlimit:<uid>` | `{ intros: [ts], brokered: [ts], recs: [ts] }`, kept in storage like `opplimit:` |
| `bizintroreport:<id>` | `{ id, introId, by, reason, note, createdAt, reviewed }` |

**Consent records.** Every consent action is appended to `bizintro.log` with a timestamp, the member, the fields shared and the version of the notice text they saw:

- accept;
- decline;
- share;
- stop sharing;
- switching `acceptIntros` on or off.

That log is the audit trail. Members see their own entries; nobody else sees them.

**Removal.** `business.removeUser(uid)` (`server/business.js:260-264`) also deletes:

- every `bizintro` where the member is `by`, `a` or `b`;
- every `bizrec` from or to them;
- their `bizblock`, `bizlimit` and reports.

It already runs on member removal and on profile deletion. Under club switching it runs per club.

### 3.5 API (`POST /api/biz*`)

All the new calls inherit what every `/api/biz*` call already gets: the members-only check, the Exchange-closed gate, `noindex` (`server/index.js:175`, `:188`) and, on the club-switching branch, per-club dispatch (`CLUB_API`, branch `server/index.js:148`).

| Call | Who | Notes |
|---|---|---|
| `bizSave` (extended) | profile owner | `offers`, `seeks`, `acceptIntros` |
| `bizList` (extended) | member | `offers`, `seeks`, `referrals` filters. Cards carry `offers`, `seeks`, `acceptsIntros` (boolean). |
| `bizFits` | member | Own "Good fits" list |
| `bizIntroSend { to, purpose, message }` | member | Direct request |
| `bizIntroPropose { a, b, note }` | member | Brokered (double opt-in) |
| `bizIntroAnswer { id, accept }` | `b`, or `a`/`b` for brokered | |
| `bizIntroShare { id, email?, phone?, note? }` | either party after connected | Choose what to share |
| `bizIntroStop { id }` | either party | Stop sharing from now on |
| `bizIntroWithdraw { id }` | `by` | Only while pending |
| `bizIntros {}` | member | Incoming, sent, made by me, connected. Each item shows only what that member may see. |
| `bizIntroBlock { uid, on }` | member | |
| `bizIntroReport { id, reason, note }` | recipient | Reasons as the Bulletin's, **plus "Investment or fundraising request"** |
| `bizRecWrite`, `bizRecDecide`, `bizRecDelete` | parties | |
| `bizBadge` | member | Pending items count for the Exchange tab badge. The same idea as `oppBadge` (`server/opportunity.js:202-206`). |

**Owner (Director) moderation**

- **Reports only.** The owner sees a reported introduction's message and the report, never the shared contacts.
- The owner cannot browse members' introductions. **Owner decision:** whether the Director sees aggregate counts (for example "12 introductions connected this month") with no names.

**WebSocket:** none. The Exchange is HTTP-only today, and this stays HTTP-only.

### 3.6 Client screens (existing Exchange design, `bz-*` components, navy-and-gold tokens)

| Screen | Change |
|---|---|
| Directory (`renderList`, `public/business.js:115`) | New filter chips in the existing chip row: Open to referrals, Offers…, Looking for…, Accepts introductions. Cards unchanged apart from a small "Accepts introductions" tag in the existing `bz-tag` style. |
| Business detail (`renderDetail`, `:187`) | In the existing "Connect" section: **Request an introduction** (`btn bz-gold`) when the business accepts introductions; **Introduce to…** as a secondary button. New sections "Offers" and "Looking for". "Members say" shows only approved recommendations. The current "Say hello at the next tournament" line stays for businesses that accept no introductions. |
| My business (`renderMine`, `:226`) | An **Introductions** section with tabs Incoming, Sent, Made by me and Connected; a **Good fits for you** card; **Recommendations** to approve. |
| Edit (`renderEdit`, `:279`) | Offers and Looking-for chip pickers, plus the "Accept introduction requests" switch with a one-line notice: *"Members can ask to be introduced. You decide each time, and nothing is shared unless you choose to share it."* |
| Sheets | Request, introduce, answer and share sheets reuse the Bulletin's sheet component and share form (`public/opportunity.js:173-243`) with Exchange wording. |

**Visual acceptance.** The Muse premium-UI verdict (`docs/release/MUSE-VERDICT-premium-ui-df2e1d6-2026-10-17.md`) is the reference. Screenshots at 320×568 and 390×844 are compared before and after for directory, detail and My business. There are no new colours, fonts or icons outside `public/icons.js`.

---

## 4. Dependencies

- **No new external service and no cost.**
- Notifications are an in-app badge only.
  - Push notifications for incoming introductions would use the existing self-hosted Web Push (`server/push.js`) at no cost.
  - Push is used only for tournaments today, so this is an **owner decision**.
  - Email notifications would depend on P1-EMAIL-REGISTRATION and are not proposed.
- Works with and without club switching. Under club switching every new key is club-scoped without extra code, because `business.js` gets the scoped store.

---

## 5. Security and privacy

### Personal contacts are never exposed without consent

- Contacts move only through an explicit share step by their owner, per introduction.
- A share is never prefilled from someone else's data, and nothing is shared at accept time by default.
- Brokered introductions are double opt-in. The broker never sees what is shared.
- Messages, notes and recommendations go through `content.check`, so they can't carry contact details.
- "Stop sharing" removes shared details from the other party's view from then on.

### Consent records

Every accept, decline, share, stop and opt-in carries a timestamp and the notice version, as listed in section 3.4.

### No wealth ranking

- There are no revenue, size, employee, funding or client-count fields.
- Sort order is alphabetical or by date only.
- There is no recommendation count anywhere and no "top" list.
- Spotlight stays the owner's single manual pick, as today.

### Investment solicitation stays closed

- No investment purpose, offer or seek option exists.
- The edit and request sheets say "Not for investment or fundraising requests".
- There is a dedicated report reason.
- **Owner decision:** whether to add an automatic check that refuses common investment-solicitation phrases. That may cause false positives. Wording to be confirmed with counsel.

### Harassment and spam

Every limit is kept in storage (`bizlimit:`):

| Limit | Value |
|---|---|
| Direct requests per member | 5 per day |
| Brokered introductions per member | 3 per day |
| Open requests per pair | 1 |
| Cooldown after a decline or expiry, per pair (silent) | 30 days |
| Pending outgoing per member | at most 20 |
| Recommendations | 1 per connected introduction per direction |

There is also a per-member write limit like `rate()` (`server/business.js:33-39`), plus blocking and reports. **Owner decision:** whether 3 reports auto-hide a member's ability to send introductions until reviewed, as with Bulletin listings (`server/opportunity.js:261`).

### Who can see what

| Data | Who sees it |
|---|---|
| Introduction message | Recipient(s) and sender, plus the owner only if it is reported |
| Shared contacts | The other party only |
| Recommendation (pending or private) | Author and recipient |
| Recommendation (shown) | Members of that club |
| Blocks | The blocker |
| Bystanders | That an introduction exists between two other members is never visible to anyone else |

### Cross-club isolation

- An introduction can only be between members of the **same** club. Under club switching, keys are club-scoped and the module copy only sees its club's members.
- Proposing an introduction to a uid outside the club gives the same answer as an unknown business.
- The `t_club_switching` approach is extended to every new call.

### Other rules

- **Invite codes** are not part of any Exchange answer. A test checks that no Exchange payload contains an `invite:` code.
- **No real money:** no paid introductions, no boosts, no fees.
- **No rewards:** introductions and recommendations earn nothing.

---

## 6. Migration plan

- **No data migration.** The new fields are optional. Existing `biz:` profiles read as `offers: []`, `seeks: []`, `acceptIntros: false`. Nothing is switched on for existing members.
- **Telling existing members** (owner decision): reuse the existing "Introduce your business" home prompt mechanism (`bizpref:`, `server/business.js:200-204`) for a one-time, dismissible note. The note gets **no reward and has no deadline**.
- **Rollback:** old code ignores the new keys and fields. `bizSave` from old code rebuilds the profile object field by field (`server/business.js:152-166`), so an edit under old code would drop `offers`, `seeks` and `acceptIntros`. That is acceptable: the member opts in again. It is noted for the release plan.
- **Production data is never touched without approval.**
  - Tests use temporary `DATA_FILE`s and the staging-only fake businesses (`server/business.js:266-291`).
  - Turning the feature on is an owner-approved release behind the existing Exchange switch, plus a feature flag `B2B_INTROS=1` until approved.

---

## 7. Acceptance criteria

1. **Flag off:** every Exchange and Bulletin answer is identical to `4423a07` (parity test).
2. **Discovery:**
   - Filters by `offers`, `seeks`, `referrals` and "accepts introductions" return exactly the matching businesses, sorted alphabetically.
   - "Good fits" is visible only to its owner.
3. **Direct introduction:**
   - Request, decline and accept work, and expiry follows a fake clock.
   - Nothing is shared until the owner of the details shares it.
   - The decliner's identity and reason are never shown.
4. **Brokered introduction:**
   - Nothing is shared and no answer is shown until both accept.
   - The broker never receives contacts.
   - A single decline gives both parties and the broker the same "Not going ahead".
5. **Consent log:** an entry with a timestamp and notice version for every consent action. "Stop sharing" removes the details from the other party's next answer.
6. **Limits:**
   - Every limit in section 5 holds, including across a simulated restart.
   - A block is indistinguishable from introductions being switched off.
7. **Privacy:**
   - No answer to a third member contains another pair's introduction.
   - No payload ever contains contacts the owner did not share, an invite code, or any revenue, size or wealth field.
8. **Investment:** there is no investment option in any list, and the report reason exists.
9. **Removal:** removing a member or deleting a profile deletes all of their introductions, recommendations, blocks and limits.
10. **Club switching:** every new call from club A that refers to club B's ids gets the "not found" or "not available" answer. No B marker appears in A.
11. **Design:** directory, detail and My business at 320×568 and 390×844 use only existing `bz-*` styles and tokens. The Muse premium-UI checklist items still pass.

---

## 8. Milestones

| # | Milestone | Needs |
|---|---|---|
| M0 | Owner decisions (section 10) | Owner |
| M1 | Discovery: `offers`/`seeks`, filters, "Good fits" | Claude |
| M2 | Introductions: direct and brokered, consent log, limits, blocking, reports | Claude |
| M3 | Recommendations (if approved) | Claude |
| M4 | Client screens in the existing Exchange design, UI tests | Claude |
| M5 | Muse audit, including the design review against the premium-UI verdict | Muse |
| M6 | Staging with the fake demo businesses only; owner hands-on | Owner |
| M7 | Production release behind the Exchange switch and `B2B_INTROS` | Owner |

---

## 9. Test plan

### Existing tests to keep green

| Test | Notes |
|---|---|
| `npm test` | Especially `t_bizunit`, `t_business`, `t_opportunity`, `t_content`, `t_clubs` (Exchange closed gate), `t_invite_privacy`, `t_csp` |
| `test/ui/t_bizsearch.js`, `t_premium_ui.js`, `t_mobile_ux.js`, `t_stability.js` | |
| On the club-switching line | `t_club_switching`, `t_club_parity` |

### New tests

| Test | Covers |
|---|---|
| `test/t_b2b_unit.js` | Validation of `offers` and `seeks` (fixed ids only, no investment ids), content rules on message, note and recommendation, and the consent log shape |
| `test/t_b2b_intros.js` | Direct and brokered flows over HTTP with three or four members: accept, decline, expire (fake clock), withdraw, share, stop sharing, block, report, removal cleanup, Exchange-closed gate |
| `test/t_b2b_privacy.js` | For every new call and every member role, walks the answers and asserts no unshared contact, no other pair's introduction, no invite code and no wealth field appear. Includes the decline-anonymity check. |
| `test/t_b2b_limits.js` | Every rate limit and cooldown, persistence across a restart |
| `test/t_b2b_parity.js` | Flag off: byte-identical Exchange and Bulletin answers |
| `test/t_club_switching.js` (extended) | Cross-club refusal for every new call |
| `test/ui/t_b2b_ui.js` | Request, introduce, answer, share and recommendation flows, plus filter chips. 320×568 and 390×844. Screenshot comparison against the current Exchange pages. |

---

## 10. Owner decisions needed

1. Include recommendations in P1 (the proposed "mutual support"), or ship discovery and introductions first.
2. The fixed `offers`/`seeks` list (section 3.1), and confirming it holds no investment-related option.
3. Whether to add an automatic investment-phrase check. Counsel's wording.
4. Whether the Director sees aggregate introduction counts (no names), or nothing.
5. Push notifications for incoming introductions (existing Web Push, free), or the in-app badge only.
6. A one-time, dismissible note telling existing members about introductions.
7. Whether 3 reports pause a member's ability to send introductions until the owner reviews.

---

## Proposed separately (not approved)

- Private "saved businesses" list.
- Email notifications for introductions (would depend on P1-EMAIL-REGISTRATION and a paid provider).
- Discovering businesses or introducing members across clubs.
- Business events or meetups calendar.
- Anything about investment, fundraising or partnerships involving money: closed pending the Ontario legal review.
