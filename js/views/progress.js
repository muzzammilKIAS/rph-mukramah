/* Paparan Kemajuan DSKP (#/kemajuan, master prompt §42):
   SK | SP | Belum | Dirancang | Telah Diajar | Ulang | Ditangguhkan (+ sejarah diimport), liputan ikut bidang. */
(function (RPH) {
  'use strict';
  const h = (...a) => RPH.ui.h(...a);
  /** Tambah anak (rata, langkau null/false) — Element.append() asli menukar null kepada teks "null". */
  const add = (el, ...kids) => RPH.ui.append(el, kids);
  const S = () => RPH.store;
  const K = () => RPH.rphKit;
  const st = { combo: null, show: 'all' };

  const BUCKET = { draft: 'planned', siap: 'planned', selesai: 'taught', ditangguhkan: 'postponed', dibawa: 'postponed' };
  const SHOW = [
    { value: 'all', label: 'Semua SP' }, { value: 'belum', label: 'Belum sahaja' }, { value: 'planned', label: 'Dirancang' },
    { value: 'taught', label: 'Telah diajar' }, { value: 'postponed', label: 'Ditangguhkan' },
  ];

  /** Gabungan kurikulum (subjek+tahun) yang relevan untuk guru ini. */
  function combos() {
    const out = new Map();
    const addCombo = (subjectId, year) => {
      if (!subjectId || !year) return;
      const cid = S().curriculumId(subjectId, year);
      if (!out.has(cid)) out.set(cid, { cid, subjectId: subjectId === 'PIQ' ? 'PI' : subjectId, year: +year, subjects: new Set(), has: !!S().curriculum(subjectId, year) });
      out.get(cid).subjects.add(subjectId);
    };
    const tt = S().get('timetable') || { versions: [] };
    (tt.versions || []).forEach(v => (v.slots || []).forEach(s => s.kind === 'PdP' && s.rph !== false && addCombo(s.subjectId, s.year)));
    S().rphList().forEach(r => addCombo(r.subjectId, r.year));
    const hist = S().get('history');
    ((hist && hist.entries) || []).forEach(e => addCombo(e.subjectId, e.year));
    return [...out.values()].filter(c => c.subjectId !== 'TASMIK').sort((a, b) => a.cid.localeCompare(b.cid));
  }

  function compute(c) {
    const k = K();
    const rphs = S().rphList().filter(r => S().curriculumId(r.subjectId, r.year) === c.cid);
    const hist = ((S().get('history') || {}).entries || []).filter(e => e.subjectId && S().curriculumId(e.subjectId, e.year) === c.cid);
    const stats = new Map();
    const get = code => { if (!stats.has(code)) stats.set(code, { planned: 0, taught: 0, postponed: 0, other: 0, hist: 0, ids: [] }); return stats.get(code); };
    rphs.forEach(r => {
      const b = BUCKET[r.status] || 'other';
      new Set([...k.skOf(r), ...k.spOf(r)]).forEach(code => { const s = get(code); s[b]++; s.ids.push(r.id); });
    });
    hist.forEach(e => new Set([...(e.sk || []), ...(e.sp || [])]).forEach(code => { get(code).hist++; }));
    return { rphs, hist, stats, get: code => stats.get(code) || { planned: 0, taught: 0, postponed: 0, other: 0, hist: 0, ids: [] } };
  }
  const stateOf = s => (s.taught ? 'taught' : s.planned ? 'planned' : s.postponed ? 'postponed' : 'belum');

  function render(el) {
    const { ui } = RPH; const k = K();
    if (!k) { el.appendChild(ui.empty('Kit paparan (dashboard.js) tidak dimuatkan.')); return; }
    ui.clear(el);
    add(el, ui.pageHeader('Kemajuan DSKP', 'Liputan Standard Kandungan & Standard Pembelajaran berdasarkan status RPH.'));
    const list = combos();
    const ob = RPH.onboarding;
    const dskpActions = () => h('div', { class: 'rphv-notice-actions' },
      ob ? ob.importButton('dskp', { label: 'Import DSKP', kind: 'primary' }) : null,
      ui.button('DSKP', { size: 'sm', icon: 'book', onClick: () => RPH.router.go('dskp') }),
      ui.button('Tetapan → Data', { size: 'sm', icon: 'settings', onClick: () => RPH.router.go('tetapan', null, { tab: 'data' }) }));
    if (!S().hasPrivateData()) add(el, k.notice(`DSKP belum dimuatkan — kemajuan tidak dapat dikira. Import DSKP melalui ${ob && ob.hasImportView() ? 'Import Data' : 'Tetapan → Data'}.`, 'error', dskpActions()));
    if (!list.length) {
      add(el, ui.empty('Tiada subjek/tahun dalam jadual atau rekod RPH. Kemajuan dikira bagi setiap subjek & tahun dalam jadual waktu.',
        h('div', { class: 'row rphv-empty-actions' },
          ob ? ob.importButton('jadual', { label: 'Import Jadual', size: null }) : null,
          ui.button('Jadual Waktu', { icon: 'clock', onClick: () => RPH.router.go('jadual') }),
          ob ? ui.button('Mula di sini', { icon: 'list', onClick: () => RPH.router.go('dashboard', null, { setup: 1 }) }) : null)));
      return;
    }
    if (!st.combo || !list.some(c => c.cid === st.combo)) st.combo = (list.find(c => c.has) || list[0]).cid;
    const c = list.find(x => x.cid === st.combo);
    add(el, ui.tabs(list.map(x => ({ id: x.cid, label: `${k.subjName(x.subjectId)} · T${x.year}${x.has ? '' : ' (tiada DSKP)'}` })), st.combo, id => { st.combo = id; render(el); }));
    if (!c.has) { add(el, k.notice(`DSKP ${k.subjName(c.subjectId)} Tahun ${c.year} tidak tersedia — kemajuan tidak dapat dikira (perlu semakan guru).`, 'error', S().hasPrivateData() ? dskpActions() : null)); return; }

    const data = compute(c);
    const domains = RPH.curr.domains(c.subjectId, c.year);
    const allSp = domains.flatMap(d => (d.contentStandards || []).flatMap(sk => (sk.learningStandards || []).map(sp => ({ d, sk, sp }))));
    const tally = { belum: 0, planned: 0, taught: 0, postponed: 0 };
    allSp.forEach(x => tally[stateOf(data.get(x.sp.code))]++);
    const pct = n => (allSp.length ? Math.round(n / allSp.length * 100) : 0);

    const lang = c.subjectId === 'BA' ? 'ar' : 'ms-Arab';
    const summary = h('div', { class: 'grid grid-4 rphv-stats' },
      ui.stat('Jumlah SP', allSp.length, `${domains.length} bidang · ${domains.reduce((n, d) => n + (d.contentStandards || []).length, 0)} SK`),
      ui.stat('Telah diajar', `${tally.taught}`, `${pct(tally.taught)}% SP · status Selesai`),
      ui.stat('Dirancang', tally.planned, 'Draft / Siap (belum selesai)', tally.planned ? 'warn' : null),
      ui.stat('Belum', tally.belum, `${pct(tally.belum)}% SP · ${tally.postponed} ditangguhkan`, tally.belum ? 'danger' : null));

    // ---- Liputan ikut bidang ----
    const cover = h('div', { class: 'rphv-cover' }, domains.map(d => {
      const sps = (d.contentStandards || []).flatMap(sk => sk.learningStandards || []);
      const t = { taught: 0, planned: 0, postponed: 0, belum: 0 };
      sps.forEach(sp => t[stateOf(data.get(sp.code))]++);
      const n = sps.length || 1;
      const seg = (key, cls, label) => (t[key] ? h('span', { class: ['rphv-cover-seg', cls], style: { width: `${t[key] / n * 100}%` }, title: `${label}: ${t[key]}` }) : null);
      return h('div', { class: 'rphv-cover-row' },
        h('div', { class: 'rphv-cover-label' }, h('strong', null, `${d.code}. `), d.name && d.name.ms ? d.name.ms : '', d.name && (d.name.ar || d.name.jawi) ? h('span', { class: 'muted' }, ' ', k.rtl(d.name.ar || d.name.jawi, lang)) : null),
        h('div', { class: 'rphv-cover-bar', role: 'img', 'aria-label': `Bidang ${d.code}: ${t.taught} diajar, ${t.planned} dirancang, ${t.postponed} ditangguhkan, ${t.belum} belum daripada ${sps.length} SP` },
          seg('taught', 'is-taught', 'Telah diajar'), seg('planned', 'is-planned', 'Dirancang'), seg('postponed', 'is-postponed', 'Ditangguhkan')),
        h('div', { class: 'rphv-cover-num' }, h('strong', null, `${t.taught}/${sps.length}`), h('span', { class: 'muted small' }, ' diajar')));
    }), h('div', { class: 'rphv-cover-legend' },
      h('span', null, h('i', { class: 'rphv-cover-seg is-taught' }), 'Telah diajar'), h('span', null, h('i', { class: 'rphv-cover-seg is-planned' }), 'Dirancang'),
      h('span', null, h('i', { class: 'rphv-cover-seg is-postponed' }), 'Ditangguhkan'), h('span', null, h('i', { class: 'rphv-cover-seg' }), 'Belum')));

    // ---- Jadual SK | SP ----
    const showSel = ui.select({ options: SHOW, value: st.show, cls: 'input-sm', onChange: v => { st.show = v; render(el); } });
    showSel.setAttribute('aria-label', 'Tapis SP');
    const num = (n, kind, code) => n ? h('a', { class: ['rphv-count', `is-${kind}`], href: `#/rekod?code=${encodeURIComponent(code)}&year=${c.year}`, title: 'Lihat RPH berkaitan' }, String(n)) : h('span', { class: 'rphv-zero' }, '—');
    const rows = [];
    domains.forEach(d => {
      const skRows = [];
      (d.contentStandards || []).forEach(sk => {
        const spRows = (sk.learningStandards || []).filter(sp => st.show === 'all' || stateOf(data.get(sp.code)) === st.show).map(sp => {
          const s = data.get(sp.code); const state = stateOf(s);
          return h('tr', { class: `rphv-prog-${state}` },
            h('td', { class: 'rphv-prog-code muted' }, sk.code),
            h('td', { class: 'rphv-prog-text' }, h('span', { class: 'rphv-prog-spcode' }, sp.code), K().rtlBlock(sp.text, lang, 'rphv-prog-sptext')),
            h('td', { class: 'num' }, state === 'belum' ? h('span', { class: 'badge badge-red' }, 'Belum') : h('span', { class: 'rphv-zero' }, '—')),
            h('td', { class: 'num' }, num(s.planned, 'planned', sp.code)),
            h('td', { class: 'num' }, s.taught ? h('a', { class: 'rphv-count is-taught', href: `#/rekod?code=${encodeURIComponent(sp.code)}&year=${c.year}&status=selesai` }, '✓ ', String(s.taught)) : h('span', { class: 'rphv-zero' }, '—')),
            h('td', { class: 'num' }, s.taught > 1 ? h('span', { class: 'rphv-count is-repeat' }, String(s.taught - 1)) : h('span', { class: 'rphv-zero' }, '—')),
            h('td', { class: 'num' }, num(s.postponed, 'postponed', sp.code)),
            h('td', { class: 'num' }, s.hist ? h('span', { class: 'rphv-count is-hist' }, String(s.hist)) : h('span', { class: 'rphv-zero' }, '—')));
        });
        if (!spRows.length) return;
        const s = data.get(sk.code);
        skRows.push(h('tr', { class: 'rphv-prog-sk' },
          h('td', { class: 'rphv-prog-code' }, h('strong', null, sk.code)),
          h('td', { colspan: '7' }, K().rtlBlock(sk.text, lang, 'rphv-prog-sktext'),
            h('div', { class: 'slot-sub' }, `Peringkat SK: ${s.planned} dirancang · ${s.taught} selesai · ${s.postponed} ditangguhkan${s.hist ? ` · ${s.hist} dalam sejarah` : ''}`))));
        skRows.push(...spRows);
      });
      if (!skRows.length) return;
      rows.push(h('tr', { class: 'rphv-prog-domain' }, h('td', { colspan: '8' }, h('strong', null, `Bidang ${d.code}: `), d.name && d.name.ms ? d.name.ms : '', ' ', d.name ? k.rtl(d.name.ar || d.name.jawi || '', lang) : '')));
      rows.push(...skRows);
    });

    const table = rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table rphv-table rphv-prog' },
      h('thead', null, h('tr', null, h('th', null, 'SK'), h('th', null, 'SP'), h('th', { class: 'num' }, 'Belum'), h('th', { class: 'num' }, 'Dirancang'), h('th', { class: 'num' }, 'Telah Diajar'), h('th', { class: 'num' }, 'Ulang'), h('th', { class: 'num' }, 'Ditangguhkan'), h('th', { class: 'num', title: 'Sejarah RPH diimport' }, 'Sejarah'))),
      h('tbody', null, rows))) : ui.empty('Tiada SP sepadan dengan tapisan.');

    add(el, summary,
      h('div', { class: 'rphv-prog-grid' },
        ui.card({ cls: 'rphv-card', title: 'Liputan ikut bidang', subtitle: `${data.rphs.length} RPH · ${data.hist.length} rekod sejarah diimport`, body: cover }),
        ui.card({ cls: 'rphv-card', title: 'Panduan status', body: h('ul', { class: 'rphv-legend-list small' },
          h('li', null, h('strong', null, 'Dirancang'), ' — RPH berstatus Draft atau Siap'),
          h('li', null, h('strong', null, 'Telah Diajar'), ' — RPH berstatus Selesai'),
          h('li', null, h('strong', null, 'Ulang'), ' — diajar lebih daripada sekali'),
          h('li', null, h('strong', null, 'Ditangguhkan'), ' — Ditangguhkan / Dibawa ke minggu seterusnya'),
          h('li', null, h('strong', null, 'Sejarah'), ' — kiraan dalam RPH lama yang diimport (tidak dikira dalam status)')) })),
      ui.card({ cls: 'rphv-card', title: 'SK | SP', subtitle: `${k.subjName(c.subjectId)} Tahun ${c.year}${c.subjects.size > 1 ? ` (termasuk ${[...c.subjects].map(k.subjCode).join(', ')})` : ''}`, actions: [showSel], body: table }));
  }

  RPH.views.progress = RPH.views.kemajuan = { title: 'Kemajuan DSKP', icon: 'chart', render };
})(window.RPH = window.RPH || {});
