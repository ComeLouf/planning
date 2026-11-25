// Outils communs : dates « à l'horloge » (chaînes AAAA-MM-JJ et AAAA-MM-JJTHH:MM), texte, icônes.
// Toutes les heures sont des heures de Paris telles qu'affichées : pas de calcul en millisecondes,
// donc rien ne bouge aux changements d'heure.

export const pad = n => String(n).padStart(2, '0');
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const norm = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const dkey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return dkey(d); };
export const dow = s => (parseD(s).getDay() + 6) % 7;             // 0 = lundi
export const weekStart = s => addDays(s, -dow(s));
export const diffDays = (a, b) => Math.round((parseD(b) - parseD(a)) / 864e5);
export const toMin = t => { const [h, m] = String(t).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export const fromMin = m => `${pad(Math.floor(m / 60) % 24)}:${pad(((m % 60) + 60) % 60)}`;
export const dt = (date, min) => { const k = Math.floor(min / 1440); return `${addDays(date, k)}T${fromMin(min - k * 1440)}`; };
export const dateOf = s => s.slice(0, 10);
export const timeOf = s => s.slice(11, 16);
export const absMin = (s, base) => diffDays(base, dateOf(s)) * 1440 + toMin(timeOf(s));   // minutes depuis minuit de « base »
export const durMin = (start, end) => absMin(end, dateOf(start)) - toMin(timeOf(start));
export const todayKey = () => dkey(new Date());
export const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
export const nowDT = () => `${todayKey()}T${fromMin(nowMin())}`;
export const snap = (m, step = 15) => Math.round(m / step) * step;

export const DOW = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
export const DOWL = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
export const DOW1 = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
export const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const MON3 = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
export const hm = t => t.replace(':', 'h');
export const fmtDate = (s, long) => { const d = parseD(s); return long ? `${DOWL[dow(s)]} ${d.getDate()} ${MONTHS[d.getMonth()]}` : `${DOW[dow(s)]} ${d.getDate()} ${MON3[d.getMonth()]}`; };
export const fmtDur = min => { min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return h ? (m ? `${h} h ${pad(m)}` : `${h} h`) : `${m} min`; };
export const fmtH = min => { const v = Math.round(min / 6) / 10; return `${String(v).replace('.', ',')} h`; };
export const isoWeek = s => { const d = parseD(s); const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 864e5 + 1) / 7); };
export const relDays = s => { const n = diffDays(todayKey(), s); return n === 0 ? "aujourd'hui" : n === 1 ? 'demain' : n === -1 ? 'hier' : n > 0 ? `dans ${n} j` : `il y a ${-n} j`; };

// heure de Paris d'un instant UTC (pour les .ics en « Z »)
let tzFmt = null;
try { tzFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); } catch (e) {}
export const parisDT = date => {
  if (!tzFmt) return `${dkey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const p = {}; for (const x of tzFmt.formatToParts(date)) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}T${pad(+p.hour % 24)}:${p.minute}`;
};

export function download(name, text, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}

const P = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON = {
  today: P('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  cal: P('<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>'),
  tasks: P('<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>'),
  goal: P('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'),
  chart: P('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  settings: P('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  plus: P('<path d="M12 5v14M5 12h14"/>'),
  menu: P('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  left: P('<path d="m15 18-6-6 6-6"/>'),
  right: P('<path d="m9 18 6-6-6-6"/>'),
  spark: P('<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
  check: P('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  x: P('<path d="M6 6l12 12M18 6 6 18"/>'),
  grid: P('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>'),
  list: P('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  undo: P('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  sync: P('<path d="M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8"/><path d="M21 4v5h-5M3 20v-5h5"/>'),
};
