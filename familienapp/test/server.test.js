'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp, buildIcs } = require('../server.js');

async function start() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-test-'));
  const { server, store } = createApp({ dataDir });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'nest', Cookie: cookie, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* kein JSON */ }
    return { status: res.status, json, text, headers: res.headers };
  };
  const stop = () => new Promise((r) => server.close(r)).then(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  return { call, stop, store, dataDir, base, clearCookie: () => { cookie = ''; } };
}

const SETUP = {
  householdName: 'Testnest',
  password: 'miau1234',
  seed: true,
  members: [{ name: 'Stefan', emoji: '🧑' }, { name: 'Anna', emoji: '👩' }],
  pets: [{ name: 'Mogli' }, { name: 'Luna' }],
};

test('Einrichtung, Login und geschützte Endpunkte', async () => {
  const app = await start();
  try {
    let r = await app.call('GET', '/api/status');
    assert.deepStrictEqual(r.json.configured, false);

    r = await app.call('GET', '/api/state');
    assert.strictEqual(r.status, 401);

    r = await app.call('POST', '/api/setup', SETUP);
    assert.strictEqual(r.status, 200);

    r = await app.call('POST', '/api/setup', SETUP);
    assert.strictEqual(r.status, 409, 'zweites Einrichten verboten');

    r = await app.call('GET', '/api/state');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.settings.householdName, 'Testnest');
    assert.strictEqual(r.json.settings.members.length, 2);
    assert.strictEqual(r.json.data.pets.length, 2);
    assert.ok(r.json.data.tasks.length >= 5, 'Startaufgaben angelegt');

    app.clearCookie();
    r = await app.call('POST', '/api/login', { password: 'falsch' });
    assert.strictEqual(r.status, 401);
    r = await app.call('POST', '/api/login', { password: 'miau1234' });
    assert.strictEqual(r.status, 200);
    r = await app.call('GET', '/api/state');
    assert.strictEqual(r.status, 200);

    r = await app.call('POST', '/api/logout', {});
    r = await app.call('GET', '/api/state');
    assert.strictEqual(r.status, 401);
  } finally {
    await app.stop();
  }
});

test('CRUD, Versionen und Schutz vor CSRF / Prototype Pollution', async () => {
  const app = await start();
  try {
    await app.call('POST', '/api/setup', SETUP);
    const v0 = (await app.call('GET', '/api/state')).json.version;

    let r = await app.call('PUT', '/api/data/shopping/abc123', JSON.parse('{"text":"Milch","category":"Kühlregal","done":false,"__proto__":{"hacked":true}}'));
    assert.strictEqual(r.status, 200);
    assert.ok(r.json.version > v0);
    assert.strictEqual({}.hacked, undefined);

    r = await app.call('PATCH', '/api/data/shopping/abc123', { done: true });
    assert.strictEqual(r.json.item.done, true);
    assert.strictEqual(r.json.item.text, 'Milch');

    r = await app.call('PATCH', '/api/data/shopping/gibtsnicht', { done: true });
    assert.strictEqual(r.status, 404);

    r = await app.call('PUT', '/api/data/unbekannt/abc', { x: 1 });
    assert.strictEqual(r.status, 404);

    r = await app.call('PUT', '/api/data/shopping/abc123', { text: 'x' }, { 'X-Requested-With': '' });
    assert.strictEqual(r.status, 403, 'ohne Header kein Schreibzugriff');

    r = await app.call('DELETE', '/api/data/shopping/abc123');
    assert.strictEqual(r.status, 200);
    const state = (await app.call('GET', '/api/state')).json;
    assert.ok(!state.data.shopping.some((i) => i.id === 'abc123'));

    r = await app.call('PATCH', '/api/settings', { feedSlots: ['Früh', 'Spät'] });
    assert.deepStrictEqual(r.json.settings.feedSlots, ['Früh', 'Spät']);
    assert.strictEqual(r.json.settings.householdName, 'Testnest');
  } finally {
    await app.stop();
  }
});

test('Daten überleben einen Neustart', async () => {
  const app = await start();
  const { dataDir } = app;
  await app.call('POST', '/api/setup', SETUP);
  await app.call('PUT', '/api/data/notes/n1', { title: 'WLAN', body: 'geheim' });
  app.store.flush();
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'nest.json'), 'utf8'));
  assert.strictEqual(saved.data.notes.n1.title, 'WLAN');
  assert.ok(saved.auth.hash && !JSON.stringify(saved).includes('miau1234'), 'Passwort nur als Hash');
  const again = createApp({ dataDir });
  assert.strictEqual(again.store.db.data.notes.n1.body, 'geheim');
  await app.stop();
});

test('Kalender-Abo (iCal)', async () => {
  const app = await start();
  try {
    await app.call('POST', '/api/setup', SETUP);
    await app.call('PUT', '/api/data/events/e1', { title: 'Tierarzt; Impfung, Mogli', date: '2026-10-05', time: '09:30', who: 'all', repeat: 'none' });
    await app.call('PUT', '/api/data/events/e2', { title: 'Yoga', date: '2026-10-01', repeat: 'weekly' });
    const { token } = (await app.call('GET', '/api/ics-token')).json;
    let r = await app.call('GET', '/cal/falsch.ics');
    assert.strictEqual(r.status, 404);
    r = await app.call('GET', `/cal/${token}.ics`, undefined, { Cookie: '' });
    assert.strictEqual(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/calendar/);
    assert.match(r.text, /SUMMARY:Tierarzt\\; Impfung\\, Mogli/);
    assert.match(r.text, /DTSTART:20261005T093000/);
    assert.match(r.text, /DTEND:20261005T103000/);
    assert.match(r.text, /RRULE:FREQ=WEEKLY/);
    assert.match(r.text, /DTSTART;VALUE=DATE:20261001/);
  } finally {
    await app.stop();
  }
});

test('iCal: lange Zeilen werden gefaltet', () => {
  const ics = buildIcs({ settings: { members: [], householdName: 'X' }, data: { events: [{ id: 'a', title: 'ä'.repeat(100), date: '2026-01-01' }], pets: [] } });
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
});

test('Statische Dateien und Pfad-Ausbruch', async () => {
  const app = await start();
  try {
    let r = await app.call('GET', '/');
    assert.strictEqual(r.status, 200);
    assert.match(r.text, /Unser Nest/);
    assert.ok(r.headers.get('content-security-policy'));
    r = await app.call('GET', '/js/app.js');
    assert.match(r.headers.get('content-type'), /javascript/);
    r = await app.call('GET', '/..%2f..%2fserver.js');
    assert.notStrictEqual(r.status, 200);
  } finally {
    await app.stop();
  }
});
