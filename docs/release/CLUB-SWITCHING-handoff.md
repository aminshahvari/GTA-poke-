# Club switching: handoff for Muse (development and staging only, NOT for production)

Claude, 2026-10-18, on the founder's "Final owner execution directive" (15:37 UTC), item 5: authorized-member club switching. Branch `club-switching`. It is cut from `r2-hotfix` (stabilization candidate code `8eee0a5`, head `1f61b65`) with `invite-privacy` `06e6e9c` merged (`61411c5`). It is **not** part of the stabilization release and must not be merged into it.

**Off in production by construction.** The feature is on only when the server runs with `CLUB_SWITCHING=1` or `STAGING=1`. Production has neither (Muse's environment check: `DATABASE_URL`, `NODE_VERSION`, `OWNER_CODE` only). With it off, every HTTP answer and socket message is identical to `61411c5`; `t_club_parity` proves this, see below. Note: the preview and staging services run `STAGING=1`, so club switching would be on there if this branch were put on them. Claude has not moved either service.

## 1. Current production behavior (read-only, from code at live `5c7ee11`)
Production itself could not be read from this session: the egress proxy refuses `gta-poker.onrender.com`. Muse previously verified that live serves `app.js` byte-identical to `5c7ee11`, and the SHA-256 prefix `820b846f17a7` matches `git show 5c7ee11:public/app.js`.

Live is strictly one club per deployment, with one flat key space:

| Data | Where it lives at `5c7ee11` |
|---|---|
| Accounts | `user:<id>` and `name:<lowercase name>` (`server/index.js:30`). The role (`owner` or `member`) is a field on the account itself (`server/index.js:30`, used by `isOwner`). |
| Sessions | `session:<sha256(token)>` (`server/index.js:33`) |
| The one owner | `owner` (`server/index.js:26`), created by `setup` with `OWNER_CODE` (`server/index.js:66`) |
| Invites | `invite:<code>`, created at `server/index.js:145` and read on redeem at `server/index.js:74`. Every invite joins the one club. |
| Settings | the single `settings` key, including the clubs switch (`server/index.js:126`) |
| Tournament and results | `tourney`, plus `history:<id>` (`server/club.js:34`, `:442`). One tournament at a time. |
| Exchange | `biz:<uid>` (`server/business.js:151`), plus `opp:` and `oppreq:` |
| Member list | every non-removed `user:` record, sent to every member (`server/index.js:269`) |

There is no club id anywhere: no membership records, and no per-club roles or settings.

## 2. Model
- **One identity.** Name, PIN, picture, sessions and push subscriptions belong to the account and are shared by every club. Signing in is unchanged.
- **Memberships.** The main club is today's club, and every existing account is a member of it. Any other club is recorded on the account as `user.clubs[<clubId>] = { role, joinedAt, invitedBy?, muted?, household?, removed? }`. An account created through another club's invite is marked `noMain: true`, so it is not in the main club.
- **Per-club data.** Everything that is not identity lives per club: the tournament, history, hands and stats, tables, chat, invites, settings including the Exchange switch, rewards and redemptions, Exchange (`biz:`, `opp:`, `oppreq:`, reports), fairness records and the club owner.
  - The main club keeps today's unprefixed keys.
  - Another club's keys are `club:<clubId>:<key>`.
  - The club list is `clubdef:<clubId>` = `{ id, name, createdAt, createdBy }`.
- **Enforced on the server: a scoped store and per-club module copies.**
  - `store.scoped(id)` (in `server/store.js`) is the only store a club's code sees.
    - It prefixes the club's keys.
    - It shows only that club's members, with that club's role and membership fields.
    - It lets a club write only its own membership fields.
    - It cannot claim or free a name, and never deletes an account.
  - `server/clubs.js` loads separate copies of `club.js`, `rewards.js`, `business.js`, `opportunity.js`, `players.js` and `fair.js` for each club, bound to that club's scoped store.
  - Nothing in one club's tournament director, Exchange or rewards can therefore reach another club's keys or members.
  - With the feature off, the main context is the normal modules plus the plain store, exactly as before.
- **Entry points check membership.**
  - The socket `hello` carries the club the app shows. The server serves that club only if the account belongs to it; otherwise it serves the account's first club.
  - HTTP calls carry `x-club`. A club the caller does not belong to gets **403**.
  - Business logos (`/bizlogo/`) get **404** in the same case.
  - Every later socket message works in the socket's own club. That covers tables, watch, chat, coach notes, fairness reports, profiles and Director actions.
- **Joining a second club** is only through that club's invite, in one of three ways:
  - a new account, which is then in that club only;
  - an existing name with its own PIN on the join page (wrong PINs count toward the per-name and per-IP limits);
  - opening the link while signed in (`joinClub`).
- **Creating a club** (choice documented): only the deployment owner (the main club's owner) can, signed in **and** with `OWNER_CODE`, which counts toward the recovery rate limits. The creator becomes the new club's owner. There is a cap of 50 clubs.
- **Removing members:**
  - Removing someone from a non-main club ends only that membership. Their account, name, PIN and other clubs stay, and only their screens in that club are closed (code 4004).
  - Removing someone from main is unchanged and closes the account, as today.
- **App:**
  - Someone in two or more clubs sees a gold club button beside their name. It opens "Your clubs"; picking one reloads the app in that club.
  - The organizer's Director gets a "Clubs on this server" card with "Open a new club".
  - Someone in one club sees nothing new. The Exchange design is untouched.

## 3. Data, migration and rollback
- **Migration:** none. Existing keys are read as they are. New keys are only `clubdef:*`, `club:<id>:*`, and the account fields `clubs` and `noMain`; all are additive.
- `t_club_parity` part 2 loads a data file written by the base release with the feature on, and checks:
  - every account is in the main club only;
  - every view equals the base release's view;
  - no key was renamed, removed or changed except the last-seen record that signing in always updates;
  - nothing club-prefixed was written.
- **Rollback:** unset the flag, or deploy without this branch.
  - Main-club data is untouched either way.
  - Other clubs' keys are ignored by the old code.
  - Accounts created only for another club (`noMain`) would appear in the main club under the old code. Under the old code they are plain members who can sign in, and their `clubs` field is ignored.
  - So rollback after real use of a second club needs a decision about those accounts. Before any production use, a cleanup script or an `if(u.noMain)` guard on the old line would be needed.

## 4. Test evidence (Claude's runs, Chromium only, real IBM Plex fonts)
| Test | Result |
|---|---|
| `npm test` (now includes `t_club_switching`) | exit 0 |
| `CLUB_SWITCHING=1 npm test` (whole suite with the feature on) | exit 0 |
| `test/t_club_switching.js` (new: isolation, joining, roles, removal, storage) | 50 ok / 0 failed; 3 clean repeat runs |
| `test/t_club_parity.js` (new: flag-off parity with `61411c5`, data compatibility with the flag on) | 13 ok / 0 failed |
| `test/t_club_parity.js` with `PARITY_BASE=8eee0a5` (control) | fails as expected. 3 member-view messages differ, and only in `invitedBy`: they are identical once `invitedBy` is ignored. That is the invite-privacy change, which shows the test detects differences. |
| `test/ui/t_club_switch_ui.js` (new: 390×844 and 320×568) | 19 ok / 0 failed |
| UI regression, all on `STAGING=1`, so on the feature-on code path with one club | see `docs/evidence/club-switching/ui-runs.txt` |
| `t_sim 3000` (engine and fairness, unchanged files) | see `docs/evidence/club-switching/ui-runs.txt` |

What `t_club_switching` covers, against two clubs on one server:
- Creating a club:
  - a wrong code, a member, or nobody signed in cannot create a club;
  - the organizer can.
- Joining:
  - a new account, an existing name with the wrong PIN (refused) and the right PIN, and a signed-in member with the link.
- Where each member lands:
  - a B-only member asking for main lands in B;
  - a main-only member asking for B lands in main.
- What each club shows:
  - each club's member list holds only its own members;
  - roles are per club.
- Refused across clubs:
  - a foreign or unknown club in `x-club` gets 403 for the API and the Exchange;
  - logos give 404;
  - one club's invite links never appear in or open the other club.
- The Exchange:
  - a B business is invisible from main (with a positive control in B).
- Tournaments, tables and chat:
  - separate tournaments;
  - table snapshots only ever carry the player's own club members, including when watching the other club's table id;
  - B chat reaches B (control) and never main.
- Other cross-club requests:
  - fairness reports and profiles across clubs are not served;
  - no organizer rights for B members;
  - a B member cannot remove main members.
- Removal:
  - removal from B closes only the B screen; the account, main membership and name stay.
- Storage:
  - the stored keys are checked: main unprefixed, B under `club:<id>:`, the B-only account marked `noMain`.

## 5. What Muse should verify
1. **Flag off.** Run `node test/t_club_parity.js` on your machine. Read the diff of `server/index.js` against `61411c5` and check that every new branch is gated by `clubs.ON()`, or is a pure refactor that passes `c` (the main context) instead of reading module globals.
2. **Isolation.** Read `store.scoped` (`server/store.js`) and `server/clubs.js`. Then try to reach another club's data through every socket message type and every `/api/*` name, with and without `x-club`, and through `/bizlogo/` and `/avatar/`.
3. **Joining.**
   - A name-and-PIN join of an existing account must not be a PIN oracle beyond today's "name is taken" behavior; it now says "If it is yours, enter your PIN".
   - Check the rate limits (per name and per IP).
4. **Club creation.** It needs the main organizer's session and `OWNER_CODE`.
5. **Compatibility.** Load a fresh copy of a real export locally with the feature on and compare the views. Do not use real data on any shared service.

## 6. Known limits
- Only the deployment owner can create clubs. Not built:
  - business self-service;
  - verification;
  - ownership transfer;
  - renaming, closing or deleting a club;
  - per-club branding.
- An account whose only club membership was removed is signed out when it connects. It has no club to show.
- Removing someone from the main club closes their whole account, as today, including their other clubs.
- Shared identity:
  - Pictures are shared by every club.
  - `/avatar/<id>` stays public by id, as today.
  - The chat rate limit is per account across clubs.
- Points, tiers, rewards and stats are per club.
- Tournament ids are time-based and can be equal in two clubs. Every lookup searches only the asker's club, so this exposes nothing.
- Per-club module copies use Node's `Module` compile API (`server/clubs.js`). That needs Node 18 or later, as `package.json` requires.
- Only Chromium was tested. WebKit and iPhone Safari were not.
- Production behavior could not be read live from this session (proxy). The live description comes from code at `5c7ee11` and Muse's earlier hash check.
- The join page doesn't yet explain up front that existing members can join with their own name and PIN; the error message says it. Copy for that needs the founder.
- Rollback after real second-club use needs a decision about `noMain` accounts (section 3).
