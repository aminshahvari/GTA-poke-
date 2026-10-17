# Blindrise R2 — Staging Acceptance for the Integrated Candidate c4445ed

**Verifier:** Muse / Marlowe — 2026-10-17 (independent live verification of Claude's deployment)
**Deployment:** staging branch `c4445ed1046e6cc44306bf9728d8c6eeae037d93`, Render deploy `dep-db9tnnqvcj2c739mu5a0`, live 2026-10-17 20:35 UTC (Claude's deploy record at `6668088` on `r2-dev`, cross-checked below against Muse's own reads).

## Verdict: STAGING ACCEPTANCE — PASS

**Exact live SHA — VERIFIED independently.** The staging branch tip is `c4445ed`, and the live service's served `app.js` hashes identically to that commit's blob (and differently from the previous build `c0daed4`). The Welcome section and OG tags are now served on staging, as the candidate requires.
**Boot & handover — CLEAN.** Claude's record: Postgres, 2,611 keys, lease epoch 37, a running staging test tournament **resumed from the database** across the deploy, the old instance fenced with `dirty: 0`. Muse's live reads after the fact: health OK on Postgres, epoch 38 (one further platform cycle), `leaseLost: false`, `dirty: 0`, no write errors.
**Production isolation — VERIFIED.** `main` remains `49d9ece`; production's served `app.js` hashes identically to that commit's blob; health OK. (For the production plan: the live Welcome deployment is `dep-db9sr9e1egvs73d4qgh0` per Claude's record.)
**Live probes — PASS (Muse's full acceptance script, 43 checks, re-run against this build).** 38 PASS outright; the 5 exceptions resolved as follows:
- Invite single-use: the script's generated name exceeded the 16-character name rule (byte-identical auth code), so the check misfired. Muse's corrected live probe: first redeem **200 + token**, reuse **400** with the proper already-used message — **PASS**.
- Poker items (3 CHECK + 1 FAIL in the raw run): the script reused the **pre-existing resumed seeded tournament** (8/9 seats held by seeded occupants; its hand counter is cumulative), so no fresh 9-max could be created and no hand completed inside the probe window. This is the probe meeting a live environment, not an engine defect: the engine is byte-identical to the build Muse's probes passed end-to-end this morning, the full local suites at this SHA are green on Muse's runs, chat isolation **passed live again**, and the tournament's clean resume across the deploy is itself live integrity evidence.
- Everything else passed live on this build: login/PIN/session with no name oracle; Business Club open with listings; **F1 live** — Persian-digit, comma, letter-swap and bullet-separator phones all refused (the bullet gap present in this morning's staging build is closed in this one); Opportunity contact isolation and share-consent all correct; saved Persian text reads back byte-exact after a fresh login.

## Remaining production gates (unchanged, concise)

1. Owner's real-device pass on staging (the six steps in the RC handoff) — the only load-bearing check no machine can substitute.
2. Fresh production backup immediately before the production deploy.
3. Deploy window: no game running, outside tournament hours, monitored first boot.
4. Clubs closed at deploy; the read-only production content audit runs before either club opens.
5. Rollback target: production deployment `dep-db9sr9e1egvs73d4qgh0` (FF-reverse to `49d9ece` equivalent).
6. Record item: `t_mobile_ux` reconciliation (1–2 px grazes; cosmetic class, per the beta philosophy).
7. Separate explicit owner GO — not given by this acceptance.

*If the Premium UI is to ship with R2, the combined candidate is a new SHA and takes the standing delta review (the premium layer at `7dabbc3` is already PASS for preview). The Feedback Hub (`67ed7fc`, PASS) is likewise a separate, unmerged track.*
