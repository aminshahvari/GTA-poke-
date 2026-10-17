# R2 F1 — a number written just before a phone (owner direction, Oct 17 19:32 UTC)

Branch `r2-f1-prefix`, based on `r2-dev` `247f7a3` (Muse addendum) (contains the audited `6f57c75`, unchanged). Security only; the mobile UI work is on `r2-mobile-ux`. Not deployed.

## The gap
`We tutor grades 6-12. 416,829,5953` was accepted: the phone regex joins `6-12. 416,829,5953` into one run (". " is an allowed separator), and the run as a whole is not phone-shaped (comma rule, year rule, etc.). Same for `$1,500. 416,829,5953`, `Since 2019 416-829-5953` (year rule), `Since 2019. 416 829 5953`, `Sizes 10, 12, 416,829,5953`, and the separator variants from `6f57c75`.

## Change (`server/content.js`, `phone()` only)
1. The whole run is judged exactly as before (so nothing that was refused before is now accepted; checked old vs new on 24 edge cases incl. `416. 829. 5953`, `4165. 550199`).
2. In addition, every shorter stretch of the run between whitespace-containing separators is checked, but only counts when it is written like a North American phone (`NANP()`: 3-3-4, 1-3-3-4, 3-4, 10/11 or 7 plain digits) or starts with `+`, and it still goes through `ok()` with its own before/after text.
   So `6-12. | 416,829,5953` → `416,829,5953` is a phone; `Cap 1500 2000 2500 units` or `$1 500 000 2 bedrooms` adds nothing (no stretch is phone-shaped).
3. Detection copy only; stored text untouched (server test saves a number-heavy English/Persian string and reads it back byte for byte).

## Tests
- `test/t_content.js`: 353 → **414 probes** (+38 phones incl. every example in Muse's addendum `247f7a3`: prefixes . , ; / : space, years, prices, ratings, lists, suffix numbers, (416), 1-416, +1, Persian digits, O1OO, bullets, _ ~ * − separators; +23 allowed number-heavy business texts). Server: `oppSave` details/title, `oppRequest`, 3 more `bizSave` refusals, byte-for-byte save.
- Old code (`6f57c75`) against the new test: **26 matrix failures** (`docs/evidence/r2/f1-prefix-old-code.log`); new code passes.
- `npm test`: all suites pass.

## Known, unchanged
- Non-North-American numbers after a prefix (e.g. `Since 2019 44 20 7946 0958`) are only caught when the whole run is caught (as before); the new stretch check is NANP/`+` only, to avoid new false positives.
- `four one six, 829, 5953` (spelled digits + commas) is accepted, alone too; pre-existing.
- Pre-existing false positive kept as is: `Grades 6-12. 1500 students` (the whole run `6-12. 1500` has 7 digits).
