# 🏡 Unser Nest

Eine Familien-Organisations-App für euren Zwei-Personen-Haushalt (plus zwei Katzen 🐈🐈‍⬛).
Läuft im Browser auf beiden Handys und am Rechner. Alles, was eine Person ändert, erscheint **sofort live** beim anderen.

## Was kann das Nest?

| Bereich | Funktionen |
|---|---|
| **Heute** | Übersicht: Katzen gefüttert?, fällige Aufgaben, Termine der nächsten 7 Tage, Einkaufsliste, heutiges Essen, Kassenstand, Geburtstage, „Wer hat diese Woche wie viel erledigt“, angepinnte Notizen |
| **Einkauf** | Geteilte Liste, automatisch nach Supermarkt-Abteilungen sortiert (Obst & Gemüse, Kühlregal, Tierbedarf …). Schnelleingabe mit Mengen („2x Milch“) und mehreren Sachen auf einmal („Milch, Eier, Brot“), Vorschläge „Oft gekauft“, „Im Wagen“-Bereich, zweite Liste „Irgendwann“ für Wünsche und Anschaffungen |
| **Kalender** | Gemeinsamer Monatskalender, farbig nach Person (du / deine Frau / beide / Katzen), wiederkehrende Termine (wöchentlich, monatlich, jährlich), mehrtägige Termine (Urlaub), Geburtstage automatisch. **Kalender-Abo** (iCal) fürs iPhone/Google/Outlook |
| **Aufgaben** | Haushalts-Aufgaben mit Zuständigkeit und Rhythmus (täglich, wöchentlich, alle 90 Tage …). Beim Abhaken springt die Aufgabe automatisch auf den nächsten Termin |
| **Katzen** | Fütterungs-Tracker (wer hat wann gefüttert – nie wieder doppelt füttern), Steckbrief (Chip-Nr., Futter, Tierarzt mit Anruf-Link), Gewichtskurve, Tagebuch für Tierarzt, Impfungen und Medikamente, Pflege-Termine (Entwurmung, Katzenklo, Trinkbrunnen …) |
| **Essensplan** | Wochenplan, wer kocht, Zutaten mit einem Tipp auf die Einkaufsliste, „Eure Klassiker“ merkt sich Gerichte samt Zutaten |
| **Haushaltskasse** | Gemeinsame Ausgaben eintragen, 50/50 oder „komplett für die andere Person“. Zeigt, wer wem wie viel schuldet, plus „Ausgleichen“-Knopf und Monatsübersicht nach Kategorien |
| **Pinnwand** | Bunte Notizen für WLAN-Passwort, Urlaubsideen, Geschenkideen … mit Anpinnen und Suche |

Außerdem:
- **Installierbar wie eine App** (PWA): Im Browser „Zum Home-Bildschirm hinzufügen“.
- **Offline-fähig**: Im Supermarkt ohne Empfang abhaken → wird übertragen, sobald wieder Netz da ist.
- **Dark Mode** (automatisch oder fest einstellbar).
- **Rückgängig** nach fast jeder Aktion.
- **Datensicherung**: täglich automatisch auf dem Server (14 Tage), dazu Export/Import als JSON.

## Starten

Voraussetzung: [Node.js](https://nodejs.org) ab Version 18. Es werden **keine** npm-Pakete benötigt.

```bash
cd familienapp
npm start
```

Dann im Browser `http://localhost:3000` öffnen. Beim ersten Aufruf richtet ihr das Nest ein: eure Namen, die Namen der Katzen und ein gemeinsames Passwort.

Einstellungen über Umgebungsvariablen:

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | `3000` | Port des Servers |
| `HOST` | `0.0.0.0` | Adresse, auf der gelauscht wird (`127.0.0.1` hinter einem Reverse Proxy) |
| `NEST_DATA_DIR` | `./data` | Ordner für die Daten (`nest.json`) und die täglichen Sicherungen |

## Auf beiden Handys nutzen

**Für den eigenen VPS gibt es ein fertiges Skript:** siehe [`deploy/README.md`](deploy/README.md). Ein Befehl richtet Dienst, HTTPS und Domain ein (Standard: `homebase.steppa.online`).

Damit ihr beide von überall zugreifen könnt, muss der Server erreichbar sein. Drei Möglichkeiten:

1. **Im Heimnetz** (am einfachsten): Auf einem Rechner, Raspberry Pi oder NAS zu Hause starten und auf den Handys `http://<IP-des-Rechners>:3000` öffnen. Funktioniert dann nur im WLAN zu Hause (unterwegs greift der Offline-Modus).
2. **Bei einem Node-Hoster** (z. B. EvenNode, Render, Fly.io, Railway, Uberspace): Den Ordner `familienapp` hochladen, Startbefehl `node server.js`. Wichtig: Der Hoster muss **dauerhaften Speicher** haben, sonst sind die Daten nach einem Neustart weg. `NEST_DATA_DIR` auf den dauerhaften Ordner setzen.
3. **Zu Hause + Tunnel** (z. B. Tailscale oder Cloudflare Tunnel): Server zu Hause, von unterwegs trotzdem erreichbar.

Für den Zugriff übers Internet bitte **HTTPS** verwenden (bieten die Hoster und Tunnel meist automatisch). Die App erkennt HTTPS hinter einem Proxy über `X-Forwarded-Proto` und setzt dann sichere Cookies.

## Sicherheit

- Anmeldung mit einem gemeinsamen Haushalts-Passwort (gespeichert als scrypt-Hash), Sitzung per HttpOnly-Cookie (1 Jahr).
- Schutz gegen zu viele Login-Versuche, CSRF-Schutz, Content-Security-Policy.
- Beim Passwortwechsel werden alle anderen Geräte abgemeldet.
- Der Kalender-Abo-Link enthält einen geheimen Schlüssel. Er lässt sich in den Einstellungen jederzeit erneuern.

## Tests

```bash
npm test
```

## Aufbau

```
familienapp/
├── server.js          # HTTP-Server: API, Live-Updates (SSE), Login, iCal, statische Dateien
├── public/
│   ├── index.html, sw.js, manifest.webmanifest, icons/
│   ├── css/app.css
│   └── js/
│       ├── app.js       # Start, Einrichtung, Login, Navigation
│       ├── store.js     # Zustand, Sync mit dem Server, Offline-Warteschlange
│       ├── domain.js    # Fachlogik: Kategorien, Wiederholungen, Saldo …
│       ├── ui.js        # DOM-Helfer, Icons, Dialoge, Datumsfunktionen
│       └── views/       # heute, einkauf, kalender, aufgaben, katzen, essen, kasse, pinnwand, einstellungen
└── test/server.test.js
```
