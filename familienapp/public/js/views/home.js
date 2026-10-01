import { h, today, addDays, fmtDate, fmtLong, relDay, fmtTime, fmtMoney, greeting, checkButton, toast, uid, nextBirthday } from '../ui.js';
import { agenda, whoInfo, taskBucket, completeTask, choreScore, balance, feedingsToday, categoryInfo } from '../domain.js';

export function feedingCard(store, { compact = false } = {}) {
  const slots = store.settings.feedSlots?.length ? store.settings.feedSlots : ['Morgens', 'Abends'];
  const fed = feedingsToday(store);
  const pets = store.list('pets');
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' },
      h('span', { class: 'emoji' }, '🍽️'),
      h('h2', null, compact ? 'Fütterung' : `${pets.length ? pets.map((p) => p.name).join(' & ') : 'Katzen'} gefüttert?`),
      h('span', { class: 'feed-cats', 'aria-hidden': 'true' }, pets.map((p) => p.emoji).join('')),
    ),
    h('div', { class: 'feed-grid' }, slots.map((slot) => {
      const entry = fed.find((f) => f.slot === slot);
      const who = entry ? whoInfo(store, entry.by) : null;
      return h('button', {
        type: 'button',
        class: ['feed-btn', entry && 'fed'],
        'aria-pressed': String(!!entry),
        onclick: () => {
          if (entry) {
            store.remove('petlog', entry.id);
            toast(`${slot}: Fütterung zurückgenommen`, { undo: () => store.put('petlog', entry) });
          } else {
            store.put('petlog', { id: uid(), type: 'feed', petId: 'all', slot, date: today(), at: new Date().toISOString(), by: store.meId });
            toast(`${slot} gefüttert – danke! 😻`);
          }
        },
      },
        h('span', { class: 'slot' }, entry ? `✓ ${slot}` : slot),
        h('span', { class: 'state' }, entry ? `${who.name} · ${fmtTime(entry.at)}` : 'Noch offen – tippen'),
      );
    })),
  );
}

function eventsCard(store, ctx) {
  const t = today();
  const items = agenda(store, t, addDays(t, 7)).slice(0, 7);
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('span', { class: 'emoji' }, '📅'), h('h2', null, 'Nächste 7 Tage'),
      h('a', { class: 'more', href: '#/kalender' }, 'Kalender')),
    items.length
      ? h('div', { class: 'list' }, items.map((o) => {
        const w = whoInfo(store, o.event.who);
        return h('div', { class: 'row clickable', onclick: () => ctx.go('kalender') },
          h('span', { class: 'bar', style: { background: w.color } }),
          h('div', { class: 'grow' },
            h('div', { class: 'title' }, o.event.title),
            h('div', { class: 'meta' }, [relDay(o.date), o.event.time, o.event.who && o.event.who !== 'all' ? w.name : ''].filter(Boolean).join(' · '))),
        );
      }))
      : h('div', { class: 'empty' }, 'Keine Termine – freie Woche! 🌿'),
  );
}

function tasksCard(store) {
  const due = store.list('tasks')
    .filter((t) => ['overdue', 'today'].includes(taskBucket(t)))
    .sort((a, b) => (a.due || '').localeCompare(b.due || ''));
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('span', { class: 'emoji' }, '✅'), h('h2', null, 'Heute zu tun'),
      h('a', { class: 'more', href: '#/aufgaben' }, 'Alle')),
    due.length
      ? h('div', { class: 'list' }, due.slice(0, 8).map((t) => {
        const w = whoInfo(store, t.assignee);
        const overdue = taskBucket(t) === 'overdue';
        return h('div', { class: 'row' },
          checkButton(false, () => {
            const { undo, next } = completeTask(store, t);
            toast(next.due ? `Erledigt! Nächstes Mal ${relDay(next.due).toLowerCase()}` : 'Erledigt! 🎉', { undo });
          }, `${t.title} erledigen`),
          h('div', { class: 'grow' },
            h('div', { class: 'title' }, t.pet ? `🐾 ${t.title}` : t.title),
            h('div', { class: 'meta' },
              overdue ? h('span', { class: 'pill bad' }, relDay(t.due)) : null,
              h('span', { class: 'dot', style: { background: w.color } }), w.name)),
        );
      }), due.length > 8 ? h('div', { class: 'empty' }, `… und ${due.length - 8} weitere`) : null)
      : h('div', { class: 'empty' }, 'Alles erledigt. Füße hoch! 🛋️'),
  );
}

function shoppingCard(store) {
  const items = store.list('shopping').filter((i) => !i.done && (i.list || 'main') === 'main');
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('span', { class: 'emoji' }, '🛒'), h('h2', null, 'Einkaufsliste'),
      h('a', { class: 'more', href: '#/einkauf' }, 'Öffnen')),
    items.length
      ? [
        h('div', { class: 'stat' }, h('span', { class: 'big' }, items.length), h('span', { class: 'label' }, items.length === 1 ? 'Sache fehlt' : 'Sachen fehlen')),
        h('div', { class: 'suggest mt' }, items.slice(0, 10).map((i) => h('span', { class: 'chip' }, h('span', null, categoryInfo(i.category).emoji), i.qty ? `${i.qty} ${i.text}` : i.text))),
      ]
      : h('div', { class: 'empty' }, 'Kühlschrank ist voll – nichts zu kaufen. 🧺'),
  );
}

function mealCard(store) {
  const t = today();
  const meal = store.list('meals').find((m) => m.date === t);
  const tomorrow = store.list('meals').find((m) => m.date === addDays(t, 1));
  const cook = meal?.cook ? whoInfo(store, meal.cook) : null;
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('span', { class: 'emoji' }, '🍝'), h('h2', null, 'Heute gibt’s'),
      h('a', { class: 'more', href: '#/essen' }, 'Plan')),
    meal
      ? [h('div', { class: 'meal-today' }, meal.title), cook ? h('div', { class: 'muted small' }, `${cook.emoji} kocht: ${cook.name}`) : null]
      : h('div', { class: 'empty' }, 'Noch nichts geplant. Pizza? 🍕'),
    tomorrow ? h('div', { class: 'muted small mt' }, `Morgen: ${tomorrow.title}`) : null,
  );
}

function moneyCard(store) {
  const [a, b] = store.members;
  const net = balance(store);
  let text = 'Alles ausgeglichen 🎉';
  if (a && b && Math.abs(net) >= 1) text = net > 0 ? `${b.name} schuldet ${a.name}` : `${a.name} schuldet ${b.name}`;
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('span', { class: 'emoji' }, '💶'), h('h2', null, 'Haushaltskasse'),
      h('a', { class: 'more', href: '#/kasse' }, 'Details')),
    Math.abs(net) >= 1
      ? h('div', null, h('div', { class: 'muted small' }, text), h('div', { class: 'stat' }, h('span', { class: 'big' }, fmtMoney(Math.abs(net)))))
      : h('div', { class: 'empty' }, text),
  );
}

function scoreCard(store) {
  const score = choreScore(store, 7);
  const max = Math.max(1, ...Object.values(score));
  const total = Object.values(score).reduce((s, v) => s + v, 0);
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('span', { class: 'emoji' }, '🏆'), h('h2', null, 'Erledigt in 7 Tagen')),
    total
      ? store.members.map((m) => h('div', { class: 'score-row' },
        h('span', { class: 'name' }, `${m.emoji} ${m.name}`),
        h('span', { class: 'track' }, h('span', { class: 'fill', style: { width: `${(score[m.id] / max) * 100}%`, background: m.color, display: 'block' } })),
        h('span', { class: 'val' }, score[m.id])))
      : h('div', { class: 'empty' }, 'Noch nichts abgehakt diese Woche.'),
  );
}

function birthdaysCard(store) {
  const t = today();
  const list = [...store.members, ...store.list('pets')]
    .map((x) => ({ x, nb: nextBirthday(x.birthday, t) }))
    .filter((e) => e.nb && e.nb.date <= addDays(t, 30))
    .sort((a, b) => a.nb.date.localeCompare(b.nb.date));
  if (!list.length) return null;
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('span', { class: 'emoji' }, '🎂'), h('h2', null, 'Bald Geburtstag')),
    h('div', { class: 'list' }, list.map(({ x, nb }) => h('div', { class: 'row' },
      h('span', { class: 'avatar md', style: { background: x.color } }, x.emoji),
      h('div', { class: 'grow' }, h('div', { class: 'title' }, `${x.name} wird ${nb.turns}`), h('div', { class: 'meta' }, `${relDay(nb.date)} · ${fmtDate(nb.date)}`))))),
  );
}

function pinnedNotes(store) {
  const pinned = store.list('notes').filter((n) => n.pinned).slice(0, 3);
  if (!pinned.length) return null;
  return h('div', { class: 'card span-2' },
    h('div', { class: 'card-head' }, h('span', { class: 'emoji' }, '📌'), h('h2', null, 'Angepinnt'), h('a', { class: 'more', href: '#/pinnwand' }, 'Pinnwand')),
    h('div', { class: 'notes' }, pinned.map((n) => h('a', { class: `note ${n.color || 'yellow'}`, href: '#/pinnwand', style: { textDecoration: 'none', color: 'inherit' } },
      n.title ? h('h3', null, n.title) : null, h('p', null, n.body.length > 220 ? `${n.body.slice(0, 220)}…` : n.body)))),
  );
}

export function render(ctx) {
  const { store } = ctx;
  const me = store.me;
  return h('div', null,
    h('div', { class: 'greeting' },
      h('div', { class: 'date' }, fmtLong(today())),
      h('h1', null, `${greeting()}, ${me?.name || 'ihr zwei'}! ${me?.emoji || ''}`),
    ),
    h('div', { class: 'grid two' },
      store.list('pets').length ? feedingCard(store) : null,
      tasksCard(store),
      eventsCard(store, ctx),
      shoppingCard(store),
      mealCard(store),
      birthdaysCard(store),
      moneyCard(store),
      scoreCard(store),
      pinnedNotes(store),
    ),
  );
}
