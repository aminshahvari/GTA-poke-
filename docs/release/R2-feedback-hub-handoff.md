# Feedback Hub MVP: handoff for Muse's audit

**Branch:** `r2-feedback`. **Base:** `c4445ed` (the audited R2 candidate). The Hub is one commit on top of the base. The exact SHA is the commit that adds this file; it is given in the delivery message, because a commit cannot name its own SHA.

**Not merged anywhere.** `r2-rc`, `staging` and `main` are untouched, and nothing was deployed. If the Hub is ever merged into the release line, the release SHA changes and the combined candidate needs the delta audit (Muse's Track 2 warning).

Written against Muse's criteria in `docs/release/MUSE-REPORT-live-beta-feedback-hub-2026-10-17.md` (on `r2-rc` at `0c13010`), Track 2.

## 2.3 statement (what Muse asked for)

| Item | Answer |
|---|---|
| SHA and branch | `r2-feedback` at the commit that adds this file (SHA in the delivery message). Base: `c4445ed`. |
| Diff vs base | New files: `server/feedback.js`, `public/feedback.js`, `test/t_feedback.js`, `test/ui/t_feedback_ui.js`, this document, `docs/evidence/r2/feedback/*.jpg`. Changed files: `server/index.js` (+16 −4), `public/app.js` (+8 −1), `public/style.css` (+55, appended at the end), `public/business.js` (+1), `public/index.html` (+1), `package.json` (one test added to the chain). Run `git diff --stat c4445ed r2-feedback` for exact numbers. Every change to an existing file is listed below. |
| Storage location | The existing kv store (`server/store.js`): Postgres `kv` table in production and staging, the JSON file locally. New keys only: `fb:<id>`, `fbshot:<id>`, `fblimit:<uid>`, plus one new field `feedbackOff` inside the existing `settings` key. No schema change, no migration, no new table. The keys are covered by the existing backups. |
| Admin authority | The existing owner role (`u.role === 'owner'`), the same check the Director functions use. It is enforced on the server in every read, write and delete endpoint and on the screenshot route. There is no new role. |
| Screenshots | **Included and hardened.** They are optional, JPEG only, and capped at 140,000 data-URL characters (about 100 KB). Details are in the screenshots section below. |
| Context auto-attached | `version` (the server's own `RENDER_GIT_COMMIT`, first 7 characters; the client cannot set it); `section` (one of home, poker, learn, business, opportunity, director, other); `device` (a class such as "iPhone · Safari", derived on the server from the user-agent, and the raw user-agent string is **not** stored); `vw` and `vh` (viewport size, integers 0 to 10000). Author and time come from the server session and clock. Nothing else is kept. |
| Limits | Text is 5 to 2,000 characters after cleaning. The rate limit is 5 per hour and 20 per day per member, stored on disk so it survives a restart. Screenshots are limited to 5 per member per day and 200 stored at once across the club. The HTTP body cap is 150,000 bytes for `/api/fbSend` and is unchanged (10,000) for every other endpoint. |
| Kill switch | (1) Set `FEEDBACK=off` in the environment. Every Hub endpoint and `/fbshot/*` then answers 404 and no button is shown. Stored data is kept. (2) An owner toggle in the Director tab ("Close feedback to members") sets `settings.feedbackOff`. Members' buttons disappear live, `fbSend` returns 403 for everyone, and the owner keeps the inbox. The toggle survives a restart. |

## Data model

```
fb:<id>        { id, uid, cat: 'bug'|'idea'|'ux', text, ctx: { version, section, device, vw, vh },
                 status: 'new'|'reviewing'|'progress'|'resolved', shot: bool, createdAt, updatedAt }
fbshot:<id>    { data }   JPEG data URL, re-checked and rebuilt without metadata by the server
fblimit:<uid>  { sent: [time], shots: [time] }   send times inside the last day
settings.feedbackOff   boolean (owner toggle), inside the existing settings key
```

- Ids are `f` followed by 16 hex characters: 64 bits from `crypto.randomBytes`, never chosen by the client.
- `uid` comes from the session and is never sent to anyone. The owner sees the member's display name, or "Removed member".

## Authorization matrix

Members are signed-in, not removed, and not the owner.

| Endpoint | No token or bad token | Member | Removed member | Owner | `FEEDBACK=off` |
|---|---|---|---|---|---|
| `POST /api/fbSend` | 401 | 200 `{ok:true}` (403 while closed) | 401 | 200 (403 while closed) | 404 |
| `POST /api/fbList` | 401 | 403, body `{error}` only | 401 | 200 | 404 |
| `POST /api/fbSet` | 401 | 403 | 401 | 200 / 404 unknown id | 404 |
| `POST /api/fbDelete` | 401 | 403 | 401 | 200 / 404 unknown id | 404 |
| `GET /fbshot/<id>` | 404 | 404 (including the sender) | 404 | 200 image | 404 |
| WS `feedbackOn` | n/a | refused (existing `own()`) | n/a | sets toggle and broadcasts club | toggle has no effect |

There is no member-facing read endpoint at all. After sending, a member gets back only `{ok:true}`, and members cannot see even their own notes.

## Screenshots (criterion 5)

- **Images only, checked by content.** Only `data:image/jpeg;base64,` with a strict base64 alphabet is accepted. The server then parses the JPEG marker by marker: it needs SOI, a frame header before the scan, well-formed segment lengths and EOI, and rejects anything else (PNG, SVG, HTML, truncated or mislabeled data).
- **Metadata stripped.** The server rebuilds the file without APP1 to APP15 (EXIF, GPS, XMP, ICC) and COM segments. The phone also re-draws the picture on a canvas before sending, which drops metadata.
- **Size.** About 100 KB per screenshot. The phone shrinks to 1280 px and lower quality until it fits.
- **Storage.** Kept as a kv value, never as a file on disk, and never under `public/`. Names are the random feedback id; members cannot set a filename and there is no path.
- **Serving.** `GET /fbshot/<id>` is owner-only with the Bearer token. It sends:
  - `Content-Type: image/jpeg`
  - `Content-Disposition: attachment`
  - `X-Content-Type-Options: nosniff`
  - the app's full CSP
  - `Cache-Control: private, no-store`
  - `X-Robots-Tag: noindex`

  The dashboard fetches it with the token and shows it from a `blob:` URL, which the existing CSP `img-src` already allows.
- **Rate limits.** Screenshots inherit the send limits, plus 5 per member per day and 200 stored club-wide.

## Privacy

**Captured:** category; text (cleaned of control, zero-width and direction characters); the context fields above; the author (from the session); status; timestamps; the optional screenshot without metadata.

**Not captured, and dropped if sent:**
- PINs, salts, session tokens and auth headers;
- private or table chat;
- cards, hands, chips, points and anything else from gameplay;
- other members' data;
- the raw user-agent string;
- IP address;
- any client-supplied `id`, `uid`, `status`, `version` or extra field.

`test/t_feedback.js` sends all of these and asserts on the stored record.

**Not logged.** `server/feedback.js` has no `console` calls, and the HTTP layer does not log bodies. The test captures the server's stdout and stderr and asserts that no feedback text appears.

**No third parties.** The diff adds no new origins and no dependencies, and the CSP is unchanged. `scan_csp` passes in both modes with the Hub present.

## Tournament safety (criterion 8)

- `server/feedback.js` has no timers, intervals or broadcasts. It does not require `club` or `engine`, and touches no table or engine code path. The test checks the source for this.
- Sending feedback produces **no** WebSocket message. The test watches a connected member while another member sends, using a club broadcast as a positive control.
- The only broadcast added is the owner's `feedbackOn` toggle, which reuses the existing `broadcastClub()` exactly as the `clubs` switch does.
- At the table, the Feedback button lives in the chat sheet header (an overlay), so the table header and felt are untouched. `t_mobile_ux` table-area sizes and NOTE lines at every viewport are identical to the base `c4445ed` run.

  An earlier draft put the button in the table header, which cost 15 to 19 px of table height at 320, 360 and 390 px wide. It was moved because of that.
- Screenshot parsing is a single linear pass over at most about 100 KB, bounded by the body cap.

## Every change to existing code (criterion 10)

**`server/index.js`**
1. `require('./feedback')`.
2. `...feedback.api` spread into `api`, adding four new names: `fbSend`, `fbList`, `fbSet`, `fbDelete`.
3. Body limit: `/api/fbSend` gets 150,000. Every other path is unchanged.
4. A new GET route `/fbshot/<id>`, placed before static files. It does not match any existing path.
5. Two fields added to the `club` payload's `features`: `feedback` and `feedbackLocked`.
6. A new WS case `feedbackOn`, owner-only through the existing `own()`, writing `settings.feedbackOff`.
7. The member-removal case also calls `feedback.removeUser(id)`, which deletes only `fblimit:<uid>`.

No auth, session, engine, store-format or club logic changed, and the clubs-closed gate is untouched. Feedback is deliberately not gated by it.

**`public/app.js`**
- A `FeedbackHub.init(...)` block after `BizClub.init`.
- `FeedbackHub.sync()` on each club update.
- An empty `<div id="fbAdmin">` in `directorHTML()`, mounted after render.

**`public/business.js`** One getter `seg()`, exposing whether Business or Opportunity is showing (read-only).

**`public/index.html`** The `<script src="/feedback.js">` tag. It is an external file, not inline.

**`public/style.css`** Rules appended at the end, all prefixed `fb-` or `#fbBtnLobby`, plus `#lobbyBody` bottom padding at 600 px and below so the floating button never hides the last item.

**`package.json`** `node test/t_feedback.js` added to the `npm test` chain. No dependency change.

## UI

**Members**
- **Phones (600 px and below):** a round Feedback button, 46 px, floats at the lower right of the lobby. It covers Home, Leaderboard, Learn, Business and Opportunity. It does not go in the top bar because the name chip needs that space; `t_mobile_ux`'s name check still passes.
- **Wider screens:** a 44 px "Feedback" pill in the top bar.
- **At a table:** Chat, then the 44 px Feedback button in the chat header.
- **The sheet:** visible "Type" and "Your feedback" labels; Bug, Idea and UX buttons; a character counter; an optional screenshot with a preview and Remove; inline text errors with `role="alert"`; Send; then a "Thank you!" state with `role="status"`. Escape or a tap outside closes it.

**Owner (Director tab)**
- A "Feedback" card with the open/close switch and counts per status.
- Type and Status filters with visible labels, and Refresh.
- Each note shows: type pill, status select, text (rendered with `textContent`), author, time, section, version, device and viewport, plus "View screenshot" and "Delete" (asks first).

All targets are at least 44 px, which the UI test asserts at 320 and 390.

## Tests and results (on the delivered commit)

- **`test/t_feedback.js`**, now in `npm test`, covers:
  - auth for every endpoint;
  - refusals carry no data;
  - submit;
  - validation (type, empty, too long at 2001, 100 KB body, newline flood, malformed JSON);
  - stored-XSS kept inert;
  - owner list, filters, counts and status workflow;
  - members cannot list, read, update or delete (including with a valid id);
  - privacy (forged and extra fields dropped, nothing sensitive stored, no ids in the list);
  - store key growth limited to feedback keys;
  - rate limit, which also survives a restart;
  - screenshots: wrong magic bytes, PNG, truncated, no frame, oversize, over the body cap, metadata stripped, headers, and 404 for non-owners, the sender, no token and bad ids;
  - per-day and club-wide screenshot caps;
  - delete, persisted across a restart;
  - full list identical after a restart;
  - no broadcast on send (with a positive control);
  - no timers or engine imports;
  - the owner toggle (members cannot flip it; survives a restart);
  - `FEEDBACK=off` (404 everywhere; data kept);
  - nothing logged;
  - a removed member: signed out, feedback kept as "Removed member", limit record removed.
- **`test/ui/t_feedback_ui.js`** (Chromium, 320×640 and 390×844) covers:
  - button size and position;
  - the name in the top bar is not cut;
  - 44 px targets and visible labels in the sheet;
  - errors and Send stay on screen;
  - screenshot attach (a real PNG shrunk to JPEG);
  - send and the thank-you state;
  - the Business note is tagged Business;
  - a markup payload renders as text and never runs;
  - a member gets 403 on the inbox API;
  - the owner, from a practice table, uses Chat then Feedback, and the note is tagged Poker;
  - inbox filters by type and status;
  - status change;
  - screenshot opens from a blob URL;
  - a plain link gets 404;
  - delete;
  - the close switch hides members' buttons live and refuses sends, then reopens;
  - zero page errors, console errors, failed requests or CSP violations.
- **Results:** `npm test` exit 0. `t_welcome`, `t_mobile_ux`, `t_table_small`, `t_registration`, `t_bizsearch` and `t_feedback_ui` all exit 0. `scan_csp` exits 0 with both SIMD and `--no-simd`. The exact per-suite lines are in the delivery message.
- **Evidence:** `docs/evidence/r2/feedback/` holds JPEGs of:
  - the lobby;
  - the sheet empty and filled;
  - the thank-you state;
  - the table sheet;
  - the inbox, filtered, and closed;
  - the screenshot viewer.

  Each is at 320 and 390 where applicable.

## Risks and notes

- **Memory.** The store keeps everything in memory. Screenshots are bounded at 200 × about 100 KB, roughly 20 MB worst case, and text is bounded by the per-member limits. Deleting resolved notes frees space; there is no automatic retention or expiry yet.
- **Floating button.** On phones the lobby button floats over content. `#lobbyBody` has bottom padding so the last item can always scroll clear, but mid-page content passes under the button while scrolling.
- **The owner sees members' notes in full.** Members are told this in the sheet ("Only the club director reads this").
- **No notification.** The owner is not notified of new feedback (no push, by design: no broadcasts). They see counts when they open the Director tab.
- **Viewport size.** `vw`/`vh` go slightly beyond Muse's "device class" list. They are stated here so Muse can rule on them, and can be dropped with a two-line change.
- **Commit-SHA version.** Version is empty locally (no `RENDER_GIT_COMMIT`); on Render it is the deploy's commit.

## Deferred

- Retention or auto-expiry of resolved notes.
- Owner notification of new feedback.
- Owner replies to the member.
- Members seeing their own past notes.
- CSV export.
- Screenshot capture of the page itself (the member picks an image from their photos).
