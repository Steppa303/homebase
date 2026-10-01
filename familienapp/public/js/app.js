import { h, icon, field, toast } from './ui.js';
import { store, api, clearLocal } from './store.js';
import { taskBucket } from './domain.js';
import * as home from './views/home.js';
import * as shopping from './views/shopping.js';
import * as calendar from './views/calendar.js';
import * as tasks from './views/tasks.js';
import * as pets from './views/pets.js';
import * as meals from './views/meals.js';
import * as money from './views/money.js';
import * as notes from './views/notes.js';
import * as settings from './views/settings.js';
import * as more from './views/more.js';

const ROUTES = {
  heute: { label: 'Heute', icon: 'home', view: home },
  einkauf: { label: 'Einkauf', icon: 'cart', view: shopping },
  kalender: { label: 'Kalender', icon: 'calendar', view: calendar },
  aufgaben: { label: 'Aufgaben', icon: 'tasks', view: tasks },
  katzen: { label: 'Katzen', icon: 'paw', view: pets },
  essen: { label: 'Essensplan', icon: 'utensils', view: meals },
  kasse: { label: 'Kasse', icon: 'wallet', view: money },
  pinnwand: { label: 'Pinnwand', icon: 'note', view: notes },
  einstellungen: { label: 'Einstellungen', icon: 'sliders', view: settings },
  mehr: { label: 'Mehr', icon: 'grid', view: more },
};
const TABS = ['heute', 'einkauf', 'kalender', 'aufgaben', 'mehr'];
const SIDEBAR = ['heute', 'einkauf', 'kalender', 'aufgaben', 'katzen', 'essen', 'kasse', 'pinnwand'];

const root = document.getElementById('app');
let mode = 'boot'; // boot | setup | login | who | app

// ---------------------------------------------------------------------------
// Theme

export function applyTheme() {
  let theme = 'auto';
  try { theme = localStorage.getItem('nest.theme') || 'auto'; } catch { /* egal */ }
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}
applyTheme();

// ---------------------------------------------------------------------------
// Routing

function currentRoute() {
  const name = location.hash.replace(/^#\/?/, '').split('/')[0];
  return ROUTES[name] ? name : 'heute';
}

export function go(name) {
  location.hash = `#/${name}`;
}

window.addEventListener('hashchange', () => {
  if (mode === 'app') {
    render();
    window.scrollTo(0, 0);
  }
});

// ---------------------------------------------------------------------------
// Rendern – Eingaben mit data-keep überleben Neuaufbauten (z. B. wenn das
// andere Handy gerade etwas ändert, während man tippt).

function snapshotInputs() {
  const snap = { values: {}, focus: null };
  for (const el of root.querySelectorAll('[data-keep]')) snap.values[el.dataset.keep] = el.value;
  const a = document.activeElement;
  if (a && a.dataset && a.dataset.keep && root.contains(a)) {
    snap.focus = { key: a.dataset.keep, start: a.selectionStart, end: a.selectionEnd };
  }
  return snap;
}

function restoreInputs(snap) {
  for (const el of root.querySelectorAll('[data-keep]')) {
    const v = snap.values[el.dataset.keep];
    if (v !== undefined) el.value = v;
  }
  if (snap.focus) {
    const el = root.querySelector(`[data-keep="${CSS.escape(snap.focus.key)}"]`);
    if (el) {
      el.focus({ preventScroll: true });
      try { el.setSelectionRange(snap.focus.start, snap.focus.end); } catch { /* nicht jedes Feld kann das */ }
    }
  }
}

let frame = 0;
export function rerender() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (mode === 'app') render();
    else if (mode === 'who') renderWho();
  });
}

const ctx = { store, go, rerender };

function badges() {
  const openShopping = store.list('shopping').filter((i) => !i.done && (i.list || 'main') === 'main').length;
  const dueTasks = store.list('tasks').filter((t) => ['overdue', 'today'].includes(taskBucket(t))).length;
  return { einkauf: openShopping, aufgaben: dueTasks };
}

function render() {
  const route = currentRoute();
  const snap = snapshotInputs();
  const b = badges();
  const me = store.me;
  let content;
  try {
    content = ROUTES[route].view.render(ctx);
  } catch (err) {
    console.error(err);
    content = h('div', { class: 'card' }, h('h2', null, 'Hoppla 🙀'), h('p', { class: 'muted' }, String(err.message || err)));
  }
  const activeTab = TABS.includes(route) ? route : 'mehr';
  const offline = !store.online || store.queue.length > 0;

  const shell = h('div', { class: 'shell' },
    h('nav', { class: 'sidebar', 'aria-label': 'Hauptnavigation' },
      h('div', { class: 'brand' }, h('span', { class: 'logo' }, '🏡'), store.settings.householdName || 'Unser Nest'),
      SIDEBAR.map((name) => h('a', { href: `#/${name}`, class: route === name ? 'active' : '' },
        icon(ROUTES[name].icon), ROUTES[name].label,
        b[name] ? h('span', { class: 'count' }, b[name]) : null)),
      h('div', { class: 'spacer' }),
      h('a', { href: '#/einstellungen', class: route === 'einstellungen' ? 'active' : '' }, icon('sliders'), 'Einstellungen'),
      me ? h('div', { class: 'me-chip mt' }, h('span', { class: 'avatar', style: { background: me.color } }, me.emoji), me.name) : null,
    ),
    h('main', { class: 'main', id: 'main' },
      offline ? h('div', { class: 'banner' }, icon('offline'),
        store.online ? `Synchronisiere ${store.queue.length} Änderung(en) …` : `Offline – ${store.queue.length ? `${store.queue.length} Änderung(en) werden später übertragen` : 'du siehst den letzten Stand'}`) : null,
      content,
    ),
    h('nav', { class: 'tabbar', 'aria-label': 'Navigation' },
      TABS.map((name) => h('a', { href: `#/${name}`, class: activeTab === name ? 'active' : '', 'aria-current': activeTab === name ? 'page' : null },
        icon(ROUTES[name].icon), ROUTES[name].label,
        b[name] ? h('span', { class: 'tab-badge' }, b[name] > 99 ? '99+' : b[name]) : null)),
    ),
  );
  root.replaceChildren(shell);
  document.title = `${ROUTES[route].label} · ${store.settings.householdName || 'Unser Nest'}`;
  restoreInputs(snap);
}

// ---------------------------------------------------------------------------
// Einrichtung, Login, "Wer bist du?"

function authLayout(...children) {
  return h('div', { class: 'auth' }, h('div', { class: 'auth-card' }, ...children));
}

function renderSetup() {
  mode = 'setup';
  const err = h('div', { class: 'error', role: 'alert' });
  const inp = (name, attrs = {}) => h('input', { class: 'input', name, ...attrs });
  const form = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    if (f.get('password') !== f.get('password2')) { err.textContent = 'Die Passwörter stimmen nicht überein.'; return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await api('POST', '/api/setup', {
        householdName: f.get('householdName'),
        password: f.get('password'),
        seed: f.get('seed') === 'on',
        members: [
          { name: f.get('name1'), emoji: f.get('emoji1') || '🧑', color: '#d9694a' },
          { name: f.get('name2'), emoji: f.get('emoji2') || '👩', color: '#2f8f83' },
        ],
        pets: [
          { name: f.get('cat1'), emoji: '🐈' },
          { name: f.get('cat2'), emoji: '🐈‍⬛' },
        ],
      });
      clearLocal();
      await store.load();
      store.setMe(store.members[0]?.id);
      startApp();
      toast('Willkommen im Nest! 🏡');
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false;
    }
  } },
    h('div', { class: 'field-row' },
      field('Haushalt', inp('householdName', { value: 'Unser Nest', maxlength: 60 })),
      h('div'),
    ),
    h('div', { class: 'member-edit', style: { gridTemplateColumns: '64px 1fr' } },
      field('Emoji', inp('emoji1', { value: '🧑', maxlength: 8 })),
      field('Dein Name', inp('name1', { required: true, placeholder: 'z. B. Stefan', maxlength: 40, autocomplete: 'given-name' })),
    ),
    h('div', { class: 'member-edit', style: { gridTemplateColumns: '64px 1fr' } },
      field('Emoji', inp('emoji2', { value: '👩', maxlength: 8 })),
      field('Name deiner Frau', inp('name2', { required: true, placeholder: 'z. B. Anna', maxlength: 40 })),
    ),
    h('div', { class: 'field-row' },
      field('🐈 Katze 1', inp('cat1', { value: 'Sirich', placeholder: 'Name', maxlength: 40 })),
      field('🐈‍⬛ Katze 2', inp('cat2', { value: 'Bagwood', placeholder: 'Name', maxlength: 40 })),
    ),
    h('div', { class: 'field-row' },
      field('Haushalts-Passwort', inp('password', { type: 'password', required: true, minlength: 4, autocomplete: 'new-password' })),
      field('Wiederholen', inp('password2', { type: 'password', required: true, minlength: 4, autocomplete: 'new-password' })),
    ),
    h('p', { class: 'small muted' }, 'Mit diesem Passwort meldet ihr euch auf euren Geräten an. Ihr teilt euch ein Passwort.'),
    h('label', { class: 'checkbox' }, h('input', { type: 'checkbox', name: 'seed', checked: true }),
      h('span', null, 'Typische Haushalts- und Katzen-Aufgaben anlegen (Katzenklo, Entwurmung, Staubsaugen …) – könnt ihr später anpassen.')),
    err,
    h('button', { class: 'btn primary block', type: 'submit' }, 'Nest einrichten'),
  );
  root.replaceChildren(authLayout(
    h('div', { class: 'hero' }, h('div', { class: 'logo' }, '🏡'), h('h1', null, 'Willkommen!'), h('p', null, 'Richtet euer gemeinsames Nest ein – einmalig, dauert 1 Minute.')),
    form,
  ));
}

function renderLogin(householdName) {
  mode = 'login';
  const err = h('div', { class: 'error', role: 'alert' });
  const input = h('input', { class: 'input', type: 'password', name: 'password', required: true, autocomplete: 'current-password', autofocus: true });
  const form = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault();
    try {
      await api('POST', '/api/login', { password: input.value });
      await store.load();
      if (store.me) startApp();
      else renderWho();
    } catch (ex) {
      err.textContent = ex.message;
      input.select();
    }
  } },
    field('Haushalts-Passwort', input),
    err,
    h('button', { class: 'btn primary block', type: 'submit' }, 'Rein ins Nest'),
  );
  root.replaceChildren(authLayout(
    h('div', { class: 'hero' }, h('div', { class: 'logo' }, '🏡'), h('h1', null, householdName || 'Unser Nest'), h('p', null, 'Schön, dass du da bist.')),
    form,
  ));
  input.focus();
}

function renderWho() {
  mode = 'who';
  root.replaceChildren(authLayout(
    h('div', { class: 'hero' }, h('div', { class: 'logo' }, '👋'), h('h1', null, 'Wer bist du?'), h('p', null, 'Damit wir wissen, wer was erledigt hat. Gilt nur für dieses Gerät.')),
    h('div', { class: 'who-grid' }, store.members.map((m) => h('button', { type: 'button', onclick: () => { store.setMe(m.id); startApp(); } },
      h('span', { class: 'avatar lg', style: { background: m.color } }, m.emoji), m.name))),
  ));
}

let started = false;
function startApp() {
  mode = 'app';
  if (!location.hash) history.replaceState(null, '', '#/heute');
  if (!started) {
    started = true;
    store.subscribe(() => rerender());
    store.connect();
    store.flush();
  }
  render();
}

store.onAuthLost = () => {
  mode = 'login';
  renderLogin(store.settings.householdName);
};

export async function logout() {
  try { await api('POST', '/api/logout', {}); } catch { /* egal */ }
  clearLocal();
  location.reload();
}

async function boot() {
  let status;
  try {
    status = await api('GET', '/api/status');
  } catch {
    // Offline gestartet: mit dem letzten bekannten Stand weitermachen
    if (store.state.settings && store.me) {
      store.online = false;
      return startApp();
    }
    root.replaceChildren(authLayout(h('div', { class: 'hero' }, h('div', { class: 'logo' }, '📡'), h('h1', null, 'Keine Verbindung'), h('p', null, 'Der Server ist gerade nicht erreichbar.')),
      h('button', { class: 'btn primary block', onclick: () => location.reload() }, 'Nochmal versuchen')));
    return;
  }
  if (!status.configured) return renderSetup();
  if (!status.authed) return renderLogin(status.householdName);
  await store.load();
  if (!store.me) return renderWho();
  startApp();
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('/sw.js').catch(() => { /* optional */ });
}

boot();
