/* Enjin penjana RPH (RPH.gen) — berasaskan peraturan + bank frasa (js/engine/phrasebank.js).
   Tiada AI, tiada DOM. Sumber kebenaran: DSKP (kod & teks SK/SP) → RPT → jadual/takwim.

   PERATURAN UTAMA
   1. SK/SP TIDAK PERNAH direka. Kod diambil daripada RPT (PI) atau calon SK RPT + senarai SP DSKP (BA).
      Hanya kod disimpan; teks SK/SP dipaparkan daripada DSKP oleh renderer. Jika tiada data →
      nilai kosong + amaran "Data tidak tersedia — perlu semakan guru".
      Pengecualian: pelajaran Khatam (RPT PI tiada kod) → entri "txt:<teks RPT>" dalam sk-select/sp-select;
      Tasmik (templat tpl-tasmik, medan jenis text) → teks tetap guru daripada RPH sebenar.
   2. Pemilihan pelajaran RPT bagi satu slot (lessonFor):
      - Minggu RPT = RPH.cal.rptWeek(minggu sekolah, subjek).
      - "Kedudukan" slot = indeks slot itu dalam senarai slot kelas+subjek yang sama pada minggu itu
        (hari persekolahan sahaja, ikut tarikh & masa). Slot ke-0 = pertama dalam minggu.
      - BA: baris RPT minggu itu (rows[].rptWeek). Calon SK x.N dikumpul ikut akhiran N; kumpulan =
        akhiran[kedudukan mod bil. akhiran]. Fasa = kedudukan mod 2: fasa 0 → SK dengar-tutur (1.N) +
        baca (2.N); fasa 1 → baca (2.N) + tulis (3.N). SP dipilih daripada RPH.curr.listSp(SK):
        jumlah 2 SP (slot 30 min) atau 3 SP (60 min); SK dengar/tulis = 1 SP, SK baca = baki.
        Tetingkap SP berputar ikut "kejadian" (bilangan baris RPT terdahulu dengan tema & jenis sama)
        supaya minggu berturutan bergerak ke SP seterusnya. SP "إنتاج" hanya untuk baris projek.
      - PI: pelajaran minggu itu yang bukan Khatam (kind 'lesson'); slot ke-k → pelajaran ke-(k mod n).
        (Contoh M33: Isnin → al-Quran/tajwid, Rabu → adab — sama seperti RPH guru.)
      - PIQ (PI/Quran): lalai pelajaran Khatam (bidangId 'khatam') ikut subjects.json PIQ.defaultDomain.
      - TASMIK: templat tpl-tasmik, tiada kod DSKP.
   3. Objektif & kriteria kejayaan diterbitkan daripada kata kerja SP (boleh diukur: bilangan).
   4. Aktiviti 3 fasa; minit dijumlahkan TEPAT kepada minit slot (lihat TIMING). PAK21 dipilih
      daripada bank (tag/kesesuaian kata kerja) dan dinamakan dalam teks aktiviti "(Nama)".
   5. KBAT hanya ditetapkan jika aktiviti/SP benar-benar menuntut aras itu (master §35).
   6. regenerate() TIDAK mengubah SK/SP; variasi = putaran varian frasa (benih tarikh+kelas+subjek
      + pembilang rph.meta.regen) — deterministik tetapi berbeza bagi setiap jana semula. */
(function (RPH) {
  'use strict';
  const NO_DATA = 'Data tidak tersedia — perlu semakan guru';
  const U = () => RPH.util;
  const S = () => RPH.store;
  const CAL = () => RPH.cal;
  const CU = () => RPH.curr;
  const PH = () => RPH.phrases;

  // ------------------------------------------------------------------
  // Utiliti kecil
  // ------------------------------------------------------------------
  const uniq = arr => [...new Set(arr.filter(x => x != null && x !== ''))];
  const isTxt = x => typeof x === 'string' && x.startsWith('txt:');
  const ar = n => U().toArabicDigits(n);
  const sumAll = arr => arr.reduce((a, b) => a + (+b || 0), 0);
  const codeSort = (a, b) => a.split('.').map(Number).reduce((r, x, i) => r || x - (+b.split('.')[i] || 0), 0);
  /** Jawi: hamzah tiga suku (DSKP) → hamzah atas garis (konsisten dengan templat & leksikon). */
  const normJ = s => String(s || '').replace(/\u0674/g, 'ء').replace(/\s+/g, ' ').trim();

  function hash(str) {
    let h = 0x811c9dc5;
    for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  /** Pemilih deterministik: indeks = (hash(benih|kunci) + regen) mod n → setiap jana semula berputar. */
  function picker(seed, regen) {
    const idx = (key, len) => (len ? (hash(`${seed}|${key}`) + regen) % len : -1);
    return {
      idx,
      one(key, arr) { return arr && arr.length ? arr[idx(key, arr.length)] : undefined; },
      many(key, arr, k) {
        if (!arr || !arr.length) return [];
        const s = idx(key, arr.length); const out = [];
        for (let i = 0; i < Math.min(k, arr.length); i++) out.push(arr[(s + i) % arr.length]);
        while (out.length < k) out.push(arr[out.length % arr.length]);
        return out;
      },
    };
  }
  function lev(a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  const normAr = s => String(s || '').replace(/[ً-ْ]/g, '').replace(/[أإآ]/g, 'ا').replace(/^ال/, '').trim();

  function isFemale(teacher) {
    const g = String(teacher.gender || '').toLowerCase();
    if (g) return /^(p|f|perempuan|female|w)/.test(g);
    // Tiada medan gender (cth. profil lama) → sandaran lama; data semasa menetapkan teacher.gender secara eksplisit.
    return /\b(binti|bt\.?|bte)\b/i.test(teacher.fullName || teacher.name || '');
  }

  // ------------------------------------------------------------------
  // Masa: pembahagian minit ikut fasa. Jumlah SENTIASA = minit slot.
  // ------------------------------------------------------------------
  const TIMING = {
    ba: { 30: [[[3], [8, 12], [4, 3]], [[3], [7, 13], [4, 3]]], 60: [[[5], [15, 15, 15], [6, 4]], [[5], [12, 18, 15], [6, 4]]] },
    pi: { 30: [[[3], [7, 10, 5], [5]], [[3], [6, 12, 4], [5]]], 60: [[[3, 2], [10, 10, 15, 10], [5, 5]], [[3, 2], [8, 12, 15, 10], [6, 4]]] },
    ms: { 30: [[[3], [7, 10, 5], [5]], [[4], [6, 10, 5], [5]]], 60: [[[5], [10, 10, 15, 10], [6, 4]], [[5], [12, 10, 15, 8], [6, 4]]] },
  };
  function timing(family, minutes, variant = 0) {
    const fam = TIMING[family === 'tasmik' || family === 'pi' ? 'pi' : family === 'ba' ? 'ba' : 'ms'];
    const m = Math.max(1, Math.round(+minutes || 60));
    const presets = fam[m];
    if (presets) return U().clone(presets[variant % presets.length]);
    if (m < 10) return [[1], [Math.max(1, m - 2)], [1]];
    const base = fam[60][variant % fam[60].length];
    const out = base.map(ph => ph.map(x => Math.max(1, Math.round(x * m / 60))));
    let diff = m - sumAll(out.flat()); let guard = 200;
    while (diff !== 0 && guard-- > 0) {
      const dev = out[1]; let k = 0;
      for (let i = 1; i < dev.length; i++) if (dev[i] > dev[k]) k = i;
      if (diff > 0) { dev[k]++; diff--; } else if (dev[k] > 1) { dev[k]--; diff++; } else break;
    }
    return out;
  }

  // ------------------------------------------------------------------
  // Pelajaran RPT bagi satu slot
  // ------------------------------------------------------------------
  const sameSlot = (a, b) => (a.id && b.id ? a.id === b.id : a.start === b.start && a.classId === b.classId);
  function classYear(classId) { const c = S().classes().find(x => x.id === classId); return c ? c.year : null; }

  /** Senarai slot kelas+subjek yang sama dalam minggu sekolah tarikh iso, dan kedudukan slot ini. */
  function weekPeers(iso, slot) {
    const wk = CAL().schoolWeek(iso);
    if (wk == null) return { week: null, position: 0, count: 1 };
    const all = [];
    for (const d of CAL().weekDates(wk)) {
      const day = CAL().day(d); const dw = U().dow(d);
      if (!day.schoolDay && (dw === 0 || dw === 6)) continue;
      for (const s of CAL().slotsFor(d)) if (s.classId === slot.classId && s.subjectId === slot.subjectId) all.push({ date: d, slot: s, schoolDay: !!day.schoolDay });
    }
    const school = all.filter(x => x.schoolDay);
    let list = school; let i = school.findIndex(x => x.date === iso && sameSlot(x.slot, slot));
    if (i < 0) { list = all; i = all.findIndex(x => x.date === iso && sameSlot(x.slot, slot)); }
    return { week: wk, position: Math.max(0, i), count: Math.max(1, list.length) };
  }

  function piBidangOf(lesson) {
    if (!lesson) return null;
    if (lesson.bidangId === 'quran') {
      const s = lesson.strand || '';
      if (/تجويد/.test(s)) return 'tajwid';
      if (/حفظ/.test(s)) return 'hafazan';
      return 'tilawah';
    }
    return lesson.bidangId || null;
  }
  const REVIEW_RE = /^\(?\s*اولڠ\s?كاجي\s*\)?$/;
  function cleanLesson(l) {
    const o = {};
    for (const [k, v] of Object.entries(l || {})) if (!/Legacy$/.test(k) && k !== 'checks') o[k] = U().clone(v);
    if (o.topic) o.topic = normJ(o.topic).replace(/اولڠ كاجي/g, 'اولڠكاجي');
    return o;
  }

  const RE_EXAM_EV = /\b(UASA|UPSA|PSAT|PAT|PPT|PKSR|PEPERIKSAAN|PENTAKSIRAN\s+(AKHIR|SUMATIF|SEKOLAH|PERTENGAHAN)|UJIAN\s+(AKHIR|PENTAKSIRAN|SUMATIF))\b/i;
  const RE_POST_EV = /pasca|selepas|program\s+pasca/i;
  /** Takwim tahun semasa: adakah minggu sekolah ini mengandungi peperiksaan? */
  function takwimWeekEvents(schoolWeek) {
    return schoolWeek == null ? [] : CAL().weekDates(schoolWeek).flatMap(iso => (CAL().day(iso).events || []).filter(Boolean));
  }
  function takwimExamWeek(schoolWeek) {
    return takwimWeekEvents(schoolWeek).some(e => e.kind === 'peperiksaan' || (RE_EXAM_EV.test(e.title || '') && !RE_POST_EV.test(e.title || '')));
  }
  function takwimPostExamWeek(schoolWeek) {
    return takwimWeekEvents(schoolWeek).some(e => RE_EXAM_EV.test(e.title || '') && RE_POST_EV.test(e.title || ''));
  }
  /**
   * Baris RPT BA ulang kaji/peperiksaan tanpa kod SK/SP → SK/SP, jenis & bahan daripada baris terdahulu bagi unit (atau tema) yang sama.
   * Sama dengan dasar import (deriveCandidates) tetapi dijalankan semasa menjana, supaya RPT lama/import awal turut berfungsi.
   */
  function baReviewOf(rpt, row, schoolWeek) {
    if (!/ulangkaji|peperiksaan|pentaksiran/.test(row.kind || '') || (row.skCandidates || []).length || (row.spCandidates || []).length) return null;
    const same = rpt.rows.filter(p => p !== row && p.rptWeek != null && row.rptWeek != null && p.rptWeek < row.rptWeek && AR_KIND[p.kind]
      && ((p.skCandidates || []).length || (p.spCandidates || []).length) && ((row.unit && p.unit === row.unit) || (!row.unit && row.theme && p.theme === row.theme)));
    if (!same.length) return null;
    const last = same[same.length - 1];
    return {
      fromKind: row.kind, kind: last.kind, unit: row.unit || null, theme: row.theme || null, afterEnd: row.afterEnd || null,
      weeks: uniq(same.map(p => p.rptWeek)), examInTakwim: takwimExamWeek(schoolWeek), postExamInTakwim: takwimPostExamWeek(schoolWeek),
      sk: uniq(same.flatMap(p => p.skCandidates || [])), sp: uniq(same.flatMap(p => p.spCandidates || [])),
      content: uniq(same.flatMap(p => p.content || [])),
    };
  }

  function lessonFor(iso, slot) {
    if (!slot || !slot.subjectId) return null;
    const subjectId = slot.subjectId;
    const year = +(slot.year || classYear(slot.classId)) || null;
    const peers = weekPeers(iso, slot);
    const rptWeek = peers.week != null ? CAL().rptWeek(peers.week, subjectId) : null;
    const base = { subjectId, year, schoolWeek: peers.week, rptWeek, position: peers.position, positionCount: peers.count };

    if (subjectId === 'TASMIK') {
      const tpl = S().template('tpl-tasmik') || {};
      return { ...base, source: 'templat', kind: 'tasmik', bidangId: 'tasmik', topic: (tpl.defaults && tpl.defaults.topic) || '', sk: [], sp: [], rule: 'Tasmik: tiada RPT/DSKP; templat tpl-tasmik.' };
    }
    if (subjectId === 'BA') {
      const rpt = S().rpt('BA', year);
      if (!rpt || !rpt.rows) return { ...base, source: null, missing: 'rpt' };
      let row = rptWeek == null ? null : rpt.rows.find(r => r.rptWeek === rptWeek);
      const lastWeek = Math.max(0, ...rpt.rows.map(r => +r.rptWeek || 0));
      if (!row && rptWeek != null && rptWeek > lastWeek) {
        // Takwim lebih panjang daripada RPT (cth. RPT 41 minggu, takwim 42) → ulang kaji unit terakhir RPT.
        const last = rpt.rows.filter(r => r.rptWeek === lastWeek)[0];
        if (last && (last.unit || last.theme)) row = { rptWeek, unit: last.unit || null, theme: last.theme || null, kind: 'ulangkaji', content: [], skCandidates: [], spCandidates: [], afterEnd: lastWeek };
      }
      if (!row) return { ...base, source: 'RPT', rptId: rpt.id, missing: 'row' };
      const occurrence = rpt.rows.filter(r => r.rptWeek != null && r.rptWeek < row.rptWeek && r.theme === row.theme && r.kind === row.kind).length;
      const review = baReviewOf(rpt, row, peers.week);
      if (review) {
        return {
          ...base, source: 'RPT', rptId: rpt.id, rptFile: rpt.source && rpt.source.file,
          kind: review.kind, theme: row.theme, unit: row.unit, content: review.content, note: row.note || null, topic: row.topic || null,
          skCandidates: review.sk, spCandidates: review.sp, occurrence, review,
          rule: 'BA: baris RPT ulang kaji/peperiksaan tanpa kod → SK/SP & bahan daripada baris RPT terdahulu bagi unit yang sama (tiada kod baharu).',
        };
      }
      return {
        ...base, source: 'RPT', rptId: rpt.id, rptFile: rpt.source && rpt.source.file,
        kind: row.kind, theme: row.theme, unit: row.unit, content: (row.content || []).slice(), note: row.note || null,
        topic: row.topic || null, // tajuk bebas guru (Pengurus RPT) — diutamakan jika ada
        skCandidates: (row.skCandidates || []).slice(), spCandidates: (row.spCandidates || []).slice(), occurrence,
        rule: 'BA: baris RPT minggu itu; kedudukan slot kelas dalam minggu → fasa (0: dengar-tutur+baca, 1: baca+tulis).',
      };
    }
    if (subjectId === 'PI' || subjectId === 'PIQ') {
      const subj = S().subject(subjectId) || {};
      const rpt = S().rpt(subjectId, year);
      const wk = rpt && rptWeek != null ? (rpt.weeks || []).find(w => w.rptWeek === rptWeek) : null;
      const rptInfo = rpt ? { rptId: rpt.id, rptFile: rpt.source && rpt.source.file } : {};
      if (subjectId === 'PIQ') {
        const dom = subj.defaultDomain || 'khatam';
        const les = wk && wk.lessons.find(l => l.bidangId === dom);
        if (les) return { ...base, source: 'RPT', ...rptInfo, ...cleanLesson(les), bidang: piBidangOf(les), rule: 'PIQ: lalai bidang Khatam (subjects.json PIQ.defaultDomain).' };
        return { ...base, source: 'lalai-subjek', ...rptInfo, kind: 'khatam', bidangId: dom, bidang: dom, topic: '', sk: [], sp: [], missing: rpt ? 'row' : 'rpt', rule: 'PIQ: lalai bidang Khatam; RPT tiada.' };
      }
      if (!wk) return { ...base, source: rpt ? 'RPT' : null, ...rptInfo, missing: rpt ? 'row' : 'rpt' };
      const pool = wk.lessons.filter(l => l.kind === 'lesson');
      const chosen = pool.length ? pool[peers.position % pool.length] : wk.lessons[0];
      const les = cleanLesson(chosen);
      if (les.topic && REVIEW_RE.test(les.topic)) {
        // "(اولڠكاجي)" sahaja → cari tajuk asal pelajaran yang sama (SK sama) pada minggu terdahulu.
        for (const w of [...rpt.weeks].filter(x => x.rptWeek < rptWeek).reverse()) {
          const prev = w.lessons.find(l => l.bidangId === chosen.bidangId && (l.sk || [])[0] === (chosen.sk || [])[0] && l.topic && !REVIEW_RE.test(normJ(l.topic).replace(/اولڠ كاجي/g, 'اولڠكاجي')));
          if (prev) { les.topic = `${normJ(prev.topic)} (اولڠكاجي)`; break; }
        }
      }
      return {
        ...base, source: 'RPT', ...rptInfo, ...les, bidang: piBidangOf(chosen),
        rule: 'PI: pusingan pelajaran RPT minggu itu (bukan Khatam) ikut kedudukan slot kelas dalam minggu (slot ke-k → pelajaran ke-(k mod n)).',
      };
    }
    // Subjek lain yang ditambah guru (tanpa ubah kod, §ARAHAN PALING PENTING): baca RPT subjek itu dalam
    // format Pengurus RPT — "weeks" (seperti RPT PI) atau "rows" (seperti RPT BA). SK/SP hanya daripada RPT.
    const rpt = S().rpt(subjectId, year);
    if (!rpt) return { ...base, source: null, missing: 'rpt' };
    const rptInfo = { rptId: rpt.id, rptFile: rpt.source && rpt.source.file };
    if (Array.isArray(rpt.weeks)) {
      const wk = rptWeek != null ? rpt.weeks.find(w => +w.rptWeek === rptWeek) : null;
      const lessons = (wk && wk.lessons) || [];
      if (!lessons.length) return { ...base, source: 'RPT', ...rptInfo, missing: 'row' };
      const pool = lessons.filter(l => !l.kind || l.kind === 'lesson');
      const list = pool.length ? pool : lessons;
      const ch = list[(peers.position || 0) % list.length];
      return {
        ...base, source: 'RPT', ...rptInfo, kind: ch.kind || 'lesson', bidangId: ch.bidangId || null, bidang: ch.bidang || null,
        theme: ch.theme || null, topic: ch.topic || '', sk: (ch.sk || []).slice(), sp: (ch.sp || []).slice(), note: ch.note || null,
        rule: 'Subjek umum: pusingan pelajaran RPT minggu itu ikut kedudukan slot kelas dalam minggu.',
      };
    }
    if (Array.isArray(rpt.rows)) {
      const row = rptWeek == null ? null : rpt.rows.find(r => r.rptWeek != null && +r.rptWeek === rptWeek);
      if (!row) return { ...base, source: 'RPT', ...rptInfo, missing: 'row' };
      return {
        ...base, source: 'RPT', ...rptInfo, kind: row.kind || 'lesson', theme: row.theme || null, unit: row.unit || null,
        topic: row.topic || '', content: (row.content || []).slice(), note: row.note || null,
        sk: (row.sk || row.skCandidates || []).slice(), sp: (row.sp || row.spCandidates || []).slice(),
        rule: 'Subjek umum: baris RPT minggu itu.',
      };
    }
    return { ...base, source: 'RPT', ...rptInfo, missing: 'row' };
  }

  // ------------------------------------------------------------------
  // Konteks
  // ------------------------------------------------------------------
  /** Subjek Bahasa Arab (kandungan pelajaran bahasa Arab: kosa kata/huruf/tarkib daripada RPT & DSKP BA). */
  function isArabicSubject(subjectId) {
    if (subjectId === 'BA') return true;
    const s = S().subject(subjectId);
    return !!(s && s.script === 'arabic');
  }
  /** Subjek berskrip Jawi (DSKP PI): PI, PIQ atau subjek guru dengan script 'jawi'. */
  function isJawiSubject(subjectId) {
    if (['PI', 'PIQ', 'TASMIK'].includes(subjectId)) return true;
    const s = S().subject(subjectId);
    return !!(s && s.script === 'jawi');
  }
  /**
   * Keluarga penjana: 'ba' (BA dalam Arab), 'pi'/'tasmik' (Jawi, composePI), 'en' (Inggeris), 'arg' (Arab generik),
   * 'jawg' (Jawi generik: BA & subjek lain dalam Jawi), 'ms' (BM Rumi).
   */
  function familyOf(template, subjectId) {
    if (!template) return 'ms';
    if (template.labelLang === 'en') return 'en';
    if (template.labelLang === 'ar') return isArabicSubject(subjectId) ? 'ba' : 'arg';
    if (template.labelLang === 'jawi') {
      if (subjectId === 'TASMIK' || template.id === 'tpl-tasmik') return 'tasmik';
      return isJawiSubject(subjectId) ? 'pi' : 'jawg';
    }
    return 'ms';
  }

  function resolveSlot(input) {
    if (input.slot) return { ...input.slot };
    const cls = S().classes().find(c => c.id === input.classId) || {};
    const minutes = input.minutes || U().minutesBetween(input.start, input.end) || null;
    return { id: input.slotId || null, start: input.start || null, end: input.end || null, minutes, classId: input.classId || null, className: input.className || cls.name || input.classId || '', subjectId: input.subjectId, year: input.year || cls.year || null, kind: 'PdP', versionId: input.timetableVersionId || null };
  }

  function buildContext(input, regen) {
    const date = input.date || CAL().today();
    const slot = resolveSlot(input);
    const subjectId = slot.subjectId;
    const subject = S().subject(subjectId) || { id: subjectId, name: { ms: subjectId || '' } };
    const cls = S().classes().find(c => c.id === slot.classId) || null;
    const year = +(slot.year || (cls && cls.year) || input.year) || null;
    const template = S().template(input.templateId || subject.defaultTemplateId) || S().template('tpl-generic-kpm');
    const family = familyOf(template, subjectId);
    const warnings = [];
    const rawMin = +slot.minutes || U().minutesBetween(slot.start, slot.end);
    const minutes = rawMin > 0 ? rawMin : 60;
    if (!(rawMin > 0)) warnings.push('Masa slot tidak diketahui — tempoh 60 minit diandaikan; perlu semakan guru.');
    const week = CAL().schoolWeek(date);
    const wkObj = week != null ? CAL().week(week) : null;
    const term = wkObj ? wkObj.term : CAL().termOf(date);
    const lesson = input.rptLesson !== undefined ? input.rptLesson : lessonFor(date, slot);
    const seed = `${date}|${slot.classId}|${subjectId}|${slot.start || slot.id || ''}`;
    const teacher = S().get('teacher') || {};
    return {
      input, date, dow: U().dow(date), slot, subjectId, subject, cls, year, template, family, minutes, week, term,
      rptWeek: lesson && lesson.rptWeek != null ? lesson.rptWeek : (week != null ? CAL().rptWeek(week, subjectId) : null),
      lesson: lesson || null, seed, regen: regen || 0, pick: picker(seed, regen || 0), female: isFemale(teacher),
      warnings, notes: [], forced: input.forced || null,
    };
  }

  const maxKbat = list => {
    const order = ['mengaplikasi', 'menganalisis', 'menilai', 'mencipta'];
    return list.filter(Boolean).sort((a, b) => order.indexOf(b) - order.indexOf(a))[0] || '';
  };
  const target = m => (m <= 2 ? m : Math.max(1, Math.round(m * 0.8)));

  // ==================================================================
  //  BAHASA ARAB
  // ==================================================================
  const AR_KIND = { 'kosa-kata': 'kosa-kata', projek: 'kosa-kata', huruf: 'huruf', 'suku-kata': 'suku-kata', tarkib: 'tarkib', nombor: 'nombor', 'huruf+suku-kata': 'huruf' };

  function arVerbKey(text, domain) {
    const t = String(text || '').replace(/^القدرة على\s*/, '').trim();
    const rules = [[/^محاكاة قراءة/, 'read'], [/^الاستماع إلى/, 'listen'], [/^محاكاة/, domain === '2' ? 'read' : 'imitate'], [/^تحديد/, 'identify'],
      [/^تمييز/, 'distinguish'], [/^تكوين/, 'form'], [/^تهجئة/, 'spell'], [/^قراءة/, 'read'], [/^كتابة/, 'write'], [/^نسخ/, 'copy'],
      [/^حفظ/, 'memorize'], [/^تمثيل/, 'act'], [/^تصنيف/, 'classify'], [/^ترتيب/, 'order'], [/^تسميع/, 'recite'], [/^إنتاج/, 'produce'],
      [/^مسك/, 'hold'], [/^تحريك/, 'trace'], [/^وصل/, 'connect']];
    for (const [re, k] of rules) if (re.test(t)) return k;
    return domain === '3' ? 'write' : 'read';
  }
  function arUnit(text, kindAct) {
    if (kindAct === 'nombor' || /الأرقام|الأعداد/.test(text)) return 'number';
    if (kindAct === 'tarkib' || /التراكيب/.test(text)) return 'phrase';
    if (/المقطع|المقاطع/.test(text)) return 'syllable';
    return 'word';
  }
  function countNoun(n, U_) {
    if (n === 1) return U_.one;
    if (n === 2) return U_.dual;
    if (n > 10) return `${ar(n)} ${U_.acc1}`;
    return `${ar(n)} ${U_.pl}`;
  }

  function applyRptFixes(lines, notes) {
    const fixes = PH().ar.rptFixes;
    return lines.map(l => {
      let s = String(l || '');
      for (const [a, b] of fixes) if (s.includes(a)) { s = s.split(a).join(b); notes.push(`Ejaan RPT dibetulkan: ${a} → ${b}`); }
      return s;
    });
  }
  function parseWords(lines) {
    const out = [];
    for (const line of lines) {
      const part = line.includes(':') ? line.slice(line.indexOf(':') + 1).replace(/:/g, '،') : line;
      const toks = part.split(/[،,]/).map(s => s.replace(/[.\-–—()]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
      if (toks.length < 2) continue;
      for (const t of toks) {
        if (/^[ء-ْ\s]+$/.test(t) && t.split(' ').length <= 3 && !/الحركات|فتحة|كسرة|ضمة|الكلمة|أول|وسط|آخر|المقاطع|الحروف/.test(t)) out.push(t);
      }
    }
    return uniq(out);
  }
  function parsePhrases(lines) {
    const out = [];
    for (const line of lines) {
      const part = line.includes(':') ? line.slice(line.indexOf(':') + 1) : line;
      for (let seg of part.split(/[/،,]/)) {
        seg = seg.replace(/\s+(الخ|ال)\s*$/g, '').replace(/\.{2,}/g, '…').replace(/\s*…\s*/g, ' … ').replace(/\s+/g, ' ').trim()
          .replace(/^[.…\s]+|[.\s]+$/g, '').trim();
        if (seg.replace(/[^ء-ي]/g, '').length >= 3) out.push(seg);
      }
    }
    return uniq(out);
  }
  function matchVocab(words, vocab, notes) {
    if (!vocab || !vocab.length) return words;
    return uniq(words.map(w => {
      if (vocab.includes(w)) return w;
      let best = null, bd = 99, tie = false;
      for (const v of vocab) {
        const d = lev(normAr(w), normAr(v));
        if (d < bd) { bd = d; best = v; tie = false; } else if (d === bd) tie = true;
      }
      if (best && bd <= 2 && !tie && normAr(w).length >= 2) { notes.push(`Perkataan RPT dipadankan dengan kosa kata DSKP: ${w} → ${best}`); return best; }
      return w;
    }));
  }

  function chooseBaCodes(ctx, L, kindRaw) {
    const year = ctx.year;
    if (L.spCandidates && L.spCandidates.length) {
      const sp = L.spCandidates.filter(c => CU().sp('BA', year, c));
      return { sk: uniq(sp.map(c => c.split('.').slice(0, 2).join('.'))), sp, phase: 0 };
    }
    const cands = (L.skCandidates || []).filter(c => CU().sk('BA', year, c));
    if (!cands.length) return { sk: [], sp: [], phase: 0 };
    const suffixes = uniq(cands.map(c => c.split('.')[1]));
    const p = L.position || 0;
    const suffix = suffixes[p % suffixes.length];
    const grp = cands.filter(c => c.split('.')[1] === suffix);
    const phase = p % 2;
    const d = n => grp.find(c => c.startsWith(`${n}.`));
    let sks = (phase === 0 ? [d(1), d(2)] : [d(2), d(3)]).filter(Boolean);
    if (!sks.length) sks = [grp[0]];
    const k = ctx.minutes >= 60 ? 3 : 2;
    const fixedCount = sks.filter(c => !c.startsWith('2.')).length;
    const occ = L.occurrence || 0;
    const sp = [];
    for (const skc of sks) {
      let list = CU().listSp('BA', year, skc).filter(x => kindRaw === 'projek' || !/إنتاج/.test(x.text));
      if (!list.length) list = CU().listSp('BA', year, skc);
      if (!list.length) continue;
      const want = Math.min(list.length, sks.length === 1 ? k : (skc.startsWith('2.') ? Math.max(1, k - fixedCount) : 1));
      let src = list;
      if (phase === 1 && skc.startsWith('2.')) { const pref = list.filter(x => /^القدرة على (تهجئة|محاكاة قراءة الكلمات|قراءة)/.test(x.text)); if (pref.length) src = pref; }
      const start = (occ * want) % src.length;
      for (let i = 0; i < Math.min(want, src.length); i++) sp.push(src[(start + i) % src.length].code);
    }
    return { sk: sks, sp: uniq(sp).sort(codeSort), phase };
  }

  /**
   * lang 'ar' (lalai: templat Arab, set PH().ar) | 'en' (PH().en.ba) | 'ms' (PH().ms.ba) | 'jawi' (PH().jawig.ba).
   * Algoritma sama bagi semua bahasa; bahan pelajaran (kosa kata/ungkapan/huruf DSKP & RPT) kekal Arab, dipetik «…»
   * dalam ayat bukan Arab. Tema محور dipapar dalam bahasa templat melalui RPH.i18n.theme (kanonik Arab disimpan dalam snapshot).
   */
  function composeBA(ctx, lang) {
    lang = lang || 'ar';
    const AR_ = lang === 'ar'; const EN = lang === 'en'; const LAT = !AR_; const DIG = AR_ || lang === 'jawi';
    const A = AR_ ? PH().ar : lang === 'en' ? PH().en.ba : lang === 'ms' ? PH().ms.ba : PH().jawig.ba;
    const fill = PH().fill; const L = ctx.lesson || {}; const year = ctx.year; const pick = ctx.pick;
    const F = ctx.forced || {}; const input = ctx.input;
    const NUM = DIG ? ar : (n => String(n));
    const cn = AR_ ? countNoun : (A.count || ((n, U_) => (n === 1 ? `1 ${U_.one}` : `${n} ${U_.pl}`)));
    const c = baseContent();
    if (!CU().get('BA', year)) ctx.warnings.push(`${NO_DATA}: DSKP Bahasa Arab Tahun ${year || '?'} tiada.`);
    // SK/SP: dipaksa (jana semula) → input manual → pilihan daripada RPT + DSKP
    let codes;
    const manualCodes = !!(F.sk || F.sp || input.sk || input.sp);
    if (F.sk || F.sp) codes = { sk: (F.sk || []).slice(), sp: (F.sp || []).slice(), phase: 0 };
    else if (input.sk || input.sp) codes = { sk: (input.sk || []).slice(), sp: (input.sp || []).slice(), phase: 0 };
    else codes = chooseBaCodes(ctx, L, L.kind);
    if (!codes.sk.length || !codes.sp.length) ctx.warnings.push(`${NO_DATA}: SK/SP tidak dapat ditentukan daripada RPT/DSKP.`);
    c.sk = codes.sk; c.sp = codes.sp;

    // Kandungan RPT hanya digunakan jika SK yang dipilih memang daripada baris RPT itu dan tema sama.
    // Tema boleh dipaksa dalam mana-mana bahasa (cth. "Pakaian" selepas tukar bahasa) → nama kanonik Arab DSKP.
    const themeIn = F.theme != null ? F.theme : (input.theme || L.theme || '');
    const themeHit = themeIn && RPH.i18n ? RPH.i18n.findTheme('BA', year, themeIn) : null;
    const theme = themeHit && themeHit.name && themeHit.name.ar ? themeHit.name.ar : themeIn;
    const themeOverride = !!(theme && L.theme && theme !== L.theme);
    const rowSk = L.skCandidates || []; const rowSp = L.spCandidates || [];
    const useRpt = !!L.kind && !themeOverride && (!manualCodes || !c.sk.length || c.sk.every(x => rowSk.includes(x)) || (rowSp.length && c.sp.every(x => rowSp.includes(x))));
    const SUFFIX_KIND = { 1: 'huruf', 2: 'suku-kata', 3: 'kosa-kata', 4: 'tarkib', 5: 'nombor' };
    const skKind = c.sk.length ? SUFFIX_KIND[c.sk[0].split('.')[1]] : null;
    const kindRaw = useRpt ? L.kind : (skKind || 'umum');
    if (manualCodes && L.kind && !useRpt) ctx.notes.push('SK/tema manual berbeza daripada baris RPT minggu ini — kandungan RPT tidak digunakan; kosa kata/ungkapan daripada محور DSKP.');
    if (L.missing === 'rpt') ctx.warnings.push(`${NO_DATA}: RPT Bahasa Arab Tahun ${year || '?'} tiada.`);
    else if (L.missing === 'row') ctx.warnings.push(`${NO_DATA}: tiada baris RPT bagi minggu RPT ${ctx.rptWeek ?? '?'}.`);
    else if (useRpt && L.review) {
      const R = L.review; const where = R.unit ? `unit «${R.unit}»` : `tema «${R.theme}»`;
      const wk = R.weeks.length > 1 ? `${R.weeks[0]}–${R.weeks[R.weeks.length - 1]}` : `${R.weeks[0]}`;
      const src = `SK/SP daripada RPT minggu ${wk} (diterbitkan sistem)`;
      const isProg = /program/.test(R.fromKind);
      ctx.notes.push(R.afterEnd ? `RPT berakhir pada minggu ${R.afterEnd}; minggu RPT ${ctx.rptWeek} diisi ulang kaji ${where} — ${src}. Semak jika perlu.`
        : R.examInTakwim ? `Minggu peperiksaan (takwim): RPH ulang kaji ${where} — ${src}. Tandakan status "Peperiksaan" jika PdP tidak berjalan.`
        : isProg && R.postExamInTakwim ? `Minggu program pasca peperiksaan (takwim): RPH ulang kaji ${where} — ${src}. Tandakan status "Program Sekolah" jika PdP tidak berjalan.`
          : `RPT menanda minggu RPT ${ctx.rptWeek} sebagai "${R.fromKind}", tetapi takwim tahun ini tiada ${isProg ? 'program pasca peperiksaan' : 'peperiksaan'} pada minggu ini (RPT sesi lain?). RPH diisi ulang kaji ${where} — ${src}. Semak jika perlu.`);
    }
    else if (useRpt && L.kind === 'program') ctx.notes.push(`Minggu RPT ${ctx.rptWeek} ialah program sekolah (tiada PdP) — RPH ditanda status "Program Sekolah".`);
    else if (useRpt && L.kind && !AR_KIND[L.kind]) ctx.warnings.push(`${NO_DATA}: minggu RPT ${ctx.rptWeek} ialah "${L.kind}" (tiada SK/SP).`);

    // Kandungan RPT
    const lines = useRpt ? applyRptFixes(L.content || [], ctx.notes) : [];
    const themeObj = theme ? CU().theme('BA', year, theme) : null;
    if (theme && !themeObj) ctx.notes.push(`Tema "${theme}" tiada dalam senarai محاور DSKP.`);
    const vocab = (themeObj && themeObj.vocabulary) || [];
    const exprsDskp = (themeObj && themeObj.expressions) || [];
    let words = parseWords(lines);
    if (kindRaw === 'kosa-kata' || kindRaw === 'projek') {
      words = matchVocab(words, vocab, ctx.notes);
      const want = useRpt ? 3 : (ctx.minutes >= 60 ? 8 : 6);
      for (const v of vocab) { if (words.length >= want) break; if (!words.includes(v)) words.push(v); }
    }
    let phrases = kindRaw === 'tarkib' ? parsePhrases(lines) : [];
    for (const e of exprsDskp) { if (kindRaw !== 'tarkib' || phrases.length >= 3) break; const e2 = e.replace(/\.{2,}/g, '…'); if (!phrases.includes(e2)) phrases.push(e2); }
    const rng = (lines.join(' ').match(/(\d+)\s*-\s*(\d+)/) || []);
    let a = +rng[1] || null, b = +rng[2] || null; if (a && b && a > b) [a, b] = [b, a];
    const numbers = a && b ? Array.from({ length: Math.min(b - a + 1, 20) }, (_, i) => a + i) : [];
    const letters = [];
    for (const m of lines.join(' ').matchAll(/\(([^)]*)\)/g)) for (const ch of m[1].split('/').map(s => s.trim())) if (ch.length === 1 && A.letterNames[ch]) letters.push(ch);
    const L1ch = letters[0] || '';
    const L1 = L1ch ? (LAT ? A.letter(L1ch, A.letterNames) : A.letterNames[L1ch]) : '';
    const Lw = LAT ? A.lettersPhrase(uniq(letters), A.letterNames)
      : letters.length > 1 ? `حروف ${uniq(letters).map(x => A.letterNames[x]).join(' و')}` : (L1 ? `حرف ${L1}` : '');

    let kindAct = AR_KIND[kindRaw] || 'umum';
    if (kindRaw === 'huruf+suku-kata' && c.sk.some(x => x.split('.')[1] === '2')) kindAct = 'suku-kata';
    if (kindAct === 'huruf' && !L1) kindAct = words.length ? 'kosa-kata' : 'umum';
    if (kindAct === 'tarkib' && !phrases.length) kindAct = 'umum';
    if (kindAct === 'nombor' && !numbers.length) kindAct = 'umum';

    // Tema / tajuk / unit buku teks / kemahiran
    const themeTr = theme && !AR_ && RPH.i18n ? RPH.i18n.theme('BA', year, theme, lang) : null;
    const themeShown = themeTr && themeTr.translated ? themeTr.text : '';
    c.theme = AR_ ? theme : (themeShown || theme);
    const dg = DIG ? (s => (/[A-Za-z]/.test(String(s)) ? String(s) : ar(s))) : (s => String(s)); // teks Rumi (cth. program sekolah) tidak ditukar digit
    const trTopic = t => {
      if (t == null || AR_ || !RPH.i18n) return t;
      const r = RPH.i18n.topic(t, lang, { subjectId: 'BA', srcLang: U().isArabicScript(t) ? 'ar' : null, topicI18n: L.topicI18n });
      return r.translated ? r.text : t;
    };
    let topic = F.topic != null ? F.topic : (F.topicSrc != null ? trTopic(F.topicSrc) : (input.topic != null ? trTopic(input.topic) : (useRpt && L.topic ? trTopic(L.topic) : null)));
    if (topic == null && LAT) {
      const tk = A.topics[kindRaw];
      const ok = { 'kosa-kata': words.length, projek: words.length, huruf: L1, 'huruf+suku-kata': L1, 'suku-kata': Lw, tarkib: phrases.length, nombor: a }[kindRaw];
      topic = tk && ok ? fill(tk, { words: `«${words.slice(0, 6).join('، ')}»`, Lw, exprs: phrases.slice(0, 3).map(x => `«${x}»`).join(' / '), a, b })
        : kindRaw === 'projek' && words.length ? fill(A.topics['kosa-kata'], { words: `«${words.join('، ')}»` }) : (() => { const l0 = (lines[0] || '').replace(/^[-\s]+/, ''); return l0 && U().isArabicScript(l0) ? `«${l0}»` : l0; })();
    }
    if (topic == null) {
      if (kindRaw === 'kosa-kata' || kindRaw === 'projek') topic = words.length ? `الكلمات: ${words.join('، ')}` : '';
      else if (kindRaw === 'huruf') topic = L1 ? `الحروف المركزة: ${Lw} (${uniq(letters).join('/')})` : (lines[0] || '');
      else if (kindRaw === 'huruf+suku-kata') topic = L1 ? `الحروف المركزة: ${Lw} (${uniq(letters).join('/')}) ومقاطعها في الكلمات` : (lines[0] || '');
      else if (kindRaw === 'suku-kata') topic = Lw ? `مقاطع ${Lw} في الكلمات: ${words.slice(0, 6).join('، ')}` : (lines[0] || '');
      else if (kindRaw === 'tarkib') topic = phrases.length ? `التراكيب: ${phrases.slice(0, 3).join(' / ')}` : (lines[0] || '');
      else if (kindRaw === 'nombor') topic = a ? `الأرقام والأعداد (${a}-${b})` : (lines[0] || '');
      else topic = (lines[0] || '').replace(/^[-\s]+/, '');
    }
    c.topic = dg(topic || '');
    c.textbookUnit = useRpt ? (L.unit || '') : '';
    const doms = uniq(c.sk.map(x => x.split('.')[0])).sort();
    c.skills = A.skills[doms.join('+')] || (doms.length ? A.skills[doms[0]] : '');

    // Pemboleh ubah frasa
    const T = ctx.female ? A.teacher.f : A.teacher.m;
    const qT = t => (themeShown && t === theme ? themeShown : U().isArabicScript(t) ? `«${t}»` : t); // tema Arab (tanpa terjemahan) dalam ayat bukan Arab
    const spItems = c.sp.filter(x => !isTxt(x)).map(code => CU().sp('BA', year, code)).filter(Boolean);
    const focusUnitKey = spItems.length ? arUnit(spItems[spItems.length - 1].text, kindAct) : (kindAct === 'tarkib' ? 'phrase' : kindAct === 'nombor' ? 'number' : 'word');
    const UF = A.units[focusUnitKey];
    // Unit utama pelajaran (untuk penutup/PdPR) vs unit fokus SP (untuk langkah kata kerja & PAK21).
    const mainUnitKey = kindAct === 'tarkib' ? 'phrase' : kindAct === 'nombor' ? 'number' : 'word';
    const UM = A.units[mainUnitKey];
    const sylOfWords = focusUnitKey === 'syllable' && mainUnitKey === 'word';
    const vars = LAT ? {
      T, theme: theme ? qT(theme) : A.fallbackTheme, words: words.length ? `«${words.slice(0, 6).join('، ')}»` : '', w1: words[0] || '', w2: words[1] || words[0] || '', w3: words[2] || words[0] || '',
      L1, Lw, long: L1ch ? `«${L1ch}ا، ${L1ch}و، ${L1ch}ي»` : '', e1: kindAct === 'tarkib' ? (phrases[0] || exprsDskp[0] || '') : '', exprs: phrases.slice(0, 3).map(x => `«${x}»`).join(', '),
      a: a ? String(a) : '', b: b ? String(b) : '', unitDef: sylOfWords ? A.sylOfWords : UF.studied, unitPlDef: UF.defPl, oneAcc: UF.acc1, oneGen: UF.gen1,
      mainDef: UM.studied,
      songTopic: A.songTopic[kindAct] || (theme ? qT(theme) : A.fallbackTheme),
    } : {
      T, theme: theme ? (/\s/.test(theme) ? `«${theme}»` : theme) : 'الدرس', words: dg(words.slice(0, 6).join('، ')), w1: words[0] || '', w2: words[1] || words[0] || '', w3: words[2] || words[0] || '',
      L1, Lw, long: L1ch ? `${L1ch}ا، ${L1ch}و، ${L1ch}ي` : '', e1: kindAct === 'tarkib' ? (phrases[0] || exprsDskp[0] || '') : '', exprs: phrases.slice(0, 3).map(x => `«${x}»`).join('، '),
      a: a ? dg(a) : '', b: b ? dg(b) : '', unitDef: sylOfWords ? 'مقاطع الكلمات المدروسة' : UF.studied, unitPlDef: UF.defPl, oneAcc: UF.acc1, oneGen: UF.gen1,
      mainDef: UM.studied,
      songTopic: kindAct === 'nombor' ? 'الأعداد' : kindAct === 'huruf' ? 'الحروف' : (theme ? (/\s/.test(theme) ? `«${theme}»` : theme) : 'الدرس'),
    };
    const fa = (tpl, extra) => { const s = fill(tpl, { ...vars, ...(extra || {}) }, { female: ctx.female }); return lang === 'jawi' ? ar(s) : dg(s); };

    // Objektif & kriteria
    const lists = { words, phrases, numbers };
    const long = ctx.minutes >= 60;
    const metas = [];
    const critFrames = pick.many('crit', A.criteria, 3);
    for (const [i, sp] of spItems.entries()) {
      if (metas.length >= 3) break;
      const vk = arVerbKey(sp.text, sp.domain && sp.domain.code);
      const V = A.verbs[vk] || A.verbs.read;
      const unit = arUnit(sp.text, kindAct); const UU = A.units[unit];
      let m = unit === 'number' ? (numbers.length || (long ? 6 : 4)) : unit === 'phrase' ? Math.min(phrases.length || 3, long ? 5 : 3)
        : unit === 'syllable' ? Math.min((words.length || 4) * 2, long ? 10 : 6) : Math.min(words.length || (long ? 8 : 5), long ? 10 : 6);
      if (V.mode === 'written') m = Math.min(m, long ? 6 : 4);
      const n = target(m);
      let scope;
      if (unit === 'number') scope = fill(A.scopes.numbers, vars);
      else if (unit === 'phrase') scope = theme ? fill(A.scopes.themePhrases, vars) : A.scopes.studiedPhrases;
      else if ((kindAct === 'huruf' || kindAct === 'suku-kata') && Lw) scope = fill(A.scopes.letterWords, vars);
      else scope = theme ? fill(A.scopes.themeWords, vars) : A.scopes.studiedWords;
      const ov = { c: cn(n, UU), n: NUM(n), scope, ha: LAT ? '' : n === 2 ? 'هما' : 'ها' };
      const dom = sp.domain && sp.domain.code;
      const objPool = (V.objByDomain && V.objByDomain[dom]) || V.obj;
      const objTpl = pick.one(`obj:${i}:${vk}`, objPool);
      const end = LAT ? '.' : ''; // objektif en/ms/jawi = ayat lengkap; gaya BA asal tanpa noktah dikekalkan
      let obj = fa(objTpl, ov) + end;
      if (c.objectives.includes(obj)) obj = fa(objPool[(objPool.indexOf(objTpl) + 1) % objPool.length], ov) + end;
      if (c.objectives.includes(obj)) continue;
      c.objectives.push(obj);
      const crit = m >= 3
        ? fa(critFrames[metas.length % critFrames.length], { vn: V.vn, n: NUM(n), m: NUM(m), unitPl: AR_ && m > 10 ? UU.acc1 : UU.pl, adv: V.adv })
        : fa(pick.one(`critAll:${i}`, A.criteriaAll), { vn: V.vn, studied: UU.studied, adv: V.adv });
      c.criteria.push(crit);
      metas.push({ vk, mode: V.mode, unit, n, m, kbat: V.kbat || '' });
    }
    if (!c.objectives.length) ctx.warnings.push('Objektif tidak dapat dijana kerana tiada SP — perlu diisi guru.');

    // Aktiviti
    const preset = timing('ba', ctx.minutes, pick.idx('timing', 2));
    const verbs = uniq(metas.map(x => x.vk));
    const focusVerb = verbs[verbs.length - 1] || 'read';
    const focusMode = (A.verbs[focusVerb] || {}).mode || 'oral';
    const indPool = A.induction[kindAct] || A.induction.umum;
    const induction = pick.many('ind', indPool.filter(t => (!/\{w1\}/.test(t) || vars.w1) && (!/\{e1\}/.test(t) || vars.e1)), preset[0].length).map((t, i) => ({ text: fa(t), minutes: preset[0][i] }));
    const devTexts = [fa(pick.one('present', A.present[kindAct] || A.present.umum))];
    // PAK21
    const pakBank = id => RPH.banks.item('pak21', id);
    // Templat PAK21 yang sesuai dengan kata kerja (rentetan = semua mod; {modes,t} = mod tertentu).
    const tplsFor = (p, verb) => p.tpl.map(x => (typeof x === 'string' ? { t: x } : x))
      .filter(x => (!x.modes || !verb || x.modes.includes(verb)) && (!/\{e1\}/.test(x.t) || vars.e1)).map(x => x.t);
    const pakOk = verb => ([id, p]) => pakBank(id) && tplsFor(p, verb).length;
    let pakVerb = focusVerb;
    let pakCands = Object.entries(A.pak).filter(([, p]) => p.modes.includes(focusVerb)).filter(pakOk(focusVerb));
    if (!pakCands.length) { pakVerb = focusMode === 'written' ? 'write' : 'read'; pakCands = Object.entries(A.pak).filter(([, p]) => p.modes.includes(pakVerb)).filter(pakOk(pakVerb)); }
    if (!pakCands.length) { pakVerb = null; pakCands = Object.entries(A.pak).filter(pakOk(null)); }
    // KBAT secara lalai (keputusan guru 2026-10-02): utamakan teknik PAK21 yang langkahnya benar-benar pada aras KBAT,
    // supaya medan KBAT sentiasa terisi tanpa "assign palsu" (§35). Guru masih boleh mengubahnya dalam editor.
    let pakKbat = pakCands.filter(([, p]) => p.kbat);
    const focusHasKbat = !!(A.verbs[focusVerb] || {}).kbat && pakVerb === focusVerb; // cth. إنتاج → mencipta: kekalkan kata kerja fokus
    if (!pakKbat.length && !focusHasKbat) {
      // Tiada teknik KBAT bagi kata kerja fokus → cuba kata kerja SP lain dalam pelajaran yang sama.
      for (const v of verbs.filter(x => x && x !== pakVerb)) {
        const cand = Object.entries(A.pak).filter(([, p]) => p.kbat && p.modes.includes(v)).filter(pakOk(v));
        if (cand.length) { pakKbat = cand; pakVerb = v; break; }
      }
    }
    if (!pakKbat.length && !focusHasKbat) {
      // Sandaran terakhir: teknik KBAT umum yang templatnya sesuai dengan pelajaran (cth. Odd One Out pada perkataan tema).
      const any = Object.entries(A.pak).filter(([, p]) => p.kbat).filter(pakOk(null));
      if (any.length) { pakKbat = any; pakVerb = null; }
    }
    if (pakKbat.length) pakCands = pakKbat;
    const [pakId, pakDef] = pick.one('pak', pakCands);
    const pakName = EN ? (pakBank(pakId).en || pakBank(pakId).name) : pakBank(pakId).name; // ms/jawi/ar: nama teknik rasmi PAK21
    const pakTpl = pick.one('pakTpl', tplsFor(pakDef, pakVerb));
    const pakText = fa(pakTpl).replace(/\.$/, '') + ` (${pakName}).`;
    const stepVerbs = [pakVerb === focusVerb ? focusVerb : null];
    if (preset[1].length >= 3) {
      const v2 = verbs.find(v => !['imitate', 'listen', 'read'].includes(v) && v !== focusVerb) || verbs.find(v => v !== focusVerb) || (focusMode === 'written' ? 'read' : 'identify');
      devTexts.push(fa(pick.one(`vstep:${v2}`, A.verbSteps[v2] || A.verbSteps.read)));
      stepVerbs.push(v2);
    }
    devTexts.push(pakText);
    while (devTexts.length < preset[1].length) devTexts.push(fa(pick.one(`extra:${devTexts.length}`, A.verbSteps[focusVerb] || A.verbSteps.read)));
    const development = devTexts.slice(0, preset[1].length).map((t, i) => ({ text: t, minutes: preset[1][i], ...(t === pakText ? { pak21: pakId } : {}) }));
    // Objektif penulisan mesti ada langkah penulisan (§70): jika tiada, pecahkan langkah terpanjang (jumlah minit kekal).
    const writeVerb = verbs.find(v => (A.verbs[v] || {}).mode === 'written' && A.verbSteps[v]);
    if (writeVerb && RPH.check && RPH.check.hasWritingStep && !RPH.check.hasWritingStep(development.map(x => x.text).join(' '))) {
      let k = 0; development.forEach((x, i) => { if (x.minutes > development[k].minutes) k = i; });
      const take = Math.min(5, Math.floor(development[k].minutes / 2));
      if (take >= 2) { development[k].minutes -= take; development.push({ text: fa(pick.one(`write:${writeVerb}`, A.verbSteps[writeVerb])), minutes: take }); stepVerbs.push(writeVerb); }
    }
    const closure = [fa(pick.one('cl1', A.closure[focusMode] || A.closure.oral), { unitDef: focusMode === 'written' ? vars.unitDef : vars.mainDef }), fa(pick.one('cl2', A.closure.umum))]
      .slice(0, preset[2].length).map((t, i) => ({ text: t, minutes: preset[2][i] }));
    c.phases = { induction, development, closure };
    c.pak21 = pakId;

    // Bank: BBM, pentaksiran, KBAT, EMK, nilai, strategi, aspirasi
    const all = [...induction, ...development, ...closure].map(x => x.text).join(' ');
    // Pengesan teks aktiviti (BBM, pentaksiran, kerja kumpulan, strategi) ikut bahasa ayat.
    const RX = LAT ? A.rx : null;
    if (LAT) {
      const bbmE = ['buku-teks'];
      if (RX.kadHuruf.test(all)) bbmE.push('kad-huruf');
      if (RX.kad.test(all)) bbmE.push('kad-perkataan');
      if (RX.pics.test(all)) bbmE.push('gambar');
      if (RX.video.test(all)) bbmE.push('lcd-projektor', 'skrin', 'komputer-riba');
      else if (RX.audio.test(all)) bbmE.push('komputer-riba');
      if (RX.sheet.test(all)) bbmE.push('lembaran-kerja');
      if (RX.board.test(all)) bbmE.push('papan-putih');
      c.bbm = uniq(bbmE);
      c.assessment = focusMode === 'written' ? (RX.sheet.test(all) ? 'lembaran-kerja' : 'aktiviti-bertulis') : 'lisan';
    }
    const bbm = ['buku-teks'];
    if (/بطاقات الحروف|بطاقة حرف|بطاقات المقاطع/.test(all)) bbm.push('kad-huruf');
    if (/بطاقة|بطاقات|البطاقة|البطاقات/.test(all)) bbm.push('kad-perkataan');
    if (/صور|الصورة/.test(all)) bbm.push('txt:الصور');
    if (/فيديو/.test(all)) bbm.push('lcd-projektor', 'skrin', 'komputer-riba');
    else if (/التسجيل الصوتي|مسجل|أنشودة/.test(all)) bbm.push('komputer-riba');
    if (/ورقة العمل/.test(all)) bbm.push('lembaran-kerja');
    if (/السبورة/.test(all)) bbm.push('papan-putih');
    if (AR_) {
      c.bbm = uniq(bbm);
      c.assessment = focusMode === 'written' ? (/ورقة العمل/.test(all) ? 'lembaran-kerja' : 'aktiviti-bertulis') : 'lisan';
    }
    // KBAT hanya jika ada langkah aktiviti yang benar-benar menuntut aras itu (§35).
    c.kbat = maxKbat([...stepVerbs.filter(Boolean).map(v => (A.verbs[v] || {}).kbat), pakDef.kbat]);
    // KBAT mesti disokong oleh aktiviti sebenar (§35): turunkan aras sehingga sepadan (cth. dialog berpasangan = mengaplikasi).
    if (c.kbat && RPH.check && RPH.check.kbatFits) {
      const LADDER = ['mencipta', 'menilai', 'menganalisis', 'mengaplikasi'];
      const txt = `${all} ${c.objectives.join(' ')}`;
      const i = LADDER.slice(Math.max(0, LADDER.indexOf(c.kbat))).find(k => RPH.check.kbatFits(k, txt));
      if (i) c.kbat = i;
    }
    c.emk = 'bahasa';
    const groupWork = LAT ? RX.group.test(all) : /أزواج|مجموعة|مجموعات|زميل|تلميذين/.test(all);
    c.values = groupWork ? 'kerjasama' : 'menghargai-tradisi';
    c.strategy = c.kbat && c.kbat !== 'mengaplikasi' ? 'kemahiran-berfikir' : (LAT ? RX.fun.test(all) : /أنشودة|لعبة|ينشد|يغني/.test(all)) ? 'didik-hibur'
      : (LAT ? RX.tech.test(all) : /فيديو|التسجيل الصوتي|مسجل/.test(all)) ? 'teknologi-maklumat' : groupWork ? 'kolaboratif' : 'didik-hibur';
    c.aspirations = uniq(['pengetahuan', 'kemahiran-dwibahasa', c.kbat ? 'kemahiran-berfikir' : null, groupWork ? 'kemahiran-memimpin' : null]);
    c.tp = 'tp3';

    // Pembezaan
    const mm = metas.length ? metas[metas.length - 1] : { m: words.length || 5, unit: focusUnitKey };
    const scopeD = focusUnitKey === 'phrase' ? (theme ? fill(A.scopes.themePhrases, vars) : A.scopes.studiedPhrases)
      : focusUnitKey === 'number' ? fill(A.scopes.numbers, vars)
        : (kindAct === 'huruf' || kindAct === 'suku-kata') && Lw ? fill(A.scopes.letterWords, vars) : theme ? fill(A.scopes.themeWords, vars) : A.scopes.studiedWords;
    const low = Math.min(3, Math.max(1, mm.m)); const mid = Math.max(low, Math.round(mm.m * 0.6));
    const dv = { scope: scopeD, low: cn(low, UF), mid: cn(mid, UF) };
    const engKey = kindAct === 'huruf' && Lw ? 'letter' : focusUnitKey;
    c.differentiation = {
      pemulihan: fa(pick.one('dP', A.differentiation.pemulihan[focusMode] || A.differentiation.pemulihan.oral), dv),
      pengukuhan: fa(pick.one('dK', A.differentiation.pengukuhan[focusMode] || A.differentiation.pengukuhan.oral), dv),
      pengayaan: fa(pick.one('dY', A.differentiation.pengayaan[engKey] || A.differentiation.pengayaan.word), dv),
    };
    c.pdpr = pick.many('pdpr', A.pdpr, 3).map(t => fa(t, { unitDef: vars.mainDef }));
    c.snapshot = { lang, kindAct, theme, words, phrases, numbers, letters: uniq(letters) };
    c.suggestedStatus = /peperiksaan/.test(kindRaw) && kindRaw !== 'program-pasca-peperiksaan' ? 'peperiksaan' : ['program', 'cuti', 'program-pasca-peperiksaan'].includes(kindRaw) ? 'program' : null;
    if (useRpt && L.review) c.suggestedStatus = L.review.examInTakwim ? 'peperiksaan' : /program/.test(L.review.fromKind) && L.review.postExamInTakwim ? 'program' : null;
    return c;
  }

  // ==================================================================
  //  PENDIDIKAN ISLAM / TASMIK (Jawi)
  // ==================================================================
  function extractSurah(text) {
    const m = normJ(text).match(/سورة\s+(ال\s+عمران|آل\s+عمران|[^\s.،,()٠-٩0-9:]+)/);
    return m ? `سورة ${m[1]}` : '';
  }
  function extractHukum(text) {
    const m = normJ(text).match(/باچاءن\s+(.+?)\s+دڠن\s+بتول/);
    return m ? m[1] : '';
  }
  function ayatCount(surah) { return surah ? PH().jawi.ayatCount[surah.replace(/^سورة\s+/, '')] || null : null; }
  function stripTails(s) {
    let t = normJ(s); let prev;
    do {
      prev = t;
      t = t.replace(/\s+(دالم (صلاة دان )?كهيدوڤن (هارين|برمشاركت|برصحابت)|دالم كهيدوڤن|سچارا برادب دان استقامة|دڠن بتول دان برتجويد|دڠن بتول|دڠن سمڤورنا|(مڠيكوت )?سنة رسول الله ﷺ)$/, '').trim();
    } while (t !== prev);
    return t;
  }

  function piBidangFromSk(subjectId, year, skCode) {
    const sk = skCode && CU().sk(subjectId, year, skCode); if (!sk) return null;
    const dn = normJ((sk.domain && sk.domain.name && (sk.domain.name.jawi || sk.domain.name.ms)) || '');
    const t = normJ(sk.text);
    if (/القر/.test(dn)) return /مڠحفظ/.test(t) ? 'hafazan' : /اية يڠ مڠاندوڠي باچاءن/.test(t) ? 'tajwid' : /مڠاناليسيس|ڤڠاجرن/.test(t) ? 'kefahaman' : 'tilawah';
    if (/حديث/.test(dn)) return 'hadis';
    if (/عقيد/.test(dn)) return 'akidah';
    if (/عباد/.test(dn)) return 'ibadah';
    if (/سير/.test(dn)) return 'sirah';
    if (/ادب/.test(dn)) return 'adab';
    if (/جاوي/.test(dn)) return 'jawi';
    return null;
  }

  /** Objektif PI daripada teks SP DSKP (Jawi). Pulangkan {obj, crit, cls, mode, obj0}. */
  function piObjective(text, o) {
    const J = PH().jawi; const fill = PH().fill; const long = o.minutes >= 60;
    let t = normJ(text).replace(/[.]+$/, '').trim();
    if (t.includes(':')) t = t.slice(0, t.indexOf(':')).trim();
    t = t.replace(/["“”]/g, '').replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    let manner = '';
    const mm = t.match(/\s+(دڠن بتول دان برتجويد|دڠن بتول|دڠن سمڤورنا|دڠن قاعده يڠ بتول)$/);
    if (mm) { manner = mm[1]; t = t.slice(0, mm.index).trim(); }
    const midB = t.match(/\s+دڠن بتول(\s|$)/);
    if (midB && /^ممباچ حديث/.test(t)) { t = t.slice(0, midB.index).trim(); manner = manner || 'دڠن بتول'; }
    const vE = J.verbs.find(([v]) => t === v || t.startsWith(`${v} `));
    let verb = vE ? vE[0] : ''; const cls = vE ? vE[1] : 'explain';
    let obj = vE ? t.slice(verb.length).trim() : t;
    verb = J.verbCanon[verb] || verb;
    let extra = '';
    if (cls === 'talaqqi') { verb = 'ممباچ'; extra = 'سچارا تلقي مشافهة'; }
    const quranRead = o.cat === 'quran' && ['read', 'memorize', 'talaqqi', 'recite'].includes(cls);
    if (!manner && !['apply', 'analyse', 'formulate', 'evaluate'].includes(cls)) manner = quranRead ? 'دڠن بتول دان برتجويد' : 'دڠن بتول';
    if (/دڠن بتول|دڠن سمڤورنا/.test(obj)) manner = '';
    const first = (obj.split(' ')[0] || '').replace(/٢/g, '');
    const key = ['explain', 'state'].includes(cls) ? 'explain' : ['analyse', 'formulate', 'evaluate'].includes(cls) ? 'analyse' : cls === 'apply' ? 'apply' : 'general';
    const dedup = s => s.replace(/^(\S+?)٢/, '$1');
    const A = ayatCount(o.surah);
    let M; let objQ; let objC; let suffix = null;
    const N = m => (m <= 3 ? Math.max(1, m - 1) : target(m));
    if (['read', 'memorize', 'talaqqi', 'recite'].includes(cls) && /^سورة/.test(obj)) {
      const base = cls === 'memorize' ? (long ? 6 : 3) : (long ? 8 : 5);
      M = A ? Math.min(A, base) : base;
      objQ = `سكورڠ-كورڠڽ ${N(M)} اية ${obj}`; objC = `${N(M)} درڤد ${M} اية ${obj}`;
    } else if (cls === 'recite' && /سورة/.test(obj)) {
      M = A ? Math.min(A, long ? 6 : 3) : (long ? 6 : 3);
      objQ = `${obj} سكورڠ-كورڠڽ ${N(M)} اية`; objC = `${obj} سباڽق ${N(M)} درڤد ${M} اية`;
    } else if (/^تيكس/.test(obj)) {
      M = long ? 5 : 3; objQ = `سكورڠ-كورڠڽ ${N(M)} ايات درڤد ${obj}`; objC = `${N(M)} درڤد ${M} ايات درڤد ${obj}`;
    } else if (/^ارتي اية/.test(obj)) {
      M = A ? Math.min(A, long ? 5 : 3) : (long ? 5 : 3);
      objQ = obj.replace(/^ارتي اية/, `ارتي سكورڠ-كورڠڽ ${N(M)} اية`); objC = obj.replace(/^ارتي اية/, `ارتي ${N(M)} درڤد ${M} اية`);
    } else if (cls === 'apply' && /دالم ڤمباچاءن القرءان/.test(obj)) {
      M = long ? 5 : 3;
      objQ = obj.replace(/دالم ڤمباچاءن القرءان/, `دالم سكورڠ-كورڠڽ ${N(M)} ڤوتوڠن اية`); objC = obj.replace(/دالم ڤمباچاءن القرءان/, `دالم ${N(M)} درڤد ${M} ڤوتوڠن اية`);
    } else if ((J.countNouns[key] || []).includes(first)) {
      M = ['كلمة', 'كليمه', 'ڤركاتاءن'].includes(first) ? (o.cat === 'quran' ? (long ? 6 : 5) : (long ? 10 : 6))
        : ['ڤوتوڠن', 'اية', 'ايات'].includes(first) ? (long ? 6 : 4)
          : first === 'رڠكاي' ? (long ? 8 : 5)
            : ['كڤنتيڠن', 'كأوتاماءن', 'كسن', 'اعتبار', 'ڤڠاجرن', 'تونتوتن'].includes(first) ? 3 : (long ? 5 : 4);
      objQ = `سكورڠ-كورڠڽ ${N(M)} ${dedup(obj)}`; objC = `${N(M)} درڤد ${M} ${dedup(obj)}`;
    } else {
      suffix = ['explain', 'state', 'list'].includes(cls) ? J.suffix.explain : key === 'analyse' ? J.suffix.analyse : cls === 'apply' ? J.suffix.apply : (['read', 'write', 'build', 'identify', 'memorize', 'recite'].includes(cls) ? J.suffix.times : J.suffix.explain);
      M = suffix === J.suffix.times ? 3 : 3;
      objQ = obj; objC = obj;
    }
    const n = N(M);
    const sObj = suffix ? fill(suffix.obj, { n }) : '';
    const sCrit = suffix ? fill(suffix.crit, { nm: `${n} درڤد ${M}` }) : '';
    const join = arr => arr.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const objText = ar(`${join([verb, objQ, extra, manner, sObj])}.`);
    const critCore = ar(join([verb, objC, extra, manner, sCrit]));
    return { obj: objText, crit: critCore, cls, mode: ['write', 'build'].includes(cls) ? 'written' : 'oral', obj0: stripTails(obj), n, m: M };
  }

  const PI_SEJAHTERA = { quran: ['tekun-teliti-terampil', 'artikulasi'], jawi: ['tekun-teliti-terampil', 'eksplorasi'], akidah: ['jati-diri', 'rasional'], ibadah: ['selamat-seronok-sihat', 'tekun-teliti-terampil'], sirah: ['etika-empati', 'jati-diri'], adab: ['adab-sopan', 'jati-diri'], hadis: ['adab-sopan', 'etika-empati'], kefahaman: ['rasional', 'jati-diri'], tasmik: ['jati-diri', 'tekun-teliti-terampil'] };
  const PI_TEMA = { quran: 'bahasa-arab', khatam: 'bahasa-arab', tasmik: 'kesenian-dan-kebudayaan', jawi: 'bahasa-melayu', akidah: 'alam-sekitar', ibadah: 'kesihatan', sirah: 'sejarah', adab: 'masyarakat', hadis: 'masyarakat', kefahaman: 'bahasa-arab' };
  const KBAT_OF_CLS = { analyse: 'menganalisis', evaluate: 'menilai', formulate: 'menilai', apply: 'mengaplikasi' };
  const TP_OF_CLS = { identify: 'tp2', state: 'tp2', list: 'tp2', read: 'tp3', memorize: 'tp3', recite: 'tp3', talaqqi: 'tp3', explain: 'tp3', write: 'tp3', build: 'tp3', apply: 'tp4', analyse: 'tp4', evaluate: 'tp5', formulate: 'tp5' };

  function composePI(ctx) {
    const J = PH().jawi; const fill = PH().fill; const L = ctx.lesson || {}; const year = ctx.year; const pick = ctx.pick;
    const F = ctx.forced || {}; const input = ctx.input; const sid = ctx.subjectId;
    const c = baseContent();
    const tasmik = ctx.family === 'tasmik';
    // Bidang: dipaksa (jana semula) → input → kod SK manual → pelajaran RPT.
    const inSk = Array.isArray(F.sk || input.sk) ? (F.sk || input.sk) : null;
    const skBidang = inSk && inSk.some(x => !isTxt(x)) ? piBidangFromSk(sid, year, inSk.find(x => !isTxt(x))) : null;
    let bidang = F.subjectDomain || input.bidang || (tasmik ? 'tasmik' : (skBidang || L.bidang || piBidangOf(L)));
    if (!bidang && L.kind === 'program') bidang = 'umum';
    if (!bidang) bidang = sid === 'PIQ' ? 'khatam' : 'tilawah';
    const pack = J.bidang[bidang] || J.bidang.tilawah; const cat = pack.cat;
    c.subjectDomain = bidang === 'umum' ? '' : bidang;
    if (L.kind === 'program') c.suggestedStatus = 'program';

    if (!tasmik && !CU().get(sid, year)) ctx.warnings.push(`${NO_DATA}: DSKP Pendidikan Islam Tahun ${year || '?'} tiada.`);
    if (L.missing === 'rpt' && !tasmik) ctx.warnings.push(`${NO_DATA}: RPT Pendidikan Islam Tahun ${year || '?'} tiada.`);
    else if (L.missing === 'row') ctx.warnings.push(`${NO_DATA}: tiada pelajaran RPT bagi minggu RPT ${ctx.rptWeek ?? '?'}.`);
    if (L.kind === 'program') ctx.notes.push(`Minggu RPT ${ctx.rptWeek} ialah program sekolah (tiada PdP) — RPH ditanda status "Program Sekolah".`);

    // SK / SP
    if (tasmik) {
      c.sk = F.sk != null ? F.sk : (pack.skText || ''); c.sp = F.sp != null ? F.sp : (pack.spText || '');
      ctx.notes.push('Tasmik tiada kod DSKP; SK/SP ialah teks tetap guru (RPH MINGGU 25).');
    } else if (F.sk || F.sp || input.sk || input.sp) {
      c.sk = ((F.sk || input.sk) || []).slice(); c.sp = ((F.sp || input.sp) || []).slice();
    } else if (bidang === 'khatam') {
      c.sk = L.skText ? [`txt:${normJ(L.skText)}`] : []; c.sp = L.spText ? [`txt:${normJ(L.spText)}`] : [];
      if (!L.skText) ctx.warnings.push(`${NO_DATA}: teks SK/SP Khatam tiada dalam RPT.`);
      ctx.notes.push('Khatam al-Quran tiada kod DSKP; SK/SP ialah teks RPT (txt:).');
    } else {
      const skAll = (L.sk || []); const spAll = (L.sp || []);
      c.sk = skAll.filter(x => CU().sk(sid, year, x));
      c.sp = spAll.filter(x => CU().sp(sid, year, x) && c.sk.some(s => x.startsWith(`${s}.`)));
      const dropped = [...skAll.filter(x => !c.sk.includes(x)), ...spAll.filter(x => !c.sp.includes(x))];
      if (dropped.length) ctx.warnings.push(`Kod RPT tidak sah/di luar SK dibuang: ${dropped.join(', ')} — perlu semakan guru.`);
      // RPT menyenaraikan SK tanpa sebarang SP di bawahnya → SK itu tidak dimasukkan (tiada SP dipilih sendiri; tiada reka).
      const bare = c.sp.length ? c.sk.filter(s => !c.sp.some(x => x.startsWith(`${s}.`))) : [];
      if (bare.length) { c.sk = c.sk.filter(s => !bare.includes(s)); ctx.notes.push(`SK ${bare.join(', ')} dalam RPT tiada SP — tidak dimasukkan dalam RPH ini. Tambah SP sendiri jika SK itu diajar.`); }
      if (!c.sk.length || !c.sp.length) ctx.warnings.push(`${NO_DATA}: SK/SP tidak dapat ditentukan daripada RPT/DSKP.`);
    }

    const skItems = Array.isArray(c.sk) ? c.sk.filter(x => !isTxt(x)).map(x => CU().sk(sid, year, x)).filter(Boolean) : [];
    const spItems = Array.isArray(c.sp) ? c.sp.filter(x => !isTxt(x)).map(x => CU().sp(sid, year, x)).filter(Boolean) : [];
    const allText = [L.topic, ...skItems.map(x => x.text), ...spItems.map(x => x.text)].join(' ');
    const surah = extractSurah(L.topic || '') || extractSurah(allText);
    const hukum = extractHukum(skItems.map(x => x.text).join(' ')) || extractHukum(spItems.map(x => x.text).join(' '));

    // Tajuk (Jawi). Sumber dalam bahasa lain (tukar bahasa) → RPH.i18n.topic ke Jawi; gagal → teks asal.
    const srcT = F.topicSrc != null ? F.topicSrc : input.topic;
    let topic = F.topic != null ? F.topic : (srcT != null && RPH.i18n ? RPH.i18n.topic(srcT, 'jawi', { subjectId: sid, srcLang: U().isArabicScript(srcT) ? 'jawi' : null, topicI18n: L.topicI18n }).text : srcT);
    if (topic == null) {
      if (tasmik) topic = ((ctx.template.defaults || {}).topic) || L.topic || '';
      else if (bidang === 'khatam') { const A = ayatCount(surah); topic = surah ? (A ? `${surah} اية ١ هيڠݢ ${ar(A)}` : surah) : normJ(L.topic || ''); }
      else topic = normJ(L.topic || '');
    }
    c.topic = topic;
    // Tema & kemahiran (templat Jawi generik tpl-generic-jawi; tpl-pi-standard tiada medan ini).
    c.theme = F.theme != null ? F.theme : (input.theme || (bidang !== 'umum' ? RPH.banks.valueLabel('pi-bidang', bidang, 'jawi') : ''));
    c.skills = uniq(skItems.map(sk => sk.domain && sk.domain.name && sk.domain.name.jawi ? normJ(sk.domain.name.jawi) : null)).join('، ');
    const tajuk = normJ(topic).replace(/\s*\(اولڠكاجي\)\s*/g, ' ').replace(/^اونيت\s*\S+\s*:\s*/, '').trim();

    // Objektif & kriteria
    const long = ctx.minutes >= 60;
    const metas = [];
    if (tasmik) {
      const v = { p: ar(long ? 2 : 1), a: ar(long ? 10 : 5) };
      c.objectives = [fill(pick.one('o1', J.tasmik.obj1), v), fill(pick.one('o2', J.tasmik.obj2), v)];
      c.criteria = [fill(pick.one('c1', J.tasmik.crit), v)];
      metas.push({ cls: 'read', mode: 'oral' }, { cls: 'recite', mode: 'oral' });
    } else if (bidang === 'khatam') {
      const sName = surah || J.fallback.surah; const A = ayatCount(surah);
      const m2 = A ? Math.min(A, long ? 10 : 6) : (long ? 10 : 6);
      const v = { surah: sName, n1: ar(long ? 5 : 3), n2: ar(target(m2)), m2: ar(m2) };
      c.objectives = [fill(pick.one('o1', J.khatam.obj1), v), fill(pick.one('o2', J.khatam.obj2), v)];
      c.criteria = [fill(pick.one('c1', J.khatam.crit), v)];
      metas.push({ cls: 'talaqqi', mode: 'oral' }, { cls: 'read', mode: 'oral' });
      if (!surah) ctx.warnings.push(`${NO_DATA}: surah Khatam minggu ini tiada dalam RPT — nyatakan surah/julat ayat.`);
      else ctx.notes.push('Julat ayat Khatam bagi sesi ini perlu ditetapkan guru.');
    } else {
      const frames = pick.many('crit', J.criteria, 3);
      for (const sp of spItems.slice(0, 3)) {
        const r = piObjective(sp.text, { minutes: ctx.minutes, cat, surah });
        if (c.objectives.includes(r.obj)) continue;
        c.objectives.push(r.obj);
        c.criteria.push(fill(frames[metas.length % frames.length], { core: r.crit }));
        metas.push(r);
      }
      if (!c.objectives.length) ctx.warnings.push('Objektif tidak dapat dijana kerana tiada SP — perlu diisi guru.');
    }

    // Fokus aktiviti
    const unitJ = /رڠكاي كات/.test(allText) ? 'رڠكاي كات' : /ايات|تيكس/.test(spItems.map(x => x.text).join(' ')) ? 'ايات' : 'ڤركاتاءن';
    const fok = metas.map(x => x.obj0).filter(Boolean);
    let fokus1 = fok[0] || tajuk || J.fallback.fokus; let fokus2 = fok[1] || fokus1;
    if (bidang === 'tajwid') { fokus1 = `كلمة دان ڤوتوڠن اية يڠ مڠاندوڠي باچاءن ${hukum || J.fallback.hukum}`; fokus2 = fokus1; }
    else if (['tilawah', 'hafazan', 'khatam'].includes(bidang)) { fokus1 = surah || J.fallback.surah; fokus2 = fokus1; }
    else if (bidang === 'kefahaman') { fokus1 = surah || fokus1; fokus2 = surah || fokus2; }
    else if (tasmik) { fokus1 = 'باچاءن اقراء اتاو القرءان'; fokus2 = fokus1; }
    const vars = { surah: surah || J.fallback.surah, hukum: hukum || J.fallback.hukum, tajuk: tajuk || J.fallback.tajuk, fokus: fokus1, unitJ };
    const fj = (tpl, extra) => ar(normJ(fill(tpl, { ...vars, ...(extra || {}) })));

    // Aktiviti
    const preset = timing('pi', ctx.minutes, pick.idx('timing', 2));
    const induction = pick.many('ind', pack.induction, preset[0].length).map((t, i) => ({ text: fj(t), minutes: preset[0][i] }));
    const pakBank = id => RPH.banks.item('pak21', id);
    const sets = pack.groups.filter(g => pakBank(g.pak));
    const setsKbat = sets.filter(g => g.kbat); // KBAT lalai: utamakan set berkumpulan yang benar-benar pada aras KBAT
    const set = pick.one('grp', setsKbat.length ? setsKbat : sets.length ? sets : I_FALLBACK_GROUPS());
    const pakName = (pakBank(set.pak) || { name: set.pak }).name;
    const groupBlock = [
      { text: fj(pick.one('gi', J.groupIntro)), pak21: set.pak },
      ...['A', 'B', 'C'].map(g => ({ text: `كومڤولن ${g}: ${fj(set[g]).replace(/\.$/, '')}. (${pakName})`, minutes: 0, group: g, pak21: set.pak })),
    ];
    // Langkah aras tinggi jika SP menuntutnya (aplikasi/analisis/menilai/merumus) — menggantikan latih tubi (60′) atau semakan (30′).
    const hotsMeta = metas.find(x => ['analyse', 'evaluate', 'formulate'].includes(x.cls)) || metas.find(x => x.cls === 'apply');
    const hotsKey = hotsMeta ? (hotsMeta.cls === 'formulate' ? 'evaluate' : hotsMeta.cls) : null;
    let devPlan = preset[1].length >= 4 ? ['present', 'drill', 'groups', 'check'] : ['present', 'groups', 'check'];
    if (hotsKey) devPlan = devPlan.length >= 4 ? ['present', 'hots', 'groups', 'check'] : ['present', 'groups', 'hots'];
    const development = [];
    devPlan.forEach((step, i) => {
      const min = preset[1][i];
      if (step === 'groups') { development.push({ ...groupBlock[0], minutes: min }, ...groupBlock.slice(1)); return; }
      if (step === 'hots') { development.push({ text: fj(pick.one('hots', J.hots[hotsKey]), { fokus: stripTails(hotsMeta.obj0) }), minutes: min }); return; }
      const pool = step === 'present' ? pack.present : step === 'drill' ? pack.drill : tasmik ? [pack.check[0]] : [...(pack.check || []), ...J.check];
      development.push({ text: fj(pick.one(step, pool), { fokus: step === 'drill' ? fokus2 : fokus1 }), minutes: min });
    });
    const closure = pick.many('cl', [...(pack.closure || []), ...J.closure], preset[2].length).map((t, i) => ({ text: fj(t), minutes: preset[2][i] }));
    c.phases = { induction, development, closure };
    c.pak21 = set.pak;

    // Bank
    const all = [...induction, ...development, ...closure].map(x => x.text).join(' ');
    const bbm = [];
    if (/ۏيديو|سكرين|LCD|مماڤركن|ڤاڤرن/.test(all)) bbm.push('lcd-projektor');
    if (/(^|\s)كد(\s|$)/.test(all)) bbm.push('kad-imbasan');
    if (cat === 'quran' || /مصحف/.test(all)) bbm.push('mushaf');
    if (/باهن موجود|انق ڤاتوڠ|سيمولاسي/.test(all)) bbm.push('bahan-maujud');
    if (/بوكو تيكس/.test(all)) bbm.push('txt:بوكو تيكس');
    if (/لمبرن كرجا/.test(all)) bbm.push('txt:لمبرن كرجا');
    if (tasmik || /اقراء/.test(all)) bbm.push('txt:بوكو اقراء');
    c.bbm = uniq(bbm.length ? bbm : ['lcd-projektor']);
    const modes = metas.map(x => x.mode);
    const methods = [];
    if (modes.includes('oral') || !modes.length) methods.push('lisan', 'pemerhatian');
    if (modes.includes('written')) methods.push('penulisan');
    if (['hafazan', 'khatam', 'tasmik'].includes(bidang) || metas.some(x => ['memorize', 'recite'].includes(x.cls))) methods.push('tasmik');
    c.assessmentMethod = uniq(methods);
    const inst = [];
    if (/لمبرن كرجا/.test(all)) inst.push('lembaran-kerja');
    if (/كوءيز/.test(all)) inst.push('kuiz');
    if (/ممبنتڠكن|ڤمبنتڠن|ممڤاميركن|دهادڤن كلس/.test(all)) inst.push('pembentangan');
    if (!inst.length) inst.push(cat === 'jawi' ? 'lembaran-kerja' : 'pembentangan');
    c.assessmentInstrument = uniq(inst);
    c.learningMethod = uniq(['berasaskan-murid', 'kolaboratif', 'formatif', ['jawi', 'ibadah'].includes(bidang) ? 'kemahiran-proses' : null]);
    c.kbat = maxKbat([hotsMeta ? KBAT_OF_CLS[hotsMeta.cls] : '', set.kbat]); // hanya aras yang ada langkah aktivitinya (§35)
    // KBAT lalai (keputusan guru 2026-10-02): bacaan al-Quran bertajwid (Khatam/Tasmik/Tilawah…) = mengaplikasi hukum tajwid —
    // aras yang benar-benar dilakukan dalam aktiviti bacaan; sama seperti RPH PI asal guru (مڠاڤليكاسي). Guru boleh ubah.
    if (!c.kbat && (tasmik || cat === 'quran' || ['khatam', 'tasmik', 'tilawah', 'tajwid', 'hafazan'].includes(bidang)) && /ممباچ|باچاءن|تسميع|تلاوة|تجويد/.test(all)) {
      c.kbat = 'mengaplikasi';
      ctx.notes.push('KBAT lalai: Mengaplikasi (aktiviti bacaan bertajwid mengaplikasi hukum tajwid).');
    }
    c.emk = cat === 'ilmu' ? 'nilai-murni' : 'bahasa';
    c.tp = (metas[0] && TP_OF_CLS[metas[0].cls]) || 'tp3';
    c.sekolahkuSejahtera = pick.one('ss', PI_SEJAHTERA[tasmik ? 'tasmik' : cat === 'quran' ? 'quran' : bidang] || PI_SEJAHTERA.quran);
    c.pendekatanBertema = PI_TEMA[tasmik ? 'tasmik' : bidang] || PI_TEMA[cat] || 'bahasa-arab';
    c.values = /كومڤولن|برڤاسڠن|راكن/.test(all) ? 'kerjasama' : 'menghargai-tradisi';
    const fShort = stripTails(fokus1);
    c.differentiation = {
      pemulihan: fj(pick.one('dP', J.differentiation.pemulihan), { fokus: fShort }),
      pengukuhan: fj(pick.one('dK', J.differentiation.pengukuhan), { fokus: fShort }),
      pengayaan: fj(pick.one('dY', J.differentiation.pengayaan), { fokus: fShort }),
    };
    c.snapshot = { bidang, surah, hukum, unitJ };
    return c;
  }
  // Set kumpulan sandaran jika tiada PAK21 bank yang sepadan (tidak sepatutnya berlaku).
  function I_FALLBACK_GROUPS() { return [{ pak: 'round-robin', A: 'مڽبوت {fokus} سچارا برݢيلير.', B: 'مڽبوت {fokus} برسام راكن.', C: 'مڽبوت {fokus} دڠن بيمبيڠن ݢورو.' }]; }

  // ==================================================================
  //  PELBAGAI BAHASA (4 bahasa, keputusan guru 2026-10-02): BM ('ms'), Inggeris ('en'), Arab generik ('arg')
  //  dan Jawi generik ('jawg') bagi subjek selain Bahasa Arab (PI/PIQ/Tasmik daripada DSKP Jawi; subjek generik
  //  daripada RPT Pengurus RPT) → composeL. Bahasa Arab dalam ms/en/jawi → composeBA(ctx, lang).
  //  Kod SK/SP sahaja disimpan; teks DSKP asal tidak diubah — renderer memaparkan terjemahan RPH.i18n.std.
  // ==================================================================
  /** Kata nama bilangan Jawi (token pertama objek SP) → kunci unit (PH().en.pi.units / PH().arg.pi.units). */
  const PI_NOUN = {
    'كلمة': 'word', 'كليمه': 'word', 'ڤركاتاءن': 'word', 'ڤوتوڠن': 'segment', 'رڠكاي': 'phrase', 'ايات': 'sentence', 'اية': 'verse',
    'نام': 'name', 'تندا': 'sign', 'صيفت': 'attribute', 'الت': 'tool', 'شرط': 'condition', 'چارا': 'way', 'ادب': 'manner', 'ڤركارا': 'matter',
    'چونتوه': 'example', 'توݢس': 'duty', 'باچاءن': 'reading', 'چيري': 'characteristic', 'ڤڠاجرن': 'lesson', 'كسن': 'effect',
    'كڤنتيڠن': 'importance', 'كأوتاماءن': 'virtue', 'اعتبار': 'lesson', 'تونتوتن': 'demand', 'حكوم': 'ruling',
  };
  const QURAN_CLS = ['read', 'memorize', 'talaqqi', 'recite'];
  /**
   * Analisis SP PI (Jawi) → spesifikasi objektif bebas bahasa. Logik penghuraian = piObjective (teks Jawi
   * tidak diubah); hasil: {cls, mode, kind:'surah'|'meaning'|'text'|'applyQuran'|'count'|'suffix', unit, rest, M, n, suffix}.
   */
  function piSpec(text, o) {
    const J = PH().jawi; const long = o.minutes >= 60;
    let t = normJ(text).replace(/[.]+$/, '').trim();
    if (t.includes(':')) t = t.slice(0, t.indexOf(':')).trim();
    t = t.replace(/["“”]/g, '').replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    const mm = t.match(/\s+(دڠن بتول دان برتجويد|دڠن بتول|دڠن سمڤورنا|دڠن قاعده يڠ بتول)$/);
    if (mm) t = t.slice(0, mm.index).trim();
    const midB = t.match(/\s+دڠن بتول(\s|$)/);
    if (midB && /^ممباچ حديث/.test(t)) t = t.slice(0, midB.index).trim();
    const vE = J.verbs.find(([v]) => t === v || t.startsWith(`${v} `));
    const cls = vE ? vE[1] : 'explain';
    const obj = vE ? t.slice(vE[0].length).trim() : t;
    const A = ayatCount(o.surah);
    const N = m => (m <= 3 ? Math.max(1, m - 1) : target(m));
    const key = ['explain', 'state'].includes(cls) ? 'explain' : ['analyse', 'formulate', 'evaluate'].includes(cls) ? 'analyse' : cls === 'apply' ? 'apply' : 'general';
    const first = (obj.split(' ')[0] || '').replace(/٢/g, '');
    const out = { cls, mode: ['write', 'build'].includes(cls) ? 'written' : 'oral', obj0: stripTails(obj), surah: extractSurah(obj) || o.surah || '' };
    let M;
    if ((QURAN_CLS.includes(cls) && /^سورة/.test(obj)) || (cls === 'recite' && /سورة/.test(obj))) {
      M = cls === 'memorize' || (cls === 'recite' && !/^سورة/.test(obj)) ? (long ? 6 : 3) : (long ? 8 : 5);
      if (A) M = Math.min(A, M);
      Object.assign(out, { kind: 'surah', unit: 'verse' });
    } else if (/^تيكس/.test(obj)) {
      M = long ? 5 : 3; Object.assign(out, { kind: 'text', unit: 'sentence', rest: stripTails(obj.replace(/^تيكس\s*/, '')) });
    } else if (/^ارتي اية/.test(obj)) {
      M = A ? Math.min(A, long ? 5 : 3) : (long ? 5 : 3); Object.assign(out, { kind: 'meaning', unit: 'verse' });
    } else if (cls === 'apply' && /دالم ڤمباچاءن القرءان/.test(obj)) {
      M = long ? 5 : 3; Object.assign(out, { kind: 'applyQuran', unit: 'segment', rest: stripTails(obj.replace(/\s*دالم ڤمباچاءن القرءان/, '')) });
    } else if ((J.countNouns[key] || []).includes(first) && PI_NOUN[first]) {
      M = ['كلمة', 'كليمه', 'ڤركاتاءن'].includes(first) ? (o.cat === 'quran' ? (long ? 6 : 5) : (long ? 10 : 6))
        : ['ڤوتوڠن', 'اية', 'ايات'].includes(first) ? (long ? 6 : 4)
          : first === 'رڠكاي' ? (long ? 8 : 5)
            : ['كڤنتيڠن', 'كأوتاماءن', 'كسن', 'اعتبار', 'ڤڠاجرن', 'تونتوتن'].includes(first) ? 3 : (long ? 5 : 4);
      let rest = obj.split(' ').slice(1).join(' ');
      if (first === 'ڤوتوڠن') rest = rest.replace(/^اية\s*/, '');
      if (first === 'رڠكاي') rest = rest.replace(/^كات\s*/, '');
      Object.assign(out, { kind: 'count', unit: PI_NOUN[first], rest: stripTails(rest) });
    } else {
      const suffix = ['explain', 'state', 'list'].includes(cls) ? 'explain' : key === 'analyse' ? 'analyse' : cls === 'apply' ? 'apply' : (['read', 'write', 'build', 'identify', 'memorize', 'recite'].includes(cls) ? 'times' : 'explain');
      M = 3; Object.assign(out, { kind: 'suffix', suffix, unit: suffix === 'explain' ? 'point' : suffix === 'analyse' ? 'reason' : suffix === 'apply' ? 'practical' : 'time', rest: stripTails(obj) });
    }
    out.M = M; out.n = N(M);
    return out;
  }

  /**
   * Penjana bahasa sasaran bagi subjek selain Bahasa Arab: lang 'en' (PH().en) | 'ar' (PH().arg) | 'ms' (PH().ms) | 'jawi' (PH().jawig).
   * PI/PIQ/Tasmik (DSKP Jawi) dalam en/ar/ms; subjek generik dalam semua bahasa. Kod SK/SP sahaja disimpan; teks SK/SP
   * dipapar oleh renderer melalui RPH.i18n.std. Objektif menggunakan teks SP terjemahan jika ada (bukan rujukan kod);
   * tanpa terjemahan → petikan «Jawi» (PI) atau rujukan kod (generik). Tajuk/tema/kemahiran melalui RPH.i18n.
   */
  function composeL(ctx, lang) {
    const EN = lang === 'en'; const AR_ = lang === 'ar'; const MSL = lang === 'ms'; const JW_ = lang === 'jawi';
    const LAT = EN || MSL; const DIG = AR_ || JW_;
    const P = EN ? PH().en : AR_ ? PH().arg : MSL ? PH().ms : PH().jawig;
    const I = RPH.i18n; const fill = PH().fill; const L = ctx.lesson || {}; const pick = ctx.pick;
    const F = ctx.forced || {}; const input = ctx.input; const sid = ctx.subjectId; const year = ctx.year;
    const c = baseContent();
    const subj = ctx.subject || {};
    const tasmik = sid === 'TASMIK';
    const isPI = !tasmik && (['PI', 'PIQ'].includes(sid) || subj.script === 'jawi');
    const PP = P.pi || PH().en.pi;
    const T = ctx.female ? P.teacher.f : P.teacher.m;
    const arFix = s => (AR_ ? PH().arg.pi.arFix.reduce((x, [re, to]) => x.replace(re, to), String(s)) : String(s));
    /** Petikan teks yang tidak dalam bahasa sasaran: Arab → sentiasa «…» (gaya sedia ada); lain → hanya jika skrip berbeza. */
    const q = s => {
      const t = String(s || '').trim(); if (!t) return '';
      if (AR_) return `«${arFix(t)}»`;
      const arab = U().isArabicScript(t);
      return (LAT && arab) || (JW_ && !arab) ? `«${t}»` : t;
    };
    const NUM = DIG ? ar : (n => String(n));
    const cnt = (n, key) => {
      const u = PP.units[key] || PH().en.pi.units[key];
      if (LAT || JW_) return n === 1 ? `1 ${u[0]}` : `${n} ${u[1]}`;
      return countNoun(n, { one: u[0], dual: u[1], pl: u[2], acc1: u[3] });
    };
    const unitPl = (m, key) => { const u = PP.units[key] || PH().en.pi.units[key]; return AR_ ? (m > 10 ? u[3] : u[2]) : u[1]; };
    const fx = (tpl, extra) => { const s = fill(tpl, { T, ...vars, ...(extra || {}) }, { female: ctx.female }); return DIG ? ar(s) : s; };
    const lc = s => (LAT ? s.charAt(0).toLowerCase() + s.slice(1) : s);
    let vars = {};

    // ---- Bidang (PI) ----
    let bidang = null;
    if (isPI || tasmik) {
      const inSk = Array.isArray(F.sk || input.sk) ? (F.sk || input.sk) : null;
      const skBidang = isPI && inSk && inSk.some(x => !isTxt(x)) ? piBidangFromSk(sid, year, inSk.find(x => !isTxt(x))) : null;
      bidang = F.subjectDomain || input.bidang || (tasmik ? 'tasmik' : (skBidang || L.bidang || piBidangOf(L)));
      if (!bidang && L.kind === 'program') bidang = 'umum';
      if (!bidang) bidang = sid === 'PIQ' ? 'khatam' : 'tilawah';
      c.subjectDomain = bidang === 'umum' ? '' : bidang;
      if (L.kind === 'program') { c.suggestedStatus = 'program'; ctx.notes.push(`Minggu RPT ${ctx.rptWeek} ialah program sekolah (tiada PdP) — RPH ditanda status "Program Sekolah".`); }
    }
    const pack = bidang ? (PH().jawi.bidang[bidang] || PH().jawi.bidang.tilawah) : null;
    const cat = tasmik ? 'quran' : pack ? pack.cat : 'generic';

    // ---- SK / SP (DSKP sahaja; tiada reka) ----
    const manual = F.sk || F.sp || input.sk || input.sp;
    const validSk = x => isTxt(x) || CU().sk(sid, year, x) || !CU().get(sid, year);
    const validSp = x => isTxt(x) || CU().sp(sid, year, x) || !CU().get(sid, year);
    if (tasmik) {
      c.sk = []; c.sp = [];
      ctx.notes.push('Tasmik tiada kod DSKP; SK/SP diisi guru (templat Tasmik Jawi menyimpan teks tetap guru).');
    } else if (manual) {
      c.sk = ((F.sk || input.sk) || []).filter(validSk); c.sp = ((F.sp || input.sp) || []).filter(validSp);
    } else if (isPI && bidang === 'khatam') {
      c.sk = L.skText ? [`txt:${normJ(L.skText)}`] : []; c.sp = L.spText ? [`txt:${normJ(L.spText)}`] : [];
      if (!L.skText) ctx.warnings.push(`${NO_DATA}: teks SK/SP Khatam tiada dalam RPT.`);
      ctx.notes.push('Khatam al-Quran tiada kod DSKP; SK/SP ialah teks RPT (txt:).');
    } else if (isPI) {
      const skAll = L.sk || []; const spAll = L.sp || [];
      c.sk = skAll.filter(x => CU().sk(sid, year, x));
      c.sp = spAll.filter(x => CU().sp(sid, year, x) && c.sk.some(s => x.startsWith(`${s}.`)));
      const dropped = [...skAll.filter(x => !c.sk.includes(x)), ...spAll.filter(x => !c.sp.includes(x))];
      if (dropped.length) ctx.warnings.push(`Kod RPT tidak sah/di luar SK dibuang: ${dropped.join(', ')} — perlu semakan guru.`);
      // RPT menyenaraikan SK tanpa sebarang SP di bawahnya → SK itu tidak dimasukkan (tiada SP dipilih sendiri; tiada reka).
      const bare = c.sp.length ? c.sk.filter(s => !c.sp.some(x => x.startsWith(`${s}.`))) : [];
      if (bare.length) { c.sk = c.sk.filter(s => !bare.includes(s)); ctx.notes.push(`SK ${bare.join(', ')} dalam RPT tiada SP — tidak dimasukkan dalam RPH ini. Tambah SP sendiri jika SK itu diajar.`); }
    } else {
      c.sk = (L.sk || []).filter(validSk); c.sp = (L.sp || []).filter(validSp);
    }
    if (!tasmik && L.kind !== 'program' && (!c.sk.length || !c.sp.length)) ctx.warnings.push(`${NO_DATA}: SK/SP tidak dapat ditentukan (tiada RPT/DSKP bagi subjek ini).`);
    if (isPI && !CU().get(sid, year)) ctx.warnings.push(`${NO_DATA}: DSKP Pendidikan Islam Tahun ${year || '?'} tiada.`);
    const skItems = c.sk.filter(x => !isTxt(x)).map(x => CU().sk(sid, year, x)).filter(Boolean);
    const spItems = c.sp.filter(x => !isTxt(x)).map(x => CU().sp(sid, year, x)).filter(Boolean);
    const allText = [L.topic, ...skItems.map(x => x.text), ...spItems.map(x => x.text)].join(' ');
    const surahJ = isPI ? (extractSurah(L.topic || '') || extractSurah(allText)) : '';
    const hukumJ = isPI ? (extractHukum(skItems.map(x => x.text).join(' ')) || extractHukum(spItems.map(x => x.text).join(' '))) : '';
    const nAyat = ayatCount(surahJ);
    /** Nama surah dalam bahasa sasaran (RPH.i18n.surah; Arab: ejaan Arab). */
    const surahOf = x => { if (!x) return ''; if (AR_) return arFix(x); const r = I ? I.surah(x, lang) : null; return r && r.translated ? r.text : q(x); };
    const surahName = surahOf(surahJ);
    const surahV = surahName || PP.fallback.surah;
    /** Hukum tajwid: istilah terjemahan (leksikon) atau petikan. */
    const hukumOf = x => { const r = I ? I.topic(x, lang, { subjectId: sid, srcLang: 'jawi' }) : null; return r && r.translated ? r.text : q(x); };
    const hukumV = hukumJ ? hukumOf(hukumJ) : PP.fallback.hukum;

    // ---- Tajuk & tema ----
    const nat = I ? I.nativeLang(sid, year) : 'ms';
    const srcLangOf = t => (U().isArabicScript(t) ? (isPI || tasmik || subj.script === 'jawi' ? 'jawi' : 'ar') : (U().isArabicScript(String(t)) ? null : (nat === 'ar' || nat === 'jawi' ? null : nat)));
    const trTopic = t => {
      if (t == null || t === '' || !I) return { text: t, translated: false };
      return I.topic(t, lang, { subjectId: sid, srcLang: srcLangOf(t), topicI18n: L.topicI18n });
    };
    let topicTr = { translated: false };
    let topic = F.topic != null ? F.topic : null;
    if (topic == null) {
      const src = F.topicSrc != null ? F.topicSrc : input.topic;
      if (src != null) { topicTr = trTopic(src); topic = topicTr.text; }
    }
    if (topic == null) {
      if (tasmik) topic = PP.topicTasmik;
      else if (bidang === 'khatam') topic = surahJ ? (nAyat ? fill(PP.topicKhatam, { surah: surahName, a: NUM(nAyat), a1: NUM(1) }) : surahName) : (() => { topicTr = trTopic(normJ(L.topic || '')); return topicTr.text; })();
      else { topicTr = trTopic(isPI ? normJ(L.topic || '') : (L.topic || '')); topic = topicTr.text; }
      if (tasmik || (bidang === 'khatam' && surahJ)) topicTr = { translated: true };
    }
    c.topic = topic || '';
    const bankLang = EN ? 'en' : AR_ ? 'arg' : MSL ? 'ms' : 'jawi';
    const themeLabel = bidang && bidang !== 'umum' ? RPH.banks.valueLabel('pi-bidang', bidang, bankLang) : '';
    const themeIn = F.theme != null ? F.theme : (input.theme || '');
    if (themeIn) c.theme = themeIn;
    else if (L.theme) { const tt = trTopic(L.theme); c.theme = tt.text || ''; }
    else c.theme = themeLabel || '';
    /** Kemahiran fokus = nama domain SK dalam bahasa sasaran (diabaikan jika tiada terjemahan & skrip berbeza). */
    c.skills = uniq(skItems.map(sk => {
      const code = sk.domain && sk.domain.code;
      if (I && code != null) { const d = I.domain(sid, year, code, lang); return d.text && (d.translated || I.inScript(d.text, lang)) ? d.text : null; }
      return sk.domain && sk.domain.name && sk.domain.name[EN ? 'en' : AR_ ? 'ar' : lang];
    })).join(DIG ? '، ' : ', ');

    // ---- Objektif & kriteria ----
    const long = ctx.minutes >= 60;
    const topicClean = String(c.topic || '').replace(/\s*\((?:اولڠكاجي|Ulang Kaji|Revision|مراجعة)\)\s*/gi, ' ').trim();
    const topik = topicClean ? q(topicClean) : P.fallback.topik;
    const metas = [];
    vars = { topik, surah: surahV, hukum: hukumV };
    const critFrames = pick.many('crit', P.criteriaCore, 3);
    /** Teks SP dalam bahasa sasaran sebagai frasa kata kerja (null jika tiada terjemahan yang sesuai). */
    const spPhrase = (sp, allowNative) => {
      if (!I) return null;
      const st = I.std(sid, year, sp.code, lang);
      if (!st.text || !(st.translated || (allowNative && st.native))) return null;
      if (!I.inScript(st.text, lang)) return null;
      let t = String(st.text).replace(/[.。]+\s*$/, '').trim();
      if (P.spLead) t = t.replace(P.spLead, '').trim();
      return t ? lc(t) : null;
    };
    if (tasmik) {
      const p = long ? 2 : 1; const a = long ? 10 : 5;
      const v = { p: cnt(p, 'page'), a: cnt(a, 'verse') };
      c.objectives = [fx(pick.one('o1', PP.tasmik.obj1), v), fx(pick.one('o2', PP.tasmik.obj2), v)];
      c.criteria = [fx(pick.one('c1', PP.tasmik.crit), v)];
      metas.push({ cls: 'read', mode: 'oral' }, { cls: 'recite', mode: 'oral' });
    } else if (bidang === 'khatam') {
      const m2 = nAyat ? Math.min(nAyat, long ? 10 : 6) : (long ? 10 : 6);
      const v = { c1: cnt(long ? 5 : 3, 'verse'), c2: cnt(target(m2), 'verse'), n2: NUM(target(m2)), m2: NUM(m2), unitPl: unitPl(m2, 'verse') };
      c.objectives = [fx(pick.one('o1', PP.khatam.obj1), v), fx(pick.one('o2', PP.khatam.obj2), v)];
      c.criteria = [fx(pick.one('c1', PP.khatam.crit), v)];
      metas.push({ cls: 'talaqqi', mode: 'oral' }, { cls: 'read', mode: 'oral' });
      if (!surahJ) ctx.warnings.push(`${NO_DATA}: surah Khatam minggu ini tiada dalam RPT — nyatakan surah/julat ayat.`);
      else ctx.notes.push('Julat ayat Khatam bagi sesi ini perlu ditetapkan guru.');
    } else if (isPI) {
      for (const sp of spItems.slice(0, 3)) {
        const r = piSpec(sp.text, { minutes: ctx.minutes, cat, surah: surahJ });
        const verb = AR_ ? (PP.verb[r.cls] || PP.verb.explain) : (PP.verb[r.cls] || PP.verb.explain || 'explain');
        const vn = AR_ ? verb[0] : verb; const adv = AR_ ? verb[1] : '';
        const rSurah = r.surah ? surahOf(r.surah) : surahV;
        const rest = r.rest || '';
        const cont = rest.match(/^(دان ڤوتوڠن اية\s+)?يڠ مڠاندوڠي (?:باچاءن|حكوم) (.+)$/);
        // Objek berupa bacaan/hafazan surah → nama surah dalam bahasa sasaran (bukan petikan Jawi).
        const sRead = rest.match(/^باچاءن (سورة .+)$/); const sHafaz = rest.match(/^(سورة .+) يڠ دحفظ$/);
        const restQ = cont ? fill(cont[1] ? PP.containingSeg : PP.containing, { x: hukumOf(cont[2]) })
          : sRead ? fill(PP.surahRecitation, { surah: surahOf(sRead[1]) })
            : sHafaz ? fill(PP.surahMemorised, { surah: surahOf(sHafaz[1]) }) : q(rest);
        const base = { verb: vn, vn, adv, c: cnt(r.n, r.unit), n: NUM(r.n), m: NUM(r.M), unitPl: unitPl(r.M, r.unit), surah: rSurah, hukum: hukumV, rest: restQ, ha: r.n === 2 ? 'هما' : 'ها' };
        // Teks SP terjemahan → objektif daripada SP itu sendiri (bagi jenis yang objeknya teks Jawi bebas).
        const spT = ['count', 'text', 'suffix'].includes(r.kind) && !(r.kind === 'count' && (cont || sRead || sHafaz)) ? spPhrase(sp, false) : null;
        let objT, critT;
        if (spT && PP.spObj) {
          const key = r.kind === 'suffix' ? r.suffix : 'count';
          const uKey = r.kind === 'suffix' ? r.unit : r.unit;
          Object.assign(base, { sp: spT, c: cnt(r.n, uKey), unitPl: unitPl(r.M, uKey) });
          objT = PP.spObj[key] || PP.spObj.count; critT = PP.spCrit[key] || PP.spCrit.count;
        } else if (r.kind === 'surah') { objT = PP.surah[r.cls] || PP.surah.read; critT = PP.surah.crit; }
        else if (r.kind === 'meaning') { objT = PP.meaning.obj; critT = PP.meaning.crit; }
        else if (r.kind === 'text') { objT = PP.text.obj; critT = PP.text.crit; base.rest = rest ? q(rest) : ''; }
        else if (r.kind === 'applyQuran') { objT = PP.applyQuran.obj; critT = PP.applyQuran.crit; if (!hukumJ && rest) base.hukum = hukumOf(rest); }
        else if (r.kind === 'count') { objT = PP.count.obj; critT = PP.count.crit; base.of = cont || !rest || /^يڠ\s/.test(rest) ? '' : (PP.of[r.unit] || PP.of._); }
        else { objT = PP.suffix[r.suffix].obj; critT = PP.suffix[r.suffix].crit; }
        if (!spT && r.kind === 'count' && cont) { base.rest = restQ; }
        const obj = `${fx(objT, base)}.`.replace(/\s+\./, '.').replace(/\.\.$/, '.');
        if (c.objectives.includes(obj)) continue;
        c.objectives.push(obj);
        const core = fill(critT, base, { female: ctx.female });
        c.criteria.push(fx(critFrames[metas.length % critFrames.length], { core }));
        metas.push({ cls: r.cls, mode: r.mode, focus: r.kind === 'surah' || r.kind === 'meaning' ? rSurah : (spT && topicTr.translated ? topik : (r.rest ? q(r.rest) : topik)) });
      }
    } else {
      // Subjek generik: SP dalam bahasa templat (terjemahan RPH.i18n atau teks DSKP yang memang dalam bahasa itu);
      // selainnya dirujuk melalui kod (teks DSKP dipapar dalam medan SP).
      const frames = pick.many('crit', P.criteria, 3);
      const isEnText = s => /[A-Za-z]/.test(s) && !U().isArabicScript(s) && !/\b(dan|yang|dengan|untuk|serta|daripada|kepada|dalam|secara|murid)\b/i.test(s) && !/^(me|mem|men|meng|meny|ber)[a-z]+\b/i.test(s);
      for (const [i, sp] of spItems.slice(0, 3).entries()) {
        const spText = String(sp.text || '').replace(/[.]+$/, '').trim();
        let task = spPhrase(sp, false);
        if (!task) {
          const sameScript = I ? I.inScript(spText, lang) : !U().isArabicScript(spText);
          if (EN && isEnText(spText)) task = lc(spText);
          else if (MSL && sameScript && !isEnText(spText)) task = lc(spText);
          else if ((AR_ && nat === 'ar') || (JW_ && nat === 'jawi')) task = spText.replace(P.spLead || /^$/, '');
        }
        if (!task) task = fill(P.taskByCode, { code: sp.displayCode || sp.code });
        const m = long ? 5 : 4; const n = target(m);
        const v = { task, n: NUM(n), m: NUM(m), topik };
        c.objectives.push(fx(pick.one(`o${i}`, P.objective), v));
        c.criteria.push(fx(frames[i % frames.length], v));
        metas.push({ cls: 'explain', mode: P.rx && P.rx.written && P.rx.written.test(task) ? 'written' : 'oral', focus: topik });
      }
      if (!c.objectives.length && c.topic) c.objectives.push(fx(P.objectiveFallback[0], { n: NUM(3), topik }));
    }
    if (!c.objectives.length) ctx.warnings.push('Objektif tidak dapat dijana kerana tiada SP — perlu diisi guru.');

    // ---- Aktiviti ----
    const Q = cat === 'quran';
    const pool = Q ? P.quran : P;
    let fokus = topik;
    if (tasmik) fokus = PP.focusTasmik;
    else if (bidang === 'tajwid') fokus = fill(PP.focusTajwid, { hukum: hukumV });
    else if (['tilawah', 'hafazan', 'khatam', 'kefahaman'].includes(bidang)) fokus = surahName || (metas[0] && metas[0].focus) || topik;
    else if (isPI && !c.topic && metas.length && metas[0].focus) fokus = metas[0].focus;
    if (!c.topic && !isPI && !tasmik) fokus = P.fallback.fokus;
    vars = { topik, fokus, surah: surahV, hukum: hukumV };
    const preset = timing('ms', ctx.minutes, pick.idx('timing', 2));
    const induction = pick.many('ind', pool.induction, preset[0].length).map((t, i) => ({ text: fx(t), minutes: preset[0][i] }));
    const pakItem = id => RPH.banks.item('pak21', id);
    // Set yang menyebut hukum tajwid hanya jika hukum diketahui (cth. bukan Tasmik/Khatam).
    const sets = pool.groups.filter(g => pakItem(g.pak) && (hukumJ || !/\{hukum\}/.test(`${g.A} ${g.B} ${g.C}`)));
    // Objektif bertulis → utamakan set yang tugasannya menulis (aktiviti selari dengan objektif, §70).
    const WR = (P.rx && P.rx.written) || /\bwrit|\bcop(?:y|ies)\b/i;
    const setsW = metas.some(x => x.mode === 'written') ? sets.filter(g => WR.test(`${g.A} ${g.B} ${g.C}`)) : [];
    const base0 = setsW.length ? setsW : sets;
    const setsK = base0.filter(g => g.kbat); // KBAT lalai: utamakan set yang tugasan A-nya benar-benar pada aras KBAT
    const set = pick.one('grp', setsK.length ? setsK : base0);
    const it = pakItem(set.pak) || { name: set.pak };
    const pakName = EN ? (it.en || it.name) : it.name;
    const hotsMeta = metas.find(x => ['analyse', 'evaluate', 'formulate'].includes(x.cls)) || metas.find(x => x.cls === 'apply');
    const hotsKey = hotsMeta ? (hotsMeta.cls === 'formulate' ? 'evaluate' : hotsMeta.cls) : null;
    let devPlan = preset[1].length >= 4 ? ['present', 'drill', 'groups', 'check'] : ['present', 'groups', 'check'];
    if (hotsKey) devPlan = devPlan.length >= 4 ? ['present', 'hots', 'groups', 'check'] : ['present', 'groups', 'hots'];
    const development = [];
    const GL = g => (AR_ ? `${P.groupWord} (${P.groupLetter[g]})` : EN ? `Group ${g}` : `${P.groupWord} ${g}`);
    devPlan.forEach((step, i) => {
      const min = preset[1][i];
      if (step === 'groups') {
        development.push({ text: fx(pick.one('gi', P.groupIntro)), minutes: min, pak21: set.pak });
        for (const g of ['A', 'B', 'C']) development.push({ text: `${GL(g)}: ${fx(set[g]).replace(/\.$/, '')}. (${pakName})`, minutes: 0, group: g, pak21: set.pak });
        return;
      }
      if (step === 'hots') { development.push({ text: fx(pick.one('hots', P.hots[hotsKey]), { fokus: hotsMeta.focus || fokus }), minutes: min }); return; }
      development.push({ text: fx(pick.one(step, pool[step])), minutes: min });
    });
    const closure = pick.many('cl', pool.closure, preset[2].length).map((t, i) => ({ text: fx(t), minutes: preset[2][i] }));
    c.phases = { induction, development, closure };
    c.pak21 = set.pak;

    // ---- Bank ----
    const all = [...induction, ...development, ...closure].map(x => x.text).join(' ');
    const RX = P.rx || PH().en.rx;
    const bbm = Q ? [] : ['buku-teks'];
    if (RX.video.test(all)) bbm.push('lcd-projektor');
    if (RX.cards.test(all)) bbm.push('kad-imbasan');
    if (Q || RX.mushaf.test(all)) bbm.push('mushaf');
    if (RX.pics.test(all)) bbm.push('gambar');
    if (RX.board.test(all)) bbm.push('papan-putih');
    if (RX.sheet.test(all)) bbm.push('lembaran-kerja');
    c.bbm = uniq(bbm.length ? bbm : ['buku-teks']);
    const modes = metas.map(x => x.mode);
    const assess = [];
    if (modes.includes('oral') || !modes.length) assess.push('lisan', 'pemerhatian');
    if (modes.includes('written')) assess.push('penulisan');
    if (tasmik || ['hafazan', 'khatam'].includes(bidang) || metas.some(x => ['memorize', 'recite'].includes(x.cls))) assess.push('tasmik');
    if (RX.sheet.test(all) || modes.includes('written')) assess.push('lembaran-kerja');
    else if (RX.quiz.test(all)) assess.push('kuiz');
    else if (RX.present.test(all)) assess.push('pembentangan');
    c.assessment = uniq(assess);
    c.assessmentMethod = c.assessment.filter(x => ['lisan', 'penulisan', 'pemerhatian', 'tasmik'].includes(x));
    c.assessmentInstrument = c.assessment.filter(x => !['lisan', 'penulisan', 'pemerhatian', 'tasmik'].includes(x));
    c.kbat = maxKbat([hotsMeta ? KBAT_OF_CLS[hotsMeta.cls] : '', set.kbat]); // hanya aras yang ada langkah aktivitinya (§35)
    if (!c.kbat && Q) { c.kbat = 'mengaplikasi'; ctx.notes.push('KBAT lalai: Mengaplikasi (aktiviti bacaan bertajwid mengaplikasi hukum tajwid).'); }
    c.emk = isPI && cat === 'ilmu' ? 'nilai-murni' : 'bahasa';
    c.values = RX.group.test(all) ? 'kerjasama' : 'menghargai-tradisi';
    c.tp = (isPI && metas[0] && TP_OF_CLS[metas[0].cls]) || 'tp3';
    if (isPI) {
      c.sekolahkuSejahtera = pick.one('ss', PI_SEJAHTERA[tasmik ? 'tasmik' : cat === 'quran' ? 'quran' : bidang] || PI_SEJAHTERA.quran);
      c.pendekatanBertema = PI_TEMA[tasmik ? 'tasmik' : bidang] || PI_TEMA[cat] || 'bahasa-arab';
      c.learningMethod = uniq(['berasaskan-murid', 'kolaboratif', 'formatif', ['jawi', 'ibadah'].includes(bidang) ? 'kemahiran-proses' : null]);
    }
    const D = pool.differentiation || P.differentiation;
    c.differentiation = {
      pemulihan: fx(pick.one('dP', D.pemulihan)),
      pengukuhan: fx(pick.one('dK', D.pengukuhan)),
      pengayaan: fx(pick.one('dY', D.pengayaan)),
    };
    c.snapshot = { lang, bidang, surah: surahJ, hukum: hukumJ, cat, topicTranslated: !!topicTr.translated };
    return c;
  }

  function baseContent() {
    return { sk: [], sp: [], theme: '', topic: '', textbookUnit: '', skills: '', objectives: [], criteria: [], phases: { induction: [], development: [], closure: [] }, pak21: '', bbm: [], kbat: '', emk: '', values: '', assessment: '', assessmentMethod: [], assessmentInstrument: [], strategy: '', aspirations: [], learningMethod: [], tp: '', sekolahkuSejahtera: '', pendekatanBertema: '', differentiation: { pemulihan: '', pengukuhan: '', pengayaan: '' }, pdpr: [], subjectDomain: '', snapshot: {} };
  }
  function compose(ctx) {
    const ba = isArabicSubject(ctx.subjectId);
    if (ctx.family === 'ba') return composeBA(ctx, 'ar');
    if (ctx.family === 'pi' || ctx.family === 'tasmik') return composePI(ctx);
    if (ctx.family === 'en') return ba ? composeBA(ctx, 'en') : composeL(ctx, 'en');
    if (ctx.family === 'arg') return composeL(ctx, 'ar');
    if (ctx.family === 'jawg') return ba ? composeBA(ctx, 'jawi') : composeL(ctx, 'jawi');
    // 'ms': punca pepijat SK kosong (BA pada tpl-generic-kpm) — penjana Rumi lama membaca L.sk, sedangkan pelajaran
    // RPT BA hanya membawa skCandidates/spCandidates; kini BA dalam BM melalui composeBA (chooseBaCodes).
    return ba ? composeBA(ctx, 'ms') : composeL(ctx, 'ms');
  }

  // ------------------------------------------------------------------
  // Pemetaan kandungan → nilai medan templat
  // ------------------------------------------------------------------
  function reflectionInit(ctx, f) {
    const lines = {};
    for (const l of f.lines || []) lines[l.id] = l.id !== 'carryForward';
    // Bilangan murid lalai (Tetapan → Bilangan Murid): berjaya = % lalai (70%), tidak berjaya = baki, tidak hadir = 0.
    const d = S().defaultReflection ? S().defaultReflection({ subjectId: ctx.subjectId, year: ctx.year, classId: ctx.slot && ctx.slot.classId }) : null;
    if (d) return { ...d, postponed: false, carryWeek: null, lines };
    return { total: ctx.cls && ctx.cls.enrolment != null ? ctx.cls.enrolment : null, achieved: null, notAchieved: null, absent: null, postponed: false, carryWeek: null, lines };
  }
  /** Id bank yang dibenarkan oleh filter medan (ids / group); null = tiada had. */
  function allowedIds(f) {
    if (!f.filter) return null;
    if (f.filter.ids) return f.filter.ids.slice();
    if (f.filter.group && f.bank) return RPH.banks.items(f.bank, { group: f.filter.group }).map(x => x.id);
    return null;
  }
  /** Nama subjek ikut bahasa templat: name[lang] → subjectNames templat → leksikon → name.ms (templat Rumi kekal name.ms). */
  function subjectNameFor(subject, subjectId, t, f) {
    const n = (subject && subject.name) || {};
    const lang = t && t.labelLang;
    if (lang === 'en' || lang === 'ar' || lang === 'jawi') {
      const own = n[lang] || ((f && f.subjectNames) || {})[subjectId];
      if (own) return own;
      const tr = n.ms && RPH.i18n ? RPH.i18n.term(n.ms, lang) : null;
      return (tr && tr.translated ? tr.text : '') || n.ms || subjectId || '';
    }
    return n.ms || subjectId || '';
  }
  function toValues(ctx, c) {
    const v = {}; const t = ctx.template; const fill = PH().fill;
    const range = U().timeRange(ctx.slot.start, ctx.slot.end);
    const session = ctx.slot.start ? U().session(ctx.slot.start) : '';
    for (const f of t.fields || []) {
      const k = f.key;
      switch (f.type) {
        case 'static': break;
        case 'subject-line': v[k] = fill(f.valueTemplate || '{subject}', { yearOrdinalAr: (f.yearOrdinalAr || {})[ctx.year] || ar(ctx.year || ''), subject: (ctx.subject.name || {}).ar || (ctx.subject.name || {}).ms || '' }); break;
        case 'subject': v[k] = subjectNameFor(ctx.subject, ctx.subjectId, t, f); break;
        case 'week': v[k] = ctx.week != null ? String(ctx.week) : ''; break;
        case 'date': v[k] = U().fmtDate(ctx.date, f.dateFormat || 'DD/MM/YYYY'); break;
        case 'day': v[k] = f.dayOptions ? f.dayOptions[ctx.dow] : t.labelLang === 'ar' ? U().dayNameAr(ctx.dow) : t.labelLang === 'jawi' ? U().dayNameJawi(ctx.dow) : t.labelLang === 'en' ? U().dayNameEn(ctx.dow) : U().dayNameMs(ctx.dow); break;
        case 'class': v[k] = ctx.slot.className || (ctx.cls && ctx.cls.name) || ctx.slot.classId || ''; break;
        case 'time-range': v[k] = f.sessionOptions && session ? `${range} ${session}` : range; break;
        case 'term-week': v[k] = `${ctx.term != null ? ctx.term : ''} / ${ctx.week != null ? ctx.week : ''}`; break;
        case 'day-date': v[k] = `${(f.dayOptions || [])[ctx.dow] || U().dayNameJawi(ctx.dow)} / ${U().fmtDate(ctx.date, f.dateFormat || 'DD/MM/YYYY')}`; break;
        case 'subject-domain': v[k] = c.subjectDomain || ''; break;
        case 'theme-select': v[k] = c.theme || ''; break;
        case 'sk-select': v[k] = Array.isArray(c.sk) ? c.sk.slice() : []; break;
        case 'sp-select': v[k] = Array.isArray(c.sp) ? c.sp.slice() : []; break;
        case 'list': v[k] = k === 'objectives' ? c.objectives.slice() : k === 'successCriteria' ? c.criteria.slice() : k === 'pdpr' ? c.pdpr.slice() : []; break;
        case 'activity-phases': v[k] = U().clone(c.phases); break;
        case 'activity-list': v[k] = U().clone(c.phases[f.phase] || []); break;
        case 'differentiation': v[k] = { ...c.differentiation }; break;
        case 'reflection': v[k] = reflectionInit(ctx, f); break;
        case 'postponement': v[k] = f.defaultValue || ''; break;
        case 'tasmik-detail': v[k] = []; break;
        case 'text':
          if (k === 'topic') v[k] = c.topic || '';
          else if (k === 'textbookUnit') v[k] = c.textbookUnit || '';
          else if (k === 'contentStandards') v[k] = Array.isArray(c.sk) ? c.sk.join('\n') : (c.sk || '');
          else if (k === 'learningStandards') v[k] = Array.isArray(c.sp) ? c.sp.join('\n') : (c.sp || '');
          else if (k === 'theme') v[k] = c.theme || '';
          else if (k === 'skills') v[k] = c.skills || f.defaultValue || '';
          else v[k] = f.defaultValue || '';
          break;
        case 'select':
          if (k === 'skills') { const opt = c.skills; v[k] = !opt ? '' : (f.options || []).includes(opt) ? opt : `txt:${opt}`; }
          else v[k] = c[k] != null && !Array.isArray(c[k]) ? c[k] : (Array.isArray(c[k]) ? (c[k][0] || '') : (f.defaultValue || ''));
          break;
        case 'checkbox': case 'multi-select': {
          let arr = Array.isArray(c[k]) ? c[k].slice() : (c[k] ? [c[k]] : []);
          const allowed = allowedIds(f);
          if (allowed) arr = arr.filter(x => (isTxt(x) ? !!f.allowOther : allowed.includes(x)));
          v[k] = arr; break;
        }
        default: v[k] = c[k] != null ? U().clone(c[k]) : (f.defaultValue || '');
      }
    }
    return v;
  }

  function provenance(ctx, c) {
    const codes = [...(Array.isArray(c.sk) ? c.sk : []), ...(Array.isArray(c.sp) ? c.sp : [])].filter(x => !isTxt(x));
    const out = codes.length ? CU().provenanceFor(ctx.subjectId, ctx.year, codes) : [];
    const L = ctx.lesson || {};
    const txt = [...(Array.isArray(c.sk) ? c.sk.filter(isTxt).map(() => 'SK') : []), ...(Array.isArray(c.sp) ? c.sp.filter(isTxt).map(() => 'SP') : [])];
    for (const kind of txt) out.push({ code: null, kind, source: 'RPT', file: L.rptFile || null, pdfPage: null, printedPage: null, note: 'teks RPT (tiada kod DSKP)' });
    if (ctx.family === 'tasmik') out.push({ code: null, kind: 'SK', source: 'RPH guru (teks tetap Tasmik)', file: 'MINGGU 25.pdf', pdfPage: 9, printedPage: null }, { code: null, kind: 'SP', source: 'RPH guru (teks tetap Tasmik)', file: 'MINGGU 25.pdf', pdfPage: 9, printedPage: null });
    return out;
  }

  function lessonSnapshot(L) {
    if (!L) return null;
    const keep = ['subjectId', 'year', 'schoolWeek', 'rptWeek', 'position', 'positionCount', 'source', 'rptId', 'rptFile', 'kind', 'theme', 'unit', 'content', 'note', 'skCandidates', 'spCandidates', 'occurrence', 'review', 'bidangId', 'bidang', 'strand', 'topic', 'sk', 'sp', 'skText', 'spText', 'missing', 'rule'];
    const o = {}; for (const k of keep) if (L[k] !== undefined) o[k] = U().clone(L[k]);
    return o;
  }
  function chooseVariant(template, input) {
    const want = input.variant || ((S().get('settings') || {}).defaultVariant) || template.defaultVariant;
    return template.variants && template.variants[want] ? want : (template.defaultVariant || 'standard');
  }

  // ------------------------------------------------------------------
  // Bahasa RPH (langGroup/lang templat)
  // ------------------------------------------------------------------
  const LANG_ORDER = ['jawi', 'ms', 'en', 'ar'];
  const LANG_LABEL = { jawi: 'Jawi', ms: 'BM', en: 'English', ar: 'العربية' };
  function seedTemplates() { const p = typeof window !== 'undefined' ? window.RPH_SEED_PUBLIC : null; return (p && p.templates) || {}; }
  function templateById(id) { return S().template(id) || seedTemplates()[id] || null; }
  function langOfTemplate(t) { return (t && (t.lang || (seedTemplates()[t.id] || {}).lang || t.labelLang)) || 'ms'; }

  // ------------------------------------------------------------------
  // API awam
  // ------------------------------------------------------------------
  const gen = {
    NO_DATA,
    familyOf,
    timing,
    lessonFor,

    /** Slot PdP bagi tarikh + RPH sedia ada + pelajaran RPT. Hari cuti → holiday diisi. */
    planForDate(iso) {
      const day = CAL().day(iso);
      const dow = U().dow(iso);
      const holiday = day.schoolDay ? null : { name: day.holiday || (dow === 0 || dow === 6 ? 'Hujung minggu' : 'Bukan hari persekolahan'), events: day.events || [], outside: !!day.outside, dow };
      const slots = CAL().slotsFor(iso);
      if (!slots.length && holiday) return [{ date: iso, slot: null, existingRphId: null, rptLesson: null, holiday }];
      const rphs = S().rphList({ date: iso });
      return slots.map(slot => {
        const ex = rphs.find(r => r.classId === slot.classId && r.subjectId === slot.subjectId && ((r.slotId && r.slotId === slot.id) || (r.start && r.start === slot.start)));
        return { date: iso, slot, existingRphId: ex ? ex.id : null, rptLesson: holiday ? null : lessonFor(iso, slot), holiday };
      });
    },

    /** Jana RPH baharu (status 'draft'). */
    generate(input = {}) {
      const ctx = buildContext(input, 0);
      if (!ctx.subjectId) throw new Error('Subjek tidak dinyatakan.');
      const c = compose(ctx);
      const now = U().nowIso();
      const variant = chooseVariant(ctx.template, input);
      const manualCodes = !!(input.sk || input.sp);
      return {
        id: U().uid('rph'),
        academicYearId: S().activeYear(),
        date: ctx.date, week: ctx.week, rptWeek: ctx.rptWeek, dow: ctx.dow,
        start: ctx.slot.start || null, end: ctx.slot.end || null, minutes: ctx.minutes,
        classId: ctx.slot.classId, className: ctx.slot.className || (ctx.cls && ctx.cls.name) || ctx.slot.classId, year: ctx.year, subjectId: ctx.subjectId,
        templateId: ctx.template.id, variant,
        timetableVersionId: ctx.slot.versionId || null, slotId: ctx.slot.id || null,
        status: ctx.lesson && ctx.lesson.kind === 'program' && c.suggestedStatus === 'program' ? 'program' : 'draft',
        values: toValues(ctx, c),
        provenance: provenance(ctx, c),
        warnings: uniq(ctx.warnings),
        carriedFrom: null, carriedTo: null,
        createdAt: now, updatedAt: now,
        generatedBy: input.generatedBy || (input.slot && !manualCodes ? 'auto' : 'manual'),
        meta: {
          generator: 'rule-v1', regen: 0, seed: ctx.seed,
          lesson: lessonSnapshot(ctx.lesson), snapshot: c.snapshot,
          // Bahasa kandungan (tukar bahasa): nilai auto tajuk/tema yang dipapar + sumber tajuk manual (untuk diterjemah semula).
          i18n: { lang: langOfTemplate(ctx.template), topicShown: c.topic || '', themeShown: c.theme || '', ...(input.topic != null ? { topicSrc: input.topic } : {}) },
          notes: uniq(ctx.notes),
          suggestions: { tp: c.tp || null, status: c.suggestedStatus || null, note: 'TP ialah cadangan sistem; keputusan akhir guru (master §38).' },
        },
      };
    },

    /** Jana semula sebahagian RPH. TIDAK mengubah SK/SP, tema atau tajuk. */
    regenerate(rph, part = 'all') {
      const out = U().clone(rph);
      out.meta = out.meta || {};
      out.meta.regen = (out.meta.regen || 0) + 1;
      const t = S().template(out.templateId);
      if (!t) throw new Error(`Templat ${out.templateId} tiada.`);
      const keyOf = type => (t.fields.find(f => f.type === type) || {}).key;
      const skKey = keyOf('sk-select') || 'contentStandards'; const spKey = keyOf('sp-select') || 'learningStandards';
      const vals = out.values || {};
      const forced = {
        sk: U().clone(vals[skKey] != null ? vals[skKey] : []), sp: U().clone(vals[spKey] != null ? vals[spKey] : []),
        theme: vals.theme != null ? vals.theme : undefined, topic: vals.topic != null ? vals.topic : undefined,
        subjectDomain: vals.subjectDomain || undefined,
      };
      const input = {
        date: out.date, templateId: out.templateId, variant: out.variant,
        slot: { id: out.slotId, start: out.start, end: out.end, minutes: out.minutes, classId: out.classId, className: out.className, subjectId: out.subjectId, year: out.year, versionId: out.timetableVersionId },
        rptLesson: out.meta.lesson || undefined, forced,
      };
      // SK & SP kosong (cth. RPH dijana sebelum baris RPT ulang kaji/peperiksaan dapat diterbitkan) → isi semula daripada RPT terkini.
      const P = part || 'all';
      const refill = P === 'all' && out.subjectId !== 'TASMIK' && !(forced.sk || []).length && !(forced.sp || []).length;
      if (refill) { delete forced.sk; delete forced.sp; input.rptLesson = lessonFor(out.date, input.slot) || input.rptLesson; }
      const ctx = buildContext(input, out.meta.regen);
      const c = compose(ctx);
      const fresh = toValues(ctx, c);
      const fieldsOfType = (...types) => t.fields.filter(f => types.includes(f.type)).map(f => f.key);
      const set = keys => keys.forEach(k => { if (k in fresh) vals[k] = fresh[k]; });
      if (refill && ((fresh[skKey] || []).length || (fresh[spKey] || []).length)) {
        set([skKey, spKey]);
        out.meta.lesson = lessonSnapshot(ctx.lesson);
        out.warnings = uniq(ctx.warnings);
        out.meta.suggestions = { ...(out.meta.suggestions || {}), status: c.suggestedStatus || null };
      }
      if (P === 'objectives' || P === 'all') set(['objectives']);
      if (P === 'successCriteria' || P === 'all') set(['successCriteria']);
      if (P === 'activities' || P === 'all') set([...fieldsOfType('activity-phases', 'activity-list'), 'pak21', 'bbm', 'kbat', 'strategy', 'pdpr', 'values', 'aspirations', 'learningMethod', 'assessmentInstrument']);
      if (P === 'all') set(['assessment', 'assessmentMethod', 'emk', 'differentiation', 'tp', 'sekolahkuSejahtera', 'pendekatanBertema']);
      out.values = vals;
      if (P === 'reflection' || P === 'all') {
        const rk = keyOf('reflection');
        // Jana semula refleksi = kembali kepada ayat automatik templat (buang teks tersuai guru).
        // values.<rk>.text dikhaskan untuk teks tersuai guru; jika diisi, ia menggantikan baris templat dalam output.
        if (rk) { vals[rk] = { ...(vals[rk] || {}) }; delete vals[rk].text; }
      }
      out.updatedAt = U().nowIso();
      out.meta.notes = uniq([...(out.meta.notes || []), ...ctx.notes]);
      return out;
    },

    /**
     * Ayat refleksi: { ms, ar|jawi|en (baris dipisah \n), lines:[{id,text}], text, sentences:{ms,en,ar} } — nombor kosong "___".
     * `text` = ayat dalam bahasa templat bagi RPH Inggeris / Arab generik; selainnya ayat Melayu (seperti sebelum ini).
     */
    reflectionText(rph) {
      const t = S().template(rph.templateId) || { fields: [] };
      const f = (t.fields || []).find(x => x.type === 'reflection') || {};
      const r = ((rph.values || {})[f.key || 'reflection']) || {};
      const num = x => (x === '' || x == null || isNaN(+x) ? null : +x);
      const total = num(r.total), achieved = num(r.achieved), absent = num(r.absent);
      const notAch = num(r.notAchieved) != null ? num(r.notAchieved) : (total != null && achieved != null ? Math.max(0, total - (absent || 0) - achieved) : null);
      const show = x => (x == null ? '___' : String(x));
      const R = PH().reflection; const fill = PH().fill;
      const regen = (rph.meta && rph.meta.regen) || 0;
      const frame = R.ms[regen % R.ms.length]; // varian 0 = ayat kanonik (§39); berputar bila dijana semula
      let ms = fill(frame, { a: show(achieved), t: show(total), b: show(notAch) });
      if (absent) ms += ` ${fill(R.absent, { c: absent })}`;
      const pk = (t.fields.find(x => x.type === 'postponement') || {}).key;
      const reason = pk ? String((rph.values || {})[pk] || '') : '';
      const realReason = reason && reason !== 'تيدق بركناءن' ? reason : '';
      if (r.postponed) ms += ` ${fill(R.postponed, { reason: realReason ? realReason.toLowerCase() : 'program sekolah' })}`;
      if (r.carryWeek) ms += ` ${fill(R.carry, { w: r.carryWeek })}`;
      // Ayat Inggeris & Arab (RPH pelbagai bahasa).
      const sentence = (P, digits) => {
        const d = digits ? ar : (x => x);
        let s = fill(P.frames[regen % P.frames.length], { a: show(achieved), t: show(total), b: show(notAch) });
        if (absent) s += ` ${fill(P.absent, { c: absent })}`;
        if (r.postponed) s += ` ${fill(P.postponed, { reason: realReason || P.reasonDefault })}`;
        if (r.carryWeek) s += ` ${fill(P.carry, { w: r.carryWeek })}`;
        return d(s);
      };
      const sentences = { ms, en: sentence(R.en, false), ar: sentence(R.ar, true), jawi: sentence(R.jawi, false) };
      const lang = t.labelLang === 'ar' ? 'ar' : t.labelLang === 'jawi' ? 'jawi' : t.labelLang === 'en' ? 'en' : 'ms';
      const lines = (f.lines || []).filter(l => !r.lines || r.lines[l.id] !== false).map(l => {
        const n = l.id === 'achieved' ? achieved : l.id === 'notAchieved' ? notAch : l.id === 'absent' ? absent : null;
        const label = l[lang] || l.ms || '';
        const fmt = l.format || f.format || '{n} / {total}';
        let text;
        if (fmt === 'checkbox') text = `${r.postponed ? '☑' : '☐'} ${label}`;
        else if (fmt === '{week}') text = `${label} ${show(r.carryWeek)}`;
        else text = `${fill(fmt, { n: show(n), total: show(total) })} ${label}`;
        return { id: l.id, text: lang === 'ar' ? ar(text) : text };
      });
      const fam = familyOf(t, rph.subjectId);
      const main = lang === 'en' ? sentences.en : (fam === 'arg' || t.layout === 'arg') ? sentences.ar : fam === 'jawg' || (lang === 'jawi' && t.langGroup === 'generic' && t.id !== 'tpl-pi-standard' && (t.subjectIds || []).includes('*')) ? sentences.jawi : ms;
      return { ms, [lang]: lines.map(x => x.text).join('\n'), lines, text: main, sentences };
    },

    /**
     * Pilihan bahasa RPH bagi templat semasa: [{lang, label, templateId}] (kosong jika templat tiada langGroup).
     * Templat setara dicari dalam stor dan, bagi pelayar yang disemai sebelum templat baharu wujud, dalam seed awam.
     * Bagi setiap bahasa, templat yang subjectIds-nya menyebut subjek diutamakan (BA → Arab = tpl-ba-standard).
     */
    languageOptions(rph) {
      const cur = templateById(rph && rph.templateId);
      const group = cur && (cur.langGroup || ((seedTemplates()[cur.id] || {}).langGroup));
      if (!group) return [];
      const all = { ...seedTemplates(), ...(S().get('templates') || {}) };
      const sid = rph.subjectId;
      const out = [];
      for (const lang of LANG_ORDER) {
        const cands = Object.values(all).filter(x => x && (x.langGroup || (seedTemplates()[x.id] || {}).langGroup) === group && langOfTemplate(x) === lang);
        const own = cands.find(x => (x.subjectIds || []).includes(sid));
        const any = cands.find(x => (x.subjectIds || []).includes('*'));
        const pick = own || any;
        if (pick) out.push({ lang, label: LANG_LABEL[lang], templateId: pick.id, current: pick.id === cur.id || (langOfTemplate(cur) === lang) });
      }
      return out.length > 1 ? out : [];
    },

    /**
     * Tukar bahasa RPH: templat setara + jana semula kandungan bergantung bahasa (regenerate 'all').
     * Dikekalkan: SK/SP, tema, tajuk, bilangan refleksi, tarikh/slot/status. Medan auto (hari, subjek, tarikh…)
     * dan kemahiran fokus dikira semula dalam bahasa baharu. Templat seed yang belum ada dalam stor dipasang dahulu.
     */
    switchLanguage(rph, lang) {
      const opt = gen.languageOptions(rph).find(o => o.lang === lang);
      if (!opt) throw new Error(`Tiada templat setara bagi bahasa "${lang}".`);
      if (!S().template(opt.templateId)) {
        const seed = seedTemplates()[opt.templateId];
        if (!seed) throw new Error(`Templat ${opt.templateId} tiada.`);
        S().update('templates', d => { d[opt.templateId] = U().clone(seed); });
      }
      const t = S().template(opt.templateId);
      const src = U().clone(rph);
      const fromLang = langOfTemplate(templateById(rph.templateId));
      const mi = (rph.meta && rph.meta.i18n) || {};
      const vals0 = rph.values || {};
      // Tajuk/tema auto (belum disunting guru) → dijana semula dalam bahasa baharu; suntingan guru → cuba diterjemah, jika
      // gagal kekal seperti ditulis. Tajuk manual asal (input.topic) diterjemah daripada sumbernya.
      const autoTopic = mi.topicShown != null ? vals0.topic === mi.topicShown : false;
      const autoTheme = mi.themeShown != null ? vals0.theme === mi.themeShown : false;
      const trUser = (txt, kind) => {
        if (txt == null || txt === '' || !RPH.i18n) return txt;
        if (kind === 'theme' && isArabicSubject(rph.subjectId)) { const th = RPH.i18n.findTheme('BA', rph.year, txt); if (th) return lang === 'ar' ? th.name.ar : RPH.i18n.theme('BA', rph.year, th.name.ar, lang).text; }
        const r = RPH.i18n.topic(txt, lang, { subjectId: rph.subjectId, srcLang: fromLang });
        return r.translated ? r.text : txt;
      };
      if (autoTopic) delete src.values.topic; else if (src.values.topic != null) src.values.topic = trUser(src.values.topic, 'topic');
      if (autoTheme) delete src.values.theme; else if (src.values.theme != null) src.values.theme = trUser(src.values.theme, 'theme');
      src.templateId = opt.templateId;
      if (!t.variants || !t.variants[src.variant]) src.variant = t.defaultVariant || 'standard';
      const out = gen.regenerate(src, 'all');
      // Medan auto + kemahiran fokus + tajuk/tema dalam bahasa baharu (nilai segar daripada penjana; SK/SP tidak disentuh).
      const ctx = buildContext({
        date: out.date, templateId: out.templateId, variant: out.variant, rptLesson: (out.meta && out.meta.lesson) || undefined,
        slot: { id: out.slotId, start: out.start, end: out.end, minutes: out.minutes, classId: out.classId, className: out.className, subjectId: out.subjectId, year: out.year, versionId: out.timetableVersionId },
        forced: { sk: out.values.contentStandards, sp: out.values.learningStandards, theme: autoTheme ? undefined : out.values.theme, topic: autoTopic ? undefined : out.values.topic, topicSrc: autoTopic && mi.topicSrc != null ? mi.topicSrc : undefined, subjectDomain: out.values.subjectDomain || undefined },
      }, out.meta.regen);
      const c = compose(ctx);
      const fresh = toValues(ctx, c);
      const AUTO = ['static', 'subject', 'subject-line', 'week', 'date', 'day', 'class', 'time-range', 'term-week', 'day-date', 'subject-domain'];
      for (const f of t.fields) {
        if (AUTO.includes(f.type) || f.key === 'skills') { if (f.key in fresh) out.values[f.key] = fresh[f.key]; else delete out.values[f.key]; }
        if (f.type === 'postponement' && !String(out.values[f.key] || '').trim() && fresh[f.key]) out.values[f.key] = fresh[f.key];
        if (f.type === 'postponement' && out.values[f.key] === 'تيدق بركناءن' && t.labelLang !== 'jawi') out.values[f.key] = fresh[f.key] || '';
      }
      // Kandungan bergantung tajuk/tema (objektif, aktiviti…) dijana dengan tajuk/tema bahasa baharu.
      const own = new Set(t.fields.map(f => f.key));
      if (own.has('topic')) out.values.topic = autoTopic || out.values.topic == null ? (fresh.topic != null ? fresh.topic : '') : out.values.topic;
      if (own.has('theme')) {
        const b = out.values.subjectDomain ? RPH.banks.item('pi-bidang', out.values.subjectDomain) : null;
        const bl = b ? [b.en, b.arg, b.ar, b.ms, b.jawi].filter(Boolean) : [];
        if (autoTheme || !out.values.theme || bl.includes(out.values.theme)) {
          const want = b ? RPH.banks.label(b, lang === 'en' ? 'en' : lang === 'ar' ? 'arg' : lang === 'jawi' ? 'jawi' : 'ms') : '';
          out.values.theme = (bl.includes(out.values.theme) || !fresh.theme ? want : '') || fresh.theme || out.values.theme || '';
        }
      }
      const keepVals = ['contentStandards', 'learningStandards', 'topic', 'theme', 'subjectDomain', 'reflection', 'postponement', 'tasmikDetail', ...t.fields.filter(f => AUTO.includes(f.type) || f.key === 'skills').map(f => f.key)];
      for (const [k, v] of Object.entries(fresh)) if (!keepVals.includes(k)) out.values[k] = v;
      // Medan auto templat lain dalam kumpulan (cth. subject, dayDate) dibuang supaya tidak tertinggal dalam bahasa lama.
      for (const k of ['subject', 'subjectLine', 'week', 'date', 'day', 'class', 'time', 'termWeek', 'dayDate', 'skills']) if (!own.has(k)) delete out.values[k];
      // Kandungan bergantung bahasa daripada templat lama yang tiada dalam templat baharu (cth. activities/pdpr BA Arab
      // selepas tukar ke templat generik) dibuang supaya tiada teks bahasa lama tertinggal. Boleh dibuat asal (editor).
      for (const k of ['activities', 'activityInduction', 'activityDevelopment', 'activityClosure', 'pdpr', 'textbook', 'objectives', 'successCriteria', 'differentiation', 'theme', 'topic']) if (!own.has(k)) delete out.values[k];
      out.meta.snapshot = c.snapshot;
      out.meta.i18n = { ...mi, lang, topicShown: own.has('topic') ? (out.values.topic || '') : mi.topicShown, themeShown: own.has('theme') ? (out.values.theme || '') : mi.themeShown };
      out.meta.notes = uniq([...(out.meta.notes || []), `Bahasa RPH ditukar kepada ${LANG_LABEL[lang]} (${opt.templateId}).`]);
      return out;
    },

    // Pendedahan dalaman untuk ujian/diagnostik.
    _internals: { hash, picker, parseWords, parsePhrases, piObjective, piSpec, chooseBaCodes, extractSurah, extractHukum, weekPeers, isArabicSubject },
  };
  RPH.gen = gen;
})(window.RPH = window.RPH || {});
