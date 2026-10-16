# 01. Opportunity Club: acceptance against the MVP spec

Labels: **IMPLEMENTED** (in code at `a3c67e9`), **TESTED** (run now by `scripts/acceptance.js`), **PROPOSED**, **NOT VERIFIED**.

Code: Opportunity Club `ef77d53` + UI fixes `7e0cce4`, merged into staging as `5a5b7d9` and `a3c67e9`. Audited tree: `a3c67e9` (app code byte-identical; the script prints `appCodeIdenticalToRef: true`).

## How it was run

`node docs/evidence/2026-10-16/scripts/acceptance.js` (from the repository root, after `npm ci` and `npm i --no-save playwright-core@1.56.1`):
1. Spawns a **local** server from this checkout with `STAGING=1` (fake seed: Test Director / 246810, Test Player 01–12 / `1357` + last digit twice, 5 fake demo businesses, 5 fake demo listings) and a throwaway `DATA_FILE` in the OS temp folder. Nothing touches staging or production.
2. Drives the API end to end and drives a phone-sized Chromium (390×844, device scale 2) for the screens. S1, S2 and S4 are done **through the UI** (form fill and tap), then checked through the API; S5 and S6 actions are done through the API and the screens are taken after a reload.
3. Prints a PASS/FAIL table, saves every API exchange to `raw/acceptance-S1.json` … `raw/acceptance-S6.json` (token, pin and salt fields replaced by `<redacted>`; the `Authorization` header recorded as `Bearer <token of Test Player NN>`), and screenshots to `screens/acceptance/`.

The real output is `logs/acceptance-run.log`. Result: **41 checks, 41 PASS, 0 FAIL** (TESTED).

## Summary

| # | MVP requirement | Result | Evidence |
|---|---|---|---|
| S1 | Post "I need help" | **PASS** (TESTED) | S1.1–S1.6, 2 screens |
| S2 | Post "I can help" | **PASS** (TESTED) | S2.1–S2.3, 2 screens |
| S3 | Community Opportunities on Home right after login, right after Business Club; hidden while seated in a running tournament | **PASS** (TESTED) with one note: on a 390×844 phone the card is **below the fold** (top at about 1080 CSS px), so the member must scroll | S3.1–S3.6, 5 screens |
| S4 | Consent-based Contact Member: request → poster shares the chosen field → sender sees only that | **PASS** (TESTED) | S4.1–S4.9, 7 screens |
| S5 | My Posts: edit / close / reopen / delete; server-side ownership (other member gets 404) | **PASS** (TESTED) | S5.1–S5.6, 3 screens |
| S6 | Members only (401 unauthenticated, removed member 401) + reporting/moderation basics | **PASS** (TESTED) | S6.1–S6.9, 3 screens; full moderation in `06-moderation-workflow.md` |

---

## S1. "I need help" post

**Steps.** Test Player 06 signs in → Home → Community Opportunities → **I need help** → taps a title starter, types the title "Looking for a reliable mover in March", taps category **Home services**, writes details and area "East end" → **Post to the club**. Then Test Player 07 lists "I need help" listings through the API. Validation probes: a 1-character title; an unknown category.

**Expected.** Listing created (open, 30-day default expiry), shown to other members as "I need help" with the poster's club name only; bad input rejected by the server.

**Actual (TESTED).**
```
PASS S1.1 "I need help" listing created by Player 06
PASS S1.2 shows as type need / "I need help" to other members
PASS S1.3 poster shown by club name only (member, no uid/contact)
PASS S1.4 default expiry 30 days
PASS S1.5 server rejects a 1-character title (400)
PASS S1.6 server rejects an unknown category (400)
```

**Code (IMPLEMENTED).** `server/opportunity.js:139-168` (`oppSave`), types `:18`, validation `:150-152`, default 30 days `:24, :62-67`; card view `:83-92`; form `public/opportunity.js` `renderForm`.

**Screens.** [S1-01-need-form-filled.png](screens/acceptance/S1-01-need-form-filled.png) (full form), [S1-02-need-posted-detail.png](screens/acceptance/S1-02-need-posted-detail.png) (the posted listing).

## S2. "I can help" post

**Steps.** Test Player 07 → Home → **I can help** → title "Can help with resumes and cover letters", category Education & tutoring, details, area "Remote" → Post. Test Player 08 filters the feed by "I can help" and searches "resumes".

**Expected.** Created as `offer` / "I can help"; the type filter returns only offers; search finds it.

**Actual (TESTED).**
```
PASS S2.1 "I can help" listing created by Player 07
PASS S2.2 shows as type offer / "I can help"; filter offer excludes needs
PASS S2.3 search "resumes" finds it
```

**Code.** same `oppSave`; filters and search `server/opportunity.js:93-99, 119-128`.

**Screens.** [S2-01-offer-form-filled.png](screens/acceptance/S2-01-offer-form-filled.png), [S2-02-offer-posted-detail.png](screens/acceptance/S2-02-offer-posted-detail.png).

## S3. Home placement right after login; hidden while seated

**Steps.** Test Player 06 and 08 sign in (fresh page). The script reads the Home DOM: which tab is selected, whether the "Community Opportunities" card exists, its position relative to the Business Club "Meet the Members" section, and its rows. Then the director creates a tournament; Test Player 08 and 10 join; screenshot while only registered; the director starts it; Test Player 08's lobby is checked again while seated in the running tournament.

**Expected.** After login the Home tab (labelled "Tournament", the default tab) shows "Community Opportunities" directly after the Business Club section, with up to 4 newest listings; hidden while seated in a running tournament.

**Actual (TESTED).**
```
S3 DOM: {"tab":"event","oppPresent":true,"heading":"Community Opportunities","rows":4,"oppIndex":2,"bizIndex":1,"prevIsBizHome":true,"prevText":"Business ClubMeet the MembersSee all 5 ›...","top":1081}
PASS S3.1 feed API answers right after login (Home card data)
PASS S3.2 Home (default "Tournament" tab) shows "Community Opportunities" after login
PASS S3.3 it sits directly after the Business Club home section
PASS S3.4 it lists up to 4 newest open listings
S3 seated: before {"opp":true,"status":"registered"} during {"opp":false,"bizHome":false,"lobby":true,"tab":"event"}
PASS S3.5 Community Opportunities visible while only registered
PASS S3.6 hidden while seated in a running tournament (client side)
S3 note: oppList while seated returns 200
```

**Notes.**
- "Right after login" is met in the sense that the card is on the first screen the member lands on, directly after Business Club. On a 390×844 phone its top is at about 1081 CSS px, so the member scrolls once to see it ([S3-01](screens/acceptance/S3-01-home-after-login-Player06.png) shows the first viewport; [S3-03](screens/acceptance/S3-03-home-community-opportunities-scrolled.png) after scrolling). Whether that satisfies "visible on Home right after login" is a product decision. TESTED.
- Hiding while seated is **client-side only** (`public/app.js:167-168, 176-185`; `public/opportunity.js` `mountHome` and `badge`); the API still answers while seated (shown above). That is fine for focus/UX, but it is not an access control. IMPLEMENTED, TESTED.
- Business Club's own Home section is hidden while seated too (`bizHome: false`).

**Screens.** [S3-01 Player 06 first viewport](screens/acceptance/S3-01-home-after-login-Player06.png), [S3-02 Player 08 first viewport](screens/acceptance/S3-02-home-after-login-Player08.png), [S3-03 scrolled to the card](screens/acceptance/S3-03-home-community-opportunities-scrolled.png), [S3-04 registered, not started (card present)](screens/acceptance/S3-04-home-registered-not-started.png), [S3-05 seated in the running tournament (card gone)](screens/acceptance/S3-05-home-while-seated-running.png).

## S4. Consent-based Contact Member

**Steps.** Test Player 08 opens Player 06's "I need help" listing from Home → **I can help** → writes a message → **Send request**. Checks: the sender's view; the poster's incoming view; duplicate request; request on own listing; a third member trying to answer. Test Player 06 → Business → Opportunities → My opportunities → **Share contact** → switches on **Share my phone** only (email left off), phone 416-555-0142, note "Text me after 6" → Share. Checks: the sender's view after the reply; answering twice. Decline path: Test Player 09 sends a request, the poster declines. Finally the sender's "Requests I sent" screen text is checked for the phone and for any "@".

**Expected.** Nothing is shared when the request is sent; the poster sees only the sender's club name and message; after "share", the sender sees exactly the fields the poster chose; decline shares nothing; only the poster can answer, once.

**Actual (TESTED).**
```
PASS S4.1 request stored as "sent" with no contact details
PASS S4.2 poster sees only sender club name + message (no uid, email, phone)
PASS S4.3 second request on the same listing refused (400)
PASS S4.4 request on own listing refused (400)
PASS S4.5 a third member cannot answer someone else's request (404)
PASS S4.6 sender now sees exactly the chosen field: phone + note, no email
PASS S4.7 a request can be answered only once (400)
PASS S4.8 declined request shares nothing
PASS S4.9 sender screen shows the phone and no email address
```
The incoming request object the poster receives has exactly the keys `answeredAt, createdAt, from, id, message, shared, status` (S4.2); after sharing, the sender's `shared` is exactly `{"phone":"416-555-0142","note":"Text me after 6"}` (S4.6). Raw: `raw/acceptance-S4.json`.

**Code (IMPLEMENTED).** `oppRequest` `server/opportunity.js:207-220`; `oppReply` `:222-239` (share builds `shared` only from what was sent; email and phone validated with Business Club's validators); poster view `incoming` `:103`; sender view `sentView` `:104-109`; the share-form suggestions come only from the poster's own business profile and are only sent to the poster (`oppMine` `:195-197`).

**Limits of this guarantee.** The consent flow governs what the app shares. Members can still type a phone number into a listing or a request message, because the server does not block phone numbers there (see `05-validation-evidence.md`). TESTED.

**Screens.** [S4-01 sender opens listing](screens/acceptance/S4-01-sender-opens-listing.png), [S4-02 request sheet](screens/acceptance/S4-02-sender-request-sheet.png), [S4-03 request sent](screens/acceptance/S4-03-sender-request-sent.png), [S4-04 poster's incoming request](screens/acceptance/S4-04-poster-incoming-request.png), [S4-05 poster switches on phone only](screens/acceptance/S4-05-poster-chooses-phone-only.png), [S4-06 poster after sharing](screens/acceptance/S4-06-poster-after-sharing.png), [S4-07 sender sees only the phone and the note](screens/acceptance/S4-07-sender-sees-only-phone.png).

## S5. My Posts: edit / close / reopen / delete with server-side ownership

**Steps (API, screens after a reload).** Player 06 edits the title (no new end date). Player 07 tries to edit, close and delete Player 06's listing, and tries an edit with a forged `uid` in the body. Player 06 closes it (Player 07 then tries to open it and checks the feed), reopens it, then deletes it; the sender's "Requests I sent" is checked afterwards.

**Expected.** Owner can do all four; anyone else gets 404 (not 403, so the listing's existence is not confirmed); a forged uid changes nothing; closed listings leave the feed; delete removes the listing and the requests about it.

**Actual (TESTED).**
```
PASS S5.1 owner can edit; end date kept
PASS S5.2e another member cannot edit it (404)
PASS S5.2c another member cannot close it (404)
PASS S5.2d another member cannot delete it (404)
PASS S5.3 a forged uid in the body changes nothing (404)
PASS S5.4 closed: state closed, out of the feed, 404 for others
PASS S5.5 reopened: open again and visible to others
PASS S5.6 deleted: 404 even for the owner, requests about it removed
```

**Code (IMPLEMENTED).** Ownership is checked on the stored record, never on the request body: `oppSave` `server/opportunity.js:141-142` (`cur.uid !== u.id` → 404), `oppClose` `:172`, `oppDelete` `:185`; delete cascade `delOpp` `:110-114`; 5-open-listings cap `:24, :159, :163, :177`.

**Observation (not a server issue).** The app keeps "My opportunities" in memory; changes made from another device (or through the API, as here) appear after a reload or after any action in the app. NOT a data problem; a UX note. TESTED (the first run of the script, before it reloaded, showed the stale list).

**Screens.** [S5-01 closed](screens/acceptance/S5-01-my-posts-closed.png), [S5-02 edited and reopened](screens/acceptance/S5-02-my-posts-reopened-edited.png), [S5-03 after delete](screens/acceptance/S5-03-my-posts-after-delete.png).

## S6. Members only; reporting and moderation basics

**Steps.** All 13 Opportunity endpoints without a token; a made-up token; the `X-Robots-Tag` header; a member calling the director queue and moderation; Player 09 reports Player 07's listing (reason spam + note), reports it again, the poster reports their own listing, Player 10 reports with an unknown reason; the director reads the queue; Player 08 opens the reported listing. Removed member: Player 12 posts a listing, the director removes Player 12 (websocket `remove`), then Player 12's old token is used and Player 09 tries to open Player 12's listing. Browser: a page with no token, Player 12's page after removal, the director's queue.

**Expected.** 401 without sign-in and for removed members; 403 for members on director endpoints; one report per member, not on own listing, only listed reasons; queue shows reason, note and reporter name; one report does not hide (threshold 3); a removed member's listings disappear.

**Actual (TESTED).**
```
PASS S6.1 every opportunity endpoint is 401 without sign-in (13 endpoints)
PASS S6.2 a made-up token is 401
PASS S6.3 responses carry X-Robots-Tag noindex (even the 401)
PASS S6.4 members get 403 on the reports queue and moderation
PASS S6.5 report accepted once; duplicate, own and unknown-reason reports refused
PASS S6.6 director queue shows the report (reason, note, reporter name)
PASS S6.7 one report does not hide the listing (threshold is 3)
PASS S6.8 removed member: old token is 401 and their listing is gone (404)
PASS S6.9 browser without a token gets 401 from oppList
```

**Code (IMPLEMENTED).** `member()` / `ownerOnly()` `server/opportunity.js:31-32` (re-reads the stored user and rejects `removed`); token lookup `server/index.js:34-38`; noindex for `/api/opp*` `server/index.js:146, 161`; reports `server/opportunity.js:249-262`; removal `server/index.js:408` → `opportunity.removeUser` `server/opportunity.js:289-295`.

**Known gap (from `04-phase1-tests.md`, not Opportunity-specific).** A removed member's **already-open websocket** keeps receiving club broadcasts until it disconnects (`sessions_owner_reset`, expected failure, batch B7). Opportunity data is not sent over the websocket (it is HTTP only, which returns 401), so Opportunity content is not exposed that way. Code read: no `opp` data in `clubView` (`server/index.js:252-274`).

**Screens.** [S6-01 no token: sign-in screen](screens/acceptance/S6-01-not-signed-in-sign-in-screen.png), [S6-02 removed member's page: back to sign-in](screens/acceptance/S6-02-removed-member-back-to-sign-in.png), [S6-03 director queue with one report](screens/acceptance/S6-03-director-queue-one-report.png).

## Earlier screenshots (copied for context)

The OC1 report's own screenshot set (phone and desktop, taken on `7e0cce4` by the OC1 author) is copied, for comparison only, to `screens/oc1-report/` (phone versions). They are **claims from the earlier report**, not produced by this package's run. The `screens/acceptance/` set above is the new, independent run.
