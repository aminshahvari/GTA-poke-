# R2 F1 — remaining phone-number separators (owner GO, Oct 17 evening)

Scope: `server/content.js` (detection copy only) + `test/t_content.js`. Base `7ab1b4f` (Muse PASS). Not deployed anywhere.

## Rule
Between digit groups (a digit on one side, a digit, `(`/`)` or a letter-digit O o I l | on the other):
- Unicode hyphens/dashes/minus `‐ ‑ ‒ – — ― − ﹘` (and `﹣ －` via NFKC), underscore `_` (and `＿`), tilde `~ ∼ 〜` (and `～`) read as **`-`**, so the existing dash rules decide (ranges, dates, Persian dates, ZIP+4, reference numbers).
- Asterisk `*` `∗` `✱` (and `＊`) reads as **`,`**, like the bullets, so the comma rules decide (dimensions 1500*2000 mm, 120*60*75, lists stay allowed).
- Done before letter-for-digit mapping, so `416_555_O1OO` is caught. Stored text is never changed (server test saves a separator-heavy Persian/English string and reads it back byte for byte).

## Tests
- `test/t_content.js`: 282 → **353 probes** (35 new phones incl. full-width, Persian digits, `+1`, O1OO, parentheses, mixed separators; 36 new allowed: ranges, ratings, dimensions, prices, dates, Persian text, filenames, code-ish names). Server: `oppSave` details/title (create + edit), `oppRequest` (2), `bizSave` services (6 new). New code: pass.
- Old code (`7ab1b4f`) against the new test: **30 matrix failures** — `docs/evidence/r2/f1-separators-old-code.log`.
- `npm test`: all suites pass.

## Known, not changed (same as the accepted `-` behaviour)
- `Sizes 10_12_14_16`, `Rooms 101_102_103` are refused, exactly like `Sizes 10-12-14-16` today (8+ digits in dash groups).
- `IMG_20241017.jpg` is refused today already (8-digit run); unchanged.
- **Found by the mobile run, outside this scope:** a comma phone right after another number is accepted: `We tutor grades 6-12. 416,829,5953`, `$1,500. 416,829,5953` (the two numbers merge into one run that is not phone-shaped). `Ages 6-12. Call 416,829,5953` is caught. Needs its own small fix + GO.
