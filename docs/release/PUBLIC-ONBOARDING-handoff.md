# Public onboarding: campaign invite link (handoff)

Branch `public-onboarding`, based on production `bf24ceb`. **Not deployed, not merged.** Nothing was done on Render or the production database.

## Facts verified in code (production `bf24ceb`, `server/index.js`)

Muse's reconciliation (`MUSE-CRITERIA-campaign-invite-2026-10-17.md`, `4c0cd22` on `r2-dev`) agrees with each line below: own PIN of 4 to 8 digits, no email, personal links single-use, owner group links 100 / 30 days, member links 10 / 7 days, auto-enrol on every redeem today.

- **PIN:** 4 to 8 digits (`validPin`, line 23). There is no shared password. Each person picks their own display name and PIN, and the link is the only shared thing.
- **Owner links** come in two kinds.
  - Personal: single use.
  - Group: at most 100 people for 30 days (`GROUP_MAX`, `GROUP_DAYS`, line 108). The owner's open group link is reused until it fills, expires or is cancelled (line 122).
- **Member links** are always group links: at most 10 people for 7 days (`MEMBER_MAX`, `MEMBER_DAYS`).
- **Auto-enrol:** every successful redeem, of every invite type, signs the new player up for the open tournament while it is registering or late registration is open (lines 75 to 76).
- **Email:** there is none anywhere. Identity is display name plus PIN.

## What this branch adds

A **public link** (internally a "campaign" invite) that the owner makes in Director for a bio or post.

| Behaviour | Detail |
|---|---|
| Who can create it | Owner only (`POST /api/campaign`, Bearer token). Members get "Only the club owner can do that." |
| Source label | 2 to 24 characters from `[a-z0-9-]`, for example `instagram-oct` |
| Cap | 1 to 2000 people |
| Expiry | 1 hour to 30 days (the Director form offers 1 h, 1 d, 3 d, 7 d, 14 d and 30 d) |
| Link format | `https://gta-poker.onrender.com/join/<code>`, the same `/join/` route as every existing invite. The code is 12 characters of base64url (72 random bits). |
| Tournament | **Never** signs the new player up. They land in the lobby and can press Join themselves. |
| Consent | The link opens a welcome and consent page before the name and PIN form (see below). |
| Cancel | The existing Cancel action (`revoke`), from the Public links card in Director |
| Stored as | `invite:<code>` = `{code, createdAt, by, multi:true, campaign:{source}, max, uses:[], expiresAt}`. These are additive fields on the existing invite shape. |
| New member record | It keeps `invitedBy` (the owner, as today) and adds `campaign: "<source>"` (additive). |

Existing personal, group and member links behave exactly as before, including auto-enrol. `t_campaign` checks all three.

### Consent page (campaign links only)

- **Content:** "Welcome to Blindrise", then eight cards:
  1. A private members' club.
  2. Free, no real money: no buy-in and no betting, and chips and points have no cash value.
  3. For adults 19 and over.
  4. What other members see: display name, picture if added, tournament results, and rating and play stats such as hands played.
  5. Membership is visible: other members can see that you are a member.
  6. Contact details stay private: contact details and business are visible only if you choose to publish or share them.
  7. Invitation-only: apart from this public link, the club is private and joined by invitation.
  8. Use a nickname, not your full name.
- **One checkbox:** 19+, club rules and prize terms (opens the existing terms modal), and understanding what members see. Continue is refused until it is ticked.
- **Join form:** the next form does not ask a second time. Its prompt suggests a nickname and says to remember the PIN, because there is no email reset and in-app browsers may not keep you signed in.
- **Closed link:** if the link is full, expired or cancelled, the page says "This link has closed" and offers Sign in.
- **Device hint:** if this phone already joined through a public link (a soft per-device `localStorage` hint), a note offers "sign in instead". It is a nudge, not a block.
- **Ordinary invites:** these still open the ordinary welcome with "Accept invitation".

### Instagram in-app browser

- **No popups:** the campaign flow opens no popups and calls no `window.open`. The UI test stubs `window.open` and asserts it was called 0 times.
- **Storage:** the `local` wrapper now keeps an in-memory copy, so a browser that refuses `localStorage` can still sign in for that visit. This is tested with `localStorage` throwing.
- **Note after signup:** when the user agent contains "Instagram", a note appears after signup. It shows the name and PIN to keep and tells the user to open the club in Safari or Chrome (••• then Open in external browser).

### Director report ("Public links" card)

Each campaign shows:

- source and status (Active, Full, Expired or Cancelled);
- `joined of cap`, and remaining;
- **played a hand**: how many of the joiners have played at least one hand. This comes from `pstat:<uid>.hands`, which already exists, so it is cheap.
- created date and end date;
- Copy and Cancel buttons while the link is active.

Re-sign-in counts were **not** added. That would need a new write on every login.

## C1–C7 self-check against Muse's criteria (`4c0cd22`)

Done by Claude after the first submission `7a78d7d`. Three gaps were found and fixed in the follow-up commit (C3, C5, C6). Line numbers refer to the head of this branch.

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| C1 | Campaign link = group link with a label; label stored on the invite, shown in Director, recorded on each member, never exposed to other members | PASS | `server/index.js` `campaign()` stores `campaign:{source}` on a `multi` invite (~line 99–110); `redeem()` writes `campaign: source` on the new user record (line 74). `clubView` member objects carry only id, name, role, createdAt, invitedBy, av, tier, color, score (line 249), so the tag never leaves the server except in the owner-only `campaigns` report. `t_campaign`: "no … campaign tag in the view", "members carry only …". |
| C2 | Campaign joins never auto-enrol; personal and group links keep today's behavior | PASS | `redeem()` line 77 `!inv.campaign && …`. `t_campaign`: "campaign joiner was NOT signed up"; ordinary group/personal/member links still join the open tournament (same file). Invite UI copy for ordinary group links is unchanged and still accurate. Mutation check documented below. |
| C3 | Join-time reveal notice: name and avatar visible; members see you are a member; contact details and business only if you choose; private and invitation-only beyond this campaign; 19+/rules agreement stays | **GAP → fixed** | First submission covered name, picture, results and stats, but did not say that membership is visible, that contact details and business stay private unless shared, or that the club is invitation-only beyond the link. Three items added to the consent list (`public/app.js` ~line 75–84). The 19+/rules checkbox is unchanged. `t_campaign_ui` now asserts all of them at 320, 375, 390 and 430. |
| C4 | Cap and expiry enforced in redeem; immediate revocation; global name uniqueness; existing `/api/redeem` failure limit still applies; generic refusals; exactly one join at cap−1 under a race | PASS | Cap/expiry/revoked in the unchanged `dead` check (line 64); refusal text unchanged and generic ("full, expired or was cancelled"). Revoke is the existing WS `revoke` (line 421), effective on the next redeem. Name check unchanged (line 69). Failure limit unchanged (lines 180, 186). Redeem is synchronous on Node's single thread, so the cap check and the use-append cannot interleave. `t_campaign`: 50 parallel joins at cap 10 give exactly 10; a cancelled link stops at once; expired link refused; **new:** 30 failed tries on a dead campaign link from one connection get the generic message naming no member or source, the 31st gets 429, another connection is unaffected. |
| C5 | Director sees joins, cap, expiry and the joined members per link; counts equal actual members | **GAP → fixed** | First submission showed counts but not who joined. `campaignReport()` now returns the joined members' names (owner-only, line 286) and the Director row has a "Who joined (N)" fold-out (`public/app.js` line 404). `t_campaign`: names listed per link, every count equals the list length, and the race list is exactly the 10 who got accounts. A member removed later drops out of the list while the joined count keeps them. |
| C6 | Join works in Instagram's in-app browser: no popups, no new-tab dependence, first-party storage only; join screen reminds to remember the PIN | **GAP → fixed** | No popup or new tab in the join flow (only the post-join WhatsApp/Telegram share links, unrelated). Storage access is wrapped, and joining works with storage blocked (`t_campaign_ui`). First submission reminded about the PIN only after joining (Instagram note, line 133); the join screen itself now says "Remember your PIN: there is no email reset, and in-app browsers such as Instagram's may not keep you signed in" (line 102), asserted at all four widths. |
| C7 | Scope fence: server changes only on invite/redeem, the member source field and the Director campaign UI; no engine, gameplay, schema, F1 or club changes | PASS | `git diff bf24ceb -- server` touches only `server/index.js`: `redeem`, new `campaign`/`campaignInfo`, invite filters, the `ip` argument to API handlers, the members' `invitedBy` mask for campaign joiners, and the owner-only report. No other server file, no store schema change (one additive invite field and one additive user field), no engine, F1 or club change. `package.json` only appends `t_campaign` to `npm test`. |

## Server changes, itemized (`server/index.js`, +49 / −11)

1. **`redeem(data, _, ip)`:**
   - Receives the caller's IP (from `cf-connecting-ip`, the same source as the existing limits).
   - For campaign links only, it refuses a 6th successful signup per IP per hour.
   - It skips the tournament auto-join (`!inv.campaign && …`).
   - It tags the user `campaign: <source>`.
   - It records the IP success.
   - It uses a clearer "tick the box" message when `agree` is missing on a campaign link.
2. **New `api.campaign({source,max,hours}, u)`:** owner only. It validates the inputs, stores the invite and broadcasts.
3. **New `api.campaignInfo({code})`:** public. It returns `{campaign:true, open}` for a campaign code and `{campaign:false}` for everything else, including unknown codes, so it reveals nothing about other invites.
4. **Constants and a new in-memory map:** `CAMPAIGN_MAX = 2000`, `CAMPAIGN_HOURS = 720`, and `CAMPAIGN_IP_HOUR = env CAMPAIGN_IP_HOUR || 5`. The `joinsByIp` map has the same pruning as `attempts`.
5. **Owner group-link reuse and member-link reuse** (`inviteCode`) and `myInvite` now skip campaign links. A campaign link can never be handed out as the owner's ordinary group link.
6. **HTTP dispatch:** it passes `ip` as a third argument (`fn(data, u, ip)`). Other API functions ignore it.
7. **`clubView`:**
   - For a member who joined by a campaign link, other members' `invitedBy` is sent as `null`.
   - The owner's `view.invites` leaves out campaign links; they appear in the new owner-only `view.campaigns` instead.
8. **New `campaignReport()`:** owner only, sent as `view.campaigns`. Each row also lists the names of the members who joined through it (C5).

There are no engine, gameplay, store, dependency or schema changes.

## Field audit: what a non-owner member receives

**`club` view** (`clubView`, broadcast on every change):

| Field | Contents |
|---|---|
| `me` | Own id, name, owner flag |
| `tourney` | Name, schedule, blinds, status, `regs` (user ids), payouts, fairness seal |
| `tables` | Table id, number, player count |
| `myTable` | Own table id |
| `members[]` | `id, name, role, createdAt, invitedBy, av` (gallery id or photo flag), `tier, color, score`. **`invitedBy` is null for others when the viewer joined by a campaign link.** |
| `history[]` (≤200) | Tournament id, name, dates, entrants, `results[{uid,name,place,pts,tie}]`, payouts, fairness seal and seed |
| `shop` | Reward catalogue, own balance and own claims only (`requests` is owner only) |
| other | `chatOff, muted` (own), `version, pushOn` (own), `membersInvite`, `invitedCount` (own), `myInvite` (own link counts, **no code**) |

**Other channels a member can reach:**

- **WS `profile`** for any member returns that member's rating, tier, hands, VPIP, PFR, clean %, good plays, patience, tilts, calm, big losses, results, name, avatar and join date. The consent page now says members see "rating and play stats".
- **WS `report` and `hands`** return only the caller's own data.
- **WS `fair`** returns a tournament fairness report.
- **`GET /avatar/<uid>`** serves a member's uploaded photo **without signing in**. User ids are visible to members, not to the public. This is pre-existing and was not changed; it is listed as an open question below.

**Never sent to non-owners** (checked by `t_campaign` on the raw JSON of a campaign member's view):

- PIN hashes and salts;
- sessions and tokens;
- invite codes (any kind);
- `seen` (IPs and device ids);
- households;
- the `campaign` tag;
- `invites`, `campaigns`, `conflicts`, `households` and `mutedIds`;
- the setup code.

`OWNER_CODE` never appears in any response.

## Limits

| Limit | Value | Notes |
|---|---|---|
| Cap per campaign | 1 to 2000 | Enforced inside synchronous `redeem`, so it cannot be overshot. With 50 parallel signups against a cap of 10, exactly 10 succeed (tested). |
| Expiry | 1 h to 30 d | |
| Successful campaign signups per IP | 5 per hour | `CAMPAIGN_IP_HOUR` env to change. It is in memory, so it resets on restart or deploy, and it only applies to campaign links. |
| Failed setup, redeem, login or reset | Unchanged | 30 per IP per 10 min, 10 per name per 10 min |
| Device hint | Soft | `localStorage` "already joined" note, which can be bypassed by design |

**Carrier NAT trade-off:** mobile carriers put many phones behind one IP (CGNAT). After an Instagram post, several real people on the same carrier IP could hit the 5-per-hour limit and see "Too many new accounts were made from this connection. Try again in an hour." If that shows up in support, raise `CAMPAIGN_IP_HOUR` (for example to 20) in Render env. That needs owner approval, because it is a production setting change.

**Duplicates:** names are unique (case-insensitive). One person can still make several accounts with different names, from different IPs. Without email or phone identity this cannot be fully prevented; the cap and the IP limit bound it.

## Tests

| Run | Result |
|---|---|
| `npm test` (now ends with `t_campaign`) | **pass**: evaluator all passed; rules 42/0; sim, server, coach, players, push, extra-time and security passed; **campaign 75 checks** (68 in `7a78d7d`, +7 for C4 and C5) |
| `test/ui/t_campaign_ui.js` (320, 375, 390, 430 + Instagram iPhone UA + Instagram with storage blocked) | **pass, 12 groups** (now also checks the C3 notice items, the C6 PIN reminder and the C5 who-joined list) |
| `test/ui/t_welcome.js` | **pass** |
| `test/ui/t_premium_ui.js` | **207 ok / 1 failed**. This is the known pre-existing item: at 320×568 the table's Chat and Lobby buttons are 32 px tall. That screen was not touched. |

A mutation check confirms the tests catch regressions: re-enabling auto-join for campaign links makes `t_campaign` fail on "campaign joiner was NOT signed up".

Screenshots are in `docs/evidence/public-onboarding/`:

- consent at 320, 375, 390 and 430;
- join and lobby at 320;
- the Instagram note;
- lobby with storage blocked;
- Director report and create form;
- the closed link.

## Owner steps after an approved deploy

1. Make sure no tournament is running, and get release authorization. The project rule is no production deploy during an active tournament or without authorization.
2. Sign in on `https://gta-poker.onrender.com` as the owner and open the **Director** tab.
3. In **Public links**, tap **Create public link**.
4. Fill in the form:
   - Source name: `instagram-oct` (or any 2 to 24 lowercase letters, numbers or dashes).
   - Cap: for example 200.
   - Ends after: for example 7 days.
5. Tap **Create link**, then **Copy**. The link looks like `https://gta-poker.onrender.com/join/AbC123xyz_-9`.
6. Paste it in the Instagram bio or story link sticker.
7. Follow sign-ups on the Public links card. Tap **Cancel** to stop the link at any time; people who already joined keep their accounts.

## Open questions (founder or counsel, not engineering)

1. **Legal:** offering free tournaments with prizes to the public, rather than invited friends, in Ontario and Canada. Does the prize and skill-question setup still hold for a public audience?
2. **Age:** 19+ is self-declared with a checkbox. Is that enough for a public Instagram audience, or is stronger age assurance needed?
3. **Privacy:** members see each other's play stats, and uploaded photos are fetchable by user id without signing in (pre-existing). Should either be restricted before going public? Is a privacy notice needed (PIPEDA)?
4. **Email:** the Instagram post must not promise email registration, because none exists.
5. **IP limit:** keep 5 per hour, or raise it for launch day (carrier NAT)?
6. **Removal:** removing a member stays a manual Director action. There is no public reporting or blocking tool yet.
