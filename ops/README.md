# Blindrise staging ops kit

Everything needed to run Blindrise staging on one OVHcloud VPS-1 (Beauharnois, Ubuntu 24.04, 2 vCore, 4 GB RAM,
40 GB NVMe), driven only from GitHub Actions. Nobody has to SSH in by hand. The app is the same `node server/index.js`
as production. Only the storage differs: Postgres 16 runs in Docker on the box, bound to 127.0.0.1.

```
internet ──443/80──> Caddy (Let's Encrypt, WebSocket) ──> 127.0.0.1:3000 blindrise.service (node, user blindrise)
                                                                 │
                                                       127.0.0.1:5432 Postgres 16 (Docker, volume blindrise-pgdata)
timers: blindrise-backup (daily pg_dump)   blindrise-monitor (every 2 min, alerts on change)
```

The repository is **public**, so the Actions logs are public too. No script prints a secret: no password, no
OWNER_CODE, no SMTP or webhook URL, no env file, no IP address and no hostname. The box prints only summaries.
GitHub also masks every secret value automatically, so the domain shows up as `***` in the logs.

## 1. What the owner provides (once)

Add these under GitHub, **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Required | What to put in it |
|---|---|---|
| `STAGING_HOST` | yes | The VPS IPv4 address from the OVH control panel |
| `STAGING_USER` | yes | `ubuntu` |
| `STAGING_SSH_KEY` | yes | The **private** half of a new deploy key (see below), the whole file including the BEGIN and END lines |
| `STAGING_DOMAIN` | yes | The DNS name for staging, e.g. `staging.example.com` (an A record pointing at the VPS) |
| `STAGING_ALERT_TO` | for email alerts | The address that receives alerts. It is also given to Let's Encrypt as the contact |
| `STAGING_SMTP_URL` | for email alerts | An SMTP relay, `smtps://USER:PASSWORD@smtp.host:465` or `smtp://USER:PASSWORD@smtp.host:587` (STARTTLS is required). URL-encode `@` in the user as `%40` |
| `STAGING_ALERT_FROM` | optional | The sender address, if the relay will not send "from" the `STAGING_ALERT_TO` address |
| `STAGING_ALERT_WEBHOOK` | optional | A webhook URL (Slack incoming webhook, Discord webhook, ntfy topic, or any endpoint that takes JSON) |
| `STAGING_HOST_KEY` | optional, recommended | The box's SSH host key as a `known_hosts` line, to pin it (see step 4) |

You can use email, the webhook, both, or neither. With neither, alerts are only written to the box's journal
(`journalctl -t blindrise-alert`) and the runs say so with a warning.

**The deploy key** (on any computer):

```
ssh-keygen -t ed25519 -N '' -C github-actions-blindrise-staging -f blindrise-staging-deploy
```

1. Paste the contents of `blindrise-staging-deploy` (the private key) into the secret `STAGING_SSH_KEY`.
2. Add `blindrise-staging-deploy.pub` (one line) to `/home/ubuntu/.ssh/authorized_keys` on the VPS. You can do this
   in the OVH control panel's console or when you reinstall the VPS ("SSH key"). It sits next to your own key, if
   you have one.
3. Delete the local private key file afterwards. The key is used only by GitHub Actions.

**DNS:** add an `A` record for `STAGING_DOMAIN` that points at the VPS IP, with TTL 300. Add no AAAA record unless
the VPS has IPv6 set up. Caddy fetches the certificate as soon as the name resolves to the box.

**Pinning the host key (step 4, optional):** the first run trusts the key the server presents and prints its SHA256
fingerprint in the "SSH setup" step. To pin it, compare that fingerprint with
`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the box (from the OVH console). Then save the output of
`ssh-keyscan -t ed25519 <IP>` as the secret `STAGING_HOST_KEY`.

## 2. How to run a task

Every task runs from GitHub Actions on a GitHub-hosted `ubuntu-latest` runner. The runner connects to the box over
SSH as `STAGING_USER`, copies `ops/` to `~/blindrise-ops`, and runs `sudo bash ~/blindrise-ops/ops.sh <task>`.
`ops.sh` installs the kit to `/srv/blindrise/ops`, which is root-owned. The workflows start in exactly two ways:

1. **A push to branch `ops-staging` that changes `ops/run.txt`.** The first line of that file that is not blank and
   not a comment is the request, for example `deploy a795f54`. Pushes that do not touch `run.txt` run nothing.
   To run the same task again, change anything in the file, for example bump the `# run: N` counter.
   ```
   # change the last line of ops/run.txt from "none" to "bootstrap", then
   git commit -am "ops: bootstrap" && git push origin ops-staging
   ```
2. **By hand:** Actions tab → *staging ops* / *deploy staging* / *staging check* → *Run workflow*. GitHub only
   offers this button once the workflow files also exist on the default branch. Until then, use `run.txt`.

The workflows never run on pull requests. One run touches the server at a time (concurrency group
`staging-server`). The three workflows all see every `run.txt` push, but only the one that owns the task does
anything. The other two finish with their job skipped.

| Task | Workflow | What it does |
|---|---|---|
| `none` | – | Nothing. This is the safe default in the committed `run.txt` |
| `preflight` | staging ops | Checks SSH and passwordless sudo; prints OS, CPU, RAM, disk and which tools and settings are present |
| `bootstrap` | staging ops | `ops/bootstrap.sh`, see section 4 |
| `postgres` | staging ops | Starts Postgres 16 (`ops/compose.postgres.yml`) and waits until it is healthy |
| `deploy [ref]` | deploy staging | Deploys a commit, branch or tag (default `a795f54`) with automatic rollback |
| `rollback` | deploy staging | Switches back to the previous release |
| `backup` | staging ops | Installs and enables the daily backup timer and takes a backup now |
| `restore-rehearsal` | staging ops | Restores the newest backup into a scratch DB, checks it, boots the app on it, tears it down |
| `monitoring` | staging ops | Installs the 2-minute health probe and prints every check once |
| `alert-test` | staging ops | Sends a test alert through every configured channel |
| `status` | staging ops | One-screen status: release, health, Postgres, last backup, rehearsal, monitor, timers, resources |
| `check` | staging check | Checks from outside on GitHub's network (HTTPS, `/healthz`, WebSocket, certificate days), then runs `status` |

If a required secret is missing, the job stops before it contacts the server, with
`Repository secret X is not set ...`.

## 3. Order of operations (first time)

1. `preflight`. Proves the key, user, sudo and host are right.
2. `bootstrap`. Takes about 3–5 minutes. Run it again whenever you like: it is idempotent and keeps existing
   secrets.
3. `postgres`
4. `deploy a795f54`. This is the production commit. Its first boot with `STAGING=1` seeds the synthetic
   "Test Director" (PIN `246810`, from the app's source) and 12 fake members.
5. `backup`, then `restore-rehearsal`. Both must be green before staging is used for anything real.
6. `monitoring`, then `alert-test`. Confirm the test alert arrived by email or webhook.
7. `check`. The outside view.
8. Load tests. These are a separate piece of work and need staging green on all the steps above. During a load test,
   expect `cpu`/`load`/`wsmin` warnings; that is the monitor working. To silence them for the test window, put
   `SKIP=cpu load` in `/srv/blindrise/shared/monitor.conf`.

## 4. The pieces

**`bootstrap.sh`** (idempotent):

- Runs `apt upgrade` and turns on unattended security upgrades (no automatic reboot).
- Sets up `ufw`: deny incoming, then allow 22, 80 and 443 over TCP only.
- Adds a `fail2ban` sshd jail (systemd backend, 5 tries, then a 1 h ban).
- Adds a 2 GB swapfile if the box has no swap, and caps the journal at 500 MB.
- Installs Docker Engine and the compose plugin from download.docker.com (container logs rotate at 20 MB × 3).
- Installs Node 20 LTS from deb.nodesource.com (pinned) and Caddy from Caddy's apt repository.
- Creates the `blindrise` system user (nologin) and `/srv/blindrise/{releases,shared,state,backups,ops}`.

It also writes these files:

- `/srv/blindrise/shared/env`, mode 600. `OWNER_CODE` (random, made once), `DATABASE_URL`, `STAGING=1`,
  `UI_BOARD=1`, `PORT=3000`, `NODE_ENV=production`, `PUBLIC_URL=https://STAGING_DOMAIN`. Keys you add by hand
  are kept.
- `/srv/blindrise/shared/pg.env`, mode 600. The database user, name and a random password, made once.
- `/etc/caddy/Caddyfile`, from `Caddyfile.tmpl`. It proxies `STAGING_DOMAIN` to 127.0.0.1:3000 with WebSocket,
  sends `X-Robots-Tag: noindex` and writes an access log.
- `blindrise.service`. Runs as `blindrise` with `Restart=always`, a hardened sandbox and `TimeoutStopSec=25` (the
  app saves once on SIGTERM). It starts only once a release exists.

To read the owner code: `sudo grep ^OWNER_CODE= /srv/blindrise/shared/env` from the OVH console. To rotate it,
delete that line and run `bootstrap` again. Rotating the DB password needs an `ALTER USER` as well, which is not
automated.

**Postgres** (`compose.postgres.yml`, `postgres.sh`): the `postgres:16` image, container `blindrise-postgres`, published
on `127.0.0.1:5432` only, named volume `blindrise-pgdata`, a `pg_isready` healthcheck, settings sized for 4 GB.
The script refuses to finish if the port is published on a public address. Docker-published ports bypass ufw,
which is why the 127.0.0.1 binding matters.

**Deploy** (`deploy-staging.yml`, `deploy.sh`):

1. The runner checks out the ops kit, then the app at the requested ref, resolved to the full SHA.
2. It rsyncs the app to `/srv/blindrise/releases/<sha>`, without `.git`, `node_modules` or `data`.
3. On the box: `npm ci --omit=dev` (with `--ignore-scripts`; none of the three dependencies needs install
   scripts), then the release files are made root-owned and read-only for the app.
4. It writes `.release.env`, which sets `RENDER_GIT_COMMIT=<sha>` so the app reports its version.
5. It swaps the `current` symlink atomically and restarts the service.
6. It waits up to 90 s for `/healthz` to answer 200 with `ok: true` and `mode: postgres`, and for `/` to answer 200.
7. If that fails, it switches `current` back to the previous release, restarts, re-checks and exits red.

The newest 5 releases are kept; the live and the previous release are never pruned. After the deploy, the runner
checks `https://STAGING_DOMAIN/healthz` and the WebSocket from outside. Before DNS and the certificate are ready,
this is only a warning.

**Backups** (`backup.sh`, `blindrise-backup.timer` daily at 07:30 UTC ± 15 min, kept 14):

- `pg_dump -Fc` runs from an exported snapshot. The kv row count and a `(key, md5(value))` manifest are recorded
  **in the same snapshot**, so later checks are exact even while the app writes.
- Files go to `/srv/blindrise/backups/blindrise-<UTC>.dump|.manifest.tsv|.meta` (directory mode 700, files 600),
  and the dump is checked with `pg_restore -l`.
- Off-box copy: put an executable at `/srv/blindrise/shared/backup-hook`. It gets the dump path as `$1`, for
  example `rclone copy "$1" remote:blindrise-staging/`. If the hook fails, the backup exits 2, so the unit shows
  as failed and the monitor alerts. The local dump is kept.

**Restore rehearsal** (`restore-rehearsal.sh`):

1. It starts a separate throwaway container, `blindrise-rehearsal-pg`. The container has its own random password,
   keeps its data on tmpfs and listens on 127.0.0.1:55432. It never touches the live container or its volume.
2. It runs `pg_restore` of the newest dump into that container.
3. It checks the restored data:
   - the dump's sha256 matches its `.meta` file
   - the kv row count equals the source's count at dump time
   - 50 randomly sampled keys match by md5
   - the full manifest digest matches
4. It boots the live release against the restored DB on port 3999 (as user `blindrise`, with `NO_PUSH=1` and
   `NO_BEACON=1`, so it sends no phone notifications and makes no outside calls). It then checks:
   - `/healthz` answers 200
   - `/` answers 200
   - the app loaded exactly the restored keys
5. It prints PASS/FAIL per check with timings, then always removes the container and stops the test app.

**Monitoring** (`monitor.sh`, `notify.sh`, `ws-check.js`, `blindrise-monitor.timer` every 2 minutes):

| Check | Level | Fails when |
|---|---|---|
| `service` | CRIT | `systemctl is-active blindrise` is not active |
| `http` | CRIT | `/` or `/healthz` through Caddy (with the real certificate, dialled on 127.0.0.1) is not 200 |
| `ws` | CRIT | The WebSocket handshake on `/ws` does not answer 101 |
| `pg` | CRIT | The Postgres container is not healthy |
| `lease` | CRIT | The store reports the lease lost, or "lease lost" appears in the journal |
| `dbwrite` | CRIT | A store write failed in the last 5 minutes |
| `restarts` | WARN | systemd restarted the app automatically |
| `errors` | WARN | There were more than 20 error lines in `journalctl -u blindrise` over the last 5 minutes |
| `wsmin` | WARN | The app's `ws min` summary lines show act RTT p95 over 1500 ms or more than 30 kills. These lines come from builds with the connection log; `a795f54` has none, so the check shows `skip` |
| `disk` | WARN | The disk is more than 85% full |
| `mem` | WARN | Less than 10% of memory is available |
| `cpu` | WARN | CPU is more than 90% busy |
| `load` | WARN | Load is more than 2.0 per CPU |
| `backup` | WARN | The last good backup is more than 26 h old, or its hook failed |
| `cert` | WARN | The certificate has less than 14 days left |
| `units` | WARN | A `blindrise-*` unit has failed |

A check alerts only after 2 failing runs in a row. Alerts go out only when the set of failing checks changes: a new
problem, a changed problem, or **RECOVERED**. While a problem continues, a reminder goes out every 6 h. All the
thresholds are in `/srv/blindrise/shared/monitor.conf`, which is copied once from `monitor.conf.default` and never
overwritten.

**External check** (`staging-check.yml`): it runs from GitHub's network on dispatch or on a `check` push. A schedule
is not enabled, because the rule for now is push and dispatch only. To enable one later:

1. Merge the workflow files to the default branch. GitHub runs schedules only from the default branch.
2. Add `schedule: - cron: '*/15 * * * *'` under `on:`.
3. Let the gate accept `github.event_name == 'schedule'`.

The comment at the top of the file shows the exact lines.

## 5. Reading results

- Every run has a **job summary** (the run page, below the graph) with the `=== SUMMARY ===` block the box printed
  and an OK / FAILED header. The full log shows the same block.
- `deploy`: `result deployed` is good. `FAILED ...; ROLLED BACK to <sha>` means the new release was unhealthy and
  the old one is live again. The run is red; read `journalctl -u blindrise -n 100` on the box.
  `ROLLBACK ... ALSO UNHEALTHY` means look now.
- `restore-rehearsal`: `VERDICT PASS` only if every line is PASS. `kv row count`, `full manifest digest` and
  `app loaded keys` together prove the restore is exact and usable. `timings` gives the restore time, which is the
  realistic RTO for this data size.
- `monitoring` / `status`: one line per check, `name ok|fail|skip LEVEL detail`. CRIT turns the run red.
- On the box: `/srv/blindrise/state/{backup.last,rehearsal.last,monitor.last,monitor.checks,alerts.log,releases}`,
  `journalctl -u blindrise`, `journalctl -u blindrise-monitor`, `journalctl -t blindrise-alert`,
  `systemctl list-timers 'blindrise*'`.

## 6. Local test (no server needed)

`bash ops/test/local-e2e.sh` (needs Docker, Node, npm, jq, curl, openssl, and `pip install aiosmtpd`). It runs these
against a throwaway Postgres container, with only synthetic data:

- `postgres.sh`, and deploys of `a795f54` (good release, broken release with automatic rollback, explicit
  rollback), using a fake systemctl
- `backup.sh` while the app writes, including retention and a failing hook
- `restore-rehearsal.sh`, which must PASS, and again with a tampered manifest, which must FAIL
- `notify.sh` to a local webhook and to a local SMTP server with STARTTLS and AUTH
- `monitor.sh`: all ok, then the app down (alert after 2 runs), then back up (RECOVERED), plus `ws min` parsing
- the `ws-check.js` handshake, the `ops.sh` settings whitelist, and the CI helpers
- a check that no generated secret appears in any output

Everything is cleaned up afterwards.
