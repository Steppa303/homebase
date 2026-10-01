import { h, icon, uid, today, addDays, relDay, openModal, field, optionGroup, checkButton, toast, emptyState, confirmDialog } from '../ui.js';
import { whoInfo, TASK_INTERVALS, intervalLabel, completeTask, taskBucket } from '../domain.js';

let filter = 'all';

const BUCKETS = [
  { key: 'overdue', label: 'Überfällig', cls: 'bad' },
  { key: 'today', label: 'Heute' },
  { key: 'tomorrow', label: 'Morgen' },
  { key: 'week', label: 'Diese Woche' },
  { key: 'later', label: 'Später' },
  { key: 'someday', label: 'Irgendwann' },
];

export function editTask(store, task = {}, defaults = {}) {
  const isNew = !task.id;
  const t = { title: '', assignee: 'both', due: today(), repeatDays: 0, pet: null, notes: '', ...defaults, ...task };
  const title = h('input', { class: 'input', value: t.title, placeholder: 'z. B. Katzenklo säubern', maxlength: 120, required: true });
  const due = h('input', { class: 'input', type: 'date', value: t.due || '' });
  const notes = h('textarea', { class: 'input', placeholder: 'Details, Hinweise …', maxlength: 2000 }, t.notes || '');
  const assignee = optionGroup([
    { value: 'both', label: 'Beide', dot: whoInfo(store, 'both').color },
    ...store.members.map((m) => ({ value: m.id, label: m.name, dot: m.color })),
  ], t.assignee || 'both');
  const custom = h('input', { class: 'input', type: 'number', min: 1, max: 999, style: { width: '110px' }, value: TASK_INTERVALS.some((i) => i.value === t.repeatDays) ? '' : t.repeatDays, placeholder: 'Tage' });
  const repeat = h('select', { class: 'input', value: TASK_INTERVALS.some((i) => i.value === t.repeatDays) ? String(t.repeatDays) : 'custom' },
    TASK_INTERVALS.map((i) => h('option', { value: String(i.value) }, i.label)),
    h('option', { value: 'custom' }, 'Eigener Rhythmus …'));
  const syncCustom = () => { custom.hidden = repeat.value !== 'custom'; };
  repeat.addEventListener('change', syncCustom);
  syncCustom();
  const pets = store.list('pets');
  const pet = optionGroup([
    { value: '', label: 'Keine' },
    ...(pets.length > 1 ? [{ value: 'all', label: 'Alle Katzen' }] : []),
    ...pets.map((p) => ({ value: p.id, label: `${p.emoji} ${p.name}` })),
  ], t.pet || '');

  const save = () => {
    if (!title.value.trim()) { title.focus(); return; }
    const repeatDays = repeat.value === 'custom' ? Math.max(1, parseInt(custom.value, 10) || 0) : Number(repeat.value);
    const next = {
      ...task,
      id: task.id || uid(),
      title: title.value.trim(),
      due: due.value || (repeatDays ? today() : ''),
      repeatDays,
      assignee: assignee.value,
      pet: pet.value || null,
      notes: notes.value.trim(),
      done: task.done && !repeatDays ? task.done : false,
      history: task.history || [],
      by: task.by || store.meId,
    };
    store.put('tasks', next);
    m.close();
    if (isNew) toast(`Aufgabe „${next.title}“ angelegt`);
  };

  const last = (task.history || [])[0];
  const m = openModal({
    title: isNew ? 'Neue Aufgabe' : 'Aufgabe bearbeiten',
    body: h('form', { onsubmit: (e) => { e.preventDefault(); save(); } },
      field('Was ist zu tun?', title),
      h('div', { class: 'field-row' }, field('Fällig am', due), field('Wiederholen', h('div', { class: 'row-gap' }, repeat, custom))),
      field('Wer?', assignee.el),
      pets.length ? field('Gehört zu', pet.el) : null,
      field('Notizen', notes),
      last ? h('p', { class: 'small muted' }, `Zuletzt erledigt ${relDay(last.at.slice(0, 10)).toLowerCase()} von ${whoInfo(store, last.by).name} · insgesamt ${(task.history || []).length}×`) : null,
      h('button', { type: 'submit', hidden: true }),
    ),
    footer: [
      !isNew ? h('button', { class: 'btn danger', type: 'button', onclick: async () => {
        if (!(await confirmDialog(`„${task.title}“ löschen?`))) return;
        store.remove('tasks', task.id);
        m.close();
        toast('Aufgabe gelöscht', { undo: () => store.put('tasks', task) });
      } }, icon('trash')) : null,
      h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Speichern'),
    ],
  });
}

export function taskRow(store, task, { showDue = true } = {}) {
  const w = whoInfo(store, task.assignee);
  const bucket = taskBucket(task);
  const petNames = task.pet === 'all' ? '🐾 Katzen' : task.pet ? `${store.pet(task.pet)?.emoji || '🐾'} ${store.pet(task.pet)?.name || ''}` : null;
  return h('div', { class: ['row', 'clickable', task.done && 'done'], onclick: () => editTask(store, task) },
    checkButton(task.done, () => {
      if (task.done) {
        store.patch('tasks', task.id, { done: false, doneAt: null, doneBy: null });
        return;
      }
      const { undo, next } = completeTask(store, task);
      toast(next.due ? `Erledigt! Nächstes Mal: ${relDay(next.due)}` : 'Erledigt! 🎉', { undo });
    }, task.done ? `${task.title} wieder öffnen` : `${task.title} erledigen`),
    h('div', { class: 'grow' },
      h('div', { class: 'title' }, task.title),
      h('div', { class: 'meta' },
        showDue && task.due && !task.done ? h('span', { class: ['pill', bucket === 'overdue' && 'bad', bucket === 'today' && 'warn'] }, relDay(task.due)) : null,
        task.done && task.doneAt ? h('span', null, `✓ ${whoInfo(store, task.doneBy).name}, ${relDay(task.doneAt.slice(0, 10))}`) : null,
        h('span', null, h('span', { class: 'dot', style: { background: w.color, width: '8px', height: '8px', marginRight: '4px' } }), w.name),
        task.repeatDays ? h('span', { class: 'repeat' }, icon('repeat'), intervalLabel(task.repeatDays)) : null,
        petNames ? h('span', null, petNames) : null,
      ),
    ),
  );
}

export function render(ctx) {
  const { store } = ctx;
  const t = today();
  const all = store.list('tasks').filter((task) => {
    if (filter === 'all') return true;
    if (filter === 'pets') return !!task.pet;
    return task.assignee === filter || task.assignee === 'both' || !task.assignee;
  });
  const open = all.filter((task) => !task.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.title.localeCompare(b.title, 'de'));
  const done = all.filter((task) => task.done && task.doneAt && task.doneAt.slice(0, 10) >= addDays(t, -14))
    .sort((a, b) => b.doneAt.localeCompare(a.doneAt));

  const quick = h('input', { class: 'input', 'data-keep': 'task-add', placeholder: 'Neue Aufgabe … (Enter)', maxlength: 120, 'aria-label': 'Neue Aufgabe', autocomplete: 'off' });
  const form = h('form', { class: 'addbar', onsubmit: (e) => {
    e.preventDefault();
    const title = quick.value.trim();
    if (!title) return editTask(store);
    const assignee = filter !== 'all' && filter !== 'pets' ? filter : 'both';
    store.put('tasks', { id: uid(), title, assignee, due: t, repeatDays: 0, pet: filter === 'pets' ? 'all' : null, notes: '', done: false, history: [], by: store.meId });
    quick.value = '';
    toast('Aufgabe für heute angelegt – antippen für Details');
  } }, quick,
  h('button', { class: 'btn', type: 'button', 'aria-label': 'Mit Details anlegen', title: 'Mit Details', onclick: () => editTask(store, {}, { title: quick.value.trim(), assignee: filter !== 'all' && filter !== 'pets' ? filter : 'both' }) }, icon('edit')),
  h('button', { class: 'btn primary', type: 'submit', 'aria-label': 'Hinzufügen' }, icon('plus')));

  const chips = [
    { value: 'all', label: 'Alle' },
    ...store.members.map((m) => ({ value: m.id, label: m.id === store.meId ? `${m.emoji} Meine` : `${m.emoji} ${m.name}` })),
    ...(store.list('pets').length ? [{ value: 'pets', label: '🐾 Katzen' }] : []),
  ];

  const sections = BUCKETS.map((b) => ({ ...b, items: open.filter((task) => taskBucket(task, t) === b.key) })).filter((b) => b.items.length);

  return h('div', null,
    h('div', { class: 'page-head' }, h('h1', null, 'Aufgaben')),
    h('div', { class: 'chips scroll' }, chips.map((c) => h('button', { type: 'button', class: ['chip', filter === c.value && 'active'], onclick: () => { filter = c.value; ctx.rerender(); } }, c.label))),
    form,
    open.length || done.length
      ? sections.map((s) => [
        h('div', { class: ['section-title', s.cls] }, s.label, h('span', { class: 'n' }, s.items.length)),
        h('div', { class: 'list' }, s.items.map((task) => taskRow(store, task))),
      ])
      : emptyState('🧹', 'Keine Aufgaben. Legt wiederkehrende Sachen an – z. B. „Katzenklo“ täglich oder „Bad putzen“ wöchentlich.'),
    done.length ? [
      h('div', { class: 'section-title' }, 'Erledigt (14 Tage)', h('span', { class: 'n' }, done.length),
        h('button', { class: 'btn small ghost', type: 'button', onclick: () => {
          done.forEach((task) => store.remove('tasks', task.id));
          toast('Erledigte aufgeräumt', { undo: () => done.forEach((task) => store.put('tasks', task)) });
        } }, 'Aufräumen')),
      h('div', { class: 'list' }, done.map((task) => taskRow(store, task))),
    ] : null,
    h('p', { class: 'small muted mt' }, 'Tipp: Wiederkehrende Aufgaben springen beim Abhaken automatisch auf den nächsten Termin.'),
  );
}
