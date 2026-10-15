/* Editor RPH (#/rph/<id>) — master prompt §94 (Edit/Pratonton), §50 (jana semula tanpa ubah SK/SP),
   §40–41 (status, bawa ke slot seterusnya), §44 (guna untuk kelas lain), §48 (kegemaran),
   §39 (refleksi), §67–68 (auto simpan), §69–71 (semakan, guru berkuasa penuh). */
(function (RPH) {
  'use strict';
  const U = RPH.util;
  const h = (...a) => RPH.ui.h(...a);
  /** Tambah anak (rata, langkau null/false) — Element.append() asli menukar null kepada teks "null". */
  const add = (el, ...kids) => RPH.ui.append(el, kids);
  const S = () => RPH.store;
  const K = () => RPH.rphKit;
  const VARIANTS = [{ value: 'compact', label: 'Ringkas' }, { value: 'standard', label: 'Standard' }, { value: 'detailed', label: 'Terperinci' }];
  const TASMIK_COLS = { murid: 'Murid', bacaan: "Bacaan (Iqra' / Surah)", mula: 'Mula', tamat: 'Tamat', catatan: 'Catatan' };
  const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv'];
  const REGEN = [
    { part: 'objectives', label: 'Objektif' },
    { part: 'activities', label: 'Aktiviti' },
    { part: 'successCriteria', label: 'Kriteria Kejayaan' },
    { part: 'reflection', label: 'Refleksi' },
  ];

  let sess = null; // { id, rph, el, mode, timer, pending, savedAt, live:Set<fn>, undo }

  // ======================================================================
  // Simpan automatik
  // ======================================================================
  function flush() {
    if (!sess || !sess.pending) return;
    clearTimeout(sess.timer); sess.timer = null; sess.pending = false;
    try {
      const c = U.clone(sess.rph);
      S().saveRph(c);
      sess.rph.updatedAt = c.updatedAt; sess.rph.createdAt = c.createdAt; sess.rph.academicYearId = c.academicYearId;
      sess.savedAt = new Date();
    } catch (e) { RPH.reportError('simpan RPH', e); }
    RPH.ui.setDirty(false);
    paintSaved();
    refreshCheck();
  }
  function changed() {
    if (!sess) return;
    if (S().isArchived && S().isArchived(sess.rph.academicYearId)) {
      if (!sess.archivedWarned) { sess.archivedWarned = true; RPH.ui.toast(`Tahun akademik ${sess.rph.academicYearId} diarkib (baca sahaja) — perubahan tidak disimpan.`, 'error', 6000); }
      return;
    }
    sess.pending = true;
    RPH.ui.setDirty(true);
    paintSaved();
    clearTimeout(sess.timer);
    sess.timer = setTimeout(flush, 600);
    sess.live.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  }
  function paintSaved() {
    const el = sess && sess.el.querySelector('.rphv-saved');
    if (!el) return;
    el.classList.toggle('is-pending', !!sess.pending);
    el.textContent = sess.pending ? 'Menyimpan…' : sess.savedAt ? `Disimpan ${U.hhmm(sess.savedAt)}` : 'Tiada perubahan';
  }
  function onHash() { flush(); }
  /** Klik pautan (nav sisi, "Rekod", dll.) berlaku SEBELUM hashchange → simpan dahulu supaya penghala tidak bertanya. */
  function onDocClick(e) { if (sess && sess.pending && e.target && e.target.closest && e.target.closest('a[href]')) flush(); }
  function onKey(e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && sess) { e.preventDefault(); if (sess.pending) flush(); RPH.ui.toast('RPH disimpan.', 'success', 1500); }
  }
  function onHide() { if (document.visibilityState === 'hidden') flush(); }
  function teardown() {
    if (!sess) return;
    flush();
    window.removeEventListener('hashchange', onHash, true);
    window.removeEventListener('popstate', onHash, true);
    window.removeEventListener('beforeunload', onHash);
    RPH.events.off('route:leaving', onHash);
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onHide);
    sess = null;
  }

  // ======================================================================
  // Render
  // ======================================================================
  function render(el, params = {}) {
    const { ui } = RPH;
    const prevMode = sess && sess.id === params.id ? sess.mode : null;
    teardown();
    if (!K()) { el.appendChild(ui.empty('Kit paparan (dashboard.js) tidak dimuatkan.')); return; }
    const stored = params.id ? S().getRph(params.id) : null;
    if (!stored) {
      ui.clear(el);
      add(el, ui.empty(params.id ? `RPH "${params.id}" tidak ditemui dalam tahun akademik aktif.` : 'Tiada RPH dipilih.',
        h('div', { class: 'row', style: { justifyContent: 'center' } }, ui.button('Rekod RPH', { kind: 'primary', icon: 'list', onClick: () => RPH.router.go('rekod') }), ui.button('Jana RPH', { icon: 'wand', onClick: () => RPH.router.go('jana') }))));
      return;
    }
    sess = { id: stored.id, rph: U.clone(stored), el, mode: prevMode || params.mode || 'edit', timer: null, pending: false, savedAt: null, live: new Set(), undo: null };
    sess.rph.values = sess.rph.values || {};
    window.addEventListener('hashchange', onHash, true);
    window.addEventListener('popstate', onHash, true);
    window.addEventListener('beforeunload', onHash);
    RPH.events.on('route:leaving', onHash);
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onHide);
    build();
  }

  function build() {
    const { ui } = RPH; const el = sess.el;
    sess.live.clear();
    ui.clear(el);
    const main = h('div', { class: 'rphv-ed-main' });
    const aside = h('aside', { class: 'rphv-ed-aside', 'aria-label': 'Panel RPH' });
    add(el, h('div', { class: 'rphv-ed' }, head(), h('div', { class: 'rphv-ed-grid' }, main, aside)));
    if (sess.mode === 'preview') buildPreview(main); else buildForm(main);
    buildAside(aside);
    paintSaved();
  }

  // ---------- Kepala ----------
  function head() {
    const { ui } = RPH; const k = K(); const r = sess.rph;
    const tpl = k.template(r);
    const variants = VARIANTS.filter(v => !tpl || !tpl.variants || tpl.variants[v.value]);
    const statusSel = ui.select({ options: k.statusOptions(), value: r.status, cls: 'input-sm rphv-status-sel', onChange: v => {
      r.status = v; changed();
      const b = sess.el.querySelector('.rphv-ed-badge'); if (b) b.replaceWith(badgeEl());
      if (v === 'ditangguhkan') ui.toast('Gunakan "Pindahkan ke Slot Seterusnya" untuk membawa RPH ini ke kelas berikutnya.', 'info', 6000);
    } });
    statusSel.setAttribute('aria-label', 'Status RPH');
    const badgeEl = () => { const b = ui.badge(r.status); b.classList.add('rphv-ed-badge'); return b; };
    return h('header', { class: 'card rphv-ed-head' },
      h('div', { class: 'rphv-ed-headrow' },
        h('a', { class: 'btn btn-sm btn-ghost rphv-back', href: '#/rekod' }, ui.icon('left', 16), h('span', null, 'Rekod')),
        h('div', { class: 'rphv-ed-title' },
          h('h1', null, k.subjectDot(r.subjectId), `${k.subjName(r.subjectId)} · ${r.className || k.className(r.classId)}`),
          h('div', { class: 'rphv-ed-meta muted' },
            h('span', null, ui.icon('calendar', 14), ' ', k.dateLong(r.date)),
            h('span', null, ui.icon('clock', 14), ' ', k.timeLabel(r.start, r.end), r.minutes ? ` (${r.minutes} minit)` : ''),
            h('span', null, ui.icon('week', 14), ` Minggu ${r.week ?? '—'}${r.rptWeek != null && r.rptWeek !== r.week ? ' · RPT ' + r.rptWeek : ''}`),
            h('span', null, `Tahun ${r.year ?? '—'}`))),
        h('div', { class: 'rphv-ed-status' }, badgeEl(), statusSel)),
      h('div', { class: 'rphv-ed-toolbar' },
        k.segmented([{ value: 'edit', label: 'Edit', icon: 'edit' }, { value: 'preview', label: 'Pratonton', icon: 'eye' }], sess.mode, v => { flush(); sess.mode = v; build(); }, { label: 'Mod paparan' }),
        variants.length > 1 ? k.segmented(variants, r.variant || (tpl && tpl.defaultVariant), v => { r.variant = v; changed(); build(); }, { label: 'Varian templat', size: 'sm' }) : null,
        langSwitch(),
        ui.button('Jana semula', { size: 'sm', kind: 'gold', icon: 'wand', title: 'Jana semula kandungan RPH ini (SK/SP tidak diubah)', onClick: regenMenu }),
        sess.undo ? ui.button(`Buat asal: ${sess.undo.label}`, { size: 'sm', kind: 'ghost', icon: 'refresh', onClick: undoRegen }) : null,
        h('span', { class: 'spacer' }),
        h('span', { class: 'rphv-saved', 'aria-live': 'polite' }, ''),
        h('div', { class: 'rphv-btn-group' },
          ui.button('DOCX', { size: 'sm', icon: 'download', onClick: () => { flush(); k.exportDocx([U.clone(sess.rph)]); } }),
          ui.button('PDF', { size: 'sm', icon: 'file', onClick: () => { flush(); k.printList([U.clone(sess.rph)], { pdf: true }); } }),
          ui.button('Cetak', { size: 'sm', icon: 'print', onClick: () => { flush(); k.printList([U.clone(sess.rph)]); } }))));
  }
  function refreshHead() { const old = sess.el.querySelector('.rphv-ed-head'); if (old) { old.replaceWith(head()); paintSaved(); } }

  // ---------- Bahasa RPH (BM | English | العربية | Jawi — semua subjek, keputusan guru 2026-10-02) ----------
  /** Suis bahasa output: hanya jika templat semasa dalam langGroup yang ada templat setara (RPH.gen.languageOptions). */
  function langSwitch() {
    const k = K(); const r = sess.rph;
    if (!k.has('gen.languageOptions') || !k.has('gen.switchLanguage')) return null;
    let opts = [];
    try { opts = RPH.gen.languageOptions(U.clone(r)) || []; } catch (e) { console.error(e); opts = []; }
    if (opts.length < 2) return null;
    const cur = (opts.find(o => o.templateId === r.templateId) || opts.find(o => o.current) || {}).lang || null;
    const TITLE = { jawi: 'RPH dalam tulisan Jawi', ms: 'RPH dalam Bahasa Melayu (Rumi)', en: 'RPH dalam bahasa Inggeris', ar: 'RPH dalam bahasa Arab' };
    return h('div', { class: 'rphv-lang', style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } },
      h('span', { class: 'muted small' }, 'Bahasa RPH:'),
      k.segmented(opts.map(o => ({ value: o.lang, label: o.label, title: TITLE[o.lang] || o.label })), cur, v => switchLang(v, opts, cur), { label: 'Bahasa RPH', size: 'sm' }));
  }
  async function switchLang(lang, opts, cur) {
    const { ui } = RPH;
    if (!sess || lang === cur) return;
    const o = opts.find(x => x.lang === lang); if (!o) return;
    const ok = await ui.confirm({
      title: `Tukar bahasa RPH: ${o.label}`,
      message: `Templat ditukar kepada versi ${o.label}. Seluruh kandungan dijana semula dalam ${o.label}: objektif, kriteria kejayaan, aktiviti, pembezaan, refleksi automatik, tajuk, tema dan kemahiran. Teks SK/SP dipaparkan dalam ${o.label} (draf terjemahan, bukan teks rasmi DSKP; teks asal digunakan jika tiada terjemahan).\nKod SK/SP dan bilangan murid refleksi dikekalkan. Tajuk atau tema yang anda sunting sendiri diterjemah jika ada padanan, jika tidak dikekalkan. Teks refleksi tersuai dibuang. Boleh dibuat asal.`,
      confirmLabel: 'Tukar bahasa',
    });
    if (!ok || !sess) { if (sess) refreshHead(); return; }
    flush();
    const before = U.clone(sess.rph);
    let out;
    try { out = RPH.gen.switchLanguage(U.clone(sess.rph), lang); } catch (e) { RPH.reportError('tukar bahasa RPH', e); refreshHead(); return; }
    if (!out || typeof out !== 'object' || !out.values) { ui.toast('Penjana tidak memulangkan RPH yang sah.', 'error'); refreshHead(); return; }
    // Jaminan §50: SK/SP + metadata slot kekal (templateId & varian ikut bahasa baharu).
    ['contentStandards', 'learningStandards'].forEach(key => { if (key in before.values) out.values[key] = before.values[key]; });
    ['id', 'date', 'start', 'end', 'classId', 'className', 'year', 'subjectId', 'status', 'carriedFrom', 'carriedTo', 'createdAt'].forEach(key => { out[key] = before[key]; });
    out.provenance = before.provenance;
    sess.rph = out; sess.undo = { label: `Bahasa RPH (${o.label})`, rph: before };
    changed(); build();
    ui.toast(`Bahasa RPH ditukar kepada ${o.label}.`, 'success');
  }

  // ---------- Pratonton ----------
  function buildPreview(main) {
    const { ui } = RPH; const k = K();
    if (!k.has('render.rph')) { add(main, k.missing('render.rph')); return; }
    let node;
    try { node = RPH.render.rph(U.clone(sess.rph), { mode: 'preview', variant: sess.rph.variant }); }
    catch (e) { RPH.reportError('pratonton', e); add(main, ui.empty(`Pratonton gagal: ${e.message}`)); return; }
    const sheet = node && node.classList && (node.classList.contains('a4') || node.classList.contains('rph-doc') || node.querySelector('.a4')) ? node : h('div', { class: 'a4' }, node);
    add(main, h('div', { class: 'rphv-preview', 'aria-label': 'Pratonton A4' }, sheet));
  }

  // ======================================================================
  // Borang (Edit Mode)
  // ======================================================================
  const V = () => sess.rph.values;
  function buildForm(main) {
    const k = K(); const r = sess.rph; const tpl = k.template(r);
    if (!tpl) { add(main, k.notice(`Templat "${r.templateId}" tidak ditemui.`, 'error')); return; }
    const keys = k.variantKeys(tpl, r.variant);
    add(main, slotCard());
    if ((r.warnings || []).length) add(main, h('div', { class: 'rphv-warnings' }, r.warnings.map(w => k.notice(k.msgText(w), null))));
    const shown = new Set();
    for (const key of keys) {
      const f = tpl.fields.find(x => x.key === key);
      if (!f || k.AUTO_TYPES.has(f.type)) continue;
      shown.add(key);
      add(main, fieldBox(f));
    }
    const hidden = tpl.fields.filter(f => !shown.has(f.key) && !k.AUTO_TYPES.has(f.type) && hasValue(V()[f.key]));
    if (hidden.length) add(main, h('p', { class: 'muted small rphv-hidden-note' }, RPH.ui.icon('info', 14),
      ` ${hidden.length} medan berisi tidak dipaparkan dalam varian ini (${hidden.map(f => K().fieldLabel(f).main).join(', ')}) — nilai masih disimpan.`));
  }
  const hasValue = v => v != null && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.values(v).some(hasValue));

  // ---------- Butiran slot ----------
  function slotCard() {
    const { ui } = RPH; const k = K(); const r = sess.rph;
    const info = h('div', { class: 'rphv-slotinfo muted small' });
    const paintInfo = () => {
      ui.clear(info);
      const s = r.slotId ? RPH.cal.slotsFor(r.date).find(x => x.id === r.slotId) : null;
      const ds = k.dayStatus(r.date);
      add(info, 
        h('span', null, `Minggu ${r.week ?? '—'} · RPT ${r.rptWeek ?? '—'} · ${r.minutes ?? '—'} minit`),
        h('span', null, s ? `Slot jadual ${s.versionId || ''} ✓` : 'Tiada slot jadual sepadan'),
        ds.kind !== 'school' ? h('span', { class: 'rphv-warn-text' }, ds.label) : null,
        h('span', null, `Templat: ${(k.template(r) || {}).name ? k.template(r).name.ms : r.templateId}`));
    };
    const afterMeta = () => { changed(); paintInfo(); refreshHead(); };
    const date = ui.input({ type: 'date', value: r.date, onChange: v => {
      if (!v) return;
      const s = RPH.cal.slotsFor(v).find(x => x.classId === r.classId && x.subjectId === r.subjectId);
      k.applySlot(r, v, s || { start: r.start, end: r.end }); afterMeta(); startI.value = r.start || ''; endI.value = r.end || '';
    } });
    const timeChange = () => {
      r.start = startI.value || null; r.end = endI.value || null;
      const s = RPH.cal.slotsFor(r.date).find(x => x.classId === r.classId && x.subjectId === r.subjectId && x.start === r.start && x.end === r.end);
      k.applySlot(r, r.date, s || { start: r.start, end: r.end }); afterMeta();
    };
    const startI = ui.input({ type: 'time', value: r.start || '', onChange: timeChange });
    const endI = ui.input({ type: 'time', value: r.end || '', onChange: timeChange });
    const cls = ui.select({ options: S().classes().map(c => ({ value: c.id, label: `${c.name} (T${c.year})` })), value: r.classId, onChange: v => {
      const c = k.classObj(v); if (!c) return;
      if (r.year && c.year !== r.year) ui.toast(`Tahun kelas berbeza (${c.year}). Semak SK/SP.`, 'info', 6000);
      r.classId = c.id; r.className = c.name; r.year = c.year;
      const s = RPH.cal.slotsFor(r.date).find(x => x.classId === r.classId && x.subjectId === r.subjectId);
      k.applySlot(r, r.date, s || { start: r.start, end: r.end }); afterMeta(); startI.value = r.start || ''; endI.value = r.end || '';
    } });
    paintInfo();
    return h('section', { class: 'rphv-field rphv-slotcard', id: 'f-_slot' },
      h('div', { class: 'rphv-field-head' }, h('div', { class: 'rphv-field-label' }, 'Butiran slot')),
      h('div', { class: 'rphv-slotgrid' }, ui.field('Tarikh', date), ui.field('Mula', startI), ui.field('Tamat', endI), ui.field('Kelas', cls)),
      info);
  }

  // ---------- Kotak medan ----------
  function fieldBox(f) {
    const k = K();
    const lb = k.fieldLabel(f);
    const tools = h('div', { class: 'rphv-field-tools' });
    const body = h('div', { class: 'rphv-field-body' });
    const box = h('section', { class: ['rphv-field', `rphv-t-${f.type}`, f.required ? 'is-required' : ''], id: `f-${f.key}`, dataset: { key: f.key } },
      h('div', { class: 'rphv-field-head' },
        h('div', { class: 'rphv-field-label' }, h('span', null, lb.main), f.required ? h('span', { class: 'rphv-req', title: 'Wajib' }, '*') : null,
          lb.alt ? h('span', { class: 'rphv-field-alt', dir: 'rtl', lang: lb.altLang }, lb.alt) : null),
        tools),
      f.intro ? h('div', { class: 'rphv-field-intro', dir: U.isArabicScript(f.intro) ? 'rtl' : 'ltr', lang: U.isArabicScript(f.intro) ? k.langOf(k.template(sess.rph)) : null }, f.intro) : null,
      body);
    const ctx = { f, tools, body, box, rerender: () => { const nb = fieldBox(f); box.replaceWith(nb); } };
    try { editorFor(ctx); }
    catch (e) { console.error(e); add(body, k.notice(`Medan "${f.key}" gagal dipaparkan: ${e.message}`, 'error')); }
    return box;
  }

  function editorFor(ctx) {
    const { f } = ctx; const v = V()[f.key];
    switch (f.type) {
      case 'text':
        if (Array.isArray(v)) return listEditor(ctx);
        return textEditor(ctx, { multiline: f.key !== 'topic' && f.key !== 'textbookUnit' && f.key !== 'theme' });
      case 'postponement': return postponementEditor(ctx);
      case 'list': return listEditor(ctx);
      case 'activity-list': return activityField(ctx);
      case 'activity-phases': return phasesField(ctx);
      case 'sk-select': return codeEditor(ctx, 'SK');
      case 'sp-select': return codeEditor(ctx, 'SP');
      case 'theme-select': return themeEditor(ctx);
      case 'subject-domain': return bankSelect(ctx, { bank: f.bank || 'pi-bidang' });
      case 'checkbox': case 'multi-select': return bankChecks(ctx);
      case 'select': return f.bank ? bankSelect(ctx, { bank: f.bank }) : optionSelect(ctx);
      case 'differentiation': return diffEditor(ctx);
      case 'reflection': return reflectionEditor(ctx);
      case 'tasmik-detail': return tasmikEditor(ctx);
      default:
        add(ctx.body, h('p', { class: 'muted small' }, `Jenis medan "${f.type}" tidak disokong oleh editor.`), K().rtlBlock(typeof v === 'string' ? v : JSON.stringify(v ?? '')));
    }
  }

  const isRtlTpl = () => { const t = K().template(sess.rph); return !!t && t.direction === 'rtl'; };
  const tplLang = () => K().langOf(K().template(sess.rph));
  function txt(value, { multiline = true, placeholder = '', onInput, rows = 1, ariaLabel } = {}) {
    return K().smartText({ value, multiline, rtl: isRtlTpl(), lang: tplLang(), rows, placeholder, onInput, ariaLabel });
  }

  // ---------- Teks ----------
  function textEditor({ f, body }, { multiline }) {
    const v = V()[f.key];
    add(body, txt(typeof v === 'string' ? v : (v == null ? '' : String(v)), { multiline, placeholder: f.example ? `cth: ${f.example}` : '', ariaLabel: K().fieldLabel(f).main,
      onInput: val => { V()[f.key] = val; changed(); } }));
    if (f.note && f.optional) add(body, h('div', { class: 'field-hint' }, 'Pilihan'));
  }
  function postponementEditor({ f, body }) {
    const el = txt(typeof V()[f.key] === 'string' ? V()[f.key] : '', { multiline: true, rows: 2, ariaLabel: K().fieldLabel(f).main, onInput: val => { V()[f.key] = val; changed(); } });
    const chips = h('div', { class: 'rphv-quick' },
      f.defaultValue ? h('button', { type: 'button', class: 'rphv-chipbtn', onClick: () => { el.value = f.defaultValue; el.dispatchEvent(new Event('input')); } }, K().rtl(f.defaultValue, tplLang()), h('span', { class: 'muted small' }, ' (tidak berkenaan)')) : null,
      h('button', { type: 'button', class: 'rphv-chipbtn', onClick: () => { el.value = ''; el.dispatchEvent(new Event('input')); } }, 'Kosongkan'));
    add(body, el, chips, h('div', { class: 'field-hint' }, 'Isi sebab jika PdP ditangguhkan (cth. program sekolah, cuti, guru bertugas luar).'));
  }

  // ---------- Senarai ----------
  function numLabel(f, i) {
    if (f.numbering === 'roman') return `${ROMAN[i] || i + 1}.`;
    if (f.numbering === 'arabic-indic') return `${U.toArabicDigits(i + 1)}.`;
    return `${i + 1}.`;
  }
  function moveBtns(list, i, after) {
    const { ui } = RPH;
    const b = (dir, label, disabled) => h('button', { type: 'button', class: ['btn-icon', 'rphv-mini-btn', dir < 0 ? 'rphv-up' : 'rphv-down'], 'aria-label': label, title: label, disabled,
      onClick: () => { const j = i + dir; [list[i], list[j]] = [list[j], list[i]]; after(); } }, ui.icon('left', 15));
    return [b(-1, 'Naik', i === 0), b(1, 'Turun', i === list.length - 1)];
  }
  function delBtn(onClick) { return h('button', { type: 'button', class: 'btn-icon rphv-mini-btn rphv-del', 'aria-label': 'Buang', title: 'Buang', onClick }, RPH.ui.icon('trash', 15)); }

  function listEditor(ctx) {
    const { f, body } = ctx;
    if (!Array.isArray(V()[f.key])) V()[f.key] = K().arr(V()[f.key]).map(String);
    const list = V()[f.key];
    const rerender = () => { changed(); ctx.rerender(); };
    const rows = h('div', { class: 'rphv-list' }, list.map((item, i) => h('div', { class: 'rphv-list-row' },
      h('span', { class: 'rphv-num' }, numLabel(f, i)),
      txt(item, { ariaLabel: `${K().fieldLabel(f).main} ${i + 1}`, onInput: val => { list[i] = val; changed(); } }),
      h('div', { class: 'rphv-row-tools' }, moveBtns(list, i, rerender), delBtn(() => { list.splice(i, 1); rerender(); })))));
    add(body, list.length ? rows : h('p', { class: 'muted small rphv-pad0' }, 'Tiada item.'),
      h('div', { class: 'rphv-field-foot' }, RPH.ui.button('Tambah', { size: 'sm', icon: 'plus', onClick: () => { list.push(''); rerender(); focusLast(f.key); } })));
  }
  function focusLast(key) { setTimeout(() => { const box = document.getElementById(`f-${key}`); const all = box ? box.querySelectorAll('textarea, input[type=text]') : []; if (all.length) all[all.length - 1].focus(); }, 30); }

  // ---------- Aktiviti ----------
  function activityTotal() {
    const k = K(); const r = sess.rph; const tpl = k.template(r); if (!tpl) return 0;
    const keys = new Set(k.variantKeys(tpl, r.variant));
    let n = 0;
    for (const f of tpl.fields) {
      if (!keys.has(f.key)) continue;
      const v = V()[f.key];
      if (f.type === 'activity-list') n += U.sum(k.arr(v).map(a => a && a.minutes));
      if (f.type === 'activity-phases' && v && typeof v === 'object') for (const p of Object.values(v)) n += U.sum(k.arr(p).map(a => a && a.minutes));
    }
    return n;
  }
  function minutesMeter({ compact } = {}) {
    const el = h('div', { class: ['rphv-meter', compact ? 'is-compact' : ''], role: 'status' });
    const paint = () => {
      RPH.ui.clear(el);
      const tot = activityTotal(); const slot = sess.rph.minutes || 0;
      const diff = tot - slot;
      const kind = !slot ? 'unknown' : diff === 0 ? 'ok' : diff < 0 ? 'under' : 'over';
      el.className = ['rphv-meter', compact ? 'is-compact' : '', `is-${kind}`].join(' ');
      add(el, 
        h('div', { class: 'rphv-meter-row' }, h('strong', null, `${tot}`), h('span', null, slot ? ` / ${slot} minit` : ' minit'),
          h('span', { class: 'rphv-meter-note' }, kind === 'ok' ? 'Sepadan dengan slot' : kind === 'under' ? `Kurang ${-diff} minit` : kind === 'over' ? `Lebih ${diff} minit` : 'Minit slot tidak ditetapkan')),
        slot ? h('div', { class: 'rphv-meter-bar' }, h('span', { style: { width: `${Math.min(100, Math.round(tot / slot * 100))}%` } })) : null);
    };
    paint();
    sess.live.add(paint);
    return el;
  }
  /** Editor senarai aktiviti [{text, minutes, group?, pak21?}] (dipakai oleh activity-list & activity-phases). */
  function activityRows(list, { groups, label, onStruct }) {
    const { ui } = RPH; const k = K();
    const sub = h('span', { class: 'rphv-subtotal muted small' });
    const paintSub = () => { sub.textContent = `Subjumlah: ${U.sum(list.map(a => a && a.minutes))} minit`; };
    paintSub(); sess.live.add(paintSub);
    const rows = list.map((a, i) => {
      if (!a || typeof a !== 'object') list[i] = a = { text: String(a || ''), minutes: null };
      const mins = h('input', { class: 'input rphv-min', type: 'number', min: '0', max: '240', step: '1', value: a.minutes ?? '', 'aria-label': `Minit aktiviti ${i + 1}`, title: 'Minit' });
      mins.addEventListener('input', () => { a.minutes = mins.value === '' ? null : Math.max(0, +mins.value); changed(); });
      const star = k.starButton('activities', () => (a.text ? { text: a.text, minutes: a.minutes } : null), { label: 'Simpan aktiviti ke Kegemaran' });
      const text = txt(a.text || '', { ariaLabel: `${label} ${i + 1}`, onInput: val => { a.text = val; changed(); star.syncFav(); } });
      const grp = groups && groups.length ? ui.select({ options: groups.map(g => ({ value: g, label: `Kump. ${g}` })), value: a.group || '', placeholder: '—', cls: 'input-sm rphv-grp', onChange: val => { a.group = val || undefined; if (!val) delete a.group; changed(); } }) : null;
      if (grp) grp.setAttribute('aria-label', 'Kumpulan');
      return h('div', { class: 'rphv-act-row' },
        h('span', { class: 'rphv-num' }, `${i + 1}.`),
        h('div', { class: 'rphv-act-main' }, text,
          a.pak21 ? h('div', { class: 'rphv-act-tags' }, ui.chip(`PAK21: ${RPH.banks.valueLabel('pak21', a.pak21, 'name (ms)')}`, 'violet')) : null),
        h('div', { class: 'rphv-act-side' }, h('label', { class: 'rphv-min-wrap' }, mins, h('span', { class: 'muted small' }, 'min')), grp),
        h('div', { class: 'rphv-row-tools' }, star, moveBtns(list, i, onStruct), delBtn(() => { list.splice(i, 1); onStruct(); })));
    });
    return h('div', { class: 'rphv-acts' },
      rows.length ? rows : h('p', { class: 'muted small rphv-pad0' }, 'Tiada aktiviti.'),
      h('div', { class: 'rphv-field-foot' },
        ui.button('Tambah aktiviti', { size: 'sm', icon: 'plus', onClick: () => { list.push({ text: '', minutes: null }); onStruct(true); } }),
        ui.button('Dari Kegemaran', { size: 'sm', icon: 'star', onClick: async () => {
          const it = await k.pickFavourite('activities', { title: 'Kegemaran Aktiviti', render: x => h('div', { class: 'rphv-fav-act' }, k.rtlBlock(typeof x === 'object' ? x.text : String(x)), x && x.minutes ? h('span', { class: 'badge badge-slate' }, `${x.minutes} min`) : null) });
          if (!it) return;
          list.push(typeof it === 'object' ? { text: it.text || '', minutes: it.minutes ?? null } : { text: String(it), minutes: null });
          onStruct();
        } }),
        h('span', { class: 'spacer' }), sub));
  }
  function activityField(ctx) {
    const { f, body } = ctx;
    if (!Array.isArray(V()[f.key])) V()[f.key] = K().arr(V()[f.key]);
    const list = V()[f.key];
    add(body, activityRows(list, { groups: f.groups, label: K().fieldLabel(f).main, onStruct: focus => { changed(); ctx.rerender(); if (focus) focusLast(f.key); } }));
  }
  function phasesField(ctx) {
    const { f, body } = ctx; const k = K();
    let v = V()[f.key];
    if (!v || typeof v !== 'object' || Array.isArray(v)) v = V()[f.key] = { induction: [], development: [], closure: [] };
    const phases = f.phases || k.PHASES;
    add(body, minutesMeter({ compact: true }));
    phases.forEach(p => {
      if (!Array.isArray(v[p.id])) v[p.id] = k.arr(v[p.id]);
      const ms = (k.PHASES.find(x => x.id === p.id) || {}).ms || p.id;
      add(body, h('div', { class: 'rphv-phase' },
        h('div', { class: 'rphv-phase-head' }, h('strong', null, ms), p.ar ? h('span', { class: 'rphv-field-alt', dir: 'rtl', lang: 'ar' }, p.ar) : null),
        activityRows(v[p.id], { label: ms, onStruct: () => { changed(); ctx.rerender(); } })));
    });
  }

  // ---------- SK / SP ----------
  function codeEditor(ctx, kind) {
    const { f, body, tools } = ctx; const k = K(); const r = sess.rph;
    if (!Array.isArray(V()[f.key])) V()[f.key] = k.arr(V()[f.key]);
    const list = V()[f.key];
    const hasCurr = !!S().curriculum(r.subjectId, r.year);
    const skSel = () => k.arr(V().contentStandards);
    const lookup = code => (kind === 'SK' ? RPH.curr.sk(r.subjectId, r.year, code) : RPH.curr.sp(r.subjectId, r.year, code));
    const after = () => { r.provenance = RPH.curr.provenanceFor(r.subjectId, r.year, [...k.skOf(r), ...k.spOf(r)]); changed(); refreshCodeFields(); };
    if (hasCurr) add(tools, RPH.ui.button(`Pilih ${kind}`, { size: 'sm', icon: 'list', onClick: () => pickCodes(kind, list, codes => { list.splice(0, list.length, ...codes); after(); }) }));
    if (!hasCurr) add(body, k.notice(r.subjectId === 'TASMIK' ? 'Tasmik tiada kod DSKP.' : 'Data DSKP tidak tersedia untuk subjek/tahun ini — perlu semakan guru.', 'error'));
    // Teks SK/SP dalam bahasa templat (RPH.i18n.std); tiada terjemahan → teks asal DSKP + penanda.
    const shown = (code, it) => {
      const I = RPH.i18n; const tp = K().template(r);
      const L = (tp && tp.labelLang) || 'ms';
      if (!I || !it) return { text: it ? it.text : '', mark: '' };
      const st = I.std(r.subjectId, r.year, code, L);
      const nat = I.nativeLang(r.subjectId, r.year);
      return { text: st.text || it.text, mark: !st.translated && !st.native && L !== nat ? I.originalMarker(L) : '', tr: st.translated };
    };
    const items = list.map((code, i) => {
      const it = hasCurr ? lookup(code) : null;
      const sh = shown(code, it);
      return h('div', { class: ['rphv-code', it ? '' : 'is-missing'] },
        h('span', { class: 'rphv-code-tag' }, code),
        it ? h('div', null, k.rtlBlock(sh.text, tplLang(), 'rphv-code-text'), sh.mark ? h('span', { class: 'muted small' }, sh.mark) : null, sh.tr ? h('span', { class: 'muted small', title: it.text }, 'Draf terjemahan — teks asal DSKP dalam butang Sumber.') : null) : h('span', { class: 'rphv-warn-text small' }, hasCurr ? 'Kod tiada dalam DSKP — perlu semakan guru' : 'Tiada data DSKP'),
        h('div', { class: 'rphv-row-tools' },
          it ? h('button', { type: 'button', class: 'btn-icon rphv-mini-btn', title: 'Sumber DSKP', 'aria-label': `Sumber ${code}`, onClick: () => provenanceModal(kind, code, it) }, RPH.ui.icon('info', 15)) : null,
          delBtn(() => { list.splice(i, 1); after(); })));
    });
    add(body, items.length ? h('div', { class: 'rphv-codes' }, items) : h('p', { class: 'muted small rphv-pad0' }, `Tiada ${kind} dipilih.`));
    if (kind === 'SP' && hasCurr) {
      const orphans = RPH.curr.orphanSp(skSel(), list);
      if (orphans.length) add(body, k.notice(`SP ${orphans.join(', ')} bukan di bawah SK yang dipilih.`, null,
        h('div', { class: 'rphv-notice-actions' }, RPH.ui.button('Buang SP tersebut', { size: 'sm', onClick: () => { const keep = list.filter(c => !orphans.includes(c)); list.splice(0, list.length, ...keep); after(); } }),
          RPH.ui.button('Tambah SK induk', { size: 'sm', onClick: () => { const sk = V().contentStandards = k.arr(V().contentStandards); orphans.forEach(c => { const p = c.split('.').slice(0, 2).join('.'); if (!sk.includes(p)) sk.push(p); }); after(); } }))));
    }
  }
  function refreshCodeFields() {
    const tpl = K().template(sess.rph); if (!tpl) return;
    tpl.fields.filter(f => f.type === 'sk-select' || f.type === 'sp-select').forEach(f => { const box = document.getElementById(`f-${f.key}`); if (box) box.replaceWith(fieldBox(f)); });
  }
  function provenanceModal(kind, code, it) {
    const { ui } = RPH; const r = sess.rph;
    const p = it.provenance || (r.provenance || []).find(x => x.code === code) || {};
    ui.modal({ title: `Sumber ${kind} ${code}`, size: 'sm', body: h('div', { class: 'stack' },
      K().rtlBlock(it.text, tplLang(), 'rphv-code-text'),
      h('dl', { class: 'kv small' },
        h('dt', null, 'Sumber'), h('dd', null, p.source || '—'),
        h('dt', null, 'Fail'), h('dd', null, p.file || '—'),
        h('dt', null, 'Halaman PDF'), h('dd', null, p.pdfPage ?? '—'),
        h('dt', null, 'Halaman bercetak'), h('dd', null, p.printedPage ?? '—'),
        it.domain ? h('dt', null, 'Bidang') : null, it.domain ? h('dd', null, `${it.domain.code}. `, it.domain.name ? (it.domain.name.ms || '') : '', ' ', it.domain.name ? K().rtl(it.domain.name.ar || it.domain.name.jawi || '') : '') : null),
      (it.notes || []).length ? h('div', { class: 'small muted' }, it.notes.map(n => K().rtlBlock(n, tplLang()))) : null) });
  }
  function pickCodes(kind, current, onDone) {
    const { ui } = RPH; const k = K(); const r = sess.rph;
    const chosen = new Set(current);
    const skSel = k.arr(V().contentStandards);
    const groups = [];
    if (kind === 'SK') {
      RPH.curr.domains(r.subjectId, r.year).forEach(d => groups.push({ title: `${d.code}. ${d.name ? (d.name.ms || '') : ''}`, alt: d.name ? (d.name.ar || d.name.jawi) : '', items: d.contentStandards || [] }));
    } else {
      const sks = skSel.length ? skSel : RPH.curr.listSk(r.subjectId, r.year).map(x => x.code);
      sks.forEach(sk => { const it = RPH.curr.sk(r.subjectId, r.year, sk); groups.push({ title: `SK ${sk}`, alt: it ? it.text : '', items: RPH.curr.listSp(r.subjectId, r.year, sk) }); });
    }
    const search = k.smartText({ multiline: false, placeholder: `Cari kod atau teks ${kind}…`, cls: 'rphv-picker-search' });
    const listEl = h('div', { class: 'rphv-picker-list is-modal' });
    const count = h('span', { class: 'muted small' });
    const paintCount = () => { count.textContent = `${chosen.size} dipilih`; };
    const draw = () => {
      ui.clear(listEl);
      const q = search.value.trim();
      groups.forEach(g => {
        const items = g.items.filter(x => !q || x.code.startsWith(q) || (x.text || '').includes(q));
        if (!items.length) return;
        add(listEl, h('div', { class: 'rphv-picker-domain' }, g.title, g.alt ? h('span', { class: 'rphv-picker-alt' }, ' ', k.rtl(g.alt, tplLang())) : null));
        items.forEach(x => {
          const cb = h('input', { type: 'checkbox', checked: chosen.has(x.code) });
          const row = h('label', { class: ['rphv-pick', chosen.has(x.code) ? 'is-on' : ''] }, cb, h('span', { class: 'rphv-pick-code' }, x.code),
            h('span', { class: 'rphv-pick-text', dir: U.isArabicScript(x.text) ? 'rtl' : 'ltr', lang: U.isArabicScript(x.text) ? tplLang() : null }, x.text || ''));
          cb.addEventListener('change', () => { cb.checked ? chosen.add(x.code) : chosen.delete(x.code); row.classList.toggle('is-on', cb.checked); paintCount(); });
          add(listEl, row);
        });
      });
      if (!listEl.childNodes.length) add(listEl, h('p', { class: 'muted small' }, 'Tiada padanan.'));
    };
    search.addEventListener('input', draw);
    draw(); paintCount();
    ui.modal({ title: `Pilih ${kind === 'SK' ? 'Standard Kandungan' : 'Standard Pembelajaran'}`, size: 'lg',
      body: h('div', { class: 'stack' }, kind === 'SP' && !skSel.length ? k.notice('Tiada SK dipilih — semua SP dipaparkan. SK induk akan ditambah secara automatik.', 'info') : null,
        h('div', { class: 'rphv-toolbar' }, search, count), listEl),
      actions: [{ label: 'Batal' }, { label: 'Simpan pilihan', kind: 'primary', icon: 'check', onClick: () => {
        const order = groups.flatMap(g => g.items.map(x => x.code));
        const codes = [...chosen].sort((a, b) => (order.indexOf(a) + 1 || 1e6) - (order.indexOf(b) + 1 || 1e6));
        if (kind === 'SP' && !skSel.length) { const sk = V().contentStandards = k.arr(V().contentStandards); codes.forEach(c => { const p = c.split('.').slice(0, 2).join('.'); if (!sk.includes(p)) sk.push(p); }); }
        onDone(codes);
      } }] });
  }

  // ---------- Tema ----------
  function themeEditor({ f, body }) {
    const k = K(); const r = sess.rph;
    const themes = S().curriculum(r.subjectId, r.year) ? RPH.curr.themes(r.subjectId, r.year) : [];
    const names = themes.map(t => (t.name && (t.name.ar || t.name.jawi || t.name.ms)) || '').filter(Boolean);
    const cur = typeof V()[f.key] === 'string' ? V()[f.key] : '';
    if (!names.length) { add(body, txt(cur, { multiline: false, onInput: v => { V()[f.key] = v; changed(); } })); return; }
    const isOther = cur && !names.includes(cur);
    const other = txt(isOther ? cur : '', { multiline: false, placeholder: 'Tema lain', onInput: v => { V()[f.key] = v; changed(); } });
    other.hidden = !isOther;
    const sel = RPH.ui.select({ options: [...names.map(n => ({ value: n, label: n })), { value: '__other', label: 'Lain-lain…' }], value: isOther ? '__other' : cur, placeholder: '— Pilih tema —', dir: isRtlTpl() ? 'rtl' : null,
      onChange: v => { if (v === '__other') { other.hidden = false; V()[f.key] = other.value; other.focus(); } else { other.hidden = true; V()[f.key] = v; } changed(); } });
    sel.classList.add('rphv-select-ar');
    add(body, h('div', { class: 'rphv-inline' }, sel, other));
  }

  // ---------- Bank ----------
  function itemLabel(bank, it) {
    if (!it) return '';
    const main = bank === 'pak21' ? RPH.banks.label(it, 'name (ms)') : (it.ms || it.name || null);
    const alt = it.jawi || it.ar || null;
    return { main: main || alt || it.id, alt: main && alt && alt !== main ? alt : null };
  }
  const optText = (bank, it) => { const l = itemLabel(bank, it); return l.alt ? `${l.main} — ${l.alt}` : l.main; };
  function bankSelect({ f, body, tools }, { bank }) {
    const { ui } = RPH; const k = K();
    const items = RPH.banks.items(bank, f.filter);
    const cur = V()[f.key] == null ? '' : String(V()[f.key]);
    let byLabel = null;
    if (cur && !cur.startsWith('txt:') && !items.some(x => x.id === cur)) byLabel = RPH.banks.items(bank).find(x => [x.jawi, x.ar, x.ms, x.name].includes(cur)) || null;
    const isOther = cur && !byLabel && (cur.startsWith('txt:') || !RPH.banks.item(bank, cur));
    const extra = cur && !isOther && !items.some(x => x.id === (byLabel ? byLabel.id : cur)) ? [RPH.banks.item(bank, byLabel ? byLabel.id : cur)].filter(Boolean) : [];
    const opts = [...items, ...extra].map(x => ({ value: x.id, label: optText(bank, x) }));
    const allowOther = true; // §71: guru sentiasa boleh menulis pilihan sendiri ("Lain-lain").
    const other = txt(isOther ? cur.replace(/^txt:/, '') : '', { multiline: false, placeholder: 'Nyatakan (Lain-lain)', onInput: v => { V()[f.key] = v ? `txt:${v}` : ''; changed(); } });
    other.hidden = !isOther;
    const sel = ui.select({ options: [...opts, ...(allowOther ? [{ value: '__other', label: 'Lain-lain…' }] : [])], value: isOther ? '__other' : (byLabel ? byLabel.id : cur), placeholder: '— Tiada —',
      onChange: v => { if (v === '__other') { other.hidden = false; V()[f.key] = other.value ? `txt:${other.value}` : ''; other.focus(); } else { other.hidden = true; V()[f.key] = v; } changed(); if (star) star.syncFav(); } });
    sel.setAttribute('aria-label', k.fieldLabel(f).main);
    if (opts.length && opts.filter(o => U.isArabicScript(o.label) && !/[A-Za-z]/.test(o.label)).length > opts.length / 2) { sel.dir = 'rtl'; sel.classList.add('rphv-select-ar'); }
    let star = null;
    if (bank === 'pak21') {
      star = k.starButton('pak21', () => { const v = V()[f.key]; return v && !String(v).startsWith('txt:') ? v : null; }, { label: 'Simpan PAK21 ke Kegemaran' });
      add(tools, star, ui.button('Kegemaran', { size: 'sm', kind: 'ghost', icon: 'star', onClick: async () => {
        const it = await k.pickFavourite('pak21', { title: 'Kegemaran PAK21', render: id => h('span', null, optText('pak21', RPH.banks.item('pak21', id)) || String(id)) });
        if (it) { V()[f.key] = it; changed(); const box = document.getElementById(`f-${f.key}`); if (box) box.replaceWith(fieldBox(f)); }
      } }));
    }
    const curItem = RPH.banks.item(bank, byLabel ? byLabel.id : cur);
    add(body, h('div', { class: 'rphv-inline' }, sel, other));
    const curAlt = curItem ? itemLabel(bank, curItem).alt : null;
    if (curAlt) add(body, h('div', { class: 'rphv-bank-alt' }, K().rtl(curAlt, curItem.jawi ? 'ms-Arab' : 'ar')));
  }
  function optionSelect({ f, body }) {
    const opts = (f.options || []).map(o => (typeof o === 'object' ? o : { value: o, label: o }));
    const cur = V()[f.key] == null ? '' : String(V()[f.key]);
    const isOther = cur && !opts.some(o => o.value === cur);
    const other = txt(isOther ? cur.replace(/^txt:/, '') : '', { multiline: false, placeholder: 'Nyatakan', onInput: v => { V()[f.key] = v ? `txt:${v}` : ''; changed(); } });
    other.hidden = !isOther;
    const sel = RPH.ui.select({ options: [...opts, ...(f.allowOther ? [{ value: '__other', label: 'Lain-lain…' }] : [])], value: isOther ? '__other' : cur, placeholder: '— Tiada —', dir: opts.some(o => U.isArabicScript(o.label)) ? 'rtl' : null,
      onChange: v => { if (v === '__other') { other.hidden = false; V()[f.key] = other.value ? `txt:${other.value}` : ''; other.focus(); } else { other.hidden = true; V()[f.key] = v; } changed(); } });
    if (opts.some(o => U.isArabicScript(o.label))) sel.classList.add('rphv-select-ar');
    add(body, h('div', { class: 'rphv-inline' }, sel, other));
  }
  function bankChecks(ctx) {
    const { f, body, tools } = ctx; const { ui } = RPH; const k = K();
    if (!Array.isArray(V()[f.key])) V()[f.key] = k.arr(V()[f.key]);
    const vals = V()[f.key];
    const base = RPH.banks.items(f.bank, f.filter);
    const outside = vals.filter(v => !String(v).startsWith('txt:') && !base.some(x => x.id === v)).map(v => RPH.banks.item(f.bank, v)).filter(Boolean);
    const set = new Set(vals);
    const sync = () => { const next = [...base, ...outside].map(x => x.id).filter(id => set.has(id)); const free = vals.filter(v => String(v).startsWith('txt:') && set.has(v)); vals.splice(0, vals.length, ...next, ...free); changed(); };
    const grid = h('div', { class: 'rphv-checks' }, [...base, ...outside].map(it => {
      const l = itemLabel(f.bank, it);
      const cb = h('input', { type: 'checkbox', checked: set.has(it.id) });
      cb.addEventListener('change', () => { cb.checked ? set.add(it.id) : set.delete(it.id); sync(); });
      return h('label', { class: 'rphv-check' }, cb, h('span', null, l.main), l.alt ? h('span', { class: 'rphv-check-alt', dir: 'rtl', lang: it.jawi ? 'ms-Arab' : 'ar' }, l.alt) : null);
    }));
    const free = vals.filter(v => String(v).startsWith('txt:'));
    const chips = h('div', { class: 'rphv-free' }, free.map(v => h('span', { class: 'rphv-free-chip' }, K().rtl(v.slice(4)),
      h('button', { type: 'button', class: 'rphv-free-x', 'aria-label': `Buang ${v.slice(4)}`, onClick: () => { vals.splice(vals.indexOf(v), 1); changed(); ctx.rerender(); } }, '×'))));
    const freeIn = txt('', { multiline: false, placeholder: 'Lain-lain (taip & Enter)' });
    freeIn.addEventListener('keydown', e => { if (e.key === 'Enter' && freeIn.value.trim()) { e.preventDefault(); vals.push(`txt:${freeIn.value.trim()}`); changed(); ctx.rerender(); focusLast(f.key); } });
    add(body, grid, free.length ? chips : null, f.allowOther || f.type === 'multi-select' ? h('div', { class: 'rphv-inline rphv-free-add' }, freeIn) : null);
    if (f.bank === 'bbm') {
      add(tools, 
        h('button', { type: 'button', class: 'btn-icon rphv-star', title: 'Simpan BBM dipilih ke Kegemaran', 'aria-label': 'Simpan BBM dipilih ke Kegemaran', onClick: () => {
          const add2 = vals.filter(v => !k.favHas('bbm', v)); if (!add2.length) { ui.toast(vals.length ? 'BBM dipilih sudah ada dalam Kegemaran.' : 'Pilih BBM dahulu.'); return; }
          add2.forEach(v => k.favToggle('bbm', v));
        } }, ui.icon('star', 16)),
        ui.button('Kegemaran', { size: 'sm', kind: 'ghost', icon: 'star', onClick: async () => {
          const it = await k.pickFavourite('bbm', { title: 'Kegemaran BBM', render: v => h('span', null, String(v).startsWith('txt:') ? K().rtl(v.slice(4)) : optText('bbm', RPH.banks.item('bbm', v)) || v) });
          if (it && !vals.includes(it)) { vals.push(it); changed(); ctx.rerender(); }
        } }));
    }
  }

  // ---------- Pembezaan ----------
  function diffEditor({ f, body }) {
    let v = V()[f.key];
    if (!v || typeof v !== 'object' || Array.isArray(v)) v = V()[f.key] = { pemulihan: typeof v === 'string' ? v : '', pengukuhan: '', pengayaan: '' };
    const bank = S().bank(f.bank || 'tp');
    const groups = (bank && bank.groups) || [{ id: 'pemulihan', ms: 'Pemulihan', tp: [1, 2] }, { id: 'pengukuhan', ms: 'Pengukuhan', tp: [3, 4] }, { id: 'pengayaan', ms: 'Pengayaan', tp: [5, 6] }];
    add(body, h('div', { class: 'rphv-diff' }, groups.map(g => h('label', { class: 'field' },
      h('span', { class: 'field-label' }, g.ms, g.tp ? h('span', { class: 'muted' }, ` (TP${g.tp.join('–')})`) : null),
      txt(v[g.id] || '', { rows: 2, ariaLabel: g.ms, onInput: val => { v[g.id] = val; changed(); } })))));
  }

  // ---------- Refleksi (§39) ----------
  function reflectionLines(rv) {
    const k = K();
    let t = null;
    if (k.has('gen.reflectionText')) { try { t = RPH.gen.reflectionText(U.clone(sess.rph)); } catch (e) { console.error(e); t = null; } }
    if (t == null) {
      const n = x => (x == null || x === '' ? '…' : x);
      const out = [];
      if (rv.achieved != null || rv.total != null) out.push(`${n(rv.achieved)}/${n(rv.total)} orang murid mencapai objektif pembelajaran${rv.notAchieved ? ` manakala ${rv.notAchieved} orang murid diberikan aktiviti pemulihan` : ''}.`);
      if (rv.absent) out.push(`${rv.absent} orang murid tidak hadir.`);
      if (rv.postponed) out.push('PdP ditangguhkan.');
      if (rv.carryWeek) out.push(`Aktiviti PdP dibawa ke minggu ${rv.carryWeek}.`);
      return out;
    }
    if (typeof t === 'string') return t.split('\n').filter(Boolean);
    if (Array.isArray(t)) return t.map(x => (typeof x === 'string' ? x : K().msgText(x))).filter(Boolean);
    if (typeof t === 'object') {
      // Bentuk penjana: { ms, ar|jawi|en (baris dipisah \n), lines:[{id,text}], text, sentences }.
      // RPH Inggeris / Arab generik: ayat dalam bahasa templat (t.text) + baris templat.
      const tl = (K().template(sess.rph) || {}).labelLang;
      if (tl === 'en') return [t.text || t.ms || '', ...(t.lines || []).map(x => x.text)].filter(x => typeof x === 'string' && x.trim());
      const script = t.ar || t.jawi || '';
      const lead = tl === 'ar' && t.text && t.text !== t.ms ? t.text : (t.ms || t.text || '');
      return [lead, ...String(script).split('\n')].filter(x => typeof x === 'string' && x.trim());
    }
    return [String(t)];
  }
  function reflectionEditor(ctx) {
    const { f, body, tools } = ctx; const { ui } = RPH; const k = K(); const r = sess.rph;
    let rv = V()[f.key];
    if (!rv || typeof rv !== 'object' || Array.isArray(rv)) rv = V()[f.key] = { total: null, achieved: null, notAchieved: null, absent: null, postponed: false, carryWeek: null, lines: {} };
    rv.lines = rv.lines && typeof rv.lines === 'object' ? rv.lines : {};
    const cls = k.classObj(r.classId);
    let autoNA = rv.notAchieved == null || rv.notAchieved === '';
    // Kotak pilihan bilangan (tanpa menaip). Kosong = kotak kosong dalam RPH untuk diisi dengan tangan.
    const MAXN = Math.max(45, +(cls && cls.enrolment) || 0);
    const numIn = (key, label, hint) => {
      const opts = [h('option', { value: '' }, '— kosong —')];
      for (let i = 0; i <= MAXN; i++) opts.push(h('option', { value: String(i) }, String(i)));
      const el = h('select', { class: 'input rphv-numsel', 'aria-label': label }, opts);
      el.value = rv[key] == null || rv[key] === '' ? '' : String(rv[key]);
      el.addEventListener('change', () => {
        delete rv.auto; // diubah guru → tidak lagi dikemas kini oleh tetapan Bilangan Murid
        rv[key] = el.value === '' ? null : Math.max(0, +el.value);
        if (key === 'notAchieved') autoNA = el.value === '';
        if (autoNA && key !== 'notAchieved' && rv.total != null && rv.achieved != null) {
          rv.notAchieved = Math.max(0, rv.total - rv.achieved - (rv.absent || 0)); naEl.value = String(rv.notAchieved);
        }
        changed();
      });
      return ui.field(label, el, hint);
    };
    const dflt = S().defaultReflection ? S().defaultReflection({ subjectId: r.subjectId, year: r.year, classId: r.classId }) : null;
    const totalF = numIn('total', 'Jumlah murid', dflt ? `Lalai: ${dflt.total} murid (${dflt.achieved} berjaya / ${dflt.notAchieved} tidak) — Tetapan → Bilangan Murid` : 'Tetapkan di Tetapan → Bilangan Murid supaya diisi automatik');
    const achF = numIn('achieved', 'Berjaya (capai objektif)');
    const naF = numIn('notAchieved', 'Tidak berjaya', 'Dikira automatik: jumlah − berjaya − tidak hadir');
    const naEl = naF.querySelector('select');
    const absF = numIn('absent', 'Tidak hadir');
    const post = h('input', { type: 'checkbox', checked: !!rv.postponed });
    post.addEventListener('change', () => { rv.postponed = post.checked; changed(); });
    const carry = h('input', { class: 'input rphv-min', type: 'number', min: '1', max: '53', value: rv.carryWeek ?? '', 'aria-label': 'Dibawa ke minggu' });
    carry.addEventListener('input', () => { rv.carryWeek = carry.value === '' ? null : +carry.value; changed(); });
    const lines = (f.lines || []).length ? h('div', { class: 'rphv-refl-lines' }, h('span', { class: 'field-label' }, 'Baris dipaparkan dalam RPH'),
      h('div', { class: 'rphv-checks' }, f.lines.map(l => {
        const cb = h('input', { type: 'checkbox', checked: rv.lines[l.id] !== false });
        cb.addEventListener('change', () => { rv.lines[l.id] = cb.checked; changed(); });
        return h('label', { class: 'rphv-check' }, cb, h('span', null, l.ms || l.id), l.ar || l.jawi ? h('span', { class: 'rphv-check-alt', dir: 'rtl', lang: l.jawi ? 'ms-Arab' : 'ar' }, l.ar || l.jawi) : null);
      }))) : null;
    const live = h('div', { class: 'rphv-refl-live', 'aria-live': 'polite' });
    const warn = h('div', { class: 'rphv-warn-text small' });
    const paint = () => {
      RPH.ui.clear(live);
      const ls = reflectionLines(rv);
      add(live, h('div', { class: 'rphv-mini-head' }, rv.text ? 'Teks automatik (diganti oleh teks tersuai di bawah)' : 'Teks refleksi automatik'),
        ls.length ? ls.map(x => k.rtlBlock(x, tplLang())) : h('p', { class: 'muted small rphv-pad0' }, 'Pilih bilangan murid untuk menjana ayat refleksi. Jika dibiarkan kosong, RPH memaparkan kotak kosong untuk diisi dengan tangan.'));
      const sum = (rv.achieved || 0) + (rv.notAchieved || 0) + (rv.absent || 0);
      warn.textContent = rv.total != null && sum > rv.total ? `Jumlah capai + belum capai + tidak hadir (${sum}) melebihi jumlah murid (${rv.total}).` : '';
    };
    paint(); sess.live.add(paint);
    const custom = txt(rv.text || '', { rows: 2, placeholder: 'Teks refleksi tersuai (pilihan) — kosongkan untuk guna teks automatik', ariaLabel: 'Teks refleksi tersuai',
      onInput: v => { if (v) rv.text = v; else delete rv.text; changed(); star.syncFav(); } });
    const star = k.starButton('reflection', () => rv.text || reflectionLines(rv).join('\n') || null, { label: 'Simpan refleksi ke Kegemaran' });
    if (dflt) add(tools, ui.button(`Isi lalai (${S().achievedPct()}%)`, { size: 'sm', kind: 'ghost', icon: 'refresh', title: 'Isi semula bilangan murid ikut Tetapan → Bilangan Murid', onClick: () => {
      Object.assign(rv, dflt); ['total', 'achieved', 'notAchieved', 'absent'].forEach((kk, i) => { const sel = [totalF, achF, naF, absF][i].querySelector('select'); sel.value = rv[kk] == null ? '' : String(rv[kk]); });
      autoNA = true; changed(); ui.toast(`Refleksi diisi: ${dflt.achieved}/${dflt.total} berjaya, ${dflt.notAchieved} tidak berjaya.`, 'success');
    } }));
    add(tools, star, ui.button('Kegemaran', { size: 'sm', kind: 'ghost', icon: 'star', onClick: async () => {
      const it = await k.pickFavourite('reflection', { title: 'Kegemaran Refleksi' });
      if (it) { rv.text = typeof it === 'string' ? it : k.favKey(it); custom.value = rv.text; custom.dispatchEvent(new Event('input')); }
    } }));
    add(body, 
      h('div', { class: 'rphv-refl-grid' }, totalF, achF, naF, absF),
      h('div', { class: 'rphv-inline rphv-refl-flags' },
        h('label', { class: 'check' }, post, h('span', null, 'PdP ditangguhkan')),
        h('label', { class: 'rphv-min-wrap' }, h('span', { class: 'small' }, 'Dibawa ke minggu'), carry)),
      warn, lines, live,
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Teks tersuai (guru)'), custom));
  }

  // ---------- Tasmik ----------
  function tasmikEditor(ctx) {
    const { f, body } = ctx; const { ui } = RPH;
    if (!Array.isArray(V()[f.key])) V()[f.key] = K().arr(V()[f.key]);
    const rows = V()[f.key];
    const cols = f.columns || Object.keys(TASMIK_COLS);
    const table = h('div', { class: 'table-wrap' }, h('table', { class: 'table rphv-tasmik' },
      h('thead', null, h('tr', null, h('th', { class: 'num' }, '#'), cols.map(c => h('th', null, TASMIK_COLS[c] || c)), h('th', null, ''))),
      h('tbody', null, rows.length ? rows.map((row, i) => h('tr', null, h('td', { class: 'num' }, i + 1),
        cols.map(c => h('td', null, txt(row[c] || '', { multiline: false, ariaLabel: `${TASMIK_COLS[c] || c} ${i + 1}`, onInput: v => { row[c] = v; changed(); } }))),
        h('td', null, delBtn(() => { rows.splice(i, 1); changed(); ctx.rerender(); }))))
        : h('tr', null, h('td', { colspan: String(cols.length + 2), class: 'muted small' }, 'Belum ada murid.')))));
    add(body, table, h('div', { class: 'rphv-field-foot' }, ui.button('Tambah murid', { size: 'sm', icon: 'plus', onClick: () => { rows.push(Object.fromEntries(cols.map(c => [c, '']))); changed(); ctx.rerender(); } })));
  }

  // ======================================================================
  // Panel sisi
  // ======================================================================
  function buildAside(aside) {
    const { ui } = RPH; const k = K(); const r = sess.rph;
    // Masa aktiviti
    add(aside, h('section', { class: 'card rphv-aside-card' }, h('div', { class: 'rphv-aside-head' }, ui.icon('clock', 16), h('strong', null, 'Masa aktiviti')), minutesMeter()));
    // Semakan
    const checkBox = h('div', { class: 'rphv-check-panel' });
    add(aside, h('section', { class: 'card rphv-aside-card' },
      h('div', { class: 'rphv-aside-head' }, ui.icon('check', 16), h('strong', null, 'Semakan'), h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'btn-icon rphv-mini-btn', title: 'Semak semula', 'aria-label': 'Semak semula', onClick: () => { flush(); refreshCheck(); } }, ui.icon('refresh', 15))),
      checkBox));
    sess.checkBox = checkBox;
    refreshCheck();
    // Tindakan
    const regenOK = k.has('gen.regenerate');
    add(aside, h('section', { class: 'card rphv-aside-card' },
      h('div', { class: 'rphv-aside-head' }, ui.icon('wand', 16), h('strong', null, 'Jana semula'), h('span', { class: 'muted small' }, ' SK/SP tidak diubah')),
      h('div', { class: 'rphv-btn-grid' }, REGEN.map(x => ui.button(x.label, { size: 'sm', icon: 'refresh', disabled: !regenOK, title: regenOK ? null : 'Modul penjana belum tersedia', onClick: () => regen(x) }))),
      sess.undo ? ui.button(`Buat asal: ${sess.undo.label}`, { size: 'sm', kind: 'ghost', icon: 'left', onClick: undoRegen }) : null,
      regenOK ? null : h('p', { class: 'muted small rphv-pad0' }, 'Modul penjana (generator.js) belum tersedia.')));
    add(aside, h('section', { class: 'card rphv-aside-card' },
      h('div', { class: 'rphv-aside-head' }, ui.icon('copy', 16), h('strong', null, 'Salin & pindah')),
      h('div', { class: 'rphv-btn-col' },
        ui.button('Pindahkan ke Slot Seterusnya', { size: 'sm', icon: 'forward', onClick: carryModal }),
        ui.button('Gunakan Untuk Kelas Lain', { size: 'sm', icon: 'copy', onClick: otherClassModal }),
        ui.button('Duplikasi', { size: 'sm', icon: 'copy', onClick: () => { flush(); const c = k.duplicate(sess.rph); ui.toast('Salinan RPH dicipta (Draft).', 'success'); RPH.router.go('rph', c.id); } }),
        ui.button('Padam RPH', { size: 'sm', kind: 'danger', icon: 'trash', onClick: async () => {
          if (!(await ui.confirm({ title: 'Padam RPH', message: `Padam RPH ${k.rphTitle(r)} secara kekal?`, confirmLabel: 'Padam', danger: true }))) return;
          clearTimeout(sess.timer); sess.pending = false; RPH.ui.setDirty(false);
          S().deleteRph(r.id); ui.toast('RPH dipadam.', 'success'); RPH.router.go('rekod');
        } }))));
    // Maklumat
    const link = (id, label) => { const x = id && S().getRph(id); return x ? h('a', { href: `#/rph/${encodeURIComponent(id)}` }, `${label}: ${k.dateShort(x.date)} ${x.start || ''}`) : id ? h('span', { class: 'muted' }, `${label}: (tiada)`) : null; };
    const tpl = k.template(r);
    add(aside, h('section', { class: 'card rphv-aside-card' },
      h('div', { class: 'rphv-aside-head' }, ui.icon('info', 16), h('strong', null, 'Maklumat')),
      h('dl', { class: 'kv small' },
        h('dt', null, 'Templat'), h('dd', null, tpl ? tpl.name.ms : r.templateId),
        h('dt', null, 'Dijana'), h('dd', null, r.generatedBy === 'auto' ? 'Automatik' : 'Manual'),
        h('dt', null, 'Dicipta'), h('dd', null, r.createdAt ? `${U.fmtDate(r.createdAt.slice(0, 10))} ${new Date(r.createdAt).toTimeString().slice(0, 5)}` : '—'),
        h('dt', null, 'Kemas kini'), h('dd', null, r.updatedAt ? `${U.fmtDate(r.updatedAt.slice(0, 10))} ${new Date(r.updatedAt).toTimeString().slice(0, 5)}` : '—')),
      h('div', { class: 'rphv-links small' }, link(r.carriedFrom, '← Dibawa dari'), link(r.carriedTo, '→ Dibawa ke'), link(r.duplicatedFrom, 'Salinan dari')),
      (r.provenance || []).length ? h('details', { class: 'rphv-prov' }, h('summary', { class: 'small' }, `Sumber DSKP (${r.provenance.length} kod)`),
        h('ul', { class: 'small' }, r.provenance.map(p => h('li', null, h('strong', null, `${p.kind || ''} ${p.code}`), p.missing ? ' — tiada dalam DSKP' : ` — ${p.source || p.file || ''}${p.pdfPage ? `, ms PDF ${p.pdfPage}` : ''}${p.printedPage ? ` (cetak ${p.printedPage})` : ''}`)))) : null));
  }

  function refreshCheck() {
    if (!sess || !sess.checkBox) return;
    const { ui } = RPH; const k = K(); const box = sess.checkBox;
    ui.clear(box);
    if (!k.has('check.beforeExport')) { add(box, h('p', { class: 'muted small rphv-pad0' }, 'Penyemak (validator.js) belum tersedia.')); return; }
    const res = k.runCheck(U.clone(sess.rph));
    add(box, h('div', { class: 'rphv-check-sum' },
      res.errors.length ? h('span', { class: 'badge badge-red' }, `${res.errors.length} ralat`) : null,
      res.warnings.length ? h('span', { class: 'badge badge-amber' }, `${res.warnings.length} amaran`) : null),
    k.checkList(res.errors, res.warnings, key => { const t = document.getElementById(`f-${key}`); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.classList.add('is-flash'); setTimeout(() => t.classList.remove('is-flash'), 1400); } }),
    h('p', { class: 'muted small rphv-pad0' }, 'Amaran tidak menyekat eksport — guru boleh "Teruskan juga".'));
  }

  // ---------- Jana semula (§50) ----------
  /** Menu "Jana semula" pada bar alat (tersedia dalam mod Edit & Pratonton — keputusan guru 2026-10-02). */
  function regenMenu() {
    const { ui } = RPH;
    if (!K().has('gen.regenerate')) { ui.toast('Modul penjana belum tersedia.', 'error'); return; }
    const opts = [{ part: 'all', label: 'Semua kandungan', hint: 'Objektif, kriteria, aktiviti, BBM, PAK21, KBAT, pentaksiran & pembezaan baharu' }, ...REGEN];
    let m = null;
    const pick = x => { m.close(); regen(x, { confirmed: true }); };
    m = ui.modal({ title: 'Jana semula RPH', size: 'sm', body: h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, 'Pilih bahagian untuk dijana semula. SK, SP, tema, topik dan bilangan murid tidak diubah. Anda boleh tekan "Buat asal" selepas itu.'),
      h('div', { class: 'rphv-regen-list' }, opts.map(x => h('button', { type: 'button', class: ['btn', x.part === 'all' ? 'btn-gold' : ''], onClick: () => pick(x) },
        ui.icon(x.part === 'all' ? 'wand' : 'refresh', 16), h('span', null, h('strong', null, x.label), x.hint ? h('span', { class: 'muted small rphv-regen-hint' }, x.hint) : null))))),
      actions: [{ label: 'Batal' }] });
  }
  async function regen(x, { confirmed = false } = {}) {
    const { ui } = RPH; const k = K();
    if (!k.has('gen.regenerate')) { ui.toast('Modul penjana belum tersedia.', 'error'); return; }
    if (!confirmed && !(await ui.confirm({ title: `Jana semula ${x.label}`, message: `${x.label} sedia ada akan digantikan dengan cadangan baharu.\nSK dan SP tidak diubah.`, confirmLabel: 'Jana semula' }))) return;
    flush();
    const before = U.clone(sess.rph);
    let out;
    try { out = RPH.gen.regenerate(U.clone(sess.rph), x.part); } catch (e) { RPH.reportError('jana semula', e); return; }
    if (!out || typeof out !== 'object' || !out.values) { ui.toast('Penjana tidak memulangkan RPH yang sah.', 'error'); return; }
    // Jaminan §50: SK/SP + metadata kekal.
    ['contentStandards', 'learningStandards'].forEach(key => { if (key in before.values) out.values[key] = before.values[key]; else delete out.values[key]; });
    ['id', 'date', 'start', 'end', 'classId', 'className', 'year', 'subjectId', 'status', 'carriedFrom', 'carriedTo', 'createdAt', 'templateId', 'variant'].forEach(key => { out[key] = before[key]; });
    out.provenance = before.provenance;
    sess.rph = out; sess.undo = { label: x.label, rph: before };
    changed(); build();
    ui.toast(`${x.label} dijana semula.`, 'success');
  }
  function undoRegen() {
    if (!sess.undo) return;
    sess.rph = sess.undo.rph; const label = sess.undo.label; sess.undo = null;
    changed(); build();
    RPH.ui.toast(`Jana semula ${label} dibatalkan.`, 'info');
  }

  // ---------- Pindahkan ke slot seterusnya (§41) ----------
  function carryModal() {
    const { ui } = RPH; const k = K();
    flush();
    const r = sess.rph;
    const cands = k.nextSlots(r, 6);
    if (!cands.length) { ui.toast(`Tiada slot ${k.subjCode(r.subjectId)} ${r.className} seterusnya dalam takwim/jadual.`, 'error', 6000); return; }
    let pick = cands.findIndex(c => !c.rph); if (pick < 0) pick = 0;
    const list = h('div', { class: 'rphv-radio-list' }, cands.map((c, i) => {
      const rb = h('input', { type: 'radio', name: 'rphv-carry', checked: i === pick });
      rb.addEventListener('change', () => { if (rb.checked) pick = i; });
      return h('label', { class: 'rphv-radio' }, rb,
        h('span', { class: 'rphv-radio-main' }, h('strong', null, k.dateLong(c.date)), h('span', { class: 'muted small' }, ` · ${c.slot.start}–${c.slot.end} · Minggu ${c.day.week ?? '—'}`)),
        c.rph ? h('span', { class: 'rphv-radio-note' }, 'Sudah ada RPH ', ui.badge(c.rph.status)) : h('span', { class: 'badge badge-green' }, 'Kosong'));
    }));
    ui.modal({ title: 'Pindahkan ke Slot Seterusnya', size: 'md', body: h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, `Salinan RPH ini akan dicipta pada slot ${k.subjCode(r.subjectId)} ${r.className} yang dipilih (status Draft). RPH asal ditanda "Dibawa ke minggu seterusnya". Cuti dan hari bukan persekolahan dilangkau.`),
      list),
    actions: [{ label: 'Batal' }, { label: 'Pindahkan', kind: 'primary', icon: 'forward', onClick: () => {
      const target = cands[pick];
      const res = k.carryForward(sess.rph, target);
      sess.rph = U.clone(res.orig); sess.pending = false; RPH.ui.setDirty(false);
      ui.toast(`RPH dibawa ke ${k.dateShort(target.date)} ${target.slot.start}.`, 'success', 5000);
      RPH.router.go('rph', res.copy.id);
    } }] });
  }

  // ---------- Gunakan untuk kelas lain (§44) ----------
  function otherClassModal() {
    const { ui } = RPH; const k = K();
    flush();
    const r = sess.rph;
    const chosen = new Set();
    const rows = S().classes().filter(c => c.id !== r.classId).map(c => {
      const m = k.classSlotInWeek(r, c.id);
      const cb = h('input', { type: 'checkbox' });
      cb.addEventListener('change', () => { cb.checked ? chosen.add(c.id) : chosen.delete(c.id); });
      return h('label', { class: 'rphv-radio' }, cb,
        h('span', { class: 'rphv-radio-main' }, h('strong', null, c.name), c.year !== r.year ? h('span', { class: 'rphv-warn-text small' }, ` · Tahun ${c.year} (berbeza)`) : null,
          h('div', { class: 'muted small' }, m ? `Slot Minggu ${r.week}: ${k.dateShort(m.date)} ${m.slot.start}–${m.slot.end}` : `Tiada slot ${k.subjCode(r.subjectId)} dalam Minggu ${r.week ?? '—'} — tarikh/masa asal digunakan`)),
        m && m.rph ? h('span', { class: 'rphv-radio-note' }, 'Ada RPH ', ui.badge(m.rph.status)) : null);
    });
    ui.modal({ title: 'Gunakan Untuk Kelas Lain', size: 'md', body: h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, 'Disalin: SK, SP, objektif, aktiviti dan pentaksiran. Diset semula: refleksi, TP dan kehadiran.'),
      rows.length ? h('div', { class: 'rphv-radio-list' }, rows) : ui.empty('Tiada kelas lain.')),
    actions: [{ label: 'Batal' }, { label: 'Cipta salinan', kind: 'primary', icon: 'copy', onClick: () => {
      if (!chosen.size) { ui.toast('Pilih sekurang-kurangnya satu kelas.'); return false; }
      const made = [...chosen].map(cid => k.copyToClass(sess.rph, cid));
      ui.toast(`${made.length} RPH dicipta untuk kelas lain.`, 'success');
      ui.modal({ title: 'RPH baharu', size: 'sm', body: h('div', { class: 'rphv-mini-list' }, made.map(m => h('a', { class: 'rphv-mini', href: `#/rph/${encodeURIComponent(m.id)}`, onClick: () => document.querySelectorAll('.modal-back').forEach(x => x.remove()) },
        k.subjectDot(m.subjectId), h('span', { class: 'rphv-mini-main' }, h('strong', null, m.className), h('span', { class: 'muted small' }, ` · ${k.dateShort(m.date)} ${m.start || ''}`)), ui.badge(m.status)))) });
    } }] });
  }

  // Tinggalkan editor → simpan & tanggalkan pendengar (Ctrl+S, hashchange, dll.).
  RPH.events.on('route:changed', r => { if (sess && !(r && r.view === 'rph' && r.arg === sess.id)) teardown(); });

  RPH.views.editor = { title: 'Editor RPH', icon: 'edit', render };
})(window.RPH = window.RPH || {});
