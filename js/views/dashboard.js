/* Paparan RPH: kit kongsi RPH.rphKit (digunakan oleh dashboard, jana, mingguan, rekod, editor, kemajuan)
   + paparan Dashboard (master prompt §20–21). */
(function (RPH) {
  'use strict';
  const U = RPH.util;
  const h = (...a) => RPH.ui.h(...a);
  /** Tambah anak (rata, langkau null/false) — Element.append() asli menukar null kepada teks "null". */
  const add = (el, ...kids) => RPH.ui.append(el, kids);
  const S = () => RPH.store;

  // ======================================================================
  // KIT KONGSI
  // ======================================================================
  const AUTO_TYPES = new Set(['static', 'week', 'date', 'day', 'class', 'time-range', 'subject-line', 'subject', 'term-week', 'day-date']);
  const PHASES = [
    { id: 'induction', ms: 'Permulaan' },
    { id: 'development', ms: 'Perkembangan' },
    { id: 'closure', ms: 'Penutup' },
  ];
  const SK_KEYS = ['contentStandards'];
  const SP_KEYS = ['learningStandards'];

  /** Adakah modul/fungsi wujud? cth has('gen.generate'). */
  function has(path) {
    let o = RPH;
    for (const k of path.split('.')) { if (o == null) return false; o = o[k]; }
    return typeof o === 'function';
  }
  const MODULES = {
    'gen.generate': ['Penjana RPH', 'js/engine/generator.js'],
    'gen.planForDate': ['Perancang slot', 'js/engine/generator.js'],
    'gen.regenerate': ['Jana semula', 'js/engine/generator.js'],
    'gen.reflectionText': ['Teks refleksi', 'js/engine/generator.js'],
    'check.beforeExport': ['Penyemak RPH', 'js/engine/validator.js'],
    'render.rph': ['Pratonton A4', 'js/export/render.js'],
    'render.week': ['Pratonton minggu', 'js/export/render.js'],
    'print.rphs': ['Cetak / PDF', 'js/export/print.js'],
    'docx.export': ['Eksport DOCX', 'js/export/docx.js'],
  };
  function missing(path, extra) {
    const [name, file] = MODULES[path] || [path, ''];
    return notice(`Modul ${name} (${file}) belum tersedia. Fungsi ini dilumpuhkan sehingga modul dimuatkan.${extra ? ' ' + extra : ''}`, 'error');
  }
  function notice(msg, kind, ...extra) {
    return h('div', { class: ['notice', kind ? `notice-${kind}` : ''], role: kind === 'error' ? 'alert' : 'status' },
      RPH.ui.icon(kind === 'error' ? 'alert' : 'info'), h('div', { class: 'rphv-notice-body' }, h('div', null, msg), ...extra));
  }

  // ---------- Subjek / kelas / masa ----------
  const subj = id => (id && S().subject(id)) || null;
  const subjName = id => { const s = subj(id); return s ? (s.name.ms || s.code) : (id || '—'); };
  const subjCode = id => { const s = subj(id); return s ? s.code : (id || ''); };
  const subjColor = id => (subj(id) || {}).color || '#64748b';
  const classObj = id => S().classes().find(c => c.id === id) || null;
  const className = id => { const c = classObj(id); return c ? c.name : (id || '—'); };
  const dateLong = iso => (iso ? `${U.dayNameMs(U.dow(iso))}, ${U.fmtDate(iso, 'long')}` : '—');
  const dateShort = iso => (iso ? `${U.dayNameMs(U.dow(iso)).slice(0, 3)} ${U.fmtDate(iso)}` : '—');
  const timeLabel = (a, b) => (a && b ? `${a}–${b}` : 'Masa belum ditetapkan');
  function subjectDot(id) { return h('span', { class: 'subject-dot', style: { background: subjColor(id) }, 'aria-hidden': 'true' }); }
  function subjectTag(id) { return h('span', { class: 'rphv-subj', style: { '--subj': subjColor(id) } }, subjectDot(id), subjName(id)); }

  /** Teks dengan arah automatik (Arab/Jawi → RTL). */
  function rtl(text, lang) {
    if (text == null || text === '') return '';
    const s = String(text);
    if (!U.isArabicScript(s)) return document.createTextNode(s);
    return h('span', { dir: 'rtl', lang: lang || 'ar', class: 'ar rphv-rtl' }, s);
  }
  function rtlBlock(text, lang, cls) {
    const ar = U.isArabicScript(text || '');
    return h('div', { class: ['rphv-textblock', ar ? 'ar' : '', cls], dir: ar ? 'rtl' : 'ltr', lang: ar ? (lang || 'ar') : null }, text || '');
  }

  // ---------- Templat / medan ----------
  function template(rph) {
    if (!rph) return null;
    const s = subj(rph.subjectId);
    return S().template(rph.templateId) || (s && S().template(s.defaultTemplateId)) || S().template('tpl-generic-kpm') || null;
  }
  function variantKeys(tpl, variant) {
    if (!tpl) return [];
    const v = tpl.variants || {};
    return v[variant] || v[tpl.defaultVariant] || v.standard || Object.values(v)[0] || tpl.fields.map(f => f.key);
  }
  function fieldLabel(f) {
    const l = f.label || {};
    const main = l.ms || l.jawi || l.ar || f.key;
    const alt = l.ms ? (l.jawi || l.ar || null) : null;
    return { main, alt, altLang: l.jawi ? 'ms-Arab' : 'ar' };
  }
  const langOf = tpl => (tpl && tpl.labelLang === 'jawi' ? 'ms-Arab' : 'ar');

  // ---------- Nilai RPH ----------
  const arr = v => (Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]));
  function skOf(r) { const v = r.values || {}; return SK_KEYS.flatMap(k => arr(v[k])).filter(x => typeof x === 'string'); }
  function spOf(r) { const v = r.values || {}; return SP_KEYS.flatMap(k => arr(v[k])).filter(x => typeof x === 'string'); }
  function topicOf(r) { const v = r.values || {}; return typeof v.topic === 'string' ? v.topic : ''; }
  function themeOf(r) {
    const v = r.values || {};
    if (typeof v.theme === 'string' && v.theme) return v.theme;
    if (v.subjectDomain) return RPH.banks ? RPH.banks.valueLabel('pi-bidang', v.subjectDomain, 'jawi') : String(v.subjectDomain);
    return '';
  }

  /** Nilai paparan medan auto (hanya ditulis semula jika kunci sudah wujud dalam values). */
  function autoValue(f, r) {
    const dow = r.date ? U.dow(r.date) : r.dow;
    switch (f.type) {
      case 'week': return r.week != null ? String(r.week) : '';
      case 'date': return U.fmtDate(r.date, f.dateFormat || 'DD/MM/YYYY');
      case 'day': return f.dayOptions ? f.dayOptions[dow] : U.dayNameMs(dow);
      case 'class': return r.className || className(r.classId);
      case 'time-range': return U.timeRange(r.start, r.end);
      case 'subject-line': return f.valueTemplate ? f.valueTemplate.replace('{yearOrdinalAr}', (f.yearOrdinalAr || {})[r.year] || r.year) : subjName(r.subjectId);
      case 'subject': {
        // Nama subjek ikut bahasa templat (BI/Arab): name[labelLang] → subjectNames templat → nama BM.
        const t = template(r); const lang = t && t.labelLang; const n = ((subj(r.subjectId) || {}).name) || {};
        return (lang && lang !== 'ms' && (n[lang] || (f.subjectNames && f.subjectNames[r.subjectId]))) || subjName(r.subjectId);
      }
      case 'term-week': { const t = r.date ? RPH.cal.termOf(r.date) : null; return `${t || ''} / ${r.week ?? ''}`; }
      case 'day-date': return `${f.dayOptions ? f.dayOptions[dow] : U.dayNameMs(dow)} / ${U.fmtDate(r.date, f.dateFormat || 'DD/MM/YYYY')}`;
      default: return undefined;
    }
  }
  function refreshAutoValues(r) {
    const tpl = template(r); if (!tpl || !r.values) return r;
    for (const f of tpl.fields) {
      if (!AUTO_TYPES.has(f.type) || f.type === 'static' || !(f.key in r.values)) continue;
      const v = autoValue(f, r); if (v !== undefined) r.values[f.key] = v;
    }
    return r;
  }
  /** Tetapkan tarikh + slot (atau {start,end}) dan kira semula minggu, hari, minit. */
  function applySlot(r, date, slot) {
    r.date = date;
    r.dow = U.dow(date);
    r.week = RPH.cal.schoolWeek(date);
    r.rptWeek = RPH.cal.rptWeek(r.week, r.subjectId);
    if (slot) {
      if (slot.start !== undefined) r.start = slot.start || null;
      if (slot.end !== undefined) r.end = slot.end || null;
      if (slot.id) { r.slotId = slot.id; r.timetableVersionId = slot.versionId || r.timetableVersionId || null; } else if (slot.start !== undefined) r.slotId = null;
    }
    r.minutes = U.minutesBetween(r.start, r.end) || (slot && slot.minutes) || r.minutes || null;
    return refreshAutoValues(r);
  }

  // ---------- RPT (sandaran jika penjana tiada) ----------
  function rptLessons(subjectId, year, date) {
    const r = S().rpt(subjectId, year); if (!r) return [];
    const rw = RPH.cal.rptWeek(RPH.cal.schoolWeek(date), subjectId);
    if (Array.isArray(r.rows)) return r.rows.filter(x => x.rptWeek === rw);
    if (Array.isArray(r.weeks)) { const w = r.weeks.find(x => x.rptWeek === rw); return w ? (w.lessons || []) : []; }
    return [];
  }
  function lessonLabel(l) {
    if (!l) return '';
    if (typeof l === 'string') return l;
    if (Array.isArray(l)) return l.map(lessonLabel).filter(Boolean).join(' · ');
    const main = l.topic || l.title || l.lesson || (Array.isArray(l.content) ? l.content[0] : l.content) || '';
    const ctx = l.theme || l.bidang || l.unit || '';
    return [main, ctx && ctx !== main ? `(${ctx})` : ''].filter(Boolean).join(' ');
  }

  // ---------- Slot & perancangan ----------
  function findRph(date, slot) {
    if (!slot) return null;
    const list = S().rphList({ date });
    return list.find(r => r.slotId && r.slotId === slot.id) ||
      list.find(r => r.classId === slot.classId && r.subjectId === slot.subjectId && (!slot.start || !r.start || r.start === slot.start)) || null;
  }
  function dayStatus(iso) {
    const d = RPH.cal.day(iso);
    if (d.holiday) return { kind: 'holiday', label: `Cuti: ${d.holiday}`, short: 'Cuti', day: d };
    if (d.schoolDay) return { kind: 'school', label: 'Hari persekolahan', short: 'Sekolah', day: d };
    if (d.outside) return { kind: 'outside', label: 'Di luar takwim sekolah', short: 'Luar takwim', day: d };
    if (d.dow === 0 || d.dow === 6) return { kind: 'weekend', label: 'Hujung minggu', short: 'Hujung minggu', day: d };
    return { kind: 'off', label: 'Bukan hari persekolahan', short: 'Tiada PdP', day: d };
  }
  /** Perancangan slot bagi tarikh: guna gen.planForDate jika ada, jika tidak jadual + takwim terus. */
  function plan(iso) {
    let items = null, viaGen = false;
    if (has('gen.planForDate')) {
      try { items = RPH.gen.planForDate(iso) || []; viaGen = true; } catch (e) { RPH.reportError('perancangan slot', e); items = null; }
    }
    const ds = dayStatus(iso);
    if (!items) {
      items = RPH.cal.slotsFor(iso).map(slot => ({ date: iso, slot, existingRphId: null, rptLesson: null, holiday: ds.kind === 'school' ? null : ds.label }));
    }
    return items.filter(it => it && it.slot).map(it => {
      const date = it.date || iso;
      const rph = (it.existingRphId && S().getRph(it.existingRphId)) || findRph(date, it.slot);
      let lesson = it.rptLesson || null;
      if (!lesson && !viaGen) { const ls = rptLessons(it.slot.subjectId, it.slot.year, date); lesson = ls.length ? ls : null; }
      // holiday daripada penjana boleh jadi objek {name, events, …} → normalkan kepada label teks.
      const hol = it.holiday ? (typeof it.holiday === 'object' ? (it.holiday.name || ds.label) : String(it.holiday)) : null;
      return { ...it, date, rph: rph || null, rptLesson: lesson, holiday: hol, holidayInfo: it.holiday || null };
    });
  }

  // ---------- Penjanaan ----------
  function generate(items) {
    const created = [], errors = [];
    if (!has('gen.generate')) return { created, errors, unavailable: true };
    if (S().isArchived && S().isArchived()) { RPH.ui.toast(`Tahun akademik ${S().activeYear()} diarkib (baca sahaja) — RPH tidak dijana. Nyaharkib di Tetapan → Tahun Akademik.`, 'error', 6000); return { created, errors, skipped: items.length, archived: true }; }
    let skipped = 0;
    for (const it of items) {
      // Elak pendua: slot yang sudah ada RPH (cth. klik berganda / senarai lapuk) dilangkau.
      if (!it || !it.slot || findRph(it.date, it.slot)) { skipped++; continue; }
      try {
        const r = RPH.gen.generate({ date: it.date, slot: it.slot });
        if (!r || !r.id) throw new Error('Penjana tidak memulangkan RPH yang sah');
        S().saveRph(r);
        created.push(r);
      } catch (e) {
        console.error('[RPH] jana', it, e);
        errors.push({ item: it, error: e });
      }
    }
    return { created, errors, skipped };
  }
  function reportGenerate(res, { none = 'Tiada slot baharu untuk dijana.' } = {}) {
    const { toast } = RPH.ui;
    if (res.unavailable) { toast('Modul penjana (generator.js) belum tersedia — RPH tidak dapat dijana.', 'error', 6000); return; }
    if (res.created.length) toast(`${res.created.length} RPH draf dijana dan disimpan.`, 'success', 4500);
    if (res.errors.length) {
      const first = res.errors[0];
      toast(`${res.errors.length} slot gagal dijana: ${first.error && first.error.message ? first.error.message : first.error}`, 'error', 8000);
    }
    if (!res.created.length && !res.errors.length) toast(none, 'info');
  }

  /** RPH kosong (tanpa penjana): hanya metadata + nilai lalai templat + SK/SP pilihan guru. */
  function blankRph(inp) {
    const slot = inp.slot || null;
    const subjectId = slot ? slot.subjectId : inp.subjectId;
    const s = subj(subjectId) || {};
    const cls = classObj(slot ? slot.classId : inp.classId);
    const tplId = inp.templateId || s.defaultTemplateId || 'tpl-generic-kpm';
    const tpl = S().template(tplId);
    const r = {
      id: U.uid('rph'), academicYearId: S().activeYear(), date: inp.date, week: null, rptWeek: null, dow: null,
      start: null, end: null, minutes: null,
      classId: cls ? cls.id : (slot ? slot.classId : inp.classId), className: cls ? cls.name : (slot ? slot.className : inp.classId),
      year: +(slot ? slot.year : inp.year) || (cls && cls.year) || null, subjectId,
      templateId: tplId, variant: inp.variant || (tpl && tpl.defaultVariant) || 'standard',
      timetableVersionId: null, slotId: null, status: 'draft', values: {}, provenance: [],
      warnings: ['RPH kosong dicipta tanpa penjana — isi objektif, aktiviti dan pentaksiran.'],
      carriedFrom: null, carriedTo: null, generatedBy: 'manual',
    };
    applySlot(r, inp.date, slot || { start: inp.start || null, end: inp.end || null });
    if (tpl) {
      for (const f of tpl.fields) if (f.defaultValue != null) r.values[f.key] = U.clone(f.defaultValue);
      for (const [k, v] of Object.entries(tpl.defaults || {})) if (!/Note$/.test(k)) r.values[k] = U.clone(v);
      for (const f of tpl.fields) if (AUTO_TYPES.has(f.type) && f.type !== 'static') r.values[f.key] = autoValue(f, r);
    }
    if (inp.sk) r.values.contentStandards = [...inp.sk];
    if (inp.sp) r.values.learningStandards = [...inp.sp];
    if (inp.topic) r.values.topic = inp.topic;
    if (inp.theme) r.values.theme = inp.theme;
    r.provenance = RPH.curr.provenanceFor(r.subjectId, r.year, [...(inp.sk || []), ...(inp.sp || [])]);
    return r;
  }

  // ---------- Salin / bawa / gandakan ----------
  function resetSession(r, { keepTp = false } = {}) {
    const tpl = template(r); const v = r.values || (r.values = {});
    const cls = classObj(r.classId);
    for (const f of tpl ? tpl.fields : []) {
      if (f.type === 'reflection') {
        const old = v[f.key] && typeof v[f.key] === 'object' ? v[f.key] : {};
        const d = S().defaultReflection ? S().defaultReflection({ subjectId: r.subjectId, year: r.year, classId: r.classId }) : null;
        v[f.key] = d ? { ...d, postponed: false, carryWeek: null, lines: U.clone(old.lines || {}) }
          : { total: cls && cls.enrolment ? cls.enrolment : null, achieved: null, notAchieved: null, absent: null, postponed: false, carryWeek: null, lines: U.clone(old.lines || {}) };
      } else if (f.type === 'postponement') {
        v[f.key] = f.defaultValue != null ? f.defaultValue : '';
      } else if (!keepTp && f.key === 'tp') {
        v[f.key] = '';
      }
    }
    return r;
  }
  function freshCopy(orig) {
    const c = U.clone(orig);
    c.id = U.uid('rph'); c.status = 'draft'; c.carriedFrom = null; c.carriedTo = null;
    c.createdAt = null; c.updatedAt = null; c.warnings = [];
    return c;
  }
  function duplicate(orig) {
    const c = freshCopy(orig);
    c.duplicatedFrom = orig.id;
    return S().saveRph(c);
  }
  /** Slot seterusnya bagi kelas + subjek yang sama (langkau cuti / bukan hari sekolah). */
  function nextSlots(r, n = 6) {
    const out = [];
    let d = r.date;
    for (let i = 0; i < 220 && out.length < n; i++) {
      d = U.addDays(d, 1);
      const day = RPH.cal.day(d);
      if (!day.schoolDay) continue;
      for (const slot of RPH.cal.slotsFor(d)) {
        if (slot.classId === r.classId && slot.subjectId === r.subjectId) out.push({ date: d, slot, day, rph: findRph(d, slot) });
      }
    }
    return out.slice(0, n);
  }
  function carryForward(orig, target) {
    const c = freshCopy(orig);
    c.carriedFrom = orig.id;
    applySlot(c, target.date, target.slot);
    resetSession(c, { keepTp: true });
    c.warnings = [`Dibawa daripada ${U.fmtDate(orig.date)} (Minggu ${orig.week ?? '—'}).`];
    S().saveRph(c);
    const o = U.clone(orig);
    o.status = 'dibawa'; o.carriedTo = c.id;
    const tpl = template(o);
    const rf = tpl && tpl.fields.find(f => f.type === 'reflection');
    if (rf && o.values) {
      const cur = o.values[rf.key] && typeof o.values[rf.key] === 'object' ? o.values[rf.key] : {};
      cur.carryWeek = c.week;
      if ((rf.lines || []).some(l => l.id === 'carryForward')) cur.lines = { ...(cur.lines || {}), carryForward: true };
      o.values[rf.key] = cur;
    }
    S().saveRph(o);
    return { copy: c, orig: o };
  }
  /** Slot kelas lain bagi subjek sama dalam minggu yang sama. */
  function classSlotInWeek(r, classId) {
    if (r.week == null) return null;
    const all = RPH.cal.slotsForWeek(r.week).filter(x => x.slot.classId === classId && x.slot.subjectId === r.subjectId)
      .map(x => ({ ...x, rph: findRph(x.date, x.slot) }));
    return all.find(x => !x.rph) || all[0] || null;
  }
  function copyToClass(orig, classId) {
    const cls = classObj(classId);
    const c = freshCopy(orig);
    c.duplicatedFrom = orig.id;
    c.classId = classId; c.className = cls ? cls.name : classId; c.year = cls ? cls.year : c.year;
    const m = classSlotInWeek(orig, classId);
    if (m) applySlot(c, m.date, m.slot);
    else {
      c.slotId = null; refreshAutoValues(c);
      c.warnings.push(`Tiada slot ${subjCode(c.subjectId)} untuk ${c.className} dalam Minggu ${orig.week ?? '—'} — tarikh dan masa disalin daripada RPH asal; sila semak.`);
    }
    if (cls && orig.year && cls.year !== orig.year) c.warnings.push(`Tahun kelas (${cls.year}) berbeza daripada RPH asal (${orig.year}) — semak SK/SP.`);
    resetSession(c, { keepTp: false });
    return S().saveRph(c);
  }

  // ---------- Semakan & eksport ----------
  const msgText = m => (m == null ? '' : typeof m === 'string' ? m : (m.message || m.msg || m.text || JSON.stringify(m)));
  function runCheck(r) {
    if (!has('check.beforeExport')) return null;
    try {
      const res = RPH.check.beforeExport(r) || {};
      return { errors: arr(res.errors), warnings: arr(res.warnings) };
    } catch (e) { console.error(e); return { errors: [`Semakan gagal: ${e.message}`], warnings: [] }; }
  }
  function rphTitle(r) { return `${subjCode(r.subjectId)} · ${r.className || className(r.classId)} · ${dateShort(r.date)}${r.start ? ' ' + r.start : ''}`; }
  /** Papar keputusan semakan sebelum eksport; guru boleh "Teruskan juga" (§69). */
  function validateBefore(list) {
    if (!has('check.beforeExport')) {
      RPH.ui.toast('Penyemak (validator.js) belum tersedia — eksport tanpa semakan.', 'info', 5000);
      return Promise.resolve(true);
    }
    const results = list.map(r => ({ rph: r, ...runCheck(r) })).filter(x => x.errors.length || x.warnings.length);
    if (!results.length) return Promise.resolve(true);
    const nE = U.sum(results.map(x => x.errors.length)), nW = U.sum(results.map(x => x.warnings.length));
    return new Promise(res => {
      let done = false;
      const body = h('div', { class: 'rphv-check-modal' },
        h('p', { class: 'muted' }, `${nE} ralat dan ${nW} amaran ditemui dalam ${results.length} daripada ${list.length} RPH. Guru boleh membetulkan dahulu atau meneruskan eksport.`),
        results.map(x => h('div', { class: 'rphv-check-group' },
          h('div', { class: 'strong' }, rphTitle(x.rph)),
          checkList(x.errors, x.warnings))));
      RPH.ui.modal({ title: 'Semakan sebelum eksport', size: 'md', body, onClose: () => { if (!done) res(false); },
        actions: [{ label: 'Batal', onClick: () => { done = true; res(false); } }, { label: 'Teruskan juga', kind: 'primary', icon: 'forward', onClick: () => { done = true; res(true); } }] });
    });
  }
  function checkList(errors, warnings, onPick) {
    const item = (m, kind) => {
      const key = m && typeof m === 'object' ? (m.field || m.key) : null;
      return h('li', { class: ['rphv-check-item', `is-${kind}`] }, RPH.ui.icon(kind === 'error' ? 'alert' : 'info', 15),
        onPick && key ? h('button', { type: 'button', class: 'rphv-linkbtn', onClick: () => onPick(key) }, msgText(m)) : h('span', null, msgText(m)));
    };
    if (!errors.length && !warnings.length) return h('p', { class: 'rphv-check-ok' }, RPH.ui.icon('check', 15), ' Tiada isu ditemui.');
    return h('ul', { class: 'rphv-check-list' }, errors.map(m => item(m, 'error')), warnings.map(m => item(m, 'warn')));
  }
  function fileName(list, ext) {
    if (has('print.filename')) { try { const n = RPH.print.filename(list, ext); if (n) return n; } catch (e) { console.warn(e); } }
    const clean = s => String(s || '').replace(/[^A-Za-z0-9]+/g, '');
    if (list.length === 1) { const r = list[0]; return `RPH_${clean(subjCode(r.subjectId))}_${clean(r.className || r.classId)}_${U.fmtDate(r.date, 'DD-MM-YYYY')}.${ext}`; }
    const weeks = [...new Set(list.map(r => r.week))]; const yr = String((list[0] && list[0].date) || '').slice(0, 4);
    return weeks.length === 1 ? `RPH_MINGGU${weeks[0]}_${yr}.${ext}` : `RPH_${list.length}_${yr}.${ext}`;
  }
  async function exportDocx(list, filename) {
    const { toast } = RPH.ui;
    if (!list.length) { toast('Tiada RPH untuk dieksport.'); return; }
    if (!has('docx.export')) { toast('Modul eksport DOCX (docx.js) belum tersedia.', 'error', 6000); return; }
    if (!(await validateBefore(list))) return;
    const name = filename || fileName(list, 'docx');
    try { toast('Menjana DOCX…'); await RPH.docx.export(list, name); toast(`DOCX disediakan: ${name}`, 'success', 5000); }
    catch (e) { RPH.reportError('eksport DOCX', e); }
  }
  async function printList(list, { title, pdf } = {}) {
    const { toast } = RPH.ui;
    if (!list.length) { toast('Tiada RPH untuk dicetak.'); return; }
    if (!has('print.rphs')) { toast('Modul cetak (print.js) belum tersedia.', 'error', 6000); return; }
    if (!(await validateBefore(list))) return;
    if (pdf) toast('Dalam dialog cetak, pilih destinasi "Simpan sebagai PDF".', 'info', 7000);
    try { await RPH.print.rphs(list, { title: title || fileName(list, 'pdf').replace(/\.pdf$/, '') }); }
    catch (e) { RPH.reportError('cetak', e); }
  }

  // ---------- Kegemaran (§48) ----------
  const FAV_KINDS = { activities: 'Aktiviti', pak21: 'PAK21', bbm: 'BBM', reflection: 'Refleksi' };
  function favList(kind) { const f = S().get('favourites') || {}; return Array.isArray(f[kind]) ? f[kind] : []; }
  const favKey = it => (it && typeof it === 'object' ? (it.text || it.id || JSON.stringify(it)) : String(it));
  function favHas(kind, item) { const k = favKey(item); return favList(kind).some(x => favKey(x) === k); }
  function favToggle(kind, item) {
    const k = favKey(item); let added = false;
    S().update('favourites', d => {
      d = d && typeof d === 'object' ? d : {};
      const list = Array.isArray(d[kind]) ? d[kind] : [];
      if (list.some(x => favKey(x) === k)) d[kind] = list.filter(x => favKey(x) !== k);
      else { d[kind] = [U.clone(item), ...list].slice(0, 200); added = true; }
      return d;
    });
    RPH.ui.toast(added ? `Disimpan ke Kegemaran ${FAV_KINDS[kind] || kind}.` : `Dibuang daripada Kegemaran ${FAV_KINDS[kind] || kind}.`, added ? 'success' : 'info');
    return added;
  }
  function starButton(kind, getItem, { label } = {}) {
    const btn = h('button', { type: 'button', class: 'btn-icon rphv-star', title: label || 'Simpan ke Kegemaran', 'aria-label': label || 'Simpan ke Kegemaran' }, RPH.ui.icon('star', 16));
    const sync = () => { const it = getItem(); const on = it != null && it !== '' && favHas(kind, it); btn.classList.toggle('is-on', on); btn.setAttribute('aria-pressed', String(on)); };
    btn.addEventListener('click', () => { const it = getItem(); if (it == null || it === '' || (typeof it === 'object' && !it.text && !it.id)) { RPH.ui.toast('Tiada kandungan untuk disimpan.'); return; } favToggle(kind, it); sync(); });
    sync();
    btn.syncFav = sync;
    return btn;
  }
  /** Modal pilih item kegemaran → onPick(item). */
  function pickFavourite(kind, { title, render } = {}) {
    return new Promise(res => {
      const list = favList(kind);
      let done = false;
      let m;
      const body = list.length
        ? h('div', { class: 'rphv-fav-list' }, list.map(it => h('button', { type: 'button', class: 'rphv-fav-item', onClick: () => { done = true; res(it); m.close(); } },
          render ? render(it) : rtlBlock(favKey(it)))))
        : RPH.ui.empty(`Belum ada Kegemaran ${FAV_KINDS[kind] || kind}. Tekan ikon bintang pada medan untuk menyimpan.`);
      m = RPH.ui.modal({ title: title || `Kegemaran ${FAV_KINDS[kind] || kind}`, size: 'md', body, onClose: () => { if (!done) res(null); } });
    });
  }

  // ---------- Komponen kecil ----------
  function segmented(options, value, onChange, { label, size } = {}) {
    const wrap = h('div', { class: ['rphv-seg', size ? `rphv-seg-${size}` : ''], role: 'group', 'aria-label': label || null });
    const btns = options.map(o => {
      const b = h('button', { type: 'button', class: ['rphv-seg-btn', o.value === value ? 'is-on' : ''], 'aria-pressed': String(o.value === value), title: o.title || null, disabled: o.disabled },
        o.icon ? RPH.ui.icon(o.icon, 15) : null, h('span', null, o.label));
      b.addEventListener('click', () => { btns.forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); onChange(o.value); });
      return b;
    });
    btns.forEach(b => wrap.appendChild(b));
    return wrap;
  }
  /** Textarea/input yang menukar arah (RTL/LTR) ikut kandungan; tinggi automatik. */
  function smartText({ value = '', rtl: rtlDefault = false, lang = 'ar', rows = 2, placeholder = '', onInput, multiline = true, cls, ariaLabel } = {}) {
    const el = multiline ? h('textarea', { class: ['input', 'rphv-auto', cls], rows, placeholder, 'aria-label': ariaLabel || null })
      : h('input', { class: ['input', cls], type: 'text', placeholder, 'aria-label': ariaLabel || null });
    el.value = value == null ? '' : String(value);
    const setDir = () => { const v = el.value; const isR = v ? U.isArabicScript(v) : rtlDefault; el.dir = isR ? 'rtl' : 'ltr'; if (isR) el.lang = lang; else el.removeAttribute('lang'); };
    setDir();
    el.addEventListener('input', () => { setDir(); if (onInput) onInput(el.value, el); });
    return el;
  }
  function statusOptions() { return Object.entries(RPH.ui.STATUS).map(([value, [label]]) => ({ value, label })); }
  function weekLabel(n) {
    const w = RPH.cal.week(n);
    return w ? `Minggu ${w.week} · ${U.fmtDate(w.start)}–${U.fmtDate(w.end)}${w.term ? ' · Penggal ' + w.term : ''}` : `Minggu ${n}`;
  }
  /** Minggu sekolah semasa atau terdekat bagi tarikh. */
  function weekFor(iso) {
    const w = RPH.cal.schoolWeek(iso); if (w != null) return w;
    const ws = RPH.cal.weeks(); if (!ws.length) return null;
    const next = ws.find(x => x.start >= iso); return next ? next.week : ws[ws.length - 1].week;
  }

  RPH.rphKit = {
    AUTO_TYPES, PHASES, has, missing, notice, subj, subjName, subjCode, subjColor, subjectDot, subjectTag, classObj, className,
    dateLong, dateShort, timeLabel, rtl, rtlBlock, template, variantKeys, fieldLabel, langOf, arr, skOf, spOf, topicOf, themeOf,
    autoValue, refreshAutoValues, applySlot, rptLessons, lessonLabel, findRph, dayStatus, plan, generate, reportGenerate, blankRph,
    resetSession, duplicate, nextSlots, carryForward, classSlotInWeek, copyToClass, msgText, runCheck, rphTitle, validateBefore,
    checkList, fileName, exportDocx, printList, FAV_KINDS, favList, favHas, favToggle, favKey, starButton, pickFavourite,
    segmented, smartText, statusOptions, weekLabel, weekFor,
  };

  // ======================================================================
  // PERSEDIAAN — "MULA DI SINI" (edisi kosong; juga sebarang stor yang belum lengkap)
  // RPH.onboarding: status langkah persediaan + pautan Import Data / editor, dikongsi oleh paparan lain.
  // ======================================================================
  /** Paparan Import Data (#/import) didaftarkan oleh js/views/import.js — butang import hanya dipaparkan jika ada. */
  const hasImportView = () => !!(RPH.views && (RPH.views.import || RPH.views['import-data']));
  const importParams = kind => (kind ? { jenis: kind } : null);
  function importButton(kind, { label = 'Import', kind: btnKind = null, size = 'sm' } = {}) {
    if (!hasImportView()) return null;
    return RPH.ui.button(label, { kind: btnKind, size, icon: 'upload', onClick: () => RPH.router.go('import', null, importParams(kind)) });
  }
  function goButton(label, view, params, { kind = null, icon = null, size = 'sm' } = {}) {
    return RPH.ui.button(label, { kind, size, icon, onClick: () => RPH.router.go(view, null, params || null) });
  }

  /** Langkah persediaan (dikira langsung daripada stor tahun aktif). */
  function setupSteps() {
    const st = S();
    const school = st.get('school') || {}; const teacher = st.get('teacher') || {};
    const ay = st.academicYear() || null;
    const cal = st.get('calendar') || {};
    const weeks = cal.weeks || [];
    const tt = st.get('timetable') || {};
    const versions = (tt.versions || []).filter(v => (v.slots || []).length);
    const pdp = versions.flatMap(v => v.slots || []).filter(s => s.kind === 'PdP');
    const classes = st.classes();
    const counts = st.studentCounts();
    const nCounted = classes.filter(c => +c.enrolment > 0).length;
    const subjects = st.subjects();
    const curr = Object.keys(st.get('curriculum') || {});
    const rpt = Object.keys(st.get('rpt') || {});
    const tpls = st.templates();
    const fmt = iso => U.fmtDate(iso);
    const list = xs => (xs.length > 6 ? `${xs.slice(0, 6).join(', ')} …` : xs.join(', '));
    // Gabungan subjek-tahun yang diajar (jadual) tanpa DSKP / RPT.
    const combos = [...new Set(pdp.filter(s => s.subjectId && s.year && s.rph !== false).map(s => `${s.subjectId}-${s.year}`))];
    const noCurr = combos.filter(c => { const [sid, y] = c.split(/-(?=\d+$)/); return !st.curriculum(sid, +y) && sid !== 'TASMIK'; });
    const noRpt = combos.filter(c => { const [sid, y] = c.split(/-(?=\d+$)/); return !st.rpt(sid, +y); });
    return [
      { id: 'sekolah', label: 'Profil sekolah', done: !!(school.name || school.shortName),
        detail: school.name || school.shortName ? (school.name || school.shortName) : 'Nama sekolah belum diisi.',
        links: [['Isi profil', 'tetapan', { tab: 'sekolah' }]] },
      { id: 'guru', label: 'Profil guru', done: !!(teacher.fullName || teacher.name),
        detail: teacher.fullName || teacher.name ? [teacher.fullName || teacher.name, teacher.position].filter(Boolean).join(' · ') : 'Nama guru belum diisi.',
        links: [['Isi profil', 'tetapan', { tab: 'guru' }]] },
      { id: 'tahun', label: 'Tahun akademik', done: !!(ay && ay.startDate && ay.endDate) || weeks.length > 0,
        detail: ay ? `${ay.label || ay.id} · ${ay.startDate && ay.endDate ? `${fmt(ay.startDate)} – ${fmt(ay.endDate)}` : weeks.length ? `ikut takwim (${fmt(weeks[0].start)} – ${fmt(weeks[weeks.length - 1].end || weeks[weeks.length - 1].start)})` : 'tarikh mula & akhir sesi belum ditetapkan'}` : 'Tiada tahun akademik.',
        links: [['Tetapkan', 'tetapan', { tab: 'tahun' }]] },
      { id: 'takwim', label: 'Takwim sekolah', done: weeks.length > 0, importKind: 'takwim',
        detail: weeks.length ? `${weeks.length} minggu persekolahan · ${(cal.days || []).filter(d => d.holiday && d.dow >= 1 && d.dow <= 5).length} hari cuti (hari bekerja)` : 'Takwim belum dimuatkan — minggu sekolah dan cuti tidak diketahui.',
        links: [['Takwim', 'takwim']] },
      { id: 'jadual', label: 'Jadual waktu', done: pdp.length > 0, importKind: 'jadual',
        detail: pdp.length ? `${pdp.length} slot PdP · ${versions.length} versi (${list(versions.map(v => v.label || v.id))})` : 'Tiada slot PdP dalam jadual waktu.',
        links: [['Jadual Waktu', 'jadual']] },
      { id: 'kelas', label: 'Kelas & bilangan murid', done: classes.length > 0, importKind: 'kelas',
        detail: classes.length ? `${classes.length} kelas (${list(classes.map(c => c.name))}) · bilangan murid: ${nCounted || Object.keys(counts).length ? `${nCounted} kelas + ${Object.keys(counts).length} subjek-tahun ditetapkan` : 'belum diisi (refleksi memaparkan kotak kosong)'}` : 'Tiada kelas untuk tahun akademik ini.',
        links: [['Kelas', 'tetapan', { tab: 'kelas' }], ['Bilangan murid', 'tetapan', { tab: 'murid' }]] },
      { id: 'subjek', label: 'Subjek', done: subjects.length > 0, importKind: 'subjek',
        detail: subjects.length ? `${subjects.length} subjek: ${list(subjects.map(s => s.code || s.id))}` : 'Tiada subjek.',
        links: [['Subjek', 'subjek']] },
      { id: 'dskp', label: 'DSKP', done: curr.length > 0, importKind: 'dskp',
        detail: curr.length ? `${curr.length} DSKP: ${list(curr)}${noCurr.length ? ` · tiada untuk ${list(noCurr)}` : ''}` : 'DSKP belum dimuatkan — SK/SP tidak dapat dicadangkan.',
        links: [['DSKP', 'dskp']] },
      { id: 'rpt', label: 'RPT', done: rpt.length > 0, importKind: 'rpt',
        detail: rpt.length ? `${rpt.length} RPT (${ay ? ay.label || ay.id : st.activeYear()}): ${list(rpt)}${noRpt.length ? ` · tiada untuk ${list(noRpt)}` : ''}` : 'RPT belum dimuatkan — topik mingguan tidak dapat dipadankan.',
        links: [['RPT', 'rpt']] },
      { id: 'templat', label: 'Templat RPH', done: tpls.length > 0, importKind: 'templat',
        detail: tpls.length ? `${tpls.length} templat: ${list(tpls.map(t => (t.name && (t.name.ms || t.name.ar)) || t.id))}` : 'Tiada templat RPH.',
        links: [['Templat', 'templat']] },
    ].map((s, i) => ({ n: i + 1, ...s }));
  }
  const CORE = ['takwim', 'jadual', 'subjek'];
  /** Ringkasan: {steps, done, total, allDone, coreReady (takwim + jadual + subjek → RPH boleh dijana), pending[]}. */
  function setupStatus() {
    const steps = setupSteps();
    const pending = steps.filter(s => !s.done);
    return { steps, done: steps.length - pending.length, total: steps.length, allDone: !pending.length, pending,
      coreReady: CORE.every(id => steps.find(s => s.id === id).done) };
  }
  /** Notis "data belum lengkap" untuk paparan lain: pulang null jika semua langkah `ids` selesai. */
  function gapNotice(ids, why) {
    const steps = setupSteps().filter(s => ids.includes(s.id) && !s.done);
    if (!steps.length) return null;
    const kinds = steps.map(s => s.importKind).filter(Boolean);
    const n = notice(`${steps.map(s => s.label).join(', ')} belum disediakan${why ? ' — ' + why : ''}. Import fail anda atau isi sendiri.`, null,
      h('div', { class: 'rphv-notice-actions' },
        importButton(kinds.length === 1 ? kinds[0] : null, { label: 'Import Data', kind: 'primary' }),
        steps.map(s => goButton(s.links[0][0] === 'Isi profil' || s.links[0][0] === 'Tetapkan' ? s.label : s.links[0][0], s.links[0][1], s.links[0][2])),
        goButton('Mula di sini', 'dashboard', { setup: 1 }, { icon: 'list' })));
    n.classList.add('rphv-gap-notice');
    return n;
  }
  RPH.onboarding = { steps: setupSteps, status: setupStatus, gapNotice, importButton, goButton, hasImportView, CORE };

  /** Tahun kalendar seterusnya ditawarkan pada Okt–Dis (persediaan sesi depan). */
  function nextYearOffer() {
    const today = RPH.cal.today(); const y = +today.slice(0, 4); const m = +today.slice(5, 7);
    const years = (S().get('academicYears') || { years: [] }).years;
    const next = String(y + 1);
    if (m < 10 || years.some(x => x.id === next)) return null;
    return next;
  }
  async function prepareYear(el, nextId) {
    const { ui } = RPH; const st = S();
    const cur = st.activeYear(); const rec = st.academicYear();
    const replace = !!(rec && rec.auto && st.isYearEmpty(cur));
    const ok = await ui.confirm({ title: `Sediakan Sesi ${nextId}`, confirmLabel: `Guna Sesi ${nextId}`,
      message: replace ? `Sesi ${cur} masih kosong dan akan digantikan dengan Sesi ${nextId}.\nTakwim, jadual, DSKP dan RPT yang diimport selepas ini disimpan di bawah Sesi ${nextId}.`
        : `Tahun akademik ${nextId} dicipta (kosong) dan dijadikan aktif.\nData ${rec ? rec.label || cur : cur} kekal dan boleh dipilih semula di bar atas.` });
    if (!ok) return;
    try {
      st.createYear({ id: nextId, label: `Sesi ${nextId}`, startDate: null, endDate: null, copyFrom: null });
      if (replace) st.update('academicYears', d => { const y = d.years.find(z => z.id === nextId); if (y) y.auto = true; });
      st.setActiveYear(nextId);
      if (replace) st.removeYear(cur);
    } catch (e) { RPH.reportError('cipta tahun akademik', e); return; }
    RPH.app && RPH.app.buildTop && RPH.app.buildTop();
    ui.toast(`Sesi ${nextId} kini aktif. Tetapkan tarikh sesi dan import takwim ${nextId}.`, 'success', 6000);
    RPH.router.render();
  }

  /** Kad "Mula di sini": senarai semak bernombor dengan status langsung ✔/✘. */
  function setupCard(el, su, { forced } = {}) {
    const { ui } = RPH;
    const ay = S().academicYear();
    const pct = Math.round(su.done / su.total * 100);
    const nextId = nextYearOffer();
    const restore = goButton('Pulihkan backup / pakej', 'tetapan', { tab: 'data' }, { icon: 'download' });
    const stepRow = s => {
      const extra = s.id === 'tahun' && nextId ? ui.button(`Sediakan Sesi ${nextId}`, { size: 'sm', kind: 'gold', icon: 'calendar', onClick: () => prepareYear(el, nextId) }) : null;
      return h('li', { class: ['rphv-onb-step', s.done ? 'is-done' : 'is-todo'], dataset: { step: s.id } },
        h('span', { class: 'rphv-onb-num', 'aria-hidden': 'true' }, String(s.n)),
        h('span', { class: 'rphv-onb-mark', title: s.done ? 'Selesai' : 'Belum', 'aria-label': s.done ? 'Selesai' : 'Belum' }, s.done ? '✔' : '✘'),
        h('div', { class: 'rphv-onb-body' }, h('div', { class: 'rphv-onb-label' }, s.label), h('div', { class: 'rphv-onb-detail' }, s.detail)),
        h('div', { class: 'rphv-onb-btns' },
          s.importKind ? importButton(s.importKind, { kind: s.done ? null : 'primary' }) : null,
          s.links.map(([label, view, params]) => goButton(label, view, params, { icon: 'edit' })),
          extra));
    };
    return h('section', { class: 'card rphv-card rphv-onb', 'aria-labelledby': 'rphv-onb-title' },
      h('div', { class: 'rphv-onb-head' },
        h('div', { class: 'rphv-onb-intro' },
          h('div', { class: 'rphv-onb-kicker' }, `Smart RPH Generator · ${ay ? ay.label || ay.id : S().activeYear()}`),
          h('h1', { id: 'rphv-onb-title' }, 'Mula di sini'),
          h('p', null, su.coreReady
            ? 'Persediaan asas sudah lengkap — RPH boleh dijana. Lengkapkan langkah yang masih bertanda ✘ untuk hasil terbaik.'
            : 'Aplikasi ini bermula kosong. Import fail sekolah anda (takwim, jadual waktu, senarai kelas, DSKP, RPT) atau isi sendiri. Setiap langkah ditanda ✔ apabila selesai.')),
        h('div', { class: 'rphv-onb-meter' },
          h('div', { class: 'rphv-onb-count' }, h('strong', null, `${su.done}/${su.total}`), h('span', null, 'langkah selesai')),
          h('div', { class: 'progress rphv-onb-bar', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Kemajuan persediaan' }, h('span', { style: { width: `${pct}%` } })),
          h('div', { class: 'rphv-onb-cta' },
            importButton(null, { label: 'Import Data', kind: 'gold', size: null }),
            forced || su.coreReady ? goButton('Ke Dashboard', 'dashboard', null, { kind: hasImportView() ? null : 'primary', icon: 'dashboard', size: null }) : null,
            restore))),
      h('ol', { class: 'rphv-onb-list' }, su.steps.map(stepRow)),
      h('div', { class: 'rphv-onb-foot' }, ui.icon('info', 16),
        h('span', null, 'Sudah ada backup tahun lepas atau pakej import (rph-backup.json)? Pulihkan di Tetapan → Data → Restore Backup — semua tahun, takwim, jadual, DSKP, RPT dan RPH dimuatkan sekali gus.')));
  }

  function renderSetup(el, su, forced) {
    const { ui } = RPH;
    ui.clear(el);
    const all = S().rphList();
    add(el, setupCard(el, su, { forced }),
      all.length ? h('div', { class: 'rphv-notices' }, notice(`${all.length} RPH tersimpan dalam ${S().academicYear() ? S().academicYear().label : 'tahun ini'}.`, null,
        h('div', { class: 'rphv-notice-actions' }, goButton('Rekod RPH', 'rekod', null, { icon: 'list' })))) : null);
  }

  // Status langsung: lukis semula kad apabila data berubah semasa Dashboard dipaparkan (cth. selepas import/pulih).
  let setupEl = null;
  const redrawSetup = U.debounce(() => {
    if (!setupEl || !setupEl.isConnected || RPH.router.current().view !== 'dashboard' || !setupEl.querySelector('.rphv-onb')) return;
    render(setupEl, RPH.router.current().params || {});
  }, 150);
  RPH.events.on('store:changed', redrawSetup);

  // ======================================================================
  // DASHBOARD (§20) + JANA RPH HARI INI (§21)
  // ======================================================================
  let justCreated = new Set();

  function render(el, params = {}) {
    const { ui } = RPH; const K = RPH.rphKit;
    const su = setupStatus();
    setupEl = el;
    if (!su.coreReady || (params && params.setup)) { renderSetup(el, su, !!(params && params.setup) && su.coreReady); return; }
    const today = RPH.cal.today();
    const teacher = S().get('teacher') || {}; const school = S().get('school') || {};
    const ay = S().academicYear();
    const ds = K.dayStatus(today);
    const wk = RPH.cal.schoolWeek(today);
    const wInfo = wk != null ? RPH.cal.week(wk) : null;
    const items = K.plan(today);
    const missingItems = items.filter(it => !it.rph);

    // ---- Hero ----
    const jana = ui.button('Jana RPH Hari Ini', { kind: 'gold', icon: 'wand', size: 'lg', onClick: () => janaHariIni(el, today) });
    jana.classList.add('rphv-hero-cta');
    if (!K.has('gen.generate')) { jana.disabled = true; jana.title = 'Modul penjana (generator.js) belum tersedia'; }
    const hero = h('section', { class: 'hero rphv-hero' },
      h('div', { class: 'rphv-hero-main' },
        h('div', { class: 'rphv-hero-greet' }, `Assalamualaikum, ${teacher.fullName || teacher.name || 'Cikgu'}`),
        h('h1', null, K.dateLong(today)),
        h('div', { class: 'rphv-hero-meta' },
          h('span', { class: 'rphv-hero-chip' }, ui.icon('subject', 14), school.shortName || school.name || 'Sekolah'),
          h('span', { class: 'rphv-hero-chip' }, ui.icon('calendar', 14), ay ? ay.label : `Sesi ${S().activeYear()}`),
          wk != null ? h('span', { class: 'rphv-hero-chip is-strong' }, ui.icon('week', 14), `Minggu ${wk}${wInfo && wInfo.term ? ' · Penggal ' + wInfo.term : ''}`) : null,
          h('span', { class: ['rphv-hero-chip', `rphv-day-${ds.kind}`] }, ui.icon(ds.kind === 'school' ? 'check' : 'info', 14), ds.label)),
        (ds.day.events || []).length ? h('div', { class: 'rphv-hero-events' }, ds.day.events.map(e => h('span', { class: 'rphv-hero-event' }, e.title))) : null),
      h('div', { class: 'rphv-hero-side' }, jana,
        h('div', { class: 'rphv-hero-sub' }, items.length
          ? (missingItems.length ? `${missingItems.length} daripada ${items.length} slot belum ada RPH` : `Semua ${items.length} slot hari ini sudah ada RPH`)
          : 'Tiada slot PdP hari ini')));

    // ---- Notis ----
    const notices = [];
    if (!su.allDone) {
      // Persediaan belum lengkap (cth. DSKP/RPT belum diimport) — RPH boleh dijana, tetapi SK/SP/topik mungkin kosong.
      const names = su.pending.map(s => s.label);
      const why = su.pending.some(s => s.id === 'dskp') ? ' Tanpa DSKP, SK/SP tidak dapat dicadangkan.' : su.pending.some(s => s.id === 'rpt') ? ' Tanpa RPT, topik mingguan tidak dapat dipadankan.' : '';
      notices.push(K.notice(`Persediaan ${su.done}/${su.total} selesai — belum: ${names.join(', ')}.${why}`, null,
        h('div', { class: 'rphv-notice-actions' },
          RPH.onboarding.importButton(null, { label: 'Import Data', kind: 'primary' }),
          ui.button('Mula di sini', { size: 'sm', icon: 'list', onClick: () => RPH.router.go('dashboard', null, { setup: 1 }) }),
          !S().hasPrivateData() ? ui.button('Tetapan → Data', { size: 'sm', icon: 'settings', onClick: () => RPH.router.go('tetapan', null, { tab: 'data' }) }) : null)));
    }
    if (!K.has('gen.generate')) notices.push(K.missing('gen.generate'));

    // ---- Statistik ----
    const all = S().rphList();
    const weekSlots = wk != null ? RPH.cal.slotsForWeek(wk) : [];
    const weekHave = weekSlots.map(x => K.findRph(x.date, x.slot)).filter(Boolean);
    const weekDone = weekHave.filter(r => ['siap', 'selesai'].includes(r.status)).length;
    const nDraft = all.filter(r => r.status === 'draft').length;
    const nPost = all.filter(r => ['ditangguhkan', 'dibawa'].includes(r.status)).length;
    const todayHave = items.filter(it => it.rph).length;
    const statLink = (href, node, label) => h('a', { class: 'rphv-statlink', href, 'aria-label': label }, node);
    const stats = h('div', { class: 'grid grid-4 rphv-stats' },
      statLink(`#/rekod?date=${today}`, ui.stat('RPH hari ini', `${todayHave}/${items.length}`, items.length ? 'slot mempunyai RPH' : 'tiada slot hari ini'), 'Lihat RPH hari ini'),
      statLink(wk != null ? `#/mingguan?week=${wk}` : '#/mingguan', ui.stat('RPH minggu ini', `${weekHave.length}/${weekSlots.length}`, `${weekDone} siap / selesai`), 'Lihat RPH minggu ini'),
      statLink('#/rekod?status=draft', ui.stat('RPH belum siap', nDraft, 'status Draft', nDraft ? 'warn' : null), 'Lihat RPH draf'),
      statLink('#/rekod?status=tertangguh', ui.stat('RPH tertangguh', nPost, 'Ditangguhkan / Dibawa', nPost ? 'danger' : null), 'Lihat RPH tertangguh'));

    // ---- Kelas hari ini ----
    const slotList = items.length
      ? h('div', { class: 'slot-list' }, items.map(it => slotRow(it, el, today)))
      : noClassToday(today, ds);
    const classesCard = ui.card({ cls: 'rphv-card rphv-today', title: 'Kelas hari ini', subtitle: items.length ? `${items.length} slot PdP · jadual ${(items[0].slot.versionId) || ''}`.trim() : null,
      actions: [ui.button('Jana RPH', { size: 'sm', icon: 'wand', onClick: () => RPH.router.go('jana', null, { date: today }) }), ui.button('Mingguan', { size: 'sm', icon: 'week', onClick: () => RPH.router.go('mingguan', null, wk != null ? { week: wk } : null) })],
      body: slotList });

    // ---- Acara + perhatian ----
    const eventsCard = ui.card({ cls: 'rphv-card', title: 'Acara sekolah', subtitle: 'Minggu ini dan minggu depan', body: eventsList(today, wk) });
    const past = all.filter(r => r.date < today && r.status === 'draft').slice(-5).reverse();
    const post = all.filter(r => ['ditangguhkan', 'dibawa'].includes(r.status)).slice(-5).reverse();
    const attention = ui.card({ cls: 'rphv-card', title: 'Perlu perhatian', body: (past.length || post.length)
      ? h('div', { class: 'rphv-mini-list' },
        past.length ? h('div', { class: 'rphv-mini-head' }, 'RPH lepas masih Draft') : null, past.map(miniRow),
        post.length ? h('div', { class: 'rphv-mini-head' }, 'Tertangguh / dibawa') : null, post.map(miniRow))
      : h('p', { class: 'muted small rphv-pad0' }, 'Tiada RPH lepas yang tertunggak. Bagus!') });

    ui.clear(el);
    add(el, 
      hero,
      notices.length ? h('div', { class: 'rphv-notices' }, notices) : null,
      stats,
      h('div', { class: 'rphv-dash-grid' }, h('div', null, classesCard), h('div', { class: 'rphv-dash-side' }, eventsCard, attention)));
  }

  function slotRow(it, el, today) {
    const { ui } = RPH; const K = RPH.rphKit; const s = it.slot; const r = it.rph;
    const isNew = r && justCreated.has(r.id);
    const lesson = K.lessonLabel(it.rptLesson);
    return h('div', { class: ['slot', 'rphv-slot', isNew ? 'is-new' : '', it.holiday ? 'is-off' : ''], style: { '--subj': K.subjColor(s.subjectId) } },
      h('div', { class: 'slot-time' }, s.start || '—', h('div', { class: 'slot-sub' }, s.end ? `hingga ${s.end}` : ''), s.minutes ? h('div', { class: 'slot-sub' }, `${s.minutes} minit`) : null),
      h('div', { class: 'rphv-slot-info' },
        h('div', { class: 'rphv-slot-title' }, K.subjectDot(s.subjectId), h('strong', null, s.className || K.className(s.classId)), h('span', { class: 'muted' }, ` · ${K.subjName(s.subjectId)}`),
          (s.coTeachers || []).length ? h('span', { class: 'slot-sub' }, ` · bersama ${s.coTeachers.join(', ')}`) : null),
        r && K.topicOf(r) ? h('div', { class: 'rphv-slot-topic' }, K.rtl(K.topicOf(r))) :
          lesson ? h('div', { class: 'rphv-slot-topic' }, h('span', { class: 'muted small' }, 'RPT: '), K.rtl(lesson)) :
            h('div', { class: 'slot-sub' }, it.holiday ? it.holiday : 'Tiada pelajaran RPT dipadankan')),
      h('div', { class: 'rphv-slot-actions' },
        isNew ? ui.chip('Baharu', 'gold') : null,
        r ? ui.badge(r.status) : h('span', { class: 'badge badge-slate rphv-badge-empty' }, 'Belum ada RPH'),
        r ? ui.button('Buka', { size: 'sm', kind: 'primary', icon: 'edit', onClick: () => RPH.router.go('rph', r.id) })
          : ui.button('Jana', { size: 'sm', icon: 'wand', disabled: !K.has('gen.generate'), onClick: () => {
            const res = K.generate([it]); K.reportGenerate(res);
            if (res.created.length) RPH.router.go('rph', res.created[0].id); else render(el);
          } })));
  }

  function noClassToday(today, ds) {
    const { ui } = RPH; const K = RPH.rphKit;
    let next = null;
    for (let i = 1; i < 60; i++) { const d = U.addDays(today, i); if (RPH.cal.isSchoolDay(d) && RPH.cal.slotsFor(d).length) { next = d; break; } }
    return h('div', { class: 'empty' }, ui.icon('calendar', 28),
      h('p', null, ds.kind === 'school' ? 'Tiada slot PdP dalam jadual hari ini.' : `${ds.label} — tiada PdP.`),
      next ? h('p', { class: 'small' }, 'Hari persekolahan seterusnya: ', h('strong', null, K.dateLong(next))) : null,
      next ? ui.button('Rancang hari itu', { size: 'sm', icon: 'wand', onClick: () => RPH.router.go('jana', null, { date: next }) }) : null);
  }

  function eventsList(today, wk) {
    const K = RPH.rphKit;
    const groups = [];
    const thisDates = wk != null ? RPH.cal.weekDates(wk).filter(d => d >= today) : [0, 1, 2, 3, 4, 5, 6].map(i => U.addDays(today, i));
    const nextW = wk != null ? wk + 1 : K.weekFor(U.addDays(today, 7));
    const nextDates = nextW != null && nextW !== wk ? RPH.cal.weekDates(nextW) : [];
    const collect = dates => dates.flatMap(d => {
      const day = RPH.cal.day(d); const out = [];
      if (day.holiday && (day.dow >= 1 && day.dow <= 5)) out.push({ date: d, title: day.holiday, kind: 'holiday' });
      for (const e of day.events || []) if (e.kind !== 'sabtu-3') out.push({ date: d, title: e.title, kind: e.category || e.kind });
      return out;
    });
    // Gabung cuti berturut yang sama.
    const squash = list => list.filter((x, i) => !(x.kind === 'holiday' && i > 0 && list[i - 1].kind === 'holiday' && list[i - 1].title === x.title));
    const a = squash(collect(thisDates)), b = squash(collect(nextDates));
    if (a.length) groups.push(['Minggu ini', a]);
    if (b.length) groups.push([`Minggu ${nextW}`, b]);
    if (!groups.length) return h('p', { class: 'muted small rphv-pad0' }, 'Tiada acara atau cuti dalam takwim bagi tempoh ini.');
    return h('div', { class: 'rphv-events' }, groups.map(([label, list]) => h('div', { class: 'rphv-events-group' },
      h('div', { class: 'rphv-mini-head' }, label),
      list.map(e => h('div', { class: ['rphv-event', e.kind === 'holiday' ? 'is-holiday' : ''] },
        h('div', { class: 'rphv-event-date' }, h('strong', null, U.fmtDate(e.date, 'D/M/YYYY').replace(/\/\d{4}$/, '')), h('span', null, U.dayNameMs(U.dow(e.date)).slice(0, 3))),
        h('div', { class: 'rphv-event-title' }, e.title, e.kind && e.kind !== 'holiday' ? h('span', { class: 'slot-sub' }, ` · ${catLabel(e.kind)}`) : null))))));
  }

  const catLabel = c => (String(c).length <= 3 ? String(c).toUpperCase() : String(c).charAt(0).toUpperCase() + String(c).slice(1));

  function miniRow(r) {
    const { ui } = RPH; const K = RPH.rphKit;
    return h('a', { class: 'rphv-mini', href: `#/rph/${encodeURIComponent(r.id)}` },
      K.subjectDot(r.subjectId),
      h('span', { class: 'rphv-mini-main' }, h('strong', null, `${K.subjCode(r.subjectId)} ${r.className || ''}`), h('span', { class: 'muted small' }, ` · ${K.dateShort(r.date)}`)),
      ui.badge(r.status));
  }

  async function janaHariIni(el, today) {
    const { ui } = RPH; const K = RPH.rphKit;
    const items = K.plan(today); // dirancang semula ketika klik (bukan senarai semasa render)
    if (!K.has('gen.generate')) { ui.toast('Modul penjana (generator.js) belum tersedia.', 'error'); return; }
    const ds = K.dayStatus(today);
    if (!items.length) { ui.toast(ds.kind === 'school' ? 'Tiada slot PdP dalam jadual hari ini.' : `${ds.label} — tiada slot PdP.`, 'info'); return; }
    const todo = items.filter(it => !it.rph);
    if (!todo.length) { ui.toast('Semua slot hari ini sudah mempunyai RPH.', 'info'); return; }
    if (ds.kind !== 'school' && !(await ui.confirm({ title: 'Bukan hari persekolahan', message: `${ds.label}.\nJana juga RPH untuk ${todo.length} slot?`, confirmLabel: 'Jana juga' }))) return;
    const res = K.generate(todo);
    K.reportGenerate(res);
    justCreated = new Set(res.created.map(r => r.id));
    render(el);
    const first = el.querySelector('.rphv-slot.is-new');
    if (first) first.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  RPH.views.dashboard = { title: 'Dashboard', icon: 'dashboard', render };
})(window.RPH = window.RPH || {});
