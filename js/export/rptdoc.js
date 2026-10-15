/* Dokumen RPT (Rancangan Pengajaran Tahunan) — pratonton A4, cetak/PDF dan DOCX sebenar dalam 4 bahasa
   (Bahasa Melayu, English, العربية, Jawi). Kontrak: docs/RPT_GENERATOR_CONTRACT.md §1 (RptPlan) & §4.
   Dibina daripada SATU model susun atur (model()) yang dikongsi HTML dan DOCX, seperti RPH.render.model:
   perenggan, larian bidi dan pilihan fon dipadankan. Mesin segmen bidi, pilihan fon Arab/Jawi dan fon DOCX
   dipinjam daripada RPH.render / RPH.docx (tidak diubah). Nod dibina dengan RPH.ui.h() (bukan penetapan HTML mentah).
   Skrip klasik (file://) — didaftar sebagai RPH.rptdoc. Mesti dimuat selepas render.js, print.js, docx.js. */
(function (RPH) {
  'use strict';
  const R = () => RPH.render;
  const safe = (fn, d) => { try { const v = fn(); return v === undefined ? d : v; } catch (e) { return d; } };
  const arr = v => (v == null || v === '' ? [] : Array.isArray(v) ? v : [v]);
  const str = v => (v == null ? '' : String(v));

  // ======================================================================
  // 1. Bahasa & label tetap
  // ======================================================================
  const LANGS = [
    { id: 'ms', label: 'Bahasa Melayu' },
    { id: 'en', label: 'English' },
    { id: 'ar', label: 'العربية' },
    { id: 'jawi', label: 'Jawi' },
  ];
  const LANG_IDS = LANGS.map(l => l.id);
  const pickLang = l => (LANG_IDS.includes(l) ? l : 'ms');

  const ORD_AR = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس'];
  const DAYS_FALLBACK = {
    ms: ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'],
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    ar: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
    jawi: ['احد', 'اثنين', 'ثلاث', 'رابو', 'خميس', 'جمعة', 'سبتو'],
  };

  // Semua teks tetap yang dimiliki lapisan dokumen. Teks plan (SK/SP, topik, acara sekolah) TIDAK diterjemah.
  const LABELS = {
    ms: {
      lang: 'ms', dir: 'ltr', name: 'Bahasa Melayu',
      docTitle: 'RANCANGAN PENGAJARAN TAHUNAN (RPT)',
      yearWord: 'Tahun', sessionWord: 'Sesi',
      col: { week: 'Minggu', date: 'Tarikh', theme: 'Tema / Unit', themeBa: 'Tema / Unit', bidang: 'Bidang', topic: 'Tajuk', content: 'Kandungan', sk: 'Standard Kandungan', sp: 'Standard Pembelajaran', note: 'Catatan' },
      sign: { prepared: 'Disediakan oleh,', checked: 'Disemak oleh,', approved: 'Disahkan oleh,' },
      status: { pdp: 'Minggu PdP', ulangkaji: 'Ulang Kaji', peperiksaan: 'Pentaksiran', cuti: 'Cuti', program: 'Program Sekolah', orientasi: 'Minggu Orientasi' },
      orig: '(asal)', openingWeek: 'Minggu Pembukaan Sekolah', postExam: 'Program Pasca Pentaksiran',
      frame: { focus: 'Huruf tumpuan', hijaiyah: 'Huruf hijaiyah', syllFocus: 'Suku kata huruf tumpuan', harakat: 'Dengan baris yang berbeza', position: 'Dalam perkataan (awal/tengah/akhir)', sukun: 'Sukun dan syaddah dalam perkataan', vowels: 'Jenis baris', vocab: 'Kosa kata', expr: 'Ungkapan', numbers: 'Nombor', project: 'Penghasilan poster perkataan yang dipelajari', sounds: 'Bunyi huruf', syll: 'Suku kata' },
      lnote: { cont: 'Sambungan', contPace: 'Sambungan (kadar pengajaran ikut bilangan slot seminggu)', reinforce: 'Pengukuhan (cadangan): ulang kandungan pelajaran terdahulu — tiada kandungan baharu' },
      pos: { head: ['Guru Besar', 'Guru Besar'], panel: ['Ketua Panitia {s}', 'Ketua Panitia {s}'], teacher: ['Guru {s}', 'Guru {s}'] },
      dskp: 'DSKP KSSR (Semakan {rev}) {s} Tahun {n}',
      tnote: 'Terjemahan SK/SP bukan teks rasmi DSKP.',
      holiday: { term: 'Cuti Penggal {n}', midYear: 'Cuti Pertengahan Tahun', yearEnd: 'Cuti Akhir Persekolahan' },
      term: ['Penggal 1', 'Penggal 2', 'Penggal 3', 'Penggal 4'],
      draft: 'DRAF — belum disahkan', page: 'Halaman {n} / {total}', missing: 'Data tidak tersedia — perlu semakan guru',
      monthsFull: ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'],
      monthsShort: ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'],
    },
    en: {
      lang: 'en', dir: 'ltr', name: 'English',
      docTitle: 'YEARLY TEACHING PLAN (RPT)',
      yearWord: 'Year', sessionWord: 'Session',
      col: { week: 'Week', date: 'Date', theme: 'Theme / Unit', themeBa: 'Theme / Unit', bidang: 'Domain', topic: 'Topic', content: 'Content', sk: 'Content Standard', sp: 'Learning Standard', note: 'Remarks' },
      sign: { prepared: 'Prepared by,', checked: 'Checked by,', approved: 'Approved by,' },
      status: { pdp: 'Teaching week', ulangkaji: 'Revision', peperiksaan: 'Examination', cuti: 'Holiday', program: 'School Programme', orientasi: 'Orientation Week' },
      orig: '(original)', openingWeek: 'School Opening Week', postExam: 'Post-Examination Programme',
      frame: { focus: 'Focus letters', hijaiyah: 'Hijaiyah letters', syllFocus: 'Syllables of the focus letters', harakat: 'With different short vowels', position: 'In words (initial/medial/final)', sukun: 'Sukun and shaddah in words', vowels: 'Vowel types', vocab: 'Vocabulary', expr: 'Expressions', numbers: 'Numbers', project: 'Producing posters of the words learnt', sounds: 'Letter sounds', syll: 'Syllables' },
      lnote: { cont: 'Continuation', contPace: 'Continuation (teaching pace follows the weekly slots)', reinforce: 'Reinforcement (suggested): repeat earlier lesson content — no new content' },
      pos: { head: ['Head Teacher', 'Head Teacher'], panel: ['Head of {s} Panel', 'Head of {s} Panel'], teacher: ['{s} Teacher', '{s} Teacher'] },
      dskp: 'KSSR Curriculum and Assessment Standard Document (DSKP, {rev} Revision) — {s} Year {n}',
      tnote: 'Translated CS/LS are not official DSKP text.',
      holiday: { term: 'Term {n} Break', midYear: 'Mid-Year Break', yearEnd: 'End-of-Year School Holiday' },
      term: ['Term 1', 'Term 2', 'Term 3', 'Term 4'],
      draft: 'DRAFT — not yet confirmed', page: 'Page {n} of {total}', missing: 'Data not available — teacher review required',
      monthsFull: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    },
    ar: {
      lang: 'ar', dir: 'rtl', name: 'العربية',
      docTitle: 'خطة الدرس السنوي',
      yearWord: 'الصف', sessionWord: 'العام الدراسي',
      col: { week: 'الأسبوع', date: 'التاريخ', theme: 'المحور / الوحدة', themeBa: 'الموضوع', bidang: 'المجال', topic: 'الموضوع', content: 'المحتويات', sk: 'معيار المحتوى', sp: 'معيار التعلم', note: 'الملاحظة' },
      sign: { prepared: 'إعداد:', checked: 'مراجعة:', approved: 'اعتماد:' },
      status: { pdp: 'أسبوع التدريس', ulangkaji: 'المراجعة', peperiksaan: 'الامتحان', cuti: 'عطلة مدرسية', program: 'برنامج مدرسي', orientasi: 'أسبوع التهيئة' },
      orig: '(الأصل)', openingWeek: 'أسبوع افتتاح المدرسة', postExam: 'برنامج ما بعد الامتحان',
      frame: { focus: 'الحروف المركزة', hijaiyah: 'الحروف الهجائية', syllFocus: 'مقاطع الحروف المركزة', harakat: 'بالحركات المختلفة', position: 'في الكلمة (أول/وسط/آخر)', sukun: 'الساكنة والمشددة في الكلمات', vowels: 'الحركات', vocab: 'المفردات', expr: 'التراكيب', numbers: 'الأرقام والأعداد', project: 'إنتاج ملصقات الكلمات المدروسة', sounds: 'أصوات الحروف', syll: 'المقاطع' },
      lnote: { cont: 'متابعة', contPace: 'متابعة (وتيرة التدريس حسب عدد الحصص الأسبوعية)', reinforce: 'تعزيز (مقترح): تكرار محتوى الدرس السابق — بلا محتوى جديد' },
      pos: { head: ['مدير المدرسة', 'مديرة المدرسة'], panel: ['رئيس لجنة مادة {s}', 'رئيسة لجنة مادة {s}'], teacher: ['معلم {s}', 'معلمة {s}'] },
      dskp: 'وثيقة معيار المنهج والتقويم (مراجعة {rev}) — {s} {n}',
      tnote: 'ترجمة معايير المحتوى والتعلم ليست نصًا رسميًا لوثيقة المنهج.',
      holiday: { term: 'عطلة الفصل الدراسي {ord}', midYear: 'عطلة منتصف العام الدراسي', yearEnd: 'عطلة نهاية العام الدراسي' },
      term: ['الفصل الدراسي الأول', 'الفصل الدراسي الثاني', 'الفصل الدراسي الثالث', 'الفصل الدراسي الرابع'],
      draft: 'مسودة — غير معتمدة بعد', page: 'صفحة {n} من {total}', missing: 'البيانات غير متوفرة — تحتاج إلى مراجعة المعلم',
      monthsFull: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
      monthsShort: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
    },
    jawi: {
      lang: 'jawi', dir: 'rtl', name: 'Jawi',
      docTitle: 'رنچڠن ڤڠاجرن تاهونن',
      yearWord: 'تاهون', sessionWord: 'سيسي',
      col: { week: 'ميڠݢو', date: 'تاريخ', theme: 'تيما / اونيت', themeBa: 'تيما / اونيت', bidang: 'بيدڠ', topic: 'تاجوق', content: 'كاندوڠن', sk: 'ستندرد كاندوڠن', sp: 'ستندرد ڤمبلاجرن', note: 'چاتتن' },
      sign: { prepared: 'دسدياكن اوليه،', checked: 'دسمق اوليه،', approved: 'دسهكن اوليه،' },
      status: { pdp: 'ميڠݢو ڤڠاجرن', ulangkaji: 'اولڠكاجي', peperiksaan: 'ڤنتقسيرن', cuti: 'چوتي', program: 'ڤروݢرم سكوله', orientasi: 'ميڠݢو اورينتاسي' },
      orig: '(اصل)', openingWeek: 'ميڠݢو ڤمبوكاءن سكوله', postExam: 'ڤروݢرم ڤسچا ڤنتقسيرن',
      frame: { focus: 'حروف تومڤوان', hijaiyah: 'حروف هجائية', syllFocus: 'سوكو كات حروف تومڤوان', harakat: 'دڠن باريس يڠ بربيذا', position: 'دالم ڤركاتاءن (اول/تڠه/اخير)', sukun: 'سكون دان شده دالم ڤركاتاءن', vowels: 'جنيس باريس', vocab: 'كوسا كات', expr: 'اوڠكاڤن', numbers: 'نومبور', project: 'ڤڠهاسيلن ڤوستر ڤركاتاءن يڠ دڤلاجري', sounds: 'بوڽي حروف', syll: 'سوكو كات' },
      lnote: { cont: 'سمبوڠن', contPace: 'سمبوڠن (كادر ڤڠاجرن ايكوت بيلڠن سلوت سميڠݢو)', reinforce: 'ڤڠوكوهن (چادڠن): اولڠ كاندوڠن ڤلاجرن تردهولو — تياد كاندوڠن بهارو' },
      pos: { head: ['ݢورو بسر', 'ݢورو بسر'], panel: ['كتوا ڤانيتيا {s}', 'كتوا ڤانيتيا {s}'], teacher: ['ݢورو {s}', 'ݢورو {s}'] },
      dskp: 'دوكومن ستندرد كوريكولوم دان ڤنتقسيرن (سمقن {rev}) {s} تاهون {n}',
      tnote: 'ترجمهن ستندرد كاندوڠن دان ستندرد ڤمبلاجرن بوكن تيكس رسمي دوكومن ستندرد كوريكولوم دان ڤنتقسيرن.',
      holiday: { term: 'چوتي ڤڠݢل {n}', midYear: 'چوتي ڤرتڠهن تاهون', yearEnd: 'چوتي اخير ڤرسكولهن' },
      term: ['ڤڠݢل 1', 'ڤڠݢل 2', 'ڤڠݢل 3', 'ڤڠݢل 4'],
      draft: 'درف — بلوم دسهكن', page: 'هلامن {n} دري {total}', missing: 'ديتا تيدق ترسديا — ڤرلو سمقن ݢورو',
      monthsFull: ['جانواري', 'فيبواري', 'مارس', 'أفريل', 'مي', 'جون', 'جولاي', 'أوݢوس', 'سيڤتيمبر', 'أوكتوبر', 'نوۏمبر', 'ديسيمبر'],
      monthsShort: ['جانواري', 'فيبواري', 'مارس', 'أفريل', 'مي', 'جون', 'جولاي', 'أوݢوس', 'سيڤتيمبر', 'أوكتوبر', 'نوۏمبر', 'ديسيمبر'],
    },
  };
  /** Semua teks tetap bagi satu bahasa (+ nama hari daripada RPH.util jika ada). */
  function labels(lang) {
    lang = pickLang(lang);
    const L = LABELS[lang];
    const U = RPH.util;
    const fn = { ms: 'dayNameMs', en: 'dayNameEn', ar: 'dayNameAr', jawi: 'dayNameJawi' }[lang];
    const days = U && U[fn] ? [0, 1, 2, 3, 4, 5, 6].map(d => U[fn](d)) : DAYS_FALLBACK[lang].slice();
    return { ...L, days };
  }

  // ======================================================================
  // 2. Status minggu & nota
  // ======================================================================
  const STATUSES = ['pdp', 'ulangkaji', 'peperiksaan', 'cuti', 'program', 'orientasi'];
  const FILL = {
    title: 'FFD243', head: 'B9EDFF', term: 'FFE9A0',
    cuti: 'F8DDE6', peperiksaan: 'E6DCF5', ulangkaji: 'DDF1E4', program: 'FFF4CC', orientasi: 'DDEFFB',
    week: 'F3FAFF',
  };
  const same = s => str(s).replace(/\s+/g, ' ').trim().toUpperCase();
  const allCaps = s => str(s) === str(s).toUpperCase() && /[A-Z]/.test(s);
  /** Status minggu (cuti/peperiksaan/…) dalam bahasa dokumen. Status tidak dikenali dipulangkan seperti asal. */
  function statusText(status, lang) {
    const L = LABELS[pickLang(lang)];
    return (STATUSES.includes(status) ? L.status[status] : str(status));
  }
  const ORD_WORD = { PERTAMA: 1, KEDUA: 2, KETIGA: 3, KEEMPAT: 4 };
  /** Ekor nota ("UASA", "SESI 2023/2024"): akronim & nombor kekal; perkataan Melayu biasa digugurkan bagi bahasa lain. */
  function noteTail(r, lang) {
    let t = str(r).trim();
    if (!t) return '';
    if (lang !== 'ms') {
      t = t.replace(/\bSESI\b/gi, LABELS[lang].sessionWord);
      if (/[a-z]{3,}/.test(t.replace(/[A-Z]{2,}/g, '')) || (lang !== 'en' && /\b(?!UASA|PSAT|PAT|PPT|UPSA|PKSR|SPM|UPSR)[A-Z][a-z]+/.test(t))) return '';
    }
    return ` ${t}`;
  }
  /** Kata kunci tetap nota minggu → teks bahasa dokumen; null jika bukan kata kunci (cth. nama acara sekolah). */
  function noteKey(raw, lang) {
    lang = pickLang(lang);
    const L = LABELS[lang];
    raw = str(raw).trim();
    if (!raw) return null;
    if (STATUSES.includes(raw)) return L.status[raw];
    const caps = (lang === 'ms' || lang === 'en') && allCaps(raw);
    const fin = s => (caps ? s.toUpperCase() : s);
    const tail = r => noteTail(r, lang);
    const brk = n => fin(L.holiday.term.replace('{n}', String(n)).replace('{ord}', ORD_AR[n] || String(n)));
    let m;
    if ((m = /^CUTI\s+PENGGAL\s+(\d)\s*(.*)$/i.exec(raw))) return brk(+m[1]) + tail(m[2]);
    if ((m = /^CUTI\s+(?:PERSEKOLAHAN\s+)?PERTENGAHAN\s+PENGGAL\s+(PERTAMA|KEDUA|KETIGA|\d)\b\s*(.*)$/i.exec(raw))) return brk(ORD_WORD[m[1].toUpperCase()] || +m[1]) + tail(m[2]);
    if ((m = /^CUTI\s+PERTENGAHAN\s+TAHUN\b\s*(.*)$/i.exec(raw))) return fin(L.holiday.midYear) + tail(m[1]);
    if ((m = /^CUTI\s+AKHIR\s+(?:PERSEKOLAHAN|TAHUN)\b\s*(.*)$/i.exec(raw))) return fin(L.holiday.yearEnd) + tail(m[1]);
    if (/^CUTI$/i.test(raw)) return fin(L.status.cuti);
    if (/^PROGRAM$/i.test(raw)) return fin(L.status.program);
    if (/^MINGGU\s+PEMBUKAAN\s+SEKOLAH$/i.test(raw)) return fin(L.openingWeek);
    if ((m = /^ULANG\s?KAJI\b\s*(.*)$/i.exec(raw))) return fin(L.status.ulangkaji) + tail(m[1]);
    if ((m = /^PEPERIKSAAN\b\s*(.*)$/i.exec(raw))) return fin(L.status.peperiksaan) + tail(m[1]);
    if ((m = /^MINGGU\s+ORIENTASI\b\s*(.*)$/i.exec(raw))) return fin(L.status.orientasi) + tail(m[1]);
    return null;
  }
  /**
   * Nota minggu → bahasa dokumen. Hanya kata kunci tetap yang diterjemah (CUTI PENGGAL n, CUTI PERTENGAHAN TAHUN,
   * CUTI AKHIR…, ULANG KAJI, PEPERIKSAAN <nama>, MINGGU ORIENTASI, serta kunci status). Nama acara yang ditulis
   * sekolah (cth. "CUTI HARI RAYA AIDILFITRI", "UASA") kekal seperti tertulis (lihat juga terjemahan cuti umum dalam model()).
   */
  function noteText(note, lang) {
    const raw = str(note).trim();
    if (!raw) return '';
    const k = noteKey(raw, lang);
    return k == null ? raw : k;
  }

  // ======================================================================
  // 2b. Kandungan 4 bahasa (docs/I18N_CONTRACT.md) — melalui RPH.i18n jika dimuat; selamat jika tiada.
  //     Teks asal plan TIDAK diubah; terjemahan hanya untuk paparan/eksport.
  // ======================================================================
  const AR_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
  const LAT_RE = /[A-Za-z]/;
  const hasArS = s => AR_RE.test(str(s));
  const hasLatS = s => LAT_RE.test(str(s));
  const I18N = () => (RPH.i18n && typeof RPH.i18n === 'object' ? RPH.i18n : null);
  const icall = (fn, ...a) => safe(() => { const I = I18N(); return I && typeof I[fn] === 'function' ? I[fn](...a) : null; }, null);
  /** Hasil RPH.i18n (string | {text, translated}) → teks terjemahan atau null. */
  const got = r => {
    if (r == null) return null;
    if (typeof r === 'string') return r.trim() ? r : null;
    if (typeof r === 'object' && r.translated !== false && str(r.text).trim()) return str(r.text);
    return null;
  };
  const normAr = s => str(s).normalize('NFC').replace(/[ً-ْٰـ]/g, '').replace(/[ٴأإآ]/g, 'ا').replace(/ء/g, 'ا').replace(/\s+/g, ' ').trim();
  // Nama subjek (fallback tetap bagi subjek teras; nama sebenar diutamakan daripada header/stor/leksikon)
  const SUBJ = {
    BA: { ms: 'Bahasa Arab', en: 'Arabic Language', ar: 'اللغة العربية', jawi: 'بهاس عرب' },
    PI: { ms: 'Pendidikan Islam', en: 'Islamic Education', ar: 'التربية الإسلامية', jawi: 'ڤنديديقن اسلام' },
  };
  // Nota pelajaran tetap daripada enjin (js/engine/rptgen.js)
  const LNOTES = [
    [/^Sambungan\s*\(kadar pengajaran ikut bilangan slot seminggu\)$/i, 'contPace'],
    [/^Sambungan$/i, 'cont'],
    [/^Pengukuhan\s*\(cadangan\)/i, 'reinforce'],
  ];
  // Bingkai baris kandungan BA (teks DSKP/RPT guru): label diterjemah, bahan pelajaran Arab kekal dalam «…».
  const FRAMES = [
    [/^الحروف\s+المركزة\s*[:：]\s*/, 'focus'],
    [/^الحروف\s+المركزة\s*(?=\()/, 'focus'],
    [/^الحروف\s+الهجائية\s*[:：]?\s*/, 'hijaiyah'],
    [/^مقاطع\s+الحروف\s+المركزة\s*[:：]?\s*/, 'syllFocus'],
    [/^(?:بحركاتها|بالحركات)\s+المختلفة\s*[-–:：]?\s*/, 'harakat'],
    [/^في\s+الكلمة\s*[-–:：]\s*/, 'position'],
    [/^-?\s*الساكنة\s+والمشددة(?:\s+في\s+الكلمات)?\s*[:：]?\s*/, 'sukun'],
    [/^\((?=الحركات)/, 'vowels'],
    [/^(?:المقاطع\s+الكلمات|مقاطع\s+الكلمات\s+المحاور|الكلمات|المفردات)\s*[:：]\s*/, 'vocab'],
    [/^التراكيب\s*[:：]?\s*/, 'expr'],
    [/^الأرقام\s+والأعداد\s*/, 'numbers'],
    [/^إنتاج\s+ملصقات\s+الكلمات\s+المدروسة\s*[:：]?\s*/, 'project'],
    [/^صوت\s+/, 'sounds'],
    [/^مقاطع\s+/, 'syll'],
  ];
  // Baris status RPT BA guru (Arab) → status minggu
  const BA_STATUS_LINES = [
    [/^الإجازة\s+المدرسية$/, L => L.status.cuti],
    [/^مراجعة\s+الدرس/, L => L.status.ulangkaji],
    [/^الإ?متحان$|^الامتحان$/, L => L.status.peperiksaan],
    [/^البرامج\s+الخاصة/, L => L.postExam],
  ];
  const quote = s => `«${str(s).trim()}»`;
  const cleanRest = s => {
    let t = str(s).replace(/^[\s:：\-–—]+|[\s:：\-–—]+$/g, '').trim();
    if (/^\(.*\)$/.test(t) && !/\(.*\).*\(/.test(t)) t = t.slice(1, -1).trim();
    return t.replace(/\)+$/, m => ((t.match(/\(/g) || []).length < (t.match(/\)/g) || []).length ? '' : m)).trim();
  };

  /**
   * Penterjemah kandungan bagi satu pelan + bahasa. Mengembalikan fungsi sel; tiada perubahan pada plan.
   * Bahasa sumber: BA → ar; PI → jawi; generik → skrip DSKP / bahasa subjek.
   */
  function translator(plan, lang, opts) {
    const L = LABELS[lang];
    const family = plan.family || 'generic';
    const sid = plan.subjectId, yr = plan.year;
    const sj = safe(() => (RPH.store && RPH.store.subject ? RPH.store.subject(sid) : null), null) || {};
    const base = sid === 'PIQ' || sj.curriculumFrom === 'PI' ? 'PI' : (sj.curriculumFrom || sid);
    const cur = safe(() => (RPH.store && RPH.store.curriculum ? RPH.store.curriculum(sid, yr) : null), null);
    const curScript = safe(() => (RPH.curr && RPH.curr.script ? RPH.curr.script(sid, yr) : null), null) || (cur && cur.script) || sj.script;
    const srcLang = family === 'ba' ? 'ar' : family === 'pi' ? 'jawi'
      : curScript === 'jawi' ? 'jawi' : curScript === 'arabic' ? 'ar' : sj.language === 'english' ? 'en' : 'ms';
    const hasI18n = !!I18N();
    const textSrc = t => (hasArS(t) ? (family === 'ba' ? 'ar' : family === 'pi' || R().JAWI_ONLY.test(t) || srcLang === 'jawi' ? 'jawi' : 'ar') : (srcLang === 'en' ? 'en' : 'ms'));
    const sameLang = t => textSrc(t) === lang || (lang === 'ms' && !hasArS(t)) || (lang === 'en' && !hasArS(t) && srcLang === 'en');
    const stats = { stdShown: 0, stdTranslated: 0, stdOriginal: 0, untranslated: [] };
    const miss = (kind, text) => { if (stats.untranslated.length < 200) stats.untranslated.push({ kind, text: str(text) }); };

    /** Teks bebas (topik, bidang, nota, teks Khatam) → {text, ok}. ok=false → teks asal (bahasa lain). */
    function free(text, kind) {
      const t = str(text).trim();
      if (!t) return { text: '', ok: true };
      if (lang === 'ms' && !hasArS(t)) return { text: t, ok: true };
      if (sameLang(t)) return { text: t, ok: true };
      const r = got(icall('topic', t, lang, { subjectId: sid, year: yr, family, srcLang: textSrc(t) }));
      if (r) return { text: r, ok: true };
      miss(kind || 'teks', t);
      return { text: t, ok: false };
    }
    const withMark = (t, ok) => (ok ? t : `${t} ${L.orig}`);

    // ---- Subjek, jawatan, tajuk kurikulum ----
    function subjectName(id, fallbackObj) {
      const b = id === 'PIQ' ? 'PI' : id;
      const o = fallbackObj && typeof fallbackObj === 'object' ? fallbackObj : {};
      const sjx = safe(() => RPH.store.subject(id), null) || {};
      const nm = (sjx.name && typeof sjx.name === 'object') ? sjx.name : {};
      return str(o[lang] || nm[lang] || got(icall('term', `subject.${b}`, lang)) || got(icall('term', `subject:${b}`, lang)) || (SUBJ[b] && SUBJ[b][lang]) || '');
    }
    function subjectFromText(t) {
      const n = str(t).trim().toLowerCase();
      if (!n) return '';
      const subs = safe(() => (RPH.store.get('subjects') || {}).subjects || [], []) || [];
      const hit = subs.find(x => x && x.name && Object.values(x.name).some(v => str(v).trim().toLowerCase() === n))
        || Object.keys(SUBJ).map(k => ({ id: k, name: SUBJ[k] })).find(x => Object.values(x.name).some(v => v.toLowerCase() === n));
      if (hit) return subjectName(hit.id, null) || str(t);
      return got(icall('term', str(t), lang)) || '';
    }
    const female = name => /\b(binti|bt\.?|bte\.?)\b|^\s*(pn\.?|puan|cik|ustazah|datin|dr\.?\s*\(p\))\b/i.test(str(name));
    function position(pos, name) {
      const p = str(pos).trim();
      if (!p || lang === 'ms') return p;
      const direct = got(icall('term', p, lang)) || got(icall('term', p.toLowerCase(), lang));
      if (direct) return direct;
      const f = female(name) ? 1 : 0;
      let m;
      if ((m = /^Guru\s+Besar\b\s*(.*)$/i.exec(p))) return L.pos.head[f] + (m[1] && lang === 'en' ? ` ${m[1]}` : '');
      if ((m = /^Ketua\s+Panitia\s+(.+)$/i.exec(p))) { const s = subjectFromText(m[1]); if (s) return L.pos.panel[f].replace('{s}', s); }
      if ((m = /^Guru\s+(.+)$/i.exec(p))) { const s = subjectFromText(m[1]); if (s) return L.pos.teacher[f].replace('{s}', s); }
      return p;
    }
    function curriculumTitle(t) {
      const s0 = str(t).trim();
      if (!s0 || lang === 'ms') return s0;
      const m = /^DSKP\s+KSSR\s*(?:\(\s*Semakan\s+(\d{4})\s*\))?\s*(.*?)\s*(?:Tahun\s+(\d+))?\s*$/i.exec(s0);
      if (m) {
        const subj = subjectFromText(m[2]) || subjectName(sid, plan.header && plan.header.subjectName) || m[2];
        const n = m[3] ? (lang === 'ar' ? `للصف ${ORD_AR[+m[3]] || m[3]}` : m[3]) : '';
        return L.dskp.replace('{rev}', m[1] || '2017').replace('{s}', subj).replace('{n}', n).replace(/\s+—\s+$|\s{2,}/g, ' ').trim();
      }
      if (lang !== 'en' && hasLatS(s0) && !hasArS(s0)) return ''; // tajuk Melayu yang tidak dikenali tidak dicetak dalam dokumen Arab/Jawi
      return s0;
    }

    // ---- Standard (SK/SP) ----
    function std(kind, code) {
      if (opts && typeof opts.lookup === 'function') { const it = safe(() => opts.lookup(kind, code), null); return { text: it && it.text ? str(it.text) : '', ok: true }; }
      const r = icall('std', sid, yr, code, lang);
      let text = '', ok = true, orig = '';
      if (r && typeof r === 'object' && str(r.text || r.original).trim()) {
        text = str(r.text || r.original); orig = str(r.original || r.text);
        ok = lang === srcLang || r.translated === true;
        if (!ok) text = orig;
      } else {
        const it = safe(() => (RPH.curr && RPH.curr[kind] ? RPH.curr[kind](sid, yr, code) : null), null);
        text = it && it.text ? str(it.text) : ''; orig = text;
        ok = !text || lang === srcLang || (lang === 'ms' && !hasArS(text));
      }
      if (text) {
        stats.stdShown++;
        if (ok && lang !== srcLang && str(text).trim() !== str(orig).trim()) stats.stdTranslated++;
        if (!ok) { stats.stdOriginal++; miss(kind, code); }
      }
      return { text, ok };
    }
    function stdText(t) { const r = free(t, 'teks-standard'); if (r.ok && lang !== srcLang && r.text !== str(t).trim()) stats.stdTranslated++; return r; }

    // ---- Bidang / strand / tema / unit ----
    const domains = (cur && cur.domains) || [];
    const bidId = d => { const ms = str(d && d.name && (d.name.ms || '')).toLowerCase(); const map = [[/quran/, 'quran'], [/akidah/, 'akidah'], [/ibadah/, 'ibadah'], [/sirah/, 'sirah'], [/adab/, 'adab'], [/jawi/, 'jawi'], [/hadis/, 'hadis']]; for (const [re, id] of map) if (re.test(ms)) return id; return `d${d && d.code}`; };
    function bidang(l) {
      const raw = str(l.bidang).trim();
      if (!raw) return '';
      if (sameLang(raw) && lang !== 'ms' && lang !== 'en') return raw;
      const id = l.bidangId ? String(l.bidangId) : '';
      const dom = domains.find(d => (id && bidId(d) === id) || (d.name && Object.values(d.name).some(v => normAr(v) === normAr(raw))));
      const r = (id && got(icall('term', id, lang))) || (dom && got(icall('domain', sid, yr, dom.code, lang))) || got(icall('term', raw, lang))
        || (dom && dom.name && typeof dom.name === 'object' && dom.name[lang]) || null;
      if (r) return r;
      const f = free(raw, 'bidang');
      return withMark(f.text, f.ok);
    }
    function strand(l) {
      const raw = str(l.strand).trim();
      if (!raw) return '';
      if (sameLang(raw) && lang !== 'ms' && lang !== 'en') return raw;
      let obj = null;
      domains.some(d => (d.contentStandards || []).some(s => { const so = s.strand; if (so && typeof so === 'object' && Object.values(so).some(v => normAr(v) === normAr(raw))) { obj = so; return true; } return false; }));
      const r = got(icall('term', raw, lang)) || (obj && got(icall('term', str(obj.ms || '').toLowerCase(), lang))) || (obj && obj[lang]) || null;
      if (r) return r;
      const f = free(raw, 'strand');
      return withMark(f.text, f.ok);
    }
    function theme(th) {
      const raw = str(th).trim();
      if (!raw || lang === 'ar') return raw;
      const o = ((cur && cur.themes) || []).find(t => t && t.name && (typeof t.name === 'string' ? t.name === raw : Object.values(t.name).some(v => normAr(v) === normAr(raw))));
      const r = got(icall('theme', sid, yr, raw, lang)) || (o && typeof o.name === 'object' && o.name[lang]) || got(icall('phrase', raw, lang));
      if (r) return r;
      if (sameLang(raw)) return raw;
      miss('tema', raw);
      return family === 'ba' && hasArS(raw) ? quote(raw) : withMark(raw, false);
    }
    function unit(u) {
      const raw = str(u).trim();
      if (!raw || lang === 'ar') return raw;
      const r = got(icall('phrase', raw, lang)) || got(icall('topic', raw, lang, { subjectId: sid, year: yr, family, srcLang: textSrc(raw) }));
      if (r) return r;
      if (sameLang(raw)) return raw;
      return family === 'ba' && hasArS(raw) ? quote(raw) : withMark(raw, false); // nama unit buku teks Arab = bahan pelajaran
    }
    function topic(l) {
      const raw = str(l.topic).trim();
      if (!raw) return '';
      const ti = l.topicI18n && typeof l.topicI18n === 'object' ? l.topicI18n : null;
      if (ti && str(ti[lang]).trim()) return str(ti[lang]);
      const m = /^\(\s*(اولڠ\s?كاجي|ulang\s?kaji)\s*\)$/i.exec(raw);
      if (m) { if (lang === 'jawi') return raw; const r = got(icall('term', 'ulangkaji', lang)); return `(${str(r || L.status.ulangkaji).replace(/^\(|\)$/g, '')})`; }
      const f = free(raw, 'topik');
      return withMark(f.text, f.ok);
    }
    /** Baris kandungan BA → {text, school?} | null. Bahasa Arab: teks asal. */
    function baLine(line) {
      const t = str(line).trim();
      if (!t) return null;
      if (!hasArS(t)) return { text: t, school: true };
      if (lang === 'ar') return { text: t };
      const ph = got(icall('phrase', t, lang)) || got(icall('term', t, lang));
      if (ph) return { text: ph };
      for (const [re, fn] of BA_STATUS_LINES) if (re.test(t)) return { text: fn(L) };
      for (const [re, key] of FRAMES) {
        const m = re.exec(t);
        if (!m) continue;
        const lbl = got(icall('term', `ba-frame.${key}`, lang)) || L.frame[key];
        const rest = cleanRest(t.slice(m[0].length));
        if (!rest) return { text: /[:：]\s*$/.test(t) ? `${lbl}:` : lbl };
        if (!hasArS(rest)) return { text: `${lbl} (${rest.replace(/[()]/g, '')})` };
        return { text: `${lbl}: ${quote(rest)}` };
      }
      return { text: quote(t) };
    }
    function lessonNote(n) {
      const t = str(n).trim();
      if (!t) return null;
      for (const [re, k] of LNOTES) if (re.test(t)) return { text: L.lnote[k] };
      const k = noteKey(t, lang);
      if (k != null) return { text: k };
      if (!hasArS(t)) return school(t);
      const f = free(t, 'nota');
      return { text: withMark(f.text, f.ok) };
    }
    /** Teks takwim/sekolah (Rumi) → {text, kind:'key'|'holiday'|'event'}. Cuti umum diterjemah; acara sekolah kekal seperti tertulis. */
    function school(t) {
      const raw = str(t).trim();
      if (!raw) return null;
      const k = noteKey(raw, lang);
      if (k != null) return { text: k, kind: 'key' };
      if (hasArS(raw)) {
        if (lang === 'ar' && family === 'ba') return { text: raw, kind: 'key' };
        if (sameLang(raw)) return { text: raw, kind: 'key' };
        const ph = got(icall('phrase', raw, lang)) || got(icall('term', raw, lang));
        if (ph) return { text: ph, kind: 'key' };
        const hol = got(icall('holiday', raw, lang));
        if (hol) return { text: hol, kind: 'holiday' };
        if (family === 'ba') { const b = baLine(raw); return b ? { text: b.text, kind: 'key' } : null; }
        const f = free(raw, 'nota'); return { text: withMark(f.text, f.ok), kind: 'key' };
      }
      const hol = got(icall('holiday', raw, lang));
      if (hol) return { text: lang === 'ms' ? raw : hol, kind: 'holiday' };
      return { text: raw, kind: 'event' };
    }
    /** Nota minggu → segmen (dipecah ';' / '·' / ' — '). */
    function noteSegs(note) {
      const raw = str(note).trim();
      if (!raw) return [];
      const k = noteKey(raw, lang);
      if (k != null) return [{ text: k, kind: 'key' }];
      const out = [];
      let rest = raw;
      const lead = /^(CUTI|PROGRAM|PEPERIKSAAN|ULANG\s?KAJI)\s*—\s*(.*)$/i.exec(raw);
      if (lead) { out.push({ text: noteKey(lead[1], lang) || lead[1], kind: 'key' }); rest = lead[2]; }
      rest.split(/\s*(?:;|·)\s*/).map(x => x.trim()).filter(Boolean).forEach(x => { const s = school(x); if (s) out.push(s); });
      return out;
    }
    return { L, srcLang, stats, free, std, stdText, bidang, strand, theme, unit, topic, baLine, lessonNote, school, noteSegs, subjectName, position, curriculumTitle, hasI18n };
  }

  // ======================================================================
  // 3. Tarikh, tahun, sesi
  // ======================================================================
  const isoParts = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(iso)); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; };
  /** "17–21 Feb" / "30 Mac – 3 Apr" / "29 Dis 2026 – 2 Jan 2027" (nama bulan ikut bahasa dokumen). */
  function dateRange(start, end, lang) {
    const L = labels(lang);
    const a = isoParts(start), b = isoParts(end || start);
    if (!a && !b) return '';
    if (!a || !b) { const x = a || b; return `${x.d} ${L.monthsShort[x.m - 1]}`; }
    const mon = x => (lang === 'ar' || lang === 'jawi' ? L.monthsFull[x.m - 1] : L.monthsShort[x.m - 1]);
    if (a.y === b.y && a.m === b.m && a.d === b.d) return `${a.d} ${mon(a)}`;
    if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${mon(a)}`;
    if (a.y === b.y) return `${a.d} ${mon(a)} – ${b.d} ${mon(b)}`;
    return `${a.d} ${mon(a)} ${a.y} – ${b.d} ${mon(b)} ${b.y}`;
  }
  function yearText(plan, lang) {
    const L = LABELS[lang];
    const h = plan.header || {};
    const n = plan.year != null && plan.year !== '' ? +plan.year : NaN;
    const custom = h.yearLabel && !/^\s*(tahun|year|الصف|تاهون)?\s*\d+\s*$/i.test(h.yearLabel);
    if (custom) return str(h.yearLabel);
    if (isNaN(n)) return str(h.yearLabel);
    if (lang === 'ar') return `للصف ${ORD_AR[n] || n} (${n})`;
    return `${L.yearWord} ${n}`;
  }
  function subjectName(plan, lang, T) {
    const n = (plan.header && plan.header.subjectName) || {};
    if (typeof n === 'string') return n;
    if (n[lang]) return str(n[lang]);
    const t = T ? T.subjectName(plan.subjectId, n) : '';
    if (t) return t;
    const order = { jawi: ['jawi', 'ar', 'ms'], ar: ['ar', 'jawi', 'ms'], en: ['en', 'ms', 'ar'], ms: ['ms', 'en', 'ar', 'jawi'] }[lang];
    for (const k of order) if (n[k]) return str(n[k]);
    return str(plan.subjectId);
  }
  const sessionText = (plan, lang) => {
    const h = plan.header || {};
    const s = str(h.sessionLabel || plan.academicYearId);
    return s ? `${LABELS[lang].sessionWord} ${s}` : '';
  };

  // ======================================================================
  // 4. Model susun atur (dikongsi HTML & DOCX)
  // ======================================================================
  // Blok: {t:'p', runs:[{text,b,sm,muted,ltr,f}], align, dir, kind, rule}; f = petunjuk fon 'trad'|'naskh' (label dokumen).
  // Sel: {col, span, rowSpan, vm:null|'restart'|'cont', origin?, kind, blocks, fill, align, valign}.
  const run = (text, o = {}) => ({ text: str(text), b: !!o.b, sm: !!o.sm, muted: !!o.muted, ltr: !!o.ltr, f: o.f || null });
  const P = (text, o = {}) => ({ t: 'p', runs: [run(text, o)], align: o.align || null, dir: o.dir || null, kind: o.kind || null, rule: !!o.rule });
  const PR = (runs, o = {}) => ({ t: 'p', runs: runs.filter(Boolean), align: o.align || null, dir: o.dir || null, kind: o.kind || null, rule: !!o.rule });
  const blockText = b => (b.runs || []).map(r => r.text).join('');
  const nonEmpty = a => a.filter(s => str(s).trim() !== '');

  const PAGES = { portrait: { wMm: 210, hMm: 297 }, landscape: { wMm: 297, hMm: 210 } };
  const MARGIN_MM = 12, HEAD_STRIP_MM = 6, FOOT_STRIP_MM = 7, ROW_PAD_MM = 0.5; // ROW_PAD: sempadan jadual runtuh antara baris
  // Lebar relatif lajur (dinormalkan kepada 100% ikut lajur yang hadir)
  const WEIGHT = { week: 6, weekdate: 11, date: 9, theme: 14, bidang: 10, topic: 16, content: 28, sk: 22, sp: 28, note: 14 };
  const WEIGHT_BA_AR = { weekdate: 13, theme: 17, content: 52, note: 18, sk: 9, sp: 12 };

  function detect(plan, o, showEv) {
    const weeks = arr(plan.weeks);
    const ls = weeks.flatMap(w => arr(w.lessons));
    const hasStd = k => ls.some(l => arr(l[k]).length || nonEmpty(arr(l[k + 'Text'])).length);
    if (showEv === undefined) showEv = o.events !== false;
    return {
      theme: ls.some(l => str(l.theme || l.unit).trim()),
      bidang: ls.some(l => str(l.bidang).trim()),
      topic: ls.some(l => str(l.topic).trim()),
      content: ls.some(l => nonEmpty(arr(l.content)).length),
      sk: hasStd('sk'), sp: hasStd('sp'),
      note: ls.some(l => str(l.note).trim()) || weeks.some(w => (arr(w.lessons).length
        ? (showEv && nonEmpty(arr(w.events)).length) || str(w.note).trim() || (w.status && w.status !== 'pdp')
        : (w.status || 'pdp') === 'pdp' && ((showEv && nonEmpty(arr(w.events)).length) || str(w.note).trim()))),
      term: weeks.some(w => w.term != null && w.term !== ''),
    };
  }
  /** Paparan acara sekolah: opts.events (true/false) atau lalai ikut bahasa — BM: ya; English/Arab/Jawi: tidak. */
  const eventsDefault = lang => lang === 'ms';
  const showEventsOf = (opts, lang) => (opts.events === true || opts.events === false ? opts.events : eventsDefault(lang));
  const translationNoteOn = opts => {
    if (opts.translationNote === true || opts.translationNote === false) return opts.translationNote;
    const st = safe(() => (RPH.store && RPH.store.get('settings')) || {}, {}) || {};
    return st.showTranslationNote === true;
  };

  /** Susun atur & kandungan bagi satu pelan + bahasa. Lihat Lampiran dalam docs/RPT_GENERATOR_CONTRACT.md. */
  function model(plan, opts = {}) {
    if (!plan || typeof plan !== 'object') throw new Error('Pelan RPT tiada');
    const lang = pickLang(opts.lang || plan.lang);
    const L = labels(lang);
    const dir = L.dir;
    const family = plan.family || 'generic';
    const h = plan.header || {};
    const T = translator(plan, lang, opts);
    const std = opts.standards === 'codes' || opts.standards === 'full' ? opts.standards : (family === 'ba' && lang === 'ar' ? 'codes' : 'full'); // BA Arab (RPT guru): kod sahaja jika standard dipaparkan
    const showEv = showEventsOf(opts, lang);
    const scriptJawi = family === 'pi' || safe(() => RPH.curr && RPH.curr.script(plan.subjectId, plan.year), null) === 'jawi';
    // Fon kandungan skrip Arab: Jawi (PI) → Noto Naskh; Bahasa Arab (BA) → Traditional Arabic. Label dokumen Jawi → sentiasa Naskh.
    const arLang = lang === 'jawi' || scriptJawi ? 'ms-Arab' : 'ar';
    const labelFont = lang === 'jawi' ? 'naskh' : 'trad';
    const m = { plan, lang, dir, arLang, labelFont, labels: L, family, events: showEv };
    const LP = (text, o) => P(text, { f: labelFont, ...o });
    // Perenggan kandungan terjemahan: arah asas = arah dokumen (bahan Arab «…» diasingkan sebagai segmen bidi)
    // Petikan «…» dipecah kepada larian berasingan supaya tanda petik kekal di luar segmen bidi Arab (tidak terbalik dalam perenggan LTR).
    const CP = (text, o = {}) => {
      const t = str(text);
      const dirO = lang === 'ar' || lang === 'jawi' || !hasArS(t) ? null : dir;
      if (!/«[^»]*»/.test(t)) return P(t, { dir: dirO, ...o });
      // ALM (U+061C, tanda huruf Arab tidak kelihatan) di hujung yang bukan huruf Arab, cth. "حرف الخاء (خ)": kurungan kekal dalam segmen RTL.
      const alm = x => (hasArS(x) ? `${AR_RE.test(x[0]) ? '' : '\u061C'}${x}${AR_RE.test(x[x.length - 1]) ? '' : '\u061C'}` : x);
      const runs = t.split(/(«[^»]*»)/).filter(x => x !== '').flatMap(x => (/^«[^»]*»$/.test(x) ? [run('«', o), run(alm(x.slice(1, -1)), o), run('»', o)] : [run(x, o)]));
      return PR(runs, { dir: dirO, align: o.align || null, kind: o.kind || null });
    };

    // ---- Lajur ----
    const D = detect(plan, opts, showEv);
    const baAr = family === 'ba' && lang === 'ar';
    const dateInWeek = dir === 'rtl';
    let ids;
    if (baAr) {
      ids = ['weekdate', 'theme', 'content'];
      if (opts.showStandards) ids.push('sk', 'sp');
      ids.push('note');
    } else {
      ids = [dateInWeek ? 'weekdate' : 'week'];
      if (!dateInWeek) ids.push('date');
      if (D.theme) ids.push('theme');
      if (D.bidang) ids.push('bidang');
      if (D.topic) ids.push('topic');
      if (D.content) ids.push('content');
      if (D.sk) ids.push('sk');
      if (D.sp) ids.push('sp');
      if (D.note) ids.push('note');
    }
    if (Array.isArray(opts.columns) && opts.columns.length) ids = opts.columns.filter(c => WEIGHT[c]);
    const weights = baAr ? WEIGHT_BA_AR : WEIGHT;
    const tot = ids.reduce((s, id) => s + (weights[id] || WEIGHT[id]), 0);
    const cols = ids.map(id => ({
      id,
      label: id === 'weekdate' ? L.col.week : (id === 'theme' && baAr ? L.col.themeBa : L.col[id]),
      pct: Math.round(((weights[id] || WEIGHT[id]) / tot) * 1000) / 10,
    }));
    cols[cols.length - 1].pct = Math.round((cols[cols.length - 1].pct + (100 - cols.reduce((s, c) => s + c.pct, 0))) * 10) / 10;
    const idx = Object.fromEntries(cols.map((c, i) => [c.id, i]));
    const N = cols.length;
    m.cols = cols;
    m.layout = baAr ? 'ba-ar' : 'wide';
    const orient = opts.orientation === 'portrait' || opts.orientation === 'landscape' ? opts.orientation : (N <= 4 ? 'portrait' : 'landscape');
    m.orientation = orient;
    m.page = { ...PAGES[orient], margin: MARGIN_MM, contentW: PAGES[orient].wMm - 2 * MARGIN_MM, contentH: PAGES[orient].hMm - 2 * MARGIN_MM };
    m.draft = plan.status === 'draf' && opts.draftMark !== false ? L.draft : null;

    // ---- Tajuk dokumen (nama sekolah & alamat kekal seperti tertulis) ----
    const title = [];
    if (str(h.schoolName).trim()) title.push(P(h.schoolName, { b: true, align: 'center', kind: 'school' }));
    if (str(h.schoolAddress).trim()) title.push(P(h.schoolAddress, { sm: true, muted: true, align: 'center', kind: 'addr' }));
    title.push(LP(L.docTitle, { b: true, align: 'center', kind: 'doc' }));
    const subj = [subjectName(plan, lang, T), yearText(plan, lang)].filter(s => str(s).trim()).join(' ');
    const sub2 = [sessionText(plan, lang), T.curriculumTitle(h.curriculumTitle)].filter(s => str(s).trim()).join(' · ');
    title.push(LP(subj, { b: true, align: 'center', kind: 'subject' }));
    if (sub2) title.push(LP(sub2, { muted: true, align: 'center', kind: 'sub' }));
    m.title = title;

    // ---- Baris kepala ----
    m.head = { kind: 'head', cells: cols.map((c, i) => ({ col: i, span: 1, rowSpan: 1, vm: null, kind: 'head', blocks: [LP(c.label, { b: true, align: 'center' })], fill: FILL.head, align: 'center', valign: 'center' })) };

    // ---- Baris ----
    const rows = [];
    const mk = (ci, blocks, o = {}) => ({ col: ci, span: o.span || 1, rowSpan: 1, vm: null, kind: o.kind || 'text', blocks: blocks.length ? blocks : [P('')], fill: o.fill || null, align: o.align || null, valign: o.valign || null });
    const weekBlocks = (w, withDate) => {
      const out = [P(w.week != null && w.week !== '' ? w.week : '', { b: true, align: 'center' })];
      if (withDate) { const d = dateRange(w.start, w.end, lang); if (d) out.push(P(d, { sm: true, align: 'center' })); }
      return out;
    };
    const origMark = got(icall('originalMarker', lang)) || L.orig;
    const markRun = ok => (ok ? null : run(` ${origMark}`, { sm: true, muted: true, f: labelFont }));
    const stdBlocks = (kind, l) => {
      const out = [];
      const codes = arr(l[kind]);
      codes.forEach(code => {
        const it = std === 'full' ? T.std(kind, code) : null;
        const text = it && it.text ? str(it.text) : '';
        out.push(PR([run(code, { b: true, ltr: true }), text ? run(`  ${text}`) : null, text ? markRun(it.ok) : null]));
      });
      if (!codes.length) nonEmpty(arr(l[kind + 'Text'])).forEach(t => { const r = T.stdText(t); out.push(PR([run(r.text), markRun(r.ok)])); });
      return out;
    };
    const visible = s => s && (s.kind !== 'event' || showEv);
    const themeLines = l => {
      const th = T.theme(l.theme), un = T.unit(l.unit);
      if (baAr) return nonEmpty([str(l.unit).trim() || str(l.theme).trim()]);
      return nonEmpty([th, un && str(l.unit).trim() !== str(l.theme).trim() ? un : '']);
    };
    const contentLines = l => nonEmpty(arr(l.content)).map(t => {
      if (family === 'ba') { const b = T.baLine(t); return !b ? null : b.school ? T.school(b.text) : { text: b.text, kind: 'key' }; }
      const f = T.free(t, 'kandungan');
      return { text: f.ok ? f.text : `${f.text} ${L.orig}`, kind: 'key' };
    }).filter(visible).map(x => x.text);
    const lessonCell = (id, l, note, w) => {
      switch (id) {
        case 'theme': { const t = themeLines(l); return { key: t.join('\n'), blocks: t.map((x, i) => CP(x, { b: i === 0, align: baAr ? 'center' : null })), align: baAr ? 'center' : null, valign: baAr ? 'center' : null }; }
        case 'bidang': return { blocks: nonEmpty([T.bidang(l)]).map(t => CP(t, { b: true })).concat(nonEmpty([T.strand(l)]).map(t => CP(t, { sm: true, muted: true }))) };
        case 'topic': {
          const raw = str(l.topic).trim();
          if (raw && w && same(raw) === same(w.note) && w.status && w.status !== 'pdp') {
            const segs = T.noteSegs(raw).filter(visible);
            const txt = segs.length ? segs.map(x => x.text).join('; ') : L.status[w.status] || '';
            return { blocks: nonEmpty([txt]).map(t => CP(t)), topicShown: txt };
          }
          return { blocks: nonEmpty([T.topic(l)]).map(t => CP(t)) };
        }
        case 'content': {
          const lines = contentLines(l);
          const t0 = str(l.topic).trim();
          const dup = [str(l.unit).trim(), str(l.theme).trim(), str(arr(l.content)[0]).trim()].includes(t0);
          const out = [];
          if (baAr && t0 && !dup) out.push(P(t0));
          lines.forEach(t => out.push(CP(t)));
          return { blocks: out };
        }
        case 'sk': return { blocks: stdBlocks('sk', l) };
        case 'sp': return { blocks: stdBlocks('sp', l) };
        case 'note': return { blocks: note };
        default: return { blocks: [] };
      }
    };
    const evSegs = w => nonEmpty(arr(w.events)).map(e => T.school(e)).filter(visible);
    let prevTerm = null;
    arr(plan.weeks).forEach(w => {
      const term = w.term != null && w.term !== '' ? +w.term : null;
      if (term != null && term !== prevTerm && D.term) {
        const t = L.term[term - 1] || `${L.term[0].replace(/\d+$/, '')}${term}`;
        rows.push({ kind: 'term', keepNext: true, cells: [mk(0, [LP(lang === 'ms' || lang === 'en' ? t.toUpperCase() : t, { b: true, align: 'center' })], { span: N, kind: 'term', fill: FILL.term, align: 'center', valign: 'center' })] });
        prevTerm = term;
      }
      const lessons = arr(w.lessons);
      const st = STATUSES.includes(w.status) ? w.status : 'pdp';
      const segs = T.noteSegs(w.note).filter(visible);
      const keySeg = segs.find(x => x.kind === 'key');
      const restSegs = segs.filter(x => x !== keySeg);
      const dateTxt = dateRange(w.start, w.end, lang);
      const seen = new Set();
      const uniqBlocks = (list, o = {}) => list.filter(x => { const k = same(x.text); if (!k || seen.has(k)) return false; seen.add(k); return true; }).map(x => CP(x.text, o));
      if (!lessons.length && st !== 'pdp') {
        // Minggu bukan PdP tanpa pelajaran: sel minggu/tarikh kekal, selebihnya digabung & berlorek.
        const lead = ids.filter(id => id === 'week' || id === 'date' || id === 'weekdate');
        const k = lead.length;
        const cells = lead.map(id => mk(idx[id], id === 'date' ? [P(dateTxt, { align: 'center' })] : weekBlocks(w, id === 'weekdate'), { kind: 'week', fill: FILL[st], align: 'center', valign: 'center' }));
        const main = keySeg ? keySeg.text : L.status[st];
        seen.add(same(main)); seen.add(same(L.status[st]));
        const evs = uniqBlocks([...restSegs, ...evSegs(w)], { align: 'center' });
        cells.push(mk(k, [LP(main, { b: true, align: 'center' }), ...evs], { span: N - k, kind: 'status', fill: FILL[st], align: 'center', valign: 'center' }));
        rows.push({ kind: 'status', status: st, week: w.week, cells });
        return;
      }
      const n = Math.max(1, lessons.length);
      const group = [];
      for (let i = 0; i < n; i++) {
        const l = lessons[i] || {};
        const fill = st !== 'pdp' ? FILL[st] : null;
        const built = {};
        ids.forEach(id => { if (id !== 'note' && id !== 'week' && id !== 'weekdate' && id !== 'date') built[id] = lessonCell(id, l, null, w); });
        // nota: nota/status minggu (diterjemah) + cuti umum (diterjemah) + acara sekolah (seperti tertulis; pilihan) + nota pelajaran
        const nb = [];
        if (st !== 'pdp' && built.content) built.content.blocks.forEach(b => seen.add(same(blockText(b)))); // acara yang sudah dicetak dalam Kandungan tidak diulang
        if (i === 0) {
          const main = keySeg ? keySeg.text : (st !== 'pdp' ? L.status[st] : '');
          const shownTopic = built.topic && built.topic.topicShown;
          if (main && same(main) !== same(shownTopic)) nb.push(LP(main, { b: true }));
          seen.add(same(main)); if (shownTopic) shownTopic.split('; ').forEach(x => seen.add(same(x)));
          nb.push(...uniqBlocks([...restSegs, ...evSegs(w)]));
        }
        const ln = T.lessonNote(l.note);
        if (ln && visible(ln)) nb.push(CP(ln.text));
        const cells = ids.map(id => {
          const ci = idx[id];
          if (id === 'week' || id === 'weekdate') return mk(ci, i === 0 ? weekBlocks(w, id === 'weekdate') : [P('')], { kind: 'week', fill: fill || FILL.week, align: 'center', valign: 'center' });
          if (id === 'date') return mk(ci, i === 0 ? [P(dateTxt, { align: 'center' })] : [P('')], { kind: 'week', fill: fill || FILL.week, align: 'center', valign: 'center' });
          const c = id === 'note' ? lessonCell('note', l, nb, w) : built[id];
          const cell = mk(ci, c.blocks, { fill, align: c.align, valign: c.valign });
          if (c.key) cell.key = c.key;
          return cell;
        });
        group.push({ kind: 'data', status: st, week: w.week, cells });
      }
      // sel minggu/tarikh digabung menegak merentas sub-baris (Khatam + Al-Quran + Jawi … dalam satu minggu)
      if (group.length > 1) {
        ids.forEach((id, ci) => {
          if (id !== 'week' && id !== 'weekdate' && id !== 'date') return;
          const top = group[0].cells[ci];
          top.vm = 'restart'; top.rowSpan = group.length;
          for (let i = 1; i < group.length; i++) group[i].cells[ci] = { ...group[i].cells[ci], vm: 'cont', origin: top, blocks: [P('')] };
        });
      }
      rows.push(...group);
    });
    // Gabungan menegak lajur tema/unit merentas minggu berturut-turut (seperti RPT guru); dipecahkan oleh baris status/penggal.
    const ti = idx.theme;
    if (ti != null) {
      let cur = null, curKey = null;
      rows.forEach(r => {
        if (r.kind !== 'data') { cur = null; curKey = null; return; }
        const c = r.cells[ti];
        if (c.key && cur && c.key === curKey) {
          if (!cur.vm) { cur.vm = 'restart'; cur.rowSpan = 1; }
          cur.rowSpan++;
          r.cells[ti] = { ...c, vm: 'cont', origin: cur, blocks: [P('')] };
        } else { cur = c.key ? c : null; curKey = c.key || null; }
      });
    }
    m.rows = rows;

    // ---- Nota kaki terjemahan (SK/SP terjemahan bukan teks rasmi DSKP) ----
    m.i18n = { srcLang: T.srcLang, stdShown: T.stats.stdShown, stdTranslated: T.stats.stdTranslated, stdOriginal: T.stats.stdOriginal, untranslated: T.stats.untranslated.slice() };
    m.footnote = null;
    if (T.stats.stdTranslated > 0 && translationNoteOn(opts)) {
      const nt = got(icall('note', lang)) || L.tnote;
      m.footnote = [LP(`* ${nt}`, { sm: true, muted: true, kind: 'tnote' })];
    }

    // ---- Blok tandatangan (nama kekal; jawatan diterjemah) ----
    const who = o => (o && typeof o === 'object' ? o : {});
    m.signature = {
      dir,
      items: [['prepared', h.preparedBy], ['checked', h.checkedBy], ['approved', h.approvedBy]].map(([k, p]) => ({
        key: k, label: L.sign[k], name: str(who(p).name).trim(), position: T.position(str(who(p).position).trim(), who(p).name),
      })),
    };
    m.signature.blocks = m.signature.items.map(it => [
      LP(it.label, { b: true, align: 'center' }),
      P('', { kind: 'space' }), P('', { kind: 'space' }),
      P(it.name ? `(${it.name})` : '', { rule: true, align: 'center' }),
      it.position ? LP(it.position, { align: 'center' }) : null,
    ].filter(Boolean));
    m.needNaskh = lang === 'jawi' || arLang !== 'ar' || R().JAWI_ONLY.test(JSON.stringify([m.title, m.rows.map(r => r.cells.map(c => c.blocks)), m.signature.blocks, m.footnote]));
    m.issues = arr(plan.issues);
    return m;
  }

  // ======================================================================
  // 5. HTML (pratonton & cetak) — halaman A4 dengan pagination sendiri
  // ======================================================================
  const H = (...a) => RPH.ui.h(...a);
  const MM_PX = 96 / 25.4;
  const hasAr = s => R().hasArabic(s);

  /** Fon bagi satu perenggan: null (tiada skrip Arab), 'trad' (Traditional Arabic) atau 'naskh' (Noto Naskh; Jawi). */
  function fontOfBlock(b, m) {
    const text = blockText(b);
    if (!hasAr(text)) return null;
    if (R().JAWI_ONLY.test(text) || m.arLang !== 'ar') return 'naskh';
    return (b.runs || []).some(r => r.f === 'naskh') ? 'naskh' : 'trad';
  }
  function runNodes(r, base, m, font) {
    const Rn = R();
    const nodes = Rn.runSegments(r, base).map(sg => {
      if (!sg.iso) return sg.text;
      return base === 'rtl'
        ? H('bdi', { dir: 'ltr', class: 'lat' }, sg.text)
        : H('bdi', { dir: 'rtl', lang: m.arLang, class: ['ar', font === 'trad' && 'f-trad'] }, sg.text);
    });
    let el = nodes;
    if (r.b) el = [H('strong', null, el)];
    if (r.sm || r.muted) el = [H('span', { class: [r.sm && 'rptd-sm', r.muted && 'rptd-muted'] }, el)];
    return el;
  }
  function paraEl(b, m, cellAlign) {
    const base = R().baseDir(b, m);
    const font = fontOfBlock(b, m);
    const align = b.align || cellAlign || (base === 'ltr' && m.dir === 'rtl' ? 'right' : null);
    return H('div', {
      class: ['rptd-p', base === 'rtl' ? 'p-rtl' : 'p-ltr', base === 'rtl' && font === 'trad' && 'f-trad', align && `al-${align}`, b.kind && `k-${b.kind}`, b.rule && 'rptd-rule'],
      dir: base, lang: base === 'rtl' ? m.arLang : (m.lang === 'en' ? 'en' : 'ms'),
    }, b.runs.map(r => runNodes(r, base, m, font)));
  }
  const cellEl = (c, m, o = {}) => {
    const head = c.kind === 'head';
    return H(head ? 'th' : 'td', {
      colspan: c.span > 1 ? c.span : null, rowspan: c.rowSpan > 1 ? c.rowSpan : null,
      scope: head ? 'col' : null,
      class: ['rptd-c', `c-${c.kind}`, c.align && `al-${c.align}`, c.valign && `va-${c.valign}`, c.repeat && 'rptd-cont'],
      style: c.fill ? { backgroundColor: `#${c.fill}` } : null,
    }, c.blocks.map(b => paraEl(b, m, c.align)));
  };
  const rowEl = (r, m) => H('tr', { class: ['rptd-row', `r-${r.kind}`, r.status && r.status !== 'pdp' && `s-${r.status}`, r.repeat && 'rptd-repeat'], 'data-week': r.week != null ? r.week : null },
    r.cells.filter(c => c.vm !== 'cont').map(c => cellEl(c, m)));
  function tableEl(m, rows, o = {}) {
    const headRow = { ...m.head };
    return H('table', { class: ['rptd-table', `rptd-${m.layout}`], dir: m.dir, lang: m.dir === 'rtl' ? m.arLang : (m.lang === 'en' ? 'en' : 'ms') },
      H('colgroup', null, m.cols.map(c => H('col', { style: { width: `${c.pct}%` } }))),
      H('thead', null, rowEl({ ...headRow, repeat: !!o.repeatHead }, m)),
      H('tbody', null, rows.map(r => rowEl(r, m))));
  }
  function titleEl(m) {
    return H('div', { class: 'rptd-title', dir: m.dir }, m.title.map(b => paraEl(b, m)));
  }
  function signEl(m) {
    return H('div', { class: 'rptd-sign', dir: m.dir }, m.signature.blocks.map(bl => H('div', { class: 'rptd-sign-item' }, bl.map(b => paraEl(b, m)))));
  }
  /** Nota kaki terjemahan (sebelum blok tandatangan; hanya jika SK/SP terjemahan dipaparkan). */
  function tnoteEl(m) {
    return m.footnote && m.footnote.length ? H('div', { class: 'rptd-tnote', dir: m.dir }, m.footnote.map(b => paraEl(b, m))) : null;
  }

  // ---- Tinggi baris: ukuran sebenar (pelayar) atau anggaran (tiada susun atur, cth. ujian Node) ----
  function estimate(m) {
    const cw = m.page.contentW;
    const colW = i => (cw * m.cols[i].pct) / 100;
    const cellH = c => {
      const w = Math.max(6, m.cols.slice(c.col, c.col + c.span).reduce((s, x, k) => s + colW(c.col + k), 0) - 3);
      let lines = 0;
      c.blocks.forEach(b => {
        const rtl = R().baseDir(b, m) === 'rtl';
        const t = blockText(b);
        lines += Math.max(1, Math.ceil((t.length * (rtl ? 2.0 : 1.7)) / w)) * (rtl ? 1.3 : 1);
      });
      return lines * 4.3 + 2.4;
    };
    const rowH = r => Math.max(...r.cells.filter(c => c.vm !== 'cont').map(c => cellH(c) / (c.vm === 'restart' ? c.rowSpan : 1)));
    return {
      measured: false,
      titleH: 9 + m.title.length * 6.5, headH: 8, sigH: 36 + (m.footnote && m.footnote.length ? 6 : 0),
      rowH: m.rows.map(rowH),
    };
  }
  function measureDom(m) {
    if (typeof document === 'undefined' || !document.body) return null;
    let probe = null;
    try {
      probe = H('div', { class: ['rptd-doc', 'rptd-probe', `orient-${m.orientation}`, m.dir === 'rtl' ? 'is-rtl' : 'is-ltr'], style: { width: `${m.page.contentW}mm` } },
        titleEl(m), tableEl(m, m.rows), tnoteEl(m), signEl(m));
      document.body.appendChild(probe);
      const t = probe.querySelector && probe.querySelector('.rptd-title');
      if (!t || typeof t.getBoundingClientRect !== 'function') return null;
      const hh = el => el.getBoundingClientRect().height / MM_PX;
      const trs = probe.querySelectorAll('tbody > tr');
      const out = {
        measured: true,
        titleH: hh(t), headH: hh(probe.querySelector('thead tr')), sigH: hh(probe.querySelector('.rptd-sign')) + (probe.querySelector('.rptd-tnote') ? hh(probe.querySelector('.rptd-tnote')) + 1.5 : 0),
        rowH: Array.from(trs).map(hh),
      };
      if (!(out.titleH > 0) || out.rowH.length !== m.rows.length) return null;
      return out;
    } catch (e) { return null; } finally { if (probe && probe.parentNode) probe.parentNode.removeChild(probe); }
  }

  /** Bahagikan baris ke halaman: [{from, to, first, last}] (to eksklusif). Pagination: kepala diulang; baris tidak dipecahkan. */
  function paginate(m, heights) {
    const hs = heights || measureDom(m) || estimate(m);
    const avail = m.page.contentH - (m.draft ? HEAD_STRIP_MM : 0) - FOOT_STRIP_MM - 3;
    const rows = m.rows, n = rows.length;
    const pages = [];
    let i = 0, first = true, lastUsed = 0;
    do {
      let used = (first ? hs.titleH : 0) + hs.headH, j = i;
      while (j < n && (j === i || used + hs.rowH[j] + ROW_PAD_MM <= avail)) { used += hs.rowH[j] + ROW_PAD_MM; j++; }
      while (j > i + 1 && j < n && rows[j - 1].keepNext) { j--; used -= hs.rowH[j] + ROW_PAD_MM; }
      pages.push({ from: i, to: j, first, sigOnly: false });
      lastUsed = used; i = j; first = false;
    } while (i < n);
    const lastPg = pages[pages.length - 1];
    lastPg.last = true;
    if (lastUsed + hs.sigH + 3 > avail) { pages.push({ from: n, to: n, first: false, sigOnly: true, last: true }); lastPg.last = false; }
    else lastPg.sig = true;
    if (pages[pages.length - 1].sigOnly) pages[pages.length - 1].sig = true;
    return { pages, heights: hs };
  }
  /** Baris halaman [from,to): sel gabungan menegak yang bermula di halaman sebelumnya dimulakan semula (rptd-cont). */
  function pageRows(m, from, to) {
    const out = [];
    for (let i = from; i < to; i++) {
      const r = m.rows[i];
      const cells = r.cells.map(c => {
        if (c.vm === 'restart') return { ...c, rowSpan: Math.min(c.rowSpan, to - i) };
        if (c.vm === 'cont' && i === from) {
          let k = i + 1;
          while (k < to && m.rows[k].cells[c.col] && m.rows[k].cells[c.col].vm === 'cont' && m.rows[k].cells[c.col].origin === c.origin) k++;
          return { ...c.origin, col: c.col, vm: 'restart', rowSpan: k - i, repeat: true };
        }
        return c;
      });
      out.push({ ...r, cells, repeat: false });
    }
    return out;
  }
  function pageEl(m, pg, no, total) {
    const L = m.labels;
    return H('section', { class: ['rptd-page', `orient-${m.orientation}`, m.dir === 'rtl' ? 'is-rtl' : 'is-ltr'], dir: m.dir, 'data-page': no },
      m.draft ? H('div', { class: 'rptd-draft', dir: m.dir, lang: m.lang === 'jawi' ? 'ms-Arab' : m.lang === 'ar' ? 'ar' : m.lang }, m.draft) : null,
      H('div', { class: 'rptd-body' },
        pg.first ? titleEl(m) : null,
        pg.sigOnly ? null : tableEl(m, pageRows(m, pg.from, pg.to), { repeatHead: !pg.first }),
        pg.sig ? tnoteEl(m) : null,
        pg.sig ? signEl(m) : null),
      H('div', { class: 'rptd-foot', dir: m.dir, lang: m.lang === 'jawi' ? 'ms-Arab' : m.lang === 'ar' ? 'ar' : m.lang }, L.page.replace('{n}', String(no)).replace('{total}', String(total))));
  }
  function pagesOf(m) {
    const { pages } = paginate(m);
    return pages.map((pg, i) => pageEl(m, pg, i + 1, pages.length));
  }
  /** CSS @page bagi satu pekerjaan cetak (saiz ikut orientasi; kotak margin kosong → tiada pengepala/pengaki pelayar). */
  function pageStyle(m) {
    return `@page { size: A4 ${m.orientation}; margin: ${MARGIN_MM}mm;`
      + ' @top-left { content: ""; } @top-center { content: ""; } @top-right { content: ""; }'
      + ' @bottom-left { content: ""; } @bottom-center { content: ""; } @bottom-right { content: ""; } }';
  }
  function renderModel(m, opts = {}) {
    const mode = opts.mode === 'print' ? 'print' : 'preview';
    const doc = H('div', { class: ['rptd-doc', `mode-${mode}`, `orient-${m.orientation}`, m.dir === 'rtl' ? 'is-rtl' : 'is-ltr'], 'data-lang': m.lang, 'data-layout': m.layout, 'data-orientation': m.orientation }, pagesOf(m));
    // Fon web (Noto Naskh) dimuat lambat → ukuran pertama boleh tersasar; paginate semula sekali selepas fon sedia.
    try {
      const fs = typeof document !== 'undefined' ? document.fonts : null;
      if (fs && fs.ready && fs.status && fs.status !== 'loaded') {
        fs.ready.then(() => { RPH.ui.clear(doc); pagesOf(m).forEach(p => doc.appendChild(p)); }).catch(() => {});
      }
    } catch (e) { /* abaikan */ }
    return doc;
  }
  /** → HTMLElement (div.rptd-doc; satu .rptd-page bagi setiap halaman A4). */
  function render(plan, opts = {}) {
    let m;
    try { m = model(plan, opts); } catch (e) {
      RPH.reportError && RPH.reportError('pratonton RPT', e);
      return H('div', { class: ['rptd-doc', 'rptd-error'] }, H('p', null, `RPT tidak dapat dipaparkan: ${e.message}`));
    }
    const doc = renderModel(m, opts);
    doc.rptdModel = m;
    return doc;
  }

  // ======================================================================
  // 6. Cetak / PDF
  // ======================================================================
  let printCleanup = null;
  function cleanupPrint() { if (printCleanup) { const f = printCleanup; printCleanup = null; f(); } }
  /**
   * Cetak melalui dialog cetak pelayar (Simpan sebagai PDF): mengisi #print-root (sama seperti RPH.print), memasang
   * @page A4 potret/lanskap (kotak margin kosong → tiada pengepala/pengaki pelayar), document.title = nama fail.
   * → Promise<nama fail tanpa .pdf>
   */
  async function print(plan, opts = {}) {
    const m = model(plan, opts);
    safe(() => RPH.print && RPH.print.cleanup && RPH.print.cleanup());
    cleanupPrint();
    let root = document.getElementById('print-root');
    if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
    RPH.ui.clear(root);
    const style = document.createElement('style');
    style.id = 'rptd-page-style';
    style.appendChild(document.createTextNode(pageStyle(m)));
    document.head.appendChild(style);
    // Paparan pertama (di #print-root) menggerakkan pemuatan fon Arab/Jawi; tunggu fon sedia, kemudian bina semula dengan ukuran tepat.
    root.appendChild(renderModel(m, { mode: 'print' }));
    root.removeAttribute('aria-hidden');
    document.body.classList.add('rph-printing', 'rptd-printing');
    const prevTitle = document.title;
    const name = (opts.title || filename(plan, 'pdf', opts.lang)).replace(/\.pdf$/i, '');
    document.title = name;
    let timer = null;
    const onAfter = () => cleanupPrint();
    printCleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', onAfter);
      document.title = prevTitle;
      document.body.classList.remove('rph-printing', 'rptd-printing');
      RPH.ui.clear(root); root.setAttribute('aria-hidden', 'true');
      if (style.parentNode) style.parentNode.removeChild(style);
    };
    window.addEventListener('afterprint', onAfter);
    try { if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]); } catch (e) { /* abaikan */ }
    RPH.ui.clear(root); root.appendChild(renderModel(m, { mode: 'print' }));
    window.print();
    if (!('onafterprint' in window)) timer = setTimeout(cleanupPrint, 1500);
    return name;
  }

  // ======================================================================
  // 7. DOCX (docx.js v9 melalui RPH.docx: fon, bungkusan, benaman Noto Naskh)
  // ======================================================================
  const LRM = '‎', RLM = '‏';
  const SCALE = { sm: 0.83, school: 1.25, doc: 1.6, subject: 1.3, sub: 0.95, addr: 0.85, tnote: 0.95 };
  const LAT_HP = 18, CS_HP = { trad: 24, naskh: 21 }; // setengah-poin: Latin 9pt; skrip Arab 12pt (Traditional) / 10.5pt (Naskh)
  const MM_TW = 1440 / 25.4;
  const D_ = () => {
    const D = (typeof window !== 'undefined' && window.docx) || (typeof docx !== 'undefined' ? docx : null); // eslint-disable-line no-undef
    if (!D || !D.Document) throw new Error('Pustaka docx tidak dimuatkan (assets/vendor/docx.iife.js).');
    return D;
  };
  const fontObjs = () => {
    const A = RPH.docx || {};
    const lat = 'Calibri';
    return {
      naskh: { ascii: lat, hAnsi: lat, eastAsia: lat, cs: A.FONT_AR || 'Noto Naskh Arabic' },
      trad: { ascii: lat, hAnsi: lat, eastAsia: lat, cs: A.FONT_TRAD || 'Traditional Arabic' },
    };
  };
  function naskhBytes() {
    const f = typeof window !== 'undefined' && window.RPH_FONT_TTF;
    if (!f || !f.regular) return null;
    if (typeof atob === 'function') { const bin = atob(f.regular); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
    return Uint8Array.from(Buffer.from(f.regular, 'base64')); // eslint-disable-line no-undef
  }
  function paraDocx(D, b, m, cellAlign, extra = {}) {
    const Rn = R();
    const FO = fontObjs();
    const base = Rn.baseDir(b, m);
    const font = fontOfBlock(b, m);
    const fo = font === 'trad' ? FO.trad : font === 'naskh' ? FO.naskh : (m.arLang === 'ar' && m.lang !== 'jawi' ? FO.trad : FO.naskh);
    const kscale = SCALE[b.kind] || 1;
    const runs = [];
    for (const r of b.runs) {
      const sc = r.sm ? SCALE.sm * kscale : kscale;
      const lat = Math.round(LAT_HP * sc), cs = Math.round(CS_HP[font || 'naskh'] * sc);
      const common = { bold: r.b || undefined, color: r.muted ? '444444' : (extra.color || undefined), size: lat, sizeComplexScript: cs };
      for (const sg of Rn.runSegments(r, base)) {
        if (!sg.text) continue;
        const rtl = base === 'rtl' ? !sg.iso : sg.iso;
        let t = sg.text;
        if (sg.iso && /[^\p{L}\p{M}]/u.test(t)) { const mk = base === 'rtl' ? LRM : RLM; t = mk + t + mk; }
        runs.push(new D.TextRun({
          ...common, text: t, font: fo, rightToLeft: rtl || undefined,
          language: m.lang === 'en' ? { value: 'en-GB', bidirectional: 'ar-SA' } : rtl && font === 'trad' ? { value: 'ms-MY', bidirectional: 'ar-SA' } : undefined,
          noProof: rtl && font !== 'trad' ? true : undefined, // Jawi: elak semakan ejaan Arab
        }));
      }
    }
    const align = b.align || cellAlign;
    let alignment;
    if (align === 'center') alignment = D.AlignmentType.CENTER;
    else if (base === 'ltr' && m.dir === 'rtl') alignment = D.AlignmentType.RIGHT;
    const opts = {
      children: runs.length ? runs : [new D.TextRun({ text: '', size: LAT_HP, sizeComplexScript: CS_HP.naskh })],
      bidirectional: base === 'rtl' || undefined,
      alignment,
      spacing: { before: b.kind === 'space' ? 260 : b.kind === 'doc' ? 60 : b.rule ? 50 : 0, after: b.kind === 'doc' ? 60 : b.kind ? 40 : 20 },
    };
    if (b.kind === 'doc') opts.shading = { type: D.ShadingType.CLEAR, color: 'auto', fill: FILL.title };
    if (b.rule) { opts.border = { top: { style: D.BorderStyle.DOTTED, size: 6, color: '000000', space: 2 } }; opts.indent = { left: 120, right: 120 }; }
    if (extra.keepNext) opts.keepNext = true;
    return new D.Paragraph(opts);
  }
  const twOf = m => Math.round(m.page.contentW * MM_TW);
  function colTw(m) {
    const total = twOf(m);
    const tw = m.cols.map(c => Math.round((c.pct * total) / 100));
    tw[tw.length - 1] += total - tw.reduce((a, x) => a + x, 0);
    return tw;
  }
  function cellDocx(D, c, m, tw) {
    const w = tw.slice(c.col, c.col + c.span).reduce((a, x) => a + x, 0);
    return new D.TableCell({
      children: c.vm === 'cont' ? [new D.Paragraph({ children: [] })] : c.blocks.map(b => paraDocx(D, b, m, c.align)),
      columnSpan: c.span > 1 ? c.span : undefined,
      verticalMerge: c.vm === 'restart' ? D.VerticalMergeType.RESTART : c.vm === 'cont' ? D.VerticalMergeType.CONTINUE : undefined,
      width: { size: w, type: D.WidthType.DXA },
      shading: c.fill ? { type: D.ShadingType.CLEAR, color: 'auto', fill: c.fill } : undefined,
      verticalAlign: c.valign === 'center' ? D.VerticalAlignTable.CENTER : D.VerticalAlignTable.TOP,
      margins: { top: 28, bottom: 28, left: 80, right: 80 },
    });
  }
  function tableDocx(D, m) {
    const tw = colTw(m);
    const line = { style: D.BorderStyle.SINGLE, size: 4, color: '444444' };
    const row = (r, head) => new D.TableRow({ cantSplit: true, tableHeader: head || undefined, children: r.cells.map(c => cellDocx(D, c, m, tw)) });
    return new D.Table({
      rows: [row(m.head, true), ...m.rows.map(r => row(r, false))],
      width: { size: twOf(m), type: D.WidthType.DXA }, columnWidths: tw, layout: D.TableLayoutType.FIXED,
      visuallyRightToLeft: m.dir === 'rtl' || undefined,
      borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
    });
  }
  function signDocx(D, m) {
    const total = twOf(m), w = Math.floor(total / 3);
    const none = { style: D.BorderStyle.NONE, size: 0, color: 'auto' };
    return new D.Table({
      rows: [new D.TableRow({
        cantSplit: true,
        children: m.signature.blocks.map(bl => new D.TableCell({
          width: { size: w, type: D.WidthType.DXA }, margins: { top: 0, bottom: 0, left: 80, right: 80 },
          borders: { top: none, bottom: none, left: none, right: none },
          children: bl.map(b => paraDocx(D, b, m, null, { keepNext: true })),
        })),
      })],
      width: { size: w * 3, type: D.WidthType.DXA }, columnWidths: [w, w, w], layout: D.TableLayoutType.FIXED,
      visuallyRightToLeft: m.dir === 'rtl' || undefined,
      borders: D.TableBorders.NONE,
    });
  }
  /** Dokumen docx.js (tiada DOM; boleh diuji dalam Node). */
  function build(plan, opts = {}) {
    const D = D_();
    const m = model(plan, opts);
    const FO = fontObjs();
    const L = m.labels;
    const sp = { before: 0, after: 0 };
    const spacer = new D.Paragraph({ children: [], spacing: { before: 0, after: 0, line: 160, lineRule: D.LineRuleType ? D.LineRuleType.EXACT : 'exact' } });
    const children = [
      ...m.title.map(b => paraDocx(D, b, m, null, { keepNext: true })),
      spacer,
      tableDocx(D, m),
      new D.Paragraph({ children: [], spacing: { before: 0, after: 120 } }),
      ...(m.footnote || []).map(b => paraDocx(D, b, m, null, { keepNext: true })),
      signDocx(D, m),
      new D.Paragraph({ children: [], spacing: sp }),
    ];
    // Pengepala: tanda DRAF pada setiap halaman. Pengaki: nombor halaman.
    const lbl = { font: m.lang === 'jawi' ? FO.naskh : FO.trad, size: 16, sizeComplexScript: 18 };
    const headers = m.draft ? {
      default: new D.Header({ children: [new D.Paragraph({
        alignment: D.AlignmentType.CENTER, bidirectional: m.dir === 'rtl' || undefined, spacing: { after: 40 },
        children: [new D.TextRun({ ...lbl, text: m.draft, bold: true, color: 'B00020', rightToLeft: m.dir === 'rtl' || undefined, size: 20, sizeComplexScript: 24 })],
      })] }),
    } : undefined;
    const [pre, mid, post] = L.page.split(/\{n\}|\{total\}/);
    const rtl = m.dir === 'rtl' || undefined;
    const footers = {
      default: new D.Footer({ children: [new D.Paragraph({
        alignment: D.AlignmentType.CENTER, bidirectional: rtl, spacing: { before: 40 },
        children: [
          new D.TextRun({ ...lbl, text: pre, rightToLeft: rtl }),
          new D.TextRun({ ...lbl, children: [D.PageNumber.CURRENT] }),
          new D.TextRun({ ...lbl, text: mid, rightToLeft: rtl }),
          new D.TextRun({ ...lbl, children: [D.PageNumber.TOTAL_PAGES] }),
          ...(post ? [new D.TextRun({ ...lbl, text: post, rightToLeft: rtl })] : []),
        ],
      })] }),
    };
    const h = m.plan.header || {};
    const bytes = m.needNaskh ? naskhBytes() : null;
    const teacher = safe(() => (RPH.store && RPH.store.get('teacher')) || {}, {});
    const PG = { w: 11906, h: 16838, margin: Math.round(MARGIN_MM * MM_TW) };
    return new D.Document({
      creator: (h.preparedBy && h.preparedBy.name) || teacher.fullName || teacher.name || 'Smart RPH Generator',
      lastModifiedBy: 'Smart RPH Generator',
      title: opts.title || filename(plan, 'docx', m.lang).replace(/\.docx$/, ''),
      description: 'Rancangan Pengajaran Tahunan — dijana oleh Smart RPH Generator',
      styles: { default: { document: { run: { font: m.arLang === 'ar' && m.lang !== 'jawi' ? FO.trad : FO.naskh, size: LAT_HP, sizeComplexScript: CS_HP.naskh }, paragraph: { spacing: sp } } } },
      fonts: bytes ? [{ name: (RPH.docx && RPH.docx.FONT_AR) || 'Noto Naskh Arabic', data: bytes, characterSet: D.CharacterSet.ARABIC }] : [],
      sections: [{
        properties: {
          page: {
            size: { width: PG.w, height: PG.h, orientation: m.orientation === 'landscape' ? D.PageOrientation.LANDSCAPE : D.PageOrientation.PORTRAIT },
            margin: { top: PG.margin, right: PG.margin, bottom: PG.margin, left: PG.margin, header: 340, footer: 340 },
          },
        },
        headers, footers, children,
      }],
    });
  }
  /** → Promise<{filename, blob}>. opts.type: 'blob' (lalai, pelayar) | 'uint8array' | 'nodebuffer' (ujian Node). */
  async function docxFile(plan, opts = {}) {
    if (!RPH.docx || !RPH.docx.pack) throw new Error('RPH.docx tidak dimuatkan');
    const doc = build(plan, opts);
    const blob = await RPH.docx.pack(doc, opts.type || 'blob');
    return { filename: filename(plan, 'docx', opts.lang), blob };
  }

  // ======================================================================
  // 8. Nama fail & API
  // ======================================================================
  const fcode = s => str(s).normalize('NFKD').replace(/[^\w]+/g, '-').replace(/_/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  /** RPT_<KOD>_T<tahun>_<sesi>_<LANG>.<ext> cth. RPT_BA_T3_2026_AR.docx (PIQ → PI-QRN; sesi = academicYearId). */
  function filename(plan, ext = 'docx', lang) {
    const e = str(ext).replace(/^\./, '') || 'docx';
    const sj = safe(() => RPH.store && RPH.store.subject ? RPH.store.subject(plan.subjectId) : null, null);
    const code = fcode((sj && sj.code) || plan.subjectId || 'RPT').toUpperCase() || 'RPT';
    const yr = plan.year != null && plan.year !== '' ? `_T${fcode(plan.year)}` : '';
    const sesi = fcode(plan.academicYearId || (plan.header && plan.header.sessionLabel) || '').replace(/-/g, '');
    return `RPT_${code}${yr}${sesi ? `_${sesi}` : ''}_${pickLang(lang || plan.lang).toUpperCase()}.${e}`;
  }

  RPH.rptdoc = {
    LANGS, labels, statusText, noteText, noteKey, eventsDefault, dateRange, model, render, renderModel, docx: docxFile, build, print, filename,
    paginate, pageStyle, pageRows, estimate, fontOfBlock,
    FILL, MARGIN_MM,
  };
})(window.RPH = window.RPH || {});
