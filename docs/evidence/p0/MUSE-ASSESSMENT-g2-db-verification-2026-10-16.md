# Blindrise — G2 database verification: secure-access feasibility assessment

Assessor: Muse (Marlowe), read-only. Date: 2026-10-16.
Subject: `docs/evidence/p0/g2-staging-db-verification.md` @ `b4dac87810aafd2e8e2397485789bad2c23cbbb5` (repo aminshahvari/GTA-poke-).
Target: `gta-poker-staging-db` (`dpg-db8qnj49v7es73dhrdm0-a`). Production database not involved.

## Summary

Claude's procedure is correct, and his access analysis holds. **No fully internal route can execute the independent read today** on the free plan. Two feasible routes remain, both needing a separate owner authorization because each changes a Render setting. **Route 1 (recommended): a temporary paid instance type on the staging web service, to use Render Shell internally — zero external exposure; I execute everything. Route 2 (fallback, no cost): Claude's §3 allowlist procedure with the owner's own IP — the query then has to run from the owner's network.** G2 stays OPEN until one route is executed; the interim boot-read evidence is consistent and makes a failure unlikely, but it is not the independent read G2 requires.

## 1. Review of Claude's procedure (b4dac87)

- The SQL is correct against the audited `server/store.js`: one table `kv (k text primary key, v jsonb)`; the lease is the row `k='lease'` with `v = {epoch, instance, at}`; the boot-time key count excludes the lease row. His transaction is `BEGIN TRANSACTION READ ONLY` … `ROLLBACK` with `ON_ERROR_STOP=1`, and the prefix breakdown is a useful extra. Adopted unchanged for both routes below.
- The judgement criteria (§4) are sound: persisted `lease.epoch` must equal the latest staging boot line; `lease.instance` must end with that boot's instance id; `state_keys` must equal that boot's key count plus only visible activity since; `lease.at` must be no later than that instance's last activity.
- The interim evidence chain is internally consistent: boots at 21:29 (epoch 14, 73 keys), C1 deploy 21:33 (epoch 15, 74 keys — the +1 is the owner's sign-in session key), wake 23:31 (epoch 16, 74 keys). Persisted state therefore sat at epoch 15 / 74 keys for the entire post-C1 period until the 23:31 wake claimed 16 — consistent with no re-acquisition and no key drift. As Claude states, this is the application reading its own database, so it does not close G2.
- His access table is accurate. The one soft entry — Shell/SSH "inferred, not tested" for the free plan — is accepted: Render documents Shell/SSH as paid-instance features, and testing it would mean attempting to open a shell on the owner's service, which is itself part of Route 1's authorization.

## 2. Can an authorized internal Render environment run it, without opening external access?

**Not today.** The only process holding working internal credentials is the staging web service itself (its `DATABASE_URL` is the internal URL, set 2026-10-16). Reaching a SQL prompt inside that environment requires Shell/SSH (paid-instance feature; service is free) or a deploy (prohibited, and a deploy boots the app rather than giving an independent read). The Render MCP's read-only Postgres query is refused by the same empty allowlist ("This database blocks all external connections because its IP allowlist is empty"). There is no in-dashboard SQL console for the database. This is a plan limitation, not a configuration error.

One execution fact established by Muse during this assessment, because it decides the fallback's shape: **Muse's own egress is a rotating shared pool** (consecutive checks returned different IPv6 addresses, and different shared IPv4 egress addresses). There is no stable, single-tenant IP of mine to allowlist — a /32 entry would likely miss, and a range entry would expose the database to a large shared pool. Claude's §3 must therefore not be executed from Muse's environment, and not from the Render MCP's either (same shared-egress problem, identity unknown).

## 3. Route 1 (recommended): internal read via a temporary paid instance + Render Shell

Owner authorization covers exactly: change `gta-poker-staging` instance type free → Starter, run the read, change it back to free. Nothing else changes; no deploy, no code, no database setting is touched; the external allowlist stays empty throughout.

Sequence (Muse executes; ~15 minutes):
1. Read the latest staging boot line from Render logs (expect epoch 16 / `ldxzp` / 74 keys as of 23:31 UTC, or newer if the service woke since — the comparison target is whatever is latest at execution time).
2. Owner-approved instance-type change to Starter. The service restarts on the new instance type and claims the next epoch (17 if nothing else booted first) — this boot becomes the latest legitimate startup and is logged.
3. Open Render Shell on the running instance and run Claude's §3 statements with the service's own environment (node + the app's bundled `pg`, `process.env.DATABASE_URL`, internal URL). Read-only transaction, rolled back. A pure read claims no epoch.
4. Judge by Claude's §4 against the step-2 boot line: persisted epoch == that boot's epoch; `lease.instance` ends with that instance's id; `state_keys` == its key count (74 expected); `lease.at` consistent with its heartbeats.
5. Change the instance type back to free; record the downgrade in the evidence file.
6. File the output, timestamps, the boot lines used, and this route's up/down confirmations into `g2-staging-db-verification.md` under "Result" and commit. G2 closes if all four checks match.

Exposure: none external. Cost: Starter is billed prorated for the time used (under an hour → cents). Side effect to accept knowingly: the instance-type changes restart the service (two extra epoch claims in total across up/down if the downgrade also restarts it — each is a logged, legitimate startup, and the judgement in step 4 is made against the boot that the Shell session is attached to, so the logic is unaffected).

## 4. Route 2 (fallback): Claude's §3 allowlist procedure, owner's IP

Owner authorization covers exactly: temporarily add the **owner's own public IPv4 /32** to `gta-poker-staging-db` → Networking → Access Control, run the read from the owner's network, remove the entry. Production `gta-poker-db` is never involved.

Sequence:
1. Read the latest staging boot line (as Route 1 step 1). Confirm the owner's current public IPv4 (the connection the query will come from; it must not change mid-procedure).
2. Add the single /32 entry in the dashboard. Take the External Database URL from the same page; it is never pasted into chat or any file (it carries the password).
3. From the owner's machine, run Claude's §3 psql block verbatim (read-only transaction, rolled back). Record the output.
4. **Rollback, immediately, same sitting:** delete the allowlist entry. **Removal is proven, not assumed:** (a) the Access Control list is re-read and shows empty; (b) a fresh connection attempt from the same machine now fails with the allowlist refusal. Both results are recorded in the evidence file.
5. Judge by §4 and file the "Result" section as in Route 1 step 6.

Exposure: one /32 (the owner's own address) for the length of one sitting (minutes), with proven removal. Burden: the query runs on the owner's machine with the exact commands supplied — about five minutes of his time, which is why this is the fallback, not the recommendation.

## 5. What G2 closure still requires

1. The owner's one-line authorization for Route 1 **or** Route 2 (a Render settings change either way; nothing in this assessment authorizes itself).
2. A fresh boot-line read at execution time (any wake adds exactly one epoch; the target moves, legitimately).
3. The filed "Result" (query output + boot lines + route confirmations). On a full match, Muse records G2 CLOSED; any unexplained epoch, instance mismatch, or unexplained key delta is a FAIL and reopens the P0 evidence discussion.

Until then: **G2 remains OPEN** — interim evidence consistent (persisted epoch 15 held from the C1 deploy until the 23:31 wake claimed 16; 74 keys at both reads), risk unchanged from the re-audit (LOW), and still not a production blocker for a between-games train.
