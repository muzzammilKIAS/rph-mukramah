/* Pemapar RPH → HTML A4 (pratonton & cetak).
   Susun atur dibina sebagai MODEL (baris/sel/blok teks) yang dikongsi dengan RPH.docx, supaya DOCX
   mencerminkan paparan. Tiada innerHTML: semua nod dibina dengan RPH.ui.h().
   Teks campuran (§62): dalam sel Arab/Jawi, larian Latin/nombor ("PAK-21", "TP 5", "12.40-1.40",
   "28 / 32") diasingkan dengan <bdi dir="ltr">; dalam sel Rumi, larian Arab diasingkan dengan <bdi dir="rtl">. */
(function (RPH) {
  'use strict';
  const U = () => RPH.util;

  // ======================================================================
  // 1. Skrip & bidi
  // ======================================================================
  const AR = '\\u0600-\\u06FF\\u0750-\\u077F\\u0870-\\u089F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF';
  const LAT = 'A-Za-z0-9\\u00C0-\\u024F\\u1E00-\\u1EFF';
  const RE_HAS_AR = new RegExp(`[${AR}]`);
  const RE_AR_LETTER = /[ؠ-يٮ-ۓەۮۯۺ-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
  const RE_LAT_LETTER = /[A-Za-zÀ-ɏḀ-ỿ]/;
  // Larian Latin: bermula dengan huruf/digit (boleh didahului kurungan buka), berakhir dengan huruf/digit/kurungan tutup.
  const RE_LAT_RUN = new RegExp(`[(\\[]?[${LAT}](?:[${LAT}\\s'’&\\-–—/.:,;+%()\\[\\]_=!?]*[${LAT})\\]%'’])?`, 'g');
  // Larian Arab (untuk perenggan LTR): huruf Arab … huruf Arab, termasuk digit/tanda baca di tengah + tanda baca penutup.
  const RE_AR_RUN = new RegExp(`[${AR}](?:[${AR}\\s\\u200C\\u200D0-9.,:;()\\-–/!«»'_]*[${AR}])?[.:!؟،؛]?`, 'g');
  const RE_LAT_START = new RegExp(`[${LAT}(\\[]`);
  const RE_LAT_END = new RegExp(`[${LAT})\\]%'’]`);

  const hasArabic = s => RE_HAS_AR.test(s || '');
  /** Arah huruf kuat pertama ('rtl' | 'ltr' | null) — seperti dir="auto". */
  function firstStrong(s) {
    for (const ch of String(s || '')) {
      if (RE_AR_LETTER.test(ch)) return 'rtl';
      if (RE_LAT_LETTER.test(ch)) return 'ltr';
    }
    return null;
  }
  const count = (s, re) => (s.match(re) || []).length;
  /** Buang kurungan yang tidak berpasangan / tanda baca di hujung larian Latin. */
  function trimRun(run) {
    let lead = '', core = run, trail = '';
    if (/^[(\[]/.test(core) && count(core, /[(\[]/g) > count(core, /[)\]]/g)) { lead = core[0]; core = core.slice(1); }
    if (/[)\]]$/.test(core) && count(core, /[)\]]/g) > count(core, /[(\[]/g)) { trail = core.slice(-1); core = core.slice(0, -1); }
    while (core && !RE_LAT_START.test(core[0])) { lead += core[0]; core = core.slice(1); }
    while (core && !RE_LAT_END.test(core[core.length - 1])) { trail = core[core.length - 1] + trail; core = core.slice(0, -1); }
    return { lead, core, trail };
  }
  /**
   * Pecah teks kepada segmen untuk perenggan berarah `base`.
   * → [{text, iso, script:'ar'|'lat'|'neutral'}]; iso=true = mesti diasingkan (arah bertentangan).
   */
  function segments(text, base) {
    const s = String(text == null ? '' : text);
    const out = [];
    const push = (t, iso) => {
      if (!t) return;
      const last = out[out.length - 1];
      if (last && !last.iso && !iso) last.text += t; else out.push({ text: t, iso });
    };
    const re = base === 'rtl' ? RE_LAT_RUN : RE_AR_RUN;
    re.lastIndex = 0;
    let last = 0, m;
    while ((m = re.exec(s))) {
      if (base === 'rtl') {
        const t = trimRun(m[0]);
        push(s.slice(last, m.index) + t.lead, false);
        push(t.core, true);
        push(t.trail, false);
      } else {
        push(s.slice(last, m.index), false);
        push(m[0], true);
      }
      last = m.index + m[0].length;
    }
    push(s.slice(last), false);
    return out.map(x => ({ ...x, script: x.iso ? (base === 'rtl' ? 'lat' : 'ar') : (hasArabic(x.text) ? 'ar' : base === 'rtl' ? 'neutral' : 'lat') }));
  }
  /** Segmen bagi satu larian model; larian `ltr` (cth. "___ / 30") sentiasa diasingkan sebagai LTR. */
  function runSegments(r, base) {
    if (r.ltr) return [{ text: r.text, iso: base === 'rtl', script: 'lat' }];
    return segments(r.text, base);
  }
  /** Arah asas perenggan: blok.dir → huruf kuat pertama → arah dokumen. */
  function baseDir(block, m) {
    if (block.dir) return block.dir;
    const text = (block.runs || []).map(r => r.text).join('');
    return firstStrong(text) || m.dir;
  }

  // ======================================================================
  // 2. Utiliti nilai
  // ======================================================================
  const isEmpty = v => v == null || v === '' || (Array.isArray(v) && !v.filter(x => x != null && String(x.text ?? x).trim() !== '').length);
  const isNum = x => x !== null && x !== undefined && x !== '' && !isNaN(+x);
  // Penanda kotak bilangan kosong (refleksi). Penulis HTML/DOCX menukarnya kepada kotak bersempadan
  // supaya guru boleh mengisi bilangan murid dengan tangan atau taip dalam Word (keputusan guru 2026-10-02).
  const NBOX = '\uE000';
  const NBOX_FILL = '\u00A0'.repeat(6);
  const arr = v => (v == null || v === '' ? [] : Array.isArray(v) ? v : [v]);
  const stripTxt = s => (String(s).startsWith('txt:') ? String(s).slice(4) : String(s));
  const ROMAN = [['m', 1000], ['cm', 900], ['d', 500], ['cd', 400], ['c', 100], ['xc', 90], ['l', 50], ['xl', 40], ['x', 10], ['ix', 9], ['v', 5], ['iv', 4], ['i', 1]];
  function roman(n) { let s = ''; for (const [r, v] of ROMAN) while (n >= v) { s += r; n -= v; } return s; }
  function numLabel(i, scheme) {
    if (scheme === 'roman') return roman(i + 1);
    if (scheme === 'arabic-indic') return `${U().toArabicDigits(i + 1)}.`;
    if (scheme === 'none') return '';
    return `${i + 1}.`;
  }
  const store = () => RPH.store;
  function safe(fn, dflt) { try { const v = fn(); return v === undefined ? dflt : v; } catch (e) { return dflt; } }

  // Gaya: pi (Jawi), ba (format BA guru), generic (Rumi/Inggeris, LTR), arg (Arab generik, RTL — bukan format BA guru).
  const THEMES = {
    pi: { title: 'FFD243', label: 'FFF8DB', head: 'FFF1B8' },
    ba: { title: 'B9EDFF', label: 'B9EDFF', head: 'B9EDFF' },
    generic: { title: 'D7E9E0', label: 'EEF5F1', head: 'E2EFE8' },
    arg: { title: 'CFE3F5', label: 'EAF2FB', head: 'DCE9F7' },
    jawg: { title: 'D9EAD3', label: 'F1F7EE', head: 'E3F0DD' },
  };
  const COLS = {
    pi: [17, 9, 13, 14, 15, 16, 16],
    ba: [22, 13, 13, 13, 13, 13, 13],
    generic: [22, 13, 13, 13, 13, 13, 13],
    arg: [22, 13, 13, 13, 13, 13, 13],
    jawg: [22, 13, 13, 13, 13, 13, 13],
  };
  const GROUP_WORD = { jawi: 'كومڤولن', ar: 'المجموعة', ms: 'Kumpulan', en: 'Group' };
  const GROUP_AR_LETTER = { A: 'أ', B: 'ب', C: 'ج' };
  const DIFF_LABEL = {
    jawi: { pemulihan: 'ڤموليهن', pengukuhan: 'ڤڠوكوهن', pengayaan: 'ڤڠاياءن' },
    ar: { pemulihan: 'العلاج', pengukuhan: 'التعزيز', pengayaan: 'الإثراء' },
    en: { pemulihan: 'Remedial', pengukuhan: 'Reinforcement', pengayaan: 'Enrichment' },
  };
  const TASMIK_HEAD = {
    jawi: ['نام موريد', 'باچاٴن', 'مولا', 'تامت', 'چاتتن'],
    ar: ['اسم التلميذ', 'القراءة', 'من', 'إلى', 'ملاحظة'],
    ms: ['Nama Murid', 'Bacaan', 'Mula', 'Tamat', 'Catatan'],
    en: ['Pupil', 'Reading', 'From', 'To', 'Notes'],
  };
  const REFL_VERSIONS = { A: ['achieved', 'notAchieved'], B: ['achieved', 'notAchieved', 'postponed', 'absent'], C: ['achieved', 'absent'] };
  const TALL_ROW = 8; // perenggan dalam satu sel
  const META = new Set(['week', 'date', 'day', 'class', 'time-range', 'subject', 'term-week', 'day-date']);

  // ---------- Pembina model ----------
  const run = (text, o = {}) => ({ text: text == null ? '' : String(text), b: !!o.b, u: !!o.u, sm: !!o.sm, muted: !!o.muted, box: !!o.box, ltr: !!o.ltr });
  const P = (text, o = {}) => ({ t: 'p', runs: [run(text, o)], align: o.align || null, dir: o.dir || null, lg: !!o.lg });
  const PR = (runs, o = {}) => ({ t: 'p', runs: runs.filter(Boolean), align: o.align || null, dir: o.dir || null, lg: !!o.lg });
  const paras = (text, o) => String(text == null ? '' : text).split(/\r?\n/).map(t => P(t, o));
  function cell(blocks, o = {}) {
    return { blocks: (Array.isArray(blocks) ? blocks : [blocks]).filter(Boolean), span: o.span || 1, rowSpan: o.rowSpan || 1, kind: o.kind || 'value', fill: o.fill || null, align: o.align || null, valign: o.valign || null };
  }
  const row = (key, cells) => ({ field: key, cells: cells.filter(Boolean) });
  const withRowSpan = (c, n) => { c.rowSpan = n; return c; };

  // ======================================================================
  // 3. Konteks & nilai medan
  // ======================================================================
  function labelText(f, lang) {
    const L = f.label || {};
    if (lang === 'en') return L.en || L.ms || L.ar || L.jawi || f.key;
    if (lang === 'ar') return L.ar || L.jawi || L.ms || f.key;
    if (lang === 'jawi') return L.jawi || L.ar || L.ms || f.key;
    return L.ms || L.ar || L.jawi || f.key;
  }
  const PHASE_KEYS = { induction: 'activityInduction', development: 'activityDevelopment', closure: 'activityClosure' };
  function rawValue(f, ctx) {
    const vals = ctx.rph.values || {};
    const v = vals[f.key];
    if (!isEmpty(v)) return v;
    // Tukar templat (§73): aktiviti fasa (BA) ⇄ senarai aktiviti per fasa (PI/generik) tidak hilang.
    if (f.type === 'activity-list' && f.phase && vals.activities && typeof vals.activities === 'object' && !isEmpty(vals.activities[f.phase])) return vals.activities[f.phase];
    if (f.type === 'activity-phases') {
      const ph = Object.fromEntries(Object.entries(PHASE_KEYS).map(([p, k]) => [p, vals[k]]).filter(([, x]) => !isEmpty(x)));
      if (Object.keys(ph).length) return ph;
    }
    if (f.defaultValue != null && f.defaultValue !== '') return f.defaultValue;
    const d = ctx.tpl.defaults && ctx.tpl.defaults[f.key];
    if (!isEmpty(d)) return d;
    return v;
  }
  function hidden(f, ctx) {
    if (f.hidden) return true;
    if (f.optional && isEmpty(rawValue(f, ctx))) return true;
    if (f.type === 'postponement' && isEmpty(rawValue(f, ctx)) && ctx.style !== 'pi') return true;
    return false;
  }
  const dow = ctx => (ctx.rph.dow != null ? ctx.rph.dow : (ctx.rph.date ? U().dow(ctx.rph.date) : 0));
  function dayName(f, ctx) {
    const d = dow(ctx);
    if (f.dayOptions && f.dayOptions[d]) return f.dayOptions[d];
    return ctx.lang === 'ar' ? U().dayNameAr(d) : ctx.lang === 'jawi' ? U().dayNameJawi(d) : ctx.lang === 'en' ? U().dayNameEn(d) : U().dayNameMs(d);
  }
  const fmtDate = (f, ctx) => U().fmtDate(ctx.rph.date, f.dateFormat || 'DD/MM/YYYY');
  function className(ctx) {
    const r = ctx.rph;
    if (r.className) return r.className;
    const c = safe(() => store().classes().find(x => x.id === r.classId), null);
    return (c && c.name) || r.classId || '';
  }
  function weekNo(ctx) {
    const r = ctx.rph;
    if (r.week != null && r.week !== '') return r.week;
    return safe(() => RPH.cal.schoolWeek(r.date), null);
  }
  function timeParts(f, v, ctx) {
    const r = ctx.rph;
    const sessions = f.sessionOptions || [];
    let session = '', range = '';
    if (typeof v === 'string' && v.trim()) {
      if (sessions.includes(v.trim())) session = v.trim(); else range = v.trim();
    }
    if (!range) range = U().timeRange(r.start, r.end);
    if (!session && sessions.length) session = (ctx.school && ctx.school.session) || U().session(r.start) || '';
    return { session, range };
  }
  function termWeek(v, ctx) {
    if (typeof v === 'string' && v.includes('/')) { const [a, b] = v.split('/'); return [a.trim(), b.trim()]; }
    const term = safe(() => RPH.cal.termOf(ctx.rph.date), null);
    const w = weekNo(ctx);
    return [term != null ? String(term) : '', w != null ? String(w) : ''];
  }
  function subjectName(ctx, lang, f) {
    const s = ctx.subject;
    const alt = f && f.subjectNames && (lang === 'en' || lang === 'ar') ? f.subjectNames[ctx.rph.subjectId] : null;
    if (!s) return alt || ctx.rph.subjectId || '';
    const n = s.name || {};
    return (lang && n[lang]) || alt || n.ms || s.code || s.id;
  }
  // Petunjuk paparan lalai bagi bank tanpa `display` dalam templat (nama PAK-21 ialah istilah rasmi Inggeris).
  const DEFAULT_DISPLAY = { pak21: 'name (ms)' };
  function selectText(f, v, ctx) {
    if (isEmpty(v)) return '';
    const lang = f.display || DEFAULT_DISPLAY[f.bank] || ctx.lang;
    if (f.bank) return RPH.banks.valueLabel(f.bank, v, lang);
    return stripTxt(v);
  }
  function checkItems(f, v, ctx) {
    const sel = arr(v).map(String);
    const set = new Set(sel);
    const lang = f.display || ctx.lang;
    const opts = f.bank ? RPH.banks.items(f.bank, f.filter) : (f.options || []).map(o => (typeof o === 'string' ? { id: o, ms: o } : o));
    const items = opts.map(o => ({ label: RPH.banks.label(o, lang), on: set.has(o.id) }));
    sel.filter(x => !opts.some(o => o.id === x)).forEach(x => items.push({ label: x.startsWith('txt:') ? x.slice(4) : (f.bank ? RPH.banks.valueLabel(f.bank, x, lang) : x), on: true }));
    return items;
  }
  /**
   * SK/SP → [{code, text, missing?, untranslated?}] dalam bahasa templat (RPH.i18n.std). Kod tidak berubah.
   * Tiada terjemahan (bahasa templat ≠ bahasa asal DSKP) → teks asal DSKP + penanda "(teks asal DSKP)".
   */
  function stdItems(f, v, ctx) {
    const kind = f.type === 'sk-select' ? 'sk' : 'sp';
    const I = RPH.i18n; const sid = ctx.rph.subjectId; const yr = ctx.rph.year;
    const nat = I ? safe(() => I.nativeLang(sid, yr), null) : null;
    const tr = (code, orig) => {
      if (!I) return { text: orig };
      const r = safe(() => I.std(sid, yr, code, ctx.lang), null);
      if (!r || !r.text) return { text: orig, untranslated: !!orig && nat && ctx.lang !== nat };
      if (r.translated) ctx.translatedStd = true;
      return { text: r.text, untranslated: !r.translated && !r.native && ctx.lang !== nat };
    };
    return arr(v).map(code => {
      code = String(code);
      if (code.startsWith('txt:')) return { code: '', ...tr(code, code.slice(4)) };
      const it = safe(() => RPH.curr[kind](sid, yr, code), null);
      return it ? { code: it.displayCode || it.code, ...tr(code, it.text || '') } : { code, text: '', missing: true };
    });
  }
  const origMark = ctx => (RPH.i18n ? RPH.i18n.originalMarker(ctx.lang) : '(teks asal DSKP)');
  const MISSING = 'Data tidak tersedia — perlu semakan guru';
  function listItems(v) {
    if (Array.isArray(v)) return v.map(x => (typeof x === 'string' ? x : (x && x.text) || '')).filter(s => String(s).trim() !== '');
    if (typeof v === 'string') return v.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    return [];
  }
  /** Sisip "(…)" sebelum tanda baca penutup ayat. */
  const beforePunct = (t, add) => t.replace(/\s*([.!?؟۔]*)\s*$/, (m0, punct) => ` (${add})${punct}`);
  function activityText(a, ctx) {
    if (typeof a === 'string') return a;
    let t = String((a && a.text) || '');
    if (a && a.group) {
      // Penjana sudah menulis "كومڤولن A: …" dalam teks → jangan gandakan label kumpulan.
      const g = String(a.group).trim();
      const already = Object.values(GROUP_WORD).some(w => t.trimStart().startsWith(`${w} ${g}`) || (GROUP_AR_LETTER[g] && t.trimStart().startsWith(`${w} (${GROUP_AR_LETTER[g]})`)));
      if (!already) t = `${GROUP_WORD[ctx.lang] || GROUP_WORD.ms} ${g}: ${t}`;
    }
    if (a && a.pak21) {
      const it = RPH.banks.item('pak21', a.pak21);
      const name = it ? (ctx.lang === 'en' && it.en) || it.name || RPH.banks.label(it) : stripTxt(a.pak21);
      const known = it ? [it.name, it.en].filter(Boolean) : [name];
      if (name && !known.some(x => t.includes(x))) t = beforePunct(t, name);
    }
    if (ctx.opts.showMinutes && a && a.minutes) t = beforePunct(t, `${a.minutes} min`);
    return t;
  }
  const activityItems = (v, ctx) => arr(v).filter(a => a && String(a.text ?? a).trim() !== '').map(a => activityText(a, ctx));
  function numbering(f, ctx, n) {
    if (f.numbering) return f.numbering;
    if (n <= 1) return 'none';
    return ctx.lang === 'jawi' ? 'roman' : ctx.lang === 'ar' ? 'arabic-indic' : 'decimal';
  }
  function lineText(l, ctx) { return ctx.lang === 'ar' ? (l.ar || l.ms || '') : ctx.lang === 'jawi' ? (l.jawi || l.ms || '') : ctx.lang === 'en' ? (l.en || l.ms || '') : (l.ms || l.ar || l.jawi || ''); }
  function reflLines(f, v, ctx) {
    v = v && typeof v === 'object' ? v : {};
    const toggles = v.lines || {};
    const lines = f.lines || [];
    const def = f.version && REFL_VERSIONS[f.version] ? REFL_VERSIONS[f.version] : lines.map(l => l.id).filter(id => id !== 'carryForward');
    const hasWeek = v.carryWeek != null && v.carryWeek !== '';
    return lines.filter(l => toggles[l.id] === true || (toggles[l.id] !== false && (def.includes(l.id) || (l.id === 'carryForward' && hasWeek)))).map(l => {
      const fmt = l.format || f.format || '{n} / {total}';
      const n = l.id === 'achieved' ? v.achieved : l.id === 'notAchieved' ? v.notAchieved : l.id === 'absent' ? v.absent : null;
      let mark = false, cnt = '';
      if (fmt === 'checkbox') mark = l.id === 'postponed' ? !!v.postponed : !!toggles[l.id];
      else if (fmt.includes('{week}')) { cnt = fmt.replace('{week}', hasWeek ? String(v.carryWeek) : '……'); mark = hasWeek; }
      else { cnt = fmt.replace('{n}', isNum(n) ? String(n) : NBOX).replace('{total}', isNum(v.total) ? String(v.total) : NBOX); mark = isNum(n) && (l.id !== 'absent' || +n > 0); }
      return { id: l.id, fmt, mark, count: cnt, text: lineText(l, ctx), ms: l.ms || '', prefix: l.labelPrefix || '', after: fmt.includes('{week}') };
    });
  }
  function diffGroups() {
    const b = safe(() => store().bank('tp'), null);
    return (b && b.groups) || [{ id: 'pemulihan', ms: 'Pemulihan', tp: [1, 2] }, { id: 'pengukuhan', ms: 'Pengukuhan', tp: [3, 4] }, { id: 'pengayaan', ms: 'Pengayaan', tp: [5, 6] }];
  }
  function selectedTp(ctx) {
    const t = (ctx.rph.values || {}).tp;
    const m = /(\d)/.exec(String(t || ''));
    return m ? +m[1] : null;
  }

  // ---------- Blok nilai (satu sel) ----------
  function textBlocks(v, o) {
    if (Array.isArray(v)) return v.filter(x => String(x ?? '').trim() !== '').flatMap(x => paras(stripTxt(typeof x === 'object' ? x.text || '' : x), o));
    return paras(isEmpty(v) ? '' : stripTxt(v), o);
  }
  function listBlocks(f, items, ctx) {
    const out = [];
    if (f.intro) out.push(P(f.intro));
    const scheme = numbering(f, ctx, items.length);
    items.forEach((t, i) => out.push(scheme === 'none' ? P(t) : PR([run(numLabel(i, scheme) + ' '), run(t)])));
    return out.length ? out : [P('')];
  }
  function phaseBlocks(f, v, ctx) {
    v = v && typeof v === 'object' ? v : {};
    const phases = f.phases || [{ id: 'induction', ar: 'المقدمة', ms: 'Permulaan' }, { id: 'development', ar: 'الأنشطة', ms: 'Perkembangan' }, { id: 'closure', ar: 'الخاتمة', ms: 'Penutup' }];
    const out = [];
    for (const ph of phases) {
      const items = activityItems(v[ph.id], ctx);
      if (!items.length) continue;
      const title = ctx.lang === 'ar' ? ph.ar || ph.ms : ctx.lang === 'jawi' ? ph.jawi || ph.ms || ph.ar : ctx.lang === 'en' ? ph.en || ph.ms || ph.ar : ph.ms || ph.ar;
      out.push(P(`${title} :`, { b: 1, u: 1 }));
      const scheme = f.numbering || (ctx.lang === 'ar' ? 'arabic-indic' : ctx.lang === 'jawi' ? 'roman' : 'decimal');
      items.forEach((t, i) => out.push(PR([run(numLabel(i, scheme) + ' '), run(t)])));
    }
    return out.length ? out : [P('')];
  }
  function stdBlocks(items, ctx) {
    if (!items.length) return [P('')];
    return items.flatMap(it => [PR([it.code ? run(it.code + ' ') : null, run(it.text)]), it.missing ? P(MISSING, { sm: 1, muted: 1 }) : null, it.untranslated && ctx ? P(origMark(ctx), { sm: 1, muted: 1 }) : null].filter(Boolean));
  }
  function diffBlocks(v, ctx) {
    v = v && typeof v === 'object' ? v : {};
    const L = DIFF_LABEL[ctx.lang] || {};
    return diffGroups().map(g => PR([run(`${L[g.id] || g.ms}: `, { b: 1 }), run(v[g.id] || '')]));
  }
  /** Teks refleksi tersuai guru (values.<key>.text) menggantikan baris berstruktur. */
  const reflCustom = v => (v && typeof v === 'object' && typeof v.text === 'string' && v.text.trim() ? v.text.trim() : null);
  function reflBlocks(f, v, ctx) {
    const custom = reflCustom(v);
    if (custom) return paras(custom);
    const out = [];
    for (const l of reflLines(f, v, ctx)) {
      const parts = [run(l.mark ? '☑' : '☐', { box: 1 }), run(' ')];
      if (l.prefix) parts.push(run(l.prefix + ' '));
      if (l.after) parts.push(run(l.text + ' '), run(l.count, { ltr: 1 }));
      else { if (l.count) parts.push(run(l.count, { ltr: 1 }), run(' ')); parts.push(run(l.text)); }
      out.push(PR(parts, { dir: ctx.dir === 'rtl' ? 'rtl' : null }));
      if (ctx.lang !== 'ms' && l.ms && ctx.style === 'ba') out.push(P(l.ms, { sm: 1, muted: 1 }));
    }
    return out.length ? out : [P('')];
  }
  function postponeText(f, v) {
    let t = isEmpty(v) ? '' : stripTxt(v);
    if (f.display === 'uppercase-ms') t = t.toUpperCase();
    return t;
  }
  function tasmikRows(v) { return arr(v).filter(x => x && typeof x === 'object'); }

  /** Kandungan satu sel bagi medan (jenis ringkas & panjang). */
  function valueBlocks(f, ctx) {
    const v = rawValue(f, ctx);
    const C = { align: 'center' };
    const auto = typeof v === 'string' && v.trim() ? v : null;
    switch (f.type) {
      case 'week': return [P(auto || weekNo(ctx) || '', C)];
      case 'date': return [P(auto || fmtDate(f, ctx), C)];
      case 'day': return [P(auto || dayName(f, ctx), C)];
      case 'class': return [P(auto || className(ctx), C)];
      case 'time-range': { const t = timeParts(f, v, ctx); return [P([t.session, t.range].filter(Boolean).join(' '), { align: 'center', b: ctx.style === 'ba' })]; }
      case 'term-week': return [P(termWeek(v, ctx).filter(Boolean).join(' / '), C)];
      case 'day-date': return [P(auto || `${dayName(f, ctx)} / ${fmtDate(f, ctx)}`, C)];
      case 'subject': {
        const loc = subjectName(ctx, ctx.lang === 'en' || ctx.lang === 'ar' ? ctx.lang : 'ms', f);
        // Nilai auto lama dalam BM (cth. dikemas kini oleh paparan lain) → nama setempat bagi RPH Inggeris/Arab.
        const msName = ctx.subject && ctx.subject.name ? ctx.subject.name.ms : null;
        return [P(auto && !((ctx.lang === 'en' || ctx.lang === 'ar') && auto === msName) ? auto : loc)];
      }
      case 'subject-line': return [P(auto || subjectLine(f, ctx), { b: 1, align: 'center' })];
      case 'subject-domain': { const [a, b] = subjectDomain(f, v, ctx); return [P([a, b].filter(Boolean).join(' – '))]; }
      case 'static': return [P(staticText(f, ctx), { b: 1, align: 'center' })];
      case 'select': return [P(selectText(f, v, ctx))];
      case 'multi-select': return [P(arr(v).map(x => selectText(f, x, ctx)).filter(Boolean).join(ctx.dir === 'rtl' ? '، ' : ', '))];
      case 'checkbox': return [{ t: 'checks', items: checkItems(f, v, ctx), cols: ctx.style === 'pi' ? 2 : 3 }];
      case 'list': return listBlocks(f, listItems(v), ctx);
      case 'activity-list': return listBlocks({ ...f, intro: null }, activityItems(v, ctx), ctx);
      case 'activity-phases': return phaseBlocks(f, v, ctx);
      case 'sk-select': case 'sp-select': return stdBlocks(stdItems(f, v, ctx), ctx);
      case 'differentiation': return diffBlocks(v, ctx);
      case 'reflection': return reflBlocks(f, v, ctx);
      case 'postponement': return [P(postponeText(f, v))];
      case 'tasmik-detail': return tasmikRows(v).map(x => P([x.murid, x.bacaan, [x.mula, x.tamat].filter(Boolean).join(' – '), x.catatan].filter(Boolean).join(' · ')));
      default: return textBlocks(v);
    }
  }
  function staticText(f, ctx) { return labelText(f, f.lang || ctx.lang); }
  function subjectLine(f, ctx) {
    const y = ctx.rph.year;
    return String(f.valueTemplate || '{subject}')
      .replace('{yearOrdinalAr}', (f.yearOrdinalAr && f.yearOrdinalAr[y]) || String(y ?? ''))
      .replace('{year}', String(y ?? ''))
      .replace('{subject}', subjectName(ctx, ctx.lang === 'ms' ? 'ms' : ctx.lang));
  }
  function subjectDomain(f, v, ctx) {
    const subj = f.subjectText || subjectName(ctx, ctx.lang);
    const dom = isEmpty(v) ? '' : (f.bank ? RPH.banks.valueLabel(f.bank, v, ctx.lang === 'ms' ? 'ms' : ctx.lang) : stripTxt(v));
    return [subj, dom];
  }
  /** Medan yang boleh dibahagi kepada dua sel (templat PI). */
  function splitParts(f, ctx) {
    const v = rawValue(f, ctx);
    const C = { align: 'center' };
    if (f.type === 'term-week') { const [t, w] = termWeek(v, ctx); return [[P(t, C)], [P(w, C)]]; }
    if (f.type === 'day-date') return [[P(dayName(f, ctx), C)], [P(fmtDate(f, ctx), C)]];
    if (f.type === 'time-range' && f.sessionOptions) { const t = timeParts(f, v, ctx); return [[P(t.session, C)], [P(t.range, C)]]; }
    if (f.type === 'subject-domain') { const [a, b] = subjectDomain(f, v, ctx); return [[P(a, C)], [P(b, C)]]; }
    return [valueBlocks(f, ctx)];
  }

  // ======================================================================
  // 4. Pembina baris
  // ======================================================================
  function labelCell(f, ctx, o = {}) {
    const blocks = [];
    const main = labelText(f, ctx.lang);
    // Label dwibahasa apabila pilihan medan dalam Rumi (cth. Aspirasi Murid / تطلعات الطلاب).
    const L = f.label || {};
    if (f.type === 'checkbox' && ctx.lang !== 'ms' && L.ms && main !== L.ms) {
      const items = checkItems(f, rawValue(f, ctx), ctx);
      if (items.length && items.every(i => !hasArabic(i.label))) blocks.push(P(L.ms, { b: 1 }));
    }
    blocks.push(P(main, { b: 1 }));
    return cell(blocks, { kind: 'label', fill: ctx.theme.label, valign: ctx.style === 'pi' ? 'center' : 'top', span: o.span || 1 });
  }
  const titleRow = (f, text, ctx) => row(f.key, [cell(P(text, { b: 1, lg: 1, align: 'center' }), { span: 7, kind: 'title', fill: ctx.theme.title, align: 'center', valign: 'center' })]);
  const isShort = f => META.has(f.type) || f.type === 'subject-domain' || f.type === 'select' || f.type === 'multi-select' || f.type === 'checkbox' || f.type === 'theme-select' || (f.type === 'text' && !f.multi);

  /** Baris berbilang item: [label (rowspan)] + baris-baris kandungan. */
  function stack(f, ctx, contentRows) {
    if (!contentRows.length) contentRows = [[cell(P(''), { span: 6 })]];
    return contentRows.map((cells, i) => row(f.key, [i === 0 ? withRowSpan(labelCell(f, ctx), contentRows.length) : null, ...cells]));
  }
  function numberedRows(f, items, ctx, intro) {
    const rows = [];
    if (intro) rows.push([cell(P(intro), { span: 6 })]);
    const scheme = numbering(f, ctx, items.length);
    if (scheme === 'none') { if (items.length) rows.push([cell(items.map(t => P(t)), { span: 6 })]); }
    else items.forEach((t, i) => rows.push([cell(P(numLabel(i, scheme), { align: 'center' }), { kind: 'num', align: 'center' }), cell(P(t), { span: 5 })]));
    return rows;
  }
  function tasmikTable(f, v, ctx) {
    const head = TASMIK_HEAD[ctx.lang] || TASMIK_HEAD.ms;
    const spans = [2, 1, 1, 1, 1];
    const rows = [head.map((t, i) => cell(P(t, { b: 1, align: 'center' }), { span: spans[i], kind: 'head', fill: ctx.theme.head, align: 'center' }))];
    const data = tasmikRows(v);
    (data.length ? data : [{}]).forEach(x => rows.push(['murid', 'bacaan', 'mula', 'tamat', 'catatan'].map((k, i) => cell(P(x[k] || ''), { span: spans[i] }))));
    return stack(f, ctx, rows);
  }
  function tpGrid(f, v, ctx) {
    v = v && typeof v === 'object' ? v : {};
    const groups = diffGroups();
    // Bank TP disunting sehingga bukan 6 tahap → paparan tiga baris biasa (grid perlu tepat 6 lajur).
    if (groups.reduce((n, g) => n + (g.tp || []).length, 0) !== 6) return [row(f.key, [labelCell(f, ctx), cell(diffBlocks(v, ctx), { span: 6 })])];
    const sel = selectedTp(ctx);
    const r1 = groups.map(g => cell(P(String(g.ms || g.id).toUpperCase(), { align: 'center' }), { span: (g.tp || [1, 2]).length, align: 'center' }));
    const r2 = groups.flatMap(g => (g.tp || []).map(n => cell(P(`TP${n}${sel === n ? ' ✓' : ''}`, { b: 1, align: 'center' }), { kind: 'head', fill: ctx.theme.head, align: 'center' })));
    const r3 = groups.map(g => cell(P(v[g.id] || ''), { span: (g.tp || [1, 2]).length }));
    return stack(f, ctx, [r1, r2, r3]);
  }
  function checkRows(f, v, ctx) {
    const items = checkItems(f, v, ctx);
    const rows = [];
    for (let i = 0; i < items.length; i += 6) {
      const chunk = items.slice(i, i + 6);
      rows.push(chunk.map((it, j) => cell(PR([run(it.on ? '☑' : '☐', { box: 1 }), run(' ' + it.label)]), { span: j === chunk.length - 1 ? 7 - chunk.length : 1 })));
    }
    return stack(f, ctx, rows);
  }

  // ---- Templat PI / Tasmik (Jawi): medan pendek dipasangkan, label di kanan ----
  function piPair(fa, fb, ctx) {
    const V = o => ({ valign: 'center', ...o });
    const cells = [labelCell(fa, ctx)];
    const pa = splitParts(fa, ctx);
    if (!fb) {
      if (pa.length === 2) cells.push(cell(pa[0], V({ span: 3 })), cell(pa[1], V({ span: 3 })));
      else cells.push(cell(pa[0], V({ span: 6 })));
      return [row(fa.key, cells)];
    }
    if (pa.length === 2) cells.push(cell(pa[0], V({ span: 2 })), cell(pa[1], V()));
    else cells.push(cell(pa[0], V({ span: 3 })));
    cells.push(cell(labelCell(fb, ctx).blocks, { kind: 'label', fill: ctx.theme.head, valign: 'center' }));
    const pb = splitParts(fb, ctx);
    if (pb.length === 2) cells.push(cell(pb[0], V()), cell(pb[1], V()));
    else cells.push(cell(pb[0], V({ span: 2 })));
    return [row(`${fa.key}+${fb.key}`, cells)];
  }
  function piLong(f, ctx) {
    const v = rawValue(f, ctx);
    switch (f.type) {
      case 'static': return [titleRow(f, staticText(f, ctx), ctx)];
      case 'subject-line': return [titleRow(f, labelText(f, ctx.lang), ctx), row(f.key, [cell(P(subjectLine(f, ctx), { b: 1, align: 'center' }), { span: 7, align: 'center' })])];
      case 'sk-select': case 'sp-select':
        return stack(f, ctx, stdItems(f, v, ctx).map(it => [cell(P(it.code, { align: 'center', sm: 1 }), { kind: 'num', align: 'center' }), cell([P(it.text), it.missing ? P(MISSING, { sm: 1, muted: 1 }) : null, it.untranslated ? P(origMark(ctx), { sm: 1, muted: 1 }) : null], { span: 5 })]));
      case 'list': return stack(f, ctx, numberedRows(f, listItems(v), ctx, f.intro));
      case 'activity-list': return stack(f, ctx, numberedRows(f, activityItems(v, ctx), ctx, null));
      case 'reflection':
        if (reflCustom(v)) return stack(f, ctx, [[cell(paras(reflCustom(v)), { span: 6 })]]);
        return stack(f, ctx, reflLines(f, v, ctx).map(l => {
          const c1 = l.fmt === 'checkbox' ? PR([run(l.mark ? '☑' : '☐', { box: 1 })], { align: 'center' }) : P(l.count, { align: 'center', dir: 'ltr' });
          return [cell(c1, { kind: 'num', align: 'center' }), cell(PR([l.prefix ? run(l.prefix + ' ') : null, run(l.text)]), { span: 5 })];
        }));
      case 'postponement':
        return [row(f.key, [cell(PR([run(labelText(f, ctx.lang) + ' ', { b: 1 }), run(postponeText(f, v))]), { span: 7 })])];
      case 'differentiation': return f.layout === 'tp-grid' ? tpGrid(f, v, ctx) : [row(f.key, [labelCell(f, ctx), cell(diffBlocks(v, ctx), { span: 6 })])];
      case 'tasmik-detail': return tasmikTable(f, v, ctx);
      case 'checkbox': return [row(f.key, [labelCell(f, ctx), cell({ t: 'checks', items: checkItems(f, v, ctx), cols: 3 }, { span: 6 })])];
      default: return [row(f.key, [labelCell(f, ctx), cell(valueBlocks(f, ctx), { span: 6 })])];
    }
  }
  function buildPi(fields, ctx) {
    const vis = fields.filter(f => !hidden(f, ctx));
    const out = [];
    for (let i = 0; i < vis.length; i++) {
      const f = vis[i];
      if (isShort(f)) {
        const f2 = vis[i + 1] && isShort(vis[i + 1]) ? vis[i + 1] : null;
        out.push(...piPair(f, f2, ctx));
        if (f2) i++;
        continue;
      }
      out.push(...piLong(f, ctx));
    }
    return out;
  }

  // ---- Templat BA (Arab) & generik (Rumi): satu medan sebaris, label di sisi ----
  function metaPair(fa, fb, ctx) {
    const cells = [labelCell(fa, ctx), cell(valueBlocks(fa, ctx), { span: fb ? 2 : 6, align: 'center' })];
    if (fb) cells.push(labelCell(fb, ctx), cell(valueBlocks(fb, ctx), { span: 3, align: 'center' }));
    return row(fb ? `${fa.key}+${fb.key}` : fa.key, cells);
  }
  function baMeta(fs, ctx) {
    const [w, d, dy, c, t] = fs;
    return [
      row(`${w.key}+${d.key}`, [withRowSpan(labelCell(w, ctx), 2), cell(valueBlocks(w, ctx), { span: 2, rowSpan: 2, align: 'center', valign: 'center' }), labelCell(d, ctx), cell(valueBlocks(d, ctx), { span: 3, align: 'center' })]),
      row(dy.key, [labelCell(dy, ctx), cell(valueBlocks(dy, ctx), { span: 3, align: 'center' })]),
      row(`${c.key}+${t.key}`, [labelCell(c, ctx), cell(valueBlocks(c, ctx), { span: 2, align: 'center' }), labelCell(t, ctx), cell(valueBlocks(t, ctx), { span: 3, align: 'center' })]),
    ];
  }
  function rowsLong(f, ctx) {
    const v = rawValue(f, ctx);
    switch (f.type) {
      case 'static': return [titleRow(f, staticText(f, ctx), ctx)];
      case 'subject-line': return [titleRow(f, labelText(f, ctx.lang), ctx), row(f.key, [cell(P(subjectLine(f, ctx), { b: 1, align: 'center' }), { span: 7, align: 'center' })])];
      case 'checkbox': return checkRows(f, v, ctx);
      case 'differentiation': return (f.layout === 'tp-grid' || ctx.style === 'ba') ? tpGrid(f, v, ctx) : [row(f.key, [labelCell(f, ctx), cell(diffBlocks(v, ctx), { span: 6 })])];
      case 'tasmik-detail': return tasmikTable(f, v, ctx);
      default: return [row(f.key, [labelCell(f, ctx), cell(valueBlocks(f, ctx), { span: 6 })])];
    }
  }
  function buildRows(fields, ctx) {
    const vis = fields.filter(f => !hidden(f, ctx));
    const out = [];
    const BA_META = ['week', 'date', 'day', 'class', 'time-range'];
    for (let i = 0; i < vis.length; i++) {
      const f = vis[i];
      if (ctx.style === 'ba' && BA_META.every((t, k) => vis[i + k] && vis[i + k].type === t)) { out.push(...baMeta(vis.slice(i, i + 5), ctx)); i += 4; continue; }
      if (META.has(f.type)) {
        const f2 = vis[i + 1] && META.has(vis[i + 1].type) ? vis[i + 1] : null;
        out.push(metaPair(f, f2, ctx));
        if (f2) i++;
        continue;
      }
      out.push(...rowsLong(f, ctx));
    }
    return out;
  }

  /** Tetapkan indeks lajur setiap sel & sahkan grid (rowspan/colspan). */
  function assignCols(rows, n) {
    const occ = [];
    rows.forEach((r, ri) => {
      const busy = occ[ri] || new Set();
      let c = 0;
      for (const cl of r.cells) {
        while (busy.has(c)) c++;
        cl.col = c;
        for (let k = 1; k < cl.rowSpan; k++) {
          const s = occ[ri + k] || (occ[ri + k] = new Set());
          for (let j = 0; j < cl.span; j++) s.add(c + j);
        }
        c += cl.span;
      }
      while (busy.has(c)) c++;
      if (c !== n) throw new Error(`[render] baris "${r.field}" meliputi ${c}/${n} lajur`);
    });
  }

  // ======================================================================
  // 5. Model
  // ======================================================================
  function fallbackTemplate(rph) {
    const s = safe(() => store().subject(rph.subjectId), null);
    return safe(() => store().template(s && s.defaultTemplateId), null) || safe(() => store().template('tpl-generic-kpm'), null);
  }
  function headerInfo(opts) {
    if (opts.header === false) return null;
    const st = safe(() => store().get('settings'), {}) || {};
    const school = safe(() => store().get('school'), {}) || {};
    const teacher = safe(() => store().get('teacher'), {}) || {};
    const h = {
      logo: st.showLogo !== false && school.logo ? school.logo : null,
      schoolName: st.showSchoolName !== false ? school.name || '' : '',
      teacherName: st.showTeacherName !== false ? teacher.fullName || teacher.name || '' : '',
      teacherLabel: opts.lang === 'en' ? 'Teacher' : 'Guru',
    };
    return h.logo || h.schoolName || h.teacherName ? h : null;
  }
  /**
   * Model susun atur RPH (dikongsi HTML & DOCX).
   * → {rph, template, variant, dir, lang, arLang, style, theme, cols:[%], rows:[{field, cells:[{col,span,rowSpan,kind,fill,align,valign,blocks}]}], header}
   */
  function model(rph, opts = {}) {
    if (!rph) throw new Error('RPH tiada');
    const tpl = safe(() => store().template(rph.templateId), null) || fallbackTemplate(rph);
    if (!tpl) throw new Error(`Templat "${rph.templateId}" tidak ditemui`);
    const variant = opts.variant || rph.variant || tpl.defaultVariant || 'standard';
    const keys = (tpl.variants && (tpl.variants[variant] || tpl.variants[tpl.defaultVariant])) || tpl.fields.map(f => f.key);
    const fmap = new Map(tpl.fields.map(f => [f.key, f]));
    const fields = keys.map(k => fmap.get(k)).filter(Boolean);
    const lang = tpl.labelLang || 'ms';
    const style = tpl.layout || (lang === 'jawi' ? 'pi' : lang === 'ar' ? 'ba' : 'generic');
    const dir = tpl.direction === 'rtl' ? 'rtl' : 'ltr';
    const theme = { ...THEMES[style] || THEMES.generic, ...(tpl.colors || {}) };
    const ctx = {
      rph, tpl, lang, style, dir, theme, opts,
      subject: safe(() => store().subject(rph.subjectId), null),
      school: safe(() => store().get('school'), {}) || {},
    };
    const rows = style === 'pi' ? buildPi(fields, ctx) : buildRows(fields, ctx);
    const cols = (tpl.columns && tpl.columns.length === 7 ? tpl.columns : COLS[style] || COLS.generic).slice();
    // Nota kaki terjemahan (Tetapan → Paparan Cetak → "Papar nota terjemahan SK/SP", lalai MATI): hanya jika
    // SK/SP terjemahan (bukan teks asal DSKP) benar-benar dipaparkan.
    const st = safe(() => store().get('settings'), {}) || {};
    if (ctx.translatedStd && st.showTranslationNote === true && RPH.i18n) {
      rows.push(row('i18nNote', [cell(P(RPH.i18n.note(lang), { sm: 1, muted: 1 }), { span: cols.length, kind: 'note' })]));
    }
    assignCols(rows, cols.length);
    // Baris sangat tinggi (cth. aktiviti BA) dibenarkan merentas halaman; baris lain tidak dipecahkan.
    rows.forEach(r => { r.tall = Math.max(...r.cells.map(c => c.blocks.reduce((n, b) => n + (b.t === 'checks' ? Math.ceil(b.items.length / (b.cols || 2)) : 1), 0))) >= TALL_ROW; });
    // Bahasa skrip Arab: ikut templat (ar/jawi); templat generik (ms) → ikut skrip subjek (BA=arabic, PI/Tasmik=jawi).
    const arLang = lang === 'jawi' ? 'ms-Arab' : lang === 'ar' ? 'ar' : (ctx.subject && ctx.subject.script === 'jawi' ? 'ms-Arab' : 'ar');
    return { rph, template: tpl, variant, dir, lang, arLang, style, theme, cols, rows, header: headerInfo({ ...opts, lang }) };
  }

  /**
   * Fon skrip Arab bagi output (keputusan guru 2026-10-02): Bahasa Arab → Traditional Arabic (seperti RPH asal guru);
   * Jawi → Noto Naskh Arabic (dibenamkan; menyokong ڠ ڤ ݢ چ ڽ ۏ). Teks dengan huruf khas Jawi sentiasa Noto Naskh.
   */
  const FONT_TRAD = 'Traditional Arabic';
  const JAWI_ONLY = /[\u06A0\u06A4\u0762\u0686\u06BD\u06CF\u0674]/;
  const arFont = (m, text) => (m && m.arLang === 'ar' && !JAWI_ONLY.test(String(text || '')) ? 'trad' : 'naskh');

  // ---------- Pelan mingguan / tajuk hari ----------
  const sortRphs = list => list.slice().sort((a, b) => (String(a.date) + (a.start || '')).localeCompare(String(b.date) + (b.start || '')));
  /** Tajuk minggu/hari. lang 'en' → Inggeris (semua RPH minggu/hari itu dalam bahasa Inggeris); selainnya Melayu (amalan guru). */
  const weekTitle = (n, lang) => (lang === 'en'
    ? `DAILY LESSON PLANS${n != null && n !== '' ? ` WEEK ${n}` : ''}`
    : `RANCANGAN PEMBELAJARAN HARIAN${n != null && n !== '' ? ` MINGGU ${n}` : ''}`);
  function dayTitle(iso, lang) {
    if (!iso) return '';
    if (lang === 'en') return `${U().dayNameEn(U().dow(iso)).toUpperCase()} ( ${U().fmtDate(iso, 'long-en').toUpperCase()} )`;
    return `${U().dayNameMs(U().dow(iso)).toUpperCase()} ( ${U().fmtDate(iso, 'long').toUpperCase()} )`;
  }
  const tplLang = r => { const t = safe(() => store().template(r.templateId), null) || safe(() => fallbackTemplate(r), null); return (t && t.labelLang) || 'ms'; };
  /** [{rph, weekHeading|null, dayHeading|null}] — tajuk minggu & hari seperti dokumen mingguan guru. */
  function plan(rphs) {
    let lastWeek, lastDate;
    const list = sortRphs(rphs || []);
    const wk = r => (r.week != null && r.week !== '' ? r.week : safe(() => RPH.cal.schoolWeek(r.date), null));
    const allEn = pred => { const xs = list.filter(pred); return xs.length && xs.every(x => tplLang(x) === 'en') ? 'en' : 'ms'; };
    return list.map(r => {
      const w = wk(r);
      const e = { rph: r, week: w, weekHeading: null, dayHeading: null };
      if (w !== lastWeek) { e.weekHeading = weekTitle(w, allEn(x => wk(x) === w)); lastWeek = w; lastDate = undefined; }
      if (r.date !== lastDate) { e.dayHeading = dayTitle(r.date, allEn(x => x.date === r.date)); lastDate = r.date; }
      return e;
    });
  }

  // ======================================================================
  // 6. HTML
  // ======================================================================
  const H = (...a) => RPH.ui.h(...a);
  /** Teks → nod; penanda NBOX menjadi <span class="rph-numbox"> (kotak bilangan kosong). */
  const boxify = t => (String(t).includes(NBOX)
    ? String(t).split(NBOX).flatMap((x, i) => (i ? [H('span', { class: 'rph-numbox', title: 'Isi bilangan murid' }, NBOX_FILL), x] : [x])).filter(x => x !== '')
    : t);
  function runNodes(r, base, m) {
    if (r.box) return [H('span', { class: 'rph-box', 'aria-hidden': 'true' }, r.text)];
    const nodes = runSegments(r, base).map(sg => {
      if (!sg.iso) return boxify(sg.text);
      return base === 'rtl'
        ? H('bdi', { dir: 'ltr', class: 'lat' }, boxify(sg.text))
        : H('bdi', { dir: 'rtl', lang: m.arLang, class: ['ar', arFont(m, sg.text) === 'trad' && 'f-trad'] }, boxify(sg.text));
    });
    let el = nodes;
    if (r.u) el = [H('u', null, el)];
    if (r.b) el = [H('strong', null, el)];
    if (r.sm || r.muted) el = [H('span', { class: [r.sm && 'rph-sm', r.muted && 'rph-muted'] }, el)];
    return el;
  }
  function paraEl(b, m, cellAlign) {
    const base = baseDir(b, m);
    const align = b.align || cellAlign || (base === 'ltr' && m.dir === 'rtl' ? 'right' : null);
    return H('div', {
      class: ['rph-p', base === 'rtl' ? 'p-rtl' : 'p-ltr', base === 'rtl' && arFont(m, b.runs.map(r => r.text).join('')) === 'trad' && 'f-trad', b.lg && 'rph-lg', align && `al-${align}`],
      dir: base, lang: base === 'rtl' ? m.arLang : (m.lang === 'en' ? 'en' : 'ms'),
    }, b.runs.map(r => runNodes(r, base, m)));
  }
  function checksEl(b, m) {
    return H('div', { class: 'rph-checks', style: { gridTemplateColumns: `repeat(${Math.max(1, Math.min(b.cols || 2, b.items.length || 1))}, minmax(0, 1fr))` } },
      b.items.map(it => H('div', { class: ['rph-check', it.on && 'on'] }, paraEl(PR([run(it.on ? '☑' : '☐', { box: 1 }), run(' ' + it.label)]), m))));
  }
  function cellEl(c, m) {
    const label = c.kind === 'label' || c.kind === 'title' || c.kind === 'head';
    return H(label ? 'th' : 'td', {
      colspan: c.span > 1 ? c.span : null, rowspan: c.rowSpan > 1 ? c.rowSpan : null,
      scope: c.kind === 'label' ? 'row' : null,
      class: [`c-${c.kind}`, c.align && `al-${c.align}`, c.valign && `va-${c.valign}`],
      style: c.fill ? { backgroundColor: `#${c.fill}` } : null,
    }, c.blocks.map(b => (b.t === 'checks' ? checksEl(b, m) : paraEl(b, m, c.align))));
  }
  function tableEl(m) {
    return H('table', { class: ['rph-table', `rph-${m.style}`], dir: m.dir, lang: m.dir === 'rtl' ? m.arLang : (m.lang === 'en' ? 'en' : 'ms') },
      H('colgroup', null, m.cols.map(w => H('col', { style: { width: `${w}%` } }))),
      H('tbody', null, m.rows.map(r => H('tr', { class: ['rph-row', r.tall && 'rph-row-tall'], 'data-field': r.field }, r.cells.map(c => cellEl(c, m))))));
  }
  function headerEl(hd) {
    return H('header', { class: 'rph-head', dir: 'ltr' },
      hd.logo ? H('img', { class: 'rph-logo', src: hd.logo, alt: 'Logo sekolah' }) : null,
      H('div', { class: 'rph-head-text' },
        hd.schoolName ? H('div', { class: 'rph-school' }, hd.schoolName) : null,
        hd.teacherName ? H('div', { class: 'rph-teacher' }, `${hd.teacherLabel || 'Guru'}: ${hd.teacherName}`) : null));
  }
  function pageEl(rph, opts, pre) {
    let m;
    try { m = model(rph, opts); }
    catch (e) {
      RPH.reportError && RPH.reportError('pratonton RPH', e);
      return H('section', { class: ['rph-page', 'a4', 'rph-error'] }, H('p', null, `RPH tidak dapat dipaparkan: ${e.message}`));
    }
    return H('section', { class: ['rph-page', 'a4', `rph-style-${m.style}`], dir: m.dir, 'data-rph-id': rph.id || null },
      m.header ? headerEl(m.header) : null,
      pre || null,
      tableEl(m));
  }
  const docEl = (mode, extra, pages) => H('div', { class: ['rph-doc', `mode-${mode === 'print' ? 'print' : 'preview'}`, extra] }, pages);

  RPH.render = {
    /** Satu RPH → <div.rph-doc> berisi satu halaman A4. opts: {mode:'preview'|'print', variant, header:false, showMinutes} */
    rph(rph, opts = {}) { return docEl(opts.mode, null, [pageEl(rph, opts)]); },
    /** Beberapa RPH → dokumen mingguan: "RANCANGAN PEMBELAJARAN HARIAN MINGGU n" + "ISNIN ( 27 JULAI 2026 )". */
    week(rphs, opts = {}) {
      const pages = plan(rphs).map(e => pageEl(e.rph, { ...opts, variant: opts.variant }, [
        e.weekHeading ? H('div', { class: 'rph-week-title', dir: 'ltr' }, e.weekHeading) : null,
        e.dayHeading ? H('div', { class: 'rph-day-title', dir: 'ltr' }, e.dayHeading) : null,
      ].filter(Boolean)));
      return docEl(opts.mode, 'rph-weekly', pages);
    },
    /** 1 RPH → rph(); lebih → week(). */
    list(rphs, opts = {}) { return (rphs || []).length === 1 ? RPH.render.rph(rphs[0], opts) : RPH.render.week(rphs || [], opts); },
    model, plan, weekTitle, dayTitle, segments, runSegments, baseDir, firstStrong, hasArabic, sortRphs, arFont, FONT_TRAD, JAWI_ONLY, NBOX, NBOX_FILL,
    THEMES, COLS,
  };
})(window.RPH = window.RPH || {});
