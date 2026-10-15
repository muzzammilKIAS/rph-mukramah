/* Pengurusan Subjek (master prompt §6, §7, §73).
   Fail ini juga mendaftar RPH.adminKit — pembantu kecil yang dikongsi oleh paparan pentadbiran
   (subjek, dskp, rpt, jadual, takwim, templat, bank, tetapan). Dimuatkan dahulu dalam index.html. */
(function (RPH) {
  'use strict';
  const { h, icon, button, modal, confirm, toast, textarea, select, checkboxGroup, clear, empty } = RPH.ui;
  const U = RPH.util;

  // =====================================================================
  // Kit pentadbiran dikongsi
  // =====================================================================
  const kit = {
    /** Teks Arab/Jawi → span RTL dengan fon Naskh; teks Rumi → nod teks. */
    rtl(text, script) {
      if (text == null || text === '') return '';
      if (!U.isArabicScript(text)) return document.createTextNode(String(text));
      const jawi = script === 'jawi';
      return h('span', { dir: 'rtl', lang: jawi ? 'ms-Arab' : 'ar', class: jawi ? 'jawi' : 'ar' }, String(text));
    },
    /** Teks campuran (Melayu + Arab) — arah ditentukan pelayar. */
    mixed(text, tag = 'span', cls) { return h(tag, { dir: 'auto', class: ['adm-mixed', cls] }, text == null ? '' : String(text)); },
    /** Pengawal: lukisan semula hanya jika paparan masih aktif. */
    mount(el, viewId) {
      const tok = U.uid('v'); el.dataset.admView = tok;
      return () => el.isConnected && el.dataset.admView === tok && RPH.router.current().view === viewId;
    },
    /** Tetapkan pemboleh ubah CSS (Object.assign pada el.style tidak menyokong --pembolehubah). */
    cssVar(el, name, value) { if (value) el.style.setProperty(name, value); return el; },
    dot(color) { return h('span', { class: 'subject-dot', style: { background: color || '#94a3b8' } }); },
    subjectLabel(s) {
      if (!s) return '';
      const alt = s.name && (s.name.ar || s.name.jawi);
      return h('span', { class: 'adm-subj-name' }, kit.dot(s.color), h('span', null, (s.name && s.name.ms) || s.id),
        alt ? h('span', { class: 'muted' }, ' · ', kit.rtl(alt, s.name.ar ? 'arabic' : 'jawi')) : null);
    },
    subjectOptions(filter) { return RPH.store.subjects().filter(filter || (() => true)).map(s => ({ value: s.id, label: `${(s.name && s.name.ms) || s.id} (${s.code || s.id})` })); },
    uniqueId(base, exists) { let id = base, n = 2; while (exists(id)) id = `${base}-${n++}`; return id; },
    kv(pairs) {
      return h('dl', { class: 'kv' }, pairs.filter(p => p && p[1] != null && p[1] !== '').map(([k, v]) => [h('dt', null, k), h('dd', null, v instanceof Node ? v : kit.mixed(v))]));
    },
    setOptions(sel, options, value, placeholder) {
      clear(sel);
      if (placeholder != null) sel.appendChild(h('option', { value: '' }, placeholder));
      for (const o of options) { const opt = typeof o === 'object' ? o : { value: o, label: o }; sel.appendChild(h('option', { value: opt.value, selected: String(opt.value) === String(value ?? '') }, opt.label)); }
    },
    downloadJson(filename, data) {
      U.download(filename, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      toast(`Fail ${filename} dimuat turun.`, 'success');
    },
    /** Paparan ralat import (§87): "Format fail tidak sah" + senarai medan bermasalah. */
    errorsModal(errors, { title = 'Format fail tidak sah', intro } = {}) {
      const list = errors.slice(0, 80);
      modal({ title, size: 'md', actions: [{ label: 'Tutup', kind: 'primary' }],
        body: h('div', { class: 'stack' },
          h('div', { class: 'notice notice-error' }, icon('alert'), h('div', null, h('strong', null, 'Format fail tidak sah'), intro ? h('div', { class: 'small' }, intro) : null)),
          h('ul', { class: 'adm-errlist' }, list.map(e => h('li', { dir: 'auto' }, e))),
          errors.length > list.length ? h('p', { class: 'muted small' }, `… dan ${errors.length - list.length} ralat lagi.`) : null) });
    },
    /** pickFile + JSON.parse; ralat parse dipaparkan. → {name, json} | null */
    async readJson(accept = '.json,application/json') {
      const f = await RPH.ui.pickFile(accept);
      if (!f) return null;
      try { return { name: f.name, json: JSON.parse(f.text) }; }
      catch (e) { kit.errorsModal([`Fail "${f.name}" bukan JSON yang sah: ${e.message}`]); return null; }
    },
    /**
     * Borang dalam modal. fields: [{key,label,type,options,required,readonly,full,hint,dir,placeholder,rows,
     *   suggestions, onChange(value, ctrls), render(values)/get (type 'custom')}]
     * type: text|textarea|number|date|time|color|select|checkbox|checks|lines|codes|list|heading|custom|info
     * onSave(values) → string|string[] (ralat; modal kekal) | false | apa-apa lain (tutup). Boleh async.
     */
    formModal({ title, size = 'md', fields, values = {}, onSave, saveLabel = 'Simpan', intro, extraActions = [] }) {
      const ctrls = {};
      const errBox = h('div', { class: 'notice notice-error adm-hidden', role: 'alert' });
      const grid = h('div', { class: 'form-grid adm-form' });
      const datalists = [];
      for (const f of fields) {
        if (f.type === 'heading') { grid.appendChild(h('div', { class: 'adm-full adm-form-heading' }, f.label)); continue; }
        if (f.type === 'info') { grid.appendChild(h('div', { class: ['adm-full', 'notice', 'notice-info'] }, icon('info'), h('div', null, f.label))); continue; }
        const v = values[f.key];
        let c, get, set;
        const t = f.type || 'text';
        if (t === 'textarea') { c = textarea({ value: v ?? '', rows: f.rows || 3, placeholder: f.placeholder || '', dir: f.dir }); get = () => c.value.trim(); set = x => { c.value = x ?? ''; }; }
        else if (t === 'lines') { c = textarea({ value: (v || []).join('\n'), rows: f.rows || 3, placeholder: f.placeholder || '', dir: f.dir }); get = () => c.value.split('\n').map(s => s.trim()).filter(Boolean); }
        else if (t === 'codes') { c = RPH.ui.input({ value: (v || []).join(', '), placeholder: f.placeholder || 'cth. 1.1, 2.1', dir: 'ltr' }); get = () => c.value.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean); set = x => { c.value = (x || []).join(', '); }; }
        else if (t === 'list') { c = RPH.ui.input({ value: (v || []).join(', '), placeholder: f.placeholder || '' }); get = () => c.value.split(',').map(s => s.trim()).filter(Boolean); }
        else if (t === 'select') { c = select({ options: f.options || [], value: v ?? '', placeholder: f.placeholder }); get = () => c.value; set = x => { c.value = x ?? ''; }; }
        else if (t === 'checkbox') { const cb = h('input', { type: 'checkbox', checked: !!v }); c = h('label', { class: 'check' }, cb, h('span', null, f.text || f.label)); c.cb = cb; get = () => cb.checked; set = x => { cb.checked = !!x; }; }
        else if (t === 'checks') { let cur = [...(v || [])]; c = checkboxGroup({ options: f.options || [], values: cur, onChange: x => { cur = x; f.onChange && f.onChange(cur, ctrls); } }); get = () => cur; }
        else if (t === 'number') { c = RPH.ui.input({ type: 'number', value: v ?? '', placeholder: f.placeholder || '', min: f.min, max: f.max, step: f.step }); get = () => (c.value === '' ? null : +c.value); set = x => { c.value = x ?? ''; }; }
        else if (t === 'custom') { c = f.render(values, ctrls); get = f.get || (() => undefined); }
        else { c = RPH.ui.input({ type: t, value: v ?? '', placeholder: f.placeholder || '', dir: f.dir }); get = () => String(c.value).trim(); set = x => { c.value = x ?? ''; }; }
        if (f.readonly) { if ('readOnly' in c) c.readOnly = true; if (c.tagName === 'SELECT') c.disabled = true; c.classList && c.classList.add('adm-readonly'); }
        if (f.suggestions && c.tagName === 'INPUT') { const id = U.uid('dl'); datalists.push(h('datalist', { id }, f.suggestions.map(s => h('option', { value: s })))); c.setAttribute('list', id); }
        if (f.onChange && t !== 'checks') { const evt = (t === 'select' || t === 'checkbox' || t === 'date' || t === 'time' || t === 'color') ? 'change' : 'input'; c.addEventListener(evt, () => f.onChange(get(), ctrls)); }
        ctrls[f.key] = { el: c, get, set, def: f };
        const labelable = ['text', 'textarea', 'number', 'date', 'time', 'color', 'select', 'lines', 'codes', 'list', 'email', 'tel', 'url'].includes(t);
        const lbl = f.label && t !== 'checkbox' ? h('span', { class: 'field-label' }, f.label, f.required ? h('span', { class: 'adm-req' }, ' *') : null) : null;
        grid.appendChild(h(labelable ? 'label' : 'div', { class: ['field', f.full ? 'adm-full' : null, f.cls] }, lbl, c, f.hint ? h('span', { class: 'field-hint' }, f.hint) : null));
      }
      grid.addEventListener('input', () => RPH.ui.setDirty(true));
      grid.addEventListener('change', () => RPH.ui.setDirty(true));
      const collect = () => Object.fromEntries(Object.entries(ctrls).filter(([, c]) => c.get).map(([k, c]) => [k, c.get()]));
      const showErr = errs => {
        clear(errBox); errBox.classList.remove('adm-hidden');
        errBox.append(icon('alert'), h('div', null, (Array.isArray(errs) ? errs : [errs]).map(e => h('div', null, e))));
        errBox.scrollIntoView({ block: 'nearest' });
      };
      const m = modal({ title, size, onClose: () => RPH.ui.setDirty(false),
        body: h('div', { class: 'stack' }, intro ? (intro instanceof Node ? intro : h('p', { class: 'muted small adm-intro' }, intro)) : null, errBox, grid, datalists),
        actions: [...extraActions, { label: 'Batal' }, { label: saveLabel, kind: 'primary', icon: 'check', onClick: async () => {
          const vals = collect();
          const missing = fields.filter(f => f.required && f.key && ctrls[f.key] && (vals[f.key] == null || vals[f.key] === '' || (Array.isArray(vals[f.key]) && !vals[f.key].length))).map(f => `Medan "${f.label}" wajib diisi.`);
          if (missing.length) { showErr(missing); return false; }
          try {
            const r = await onSave(vals, ctrls);
            if (r === false) return false;
            if (typeof r === 'string' || (Array.isArray(r) && r.length)) { showErr(r); return false; }
          } catch (e) { showErr(e.message || String(e)); return false; }
          RPH.ui.setDirty(false);
          return true;
        } }] });
      return { ...m, ctrls, showErr };
    },
    /** Butang ikon kecil dengan tooltip. */
    iconBtn(name, title, onClick, kind) { return h('button', { type: 'button', class: ['btn', 'btn-sm', 'adm-ibtn', kind ? `btn-${kind}` : null], title, 'aria-label': title, onClick }, icon(name, 15)); },
    /** Tahun dalam kurikulum (BA-3 → [3]) untuk subjek. */
    yearsOf(s) { return ((s && s.years) || []).slice().sort((a, b) => a - b); },
    allSlots(yearId) { return ((RPH.store.get('timetable', yearId) || {}).versions || []).flatMap(v => (v.slots || []).map(s => ({ ...s, versionId: v.id }))); },
    /** Butang "Import" ke paparan Import Data (#/import?jenis=<kind>) — null jika paparan itu tiada. */
    importBtn(kind, label = 'Import', btnKind = null) { return RPH.onboarding ? RPH.onboarding.importButton(kind, { label, kind: btnKind, size: null }) : null; },
    /** Keadaan kosong dengan butang Import Data + tindakan lain (null dilangkau). */
    emptyImport(message, kind, ...actions) {
      const imp = kit.importBtn(kind, kind ? `Import ${IMPORT_LABEL[kind] || kind}` : 'Import Data', 'primary');
      const acts = actions.filter(Boolean);
      // Jika butang import ada, tindakan lain menjadi sekunder.
      if (imp) acts.forEach(b => b.classList && b.classList.remove('btn-primary'));
      return empty(message, h('div', { class: 'row rphv-empty-actions' }, imp, acts,
        RPH.onboarding ? button('Mula di sini', { icon: 'list', onClick: () => RPH.router.go('dashboard', null, { setup: 1 }) }) : null));
    },
  };
  const IMPORT_LABEL = { takwim: 'Takwim', jadual: 'Jadual', kelas: 'Senarai Kelas', subjek: 'Subjek', dskp: 'DSKP', rpt: 'RPT', templat: 'Templat' };
  RPH.adminKit = kit;

  // =====================================================================
  // Paparan: Pengurusan Subjek
  // =====================================================================
  const LANGS = [
    { value: 'arabic', label: 'Bahasa Arab' }, { value: 'malay-jawi', label: 'Bahasa Melayu (Jawi)' },
    { value: 'malay', label: 'Bahasa Melayu (Rumi)' }, { value: 'english', label: 'Bahasa Inggeris' }, { value: 'other', label: 'Lain-lain' },
  ];
  const DIRS = [{ value: 'ltr', label: 'Kiri ke kanan (LTR)' }, { value: 'rtl', label: 'Kanan ke kiri (RTL)' }, { value: 'mixed', label: 'Campuran' }];
  const SCRIPTS = [{ value: 'arabic', label: 'Arab' }, { value: 'jawi', label: 'Jawi' }, { value: 'rumi', label: 'Rumi' }, { value: 'latin', label: 'Latin (lain)' }];
  const label = (arr, v) => (arr.find(x => x.value === v) || {}).label || v || '—';

  const noDskp = s => s.noDskp === true || (s.noDskp !== false && /tiada dskp/i.test(s.curriculumNote || ''));

  function yearStatus(s) {
    const st = RPH.store;
    return kit.yearsOf(s).map(y => {
      const c = st.curriculum(s.id, y); const r = st.rpt(s.id, y);
      let sk = 0, sp = 0;
      if (c) for (const d of c.domains || []) for (const k of d.contentStandards || []) { sk++; sp += (k.learningStandards || []).length; }
      return { year: y, curr: c, rpt: r, sk, sp, currKey: st.curriculumId(s.id, y) };
    });
  }

  /** Senarai semak aliran §73. state: done | todo | na */
  function stepsFor(s) {
    const st = RPH.store;
    const ys = yearStatus(s);
    const slots = kit.allSlots().filter(x => x.subjectId === s.id);
    const tplOk = s.defaultTemplateId && st.template(s.defaultTemplateId);
    const nd = noDskp(s);
    const withCurr = ys.filter(y => y.curr).map(y => `T${y.year}`);
    const withRpt = ys.filter(y => y.rpt).map(y => `T${y.year}`);
    const steps = [
      { id: 'add', label: 'Tambah Subjek', state: 'done', detail: s.code || s.id },
      { id: 'dskp', label: 'Import DSKP', state: nd ? 'na' : withCurr.length ? 'done' : 'todo', detail: nd ? 'Tiada DSKP' : withCurr.join(', ') || 'Belum', go: () => RPH.router.go('dskp', null, { subject: s.id }) },
      { id: 'rpt', label: 'Import RPT', state: nd ? 'na' : withRpt.length ? 'done' : 'todo', detail: nd ? 'Dirancang guru' : withRpt.join(', ') || 'Belum', go: () => RPH.router.go('rpt', null, { subject: s.id }) },
      { id: 'jadual', label: 'Assign Jadual', state: slots.length ? 'done' : 'todo', detail: slots.length ? `${slots.length} slot` : 'Belum', go: () => RPH.router.go('jadual') },
      { id: 'tpl', label: 'Pilih Templat', state: tplOk ? 'done' : 'todo', detail: tplOk ? ((st.template(s.defaultTemplateId).name || {}).ms || s.defaultTemplateId) : 'Belum' },
    ];
    steps.push({ id: 'siap', label: 'Siap', state: steps.every(x => x.state !== 'todo') ? 'done' : 'todo', detail: steps.every(x => x.state !== 'todo') ? 'Sedia dijana' : `${steps.filter(x => x.state === 'todo').length} langkah lagi` });
    return steps;
  }

  function checklist(s, onTpl) {
    return h('ol', { class: 'adm-steps' }, stepsFor(s).map((st, i) => {
      const go = st.id === 'tpl' ? onTpl : st.go;
      const mark = st.state === 'done' ? icon('check', 13) : st.state === 'na' ? '–' : String(i + 1);
      return h('li', { class: ['adm-step', `is-${st.state}`] },
        h('span', { class: 'adm-step-mark', 'aria-hidden': 'true' }, mark),
        h('span', { class: 'adm-step-text' },
          go && st.state !== 'na' ? h('a', { href: '#', onClick: e => { e.preventDefault(); go(); } }, st.label) : h('span', null, st.label),
          h('span', { class: 'adm-step-detail' }, st.detail)));
    }));
  }

  function yearTiles(s) {
    return h('div', { class: 'adm-years' }, yearStatus(s).map(y => h('div', {
      class: 'adm-year', title: `Tahun ${y.year}: DSKP ${y.curr ? `ada (${y.sk} SK, ${y.sp} SP; kunci ${y.currKey})` : 'tiada'} · RPT ${y.rpt ? 'ada' : 'tiada'}`,
    }, h('strong', null, `T${y.year}`),
      h('span', { class: ['adm-flag', y.curr ? 'on' : null] }, 'DSKP'),
      h('span', { class: ['adm-flag', y.rpt ? 'on' : null] }, 'RPT'))));
  }

  function usage(s) {
    const slots = kit.allSlots().filter(x => x.subjectId === s.id).length;
    const rph = RPH.store.rphList({ subjectId: s.id }).length;
    const defaultOf = RPH.store.subjects().filter(x => x.curriculumFrom === s.id).map(x => x.id);
    return { slots, rph, sharedBy: defaultOf };
  }

  function subjectForm(s, done) {
    const isNew = !s;
    s = s || { years: [1, 2, 3, 4, 5, 6], direction: 'ltr', language: 'malay', script: 'rumi', color: '#0f766e', name: {} };
    const st = RPH.store;
    const tplOpts = st.templates().map(t => ({ value: t.id, label: `${(t.name && t.name.ms) || t.id}` }));
    const yearOpts = [...new Set([1, 2, 3, 4, 5, 6, ...(s.years || [])])].sort((a, b) => a - b).map(y => ({ value: y, label: `Tahun ${y}` }));
    const mapping = () => {
      if (isNew) return h('p', { class: 'muted small' }, 'Simpan subjek dahulu, kemudian import DSKP dan RPT bagi setiap tahun.');
      const rows = yearStatus(s);
      return h('div', { class: 'table-wrap' }, h('table', { class: 'table adm-table-compact' },
        h('thead', null, h('tr', null, ['Tahun', 'DSKP (kunci)', 'RPT', 'Tindakan'].map(x => h('th', null, x)))),
        h('tbody', null, rows.map(y => h('tr', null,
          h('td', null, `Tahun ${y.year}`),
          h('td', null, y.curr ? h('span', { class: 'badge badge-green' }, `Ada · ${y.sk} SK / ${y.sp} SP`) : h('span', { class: 'badge badge-slate' }, 'Tiada'), ' ', h('span', { class: 'muted small' }, y.currKey)),
          h('td', null, y.rpt ? h('span', { class: 'badge badge-green' }, 'Ada') : h('span', { class: 'badge badge-slate' }, 'Tiada')),
          h('td', null, h('div', { class: 'row' },
            button(y.curr ? 'Lihat DSKP' : 'Import DSKP', { size: 'sm', icon: 'book', onClick: () => { m.close(); RPH.router.go('dskp', null, { subject: s.id, year: y.year }); } }),
            button(y.rpt ? 'Lihat RPT' : 'Import RPT', { size: 'sm', icon: 'layers', onClick: () => { m.close(); RPH.router.go('rpt', null, { subject: s.id, year: y.year }); } }))))))));
    };
    const m = kit.formModal({
      title: isNew ? 'Tambah Subjek' : `Sunting Subjek — ${(s.name && s.name.ms) || s.id}`, size: 'lg',
      values: {
        id: s.id, code: s.code, timetableLabel: s.timetableLabel, nameMs: s.name && s.name.ms, nameAr: s.name && s.name.ar, nameJawi: s.name && s.name.jawi,
        language: s.language, direction: s.direction, script: s.script, years: s.years || [], defaultTemplateId: s.defaultTemplateId, color: s.color || '#0f766e',
        curriculumFrom: s.curriculumFrom || '', rptWeekMapping: s.rptWeekMapping || '', noDskp: noDskp(s), coTeaching: !!s.coTeaching, curriculumNote: s.curriculumNote,
      },
      fields: [
        { type: 'heading', label: 'Maklumat asas' },
        { key: 'id', label: 'ID subjek', required: true, readonly: !isNew, hint: isNew ? 'Huruf/nombor tanpa ruang (cth. BA, PI, SAINS). Tidak boleh diubah kemudian.' : 'Pengenal unik — dirujuk oleh DSKP, RPT, jadual dan RPH.', placeholder: 'cth. BA' },
        { key: 'code', label: 'Kod', required: true, placeholder: 'cth. BA' },
        { key: 'timetableLabel', label: 'Label jadual waktu', placeholder: 'cth. BA / PAI' },
        { key: 'nameMs', label: 'Nama (Bahasa Melayu)', required: true, placeholder: 'cth. Bahasa Arab' },
        { key: 'nameAr', label: 'Nama (Arab)', dir: 'rtl', placeholder: 'اللغة العربية' },
        { key: 'nameJawi', label: 'Nama (Jawi)', dir: 'rtl', placeholder: 'ڤنديديقن اسلام' },
        { type: 'heading', label: 'Bahasa & paparan' },
        { key: 'language', label: 'Bahasa', type: 'select', options: LANGS },
        { key: 'direction', label: 'Arah tulisan', type: 'select', options: DIRS },
        { key: 'script', label: 'Skrip', type: 'select', options: SCRIPTS },
        { key: 'color', label: 'Warna (jadual & kalendar)', type: 'color' },
        { key: 'years', label: 'Tahun diajar', type: 'checks', full: true, required: true, options: yearOpts },
        { type: 'heading', label: 'Kurikulum & templat' },
        { key: 'defaultTemplateId', label: 'Templat RPH lalai', type: 'select', options: tplOpts, placeholder: '— Pilih templat —' },
        { key: 'curriculumFrom', label: 'Guna DSKP subjek lain', type: 'select', options: kit.subjectOptions(x => x.id !== s.id), placeholder: '— DSKP sendiri —', hint: 'Cth. PI/Quran menggunakan DSKP Pendidikan Islam.' },
        { key: 'rptWeekMapping', label: 'Padanan minggu RPT', type: 'select', options: [{ value: 'A', label: 'A — minggu RPT = minggu sekolah' }, { value: 'B', label: 'B — ikut tarikh KPM' }], placeholder: '— Ikut tetapan tahun akademik —' },
        { key: 'noDskp', type: 'checkbox', text: 'Subjek tanpa DSKP (cth. Tasmik)' },
        { key: 'coTeaching', type: 'checkbox', text: 'Pengajaran bersama (guru bersama)' },
        { key: 'curriculumNote', label: 'Catatan kurikulum', type: 'textarea', full: true, rows: 2 },
        { type: 'heading', label: 'Pemetaan kurikulum ikut tahun' },
        { key: '_map', type: 'custom', full: true, render: mapping },
      ],
      onSave(v) {
        const id = isNew ? v.id.trim() : s.id;
        if (isNew && !/^[A-Za-z0-9_-]+$/.test(id)) return 'ID subjek hanya boleh mengandungi huruf, nombor, "-" atau "_".';
        if (isNew && st.subject(id)) return `ID "${id}" sudah digunakan.`;
        if (v.curriculumFrom && v.curriculumFrom === id) return 'Subjek tidak boleh berkongsi DSKP dengan dirinya sendiri.';
        const name = { ms: v.nameMs };
        if (v.nameAr) name.ar = v.nameAr;
        if (v.nameJawi) name.jawi = v.nameJawi;
        const next = { ...U.clone(s), id, code: v.code, name, timetableLabel: v.timetableLabel || v.code, language: v.language, direction: v.direction, script: v.script,
          years: v.years.map(Number).sort((a, b) => a - b), defaultTemplateId: v.defaultTemplateId || null, color: v.color, coTeaching: v.coTeaching || undefined,
          curriculumNote: v.curriculumNote || undefined, curriculum: s.curriculum || {} };
        if (v.curriculumFrom) next.curriculumFrom = v.curriculumFrom; else delete next.curriculumFrom;
        if (v.rptWeekMapping) next.rptWeekMapping = v.rptWeekMapping; else delete next.rptWeekMapping;
        next.noDskp = !!v.noDskp;
        st.update('subjects', d => {
          d.subjects = d.subjects || [];
          const i = d.subjects.findIndex(x => x.id === id);
          if (i >= 0) d.subjects[i] = next; else d.subjects.push(next);
        });
        toast(isNew ? `Subjek ${name.ms} ditambah. Langkah seterusnya: Import DSKP.` : 'Subjek disimpan.', 'success');
        done && done(id);
      },
    });
    return m;
  }

  async function removeSubject(s, redraw) {
    const u = usage(s);
    const warn = [
      u.slots ? `• ${u.slots} slot jadual waktu merujuk subjek ini (slot kekal tetapi tanpa subjek sah).` : null,
      u.rph ? `• ${u.rph} RPH tahun ini menggunakan subjek ini (RPH kekal tersimpan).` : null,
      u.sharedBy.length ? `• Subjek ${u.sharedBy.join(', ')} berkongsi DSKP subjek ini.` : null,
    ].filter(Boolean);
    const ok = await confirm({ title: 'Padam subjek', danger: true, confirmLabel: 'Padam',
      message: `Padam subjek "${s.name.ms}" (${s.id})?\n${warn.length ? '\n' + warn.join('\n') + '\n' : ''}\nData DSKP dan RPT tidak dipadam.` });
    if (!ok) return;
    RPH.store.update('subjects', d => { d.subjects = d.subjects.filter(x => x.id !== s.id); });
    toast('Subjek dipadam.', 'success');
    redraw();
  }

  async function duplicateSubject(s, redraw) {
    const st = RPH.store;
    const raw = await RPH.ui.prompt({ title: 'Salin subjek', label: 'ID subjek baharu', value: kit.uniqueId(`${s.id}2`, id => !!st.subject(id)) });
    if (raw == null) return;
    const id = raw.trim();
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return toast('ID tidak sah (huruf/nombor sahaja).', 'error');
    if (st.subject(id)) return toast(`ID "${id}" sudah digunakan.`, 'error');
    const copy = { ...U.clone(s), id, code: id, name: { ...s.name, ms: `${s.name.ms} (Salinan)` }, curriculum: {} };
    delete copy.rpt;
    st.update('subjects', d => { const i = d.subjects.findIndex(x => x.id === s.id); d.subjects.splice(i + 1, 0, copy); });
    toast('Subjek disalin. DSKP tidak disalin — import DSKP atau tetapkan "Guna DSKP subjek lain".', 'success', 6000);
    redraw();
  }

  function subjectCard(s, redraw) {
    const edit = () => subjectForm(s, redraw);
    const st = RPH.store;
    const tpl = s.defaultTemplateId && st.template(s.defaultTemplateId);
    const alt = s.name && (s.name.ar || s.name.jawi);
    return kit.cssVar(h('section', { class: 'card adm-subj-card' },
      h('div', { class: 'card-head' },
        h('div', { class: 'adm-subj-title' },
          h('h2', null, kit.dot(s.color), (s.name && s.name.ms) || s.id, ' ', h('span', { class: 'badge badge-gold' }, s.code || s.id)),
          alt ? h('div', { class: 'adm-subj-alt' }, kit.rtl(alt, s.name.ar ? 'arabic' : 'jawi')) : null),
        h('div', { class: 'card-actions' },
          kit.iconBtn('edit', 'Sunting', edit),
          kit.iconBtn('copy', 'Salin (duplicate)', () => duplicateSubject(s, redraw)),
          kit.iconBtn('trash', 'Padam', () => removeSubject(s, redraw), 'danger'))),
      h('div', { class: 'card-body stack' },
        h('div', { class: 'pill-list' },
          h('span', { class: 'badge badge-slate' }, label(LANGS, s.language)),
          h('span', { class: 'badge badge-slate' }, (s.direction || 'ltr').toUpperCase()),
          h('span', { class: 'badge badge-slate' }, `Skrip ${label(SCRIPTS, s.script)}`),
          h('span', { class: ['badge', tpl ? 'badge-blue' : 'badge-amber'] }, `Templat: ${tpl ? (tpl.name.ms || tpl.id) : 'belum dipilih'}`),
          s.curriculumFrom || s.id === 'PIQ' ? h('span', { class: 'badge badge-violet' }, `DSKP: ${s.curriculumFrom || 'PI'}`) : null,
          s.coTeaching ? h('span', { class: 'badge badge-slate' }, 'Guru bersama') : null),
        yearTiles(s),
        h('div', null, h('div', { class: 'adm-mini-head' }, 'Aliran persediaan'), checklist(s, edit)),
        s.curriculumNote ? h('p', { class: 'muted small adm-clamp' }, s.curriculumNote) : null,
        h('div', { class: 'row' },
          button('DSKP', { size: 'sm', icon: 'book', onClick: () => RPH.router.go('dskp', null, { subject: s.id }) }),
          button('RPT', { size: 'sm', icon: 'layers', onClick: () => RPH.router.go('rpt', null, { subject: s.id }) }),
          button('Jadual', { size: 'sm', icon: 'clock', onClick: () => RPH.router.go('jadual') })))), '--subj', s.color || '#94a3b8');
  }

  RPH.views.subjek = {
    title: 'Pengurusan Subjek', icon: 'subject',
    render(el, params) {
      const alive = kit.mount(el, 'subjek');
      const draw = () => {
        if (!alive()) return;
        clear(el);
        const subs = RPH.store.subjects();
        const ready = subs.filter(s => stepsFor(s).every(x => x.state !== 'todo')).length;
        el.append(
          RPH.ui.pageHeader('Pengurusan Subjek', 'Tambah, sunting dan urus subjek tanpa mengubah kod. Setiap subjek ada bahasa, arah tulisan, tahun dan templat sendiri.', [
            button('Tambah Subjek', { kind: 'primary', icon: 'plus', onClick: () => subjectForm(null, draw) }),
          ]),
          h('div', { class: 'notice notice-info adm-flow' }, icon('info'),
            h('div', null, h('strong', null, 'Aliran subjek baharu: '),
              ['Tambah Subjek', 'Import DSKP', 'Import RPT', 'Assign Jadual', 'Pilih Templat', 'Siap'].map((x, i) => [i ? h('span', { class: 'adm-arrow' }, ' → ') : null, h('span', null, x)]),
              h('div', { class: 'small' }, `${ready} daripada ${subs.length} subjek sedia untuk menjana RPH.`))),
          subs.length ? h('div', { class: 'grid grid-2 adm-subj-grid' }, subs.map(s => subjectCard(s, draw)))
            : kit.emptyImport('Tiada subjek lagi. Tambah subjek yang anda ajar, atau import bersama DSKP/RPT.', 'subjek', button('Tambah Subjek', { kind: 'primary', icon: 'plus', onClick: () => subjectForm(null, draw) })));
        if (params && params.edit) { const s = RPH.store.subject(params.edit); params.edit = null; if (s) subjectForm(s, draw); }
      };
      draw();
    },
  };
})(window.RPH = window.RPH || {});
