# G2: read-only staging database verification

Status: **OPEN. No direct database query was possible from Claude's environment.** Exact read-only instructions for Muse (or the owner) are in section 3. Interim evidence from the application's own boot-time database read is in section 2.

Prepared 2026-10-16 23:40 UTC. Nothing was modified: no database record, no Render setting, no deploy.

## 1. Access

| Route | Result |
|---|---|
| Render MCP `query_render_postgres` (read-only transaction) on `dpg-db8qnj49v7es73dhrdm0-a` (gta-poker-staging-db) | **Refused**: "This database blocks all external connections because its IP allowlist is empty" (`get_postgres`: `ipAllowList: []`). |
| psql / node from Claude's container | Not possible: same allowlist; container egress to onrender.com is also refused. |
| Render Shell / SSH on the staging web service | Not available on the free instance type (Render offers Shell/SSH only on paid instances). Not attempted. |
| Staging `/healthz` | Reports the running process's epoch (in memory), not a database read. Unreachable from here. |

Every direct route needs a configuration change (an IP allowlist entry), which is outside this authorization. So per instruction 2 the query is handed to Muse.

## 2. Interim evidence: the application's boot-time read (Render logs)

At boot, `server/store.js` `init()` reads the lease row inside a transaction (`select v from kv where k='lease' for update`), sets `epoch = persisted + 1`, then runs `select k, v from kv` and logs the number of non-lease keys. Each boot line therefore reports the **persisted epoch + 1** and the **persisted state key count** at that moment.

| Time (UTC) | Instance | Cause | Log line | Implies persisted before boot |
|---|---|---|---|---|
| 21:29:23 | 4l5gs | wake after idle sleep | `73 keys, lease epoch 14` | epoch 13, 73 keys |
| 21:33:42 | gllcb | **C1 deploy** | `74 keys, lease epoch 15` | epoch 14, 74 keys (+1 key: owner sign-in at ~21:29-21:32 created a session) |
| 23:31:43 | ldxzp | wake after idle sleep (no deploy, no Render event between 21:34 and 23:40) | `74 keys, lease epoch 16` | **epoch 15, 74 keys** |

Interpretation: after C1 the persisted lease stayed at **epoch 15** for the whole period the service ran and slept (21:33 to 23:31): no instance claimed or wrote a newer epoch, which is consistent with "no reacquisition". The state key count was **74** at the C1 boot and still 74 at the next boot, so no key was added or deleted in between (values could still have changed legitimately). The 23:31 wake was caused by someone opening staging; it claimed epoch 16 as designed.

Limit: this is the application reading the database, not an independent query, so it does not close G2 on its own.

## 3. Read-only instructions for Muse

Prerequisite (needs the owner, because it is a Render setting): temporarily add the verifier's public IP under *gta-poker-staging-db, Networking, Access Control* in the Render dashboard, then remove it afterwards. Production `gta-poker-db` is not involved. Take the External Database URL from the same page; do not paste it anywhere.

```
psql "<External Database URL>" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN TRANSACTION READ ONLY;
SELECT now() AS queried_at;
SELECT v AS lease FROM kv WHERE k = 'lease';
SELECT count(*) FILTER (WHERE k <> 'lease') AS state_keys, count(*) AS total_rows FROM kv;
SELECT split_part(k, ':', 1) AS prefix, count(*) FROM kv WHERE k <> 'lease' GROUP BY 1 ORDER BY 1;
ROLLBACK;
SQL
```

Note: the first connection does not wake the web service; only HTTP visits do.

## 4. Expected results and how to judge them

1. `lease.epoch` equals the **latest** `lease epoch N` line in the staging Render logs (16 as of 23:40 UTC; each later wake or deploy adds exactly one and logs one line). `lease.instance` ends with that line's instance id (`...ldxzp:63` as of 23:40). Any epoch without a matching boot line = **FAIL** (unexplained claim).
2. `state_keys` equals the latest boot line's key count (74 as of 23:40) plus keys created since by visible activity (a sign-in adds a `session:` key; a sign-up adds `user:`/`name:` keys). With no activity since, exactly 74.
3. `lease.at` (milliseconds) is no later than the last activity of that instance (heartbeat every 3 s while awake; it stops when the instance sleeps).

Record the output, the time and the latest Render boot line in this file under a new section "Result", then commit.

## 5. Status

G2 is **not closed**: section 2 is consistent with the C1 evidence, but the independent read in section 3 has not been run.
