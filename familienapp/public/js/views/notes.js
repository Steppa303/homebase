import { h, icon, uid, relDay, openModal, field, toast, emptyState } from '../ui.js';
import { whoInfo } from '../domain.js';

const COLORS = ['yellow', 'orange', 'pink', 'purple', 'blue', 'green'];
let query = '';

function editNote(store, note = null) {
  const n = { title: '', body: '', color: 'yellow', pinned: false, ...(note || {}) };
  let color = n.color;
  let pinned = n.pinned;
  const title = h('input', { class: 'input', value: n.title, placeholder: 'Titel (optional)', maxlength: 120 });
  const body = h('textarea', { class: 'input', rows: 7, placeholder: 'WLAN-Passwort, Urlaubsideen, Geschenkideen für Mama, Serien-Liste …', maxlength: 10000 }, n.body);
  const swatches = h('div', { class: 'swatches' });
  const renderSwatches = () => swatches.replaceChildren(...COLORS.map((c) => h('button', {
    type: 'button', class: [`note ${c}`, c === color && 'active'], style: { padding: 0, margin: 0, width: '34px', height: '34px', borderRadius: '50%' },
    'aria-label': c, 'aria-pressed': String(c === color), onclick: () => { color = c; renderSwatches(); },
  })));
  renderSwatches();
  const pinBtn = h('button', { type: 'button', class: 'btn small', 'aria-pressed': String(pinned), onclick: () => { pinned = !pinned; pinBtn.textContent = pinned ? '📌 Angepinnt' : '📍 Anpinnen'; pinBtn.setAttribute('aria-pressed', String(pinned)); } }, pinned ? '📌 Angepinnt' : '📍 Anpinnen');
  const save = () => {
    if (!title.value.trim() && !body.value.trim()) { m.close(); return; }
    store.put('notes', { ...(note || {}), id: note?.id || uid(), title: title.value.trim(), body: body.value.trim(), color, pinned, by: note?.by || store.meId, editedBy: store.meId });
    m.close();
  };
  const m = openModal({
    title: note ? 'Notiz' : 'Neue Notiz',
    body: h('div', null, field('Titel', title), field('Text', body), field('Farbe', swatches), pinBtn),
    footer: [
      note ? h('button', { class: 'btn danger', type: 'button', onclick: () => { store.remove('notes', note.id); m.close(); toast('Notiz gelöscht', { undo: () => store.put('notes', note) }); } }, icon('trash')) : null,
      h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Speichern'),
    ],
  });
}

export function render(ctx) {
  const { store } = ctx;
  const q = query.trim().toLowerCase();
  const notes = store.list('notes')
    .filter((n) => !q || `${n.title} ${n.body}`.toLowerCase().includes(q))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const search = h('input', { class: 'input', type: 'search', 'data-keep': 'note-search', placeholder: 'Suchen …', value: query, 'aria-label': 'Notizen durchsuchen',
    oninput: (e) => { query = e.target.value; ctx.rerender(); } });
  return h('div', null,
    h('a', { class: 'back-link', href: '#/mehr' }, icon('left'), 'Mehr'),
    h('div', { class: 'page-head' },
      h('h1', null, 'Pinnwand'),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => editNote(store) }, icon('plus'), 'Notiz')),
    ),
    store.list('notes').length > 4 ? h('div', { class: 'addbar' }, search) : null,
    notes.length
      ? h('div', { class: 'notes' }, notes.map((n) => {
        const by = whoInfo(store, n.editedBy || n.by);
        return h('button', { type: 'button', class: `note ${n.color || 'yellow'}`, onclick: () => editNote(store, n) },
          n.pinned ? h('span', { class: 'pin', 'aria-label': 'angepinnt' }, '📌') : null,
          n.title ? h('h3', null, n.title) : null,
          n.body ? h('p', null, n.body) : null,
          h('div', { class: 'by' }, `${by.emoji} ${by.name} · ${relDay((n.updatedAt || n.createdAt || '').slice(0, 10) || '2000-01-01')}`));
      }))
      : emptyState('📝', q ? 'Nichts gefunden.' : 'Die Pinnwand ist leer. Platz für Ideen, Codes, Listen …'),
  );
}
