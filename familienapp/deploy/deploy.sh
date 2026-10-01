#!/usr/bin/env bash
# Vom eigenen Rechner aus auf den VPS ausrollen (neu oder als Update):
#
#   ./deploy/deploy.sh root@123.45.67.89
#   ./deploy/deploy.sh stefan@mein-vps homebase.steppa.online
#
# Kopiert die App per SSH auf den Server und startet dort install.sh.
set -euo pipefail
TARGET="${1:?Aufruf: ./deploy/deploy.sh benutzer@vps [domain]}"
DOMAIN="${2:-homebase.steppa.online}"
cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo "🏡 Kopiere App nach $TARGET …"
tar czf - --exclude=./data --exclude=./node_modules --exclude=./test . \
  | ssh "$TARGET" 'rm -rf /tmp/homebase-src && mkdir -p /tmp/homebase-src && tar xzf - -C /tmp/homebase-src'

echo "🏡 Starte Installation auf dem Server …"
ssh -t "$TARGET" "sudo DOMAIN='$DOMAIN' EMAIL='${EMAIL:-}' bash /tmp/homebase-src/deploy/install.sh && rm -rf /tmp/homebase-src"
