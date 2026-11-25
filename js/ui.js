// Modales et messages.
import { esc, ICON } from './util.js';
import { undo } from './store.js';

let modalStack = 0;
export function openModal({ title = '', body = '', foot = '', wide = false, titleInput = null, onMount }) {
  const root = document.getElementById('modal-root');
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><span class="grab"></span>${titleInput != null ? `<input class="title-input" id="m-title" value="${esc(titleInput)}" placeholder="${esc(title)}" aria-label="${esc(title)}">` : `<h2 style="flex:1">${esc(title)}</h2>`}
    <button class="btn icon ghost" data-close aria-label="Fermer">${ICON.x}</button></div>
    <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
  root.appendChild(bg); modalStack++;
  const close = () => { if (!bg.isConnected) return; bg.remove(); modalStack--; };
  bg.addEventListener('pointerdown', e => { if (e.target === bg) bg._down = true; });
  bg.addEventListener('click', e => { if (e.target === bg && bg._down) close(); bg._down = false; if (e.target.closest('[data-close]')) close(); });
  bg.close = close;
  if (onMount) onMount(bg.querySelector('.modal'), close);
  const f = bg.querySelector('#m-title') || bg.querySelector('input,select,textarea');
  if (f && matchMedia('(hover: hover)').matches) setTimeout(() => f.focus(), 30);
  return bg;
}
export const closeTopModal = () => { const all = document.querySelectorAll('.modal-bg'); const top = all[all.length - 1]; if (top) { top.close(); return true; } return false; };
export const hasModal = () => modalStack > 0;

export function toast(msg, opts = {}) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div'); el.className = 'toast';
  el.innerHTML = `<span>${esc(msg)}</span>${opts.undo ? '<button type="button">Annuler</button>' : ''}${opts.action ? `<button type="button" data-act>${esc(opts.action.label)}</button>` : ''}`;
  root.appendChild(el);
  const kill = () => el.remove();
  el.querySelector('button:not([data-act])')?.addEventListener('click', () => { undo(); kill(); });
  el.querySelector('[data-act]')?.addEventListener('click', () => { opts.action.fn(); kill(); });
  setTimeout(kill, opts.undo || opts.action ? 6000 : 3200);
}

// bouton qui demande une confirmation par un second clic
export function armButton(btn, fn, label = 'Confirmer') {
  btn.addEventListener('click', () => {
    if (btn.dataset.armed) { fn(); return; }
    btn.dataset.armed = '1'; const old = btn.textContent; btn.textContent = label; btn.classList.add('primary');
    setTimeout(() => { delete btn.dataset.armed; btn.textContent = old; btn.classList.remove('primary'); }, 3500);
  });
}
