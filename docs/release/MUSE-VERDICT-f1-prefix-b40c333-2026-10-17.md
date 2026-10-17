# Blindrise R2 — F1 Final Independent Audit: preceding-number fix `b40c333`

**Auditor:** Muse / Marlowe — 2026-10-17
**Delivery:** commit `b40c333` on branch `r2-f1-prefix`, based on `r2-dev` at `523a284` (the audited `6f57c75` is unchanged in its ancestry)
**Closes:** the condition in `MUSE-ADDENDUM-separators-bypass-2026-10-17.md` (filed `247f7a3`) — option 1, the fix

## Verdict: PASS — the preceding-number bypass is closed; F1 is complete

**Scope — verified.** The commit changes only `server/content.js` (one hunk inside `phone()`), `test/t_content.js`, and docs/evidence. The mechanism matches the handoff: the whole run is judged exactly as before; additionally, every shorter stretch between whitespace-containing separators is judged through the same `ok()` context checks, counting only when NANP-shaped or `+`-leading. No poker, authentication, invitation, or client code is touched; Welcome UI and production are on separate lineages and unaffected.

**Bypass battery (Muse's own, 16 constructions) — all REFUSED:** the original reports (`grades 6-12. 416,829,5953`, `$1,500. 416,829,5953`, `Order 55. …`, no-period, bullet form); the wider escapes Claude disclosed (`Since 2019 416-829-5953`, `Since 2019. 416 829 5953`, `Sizes 10, 12, 416,829,5953`); separator variants after prefixes (underscore, tilde, asterisk, minus); parenthesized `(416)` and `+1` forms after prefixes; a Persian-digit phone after an English prefix.

**Legitimate-content battery (Muse's own, 15 texts) — all ALLOWED,** including the handoff's guard cases (`Cap 1500 2000 2500 units`, `$1 500 000 2 bedrooms`), invoices with decimals, sold-stats lines, `Est. 2019.` business text, ratings, and `Apt 416, 829 Yonge Street` (address numbers are not refused). **Byte preservation:** `check()` returns legitimate number-heavy Persian/English content byte-for-byte.

**Suites:** `t_content` **PASS at 408 probes** (129 phones, 182 allowed), reproduced by Muse. **Control:** the new tests against `6f57c75`'s `content.js` produce **exactly 23 failures** — matching the handoff's claim and its filed log. **Full `npm test` at `b40c333`: exit 0**, all suites.

**Remaining risks (all pre-existing, disclosed by Claude, verified consistent):** non-North-American numbers after a prefix are caught only via the whole-run path (F1 targets NANP by design); spelled-out digits with commas (`four one six, 829, 5953`) are accepted, as before; the whole-run refusal `Grades 6-12. 1500 students` remains (safe direction). None of these block: F1 has now closed, across four audited deliveries, the plain, comma, bullet, dash/underscore/tilde/asterisk, letter-swap, word-form, Persian/Arabic-digit, and preceding-number families.

**Standing R2 conditions unchanged** (not F1 items): the owner's real-device pass before any production consideration, and the read-only `scripts/content-audit.js` run on production data before either club opens.

## Boundaries

Nothing merged or deployed: `r2-f1-prefix` is a side branch off `r2-dev`; staging remains on `c0daed4`; production untouched. Any merge of this branch into the R2 line, staging update, or production step needs the owner's separate authorization.
