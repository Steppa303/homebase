import { h, icon, field, optionGroup, toast, confirmDialog } from '../ui.js';
import { api } from '../store.js';
import { applyTheme, logout } from '../app.js';

let icsToken = null;
let icsLoading = false;

function loadIcsToken(ctx) {
  if (icsToken || icsLoading) return;
  icsLoading = true;
  api('GET', '/api/ics-token').then((r) => { icsToken = r.token; ctx.rerender(); }).catch(() => {}).finally(() => { icsLoading = false; });
}

function section(title, ...children) {
  return h('div', { class: 'card settings-section' }, h('h2', null, title), ...children);
}

function householdSection(store) {
  const s = store.settings;
  const name = h('input', { class: 'input', value: s.householdName || '', maxlength: 60, 'data-keep': 'set-house' });
  const rows = store.members.map((m) => ({
    m,
    emoji: h('input', { class: 'input', value: m.emoji, maxlength: 8, 'aria-label': 'Emoji', 'data-keep': `set-${m.id}-emoji` }),
    name: h('input', { class: 'input', value: m.name, maxlength: 40, 'aria-label': 'Name', 'data-keep': `set-${m.id}-name` }),
    color: h('input', { class: 'input', type: 'color', value: m.color, 'aria-label': 'Farbe', 'data-keep': `set-${m.id}-color` }),
    birthday: h('input', { class: 'input', type: 'date', value: m.birthday || '', 'aria-label': 'Geburtstag', 'data-keep': `set-${m.id}-bday` }),
  }));
  const slots = h('input', { class: 'input', value: (s.feedSlots || ['Morgens', 'Abends']).join(', '), placeholder: 'Morgens, Abends', 'data-keep': 'set-slots' });
  return section('🏡 Haushalt',
    field('Name eures Nests', name),
    rows.map((r) => h('div', null,
      h('div', { class: 'member-edit' }, field('Emoji', r.emoji), field('Name', r.name), field('Farbe', r.color)),
      field(`Geburtstag von ${r.m.name}`, r.birthday),
    )),
    field('Fütterungszeiten der Katzen', slots, 'Mit Komma trennen, z. B. „Morgens, Mittags, Abends“.'),
    h('button', { class: 'btn primary', type: 'button', onclick: () => {
      store.patchSettings({
        householdName: name.value.trim() || 'Unser Nest',
        members: rows.map((r) => ({ ...r.m, emoji: r.emoji.value.trim() || r.m.emoji, name: r.name.value.trim() || r.m.name, color: r.color.value, birthday: r.birthday.value })),
        feedSlots: slots.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 6),
      });
      toast('Gespeichert');
    } }, 'Speichern'),
  );
}

function meSection(ctx) {
  const { store } = ctx;
  const who = optionGroup(store.members.map((m) => ({ value: m.id, label: `${m.emoji} ${m.name}`, dot: m.color })), store.meId, (v) => { store.setMe(v); toast('Gerät umgestellt'); });
  let theme = 'auto';
  try { theme = localStorage.getItem('nest.theme') || 'auto'; } catch { /* egal */ }
  const themes = optionGroup([
    { value: 'auto', label: '🌗 Automatisch' },
    { value: 'light', label: '☀️ Hell' },
    { value: 'dark', label: '🌙 Dunkel' },
  ], theme, (v) => {
    try { localStorage.setItem('nest.theme', v); } catch { /* egal */ }
    applyTheme();
  });
  return section('📱 Dieses Gerät',
    field('Wer benutzt dieses Gerät?', who.el),
    field('Darstellung', themes.el),
    h('p', { class: 'small muted' }, 'Tipp: Im Browser-Menü „Zum Home-Bildschirm hinzufügen“ wählen – dann startet das Nest wie eine echte App.'),
  );
}

function calendarSection(ctx) {
  loadIcsToken(ctx);
  const url = icsToken ? `${location.origin}/cal/${icsToken}.ics` : '';
  const webcal = url.replace(/^https?:/, 'webcal:');
  return section('📆 Kalender-Abo',
    h('p', { class: 'small muted' }, 'Abonniert euren gemeinsamen Kalender im iPhone-/Google-/Outlook-Kalender. Termine und Geburtstage erscheinen dann dort automatisch (nur lesend).'),
    url ? [
      h('div', { class: 'code-box' }, h('span', null, url),
        h('button', { class: 'icon-btn plain', type: 'button', 'aria-label': 'Link kopieren', onclick: async () => {
          try { await navigator.clipboard.writeText(url); toast('Link kopiert'); } catch { toast('Kopieren nicht möglich – bitte markieren'); }
        } }, icon('copy'))),
      h('div', { class: 'row-gap mt' },
        h('a', { class: 'btn small', href: webcal }, '📲 Auf diesem Gerät abonnieren'),
        h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
          if (!(await confirmDialog('Neuen Link erzeugen? Der alte funktioniert dann nicht mehr und muss überall ersetzt werden.', { ok: 'Neu erzeugen' }))) return;
          const r = await api('POST', '/api/ics-token', {});
          icsToken = r.token;
          ctx.rerender();
        } }, 'Link erneuern')),
      h('p', { class: 'small muted' }, 'Wer den Link kennt, kann eure Termine lesen – also nur mit euch beiden teilen.'),
    ] : h('div', { class: 'empty' }, 'Lade …'),
  );
}

function passwordSection() {
  const oldPw = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', 'data-keep': 'set-oldpw' });
  const newPw = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', minlength: 4, 'data-keep': 'set-newpw' });
  const err = h('div', { class: 'error' });
  return section('🔑 Passwort',
    h('div', { class: 'field-row' }, field('Aktuelles Passwort', oldPw), field('Neues Passwort', newPw)),
    err,
    h('button', { class: 'btn', type: 'button', onclick: async () => {
      err.textContent = '';
      try {
        await api('POST', '/api/password', { oldPassword: oldPw.value, newPassword: newPw.value });
        oldPw.value = '';
        newPw.value = '';
        toast('Passwort geändert – andere Geräte müssen sich neu anmelden');
      } catch (e) { err.textContent = e.message; }
    } }, 'Passwort ändern'),
  );
}

function dataSection(ctx) {
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!(await confirmDialog('Sicherung einspielen? Alle aktuellen Daten werden ersetzt (der Server legt vorher eine Kopie an).', { ok: 'Einspielen' }))) return;
      await api('POST', '/api/import', data);
      await ctx.store.load();
      toast('Sicherung eingespielt');
    } catch (e) {
      toast(`Import fehlgeschlagen: ${e.message}`);
    } finally {
      file.value = '';
    }
  } });
  return section('💾 Daten',
    h('p', { class: 'small muted' }, 'Der Server speichert automatisch jeden Tag eine Sicherung (14 Tage). Zusätzlich könnt ihr hier alles herunterladen.'),
    h('div', { class: 'row-gap' },
      h('a', { class: 'btn small', href: '/api/export', download: '' }, icon('download'), 'Sicherung herunterladen'),
      h('button', { class: 'btn small', type: 'button', onclick: () => file.click() }, icon('upload'), 'Sicherung einspielen'),
      file,
    ),
  );
}

export function render(ctx) {
  return h('div', null,
    h('a', { class: 'back-link', href: '#/mehr' }, icon('left'), 'Mehr'),
    h('div', { class: 'page-head' }, h('h1', null, 'Einstellungen')),
    h('div', { class: 'grid two' },
      h('div', null, meSection(ctx), householdSection(ctx.store)),
      h('div', null, calendarSection(ctx), passwordSection(), dataSection(ctx),
        h('button', { class: 'btn danger block', type: 'button', onclick: () => logout() }, icon('logout'), 'Auf diesem Gerät abmelden')),
    ),
    h('p', { class: 'small muted mt', style: { textAlign: 'center' } }, 'Unser Nest · mit ❤️ für zwei Menschen und zwei Katzen'),
  );
}
