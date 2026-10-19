# P1 design: opt-in shared social games across clubs

Status: **design only. No code exists.** Depends on independent clubs (`P1-INDEPENDENT-CLUBS.md`, foundation on unreleased `club-switching-fix` `139a7c4`).

Scope: a free social tournament that players from two or more independent clubs can join, **only if each club's owner opts the club in and each player opts in for that game.** Everything else stays per club.

Constraints: no real money, no betting, no buy-ins or prizes of value, no rewards or points earned across clubs, no cross-club chat or messaging, no cross-club leaderboard or wealth ranking, no member lists or contact details shown across clubs, no invite codes shared.

## 1. Model

A **shared game** is a tournament run by the existing engine (`server/engine.js`) and table director logic, but owned by the deployment rather than one club:

- **Host club** proposes; **guest clubs** accept. The host is just the proposer; no club gets more access.
- **Players** register from inside their own club. Seats show the player's table name and avatar; a small club tag (club name) appears only if the player ticked "show my club name".
- **Results** go back to each club separately: club A's history shows A's players' finishing places plus "N players from other clubs". No other-club names.

## 2. Architecture

### 2.1 Data model (shared side; root store only, denied to `store.scoped()`)

| Key | Value |
|---|---|
| `sgame:<gid>` | `{ gid, name, hostClub, startAt, stack, levelMin, tableSize, status: proposed\|open\|running\|done\|cancelled, clubs: { <cid>: { state: invited\|accepted\|declined\|left, at, by } }, maxPlayers, createdAt }` |
| `sgame:<gid>:reg:<uid>` | `{ uid, cid (the club they came from), showClub: bool, consentAt, noticeV }` |
| `sgame:<gid>:t:*` | engine/table state, same shape as a club tournament's, keyed separately |
| per club (scoped) `sgamehist:<gid>` | `{ gid, name, endedAt, mine: [{ uid, place }], others: <count> }` |

No new key on `user:`. Nothing is written into another club's scoped data.

### 2.2 Endpoints and socket messages

HTTP (account-level; each call names the acting club through `x-club` and is checked for role in **that** club):

| Call | Who | Effect |
|---|---|---|
| `sgamePropose { name, startAt, stack, levelMin, tableSize, clubs: [cid] }` | owner of host club | Creates `proposed`; guest club ids must exist and be `active`. |
| `sgameAnswer { gid, accept }` | owner of an invited club | Accept/decline for that club only. |
| `sgameLeave { gid }` | owner of a participating club | Club withdraws before start; its registrations are dropped. |
| `sgameList {}` | member | Shared games **their current club** has accepted: name, time, number of clubs, number registered. No club names unless the owners agreed (decision 3). |
| `sgameRegister { gid, showClub }` / `sgameUnregister { gid }` | member of an accepted club | Requires ticking the consent notice; stores `consentAt` and notice version. |

Socket: existing `watch` / `act` / `table` messages, with `tid` prefixed `sg:<gid>:`. The server authorises `watch` only if the socket's club accepted that game, and `act` only for seated registrants. Chat (`chat`, `throw`) is **refused** at `sg:` tables.

### 2.3 Authorization and isolation boundaries

- Every shared-game call resolves the caller's club from `ws.ctx` / `x-club` and checks membership and role there; a club id in the body is only a target, checked against `sgame.clubs`.
- A club that has not accepted cannot see the game exists (`sgameList`, `watch` → not found).
- Table payloads at `sg:` tables carry only `uid`, table name, avatar version, stack, cards rules as today, and `club` only if `showClub`. No `invitedBy`, roles, tiers, points, Exchange or business data.
- `profile` socket requests for a player from another club → refused (same as today's non-member rule).
- Avatars: a shared-game seat grants avatar access for that game's duration only (ties to the `/avatar` rule in the clubs design).
- No rewards: shared games award no club points or tiers (decision 2). No cross-club leaderboard.
- The deployment owner has no extra in-app access to participants beyond what any player sees.

## 3. Phased plan

| Step | Ships | Gate |
|---|---|---|
| S0 | Independent clubs C0–C2 shipped; owner decisions below | owner |
| S1 | Table director refactor: run a tournament from a `sgame:` store namespace (no behaviour change for club tournaments; parity test) | — |
| S2 | `sgamePropose/Answer/Leave` + Director card for owners | — |
| S3 | `sgameList/Register/Unregister` with the consent notice; lobby card | — |
| S4 | `sg:` tables: watch/act authorisation, chat refused, `showClub`; results back to each club's history | — |
| S5 | Isolation fuzz + UI tests; Muse audit; staging with fake clubs | Muse / owner |
| S6 | Production behind `SHARED_GAMES=1` | owner GO |

## 4. Owner decisions needed

1. Approve shared games at all, after independent clubs are live.
2. Shared games award no club points or tiers (recommended yes).
3. Show participating club names to registrants (recommended: only after every owner agrees).
4. Who may propose: club owners (recommended) or the deployment owner only.
5. Player club tag default off (recommended), visible only if the player ticks it.
6. Maximum clubs per game (suggested 4) and players per game (suggested 54).

## 5. Acceptance tests

1. Flag off: all `sgame*` calls → 404; club tournament behaviour byte-identical (parity test).
2. Owner of A proposes with B; member of B calls `sgameList` before B accepts → empty; after B owner accepts → the game appears.
3. A member (not owner) of B calls `sgameAnswer` → 403; owner of C (not invited) → 404.
4. `sgameRegister` without the consent flag → 400; with it → `reg` record has `consentAt` and `noticeV`.
5. A socket in club C (not participating) sends `watch` for `sg:<gid>:1` → not found; a socket in A sees the table.
6. `chat` and `throw` at an `sg:` table → refused; nothing is broadcast.
7. Table payloads at an `sg:` table, walked for every hand of a simulated game, contain no field outside the allowed list in 2.3 and no `club` for players with `showClub: false`.
8. After the game: A's history lists only A's players with places and an `others` count; B's likewise; no B uid or name appears in A's scoped data (`store.scoped('A').keys('')` scan).
9. Points, tiers and rewards balances of every participant are unchanged by the game.
10. Club B leaves before start → B's registrations removed; B members no longer see the game.
11. Isolation fuzz (as in the clubs design) extended to `sgame*` with markers in both clubs: zero leaks.
12. Every shared-game table start shows the free-social-play notice (see `P1-SOCIAL-PLAY-NOTICE.md`).
13. UI 320×568, 390×844, 844×390: lobby card, consent sheet, club tag on seats does not overlap anything (same overlap checks as `t_table_layout`).
