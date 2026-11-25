// Pages : Aujourd'hui, Tâches, Objectifs, Bilan, Réglages.
import { S, commit, put, del, occurrences, kindOf, colorOf, catById, subjById, setSetting, setStatus, nextExam, KEY } from './store.js';
import { esc, uid, addDays, weekStart, diffDays, todayKey, nowDT, timeOf, dateOf, durMin, fmtDate, fmtH, fmtDur, relDays, DOW, ICON, cap, isoWeek, download, absMin, pad } from './util.js';
import { occTitle, isMissed } from './calendar.js';
import { openTaskEditor, openGoalEditor, openHabitEditor, openEventEditor } from './editors.js';
import { analyzeWeek, catTargets, subjectTarget } from './analysis.js';
import { planTask, proposeGoal } from './planner.js';
import { fromICS, fromJSON, importCourses, exportICS } from './ics.js';
import { SY, cfg as syncCfg, connect, disconnect, syncNow, TOKEN_URL } from './sync.js';
import { openModal, toast, armButton } from './ui.js';
import { PRIORITY_LABELS, KINDS, SUBJECT_COLORS } from './seed.js';

const LVL = { bad: '!', warn: '!', info: 'i', ok: '✓' };
const checkItem = it => `<div class="item"><span class="lvl ${it.lvl}">${LVL[it.lvl]}</span><div><div class="t">${esc(it.t)}</div><div class="d">${esc(it.d)}</div></div>${it.act ? `<button class="btn sm a" data-go="${it.act}">${{ organize: '✨ Organiser', goals: 'Voir', settings: 'Compléter', tasks: 'Voir', calendar: 'Voir', import: 'Importer' }[it.act]}</button>` : ''}</div>`;

/* ---------- Aujourd'hui ---------- */
export function renderToday(el) {
  const today = todayKey(), now = nowDT(), ws = weekStart(today);
  const day = occurrences(today, addDays(today, 1)).filter(o => o.date === today && !['marge'].includes(kindOf(o.ev)));
  const next = occurrences(today, addDays(today, 8)).find(o => o.end > now && !['sommeil', 'marge', 'repas'].includes(kindOf(o.ev)) && o.status !== 'skipped');
  const { items, byCat } = analyzeWeek(ws);
  const targets = catTargets(ws);
  const exams = S.data.events.filter(e => kindOf(e) === 'examen' && dateOf(e.start) >= today).sort((a, b) => a.start < b.start ? -1 : 1).slice(0, 6);
  const tasks = S.data.tasks.filter(t => t.status !== 'done').sort((a, b) => (a.due || '9') < (b.due || '9') ? -1 : 1).slice(0, 5);
  const nextCard = next ? (() => {
    const mins = absMin(next.start, today) - absMin(now, today);
    const when = next.start <= now ? 'En cours' : mins < 60 ? `Dans ${mins} min` : next.date === today ? `Aujourd'hui à ${timeOf(next.start)}` : `${cap(fmtDate(next.date))} à ${timeOf(next.start)}`;
    return `<div class="when">${esc(when)}</div><div class="big">${esc(occTitle(next.ev))}</div><div class="muted">${timeOf(next.start)}–${timeOf(next.end)}${next.ev.location ? ' · ' + esc(next.ev.location) : ''}</div>`;
  })() : '<div class="empty">Rien de prévu dans les 7 prochains jours.</div>';
  const tl = day.map(o => `<div class="tl-item ${o.end <= now ? 'past' : ''} ${o.start <= now && o.end > now ? 'now' : ''} ${o.status === 'done' ? 'done' : ''} ${isMissed(o) ? 'missed' : ''}" style="--c:${colorOf(o.ev)}" data-open="${esc(o.key)}">
    <button class="cl-chk sm" data-chk="${esc(o.key)}" aria-label="Fait">${o.status === 'done' ? ICON.check : ''}</button><span class="h">${timeOf(o.start)}</span><span class="b"></span>
    <div><div class="t">${esc(occTitle(o.ev))}</div><div class="s">${timeOf(o.start)}–${timeOf(o.end)}${o.ev.location ? ' · ' + esc(o.ev.location) : ''}</div></div></div>`).join('');
  const cats = S.data.categories.filter(c => (byCat[c.id] || 0) > 0 && !['sommeil', 'marge'].includes(c.kind));
  const total = cats.reduce((a, c) => a + byCat[c.id], 0) || 1;
  el.innerHTML = `<div class="page"><div class="page-head"><div><h1>${cap(fmtDate(today, true))}</h1><p>Semaine ${isoWeek(today)} · ${items[0].lvl === 'ok' ? 'tout est en ordre' : `${items.filter(i => i.lvl !== 'info').length} point${items.filter(i => i.lvl !== 'info').length > 1 ? 's' : ''} à regarder`}</p></div>
    <div class="page-actions"><button class="btn" data-go="organize">${ICON.spark} Organiser la semaine</button><button class="btn primary" data-go="new-event">${ICON.plus} Ajouter</button></div></div>
    <div class="cards">
      <div class="card span-4 next-card"><h2>Prochain</h2>${nextCard}</div>
      <div class="card span-8 day-card"><h2>Aujourd'hui <span class="small muted">${day.filter(o => o.status === 'done').length}/${day.length} fait</span></h2><div class="tl">${tl || '<div class="empty">Journée libre.</div>'}</div></div>
      <div class="card span-6"><h2>Semaine en heures</h2><div class="stack" style="margin-bottom:12px">${cats.map(c => `<i style="--c:${c.color};width:${byCat[c.id] / total * 100}%" title="${esc(c.name)}"></i>`).join('')}</div>
        ${cats.map(c => { const t = targets[c.id]; return `<div class="stat-row t2" style="--c:${c.color}"><span class="lbl"><i></i>${esc(c.name)}</span><span class="val ${t && byCat[c.id] < t ? 'under' : ''}">${fmtH(byCat[c.id])}${t ? ' / ' + fmtH(t) : ''}</span><div class="progress"><i style="width:${t ? Math.min(100, byCat[c.id] / t * 100) : 100}%"></i></div></div>`; }).join('') || '<div class="empty">Aucun créneau cette semaine.</div>'}</div>
      <div class="card span-6"><h2>À regarder <button class="btn sm ghost" data-go="bilan">Bilan complet</button></h2><div class="checks">${items.slice(0, 5).map(checkItem).join('')}</div></div>
      <div class="card span-6"><h2>Examens & CC</h2>${exams.length ? exams.map(e => { const n = diffDays(today, dateOf(e.start)); return `<div class="row" style="--c:${colorOf(e)}" data-open="${esc(e.id)}"><span class="bar"></span><span class="time">${fmtDate(dateOf(e.start))}</span><div class="main"><div class="t">${esc(occTitle(e))}</div><div class="s">${timeOf(e.start)} · ${esc(e.location || '')}</div></div><span class="pill ${n <= 7 ? 'high' : n <= 21 ? 'mid' : 'low'}">${relDays(dateOf(e.start))}</span></div>`; }).join('') : '<div class="empty">Aucun examen à venir. Ils arrivent avec l’import de l’emploi du temps.</div>'}</div>
      <div class="card span-6"><h2>Tâches <button class="btn sm ghost" data-go="tasks">Toutes</button></h2>${tasks.length ? tasks.map(taskRow).join('') : '<div class="empty">Aucune tâche en attente.</div>'}</div>
    </div></div>`;
}

/* ---------- Tâches ---------- */
function taskRow(t) {
  const ev = t.eventId && S.data.events.find(e => e.id === t.eventId);
  const n = t.due ? diffDays(todayKey(), t.due) : null;
  const dueCls = n == null ? '' : n < 0 || n <= 1 ? 'high' : n <= 4 ? 'mid' : 'low';
  const cat = catById(t.cat), subj = t.subject && subjById(t.subject);
  return `<div class="task ${t.status === 'done' ? 'done' : ''}"><button class="chk ${t.status === 'done' ? 'on' : t.status === 'doing' ? 'mid' : ''}" data-tcycle="${t.id}" aria-label="Changer le statut">${t.status === 'done' ? ICON.check : ''}</button>
    <div class="grow" data-tedit="${t.id}"><div class="tt">${esc(t.title)}</div><div class="meta">
      ${t.due ? `<span class="pill ${t.status === 'done' ? '' : dueCls}">${n < 0 ? 'en retard · ' : ''}${fmtDate(t.due)}</span>` : '<span class="pill">sans échéance</span>'}
      ${subj ? `<span class="pill" style="--c:${subj.color}"><i></i>${esc(subj.name)}</span>` : cat ? `<span class="pill" style="--c:${cat.color}"><i></i>${esc(cat.name)}</span>` : ''}
      <span class="pill">${fmtDur(t.dur || 60)}</span>${t.prio === 'high' ? '<span class="pill high">priorité haute</span>' : ''}</div></div>
    ${t.status !== 'done' ? (ev ? `<button class="btn sm ghost" data-open-ev="${ev.id}">${fmtDate(dateOf(ev.start))} ${timeOf(ev.start)}</button>` : `<button class="btn sm" data-tplan="${t.id}">Planifier</button>`) : ''}</div>`;
}
export function renderTasks(el) {
  const f = S.ui.taskFilter || 'open', q = (S.ui.taskQuery || '').toLowerCase();
  const all = S.data.tasks.filter(t => !q || t.title.toLowerCase().includes(q)).sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : 1);
  const groups = [['doing', 'En cours'], ['todo', 'À faire'], ['done', 'Faites']].filter(([s]) => f === 'all' || (f === 'open' ? s !== 'done' : s === 'done'));
  el.innerHTML = `<div class="page" style="max-width:860px"><div class="page-head"><div><h1>Tâches</h1><p>« Planifier » trouve le prochain créneau libre avant l’échéance.</p></div><button class="btn primary" data-go="new-task">${ICON.plus} Nouvelle tâche</button></div>
    <div class="toolbar"><input type="search" id="t-q" placeholder="Rechercher" value="${esc(S.ui.taskQuery || '')}" style="max-width:260px">
      <div class="seg">${[['open', 'En cours'], ['done', 'Faites'], ['all', 'Toutes']].map(([k, l]) => `<button class="${f === k ? 'active' : ''}" data-tfilter="${k}">${l}</button>`).join('')}</div></div>
    ${groups.map(([s, l]) => { const list = all.filter(t => (t.status || 'todo') === s); return list.length ? `<div class="status-group"><h3>${l} · ${list.length}</h3>${list.map(taskRow).join('')}</div>` : ''; }).join('') || '<div class="empty">Aucune tâche. Ajoute un devoir, un rendu ou une démarche avec « Nouvelle tâche ».</div>'}</div>`;
}

/* ---------- Objectifs ---------- */
export function renderGoals(el) {
  const ws = weekStart(todayKey()), occ = occurrences(ws, addDays(ws, 7));
  const cards = S.data.goals.map(g => {
    const subs = g.subtasks || [], done = subs.filter(s => s.done).length, spent = occ.filter(o => o.ev.goalId === g.id).reduce((a, o) => a + durMin(o.start, o.end), 0);
    return `<div class="card goal" style="--c:${g.color || '#12a594'}"><div data-gedit="${g.id}"><div class="gt">${esc(g.title)}</div>${g.desc ? `<div class="gd">${esc(g.desc)}</div>` : ''}</div>
      <div class="gm">${g.deadline ? `<span class="pill ${diffDays(todayKey(), g.deadline) <= 7 ? 'high' : ''}">échéance ${fmtDate(g.deadline)}</span>` : ''}${g.weeklyMin ? `<span class="pill">${fmtH(g.weeklyMin)} / semaine</span>` : ''}</div>
      ${subs.length ? `<div><div class="small muted" style="margin-bottom:4px">${done}/${subs.length} étapes</div><div class="progress"><i style="width:${done / subs.length * 100}%"></i></div></div>
      <div class="sub">${subs.map(s => `<label class="${s.done ? 'done' : ''}"><input type="checkbox" data-gsub="${g.id}:${s.id}" ${s.done ? 'checked' : ''}><span>${esc(s.t)}</span></label>`).join('')}</div>` : ''}
      ${g.weeklyMin ? `<div><div class="small muted" style="margin-bottom:4px">Cette semaine : ${fmtH(spent)} sur ${fmtH(g.weeklyMin)}</div><div class="progress"><i style="width:${Math.min(100, spent / g.weeklyMin * 100)}%"></i></div></div>` : ''}
      <div><button class="btn sm" data-gprop="${g.id}">${ICON.spark} Proposer des créneaux</button></div></div>`;
  }).join('');
  const subjRows = S.data.subjects.filter(s => !s.archived).map(s => { const t = subjectTarget(s, ws); return `<div class="tg-row" style="--c:${s.color}"><i></i><span class="tg-n">${esc(s.name)}</span><span class="small muted">${t.exam ? fmtDate(t.exam) : ''}</span><input type="number" min="0" max="20" step="0.5" value="${(s.weeklyMin ?? S.data.settings.revisionDefault) / 60}" data-subjweek="${s.id}" aria-label="Heures par semaine"><span class="small muted">h</span></div>`; }).join('');
  el.innerHTML = `<div class="page"><div class="page-head"><div><h1>Objectifs</h1><p>Tes projets perso, avec leurs étapes et le temps à y consacrer chaque semaine.</p></div><button class="btn primary" data-go="new-goal">${ICON.plus} Nouvel objectif</button></div>
    <div class="goals">${cards || '<div class="card empty">Aucun objectif. Ajoute un projet perso (permis, code, appli, lecture…) avec le temps que tu veux y passer par semaine.</div>'}</div>
    <div class="card" style="margin-top:14px"><h2>Temps visé par matière (révisions, par semaine)</h2>
      ${subjRows ? `<div class="tg-grid">${subjRows}</div><p class="small muted" style="margin:10px 0 0">Ce temps est augmenté automatiquement quand l’examen approche (×1,25 à 4 semaines, ×1,75 à 2 semaines, ×2,5 la dernière semaine).</p>` : '<div class="empty">Les matières apparaissent avec l’import de ton emploi du temps.</div>'}</div></div>`;
}

/* ---------- Bilan ---------- */
export function renderBilan(el) {
  const ws = S.ui.bilanWeek || weekStart(todayKey());
  const { items, byCat, bySubj } = analyzeWeek(ws), targets = catTargets(ws);
  const rows = S.data.categories.filter(c => (byCat[c.id] || targets[c.id]) && c.kind !== 'marge').map(c => {
    const v = byCat[c.id] || 0, t = targets[c.id];
    let html = `<div class="stat-row t2" style="--c:${c.color}"><span class="lbl"><i></i>${esc(c.name)}</span><span class="val ${t && v < t ? 'under' : ''}">${fmtH(v)}${t ? ' / ' + fmtH(t) : ''}</span><div class="progress"><i style="width:${t ? Math.min(100, v / t * 100) : 100}%"></i></div></div>`;
    if (c.kind === 'revision') html += S.data.subjects.filter(s => !s.archived).map(s => { const m = bySubj[s.id] || 0, tt = subjectTarget(s, ws).target; return `<div class="stat-row t2 sub" style="--c:${s.color}"><span class="lbl"><i></i>${esc(s.name)}</span><span class="val ${m < tt ? 'under' : ''}">${fmtH(m)} / ${fmtH(tt)}</span><div class="progress"><i style="width:${tt ? Math.min(100, m / tt * 100) : 100}%"></i></div></div>`; }).join('');
    return html;
  }).join('');
  el.innerHTML = `<div class="page"><div class="page-head"><div><h1>Bilan</h1><p>Semaine ${isoWeek(ws)} · du ${fmtDate(ws)} au ${fmtDate(addDays(ws, 6))}</p></div>
    <div class="page-actions"><button class="btn icon" data-bweek="-1" aria-label="Semaine précédente">${ICON.left}</button><button class="btn" data-bweek="0">Cette semaine</button><button class="btn icon" data-bweek="1" aria-label="Semaine suivante">${ICON.right}</button><button class="btn primary" data-go="organize-bilan">${ICON.spark} Organiser cette semaine</button></div></div>
    <div class="cards"><div class="card span-7"><h2>Ce qui manque</h2><div class="checks">${items.map(checkItem).join('')}</div></div>
      <div class="card span-5"><h2>Heures de la semaine</h2>${rows || '<div class="empty">Aucun créneau cette semaine.</div>'}</div></div></div>`;
}

/* ---------- Réglages ---------- */
export function renderSettings(el) {
  const set = S.data.settings, sc = syncCfg();
  const hOpt = (sel, a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i).map(h => `<option value="${h}" ${h === sel ? 'selected' : ''}>${pad(h)}h</option>`).join('');
  el.innerHTML = `<div class="page settings"><div class="page-head"><div><h1>Réglages</h1></div></div>
  <div class="set-sec card"><h2>Importer des cours</h2><p>Avec le fichier .ics de ton emploi du temps (sur myDeVinci : l’icône orange en haut à gauche du calendrier), ou avec un bloc « edt-cours » préparé par Claude à partir d’une capture.</p>
    <div class="frow"><label class="field"><span>Fichier .ics</span><input type="file" id="imp-file" accept=".ics,text/calendar"></label>
      <label class="field"><span>À partir du</span><input type="date" id="imp-from" value="${todayKey()}"></label><label class="field"><span>Jusqu’au (facultatif)</span><input type="date" id="imp-until"></label></div>
    <label class="field" style="margin-top:10px"><span>…ou colle le bloc JSON</span><textarea id="imp-json" class="code-in" placeholder='{"format":"edt-cours","events":[…]}'></textarea></label>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px"><label class="check-line"><input type="checkbox" id="imp-replace" checked> Remplacer les cours déjà importés aux mêmes dates</label><label class="check-line"><input type="checkbox" id="imp-retake" ${set.includeRetakes ? 'checked' : ''}> Inclure les rattrapages</label></div>
    <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap"><button class="btn primary" id="imp-go">Importer</button><span id="imp-res"></span></div></div>

  <div class="set-sec card"><h2>Synchronisation PC ↔ téléphone</h2>
    ${sc ? `<p>Connecté. ${SY.status === 'ok' ? 'Dernière synchro à ' + new Date(SY.last).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '.' : esc(SY.msg)}</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="sy-now">${ICON.sync} Synchroniser maintenant</button><button class="btn danger" id="sy-off">Déconnecter cet appareil</button></div>`
    : `<p>Passe par un Gist secret de ton compte GitHub. Crée un code d’accès (case « gist » déjà cochée, expiration « No expiration »), colle-le ici, puis fais pareil sur l’autre appareil avec le même code.</p>
    <p><a href="${TOKEN_URL}" target="_blank" rel="noopener">Créer le code sur GitHub ↗</a></p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><input type="text" id="sy-token" class="code-in" placeholder="ghp_…" autocomplete="off" style="max-width:340px"><button class="btn primary" id="sy-go">Connecter</button></div><div class="err-msg" id="sy-err" style="margin-top:6px"></div>`}</div>

  <div class="set-sec card"><h2>Affichage</h2><div class="set-grid">
    <label class="field"><span>Thème</span><select data-set="theme"><option value="auto" ${set.theme === 'auto' ? 'selected' : ''}>Automatique</option><option value="light" ${set.theme === 'light' ? 'selected' : ''}>Clair</option><option value="dark" ${set.theme === 'dark' ? 'selected' : ''}>Sombre</option></select></label>
    <label class="field"><span>Style</span><select data-set="style"><option value="plain" ${set.style === 'plain' ? 'selected' : ''}>Classique</option><option value="glass-light" ${set.style === 'glass-light' ? 'selected' : ''}>Verre clair</option><option value="glass-dark" ${set.style === 'glass-dark' ? 'selected' : ''}>Verre sombre</option><option value="glass-soft" ${set.style === 'glass-soft' ? 'selected' : ''}>Doux et aéré</option></select></label>
    <label class="field"><span>Journée affichée de</span><select data-set="dayStart" data-num>${hOpt(set.dayStart, 0, 12)}</select></label>
    <label class="field"><span>à</span><select data-set="dayEnd" data-num>${hOpt(set.dayEnd, 14, 24)}</select></label></div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
      <label class="check-line"><input type="checkbox" data-set="fit" ${set.fit ? 'checked' : ''}> Tout faire tenir dans l’écran (sans défiler)</label>
      <label class="check-line"><input type="checkbox" data-set="thinRoutines" ${set.thinRoutines ? 'checked' : ''}> Sommeil et repas en fines barres dans la semaine</label>
      <label class="check-line"><input type="checkbox" data-set="dayChecklist" ${set.dayChecklist ? 'checked' : ''}> Vue Jour en check-liste</label></div></div>

  <div class="set-sec card"><h2>Organisation automatique</h2><p>Fenêtre de travail perso, limites et marges utilisées par ✨ Organiser.</p><div class="set-grid">
    <label class="field"><span>Travail perso à partir de</span><input type="time" data-set="workStart" value="${set.workStart}"></label>
    <label class="field"><span>jusqu’à</span><input type="time" data-set="workEnd" value="${set.workEnd}"></label>
    <label class="field"><span>Révisions max par jour (h)</span><input type="number" data-set="maxStudy" data-hours min="1" max="12" step="0.5" value="${set.maxStudy / 60}"></label>
    <label class="field"><span>Durée d’une séance (min)</span><input type="number" data-set="session" data-num min="30" max="180" step="15" value="${set.session}"></label>
    <label class="field"><span>Marge par jour (min)</span><input type="number" data-set="margin" data-num min="0" max="120" step="15" value="${set.margin}"></label>
    <label class="field"><span>Révisions par matière (h/sem.)</span><input type="number" data-set="revisionDefault" data-hours min="0" max="15" step="0.5" value="${set.revisionDefault / 60}"></label></div>
    <label class="check-line" style="margin-top:10px"><input type="checkbox" data-set="examBoost" ${set.examBoost ? 'checked' : ''}> Concentrer les révisions sur les matières dont l’examen approche</label>
    <h3 style="margin:14px 0 6px">Ordre de priorité</h3><div class="list-edit prio-list">${set.priorities.map((p, i) => `<div class="li"><span class="grow">${i + 1}. ${PRIORITY_LABELS[p] || p}</span><button class="btn icon sm ghost" data-prio="${i}:-1" ${i === 0 ? 'disabled' : ''} aria-label="Monter">↑</button><button class="btn icon sm ghost" data-prio="${i}:1" ${i === set.priorities.length - 1 ? 'disabled' : ''} aria-label="Descendre">↓</button></div>`).join('')}</div></div>

  <div class="set-sec card"><h2>Habitudes</h2><p>Sommeil, repas, sport… placés par l’organisation automatique.</p>
    ${S.data.habits.map(h => { const c = catById(h.cat); return `<div class="habit-row ${h.on === false ? 'off' : ''}" data-hedit="${h.id}" style="--c:${c ? c.color : '#888'}"><span class="dot"></span><span>${esc(h.name)}</span><span class="small muted">${h.mode === 'sleep' ? `coucher ${h.start} · ${fmtDur(h.dur)}` : h.mode === 'weekly' ? `${h.perWeek}×/sem. · ${fmtDur(h.dur)}` : h.mode === 'fixed' ? `${h.start} · ${fmtDur(h.dur)}` : `${h.start}–${h.end} · ${fmtDur(h.dur)}`}</span><span class="small muted">${h.on === false ? 'désactivée' : ''}</span></div>`; }).join('')}
    <button class="btn" data-go="new-habit" style="margin-top:10px">${ICON.plus} Nouvelle habitude</button></div>

  <div class="set-sec card"><h2>Matières et dates d’examen</h2><div class="list-edit">${S.data.subjects.map(s => `<div class="li"><input type="color" value="${esc(s.color)}" data-subj="${s.id}:color" aria-label="Couleur"><input type="text" value="${esc(s.name)}" data-subj="${s.id}:name" aria-label="Nom">
      <input type="number" min="0" max="20" step="0.5" value="${(s.weeklyMin ?? set.revisionDefault) / 60}" data-subj="${s.id}:weeklyMin" style="width:80px" aria-label="Heures par semaine"><span class="small muted">h/sem.</span>
      <input type="date" value="${esc(s.examDate || '')}" data-subj="${s.id}:examDate" style="width:150px" aria-label="Date d’examen"><button class="btn icon sm ghost danger" data-subjdel="${s.id}" aria-label="Supprimer">✕</button></div>`).join('') || '<div class="empty">Aucune matière : elles sont créées à l’import des cours.</div>'}</div>
    <div style="display:flex;gap:8px;margin-top:10px"><input type="text" id="subj-new" placeholder="Nouvelle matière" style="max-width:280px"><button class="btn" id="subj-add">Ajouter</button></div></div>

  <div class="set-sec card"><h2>Catégories</h2><div class="list-edit">${S.data.categories.map(c => `<div class="li"><input type="color" value="${esc(c.color)}" data-cat="${c.id}:color" aria-label="Couleur"><input type="text" value="${esc(c.name)}" data-cat="${c.id}:name" aria-label="Nom"><span class="small muted" style="width:120px">${esc(KINDS[c.kind] || c.kind)}</span></div>`).join('')}</div></div>

  <div class="set-sec card"><h2>Sauvegarde</h2><p>Une copie de secours de tout ton planning, et l’export vers Google Agenda.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="bk-json">Exporter une sauvegarde (.json)</button><button class="btn" id="bk-ics">Exporter (.ics)</button>
      <label class="btn">Restaurer une sauvegarde<input type="file" id="bk-restore" accept=".json,application/json" class="hidden"></label><button class="btn danger" id="bk-reset">Tout effacer</button></div></div></div>`;
  wireSettings(el);
}

function wireSettings(el) {
  el.querySelectorAll('[data-set]').forEach(inp => inp.addEventListener('change', () => {
    const k = inp.dataset.set; let v = inp.type === 'checkbox' ? inp.checked : inp.value;
    if ('num' in inp.dataset) v = +v; if ('hours' in inp.dataset) v = Math.round(+v * 60);
    if (k === 'dayEnd' && v - S.data.settings.dayStart < 6) { toast('Garde au moins 6 heures affichées.'); return; }
    commit(() => setSetting(k, v));
  }));
  el.querySelectorAll('[data-prio]').forEach(b => b.addEventListener('click', () => {
    const [i, d] = b.dataset.prio.split(':').map(Number); const p = [...S.data.settings.priorities]; [p[i], p[i + d]] = [p[i + d], p[i]];
    commit(() => setSetting('priorities', p));
  }));
  el.querySelectorAll('[data-subj]').forEach(inp => inp.addEventListener('change', () => {
    const [id, f] = inp.dataset.subj.split(':'); const s = subjById(id); if (!s) return;
    let v = inp.value; if (f === 'weeklyMin') v = Math.round(+v * 60); if (f === 'name' && !v.trim()) return;
    commit(() => put('subjects', { ...s, [f]: v }));
  }));
  el.querySelectorAll('[data-subjdel]').forEach(b => armButton(b, () => commit(() => del('subjects', b.dataset.subjdel)), '✓ ?'));
  el.querySelector('#subj-add').addEventListener('click', () => { const v = el.querySelector('#subj-new').value.trim(); if (v) commit(() => put('subjects', { id: 's-' + uid(), name: v, color: SUBJECT_COLORS[S.data.subjects.length % SUBJECT_COLORS.length], weeklyMin: S.data.settings.revisionDefault, examDate: '' })); });
  el.querySelectorAll('[data-cat]').forEach(inp => inp.addEventListener('change', () => { const [id, f] = inp.dataset.cat.split(':'); const c = catById(id); if (c && inp.value.trim()) commit(() => put('categories', { ...c, [f]: inp.value })); }));
  el.querySelectorAll('[data-hedit]').forEach(r => r.addEventListener('click', () => openHabitEditor(S.data.habits.find(h => h.id === r.dataset.hedit))));

  // import
  el.querySelector('#imp-go').addEventListener('click', async () => {
    const res = el.querySelector('#imp-res'), file = el.querySelector('#imp-file').files[0], json = el.querySelector('#imp-json').value.trim();
    let list;
    try { list = file ? fromICS(await file.text()) : json ? fromJSON(json) : null; }
    catch (e) { res.innerHTML = '<span class="err-msg">Ce texte n’est pas un bloc « edt-cours » valide.</span>'; return; }
    if (!list) { res.innerHTML = '<span class="err-msg">Choisis un fichier .ics ou colle un bloc JSON.</span>'; return; }
    if (!list.length) { res.innerHTML = '<span class="err-msg">Aucun cours trouvé dans ce fichier.</span>'; return; }
    const opts = { from: el.querySelector('#imp-from').value, until: el.querySelector('#imp-until').value, replace: el.querySelector('#imp-replace').checked, includeRetakes: el.querySelector('#imp-retake').checked, source: file ? 'ics' : 'json' };
    let r; commit(() => { r = importCourses(list, opts); setSetting('includeRetakes', opts.includeRetakes); });
    toast(`${r.n} créneau${r.n > 1 ? 'x' : ''} importé${r.n > 1 ? 's' : ''}${r.exams ? `, ${r.exams} examen${r.exams > 1 ? 's' : ''}` : ''}${r.created ? `, ${r.created} matière${r.created > 1 ? 's' : ''} créée${r.created > 1 ? 's' : ''}` : ''}.`, { undo: true, action: { label: '✨ Organiser', fn: () => document.dispatchEvent(new CustomEvent('organize')) } });
  });

  // synchro
  el.querySelector('#sy-go')?.addEventListener('click', async () => {
    const token = el.querySelector('#sy-token').value, err = el.querySelector('#sy-err'); if (!token.trim()) return;
    try {
      const r = await connect(token);
      if (r.needChoice) {
        openModal({ title: 'Un planning existe déjà dans le cloud', body: '<p style="margin:0">Que veux-tu faire avec celui de cet appareil ?</p>', foot: '<button class="btn" id="c-merge">Fusionner les deux</button><span class="sp"></span><button class="btn primary" id="c-cloud">Utiliser le planning du cloud</button>', onMount(m, close) {
          m.querySelector('#c-cloud').addEventListener('click', async () => { close(); await connect(token, 'cloud'); toast('Planning du cloud récupéré.'); });
          m.querySelector('#c-merge').addEventListener('click', async () => { close(); await connect(token, 'merge'); toast('Plannings fusionnés.'); });
        } });
      } else toast('Synchronisation activée.');
    } catch (e) { err.textContent = e.message || 'Connexion impossible.'; }
  });
  el.querySelector('#sy-now')?.addEventListener('click', () => syncNow());
  const off = el.querySelector('#sy-off'); if (off) armButton(off, () => { disconnect(); toast('Cet appareil n’est plus synchronisé.'); document.dispatchEvent(new CustomEvent('rerender')); });

  // sauvegarde
  el.querySelector('#bk-json').addEventListener('click', () => download(`mon-planning-${todayKey()}.json`, JSON.stringify(S.data, null, 1), 'application/json'));
  el.querySelector('#bk-ics').addEventListener('click', () => download(`mon-planning-${todayKey()}.ics`, exportICS(), 'text/calendar'));
  el.querySelector('#bk-restore').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const d = JSON.parse(await f.text()); if (!d.settings || !Array.isArray(d.events)) throw 0; const now = Date.now();
      commit(() => { for (const c of ['categories', 'subjects', 'habits', 'goals', 'tasks', 'events']) (d[c] || []).forEach(x => x.updatedAt = now); d.settings.updatedAt = now; Object.assign(S.data, d); });
      toast('Sauvegarde restaurée.', { undo: true }); }
    catch (err) { toast('Ce fichier n’est pas une sauvegarde de Mon Planning.'); }
  });
  armButton(el.querySelector('#bk-reset'), () => { commit(() => { const now = Date.now(); for (const c of ['goals', 'tasks', 'events', 'subjects']) { S.data[c].forEach(x => S.data.deleted[x.id] = now); S.data[c] = []; } }); toast('Planning effacé.', { undo: true }); }, 'Confirmer : tout effacer');
}

/* ---------- actions communes aux pages ---------- */
export function wirePages(view, ctx) {
  view.addEventListener('click', e => {
    const t = e.target;
    const chk = t.closest('[data-chk]'); if (chk && S.ui.page === 'today') { e.stopPropagation(); const o = ctx.occByKey(chk.dataset.chk); if (o) commit(() => setStatus(o, o.status === 'done' ? '' : 'done')); return; }
    const open = t.closest('[data-open]'); if (open && S.ui.page !== 'calendar') { const o = ctx.occByKey(open.dataset.open); if (o) openEventEditor(o); return; }
    const oe = t.closest('[data-open-ev]'); if (oe) { const o = ctx.occByKey(oe.dataset.openEv); if (o) openEventEditor(o); return; }
    const tc = t.closest('[data-tcycle]'); if (tc) { const k = S.data.tasks.find(x => x.id === tc.dataset.tcycle); const next = { todo: 'doing', doing: 'done', done: 'todo' }[k.status || 'todo']; commit(() => put('tasks', { ...k, status: next })); return; }
    const te = t.closest('[data-tedit]'); if (te) { openTaskEditor(S.data.tasks.find(x => x.id === te.dataset.tedit)); return; }
    const tp = t.closest('[data-tplan]'); if (tp) { const k = S.data.tasks.find(x => x.id === tp.dataset.tplan); let ev; commit(() => { ev = planTask(k); }); toast(ev ? `Planifié ${fmtDate(dateOf(ev.start))} à ${timeOf(ev.start)}.` : 'Aucun créneau libre avant l’échéance.', ev ? { undo: true } : {}); return; }
    const tf = t.closest('[data-tfilter]'); if (tf) { S.ui.taskFilter = tf.dataset.tfilter; ctx.render(); return; }
    const ge = t.closest('[data-gedit]'); if (ge) { openGoalEditor(S.data.goals.find(x => x.id === ge.dataset.gedit)); return; }
    const gp = t.closest('[data-gprop]'); if (gp) { let n; commit(() => { n = proposeGoal(gp.dataset.gprop, weekStart(todayKey())); }); toast(n ? `${n} créneau${n > 1 ? 'x' : ''} ajouté${n > 1 ? 's' : ''} cette semaine.` : 'Pas de créneau libre ou objectif déjà atteint.', n ? { undo: true } : {}); return; }
    const bw = t.closest('[data-bweek]'); if (bw) { const d = +bw.dataset.bweek; S.ui.bilanWeek = d === 0 ? weekStart(todayKey()) : addDays(S.ui.bilanWeek || weekStart(todayKey()), 7 * d); ctx.render(); return; }
  });
  view.addEventListener('change', e => {
    const gs = e.target.closest('[data-gsub]'); if (gs) { const [gid, sid] = gs.dataset.gsub.split(':'); const g = S.data.goals.find(x => x.id === gid); commit(() => put('goals', { ...g, subtasks: g.subtasks.map(s => s.id === sid ? { ...s, done: gs.checked } : s) })); return; }
    const sw = e.target.closest('[data-subjweek]'); if (sw) { const s = subjById(sw.dataset.subjweek); commit(() => put('subjects', { ...s, weeklyMin: Math.round((+sw.value || 0) * 60) })); }
  });
  view.addEventListener('input', e => { if (e.target.id === 't-q') { S.ui.taskQuery = e.target.value; const pos = e.target.selectionStart; ctx.render(); const q = document.getElementById('t-q'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } } });
}
