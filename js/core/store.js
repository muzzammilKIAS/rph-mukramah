/* Stor data aplikasi: koleksi global + koleksi ikut tahun akademik, seed, CRUD, autosave. */
(function (RPH) {
  'use strict';
  const S = () => RPH.storage;
  const GLOBAL = ['school', 'teacher', 'subjects', 'templates', 'banks', 'curriculum', 'academicYears', 'settings', 'favourites', 'assessment', 'jawiLexicon', 'i18nLexicon', 'i18nTopics'];
  const PER_YEAR = ['calendar', 'timetable', 'classes', 'rpt', 'rph', 'history'];
  const cache = {};
  let savedAt = null;

  const key = (name, yearId) => (PER_YEAR.includes(name) ? `y:${yearId || store.activeYear()}:${name}` : name);

  /** Koleksi kosong bagi satu tahun akademik baharu (tiada campuran data — §76). */
  function emptyYearData(id) {
    return {
      calendar: { schemaVersion: '1.0.0', type: 'calendar', academicYearId: id, weeks: [], days: [], rptWeekMap: { default: 'A', A: { map: {} }, B: { map: {} } }, breaks: [] },
      timetable: { schemaVersion: '1.0.0', type: 'timetable', academicYearId: id, versions: [] },
      classes: { schemaVersion: '1.0.0', type: 'classes', academicYearId: id, classes: [], studentCounts: {} },
      rpt: {}, rph: {}, history: null,
    };
  }
  /** Rekod tahun akademik kosong (edisi kosong: tarikh sesi ditetapkan guru / diambil daripada takwim yang diimport). */
  function yearRecord(id, extra) {
    return { id: String(id), label: `Sesi ${id}`, startDate: null, endDate: null, rptWeekMapping: 'A', rpt: {}, rptNotes: {}, ...(extra || {}) };
  }
  /** Seed tanpa tahun (edisi kosong): `years`/`academicYears` = 'auto' atau tiada → satu tahun = tahun kalendar semasa ketika kali pertama dibuka. */
  const isAutoYears = pub => !pub.years || pub.years === 'auto' || !pub.academicYears || pub.academicYears === 'auto';

  function seed({ overwrite = false } = {}) {
    const pub = window.RPH_SEED_PUBLIC;
    if (!pub) throw new Error('Data seed awam (js/data/seed-public.js) tidak dimuatkan.');
    const priv = window.RPH_SEED_PRIVATE || null;
    const put = (k, v) => { if (overwrite || S().read(k) === undefined) S().write(k, v); };
    let academicYears = pub.academicYears, years = pub.years;
    if (Array.isArray(pub.presetYears) && pub.presetYears.length) {
      // Edisi kosong dengan tahun pratetap (cth. 2027, 2028): rekod tahun kosong, tarikh sesi diisi daripada takwim yang diimport.
      const ids = pub.presetYears.map(String);
      const active = ids.includes(String(pub.activeYear)) ? String(pub.activeYear) : ids[0];
      academicYears = { schemaVersion: '1.0.0', type: 'academic-years', activeId: active, years: ids.map(id => yearRecord(id)) };
      years = Object.fromEntries(ids.map(id => [id, emptyYearData(id)]));
    } else if (isAutoYears(pub)) {
      const id = RPH.util.todayLocal().slice(0, 4);
      academicYears = { schemaVersion: '1.0.0', type: 'academic-years', activeId: id, years: [yearRecord(id, { auto: true })] };
      years = { [id]: emptyYearData(id) };
    }
    put('school', pub.school || {});
    put('teacher', pub.teacher || {});
    put('subjects', pub.subjects || { schemaVersion: '1.0.0', type: 'subjects', subjects: [] });
    put('templates', pub.templates || {});
    put('banks', pub.banks || {});
    put('academicYears', academicYears);
    put('jawiLexicon', pub.jawiLexicon);
    put('settings', { showLogo: false, showSchoolName: false, showTeacherName: false, defaultVariant: 'standard', debugToday: null, theme: 'light' });
    put('favourites', { activities: [], pak21: [], bbm: [], reflection: [] });
    put('curriculum', priv ? priv.curriculum : {});
    put('assessment', priv ? priv.assessment : {});
    put('i18nLexicon', pub.i18nLexicon || {}); // kandungan 4 bahasa (awam) — docs/I18N_CONTRACT.md §1b
    put('i18nTopics', priv && priv.i18nTopics ? priv.i18nTopics : {}); // frasa topik RPT berlesen (peribadi)
    for (const [yid, y] of Object.entries(years)) {
      put(`y:${yid}:calendar`, y.calendar);
      put(`y:${yid}:timetable`, y.timetable);
      put(`y:${yid}:classes`, y.classes);
      put(`y:${yid}:rpt`, priv ? Object.fromEntries(Object.entries(priv.rpt).filter(([, r]) => (r.reusedFor || [r.academicYearId]).includes(yid) || r.academicYearId === yid)) : (y.rpt || {}));
      put(`y:${yid}:rph`, {});
      put(`y:${yid}:history`, priv && priv.history[yid] ? priv.history[yid] : null);
    }
    S().write('meta', { schemaVersion: '1.0.0', appVersion: RPH.VERSION, dataVersion: pub.appDataVersion, edition: pub.edition || 'asal', seededAt: RPH.util.nowIso(), logoSeeded: true, migrations: MIGRATIONS.map(m => m.id) });
  }

  /**
   * Migrasi data sekali-jalan bagi pelayar yang sudah disemai (data seed baharu tidak menimpa data guru).
   * Setiap id direkod dalam meta.migrations.
   */
  const MIGRATIONS = [
    {
      id: '2026-10-02-templat-bahasa',
      // Templat BI/Arab generik (tpl-generic-en/ar) + medan lang/langGroup + label bank en/arg bagi pelayar yang disemai lebih awal.
      // Hanya MENAMBAH: templat/medan yang guru sudah ubah tidak ditimpa.
      run() {
        const pub = window.RPH_SEED_PUBLIC; if (!pub) return;
        const tpls = S().read('templates');
        if (tpls && pub.templates) {
          for (const [id, t] of Object.entries(pub.templates)) {
            if (!tpls[id]) tpls[id] = t;
            else { if (tpls[id].lang == null && t.lang != null) tpls[id].lang = t.lang; if (tpls[id].langGroup == null && t.langGroup != null) tpls[id].langGroup = t.langGroup; }
          }
          S().write('templates', tpls);
        }
        const banks = S().read('banks');
        if (banks && pub.banks) {
          for (const [id, b] of Object.entries(pub.banks)) {
            if (!banks[id]) { banks[id] = b; continue; }
            const byId = new Map((b.items || []).map(it => [it.id, it]));
            (banks[id].items || []).forEach(it => { const src = byId.get(it.id); if (!src) return; ['en', 'arg'].forEach(k => { if (it[k] == null && src[k] != null) it[k] = src[k]; }); });
          }
          S().write('banks', banks);
        }
      },
    },
    {
      id: '2026-10-02-pai-t3-tanpa-rph',
      // Keputusan guru: "Buang RPH PAI tahun 3". Slot PI/PIQ Tahun 3 → rph:false; draf auto yang belum disunting dibuang.
      run() {
        const tt = S().read('y:2026:timetable');
        if (tt && Array.isArray(tt.versions)) {
          tt.versions.forEach(v => (v.slots || []).forEach(sl => {
            if (['PI', 'PIQ'].includes(sl.subjectId) && +sl.year === 3 && sl.rph === undefined) { sl.rph = false; sl.rphNote = 'Tanpa RPH — keputusan guru 2026-10-02.'; }
          }));
          S().write('y:2026:timetable', tt);
        }
        const rph = S().read('y:2026:rph');
        if (rph && typeof rph === 'object') {
          let n = 0;
          Object.values(rph).forEach(r => {
            // Belum disunting = disimpan dalam masa 5 s selepas dijana (autosimpan editor berlaku selepas guru mengubah sesuatu).
            const untouched = r.status === 'draft' && r.generatedBy !== 'manual' && r.createdAt && r.updatedAt && (Date.parse(r.updatedAt) - Date.parse(r.createdAt)) < 5000;
            if (['PI', 'PIQ'].includes(r.subjectId) && +r.year === 3 && untouched) { delete rph[r.id]; n++; }
          });
          if (n) S().write('y:2026:rph', rph);
        }
      },
    },
    {
      id: '2026-10-02-i18n-kandungan',
      // Kandungan 4 bahasa bagi pelayar yang disemai lebih awal: leksikon awam + frasa topik peribadi (diganti jika versi seed lebih baharu
      // dan guru belum menyuntingnya), dan medan terjemahan kurikulum (i18n / name.* / strand.* / label.* / i18nMeta) ditambah pada DSKP
      // tersimpan yang sama id — teks DSKP, kod dan suntingan guru tidak diubah; terjemahan sedia ada dikekalkan.
      run() {
        const pub = window.RPH_SEED_PUBLIC || {}; const priv = window.RPH_SEED_PRIVATE || null;
        const fresh = (cur, seedV) => seedV && (!cur || !Object.keys(cur).length || (!cur.edited && cur.version !== seedV.version));
        if (fresh(S().read('i18nLexicon'), pub.i18nLexicon)) S().write('i18nLexicon', pub.i18nLexicon);
        if (priv && fresh(S().read('i18nTopics'), priv.i18nTopics)) S().write('i18nTopics', priv.i18nTopics);
        const cur = S().read('curriculum');
        if (!priv || !priv.curriculum || !cur) return;
        const addNames = (dst, src) => { if (src && typeof src === 'object' && dst && typeof dst === 'object') for (const [l, v] of Object.entries(src)) if (dst[l] == null) dst[l] = v; };
        const addI18n = (dst, src) => { if (!dst || !src) return; if (src.i18n) dst.i18n = Object.assign({}, src.i18n, dst.i18n || {}); ['name', 'strand', 'label'].forEach(f => addNames(dst[f], src[f])); };
        for (const [k, c] of Object.entries(cur)) {
          const s = priv.curriculum[k];
          if (!c || !s || c.id !== s.id || !s.i18nMeta || c.i18nMeta) continue;
          const byCode = new Map();
          (s.domains || []).forEach(d => { byCode.set(`D${d.code}`, d); (d.contentStandards || []).forEach(sk => { byCode.set(sk.code, sk); (sk.learningStandards || []).forEach(sp => byCode.set(sp.code, sp)); (sk.performanceStandards || []).forEach(tp => byCode.set(`${sk.code}:${tp.tp}`, tp)); }); });
          (c.domains || []).forEach(d => { addI18n(d, byCode.get(`D${d.code}`)); (d.contentStandards || []).forEach(sk => { addI18n(sk, byCode.get(sk.code)); (sk.learningStandards || []).forEach(sp => addI18n(sp, byCode.get(sp.code))); (sk.performanceStandards || []).forEach(tp => addI18n(tp, byCode.get(`${sk.code}:${tp.tp}`))); }); });
          ((c.performanceStandards || {}).tables || []).forEach((t, i) => { const st = ((s.performanceStandards || {}).tables || [])[i]; (t.levels || []).forEach((l, j) => addI18n(l, st && (st.levels || [])[j])); });
          (c.themes || []).forEach(th => addI18n(th, (s.themes || []).find(x => x.name && th.name && x.name.ar === th.name.ar)));
          c.i18nMeta = s.i18nMeta;
        }
        S().write('curriculum', cur);
      },
    },
  ];
  function runMigrations() {
    const meta = S().read('meta') || {};
    const done = new Set(meta.migrations || []);
    const todo = MIGRATIONS.filter(m => !done.has(m.id));
    if (!todo.length) return;
    for (const m of todo) { try { m.run(); done.add(m.id); } catch (e) { console.error(`[migrasi ${m.id}]`, e); } }
    Object.keys(cache).forEach(k => delete cache[k]);
    S().write('meta', { ...(S().read('meta') || {}), migrations: [...done] });
  }

  const store = {
    init() {
      const meta = S().read('meta');
      if (!meta) seed();
      else if (window.RPH_SEED_PRIVATE && !Object.keys(S().read('curriculum') || {}).length) {
        // Fail peribadi baru tersedia → isi kurikulum/RPT yang kosong tanpa menyentuh RPH guru.
        const priv = window.RPH_SEED_PRIVATE;
        S().write('curriculum', priv.curriculum); S().write('assessment', priv.assessment);
        for (const y of (S().read('academicYears') || { years: [] }).years) {
          const cur = S().read(`y:${y.id}:rpt`) || {};
          if (!Object.keys(cur).length) S().write(`y:${y.id}:rpt`, Object.fromEntries(Object.entries(priv.rpt).filter(([, r]) => (r.reusedFor || []).includes(y.id) || r.academicYearId === y.id)));
          if (!S().read(`y:${y.id}:history`) && priv.history[y.id]) S().write(`y:${y.id}:history`, priv.history[y.id]);
        }
      }
      // Logo sekolah ditambah selepas data disemai → isi sekali sahaja jika guru belum menetapkan logo sendiri.
      const m2 = S().read('meta') || {}; const pubSchool = window.RPH_SEED_PUBLIC && window.RPH_SEED_PUBLIC.school;
      if (!m2.logoSeeded && pubSchool && pubSchool.logo) {
        const sc = S().read('school');
        if (sc && !sc.logo) S().write('school', { ...sc, logo: pubSchool.logo, logoSource: pubSchool.logoSource || null });
        S().write('meta', { ...m2, logoSeeded: true });
      }
      runMigrations();
      RPH.jawi.setLexicon(store.get('jawiLexicon'));
      return store;
    },
    meta: () => S().read('meta'),
    get(name, yearId) {
      const k = key(name, yearId);
      if (!(k in cache)) cache[k] = S().read(k);
      return cache[k];
    },
    put(name, value, yearId) {
      const k = key(name, yearId);
      S().write(k, value);
      cache[k] = value;
      savedAt = new Date();
      RPH.events.emit('store:changed', { collection: name, yearId });
      RPH.events.emit('store:saved', { at: savedAt });
      return value;
    },
    update(name, fn, yearId) {
      const draft = RPH.util.clone(store.get(name, yearId)) ?? {};
      const r = fn(draft);
      return store.put(name, r === undefined ? draft : r, yearId);
    },
    savedAt: () => savedAt,

    // --- Tahun akademik ---
    activeYear() { const ay = S().read('academicYears'); return ay ? ay.activeId : '2026'; },
    academicYear(id) { const ay = store.get('academicYears'); return ay.years.find(y => y.id === (id || ay.activeId)); },
    setActiveYear(id) { store.update('academicYears', d => { d.activeId = id; }); Object.keys(cache).forEach(k => k.startsWith('y:') && delete cache[k]); RPH.events.emit('year:changed', { id }); },
    createYear({ id, label, startDate, endDate, copyFrom }) {
      store.update('academicYears', d => {
        if (d.years.some(y => y.id === id)) throw new Error(`Tahun ${id} sudah wujud`);
        const base = d.years.find(y => y.id === copyFrom) || {};
        d.years.push({ ...RPH.util.clone(base), id, label: label || `Sesi ${id}`, startDate, endDate, calendar: null, timetable: null, rpt: {}, rptNotes: {}, rphHistory: null });
      });
      // Data tahun baharu bermula kosong (tiada campuran data — §76); jadual & kelas boleh disalin.
      const src = copyFrom;
      const blank = emptyYearData(id);
      S().write(`y:${id}:calendar`, blank.calendar);
      S().write(`y:${id}:timetable`, src ? { ...RPH.util.clone(store.get('timetable', src)), academicYearId: id } : blank.timetable);
      S().write(`y:${id}:classes`, src ? { ...RPH.util.clone(store.get('classes', src)), academicYearId: id } : blank.classes);
      S().write(`y:${id}:rpt`, {}); S().write(`y:${id}:rph`, {}); S().write(`y:${id}:history`, null);
    },
    /** Koleksi kosong bagi satu tahun ({calendar, timetable, classes, rpt, rph, history}) — untuk import/penciptaan tahun. */
    emptyYearData,
    /** Tahun tanpa sebarang data (tiada takwim, slot jadual, kelas, RPT, RPH atau sejarah)? */
    isYearEmpty(id) {
      const r = n => S().read(`y:${id}:${n}`);
      const cal = r('calendar') || {}; const tt = r('timetable') || {}; const cl = r('classes') || {};
      return !(cal.weeks || []).length && !(cal.days || []).length
        && !(tt.versions || []).some(v => (v.slots || []).length)
        && !(cl.classes || []).length && !Object.keys(cl.studentCounts || {}).length
        && !Object.keys(r('rpt') || {}).length && !Object.keys(r('rph') || {}).length && !r('history');
    },
    /**
     * Buang satu tahun akademik (rekod + semua kunci y:<id>:*). Hanya tahun KOSONG kecuali {force:true};
     * tahun aktif / satu-satunya tahun tidak boleh dibuang. Digunakan oleh "Mula di sini" (tukar sesi auto → sesi depan).
     */
    removeYear(id, { force = false } = {}) {
      const ay = store.get('academicYears') || { years: [] };
      if (!ay.years.some(y => y.id === id)) throw new Error(`Tahun ${id} tiada`);
      if (ay.activeId === id) throw new Error(`Tahun ${id} sedang aktif — aktifkan tahun lain dahulu.`);
      if (ay.years.length < 2) throw new Error('Sekurang-kurangnya satu tahun akademik diperlukan.');
      if (!force && !store.isYearEmpty(id)) throw new Error(`Tahun ${id} mempunyai data — muat turun arkib dahulu, kemudian buang dengan force.`);
      PER_YEAR.forEach(n => S().remove(`y:${id}:${n}`));
      Object.keys(cache).forEach(k => k.startsWith(`y:${id}:`) && delete cache[k]);
      store.update('academicYears', d => { d.years = d.years.filter(y => y.id !== id); });
    },
    /** Edisi aplikasi: 'kosong' (edisi kosong — semua data diimport guru) atau 'asal' (edisi bersama data seed sekolah). */
    edition() { const m = S().read('meta') || {}; const pub = window.RPH_SEED_PUBLIC || {}; return pub.edition || m.edition || 'asal'; },

    // --- Arkib tahun akademik (Fasa 9) ---
    /** Tahun diarkib = baca sahaja: RPH boleh dilihat, dicari & dieksport, tetapi tidak disunting/dijana. */
    isArchived(id) { const y = store.academicYear(id || store.activeYear()); return !!(y && y.archived); },
    assertWritable(id) {
      if (store.isArchived(id)) throw new Error(`Tahun akademik ${id} diarkib (baca sahaja). Nyaharkib di Tetapan → Tahun Akademik untuk menyunting.`);
    },
    setArchived(id, on) {
      store.update('academicYears', d => { const y = d.years.find(z => z.id === id); if (!y) throw new Error(`Tahun ${id} tiada`); y.archived = !!on; y.archivedAt = on ? RPH.util.nowIso() : null; });
      RPH.events.emit('year:archived', { id, archived: !!on });
    },
    /** Fail arkib satu tahun: rekod tahun + semua koleksi y:<id>:*. */
    exportYear(id) {
      const y = store.academicYear(id);
      if (!y) throw new Error(`Tahun ${id} tiada`);
      const data = {};
      PER_YEAR.forEach(n => { const v = S().read(`y:${id}:${n}`); if (v !== undefined) data[n] = v; });
      return { type: 'rph-year-archive', schemaVersion: '1.0.0', appVersion: RPH.VERSION, exportedAt: RPH.util.nowIso(), yearId: id, academicYear: RPH.util.clone(y), data };
    },
    validateYearArchive(json) {
      const errs = [];
      if (!json || typeof json !== 'object') return ['Fail bukan JSON yang sah.'];
      if (json.type !== 'rph-year-archive') errs.push('Medan "type" mesti "rph-year-archive".');
      if (!json.yearId || !/^[A-Za-z0-9_-]+$/.test(String(json.yearId))) errs.push('Medan "yearId" tiada atau tidak sah.');
      if (!json.academicYear || typeof json.academicYear !== 'object') errs.push('Medan "academicYear" tiada.');
      if (!json.data || typeof json.data !== 'object') errs.push('Medan "data" tiada.');
      else Object.keys(json.data).forEach(k => { if (!PER_YEAR.includes(k)) errs.push(`Koleksi "${k}" tidak dikenali.`); });
      return errs;
    },
    /** Pulihkan arkib satu tahun. Hanya kunci y:<yearId>:* diganti; tahun lain & data global tidak disentuh. */
    importYear(json) {
      const errs = store.validateYearArchive(json);
      if (errs.length) throw Object.assign(new Error('Format fail tidak sah'), { details: errs });
      const id = String(json.yearId);
      PER_YEAR.forEach(n => { if (n in json.data) S().write(`y:${id}:${n}`, json.data[n]); });
      store.update('academicYears', d => {
        const rec = { ...RPH.util.clone(json.academicYear), id };
        const i = d.years.findIndex(z => z.id === id);
        if (i >= 0) d.years[i] = { ...d.years[i], ...rec }; else d.years.push(rec);
        d.years.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      });
      Object.keys(cache).forEach(k => k.startsWith(`y:${id}:`) && delete cache[k]);
      RPH.events.emit('store:changed', { collection: '*' });
      return id;
    },

    // --- Akses ringkas ---
    subjects: () => (store.get('subjects') || { subjects: [] }).subjects,
    subject: id => store.subjects().find(s => s.id === id),
    template: id => (store.get('templates') || {})[id],
    templates: () => Object.values(store.get('templates') || {}),
    bank: id => (store.get('banks') || {})[id],
    curriculumId(subjectId, year) { const s = store.subject(subjectId); const base = s && s.curriculumFrom ? s.curriculumFrom : (subjectId === 'PIQ' ? 'PI' : subjectId); return `${base}-${year}`; },
    curriculum(subjectId, year) { return (store.get('curriculum') || {})[store.curriculumId(subjectId, year)] || null; },
    rpt(subjectId, year) { const all = store.get('rpt') || {}; const base = subjectId === 'PIQ' ? 'PI' : subjectId; return all[`${subjectId}-${year}`] || all[`${base}-${year}`] || null; },
    classes: () => (store.get('classes') || { classes: [] }).classes,
    hasPrivateData: () => Object.keys(store.get('curriculum') || {}).length > 0,

    // --- Bilangan murid & refleksi lalai (keputusan guru 2026-10-02) ---
    /** Peta bilangan murid ikut subjek-tahun bagi tahun akademik aktif, cth. {'BA-3': 30}. Disimpan dalam koleksi ikut tahun "classes". */
    studentCounts: yearId => ((store.get('classes', yearId) || {}).studentCounts) || {},
    setStudentCount(subjectId, year, n) {
      store.update('classes', d => {
        d.studentCounts = d.studentCounts || {};
        const k = `${subjectId}-${year}`;
        if (n == null || n === '' || isNaN(+n) || +n <= 0) delete d.studentCounts[k]; else d.studentCounts[k] = Math.round(+n);
      });
    },
    /** Bilangan murid: enrolmen kelas (jika diisi) → tetapan subjek-tahun → null. */
    studentCount(subjectId, year, classId) {
      const cls = classId ? store.classes().find(c => c.id === classId) : null;
      if (cls && +cls.enrolment > 0) return +cls.enrolment;
      const n = store.studentCounts()[`${subjectId}-${year}`];
      return +n > 0 ? +n : null;
    },
    /** Peratus murid berjaya lalai (Tetapan → Bilangan Murid); lalai 70. */
    achievedPct() { const v = (store.get('settings') || {}).reflectionAchievedPct; return v != null && v !== '' && +v >= 0 && +v <= 100 ? +v : 70; },
    /** Nilai refleksi lalai: jumlah murid, berjaya = % lalai (dibundarkan), tidak berjaya = baki, tidak hadir = 0. null jika bilangan tidak diketahui. */
    defaultReflection({ subjectId, year, classId }) {
      const total = store.studentCount(subjectId, year, classId);
      if (!total) return null;
      const achieved = Math.round(total * store.achievedPct() / 100);
      return { total, achieved, notAchieved: total - achieved, absent: 0, auto: true };
    },
    /** Isi refleksi RPH dengan nilai lalai jika kosong (atau auto & force). Pulang true jika berubah. Tidak menyimpan. */
    applyDefaultReflection(rph, { force = false } = {}) {
      const tpl = store.template(rph.templateId); const f = tpl && tpl.fields.find(x => x.type === 'reflection');
      if (!f) return false;
      const d = store.defaultReflection({ subjectId: rph.subjectId, year: rph.year, classId: rph.classId });
      if (!d) return false;
      rph.values = rph.values || {};
      const v = rph.values[f.key] && typeof rph.values[f.key] === 'object' && !Array.isArray(rph.values[f.key]) ? rph.values[f.key] : {};
      const blank = x => x == null || x === '';
      const empty = blank(v.total) && blank(v.achieved) && blank(v.notAchieved) && blank(v.absent);
      if (!(empty || (force && v.auto))) return false;
      if (!empty && v.total === d.total && v.achieved === d.achieved && v.notAchieved === d.notAchieved && v.absent === d.absent) return false;
      rph.values[f.key] = { postponed: false, carryWeek: null, lines: {}, ...v, ...d };
      return true;
    },
    /** Terapkan refleksi lalai kepada semua RPH tahun aktif yang kosong / masih auto (satu tulisan). Pulang bilangan dikemas kini. */
    applyDefaultReflectionAll() {
      if (store.isArchived()) return 0;
      let n = 0;
      store.update('rph', d => { Object.values(d).forEach(r => { if (store.applyDefaultReflection(r, { force: true })) { r.updatedAt = RPH.util.nowIso(); n++; } }); });
      return n;
    },

    // --- RPH ---
    rphMap: () => store.get('rph') || {},
    rphList(filter = {}) {
      return Object.values(store.rphMap()).filter(r =>
        (!filter.date || r.date === filter.date) && (!filter.week || r.week === filter.week) &&
        (!filter.subjectId || r.subjectId === filter.subjectId) && (!filter.classId || r.classId === filter.classId) &&
        (!filter.status || r.status === filter.status))
        .sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
    },
    getRph: id => store.rphMap()[id] || null,
    saveRph(rph) {
      store.assertWritable(rph.academicYearId || store.activeYear());
      const now = RPH.util.nowIso();
      rph.updatedAt = now; rph.createdAt = rph.createdAt || now;
      rph.academicYearId = rph.academicYearId || store.activeYear();
      store.update('rph', d => { d[rph.id] = rph; }, rph.academicYearId);
      return rph;
    },
    deleteRph(id) { store.assertWritable(store.activeYear()); store.update('rph', d => { delete d[id]; }); },

    // --- Backup / Restore / Reset ---
    exportAll() {
      const out = { type: 'rph-backup', schemaVersion: '1.0.0', appVersion: RPH.VERSION, exportedAt: RPH.util.nowIso(), data: {} };
      S().keys().forEach(k => { out.data[k] = S().read(k); });
      return out;
    },
    validateBackup(json) {
      const errs = [];
      if (!json || typeof json !== 'object') errs.push('Fail bukan JSON yang sah.');
      else {
        if (json.type !== 'rph-backup') errs.push('Medan "type" mesti "rph-backup".');
        if (!json.data || typeof json.data !== 'object') errs.push('Medan "data" tiada.');
        else {
          ['meta', 'subjects', 'academicYears', 'templates'].forEach(k => { if (!(k in json.data)) errs.push(`Kunci "${k}" tiada dalam backup.`); });
        }
      }
      return errs;
    },
    importAll(json) {
      const errs = store.validateBackup(json);
      if (errs.length) { const e = new Error('Format fail tidak sah'); e.details = errs; throw e; }
      S().clear();
      Object.entries(json.data).forEach(([k, v]) => S().write(k, v));
      Object.keys(cache).forEach(k => delete cache[k]);
      store.init();
      RPH.events.emit('store:changed', { collection: '*' });
    },
    resetAll() { S().clear(); Object.keys(cache).forEach(k => delete cache[k]); seed({ overwrite: true }); store.init(); RPH.events.emit('store:changed', { collection: '*' }); },
    /** Import pakej data peribadi (DSKP/RPT) — untuk aplikasi yang dihoskan tanpa fail peribadi. */
    importPrivatePack(pack) {
      if (!pack || pack.type !== 'rph-private-pack') throw Object.assign(new Error('Format fail tidak sah'), { details: ['Medan "type" mesti "rph-private-pack".'] });
      store.update('curriculum', d => Object.assign(d, pack.curriculum || {}));
      store.update('assessment', d => Object.assign(d || {}, pack.assessment || {}));
      if (pack.i18nTopics) store.put('i18nTopics', pack.i18nTopics);
      for (const y of store.get('academicYears').years) {
        store.update('rpt', d => { Object.entries(pack.rpt || {}).forEach(([k, r]) => { if ((r.reusedFor || []).includes(y.id) || r.academicYearId === y.id) d[k] = r; }); }, y.id);
        if (pack.history && pack.history[y.id]) store.put('history', pack.history[y.id], y.id);
      }
    },

    // --- Pakej Guru (satu fail: profil, subjek, DSKP, takwim, jadual, kelas, RPT bagi satu tahun) ---
    // Dihasilkan oleh Enjin Penukar (eksport daripada app sebenar selepas import), diimport guru sekali klik.
    // Gabung, bukan ganti: RPH sedia ada tidak disentuh; profil guru/sekolah hanya diisi pada medan kosong.
    /** Bina Pakej Guru daripada data tahun `yearId` dalam pelayar ini. `extra` = { guru, generator, report }. */
    exportTeacherPack(yearId, extra = {}) {
      const id = String(yearId || store.activeYear());
      const y = store.academicYear(id);
      if (!y) throw new Error(`Tahun ${id} tiada`);
      const C = RPH.util.clone;
      return {
        type: 'rph-pakej-guru', schemaVersion: '1.0.0', appVersion: RPH.VERSION, createdAt: RPH.util.nowIso(),
        guru: extra.guru || null, generator: extra.generator || null,
        yearId: id, academicYear: C(y),
        school: C(store.get('school') || {}), teacher: C(store.get('teacher') || {}),
        subjects: C(store.subjects()), curriculum: C(store.get('curriculum') || {}), assessment: C(store.get('assessment') || {}),
        calendar: C(store.get('calendar', id) || null), timetable: C(store.get('timetable', id) || null),
        classes: C(store.get('classes', id) || null), rpt: C(store.get('rpt', id) || {}), history: C(store.get('history', id) || null),
        i18nTopics: extra.i18nTopics !== undefined ? extra.i18nTopics : C(store.get('i18nTopics') || null), // terjemahan tajuk/tema/unit RPT (4 bahasa)
        report: extra.report || null,
      };
    },
    /** Semak bentuk Pakej Guru. Pulang senarai ralat (kosong = sah). */
    validateTeacherPack(p) {
      const e = [];
      const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
      if (!isObj(p)) return ['Fail bukan JSON yang sah.'];
      if (p.type !== 'rph-pakej-guru') e.push('Medan "type" mesti "rph-pakej-guru".');
      if (!/^1\./.test(String(p.schemaVersion || ''))) e.push(`Versi skema "${p.schemaVersion}" tidak disokong (perlu 1.x).`);
      if (!p.yearId || !/^[A-Za-z0-9_-]+$/.test(String(p.yearId))) e.push('Medan "yearId" tiada atau tidak sah.');
      if (!Array.isArray(p.subjects)) e.push('Medan "subjects" mesti senarai.');
      if (!isObj(p.curriculum)) e.push('Medan "curriculum" mesti objek.');
      if (!isObj(p.rpt)) e.push('Medan "rpt" mesti objek.');
      if (p.calendar != null && (!isObj(p.calendar) || !Array.isArray(p.calendar.weeks))) e.push('Takwim tidak sah (perlu "weeks").');
      if (p.timetable != null && (!isObj(p.timetable) || !Array.isArray(p.timetable.versions))) e.push('Jadual waktu tidak sah (perlu "versions").');
      if (p.classes != null && (!isObj(p.classes) || !Array.isArray(p.classes.classes))) e.push('Kelas tidak sah (perlu "classes").');
      if (e.length) return e;
      const ids = new Set(p.subjects.map(s => s && s.id));
      p.subjects.forEach((s, i) => { if (!s || !s.id) e.push(`Subjek #${i + 1} tiada "id".`); });
      ((p.timetable && p.timetable.versions) || []).forEach(v => (v.slots || []).forEach(s => {
        if (s.subjectId && !ids.has(s.subjectId)) e.push(`Slot jadual ${v.id} (${s.label || s.subjectId}) merujuk subjek "${s.subjectId}" yang tiada dalam pakej.`);
      }));
      Object.keys(p.rpt).forEach(k => { const sid = String(k).split('-')[0]; if (!ids.has(sid) && !ids.has(sid === 'PI' ? 'PIQ' : sid)) e.push(`RPT "${k}" merujuk subjek yang tiada dalam pakej.`); });
      Object.entries(p.curriculum).forEach(([k, c]) => { if (!c || !Array.isArray(c.domains)) e.push(`DSKP "${k}" tidak sah (perlu "domains").`); });
      return [...new Set(e)];
    },
    /** Ringkasan Pakej Guru + konflik dengan data sedia ada (untuk paparan pengesahan). */
    inspectTeacherPack(p) {
      const id = String(p.yearId);
      const yearExists = !!(store.get('academicYears').years || []).find(y => y.id === id);
      const cur = n => (yearExists ? store.get(n, id) : null);
      const curCal = cur('calendar') || {}, curTt = cur('timetable') || {}, curCl = cur('classes') || {}, curRpt = cur('rpt') || {};
      const curCurr = store.get('curriculum') || {};
      const count = c => { let sk = 0, sp = 0; (c.domains || []).forEach(d => (d.contentStandards || []).forEach(s => { sk++; sp += (s.learningStandards || []).length; })); return { sk, sp }; };
      const cal = p.calendar || {}, tt = p.timetable || {}, cl = p.classes || {};
      const slots = (tt.versions || []).reduce((n, v) => n + (v.slots || []).filter(s => s.kind !== 'Rehat').length, 0);
      const pupils = [...(cl.classes || []).filter(c => +c.enrolment > 0).map(c => `${c.name || c.id} (${+c.enrolment})`), ...Object.entries(cl.studentCounts || {}).filter(([, n]) => +n > 0).map(([k, n]) => `${k} (${+n})`)];
      const blank = o => !o || !Object.values(o).some(v => v != null && v !== '');
      return {
        yearId: id, yearLabel: (p.academicYear && p.academicYear.label) || `Sesi ${id}`, yearExists, yearEmpty: yearExists ? store.isYearEmpty(id) : true,
        guru: p.guru || null, createdAt: p.createdAt || null,
        school: (p.school && p.school.name) || null, teacher: (p.teacher && (p.teacher.fullName || p.teacher.name)) || null,
        counts: {
          subjects: p.subjects.map(s => s.id),
          weeks: (cal.weeks || []).length, schoolDays: (cal.days || []).filter(d => d.schoolDay).length,
          timetableVersions: (tt.versions || []).map(v => v.id), slots,
          classes: (cl.classes || []).length, pupils,
          curriculum: Object.entries(p.curriculum).map(([k, c]) => ({ key: k, ...count(c) })),
          rpt: Object.entries(p.rpt).map(([k, r]) => ({ key: k, rows: (r.rows || r.weeks || []).length })),
        },
        conflicts: {
          calendar: (curCal.weeks || []).length > 0 && (cal.weeks || []).length > 0,
          timetable: (tt.versions || []).map(v => v.id).filter(v => (curTt.versions || []).some(x => x.id === v)),
          classes: (cl.classes || []).map(c => c.id).filter(c => (curCl.classes || []).some(x => x.id === c)),
          curriculum: Object.keys(p.curriculum).filter(k => curCurr[k]),
          rpt: Object.keys(p.rpt).filter(k => curRpt[k]),
          school: !blank(store.get('school')) && !blank(p.school),
          teacher: !blank(store.get('teacher')) && !blank(p.teacher),
        },
        topics: p.i18nTopics && p.i18nTopics.phrases ? Object.keys(p.i18nTopics.phrases).length : 0,
        i18n: Object.entries(p.curriculum).map(([k, c]) => ({ key: k, langs: (c.i18nMeta && c.i18nMeta.langs) || [], counts: (c.i18nMeta && c.i18nMeta.counts) || null })),
        review: ((p.report && p.report.review) || []).slice(),
      };
    },
    /**
     * Import Pakej Guru. Gabung ke dalam tahun `pack.yearId` (dicipta jika tiada). DSKP/RPT/takwim/versi jadual dengan
     * kunci sama diganti; kelas & subjek digabung; RPH tidak disentuh. Profil sekolah/guru: medan kosong diisi sahaja,
     * kecuali { overwriteProfile: true }. Tahun pakej dijadikan tahun aktif. Pulang ringkasan inspectTeacherPack.
     */
    importTeacherPack(p, { overwriteProfile = false, activate = true } = {}) {
      const errs = store.validateTeacherPack(p);
      if (errs.length) throw Object.assign(new Error('Format Pakej Guru tidak sah'), { details: errs });
      const C = RPH.util.clone;
      const id = String(p.yearId);
      const summary = store.inspectTeacherPack(p);
      const rec = p.academicYear || {};
      if (!summary.yearExists) store.createYear({ id, label: rec.label || `Sesi ${id}`, startDate: rec.startDate || null, endDate: rec.endDate || null, copyFrom: null });
      store.assertWritable(id);
      store.update('academicYears', d => {
        const y = d.years.find(z => z.id === id);
        ['startDate', 'endDate'].forEach(k => { if (!y[k] && rec[k]) y[k] = rec[k]; });
        if (rec.rptWeekMapping) y.rptWeekMapping = rec.rptWeekMapping;
        y.rptNotes = { ...(y.rptNotes || {}), ...(rec.rptNotes || {}) };
        d.years.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      });
      // Profil: isi medan kosong (atau ganti semua jika diminta).
      const fill = (name, src) => {
        if (!src || typeof src !== 'object') return;
        store.update(name, d => { Object.entries(src).forEach(([k, v]) => { if (v == null || v === '') return; if (overwriteProfile || d[k] == null || d[k] === '') d[k] = C(v); }); });
      };
      fill('school', p.school); fill('teacher', p.teacher);
      // Subjek: tambah yang tiada; subjek sedia ada hanya dilengkapkan (suntingan guru dikekalkan).
      store.update('subjects', d => {
        d.schemaVersion = d.schemaVersion || '1.0.0'; d.type = 'subjects'; d.subjects = d.subjects || [];
        p.subjects.forEach(s => {
          const cur = d.subjects.find(x => x.id === s.id);
          if (!cur) d.subjects.push(C(s));
          else Object.entries(s).forEach(([k, v]) => { if (cur[k] == null || cur[k] === '' || (Array.isArray(cur[k]) && !cur[k].length)) cur[k] = C(v); });
        });
      });
      store.update('curriculum', d => { Object.entries(p.curriculum).forEach(([k, c]) => { d[k] = C(c); }); });
      if (p.assessment && typeof p.assessment === 'object') store.update('assessment', d => Object.assign(d || {}, C(p.assessment)));
      // Data tahun.
      if (p.calendar && (p.calendar.weeks || []).length) {
        const cur = store.get('calendar', id) || {};
        store.put('calendar', { ...C(p.calendar), academicYearId: id, kpm: p.calendar.kpm || cur.kpm || undefined }, id);
      }
      if (p.timetable) store.update('timetable', d => {
        d.schemaVersion = d.schemaVersion || '1.0.0'; d.type = 'timetable'; d.academicYearId = id; d.versions = d.versions || [];
        (p.timetable.versions || []).forEach(v => { const i = d.versions.findIndex(x => x.id === v.id); if (i >= 0) d.versions[i] = C(v); else d.versions.push(C(v)); });
        if ((!d.periodGrid || !d.periodGrid.length) && (p.timetable.periodGrid || []).length) d.periodGrid = C(p.timetable.periodGrid);
      }, id);
      if (p.classes) store.update('classes', d => {
        d.schemaVersion = '1.0.0'; d.type = 'classes'; d.academicYearId = id; d.classes = d.classes || []; d.studentCounts = d.studentCounts || {};
        (p.classes.classes || []).forEach(c => { const i = d.classes.findIndex(x => x.id === c.id); if (i >= 0) d.classes[i] = { ...d.classes[i], ...C(c), enrolment: c.enrolment != null ? c.enrolment : d.classes[i].enrolment }; else d.classes.push(C(c)); });
        d.classes.sort((a, b) => (a.year || 0) - (b.year || 0) || String(a.name).localeCompare(String(b.name)));
        Object.assign(d.studentCounts, C(p.classes.studentCounts || {}));
      }, id);
      store.update('rpt', d => { Object.entries(p.rpt).forEach(([k, r]) => { d[k] = { ...C(r), academicYearId: id }; }); }, id);
      if (p.history && !store.get('history', id)) store.put('history', C(p.history), id);
      const ph = p.i18nTopics && p.i18nTopics.phrases;
      if (ph && typeof ph === 'object' && Object.keys(ph).length) store.update('i18nTopics', d => {
        d = d && typeof d === 'object' ? d : {};
        return { ...d, schemaVersion: d.schemaVersion || '1.0.0', type: 'i18n-topics', phrases: { ...(d.phrases || {}), ...C(ph) } };
      });
      if (activate && store.activeYear() !== id) store.setActiveYear(id);
      if (store.activeYear() === id) { try { store.applyDefaultReflectionAll(); } catch (e) { /* tahun diarkib */ } }
      RPH.events.emit('store:changed', { collection: '*' });
      return summary;
    },
    seed,
  };
  RPH.store = store;
})(window.RPH = window.RPH || {});
