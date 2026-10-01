import { h, svg, icon, uid, today, fmtDate, relDay, ageText, nextBirthday, openModal, field, optionGroup, toast, confirmDialog, emptyState } from '../ui.js';
import { weightSeries, PETLOG_TYPES, whoInfo } from '../domain.js';
import { feedingCard } from './home.js';
import { taskRow, editTask } from './tasks.js';

const PET_EMOJIS = ['🐈', '🐈‍⬛', '🐱', '😺', '😸', '😼', '🦁', '🐯'];
const PET_COLORS = ['#e0a33a', '#7d7fb8', '#c9763d', '#6b9e5a', '#b85f7d', '#5a8fb8'];

function editPet(store, pet = {}) {
  const isNew = !pet.id;
  const p = { name: '', emoji: '🐈', color: PET_COLORS[store.list('pets').length % PET_COLORS.length], birthday: '', breed: '', chip: '', food: '', vet: '', vetPhone: '', notes: '', ...pet };
  const name = h('input', { class: 'input', value: p.name, required: true, maxlength: 40 });
  const emoji = optionGroup(PET_EMOJIS.map((e) => ({ value: e, label: e })), p.emoji);
  const color = h('input', { class: 'input', type: 'color', value: p.color });
  const birthday = h('input', { class: 'input', type: 'date', value: p.birthday || '', max: today() });
  const breed = h('input', { class: 'input', value: p.breed, placeholder: 'z. B. Europäisch Kurzhaar', maxlength: 60 });
  const chip = h('input', { class: 'input', value: p.chip, placeholder: 'Transponder-Nr.', maxlength: 40, inputmode: 'numeric' });
  const food = h('input', { class: 'input', value: p.food, placeholder: 'z. B. 2× 85 g Nassfutter, abends Trocken', maxlength: 200 });
  const vet = h('input', { class: 'input', value: p.vet, placeholder: 'Praxis', maxlength: 100 });
  const vetPhone = h('input', { class: 'input', type: 'tel', value: p.vetPhone, placeholder: 'Telefon', maxlength: 40 });
  const notes = h('textarea', { class: 'input', placeholder: 'Allergien, Eigenheiten, Lieblingsspielzeug …', maxlength: 2000 }, p.notes || '');
  const save = () => {
    if (!name.value.trim()) { name.focus(); return; }
    store.put('pets', {
      ...pet, id: pet.id || uid(), name: name.value.trim(), emoji: emoji.value, color: color.value, birthday: birthday.value,
      breed: breed.value.trim(), chip: chip.value.trim(), food: food.value.trim(), vet: vet.value.trim(), vetPhone: vetPhone.value.trim(), notes: notes.value.trim(),
    });
    m.close();
  };
  const m = openModal({
    title: isNew ? 'Neues Haustier' : `${p.name} bearbeiten`,
    body: h('form', { onsubmit: (e) => { e.preventDefault(); save(); } },
      h('div', { class: 'field-row' }, field('Name', name), field('Farbe', color)),
      field('Symbol', emoji.el),
      h('div', { class: 'field-row' }, field('Geburtstag', birthday), field('Rasse', breed)),
      field('Chip-Nummer', chip),
      field('Futter', food),
      h('div', { class: 'field-row' }, field('Tierarzt', vet), field('Telefon', vetPhone)),
      field('Notizen', notes),
      h('button', { type: 'submit', hidden: true }),
    ),
    footer: [
      !isNew ? h('button', { class: 'btn danger', type: 'button', onclick: async () => {
        if (!(await confirmDialog(`${p.name} wirklich entfernen? Einträge im Tagebuch bleiben erhalten.`, { ok: 'Entfernen' }))) return;
        store.remove('pets', pet.id);
        m.close();
      } }, icon('trash')) : null,
      h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Speichern'),
    ],
  });
}

function addLog(store, pet, type = 'weight', entry = null) {
  const e = entry || { type, date: today(), value: '', note: '' };
  const kind = optionGroup(Object.entries(PETLOG_TYPES).filter(([k]) => k !== 'feed').map(([value, t]) => ({ value, label: `${t.emoji} ${t.label}` })), e.type, () => sync());
  const date = h('input', { class: 'input', type: 'date', value: e.date, max: today() });
  const value = h('input', { class: 'input', type: 'number', step: '0.01', min: '0', max: '30', value: e.value, placeholder: 'z. B. 4,35', inputmode: 'decimal' });
  const note = h('textarea', { class: 'input', placeholder: 'Was war los? Welches Mittel, welche Dosis …', maxlength: 2000 }, e.note || '');
  const valueField = field('Gewicht in kg', value);
  const sync = () => { valueField.hidden = kind.value !== 'weight'; };
  sync();
  const save = () => {
    if (kind.value === 'weight' && !(Number(value.value) > 0)) { value.focus(); return; }
    store.put('petlog', {
      ...(entry || {}), id: entry?.id || uid(), petId: pet.id, type: kind.value, date: date.value || today(),
      value: kind.value === 'weight' ? Number(value.value) : '', note: note.value.trim(), by: entry?.by || store.meId,
    });
    m.close();
    toast('Eingetragen');
  };
  const m = openModal({
    title: `${pet.emoji} ${pet.name}: Eintrag`,
    body: h('form', { onsubmit: (ev) => { ev.preventDefault(); save(); } },
      field('Art', kind.el), field('Datum', date), valueField, field('Notiz', note),
      h('button', { type: 'submit', hidden: true })),
    footer: [
      entry ? h('button', { class: 'btn danger', type: 'button', onclick: () => { store.remove('petlog', entry.id); m.close(); toast('Gelöscht', { undo: () => store.put('petlog', entry) }); } }, icon('trash')) : null,
      h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Speichern'),
    ],
  });
}

// Einzelne Linie: das Gewicht über die Zeit. Hover/Tippen zeigt Datum + Wert.
function weightChart(series) {
  const W = 560;
  const H = 120;
  const pad = { l: 6, r: 6, t: 10, b: 10 };
  const vals = series.map((s) => s.value);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (max - min < 0.4) { min -= 0.2; max += 0.2; }
  const x = (i) => (series.length === 1 ? W / 2 : pad.l + (i / (series.length - 1)) * (W - pad.l - pad.r));
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const pts = series.map((s, i) => [x(i), y(s.value)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const area = `${line}L${pts[pts.length - 1][0].toFixed(1)},${H - pad.b}L${pts[0][0].toFixed(1)},${H - pad.b}Z`;
  const kg = (v) => `${v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
  const tip = h('div', { class: 'spark-tip' }, `Zuletzt ${kg(vals[vals.length - 1])} · ${fmtDate(series[series.length - 1].date)}`);
  const dots = [];
  const chart = svg('svg', { class: 'spark', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Gewichtsverlauf: ${series.map((s) => `${fmtDate(s.date)} ${kg(s.value)}`).join(', ')}` },
    series.length > 1 ? svg('path', { class: 'area', d: area }) : null,
    series.length > 1 ? svg('path', { class: 'line', d: line }) : null,
    pts.map((p, i) => {
      const dot = svg('circle', { class: 'pt', cx: p[0], cy: p[1], r: 4 });
      dots.push(dot);
      const show = () => {
        dots.forEach((d) => d.classList.remove('hover'));
        dot.classList.add('hover');
        tip.textContent = `${fmtDate(series[i].date, { day: 'numeric', month: 'long', year: 'numeric' })}: ${kg(series[i].value)}`;
      };
      const w = series.length === 1 ? W : (W - pad.l - pad.r) / (series.length - 1);
      return [svg('rect', { class: 'hit', x: p[0] - w / 2, y: 0, width: w, height: H, onmouseenter: show, onclick: show }), dot];
    }),
  );
  return h('div', null, chart, tip);
}

function petCard(store, pet) {
  const weights = weightSeries(store, pet.id);
  const nb = nextBirthday(pet.birthday);
  const care = store.list('tasks').filter((t) => !t.done && (t.pet === pet.id || t.pet === 'all')).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
  const log = store.list('petlog').filter((l) => l.petId === pet.id && l.type !== 'feed').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const info = [
    ['Rasse', pet.breed],
    ['Geburtstag', pet.birthday ? `${fmtDate(pet.birthday, { day: 'numeric', month: 'long', year: 'numeric' })}${nb ? ` (wird ${nb.turns} ${relDay(nb.date) === 'Heute' ? 'heute! 🎉' : `am ${fmtDate(nb.date, { day: 'numeric', month: 'short' })}`})` : ''}` : ''],
    ['Futter', pet.food],
    ['Chip', pet.chip],
    ['Tierarzt', pet.vet || pet.vetPhone ? h('span', null, pet.vet, pet.vetPhone ? [' · ', h('a', { href: `tel:${pet.vetPhone.replace(/[^\d+]/g, '')}` }, pet.vetPhone)] : null) : ''],
    ['Notizen', pet.notes],
  ].filter(([, v]) => v);

  return h('div', { class: 'card pet-card' },
    h('div', { class: 'pet-top' },
      h('span', { class: 'avatar lg', style: { background: pet.color } }, pet.emoji),
      h('div', { class: 'grow' }, h('h2', null, pet.name), pet.birthday ? h('div', { class: 'age' }, ageText(pet.birthday)) : null),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': `${pet.name} bearbeiten`, onclick: () => editPet(store, pet) }, icon('edit')),
    ),
    info.length ? h('dl', { class: 'info-list' }, info.map(([k, v]) => [h('dt', null, k), h('dd', null, v)]))
      : h('button', { class: 'btn small', type: 'button', onclick: () => editPet(store, pet) }, 'Steckbrief ausfüllen'),

    h('div', { class: 'section-title' }, '⚖️ Gewicht',
      h('button', { class: 'btn small', type: 'button', onclick: () => addLog(store, pet, 'weight') }, icon('plus'), 'Wiegen')),
    weights.length ? weightChart(weights) : h('div', { class: 'empty' }, 'Noch nicht gewogen. Tipp: Selbst wiegen, dann mit Katze auf dem Arm – Differenz eintragen.'),

    h('div', { class: 'section-title' }, '🩺 Pflege & Termine',
      h('button', { class: 'btn small', type: 'button', onclick: () => editTask(store, {}, { pet: pet.id, repeatDays: 30 }) }, icon('plus'))),
    care.length ? h('div', { class: 'list' }, care.slice(0, 6).map((t) => taskRow(store, t))) : h('div', { class: 'empty' }, 'Keine Pflege-Aufgaben. Z. B. Entwurmung alle 3 Monate, Impfung jährlich.'),

    h('div', { class: 'section-title' }, '📖 Tagebuch',
      h('button', { class: 'btn small', type: 'button', onclick: () => addLog(store, pet, 'vet') }, icon('plus'))),
    log.length ? h('div', { class: 'list' }, log.map((l) => {
      const t = PETLOG_TYPES[l.type] || PETLOG_TYPES.note;
      return h('div', { class: 'row clickable', onclick: () => addLog(store, pet, l.type, l) },
        h('span', { style: { fontSize: '20px' } }, t.emoji),
        h('div', { class: 'grow' },
          h('div', { class: 'title' }, l.type === 'weight' ? `${Number(l.value).toLocaleString('de-DE')} kg` : t.label),
          h('div', { class: 'meta' }, [fmtDate(l.date, { day: 'numeric', month: 'short', year: 'numeric' }), l.note, l.by ? whoInfo(store, l.by).name : ''].filter(Boolean).join(' · '))));
    })) : h('div', { class: 'empty' }, 'Tierarztbesuche, Impfungen, Medikamente – alles hier notieren.'),
  );
}

export function render(ctx) {
  const { store } = ctx;
  const pets = store.list('pets').sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  return h('div', null,
    h('a', { class: 'back-link', href: '#/mehr' }, icon('left'), 'Mehr'),
    h('div', { class: 'page-head' },
      h('h1', null, pets.length === 2 ? `${pets[0].name} & ${pets[1].name}` : 'Katzen'),
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => editPet(store) }, icon('plus'), 'Tier')),
    ),
    pets.length ? [
      feedingCard(store, { compact: true }),
      h('div', { class: 'grid two mt' }, pets.map((p) => petCard(store, p))),
    ] : emptyState('🐾', 'Noch keine Haustiere eingetragen.', h('button', { class: 'btn primary', type: 'button', onclick: () => editPet(store) }, 'Katze hinzufügen')),
  );
}
