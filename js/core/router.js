/* Penghala hash + navigasi sisi. */
(function (RPH) {
  'use strict';
  const NAV = [
    { group: 'Perancangan', items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
      { id: 'jana', label: 'Jana RPH', icon: 'wand' },
      { id: 'mingguan', label: 'RPH Mingguan', icon: 'week' },
      { id: 'rekod', label: 'Rekod RPH', icon: 'list' },
      { id: 'kemajuan', label: 'Kemajuan DSKP', icon: 'chart' },
    ] },
    { group: 'Kurikulum', items: [
      { id: 'subjek', label: 'Subjek', icon: 'subject' },
      { id: 'dskp', label: 'DSKP', icon: 'book' },
      { id: 'rpt', label: 'RPT', icon: 'layers' },
      { id: 'rptjana', label: 'Jana RPT', icon: 'wand' },
    ] },
    { group: 'Sekolah', items: [
      { id: 'jadual', label: 'Jadual Waktu', icon: 'clock' },
      { id: 'takwim', label: 'Takwim', icon: 'calendar' },
    ] },
    { group: 'Sistem', items: [
      { id: 'import', label: 'Import Data', icon: 'upload' },
      { id: 'templat', label: 'Templat', icon: 'template' },
      { id: 'bank', label: 'Bank Aktiviti', icon: 'bank' },
      { id: 'tetapan', label: 'Tetapan', icon: 'settings' },
    ] },
  ];

  let lastHash = null;
  function parse() {
    const raw = (location.hash || '#/dashboard').replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    const params = Object.fromEntries(new URLSearchParams(qs || ''));
    return { view: parts[0] || 'dashboard', arg: parts[1] ? decodeURIComponent(parts[1]) : null, params };
  }

  const router = {
    NAV,
    current: parse,
    go(view, arg, params) {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      location.hash = `#/${view}${arg ? '/' + encodeURIComponent(arg) : ''}${qs}`;
    },
    async render() {
      const { h, clear, empty, button } = RPH.ui;
      const r = parse();
      const main = document.getElementById('main');
      const viewId = r.view === 'rph' ? 'editor' : r.view;
      const view = RPH.views[viewId];
      document.querySelectorAll('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.view === r.view || (r.view === 'rph' && a.dataset.view === 'rekod')));
      document.body.classList.remove('nav-open');
      // Beri peluang paparan semasa menyimpan dahulu (autosimpan editor) sebelum semakan "belum disimpan".
      if (lastHash && lastHash !== location.hash) { try { RPH.events.emit('route:leaving', { from: lastHash, to: location.hash }); } catch (e) { console.error(e); } }
      if (RPH.ui.isDirty() && !(await RPH.ui.confirm({ title: 'Perubahan belum disimpan', message: 'Ada perubahan yang belum disimpan. Tinggalkan halaman ini?', confirmLabel: 'Tinggalkan', danger: true }))) {
        if (lastHash) history.replaceState(null, '', lastHash); // kekal di halaman asal
        return;
      }
      lastHash = location.hash;
      RPH.ui.setDirty(false);
      clear(main);
      if (!view) { main.appendChild(empty(`Halaman "${r.view}" tidak ditemui.`, button('Ke Dashboard', { kind: 'primary', onClick: () => router.go('dashboard') }))); return; }
      document.title = `${view.title || 'RPH'} · Smart RPH Generator`;
      try { await view.render(main, { id: r.arg, ...r.params }); }
      catch (e) { RPH.reportError(`paparan ${viewId}`, e); main.appendChild(empty(`Paparan gagal dimuatkan: ${e.message}`)); }
      main.focus({ preventScroll: true });
      window.scrollTo(0, 0);
      RPH.events.emit('route:changed', r);
    },
  };
  window.addEventListener('hashchange', () => router.render());
  RPH.router = router;
})(window.RPH = window.RPH || {});
