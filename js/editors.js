// Formulaires : événement, tâche, objectif, habitude.
import { S, commit, put, del, catById, kindOf, subjectFor, setStatus } from './store.js';
import { esc, uid, dt, toMin, dateOf, timeOf, durMin, addDays, todayKey, dow, DOW1, fmtDate } from './util.js';
import { openModal, toast, armButton } from './ui.js';

const catOptions = sel => S.data.categories.filter(c => c.on !== false || c.id === sel).map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
const subjOptions = sel => `<option value="">— aucune —</option>${S.data.subjects.map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}<option value="__new">+ Nouvelle matière…</option>`;
const daysPick = (name, sel) => `<div class="days-pick">${DOW1.map((l, i) => `<label><input type="checkbox" name="${name}" value="${i}" ${sel.includes(i) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
const pickedDays = (root, name) => [...root.querySelectorAll(`input[name="${name}"]:checked`)].map(x => +x.value);
const subjKinds = ['cours', 'revision', 'examen'];

function wireSubject(m) {
  const cat = m.querySelector('#f-cat'), subj = m.querySelector('#f-subj'), w = m.querySelector('#f-subj-w'), nw = m.querySelector('#f-newsubj-w');
  const upd = () => { const k = (catById(cat.value) || {}).kind; w.classList.toggle('hidden', !subjKinds.includes(k)); nw.classList.toggle('hidden', !(subjKinds.includes(k) && subj.value === '__new')); };
  cat.addEventListener('change', upd); subj.addEventListener('change', upd); upd();
}
function readSubject(m) {
  const k = (catById(m.querySelector('#f-cat').value) || {}).kind; if (!subjKinds.includes(k)) return '';
  const v = m.querySelector('#f-subj').value;
  if (v === '__new') { const n = m.querySelector('#f-newsubj').value.trim(); return n ? subjectFor(n) : ''; }
  return v;
}

export function newEventAt(date, startMin, len, preset = {}) {
  openEventEditor(null, { cat: 'revision', title: '', start: dt(date, startMin), end: dt(date, startMin + (len || 60)), ...preset });
}

export function openEventEditor(o, draft) {
  const ev = o ? o.ev : draft, isNew = !o, rec = o && o.recurring;
  const start = o ? o.start : draft.start, end = o ? o.end : draft.end;
  const r = ev.repeat || { days: [], until: '' };
  const status = o ? o.status : '';
  const body = `
    <div class="frow"><label class="field"><span>Catégorie</span><select id="f-cat">${catOptions(ev.cat)}</select></label>
      <label class="field" id="f-subj-w"><span>Matière</span><select id="f-subj">${subjOptions(ev.subject || '')}</select></label></div>
    <label class="field hidden" id="f-newsubj-w"><span>Nom de la nouvelle matière</span><input type="text" id="f-newsubj"></label>
    <div class="frow"><label class="field"><span>Date</span><input type="date" id="f-date" value="${dateOf(start)}"></label>
      <label class="field"><span>Début</span><input type="time" id="f-start" value="${timeOf(start)}" step="300"></label>
      <label class="field"><span>Fin</span><input type="time" id="f-end" value="${timeOf(end)}" step="300"></label></div>
    <label class="field"><span>Lieu</span><input type="text" id="f-loc" value="${esc(ev.location || '')}" placeholder="Salle, adresse…"></label>
    ${rec ? '' : `<label class="check-line"><input type="checkbox" id="f-rep" ${r.days.length ? 'checked' : ''}> Répéter chaque semaine</label>
    <div id="f-rep-w" class="${r.days.length ? '' : 'hidden'}" style="display:flex;flex-direction:column;gap:8px">${daysPick('f-days', r.days.length ? r.days : [dow(dateOf(start))])}
      <label class="field"><span>Jusqu'au (vide = sans fin)</span><input type="date" id="f-until" value="${esc(r.until || '')}"></label></div>`}
    <label class="field"><span>Notes</span><textarea id="f-notes">${esc(ev.notes || '')}</textarea></label>
    <div style="display:flex;gap:16px;flex-wrap:wrap">
      <label class="check-line"><input type="checkbox" id="f-pin" ${ev.pinned ? 'checked' : ''}> 📌 Épinglé (l'organisation auto n'y touche pas)</label>
      <label class="check-line"><input type="checkbox" id="f-done" ${status === 'done' ? 'checked' : ''}> Fait</label>
      <label class="check-line"><input type="checkbox" id="f-skip" ${status === 'skipped' ? 'checked' : ''}> Pas fait / annulé</label></div>
    ${rec ? `<div class="scope-pick"><span>Modifier :</span><label class="check-line"><input type="radio" name="f-scope" value="one" checked> cette fois</label><label class="check-line"><input type="radio" name="f-scope" value="all"> toute la série</label></div>` : ''}
    ${ev.kind === 'course' ? '<p class="small muted" style="margin:0">Cours importé de ton emploi du temps.</p>' : ev.kind === 'auto' ? '<p class="small muted" style="margin:0">Placé par l’organisation automatique. Si tu le modifies, il est épinglé.</p>' : ''}
    <div class="err-msg" id="f-err"></div>`;
  const foot = `${isNew ? '' : `<button class="btn danger" id="f-del">${rec ? 'Supprimer cette fois' : 'Supprimer'}</button>${rec ? '<button class="btn danger" id="f-delall">Supprimer la série</button>' : ''}<button class="btn" id="f-dup">Dupliquer</button>`}
    <span class="sp"></span><button class="btn" data-close>Annuler</button><button class="btn primary" id="f-save">Enregistrer</button>`;
  openModal({ title: 'Titre', titleInput: ev.title || '', body, foot, onMount(m, close) {
    wireSubject(m);
    const rep = m.querySelector('#f-rep'); rep?.addEventListener('change', () => m.querySelector('#f-rep-w').classList.toggle('hidden', !rep.checked));
    const done = m.querySelector('#f-done'), skip = m.querySelector('#f-skip');
    done.addEventListener('change', () => { if (done.checked) skip.checked = false; });
    skip.addEventListener('change', () => { if (skip.checked) done.checked = false; });
    const read = () => {
      const date = m.querySelector('#f-date').value, ts = m.querySelector('#f-start').value, te = m.querySelector('#f-end').value;
      if (!date || !ts || !te) { m.querySelector('#f-err').textContent = 'Indique la date, l’heure de début et l’heure de fin.'; return null; }
      let sm = toMin(ts), em = toMin(te); if (em <= sm) em += 1440;   // finit après minuit
      const fields = { title: m.querySelector('#m-title').value.trim(), cat: m.querySelector('#f-cat').value, subject: readSubject(m),
        location: m.querySelector('#f-loc').value.trim(), notes: m.querySelector('#f-notes').value.trim(), pinned: m.querySelector('#f-pin').checked };
      const st = done.checked ? 'done' : skip.checked ? 'skipped' : '';
      let repeat = null;
      if (rep && rep.checked) { const days = pickedDays(m, 'f-days'); if (days.length) repeat = { days, until: m.querySelector('#f-until').value || '' }; }
      return { date, sm, em, fields, st, repeat };
    };
    m.querySelector('#f-save').addEventListener('click', () => {
      const v = read(); if (!v) return;
      if (!v.fields.title && !v.fields.subject) v.fields.title = (catById(v.fields.cat) || {}).name;
      const ns = dt(v.date, v.sm), ne = dt(v.date, v.em);
      commit(() => {
        if (isNew) put('events', { id: 'e-' + uid(), kind: 'manual', ...v.fields, start: ns, end: ne, status: v.st, repeat: v.repeat });
        else if (rec) {
          if (m.querySelector('input[name="f-scope"]:checked').value === 'one') {
            put('events', { ...ev, ex: [...(ev.ex || []), o.date] });
            const { repeat, ex, occ, id, updatedAt, ...rest } = ev;
            put('events', { ...rest, ...v.fields, id: 'e-' + uid(), start: ns, end: ne, status: v.st });
          } else {
            const d0 = dateOf(ev.start); const occ = { ...(ev.occ || {}) }; if (v.st) occ[o.date] = v.st; else delete occ[o.date];
            put('events', { ...ev, ...v.fields, start: dt(d0, v.sm), end: dt(d0, v.em), occ });
          }
        } else {
          const moved = ns !== ev.start || ne !== ev.end;
          put('events', { ...ev, ...v.fields, start: ns, end: ne, status: v.st, repeat: v.repeat, pinned: v.fields.pinned || (ev.kind === 'auto' && moved) });
        }
      });
      close(); toast(isNew ? 'Événement ajouté.' : 'Modifications enregistrées.', { undo: true });
    });
    const delBtn = m.querySelector('#f-del');
    if (delBtn) armButton(delBtn, () => { commit(() => { if (rec) put('events', { ...ev, ex: [...(ev.ex || []), o.date] }); else del('events', ev.id); }); close(); toast('Supprimé.', { undo: true }); });
    const delAll = m.querySelector('#f-delall');
    if (delAll) armButton(delAll, () => { commit(() => del('events', ev.id)); close(); toast('Série supprimée.', { undo: true }); });
    m.querySelector('#f-dup')?.addEventListener('click', () => {
      const len = durMin(o.start, o.end), nd = addDays(o.date, 1);
      const { repeat, ex, occ, id, updatedAt, ...rest } = ev;
      commit(() => put('events', { ...rest, id: 'e-' + uid(), kind: ev.kind === 'course' ? 'manual' : ev.kind, start: `${nd}T${timeOf(o.start)}`, end: dt(nd, toMin(timeOf(o.start)) + len), status: '' }));
      close(); toast(`Dupliqué le ${fmtDate(nd)}.`, { undo: true });
    });
  } });
}

export function openTaskEditor(t) {
  const isNew = !t; t = t || { title: '', cat: 'revision', subject: '', due: addDays(todayKey(), 3), dur: 60, prio: 'mid', status: 'todo', notes: '' };
  const body = `
    <div class="frow"><label class="field"><span>Catégorie</span><select id="f-cat">${catOptions(t.cat)}</select></label>
      <label class="field" id="f-subj-w"><span>Matière</span><select id="f-subj">${subjOptions(t.subject || '')}</select></label></div>
    <label class="field hidden" id="f-newsubj-w"><span>Nom de la nouvelle matière</span><input type="text" id="f-newsubj"></label>
    <div class="frow"><label class="field"><span>Échéance</span><input type="date" id="f-due" value="${esc(t.due || '')}"></label>
      <label class="field"><span>Durée estimée</span><select id="f-dur">${[15, 30, 45, 60, 90, 120, 180, 240].map(v => `<option value="${v}" ${v === t.dur ? 'selected' : ''}>${v < 60 ? v + ' min' : v / 60 + ' h'}</option>`).join('')}</select></label>
      <label class="field"><span>Priorité</span><select id="f-prio"><option value="high" ${t.prio === 'high' ? 'selected' : ''}>Haute</option><option value="mid" ${t.prio === 'mid' ? 'selected' : ''}>Moyenne</option><option value="low" ${t.prio === 'low' ? 'selected' : ''}>Basse</option></select></label></div>
    <label class="field"><span>Statut</span><select id="f-status"><option value="todo" ${t.status === 'todo' ? 'selected' : ''}>À faire</option><option value="doing" ${t.status === 'doing' ? 'selected' : ''}>En cours</option><option value="done" ${t.status === 'done' ? 'selected' : ''}>Fait</option></select></label>
    <label class="field"><span>Notes</span><textarea id="f-notes">${esc(t.notes || '')}</textarea></label>`;
  const foot = `${isNew ? '' : '<button class="btn danger" id="f-del">Supprimer</button>'}<span class="sp"></span><button class="btn" data-close>Annuler</button><button class="btn primary" id="f-save">Enregistrer</button>`;
  openModal({ title: 'Nouvelle tâche', titleInput: t.title, body, foot, onMount(m, close) {
    wireSubject(m);
    m.querySelector('#f-save').addEventListener('click', () => {
      const title = m.querySelector('#m-title').value.trim(); if (!title) { m.querySelector('#m-title').focus(); return; }
      commit(() => put('tasks', { ...t, id: t.id || 't-' + uid(), title, cat: m.querySelector('#f-cat').value, subject: readSubject(m), due: m.querySelector('#f-due').value,
        dur: +m.querySelector('#f-dur').value, prio: m.querySelector('#f-prio').value, status: m.querySelector('#f-status').value, notes: m.querySelector('#f-notes').value.trim() }));
      close();
    });
    const d = m.querySelector('#f-del'); if (d) armButton(d, () => { commit(() => del('tasks', t.id)); close(); toast('Tâche supprimée.', { undo: true }); });
  } });
}

export function openGoalEditor(g) {
  const isNew = !g; g = g || { title: '', desc: '', color: '#12a594', weeklyMin: 120, deadline: '', subtasks: [] };
  let subs = (g.subtasks || []).map(x => ({ ...x }));
  const subHtml = () => subs.map((s, i) => `<div class="li"><input type="checkbox" data-sdone="${i}" ${s.done ? 'checked' : ''} aria-label="Fait"><input type="text" data-stext="${i}" value="${esc(s.t)}"><button class="btn icon ghost" data-sdel="${i}" aria-label="Retirer">✕</button></div>`).join('');
  const body = `
    <label class="field"><span>Description</span><textarea id="f-desc">${esc(g.desc || '')}</textarea></label>
    <div class="frow"><label class="field"><span>Temps par semaine (h)</span><input type="number" id="f-week" min="0" step="0.5" value="${(g.weeklyMin || 0) / 60}"></label>
      <label class="field"><span>Échéance</span><input type="date" id="f-deadline" value="${esc(g.deadline || '')}"></label>
      <label class="field"><span>Couleur</span><input type="color" id="f-color" value="${esc(g.color)}"></label></div>
    <div class="field"><span>Sous-tâches</span><div class="list-edit" id="f-subs">${subHtml()}</div>
      <div style="display:flex;gap:8px;margin-top:6px"><input type="text" id="f-newsub" placeholder="Ajouter une étape"><button class="btn" id="f-addsub">Ajouter</button></div></div>`;
  const foot = `${isNew ? '' : '<button class="btn danger" id="f-del">Supprimer</button>'}<span class="sp"></span><button class="btn" data-close>Annuler</button><button class="btn primary" id="f-save">Enregistrer</button>`;
  openModal({ title: 'Nouvel objectif', titleInput: g.title, body, foot, onMount(m, close) {
    const box = m.querySelector('#f-subs');
    const sync = () => { box.querySelectorAll('[data-stext]').forEach(inp => subs[+inp.dataset.stext].t = inp.value); box.querySelectorAll('[data-sdone]').forEach(c => subs[+c.dataset.sdone].done = c.checked); };
    box.addEventListener('click', e => { const d = e.target.closest('[data-sdel]'); if (d) { sync(); subs.splice(+d.dataset.sdel, 1); box.innerHTML = subHtml(); } });
    const add = () => { const inp = m.querySelector('#f-newsub'); if (!inp.value.trim()) return; sync(); subs.push({ id: uid(), t: inp.value.trim(), done: false }); inp.value = ''; box.innerHTML = subHtml(); };
    m.querySelector('#f-addsub').addEventListener('click', add);
    m.querySelector('#f-newsub').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    m.querySelector('#f-save').addEventListener('click', () => {
      const title = m.querySelector('#m-title').value.trim(); if (!title) { m.querySelector('#m-title').focus(); return; }
      sync();
      commit(() => put('goals', { ...g, id: g.id || 'g-' + uid(), title, desc: m.querySelector('#f-desc').value.trim(), weeklyMin: Math.round((+m.querySelector('#f-week').value || 0) * 60),
        deadline: m.querySelector('#f-deadline').value, color: m.querySelector('#f-color').value, subtasks: subs.filter(s => s.t.trim()) }));
      close();
    });
    const d = m.querySelector('#f-del'); if (d) armButton(d, () => { commit(() => del('goals', g.id)); close(); toast('Objectif supprimé.', { undo: true }); });
  } });
}

const MODES = { sleep: 'Sommeil (coucher + durée)', window: 'Dans une fenêtre horaire', weekly: 'X fois par semaine', fixed: 'À heure fixe' };
export function openHabitEditor(h) {
  const isNew = !h; h = h || { name: '', cat: 'sport', mode: 'weekly', days: [0, 1, 2, 3, 4, 5, 6], start: '17:00', end: '21:00', dur: 60, perWeek: 2, on: true };
  const body = `
    <div class="frow"><label class="field"><span>Catégorie</span><select id="f-cat">${catOptions(h.cat)}</select></label>
      <label class="field"><span>Type</span><select id="f-mode">${Object.entries(MODES).map(([k, l]) => `<option value="${k}" ${k === h.mode ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <div class="field"><span>Jours possibles</span>${daysPick('f-days', h.days)}</div>
    <div class="frow"><label class="field"><span id="f-start-l">Début</span><input type="time" id="f-start" value="${esc(h.start)}"></label>
      <label class="field" id="f-end-w"><span>Fin</span><input type="time" id="f-end" value="${esc(h.end)}"></label>
      <label class="field" id="f-dur-w"><span>Durée (min)</span><input type="number" id="f-dur" min="10" step="5" value="${h.dur}"></label>
      <label class="field" id="f-per-w"><span>Fois par semaine</span><input type="number" id="f-per" min="1" max="14" value="${h.perWeek}"></label></div>
    <label class="check-line"><input type="checkbox" id="f-on" ${h.on !== false ? 'checked' : ''}> Activée</label>`;
  const foot = `${isNew ? '' : '<button class="btn danger" id="f-del">Supprimer</button>'}<span class="sp"></span><button class="btn" data-close>Annuler</button><button class="btn primary" id="f-save">Enregistrer</button>`;
  openModal({ title: 'Nouvelle habitude', titleInput: h.name, body, foot, onMount(m, close) {
    const mode = m.querySelector('#f-mode');
    const upd = () => { const v = mode.value; m.querySelector('#f-end-w').classList.toggle('hidden', v === 'sleep' || v === 'fixed');
      m.querySelector('#f-per-w').classList.toggle('hidden', v !== 'weekly'); m.querySelector('#f-start-l').textContent = v === 'sleep' ? 'Coucher' : v === 'fixed' ? 'Heure' : 'Fenêtre : début'; };
    mode.addEventListener('change', upd); upd();
    m.querySelector('#f-save').addEventListener('click', () => {
      const name = m.querySelector('#m-title').value.trim(); if (!name) { m.querySelector('#m-title').focus(); return; }
      commit(() => put('habits', { ...h, id: h.id || 'h-' + uid(), name, cat: m.querySelector('#f-cat').value, mode: mode.value, days: pickedDays(m, 'f-days'),
        start: m.querySelector('#f-start').value || '08:00', end: m.querySelector('#f-end').value || '20:00', dur: Math.max(10, +m.querySelector('#f-dur').value || 60),
        perWeek: Math.max(1, +m.querySelector('#f-per').value || 1), on: m.querySelector('#f-on').checked }));
      close();
    });
    const d = m.querySelector('#f-del'); if (d) armButton(d, () => { commit(() => del('habits', h.id)); close(); });
  } });
}
