// Synchronisation PC ↔ téléphone par un Gist secret GitHub.
// Le jeton reste sur l'appareil (clé séparée, jamais envoyée dans le Gist).
// Fusion élément par élément : la modification la plus récente gagne, les suppressions sont mémorisées.
import { S, COLLS, persist, emit } from './store.js';

const CFG_KEY = 'mon-planning-sync';
const FILE = 'mon-planning.json', DESC = 'Mon Planning — synchronisation';
export const SY = { status: 'off', msg: '', last: 0, busy: false, timer: null, dirty: false };
const listeners = new Set();
export const onSyncChange = f => listeners.add(f);
const set = (status, msg = '') => { SY.status = status; SY.msg = msg; listeners.forEach(f => f()); };

export const cfg = () => { try { return JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); } catch (e) { return null; } };
const saveCfg = c => { try { if (c) localStorage.setItem(CFG_KEY, JSON.stringify(c)); else localStorage.removeItem(CFG_KEY); } catch (e) {} };
export const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=Mon%20Planning';

async function api(path, token, opts = {}) {
  const res = await fetch('https://api.github.com' + path, { ...opts, headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' } });
  if (res.status === 401) throw new Error('Code refusé par GitHub : vérifie qu’il est complet et qu’il a la case « gist ».');
  if (!res.ok) throw new Error(`GitHub a répondu ${res.status}. Réessaie dans un moment.`);
  return res.json();
}
async function readGist(token, id) {
  const g = await api('/gists/' + id, token);
  const f = g.files && g.files[FILE]; if (!f) return null;
  const text = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
  return JSON.parse(text);
}

export function merge(local, remote) {
  if (!remote) return local;
  const out = { ...local, deleted: { ...(remote.deleted || {}) } };
  for (const [id, t] of Object.entries(local.deleted || {})) if (!out.deleted[id] || out.deleted[id] < t) out.deleted[id] = t;
  for (const c of COLLS) {
    const map = new Map();
    for (const it of remote[c] || []) map.set(it.id, it);
    for (const it of local[c] || []) { const r = map.get(it.id); if (!r || (it.updatedAt || 0) >= (r.updatedAt || 0)) map.set(it.id, it); }
    out[c] = [...map.values()].filter(it => !(out.deleted[it.id] && out.deleted[it.id] >= (it.updatedAt || 0)));
  }
  out.settings = (remote.settings && (remote.settings.updatedAt || 0) > (local.settings.updatedAt || 0)) ? remote.settings : local.settings;
  // les suppressions de plus de 60 jours sont oubliées
  const old = Date.now() - 60 * 864e5; for (const [id, t] of Object.entries(out.deleted)) if (t < old) delete out.deleted[id];
  return out;
}

export async function connect(token, choice) {
  token = token.trim(); set('syncing', 'Connexion…');
  await api('/user', token);
  const gists = await api('/gists?per_page=100', token);
  const found = gists.find(g => g.description === DESC && g.files && g.files[FILE]);
  if (found && !choice) { set('off'); return { needChoice: true, gistId: found.id }; }
  let gistId = found ? found.id : null;
  if (found && choice === 'cloud') { const remote = await readGist(token, gistId); if (remote) { S.data = merge({ ...remote, deleted: remote.deleted || {} }, remote); persist(); emit(); } }
  else if (found && choice === 'merge') { const remote = await readGist(token, gistId); S.data = merge(S.data, remote); persist(); emit(); }
  if (!gistId) { const g = await api('/gists', token, { method: 'POST', body: JSON.stringify({ description: DESC, public: false, files: { [FILE]: { content: JSON.stringify(S.data) } } }) }); gistId = g.id; }
  saveCfg({ token, gistId });
  await syncNow();
  return { ok: true };
}
export function disconnect() { saveCfg(null); set('off'); }

export async function syncNow() {
  const c = cfg(); if (!c) { set('off'); return; }
  if (SY.busy) { SY.dirty = true; return; }
  SY.busy = true; set('syncing', 'Synchronisation…');
  try {
    const remote = await readGist(c.token, c.gistId);
    const merged = merge(S.data, remote);
    const changedLocal = JSON.stringify(merged) !== JSON.stringify(S.data);
    const changedRemote = JSON.stringify(merged) !== JSON.stringify(remote);
    if (changedLocal) { S.data = merged; localStorage.setItem('mon-planning-v1', JSON.stringify(S.data)); emit(); }
    if (changedRemote) await api('/gists/' + c.gistId, c.token, { method: 'PATCH', body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(merged) } } }) });
    SY.last = Date.now(); set('ok');
  } catch (e) { set('err', e.message || 'Synchronisation impossible (hors ligne ?).'); }
  SY.busy = false;
  if (SY.dirty) { SY.dirty = false; schedulePush(); }
}
export function schedulePush() { if (!cfg()) return; clearTimeout(SY.timer); SY.timer = setTimeout(syncNow, 1500); }

export function initSync() {
  if (!cfg()) { set('off'); return; }
  syncNow();
  setInterval(() => { if (!document.hidden) syncNow(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
  addEventListener('online', syncNow);
}
