# Unser Nest auf dem VPS (homebase.steppa.online)

## Variante A: Vom eigenen Rechner aus (ein Befehl)

```bash
cd familienapp
./deploy/deploy.sh root@<VPS-IP>
```

## Variante B: Direkt auf dem VPS

```bash
# ZIP/Ordner auf den Server kopieren, dann dort:
cd familienapp
sudo ./deploy/install.sh
```

Das Skript (Debian/Ubuntu):

1. installiert Node.js 22, falls nötig,
2. kopiert die App nach `/opt/homebase`. Die Daten liegen in `/var/lib/homebase` (inkl. täglicher Sicherungen),
3. richtet den systemd-Dienst `homebase` ein (Port 3080, nur lokal erreichbar),
4. richtet HTTPS ein:
   - **Caddy** wird genutzt oder installiert, wenn Port 80/443 frei sind oder Caddy gehören. Das Zertifikat kommt automatisch.
   - **nginx** wird genutzt, wenn nginx schon läuft. Das Zertifikat kommt per certbot.
   - Gehören die Ports etwas anderem (z. B. Traefik in Docker), fasst das Skript nichts an und zeigt, wohin weitergeleitet werden muss.

Optionen per Umgebungsvariable: `DOMAIN`, `PORT` (3080), `EMAIL` (für Let's Encrypt), `PROXY` (`auto|caddy|nginx|none`).

**Update:** Den gleichen Befehl erneut ausführen. Die Daten bleiben erhalten.

## DNS

Beim DNS-Anbieter von `steppa.online` (Cloudflare) einen Eintrag anlegen:

| Typ | Name | Inhalt |
|---|---|---|
| A | homebase | IPv4 des VPS |
| AAAA | homebase | IPv6 des VPS (optional) |

Bei Cloudflare zuerst „DNS only“ (graue Wolke) wählen, bis das Zertifikat da ist. Danach kann die Wolke orange sein, mit SSL-Modus „Full (strict)“.

## Nützliches

```bash
systemctl status homebase        # läuft er?
journalctl -u homebase -f        # Logs
ls /var/lib/homebase/backups     # Sicherungen
```
