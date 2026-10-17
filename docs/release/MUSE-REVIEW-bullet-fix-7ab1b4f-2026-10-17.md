# Blindrise R2 — Re-audit of `7ab1b4f` (bullet-separator fix + PIN placeholder + content-audit tooling)

**Auditor:** Muse / Marlowe — 2026-10-17
**Delivery:** commit `7ab1b4fb12573d3a809c1db3a9ed9e521b455757` on `r2-dev` ("R2: F1 bullet separators, PIN placeholder, read-only content audit")
**In response to:** `MUSE-REQUEST-f1-bullet-fix-2026-10-17.md` (filed `c2178cd`)

## Verdict: PASS — the requested gap is closed

**Bullet fix (`server/content.js`, +5/−1) — PASS, independently reproduced:**
- Detection-copy only: bullet-like separators (U+2022, U+00B7, U+2027, U+2219, U+22C5, U+30FB, U+25E6, U+2043) between digit groups are folded to commas before the existing phone rules run. `check(value, field)` re-verified by Muse to return the input byte-for-byte — stored member text is never rewritten.
- Muse's own probes on the new code (17): all bullet phone forms REFUSED — `416•829•5953`, spaced `416 • 829 • 5953`, every bullet codepoint tested, Persian digits with bullets, bullet + letter-swap `416•555•O1OO`, `1•800•555•0100`. All legitimate-content guards ALLOWED: size lists (`10 • 12 • 14 • 16`), `Rating 4·5`, year lists, opening times, a pizza-deal line, the Persian price text, text bullets with no digits.
- Suite: `t_content` PASS at 282 probes (62 phones, 123 allowed). Control: the new tests against `c0daed4`'s `content.js` fail with exactly the 11 bullet matrix failures Claude's evidence log records — Muse reproduced the failure mode independently.
- Full `npm test` at `7ab1b4f`: exit 0, all suites.

**PIN placeholder (`public/app.js`, 1 attribute) — PASS.** Placeholder only ("Your PIN" / "Choose a PIN"); no behavior change. This closes the MINOR visual note from Muse's staging acceptance (§7).

**Content-audit tooling (`scripts/content-audit.js --db`) — PASS as tooling; NOT RUN.** Code and tests confirm exactly three statements (begin READ ONLY → select keys → rollback), output limited to keys/fields/kinds, never member text. Running it anywhere remains behind the owner's separate authorization and the procedure's own timing (after R2 is on production, clubs still closed). Claude has not run it against any real database — correct.

## Remaining item (owner decision)

Claude disclosed, and Muse verified on the new code, that the same bypass family extends beyond bullets — all still ALLOWED (LOW, same class): Unicode hyphens/minus `416‐829‐5953` (U+2010), `416‒829‒5953` (U+2012), `416−829−5953` (U+2212), and `416_829_5953`, `416~829~5953`, `416*829*5953`. Claude stayed inside the requested scope and reported them instead of fixing silently — the right call. Muse's recommendation: close the whole family with the same one-line treatment in one more follow-up commit (re-audit is cheap), rather than accepting a known list of working bypasses. Owner decides: extend, or accept as known LOW before Opportunity Club opens.

## Minor

`docs/release/R2-followups-oct17-evening.md` §4 references `R2-mobile-automation.md`, which is not in the tree at `7ab1b4f` — dangling reference; Claude to add the file or fix the pointer. No code impact.

## Boundaries

Nothing in `7ab1b4f` is deployed: staging remains on `c0daed4`, production untouched. Any staging update with this fix needs the owner's separate authorization.
