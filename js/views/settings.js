/* Tetapan (master prompt §12–§14, §53–§56, §75–§76, §88): profil sekolah/guru, paparan cetak,
   tahun akademik, kelas, data (backup/restore/pakej peribadi/reset), leksikon Jawi. */
(function (RPH) {
  'use strict';
  const { h, icon, button, confirm, toast, clear, empty, tabs, select, modal } = RPH.ui;
  const U = RPH.util;
  const K = () => RPH.adminKit;
  const st = () => RPH.store;

  const TABS = [
    { id: 'sekolah', label: 'Profil Sekolah' }, { id: 'guru', label: 'Profil Guru' }, { id: 'cetak', label: 'Paparan Cetak' },
    { id: 'tahun', label: 'Tahun Akademik' }, { id: 'kelas', label: 'Kelas' }, { id: 'murid', label: 'Bilangan Murid' }, { id: 'data', label: 'Data' }, { id: 'jawi', label: 'Leksikon Jawi' },
  ];
  const state = { tab: 'sekolah' };

  // ------------------------------------------------------------------ Imej (logo / tandatangan)
  /** Kecilkan imej kepada maksimum `max` px (sisi terpanjang) supaya storan kekal kecil. */
  function resizeDataUrl(dataUrl, max = 300) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const sc = Math.min(1, max / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
        const w = Math.max(1, Math.round((img.naturalWidth || img.width) * sc)), hh = Math.max(1, Math.round((img.naturalHeight || img.height) * sc));
        const cv = document.createElement('canvas'); cv.width = w; cv.height = hh;
        const ctx = cv.getContext('2d');
        const png = /^data:image\/(png|gif|svg|webp)/i.test(dataUrl);
        if (!png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh); }
        ctx.drawImage(img, 0, 0, w, hh);
        let out = cv.toDataURL(png ? 'image/png' : 'image/jpeg', 0.85);
        if (png && out.length > 200000) { ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh); out = cv.toDataURL('image/jpeg', 0.85); }
        res(out);
      };
      img.onerror = () => rej(new Error('Imej tidak dapat dibaca.'));
      img.src = dataUrl;
    });
  }
  async function pickResized(max) {
    const raw = await RPH.ui.pickImage();
    if (!raw) return null;
    try { return await resizeDataUrl(raw, max); } catch (e) { toast(e.message, 'error'); return null; }
  }
  function imageBox(src, alt, onPick, onClear) {
    return h('div', { class: 'adm-imgbox' },
      src ? h('img', { src, alt, class: 'adm-img' }) : h('div', { class: 'adm-img adm-img-empty' }, icon('upload', 22), h('span', { class: 'small' }, 'Tiada imej')),
      h('div', { class: 'row' }, button(src ? 'Tukar' : 'Muat naik', { size: 'sm', icon: 'upload', onClick: onPick }), src ? button('Buang', { size: 'sm', kind: 'danger', icon: 'trash', onClick: onClear }) : null),
      h('span', { class: 'field-hint' }, 'Dikecilkan automatik ke 300 px.'));
  }

  // ------------------------------------------------------------------ Borang profil (draf + Simpan)
  function profileForm({ title, subtitle, obj, fields, collection, image }) {
    const draft = U.clone(obj) || {};
    let dirty = false;
    const status = h('span', { class: 'muted small' }, 'Tiada perubahan.');
    const markDirty = () => { dirty = true; RPH.ui.setDirty(true); status.textContent = 'Ada perubahan belum disimpan.'; status.className = 'adm-txt-amber small'; saveBtn.disabled = false; resetBtn.disabled = false; };
    const grid = h('div', { class: 'form-grid' });
    for (const f of fields) {
      const val = f.get ? f.get(draft) : draft[f.key];
      let c;
      if (f.type === 'select') c = select({ options: f.options, value: val ?? '', placeholder: f.placeholder, onChange: v => { f.set ? f.set(draft, v) : (draft[f.key] = v || null); markDirty(); } });
      else if (f.type === 'textarea') c = RPH.ui.textarea({ value: val ?? '', rows: 2, onInput: v => { f.set ? f.set(draft, v) : (draft[f.key] = v || null); markDirty(); } });
      else c = RPH.ui.input({ type: f.type || 'text', value: val ?? '', dir: f.dir, placeholder: f.placeholder || '', onInput: v => { f.set ? f.set(draft, v) : (draft[f.key] = v === '' ? null : v); markDirty(); } });
      grid.appendChild(h('label', { class: ['field', f.full ? 'adm-full' : null] }, h('span', { class: 'field-label' }, f.label), c, f.hint ? h('span', { class: 'field-hint' }, f.hint) : null));
    }
    const imgHost = h('div');
    const paintImg = () => {
      if (!image) return;
      clear(imgHost);
      imgHost.appendChild(h('div', { class: 'field' }, h('span', { class: 'field-label' }, image.label),
        imageBox(draft[image.key], image.label, async () => { const d = await pickResized(300); if (d) { draft[image.key] = d; markDirty(); paintImg(); } }, () => { draft[image.key] = null; markDirty(); paintImg(); })));
    };
    paintImg();
    const saveBtn = button('Simpan', { kind: 'primary', icon: 'check', disabled: true, onClick: () => {
      st().put(collection, { ...st().get(collection), ...draft, updatedAt: U.nowIso() });
      dirty = false; RPH.ui.setDirty(false);
      status.textContent = `Disimpan ${U.hhmm()}.`; status.className = 'adm-txt-green small'; saveBtn.disabled = true; resetBtn.disabled = true;
      toast(`${title} disimpan.`, 'success');
    } });
    const resetBtn = button('Batal perubahan', { disabled: true, onClick: () => { RPH.ui.setDirty(false); draw(); } });
    return RPH.ui.card({ title, subtitle, body: h('div', { class: 'adm-profile' }, h('div', { class: 'stack' }, grid, h('div', { class: 'row' }, saveBtn, resetBtn, status)), image ? imgHost : null) });
  }

  function schoolTab() {
    const s = st().get('school') || {};
    const codeVal = d => (d.code && typeof d.code === 'object' ? d.code.value : d.code) || '';
    return h('div', { class: 'stack' },
      profileForm({ title: 'Profil Sekolah', subtitle: 'Dipaparkan pada pengepala RPH, cetakan dan DOCX. Semua medan boleh diubah (cth. bertukar sekolah).', obj: s, collection: 'school',
        image: { key: 'logo', label: 'Logo sekolah' },
        fields: [
          { key: 'name', label: 'Nama sekolah', full: true },
          { key: 'shortName', label: 'Nama ringkas' },
          { key: 'abbreviation', label: 'Singkatan' },
          { key: 'code', label: 'Kod sekolah', get: codeVal, set: (d, v) => { d.code = { ...(d.code && typeof d.code === 'object' ? d.code : {}), value: v || null, status: 'disahkan-guru' }; },
            hint: s.code && s.code.status === 'perlu-semakan' ? 'Perlu semakan: kod disimpulkan daripada e-mel sekolah.' : null },
          { key: 'address', label: 'Alamat', type: 'textarea', full: true },
          { key: 'district', label: 'Daerah' }, { key: 'state', label: 'Negeri' },
          { key: 'email', label: 'E-mel', type: 'email' }, { key: 'phone', label: 'Telefon', type: 'tel' }, { key: 'fax', label: 'Faks', type: 'tel' },
          { key: 'session', label: 'Sesi', type: 'select', options: ['Pagi', 'Petang', 'Satu sesi'] },
          { key: 'calendarGroup', label: 'Kumpulan takwim', type: 'select', options: [{ value: 'A', label: 'Kumpulan A' }, { value: 'B', label: 'Kumpulan B' }] },
          { key: 'headmaster', label: 'Guru Besar', full: true },
          { key: 'afternoonSupervisor', label: 'Penolong Kanan / Penyelia Petang', full: true },
        ] }),
      s.headmasterSpellingNote ? h('div', { class: 'notice' }, icon('info'), h('span', null, s.headmasterSpellingNote)) : null);
  }

  function teacherTab() {
    const t = st().get('teacher') || {};
    const school = st().get('school') || {};
    const ay = st().academicYear() || {};
    return h('div', { class: 'stack' },
      profileForm({ title: 'Profil Guru', subtitle: `Sekolah: ${school.name || '—'} · Tahun akademik aktif: ${ay.label || st().activeYear()}`, obj: t, collection: 'teacher',
        image: { key: 'signature', label: 'Tandatangan' },
        fields: [
          { key: 'name', label: 'Nama paparan', hint: 'Nama ringkas pada RPH (cth. AMINAH).' },
          { key: 'fullName', label: 'Nama penuh' },
          { key: 'position', label: 'Jawatan', placeholder: 'cth. Guru Bahasa Arab' },
          { key: 'option', label: 'Opsyen', placeholder: 'cth. Pendidikan Islam' },
          { key: 'session', label: 'Sesi', type: 'select', options: ['Pagi', 'Petang', 'Satu sesi'] },
          { key: 'gender', label: 'Rujukan guru dalam ayat Arab', type: 'select', options: [{ value: 'P', label: 'المعلمة (Cikgu — perempuan)' }, { value: 'L', label: 'المعلم (Cikgu — lelaki)' }],
            hint: 'Menentukan bentuk kata kerja Arab dalam aktiviti BA (تسأل المعلمة / يسأل المعلم).' },
        ] }),
      t.note ? h('div', { class: 'notice notice-info' }, icon('info'), h('span', null, t.note)) : null);
  }

  function printTab() {
    const s = st().get('settings') || {};
    const save = (patch, msg) => { st().update('settings', d => Object.assign(d, patch)); toast(msg || 'Tetapan disimpan.', 'success', 1500); };
    const cb = (key, text, def = true) => { const el = h('input', { type: 'checkbox', checked: def ? s[key] !== false : s[key] === true, onChange: () => save({ [key]: el.checked }) }); return h('label', { class: 'check' }, el, h('span', null, text)); };
    const debugIn = RPH.ui.input({ type: 'date', value: s.debugToday || '', onChange: v => { save({ debugToday: v || null }, v ? `Tarikh simulasi: ${U.fmtDate(v)}.` : 'Tarikh simulasi dibuang.'); draw(); } });
    return h('div', { class: 'stack' },
      RPH.ui.card({ title: 'Paparan cetak & eksport', subtitle: 'Disimpan automatik.', body: h('div', { class: 'stack' },
        h('div', { class: 'check-group adm-col' }, cb('showLogo', 'Papar logo sekolah pada pengepala'), cb('showSchoolName', 'Papar nama sekolah'), cb('showTeacherName', 'Papar nama guru'),
          cb('showTranslationNote', 'Papar nota "Terjemahan SK/SP bukan teks rasmi DSKP" pada RPH yang memaparkan SK/SP terjemahan', false)),
        h('div', { class: 'form-grid' }, RPH.ui.field('Varian RPH lalai', select({ options: [{ value: 'compact', label: 'Ringkas' }, { value: 'standard', label: 'Standard' }, { value: 'detailed', label: 'Terperinci' }], value: s.defaultVariant || 'standard', onChange: v => save({ defaultVariant: v }) }), 'Digunakan jika templat tidak menetapkan varian.'))) }),
      RPH.ui.card({ title: 'Lanjutan', body: h('div', { class: 'form-grid' },
        RPH.ui.field('Tarikh simulasi "hari ini"', debugIn, s.debugToday ? `Aktif: aplikasi menganggap hari ini ${U.fmtDate(s.debugToday)}. Kosongkan untuk tarikh sebenar.` : 'Untuk ujian sahaja. Kosong = tarikh sebenar.'),
        s.debugToday ? h('div', { class: 'field' }, h('span', { class: 'field-label' }, ' '), button('Guna tarikh sebenar', { onClick: () => { save({ debugToday: null }); draw(); } })) : null) }));
  }

  // ------------------------------------------------------------------ Tahun akademik (§12, §75, §76)
  function yearForm(y) {
    const isNew = !y;
    const ay = st().get('academicYears') || { years: [] };
    const lastId = ay.years.map(x => x.id).sort().slice(-1)[0];
    const nextId = /^\d{4}$/.test(lastId || '') ? String(+lastId + 1) : '';
    K().formModal({ title: isNew ? 'Cipta tahun akademik baharu' : `Sunting tahun ${y.id}`, size: 'md',
      intro: isNew ? h('div', { class: 'notice notice-info' }, icon('info'), h('div', { class: 'small' }, 'Data setiap tahun diasingkan (§76): RPH, takwim, jadual, kelas dan RPT disimpan ikut ID tahun. Data tahun lama kekal tidak berubah. Jadual waktu dan kelas boleh disalin; takwim, RPT dan RPH bermula kosong.')) : null,
      values: isNew ? { id: nextId, label: nextId ? `Sesi ${nextId}` : '', startDate: nextId ? `${nextId}-01-11` : '', endDate: nextId ? `${nextId}-12-03` : '', copyFrom: st().activeYear(), activate: false }
        : { label: y.label, startDate: y.startDate, endDate: y.endDate, rptWeekMapping: y.rptWeekMapping || 'A' },
      fields: isNew ? [
        { key: 'id', label: 'ID tahun', required: true, placeholder: 'cth. 2027' },
        { key: 'label', label: 'Label', placeholder: 'cth. Sesi 2027' },
        { key: 'startDate', label: 'Tarikh mula sesi', type: 'date', required: true },
        { key: 'endDate', label: 'Tarikh akhir sesi', type: 'date', required: true },
        { key: 'copyFrom', label: 'Salin jadual waktu & kelas daripada', type: 'select', options: ay.years.map(x => ({ value: x.id, label: x.label || x.id })), placeholder: '— Jangan salin (mula kosong) —', full: true },
        { key: 'activate', type: 'checkbox', full: true, text: 'Jadikan tahun aktif selepas dicipta' },
      ] : [
        { key: 'label', label: 'Label', required: true },
        { key: 'startDate', label: 'Tarikh mula sesi', type: 'date' },
        { key: 'endDate', label: 'Tarikh akhir sesi', type: 'date' },
        { key: 'rptWeekMapping', label: 'Padanan minggu RPT', type: 'select', options: [{ value: 'A', label: 'A — minggu RPT = minggu sekolah' }, { value: 'B', label: 'B — ikut tarikh KPM' }] },
      ],
      onSave(v) {
        if (v.startDate && v.endDate && v.endDate <= v.startDate) return 'Tarikh akhir mesti selepas tarikh mula.';
        if (isNew) {
          const id = v.id.trim();
          if (!/^[A-Za-z0-9_-]+$/.test(id)) return 'ID tahun hanya huruf/nombor (cth. 2027).';
          if (ay.years.some(x => x.id === id)) return `Tahun ${id} sudah wujud.`;
          st().createYear({ id, label: v.label || `Sesi ${id}`, startDate: v.startDate, endDate: v.endDate, copyFrom: v.copyFrom || null });
          if (v.activate) st().setActiveYear(id);
          toast(`Tahun akademik ${id} dicipta.${v.activate ? ' Kini aktif.' : ''} Seterusnya: Takwim → Jana/Import, RPT → Import.`, 'success', 7000);
          if (v.activate) { RPH.app && RPH.app.buildTop && RPH.app.buildTop(); }
        } else {
          st().update('academicYears', d => { const x = d.years.find(z => z.id === y.id); Object.assign(x, { label: v.label, startDate: v.startDate || x.startDate, endDate: v.endDate || x.endDate, rptWeekMapping: v.rptWeekMapping }); });
          toast('Tahun akademik disimpan.', 'success');
        }
        draw();
      } });
  }

  // ------------------------------------------------------------------ Arkib tahun (Fasa 9)
  function downloadArchive(y) {
    try {
      const a = st().exportYear(y.id);
      U.download(`rph-arkib-${y.id}.json`, new Blob([JSON.stringify(a, null, 2)], { type: 'application/json' }));
      toast(`Arkib tahun ${y.id} dimuat turun: rph-arkib-${y.id}.json (${Object.keys(a.data.rph || {}).length} RPH).`, 'success', 5000);
    } catch (e) { toast(`Arkib gagal: ${e.message}`, 'error'); }
  }
  async function toggleArchived(y) {
    const on = !y.archived;
    const ok = await confirm({ title: on ? `Arkibkan tahun ${y.label || y.id}?` : `Nyaharkib tahun ${y.label || y.id}?`, confirmLabel: on ? 'Arkibkan' : 'Nyaharkib',
      message: on ? 'Tahun yang diarkib menjadi BACA SAHAJA: RPH boleh dilihat, dicari dan dieksport, tetapi tidak boleh dijana, disunting atau dipadam.\nDisarankan muat turun fail arkib dahulu.' : 'RPH tahun ini boleh disunting semula.' });
    if (!ok) return;
    try { st().setArchived(y.id, on); } catch (e) { toast(e.message, 'error'); return; }
    RPH.app && RPH.app.buildTop && RPH.app.buildTop();
    toast(on ? `Tahun ${y.id} diarkib (baca sahaja).` : `Tahun ${y.id} boleh disunting semula.`, 'success');
    draw();
  }
  async function importArchive() {
    const f = await K().readJson();
    if (!f) return;
    const errs = st().validateYearArchive(f.json);
    if (errs.length) return K().errorsModal(errs, { intro: `Fail "${f.name}" bukan arkib tahun Smart RPH (rph-arkib-<tahun>.json). Data semasa tidak diubah.` });
    const id = String(f.json.yearId);
    const exists = (st().get('academicYears') || { years: [] }).years.some(x => x.id === id);
    const nRph = Object.keys(f.json.data.rph || {}).length;
    const ok = await confirm({ title: `Import arkib tahun ${id}`, danger: exists, confirmLabel: exists ? `Ganti data tahun ${id}` : 'Import',
      message: `Fail: ${f.name}\nKandungan: ${nRph} RPH, ${Object.keys(f.json.data).length} koleksi.\n${exists ? `Data tahun ${id} dalam pelayar ini akan DIGANTI. Tahun lain tidak disentuh.` : `Tahun ${id} akan ditambah. Tahun lain tidak disentuh.`}` });
    if (!ok) return;
    try { st().importYear(f.json); } catch (e) { return K().errorsModal(e.details || [e.message], { intro: 'Import arkib gagal.' }); }
    RPH.app && RPH.app.buildTop && RPH.app.buildTop();
    toast(`Arkib tahun ${id} diimport (${nRph} RPH).`, 'success', 5000);
    draw();
  }

  function yearsTab() {
    const ay = st().get('academicYears') || { years: [] };
    const active = st().activeYear();
    const countRph = id => Object.keys(st().get('rph', id) || {}).length;
    const countSlots = id => ((st().get('timetable', id) || {}).versions || []).reduce((n, v) => n + (v.slots || []).length, 0);
    const hasCal = id => ((st().get('calendar', id) || {}).days || []).length > 0;
    const act = ay.years.find(y => y.id === active);
    return h('div', { class: 'stack' },
      act && !(act.startDate && act.endDate) ? h('div', { class: 'notice' }, icon('info'), h('div', null,
        h('div', null, `Tarikh mula dan akhir ${act.label || act.id} belum ditetapkan. Ia diambil daripada takwim yang diimport, atau tetapkan sendiri.`),
        h('div', { class: 'row adm-gap-sm' }, button('Tetapkan tarikh sesi', { size: 'sm', kind: 'primary', icon: 'edit', onClick: () => yearForm(act) })))) : null,
      RPH.ui.card({ title: 'Tahun akademik', subtitle: 'Setiap tahun mempunyai takwim, jadual, kelas, RPT dan RPH sendiri.', actions: [button('Import Arkib', { icon: 'upload', onClick: importArchive }), button('Cipta Tahun Baharu', { kind: 'primary', icon: 'plus', onClick: () => yearForm(null) })],
        body: h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
          h('thead', null, h('tr', null, ['Tahun', 'Sesi', 'Takwim', 'Slot jadual', 'RPH', 'Padanan RPT', ''].map(x => h('th', null, x)))),
          h('tbody', null, ay.years.map(y => h('tr', { class: y.id === active ? 'adm-selected' : null },
            h('td', null, h('strong', null, y.label || y.id), y.id === active ? h('span', { class: 'badge badge-green adm-ml' }, 'Aktif') : null, y.archived ? h('span', { class: 'badge badge-amber adm-ml', title: y.archivedAt ? `Diarkib ${new Date(y.archivedAt).toLocaleString('ms-MY')}` : null }, 'Diarkib') : null),
            h('td', { class: 'adm-nowrap' }, `${y.startDate ? U.fmtDate(y.startDate) : '—'} – ${y.endDate ? U.fmtDate(y.endDate) : '—'}`),
            h('td', null, hasCal(y.id) ? h('span', { class: 'badge badge-green' }, 'Ada') : h('span', { class: 'badge badge-amber' }, 'Belum')),
            h('td', { class: 'num' }, String(countSlots(y.id))),
            h('td', { class: 'num' }, String(countRph(y.id))),
            h('td', null, y.rptWeekMapping || 'A'),
            h('td', { class: 'adm-actions-cell' }, h('div', { class: 'row adm-tight' },
              y.id !== active ? button('Jadikan aktif', { size: 'sm', onClick: () => { st().setActiveYear(y.id); RPH.app && RPH.app.buildTop && RPH.app.buildTop(); toast(`Tahun akademik ${y.label || y.id} kini aktif.`, 'success'); draw(); } }) : null,
              K().iconBtn('download', `Muat turun arkib ${y.id}`, () => downloadArchive(y)),
              K().iconBtn('archive', y.archived ? 'Nyaharkib (benarkan suntingan)' : 'Arkibkan (baca sahaja)', () => toggleArchived(y)),
              K().iconBtn('edit', 'Sunting', () => yearForm(y))))))))) }),
      h('div', { class: 'notice notice-info' }, icon('info'), h('div', null, h('strong', null, 'Pengasingan data (§76). '), 'RPH tahun 2026 tidak bercampur dengan 2027 — setiap rekod disimpan dengan academicYearId. Menukar tahun aktif hanya menukar data yang dipaparkan; data tahun lain kekal.')),
      h('div', { class: 'notice notice-info' }, icon('archive'), h('div', null, h('strong', null, 'Arkib. '), 'Muat turun arkib menyimpan satu tahun (takwim, jadual, kelas, RPT, RPH, sejarah) ke rph-arkib-<tahun>.json. "Arkibkan" menjadikan tahun itu baca sahaja. "Import Arkib" memulihkan satu tahun tanpa menyentuh tahun lain.')));
  }

  // ------------------------------------------------------------------ Kelas
  function classForm(c) {
    const isNew = !c;
    const list = st().classes();
    K().formModal({ title: isNew ? 'Tambah kelas' : `Sunting kelas ${c.name}`, size: 'sm',
      values: c ? { ...c } : { year: 1 },
      fields: [
        { key: 'name', label: 'Nama kelas', required: true, placeholder: 'cth. 3 UTM', full: true },
        { key: 'id', label: 'ID', readonly: !isNew, hint: isNew ? 'Kosongkan untuk dijana (cth. 3UTM).' : 'Dirujuk oleh jadual & RPH.' },
        { key: 'year', label: 'Tahun', type: 'number', min: 1, max: 6, required: true },
        { key: 'enrolment', label: 'Bilangan murid', type: 'number', min: 0, hint: 'Digunakan dalam refleksi (x / jumlah murid).' },
      ],
      onSave(v) {
        const id = isNew ? (v.id || v.name.replace(/\s+/g, '').toUpperCase()) : c.id;
        if (isNew && list.some(x => x.id === id)) return `ID kelas "${id}" sudah wujud.`;
        st().update('classes', d => {
          d.classes = d.classes || [];
          const rec = { ...(c || {}), id, name: v.name, year: v.year, enrolment: v.enrolment };
          const i = d.classes.findIndex(x => x.id === id);
          if (i >= 0) d.classes[i] = rec; else d.classes.push(rec);
          d.classes.sort((a, b) => (a.year - b.year) || a.name.localeCompare(b.name));
        });
        if (!isNew && v.name !== c.name) {
          // Kemas kini nama kelas dalam slot jadual (RPH lama menyimpan nama sendiri — tidak diubah).
          st().update('timetable', d => { (d.versions || []).forEach(vv => (vv.slots || []).forEach(s => { if (s.classId === id) s.className = v.name; })); });
        }
        toast('Kelas disimpan.', 'success'); draw();
      } });
  }
  function classesTab() {
    const list = st().classes();
    const slotsFor = id => K().allSlots().filter(s => s.classId === id).length;
    if (!list.length) {
      return RPH.ui.card({ title: `Kelas — tahun akademik ${st().activeYear()}`, subtitle: 'Bilangan murid digunakan untuk refleksi.', actions: [button('Tambah Kelas', { kind: 'primary', icon: 'plus', onClick: () => classForm(null) })],
        body: K().emptyImport('Tiada kelas untuk tahun akademik ini. Import senarai kelas (cth. daripada jadual waktu atau fail Excel), atau tambah kelas satu demi satu.', 'kelas',
          button('Tambah Kelas', { icon: 'plus', onClick: () => classForm(null) })) });
    }
    return RPH.ui.card({ title: `Kelas — tahun akademik ${st().activeYear()}`, subtitle: 'Bilangan murid digunakan untuk refleksi.', actions: [button('Tambah Kelas', { kind: 'primary', icon: 'plus', onClick: () => classForm(null) })],
      body: RPH.ui.table([
        { label: 'Kelas', render: c => h('strong', null, c.name) },
        { label: 'ID', render: c => h('span', { class: 'adm-code' }, c.id) },
        { label: 'Tahun', cls: 'num', render: c => String(c.year ?? '—') },
        { label: 'Bil. murid', cls: 'num', render: c => (c.enrolment != null ? String(c.enrolment) : h('span', { class: 'badge badge-amber' }, 'Belum diisi')) },
        { label: 'Slot jadual', cls: 'num', render: c => String(slotsFor(c.id)) },
        { label: '', cls: 'adm-actions-cell', render: c => h('div', { class: 'row adm-tight' }, K().iconBtn('edit', 'Sunting', () => classForm(c)), K().iconBtn('trash', 'Padam', async () => {
          const n = slotsFor(c.id);
          if (!(await confirm({ title: 'Padam kelas', danger: true, confirmLabel: 'Padam', message: `Padam kelas ${c.name}?${n ? `\n${n} slot jadual merujuk kelas ini (slot kekal).` : ''}\nRPH sedia ada tidak diubah.` }))) return;
          st().update('classes', d => { d.classes = d.classes.filter(x => x.id !== c.id); }); toast('Kelas dipadam.', 'success'); draw();
        }, 'danger')) },
      ], list, { emptyText: 'Tiada kelas. Tambah kelas untuk tahun ini.' }) });
  }

  // ------------------------------------------------------------------ Bilangan murid → refleksi automatik (keputusan guru 2026-10-02)
  function studentCombos() {
    const out = new Map();
    const add = (subjectId, year, className) => {
      if (!subjectId || !year) return;
      const k = `${subjectId}-${year}`;
      if (!out.has(k)) out.set(k, { key: k, subjectId, year: +year, classes: new Set() });
      if (className) out.get(k).classes.add(className);
    };
    K().allSlots().filter(s => s.kind === 'PdP' && s.rph !== false).forEach(s => add(s.subjectId, s.year, s.className));
    Object.keys(st().studentCounts()).forEach(k => { const m = /^(.+)-(\d+)$/.exec(k); if (m) add(m[1], m[2]); });
    return [...out.values()].sort((a, b) => a.year - b.year || a.subjectId.localeCompare(b.subjectId));
  }
  function studentsTab() {
    const counts = st().studentCounts();
    const pct = st().achievedPct();
    const archived = st().isArchived();
    const subjName = id => { const s = st().subject(id); return s ? (s.name && (s.name.ms || s.name)) || id : id; };
    const status = h('span', { class: 'muted small' });
    const split = n => { const a = Math.round(n * st().achievedPct() / 100); return `${a} berjaya · ${n - a} tidak berjaya`; };
    const applyAll = () => {
      const n = st().applyDefaultReflectionAll();
      status.textContent = `Disimpan ${U.hhmm()}.${n ? ` ${n} RPH dikemas kini.` : ''}`; status.className = 'adm-txt-green small';
      if (n) toast(`Refleksi ${n} RPH diisi automatik.`, 'success');
    };
    const save = U.debounce(applyAll, 500);
    const pctIn = h('input', { class: 'input adm-num', type: 'number', min: '0', max: '100', step: '5', value: String(pct), disabled: archived, 'aria-label': 'Peratus murid berjaya' });
    pctIn.addEventListener('input', () => {
      const v = pctIn.value === '' ? null : Math.max(0, Math.min(100, +pctIn.value));
      st().update('settings', d => { d.reflectionAchievedPct = v; });
      rows.forEach(r => r.paint()); save();
    });
    const classesById = new Map(st().classes().map(c => [c.name, c]));
    const rows = studentCombos().map(c => {
      const inp = h('input', { class: 'input adm-num', type: 'number', min: '1', max: '60', inputmode: 'numeric', placeholder: '—', value: counts[c.key] != null ? String(counts[c.key]) : '', disabled: archived, 'aria-label': `Bilangan murid ${subjName(c.subjectId)} Tahun ${c.year}` });
      const prev = h('span', { class: 'small' });
      const paint = () => { const n = +inp.value; prev.textContent = n > 0 ? split(n) : 'Kosong — RPH memaparkan kotak "[ ] / [ ]"'; prev.className = n > 0 ? 'small' : 'small adm-txt-amber'; };
      inp.addEventListener('input', () => { st().setStudentCount(c.subjectId, c.year, inp.value === '' ? null : +inp.value); paint(); save(); });
      paint();
      const clsList = [...c.classes].map(nm => { const k = classesById.get(nm); return k && +k.enrolment > 0 ? `${nm} (enrolmen ${k.enrolment})` : nm; });
      const tr = h('tr', null,
        h('td', null, h('strong', null, subjName(c.subjectId)), h('span', { class: 'muted small adm-ml' }, c.subjectId)),
        h('td', { class: 'num' }, `Tahun ${c.year}`),
        h('td', { class: 'small' }, clsList.join(', ') || '—'),
        h('td', null, inp),
        h('td', null, prev));
      tr.paint = paint;
      return tr;
    });
    return h('div', { class: 'stack' },
      archived ? h('div', { class: 'notice notice-error' }, icon('alert'), h('span', null, 'Tahun akademik ini diarkib (baca sahaja).')) : null,
      RPH.ui.card({ title: `Bilangan murid ikut subjek & tahun — tahun akademik ${st().activeYear()}`,
        subtitle: 'Diisi sekali. Refleksi setiap RPH terus diisi: jumlah murid, berjaya (ikut peratus di bawah) dan tidak berjaya (baki). Tidak hadir = 0.',
        body: h('div', { class: 'stack' },
          rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
            h('thead', null, h('tr', null, ['Subjek', 'Tahun', 'Kelas', 'Bilangan murid', 'Refleksi automatik'].map(x => h('th', null, x)))),
            h('tbody', null, rows)))
            : K().emptyImport('Tiada subjek × tahun untuk diisi. Senarai ini dibina daripada slot PdP dalam jadual waktu — import atau isi jadual waktu dahulu.', 'jadual',
              button('Jadual Waktu', { icon: 'clock', onClick: () => RPH.router.go('jadual') }), button('Kelas', { onClick: () => { state.tab = 'kelas'; draw(); } })),
          h('div', { class: 'row' }, h('label', { class: 'field adm-inline' }, h('span', { class: 'field-label' }, 'Peratus murid berjaya (%)'), pctIn),
            h('span', { class: 'muted small' }, 'Lalai 70%. Baki = tidak berjaya.'), h('span', { class: 'spacer' }), status),
          h('p', { class: 'muted small' }, 'RPH baharu diisi semasa dijana. RPH sedia ada yang refleksinya kosong (atau masih automatik) dikemas kini serta-merta. Refleksi yang anda ubah sendiri dalam editor tidak disentuh. Jika sesuatu kelas mempunyai enrolmen sendiri (tab Kelas), enrolmen kelas itu diutamakan.')) }));
  }

  // ------------------------------------------------------------------ Data (§53–§56, §88)
  function backup() {
    const data = st().exportAll();
    U.download('rph-backup.json', new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    st().update('settings', d => { d.lastBackupAt = U.nowIso(); });
    toast('Backup dimuat turun: rph-backup.json', 'success');
    draw();
  }
  async function restore() {
    const f = await K().readJson();
    if (!f) return;
    const errs = st().validateBackup(f.json);
    if (errs.length) return K().errorsModal(errs, { intro: `Fail "${f.name}" bukan backup Smart RPH yang sah. Data semasa tidak diubah.` });
    const keys = Object.keys(f.json.data || {});
    const nRph = keys.filter(k => /:rph$/.test(k)).reduce((n, k) => n + Object.keys(f.json.data[k] || {}).length, 0);
    const ok = await confirm({ title: 'Pulihkan backup?', danger: true, confirmLabel: 'Ganti semua data',
      message: `Fail: ${f.name}\nDieksport: ${f.json.exportedAt ? new Date(f.json.exportedAt).toLocaleString('ms-MY') : '—'} (v${f.json.appVersion || '?'})\nKandungan: ${keys.length} koleksi, ${nRph} RPH.\n\nSEMUA data semasa dalam pelayar ini akan DIGANTI. Buat backup data semasa dahulu jika perlu.` });
    if (!ok) return;
    try { st().importAll(f.json); }
    catch (e) { return K().errorsModal(e.details || [e.message], { intro: 'Pemulihan gagal.' }); }
    toast('Backup dipulihkan.', 'success', 5000);
    RPH.router.render();
  }
  async function importPack() {
    const f = await K().readJson();
    if (!f) return;
    const j = f.json;
    const errs = [];
    if (!j || j.type !== 'rph-private-pack') errs.push('Medan "type" mesti "rph-private-pack".');
    else {
      if (!j.curriculum || typeof j.curriculum !== 'object') errs.push('Medan "curriculum" tiada.');
      if (j.rpt && typeof j.rpt !== 'object') errs.push('Medan "rpt" mesti objek.');
    }
    if (errs.length) return K().errorsModal(errs, { intro: `Fail "${f.name}" bukan pakej data peribadi (rph-private-pack.json).` });
    const nC = Object.keys(j.curriculum || {}).length, nR = Object.keys(j.rpt || {}).length;
    if (!(await confirm({ title: 'Import pakej data peribadi', confirmLabel: 'Import', message: `Pakej mengandungi ${nC} DSKP dan ${nR} RPT.\nDSKP/RPT dengan kunci sama akan diganti. RPH guru tidak diubah.` }))) return;
    try { st().importPrivatePack(j); }
    catch (e) { return K().errorsModal(e.details || [e.message]); }
    toast(`Pakej diimport: ${nC} DSKP, ${nR} RPT.`, 'success', 5000);
    draw();
  }
  function resetSystem() {
    const inp = h('input', { class: 'input', placeholder: 'Taip RESET', autocomplete: 'off', 'aria-label': 'Taip RESET untuk mengesahkan' });
    const err = h('div', { class: 'notice notice-error adm-hidden' }, icon('alert'), h('span', null, 'Taip RESET (huruf besar) untuk mengesahkan.'));
    modal({ title: 'Reset Sistem', size: 'sm', body: h('div', { class: 'stack' },
      h('div', { class: 'notice notice-error' }, icon('alert'), h('div', null, h('strong', null, 'Tindakan ini tidak boleh dibatalkan. '), st().edition && st().edition() === 'kosong' ? 'Semua RPH, profil, subjek, DSKP, RPT, templat, jadual, takwim dan tetapan akan dipadam. Aplikasi kembali kosong seperti kali pertama dibuka.' : 'Semua RPH, suntingan subjek, templat, jadual, takwim dan tetapan akan dipadam dan data asal (seed) dimuatkan semula.')),
      h('p', { class: 'small' }, 'Disarankan: buat "Backup Semua Data" dahulu.'),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Taip RESET untuk mengesahkan'), inp), err),
      actions: [{ label: 'Batal' }, { label: 'Reset Sistem', kind: 'danger', icon: 'trash', onClick: () => {
        if (inp.value.trim() !== 'RESET') { err.classList.remove('adm-hidden'); inp.focus(); return false; }
        try { st().resetAll(); } catch (e) { toast(`Reset gagal: ${e.message}`, 'error'); return false; }
        try { RPH.ai && RPH.ai.clear && RPH.ai.clear(); } catch (e) { /* kunci API Gemini turut dipadam semasa reset */ }
        RPH.ui.setDirty(false);
        toast('Sistem telah direset kepada data asal.', 'success', 5000);
        RPH.router.render();
        return true;
      } }] });
  }

  function dataTab() {
    const s = st().get('settings') || {};
    const used = RPH.storage.usageKB();
    const quota = 5120;
    const pct = Math.min(100, Math.round(used / quota * 100));
    const meta = st().meta() || {};
    const hasPriv = st().hasPrivateData();
    const curr = Object.keys(st().get('curriculum') || {});
    const rpt = Object.keys(st().get('rpt') || {});
    return h('div', { class: 'stack' },
      h('div', { class: 'grid grid-2' },
        RPH.ui.card({ title: 'Backup & Restore', subtitle: 'Semua data disimpan dalam pelayar ini sahaja (localStorage). Buat backup secara berkala.', body: h('div', { class: 'stack' },
          h('div', { class: 'row' }, button('Backup Semua Data', { kind: 'primary', icon: 'download', onClick: backup }), button('Restore Backup', { icon: 'upload', onClick: restore })),
          h('p', { class: 'muted small' }, s.lastBackupAt ? `Backup terakhir: ${new Date(s.lastBackupAt).toLocaleString('ms-MY')}` : 'Belum pernah backup dari pelayar ini.'),
          h('p', { class: 'muted small' }, 'Restore akan mengesahkan fail dahulu ("Format fail tidak sah" jika salah) dan meminta pengesahan sebelum menggantikan data.')) }),
        RPH.ui.card({ title: 'Pakej Data Peribadi (DSKP/RPT)', subtitle: 'Untuk aplikasi yang dihoskan tanpa fail peribadi.', body: h('div', { class: 'stack' },
          h('div', { class: 'pill-list' }, hasPriv ? h('span', { class: 'badge badge-green' }, `${curr.length} DSKP dimuatkan`) : h('span', { class: 'badge badge-amber' }, 'DSKP belum dimuatkan'), h('span', { class: ['badge', rpt.length ? 'badge-green' : 'badge-amber'] }, `${rpt.length} RPT (tahun ${st().activeYear()})`)),
          curr.length ? h('div', { class: 'muted small' }, `DSKP: ${curr.join(', ')}${rpt.length ? ` · RPT: ${rpt.join(', ')}` : ''}`) : null,
          button('Import Pakej Data Peribadi', { icon: 'upload', onClick: importPack }),
          h('p', { class: 'muted small' }, 'Fail: rph-private-pack.json. Data DSKP berhak cipta kekal dalam pelayar ini sahaja.')) })),
      h('div', { class: 'grid grid-2' },
        RPH.ui.card({ title: 'Storan', body: h('div', { class: 'stack' },
          h('div', { class: 'row' }, h('strong', null, `${used.toLocaleString('ms-MY')} KB`), h('span', { class: 'muted small' }, `digunakan daripada anggaran ~${(quota / 1024).toFixed(0)} MB (${RPH.storage.backend})`)),
          h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('span', { style: { width: `${pct}%`, background: pct > 80 ? 'var(--red)' : pct > 60 ? 'var(--amber)' : null } })),
          h('p', { class: 'muted small' }, `${RPH.storage.keys().length} kunci storan.${pct > 80 ? ' Storan hampir penuh — buat backup dan kecilkan logo/tandatangan.' : ''}`)) }),
        RPH.ui.card({ title: 'Versi Aplikasi', body: h('div', { class: 'stack' },
          K().kv([
            ['Versi aplikasi', h('strong', null, `v${RPH.VERSION}`)], ['Edisi', st().edition ? (st().edition() === 'kosong' ? 'Kosong (semua data diimport guru)' : 'Asal (bersama data seed sekolah)') : null], ['Skema data', meta.schemaVersion], ['Versi data seed', meta.dataVersion], ['Disemai', meta.seededAt ? new Date(meta.seededAt).toLocaleString('ms-MY') : null], ['Tahun aktif', st().activeYear()],
          ]),
          h('div', { class: 'adm-copyright' }, h('span', { class: 'adm-copyright-mark', 'aria-hidden': 'true' }, '©'), h('span', null, 'Dibangunkan oleh ', h('strong', null, 'Muzzammil Najib'), ' · 2026')),
        ) })),
      h('section', { class: 'card adm-danger-zone' }, h('div', { class: 'card-head' }, h('div', null, h('h2', null, 'Reset Sistem'), h('p', { class: 'muted small' }, 'Padam semua data dan muat semula data asal.'))),
        h('div', { class: 'card-body row' }, button('Reset Sistem', { kind: 'danger', icon: 'trash', onClick: resetSystem }), h('span', { class: 'muted small' }, 'Memerlukan pengesahan dengan menaip RESET.'))));
  }

  // ------------------------------------------------------------------ Leksikon Jawi
  function jawiTab() {
    const lx = st().get('jawiLexicon') || {};
    const nr = Object.entries(lx.needsReview || {});
    const out = h('div', { class: 'adm-jawi-out', dir: 'rtl', lang: 'ms-Arab' });
    const unk = h('div', { class: 'small' });
    const conv = RPH.ui.textarea({ rows: 2, dir: 'rtl', placeholder: 'Tampal teks Jawi ejaan lama (cth. ممباخ دان مغعملكن)…', onInput: v => {
      const r = RPH.jawi.fromLegacy(v);
      out.textContent = r.text; clear(unk);
      if (r.unknown.length) unk.append(h('span', { class: 'adm-txt-amber' }, 'Perkataan tidak dikenali (ditukar dengan peraturan lalai — perlu semakan): '), K().rtl(r.unknown.join('، '), 'jawi'));
    } });
    return h('div', { class: 'stack' },
      h('div', { class: 'grid grid-3' }, RPH.ui.stat('Perkataan dalam leksikon', String(Object.keys(lx.words || {}).length)), RPH.ui.stat('Perlu semakan', String(nr.length), null, nr.length ? 'warn' : null), RPH.ui.stat('Peta huruf lalai', String(Object.keys(lx.charMapDefault || {}).length))),
      RPH.ui.card({ title: 'Peta huruf (ejaan gantian → Jawi standard)', subtitle: lx.description, body: h('div', { class: 'pill-list' }, Object.entries(lx.charMapDefault || {}).map(([a, b]) => h('span', { class: 'adm-pill adm-map', dir: 'ltr', title: `${a} (ejaan gantian) → ${b} (Jawi standard)` }, h('span', { class: 'ar', lang: 'ar', dir: 'rtl' }, a), ' → ', h('span', { class: 'jawi', lang: 'ms-Arab', dir: 'rtl' }, b)))) }),
      RPH.ui.card({ title: 'Perkataan perlu semakan', subtitle: 'Tidak ditukar secara senyap — disenaraikan untuk semakan guru.', body: RPH.ui.table([
        { label: 'Perkataan', render: r => K().rtl(r[0], 'jawi') },
        { label: 'Cadangan Jawi', render: r => K().rtl(RPH.jawi.fromLegacy(r[0]).text, 'jawi') },
        { label: 'Catatan', render: r => K().mixed(r[1]) },
      ], nr, { emptyText: 'Tiada perkataan perlu semakan.' }) }),
      (lx.reviewLog || []).length ? RPH.ui.card({ title: 'Log semakan', body: RPH.ui.table([
        { label: 'Tarikh', render: r => U.fmtDate(r.date) },
        { label: 'Perkataan', render: r => h('div', { class: 'pill-list', dir: 'rtl' }, (r.words || []).map(w => h('span', { class: 'adm-pill jawi', lang: 'ms-Arab' }, w))) },
        { label: 'Keputusan', render: r => r.decision },
      ], lx.reviewLog) }) : null,
      RPH.ui.card({ title: 'Uji penukar Jawi', subtitle: 'Tukar ejaan fon lama (غ ف ض) kepada Jawi Unicode standard (ڠ ڤ ݢ).', body: h('div', { class: 'stack' }, conv, out, unk) }));
  }

  // ------------------------------------------------------------------ Paparan
  let root = null, alive = () => false;
  function draw() {
    if (!alive()) return;
    clear(root);
    root.append(RPH.ui.pageHeader('Tetapan', `Smart RPH Generator v${RPH.VERSION} · Tahun akademik aktif ${st().activeYear()}`, []));
    root.appendChild(tabs(TABS, state.tab, async id => {
      if (RPH.ui.isDirty() && !(await confirm({ title: 'Perubahan belum disimpan', message: 'Ada perubahan yang belum disimpan. Tinggalkan tab ini?', confirmLabel: 'Tinggalkan', danger: true }))) return;
      RPH.ui.setDirty(false); state.tab = id; draw();
    }));
    const body = { sekolah: schoolTab, guru: teacherTab, cetak: printTab, tahun: yearsTab, kelas: classesTab, murid: studentsTab, data: dataTab, jawi: jawiTab }[state.tab] || schoolTab;
    root.appendChild(body());
  }

  RPH.views.tetapan = {
    title: 'Tetapan', icon: 'settings',
    render(el, params) {
      root = el; alive = K().mount(el, 'tetapan');
      if (params && params.tab && TABS.some(t => t.id === params.tab)) state.tab = params.tab;
      draw();
    },
    _resize: resizeDataUrl,
  };
})(window.RPH = window.RPH || {});
