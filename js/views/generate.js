/* Paparan Jana RPH (#/jana): Automatik ikut jadual (§21) + Manual (§22). */
(function (RPH) {
  'use strict';
  const U = RPH.util;
  const h = (...a) => RPH.ui.h(...a);
  /** Tambah anak (rata, langkau null/false) — Element.append() asli menukar null kepada teks "null". */
  const add = (el, ...kids) => RPH.ui.append(el, kids);
  const S = () => RPH.store;
  const K = () => RPH.rphKit;
  const VARIANT_LABEL = { compact: 'Ringkas', standard: 'Standard', detailed: 'Terperinci' };

  const state = { tab: 'auto', date: null, selected: new Set(), manual: null };
  const slotKey = it => `${it.date}|${it.slot.id || it.slot.classId + it.slot.start}`;

  function render(el, params = {}) {
    const { ui } = RPH;
    if (!K()) { el.appendChild(ui.empty('Kit paparan (dashboard.js) tidak dimuatkan.')); return; }
    if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) { if (state.date !== params.date) state.selected.clear(); state.date = params.date; }
    if (params.tab === 'manual' || params.tab === 'auto') state.tab = params.tab;
    if (!state.date) state.date = RPH.cal.today();

    const body = h('div', { class: 'rphv-gen-body' });
    const draw = () => {
      ui.clear(el);
      add(el, 
        ui.pageHeader('Jana RPH', 'Jana draf RPH secara automatik ikut jadual waktu, atau rancang secara manual.'),
        ui.tabs([{ id: 'auto', label: 'Automatik (ikut jadual)' }, { id: 'manual', label: 'Manual' }], state.tab, id => { state.tab = id; draw(); }),
        body);
      ui.clear(body);
      if (state.tab === 'auto') renderAuto(body, draw); else renderManual(body);
    };
    draw();
  }

  // ======================================================================
  // AUTOMATIK
  // ======================================================================
  function renderAuto(box, redraw) {
    const { ui } = RPH; const k = K();
    const date = state.date;
    const ds = k.dayStatus(date);
    const items = k.plan(date);
    const wk = RPH.cal.schoolWeek(date);
    const keys = new Set(items.map(slotKey));
    [...state.selected].forEach(x => { if (!keys.has(x)) state.selected.delete(x); });

    const setDate = d => { if (!d) return; state.date = d; state.selected.clear(); history.replaceState(null, '', `#/jana?date=${d}`); redraw(); };
    const dateInput = ui.input({ type: 'date', value: date, onChange: v => setDate(v), cls: 'rphv-date-input', 'aria-label': 'Tarikh' });
    const controls = h('div', { class: 'rphv-toolbar' },
      h('div', { class: 'rphv-datenav' },
        h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': 'Hari sebelumnya', onClick: () => setDate(U.addDays(date, -1)) }, ui.icon('left', 16)),
        dateInput,
        h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': 'Hari berikutnya', onClick: () => setDate(U.addDays(date, 1)) }, ui.icon('right', 16)),
        ui.button('Hari ini', { size: 'sm', onClick: () => setDate(RPH.cal.today()) })),
      h('div', { class: 'rphv-dayinfo' },
        h('strong', null, k.dateLong(date)),
        wk != null ? h('span', { class: 'badge badge-gold' }, `Minggu ${wk}${RPH.cal.rptWeek(wk) !== wk ? ' · RPT ' + RPH.cal.rptWeek(wk) : ''}`) : null,
        h('span', { class: ['badge', ds.kind === 'school' ? 'badge-green' : ds.kind === 'holiday' ? 'badge-red' : 'badge-slate'] }, ds.kind === 'holiday' ? ds.label : ds.short),
        (ds.day.events || []).map(e => h('span', { class: 'badge badge-violet' }, e.title))));

    const pending = items.filter(it => !it.rph);
    const selectable = it => !it.rph;
    const genBtnSel = ui.button(`Jana yang dipilih (${state.selected.size})`, { kind: 'primary', icon: 'wand', disabled: !state.selected.size || !k.has('gen.generate'),
      onClick: () => doGenerate(items.filter(it => state.selected.has(slotKey(it)) && !it.rph)) });
    const genBtnAll = ui.button(`Jana semua yang belum ada (${pending.length})`, { kind: 'gold', icon: 'wand', disabled: !pending.length || !k.has('gen.generate'),
      onClick: async () => {
        const off = pending.filter(it => it.holiday);
        if (off.length && !(await ui.confirm({ title: 'Bukan hari persekolahan', message: `${ds.label}.\nJana juga ${pending.length} RPH?`, confirmLabel: 'Jana juga' }))) return;
        doGenerate(pending);
      } });
    const doGenerate = list => {
      if (!list.length) { ui.toast('Pilih sekurang-kurangnya satu slot yang belum ada RPH.'); return; }
      const res = k.generate(list); k.reportGenerate(res);
      state.selected.clear();
      if (res.created.length === 1) { RPH.router.go('rph', res.created[0].id); return; }
      redraw();
    };

    let table;
    if (!items.length) {
      table = h('div', { class: 'empty' }, ui.icon('calendar', 28),
        h('p', null, ds.kind === 'school' ? 'Tiada slot PdP dalam jadual untuk hari ini.' : `${ds.label}. Tiada slot PdP dalam jadual.`),
        h('p', { class: 'small muted' }, 'Gunakan tab Manual untuk merancang RPH di luar jadual.'));
    } else {
      const allBox = h('input', { type: 'checkbox', 'aria-label': 'Pilih semua slot yang belum ada RPH' });
      const sel = items.filter(selectable);
      allBox.checked = sel.length > 0 && sel.every(it => state.selected.has(slotKey(it)));
      allBox.indeterminate = !allBox.checked && sel.some(it => state.selected.has(slotKey(it)));
      allBox.addEventListener('change', () => { sel.forEach(it => allBox.checked ? state.selected.add(slotKey(it)) : state.selected.delete(slotKey(it))); redraw(); });
      table = h('div', { class: 'table-wrap' }, h('table', { class: 'table rphv-table' },
        h('thead', null, h('tr', null, h('th', { class: 'rphv-col-check' }, allBox), h('th', null, 'Masa'), h('th', null, 'Kelas'), h('th', null, 'Subjek'), h('th', null, 'Pelajaran RPT'), h('th', null, 'RPH'), h('th', null, ''))),
        h('tbody', null, items.map(it => {
          const key = slotKey(it); const s = it.slot;
          const cb = h('input', { type: 'checkbox', checked: state.selected.has(key), disabled: !!it.rph, 'aria-label': `Pilih ${s.className} ${s.start}` });
          cb.addEventListener('change', () => { cb.checked ? state.selected.add(key) : state.selected.delete(key); redraw(); });
          return h('tr', { class: [it.holiday ? 'rphv-row-off' : '', it.rph ? 'rphv-row-done' : ''] },
            h('td', { class: 'rphv-col-check' }, cb),
            h('td', { class: 'rphv-nowrap' }, h('strong', null, s.start || '—'), h('div', { class: 'slot-sub' }, s.end ? `${s.end} · ${s.minutes || U.minutesBetween(s.start, s.end)} min` : '')),
            h('td', { class: 'rphv-nowrap' }, s.className || k.className(s.classId), (s.coTeachers || []).length ? h('div', { class: 'slot-sub' }, `bersama ${s.coTeachers.join(', ')}`) : null),
            h('td', null, k.subjectTag(s.subjectId)),
            h('td', { class: 'rphv-col-lesson' }, it.rptLesson ? k.rtl(k.lessonLabel(it.rptLesson)) : h('span', { class: 'muted small' }, it.holiday ? it.holiday : 'Tiada padanan RPT')),
            h('td', null, it.rph ? RPH.ui.badge(it.rph.status) : h('span', { class: 'badge badge-slate rphv-badge-empty' }, 'Belum ada')),
            h('td', { class: 'rphv-nowrap' }, it.rph
              ? ui.button('Buka', { size: 'sm', icon: 'edit', onClick: () => RPH.router.go('rph', it.rph.id) })
              : ui.button('Jana', { size: 'sm', icon: 'wand', disabled: !k.has('gen.generate'), onClick: () => doGenerate([it]) })));
        }))));
    }

    add(box, 
      k.has('gen.generate') ? null : k.missing('gen.generate', 'Gunakan tab Manual untuk mencipta RPH kosong.'),
      RPH.onboarding ? RPH.onboarding.gapNotice(['takwim', 'jadual', 'subjek'], 'slot PdP tidak dapat dirancang secara automatik') : null,
      ui.card({ cls: 'rphv-card', body: h('div', { class: 'stack' }, controls, table, items.length ? h('div', { class: 'rphv-actions-row' }, genBtnSel, genBtnAll,
        h('span', { class: 'muted small' }, `${items.length - pending.length}/${items.length} slot sudah ada RPH`)) : null) }));
  }

  // ======================================================================
  // MANUAL (§22)
  // ======================================================================
  /** Slot jadual pertama (hari ini dahulu, kemudian versi jadual semasa) bagi subjek pilihan. */
  function firstSlot(subjectId, date) {
    const pick = list => list.find(s => s.kind === 'PdP' && (!subjectId || s.subjectId === subjectId)) || null;
    const v = RPH.cal.timetableVersionFor(date || RPH.cal.today());
    return pick(date ? RPH.cal.slotsFor(date) : []) || (v ? pick(v.slots || []) : null);
  }
  function defaultsManual() {
    const today = RPH.cal.today();
    const date = state.date || today;
    const sl = firstSlot(null, date);
    const subs = S().subjects();
    const s = (sl && k0().subj(sl.subjectId)) || subs[0] || { id: '', years: [] };
    const classes = S().classes();
    const year = sl ? sl.year : ((classes.find(c => (s.years || []).includes(c.year)) || {}).year || (s.years || [])[0] || null);
    const cls = sl ? classes.find(c => c.id === sl.classId) : classes.find(c => c.year === year);
    return { subjectId: s.id, year, classId: cls ? cls.id : '', date, start: '', end: '', timesTouched: false,
      templateId: s.defaultTemplateId || 'tpl-generic-kpm', variant: '', theme: '', topic: '', sk: [], sp: [], skFilter: '' };
  }
  const k0 = () => RPH.rphKit;

  function renderManual(box) {
    const { ui } = RPH; const k = K();
    const m = state.manual || (state.manual = defaultsManual());
    const curr = RPH.curr;

    const redraw = () => { ui.clear(box); renderManual(box); };
    const subject = k.subj(m.subjectId) || {};
    const tplOptions = S().templates().filter(t => (t.subjectIds || []).includes(m.subjectId) || (t.subjectIds || []).includes('*'));
    if (!tplOptions.some(t => t.id === m.templateId)) m.templateId = subject.defaultTemplateId || (tplOptions[0] && tplOptions[0].id) || '';
    const tpl = S().template(m.templateId);
    const variants = tpl ? Object.keys(tpl.variants || {}) : [];
    if (!variants.includes(m.variant)) m.variant = (tpl && tpl.defaultVariant) || variants[0] || 'standard';
    const classes = S().classes().filter(c => !m.year || c.year === +m.year);
    if (m.classId && !classes.some(c => c.id === m.classId)) m.classId = classes[0] ? classes[0].id : '';

    // Slot jadual yang sepadan (isi masa automatik).
    const daySlots = m.date ? RPH.cal.slotsFor(m.date) : [];
    const match = daySlots.find(s => s.classId === m.classId && s.subjectId === m.subjectId) || null;
    if (match && !m.timesTouched) { m.start = match.start || ''; m.end = match.end || ''; }

    const hasCurr = !!S().curriculum(m.subjectId, m.year);
    const themes = hasCurr ? curr.themes(m.subjectId, m.year) : [];

    // ---- Medan asas ----
    const fSubject = ui.select({ options: S().subjects().map(s => ({ value: s.id, label: `${s.name.ms} (${s.code})` })), value: m.subjectId,
      onChange: v => { const s = k.subj(v) || {}; m.subjectId = v; m.templateId = s.defaultTemplateId || ''; m.sk = []; m.sp = []; m.theme = '';
        const sl = firstSlot(v, m.date);
        if (sl) { m.year = sl.year; m.classId = sl.classId; }
        else if (!(s.years || []).includes(+m.year)) m.year = (S().classes().find(c => (s.years || []).includes(c.year)) || {}).year || (s.years || [])[0] || null;
        m.timesTouched = false; redraw(); } });
    const fYear = ui.select({ options: (subject.years || [1, 2, 3, 4, 5, 6]).map(y => ({ value: y, label: `Tahun ${y}` })), value: m.year,
      onChange: v => { m.year = +v; m.sk = []; m.sp = []; m.classId = ''; m.timesTouched = false; redraw(); } });
    const fClass = classes.length
      ? ui.select({ options: classes.map(c => ({ value: c.id, label: c.name })), value: m.classId, placeholder: '— Pilih kelas —', onChange: v => { m.classId = v; m.timesTouched = false; redraw(); } })
      : h('div', { class: 'muted small rphv-inline-note' }, S().classes().length ? 'Tiada kelas untuk tahun ini (tambah di Tetapan → Kelas).' : 'Tiada kelas lagi — tambah di Tetapan → Kelas atau import senarai kelas.');
    const fDate = ui.input({ type: 'date', value: m.date, onChange: v => { m.date = v; m.timesTouched = false; redraw(); } });
    const fStart = ui.input({ type: 'time', value: m.start, onChange: v => { m.start = v; m.timesTouched = true; redraw(); } });
    const fEnd = ui.input({ type: 'time', value: m.end, onChange: v => { m.end = v; m.timesTouched = true; redraw(); } });
    const fTpl = ui.select({ options: tplOptions.map(t => ({ value: t.id, label: t.name.ms || t.id })), value: m.templateId, onChange: v => { m.templateId = v; m.variant = ''; redraw(); } });
    const fVariant = ui.select({ options: variants.map(v => ({ value: v, label: VARIANT_LABEL[v] || v })), value: m.variant, onChange: v => { m.variant = v; } });

    let fTheme;
    if (themes.length) {
      const names = themes.map(t => (t.name && (t.name.ar || t.name.jawi || t.name.ms)) || '').filter(Boolean);
      const isOther = m.theme && !names.includes(m.theme);
      const otherInput = k.smartText({ value: isOther ? m.theme : '', multiline: false, rtl: true, placeholder: 'Tema lain', onInput: v => { m.theme = v; } });
      otherInput.hidden = !isOther;
      const sel = ui.select({ options: [...names.map(n => ({ value: n, label: n })), { value: '__other', label: 'Lain-lain…' }], value: isOther ? '__other' : m.theme, placeholder: '— Pilih tema —', dir: 'auto',
        onChange: v => { if (v === '__other') { otherInput.hidden = false; m.theme = otherInput.value; otherInput.focus(); } else { otherInput.hidden = true; m.theme = v; } } });
      sel.classList.add('ar-options');
      fTheme = h('div', { class: 'stack rphv-stack-tight' }, sel, otherInput);
    } else {
      fTheme = k.smartText({ value: m.theme, multiline: false, rtl: subject.direction === 'rtl', lang: subject.script === 'jawi' ? 'ms-Arab' : 'ar', placeholder: 'Tema / bidang', onInput: v => { m.theme = v; } });
    }
    const fTopic = k.smartText({ value: m.topic, multiline: false, rtl: subject.direction === 'rtl', lang: subject.script === 'jawi' ? 'ms-Arab' : 'ar', placeholder: 'Tajuk pelajaran', onInput: v => { m.topic = v; } });

    // ---- Slot hari itu (pilih cepat) ----
    const slotChips = daySlots.length ? h('div', { class: 'rphv-slotchips' },
      h('span', { class: 'muted small' }, 'Slot jadual pada tarikh ini:'),
      daySlots.map(s => h('button', { type: 'button', class: ['rphv-chipbtn', match && match.id === s.id ? 'is-on' : ''], style: { '--subj': k.subjColor(s.subjectId) },
        onClick: () => {
          const changed = m.subjectId !== s.subjectId || +m.year !== +s.year;
          m.subjectId = s.subjectId; m.year = s.year; m.classId = s.classId; m.timesTouched = false;
          if (changed) { const sj = k.subj(s.subjectId) || {}; m.templateId = sj.defaultTemplateId || m.templateId; m.sk = []; m.sp = []; m.theme = ''; }
          redraw();
        } },
        k.subjectDot(s.subjectId), `${s.start || '?'} ${s.className} ${k.subjCode(s.subjectId)}`)))
      : h('div', { class: 'muted small' }, m.date ? `${k.dayStatus(m.date).label} — tiada slot jadual pada tarikh ini.` : '');

    // ---- Cadangan RPT ----
    const lessons = m.date && m.year ? k.rptLessons(m.subjectId, m.year, m.date) : [];
    const rptBox = lessons.length ? h('div', { class: 'rphv-rpt-suggest' },
      h('div', { class: 'rphv-mini-head' }, `Cadangan RPT (minggu RPT ${RPH.cal.rptWeek(RPH.cal.schoolWeek(m.date), m.subjectId) ?? '—'})`),
      lessons.map(l => {
        const skList = (l.sk && l.sk.length ? l.sk : (l.skCandidates || [])).filter(c => !hasCurr || curr.sk(m.subjectId, m.year, c));
        const spList = (l.sp && l.sp.length ? l.sp : (l.spCandidates || [])).filter(c => !hasCurr || curr.sp(m.subjectId, m.year, c));
        return h('div', { class: 'rphv-rpt-item' },
          h('div', { class: 'rphv-rpt-text' }, k.rtl(k.lessonLabel(l)), skList.length || spList.length ? h('div', { class: 'slot-sub' }, `SK ${skList.join(', ') || '—'} · SP ${spList.join(', ') || '—'}${l.skCandidates && !(l.sk && l.sk.length) ? ' (cadangan sistem)' : ''}`) : null),
          ui.button('Guna', { size: 'sm', onClick: () => {
            m.topic = l.topic || (Array.isArray(l.content) ? l.content[0] : '') || m.topic;
            if (l.theme) m.theme = l.theme;
            m.sk = [...new Set(skList)]; m.sp = [...new Set(spList)].filter(sp => m.sk.some(sk => sp.startsWith(sk + '.')));
            redraw();
          } }));
      })) : null;

    // ---- SK / SP ----
    const skBox = h('div', { class: 'rphv-picker' });
    const spBox = h('div', { class: 'rphv-picker' });
    if (!hasCurr) {
      add(skBox, k.notice(m.subjectId === 'TASMIK' ? 'Tasmik tiada kod DSKP — SK/SP diisi sebagai teks bebas dalam editor.' : 'Data DSKP untuk subjek/tahun ini tidak tersedia — SK/SP tidak dapat dipilih (perlu semakan guru).', null));
    } else {
      const filt = k.smartText({ value: m.skFilter, multiline: false, placeholder: 'Cari kod atau teks SK…', cls: 'input-sm rphv-picker-search' });
      const listEl = h('div', { class: 'rphv-picker-list' });
      const drawSk = () => {
        ui.clear(listEl);
        const q = (m.skFilter || '').trim();
        for (const d of curr.domains(m.subjectId, m.year)) {
          const sks = (d.contentStandards || []).filter(sk => !q || sk.code.startsWith(q) || (sk.text || '').includes(q));
          if (!sks.length) continue;
          add(listEl, h('div', { class: 'rphv-picker-domain' }, `${d.code}. `, k.rtl((d.name && (d.name.ms || d.name.ar || d.name.jawi)) || '')));
          sks.forEach(sk => add(listEl, pickRow(sk, m.sk.includes(sk.code), on => {
            m.sk = on ? [...m.sk, sk.code] : m.sk.filter(c => c !== sk.code);
            m.sp = m.sp.filter(sp => m.sk.some(c => sp.startsWith(c + '.')));
            drawSp();
          }, k.langOf(tpl))));
        }
        if (!listEl.childNodes.length) add(listEl, h('p', { class: 'muted small' }, 'Tiada SK sepadan.'));
      };
      filt.addEventListener('input', () => { m.skFilter = filt.value; drawSk(); });
      add(skBox, filt, listEl);
      drawSk();
    }
    function drawSp() {
      ui.clear(spBox);
      if (!hasCurr) return;
      if (!m.sk.length) { add(spBox, h('p', { class: 'muted small rphv-pad0' }, 'Pilih SK dahulu — SP ditapis ikut SK yang dipilih.')); return; }
      const listEl = h('div', { class: 'rphv-picker-list' });
      m.sk.forEach(code => {
        const sps = curr.listSp(m.subjectId, m.year, code);
        add(listEl, h('div', { class: 'rphv-picker-domain' }, `SK ${code}`));
        if (!sps.length) add(listEl, h('p', { class: 'muted small' }, 'Tiada SP di bawah SK ini.'));
        sps.forEach(sp => add(listEl, pickRow(sp, m.sp.includes(sp.code), on => { m.sp = on ? [...m.sp, sp.code] : m.sp.filter(c => c !== sp.code); }, k.langOf(tpl))));
      });
      add(spBox, listEl);
    }
    drawSp();

    // ---- Jana ----
    const genBtn = ui.button(k.has('gen.generate') ? 'Jana RPH' : 'Cipta RPH kosong', { kind: 'primary', icon: 'wand', size: 'lg', onClick: () => submit() });
    function submit() {
      const errs = [];
      if (!m.subjectId) errs.push('subjek'); if (!m.year) errs.push('tahun'); if (!m.classId) errs.push('kelas'); if (!m.date) errs.push('tarikh');
      if (errs.length) { ui.toast(`Sila lengkapkan: ${errs.join(', ')}.`, 'error'); return; }
      if (m.start && m.end && U.minutesBetween(m.start, m.end) <= 0) { ui.toast('Masa tamat mesti selepas masa mula.', 'error'); return; }
      const input = { date: m.date, start: m.start || null, end: m.end || null, classId: m.classId, subjectId: m.subjectId, year: +m.year,
        sk: [...m.sk], sp: [...m.sp], theme: m.theme || '', topic: m.topic || '', templateId: m.templateId, variant: m.variant };
      if (match && match.start === m.start && match.end === m.end) input.slot = match;
      let r;
      try {
        r = k.has('gen.generate') ? RPH.gen.generate(input) : k.blankRph(input);
        if (!r || !r.id) throw new Error('Penjana tidak memulangkan RPH yang sah');
        r.generatedBy = r.generatedBy || 'manual';
        S().saveRph(r);
      } catch (e) { RPH.reportError('jana RPH manual', e); return; }
      ui.toast(k.has('gen.generate') ? 'RPH dijana. Semak dan sunting sebelum eksport.' : 'RPH kosong dicipta.', 'success');
      state.manual = { ...m, sk: [], sp: [], topic: '' };
      RPH.router.go('rph', r.id);
    }

    const existing = match ? k.findRph(m.date, match) : null;
    add(box, 
      k.has('gen.generate') ? null : k.notice('Modul penjana (generator.js) belum tersedia — butang di bawah mencipta RPH kosong dengan SK/SP pilihan anda (tiada kandungan dijana).', 'error'),
      RPH.onboarding ? RPH.onboarding.gapNotice(['subjek', 'kelas'], 'RPH manual memerlukan sekurang-kurangnya satu subjek dan satu kelas') : null,
      h('div', { class: 'rphv-manual' },
        ui.card({ cls: 'rphv-card', title: 'Butiran kelas', body: h('div', { class: 'stack' },
          h('div', { class: 'form-grid' }, ui.field('Subjek', fSubject), ui.field('Tahun', fYear), ui.field('Kelas', fClass), ui.field('Tarikh', fDate),
            ui.field('Masa mula', fStart, match ? `Slot jadual: ${match.start}–${match.end}` : null), ui.field('Masa tamat', fEnd),
            ui.field('Templat', fTpl), ui.field('Varian', fVariant)),
          slotChips,
          existing ? k.notice(`Slot ini sudah mempunyai RPH (${RPH.ui.STATUS[existing.status] ? RPH.ui.STATUS[existing.status][0] : existing.status}). RPH baharu akan dicipta berasingan.`, null,
            h('div', { class: 'rphv-notice-actions' }, ui.button('Buka RPH sedia ada', { size: 'sm', onClick: () => RPH.router.go('rph', existing.id) }))) : null) }),
        ui.card({ cls: 'rphv-card', title: 'Tema & tajuk', body: h('div', { class: 'stack' },
          h('div', { class: 'grid grid-2' }, ui.field(themes.length ? 'Tema (محور)' : 'Tema / Bidang', fTheme), ui.field('Tajuk', fTopic)),
          rptBox) }),
        ui.card({ cls: 'rphv-card', title: 'Standard Kandungan & Standard Pembelajaran', subtitle: 'SK/SP hanya daripada DSKP. Teks Arab/Jawi dipaparkan dari kanan ke kiri.',
          body: h('div', { class: 'grid grid-2 rphv-sksp' }, ui.field('Standard Kandungan (SK)', skBox), ui.field('Standard Pembelajaran (SP)', spBox)) }),
        h('div', { class: 'rphv-actions-row rphv-actions-end' }, h('span', { class: 'muted small' }, 'Penjana mengisi objektif, aktiviti dan pentaksiran; semua boleh disunting kemudian.'), genBtn)));
  }

  function pickRow(item, checked, onToggle, lang) {
    const cb = h('input', { type: 'checkbox', checked });
    const row = h('label', { class: ['rphv-pick', checked ? 'is-on' : ''] });
    cb.addEventListener('change', () => { row.classList.toggle('is-on', cb.checked); onToggle(cb.checked); });
    return RPH.ui.append(row, [cb,
      h('span', { class: 'rphv-pick-code' }, item.code),
      h('span', { class: 'rphv-pick-text ar', dir: U.isArabicScript(item.text) ? 'rtl' : 'ltr', lang: U.isArabicScript(item.text) ? lang : null }, item.text || '')]);
  }

  RPH.views.generate = RPH.views.jana = { title: 'Jana RPH', icon: 'wand', render };
})(window.RPH = window.RPH || {});
