// Fachlogik, die mehrere Ansichten teilen.

import { addDays, diffDays, parseISO, toISO, today } from './ui.js';

// ---------------------------------------------------------------------------
// Einkauf: Kategorien in Laufreihenfolge durch den Supermarkt

export const SHOP_CATEGORIES = [
  { name: 'Obst & Gemüse', emoji: '🥦', words: 'apfel äpfel banane birne tomate gurke salat paprika zwiebel kartoffel möhre karotte zitrone limette orange beeren erdbeere himbeere heidelbeere trauben avocado knoblauch pilze champignons brokkoli zucchini spinat lauch ingwer kräuter petersilie basilikum schnittlauch obst gemüse mango kiwi melone kohl aubergine radieschen rucola süßkartoffel kürbis ananas blumenkohl sellerie mais' },
  { name: 'Brot & Backwaren', emoji: '🥖', words: 'brot brötchen toast baguette croissant brezel laugen kuchen wraps tortilla semmel' },
  { name: 'Kühlregal', emoji: '🧀', words: 'milch käse joghurt quark butter sahne eier schmand frischkäse mozzarella feta parmesan tofu aufschnitt schinken wurst margarine skyr pudding hummus gnocchi' },
  { name: 'Fleisch & Fisch', emoji: '🥩', words: 'hähnchen huhn hack hackfleisch rind schwein steak lachs fisch garnelen thunfisch pute speck bratwurst fleisch schnitzel' },
  { name: 'Vorrat', emoji: '🥫', words: 'nudeln pasta spaghetti penne reis mehl zucker salz pfeffer öl olivenöl essig konserve dose tomatenmark passata linsen bohnen kichererbsen müsli haferflocken cornflakes honig marmelade nutella gewürz brühe senf ketchup mayo soße sauce pesto backpulver hefe kaffee tee kakao nüsse mandeln erdnussbutter' },
  { name: 'Tiefkühl', emoji: '🧊', words: 'tk tiefkühl pizza eis speiseeis pommes fischstäbchen gefroren tiefkühlgemüse' },
  { name: 'Getränke', emoji: '🥤', words: 'wasser sprudel saft cola bier wein sekt limo mate schorle getränke kombucha' },
  { name: 'Snacks & Süßes', emoji: '🍫', words: 'schokolade chips kekse gummibärchen süßigkeiten snack riegel popcorn cracker salzstangen' },
  { name: 'Drogerie & Haushalt', emoji: '🧴', words: 'klopapier toilettenpapier küchenrolle spülmittel waschmittel shampoo duschgel zahnpasta zahnbürste deo seife müllbeutel schwamm putzmittel taschentücher creme rasierer watte tabs spülmaschinentabs weichspüler alufolie backpapier frischhaltefolie batterien glühbirne lappen handseife' },
  { name: 'Tierbedarf', emoji: '🐈', words: 'katze katzen streu katzenstreu futter katzenfutter nassfutter trockenfutter leckerli kratzbaum kratz katzengras catnip whiskas sheba felix haarball' },
  { name: 'Sonstiges', emoji: '🛒', words: '' },
];

const KEYWORDS = SHOP_CATEGORIES.flatMap((c) => c.words.split(' ').filter(Boolean).map((w) => ({ w, cat: c.name })))
  .sort((a, b) => b.w.length - a.w.length);

export function guessCategory(text, freq = {}) {
  const key = normalizeItem(text);
  if (freq[key]?.category) return freq[key].category;
  const words = key.split(/[\s\-/,]+/).filter(Boolean);
  for (const { w, cat } of KEYWORDS) {
    for (const word of words) {
      if (word === w) return cat;
      if (w.length >= 4 && (word.startsWith(w) || word.endsWith(w))) return cat;
    }
  }
  return 'Sonstiges';
}

export function normalizeItem(text) {
  return String(text).trim().toLowerCase();
}

export function categoryInfo(name) {
  return SHOP_CATEGORIES.find((c) => c.name === name) || SHOP_CATEGORIES[SHOP_CATEGORIES.length - 1];
}

// "2x Milch", "3 Äpfel", "Milch 2l" → { qty, text }
export function parseQuickAdd(input) {
  let text = input.trim().replace(/\s+/g, ' ');
  let qty = '';
  const lead = text.match(/^(\d+(?:[.,]\d+)?\s*(?:x|×|stk\.?|stück|kg|g|l|ml|packungen|pkg|dosen|flaschen)?)\s+(.+)$/i);
  if (lead) {
    qty = lead[1].replace(/\s+/g, ' ');
    text = lead[2];
  } else {
    const tail = text.match(/^(.+?)\s+(\d+(?:[.,]\d+)?\s*(?:x|×|kg|g|l|ml|stk\.?|stück))$/i);
    if (tail) {
      text = tail[1];
      qty = tail[2];
    }
  }
  return { text: text.charAt(0).toUpperCase() + text.slice(1), qty };
}

// ---------------------------------------------------------------------------
// Personen / Zuständigkeiten

export const BOTH_COLOR = '#8a63b8';
export const PETS_COLOR = '#e0a33a';

export function whoInfo(store, id) {
  if (!id || id === 'both' || id === 'all') return { name: 'Beide', color: BOTH_COLOR, emoji: '👥' };
  if (id === 'pets') {
    const pets = store.list('pets');
    return { name: pets.length === 1 ? pets[0].name : 'Katzen', color: PETS_COLOR, emoji: '🐾' };
  }
  const m = store.member(id);
  if (m) return m;
  const p = store.pet(id);
  if (p) return p;
  return { name: '?', color: '#999', emoji: '❔' };
}

// ---------------------------------------------------------------------------
// Kalender: Wiederholungen auflösen

function daysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate();
}

// Liefert alle Vorkommen eines Termins, die [from, to] berühren.
export function occurrences(event, from, to) {
  if (!event.date) return [];
  const span = event.endDate && event.endDate > event.date ? diffDays(event.date, event.endDate) : 0;
  const out = [];
  const push = (start) => {
    if (start < event.date) return;
    if (event.until && start > event.until) return;
    const end = addDays(start, span);
    if (end >= from && start <= to) out.push({ event, date: start, end });
  };
  const repeat = event.repeat || 'none';
  if (repeat === 'none') {
    push(event.date);
  } else if (repeat === 'weekly') {
    const lead = diffDays(event.date, from) - span;
    let k = Math.max(0, Math.ceil(lead / 7));
    for (let d = addDays(event.date, k * 7); d <= to; d = addDays(event.date, ++k * 7)) push(d);
  } else if (repeat === 'monthly') {
    const s = parseISO(event.date);
    const f = parseISO(addDays(from, -span));
    const day = s.getDate();
    let idx = Math.max(s.getFullYear() * 12 + s.getMonth(), f.getFullYear() * 12 + f.getMonth());
    for (;; idx++) {
      const y = Math.floor(idx / 12);
      const m = idx % 12;
      if (toISO(new Date(y, m, 1)) > to) break;
      if (day <= daysInMonth(y, m)) push(toISO(new Date(y, m, day)));
    }
  } else if (repeat === 'yearly') {
    const [, mm, dd] = event.date.split('-');
    const y0 = Math.max(Number(event.date.slice(0, 4)), Number(from.slice(0, 4)) - 1);
    for (let y = y0; y <= Number(to.slice(0, 4)); y++) {
      const d = `${y}-${mm}-${dd}`;
      if (Number(dd) <= daysInMonth(y, Number(mm) - 1)) push(d);
    }
  }
  return out;
}

// Termine + Geburtstage in einem Zeitraum, sortiert
export function agenda(store, from, to) {
  const items = [];
  for (const e of store.list('events')) items.push(...occurrences(e, from, to));
  const bdays = [
    ...store.members.map((m) => ({ ...m, kind: 'member' })),
    ...store.list('pets').map((p) => ({ ...p, kind: 'pet' })),
  ];
  for (const b of bdays) {
    if (!b.birthday) continue;
    const pseudo = { id: `bday-${b.id}`, title: `🎂 ${b.name} hat Geburtstag`, date: b.birthday, repeat: 'yearly', who: b.id, birthday: true };
    items.push(...occurrences(pseudo, from, to));
  }
  items.sort((a, b) => (a.date + (a.event.time || '00:00')).localeCompare(b.date + (b.event.time || '00:00')));
  return items;
}

export const REPEAT_LABELS = { none: 'Einmalig', weekly: 'Wöchentlich', monthly: 'Monatlich', yearly: 'Jährlich' };

// ---------------------------------------------------------------------------
// Aufgaben

export const TASK_INTERVALS = [
  { value: 0, label: 'Einmalig' },
  { value: 1, label: 'Täglich' },
  { value: 2, label: 'Alle 2 Tage' },
  { value: 3, label: 'Alle 3 Tage' },
  { value: 7, label: 'Wöchentlich' },
  { value: 14, label: 'Alle 2 Wochen' },
  { value: 30, label: 'Monatlich' },
  { value: 90, label: 'Vierteljährlich' },
  { value: 365, label: 'Jährlich' },
];

export function intervalLabel(days) {
  const known = TASK_INTERVALS.find((i) => i.value === days);
  if (known) return known.label;
  return `Alle ${days} Tage`;
}

export function completeTask(store, task) {
  const prev = { done: task.done, due: task.due, doneAt: task.doneAt, doneBy: task.doneBy, history: task.history };
  const entry = { at: new Date().toISOString(), by: store.meId };
  const history = [entry, ...(task.history || [])].slice(0, 30);
  let next;
  if (task.repeatDays > 0) {
    // Nächster Termin ab heute gerechnet – wer spät dran war, fängt neu an
    next = { due: addDays(today(), task.repeatDays), history, lastDoneAt: entry.at, lastDoneBy: entry.by };
  } else {
    next = { done: true, doneAt: entry.at, doneBy: entry.by, history };
  }
  store.patch('tasks', task.id, next);
  return { next, undo: () => store.patch('tasks', task.id, prev) };
}

export function taskBucket(task, t = today()) {
  if (task.done) return 'done';
  if (!task.due) return 'someday';
  const d = diffDays(t, task.due);
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d < 7) return 'week';
  return 'later';
}

// Wie viele Aufgaben hat wer in den letzten n Tagen erledigt?
export function choreScore(store, days = 7) {
  const since = Date.now() - days * 86400000;
  const score = Object.fromEntries(store.members.map((m) => [m.id, 0]));
  for (const t of store.list('tasks')) {
    for (const h of t.history || []) {
      if (new Date(h.at).getTime() >= since && h.by in score) score[h.by] += 1;
    }
  }
  return score;
}

// ---------------------------------------------------------------------------
// Haushaltskasse

export const EXPENSE_CATEGORIES = [
  { name: 'Lebensmittel', emoji: '🛒' },
  { name: 'Haushalt', emoji: '🧽' },
  { name: 'Katzen', emoji: '🐈' },
  { name: 'Wohnen', emoji: '🏠' },
  { name: 'Freizeit', emoji: '🎉' },
  { name: 'Essen gehen', emoji: '🍝' },
  { name: 'Mobilität', emoji: '🚲' },
  { name: 'Sonstiges', emoji: '📦' },
];

// Positiv: members[1] schuldet members[0]; negativ: umgekehrt.
export function balance(store) {
  const [a, b] = store.members;
  if (!a || !b) return 0;
  let net = 0;
  for (const e of store.list('expenses')) {
    const share = e.split === 'other' ? e.amount : Math.round(e.amount / 2);
    if (e.paidBy === a.id) net += share;
    else if (e.paidBy === b.id) net -= share;
  }
  return net;
}

// ---------------------------------------------------------------------------
// Katzen-Fütterung

export function feedingsToday(store) {
  const t = today();
  return store.list('petlog').filter((l) => l.type === 'feed' && l.date === t);
}

export function weightSeries(store, petId) {
  return store.list('petlog')
    .filter((l) => l.type === 'weight' && l.petId === petId && Number.isFinite(Number(l.value)))
    .map((l) => ({ date: l.date, value: Number(l.value) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export const PETLOG_TYPES = {
  weight: { label: 'Gewicht', emoji: '⚖️' },
  vet: { label: 'Tierarzt', emoji: '🩺' },
  meds: { label: 'Medikament', emoji: '💊' },
  vaccine: { label: 'Impfung', emoji: '💉' },
  note: { label: 'Notiz', emoji: '📝' },
  feed: { label: 'Gefüttert', emoji: '🍽️' },
};
