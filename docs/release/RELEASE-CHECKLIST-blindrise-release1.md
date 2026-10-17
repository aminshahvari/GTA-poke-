# BLINDRISE — RELEASE 1 — JOINT RELEASE CHECKLIST (Muse audit side)

Target: Saturday, October 17, 2026. Train branch: `rc-2026-10-17` (Claude's R1 manifest: `docs/release/R1-manifest.md` @ `870a710`). Production service `gta-poker`, production DB `gta-poker-db`. Staging: `gta-poker-staging`.

Roles (owner directive, Oct 16, 2026): Claude = implementation + tests. Muse = independent audit, risk review, data correctness, final verdict. Owner = explicit deploy approval. Execution and audit stay separate. This release is independent of Second Deal — separate path, separate authorization.

**Hard rule: NO production deploy without (a) Muse's independent GO and (b) the owner's explicit approval, in his own words. Deploy only between games.**

---

## 1. Muse's reconciliation of Claude's R1 manifest (the "Muse" column, filled by Muse)

| Manifest feature | Muse audit status (from the Oct 16 audits — evidence in this repo) |
|---|---|
| Poker core (already live) | Audited as the `4d1be3b` baseline: sound in single-instance operation; FAILS the overlap suite (that is what B1/P0 fix). Flaky `t_server.js` is pre-existing (37/53 cumulative) — `npm test` alone is not a release gate until de-flaked |
| B0 sign-in limit (`4d1be3b`, live) | Not separately audited by Muse; no adverse record |
| B1 single writer (lease + epoch fencing, SIGTERM, /healthz) | **AUDITED — CONDITIONAL PASS** (Muse P0 audit + C1/C2/C3 re-audit, filed `docs/evidence/p0/`, commits `52949d5`): exactly-one-handover verified on staging deploys 2, 3 and the C1 deploy; no stale writers |
| P0 stay-up-fenced (`78fbfb0`) | **AUDITED — CONDITIONAL PASS**, and **G2 is CLOSED** (see §2). The manifest's §2 gate table is stale on this point — corrected here |
| Business Club | **AUDITED — VERIFIED on staging** (acceptance + live UI by Muse): directory/profiles, per-field consent contact, moderation. Caveats: member Report/Flag does NOT exist (proposal only) → Release 2 |
| Opportunity Club | **AUDITED — VERIFIED on staging** (41/41 acceptance, 15/15 moderation, live UI): posting, consent contact, report → director queue. Caveat: text validation (F1) FAILED — see gate 6 |
| Owner switch for both clubs (closed by default) | In records at `a824b0a` (Claude, `t_clubs`). Muse audits the switch itself in the RC diff — the whole closed-by-default safety argument rests on it |
| Business card scanner | **Code-side VERIFIED** (strict CSP, Tesseract 9/9 vendored files byte-identical, 0 violations). Real-device behaviour **NOT VERIFIED** → R2 unless tested on a real phone today (manifest agrees) |
| Friend invitations + mobile sign-up | Present in production data and live UI paths; end-to-end audit not in Muse's records → Muse spot-audits in the RC (invite create → sign-up → member) |
| Premium Home (Poker / Business / Opportunities) | IN PROGRESS (Claude) — ships only if finished, screenshotted, and Muse audits the diff before freeze |
| Oval table, splat / winner animations | IN PROGRESS (Claude, visual only) — same rule: done + audited diff, or Release 2 |
| Owner reset of a member's PIN | NOT STARTED; an auth change that needs the owner's explicit yes. Default: Release 2 |
| Multi-club | Release 2 (agreed) |

## 2. Safety record (transmitted to Claude — his manifest §2 had not received these)

- **G2 — CLOSED.** Independent read-only DB verification executed by Muse on Oct 16, 2026 under the owner's Route 1 authorization: persisted lease epoch 20 == boot claim, instance `…8cdz9:84` match, 74 state keys == boot count (prefixes sum to 74), heartbeat ~2.6 s fresh; epoch chain 16→17→18→19→20 all logged boots. Filed: `docs/evidence/p0/MUSE-G2-RESULT-2026-10-16.md` (commit `daafb5d`). No further authorization is needed for G2.
- **G1 — fenced-instance termination line never observed in Render logs (3 deploys).** NOT a production blocker: a fenced husk is inert by construction (503s; the `lost` flag stops writes and heartbeat; code verified). Release duty: capture the old instance's logs for ≥30 minutes during the train deploy; an observed exit line closes G1, absence keeps it a documented non-blocker.
- **G3 — deploy-window availability never measured on staging** (free plan has no request logs). Known bound: ~2–10 s of 503s before the traffic switch; sockets close 4001; clients reconnect to DB-persisted state. Blocker ONLY for mid-game deploys. Release duty: measure the switch window + 503s from production request logs during this deploy and record them in the release report.
- **C2 — CLOSED.** `healthCheckPath` stays EMPTY on both services (Option A; the original C2 was withdrawn on Claude's probe evidence). `/livez` (Option B) is P1 / Release 2.
- **C3 — CLOSED** (README correction verified).

## 3. BLOCKER M1 — production identity must be corrected before any GO

The manifest states: production = `main` @ `d00b592` ("Coming soon card"); deploy = merge the frozen RC into `main`; rollback = revert `main` to `d00b592`; backup §4 says note `d00b592` for rollback.

That conflicts with the manifest's own feature table (poker core, B0 `4d1be3b`, friend invitations all "on production today"), with the manifest's §3 (944 keys at the last production boot), and with every audit record: **the live game runs `4d1be3b`, and a tournament ran on it tonight.**

Before Muse can issue a GO, Claude must state, with Render evidence: (1) which branch the production service `gta-poker` actually deploys from, (2) its current live deploy commit, (3) the exact deploy action for the RC, and (4) the exact rollback target commit. If the live service does not track `main`, the manifest's §§4–6 must be rewritten around the real target. Muse is verifying the service's branch + live commit read-only in Render in parallel; the two records must agree.

## 4. Release gates

| # | Gate | Status / rule |
|---|---|---|
| 1 | M1 resolved (production service, branch, live commit, deploy + rollback targets — in writing, evidence-backed) | BLOCKER until done |
| 2 | RC frozen: branch + tip SHA recorded; Muse diffs the RC code against the audited staging code; anything unaudited does not ship | At freeze |
| 3 | Targeted suites green on the exact RC: lease suite, `t_business`, `t_opportunity`, `t_clubs`, acceptance (41), moderation (15). `npm test` alone is not a gate (flaky `t_server.js`) | Claude runs, Muse verifies |
| 4 | Clubs ship CLOSED (owner switch off in production). Enabling them later is a separate owner action, gated on gate 6 + the device check | By design (`a824b0a`) |
| 5 | Pre-deploy backup: manual export of `gta-poker-db` created + downloaded; time and size recorded in the manifest (manifest §4). Owner step or owner-present | Deploy-day |
| 6 | F1 listing-text validation: owner decision (enforce server-side, or correct the UI copy) — required before the Opportunity Club is SWITCHED ON, not before this deploy (clubs ship closed) | Owner decides |
| 7 | Real-device card scan (real phone, end-to-end) — decides scanner R1 vs R2 only; the rest of the train does not wait for it | Owner + Claude |
| 8 | Pre-existing poker defects B5 (fairness proof), B6 (sessions survive PIN reset), B7 (removed member keeps receiving club broadcasts), cross-table chat isolation NOT VERIFIED: all pre-date this train (present in live `4d1be3b`); the train introduces none of them. They ship as known defects ONLY with the owner's explicit acceptance, else they are fixed + audited first. All are Release 2 items by default. **Note: the manifest's §7 risk list omits B7, chat isolation and F1 — the complete list is this checklist** | Owner accepts or Claude fixes |
| 9 | Rollback written against the REAL current production commit (per M1): redeploy/revert path + "old code ignores new keys" property re-verified for that commit; no destructive DB migration in the train (manifest §3: additive keys only — Muse verifies in the RC diff) | Before GO |
| 10 | Deploy window: between games; owner confirms no tournament running or registering-with-players | Deploy-day |

## 5. Deploy-day runbook (Oct 17)

1. Gates 1–3, 5, 9 closed; gate 8 accepted in writing by the owner; M1 evidence agreed.
2. Muse issues the Release 1 verdict (GO / NO-GO) filed in this repo. Owner reviews the final reports (his strategic review included) and gives explicit approval in his own words.
3. Claude deploys the frozen RC by the M1-corrected procedure. Expected production boot line: `store: postgres, N keys, lease epoch 1` with N ≈ the pre-deploy count (manifest: 944 at last production boot) plus at most a few session keys — production's first B1 boot claims epoch 1 because no `lease` row exists yet.
4. Muse monitors: exactly one epoch claim, exactly one handover, no re-acquisition, no `store write failed`, no `fenced` on the new instance; G1 log capture runs ≥30 min; G3 measured from production request logs.
5. Smoke (owner + Muse): sign in, lobby, leaderboard, Learn, Director tab, Business tab hidden for a member (clubs closed), one demo-table hand.
6. G2-method read of the production DB (read-only): persisted `lease.epoch` == boot claim (1), instance match, key count vs the §3 expectation.
7. Release report filed here: per-capability PASS / FAIL / NOT VERIFIED, G-items, measurements, rollback status. Any failed check → rollback first (gate 9 path), report second.

## 6. Release 2 (default — do not hold Release 1)

Business Report/Flag (proposal 08); moderation audit log + re-report rules + hidden-cap fix; B5 fairness policy + records; B6 session revocation fix; B7 broadcast cutoff fix; cross-table chat isolation test + `t_server.js` de-flake; F1 enforcement (if the owner chooses enforce); `/livez` Option B; scanner device matrix (if not done today); multi-club scoping; Home placement decision; Google Fonts self-hosting; owner-PIN-reset feature (if the owner says yes).

## 7. For Claude

1. Correct the manifest: §2 gate table (G1/G2/G3 per §2 above — G2 is CLOSED) and §§4–6 per M1.
2. At freeze: record the RC tip SHA in the manifest; Muse pulls the RC and audits the diff the same night.
3. Report per gate: status + evidence links. Muse audits items as they land — no need to wait for a single full package.

— Muse (independent auditor) · Oct 16, 2026, 22:52 EDT · Sources: Muse audits of Oct 16, 2026 (evidence audit; P0 audit; C1/C2/C3 re-audit; G2 assessment + result — all filed in `docs/evidence/p0/` and `docs/evidence/2026-10-16/`) reconciled against Claude's R1 manifest @ `870a710`.
