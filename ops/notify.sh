#!/usr/bin/env bash
# Pluggable alert notifier.  notify.sh <subject> [body-file|-]      notify.sh --test
# Channels (settings pushed from GitHub secrets into /srv/blindrise/shared/ops.env, mode 600):
#   email   STAGING_SMTP_URL (smtps://user:pass@host:465 or smtp://user:pass@host:587, STARTTLS required) +
#           STAGING_ALERT_TO (+ optional STAGING_ALERT_FROM, default = STAGING_ALERT_TO)
#   webhook STAGING_ALERT_WEBHOOK: POST JSON {"text","content","subject","body"} (Slack, Discord, ntfy, a generic hook)
# With neither configured the alert is only logged (journal tag blindrise-alert + state/alerts.log).
# Credentials and URLs go to curl through a config file on stdin, never on the command line, and are never printed.
# Prints one line: "notify: email=ok|FAILED|off webhook=ok|FAILED|off" and exits 1 if every configured channel failed.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
if [[ ${1:-} == --test ]]; then
  SUBJECT="[blindrise staging] test alert"; BODY="This is a test alert from the Blindrise staging monitor, sent $(date -u '+%F %T') UTC. No action needed."
else
  SUBJECT=${1:?subject}; SRC=${2:--}
  if [[ $SRC == - ]]; then BODY=$(cat); else BODY=$(cat "$SRC"); fi
fi
SMTP_URL=$(cfg STAGING_SMTP_URL); TO=$(cfg STAGING_ALERT_TO); FROM=$(cfg STAGING_ALERT_FROM); HOOK=$(cfg STAGING_ALERT_WEBHOOK)
FROM=${FROM:-$TO}
install -d -m 750 "$BR_STATE"
printf '%s %s\n' "$(date -u +%FT%TZ)" "$SUBJECT" >> "$BR_STATE/alerts.log"
have logger && logger -t blindrise-alert -- "$SUBJECT" || true
cq(){ local s=${1//\\/\\\\}; printf '"%s"' "${s//\"/\\\"}"; }   # quote for a curl config file
urldecode(){ local s=${1//+/ }; printf '%b' "${s//%/\\x}"; }

EMAIL=off; WEBHOOK=off
if [[ -n $SMTP_URL && -n $TO ]]; then
  # split user:pass out of the URL so curl gets them as --user, not inside the URL
  if [[ $SMTP_URL =~ ^(smtps?)://([^@/]*)@([^/]+)/?$ ]]; then
    SCHEME=${BASH_REMATCH[1]}; CRED=${BASH_REMATCH[2]}; HOSTPORT=${BASH_REMATCH[3]}
    U=$(urldecode "${CRED%%:*}"); P=$( [[ $CRED == *:* ]] && urldecode "${CRED#*:}" || true )
  elif [[ $SMTP_URL =~ ^(smtps?)://([^/@]+)/?$ ]]; then
    SCHEME=${BASH_REMATCH[1]}; HOSTPORT=${BASH_REMATCH[2]}; U=; P=
  else SCHEME=; fi
  if [[ -n ${SCHEME:-} ]]; then
    MSG=$(mktemp); chmod 600 "$MSG"
    { printf 'From: Blindrise staging <%s>\r\nTo: <%s>\r\nSubject: %s\r\nDate: %s\r\nMessage-ID: <%s.%s@blindrise-staging>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n' \
        "$FROM" "$TO" "$SUBJECT" "$(date -R)" "$(date +%s%N)" "$$"
      printf '%s\r\n' "$BODY"; } > "$MSG"
    if { echo "url = $(cq "$SCHEME://$HOSTPORT")"
         [[ -n $U ]] && echo "user = $(cq "$U:$P")"
         echo "mail-from = $(cq "$FROM")"; echo "mail-rcpt = $(cq "$TO")"
         echo "upload-file = $(cq "$MSG")"; echo "ssl-reqd"; echo "silent"; echo "show-error"; echo "max-time = 30"
       } | curl -K - >/dev/null 2>"$MSG.err"; then EMAIL=ok
    else EMAIL="FAILED($(grep -o 'curl: ([0-9]*)' "$MSG.err" | head -1 | tr -dc '0-9'))"; fi
    rm -f "$MSG" "$MSG.err"
  else EMAIL="FAILED(bad STAGING_SMTP_URL format)"; fi
fi
if [[ -n $HOOK ]]; then
  PAYLOAD=$(jq -cn --arg s "$SUBJECT" --arg b "$BODY" '{text: ($s + "\n" + $b), content: (($s + "\n" + $b)[0:1900]), subject: $s, body: $b}')
  if { echo "url = $(cq "$HOOK")"; echo 'header = "Content-Type: application/json"'; echo "fail"; echo "silent"; echo "max-time = 20"
       echo "data = $(cq "$PAYLOAD")"; } | curl -K - -o /dev/null 2>/dev/null; then WEBHOOK=ok; else WEBHOOK=FAILED; fi
fi
echo "notify: email=$EMAIL webhook=$WEBHOOK$( [[ $EMAIL == off && $WEBHOOK == off ]] && echo ' (no channel configured: logged only)')"
[[ $EMAIL == off && $WEBHOOK == off ]] && exit 0
[[ $EMAIL == ok || $WEBHOOK == ok ]]
