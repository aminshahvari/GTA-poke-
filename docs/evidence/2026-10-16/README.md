# Blindrise audit evidence package, October 16, 2026

Independently re-runnable evidence for an external review of Blindrise (private, invite-only, free poker club web app: Node HTTP + `ws`, vanilla JS PWA, key-value store kept in memory and persisted to a Postgres `kv` table or a JSON file; hosted on Render).

- **Branch:** `audit-evidence-2026-10-16` (created from `origin/staging` at `a3c67e9`). Only `docs/evidence/2026-10-16/` is added.
- **App code audited:** staging tip **`a3c67e9`**. App code on this branch is byte-identical to it: `git diff a3c67e9 -- . ':!docs'` is empty (every script also prints `appCodeIdenticalToRef: true`).
- **Production for comparison:** `main` at **`4d1be3b`** (not changed, not deployed, not contacted).
- **Nothing in this package changes app code, databases, Render, staging or production.** All servers are local processes with fake seed data and throwaway data files.

Labels used in every file: **IMPLEMENTED** (in code at the cited commit, verified by reading it), **TESTED** (a test or script was run for this package and its output is included), **PROPOSED** (design only), **NOT VERIFIED** (could not be checked here, or inferred).

## Commits referenced

| Commit | What |
|---|---|
| `4d1be3b` | production `main` (B0 only on top of `d649234`) |
| `7b9a2eb` | B1: Postgres lease + epoch fencing, single-transaction saves, graceful SIGTERM, `/healthz` |
| `1e6953f` | B0: sign-in rate limit keyed on `cf-connecting-ip` (staging before BC1) |
| `8a33fbb`, `18bb929` | BC1 Business Club (server, app); merged into staging as `1b374d0` |
| `7e946e3` | BC1 security closure (self-hosted card reader, tighter CSP); merged as `e9eefb9` |
| `ef77d53` | Opportunity Club MVP; merged as `5a5b7d9` |
| `7e0cce4` | Opportunity Club UI fixes; merged as **`a3c67e9`** (staging tip) |

## Index

| # | File | What it answers |
|---|---|---|
| 1 | [01-opportunity-acceptance.md](01-opportunity-acceptance.md) | Six MVP acceptance scenarios S1–S6 with steps, expected, actual, screenshots |
| 2 | [02-deploy-race.md](02-deploy-race.md) | The staging lease ping-pong: Render log timeline, root cause in code, local reproduction, state inventory, impact, proposed fix and tests |
| 3 | [03-single-club-assumptions.md](03-single-club-assumptions.md) | S1–S24 re-verified at `a3c67e9` with new line numbers, plus 4 new ones |
| 4 | [04-phase1-tests.md](04-phase1-tests.md) | Phase 1 suite now; why `fair_after_interrupt` and `sessions_owner_reset` fail; the two "unexpected passes"; `npm test`; `t_server.js` flakiness |
| 5 | [05-validation-evidence.md](05-validation-evidence.md) | What the server blocks in free text (links) and what it does not (phones, most emails, many domains) |
| 6 | [06-moderation-workflow.md](06-moderation-workflow.md) | Report → auto-hide → director queue → dismiss / hide / unhide / delete, with JSON and screenshots |
| 7 | [07-bc1-security.md](07-bc1-security.md) | CSP at 3 commits, vendored files and provenance, browser CSP checks incl. Opportunity pages, pending real-device tests |
| 8 | [08-proposal-business-report-flag.md](08-proposal-business-report-flag.md) | PROPOSAL only: Report/Flag for business profiles |
| | `scripts/` | The evidence scripts (not part of `npm test`) |
| | `logs/` | Real output of every run used in this package |
| | `raw/` | Request/response JSON (tokens, PINs and salts replaced by `<redacted>`) and kv snapshots |
| | `screens/acceptance/`, `screens/moderation/` | New phone screenshots (390×844 @2x) from this package's runs |
| | `screens/oc1-report/`, `screens/bc1-report/` | Copies of earlier reports' phone screenshots, for comparison only (claims from those reports, not re-produced here) |
| | `external/` | Copies of `bc1-device-test-checklist.md` and the `t_server` flaky history from the shared reports folder |

## Summary: required evidence item → status

| Item | Status | Basis |
|---|---|---|
| 1. S1 "I need help" post | **PASS** (TESTED) | 6/6 checks, UI-created, 2 screens |
| 1. S2 "I can help" post | **PASS** (TESTED) | 3/3 checks, UI-created, 2 screens |
| 1. S3 Home card after login, after Business Club; hidden while seated | **PASS** (TESTED), note: below the fold on a 390×844 phone; hiding is client-side only | 6/6 checks, 5 screens |
| 1. S4 consent-based contact | **PASS** (TESTED) | 9/9 checks, 7 screens |
| 1. S5 My Posts edit/close/reopen/delete, ownership 404 | **PASS** (TESTED) | 8/8 checks, 3 screens |
| 1. S6 members only, removed 401, reporting basics | **PASS** (TESTED) | 9/9 checks, 3 screens |
| 2. Deploy race: timeline and root cause | **Explained** (log evidence + code read); **reproduced locally** (TESTED) | `logs/race-repro-run.log` |
| 2. Deploy race: fix | **NOT IMPLEMENTED**; fix and tests **PROPOSED** | |
| 2. Render-side restart behaviour | **NOT VERIFIED** (inferred from pid change in the logs) | |
| 3. S1–S24 at `a3c67e9` | **All 24 still present** (IMPLEMENTED); 2 changed in substance (S3, S23), 1 now committed (S19), rest moved or same | code read |
| 4. Phase 1 suite | **7 pass / 2 expected fail / 0 unexpected failures** (TESTED); 2 "unexpected passes" explained | `logs/phase1-run.log` |
| 4. Same suite on production code | 2 pass / 7 fail (TESTED) | `logs/phase1-production-4d1be3b.log` |
| 4. `npm test` | **FLAKY**: 1 fail (t_server chat timing), then 2 × exit 0 (TESTED) | `logs/npm-test.log`, `logs/t_server-repeat.log` |
| 4. `t_server.js` | 9 of 11 runs passed today; root cause of flakiness NOT VERIFIED (likely test timing) | |
| 5. Server-side text validation | **Links partly blocked; phones not blocked; most emails not blocked; Business Club free text not filtered** (TESTED, 174 probes) | `logs/validation-probe-run.log` |
| 6. Moderation workflow | **PASS** 15/15 (TESTED) | `logs/moderation-run.log` |
| 7. CSP headers at 3 commits | **TESTED** (exact strings) | `logs/csp-headers-run.log` |
| 7. Vendored files vs SHA256SUMS and vs npm registry | **MATCH** 9/9 both ways (TESTED) | `logs/vendor-check.log`, `logs/vendor-provenance.log` |
| 7. Browser CSP: scanner (SIMD + plain) and 15 Opportunity screens | **0 violations, 0 third-party requests, control blocked** (TESTED, desktop Chromium only) | `logs/scan-csp-browser.log`, `logs/csp-opportunity-run.log` |
| 7. Real devices / Safari / Android | **NOT VERIFIED** (checklist empty) | `external/bc1-device-test-checklist.md` |
| 8. Business Report/Flag | **PROPOSED** only | |

## Findings worth attention (details in the files)

1. **Deploy ping-pong** (02): on lease loss the server exits; a restarted old process re-claims the lease. No data lost on Oct 16, but 3 disconnects and hand replays instead of 1, and old code briefly served traffic. Must be fixed before B1 reaches production. Production has no lease at all (worse overlap behaviour).
2. **Validation promise vs enforcement** (05): the form says "No links, phone numbers or emails"; the server blocks only links with 27 listed endings plus schemes and `www.`; phones and e.g. `a@b.fr` are accepted.
3. **Known open bugs, unchanged** (04): interrupted-hand fairness gap (B5); owner reset keeps old sessions, removed member's open socket still gets club broadcasts, owner-recovery lockout (B6/B7). Same on production.
4. **Home placement** (01 S3): Community Opportunities is on Home, right after Business Club, but below the fold on a typical phone.
5. **Moderation details** (06): one report per member per listing forever (a dismissed listing needs 3 new reporters); no audit log of director actions; a hidden listing still counts toward the poster's "open" count in the UI.
6. **Flaky `t_server.js`** (04): fails about 1 in 5 to 1 in 3 runs on chat-timing checks; makes `npm test` unreliable as a gate.

## How to re-run everything

From the repository root on this branch (Node 18+; tested with Node v22.22.0):

```
npm ci
npm i --no-save playwright-core@1.56.1      # only for the browser parts; Chromium from /opt/pw-browsers (or set CHROMIUM=/path/to/chrome)
# optional, nicer screenshots: FONTS_DIR=<folder with ibm-plex-sans-latin-<400|500|600|700>-normal.woff2>

node docs/evidence/2026-10-16/scripts/acceptance.js          # item 1  (--no-browser for API only)
node docs/evidence/2026-10-16/scripts/race-repro.js          # item 2  [overlapSeconds] [restartDelayMs]
node test/phase1/run.js                                      # item 4
npm test                                                     # item 4
node docs/evidence/2026-10-16/scripts/validation-probe.js    # item 5
node docs/evidence/2026-10-16/scripts/moderation.js          # item 6  (--no-browser for API only)
node docs/evidence/2026-10-16/scripts/csp-headers.js         # item 7  (temporary git worktrees of 1e6953f 18bb929 a3c67e9 in the OS temp folder, removed afterwards)
(cd public/vendor && sha256sum -c SHA256SUMS) && node scripts/vendor-tesseract.js --check
node docs/evidence/2026-10-16/scripts/vendor-provenance.js   # item 7  (needs npm registry access)
PLAYWRIGHT_CORE=$PWD/node_modules/playwright-core PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node test/browser/scan_csp.js [--no-simd]
node docs/evidence/2026-10-16/scripts/csp-opportunity.js     # item 7
```

Every script spawns its own local server(s) on a random port with `STAGING=1` (fake seed only: Test Director / `246810`; Test Player 01–12 / `1357` + last digit twice), `NO_BEACON=1`, `NO_PUSH=1`, an empty `DATABASE_URL` and a temp `DATA_FILE` that is deleted at the end. `race-repro.js` uses the phase-1 fake Postgres (`test/phase1/pgstub.js`). Listing ids, timestamps and pids differ between runs; the PASS/FAIL results should not.

## Environment and what could not be verified

- Runs were done on 2026-10-16 between 19:39 and 20:10 UTC in a Linux sandbox (Node v22.22.0, headless Chromium build 1194 via `playwright-core` 1.56.1).
- **Live staging (`gta-poker-staging.onrender.com`) and Render were not reachable** from the sandbox. Render log lines in `02-deploy-race.md` were **copied from Render logs by the coordinator** and are quoted as such.
- **Real devices, iOS Safari, Android Chrome, Samsung Internet: NOT VERIFIED.** Only desktop Chromium (headless) with phone viewport emulation.
- **Google Fonts** cannot be reached from the sandbox; screenshots used locally served IBM Plex files (npm `@fontsource/ibm-plex-sans`) through request routing. The app itself still links Google Fonts (pre-existing since before BC1).
- No real member data was used. No production or staging database was read or written.

## GitHub accessibility check

Checked on 2026-10-16 at 20:10 UTC, right after pushing commit `b2f241c` (the first commit of this branch; this README section was added in the next commit). The repository `aminshahvari/GTA-poke-` is **public** (`"private": false, "visibility": "public"`), so the reviewer can read the branch without an account.

```
$ gh api repos/aminshahvari/GTA-poke-/branches/audit-evidence-2026-10-16 --jq '[.name,.commit.sha]|@tsv'
audit-evidence-2026-10-16	b2f241cfb37f15948ea0eed1cc0bcd795944b2c5

$ gh api "repos/aminshahvari/GTA-poke-/contents/docs/evidence/2026-10-16/<file>?ref=audit-evidence-2026-10-16" --jq '[.path,.size,.sha,.type,.encoding]|@tsv'
docs/evidence/2026-10-16/README.md                                            10620   a2156a4aaaf318899fd615eff9c5f0ab974bca02  file  base64
docs/evidence/2026-10-16/02-deploy-race.md                                    17654   48bbccf683bc550e0fe60406e8774710b8138965  file  base64
docs/evidence/2026-10-16/scripts/acceptance.js                                23591   1643e0c91c6856a548063f70929137f62b21be6e  file  base64
docs/evidence/2026-10-16/screens/acceptance/S4-07-sender-sees-only-phone.png  157069  d5d528408cd6b6762fedbdfb1a71505ed398dc22  file  base64
docs/evidence/2026-10-16/raw/moderation.json                                  34035   eceac4c390a254e81ce04f9f86d14f0ebcbabf5f  file  base64
```

Byte-for-byte comparison of what GitHub serves with the local files:
- `README.md` (as of `b2f241c`): content from the API, base64-decoded, sha256 `4a8eb1973bcc74ba871eb6de947fec65af281822056518cb7aca4001726ba6ad` = local file; the API blob sha `a2156a4…` = local `git hash-object`.
- `screens/acceptance/S4-07-sender-sees-only-phone.png` downloaded raw (`-H "Accept: application/vnd.github.raw"`): sha256 `df602d8264168479e1c25be0c5819d5f448bf045c9be406629df7fbe30dc8e3d` = local file.

Result: **accessible and identical**. Browse: https://github.com/aminshahvari/GTA-poke-/tree/audit-evidence-2026-10-16/docs/evidence/2026-10-16
