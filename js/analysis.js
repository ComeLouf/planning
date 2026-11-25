// Bilan de la semaine : ce qui manque, et les heures par catégorie / matière.
import { S, occurrences, kindOf, catById, nextExam } from './store.js';
import { addDays, durMin, diffDays, todayKey, DOW, fmtH, fmtDate, absMin } from './util.js';
import { conflictKeys, occTitle } from './calendar.js';

export function weekStats(ws) {
  const occ = occurrences(ws, addDays(ws, 7)).filter(o => o.status !== 'skipped' && o.date >= ws);
  const byCat = {}, bySubj = {};
  for (const o of occ) {
    const m = durMin(o.start, o.end), k = kindOf(o.ev);
    byCat[o.ev.cat] = (byCat[o.ev.cat] || 0) + m;
    if (k === 'revision' && o.ev.subject) bySubj[o.ev.subject] = (bySubj[o.ev.subject] || 0) + m;
  }
  return { occ, byCat, bySubj };
}

export function subjectTarget(s, ws) {
  const set = S.data.settings, today = todayKey(), base = s.weeklyMin ?? set.revisionDefault;
  const exam = nextExam(s.id, ws > today ? ws : today);
  if (!set.examBoost || !exam) return { target: base, exam };
  const d = diffDays(ws > today ? ws : today, exam);
  return { target: Math.round(base * (d <= 7 ? 2.5 : d <= 14 ? 1.75 : d <= 28 ? 1.25 : 1)), exam };
}

export function analyzeWeek(ws) {
  const st = S.data, items = [], { occ, byCat, bySubj } = weekStats(ws);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i)), today = todayKey();
  const future = d => d >= today;

  // sommeil : nuit qui commence le soir du jour d
  const sleep = st.habits.find(h => h.mode === 'sleep' && h.on !== false);
  if (sleep) {
    const short = [], none = [];
    for (const d of days.filter(future)) {
      const nights = occ.filter(o => kindOf(o.ev) === 'sommeil' && absMin(o.start, d) >= 18 * 60 && absMin(o.start, d) < 30 * 60);
      const m = nights.reduce((a, o) => a + durMin(o.start, o.end), 0);
      if (!nights.length) none.push(DOW[diffDays(ws, d)]); else if (m < 7 * 60) short.push(`${DOW[diffDays(ws, d)]} ${fmtH(m)}`);
    }
    if (short.length) items.push({ lvl: short.some(x => parseFloat(x.split(' ')[1].replace(',', '.')) < 6) ? 'bad' : 'warn', t: 'Nuits trop courtes', d: short.join(', ') + '. Vise au moins 7 h.', act: 'organize' });
    if (none.length) items.push({ lvl: 'warn', t: 'Nuits sans créneau', d: `Pas de sommeil prévu : ${none.join(', ')}`, act: 'organize' });
  }
  // repas
  const meals = st.habits.filter(h => h.on !== false && kindOf({ cat: h.cat }) === 'repas').length;
  if (meals) {
    const miss = days.filter(d => d > today).filter(d => occ.filter(o => o.date === d && kindOf(o.ev) === 'repas').length < meals).map(d => DOW[diffDays(ws, d)]);
    if (miss.length) items.push({ lvl: 'warn', t: 'Repas sans créneau', d: miss.join(', '), act: 'organize' });
  }
  // sport et habitudes « x fois par semaine »
  for (const h of st.habits.filter(h => h.on !== false && h.mode === 'weekly')) {
    const k = kindOf({ cat: h.cat }), n = new Set(occ.filter(o => kindOf(o.ev) === k).map(o => o.date)).size;
    if (n < h.perWeek) items.push({ lvl: 'warn', t: `${h.name} : ${n}/${h.perWeek} séances`, d: `Il manque ${h.perWeek - n} séance${h.perWeek - n > 1 ? 's' : ''} cette semaine.`, act: 'organize' });
  }
  // objectifs perso
  for (const g of st.goals.filter(g => g.weeklyMin && !g.done)) {
    const m = occ.filter(o => o.ev.goalId === g.id).reduce((a, o) => a + durMin(o.start, o.end), 0);
    if (m < g.weeklyMin) items.push({ lvl: 'info', t: `Objectif « ${g.title} »`, d: `${fmtH(m)} prévues sur ${fmtH(g.weeklyMin)}.`, act: 'goals' });
  }
  // matières
  for (const s of st.subjects.filter(s => !s.archived)) {
    const { target, exam } = subjectTarget(s, ws), m = bySubj[s.id] || 0;
    if (!target || m >= target) continue;
    const soon = exam && diffDays(today, exam) <= 14;
    items.push({ lvl: soon ? 'bad' : 'warn', t: `${s.name} peu révisée`, d: `${fmtH(m)} sur ${fmtH(target)}${exam ? ` · examen ${fmtDate(exam)}` : ''}.`, act: 'organize' });
  }
  // conflits
  const conf = conflictKeys(occ.filter(o => future(o.date)));
  if (conf.size) {
    const names = [...new Set(occ.filter(o => conf.has(o.key)).map(o => `${DOW[diffDays(ws, o.date)]} ${occTitle(o.ev)}`))].slice(0, 6);
    items.push({ lvl: 'bad', t: `${Math.ceil(conf.size / 2)} conflit${conf.size > 2 ? 's' : ''} d'horaire`, d: names.join(', ') + '. Déplace un des deux, ou coche « Pas fait / annulé ».', act: 'calendar' });
  }
  // infos à compléter
  const noExam = st.subjects.filter(s => !s.archived && !nextExam(s.id, today)).map(s => s.name);
  if (noExam.length) items.push({ lvl: 'info', t: 'Dates d’examen manquantes', d: noExam.slice(0, 6).join(', ') + (noExam.length > 6 ? '…' : '') + '. Les révisions ne peuvent pas se concentrer avant l’examen.', act: 'settings' });
  const noDue = st.tasks.filter(t => t.status !== 'done' && !t.due).length;
  if (noDue) items.push({ lvl: 'info', t: `${noDue} tâche${noDue > 1 ? 's' : ''} sans échéance`, d: 'Ajoute une date pour qu’elles soient planifiées.', act: 'tasks' });
  if (!st.events.some(e => e.kind === 'course')) items.push({ lvl: 'info', t: 'Aucun cours importé', d: 'Importe ton emploi du temps (.ics) dans Réglages › Importer des cours.', act: 'import' });

  const rank = { bad: 0, warn: 1, info: 2 };
  items.sort((a, b) => rank[a.lvl] - rank[b.lvl]);
  if (!items.length) items.push({ lvl: 'ok', t: 'Rien ne manque', d: 'Ta semaine est équilibrée.' });
  return { items, byCat, bySubj, occ };
}

// objectif d'heures par catégorie pour la semaine
export function catTargets(ws) {
  const st = S.data, t = {};
  const rev = st.categories.find(c => c.kind === 'revision');
  if (rev) t[rev.id] = st.subjects.filter(s => !s.archived).reduce((a, s) => a + subjectTarget(s, ws).target, 0);
  for (const h of st.habits.filter(h => h.on !== false)) {
    const n = h.mode === 'weekly' ? h.perWeek : h.days.length;
    t[h.cat] = (t[h.cat] || 0) + n * h.dur;
  }
  const perso = st.categories.find(c => c.kind === 'perso');
  if (perso) t[perso.id] = (t[perso.id] || 0) + st.goals.filter(g => !g.done).reduce((a, g) => a + (g.weeklyMin || 0), 0);
  return t;
}
