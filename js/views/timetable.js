/* Jadual Waktu boleh disunting + versi (master prompt §15, §16). RPH lama menyimpan timetableVersionId
   dan salinan masa/kelas sendiri — mencipta versi baharu tidak mengubah RPH sedia ada. */
(function (RPH) {
  'use strict';
  const { h, icon, button, confirm, toast, clear, empty, tabs, select } = RPH.ui;
  const U = RPH.util;
  const K = () => RPH.adminKit;
  const st = () => RPH.store;

  const state = { versionId: null, tab: 'grid' };
  const DAYS = [1, 2, 3, 4, 5];
  const KINDS = [{ value: 'PdP', label: 'PdP (RPH dijana)' }, { value: 'non-PdP', label: 'Bukan PdP (cth. perhimpunan)' }, { value: 'unavailable', label: 'Tidak tersedia' }];

  const tt = () => st().get('timetable') || { versions: [], periodGrid: [] };
  const version = id => (tt().versions || []).find(v => v.id === id) || null;
  const mutate = fn => st().update('timetable', d => { d.versions = d.versions || []; fn(d); });
  const mins = (a, b) => U.minutesBetween(a, b);
  const subjectLabel = s => (s ? s.timetableLabel || s.code || s.id : '');

  // ------------------------------------------------------------------ Analisis
  function overlaps(slots) {
    const bad = new Map();
    const byDay = U.groupBy(slots.filter(s => s.start && s.end), s => s.day);
    Object.values(byDay).forEach(list => {
      list.sort((a, b) => a.start.localeCompare(b.start));
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (b.start >= a.end) break;
        if (a.start < b.end && b.start < a.end) { (bad.get(a.id) || bad.set(a.id, []).get(a.id)).push(b); (bad.get(b.id) || bad.set(b.id, []).get(b.id)).push(a); }
      }
    });
    return bad;
  }
  const slotMinutes = s => s.minutes || (s.start && s.end ? mins(s.start, s.end) : 0);
  function declaredFor(v, s, slotLabels) {
    const d = v.declaredTotals || {};
    for (const k of [s && s.timetableLabel, s && s.id, s && s.code, ...slotLabels]) if (k && d[k] != null) return { key: k, value: d[k] };
    return null;
  }
  function totals(v) {
    const pdp = (v.slots || []).filter(s => s.kind === 'PdP');
    const groups = U.groupBy(pdp, s => s.subjectId || `?${s.label}`);
    const rows = Object.entries(groups).map(([sid, list]) => {
      const s = st().subject(sid);
      const m = U.sum(list.map(slotMinutes));
      const dec = declaredFor(v, s, [...new Set(list.map(x => x.label))]);
      return { sid, s, label: s ? `${s.name.ms} (${subjectLabel(s)})` : list[0].label || sid, slots: list.length, minutes: m, periods: m / 30, declared: dec, untimed: list.filter(x => !x.start).length };
    }).sort((a, b) => b.periods - a.periods);
    const totalP = U.sum(rows.map(r => r.periods));
    return { rows, totalP, declaredTotal: (v.declaredTotals || {}).total };
  }

  // ------------------------------------------------------------------ Borang slot
  function slotForm(v, slot, preset = {}, { duplicate = false } = {}) {
    const isNew = !slot || duplicate;
    const base = slot ? { ...slot, ...preset } : { kind: 'PdP', day: 1, coTeachers: [], ...preset };
    const classes = st().classes();
    const classOpts = cls => cls.map(c => ({ value: c.id, label: `${c.name} (Tahun ${c.year})` }));
    let lastAutoLabel = subjectLabel(st().subject(base.subjectId));
    K().formModal({
      title: duplicate ? 'Salin slot' : isNew ? `Tambah slot — versi ${v.id}` : `Sunting slot — ${base.dayName || U.dayNameMs(base.day)} ${base.start || ''}`, size: 'md',
      intro: duplicate ? 'Tukar hari/masa/kelas bagi salinan, kemudian simpan.' : null,
      values: { day: String(base.day), start: base.start || '', end: base.end || '', kind: base.kind, subjectId: base.subjectId || '', label: base.label || '', year: base.year != null ? String(base.year) : '', classId: base.classId || '', coTeachers: base.coTeachers || [], note: base.note || '', rph: base.rph !== false },
      fields: [
        { key: 'day', label: 'Hari', type: 'select', required: true, options: [1, 2, 3, 4, 5, 6].map(d => ({ value: String(d), label: U.dayNameMs(d) })) },
        { key: 'kind', label: 'Jenis', type: 'select', options: KINDS },
        { key: 'start', label: 'Masa mula', type: 'time', required: true },
        { key: 'end', label: 'Masa tamat', type: 'time', required: true },
        { key: 'subjectId', label: 'Subjek', type: 'select', options: K().subjectOptions(), placeholder: '— Tiada —', onChange: (val, c) => {
          const s = st().subject(val);
          if (c.label.get() === '' || c.label.get() === lastAutoLabel) { lastAutoLabel = subjectLabel(s); c.label.set(lastAutoLabel); }
        } },
        { key: 'label', label: 'Label paparan', placeholder: 'cth. BA / PAI / PH' },
        { key: 'classId', label: 'Kelas', type: 'select', options: classOpts(classes), placeholder: '— Tiada —', onChange: (val, c) => { const k = classes.find(x => x.id === val); if (k) c.year.set(String(k.year)); } },
        { key: 'year', label: 'Tahun', type: 'select', options: [1, 2, 3, 4, 5, 6].map(y => ({ value: String(y), label: `Tahun ${y}` })), placeholder: '—' },
        { key: 'coTeachers', label: 'Guru bersama (pisahkan dengan koma)', type: 'list', full: true, placeholder: 'cth. ALI, HASIKIN' },
        { key: 'note', label: 'Catatan', type: 'textarea', rows: 2, full: true },
        { key: 'rph', type: 'checkbox', full: true, text: 'Jana RPH untuk slot ini (nyahtanda jika slot ini tidak memerlukan RPH, cth. PAI Tahun 3)' },
      ],
      async onSave(x) {
        if (x.end <= x.start) return 'Masa tamat mesti selepas masa mula.';
        if (x.kind === 'PdP' && !x.subjectId) return 'Slot PdP memerlukan subjek.';
        if (x.kind === 'PdP' && !x.classId) return 'Slot PdP memerlukan kelas.';
        const day = +x.day;
        const cls = classes.find(c => c.id === x.classId);
        const others = (version(v.id).slots || []).filter(s => isNew || s.id !== slot.id);
        const clash = others.filter(s => s.day === day && s.start && s.end && x.start < s.end && s.start < x.end);
        if (clash.length && !(await confirm({ title: 'Slot bertindih', message: `Slot ini bertindih dengan:\n${clash.map(s => `• ${s.dayName || U.dayNameMs(s.day)} ${s.start}–${s.end} ${s.label || ''} ${s.className || ''}`).join('\n')}\n\nSimpan juga?`, confirmLabel: 'Simpan juga' }))) return false;
        const rec = {
          ...(isNew ? {} : U.clone(slot)), day, dayName: U.dayNameMs(day), start: x.start, end: x.end, minutes: mins(x.start, x.end), kind: x.kind,
          subjectId: x.subjectId || null, label: x.label || subjectLabel(st().subject(x.subjectId)) || '—', year: x.year ? +x.year : (cls ? cls.year : null),
          classId: x.classId || null, className: cls ? cls.name : null, coTeachers: x.coTeachers, note: x.note || null,
        };
        if (x.rph === false && rec.kind === 'PdP') rec.rph = false; else { delete rec.rph; delete rec.rphNote; }
        if (isNew) { rec.id = K().uniqueId(`${v.id}-${day}-${x.start}-${x.classId || U.slug(rec.label) || 'slot'}`, id => others.some(s => s.id === id)); rec.source = 'manual'; rec.createdAt = U.nowIso(); }
        else rec.updatedAt = U.nowIso();
        mutate(d => {
          const vv = d.versions.find(z => z.id === v.id);
          const i = vv.slots.findIndex(s => s.id === rec.id);
          if (i >= 0) vv.slots[i] = rec; else vv.slots.push(rec);
          vv.slots.sort((a, b) => a.day - b.day || String(a.start || '').localeCompare(String(b.start || '')));
        });
        toast(isNew ? 'Slot ditambah.' : 'Slot disimpan.', 'success');
        draw();
      },
      extraActions: !isNew ? [{ label: 'Padam slot', kind: 'danger', icon: 'trash', onClick: () => removeSlot(v, slot) }] : [],
    });
  }

  async function removeSlot(v, slot) {
    const used = st().rphList().filter(r => r.slotId === slot.id).length;
    if (!(await confirm({ title: 'Padam slot', danger: true, confirmLabel: 'Padam', message: `Padam slot ${slot.dayName || U.dayNameMs(slot.day)} ${slot.start || ''}–${slot.end || ''} ${slot.label || ''} ${slot.className || ''}?${used ? `\n${used} RPH merujuk slot ini — RPH tersebut kekal tidak berubah.` : ''}` }))) return false;
    mutate(d => { const vv = d.versions.find(z => z.id === v.id); vv.slots = vv.slots.filter(s => s.id !== slot.id); });
    toast('Slot dipadam.', 'success'); draw();
    return true;
  }

  // ------------------------------------------------------------------ Versi
  function versionForm(v, preset = {}) {
    const isNew = !v;
    const vs = tt().versions || [];
    const today = RPH.cal.today();
    const fields = [
      { key: 'id', label: 'Nombor versi', required: true, readonly: !isNew, placeholder: 'cth. 4.2', hint: isNew ? 'cth. "4.2" — dirujuk oleh RPH (timetableVersionId).' : null },
      { key: 'label', label: 'Label', placeholder: 'cth. Jadual Waktu Bil 4.2 2026', full: true },
      { key: 'effectiveFrom', label: 'Berkuat kuasa mulai', type: 'date', required: isNew },
      { key: 'effectiveTo', label: 'Tamat (pilihan)', type: 'date' },
    ];
    if (isNew) {
      fields.push({ key: 'copyFrom', label: 'Salin slot daripada', type: 'select', options: vs.map(x => ({ value: x.id, label: `${x.id} — ${x.label || ''}` })), placeholder: '— Mula kosong —' });
      fields.push({ key: 'endPrev', type: 'checkbox', text: 'Tamatkan versi yang bertindih sehari sebelum tarikh mula versi baharu' });
      fields.push({ type: 'info', label: 'RPH sedia ada tidak berubah: setiap RPH menyimpan versi jadual (timetableVersionId), masa dan kelasnya sendiri.' });
    } else {
      fields.push({ key: 'partial', type: 'checkbox', text: 'Versi separa (tidak lengkap)' });
      fields.push({ key: 'preparedBy', label: 'Disediakan oleh' }, { key: 'approvedBy', label: 'Diluluskan oleh' });
      fields.push({ key: 'declared', label: 'Jumlah waktu diisytiharkan (satu baris: LABEL=bil)', type: 'lines', rows: 4, placeholder: 'BA=15\nPAI=4\ntotal=29', hint: 'Bilangan waktu 30 minit ikut label dalam jadual rasmi.' });
      fields.push({ key: 'note', label: 'Catatan', type: 'textarea', rows: 3 });
    }
    const latest = vs.slice().sort((a, b) => String(b.effectiveFrom || '').localeCompare(String(a.effectiveFrom || '')))[0];
    K().formModal({ title: isNew ? 'Cipta versi jadual baharu' : `Sunting versi ${v.id}`, size: 'md', fields,
      values: isNew ? { id: '', label: '', effectiveFrom: today, copyFrom: preset.copyFrom || (latest ? latest.id : ''), endPrev: true }
        : { ...v, declared: Object.entries(v.declaredTotals || {}).map(([k, x]) => `${k}=${x}`), effectiveFrom: v.effectiveFrom || '', effectiveTo: v.effectiveTo || '' },
      onSave(x) {
        if (isNew && vs.some(z => z.id === x.id)) return `Versi "${x.id}" sudah wujud.`;
        if (x.effectiveFrom && x.effectiveTo && x.effectiveTo < x.effectiveFrom) return 'Tarikh tamat mesti selepas tarikh mula.';
        if (isNew) {
          const src = vs.find(z => z.id === x.copyFrom);
          const slots = src ? U.clone(src.slots || []).map(s => ({ ...s, id: `${x.id}-${s.day}-${s.start || 'x'}-${s.classId || U.slug(s.label || 'slot')}`, copiedFrom: s.id })) : [];
          const seen = new Set(); slots.forEach(s => { let id = s.id, n = 2; while (seen.has(id)) id = `${s.id}-${n++}`; s.id = id; seen.add(id); });
          const nv = { id: x.id, label: x.label || `Jadual Waktu Bil ${x.id}`, effectiveFrom: x.effectiveFrom, effectiveTo: x.effectiveTo || null, generatedOn: today, source: 'manual', partial: false, copiedFrom: src ? src.id : null, declaredTotals: src ? U.clone(src.declaredTotals || {}) : {}, slots };
          const ended = [];
          mutate(d => {
            if (x.endPrev) d.versions.forEach(z => {
              const startsBefore = !z.effectiveFrom || z.effectiveFrom < x.effectiveFrom;
              const runsInto = !z.effectiveTo || z.effectiveTo >= x.effectiveFrom;
              if (startsBefore && runsInto) { z.effectiveTo = U.addDays(x.effectiveFrom, -1); ended.push(z.id); }
            });
            d.versions.push(nv);
          });
          state.versionId = nv.id;
          toast(`Versi ${nv.id} dicipta${src ? ` (salinan ${src.id}, ${slots.length} slot)` : ''}.${ended.length ? ` Versi ${ended.join(', ')} tamat ${U.fmtDate(U.addDays(x.effectiveFrom, -1))}.` : ''}`, 'success', 6000);
        } else {
          const declared = {};
          for (const line of x.declared) { const m = line.match(/^(.+?)\s*[=:]\s*(\d+(?:\.\d+)?)$/); if (!m) return `Baris "${line}" tidak sah — guna format LABEL=bil.`; declared[m[1].trim()] = +m[2]; }
          mutate(d => { const z = d.versions.find(q => q.id === v.id); Object.assign(z, { label: x.label, effectiveFrom: x.effectiveFrom || null, effectiveTo: x.effectiveTo || null, partial: !!x.partial, preparedBy: x.preparedBy || undefined, approvedBy: x.approvedBy || undefined, note: x.note || undefined, declaredTotals: declared }); });
          toast('Versi disimpan.', 'success');
        }
        draw();
      } });
  }

  async function removeVersion(v) {
    const used = st().rphList().filter(r => r.timetableVersionId === v.id).length;
    if (used) return toast(`Versi ${v.id} digunakan oleh ${used} RPH — tidak boleh dipadam (RPH lama mesti kekal).`, 'error', 6000);
    if ((tt().versions || []).length <= 1) return toast('Sekurang-kurangnya satu versi jadual diperlukan.', 'error');
    if (!(await confirm({ title: 'Padam versi', danger: true, confirmLabel: 'Padam', message: `Padam versi ${v.id} (${(v.slots || []).length} slot)?` }))) return;
    mutate(d => { d.versions = d.versions.filter(z => z.id !== v.id); });
    state.versionId = null; toast('Versi dipadam.', 'success'); draw();
  }

  function periodForm() {
    let rows = U.clone(tt().periodGrid || []);
    const host = h('div', { class: 'stack' });
    const paint = () => {
      clear(host);
      host.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'table adm-table-compact' },
        h('thead', null, h('tr', null, ['No.', 'Mula', 'Tamat', 'Rehat?', 'Label', ''].map(x => h('th', null, x)))),
        h('tbody', null, rows.map((p, i) => h('tr', null,
          h('td', null, RPH.ui.input({ type: 'number', value: p.no ?? '', cls: 'input-sm adm-w-num', onInput: val => { p.no = val; } })),
          h('td', null, RPH.ui.input({ type: 'time', value: p.start || '', cls: 'input-sm', onInput: val => { p.start = val; } })),
          h('td', null, RPH.ui.input({ type: 'time', value: p.end || '', cls: 'input-sm', onInput: val => { p.end = val; } })),
          h('td', null, (() => { const cb = h('input', { type: 'checkbox', checked: !!p.break, 'aria-label': 'Waktu rehat' }); cb.addEventListener('change', () => { p.break = cb.checked; if (cb.checked) { p.no = null; p.label = p.label || 'REHAT'; } paint(); }); return cb; })()),
          h('td', null, RPH.ui.input({ value: p.label || '', cls: 'input-sm', placeholder: p.break ? 'REHAT' : '', onInput: val => { p.label = val || undefined; } })),
          h('td', null, K().iconBtn('trash', 'Buang baris', () => { rows.splice(i, 1); paint(); }, 'danger'))))))));
      host.appendChild(button('Tambah waktu', { size: 'sm', icon: 'plus', onClick: () => { const last = rows[rows.length - 1]; const s = last ? last.end : '07:30'; const [hh, mm] = s.split(':').map(Number); const e = `${U.pad(hh + Math.floor((mm + 30) / 60))}:${U.pad((mm + 30) % 60)}`; rows.push({ no: rows.filter(r => !r.break).length + 1, start: s, end: e }); paint(); } }));
    };
    paint();
    K().formModal({ title: 'Waktu (period) sekolah', size: 'lg', intro: 'Lajur grid jadual. Ubah jika masa sekolah berubah (cth. bertukar sekolah atau sesi).',
      fields: [{ key: '_rows', type: 'custom', full: true, render: () => host }],
      onSave() {
        for (const p of rows) { if (!p.start || !p.end) return 'Setiap waktu perlu masa mula dan tamat.'; if (p.end <= p.start) return `Waktu ${p.start}–${p.end} tidak sah.`; }
        rows.sort((a, b) => a.start.localeCompare(b.start));
        for (let i = 1; i < rows.length; i++) if (rows[i].start < rows[i - 1].end) return `Waktu ${rows[i - 1].start}–${rows[i - 1].end} dan ${rows[i].start}–${rows[i].end} bertindih.`;
        st().update('timetable', d => { d.periodGrid = rows.map(p => (p.break ? { no: null, label: p.label || 'REHAT', start: p.start, end: p.end, break: true } : { no: p.no ?? null, start: p.start, end: p.end, ...(p.label ? { label: p.label } : {}) })); });
        toast('Waktu sekolah disimpan.', 'success'); draw();
      } });
  }

  // ------------------------------------------------------------------ Grid
  function gridView(v, bad) {
    const pg = tt().periodGrid || [];
    if (!pg.length) return empty('Waktu (period) sekolah belum ditetapkan.', button('Tetapkan waktu', { kind: 'primary', onClick: periodForm }));
    const n = pg.length;
    const colStart = t => { let i = pg.findIndex(p => t >= p.start && t < p.end); if (i < 0 && t < pg[0].start) i = 0; return i; };
    const colEnd = t => { for (let i = n - 1; i >= 0; i--) if (pg[i].start < t) return i; return -1; };
    const slots = v.slots || [];
    const days = slots.some(s => s.day === 6) ? [...DAYS, 6] : DAYS;
    const outside = [];
    const lanes = [];
    const cols = `repeat(${n}, minmax(0, 1fr))`;
    lanes.push(h('div', { class: 'tt-row tt-head' }, h('div', { class: 'tt-day' }, ''), h('div', { class: 'tt-lane', style: { gridTemplateColumns: cols } },
      pg.map(p => h('div', { class: ['tt-hcell', p.break ? 'is-break' : null] }, h('div', { class: 'tt-hno' }, p.break ? (p.label || 'REHAT') : (p.no != null ? `${p.no}` : '')), h('div', { class: 'tt-htime' }, `${U.fmtTime12(p.start)}–${U.fmtTime12(p.end)}`))))));
    for (const day of days) {
      const ds = slots.filter(s => s.day === day);
      const covered = new Set();
      const blocks = [];
      for (const s of ds) {
        if (!s.start || !s.end) { outside.push(s); continue; }
        const c0 = colStart(s.start), c1 = colEnd(s.end);
        if (c0 < 0 || c1 < c0) { outside.push(s); continue; }
        for (let i = c0; i <= c1; i++) covered.add(i);
        const subj = st().subject(s.subjectId);
        const cls = ['tt-slot', `kind-${U.slug(s.kind || 'pdp')}`, bad.has(s.id) ? 'is-overlap' : null];
        blocks.push(K().cssVar(h('button', { type: 'button', class: cls, style: { gridColumn: `${c0 + 1} / span ${c1 - c0 + 1}` },
          title: `${U.dayNameMs(day)} ${s.start}–${s.end} · ${s.label || ''} ${s.className || ''}${(s.coTeachers || []).length ? ` · Guru bersama: ${s.coTeachers.join(', ')}` : ''}${bad.has(s.id) ? ' · BERTINDIH' : ''}${s.note ? ` · ${s.note}` : ''}`,
          onClick: () => slotForm(v, s) },
          h('span', { class: 'tt-slot-label' }, s.kind === 'unavailable' ? '—' : (s.label || '—')),
          s.className ? h('span', { class: 'tt-slot-class' }, s.className) : null,
          h('span', { class: 'tt-slot-time' }, `${U.fmtTime12(s.start)}–${U.fmtTime12(s.end)}`),
          (s.coTeachers || []).length ? h('span', { class: 'tt-slot-co' }, `+${s.coTeachers.length} guru`) : null,
          s.kind === 'PdP' && s.rph === false ? h('span', { class: 'tt-slot-co', title: s.rphNote || 'Slot ini tidak dijana RPH' }, 'Tiada RPH') : null,
          bad.has(s.id) ? h('span', { class: 'tt-slot-warn' }, icon('alert', 12)) : null), '--c', s.kind === 'PdP' ? ((subj && subj.color) || '#64748b') : null));
      }
      const cells = pg.map((p, i) => {
        if (covered.has(i)) return null;
        if (p.break) return h('div', { class: 'tt-break', style: { gridColumn: `${i + 1}`, gridRow: '1' } }, h('span', null, p.label || 'REHAT'));
        return h('button', { type: 'button', class: 'tt-empty', style: { gridColumn: `${i + 1}`, gridRow: '1' }, title: `Tambah slot ${U.dayNameMs(day)} ${p.start}`, 'aria-label': `Tambah slot ${U.dayNameMs(day)} ${p.start}`, onClick: () => slotForm(v, null, { day, start: p.start, end: p.end }) }, '+');
      });
      lanes.push(h('div', { class: 'tt-row' }, h('div', { class: 'tt-day' }, U.dayNameMs(day)), h('div', { class: 'tt-lane', style: { gridTemplateColumns: cols } }, cells, blocks)));
    }
    return h('div', { class: 'stack' },
      h('div', { class: 'tt-scroll' }, h('div', { class: 'tt-grid', style: { minWidth: `${84 + n * 68}px` } }, lanes)),
      legend(),
      outside.length ? h('div', { class: 'notice' }, icon('alert'), h('div', null, h('strong', null, `${outside.length} slot tanpa masa / di luar grid`), h('div', { class: 'small' }, 'Slot ini tidak dapat dipaparkan dalam grid. Klik untuk menyunting masa.'),
        h('div', { class: 'pill-list adm-gap-sm' }, outside.map(s => h('button', { type: 'button', class: 'btn btn-sm', onClick: () => slotForm(v, s) }, `${s.dayName || U.dayNameMs(s.day)} · ${s.label || ''} ${s.className || ''} (${s.start ? `${s.start}–${s.end}` : 'tiada masa'})`))))) : null);
  }

  function legend() {
    const subs = st().subjects();
    return h('div', { class: 'tt-legend' }, subs.map(s => h('span', { class: 'tt-leg' }, h('i', { style: { background: s.color || '#64748b' } }), subjectLabel(s), ' ', h('span', { class: 'muted' }, s.name.ms))),
      h('span', { class: 'tt-leg' }, h('i', { class: 'leg-nonpdp' }), 'Bukan PdP'), h('span', { class: 'tt-leg' }, h('i', { class: 'leg-unavail' }), 'Tidak tersedia'), h('span', { class: 'tt-leg' }, h('i', { class: 'leg-overlap' }), 'Bertindih'));
  }

  function listView(v, bad) {
    const slots = (v.slots || []).slice().sort((a, b) => a.day - b.day || String(a.start || '').localeCompare(String(b.start || '')));
    if (!slots.length) return empty('Tiada slot dalam versi ini.', button('Tambah Slot', { kind: 'primary', icon: 'plus', onClick: () => slotForm(v, null) }));
    return h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, ['Hari', 'Masa', 'Jenis', 'Subjek', 'Kelas', 'Guru bersama', 'Catatan', ''].map(x => h('th', null, x)))),
      h('tbody', null, slots.map(s => {
        const subj = st().subject(s.subjectId);
        return h('tr', { class: bad.has(s.id) ? 'adm-row-bad' : null },
          h('td', null, s.dayName || U.dayNameMs(s.day)),
          h('td', { class: 'adm-nowrap' }, s.start ? `${s.start}–${s.end}` : h('span', { class: 'badge badge-amber' }, 'tiada masa'), s.minutes ? h('div', { class: 'muted small' }, `${s.minutes} min`) : null),
          h('td', null, h('span', { class: ['badge', s.kind === 'PdP' ? 'badge-green' : s.kind === 'unavailable' ? 'badge-slate' : 'badge-violet'] }, s.kind)),
          h('td', null, subj ? K().subjectLabel(subj) : (s.label || '—'), subj && s.label && s.label !== subjectLabel(subj) ? h('div', { class: 'muted small' }, s.label) : null),
          h('td', null, s.className || '—', s.year ? h('div', { class: 'muted small' }, `Tahun ${s.year}`) : null),
          h('td', { class: 'small' }, (s.coTeachers || []).join(', ') || '—'),
          h('td', { class: 'small' }, bad.has(s.id) ? h('div', { class: 'badge badge-red' }, 'Bertindih') : null, K().mixed(s.note || '')),
          h('td', { class: 'adm-actions-cell' }, h('div', { class: 'row adm-tight' },
            K().iconBtn('edit', 'Sunting', () => slotForm(v, s)),
            K().iconBtn('copy', 'Salin ke hari/masa lain', () => slotForm(v, s, {}, { duplicate: true })),
            K().iconBtn('trash', 'Padam', () => removeSlot(v, s), 'danger'))));
      }))));
  }

  function totalsCard(v) {
    const t = totals(v);
    const decTotal = t.declaredTotal;
    return RPH.ui.card({ title: 'Jumlah waktu ikut subjek', subtitle: '1 waktu = 30 minit. Dibandingkan dengan jumlah dalam jadual rasmi.', body:
      t.rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table adm-table-compact' },
        h('thead', null, h('tr', null, h('th', null, 'Subjek'), h('th', { class: 'num' }, 'Slot'), h('th', { class: 'num' }, 'Waktu'), h('th', { class: 'num' }, 'Minit'), h('th', { class: 'num' }, 'Diisytihar'), h('th', null, 'Status'))),
        h('tbody', null, t.rows.map(r => h('tr', null,
          h('td', null, r.s ? K().dot(r.s.color) : null, r.label, r.untimed ? h('div', { class: 'muted small' }, `${r.untimed} slot tanpa masa`) : null),
          h('td', { class: 'num' }, String(r.slots)), h('td', { class: 'num strong' }, String(+r.periods.toFixed(1))), h('td', { class: 'num' }, String(r.minutes)),
          h('td', { class: 'num' }, r.declared ? `${r.declared.value}` : '—'),
          h('td', null, !r.declared ? h('span', { class: 'muted small' }, 'Tiada rujukan') : r.declared.value === r.periods ? h('span', { class: 'badge badge-green' }, 'Sepadan') : h('span', { class: 'badge badge-red' }, `Beza ${+(r.periods - r.declared.value).toFixed(1)}`)))),
          h('tr', { class: 'adm-total' }, h('td', null, 'Jumlah'), h('td', { class: 'num' }, String(U.sum(t.rows.map(r => r.slots)))), h('td', { class: 'num strong' }, String(+t.totalP.toFixed(1))), h('td', { class: 'num' }, String(U.sum(t.rows.map(r => r.minutes)))),
            h('td', { class: 'num' }, decTotal != null ? String(decTotal) : '—'),
            h('td', null, decTotal == null ? '' : decTotal === t.totalP ? h('span', { class: 'badge badge-green' }, 'Sepadan') : h('span', { class: 'badge badge-red' }, `Beza ${+(t.totalP - decTotal).toFixed(1)}`)))))) : empty('Tiada slot PdP.') });
  }

  // ------------------------------------------------------------------ Paparan utama
  let root = null, alive = () => false;
  function draw() {
    if (!alive()) return;
    clear(root);
    const T = tt();
    const vs = T.versions || [];
    const today = RPH.cal.today();
    const activeV = RPH.cal.timetableVersionFor(today);
    if (!version(state.versionId)) state.versionId = (activeV && activeV.id) || (vs[0] && vs[0].id) || null;
    const v = version(state.versionId);
    root.append(RPH.ui.pageHeader('Jadual Waktu', `Tahun akademik ${st().activeYear()} · Jadual berversi; RPH lama kekal dengan versi asalnya.`, [
      button('Waktu Sekolah', { icon: 'clock', onClick: periodForm }),
      button('Versi Baharu', { icon: 'copy', onClick: () => versionForm(null) }),
      v ? button('Tambah Slot', { kind: 'primary', icon: 'plus', onClick: () => slotForm(v, null) }) : null,
    ]));
    const gap = RPH.onboarding ? RPH.onboarding.gapNotice(['subjek', 'kelas'], 'slot jadual merujuk subjek dan kelas') : null;
    if (gap) { gap.classList.add('adm-gap'); root.appendChild(gap); }

    // Senarai versi
    root.appendChild(RPH.ui.card({ title: 'Versi jadual', subtitle: activeV ? `Berkuat kuasa hari ini (${U.fmtDate(today)}): versi ${activeV.id}` : 'Tiada versi berkuat kuasa hari ini.', body:
      vs.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table adm-table-compact' },
        h('thead', null, h('tr', null, ['Versi', 'Label', 'Berkuat kuasa', 'Slot', 'Status', ''].map(x => h('th', null, x)))),
        h('tbody', null, vs.map(x => h('tr', { class: ['clickable', x.id === state.versionId ? 'adm-selected' : null], onClick: e => { if (e.target.closest('button')) return; state.versionId = x.id; draw(); } },
          h('td', null, h('strong', null, x.id)),
          h('td', null, K().mixed(x.label || ''), x.note ? h('div', { class: 'muted small adm-clamp' }, x.note) : null),
          h('td', { class: 'adm-nowrap' }, `${x.effectiveFrom ? U.fmtDate(x.effectiveFrom) : 'awal tahun'} – ${x.effectiveTo ? U.fmtDate(x.effectiveTo) : 'kini'}`),
          h('td', { class: 'num' }, String((x.slots || []).length)),
          h('td', null, h('div', { class: 'pill-list' }, activeV && activeV.id === x.id ? h('span', { class: 'badge badge-green' }, 'Aktif hari ini') : null, x.partial ? h('span', { class: 'badge badge-amber' }, 'Separa') : null, x.id === state.versionId ? h('span', { class: 'badge badge-blue' }, 'Dipaparkan') : null)),
          h('td', { class: 'adm-actions-cell' }, h('div', { class: 'row adm-tight' },
            K().iconBtn('edit', 'Sunting maklumat versi', () => versionForm(x)),
            K().iconBtn('copy', 'Cipta versi baharu daripada ini', () => versionForm(null, { copyFrom: x.id })),
            K().iconBtn('trash', 'Padam versi', () => removeVersion(x), 'danger')))))))) : K().emptyImport(`Tiada jadual waktu untuk tahun akademik ${st().activeYear()}. Import jadual waktu sekolah anda, atau cipta versi dan tambah slot sendiri.`, 'jadual', button('Cipta Versi', { kind: 'primary', onClick: () => versionForm(null) })) }));
    if (!v) return;

    const bad = overlaps(v.slots || []);
    const head = h('div', { class: 'adm-vhead' },
      h('div', null, h('h2', null, `Versi ${v.id}`, ' ', h('span', { class: 'muted small' }, v.label || '')),
        h('div', { class: 'muted small' }, [v.preparedBy ? `Disediakan: ${v.preparedBy}` : null, v.approvedBy ? `Diluluskan: ${v.approvedBy}` : null, v.source ? `Sumber: ${v.source}` : null].filter(Boolean).join(' · '))),
      h('div', { class: 'row' }, h('label', { class: 'small muted', for: 'tt-vsel' }, 'Versi:'), (() => { const s = select({ options: vs.map(x => ({ value: x.id, label: x.id })), value: v.id, cls: 'input-sm', onChange: id => { state.versionId = id; draw(); } }); s.id = 'tt-vsel'; return s; })()));
    root.appendChild(h('section', { class: 'card adm-gap' }, h('div', { class: 'card-body stack' },
      head,
      bad.size ? h('div', { class: 'notice notice-error' }, icon('alert'), h('div', null, h('strong', null, `${bad.size} slot bertindih`), h('div', { class: 'small' }, [...bad.keys()].map(id => { const s = v.slots.find(z => z.id === id); return `${s.dayName || U.dayNameMs(s.day)} ${s.start}–${s.end} ${s.label || ''} ${s.className || ''}`; }).join(' · ')))) : null,
      v.partial ? h('div', { class: 'notice' }, icon('info'), h('span', null, v.note || 'Versi separa — sesetengah slot tidak diketahui.')) : null,
      tabs([{ id: 'grid', label: 'Grid mingguan' }, { id: 'list', label: `Senarai slot (${(v.slots || []).length})` }], state.tab, id => { state.tab = id; draw(); }),
      state.tab === 'list' ? listView(v, bad) : gridView(v, bad))));
    root.appendChild(totalsCard(v));
  }

  RPH.views.jadual = {
    title: 'Jadual Waktu', icon: 'clock',
    render(el, params) {
      root = el; alive = K().mount(el, 'jadual');
      if (params && params.version) state.versionId = params.version;
      draw();
    },
    _overlaps: overlaps, _totals: totals,
  };
})(window.RPH = window.RPH || {});
