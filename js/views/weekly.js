/* Paparan RPH Mingguan (#/mingguan, master prompt §45): grid minggu sekolah, jana slot yang belum ada,
   pratonton & eksport minggu (DOCX / Cetak / PDF). */
(function (RPH) {
  'use strict';
  const U = RPH.util;
  const h = (...a) => RPH.ui.h(...a);
  /** Tambah anak (rata, langkau null/false) — Element.append() asli menukar null kepada teks "null". */
  const add = (el, ...kids) => RPH.ui.append(el, kids);
  const S = () => RPH.store;
  const K = () => RPH.rphKit;
  let currentWeek = null;
  let weekUndo = null; // { wk, label, before: [rph…] } — "Buat asal" jana semula minggu (keputusan guru 2026-10-02)

  // ---------- Jana semula minggu ----------
  const REGEN_PARTS = [
    { part: 'all', label: 'Semua kandungan', hint: 'Objektif, kriteria, aktiviti, BBM, PAK21, KBAT, pentaksiran & pembezaan baharu' },
    { part: 'objectives', label: 'Objektif' }, { part: 'activities', label: 'Aktiviti' },
    { part: 'successCriteria', label: 'Kriteria Kejayaan' }, { part: 'reflection', label: 'Refleksi' },
  ];
  const KEEP = ['id', 'date', 'start', 'end', 'classId', 'className', 'year', 'subjectId', 'status', 'carriedFrom', 'carriedTo', 'createdAt', 'templateId', 'variant', 'week', 'rptWeek', 'slotId', 'timetableVersionId'];
  /** Jana semula satu RPH — SK/SP, metadata & provenans dikekalkan (§50, sama seperti editor). */
  function regenOne(r, part) {
    const before = U.clone(r);
    const out = RPH.gen.regenerate(U.clone(r), part);
    if (!out || typeof out !== 'object' || !out.values) throw new Error('Penjana tidak memulangkan RPH yang sah');
    ['contentStandards', 'learningStandards'].forEach(key => { if (key in before.values) out.values[key] = before.values[key]; else delete out.values[key]; });
    KEEP.forEach(key => { if (key in before) out[key] = before[key]; });
    out.provenance = before.provenance;
    return out;
  }
  /** Menu jana semula bagi RPH minggu `wk`. after() dipanggil selepas selesai (cth. buka semula pratonton). */
  function regenWeekMenu(el, wk, after) {
    const { ui } = RPH; const k = K();
    if (!k.has('gen.regenerate')) { ui.toast('Modul penjana belum tersedia.', 'error'); return; }
    const all = S().rphList({ week: wk });
    const drafts = all.filter(r => r.status === 'draft');
    if (!all.length) { ui.toast('Tiada RPH dalam minggu ini.', 'info'); return; }
    let scope = drafts.length ? 'draft' : 'all';
    const radio = (val, label, n) => { const inp = h('input', { type: 'radio', name: 'rphv-regen-scope', value: val, checked: scope === val, disabled: !n }); inp.addEventListener('change', () => { scope = val; showWarn(); }); return h('label', { class: 'check' }, inp, h('span', null, `${label} (${n})`)); };
    const warn = h('div', { class: 'notice small' }, ui.icon('alert', 16), h('span', null, 'RPH berstatus Siap/Selesai/lain-lain yang telah anda sunting juga akan digantikan. Butang "Buat asal" tersedia selepas itu.'));
    const showWarn = () => { warn.style.display = scope === 'all' && all.length !== drafts.length ? '' : 'none'; };
    showWarn();
    let m = null;
    const pick = x => {
      m.close();
      const list = scope === 'draft' ? drafts : all;
      const before = list.map(r => U.clone(r)); let n = 0; const errs = [];
      for (const r of list) { try { S().saveRph(regenOne(r, x.part)); n++; } catch (e) { errs.push(`${r.className || ''} ${r.date}: ${e.message}`); } }
      weekUndo = n ? { wk, label: x.label, before: before.filter(b => !errs.some(e => e.startsWith(`${b.className || ''} ${b.date}`))) } : weekUndo;
      if (errs.length) ui.toast(`${errs.length} RPH gagal dijana semula: ${errs[0]}`, 'error', 7000);
      if (n) ui.toast(`${x.label} dijana semula bagi ${n} RPH Minggu ${wk}. SK/SP tidak diubah.`, 'success', 5000);
      render(el, {});
      if (after) after();
    };
    m = ui.modal({ title: `Jana semula RPH Minggu ${wk}`, size: 'sm', body: h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, 'SK, SP, tema, topik dan bilangan murid tidak diubah. Anda boleh tekan "Buat asal" selepas itu.'),
      h('div', { class: 'stack rphv-regen-scope' }, h('strong', { class: 'small' }, 'RPH yang dijana semula'), radio('draft', 'RPH Draf sahaja', drafts.length), radio('all', 'Semua RPH minggu ini', all.length), warn),
      h('div', { class: 'rphv-regen-list' }, REGEN_PARTS.map(x => h('button', { type: 'button', class: ['btn', x.part === 'all' ? 'btn-gold' : ''], onClick: () => pick(x) },
        ui.icon(x.part === 'all' ? 'wand' : 'refresh', 16), h('span', null, h('strong', null, x.label), x.hint ? h('span', { class: 'muted small rphv-regen-hint' }, x.hint) : null))))),
      actions: [{ label: 'Batal' }] });
  }
  function undoWeek(el) {
    if (!weekUndo) return;
    const { wk, label, before } = weekUndo; weekUndo = null;
    let n = 0; for (const r of before) { try { S().saveRph(r); n++; } catch (e) { RPH.reportError('buat asal', e); } }
    RPH.ui.toast(`Jana semula "${label}" Minggu ${wk} dibatalkan (${n} RPH dipulihkan).`, 'info', 5000);
    render(el, {});
  }

  function render(el, params = {}) {
    const { ui } = RPH; const k = K();
    if (!k) { el.appendChild(ui.empty('Kit paparan (dashboard.js) tidak dimuatkan.')); return; }
    const weeks = RPH.cal.weeks();
    if (params.week && RPH.cal.week(+params.week)) currentWeek = +params.week;
    if (currentWeek == null || !RPH.cal.week(currentWeek)) currentWeek = k.weekFor(RPH.cal.today());
    if (currentWeek == null || !weeks.length) {
      ui.clear(el);
      const ob = RPH.onboarding;
      add(el, ui.pageHeader('RPH Mingguan'), ui.empty('Takwim tahun akademik ini belum mempunyai minggu sekolah. Import takwim sekolah anda atau tetapkan di Takwim.',
        h('div', { class: 'row rphv-empty-actions' },
          ob ? ob.importButton('takwim', { label: 'Import Takwim', kind: 'primary', size: null }) : null,
          ui.button('Buka Takwim', { kind: ob && ob.hasImportView() ? null : 'primary', onClick: () => RPH.router.go('takwim') }),
          ob ? ui.button('Mula di sini', { icon: 'list', onClick: () => RPH.router.go('dashboard', null, { setup: 1 }) }) : null)));
      return;
    }
    const wk = currentWeek;
    const w = RPH.cal.week(wk);
    const idx = weeks.findIndex(x => x.week === wk);
    const go = n => { currentWeek = n; history.replaceState(null, '', `#/mingguan?week=${n}`); render(el, {}); };

    // ---- Data minggu ----
    const today = RPH.cal.today();
    const dates = RPH.cal.weekDates(wk);
    const days = dates.map(date => {
      const ds = k.dayStatus(date);
      const items = k.plan(date);
      return { date, ds, items };
    }).filter(d => (d.ds.day.dow >= 1 && d.ds.day.dow <= 5) || (d.ds.kind === 'school' && d.items.length));
    const schoolItems = days.filter(d => d.ds.kind === 'school').flatMap(d => d.items);
    const missingItems = schoolItems.filter(it => !it.rph);
    const weekRphs = S().rphList({ week: wk });
    const counts = U.groupBy(weekRphs, r => r.status);

    // ---- Kepala ----
    const btnGen = ui.button(`Jana RPH Mingguan${missingItems.length ? ` (${missingItems.length})` : ''}`, { kind: 'gold', icon: 'wand', disabled: !missingItems.length || !k.has('gen.generate'),
      onClick: async () => {
        if (!(await ui.confirm({ title: 'Jana RPH Mingguan', message: `Jana draf RPH untuk ${missingItems.length} slot yang belum ada RPH dalam Minggu ${wk}?\nRPH sedia ada tidak diubah.`, confirmLabel: 'Jana' }))) return;
        const res = k.generate(missingItems); k.reportGenerate(res); render(el, {});
      } });
    if (!k.has('gen.generate')) btnGen.title = 'Modul penjana (generator.js) belum tersedia';
    const btnRegen = ui.button('Jana semula', { icon: 'refresh', disabled: !weekRphs.length || !k.has('gen.regenerate'), title: 'Jana semula kandungan RPH minggu ini (SK/SP tidak diubah)', onClick: () => regenWeekMenu(el, wk) });
    const btnUndo = weekUndo && weekUndo.wk === wk ? ui.button(`Buat asal: ${weekUndo.label}`, { kind: 'ghost', icon: 'refresh', onClick: () => undoWeek(el) }) : null;
    const btnPrev = ui.button('Pratonton', { icon: 'eye', disabled: !weekRphs.length, onClick: () => previewWeek(weekRphs, wk, el) });
    const btnDocx = ui.button('DOCX', { icon: 'download', disabled: !weekRphs.length, onClick: () => k.exportDocx(weekRphs, k.fileName(weekRphs, 'docx')) });
    const btnPrint = ui.button('Cetak / PDF', { icon: 'print', disabled: !weekRphs.length, onClick: () => k.printList(weekRphs, { title: k.fileName(weekRphs, 'pdf').replace(/\.pdf$/, ''), pdf: true }) });

    const weekSel = ui.select({ options: weeks.map(x => ({ value: x.week, label: `Minggu ${x.week} · ${U.fmtDate(x.start, 'D/M/YYYY').replace(/\/\d{4}$/, '')}–${U.fmtDate(x.end, 'D/M/YYYY').replace(/\/\d{4}$/, '')}` })), value: wk, cls: 'rphv-week-select', onChange: v => go(+v) });
    weekSel.setAttribute('aria-label', 'Pilih minggu sekolah');
    const nav = h('div', { class: 'rphv-datenav' },
      h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': 'Minggu sebelumnya', disabled: idx <= 0, onClick: () => go(weeks[idx - 1].week) }, ui.icon('left', 16)),
      weekSel,
      h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': 'Minggu berikutnya', disabled: idx >= weeks.length - 1, onClick: () => go(weeks[idx + 1].week) }, ui.icon('right', 16)),
      ui.button('Minggu ini', { size: 'sm', onClick: () => go(k.weekFor(today)) }));

    const haveN = schoolItems.length - missingItems.length;
    const summary = h('div', { class: 'rphv-week-summary' },
      h('div', { class: 'rphv-week-progress' },
        h('div', { class: 'rphv-week-progress-label' }, h('strong', null, `${haveN}/${schoolItems.length}`), h('span', { class: 'muted small' }, ' slot mempunyai RPH')),
        h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': schoolItems.length, 'aria-valuenow': haveN },
          h('span', { style: { width: `${schoolItems.length ? Math.round(haveN / schoolItems.length * 100) : 0}%` } }))),
      h('div', { class: 'pill-list' }, Object.keys(RPH.ui.STATUS).filter(s => counts[s]).map(s => RPH.ui.badge(s, `${RPH.ui.STATUS[s][0]} ${counts[s].length}`))),
      w.term ? h('span', { class: 'muted small' }, `Penggal ${w.term} · minggu KPM ${w.kpmWeek ?? '—'} · RPT ${RPH.cal.rptWeek(wk) ?? '—'}`) : null);

    // ---- Grid hari ----
    const grid = h('div', { class: 'rphv-week-grid', style: { '--days': String(days.length) } }, days.map(d => dayColumn(d, today, el)));

    // ---- RPH luar jadual minggu ini ----
    const slotIds = new Set(schoolItems.filter(it => it.rph).map(it => it.rph.id));
    days.forEach(d => d.items.forEach(it => it.rph && slotIds.add(it.rph.id)));
    const extra = weekRphs.filter(r => !slotIds.has(r.id));

    ui.clear(el);
    add(el, 
      ui.pageHeader('RPH Mingguan', k.weekLabel(wk), [btnGen, btnRegen, btnUndo, btnPrev, btnDocx, btnPrint].filter(Boolean)),
      k.has('gen.generate') ? null : k.missing('gen.generate'),
      RPH.onboarding ? RPH.onboarding.gapNotice(['jadual', 'subjek'], 'slot PdP minggu ini tidak dapat dirancang') : null,
      h('div', { class: 'card rphv-week-head' }, h('div', { class: 'card-body rphv-toolbar' }, nav, summary)),
      grid,
      extra.length ? RPH.ui.card({ cls: 'rphv-card', title: 'RPH lain dalam minggu ini', subtitle: 'Dicipta secara manual atau di luar slot jadual', body: h('div', { class: 'rphv-mini-list' }, extra.map(r => h('a', { class: 'rphv-mini', href: `#/rph/${encodeURIComponent(r.id)}` },
        k.subjectDot(r.subjectId), h('span', { class: 'rphv-mini-main' }, h('strong', null, `${k.subjCode(r.subjectId)} ${r.className || ''}`), h('span', { class: 'muted small' }, ` · ${k.dateShort(r.date)} ${r.start || ''}`)), RPH.ui.badge(r.status)))) }) : null);
  }

  function dayColumn(d, today, el) {
    const { ui } = RPH; const k = K();
    const off = d.ds.kind !== 'school';
    const dow = U.dow(d.date);
    return h('section', { class: ['rphv-wday', off ? 'is-off' : '', d.date === today ? 'is-today' : ''], 'aria-label': k.dateLong(d.date) },
      h('header', { class: 'rphv-wday-head' },
        h('div', null, h('strong', null, U.dayNameMs(dow)), h('span', { class: 'muted small' }, ` ${U.fmtDate(d.date, 'D/M/YYYY').replace(/\/\d{4}$/, '')}`)),
        d.date === today ? h('span', { class: 'badge badge-gold' }, 'Hari ini') : null),
      off ? h('div', { class: 'rphv-wday-off' }, ui.icon('info', 14), h('span', null, d.ds.label)) : null,
      (d.ds.day.events || []).filter(e => e.kind !== 'sabtu-3').length ? h('div', { class: 'rphv-wday-events' }, d.ds.day.events.filter(e => e.kind !== 'sabtu-3').map(e => h('span', { class: 'rphv-wday-event' }, e.title))) : null,
      h('div', { class: 'rphv-wday-slots' },
        d.items.length ? d.items.map(it => slotCard(it, off, el)) : h('p', { class: 'muted small rphv-wday-empty' }, 'Tiada slot PdP')));
  }

  function slotCard(it, off, el) {
    const { ui } = RPH; const k = K(); const s = it.slot; const r = it.rph;
    const open = () => { if (r) RPH.router.go('rph', r.id); };
    const card = h(r ? 'a' : 'div', { class: ['rphv-wslot', r ? 'has-rph' : 'no-rph', off ? 'is-off' : ''], style: { '--subj': k.subjColor(s.subjectId) }, href: r ? `#/rph/${encodeURIComponent(r.id)}` : null },
      h('div', { class: 'rphv-wslot-top' }, h('span', { class: 'rphv-wslot-time' }, `${s.start || '—'}${s.end ? '–' + s.end : ''}`), r ? ui.badge(r.status) : null),
      h('div', { class: 'rphv-wslot-title' }, k.subjectDot(s.subjectId), h('strong', null, s.className || k.className(s.classId)), h('span', { class: 'muted' }, ` ${k.subjCode(s.subjectId)}`)),
      r && (k.topicOf(r) || k.themeOf(r)) ? h('div', { class: 'rphv-wslot-topic' }, k.rtl(k.topicOf(r) || k.themeOf(r))) :
        !r && it.rptLesson ? h('div', { class: 'rphv-wslot-topic is-rpt' }, k.rtl(k.lessonLabel(it.rptLesson))) : null,
      !r && !off ? h('div', { class: 'rphv-wslot-foot' }, h('span', { class: 'muted small' }, 'Belum ada RPH'),
        ui.button('Jana', { size: 'sm', icon: 'wand', disabled: !k.has('gen.generate'), onClick: e => { e.preventDefault(); const res = k.generate([it]); k.reportGenerate(res); render(el, {}); } })) : null,
      !r && off ? h('div', { class: 'rphv-wslot-foot muted small' }, 'Tiada PdP (cuti)') : null);
    if (r) card.addEventListener('keydown', e => { if (e.key === ' ') { e.preventDefault(); open(); } });
    return card;
  }

  function previewWeek(list, wk, el) {
    const { ui } = RPH; const k = K();
    let content;
    try {
      if (k.has('render.week')) content = RPH.render.week(list);
      else if (k.has('render.rph')) content = h('div', { class: 'rphv-preview-stack' }, list.map(r => wrapA4(RPH.render.rph(r, { mode: 'preview', variant: r.variant }))));
      else content = k.missing('render.week');
    } catch (e) { RPH.reportError('pratonton minggu', e); content = ui.empty(`Pratonton gagal: ${e.message}`); }
    const pv = ui.modal({ title: `Pratonton RPH Minggu ${wk} (${list.length} RPH)`, size: 'xl', body: h('div', { class: 'rphv-preview' }, content),
      actions: [
        // Jana semula terus dari pratonton; pratonton dibuka semula dengan hasil baharu.
        ...(el && k.has('gen.regenerate') ? [{ label: 'Jana semula', icon: 'refresh', onClick: () => { pv.close(); regenWeekMenu(el, wk, () => previewWeek(S().rphList({ week: wk }), wk, el)); return false; } }] : []),
        { label: 'DOCX', icon: 'download', onClick: () => { k.exportDocx(list, k.fileName(list, 'docx')); return false; } },
        { label: 'Cetak / PDF', icon: 'print', kind: 'primary', onClick: () => { k.printList(list, { pdf: true }); return false; } }] });
  }
  function wrapA4(node) { return node && node.classList && (node.classList.contains('a4') || node.classList.contains('rph-doc') || node.querySelector('.a4')) ? node : h('div', { class: 'a4' }, node); }

  RPH.views.weekly = RPH.views.mingguan = { title: 'RPH Mingguan', icon: 'week', render };
})(window.RPH = window.RPH || {});
