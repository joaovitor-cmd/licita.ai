#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
sh deploy/scripts/compose.sh config --quiet
sh deploy/scripts/compose.sh build
sh deploy/scripts/compose.sh up -d --wait --wait-timeout 180 api console-api nginx
sh deploy/scripts/compose.sh ps
echo 'Confira login, radar e envio. Para certificado inicial, execute bootstrap-tls.sh.'
