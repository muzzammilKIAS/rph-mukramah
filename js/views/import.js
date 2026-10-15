/* Paparan Import Data (#/import): senarai semak data tahun aktif, zon lepas fail pukal, ruang kerja import
   (baca → pratonton → padanan → semak & sunting → simpan) dan kad kunci API Google Gemini (pilihan).
   Pemetaan fail → data: RPH.importers (tulen). Pembaca fail: RPH.readers. AI: RPH.ai (pilihan).
   Prinsip: tiada apa-apa disimpan secara senyap; setiap import disemak guru dahulu. */
(function (RPH) {
  'use strict';
  const { h, icon, button, toast, confirm, modal, clear, empty, select } = RPH.ui;
  const U = RPH.util;
  const I = () => RPH.importers;
  const st = () => RPH.store;
  const K = () => RPH.adminKit;

  // ------------------------------------------------------------------ Pemalar
  const ALIAS = { takwim: 'calendar', kalendar: 'calendar', kpm: 'calendar-kpm', 'kalendar-kpm': 'calendar-kpm', jadual: 'timetable', kelas: 'classes', murid: 'classes', dskp: 'curriculum', rpt: 'rpt',
    sejarah: 'history', rph: 'history', subjek: 'subjects', templat: 'templates', sekolah: 'school', profil: 'school', guru: 'teacher', tahun: 'year', backup: 'backup', pakej: 'backup' };
  const LABEL = { 'calendar-kpm': 'Kalendar akademik KPM', calendar: 'Takwim sekolah', timetable: 'Jadual waktu', classes: 'Kelas & bilangan murid', curriculum: 'DSKP', rpt: 'RPT', history: 'Contoh RPH lama', backup: 'Backup / pakej data' };
  const IMPORTABLE = ['calendar', 'calendar-kpm', 'timetable', 'classes', 'curriculum', 'rpt', 'history'];
  const TYPE_CHIPS = { '.pdf': 'PDF', '.docx': 'DOCX', '.pptx': 'PPTX', '.xlsx': 'Excel', '.xls': 'Excel', '.csv': 'CSV', '.json': 'JSON', '.txt': 'Teks', '.png': 'Gambar', '.jpg': 'Gambar', '.jpeg': 'Gambar' };
  const ACCEPT_ALL = '.pdf,.docx,.pptx,.xlsx,.xls,.csv,.json,.txt,.png,.jpg,.jpeg,.webp,.zip';
  const DOW = [1, 2, 3, 4, 5, 6];
  const PAGE = 80;

  const state = { session: null, queue: [], focus: null, onlyIssues: false };
  let root = null, alive = () => false;

  // ------------------------------------------------------------------ Pembantu
  const fmtSize = n => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
  const isAr = s => U.isArabicScript(s);
  const rtlCls = s => (isAr(s) ? 'imp-rtl' : null);
  const yearRec = () => { try { return st().academicYear(); } catch (e) { return null; } };
  const yearLabel = () => { const y = yearRec(); return y ? (y.label || `Sesi ${y.id}`) : `Sesi ${st().activeYear()}`; };
  const subjects = () => { try { return st().subjects() || []; } catch (e) { return []; } };
  const classesNow = () => { try { return st().classes() || []; } catch (e) { return []; } };
  const subjName = id => { const s = st().subject(id); return s ? (s.name && s.name.ms) || s.id : id; };
  function chips(accept) {
    const names = [...new Set(String(accept || '').split(',').map(x => TYPE_CHIPS[x.trim()]).filter(Boolean))];
    return h('span', { class: 'imp-chips' }, names.map(n => h('span', { class: 'imp-chip' }, n)));
  }
  function statusBadge(s) {
    const map = { ok: ['✔ ada', 'green'], todo: ['✘ belum', 'red'], warn: ['⚠ perlu semakan', 'amber'], optional: ['pilihan', 'slate'], na: ['tidak perlu', 'slate'] };
    const [t, c] = map[s] || map.todo;
    return h('span', { class: ['badge', `badge-${c}`, 'imp-status'] }, t);
  }
  function aiReady() { try { return !!(RPH.ai && typeof RPH.ai.configured === 'function' && RPH.ai.configured() && typeof RPH.ai.extract === 'function'); } catch (e) { return false; } }
  function pickFiles(accept, multiple = true) {
    return new Promise(res => {
      const inp = h('input', { type: 'file', accept: accept || ACCEPT_ALL, multiple, style: { display: 'none' } });
      inp.addEventListener('change', () => { const fs = [...(inp.files || [])]; inp.remove(); res(fs); });
      document.body.appendChild(inp); inp.click();
    });
  }
  function downloadTemplate(kind) {
    try {
      const arr = I().templateArray(kind);
      const t = I().TEMPLATES[kind];
      U.download(t.file, new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      toast(`Templat ${t.label} dimuat turun.`, 'success');
    } catch (e) { RPH.reportError('templat Excel', e); }
  }
  function draw() { if (alive()) { clear(root); state.session ? drawSession() : drawHome(); } }
  /** append tanpa null (Element.append menukar null kepada teks "null"). */
  const put = (el, ...xs) => { xs.flat().forEach(x => { if (x != null && x !== false) el.append(x); }); return el; };

  // ------------------------------------------------------------------ Status senarai semak
  function combos() {
    const out = new Map();
    const tt = st().get('timetable') || {};
    (tt.versions || []).forEach(v => (v.slots || []).forEach(s => {
      if (s.kind !== 'PdP' || s.rph === false || !s.subjectId || !s.year) return;
      const k = `${s.subjectId}-${s.year}`;
      if (!out.has(k)) out.set(k, { subjectId: s.subjectId, year: +s.year, classes: new Set() });
      if (s.className) out.get(k).classes.add(s.className);
    }));
    return [...out.values()].sort((a, b) => a.subjectId.localeCompare(b.subjectId) || a.year - b.year);
  }
  const noDskp = s => s && (s.noDskp === true || (s.noDskp !== false && (/tiada dskp/i.test(s.curriculumNote || '') || s.id === 'TASMIK')));
  /** Data yang disimpan walaupun masih ada ralat import → ⚠ perlu semakan (amaran yang disahkan guru tidak dikira). */
  function warnCount(obj) { return obj && obj.importMeta ? (+obj.importMeta.errors || 0) : 0; }
  function checklist() {
    const ob = RPH.onboarding && typeof RPH.onboarding.status === 'function' ? RPH.onboarding.status() : null;
    const step = id => (ob ? ob.steps.find(s => s.id === id) : null);
    const st0 = id => { const s = step(id); return s ? (s.done ? 'ok' : 'todo') : null; };
    const detail = id => { const s = step(id); return s ? s.detail : ''; };
    const school = st().get('school') || {}; const teacher = st().get('teacher') || {};
    const cal = st().get('calendar') || {}; const tt = st().get('timetable') || {}; const cls = st().get('classes') || {};
    const pdp = (tt.versions || []).flatMap(v => v.slots || []).filter(s => s.kind === 'PdP');
    const subs = subjects();
    const badSlots = pdp.filter(s => !s.subjectId || !st().subject(s.subjectId) || !s.classId);
    const items = [
      { id: 'school', label: 'Profil sekolah (+ logo)', status: st0('sekolah') || (school.name ? 'ok' : 'todo'), detail: detail('sekolah') || school.name || 'Nama sekolah belum diisi.', accept: '.png,.jpg,.jpeg', hint: 'Isi borang; logo PNG/JPG. Cadangan nama boleh diambil daripada kulit takwim/RPH.', links: [['Isi profil sekolah', 'tetapan', { tab: 'sekolah' }]] },
      { id: 'teacher', label: 'Profil guru', status: st0('guru') || (teacher.fullName || teacher.name ? 'ok' : 'todo'), detail: detail('guru') || teacher.fullName || 'Nama guru belum diisi.', hint: 'Isi borang (nama penuh, jawatan, jantina untuk bentuk ayat Arab).', links: [['Isi profil guru', 'tetapan', { tab: 'guru' }]] },
      { id: 'year', label: 'Tahun akademik', status: st0('tahun') || 'todo', detail: detail('tahun') || yearLabel(), hint: 'Tarikh mula & akhir sesi diisi automatik daripada takwim yang diimport.', links: [['Tetapkan tahun', 'tetapan', { tab: 'tahun' }]] },
      { id: 'calendar', kind: 'calendar', label: 'Takwim sekolah', status: (cal.weeks || []).length ? (warnCount(cal) ? 'warn' : 'ok') : 'todo', detail: detail('takwim') || ((cal.weeks || []).length ? `${cal.weeks.length} minggu` : 'Belum dimuatkan.'), accept: I().KINDS.calendar.accept, template: true, links: [['Takwim', 'takwim']] },
      { id: 'calendar-kpm', kind: 'calendar-kpm', label: 'Kalendar akademik KPM (pilihan)', status: cal.kpm ? 'ok' : 'optional', detail: cal.kpm ? `Kumpulan ${cal.kpm.group} · ${(cal.kpm.kpmWeeks || []).length} minggu KPM · ${(cal.kpm.breaks || []).length} cuti` : 'Pilihan — penggal, cuti dan minggu KPM rasmi. Digunakan untuk menyemak takwim sekolah dan menjana RPT; boleh membina takwim asas jika takwim sekolah belum ada.', accept: I().KINDS['calendar-kpm'].accept, links: [['Takwim', 'takwim']] },
      { id: 'timetable', kind: 'timetable', label: 'Jadual waktu', status: pdp.length ? (badSlots.length ? 'warn' : 'ok') : 'todo', detail: (detail('jadual') || (pdp.length ? `${pdp.length} slot PdP` : 'Tiada slot PdP.')) + (badSlots.length ? ` · ${badSlots.length} slot tanpa subjek/kelas sah` : ''), accept: I().KINDS.timetable.accept, template: true, links: [['Jadual Waktu', 'jadual']] },
      { id: 'classes', kind: 'classes', label: 'Kelas & bilangan murid', status: (cls.classes || []).length ? ((cls.classes || []).some(c => +c.enrolment > 0) || Object.keys(cls.studentCounts || {}).length ? 'ok' : 'warn') : 'todo', detail: detail('kelas') || `${(cls.classes || []).length} kelas`, accept: I().KINDS.classes.accept, template: true, links: [['Kelas', 'tetapan', { tab: 'kelas' }], ['Bilangan murid', 'tetapan', { tab: 'murid' }]] },
      { id: 'subjects', label: 'Subjek', status: subs.length ? (pdp.some(s => s.subjectId && !st().subject(s.subjectId)) ? 'warn' : 'ok') : 'todo', detail: detail('subjek') || `${subs.length} subjek`, hint: 'Subjek dicipta/dipadankan semasa import jadual waktu (label → subjek), atau diurus sendiri.', links: [['Urus subjek', 'subjek']] },
    ];
    // DSKP & RPT ikut subjek × tahun dalam jadual
    const cs = combos();
    const dskpRows = cs.filter(c => !noDskp(st().subject(c.subjectId))).map(c => {
      const cur = st().curriculum(c.subjectId, c.year);
      return { subjectId: c.subjectId, year: c.year, status: cur ? (warnCount(cur) ? 'warn' : 'ok') : 'todo', detail: cur ? `${countSk(cur).sk} SK · ${countSk(cur).sp} SP${cur.importMeta ? ` · diimport ${String(cur.importMeta.at || '').slice(0, 10)}` : ''}` : 'Belum dimuatkan', classes: [...c.classes] };
    });
    const rptRows = cs.map(c => {
      const r = st().rpt(c.subjectId, c.year);
      const n = r ? (r.weeks || r.rows || []).length : 0;
      return { subjectId: c.subjectId, year: c.year, status: r ? (warnCount(r) ? 'warn' : 'ok') : (noDskp(st().subject(c.subjectId)) ? 'na' : 'todo'), detail: r ? `${n} ${r.weeks ? 'minggu' : 'baris'}${r.importMeta ? ` · diimport ${String(r.importMeta.at || '').slice(0, 10)}` : ''}` : (noDskp(st().subject(c.subjectId)) ? 'Tiada RPT (dirancang guru)' : 'Belum dimuatkan'), classes: [...c.classes] };
    });
    const agg = list => (!list.length ? null : list.some(x => x.status === 'todo') ? 'todo' : list.some(x => x.status === 'warn') ? 'warn' : 'ok');
    const curAll = Object.keys(st().get('curriculum') || {});
    items.push({ id: 'curriculum', kind: 'curriculum', label: 'DSKP (ikut subjek × tahun)', status: agg(dskpRows) || (curAll.length ? 'ok' : 'todo'), detail: dskpRows.length ? `${dskpRows.filter(x => x.status !== 'todo').length}/${dskpRows.length} gabungan dalam jadual ada DSKP` : (curAll.length ? `${curAll.length} DSKP: ${curAll.join(', ')}` : 'Import jadual waktu dahulu untuk melihat subjek × tahun yang diperlukan.'), accept: I().KINDS.curriculum.accept, template: true, sub: dskpRows, links: [['DSKP', 'dskp']] });
    const rptAll = Object.keys(st().get('rpt') || {});
    items.push({ id: 'rpt', kind: 'rpt', label: 'RPT (ikut subjek × tahun)', status: agg(rptRows.filter(x => x.status !== 'na')) || (rptAll.length ? 'ok' : 'todo'), detail: rptRows.length ? `${rptRows.filter(x => x.status === 'ok' || x.status === 'warn').length}/${rptRows.filter(x => x.status !== 'na').length} gabungan ada RPT` : (rptAll.length ? `${rptAll.length} RPT: ${rptAll.join(', ')}` : 'Import jadual waktu dahulu.'), accept: I().KINDS.rpt.accept, template: true, sub: rptRows, links: [['RPT', 'rpt']] });
    const tpls = (() => { try { return st().templates(); } catch (e) { return []; } })();
    const noTpl = subs.filter(s => !s.defaultTemplateId || !st().template(s.defaultTemplateId));
    items.push({ id: 'templates', label: 'Templat RPH', status: tpls.length ? (noTpl.length ? 'warn' : 'ok') : 'todo', detail: tpls.length ? `${tpls.length} templat${noTpl.length ? ` · ${noTpl.length} subjek belum ada templat lalai` : ''}` : 'Tiada templat RPH.', accept: '.json', hint: 'Pilih templat terbina (Bahasa Arab, Pendidikan Islam, Tasmik, Umum KPM) atau import templat JSON.', links: [['Templat', 'templat']], json: 'template' });
    const hist = st().get('history');
    items.push({ id: 'history', kind: 'history', label: 'Contoh RPH lama (pilihan)', status: hist && (hist.entries || []).length ? 'ok' : 'optional', detail: hist && (hist.entries || []).length ? `${hist.entries.length} RPH rujukan` : 'Pilihan — membantu Kemajuan DSKP dan rujukan gaya.', accept: I().KINDS.history.accept, links: [['Rekod (sejarah)', 'rekod', { tab: 'sejarah' }]] });
    items.push({ id: 'backup', label: 'Backup / pakej data (pilihan)', status: 'optional', detail: 'Pakej Guru (satu fail — semua data), backup penuh, pakej data peribadi atau arkib satu tahun.', accept: '.json', links: [['Tetapan → Data', 'tetapan', { tab: 'data' }]], json: 'backup' });
    return items;
  }
  function countSk(c) { let sk = 0, sp = 0; (c.domains || []).forEach(d => (d.contentStandards || []).forEach(s => { sk++; sp += (s.learningStandards || []).length; })); return { sk, sp }; }

  // ------------------------------------------------------------------ Laman utama
  function drawHome() {
    const items = checklist();
    const done = items.filter(i => i.status === 'ok').length;
    const need = items.filter(i => i.status !== 'optional' && i.status !== 'na').length;
    put(root, 
      RPH.ui.pageHeader('Import Data', `${yearLabel()} — bina data aplikasi daripada fail yang anda sudah ada (PDF, DOCX, PPTX, Excel, gambar).`, [
        button('Pilih fail', { kind: 'primary', icon: 'upload', onClick: async () => addFiles(await pickFiles(ACCEPT_ALL)) }),
      ]),
      h('div', { class: 'notice notice-info imp-intro' }, icon('info'), h('div', null,
        h('strong', null, 'Cara: '), 'pilih fail → sistem membaca dan memetakan kandungan → anda semak & sunting dalam jadual → tekan Simpan. ',
        'Tiada apa-apa disimpan tanpa pengesahan anda. Item yang tidak pasti ditanda ', h('span', { class: 'badge badge-amber' }, '⚠ perlu semakan'), '.')),
      dropZone(),
      state.queue.length ? queueCard() : null,
      h('section', { class: 'card imp-check', id: 'imp-checklist' },
        h('div', { class: 'card-head' }, h('div', null, h('h2', null, `Senarai semak data ${yearLabel()}`), h('p', { class: 'muted small' }, `${done} daripada ${need} item sedia. Lengkapkan item bertanda ✘ untuk menjana RPH.`)),
          h('div', { class: 'card-actions' }, button('Templat Excel (semua)', { size: 'sm', icon: 'download', onClick: () => ['calendar', 'timetable', 'classes', 'curriculum', 'rpt'].forEach((k, i) => setTimeout(() => downloadTemplate(k), i * 350)) }))),
        h('div', { class: 'card-body imp-check-list' }, items.map(checkItem))),
      aiCard());
    if (state.focus) {
      const id = state.focus; state.focus = null;
      const t = root.querySelector(`#imp-item-${id}`);
      if (t) { t.classList.add('imp-flash'); setTimeout(() => t.scrollIntoView({ block: 'center' }), 30); }
    }
  }

  function checkItem(it) {
    const actions = [];
    if (it.kind) actions.push(button('Pilih fail', { size: 'sm', kind: it.status === 'todo' ? 'primary' : null, icon: 'upload', onClick: async () => { const fs = await pickFiles(it.accept, it.kind === 'curriculum' || it.kind === 'rpt'); if (fs.length) addFiles(fs, { kind: it.kind }); } }));
    if (it.json === 'template') actions.push(button('Import JSON', { size: 'sm', icon: 'upload', onClick: importTemplateJson }));
    if (it.json === 'backup') actions.push(button('Pilih fail JSON', { size: 'sm', icon: 'upload', onClick: async () => { const fs = await pickFiles('.json', false); if (fs[0]) restoreJson(fs[0]); } }));
    if (it.template) actions.push(button('Templat Excel', { size: 'sm', icon: 'download', onClick: () => downloadTemplate(it.kind) }));
    (it.links || []).forEach(([l, v, p]) => actions.push(h('a', { class: 'btn btn-sm btn-ghost imp-link', href: `#/${v}${p ? '?' + new URLSearchParams(p).toString() : ''}` }, icon('edit', 14), l)));
    const sub = (it.sub || []).length ? h('div', { class: 'imp-sub' }, it.sub.map(r => h('div', { class: 'imp-sub-row' },
      statusBadge(r.status),
      h('span', { class: 'imp-sub-name' }, `${subjName(r.subjectId)} Tahun ${r.year}`),
      h('span', { class: 'muted small imp-sub-detail' }, [r.detail, r.classes && r.classes.length ? `kelas: ${r.classes.join(', ')}` : null].filter(Boolean).join(' · ')),
      r.status === 'na' ? null : h('span', { class: 'imp-sub-act' },
        button(r.status === 'todo' ? 'Pilih fail' : 'Ganti', { size: 'sm', icon: 'upload', onClick: async () => { const fs = await pickFiles(it.accept, false); if (fs[0]) addFiles(fs, { kind: it.kind, subjectId: r.subjectId, subjectYear: r.year }); } }))))) : null;
    return h('div', { class: ['imp-item', `imp-item-${it.status}`], id: `imp-item-${it.id}` },
      h('div', { class: 'imp-item-main' },
        h('div', { class: 'imp-item-title' }, statusBadge(it.status), h('strong', null, it.label)),
        h('div', { class: 'muted small imp-item-detail' }, it.detail),
        it.hint ? h('div', { class: 'small imp-item-hint' }, it.hint) : null,
        it.accept ? h('div', { class: 'small imp-item-accept' }, h('span', { class: 'muted' }, 'Fail diterima: '), chips(it.accept)) : null),
      h('div', { class: 'imp-item-actions' }, actions),
      sub);
  }

  // ------------------------------------------------------------------ Zon lepas fail & baris gilir
  function dropZone() {
    const zone = h('div', { class: 'imp-drop', tabindex: '0', role: 'button', 'aria-label': 'Pilih atau lepaskan fail untuk diimport' },
      icon('upload', 28),
      h('div', { class: 'imp-drop-title' }, 'Lepaskan fail di sini atau klik untuk memilih (boleh banyak fail)'),
      h('div', { class: 'muted small' }, 'Takwim, jadual waktu, senarai kelas, DSKP, RPT, contoh RPH lama, templat Excel, backup JSON — atau satu fail ZIP yang mengandungi semuanya. Jenis fail dikenal pasti secara automatik — anda boleh menukarnya.'),
      chips(ACCEPT_ALL));
    const pick = async () => addFiles(await pickFiles(ACCEPT_ALL));
    zone.addEventListener('click', pick);
    zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('imp-drop-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('imp-drop-over'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('imp-drop-over'); addFiles([...(e.dataTransfer.files || [])]); });
    return h('section', { class: 'card imp-drop-card' }, h('div', { class: 'card-body' }, zone));
  }
  /** Fail .zip → kandungannya (termasuk zip dalam zip, 2 aras). Folder & fail sistem dilangkau; format lama .doc/.ppt kekal supaya guru nampak cara membetulkannya. */
  async function expandZips(files) {
    if (!files.some(f => /\.zip$/i.test(f.name))) return files;
    if (typeof window.JSZip !== 'function') { toast('Pembaca ZIP (JSZip) tidak dimuatkan — ekstrak zip dahulu.', 'error', 6000); return files.filter(f => !/\.zip$/i.test(f.name)); }
    const ok = new Set([...((RPH.readers && RPH.readers.supported) || []), '.doc', '.ppt']);
    const MAX = 300 * 1048576;
    const out = []; const skipped = {}; let total = 0;
    const walk = async (blob, label, depth) => {
      let zip;
      try { zip = await window.JSZip.loadAsync(blob); } catch (e) { toast(`"${label}" bukan fail ZIP yang sah atau rosak.`, 'error', 7000); return; }
      for (const entry of Object.values(zip.files)) {
        const path = entry.name.replace(/\\/g, '/');
        const base = path.split('/').pop();
        if (entry.dir || !base || /^__MACOSX\//.test(path) || /^\._|^\.DS_Store$|^Thumbs\.db$|^~\$/i.test(base)) continue;
        const ext = (base.match(/\.[^.]+$/) || [''])[0].toLowerCase();
        if (ext === '.zip' && depth < 2) { await walk(await entry.async('blob'), `${label} › ${path}`, depth + 1); continue; }
        if (!ok.has(ext)) { skipped[ext || '(tiada)'] = (skipped[ext || '(tiada)'] || 0) + 1; continue; }
        const data = await entry.async('blob');
        total += data.size;
        if (total > MAX) { toast(`Kandungan ZIP melebihi 300 MB — baki fail tidak dibuka. Pecahkan zip kepada beberapa bahagian.`, 'error', 8000); return; }
        out.push(new File([data], `${label} › ${path.split('/').join(' › ')}`, { lastModified: entry.date ? entry.date.getTime() : Date.now() }));
      }
    };
    const plain = [];
    for (const f of files) { if (/\.zip$/i.test(f.name)) await walk(f, f.name.replace(/\.zip$/i, ''), 0); else plain.push(f); }
    const sk = Object.entries(skipped).map(([e, n]) => `${e} ×${n}`).join(', ');
    toast(`ZIP dibuka: ${out.length} fail${sk ? `; dilangkau (bukan data RPH): ${sk}` : ''}.`, out.length ? 'success' : 'error', 7000);
    return [...plain, ...out];
  }
  async function addFiles(files, hint = {}) {
    if (!files || !files.length) return;
    if (!RPH.readers || typeof RPH.readers.read !== 'function') { toast('Pembaca fail (js/import/readers.js) tidak dimuatkan.', 'error', 6000); return; }
    files = await expandZips([...files]);
    if (!files.length) return;
    const added = files.map(f => ({ id: U.uid('q'), file: f, status: 'membaca', progress: null, doc: null, cls: null, kind: hint.kind || null, subjectId: hint.subjectId || null, subjectYear: hint.subjectYear || null, error: null }));
    state.queue.push(...added);
    if (added.length === 1 && hint.kind) { await readItem(added[0]); openItem(added[0]); return; }
    draw();
    for (const q of added) { await readItem(q); if (alive() && !state.session) draw(); }
    if (added.length === 1 && alive() && !state.session && added[0].status === 'sedia' && added[0].kind && IMPORTABLE.includes(added[0].kind)) openItem(added[0]);
    // Pakej Guru dibuka terus walaupun dipilih bersama fail lain (satu fail = semua data).
    for (const q of added) if (q.status === 'sedia' && q.doc && q.doc.json && q.doc.json.type === 'rph-pakej-guru') { await openTeacherPack(q.doc.json, q); break; }
  }
  async function readItem(q) {
    try {
      q.status = 'membaca';
      q.doc = await RPH.readers.read(q.file, { onProgress: p => { q.progress = p; const el = root && root.querySelector(`#q-${q.id} .imp-q-status`); if (el) el.textContent = `Membaca… ${p.done}/${p.total}`; } });
      q.cls = I().classify(q.doc, { subjects: subjects() });
      if (!q.kind) q.kind = q.cls.kind;
      if (!q.subjectId) q.subjectId = q.cls.subjectId && st().subject(q.cls.subjectId) ? q.cls.subjectId : (q.cls.subjectId ? I().matchSubject(q.cls.subjectId, subjects()) : null);
      if (!q.subjectYear) q.subjectYear = q.cls.year;
      q.status = 'sedia';
    } catch (e) { q.status = 'ralat'; q.error = e.message || String(e); }
  }
  function queueCard() {
    const kindOpts = [...IMPORTABLE, 'backup', 'template'].map(k => ({ value: k, label: k === 'template' ? 'Templat RPH (JSON)' : LABEL[k] }));
    return RPH.ui.card({ title: 'Fail dipilih', subtitle: 'Semak jenis fail, kemudian tekan Buka untuk menyemak dan menyimpan.', cls: 'imp-queue',
      actions: [button('Kosongkan', { size: 'sm', onClick: () => { state.queue = []; draw(); } })],
      body: h('div', { class: 'imp-q-list' }, state.queue.map(q => h('div', { class: 'imp-q', id: `q-${q.id}` },
        h('div', { class: 'imp-q-file' }, icon('file'), h('div', null, h('div', { class: 'strong imp-q-name', dir: 'auto' }, q.file.name), h('div', { class: 'muted small' }, `${fmtSize(q.file.size)}${q.doc ? ` · ${q.doc.kind.toUpperCase()}` : ''}${q.cls && q.cls.reasons.length ? ` · dikenal pasti: ${q.cls.reasons.join(', ')}` : ''}`))),
        h('div', { class: 'imp-q-ctrl' },
          select({ options: kindOpts, value: q.kind || '', placeholder: '— Jenis data —', cls: 'input-sm', onChange: v => { q.kind = v || null; draw(); } }),
          q.kind === 'curriculum' || q.kind === 'rpt' ? [subjectSelect(q.subjectId, v => { q.subjectId = v; }), yearSelect(q.subjectYear, v => { q.subjectYear = v; })] : null),
        h('div', { class: 'imp-q-act' },
          h('span', { class: ['imp-q-status', 'small', q.status === 'ralat' ? 'adm-txt-red' : 'muted'] }, q.status === 'membaca' ? 'Membaca…' : q.status === 'ralat' ? `Ralat: ${q.error}` : 'Sedia'),
          q.status === 'sedia' ? button('Buka', { size: 'sm', kind: 'primary', icon: 'right', disabled: !q.kind, onClick: () => openItem(q) }) : null,
          K().iconBtn('trash', 'Buang daripada senarai', () => { state.queue = state.queue.filter(x => x !== q); draw(); })))))
    });
  }
  function subjectSelect(value, onChange) {
    return select({ options: subjects().map(s => ({ value: s.id, label: `${(s.name && s.name.ms) || s.id} (${s.code || s.id})` })), value: value || '', placeholder: '— Subjek —', cls: 'input-sm', onChange });
  }
  function yearSelect(value, onChange) {
    return select({ options: [1, 2, 3, 4, 5, 6].map(y => ({ value: y, label: `Tahun ${y}` })), value: value || '', placeholder: '— Tahun —', cls: 'input-sm', onChange: v => onChange(v ? +v : null) });
  }
  function openItem(q) {
    if (q.kind === 'backup') return restoreJson(q.file, q.doc);
    if (q.kind === 'template') return importTemplateDoc(q.doc);
    if (!IMPORTABLE.includes(q.kind)) { toast('Pilih jenis data dahulu.', 'error'); return; }
    startSession({ file: q.file, doc: q.doc, kind: q.kind, subjectId: q.subjectId, subjectYear: q.subjectYear, queueId: q.id });
  }

  // ------------------------------------------------------------------ Sesi import (ruang kerja)
  function ctxFor(s) {
    const cal = st().get('calendar') || {};
    const tt = st().get('timetable') || {};
    const subj = s.subjectId ? st().subject(s.subjectId) : null;
    const cur = s.subjectId && s.subjectYear ? st().curriculum(s.subjectId, s.subjectYear) : null;
    const codes = cur ? (cur.domains || []).flatMap(d => (d.contentStandards || []).flatMap(k => [k.code, ...(k.learningStandards || []).map(p => p.code)])) : null;
    const yid = st().activeYear();
    let bidang = [];
    try { bidang = RPH.banks ? RPH.banks.items('pi-bidang') : []; } catch (e) { bidang = []; }
    return {
      yearId: yid, year: +String(yid).slice(0, 4) || null, subjects: subjects(), classes: classesNow(),
      subjectId: s.subjectId || null, subjectYear: s.subjectYear || null, subjectName: subj ? (subj.name && subj.name.ms) || subj.id : null,
      script: subj ? (subj.script === 'jawi' ? 'jawi' : subj.script === 'arabic' ? 'arabic' : (subj.script || null)) : null,
      periodGrid: tt.periodGrid || [], bidang, themes: cur ? cur.themes || [] : [], curriculumCodes: codes, calendarWeeks: cal.weeks || [],
      fileName: s.file ? s.file.name : null, now: U.nowIso(), today: U.todayLocal(), shape: s.shape || null, deriveCandidates: !!s.derive,
      schoolName: (st().get('school') || {}).shortName || null,
      group: s.kpmGroup || (st().get('school') || {}).calendarGroup || null, school: st().get('school') || {},
    };
  }
  async function startSession(opts) {
    const s = { id: U.uid('imp'), kind: opts.kind, file: opts.file || null, doc: opts.doc || null, subjectId: opts.subjectId || null, subjectYear: opts.subjectYear || null,
      status: 'membaca', error: null, result: null, tab: 'semak', shape: null, derive: false, dirty: false, queueId: opts.queueId || null, grid: null, page: {} };
    state.session = s;
    draw();
    if (!s.doc && s.file) {
      try { s.doc = await RPH.readers.read(s.file); } catch (e) { s.status = 'ralat'; s.error = e.message || String(e); draw(); return; }
    }
    runImport(s);
    draw();
    window.scrollTo(0, 0);
  }
  function runImport(s) {
    s.status = 'sedia';
    if ((s.kind === 'curriculum' || s.kind === 'rpt') && s.doc) {
      const c = I().classify(s.doc, { subjects: subjects() });
      if (!s.subjectId && c.subjectId) s.subjectId = st().subject(c.subjectId) ? c.subjectId : I().matchSubject(c.subjectId, subjects());
      if (!s.subjectYear && c.year) s.subjectYear = c.year;
    }
    if (s.kind === 'rpt' && !s.shape) { const ex = s.subjectId ? Object.values(st().get('rpt') || {}).find(r => r.subjectId === s.subjectId) : null; s.shape = ex ? (Array.isArray(ex.weeks) ? 'weeks' : 'rows') : (s.subjectId === 'BA' ? 'rows' : 'weeks'); }
    try {
      s.result = I().run(s.kind, s.doc, ctxFor(s));
      s.tab = s.result.needsManual ? 'grid' : (s.kind === 'rpt' || s.kind === 'timetable' ? 'padanan' : 'semak');
      if (s.kind === 'timetable' && s.result.needsManual) s.grid = manualGridInit();
    } catch (e) { s.status = 'ralat'; s.error = e.message || String(e); console.error(e); }
  }
  function rebuild(s) {
    try {
      const b = I().build(s.kind, s.result.model, ctxFor(s));
      s.result.data = b.data; s.result.issues = b.issues; s.result.stats = b.stats; s.result.extra = b.extra || null;
    } catch (e) { RPH.reportError('bina semula import', e); }
  }
  async function leaveSession() {
    if (state.session && state.session.dirty && !(await confirm({ title: 'Tinggalkan import?', message: 'Suntingan dalam semakan ini belum disimpan dan akan hilang.', confirmLabel: 'Tinggalkan', danger: true }))) return;
    state.session = null; RPH.ui.setDirty(false); draw();
  }

  function drawSession() {
    const s = state.session;
    const title = `Import: ${LABEL[s.kind] || s.kind}`;
    put(root, h('div', { class: 'imp-ws-head' },
      button('Kembali ke senarai', { size: 'sm', icon: 'left', onClick: leaveSession }),
      h('div', { class: 'imp-ws-title' }, h('h1', null, title), s.file ? h('div', { class: 'muted small', dir: 'auto' }, `${s.file.name} · ${fmtSize(s.file.size)}`) : null),
      stepper(s)));
    if (s.status === 'membaca' || (!s.result && s.status !== 'ralat')) { put(root, h('div', { class: 'card imp-reading' }, h('div', { class: 'card-body' }, h('div', { class: 'imp-spinner', 'aria-hidden': 'true' }), h('p', null, 'Membaca fail… (PDF besar mungkin mengambil masa beberapa saat)')))); return; }
    if (s.status === 'ralat') { put(root, RPH.ui.card({ body: h('div', { class: 'stack' }, h('div', { class: 'notice notice-error' }, icon('alert'), h('div', null, h('strong', null, 'Fail tidak dapat diimport. '), s.error)), h('div', { class: 'row' }, button('Kembali', { onClick: leaveSession }), aiReady() && I().KINDS[s.kind] && I().KINDS[s.kind].ai ? button('Ekstrak dengan AI', { icon: 'wand', onClick: () => runAi(s) }) : null)) })); return; }
    put(root, targetCard(s), docSummary(s));
    const tabItems = [{ id: 'pratonton', label: 'Pratonton fail' }];
    if (s.kind === 'timetable') tabItems.push({ id: 'grid', label: 'Isi grid (manual)' });
    if (s.kind === 'rpt' || s.kind === 'timetable') tabItems.push({ id: 'padanan', label: s.kind === 'rpt' ? 'Padanan lajur' : 'Padanan label & kelas' });
    tabItems.push({ id: 'semak', label: `Semak & sunting${s.result && s.result.issues.length ? ` (${s.result.issues.length})` : ''}` });
    put(root, RPH.ui.tabs(tabItems, s.tab, id => { s.tab = id; draw(); }));
    const body = h('div', { class: 'imp-tab-body' });
    put(root, body);
    if (s.tab === 'pratonton') put(body, previewPane(s));
    else if (s.tab === 'grid') put(body, manualGridPane(s));
    else if (s.tab === 'padanan') put(body, s.kind === 'rpt' ? rptMappingPane(s) : ttMappingPane(s));
    else put(body, reviewPane(s));
    put(root, saveBar(s));
  }
  function stepper(s) {
    const steps = ['Baca', 'Pratonton', 'Padanan', 'Semak', 'Simpan'];
    const at = s.status === 'membaca' ? 0 : s.tab === 'pratonton' ? 1 : (s.tab === 'padanan' || s.tab === 'grid') ? 2 : 3;
    return h('ol', { class: 'imp-steps', 'aria-label': 'Langkah import' }, steps.map((t, i) => h('li', { class: [i < at ? 'done' : '', i === at ? 'now' : ''] }, h('span', null, String(i + 1)), t)));
  }

  // ---- Sasaran (subjek/tahun, versi jadual, format RPT)
  function targetCard(s) {
    const r = s.result || {};
    const parts = [];
    const ay = yearLabel();
    if (I().KINDS[s.kind] && I().KINDS[s.kind].perYear) parts.push(h('div', { class: 'imp-target-note small' }, icon('calendar', 14), ` Disimpan ke ${ay} (tahun akademik aktif). Tukar tahun di bar atas jika perlu.`));
    if (s.kind === 'curriculum' || s.kind === 'rpt') {
      const subs = subjects();
      parts.push(h('div', { class: 'imp-target-row' },
        RPH.ui.field('Subjek', subs.length ? subjectSelect(s.subjectId, v => { s.subjectId = v || null; runImport(s); draw(); }) : h('div', { class: 'small adm-txt-amber' }, 'Tiada subjek. Import jadual waktu dahulu atau tambah subjek di halaman Subjek.')),
        RPH.ui.field('Tahun (darjah)', yearSelect(s.subjectYear, v => { s.subjectYear = v; runImport(s); draw(); })),
        s.kind === 'rpt' ? RPH.ui.field('Format simpanan', select({ options: [{ value: 'weeks', label: 'Minggu & pelajaran (cth. PI)' }, { value: 'rows', label: 'Baris minggu (cth. BA)' }], value: s.shape, cls: 'input-sm', onChange: v => { s.shape = v; if (r.model) r.model.meta.shape = v; rebuild(s); draw(); } })) : null,
        s.kind === 'curriculum' && s.subjectId && s.subjectYear ? h('div', { class: 'small muted imp-target-key' }, `Kunci simpanan: ${st().curriculumId(s.subjectId, s.subjectYear)}${st().curriculum(s.subjectId, s.subjectYear) ? ' (sudah wujud — akan diganti selepas pengesahan)' : ''}`) : null));
      if (s.kind === 'rpt' && s.subjectId === 'BA' && s.shape === 'rows') parts.push(h('label', { class: 'check imp-derive' }, (() => { const cb = h('input', { type: 'checkbox', checked: s.derive }); cb.addEventListener('change', () => { s.derive = cb.checked; if (r.model) rebuild(s); draw(); }); return cb; })(),
        h('span', null, 'Cadangkan SK calon ikut jenis kandungan (huruf → x.1, suku kata → x.2, kosa kata → x.3, tarkib → x.4, nombor → x.5). Ditanda "diterbitkan sistem" — bukan kod daripada RPT.')));
    }
    if (s.kind === 'timetable' && r.model) {
      const v = r.model.version;
      const inp = (k, ph, type = 'text') => RPH.ui.input({ value: v[k] || '', placeholder: ph, type, cls: 'input-sm', onChange: x => { v[k] = x; s.dirty = true; rebuild(s); refreshIssues(s); } });
      parts.push(h('div', { class: 'imp-target-row' },
        RPH.ui.field('Nombor versi', inp('id', 'cth. 4.1')), RPH.ui.field('Label', inp('label', 'cth. Jadual Waktu Bil 4.1')),
        RPH.ui.field('Berkuat kuasa mulai', inp('effectiveFrom', '', 'date')), RPH.ui.field('Tamat (pilihan)', inp('effectiveTo', '', 'date'))));
      if (v.note) parts.push(h('div', { class: 'small muted' }, v.note));
    }
    if (!parts.length) return h('span');
    return h('section', { class: 'card imp-target' }, h('div', { class: 'card-body stack' }, parts));
  }
  function docSummary(s) {
    const d = s.doc || {}; const r = s.result || {};
    const facts = [d.kind ? d.kind.toUpperCase() : null, d.pages && d.pages.length ? `${d.pages.length} halaman` : null, d.tables && d.tables.length ? `${d.tables.length} jadual` : null, d.sheets && d.sheets.length ? `${d.sheets.length} helaian` : null, d.images && d.images.length ? `${d.images.length} imej` : null, r.method ? `kaedah: ${r.method}` : null].filter(Boolean);
    const warns = (d.warnings || []).slice(0, 4);
    const stats = r.stats ? Object.entries(r.stats).filter(([, v]) => typeof v === 'number' || typeof v === 'string').map(([k, v]) => `${STAT_LABEL[k] || k}: ${v}`) : [];
    return h('section', { class: 'card imp-summary' }, h('div', { class: 'card-body' },
      h('div', { class: 'imp-summary-row' }, h('div', { class: 'small' }, facts.join(' · ')),
        h('div', { class: 'imp-summary-stats' }, stats.map(x => h('span', { class: 'badge badge-slate' }, x))),
        aiReady() && I().KINDS[s.kind] && I().KINDS[s.kind].ai ? button('Ekstrak dengan AI', { size: 'sm', icon: 'wand', onClick: () => runAi(s) }) : null,
        RPH.readers && RPH.readers.ocrAvailable && RPH.readers.ocrAvailable() && (d.scanned || d.kind === 'image') ? button('Baca dengan OCR', { size: 'sm', icon: 'eye', onClick: () => runOcr(s) }) : null),
      d.legacyJawi ? h('div', { class: 'notice imp-gap' }, icon('info'), h('span', null, 'Teks Jawi fon lama dikesan — ditukar ke Jawi Unicode (ڤ ݢ ڠ چ ڽ ۏ) melalui leksikon. Perkataan yang tidak dikenali ditanda untuk semakan.')) : null,
      d.scanned && !aiReady() && s.kind !== 'timetable' ? h('div', { class: 'notice imp-gap' }, icon('alert'), h('span', null, 'Fail ini imej/imbasan. Tetapkan Kunci API AI (di halaman Import Data) untuk "Ekstrak dengan AI", atau isi templat Excel.')) : null,
      warns.length ? h('ul', { class: 'imp-warn-list small' }, warns.map(w => h('li', null, w))) : null));
  }
  const STAT_LABEL = { weeks: 'minggu', schoolDays: 'hari PdP', holidayDays: 'hari cuti', events: 'acara', entries: 'cuti/acara', slots: 'slot', pdp: 'PdP', newClasses: 'kelas baharu', newSubjects: 'subjek baharu', classes: 'kelas', withEnrolment: 'ada bil. murid', studentCounts: 'subjek-tahun', domains: 'bidang', sk: 'SK', sp: 'SP', rowsWithErrors: 'baris ralat', records: 'baris', firstWeek: 'minggu pertama', lastWeek: 'minggu akhir', withCodes: 'berkod', shape: 'format' };

  // ---- Pratonton
  function previewPane(s) {
    const d = s.doc || {};
    const out = h('div', { class: 'stack' });
    if (d.images && d.images.length && d.kind === 'image') put(out, h('div', { class: 'imp-img-wrap' }, h('img', { class: 'imp-img', src: d.images[0].dataUrl, alt: 'Imej fail' })));
    const tables = I().util.tablesOf(d);
    if (tables.length) {
      put(out, h('div', { class: 'adm-mini-head' }, `Jadual dikesan (${tables.length})`));
      tables.slice(0, 12).forEach(t => put(out, h('details', { class: 'imp-prev-table' }, h('summary', null, `${t.ref} · ${t.rows.length} baris × ${(t.rows[0] || []).length} lajur`),
        h('div', { class: 'table-wrap' }, h('table', { class: 'table adm-table-compact imp-mini' }, h('tbody', null, t.rows.slice(0, 15).map(r => h('tr', null, uniqAdj(r).map(c => h('td', { dir: 'auto', class: rtlCls(c) }, String(c).slice(0, 160)))))))))));
      if (tables.length > 12) put(out, h('p', { class: 'muted small' }, `… dan ${tables.length - 12} jadual lagi.`));
    }
    if (d.kind === 'pdf' && (d.pages || []).length) {
      put(out, h('div', { class: 'adm-mini-head' }, 'Halaman PDF'));
      const list = h('div', { class: 'imp-pages' });
      d.pages.slice(0, 60).forEach(p => {
        const box = h('div', { class: 'imp-page' }, h('div', { class: 'imp-page-head' }, h('strong', null, `Halaman ${p.n}`), p.hasText ? null : h('span', { class: 'badge badge-amber' }, 'tiada lapisan teks'),
          RPH.readers && RPH.readers.renderPdfPage ? button('Lihat imej', { size: 'sm', icon: 'eye', onClick: async ev => { const b = ev.currentTarget; b.disabled = true; try { const url = await RPH.readers.renderPdfPage(d, p.n, 1.4); put(box, h('img', { class: 'imp-img', src: url, alt: `Halaman ${p.n}` })); } catch (e) { toast(e.message, 'error'); } } }) : null),
          h('div', { class: 'imp-page-text small', dir: p.dir === 'rtl' ? 'rtl' : 'auto' }, (p.lines || []).slice(0, 14).map(l => h('div', { dir: 'auto', class: rtlCls(l.text) }, l.text))));
        put(list, box);
      });
      put(out, list);
    } else if ((d.paragraphs || []).length && !tables.length) {
      put(out, h('div', { class: 'adm-mini-head' }, 'Teks'), h('div', { class: 'imp-page-text small' }, d.paragraphs.slice(0, 80).map(p => h('div', { dir: 'auto', class: rtlCls(p.text) }, p.text))));
    }
    if (!out.childNodes.length) put(out, empty('Tiada kandungan untuk dipratonton.'));
    return out;
  }
  const uniqAdj = r => r.filter((c, i) => i === 0 || c !== r[i - 1]);

  // ---- Grid manual (imej jadual waktu)
  function manualGridInit() {
    const pg = (st().get('timetable') || {}).periodGrid || [];
    const cols = pg.length ? pg.map(p => ({ head: p.break ? `REHAT ${p.start} - ${p.end}` : `${p.no != null ? p.no + ' ' : ''}${p.start} - ${p.end}` }))
      : ['07:30 - 08:00', '08:00 - 08:30', '08:30 - 09:00', '09:00 - 09:30', '09:30 - 10:00', '10:00 - 10:30', '10:30 - 11:00', '11:00 - 11:30', '11:30 - 12:00', '12:00 - 12:30', '12:30 - 13:00'].map(x => ({ head: x }));
    return { cols, days: [1, 2, 3, 4, 5], cells: {} };
  }
  function manualGridPane(s) {
    if (!s.grid) s.grid = manualGridInit();
    const g = s.grid;
    const img = s.doc && s.doc.images && s.doc.images[0];
    const table = h('table', { class: 'table imp-mgrid' });
    const head = h('tr', null, h('th', null, 'Hari'), g.cols.map((c, i) => h('th', null, (() => { const x = RPH.ui.input({ value: c.head, cls: 'imp-mg-head', 'aria-label': `Masa lajur ${i + 1}` }); x.addEventListener('change', () => { c.head = x.value; }); return x; })())));
    const body = h('tbody', null, g.days.map(d => h('tr', null, h('th', null, U.dayNameMs(d)), g.cols.map((c, i) => {
      const k = `${d}:${i}`; const x = RPH.ui.input({ value: g.cells[k] || '', cls: 'imp-mg-cell', placeholder: '', 'aria-label': `${U.dayNameMs(d)} lajur ${i + 1}` });
      x.addEventListener('change', () => { g.cells[k] = x.value; s.dirty = true; });
      return h('td', null, x);
    }))));
    table.append(h('thead', null, head), body);
    return h('div', { class: 'stack' },
      h('div', { class: 'notice notice-info' }, icon('info'), h('div', null,
        h('div', null, 'Taip isi setiap petak seperti dalam gambar, cth. ', h('code', null, 'BA 3 UKM'), ', ', h('code', null, 'PAI 2 UKM'), ', ', h('code', null, 'PH'), '. Petak bersebelahan yang sama digabung menjadi satu slot (cth. 2 waktu = 60 minit).'),
        h('div', { class: 'small' }, 'Baris tajuk: masa setiap waktu (cth. 1:10 - 1:40; jam 1–6 dibaca sebagai petang). Lajur REHAT: tulis "REHAT" dalam tajuk. Petak hitam/tidak tersedia: tulis "-".'))),
      h('div', { class: 'imp-mg-wrap' },
        img ? h('div', { class: 'imp-mg-img' }, h('img', { class: 'imp-img', src: img.dataUrl, alt: 'Gambar jadual waktu', title: 'Klik untuk besarkan / kecilkan', onClick: e => e.currentTarget.classList.toggle('imp-zoom') })) : null,
        h('div', { class: 'table-wrap imp-mg-table' }, table)),
      h('div', { class: 'row' },
        button('Tambah lajur', { size: 'sm', icon: 'plus', onClick: () => { g.cols.push({ head: '' }); draw(); } }),
        button('Buang lajur terakhir', { size: 'sm', onClick: () => { g.cols.pop(); draw(); } }),
        button(g.days.includes(6) ? 'Buang Sabtu' : 'Tambah Sabtu', { size: 'sm', onClick: () => { g.days = g.days.includes(6) ? g.days.filter(x => x !== 6) : [...g.days, 6]; draw(); } }),
        h('span', { class: 'spacer' }),
        button('Tukar ke slot & semak', { kind: 'primary', icon: 'check', onClick: () => gridToSlots(s) })));
  }
  function gridToSlots(s) {
    const g = s.grid;
    const rows = [['', ...g.cols.map(c => c.head)], ...g.days.map(d => [U.dayNameMs(d), ...g.cols.map((c, i) => g.cells[`${d}:${i}`] || '')])];
    const ctx = ctxFor(s);
    const out = I().timetableFromGrid(rows, ctx, { ref: 'grid manual' });
    if (!out.slots.length) { K().errorsModal(out.issues.map(i => i.msg).concat(out.issues.length ? [] : ['Tiada slot ditemui.']), { title: 'Grid belum lengkap', intro: 'Semak masa dalam baris tajuk dan isi petak.' }); return; }
    const model = s.result.model;
    model.slots = out.slots; model.periodGrid = out.periodGrid;
    rebuild(s); s.dirty = true; s.tab = 'padanan'; draw();
  }

  // ---- Padanan label & kelas (jadual waktu)
  function ttMappingPane(s) {
    const model = s.result.model;
    const labels = [...new Set(model.slots.filter(x => x.kind === 'PdP').map(x => x.label || ''))];
    const subOpts = [...subjects().map(x => ({ value: x.id, label: `${(x.name && x.name.ms) || x.id} (${x.timetableLabel || x.code || x.id})` }))];
    const rows = labels.map(lbl => {
      const cur = model.slots.find(x => x.kind === 'PdP' && (x.label || '') === lbl);
      const v = cur ? (cur.subjectId || '') : '';
      const sel = select({ options: [...subOpts, { value: `new:${lbl}`, label: `+ Subjek baharu: ${lbl}` }, { value: '__nonpdp', label: 'Bukan PdP (tiada RPH)' }], value: v, placeholder: '— Belum dipadankan —', cls: 'input-sm',
        onChange: val => { model.slots.forEach(x => { if (x.kind === 'PdP' && (x.label || '') === lbl) { if (val === '__nonpdp') { x.kind = 'non-PdP'; x.subjectId = null; } else x.subjectId = val || null; } }); s.dirty = true; rebuild(s); draw(); } });
      const n = model.slots.filter(x => (x.label || '') === lbl).length;
      return h('tr', { class: v ? null : 'imp-row-error' }, h('td', null, h('strong', { dir: 'auto' }, lbl || '(tiada label)')), h('td', { class: 'num' }, String(n)), h('td', null, sel));
    });
    const ex = s.result.extra || {};
    return h('div', { class: 'stack' },
      RPH.ui.card({ title: 'Label jadual → subjek', subtitle: 'Setiap label dalam jadual mesti dipadankan dengan subjek. "Subjek baharu" dicipta selepas anda menekan Simpan dan mengesahkan.',
        body: labels.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table adm-table-compact' }, h('thead', null, h('tr', null, h('th', null, 'Label'), h('th', { class: 'num' }, 'Slot'), h('th', null, 'Subjek'))), h('tbody', null, rows))) : empty('Tiada slot PdP.') }),
      RPH.ui.card({ title: 'Kelas', subtitle: 'Kelas yang belum wujud akan dicipta untuk tahun akademik aktif selepas pengesahan.',
        body: h('div', { class: 'pill-list' }, [...new Set(model.slots.filter(x => x.className).map(x => x.className))].map(c => { const m = I().matchClass(c, classesNow()); return h('span', { class: ['badge', m ? 'badge-green' : 'badge-amber'] }, m ? `${c} ✔` : `${c} (baharu)`); })) }),
      ex.periodGrid && ex.periodGrid.length ? RPH.ui.card({ title: 'Waktu (period)', body: h('div', { class: 'pill-list small' }, ex.periodGrid.map(p => h('span', { class: ['badge', p.break ? 'badge-gold' : 'badge-slate'] }, `${p.break ? 'REHAT ' : p.no != null ? `${p.no}: ` : ''}${p.start}–${p.end}`))) }) : null,
      h('div', { class: 'row' }, h('span', { class: 'spacer' }), button('Teruskan ke Semak & sunting', { kind: 'primary', icon: 'right', onClick: () => { s.tab = 'semak'; draw(); } })));
  }

  // ---- Padanan lajur (RPT)
  function rptMappingPane(s) {
    const model = s.result.model;
    const tables = I().util.tablesOf(s.doc || {});
    const roleOpts = Object.entries(I().RPT_ROLE_LABELS).map(([value, label]) => ({ value, label }));
    const cards = tables.filter(t => t.rows.length > 1).slice(0, 40).map(t => {
      const mp = model.mapping[t.index];
      const on = !!mp;
      const width = Math.max(...t.rows.map(r => r.length));
      const roles = mp ? mp.roles : new Array(width).fill('ignore');
      const cb = h('input', { type: 'checkbox', checked: on });
      cb.addEventListener('change', () => { if (cb.checked) model.mapping[t.index] = I().rptDetect(t.rows) || { header: -1, roles: roles.slice() }; else delete model.mapping[t.index]; remapRpt(s); draw(); });
      const sample = t.rows.slice(mp && mp.header >= 0 ? mp.header + 1 : 0, (mp && mp.header >= 0 ? mp.header + 1 : 0) + 3);
      const headRow = mp && mp.header >= 0 ? t.rows[mp.header] : null;
      return h('details', { class: 'imp-map-card', open: on && Object.keys(model.mapping).length <= 2 },
        h('summary', null, cb, h('strong', null, ` ${t.ref}`), h('span', { class: 'muted small' }, ` · ${t.rows.length} baris × ${width} lajur${mp && mp.inherited ? ' · pemetaan diwarisi' : ''}`)),
        h('div', { class: 'table-wrap' }, h('table', { class: 'table adm-table-compact imp-map' },
          h('thead', null, h('tr', null, Array.from({ length: width }, (_, i) => h('th', null, select({ options: roleOpts, value: roles[i] || 'ignore', cls: 'input-sm', onChange: v => { const m = model.mapping[t.index] || (model.mapping[t.index] = { header: -1, roles: roles.slice() }); m.roles[i] = v; remapRpt(s); draw(); } })))),
            headRow ? h('tr', { class: 'imp-map-hdr' }, Array.from({ length: width }, (_, i) => h('th', { dir: 'auto' }, String(headRow[i] || '').slice(0, 40)))) : null),
          h('tbody', null, sample.map(r => h('tr', null, Array.from({ length: width }, (_, i) => h('td', { dir: 'auto', class: rtlCls(r[i]) }, String(r[i] || '').slice(0, 80)))))))));
    });
    return h('div', { class: 'stack' },
      h('div', { class: 'notice notice-info' }, icon('info'), h('div', null, 'Tetapkan peranan setiap lajur (Minggu, Tarikh, Tema, Tajuk, Kod SK, Kod SP, Catatan…). Kod SK/SP diambil hanya jika tertulis dalam sel (cth. "1.1.1, 2.3.2"). Sel minggu bergabung diisi untuk setiap baris.')),
      cards.length ? cards : empty('Tiada jadual dalam fail ini.'),
      h('div', { class: 'row' }, h('span', { class: 'muted small' }, `${(model.records || []).length} baris dihasilkan.`), h('span', { class: 'spacer' }), button('Teruskan ke Semak & sunting', { kind: 'primary', icon: 'right', onClick: () => { s.tab = 'semak'; draw(); } })));
  }
  function remapRpt(s) {
    const model = s.result.model;
    model.records = I().rptRemap(s.doc, model.mapping, ctxFor(s));
    s.dirty = true; rebuild(s);
  }

  // ---- Semak & sunting (grid boleh sunting)
  function listsFor(s) {
    const m = s.result.model; const k = s.kind;
    const subOpts = [{ value: '', label: '—' }, ...subjects().map(x => ({ value: x.id, label: x.code || x.id }))];
    if (k === 'calendar') return [
      { key: 'weeks', label: 'Minggu persekolahan', rows: m.weeks, newRow: () => ({ week: (m.weeks.length ? Math.max(...m.weeks.map(w => +w.week || 0)) + 1 : 1), start: '', end: '', term: 1, kpmWeek: null, note: null, _ref: 'manual' }),
        cols: [{ key: 'week', label: 'Minggu', type: 'number', w: 70 }, { key: 'start', label: 'Mula (Isnin)', type: 'date' }, { key: 'end', label: 'Akhir (Jumaat)', type: 'date' }, { key: 'term', label: 'Penggal', type: 'number', w: 70 }, { key: 'kpmWeek', label: 'Minggu KPM', type: 'number', w: 80 }] },
      { key: 'entries', label: 'Cuti & acara', rows: m.entries, newRow: () => ({ start: '', end: '', kind: 'acara', category: 'umum', title: '', _ref: 'manual' }),
        cols: [{ key: 'start', label: 'Mula', type: 'date' }, { key: 'end', label: 'Akhir', type: 'date' }, { key: 'kind', label: 'Jenis', type: 'select', options: I().CAL_KINDS }, { key: 'category', label: 'Kategori', type: 'select', options: I().CAL_CATS }, { key: 'title', label: 'Tajuk', type: 'text', w: 320 }] },
    ];
    if (k === 'timetable') return [{ key: 'slots', label: 'Slot', rows: m.slots, newRow: () => ({ day: 1, start: '', end: '', label: '', className: '', year: null, kind: 'PdP', subjectId: null, coTeachers: [], note: null, _ref: 'manual' }),
      cols: [{ key: 'day', label: 'Hari', type: 'select', options: DOW.map(d => ({ value: d, label: U.dayNameMs(d) })), num: true }, { key: 'start', label: 'Mula', type: 'time' }, { key: 'end', label: 'Tamat', type: 'time' },
        { key: 'label', label: 'Label', type: 'text', w: 90 }, { key: 'subjectId', label: 'Subjek', type: 'select', options: () => [...subOpts, ...[...new Set(m.slots.filter(x => String(x.subjectId || '').startsWith('new:')).map(x => x.subjectId))].map(v => ({ value: v, label: `+ ${v.slice(4)} (baharu)` }))] },
        { key: 'className', label: 'Kelas', type: 'text', w: 90 }, { key: 'year', label: 'Tahun', type: 'number', w: 60 }, { key: 'kind', label: 'Jenis', type: 'select', options: ['PdP', 'non-PdP', 'unavailable'] }, { key: 'coTeachers', label: 'Guru bersama', type: 'list', w: 140 }] }];
    if (k === 'classes') return [
      { key: 'classes', label: 'Kelas', rows: m.classes, newRow: () => ({ name: '', id: '', year: null, enrolment: null, _ref: 'manual' }), cols: [{ key: 'name', label: 'Nama kelas', type: 'text' }, { key: 'id', label: 'ID', type: 'text', w: 90 }, { key: 'year', label: 'Tahun', type: 'number', w: 70 }, { key: 'enrolment', label: 'Bil. murid', type: 'number', w: 90 }] },
      { key: 'counts', label: 'Bilangan murid ikut subjek & tahun', rows: m.counts, newRow: () => ({ subject: '', subjectId: '', year: null, count: null, _ref: 'manual' }), cols: [{ key: 'subjectId', label: 'Subjek', type: 'select', options: subOpts }, { key: 'year', label: 'Tahun', type: 'number', w: 70 }, { key: 'count', label: 'Bil. murid', type: 'number', w: 90 }] },
    ];
    if (k === 'curriculum') return [{ key: 'rows', label: 'Bidang, SK, SP & TP', rows: m.rows, newRow: () => ({ level: 'SP', code: '', text: '', page: null, notes: [], _ref: 'manual' }),
      cols: [{ key: 'level', label: 'Jenis', type: 'select', options: ['bidang', 'SK', 'SP', 'TP1', 'TP2', 'TP3', 'TP4', 'TP5', 'TP6'] }, { key: 'code', label: 'Kod', type: 'text', w: 70 }, { key: 'text', label: 'Teks (seperti dicetak)', type: 'textarea', w: 420 },
        { key: 'textMs', label: 'Nama Melayu (bidang)', type: 'text', w: 160 }, { key: 'pagePdf', label: 'Hlm PDF', type: 'number', w: 64, get: r => (r.page && r.page.pdf) ?? '', set: (r, v) => { r.page = { ...(r.page || {}), pdf: v === '' || v == null ? null : +v }; } },
        { key: 'pagePrinted', label: 'Hlm cetak', type: 'number', w: 64, get: r => (r.page && r.page.printed) ?? '', set: (r, v) => { r.page = { ...(r.page || {}), printed: v === '' || v == null ? null : +v }; } }] }];
    if (k === 'rpt') return [{ key: 'records', label: 'Baris RPT', rows: m.records, newRow: () => ({ rptWeek: null, weeks: [], dates: '', theme: '', unit: '', bidang: '', topic: '', content: [], sk: [], sp: [], skText: '', spText: '', note: '', kind: 'lesson', _ref: 'manual' }),
      cols: [{ key: 'rptWeek', label: 'Minggu', type: 'number', w: 64, set: (r, v) => { r.rptWeek = v === '' || v == null ? null : +v; r.weeks = r.rptWeek != null ? [r.rptWeek] : []; } }, { key: 'dates', label: 'Tarikh', type: 'text', w: 90 },
        { key: 'kind', label: 'Jenis', type: 'select', options: () => [...new Set([...I().RPT_KINDS, ...m.records.map(x => x.kind).filter(Boolean)])] }, { key: 'theme', label: 'Tema', type: 'text', w: 110 }, { key: 'unit', label: 'Unit', type: 'text', w: 110 },
        { key: 'bidang', label: 'Bidang', type: 'text', w: 100 }, { key: 'topic', label: 'Tajuk', type: 'textarea', w: 200 }, { key: 'content', label: 'Kandungan', type: 'lines', w: 260 },
        { key: 'sk', label: 'Kod SK', type: 'codes', w: 80 }, { key: 'sp', label: 'Kod SP', type: 'codes', w: 110 }, { key: 'note', label: 'Catatan', type: 'text', w: 140 }] }];
    if (k === 'history') return [{ key: 'entries', label: 'RPH rujukan', rows: m.entries, newRow: () => ({ date: '', class: '', subjectId: '', topic: '', sk: [], sp: [], _ref: 'manual' }),
      cols: [{ key: 'date', label: 'Tarikh', type: 'date' }, { key: 'week', label: 'Minggu', type: 'number', w: 64 }, { key: 'class', label: 'Kelas', type: 'text', w: 80 }, { key: 'subjectId', label: 'Subjek', type: 'select', options: subOpts },
        { key: 'start', label: 'Mula', type: 'time' }, { key: 'end', label: 'Tamat', type: 'time' }, { key: 'topic', label: 'Tajuk', type: 'textarea', w: 220 }, { key: 'sk', label: 'SK', type: 'codes', w: 80 }, { key: 'sp', label: 'SP', type: 'codes', w: 110 }] }];
    return [];
  }
  function reviewPane(s) {
    const out = h('div', { class: 'stack' });
    put(out, issuesBox(s));
    const lists = listsFor(s);
    const filterCb = h('input', { type: 'checkbox', checked: state.onlyIssues });
    filterCb.addEventListener('change', () => { state.onlyIssues = filterCb.checked; draw(); });
    put(out, h('div', { class: 'row imp-grid-tools' }, h('label', { class: 'check' }, filterCb, h('span', null, 'Tunjuk baris bertanda sahaja')),
      h('span', { class: 'spacer' }),
      button('Tanda amaran sebagai disemak', { size: 'sm', icon: 'check', onClick: () => markReviewed(s) })));
    lists.forEach(L => put(out, gridCard(s, L)));
    if (s.kind === 'calendar-kpm') put(out, kpmCard(s));
    if (s.kind === 'curriculum' && s.result.data && s.result.data.performanceStandards && (s.result.data.performanceStandards.tables || []).length) {
      put(out, RPH.ui.card({ title: 'Jadual Tahap Penguasaan (umum)', subtitle: 'Dibaca daripada jadual "المستويات / Tahap Penguasaan". Disimpan bersama DSKP; bidang boleh ditetapkan kemudian di halaman DSKP (JSON).',
        body: h('div', { class: 'stack' }, s.result.data.performanceStandards.tables.map((t, i) => h('details', null, h('summary', null, `Jadual TP ${i + 1}${t.page && t.page.pdf ? ` · hlm ${t.page.pdf}` : ''} · ${t.levels.length} tahap`),
          h('ol', { class: 'small' }, t.levels.map(l => h('li', null, Object.values(l.text || {}).map(x => h('div', { dir: 'auto', class: rtlCls(x) }, x)))))))) }));
    }
    return out;
  }
  /** Semakan Kalendar Akademik KPM: pilih Kumpulan A/B, lihat blok persekolahan, penggal & cuti. */
  function kpmCard(s) {
    const m = s.result.model || {}; const keys = Object.keys(m.groups || {});
    const d = s.result.data;
    const sel = select({ options: keys.map(k => ({ value: k, label: `Kumpulan ${k}${k === 'A' ? ' (Kedah, Kelantan, Terengganu)' : ' (negeri lain)'}` })), value: (d && d.group) || m.selected, onChange: v => { s.kpmGroup = v; m.selected = v; rebuild(s); s.dirty = true; draw(); } });
    const fd = x => (x ? U.fmtDate(x) : '—');
    return RPH.ui.card({ title: 'Kalendar akademik KPM', subtitle: 'Pilih kumpulan sekolah anda. Data ini tidak menggantikan takwim sekolah; ia digunakan untuk semakan dan penjanaan RPT.',
      body: !d ? h('p', { class: 'muted' }, 'Tiada data kumpulan dibaca.') : h('div', { class: 'stack' },
        RPH.ui.field('Kumpulan sekolah', sel, 'Lalai daripada Tetapan → Profil Sekolah (kumpulan takwim).'),
        RPH.ui.table([{ label: 'Blok', render: b => String(b.block) }, { label: 'Penggal', render: b => String(b.term) }, { label: 'Mula', render: b => fd(b.start) }, { label: 'Akhir', render: b => fd(b.end) }, { label: 'Hari', cls: 'num', render: b => String(b.days) }, { label: 'Minggu', cls: 'num', render: b => String(b.weeks) }, { label: 'Selepas blok', render: b => b.after || '—' }], d.blocks || []),
        RPH.ui.table([{ label: 'Cuti', render: b => b.name }, { label: 'Mula', render: b => fd(b.start) }, { label: 'Akhir', render: b => fd(b.end) }, { label: 'Hari', cls: 'num', render: b => b.days != null ? String(b.days) : '—' }], d.breaks || []),
        h('p', { class: 'muted small' }, `${(d.kpmWeeks || []).length} minggu KPM · ${(d.blocks || []).reduce((a, b) => a + (b.days || 0), 0)} hari persekolahan (sebelum cuti umum/perayaan negeri).`)) });
  }
  function issuesBox(s) {
    const iss = [...((s.result && s.result.issues) || []), ...(s.aiNotes || []).map(m => ({ level: 'warn', msg: `AI: ${m}`, ref: 'AI' }))];
    const err = iss.filter(i => i.level === 'error'), warn = iss.filter(i => i.level !== 'error');
    const box = h('div', { class: 'imp-issues', id: 'imp-issues' },
      h('div', { class: 'imp-issues-head' },
        err.length ? h('span', { class: 'badge badge-red' }, `${err.length} ralat`) : null,
        warn.length ? h('span', { class: 'badge badge-amber' }, `${warn.length} perlu semakan`) : null,
        !iss.length ? h('span', { class: 'badge badge-green' }, '✔ Tiada isu dikesan') : null,
        h('span', { class: 'muted small' }, iss.length ? 'Ralat mesti dibetulkan (atau baris itu tidak disimpan). Amaran mesti disemak sebelum simpan.' : 'Masih perlu semak sepintas lalu sebelum simpan.')),
      iss.length ? h('details', { class: 'imp-issues-list', open: iss.length <= 8 }, h('summary', null, 'Senarai isu'), h('ul', null, iss.slice(0, 200).map(i => h('li', { class: i.level === 'error' ? 'adm-txt-red' : null, dir: 'auto' }, `${i.level === 'error' ? '✖' : '⚠'} ${i.msg}`, i.ref ? h('span', { class: 'muted' }, ` — ${i.ref}`) : null))),
        iss.length > 200 ? h('p', { class: 'muted small' }, `… dan ${iss.length - 200} lagi.`) : null) : null);
    return box;
  }
  function refreshIssues(s) {
    const old = root.querySelector('#imp-issues');
    if (old) old.replaceWith(issuesBox(s));
    root.querySelectorAll('tr[data-rowkey]').forEach(tr => paintRow(tr, tr._row));
    const t = root.querySelector('.tab.active'); if (t && /^Semak/.test(t.textContent)) t.textContent = `Semak & sunting${s.result.issues.length ? ` (${s.result.issues.length})` : ''}`;
  }
  function markReviewed(s) {
    let n = 0;
    listsFor(s).forEach(L => L.rows.forEach(r => { const before = (r._issues || []).length; r._issues = (r._issues || []).filter(i => i.auto || i.level === 'error'); n += before - r._issues.length; if (before !== r._issues.length) r._reviewed = true; }));
    rebuild(s); s.dirty = true; draw();
    toast(n ? `${n} amaran ditanda sebagai disemak.` : 'Tiada amaran import untuk ditanda.', 'success');
  }
  function paintRow(tr, r) {
    const lv = I().util.rowLevel(r);
    tr.classList.toggle('imp-row-error', lv === 'error');
    tr.classList.toggle('imp-row-warn', lv === 'warn');
    const flagCell = tr.querySelector('.imp-flag');
    if (flagCell) { clear(flagCell); flagCell.append(lv === 'error' ? '✖' : lv === 'warn' ? '⚠' : (r._reviewed ? '✔' : '')); flagCell.title = (r._issues || []).map(i => i.msg).join('\n'); }
    const msg = tr.querySelector('.imp-row-msg');
    if (msg) { clear(msg); (r._issues || []).slice(0, 3).forEach(i => msg.append(h('div', { class: i.level === 'error' ? 'adm-txt-red' : 'adm-txt-amber', dir: 'auto' }, `${i.level === 'error' ? '✖' : '⚠'} ${i.msg}`))); }
  }
  function cellEditor(s, L, c, r) {
    const raw = c.get ? c.get(r) : r[c.key];
    const commit = v => {
      if (c.set) c.set(r, v); else r[c.key] = v;
      r._issues = (r._issues || []).filter(i => i.auto || i.level === 'error' && !/tidak ditemui|tidak dibaca|kosong/i.test(i.msg));
      r._reviewed = true; s.dirty = true; RPH.ui.setDirty(true);
      rebuild(s); refreshIssues(s);
    };
    const opts = typeof c.options === 'function' ? c.options() : c.options;
    let el;
    if (c.type === 'select') {
      el = select({ options: (opts || []).map(o => (typeof o === 'object' ? o : { value: o, label: o })), value: raw == null ? '' : raw, cls: 'input-sm imp-cell' });
      el.addEventListener('change', () => commit(c.num ? +el.value : el.value));
    } else if (c.type === 'textarea' || c.type === 'lines') {
      const val = c.type === 'lines' ? (raw || []).join('\n') : (raw == null ? '' : String(raw));
      el = h('textarea', { class: ['input', 'imp-cell', 'imp-cell-ta', isAr(val) ? 'imp-rtl' : null], rows: Math.min(4, Math.max(1, Math.ceil(val.length / 60), val.split('\n').length)), dir: 'auto' });
      el.value = val;
      el.addEventListener('change', () => commit(c.type === 'lines' ? el.value.split('\n').map(x => x.trim()).filter(Boolean) : el.value.trim()));
    } else {
      const val = c.type === 'codes' || c.type === 'list' ? (Array.isArray(raw) ? raw.join(', ') : (raw || '')) : (raw == null ? '' : String(raw));
      el = h('input', { class: ['input', 'imp-cell', isAr(val) ? 'imp-rtl' : null], type: c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : c.type === 'time' ? 'time' : 'text', value: val, dir: c.type === 'codes' || c.type === 'number' || c.type === 'date' || c.type === 'time' ? 'ltr' : 'auto' });
      el.addEventListener('change', () => {
        const v = el.value;
        if (c.type === 'number') commit(v === '' ? null : +v);
        else if (c.type === 'codes') commit(v.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean));
        else if (c.type === 'list') commit(v.split(',').map(x => x.trim()).filter(Boolean));
        else commit(v.trim());
      });
    }
    el.setAttribute('aria-label', c.label);
    if (c.w) el.style.minWidth = `${c.w}px`;
    return el;
  }
  function gridCard(s, L) {
    const all = L.rows.map((r, i) => ({ r, i }));
    const shown = state.onlyIssues ? all.filter(x => (x.r._issues || []).length) : all;
    const pg = s.page[L.key] || 0;
    const pages = Math.max(1, Math.ceil(shown.length / PAGE));
    const slice = shown.slice(pg * PAGE, pg * PAGE + PAGE);
    const tbody = h('tbody');
    slice.forEach(({ r, i }) => {
      const tr = h('tr', { dataset: { rowkey: `${L.key}-${i}` } },
        h('td', { class: 'imp-flag', 'aria-label': 'Status baris' }),
        L.cols.map(c => h('td', null, cellEditor(s, L, c, r))),
        h('td', { class: 'imp-src small muted' }, r._ref || '', h('div', { class: 'imp-row-msg small' })),
        h('td', { class: 'adm-actions-cell' }, K().iconBtn('trash', 'Padam baris', () => { L.rows.splice(i, 1); s.dirty = true; rebuild(s); draw(); }, 'danger')));
      tr._row = r;
      paintRow(tr, r);
      tbody.append(tr);
    });
    const pager = pages > 1 ? h('div', { class: 'row imp-pager' }, button('Sebelum', { size: 'sm', icon: 'left', disabled: pg === 0, onClick: () => { s.page[L.key] = pg - 1; draw(); } }), h('span', { class: 'small' }, `Halaman ${pg + 1} / ${pages}`), button('Seterusnya', { size: 'sm', icon: 'right', disabled: pg >= pages - 1, onClick: () => { s.page[L.key] = pg + 1; draw(); } })) : null;
    return RPH.ui.card({ title: `${L.label} (${L.rows.length})`, cls: 'imp-grid-card',
      actions: [button('Tambah baris', { size: 'sm', icon: 'plus', onClick: () => { L.rows.push(L.newRow()); s.page[L.key] = Math.floor((L.rows.length - 1) / PAGE); s.dirty = true; rebuild(s); draw(); } })],
      body: h('div', null, shown.length ? h('div', { class: 'table-wrap imp-grid-wrap' }, h('table', { class: 'table imp-grid' },
        h('thead', null, h('tr', null, h('th', { class: 'imp-flag' }, ''), L.cols.map(c => h('th', null, c.label)), h('th', null, 'Sumber / isu'), h('th', null, ''))), tbody)) : empty(state.onlyIssues ? 'Tiada baris bertanda.' : 'Tiada baris.'), pager) });
  }

  // ---- Simpan
  function saveBar(s) {
    const r = s.result;
    const can = r && r.data && s.status === 'sedia';
    return h('div', { class: 'imp-savebar' },
      h('div', { class: 'small muted' }, r && r.issues ? `${r.issues.filter(i => i.level === 'error').length} ralat · ${r.issues.filter(i => i.level !== 'error').length} amaran` : ''),
      h('span', { class: 'spacer' }),
      button('Batal', { onClick: leaveSession }),
      button('Simpan', { kind: 'primary', icon: 'check', disabled: !can, onClick: () => save(s) }));
  }
  async function save(s) {
    const r = s.result; if (!r) return;
    rebuild(s);
    const err = r.issues.filter(i => i.level === 'error').length, warn = r.issues.length - err;
    if (st().isArchived && st().isArchived() && I().KINDS[s.kind].perYear) return toast('Tahun akademik ini diarkib (baca sahaja). Nyaharkib di Tetapan → Tahun Akademik.', 'error', 6000);
    if (err && !(await confirm({ title: 'Masih ada ralat', danger: true, confirmLabel: 'Simpan juga', message: `${err} ralat belum dibetulkan. Baris yang ralat tidak disimpan atau data mungkin tidak lengkap.\n\nBetulkan dalam jadual semakan dahulu, atau simpan juga?` }))) return;
    if (!err && warn && !(await confirm({ title: 'Pengesahan semakan', confirmLabel: 'Ya, sudah disemak', message: `${warn} item ditanda "perlu semakan". Sahkan bahawa anda telah menyemaknya dengan dokumen asal.` }))) return;
    const meta = { file: s.file ? s.file.name : null, at: U.nowIso(), method: r.method || null, errors: err, warnings: warn };
    try {
      const ok = await SAVE[s.kind](s, r, meta);
      if (ok === false) return;
      toast(`${LABEL[s.kind]} disimpan.`, 'success', 5000);
      if (s.queueId) state.queue = state.queue.filter(q => q.id !== s.queueId);
      state.session = null; RPH.ui.setDirty(false);
      if (RPH.readers && RPH.readers.release && s.doc) RPH.readers.release(s.doc);
      draw();
    } catch (e) { RPH.reportError('simpan import', e); }
  }
  /** Dialog pengesahan dalam SAVE: automasi (s.auto — Enjin Penukar) = ya, dengan rekod soalan. */
  const ask = (s, o) => { if (s && s.auto) { (s.asked = s.asked || []).push(o.title); return Promise.resolve(true); } return confirm(o); };
  const SAVE = {
    async 'calendar-kpm'(s, r, meta) {
      if (!r.data) { toast('Tiada data kalendar KPM untuk disimpan.', 'error'); return false; }
      const cur = st().get('calendar') || {};
      const data = { ...r.data, importMeta: meta };
      if (!(cur.weeks || []).length) {
        // Tiada takwim sekolah lagi (cth. edisi kosong) → tawarkan takwim asas daripada KPM.
        const base = I().calendarFromKpm ? I().calendarFromKpm(r.data, { yearId: st().activeYear() }) : null;
        const useBase = base && await ask(s, { title: 'Bina takwim asas daripada KPM?', confirmLabel: 'Bina takwim asas', message: `Takwim sekolah ${yearLabel()} belum ada.\nBina takwim asas (${(base.weeks || []).length} minggu, Kumpulan ${r.data.group}) daripada kalendar KPM? Acara sekolah boleh ditambah kemudian dengan mengimport takwim sekolah.\n\nPilih Batal untuk menyimpan data KPM sahaja.` });
        st().put('calendar', useBase ? { ...base, academicYearId: st().activeYear(), kpm: data } : { ...cur, academicYearId: st().activeYear(), kpm: data });
        if (useBase) st().update('academicYears', d => { const y = (d.years || []).find(x => x.id === st().activeYear()); if (y && base.session) { if (!y.startDate) y.startDate = base.session.start; if (!y.endDate) y.endDate = base.session.end; } });
        return true;
      }
      if (cur.kpm && !(await ask(s, { title: 'Ganti data KPM?', confirmLabel: 'Ganti', message: `Data kalendar KPM (Kumpulan ${cur.kpm.group}) sudah ada. Gantikan dengan Kumpulan ${r.data.group} daripada fail ini?\nTakwim sekolah tidak diubah.` }))) return false;
      st().update('calendar', c => { c.kpm = data; });
      return true;
    },
    async calendar(s, r, meta) {
      const cur = st().get('calendar') || {};
      if ((cur.weeks || []).length && !(await ask(s, { title: 'Ganti takwim?', danger: true, confirmLabel: 'Ganti', message: `Takwim ${yearLabel()} sudah ada (${cur.weeks.length} minggu). Gantikan dengan takwim daripada fail ini (${r.data.weeks.length} minggu)?\nRPH sedia ada tidak diubah.` }))) return false;
      const data = { ...r.data, academicYearId: st().activeYear(), importMeta: meta };
      if (cur.rptWeekMap && cur.rptWeekMap.B && Object.keys(cur.rptWeekMap.B.map || {}).length && !r.model.weeks.every(w => w.kpmWeek != null)) data.rptWeekMap.B = cur.rptWeekMap.B;
      st().put('calendar', data);
      // Tarikh sesi tahun akademik (jika belum ditetapkan guru)
      if (data.session) st().update('academicYears', d => { const y = (d.years || []).find(x => x.id === st().activeYear()); if (y) { if (!y.startDate) y.startDate = data.session.start; if (!y.endDate) y.endDate = data.session.end; } });
      return true;
    },
    async timetable(s, r, meta) {
      const ex = r.extra || {};
      const tt = st().get('timetable') || { versions: [] };
      const exists = (tt.versions || []).find(v => v.id === r.data.id);
      if (!r.data.id || r.data.id === 'import') { toast('Isi nombor versi jadual (cth. 4.1).', 'error'); return false; }
      if (exists) {
        const used = st().rphList().filter(x => x.timetableVersionId === exists.id).length;
        if (!(await ask(s, { title: `Ganti versi ${exists.id}?`, danger: true, confirmLabel: 'Ganti', message: `Versi ${exists.id} sudah wujud (${(exists.slots || []).length} slot).${used ? ` ${used} RPH merujuk versi ini — RPH tersebut tidak diubah.` : ''}\nGantikan slotnya dengan ${r.data.slots.length} slot daripada fail ini?` }))) return false;
      }
      const msgs = [];
      if ((ex.newSubjects || []).length) msgs.push(`Subjek baharu: ${ex.newSubjects.map(x => x.timetableLabel).join(', ')}`);
      if ((ex.newClasses || []).length) msgs.push(`Kelas baharu: ${ex.newClasses.map(x => x.name).join(', ')}`);
      if (msgs.length && !(await ask(s, { title: 'Cipta subjek / kelas baharu?', confirmLabel: 'Cipta & simpan', message: `${msgs.join('\n')}\n\nItem ini akan dicipta. Lengkapkan butiran subjek (nama penuh, skrip, templat) di halaman Subjek selepas ini.` }))) return false;
      if ((ex.newSubjects || []).length) {
        const tpl = (() => { try { const t = st().templates(); return (t.find(x => x.id === 'tpl-generic-kpm') || t[0] || {}).id || null; } catch (e) { return null; } })();
        st().update('subjects', d => { d.subjects = d.subjects || []; ex.newSubjects.forEach(n => { if (!d.subjects.some(x => x.id === n.id)) d.subjects.push({ id: n.id, code: n.code, name: { ms: n.name.ms }, timetableLabel: n.timetableLabel, language: 'malay', direction: 'ltr', script: 'rumi', years: [1, 2, 3, 4, 5, 6], curriculum: {}, defaultTemplateId: tpl, color: '#475569', createdFrom: 'import jadual' }); }); });
      }
      if ((ex.newClasses || []).length) st().update('classes', d => { d.classes = d.classes || []; ex.newClasses.forEach(c => { if (!d.classes.some(x => x.id === c.id)) d.classes.push({ ...c }); }); d.classes.sort((a, b) => (a.year || 0) - (b.year || 0) || a.name.localeCompare(b.name)); d.academicYearId = d.academicYearId || st().activeYear(); });
      st().update('timetable', d => {
        d.schemaVersion = d.schemaVersion || '1.0.0'; d.type = 'timetable'; d.academicYearId = d.academicYearId || st().activeYear(); d.versions = d.versions || [];
        const v = { ...r.data, importMeta: meta };
        const i = d.versions.findIndex(x => x.id === v.id);
        if (i >= 0) d.versions[i] = { ...d.versions[i], ...v }; else d.versions.push(v);
        if ((!d.periodGrid || !d.periodGrid.length) && (ex.periodGrid || []).length) d.periodGrid = ex.periodGrid;
      });
      return true;
    },
    async classes(s, r, meta) {
      const cur = st().get('classes') || {};
      const clash = (r.data.classes || []).filter(c => (cur.classes || []).some(x => x.id === c.id));
      if (clash.length && !(await ask(s, { title: 'Kemas kini kelas sedia ada?', confirmLabel: 'Kemas kini', message: `${clash.length} kelas sudah wujud (${clash.map(c => c.name).join(', ')}). Nama, tahun dan bilangan murid akan dikemas kini; kelas lain tidak dipadam.` }))) return false;
      st().update('classes', d => {
        d.schemaVersion = '1.0.0'; d.type = 'classes'; d.academicYearId = st().activeYear(); d.classes = d.classes || []; d.studentCounts = d.studentCounts || {};
        r.data.classes.forEach(c => { const i = d.classes.findIndex(x => x.id === c.id); if (i >= 0) d.classes[i] = { ...d.classes[i], ...c, enrolment: c.enrolment != null ? c.enrolment : d.classes[i].enrolment }; else d.classes.push(c); });
        d.classes.sort((a, b) => (a.year || 0) - (b.year || 0) || a.name.localeCompare(b.name));
        Object.assign(d.studentCounts, r.data.studentCounts || {});
        d.importMeta = meta;
      });
      if (st().applyDefaultReflectionAll) { try { st().applyDefaultReflectionAll(); } catch (e) { /* tahun diarkib */ } }
      return true;
    },
    async curriculum(s, r, meta) {
      if (!s.subjectId || !s.subjectYear) { toast('Pilih subjek dan tahun dahulu.', 'error'); return false; }
      const key = st().curriculumId(s.subjectId, s.subjectYear);
      const exists = (st().get('curriculum') || {})[key];
      if (exists && !(await ask(s, { title: 'Ganti DSKP sedia ada?', danger: true, confirmLabel: 'Ganti', message: `DSKP ${key} sudah wujud (${countSk(exists).sk} SK, ${countSk(exists).sp} SP). Gantikan dengan ${r.stats.sk} SK, ${r.stats.sp} SP daripada fail ini?\nRPH sedia ada tidak diubah.` }))) return false;
      const subj = st().subject(s.subjectId);
      const data = { ...r.data, subjectId: (subj && subj.curriculumFrom) || s.subjectId, subjectName: subj ? clone(subj.name) : r.data.subjectName, year: +s.subjectYear, importMeta: meta };
      if (exists && exists.themes && exists.themes.length && !(data.themes || []).length) data.themes = exists.themes;
      st().update('curriculum', d => { d[key] = data; });
      return true;
    },
    async rpt(s, r, meta) {
      if (!s.subjectId || !s.subjectYear) { toast('Pilih subjek dan tahun dahulu.', 'error'); return false; }
      const key = `${s.subjectId}-${s.subjectYear}`;
      const exists = (st().get('rpt') || {})[key];
      if (exists && !(await ask(s, { title: 'Ganti RPT sedia ada?', danger: true, confirmLabel: 'Ganti', message: `RPT ${key} untuk ${yearLabel()} sudah wujud. Gantikan dengan RPT daripada fail ini?\nRPH sedia ada tidak diubah.` }))) return false;
      const data = { ...r.data, subjectId: s.subjectId, year: +s.subjectYear, academicYearId: st().activeYear(), importMeta: meta };
      st().update('rpt', d => { d[key] = data; });
      return true;
    },
    async history(s, r, meta) {
      const cur = st().get('history');
      const old = (cur && cur.entries) || [];
      const k = e => `${e.date}|${e.classId}|${e.start}|${e.subjectId}`;
      const fresh = r.data.entries.filter(e => !old.some(o => k(o) === k(e)));
      if (!fresh.length) { toast('Semua RPH dalam fail ini sudah ada dalam sejarah.', 'info'); return false; }
      st().put('history', { ...(cur || { schemaVersion: '1.0.0', type: 'rph-history', academicYearId: st().activeYear() }), entries: [...old, ...fresh].sort((a, b) => String(a.date).localeCompare(String(b.date))), importMeta: meta });
      return true;
    },
  };
  const clone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));

  // ------------------------------------------------------------------ Automasi (Enjin Penukar)
  /**
   * Import satu fail tanpa dialog — laluan SAMA seperti butang Simpan (runImport → rebuild → SAVE[kind]).
   * Dialog pengesahan dijawab "ya" dan direkod dalam `asked`. Tiada apa-apa diteka: hasil `needsManual`/ralat dipulangkan
   * kepada pemanggil (enjin) untuk dibetulkan. Pulang { ok, kind, subjectId, subjectYear, stats, issues, asked, error }.
   */
  async function autoImport({ file = null, doc = null, kind, subjectId = null, subjectYear = null, deriveCandidates = false, shape = null, model = null, version = null, kpmGroup = null } = {}) {
    const s = { id: U.uid('imp'), kind, file, doc, subjectId, subjectYear: subjectYear ? +subjectYear : null, status: 'membaca', error: null, result: null, tab: 'semak', shape, derive: !!deriveCandidates, dirty: false, queueId: null, grid: null, page: {}, auto: true, asked: [], kpmGroup };
    const out = extra => ({ kind: s.kind, subjectId: s.subjectId, subjectYear: s.subjectYear, asked: s.asked, ...extra });
    if (!SAVE[kind]) return out({ ok: false, error: `Jenis "${kind}" tidak disokong.` });
    try { if (!s.doc && s.file) s.doc = await RPH.readers.read(s.file); } catch (e) { return out({ ok: false, error: e.message || String(e) }); }
    runImport(s);
    if (s.status === 'ralat') return out({ ok: false, error: s.error });
    if (model) { s.result.model = model; } // model semakan yang telah dibetulkan (cth. oleh enjin) → bina semula
    if (version && s.result.model && kind === 'timetable') s.result.model.version = { ...(s.result.model.version || {}), ...version }; // cth. { id: '4.1', effectiveFrom: '2027-01-11' }
    rebuild(s);
    const r = s.result;
    if (r.needsManual && !model) return out({ ok: false, needsManual: true, error: 'Fail perlu diisi secara manual (cth. gambar jadual).', issues: r.issues, stats: r.stats });
    const meta = { file: s.file ? s.file.name : (s.doc && s.doc.name) || null, at: U.nowIso(), method: (r.method || null), errors: r.issues.filter(i => i.level === 'error').length, warnings: r.issues.filter(i => i.level !== 'error').length, by: 'Enjin Penukar' };
    let saved;
    try { saved = await SAVE[kind](s, r, meta); } catch (e) { return out({ ok: false, error: e.message || String(e), issues: r.issues, stats: r.stats }); }
    return out({ ok: saved !== false, error: saved === false ? 'Tidak disimpan (lihat syarat dalam mesej).' : null, issues: r.issues, stats: r.stats, extra: r.extra ? { newSubjects: (r.extra.newSubjects || []).map(x => x.id), newClasses: (r.extra.newClasses || []).map(x => x.id) } : null, model: r.model });
  }

  // ------------------------------------------------------------------ JSON: templat RPH & backup/pakej
  async function importTemplateJson() { const fs = await pickFiles('.json', false); if (!fs[0]) return; try { const doc = await RPH.readers.read(fs[0]); importTemplateDoc(doc); } catch (e) { toast(e.message, 'error'); } }
  async function importTemplateDoc(doc) {
    const j = doc && doc.json;
    const list = j && j.type === 'template' ? [j] : (j && typeof j === 'object' && !Array.isArray(j) ? Object.values(j).filter(x => x && x.type === 'template') : []);
    if (!list.length) return K().errorsModal(['Fail bukan templat RPH (perlu "type": "template", "id" dan "fields").'], { intro: doc ? doc.name : '' });
    const bad = list.filter(t => !t.id || !Array.isArray(t.fields));
    if (bad.length) return K().errorsModal(bad.map(t => `Templat "${t.id || '?'}" tiada "id" atau "fields".`));
    const clash = list.filter(t => st().template(t.id));
    if (!(await confirm({ title: 'Import templat RPH', confirmLabel: 'Import', message: `${list.length} templat: ${list.map(t => (t.name && t.name.ms) || t.id).join(', ')}.${clash.length ? `\n${clash.length} templat dengan id sama akan diganti.` : ''}` }))) return;
    st().update('templates', d => { list.forEach(t => { d[t.id] = t; }); });
    toast('Templat diimport.', 'success'); draw();
  }
  async function restoreJson(file, doc) {
    try {
      doc = doc || await RPH.readers.read(file);
      const j = doc.json;
      if (!j || typeof j !== 'object') return K().errorsModal(['Fail JSON tidak sah.']);
      if (j.type === 'rph-backup') {
        const errs = st().validateBackup(j); if (errs.length) return K().errorsModal(errs);
        if (!(await confirm({ title: 'Pulihkan backup penuh?', danger: true, confirmLabel: 'Pulihkan', message: 'SEMUA data dalam pelayar ini akan diganti dengan isi backup. Buat backup data semasa dahulu jika perlu.' }))) return;
        st().importAll(j); toast('Backup dipulihkan.', 'success'); location.reload(); return;
      }
      if (j.type === 'rph-pakej-guru') return openTeacherPack(j);
      if (j.type === 'rph-private-pack') {
        if (!(await confirm({ title: 'Import pakej data peribadi?', confirmLabel: 'Import', message: `DSKP: ${Object.keys(j.curriculum || {}).length} · RPT: ${Object.keys(j.rpt || {}).length}. Data sedia ada dengan kunci sama akan diganti.` }))) return;
        st().importPrivatePack(j); toast('Pakej data diimport.', 'success'); draw(); return;
      }
      if (j.type === 'rph-year-archive') {
        const errs = st().validateYearArchive(j); if (errs.length) return K().errorsModal(errs);
        if (!(await confirm({ title: `Pulihkan arkib tahun ${j.yearId}?`, danger: true, confirmLabel: 'Pulihkan', message: `Data tahun ${j.yearId} (takwim, jadual, kelas, RPT, RPH) akan diganti. Tahun lain tidak disentuh.` }))) return;
        st().importYear(j); toast(`Arkib ${j.yearId} dipulihkan.`, 'success'); draw(); return;
      }
      if (['calendar', 'timetable', 'classes', 'curriculum', 'rpt', 'rph-history'].includes(j.type)) { startSession({ file, doc, kind: j.type === 'rph-history' ? 'history' : j.type, subjectId: j.subjectId || null, subjectYear: j.year || null }); return; }
      if (j.type === 'template') return importTemplateDoc(doc);
      K().errorsModal([`Jenis JSON "${j.type || '(tiada)'}" tidak dikenali.`]);
    } catch (e) { RPH.reportError('pulih JSON', e); }
  }

  // ------------------------------------------------------------------ Pakej Guru (satu fail daripada Enjin Penukar)
  async function openTeacherPack(j, q) {
    const errs = st().validateTeacherPack(j);
    if (errs.length) return K().errorsModal(errs, { intro: 'Pakej Guru tidak sah:' });
    const sm = st().inspectTeacherPack(j);
    const c = sm.counts, cf = sm.conflicts;
    const row = (label, value, note) => h('tr', null, h('th', null, label), h('td', null, value), h('td', { class: 'muted small' }, note || ''));
    const subjName = id => { const s = (j.subjects || []).find(x => x.id === id); return s && s.name ? (s.name.ms || id) : id; };
    const replaced = [cf.calendar ? 'takwim' : null, ...cf.timetable.map(v => `jadual versi ${v}`), ...cf.curriculum.map(k => `DSKP ${k}`), ...cf.rpt.map(k => `RPT ${k}`)].filter(Boolean);
    const ow = h('input', { type: 'checkbox' });
    const body = h('div', { class: 'stack' },
      h('p', null, `Fail ini mengandungi semua data ${sm.yearLabel}${sm.school ? ` untuk ${sm.school}` : ''}${sm.teacher ? ` (${sm.teacher})` : ''}. Semua data akan dimasukkan sekali gus.`),
      h('table', { class: 'table imp-pack-table' }, h('tbody', null,
        row('Tahun akademik', sm.yearLabel, sm.yearExists ? (sm.yearEmpty ? 'sedia ada (kosong)' : 'sedia ada — data digabung') : 'akan dicipta'),
        row('Subjek', c.subjects.map(subjName).join(', ') || '—'),
        row('Takwim', c.weeks ? `${c.weeks} minggu · ${c.schoolDays} hari PdP` : '—', cf.calendar ? 'takwim sedia ada diganti' : ''),
        row('Jadual waktu', c.timetableVersions.length ? `versi ${c.timetableVersions.join(', ')} · ${c.slots} slot` : '—', cf.timetable.length ? `versi ${cf.timetable.join(', ')} diganti` : ''),
        row('Kelas & murid', c.classes ? `${c.classes} kelas · bilangan murid: ${c.pupils.length ? c.pupils.slice(0, 6).join(', ') + (c.pupils.length > 6 ? ` +${c.pupils.length - 6}` : '') : 'belum ditetapkan'}` : '—', cf.classes.length ? `${cf.classes.length} kelas dikemas kini` : ''),
        row('DSKP', c.curriculum.map(x => `${x.key} (${x.sk} SK / ${x.sp} SP)`).join(', ') || '—', cf.curriculum.length ? `${cf.curriculum.join(', ')} diganti` : ''),
        row('RPT', c.rpt.map(x => `${x.key} (${x.rows} baris)`).join(', ') || '—', cf.rpt.length ? `${cf.rpt.join(', ')} diganti` : ''),
        row('Bahasa RPH', (() => { const full = sm.i18n.filter(x => x.counts && ['ms', 'en', 'ar', 'jawi'].every(l => x.counts[l] === x.counts.items)); return full.length === sm.i18n.length && sm.i18n.length ? 'BM · English · العربية · Jawi (DSKP lengkap 4 bahasa)' : `${full.length}/${sm.i18n.length} DSKP lengkap 4 bahasa`; })(), sm.topics ? `${sm.topics} tajuk RPT diterjemah` : ''))),
      sm.review.length ? h('div', { class: 'notice notice-warn' }, icon('alert'), h('div', null, h('strong', null, `${sm.review.length} perkara untuk disemak selepas import:`),
        h('ul', { class: 'imp-pack-review' }, sm.review.slice(0, 12).map(r => h('li', null, typeof r === 'string' ? r : r.msg || JSON.stringify(r)))),
        sm.review.length > 12 ? h('div', { class: 'small muted' }, `…dan ${sm.review.length - 12} lagi.`) : null)) : null,
      replaced.length ? h('div', { class: 'notice notice-info' }, icon('info'), h('div', null, `Akan diganti: ${replaced.join(', ')}. RPH yang sudah dijana tidak diubah.`)) : null,
      cf.school || cf.teacher ? h('label', { class: 'check' }, ow, h('span', null, 'Ganti profil sekolah & guru sedia ada dengan maklumat dalam pakej (lalai: hanya medan kosong diisi)')) : null);
    let done = false;
    await new Promise(res => modal({ title: 'Import Pakej Guru', size: 'lg', body, onClose: () => res(),
      actions: [{ label: 'Batal' }, { label: 'Import semua', kind: 'primary', icon: 'check', onClick: () => {
        try {
          st().importTeacherPack(j, { overwriteProfile: !!ow.checked });
          done = true;
          if (q) state.queue = state.queue.filter(x => x.id !== q.id);
          toast(`Pakej Guru diimport — ${sm.yearLabel} kini aktif.`, 'success', 6000);
        } catch (e) { if (e.details) K().errorsModal(e.details, { intro: e.message }); else RPH.reportError('import Pakej Guru', e); return false; }
      } }] }));
    if (done && alive()) draw();
    return done;
  }

  // ------------------------------------------------------------------ AI (Google Gemini) & OCR
  async function runAi(s) {
    if (!aiReady()) return toast('Tetapkan Kunci API AI dahulu (di halaman Import Data).', 'error', 6000);
    if (s.dirty && !(await confirm({ title: 'Ganti hasil semasa?', confirmLabel: 'Teruskan', message: 'Hasil AI akan menggantikan data dalam jadual semakan (suntingan anda hilang).' }))) return;
    const aiCfg = (RPH.ai && RPH.ai.getConfig && RPH.ai.getConfig()) || {};
    const aiName = aiCfg.provider === 'openai' ? `pembekal tersuai (${aiCfg.baseUrl})` : 'Google Gemini';
    const aiNote = aiCfg.provider === 'openai' ? 'Kandungan fail dihantar ke pelayan pembekal anda. Jangan hantar data peribadi murid.' : ((RPH.ai && RPH.ai.PRIVACY_NOTE) || 'Kandungan fail dihantar ke Google semasa digunakan.');
    if (!(await confirm({ title: `Hantar fail ke ${aiCfg.provider === 'openai' ? 'pembekal AI' : 'Google Gemini'}?`, confirmLabel: 'Hantar', message: `${aiNote}\n\nKandungan "${s.file ? s.file.name : 'fail'}" akan dihantar ke ${aiName} (perlukan internet). Hasil tetap perlu anda semak.` }))) return;
    const ctx = ctxFor(s);
    const spec = I().aiSpec(s.kind, ctx);
    let pages;
    if (s.doc && s.doc.kind === 'pdf' && (s.doc.numPages || (s.doc.pages || []).length) > 8) {
      const n = s.doc.numPages || s.doc.pages.length;
      const ans = await RPH.ui.prompt({ title: 'Julat halaman', label: `PDF ini ${n} halaman. Hantar halaman mana? (cth. 29-41; kosongkan untuk keseluruhan fail)`, value: '' });
      if (ans == null) return;
      const m = String(ans).match(/(\d+)\s*(?:-|–|hingga)?\s*(\d+)?/);
      if (m) pages = [+m[1], +(m[2] || m[1])];
    }
    const wait = modal({ title: 'Ekstrak dengan AI', size: 'sm', body: h('div', { class: 'stack imp-ai-wait' }, h('div', { class: 'imp-spinner', 'aria-hidden': 'true' }), h('p', null, 'Menghantar fail ke Google Gemini dan menunggu jawapan… (boleh mengambil masa hingga seminit)')) });
    try {
      const images = s.doc && s.doc.kind === 'image' ? s.doc.images : undefined;
      const obj = await RPH.ai.extract({ ...spec, doc: s.doc, file: s.file, images, pages });
      s.result = I().fromAi(s.kind, obj, ctx);
      s.aiNotes = Array.isArray(obj && obj._semakan) ? obj._semakan.filter(Boolean) : [];
      s.dirty = true; s.tab = s.kind === 'timetable' ? 'padanan' : 'semak';
      wait.close(); draw();
      toast('Hasil AI dimuatkan — SEMAK setiap baris dengan dokumen asal sebelum simpan.', 'info', 7000);
    } catch (e) { wait.close(); K().errorsModal([e.message || String(e)], { title: 'AI gagal', intro: 'Semak sambungan internet dan kunci API, atau cuba model lain.' }); }
  }
  async function runOcr(s) {
    try {
      const img = s.doc.images && s.doc.images[0] ? s.doc.images[0].dataUrl : await RPH.readers.renderPdfPage(s.doc, 1, 2);
      const r = await RPH.readers.ocr(img, { langs: ['msa', 'ara', 'eng'] });
      const text = (r && (r.text || r)) || '';
      s.doc.text = String(text); s.doc.paragraphs = String(text).split('\n').map(t => ({ text: t }));
      runImport(s); draw();
    } catch (e) { toast(e.message || String(e), 'error', 6000); }
  }
  function aiCard() {
    const show0 = (el, on) => { el.style.display = on ? '' : 'none'; };
    const A = RPH.ai;
    const has = A && typeof A.getConfig === 'function';
    if (!has) return RPH.ui.card({ title: 'Kunci API AI (pilihan)', cls: 'imp-ai', body: h('p', { class: 'muted small' }, 'Modul AI tidak dimuatkan. Import luar talian tetap berfungsi.') });
    let cfg = {}; try { cfg = A.getConfig() || {}; } catch (e) { cfg = {}; }
    const custom = () => provSel.value === 'openai';
    const provSel = select({ options: [{ value: 'gemini', label: 'Google Gemini (percuma)' }, { value: 'openai', label: 'Pembekal tersuai (serasi OpenAI)' }], value: cfg.provider || 'gemini', cls: 'input-sm' });
    provSel.id = 'ai-provider';
    const baseIn = h('input', { class: 'input', id: 'ai-base-url', type: 'url', autocomplete: 'off', value: cfg.baseUrl || '', placeholder: 'https://rootsys.cloud/v1', 'aria-label': 'Base URL pembekal' });
    const status = h('div', { class: 'small imp-ai-status' }, cfg.hasKey ? h('span', { class: 'badge badge-green' }, `✔ Kunci ditetapkan · ${cfg.provider === 'openai' ? `pembekal tersuai (${cfg.baseUrl})` : 'Google Gemini'} · model ${cfg.model || '—'}`) : h('span', { class: 'badge badge-slate' }, 'Belum ditetapkan'));
    const keyIn = h('input', { class: 'input', id: 'ai-key', type: 'password', autocomplete: 'off', placeholder: cfg.hasKey ? '•••••••• (tersimpan — taip untuk menukar)' : 'Tampal kunci API di sini', 'aria-label': 'Kunci API' });
    const fallback = (A.MODELS || []).map(m => (typeof m === 'object' ? { value: m.id, label: m.label || m.id } : { value: m, label: m }));
    const modelSel = select({ options: fallback, value: cfg.provider !== 'openai' ? (cfg.model || (fallback[0] && fallback[0].value) || '') : (fallback[0] && fallback[0].value) || '', cls: 'input-sm' });
    // Pembekal tersuai: nama model ditaip (atau dipilih daripada senarai /models pembekal).
    const modelIn = h('input', { class: 'input input-sm', id: 'ai-model', autocomplete: 'off', value: cfg.provider === 'openai' ? (cfg.model || '') : '', placeholder: 'nama model, cth. gpt-4o-mini', 'aria-label': 'Model' });
    // Senarai penuh model pembekal (select, bukan datalist — datalist hanya memaparkan model yang sepadan dengan teks yang sudah ditaip).
    const modelPick = select({ options: [{ value: '', label: '— pilih model —' }], value: '', cls: 'input-sm' });
    modelPick.id = 'ai-model-pick';
    modelPick.addEventListener('change', () => { if (modelPick.value) modelIn.value = modelPick.value; });
    show0(modelPick, false);
    const modelVal = () => (custom() ? modelIn.value.trim() : modelSel.value);
    const remember = h('input', { type: 'checkbox', checked: cfg.remember !== false });
    const loadModels = async (btn) => {
      if (typeof A.listModels !== 'function') return;
      if (btn) btn.disabled = true;
      try {
        const list = await A.listModels();
        if (!Array.isArray(list) || !list.length) return;
        if (custom()) {
          K().setOptions(modelPick, [{ value: '', label: `— pilih model (${list.length}) —` }, ...list.map(m => ({ value: m.id, label: m.label || m.id }))], list.some(m => m.id === modelIn.value) ? modelIn.value : '');
          show0(modelPick, true);
          if (!modelIn.value) modelIn.value = list[0].id;
        }
        else K().setOptions(modelSel, list.map(m => ({ value: m.id, label: m.label || m.id })), cfg.model || list[0].id);
      } catch (e) { toast(`Senarai model tidak dapat dimuat: ${e.message || e}`, 'error', 7000); }
      finally { if (btn) btn.disabled = false; }
    };
    if (cfg.hasKey) setTimeout(() => loadModels(), 50);
    const apply = () => A.setConfig({ provider: provSel.value, baseUrl: custom() ? baseIn.value.trim() : undefined, apiKey: keyIn.value.trim() || undefined, model: modelVal(), remember: remember.checked });
    const saveCfg = () => { try { apply(); keyIn.value = ''; toast('Tetapan AI disimpan.', 'success'); draw(); } catch (e) { toast(e.message || String(e), 'error'); } };
    const gemSteps = h('ol', { class: 'small imp-ai-steps' },
      h('li', null, 'Buka ', h('a', { href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener noreferrer' }, 'https://aistudio.google.com/apikey'), ' (log masuk akaun Google/DELIMa).'),
      h('li', null, 'Tekan "Create API key".'),
      h('li', null, 'Salin dan tampal di sini. Tiada kad kredit diperlukan.'));
    const customSteps = h('ol', { class: 'small imp-ai-steps' },
      h('li', null, 'Isi Base URL pembekal anda (berakhir dengan /v1), contohnya https://rootsys.cloud/v1.'),
      h('li', null, 'Tampal kunci API pembekal, kemudian tekan "Muat senarai model" atau taip nama model.'),
      h('li', null, 'Tekan "Uji sambungan". Jika gagal dengan mesej CORS, pelayan pembekal perlu menghantar pengepala Access-Control-Allow-Origin.'));
    const baseField = RPH.ui.field('Base URL', baseIn);
    const gemModel = RPH.ui.field('Model', h('div', { class: 'row adm-tight' }, modelSel, (() => { const b = button('Muat semula senarai model', { size: 'sm', icon: 'refresh', onClick: () => loadModels(b) }); return b; })()));
    const cusModel = RPH.ui.field('Model', h('div', { class: 'row adm-tight' }, modelPick, modelIn, (() => { const b = button('Muat senarai model', { size: 'sm', icon: 'refresh', onClick: () => { try { apply(); } catch (e) { return toast(e.message, 'error'); } loadModels(b); } }); return b; })()));
    const geminiWarn = h('ul', { class: 'small imp-ai-warn' },
      h('li', null, 'Kunci disimpan dalam pelayar ini sahaja dan TIDAK dimasukkan ke backup.'),
      h('li', null, 'Perlukan internet semasa digunakan.'),
      h('li', null, 'Had penggunaan percuma (bilangan permintaan seminit/sehari) dikenakan oleh Google.'),
      A.PRIVACY_NOTE ? h('li', null, String(A.PRIVACY_NOTE)) : null);
    const customWarn = h('ul', { class: 'small imp-ai-warn' },
      h('li', null, 'Kunci disimpan dalam pelayar ini sahaja dan TIDAK dimasukkan ke backup. Jangan masukkan kunci anda ke dalam app yang diedarkan kepada orang lain.'),
      h('li', null, 'Kandungan fail dihantar ke pelayan pembekal ini semasa "Ekstrak dengan AI". Jangan hantar data peribadi murid.'),
      h('li', null, 'Kos dan had penggunaan ditentukan oleh pembekal anda.'));
    const show = (el, on) => { el.style.display = on ? '' : 'none'; }; // .field menetapkan display sendiri → atribut hidden tidak cukup
    const sync = () => { const c = custom(); [baseField, cusModel, customSteps, customWarn].forEach(el => show(el, c)); [gemModel, gemSteps, geminiWarn].forEach(el => show(el, !c)); };
    provSel.addEventListener('change', sync);
    sync();
    return RPH.ui.card({ title: 'Kunci API AI (pilihan)', subtitle: 'Diperlukan hanya untuk gambar/foto jadual, PDF imbasan, struktur yang rumit atau draf terjemahan. Import biasa berfungsi tanpa internet.', cls: 'imp-ai',
      body: h('div', { class: 'stack' },
        status,
        RPH.ui.field('Pembekal', provSel),
        gemSteps, customSteps,
        h('div', { class: 'imp-ai-form' }, baseField, RPH.ui.field('Kunci API', keyIn), gemModel, cusModel),
        h('label', { class: 'check' }, remember, h('span', null, 'Simpan dalam pelayar ini')),
        h('div', { class: 'row' },
          button('Simpan', { kind: 'primary', size: 'sm', icon: 'check', onClick: saveCfg }),
          button('Uji sambungan', { size: 'sm', icon: 'refresh', onClick: async ev => {
            const b = ev.currentTarget; b.disabled = true;
            try { apply(); const r = await A.test(); if (r && r.ok) toast(`Sambungan berjaya (${r.model || modelVal()}).${r.warning ? ' ' + r.warning : ''}`, 'success', 6000); else toast(`Sambungan gagal: ${(r && r.error) || 'tidak diketahui'}`, 'error', 9000); }
            catch (e) { toast(`Sambungan gagal: ${e.message || e}`, 'error', 9000); } finally { b.disabled = false; }
          } }),
          button('Padam kunci', { size: 'sm', kind: 'danger', icon: 'trash', onClick: async () => { if (!(await confirm({ title: 'Padam kunci API?', danger: true, confirmLabel: 'Padam', message: 'Kunci API dipadam daripada pelayar ini.' }))) return; try { A.clear(); } catch (e) { /* */ } toast('Kunci API dipadam.', 'success'); draw(); } })),
        geminiWarn, customWarn) });
  }

  // ------------------------------------------------------------------ Daftar paparan
  RPH.views.import = {
    title: 'Import Data', icon: 'upload',
    render(el, params) {
      root = el; alive = K().mount(el, 'import');
      const j = params && (params.jenis || params.kind);
      if (j) {
        const k = ALIAS[j] || j;
        state.focus = { 'calendar-kpm': 'calendar-kpm', calendar: 'calendar', timetable: 'timetable', classes: 'classes', curriculum: 'curriculum', rpt: 'rpt', history: 'history', subjects: 'subjects', templates: 'templates', school: 'school', teacher: 'teacher', year: 'year', backup: 'backup' }[k] || null;
        if (state.session && !state.session.dirty && state.session.kind !== k) state.session = null;
      }
      draw();
    },
    _state: state,
    // Untuk ujian automatik (tests/import.test.mjs) sahaja.
    _test: { addFiles, expandZips, startSession, runImport, rebuild, save, draw, ctxFor, openTeacherPack },
    autoImport,
  };
})(window.RPH = window.RPH || {});
