/* UI kit: pembina DOM selamat (tiada innerHTML untuk data), ikon, toast, modal, borang. */
(function (RPH) {
  'use strict';
  const U = RPH.util;

  /** h('div', {class, style:{}, onClick, dataset:{}, dir, ...}, ...children) */
  function h(tag, attrs, ...children) {
    const el = tag === 'frag' ? document.createDocumentFragment() : (tag.startsWith('svg:') ? document.createElementNS('http://www.w3.org/2000/svg', tag.slice(4)) : document.createElement(tag));
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { children.unshift(attrs); attrs = null; }
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : v);
      else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value' && 'value' in el) el.value = v;
      else if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'multiple') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    append(el, children);
    return el;
  }
  function append(el, children) {
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  const clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  // Ikon garis ringkas (SVG 24×24).
  const ICONS = {
    dashboard: 'M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z',
    wand: 'M15 4V2m0 14v-2M8 9h2m10 0h2M17.8 11.8 19 13M15 9h.01M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5',
    week: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm3 10h2m4 0h2m-8 4h2',
    list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    chart: 'M3 3v18h18M7 16v-4m5 4V8m5 8v-6',
    book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15zM6.5 17A2.5 2.5 0 0 0 4 19.5 2.5 2.5 0 0 0 6.5 22H20v-5',
    layers: 'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
    file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5',
    clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
    calendar: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    template: 'M3 3h18v6H3zM3 13h8v8H3zM15 13h6v8h-6z',
    archive: 'M21 8v13H3V8M1 3h22v5H1zM10 12h4',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
    plus: 'M12 5v14M5 12h14', edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z', trash: 'M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1', download: 'M12 3v12m0 0 5-5m-5 5-5-5M4 21h16', upload: 'M12 21V9m0 0 5 5m-5-5-5 5M4 3h16',
    print: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
    check: 'M20 6 9 17l-5-5', x: 'M18 6 6 18M6 6l12 12', info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
    alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
    left: 'M15 18l-6-6 6-6', right: 'M9 18l6-6-6-6', search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
    star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z', refresh: 'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15',
    eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', menu: 'M3 6h18M3 12h18M3 18h18',
    subject: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
    forward: 'M5 12h14M13 5l7 7-7 7', up: 'M18 15l-6-6-6 6', down: 'M6 9l6 6 6-6', bank: 'M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3',
  };
  function icon(name, size = 18) {
    const svg = h('svg:svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'icon' });
    svg.appendChild(h('svg:path', { d: ICONS[name] || ICONS.info }));
    return svg;
  }

  /** Teks dengan arah automatik: Arab/Jawi → span dir=rtl. */
  function txt(s, { lang } = {}) {
    if (s == null) return '';
    if (U.isArabicScript(s)) return h('span', { dir: 'rtl', lang: lang || 'ar', class: 'ar' }, s);
    return document.createTextNode(String(s));
  }

  // ---------- Toast ----------
  function toast(msg, type = 'info', ms = 3200) {
    let host = document.getElementById('toasts');
    if (!host) { host = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.appendChild(host); }
    const t = h('div', { class: ['toast', `toast-${type}`], role: type === 'error' ? 'alert' : 'status' }, icon(type === 'error' ? 'alert' : type === 'success' ? 'check' : 'info'), h('span', null, msg));
    host.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
  }

  // ---------- Modal ----------
  function modal({ title, body, actions = [], size = 'md', onClose } = {}) {
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    const box = h('div', { class: ['modal', `modal-${size}`], role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' },
      h('div', { class: 'modal-head' }, h('h3', null, title || ''), h('button', { class: 'btn-icon', 'aria-label': 'Tutup', onClick: close }, icon('x'))),
      h('div', { class: 'modal-body' }, body),
      actions.length ? h('div', { class: 'modal-foot' }, actions.map(a => h('button', { class: ['btn', a.kind ? `btn-${a.kind}` : ''], onClick: async () => { const r = await a.onClick?.(); if (r !== false) close(); } }, a.icon ? icon(a.icon) : null, a.label))) : null);
    const back = h('div', { class: 'modal-back', onMousedown: e => { if (e.target === back) close(); } }, box);
    document.body.appendChild(back);
    document.addEventListener('keydown', onKey);
    setTimeout(() => (box.querySelector('input,select,textarea,button.btn-primary') || box).focus(), 30);
    return { close, el: box };
  }
  function confirm({ title = 'Pengesahan', message, confirmLabel = 'Ya, teruskan', danger = false } = {}) {
    return new Promise(res => {
      let done = false;
      modal({ title, body: h('p', { class: 'confirm-msg' }, message), size: 'sm', onClose: () => { if (!done) res(false); },
        actions: [{ label: 'Batal', onClick: () => { done = true; res(false); } }, { label: confirmLabel, kind: danger ? 'danger' : 'primary', onClick: () => { done = true; res(true); } }] });
    });
  }
  function prompt({ title, label, value = '', placeholder = '' }) {
    return new Promise(res => {
      let done = false; const inp = h('input', { class: 'input', value, placeholder });
      modal({ title, size: 'sm', body: h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), inp), onClose: () => { if (!done) res(null); },
        actions: [{ label: 'Batal', onClick: () => { done = true; res(null); } }, { label: 'OK', kind: 'primary', onClick: () => { done = true; res(inp.value); } }] });
    });
  }

  // ---------- Status ----------
  const STATUS = { draft: ['Draft', 'slate'], siap: ['Siap', 'blue'], selesai: ['Selesai', 'green'], ditangguhkan: ['Ditangguhkan', 'amber'], dibawa: ['Dibawa ke minggu seterusnya', 'orange'], cuti: ['Cuti', 'red'], program: ['Program Sekolah', 'violet'], peperiksaan: ['Peperiksaan', 'rose'] };
  function badge(status, label) { const s = STATUS[status] || [label || status, 'slate']; return h('span', { class: ['badge', `badge-${s[1]}`] }, label || s[0]); }
  function chip(text, kind = 'slate') { return h('span', { class: ['badge', `badge-${kind}`] }, txt(text)); }

  // ---------- Borang ----------
  function field(label, control, hint) {
    return h('label', { class: 'field' }, label ? h('span', { class: 'field-label' }, label) : null, control, hint ? h('span', { class: 'field-hint' }, hint) : null);
  }
  function input({ value = '', type = 'text', placeholder = '', onInput, onChange, dir, cls, ...rest } = {}) {
    const el = h('input', { class: ['input', cls], type, value: value ?? '', placeholder, dir: dir || (U.isArabicScript(value) ? 'rtl' : null), ...rest });
    if (onInput) el.addEventListener('input', () => onInput(type === 'number' ? (el.value === '' ? null : +el.value) : el.value, el));
    if (onChange) el.addEventListener('change', () => onChange(type === 'number' ? (el.value === '' ? null : +el.value) : el.value, el));
    if (!dir) el.addEventListener('input', () => { el.dir = U.isArabicScript(el.value) ? 'rtl' : 'ltr'; });
    return el;
  }
  function textarea({ value = '', rows = 3, placeholder = '', onInput, dir, cls } = {}) {
    const el = h('textarea', { class: ['input', cls], rows, placeholder, dir: dir || (U.isArabicScript(value) ? 'rtl' : 'auto') });
    el.value = value ?? '';
    if (onInput) el.addEventListener('input', () => onInput(el.value, el));
    if (!dir) el.addEventListener('input', () => { el.dir = U.isArabicScript(el.value) ? 'rtl' : 'ltr'; });
    return el;
  }
  /** options: [{value,label}] atau ['a','b'] */
  function select({ options = [], value, onChange, placeholder, cls, dir } = {}) {
    const el = h('select', { class: ['input', cls], dir });
    if (placeholder != null) el.appendChild(h('option', { value: '' }, placeholder));
    for (const o of options) {
      const opt = typeof o === 'object' ? o : { value: o, label: o };
      el.appendChild(h('option', { value: opt.value, selected: String(opt.value) === String(value ?? ''), disabled: opt.disabled }, opt.label));
    }
    if (onChange) el.addEventListener('change', () => onChange(el.value, el));
    return el;
  }
  function checkboxGroup({ options = [], values = [], onChange, cls } = {}) {
    const set = new Set(values);
    return h('div', { class: ['check-group', cls] }, options.map(o => {
      const cb = h('input', { type: 'checkbox', checked: set.has(o.value) });
      cb.addEventListener('change', () => { cb.checked ? set.add(o.value) : set.delete(o.value); onChange && onChange([...set]); });
      return h('label', { class: 'check' }, cb, h('span', null, txt(o.label)));
    }));
  }
  function button(label, { kind, icon: ic, onClick, title, disabled, size } = {}) {
    return h('button', { class: ['btn', kind ? `btn-${kind}` : '', size ? `btn-${size}` : ''], onClick, title, disabled, type: 'button' }, ic ? icon(ic) : null, label ? h('span', null, label) : null);
  }

  // ---------- Susun atur ----------
  function pageHeader(title, subtitle, actions = []) {
    return h('header', { class: 'page-head' }, h('div', null, h('h1', null, title), subtitle ? h('p', { class: 'muted' }, subtitle) : null), h('div', { class: 'page-actions' }, actions));
  }
  function card({ title, subtitle, actions = [], body, cls } = {}) {
    return h('section', { class: ['card', cls] },
      title || actions.length ? h('div', { class: 'card-head' }, h('div', null, title ? h('h2', null, title) : null, subtitle ? h('p', { class: 'muted small' }, subtitle) : null), h('div', { class: 'card-actions' }, actions)) : null,
      h('div', { class: 'card-body' }, body));
  }
  function empty(message, action) { return h('div', { class: 'empty' }, icon('info', 28), h('p', null, message), action || null); }
  /** columns: [{key,label,render?(row),cls}] */
  function table(columns, rows, { onRowClick, cls, emptyText = 'Tiada data.' } = {}) {
    if (!rows.length) return empty(emptyText);
    return h('div', { class: 'table-wrap' }, h('table', { class: ['table', cls] },
      h('thead', null, h('tr', null, columns.map(c => h('th', { class: c.cls }, c.label)))),
      h('tbody', null, rows.map(r => h('tr', { class: onRowClick ? 'clickable' : null, onClick: onRowClick ? () => onRowClick(r) : null },
        columns.map(c => h('td', { class: c.cls }, c.render ? c.render(r) : txt(r[c.key]))))))));
  }
  function tabs(items, active, onSelect) {
    return h('div', { class: 'tabs', role: 'tablist' }, items.map(t => h('button', { class: ['tab', t.id === active ? 'active' : ''], role: 'tab', 'aria-selected': String(t.id === active), onClick: () => onSelect(t.id) }, t.label)));
  }
  function stat(label, value, sub, kind) { return h('div', { class: ['stat', kind ? `stat-${kind}` : ''] }, h('div', { class: 'stat-value' }, value), h('div', { class: 'stat-label' }, label), sub ? h('div', { class: 'stat-sub' }, sub) : null); }

  // ---------- Fail ----------
  function pickFile(accept = '.json') {
    return new Promise(res => {
      const inp = h('input', { type: 'file', accept, style: { display: 'none' } });
      inp.addEventListener('change', () => { const f = inp.files[0]; inp.remove(); if (!f) return res(null); const r = new FileReader(); r.onload = () => res({ name: f.name, text: r.result }); r.onerror = () => res(null); r.readAsText(f); });
      document.body.appendChild(inp); inp.click();
    });
  }
  function pickImage() {
    return new Promise(res => {
      const inp = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
      inp.addEventListener('change', () => { const f = inp.files[0]; inp.remove(); if (!f) return res(null); const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
      document.body.appendChild(inp); inp.click();
    });
  }

  // ---------- Perubahan belum disimpan (§68) ----------
  let dirty = false;
  function setDirty(v) { dirty = v; }
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  RPH.ui = { h, append, clear, icon, txt, toast, modal, confirm, prompt, badge, chip, STATUS, field, input, textarea, select, checkboxGroup, button, pageHeader, card, empty, table, tabs, stat, pickFile, pickImage, setDirty, isDirty: () => dirty };
})(window.RPH = window.RPH || {});
