/* RPH.rptgen — enjin penjana RPT (Rancangan Pengajaran Tahunan). Lihat docs/RPT_GENERATOR_CONTRACT.md.
   Prinsip (keputusan guru): enjin HANYA MENGAGIHKAN standard sedia ada dalam DSKP yang diimport (dan unit/RPT lama yang guru
   bekalkan) ke minggu persekolahan. Tiada kod SK/SP, teks standard, tema atau nama unit buku teks direka. Setiap agihan ialah
   cadangan (review:true + derivation) sehingga guru mengesahkan. Data tiada → isu "Data tidak tersedia — perlu semakan guru".
   Algoritma deterministik (tiada rawak) dan boleh diterangkan: setiap tahap tersimpan dalam plan.meta. */
(function (RPH) {
  'use strict';
  const S = () => RPH.store;
  const U = () => RPH.util;
  const NO_DATA = 'Data tidak tersedia — perlu semakan guru';
  const clone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));
  const uniq = a => [...new Set(a)];
  const codeSort = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
  const MONTH_PRINT = ['JAN', 'FEB', 'MAC', 'APRIL', 'MEI', 'JUN', 'JULAI', 'OGOS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DISEMBER'];
  const MONTH_SHORT = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
  const dayMonth = iso => `${+iso.slice(8, 10)} ${MONTH_SHORT[+iso.slice(5, 7) - 1]}`;
  function datesPrinted(a, b) {
    if (!a) return '';
    if (!b || a === b) return `${+a.slice(8, 10)} ${MONTH_PRINT[+a.slice(5, 7) - 1]}`;
    const sameMonth = a.slice(0, 7) === b.slice(0, 7);
    return sameMonth ? `${+a.slice(8, 10)}-${+b.slice(8, 10)} ${MONTH_PRINT[+b.slice(5, 7) - 1]}` : `${+a.slice(8, 10)}-${+b.slice(8, 10)} ${MONTH_PRINT[+b.slice(5, 7) - 1]}`;
  }
  /** Bahagi tatasusunan kepada k bahagian hampir sama saiz (urutan dikekalkan). */
  function balanced(arr, k) {
    const out = []; const n = arr.length; if (!n) return out; k = Math.max(1, Math.min(k, n));
    for (let i = 0; i < k; i++) out.push(arr.slice(Math.floor(i * n / k), Math.floor((i + 1) * n / k)));
    return out;
  }
  const chunksOf = (arr, size) => balanced(arr, Math.ceil(arr.length / Math.max(1, size)));
  /** Agihan baki terbesar: jumlah integer = total, setiap item >= min jika boleh. */
  function apportion(weights, total, min = 0) {
    const n = weights.length; const out = new Array(n).fill(0); if (!n || total <= 0) return out;
    const sum = weights.reduce((a, b) => a + b, 0) || n;
    const w = weights.map(x => (sum ? x / sum : 1 / n));
    let left = total;
    if (min > 0 && total >= n * min) { for (let i = 0; i < n; i++) out[i] = min; left -= n * min; }
    const raw = w.map(x => x * left); const fl = raw.map(Math.floor);
    fl.forEach((f, i) => { out[i] += f; }); left -= fl.reduce((a, b) => a + b, 0);
    const order = raw.map((r, i) => ({ i, r: r - fl[i] })).sort((a, b) => b.r - a.r || a.i - b.i);
    for (let k = 0; k < left; k++) out[order[k % n].i]++;
    return out;
  }
  const textOf = v => { if (v == null) return ''; if (typeof v === 'string') return v; return v.ms || v.ar || v.jawi || v.en || Object.values(v)[0] || ''; };
  const nameIn = (v, lang) => { if (v == null) return ''; if (typeof v === 'string') return v; return v[lang] || (lang === 'jawi' && v.jawi) || v.ar || v.jawi || v.ms || v.en || Object.values(v)[0] || ''; };

  // Kandungan 4 bahasa (docs/I18N_CONTRACT.md §1c): topik asal kekal; terjemahan disimpan berasingan dalam lesson.topicI18n.
  const I18N_LANGS = ['ms', 'en', 'ar', 'jawi'];
  const srcLangOf = (family, text) => (/[\u0600-\u06FF]/.test(String(text || '')) ? (family === 'ba' ? 'ar' : 'jawi') : 'ms');
  /** {ms,en,ar,jawi} bagi topik melalui RPH.i18n.topic — hanya bahasa yang benar-benar diterjemah (+ bahasa asal); undefined jika tiada. */
  function topicI18nOf(text, ctx) {
    const I = RPH.i18n; const t = text == null ? '' : String(text).trim();
    if (!I || typeof I.topic !== 'function' || !t) return undefined;
    const src = srcLangOf(ctx && ctx.family, t); const out = {};
    for (const l of I18N_LANGS) {
      if (l === src) continue;
      try { const r = I.topic(t, l, { subjectId: ctx && ctx.subjectId, year: ctx && ctx.year, srcLang: src }); if (r && r.translated && String(r.text || '').trim()) out[l] = String(r.text); } catch (e) { /* abaikan */ }
    }
    if (!Object.keys(out).length) return undefined;
    out[src] = t;
    return out;
  }
  /** Isi topicI18n bagi semua pelajaran yang ada topik (kekalkan entri sedia ada; topik asal tidak diubah). */
  function fillTopicI18n(weeks, ctx) {
    (weeks || []).forEach(w => (w.lessons || []).forEach(l => {
      if (!l || l.topic == null || String(l.topic).trim() === '') return;
      const t = topicI18nOf(l.topic, ctx); if (!t) return;
      l.topicI18n = Object.assign({}, t, l.topicI18n && typeof l.topicI18n === 'object' ? l.topicI18n : {});
    }));
  }

  // ---------------------------------------------------------------------------------------------------
  // 1. Takwim: sumber, klasifikasi minggu
  // ---------------------------------------------------------------------------------------------------
  function calSource() {
    const c = S().get('calendar') || {};
    if ((c.weeks || []).length) return { weeks: c.weeks, days: c.days || [], breaks: c.breaks || [], kpm: c.kpm || null, fromKpm: false, raw: c };
    if (c.kpm && RPH.importers && RPH.importers.calendarFromKpm) {
      const b = RPH.importers.calendarFromKpm(c.kpm, { yearId: S().activeYear() });
      if (b && b.weeks.length) return { weeks: b.weeks, days: b.days, breaks: b.breaks, kpm: c.kpm, fromKpm: true, raw: b };
    }
    return { weeks: [], days: [], breaks: [], kpm: c.kpm || null, fromKpm: false, raw: c };
  }
  const SKIP_EV = new Set(['sabtu-3', 'sabtu-oren']);
  const RE_EXAM = /\b(UASA|PSAT|PAT|PPT|PKSR|PEPERIKSAAN|PENTAKSIRAN\s+(AKHIR|SUMATIF|SEKOLAH)|UJIAN\s+(AKHIR|PENTAKSIRAN|SUMATIF))\b/i;
  const RE_POST = /pasca\s*(uasa|psat|ppt|pat|peperiksaan)|selepas\s+(uasa|peperiksaan)|program\s+pasca/i;
  const RE_OPEN = /(sekolah\s+penyayang|jom\s+ke\s+sekolah|pembukaan\s+sekolah|minggu\s+pembukaan|minggu\s+orientasi|orientasi|program\s+transisi)/i;
  /** Acara yang menyebut "Tahun N" bagi tahun lain tidak terpakai pada subjek-tahun ini. */
  function appliesToYear(title, year) {
    const ms = [...String(title).matchAll(/\btahun\s*(\d)\b/ig)].map(m => +m[1]);
    return !ms.length || year == null || ms.includes(+year);
  }
  function weekEvents(src, w) {
    const out = []; const hol = []; const exam = []; const post = []; const open = []; let holDays = 0;
    for (let i = 0; i < 7; i++) {
      const d = U().addDays(w.start, i); const day = src.days.find(x => x.date === d);
      if (!day) continue;
      if (day.holiday && ![0, 6].includes(day.dow)) { holDays++; if (!hol.includes(day.holiday)) hol.push(day.holiday); }
      for (const e of day.events || []) {
        if (SKIP_EV.has(e.kind)) continue;
        out.push({ date: d, title: e.title, kind: e.kind, category: e.category });
      }
    }
    return { events: out, hol, holDays };
  }

  /** Klasifikasi automatik setiap minggu takwim. options: lihat §3 (reviseWeeksBeforeExam, orientationWeeks, skipWeeks, extraRevisionWeeks, postExam). */
  function weekTable(subjectId, year, options) {
    const o = Object.assign({}, defaultOptions(subjectId, year, true), options || {});
    const src = calSource();
    const rows = [];
    const slotFor = subjectSlotChecker(subjectId, year, src);
    src.weeks.forEach(w => {
      const { events, hol, holDays } = weekEvents(src, w);
      const dayList = [];
      for (let i = 0; i < 7; i++) { const d = src.days.find(x => x.date === U().addDays(w.start, i)); if (d && d.schoolDay) dayList.push(d); }
      const pdpDays = dayList.length || (src.days.length ? 0 : (w.schoolDays || 0));
      const relevant = events.filter(e => appliesToYear(e.title, year));
      const examEv = relevant.filter(e => e.kind === 'peperiksaan' || (RE_EXAM.test(e.title) && !RE_POST.test(e.title)));
      const examDays = uniq(examEv.filter(e => dayList.some(d => d.date === e.date)).map(e => e.date)).length;
      const postEv = relevant.filter(e => RE_POST.test(e.title));
      const postDays = uniq(postEv.map(e => e.date)).length;
      const openEv = relevant.filter(e => RE_OPEN.test(e.title));
      const evText = uniq([...hol.map(h => h), ...events.map(e => e.title)]);
      rows.push({
        week: w.week, start: w.start, end: w.end, term: w.term, kpmWeek: w.kpmWeek != null ? w.kpmWeek : null, pdpDays,
        status: 'pdp', events: evText, reason: '', slots: slotFor(w), _exam: examDays, _examEv: examEv, _post: postDays, _postEv: postEv, _open: openEv, _holDays: holDays, _hol: hol,
      });
    });
    // --- peraturan status
    const examIdx = [];
    rows.forEach((r, i) => {
      if (r.pdpDays === 0) { r.status = 'cuti'; r.reason = 'Tiada hari persekolahan pada minggu ini' + (r._hol.length ? ` (${r._hol.join('; ')})` : '') + '.'; return; }
      if (r._exam >= 2 || (r._exam >= 1 && r._exam >= Math.ceil(r.pdpDays / 2))) { r.status = 'peperiksaan'; r.reason = `Peperiksaan: ${uniq(r._examEv.map(e => e.title)).join('; ')} (${dayMonth(r._examEv[0].date)}${r._exam > 1 ? '…' : ''}).`; examIdx.push(i); return; }
      if (r.slots === 0) { r.status = 'cuti'; r.reason = 'Tiada slot PdP subjek ini pada minggu ini (hari cuti jatuh pada hari kelas).'; return; }
      r.reason = r.pdpDays < 5 ? `${r.pdpDays} hari persekolahan${r._hol.length ? ` — ${r._hol.join('; ')}` : ''}.` : '5 hari persekolahan.';
    });
    // minggu orientasi / pembukaan
    const first = rows.findIndex(r => r.status === 'pdp');
    let nOrient = o.orientationWeeks === 'auto' || o.orientationWeeks == null ? (first === 0 && rows[0]._open.length ? 1 : 0) : Math.max(0, +o.orientationWeeks || 0);
    for (let k = 0, i = first; k < nOrient && i >= 0 && i < rows.length; i++) { if (rows[i].status !== 'pdp') continue; rows[i].status = 'orientasi'; rows[i].reason = rows[i]._open.length ? `Minggu pembukaan sekolah: ${uniq(rows[i]._open.map(e => e.title)).join('; ')}.` : 'Minggu pembukaan/orientasi (ditetapkan guru).'; k++; }
    // program pasca-peperiksaan
    const lastExam = examIdx.length ? examIdx[examIdx.length - 1] : -1;
    if (lastExam >= 0 && o.postExam !== 'pdp') {
      for (let i = lastExam + 1; i < rows.length; i++) {
        if (rows[i].status === 'pdp') { rows[i].status = 'program'; rows[i].reason = rows[i]._post ? `Program pasca-peperiksaan: ${uniq(rows[i]._postEv.map(e => e.title)).join('; ')}.` : 'Selepas peperiksaan akhir — program pasca-peperiksaan (cadangan; tukar kepada PdP jika guru mahu mengajar).'; }
      }
    } else {
      rows.forEach((r, i) => { if (i > lastExam && lastExam >= 0 && r.status === 'pdp' && r._postEv.length && r._post >= 3) { r.status = 'program'; r.reason = `Program pasca-peperiksaan: ${uniq(r._postEv.map(e => e.title)).join('; ')}.`; } });
    }
    // ulang kaji sebelum peperiksaan (setiap kelompok peperiksaan)
    const nRev = Math.max(0, Math.min(2, +o.reviseWeeksBeforeExam || 0));
    if (nRev) {
      const clusters = []; examIdx.forEach(i => { const c = clusters[clusters.length - 1]; if (c && i === c[c.length - 1] + 1) c.push(i); else clusters.push([i]); });
      clusters.forEach(c => { let k = 0; for (let i = c[0] - 1; i >= 0 && k < nRev; i--) { if (rows[i].status === 'pdp') { rows[i].status = 'ulangkaji'; rows[i].reason = `Ulang kaji sebelum peperiksaan (minggu ${rows[c[0]].week}).`; k++; } else if (rows[i].status === 'peperiksaan') break; } });
    }
    (o.extraRevisionWeeks || []).forEach(n => { const r = rows.find(x => x.week === +n); if (r && ['pdp', 'ulangkaji'].includes(r.status)) { r.status = 'ulangkaji'; r.reason = 'Minggu ulang kaji tambahan (ditetapkan guru).'; } });
    (o.skipWeeks || []).forEach(n => { const r = rows.find(x => x.week === +n); if (r) { r.status = 'program'; r.reason = 'Minggu dilangkau oleh guru (tiada PdP bagi subjek ini).'; } });
    return rows.map(r => { const x = Object.assign({}, r); Object.keys(x).forEach(k => { if (k[0] === '_') delete x[k]; }); return x; });
  }

  /** Bilangan slot PdP subjek-tahun pada minggu itu (null jika jadual waktu tiada slot subjek-tahun ini langsung). */
  function subjectSlotChecker(subjectId, year, src) {
    const tt = S().get('timetable') || { versions: [] };
    const subj = s => s && s.subjectId === subjectId && (year == null || +s.year === +year);
    const any = (tt.versions || []).some(v => (v.slots || []).some(s => s.kind === 'PdP' && subj(s)));
    if (!any || src.fromKpm) return () => null;
    return w => { try { return RPH.cal.slotsForWeek(w.week).filter(x => subj(x.slot)).length; } catch (e) { return null; } };
  }

  /** Slot PdP seminggu bagi subjek-tahun (versi terkini yang lengkap): {slotsPerWeek, minutesPerWeek, classes:[{classId,className,slots,minutes}]}. */
  function timetableInfo(subjectId, year) {
    const tt = S().get('timetable') || { versions: [] };
    const vs = (tt.versions || []).slice().sort((a, b) => (a.partial ? 0 : 1) - (b.partial ? 0 : 1) || String(b.effectiveFrom || '').localeCompare(String(a.effectiveFrom || '')));
    for (const v of vs) {
      const m = {};
      (v.slots || []).filter(s => s.kind === 'PdP' && s.subjectId === subjectId && (year == null || +s.year === +year) && s.rph !== false).forEach(s => { const c = (m[s.classId] = m[s.classId] || { classId: s.classId, className: s.className, slots: 0, minutes: 0 }); c.slots++; c.minutes += +s.minutes || 0; });
      const classes = Object.values(m);
      if (classes.length) { const best = classes.slice().sort((a, b) => b.slots - a.slots)[0]; return { ok: true, slotsPerWeek: best.slots, minutesPerWeek: best.minutes, classes, version: v.id }; }
    }
    return { ok: false, slotsPerWeek: 0, minutesPerWeek: 0, classes: [] };
  }

  /** Banding kalendar KPM dengan takwim sekolah (minggu KPM, sempadan blok persekolahan, cuti, jumlah hari). */
  function kpmCheck() {
    const src = calSource(); const k = src.kpm;
    if (!k || !(k.kpmWeeks || []).length) return null;
    const weeks = src.weeks;
    let wkOk = 0, wkBad = [];
    weeks.forEach(w => { const m = k.kpmWeeks.find(x => x.start === w.start); if (m && w.kpmWeek === m.kpmWeek) wkOk++; else wkBad.push({ week: w.week, school: w.kpmWeek, kpm: m ? m.kpmWeek : null }); });
    const schoolDays = src.days.filter(d => d.schoolDay);
    const first = schoolDays.length ? schoolDays[0].date : null, last = schoolDays.length ? schoolDays[schoolDays.length - 1].date : null;
    const b0 = k.blocks && k.blocks[0], bN = k.blocks && k.blocks[k.blocks.length - 1];
    const wd = d => ![0, 6].includes(d.dow) || (k.weekStartDow === 0 && d.dow !== 5 && d.dow !== 6);
    let breakOk = 0; const breakRows = (k.breaks || []).map(b => { const ds = src.days.filter(d => d.date >= b.start && d.date <= b.end); const ok = ds.length && ds.every(d => !d.schoolDay); if (ok) breakOk++; return { name: b.name, start: b.start, end: b.end, noSchoolInTakwim: !!ok }; });
    const inBlock = d => (k.blocks || []).some(b => d >= b.start && d <= b.end);
    const kpmDays = src.days.filter(d => inBlock(d.date) && wd(d));
    const kpmStated = (k.blocks || []).reduce((a, b) => a + (b.days || 0), 0);
    const lostToHoliday = kpmDays.filter(d => !d.schoolDay);
    return {
      group: k.group, weeksCompared: weeks.length, kpmWeekMatches: wkOk, kpmWeekMismatches: wkBad,
      firstDay: { school: first, kpm: b0 && b0.start, match: !!b0 && first === b0.start }, lastDay: { school: last, kpm: bN && bN.end, match: !!bN && last === bN.end },
      breaks: breakRows, breaksAgree: breakOk, breaksTotal: breakRows.length,
      schoolDays: schoolDays.length, kpmStatedDays: kpmStated, kpmWeekdaysInBlocks: kpmDays.length, takwimMarkedHoliday: lostToHoliday.length,
    };
  }

  // ---------------------------------------------------------------------------------------------------
  // 2. Sumber & pilihan lalai
  // ---------------------------------------------------------------------------------------------------
  function familyFor(subjectId, year, opt) {
    if (opt && opt.family) return opt.family;
    const s = S().subject(subjectId) || {};
    if (s.rptFamily) return s.rptFamily;
    if (subjectId === 'BA') return 'ba';
    if (subjectId === 'PI' || subjectId === 'PIQ') return 'pi';
    const cur = S().curriculum(subjectId, year);
    if (s.script === 'arabic' && cur && (cur.themes || []).some(t => (t.vocabulary || []).length || (t.expressions || []).length)) return 'ba';
    return 'generic';
  }
  function langFor(subjectId, family) {
    if (family === 'ba') return 'ar';
    if (family === 'pi') return 'jawi';
    const s = S().subject(subjectId) || {};
    return ({ english: 'en', arabic: 'ar', 'malay-jawi': 'jawi', jawi: 'jawi' })[s.language] || 'ms';
  }
  /** Unit buku teks yang guru bekalkan (subjects.textbookUnits) + padanan unit→tema daripada RPT guru yang tersimpan (unitThemeMap). Tidak pernah dipadankan ikut urutan. */
  function textbookUnits(subjectId, year) {
    const s = S().subject(subjectId) || {}; const t = s.textbookUnits && s.textbookUnits[String(year)];
    if (!Array.isArray(t) || !t.length) return null;
    const lang = langFor(subjectId, familyFor(subjectId, year));
    let map = null;
    const stored = [S().rpt(subjectId, year)];
    try { (S().get('academicYears') || { years: [] }).years.forEach(ay => { const r = (S().get('rpt', ay.id) || {})[`${subjectId}-${year}`]; if (r) stored.push(r); }); } catch (e) { /* abaikan */ }
    for (const r of stored) if (r && r.unitThemeMap) { map = r.unitThemeMap; break; }
    return t.map(n => { const name = typeof n === 'string' ? (lang === 'ar' ? { ar: n } : { ms: n }) : n; const nm = typeof n === 'string' ? n : nameIn(n, lang); const th = (typeof n === 'object' && n.theme) || (map && map[nm]) || undefined; return th ? { name, theme: th } : { name }; });
  }
  function defaultOptions(subjectId, year, _noUnits) {
    const family = familyFor(subjectId, year);
    return {
      lang: langFor(subjectId, family), family, mode: family === 'ba' ? 'tema' : family === 'pi' ? 'bidang' : 'urutan',
      lessonsPerWeek: 'auto', reviseWeeksBeforeExam: 1, orientationWeeks: 'auto', skipWeeks: [], extraRevisionWeeks: [],
      bidangWeights: null, patternFrom: null, units: _noUnits ? null : textbookUnits(subjectId, year), includeKhatam: family === 'pi',
      samePaceAllClasses: true, postExam: 'program', spWeights: null,
    };
  }
  function mergeOptions(subjectId, year, options) {
    const d = defaultOptions(subjectId, year);
    const o = Object.assign({}, d, clone(options || {}));
    if (options && options.units === undefined) o.units = d.units;
    return o;
  }

  function sources(subjectId, year) {
    const src = calSource(); const missing = [];
    const wt = src.weeks.length ? weekTable(subjectId, year) : [];
    const cal = { ok: src.weeks.length > 0, weeks: src.weeks.length, pdpWeeks: wt.filter(w => w.status === 'pdp').length, hasKpm: !!(src.kpm && (src.kpm.kpmWeeks || []).length), kpmGroup: src.kpm ? src.kpm.group || null : null, fromKpm: src.fromKpm };
    if (!cal.ok) missing.push({ id: 'calendar', label: 'Takwim sekolah', link: '#/import?jenis=calendar' });
    const tt = timetableInfo(subjectId, year);
    if (!tt.ok) missing.push({ id: 'timetable', label: `Jadual waktu (slot ${subjectId} Tahun ${year})`, link: '#/import?jenis=timetable' });
    const cur = S().curriculum(subjectId, year);
    const nSk = cur ? walkSk(cur).length : 0, nSp = cur ? walkSk(cur).reduce((a, s) => a + s.sps.length, 0) : 0;
    const curr = { ok: !!cur && nSk > 0, sk: nSk, sp: nSp, themes: cur ? (cur.themes || []).length : 0 };
    if (!curr.ok) missing.push({ id: 'curriculum', label: `DSKP ${subjectId} Tahun ${year}`, link: '#/import?jenis=dskp' });
    const previousRpt = [];
    const ays = (S().get('academicYears') || { years: [] }).years || [];
    for (const ay of ays) {
      let all = {}; try { all = S().get('rpt', ay.id) || {}; } catch (e) { all = {}; }
      for (const [key, r] of Object.entries(all)) if (r && (r.subjectId === subjectId || r.subjectId === (subjectId === 'PIQ' ? 'PI' : subjectId))) previousRpt.push({ key, subjectId: r.subjectId, year: r.year, academicYearId: r.academicYearId || ay.id });
    }
    const out = { calendar: cal, timetable: tt, curriculum: curr, previousRpt, missing };
    out.optional = [];
    if (!cal.hasKpm) out.optional.push({ id: 'calendar-kpm', label: 'Kalendar akademik KPM (semak minggu KPM, sempadan penggal & cuti)', link: '#/import?jenis=calendar-kpm' });
    return out;
  }

  // ---------------------------------------------------------------------------------------------------
  // 3. Analisis DSKP
  // ---------------------------------------------------------------------------------------------------
  function walkSk(cur) {
    const out = [];
    for (const d of cur.domains || []) for (const sk of d.contentStandards || []) out.push({ code: sk.code, text: sk.text || '', strand: sk.strand || null, domain: d, sk, sps: (sk.learningStandards || []).map(sp => ({ code: sp.code, text: sp.text || '', sp })) });
    return out;
  }
  const domName = (d, lang) => nameIn(d.name, lang === 'ar' ? 'ar' : lang);
  function bidangIdOf(d) {
    const ms = String(textOf(d.name && d.name.ms) || '').toLowerCase();
    const map = [[/quran/, 'quran'], [/akidah/, 'akidah'], [/ibadah/, 'ibadah'], [/sirah/, 'sirah'], [/adab/, 'adab'], [/jawi/, 'jawi'], [/hadis/, 'hadis']];
    for (const [re, id] of map) if (re.test(ms)) return id;
    return `d${d.code}`;
  }
  function allCodes(cur) { const sk = new Set(), sp = new Set(); walkSk(cur).forEach(s => { sk.add(s.code); s.sps.forEach(p => sp.add(p.code)); }); return { sk, sp }; }

  // ---------------------------------------------------------------------------------------------------
  // 4. Pengagih: Bahasa Arab (tema)
  // ---------------------------------------------------------------------------------------------------
  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  const toLatin = s => String(s).replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d));
  const toIndic = s => String(s).replace(/[0-9]/g, d => AR_DIGITS[+d]);
  function baSkClass(sk, vocabSet, exprSet) {
    if (vocabSet.has(sk.code)) return 'kosa-kata';
    if (exprSet.has(sk.code)) return 'tarkib';
    const t = sk.text || '';
    if (/الأرقام|الأعداد/.test(t)) return 'nombor';
    if (/التراكيب|التحيات|الترحيبات|الجمل/.test(t)) return 'tarkib';
    if (/المركزة|المقطع|المقاطع/.test(t)) return 'suku-kata';
    if (/الحروف/.test(t)) return 'huruf';
    if (/الكلمات|الكلمة|المفردات/.test(t)) return 'kosa-kata';
    return null;
  }
  const BA_LEVELS = [
    { id: 'L0', lg: 1, skw: 2, v: 4, e: 3, n: 3 }, { id: 'L1', lg: 1, skw: 1, v: 5, e: 3, n: 4 }, { id: 'L2', lg: 1, skw: 1, v: 6, e: 4, n: 4 },
    { id: 'L3', lg: 2, skw: 1, v: 6, e: 4, n: 5 }, { id: 'L4', lg: 2, skw: 1, v: 8, e: 5, n: 6 }, { id: 'L5', lg: 3, skw: 1, v: 10, e: 6, n: 11 },
    { id: 'L6', lg: 2, skw: 0, v: 10, e: 6, n: 11 }, { id: 'L7', lg: 3, skw: 0, v: 13, e: 9, n: 11 }, { id: 'L8', lg: 4, skw: 0, v: 20, e: 12, n: 11 },
  ];
  function baModel(cur, year, units) {
    const sks = walkSk(cur);
    let themes = (cur.themes || []).map((t, i) => ({ i, name: nameIn(t.name, 'ar'), nameObj: t.name, vocab: (t.vocabulary || []).slice(), exprs: (t.expressions || []).slice(), vsk: t.vocabularySk || [], esk: t.expressionsSk || [] }));
    const unitOf = th => (units || []).findIndex(u => u.theme && (u.theme === th.name || u.theme === nameIn(th.nameObj, 'ms')));
    if ((units || []).some(u => u.theme)) themes = themes.map((th, k) => ({ th, k, u: unitOf(th) })).sort((a, b) => (a.u < 0 ? 1e6 + a.k : a.u) - (b.u < 0 ? 1e6 + b.k : b.u)).map(x => x.th);
    const vocabSet = new Set(), exprSet = new Set();
    themes.forEach(t => { t.vsk.forEach(c => vocabSet.add(c)); t.esk.forEach(c => exprSet.add(c)); });
    const cls = {}; const kindOfSk = {};
    sks.forEach(s => { const k = baSkClass({ code: s.code, text: s.text }, vocabSet, exprSet); kindOfSk[s.code] = k; if (k) (cls[k] = cls[k] || []).push(s); });
    const codesOf = k => (cls[k] || []).map(s => s.code).sort(codeSort);
    const textOfK = k => (cls[k] || []).map(s => s.text).join(' ');
    // huruf
    const hurufTxt = (cls.huruf || []).map(s => s.text);
    let alphabet = null;
    for (const t of hurufTxt.filter(x => !/التركيز/.test(x))) for (const m of t.matchAll(/\(([^()]*)\)/g)) { const groups = m[1].split('/').map(x => x.trim()).filter(Boolean); if (groups.length >= 8 && groups.every(g => /^[ء-ي](\s+[ء-ي])*$/.test(g))) { alphabet = groups.map(g => g.split(/\s+/)); break; } }
    let focus = []; const sukuTxt = (cls['suku-kata'] || []).map(s => s.text);
    for (const t of sukuTxt) { const m = t.match(/المركزة\s*\(([^)]*)\)/); if (m) { focus = m[1].split('/').map(x => x.trim()).filter(x => /^[ء-ي]$/.test(x)); if (focus.length) break; } }
    const pick = (arr, re) => { for (const t of arr) { const m = t.match(re); if (m) return m[1] ? m[0] : m[0]; } return null; };
    const harakat = pick(hurufTxt, /بحركاتها المختلفة\s*\([^)]*\)/);
    const posisi = pick(sukuTxt, /\(في[^)]*\)/);
    const skHarakat = (() => { for (const t of sukuTxt) { const m = t.match(/\((الحركات[^)]*)\)/); if (m) return m[1]; } return null; })();
    // nombor
    let range = null, numLabel = 'الأرقام والأعداد', indic = false;
    for (const s of cls.nombor || []) { const t = s.text; const m = toLatin(t).match(/(\d+)\s*[-–]\s*(\d+)/); if (m) { let a = +m[1], b = +m[2]; if (a > b) [a, b] = [b, a]; range = [a, b]; indic = /[٠-٩]/.test(t); const lm = t.match(/الأرقام\s+والأعداد/); if (lm) numLabel = lm[0]; break; } }
    // projek: SP "إنتاج ... الملصقات" di bawah SK kosa kata
    let projekSp = null;
    for (const s of cls['kosa-kata'] || []) for (const p of s.sps) if (/إنتاج/.test(p.text) && /الملصقات/.test(p.text)) { projekSp = { sp: p.code, sk: s.code }; break; }
    // calon SK ikut kelas merentas domain
    return { sks, themes, cls, codesOf, alphabet, focus, harakat, posisi, skHarakat, range, numLabel, indic, projekSp, year };
  }
  function baUnitsFor(M, L, opt) {
    const K = Math.max(1, M.themes.length); const issues = []; const units = [];
    const T = i => M.themes[Math.min(i, M.themes.length - 1)] || null;
    // blok huruf
    let groups = [];
    if (M.alphabet) groups = M.alphabet.map(g => ({ letters: g, focus: g.filter(x => M.focus.includes(x)) }));
    else groups = M.focus.map(x => ({ letters: [x], focus: [x] }));
    const blocks = chunksOf(groups, L.lg);
    const perTheme = Array.from({ length: K }, () => []);
    blocks.forEach((b, g) => perTheme[Math.min(K - 1, Math.floor(g * K / blocks.length))].push(b));
    const ltr = a => a.join(' / ');
    const nums = [];
    if (M.range && M.codesOf('nombor').length) { const all = []; for (let n = M.range[0]; n <= M.range[1]; n++) all.push(n); balanced(all, Math.ceil(all.length / L.n)).forEach(c => nums.push([c[0], c[c.length - 1]])); }
    const fmtN = n => (M.indic ? toIndic(n) : String(n));
    const sk = k => M.codesOf(k);
    for (let t = 0; t < K; t++) {
      const th = M.themes[t] || null; const lt = th ? th.name : null;
      perTheme[t].forEach(b => {
        const alpha = !!M.alphabet; const lbl = alpha ? 'الحروف الهجائية' : 'الحروف المركزة';
        const hc = [`${lbl} (${ltr(b.flatMap(x => x.letters))})`]; if (M.harakat) hc.push(M.harakat);
        const foc = b.flatMap(x => x.focus);
        const skC = foc.length || !alpha;
        if (L.skw === 0 && foc.length) {
          units.push({ t, kind: 'huruf+suku-kata', content: [`${lbl} (${ltr(b.flatMap(x => x.letters))})`, ...(M.harakat ? [M.harakat] : []), ...(M.posisi ? [M.posisi] : [])], sk: [...sk('huruf'), ...sk('suku-kata')].sort(codeSort), sp: [] });
        } else {
          units.push({ t, kind: 'huruf', content: hc, sk: sk('huruf'), sp: [] });
          if (foc.length && skC) {
            const parts = (M.skHarakat || '').split('،').map(x => x.trim()).filter(Boolean);
            const sets = L.skw === 2 && parts.length > 1 ? [[parts[0]], parts.slice(1)] : [parts];
            sets.forEach(p => units.push({ t, kind: 'suku-kata', content: [`مقاطع الحروف المركزة (${ltr(foc)})`, ...(p.length ? [`(${p.join('، ')})`] : [])], sk: sk('suku-kata'), sp: [] }));
          }
        }
      });
      if (th) {
        if (th.vocab.length) chunksOf(th.vocab, L.v).forEach(c => units.push({ t, kind: 'kosa-kata', content: [`الكلمات: ${c.join('، ')}`], sk: th.vsk.length ? th.vsk.slice().sort(codeSort) : sk('kosa-kata'), sp: [] }));
        else if (M.codesOf('kosa-kata').length && (th.vsk || []).length) issues.push({ level: 'warn', msg: `Tema "${lt}": kosa kata tiada dalam DSKP — ${NO_DATA}. Bekalkan kosa kata (unit buku teks) atau tambah dalam DSKP.`, ref: lt });
        if (t === K - 1 && M.projekSp && th.vocab.length) units.push({ t, kind: 'projek', content: [`إنتاج ملصقات الكلمات المدروسة: ${th.vocab.slice(0, 8).join('، ')}`], sk: [M.projekSp.sk], sp: [M.projekSp.sp] });
        if (th.exprs.length) chunksOf(th.exprs, L.e).forEach(c => units.push({ t, kind: 'tarkib', content: ['التراكيب:', ...c], sk: th.esk.length ? th.esk.slice().sort(codeSort) : sk('tarkib'), sp: [] }));
      }
      nums.forEach((r, i) => { const tt = nums.length > 1 ? Math.round(i * (K - 1) / (nums.length - 1)) : 0; if (tt === t) units.push({ t, kind: 'nombor', content: [`${M.numLabel} (${fmtN(r[0])}-${fmtN(r[1])})`], sk: sk('nombor'), sp: [] }); });
    }
    return { units, issues };
  }
  /** Pilih tahap terhalus yang muat dalam kapasiti; baki minggu → ulang kaji/pengukuhan di hujung tema. */
  function baPlan(M, capacity, opt, doneKeys) {
    let chosen = null, built = null;
    for (const L of BA_LEVELS) {
      const b = baUnitsFor(M, L, opt);
      const units = doneKeys ? b.units.filter(u => !doneKeys.has(unitKey(u))) : b.units;
      if (units.length <= capacity) { chosen = L; built = { units, issues: b.issues }; break; }
      if (L === BA_LEVELS[BA_LEVELS.length - 1]) { chosen = L; built = { units, issues: b.issues, overflow: units.length - capacity }; }
    }
    const spare = capacity - built.units.length;
    let units = built.units.slice();
    if (spare > 0 && units.length) {
      const K = Math.max(1, M.themes.length); const extra = [];
      for (let i = 0; i < spare; i++) extra.push({ t: Math.min(K - 1, Math.floor(i * K / spare)), spare: true });
      const out = []; let last = null;
      for (let t = 0; t < K; t++) {
        units.filter(u => u.t === t).forEach(u => { out.push(u); last = u; });
        extra.filter(e => e.t === t).forEach(e => { // pengukuhan: ulang pelajaran terakhir (kandungan DSKP sama), bukan kandungan baharu
          out.push(last ? Object.assign({}, last, { spare: true, t }) : { t, kind: 'ulangkaji', content: [], sk: [], sp: [], spare: true });
        });
      }
      units = out;
    }
    if (built.overflow) units = units.slice(0, capacity);
    return { level: chosen, units, overflow: built.overflow || 0, spare: Math.max(0, spare), issues: built.issues, dropped: built.overflow ? built.units.slice(capacity) : [] };
  }
  const unitKey = u => `${u.kind}|${(u.content || []).join('~')}`;
  function baUnitName(opt, M, tIdx, notes) {
    const us = opt.units; if (!us || !us.length) return { unit: null, src: null };
    const th = M.themes[tIdx]; if (!th) return { unit: null, src: null };
    const byTheme = us.find(u => u.theme && (u.theme === th.name || u.theme === nameIn(th.nameObj, 'ms')));
    if (byTheme) return { unit: nameIn(byTheme.name, 'ar'), src: 'dibekalkan guru; padanan unit-tema daripada RPT/pilihan guru' };
    return { unit: null, src: null };
  }
  function fillBa(ctx) {
    const { cur, year, opt } = ctx; const M = baModel(cur, year, opt.units); const issues = [];
    const contentWeeks = ctx.fillRows.filter(r => r.status === 'pdp');
    const lpw = ctx.lpw; const span = ctx.lpwKnown ? Math.max(1, Math.round(2 / Math.max(1, Math.min(2, lpw)))) : 1;
    const capacity = Math.floor(contentWeeks.length / span);
    if (!M.themes.length) issues.push({ level: 'warn', msg: `${NO_DATA}: tema (محاور) tiada dalam DSKP — agihan tema tidak dapat dibuat.` });
    const P = baPlan(M, capacity, opt, ctx.doneKeys);
    issues.push(...P.issues);
    if (P.overflow) issues.push({ level: 'warn', msg: `Minggu PdP tidak mencukupi: ${P.overflow} unit kandungan tidak muat walaupun pada kadar terpantas. Tambah minggu PdP atau kurangkan ulang kaji/program.` });
    const lessonsByWeek = new Map();
    let wi = 0;
    P.units.forEach(u => {
      const un = baUnitName(opt, M, u.t, issues);
      for (let s = 0; s < span && wi < contentWeeks.length; s++, wi++) {
        const th = M.themes[Math.min(u.t, M.themes.length - 1)] || null;
        lessonsByWeek.set(contentWeeks[wi].week, [{
          kind: u.kind, theme: th ? th.name : null, unit: un.unit, unitSource: un.src, topic: null, content: s === 0 ? u.content.slice() : u.content.slice(), sk: u.sk.slice(), sp: u.sp.slice(),
          note: s ? 'Sambungan (kadar pengajaran ikut bilangan slot seminggu)' : (u.spare ? 'Pengukuhan (cadangan): ulang kandungan pelajaran terdahulu — tiada kandungan baharu' : null),
          derivation: 'dskp-tema', review: true, continuation: (s > 0 || u.spare) ? true : undefined, _t: u.t,
        }]);
      }
    });
    if (opt.units && opt.units.length && !opt.units.some(u => u.theme)) issues.push({ level: 'warn', msg: 'Unit buku teks dibekalkan tetapi padanan unit → tema DSKP tidak diketahui; nama unit tidak diisi (tidak dipadankan ikut urutan). Nyatakan tema bagi setiap unit atau import RPT lama yang ada pemetaan unit.' });
    if (opt.units && opt.units.some(u => u.theme) && !opt.units.every(u => M.themes.some(t => t.name === u.theme || t.name === nameIn(t.nameObj, 'ms') || nameIn(t.nameObj, 'ms') === u.theme))) issues.push({ level: 'warn', msg: 'Sebahagian tema unit tiada dalam senarai tema DSKP — semak ejaan tema.' });
    if (!opt.units || !opt.units.length) issues.push({ level: 'info', msg: 'Nama unit buku teks tidak dibekalkan — medan Unit dibiarkan kosong (tidak direka). Bekalkan senarai unit untuk memenuhinya.' });
    if (M.alphabet === null && !M.focus.length) issues.push({ level: 'warn', msg: `${NO_DATA}: senarai huruf (فهرس الحروف المركزة) tidak dijumpai dalam teks SK DSKP.` });
    return { lessonsByWeek, issues, meta: { level: P.level.id, levelParams: P.level, units: P.units.length, spare: P.spare, overflow: P.overflow, span, capacity, themes: M.themes.length }, model: M };
  }

  // ---------------------------------------------------------------------------------------------------
  // 5. Pengagih: Pendidikan Islam / Jawi (bidang)
  // ---------------------------------------------------------------------------------------------------
  function patternStats(rpt) {
    if (!rpt) return null; const weeks = rpt.weeks || []; if (!weeks.length) return null;
    const cnt = {}, order = []; let nLessonWeeks = 0, total = 0; let khatam = null;
    weeks.forEach(w => { const ls = (w.lessons || []).filter(l => l.kind === 'lesson'); if (ls.length) { nLessonWeeks++; total += ls.length; } (w.lessons || []).forEach(l => { if (l.kind === 'khatam' && !khatam) khatam = { skText: l.skText || null, spText: l.spText || null, bidang: l.bidang || null }; if (l.kind === 'lesson' && l.bidangId) { cnt[l.bidangId] = (cnt[l.bidangId] || 0) + 1; if (!order.includes(l.bidangId)) order.push(l.bidangId); } }); });
    const fixed = order.filter(b => cnt[b] >= 0.9 * nLessonWeeks);
    return { counts: cnt, order, fixed, rotating: order.filter(b => !fixed.includes(b)), lessonsPerWeek: nLessonWeeks ? Math.round(total / nLessonWeeks) : null, weeksUsed: nLessonWeeks, khatam };
  }
  function findRpt(key) {
    if (!key) return null; const all = S().get('rpt') || {}; if (all[key]) return all[key];
    const ays = (S().get('academicYears') || { years: [] }).years || [];
    for (const ay of ays) { try { const r = (S().get('rpt', ay.id) || {})[key]; if (r) return r; } catch (e) { /* abaikan */ } }
    return null;
  }
  function quranTopic(sk, lang) {
    const m = String(sk.text || '').match(/سورة\s+[^\s،.]+/);
    const strand = sk.strand ? nameIn(sk.strand, 'jawi') : '';
    if (m) return strand ? `${strand}: ${m[0]}` : m[0];
    return null;
  }
  function layBlocks(blocks, N) {
    // blocks: [{w: weight, ...}] → weeks per block (jumlah = N, minimum 1 jika muat)
    const m = blocks.length; const out = new Array(m).fill(0);
    if (!m || N <= 0) return out;
    if (N < m) { for (let i = 0; i < N; i++) out[i] = 1; return out; }
    return apportion(blocks.map(b => b.w), N, 1);
  }
  /** Agih SP sebuah SK ke w minggu: w < n → kumpulan bersebelahan; w >= n → setiap SP satu larian minggu (minggu seterusnya = sambungan). */
  function windows(sps, w) {
    const n = sps.length; const out = [];
    if (!n || w <= 0) return out;
    if (w >= n) { sps.forEach((c, i) => { const st = Math.floor(i * w / n), en = Math.floor((i + 1) * w / n); for (let j = st; j < en; j++) out.push({ sp: [c], cont: j > st }); }); return out; }
    balanced(sps, w).forEach(g => out.push({ sp: g, cont: false }));
    return out;
  }
  function fillPi(ctx) {
    const { cur, year, opt } = ctx; const issues = []; const lang = 'jawi';
    const sks = walkSk(cur); const doms = (cur.domains || []).map(d => ({ d, id: bidangIdOf(d), sks: sks.filter(s => s.domain === d) })).filter(x => x.sks.length);
    const done = ctx.doneSp || new Set();
    const pat = opt.patternFrom ? patternStats(findRpt(opt.patternFrom)) : null;
    if (opt.patternFrom && !pat) issues.push({ level: 'warn', msg: `RPT rujukan "${opt.patternFrom}" tiada atau tiada format minggu — corak lalai digunakan.` });
    const fixedIds = pat && pat.fixed.length ? pat.fixed.filter(id => doms.some(x => x.id === id)) : doms.filter(x => x.id === 'quran' || x.id === 'jawi').map(x => x.id);
    const fixedDoms = fixedIds.map(id => doms.find(x => x.id === id)).filter(Boolean);
    let rotDoms = doms.filter(x => !fixedIds.includes(x.id));
    if (pat && pat.rotating.length) { const ord = pat.rotating.filter(id => rotDoms.some(x => x.id === id)); rotDoms = [...ord.map(id => rotDoms.find(x => x.id === id)), ...rotDoms.filter(x => !ord.includes(x.id))]; }
    const minLpw = fixedDoms.length + (rotDoms.length ? 1 : 0);
    let lpw = ctx.lpwRaw === 'auto' || ctx.lpwRaw == null ? (pat && pat.lessonsPerWeek ? pat.lessonsPerWeek : minLpw) : Math.max(1, Math.round(+ctx.lpwRaw));
    if (lpw < minLpw) { issues.push({ level: 'warn', msg: `lessonsPerWeek ${lpw} kurang daripada corak minimum PI (${minLpw}: ${fixedDoms.length} bidang tetap + 1 bidang giliran); ${minLpw} digunakan.` }); lpw = minLpw; }
    const lanes = rotDoms.length ? Math.max(1, lpw - fixedDoms.length) : 0;
    const contentWeeks = ctx.fillRows.filter(r => r.status === 'pdp');
    const N = contentWeeks.length;
    const weights = Object.assign({}, opt.bidangWeights || {});
    const skW = (dom, sk, nSp) => { const base = nSp; const wb = weights[dom.id] != null ? +weights[dom.id] : (pat && pat.counts[dom.id] != null && !(opt.bidangWeights && opt.bidangWeights[dom.id] != null) ? pat.counts[dom.id] : null); if (wb == null) return base; const tot = dom.sks.reduce((a, s) => a + Math.max(1, s.sps.filter(p => !done.has(p.code)).length), 0) || 1; return base * wb / tot; };
    const live = s => { const sps = s.sps.filter(p => !done.has(p.code)).map(p => p.code); return sps; };
    const bidangLabel = d => nameIn(d.name, 'jawi');
    const lessonsByWeek = new Map(contentWeeks.map(r => [r.week, []]));
    const lastByLane = {};
    const mkLesson = (dom, sk, sps, cont, extra) => {
      const spSel = sps.slice(); const L = { kind: 'lesson', bidangId: dom.id, bidang: bidangLabel(dom.d), strand: sk.strand ? nameIn(sk.strand, 'jawi') : undefined, topic: dom.id === 'quran' ? quranTopic(sk, lang) : null, sk: [sk.code], sp: spSel, derivation: 'dskp-bidang', review: true };
      if (cont) { L.continuation = true; L.note = 'Sambungan'; }
      return Object.assign(L, extra || {});
    };
    // lorong tetap (Quran, Jawi): blok SK mengikut urutan DSKP
    fixedDoms.forEach(dom => {
      const blocks = dom.sks.map(s => ({ s, sps: live(s), w: Math.max(1, live(s).length) })).filter(b => b.sps.length);
      const wk = layBlocks(blocks, N); let wi = 0;
      blocks.forEach((b, bi) => {
        const win = windows(b.sps, wk[bi] || 0);
        win.forEach(x => { if (wi < N) { lessonsByWeek.get(contentWeeks[wi].week).push(mkLesson(dom, b.s, x.sp, x.cont)); wi++; } });
      });
      if (blocks.length === 0) issues.push({ level: 'info', msg: `Bidang ${dom.id}: semua SP sudah dikunci/dirancang.` });
      if (blocks.reduce((a, b, i) => a + (wk[i] ? 0 : 1), 0)) issues.push({ level: 'warn', msg: `Bidang ${dom.id}: minggu PdP tidak mencukupi bagi semua SK (${blocks.filter((b, i) => !wk[i]).length} SK tidak muat).` });
    });
    // lorong giliran: SK bergilir antara bidang (round-robin ikut indeks SK)
    if (rotDoms.length) {
      const queue = []; const maxk = Math.max(...rotDoms.map(x => x.sks.length));
      for (let r = 0; r < maxk; r++) rotDoms.forEach(dom => { const s = dom.sks[r]; if (s && live(s).length) queue.push({ dom, s, sps: live(s), w: skW(dom, s, live(s).length) }); });
      for (let ln = 0; ln < lanes; ln++) {
        const q = queue.filter((_, i) => i % lanes === ln);
        const wk = layBlocks(q, N); let wi = 0;
        q.forEach((b, bi) => { windows(b.sps, wk[bi] || 0).forEach(x => { if (wi < N) { lessonsByWeek.get(contentWeeks[wi].week).push(mkLesson(b.dom, b.s, x.sp, x.cont, { lane: ln })); wi++; } }); });
        const lost = q.filter((_, i) => !wk[i]); if (lost.length) issues.push({ level: 'warn', msg: `Minggu PdP tidak mencukupi bagi ${lost.length} SK giliran (${lost.map(b => b.s.code).join(', ')}).` });
      }
    }
    return { lessonsByWeek, issues, meta: { lpw, lanes, fixed: fixedDoms.map(x => x.id), rotating: rotDoms.map(x => x.id), patternFrom: opt.patternFrom || null, contentWeeks: N, patternStats: pat }, pat, doms };
  }

  // ---------------------------------------------------------------------------------------------------
  // 6. Pengagih: generik (urutan DSKP)
  // ---------------------------------------------------------------------------------------------------
  function fillGeneric(ctx) {
    const { cur, opt } = ctx; const issues = [];
    const done = ctx.doneSp || new Set(); const sw = opt.spWeights || {};
    const items = [];
    walkSk(cur).forEach(s => { const sps = s.sps.filter(p => !done.has(p.code)); if (!s.sps.length) { if (!done.has('SK:' + s.code)) items.push({ s, sp: null, w: 1 }); } else sps.forEach(p => items.push({ s, sp: p, w: Math.max(1, +sw[p.code] || 1) })); });
    const contentWeeks = ctx.fillRows.filter(r => r.status === 'pdp');
    const L = Math.max(1, ctx.lpw); const cap = contentWeeks.length * L;
    const Tw = items.reduce((a, b) => a + b.w, 0);
    const lessonsByWeek = new Map(contentWeeks.map(r => [r.week, []]));
    if (!items.length || !cap) return { lessonsByWeek, issues: items.length ? [{ level: 'warn', msg: 'Tiada minggu PdP untuk diagihkan.' }] : [], meta: { lpw: L, capacity: cap, total: Tw } };
    const f = cap / Tw; const slots = Array.from({ length: cap }, () => []); let cum = 0;
    items.forEach(it => {
      const A = cum * f; cum += it.w; const B = cum * f;
      let st, en;
      if (f < 1) { st = Math.min(cap - 1, Math.floor(A + 1e-9)); en = st + 1; } else { st = Math.min(cap - 1, Math.round(A)); en = Math.min(cap, Math.max(st + 1, Math.round(B))); }
      for (let j = st; j < en; j++) slots[j].push({ it, cont: j > st });
    });
    const spill = [];
    slots.forEach((arr, j) => {
      if (!arr.length) { const prev = slots[j - 1] && slots[j - 1].length ? slots[j - 1][slots[j - 1].length - 1] : null; if (prev) arr.push({ it: prev.it, cont: true }); }
      if (!arr.length) return;
      const wk = contentWeeks[Math.floor(j / L)];
      const sks = uniq(arr.map(x => x.it.s.code)); const sps = arr.filter(x => x.it.sp && !x.cont).map(x => x.it.sp.code);
      const allCont = arr.every(x => x.cont);
      const first = arr[0].it;
      const les = { kind: 'lesson', bidangId: first.s.domain.code != null ? String(first.s.domain.code) : null, bidang: domName(first.s.domain, ctx.lang), strand: first.s.strand ? textOf(first.s.strand) : undefined, topic: null, sk: sks, sp: allCont ? arr.filter(x => x.it.sp).map(x => x.it.sp.code) : sps, derivation: 'dskp-urutan', review: true };
      if (allCont) { les.continuation = true; les.note = 'Sambungan'; }
      lessonsByWeek.get(wk.week).push(les);
    });
    if (items.length && !opt.units) issues.push({ level: 'info', msg: 'Topik/unit buku teks tidak dibekalkan — medan topik dibiarkan kosong (tidak direka).' });
    return { lessonsByWeek, issues, meta: { lpw: L, capacity: cap, total: Tw, factor: +f.toFixed(3) } };
  }

  // ---------------------------------------------------------------------------------------------------
  // 7. generate / reflow / validate / coverage
  // ---------------------------------------------------------------------------------------------------
  function headerFor(subjectId, year, cur, opt) {
    const sc = S().get('school') || {}; const te = S().get('teacher') || {}; const sj = S().subject(subjectId) || {}; const ay = S().academicYear() || {};
    const panel = (sc.subjectPanels || {})[subjectId] || {};
    let session = sc.session || te.session || '';
    const ttv = (S().get('timetable') || { versions: [] }).versions || [];
    for (const v of ttv) { const sl = (v.slots || []).find(s => s.kind === 'PdP' && s.subjectId === subjectId); if (sl && sl.start && U().session) { session = U().session(sl.start) || session; break; } }
    const y0 = ay.id || String(new Date().getFullYear());
    return {
      schoolName: sc.name || '', schoolAddress: sc.address || undefined,
      subjectName: Object.assign({}, sj.name || {}), yearLabel: `Tahun ${year}`, session, sessionLabel: /^\d{4}$/.test(y0) ? `${y0}/${+y0 + 1}` : y0,
      preparedBy: { name: te.fullName || te.name || '', position: te.position || '' }, checkedBy: { name: panel.head || '', position: panel.role || '' },
      approvedBy: { name: sc.headmaster || '', position: sc.headmaster ? 'Guru Besar' : '' },
      curriculumTitle: cur && cur.source ? cur.source.title || '' : '',
    };
  }
  function mkWeek(r, subjectId) {
    return { week: r.week, rptWeek: (RPH.cal && RPH.cal.rptWeek) ? RPH.cal.rptWeek(r.week, subjectId) : r.week, kpmWeek: r.kpmWeek, term: r.term, start: r.start, end: r.end, pdpDays: r.pdpDays, status: r.status, events: (r.events || []).slice(), lessons: [], note: undefined, reason: r.reason, datesAsPrinted: datesPrinted(r.start, r.end) };
  }
  const STATUS_NOTE = { cuti: 'CUTI', peperiksaan: 'PEPERIKSAAN', ulangkaji: 'ULANG KAJI', program: 'PROGRAM', orientasi: 'MINGGU PEMBUKAAN SEKOLAH' };
  function statusNote(r) {
    const ev = (r.events || []).filter(e => !/^Cuti/i.test(e));
    if (r.status === 'peperiksaan') { const m = (r.reason || '').match(/Peperiksaan:\s*([^()]*)/); return `PEPERIKSAAN${m ? ' ' + m[1].replace(/\.\s*$/, '').trim() : ''}`; }
    if (r.status === 'cuti') return `CUTI${(r.events || []).length ? ' — ' + r.events.filter(e => /cuti/i.test(e)).join('; ') : ''}`.replace(/\s—\s$/, '');
    if (r.status === 'program' || r.status === 'orientasi') return ev.length ? ev.join('; ') : STATUS_NOTE[r.status];
    return STATUS_NOTE[r.status] || undefined;
  }

  function buildPlan(args) {
    const { subjectId, year, opt, rows, locked, prev } = args; const issues = [];
    const family = opt.family; const cur = S().curriculum(subjectId, year);
    const plan = {
      id: prev ? prev.id : U().uid('rptplan'), status: 'draf', generatedAt: U().nowIso(), subjectId, year: +year, academicYearId: S().activeYear(), lang: opt.lang, family, options: clone(opt),
      header: prev ? clone(prev.header) : headerFor(subjectId, year, cur, opt), weeks: rows.map(r => mkWeek(r, subjectId)), breaks: [], coverage: null, issues,
    };
    // cuti penggal / perayaan di antara minggu takwim (baris cuti tanpa nombor minggu)
    const src = calSource();
    plan.breaks = (src.breaks || []).filter(b => /penggal|pertengahan|akhir|persekolahan/i.test(b.name) && b.end > b.start).filter(b => rows.length && b.end >= rows[0].start && b.start <= rows[rows.length - 1].end).map(b => ({ name: b.name, start: b.start, end: b.end, afterWeek: (rows.filter(r => r.end < b.start).pop() || {}).week || null }));
    if (!rows.length) { issues.push({ level: 'error', msg: `${NO_DATA}: takwim sekolah tiada. Import takwim (atau Kalendar Akademik KPM untuk takwim asas).` }); plan.coverage = coverageOf(plan, cur); return plan; }
    if (!cur) { issues.push({ level: 'error', msg: `${NO_DATA}: DSKP ${subjectId} Tahun ${year} tiada — tiada kod SK/SP untuk diagihkan.` }); rows.forEach((r, i) => finalizeNonContent(plan.weeks[i], r, family)); plan.coverage = coverageOf(plan, cur); return plan; }
    const lpwInfo = lessonsPerWeekFor(subjectId, year, opt);
    const lockedSet = new Set((locked || []).map(Number));
    const fillRows = rows.filter(r => !lockedSet.has(r.week));
    const pinned = {}; const doneSp = new Set(), doneKeys = new Set();
    if (prev) prev.weeks.filter(w => lockedSet.has(w.week)).forEach(w => (w.lessons || []).forEach(l => { (l.sp || []).forEach(c => { if (!l.continuation) doneSp.add(c); }); if (!(l.sp || []).length && l.sk && l.sk.length && family === 'generic' && !l.continuation) l.sk.forEach(c => doneSp.add('SK:' + c)); if (family === 'ba') doneKeys.add(`${l.kind}|${(l.content || []).join('~')}`); }));
    const ctx = { cur, year, opt, rows, fillRows, lpw: lpwInfo.value, lpwKnown: lpwInfo.known, lpwRaw: opt.lessonsPerWeek, lang: opt.lang, doneSp, doneKeys };
    let R;
    if (family === 'ba') R = fillBa(ctx); else if (family === 'pi') R = fillPi(ctx); else R = fillGeneric(ctx);
    plan.meta = Object.assign({ family, lessonsPerWeek: lpwInfo, algorithm: family === 'ba' ? 'ba-tema' : family === 'pi' ? 'pi-bidang' : 'generik-urutan' }, R.meta);
    issues.push(...R.issues);
    if (lpwInfo.note) issues.push({ level: 'info', msg: lpwInfo.note });
    let lastLessons = [];
    plan.weeks.forEach((w, i) => {
      const r = rows[i];
      if (lockedSet.has(w.week) && prev) { const pw = prev.weeks.find(x => x.week === w.week); w.lessons = clone(pw.lessons); w.note = pw.note; w.status = pw.status; w.locked = true; return; }
      const ls = R.lessonsByWeek.get(w.week);
      if (ls && ls.length) {
        w.lessons = ls.map(l => { const x = Object.assign({}, l); delete x._t; return x; });
        if (family === 'pi' && opt.includeKhatam) w.lessons.unshift(khatamLesson(args.khatam, issues, w));
        lastLessons = w.lessons.filter(l => l.kind !== 'khatam');
        w.note = undefined;
      } else if (r.status === 'ulangkaji') {
        reviseLessons(w, family, lastLessons, opt, args.khatam, issues);
        w.note = 'ULANG KAJI';
      } else finalizeNonContent(w, r, family, opt, args.khatam, issues);
    });
    fillTopicI18n(plan.weeks.filter(w => !w.locked), { family, subjectId, year: +year });
    if (family === 'pi' && opt.includeKhatam && !(args.khatam && (args.khatam.skText || args.khatam.spText))) issues.push({ level: 'warn', msg: `Baris Khatam: ${NO_DATA} — teks SK/SP Khatam tiada dalam DSKP. Import RPT lama (corak) yang mengandunginya atau isi sendiri.` });
    plan.coverage = coverageOf(plan, cur);
    plan.issues = issues.concat(validate(plan, true));
    plan.issues.push({ level: 'info', msg: 'Semua agihan ialah cadangan (DRAF) — semak setiap minggu, kemudian tekan "Sahkan".' });
    return plan;
  }
  function khatamLesson(kh, issues, w) {
    const L = { kind: 'khatam', bidangId: 'khatam', bidang: (RPH.banks && RPH.banks.item('pi-bidang', 'khatam') || {}).jawi || null, topic: null, sk: [], sp: [], skText: kh && kh.skText || null, spText: kh && kh.spText || null, derivation: kh && (kh.skText || kh.spText) ? 'rpt-lama' : 'manual', review: true };
    if (!L.skText) delete L.skText; if (!L.spText) delete L.spText;
    return L;
  }
  function reviseLessons(w, family, last, opt, kh, issues) {
    if (family === 'ba') { w.lessons = [{ kind: 'ulangkaji', theme: null, unit: null, topic: null, content: [], sk: [], sp: [], note: 'ULANG KAJI', derivation: 'manual', review: true }]; return; }
    const base = (last || []).map(l => { const x = clone(l); x.continuation = true; x.note = 'Ulang kaji'; x.review = true; if (family === 'pi') x.topic = '(اولڠكاجي)'; delete x.lane; return x; });
    w.lessons = base.length ? base : [{ kind: 'ulangkaji', topic: null, sk: [], sp: [], note: 'Ulang kaji', derivation: 'manual', review: true }];
    if (family === 'pi' && opt.includeKhatam) w.lessons.unshift(khatamLesson(kh, issues, w));
  }
  function finalizeNonContent(w, r, family, opt, kh, issues) {
    w.note = statusNote(w);
    const text = w.note;
    if (family === 'ba') { w.lessons = [{ kind: baKindOfStatus(w), theme: null, unit: null, topic: null, content: contentOfEvents(w), sk: [], sp: [], note: null, derivation: 'manual', review: true }]; return; }
    const k = ({ cuti: 'cuti', peperiksaan: 'peperiksaan', program: 'program', orientasi: 'program' })[w.status] || 'program';
    w.lessons = [{ kind: k, topic: text || null, sk: [], sp: [], derivation: 'manual', review: true }];
    if (family === 'pi' && opt && opt.includeKhatam && ['program', 'peperiksaan'].includes(w.status)) w.lessons.push(khatamLesson(kh, issues, w));
  }
  const baKindOfStatus = w => (w.status === 'program' ? (/pasca|selepas peperiksaan/i.test(w.reason || '') ? 'program-pasca-peperiksaan' : 'program') : ({ cuti: 'cuti', peperiksaan: 'peperiksaan', ulangkaji: 'ulangkaji', orientasi: 'program' })[w.status] || 'program');
  const contentOfEvents = w => {
    if (w.status === 'cuti') return [];
    const ev = (w.events || []).filter(e => !/^Cuti/i.test(e));
    const pick = w.status === 'peperiksaan' ? ev.filter(e => RE_EXAM.test(e)) : w.status === 'program' ? ev.filter(e => RE_POST.test(e)) : [];
    return (pick.length ? pick : ev).slice(0, 4);
  };

  function lessonsPerWeekFor(subjectId, year, opt) {
    if (opt.lessonsPerWeek !== 'auto' && opt.lessonsPerWeek != null && +opt.lessonsPerWeek > 0) return { value: Math.round(+opt.lessonsPerWeek), source: 'pilihan guru', note: null, known: true };
    const tt = timetableInfo(subjectId, year);
    if (tt.ok) return { value: tt.slotsPerWeek, source: `jadual waktu (${tt.slotsPerWeek} slot PdP/minggu)`, note: null, known: true };
    return { value: 1, source: 'lalai', known: false, note: 'Jadual waktu tiada slot untuk subjek-tahun ini — 1 pelajaran seminggu digunakan (Bahasa Arab: satu baris seminggu; kadar tidak diperlahankan).' };
  }

  function loadPatternKhatam(opt, subjectId) {
    let st = opt.patternFrom ? patternStats(findRpt(opt.patternFrom)) : null;
    if (st && st.khatam) return st.khatam;
    // RPT PI lain yang tersimpan: ambil teks Khatam (teks am Khatam, bukan daripada DSKP) — ditanda 'rpt-lama'
    const ays = (S().get('academicYears') || { years: [] }).years || [];
    for (const ay of ays) { let all = {}; try { all = S().get('rpt', ay.id) || {}; } catch (e) { all = {}; } for (const r of Object.values(all)) { if (r && (r.subjectId === 'PI' || r.subjectId === subjectId)) { const s = patternStats(r); if (s && s.khatam) return s.khatam; } } }
    return null;
  }

  function generate(input) {
    const { subjectId, year } = input; const opt = mergeOptions(subjectId, year, input.options);
    let rows = weekTable(subjectId, year, opt);
    if (input.weekStatus) rows = applyStatus(rows, input.weekStatus);
    return buildPlan({ subjectId, year, opt, rows, khatam: opt.family === 'pi' ? loadPatternKhatam(opt, subjectId) : null });
  }
  function applyStatus(rows, map) {
    return rows.map(r => { const s = map[r.week]; if (!s || s === r.status) return r; return Object.assign({}, r, { status: s, reason: `Status ditetapkan guru: ${s}.` }); });
  }
  function reflow(plan, o) {
    const locked = (o && o.lockedWeeks) || [];
    const opt = clone(plan.options); const subjectId = plan.subjectId, year = plan.year;
    const rows = plan.weeks.map(w => ({ week: w.week, start: w.start, end: w.end, term: w.term, kpmWeek: w.kpmWeek, pdpDays: w.pdpDays, status: w.status, events: (w.events || []).slice(), reason: w.reason || '', slots: null }));
    const np = buildPlan({ subjectId, year, opt, rows, locked, prev: plan, khatam: opt.family === 'pi' ? loadPatternKhatam(opt, subjectId) : null });
    np.generatedAt = U().nowIso();
    return np;
  }

  function coverageOf(plan, cur) {
    const out = { sk: { total: 0, planned: 0, missing: [] }, sp: { total: 0, planned: 0, missing: [], repeated: [] } };
    cur = cur || S().curriculum(plan.subjectId, plan.year); if (!cur) return out;
    const all = walkSk(cur); const baFam = plan.family === 'ba';
    const skSeen = new Set(), spSeen = new Map();
    (plan.weeks || []).forEach(w => (w.lessons || []).forEach(l => {
      (l.sk || []).forEach(c => skSeen.add(c));
      if (!l.continuation) (l.sp || []).forEach(c => spSeen.set(c, (spSeen.get(c) || 0) + 1));
    }));
    out.sk.total = all.length; out.sk.planned = all.filter(s => skSeen.has(s.code)).length; out.sk.missing = all.filter(s => !skSeen.has(s.code)).map(s => s.code);
    const allSp = all.flatMap(s => s.sps.map(p => ({ code: p.code, sk: s.code })));
    out.sp.total = allSp.length;
    const planned = p => spSeen.has(p.code) || (baFam && skSeen.has(p.sk));
    out.sp.planned = allSp.filter(planned).length; out.sp.missing = allSp.filter(p => !planned(p)).map(p => p.code);
    out.sp.repeated = [...spSeen.entries()].filter(([, n]) => n > 1).map(([c]) => c).sort(codeSort);
    return out;
  }
  function coverage(plan) { return coverageOf(plan, null); }

  /** Semak plan: kod tiada dalam DSKP, SP luar SK, SP tertinggal/berulang, minggu PdP kosong, lebihan unit. */
  function validate(plan, _internal) {
    const issues = []; const cur = S().curriculum(plan.subjectId, plan.year);
    if (!cur) { issues.push({ level: 'error', msg: `${NO_DATA}: DSKP ${plan.subjectId} Tahun ${plan.year} tiada.` }); return _internal ? issues : issues; }
    const { sk, sp } = allCodes(cur);
    (plan.weeks || []).forEach(w => {
      (w.lessons || []).forEach((l, i) => {
        (l.sk || []).forEach(c => { if (!sk.has(c)) issues.push({ level: 'error', msg: `Minggu ${w.week}: kod SK ${c} tiada dalam DSKP.`, ref: `M${w.week}` }); });
        (l.sp || []).forEach(c => { if (!sp.has(c)) issues.push({ level: 'error', msg: `Minggu ${w.week}: kod SP ${c} tiada dalam DSKP.`, ref: `M${w.week}` }); });
        const orphan = (l.sp || []).filter(c => sp.has(c) && (l.sk || []).length && !(l.sk || []).some(k => c.startsWith(k + '.')));
        if (orphan.length) issues.push({ level: 'error', msg: `Minggu ${w.week}: SP ${orphan.join(', ')} bukan di bawah SK ${(l.sk || []).join(', ')}.`, ref: `M${w.week}` });
      });
      if (w.status === 'pdp' && !(w.lessons || []).length) issues.push({ level: 'warn', msg: `Minggu ${w.week} ialah minggu PdP tetapi tiada pelajaran.`, ref: `M${w.week}` });
      if (w.status === 'pdp' && (w.lessons || []).length && (w.lessons || []).every(l => l.review === false) === false && false) { /* tempat simpanan */ }
    });
    const cov = coverageOf(plan, cur);
    if (cov.sp.missing.length) issues.push({ level: 'warn', msg: `${cov.sp.missing.length} SP tidak dirancang: ${cov.sp.missing.slice(0, 12).join(', ')}${cov.sp.missing.length > 12 ? '…' : ''}.`, ref: 'liputan' });
    if (cov.sk.missing.length) issues.push({ level: 'warn', msg: `${cov.sk.missing.length} SK tidak dirancang: ${cov.sk.missing.join(', ')}.`, ref: 'liputan' });
    if (cov.sp.repeated.length) issues.push({ level: plan.family === 'ba' ? 'info' : 'warn', msg: `${cov.sp.repeated.length} SP dirancang lebih sekali: ${cov.sp.repeated.slice(0, 12).join(', ')}.`, ref: 'liputan' });
    if (plan.meta && plan.meta.overflow) issues.push({ level: 'warn', msg: `Lebihan ${plan.meta.overflow} unit kandungan tidak muat dalam minggu PdP.`, ref: 'agihan' });
    return issues;
  }

  // ---------------------------------------------------------------------------------------------------
  // 8. Simpanan: toStored / fromStored / save
  // ---------------------------------------------------------------------------------------------------
  const BA_STATUS_KIND = { cuti: 'cuti', peperiksaan: 'peperiksaan', ulangkaji: 'ulangkaji', program: 'program', orientasi: 'program' };
  function toStored(plan) {
    const key = `${plan.subjectId}-${plan.year}`;
    const base = {
      schemaVersion: '1.0.0', type: 'rpt', id: `RPT-${plan.subjectId}-T${plan.year}-${plan.academicYearId}`, subjectId: plan.subjectId, year: plan.year, academicYearId: plan.academicYearId,
      source: { file: 'Penjana RPT (Smart RPH Generator)', generatedAt: plan.generatedAt, titleAsPrinted: plan.header && plan.header.curriculumTitle || undefined, preparedBy: plan.header && plan.header.preparedBy && plan.header.preparedBy.name || undefined, checkedBy: plan.header && plan.header.checkedBy && plan.header.checkedBy.name || undefined, approvedBy: plan.header && plan.header.approvedBy && plan.header.approvedBy.name || undefined },
      status: plan.status, confirmedAt: plan.confirmedAt || undefined, family: plan.family, lang: plan.lang, header: clone(plan.header), options: clone(plan.options), generatedBy: 'rptgen', updatedAt: U().nowIso(),
      codePolicy: 'Kod SK/SP hanya daripada DSKP. Setiap baris cadangan (review) sehingga disahkan guru.', key,
    };
    if (plan.family === 'ba') {
      const rows = [];
      const brk = (plan.breaks || []).slice();
      const pushBreaks = (afterWeek) => brk.filter(b => b.afterWeek === afterWeek).forEach(b => rows.push({ rptWeek: null, datesAsPrinted: datesPrinted(b.start, b.end), unit: null, theme: null, kind: 'cuti', content: [b.name], note: b.name, skCandidates: [], spCandidates: [], derivation: null }));
      pushBreaks(null);
      plan.weeks.forEach(w => {
        const l = (w.lessons || [])[0] || {};
        const lessonKind = w.status === 'pdp' ? (l.kind || 'ulangkaji') : (w.status === 'program' && ['program', 'program-pasca-peperiksaan'].includes(l.kind) ? l.kind : baKindOfStatus(w));
        rows.push({
          rptWeek: w.rptWeek, datesAsPrinted: w.datesAsPrinted || datesPrinted(w.start, w.end), unit: l.unit || null, unitSource: l.unitSource || undefined, theme: l.theme || null, kind: lessonKind,
          content: (l.content || []).slice(), note: [l.note, w.status !== 'pdp' && l.kind !== 'ulangkaji' ? w.note : null].filter(Boolean).join(' · ') || null,
          skCandidates: (l.sk || []).slice(), spCandidates: (l.sp || []).slice(), derivation: l.derivation || null, review: l.review === false ? false : true, status: w.status, kpmWeek: w.kpmWeek, term: w.term,
        });
        pushBreaks(w.week);
      });
      base.rows = rows;
    } else {
      base.weeks = plan.weeks.map(w => ({
        rptWeek: w.rptWeek, term: w.term, status: w.status, week: w.week, start: w.start, end: w.end, note: w.note || undefined,
        lessons: (w.lessons || []).map(l => { const o = { kind: l.kind || 'lesson', bidangId: l.bidangId || undefined, bidang: l.bidang || undefined, strand: l.strand || undefined, theme: l.theme || undefined, topic: l.topic == null ? '' : l.topic, sk: (l.sk || []).slice(), sp: (l.sp || []).slice(), skText: l.skText || undefined, spText: l.spText || undefined, note: l.note || null, derivation: l.derivation || undefined, review: l.review === false ? false : true }; if (l.continuation) o.continuation = true; if (l.topicI18n && typeof l.topicI18n === 'object' && Object.keys(l.topicI18n).length) o.topicI18n = Object.assign({}, l.topicI18n); return o; }),
      }));
    }
    return base;
  }

  function fromStored(subjectId, year) {
    const rpt = S().rpt(subjectId, year); if (!rpt) return null;
    const family = rpt.family || familyFor(subjectId, year); const opt = Object.assign(defaultOptions(subjectId, year), clone(rpt.options || {}), { family });
    const src = calSource(); const cur = S().curriculum(subjectId, year);
    const issues = []; const weeks = []; const used = new Set();
    const rowsBy = new Map(); (rpt.rows || []).forEach(r => { if (r.rptWeek != null && !rowsBy.has(+r.rptWeek)) rowsBy.set(+r.rptWeek, r); });
    const wkBy = new Map(); (rpt.weeks || []).forEach(w => { if (!wkBy.has(+w.rptWeek)) wkBy.set(+w.rptWeek, w); });
    const baKind = k => ({ cuti: 'cuti', peperiksaan: 'peperiksaan', ulangkaji: 'ulangkaji', program: 'program', 'program-pasca-peperiksaan': 'program' }[k]);
    const calWeeks = src.weeks.length ? src.weeks : [];
    calWeeks.forEach(cw => {
      const rw = RPH.cal.rptWeek(cw.week, subjectId);
      const w = { week: cw.week, rptWeek: rw, kpmWeek: cw.kpmWeek != null ? cw.kpmWeek : null, term: cw.term, start: cw.start, end: cw.end, pdpDays: cw.schoolDays || 0, status: 'pdp', events: [], lessons: [], datesAsPrinted: datesPrinted(cw.start, cw.end) };
      const sd = src.days.filter(d => d.week === cw.week); const evs = []; sd.forEach(d => { if (d.holiday && !evs.includes(d.holiday)) evs.push(d.holiday); (d.events || []).forEach(e => { if (!SKIP_EV.has(e.kind) && !evs.includes(e.title)) evs.push(e.title); }); }); w.events = evs;
      if (family === 'ba' && rowsBy.has(rw)) {
        used.add(rw); const r = rowsBy.get(rw); const ks = baKind(r.kind);
        if (ks) { w.status = r.kind === 'program' && w.week === 1 ? 'orientasi' : ks; w.note = [r.content && r.content.length ? r.content.join('; ') : null, r.note].filter(Boolean).join(' · ') || undefined; w.lessons = [{ kind: r.kind, theme: r.theme || null, unit: r.unit || null, topic: null, content: (r.content || []).slice(), sk: [], sp: [], note: r.note || null, derivation: 'rpt-lama', review: false }]; }
        else w.lessons = [{ kind: r.kind, theme: r.theme || null, unit: r.unit || null, topic: r.topic || null, content: (r.content || []).slice(), sk: (r.sk || r.skCandidates || []).slice(), sp: (r.sp || r.spCandidates || []).slice(), note: r.note || null, derivation: r.derivation ? 'rpt-lama' : 'rpt-lama', review: false }];
      } else if (family !== 'ba' && wkBy.has(rw)) {
        used.add(rw); const x = wkBy.get(rw); const ls = x.lessons || [];
        const kinds = ls.map(l => l.kind || 'lesson');
        const mapped = ls.map(l => { const o = { kind: l.kind || 'lesson', bidangId: l.bidangId, bidang: l.bidang, strand: l.strand, theme: l.theme, unit: l.unit, topic: l.topic == null ? null : l.topic, sk: (l.sk || []).slice(), sp: (l.sp || []).slice(), skText: l.skText, spText: l.spText, note: l.note || null, derivation: l.derivation || 'rpt-lama', review: false }; if (l.topicI18n && typeof l.topicI18n === 'object') o.topicI18n = Object.assign({}, l.topicI18n); return o; });
        w.lessons = mapped;
        if (x.status && ['cuti', 'peperiksaan', 'program', 'orientasi', 'ulangkaji'].includes(x.status)) w.status = x.status;
        else if (!kinds.some(k => k === 'lesson') && kinds.length) { const k0 = kinds.find(k => k !== 'khatam') || kinds[0]; w.status = ({ program: /pembukaan|orientasi|فمبوكاءن|ڤمبوكاءن/.test((ls[0].topic || '') + (ls[0].topicLegacy || '')) || w.week === 1 ? 'orientasi' : 'program', cuti: 'cuti', peperiksaan: 'peperiksaan', ulangkaji: 'ulangkaji' })[k0] || 'pdp'; w.note = ls[0] && ls[0].topic || undefined; }
        else if (ls.some(l => l.kind === 'lesson' && /^\(?\s*اولڠ\s?كاجي\s*\)?$/.test(String(l.topic || '').replace(/\s+/g, ' ').trim()))) { w.note = undefined; }
      } else if (rw != null) issues.push({ level: 'warn', msg: `Minggu RPT ${rw} (minggu sekolah ${cw.week}) tiada dalam RPT tersimpan.`, ref: `M${cw.week}` });
      weeks.push(w);
    });
    const extra = [...rowsBy.keys(), ...wkBy.keys()].filter(n => !used.has(n));
    if (extra.length) issues.push({ level: 'info', msg: `Minggu RPT tersimpan yang tiada padanan minggu sekolah dalam takwim: ${uniq(extra).sort((a, b) => a - b).join(', ')}.` });
    if (!calWeeks.length) issues.push({ level: 'error', msg: `${NO_DATA}: takwim sekolah tiada — padanan minggu RPT tidak dapat dibuat.` });
    const breaks = [];
    (rpt.rows || []).filter(r => r.rptWeek == null && r.kind === 'cuti').forEach(r => breaks.push({ name: (r.content || [])[0] || r.note || 'Cuti', datesAsPrinted: r.datesAsPrinted, start: null, end: null, afterWeek: null }));
    const hdr = rpt.header ? clone(rpt.header) : headerFor(subjectId, year, cur, opt);
    const plan = {
      id: U().uid('rptplan'), status: rpt.status || 'disahkan', generatedAt: rpt.generatedAt || rpt.updatedAt || (rpt.source && rpt.source.generatedAt) || U().nowIso(), confirmedAt: rpt.confirmedAt, subjectId, year: +year, academicYearId: rpt.academicYearId || S().activeYear(), lang: rpt.lang || langFor(subjectId, family), family, options: opt, header: hdr, weeks, breaks, coverage: null, issues,
    };
    fillTopicI18n(plan.weeks, { family, subjectId, year: +year });
    plan.coverage = coverageOf(plan, cur);
    plan.issues = issues.concat(cur ? validate(plan, true) : []);
    return plan;
  }

  function save(plan) {
    const key = `${plan.subjectId}-${plan.year}`; const ayId = plan.academicYearId || S().activeYear();
    S().assertWritable(ayId);
    const stored = toStored(plan);
    S().update('rpt', d => { d[key] = stored; }, ayId);
    return key;
  }

  RPH.rptgen = { NO_DATA, sources, defaultOptions: (s, y) => defaultOptions(s, y), weekTable, generate, reflow, validate: p => validate(p), coverage, fromStored, toStored, save, kpmCheck, patternStats, timetableInfo, familyFor, datesPrinted };
})(window.RPH = window.RPH || {});
