// État de l'application, sauvegarde locale, annulation, occurrences des événements.
import { seedState, SUBJECT_COLORS } from './seed.js';
import { addDays, dateOf, dow, dt, durMin, toMin, timeOf, uid, norm } from './util.js';

export const KEY = 'mon-planning-v1';
export const COLLS = ['categories', 'subjects', 'habits', 'goals', 'tasks', 'events'];

export const S = { data: null, undo: [], ui: { page: 'calendar', view: 'week', date: null, dayGrid: false, filter: {} }, hooks: { saved: [], changed: [] }, saveError: false };

export function load() {
  try { S.data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { S.data = null; }
  if (!S.data || !S.data.settings) S.data = seedState();
  migrate(S.data);
}
function migrate(d) {
  const base = seedState();
  d.settings = { ...base.settings, ...d.settings };
  for (const c of COLLS) if (!Array.isArray(d[c])) d[c] = [];
  if (!d.deleted || typeof d.deleted !== 'object') d.deleted = {};
  for (const c of base.categories) if (!d.categories.some(x => x.id === c.id)) d.categories.push(c);
}

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(S.data)); S.saveError = false; }
  catch (e) { S.saveError = true; }
  S.hooks.saved.forEach(f => f());
}
export const emit = () => S.hooks.changed.forEach(f => f());

// toute modification passe par ici : annulable, horodatée, sauvegardée
export function commit(fn) {
  S.undo.push(JSON.stringify(S.data)); if (S.undo.length > 40) S.undo.shift();
  fn(S.data);
  persist(); emit();
}
export function undo() {
  const prev = S.undo.pop(); if (!prev) return false;
  const before = S.data, after = JSON.parse(prev), now = Date.now();
  // ce qui change à cause de l'annulation est daté de maintenant, pour que la synchro le propage
  for (const c of COLLS) {
    const was = new Map(before[c].map(x => [x.id, JSON.stringify(x)]));
    for (const it of after[c]) if (was.get(it.id) !== JSON.stringify(it)) { it.updatedAt = now; delete after.deleted[it.id]; }
    const keep = new Set(after[c].map(x => x.id));
    for (const id of was.keys()) if (!keep.has(id)) after.deleted[id] = now;
  }
  if (JSON.stringify(before.settings) !== JSON.stringify(after.settings)) after.settings.updatedAt = now;
  S.data = after; persist(); emit(); return true;
}

export function put(coll, item) {
  item.updatedAt = Date.now();
  const arr = S.data[coll]; const i = arr.findIndex(x => x.id === item.id);
  if (i >= 0) arr[i] = item; else arr.push(item);
  delete S.data.deleted[item.id];
  return item;
}
export function del(coll, id) {
  S.data[coll] = S.data[coll].filter(x => x.id !== id);
  S.data.deleted[id] = Date.now();
}
export function setSetting(k, v) { S.data.settings[k] = v; S.data.settings.updatedAt = Date.now(); }

export const catById = id => S.data.categories.find(c => c.id === id) || S.data.categories.find(c => c.id === 'autre');
export const kindOf = ev => (catById(ev.cat) || {}).kind || 'autre';
export const subjById = id => S.data.subjects.find(s => s.id === id);
// cours et révisions prennent la couleur de la matière, le reste celle de la catégorie
export const colorOf = ev => { const k = kindOf(ev), s = ev.subject && subjById(ev.subject); return s && (k === 'cours' || k === 'revision') ? s.color : (catById(ev.cat) || {}).color || '#888'; };

export function subjectFor(name, create = true) {
  const n = norm(name); if (!n) return '';
  let s = S.data.subjects.find(x => norm(x.name) === n);
  if (!s && create) {
    s = put('subjects', { id: 's-' + uid(), name: name.trim(), color: SUBJECT_COLORS[S.data.subjects.length % SUBJECT_COLORS.length], weeklyMin: S.data.settings.revisionDefault, examDate: '' });
  }
  return s ? s.id : '';
}

// prochain examen d'une matière (date de la matière ou événement « examen » importé)
export function nextExam(subjectId, from) {
  const s = subjById(subjectId); let best = s && s.examDate && s.examDate >= from ? s.examDate : '';
  for (const ev of S.data.events) if (ev.subject === subjectId && kindOf(ev) === 'examen' && dateOf(ev.start) >= from && (!best || dateOf(ev.start) < best)) best = dateOf(ev.start);
  return best;
}

// occurrences entre deux dates (to exclu), récurrence hebdomadaire comprise
export function occurrences(from, to) {
  const out = [], lo = from + 'T00:00', hi = to + 'T00:00';
  for (const ev of S.data.events) {
    const r = ev.repeat;
    if (r && r.days && r.days.length) {
      const d0 = dateOf(ev.start), len = durMin(ev.start, ev.end), sm = toMin(timeOf(ev.start));
      let d = from < d0 ? d0 : addDays(from, -1);
      const last = r.until && r.until < to ? addDays(r.until, 1) : to;
      for (let n = 0; d < last && n < 800; d = addDays(d, 1), n++) {
        if (d < d0 || !r.days.includes(dow(d)) || (ev.ex || []).includes(d)) continue;
        const start = `${d}T${timeOf(ev.start)}`, end = dt(d, sm + len);
        if (start >= hi || end <= lo) continue;
        const st = (ev.occ || {})[d] || '';
        out.push({ ev, key: ev.id + '@' + d, date: d, start, end, status: st, recurring: true });
      }
    } else if (ev.start < hi && ev.end > lo) {
      out.push({ ev, key: ev.id, date: dateOf(ev.start), start: ev.start, end: ev.end, status: ev.status || '', recurring: false });
    }
  }
  return out.sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : 0);
}
export function occByKey(key) {
  const [id, d] = key.split('@'); const ev = S.data.events.find(e => e.id === id); if (!ev) return null;
  if (!d) return { ev, key, date: dateOf(ev.start), start: ev.start, end: ev.end, status: ev.status || '', recurring: false };
  return occurrences(d, addDays(d, 1)).find(o => o.key === key) || null;
}

// statut d'une occurrence : '' | 'done' | 'skipped'
export function setStatus(o, status) {
  const ev = { ...o.ev };
  if (o.recurring) { ev.occ = { ...(ev.occ || {}) }; if (status) ev.occ[o.date] = status; else delete ev.occ[o.date]; }
  else ev.status = status;
  put('events', ev);
}
// déplace une occurrence (une seule fois pour une série)
export function moveOcc(o, start, end) {
  const ev = o.ev;
  if (o.recurring) {
    put('events', { ...ev, ex: [...(ev.ex || []), o.date] });
    const { repeat, ex, occ, id, updatedAt, ...rest } = ev;
    put('events', { ...rest, id: 'e-' + uid(), start, end, status: o.status, pinned: ev.kind === 'auto' ? true : ev.pinned });
  } else put('events', { ...ev, start, end, pinned: ev.kind === 'auto' ? true : ev.pinned });
}
