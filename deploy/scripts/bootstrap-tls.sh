#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
if [ "$#" -ne 1 ]; then echo 'Uso: sh deploy/scripts/bootstrap-tls.sh seu-email@dominio.com' >&2; exit 1; fi
sh deploy/scripts/compose.sh up -d nginx
sh deploy/scripts/compose.sh run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot --cert-name licitaro \
  -d app.licitaro.com.br -d gestao.licitaro.com.br \
  --email "$1" --agree-tos --non-interactive --keep-until-expiring
sh deploy/scripts/compose.sh restart nginx
sh deploy/scripts/compose.sh up -d certbot
sh deploy/scripts/compose.sh exec -T nginx nginx -t
