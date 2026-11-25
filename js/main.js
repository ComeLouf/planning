// Point d'entrée : coquille de l'app (menu, barre du haut, onglets), navigation, raccourcis.
import { S, load, commit, undo, occByKey, persist } from './store.js';
import { esc, todayKey, weekStart, addDays, parseD, pad, ICON, fmtDate, dkey } from './util.js';
import { renderCalendar, periodLabel, shift, initCalendarInteractions } from './calendar.js';
import { renderToday, renderTasks, renderGoals, renderBilan, renderSettings, wirePages } from './pages.js';
import { openTaskEditor, openGoalEditor, openHabitEditor, newEventAt } from './editors.js';
import { organizeWeek } from './planner.js';
import { toast, closeTopModal, hasModal, openModal } from './ui.js';
import { SY, initSync, schedulePush, onSyncChange, syncNow, cfg as syncCfg } from './sync.js';
import { DOW1 } from './util.js';

load();
S.ui.date = todayKey();
S.ui.view = S.data.settings.view || 'week';
if (innerWidth <= 820 && S.ui.view === 'week' && !localStorage.getItem('mon-planning-view-set')) S.ui.view = 'week';
const PAGES = [
  ['today', "Aujourd'hui", ICON.today], ['calendar', 'Calendrier', ICON.cal], ['tasks', 'Tâches', ICON.tasks],
  ['goals', 'Objectifs', ICON.goal], ['bilan', 'Bilan', ICON.chart], ['settings', 'Réglages', ICON.settings],
];
S.ui.page = (location.hash || '').slice(1) && PAGES.some(p => p[0] === location.hash.slice(1)) ? location.hash.slice(1) : 'calendar';

const $ = id => document.getElementById(id);
const view = $('view');

// installation de l'appli (PWA)
let installEvt = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /android/i.test(navigator.userAgent);
const INSTALL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>';
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; renderSidebar(); });
addEventListener('appinstalled', () => { installEvt = null; toast('Mon Planning est installée.'); renderSidebar(); });
async function install() {
  if (installEvt) {
    const evt = installEvt; installEvt = null; evt.prompt();
    const r = await evt.userChoice.catch(() => null);
    if (r && r.outcome !== 'accepted') installEvt = evt;
    renderSidebar(); return;
  }
  const steps = isIOS
    ? ['Ouvre cette page dans <b>Safari</b> (Chrome ne peut pas installer d’appli sur iPhone).', 'Touche le bouton <b>Partager</b> (le carré avec une flèche vers le haut).', 'Choisis <b>Sur l’écran d’accueil</b>, puis <b>Ajouter</b>.']
    : isAndroid
      ? ['Touche le menu <b>⋮</b> en haut à droite de Chrome.', 'Choisis <b>Ajouter à l’écran d’accueil</b> (ou <b>Installer l’application</b>).', 'Confirme avec <b>Installer</b>.']
      : ['Dans la barre d’adresse de Chrome ou Edge, clique sur l’icône <b>écran avec une flèche</b> tout à droite.', 'Si elle n’apparaît pas : menu <b>⋮</b> › <b>Caster, enregistrer et partager</b> › <b>Installer la page en tant qu’application…</b>', 'Si rien de tout ça n’apparaît, recharge la page (Ctrl+F5) puis réessaie.'];
  openModal({ title: 'Installer Mon Planning', body: `<ol style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:8px;line-height:1.45">${steps.map(s => `<li>${s}</li>`).join('')}</ol>
    <p class="small muted" style="margin:0">Une fois installée, l’appli s’ouvre en plein écran depuis l’écran d’accueil et marche sans réseau.</p>`, foot: '<span class="sp"></span><button class="btn primary" data-close>Compris</button>' });
}

function applyTheme() {
  const set = S.data.settings, root = document.documentElement;
  const dark = set.theme === 'dark' || (set.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches) || set.style === 'glass-dark';
  if (dark) root.dataset.theme = 'dark'; else delete root.dataset.theme;
  if (set.style && set.style !== 'plain') root.dataset.style = set.style; else delete root.dataset.style;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#16171a' : '#ffffff');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { applyTheme(); });

function renderSidebar() {
  const d = parseD(S.ui.date), first = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`, start = weekStart(first), today = todayKey();
  const ws = weekStart(S.ui.date), we = addDays(ws, 6);
  const mini = Array.from({ length: 42 }, (_, i) => { const k = addDays(start, i), D = parseD(k);
    return `<button data-mini="${k}" class="${D.getMonth() !== d.getMonth() ? 'out' : ''} ${k === today ? 'today' : ''} ${S.ui.view === 'week' && k >= ws && k <= we && k !== today ? 'inweek' : ''}">${D.getDate()}</button>`; }).join('');
  const sync = syncCfg() ? (SY.status === 'err' ? ['err', 'Synchro : erreur — toucher pour réessayer'] : SY.status === 'syncing' ? ['syncing', 'Synchronisation…'] : ['', SY.last ? `Synchronisé à ${new Date(SY.last).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : 'Synchronisé'])
    : [S.saveError ? 'err' : 'off', S.saveError ? 'Sauvegarde impossible (stockage plein ?)' : 'Enregistré sur cet appareil'];
  $('sidebar').innerHTML = `<div class="brand"><img src="icons/icon-192.png" alt="">Mon Planning</div>
    <nav class="nav">${PAGES.map(([k, l, ic]) => `<button class="${S.ui.page === k ? 'active' : ''}" data-page="${k}">${ic}<span>${l}</span></button>`).join('')}</nav>
    <div class="side-section mini"><div class="mini-head"><button class="btn icon sm ghost" data-minishift="-1" aria-label="Mois précédent">${ICON.left}</button><span>${['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][d.getMonth()]} ${d.getFullYear()}</span><button class="btn icon sm ghost" data-minishift="1" aria-label="Mois suivant">${ICON.right}</button></div>
      <div class="mini-grid">${DOW1.map(x => `<span class="h">${x}</span>`).join('')}${mini}</div></div>
    <div class="side-section"><h4>Catégories</h4><div class="cat-filter">${S.data.categories.map(c => `<label style="--c:${c.color}"><input type="checkbox" data-filter="${c.id}" ${S.ui.filter[c.id] !== false ? 'checked' : ''}><span class="sw"></span><span>${esc(c.name)}</span></label>`).join('')}</div></div>
    ${isStandalone() ? '' : `<button class="btn ${installEvt ? 'primary' : ''}" data-install style="margin:0 4px">${INSTALL_ICON} Installer l’appli</button>`}
    <button class="save-status ${sync[0]}" data-syncnow><span class="dot"></span>${esc(sync[1])}</button>`;
}

function renderTopbar() {
  const p = S.ui.page;
  const menu = `<button class="btn icon ghost menu-btn" data-act="menu" aria-label="Menu">${ICON.menu}</button>`;
  if (p !== 'calendar') { $('topbar').innerHTML = `${menu}<div class="title">${PAGES.find(x => x[0] === p)[1]}</div>`; return; }
  const v = S.ui.view;
  $('topbar').innerHTML = `${menu}<div class="title">${esc(periodLabel())}</div>
    <div class="cal-tools"><button class="btn icon" data-act="prev" aria-label="Précédent">${ICON.left}</button><button class="btn sm hide-m" data-act="today">Aujourd'hui</button><button class="btn icon" data-act="next" aria-label="Suivant">${ICON.right}</button>
      <div class="seg">${(innerWidth <= 480 ? [['day', 'J'], ['3day', '3j'], ['week', 'S'], ['month', 'M'], ['list', 'L']] : [['day', 'Jour'], ['3day', '3 j'], ['week', 'Sem.'], ['month', 'Mois'], ['list', 'Liste']]).map(([k, l]) => `<button class="${v === k ? 'active' : ''}" data-view="${k}" title="${{ day: 'Jour', '3day': '3 jours', week: 'Semaine', month: 'Mois', list: 'Liste' }[k]}">${l}</button>`).join('')}</div>
      <button class="btn icon" data-act="organize" title="Organiser la semaine" aria-label="Organiser la semaine">${ICON.spark}</button>
      <button class="btn primary hide-m" data-act="new">${ICON.plus} Nouveau</button></div>`;
}

function renderTabbar() {
  const tabs = PAGES.filter(p => p[0] !== 'settings');
  $('tabbar').innerHTML = tabs.map(([k, l, ic]) => `<button class="${S.ui.page === k ? 'active' : ''}" data-page="${k}">${ic}<span>${l}</span></button>`).join('');
  $('fab').innerHTML = ICON.plus;
}

let raf = 0;
export function render() {
  cancelAnimationFrame(raf);
  applyTheme(); renderSidebar(); renderTopbar(); renderTabbar();
  const p = S.ui.page;
  ({ today: renderToday, calendar: renderCalendar, tasks: renderTasks, goals: renderGoals, bilan: renderBilan, settings: renderSettings })[p](view);
}
const rerender = () => { raf = requestAnimationFrame(render); };
S.hooks.changed.push(rerender);
S.hooks.saved.push(schedulePush);
onSyncChange(() => renderSidebar());
document.addEventListener('rerender', rerender);
document.addEventListener('organize', () => doOrganize(weekStart(S.ui.page === 'calendar' ? S.ui.date : todayKey())));

function go(page) {
  S.ui.page = page; history.replaceState(null, '', '#' + page);
  $('sidebar').classList.remove('open'); document.querySelector('.scrim')?.remove();
  view.scrollTop = 0; render();
}
function doOrganize(ws) {
  if (addDays(ws, 7) <= todayKey()) { toast('Cette semaine est passée : choisis une semaine en cours ou à venir.'); return; }
  let r; commit(() => { r = organizeWeek(ws); });
  toast(`${r.created} créneau${r.created > 1 ? 'x' : ''} placé${r.created > 1 ? 's' : ''}${r.missing.length ? ` · pas de place pour : ${[...new Set(r.missing)].slice(0, 3).join(', ')}${r.missing.length > 3 ? '…' : ''}` : ''}.`, { undo: true });
}
function newEvent() {
  const d = S.ui.page === 'calendar' && S.ui.view !== 'month' && S.ui.view !== 'list' ? S.ui.date : todayKey();
  const now = new Date(); const m = d === todayKey() ? Math.min(22 * 60, (now.getHours() + 1) * 60) : 18 * 60;
  newEventAt(S.ui.view === 'week' && S.ui.page === 'calendar' ? (d >= weekStart(S.ui.date) ? d : weekStart(S.ui.date)) : d, m, 60);
}

document.addEventListener('click', e => {
  const t = e.target;
  const pg = t.closest('[data-page]'); if (pg) { go(pg.dataset.page); return; }
  const v = t.closest('[data-view]'); if (v) { S.ui.view = v.dataset.view; S.ui.dayGrid = false; commit(() => { S.data.settings.view = v.dataset.view; }); return; }
  const mi = t.closest('[data-mini]'); if (mi) { S.ui.date = mi.dataset.mini; if (S.ui.page !== 'calendar') S.ui.page = 'calendar'; $('sidebar').classList.remove('open'); document.querySelector('.scrim')?.remove(); render(); return; }
  const ms = t.closest('[data-minishift]'); if (ms) { const D = parseD(S.ui.date); D.setMonth(D.getMonth() + +ms.dataset.minishift, 1); S.ui.date = dkey(D); render(); return; }
  if (t.closest('[data-install]')) { $('sidebar').classList.remove('open'); document.querySelector('.scrim')?.remove(); install(); return; }
  if (t.closest('[data-syncnow]')) { if (syncCfg()) syncNow(); else go('settings'); return; }
  if (t.closest('.scrim')) { $('sidebar').classList.remove('open'); t.closest('.scrim').remove(); return; }
  if (t.closest('#fab')) { S.ui.page === 'tasks' ? openTaskEditor() : S.ui.page === 'goals' ? openGoalEditor() : newEvent(); return; }
  const a = t.closest('[data-act]');
  if (a) {
    const k = a.dataset.act;
    if (k === 'menu') { $('sidebar').classList.add('open'); const s = document.createElement('div'); s.className = 'scrim'; document.body.appendChild(s); }
    else if (k === 'prev' || k === 'next') { shift(k === 'prev' ? -1 : 1); render(); }
    else if (k === 'today') { S.ui.date = todayKey(); render(); }
    else if (k === 'organize') doOrganize(weekStart(S.ui.date));
    else if (k === 'new') newEvent();
    return;
  }
  const g = t.closest('[data-go]');
  if (g) {
    const k = g.dataset.go;
    if (k === 'organize') doOrganize(weekStart(todayKey()));
    else if (k === 'organize-bilan') doOrganize(S.ui.bilanWeek || weekStart(todayKey()));
    else if (k === 'new-event') newEvent();
    else if (k === 'new-task') openTaskEditor();
    else if (k === 'new-goal') openGoalEditor();
    else if (k === 'new-habit') openHabitEditor();
    else if (k === 'calendar') { S.ui.view = 'week'; go('calendar'); }
    else if (k === 'import') go('settings');
    else go(k);
  }
});
document.addEventListener('change', e => { const f = e.target.closest('[data-filter]'); if (f) { S.ui.filter[f.dataset.filter] = f.checked; render(); } });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!closeTopModal()) { $('sidebar').classList.remove('open'); document.querySelector('.scrim')?.remove(); } return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.target.closest('input,textarea')) { e.preventDefault(); if (undo()) toast('Action annulée.'); return; }
  if (hasModal() || e.target.closest('input,textarea,select') || S.ui.page !== 'calendar') return;
  if (e.key === 'ArrowLeft') { shift(-1); render(); } else if (e.key === 'ArrowRight') { shift(1); render(); } else if (e.key === 't') { S.ui.date = todayKey(); render(); }
});
let rz = 0; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(render, 120); });
setInterval(() => { if (!hasModal() && !document.hidden && (S.ui.page === 'calendar' || S.ui.page === 'today')) render(); }, 60000);

initCalendarInteractions(view, render);
wirePages(view, { occByKey, render });
render();
requestAnimationFrame(render);           // 2e passage une fois la mise en page stabilisée (hauteur de la grille)
addEventListener('load', () => render());
initSync();
// sur téléphone, propose une fois l'installation (le bouton reste aussi dans le menu ☰)
try {
  if (!isStandalone() && innerWidth <= 820 && !localStorage.getItem('mon-planning-install-hint')) {
    localStorage.setItem('mon-planning-install-hint', '1');
    setTimeout(() => toast('Installe l’appli sur ton écran d’accueil.', { action: { label: 'Installer', fn: install } }), 1500);
  }
} catch (e) {}
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
