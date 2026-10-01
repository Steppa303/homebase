// Zustand + Synchronisation mit dem Server.
// Änderungen werden sofort lokal angewendet und in eine Warteschlange gelegt,
// die (auch nach Offline-Phasen) der Reihe nach an den Server geht.
// Andere Geräte melden Änderungen live per Server-Sent Events.

import { uid } from './ui.js';

const QUEUE_KEY = 'nest.queue';
const CACHE_KEY = 'nest.cache';
const ME_KEY = 'nest.me';

function readJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* Speicher voll oder privat – egal */ }
}

export class AuthError extends Error {}

export async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'nest' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && !url.endsWith('/login') && !url.endsWith('/password')) throw new AuthError('Nicht angemeldet');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Fehler ${res.status}`), { status: res.status });
  return data;
}

const EMPTY = { version: 0, settings: null, data: { shopping: [], events: [], tasks: [], meals: [], expenses: [], notes: [], pets: [], petlog: [] } };

class Store {
  constructor() {
    this.base = readJSON(CACHE_KEY, EMPTY);
    this.queue = readJSON(QUEUE_KEY, []);
    this.state = this.compose();
    this.listeners = new Set();
    this.online = true;
    this.flushing = false;
    this.meId = readJSON(ME_KEY, null);
    this.onAuthLost = null;
  }

  // Server-Zustand + noch nicht bestätigte eigene Änderungen
  compose() {
    const state = {
      version: this.base.version,
      settings: this.base.settings ? structuredClone(this.base.settings) : null,
      data: {},
    };
    for (const [col, items] of Object.entries(this.base.data)) state.data[col] = items.map((i) => ({ ...i }));
    for (const op of this.queue) applyOp(state, op);
    return state;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.state = this.compose();
    for (const fn of this.listeners) fn(this.state);
  }

  async load() {
    try {
      const fresh = await api('GET', '/api/state');
      this.base = fresh;
      writeJSON(CACHE_KEY, fresh);
      this.setOnline(true);
    } catch (err) {
      if (err instanceof AuthError) return this.authLost();
      this.setOnline(false);
    }
    this.emit();
  }

  setOnline(value) {
    if (this.online !== value) {
      this.online = value;
      this.emit();
    }
  }

  authLost() {
    this.onAuthLost?.();
  }

  enqueue(op) {
    this.queue.push(op);
    writeJSON(QUEUE_KEY, this.queue);
    this.emit();
    this.flush();
  }

  async flush() {
    if (this.flushing) return;
    this.flushing = true;
    let changed = false;
    try {
      while (this.queue.length) {
        const op = this.queue[0];
        try {
          if (op.type === 'settings') await api('PATCH', '/api/settings', op.body);
          else if (op.type === 'delete') await api('DELETE', `/api/data/${op.col}/${op.id}`);
          else await api(op.type === 'patch' ? 'PATCH' : 'PUT', `/api/data/${op.col}/${op.id}`, op.body);
          changed = true;
        } catch (err) {
          if (err instanceof AuthError) return this.authLost();
          if (err.status && err.status < 500) {
            // Ungültig oder vom anderen Gerät schon gelöscht → verwerfen
            console.warn('Änderung verworfen', op, err);
          } else {
            this.setOnline(false);
            return; // später erneut versuchen
          }
        }
        this.queue.shift();
        writeJSON(QUEUE_KEY, this.queue);
      }
      this.setOnline(true);
    } finally {
      this.flushing = false;
      if (changed) this.load();
    }
  }

  connect() {
    if (this.source) this.source.close();
    const source = new EventSource('/api/stream');
    this.source = source;
    let timer;
    const refresh = (e) => {
      const { version } = JSON.parse(e.data || '{}');
      this.setOnline(true);
      if (this.queue.length) this.flush();
      if (version && version !== this.base.version) {
        clearTimeout(timer);
        timer = setTimeout(() => this.load(), 120);
      }
    };
    source.addEventListener('hello', refresh);
    source.addEventListener('change', refresh);
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        // Evtl. abgemeldet – prüfen und neu verbinden
        setTimeout(() => this.load().then(() => this.connect()), 5000);
      } else {
        this.setOnline(false);
      }
    };
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('online', () => this.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.flush();
        this.load();
      }
    });
  }

  // ------------------------------------------------------------------ Lesen

  get settings() {
    return this.state.settings || { members: [], householdName: 'Unser Nest', feedSlots: ['Morgens', 'Abends'] };
  }
  get members() {
    return this.settings.members || [];
  }
  get me() {
    return this.members.find((m) => m.id === this.meId) || null;
  }
  get partner() {
    return this.members.find((m) => m.id !== this.meId) || null;
  }
  setMe(id) {
    this.meId = id;
    writeJSON(ME_KEY, id);
    this.emit();
  }
  list(col) {
    return this.state.data[col] || [];
  }
  get(col, id) {
    return this.list(col).find((i) => i.id === id) || null;
  }
  member(id) {
    return this.members.find((m) => m.id === id) || null;
  }
  pet(id) {
    return this.list('pets').find((p) => p.id === id) || null;
  }

  // ---------------------------------------------------------------- Schreiben

  put(col, item) {
    const id = item.id || uid();
    const now = new Date().toISOString();
    const existing = this.get(col, id);
    const body = { ...item, id, createdAt: existing?.createdAt || item.createdAt || now };
    this.enqueue({ type: 'put', col, id, body });
    return body;
  }
  patch(col, id, body) {
    this.enqueue({ type: 'patch', col, id, body });
  }
  remove(col, id) {
    const prev = this.get(col, id);
    this.enqueue({ type: 'delete', col, id });
    return prev;
  }
  patchSettings(body) {
    this.enqueue({ type: 'settings', body });
  }
}

function applyOp(state, op) {
  if (op.type === 'settings') {
    state.settings = { ...state.settings, ...op.body };
    return;
  }
  const list = state.data[op.col] || (state.data[op.col] = []);
  const idx = list.findIndex((i) => i.id === op.id);
  const now = new Date().toISOString();
  if (op.type === 'delete') {
    if (idx >= 0) list.splice(idx, 1);
  } else if (op.type === 'put') {
    const item = { ...op.body, updatedAt: now };
    if (idx >= 0) list[idx] = item;
    else list.push(item);
  } else if (op.type === 'patch' && idx >= 0) {
    list[idx] = { ...list[idx], ...op.body, updatedAt: now };
  }
}

export const store = new Store();

export function clearLocal() {
  for (const k of [QUEUE_KEY, CACHE_KEY]) localStorage.removeItem(k);
}
