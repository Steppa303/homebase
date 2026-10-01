import { h, today, fmtMoney } from '../ui.js';
import { balance, taskBucket } from '../domain.js';

export function render({ store }) {
  const pets = store.list('pets');
  const meal = store.list('meals').find((m) => m.date === today());
  const net = Math.abs(balance(store));
  const petTasks = store.list('tasks').filter((t) => t.pet && ['overdue', 'today'].includes(taskBucket(t))).length;
  const tiles = [
    { href: '#/katzen', emoji: pets[0]?.emoji || '🐈', t: pets.length === 2 ? `${pets[0].name} & ${pets[1].name}` : 'Katzen', s: petTasks ? `${petTasks} Pflege-Aufgabe(n) fällig` : 'Steckbrief, Gewicht, Tierarzt' },
    { href: '#/essen', emoji: '🍝', t: 'Essensplan', s: meal ? `Heute: ${meal.title}` : 'Woche planen, Zutaten einkaufen' },
    { href: '#/kasse', emoji: '💶', t: 'Haushaltskasse', s: net >= 1 ? `Offen: ${fmtMoney(net)}` : 'Alles ausgeglichen' },
    { href: '#/pinnwand', emoji: '📌', t: 'Pinnwand', s: `${store.list('notes').length} Notiz(en)` },
    { href: '#/einstellungen', emoji: '⚙️', t: 'Einstellungen', s: 'Namen, Kalender-Abo, Backup' },
  ];
  return h('div', null,
    h('div', { class: 'page-head' }, h('h1', null, 'Mehr')),
    h('div', { class: 'tiles' }, tiles.map((x) => h('a', { class: 'tile', href: x.href },
      h('span', { class: 'emoji' }, x.emoji), h('span', { class: 't' }, x.t), h('span', { class: 's' }, x.s)))),
  );
}
