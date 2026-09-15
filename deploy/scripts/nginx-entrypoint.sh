#!/bin/sh
set -eu
cert=/etc/letsencrypt/live/licitaro/fullchain.pem
if [ -s "$cert" ]; then
  cp /etc/licitaro-nginx/tls.conf /etc/nginx/conf.d/default.conf
else
  cp /etc/licitaro-nginx/bootstrap.conf /etc/nginx/conf.d/default.conf
fi
nginx -t
(
  last=''
  while sleep 60; do
    if [ -f /var/www/certbot/renewed ]; then
      current=$(cat /var/www/certbot/renewed)
      if [ "$current" != "$last" ] && [ -s "$cert" ]; then
        cp /etc/licitaro-nginx/tls.conf /etc/nginx/conf.d/default.conf
        if nginx -t && nginx -s reload; then last=$current; fi
      fi
    fi
  done
) &
exec nginx -g 'daemon off;'
