#!/bin/sh
set -eu
trap 'exit 0' TERM INT
while :; do
  certbot renew --webroot -w /var/www/certbot --non-interactive \
    --deploy-hook 'date +%s > /var/www/certbot/renewed' || echo 'Falha ao renovar certificado. Verifique os logs.' >&2
  sleep 43200 &
  wait $! || exit 0
done
