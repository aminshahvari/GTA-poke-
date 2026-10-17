# R2 · F1 — fixes for Muse's three probe gaps (Oct 17)

Claude, 2026-10-17, branch `r2-dev`. Scope: only `server/content.js` (detection) and `test/t_content.js` (regressions). No other feature touched; no existing rule weakened (all 201 earlier probes still pass with the same verdict). F1 verdict is Muse's, not Claude's.

## Gaps reported by Muse, reproduced first on `a097739`
| Input | Before | After |
|---|---|---|
| `۴۱۶-۵۵۵-۰۱۰۰` (Persian digits), `٤١٦ ٥٥٥ ٠١٠٠` (Arabic-Indic) | allowed | phone |
| `416,829,5953`, `416, 829, 5953` | allowed | phone |
| `416-555-O1OO`, `4l6 555 OlOO`, `Call 416 555 OIOO` | allowed | phone |

## What changed (`server/content.js`)
1. **Unicode digits** (`digits()` in `prep()`): every Unicode decimal digit (`\p{Nd}`: Persian, Arabic-Indic, Devanagari, Bengali, …) is read as 0-9 by its position in its run of ten; Arabic decimal/thousands separators `٫ ٬` read as `. ,`. This runs on the copy used for detection only: the saved listing text is never changed (server test checks a Persian text is stored byte for byte).
2. **Comma-separated phones**: commas count as a phone separator. A comma run is still an ordinary number when it is thousands (`1,500,000`, `1,250.50`) or a list whose groups don't read like a phone; it is a phone only when it is 10-11 digits in at most 4 groups of 3+ digits (a leading `1` aside), e.g. `416,829,5953`, `1,416,829,5953`. Each comma piece is still checked alone (`10, 416 555 0100, 12` is a phone).
3. **Letters for digits** (`letterDigits()`, phone check only): `O o → 0`, `I l | → 1` inside a group that already has a digit (`O1OO`, `4l6`), or in a letters-only group of 2+ right next to a digit group across a phone separator (`555 OlOO`). Words on their own (`Oil`, `OIL and gas`, `lol 5 stars`, `I/O boards`) are untouched.
4. **Reference numbers** (asked for in the owner's brief; these were false positives before too): a number right after order / invoice / ref / SKU / model / ticket / tracking / … (optionally `no.`, `#`, `:`) is allowed **unless** it is written like a North American phone (`555-0100`, `416-555-0100`, `4165550100`, 7 plain digits) or has spaces/brackets, so `Ref: 416 555 0100` is still a phone.
5. Persian-calendar dates `1403/07/26` allowed (same rule as other dates: same separator, valid month/day).

## Regression tests (`test/t_content.js`)
- Matrix: 201 → **261 probes** (51 phones, 113 allowed). New: 10 other-script digit phones, 6 comma phones, 11 letter-substitution/reference phones; 33 legitimate texts (Persian/Arabic prices, years, ranges, Persian date; thousands, sq ft, prices, size/order/room lists, addresses, postal codes, PO box, order/invoice numbers, `Oil`/`OIL`/`I/O`, social media marketing text).
- Server: `bizSave` refuses the 4 bypass forms in `services` with the phone message; a mixed Persian/English legitimate text is accepted and saved unchanged.
- Old code against the new test: **25 matrix failures** (`docs/evidence/r2/f1-gaps-old-code.log`). New code: pass.
- Full `npm test`: exit 0 (`docs/evidence/r2/f1-gaps-npm-test.log`).

## Remaining known limits (not fixed; for Muse to judge)
- Still blocked (false positives): plain 7-digit reference numbers (`SKU 1234567`, treated as a local phone); 10-digit 3-3-4 comma lists (`Rooms 101, 102, 1003`); lists without commas reaching 7+ digits (`Sizes 10 12 14 16`); a long number with no `$` or unit (`Budget 1500000`).
- Still allowed (bypasses): other look-alikes for digits (`S→5`, `B→8`, `Z→2`); a letters-only group not next to a digit group (`OIOO-OIOO-OIOO`); digits split by words or emoji; number words in other languages (Persian `چهار`, French `quatre`); a phone split across two fields; images. Reference-word cover for non-NANP layouts (`Order 4471-2290` style written to hide a phone).
- If Muse finds more gaps, Claude will list them separately before widening scope (owner instruction).
