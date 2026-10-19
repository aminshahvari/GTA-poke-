# P1 design: email registration (existing accounts preserved)

Status: **design only. No code exists for this feature.** Against production `main` `4423a07`; club-switching read from `club-switching-fix` `139a7c4`.

Scope: an optional, verified email as a second way to sign in and to recover a forgotten PIN, and email-based sign-up **through an invite**. Every existing account, session and membership keeps working unchanged. Email does not open the club to the public.

Out of scope (not approved): identity or business verification, email newsletters or notifications, messaging, inviting by email, passkeys.

## 1. Current state (`4423a07`)

- Identity: `user:<id>` = `{ id, name, salt, pin (scrypt), role, createdAt, agreedAt }`; `name:<lower>` → id (`server/index.js:24-32`). No email anywhere in the account system.
- Sign-in `POST /api/login {name, pin}` (`:92-96`); sign-up only via invite `POST /api/redeem` (`:73-91`); owner reset via `OWNER_CODE` (`:98-106`). A member who forgets the PIN has to ask the owner (`public/app.js:64`).
- Sessions: random token, `session:<sha256>` = `{ uid, at }`, no expiry; `revokeSessions(uid)` (`:33-43`).
- Rate limits are in memory (`:48-59`), so a deploy resets them.
- `membersView` builds payloads field by field (`:266-286`), but other code spreads whole `user:` records, and on club-switching `store.scoped().view()` copies every non-membership field into each club. **So an email must not be stored on `user:`.**

## 2. Architecture

### 2.1 Data model (additive keys only)

| Key | Value | Notes |
|---|---|---|
| `cred:<uid>` | `{ email, emailNorm, verifiedAt, changedAt }` | Written only after the code is confirmed. Never on `user:`. |
| `email:<hmac(emailNorm)>` | `uid` | Uniqueness index. HMAC with `EMAIL_HMAC_KEY` so key names hold no addresses. |
| `otp:<sha256(challengeId)>` | `{ purpose: add\|signin\|reset\|register, emailNorm, uid?, codeHash, salt, expiresAt, tries, used, inviteCode? }` | 6-digit code, stored as scrypt only. Swept 24 h after expiry. |
| `emailrate:<hmac>` / `emailrate:ip:<ip>` / `emailrate:all` | send and failure timestamps; daily total | **Persisted**, so limits survive a deploy (pattern: `opplimit:` in `server/opportunity.js:44-50`). |
| `session:<hash>` | adds optional `via: 'email'\|'pin'` | Old sessions without it keep working. |

### 2.2 HTTP endpoints (`POST /api/*`; all 404 unless `EMAIL_AUTH=1` **and** a mail transport is configured)

| Name | Caller | In → out | Rule |
|---|---|---|---|
| `emailAddStart` | signed in | `{email, pin}` → `{challenge}` | Current PIN required, so a stolen session cannot attach an attacker's email. |
| `emailAddConfirm` | signed in | `{challenge, code}` → `{ok, emailMasked}` | Old address notified; other sessions revoked. |
| `emailRemove` | signed in | `{pin}` → `{ok}` | Notice to the removed address. |
| `emailSignInStart` / `pinResetStart` | anyone | `{email}` → `{challenge}` | Same body, status and timing whether the address is known or not (decoy challenge, async send). |
| `emailSignIn` | anyone | `{challenge, code}` → `{token}` | 5 tries per challenge. |
| `pinReset` | anyone | `{challenge, code, pin}` → `{token, name}` | Revokes all sessions; notice mailed. **Refused for the owner role** (owner keeps `OWNER_CODE` only). |
| `emailRegisterStart` | invite holder | `{code, email}` → `{challenge}` | Checks the invite without using it up. Known address: mail says "you already have an account"; on-screen answer identical. |
| `emailRegister` | invite holder | `{challenge, code, name, pin, agree}` → `{token}` | Runs the existing `redeem` path (name rules, invite use, auto-enrol, `invitedBy`) then writes `cred:` + `email:` in the same synchronous step. |
| `account` | signed in | `{}` → `{emailMasked, verifiedAt}` | Own data only. |

WebSocket: no new message types. `clubView.me` gains one boolean `hasEmail` (own payload only) for the "add an email" nudge.

Mail: `server/mail.js` with `send(to, template, vars)`, queued and asynchronous. `MAIL_TRANSPORT=log` (in-memory outbox, tests) or a provider (**owner approval, possibly paid**). Transactional templates only.

### 2.3 Authorization and club-isolation boundaries

- Only the root store in `server/index.js` reads `cred:`, `email:`, `otp:` and `emailrate:`. With club switching, `store.scoped(id)` **denies** these prefixes (returns `undefined`, ignores writes); a test enforces it.
- No member payload, socket message, log line or Exchange answer ever contains an address, a code or an invite code. The owner sees at most a count ("31 of 40 have an email"), never addresses.
- Email registration through club B's invite creates a B-only (`noMain`) account, exactly like the branch `redeem`.
- Member removal also deletes `cred:`, the `email:` entry and open `otp:` records.
- Limits (persisted): 3 sends per address per hour and 10 per day; 10 per IP per hour; 10 wrong codes per address per hour, after which email sign-in pauses for that address (name + PIN unaffected, so a stranger cannot lock anyone out); `EMAIL_DAY_MAX` deployment-wide (suggested 200).

## 3. Phased plan (each step shippable flag-off)

| Step | Ships | Size |
|---|---|---|
| E0 | Owner decisions (section 4); provider and sending domain approved | owner |
| E1 | `server/mail.js` with `log` transport only; `EMAIL_AUTH` flag; parity test proving flag-off answers are byte-identical to `4423a07` | S |
| E2 | Data model + `emailAdd*`, `emailRemove`, `account`; persisted limits | M |
| E3 | `emailSignIn*`, `pinReset*` with anti-enumeration | M |
| E4 | `emailRegister*` through invites | S |
| E5 | Client: Email tab on sign-in, "Join with email", account sheet, dismissible nudge | M |
| E6 | Muse audit on branch; staging with the provider's test mode and fake accounts | Muse / owner |
| E7 | Production enable (secrets set by the owner on Render) | owner |

No data migration: an account without `cred:` simply has no email. Rollback = unset `EMAIL_AUTH`; email accounts still have a name and PIN (if decision 2 stays "PIN required").

## 4. Owner decisions needed

1. Approve an email provider (new external service, may cost money) — none chosen.
2. Approve a sending domain with SPF/DKIM/DMARC (about CAD 15–25/yr) — or decline the feature.
3. Keep a PIN on email accounts (recommended) or allow passwordless.
4. Confirm the email code counts as a sign-in credential, not a "verification system".
5. Exclude the owner role from email PIN reset (recommended yes).
6. Owner sees a count only (recommended) or the addresses.
7. Daily send cap `EMAIL_DAY_MAX` (suggested 200).
8. Privacy-notice wording for collecting emails (PIPEDA; counsel optional).

## 5. Acceptance tests

1. `EMAIL_AUTH` unset: every `/api/*` answer and socket message is byte-identical to `4423a07` in `test/t_email_parity.js`; all new names return 404.
2. Existing account `Test Player 07`: add email (PIN + code from the `log` outbox), sign out, sign in with email + code → 200 with a token; name + PIN sign-in still → 200.
3. Add email with a wrong PIN → 400 and no mail in the outbox.
4. Register with a valid invite + email + code + name + PIN → account exists, invite use count +1, auto-enrolled exactly as `redeem`; same call without an invite → no account created.
5. PIN reset by email → all previous tokens get 401 / socket close 4003; a notice is in the outbox; reset for the owner role → refused and no code sent.
6. For a known and an unknown address, `emailSignInStart`, `pinResetStart` and `emailRegisterStart` return byte-identical bodies and status; median latency differs by < 20 ms over 50 calls.
7. A code fails after 10 min (fake clock), after 5 wrong tries, and on second use.
8. Rate limits still block after a simulated server restart on the same data file.
9. Walking every socket message type and `/api/*` answer for two members and the owner finds no address, no code and no invite code; log output contains none either.
10. Removing a member deletes `cred:<uid>`, its `email:` entry and its `otp:` records.
11. With `CLUB_SWITCHING=1`: `store.scoped('cX').get('cred:<uid>')` and `.get('email:…')` return `undefined`; email registration through a club-X invite creates a `noMain` account.
12. With the daily cap reached: no mail is queued and the answer tells the user to use name + PIN.
13. UI (`test/ui/t_email_ui.js`, 320×568 and 390×844): Email tab, code field with `autocomplete="one-time-code"`, join with email, account sheet; no horizontal scroll.
14. Full `npm test` green with the flag off and on.
