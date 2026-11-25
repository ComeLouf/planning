// Import des cours (.ics ou bloc JSON « edt-cours ») et export iCalendar.
import { S, put, del, kindOf, subjectFor, setSetting, occurrences, subjById } from './store.js';
import { uid, norm, dateOf, parisDT, addDays, todayKey, durMin } from './util.js';
import { occTitle } from './calendar.js';

const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
function unescapeText(s) { return s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1'); }

function icsDate(value, params) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  if (!m[4]) return { allDay: true, date: `${m[1]}-${m[2]}-${m[3]}` };
  if (m[7]) return { dt: parisDT(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)))) };
  return { dt: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` };   // heure locale (TZID=Europe/Paris)
}

export function parseICS(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out = []; let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') { if (cur) out.push(cur); cur = null; continue; }
    if (!cur) continue;
    const i = line.indexOf(':'); if (i < 0) continue;
    const [name, ...params] = line.slice(0, i).split(';'); const value = line.slice(i + 1);
    cur[name.toUpperCase()] = { value, params };
  }
  return out.map(e => {
    const s = e.DTSTART && icsDate(e.DTSTART.value), en = e.DTEND && icsDate(e.DTEND.value);
    if (!s || s.allDay || !s.dt) return null;
    return { uid: e.UID ? e.UID.value : '', summary: unescapeText(e.SUMMARY ? e.SUMMARY.value : ''), location: unescapeText(e.LOCATION ? e.LOCATION.value : ''),
      start: s.dt, end: en && en.dt ? en.dt : s.dt };
  }).filter(Boolean);
}

// « [CODE]Matière [TD]Prof » (format De Vinci) → { title, kind, prof }
export function splitCourse(summary) {
  const m = summary.match(/^\s*(?:\[[^\]]*\])?\s*(.*?)\s*\[([^\]]*)\]\s*(.*)$/);
  if (m && m[1]) return { title: m[1].trim(), kind: m[2].trim(), prof: m[3].trim() };
  return { title: summary.trim(), kind: '', prof: '' };
}

const NO_SUBJECT = /réservation|reservation|matière à préciser|matiere a preciser|hackathon|international week/i;

export function importCourses(raw, { from = '', until = '', replace = true, includeRetakes = false } = {}) {
  const st = S.data, today = todayKey();
  const list = raw.filter(c => (!from || dateOf(c.start) >= from) && (!until || dateOf(c.start) <= until));
  if (replace && list.length) {
    const lo = list.reduce((a, c) => c.start < a ? c.start : a, list[0].start).slice(0, 10), hi = list.reduce((a, c) => c.start > a ? c.start : a, list[0].start).slice(0, 10);
    for (const ev of [...st.events]) if (ev.kind === 'course' && dateOf(ev.start) >= lo && dateOf(ev.start) <= hi) del('events', ev.id);
  }
  let n = 0, exams = 0, skipped = 0; const newSubjects = new Set(st.subjects.map(s => s.id));
  for (const c of list) {
    const kind = (c.kind || '').trim(), title = (c.title || '').trim();
    if (!title) continue;
    if (/rattrapage/i.test(kind) && !includeRetakes) { skipped++; continue; }
    const isExam = /examen|^cc$|partiel/i.test(kind);
    const isSport = /^sp$/i.test(kind) || /sport/i.test(title);
    const cat = isExam ? 'examen' : isSport ? 'sport' : /^nr$/i.test(kind) ? 'autre' : 'cours';
    const subject = !isSport && !NO_SUBJECT.test(title) && !/^nr$/i.test(kind) ? subjectFor(title) : '';
    if (isExam && subject && dateOf(c.start) >= today) {
      const s = subjById(subject); if (s && (!s.examDate || s.examDate < today || dateOf(c.start) < s.examDate)) put('subjects', { ...s, examDate: dateOf(c.start) });
      exams++;
    }
    if (isExam && /toefl|toeic/i.test(title) && dateOf(c.start) >= today) setSetting('toeflDate', dateOf(c.start));
    const id = 'c-' + hash(c.uid || title) + '-' + c.start.replace(/\D/g, '');
    put('events', { id, kind: 'course', cat, subject, title, courseType: kind, location: [c.location, c.prof].filter(Boolean).join(' · '), start: c.start, end: c.end > c.start ? c.end : c.start, status: '' });
    n++;
  }
  const created = st.subjects.filter(s => !newSubjects.has(s.id)).length;
  return { n, exams, skipped, created };
}

export function fromICS(text) {
  return parseICS(text).map(e => { const p = splitCourse(e.summary); return { ...p, location: e.location.replace(/\s*\(\d+\)/g, ''), start: e.start, end: e.end, uid: e.uid }; });
}
export function fromJSON(text) {
  const o = JSON.parse(text);
  if (!o || !Array.isArray(o.events)) throw new Error('format');
  return o.events.map(e => ({ title: String(e.title || ''), kind: String(e.kind || ''), location: String(e.location || ''), start: String(e.start || '').slice(0, 16), end: String(e.end || '').slice(0, 16), prof: '' }))
    .filter(e => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(e.start));
}

const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const icsDT = s => s.replace(/[-:]/g, '') + '00';
export function exportICS() {
  const from = addDays(todayKey(), -30), to = addDays(todayKey(), 180);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mon Planning//FR', 'CALSCALE:GREGORIAN',
    'BEGIN:VTIMEZONE', 'TZID:Europe/Paris', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD', 'END:VTIMEZONE'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  for (const o of occurrences(from, to)) {
    if (o.status === 'skipped' || kindOf(o.ev) === 'marge') continue;
    lines.push('BEGIN:VEVENT', `UID:${o.key.replace(/[^a-zA-Z0-9@-]/g, '')}@mon-planning`, `DTSTAMP:${stamp}`, `DTSTART;TZID=Europe/Paris:${icsDT(o.start)}`, `DTEND;TZID=Europe/Paris:${icsDT(o.end)}`,
      `SUMMARY:${icsEsc(occTitle(o.ev))}`);
    if (o.ev.location) lines.push(`LOCATION:${icsEsc(o.ev.location)}`);
    if (o.ev.notes) lines.push(`DESCRIPTION:${icsEsc(o.ev.notes)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
