import { h, icon, uid, today, addDays, startOfWeek, fmtDate, WEEKDAYS, openModal, field, optionGroup, toast } from '../ui.js';
import { whoInfo } from '../domain.js';
import { addToShopping } from './shopping.js';

let weekStart = null;

const EXTRA_COOKS = [
  { value: 'order', label: '🛵 Bestellen', name: 'Bestellen', emoji: '🛵' },
  { value: 'out', label: '🍽️ Auswärts', name: 'Auswärts', emoji: '🍽️' },
];

function cookInfo(store, id) {
  return EXTRA_COOKS.find((c) => c.value === id) || whoInfo(store, id);
}

function favorites(store) {
  const map = new Map();
  for (const m of store.list('meals')) {
    const key = m.title.trim().toLowerCase();
    if (!key) continue;
    const prev = map.get(key);
    if (!prev || m.date > prev.last.date) map.set(key, { title: m.title, n: (prev?.n || 0) + 1, last: m });
    else prev.n += 1;
  }
  return [...map.values()].sort((a, b) => b.n - a.n || b.last.date.localeCompare(a.last.date));
}

function ingredientsToList(store, meal) {
  const lines = (meal.ingredients || '').split('\n').map((s) => s.trim()).filter(Boolean);
  let added = 0;
  for (const line of lines) {
    const before = store.list('shopping').length;
    addToShopping(store, line, { silent: true });
    if (store.list('shopping').length > before) added += 1;
  }
  store.patch('meals', meal.id, { addedToList: true });
  return added;
}

function editMeal(store, date, meal = null, preset = null) {
  const m0 = { title: '', cook: store.meId, ingredients: '', note: '', ...(preset || {}), ...(meal || {}) };
  const favs = favorites(store);
  const listId = `meal-favs-${uid()}`;
  const title = h('input', { class: 'input', value: m0.title, placeholder: 'z. B. Spaghetti Bolognese', maxlength: 120, list: listId, required: true });
  const datalist = h('datalist', { id: listId }, favs.map((f) => h('option', { value: f.title })));
  const cook = optionGroup([
    ...store.members.map((mm) => ({ value: mm.id, label: `${mm.emoji} ${mm.name}` })),
    { value: 'both', label: '👥 Zusammen' },
    ...EXTRA_COOKS,
  ], m0.cook || 'both');
  const ingredients = h('textarea', { class: 'input', placeholder: 'Eine Zutat pro Zeile\n500 g Hackfleisch\nSpaghetti\n2 Dosen Tomaten', rows: 5, maxlength: 3000 }, m0.ingredients || '');
  const note = h('input', { class: 'input', value: m0.note || '', placeholder: 'z. B. Rezept-Link, Beilage …', maxlength: 300 });
  title.addEventListener('change', () => {
    const fav = favs.find((f) => f.title.toLowerCase() === title.value.trim().toLowerCase());
    if (fav && !ingredients.value.trim()) ingredients.value = fav.last.ingredients || '';
    if (fav && !note.value.trim()) note.value = fav.last.note || '';
  });
  const collect = () => ({
    ...(meal || {}), id: meal?.id || uid(), date, title: title.value.trim(), cook: cook.value,
    ingredients: ingredients.value.trim(), note: note.value.trim(),
    addedToList: meal?.addedToList && meal.ingredients === ingredients.value.trim(),
  });
  const save = () => {
    if (!title.value.trim()) { title.focus(); return null; }
    const next = collect();
    store.put('meals', next);
    m.close();
    return next;
  };
  const m = openModal({
    title: fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' }),
    body: h('form', { onsubmit: (e) => { e.preventDefault(); save(); } },
      field('Was gibt’s?', h('div', null, title, datalist)),
      field('Wer kocht?', cook.el),
      field('Zutaten', ingredients, 'Mit einem Tipp auf die Einkaufsliste.'),
      field('Notiz', note),
      h('button', { type: 'submit', hidden: true }),
    ),
    footer: [
      meal ? h('button', { class: 'btn danger', type: 'button', onclick: () => { store.remove('meals', meal.id); m.close(); toast('Entfernt', { undo: () => store.put('meals', meal) }); } }, icon('trash')) : null,
      h('span', { class: 'grow' }),
      h('button', { class: 'btn', type: 'button', title: 'Speichern und Zutaten auf die Einkaufsliste', onclick: () => {
        const saved = save();
        if (!saved) return;
        const n = ingredientsToList(store, saved);
        toast(n ? `${n} Zutat(en) auf die Einkaufsliste gesetzt 🛒` : 'Alles steht schon auf der Liste');
      } }, icon('listAdd'), 'Einkaufen'),
      h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Speichern'),
    ],
  });
}

export function render(ctx) {
  const { store } = ctx;
  const t = today();
  if (!weekStart) weekStart = startOfWeek(t);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const meals = store.list('meals');
  const weekMeals = days.map((d) => meals.find((m) => m.date === d)).filter(Boolean);
  const pending = weekMeals.filter((m) => m.ingredients && !m.addedToList);
  const favs = favorites(store).slice(0, 12);
  const kw = (() => {
    const d = new Date(`${weekStart}T12:00:00`);
    d.setDate(d.getDate() + 3);
    const jan4 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  })();

  return h('div', null,
    h('a', { class: 'back-link', href: '#/mehr' }, icon('left'), 'Mehr'),
    h('div', { class: 'page-head' }, h('h1', null, 'Essensplan')),
    h('div', { class: 'cal-nav' },
      h('button', { class: 'icon-btn plain', type: 'button', 'aria-label': 'Vorige Woche', onclick: () => { weekStart = addDays(weekStart, -7); ctx.rerender(); } }, icon('left')),
      h('h2', null, `KW ${kw} · ${fmtDate(days[0], { day: 'numeric', month: 'short' })} – ${fmtDate(days[6], { day: 'numeric', month: 'short' })}`),
      weekStart !== startOfWeek(t) ? h('button', { class: 'btn small', type: 'button', onclick: () => { weekStart = startOfWeek(t); ctx.rerender(); } }, 'Diese Woche') : null,
      h('button', { class: 'icon-btn plain', type: 'button', 'aria-label': 'Nächste Woche', onclick: () => { weekStart = addDays(weekStart, 7); ctx.rerender(); } }, icon('right')),
    ),
    h('div', { class: 'list' }, days.map((d, i) => {
      const meal = meals.find((m) => m.date === d);
      const cook = meal?.cook ? cookInfo(store, meal.cook) : null;
      return h('div', { class: ['row', 'clickable', 'meal-row', d === t && 'today'], onclick: () => editMeal(store, d, meal) },
        h('div', { class: 'dayname' }, h('div', { class: 'd' }, WEEKDAYS[i]), h('div', { class: 'n' }, Number(d.slice(8)))),
        h('div', { class: 'grow' },
          meal ? h('div', { class: 'title' }, meal.title) : h('div', { class: 'placeholder' }, d < t ? '—' : 'Noch offen'),
          meal ? h('div', { class: 'meta' },
            cook ? h('span', null, `${cook.emoji} ${cook.name}`) : null,
            meal.ingredients ? h('span', { class: ['pill', meal.addedToList && 'good'] }, meal.addedToList ? '✓ auf der Liste' : `${meal.ingredients.split('\n').filter(Boolean).length} Zutaten`) : null,
            meal.note ? h('span', null, meal.note) : null) : null,
        ),
        meal?.ingredients && !meal.addedToList ? h('button', { class: 'btn small', type: 'button', title: 'Zutaten auf die Einkaufsliste', onclick: (e) => {
          e.stopPropagation();
          const n = ingredientsToList(store, meal);
          toast(n ? `${n} Zutat(en) auf die Einkaufsliste 🛒` : 'Steht schon alles drauf');
        } }, icon('cart')) : null,
      );
    })),
    pending.length ? h('div', { class: 'mt' }, h('button', { class: 'btn primary block', type: 'button', onclick: () => {
      let n = 0;
      pending.forEach((m) => { n += ingredientsToList(store, m); });
      toast(`${n} Zutat(en) der Woche auf die Einkaufsliste 🛒`);
    } }, icon('listAdd'), `Zutaten der Woche einkaufen (${pending.length} ${pending.length === 1 ? 'Gericht' : 'Gerichte'})`)) : null,
    favs.length ? [
      h('div', { class: 'section-title' }, '⭐ Eure Klassiker'),
      h('div', { class: 'suggest' }, favs.map((f) => h('button', { type: 'button', class: 'chip', title: `${f.n}× gekocht`, onclick: () => {
        const free = days.find((d) => d >= t && !meals.some((m) => m.date === d)) || days.find((d) => !meals.some((m) => m.date === d));
        if (!free) return toast('Diese Woche ist schon voll geplant');
        editMeal(store, free, null, { title: f.last.title, ingredients: f.last.ingredients, note: f.last.note, cook: f.last.cook });
      } }, f.title, f.n > 1 ? h('span', { class: 'muted' }, `${f.n}×`) : null))),
    ] : h('p', { class: 'small muted mt' }, 'Tipp: Einmal eingetragene Gerichte merkt sich das Nest – samt Zutaten.'),
  );
}
