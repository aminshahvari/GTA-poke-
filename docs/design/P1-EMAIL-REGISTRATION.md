# P1 design: email registration and sign-in

Status: **design only.** No code is changed by this document. Written 2026-10-19 against production `main` = `4423a07`, with the unreleased `club-switching` branch (code `06f8662`, docs `1463d1c`) read where the two meet.

Approved scope: secure email-based account creation and sign-in that keeps every existing account, session and club membership working. Nothing else.

---

## 1. Current state (code at `4423a07`)

### Identity is a display name and a PIN

| What | Where |
|---|---|
| Account record `user:<id>` = `{ id, name, salt, pin (scrypt), role, createdAt, agreedAt }` | `server/index.js:27-32` |
| Name index `name:<lowercase name>` → id; names are 2–16 letters/digits, unique | `server/index.js:24`, `:30` |
| PIN is 4–8 digits, hashed with scrypt and a per-account salt | `server/index.js:22`, `:25` |
| Sign-in: `POST /api/login {name, pin}` | `server/index.js:92-96` |
| Owner setup and owner PIN reset are guarded by `OWNER_CODE` from the environment | `server/index.js:63-72`, `:98-106` |
| A member who forgets the PIN has no self-service path. The sign-in screen tells them to ask the owner | `public/app.js:64` |

There is **no email anywhere** in the account system. The only email field is the optional business contact email on a Business Club profile (`server/business.js:78-82`), which is a business detail and is not used for sign-in.

### Registration is invite-only

- `POST /api/redeem {code, name, pin, agree}` checks the invite, the name and the PIN, then creates the account (`server/index.js:73-91`).
- Invites live in `invite:<code>` (`server/index.js:134-148`). They are personal (single use), owner group links (100 people, 30 days) or member links (10 people, 7 days) (`:128-131`).
- A redeem signs the new player up for the open tournament (`server/index.js:86-87`).
- The client's join form is `authScreen('join')` (`public/app.js:57-105`). It is opened from `/join/<code>` (`server/index.js:208`, `public/app.js:61`).

### Sessions

- `newSession(uid)` makes a 24-byte random token and stores only `sha256(token)` in `session:<hash>` = `{ uid, at }` (`server/index.js:33`).
- **Sessions never expire.** `userByToken` checks only that the session exists and that the account is not removed (`server/index.js:34-38`).
- `revokeSessions(uid)` deletes every session of an account and closes its sockets with 4003 (`server/index.js:40-43`). It is used on owner PIN reset (`:104`) and on member removal (`:436`).
- The browser keeps the token in `localStorage` and sends it as `Authorization: Bearer` (`public/app.js:41`, `:91`). The socket `hello` sends it too (`server/index.js:380-386`).

### Rate limits that exist today

- All `/api/*` calls: 30 failures per IP per 10 minutes (`server/index.js:182`). Failures are counted only for `setup`, `redeem`, `login` and `resetOwner` (`:190`).
- Login: 10 failures per name per 10 minutes, whatever the IP header says (`server/index.js:55-56`, `:184-185`). Tested by `test/t_security.js`.
- Owner recovery: 5 per IP and 60 club-wide per 10 minutes (`server/index.js:57-59`, `:186`).
- All of these counters are **in memory** (`server/index.js:48-51`), so a restart or deploy clears them.

### What other members can see about an account

`membersView` sends every member `{ id, name, role, createdAt, invitedBy (owner only), av, tier, color, score }` (`server/index.js:266-286`). It is built field by field, so a new private field on the account would not leak through it. Other code does spread whole account records (`{ ...x }`) when it writes them back, for example `server/index.js:84`, `:238`, `:402`, `:436`.

### Club switching (branch `club-switching`, not in production)

- Identity (`user:`, `name:`, `session:`, `avatar:`, `push:`, `clubdef:`) is shared by every club. Everything else is per club (`server/store.js` `SHARED`, lines 109-112 on the branch).
- A club's code sees accounts through `store.scoped(id)`. For a non-main club, `view()` copies **every** account field except `clubs`, `noMain` and the membership fields (branch `server/store.js:116-122`). Any new field on `user:` would therefore reach every club's copy of `business.js`, `opportunity.js` and the rest.
- On the branch an existing account joins another club by typing its name and PIN on that club's join page (branch `server/index.js:78-84`). The branch handoff (section 5.3) flags this as a possible PIN oracle for Muse to check.

---

## 2. Approach

**Email is an optional, verified sign-in and recovery method added to the existing account. It does not replace the account.**

- Each account can have **at most one** verified email address. The display name stays the table name, and `user:<id>` stays the identity.
- Existing members keep name + PIN sign-in **unchanged**. Adding an email is opt-in, from their own account screen.
- New members can register with an email, **but still need an invite.** Email does not open the club to the public.
- Proof of email ownership is a **6-digit one-time code** typed into the app, not a clickable sign-in link.
  - A link opened from a mail app often opens a different browser, or the Instagram in-app browser, which has different storage. The session would then land in the wrong place. The `public-onboarding` handoff documents the same in-app-browser storage problem.
  - A code works inside the installed app (PWA) and inside in-app browsers.
  - The email also contains a link, but only to `/` (no token in it).
- With a verified email, a member can:
  1. **sign in with email + code**, as well as with name + PIN;
  2. **reset a forgotten PIN by email**, which today needs the owner.
- The feature sits behind a server flag `EMAIL_AUTH=1` **and** a configured mail transport. With either missing, every HTTP answer and socket message is the same as today. This is the parity approach `club-switching` used.

### Decision the owner makes: are PINs still required for email accounts?

| Option | What it means |
|---|---|
| **A (recommended):** email accounts still pick a PIN | Two ways in, so a mail outage never locks anyone out. Sign-in at the table stays fast. Least change to the app. |
| B: email-only accounts (passwordless) | Simpler signup. But every sign-in costs an email, the outage risk is higher, and name + PIN would need an "account has no PIN" state. |

The rest of this document assumes A. B would change only the registration form and add a `pin: null` state.

---

## 3. Architecture

### 3.1 Data model (additive kv keys; nothing existing is renamed or rewritten)

The email is **not** stored on `user:<id>`. It goes in a separate credential record, so:

- it cannot leak through code that spreads or copies account records;
- it cannot reach club-scoped modules through `store.scoped().view()` on the club-switching branch.

| Key | Value | Notes |
|---|---|---|
| `cred:<uid>` | `{ email, emailNorm, verifiedAt, addedAt, changedAt, notifyPrev? }` | One per account, and only once verified. `email` is the address as typed (needed to send to it). `emailNorm` is lower-cased and trimmed. Plus-addressing and dots are **not** folded: Gmail rules are not universal. |
| `email:<hmac(emailNorm)>` | `uid` | Uniqueness index. The key is an HMAC with a server secret, so a database export does not list addresses in key names. |
| `otp:<sha256(challengeId)>` | `{ purpose, emailNorm, uid?, codeHash, salt, createdAt, expiresAt, tries, used, inviteCode? , ipKey }` | `purpose` is `add`, `signin`, `reset` or `register`. The code is stored only as `scrypt(code, salt)`. The `challengeId` (16 random bytes) is the only handle the client gets. Each record expires and is swept. |
| `emailrate:<hmac(emailNorm)>` and `emailrate:ip:<ip>` | `{ sends: [ts], fails: [ts] }` | Send and failure counters kept in **storage**, unlike today's in-memory login counter, so a deploy does not reset them. This follows the `opplimit:` pattern (`server/opportunity.js:44-50`). |
| `emailrate:all` | `{ day, count }` | Deployment-wide daily send cap. This is the cost ceiling (section 4). |
| `session:<hash>` | `{ uid, at, via? }` | Additive `via: 'email'` or `'pin'`, for the "signed-in devices" list. Old sessions without `via` keep working. |

- **New secret:** `EMAIL_HMAC_KEY`, an environment variable. It is generated by the owner on Render and never committed. Without it the feature stays off.
- **Club switching:** add `cred:`, `email:`, `otp:` and `emailrate:` to the identity side of `store.scoped()`, and make them **unreadable through a scoped store**, not just shared. Only `server/index.js` (the root store) touches them, which a test enforces.
- **Removal:** member removal (`server/index.js:436`) also deletes `cred:<uid>`, the `email:` index entry and any open `otp:` for that account. A removed person's address can then be used again only through a new invite.

### 3.2 HTTP API (new `POST /api/*` names, all 404 when the flag is off)

| Name | Who | Input → output | Effect |
|---|---|---|---|
| `emailAddStart` | signed in | `{ email, pin }` → `{ challenge }` | Re-checks the **current PIN**, so a stolen session cannot attach the attacker's email and then reset the PIN. Sends the code to the new address. |
| `emailAddConfirm` | signed in | `{ challenge, code }` → `{ ok, emailMasked }` | Writes `cred:` and `email:`. If an address was already on file: notice to the old one, and every **other** session is revoked. |
| `emailRemove` | signed in | `{ pin }` → `{ ok }` | Removes the email. Notice to the removed address. |
| `emailSignInStart` | anyone | `{ email }` → `{ challenge }` | **Always** returns a challenge. If the address is unknown, a decoy challenge is stored and no mail is sent. |
| `emailSignIn` | anyone | `{ challenge, code }` → `{ token }` | Correct code: a new session. Wrong code: `tries+1`, and the challenge dies after 5. |
| `pinResetStart` | anyone | `{ email }` → `{ challenge }` | Same uniform answer as sign-in. |
| `pinReset` | anyone | `{ challenge, code, pin }` → `{ token, name }` | Sets the new PIN, `revokeSessions(uid)` (as the owner reset does at `:104`), mails a notice. |
| `emailRegisterStart` | anyone with an invite | `{ code (invite), email }` → `{ challenge }` | Checks the invite the way `redeem` does (`server/index.js:74-77`) **without using it up**. If the email already has an account, it mails "you already have an account, sign in instead" and returns the same uniform answer. |
| `emailRegister` | anyone with an invite | `{ challenge, code, name, pin, agree }` → `{ token }` | Runs the existing `redeem` path (name rules, invite use, auto-enrol, `invitedBy`), then writes `cred:` and `email:` in the same synchronous step. |
| `account` | signed in | `{}` → `{ emailMasked, verifiedAt, devices: n }` | Own data only. The address is masked (`s•••@g•••.com`) except on the account screen. |
| `signOutOthers` | signed in | `{}` → `{ ok }` | Revokes every session except the caller's. |

- Every new call goes through the existing IP limit (`server/index.js:182`) and is added to the failure-counting list (`:190`).
- Names follow the existing `api.name` dispatch (`server/index.js:180`). On club-switching they belong in `ACCOUNT_API` (branch `server/index.js:151`), so they run against the root account and not a club view.

**WebSocket:** no new message types. `clubView.me` gains one boolean, `hasEmail`, used for the "Add an email" nudge. The address itself is never in a socket payload, and no other member's payload changes.

### 3.3 Mail transport

The design adds a small module, `server/mail.js`, with one function: `send(to, template, vars)`. Delivery is queued and asynchronous, so the API answer never waits on the provider. That keeps the response time the same for known and unknown addresses (anti-enumeration).

| Transport | Used for |
|---|---|
| `MAIL_TRANSPORT=log` | Tests and local development. Writes to an in-memory outbox that tests read. Never logs codes in production. |
| `MAIL_TRANSPORT=<provider>` | Production. **Needs owner approval:** see section 4. |

**Templates.** Plain text with a minimal HTML copy. They are transactional only: the code, "your email was added", "your PIN was changed", "you already have an account", "your email was removed". There is no marketing and no newsletter. Every mail says it came from Blindrise and gives "if this wasn't you" guidance.

### 3.4 Client screens (existing visual system, no redesign)

| Screen | Change |
|---|---|
| Sign in (`authScreen('login')`, `public/app.js:57-105`) | A second tab, "Email". Enter email → "Check your email for a 6-digit code" → code field (`inputmode="numeric"`, `autocomplete="one-time-code"`). The current "Forgot your PIN?" link offers "Reset with email" first, and still mentions the owner path. |
| Join (`/join/<code>`) | "Join with email" next to the existing form. Email → code → the existing name / PIN / 19+ form. The existing form stays as it is. |
| Account sheet (from the profile) | "Email and sign-in": add, change or remove the email (PIN prompt), masked address, "Sign out other devices". |
| Home nudge | A dismissible one-line card for members without an email: "Add an email so you can get back in if you forget your PIN". No reward and no pressure copy. |

---

## 4. Dependencies (some need money or a new service)

| Item | Cost or new service? | Status |
|---|---|---|
| **Email-sending provider** | **New external service. Possibly paid.** | **Needs owner approval. None is chosen or signed up for.** |
| Domain for sending (SPF, DKIM, DMARC) | **Probably costs money** (about CAD 15–25 a year). Mail can't be authenticated from `onrender.com`. | Needs owner approval. |
| `EMAIL_HMAC_KEY` and provider API key as Render secrets | No cost | The owner sets them on Render. Claude has no Render access. |
| Privacy notice and terms wording for collecting emails | No cost. May need advice. | Owner, and counsel if wanted (PIPEDA). |

Provider options, for the owner to compare. Pricing changes, so check it at decision time; free tiers exist but have limits.

| Option | What to know |
|---|---|
| Amazon SES | Lowest cost per message. Needs an AWS account and a sandbox exit request. |
| Postmark | Built for transactional mail, with good delivery. Paid after a small trial. |
| Resend | Simple API. Has a free tier. |
| SendGrid (Twilio) or Mailgun | Widely used. Have free or low tiers. |
| Brevo | Free daily allowance. |
| SMTP through a personal mailbox (Gmail and the like) | **Not recommended:** sending limits, deliverability, and the owner's own account at risk. |

**Cost guard (built in, whatever the provider):** a deployment-wide daily send cap, `EMAIL_DAY_MAX` (suggested 200). Past the cap, the code paths answer "Email is busy right now, sign in with your name and PIN" and nothing is sent.

**CASL (Canada's anti-spam law):** the messages are transactional, sent at the member's request. No commercial messages are sent, and none are added by this work.

---

## 5. Security and privacy

### Account takeover

| Threat | Defence |
|---|---|
| Stolen session attaches an attacker's email, then resets the PIN | Adding or changing the email needs the **current PIN** as well as the session. Old address notified. |
| Email account compromised | Email can reset the PIN, which is the purpose of the feature. Every PIN reset revokes all sessions and mails a notice. Owner role changes are never possible by email. |
| **Owner account** | **Owner decision:** we recommend that email PIN reset be **disabled for the owner role**. Owner recovery stays `OWNER_CODE`-only (`server/index.js:98-106`), so a mailbox compromise cannot take the club. The owner may still sign in with email + code. |
| Code guessing | 6 digits, 10-minute expiry, 5 tries per challenge, at most 3 live challenges per address, codes hashed with scrypt. That gives at most about 5 / 10⁶ success per challenge, with challenges rate-limited (below). |
| Code reuse or replay | One use only (`used: true` before the session is made). The `challengeId` is tied to purpose and address. |
| Session fixation | A new token is made at every sign-in. Tokens stay hashed at rest (`server/index.js:33`). |

### Email enumeration

- `emailSignInStart`, `pinResetStart` and `emailRegisterStart` give the **same answer and status** whether or not the address is known. Mail is queued asynchronously, so timing does not depend on the provider either.
- Registration with a known address sends "you already have an account" **to that address** instead of an error on screen.
- Adding an address already used by another account: the answer is "We sent a code"; the code mail then says "this address is already used on another account" and cannot complete. The adding user learns nothing on screen.
- **Name-based enumeration** (`redeem` says "That name is taken") exists today and is unchanged by this work. It is listed in "Proposed separately".

### Rate limits

All of these are kept in storage, so they survive a deploy.

| Scope | Limit |
|---|---|
| Sends per address | 3 per hour, 10 per day |
| Sends per IP | 10 per hour. Uses `cf-connecting-ip`, as `clientIp` already does (`server/index.js:54`). |
| Wrong codes per address | 10 per hour, then sign-in by email is paused for that address for 1 hour. Mail is sent with no code. The account's name + PIN sign-in is not affected, so a stranger cannot lock a member out. |
| Deployment-wide | `EMAIL_DAY_MAX` sends per day (section 4) |
| Existing limits | Login per name, IP and recovery limits stay as they are. |

### Token and code expiry

| Item | Expiry |
|---|---|
| Codes | 10 minutes |
| `otp:` records | Swept 24 hours after expiry |
| Sessions | **No change to existing lifetimes** in P1, to keep existing sessions working. See "Proposed separately" for idle expiry. |

### Cross-club isolation (with club switching)

- Email belongs to the shared identity. It is never visible to any club's code or any club's members (`cred:` is denied to scoped stores).
- Joining another club still needs that club's invite. Email registration through club B's invite creates a B-only account (`noMain`), exactly like the branch's `redeem` (branch `server/index.js:90`).

### What other members and the owner can see

- **Members:** nothing new. No email, no "has email" flag.
- **Owner:** **Owner decision.** We recommend the Director sees only a count ("31 of 40 members have added an email") and never the addresses.
  - Showing addresses to the owner would make the club a holder of members' contact details. It would also need explicit wording in the privacy notice.

### Data handling

- Email is collected only for sign-in and recovery. A new consent line is shown at the point of entry: "We use your email only to send sign-in codes and security notices."
- Removing an email deletes it. Removing a member deletes it.
- Codes, addresses and tokens are never written to logs. `lastWriteError` already redacts URLs (`server/store.js:76`); the mail module redacts addresses the same way.
- Business Club contact emails (`biz:<uid>.email`) stay a **separate** field with their own visibility switch (`server/business.js:106-112`). Account email is never copied into a business profile, and the reverse doesn't happen either.

### Invite codes

- `emailRegisterStart` keeps the invite code only inside the server-side `otp:` record.
- The invite code is never put in an email, never returned in an answer, and never logged.

---

## 6. Migration plan for existing accounts

- **No data migration.** Existing `user:`, `name:` and `session:` keys are read as they are. An account without `cred:` simply has no email. All new keys are additive.
- Existing sessions stay valid, and existing name + PIN sign-in is unchanged.
- Existing members add an email themselves, if they want to, from the account sheet. There is **no bulk import, no backfill from Business Club emails, and no owner-entered addresses.**
- **Rollback:** unset `EMAIL_AUTH`, or deploy the previous commit.
  - Old code ignores `cred:`, `email:`, `otp:` and `emailrate:`.
  - Accounts created by email registration also have a name and PIN (Option A), so they keep working under old code.
  - Under Option B, rollback would leave PIN-less accounts unable to sign in. That is one more reason for A.
- **Production data is never touched without approval.**
  - All tests use temporary `DATA_FILE`s or the Postgres stub (`test/phase1/pgstub.js`).
  - Any compatibility check against real data uses a copy exported by the owner, loaded locally, never a shared service. This is the rule the club-switching handoff (section 5.5) also uses.
  - Turning the flag on in production is a separate, owner-approved release step, after Muse's audit.

---

## 7. Acceptance criteria

1. **Flag off:** every existing HTTP answer and socket message is identical to `4423a07`, by a parity test in the style of `t_club_parity`.
2. An existing account can add an email (PIN + code), sign out and sign back in with email + code, and still sign in with name + PIN.
3. A new member with a valid invite can register with email + code + name + PIN.
   - The invite is consumed once.
   - Auto-enrol behaves exactly as with `redeem`.
   - Without a valid invite there is no way to create an account.
4. A member with an email can reset a forgotten PIN.
   - All of their old sessions are revoked.
   - The address gets a notice.
   - The owner role cannot be reset by email (if the owner accepts the recommendation).
5. Enumeration:
   - For known and unknown addresses, `emailSignInStart`, `pinResetStart` and `emailRegisterStart` return byte-identical bodies and status codes.
   - The difference in median latency is under 20 ms in the test.
6. Codes:
   - Expire after 10 minutes.
   - Die after 5 wrong tries.
   - Cannot be reused.
   - Are never present in any API answer, socket message, log line or `club` payload.
7. Rate limits hold across a simulated restart, because they are persisted.
8. No other member's payload contains any email or email flag. The owner's payload contains at most the agreed count.
9. Removing a member deletes `cred:`, `email:` and `otp:` for that account.
10. With club switching on:
    - `store.scoped(x).get('cred:…')` and `get('email:…')` return nothing.
    - An email registration through a non-main club invite creates a `noMain` account.
11. The daily send cap stops sending, and the user is told to use name + PIN.

---

## 8. Milestones

| # | Milestone | Needs |
|---|---|---|
| M0 | Owner decisions (section 10). Provider and domain chosen and approved. | Owner |
| M1 | Server behind `EMAIL_AUTH`, `log` transport, data model, API, rate limits, parity test, new server tests | Claude |
| M2 | Client screens (sign-in tab, join with email, account sheet, nudge). UI tests at 320×568 and 390×844. | Claude |
| M3 | Muse audit of M1 and M2 on a branch | Muse |
| M4 | Staging with the provider's sandbox or test mode, on `STAGING=1` with fake accounts only | Owner sets the secrets on Render |
| M5 | Production enable: owner-approved release with the flag on and a rollback plan | Owner |

If club switching ships first, M1 also adds the `store.scoped` deny rule. If email ships first, that rule lands with club switching.

---

## 9. Test plan

### Existing tests that must stay green, with the flag off and with it on

| Test | Why it matters here |
|---|---|
| `npm test`, all of `package.json` `scripts.test` | Includes `t_server`, `t_security` (per-name login lockout), `t_invite_privacy`, `t_clubs`, `t_business`, `t_opportunity`, `t_csp` |
| `test/phase1/run.js` | Lease fencing and restart. The new keys must flush and fence like any others. |
| `test/ui/t_registration.js`, `t_welcome.js`, `t_stability.js` | Sign-in and join screens |
| On the club-switching line | `t_club_switching`, `t_club_parity` |
| On the public-onboarding line | `t_campaign` |

### New tests

| Test | Covers |
|---|---|
| `test/t_email_parity.js` | Flag off: identical answers and messages to `4423a07`. Flag on, no email used: identical member payloads. |
| `test/t_email_auth.js` | Add, confirm, sign-in, PIN reset, register, change, remove, removal cleanup, invite consumption, auto-enrol parity, owner-reset refusal. Uses the `log` transport outbox. |
| `test/t_email_abuse.js` | Expiry (fake clock), 5-try death, reuse, per-address, per-IP and global caps, persistence across restart, stranger cannot lock name + PIN sign-in |
| `test/t_email_enum.js` | Byte-identical bodies and status codes, latency spread |
| `test/t_email_leak.js` | Walks every socket message type and `/api/*` answer for two members and the owner, and asserts no address, code or invite code appears. Scans the log output too. |
| `test/ui/t_email_ui.js` | Sign-in tab, code entry with `one-time-code`, join with email, account sheet. 320×568 and 390×844, Chromium. WebKit if available. |

---

## 10. Owner decisions needed

1. **Email provider and sending domain.** Both are new external services and may cost money. Nothing has been chosen.
2. PIN still required for email accounts (Option A, recommended) or passwordless (Option B).
3. Owner role excluded from email PIN reset (recommended: yes).
4. What the owner sees: a count only (recommended), or the addresses.
5. Daily send cap value (suggested 200).
6. Privacy notice wording for email collection. Counsel if wanted.

---

## Proposed separately (not approved)

- Idle session expiry (for example 90 days) and a full "signed-in devices" list with per-device sign-out.
- Ending name-based enumeration on the join form ("That name is taken").
- Letting the owner send invites by email.
- Email notifications for tournaments (today's push notifications are enough). Any such mail would be commercial and fall under CASL consent rules.
- Passkeys or WebAuthn.
