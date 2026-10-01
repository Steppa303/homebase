// DOM-, Datums- und Anzeige-Helfer. Nutzerinhalte landen immer als Textknoten
// im DOM (nie per innerHTML), damit nichts Unerwartetes ausgeführt wird.

const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, props, ...children) {
  const el = tag === 'svg' || props?.svg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  let deferredValue;
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false || key === 'svg') continue;
      if (key === 'class') el.setAttribute('class', Array.isArray(value) ? value.filter(Boolean).join(' ') : value);
      else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'value' && 'value' in el) deferredValue = value;
      else if (key === 'checked') el.checked = !!value;
      else if (value === true) el.setAttribute(key, '');
      else el.setAttribute(key, value);
    }
  }
  append(el, children);
  if (deferredValue !== undefined) el.value = deferredValue; // nach den <option>-Kindern setzen
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child == null || child === false || child === true) continue;
    if (Array.isArray(child)) append(el, child);
    else if (child instanceof Node) el.appendChild(child);
    else el.appendChild(document.createTextNode(String(child)));
  }
}

export function svg(tag, attrs = {}, ...children) {
  return h(tag, { ...attrs, svg: true }, ...children);
}

// ---------------------------------------------------------------------------
// Icons (24er Raster, Linien-Stil)

const ICONS = {
  home: ['M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  cart: [{ c: [9, 20, 1.4] }, { c: [18, 20, 1.4] }, 'M2 3h2.5l2.6 12.2a1.8 1.8 0 0 0 1.8 1.4h8.9a1.8 1.8 0 0 0 1.7-1.3L21.3 7H5.3'],
  calendar: [{ r: [3, 4.5, 18, 17, 3] }, 'M16 2.5v4M8 2.5v4M3 10h18'],
  tasks: ['M9 11l3 3L21 5', 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'],
  grid: [{ r: [3, 3, 7.5, 7.5, 2] }, { r: [13.5, 3, 7.5, 7.5, 2] }, { r: [3, 13.5, 7.5, 7.5, 2] }, { r: [13.5, 13.5, 7.5, 7.5, 2] }],
  plus: ['M12 5v14M5 12h14'],
  x: ['M18 6 6 18M6 6l12 12'],
  check: ['M20 6 9 17l-5-5'],
  trash: ['M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6'],
  left: ['M15 18l-6-6 6-6'],
  right: ['M9 18l6-6-6-6'],
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  repeat: ['M17 2l4 4-4 4', 'M3 11V10a4 4 0 0 1 4-4h14', 'M7 22l-4-4 4-4', 'M21 13v1a4 4 0 0 1-4 4H3'],
  clock: [{ c: [12, 12, 9.5] }, 'M12 7v5l3 2'],
  sliders: ['M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5M21 12H9'],
  copy: [{ r: [9, 9, 12, 12, 2] }, 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'],
  offline: ['M2 2l20 20', 'M8.5 16.4a5 5 0 0 1 7 0', 'M5 12.9a10 10 0 0 1 5-2.7', 'M16.8 10.9A10 10 0 0 1 19 12.9', 'M2 8.8a15 15 0 0 1 4.2-2.6', 'M10.7 5a15 15 0 0 1 11.3 3.8', 'M12 20h.01'],
  utensils: ['M3 2v7a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V2M7 2v20', 'M21 15V2a5 5 0 0 0-5 5v6a2 2 0 0 0 2 2h3v7'],
  wallet: ['M20 12V8H6a2 2 0 0 1 0-4h12v4', 'M4 6v12a2 2 0 0 0 2 2h14v-4', 'M18 12a2 2 0 0 0 0 4h4v-4z'],
  note: ['M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5z', 'M15 3v6h6'],
  paw: [{ c: [8.5, 5.5, 2] }, { c: [15.5, 5.5, 2] }, { c: [4.5, 11, 2] }, { c: [19.5, 11, 2] }, 'M12 12c-3 0-6 3.6-6 6.6 0 1.4 1.1 2.4 2.6 2.4 1.3 0 2.1-.7 3.4-.7s2.1.7 3.4.7c1.5 0 2.6-1 2.6-2.4 0-3-3-6.6-6-6.6z'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5M12 15V3'],
  upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5M12 3v12'],
  listAdd: ['M11 12H3M16 6H3M16 18H3M18 9v6M21 12h-6'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', { c: [9, 7, 4] }, 'M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8'],
  phone: ['M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z'],
  scale: ['M3 7h18', 'M12 3v18', 'M6 7l-3 7a3 3 0 0 0 6 0z', 'M18 7l-3 7a3 3 0 0 0 6 0z', 'M8 21h8'],
};

export function icon(name, cls = '') {
  const el = svg('svg', { viewBox: '0 0 24 24', class: `icon ${cls}`.trim(), 'aria-hidden': 'true' });
  for (const part of ICONS[name] || []) {
    if (typeof part === 'string') el.appendChild(svg('path', { d: part }));
    else if (part.c) el.appendChild(svg('circle', { cx: part.c[0], cy: part.c[1], r: part.c[2] }));
    else if (part.r) el.appendChild(svg('rect', { x: part.r[0], y: part.r[1], width: part.r[2], height: part.r[3], rx: part.r[4] }));
  }
  return el;
}

// ---------------------------------------------------------------------------
// IDs

export function uid() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// Datum (alle Tage als 'YYYY-MM-DD' in lokaler Zeit)

const pad = (n) => String(n).padStart(2, '0');
export const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function today() {
  return toISO(new Date());
}
export function addDays(s, n) {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
export function diffDays(a, b) {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}
export function weekdayIndex(s) {
  return (parseISO(s).getDay() + 6) % 7; // Montag = 0
}
export function startOfWeek(s) {
  return addDays(s, -weekdayIndex(s));
}
export function fmtDate(s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat('de-DE', opts).format(parseISO(s));
}
export function fmtLong(s) {
  return fmtDate(s, { weekday: 'long', day: 'numeric', month: 'long' });
}
export function relDay(s) {
  const n = diffDays(today(), s);
  if (n === 0) return 'Heute';
  if (n === 1) return 'Morgen';
  if (n === -1) return 'Gestern';
  if (n === 2) return 'Übermorgen';
  if (n > 2 && n < 7) return fmtDate(s, { weekday: 'long' });
  if (n < 0 && n > -14) return `vor ${-n} Tagen`;
  return fmtDate(s);
}
export function fmtTime(isoTimestamp) {
  const d = new Date(isoTimestamp);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function monthName(year, month) {
  return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1));
}
export function ageText(birthday) {
  if (!birthday) return '';
  const b = parseISO(birthday);
  const now = new Date();
  let months = (now.getFullYear() - b.getFullYear()) * 12 + now.getMonth() - b.getMonth();
  if (now.getDate() < b.getDate()) months -= 1;
  if (months < 0) return '';
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} ${m === 1 ? 'Monat' : 'Monate'}`;
  return `${y} ${y === 1 ? 'Jahr' : 'Jahre'}${m ? `, ${m} ${m === 1 ? 'Monat' : 'Monate'}` : ''}`;
}
export function nextBirthday(birthday, from = today()) {
  if (!birthday) return null;
  const [, m, d] = birthday.split('-');
  const year = Number(from.slice(0, 4));
  let next = `${year}-${m}-${d}`;
  if (next < from) next = `${year + 1}-${m}-${d}`;
  return { date: next, turns: Number(next.slice(0, 4)) - Number(birthday.slice(0, 4)) };
}

// ---------------------------------------------------------------------------
// Zahlen

const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
export function fmtMoney(cents) {
  return money.format((cents || 0) / 100);
}
export function parseMoney(text) {
  const clean = String(text).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Math.round(parseFloat(clean) * 100);
  return Number.isFinite(n) ? n : NaN;
}

export function greeting() {
  const hr = new Date().getHours();
  if (hr < 5) return 'Gute Nacht';
  if (hr < 11) return 'Guten Morgen';
  if (hr < 14) return 'Mahlzeit';
  if (hr < 18) return 'Hallo';
  return 'Guten Abend';
}

// ---------------------------------------------------------------------------
// Modal & Toast

let openModals = [];

export function openModal({ title, body, footer, onClose }) {
  const root = document.getElementById('modal-root');
  const prevFocus = document.activeElement;
  const close = () => {
    backdrop.remove();
    openModals = openModals.filter((m) => m !== api);
    document.removeEventListener('keydown', onKey);
    if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && openModals[openModals.length - 1] === api) close();
  };
  const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'grabber' }),
    h('div', { class: 'modal-head' },
      h('h2', null, title),
      h('button', { class: 'icon-btn plain', type: 'button', 'aria-label': 'Schließen', onclick: () => close() }, icon('x')),
    ),
    body,
    footer ? h('div', { class: 'modal-foot' }, footer) : null,
  );
  const backdrop = h('div', { class: 'modal-backdrop', onmousedown: (e) => { if (e.target === backdrop) close(); } }, modal);
  root.appendChild(backdrop);
  document.addEventListener('keydown', onKey);
  const api = { close, el: modal };
  openModals.push(api);
  requestAnimationFrame(() => {
    const first = modal.querySelector('[autofocus], input:not([type=hidden]):not([type=checkbox]), textarea');
    if (first && window.matchMedia('(pointer: fine)').matches) first.focus();
  });
  return api;
}

export function confirmDialog(text, { ok = 'Löschen', danger = true } = {}) {
  return new Promise((resolve) => {
    let result = false;
    const m = openModal({
      title: 'Sicher?',
      body: h('p', { class: 'muted' }, text),
      footer: [
        h('span', { class: 'grow' }),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => m.close() }, 'Abbrechen'),
        h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'button', onclick: () => { result = true; m.close(); } }, ok),
      ],
      onClose: () => resolve(result),
    });
  });
}

export function toast(message, { undo, duration = 4200 } = {}) {
  const root = document.getElementById('toast-root');
  root.replaceChildren(); // immer nur der neueste Hinweis
  const el = h('div', { class: 'toast', role: 'status' }, h('span', null, message));
  if (undo) {
    el.appendChild(h('button', { type: 'button', onclick: () => { undo(); el.remove(); } }, 'Rückgängig'));
  }
  root.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ---------------------------------------------------------------------------
// Formular-Bausteine

export function field(label, control, hint) {
  return h('div', { class: 'field' }, h('label', null, label), control, hint ? h('div', { class: 'hint' }, hint) : null);
}

// Auswahl als Knopfreihe; gibt { el, get value() } zurück
export function optionGroup(options, value, onChange) {
  let current = value;
  const el = h('div', { class: 'options', role: 'radiogroup' });
  const render = () => {
    el.replaceChildren(...options.map((o) => h('button', {
      type: 'button',
      role: 'radio',
      'aria-checked': String(o.value === current),
      class: o.value === current ? 'active' : '',
      onclick: () => { current = o.value; render(); onChange?.(current); },
    }, o.dot ? h('span', { class: 'dot', style: { background: o.dot } }) : null, o.label)));
  };
  render();
  return { el, get value() { return current; }, set value(v) { current = v; render(); } };
}

export function checkButton(on, onToggle, label) {
  return h('button', {
    type: 'button',
    class: ['check', on && 'on'],
    'aria-pressed': String(!!on),
    'aria-label': label,
    onclick: (e) => { e.stopPropagation(); onToggle(); },
  }, icon('check'));
}

export function avatar(entity, size = '') {
  if (!entity) return h('span', { class: `avatar ${size}`, style: { background: 'var(--both)' } }, '👥');
  return h('span', { class: `avatar ${size}`, style: { background: entity.color || 'var(--muted)' }, title: entity.name }, entity.emoji || entity.name?.[0] || '?');
}

// Haustier mit Profilbild (falls vorhanden), sonst mit seinem Symbol
export function petAvatar(pet, size = '') {
  const el = h('span', { class: ['avatar', size, pet.photo && 'photo'], style: { background: pet.color || 'var(--muted)' }, title: pet.name }, pet.emoji || '🐈');
  if (pet.photo) {
    const img = h('img', { src: `/api/photos/${pet.photo}`, alt: '', decoding: 'async' });
    img.addEventListener('error', () => { img.remove(); el.classList.remove('photo'); });
    el.append(img);
  }
  return el;
}

export function emptyState(emoji, text, action) {
  return h('div', { class: 'empty-big' }, h('span', { class: 'emoji' }, emoji), h('div', null, text), action ? h('div', { class: 'mt' }, action) : null);
}
