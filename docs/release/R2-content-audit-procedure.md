# R2 — production content-audit procedure (for Muse's independent review)

Claude, 2026-10-17. **Not run. Claude has not accessed and will not access production data.** This is the procedure for Muse's review; running it needs the owner's separate authorization.

## Purpose
Before Business Club or Opportunity Club opens to real members, find records saved before the F1 contact rule existed whose text would now be refused (links, emails, phones, social handles). Gate: Muse R2 audit condition 3 / staging acceptance condition 3.

## What the script does (`scripts/content-audit.js`)
- Reads only keys `opp:*` (listings: title, details, area), `oppreq:*` (request message) and `biz:*` (name, full name, job title, industry, description, services, area). The dedicated contact fields (website, email, phone, Instagram, address) are not checked: they are meant for contact and are shown only when the member switches them on.
- Runs the same `find()` as the server (`server/content.js`).
- Prints one line per finding: `<key>\t<field>\t<kind>` (e.g. `opp:o3f…\tdetails\tphone`), then a count. **It never prints member text.**
- Changes nothing. `--db` mode sends exactly three statements: `begin transaction read only`, `select k, v from kv where k like 'opp:%' or k like 'oppreq:%' or k like 'biz:%'`, `rollback` (asserted in `test/t_content.js`).

## When
After Release 2 code is on production (a separate owner authorization) and **while the clubs are still closed** (Director switch off). Production today (`d00b592`) does not contain the script. Clubs being closed means no new pre-rule text can appear meanwhile, and every new save goes through the rule.

## How (owner or Muse, in the Render dashboard; nothing to install)
1. Render → `gta-poker` → Shell (the paid instance supports it). This runs inside the production service, which already has `DATABASE_URL`; no IP allowlist change, no new credentials, no export file.
2. Run: `node scripts/content-audit.js --db > /tmp/audit.txt; cat /tmp/audit.txt`
3. Copy the output (keys, fields, kinds only) into the release thread. Delete `/tmp/audit.txt` (`rm /tmp/audit.txt`).
4. If the output is `0 field(s) to review`, the gate is closed.

## Deciding each finding (owner)
For each line, the owner chooses one: ask the member to edit (the next save goes through the rule), hide (the existing moderation hide), or delete. Claude proposes no automatic rewrite or deletion. Decisions are recorded in the thread; Muse verifies a re-run shows 0 (or only owner-accepted lines).

## Safety notes for review
- Read-only transaction + rollback; the only SQL text is constant (no user input in SQL).
- Uses the same `pg` connection settings as the server (`PGSSL`), one connection, closed at the end.
- Output contains record keys (pseudonymous ids like `opp:…`, `biz:u…`); no names, text or contact details.
- Alternative (not recommended): running on a backup copy outside Render would move real member data out of production; avoid unless the owner asks.

## Evidence
`test/t_content.js`: file mode finds the planted bad records and leaves the file byte-identical; `--db` mode sends only the three statements above and prints no member text.
