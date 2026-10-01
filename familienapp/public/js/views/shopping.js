import { h, icon, uid, toast, openModal, field, optionGroup, checkButton, confirmDialog, emptyState } from '../ui.js';
import { SHOP_CATEGORIES, guessCategory, categoryInfo, parseQuickAdd, normalizeItem, whoInfo } from '../domain.js';

let tab = 'main';

const LISTS = [
  { value: 'main', label: '🛒 Einkauf' },
  { value: 'later', label: '✨ Irgendwann' },
];

function freqMap(store) {
  return store.settings.shopFreq || {};
}

export function addToShopping(store, input, { list = 'main', silent = false } = {}) {
  const { text, qty } = parseQuickAdd(input);
  if (!text) return null;
  const existing = store.list('shopping').find((i) => !i.done && (i.list || 'main') === list && normalizeItem(i.text) === normalizeItem(text));
  if (existing) {
    if (!silent) toast(`„${existing.text}“ steht schon drauf`);
    return existing;
  }
  const item = store.put('shopping', {
    id: uid(), text, qty, list, done: false,
    category: guessCategory(text, freqMap(store)),
    by: store.meId,
  });
  return item;
}

function finishShopping(store) {
  const done = store.list('shopping').filter((i) => i.done && (i.list || 'main') === tab);
  if (!done.length) return;
  const freq = { ...freqMap(store) };
  for (const i of done) {
    const key = normalizeItem(i.text);
    freq[key] = { text: i.text, category: i.category, n: (freq[key]?.n || 0) + 1, last: new Date().toISOString().slice(0, 10) };
    store.remove('shopping', i.id);
  }
  // Nicht endlos wachsen lassen
  const trimmed = Object.fromEntries(Object.entries(freq).sort((a, b) => b[1].n - a[1].n).slice(0, 300));
  store.patchSettings({ shopFreq: trimmed });
  toast(`${done.length} ${done.length === 1 ? 'Sache' : 'Sachen'} weggeräumt 🧺`, {
    undo: () => done.forEach((i) => store.put('shopping', i)),
  });
}

function editItem(store, item) {
  const text = h('input', { class: 'input', value: item.text, maxlength: 120 });
  const qty = h('input', { class: 'input', value: item.qty || '', placeholder: 'z. B. 2x, 500 g', maxlength: 30 });
  const note = h('input', { class: 'input', value: item.note || '', placeholder: 'z. B. Bio, die rote Marke', maxlength: 200 });
  const category = h('select', { class: 'input', value: item.category }, SHOP_CATEGORIES.map((c) => h('option', { value: c.name }, `${c.emoji} ${c.name}`)));
  const list = optionGroup(LISTS, item.list || 'main');
  const save = () => {
    const t = text.value.trim();
    if (!t) return;
    store.patch('shopping', item.id, { text: t, qty: qty.value.trim(), note: note.value.trim(), category: category.value, list: list.value });
    // Kategorie für die Zukunft merken
    if (category.value !== item.category) {
      const freq = { ...freqMap(store) };
      const key = normalizeItem(t);
      freq[key] = { ...(freq[key] || { text: t, n: 0 }), category: category.value };
      store.patchSettings({ shopFreq: freq });
    }
    m.close();
  };
  const m = openModal({
    title: 'Eintrag bearbeiten',
    body: h('form', { onsubmit: (e) => { e.preventDefault(); save(); } },
      field('Was?', text),
      h('div', { class: 'field-row' }, field('Menge', qty), field('Kategorie', category)),
      field('Notiz', note),
      field('Liste', list.el),
      h('button', { type: 'submit', hidden: true }),
    ),
    footer: [
      h('button', { class: 'btn danger', type: 'button', onclick: () => { store.remove('shopping', item.id); m.close(); toast('Gelöscht', { undo: () => store.put('shopping', item) }); } }, icon('trash')),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Speichern'),
    ],
  });
}

function itemRow(store, item) {
  const by = item.by ? whoInfo(store, item.by) : null;
  return h('div', { class: ['row', 'shop-row', 'clickable', item.done && 'done'], onclick: () => editItem(store, item) },
    checkButton(item.done, () => {
      store.patch('shopping', item.id, item.done ? { done: false, doneAt: null, doneBy: null } : { done: true, doneAt: new Date().toISOString(), doneBy: store.meId });
    }, item.done ? `${item.text} wieder offen` : `${item.text} abhaken`),
    h('div', { class: 'grow' },
      h('div', { class: 'title' }, item.text, item.qty ? [' ', h('span', { class: 'qty' }, item.qty)] : null),
      item.note || (by && by.id !== store.meId) ? h('div', { class: 'meta' },
        item.note ? h('span', null, item.note) : null,
        by && by.id !== store.meId ? h('span', { title: `von ${by.name}` }, `${by.emoji} ${by.name}`) : null) : null,
    ),
    tab === 'later' && !item.done ? h('button', {
      class: 'btn small', type: 'button', title: 'Auf die Einkaufsliste',
      onclick: (e) => { e.stopPropagation(); store.patch('shopping', item.id, { list: 'main' }); toast(`„${item.text}“ steht jetzt auf der Einkaufsliste`); },
    }, icon('cart')) : null,
  );
}

function suggestions(store, filterText) {
  const open = new Set(store.list('shopping').filter((i) => !i.done).map((i) => normalizeItem(i.text)));
  const q = normalizeItem(filterText || '');
  return Object.entries(freqMap(store))
    .filter(([key]) => !open.has(key) && (!q || key.includes(q)))
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, q ? 6 : 12)
    .map(([, v]) => v);
}

export function render(ctx) {
  const { store } = ctx;
  const all = store.list('shopping').filter((i) => (i.list || 'main') === tab);
  const open = all.filter((i) => !i.done);
  const done = all.filter((i) => i.done);

  const input = h('input', {
    class: 'input', 'data-keep': 'shop-add', enterkeyhint: 'done', autocomplete: 'off',
    placeholder: tab === 'main' ? 'Was fehlt? z. B. „2x Milch“' : 'Was wünscht ihr euch? z. B. „Neuer Kratzbaum“',
    'aria-label': 'Neuer Eintrag',
    oninput: () => fillSuggest(),
  });
  const suggestBox = h('div', { class: 'suggest' });
  const fillSuggest = () => {
    if (tab !== 'main') return suggestBox.replaceChildren();
    const list = suggestions(store, input.value);
    suggestBox.replaceChildren(
      ...(list.length ? [h('span', { class: 'label' }, input.value ? 'Meinst du:' : 'Oft gekauft:')] : []),
      ...list.map((s) => h('button', { type: 'button', class: 'chip', onclick: () => {
        addToShopping(store, s.text);
        input.value = '';
        input.focus();
      } }, h('span', null, categoryInfo(s.category).emoji), s.text)),
    );
  };
  fillSuggest();

  const form = h('form', { class: 'addbar', onsubmit: (e) => {
    e.preventDefault();
    // Mehrere Sachen auf einmal: "Milch, Eier, Brot"
    const parts = input.value.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    for (const p of parts) addToShopping(store, p, { list: tab });
    input.value = '';
    fillSuggest();
  } }, input, h('button', { class: 'btn primary', type: 'submit', 'aria-label': 'Hinzufügen' }, icon('plus')));

  let body;
  if (!all.length) {
    body = emptyState(tab === 'main' ? '🧺' : '✨', tab === 'main' ? 'Die Liste ist leer. Tipp oben ein, was fehlt – mehrere Sachen mit Komma trennen.' : 'Hier landen größere Anschaffungen und Wünsche für „irgendwann mal“.');
  } else if (tab === 'main') {
    const groups = SHOP_CATEGORIES.map((c) => ({ c, items: open.filter((i) => (i.category || 'Sonstiges') === c.name) })).filter((g) => g.items.length);
    body = [
      open.length ? groups.map((g) => [
        h('div', { class: 'cat-head' }, h('span', { class: 'emoji' }, g.c.emoji), g.c.name),
        h('div', { class: 'list' }, g.items.sort((a, b) => a.text.localeCompare(b.text, 'de')).map((i) => itemRow(store, i))),
      ]) : h('div', { class: 'card empty', style: { textAlign: 'center' } }, 'Alles im Wagen! 🎉'),
    ];
  } else {
    body = open.length ? h('div', { class: 'list' }, open.map((i) => itemRow(store, i))) : null;
  }

  return h('div', null,
    h('div', { class: 'page-head' },
      h('h1', null, 'Einkauf'),
      h('div', { class: 'actions' }, open.length ? h('span', { class: 'pill' }, `${open.length} offen`) : null),
    ),
    h('div', { class: 'segmented', role: 'tablist' }, LISTS.map((l) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(tab === l.value), class: tab === l.value ? 'active' : '',
      onclick: () => { tab = l.value; ctx.rerender(); },
    }, l.label))),
    form,
    suggestBox,
    body,
    done.length ? [
      h('div', { class: 'section-title' }, tab === 'main' ? '🛒 Im Wagen' : 'Erledigt', h('span', { class: 'n' }, done.length),
        h('button', { class: 'btn small primary', type: 'button', onclick: () => finishShopping(store) }, tab === 'main' ? 'Einkauf abschließen' : 'Aufräumen')),
      h('div', { class: 'list' }, done.map((i) => itemRow(store, i))),
    ] : null,
    all.length && tab === 'main' ? h('div', { class: 'mt', style: { textAlign: 'center' } },
      h('button', { class: 'btn ghost small', type: 'button', onclick: async () => {
        if (await confirmDialog('Wirklich die komplette Einkaufsliste leeren?', { ok: 'Leeren' })) {
          const removed = all.slice();
          removed.forEach((i) => store.remove('shopping', i.id));
          toast('Liste geleert', { undo: () => removed.forEach((i) => store.put('shopping', i)) });
        }
      } }, icon('trash'), 'Liste leeren')) : null,
  );
}
