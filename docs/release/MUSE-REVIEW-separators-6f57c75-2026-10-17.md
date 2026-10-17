# Blindrise R2 — Final Security Re-Audit: separator-family fix `6f57c75`

**Auditor:** Muse / Marlowe — 2026-10-17
**Delivery:** commit `6f57c75fe7e3230de85df6b965dfa68de0be34e0` on `r2-dev` ("R2 F1: close the remaining phone separator family (dashes, _, ~, *)"), on top of Muse's bullet re-audit filing `137dac3` / Claude's `7ab1b4f`
**Owner authorization:** the one narrowly scoped F1 hardening fix approved by the owner 2026-10-17, following Muse's re-audit of `7ab1b4f`

## Verdict: PASS — the separator bypass family is closed

**Scope — verified.** The commit touches only `server/content.js` (+6/−1), `test/t_content.js`, and two docs files. No authentication, session, poker-engine, store/database, or client files changed. Full-suite behavior (below) confirms no functional drift outside the content filter.

**The change — verified by code read.** Detection copy only: a context-guarded fold maps Unicode hyphens/dashes/minus (U+2010–U+2015, U+2212, U+FE58), underscore and tildes (~, U+223C, U+301C) between digit groups to `-`, and asterisks (*, U+2217, U+2731) to `,`, before letter-for-digit mapping (so `416_555_O1OO` is caught). The guards require digit context on both sides, which is what keeps ranges and dates out. Stored text is never rewritten.

**Muse's independent probes (36) — all correct:**
- REFUSED (23): every dash codepoint above; `416_829_5953`; `416~829~5953` and the U+223C/U+301C tildes; `416*829*5953` and U+2217/U+2731 asterisks; mixed separators (`416_829-5953`, `416~829*5953`, bullet+underscore); `416_555_O1OO`; `+1_416_829_5953`; Persian digits with underscores; spaced underscores; `1*800*555*0100`.
- ALLOWED (13): `2019~2021`, `10~15` seat ranges, Persian-calendar `1403_07_26`, `1500*2000 mm`, `120*60*75 cm`, bullet size lists, `Rating 4·5`, `9–5` hours, the Persian price text «قیمت ۴۱۶ هزار دلار، فروش نقدی», `2-for-1 Tuesdays`, an order number, a planning range.
- **Byte preservation:** `check()` returns legitimate input byte-for-byte (re-verified directly on this commit).

**Regression — verified.** `t_content` PASS at **353 probes** (97 phones, 159 allowed; up from 282). Control: the new test file against `7ab1b4f`'s `content.js` fails (Claude's filed log: 30 failures) — the tests genuinely pin the new behavior. Full `npm test` at `6f57c75`: **exit 0**, all suites (server, security, chat, business, opportunity, clubs, CSP, evaluator/stress set).

**Standing notes.** F1 remains a heuristic filter — this closes every separator family identified across three audits (plain, comma, bullet, dash/underscore/tilde/asterisk, letter-swap, word-form, Persian/Arabic digits). The pre-open `scripts/content-audit.js` run on production data remains a standing R2 condition before either club opens, unchanged by this verdict.

## Boundaries

Nothing is deployed: staging remains on `c0daed4`, production untouched (`d00b592` line). This verdict is separate from the Welcome UI release (`49d9ece`) and does not interact with it — different lineages, different gates.
