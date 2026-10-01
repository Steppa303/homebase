#!/usr/bin/env bash
# Installiert oder aktualisiert "Unser Nest" auf einem Linux-VPS (Debian/Ubuntu).
#
#   sudo ./deploy/install.sh                       # Standard: homebase.steppa.online
#   sudo DOMAIN=nest.example.org ./deploy/install.sh
#
# Was passiert:
#   1. Node.js wird installiert, falls es fehlt oder älter als 18 ist
#   2. App nach /opt/homebase kopieren, Daten liegen in /var/lib/homebase
#   3. systemd-Dienst "homebase" (startet automatisch, auch nach Reboot)
#   4. HTTPS über Caddy oder nginx + Let's Encrypt (was schon da ist, wird genutzt)
#
# Erneut ausführen = Update. Die Daten bleiben dabei erhalten.
set -euo pipefail

DOMAIN="${DOMAIN:-homebase.steppa.online}"
PORT="${PORT:-3080}"
APP_DIR="${APP_DIR:-/opt/homebase}"
DATA_DIR="${DATA_DIR:-/var/lib/homebase}"
SERVICE="${SERVICE:-homebase}"
APP_USER="${APP_USER:-homebase}"
EMAIL="${EMAIL:-}"            # optional für Let's Encrypt (nur bei nginx/certbot)
PROXY="${PROXY:-auto}"        # auto | caddy | nginx | none

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

say()  { printf '\n\033[1;33m🏡 %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Bitte mit sudo bzw. als root ausführen."
[ -f "$SRC_DIR/server.js" ] || die "server.js nicht gefunden – Skript aus dem entpackten familienapp-Ordner starten."
command -v apt-get >/dev/null || die "Dieses Skript unterstützt Debian/Ubuntu (apt). Für andere Systeme siehe deploy/README.md."

# --- 1. Node.js ---------------------------------------------------------------
# Node muss für den Dienst-Benutzer erreichbar sein (also nicht per nvm in /root oder /home)
node_ok() {
  command -v node >/dev/null || return 1
  case "$(readlink -f "$(command -v node)")" in /root/*|/home/*) return 1 ;; esac
  [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ]
}
if ! node_ok; then
  say "Installiere Node.js 22 …"
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg >/dev/null
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
hash -r
NODE_BIN="/usr/bin/node"
node_ok && NODE_BIN="$(readlink -f "$(command -v node)")"
say "Node.js $("$NODE_BIN" -v) gefunden ($NODE_BIN)"

# --- 2. Benutzer, Dateien -----------------------------------------------------
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR" "$DATA_DIR"
say "Kopiere App nach $APP_DIR …"
# Alte Programmdateien ersetzen (Daten liegen woanders und bleiben unberührt)
rm -rf "$APP_DIR/public"
cp -r "$SRC_DIR/server.js" "$SRC_DIR/package.json" "$SRC_DIR/public" "$APP_DIR/"
chown -R root:root "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$DATA_DIR"
chmod 750 "$DATA_DIR"

# --- 3. systemd ---------------------------------------------------------------
say "Richte Dienst '$SERVICE' ein (Port $PORT, nur lokal erreichbar) …"
cat > "/etc/systemd/system/$SERVICE.service" <<EOF
[Unit]
Description=Unser Nest – Familien-App ($DOMAIN)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=$PORT
Environment=HOST=127.0.0.1
Environment=NEST_DATA_DIR=$DATA_DIR
ExecStart=$NODE_BIN $APP_DIR/server.js
Restart=always
RestartSec=3
# Absicherung
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DATA_DIR

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null 2>&1
systemctl restart "$SERVICE"

for _ in $(seq 1 20); do
  curl -fsS "http://127.0.0.1:$PORT/api/status" >/dev/null 2>&1 && break
  sleep 0.5
done
curl -fsS "http://127.0.0.1:$PORT/api/status" >/dev/null || { journalctl -u "$SERVICE" -n 30 --no-pager; die "Dienst startet nicht."; }
say "Dienst läuft ✔"

# --- 4. Reverse Proxy + HTTPS -------------------------------------------------
port_owner() { ss -ltnpH "sport = :$1" 2>/dev/null | sed -n 's/.*users:(("\([^"]*\)".*/\1/p' | head -1; }

if [ "$PROXY" = "auto" ]; then
  owner80="$(port_owner 80)"
  owner443="$(port_owner 443)"
  if command -v caddy >/dev/null && { [ -z "$owner443" ] || [ "$owner443" = "caddy" ]; } && { [ -z "$owner80" ] || [ "$owner80" = "caddy" ]; }; then PROXY=caddy
  elif command -v nginx >/dev/null && { [ -z "$owner443" ] || [ "$owner443" = "nginx" ]; } && { [ -z "$owner80" ] || [ "$owner80" = "nginx" ]; }; then PROXY=nginx
  elif [ -z "$owner80" ] && [ -z "$owner443" ]; then PROXY=caddy
  else
    PROXY=none
    say "Port 80/443 gehört bereits '${owner443:-$owner80}' (z. B. Docker/Traefik). Ich fasse ihn nicht an."
  fi
fi

case "$PROXY" in
  caddy)
    if ! command -v caddy >/dev/null; then
      say "Installiere Caddy (automatisches HTTPS) …"
      apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl gnupg >/dev/null
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
      apt-get update -qq && apt-get install -y -qq caddy >/dev/null
    fi
    CADDYFILE=/etc/caddy/Caddyfile
    touch "$CADDYFILE"
    if grep -q "^$DOMAIN" "$CADDYFILE"; then
      say "Caddy kennt $DOMAIN schon – lasse die Konfiguration stehen."
    else
      # Die Beispielseite von Caddy (":80 { … }") würde sonst Port 80 belegen
      if grep -q '^:80 {' "$CADDYFILE" && grep -q '/usr/share/caddy' "$CADDYFILE"; then
        cp "$CADDYFILE" "$CADDYFILE.bak.$(date +%s)"
        : > "$CADDYFILE"
      fi
      cat >> "$CADDYFILE" <<EOF

$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:$PORT
}
EOF
    fi
    caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null
    systemctl enable caddy >/dev/null 2>&1 || true
    systemctl reload caddy 2>/dev/null || systemctl restart caddy
    ;;
  nginx)
    CONF=/etc/nginx/sites-available/$SERVICE.conf
    [ -d /etc/nginx/sites-available ] || CONF=/etc/nginx/conf.d/$SERVICE.conf
    if [ ! -f "$CONF" ]; then
      cat > "$CONF" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    client_max_body_size 12m;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        # Live-Updates (Server-Sent Events) nicht puffern
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
    }
}
EOF
      [ -d /etc/nginx/sites-enabled ] && ln -sf "$CONF" "/etc/nginx/sites-enabled/$SERVICE.conf"
    fi
    nginx -t && systemctl reload nginx
    if ! command -v certbot >/dev/null; then
      apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
    fi
    say "Hole HTTPS-Zertifikat für $DOMAIN …"
    if [ -n "$EMAIL" ]; then MAILOPT=(-m "$EMAIL"); else MAILOPT=(--register-unsafely-without-email); fi
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect "${MAILOPT[@]}" \
      || say "Zertifikat konnte (noch) nicht geholt werden – zeigt der DNS-Eintrag schon auf diesen Server? Danach: certbot --nginx -d $DOMAIN"
    ;;
  none)
    cat <<EOF

Leite in deinem bestehenden Reverse Proxy $DOMAIN auf http://127.0.0.1:$PORT weiter.
Wichtig für Live-Updates: Antworten nicht puffern (nginx: proxy_buffering off)
und den Header X-Forwarded-Proto mitschicken.
Läuft der Proxy in Docker, statt 127.0.0.1 die Docker-Host-IP nehmen und
HOST=0.0.0.0 in /etc/systemd/system/$SERVICE.service setzen (Port $PORT dann per Firewall schützen).
EOF
    ;;
esac

IP4="$(curl -4fsS -m 5 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
cat <<EOF

────────────────────────────────────────────────────────────
✅ Fertig! Unser Nest läuft.

  Adresse:   https://$DOMAIN
  Dienst:    systemctl status $SERVICE   ·   Logs: journalctl -u $SERVICE -f
  Daten:     $DATA_DIR (tägliche Sicherungen in $DATA_DIR/backups)

DNS: Bei deinem DNS-Anbieter einen A-Eintrag anlegen:
  homebase  →  $IP4
(Bei Cloudflare zuerst "DNS only" (graue Wolke), bis das Zertifikat da ist;
 danach darf sie orange sein, SSL-Modus dann "Full (strict)".)

Dann https://$DOMAIN öffnen und das Nest einrichten. 🐈🐈‍⬛
────────────────────────────────────────────────────────────
EOF
