'use strict';
// Unser Nest – Familien-Organisations-App
// Kleiner Node.js-Server ohne externe Abhängigkeiten: statische Dateien, JSON-API,
// Live-Updates per Server-Sent Events, Login per Haushaltspasswort und ein
// Kalender-Abo (iCal) für Handy-Kalender.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PUBLIC_DIR = path.join(__dirname, 'public');
const COLLECTIONS = ['shopping', 'events', 'tasks', 'meals', 'expenses', 'notes', 'pets', 'petlog'];
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BODY = 512 * 1024;
const MAX_IMPORT = 10 * 1024 * 1024;
const SESSION_COOKIE = 'nest_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 365; // 1 Jahr – es ist ja das eigene Zuhause

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

// ---------------------------------------------------------------------------
// Hilfsfunktionen

function newId() {
  return crypto.randomBytes(9).toString('base64url');
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, auth) {
  if (!auth || !auth.salt || !auth.hash) return false;
  const { hash } = hashPassword(password, auth.salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(auth.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Entfernt gefährliche Schlüssel (Prototype Pollution) und begrenzt die Tiefe.
function clean(value, depth = 0) {
  if (depth > 8) return null;
  if (Array.isArray(value)) return value.slice(0, 1000).map((v) => clean(v, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      out[key] = clean(value[key], depth + 1);
    }
    return out;
  }
  if (typeof value === 'string') return value.slice(0, 20000);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean' || value === null) return value;
  return null;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('Anfrage zu groß'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Ungültiges JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(data);
}

// ---------------------------------------------------------------------------
// Datenspeicher (eine JSON-Datei, atomar geschrieben, tägliche Sicherung)

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'nest.json');
    fs.mkdirSync(dir, { recursive: true });
    this.db = this.load();
    this.saveTimer = null;
    this.backup();
  }

  empty() {
    const data = {};
    for (const c of COLLECTIONS) data[c] = {};
    return { version: 1, settings: null, auth: null, sessions: {}, icsToken: null, data };
  }

  load() {
    if (!fs.existsSync(this.file)) return this.empty();
    const db = { ...this.empty(), ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    for (const c of COLLECTIONS) if (!isPlainObject(db.data[c])) db.data[c] = {};
    return db;
  }

  backup() {
    if (!fs.existsSync(this.file)) return;
    const dir = path.join(this.dir, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const name = `nest-${new Date().toISOString().slice(0, 10)}.json`;
    const target = path.join(dir, name);
    if (!fs.existsSync(target)) fs.copyFileSync(this.file, target);
    const files = fs.readdirSync(dir).filter((f) => f.startsWith('nest-')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - 14))) fs.unlinkSync(path.join(dir, f));
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 150);
  }

  flush() {
    clearTimeout(this.saveTimer);
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.db));
    fs.renameSync(tmp, this.file);
  }

  touch() {
    this.db.version += 1;
    this.save();
    return this.db.version;
  }

  publicState() {
    const data = {};
    for (const c of COLLECTIONS) data[c] = Object.values(this.db.data[c]);
    return { version: this.db.version, settings: this.db.settings, data };
  }
}

// ---------------------------------------------------------------------------
// Startdaten beim Einrichten

function seedData(store, settings) {
  const today = new Date();
  const iso = (offset) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const [a, b] = settings.members.map((m) => m.id);
  const now = new Date().toISOString();
  const tasks = [
    { title: 'Katzenklo säubern', assignee: 'both', repeatDays: 1, due: iso(0), pet: 'all' },
    { title: 'Katzenstreu komplett wechseln', assignee: a, repeatDays: 14, due: iso(3), pet: 'all' },
    { title: 'Trinkbrunnen reinigen', assignee: b, repeatDays: 7, due: iso(2), pet: 'all' },
    { title: 'Entwurmung', assignee: 'both', repeatDays: 90, due: iso(20), pet: 'all' },
    { title: 'Krallen & Fell checken', assignee: 'both', repeatDays: 30, due: iso(6), pet: 'all' },
    { title: 'Staubsaugen', assignee: a, repeatDays: 7, due: iso(1) },
    { title: 'Bad putzen', assignee: b, repeatDays: 7, due: iso(4) },
    { title: 'Bettwäsche wechseln', assignee: 'both', repeatDays: 14, due: iso(5) },
    { title: 'Müll & Altpapier rausbringen', assignee: 'both', repeatDays: 3, due: iso(0) },
    { title: 'Pflanzen gießen', assignee: 'both', repeatDays: 4, due: iso(1) },
  ];
  for (const t of tasks) {
    const id = newId();
    store.db.data.tasks[id] = { id, notes: '', done: false, history: [], createdAt: now, updatedAt: now, pet: null, ...t };
  }
  const shopping = [
    ['Katzenfutter (Nassfutter)', 'Tierbedarf'],
    ['Katzenstreu', 'Tierbedarf'],
    ['Milch', 'Kühlregal'],
    ['Äpfel', 'Obst & Gemüse'],
  ];
  for (const [text, category] of shopping) {
    const id = newId();
    store.db.data.shopping[id] = { id, text, qty: '', category, list: 'main', done: false, by: a, createdAt: now, updatedAt: now };
  }
  const noteId = newId();
  store.db.data.notes[noteId] = {
    id: noteId,
    title: 'Willkommen im Nest 🏡',
    body: 'Hier ist Platz für alles, was ihr euch merken wollt: WLAN-Passwort, Ideen fürs Wochenende, Geschenkideen …',
    color: 'yellow',
    pinned: true,
    by: a,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// iCal-Export

function icsEscape(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function icsFold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts = [];
  let current = '';
  for (const ch of line) {
    if (Buffer.byteLength(current + ch, 'utf8') > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = '';
    }
    current += ch;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function icsDate(iso) {
  return iso.replace(/-/g, '');
}

function nextDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}

function buildIcs(state) {
  const settings = state.settings || { members: [], householdName: 'Unser Nest' };
  const who = (id) => {
    if (id === 'all' || id === 'both') return 'Alle';
    const m = (settings.members || []).find((x) => x.id === id);
    if (m) return m.name;
    const p = state.data.pets.find((x) => x.id === id);
    if (p) return p.name;
    if (id === 'pets') return 'Katzen';
    return '';
  };
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Unser Nest//Familienkalender//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(settings.householdName || 'Unser Nest')}`,
  ];
  const rrule = { weekly: 'FREQ=WEEKLY', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY' };
  const vevent = (uid, e) => {
    lines.push('BEGIN:VEVENT', `UID:${uid}@unser-nest`, `DTSTAMP:${stamp}`);
    if (e.time) {
      const start = `${icsDate(e.date)}T${e.time.replace(':', '')}00`;
      const endDate = e.endDate || e.date;
      const endTime = e.endTime || e.time;
      let end = `${icsDate(endDate)}T${endTime.replace(':', '')}00`;
      if (end <= start) {
        // Ohne (sinnvolle) Endzeit: eine Stunde
        const [y, mo, d] = e.date.split('-').map(Number);
        const [h, mi] = e.time.split(':').map(Number);
        end = new Date(Date.UTC(y, mo - 1, d, h + 1, mi)).toISOString().replace(/[-:]/g, '').slice(0, 15);
      }
      lines.push(`DTSTART:${start}`, `DTEND:${end}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(e.date)}`, `DTEND;VALUE=DATE:${icsDate(nextDay(e.endDate || e.date))}`);
    }
    if (rrule[e.repeat]) lines.push(`RRULE:${rrule[e.repeat]}${e.until ? `;UNTIL=${icsDate(e.until)}` : ''}`);
    const person = who(e.who);
    lines.push(`SUMMARY:${icsEscape(e.title + (person && person !== 'Alle' ? ` (${person})` : ''))}`);
    if (e.notes) lines.push(`DESCRIPTION:${icsEscape(e.notes)}`);
    if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
    lines.push('END:VEVENT');
  };
  for (const e of state.data.events) {
    if (!e.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
    if (e.time && !/^\d{2}:\d{2}$/.test(e.time)) continue;
    vevent(e.id, e);
  }
  const birthdays = [
    ...(settings.members || []).map((m) => ({ id: `bday-${m.id}`, name: m.name, birthday: m.birthday })),
    ...state.data.pets.map((p) => ({ id: `bday-${p.id}`, name: p.name, birthday: p.birthday })),
  ];
  for (const b of birthdays) {
    if (!b.birthday || !/^\d{4}-\d{2}-\d{2}$/.test(b.birthday)) continue;
    vevent(b.id, { title: `🎂 Geburtstag ${b.name}`, date: b.birthday, repeat: 'yearly', who: 'all' });
  }
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------
// Server

function createApp(options = {}) {
  const dataDir = options.dataDir || process.env.NEST_DATA_DIR || path.join(__dirname, 'data');
  const store = new Store(dataDir);
  const clients = new Set();
  const loginAttempts = new Map();

  // Profilbilder der Haustiere liegen als JPEG neben nest.json, damit der
  // Zustand (der bei jeder Änderung komplett geladen wird) klein bleibt.
  const photoDir = path.join(dataDir, 'photos');
  fs.mkdirSync(photoDir, { recursive: true });
  // Nicht mehr verwendete Bilder (ersetzt, Tier gelöscht) beim Start aufräumen
  const usedPhotos = new Set(Object.values(store.db.data.pets).map((p) => p.photo).filter(Boolean));
  for (const f of fs.readdirSync(photoDir)) {
    if (!usedPhotos.has(path.basename(f, '.jpg'))) fs.unlinkSync(path.join(photoDir, f));
  }

  function broadcast(extra = {}) {
    const payload = `event: change\ndata: ${JSON.stringify({ version: store.db.version, ...extra })}\n\n`;
    for (const res of clients) res.write(payload);
  }

  function isHttps(req) {
    return req.headers['x-forwarded-proto'] === 'https' || !!req.socket.encrypted;
  }

  function sessionCookie(req, token, maxAge = SESSION_MAX_AGE) {
    return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;
  }

  function createSession(req) {
    const token = crypto.randomBytes(32).toString('base64url');
    store.db.sessions[sha256(token)] = { created: Date.now(), lastSeen: Date.now(), agent: String(req.headers['user-agent'] || '').slice(0, 120) };
    store.save();
    return token;
  }

  function currentSession(req) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;
    const key = sha256(token);
    const s = store.db.sessions[key];
    if (!s) return null;
    if (Date.now() - s.lastSeen > 60 * 60 * 1000) {
      s.lastSeen = Date.now();
      store.save();
    }
    return key;
  }

  function tooManyAttempts(req) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    const now = Date.now();
    const list = (loginAttempts.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
    list.push(now);
    loginAttempts.set(ip, list);
    return list.length > 10;
  }

  function normalizeMember(m, i) {
    const defaults = [
      { emoji: '🧑', color: '#d9694a' },
      { emoji: '👩', color: '#2f8f83' },
    ];
    const d = defaults[i] || defaults[0];
    return {
      id: typeof m.id === 'string' && ID_RE.test(m.id) ? m.id : newId(),
      name: String(m.name || `Person ${i + 1}`).slice(0, 40),
      emoji: String(m.emoji || d.emoji).slice(0, 8),
      color: /^#[0-9a-fA-F]{6}$/.test(m.color || '') ? m.color : d.color,
      birthday: typeof m.birthday === 'string' ? m.birthday.slice(0, 10) : '',
    };
  }

  async function handleApi(req, res, url) {
    const route = url.pathname.slice('/api'.length);
    const method = req.method;

    // Einfache CSRF-Absicherung: schreibende Aufrufe brauchen diesen Header,
    // den ein fremdes Formular nicht setzen kann.
    if (method !== 'GET' && req.headers['x-requested-with'] !== 'nest') {
      return send(res, 403, { error: 'Fehlender Header' });
    }

    if (route === '/status' && method === 'GET') {
      return send(res, 200, {
        configured: !!store.db.auth,
        authed: !!currentSession(req),
        householdName: store.db.settings?.householdName || 'Unser Nest',
      });
    }

    if (route === '/setup' && method === 'POST') {
      if (store.db.auth) return send(res, 409, { error: 'Bereits eingerichtet' });
      const body = clean(await readBody(req, MAX_BODY));
      if (!body.password || String(body.password).length < 4) return send(res, 400, { error: 'Passwort muss mindestens 4 Zeichen haben' });
      const members = (Array.isArray(body.members) ? body.members : []).slice(0, 6).map(normalizeMember);
      while (members.length < 2) members.push(normalizeMember({}, members.length));
      store.db.auth = hashPassword(body.password);
      store.db.icsToken = crypto.randomBytes(18).toString('base64url');
      store.db.settings = {
        householdName: String(body.householdName || 'Unser Nest').slice(0, 60),
        members,
        feedSlots: ['Morgens', 'Abends'],
        createdAt: new Date().toISOString(),
      };
      const now = new Date().toISOString();
      const petColors = ['#e0a33a', '#7d7fb8', '#c9763d', '#6b9e5a'];
      const pets = (Array.isArray(body.pets) ? body.pets : []).filter((p) => p && p.name).slice(0, 8);
      pets.forEach((p, i) => {
        const id = newId();
        store.db.data.pets[id] = {
          id,
          name: String(p.name).slice(0, 40),
          emoji: String(p.emoji || '🐈').slice(0, 8),
          color: petColors[i % petColors.length],
          birthday: '', breed: '', chip: '', vet: '', vetPhone: '', food: '', notes: '',
          createdAt: now, updatedAt: now,
        };
      });
      if (body.seed) seedData(store, store.db.settings);
      const token = createSession(req);
      store.touch();
      store.flush();
      return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, token) });
    }

    if (route === '/login' && method === 'POST') {
      if (!store.db.auth) return send(res, 409, { error: 'Noch nicht eingerichtet' });
      if (tooManyAttempts(req)) return send(res, 429, { error: 'Zu viele Versuche – bitte 15 Minuten warten' });
      const body = await readBody(req, MAX_BODY);
      if (!verifyPassword(body.password || '', store.db.auth)) return send(res, 401, { error: 'Falsches Passwort' });
      const token = createSession(req);
      return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, token) });
    }

    if (route === '/logout' && method === 'POST') {
      const key = currentSession(req);
      if (key) {
        delete store.db.sessions[key];
        store.save();
      }
      return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
    }

    // Ab hier nur mit Anmeldung
    const session = currentSession(req);
    if (!session) return send(res, 401, { error: 'Nicht angemeldet' });

    if (route === '/state' && method === 'GET') {
      return send(res, 200, store.publicState());
    }

    if (route === '/stream' && method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(`retry: 3000\nevent: hello\ndata: ${JSON.stringify({ version: store.db.version })}\n\n`);
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => {
        clearInterval(ping);
        clients.delete(res);
      });
      return;
    }

    const m = route.match(/^\/data\/([a-z]+)\/([A-Za-z0-9_-]+)$/);
    if (m) {
      const [, col, id] = m;
      if (!COLLECTIONS.includes(col) || !ID_RE.test(id)) return send(res, 404, { error: 'Unbekannt' });
      const items = store.db.data[col];
      const now = new Date().toISOString();
      if (method === 'PUT') {
        const body = clean(await readBody(req, MAX_BODY));
        if (!isPlainObject(body)) return send(res, 400, { error: 'Objekt erwartet' });
        const prev = items[id];
        items[id] = { ...body, id, createdAt: prev?.createdAt || body.createdAt || now, updatedAt: now };
      } else if (method === 'PATCH') {
        const body = clean(await readBody(req, MAX_BODY));
        if (!isPlainObject(body)) return send(res, 400, { error: 'Objekt erwartet' });
        if (!items[id]) return send(res, 404, { error: 'Nicht gefunden' });
        items[id] = { ...items[id], ...body, id, updatedAt: now };
      } else if (method === 'DELETE') {
        delete items[id];
      } else {
        return send(res, 405, { error: 'Methode nicht erlaubt' });
      }
      const version = store.touch();
      broadcast({ col });
      return send(res, 200, { ok: true, version, item: items[id] || null });
    }

    if (route === '/photos' && method === 'POST') {
      const body = await readBody(req, MAX_BODY);
      const prefix = 'data:image/jpeg;base64,';
      const buf = typeof body.data === 'string' && body.data.startsWith(prefix) ? Buffer.from(body.data.slice(prefix.length), 'base64') : null;
      if (!buf || buf.length < 100 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return send(res, 400, { error: 'Kein JPEG-Bild' });
      const id = newId();
      fs.writeFileSync(path.join(photoDir, `${id}.jpg`), buf);
      return send(res, 200, { ok: true, id });
    }

    const photo = route.match(/^\/photos\/([A-Za-z0-9_-]+)$/);
    if (photo && method === 'GET') {
      if (!ID_RE.test(photo[1])) return send(res, 404, 'Nicht gefunden');
      return fs.readFile(path.join(photoDir, `${photo[1]}.jpg`), (err, buf) => {
        if (err) return send(res, 404, 'Nicht gefunden');
        // Jede Bild-ID ist einmalig (neues Foto = neue ID), darf also ewig im Cache bleiben
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' });
        res.end(buf);
      });
    }

    if (route === '/settings' && method === 'PATCH') {
      const body = clean(await readBody(req, MAX_BODY));
      if (!isPlainObject(body)) return send(res, 400, { error: 'Objekt erwartet' });
      const next = { ...store.db.settings, ...body };
      if (Array.isArray(body.members)) next.members = body.members.slice(0, 6).map(normalizeMember);
      next.householdName = String(next.householdName || 'Unser Nest').slice(0, 60);
      store.db.settings = next;
      const version = store.touch();
      broadcast({ col: 'settings' });
      return send(res, 200, { ok: true, version, settings: next });
    }

    if (route === '/password' && method === 'POST') {
      const body = await readBody(req, MAX_BODY);
      if (!verifyPassword(body.oldPassword || '', store.db.auth)) return send(res, 401, { error: 'Altes Passwort stimmt nicht' });
      if (!body.newPassword || String(body.newPassword).length < 4) return send(res, 400, { error: 'Neues Passwort zu kurz' });
      store.db.auth = hashPassword(body.newPassword);
      // Alle anderen Geräte abmelden
      store.db.sessions = { [session]: store.db.sessions[session] };
      store.save();
      return send(res, 200, { ok: true });
    }

    if (route === '/ics-token' && method === 'GET') {
      return send(res, 200, { token: store.db.icsToken });
    }

    if (route === '/ics-token' && method === 'POST') {
      store.db.icsToken = crypto.randomBytes(18).toString('base64url');
      store.save();
      return send(res, 200, { token: store.db.icsToken });
    }

    if (route === '/export' && method === 'GET') {
      const state = store.publicState();
      return send(res, 200, { app: 'unser-nest', exportedAt: new Date().toISOString(), ...state }, {
        'Content-Disposition': `attachment; filename="unser-nest-${new Date().toISOString().slice(0, 10)}.json"`,
      });
    }

    if (route === '/import' && method === 'POST') {
      const body = clean(await readBody(req, MAX_IMPORT));
      if (!isPlainObject(body) || !isPlainObject(body.data) || !isPlainObject(body.settings)) {
        return send(res, 400, { error: 'Keine gültige Sicherung' });
      }
      store.flush();
      store.backup();
      for (const c of COLLECTIONS) {
        const map = {};
        for (const item of Array.isArray(body.data[c]) ? body.data[c] : []) {
          if (isPlainObject(item) && typeof item.id === 'string' && ID_RE.test(item.id)) map[item.id] = item;
        }
        store.db.data[c] = map;
      }
      store.db.settings = { ...body.settings, members: (body.settings.members || []).slice(0, 6).map(normalizeMember) };
      const version = store.touch();
      broadcast({ col: 'all' });
      return send(res, 200, { ok: true, version });
    }

    return send(res, 404, { error: 'Unbekannter Endpunkt' });
  }

  function serveStatic(req, res, url) {
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || !path.extname(rel)) rel = '/index.html';
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Verboten');
    fs.readFile(file, (err, buf) => {
      if (err) return send(res, 404, 'Nicht gefunden');
      const ext = path.extname(file);
      // App-Code immer frisch: Cloudflare macht aus "no-cache"/kurzem max-age 4 h
      // Browser-Cache, nur "no-store" wird respektiert. Offline sorgt der Service Worker.
      const noStore = ['.html', '.js', '.css', '.webmanifest'].includes(ext);
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': noStore ? 'no-store' : 'public, max-age=300',
      });
      res.end(req.method === 'HEAD' ? undefined : buf);
    });
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      const ics = url.pathname.match(/^\/cal\/([A-Za-z0-9_-]+)\.ics$/);
      if (ics && req.method === 'GET') {
        const token = ics[1];
        const valid = store.db.icsToken && token.length === store.db.icsToken.length &&
          crypto.timingSafeEqual(Buffer.from(token), Buffer.from(store.db.icsToken));
        if (!valid) return send(res, 404, 'Nicht gefunden');
        res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-cache' });
        return res.end(buildIcs(store.publicState()));
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Methode nicht erlaubt');
      return serveStatic(req, res, url);
    } catch (err) {
      if (!res.headersSent) send(res, err.status || 500, { error: err.status ? err.message : 'Serverfehler' });
      if (!err.status) console.error(err);
    }
  });

  server.on('close', () => store.flush());
  return { server, store };
}

module.exports = { createApp, buildIcs };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '0.0.0.0';
  const { server, store } = createApp();
  server.listen(port, host, () => {
    console.log(`🏡 Unser Nest läuft auf http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    console.log(`   Daten liegen in ${store.dir}`);
  });
  const shutdown = () => {
    store.flush();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
