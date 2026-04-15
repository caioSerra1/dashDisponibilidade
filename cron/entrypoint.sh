#!/bin/sh
set -e

: "${CRON_SECRET:?CRON_SECRET env var required}"
: "${APP_URL:?APP_URL env var required (no trailing slash)}"

echo "[cron] APP_URL=$APP_URL TZ=$(cat /etc/timezone)"

mkdir -p /etc/crontabs
cat > /etc/crontabs/root <<EOF
# apuração diária às 03:00 (horário de Brasília)
0 3 * * * curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/calculate/daily" >> /var/log/cron.log 2>&1
# fechamento do mês às 00:10 do dia 1
10 0 1 * * curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/calculate/close" >> /var/log/cron.log 2>&1
EOF

touch /var/log/cron.log
echo "[cron] crontab loaded:"
cat /etc/crontabs/root

# tail the log in background so crond output aparece no stdout do container
tail -F /var/log/cron.log &

exec crond -f -L /dev/stdout
