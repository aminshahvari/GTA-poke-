# P1 design: independent clubs with shared user identities

Status: **design only for everything in sections 2–5.** The foundation exists only on the unreleased branch `club-switching-fix` (`139a7c4`: code `06f8662` + membership-merge fix `553236b` + merge of `4423a07`), behind `CLUB_SWITCHING=1` / `STAGING=1`, **off in production**. Muse: CONDITIONAL PASS on `06f8662` for dev/staging; delta re-audit of `139a7c4` still open.

Scope: one identity (name + PIN, later email) across several clubs; per-club memberships, roles, settings and data; controlled club creation, management, switching and leaving.

## 1. What already exists on `club-switching-fix` (not in production)

| Capability | Where (branch) |
|---|---|
| Shared identity keys `user:`, `name:`, `session:`, `avatar:`, `push:`, `clubdef:` | `server/store.js` `SHARED` |
| Scoped store: club keys under `club:<id>:`; a club sees only its members and writes only membership fields (`role, invitedBy, muted, household, removed, joinedAt`), merged, never replaced | `server/store.js` `scoped()`, fix at `:130-135` |
| Per-club copies of `club`, `rewards`, `business`, `opportunity`, `players`, `fair` | `server/clubs.js` `build()` |
| Club creation by the deployment owner with `OWNER_CODE`, cap 50 | `server/index.js`, `server/clubs.js` `create()` |
| `x-club` HTTP header and `hello.club` socket field, accepted only for members (403 otherwise) | `server/index.js` `ctxFor` |
| Removal from a non-main club ends only that membership (close 4004) | `server/index.js` |
| Club picker UI; tests `t_club_switching` (50), `t_club_store` (16), `t_club_parity` (13), `t_club_switch_ui` (19) | |

Open blockers carried from the remediation handoff: (a) Muse delta re-audit; (b) **rollback makes B-only (`noMain`) accounts full main members** under both flag removal and `4423a07` — owner decision; (c) `STAGING=1` turns the feature on.

## 2. Architecture of the additions

### 2.1 Data model (additive)

| Key | Value | Scope |
|---|---|---|
| `clubdef:<id>` | existing + `status: active\|archived`, `archivedAt`, `renamedAt` | shared |
| `clubreq:<id>` | `{ by, name, purpose (≤140, content-checked), status: open\|approved\|declined, decidedAt }` | shared; root store only (denied to scoped stores) |
| membership `role` | adds `admin` (main: `user.role`; others: `user.clubs[id].role`). Old code reads `admin` as member. | existing field |
| `xfer` (scoped) | `{ from, to, expiresAt }` ownership transfer, 7 days | per club |
| `audit:<ts>-<rand>` (scoped) | `{ at, by, action, target? }`, last 500 | per club, owner-readable |

### 2.2 Endpoints and socket messages

HTTP (account-level, in `ACCOUNT_API`): `clubRequest {name, purpose}` (any member; 1 open, 3 per 30 days); `clubRequests {}` and `clubDecide {id, approve, code}` (deployment owner + `OWNER_CODE`); `clubLeave {}` (uses `x-club`).

Socket (resolved in `ws.ctx`, never from a client-sent club id): `clubRename {name}`, `setRole {uid, role}`, `transferStart {uid}` / `transferAccept` / `transferCancel`, `archive {confirm}`, `audit {}`.

`clubView` adds `me.role`, `perms` (display only; the server checks every action) and `pendingTransfer` (only the two parties).

### 2.3 Authorization and isolation boundaries

- One permission table `server/roles.js` (`can(u, perm)`), replacing `isOwner` checks. Owner: everything. Admin: run tournaments, moderate Exchange, mute chat, manage invite links, remove members (not admins). Member: play, Exchange, invite if enabled. Only the owner: rewards, settings, roles, transfer, archive, see `invitedBy`.
- The deployment owner sees other clubs only as name, status, member count, created date. No in-app access to another club's members, Exchange, chat or results without membership.
- Cross-club: nothing about membership in club A is visible in club B; `clubs` list goes only to the account itself; push notices go only to that club's members; `/avatar/<id>` restricted to people sharing a club (decision 5).
- No cross-club leaderboard; nothing ranks members by money or business size; invite counts stay informational with no reward.
- Joining with an existing account: **sign in, then accept the invite** (`joinClub`); the name + PIN form on another club's join page is removed (closes the PIN-oracle concern).

## 3. Phased plan

| Step | Ships | Gate |
|---|---|---|
| C0 | Muse delta re-audit of `139a7c4`; fixes on `club-switching-fix` | Muse |
| C1 | **Production `noMain` guard** (old code hides `noMain` accounts and refuses their main sign-in), its own release before any real second-club use | owner GO |
| C2 | `club-switching-fix` to production flag-off (parity proven) | owner GO |
| C3 | `server/roles.js` + `can()`; admin role; permission-matrix test | — |
| C4 | Leave a club; sign-in-then-join; removal from main keeps other memberships | decisions 3–4 |
| C5 | Club requests + approval; rename; transfer; archive; audit | — |
| C6 | Client: picker (leave, request), Director club settings, activity; UI tests | — |
| C7 | Staging with fake accounts; production flag on | owner GO |

## 4. Owner decisions needed

1. `noMain` rollback: approve the production guard release (recommended) before any activation.
2. Ship the `admin` role in P1, or owner + member only.
3. Removal from main keeps accounts that belong to other clubs (recommended yes).
4. Replace name + PIN joining on other clubs' pages with sign-in-then-join (recommended yes).
5. Restrict `/avatar/<id>` to people who share a club (recommended yes).
6. Club creation by request + deployment-owner approval (recommended) vs deployment owner only.
7. Privacy-notice wording on what the deployment operator can technically access.

## 5. Acceptance tests

1. Flag off: `t_club_parity` passes with `PARITY_BASE=4423a074e946`; every new call returns 404.
2. `t_club_switching` 50/50 and `t_club_store` 16/16 with `CLUB_SWITCHING=1`.
3. With the guard (C1) on production code: a data file containing a `noMain` account → main roster excludes it and its name + PIN login is refused on main.
4. A member calls `clubRequest`; a second open request → 400; `clubDecide` without `OWNER_CODE` → 403; with it → requester is owner of the new club; a third party calling `clubRequests` → 403.
5. Permission matrix: a script calls every socket message type and `/api/*` name as owner, admin and member of club A; each allow/deny matches the table in 2.3 exactly.
6. Admin `setRole` → refused; admin removes another admin → refused; owner transfer to member M → nothing changes until M accepts; unaccepted transfer expires after 7 days (fake clock).
7. Archive club B → B hidden from members' pickers, tournaments stopped, invites revoked; unarchive restores; archiving main → refused.
8. `clubLeave` on B → B membership `removed: true`, main membership untouched, B sockets closed 4004; owner leaving without transfer → refused.
9. Isolation fuzz (`t_club_isolation_fuzz.js`): unique marker strings in every field of club B; every message and endpoint called from A with and without `x-club: B`; zero B markers in anything A receives.
10. Push: a club-B notice reaches only B members; title carries the club name only for multi-club accounts.
11. `/avatar/<id>` of a B-only user, fetched by an A-only user → 404 (if decision 5 approved).
12. Each owner/admin action writes exactly one `audit:` entry; non-owners calling `audit` → refused.
13. UI 320×568 and 390×844: picker, leave, request, Director club settings; no horizontal scroll.
