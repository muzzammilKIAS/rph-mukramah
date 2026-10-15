/* But aplikasi: init store → bina shell → penghala. */
(function (RPH) {
  'use strict';
  const { h, icon, clear } = RPH.ui;

  function buildNav() {
    const nav = document.getElementById('nav');
    clear(nav);
    for (const g of RPH.router.NAV) {
      nav.appendChild(h('div', { class: 'nav-group' }, g.group));
      for (const it of g.items) nav.appendChild(h('a', { class: 'nav-item', href: `#/${it.id}`, dataset: { view: it.id } }, icon(it.icon), h('span', null, it.label)));
    }
    nav.appendChild(h('div', { class: 'nav-foot muted small' }, `v${RPH.VERSION}`));
  }

  /** Logo sekolah pada jenama sisi (jika ada); jika tiada → tanda "ر". */
  function buildBrand() {
    const mark = document.querySelector('.brand-mark'); if (!mark) return;
    const school = RPH.store.get('school') || {};
    clear(mark);
    mark.classList.toggle('has-logo', !!school.logo);
    if (school.logo) mark.appendChild(h('img', { src: school.logo, alt: '' }));
    else mark.textContent = 'ر';
    const sub = document.querySelector('.brand-sub'); if (sub) sub.textContent = school.shortName || 'Generator';
  }

  function buildTop() {
    buildBrand();
    const top = document.getElementById('topbar-info');
    clear(top);
    const school = RPH.store.get('school') || {}; const teacher = RPH.store.get('teacher') || {};
    const ay = RPH.store.academicYear();
    const ySel = RPH.ui.select({ options: RPH.store.get('academicYears').years.map(y => ({ value: y.id, label: y.label })), value: ay && ay.id, cls: 'input-sm', onChange: v => { RPH.store.setActiveYear(v); } });
    ySel.setAttribute('aria-label', 'Tahun akademik');
    top.append(...[
      h('div', { class: 'top-who' }, h('strong', null, teacher.fullName || teacher.name || 'Guru'), h('span', { class: 'muted small' }, school.shortName || school.name || '')),
      ySel,
      ay && ay.archived ? h('span', { class: 'badge badge-amber', title: 'Tahun ini diarkib: RPH boleh dilihat & dieksport sahaja.' }, 'Diarkib · baca sahaja') : null,
      h('span', { id: 'saved-at', class: 'saved-at muted small', title: 'Auto simpan' }, icon('check', 14), h('span', null, 'Semua disimpan')),
    ].filter(Boolean));
  }

  function updateSaved({ at }) {
    const el = document.querySelector('#saved-at span'); if (el) el.textContent = `Disimpan ${RPH.util.hhmm(at)}`;
  }

  function start() {
    try { RPH.store.init(); }
    catch (e) { RPH.reportError('memuatkan data', e); return; }
    buildNav(); buildTop();
    document.getElementById('nav-toggle').addEventListener('click', () => document.body.classList.toggle('nav-open'));
    RPH.events.on('store:saved', updateSaved);
    RPH.events.on('year:changed', () => { buildTop(); RPH.router.render(); });
    RPH.events.on('year:archived', () => buildTop());
    RPH.events.on('store:changed', ({ collection }) => { if (['school', 'teacher', 'academicYears', '*'].includes(collection)) buildTop(); });
    startupHint();
    RPH.router.render();
  }

  /** Mesej permulaan: persediaan belum lengkap (edisi kosong) atau DSKP belum dimuatkan. Dashboard sendiri memaparkan "Mula di sini". */
  function startupHint() {
    const ob = RPH.onboarding; const onDash = RPH.router.current().view === 'dashboard';
    const viaImport = ob && ob.hasImportView() ? 'Import Data' : 'Tetapan → Data';
    let su = null;
    try { su = ob ? ob.status() : null; } catch (e) { console.warn('[RPH] status persediaan', e); }
    if (su && !su.coreReady) {
      if (!onDash) RPH.ui.toast(`Persediaan belum lengkap (${su.done}/${su.total}). Ikut senarai "Mula di sini" di Dashboard untuk mengimport takwim, jadual waktu, subjek dan kurikulum.`, 'info', 7000);
    } else if (!RPH.store.hasPrivateData() && !(onDash && ob)) { // Dashboard sudah memaparkan notis persediaan
      RPH.ui.toast(`DSKP belum dimuatkan — SK/SP tidak dapat dicadangkan. Import DSKP & RPT melalui ${viaImport}.`, 'info', 7000);
    }
  }
  RPH.app = { start, buildTop };
  document.addEventListener('DOMContentLoaded', start);
})(window.RPH = window.RPH || {});
