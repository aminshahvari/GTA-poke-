# R2: invite links and automatic tournament registration

Investigation only. No code was changed. Branch `r2-invite-notes` (based on r2-dev 523a284); production is `origin/main` d00b592.

## Current behavior

Every successful invite redemption signs the new member up for the current tournament, whatever kind of link was used.

- `server/index.js:73` `api.redeem`: loads the invite (`:74`), checks that it is still valid (`:75-77`), then validates name, PIN and agreement (`:78-82`).
- `server/index.js:83-84` creates the user and stores `invitedBy`.
- `server/index.js:85-87` is the auto-registration step:
  ```js
  // the link is usually sent for a tournament: sign the new player up for it straight away
  const t = club.T();
  if(t && (t.status === 'registering' || (t.status === 'running' && club.lateOpen()))) try{ club.join(u.id); }catch(e){}
  ```
  The only conditions are the tournament's state: it must be `registering`, or `running` with late registration open (`server/club.js:102`). Nothing checks `inv.multi`, `inv.by`, the link type, or any Director setting.
- `server/index.js:88` is the first place the link type matters, and it only affects how the link is marked used (`uses[]` for group links, `usedBy` for personal links).
- `server/club.js:75-81` `join()` adds the user to `t.regs` while registering, or calls `lateJoin` if the tournament is running.
- How the three link types are created, in `inviteCode` at `server/index.js:134-148`:
  - Owner personal link: `group` is false, so the record is `{ code, createdAt, by }` with no `multi` (`:145-146`). It is created by the Director "Personal link" button (WS `invite` with `group:false`, `server/index.js:431`) and by HTTP `/api/invite` (`server/index.js:107`, which calls `inviteCode(u)` with no group).
  - Owner group link: `multi: true, max: GROUP_MAX` (`:142-145`).
  - Member link: always `group = true`, so `multi: true, max: MEMBER_MAX` (10) (`:135-139`, `:131`).
  All three go through the same `redeem`, so all three auto-register.
- The client also reacts after any join. `public/app.js:88` sets `askRemind`, and if the new user is in `regs`, `public/app.js:139` shows the toast "You're signed up for <name>" and offers a reminder.
- The staging seed (`server/index.js:486`) redeems personal links too. On an empty database there is no tournament, so in practice nothing gets registered there.

**Local check** (this branch, local server on a random 4xxx port, file store in /tmp, owner code `secret`, NO_BEACON=1; no remote host was touched): the owner set up the club, created the tournament "Friday Game" (status registering), then issued three links: a personal link via `/api/invite`, a personal link via WS `{t:'invite',group:false}` (max 1), and a group link (max 100). One new member redeemed each link. The resulting `tourney.regs` was `['PersonalA','PersonalB','GroupC']`, so all three were registered. This matches the owner's report.

**Production d00b592 behaves the same.** `git show origin/main:server/index.js` has the identical block at lines 74-76 in `redeem` (which starts at `:62`). The behavior came in with commit d5f67b1 ("...a lasting group link that signs players up..."), which put the auto-join into `redeem` without a group check.

## What the UI says

- Director "Invite people" chooser (`public/app.js:580`): "A **group link** ... People who join with it are signed up for the open tournament. A **personal link** works once, for one friend." Only the group link is said to register people.
- Link dialog (`public/app.js:590`, `showInvite`):
  - Owner group link, titled "Group invite link": "...anyone who joins is signed up for the open tournament. It stays the same link until you cancel it in Director."
  - Owner personal link, titled "Invite link": "Send this to one friend. It works once." Registration is not mentioned.
  - Member link, titled "Your invite link": "Up to N people can join with your link for 7 days. It's free, and they pick their own name and PIN." Registration is not mentioned.
- The shareable message text is the same for every link type (`public/app.js:585-588`): "<name> invited you to the Blindrise poker club **for <Tournament>, <day time>**...". It names the tournament whenever one is registering or running, so the recipient is told the invite is for that game regardless of link type.
- Director Members note (`public/app.js:407`) describes group and personal links but says nothing about registration.
- The member "Grow the club" card (`public/app.js:254-255`) says nothing about registration.
- Production `public/app.js` has the same copy (`:493` chooser, `:503` dialog).

## Expected behavior (inference)

*Inference from the copy; the code does not state an intent.* Because the chooser says registration happens for group links and the personal-link text leaves it out, the copy suggests:
- group links sign new members up for the open tournament;
- personal links only create the membership;
- member links are undefined. They are `multi` links technically, but their copy never mentions registration.

Two things point the other way. The code comment at `server/index.js:85` ("the link is usually sent for a tournament") applies to every link. And the share text names the tournament for every link type. So the original intent may have been "always register", with the chooser copy written only to explain the group link. The owner should decide which is meant.

## Options

### A: Personal links do not auto-register (match the copy)
- Change: gate `server/index.js:87` on the link type, for example `if(inv.multi && t && (...))`. Decide separately whether member links (also `multi`, `by` ≠ owner) should register. If not, use `inv.multi && inv.by === store.get('owner')`.
- Other touch-points: none required. The toast at `public/app.js:139` already shows only when the user is in `regs`. Optionally, change the share text at `public/app.js:587-588` so personal links do not say "for <Tournament>", or add "tap Join tournament on Home".
- Risk: low code risk (one condition). Behavior risk: a friend sent a personal link "for tonight's game" will no longer be in the field automatically. They must tap Join tournament, and the owner may see a smaller field than expected. This also changes invitation semantics in production (d00b592), so it needs owner approval and a release note.

### B: Keep the behavior and change the copy to match
- Change: `public/app.js:580` (for example, "Anyone who joins with an invite link is signed up for the open tournament.") and `public/app.js:590` (personal and member dialog text: add "...and they're signed up for the open tournament"). Optionally also `public/app.js:407` and `:255`.
- Server: no change.
- Risk: lowest. Copy only, and production behavior is unchanged. It does not fix the reported annoyance: people invited only to join the club still get registered and have to cancel.

### C: Make it a Director setting
- Change: add a setting such as `settings.inviteAutoJoin` with values `'all' | 'group' | 'off'`, following the `membersInvite` pattern (`server/index.js:132` getter, `:432` WS case, `:287` `clubView` field). Read it in `redeem` at `server/index.js:85-87`. Add a Director toggle beside "Members can invite" (`public/app.js:406`, handler near `:524`), and make the copy at `public/app.js:580` and `:590` follow the setting.
- Risk: medium. It touches more code (server setting, WS case, client view, copy), and the default must be chosen with care. A default of `'all'` keeps today's production behavior. A default of `'group'` is Option A. Adding settings also adds Director clutter and more test cases.

## Recommendation

*Recommendation only. The owner decides. Invitation semantics must not change without owner approval.*

Option A, limited to owner personal links (keep auto-registration for owner group links; owner to confirm what member links should do), together with a small copy tweak so the personal-link share text does not suggest automatic registration. It is a one-line server change, it makes the system match what the Director is already told, and it fixes the reported case. If the owner prefers "everyone invited is in the game", choose B instead. Pick C only if both behaviors are really needed.
