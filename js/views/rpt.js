/* Pengurusan RPT (master prompt §11): senarai minggu, padanan minggu sekolah (A/B), import, CRUD, eksport.
   Dua bentuk data disokong:
   - weeks[]: [{rptWeek, term, lessons:[{kind, bidangId, bidang, strand, topic, sk[], sp[], skText, spText, note}]}]  (RPT PI)
   - rows[]:  [{rptWeek, datesAsPrinted, unit, theme, kind, content[], skCandidates[], spCandidates[], note}]         (RPT BA) */
(function (RPH) {
  'use strict';
  const { h, icon, button, modal, confirm, toast, select, clear, empty } = RPH.ui;
  const U = RPH.util;
  const K = () => RPH.adminKit;
  const st = () => RPH.store;

  const state = { subjectId: null, year: null, filter: '' };
  const KIND_PI = [
    { value: 'lesson', label: 'Pelajaran (lesson)' }, { value: 'khatam', label: 'Khatam / Tasmik al-Quran' }, { value: 'program', label: 'Program' },
    { value: 'cuti', label: 'Cuti' }, { value: 'ulangkaji', label: 'Ulang kaji' }, { value: 'peperiksaan', label: 'Peperiksaan' },
  ];
  const KIND_BA = ['huruf', 'suku-kata', 'huruf+suku-kata', 'kosa-kata', 'tarkib', 'nombor', 'projek', 'ulangkaji', 'peperiksaan', 'program', 'program-pasca-peperiksaan', 'cuti'];
  const KIND_COLOR = { program: 'violet', 'program-pasca-peperiksaan': 'violet', cuti: 'red', peperiksaan: 'rose', ulangkaji: 'amber', khatam: 'blue', projek: 'orange' };

  // ------------------------------------------------------------------ Data
  const subj = () => st().subject(state.subjectId);
  function rptKey() {
    const all = st().get('rpt') || {};
    const own = `${state.subjectId}-${state.year}`;
    if (all[own]) return own;
    const s = subj();
    const base = (s && s.curriculumFrom) || (state.subjectId === 'PIQ' ? 'PI' : null);
    if (base && all[`${base}-${state.year}`]) return `${base}-${state.year}`;
    return own;
  }
  const cur = () => (st().get('rpt') || {})[rptKey()] || null;
  const shapeOf = r => (r && Array.isArray(r.weeks) ? 'weeks' : 'rows');
  function mutate(fn) { const k = rptKey(); st().update('rpt', d => { if (!d[k]) throw new Error('RPT tiada.'); fn(d[k]); d[k].updatedAt = U.nowIso(); }); }

  function entries(r) {
    if (!r) return [];
    if (shapeOf(r) === 'weeks') {
      return r.weeks.flatMap((w, wi) => (w.lessons && w.lessons.length ? w.lessons : [null]).map((l, li) => ({ week: +w.rptWeek, wi, li: l ? li : null, term: w.term, l })));
    }
    return (r.rows || []).map((row, ri) => ({ week: row.rptWeek == null || row.rptWeek === '' ? null : +row.rptWeek, ri, row }));
  }

  function validateRpt(j) {
    const errs = [];
    if (!j || typeof j !== 'object' || Array.isArray(j)) return ['Kandungan fail mesti satu objek JSON RPT.'];
    if (j.type && j.type !== 'rpt') errs.push(`Medan "type" mesti "rpt" (didapati "${j.type}").`);
    if (!j.subjectId) errs.push('Medan "subjectId" tiada (cth. "BA").');
    if (j.year == null || !Number.isFinite(+j.year)) errs.push('Medan "year" tiada atau bukan nombor.');
    if (!Array.isArray(j.weeks) && !Array.isArray(j.rows)) errs.push('Perlu medan "weeks" (senarai minggu dengan "lessons") atau "rows" (senarai baris).');
    (j.weeks || []).forEach((w, i) => {
      if (!w || typeof w !== 'object') return errs.push(`weeks[${i}] bukan objek.`);
      if (!Number.isFinite(+w.rptWeek)) errs.push(`weeks[${i}].rptWeek tiada atau bukan nombor.`);
      if (!Array.isArray(w.lessons)) errs.push(`weeks[${i}].lessons tiada atau bukan senarai.`);
      else w.lessons.forEach((l, k) => { if (!l || typeof l !== 'object') errs.push(`weeks[${i}].lessons[${k}] bukan objek.`); else { if (l.sk && !Array.isArray(l.sk)) errs.push(`weeks[${i}].lessons[${k}].sk mesti senarai kod.`); if (l.sp && !Array.isArray(l.sp)) errs.push(`weeks[${i}].lessons[${k}].sp mesti senarai kod.`); } });
    });
    (j.rows || []).forEach((r, i) => {
      if (!r || typeof r !== 'object') return errs.push(`rows[${i}] bukan objek.`);
      if (r.rptWeek != null && !Number.isFinite(+r.rptWeek)) errs.push(`rows[${i}].rptWeek bukan nombor (guna null untuk baris cuti tanpa minggu).`);
      if (r.content != null && !Array.isArray(r.content)) errs.push(`rows[${i}].content mesti senarai baris teks.`);
    });
    return errs;
  }

  // ------------------------------------------------------------------ Minggu sekolah ↔ minggu RPT
  function modeFor() {
    const c = st().get('calendar') || {}; const ay = st().academicYear(); const s = subj();
    return (s && s.rptWeekMapping) || (ay && ay.rptWeekMapping) || (c.rptWeekMap && c.rptWeekMap.default) || 'A';
  }
  function inverse(mode) {
    const c = st().get('calendar') || {};
    const map = (c.rptWeekMap && c.rptWeekMap[mode] && c.rptWeekMap[mode].map) || null;
    const inv = {};
    if (map) Object.entries(map).forEach(([sw, rw]) => { (inv[+rw] = inv[+rw] || []).push(+sw); });
    else RPH.cal.weeks().forEach(w => { inv[w.week] = [w.week]; });
    return inv;
  }
  function schoolWeekCell(rw, inv, mode, other, invOther) {
    const sws = inv[rw] || [];
    const main = sws.length ? sws.map(n => { const w = RPH.cal.week(n); return h('div', { class: 'adm-sw' }, h('strong', null, `M${n}`), w ? h('span', { class: 'muted small' }, ` ${U.fmtDate(w.start, 'D/M/YYYY').replace(/\/\d{4}$/, '')}–${U.fmtDate(w.end, 'D/M/YYYY').replace(/\/\d{4}$/, '')}`) : null); }) : h('span', { class: 'muted small' }, 'Tiada minggu sekolah');
    const o = invOther[rw] || [];
    return [main, h('div', { class: 'muted small', title: `Padanan ${other}` }, `${other}: ${o.length ? o.map(n => `M${n}`).join(', ') : '—'}`)];
  }

  // ------------------------------------------------------------------ Borang
  function codesCheck(codes) {
    const s = subj(); if (!s || !codes.length) return [];
    const c = st().curriculum(state.subjectId, state.year);
    if (!c) return [];
    return codes.filter(code => !(code.split('.').length === 3 ? RPH.curr.sp(state.subjectId, state.year, code) : RPH.curr.sk(state.subjectId, state.year, code)));
  }

  function lessonForm(r, e, opts = {}) {
    const isNew = !e || e.li == null;
    const l = (e && e.l) || {};
    const bidangOpts = RPH.banks.items('pi-bidang').map(b => ({ value: b.id, label: `${b.jawi || b.ms || b.id}${b.ms ? ` (${b.ms})` : ''}` }));
    K().formModal({ title: isNew ? 'Tambah pelajaran RPT' : `Sunting pelajaran — Minggu ${e.week}`, size: 'lg',
      values: { rptWeek: opts.week ?? (e && e.week), term: e && e.term, kind: l.kind || 'lesson', bidangId: l.bidangId || '', bidang: l.bidang, strand: l.strand, topic: l.topic, sk: l.sk || [], sp: l.sp || [], skText: l.skText, spText: l.spText, note: l.note },
      fields: [
        { key: 'rptWeek', label: 'Minggu RPT', type: 'number', min: 1, required: true },
        { key: 'term', label: 'Penggal', type: 'number', min: 1 },
        { key: 'kind', label: 'Jenis', type: 'select', options: KIND_PI },
        { key: 'bidangId', label: 'Bidang (bank)', type: 'select', options: bidangOpts, placeholder: '— Pilih —', onChange: (v, c) => { const b = RPH.banks.item('pi-bidang', v); if (b && c.bidang.set) c.bidang.set(b.jawi || b.ms || ''); } },
        { key: 'bidang', label: 'Bidang (teks)', dir: 'rtl' },
        { key: 'strand', label: 'Strand / tajuk kecil', dir: 'rtl' },
        { key: 'topic', label: 'Tajuk', dir: 'rtl', full: true },
        { key: 'sk', label: 'Kod SK', type: 'codes', placeholder: 'cth. 1.1' },
        { key: 'sp', label: 'Kod SP', type: 'codes', placeholder: 'cth. 1.1.1, 1.1.2' },
        { key: 'skText', label: 'Teks SK bebas (jika tiada kod, cth. Khatam)', type: 'textarea', rows: 2, dir: 'rtl', full: true },
        { key: 'spText', label: 'Teks SP bebas', type: 'textarea', rows: 2, dir: 'rtl', full: true },
        { key: 'note', label: 'Catatan', type: 'textarea', rows: 2, full: true },
      ],
      async onSave(v) {
        const bad = codesCheck([...v.sk, ...v.sp]);
        if (bad.length && !(await confirm({ title: 'Kod tiada dalam DSKP', message: `Kod berikut tiada dalam DSKP ${state.subjectId} Tahun ${state.year}: ${bad.join(', ')}.\nSimpan juga?` }))) return false;
        const orphan = RPH.curr.orphanSp(v.sk, v.sp);
        if (v.sk.length && orphan.length) return `SP ${orphan.join(', ')} tidak berada di bawah SK yang dipilih (${v.sk.join(', ')}).`;
        const lesson = { ...U.clone(l), kind: v.kind, bidangId: v.bidangId || undefined, bidang: v.bidang || undefined, strand: v.strand || undefined, topic: v.topic || '', sk: v.sk, sp: v.sp, skText: v.skText || undefined, spText: v.spText || undefined, note: v.note || null, editedAt: U.nowIso() };
        if (lesson.topic && RPH.jawi && lesson.topicLegacy) lesson.topicLegacy = RPH.jawi.toLegacy(lesson.topic);
        mutate(rr => {
          if (!isNew) { const w = rr.weeks[e.wi]; w.lessons.splice(e.li, 1); }
          let w = rr.weeks.find(x => +x.rptWeek === +v.rptWeek);
          if (!w) { w = { rptWeek: +v.rptWeek, term: v.term || undefined, lessons: [] }; rr.weeks.push(w); rr.weeks.sort((a, b) => a.rptWeek - b.rptWeek); }
          if (v.term) w.term = v.term;
          // Kekalkan kedudukan jika minggu tidak berubah; jika tidak, tambah di hujung minggu sasaran.
          w.lessons.splice(!isNew && +v.rptWeek === e.week ? e.li : w.lessons.length, 0, lesson);
        });
        toast('Pelajaran RPT disimpan.', 'success');
        draw();
      } });
  }

  function rowForm(r, e, opts = {}) {
    const isNew = !e || e.ri == null;
    const row = (e && e.row) || {};
    const themes = RPH.curr.themes(state.subjectId, state.year).map(t => t.name && (t.name.ar || t.name.ms)).filter(Boolean);
    const units = [...new Set((r.rows || []).map(x => x.unit).filter(Boolean))];
    K().formModal({ title: isNew ? 'Tambah baris RPT' : `Sunting baris — Minggu ${e.week}`, size: 'lg',
      values: { rptWeek: opts.week ?? (e && e.week), datesAsPrinted: row.datesAsPrinted, unit: row.unit, theme: row.theme, kind: row.kind, topic: row.topic, content: row.content || [], skCandidates: row.skCandidates || [], spCandidates: row.spCandidates || [], note: row.note },
      fields: [
        { key: 'rptWeek', label: 'Minggu RPT', type: 'number', min: 1, hint: 'Kosongkan untuk baris cuti tanpa nombor minggu.' },
        { key: 'datesAsPrinted', label: 'Tarikh (seperti dicetak)', placeholder: 'cth. 18-22 OGOS' },
        { key: 'kind', label: 'Jenis kandungan', suggestions: KIND_BA, placeholder: 'cth. kosa-kata' },
        { key: 'unit', label: 'Unit', dir: 'rtl', suggestions: units },
        { key: 'theme', label: 'Tema (محور)', dir: 'rtl', suggestions: themes, hint: themes.length ? 'Pilih daripada tema DSKP supaya kosa kata dapat dipadankan.' : null },
        { key: 'topic', label: 'Tajuk (pilihan)', dir: 'auto' },
        { key: 'content', label: 'Kandungan pelajaran (satu baris satu item)', type: 'lines', rows: 4, dir: 'rtl', full: true },
        { key: 'skCandidates', label: 'SK (calon)', type: 'codes', placeholder: 'cth. 1.3, 2.3' },
        { key: 'spCandidates', label: 'SP (calon)', type: 'codes', placeholder: 'cth. 1.3.1' },
        { key: 'note', label: 'Catatan', type: 'textarea', rows: 2, full: true },
      ],
      async onSave(v) {
        const bad = codesCheck([...v.skCandidates, ...v.spCandidates]);
        if (bad.length && !(await confirm({ title: 'Kod tiada dalam DSKP', message: `Kod berikut tiada dalam DSKP ${state.subjectId} Tahun ${state.year}: ${bad.join(', ')}.\nSimpan juga?` }))) return false;
        const wk = v.rptWeek == null ? null : +v.rptWeek;
        const next = { ...U.clone(row), rptWeek: wk, datesAsPrinted: v.datesAsPrinted || undefined, unit: v.unit || undefined, theme: v.theme || undefined, kind: v.kind || undefined, topic: v.topic || undefined, content: v.content, skCandidates: v.skCandidates, spCandidates: v.spCandidates, note: v.note || null, editedAt: U.nowIso() };
        mutate(rr => {
          rr.rows = rr.rows || [];
          // Susunan tatasusunan = susunan RPT (baris cuti tanpa minggu kekal di tempatnya). Tiada isihan global.
          if (!isNew && (row.rptWeek ?? null) === wk) { rr.rows[e.ri] = next; return; }
          if (!isNew) rr.rows.splice(e.ri, 1);
          let at;
          if (opts.after != null) at = Math.min(opts.after + 1, rr.rows.length);
          else if (wk == null) at = rr.rows.length;
          else { at = 0; rr.rows.forEach((x, i) => { if (x.rptWeek != null && +x.rptWeek <= wk) at = i + 1; }); }
          rr.rows.splice(at, 0, next);
        });
        toast('Baris RPT disimpan.', 'success');
        draw();
      } });
  }

  async function removeEntry(r, e) {
    if (!(await confirm({ title: 'Padam', danger: true, confirmLabel: 'Padam', message: `Padam ${shapeOf(r) === 'weeks' ? 'pelajaran' : 'baris'} minggu RPT ${e.week}?` }))) return;
    mutate(rr => { if (shapeOf(rr) === 'weeks') rr.weeks[e.wi].lessons.splice(e.li, 1); else rr.rows.splice(e.ri, 1); });
    toast('Dipadam.', 'success'); draw();
  }
  function duplicateEntry(r, e) {
    mutate(rr => {
      if (shapeOf(rr) === 'weeks') { const w = rr.weeks[e.wi]; w.lessons.splice(e.li + 1, 0, { ...U.clone(w.lessons[e.li]), duplicatedAt: U.nowIso() }); }
      else rr.rows.splice(e.ri + 1, 0, { ...U.clone(rr.rows[e.ri]), duplicatedAt: U.nowIso() });
    });
    toast('Disalin. Sunting salinan untuk menukar minggu.', 'success'); draw();
  }
  function addEntry(r, week) {
    const all = entries(r);
    const nums = all.map(x => x.week).filter(x => x != null);
    const wk = week ?? (currentRptWeek() || (nums.length ? Math.max(...nums) + 1 : 1));
    if (shapeOf(r) === 'weeks') lessonForm(r, null, { week: wk }); else rowForm(r, null, { week: wk });
  }

  function currentRptWeek() {
    const sw = RPH.cal.schoolWeek(RPH.cal.today());
    return sw == null ? null : RPH.cal.rptWeek(sw, state.subjectId);
  }

  async function importJson() {
    const f = await K().readJson();
    if (!f) return;
    const j = f.json;
    const errs = validateRpt(j);
    if (errs.length) return K().errorsModal(errs, { intro: `Fail "${f.name}" bukan RPT yang sah. Medan yang hilang atau tidak sah:` });
    if (!st().subject(j.subjectId) && !(await confirm({ title: 'Subjek tidak dikenali', message: `Subjek "${j.subjectId}" tiada dalam senarai subjek. Import juga?` }))) return;
    const key = `${j.subjectId}-${+j.year}`;
    const exists = !!(st().get('rpt') || {})[key];
    const ay = st().activeYear();
    if (exists && !(await confirm({ title: 'Ganti RPT sedia ada?', danger: true, confirmLabel: 'Ganti', message: `RPT ${key} untuk tahun akademik ${ay} sudah wujud. Gantikan?\nRPH sedia ada tidak diubah.` }))) return;
    st().update('rpt', d => { d[key] = { ...j, type: 'rpt', year: +j.year, academicYearId: j.academicYearId || ay, importedFrom: f.name, importedAt: U.nowIso() }; });
    state.subjectId = j.subjectId; state.year = +j.year;
    toast(`RPT ${key} diimport ke tahun akademik ${ay}.`, 'success'); draw();
  }

  function createEmpty() {
    const s = subj(); const ay = st().activeYear();
    const piLike = s && (s.script === 'jawi' || s.id === 'PI' || s.curriculumFrom === 'PI');
    const key = `${state.subjectId}-${state.year}`;
    const r = { schemaVersion: '1.0.0', type: 'rpt', id: `RPT-${state.subjectId}-T${state.year}-${ay}`, subjectId: state.subjectId, year: +state.year, academicYearId: ay, source: { file: null, titleAsPrinted: 'Input manual' }, createdAt: U.nowIso() };
    if (piLike) r.weeks = []; else r.rows = [];
    st().update('rpt', d => { d[key] = r; });
    toast('RPT kosong dicipta.', 'success'); draw();
    addEntry(r, 1);
  }

  // ------------------------------------------------------------------ Paparan
  let root = null, alive = () => false;

  function contentCell(r, e) {
    const sc = (subj() && subj().script) || 'arabic';
    if (shapeOf(r) === 'weeks') {
      const l = e.l;
      if (!l) return h('span', { class: 'muted small' }, 'Tiada pelajaran');
      return h('div', { class: 'adm-rpt-content' },
        l.bidang ? h('div', { class: 'strong' }, K().rtl(l.bidang, 'jawi'), l.strand ? h('span', { class: 'muted' }, ' · ', K().rtl(l.strand, 'jawi')) : null) : null,
        l.topic ? h('div', null, K().rtl(l.topic, 'jawi')) : null,
        l.skText ? h('div', { class: 'small' }, h('span', { class: 'muted' }, 'SK: '), K().rtl(l.skText, 'jawi')) : null,
        l.spText ? h('div', { class: 'small' }, h('span', { class: 'muted' }, 'SP: '), K().rtl(l.spText, 'jawi')) : null);
    }
    const row = e.row;
    return h('div', { class: 'adm-rpt-content' },
      row.unit || row.theme ? h('div', { class: 'row adm-tight' }, row.unit ? h('span', { class: 'strong' }, K().rtl(row.unit, sc)) : null, row.theme ? h('span', { class: 'badge badge-blue' }, K().rtl(row.theme, sc)) : null) : null,
      row.topic ? h('div', null, K().rtl(row.topic, sc)) : null,
      (row.content || []).length ? h('div', { class: 'adm-rpt-lines' }, row.content.map(x => K().mixed(x, 'div', 'adm-line'))) : null,
      row.datesAsPrinted ? h('div', { class: 'muted small' }, `Tarikh asal: ${row.datesAsPrinted}`) : null);
  }

  function codesCell(r, e) {
    const isW = shapeOf(r) === 'weeks';
    const sk = isW ? (e.l && e.l.sk) || [] : e.row.skCandidates || [];
    const sp = isW ? (e.l && e.l.sp) || [] : e.row.spCandidates || [];
    if (!sk.length && !sp.length) return h('span', { class: 'muted small' }, '—');
    const bad = new Set(codesCheck([...sk, ...sp]));
    const chipFor = c => h('span', { class: ['adm-code', bad.has(c) ? 'adm-code-bad' : null], title: bad.has(c) ? 'Kod tiada dalam DSKP' : null }, c);
    return h('div', { class: 'adm-codes' },
      sk.length ? h('div', null, h('span', { class: 'muted small' }, isW ? 'SK ' : 'SK (calon) '), sk.map(chipFor)) : null,
      sp.length ? h('div', null, h('span', { class: 'muted small' }, isW ? 'SP ' : 'SP (calon) '), sp.map(chipFor)) : null);
  }

  function kindBadge(k) { return k ? h('span', { class: ['badge', `badge-${KIND_COLOR[k] || 'green'}`] }, k) : h('span', { class: 'muted small' }, '—'); }

  function weekTable(r) {
    const mode = modeFor(); const other = mode === 'A' ? 'B' : 'A';
    const inv = inverse(mode), invOther = inverse(other);
    const curRw = currentRptWeek();
    const q = state.filter.trim();
    const nq = q ? RPH.jawi.normalizeForMatch(q.toLowerCase()) : '';
    let list = entries(r);
    if (q) list = list.filter(e => String(e.week) === q || RPH.jawi.normalizeForMatch(JSON.stringify(e.l || e.row || {}).toLowerCase()).includes(nq));
    if (!list.length) return empty(q ? `Tiada kandungan sepadan dengan "${q}".` : 'RPT ini belum mempunyai kandungan.', button('Tambah', { kind: 'primary', icon: 'plus', onClick: () => addEntry(r) }));
    // Kumpulan berturutan ikut susunan data (baris cuti tanpa minggu kekal di tempatnya).
    const runs = [];
    for (const e of list) { const last = runs[runs.length - 1]; if (last && last.wk === e.week) last.g.push(e); else runs.push({ wk: e.week, g: [e] }); }
    const tbody = h('tbody');
    for (const { wk, g } of runs) {
      g.forEach((e, i) => {
        const isCur = curRw != null && wk === curRw;
        const kind = shapeOf(r) === 'weeks' ? (e.l && e.l.kind) : e.row.kind;
        const tr = h('tr', { class: [isCur ? 'adm-current' : null, i === 0 ? 'adm-week-start' : null], id: i === 0 ? `rpt-w-${wk}` : null });
        if (i === 0 && wk == null) {
          tr.appendChild(h('td', { rowspan: g.length, class: 'adm-week-cell adm-week-off' }, h('div', { class: 'adm-week-no' }, 'Cuti'), h('div', { class: 'muted small' }, 'tanpa no. minggu')));
          tr.appendChild(h('td', { rowspan: g.length, class: 'adm-sw-cell' }, h('span', { class: 'muted small' }, '—')));
        } else if (i === 0) {
          tr.appendChild(h('td', { rowspan: g.length, class: 'adm-week-cell' }, h('div', { class: 'adm-week-no' }, `M${wk}`), isCur ? h('span', { class: 'badge badge-gold' }, 'Minggu ini') : null,
            e.term ? h('div', { class: 'muted small' }, `Penggal ${e.term}`) : null,
            shapeOf(r) === 'weeks' ? h('div', null, K().iconBtn('plus', `Tambah pelajaran minggu ${wk}`, () => lessonForm(r, null, { week: wk }))) : null));
          tr.appendChild(h('td', { rowspan: g.length, class: 'adm-sw-cell' }, schoolWeekCell(wk, inv, mode, other, invOther)));
        }
        tr.append(
          h('td', null, kindBadge(kind)),
          h('td', null, contentCell(r, e)),
          h('td', null, codesCell(r, e)),
          h('td', { class: 'small' }, K().mixed((shapeOf(r) === 'weeks' ? e.l && e.l.note : e.row.note) || '')),
          h('td', { class: 'adm-actions-cell' }, (shapeOf(r) === 'rows' || e.l) ? h('div', { class: 'row adm-tight' },
            K().iconBtn('edit', 'Sunting', () => (shapeOf(r) === 'weeks' ? lessonForm(r, e) : rowForm(r, e))),
            K().iconBtn('copy', 'Salin', () => duplicateEntry(r, e)),
            K().iconBtn('trash', 'Padam', () => removeEntry(r, e), 'danger')) : null));
        tbody.appendChild(tr);
      });
    }
    return h('div', { class: 'table-wrap' }, h('table', { class: 'table adm-rpt-table' },
      h('thead', null, h('tr', null, h('th', null, 'Minggu RPT'), h('th', null, `Minggu sekolah (${mode})`), h('th', null, 'Jenis'), h('th', null, 'Kandungan'), h('th', null, 'SK / SP'), h('th', null, 'Catatan'), h('th', null, ''))),
      tbody));
  }

  /** Pintu masuk ke wizard Jana RPT (js/views/rptgen.js) — null jika paparan itu tiada. */
  function genBtn(kind) {
    if (!RPH.views.rptjana) return null;
    return button('Jana RPT daripada DSKP', { kind, icon: 'wand', onClick: () => RPH.router.go('rptjana', null, { subjek: state.subjectId, tahun: state.year }) });
  }

  function draw() {
    if (!alive()) return;
    clear(root);
    const subs = st().subjects();
    if (!subs.length) {
      root.append(RPH.ui.pageHeader('Pengurusan RPT', `Rancangan Pengajaran Tahunan — tahun akademik ${st().activeYear()}.`),
        K().emptyImport('Tiada subjek lagi. Tambah subjek dahulu, kemudian import atau isi RPT bagi setiap tahun yang diajar.', 'rpt',
          button('Ke Subjek', { kind: 'primary', icon: 'subject', onClick: () => RPH.router.go('subjek') })));
      return;
    }
    if (!st().subject(state.subjectId)) state.subjectId = (subs.find(s => K().yearsOf(s).some(y => st().rpt(s.id, y))) || subs[0]).id;
    const s = subj();
    const years = K().yearsOf(s);
    if (!years.includes(+state.year)) state.year = years.find(y => st().rpt(s.id, y)) || years[0];
    const r = cur();
    const key = rptKey();
    const ay = st().activeYear();
    const mode = modeFor();

    const subjSel = select({ options: K().subjectOptions(), value: state.subjectId, onChange: v => { state.subjectId = v; state.year = null; draw(); } });
    const yearSel = select({ options: years.map(y => ({ value: y, label: `Tahun ${y}${st().rpt(s.id, y) ? ' ✓' : ''}` })), value: state.year, onChange: v => { state.year = +v; draw(); } });
    const filter = RPH.ui.input({ type: 'search', value: state.filter, placeholder: 'Tapis: no. minggu atau teks…', onInput: U.debounce(v => { state.filter = v; const host = root.querySelector('.adm-rpt-host'); if (host && r) { clear(host); host.appendChild(weekTable(r)); } }, 300) });

    const sw = RPH.cal.schoolWeek(RPH.cal.today());
    const curRw = currentRptWeek();
    root.append(
      RPH.ui.pageHeader('Pengurusan RPT', `Rancangan Pengajaran Tahunan — tahun akademik ${ay}. Penjana RPH sentiasa menggunakan data RPT terkini.`, [
        genBtn(r ? null : 'primary'),
        button('Import JSON', { icon: 'upload', onClick: importJson }),
        button('Eksport JSON', { icon: 'download', disabled: !r, onClick: () => K().downloadJson(`RPT_${key}_${ay}.json`, r) }),
        r ? button(shapeOf(r) === 'weeks' ? 'Tambah Pelajaran' : 'Tambah Baris', { kind: 'primary', icon: 'plus', onClick: () => addEntry(r) }) : null,
      ]),
      h('div', { class: 'card adm-toolbar' }, h('div', { class: 'card-body adm-toolbar-row' },
        RPH.ui.field('Subjek', subjSel), RPH.ui.field('Tahun', yearSel),
        r ? RPH.ui.field('Tapis', filter) : null,
        h('div', { class: 'adm-toolbar-info' },
          h('div', { class: 'small' }, 'Hari ini: ', h('strong', null, U.fmtDate(RPH.cal.today())), sw ? ` · Minggu sekolah ${sw}` : ' · bukan minggu persekolahan', curRw ? ` · RPT M${curRw}` : ''),
          h('div', { class: 'small muted' }, `Padanan minggu: ${mode} (${mode === 'A' ? 'minggu RPT = minggu sekolah' : 'ikut tarikh KPM'})`, ' · ', h('a', { href: '#/takwim?tab=rpt' }, 'Tukar'))))));
    if (key !== `${state.subjectId}-${state.year}`) root.appendChild(h('div', { class: 'notice notice-info adm-gap' }, icon('info'), h('span', null, `${s.name.ms} menggunakan RPT ${key}.`)));

    if (!r) {
      root.appendChild(RPH.ui.card({ body: h('div', { class: 'stack' },
        empty(`Tiada RPT untuk ${s.name.ms} Tahun ${state.year} (tahun akademik ${ay}).`),
        h('div', { class: 'row adm-center' },
          genBtn('primary'),
          K().importBtn('rpt', 'Import RPT (fail sekolah)'),
          button('Import JSON', { icon: 'upload', onClick: importJson }),
          button('Cipta RPT Manual', { icon: 'plus', onClick: createEmpty })),
        h('p', { class: 'muted small adm-center-text' }, 'Format JSON: {type:"rpt", subjectId, year, weeks:[{rptWeek, lessons:[…]}]} atau {…, rows:[{rptWeek, unit, theme, content:[…]}]}.')) }));
      return;
    }

    const src = r.source || {};
    const all = entries(r);
    const nWeeks = new Set(all.map(e => e.week).filter(x => x != null)).size;
    root.appendChild(h('section', { class: 'card card-accent adm-gap' }, h('div', { class: 'card-body adm-summary' },
      h('div', { class: 'adm-summary-main' },
        h('div', { class: 'strong' }, K().mixed(src.titleAsPrinted || src.file || r.id || key)),
        h('div', { class: 'muted small' }, [src.file ? `Fail: ${src.file}` : null, r.academicYearId ? `Sesi asal ${r.academicYearId}` : null, r.reusedFor ? `diguna semula untuk ${r.reusedFor.join(', ')}` : null, `Kunci: ${key}`].filter(Boolean).join(' · '))),
      h('div', { class: 'adm-summary-stats' },
        h('span', { class: 'badge badge-green' }, `${nWeeks} minggu`), h('span', { class: 'badge badge-green' }, `${all.filter(e => e.l || e.row).length} ${shapeOf(r) === 'weeks' ? 'pelajaran' : 'baris'}`),
        curRw ? button(`Ke minggu ini (M${curRw})`, { size: 'sm', icon: 'right', onClick: () => { const t = root.querySelector(`#rpt-w-${curRw}`); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' }); else toast(`Tiada kandungan untuk minggu RPT ${curRw}.`); } }) : null,
        K().iconBtn('info', 'Maklumat RPT', () => modal({ title: 'Maklumat RPT', size: 'md', actions: [{ label: 'Tutup', kind: 'primary' }], body: K().kv([['ID', r.id], ['Fail sumber', src.file], ['Tajuk dicetak', src.titleAsPrinted], ['Disediakan', src.preparedBy], ['Disemak', src.checkedBy], ['Disahkan', src.approvedBy], ['Nota guna semula', r.reuseNote], ['Polisi kod', r.codePolicy], ['Penomboran minggu', r.weekNumbering], ['Polisi teks', r.textPolicy], ['Tasmik', r.tasmik], ['Diimport daripada', r.importedFrom]]) })),
        K().iconBtn('trash', 'Padam RPT ini', async () => {
          if (!(await confirm({ title: 'Padam RPT', danger: true, confirmLabel: 'Padam', message: `Padam keseluruhan RPT ${key} (tahun akademik ${ay})? Eksport JSON dahulu sebagai sandaran.` }))) return;
          st().update('rpt', d => { delete d[key]; }); toast('RPT dipadam.', 'success'); draw();
        }, 'danger')))));
    root.appendChild(h('div', { class: 'adm-rpt-host' }, weekTable(r)));
  }

  RPH.views.rpt = {
    title: 'Pengurusan RPT', icon: 'layers',
    render(el, params) {
      root = el; alive = K().mount(el, 'rpt');
      if (params && params.subject) { state.subjectId = params.subject; state.year = params.year ? +params.year : null; state.filter = ''; }
      draw();
      if (params && params.week) { const t = el.querySelector(`#rpt-w-${params.week}`); if (t) t.scrollIntoView({ block: 'center' }); }
    },
    _validate: validateRpt,
  };
})(window.RPH = window.RPH || {});
