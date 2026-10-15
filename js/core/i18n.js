/* Kandungan 4 bahasa (RPH.i18n) — kontrak docs/I18N_CONTRACT.md §2.
   Bahasa: 'ms' (Melayu Rumi), 'en' (Inggeris), 'ar' (Arab Fusha), 'jawi' (Melayu tulisan Jawi).
   Sumber data (semua pilihan; jika tiada → teks asal + translated:false, tiada teka senyap):
     - kurikulum: item SK/SP/TP `i18n: {ms,en,ar,jawi}`, domain/tema `name.{ms,en,ar,jawi}`
     - leksikon awam: store 'i18nLexicon' → RPH_SEED_PUBLIC.i18nLexicon  {terms, surahs, holidays, phrases}
     - topik peribadi: store 'i18nTopics'  → RPH_SEED_PRIVATE.i18nTopics  (format = phrases)
   Jawi ↔ Rumi TIDAK ditransliterasi secara automatik. Kosa kata/ungkapan BA (bahan pelajaran) bukan urusan modul ini.
   Mesti dimuatkan selepas store.js/curriculum.js dan sebelum enjin. Tiada DOM. */
(function (RPH) {
  'use strict';
  const LANGS = ['ms', 'en', 'ar', 'jawi'];
  const TASHKIL = /[ً-ْٰ]/g;

  const safe = (fn, dflt) => { try { const v = fn(); return v === undefined || v === null ? dflt : v; } catch (e) { return dflt; } };
  const W = () => (typeof window !== 'undefined' ? window : {});
  const isAr = s => /[؀-ۿݐ-ݿ]/.test(String(s || ''));
  const JAWI_ONLY = /[ڠڤݢچڽۏڬٴڠ]/;

  /** Kunci padanan: tanpa baris, hamzah tiga suku → ء, ruang seragam, "اولڠ كاجي"/"تيك س" diseragamkan. */
  function norm(s) {
    return String(s == null ? '' : s).normalize('NFC').replace(TASHKIL, '').replace(/ـ/g, '')
      .replace(/ٴ/g, 'ء').replace(/[یى]/g, 'ي').replace(/ک/g, 'ك')
      .replace(/اولڠ كاجي/g, 'اولڠكاجي').replace(/تيك س(?=$|[\s.,،؛:)\]])/g, 'تيكس')
      .replace(/[“”"]/g, '').replace(/\s+/g, ' ').replace(/\s*([:،,.])\s*$/, '').trim();
  }
  /** Kunci longgar (ejaan gantian, alif berhamzah, tanda baca) — padanan kedua sahaja. */
  function loose(s) {
    const n = norm(s).toLowerCase();
    const leg = safe(() => RPH.jawi.normalizeForMatch(n), null);
    return leg != null ? leg : n.replace(/[آأإٱ]/g, 'ا').replace(/[\s.,:;،؛()\-–]/g, '');
  }
  const res = (text, translated, original, extra) => ({ text: text == null ? '' : String(text), translated: !!translated, original: original == null ? '' : String(original), ...(extra || {}) });

  // ------------------------------------------------------------------
  // Sumber data
  // ------------------------------------------------------------------
  function storeGet(name) { return safe(() => RPH.store.get(name), null); }
  function lexicon() {
    const s = storeGet('i18nLexicon');
    if (s && typeof s === 'object' && Object.keys(s).length) return s;
    return safe(() => W().RPH_SEED_PUBLIC.i18nLexicon, null) || {};
  }
  function privTopics() {
    const s = storeGet('i18nTopics');
    const v = s && typeof s === 'object' && Object.keys(s).length ? s : safe(() => W().RPH_SEED_PRIVATE.i18nTopics, null);
    if (!v || typeof v !== 'object') return {};
    if (v.phrases && typeof v.phrases === 'object') return v.phrases;
    const o = {};
    for (const [k, x] of Object.entries(v)) if (x && typeof x === 'object' && !Array.isArray(x)) o[k] = x;
    return o;
  }

  // Indeks (dibina semula apabila objek sumber bertukar).
  let idx = null; let idxFor = null;
  function index() {
    const lex = lexicon(); const tp = privTopics();
    if (idx && idxFor && idxFor[0] === lex && idxFor[1] === tp) return idx;
    const phrases = new Map(); const phrasesL = new Map();
    const addPhrase = (k, e) => {
      if (!e || typeof e !== 'object') return;
      const keys = [k, ...LANGS.map(l => e[l])].filter(x => typeof x === 'string' && x.trim());
      for (const key of keys) {
        if (!phrases.has(norm(key))) phrases.set(norm(key), e);
        if (!phrasesL.has(loose(key))) phrasesL.set(loose(key), e);
      }
    };
    for (const [k, e] of Object.entries(lex.phrases || {})) addPhrase(k, e);
    for (const [k, e] of Object.entries(tp)) addPhrase(k, e);
    const terms = new Map(); const termsL = new Map();
    for (const [k, e] of Object.entries(lex.terms || {})) {
      if (!e || typeof e !== 'object') continue;
      for (const key of [k, ...LANGS.map(l => e[l])].filter(x => typeof x === 'string' && x.trim())) {
        if (!terms.has(norm(key))) terms.set(norm(key), e);
        if (!termsL.has(loose(key))) termsL.set(loose(key), e);
      }
    }
    const surahs = new Map();
    for (const [k, e] of Object.entries(lex.surahs || {})) {
      if (!e || typeof e !== 'object') continue;
      for (const key of [k, ...LANGS.map(l => e[l])].filter(Boolean)) surahs.set(surahKey(key), e);
    }
    idx = { phrases, phrasesL, terms, termsL, surahs, holidays: Object.values(lex.holidays || {}).filter(x => x && typeof x === 'object') };
    idxFor = [lex, tp];
    return idx;
  }

  // ------------------------------------------------------------------
  // Kurikulum
  // ------------------------------------------------------------------
  const curOf = (subjectId, year) => safe(() => RPH.store.curriculum(subjectId, year), null);
  /** Bahasa asal kurikulum/subjek: arabic → ar, jawi → jawi, selainnya c.lang || 'ms'. */
  function nativeLang(subjectId, year) {
    const c = curOf(subjectId, year);
    const s = safe(() => RPH.store.subject(subjectId), null);
    const src = c && c.i18nMeta && c.i18nMeta.sourceLang;
    if (LANGS.includes(src)) return src;
    const script = (c && c.script) || (s && s.script) || null;
    if (script === 'arabic') return 'ar';
    if (script === 'jawi') return 'jawi';
    return (c && (c.lang || c.language)) || (s && s.lang) || 'ms';
  }
  function item(subjectId, year, code) {
    const parts = String(code).split('.').length;
    const get = sid => safe(() => (parts >= 3 ? RPH.curr.sp(sid, year, code) : RPH.curr.sk(sid, year, code)), null);
    return get(subjectId) || (subjectId === 'PIQ' ? get('PI') : null);
  }
  const pickLang = (o, lang) => (o && typeof o === 'object' && typeof o[lang] === 'string' && o[lang].trim() ? o[lang].trim() : '');

  /** SK/SP (kod DSKP atau "txt:<teks>") → teks dalam bahasa diminta. */
  function std(subjectId, year, code, lang) {
    const c = String(code == null ? '' : code);
    if (!c) return res('', false, '', { missing: true });
    if (c.startsWith('txt:')) {
      const t = c.slice(4);
      const p = topic(t, lang, { subjectId });
      return res(p.text, p.translated, t, { native: !!p.native });
    }
    const it = item(subjectId, year, c);
    if (!it) return res('', false, '', { missing: true });
    const original = it.text || '';
    const nat = nativeLang(subjectId, year);
    if (lang === nat || !LANGS.includes(lang)) return res(original, false, original, { native: true });
    const t = pickLang(it.i18n, lang);
    return t ? res(t, true, original) : res(original, false, original);
  }
  /** Tahap penguasaan (TP) bagi SK: level n → teks bahasa diminta. */
  function tp(subjectId, year, skCode, level, lang) {
    const lv = (safe(() => RPH.curr.tp(subjectId, year, skCode), []) || []).find(x => +x.tp === +level || +x.level === +level);
    if (!lv) return res('', false, '', { missing: true });
    const nat = nativeLang(subjectId, year);
    const orig = typeof lv.text === 'string' ? lv.text : pickLang(lv.text, nat) || pickLang(lv.text, 'ms') || pickLang(lv.text, 'ar') || '';
    const t = pickLang(lv.i18n, lang) || (lv.text && typeof lv.text === 'object' ? pickLang(lv.text, lang) : '') || (lang === nat ? orig : '');
    return t ? res(t, lang !== nat, orig) : res(orig, false, orig);
  }
  function domain(subjectId, year, code, lang) {
    const d = (safe(() => RPH.curr.domains(subjectId, year), []) || []).find(x => String(x.code) === String(code));
    if (!d) return res('', false, '', { missing: true });
    const n = d.name || {};
    const nat = nativeLang(subjectId, year);
    const orig = pickLang(n, nat) || pickLang(n, 'ms') || pickLang(n, 'ar') || pickLang(n, 'jawi') || '';
    const t = pickLang(n, lang);
    return t ? res(t, lang !== nat, orig) : res(orig, false, orig);
  }
  /** Tema (محور) — dicari ikut nama dalam mana-mana bahasa. */
  function findTheme(subjectId, year, name) {
    const k = norm(name);
    if (!k) return null;
    return (safe(() => RPH.curr.themes(subjectId, year), []) || []).find(t => t && t.name && Object.values(t.name).some(v => typeof v === 'string' && norm(v) === k)) || null;
  }
  function theme(subjectId, year, themeName, lang) {
    const t = findTheme(subjectId, year, themeName);
    if (!t) {
      const p = topic(themeName, lang, { subjectId });
      return res(p.text, p.translated, themeName, { missing: !p.translated });
    }
    const nat = nativeLang(subjectId, year);
    const orig = pickLang(t.name, nat) || pickLang(t.name, 'ar') || pickLang(t.name, 'ms') || String(themeName || '');
    const tx = pickLang(t.name, lang);
    return tx ? res(tx, lang !== nat, orig, { theme: t }) : res(orig, false, orig, { theme: t });
  }

  // ------------------------------------------------------------------
  // Leksikon
  // ------------------------------------------------------------------
  function term(key, lang) {
    const I = index();
    const lex = lexicon();
    const e = (lex.terms && lex.terms[key]) || I.terms.get(norm(key)) || I.termsL.get(loose(key));
    const t = pickLang(e, lang);
    return t ? res(t, true, key) : res(key, false, key);
  }
  function phrase(text, lang) {
    const I = index();
    const e = I.phrases.get(norm(text)) || I.phrasesL.get(loose(text));
    const t = pickLang(e, lang);
    return t ? res(t, true, text) : res(text, false, text);
  }
  function surahKey(s) {
    return norm(s).replace(/^(سورة|surah|surat)\s+/i, '').replace(/[آأإٱ]/g, 'ا').replace(/^ال\s+عمران$/, 'ال عمران').toLowerCase().trim();
  }
  /** Nama surah → "Surah An-Nas" (ms/en) / "سورة الناس" (ar/jawi). Sandaran: transliterasi bank frasa (deterministik). */
  function surah(name, lang) {
    const raw = String(name || '').trim();
    if (!raw) return res('', false, '');
    const k = surahKey(raw);
    const e = index().surahs.get(k);
    let t = pickLang(e, lang);
    const bareAr = norm(raw).replace(/^سورة\s+/, '');
    if (!t) {
      if (lang === 'ar') t = isAr(bareAr) ? bareAr.replace(/^ال عمران$/, 'آل عمران') : '';
      else if (lang === 'jawi') t = isAr(bareAr) ? bareAr : '';
      else {
        const names = safe(() => RPH.phrases.en.pi.surahNames, {}) || {};
        t = names[bareAr] || names[bareAr.replace(/[آأإ]/g, 'ا')] || '';
      }
    }
    if (!t) return res(raw, false, raw);
    if (lang === 'ar' || lang === 'jawi') { if (!/^سورة\s/.test(t)) t = `سورة ${t}`; } else if (!/^Surah\s/i.test(t)) t = `Surah ${t}`;
    return res(t, true, raw);
  }
  function holiday(text, lang) {
    const s = String(text || '');
    if (!s.trim()) return res('', false, '');
    for (const h of index().holidays) {
      const m = Array.isArray(h.match) ? h.match : h.match ? [h.match] : [];
      const hit = m.some(src => safe(() => new RegExp(src, 'i').test(s), false)) || LANGS.some(l => typeof h[l] === 'string' && norm(h[l]) === norm(s));
      if (hit) { const t = pickLang(h, lang); if (t) return res(t, true, s); }
    }
    return res(s, false, s);
  }

  // ------------------------------------------------------------------
  // Topik
  // ------------------------------------------------------------------
  const REVIEW_RE = /\s*\(\s*(?:اولڠ\s?كاجي|ulang\s?kaji|revision|مراجعة)\s*\)\s*$/i;
  const REVIEW = { ms: '(Ulang Kaji)', en: '(Revision)', ar: '(مراجعة)', jawi: '(اولڠكاجي)' };
  const scriptOf = lang => (lang === 'ar' ? 'arabic' : lang === 'jawi' ? 'jawi' : 'latin');
  const dir = lang => (lang === 'ar' || lang === 'jawi' ? 'rtl' : 'ltr');
  /** Teks sudah dalam skrip bahasa sasaran dan bahasa sumbernya sama (ctx.srcLang)? */
  function sameLang(text, lang, ctx) {
    const src = ctx && ctx.srcLang;
    if (src) return src === lang;
    return false;
  }
  function single(text, lang) {
    const p = phrase(text, lang); if (p.translated) return p;
    const n = norm(text);
    if (/^سورة\s/.test(n) || index().surahs.has(surahKey(n))) { const s = surah(n, lang); if (s.translated) return s; }
    const t = term(n, lang); if (t.translated) return t;
    return res(text, false, text);
  }
  /**
   * Topik RPT/RPH → bahasa sasaran: frasa tepat → akhiran "(اولڠكاجي)" → pecahan "X: Y" / "X – Y" → nama surah → istilah.
   * ctx: {subjectId, srcLang, i18n|topicI18n: {ms,en,ar,jawi}}. Gagal → {text: asal, translated:false}.
   */
  function topic(text, lang, ctx) {
    const original = text == null ? '' : String(text);
    const o = original.trim();
    if (!o) return res('', false, '');
    const given = ctx && (ctx.topicI18n || ctx.i18n);
    const g = pickLang(given, lang);
    if (g) return res(g, true, original);
    if (sameLang(o, lang, ctx)) return res(o, false, original, { native: true });
    const whole = single(o, lang); if (whole.translated) return res(whole.text, true, original);
    const rv = o.match(REVIEW_RE);
    if (rv) {
      const base = topic(o.slice(0, rv.index), lang, ctx);
      if (base.translated) { const suf = term('ulangkaji', lang); return res(`${base.text} ${suf.translated ? `(${suf.text.replace(/^\(|\)$/g, '')})` : REVIEW[lang] || ''}`.trim(), true, original); }
      return res(original, false, original);
    }
    for (const sep of [/\s*:\s*/, /\s+[–—-]\s+/]) {
      const parts = o.split(sep).filter(x => x.trim());
      if (parts.length < 2) continue;
      const tr = parts.map(x => topic(x, lang, ctx));
      if (tr.every(x => x.translated)) return res(tr.map(x => x.text).join(sep.source.includes(':') ? ': ' : ' – '), true, original);
      return res(original, false, original);
    }
    return res(original, false, original);
  }

  // ------------------------------------------------------------------
  // Laporan & nota
  // ------------------------------------------------------------------
  /** Kod/teks tanpa terjemahan: {ms:[…], en:[…], ar:[…], jawi:[…]} (bahasa asal kurikulum dilangkau). */
  function missing(opts) {
    const o = opts || {};
    const all = safe(() => RPH.store.get('curriculum'), {}) || {};
    const out = { ms: [], en: [], ar: [], jawi: [] };
    const list = Object.values(all).filter(c => c && (!o.subjectId || c.subjectId === o.subjectId || (o.subjectId === 'PIQ' && c.subjectId === 'PI')) && (o.year == null || +c.year === +o.year));
    for (const c of list) {
      const nat = c.script === 'arabic' ? 'ar' : c.script === 'jawi' ? 'jawi' : (c.lang || 'ms');
      const tag = list.length > 1 ? `${c.subjectId}-${c.year} ` : '';
      for (const lang of LANGS) {
        if (lang === nat) continue;
        for (const d of c.domains || []) {
          if (!pickLang(d.name, lang)) out[lang].push(`${tag}Domain ${d.code}`);
          for (const sk of d.contentStandards || []) {
            if (!pickLang(sk.i18n, lang)) out[lang].push(`${tag}SK ${sk.code}`);
            for (const sp of sk.learningStandards || []) if (!pickLang(sp.i18n, lang)) out[lang].push(`${tag}SP ${sp.code}`);
          }
        }
        for (const t of c.themes || []) if (!pickLang(t.name, lang)) out[lang].push(`${tag}Tema ${pickLang(t.name, nat) || pickLang(t.name, 'ar') || pickLang(t.name, 'ms')}`);
      }
    }
    return out;
  }
  const NOTE = {
    ms: 'Terjemahan SK/SP ialah draf dan bukan teks rasmi DSKP.',
    en: 'Translations of the Content and Learning Standards are a draft, not the official DSKP text.',
    ar: 'ترجمة معايير المحتوى والتعلم مسودة، وليست النص الرسمي للمنهج.',
    jawi: 'ترجمهن SK/SP اياله دراف، بوكن تيكس رسمي DSKP.',
  };
  const ORIGINAL = { ms: '(teks asal DSKP)', en: '(original DSKP text)', ar: '(نص المنهج الأصلي)', jawi: '(تيكس اصل DSKP)' };
  const note = lang => NOTE[lang] || NOTE.ms;
  const originalMarker = lang => ORIGINAL[lang] || ORIGINAL.ms;
  /** Teks dalam skrip bahasa sasaran? (Jawi ⊂ skrip Arab; tiada pembezaan Jawi/Arab kecuali huruf khas Jawi.) */
  function inScript(text, lang) {
    const s = String(text || '');
    if (!s.trim()) return true;
    const arab = isAr(s);
    if (lang === 'ar' || lang === 'jawi') return arab;
    return !arab;
  }

  RPH.i18n = {
    LANGS, scriptOf, dir, nativeLang, norm,
    std, tp, domain, theme, findTheme, term, surah, holiday, phrase, topic,
    missing, note, originalMarker, inScript,
    hasJawiLetters: s => JAWI_ONLY.test(String(s || '')),
    /** Kosongkan cache indeks (cth. selepas import leksikon). */
    reset() { idx = null; idxFor = null; },
  };
})(window.RPH = window.RPH || {});
