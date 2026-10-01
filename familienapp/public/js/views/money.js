import { h, icon, uid, today, fmtDate, fmtMoney, parseMoney, openModal, field, optionGroup, toast, emptyState } from '../ui.js';
import { balance, EXPENSE_CATEGORIES } from '../domain.js';

function editExpense(store, expense = null) {
  const [a] = store.members;
  const e = { title: '', amount: 0, paidBy: store.meId || a?.id, split: 'half', category: 'Lebensmittel', date: today(), ...(expense || {}) };
  const title = h('input', { class: 'input', value: e.title, placeholder: 'z. B. Wocheneinkauf, Katzenfutter-Abo', maxlength: 120, required: true });
  const amount = h('input', { class: 'input', value: e.amount ? (e.amount / 100).toFixed(2).replace('.', ',') : '', placeholder: '0,00', inputmode: 'decimal', required: true });
  const date = h('input', { class: 'input', type: 'date', value: e.date });
  const paidBy = optionGroup(store.members.map((m) => ({ value: m.id, label: `${m.emoji} ${m.name}`, dot: m.color })), e.paidBy, () => renderSplit());
  const splitWrap = h('div');
  let split = null;
  const renderSplit = () => {
    const other = store.members.find((m) => m.id !== paidBy.value);
    split = optionGroup([
      { value: 'half', label: '½ Geteilt' },
      { value: 'other', label: `Komplett für ${other?.name || 'die andere Person'}` },
    ], split?.value || e.split);
    splitWrap.replaceChildren(split.el);
  };
  renderSplit();
  const category = optionGroup(EXPENSE_CATEGORIES.map((c) => ({ value: c.name, label: `${c.emoji} ${c.name}` })), e.category);
  const err = h('div', { class: 'error' });
  const save = () => {
    const cents = parseMoney(amount.value);
    if (!title.value.trim()) { title.focus(); return; }
    if (!(cents > 0)) { err.textContent = 'Bitte einen Betrag eingeben.'; amount.focus(); return; }
    store.put('expenses', {
      ...(expense || {}), id: expense?.id || uid(), title: title.value.trim(), amount: cents, paidBy: paidBy.value,
      split: split.value, category: category.value, date: date.value || today(), by: expense?.by || store.meId,
    });
    m.close();
    toast(expense ? 'Gespeichert' : `${fmtMoney(cents)} eingetragen`);
  };
  const m = openModal({
    title: expense ? 'Ausgabe bearbeiten' : 'Neue Ausgabe',
    body: h('form', { onsubmit: (ev) => { ev.preventDefault(); save(); } },
      field('Wofür?', title),
      h('div', { class: 'field-row' }, field('Betrag (€)', amount), field('Datum', date)),
      field('Bezahlt von', paidBy.el),
      field('Aufteilung', splitWrap),
      field('Kategorie', category.el),
      err,
      h('button', { type: 'submit', hidden: true }),
    ),
    footer: [
      expense ? h('button', { class: 'btn danger', type: 'button', onclick: () => { store.remove('expenses', expense.id); m.close(); toast('Gelöscht', { undo: () => store.put('expenses', expense) }); } }, icon('trash')) : null,
      h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Speichern'),
    ],
  });
}

function settleUp(store) {
  const [a, b] = store.members;
  const net = balance(store);
  if (Math.abs(net) < 1) return;
  const debtor = net > 0 ? b : a;
  const creditor = net > 0 ? a : b;
  const item = store.put('expenses', {
    id: uid(), title: `Ausgleich an ${creditor.name}`, amount: Math.abs(net), paidBy: debtor.id, split: 'other',
    category: 'Ausgleich', settle: true, date: today(), by: store.meId,
  });
  toast(`Ausgeglichen: ${debtor.name} → ${creditor.name} ${fmtMoney(Math.abs(net))}`, { undo: () => store.remove('expenses', item.id) });
}

export function render(ctx) {
  const { store } = ctx;
  const [a, b] = store.members;
  if (!a || !b) return emptyState('💶', 'Für die Kasse braucht es zwei Personen in den Einstellungen.');
  const net = balance(store);
  const expenses = store.list('expenses').slice().sort((x, y) => y.date.localeCompare(x.date) || (y.createdAt || '').localeCompare(x.createdAt || ''));
  const month = today().slice(0, 7);
  const thisMonth = expenses.filter((e) => e.date.startsWith(month) && !e.settle);
  const total = thisMonth.reduce((s, e) => s + e.amount, 0);
  const byCat = EXPENSE_CATEGORIES.map((c) => ({ ...c, sum: thisMonth.filter((e) => e.category === c.name).reduce((s, e) => s + e.amount, 0) }))
    .filter((c) => c.sum > 0).sort((x, y) => y.sum - x.sum);
  const maxCat = Math.max(1, ...byCat.map((c) => c.sum));

  const groups = new Map();
  for (const e of expenses.slice(0, 120)) {
    const key = e.date.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  const settled = Math.abs(net) < 1;
  const debtor = net > 0 ? b : a;
  const creditor = net > 0 ? a : b;

  return h('div', null,
    h('a', { class: 'back-link', href: '#/mehr' }, icon('left'), 'Mehr'),
    h('div', { class: 'page-head' },
      h('h1', null, 'Haushaltskasse'),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => editExpense(store) }, icon('plus'), 'Ausgabe')),
    ),
    h('div', { class: 'grid two' },
      h('div', { class: 'card balance-hero' },
        settled
          ? [h('div', { class: 'who' }, 'Kontostand'), h('div', { class: 'amount' }, '± 0 €'), h('div', { class: 'muted' }, 'Alles ausgeglichen 🎉')]
          : [
            h('div', { class: 'who' }, `${debtor.emoji} ${debtor.name} schuldet ${creditor.emoji} ${creditor.name}`),
            h('div', { class: 'amount' }, fmtMoney(Math.abs(net))),
            h('button', { class: 'btn', type: 'button', onclick: () => settleUp(store) }, '🤝 Ausgleichen'),
          ],
      ),
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', null, `${fmtDate(`${month}-01`, { month: 'long' })}: ${fmtMoney(total)}`)),
        byCat.length
          ? h('div', { class: 'bars', role: 'table', 'aria-label': 'Ausgaben nach Kategorie in diesem Monat' }, byCat.map((c) => h('div', { class: 'bar-row', role: 'row', title: `${c.name}: ${fmtMoney(c.sum)}` },
            h('span', { role: 'cell' }, `${c.emoji} ${c.name}`),
            h('span', { class: 'track', role: 'presentation' }, h('span', { class: 'fill', style: { width: `${(c.sum / maxCat) * 100}%`, display: 'block' } })),
            h('span', { class: 'v', role: 'cell' }, fmtMoney(c.sum)))))
          : h('div', { class: 'empty' }, 'Diesen Monat noch keine gemeinsamen Ausgaben.'),
      ),
    ),
    expenses.length ? [...groups.entries()].map(([key, list]) => [
      h('div', { class: 'section-title' }, fmtDate(`${key}-01`, { month: 'long', year: 'numeric' })),
      h('div', { class: 'list' }, list.map((e) => {
        const payer = store.member(e.paidBy);
        const cat = EXPENSE_CATEGORIES.find((c) => c.name === e.category);
        return h('div', { class: 'row clickable', onclick: () => editExpense(store, e) },
          h('span', { style: { fontSize: '20px', width: '26px', textAlign: 'center' } }, e.settle ? '🤝' : cat?.emoji || '📦'),
          h('div', { class: 'grow' },
            h('div', { class: 'title' }, e.title),
            h('div', { class: 'meta' }, `${fmtDate(e.date, { day: 'numeric', month: 'short' })} · ${payer?.emoji || ''} ${payer?.name || '?'} hat bezahlt`,
              e.split === 'other' && !e.settle ? h('span', { class: 'pill' }, 'für die andere Person') : null)),
          h('span', { class: 'amount-cell' }, fmtMoney(e.amount)),
        );
      })),
    ]) : emptyState('🧾', 'Tragt gemeinsame Ausgaben ein – das Nest rechnet aus, wer wem was schuldet.'),
  );
}
