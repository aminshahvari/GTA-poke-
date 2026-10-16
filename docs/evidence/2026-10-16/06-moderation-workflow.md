# 06. Opportunity Club moderation workflow, end to end

Labels: **IMPLEMENTED** (in code at `a3c67e9`), **TESTED** (run now by `scripts/moderation.js`), **PROPOSED**, **NOT VERIFIED**.

Run: `node docs/evidence/2026-10-16/scripts/moderation.js` against a local server built from `a3c67e9` (STAGING=1 fake seed, throwaway data file). Output: `logs/moderation-run.log`. Every request/response (tokens redacted) in `raw/moderation.json`; the stored kv records of the listing at four moments in `raw/moderation-kv.json`. Listing and request ids are random per run, so they differ between runs and between this text and the raw files.

## 1. Result: 15 of 15 checks PASS (TESTED)

```
M1   | members get 403 on oppReports and oppModerate (incl. the poster)                      | PASS
M2   | after 2 reports the listing is still visible                                          | PASS
M3   | three reports accepted                                                                | PASS
M4   | auto-hidden at 3 reports: 404 for members, gone from feed, poster sees state "review" | PASS
M5   | kv: listing has autoHidden=true, 3 open (unreviewed) reports                          | PASS
M6   | director queue: listing first, state review, 3 reports with reason/note/reporter name | PASS
M7   | queue entries do not expose reporter user ids                                         | PASS
M8   | dismiss: visible again (200, open), queue empty                                       | PASS
M9   | kv: the 3 reports are kept and marked reviewed=true; autoHidden=false                 | PASS
M10  | hide: 404 for members, poster sees "hidden", listed in queue as hidden                | PASS
M11  | poster editing does not lift a director hide                                          | PASS
M12  | unhide: visible again                                                                 | PASS
M13  | unknown moderation action is 400                                                      | PASS
M14  | delete: 404 even for the poster; listing, its request and its reports removed from kv | PASS
M15  | moderating a deleted listing is 404                                                   | PASS
```

## 2. Step by step

| # | Actor | Request | Response (status, essentials) | Code (IMPLEMENTED) |
|---|---|---|---|---|
| 1 | Test Player 07 | `POST /api/oppSave {type:"offer", title:"Can help you earn fast cash from home", ...}` | 200, listing `state:"open"` | `server/opportunity.js:139-168` |
| 2 | Test Player 11 | `POST /api/oppRequest {id, message:"What is this about?"}` | 200, `status:"sent"` (used later to show that delete removes requests) | `:207-220` |
| 3 | Test Player 08 (member) | `POST /api/oppReports {}` | **403** `Only the club director can do that.` | `:264-267`, `ownerOnly` `:32` |
| 4 | Test Player 08 | `POST /api/oppModerate {id, action:"hide"}` | **403** | `:269-270` |
| 5 | Test Player 07 (the poster) | `POST /api/oppModerate {id, action:"delete"}` | **403** (the poster must use `oppDelete`, not the director action) | `:269-270` |
| 6 | Players 08, 09 | `POST /api/oppReport {id, reason:"spam", note:"Looks like a pitch"}`, `{reason:"scam"}` | 200, 200 | `:249-262` |
| 7 | Test Player 11 | `POST /api/oppGet {id}` after 2 reports | 200, `state:"open"` (threshold not reached) | `AUTO_HIDE = 3` `:24` |
| 8 | Test Player 10 | `POST /api/oppReport {id, reason:"spam", note:"Posted in two chats too"}` | 200; the server sets `autoHidden:true` because open reports ≥ 3 | `:260` |
| 9 | Test Player 11 | `oppGet {id}` / `oppList {}` | **404** `This listing is not available any more.` / not in `items` | `live()` `:74`, `:132` |
| 10 | Test Player 07 | `oppGet {id}` (own listing) | 200, `state:"review"` ("Hidden: waiting for director review" in the app) | `stateOf` `:81`, `:132` |
| 11 | Test Player 11 | `oppReport {id, reason:"spam"}` on the hidden listing | **404** (a hidden listing cannot be reported further) | `:252` |
| 12 | Test Director | `POST /api/oppReports {}` | 200, see JSON below: the listing first, `state:"review"`, three reports with `reason`, `reasonLabel`, `note`, `by` (club name), `at`; no reporter user id | `queue()` `:280-285` |
| 13 | Test Director | `POST /api/oppModerate {id, action:"dismiss"}` | 200 `{ok:true, queue:0}` | `:272, 274` |
| 14 | Test Player 11 | `oppGet {id}` | 200, `state:"open"`: visible again | |
| 15 | (kv) | `raw/moderation-kv.json` → `afterDismiss` | the 3 `oppreport:*` records are **kept** with `reviewed:true`; listing `autoHidden:false`, `modHidden:false` | `:272` |
| 16 | Test Player 08 | `oppReport` again after dismiss | **400** `You already reported this listing. Thank you.` (one report per member per listing, ever, including reviewed ones) | `:255` |
| 17 | Test Director | `oppModerate {action:"hide"}` | 200 `{queue:1}`; members get 404; poster sees `state:"hidden"`; queue lists it with `state:"hidden"` and no open reports | `:273`, `:81` |
| 18 | Test Player 07 | `oppSave {id, title:"Edited while hidden", ...}` | 200, but members still get 404: editing keeps `modHidden` (spread of the stored listing) | `:158` |
| 19 | Test Director | `oppModerate {action:"unhide"}` | 200 `{queue:0}`; members get 200 again | `:274` |
| 20 | Test Director | `oppModerate {action:"nuke"}` | **400** `Unknown action.` | `:276` |
| 21 | Test Director | `oppModerate {action:"delete"}` | 200; poster gets **404**; kv before delete had `opp:<id>`, 1 `oppreq:`, 3 `oppreport:` → after delete **none** of them; the requester's "Requests I sent" no longer lists it | `delOpp` `:110-114` |
| 22 | Test Director | `oppModerate {action:"delete"}` again | **404** `That listing was not found.` | `:271` |

Director queue response at step 12 (from `raw/moderation.json`; id shortened):

```json
{
  "status": 200,
  "xRobotsTag": "noindex, nofollow, noarchive",
  "body": {
    "items": [
      {
        "id": "oe7da…", "type": "offer", "typeLabel": "I can help",
        "title": "Can help you earn fast cash from home",
        "details": "Message me for details. (Fake spam listing for the moderation test.)",
        "categoryLabel": "Finance & insurance", "member": "Test Player 07", "state": "review",
        "reports": [
          { "reason": "spam", "reasonLabel": "Spam or advertising", "note": "Looks like a pitch", "by": "Test Player 08", "at": 1792181243237 },
          { "reason": "scam", "reasonLabel": "Scam or misleading", "note": "", "by": "Test Player 09", "at": 1792181243239 },
          { "reason": "spam", "reasonLabel": "Spam or advertising", "note": "Posted in two chats too", "by": "Test Player 10", "at": 1792181243243 }
        ]
      }
    ],
    "reasons": [["spam","Spam or advertising"],["scam","Scam or misleading"],["offensive","Offensive or harassing"],["private","Shares someone's private info"],["offtopic","Not a real request"],["other","Something else"]]
  }
}
```

Dismiss response at step 13: `{"status":200,"xRobotsTag":"noindex, nofollow, noarchive","body":{"ok":true,"queue":0}}`.

## 3. Screenshots (phone 390×844, fake data; `screens/moderation/`)

| File | What it shows |
|---|---|
| [M-01-director-queue-before-auto-hidden.png](screens/moderation/M-01-director-queue-before-auto-hidden.png) | Director's Reports queue: the listing with "Hidden: waiting for director review", three reports with reason, reporter club name and note; buttons Show again / Keep hidden / Delete |
| [M-02-poster-sees-waiting-for-review.png](screens/moderation/M-02-poster-sees-waiting-for-review.png) | The poster's My opportunities: the listing marked hidden for review (the poster is not told who reported) |
| [M-03-director-listing-controls.png](screens/moderation/M-03-director-listing-controls.png) | Director's listing detail with the director box (open reports, Show again, Delete listing) |
| [M-04-director-queue-after-dismiss-all-clear.png](screens/moderation/M-04-director-queue-after-dismiss-all-clear.png) | Queue after dismiss: "All clear" |
| [M-05-member-feed-listing-visible-again.png](screens/moderation/M-05-member-feed-listing-visible-again.png) | A member's feed: the listing is back |
| [M-06-director-queue-hidden.png](screens/moderation/M-06-director-queue-hidden.png) | Queue after a director hide: "Hidden by the club director", no open reports |

In the app the auto-hidden card offers "Show again" (action `unhide`) rather than "Dismiss reports"; on the server `unhide` and `dismiss` do the same thing (`server/opportunity.js:274`). "Dismiss reports" is shown for a listing that has reports but is not hidden (`public/opportunity.js` `renderReports`).

## 4. Observations (TESTED unless noted)

1. **Reporter privacy:** the queue shows the reporter's club **name** to the director (not the user id); the poster sees only the state, never who reported (`card()` `server/opportunity.js:83-92` has no report data; `oppGet` adds `reported` only for the caller's own report, `:134`). The report sheet says "The member is not told who reported" (`public/opportunity.js` `reportSheet`).
2. **One report per member per listing, forever:** after a dismiss, the same three members cannot report the same listing again (step 16). Re-hiding needs three **new** reporters. That is a reasonable anti-abuse rule but means a listing edited into something bad after a dismiss is harder to auto-hide. Decision for the owner.
3. **Hidden listings cannot be reported** (404, step 11), so a 4th report is not counted.
4. **Reports are not deleted on dismiss**, only marked `reviewed`; they are deleted with the listing (`delOpp`) or when the reporter is removed from the club (`removeUser` `:292`).
5. **No audit log** of director actions (who hid/unhid/deleted, when). NOT IMPLEMENTED; PROPOSED as a small `oppmodlog:<id>` record if the owner wants accountability.
6. **Hidden listings still count as "open" for the poster:** `openCount` counts `status === 'open'` and not expired, without excluding hidden ones (`server/opportunity.js:101`); screenshot M-02 shows "1 of 5 open listings" for an auto-hidden listing. A poster with 5 hidden listings cannot post a 6th until they close one. Minor; decision for the owner.
7. **Rate limits:** reports count against the member's 40-writes-per-10-minutes limit (`rate()` `:38-42`, `:257`); director moderation has no rate limit (owner only).

## 5. How to re-run

```
node docs/evidence/2026-10-16/scripts/moderation.js            # API + screenshots
node docs/evidence/2026-10-16/scripts/moderation.js --no-browser
```
