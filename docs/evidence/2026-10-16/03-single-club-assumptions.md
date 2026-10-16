# 03. Single-club assumptions S1–S24, re-verified at `a3c67e9`

Source of the list: `blindrise-network-architecture.md` section 2 (in the shared reports folder). That report cited staging `1b374d0` and an **uncommitted** `oc1` working-tree snapshot. Every line number below was re-read in this worktree at staging tip **`a3c67e9`**.

Labels: **IMPLEMENTED** = the assumption is in the code as described (verified by reading the cited lines at `a3c67e9`). **PROPOSED** = the migration change (design only, nothing built). **NOT VERIFIED** = could not be confirmed.

## What moved between `1b374d0` and `a3c67e9`

`git diff --stat 1b374d0 a3c67e9 -- server public/app.js` shows only these files changed: `server/index.js` (+23/-9: Opportunity wiring, CSP, noindex for `/api/opp*`, removal hook, vendor cache header, staging seed), `server/opportunity.js` (new, 320 lines), `public/app.js` (+8: Home card and tab count). `server/club.js`, `server/store.js`, `server/business.js`, `server/players.js`, `server/rewards.js`, `server/fair.js` are byte-identical, so their line numbers did not move.

Line shifts in `server/index.js` from `1b374d0` to `a3c67e9`: lines 1–14 unchanged; 15–109 **+1**; 110–137 **+3**; 138–157 **+4**; after 191 **+7**. In `public/app.js`: unchanged up to 166, **+2** from 167, **+6** from 179. `oc1` citations now point at the committed `server/opportunity.js` (from `ef77d53`, unchanged by `7e0cce4`).

Column "Change since report": **same** = same lines; **moved** = same code, new line numbers; **changed** = the code itself changed; **new code** = was an `oc1` snapshot, now committed.

## The 24 assumptions

| # | Assumption | Where at `a3c67e9` (file:line) | Report cited | Change since report | Risk with many clubs | Required migration change (PROPOSED) |
|---|---|---|---|---|---|---|
| S1 | One owner per deployment (`owner` key) | `server/index.js:26` (`owner()`), `:56` (setup refuses a 2nd owner), `:61` (`store.set('owner', ...)`) | index.js:25, 55, 60 | moved (+1) | High: each club needs its own owner | `club:<cid>.ownerUid` plus memberships |
| S2 | Role stored on the global identity | `server/index.js:29` (`createUser(..., role)`), `:39` (`isOwner`); `server/business.js:28`; `server/opportunity.js:30` (`isOwner`), `:32` (`ownerOnly` for the reports queue and moderation) | index.js:28, 38; business.js:28; oc1 opportunity.js:30 | moved (+1); opportunity now committed, adds `:32` | High: Owner in club A would moderate club B's listings and businesses | Role on `mem:<cid>:<uid>.role`; every `ownerOnly` check takes the club id |
| S3 | `removed` stored on the global identity | `server/index.js:37` (`userByToken`), `:408` (`remove` sets `removed: true`, deletes sessions, calls `business.removeUser` and `opportunity.removeUser`); `server/business.js:29, 95`; `server/opportunity.js:31, 70`; `server/club.js:111, 410` | index.js:36, 401; business.js:95; club.js:111, 410 | moved (+1, +7); **changed**: `:408` now also deletes the member's Opportunity data | High: removal from one club locks the person out of all, and deletes their listings everywhere | Global `suspended` (platform) plus per-club `mem.status`; removal cleanup scoped per club |
| S4 | Name is globally unique and is the display name | `server/index.js:30` (`name:<lower>` key), `:71` (redeem: "That name is taken"), `:84` (login by name) | index.js:29, 70 | moved (+1) | Medium: collisions; the name enumerates accounts | Global login handle + optional per-club display name |
| S5 | One tournament | `server/club.js:34-35` (`tourney` key), `:149` and `:165-172` (`live` key) | club.js:34-35, 149, 165-172 | same | High | `c:<cid>:tourney`, `c:<cid>:live` |
| S6 | Tournament runtime is a module singleton | `server/club.js:26-30` (`hooks`, `tables`, `waiters`, `running`, `clockTimer`, `linker`), `:279` (`hfh`), `:452-461` (one scheduler `setInterval`) | club.js:26-29, 279, 452-461 | same | High | `createClubRuntime(cid)` factory |
| S7 | Results, leaderboard and points read all `history:` | `server/rewards.js:6`; `server/players.js:46-61`; `server/index.js:244` (`membersView`); `public/app.js:294-300` (`boardHTML`) | rewards.js:6; players.js:46-60; index.js:237; app.js:291 | moved (index +7, app +2) | High: points and leaderboards mix clubs | `c:<cid>:history:*`, points per club |
| S8 | Prize shop is global | `server/rewards.js:9-10` (`rewards()`, `claimedCount`), `:18` (`reward:` key), `:43` (`redeem:` key), `:50-55` (`view`) | rewards.js:9-10, 18, 43 | same | High (also legal: who organizes the prize) | Per-club shop, off by default for new clubs |
| S9 | Fairness pruning keeps the newest 12 tournaments globally | `server/fair.js:12` (`KEEP_TOURNEYS`), `:60-63` (`prune`) | fair.js:12, 60-63 | same | Medium: a busy club deletes others' fairness records | Prune per club |
| S10 | One `settings` key and one time zone | `server/index.js:118` (`membersInvite` from `settings`), `:262` (`chatOff`), `:285` (chat checks `settings`), `:324-327` (`CLUB_TZ` for notices) | index.js:115, 278, 317-320 | moved (+3, +7) | Medium | `club:<cid>.settings`, `club.tz` |
| S11 | Invites carry no club | `server/index.js:120-134` (`inviteCode`), `:64-82` (`redeem`) | index.js:117-131, 63-81 | moved (+3, +1) | High: which club does a link join? | `inv:<code>.cid` plus an approval policy |
| S12 | Redeem auto-joins "the" tournament | `server/index.js:77-78` | index.js:76-77 | moved (+1) | Medium | Remove, or join only the inviting club's open event |
| S13 | `membersView` sends every user to every socket | `server/index.js:242-251` (`membersView`), `:261` (`members` in `clubView`) | index.js:235-244, 254 | moved (+7) | **Critical**: direct cross-club leak of member lists and `invitedBy` | Scope to the current club's members |
| S14 | Broadcasts go to all sockets | `server/index.js:309-313` (`broadcastClub`), `:314-323` (`pushTable`), `:338` (`onTableClosed` sends `closed` to all sockets) | index.js:302-306, 307-316, 331 | moved (+7) | High | Per-club channels |
| S15 | Push notices go to all users | `server/index.js:328-337` (`notice`: `members` = every non-removed user) | index.js:323-329 | moved (+5/+7; the report's range ended early, the function is 328-337) | Medium | Club members only, plus preferences |
| S16 | Profile, rating and stats are global | `server/players.js:86-93`; `server/index.js:382` (`profile` message) | players.js:86-93; index.js:375 | moved (index +7) | Medium: poker stats leak across clubs | Per-club results; rating hidden outside the club |
| S17 | Business visibility has no scope | `server/business.js:96` (`visible`), `:202-226` (`bizList`, `bizGet`, `bizFeed`) | business.js:96, 202-226 | same | High: directory network-wide by accident | `bizvis:<uid>`; filter by the viewer's clubs |
| S18 | One global spotlight | `server/business.js:119-125` (`spotlight`), `:228-235` (`bizSpotlight`) | business.js:119-125, 228-235 | same | Low | `c:<cid>:bizSpotlight` |
| S19 | Opportunity listings are unscoped | `server/opportunity.js:73-74` (`hidden`, `live`: no club check), `:119-128` (`oppList`), `:129-137` (`oppGet`), `:207-220` (`oppRequest`: any member can contact any poster) | oc1 opportunity.js:119-127 (snapshot) | **new code**: committed in `ef77d53`; `oppList` is now 119-128 | High: club-only vs network visibility is a required decision | `opp.scope = {cid} \| 'network'`; filter by the viewer's memberships |
| S20 | Households and conflicts are global | `server/index.js:269-270` (owner view `households`), `:393-399` (`household` message) | index.js:262-263, 386-392 | moved (+7) | Medium: owners see links from other clubs | Keep the linker global, expose it per club only |
| S21 | One chat and mute setting | `server/index.js:285-286` (chat checks), `:373-374` (`chatOff`, `mute` messages) | index.js:278-279, 366-367 | moved (+7) | Medium: `muted` is global on the user | `mem.muted` per club |
| S22 | Client stores one token and one club view | `public/app.js:8-12` (`local` = `stacked:*` keys), `:103-150` (one connect / `club` view) | app.js:9-11, 103-150 | same | Medium | `stacked:club` plus a switcher |
| S23 | Staging seed assumes a single owner | `server/index.js:444-452` (seed + demo businesses + **demo opportunity listings**); `server/business.js:271-287`; `server/opportunity.js:306-318` | index.js:437-445; business.js:271-285 | moved (+7); **changed**: `:452` now also seeds opportunities; new `opportunity.js:306-318` | Low (staging only) | Seed `orig` plus a second test club |
| S24 | Full-scan prefix queries | `server/store.js:94-95` (`keys`, `values` scan every key) | store.js:94-95 | same | Medium: cost grows with all keys of all clubs; Opportunity adds more scans (`oppreq:` scanned per card at `opportunity.js:87`, per list at `:126`, `:204`) | A prefix index |

All 24 are still present at `a3c67e9` (IMPLEMENTED as single-club). None was removed. Two **changed** in substance (S3, S23), one became committed code (S19), the rest only moved or stayed put.

## Additional single-club assumptions found in this pass (not in the original list)

| # | Assumption | Where at `a3c67e9` | Risk | Migration change (PROPOSED) |
|---|---|---|---|---|
| N1 | Opportunity reports queue, auto-hide threshold and reasons are global | `server/opportunity.js:24` (`AUTO_HIDE = 3`), `:264-267` (`oppReports`), `:280-285` (`queue()` over every `opp:`) | High: one director would see and act on every club's reports | Queue per club; threshold per club (small clubs may want 2) |
| N2 | Opportunity spam limits are per person, not per club | `server/opportunity.js:43-49` (`opplimit:<uid>`), `:37-42` (`writes`) | Low: a member of several clubs shares one daily allowance | Decide: per person (anti-spam) or per club |
| N3 | One lease = one writer process for the whole database | `server/store.js:3-6, 11, 38` | Medium: every club's traffic goes through one process; the lease must stay global unless the data is split | Keep one writer for the first release; revisit with section 3.7 of the architecture report |
| N4 | Removal deletes all of a member's Opportunity data | `server/index.js:408`, `server/opportunity.js:289-295` | High once there are many clubs (see S3) | Delete only that club's listings/requests/reports |

## How to re-check

Every cited line can be opened at the audited commit, for example:

```
git show a3c67e9:server/index.js | sed -n '242,251p'      # S13 membersView
git show a3c67e9:server/opportunity.js | sed -n '119,128p' # S19 oppList
git diff --stat 1b374d0 a3c67e9 -- server public/app.js    # what moved
```
