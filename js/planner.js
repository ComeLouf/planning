// Organisation automatique de la semaine, planification des tâches et créneaux d'objectifs.
// Ordre : les priorités des Réglages. Ne touche jamais aux cours, aux événements manuels ni aux créneaux épinglés.
import { S, occurrences, put, del, kindOf, catById, nextExam, subjById } from './store.js';
import { uid, addDays, absMin, dt, dateOf, toMin, nowDT, durMin, diffDays, todayKey } from './util.js';
import { PRIORITY_KIND } from './seed.js';

const DAY = 1440;
const free = (busy, a, b, gap = 0) => !busy.some(([s, e]) => a < e + gap && b > s - gap);
// fenêtres de repas à protéger : un créneau n'y est accepté que s'il reste la place de manger
let mealGuard = [];
function leavesMealRoom(busy, a, b) {
  for (const [ws, we, dur] of mealGuard) {
    if (b <= ws || a >= we) continue;
    const blocks = busy.concat([[a, b]]).filter(([s, e]) => e > ws && s < we).sort((x, y) => x[0] - y[0]);
    let cur = ws, best = 0;
    for (const [s, e] of blocks) { best = Math.max(best, s - cur); cur = Math.max(cur, e); }
    best = Math.max(best, we - cur);
    if (best < dur) return false;
  }
  return true;
}
function findSlot(busy, from, to, len, gap = 0, step = 15) {
  for (let t = Math.ceil(from / step) * step; t + len <= to; t += step) if (free(busy, t, t + len, gap) && leavesMealRoom(busy, t, t + len)) return t;
  return null;
}
const catOfKind = kind => (S.data.categories.find(c => c.kind === kind) || S.data.categories.find(c => c.id === 'autre')).id;

function context(ws) {
  mealGuard = [];
  const occ = occurrences(addDays(ws, -1), addDays(ws, 8)).filter(o => o.status !== 'skipped');
  const busy = occ.map(o => [absMin(o.start, ws), absMin(o.end, ws)]);
  const now = nowDT(), nowAbs = absMin(now, ws);
  return { occ, busy, minStart: Math.max(0, nowAbs + 30), now };
}

export function organizeWeek(ws) {
  const st = S.data, set = st.settings, we = addDays(ws, 7);
  const lo = ws + 'T00:00', hi = we + 'T00:00', now = nowDT();
  // on repart de zéro pour les créneaux auto à venir de la semaine (sauf épinglés / faits)
  for (const ev of [...st.events]) if (ev.kind === 'auto' && !ev.pinned && !ev.repeat && ev.status !== 'done' && ev.start >= lo && ev.start < hi && ev.start >= now) del('events', ev.id);
  const C = context(ws); const { busy, minStart } = C;
  mealGuard = [];
  for (const h of st.habits) if (h.on !== false && h.mode === 'window' && kindOf({ cat: h.cat }) === 'repas')
    for (let i = 0; i < 7; i++) if (h.days.includes(i)) mealGuard.push([i * DAY + toMin(h.start), i * DAY + toMin(h.end), h.dur]);
  const load = Array(7).fill(0), subjDays = {}, created = [], missing = [];
  for (const o of C.occ) if (kindOf(o.ev) === 'revision') { const i = diffDays(ws, o.date); if (i >= 0 && i < 7) { load[i] += durMin(o.start, o.end); (subjDays[o.ev.subject || '_'] ||= new Set()).add(i); } }
  const add = (fields, a, b) => { const ev = put('events', { id: 'a-' + uid(), kind: 'auto', status: '', ...fields, start: dt(ws, a), end: dt(ws, b) }); busy.push([a, b]); created.push(ev); return ev; };
  const habitsOf = kind => st.habits.filter(h => h.on !== false && (catById(h.cat) || {}).kind === kind);
  const ws0 = toMin(set.workStart), we0 = toMin(set.workEnd);

  const placeSleep = h => {
    for (let i = 0; i < 7; i++) {
      if (!h.days.includes(i)) continue;
      let bed = toMin(h.start); if (bed < 12 * 60) bed += DAY;
      let a = i * DAY + bed, b = a + h.dur;
      if (b <= minStart) continue;
      for (let k = 0; k < 4; k++) {   // une soirée qui déborde repousse le coucher
        const late = C.occ.map(o => [absMin(o.start, ws), absMin(o.end, ws)]).concat(busy).find(([s, e]) => s < a + 60 && e > a);
        if (!late) break; a = late[1] + 15;
      }
      const early = busy.filter(([s, e]) => s >= a + 60 && s < b).sort((x, y) => x[0] - y[0])[0];
      if (early) b = early[0] - 45;     // cours du matin : réveil 45 min avant
      a = Math.max(a, minStart);
      if (b - a >= 180) add({ cat: h.cat, title: h.name }, a, b); else missing.push(`${h.name} (${['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'][i]})`);
    }
  };
  const placeWindow = h => {
    for (let i = 0; i < 7; i++) {
      if (!h.days.includes(i)) continue;
      const a = i * DAY + toMin(h.start), b = i * DAY + toMin(h.end);
      if (b <= minStart) continue;
      const already = C.occ.some(o => kindOf(o.ev) === kindOf({ cat: h.cat }) && o.ev.kind !== 'auto' && absMin(o.start, ws) < b && absMin(o.end, ws) > a);
      const guard = mealGuard.findIndex(g => g[0] === a && g[1] === b);
      const saved = guard >= 0 ? mealGuard.splice(guard, 1) : [];
      if (already) continue;
      const t = findSlot(busy, Math.max(a, minStart), b, h.dur);
      if (t != null) add({ cat: h.cat, title: h.name }, t, t + h.dur); else { missing.push(h.name); mealGuard.push(...saved); }
    }
  };
  const placeFixed = h => {
    for (let i = 0; i < 7; i++) {
      if (!h.days.includes(i)) continue;
      const a = i * DAY + toMin(h.start), b = a + h.dur;
      if (a < minStart) continue;
      if (free(busy, a, b)) add({ cat: h.cat, title: h.name }, a, b); else missing.push(h.name);
    }
  };
  const placeWeekly = h => {
    const kind = kindOf({ cat: h.cat });
    const doneDays = new Set(C.occ.filter(o => kindOf(o.ev) === kind && o.ev.kind !== 'auto').map(o => diffDays(ws, o.date)));
    let left = h.perWeek - doneDays.size;
    const chosen = new Set(doneDays);
    while (left > 0) {
      let best = null;
      for (let i = 0; i < 7; i++) {
        if (!h.days.includes(i) || chosen.has(i)) continue;
        const a = i * DAY + toMin(h.start), b = i * DAY + toMin(h.end);
        const t = findSlot(busy, Math.max(a, minStart), b, h.dur, 15); if (t == null) continue;
        const score = (chosen.has(i - 1) || chosen.has(i + 1) ? 5 : 0) + load[i] / 60;
        if (!best || score < best.score) best = { i, t, score };
      }
      if (!best) { missing.push(`${h.name} (${left} séance${left > 1 ? 's' : ''})`); break; }
      add({ cat: h.cat, title: h.name }, best.t, best.t + h.dur); chosen.add(best.i); left--;
    }
  };
  const placeHabits = kind => habitsOf(kind).forEach(h => ({ sleep: placeSleep, window: placeWindow, fixed: placeFixed, weekly: placeWeekly }[h.mode] || placeWeekly)(h));

  const placeStudies = () => {
    const sessions = [], today = todayKey();
    for (const s of st.subjects) {
      if (s.archived) continue;
      const target = s.weeklyMin ?? set.revisionDefault; if (!target) continue;
      const exam = nextExam(s.id, ws > today ? ws : today);
      let factor = 1;
      if (set.examBoost && exam) { const d = diffDays(ws > today ? ws : today, exam); factor = d <= 7 ? 2.5 : d <= 14 ? 1.75 : d <= 28 ? 1.25 : 1; }
      const already = C.occ.filter(o => kindOf(o.ev) === 'revision' && o.ev.subject === s.id && o.date >= ws && o.date < we).reduce((a, o) => a + durMin(o.start, o.end), 0);
      let need = Math.round(target * factor) - already;
      const prio = exam ? 10 / Math.max(1, diffDays(today, exam)) + 1 : 1;
      while (need >= 30) { const len = need <= set.session + 30 ? need : set.session; sessions.push({ subject: s.id, len: Math.min(len, 180), before: exam || null, prio, title: '' }); need -= len; }
    }
    for (const t of st.tasks) {
      if (t.status === 'done' || !t.due || t.due < today || diffDays(ws, t.due) > 13) continue;
      if (t.eventId && st.events.some(e => e.id === t.eventId && e.start >= now)) continue;
      sessions.push({ subject: t.subject || '', len: t.dur || 60, before: addDays(t.due, 1), prio: (t.prio === 'high' ? 3 : 1.5) + 5 / Math.max(1, diffDays(today, t.due)), title: t.title, taskId: t.id, cat: t.cat });
    }
    sessions.sort((a, b) => b.prio - a.prio || b.len - a.len);
    for (const se of sessions) {
      let best = null;
      for (let i = 0; i < 7; i++) {
        const d = addDays(ws, i); if (se.before && d >= se.before) continue;
        if (load[i] + se.len > set.maxStudy) continue;
        const t = findSlot(busy, Math.max(i * DAY + ws0, minStart), i * DAY + we0, se.len, 10); if (t == null) continue;
        const score = (subjDays[se.subject || '_'] && subjDays[se.subject || '_'].has(i) ? 10 : 0) + load[i] / 60 + i * 0.1 + (t - i * DAY) / DAY;
        if (!best || score < best.score) best = { i, t, score };
      }
      const name = se.title || (subjById(se.subject) || {}).name || 'Révisions';
      if (!best) { missing.push(name); continue; }
      const ev = add({ cat: se.cat && kindOf({ cat: se.cat }) !== 'cours' ? se.cat : catOfKind('revision'), subject: se.subject, title: se.title, taskId: se.taskId || '' }, best.t, best.t + se.len);
      if (se.taskId) { const t = st.tasks.find(x => x.id === se.taskId); if (t) put('tasks', { ...t, eventId: ev.id }); }
      load[best.i] += se.len; (subjDays[se.subject || '_'] ||= new Set()).add(best.i);
    }
  };
  const placeGoals = (only) => {
    for (const g of st.goals) {
      if (only && g.id !== only) continue;
      if (!g.weeklyMin || g.done) continue;
      const spent = C.occ.filter(o => o.ev.goalId === g.id && o.date >= ws && o.date < we).reduce((a, o) => a + durMin(o.start, o.end), 0)
        + created.filter(e => e.goalId === g.id).reduce((a, e) => a + durMin(e.start, e.end), 0);
      let need = g.weeklyMin - spent;
      const used = new Set();
      while (need >= 30) {
        const len = Math.min(60, need); let best = null;
        for (let i = 0; i < 7; i++) {
          if (used.has(i)) continue;
          const a = i * DAY + (i >= 5 ? ws0 : Math.max(ws0, 17 * 60)), t = findSlot(busy, Math.max(a, minStart), i * DAY + we0, len, 10);
          if (t == null) continue; const score = load[i] / 60 + (t - i * DAY) / DAY;
          if (!best || score < best.score) best = { i, t, score };
        }
        if (!best) { missing.push(g.title); break; }
        add({ cat: catOfKind('perso'), title: g.title, goalId: g.id }, best.t, best.t + len); used.add(best.i); need -= len;
      }
    }
  };

  for (const p of set.priorities) {
    if (p === 'etudes') placeStudies();
    else if (p === 'perso') { placeGoals(); placeHabits('perso'); }
    else placeHabits(PRIORITY_KIND[p]);
  }
  if (set.margin > 0) for (let i = 0; i < 7; i++) {
    const t = findSlot(busy, Math.max(i * DAY + 14 * 60, minStart), i * DAY + 20 * 60, set.margin, 0);
    if (t != null) add({ cat: catOfKind('marge'), title: 'Marge (imprévus)' }, t, t + set.margin);
  }
  return { created: created.length, missing };
}

// premier créneau libre avant l'échéance d'une tâche
export function planTask(task) {
  const set = S.data.settings, today = todayKey(), last = task.due && task.due >= today ? task.due : addDays(today, 13);
  const C = context(today); const len = task.dur || 60;
  for (let i = 0; i <= diffDays(today, last); i++) {
    const t = findSlot(C.busy, Math.max(i * DAY + toMin(set.workStart), C.minStart), i * DAY + toMin(set.workEnd), len, 10);
    if (t != null) {
      const ev = put('events', { id: 'a-' + uid(), kind: 'auto', pinned: true, cat: task.cat || catOfKind('revision'), subject: task.subject || '', title: task.title, taskId: task.id, start: dt(today, t), end: dt(today, t + len), status: '' });
      put('tasks', { ...task, eventId: ev.id });
      return ev;
    }
  }
  return null;
}

// créneaux pour un seul objectif sur la semaine en cours
export function proposeGoal(goalId, ws) {
  const before = S.data.events.length;
  const g = S.data.goals.find(x => x.id === goalId); if (!g) return 0;
  const set = S.data.settings, C = context(ws), we = addDays(ws, 7);
  const spent = C.occ.filter(o => o.ev.goalId === g.id && o.date >= ws && o.date < we).reduce((a, o) => a + durMin(o.start, o.end), 0);
  let need = (g.weeklyMin || 60) - spent, n = 0; const used = new Set();
  while (need >= 30) {
    const len = Math.min(60, need); let best = null;
    for (let i = 0; i < 7; i++) {
      if (used.has(i)) continue;
      const t = findSlot(C.busy, Math.max(i * DAY + (i >= 5 ? toMin(set.workStart) : 17 * 60), C.minStart), i * DAY + toMin(set.workEnd), len, 10);
      if (t != null && (!best || t - i * DAY < best.t - best.i * DAY)) best = { i, t };
    }
    if (!best) break;
    put('events', { id: 'a-' + uid(), kind: 'auto', pinned: true, cat: catOfKind('perso'), title: g.title, goalId: g.id, start: dt(ws, best.t), end: dt(ws, best.t + len), status: '' });
    C.busy.push([best.t, best.t + len]); used.add(best.i); need -= len; n++;
  }
  return n;
}
