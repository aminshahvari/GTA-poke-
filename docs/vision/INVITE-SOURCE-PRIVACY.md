# Invitation-source visibility: findings and fix

Claude, 2026-10-18, on the owner's Strategy Integration Directive, item 6. Verified by code reading at live `5c7ee11`; the fix is on branch `invite-privacy` `06e6e9c` (NOT deployed).

## What members can see today (live `5c7ee11`)
| Where | What | Who receives it |
|---|---|---|
| `server/index.js:84` (`redeem`) | Stores `invitedBy: <inviter's member id>` on the new member's record | Stored server-side |
| `server/index.js:271` (`membersView`) | Puts `invitedBy` on every entry of the member list | Shared by all views |
| `server/index.js:278-285` (`clubView`) | Sends the whole `members` array, with `invitedBy`, in the `club` WebSocket message | **Every signed-in member**, not only the owner |
| `public/app.js:960` (profile sheet) | Shows "· invited by <name>" on any member's profile | Any member who opens a profile |
| `public/app.js:446` (Director member list) | Shows "· invited by <name>" | Owner-only screen |
| `server/index.js:410` (`profile` message) | Does not carry the inviter | n/a |
| `server/index.js:149` (`invitedCount`) | A member's own count of people who joined through them | Only that member (a number) |

**Result:** any member can see, in the app or in the raw payload, who invited every other member. That is the club's social graph. Muse verified the same (`aed6f2c` §3). For a public venue pilot it would also expose who came in through which person.

Note: the campaign build (`public-onboarding` `8b2b1fa`) already hides inviters from members who joined through a campaign link, but not from everyone else.

## Fix (branch `invite-privacy`, cut from `r2-hotfix` `06dd2e5`)
- **Change.** In `clubView`, the owner still receives every `invitedBy`. For any other member, every entry's `invitedBy`, their own included, is `null` (Muse P10: "a member payload contains no `invitedBy`").
  - The client already treats a missing inviter as "show nothing", so no client change is needed.
  - The Director list is unchanged for the owner.
  - The size is 3 lines in `server/index.js`.
- **Unchanged.**
  - Stored data, the owner's view and `invitedCount`.
  - Member invite links work as before.
- **Not mutated.** The shared `membersView` memo; filtered entries are copies.
- **Evidence:**
  - `test/t_invite_privacy.js`, added to `npm test`: 7 ok / 0 failed. Without the fix it fails, at "a member does not see other members' inviters" (checked on `06dd2e5`).
  - `npm test` exit 0.
  - UI tests with real fonts: t_hotfix 39/0, t_premium_ui 295/0, t_clubs_closed 25/0, t_mobile_ux passed, t_welcome passed.
- **Release.** It is a server change, so it needs Muse's verdict on the exact SHA and the owner's GO. It is a separate workstream from the stabilization RC. It can ship with it or right after; it must be live before the Celestia pilot (pilot test P10).
- **When the campaign link is rebased onto R2 (C1)**, the campaign build's own narrower filter becomes redundant and should be dropped in favour of this one.

## Residual exposure (unchanged, by design)
Members still see the member list (names, avatars, tiers, member-since dates). Hiding that is a product decision, not part of this fix.
