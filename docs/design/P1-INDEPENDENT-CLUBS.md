# P1 design: independent clubs

Status: **design only, no code changed.** Written 2026-10-19 against production `main` = `4423a07` and the unreleased branch `club-switching`:

- code `06f8662`;
- docs `1463d1c`;
- handoff `docs/release/CLUB-SWITCHING-handoff.md` on that branch.

Muse's audit of that branch is still running.

**This design builds on `club-switching` and does not redesign it.** Everything in section 2 already exists there. Sections 3 onwards cover only what the approved capability still needs on top:

- controlled club creation;
- club management;
- per-club roles and permissions;
- leaving a club;
- the privacy gaps the handoff lists under "Known limits".

None of it starts until Muse's verdict on `06f8662` is in. Any defect Muse finds is fixed on `club-switching` first.

Approved scope: one user identity across several clubs, separate memberships, roles, permissions and private club data, and controlled club creation, management and switching.

---

## 1. Current state

### Production (`4423a07`): one club per deployment

| What | Where |
|---|---|
| Account carries its role (`owner` or `member`) | `server/index.js:29`; `isOwner` at `:45` |
| The one owner | `store.get('owner')`, `server/index.js:26`, set by `setup` at `:70` |
| One flat `settings` key (Exchange switch, chat, member invites) | `server/index.js:126`, `:132`, `:400-401` |
| Invites join the one club | `server/index.js:73-91`, `:134-148` |
| Every member receives every member's name, role, picture and tier | `server/index.js:266-286` |
| Removing a member closes the whole account | `server/index.js:436` |
| Exchange data keyed by user, no club | `server/business.js:5-10`; `server/opportunity.js:5-12` |

### Branch `club-switching` (`06f8662`): already built, behind `CLUB_SWITCHING=1` or `STAGING=1`

| Capability | Where on the branch |
|---|---|
| Flag. Production has neither variable, so the feature is off there | `server/clubs.js:11` |
| One shared identity: `user:`, `name:`, `session:`, `avatar:`, `push:`, `clubdef:` | `server/store.js:109-112` |
| Scoped store. Club keys are prefixed `club:<id>:`. A club sees only its own members, writes only its own membership fields, and cannot claim names or delete accounts | `server/store.js:113-151` |
| Separate module copies per club (`club`, `rewards`, `business`, `opportunity`, `players`, `fair`) | `server/clubs.js:15-34` |
| Memberships. Main unless `noMain`; others in `user.clubs[<id>] = { role, joinedAt, invitedBy?, muted?, household?, removed? }` | `server/clubs.js:49-56`, `:67-76` |
| Club creation: deployment owner only, with `OWNER_CODE`; 50-club cap | `server/index.js:106-116`; `server/clubs.js:57-65` |
| Joining through a club's invite: a new account, an existing name + PIN on the join page, or signed in (`joinClub`) | `server/index.js:72-104` |
| HTTP `x-club` header, served only if the caller is a member, otherwise 403 | `server/index.js:235-238`, `ctxFor` at `:363-368` |
| Socket `hello` carries the club. Every later message works in the socket's own club | `server/index.js:458-462` |
| Removal from a non-main club ends only that membership (socket close 4004) | `server/index.js:523`, `:529` |
| Club view adds `club`, `clubs` (own memberships only) and `canCreateClub` | `server/index.js:352-357` |
| Client: club button and "Your clubs" picker; Director card "Open a new club"; `x-club` on every call | `public/app.js:47`, `:166`, `:170`, `:467` |
| Tests | `test/t_club_switching.js` (50 checks), `test/t_club_parity.js` (flag-off parity and data compatibility), `test/ui/t_club_switch_ui.js` |

### Gaps the branch handoff lists itself (section 6), which this design closes

1. Only the deployment owner can create clubs. There is no request flow, no rename, no close, no ownership transfer.
2. Roles are only `owner` and `member`, with no delegated permissions.
3. Removing someone from **main** still closes their whole account, including their other clubs.
4. Rollback after real second-club use leaves `noMain` accounts showing up in main under old code.
5. `/avatar/<id>` is public by id, and pictures are shared by every club.
6. A member cannot leave a club themselves.
7. Joining with an existing name + PIN on another club's join page may be a PIN oracle (handoff section 5.3).

---

## 2. What is kept unchanged from `club-switching`

These are restated here only so the later sections can rely on them:

- one identity;
- membership records on the account;
- scoped store and module copies;
- main club keeps unprefixed keys;
- `x-club` and `hello.club` checks;
- per-club tournaments, history, rewards, Exchange, settings and invites;
- the club picker UI;
- the flag-off parity guarantee.

---

## 3. Architecture of the additions

### 3.1 Roles and permissions (per club)

Three roles per club. On main they are stored in `user.role`; on other clubs in `user.clubs[<id>].role`.

| Permission | owner | admin (new) | member |
|---|:-:|:-:|:-:|
| Play, chat, Exchange as a member, invite (if member invites are on) | ✓ | ✓ | ✓ |
| Run tournaments: create, edit, start, pause, cancel, kick a registrant | ✓ | ✓ | |
| Moderate the Exchange: hide or show, spotlight, reports queue | ✓ | ✓ | |
| Mute chat, household links, conflict view | ✓ | ✓ | |
| Make and revoke the club's invite links, and the member-invite switch | ✓ | ✓ | |
| See who invited whom | ✓ | | |
| Remove a member | ✓ | ✓ (members only, not admins) | |
| Rewards: add or remove a reward, mark a redemption | ✓ | | |
| Club settings: rename, Exchange switch, chat switch | ✓ | | |
| Grant or revoke admin | ✓ | | |
| Transfer ownership, archive the club | ✓ | | |

Notes on the matrix:

- **`admin` is optional.** Owner decision: P1 can ship with owner and member only. The code change is the same either way, because every check moves from `isOwner(u)` to `can(u, '<permission>')`.
- **Safe on old code.** `isOwner` checks `role === 'owner'` (`server/index.js:45`, `server/business.js:29`, `server/opportunity.js:31`), so an `admin` value on main reads as a plain member under old code. Rollback stays safe.
- **One permission table.** `server/roles.js` is the single source. It is shared by `server/index.js` and the module copies. It holds no data, so it is shared like `engine.js` and `content.js` are today (`server/clubs.js:5`).

### 3.2 Platform role: the deployment owner

The deployment owner is the main club's owner (`store.get('owner')`, as on the branch).

**In-app, the deployment owner can:**

- approve or decline club requests (3.3);
- archive any club in an emergency, after typing `OWNER_CODE`.

**The deployment owner gets no in-app access** to another club's members, Exchange, chat or results unless they are a member of that club. The Director's "Clubs on this server" card shows, per club, only:

- name;
- status;
- member count;
- created date.

This is the "private club data" requirement. The deployment owner still controls the server and database, and the privacy notice must say so plainly (owner decision on wording).

### 3.3 Controlled club creation

A request and approval flow replaces "deployment owner only".

1. **Request.** A signed-in member of any club opens "Request a new club" and gives:
   - a club name (the branch's rule: 2 to 40 characters, `server/index.js:110`);
   - one line on who it is for.

   At most one open request per account, and three per account per 30 days.
2. **Approval.** The deployment owner sees requests in Director and approves with `OWNER_CODE`. That keeps the branch's existing guard and its recovery rate limits.
   - On approval: `clubs.create(name, requesterId)`. The requester becomes the new club's owner.
   - The 50-club cap stays.
   - **Owner decision:** the deployment owner may instead grant a named member a standing "may open clubs" right, with a count limit.
3. **Decline.** The requester sees "Not approved", with an optional note.

There is no open or public creation, no payment and no tiers. The deployment owner can still open a club directly, as now.

### 3.4 Club management (by that club's owner)

| Action | Effect |
|---|---|
| **Rename** | Updates `clubdef:<id>.name`. Main keeps `settings.clubName` (branch `server/clubs.js:38`). Owner only, logged. |
| **Grant or revoke admin** | Writes the membership's `role`. Owner only, logged. The target sees the change on their next club update. |
| **Transfer ownership** | To an existing member of that club. The recipient must accept in-app within 7 days. The old owner becomes admin (or member, their choice). **Main club transfer is out of P1:** the main owner is the deployment owner, guarded by `OWNER_CODE` and tied to the server environment. |
| **Archive** | Requires typing the club name. Status becomes `archived`: tournaments are stopped, invites revoked, the Exchange hidden, and the club is read-only for its owner and hidden from members' pickers. Data is kept. Unarchive by the owner or the deployment owner. Main cannot be archived. |
| **Delete a club's data** | **Not in P1.** It needs a separate, explicit owner approval and an export first (see "Proposed separately"). |

### 3.5 Memberships

- **Leave a club (member).** "Leave this club" in the club picker or the profile. It does exactly what the branch's non-main removal does (`server/index.js:523`):
  - sets `removed: true` on that membership;
  - runs the club's `leave`, `business.removeUser` and `opportunity.removeUser` for that club only;
  - closes the 4004 sockets.

  An owner must transfer ownership or archive the club first.
- **Removal from main stops closing the whole account (owner decision).** If the account has another live membership, removal from main sets `noMain: true` and runs the main club's leave and Exchange cleanup. It keeps the name, PIN and other clubs. An account with no other club is closed exactly as today (`server/index.js:436`).
- **Joining with an existing account (owner decision, after Muse).** Replace the "type your existing name and PIN on the join page" path (branch `server/index.js:78-84`) with "Sign in, then accept the invite" (`joinClub`, `:96-104`). That removes the PIN-oracle concern entirely.
  - The join page says: "Already a Blindrise member? Sign in to join with your account."
  - If email sign-in (P1-EMAIL-REGISTRATION) has shipped, this works the same with email.

### 3.6 Data model additions (all additive)

| Key | Value | Scope |
|---|---|---|
| `clubdef:<id>` | Existing `{ id, name, createdAt, createdBy }`, plus `status: 'active' \| 'archived'`, `archivedAt`, `archivedBy`, `renamedAt` | Shared (club list) |
| `clubreq:<id>` | `{ id, by, name, purpose, createdAt, status: open\|approved\|declined, decidedAt, note, clubId? }` | Shared. Readable only by the requester and the deployment owner. Never through a scoped store. |
| `user.clubs[<id>].role` / `user.role` | Adds the value `admin` | Existing fields |
| `xfer` (scoped: `club:<id>:xfer` / `xfer` on main) | `{ from, to, createdAt, expiresAt }` | Per club |
| `audit:<ts>-<rand>` (scoped) | `{ at, by, action, target?, detail? }`: role changes, removals, rename, archive, transfer, invite revoke | Per club. Readable by that club's owner only. Last 500 kept. |

There is no migration. Main's data stays unprefixed, exactly as on the branch.

### 3.7 API and socket messages

New `POST /api/*` calls. They are account-level, so they go in `ACCOUNT_API` (branch `server/index.js:151`):

| Call | Who | Notes |
|---|---|---|
| `clubRequest { name, purpose }` | member of any club | One open request per account |
| `clubRequests {}` | deployment owner | Lists `clubreq:`. Anyone else gets 403. |
| `clubDecide { id, approve, note, code }` | deployment owner | `OWNER_CODE`, with the recovery limits |
| `clubLeave {}` | member | Uses `x-club` for the club being left |

Club-level socket messages. Each is checked by `can(u, perm)` in the socket's own club context (`ws.ctx`), never from a club id sent by the client:

| Message | Who |
|---|---|
| `clubRename { name }` | owner |
| `setRole { uid, role: 'admin' \| 'member' }` | owner |
| `transferStart { uid }`, `transferAccept {}`, `transferCancel {}` | owner; recipient |
| `archive { confirm }` | owner. Deployment owner via `clubArchive { id, code }` over HTTP. |
| `audit {}` | owner, returns the last 100 entries |

`clubView` additions:

- `me.role` (in addition to `me.owner`);
- `perms`: the list of permissions this member has in this club, so the client hides what it cannot do. The server still enforces every permission.
- `pendingTransfer`, shown only to the two people involved.

### 3.8 Client screens (current visual system and Exchange design unchanged)

| Screen | Change |
|---|---|
| Club picker ("Your clubs", branch `public/app.js:170`) | Adds "Leave this club" and "Request a new club". Archived clubs are shown only to their owner, marked "Archived". |
| Director | "Club settings" card (rename, Exchange and chat switches, admins, transfer, archive). "Activity" card (audit). For the deployment owner: a "Club requests" queue on the existing "Clubs on this server" card. Admins see the Director sections their permissions allow. |
| Join page | "Already a member? Sign in to join with your account" (3.5) |
| Profile | No list of the person's other clubs. Membership in one club is never shown in another. |

---

## 4. Dependencies

- **No new external service and no cost.** Everything runs in the existing Node server and kv store.
- Depends on Muse's verdict on `club-switching` `06f8662`, and on fixes to any defect found there.
- **Production safety shim (needed before any real second-club use).** A small release on the production line that makes old code ignore `noMain` accounts (the `if(u.noMain)` guard named in the branch handoff, section 3).
  - It has to be in production **before** club switching is turned on.
  - Then a later rollback cannot make B-only accounts appear in main.
  - It needs owner approval as its own release.
- If email registration ships, `cred:`, `email:` and `otp:` must be denied to scoped stores (P1-EMAIL-REGISTRATION, section 3.1).

---

## 5. Security and privacy

### Cross-club data isolation

- **The existing guarantees** (scoped store, module copies, `x-club`, `hello.club`, 403 and 404 rules) stay, and are re-proved by `t_club_switching`.
- **A new permission layer.** Every new action is resolved in the context of the socket or the `x-club` header, then checked with `can()`. No message carries a club id that the server trusts without a membership check.
- **Audit records are per club.** The deployment owner cannot read another club's audit unless they are its owner.
- **Club requests** are visible only to the requester and the deployment owner.

### What members can see

- **Inside a club:** the member list, results and Exchange of that club only, as on the branch.
- **Across clubs:** nothing.
  - Being in club A is never shown to club B, so `clubs` reaches only the account itself.
  - The `profile` socket message is answered only for members of the asker's club (branch behaviour, re-tested).
- **Pictures** are shared across clubs. That is acceptable only if a picture cannot be fetched by people outside the clubs that person is in.
  - **Proposal:** `/avatar/<id>` needs a signed-in session that shares at least one club with that account. Today it is public by id (`server/index.js:195-199`).
  - Images are loaded with `<img>`, so this needs either a short-lived signed URL or the fetch-with-token approach Business logos already use (`server/index.js:200-207`).
  - **Owner decision**, because it changes how pictures load.
- **Push notifications** stay per club: `notice(c, …)` notifies only that club's members. The title starts with the club name when the account is in more than one club, so a notification never says which other clubs someone is in.
- **No wealth ranking.** Points, tiers and leaderboards stay per club and poker-only. There is no cross-club leaderboard, and nothing ranks members by money, business size or any financial measure.

### Abuse and takeover

- **Club creation needs approval**, and the approval needs `OWNER_CODE`.
- **Ownership transfer needs the recipient's acceptance.** It cannot be forced on someone, and a stolen admin session cannot take a club.
- **An admin cannot** remove the owner or another admin, change roles, transfer or archive.
- **Invite codes:**
  - stay per club;
  - stay visible only to the people who made them, and to that club's owner and admins in Director;
  - are never shown across clubs (already tested on the branch).
- **No rewards for invites.** `invitedCount` stays an informational line (`server/index.js:149`, `:289`). Nothing new ties invites to points or prizes.

---

## 6. Migration plan

- **Existing production data needs no migration.** Every existing account is a member of main and only main (branch `t_club_parity` part 2 proves this on a base-release data file).
- **Order of releases.** All steps are owner-approved; Claude has no Render or production access.
  1. Production safety shim (`noMain` guard), released alone.
  2. `club-switching` after Muse passes it, still flag-off in production.
  3. The additions in this document, flag-off.
  4. Flag on in staging, with fake accounts only.
  5. Flag on in production, with the owner's approval.
- **Real data is never used in tests or on shared services.** Compatibility checks use a copy exported by the owner and loaded locally, as the branch handoff (section 5.5) already requires.
- **Rollback:**
  - Unset the flag. Main data is untouched; other clubs' keys are ignored.
  - With the shim in production, B-only accounts stay hidden from main.
  - `admin` roles read as members under old code.

---

## 7. Acceptance criteria

1. All existing `club-switching` checks pass: `t_club_switching` 50/50, `t_club_parity` and `t_club_switch_ui`, plus full `npm test` with the flag on and with it off.
2. **Flag off:** production behaviour is byte-identical to `4423a07`, with the parity test extended to the new calls (all 404).
3. **Creation:**
   - A member can request a club.
   - Only the deployment owner, with `OWNER_CODE`, can approve.
   - The requester becomes owner.
   - Request rate limits hold.
   - Nobody else can see requests.
4. **Roles:** every row of the permission matrix (3.1) is enforced on the server. A test walks every socket message type and `/api/*` call as owner, admin and member and checks allow or deny.
5. **Management:**
   - Rename, transfer (needs acceptance, expires after 7 days) and archive (read-only, hidden, reversible) behave as described.
   - Main cannot be archived or transferred in-app.
6. **Memberships:**
   - "Leave this club" ends only that membership.
   - Removal from main keeps an account that has other clubs (if approved).
   - The join page no longer accepts a name + PIN for an existing account (if approved).
7. **Isolation:** the fuzz test (section 9) finds no answer or message in club A that contains any id, name, key or text that exists only in club B.
8. **Privacy:**
   - No payload reveals another club's existence or membership to someone outside it.
   - Push notifications reach only the club's members.
   - `/avatar` follows the approved rule.
9. **Audit:** every owner or admin action in 3.1 and 3.4 writes one audit entry. Only that club's owner can read them.

---

## 8. Milestones

| # | Milestone | Needs |
|---|---|---|
| M0 | Muse verdict on `club-switching` `06f8662`, with defects fixed there | Muse |
| M1 | Production safety shim (`noMain` guard), its own release | Owner approval |
| M2 | Roles and permissions (`server/roles.js`, `can()`), admin role, permission tests | Claude |
| M3 | Leave a club, main-removal change, sign-in-then-join | Claude, after the owner's decisions |
| M4 | Club requests and approval; rename, transfer, archive; audit | Claude |
| M5 | Client screens, UI tests at 320×568 and 390×844 | Claude |
| M6 | Muse audit; staging with fake accounts | Muse, owner |
| M7 | Production enable | Owner |

---

## 9. Test plan

### Existing tests to keep green

| Test | Notes |
|---|---|
| `npm test` | With `CLUB_SWITCHING` unset and with `CLUB_SWITCHING=1` |
| `test/t_club_switching.js`, `test/t_club_parity.js`, `test/ui/t_club_switch_ui.js` | The branch's own tests |
| `test/t_clubs.js` | Exchange switch, now per club |
| `test/t_invite_privacy.js` | `invitedBy` stays owner-only, and admins do not get it |
| `test/t_business.js`, `test/t_opportunity.js` | |
| `test/phase1/run.js` | Lease fencing with the new keys |
| `test/ui/t_stability.js`, `test/ui/t_premium_ui.js` | Exchange and premium design unchanged |

### New tests

| Test | Covers |
|---|---|
| `test/t_club_roles.js` | The permission matrix (owner, admin, member) over every socket message type and `/api/*` call |
| `test/t_club_admin.js` | Request and approve or decline, rename, transfer (accept, expiry, cancel), archive and unarchive, leave, main-removal with other clubs, audit entries |
| `test/t_club_isolation_fuzz.js` | Two clubs with distinct marker strings in every field (names, business text, chat, tournament names, invite codes). Every message type and every `/api/*` name is called from A with and without `x-club: B`, and A's watch is pointed at B's table ids. Fails if any B marker appears in anything A receives. |
| `test/t_club_push.js` | Notices go only to the club's members; titles carry the club name when the account is in two or more clubs |
| `test/ui/t_club_admin_ui.js` | Director club settings, request form, leave, archived state. 320×568 and 390×844. |

---

## 10. Owner decisions needed

1. Include the `admin` role in P1, or ship owner and member only.
2. Club creation: requests approved by the deployment owner (recommended), and whether to also allow standing "may open clubs" grants.
3. Removal from main keeps accounts that belong to other clubs (recommended), instead of closing them.
4. Replace name + PIN joining on another club's page with sign-in-then-join (recommended, pending Muse).
5. Restrict `/avatar/<id>` to people who share a club (recommended), which changes how pictures load.
6. Privacy notice wording on what the deployment owner can technically access.
7. Approve the production safety shim as its own release, before club switching is turned on anywhere real.

---

## Proposed separately (not approved)

- Per-club branding (colours, logo).
- Deleting a club's data, with a member-facing export.
- Main-club ownership transfer.
- Cross-club tournaments or shared leaderboards.
- Club discovery or a public directory of clubs.
- Business self-service club creation without approval.
