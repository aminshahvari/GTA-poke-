#!/usr/bin/env bash
# Blindrise staging: one-time (and safe to re-run) setup of a fresh Ubuntu 24.04 VPS.
#   apt upgrade, ufw (22/80/443 only), fail2ban, unattended-upgrades, swap, Docker + compose plugin, Node 20 LTS,
#   Caddy (automatic Let's Encrypt for STAGING_DOMAIN -> 127.0.0.1:3000, WebSocket included), the blindrise system
#   user, /srv/blindrise/{releases,shared,state,backups,ops}, the env files with generated secrets, blindrise.service.
# Run through ops.sh (which installs the kit to /srv/blindrise/ops and stores the settings it was sent):
#   sudo bash ops.sh bootstrap
# Generated secrets (OWNER_CODE, the database password) are created once and NEVER printed. To read the owner code
# on the box: sudo grep ^OWNER_CODE= /srv/blindrise/shared/env
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
need_root
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
T0=$(now_ms)
DOMAIN=$(cfg STAGING_DOMAIN)
[[ -n $DOMAIN ]] || die "STAGING_DOMAIN is not set (repository secret STAGING_DOMAIN)"
[[ $DOMAIN =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ && $DOMAIN == *.* ]] || die "STAGING_DOMAIN does not look like a DNS name"
. /etc/os-release
[[ ${VERSION_CODENAME:-} == noble ]] || warn "expected Ubuntu 24.04 (noble), found ${PRETTY_NAME:-unknown}; continuing"
APT=(apt-get -y -q -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)

log "1/11 apt update + upgrade"
apt-get update -q
"${APT[@]}" upgrade
"${APT[@]}" install ca-certificates curl gnupg rsync jq openssl ufw fail2ban python3-systemd unattended-upgrades \
  apt-transport-https debian-keyring debian-archive-keyring logrotate

log "2/11 unattended-upgrades (security updates daily, no automatic reboot)"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
cat > /etc/apt/apt.conf.d/52blindrise-unattended <<'EOF'
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF
systemctl enable --now unattended-upgrades >/dev/null

log "3/11 firewall: allow 22, 80, 443 only"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
for p in 22/tcp 80/tcp 443/tcp; do ufw allow "$p" >/dev/null; done
ufw --force enable >/dev/null
EXTRA_RULES=$(ufw status | awk 'NR>4 && NF && $1 !~ /^(22|80|443)\/tcp$/' | wc -l)

log "4/11 fail2ban (sshd jail, systemd journal backend)"
cat > /etc/fail2ban/jail.d/blindrise.local <<'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
backend = systemd

[sshd]
enabled = true
EOF
systemctl enable fail2ban >/dev/null; systemctl restart fail2ban

log "5/11 swap (2 GB, only when the box has none) and journald size cap"
if ! swapon --noheadings --show | grep -q .; then
  if [[ ! -f /swapfile ]]; then fallocate -l 2G /swapfile; chmod 600 /swapfile; mkswap /swapfile >/dev/null; fi
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
echo 'vm.swappiness=10' > /etc/sysctl.d/90-blindrise.conf; sysctl -q --system >/dev/null || true
install -d /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=500M\n' > /etc/systemd/journald.conf.d/blindrise.conf
systemctl restart systemd-journald

log "6/11 Docker Engine + compose plugin (download.docker.com)"
install -d -m 755 /etc/apt/keyrings
if [[ ! -s /etc/apt/keyrings/docker.asc ]]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc; chmod a+r /etc/apt/keyrings/docker.asc
fi
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME:-noble} stable" > /etc/apt/sources.list.d/docker.list
if [[ ! -f /etc/docker/daemon.json ]]; then
  install -d /etc/docker
  echo '{ "log-driver": "local", "log-opts": { "max-size": "20m", "max-file": "3" } }' > /etc/docker/daemon.json
fi

log "7/11 Node.js 20 LTS (deb.nodesource.com, pinned over Ubuntu's own nodejs)"
if [[ ! -s /etc/apt/keyrings/nodesource.gpg ]]; then
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
fi
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
printf 'Package: nodejs\nPin: origin deb.nodesource.com\nPin-Priority: 600\n' > /etc/apt/preferences.d/nodesource

log "8/11 Caddy (dl.cloudsmith.io/public/caddy/stable)"
if [[ ! -s /usr/share/keyrings/caddy-stable-archive-keyring.gpg ]]; then
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
fi
echo "deb [signed-by=/usr/share/keyrings/caddy-stable-archive-keyring.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" > /etc/apt/sources.list.d/caddy-stable.list

apt-get update -q
"${APT[@]}" install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin nodejs caddy
systemctl enable --now docker >/dev/null
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[[ $NODE_MAJOR == 20 ]] || die "expected Node 20, found $(node -v)"

log "9/11 blindrise user and directories"
id blindrise >/dev/null 2>&1 || useradd --system --home-dir "$BR_ROOT" --no-create-home --shell /usr/sbin/nologin blindrise
install -d -m 755 -o root -g root "$BR_ROOT" "$BR_RELEASES" "$BR_OPS"
install -d -m 750 -o root -g root "$BR_SHARED" "$BR_STATE"
install -d -m 700 -o root -g root "$BACKUP_DIR"
install -d -m 755 /var/cache/blindrise-npm

log "10/11 env files (secrets generated on first run only, never printed)"
umask 077
GENERATED=()
[[ -f $PG_ENV_FILE ]] || : > "$PG_ENV_FILE"
[[ -f $APP_ENV ]] || : > "$APP_ENV"
chmod 600 "$PG_ENV_FILE" "$APP_ENV"; chown root:root "$PG_ENV_FILE" "$APP_ENV"
[[ -n $(kv_get "$PG_ENV_FILE" POSTGRES_USER) ]] || kv_set "$PG_ENV_FILE" POSTGRES_USER blindrise
[[ -n $(kv_get "$PG_ENV_FILE" POSTGRES_DB) ]] || kv_set "$PG_ENV_FILE" POSTGRES_DB blindrise
if [[ -z $(kv_get "$PG_ENV_FILE" POSTGRES_PASSWORD) ]]; then
  kv_set "$PG_ENV_FILE" POSTGRES_PASSWORD "$(openssl rand -hex 24)"; GENERATED+=("database password")
fi
if [[ -z $(kv_get "$APP_ENV" OWNER_CODE) ]]; then
  kv_set "$APP_ENV" OWNER_CODE "$(openssl rand -hex 12)"; GENERATED+=("OWNER_CODE")
fi
PGU=$(kv_get "$PG_ENV_FILE" POSTGRES_USER); PGP=$(kv_get "$PG_ENV_FILE" POSTGRES_PASSWORD); PGD=$(kv_get "$PG_ENV_FILE" POSTGRES_DB)
kv_set "$APP_ENV" DATABASE_URL "postgres://$PGU:$PGP@127.0.0.1:5432/$PGD"
unset PGP
# managed settings (re-applied on every run; anything else the owner adds to the file is kept)
kv_set "$APP_ENV" NODE_ENV production
kv_set "$APP_ENV" PORT "$APP_PORT"
kv_set "$APP_ENV" STAGING 1
kv_set "$APP_ENV" UI_BOARD 1
kv_set "$APP_ENV" PUBLIC_URL "https://$DOMAIN"
umask 022

log "11/11 Caddy site + blindrise.service"
ACME_EMAIL=$(cfg STAGING_ALERT_TO)
{
  if [[ $ACME_EMAIL =~ ^[^@[:space:]]+@[^@[:space:]]+$ ]]; then printf '{\n\temail %s\n}\n\n' "$ACME_EMAIL"; fi
  sed "s/__DOMAIN__/$DOMAIN/g" "$BR_OPS/Caddyfile.tmpl"
} > /etc/caddy/Caddyfile.new
caddy validate --config /etc/caddy/Caddyfile.new --adapter caddyfile >/dev/null 2>&1 || die "generated Caddyfile does not validate"
mv -f /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile
install -d -o caddy -g caddy /var/log/caddy
systemctl enable caddy >/dev/null; systemctl reload-or-restart caddy

install -m 644 "$BR_OPS/systemd/blindrise.service" /etc/systemd/system/blindrise.service
systemctl daemon-reload
systemctl enable blindrise >/dev/null
# it starts only once a release is deployed (ConditionPathExists in the unit)

# --- summary (no secrets, no IP addresses, no hostname: the Actions log is public) ---
PUBIP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')
DNSIPS=$(getent ahostsv4 "$DOMAIN" | awk '{print $1}' | sort -u | tr '\n' ' ')
if [[ -z $DNSIPS ]]; then DNS="NOT RESOLVING yet (add the A record)"
elif [[ " $DNSIPS" == *" $PUBIP "* ]]; then DNS="ok (A record points at this box)"
else DNS="MISMATCH (A record points elsewhere)"; fi
summary_begin "bootstrap"
row "os" "${PRETTY_NAME:-?}"
row "firewall (ufw)" "$(ufw status | head -1 | awk '{print $2}'); allowed 22,80,443/tcp; other rules: $EXTRA_RULES"
row "fail2ban" "$(systemctl is-active fail2ban)"
row "unattended-upgrades" "$(systemctl is-active unattended-upgrades)"
row "swap" "$(free -m | awk '/^Swap:/{print $2" MB"}')"
row "docker" "$(docker --version | awk '{print $3}' | tr -d ,) / compose $(docker compose version --short)"
row "node" "$(node -v)"
row "caddy" "$(caddy version | awk '{print $1}') ($(systemctl is-active caddy))"
row "dns for domain" "$DNS"
row "blindrise.service" "enabled; $( [[ -e $BR_CURRENT ]] && systemctl is-active blindrise || echo 'waiting for first deploy')"
row "env file" "$APP_ENV (mode $(stat -c %a "$APP_ENV"), $(wc -l < "$APP_ENV") keys)"
row "secrets generated now" "${GENERATED[*]:-none (kept existing)}"
row "took" "$(( ($(now_ms) - T0) / 1000 )) s"
summary_end
