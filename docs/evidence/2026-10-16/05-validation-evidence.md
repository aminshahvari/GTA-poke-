# 05. Free-text validation: what the server blocks and what it does not

Labels: **IMPLEMENTED** (in code at `a3c67e9`), **TESTED** (probed now by `scripts/validation-probe.js`), **PROPOSED**, **NOT VERIFIED**.

## 1. Plain statement

**The server blocks** (HTTP 400, "Links and web addresses are not allowed in ...") in the Opportunity Club fields `oppSave.title`, `oppSave.details`, `oppSave.area` (area: code read, not probed), `oppRequest.message` and the share note `oppReply.note`:
- anything with a URL scheme followed by a character (`https://x.com`, `http://example.org/page`, and also `hxxp://...`, `hxxps://...` because any `letters://` counts as a scheme),
- anything starting with `www.`,
- a bare domain ending in one of **27 listed endings**: `com net org io co ca us uk me ly app dev info biz xyz link site online shop store page gl gg tv to ru cn` (case-insensitive, so `EXAMPLE.CA` is blocked),
- an email address **only when** its domain ends in one of those endings (`a@b.com` is blocked because `b.com` is a bare domain; it is not detected as an email).

**The server does not block:**
- **phone numbers in any format** (`416-555-0100`, `(416) 555 0100`, `+1 416 555 0100`, `4165550100`, spelled-out digits): there is no phone check on these fields at all;
- **email addresses on other endings** (`a@b.fr`, `a@b.de`) and written-out emails (`a at b dot com`, `a(at)b.fr`): there is no email check;
- **domains on other endings** (`example.fr`, `example.de`, `example.ai`, and every country code not in the list);
- obfuscated dots: `example[.]com`, `example . com`, `example dot com`, and Unicode look-alike dots (U+3002 `。`, U+2024 `․`, U+FF0E `．`; NFC normalization does not turn them into `.`);
- a scheme with nothing after it (`http://` at the end of the text);
- **anything in Business Club `bizSave.description` and `bizSave.services`**: those fields have no link, email or phone rule (by design the business profile has its own website/email/phone fields; the free text is not filtered).
- the report note (`oppReport.note`) explicitly allows links (`noLinks: false`, `server/opportunity.js:256`), so a reporter can paste the offending link for the director.

**UI warnings are not enforcement.** The create form says "No links, phone numbers or emails in the listing" (`public/opportunity.js:264`). The server enforces only the link part, and only partly. Phone numbers and most emails are accepted.

## 2. The code (IMPLEMENTED at `a3c67e9`)

| What | Where |
|---|---|
| The link pattern | `server/opportunity.js:54` (`const LINK = /\b(?:[a-z][a-z0-9+.-]*:\/\/\|www\.)\S\|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com\|net\|org\|...\|ru\|cn)\b(?![.-]?\w)/i`) |
| Applied to every Opportunity text field unless `noLinks: false` | `server/opportunity.js:55-61` (`text()`); first runs Business Club's cleaner `business.validate.text` (NFC, strips control/zero-width/direction characters, collapses spaces, `server/business.js:42-50`) |
| Fields using it | `oppSave` title/details/area `server/opportunity.js:145-148`; `oppRequest` message `:212`; `oppReply` note `:231`; `oppReport` note with `noLinks: false` `:256` |
| Business Club description/services: length and cleaning only, no content rule | `server/business.js:155-156` → `text()` at `:43-50` |
| Business Club structured fields (separate, intended for contact data) | website `server/business.js:52-61`, email `:74-78`, phone `:79-84` |
| Share-contact email/phone (the poster's chosen contact) validated as email/phone | `server/opportunity.js:231` → `business.validate.email/phone` |

## 3. Probe results (TESTED now)

`scripts/validation-probe.js` started a local server at `a3c67e9` (fake staging seed), raised the per-member write limits with the app's own environment knobs (`OPP_DAY_MAX`, `OPP_REQ_HOUR_MAX`, `OPP_WRITE_MAX`, `BIZ_SAVE_MAX`) so only validation decides, and sent each input (embedded in a short sentence, see `raw/validation-matrix.json` for the exact strings) to six fields. Every request and response is in `raw/validation-probe.json`. Output (`logs/validation-probe-run.log`):

| Input | oppSave.title | oppSave.details | oppRequest.message | oppReply.note | bizSave.description | bizSave.services |
|---|---|---|---|---|---|---|
| url: `https://x.com` | BLOCKED (400 link) | BLOCKED (400 link) | BLOCKED (400 link) | BLOCKED (400 link) | accepted | accepted |
| url: `http:// (scheme, nothing after)` | accepted | accepted | accepted | accepted | accepted | accepted |
| url: `http://example.org/page` | BLOCKED (400 link) | BLOCKED (400 link) | BLOCKED (400 link) | BLOCKED (400 link) | accepted | accepted |
| url: `www.example.com` | BLOCKED (400 link) | BLOCKED (400 link) | BLOCKED (400 link) | BLOCKED (400 link) | accepted | accepted |
| url: `example.com` | BLOCKED (400 link) | BLOCKED (400 link) | BLOCKED (400 link) | BLOCKED (400 link) | accepted | accepted |
| url: `example.fr` | accepted | accepted | accepted | accepted | accepted | accepted |
| url: `example.de` | accepted | accepted | accepted | accepted | accepted | accepted |
| url: `example.ai` | accepted | accepted | accepted | accepted | accepted | accepted |
| url: `EXAMPLE.CA` | BLOCKED (400 link) | BLOCKED (400 link) | BLOCKED (400 link) | BLOCKED (400 link) | accepted | accepted |
| url: `bit.ly/abc` | BLOCKED (400 link) | BLOCKED (400 link) | BLOCKED (400 link) | BLOCKED (400 link) | accepted | accepted |
| url: `hxxp://example[.]com` | BLOCKED (400 link) | BLOCKED (400 link) | BLOCKED (400 link) | BLOCKED (400 link) | accepted | accepted |
| url: `hxxps://example.com` | BLOCKED (400 link) | BLOCKED (400 link) | BLOCKED (400 link) | BLOCKED (400 link) | accepted | accepted |
| url: `example[.]com` | accepted | accepted | accepted | accepted | accepted | accepted |
| url: `example . com (spaces)` | accepted | accepted | accepted | accepted | accepted | accepted |
| url: `example。com (U+3002 ideographic full stop)` | accepted | accepted | accepted | accepted | accepted | accepted |
| url: `example․com (U+2024 one dot leader)` | accepted | accepted | accepted | accepted | accepted | accepted |
| url: `example．com (U+FF0E fullwidth full stop)` | accepted | accepted | accepted | accepted | accepted | accepted |
| url: `example dot com` | accepted | accepted | accepted | accepted | accepted | accepted |
| email: `a@b.com` | BLOCKED (400 link) | BLOCKED (400 link) | BLOCKED (400 link) | BLOCKED (400 link) | accepted | accepted |
| email: `a@b.fr` | accepted | accepted | accepted | accepted | accepted | accepted |
| email: `a@b.de` | accepted | accepted | accepted | accepted | accepted | accepted |
| email: `a at b dot com` | accepted | accepted | accepted | accepted | accepted | accepted |
| email: `a(at)b.fr` | accepted | accepted | accepted | accepted | accepted | accepted |
| phone: `416-555-0100` | accepted | accepted | accepted | accepted | accepted | accepted |
| phone: `(416) 555 0100` | accepted | accepted | accepted | accepted | accepted | accepted |
| phone: `+1 416 555 0100` | accepted | accepted | accepted | accepted | accepted | accepted |
| phone: `4165550100` | accepted | accepted | accepted | accepted | accepted | accepted |
| phone: `four one six five five five zero one zero zero` | accepted | accepted | accepted | accepted | accepted | accepted |
| control: `plain text (control)` | accepted | accepted | accepted | accepted | accepted | accepted |

29 inputs × 6 fields = 174 probes; 36 rejected (9 inputs × 4 Opportunity fields); 0 rejected in Business Club free text. Every rejection was the link rule (`400 Links and web addresses are not allowed in ...`).

## 4. Assessment

- The Opportunity Club's privacy model (members reach each other through a request; the poster chooses what to share, `01-opportunity-acceptance.md` S4) **does not depend on** this filter: contact data is exchanged only through `oppReply`, which only the poster can call. The filter reduces casual sharing of links in listings; it is **not** a guarantee that listings contain no contact data. A member can still type a phone number or an `.fr` email into a listing, and the server accepts it. TESTED.
- The UI text "No links, phone numbers or emails in the listing" (`public/opportunity.js:264`) promises more than the server enforces. Either the text or the server should change. Decision for the owner; not changed here.
- Business Club description/services accept links, emails and phones. That may be intended (it is the member's own business profile, visible to signed-in members only, `noindex`), but it should be a documented choice. NOT VERIFIED as intended: the BC1 report does not state it either way.

## 5. PROPOSED options (not implemented)

1. Add a phone pattern (7 to 15 digits allowing spaces, dots, dashes, parentheses and a leading `+`) and an email pattern (`\S+@\S+\.\w{2,}`) to the Opportunity `text()` check, independent of the domain ending.
2. Replace the 27-ending list with "any 2 to 24 letter ending" (or the public suffix list) for bare domains, accepting some false positives such as "Mr.Smith" style typos, or keep the list and add the most common country codes (`fr de it es nl be ch au in br mx ...`).
3. Before matching, map look-alike dots (U+3002, U+FF0E, U+FF61, U+2024, U+2E33) to `.` and collapse `[.]`, `(.)`, ` dot ` patterns.
4. Or change the UI text to say what is true: "Links are not allowed. Please don't put phone numbers or emails in the listing; share them privately when someone contacts you."
5. Tests to add: a table-driven test like `scripts/validation-probe.js` inside `test/t_opportunity.js` with the expected outcome per row.

## 6. How to re-run

```
node docs/evidence/2026-10-16/scripts/validation-probe.js
```
