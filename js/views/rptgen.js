/* Jana RPT (#/rptjana): wizard menjana Rancangan Pengajaran Tahunan daripada takwim + DSKP (+ jadual waktu).
   Enjin: RPH.rptgen (js/engine/rptgen.js) · Dokumen: RPH.rptdoc (js/export/rptdoc.js) · Kontrak: docs/RPT_GENERATOR_CONTRACT.md
   Peraturan: SK/SP hanya daripada DSKP; semua agihan ialah CADANGAN sehingga guru menekan "Sahkan RPT";
   tiada apa disimpan secara senyap (simpan ke Pengurus RPT hanya selepas pengesahan + persetujuan guru).
   Semua kelas berawalan rg-. Data pengguna tidak dimasukkan melalui HTML mentah. */
(function (RPH) {
  'use strict';
  const { h, icon, button, modal, confirm, toast, select, clear, empty } = RPH.ui;
  const U = RPH.util;
  const K = () => RPH.adminKit;
  const st = () => RPH.store;
  const gen = () => RPH.rptgen;
  const doc = () => RPH.rptdoc;

  // ------------------------------------------------------------------ Pemalar
  const STEPS = [
    { id: 1, label: 'Subjek & tahun' }, { id: 2, label: 'Semak sumber' }, { id: 3, label: 'Minggu persekolahan' },
    { id: 4, label: 'Pilihan agihan' }, { id: 5, label: 'Pratonton & suntingan' }, { id: 6, label: 'Sahkan & simpan' },
  ];
  const WEEK_STATUS = [
    { value: 'pdp', label: 'PdP' }, { value: 'ulangkaji', label: 'Ulang kaji' }, { value: 'peperiksaan', label: 'Peperiksaan' },
    { value: 'cuti', label: 'Cuti' }, { value: 'program', label: 'Program' }, { value: 'orientasi', label: 'Orientasi' },
  ];
  const STATUS_LABEL = Object.fromEntries(WEEK_STATUS.map(s => [s.value, s.label]));
  const STATUS_BADGE = { pdp: 'green', ulangkaji: 'amber', peperiksaan: 'rose', cuti: 'red', program: 'violet', orientasi: 'blue' };
  const LANGS_FALLBACK = [{ id: 'ms', label: 'Bahasa Melayu' }, { id: 'en', label: 'English' }, { id: 'ar', label: 'العربية' }, { id: 'jawi', label: 'Jawi' }];
  const KINDS = {
    ba: ['kosa-kata', 'huruf', 'suku-kata', 'huruf+suku-kata', 'tarkib', 'nombor', 'projek', 'ulangkaji', 'program'],
    pi: ['lesson', 'khatam', 'program', 'ulangkaji'],
    generic: ['lesson', 'ulangkaji', 'program'],
  };
  const MODES = [
    { value: 'urutan', label: 'Ikut urutan DSKP (SK demi SK)' },
    { value: 'tema', label: 'Ikut tema / unit (cth. Bahasa Arab)' },
    { value: 'bidang', label: 'Ikut bidang secara bergilir (cth. Pendidikan Islam)' },
  ];

  const langs = () => (doc() && doc().LANGS) || LANGS_FALLBACK;
  const subj = () => st().subject(S.subjectId);
  const dm = iso => { if (!iso) return ''; const [, m, d] = iso.split('-'); return `${+d}/${+m}`; };
  const dmy = iso => U.fmtDate(iso, 'D/M/YYYY');
  const plural = (n, one) => `${n} ${one}`;
  const rtl = (t, script) => K().rtl(t, script);
  const ap = (el, ...kids) => RPH.ui.append(el, kids); // append selamat (null/false dilangkau)

  // ------------------------------------------------------------------ Keadaan (kekal semasa menukar langkah/halaman dalam sesi)
  const blank = () => ({
    step: 1, ayId: null, subjectId: null, year: null, options: null, weekStatus: {}, plan: null, undo: [], locked: new Set(),
    tab: 'edit', lang: 'ms', filter: 'all', fromStored: false, weekChanged: false, ackSig: null, dirty: false,
    savedKey: null, savedAt: null, src: null, busy: false, events: {},
  });
  let S = blank();
  let root = null, alive = () => false;
  let idxCache = { key: null, v: null };
  let resizeObs = null;

  // ------------------------------------------------------------------ Pembantu data
  const engineReady = () => !!(gen() && doc());
  function familyOf() {
    try { const g = gen(); const f = g && (g.familyFor ? g.familyFor(S.subjectId, S.year, S.options) : g.familyOf && g.familyOf(S.subjectId, S.year)); if (f) return f; } catch (e) { /* guna andaian */ }
    if (S.plan && S.plan.family) return S.plan.family;
    const s = subj() || {}; const base = s.curriculumFrom || s.id;
    if (base === 'PI' || s.id === 'PIQ') return 'pi';
    if (base === 'BA' || s.script === 'arabic') return 'ba';
    return 'generic';
  }
  const scriptOf = () => ((subj() || {}).script) || 'arabic';

  /** Indeks DSKP (kod → item) bagi subjek/tahun terpilih; dikosongkan setiap kali paparan dibuka. */
  function dskp() {
    const key = `${S.subjectId}|${S.year}|${st().activeYear()}`;
    if (idxCache.key === key && idxCache.v) return idxCache.v;
    const v = { sk: new Map(), sp: new Map(), skList: [], spList: [], themes: [] };
    try {
      RPH.curr.listSk(S.subjectId, S.year).forEach(x => { v.sk.set(x.code, x); v.skList.push(x); });
      RPH.curr.listSp(S.subjectId, S.year).forEach(x => { v.sp.set(x.code, x); v.spList.push(x); });
      v.themes = RPH.curr.themes(S.subjectId, S.year) || [];
    } catch (e) { console.error('[rptjana] DSKP', e); }
    idxCache = { key, v };
    return v;
  }
  const stdText = x => (x ? (RPH.curr.text ? RPH.curr.text(x) : x.text) || x.text || '' : '');

  function sources(fresh) {
    if (!S.subjectId) return null;
    if (fresh || !S.src) { try { S.src = gen().sources(S.subjectId, S.year); } catch (e) { RPH.reportError('semak sumber', e); S.src = null; } }
    return S.src;
  }
  /** Mesej yang menyekat penjanaan (takwim / DSKP tiada). */
  function blockers() {
    const src = sources(); const out = [];
    if (!src) return ['Sumber tidak dapat disemak. Muat semula halaman dan cuba lagi.'];
    if (!(src.calendar && src.calendar.ok)) out.push('Takwim sekolah belum diimport — minggu persekolahan, cuti dan peperiksaan tidak diketahui. Import takwim dahulu.');
    if (!(src.curriculum && src.curriculum.ok)) out.push(`DSKP ${subj() ? subj().name.ms : S.subjectId} Tahun ${S.year} belum diimport — SK/SP tidak boleh dicipta oleh sistem. Import DSKP dahulu.`);
    return out;
  }
  const isArchived = () => { try { return st().isArchived(); } catch (e) { return false; } };

  function resetFor(sid, year) {
    const ay = st().activeYear();
    S = blank(); S.ayId = ay; S.subjectId = sid; S.year = +year; S.lang = 'ms';
    idxCache = { key: null, v: null };
    try { S.options = U.clone(gen().defaultOptions(sid, +year)) || {}; } catch (e) { RPH.reportError('pilihan lalai', e); S.options = {}; }
    if (S.options.lang) S.lang = S.options.lang;
    S.step = 2;
    RPH.ui.setDirty(false);
  }

  // ------------------------------------------------------------------ Kerangka wizard
  function maxStep() {
    if (!S.subjectId) return 1;
    if (blockers().length) return 2;
    return S.plan ? 6 : 5;
  }
  function go(n) {
    if (n > maxStep()) return;
    S.step = n; draw(); window.scrollTo(0, 0);
  }
  function stepper() {
    const mx = maxStep();
    return h('ol', { class: 'rg-steps', 'aria-label': 'Langkah wizard' }, STEPS.map(s => {
      const cls = ['rg-step', s.id === S.step ? 'now' : null, s.id < S.step ? 'done' : null, s.id > mx ? 'locked' : null];
      return h('li', { class: cls, 'aria-current': s.id === S.step ? 'step' : null },
        h('button', { type: 'button', class: 'rg-step-btn', disabled: s.id > mx, onClick: () => go(s.id), title: s.id > mx ? 'Selesaikan langkah sebelumnya dahulu' : s.label },
          h('span', { class: 'rg-step-n' }, s.id < S.step ? icon('check', 12) : String(s.id)), h('span', { class: 'rg-step-l' }, s.label)));
    }));
  }
  function footerNav() {
    const mx = maxStep();
    const back = S.step > 1 ? button('Sebelumnya', { icon: 'left', onClick: () => go(S.step - 1) }) : null;
    let next = null;
    if (S.step === 1) next = S.subjectId ? button('Seterusnya', { kind: 'primary', icon: 'right', onClick: () => go(2) }) : null;
    else if (S.step < 6) {
      const ok = S.step + 1 <= mx;
      next = button(S.step === 4 ? 'Seterusnya: Pratonton' : 'Seterusnya', { kind: 'primary', icon: 'right', disabled: !ok, title: ok ? '' : (S.step === 2 ? 'Takwim dan DSKP diperlukan' : 'Jana RPT dahulu'), onClick: () => go(S.step + 1) });
    }
    return h('div', { class: 'rg-nav' }, back, h('span', { class: 'spacer' }), S.subjectId ? h('span', { class: 'muted small rg-nav-info' }, `${subjLabelText()} · Tahun ${S.year}`) : null, next);
  }
  function subjLabelText() { const s = subj(); return s ? ((s.name && s.name.ms) || s.id) : ''; }

  function draw() {
    if (!alive()) return;
    if (resizeObs) { resizeObs.disconnect(); resizeObs = null; }
    clear(root);
    const ay = st().academicYear();
    ap(root, 
      RPH.ui.pageHeader('Jana RPT', `Rancangan Pengajaran Tahunan daripada DSKP, takwim dan jadual waktu — tahun akademik ${ay ? ay.label || ay.id : st().activeYear()}. Semua agihan ialah cadangan sehingga anda mengesahkannya.`,
        [button('Pengurus RPT', { icon: 'layers', onClick: () => RPH.router.go('rpt', null, S.subjectId ? { subject: S.subjectId, year: S.year } : null) })]),
      isArchived() ? h('div', { class: 'notice notice-error rg-gap', role: 'alert' }, icon('alert'), h('span', null, 'Tahun akademik ini diarkib (baca sahaja). Anda boleh menjana dan mengeksport, tetapi RPT tidak boleh disimpan. Nyahaktifkan arkib di Tetapan → Tahun Akademik untuk menyimpan.')) : null,
      !engineReady() ? h('div', { class: 'notice notice-error rg-gap', role: 'alert' }, icon('alert'), h('span', null, 'Enjin penjana RPT atau modul dokumen RPT belum dimuatkan (js/engine/rptgen.js, js/export/rptdoc.js). Wizard tidak dapat berfungsi.')) : null,
      stepper());
    const body = h('div', { class: 'rg-body' });
    ap(root, body);
    if (!engineReady()) return;
    const views = { 1: step1, 2: step2, 3: step3, 4: step4, 5: step5, 6: step6 };
    try { ap(body, views[S.step]()); } catch (e) { RPH.reportError(`wizard langkah ${S.step}`, e); ap(body, empty(`Langkah gagal dipaparkan: ${e.message}`)); }
    ap(root, footerNav());
  }

  // ------------------------------------------------------------------ Langkah 1: Subjek & tahun
  function combos() {
    const slots = K().allSlots(st().activeYear()).filter(s => s.kind === 'PdP' && s.subjectId && s.year);
    const map = new Map();
    slots.forEach(s => { const k = `${s.subjectId}-${s.year}`; if (!map.has(k)) map.set(k, { subjectId: s.subjectId, year: +s.year, slots: 0, classes: new Set() }); const c = map.get(k); c.slots++; if (s.className) c.classes.add(s.className); });
    const taught = [...map.values()].filter(c => st().subject(c.subjectId)).sort((a, b) => a.subjectId.localeCompare(b.subjectId) || a.year - b.year);
    const others = [];
    st().subjects().forEach(s => K().yearsOf(s).forEach(y => { if (!map.has(`${s.id}-${y}`)) others.push({ subjectId: s.id, year: y, slots: 0, classes: new Set() }); }));
    return { taught, others };
  }
  const hasCurr = (sid, y) => { try { return !!st().curriculum(sid, y); } catch (e) { return false; } };
  const hasRpt = (sid, y) => { try { return !!st().rpt(sid, y); } catch (e) { return false; } };

  async function chooseCombo(c, { fromStored = false } = {}) {
    if (S.plan && S.dirty && (S.subjectId !== c.subjectId || S.year !== c.year)) {
      if (!(await confirm({ title: 'Tukar subjek/tahun?', danger: true, confirmLabel: 'Tukar', message: 'Draf RPT yang sedang disunting (belum disimpan) akan dibuang.' }))) return;
    }
    if (S.subjectId !== c.subjectId || S.year !== c.year || fromStored || !S.options) resetFor(c.subjectId, c.year);
    if (fromStored) {
      let plan = null;
      try { plan = await gen().fromStored(c.subjectId, c.year); } catch (e) { RPH.reportError('RPT sedia ada', e); return; }
      if (!plan) { toast('RPT sedia ada tidak dapat dibaca.', 'error'); return; }
      S.plan = plan; S.fromStored = true; S.options = { ...S.options, ...(plan.options || {}) };
      if (plan.lang) S.lang = plan.lang;
      recompute(); S.step = 5; S.tab = 'edit';
      toast('RPT sedia ada dimuatkan untuk disunting/dieksport. Tiada apa diubah dalam Pengurus RPT sehingga anda menyimpan.', 'info', 5200);
    } else S.step = 2;
    draw(); window.scrollTo(0, 0);
  }

  function comboCard(c) {
    const s = st().subject(c.subjectId);
    const sel = S.subjectId === c.subjectId && S.year === c.year;
    const rpt = hasRpt(c.subjectId, c.year), cur = hasCurr(c.subjectId, c.year);
    return h('div', { class: ['rg-combo', sel ? 'rg-combo-sel' : null], dataset: { subject: c.subjectId, year: c.year } },
      h('div', { class: 'rg-combo-head' }, K().subjectLabel(s), h('span', { class: 'rg-combo-year' }, `Tahun ${c.year}`)),
      h('div', { class: 'rg-combo-badges' },
        rpt ? h('span', { class: 'badge badge-green' }, icon('check', 12), 'RPT tersimpan') : h('span', { class: 'badge badge-slate' }, 'Tiada RPT'),
        cur ? h('span', { class: 'badge badge-green' }, icon('check', 12), 'DSKP ada') : h('span', { class: 'badge badge-red' }, icon('x', 12), 'DSKP tiada'),
        c.slots ? h('span', { class: 'badge badge-blue' }, `${c.slots} slot PdP/minggu`) : null),
      c.classes.size ? h('div', { class: 'muted small' }, `Kelas: ${[...c.classes].join(', ')}`) : null,
      h('div', { class: 'rg-combo-act' },
        button(sel ? 'Teruskan' : 'Pilih', { kind: 'primary', icon: 'right', onClick: () => (sel ? go(2) : chooseCombo(c)) }),
        rpt ? button('Mula daripada RPT sedia ada', { size: 'sm', icon: 'edit', onClick: () => chooseCombo(c, { fromStored: true }) }) : null,
        rpt ? button('Eksport dalam bahasa lain', { size: 'sm', icon: 'download', onClick: () => exportStored(c.subjectId, c.year) }) : null));
  }

  function step1() {
    const { taught, others } = combos();
    const wrap = h('div', { class: 'stack' });
    ap(wrap, h('div', { class: 'notice notice-info' }, icon('info'), h('span', null, 'Pilih subjek dan tahun yang mahu dirancang. Senarai ini diambil daripada jadual waktu anda. Tahun akademik ialah tahun aktif (tukar di bar atas).')));
    if (!st().subjects().length) {
      ap(wrap, K().emptyImport('Tiada subjek lagi. Import subjek, jadual waktu, takwim dan DSKP dahulu, kemudian kembali ke sini.', 'subjek', button('Ke Subjek', { icon: 'subject', onClick: () => RPH.router.go('subjek') })));
      return wrap;
    }
    ap(wrap, RPH.ui.card({ title: 'Diajar menurut jadual waktu', subtitle: 'Gabungan subjek dan tahun yang ada slot PdP.',
      body: taught.length ? h('div', { class: 'rg-combos' }, taught.map(comboCard)) : empty('Tiada slot PdP dalam jadual waktu tahun akademik ini. Pilih daripada "Semua subjek dan tahun" di bawah, atau import jadual waktu.',
        h('div', { class: 'row rg-center' }, RPH.onboarding ? RPH.onboarding.importButton('jadual', { label: 'Import Jadual Waktu', kind: 'primary', size: null }) : null)) }));
    if (others.length) {
      const det = h('details', { class: 'rg-others' }, h('summary', null, `Semua subjek dan tahun lain (${others.length})`), h('div', { class: 'rg-combos rg-gap-sm' }, others.map(comboCard)));
      if (!taught.length || (S.subjectId && others.some(c => c.subjectId === S.subjectId && c.year === S.year))) det.open = true;
      ap(wrap, det);
    }
    return wrap;
  }

  // ------------------------------------------------------------------ Langkah 2: Semak sumber
  function srcItems(src) {
    const cal = src.calendar || {}, tt = src.timetable || {}, cu = src.curriculum || {}, prev = src.previousRpt || [];
    const U_ = (S.options && S.options.units) || [];
    return [
      { id: 'takwim', label: 'Takwim sekolah', req: true, state: cal.ok ? (cal.fromKpm ? 'warn' : 'ok') : 'miss', kind: 'takwim',
        detail: cal.ok ? `${cal.weeks} minggu persekolahan · ${cal.pdpWeeks} minggu ada PdP${cal.fromKpm ? ' — dibina daripada takwim KPM sahaja; cuti dan acara khusus sekolah tidak diketahui, import takwim sekolah untuk ketepatan.' : ''}` : 'Belum diimport. Tanpa takwim, minggu persekolahan, cuti dan peperiksaan tidak diketahui.' },
      { id: 'takwim-kpm', label: 'Takwim KPM', req: false, state: cal.hasKpm ? 'ok' : 'opt', kind: 'takwim',
        detail: cal.hasKpm ? `Nombor minggu KPM ada${cal.kpmGroup ? ` · Kumpulan ${cal.kpmGroup}` : ''}` : 'Pilihan. Tanpa takwim KPM, cuti dan peperiksaan diambil daripada takwim sekolah sahaja.' },
      { id: 'jadual', label: 'Jadual waktu', req: false, state: tt.ok ? 'ok' : 'warn', kind: 'jadual',
        detail: tt.ok ? `${tt.slotsPerWeek} slot PdP seminggu (${tt.minutesPerWeek} minit)${(tt.classes || []).length ? ` · kelas: ${tt.classes.map(c => (c && (c.name || c.className)) || c).join(', ')}` : ''}` : 'Tiada slot untuk subjek/tahun ini. Bilangan pelajaran seminggu perlu ditetapkan sendiri (langkah 4).' },
      { id: 'dskp', label: 'DSKP', req: true, state: cu.ok ? 'ok' : 'miss', kind: 'dskp',
        detail: cu.ok ? `${cu.sk} SK · ${cu.sp} SP${cu.themes != null ? ` · ${typeof cu.themes === 'number' ? cu.themes : (cu.themes || []).length} tema` : ''}` : 'Belum diimport. Sistem tidak mencipta SK/SP — import DSKP subjek dan tahun ini.' },
      { id: 'rpt', label: 'RPT tahun lain', req: false, state: prev.length ? 'ok' : 'opt', kind: 'rpt',
        detail: prev.length ? `${prev.length} RPT boleh dijadikan corak: ${prev.map(p => p.key).join(', ')}` : 'Pilihan. RPT tahun/subjek lain boleh dijadikan panduan nisbah ("ikut corak") di langkah 4.' },
      { id: 'unit', label: 'Unit buku teks', req: false, state: U_.length ? 'ok' : 'opt', kind: null,
        detail: U_.length ? `${U_.length} unit dimasukkan` : 'Pilihan. Masukkan unit/tema buku teks jika mahu agihan mengikutnya. Sistem tidak mencipta nama unit.' },
    ];
  }
  const STATE_TXT = { ok: ['Ada', 'green', 'check'], miss: ['Tiada', 'red', 'x'], warn: ['Perhatian', 'amber', 'alert'], opt: ['Tiada (pilihan)', 'slate', 'info'] };

  function step2() {
    const src = sources(true);
    const wrap = h('div', { class: 'stack' });
    if (!src) return empty('Sumber tidak dapat disemak.');
    const bl = blockers();
    ap(wrap, bl.length
      ? h('div', { class: 'notice notice-error', role: 'alert' }, icon('alert'), h('div', null, h('strong', null, 'Penjanaan disekat.'), h('ul', { class: 'rg-bl' }, bl.map(m => h('li', null, m)))))
      : h('div', { class: 'notice notice-info' }, icon('check'), h('span', null, 'Takwim dan DSKP mencukupi — anda boleh meneruskan. Sumber pilihan yang tiada tidak menghalang penjanaan.')));
    const list = h('div', { class: 'rg-src-list' });
    srcItems(src).forEach(it => {
      const [txt, col, ic] = STATE_TXT[it.state];
      const missing = it.state === 'miss' || it.state === 'warn' || (it.state === 'opt' && it.kind);
      ap(list, h('div', { class: ['rg-src', `rg-src-${it.state}`], dataset: { src: it.id } },
        h('div', { class: 'rg-src-main' },
          h('div', { class: 'rg-src-title' }, h('strong', null, it.label), h('span', { class: ['badge', `badge-${col}`] }, icon(ic, 12), txt), it.req ? h('span', { class: 'badge badge-slate' }, 'Wajib') : null),
          h('div', { class: 'muted small rg-src-detail' }, it.detail),
          it.id === 'unit' ? unitsPreview() : null),
        h('div', { class: 'rg-src-act' },
          it.id === 'unit' ? button(((S.options.units || []).length ? 'Sunting unit' : 'Tambah unit'), { size: 'sm', icon: 'edit', onClick: unitsModal }) : null,
          it.kind ? h('a', { class: 'btn btn-sm rg-link', href: `#/import?jenis=${it.kind}`, title: 'Buka halaman Import Data' }, icon('upload', 14), 'Import') : null,
          it.kind && missing ? button('Muat naik di sini', { size: 'sm', kind: it.state === 'miss' ? 'primary' : null, icon: 'upload', onClick: () => RPH.router.go('import', null, { jenis: it.kind }) }) : null)));
    });
    ap(wrap, RPH.ui.card({ title: 'Senarai semak sumber', subtitle: `${subjLabelText()} · Tahun ${S.year} · tahun akademik ${st().activeYear()}`,
      actions: [button('Semak semula', { size: 'sm', icon: 'refresh', onClick: () => { draw(); toast('Sumber disemak semula.', 'success', 1800); } })], body: list }));
    return wrap;
  }

  // Unit buku teks: senarai ringkas boleh disunting / tampal / import daripada fail (RPH.readers jika ada).
  function unitName(u) { const n = u && u.name; return typeof n === 'string' ? n : (n && (n.ar || n.jawi || n.ms || n.en)) || ''; }
  function unitsPreview() {
    const us = (S.options && S.options.units) || [];
    if (!us.length) return null;
    return h('ol', { class: 'rg-units' }, us.slice(0, 12).map(u => h('li', null, rtl(unitName(u), scriptOf()), u.theme ? h('span', { class: 'muted small' }, ' — ', rtl(u.theme, scriptOf())) : null)), us.length > 12 ? h('li', { class: 'muted small' }, `… dan ${us.length - 12} lagi`) : null);
  }
  function parseUnits(text) {
    const key = scriptOf() === 'jawi' ? 'jawi' : 'ar';
    return String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(line => {
      const [name, theme] = line.split(/\t|\s*\|\s*/).map(x => x && x.trim());
      return { name: { [U.isArabicScript(name) ? key : 'ms']: name }, ...(theme ? { theme } : {}) };
    }).filter(u => unitName(u));
  }
  function unitsModal() {
    const us = (S.options.units || []);
    const ta = RPH.ui.textarea({ value: us.map(u => unitName(u) + (u.theme ? ` | ${u.theme}` : '')).join('\n'), rows: 10, placeholder: 'Satu unit setiap baris. Pilihan: Nama unit | Tema' });
    const msg = h('p', { class: 'muted small' }, 'Satu unit setiap baris. Format pilihan: Nama unit | Tema. Anda boleh tampal daripada Excel/Word, atau import fail.');
    const m = modal({ title: 'Unit buku teks', size: 'md',
      body: h('div', { class: 'stack' }, msg, ta,
        RPH.readers ? h('div', { class: 'row' }, button('Import daripada fail (Excel / Word / teks)', { icon: 'upload', size: 'sm', onClick: async () => {
          const inp = h('input', { type: 'file', accept: RPH.readers.accept || '.xlsx,.csv,.docx,.txt', style: { display: 'none' } });
          document.body.appendChild(inp);
          inp.addEventListener('change', async () => {
            const f = inp.files[0]; inp.remove(); if (!f) return;
            try {
              const d = await RPH.readers.read(f);
              let lines = [];
              if (d.tables && d.tables.length) lines = d.tables[0].rows.map(r => r.filter(c => c != null && String(c).trim()).slice(0, 2).join(' | ')).filter(Boolean);
              else lines = (d.paragraphs || []).map(p => p.text).filter(Boolean);
              if (!lines.length) lines = String(d.text || '').split(/\r?\n/).filter(Boolean);
              ta.value = lines.join('\n'); toast(`${lines.length} baris dibaca. Semak sebelum menyimpan.`, 'success');
            } catch (e) { toast(`Fail tidak dapat dibaca: ${e.message}`, 'error', 6000); }
          });
          inp.click();
        } })) : null),
      actions: [{ label: 'Kosongkan', kind: 'danger', onClick: () => { S.options.units = null; draw(); } }, { label: 'Batal' },
        { label: 'Simpan unit', kind: 'primary', icon: 'check', onClick: () => { const u = parseUnits(ta.value); S.options.units = u.length ? u : null; draw(); } }] });
    return m;
  }

  // ------------------------------------------------------------------ Langkah 3: Minggu persekolahan
  function weekRows() {
    try { return gen().weekTable(S.subjectId, S.year, U.clone(S.options)) || []; } catch (e) { RPH.reportError('jadual minggu', e); return []; }
  }
  const effStatus = r => S.weekStatus[r.week] || r.status;
  const evText = e => (typeof e === 'string' ? e : (e && (e.title || e.text || e.name)) || '');

  function step3() {
    const rows = weekRows();
    const wrap = h('div', { class: 'stack' });
    if (!rows.length) return empty('Tiada minggu persekolahan. Import takwim sekolah dahulu.', RPH.onboarding ? RPH.onboarding.importButton('takwim', { label: 'Import Takwim', kind: 'primary', size: null }) : null);
    const counts = {}; let pdpDays = 0, pdpWeeks = 0;
    rows.forEach(r => { const s = effStatus(r); counts[s] = (counts[s] || 0) + 1; if (s === 'pdp') { pdpWeeks++; pdpDays += +r.pdpDays || 0; } });
    const changed = Object.keys(S.weekStatus).length;
    ap(wrap, h('div', { class: 'notice notice-info' }, icon('info'), h('span', null, 'Sistem mengelaskan setiap minggu secara automatik daripada takwim (cuti penggal, hari awam, peperiksaan, orientasi, program). Anda boleh menukar status mana-mana minggu; hanya minggu berstatus PdP menerima pelajaran baharu.')));
    ap(wrap, h('div', { class: 'rg-totals' },
      RPH.ui.stat('Minggu PdP', pdpWeeks, 'menerima pelajaran'), RPH.ui.stat('Hari PdP', pdpDays, 'dalam minggu PdP'),
      RPH.ui.stat('Ulang kaji / Peperiksaan', `${counts.ulangkaji || 0} / ${counts.peperiksaan || 0}`, 'minggu'),
      RPH.ui.stat('Cuti / Program / Orientasi', `${counts.cuti || 0} / ${counts.program || 0} / ${counts.orientasi || 0}`, 'minggu')));
    const tbody = h('tbody');
    rows.forEach(r => {
      const eff = effStatus(r); const ovr = !!S.weekStatus[r.week] && S.weekStatus[r.week] !== r.status;
      const sel = select({ options: WEEK_STATUS, value: eff, cls: 'rg-st-sel', onChange: v => { if (v === r.status) delete S.weekStatus[r.week]; else S.weekStatus[r.week] = v; if (S.plan) S.weekChanged = true; draw(); } });
      sel.setAttribute('aria-label', `Status minggu ${r.week}`);
      const evs = (r.events || []).map(evText).filter(Boolean);
      ap(tbody, h('tr', { class: ['rg-wt-row', `rg-st-${eff}`, ovr ? 'rg-ovr' : null], dataset: { week: r.week } },
        h('td', { 'data-label': 'Minggu' }, h('strong', null, `M${r.week}`)),
        h('td', { 'data-label': 'Tarikh' }, `${dm(r.start)} – ${dm(r.end)}`),
        h('td', { 'data-label': 'Penggal' }, r.term != null ? String(r.term) : ''),
        h('td', { 'data-label': 'Minggu KPM' }, r.kpmWeek != null ? String(r.kpmWeek) : '—'),
        h('td', { 'data-label': 'Hari PdP', class: 'num' }, String(r.pdpDays ?? '')),
        h('td', { 'data-label': 'Acara / sebab', class: 'rg-wt-ev' },
          r.reason ? h('div', { class: 'small' }, r.reason) : null,
          evs.length ? h('div', { class: 'rg-evs' }, evs.slice(0, 3).map(e => h('span', { class: 'rg-ev', title: e }, K().mixed(e))), evs.length > 3 ? h('span', { class: 'muted small' }, `+${evs.length - 3}`) : null) : null),
        h('td', { 'data-label': 'Status automatik' }, h('span', { class: ['badge', `badge-${STATUS_BADGE[r.status] || 'slate'}`] }, STATUS_LABEL[r.status] || r.status)),
        h('td', { 'data-label': 'Status (anda)' }, sel, ovr ? h('div', { class: 'small rg-ovr-note' }, 'ditukar oleh anda') : null)));
    });
    ap(wrap, RPH.ui.card({ title: `Minggu persekolahan (${rows.length})`, subtitle: 'Tukar status melalui pilihan di lajur kanan.',
      actions: [changed ? button(`Set semula ${changed} perubahan`, { size: 'sm', icon: 'refresh', onClick: () => { S.weekStatus = {}; if (S.plan) S.weekChanged = true; draw(); } }) : null],
      body: h('div', { class: 'table-wrap rg-wt-wrap' }, h('table', { class: 'table rg-wt' },
        h('thead', null, h('tr', null, ['Minggu', 'Tarikh', 'Penggal', 'KPM', 'Hari PdP', 'Acara / sebab', 'Automatik', 'Status (anda)'].map(t => h('th', null, t)))), tbody)) }));
    if (S.plan && S.weekChanged) ap(wrap, h('div', { class: 'notice' }, icon('alert'), h('span', null, 'Status minggu telah berubah selepas RPT dijana. Jana semula RPT di langkah 5 supaya perubahan ini diambil kira.')));
    return wrap;
  }

  // ------------------------------------------------------------------ Langkah 4: Pilihan agihan
  function weekChips(selected, onChange) {
    const rows = weekRows(); const set = new Set((selected || []).map(Number));
    return h('div', { class: 'rg-wchips' }, rows.map(r => {
      const b = h('button', { type: 'button', class: ['rg-wchip', set.has(r.week) ? 'on' : null], 'aria-pressed': String(set.has(r.week)), title: `Minggu ${r.week} · ${STATUS_LABEL[effStatus(r)] || ''}`,
        onClick: () => { set.has(r.week) ? set.delete(r.week) : set.add(r.week); onChange([...set].sort((a, b2) => a - b2)); b.classList.toggle('on', set.has(r.week)); b.setAttribute('aria-pressed', String(set.has(r.week))); } }, String(r.week));
      return b;
    }));
  }
  const numOpt = (n, label) => ({ value: String(n), label: label || String(n) });

  function step4() {
    const o = S.options; const src = sources() || {}; const fam = familyOf();
    const wrap = h('div', { class: 'stack' });
    const slots = src.timetable && src.timetable.ok ? src.timetable.slotsPerWeek : null;
    const bdgBank = (RPH.banks && RPH.banks.items ? RPH.banks.items('pi-bidang') : []) || [];

    const manualLpw = o.lessonsPerWeek !== 'auto' && o.lessonsPerWeek != null;
    const lpwNum = RPH.ui.input({ type: 'number', value: manualLpw ? o.lessonsPerWeek : 1, min: 1, max: 10, cls: 'rg-narrow', onInput: v => { if (v) o.lessonsPerWeek = Math.max(1, Math.min(10, +v)); } });
    lpwNum.setAttribute('aria-label', 'Bilangan pelajaran seminggu');
    const lpwBox = h('div', { class: manualLpw ? null : 'adm-hidden' }, lpwNum);
    const lpwSel = select({ options: [{ value: 'auto', label: `Automatik${slots != null ? ` (${slots} slot PdP seminggu daripada jadual)` : ' (ikut jadual waktu)'}` }, { value: 'manual', label: 'Tetapkan sendiri' }], value: manualLpw ? 'manual' : 'auto',
      onChange: v => { o.lessonsPerWeek = v === 'auto' ? 'auto' : (+lpwNum.value || 1); lpwBox.classList.toggle('adm-hidden', v === 'auto'); } });
    const orSel = select({ options: [numOpt('auto', 'Automatik (jika takwim ada acara pembukaan sekolah)'), numOpt(0, 'Tiada'), numOpt(1, '1 minggu'), numOpt(2, '2 minggu'), numOpt(3, '3 minggu')], value: String(o.orientationWeeks ?? 'auto'), onChange: v => { o.orientationWeeks = v === 'auto' ? 'auto' : +v; } });
    const revSel = select({ options: [numOpt(0, 'Tiada'), numOpt(1, '1 minggu'), numOpt(2, '2 minggu')], value: String(o.reviseWeeksBeforeExam ?? 1), onChange: v => { o.reviseWeeksBeforeExam = +v; } });
    const postSel = select({ options: [{ value: 'program', label: 'Program pasca-peperiksaan (cadangan)' }, { value: 'pdp', label: 'Terus mengajar (PdP)' }], value: o.postExam || 'program', onChange: v => { o.postExam = v; } });
    const modeSel = select({ options: MODES, value: o.mode || 'urutan', onChange: v => { o.mode = v; } });
    const langSel = select({ options: langs().map(l => ({ value: l.id, label: l.label })), value: o.lang || 'ms', onChange: v => { o.lang = v; S.lang = v; } });
    [lpwSel, orSel, revSel, modeSel, langSel, postSel].forEach((el, i) => el.setAttribute('aria-label', ['Pelajaran seminggu', 'Minggu orientasi', 'Ulang kaji sebelum peperiksaan', 'Mod agihan', 'Bahasa dokumen', 'Selepas peperiksaan akhir'][i]));

    ap(wrap, RPH.ui.card({ title: 'Cara agihan', subtitle: 'Bagaimana SK/SP diagihkan ke minggu PdP.', body: h('div', { class: 'form-grid rg-form' },
      RPH.ui.field('Mod agihan', modeSel, 'Urutan = ikut susunan DSKP; Tema = ikut tema/unit; Bidang = bergilir antara bidang mengikut pemberat.'),
      RPH.ui.field('Pelajaran seminggu', h('div', { class: 'row rg-tight' }, lpwSel, lpwBox), 'Automatik = bilangan slot PdP kelas seminggu daripada jadual waktu.'),
      RPH.ui.field('Bahasa dokumen', langSel, 'Bahasa lalai pratonton dan eksport. Anda boleh eksport dalam bahasa lain di langkah 6.')) }));

    ap(wrap, RPH.ui.card({ title: 'Ulang kaji, orientasi dan minggu dilangkau', body: h('div', { class: 'stack' },
      h('div', { class: 'form-grid rg-form' },
        RPH.ui.field('Ulang kaji sebelum peperiksaan', revSel, 'Bilangan minggu ulang kaji sebelum setiap minggu peperiksaan.'),
        RPH.ui.field('Minggu orientasi / pembukaan sekolah', orSel, 'Minggu awal sesi yang tiada pelajaran DSKP.'),
        RPH.ui.field('Selepas peperiksaan akhir', postSel, 'Cadangan: minggu selepas peperiksaan akhir ialah program pasca-peperiksaan. Pilih "Terus mengajar" jika anda mahu meneruskan PdP.')),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Minggu dilangkau (tiada pelajaran)'), weekChips(o.skipWeeks, v => { o.skipWeeks = v; }), h('span', { class: 'field-hint' }, 'Ketik nombor minggu untuk dilangkau, cth. program sekolah yang anda tahu.')),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Minggu ulang kaji tambahan'), weekChips(o.extraRevisionWeeks, v => { o.extraRevisionWeeks = v; }), h('span', { class: 'field-hint' }, 'Ketik minggu yang mahu dijadikan ulang kaji.'))) }));

    // Pemberat bidang (PI)
    if (fam === 'pi') {
      const custom = !!o.bidangWeights;
      const defW = o.bidangWeights || {};
      const wSel = select({ options: [{ value: 'auto', label: 'Ikut bilangan SP dan corak RPT (disyorkan)' }, { value: 'custom', label: 'Tetapkan pemberat sendiri' }], value: custom ? 'custom' : 'auto', onChange: v => {
        if (v === 'auto') o.bidangWeights = null;
        else { let d = null; try { d = (gen().defaultOptions(S.subjectId, S.year) || {}).bidangWeights; } catch (e) { /* guna bank */ } o.bidangWeights = d ? U.clone(d) : Object.fromEntries(bdgBank.filter(b => b.id !== 'khatam').map(b => [b.id, 1])); }
        draw(); } });
      wSel.setAttribute('aria-label', 'Pemberat bidang');
      const tbl = custom ? h('div', { class: 'table-wrap' }, h('table', { class: 'table rg-bw' }, h('thead', null, h('tr', null, h('th', null, 'Bidang'), h('th', null, 'Pemberat (nisbah)'))),
        h('tbody', null, Object.keys(defW).map(id => { const b = bdgBank.find(x => x.id === id); return h('tr', null, h('td', null, b ? [rtl(b.jawi || '', 'jawi'), b.ms ? h('span', { class: 'muted small' }, ` ${b.ms}`) : null] : id),
          h('td', null, RPH.ui.input({ type: 'number', value: defW[id], min: 0, max: 20, cls: 'rg-narrow', onInput: v => { o.bidangWeights[id] = v == null ? 0 : +v; } }))); })))) : null;
      ap(wrap, RPH.ui.card({ title: 'Bidang Pendidikan Islam', subtitle: 'Nisbah minggu bagi setiap bidang.', body: h('div', { class: 'stack' }, RPH.ui.field('Pemberat bidang', wSel, 'Pemberat ialah nisbah relatif, bukan jumlah minggu.'), tbl) }));
    }

    // Corak & kandungan
    const prev = (src.previousRpt || []);
    const patSel = select({ options: prev.map(p => ({ value: p.key, label: `${p.key}${p.academicYearId ? ` (sesi ${p.academicYearId})` : ''}` })), value: o.patternFrom || '', placeholder: 'Tiada — jangan ikut corak RPT lama', onChange: v => { o.patternFrom = v || null; } });
    patSel.setAttribute('aria-label', 'Ikut corak RPT');
    const kh = h('input', { type: 'checkbox', checked: !!o.includeKhatam }); kh.addEventListener('change', () => { o.includeKhatam = kh.checked; });
    const sp = h('input', { type: 'checkbox', checked: o.samePaceAllClasses !== false }); sp.addEventListener('change', () => { o.samePaceAllClasses = sp.checked; });
    ap(wrap, RPH.ui.card({ title: 'Corak dan kandungan', body: h('div', { class: 'form-grid rg-form' },
      RPH.ui.field('Ikut corak RPT', patSel, prev.length ? 'RPT lain digunakan sebagai panduan nisbah sahaja; kandungannya tidak disalin.' : 'Tiada RPT lain tersimpan untuk dijadikan corak.'),
      fam === 'pi' ? h('div', { class: 'field rg-check-field' }, h('span', { class: 'field-label' }, 'Khatam / Tasmik'), h('label', { class: 'check' }, kh, h('span', null, 'Sertakan baris Khatam setiap minggu'))) : null,
      h('div', { class: 'field rg-check-field' }, h('span', { class: 'field-label' }, 'Kelas'), h('label', { class: 'check' }, sp, h('span', null, 'Kadar sama untuk semua kelas')))) }));
    const nU = (o.units || []).length;
    ap(wrap, h('div', { class: 'notice notice-info' }, icon('info'), h('span', null, nU ? `${nU} unit buku teks akan digunakan (diurus di langkah 2).` : 'Unit buku teks (pilihan) dimasukkan di langkah 2. Semua cadangan boleh disunting di langkah 5.')));
    return wrap;
  }

  // ------------------------------------------------------------------ Langkah 5: Penjanaan, liputan, suntingan
  const KIND_LABEL = { lesson: 'Pelajaran', khatam: 'Khatam', program: 'Program', ulangkaji: 'Ulang kaji', 'kosa-kata': 'Kosa kata', huruf: 'Huruf', 'suku-kata': 'Suku kata', 'huruf+suku-kata': 'Huruf + suku kata', tarkib: 'Tarkib', nombor: 'Nombor', projek: 'Projek', peperiksaan: 'Peperiksaan', cuti: 'Cuti' };
  const DERIV_LABEL = { 'dskp-urutan': 'urutan DSKP', 'dskp-tema': 'tema DSKP', 'dskp-bidang': 'bidang DSKP', 'rpt-lama': 'corak RPT lama', manual: 'manual' };
  let rowsByWeek = new Map();
  let sideEl = null, gridEl = null;

  const planWeek = n => S.plan && S.plan.weeks.find(w => +w.week === +n);
  const asArr = r => (Array.isArray(r) ? r : (r && r.issues) || []);
  function recompute() {
    const p = S.plan; if (!p) return;
    try { p.issues = asArr(gen().validate(p)); } catch (e) { console.error('[rptjana] validate', e); }
    try { p.coverage = gen().coverage(p) || p.coverage; } catch (e) { console.error('[rptjana] coverage', e); }
  }
  const refreshSideSoon = U.debounce(() => { if (!alive()) return; recompute(); refreshSide(); applyFilter(); }, 250);

  function mutated(weekNum, { lock = true } = {}) {
    const p = S.plan; if (!p) return;
    p.status = 'draf'; delete p.confirmedAt;
    S.dirty = true; RPH.ui.setDirty(true);
    if (lock && weekNum != null && !S.locked.has(+weekNum)) { S.locked.add(+weekNum); const r = rowsByWeek.get(+weekNum); if (r && r.sync) r.sync(); }
    refreshSideSoon();
  }

  // ----- Asal & jana
  const snapshot = () => ({ plan: U.clone(S.plan), locked: [...S.locked], weekStatus: U.clone(S.weekStatus), weekChanged: S.weekChanged });
  function pushUndo(label) { if (!S.plan) return; S.undo.push({ label, at: U.nowIso(), snap: snapshot() }); if (S.undo.length > 10) S.undo.shift(); }
  function undoLast() {
    const u = S.undo.pop(); if (!u) return;
    S.plan = u.snap.plan; S.locked = new Set(u.snap.locked); S.weekStatus = u.snap.weekStatus; S.weekChanged = u.snap.weekChanged;
    S.dirty = true; RPH.ui.setDirty(true); recompute(); draw();
    toast(`Dikembalikan: sebelum "${u.label}".`, 'success');
  }
  async function doGenerate(label) {
    const bl = blockers(); if (bl.length) { toast(bl[0], 'error', 6500); return false; }
    try {
      pushUndo(label);
      const plan = await gen().generate({ subjectId: S.subjectId, year: S.year, options: U.clone(S.options), weekStatus: U.clone(S.weekStatus) });
      if (!plan || !Array.isArray(plan.weeks)) throw new Error('Enjin tidak memulangkan RPT yang sah.');
      S.plan = plan; plan.status = 'draf'; S.locked = new Set(); S.fromStored = false; S.weekChanged = false; S.ackSig = null; S.savedKey = null;
      S.dirty = true; RPH.ui.setDirty(true); recompute();
      return true;
    } catch (e) { S.undo.pop(); RPH.reportError('jana RPT', e); return false; }
  }
  async function regenerateAll() {
    if (S.plan && !(await confirm({ title: 'Jana semula semua?', danger: true, confirmLabel: 'Jana semula', message: 'Semua suntingan dan kunci minggu akan diganti dengan cadangan baharu daripada enjin. Anda boleh menekan "Buat asal" selepas itu.' }))) return;
    if (await doGenerate('Jana semula semua')) { draw(); toast('RPT dijana semula (draf).', 'success'); }
  }
  async function doReflow() {
    const nLock = S.locked.size;
    if (!(await confirm({ title: 'Agih semula baki?', confirmLabel: 'Agih semula', message: `${nLock} minggu terkunci kekal. Pelajaran pada minggu lain diagihkan semula ke minggu PdP yang tinggal (termasuk perubahan status minggu). Anda boleh menekan "Buat asal" selepas itu.` }))) return;
    try {
      pushUndo('Agih semula baki');
      const cl = U.clone(S.plan);
      const res = await gen().reflow(cl, { lockedWeeks: [...S.locked] });
      S.plan = res && Array.isArray(res.weeks) ? res : cl;
      S.plan.status = 'draf'; delete S.plan.confirmedAt; S.dirty = true; S.weekChanged = false; RPH.ui.setDirty(true); recompute(); draw();
      toast('Baki diagihkan semula (draf).', 'success');
    } catch (e) { S.undo.pop(); RPH.reportError('agih semula', e); }
  }

  // ----- Maklumat standard DSKP
  function stdBlock(item, kind) {
    return h('div', { class: 'rg-std' }, h('div', { class: 'rg-std-head' }, h('span', { class: 'rg-code rg-code-static' }, item.code), h('span', { class: 'badge badge-slate' }, kind),
      item.page && item.page.printed ? h('span', { class: 'muted small' }, `DSKP m/s ${item.page.printed}`) : null), K().mixed(stdText(item), 'p', 'rg-std-text'));
  }
  function codeInfo(code, { addable = false } = {}) {
    const idx = dskp(); const sp = idx.sp.get(code), sk = idx.sk.get(code);
    const body = h('div', { class: 'stack' });
    if (!sp && !sk) ap(body, h('div', { class: 'notice notice-error' }, icon('alert'), h('span', null, `Kod ${code} tiada dalam DSKP ${subjLabelText()} Tahun ${S.year}.`)));
    if (sp) { ap(body, stdBlock(sp, 'SP')); const p = idx.sk.get(sp.skCode); if (p) ap(body, h('div', null, h('div', { class: 'adm-mini-head' }, 'Di bawah SK'), stdBlock(p, 'SK'))); }
    else if (sk) {
      ap(body, stdBlock(sk, 'SK'));
      const kids = idx.spList.filter(x => x.skCode === code);
      if (kids.length) ap(body, h('div', null, h('div', { class: 'adm-mini-head' }, `SP di bawah SK ini (${kids.length})`), h('div', { class: 'rg-std-kids' }, kids.map(k => stdBlock(k, 'SP')))));
    }
    let addSel = null;
    if (addable && (sp || sk) && S.plan) {
      addSel = select({ options: S.plan.weeks.filter(w => w.status === 'pdp').map(w => ({ value: w.week, label: `Minggu ${w.week} (${dm(w.start)}–${dm(w.end)})` })), placeholder: 'Pilih minggu…' });
      addSel.setAttribute('aria-label', 'Tambah ke minggu');
      ap(body, h('div', { class: 'rg-addrow' }, h('span', { class: 'field-label' }, 'Tambah kod ini ke minggu'), addSel));
    }
    modal({ title: `Standard ${code}`, size: 'md', body, actions: [{ label: 'Tutup' }, ...(addSel ? [{ label: 'Tambah ke minggu', kind: 'primary', icon: 'plus', onClick: () => { if (!addSel.value) { toast('Pilih minggu dahulu.', 'error'); return false; } addCodeToWeek(code, +addSel.value); } }] : [])] });
  }
  function addCodeToWeek(code, wk) {
    const w = planWeek(wk); if (!w) return;
    const idx = dskp(); const isSp = idx.sp.has(code);
    let l = w.lessons[0];
    if (!l) { l = newLesson(); w.lessons.push(l); }
    if (isSp) { l.sp = [...new Set([...(l.sp || []), code])]; const parent = idx.sp.get(code).skCode; if (parent) l.sk = [...new Set([...(l.sk || []), parent])]; }
    else l.sk = [...new Set([...(l.sk || []), code])];
    l.derivation = 'manual'; l.review = false;
    mutated(wk); const r = rowsByWeek.get(wk); if (r) r.redraw();
    toast(`${code} ditambah ke minggu ${wk}.`, 'success'); scrollToWeek(wk);
  }

  // ----- Pemilih SK/SP (terhad kepada kod yang wujud dalam DSKP)
  const norm = s => { s = String(s == null ? '' : s).toLowerCase(); return RPH.jawi && RPH.jawi.normalizeForMatch ? RPH.jawi.normalizeForMatch(s) : s; };
  function codePicker(kind, current, limitSk, onApply) {
    const idx = dskp(); const chosen = new Set(current);
    const list = kind === 'SK' ? idx.skList : idx.spList;
    const q = RPH.ui.input({ type: 'search', placeholder: 'Cari kod atau teks standard…' }); q.setAttribute('aria-label', 'Cari standard');
    const cnt = h('span', { class: 'muted small' });
    const upd = () => { cnt.textContent = `${chosen.size} dipilih`; };
    const limitCb = h('input', { type: 'checkbox', checked: !!(limitSk && limitSk.length) });
    const rows = [], heads = new Map();
    const box = h('div', { class: 'rg-pick-list' });
    let lastSk = null;
    list.forEach(x => {
      if (kind === 'SP' && x.skCode !== lastSk) {
        lastSk = x.skCode; const sk = idx.sk.get(x.skCode);
        const hd = h('div', { class: 'rg-pick-head' }, h('strong', null, `SK ${x.skCode}`), sk ? h('span', { class: 'muted small' }, ' — ', K().mixed(stdText(sk).slice(0, 110))) : null);
        heads.set(x.skCode, hd); ap(box, hd);
      }
      const cb = h('input', { type: 'checkbox', checked: chosen.has(x.code), 'aria-label': `Pilih ${x.code}` });
      cb.addEventListener('change', () => { cb.checked ? chosen.add(x.code) : chosen.delete(x.code); upd(); });
      const row = h('label', { class: 'rg-pick-row', dataset: { code: x.code } }, cb, h('span', { class: 'rg-code rg-code-static' }, x.code), K().mixed(stdText(x), 'span', 'rg-pick-text'));
      row._sk = kind === 'SP' ? x.skCode : x.code; row._q = norm(`${x.code} ${stdText(x)}`); rows.push(row); ap(box, row);
    });
    const filter = () => {
      const t = norm(q.value.trim()); const lim = kind === 'SP' && limitCb.checked && limitSk && limitSk.length ? new Set(limitSk) : null;
      const vis = new Set();
      rows.forEach(r => { const ok = (!t || r._q.includes(t)) && (!lim || lim.has(r._sk)); r.hidden = !ok; if (ok) vis.add(r._sk); });
      heads.forEach((hd, sk) => { hd.hidden = !vis.has(sk); });
      empt.hidden = vis.size > 0;
    };
    const empt = h('p', { class: 'muted small' }, 'Tiada standard sepadan.'); empt.hidden = true;
    q.addEventListener('input', filter); limitCb.addEventListener('change', filter);
    upd(); filter();
    modal({ title: kind === 'SK' ? 'Pilih Standard Kandungan (SK)' : 'Pilih Standard Pembelajaran (SP)', size: 'lg',
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted small' }, `Hanya kod yang wujud dalam DSKP ${subjLabelText()} Tahun ${S.year} disenaraikan. ${kind === 'SP' ? 'SK induk akan ditambah secara automatik.' : ''}`),
        h('div', { class: 'row' }, q, cnt), kind === 'SP' && limitSk && limitSk.length ? h('label', { class: 'check' }, limitCb, h('span', null, `Hanya SP di bawah SK pelajaran ini (${limitSk.join(', ')})`)) : null,
        box, empt),
      actions: [{ label: 'Batal' }, { label: 'Guna pilihan', kind: 'primary', icon: 'check', onClick: () => { onApply(list.map(x => x.code).filter(c => chosen.has(c))); } }] });
  }

  // ----- Baris minggu & kad pelajaran
  const newLesson = () => ({ kind: KINDS[familyOf()][0], topic: '', content: [], sk: [], sp: [], derivation: 'manual', review: false });
  function lockSvg(on) {
    const s = h('svg:svg', { viewBox: '0 0 24 24', width: 15, height: 15, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'icon' });
    s.appendChild(h('svg:path', { d: on ? 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4' : 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.5-2' })); return s;
  }
  function codeChips(l, key, w, redraw) {
    const idx = dskp(); const kind = key === 'sk' ? 'SK' : 'SP'; const map = key === 'sk' ? idx.sk : idx.sp;
    const box = h('div', { class: 'rg-codes', dataset: { kind } });
    (l[key] || []).forEach(c => {
      const bad = !map.has(c); const it = map.get(c);
      ap(box, h('span', { class: ['rg-chip', bad ? 'rg-chip-bad' : null], dataset: { code: c } },
        h('button', { type: 'button', class: 'rg-chip-code', title: bad ? 'Kod tiada dalam DSKP' : stdText(it).slice(0, 160), onClick: () => codeInfo(c) }, c),
        h('button', { type: 'button', class: 'rg-chip-x', 'aria-label': `Buang ${c}`, title: 'Buang', onClick: () => { l[key] = l[key].filter(x => x !== c); l.derivation = 'manual'; l.review = false; mutated(w.week); redraw(); } }, '×')));
    });
    ap(box, h('button', { type: 'button', class: 'btn btn-sm rg-add', onClick: () => codePicker(kind, l[key] || [], kind === 'SP' ? (l.sk || []) : null, codes => {
      l[key] = codes;
      if (kind === 'SP') { const parents = codes.map(c => idx.sp.get(c) && idx.sp.get(c).skCode).filter(Boolean); const missing = parents.filter(p => !(l.sk || []).includes(p)); if (missing.length) { l.sk = [...new Set([...(l.sk || []), ...missing])]; toast(`SK induk ditambah: ${[...new Set(missing)].join(', ')}.`, 'info', 3500); } }
      l.derivation = 'manual'; l.review = false; mutated(w.week); redraw(); }) }, icon('plus', 13), kind));
    return box;
  }
  function lessonCard(w, l, li, redraw) {
    const fam = familyOf(); const sc = scriptOf();
    const kinds = [...new Set([...(KINDS[fam] || KINDS.generic), l.kind].filter(Boolean))];
    const inp = (key, label, cls) => RPH.ui.field(label, RPH.ui.input({ value: l[key] || '', onInput: v => { l[key] = v; if (key === 'topic') delete l.topicI18n; mutated(w.week); } }), null); // topik disunting → terjemahan lama dibuang (dokumen menterjemah semula)
    const kindSel = select({ options: kinds.map(k => ({ value: k, label: KIND_LABEL[k] || k })), value: l.kind || kinds[0], cls: 'input-sm', onChange: v => { l.kind = v; mutated(w.week); } });
    kindSel.setAttribute('aria-label', 'Jenis pelajaran');
    const moveSel = select({ options: S.plan.weeks.filter(x => +x.week !== +w.week).map(x => ({ value: x.week, label: `Minggu ${x.week} · ${STATUS_LABEL[x.status] || x.status}` })), placeholder: 'Pindah ke minggu…', cls: 'input-sm rg-move',
      onChange: v => { if (v) moveLesson(w, li, +v); } });
    moveSel.setAttribute('aria-label', 'Pindah pelajaran ke minggu lain');
    const sug = l.review;
    const head = h('div', { class: 'rg-l-head' }, kindSel,
      sug ? h('span', { class: 'badge badge-amber', title: `Asal: ${DERIV_LABEL[l.derivation] || l.derivation || 'cadangan'}` }, icon('alert', 12), 'Dicadangkan sistem') : h('span', { class: 'badge badge-green' }, icon('check', 12), l.derivation === 'manual' ? 'Manual' : 'Disemak'),
      l.derivation && l.derivation !== 'manual' ? h('span', { class: 'muted small rg-deriv' }, `asal: ${DERIV_LABEL[l.derivation] || l.derivation}`) : null,
      h('span', { class: 'spacer' }),
      sug ? button('Tandakan disemak', { size: 'sm', icon: 'check', onClick: () => { l.review = false; mutated(w.week, { lock: false }); redraw(); } }) : null,
      moveSel, K().iconBtn('trash', 'Padam pelajaran', async () => { if (await confirm({ title: 'Padam pelajaran', danger: true, confirmLabel: 'Padam', message: `Padam pelajaran ini daripada minggu ${w.week}?` })) { w.lessons.splice(li, 1); mutated(w.week); redraw(); } }, 'danger'));
    const showContent = fam === 'ba' || (l.content || []).length;
    const content = showContent ? RPH.ui.field(fam === 'ba' ? 'Kandungan / kosa kata (satu baris satu item)' : 'Kandungan', RPH.ui.textarea({ value: (l.content || []).join('\n'), rows: 3, onInput: v => { l.content = v.split('\n').map(s => s.trim()).filter(Boolean); mutated(w.week); } })) : null;
    const textStd = (l.skText || l.spText) ? h('div', { class: 'form-grid rg-std-text-fields' },
      l.skText != null ? RPH.ui.field('Teks SK (sumber, tiada kod)', RPH.ui.textarea({ value: l.skText, rows: 2, onInput: v => { l.skText = v; mutated(w.week); } })) : null,
      l.spText != null ? RPH.ui.field('Teks SP (sumber)', RPH.ui.textarea({ value: l.spText, rows: 2, onInput: v => { l.spText = v; mutated(w.week); } })) : null) : null;
    return h('div', { class: ['rg-lesson', sug ? 'rg-review' : null], dataset: { li } },
      head,
      h('div', { class: 'rg-l-grid' },
        inp('theme', 'Tema'), inp('unit', 'Unit'), inp('topic', 'Topik'),
        fam === 'pi' || l.bidang ? inp('bidang', 'Bidang') : null),
      content, textStd,
      h('div', { class: 'rg-l-codes' },
        h('div', { class: 'rg-codes-wrap' }, h('span', { class: 'rg-codes-label' }, 'SK'), codeChips(l, 'sk', w, redraw)),
        h('div', { class: 'rg-codes-wrap' }, h('span', { class: 'rg-codes-label' }, 'SP'), codeChips(l, 'sp', w, redraw))),
      inp('note', 'Catatan pelajaran'));
  }
  function moveLesson(w, li, target) {
    const t = planWeek(target); if (!t) return;
    const [l] = w.lessons.splice(li, 1); t.lessons.push(l);
    mutated(w.week); mutated(t.week);
    [w.week, t.week].forEach(n => { const r = rowsByWeek.get(n); if (r) r.redraw(); });
    toast(`Pelajaran dipindahkan ke minggu ${target}.`, 'success', 2200);
  }

  function weekRow(w) {
    const rootEl = h('div', { class: 'rg-week', id: `rg-w-${w.week}`, dataset: { week: w.week } });
    let lockBtn = null;
    const sync = () => {
      rootEl.className = `rg-week rg-st-${w.status}${S.locked.has(+w.week) ? ' rg-locked' : ''}`;
      if (lockBtn) { const on = S.locked.has(+w.week); lockBtn.classList.toggle('rg-lock-on', on); lockBtn.setAttribute('aria-pressed', String(on)); lockBtn.title = on ? 'Dikunci — kekal semasa "Agih semula baki". Klik untuk membuka kunci.' : 'Kunci minggu ini supaya kekal semasa "Agih semula baki".'; clear(lockBtn); ap(lockBtn, lockSvg(on), h('span', null, on ? 'Dikunci' : 'Kunci')); }
    };
    const redraw = () => {
      clear(rootEl);
      lockBtn = h('button', { type: 'button', class: 'btn btn-sm rg-lock', onClick: () => { S.locked.has(+w.week) ? S.locked.delete(+w.week) : S.locked.add(+w.week); sync(); refreshSideSoon(); } });
      const stSel = select({ options: WEEK_STATUS, value: w.status, cls: 'input-sm rg-wstatus', onChange: v => { w.status = v; mutated(w.week); redraw(); toast('Status minggu ditukar. Tekan "Agih semula baki" jika bilangan minggu PdP berubah.', 'info', 4200); } });
      stSel.setAttribute('aria-label', `Status minggu ${w.week}`);
      const evs = (w.events || []).map(evText).filter(Boolean);
      const noteIn = RPH.ui.input({ value: w.note || '', placeholder: 'Catatan minggu (cth. CUTI PENGGAL 1)', onInput: v => { w.note = v || null; mutated(w.week, { lock: false }); } });
      noteIn.setAttribute('aria-label', `Catatan minggu ${w.week}`);
      ap(rootEl, 
        h('div', { class: 'rg-w-side' },
          h('div', { class: 'rg-w-no' }, h('strong', null, `Minggu ${w.week}`), w.rptWeek != null && w.rptWeek !== w.week ? h('span', { class: 'muted small' }, ` · RPT M${w.rptWeek}`) : null),
          h('div', { class: 'muted small' }, `${dm(w.start)} – ${dm(w.end)}${w.term != null ? ` · Penggal ${w.term}` : ''}${w.kpmWeek != null ? ` · KPM ${w.kpmWeek}` : ''}${w.pdpDays != null ? ` · ${w.pdpDays} hari` : ''}`),
          h('div', { class: 'rg-w-ctrl' }, stSel, lockBtn),
          evs.length ? h('div', { class: 'rg-evs' }, evs.slice(0, 2).map(e => h('span', { class: 'rg-ev', title: e }, K().mixed(e))), evs.length > 2 ? h('span', { class: 'muted small' }, `+${evs.length - 2}`) : null) : null),
        h('div', { class: 'rg-w-main' },
          w.lessons.length ? w.lessons.map((l, li) => lessonCard(w, l, li, redraw)) : h('div', { class: 'rg-w-none muted small' }, w.status === 'pdp' ? 'Tiada pelajaran pada minggu PdP ini.' : `Tiada pelajaran (${(STATUS_LABEL[w.status] || w.status).toLowerCase()}).`),
          h('div', { class: 'rg-w-foot' }, button('Tambah pelajaran', { size: 'sm', icon: 'plus', onClick: () => { w.lessons.push(newLesson()); mutated(w.week); redraw(); } }), noteIn)));
      sync();
    };
    rootEl.redraw = redraw; rootEl.sync = sync;
    rowsByWeek.set(+w.week, rootEl);
    redraw();
    return rootEl;
  }

  // ----- Panel liputan & isu
  function issueWeek(i) {
    const r = i && i.ref;
    if (typeof r === 'number') return r;
    if (r && typeof r === 'object' && r.week != null) return +r.week;
    if (typeof r === 'string') { if (/^\d+$/.test(r)) return +r; const m = /^(?:w|week|minggu|m)[:\s-]*(\d+)$/i.exec(r); if (m) return +m[1]; }
    if (r == null) { const m = /[Mm]inggu\s*(\d+)/.exec((i && i.msg) || ''); if (m) return +m[1]; }
    return null;
  }
  function issueCode(i) { const r = i && i.ref; const c = r && typeof r === 'object' ? r.code : (typeof r === 'string' ? r : null); return c && /^\d+(\.\d+){1,2}$/.test(c) ? c : null; }
  function issueWeeks() { return new Set(((S.plan && S.plan.issues) || []).map(issueWeek).filter(x => x != null)); }
  function scrollToWeek(wk) {
    if (S.filter !== 'all' && rowsByWeek.get(+wk) && rowsByWeek.get(+wk).hidden) { S.filter = 'all'; applyFilter(); const sel = root.querySelector('.rg-filter'); if (sel) sel.value = 'all'; }
    S.tab = 'edit';
    const el = rowsByWeek.get(+wk) || document.getElementById(`rg-w-${wk}`); if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.remove('rg-flash'); void el.offsetWidth; el.classList.add('rg-flash');
  }
  function covBar(label, c) {
    const total = (c && c.total) || 0, planned = (c && c.planned) || 0; const pct = total ? Math.round(planned / total * 100) : 0;
    return h('div', { class: 'rg-cov-row' }, h('div', { class: 'rg-cov-label' }, h('strong', null, label), h('span', { class: 'muted small' }, ` ${planned}/${total} dirancang`)),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': `${label} dirancang` }, h('span', { style: { width: `${pct}%` } })));
  }
  function codeList(title, codes, cls, hint) {
    if (!codes || !codes.length) return null;
    return h('details', { class: ['rg-cov-list', cls] }, h('summary', null, `${title} (${codes.length})`), hint ? h('div', { class: 'muted small' }, hint) : null,
      h('div', { class: 'rg-cov-codes' }, codes.map(c => h('button', { type: 'button', class: 'rg-code', title: 'Lihat teks DSKP', onClick: () => codeInfo(c, { addable: cls === 'rg-missing' }) }, c))));
  }
  function coverPanel() {
    const p = S.plan; const cov = p.coverage || {}; const issues = p.issues || [];
    const nE = issues.filter(i => i.level === 'error').length, nW = issues.filter(i => i.level === 'warn').length, nI = issues.filter(i => i.level === 'info').length;
    const lessons = p.weeks.reduce((n, w) => n + w.lessons.length, 0), rev = p.weeks.reduce((n, w) => n + w.lessons.filter(l => l.review).length, 0);
    const pdp = p.weeks.filter(w => w.status === 'pdp').length;
    const list = h('ul', { class: 'rg-issues' }, issues.length ? issues.map(i => {
      const wk = issueWeek(i), code = issueCode(i);
      const b = h('button', { type: 'button', class: ['rg-issue', `rg-issue-${i.level}`], disabled: wk == null && !code, onClick: () => (wk != null ? scrollToWeek(wk) : codeInfo(code, { addable: true })) },
        h('span', { class: ['badge', i.level === 'error' ? 'badge-red' : i.level === 'warn' ? 'badge-amber' : 'badge-slate'] }, i.level === 'error' ? 'Ralat' : i.level === 'warn' ? 'Amaran' : 'Maklumat'),
        h('span', { class: 'rg-issue-msg', dir: 'auto' }, i.msg), wk != null ? h('span', { class: 'muted small' }, `M${wk}`) : null);
      return h('li', null, b);
    }) : h('li', { class: 'muted small' }, 'Tiada isu dikesan.'));
    return h('aside', { class: 'rg-side', 'aria-label': 'Liputan dan isu' },
      h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Liputan SK / SP')), h('div', { class: 'card-body rg-cov' },
        covBar('SK', cov.sk), covBar('SP', cov.sp),
        codeList('SK tertinggal', cov.sk && cov.sk.missing, 'rg-missing', 'Belum dirancang dalam mana-mana minggu. Klik untuk melihat teks dan menambah ke minggu.'),
        codeList('SP tertinggal', cov.sp && cov.sp.missing, 'rg-missing', 'Belum dirancang dalam mana-mana minggu.'),
        codeList('SP berulang', cov.sp && cov.sp.repeated, 'rg-repeated', 'Muncul lebih daripada sekali — mungkin sengaja (ulang kaji/pengukuhan), semak.'),
        h('div', { class: 'rg-mini-stats' }, h('span', null, h('strong', null, pdp), ' minggu PdP'), h('span', null, h('strong', null, lessons), ' pelajaran'), h('span', { class: rev ? 'rg-txt-amber' : null }, h('strong', null, rev), ' belum disemak')))),
      h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Isu'), h('div', { class: 'row rg-tight' }, h('span', { class: 'badge badge-red' }, `${nE} ralat`), h('span', { class: 'badge badge-amber' }, `${nW} amaran`), nI ? h('span', { class: 'badge badge-slate' }, `${nI} maklumat`) : null)), h('div', { class: 'card-body rg-issues-body' }, list)));
  }
  function refreshSide() { if (!S.plan || !sideEl || !sideEl.isConnected) return; const n = coverPanel(); sideEl.replaceWith(n); sideEl = n; }

  function matchFilter(w) {
    switch (S.filter) {
      case 'pdp': return w.status === 'pdp';
      case 'issues': return issueWeeks().has(+w.week);
      case 'review': return w.lessons.some(l => l.review);
      case 'locked': return S.locked.has(+w.week);
      default: return true;
    }
  }
  function applyFilter() { if (!S.plan) return; S.plan.weeks.forEach(w => { const r = rowsByWeek.get(+w.week); if (r) r.hidden = !matchFilter(w); }); const n = root && root.querySelector('.rg-filter-count'); if (n) n.textContent = `${S.plan.weeks.filter(matchFilter).length} / ${S.plan.weeks.length} minggu`; }

  // ----- Pratonton dokumen
  function mountPreview(host, lang) {
    clear(host);
    let el;
    try { el = doc().render(S.plan, { ...docOpts(lang), mode: 'preview' }); } catch (e) { RPH.reportError('pratonton RPT', e); ap(host, h('div', { class: 'notice notice-error' }, icon('alert'), h('span', null, `Pratonton gagal: ${e.message}`))); return; }
    const inner = h('div', { class: 'rg-prev-scale' }, el);
    ap(host, inner);
    const fit = () => { const w = inner.scrollWidth || inner.offsetWidth; const avail = host.clientWidth; if (!w || !avail) return; const k = Math.min(1, avail / w); inner.style.transform = `scale(${k})`; host.style.height = `${Math.ceil(inner.offsetHeight * k)}px`; host.dataset.scale = k.toFixed(3); };
    fit(); requestAnimationFrame(fit); setTimeout(fit, 500);
    if (window.ResizeObserver) { if (resizeObs) resizeObs.disconnect(); resizeObs = new ResizeObserver(fit); resizeObs.observe(host); resizeObs.observe(inner); }
  }
  // ----- Bahasa dokumen: acara sekolah & liputan terjemahan
  const evDefault = l => (doc() && typeof doc().eventsDefault === 'function' ? doc().eventsDefault(l) : l === 'ms');
  const evOn = l => (S.events && Object.prototype.hasOwnProperty.call(S.events, l) ? !!S.events[l] : evDefault(l));
  const docOpts = lang => ({ lang, events: evOn(lang) });
  const EV_HINT = 'Lalai: dipaparkan bagi Bahasa Melayu; disembunyikan bagi English, العربية dan Jawi (nama acara sekolah kekal seperti ditulis dalam takwim). Cuti umum & cuti penggal sentiasa dipaparkan dan diterjemah.';
  /** Liputan terjemahan DSKP bagi satu bahasa: {pct, missing, total, native} | null (RPH.i18n tiada). */
  function i18nCoverage(lang, sid, year) {
    const I = RPH.i18n;
    if (!I || typeof I.missing !== 'function') return null;
    sid = sid || S.subjectId; year = year != null ? year : S.year;
    try {
      const nat = typeof I.nativeLang === 'function' ? I.nativeLang(sid, year) : null;
      if (nat === lang) return { pct: 100, missing: 0, total: 0, native: true };
      const c = st().curriculum(sid, year);
      if (!c) return null;
      const total = (c.domains || []).reduce((n, d) => n + 1 + (d.contentStandards || []).reduce((k, sk) => k + 1 + (sk.learningStandards || []).length, 0), 0) + (c.themes || []).length;
      const mm = I.missing({ subjectId: sid, year }) || {};
      const miss = Array.isArray(mm[lang]) ? mm[lang].length : (typeof mm[lang] === 'number' ? mm[lang] : 0);
      const pct = total ? Math.max(0, Math.min(100, Math.round(((total - miss) / total) * 100))) : 100;
      return { pct, missing: miss, total, native: false };
    } catch (e) { return null; }
  }
  function goTranslate(sid, year) { try { RPH.router.go('dskp', null, { subject: sid || S.subjectId, year: year != null ? year : S.year, tab: 'terjemahan' }); } catch (e) { RPH.reportError('ke DSKP → Terjemahan', e); } }
  /** Lencana "Liputan terjemahan" + pautan ke DSKP → Terjemahan jika ada standard tanpa terjemahan. */
  function coverageBadge(lang, sid, year) {
    const c = i18nCoverage(lang, sid, year);
    if (!c) return h('span', { class: 'badge rg-i18n-badge', title: 'Modul terjemahan (RPH.i18n) belum dimuatkan — kandungan dicetak dalam bahasa asal.' }, 'Liputan terjemahan: —');
    if (c.native) return h('span', { class: 'badge badge-green rg-i18n-badge', title: 'Bahasa asal DSKP — teks rasmi.' }, 'Bahasa asal DSKP');
    const cls = c.pct >= 100 ? 'badge-green' : c.pct >= 60 ? 'badge-amber' : 'badge-red';
    const badge = h('span', { class: ['badge', cls, 'rg-i18n-badge'], title: `${c.total - c.missing} daripada ${c.total} item DSKP (domain, SK, SP, tema) ada terjemahan. Item tanpa terjemahan dicetak dalam teks asal bertanda "(asal)".` }, `Liputan terjemahan ${c.pct}%`);
    if (!c.missing) return badge;
    return h('span', { class: 'row rg-tight rg-i18n' }, badge,
      h('button', { type: 'button', class: 'btn btn-sm btn-link rg-i18n-link', dataset: { i18nLink: lang }, onClick: () => goTranslate(sid, year) }, `${c.missing} belum diterjemah — lengkapkan di DSKP → Terjemahan`));
  }
  function eventsToggle(lang, onChange, { compact = false } = {}) {
    const cb = h('input', { type: 'checkbox', checked: evOn(lang), dataset: { eventsLang: lang } });
    cb.setAttribute('aria-label', `Paparkan acara sekolah (${lang.toUpperCase()})`);
    cb.addEventListener('change', () => { S.events = Object.assign({}, S.events, { [lang]: cb.checked }); if (onChange) onChange(cb.checked); });
    return h('label', { class: ['check', 'rg-ev-toggle'], title: EV_HINT }, cb, h('span', null, compact ? 'Acara sekolah' : 'Paparkan acara sekolah'));
  }
  function previewTab() {
    const host = h('div', { class: 'rg-prev-host', dataset: { lang: S.lang } });
    const info = h('div', { class: 'row rg-prev-info' });
    const drawInfo = () => {
      clear(info);
      ap(info, eventsToggle(S.lang, () => mountPreview(host, S.lang)), coverageBadge(S.lang));
      ap(info, h('span', { class: 'small muted rg-ev-hint' }, evDefault(S.lang) ? 'Lalai Bahasa Melayu: acara sekolah dipaparkan.' : 'Lalai bahasa ini: acara sekolah disembunyikan (nama acara tidak diterjemah). Cuti umum tetap dipaparkan.'));
    };
    const btns = langs().map(l => h('button', { type: 'button', class: ['btn', 'btn-sm', S.lang === l.id ? 'btn-primary' : null], dataset: { lang: l.id }, 'aria-pressed': String(S.lang === l.id),
      onClick: () => { S.lang = l.id; btns.forEach(b => { const on = b.dataset.lang === l.id; b.classList.toggle('btn-primary', on); b.setAttribute('aria-pressed', String(on)); }); host.dataset.lang = l.id; drawInfo(); mountPreview(host, l.id); } }, l.id === 'ar' || l.id === 'jawi' ? h('span', { class: l.id === 'ar' ? 'ar' : 'jawi', dir: 'rtl' }, l.label) : l.label));
    drawInfo();
    const wrap = h('div', { class: 'stack' }, h('div', { class: 'row rg-langsw', role: 'group', 'aria-label': 'Bahasa pratonton' }, h('span', { class: 'small muted' }, 'Bahasa dokumen:'), btns,
      S.plan.status === 'draf' ? h('span', { class: 'badge badge-amber' }, 'DRAF — ditanda pada dokumen') : h('span', { class: 'badge badge-green' }, 'DISAHKAN')), info,
      h('div', { class: 'small muted rg-hint' }, 'Seluruh kandungan (topik, bidang, tema, SK/SP, nota, cuti umum, jawatan) dipaparkan dalam bahasa dipilih. Kosa kata/ungkapan Arab (bahan pelajaran) kekal dalam Arab «…». Terjemahan SK/SP ialah draf, bukan teks rasmi DSKP.'), host);
    setTimeout(() => { if (alive()) mountPreview(host, S.lang); }, 0);
    return wrap;
  }

  function editTab() {
    rowsByWeek = new Map();
    gridEl = h('div', { class: 'rg-grid' }, h('div', { class: 'rg-grid-head' }, h('span', null, 'Minggu'), h('span', null, 'Pelajaran')), S.plan.weeks.map(weekRow));
    setTimeout(applyFilter, 0);
    return gridEl;
  }

  function step5() {
    if (!S.plan) {
      const bl = blockers();
      const fam = familyOf(); const o = S.options;
      const sum = [['Mod', (MODES.find(m => m.value === o.mode) || {}).label || o.mode || '—'], ['Pelajaran seminggu', o.lessonsPerWeek === 'auto' || o.lessonsPerWeek == null ? 'automatik (jadual waktu)' : String(o.lessonsPerWeek)],
        ['Ulang kaji sebelum peperiksaan', `${o.reviseWeeksBeforeExam ?? 1} minggu`], ['Minggu dilangkau', (o.skipWeeks || []).join(', ') || 'tiada'], ['Corak RPT', o.patternFrom || 'tiada'], ['Unit buku teks', (o.units || []).length ? `${o.units.length} unit` : 'tiada'],
        ['Bahasa dokumen', (langs().find(l => l.id === (o.lang || 'ms')) || {}).label || o.lang], fam === 'pi' ? ['Khatam', o.includeKhatam ? 'ya' : 'tidak'] : null].filter(Boolean);
      return RPH.ui.card({ title: 'Jana RPT', subtitle: `${subjLabelText()} · Tahun ${S.year}`, body: h('div', { class: 'stack' },
        bl.length ? h('div', { class: 'notice notice-error', role: 'alert' }, icon('alert'), h('ul', { class: 'rg-bl' }, bl.map(m => h('li', null, m)))) : h('div', { class: 'notice notice-info' }, icon('info'), h('span', null, 'Enjin hanya mengagihkan SK/SP daripada DSKP anda ke minggu PdP. Hasilnya ialah draf cadangan yang perlu disemak dan disahkan.')),
        K().kv(sum),
        h('div', { class: 'row' }, button('Jana RPT sekarang', { kind: 'primary', size: 'lg', icon: 'wand', disabled: !!bl.length, onClick: async () => { if (await doGenerate('Jana RPT')) { S.tab = 'edit'; draw(); toast('RPT dijana sebagai draf. Semak, sunting dan sahkan.', 'success'); } } }),
          button('Ubah pilihan', { icon: 'settings', onClick: () => go(4) }))) });
    }
    const wrap = h('div', { class: 'stack' });
    if (S.weekChanged) ap(wrap, h('div', { class: 'notice' }, icon('alert'), h('span', null, 'Status minggu diubah di langkah 3 selepas RPT dijana. Tekan "Jana semula semua" untuk mengambil kira perubahan itu, atau "Agih semula baki" selepas menyesuaikan status.')));
    if (S.fromStored) ap(wrap, h('div', { class: 'notice notice-info' }, icon('info'), h('span', null, 'Anda sedang menyunting salinan RPT yang telah disimpan. Perubahan hanya disimpan ke Pengurus RPT di langkah 6 selepas anda mengesahkan.')));
    const filterSel = select({ options: [{ value: 'all', label: 'Semua minggu' }, { value: 'pdp', label: 'Minggu PdP sahaja' }, { value: 'issues', label: 'Minggu ada isu' }, { value: 'review', label: 'Ada cadangan belum disemak' }, { value: 'locked', label: 'Minggu terkunci' }], value: S.filter, cls: 'input-sm rg-filter', onChange: v => { S.filter = v; applyFilter(); } });
    filterSel.setAttribute('aria-label', 'Tapis minggu');
    const bar = h('div', { class: 'rg-toolbar' },
      button('Agih semula baki', { icon: 'refresh', title: 'Agih semula pelajaran yang belum dikunci ke minggu PdP yang tinggal', onClick: doReflow }),
      button('Jana semula semua', { icon: 'wand', onClick: regenerateAll }),
      button(`Buat asal${S.undo.length ? ` (${S.undo.length})` : ''}`, { icon: 'left', disabled: !S.undo.length, title: S.undo.length ? `Kembali sebelum "${S.undo[S.undo.length - 1].label}"` : 'Tiada penjanaan untuk dibuat asal', onClick: undoLast }),
      S.locked.size ? button(`Buka kunci (${S.locked.size})`, { size: 'sm', onClick: () => { S.locked.clear(); rowsByWeek.forEach(r => r.sync()); draw(); } }) : null,
      h('span', { class: 'spacer' }), S.tab === 'edit' ? h('span', { class: 'row rg-tight' }, h('span', { class: 'muted small rg-filter-count' }), filterSel) : null);
    const tabs = RPH.ui.tabs([{ id: 'edit', label: 'Suntingan minggu' }, { id: 'preview', label: 'Pratonton dokumen' }], S.tab, t => { S.tab = t; draw(); });
    const main = h('div', { class: 'rg-main' }, bar, tabs, S.tab === 'edit' ? h('div', { class: 'small muted rg-hint' }, 'Mana-mana suntingan mengunci minggu itu supaya kekal semasa "Agih semula baki". Anda boleh membuka kunci pada setiap minggu.') : null, S.tab === 'edit' ? editTab() : previewTab());
    sideEl = coverPanel();
    ap(wrap, h('div', { class: 'rg-layout' }, sideEl, main));
    return wrap;
  }

  // ------------------------------------------------------------------ Eksport (dikongsi langkah 6 + "Eksport dalam bahasa lain")
  async function runExport(kind, plan, lang, btn) {
    if (btn) btn.disabled = true;
    try {
      if (kind === 'docx') { const r = await doc().docx(plan, docOpts(lang)); U.download(r.filename, r.blob); toast(`${r.filename} dimuat turun.`, 'success'); }
      else { if (kind === 'pdf') toast('Dalam dialog cetak, pilih "Simpan sebagai PDF" sebagai destinasi.', 'info', 5000); await doc().print(plan, docOpts(lang)); }
    } catch (e) { RPH.reportError(`eksport ${kind}`, e); }
    finally { if (btn) btn.disabled = false; }
  }
  function exportPanel(plan, { json = false } = {}) {
    const box = h('div', { class: 'stack' });
    ap(box, plan.status === 'draf' ? h('div', { class: 'notice' }, icon('alert'), h('span', null, 'RPT ini masih DRAF — dokumen yang dieksport ditanda "DRAF" sehingga disahkan.')) : null);
    const rows = langs().map(l => h('div', { class: 'rg-exp-row', dataset: { lang: l.id } },
      h('div', { class: 'rg-exp-lang' }, l.id === 'ar' || l.id === 'jawi' ? h('span', { class: l.id === 'ar' ? 'ar' : 'jawi', dir: 'rtl', lang: l.id === 'ar' ? 'ar' : 'ms-Arab' }, l.label) : l.label, h('span', { class: 'muted small' }, ` (${(doc().filename ? doc().filename(plan, 'docx') : '').replace(/\.docx$/, '').replace(/_[A-Z]+$/, '')}_${l.id.toUpperCase()})`)),
      h('div', { class: 'row rg-tight rg-exp-meta' }, coverageBadge(l.id, plan.subjectId, plan.year), eventsToggle(l.id, null, { compact: true })),
      h('div', { class: 'row rg-tight' },
        ...['docx', 'pdf', 'print'].map(k => { const b = h('button', { type: 'button', class: 'btn btn-sm', dataset: { export: k, lang: l.id }, onClick: () => runExport(k, plan, l.id, b) }, icon(k === 'docx' ? 'download' : 'print', 14), k === 'docx' ? 'DOCX' : k === 'pdf' ? 'PDF' : 'Cetak'); return b; }))));
    ap(box, h('div', { class: 'rg-exp' }, rows));
    ap(box, h('div', { class: 'small muted' }, `"Acara sekolah": ${EV_HINT}`));
    if (json) ap(box, h('div', { class: 'row' }, button('Muat turun JSON (RPT)', { icon: 'download', onClick: () => { try { K().downloadJson(`RPT_${plan.subjectId}-${plan.year}_${plan.academicYearId || st().activeYear()}.json`, gen().toStored(plan)); } catch (e) { RPH.reportError('muat turun JSON', e); } } }), h('span', { class: 'muted small' }, 'Format sama seperti Pengurus RPT (boleh diimport semula).')));
    return box;
  }
  async function exportStored(sid, year) {
    let plan = null;
    try { plan = await gen().fromStored(sid, +year); } catch (e) { RPH.reportError('RPT sedia ada', e); return; }
    if (!plan) { toast('RPT tersimpan tidak dapat dibaca untuk eksport.', 'error'); return; }
    const s = st().subject(sid);
    modal({ title: `Eksport RPT — ${(s && s.name && s.name.ms) || sid} Tahun ${year}`, size: 'md', body: exportPanel(plan, { json: true }), actions: [{ label: 'Tutup', kind: 'primary' }] });
  }

  // ------------------------------------------------------------------ Langkah 6: Sahkan & simpan
  function checkItem(ok, title, detail, action, state) {
    const stt = state || (ok ? 'ok' : 'bad');
    return h('li', { class: ['rg-check', `rg-check-${stt}`] }, h('span', { class: 'rg-check-mark', 'aria-hidden': 'true' }, icon(stt === 'ok' ? 'check' : stt === 'warn' ? 'alert' : 'x', 14)),
      h('div', { class: 'rg-check-body' }, h('strong', null, title), h('div', { class: 'small muted' }, detail)), action || null);
  }
  function step6() {
    const p = S.plan;
    if (!p) return empty('Jana RPT dahulu di langkah 5.', button('Ke langkah 5', { kind: 'primary', onClick: () => go(5) }));
    recompute();
    const issues = p.issues || []; const errs = issues.filter(i => i.level === 'error'), warns = issues.filter(i => i.level === 'warn');
    const cov = p.coverage || {}; const mSk = (cov.sk && cov.sk.missing) || [], mSp = (cov.sp && cov.sp.missing) || [];
    const sig = [...mSk, ...mSp].join(',');
    const covOk = !sig || S.ackSig === sig;
    const rev = p.weeks.reduce((n, w) => n + w.lessons.filter(l => l.review).length, 0);
    const allOk = !errs.length && covOk && rev === 0;
    const confirmed = p.status === 'disahkan';
    const archived = isArchived();
    const key = `${p.subjectId}-${p.year}`; const exists = !!((st().get('rpt') || {})[key]);

    const ackCb = h('input', { type: 'checkbox', checked: covOk && !!sig, disabled: !sig }); ackCb.setAttribute('aria-label', 'Akui SK/SP tertinggal');
    ackCb.addEventListener('change', () => { S.ackSig = ackCb.checked ? sig : null; draw(); });
    const list = h('ul', { class: 'rg-checklist' },
      checkItem(!errs.length, 'Tiada ralat', errs.length ? `${errs.length} ralat perlu dibetulkan (kod tiada dalam DSKP, SP di luar SK, dan sebagainya).` : 'Semakan enjin tidak menemui ralat.', errs.length ? button('Ke isu', { size: 'sm', onClick: () => { S.filter = 'issues'; S.tab = 'edit'; go(5); } }) : null),
      checkItem(covOk, 'Liputan SK/SP', sig ? `${mSk.length} SK dan ${mSp.length} SP belum dirancang (${[...mSk, ...mSp].slice(0, 8).join(', ')}${mSk.length + mSp.length > 8 ? ' …' : ''}).` : 'Semua SK dan SP dalam DSKP telah dirancang.',
        sig ? h('label', { class: 'check rg-ack' }, ackCb, h('span', null, 'Saya mengakui SK/SP ini tidak dirancang tahun ini')) : null, sig && !covOk ? 'bad' : 'ok'),
      checkItem(rev === 0, 'Cadangan sistem disemak', rev ? `${rev} pelajaran masih bertanda "Dicadangkan sistem". Semak di langkah 5 atau tandakan semua selepas menyemaknya.` : 'Semua pelajaran telah disemak.',
        rev ? h('div', { class: 'row rg-tight' }, button('Semak di langkah 5', { size: 'sm', onClick: () => { S.filter = 'review'; S.tab = 'edit'; go(5); } }),
          button('Tandakan semua disemak', { size: 'sm', icon: 'check', onClick: async () => { if (await confirm({ title: 'Tandakan semua disemak?', confirmLabel: 'Ya, saya telah menyemak', message: `Anda mengesahkan telah menyemak ${rev} pelajaran yang dicadangkan sistem (SK/SP, topik, minggu).` })) { p.weeks.forEach(w => w.lessons.forEach(l => { l.review = false; })); S.dirty = true; RPH.ui.setDirty(true); draw(); } } })) : null),
      checkItem(!warns.length, 'Amaran', warns.length ? `${warns.length} amaran (tidak menghalang): ${warns.slice(0, 3).map(i => i.msg).join(' · ')}${warns.length > 3 ? ' …' : ''}` : 'Tiada amaran.', null, warns.length ? 'warn' : 'ok'),
      S.weekChanged ? checkItem(false, 'Status minggu', 'Status minggu diubah selepas RPT dijana (langkah 3). Jana semula atau agih semula baki supaya RPT mengikutnya.', null, 'warn') : null);

    const wrap = h('div', { class: 'stack' });
    ap(wrap, RPH.ui.card({ title: '1. Semak sebelum mengesahkan', subtitle: `${subjLabelText()} · Tahun ${S.year} · ${p.weeks.filter(w => w.status === 'pdp').length} minggu PdP`, body: list }));
    ap(wrap, RPH.ui.card({ title: '2. Sahkan RPT', body: h('div', { class: 'stack' },
      h('div', { class: 'row' }, h('span', { class: ['badge', confirmed ? 'badge-green' : 'badge-amber'] }, confirmed ? 'DISAHKAN' : 'DRAF'), confirmed && p.confirmedAt ? h('span', { class: 'muted small' }, `disahkan ${p.confirmedAt.slice(0, 16).replace('T', ' ')}`) : null),
      h('p', { class: 'muted small' }, 'Pengesahan bermaksud anda telah menyemak semua agihan. Draf dicetak dengan tanda DRAF sehingga disahkan. Sebarang suntingan selepas itu mengembalikan status kepada draf.'),
      h('div', { class: 'row' }, confirmed
        ? button('Batalkan pengesahan', { icon: 'x', onClick: () => { p.status = 'draf'; delete p.confirmedAt; draw(); } })
        : button('Sahkan RPT', { kind: 'primary', icon: 'check', disabled: !allOk, title: allOk ? '' : 'Selesaikan semakan di atas dahulu', onClick: () => { p.status = 'disahkan'; p.confirmedAt = U.nowIso(); S.dirty = true; RPH.ui.setDirty(true); draw(); toast('RPT disahkan. Anda boleh menyimpannya ke Pengurus RPT.', 'success'); } }))) }));
    const saved = S.savedKey && !S.dirty && confirmed;
    ap(wrap, RPH.ui.card({ title: '3. Simpan ke Pengurus RPT', body: h('div', { class: 'stack' },
      exists ? h('div', { class: 'notice' }, icon('alert'), h('span', null, `RPT ${key} untuk tahun akademik ${st().activeYear()} sudah wujud dan akan DIGANTI apabila anda menyimpan. RPH yang telah dijana tidak diubah.`)) : h('p', { class: 'muted small' }, `RPT baharu ${key} akan disimpan untuk tahun akademik ${st().activeYear()}. Penjana RPH akan menggunakannya untuk RPH yang dijana kemudian.`),
      archived ? h('div', { class: 'notice notice-error' }, icon('alert'), h('span', null, 'Tahun akademik diarkib (baca sahaja) — penyimpanan dinyahaktifkan.')) : null,
      h('div', { class: 'row' }, button('Simpan ke Pengurus RPT', { kind: 'gold', icon: 'layers', disabled: !confirmed || archived, title: confirmed ? '' : 'Sahkan RPT dahulu', onClick: doSave })),
      saved ? h('div', { class: 'rg-saved notice notice-info', role: 'status' }, icon('check'), h('div', null, h('strong', null, `RPT ${S.savedKey} telah disimpan.`),
        h('div', { class: 'small' }, 'Digunakan oleh Pengurus RPT dan penjana RPH (RPH yang sudah dijana tidak berubah).'),
        h('div', { class: 'row rg-gap-sm' }, button('Buka Pengurus RPT', { size: 'sm', icon: 'layers', onClick: () => RPH.router.go('rpt', null, { subject: p.subjectId, year: p.year }) }), button('Jana RPH', { size: 'sm', icon: 'wand', onClick: () => RPH.router.go('jana') })))) : null) }));
    ap(wrap, RPH.ui.card({ title: '4. Eksport', subtitle: 'DOCX, PDF atau cetak dalam setiap bahasa — tidak perlu menyimpan dahulu.', body: exportPanel(p, { json: true }) }));
    return wrap;
  }
  async function doSave() {
    const p = S.plan; if (!p || p.status !== 'disahkan') return;
    const key = `${p.subjectId}-${p.year}`; const ay = st().activeYear(); const exists = !!((st().get('rpt') || {})[key]);
    const ok = await confirm({ title: exists ? 'Ganti RPT sedia ada?' : 'Simpan RPT?', danger: exists, confirmLabel: exists ? 'Ganti dan simpan' : 'Simpan',
      message: `${exists ? `RPT ${key} untuk tahun akademik ${ay} sudah wujud dan akan DIGANTI.\n` : `Simpan RPT ${key} untuk tahun akademik ${ay} ke Pengurus RPT?\n`}RPH yang telah dijana tidak diubah; penjana RPH akan menggunakan RPT ini untuk RPH yang dijana kemudian.` });
    if (!ok) return;
    try {
      const r = await gen().save(p);
      S.savedKey = (typeof r === 'string' && r) || key; S.savedAt = U.nowIso(); S.dirty = false; RPH.ui.setDirty(false);
      toast(`RPT ${S.savedKey} disimpan ke Pengurus RPT.`, 'success'); draw();
    } catch (e) { toast(`RPT tidak disimpan: ${e.message || e}`, 'error', 8000); }
  }

  // ------------------------------------------------------------------ Daftar paparan
  RPH.events.on('year:changed', () => { S = blank(); idxCache = { key: null, v: null }; if (root && alive()) { RPH.ui.setDirty(false); draw(); } });

  RPH.views.rptjana = {
    title: 'Jana RPT', icon: 'layers',
    render(el, params) {
      root = el; alive = K().mount(el, 'rptjana');
      idxCache = { key: null, v: null };
      const ay = st().activeYear();
      if (S.ayId && S.ayId !== ay) S = blank();
      S.ayId = ay; S.src = null;
      const sid = params && (params.subjek || params.subject), yr = params && (params.tahun || params.year);
      // Masuk dengan subjek/tahun (cth. dari Pengurus RPT) → mula baharu, kecuali draf belum disimpan bagi gabungan yang sama.
      if (sid && yr && st().subject(sid)) {
        if (sid !== S.subjectId || +yr !== S.year || !(S.plan && S.dirty)) {
          resetFor(sid, +yr);
          if (hasRpt(sid, +yr)) S.step = 1; // tawarkan "Mula daripada RPT sedia ada" dahulu
        }
        try { history.replaceState(null, '', '#/rptjana'); } catch (e) { /* abaikan */ } // pulang dari Import tidak menetapkan semula pilihan
      }
      if (S.step > maxStep() && engineReady()) S.step = maxStep();
      RPH.ui.setDirty(!!(S.plan && S.dirty));
      draw();
    },
    exportStored,
    _state: () => S,
    _draw: () => draw(),
  };
})(window.RPH = window.RPH || {});
