// Vues du calendrier (jour / check-liste, 3 jours, semaine, mois, liste) et glisser-déposer.
import { S, occurrences, occByKey, kindOf, colorOf, catById, subjById, commit, moveOcc, setStatus } from './store.js';
import { esc, pad, addDays, dow, weekStart, diffDays, dateOf, timeOf, absMin, dt, durMin, todayKey, nowMin, nowDT, snap, fromMin, DOW, DOWL, MONTHS, MON3, cap, fmtDate, parseD, isoWeek, ICON } from './util.js';
import { openEventEditor, newEventAt } from './editors.js';
import { toast } from './ui.js';

const ACTIONABLE = ['revision', 'sport', 'perso', 'bde', 'autre', 'sortie'];
export const occTitle = ev => {
  const k = kindOf(ev), s = ev.subject && subjById(ev.subject);
  if (k === 'revision' && s) return ev.title && ev.title !== s.name ? `${s.name} · ${ev.title}` : s.name;
  return ev.title || (catById(ev.cat) || {}).name || 'Sans titre';
};
export const isMissed = o => o.ev.kind !== 'course' && !o.status && o.end < nowDT() && ACTIONABLE.includes(kindOf(o.ev));
const visible = o => S.ui.filter[o.ev.cat] !== false;

export function periodDays() {
  const v = S.ui.view, d = S.ui.date;
  if (v === 'day') return [d];
  if (v === '3day') return [d, addDays(d, 1), addDays(d, 2)];
  const w = weekStart(d); return Array.from({ length: 7 }, (_, i) => addDays(w, i));
}
export function periodLabel() {
  const v = S.ui.view, d = S.ui.date, D = parseD(d);
  if (v === 'month') return `${cap(MONTHS[D.getMonth()])} ${D.getFullYear()}`;
  if (v === 'day') return cap(fmtDate(d, true));
  if (v === 'list') return 'Prochains jours';
  const days = periodDays(), a = parseD(days[0]), b = parseD(days[days.length - 1]);
  const same = a.getMonth() === b.getMonth();
  return `${a.getDate()}${same ? '' : ' ' + MON3[a.getMonth()]} – ${b.getDate()} ${MON3[b.getMonth()]}${v === 'week' ? ` · S${isoWeek(days[0])}` : ''}`;
}
export function shift(n) {
  const v = S.ui.view, d = S.ui.date;
  if (v === 'month') { const D = parseD(d); D.setMonth(D.getMonth() + n, 1); S.ui.date = `${D.getFullYear()}-${pad(D.getMonth() + 1)}-01`; }
  else S.ui.date = addDays(d, n * (v === 'day' ? 1 : v === '3day' ? 3 : 7));
}

// chevauchements entre événements « réels » (hors marges, annulés)
export function conflictKeys(list) {
  const out = new Set(); const real = list.filter(o => o.status !== 'skipped' && kindOf(o.ev) !== 'marge');
  for (let i = 0; i < real.length; i++) for (let j = i + 1; j < real.length && real[j].start < real[i].end; j++) {
    if (real[j].start < real[i].end && real[j].end > real[i].start) { out.add(real[i].key); out.add(real[j].key); }
  }
  return out;
}

let G = { hourH: 52, H0: 7, days: [] };   // géométrie de la dernière grille

export function renderCalendar(el) {
  const v = S.ui.view;
  if (v === 'month') return renderMonth(el);
  if (v === 'list') return renderList(el);
  if (v === 'day' && S.data.settings.dayChecklist && !S.ui.dayGrid) return renderChecklist(el);
  renderGrid(el, periodDays());
}

function layout(items) {
  items.sort((a, b) => a.s - b.s || b.e - a.e);
  let cluster = [], end = -1;
  const flush = () => { const n = Math.max(1, ...cluster.map(x => x.lane + 1)); cluster.forEach(x => x.n = n); cluster = []; };
  for (const it of items) {
    if (cluster.length && it.s >= end) flush();
    const used = new Set(cluster.filter(x => x.e > it.s).map(x => x.lane));
    let l = 0; while (used.has(l)) l++; it.lane = l; cluster.push(it); end = Math.max(end, it.e);
  }
  if (cluster.length) flush();
  return items;
}

function renderGrid(el, days) {
  const set = S.data.settings, H0 = set.dayStart, H1 = Math.max(H0 + 4, set.dayEnd), nH = H1 - H0;
  const mobile = innerWidth <= 820, cols = days.length;
  const timeW = mobile ? 30 : 52, colW = (el.clientWidth - timeW) / cols;
  const compact = colW < 118;
  let hourH = mobile ? 46 : 52;
  const fit = set.fit;
  if (fit) hourH = Math.max(13, Math.floor((el.clientHeight - (compact ? 58 : 66)) / nH));
  G = { hourH, H0, days };
  const today = todayKey(), nm = nowMin();
  const occ = occurrences(addDays(days[0], -1), addDays(days[cols - 1], 1)).filter(visible);
  const conflicts = conflictKeys(occ);
  const thin = set.thinRoutines && cols > 1;
  const head = days.map(d => {
    const study = occ.filter(o => o.date === d && kindOf(o.ev) === 'revision').reduce((a, o) => a + durMin(o.start, o.end), 0);
    const pct = Math.min(100, Math.round(study / Math.max(1, set.maxStudy) * 100));
    return `<div class="gh-cell ${d === today ? 'today' : ''} ${dow(d) >= 5 ? 'weekend' : ''}" data-day="${d}"><div class="dow">${DOW[dow(d)]}</div><div class="num">${parseD(d).getDate()}</div><div class="load" title="Révisions : ${Math.round(study / 6) / 10} h"><i style="width:${pct}%"></i></div></div>`;
  }).join('');
  const hours = Array.from({ length: nH }, (_, i) => `<div>${i ? pad(H0 + i) + ':00' : ''}</div>`).join('');
  const nowTop = (nm - H0 * 60) / 60 * hourH;
  const showNow = days.includes(today) && nm >= H0 * 60 && nm < H1 * 60;
  const colsHtml = days.map(d => {
    const items = [];
    for (const o of occ) {
      let s = absMin(o.start, d), e = absMin(o.end, d);
      if (e <= H0 * 60 || s >= H1 * 60 || e <= 0 || s >= 1440) continue;
      s = Math.max(s, H0 * 60, 0); e = Math.min(e, H1 * 60, 1440);
      const k = kindOf(o.ev);
      items.push({ o, s, e, rbar: thin && (k === 'sommeil' || k === 'repas') });
    }
    const placed = layout(items.filter(x => !x.rbar)).concat(items.filter(x => x.rbar));
    const blocks = placed.map(x => evBlock(x, hourH, H0, compact, conflicts)).join('');
    return `<div class="day-col ${d === today ? 'today' : ''} ${dow(d) >= 5 ? 'weekend' : ''}" data-date="${d}" style="height:${nH * hourH}px">${blocks}${showNow && d === today ? `<div class="now-line" style="top:${nowTop}px"></div>` : ''}</div>`;
  }).join('');
  el.innerHTML = `<div class="cal"><div class="grid-scroll ${fit ? 'fit' : ''}"><div class="grid ${compact ? 'compact' : ''} ${hourH < 34 ? 'dense' : ''} ${cols === 1 ? 'single' : ''}" style="--cols:${cols};--hour-h:${hourH}px">
    <div class="gh-cell corner"></div>${head}
    <div class="time-col">${hours}${showNow ? `<span class="now-tag" style="top:${nowTop}px">${fromMin(nm)}</span>` : ''}</div>${colsHtml}</div></div></div>`;
  if (!fit) { const sc = el.querySelector('.grid-scroll'); const target = showNow ? nowTop - 120 : (8 - H0) * hourH; sc.scrollTop = Math.max(0, target); }
}

function evBlock(x, hourH, H0, compact, conflicts) {
  const o = x.o, ev = o.ev, k = kindOf(ev);
  const top = (x.s - H0 * 60) / 60 * hourH, h = Math.max(compact ? 11 : 15, (x.e - x.s) / 60 * hourH - 1);
  const course = ev.kind === 'course';
  const cls = ['ev', course ? 'course' : '', ev.kind === 'auto' ? 'auto' : '', k === 'marge' ? 'soft' : '', o.status === 'done' ? 'done' : '',
    o.status === 'skipped' ? 'skipped' : '', isMissed(o) ? 'missed' : '', conflicts.has(o.key) ? 'conflict' : '',
    h < 36 ? 'short' : '', h < 15 ? 'tiny' : '', x.rbar ? 'rbar' : ''].filter(Boolean).join(' ');
  const style = x.rbar ? `--c:${colorOf(ev)};top:${top}px;height:${h}px`
    : `--c:${colorOf(ev)};top:${top}px;height:${h}px;left:calc(${x.lane / x.n * 100}% + 1px);width:calc(${100 / x.n}% - 2px)`;
  const range = `${timeOf(o.start)}–${timeOf(o.end)}`;
  const subj = ev.subject && subjById(ev.subject);
  const inner = course
    ? `${ev.courseType ? `<div class="k">${esc(ev.courseType)}</div>` : ''}<div class="t">${esc(occTitle(ev))}</div><div class="h">${range}</div>${ev.location ? `<div class="l">${esc(ev.location)}</div>` : ''}`
    : `<div class="t">${esc(occTitle(ev))}${ev.pinned ? '<span class="pin">📌</span>' : ''}</div><div class="h">${range}</div>${ev.location ? `<div class="l">${esc(ev.location)}</div>` : ''}${subj && k === 'examen' ? `<span class="subj" style="--s:${subj.color}"></span>` : ''}`;
  return `<div class="${cls}" data-key="${esc(o.key)}" style="${style}" title="${esc(occTitle(ev) + ' · ' + range + (ev.location ? ' · ' + ev.location : ''))}">${x.rbar ? '' : inner + '<div class="rs"></div>'}</div>`;
}

function renderChecklist(el) {
  const d = S.ui.date, today = todayKey(), nowS = nowDT();
  const list = occurrences(d, addDays(d, 1)).filter(o => o.date === d && visible(o) && kindOf(o.ev) !== 'marge');
  const done = list.filter(o => o.status === 'done').length;
  let nowPlaced = d !== today, rows = '';
  for (const o of list) {
    if (!nowPlaced && o.start > nowS) { rows += `<div class="cl-now"><span>${fromMin(nowMin())}</span></div>`; nowPlaced = true; }
    const ev = o.ev, cur = o.start <= nowS && o.end > nowS;
    rows += `<div class="cl-row ${o.status === 'done' ? 'done' : ''} ${isMissed(o) ? 'missed' : ''} ${o.end <= nowS ? 'past' : ''} ${cur ? 'cur' : ''}" style="--c:${colorOf(ev)}" data-open="${esc(o.key)}">
      <button class="cl-chk" data-chk="${esc(o.key)}" aria-label="Marquer comme fait">${o.status === 'done' ? ICON.check : ''}</button>
      <span class="cl-time">${timeOf(o.start)}</span><span class="cl-bar"></span>
      <div class="cl-main"><div class="cl-t">${esc(occTitle(ev))}${ev.courseType ? ` <span class="cl-k">${esc(ev.courseType)}</span>` : ''}${o.status === 'skipped' ? ' <span class="cl-k">annulé</span>' : ''}</div>
      <div class="cl-s">${timeOf(o.start)}–${timeOf(o.end)}${ev.location ? ' · ' + esc(ev.location) : ''}</div></div></div>`;
  }
  if (!nowPlaced) rows += `<div class="cl-now"><span>${fromMin(nowMin())}</span></div>`;
  const pct = list.length ? Math.round(done / list.length * 100) : 0;
  el.innerHTML = `<div class="checklist"><div class="cl-head"><div><div class="cl-date">${cap(fmtDate(d, true))}</div>
    <div class="cl-prog"><div class="progress"><i style="width:${pct}%"></i></div><span>${done}/${list.length} fait${done > 1 ? 's' : ''}</span>${d === today ? `<span class="cl-clock">${fromMin(nowMin())}</span>` : ''}</div></div>
    <div class="cl-tools"><button class="btn sm" data-act="day-grid">${ICON.grid} Grille</button></div></div>
    <div class="cl-list">${list.length ? rows : '<div class="empty">Rien de prévu ce jour-là. Touche « + » pour ajouter un événement, ou ✨ pour organiser la semaine.</div>'}</div></div>`;
}

function renderMonth(el) {
  const D = parseD(S.ui.date), first = `${D.getFullYear()}-${pad(D.getMonth() + 1)}-01`, start = weekStart(first), today = todayKey();
  const occ = occurrences(start, addDays(start, 42)).filter(o => visible(o) && !['sommeil', 'repas', 'marge'].includes(kindOf(o.ev)));
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = addDays(start, i), list = occ.filter(o => o.date === d), max = innerWidth <= 820 ? 3 : 4;
    return `<div class="mcell ${parseD(d).getMonth() !== D.getMonth() ? 'out' : ''} ${d === today ? 'today' : ''}" data-day="${d}"><div class="n">${parseD(d).getDate()}</div>
      ${list.slice(0, max).map(o => `<div class="mitem" style="--c:${colorOf(o.ev)}" data-open="${esc(o.key)}"><i></i><b>${timeOf(o.start)}</b> ${esc(occTitle(o.ev))}</div>`).join('')}
      ${list.length > max ? `<div class="mmore">+${list.length - max}</div>` : ''}</div>`;
  }).join('');
  el.innerHTML = `<div class="month">${DOW.map(x => `<div class="mh">${x}</div>`).join('')}${cells}</div>`;
}

function renderList(el) {
  const from = S.ui.date, today = todayKey();
  const occ = occurrences(from, addDays(from, 21)).filter(o => visible(o) && !['sommeil', 'marge'].includes(kindOf(o.ev)));
  let html = '';
  for (let i = 0; i < 21; i++) {
    const d = addDays(from, i), list = occ.filter(o => o.date === d); if (!list.length) continue;
    html += `<div class="agenda-day ${d === today ? 'today' : ''}"><h3>${fmtDate(d, true)}</h3>${list.map(o => `<div class="row" style="--c:${colorOf(o.ev)}" data-open="${esc(o.key)}"><span class="bar"></span><span class="time">${timeOf(o.start)}–${timeOf(o.end)}</span><div class="main"><div class="t">${o.status === 'done' ? '✓ ' : ''}${esc(occTitle(o.ev))}</div><div class="s">${esc([o.ev.courseType, o.ev.location, (catById(o.ev.cat) || {}).name].filter(Boolean).join(' · '))}</div></div></div>`).join('')}</div>`;
  }
  el.innerHTML = `<div class="agenda">${html || '<div class="empty">Rien de prévu sur les 3 prochaines semaines.</div>'}</div>`;
}

/* ---------- interactions ---------- */
let D = null, swipe = null;
const minuteAt = (col, y) => G.H0 * 60 + (y - col.getBoundingClientRect().top) / G.hourH * 60;
const colAt = (x, y) => { const e = document.elementFromPoint(x, y); return e && e.closest('.day-col'); };
function tip(x, y, text) { let t = document.querySelector('.drag-tip'); if (!t) { t = document.createElement('div'); t.className = 'drag-tip'; document.body.appendChild(t); } t.style.left = x + 'px'; t.style.top = y + 'px'; t.textContent = text; }
const killTip = () => document.querySelector('.drag-tip')?.remove();

export function initCalendarInteractions(view, rerender) {
  view.addEventListener('pointerdown', e => {
    if (e.button !== 0 || S.ui.page !== 'calendar') return;
    const evEl = e.target.closest('.ev'), col = e.target.closest('.day-col');
    if (!col) return;
    const touch = e.pointerType !== 'mouse';
    if (evEl) {
      const o = occByKey(evEl.dataset.key); if (!o) return;
      D = { mode: evEl.classList.contains('rbar') ? 'click' : (e.target.closest('.rs') ? 'resize' : 'move'), o, el: evEl, col, x0: e.clientX, y0: e.clientY, touch, started: false };
      if (touch && D.mode !== 'click') D.timer = setTimeout(() => { if (D && !D.cancel) { D.started = true; evEl.classList.add('dragging'); navigator.vibrate?.(12); } }, 380);
    } else {
      D = { mode: 'create', col, x0: e.clientX, y0: e.clientY, touch, started: false, m0: snap(minuteAt(col, e.clientY) - 7, 15) };
    }
  });
  window.addEventListener('pointermove', e => {
    if (!D) return;
    const dx = e.clientX - D.x0, dy = e.clientY - D.y0, far = Math.hypot(dx, dy);
    if (!D.started) {
      if (D.touch) { if (far > 8) { clearTimeout(D.timer); D.cancel = true; } return; }
      if (far < 5 || D.mode === 'click') return;
      D.started = true; D.el?.classList.add('dragging');
    }
    const H0 = G.H0, hh = G.hourH;
    if (D.mode === 'create') {
      const m = snap(minuteAt(D.col, e.clientY), 15), a = Math.min(D.m0, m), b = Math.max(D.m0 + 15, m);
      D.a = a; D.b = b;
      let p = D.col.querySelector('.slot-preview'); if (!p) { p = document.createElement('div'); p.className = 'slot-preview'; D.col.appendChild(p); }
      p.style.top = (a - H0 * 60) / 60 * hh + 'px'; p.style.height = (b - a) / 60 * hh + 'px'; p.textContent = `${fromMin(a)}–${fromMin(b)}`;
      return;
    }
    const o = D.o, delta = snap(dy / hh * 60, 15);
    if (D.mode === 'resize') {
      const len = Math.max(15, durMin(o.start, o.end) + delta);
      D.start = o.start; D.end = dt(dateOf(o.start), absMin(o.start, dateOf(o.start)) + len);
      D.el.style.height = Math.max(12, len / 60 * hh - 1) + 'px';
      tip(e.clientX, e.clientY, `${timeOf(D.start)}–${timeOf(D.end)}`);
    } else if (D.mode === 'move') {
      D.el.style.pointerEvents = 'none'; const t = colAt(e.clientX, e.clientY) || D.col; D.el.style.pointerEvents = '';
      if (t !== D.el.parentElement) { t.appendChild(D.el); D.el.style.left = '1px'; D.el.style.width = 'calc(100% - 2px)'; }
      const sAbs = absMin(o.start, o.date) + delta, len = durMin(o.start, o.end);
      D.start = dt(t.dataset.date, sAbs); D.end = dt(t.dataset.date, sAbs + len);
      D.el.style.top = (sAbs - H0 * 60) / 60 * hh + 'px';
      tip(e.clientX, e.clientY, `${DOW[dow(t.dataset.date)]} ${timeOf(D.start)}–${timeOf(D.end)}`);
    }
  });
  document.addEventListener('touchmove', e => { if (D && D.started) e.preventDefault(); }, { passive: false });
  const end = e => {
    if (!D) return; const d = D; D = null; clearTimeout(d.timer); killTip();
    if (e.type === 'pointercancel') { rerender(); return; }
    if (!d.started) {
      if (d.cancel) return;
      if (d.mode === 'create') newEventAt(d.col.dataset.date, Math.max(0, Math.floor(minuteAt(d.col, d.y0) / 30) * 30), 60);
      else openEventEditor(d.o);
      return;
    }
    if (d.mode === 'create') { d.col.querySelector('.slot-preview')?.remove(); newEventAt(d.col.dataset.date, d.a, d.b - d.a); return; }
    if (!d.start || (d.start === d.o.start && d.end === d.o.end)) { rerender(); return; }
    commit(() => moveOcc(d.o, d.start, d.end));
    toast(d.mode === 'resize' ? 'Durée modifiée.' : `Déplacé à ${timeOf(d.start)}.`, { undo: true });
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);

  // balayage horizontal en vue Jour / 3 jours
  view.addEventListener('touchstart', e => { if (S.ui.page === 'calendar' && ['day', '3day'].includes(S.ui.view) && e.touches.length === 1) swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }; }, { passive: true });
  view.addEventListener('touchend', e => {
    if (!swipe || (D && D.started)) { swipe = null; return; }
    const t = e.changedTouches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y; const quick = Date.now() - swipe.t < 600; swipe = null;
    if (quick && Math.abs(dx) > 70 && Math.abs(dy) < 45) { shift(dx < 0 ? 1 : -1); rerender(); }
  });

  view.addEventListener('click', e => {
    if (S.ui.page !== 'calendar') return;
    const chk = e.target.closest('[data-chk]');
    if (chk) { e.stopPropagation(); const o = occByKey(chk.dataset.chk); if (o) commit(() => setStatus(o, o.status === 'done' ? '' : 'done')); return; }
    const open = e.target.closest('[data-open]'); if (open) { const o = occByKey(open.dataset.open); if (o) openEventEditor(o); return; }
    const day = e.target.closest('[data-day]'); if (day) { S.ui.view = 'day'; S.ui.date = day.dataset.day; S.ui.dayGrid = false; rerender(); return; }
    if (e.target.closest('[data-act="day-grid"]')) { S.ui.dayGrid = true; rerender(); }
  });
}
