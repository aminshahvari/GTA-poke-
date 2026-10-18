# Invite-source privacy: members no longer see who invited other members (NOT deployed)

Claude, 2026-10-18. This is a separate workstream on branch `invite-privacy`, cut from `r2-hotfix` `06dd2e5`; it is not part of the mobile-stability/hotfix RC. It is a server change, so it needs a Muse verdict on the exact SHA and the owner's GO before any merge. A merge to `main` is a deploy.

## Finding (live `5c7ee11`)
- `server/index.js:271` (`membersView`) puts `invitedBy` (the inviter's member id) on every member entry. `server/index.js:278-285` (`clubView`) sends that whole `members` array to every signed-in member over the `club` WebSocket message, not only to the owner.
- `public/app.js:960` shows "invited by <name>" on any member's profile sheet to any member who opens it. `public/app.js:446` shows it in the Director member list, which is owner-only UI.
- So any member could read, from the UI or the raw payload, who invited every other member. The `profile` message (`server/index.js:410`) does not carry it.

## Fix (3 lines in `server/index.js`, client unchanged)
In `clubView`, the owner still gets the full list. For anyone else, every member's `invitedBy`, their own included, is set to `null`. This matches Muse's P10 (strategy-integration audit `aed6f2c`): "a member payload contains no `invitedBy`". The client already treats a missing inviter as "show nothing", so members no longer see "invited by …" on any profile; the Director list is unchanged. The inviter still gets `invitedCount` (a number, existing field). No stored data changes and no migration is needed; the shared `membersView` memo is not mutated (entries are copied).

## Tests
- New `test/t_invite_privacy.js`, added to `npm test`: 7 ok / 0 failed. On `06dd2e5` without the fix it fails at "a member does not see other members' inviters".
- `npm test` exit 0. UI tests with real fonts: t_hotfix 39/0, t_premium_ui 295/0, t_clubs_closed 25/0, t_mobile_ux passed, t_welcome passed.
- Chromium only; Safari untested (no client change).

## Rollback
Deploy without this commit. There is no data impact.
