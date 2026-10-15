/* Takwim sekolah boleh disunting (master prompt §17–§19): kalendar bulanan, minggu sekolah, cuti/acara,
   Sabtu ganti, pemetaan minggu RPT A/B. Data: store 'calendar' (ikut tahun akademik) {days[], weeks[], rptWeekMap}. */
(function (RPH) {
  'use strict';
  const { h, icon, button, confirm, toast, clear, empty, tabs, select, modal } = RPH.ui;
  const U = RPH.util;
  const K = () => RPH.adminKit;
  const st = () => RPH.store;

  const state = { month: null, year: null, tab: 'cal' };
  const CATS = [
    { value: 'kurikulum', label: 'Kurikulum', color: 'blue' }, { value: 'hem', label: 'HEM', color: 'violet' }, { value: 'kokurikulum', label: 'Kokurikulum', color: 'orange' },
    { value: 'pentadbiran', label: 'Pentadbiran', color: 'slate' }, { value: 'peperiksaan', label: 'Peperiksaan', color: 'rose' }, { value: 'umum', label: 'Umum', color: 'gold' },
  ];
  const KINDS = [
    { value: 'acara', label: 'Acara / program (PdP berjalan)' }, { value: 'cuti', label: 'Cuti (tiada PdP)' }, { value: 'cuti-peristiwa', label: 'Cuti peristiwa (tiada PdP)' },
    { value: 'peperiksaan', label: 'Peperiksaan' }, { value: 'sabtu-ganti', label: 'Sabtu ganti (hari persekolahan)' },
  ];
  const HOLIDAY_KINDS = ['cuti', 'cuti-peristiwa'];
  const catColor = c => (CATS.find(x => x.value === c) || {}).color || 'slate';
  const DOW_SHORT = ['Ahd', 'Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab'];

  const cal = () => st().get('calendar') || { days: [], weeks: [] };
  const dayOf = iso => (cal().days || []).find(d => d.date === iso) || null;
  const holidayKind = d => (d && d.holiday ? (/peristiwa/i.test(d.holiday) ? 'cuti-peristiwa' : 'cuti') : null);

  // ------------------------------------------------------------------ Mutasi
  function weekFor(c, iso) { const w = (c.weeks || []).find(x => iso >= x.start && iso <= U.addDays(x.start, 6)); return w ? w.week : null; }
  function ensureDay(c, iso) {
    c.days = c.days || [];
    let d = c.days.find(x => x.date === iso);
    if (!d) {
      const dow = U.dow(iso);
      const week = weekFor(c, iso);
      d = { date: iso, dow, dayName: U.dayNameMs(dow), week, schoolDay: dow >= 1 && dow <= 5 && week != null, holiday: null, events: [] };
      c.days.push(d); c.days.sort((a, b) => a.date.localeCompare(b.date));
    }
    d.events = d.events || [];
    return d;
  }
  function recount(c) {
    (c.weeks || []).forEach(w => {
      const end = U.addDays(w.start, 6);
      w.schoolDays = (c.days || []).filter(d => d.date >= w.start && d.date <= end && d.schoolDay).length;
    });
  }
  function mutate(fn) { st().update('calendar', c => { c.days = c.days || []; c.weeks = c.weeks || []; fn(c); recount(c); c.updatedAt = U.nowIso(); }); }

  // ------------------------------------------------------------------ Borang
  function eventForm(iso, ev, idx) {
    const isNew = !ev;
    K().formModal({ title: isNew ? 'Tambah acara / cuti' : `Sunting acara — ${U.fmtDate(iso)}`, size: 'md',
      values: { from: iso || RPH.cal.today(), to: '', title: ev ? ev.title : '', kind: ev ? ev.kind : 'acara', category: ev ? ev.category : 'kurikulum', makeHoliday: ev ? HOLIDAY_KINDS.includes(ev.kind) : false },
      fields: [
        { key: 'from', label: isNew ? 'Tarikh mula' : 'Tarikh', type: 'date', required: true, readonly: !isNew },
        isNew ? { key: 'to', label: 'Tarikh akhir (pilihan, untuk julat)', type: 'date' } : null,
        { key: 'title', label: 'Tajuk', required: true, full: true, placeholder: 'cth. Hari Sukan Sekolah' },
        { key: 'kind', label: 'Jenis', type: 'select', options: KINDS, onChange: (v, c) => { if (c.makeHoliday) c.makeHoliday.set(HOLIDAY_KINDS.includes(v)); } },
        { key: 'category', label: 'Kategori', type: 'select', options: CATS.map(x => ({ value: x.value, label: x.label })) },
        isNew ? { key: 'makeHoliday', type: 'checkbox', full: true, text: 'Tandakan hari sebagai cuti (bukan hari persekolahan — tiada RPH dijana)' } : null,
      ].filter(Boolean),
      onSave(v) {
        const to = v.to || v.from;
        if (to < v.from) return 'Tarikh akhir mesti selepas tarikh mula.';
        const n = Math.round((U.parseIso(to) - U.parseIso(v.from)) / 864e5) + 1;
        if (n > 120) return 'Julat terlalu panjang (maksimum 120 hari).';
        mutate(c => {
          for (let i = 0; i < n; i++) {
            const dIso = U.addDays(v.from, i);
            const d = ensureDay(c, dIso);
            const e = { kind: v.kind, category: v.category, title: v.title, custom: true };
            if (isNew) d.events.push(e); else d.events[idx] = { ...d.events[idx], ...e };
            if (isNew && (v.makeHoliday || HOLIDAY_KINDS.includes(v.kind))) { d.holiday = v.title; d.schoolDay = false; }
            if (v.kind === 'sabtu-ganti') { d.schoolDay = true; d.holiday = null; if (d.week == null) d.week = weekFor(c, dIso); }
          }
        });
        toast(isNew ? `Acara ditambah (${n} hari).` : 'Acara disimpan.', 'success');
        draw();
      } });
  }

  async function removeEvent(iso, idx) {
    const d = dayOf(iso); if (!d) return;
    const ev = d.events[idx];
    const restore = HOLIDAY_KINDS.includes(ev.kind) && d.holiday === ev.title;
    if (!(await confirm({ title: 'Padam acara', danger: true, confirmLabel: 'Padam', message: `Padam "${ev.title}" pada ${U.fmtDate(iso)}?${restore ? '\nHari ini akan dikembalikan sebagai hari persekolahan.' : ''}` }))) return false;
    mutate(c => {
      const dd = ensureDay(c, iso);
      dd.events.splice(idx, 1);
      if (restore) { dd.holiday = null; dd.schoolDay = dd.dow >= 1 && dd.dow <= 5 && (dd.week != null || weekFor(c, iso) != null); }
    });
    toast('Acara dipadam.', 'success'); draw();
    return true;
  }

  function dayForm(iso) {
    const d = dayOf(iso) || { date: iso, dow: U.dow(iso), week: RPH.cal.schoolWeek(iso), schoolDay: false, holiday: null, events: [] };
    const isWeekend = d.dow === 0 || d.dow === 6;
    const evList = h('div', { class: 'stack' }, (d.events || []).length ? (d.events || []).map((e, i) => h('div', { class: 'adm-ev-row' },
      h('span', { class: ['badge', `badge-${HOLIDAY_KINDS.includes(e.kind) ? (e.kind === 'cuti' ? 'red' : 'green') : catColor(e.category)}`] },
        e.kind === 'cuti' ? 'Cuti' : e.kind === 'cuti-peristiwa' ? 'Cuti peristiwa' : e.kind === 'acara' ? ((CATS.find(x => x.value === e.category) || {}).label || 'Acara') : e.kind || 'acara'),
      h('span', { class: 'adm-ev-title' }, K().mixed(e.title)),
      h('span', { class: 'row adm-tight' }, K().iconBtn('edit', 'Sunting acara', () => { m.close(); eventForm(iso, e, i); }), K().iconBtn('trash', 'Padam acara', async () => { if (await removeEvent(iso, i)) m.close(); }, 'danger'))))
      : h('p', { class: 'muted small' }, 'Tiada acara.'));
    const sw = d.week != null ? d.week : RPH.cal.schoolWeek(iso);
    const m = K().formModal({ title: `${U.dayNameMs(d.dow)}, ${U.fmtDate(iso, 'long')}${sw ? ` · Minggu ${sw}` : ''}`, size: 'md',
      values: { schoolDay: !!d.schoolDay, holiday: d.holiday || '', followsDow: d.followsDow ? String(d.followsDow) : '' },
      fields: [
        { key: 'schoolDay', type: 'checkbox', full: true, text: isWeekend ? 'Hari persekolahan ganti (PdP berjalan)' : 'Hari persekolahan (PdP berjalan)' },
        { key: 'holiday', label: 'Cuti / sebab tiada PdP', full: true, placeholder: 'cth. Cuti Peristiwa 1', hint: 'Kosongkan jika bukan cuti.' },
        isWeekend ? { key: 'followsDow', label: 'Ikut jadual hari', type: 'select', options: [1, 2, 3, 4, 5].map(x => ({ value: String(x), label: U.dayNameMs(x) })), placeholder: '— Pilih —', hint: 'Untuk Sabtu ganti: slot jadual hari yang diganti.' } : null,
        { type: 'heading', label: 'Acara' },
        { key: '_ev', type: 'custom', full: true, render: () => evList },
      ].filter(Boolean),
      extraActions: [{ label: 'Tambah acara', icon: 'plus', onClick: () => { setTimeout(() => eventForm(iso), 0); return true; } }],
      onSave(v) {
        if (isWeekend && v.schoolDay && !v.followsDow) return 'Pilih jadual hari yang diikuti untuk Sabtu/Ahad ganti.';
        mutate(c => {
          const dd = ensureDay(c, iso);
          dd.schoolDay = !!v.schoolDay;
          dd.holiday = v.holiday || null;
          if (dd.schoolDay && dd.week == null) dd.week = weekFor(c, iso);
          if (isWeekend) {
            if (dd.schoolDay) { dd.followsDow = +v.followsDow; if (!dd.events.some(e => e.kind === 'sabtu-ganti')) dd.events.push({ kind: 'sabtu-ganti', category: 'umum', title: `Hari persekolahan ganti (jadual ${U.dayNameMs(+v.followsDow)})`, custom: true }); }
            else { delete dd.followsDow; dd.events = dd.events.filter(e => e.kind !== 'sabtu-ganti'); }
          }
        });
        toast('Hari dikemas kini.', 'success'); draw();
      } });
  }

  // ------------------------------------------------------------------ Kalendar bulanan
  function monthsAvailable() {
    const c = cal();
    const ds = (c.days || []).map(d => d.date).sort();
    const ay = st().academicYear() || {};
    const first = ds[0] || ay.startDate || `${st().activeYear()}-01-01`;
    const last = ds[ds.length - 1] || ay.endDate || `${st().activeYear()}-12-31`;
    const out = []; let [y, m] = first.split('-').map(Number); const [ly, lm] = last.split('-').map(Number);
    while (y < ly || (y === ly && m <= lm)) { out.push({ y, m }); m++; if (m > 12) { m = 1; y++; } }
    return out;
  }

  function monthGrid(y, m) {
    const today = RPH.cal.today();
    const first = `${y}-${U.pad(m)}-01`;
    const start = U.addDays(first, -((U.dow(first) + 6) % 7)); // Isnin sebelum/pada 1hb
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const end = `${y}-${U.pad(m)}-${U.pad(lastDay)}`;
    const rows = [];
    for (let wk = start; wk <= end; wk = U.addDays(wk, 7)) rows.push(wk);
    const mode = (st().academicYear() || {}).rptWeekMapping || (cal().rptWeekMap || {}).default || 'A';
    return h('div', { class: 'cal-month', role: 'grid', 'aria-label': `${U.monthName(m)} ${y}` },
      h('div', { class: 'cal-row cal-head', role: 'row' }, h('div', { class: 'cal-wk' }, 'Minggu'), [1, 2, 3, 4, 5, 6, 0].map(dw => h('div', { class: ['cal-hd', dw === 0 || dw === 6 ? 'is-weekend' : null], role: 'columnheader' }, DOW_SHORT[dw]))),
      rows.map(mon => {
        const sw = RPH.cal.schoolWeek(mon) ?? RPH.cal.schoolWeek(U.addDays(mon, 4));
        const w = sw != null ? RPH.cal.week(sw) : null;
        return h('div', { class: 'cal-row', role: 'row' },
          h('div', { class: ['cal-wk', sw != null ? 'has-week' : null], title: sw != null ? `Minggu sekolah ${sw} · RPT ${mode}: ${RPH.cal.rptWeek(sw)}${w ? ` · ${w.schoolDays} hari sekolah` : ''}` : 'Bukan minggu persekolahan' },
            sw != null ? [h('strong', null, `M${sw}`), h('span', { class: 'cal-wk-sub' }, `RPT ${RPH.cal.rptWeek(sw)}`)] : h('span', { class: 'muted' }, '—')),
          [0, 1, 2, 3, 4, 5, 6].map(i => {
            const iso = U.addDays(mon, i);
            const d = dayOf(iso);
            const inMonth = iso.slice(0, 7) === first.slice(0, 7);
            const hk = holidayKind(d);
            const ev = (d && d.events) || [];
            const dw = U.dow(iso);
            const ganti = d && d.schoolDay && (dw === 0 || dw === 6);
            const cls = ['cal-day', inMonth ? null : 'is-out', d && d.schoolDay ? 'is-school' : 'is-off', dw === 0 || dw === 6 ? 'is-weekend' : null, hk ? `is-${hk}` : null, ganti ? 'is-ganti' : null, iso === today ? 'is-today' : null];
            const shown = ev.filter(e => !(HOLIDAY_KINDS.includes(e.kind) && d.holiday === e.title));
            return h('button', { type: 'button', class: cls, role: 'gridcell', onClick: () => dayForm(iso), title: [U.fmtDate(iso, 'long'), d && d.holiday, ...ev.map(e => e.title)].filter(Boolean).join('\n'), 'aria-label': `${U.fmtDate(iso, 'long')}${d && d.holiday ? `, ${d.holiday}` : ''}${ev.length ? `, ${ev.length} acara` : ''}` },
              h('span', { class: 'cal-num' }, String(+iso.slice(8))),
              d && d.holiday ? h('span', { class: 'cal-hol' }, d.holiday) : null,
              ganti ? h('span', { class: 'cal-ev ev-blue' }, 'Sekolah ganti') : null,
              shown.slice(0, 3).map(e => h('span', { class: ['cal-ev', `ev-${e.kind === 'peperiksaan' ? 'rose' : catColor(e.category)}`] }, e.title)),
              shown.length > 3 ? h('span', { class: 'cal-more' }, `+${shown.length - 3} lagi`) : null);
          }));
      }));
  }

  function legend() {
    return h('div', { class: 'tt-legend' },
      h('span', { class: 'tt-leg' }, h('i', { class: 'leg-cuti' }), 'Cuti'),
      h('span', { class: 'tt-leg' }, h('i', { class: 'leg-peristiwa' }), 'Cuti peristiwa'),
      h('span', { class: 'tt-leg' }, h('i', { class: 'leg-off' }), 'Bukan hari sekolah'),
      h('span', { class: 'tt-leg' }, h('i', { class: 'leg-ganti' }), 'Sekolah ganti'),
      CATS.map(c => h('span', { class: 'tt-leg' }, h('i', { class: `leg-ev ev-${c.color}` }), c.label)));
  }

  function calTab() {
    const months = monthsAvailable();
    const idx = Math.max(0, months.findIndex(x => x.y === state.year && x.m === state.month));
    const cur = months[idx] || { y: +RPH.cal.today().slice(0, 4), m: +RPH.cal.today().slice(5, 7) };
    const go = d => { const n = months[idx + d]; if (n) { state.year = n.y; state.month = n.m; draw(); } };
    const sel = select({ options: months.map((x, i) => ({ value: i, label: `${U.monthName(x.m)} ${x.y}` })), value: idx, cls: 'input-sm', onChange: v => { const n = months[+v]; state.year = n.y; state.month = n.m; draw(); } });
    sel.setAttribute('aria-label', 'Bulan');
    const days = (cal().days || []).filter(d => d.date.startsWith(`${cur.y}-${U.pad(cur.m)}`));
    const school = days.filter(d => d.schoolDay).length;
    const monthly = ((cal().monthlySchoolDays || []).find(x => x.month === cur.m) || {});
    return h('div', { class: 'stack' },
      h('div', { class: 'adm-monthbar' },
        h('div', { class: 'row' }, K().iconBtn('left', 'Bulan sebelum', () => go(-1)), sel, K().iconBtn('right', 'Bulan berikut', () => go(1)),
          button('Hari ini', { size: 'sm', onClick: () => { const t = RPH.cal.today(); state.year = +t.slice(0, 4); state.month = +t.slice(5, 7); draw(); } })),
        h('div', { class: 'muted small' }, `${school} hari persekolahan`, monthly.stated != null ? ` (takwim bercetak: ${monthly.stated})` : '')),
      h('div', { class: 'cal-scroll' }, monthGrid(cur.y, cur.m)),
      legend(),
      h('p', { class: 'muted small' }, 'Klik pada tarikh untuk menanda cuti, menukar hari persekolahan (cth. Sabtu ganti) atau mengurus acara.'));
  }

  function weeksTab() {
    const c = cal();
    const today = RPH.cal.today(); const curW = RPH.cal.schoolWeek(today);
    const mapA = (c.rptWeekMap && c.rptWeekMap.A && c.rptWeekMap.A.map) || {}, mapB = (c.rptWeekMap && c.rptWeekMap.B && c.rptWeekMap.B.map) || {};
    const mode = (st().academicYear() || {}).rptWeekMapping || (c.rptWeekMap || {}).default || 'A';
    const weeks = c.weeks || [];
    if (!weeks.length) return empty('Tiada minggu persekolahan dalam takwim ini.');
    return h('div', { class: 'table-wrap' }, h('table', { class: 'table adm-table-compact' },
      h('thead', null, h('tr', null, ['Minggu', 'Penggal', 'Isnin – Jumaat', 'Hari sekolah', 'Cuti / acara', `RPT A${mode === 'A' ? ' ✓' : ''}`, `RPT B${mode === 'B' ? ' ✓' : ''}`, 'Minggu KPM'].map(x => h('th', null, x)))),
      h('tbody', null, weeks.map(w => {
        const end = U.addDays(w.start, 6);
        const ds = (c.days || []).filter(d => d.date >= w.start && d.date <= end);
        const hols = [...new Set(ds.map(d => d.holiday).filter(Boolean))];
        const evs = ds.reduce((n, d) => n + (d.events || []).filter(e => e.kind === 'acara').length, 0);
        return h('tr', { class: ['clickable', w.week === curW ? 'adm-current' : null], onClick: () => { state.year = +w.start.slice(0, 4); state.month = +w.start.slice(5, 7); state.tab = 'cal'; draw(); } },
          h('td', null, h('strong', null, `M${w.week}`), w.week === curW ? h('span', { class: 'badge badge-gold adm-ml' }, 'Kini') : null),
          h('td', { class: 'num' }, w.term != null ? String(w.term) : '—'),
          h('td', { class: 'adm-nowrap' }, `${U.fmtDate(w.start)} – ${U.fmtDate(w.end || U.addDays(w.start, 4))}`),
          h('td', { class: 'num' }, h('span', { class: ['badge', w.schoolDays >= 5 ? 'badge-green' : w.schoolDays ? 'badge-amber' : 'badge-red'] }, String(w.schoolDays))),
          h('td', { class: 'small' }, hols.map(x => h('div', { class: /peristiwa/i.test(x) ? 'adm-txt-green' : 'adm-txt-red' }, x)), evs ? h('div', { class: 'muted' }, `${evs} acara`) : null, !hols.length && !evs ? '—' : null),
          h('td', { class: 'num' }, mapA[w.week] != null ? String(mapA[w.week]) : String(w.week)),
          h('td', { class: 'num' }, mapB[w.week] != null ? String(mapB[w.week]) : '—'),
          h('td', { class: 'num' }, w.kpmWeek != null ? String(w.kpmWeek) : '—'));
      }))));
  }

  function rptTab() {
    const c = cal();
    const ay = st().academicYear() || {};
    const mode = ay.rptWeekMapping || (c.rptWeekMap || {}).default || 'A';
    const rm = c.rptWeekMap || {};
    const setMode = v => {
      st().update('academicYears', d => { const y = d.years.find(x => x.id === st().activeYear()); if (y) y.rptWeekMapping = v; });
      mutate(cc => { cc.rptWeekMap = cc.rptWeekMap || { A: { map: {} }, B: { map: {} } }; cc.rptWeekMap.default = v; });
      toast(`Padanan minggu RPT lalai: ${v}.`, 'success'); draw();
    };
    const subjects = st().subjects();
    const weeks = c.weeks || [];
    const setMap = (m, wk, val) => mutate(cc => {
      cc.rptWeekMap = cc.rptWeekMap || {}; cc.rptWeekMap[m] = cc.rptWeekMap[m] || { map: {} }; cc.rptWeekMap[m].map = cc.rptWeekMap[m].map || {};
      if (val == null || val === '') delete cc.rptWeekMap[m].map[wk]; else cc.rptWeekMap[m].map[wk] = +val;
    });
    return h('div', { class: 'stack' },
      RPH.ui.card({ title: 'Padanan minggu sekolah → minggu RPT', subtitle: 'Menentukan kandungan RPT yang digunakan oleh penjana RPH bagi setiap minggu sekolah.', body: h('div', { class: 'stack' },
        h('div', { class: 'grid grid-2' }, ['A', 'B'].map(k => h('label', { class: ['adm-choice', mode === k ? 'is-on' : null] },
          h('input', { type: 'radio', name: 'rptmode', checked: mode === k, onChange: () => setMode(k) }),
          h('div', null, h('strong', null, `Mod ${k}`), h('div', { class: 'small muted' }, (rm[k] && rm[k].description) || (k === 'A' ? 'Minggu RPT N = minggu sekolah N.' : 'Ikut tarikh KPM.')))))),
        ay.rptWeekMappingNote ? h('p', { class: 'muted small' }, ay.rptWeekMappingNote) : null,
        h('div', null, h('div', { class: 'adm-mini-head' }, 'Override ikut subjek'),
          h('div', { class: 'form-grid' }, subjects.map(s => RPH.ui.field(s.name.ms, select({ options: [{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }], value: s.rptWeekMapping || '', placeholder: `Ikut lalai (${mode})`, onChange: v => {
            st().update('subjects', d => { const x = d.subjects.find(z => z.id === s.id); if (v) x.rptWeekMapping = v; else delete x.rptWeekMapping; });
            toast(`${s.name.ms}: padanan ${v || 'lalai'}.`, 'success');
          } }))))) ) }),
      RPH.ui.card({ title: 'Jadual padanan', subtitle: 'Sunting nombor minggu RPT bagi setiap minggu sekolah (kosong = sama dengan minggu sekolah).', body: weeks.length ? h('div', { class: 'table-wrap adm-maxh' }, h('table', { class: 'table adm-table-compact' },
        h('thead', null, h('tr', null, h('th', null, 'Minggu sekolah'), h('th', null, 'Tarikh'), h('th', null, 'RPT (A)'), h('th', null, 'RPT (B)'))),
        h('tbody', null, weeks.map(w => h('tr', null,
          h('td', null, h('strong', null, `M${w.week}`)),
          h('td', { class: 'adm-nowrap small' }, U.fmtDate(w.start)),
          ['A', 'B'].map(k => h('td', null, RPH.ui.input({ type: 'number', min: 1, cls: 'input-sm adm-w-num', value: rm[k] && rm[k].map && rm[k].map[w.week] != null ? rm[k].map[w.week] : '', placeholder: String(w.week), onChange: v => setMap(k, w.week, v) }))))))))
        : empty('Tiada minggu dalam takwim.') }));
  }

  // ------------------------------------------------------------------ Takwim baharu (tahun akademik baharu)
  function generateBase() {
    const ay = st().academicYear() || {};
    K().formModal({ title: 'Jana takwim asas', size: 'md', intro: 'Mencipta hari Isnin–Jumaat sebagai hari persekolahan dan menomborkan minggu secara berturutan. Tandakan cuti selepas itu.',
      values: { start: ay.startDate || `${st().activeYear()}-01-01`, end: ay.endDate || `${st().activeYear()}-12-31` },
      fields: [{ key: 'start', label: 'Hari pertama persekolahan', type: 'date', required: true }, { key: 'end', label: 'Hari terakhir', type: 'date', required: true }],
      onSave(v) {
        if (v.end <= v.start) return 'Tarikh akhir mesti selepas tarikh mula.';
        const y0 = v.start.slice(0, 4), y1 = v.end.slice(0, 4);
        const days = []; let wkNo = 0; const weeks = [];
        for (let d = `${y0}-01-01`; d <= `${y1}-12-31`; d = U.addDays(d, 1)) {
          const dow = U.dow(d);
          const inSession = d >= v.start && d <= v.end;
          if (dow === 1 && inSession) { wkNo++; weeks.push({ week: wkNo, start: d, end: U.addDays(d, 4), term: 1, kpmWeek: wkNo, schoolDays: 0 }); }
          if (inSession && wkNo === 0 && dow >= 2 && dow <= 5) { wkNo = 1; const mon = U.addDays(d, -(dow - 1)); weeks.push({ week: 1, start: mon, end: U.addDays(mon, 4), term: 1, kpmWeek: 1, schoolDays: 0 }); }
          const school = inSession && dow >= 1 && dow <= 5;
          days.push({ date: d, dow, dayName: U.dayNameMs(dow), week: inSession && wkNo ? wkNo : null, schoolDay: school, holiday: null, events: [] });
        }
        st().update('calendar', c => {
          c.schemaVersion = c.schemaVersion || '1.0.0'; c.type = 'calendar'; c.academicYearId = st().activeYear();
          c.days = days; c.weeks = weeks; c.session = { start: v.start, end: v.end };
          c.rptWeekMap = c.rptWeekMap && c.rptWeekMap.A ? c.rptWeekMap : { default: 'A', A: { map: {} }, B: { map: {} } };
          c.source = { generated: U.nowIso() };
          recount(c);
        });
        toast(`Takwim asas dijana: ${weeks.length} minggu.`, 'success'); draw();
      } });
  }

  async function importCalendar() {
    const f = await K().readJson();
    if (!f) return;
    const j = f.json; const errs = [];
    if (!j || typeof j !== 'object') errs.push('Kandungan mesti objek JSON.');
    else {
      if (j.type && j.type !== 'calendar') errs.push('Medan "type" mesti "calendar".');
      if (!Array.isArray(j.days)) errs.push('Medan "days" tiada atau bukan senarai.');
      else j.days.forEach((d, i) => { if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) errs.push(`days[${i}].date tiada atau bukan format YYYY-MM-DD.`); else if (typeof d.schoolDay !== 'boolean') errs.push(`days[${i}].schoolDay mesti true/false (${d.date}).`); });
      if (!Array.isArray(j.weeks)) errs.push('Medan "weeks" tiada atau bukan senarai.');
      else j.weeks.forEach((w, i) => { if (!Number.isFinite(+w.week) || !w.start) errs.push(`weeks[${i}] perlu "week" dan "start".`); });
    }
    if (errs.length) return K().errorsModal(errs, { intro: `Fail "${f.name}" bukan takwim yang sah.` });
    if ((cal().days || []).length && !(await confirm({ title: 'Ganti takwim?', danger: true, confirmLabel: 'Ganti', message: `Takwim tahun akademik ${st().activeYear()} akan diganti dengan ${f.name}. RPH sedia ada tidak diubah.` }))) return;
    st().put('calendar', { ...j, days: j.days.map(d => ({ dow: U.dow(d.date), dayName: U.dayNameMs(U.dow(d.date)), events: [], holiday: null, ...d })), academicYearId: st().activeYear(), importedFrom: f.name });
    toast('Takwim diimport.', 'success'); draw();
  }

  // ------------------------------------------------------------------ Paparan
  let root = null, alive = () => false;
  function draw() {
    if (!alive()) return;
    clear(root);
    const c = cal();
    const ayId = st().activeYear();
    if (state.year == null) { const t = RPH.cal.today(); state.year = +t.slice(0, 4); state.month = +t.slice(5, 7); }
    root.append(RPH.ui.pageHeader(`Takwim Sekolah ${ayId}`, [c.school, c.group ? `Kumpulan ${c.group}` : null, c.source && c.source.file ? `Sumber: ${c.source.file}` : null].filter(Boolean).join(' · ') || 'Minggu sekolah ikut takwim (bukan minggu ISO).', [
      button('Import JSON', { icon: 'upload', onClick: importCalendar }),
      button('Eksport JSON', { icon: 'download', disabled: !(c.days || []).length, onClick: () => K().downloadJson(`takwim-${ayId}.json`, c) }),
      button('Kira Semula Minggu', { icon: 'refresh', disabled: !(c.weeks || []).length, onClick: () => { mutate(() => {}); toast('Bilangan hari persekolahan setiap minggu dikira semula.', 'success'); draw(); } }),
      button('Tambah Acara / Cuti', { kind: 'primary', icon: 'plus', onClick: () => eventForm(null) }),
    ]));
    if (!(c.days || []).length) {
      const imp = K().importBtn ? K().importBtn('takwim', 'Import Takwim (PDF/DOCX/Excel)', 'primary') : null;
      root.appendChild(RPH.ui.card({ body: h('div', { class: 'stack' }, empty(`Takwim tahun akademik ${ayId} belum ada. Import takwim sekolah anda, atau jana takwim asas (Isnin–Jumaat) daripada tarikh sesi dan tandakan cuti sendiri.`),
        h('div', { class: 'row adm-center' }, imp, button('Jana Takwim Asas', { kind: imp ? null : 'primary', icon: 'calendar', onClick: generateBase }), button('Import JSON', { icon: 'upload', onClick: importCalendar }),
          RPH.onboarding ? button('Mula di sini', { icon: 'list', onClick: () => RPH.router.go('dashboard', null, { setup: 1 }) }) : null)) }));
      return;
    }
    const today = RPH.cal.today(); const sw = RPH.cal.schoolWeek(today); const w = sw != null ? RPH.cal.week(sw) : null;
    const total = (c.days || []).filter(d => d.schoolDay).length;
    root.appendChild(h('div', { class: 'grid grid-4 adm-gap' },
      RPH.ui.stat('Minggu sekolah kini', sw != null ? `M${sw}` : '—', w ? `${U.fmtDate(w.start)} – ${U.fmtDate(w.end)}` : 'Bukan minggu persekolahan'),
      RPH.ui.stat('Minggu RPT kini', sw != null ? `M${RPH.cal.rptWeek(sw)}` : '—', `Padanan ${(st().academicYear() || {}).rptWeekMapping || (c.rptWeekMap || {}).default || 'A'}`),
      RPH.ui.stat('Jumlah minggu', String((c.weeks || []).length), `${total} hari persekolahan`),
      RPH.ui.stat('Hari ini', U.fmtDate(today), RPH.cal.isSchoolDay(today) ? 'Hari persekolahan' : (RPH.cal.day(today).holiday || 'Bukan hari persekolahan'))));
    root.appendChild(tabs([{ id: 'cal', label: 'Kalendar' }, { id: 'weeks', label: 'Senarai minggu' }, { id: 'rpt', label: 'Minggu RPT (A/B)' }], state.tab, id => { state.tab = id; draw(); }));
    root.appendChild(state.tab === 'weeks' ? weeksTab() : state.tab === 'rpt' ? rptTab() : RPH.ui.card({ body: calTab() }));
  }

  RPH.views.takwim = {
    title: 'Takwim', icon: 'calendar',
    render(el, params) {
      root = el; alive = K().mount(el, 'takwim');
      if (params && params.tab) state.tab = params.tab;
      if (params && params.date) { state.year = +params.date.slice(0, 4); state.month = +params.date.slice(5, 7); }
      draw();
    },
  };
})(window.RPH = window.RPH || {});
