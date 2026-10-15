/* Terjemahan kandungan DSKP (RPH.translate) — 4 bahasa: ms · en · ar · jawi (docs/I18N_CONTRACT.md §1a, §3).
   Untuk DSKP yang diimport kemudian (edisi kosong): kenal pasti item tanpa terjemahan, minta DRAF terjemahan
   daripada Google Gemini (peringkat PERCUMA, melalui RPH.ai.extract), semak, kemudian simpan dengan apply().
   - withAi() TIDAK PERNAH menyimpan: ia memulangkan peta draf { kunci: { bahasa: teks } } untuk disemak guru.
   - apply() satu-satunya fungsi yang menulis ke stor (koleksi 'curriculum').
   - Teks asal DSKP (text, textLegacy, kod, halaman) tidak diubah; terjemahan dalam `i18n` / `name.<bahasa>`.
   Kunci item (sama seperti tools/i18n/apply-curriculum-i18n.mjs):
     D:<bidang>  SK:<kod>  SP:<kod>  TP:<SK>:<tp>  PS:<jadual>:<tp>  TH:<nama tema>
   Bergantung pada: RPH.store, RPH.ai (pilihan). Tiada DOM. */
(function (RPH) {
  'use strict';
  const LANGS = ['ms', 'en', 'ar', 'jawi'];
  const LANG_LABEL = { ms: 'Bahasa Melayu', en: 'English', ar: 'العربية', jawi: 'Jawi' };
  const META_BY = 'draf terjemahan (bukan teks rasmi DSKP)';
  const BATCH = 20;
  const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿ]/;
  // Bentuk Bahasa Indonesia yang tidak boleh digunakan dalam BM (→ bentuk Malaysia).
  const BANNED_MS = { siswa: 'murid', kegiatan: 'aktiviti', materi: 'bahan', berhasil: 'berjaya', bisa: 'boleh', mengerti: 'faham', kelompok: 'kumpulan', evaluasi: 'penilaian', karena: 'kerana', praktek: 'amali', kosakata: 'kosa kata' };

  const nowIso = () => (RPH.util && RPH.util.nowIso ? RPH.util.nowIso() : new Date().toISOString());
  const clone = o => JSON.parse(JSON.stringify(o));
  const err = (msg, code) => Object.assign(new Error(msg), { code });

  // ------------------------------------------------------------------ Kurikulum
  /** Cari kurikulum dalam stor: kunci stor ("BA-3") atau id kurikulum ("BA-T3-KSSR2017"). */
  function locate(curriculumId) {
    const all = (RPH.store && RPH.store.get('curriculum')) || {};
    if (all[curriculumId]) return { key: curriculumId, c: all[curriculumId] };
    for (const [k, c] of Object.entries(all)) if (c && c.id === curriculumId) return { key: k, c };
    return { key: null, c: null };
  }
  /** Bahasa sumber kurikulum: arabic → ar, jawi → jawi, selainnya ms. */
  const sourceLangOf = c => (c && c.script === 'jawi' ? 'jawi' : c && c.script === 'arabic' ? 'ar' : (c && LANGS.includes(c.lang) ? c.lang : 'ms'));
  const str = v => (typeof v === 'string' && v.trim() ? v : '');

  /** Senarai item boleh terjemah dalam susunan DSKP. */
  function items(c) {
    if (!c) return [];
    const sl = sourceLangOf(c), out = [];
    const valOf = t => (t == null ? '' : typeof t === 'string' ? t : t[sl] || t.ms || t.jawi || t.ar || t.en || '');
    const offOf = t => (t && typeof t === 'object' ? Object.fromEntries(LANGS.filter(l => str(t[l])).map(l => [l, t[l]])) : {});
    const push = (key, kind, code, obj, text, official, nameField) => {
      const srcLang = official[sl] ? sl : (LANGS.find(l => official[l]) || sl);
      // Nama bidang/tema: terjemahan disimpan dalam objek `name` yang sama → hanya bahasa sumber dianggap teks asal.
      if (nameField) official = official[srcLang] ? { [srcLang]: official[srcLang] } : {};
      out.push({ key, kind, code, obj, src: text || '', srcLang, official, nameField: !!nameField });
    };
    (c.domains || []).forEach(d => {
      push(`D:${d.code}`, 'domain', String(d.code), d, valOf(d.name), offOf(d.name), true);
      (d.contentStandards || []).forEach(sk => {
        push(`SK:${sk.code}`, 'sk', sk.code, sk, sk.text, str(sk.text) ? { [sl]: sk.text } : {});
        (sk.learningStandards || []).forEach(sp => push(`SP:${sp.code}`, 'sp', sp.code, sp, sp.text, str(sp.text) ? { [sl]: sp.text } : {}));
        (sk.performanceStandards || []).forEach(tp => push(`TP:${sk.code}:${tp.tp}`, 'tp', `${sk.code} TP${tp.tp}`, tp, valOf(tp.text), typeof tp.text === 'string' ? { [sl]: tp.text } : offOf(tp.text)));
      });
    });
    (((c.performanceStandards || {}).tables) || []).forEach((t, i) => (t.levels || []).forEach(l =>
      push(`PS:${i}:${l.tp}`, 'ps', `Jadual ${i + 1} TP${l.tp}`, l, valOf(l.text), typeof l.text === 'string' ? { [sl]: l.text } : offOf(l.text))));
    (c.themes || []).forEach(th => push(`TH:${(th.name && (th.name.ar || th.name.ms)) || ''}`, 'theme', 'Tema', th, valOf(th.name), offOf(th.name), true));
    return out;
  }
  /** Nilai semasa sesuatu item dalam bahasa `lang` (teks rasmi → i18n → name). */
  function valueOf(it, lang) {
    if (it.official[lang]) return it.official[lang];
    if (lang === it.srcLang) return it.src;
    if (it.nameField) return str(it.obj.name && it.obj.name[lang]);
    return str(it.obj.i18n && it.obj.i18n[lang]);
  }
  const itemStatusOf = (c, key) => ((c.i18nMeta && c.i18nMeta.status) || {})[key] || null;

  /** Status item: 'tiada' (bahasa hilang) · 'ai' (draf AI) · 'disemak' · 'lengkap'. */
  function statusOf(c, it) {
    if (LANGS.some(l => !valueOf(it, l))) return 'tiada';
    const s = itemStatusOf(c, it.key);
    if (s === 'reviewed' || (c.i18nMeta && c.i18nMeta.reviewed && s !== 'ai')) return 'disemak';
    if (s === 'ai') return 'ai';
    return 'lengkap';
  }

  /** Jadual terjemahan bagi paparan: [{key, kind, code, srcLang, status, values:{ms,en,ar,jawi}, official:{…}}]. */
  function table(curriculumId) {
    const { c } = locate(curriculumId);
    if (!c) return [];
    return items(c).map(it => ({ key: it.key, kind: it.kind, code: it.code, srcLang: it.srcLang, status: statusOf(c, it),
      values: Object.fromEntries(LANGS.map(l => [l, valueOf(it, l)])), official: Object.assign({}, it.official) }));
  }

  /** Item tanpa terjemahan. → { curriculumId, key, total, complete, byLang:{ms:n,…}, items:[{key, kind, code, missing:[…]}] } */
  function missingFor(curriculumId) {
    const { key, c } = locate(curriculumId);
    if (!c) return { curriculumId, key: null, total: 0, complete: 0, byLang: Object.fromEntries(LANGS.map(l => [l, 0])), items: [] };
    const its = items(c), byLang = Object.fromEntries(LANGS.map(l => [l, 0])), list = [];
    for (const it of its) {
      const miss = LANGS.filter(l => !valueOf(it, l));
      miss.forEach(l => byLang[l]++);
      if (miss.length) list.push({ key: it.key, kind: it.kind, code: it.code, missing: miss });
    }
    return { curriculumId: c.id || curriculumId, key, total: its.length, complete: its.length - list.length, byLang, items: list };
  }

  // ------------------------------------------------------------------ Semakan kualiti draf
  /** Amaran kualiti bagi satu teks terjemahan (tidak menyekat). */
  function lint(lang, text) {
    const s = String(text || ''); const w = [];
    if (!s.trim()) return w;
    if (lang === 'ar' && /[A-Za-z]/.test(s)) w.push('Teks Arab mengandungi huruf Latin.');
    if ((lang === 'ms' || lang === 'en') && ARABIC_RE.test(s.replace(/«[^»]*»/g, '').replace(/ﷺ/g, ''))) w.push('Tulisan Arab di luar petikan «…».');
    if (lang === 'ms') { const hit = Object.keys(BANNED_MS).filter(b => new RegExp(`(^|[^A-Za-z])${b}([^A-Za-z]|$)`, 'i').test(s)); if (hit.length) w.push(`Bentuk Bahasa Indonesia: ${hit.map(b => `${b} → ${BANNED_MS[b]}`).join(', ')}.`); }
    if (lang === 'jawi') {
      if (/[A-Za-z]{3,}/.test(s)) w.push('Teks Jawi mengandungi perkataan Latin.');
      if (/[ﭐ-ﷹﹰ-﻿]/.test(s)) w.push('Glif bentuk persembahan (bukan huruf Unicode biasa).');
      if (/تيك س(?=$|[\s.,،؛:)\]])/.test(s)) w.push('Ejaan "تيك س" — guna "تيكس".');
    }
    return w;
  }

  // ------------------------------------------------------------------ AI (Gemini percuma)
  const GLOSSARY = [
    'Glosari (gunakan secara konsisten):',
    'BA (Arab → ms / en / jawi): محاكاة → mengajuk / imitate / مڠاجوق; ترديد → mengulang / repeat / مڠولڠ; نطق → menyebut / pronounce / مڽبوت;',
    '  تحديد → menetapkan / identify / منتڤكن; تمييز → membezakan / distinguish / ممبيذاكن; تكوين → membentuk / form / ممبنتوق;',
    '  إنتاج → menghasilkan / produce / مڠهاسيلكن; حفظ → mengingat / memorise / مڠيڠت; تسميع → memperdengarkan / recite from memory / ممڤردڠركن;',
    '  تمثيل → melakonkan / act out / ملاكونكن; ارتجاليا → secara spontan / spontaneously / سچارا سڤونتن; ترتيب → menyusun / arrange / مڽوسون;',
    '  تصنيف → mengklasifikasikan / classify / مڠكلاسيفيكاسيكن; تهجئة → mengeja / spell / مڠيجا; قراءة → membaca / read / ممباچ;',
    '  كتابة → menulis / write / منوليس; نسخ → menyalin / copy / مڽالين; المقطع → suku kata / syllable / سوكو كات; التراكيب → ungkapan / expressions / اوڠكاڤن;',
    '  المحاور المقترحة → tema yang dicadangkan / suggested themes; الأرقام والأعداد → angka dan nombor / numerals and numbers; المسموع → yang didengar / heard.',
    'PI (Jawi → ms / en / ar): ممباچ → membaca / read (recite) / قراءة; مڠحفظ → menghafaz / memorise / حفظ; مڠعملكن → mengamalkan / practise / ممارسة;',
    '  مڠڤليكاسيكن → mengaplikasikan / apply / تطبيق; مڽاتاكن → menyatakan / state / ذكر; منجلسكن → menjelaskan / explain / شرح;',
    '  منرڠكن → menerangkan / describe / بيان; مڠهورايكن → menghuraikan / elaborate on / تفصيل; مڠاناليسيس → menganalisis / analyse / تحليل;',
    '  مروموس → merumus / summarise / استخلاص أو تلخيص; منيلاي → menilai / evaluate / تقويم; مڽنارايكن → menyenaraikan / list / تعداد;',
    '  برتجويد → bertajwid / with tajweed / مع مراعاة أحكام التجويد; سچارا استقامة → secara istiqamah / with istiqamah / باستقامة;',
    '  دالم كهيدوڤن هارين → dalam kehidupan harian / in daily life / في الحياة اليومية; صلاة → solat; عقيدة → akidah (en Aqidah);',
    '  نبي محمد ﷺ → Nabi Muhammad SAW (ms) / Prophet Muhammad ﷺ (en) / النبي محمد ﷺ.',
  ].join('\n');
  function instructionsFor(c, langs, srcLang) {
    return [
      'TUGASAN INI IALAH TERJEMAHAN (bukan penyalinan): peraturan "jangan terjemah" dalam arahan sistem TIDAK terpakai bagi medan bahasa yang diminta; peraturan lain (jangan reka, nyatakan ketidakpastian dalam "_semakan") kekal.',
      `Terjemah teks Standard Kandungan (SK), Standard Pembelajaran (SP), Tahap Penguasaan (TP), nama bidang dan nama tema daripada DSKP KPM Malaysia (${c.subjectName && (c.subjectName.ms || c.subjectName.ar) || c.subjectId || 'subjek'} Tahun ${c.year || '?'}; bahasa sumber: ${LANG_LABEL[srcLang]}) ke dalam: ${langs.map(l => `${l} (${LANG_LABEL[l]})`).join(', ')}.`,
      'Ketepatan diutamakan; laras pendidikan; terjemah dengan setia — jangan tambah, buang atau ringkaskan maksud. Kekalkan tanda baca akhir seperti sumber.',
      'Peraturan bahasa:',
      '- ms: Bahasa Melayu standard Malaysia (Dewan Bahasa dan Pustaka), bukan Bahasa Indonesia (guna murid, aktiviti, bahan, berjaya, boleh, faham, kumpulan, penilaian, kerana, amali, kosa kata — bukan siswa, kegiatan, materi, berhasil, bisa, mengerti, kelompok, evaluasi, karena, praktek, kosakata). Gaya DSKP Rumi: SK/SP sebagai frasa kerja ("Membaca …", "Menyebut …"); TP bermula "Murid …". Jika sumber dalam Jawi, ms ialah transliterasi Rumi yang setia (bukan parafrasa). Gunakan "SAW", bukan ﷺ.',
      '- en: gaya DSKP KSSR bahasa Inggeris: SK/SP sebagai frasa kerja ("Read …"); TP "Pupils …". Istilah Islam dalam transliterasi lazim (Aqidah, Ibadah, Sirah, Adab, Tajweed, Recitation (Tilawah), Memorisation (Hafazan), solat). Nabi: "Prophet Muhammad ﷺ".',
      '- ar: Bahasa Arab Fusha gaya DSKP Bahasa Arab (bentuk masdar, cth. "قراءة …", "القدرة على …"; TP "يستطيع التلميذ …"). Ejaan Arab standard (القرآن الكريم). Tiada huruf Latin langsung.',
      '- jawi: terjemahan Melayu ditulis dalam Jawi standard DBP dengan huruf Unicode ڤ ݢ ڠ چ ڽ ۏ — jangan guna huruf gantian lama (غ ف ض خ ث ؤ) bagi bunyi p/g/ng/c/ny/v. Kata pinjaman Arab kekal ejaan Arab (القرءان، حديث، صلاة، عقيدة). Tulis "تيكس" (teks).',
      'Bahan pelajaran TIDAK diterjemah: huruf, suku kata, kosa kata dan ungkapan Arab yang menjadi isi pelajaran Bahasa Arab, petikan ayat al-Quran, hadis dan doa — kekalkan dalam tulisan Arab asal; dalam ms/en letakkan dalam «…». Jangan sekali-kali menterjemah ayat al-Quran. Nama surah: ms/en "Surah An-Nas", ar/jawi "سورة الناس".',
      GLOSSARY,
      'Input: senarai item {key, kind, text}. Output: {"items":[{"key":"<sama seperti input>", <setiap bahasa diminta>: "<terjemahan>"}]} — satu objek bagi setiap item input, kunci TEPAT sama. Jika tidak pasti, beri terjemahan terbaik dan tulis nota dalam "_semakan" ("perlu semakan: <key> — <istilah> / <alternatif>").',
    ].join('\n');
  }
  function schemaFor(langs) {
    const props = { key: { type: 'string' } };
    langs.forEach(l => { props[l] = { type: 'string' }; });
    return { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: props, required: ['key', ...langs] } } }, required: ['items'] };
  }

  /**
   * Draf terjemahan AI (Gemini percuma). TIDAK menyimpan apa-apa.
   * @param {string} curriculumId kunci stor ("BA-3") atau id kurikulum
   * @param {{langs?:string[], keys?:string[], all?:boolean, onProgress?:Function, signal?:AbortSignal, batchSize?:number}} opts
   *   langs  — bahasa sasaran (lalai: semua kecuali bahasa sumber); all=true → terjemah semula walaupun sudah ada.
   * @returns {Promise<{map:Object<string,Object<string,string>>, notes:string[], warnings:string[], batches:number, model:string|null, count:number}>}
   */
  async function withAi(curriculumId, opts) {
    opts = opts || {};
    if (!RPH.ai || typeof RPH.ai.extract !== 'function') throw err('Modul AI tidak dimuatkan.', 'NO_AI');
    if (typeof RPH.ai.configured === 'function' && !RPH.ai.configured()) throw err('Kunci API AI belum ditetapkan — tetapkan di halaman Import Data.', 'NO_KEY');
    const { c } = locate(curriculumId);
    if (!c) throw err(`Kurikulum ${curriculumId} tiada.`, 'NO_CURRICULUM');
    const sl = sourceLangOf(c);
    const want = (opts.langs && opts.langs.length ? opts.langs : LANGS).filter(l => LANGS.includes(l));
    const keyset = opts.keys ? new Set(opts.keys) : null;
    const todo = items(c).filter(it => (!keyset || keyset.has(it.key)) && str(it.src))
      .map(it => ({ it, langs: want.filter(l => l !== it.srcLang && !it.official[l] && (opts.all || !valueOf(it, l))) }))
      .filter(x => x.langs.length);
    const map = {}, notes = [], warnings = [];
    let model = null, batches = 0;
    const size = Math.max(1, opts.batchSize || BATCH);
    // Kumpulkan ikut set bahasa (supaya skema setiap permintaan tepat).
    const groups = new Map();
    todo.forEach(x => { const g = x.langs.join(','); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(x); });
    const total = Math.ceil([...groups.values()].reduce((n, g) => n + Math.ceil(g.length / size), 0));
    for (const [g, list] of groups) {
      const langs = g.split(',');
      for (let i = 0; i < list.length; i += size) {
        const part = list.slice(i, i + size);
        const srcLang = part[0].it.srcLang;
        if (opts.onProgress) opts.onProgress({ phase: 'batch', done: batches, total, langs });
        const res = await RPH.ai.extract({
          task: 'Terjemahan kandungan DSKP (draf untuk disemak guru)',
          instructions: instructionsFor(c, langs, srcLang || sl),
          schema: schemaFor(langs),
          text: JSON.stringify({ items: part.map(x => ({ key: x.it.key, kind: x.it.kind, text: x.it.src })) }),
          signal: opts.signal,
          maxTokens: 8192,
          onProgress: opts.onProgress ? p => opts.onProgress(Object.assign({ batch: batches + 1, total }, p)) : undefined,
        });
        batches++;
        if (res && res._ai && res._ai.model) model = res._ai.model;
        const allowed = new Map(part.map(x => [x.it.key, x.langs]));
        for (const row of (res && Array.isArray(res.items) ? res.items : [])) {
          if (!row || !allowed.has(row.key)) continue;
          for (const l of allowed.get(row.key)) {
            const t = str(row[l]); if (!t) continue;
            (map[row.key] = map[row.key] || {})[l] = t.trim();
            lint(l, t).forEach(w => warnings.push(`${row.key} [${l}]: ${w}`));
          }
        }
        [].concat((res && res._semakan) || []).forEach(n => notes.push(String(n)));
        const got = part.filter(x => map[x.it.key]).length;
        if (got < part.length) notes.push(`perlu semakan: ${part.length - got} item dalam kelompok ${batches} tidak dijawab oleh AI.`);
      }
    }
    if (opts.onProgress) opts.onProgress({ phase: 'done', done: batches, total });
    return { map, notes, warnings, batches, model, count: Object.keys(map).length };
  }

  // ------------------------------------------------------------------ Simpan
  /**
   * Simpan terjemahan ke kurikulum dalam stor (satu-satunya fungsi yang menulis).
   * @param {string} curriculumId
   * @param {Object<string,Object<string,string>>} map { kunci: { bahasa: teks } } — teks kosong '' memadam terjemahan itu.
   * @param {{reviewed?:boolean, source?:'ai'|'manual'|'import', by?:string}} opts
   * @returns {{updated:number, skipped:string[]}}
   */
  function apply(curriculumId, map, opts) {
    opts = opts || {};
    const { key } = locate(curriculumId);
    if (!key) throw err(`Kurikulum ${curriculumId} tiada.`, 'NO_CURRICULUM');
    let updated = 0; const skipped = [];
    RPH.store.update('curriculum', all => {
      const c = all[key];
      const byKey = new Map(items(c).map(it => [it.key, it]));
      const meta = c.i18nMeta = Object.assign({ by: META_BY, langs: LANGS.slice(), reviewed: false, reviewedBy: null }, c.i18nMeta || {});
      meta.status = Object.assign({}, meta.status || {});
      for (const [k, langs] of Object.entries(map || {})) {
        const it = byKey.get(k);
        if (!it || !langs || typeof langs !== 'object') { skipped.push(k); continue; }
        let touched = false;
        for (const [l, v] of Object.entries(langs)) {
          if (!LANGS.includes(l) || l === it.srcLang || it.official[l]) continue; // teks asal/rasmi tidak ditimpa
          const t = typeof v === 'string' ? v.trim() : '';
          if (it.nameField) {
            it.obj.name = Object.assign({}, it.obj.name || {});
            if (t) it.obj.name[l] = t; else delete it.obj.name[l];
          } else {
            it.obj.i18n = Object.assign({}, it.obj.i18n || {});
            if (!it.obj.i18n[it.srcLang] && it.src) it.obj.i18n[it.srcLang] = it.src;
            Object.entries(it.official).forEach(([ol, ot]) => { if (!it.obj.i18n[ol]) it.obj.i18n[ol] = ot; });
            if (t) it.obj.i18n[l] = t; else delete it.obj.i18n[l];
          }
          touched = true;
        }
        if (!touched) continue;
        updated++;
        meta.status[k] = opts.reviewed ? 'reviewed' : opts.source === 'ai' ? 'ai' : (opts.source || 'manual');
      }
      meta.date = nowIso().slice(0, 10);
      meta.by = META_BY;
      const its = items(c);
      meta.reviewed = its.length > 0 && its.every(it => meta.status[it.key] === 'reviewed' || (c.i18nMeta.reviewed && meta.status[it.key] !== 'ai' && LANGS.every(l => valueOf(it, l))));
      if (opts.reviewed && opts.by) meta.reviewedBy = opts.by;
      c.updatedAt = nowIso();
    });
    return { updated, skipped };
  }

  /** Tandakan item (atau semua item lengkap) sebagai disemak. */
  function markReviewed(curriculumId, opts) {
    opts = opts || {};
    const { key, c } = locate(curriculumId);
    if (!key) throw err(`Kurikulum ${curriculumId} tiada.`, 'NO_CURRICULUM');
    const keys = new Set(opts.keys || items(c).filter(it => LANGS.every(l => valueOf(it, l))).map(it => it.key));
    let n = 0;
    RPH.store.update('curriculum', all => {
      const cc = all[key];
      const meta = cc.i18nMeta = Object.assign({ by: META_BY, langs: LANGS.slice(), reviewedBy: null }, cc.i18nMeta || {});
      meta.status = Object.assign({}, meta.status || {});
      const its = items(cc);
      its.forEach(it => { if (keys.has(it.key) && LANGS.every(l => valueOf(it, l))) { meta.status[it.key] = 'reviewed'; n++; } });
      meta.reviewed = its.length > 0 && its.every(it => meta.status[it.key] === 'reviewed');
      meta.reviewedBy = opts.by || meta.reviewedBy || null;
      meta.date = nowIso().slice(0, 10);
    });
    return { reviewed: n };
  }

  // ------------------------------------------------------------------ Eksport / import JSON
  /** Eksport terjemahan → { type:'rph-curriculum-i18n', curriculumId, sourceLang, items:{ kunci:{ms,en,ar,jawi} } }. */
  function exportJson(curriculumId) {
    const { c } = locate(curriculumId);
    if (!c) throw err(`Kurikulum ${curriculumId} tiada.`, 'NO_CURRICULUM');
    const out = { type: 'rph-curriculum-i18n', schemaVersion: '1.0.0', curriculumId: c.id || curriculumId, subjectId: c.subjectId, year: c.year, sourceLang: sourceLangOf(c), by: META_BY, exportedAt: nowIso(), i18nMeta: c.i18nMeta ? clone(c.i18nMeta) : null, items: {} };
    for (const it of items(c)) out.items[it.key] = Object.fromEntries(LANGS.map(l => [l, valueOf(it, l)]).filter(([, v]) => v));
    return out;
  }
  /** Baca fail eksport (atau peta {kunci:{bahasa:teks}}) → peta untuk apply(). Tidak menyimpan. */
  function importJson(curriculumId, obj) {
    if (!obj || typeof obj !== 'object') throw err('Format fail terjemahan tidak sah.', 'BAD_FORMAT');
    const src = obj.type === 'rph-curriculum-i18n' ? obj.items : obj.items && typeof obj.items === 'object' ? obj.items : obj;
    const { c } = locate(curriculumId);
    if (!c) throw err(`Kurikulum ${curriculumId} tiada.`, 'NO_CURRICULUM');
    if (obj.curriculumId && c.id && obj.curriculumId !== c.id && obj.curriculumId !== curriculumId) throw err(`Fail ini untuk ${obj.curriculumId}, bukan ${c.id}.`, 'WRONG_CURRICULUM');
    const byKey = new Map(items(c).map(it => [it.key, it]));
    const map = {}; let unknown = 0;
    for (const [k, langs] of Object.entries(src || {})) {
      const it = byKey.get(k);
      if (!it || !langs || typeof langs !== 'object') { unknown++; continue; }
      for (const l of LANGS) if (l !== it.srcLang && !it.official[l] && str(langs[l]) && langs[l] !== valueOf(it, l)) (map[k] = map[k] || {})[l] = langs[l];
    }
    return { map, count: Object.keys(map).length, unknown };
  }

  RPH.translate = { LANGS, LANG_LABEL, META_BY, sourceLangOf, items: id => items(locate(id).c), table, missingFor, statusOf: (id, key) => { const { c } = locate(id); const it = c && items(c).find(x => x.key === key); return it ? statusOf(c, it) : null; }, lint, withAi, apply, markReviewed, exportJson, importJson, _instructions: instructionsFor, _schema: schemaFor };
})(window.RPH = window.RPH || {});
