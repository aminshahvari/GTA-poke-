# C2: /healthz readiness semantics and Render health-check proposal

Status: **PROPOSAL ONLY. No Render setting was changed.** Both services still have `healthCheckPath: ""` (staging confirmed with Render `get_service` on 2026-10-16 21:25 UTC).

## 1. What /healthz does today (commit 78fbfb0, verified locally)

Evidence: `healthz-semantics.js`, output in `logs/healthz-semantics.log` (real `server/index.js` + `server/store.js`, fake Postgres from `test/phase1/pgstub.js`).

| Server state | /healthz | Other HTTP | Evidence |
|---|---|---|---|
| Booting (lease claimed, state loading, not yet listening) | no answer (port closed) | no answer | code: `server.listen` runs after `store.init()`, `ready = true` in its callback (`server/index.js:469`) |
| Database unreachable at boot | process exits 1 | n/a | observed in the first run of the probe (stack trace from `store.init`) |
| Leader, healthy | **200** `{"ok":true,"epoch":N,"leaseLost":false,...}` | 200 | log line 1 |
| Leader, database down after boot | **200** with `lastWriteError` set | 200 | log line 3 |
| Fenced (a newer instance took the lease) | **503** `{"ok":false,"leaseLost":true}`, process stays up | 503 | log line 2 |
| SIGTERM while leader (final save, max 10 s) | 503 while saving, then port closed, exit 0 | 503 | code `server/index.js:154-155`; log line 4 (save finished at once, so only "no answer" was observed) |

So `/healthz` is a **leadership/readiness** signal (200 = this process is the writer and serving), not a **liveness** signal: a fenced process is alive and correct but answers 503 by design.

## 2. What Render does with a health check path

From Render's docs (fetched 2026-10-16):
- "Render does not send traffic to the new instance until it is considered ready." With a health check path it uses that path; without one, it checks that the port is open. (https://render.com/articles/how-render-handles-zero-downtime-deploys)
- Old instance: keeps running 60 s after traffic switches, then SIGTERM, then SIGKILL after the shutdown delay (default 30 s). (same page)
- "If those requests fail several times in a row for a particular instance, Render restarts it." No exact count or interval given. (https://render.com/docs/uptime-best-practices)

Observed on staging (Render logs, deploys 2 and 3): the old instance is fenced **0.1 to 0.6 s after the new one claims the lease**, while traffic still goes to the old one; Render switched traffic 2 to 10 s later.

## 3. The risk of setting healthCheckPath = /healthz as it is

If Render health-checks the fenced old instance (it answers 503 for up to ~60 s plus its remaining routed window) and "restarts it" because it failed several checks in a row, the restarted process runs `store.init()` again, **claims a new epoch and fences the new instance**. That is the original lease ping-pong (P0), triggered by the health check instead of by an exit. Render's docs do not say whether the restart rule applies to an instance that is being retired. **Not verified either way.**

Second, smaller effect: a leader whose database is down still answers 200, so the health check would not catch a database outage (no harm, no help).

## 4. Proposal

**Recommended now: Option A, keep `healthCheckPath` empty on staging and production.** Render then gates new instances on the port opening, which with this code happens only after the lease is claimed and state is loaded, which is the same readiness point `/healthz` reports. Nothing is lost for deploy gating, and the restart risk in section 3 does not exist.

**Later, Option B (needs a small code change, i.e. P1 work, and a separate approval):** add a liveness path, for example `/livez`, that answers 200 whenever the process is up, including when fenced, and set:

```
healthCheckPath: /livez
```

`/healthz` stays as the readiness/leadership signal for people and monitoring. Before enabling it, test on staging: one deploy with the old instance kept awake, confirm no restart of the fenced instance in Render events and exactly one lease handover.

**Not recommended: `healthCheckPath: /healthz` with the current code,** because of section 3.

Exact setting to apply if Muse and the owner choose Option B after that change: service `srv-db8qnn6i0phs738m9ajg` (staging) first, field `healthCheckPath`, value `/livez`; production `srv-db81l3eq1p3s7397u4s0` only after a staging deploy shows one clean handover with it.
