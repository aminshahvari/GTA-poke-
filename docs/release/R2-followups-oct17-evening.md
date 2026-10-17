# R2 follow-ups after Muse's staging acceptance (2026-10-17 evening)

Claude, branch `r2-dev`. Owner direction 18:16 UTC; Muse request `MUSE-REQUEST-f1-bullet-fix-2026-10-17.md`. Nothing deployed; staging stays on `c0daed4`; production untouched.

## 1. F1 bullet-separator gap — fixed (`server/content.js`, detection copy only)
- Bullet-like characters between digit groups — U+2022 •, U+00B7 ·, U+2027 ‧, U+2219 ∙, U+22C5 ⋅, U+30FB ・, U+25E6 ◦, U+2043 ⁃ — are read as commas, after letter-for-digit mapping. So the existing comma rules decide: phone-shaped groups (`416•829•5953`, `1•800•555•0100`, `416 • 829 • 5953`, Persian digits with bullets, `416•555•O1OO`) are phones; lists and prices (`Sizes 10 • 12 • 14 • 16`, `Rating 4·5`, `2019 • 2020 • 2021`, `10:00 • 18:00`, `Pizza • 2 for $20 • 10% off`) are not. Stored text is never changed.
- Tests: `test/t_content.js` 261 → **282 probes** (11 new phones, 10 new allowed); server checks: bullet phone refused on `bizSave` services, on `oppSave` details (create) and title (edit), and in an `oppRequest` message. Old code (`c0daed4`) against the new test: **11 matrix failures** (`docs/evidence/r2/f1-bullet-old-code.log`). New code: pass.
- **Also noticed, NOT fixed (scope is this one gap, per Muse):** other separators still pass in the same way — Unicode hyphens/minus `416‐829‐5953` (U+2010), `416‒829‒5953` (U+2012), `416−829−5953` (U+2212), and `416_829_5953`, `416~829~5953`, `416*829*5953`. Same family; one more line of the same kind would close them. Owner/Muse decide.

## 2. PIN-field visual note — investigated and fixed (`public/app.js`, 1 attribute)
- Cause: the PIN input had no placeholder, while the Table-name input beside it shows "e.g. Sean"; on the dark form an empty field reads as a solid black block. Border and colours are identical (computed styles checked).
- Fix: placeholder "Your PIN" on sign-in, "Choose a PIN" on join/setup/reset. No behaviour change. Before/after: `docs/evidence/r2/pin-field/`.

## 3. Content audit — procedure + read-only `--db` mode
See `R2-content-audit-procedure.md`. `scripts/content-audit.js --db` reads production from the Render shell inside one READ ONLY transaction, prints keys/fields/kinds only. Tested with a recording fake pool. Not run against any real database.

## 4. Automated mobile package and human-only checks
See `R2-mobile-automation.md` (local run of the staging code with 9 independent mobile browser contexts).
