#!/usr/bin/env bash
# Prepare ssh on the GitHub runner: key from STAGING_SSH_KEY, host alias "staging", host key pinning.
# Host key: STAGING_HOST_KEY (optional secret, a known_hosts line or lines) is used when set; otherwise the key is
# fetched with ssh-keyscan on first contact (trust on first use) and only its SHA256 fingerprint is printed, so the
# owner can compare it with `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the box and then pin it.
set -euo pipefail
: "${STAGING_SSH_KEY:?}" "${STAGING_HOST:?}" "${STAGING_USER:?}"
umask 077
mkdir -p ~/.ssh
printf '%s\n' "$STAGING_SSH_KEY" | tr -d '\r' > ~/.ssh/staging_key
ssh-keygen -y -f ~/.ssh/staging_key > /dev/null 2>&1 || { echo "::error::STAGING_SSH_KEY is not a valid private key (paste the whole file, including the BEGIN/END lines; no passphrase)"; exit 1; }
PORT=22   # ufw on the box allows 22 only
if [[ -n ${STAGING_HOST_KEY:-} ]]; then
  printf '%s\n' "$STAGING_HOST_KEY" > ~/.ssh/known_hosts; echo "host key: pinned from STAGING_HOST_KEY"
else
  for _ in 1 2 3; do ssh-keyscan -T 10 -p "$PORT" -t ed25519 "$STAGING_HOST" 2>/dev/null > ~/.ssh/known_hosts && [[ -s ~/.ssh/known_hosts ]] && break; sleep 5; done
  [[ -s ~/.ssh/known_hosts ]] || { echo "::error::could not reach the server on ssh port $PORT (is STAGING_HOST right and the box up?)"; exit 1; }
  echo "host key: trust on first use, fingerprint $(ssh-keygen -lf ~/.ssh/known_hosts | awk '{print $2}') (set STAGING_HOST_KEY to pin it)"
fi
cat > ~/.ssh/config <<CFG
Host staging
  HostName $STAGING_HOST
  User $STAGING_USER
  Port $PORT
  IdentityFile ~/.ssh/staging_key
  IdentitiesOnly yes
  StrictHostKeyChecking yes
  UserKnownHostsFile ~/.ssh/known_hosts
  ServerAliveInterval 20
  ServerAliveCountMax 6
  ConnectTimeout 20
  LogLevel ERROR
CFG
ssh -o BatchMode=yes staging true || { echo "::error::ssh login failed (is the public half of STAGING_SSH_KEY in ~$STAGING_USER/.ssh/authorized_keys, and STAGING_USER right?)"; exit 1; }
ssh -o BatchMode=yes staging 'sudo -n true' || { echo "::error::$STAGING_USER cannot sudo without a password"; exit 1; }
echo "ssh: ok (sudo ok)"
