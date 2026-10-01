import { h, icon, uid, today, addDays, parseISO, toISO, startOfWeek, fmtLong, relDay, fmtDate, monthName, WEEKDAYS, weekdayIndex, openModal, field, optionGroup, toast, confirmDialog } from '../ui.js';
import { agenda, whoInfo, REPEAT_LABELS } from '../domain.js';

let cursor = null; // { y, m }
let selected = null;
let filter = 'all';

function whoOptions(store) {
  return [
    { value: 'all', label: 'Beide', dot: whoInfo(store, 'all').color },
    ...store.members.map((m) => ({ value: m.id, label: m.name, dot: m.color })),
    ...(store.list('pets').length ? [{ value: 'pets', label: whoInfo(store, 'pets').name, dot: whoInfo(store, 'pets').color }] : []),
  ];
}

function matchesFilter(store, event) {
  if (filter === 'all') return true;
  const who = event.who || 'all';
  if (filter === 'pets') return who === 'pets' || !!store.pet(who);
  return who === filter || who === 'all';
}

export function editEvent(store, event = {}, defaults = {}) {
  const isNew = !event.id;
  const e = { title: '', date: defaults.date || today(), time: '', endTime: '', endDate: '', who: 'all', repeat: 'none', notes: '', location: '', ...event };
  const title = h('input', { class: 'input', value: e.title, placeholder: 'z. B. Tierarzt mit Sirich, Kino, Oma besuchen', maxlength: 120, required: true });
  const date = h('input', { class: 'input', type: 'date', value: e.date, required: true });
  const endDate = h('input', { class: 'input', type: 'date', value: e.endDate || '', min: e.date });
  const time = h('input', { class: 'input', type: 'time', value: e.time || '' });
  const endTime = h('input', { class: 'input', type: 'time', value: e.endTime || '' });
  const location = h('input', { class: 'input', value: e.location || '', placeholder: 'optional', maxlength: 120 });
  const notes = h('textarea', { class: 'input', placeholder: 'Notizen …', maxlength: 2000 }, e.notes || '');
  const who = optionGroup(whoOptions(store), e.who || 'all');
  const repeat = optionGroup(Object.entries(REPEAT_LABELS).map(([value, label]) => ({ value, label })), e.repeat || 'none');
  date.addEventListener('change', () => { endDate.min = date.value; });

  const save = () => {
    if (!title.value.trim() || !date.value) { title.focus(); return; }
    const next = {
      ...event,
      id: event.id || uid(),
      title: title.value.trim(),
      date: date.value,
      endDate: endDate.value && endDate.value > date.value ? endDate.value : '',
      time: time.value,
      endTime: time.value ? endTime.value : '',
      who: who.value,
      repeat: repeat.value,
      location: location.value.trim(),
      notes: notes.value.trim(),
      by: event.by || store.meId,
    };
    store.put('events', next);
    m.close();
    toast(isNew ? `Termin „${next.title}“ eingetragen` : 'Gespeichert');
  };

  const m = openModal({
    title: isNew ? 'Neuer Termin' : 'Termin bearbeiten',
    body: h('form', { onsubmit: (ev) => { ev.preventDefault(); save(); } },
      field('Was?', title),
      h('div', { class: 'field-row' }, field('Datum', date), field('Bis (mehrtägig)', endDate)),
      h('div', { class: 'field-row' }, field('Uhrzeit', time, 'leer = ganztägig'), field('Ende', endTime)),
      field('Für wen?', who.el),
      field('Wiederholen', repeat.el, event.repeat && event.repeat !== 'none' ? 'Änderungen gelten für die ganze Serie.' : null),
      field('Ort', location),
      field('Notizen', notes),
      h('button', { type: 'submit', hidden: true }),
    ),
    footer: [
      !isNew ? h('button', { class: 'btn danger', type: 'button', onclick: async () => {
        if (event.repeat && event.repeat !== 'none' && !(await confirmDialog('Das löscht die ganze Terminserie.'))) return;
        store.remove('events', event.id);
        m.close();
        toast('Termin gelöscht', { undo: () => store.put('events', event) });
      } }, icon('trash')) : null,
      h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Speichern'),
    ],
  });
}

function occurrenceRow(store, ctx, o) {
  const w = whoInfo(store, o.event.who);
  const multi = o.end !== o.date;
  return h('div', {
    class: 'row clickable',
    onclick: () => (o.event.birthday ? ctx.go(store.pet(o.event.who) ? 'katzen' : 'einstellungen') : editEvent(store, store.get('events', o.event.id))),
  },
    h('span', { class: 'bar', style: { background: w.color } }),
    h('div', { class: 'time' }, o.event.time || 'ganzt.'),
    h('div', { class: 'grow' },
      h('div', { class: 'title' }, o.event.title),
      h('div', { class: 'meta' },
        h('span', null, `${w.emoji} ${w.name}`),
        o.event.endTime ? h('span', null, `bis ${o.event.endTime}`) : null,
        multi ? h('span', null, `${fmtDate(o.date, { day: 'numeric', month: 'short' })} – ${fmtDate(o.end, { day: 'numeric', month: 'short' })}`) : null,
        o.event.location ? h('span', null, `📍 ${o.event.location}`) : null,
        o.event.repeat && o.event.repeat !== 'none' && !o.event.birthday ? h('span', { class: 'repeat' }, icon('repeat'), REPEAT_LABELS[o.event.repeat]) : null,
      ),
    ),
  );
}

export function render(ctx) {
  const { store } = ctx;
  const t = today();
  if (!cursor) {
    const d = parseISO(t);
    cursor = { y: d.getFullYear(), m: d.getMonth() };
  }
  if (!selected) selected = t;

  const first = toISO(new Date(cursor.y, cursor.m, 1));
  const gridStart = startOfWeek(first);
  const gridEnd = addDays(gridStart, 41);
  const items = agenda(store, gridStart, gridEnd).filter((o) => matchesFilter(store, o.event));
  const byDay = new Map();
  for (const o of items) {
    for (let d = o.date < gridStart ? gridStart : o.date; d <= o.end && d <= gridEnd; d = addDays(d, 1)) {
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d).push(o);
    }
  }

  const move = (delta) => {
    let m = cursor.m + delta;
    let y = cursor.y;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    cursor = { y, m };
    ctx.rerender();
  };

  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    const list = byDay.get(d) || [];
    const other = parseISO(d).getMonth() !== cursor.m;
    days.push(h('button', {
      type: 'button',
      class: ['day', other && 'other', d === t && 'today', d === selected && 'selected', weekdayIndex(d) >= 5 && 'weekend'],
      'aria-label': `${fmtLong(d)}${list.length ? `, ${list.length} Termin(e)` : ''}`,
      'aria-pressed': String(d === selected),
      onclick: () => { selected = d; if (other) cursor = { y: parseISO(d).getFullYear(), m: parseISO(d).getMonth() }; ctx.rerender(); },
      ondblclick: () => editEvent(store, {}, { date: d }),
    },
      h('span', { class: 'num' }, parseISO(d).getDate()),
      h('span', { class: 'dots' }, list.slice(0, 4).map((o) => h('span', { class: 'dot', style: { background: whoInfo(store, o.event.who).color } }))),
      h('span', { class: 'labels' }, list.slice(0, 3).map((o) => {
        const c = whoInfo(store, o.event.who).color;
        return h('span', { style: { background: `color-mix(in srgb, ${c} 22%, transparent)`, borderLeft: `3px solid ${c}` } }, o.event.time ? `${o.event.time} ${o.event.title}` : o.event.title);
      }), list.length > 3 ? h('span', { class: 'muted' }, `+${list.length - 3}`) : null),
    ));
  }

  const dayItems = byDay.get(selected) || agenda(store, selected, selected).filter((o) => matchesFilter(store, o.event));
  const dayTasks = store.list('tasks').filter((x) => !x.done && x.due === selected);
  const dayMeal = store.list('meals').find((x) => x.date === selected);
  const upcoming = agenda(store, t, addDays(t, 60)).filter((o) => matchesFilter(store, o.event) && o.date > selected).slice(0, 8);

  return h('div', null,
    h('div', { class: 'page-head' },
      h('h1', null, 'Kalender'),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => editEvent(store, {}, { date: selected }) }, icon('plus'), 'Termin')),
    ),
    h('div', { class: 'chips scroll' }, [{ value: 'all', label: 'Alle' }, ...whoOptions(store).slice(1)].map((o) => h('button', {
      type: 'button', class: ['chip', filter === o.value && 'active'], onclick: () => { filter = o.value; ctx.rerender(); },
    }, o.dot ? h('span', { class: 'dot', style: { background: o.dot } }) : null, o.label))),
    h('div', { class: 'cal-layout' },
      h('div', { class: 'card' },
        h('div', { class: 'cal-nav' },
          h('button', { class: 'icon-btn plain', type: 'button', 'aria-label': 'Vorheriger Monat', onclick: () => move(-1) }, icon('left')),
          h('h2', null, monthName(cursor.y, cursor.m)),
          h('button', { class: 'btn small', type: 'button', onclick: () => { const d = parseISO(t); cursor = { y: d.getFullYear(), m: d.getMonth() }; selected = t; ctx.rerender(); } }, 'Heute'),
          h('button', { class: 'icon-btn plain', type: 'button', 'aria-label': 'Nächster Monat', onclick: () => move(1) }, icon('right')),
        ),
        h('div', { class: 'month' }, WEEKDAYS.map((w) => h('div', { class: 'dow' }, w)), days),
      ),
      h('div', null,
        h('div', { class: 'card' },
          h('div', { class: 'card-head' },
            h('h2', null, fmtLong(selected)),
            ['Heute', 'Morgen', 'Gestern'].includes(relDay(selected)) ? h('span', { class: 'pill' }, relDay(selected)) : null,
            h('button', { class: 'more', type: 'button', onclick: () => editEvent(store, {}, { date: selected }) }, '+ Termin'),
          ),
          dayItems.length ? h('div', { class: 'list' }, dayItems.map((o) => occurrenceRow(store, ctx, o))) : h('div', { class: 'empty' }, 'Nichts eingetragen.'),
          dayMeal ? h('div', { class: 'meta mt small' }, `🍝 Essen: ${dayMeal.title}`) : null,
          dayTasks.length ? h('div', { class: 'meta mt small' }, `✅ Fällig: ${dayTasks.map((x) => x.title).join(', ')}`) : null,
        ),
        upcoming.length ? [
          h('div', { class: 'section-title' }, 'Danach'),
          h('div', { class: 'list' }, upcoming.map((o) => {
            const row = occurrenceRow(store, ctx, o);
            row.querySelector('.time').textContent = fmtDate(o.date, { day: 'numeric', month: 'short' });
            return row;
          })),
        ] : null,
      ),
    ),
  );
}
