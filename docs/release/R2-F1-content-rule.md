# R2-F1: contact-detail rule for Opportunity Club and Business Club text

Claude, 2026-10-17, branch `r2-f1` (from `r2-dev`). R2 backlog item 3. **Default taken: enforce server-side** (the owner can still choose copy-only instead). Clubs stay closed in production; no flag defaults changed; nothing in poker touched.

## Finding (auditor)

`server/opportunity.js:52-54` blocked links only with a scheme, `www.`, or a bare domain on a 27-TLD list. Phone numbers in every format and emails on unlisted TLDs went straight into listing text. Business Club free text had no rule at all. The listing form promised "No links, phone numbers or emails in the listing."

## The rule (`server/content.js`)

Member-written public text may not contain:

| Kind | Caught | Examples blocked |
|---|---|---|
| **Web address** | any scheme (`https://`, `ftp://`, `HTTP://`); `www.`; `mailto:` `tel:` `sms:` `whatsapp:` `skype:` `callto:`; IPv4; bare domains on **any** lowercase TLD (`joe.plumbing`) plus common TLDs in any case (`Example.COM`); IDN `xn--`; disguises `example dot com`, `example [.] com`, `example(.)net`, `example (dot) org`, `example . com`, full-width `ＥＸＡＭＰＬＥ．ＣＯＭ`, `example。com` | 32 probes |
| **Email** | `a@b.tld` (any TLD), spaced `jo @ example . com`, `(at)` `[at]` `{at}` `<at>`, plain `jo at example dot com` (unless the word before "at" is a common word like *us*, *me*, *home*), full-width `＠` | 11 probes |
| **Phone** | 7-15 digits written together or separated by spaces, `.`, `-`, en/em dash, `/`, `( )`; leading `+` always counts; digits written one by one (`4 1 6 5 5 5 …`), number words (`four one six …`), styled digits (`𝟒𝟏𝟔`, `④①⑥`) | 24 probes |

Social handles are **not** blocked: no UI copy promises it (open question below).

Detection works on a folded copy (NFKC + disguises undone); the saved text is exactly what the member typed after the existing cleaner. Error messages name the kind and the field, and say where contact goes instead, e.g.:

> Please remove the phone number from details. Members reach you through a private request, and you choose whether to share your contact details. For prices or ranges, write them like $1,500 or 2-3 weeks.

> Please remove the web address from services. Add it under Contact details instead, where you choose what members see. If it is not a web address, add a space after the period.

## Fields covered

| Endpoint | Field | Rule |
|---|---|---|
| `oppSave` create **and** edit (same code path) | `title`, `details`, `area` | full rule |
| `oppRequest` | `message` (private to the poster) | full rule; was links-only before. Contact goes through the poster's share step. |
| `oppReply` share | `note` | **links only** (unchanged): it is the consent step where the poster shares an email/phone, so "Or my office 416-555-0101 after 6" is fine |
| `oppReport` | `note` | none (unchanged): only the director reads it and it may quote the listing |
| `bizSave` (create = edit, one endpoint) | `name`, `fullName`, `jobTitle`, `categoryOther`, `description`, `services`, `area` | full rule |
| `bizSave` | `website`, `instagram`, `email`, `phone`, `address` | **unchanged**: the explicit contact fields, each with its own validator, shown to other members only when switched on ("Show to members") |

A refused save or edit stores nothing (verified: the listing and the profile read back unchanged).

## False-positive guards (all in the matrix as "allowed")

Prices `$1,500`, `$ 2 500 000`, `Around 1500000 dollars`, `1 500 000 views`, `12 500 000 budget`, `2.500.000`; years `Since 2019`, `2019-2023`, `2019 2020 2021`; dates `2026-10-17`, `17/10/2026`, `10.17.2026`; times `9:00-17:00`, `9.00-17.00`, `0900-1700`, `9am-5pm`, `24/7`; percentages `25% off`, `10%-20%`; quantities and ranges `10 years experience`, `2-3 weeks`, `1500-2000 sq ft`, `10000 - 20000`, `100-200-300 pieces`, `Room for 6-8 people`, `Model 3 2019 5000 km`; postal codes `M5V 2T6`, `90210`, `90210-1234`; addresses `Unit 12, 45 King St E`; prose with dots `Node.js, Vue.js and ASP.NET`, `e.g. U.S. clients`, `a.m. to p.m.`, `Ph.D.`, `resume.pdf`, missing spaces between sentences when the next word is capitalized (`this week.Thanks`), `the dot com era`, `polka dot dress`, `co-op`, `Meet at noon`, `good at Excel`, `@yourbusiness`.

How: unit/currency words before or after a number; a 4-digit year (1900-2099) in a non-final group; valid d/m/y dates; equal-length ascending ranges; time ranges; space/dot thousands groups with a 1-2 digit lead; ZIP+4; file-type endings and `ASP.NET`-style names; single-letter abbreviation chains; capitalized unknown endings treated as a sentence break.

**Known limits (accepted):** blocked although not a phone: number lists without commas that reach 7+ digits (`Sizes 10 12 14 16`, `Highway 401 400 404`, `150 000 000`), 7+ digit runs with no separators or currency (`Order 12345678`, `Budget 1500000`, `pi 3.14159265`); read as links: lowercase sentence joins (`the job.call me`, `st.catharines`), and the error tells them to add a space. Adding commas or `$` fixes the number cases. Not caught: letter-for-digit swaps (`416 555 O1OO`), number words split by commas, `example,com`, `example dot <unlisted TLD>`, vanity numbers (`1 800 FLOWERS`), non-Latin decimal digits (Arabic-Indic etc.). Member reports + director moderation remain the backstop.

## Copy changes (UI now promises exactly what is enforced)

- `public/opportunity.js` contact-request sheet: "Your phone and email are not shared." → "No links, emails or phone numbers here: *X* can reply by sharing their contact details with you." (the message is now checked).
- `public/business.js` profile form, under Service area: new note "Keep links, emails and phone numbers out of these. Add them under Contact details below, where you choose what members see." (Business Club previously promised nothing.)
- Listing form copy "No links, phone numbers or emails in the listing." unchanged: now true.

## Visibility (confirmed by `test/t_content.js`)

- Every `bizList/bizGet/bizFeed/bizMine/oppList/oppGet/oppMine/oppBadge` call: no token or a bad token → **401**, body leaks nothing; member → 200. Every answer (200/401/403) carries `X-Robots-Tag: noindex, nofollow, noarchive`.
- `/bizlogo/<uid>` without a token → 401 + noindex.
- Owner closes the clubs (`clubsClosedFor` in `server/index.js`): members get **403** + noindex on all eight endpoints and 404 on logos; the owner still reads them; reopening shows the same data.
- Only `contacts` the member switched on reach other members; phone and address stay private.
- Business/opportunity data is reachable only through `/api/biz*`, `/api/opp*` and `/bizlogo/` (no WebSocket or static path reads `biz:`/`opp:` keys).

## Existing stored records

Nothing is mutated. Records saved before the rule keep their text and are shown as before until edited (any edit must then pass). To find them, read-only:

```
psql "$DATABASE_URL" -Atc "select json_object_agg(k, v) from kv where k ~ '^(opp|oppreq|biz):'" > kv.json
node scripts/content-audit.js kv.json     # prints key, field, kind; changes nothing
```

(Or pass a local `DATA_FILE`.) The director can then hide or delete listings with the existing moderation tools, or ask the member to edit.

## Evidence

- `test/t_content.js` (added to `npm test` after `t_opportunity.js`, spawns its own server on a free port with `CLUBS_DEFAULT: 'on'`): 120 probes (32 links, 11 emails, 24 phones, 53 allowed); every covered field × {link, email, phone} on `oppSave` create and edit and on `bizSave`, with message wording checked; request message, share note and report note behaviour; audit script; visibility as above.
- Full `npm test` green (t_server needed one rerun: the known flaky "table chat not delivered" check).
  `content rule test passed (120 probes: 32 links, 11 emails, 24 phones, 53 allowed; server fields and visibility)`

## Open questions for the owner

1. Should social handles (`@name`, "IG: name", "DM me on insta") also be blocked in listing/profile text? Not promised today, so not enforced.
2. The contact-request message now blocks the *requester's* own contact details too (it already blocked links). Keep, or allow requesters to volunteer their own phone/email?
3. Business name is checked too: a business literally named "Example.com" or with a phone-number name would need to drop it from the name field. OK?
4. Pre-rule records: run the audit before opening the clubs and decide hide/delete/ask-to-edit per record.
