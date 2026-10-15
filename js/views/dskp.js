/* DSKP: semak imbas, import (JSON/CSV), tambah manual, sunting, eksport (master prompt §8–§10, §51, §87). */
(function (RPH) {
  'use strict';
  const { h, icon, button, modal, confirm, toast, select, clear, empty, tabs } = RPH.ui;
  const U = RPH.util;
  const K = () => RPH.adminKit;

  const state = { subjectId: null, year: null, q: '', tab: 'std' };
  const SK_RE = /^\d+\.\d+$/, SP_RE = /^\d+\.\d+\.\d+$/;

  // ------------------------------------------------------------------ Pengesahan format (§87)
  function validateCurriculum(c) {
    const errs = [];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['Kandungan fail mesti satu objek JSON kurikulum.'];
    if (c.type === 'rph-private-pack') return ['Ini pakej data peribadi (rph-private-pack). Import melalui Tetapan → Data → Import Pakej Data Peribadi.'];
    if (c.type === 'rph-backup') return ['Ini fail backup penuh. Pulihkan melalui Tetapan → Data → Restore Backup.'];
    if (c.type !== 'curriculum') errs.push('Medan "type" mesti "curriculum".');
    if (!c.subjectId || typeof c.subjectId !== 'string') errs.push('Medan "subjectId" tiada (cth. "BA").');
    if (c.year == null || !Number.isFinite(+c.year)) errs.push('Medan "year" tiada atau bukan nombor (cth. 3).');
    if (!c.script) errs.push('Medan "script" tiada ("arabic" | "jawi" | "rumi").');
    if (!Array.isArray(c.domains)) { errs.push('Medan "domains" tiada atau bukan senarai.'); return errs; }
    if (!c.domains.length) errs.push('Senarai "domains" kosong.');
    const seen = new Set();
    c.domains.forEach((d, di) => {
      const p = `domains[${di}]`;
      if (!d || typeof d !== 'object') { errs.push(`${p} bukan objek.`); return; }
      if (d.code == null || d.code === '') errs.push(`${p}.code tiada.`);
      if (!d.name || typeof d.name !== 'object' || !(d.name.ms || d.name.ar || d.name.jawi)) errs.push(`${p}.name tiada (perlu sekurang-kurangnya "ms", "ar" atau "jawi").`);
      if (!Array.isArray(d.contentStandards)) { errs.push(`${p}.contentStandards tiada atau bukan senarai.`); return; }
      d.contentStandards.forEach((sk, si) => {
        const q = `${p}.contentStandards[${si}]`;
        if (!sk || typeof sk !== 'object') { errs.push(`${q} bukan objek.`); return; }
        if (!sk.code) errs.push(`${q}.code tiada.`);
        else if (!SK_RE.test(sk.code)) errs.push(`${q}.code "${sk.code}" tidak sah (format SK: N.n).`);
        else if (seen.has(sk.code)) errs.push(`Kod ${sk.code} berganda.`);
        else seen.add(sk.code);
        if (!('text' in sk)) errs.push(`${q}.text tiada (${sk.code || '?'}).`);
        if (!Array.isArray(sk.learningStandards)) { errs.push(`${q}.learningStandards tiada atau bukan senarai (${sk.code || '?'}).`); return; }
        sk.learningStandards.forEach((sp, pi) => {
          const r = `${q}.learningStandards[${pi}]`;
          if (!sp || typeof sp !== 'object') { errs.push(`${r} bukan objek.`); return; }
          if (!sp.code) errs.push(`${r}.code tiada.`);
          else if (!SP_RE.test(sp.code)) errs.push(`${r}.code "${sp.code}" tidak sah (format SP: N.n.n).`);
          else if (sk.code && !sp.code.startsWith(sk.code + '.')) errs.push(`SP ${sp.code} tidak berada di bawah SK ${sk.code}.`);
          else if (seen.has(sp.code)) errs.push(`Kod ${sp.code} berganda.`);
          else seen.add(sp.code);
          if (!('text' in sp)) errs.push(`${r}.text tiada (${sp.code || '?'}).`);
        });
      });
    });
    return errs;
  }

  // ------------------------------------------------------------------ CSV → kurikulum
  function parseCsv(text) {
    text = String(text || '').replace(/^﻿/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const delim = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(c => String(c).trim() !== ''));
  }

  function csvToCurriculum(text, fileName, subject, year) {
    const rows = parseCsv(text);
    const errs = [];
    if (!rows.length) return { errs: ['Fail CSV kosong.'] };
    const head = rows[0].map(x => x.trim().toLowerCase());
    const col = n => head.indexOf(n);
    ['level', 'code', 'text'].forEach(n => { if (col(n) < 0) errs.push(`Lajur "${n}" tiada dalam baris tajuk. Lajur diperlukan: level,code,text,domain,page`); });
    if (errs.length) return { errs };
    const script = subject.script === 'jawi' ? 'jawi' : subject.script === 'arabic' ? 'arabic' : (subject.script || 'rumi');
    const c = {
      schemaVersion: '1.0.0', type: 'curriculum', id: `${subject.id}-T${year}-CSV`, subjectId: subject.id,
      subjectName: U.clone(subject.name), year: +year, script, direction: subject.direction || 'ltr',
      source: { title: `Import CSV — ${subject.name.ms} Tahun ${year}`, file: fileName, importedAt: U.nowIso() },
      domains: [], performanceStandards: { scope: 'generic', tables: [] }, themes: [],
    };
    const dom = code => {
      let d = c.domains.find(x => String(x.code) === String(code));
      if (!d) { d = { code: String(code), name: { ms: `Bidang ${code}` }, contentStandards: [] }; c.domains.push(d); }
      return d;
    };
    const findSk = code => { for (const d of c.domains) { const s = d.contentStandards.find(x => x.code === code); if (s) return s; } return null; };
    const pageOf = p => { if (!p) return undefined; const [a, b] = String(p).split(/[\/|-]/).map(x => x.trim()); const o = {}; if (a && !isNaN(+a)) o.pdf = +a; if (b && !isNaN(+b)) o.printed = +b; return Object.keys(o).length ? o : undefined; };
    const seen = new Set();
    rows.slice(1).forEach((r, i) => {
      const n = i + 2;
      const get = k => (col(k) >= 0 ? String(r[col(k)] ?? '').trim() : '');
      const code = get('code'); const txt = get('text');
      let lvl = get('level').toLowerCase();
      if (!lvl) lvl = code.split('.').length === 1 ? 'domain' : code.split('.').length === 2 ? 'sk' : 'sp';
      if (['domain', 'bidang', 'd', 'tunjang', 'modul'].includes(lvl)) {
        if (!code) return errs.push(`Baris ${n}: kod bidang tiada.`);
        const d = dom(code);
        if (txt) d.name = U.isArabicScript(txt) ? { [script === 'jawi' ? 'jawi' : 'ar']: txt } : { ms: txt };
        return;
      }
      const isSk = ['sk', 'standard kandungan', 'content', 'contentstandard'].includes(lvl);
      const isSp = ['sp', 'standard pembelajaran', 'learning', 'learningstandard'].includes(lvl);
      if (!isSk && !isSp) return errs.push(`Baris ${n}: level "${lvl}" tidak dikenali (guna domain, SK atau SP).`);
      if (!code) return errs.push(`Baris ${n}: kod tiada.`);
      if (isSk && !SK_RE.test(code)) return errs.push(`Baris ${n}: kod SK "${code}" tidak sah (format N.n).`);
      if (isSp && !SP_RE.test(code)) return errs.push(`Baris ${n}: kod SP "${code}" tidak sah (format N.n.n).`);
      if (seen.has(code)) return errs.push(`Baris ${n}: kod ${code} berganda.`);
      if (!txt) errs.push(`Baris ${n}: teks bagi ${code} kosong.`);
      seen.add(code);
      const item = { code, displayCode: code, text: txt || null, page: pageOf(get('page')), notes: [] };
      if (script === 'jawi' && txt) item.textLegacy = RPH.jawi.toLegacy(txt);
      if (isSk) dom(get('domain') || code.split('.')[0]).contentStandards.push({ ...item, learningStandards: [], performanceStandards: [] });
      else {
        const parent = findSk(code.split('.').slice(0, 2).join('.'));
        if (!parent) return errs.push(`Baris ${n}: SK induk ${code.split('.').slice(0, 2).join('.')} bagi SP ${code} tiada (letakkan baris SK sebelum SP).`);
        parent.learningStandards.push(item);
      }
    });
    c.domains.sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));
    return { errs, curriculum: c };
  }

  // ------------------------------------------------------------------ Pembantu data
  const st = () => RPH.store;
  const subj = () => st().subject(state.subjectId);
  const keyOf = () => st().curriculumId(state.subjectId, state.year);
  const cur = () => st().curriculum(state.subjectId, state.year);
  const scriptOf = c => (c && c.script) || (subj() && subj().script) || 'rumi';
  const isRtl = c => (c && c.direction === 'rtl') || ['arabic', 'jawi'].includes(scriptOf(c));
  const altKey = c => (scriptOf(c) === 'jawi' ? 'jawi' : 'ar');
  const counts = c => { let sk = 0, sp = 0; (c.domains || []).forEach(d => (d.contentStandards || []).forEach(s => { sk++; sp += (s.learningStandards || []).length; })); return { d: (c.domains || []).length, sk, sp }; };
  const allCodes = c => { const out = new Set(); (c.domains || []).forEach(d => (d.contentStandards || []).forEach(s => { out.add(s.code); (s.learningStandards || []).forEach(p => out.add(p.code)); })); return out; };
  function mutate(fn) { const k = keyOf(); st().update('curriculum', d => { if (!d[k]) throw new Error('Kurikulum tiada.'); fn(d[k]); d[k].updatedAt = U.nowIso(); }); }
  const nextCode = (prefix, list) => { const nums = list.map(x => +String(x.code).split('.').pop()).filter(Number.isFinite); return `${prefix}.${(nums.length ? Math.max(...nums) : 0) + 1}`; };
  const textOf = (t, lang) => (t == null ? '' : typeof t === 'string' ? t : t[lang] || t.ar || t.jawi || t.ms || '');

  function rtlBlock(text, c) { return text ? h('div', { dir: 'rtl', lang: scriptOf(c) === 'jawi' ? 'ms-Arab' : 'ar', class: ['adm-rtl-text', scriptOf(c) === 'jawi' ? 'jawi' : 'ar'] }, text) : h('span', { class: 'muted' }, '(tiada teks)'); }
  function itemText(text, c) { return U.isArabicScript(text) ? rtlBlock(text, c) : h('div', { class: 'adm-ltr-text' }, text || h('span', { class: 'muted' }, '(tiada teks)')); }
  function codeTag(it) { return h('span', { class: 'adm-code' }, it.displayCode && it.displayCode !== it.code ? `${it.code} (${it.displayCode})` : it.code); }
  function pageTag(it) { return it.page && (it.page.pdf || it.page.printed) ? h('span', { class: 'adm-page', title: 'Halaman PDF / halaman bercetak' }, `hlm ${it.page.pdf ?? '–'}/${it.page.printed ?? '–'}`) : null; }

  // ------------------------------------------------------------------ Provenance (§51)
  function provenance(c, it, kind, domain) {
    const src = c.source || {};
    const issues = ((c.verification || {}).issues || []).filter(i => i.ref === it.code);
    modal({ title: `Sumber ${kind} ${it.code}`, size: 'md', actions: [{ label: 'Tutup', kind: 'primary' }],
      body: h('div', { class: 'stack' },
        K().kv([
          ['Kod', it.code], ['Kod dicetak', it.displayCode && it.displayCode !== it.code ? it.displayCode : null], ['Jenis', kind === 'SK' ? 'Standard Kandungan' : 'Standard Pembelajaran'],
          ['Bidang', domain ? `${domain.code} · ${textOf(domain.name, 'ms') || textOf(domain.name, altKey(c))}` : null],
          ['Sumber', src.title], ['Fail', src.file], ['Penerbit', src.publisher], ['Edisi', src.edition],
          ['Halaman PDF', it.page && it.page.pdf != null ? String(it.page.pdf) : '—'], ['Halaman bercetak', it.page && it.page.printed != null ? String(it.page.printed) : '—'],
          ['Disunting guru', it.edited ? U.fmtDate(String(it.edited).slice(0, 10)) : null],
        ]),
        h('div', null, h('div', { class: 'adm-mini-head' }, 'Teks seperti dicetak'), itemText(it.text, c)),
        it.textLegacy ? h('div', null, h('div', { class: 'adm-mini-head' }, 'Teks lapisan PDF (ejaan gantian)'), rtlBlock(it.textLegacy, c)) : null,
        (it.notes || []).length ? h('div', null, h('div', { class: 'adm-mini-head' }, 'Nota / الملاحظة'), h('ul', { class: 'adm-notes' }, it.notes.map(n => K().mixed(n, 'li')))) : null,
        issues.length ? h('div', null, h('div', { class: 'adm-mini-head' }, 'Isu semakan'), h('ul', { class: 'adm-notes' }, issues.map(i => K().mixed(`[${i.type}] ${i.detail || ''}`, 'li')))) : null) });
  }

  // ------------------------------------------------------------------ Borang
  function domainForm(c, di) {
    const d = di != null ? c.domains[di] : null;
    const ak = altKey(c);
    K().formModal({ title: d ? `Sunting bidang ${d.code}` : 'Tambah bidang', size: 'md',
      values: { code: d ? d.code : String((c.domains || []).length + 1), ms: d && d.name.ms, alt: d && (d.name[ak] || d.name.ar || d.name.jawi) },
      fields: [
        { key: 'code', label: 'Kod bidang', required: true, readonly: !!d && (d.contentStandards || []).length > 0, hint: d && d.contentStandards.length ? 'Kod dikunci kerana bidang mempunyai SK.' : 'cth. 1' },
        { key: 'ms', label: 'Nama (Bahasa Melayu)' },
        { key: 'alt', label: ak === 'jawi' ? 'Nama (Jawi)' : 'Nama (Arab)', dir: 'rtl', full: true },
      ],
      onSave(v) {
        if (!v.ms && !v.alt) return 'Isi sekurang-kurangnya satu nama.';
        if (!d && c.domains.some(x => String(x.code) === v.code)) return `Kod bidang ${v.code} sudah wujud.`;
        mutate(cc => {
          const name = {}; if (v.alt) name[ak] = v.alt; if (v.ms) name.ms = v.ms;
          if (d) { const t = cc.domains[di]; t.code = v.code; t.name = { ...t.name, ...name }; if (!v.ms) delete t.name.ms; if (!v.alt) delete t.name[ak]; }
          else cc.domains.push({ code: v.code, name, contentStandards: [] });
        });
        redraw();
      } });
  }

  function itemForm(c, kind, path) {
    // path: {di, si, pi?}; untuk item baharu pi/si = null
    const d = c.domains[path.di];
    const sk = path.si != null ? d.contentStandards[path.si] : null;
    const it = kind === 'SK' ? sk : (path.pi != null ? sk.learningStandards[path.pi] : null);
    const isNew = !it;
    const rtl = isRtl(c);
    const suggested = kind === 'SK' ? nextCode(d.code, d.contentStandards) : nextCode(sk.code, sk.learningStandards);
    const fields = [
      { key: 'code', label: `Kod ${kind}`, required: true, placeholder: suggested, hint: kind === 'SK' ? `Format N.n di bawah bidang ${d.code}` : `Format N.n.n di bawah SK ${sk.code}` },
      { key: 'displayCode', label: 'Kod seperti dicetak', hint: 'Biarkan kosong jika sama.' },
      kind === 'SK' ? { key: 'strand', label: 'Strand / tajuk kecil (pilihan)', dir: rtl ? 'rtl' : null } : null,
      { key: 'text', label: `Teks ${kind} (tepat seperti dicetak)`, type: 'textarea', rows: 3, full: true, required: true, dir: rtl ? 'rtl' : null },
      { key: 'pdf', label: 'Halaman PDF', type: 'number', min: 1 },
      { key: 'printed', label: 'Halaman bercetak', type: 'number', min: 1 },
      { key: 'notes', label: 'Nota (satu baris satu nota)', type: 'lines', rows: 2, full: true },
    ].filter(Boolean);
    K().formModal({ title: isNew ? `Tambah ${kind}` : `Sunting ${kind} ${it.code}`, size: 'md', fields,
      values: isNew ? { code: suggested } : { code: it.code, displayCode: it.displayCode !== it.code ? it.displayCode : '', strand: it.strand ? (it.strand[altKey(c)] || it.strand.ms) : '', text: it.text, pdf: it.page && it.page.pdf, printed: it.page && it.page.printed, notes: it.notes || [] },
      onSave(v) {
        const re = kind === 'SK' ? SK_RE : SP_RE;
        if (!re.test(v.code)) return `Kod ${kind} "${v.code}" tidak sah (format ${kind === 'SK' ? 'N.n' : 'N.n.n'}).`;
        if (kind === 'SK' && v.code.split('.')[0] !== String(d.code)) return `Kod SK mesti bermula dengan kod bidang ${d.code}.`;
        if (kind === 'SP' && !v.code.startsWith(sk.code + '.')) return `Kod SP mesti bermula dengan ${sk.code}.`;
        const codes = allCodes(c); if (!isNew) codes.delete(it.code);
        if (codes.has(v.code)) return `Kod ${v.code} sudah wujud dalam DSKP ini.`;
        if (!isNew && kind === 'SK' && v.code !== it.code && (it.learningStandards || []).length) return 'Kod SK tidak boleh diubah kerana ada SP di bawahnya.';
        mutate(cc => {
          const dd = cc.domains[path.di];
          const base = isNew ? {} : (kind === 'SK' ? dd.contentStandards[path.si] : dd.contentStandards[path.si].learningStandards[path.pi]);
          base.code = v.code; base.displayCode = v.displayCode || v.code; base.text = v.text;
          if (scriptOf(cc) === 'jawi' && v.text) base.textLegacy = RPH.jawi.toLegacy(v.text);
          const page = {}; if (v.pdf != null) page.pdf = v.pdf; if (v.printed != null) page.printed = v.printed;
          if (Object.keys(page).length) base.page = page; else delete base.page;
          base.notes = v.notes;
          if (kind === 'SK') { if (v.strand) base.strand = { ...(base.strand || {}), [U.isArabicScript(v.strand) ? altKey(cc) : 'ms']: v.strand }; else delete base.strand; }
          base.edited = U.nowIso();
          if (isNew) {
            if (kind === 'SK') { base.learningStandards = []; base.performanceStandards = []; dd.contentStandards.push(base); dd.contentStandards.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })); }
            else { const ss = dd.contentStandards[path.si]; ss.learningStandards.push(base); ss.learningStandards.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })); }
          }
        });
        toast(`${kind} ${v.code} disimpan.`, 'success');
        redraw();
      } });
  }

  async function removeItem(c, kind, path) {
    const d = c.domains[path.di];
    const label = kind === 'D' ? `bidang ${d.code} beserta ${d.contentStandards.length} SK` : kind === 'SK' ? `SK ${d.contentStandards[path.si].code} beserta ${(d.contentStandards[path.si].learningStandards || []).length} SP` : `SP ${d.contentStandards[path.si].learningStandards[path.pi].code}`;
    if (!(await confirm({ title: 'Padam', danger: true, confirmLabel: 'Padam', message: `Padam ${label}?\nRPH sedia ada yang merujuk kod ini tidak diubah.` }))) return;
    mutate(cc => {
      const dd = cc.domains[path.di];
      if (kind === 'D') cc.domains.splice(path.di, 1);
      else if (kind === 'SK') dd.contentStandards.splice(path.si, 1);
      else dd.contentStandards[path.si].learningStandards.splice(path.pi, 1);
    });
    toast('Dipadam.', 'success');
    redraw();
  }

  // ------------------------------------------------------------------ Import / eksport
  async function saveImported(c, key, how) {
    const exists = !!(st().get('curriculum') || {})[key];
    if (exists && !(await confirm({ title: 'Ganti DSKP sedia ada?', danger: true, confirmLabel: 'Ganti', message: `DSKP untuk ${key} sudah wujud. Gantikan dengan data daripada ${how}?\nRPH sedia ada tidak diubah.` }))) return false;
    st().update('curriculum', d => { d[key] = c; });
    state.subjectId = st().subject(c.subjectId) ? c.subjectId : state.subjectId; state.year = +c.year;
    const n = counts(c);
    toast(`DSKP ${key} diimport: ${n.d} bidang, ${n.sk} SK, ${n.sp} SP.`, 'success', 5000);
    redraw();
    return true;
  }

  async function importJson() {
    const f = await K().readJson();
    if (!f) return;
    let c = f.json;
    const errs = validateCurriculum(c);
    if (errs.length) return K().errorsModal(errs, { intro: `Fail "${f.name}" tidak mengikut format kurikulum (rujuk data/schema/CURRICULUM_FORMAT.md). Medan yang hilang atau tidak sah:` });
    if (!st().subject(c.subjectId) && !(await confirm({ title: 'Subjek tidak dikenali', message: `Subjek "${c.subjectId}" tiada dalam senarai subjek. Import juga? (Tambah subjek ini di halaman Subjek kemudian.)` }))) return;
    const key = `${st().subject(c.subjectId) ? st().curriculumId(c.subjectId, c.year) : `${c.subjectId}-${c.year}`}`;
    c = { ...c, year: +c.year, source: { ...(c.source || {}), importedFrom: f.name, importedAt: U.nowIso() } };
    await saveImported(c, key, `fail ${f.name}`);
  }

  async function importCsv() {
    const s = subj();
    if (!s) return toast('Pilih subjek dahulu.', 'error');
    const f = await RPH.ui.pickFile('.csv,text/csv,.txt');
    if (!f) return;
    const { errs, curriculum } = csvToCurriculum(f.text, f.name, s, state.year);
    if (errs.length) return K().errorsModal(errs, { intro: `Fail "${f.name}" (CSV). Format lajur: level,code,text,domain,page — contohnya "SK,1.1,…,1,29/17".` });
    const n = counts(curriculum);
    if (!n.sk) return K().errorsModal(['Tiada baris SK/SP ditemui.'], { intro: 'Pastikan lajur "level" berisi domain, SK atau SP.' });
    const key = st().curriculumId(s.id, state.year);
    modal({ title: 'Pratonton import CSV', size: 'md',
      body: h('div', { class: 'stack' },
        h('p', null, `Subjek ${s.name.ms} Tahun ${state.year} (kunci ${key}).`),
        h('div', { class: 'grid grid-3' }, RPH.ui.stat('Bidang', n.d), RPH.ui.stat('SK', n.sk), RPH.ui.stat('SP', n.sp)),
        h('p', { class: 'muted small' }, 'Semak teks selepas import. Jadual TP dan tema boleh ditambah melalui import JSON.')),
      actions: [{ label: 'Batal' }, { label: 'Simpan DSKP', kind: 'primary', icon: 'check', onClick: () => saveImported(curriculum, key, `CSV ${f.name}`) }] });
  }

  function createEmpty() {
    const s = subj(); if (!s) return;
    const key = keyOf();
    const c = { schemaVersion: '1.0.0', type: 'curriculum', id: `${s.id}-T${state.year}-MANUAL`, subjectId: s.curriculumFrom || s.id, subjectName: U.clone(s.name), year: +state.year,
      framework: '', script: s.script || 'rumi', direction: s.direction || 'ltr', source: { title: `Input manual — ${s.name.ms} Tahun ${state.year}`, file: null, createdAt: U.nowIso() },
      domains: [], performanceStandards: { scope: 'generic', tables: [] }, themes: [] };
    st().update('curriculum', d => { d[key] = c; });
    toast('DSKP kosong dicipta. Tambah bidang, SK dan SP.', 'success');
    redraw();
    domainForm(c, null);
  }

  // ------------------------------------------------------------------ Paparan
  let root = null, alive = () => false, listHost = null;
  function redraw() { if (alive()) draw(); }

  function norm(s) { return RPH.jawi.normalizeForMatch(String(s || '').toLowerCase()); }
  function matcher(q) {
    q = q.trim(); if (!q) return null;
    if (/^[\d.]+$/.test(q)) return it => String(it.code).startsWith(q) || String(it.displayCode || '').startsWith(q);
    const n = norm(q);
    return it => norm(it.text).includes(n) || norm(it.textLegacy).includes(n) || (it.notes || []).some(x => norm(x).includes(n));
  }

  function spRow(c, d, di, sk, si, sp, pi) {
    return h('li', { class: 'adm-sp', dir: isRtl(c) ? 'rtl' : 'ltr' },
      h('div', { class: 'adm-item-main' }, codeTag(sp), h('div', { class: 'adm-item-body' }, itemText(sp.text, c),
        (sp.notes || []).length ? h('ul', { class: 'adm-notes' }, sp.notes.map(n => K().mixed(n, 'li'))) : null)),
      h('div', { class: 'adm-item-side', dir: 'ltr' }, pageTag(sp), sp.edited ? h('span', { class: 'badge badge-amber' }, 'Disunting') : null,
        K().iconBtn('info', 'Sumber (provenance)', () => provenance(c, sp, 'SP', d)),
        K().iconBtn('edit', 'Sunting SP', () => itemForm(c, 'SP', { di, si, pi })),
        K().iconBtn('trash', 'Padam SP', () => removeItem(c, 'SP', { di, si, pi }), 'danger')));
  }

  function skBlock(c, d, di, sk, si, m) {
    const skHit = !m || m(sk);
    const sps = (sk.learningStandards || []).map((sp, pi) => ({ sp, pi })).filter(x => skHit || m(x.sp));
    if (m && !skHit && !sps.length) return null;
    const tp = sk.performanceStandards || [];
    return h('div', { class: 'adm-sk' },
      h('div', { class: 'adm-sk-head', dir: isRtl(c) ? 'rtl' : 'ltr' },
        h('div', { class: 'adm-item-main' }, codeTag(sk), h('div', { class: 'adm-item-body' },
          sk.strand ? h('div', null, h('span', { class: 'badge badge-violet' }, K().rtl(sk.strand[altKey(c)] || sk.strand.ms, scriptOf(c)), sk.strand.ms && sk.strand[altKey(c)] ? ` · ${sk.strand.ms}` : '')) : null,
          h('div', { class: 'adm-sk-text' }, itemText(sk.text, c)),
          (sk.notes || []).length ? h('ul', { class: 'adm-notes' }, sk.notes.map(n => K().mixed(n, 'li'))) : null)),
        h('div', { class: 'adm-item-side', dir: 'ltr' }, pageTag(sk), sk.edited ? h('span', { class: 'badge badge-amber' }, 'Disunting') : null,
          K().iconBtn('info', 'Sumber (provenance)', () => provenance(c, sk, 'SK', d)),
          K().iconBtn('plus', 'Tambah SP', () => itemForm(c, 'SP', { di, si, pi: null })),
          K().iconBtn('edit', 'Sunting SK', () => itemForm(c, 'SK', { di, si })),
          K().iconBtn('trash', 'Padam SK', () => removeItem(c, 'SK', { di, si }), 'danger'))),
      sps.length ? h('ol', { class: 'adm-sp-list' }, sps.map(x => spRow(c, d, di, sk, si, x.sp, x.pi))) : h('p', { class: 'muted small adm-indent' }, 'Tiada SP.'),
      tp.length ? h('details', { class: 'adm-details adm-indent' }, h('summary', null, `Tahap Penguasaan SK ${sk.code} (TP1–TP${tp.length})`), tpTable(c, tp)) : null);
  }

  function tpTable(c, levels) {
    return h('div', { class: 'table-wrap' }, h('table', { class: 'table adm-table-compact' },
      h('thead', null, h('tr', null, h('th', null, 'TP'), h('th', null, 'Label'), h('th', null, 'Pernyataan'), h('th', null, 'Terjemahan / Melayu'))),
      h('tbody', null, levels.map(l => {
        const t = l.text;
        const main = typeof t === 'string' ? t : t ? (t[altKey(c)] || t.ar || t.jawi || '') : '';
        const ms = t && typeof t === 'object' ? t.ms : null;
        const lab = l.label ? (typeof l.label === 'string' ? l.label : (l.label[altKey(c)] || l.label.ar || l.label.jawi || '')) : '';
        const labMs = l.label && typeof l.label === 'object' ? l.label.ms : null;
        return h('tr', null,
          h('td', { class: 'num' }, String(l.tp)),
          h('td', null, lab ? K().rtl(lab, scriptOf(c)) : null, labMs ? h('div', { class: 'small' }, labMs) : null, !lab && !labMs ? '—' : null),
          h('td', null, main ? itemText(main, c) : (ms ? h('span', null, ms) : '—')),
          h('td', null, main && ms ? h('span', { class: 'small' }, ms) : '—'));
      }))));
  }

  function stdTab(c) {
    listHost = h('div', { class: 'stack' });
    const drawList = () => {
      clear(listHost);
      const m = matcher(state.q);
      let shown = 0;
      (c.domains || []).forEach((d, di) => {
        const blocks = (d.contentStandards || []).map((sk, si) => skBlock(c, d, di, sk, si, m)).filter(Boolean);
        if (m && !blocks.length) return;
        shown += blocks.length;
        const alt = d.name && (d.name[altKey(c)] || d.name.ar || d.name.jawi);
        listHost.appendChild(h('section', { class: 'card adm-domain' },
          h('div', { class: 'card-head' },
            h('div', null, h('h2', null, h('span', { class: 'adm-code' }, `Bidang ${d.code}`), ' ', d.name && d.name.ms ? d.name.ms : ''),
              alt ? h('div', { class: 'adm-domain-alt' }, K().rtl(alt, scriptOf(c))) : null),
            h('div', { class: 'card-actions' },
              button('SK', { size: 'sm', icon: 'plus', title: 'Tambah SK', onClick: () => itemForm(c, 'SK', { di, si: null }) }),
              K().iconBtn('edit', 'Sunting bidang', () => domainForm(c, di)),
              K().iconBtn('trash', 'Padam bidang', () => removeItem(c, 'D', { di }), 'danger'))),
          h('div', { class: 'card-body stack' }, blocks.length ? blocks : h('p', { class: 'muted small' }, 'Tiada SK. Klik "+ SK" untuk menambah.'))));
      });
      if (!(c.domains || []).length) listHost.appendChild(empty('Tiada bidang lagi.', button('Tambah Bidang', { kind: 'primary', icon: 'plus', onClick: () => domainForm(c, null) })));
      else if (m && !shown) listHost.appendChild(empty(`Tiada SK/SP sepadan dengan "${state.q}".`));
    };
    drawList();
    stdTab.drawList = drawList;
    return listHost;
  }

  function tpTab(c) {
    const tables = ((c.performanceStandards || {}).tables || []);
    const perSk = [];
    (c.domains || []).forEach(d => (d.contentStandards || []).forEach(sk => { if ((sk.performanceStandards || []).length) perSk.push(sk); }));
    if (!tables.length && !perSk.length) return empty('Tiada jadual Tahap Penguasaan dalam data ini.');
    return h('div', { class: 'stack' },
      tables.map(t => RPH.ui.card({ title: K().mixed(t.title || 'Jadual TP'), subtitle: [t.appliesToDomains ? `Bidang ${t.appliesToDomains.join(', ')}` : null, t.page ? `hlm ${t.page.pdf ?? '–'}/${t.page.printed ?? '–'}` : null].filter(Boolean).join(' · '), body: tpTable(c, t.levels || []) })),
      perSk.length ? RPH.ui.card({ title: 'Tahap Penguasaan ikut SK', subtitle: `${perSk.length} SK`, body: h('div', { class: 'stack' }, perSk.map(sk => h('details', { class: 'adm-details' },
        h('summary', null, h('span', { class: 'adm-code' }, sk.code), ' ', K().rtl(String(sk.text || '').slice(0, 90) + (String(sk.text || '').length > 90 ? '…' : ''), scriptOf(c))), tpTable(c, sk.performanceStandards)))) }) : null);
  }

  function themesTab(c) {
    const th = c.themes || [];
    if (!th.length) return empty('Tiada tema (المحاور) dalam data ini.');
    return h('div', { class: 'grid grid-2' }, th.map(t => h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('div', null, h('h2', null, K().rtl(textOf(t.name, 'ar') || textOf(t.name, 'ms'), scriptOf(c))), t.name && t.name.ms ? h('p', { class: 'muted small' }, t.name.ms) : null)),
      h('div', { class: 'card-body stack' },
        h('div', null, h('div', { class: 'adm-mini-head' }, `Kosa kata${(t.vocabularySk || []).length ? ` (SK ${t.vocabularySk.join(', ')})` : ''}`),
          (t.vocabulary || []).length ? h('div', { class: 'pill-list adm-rtl-pills', dir: 'rtl' }, t.vocabulary.map(w => h('span', { class: 'adm-pill ar', lang: 'ar' }, w))) : h('span', { class: 'muted small' }, '—')),
        h('div', null, h('div', { class: 'adm-mini-head' }, `Ungkapan${(t.expressionsSk || []).length ? ` (SK ${t.expressionsSk.join(', ')})` : ''}`),
          (t.expressions || []).length ? h('ul', { class: 'adm-rtl-list', dir: 'rtl' }, t.expressions.map(w => h('li', { class: 'ar', lang: 'ar' }, w))) : h('span', { class: 'muted small' }, '—'))))));
  }

  function glossaryTab(c) {
    return RPH.ui.table([{ key: 'ar', label: 'Istilah', render: r => K().rtl(r.ar) }, { key: 'ms', label: 'Maksud (Melayu)', render: r => h('span', { class: 'adm-pre' }, r.ms) }], c.glossary || []);
  }
  function issuesTab(c) {
    const v = c.verification || {};
    return h('div', { class: 'stack' },
      K().kv([['Kaedah', v.method], ['Tarikh', v.date], ['Kiraan', v.counts ? Object.entries(v.counts).map(([k, x]) => `${k}: ${x}`).join(' · ') : null]]),
      RPH.ui.table([{ key: 'ref', label: 'Rujukan', render: r => h('span', { class: 'adm-code' }, r.ref) }, { key: 'type', label: 'Jenis', render: r => h('span', { class: 'badge badge-amber' }, r.type) }, { key: 'detail', label: 'Butiran', render: r => K().mixed(r.detail) }], v.issues || [], { emptyText: 'Tiada isu semakan direkodkan.' }));
  }

  // ------------------------------------------------------------------ Terjemahan (4 bahasa: ms · en · ar · jawi) — docs/I18N_CONTRACT.md §3
  const TR_STATUS = { tiada: ['Tiada', 'red'], ai: ['AI-draf', 'amber'], lengkap: ['Lengkap', 'blue'], disemak: ['Disemak', 'green'] };
  const TR_KIND = { domain: 'Bidang', sk: 'SK', sp: 'SP', tp: 'TP', ps: 'Jadual TP', theme: 'Tema' };
  const trState = { kind: '', status: '', page: 0 };
  const TR_PAGE = 40;
  function trChip(st0) { const x = TR_STATUS[st0] || [st0, 'slate']; return h('span', { class: ['badge', `badge-${x[1]}`, 'tr-chip'], 'data-status': st0 }, x[0]); }
  function trCell(T, key, row, lang, onSaved) {
    const rtl = lang === 'ar' || lang === 'jawi';
    const attrs = { dir: rtl ? 'rtl' : 'ltr', lang: lang === 'jawi' ? 'ms-Arab' : lang, class: ['tr-cell', rtl ? (lang === 'ar' ? 'ar' : 'jawi') : null] };
    if (lang === row.srcLang || row.official[lang]) return h('td', attrs, h('div', { class: 'tr-orig', style: { minWidth: '11rem', whiteSpace: 'pre-wrap' } }, row.values[lang] || '—'), h('span', { class: 'badge badge-slate tr-orig-tag' }, lang === row.srcLang ? 'asal' : 'rasmi'));
    const ta = h('textarea', { class: 'input tr-input', rows: 3, style: { minWidth: '11rem' }, dir: attrs.dir, lang: attrs.lang, 'data-key': row.key, 'data-lang': lang, 'aria-label': `${row.code} — ${T.LANG_LABEL[lang]}` });
    ta.value = row.values[lang] || '';
    ta.addEventListener('change', () => {
      try {
        T.apply(key, { [row.key]: { [lang]: ta.value } }, { source: 'manual' });
        const w = T.lint(lang, ta.value);
        toast(w.length ? `Disimpan — semak: ${w.join(' ')}` : `Terjemahan ${row.code} (${lang}) disimpan.`, w.length ? 'error' : 'success', w.length ? 6000 : 2000);
        onSaved && onSaved();
      } catch (e) { toast(e.message, 'error'); }
    });
    return h('td', attrs, ta);
  }
  async function trAi(T, key, c) {
    const miss = T.missingFor(key);
    if (!miss.items.length && !(await confirm({ title: 'Semua item sudah diterjemah', message: 'Semua item sudah mempunyai terjemahan. Minta draf AI baharu bagi SEMUA item (menggantikan terjemahan sedia ada selepas anda menyemak)?', confirmLabel: 'Terjemah semula' }))) return;
    const prog = h('p', { class: 'muted' }, 'Menyediakan permintaan…');
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const m = modal({ title: 'Terjemah dengan AI', size: 'sm', body: h('div', { class: 'stack' }, prog, h('p', { class: 'muted small' }, 'Draf sahaja — tiada apa-apa disimpan sehingga anda menyemak dan menekan "Simpan".')), actions: [{ label: 'Batal', onClick: () => { ctl && ctl.abort(); } }] });
    let res;
    try {
      res = await T.withAi(key, { all: !miss.items.length, signal: ctl ? ctl.signal : undefined, onProgress: p => { if (p.phase === 'batch' || p.phase === 'send') prog.textContent = `Kelompok ${(p.batch || p.done + 1)} / ${p.total || '?'} …`; } });
    } catch (e) { m.close(); if (e.name !== 'AbortError') toast(e.message, 'error', 7000); return; }
    m.close();
    if (!res.count) return toast('AI tidak memulangkan terjemahan. Cuba lagi.', 'error');
    const rows = T.table(key).filter(r => res.map[r.key]);
    const edits = RPH.util.clone(res.map);
    const draftField = (r, l) => {
      const rtl = l === 'ar' || l === 'jawi';
      const ta = h('textarea', { class: 'input', rows: 2, dir: rtl ? 'rtl' : 'ltr', lang: l === 'jawi' ? 'ms-Arab' : l, 'aria-label': `${r.code} ${l}` });
      ta.value = edits[r.key][l];
      ta.addEventListener('input', () => { edits[r.key][l] = ta.value; });
      return h('label', { class: 'field' }, h('span', { class: 'field-label' }, T.LANG_LABEL[l]), ta);
    };
    const reviewRow = r => h('tr', null,
      h('td', null, h('span', { class: 'adm-code' }, r.code)),
      h('td', null, K().mixed(r.values[r.srcLang])),
      h('td', null, h('div', { class: 'stack' }, Object.keys(edits[r.key]).map(l => draftField(r, l)))));
    const body = h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, `${res.count} item · model ${res.model || '—'} · draf terjemahan, bukan teks rasmi DSKP. Sunting jika perlu, kemudian Simpan.`),
      res.warnings.length ? h('div', { class: 'notice' }, icon('alert'), h('div', null, h('strong', null, 'Amaran kualiti'), h('ul', null, res.warnings.slice(0, 30).map(w => h('li', null, w))))) : null,
      res.notes.length ? h('div', { class: 'notice notice-info' }, icon('info'), h('div', null, h('strong', null, 'Perlu semakan'), h('ul', null, res.notes.slice(0, 30).map(n => K().mixed(n, 'li'))))) : null,
      h('div', { class: 'table-wrap tr-review' }, h('table', { class: 'table adm-table-compact' },
        h('thead', null, h('tr', null, h('th', null, 'Kod'), h('th', null, 'Asal'), h('th', null, 'Draf AI'))),
        h('tbody', null, rows.map(reviewRow)))));
    modal({ title: 'Semak draf terjemahan AI', size: 'lg', body, actions: [{ label: 'Buang draf' }, { label: 'Simpan sebagai AI-draf', kind: 'primary', onClick: () => { const r = T.apply(key, edits, { source: 'ai' }); toast(`${r.updated} item disimpan sebagai AI-draf. Semak dan "Tandakan disemak" apabila selesai.`, 'success', 5000); redraw(); } }] });
  }
  function i18nTab(c) {
    const T = RPH.translate;
    const key = keyOf();
    if (!T) return h('div', { class: 'notice' }, icon('alert'), h('span', null, 'Modul terjemahan (js/import/translate.js) tidak dimuatkan.'));
    const all = T.table(key);
    const sl = T.sourceLangOf(c);
    const cnt = { tiada: 0, ai: 0, lengkap: 0, disemak: 0 }; all.forEach(r => { cnt[r.status] = (cnt[r.status] || 0) + 1; });
    const host = h('div', { class: 'stack' });
    const aiOn = !!(RPH.ai && typeof RPH.ai.configured === 'function' && RPH.ai.configured());
    const exportBtn = button('Eksport terjemahan', { icon: 'download', onClick: () => K().downloadJson(`TERJEMAHAN_${key}.json`, T.exportJson(key)) });
    const importBtn = button('Import terjemahan', { icon: 'upload', onClick: async () => {
      const f = await K().readJson(); if (!f) return;
      try {
        const r = T.importJson(key, f.json);
        if (!r.count) return toast('Tiada terjemahan baharu dalam fail ini.', 'info');
        if (!(await confirm({ title: 'Import terjemahan', message: `${r.count} item akan dikemas kini daripada "${f.name}"${r.unknown ? ` (${r.unknown} kunci tidak dikenali diabaikan)` : ''}. Teks asal DSKP tidak diubah.`, confirmLabel: 'Import' }))) return;
        const a = T.apply(key, r.map, { source: 'import' }); toast(`${a.updated} item dikemas kini.`, 'success'); redraw();
      } catch (e) { toast(e.message, 'error', 6000); }
    } });
    const reviewBtn = button('Tandakan disemak', { icon: 'check', disabled: !all.some(r => r.status === 'lengkap' || r.status === 'ai'), onClick: async () => {
      const n = all.filter(r => r.status === 'lengkap' || r.status === 'ai').length;
      if (!(await confirm({ title: 'Tandakan disemak', message: `Tandakan ${n} item yang lengkap (4 bahasa) sebagai DISEMAK oleh guru? Item yang belum lengkap tidak terjejas.`, confirmLabel: 'Tandakan disemak' }))) return;
      const r = T.markReviewed(key, { by: (st().get('teacher') || {}).name || null }); toast(`${r.reviewed} item ditanda disemak.`, 'success'); redraw();
    } });
    const aiCtl = aiOn
      ? button('Terjemah dengan AI', { kind: 'primary', icon: 'wand', onClick: () => trAi(T, key, c) })
      : h('div', { class: 'notice notice-info tr-ai-off' }, icon('info'), h('span', null, 'Terjemahan AI memerlukan Kunci API AI (Google Gemini percuma atau pembekal tersuai) (percuma). '),
        button('Import Data → Kunci API', { size: 'sm', onClick: () => RPH.router.go('import') }));
    host.appendChild(h('section', { class: 'card' }, h('div', { class: 'card-body stack' },
      h('div', { class: 'adm-summary-stats tr-summary' },
        h('span', { class: 'badge badge-slate' }, `Bahasa asal: ${T.LANG_LABEL[sl]}`),
        ...Object.keys(TR_STATUS).map(k => h('span', { class: ['badge', `badge-${TR_STATUS[k][1]}`] }, `${TR_STATUS[k][0]}: ${cnt[k] || 0}`))),
      h('p', { class: 'muted small' }, `Terjemahan ialah ${T.META_BY}. Teks asal DSKP tidak diubah; sunting sel untuk membetulkan (disimpan automatik apabila keluar dari sel).`),
      h('div', { class: 'row tr-actions' }, aiCtl, reviewBtn, exportBtn, importBtn))));
    const kindSel = select({ options: [{ value: '', label: 'Semua jenis' }, ...Object.entries(TR_KIND).filter(([k]) => all.some(r => r.kind === k)).map(([value, label]) => ({ value, label }))], value: trState.kind, onChange: v => { trState.kind = v; trState.page = 0; drawRows(); } });
    const stSel = select({ options: [{ value: '', label: 'Semua status' }, ...Object.entries(TR_STATUS).map(([value, x]) => ({ value, label: x[0] }))], value: trState.status, onChange: v => { trState.status = v; trState.page = 0; drawRows(); } });
    const tableHost = h('div', { class: 'stack' });
    host.appendChild(h('div', { class: 'card adm-toolbar' }, h('div', { class: 'card-body adm-toolbar-row' }, RPH.ui.field('Jenis', kindSel), RPH.ui.field('Status', stSel))));
    host.appendChild(tableHost);
    function drawRows() {
      clear(tableHost);
      const rows = T.table(key).filter(r => (!trState.kind || r.kind === trState.kind) && (!trState.status || r.status === trState.status));
      const pages = Math.max(1, Math.ceil(rows.length / TR_PAGE));
      if (trState.page >= pages) trState.page = pages - 1;
      const slice = rows.slice(trState.page * TR_PAGE, (trState.page + 1) * TR_PAGE);
      if (!rows.length) { tableHost.appendChild(empty('Tiada item sepadan.')); return; }
      const refresh = () => { const fresh = T.table(key); const byKey = new Map(fresh.map(r => [r.key, r])); tableHost.querySelectorAll('tr[data-key]').forEach(tr => { const r = byKey.get(tr.getAttribute('data-key')); const old = tr.querySelector('.tr-chip'); if (r && old) old.replaceWith(trChip(r.status)); }); };
      tableHost.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'table adm-table-compact tr-table' },
        h('thead', null, h('tr', null, h('th', null, 'Kod'), h('th', null, 'Status'), ...T.LANGS.map(l => h('th', { dir: 'ltr' }, `${T.LANG_LABEL[l]}${l === sl ? ' (asal)' : ''}`)))),
        h('tbody', null, slice.map(r => h('tr', { 'data-key': r.key }, h('td', null, h('span', { class: 'adm-code' }, r.code), h('div', { class: 'muted small' }, TR_KIND[r.kind] || r.kind)), h('td', null, trChip(r.status)), ...T.LANGS.map(l => trCell(T, key, r, l, refresh))))))));
      if (pages > 1) tableHost.appendChild(h('div', { class: 'row adm-center tr-pager' },
        button('‹ Sebelum', { size: 'sm', disabled: trState.page === 0, onClick: () => { trState.page--; drawRows(); } }),
        h('span', { class: 'muted small' }, `Halaman ${trState.page + 1} / ${pages} · ${rows.length} item`),
        button('Seterusnya ›', { size: 'sm', disabled: trState.page >= pages - 1, onClick: () => { trState.page++; drawRows(); } })));
    }
    drawRows();
    return host;
  }

  function draw() {
    clear(root);
    const subs = RPH.store.subjects();
    if (!subs.length) { root.append(RPH.ui.pageHeader('DSKP', 'Standard Kandungan & Standard Pembelajaran'), K().emptyImport('Tiada subjek lagi. Tambah subjek dahulu, kemudian import DSKP (PDF/DOCX/JSON/CSV) bagi setiap tahun yang diajar.', 'dskp', button('Ke Subjek', { kind: 'primary', onClick: () => RPH.router.go('subjek') }))); return; }
    if (!st().subject(state.subjectId)) state.subjectId = (subs.find(s => K().yearsOf(s).some(y => st().curriculum(s.id, y))) || subs[0]).id;
    const s = subj();
    const years = K().yearsOf(s);
    if (!years.includes(+state.year)) {
      // Utamakan tahun yang diajar (ada slot jadual) dan mempunyai DSKP.
      const taught = new Set(K().allSlots().filter(x => x.subjectId === s.id && x.year).map(x => +x.year));
      state.year = years.find(y => taught.has(y) && st().curriculum(s.id, y)) || years.find(y => st().curriculum(s.id, y)) || years[0];
    }
    const c = cur();
    const key = keyOf();

    const subjSel = select({ options: K().subjectOptions(), value: state.subjectId, onChange: v => { state.subjectId = v; state.year = null; state.q = ''; draw(); } });
    const yearSel = select({ options: years.map(y => ({ value: y, label: `Tahun ${y}${st().curriculum(s.id, y) ? ' ✓' : ''}` })), value: state.year, onChange: v => { state.year = +v; draw(); } });
    const search = RPH.ui.input({ type: 'search', value: state.q, placeholder: 'Cari kod (cth. 2.3) atau teks SK/SP…', onInput: U.debounce(v => {
      state.q = v;
      if (state.tab === 'std' && stdTab.drawList) return stdTab.drawList();
      // Carian sentiasa dalam tab Standard: tukar tab dan kekalkan fokus pada kotak carian.
      state.tab = 'std'; draw();
      const again = root.querySelector('input[type=search]'); if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
    }, 250) });
    search.setAttribute('aria-label', 'Cari SK/SP');

    root.append(
      RPH.ui.pageHeader('DSKP', 'Standard Kandungan (SK), Standard Pembelajaran (SP), Tahap Penguasaan dan tema — teks tepat seperti dicetak.', [
        button('Import JSON', { icon: 'upload', onClick: importJson }),
        button('Import CSV', { icon: 'upload', onClick: importCsv }),
        button('Eksport JSON', { icon: 'download', disabled: !c, onClick: () => K().downloadJson(`DSKP_${key}.json`, c) }),
      ]),
      h('div', { class: 'card adm-toolbar' }, h('div', { class: 'card-body adm-toolbar-row' },
        RPH.ui.field('Subjek', subjSel), RPH.ui.field('Tahun', yearSel),
        c ? RPH.ui.field('Carian', search, null) : null)));
    if (s.curriculumFrom || (s.id === 'PIQ' && key.startsWith('PI-'))) root.appendChild(h('div', { class: 'notice notice-info adm-gap' }, icon('info'), h('span', null, `${s.name.ms} menggunakan DSKP ${key}. Suntingan di sini turut mengubah DSKP subjek asal.`)));

    if (!c) {
      const nd = s.noDskp === true || /tiada dskp/i.test(s.curriculumNote || '');
      root.appendChild(RPH.ui.card({ body: h('div', { class: 'stack' },
        nd ? h('div', { class: 'notice' }, icon('info'), h('span', null, s.curriculumNote || 'Subjek ini ditanda tanpa DSKP.')) : null,
        empty(`Tiada data DSKP untuk ${s.name.ms} Tahun ${state.year}.`),
        h('div', { class: 'row adm-center' },
          K().importBtn('dskp', 'Import DSKP (fail KPM)', 'primary'),
          button('Import JSON', { kind: K().importBtn('dskp') ? null : 'primary', icon: 'upload', onClick: importJson }),
          button('Import CSV', { icon: 'upload', onClick: importCsv }),
          button('Tambah Manual', { icon: 'plus', onClick: createEmpty })),
        h('p', { class: 'muted small adm-center-text' }, 'Format CSV: level,code,text,domain,page (cth. "SK,1.1,Mendengar…,1,29/17"). Format JSON: rujuk data/schema/CURRICULUM_FORMAT.md.'),
        !RPH.store.hasPrivateData() ? h('div', { class: 'notice' }, icon('alert'), h('span', null, `Tiada DSKP dimuatkan lagi. Import DSKP melalui ${K().importBtn('dskp') ? 'Import Data, atau ' : ''}Tetapan → Data → Restore Backup / Import Pakej Data Peribadi.`)) : null) }));
      return;
    }

    const n = counts(c);
    const src = c.source || {};
    const issues = ((c.verification || {}).issues || []).length;
    root.appendChild(h('section', { class: 'card card-accent adm-gap' }, h('div', { class: 'card-body adm-summary' },
      h('div', { class: 'adm-summary-main' },
        h('div', { class: 'strong' }, K().mixed(src.title || `${s.name.ms} Tahun ${state.year}`)),
        h('div', { class: 'muted small' }, [c.framework, src.edition, src.file ? `Fail: ${src.file}` : null, `Kunci: ${key}`].filter(Boolean).join(' · '))),
      h('div', { class: 'adm-summary-stats' },
        h('span', { class: 'badge badge-green' }, `${n.d} bidang`), h('span', { class: 'badge badge-green' }, `${n.sk} SK`), h('span', { class: 'badge badge-green' }, `${n.sp} SP`),
        h('span', { class: 'badge badge-slate' }, `Skrip ${scriptOf(c)}`),
        issues ? h('span', { class: 'badge badge-amber' }, `${issues} isu semakan`) : null,
        K().iconBtn('info', 'Maklumat sumber', () => modal({ title: 'Sumber DSKP', size: 'md', actions: [{ label: 'Tutup', kind: 'primary' }], body: K().kv([['Tajuk', src.title], ['Fail', src.file], ['Penerbit', src.publisher], ['Edisi', src.edition], ['Halaman PDF', src.pdfPages], ['Offset halaman', src.printedPageOffset], ['SHA-256', src.sha256], ['Diimport daripada', src.importedFrom], ['Kaedah semakan', (c.verification || {}).method]].map(([a, b]) => [a, b == null ? null : String(b)])) })),
        button('Bidang', { size: 'sm', icon: 'plus', onClick: () => domainForm(c, null) }),
        K().iconBtn('trash', 'Padam DSKP ini', async () => {
          if (!(await confirm({ title: 'Padam DSKP', danger: true, confirmLabel: 'Padam', message: `Padam keseluruhan DSKP ${key}? Eksport JSON dahulu sebagai sandaran.` }))) return;
          st().update('curriculum', d => { delete d[key]; }); toast('DSKP dipadam.', 'success'); draw();
        }, 'danger')))));

    const tabItems = [{ id: 'std', label: `Standard (${n.sk} SK / ${n.sp} SP)` }, { id: 'tp', label: 'Tahap Penguasaan' }];
    if ((c.themes || []).length) tabItems.push({ id: 'themes', label: `Tema (${c.themes.length})` });
    if ((c.glossary || []).length) tabItems.push({ id: 'glossary', label: 'Glosari' });
    if (c.verification) tabItems.push({ id: 'issues', label: `Semakan${issues ? ` (${issues})` : ''}` });
    tabItems.push({ id: 'i18n', label: 'Terjemahan' });
    if (!tabItems.some(t => t.id === state.tab)) state.tab = 'std';
    root.appendChild(tabs(tabItems, state.tab, id => { state.tab = id; draw(); }));
    const body = state.tab === 'tp' ? tpTab(c) : state.tab === 'themes' ? themesTab(c) : state.tab === 'glossary' ? glossaryTab(c) : state.tab === 'issues' ? issuesTab(c) : state.tab === 'i18n' ? i18nTab(c) : stdTab(c);
    root.appendChild(body);
  }

  RPH.views.dskp = {
    title: 'DSKP', icon: 'book',
    render(el, params) {
      root = el; alive = K().mount(el, 'dskp');
      if (params && params.subject) { state.subjectId = params.subject; state.year = params.year ? +params.year : null; state.q = ''; state.tab = params.tab === 'terjemahan' || params.tab === 'i18n' ? 'i18n' : (params.tab || 'std'); }
      draw();
    },
    // Didedahkan untuk ujian.
    _validate: validateCurriculum, _csv: csvToCurriculum,
  };
})(window.RPH = window.RPH || {});
