# Blindrise / GTA Poker — P0 Re-Audit: C1, C2, C3 Remediation Evidence

Auditor: Muse (Marlowe), independent, read-only. Date: 2026-10-16.
Repo: aminshahvari/GTA-poke-, branch `p0-deploy-race`, tip `3a224618085a5cf12d814c21d1545f0ec9236935`.
Commits in scope: fix `78fbfb0`, staging merge `9026503`, C3 `f5853dec599db0365aee40566b23a8de58edca76`, C1/C2 evidence `3a224618085a5cf12d814c21d1545f0ec9236935`.
Prior verdict: MUSE-AUDIT-p0-deploy-race-2026-10-16.md (CONDITIONAL PASS, conditions C1/C2/C3).

## VERDICT: CONDITIONAL PASS

The core safety property is independently verified: exactly one leadership handover per deploy, no re-acquisition, fencing proven on Render (deploys 2–3) and locally, DB-level epoch guard proven locally, C3 accurate, C2 resolved by accepting Claude's Option A. Three evidence gaps remain (G1–G3 below); none blocks a between-games production train of this fix. Production remains NO-GO until the owner authorizes a train separately — this verdict does not authorize one.

## 1. Handover epoch 14 → 15, re-acquisition, fencing

VERIFIED, from `logs/render-c1-controlled-deploy.log` (downloaded raw, read in full):
- Wake (owner, no old instance): 21:29:23.257 UTC, instance `4l5gs`, lease epoch **14**, 73 keys.
- Deploy `dep-db99g30n74is73et5bp0` started 21:33:01; new instance `gllcb` claimed epoch **15** at 21:33:42.849 (74 keys); old deploy deactivated 21:33:43.657; service live 21:33:43.810.
- Exactly two epoch lines in the window; **no epoch 16**; no log line of any kind from `4l5gs` after 21:29:23; window observed 32 minutes (to 22:06:01) — meets C1's ≥30-minute requirement.
- No re-acquisition: VERIFIED for the window.
- Fencing in THIS deploy: **not observed** — see §2. Fencing behaviour itself remains verified where it was actually exercised: staging deploys 2 and 3 (old instance logged "lease lost: staying up and answering 503" 0.1–0.6 s after the new claim, never reclaimed) and the local test suite.
- Pre-check `git diff 78fbfb0 9026503 -- server lib test package.json` empty: the C1 deploy ran the audited code, byte-identical in server/lib/test. Consistent with my first audit.

## 2. Did the old process terminate after losing its lease?

**Not directly proven — and in this deploy the process may never have fenced.** The old deploy was deactivated 0.8 s after the new claim and `4l5gs` metrics stop after the 21:33 sample; its 3 s heartbeat would ordinarily have logged the lease loss, yet it logged nothing at all — neither the fence line nor any shutdown line. Two explanations fit all observations: Render stopped it before its next heartbeat/SIGTERM handling completed, or its final lines never reached Render's log stream. Claude's supporting observation is strong: across the whole day, no instance — including old-code instances — has a "shutting down: SIGTERM" line in Render logs, although that line fires locally. I accept his labelling: termination PARTIAL, the "SIGTERM after lease loss: exiting" line NOT OBSERVED (third deploy in a row).

What the evidence does establish: the deploy is deactivated, metrics cease, the process never speaks or claims again in 32 minutes, and a fenced husk — if one somehow lingered — is inert by construction (503 on everything, `lost` flag stops writes and heartbeat, `store.init()` runs once at boot so it can never re-claim; index.js:441–443, 449–452 verified against the audited source). Residual risk LOW.

**Gap G1 — NOT a production blocker.** Minimum evidence to close: one Render-side record in which an instance that first logged its fence line is then seen to exit (the exit line, or an instance-terminated event). No new deploy is required for P0 closure; this can be captured opportunistically on the next staging deploy that happens for any reason (e.g. the Option B test in §5).

## 3. Database safety: verified vs inferred

- **Verified (mechanism, local):** stale-epoch writes are rejected at the store/DB level (test `lease_fencing`: stale flush rolled back, nothing written); fenced process writes nothing (`dirty:0` in the fencing probes and tests).
- **Inferred (this deploy, logs only):** "no stale writes" for C1 rests on the absence of "lease lost" / rolled-back-flush / "store write failed" lines. The staging database itself was not queried (empty IP allowlist from Claude's environment) — Claude labels this PASS (indirect), which is honest.
- The 73 → 74 key growth between wake and the new instance's boot read is consistent with normal state persistence by the woken leader before the deploy; nothing about it suggests a stale write.

**Gap G2 — NOT a production blocker.** Minimum evidence to close (no deploy): one read-only query against the staging database confirming the persisted lease epoch is 15 and the state key count is consistent with the new instance's boot read (74 keys), filed into `docs/evidence/p0/`. Read-only; separate owner approval as scoped below.

## 4. Availability risk during deployment — unmeasured

**NOT MEASURED on staging** (free plan: no request logs; service unreachable from Claude's environment; no `server_failed`/`server_restarted` events in the window). What is known from deploys 2–3: the old instance answers 503 for ~2–10 s before Render switches traffic, and open sockets are closed 4001, so connected clients must reconnect. Game state is DB-persisted by design, so a reconnect lands on the new leader with state intact — but the length and client-visible impact of the window on the **paid production** service has never been measured.

**Gap G3 — a production blocker only for mid-game deploys.** The standing between-games rule fully mitigates it; it does not block a between-games production train. First measurement opportunity is the train itself (production has request logs): record the switch window and any 503s during that deploy in the train's evidence.

## 5. C2 — the /healthz recommendation, and /livez

I reviewed `c2-healthcheck-proposal.md` and its probe (`healthz-semantics.js`, `logs/healthz-semantics.log`, run against the real `server/index.js` + `server/store.js`). The probe output matches the proposal's table exactly: leader 200 with `leaseLost:false, dirty:0`; fenced 503 with `leaseLost:true`, process alive; leader with DB down still 200 (`lastWriteError` set); SIGTERM final-save exits 0. Code cross-check: `server.listen` runs after `store.init()` and `ready=true` is set in its callback (index.js:469) — **the port opens only after the lease is claimed and state is loaded**, which is the same readiness point `/healthz` reports.

Findings:
- `/healthz` is a readiness/leadership signal, not liveness: a fenced process is alive and correct but answers 503 by design. Correct as stated.
- The restart risk is real and unresolved: Render's docs say an instance failing health checks several times in a row is restarted, and do not say whether a retiring instance is exempt. A restarted fenced husk would run `store.init()`, claim a new epoch, and fence the live leader — P0 re-created by the health check. Not verified either way, and the downside is the exact bug P0 fixed.
- **My original C2 (set the check to `/healthz`) is superseded by this evidence and I withdraw it in that form.** Option A (leave `healthCheckPath` empty on both services) loses nothing for deploy gating — port-open is the same readiness point — and carries no restart vector (a fenced process keeps its port open and answering, so no check fails). **C2 is closed by Option A: no Render change.**
- `/livez` (Option B) is the right design if a check path is ever set: 200 whenever the process is up, including fenced, so a husk can never be restarted into a claim, while `/healthz` remains the readiness signal for humans/monitoring. It is a code change (P1) and must pass Claude's staging protocol before any production use: one deploy with the old instance awake, confirm no restart of the fenced instance in Render events and exactly one handover. Endorsed as specified, including staging-first (`srv-db8qnn6i0phs738m9ajg`) and production only after a clean staging handover.

## 6. C3 — correction, tests, regressions

VERIFIED by direct diff and hashes:
- `f5853de` changes only `docs/evidence/p0/README.md`: the false header line is replaced with the true status (fix `78fbfb0`, merged into `staging` as `9026503`, deployed to staging only, `main` untouched at `4d1be3b`) and a correction-log paragraph is added. The branch-tip README adds only the C2 file mention and §5 (the C1 record). No other text changed.
- Claude's claim that no `78fbfb0` evidence file changed is **independently confirmed**: SHA-256 of the tip copies of `race-repro.js`, `server-index.diff`, `npm-test.log`, `phase1-run1/2/3.log`, `race-repro-after-fix.log` and `render-staging-deploys.log` are byte-identical to the copies I downloaded at `9b36126` during the first audit.
- Test results stand as audited (no test file or server file appears in either new commit's change list — docs and logs only). No regression risk from the remediation commits.

## 7. New risks introduced by the remediation

None material. Both commits are documentation/evidence only; the C1 deploy ran previously audited code; `healthz-semantics.js` lives under `docs/evidence/` and is not loaded by the app. Two observations, neither a blocker: (a) the lease epoch also advances on free-plan sleep/wake (epoch 14 at wake) — expected, harmless with one instance, and production does not sleep; (b) the day's evidence strengthens the suspicion that Render log shipping drops lines written during instance teardown — worth remembering when reading any future deploy log (absence of a shutdown line is weak evidence, in both directions).

## Outstanding items

| Gap | Production blocker? | Minimum additional evidence |
|---|---|---|
| G1: fenced-process termination on Render never directly observed | No | One future staging deploy record showing a fenced instance's exit; opportunistic, no dedicated deploy |
| G2: C1 DB safety is log-indirect | No | One read-only staging DB query (persisted epoch 15; key count consistent with 74 at boot), filed as evidence |
| G3: deploy-window availability unmeasured | Only for mid-game deploys (between-games rule stands) | Measure switch window + 503s from production request logs during the first train deploy |

## Narrowly scoped plan (for separate owner approval — no deploy)

1. Read-only staging DB check (closes G2): from an environment the database allowlist permits, run a single read-only query returning the persisted lease epoch and state key count; file the output under `docs/evidence/p0/logs/`. No writes, no config change, no deploy.
2. Nothing else. G1 closes opportunistically; G3 closes during the production train, if and when the owner authorizes one.

Production: NO-GO until explicitly authorized. No deployment is recommended by this audit.
