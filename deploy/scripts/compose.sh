#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
if [ ! -f .env.production ]; then echo 'Crie .env.production usando .env.production.example.' >&2; exit 1; fi
exec docker compose --env-file .env.production -f compose.prod.yml "$@"
