/* Pengurus Templat RPH (master prompt §23, §24, §72): salin, nama semula, padam, susun medan,
   sembunyi/tunjuk ikut varian, sunting label (ms/ar/jawi), medan tersuai, pratonton susunan. Simpan automatik. */
(function (RPH) {
  'use strict';
  const { h, icon, button, confirm, toast, clear, empty, tabs, select, checkboxGroup } = RPH.ui;
  const U = RPH.util;
  const K = () => RPH.adminKit;
  const st = () => RPH.store;

  const state = { id: null, pv: 'standard', allLangs: false };
  const VARIANTS = [{ id: 'compact', label: 'Ringkas', short: 'R' }, { id: 'standard', label: 'Standard', short: 'S' }, { id: 'detailed', label: 'Terperinci', short: 'T' }];
  const LANGS = [{ value: 'ms', label: 'Melayu (Rumi)' }, { value: 'ar', label: 'Arab' }, { value: 'jawi', label: 'Jawi' }];
  const CUSTOM_TYPES = [
    { value: 'text', label: 'Teks (satu baris)' }, { value: 'textarea', label: 'Teks panjang (textarea)' },
    { value: 'checkbox', label: 'Kotak semak (pilih banyak)' }, { value: 'select', label: 'Pilihan (pilih satu)' }, { value: 'number', label: 'Nombor' },
  ];
  const TYPE_LABEL = { static: 'statik', text: 'teks', list: 'senarai', 'activity-list': 'aktiviti', 'activity-phases': 'fasa aktiviti', 'sk-select': 'SK', 'sp-select': 'SP', 'theme-select': 'tema', checkbox: 'kotak semak', 'multi-select': 'pilihan berbilang', select: 'pilihan', differentiation: 'pembezaan', reflection: 'refleksi', postponement: 'penangguhan', 'tasmik-detail': 'butiran tasmik', number: 'nombor' };

  // ------------------------------------------------------------------ Susunan medan
  /** Susunan induk: gabungan susunan semua varian (varian terpanjang dahulu) + medan yang tiada dalam mana-mana varian. */
  function masterOrder(t) {
    const keys = (t.fields || []).map(f => f.key);
    const master = [];
    const place = (arr) => arr.forEach((k, i) => {
      if (master.includes(k)) return;
      const prev = arr.slice(0, i).reverse().find(p => master.includes(p));
      master.splice(prev ? master.indexOf(prev) + 1 : 0, 0, k);
    });
    Object.values(t.variants || {}).sort((a, b) => b.length - a.length).forEach(place);
    place(keys);
    return master.filter(k => keys.includes(k));
  }
  function normalize(t) {
    const order = masterOrder(t);
    t.fields.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    syncVariants(t);
  }
  function syncVariants(t) {
    for (const v of Object.keys(t.variants || {})) { const set = new Set(t.variants[v]); t.variants[v] = t.fields.filter(f => set.has(f.key)).map(f => f.key); }
  }
  const ordered = t => { const order = masterOrder(t); return (t.fields || []).slice().sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)); };
  function mutate(id, fn, quiet) {
    st().update('templates', d => { const t = d[id]; if (!t) throw new Error('Templat tiada.'); normalize(t); fn(t, d); t.updatedAt = U.nowIso(); });
    if (!quiet) draw();
  }

  const labelOf = (f, lang) => (f.label ? (f.label[lang] || f.label.ms || f.label.ar || f.label.jawi || f.key) : f.key);
  const usedBy = id => ({ subjects: st().subjects().filter(s => s.defaultTemplateId === id), rph: st().rphList().filter(r => r.templateId === id).length });

  // ------------------------------------------------------------------ Tindakan templat
  async function duplicate(t) {
    const nm = (t.name && t.name.ms) || t.id;
    const yr = nm.match(/\b(20\d\d)\b/);
    const suggest = yr ? nm.replace(yr[1], String(+yr[1] + 1)) : `${nm} ${+st().activeYear() + 1}`;
    const name = await RPH.ui.prompt({ title: 'Salin templat', label: 'Nama templat baharu', value: suggest });
    if (name == null || !name.trim()) return;
    const all = st().get('templates') || {};
    const id = K().uniqueId(`tpl-${U.slug(name.trim()) || 'baharu'}`, x => !!all[x]);
    const copy = { ...U.clone(t), id, name: { ...(t.name || {}), ms: name.trim() }, editable: true, copiedFrom: t.id, createdAt: U.nowIso(), source: `Salinan daripada ${t.id}` };
    normalize(copy);
    st().update('templates', d => { d[id] = copy; });
    state.id = id;
    toast(`Templat "${name.trim()}" dicipta.`, 'success'); draw();
  }
  async function rename(t) {
    const name = await RPH.ui.prompt({ title: 'Nama semula templat', label: 'Nama (Bahasa Melayu)', value: (t.name && t.name.ms) || '' });
    if (name == null || !name.trim()) return;
    mutate(t.id, x => { x.name = { ...(x.name || {}), ms: name.trim() }; });
    toast('Nama templat dikemas kini.', 'success');
  }
  async function remove(t) {
    const u = usedBy(t.id);
    if (u.subjects.length) return toast(`Tidak boleh dipadam: templat lalai bagi ${u.subjects.map(s => s.name.ms).join(', ')}. Tukar templat lalai subjek dahulu.`, 'error', 7000);
    if (u.rph) return toast(`Tidak boleh dipadam: ${u.rph} RPH menggunakan templat ini.`, 'error', 6000);
    if (st().templates().length <= 1) return toast('Sekurang-kurangnya satu templat diperlukan.', 'error');
    if (!(await confirm({ title: 'Padam templat', danger: true, confirmLabel: 'Padam', message: `Padam templat "${t.name.ms}"?` }))) return;
    st().update('templates', d => { delete d[t.id]; });
    state.id = null; toast('Templat dipadam.', 'success'); draw();
  }

  // ------------------------------------------------------------------ Medan tersuai (§24)
  function camelKey(label) {
    const parts = U.slug(label).split('-').filter(Boolean);
    let k = parts.map((p, i) => (i ? p[0].toUpperCase() + p.slice(1) : p)).join('');
    if (!k) k = 'medan';
    if (/^\d/.test(k)) k = `m${k}`;
    return k;
  }
  function customFieldForm(t, existing) {
    const isNew = !existing;
    const keys = new Set(t.fields.map(f => f.key));
    if (!isNew) keys.delete(existing.key);
    const variants = Object.keys(t.variants || {});
    let keyTouched = !isNew;
    const bankOpts = Object.values(st().get('banks') || {}).map(b => ({ value: b.id, label: (b.title && b.title.ms) || b.id }));
    const ex = existing || {};
    const exType = ex.type === 'text' && ex.multiline ? 'textarea' : ex.type;
    const m = K().formModal({ title: isNew ? 'Tambah medan tersuai' : `Sunting medan "${labelOf(ex, 'ms')}"`, size: 'md',
      intro: 'Medan tersuai dipaparkan dalam editor RPH, pratonton, cetakan dan DOCX ikut susunan templat.',
      values: { ms: ex.label && ex.label.ms, ar: ex.label && ex.label.ar, jawi: ex.label && ex.label.jawi, key: ex.key || '', type: exType || 'text', source: ex.bank ? ex.bank : 'list', options: ex.options || [], variants: isNew ? variants : variants.filter(v => (t.variants[v] || []).includes(ex.key)), required: !!ex.required },
      fields: [
        { key: 'ms', label: 'Label (Bahasa Melayu)', required: true, placeholder: 'cth. Catatan Guru', onChange: (v, c) => { if (!keyTouched && isNew) { let k = camelKey(v), base = k, n = 2; while (keys.has(k)) k = `${base}${n++}`; c.key.set(k); } } },
        { key: 'ar', label: 'Label (Arab)', dir: 'rtl' },
        { key: 'jawi', label: 'Label (Jawi)', dir: 'rtl' },
        { key: 'key', label: 'Kunci medan', required: true, readonly: !isNew, hint: 'Dijana automatik daripada label. Huruf/nombor sahaja.', onChange: () => { keyTouched = true; } },
        { key: 'type', label: 'Jenis medan', type: 'select', options: CUSTOM_TYPES, onChange: (v, c) => toggleOpts(c, v) },
        { key: 'source', label: 'Sumber pilihan', type: 'select', options: [{ value: 'list', label: 'Senarai sendiri' }, ...bankOpts.map(b => ({ value: b.value, label: `Bank: ${b.label}` }))], onChange: (v, c) => toggleOpts(c, c.type.get()) },
        { key: 'options', label: 'Pilihan (satu baris satu pilihan)', type: 'lines', rows: 4, full: true },
        { key: 'variants', label: 'Papar dalam varian', type: 'checks', full: true, options: variants.map(v => ({ value: v, label: (VARIANTS.find(x => x.id === v) || {}).label || v })) },
        { key: 'required', type: 'checkbox', text: 'Wajib diisi (disemak sebelum eksport)' },
      ],
      onSave(v) {
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(v.key)) return 'Kunci medan mesti bermula dengan huruf dan hanya mengandungi huruf/nombor.';
        if (keys.has(v.key)) return `Kunci "${v.key}" sudah digunakan dalam templat ini.`;
        const choice = v.type === 'checkbox' || v.type === 'select';
        if (choice && v.source === 'list' && !v.options.length) return 'Masukkan sekurang-kurangnya satu pilihan.';
        const label = { ms: v.ms }; if (v.ar) label.ar = v.ar; if (v.jawi) label.jawi = v.jawi;
        const f = { ...(isNew ? {} : U.clone(ex)), key: v.key, type: v.type === 'textarea' ? 'text' : v.type, label, custom: true };
        if (v.type === 'textarea') f.multiline = true; else delete f.multiline;
        delete f.options; delete f.bank;
        if (choice) { if (v.source === 'list') f.options = v.options; else f.bank = v.source; if (v.type === 'select') f.allowOther = true; }
        if (v.required) f.required = true; else delete f.required;
        mutate(t.id, x => {
          const i = x.fields.findIndex(z => z.key === (isNew ? null : ex.key));
          if (i >= 0) x.fields[i] = f; else x.fields.push(f);
          for (const vv of Object.keys(x.variants)) {
            x.variants[vv] = x.variants[vv].filter(k => k !== f.key);
            if (v.variants.includes(vv)) x.variants[vv].push(f.key);
          }
          syncVariants(x);
        });
        toast(isNew ? `Medan "${v.ms}" ditambah di hujung templat. Guna ↑ ↓ untuk menyusun.` : 'Medan disimpan.', 'success', 5000);
      } });
    function toggleOpts(c, type) {
      const choice = type === 'checkbox' || type === 'select';
      c.source.el.closest('.field').classList.toggle('adm-hidden', !choice);
      c.options.el.closest('.field').classList.toggle('adm-hidden', !choice || c.source.get() !== 'list');
    }
    toggleOpts(m.ctrls, m.ctrls.type.get());
  }
  async function removeField(t, f) {
    if (!(await confirm({ title: 'Padam medan', danger: true, confirmLabel: 'Padam', message: `Padam medan tersuai "${labelOf(f, 'ms')}"? Nilai medan ini dalam RPH sedia ada tidak akan dipaparkan lagi.` }))) return;
    mutate(t.id, x => { x.fields = x.fields.filter(z => z.key !== f.key); for (const v of Object.keys(x.variants)) x.variants[v] = x.variants[v].filter(k => k !== f.key); });
    toast('Medan dipadam.', 'success');
  }

  // ------------------------------------------------------------------ Paparan
  let root = null, alive = () => false;

  function listPane(all) {
    return h('aside', { class: 'card adm-tpl-list' }, h('div', { class: 'card-head' }, h('h2', null, `Templat (${all.length})`)),
      h('div', { class: 'adm-tpl-items' }, all.map(t => {
        const u = usedBy(t.id);
        const alt = t.name && (t.name.ar || t.name.jawi);
        return h('button', { type: 'button', class: ['adm-tpl-item', t.id === state.id ? 'is-on' : null], onClick: () => { state.id = t.id; draw(); }, 'aria-pressed': String(t.id === state.id) },
          h('div', { class: 'strong' }, (t.name && t.name.ms) || t.id),
          alt ? h('div', { class: 'adm-tpl-alt' }, K().rtl(alt, t.name.ar ? 'arabic' : 'jawi')) : null,
          h('div', { class: 'pill-list adm-gap-sm' },
            h('span', { class: 'badge badge-slate' }, `${(t.fields || []).length} medan`),
            h('span', { class: 'badge badge-slate' }, (t.labelLang || 'ms').toUpperCase()),
            u.subjects.length ? h('span', { class: 'badge badge-green' }, `Lalai: ${u.subjects.map(s => s.code || s.id).join(', ')}`) : null,
            (t.fields || []).some(f => f.custom) ? h('span', { class: 'badge badge-violet' }, 'Medan tersuai') : null));
      })));
  }

  function metaCard(t) {
    const set = (fn, msg) => { mutate(t.id, fn, true); toast(msg || 'Disimpan.', 'success', 1500); drawPreview(); };
    const nameIn = (lang, dir) => RPH.ui.input({ value: (t.name && t.name[lang]) || '', dir, onChange: v => set(x => { x.name = { ...(x.name || {}) }; if (v.trim()) x.name[lang] = v.trim(); else if (lang !== 'ms') delete x.name[lang]; }, 'Nama disimpan.') });
    const subjOpts = [{ value: '*', label: 'Semua subjek' }, ...st().subjects().map(s => ({ value: s.id, label: s.name.ms }))];
    return RPH.ui.card({ title: 'Maklumat templat', subtitle: t.source ? `Sumber: ${t.source}` : null,
      actions: [
        button('Salin', { size: 'sm', icon: 'copy', onClick: () => duplicate(t) }),
        button('Nama semula', { size: 'sm', icon: 'edit', onClick: () => rename(t) }),
        button('Padam', { size: 'sm', icon: 'trash', kind: 'danger', onClick: () => remove(t) }),
      ],
      body: h('div', { class: 'stack' },
        h('div', { class: 'form-grid' },
          RPH.ui.field('Nama (Melayu)', nameIn('ms')), RPH.ui.field('Nama (Arab)', nameIn('ar', 'rtl')), RPH.ui.field('Nama (Jawi)', nameIn('jawi', 'rtl')),
          RPH.ui.field('Bahasa label', select({ options: LANGS, value: t.labelLang || 'ms', onChange: v => set(x => { x.labelLang = v; }) })),
          RPH.ui.field('Arah', select({ options: [{ value: 'ltr', label: 'LTR (kiri ke kanan)' }, { value: 'rtl', label: 'RTL (kanan ke kiri)' }], value: t.direction || 'ltr', onChange: v => set(x => { x.direction = v; }) })),
          RPH.ui.field('Varian lalai', select({ options: Object.keys(t.variants || {}).map(v => ({ value: v, label: (VARIANTS.find(x => x.id === v) || {}).label || v })), value: t.defaultVariant || 'standard', onChange: v => set(x => { x.defaultVariant = v; }) }))),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Untuk subjek'),
          checkboxGroup({ options: subjOpts, values: t.subjectIds || [], onChange: vals => set(x => { x.subjectIds = vals; }, 'Subjek templat disimpan.') }))) });
  }

  function fieldsCard(t) {
    const variants = VARIANTS.filter(v => (t.variants || {})[v.id]);
    const missing = VARIANTS.filter(v => !(t.variants || {})[v.id]);
    const list = ordered(t);
    const altLang = t.labelLang && t.labelLang !== 'ms' ? t.labelLang : null;
    const move = (i, d) => mutate(t.id, x => { const j = i + d; if (j < 0 || j >= x.fields.length) return; [x.fields[i], x.fields[j]] = [x.fields[j], x.fields[i]]; syncVariants(x); });
    const toggle = (key, v, on) => mutate(t.id, x => { const arr = x.variants[v] || (x.variants[v] = []); const i = arr.indexOf(key); if (on && i < 0) arr.push(key); if (!on && i >= 0) arr.splice(i, 1); syncVariants(x); });
    const setLabel = (key, lang, val) => { mutate(t.id, x => { const f = x.fields.find(z => z.key === key); f.label = { ...(f.label || {}) }; if (val.trim()) f.label[lang] = val.trim(); else delete f.label[lang]; }, true); toast('Label disimpan.', 'success', 1200); drawPreview(); };
    let dragFrom = null;
    const rows = list.map((f, i) => {
      const langs = state.allLangs ? ['ms', 'ar', 'jawi'] : ['ms', ...(altLang ? [altLang] : []), ...['ar', 'jawi'].filter(l => l !== altLang && f.label && f.label[l])];
      const tr = h('tr', { class: ['adm-field-row', f.custom ? 'is-custom' : null], draggable: 'true', dataset: { i: String(i) } },
        h('td', { class: 'adm-order' }, h('span', { class: 'adm-drag', title: 'Seret untuk menyusun', 'aria-hidden': 'true' }, '⋮⋮'),
          h('div', { class: 'adm-updown' },
            h('button', { type: 'button', class: 'btn btn-sm adm-ibtn', title: 'Naik', 'aria-label': `Naikkan ${f.key}`, disabled: i === 0, onClick: () => move(i, -1) }, '↑'),
            h('button', { type: 'button', class: 'btn btn-sm adm-ibtn', title: 'Turun', 'aria-label': `Turunkan ${f.key}`, disabled: i === list.length - 1, onClick: () => move(i, 1) }, '↓'))),
        h('td', null, h('div', { class: 'strong adm-key' }, f.key),
          h('div', { class: 'pill-list adm-gap-xs' }, h('span', { class: 'badge badge-slate' }, TYPE_LABEL[f.type] || f.type), f.multiline ? h('span', { class: 'badge badge-slate' }, 'panjang') : null,
            f.custom ? h('span', { class: 'badge badge-violet' }, 'tersuai') : null, f.auto ? h('span', { class: 'badge badge-blue' }, 'auto') : null, f.required ? h('span', { class: 'badge badge-amber' }, 'wajib') : null,
            f.bank ? h('span', { class: 'badge badge-green' }, `bank: ${f.bank}`) : null)),
        h('td', { class: 'adm-labels' }, langs.map(l => h('label', { class: 'adm-label-in' }, h('span', { class: 'adm-lang' }, l), RPH.ui.input({ value: (f.label && f.label[l]) || '', dir: l === 'ms' ? 'ltr' : 'rtl', cls: 'input-sm', onChange: v => setLabel(f.key, l, v) })))),
        variants.map(v => { const on = (t.variants[v.id] || []).includes(f.key); const cb = h('input', { type: 'checkbox', checked: on, 'aria-label': `${f.key} dalam varian ${v.label}`, onChange: () => toggle(f.key, v.id, cb.checked) }); return h('td', { class: 'adm-vcol' }, cb); }),
        h('td', { class: 'adm-actions-cell' }, f.custom ? h('div', { class: 'row adm-tight' }, K().iconBtn('edit', 'Sunting medan', () => customFieldForm(t, f)), K().iconBtn('trash', 'Padam medan', () => removeField(t, f), 'danger'))
          : h('span', { class: 'muted small', title: 'Medan asas tidak boleh dipadam — sembunyikan dengan nyahtanda varian.' }, 'asas')));
      tr.addEventListener('dragstart', e => { dragFrom = i; tr.classList.add('is-drag'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(i)); } catch (_) { /* abaikan */ } });
      tr.addEventListener('dragend', () => tr.classList.remove('is-drag'));
      tr.addEventListener('dragover', e => { if (dragFrom != null) { e.preventDefault(); tr.classList.add('is-over'); } });
      tr.addEventListener('dragleave', () => tr.classList.remove('is-over'));
      tr.addEventListener('drop', e => {
        e.preventDefault(); tr.classList.remove('is-over');
        const from = dragFrom; dragFrom = null;
        if (from == null || from === i) return;
        mutate(t.id, x => { const [f2] = x.fields.splice(from, 1); x.fields.splice(i, 0, f2); syncVariants(x); });
      });
      return tr;
    });
    return RPH.ui.card({ title: 'Medan templat', subtitle: 'Susun dengan ↑ ↓ (atau seret), sembunyikan ikut varian, sunting label. Perubahan disimpan automatik.',
      actions: [
        missing.length ? button(`Tambah varian ${missing[0].label}`, { size: 'sm', icon: 'plus', onClick: () => mutate(t.id, x => { const base = x.variants.standard || Object.values(x.variants)[0] || x.fields.map(f => f.key); x.variants[missing[0].id] = [...base]; syncVariants(x); }) }) : null,
        (() => { const cb = h('input', { type: 'checkbox', checked: state.allLangs, onChange: () => { state.allLangs = cb.checked; draw(); } }); return h('label', { class: 'check small', title: 'Papar input label Melayu, Arab dan Jawi bagi setiap medan' }, cb, h('span', null, 'Semua bahasa label')); })(),
        button('Tambah Medan Tersuai', { size: 'sm', kind: 'primary', icon: 'plus', onClick: () => customFieldForm(t, null) }),
      ].filter(Boolean),
      body: h('div', { class: 'table-wrap' }, h('table', { class: 'table adm-fields-table' },
        h('thead', null, h('tr', null, h('th', null, 'Susun'), h('th', null, 'Medan'), h('th', null, 'Label'), variants.map(v => h('th', { class: 'adm-vcol', title: v.label }, v.label)), h('th', null, ''))),
        h('tbody', null, rows))) });
  }

  let previewHost = null, curT = null;
  function drawPreview() {
    if (!previewHost || !curT) return;
    const t = st().template(curT) ; if (!t) return;
    clear(previewHost);
    const vs = Object.keys(t.variants || {});
    if (!vs.includes(state.pv)) state.pv = t.defaultVariant && vs.includes(t.defaultVariant) ? t.defaultVariant : vs[0];
    const keys = (t.variants || {})[state.pv] || [];
    const byKey = Object.fromEntries((t.fields || []).map(f => [f.key, f]));
    const lang = t.labelLang || 'ms';
    const rtl = t.direction === 'rtl';
    previewHost.append(
      tabs(vs.map(v => ({ id: v, label: (VARIANTS.find(x => x.id === v) || {}).label || v })), state.pv, v => { state.pv = v; drawPreview(); }),
      h('div', { class: 'adm-pv-caption' }, `${(t.name && t.name.ms) || t.id} · ${(VARIANTS.find(x => x.id === state.pv) || {}).label || state.pv}`),
      h('div', { class: 'adm-preview', dir: rtl ? 'rtl' : 'ltr' },
        keys.map((k, i) => {
          const f = byKey[k]; if (!f) return null;
          const lbl = labelOf(f, lang);
          if (f.type === 'static') return h('div', { class: 'adm-pv-static' }, K().rtl(lbl, lang === 'jawi' ? 'jawi' : 'arabic'));
          return h('div', { class: ['adm-pv-row', f.custom ? 'is-custom' : null] }, h('span', { class: 'adm-pv-n' }, String(i + 1)), h('span', { class: 'adm-pv-label' }, K().rtl(lbl, lang === 'jawi' ? 'jawi' : 'arabic')), h('span', { class: 'adm-pv-val' }, '…'));
        })),
      h('p', { class: 'muted small' }, `${keys.length} medan dipaparkan dalam varian ini.`));
  }

  function draw() {
    if (!alive()) return;
    clear(root);
    const all = st().templates();
    if (!st().template(state.id)) state.id = all[0] && all[0].id;
    const t = st().template(state.id);
    root.append(RPH.ui.pageHeader('Templat RPH', 'Bina templat sendiri: salin, susun medan, sembunyikan medan ikut varian dan tambah medan tersuai.', [
      t ? button('Salin Templat', { icon: 'copy', onClick: () => duplicate(t) }) : null,
    ]));
    if (!t) { root.appendChild(K().emptyImport ? K().emptyImport('Tiada templat RPH. Import templat RPH sekolah anda (JSON/DOCX), atau pulihkan backup yang mengandungi templat.', 'templat', button('Tetapan → Data', { icon: 'settings', onClick: () => RPH.router.go('tetapan', null, { tab: 'data' }) })) : empty('Tiada templat.')); return; }
    curT = t.id;
    previewHost = h('div', { class: 'stack' });
    root.appendChild(h('div', { class: 'adm-tpl-layout' },
      listPane(all),
      h('div', { class: 'adm-tpl-main' }, metaCard(t), fieldsCard(t)),
      h('aside', { class: 'adm-tpl-preview' }, RPH.ui.card({ title: 'Pratonton susunan', subtitle: 'Kemas kini serta-merta', body: previewHost }))));
    drawPreview();
  }

  RPH.views.templat = {
    title: 'Templat', icon: 'template',
    render(el, params) {
      root = el; alive = K().mount(el, 'templat');
      if (params && params.id) state.id = params.id;
      draw();
    },
    _masterOrder: masterOrder,
  };
})(window.RPH = window.RPH || {});
