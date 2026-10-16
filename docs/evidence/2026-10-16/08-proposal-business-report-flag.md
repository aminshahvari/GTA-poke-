# 08. PROPOSAL: Report / Flag on Business Club profiles

**Status: PROPOSED only. Nothing here is implemented.** No code was changed for this package. Everything below is a design for review, written to match how Opportunity Club reporting already works at `a3c67e9` so members see one consistent behaviour.

## 1. Why

Business Club (`server/business.js`) lets the director hide a profile (`bizModerate`, `server/business.js:237-244`) but members have **no way to flag** a profile. Opportunity Club already has member reports with auto-hide and a director queue (`server/opportunity.js:249-285`, TESTED in `06-moderation-workflow.md`). Today a member who sees a misleading or offensive business profile can only tell the director outside the app.

## 2. Behaviour (mirrors Opportunity Club)

| Rule | Proposal | Opportunity Club today (for consistency) |
|---|---|---|
| Who can report | Any signed-in, non-removed member | `member(u)` `opportunity.js:31` |
| What can be reported | A **published, visible** profile (`visible(b)` `business.js:96`) | only `live()` listings `opportunity.js:252` |
| Not your own | 400 "This is your own business." | `opportunity.js:253` |
| Reasons (fixed list) | `misleading` Misleading or fake business, `scam` Scam or fraud, `offensive` Offensive or harassing, `private` Shares someone's private info, `notmember` Not this member's business, `other` Something else. Optional note up to 300 characters, links allowed (so the reporter can paste evidence), same text cleaner | `REASONS` `opportunity.js:19-20`; note `noLinks:false` `:256` |
| One report per member per profile | 400 "You already reported this business. Thank you." Counted across reviewed reports too (same as Opportunity, see `06` observation 2). Open question for the owner: allow a new report after the profile is **edited** following a dismiss | `:255` |
| Auto-hide threshold | **3** open (unreviewed) reports set `autoHidden: true`; the profile disappears from the directory, Home carousel, spotlight and detail for members | `AUTO_HIDE = 3` `:24`, `:260` |
| Spotlight | auto-hide or director hide clears the spotlight (`clearSpotlightFor`, `business.js:125`) | n/a |
| Owner of the profile sees | "Hidden: waiting for director review" on My Business; never who reported or the notes | `stateOf` `:81` |
| Director queue | Business reports appear in a **Reports queue** next to listings: one queue screen with two sections (Listings / Businesses) or a type pill per row | `queue()` `:280-285` |
| Director actions | `dismiss` / `unhide` (mark reports reviewed, clear `autoHidden` and `modHidden`), `hide` (reuse the existing `modHidden`), no "delete profile" action for the director (deleting someone's business stays the member's choice or member removal) | `oppModerate` `:269-278` |
| `modHidden` reuse | Keep the existing `biz.modHidden` meaning "hidden by the director"; add `biz.autoHidden` for "hidden by reports". `visible()` becomes `published && !modHidden && !autoHidden && member exists` | `hidden()` `:73` |
| Reporter privacy | Reporter user id stored server-side only; the director sees the reporter's club name (as today for listings); the profile owner never sees reporter or note; no report data in any websocket broadcast or in `bizList`/`bizGet`/`bizFeed` for non-directors | `queue()` maps `by` to a name `:284` |
| Removal cleanup | When a member is removed (`server/index.js:408`) or deletes their business (`bizDelete`, `business.js:191-195`): delete reports **on** their profile and reports **made by** them (as `opportunity.removeUser` does `:289-295`) | `:292` |
| Rate limits | Reports count against a per-member write limit (memory, like `rate()`), plus a stored daily cap, e.g. 10 business reports per member per day (`bizlimit:<uid>`), so a restart does not reset it | `rate()` `:38-42`, `limit()` `:44-49` |
| noindex | `/api/biz*` already gets `X-Robots-Tag: noindex, nofollow, noarchive` (`server/index.js:161`); the new endpoints use the `biz` prefix so they inherit it | same for `/api/opp*` |

## 3. API sketch (POST, JSON, Bearer token)

| Endpoint | Body | Who | Responses |
|---|---|---|---|
| `bizReport` | `{ uid, reason, note? }` | member | 200 `{ok:true}`; 401 not signed in / removed; 404 profile not visible; 400 own profile, unknown reason, already reported, note too long; 429 rate limited |
| `bizReports` | `{}` | director | 200 `{ items: [{ uid, name, member, categoryLabel, state: 'review'\|'hidden'\|'open', reports: [{ reason, reasonLabel, note, by, at }] }], reasons }`; 403 member |
| `bizModerate` (extend existing) | `{ uid, action: 'hide'\|'unhide'\|'dismiss' }` (keep accepting the old `{ uid, hidden: true\|false }` for the current app) | director | 200 `{ ok:true, queue:n }`; 400 unknown action; 404 not found |
| `bizGet` (extend) | | member | add `reported: true` when the caller already reported (to show "You reported this business") |
| `bizMine` (extend) | | owner | add `state: 'review'\|'hidden'\|'published'\|'draft'` |

## 4. Data keys (additive; nothing existing changes)

| Key | Value |
|---|---|
| `bizreport:<id>` | `{ id, uid (profile owner), by (reporter uid), reason, note, createdAt, reviewed }` |
| `biz:<uid>` | new optional field `autoHidden: boolean` (absent = false) |
| `bizlimit:<uid>` | `{ reports: [time, ...] }` reporter's daily cap |

Rollback-safe: older code ignores the new keys and field (the `visible()` of older code would show an auto-hidden profile again, which is acceptable for a rollback).

## 5. UI placement

- Business detail page (`public/business.js`, detail view): a small "Report this business" text button under the contact buttons, only for non-owners and only on visible profiles, opening the same bottom sheet as listings (`reportSheet` in `public/opportunity.js`, reused: radio reasons + optional note + "Reports go to the club director only. The member is not told who reported.").
- My Business: a warning pill "Hidden: waiting for director review" when `autoHidden`.
- Director: the existing Reports queue (Opportunities) gains a "Businesses" section, and the Business tab shows a "Reports queue" row for the director with a count, like `.op-row.dir` today.

## 6. Tests to add (in `test/t_business.js` or a new `test/t_bizreport.js`)

1. 401 without token / bad token / removed member on `bizReport`, `bizReports`; 403 for members on `bizReports`, `bizModerate`.
2. Report own profile → 400; draft or hidden profile → 404; unknown reason → 400; duplicate → 400.
3. Two reports: still visible; third: `bizList`, `bizGet`, `bizFeed`, `/bizlogo/<uid>` and spotlight no longer show it; owner sees `state:'review'`.
4. Queue contents: reason, note, reporter **name**, no reporter uid; owner's responses never contain report data.
5. `dismiss`: visible again, reports `reviewed:true`; `hide`: hidden, `modHidden:true`; `unhide`.
6. Member removal and `bizDelete` remove reports on and by that member.
7. Rate limits: 11th report in a day → 429; the stored cap survives a restart.
8. `X-Robots-Tag` on the new endpoints; no report data in websocket `club` broadcasts.
9. A browser CSP run like `scripts/csp-opportunity.js` covering the report sheet on the business page.

## 7. Risks

- **Brigading:** three friends can hide a competitor's business until the director looks. Same risk as listings; mitigations: director notification (push) on auto-hide, threshold configurable per club, director can restore with one tap.
- **Retaliation:** the profile owner could guess the reporter in a small club even without names. Mitigation: wording that sets expectations; no counts shown to the owner.
- **Defamation/legal:** report notes may contain accusations about a real business; stored only for the director, deleted with the profile or the reporter. Ask counsel what retention is appropriate (architecture report section 10).
- **Consistency debt:** two queues with slightly different rules would confuse the director; build one queue.

## 8. Rollback

Feature flag (`settings.bizReports`, default off) for the UI; server endpoints stay but return 404 when off. Rolling back the code leaves `bizreport:*` keys unused; a one-line cleanup can delete them. Auto-hidden profiles reappear under old code (acceptable).

## 9. Effort estimate (files touched, no time estimate)

| File | Change |
|---|---|
| `server/business.js` | `bizReport`, `bizReports`, `bizModerate` actions, `autoHidden` in `visible()`, removal cleanup, limits |
| `server/index.js` | nothing new for routing (the `biz` prefix already gets noindex); removal hook already calls `business.removeUser` |
| `public/business.js` | report button on detail, review pill on My Business, director queue section |
| `public/opportunity.js` | export the report sheet and the queue renderer for reuse (or move them to a shared helper) |
| `public/style.css` | a few rules, reusing `op-*` classes |
| `test/t_business.js` or new `test/t_bizreport.js` | the tests in section 6 |
| `package.json` | add the new test file to `npm test` if a new file is used |

About 5 to 7 files; no new dependencies; no change to poker, points or tournaments.
