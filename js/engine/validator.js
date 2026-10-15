/* Pengesah RPH sebelum eksport (RPH.check) — master prompt §69 (medan wajib) & §70 (konsistensi pedagogi).
   beforeExport(rph) → { errors:[], warnings:[], ok }
   - errors  : data yang SALAH dari segi fakta/format (kod tiada dalam DSKP, SP bukan di bawah SK,
               jumlah minit ≠ minit slot, ejaan Jawi gantian, aksara rosak). UI boleh tetap membenarkan
               eksport selepas pengesahan guru, tetapi patut dipaparkan merah.
   - warnings: medan kosong (§69: guru boleh teruskan) dan ketidakselarasan pedagogi (§70, §35).
   Mesej dalam Bahasa Melayu. Tiada DOM. */
(function (RPH) {
  'use strict';
  const PRESENTATION = /[\uFB50-\uFDF9\uFDFB-\uFDFF\uFE70-\uFEFF]/;
  const WORD_RE = /[ء-ي٠-ۿݐ-ݿ]+/g;
  const TASHKIL = /[ً-ْٰ]/g;
  const isTxt = x => typeof x === 'string' && x.startsWith('txt:');
  const uniq = a => [...new Set(a)];

  /** Petanda boleh diukur: digit, "sekurang-kurangnya"/"على الأقل"/"at least", bilangan dalam perkataan, "semua"/"all". */
  const MEASURABLE = /[0-9٠-٩۰-۹]|على الأقل|جميع|سكورڠ|سكورڠ-كورڠڽ|sekurang-kurangnya|semua|سموا|\b(satu|dua|tiga|empat|lima|enam|tujuh|lapan|sembilan|sepuluh)\b|(^|\s)(واحد|اثنين|ثلاث|أربع|خمس|ست|سبع|ثماني|تسع|عشر|سات|دوا|تيݢ|امڤت|ليم|انم|توجوه|لاڤن|سمبيلن|سڤولوه)(\s|$)|\b(at least|all|out of|one|two|three|four|five|six|seven|eight|nine|ten)\b/i;
  /** Kata kerja Inggeris yang tidak boleh diperhati (objektif "understand…" tidak boleh diukur walaupun ada bilangan). */
  const EN_VAGUE = /^(?:to\s+)?(?:understand|know|learn|appreciate|be aware|realise|realize|enjoy|be familiar)\b/i;
  const measurable = s => { const t = String(s || '').trim(); return MEASURABLE.test(t) && !EN_VAGUE.test(t); };
  /** Kata kerja/isyarat lisan vs bertulis dalam objektif. */
  const ORAL = /قراءة|نطق|محاكاة|ترديد|تسميع|تحديد|تمييز|تهجئة|الاستماع|الإشارة|استخدام|تمثيل|ممباچ|مڽبوت|مڠحفظ|ممڤردڠركن|مڽاتاكن|منرڠكن|منجلسكن|مڠنل ڤستي|تلقي|مڽنارايكن|membaca|menyebut|menyatakan|menerangkan|menghafaz|mengenal pasti|ذكر|شرح|تعداد|mengulang|mengeja|meniru|menunjukkan|membezakan|mengelaskan|menyusun|menggunakan|melakonkan|memperdengarkan|مڠولڠ|مڠيجا|منيرو|منونجوقكن|ممبيذاكن|مڠلسكن|مڽوسون|مڠݢوناكن|ملاكونكن|\b(read|reads|say|pronounce|repeat|recite|memorise|memorize|state|name|identify|explain|answer|list|describe|tell|spell|point to|imitate|use)\b/i;
  const WRITTEN = /كتابة|نسخ|منوليس|ممبينا|مڽالين|مڽوريه|menulis|membina ayat|menyalin|menyurih|\b(write|writes|writing|copy|copies)\b/i;
  const ORAL_ASSESS = ['lisan', 'pemerhatian', 'tasmik', 'pembentangan', 'kuiz'];
  const WRITTEN_ASSESS = ['penulisan', 'lembaran-kerja', 'aktiviti-bertulis', 'hasil-kerja', 'projek'];
  /** Isyarat aktiviti yang menuntut aras KBAT (§35). */
  const KBAT_CUES = {
    // Bacaan al-Quran bertajwid / tasmik = mengaplikasi hukum bacaan (RPH PI asal guru: مڠاڤليكاسي).
    // Inggeris & Arab generik (RPH pelbagai bahasa, 2026-10-02) ditambah di hujung setiap pola; BM/Jawi generik (4 bahasa) juga.
    mengaplikasi: /membentuk|mengaplikasikan|memperdengarkan|ممبنتوق|مڠاڤليكاسيكن|مڠݢوناكن|ممڤردڠركن|تكوين|تركيب|يركب|تركب|يستخدم|استخدام|يمثل|حوار|مڠڤليكاسي|مڠعملكن|ممبينا|ملاكونكن|سيمولاسي|مڠاءيتكن|تجويد|تسميع|ممباچ (?:القرءان|اية|سورة|ڤوتوڠن اية|حروف برباريس|موك سورت)|ممبتولكن كسالهن باچاءن|mengaplikasi|membina|menggunakan|melakonkan|تطبيق|يطبق|التجويد|تلاوة|\b(apply|applying|applies|build|builds|form|tajweed|recite|recites|recitation|tasmik|act out|role[- ]play|dialogue)\b/i,
    menganalisis: /membezakan|membandingkan|mengasingkan|ممبيذاكن|مڠلسكن|ممبنديڠكن|تمييز|يميز|التمييز|تصنيف|يصنف|تصنفها|المختلفة|Odd One Out|مڠاناليسيس|مڠاسيڠكن|مميليه كد|ممبنديڠكن|menganalisis|membanding|mengelaskan|تحليل|يحلل|يقارن|مقارنة|مقارنتها|المختلف|\b(analys\w*|analyz\w*|compar\w*|classif\w*|sort|sorts|distinguish\w*|odd one out|categori[sz]\w*)\b/i,
    menilai: /mewajarkan|merumuskan|مواجركن|مروموسكن|منيلاي|مروموس|يقيم|يحكم|menilai|merumus|mewajarkan|علسن|تعليل|يعللون|يعلل|استنتاج|يستنتج|حكما على|\b(evaluat\w*|justify|justifies|conclude|conclusions?|judge)\b/i,
    mencipta: /buku skrap|poster|mereka bentuk|melakonkan|ملاكونكن|مڠهاصيلكن|ڤوستر|بوكو سكرڤ|مريك بنتوق|تمثيل|يمثل|إنتاج|ملصق|يصمم|سجل قصاصات|منچيڤتا|mencipta|menghasilkan|mereka|ينتج|تصميم|\b(creat\w*|produce|produces|design|designs|poster|scrapbook|act out)\b/i,
  };

  function template(rph) { return RPH.store.template(rph.templateId) || null; }
  function fieldsOfType(t, ...types) { return (t ? t.fields : []).filter(f => types.includes(f.type)); }
  function strings(o, path, out) {
    if (typeof o === 'string') out.push([path, o]);
    else if (Array.isArray(o)) o.forEach((v, i) => strings(v, `${path}[${i}]`, out));
    else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) strings(v, path ? `${path}.${k}` : k, out);
    return out;
  }
  function lexicon() { return RPH.store.get('jawiLexicon') || { words: {} }; }
  let keepCache = null, keepFor = null;
  /** Perkataan Arab dalam leksikon yang mesti kekal dengan غ/ف/ض/خ/ث/ؤ asal (cth. حفظ، مصحف). */
  function keepSet() {
    const lex = lexicon();
    if (keepFor !== lex) { keepCache = new Set(Object.entries(lex.words || {}).filter(([k, v]) => k === v && /[غفضخثؤ]/.test(k)).map(([k]) => k)); keepFor = lex; }
    return keepCache;
  }
  /** Isu ejaan Jawi dalam satu rentetan: { legacy:[…], overConverted:[…] }. */
  function jawiIssues(text) {
    const legacy = RPH.jawi.legacyWords(text);
    const keep = keepSet();
    const over = (String(text || '').match(WORD_RE) || []).map(w => w.replace(TASHKIL, ''))
      .filter(w => { const l = RPH.jawi.toLegacy(w); return l !== w && keep.has(l); });
    return { legacy: uniq(legacy), overConverted: uniq(over) };
  }
  /** Semua item aktiviti (fasa) bagi RPH + jumlah minit. */
  function activities(rph, t) {
    const v = rph.values || {}; const items = []; const phases = {};
    for (const f of fieldsOfType(t, 'activity-phases')) {
      const ph = v[f.key] || {};
      for (const p of ['induction', 'development', 'closure']) { phases[p] = (phases[p] || []).concat(ph[p] || []); items.push(...(ph[p] || [])); }
    }
    for (const f of fieldsOfType(t, 'activity-list')) { const arr = v[f.key] || []; phases[f.phase || f.key] = (phases[f.phase || f.key] || []).concat(arr); items.push(...arr); }
    return { items, phases, total: items.reduce((s, x) => s + (+x.minutes || 0), 0) };
  }
  const PHASE_MS = { induction: 'Set induksi / permulaan', development: 'Perkembangan', closure: 'Penutup' };

  const check = {
    jawiIssues,
    activities: rph => activities(rph, template(rph)),
    isMeasurable: measurable,

    beforeExport(rph) {
      const errors = [], warnings = [];
      if (!rph || typeof rph !== 'object') return { errors: ['RPH tidak sah.'], warnings, ok: false };
      const t = template(rph);
      const v = rph.values || {};
      if (!t) warnings.push(`Templat "${rph.templateId}" tiada — semakan medan tidak lengkap.`);

      // --- §69 Medan asas ---
      if (!rph.date) warnings.push('Tarikh kosong.');
      else if (!/^\d{4}-\d{2}-\d{2}$/.test(rph.date)) errors.push(`Format tarikh tidak sah: ${rph.date} (perlu YYYY-MM-DD).`);
      if (!rph.classId && !rph.className) warnings.push('Kelas kosong.');
      if (!rph.subjectId) warnings.push('Subjek kosong.');

      // --- SK / SP ---
      const subj = rph.subjectId; const year = rph.year;
      const hasCurr = !!RPH.curr.get(subj, year);
      const skF = fieldsOfType(t, 'sk-select')[0]; const spF = fieldsOfType(t, 'sp-select')[0];
      const skCodes = skF ? (v[skF.key] || []) : []; const spCodes = spF ? (v[spF.key] || []) : [];
      if (skF && !skCodes.length) warnings.push('Standard Kandungan (SK) kosong.');
      if (spF && !spCodes.length) warnings.push('Standard Pembelajaran (SP) kosong.');
      const skReal = skCodes.filter(x => !isTxt(x)); const spReal = spCodes.filter(x => !isTxt(x));
      if ((skReal.length || spReal.length) && !hasCurr) warnings.push(`Kurikulum ${subj} Tahun ${year} tiada — kod SK/SP tidak dapat disahkan.`);
      if (hasCurr) {
        for (const c of skReal) if (!RPH.curr.sk(subj, year, c)) errors.push(`SK ${c} tiada dalam DSKP ${subj} Tahun ${year}.`);
        for (const c of spReal) if (!RPH.curr.sp(subj, year, c)) errors.push(`SP ${c} tiada dalam DSKP ${subj} Tahun ${year}.`);
      }
      if (skReal.length) for (const c of RPH.curr.orphanSp(skReal, spReal)) errors.push(`SP ${c} bukan di bawah SK yang dipilih (${skReal.join(', ')}).`);
      for (const c of skReal) if (spReal.length && !spReal.some(s => s.startsWith(`${c}.`))) warnings.push(`SK ${c} tiada SP dipilih.`);
      // Templat teks bebas (Tasmik)
      for (const f of (t ? t.fields : []).filter(f => f.type === 'text' && (f.key === 'contentStandards' || f.key === 'learningStandards'))) {
        if (!String(v[f.key] || '').trim()) warnings.push(`${f.key === 'contentStandards' ? 'Standard Kandungan' : 'Standard Pembelajaran'} kosong.`);
      }

      // --- Objektif & kriteria ---
      const objs = (v.objectives || []).filter(s => String(s || '').trim());
      const crit = (v.successCriteria || []).filter(s => String(s || '').trim());
      if ('objectives' in v || (t && t.fields.some(f => f.key === 'objectives'))) {
        if (!objs.length) warnings.push('Objektif kosong (tiada objektif pembelajaran).');
        objs.forEach((o, i) => { if (!measurable(o)) warnings.push(`Objektif ${i + 1} tiada ukuran yang boleh diukur (cth. bilangan / "sekurang-kurangnya").`); });
      }
      if (t && t.fields.some(f => f.key === 'successCriteria')) {
        if (!crit.length) warnings.push('Kriteria kejayaan kosong.');
        crit.forEach((o, i) => { if (!measurable(o)) warnings.push(`Kriteria kejayaan ${i + 1} tiada ukuran yang boleh diukur.`); });
      }

      // --- Aktiviti & masa (§31) ---
      const act = activities(rph, t);
      if (!act.items.length) warnings.push('Aktiviti kosong.');
      else {
        for (const [p, arr] of Object.entries(act.phases)) if (!arr.length) warnings.push(`Fasa aktiviti "${PHASE_MS[p] || p}" kosong.`);
        const timed = act.items.filter(x => !x.group);
        if (timed.some(x => x.minutes == null || x.minutes === '')) warnings.push('Ada langkah aktiviti tanpa minit.');
        if (+rph.minutes > 0 && act.total !== +rph.minutes) errors.push(`Jumlah minit aktiviti (${act.total}) ≠ minit slot (${rph.minutes}).`);
      }
      const actText = act.items.map(x => x.text || '').join(' \n ');

      // --- PAK21 disebut dalam aktiviti (§70) ---
      if (v.pak21) {
        const it = RPH.banks.item('pak21', v.pak21);
        const name = it ? it.name : String(v.pak21).replace(/^txt:/, '');
        const norm = s => String(s || '').toLowerCase().replace(/[-–\s]+/g, ' ');
        const mentioned = act.items.some(x => x.pak21 === v.pak21) || norm(actText).includes(norm(name)) || (it && it.ms && norm(actText).includes(norm(it.ms)));
        if (!mentioned) warnings.push(`PAK21 «${name}» tidak disebut dalam mana-mana aktiviti.`);
      }

      // --- Pentaksiran (§37, §70) ---
      const assess = [].concat(v.assessment || [], v.assessmentMethod || [], v.assessmentInstrument || []).filter(Boolean);
      const hasAssessField = t && t.fields.some(f => ['assessment', 'assessmentMethod', 'assessmentInstrument'].includes(f.key));
      if (hasAssessField && !assess.length) warnings.push('Pentaksiran kosong.');
      if (assess.length && objs.length) {
        const objText = objs.join(' ');
        const ids = assess.map(x => String(x).replace(/^txt:/, '').toLowerCase());
        const free = assess.some(isTxt);
        if (WRITTEN.test(objText) && !ids.some(x => WRITTEN_ASSESS.includes(x)) && !free) warnings.push('Pentaksiran tidak selari: objektif melibatkan penulisan tetapi tiada pentaksiran bertulis (penulisan / lembaran kerja).');
        if (ORAL.test(objText) && !WRITTEN.test(objText) && !ids.some(x => ORAL_ASSESS.includes(x)) && !free) warnings.push('Pentaksiran tidak selari: objektif lisan/bacaan tetapi tiada pentaksiran lisan / pemerhatian.');
      }

      // --- SP → objektif → aktiviti (§70) ---
      if (spReal.length && objs.length && hasCurr) {
        const spText = spReal.map(c => (RPH.curr.sp(subj, year, c) || {}).text || '').join(' ');
        if (WRITTEN.test(spText) && !WRITTEN.test(objs.join(' '))) warnings.push('SP melibatkan penulisan tetapi tiada objektif penulisan.');
      }
      if (objs.length && act.items.length && WRITTEN.test(objs.join(' ')) && !/كتابة|يكتب|تكتب|نسخ|ينسخ|منوليس|ممبينا|مڽالين|مڽوريه|توليسن|menulis|menyalin|menyurih|tulisan|ورقة العمل|لمبرن كرجا|يكتبون|\bwrit|\bcop(?:y|ies)\b|worksheet/i.test(actText)) warnings.push('Objektif penulisan tiada aktiviti penulisan yang sepadan.');

      // --- KBAT (§35) ---
      if (v.kbat) {
        const k = RPH.banks.item('kbat', v.kbat);
        if (k && k.isKBAT && KBAT_CUES[k.id] && !KBAT_CUES[k.id].test(`${actText} ${objs.join(' ')}`)) warnings.push(`KBAT «${k.ms}» ditetapkan tetapi tiada aktiviti yang menuntut aras itu (§35).`);
      }

      // --- Kualiti teks: aksara & ejaan Jawi ---
      // Jawi: templat Jawi, atau templat Inggeris bagi subjek berskrip Jawi (petikan DSKP/RPT Jawi dalam ayat Inggeris).
      const subjObj = RPH.store.subject ? RPH.store.subject(rph.subjectId) : null;
      const jawiTpl = t && (t.labelLang === 'jawi' || (t.labelLang === 'en' && subjObj && subjObj.script === 'jawi'));
      // Bahan pelajaran Bahasa Arab (kosa kata/ungkapan/huruf) dipetik «…» dalam ayat Jawi — bukan ejaan Jawi.
      const arabicSubj = rph.subjectId === 'BA' || !!(subjObj && subjObj.script === 'arabic');
      for (const [path, s0] of strings(v, '', [])) {
        const s = jawiTpl && arabicSubj ? String(s0).replace(/«[^»]*»/g, ' ') : s0;
        if (/\uFFFD/.test(s)) errors.push(`Aksara rosak (U+FFFD) dalam ${path}.`);
        if (/\u0640/.test(s)) errors.push(`Tatweel (U+0640) dalam ${path}.`);
        if (PRESENTATION.test(s)) errors.push(`Glif bentuk persembahan Arab dalam ${path} (guna huruf Unicode biasa).`);
        if (jawiTpl) {
          const iss = jawiIssues(s);
          if (iss.legacy.length) errors.push(`Ejaan Jawi gantian (lama) dalam ${path}: ${iss.legacy.join('، ')} — guna ڤ ݢ ڠ چ ڽ ۏ.`);
          if (iss.overConverted.length) errors.push(`Perkataan Arab tersalah tukar dalam ${path}: ${iss.overConverted.join('، ')}.`);
        }
      }

      // --- Amaran penjana (cth. "Data tidak tersedia — perlu semakan guru") ---
      for (const w of rph.warnings || []) warnings.push(w);
      return { errors: uniq(errors), warnings: uniq(warnings), ok: errors.length === 0 };
    },
  };
  RPH.check = check;
})(window.RPH = window.RPH || {});
