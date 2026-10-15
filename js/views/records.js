/* Paparan Rekod RPH (#/rekod, master prompt §43, §46, §47): carian & tapisan, jadual boleh isih,
   tindakan pukal (status, BBM, PAK21, gandakan ke kelas lain, eksport, padam) + sejarah RPH diimport. */
(function (RPH) {
  'use strict';
  const U = RPH.util;
  const h = (...a) => RPH.ui.h(...a);
  /** Tambah anak (rata, langkau null/false) — Element.append() asli menukar null kepada teks "null". */
  const add = (el, ...kids) => RPH.ui.append(el, kids);
  const S = () => RPH.store;
  const K = () => RPH.rphKit;

  const EMPTY = () => ({ from: '', to: '', week: '', subjectId: '', year: '', classId: '', q: '', code: '', status: '' });
  const st = { f: EMPTY(), sort: { key: 'date', dir: -1 }, selected: new Set(), tab: 'rph', limit: 100, hq: '', fOpen: null };

  const norm = s => {
    const t = String(s || '');
    return U.isArabicScript(t) && RPH.jawi ? RPH.jawi.normalizeForMatch(t) : t.toLowerCase();
  };

  function matches(r, f) {
    const k = K();
    if (f.from && r.date < f.from) return false;
    if (f.to && r.date > f.to) return false;
    if (f.week && r.week !== +f.week) return false;
    if (f.subjectId && r.subjectId !== f.subjectId) return false;
    if (f.year && +r.year !== +f.year) return false;
    if (f.classId && r.classId !== f.classId) return false;
    if (f.status) {
      if (f.status === 'tertangguh') { if (!['ditangguhkan', 'dibawa'].includes(r.status)) return false; }
      else if (r.status !== f.status) return false;
    }
    if (f.code) {
      const c = f.code.trim().replace(/\.$/, '');
      if (c && ![...k.skOf(r), ...k.spOf(r)].some(x => x === c || x.startsWith(c + '.'))) return false;
    }
    if (f.q) {
      const q = norm(f.q.trim());
      const v = r.values || {};
      const hay = [k.topicOf(r), k.themeOf(r), v.textbookUnit, r.className, k.subjName(r.subjectId)].filter(x => typeof x === 'string');
      if (q && !hay.some(x => norm(x).includes(q))) return false;
    }
    return true;
  }

  const SORTS = {
    date: r => `${r.date || ''} ${r.start || ''}`,
    week: r => String(r.week ?? '').padStart(3, '0') + (r.date || ''),
    subject: r => K().subjCode(r.subjectId) + (r.date || ''),
    class: r => (r.className || '') + (r.date || ''),
    topic: r => K().topicOf(r) || K().themeOf(r) || '',
    status: r => r.status + (r.date || ''),
    updated: r => r.updatedAt || '',
  };

  function render(el, params = {}) {
    const { ui } = RPH;
    if (!K()) { el.appendChild(ui.empty('Kit paparan (dashboard.js) tidak dimuatkan.')); return; }
    const keys = ['status', 'week', 'date', 'subjectId', 'classId', 'year', 'q', 'code'];
    if (keys.some(x => params[x])) {
      st.f = EMPTY(); st.selected.clear(); st.tab = 'rph';
      keys.forEach(x => { if (params[x]) { if (x === 'date') { st.f.from = params.date; st.f.to = params.date; } else st.f[x] = params[x]; } });
      history.replaceState(null, '', '#/rekod');
    }
    if (params.tab === 'sejarah') st.tab = 'history';
    draw(el);
  }

  function draw(el) {
    const { ui } = RPH;
    const hist = S().get('history');
    const nHist = hist && Array.isArray(hist.entries) ? hist.entries.length : 0;
    ui.clear(el);
    add(el, 
      ui.pageHeader('Rekod RPH', 'Cari, tapis dan urus semua RPH tahun akademik aktif.', [ui.button('Jana RPH', { kind: 'primary', icon: 'wand', onClick: () => RPH.router.go('jana') })]),
      ui.tabs([{ id: 'rph', label: `RPH (${S().rphList().length})` }, { id: 'history', label: `Sejarah diimport (${nHist})` }], st.tab, id => { st.tab = id; draw(el); }));
    const body = h('div');
    add(el, body);
    if (st.tab === 'history') drawHistory(body, hist); else drawRph(body, el);
  }

  // ======================================================================
  // RPH
  // ======================================================================
  function drawRph(box, root) {
    const { ui } = RPH; const k = K(); const f = st.f;
    const all = S().rphList();
    const list = all.filter(r => matches(r, f));
    const getter = SORTS[st.sort.key] || SORTS.date;
    list.sort((a, b) => getter(a).localeCompare(getter(b)) * st.sort.dir);
    const ids = new Set(list.map(r => r.id));
    [...st.selected].forEach(id => { if (!S().getRph(id)) st.selected.delete(id); });

    const redraw = () => draw(root);
    // ---- Penapis ----
    const set = (key, v) => { st.f[key] = v; st.limit = 100; redraw(); };
    const weeks = [...new Set(all.map(r => r.week).filter(x => x != null))].sort((a, b) => a - b);
    const years = [...new Set([...S().classes().map(c => c.year), ...all.map(r => r.year)].filter(Boolean))].sort();
    const q = k.smartText({ value: f.q, multiline: false, placeholder: 'Tema / tajuk / kelas…', ariaLabel: 'Cari tema atau tajuk' });
    q.addEventListener('change', () => set('q', q.value));
    q.addEventListener('keydown', e => { if (e.key === 'Enter') set('q', q.value); });
    const code = ui.input({ value: f.code, placeholder: 'cth 2.3 atau 2.3.1', onChange: v => set('code', v) });
    const filters = h('div', { class: 'form-grid rphv-filters' },
      ui.field('Dari tarikh', ui.input({ type: 'date', value: f.from, onChange: v => set('from', v) })),
      ui.field('Hingga tarikh', ui.input({ type: 'date', value: f.to, onChange: v => set('to', v) })),
      ui.field('Minggu', ui.select({ options: weeks.map(w => ({ value: w, label: `Minggu ${w}` })), value: f.week, placeholder: 'Semua minggu', onChange: v => set('week', v) })),
      ui.field('Subjek', ui.select({ options: S().subjects().map(s => ({ value: s.id, label: s.name.ms })), value: f.subjectId, placeholder: 'Semua subjek', onChange: v => set('subjectId', v) })),
      ui.field('Tahun', ui.select({ options: years.map(y => ({ value: y, label: `Tahun ${y}` })), value: f.year, placeholder: 'Semua tahun', onChange: v => set('year', v) })),
      ui.field('Kelas', ui.select({ options: S().classes().map(c => ({ value: c.id, label: c.name })), value: f.classId, placeholder: 'Semua kelas', onChange: v => set('classId', v) })),
      ui.field('Status', ui.select({ options: [...k.statusOptions(), { value: 'tertangguh', label: 'Tertangguh (Ditangguhkan + Dibawa)' }], value: f.status, placeholder: 'Semua status', onChange: v => set('status', v) })),
      ui.field('Kod SK / SP', code),
      ui.field('Tema / Tajuk', q));
    const activeN = Object.values(f).filter(Boolean).length;
    const wide = !window.matchMedia || window.matchMedia('(min-width: 700px)').matches;
    const filterCard = h('details', { class: 'card rphv-filter-card', open: st.fOpen != null ? st.fOpen : (wide || activeN > 0) },
      h('summary', { class: 'rphv-filter-sum' }, ui.icon('search', 16), h('strong', null, 'Carian & penapis'), activeN ? h('span', { class: 'badge badge-gold' }, `${activeN} aktif`) : null,
        h('span', { class: 'spacer' }), activeN ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onClick: e => { e.preventDefault(); st.f = EMPTY(); redraw(); } }, 'Set semula') : null),
      h('div', { class: 'card-body' }, filters));
    filterCard.addEventListener('toggle', () => { st.fOpen = filterCard.open; });

    // ---- Tindakan pukal ----
    const sel = all.filter(r => st.selected.has(r.id)).sort((a, b) => SORTS.date(a).localeCompare(SORTS.date(b)));
    const bulk = sel.length ? bulkBar(sel, redraw) : null;

    // ---- Jadual ----
    let tableEl;
    const ob = RPH.onboarding; const su = ob ? ob.status() : null;
    if (!all.length && su && !su.coreReady) tableEl = ui.empty(`Belum ada RPH. Sediakan takwim, jadual waktu dan subjek dahulu (persediaan ${su.done}/${su.total} selesai), kemudian jana RPH di Dashboard.`,
      h('div', { class: 'row rphv-empty-actions' }, ui.button('Mula di sini', { kind: 'primary', icon: 'list', onClick: () => RPH.router.go('dashboard') }), ob.importButton(null, { label: 'Import Data', size: null })));
    else if (!all.length) tableEl = ui.empty('Belum ada RPH. Mulakan dengan Jana RPH Hari Ini di Dashboard.', ui.button('Ke Dashboard', { kind: 'primary', onClick: () => RPH.router.go('dashboard') }));
    else if (!list.length) tableEl = ui.empty('Tiada RPH sepadan dengan penapis.', ui.button('Set semula penapis', { onClick: () => { st.f = EMPTY(); redraw(); } }));
    else {
      const allBox = h('input', { type: 'checkbox', 'aria-label': 'Pilih semua RPH yang ditapis' });
      const nSel = list.filter(r => st.selected.has(r.id)).length;
      allBox.checked = nSel === list.length; allBox.indeterminate = nSel > 0 && nSel < list.length;
      allBox.addEventListener('change', () => { list.forEach(r => allBox.checked ? st.selected.add(r.id) : st.selected.delete(r.id)); redraw(); });
      const th = (label, key, cls) => {
        if (!key) return h('th', { class: cls }, label);
        const on = st.sort.key === key;
        return h('th', { class: cls, 'aria-sort': on ? (st.sort.dir > 0 ? 'ascending' : 'descending') : 'none' },
          h('button', { type: 'button', class: ['rphv-sort', on ? 'is-on' : ''], onClick: () => { st.sort = { key, dir: on ? -st.sort.dir : (key === 'date' || key === 'updated' ? -1 : 1) }; redraw(); } },
            label, h('span', { class: 'rphv-sort-ind', 'aria-hidden': 'true' }, on ? (st.sort.dir > 0 ? '▲' : '▼') : '↕')));
      };
      const rows = list.slice(0, st.limit).map(r => {
        const cb = h('input', { type: 'checkbox', checked: st.selected.has(r.id), 'aria-label': `Pilih ${k.rphTitle(r)}` });
        cb.addEventListener('change', () => { cb.checked ? st.selected.add(r.id) : st.selected.delete(r.id); redraw(); });
        const sk = k.skOf(r), sp = k.spOf(r);
        const tr = h('tr', { class: ['clickable', st.selected.has(r.id) ? 'is-selected' : ''], tabindex: '0' },
          h('td', { class: 'rphv-col-check', onClick: e => e.stopPropagation() }, cb),
          h('td', { class: 'rphv-nowrap' }, h('strong', null, U.fmtDate(r.date)), h('div', { class: 'slot-sub' }, U.dayNameMs(U.dow(r.date)))),
          h('td', { class: 'num' }, r.week ?? '—'),
          h('td', { class: 'rphv-nowrap' }, r.start ? `${r.start}–${r.end || ''}` : '—'),
          h('td', { class: 'rphv-nowrap' }, k.subjectDot(r.subjectId), k.subjCode(r.subjectId)),
          h('td', { class: 'rphv-nowrap' }, r.className || k.className(r.classId)),
          h('td', { class: 'rphv-col-topic' }, k.topicOf(r) ? k.rtl(k.topicOf(r)) : h('span', { class: 'muted' }, '—'), k.themeOf(r) && k.themeOf(r) !== k.topicOf(r) ? h('div', { class: 'slot-sub' }, k.rtl(k.themeOf(r))) : null),
          h('td', { class: 'rphv-col-codes' }, sk.length ? h('div', null, h('span', { class: 'muted small' }, 'SK '), sk.join(', ')) : null, sp.length ? h('div', null, h('span', { class: 'muted small' }, 'SP '), sp.join(', ')) : null, !sk.length && !sp.length ? h('span', { class: 'muted' }, '—') : null),
          h('td', null, RPH.ui.badge(r.status), r.carriedTo ? h('div', { class: 'slot-sub' }, '→ dibawa') : r.carriedFrom ? h('div', { class: 'slot-sub' }, '← bawaan') : null),
          h('td', { class: 'rphv-nowrap small muted' }, r.updatedAt ? `${U.fmtDate(r.updatedAt.slice(0, 10))} ${new Date(r.updatedAt).toTimeString().slice(0, 5)}` : '—'));
        tr.addEventListener('click', () => RPH.router.go('rph', r.id));
        tr.addEventListener('keydown', e => { if (e.key === 'Enter') RPH.router.go('rph', r.id); });
        return tr;
      });
      tableEl = h('div', { class: 'stack' },
        h('div', { class: 'table-wrap' }, h('table', { class: 'table rphv-table rphv-records' },
          h('thead', null, h('tr', null, h('th', { class: 'rphv-col-check' }, allBox), th('Tarikh', 'date'), th('Mg', 'week', 'num'), h('th', null, 'Masa'), th('Subjek', 'subject'), th('Kelas', 'class'), th('Tema / Tajuk', 'topic'), h('th', null, 'SK / SP'), th('Status', 'status'), th('Dikemas kini', 'updated'))),
          h('tbody', null, rows))),
        list.length > st.limit ? h('div', { class: 'rphv-actions-row' }, ui.button(`Papar lagi (${list.length - st.limit} lagi)`, { onClick: () => { st.limit += 200; redraw(); } })) : null);
    }

    add(box, filterCard,
      h('div', { class: 'rphv-result-line' }, h('span', { class: 'muted small' }, `${list.length} daripada ${all.length} RPH`), [...st.selected].some(id => !ids.has(id)) ? h('span', { class: 'muted small' }, ` · ${st.selected.size} dipilih (termasuk di luar penapis)`) : null),
      bulk, tableEl);
  }

  function bulkBar(sel, redraw) {
    const { ui } = RPH; const k = K();
    const statusSel = ui.select({ options: k.statusOptions(), placeholder: 'Ubah status…', cls: 'input-sm' });
    statusSel.setAttribute('aria-label', 'Ubah status RPH dipilih');
    statusSel.addEventListener('change', async () => {
      const v = statusSel.value; if (!v) return;
      if (!(await ui.confirm({ title: 'Ubah status', message: `Tukar status ${sel.length} RPH kepada "${RPH.ui.STATUS[v][0]}"?` }))) { statusSel.value = ''; return; }
      sel.forEach(r => { const c = U.clone(r); c.status = v; S().saveRph(c); });
      ui.toast(`${sel.length} RPH dikemas kini.`, 'success'); redraw();
    });
    return h('div', { class: 'rphv-bulkbar', role: 'region', 'aria-label': 'Tindakan pukal' },
      h('strong', null, `${sel.length} dipilih`),
      statusSel,
      ui.button('BBM', { size: 'sm', icon: 'layers', onClick: () => bulkBbm(sel, redraw) }),
      ui.button('PAK21', { size: 'sm', icon: 'star', onClick: () => bulkPak21(sel, redraw) }),
      ui.button('Gandakan ke kelas…', { size: 'sm', icon: 'copy', onClick: () => bulkCopy(sel, redraw) }),
      ui.button('DOCX', { size: 'sm', icon: 'download', onClick: () => k.exportDocx(sel) }),
      ui.button('Cetak / PDF', { size: 'sm', icon: 'print', onClick: () => k.printList(sel, { pdf: true }) }),
      ui.button('Padam', { size: 'sm', kind: 'danger', icon: 'trash', onClick: async () => {
        if (!(await ui.confirm({ title: 'Padam RPH', message: `Padam ${sel.length} RPH secara kekal?\nTindakan ini tidak boleh dibatalkan (kecuali melalui Backup).`, confirmLabel: 'Padam', danger: true }))) return;
        sel.forEach(r => S().deleteRph(r.id)); st.selected.clear(); ui.toast(`${sel.length} RPH dipadam.`, 'success'); redraw();
      } }),
      h('span', { class: 'spacer' }),
      ui.button('Kosongkan pilihan', { size: 'sm', kind: 'ghost', icon: 'x', onClick: () => { st.selected.clear(); redraw(); } }));
  }

  /** Medan templat (bbm/pak21) bagi RPH, atau null jika templat tiada medan itu. */
  function fieldOf(r, key) { const tpl = K().template(r); return tpl ? tpl.fields.find(f => f.key === key) || null : null; }

  function bulkBbm(sel, redraw) {
    const { ui } = RPH;
    let chosen = [], mode = 'add';
    const other = ui.input({ placeholder: 'BBM lain (pisahkan dengan koma)' });
    const body = h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, 'Pilih bahan bantu mengajar untuk RPH yang dipilih.'),
      ui.checkboxGroup({ options: RPH.banks.options('bbm', 'ms'), values: [], onChange: v => { chosen = v; } }),
      ui.field('Lain-lain', other),
      RPH.rphKit.segmented([{ value: 'add', label: 'Tambah kepada sedia ada' }, { value: 'replace', label: 'Gantikan' }], mode, v => { mode = v; }, { label: 'Mod' }));
    ui.modal({ title: `Tetapkan BBM (${sel.length} RPH)`, size: 'md', body, actions: [{ label: 'Batal' }, { label: 'Terapkan', kind: 'primary', onClick: () => {
      const extra = other.value.split(',').map(s => s.trim()).filter(Boolean).map(s => `txt:${s}`);
      const vals = [...chosen, ...extra];
      if (!vals.length) { ui.toast('Pilih sekurang-kurangnya satu BBM.'); return false; }
      let n = 0, skip = 0;
      sel.forEach(r => {
        const f = fieldOf(r, 'bbm'); if (!f) { skip++; return; }
        const c = U.clone(r); c.values = c.values || {};
        if (f.type === 'select') c.values.bbm = vals[0];
        else c.values.bbm = mode === 'add' ? [...new Set([...K().arr(c.values.bbm), ...vals])] : vals;
        S().saveRph(c); n++;
      });
      ui.toast(`BBM dikemas kini untuk ${n} RPH${skip ? ` (${skip} dilangkau: templat tiada medan BBM)` : ''}.`, 'success'); redraw();
    } }] });
  }

  function bulkPak21(sel, redraw) {
    const { ui } = RPH;
    const s = ui.select({ options: RPH.banks.options('pak21', 'name (ms)'), placeholder: '— Pilih aktiviti PAK21 —' });
    ui.modal({ title: `Tetapkan PAK21 (${sel.length} RPH)`, size: 'sm', body: ui.field('Pendekatan PAK21', s), actions: [{ label: 'Batal' }, { label: 'Terapkan', kind: 'primary', onClick: () => {
      if (!s.value) { ui.toast('Pilih aktiviti PAK21.'); return false; }
      let n = 0, skip = 0;
      sel.forEach(r => {
        const f = fieldOf(r, 'pak21'); if (!f) { skip++; return; }
        const c = U.clone(r); c.values = c.values || {};
        c.values.pak21 = f.type === 'select' ? s.value : [...new Set([...K().arr(c.values.pak21), s.value])];
        S().saveRph(c); n++;
      });
      ui.toast(`PAK21 dikemas kini untuk ${n} RPH${skip ? ` (${skip} dilangkau)` : ''}.`, 'success'); redraw();
    } }] });
  }

  function bulkCopy(sel, redraw) {
    const { ui } = RPH; const k = K();
    let chosen = [];
    const years = new Set(sel.map(r => r.year));
    const body = h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, 'SK, SP, objektif, aktiviti dan pentaksiran disalin. Refleksi, TP dan kehadiran diset semula. Masa dipadankan dengan slot kelas sasaran dalam minggu yang sama jika ada.'),
      ui.checkboxGroup({ options: S().classes().map(c => ({ value: c.id, label: `${c.name}${years.has(c.year) ? '' : ' (tahun berbeza)'}` })), values: [], onChange: v => { chosen = v; } }));
    ui.modal({ title: `Gandakan ${sel.length} RPH ke kelas lain`, size: 'md', body, actions: [{ label: 'Batal' }, { label: 'Gandakan', kind: 'primary', icon: 'copy', onClick: () => {
      if (!chosen.length) { ui.toast('Pilih sekurang-kurangnya satu kelas.'); return false; }
      let n = 0;
      sel.forEach(r => chosen.forEach(cid => { if (cid !== r.classId) { k.copyToClass(r, cid); n++; } }));
      ui.toast(`${n} RPH baharu dicipta (status Draft).`, 'success'); st.selected.clear(); redraw();
    } }] });
  }

  // ======================================================================
  // SEJARAH DIIMPORT (baca sahaja)
  // ======================================================================
  function drawHistory(box, hist) {
    const { ui } = RPH; const k = K();
    const entries = hist && Array.isArray(hist.entries) ? hist.entries : [];
    if (!entries.length) { add(box, ui.empty('Tiada sejarah RPH diimport untuk tahun akademik ini. Sejarah RPH lama dimuatkan bersama backup/pakej (Tetapan → Data → Restore Backup).')); return; }
    const q = k.smartText({ value: st.hq, multiline: false, placeholder: 'Cari kelas, tajuk, kod…', ariaLabel: 'Cari sejarah' });
    const tbody = h('tbody');
    const fill = () => {
      ui.clear(tbody);
      const qq = norm(st.hq.trim());
      entries.filter(e => !qq || [e.class, e.topic, e.domain, (e.sk || []).join(' '), (e.sp || []).join(' '), k.subjName(e.subjectId)].some(x => norm(x).includes(qq)))
        .forEach(e => add(tbody, h('tr', null,
          h('td', { class: 'num' }, e.week ?? '—'),
          h('td', { class: 'rphv-nowrap' }, U.fmtDate(e.date), h('div', { class: 'slot-sub' }, e.date ? U.dayNameMs(U.dow(e.date)) : '')),
          h('td', { class: 'rphv-nowrap' }, k.subjectDot(e.subjectId), k.subjCode(e.subjectId), ' ', e.class || ''),
          h('td', { class: 'rphv-col-topic' }, e.topic ? k.rtl(e.topic) : '—', e.domain ? h('div', { class: 'slot-sub' }, k.rtl(e.domain)) : null),
          h('td', { class: 'rphv-col-codes' }, (e.sk || []).length ? h('div', null, h('span', { class: 'muted small' }, 'SK '), e.sk.join(', ')) : null, (e.sp || []).length ? h('div', null, h('span', { class: 'muted small' }, 'SP '), e.sp.join(', ')) : null),
          h('td', null, e.status ? RPH.ui.badge(e.status) : '—', e.postponementReason ? h('div', { class: 'slot-sub' }, e.postponementReason) : null),
          h('td', { class: 'small' }, e.source || '', (e.checks || []).length ? h('div', { class: 'rphv-hist-check' }, RPH.ui.icon('alert', 13), ' ', e.checks.join('; ')) : null))));
      if (!tbody.childNodes.length) add(tbody, h('tr', null, h('td', { colspan: '7', class: 'muted' }, 'Tiada padanan.')));
    };
    q.addEventListener('input', () => { st.hq = q.value; fill(); });
    fill();
    add(box, 
      k.notice(`Sejarah ini dibaca sahaja — inventori RPH sebenar guru${hist.note ? ' (' + hist.note + ')' : ''}. Digunakan untuk rujukan dan Kemajuan DSKP.`, 'info'),
      h('div', { class: 'rphv-toolbar rphv-hist-tools' }, q, h('span', { class: 'muted small' }, `${entries.length} rekod`)),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table rphv-table' },
        h('thead', null, h('tr', null, h('th', { class: 'num' }, 'Mg'), h('th', null, 'Tarikh'), h('th', null, 'Subjek / Kelas'), h('th', null, 'Tajuk / Bidang'), h('th', null, 'SK / SP'), h('th', null, 'Status'), h('th', null, 'Sumber / Semakan'))),
        tbody)));
  }

  RPH.views.records = RPH.views.rekod = { title: 'Rekod RPH', icon: 'list', render };
})(window.RPH = window.RPH || {});
