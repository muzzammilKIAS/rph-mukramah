/* Cetak / Simpan sebagai PDF melalui dialog cetak pelayar (§58–§61).
   Bentuk huruf Arab/Jawi dijamin oleh enjin pelayar; @media print dalam css/print.css. */
(function (RPH) {
  'use strict';
  const U = () => RPH.util;

  /** Kod fail yang selamat: "PI/QRN" → "PI-QRN", "3 UTM" → "3UTM". */
  const code = s => String(s == null ? '' : s).normalize('NFKD').replace(/[^\w]+/g, '-').replace(/_/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const cls = s => String(s == null ? '' : s).replace(/[^A-Za-z0-9]+/g, '').toUpperCase();
  const monthOf = iso => String(iso || '').slice(0, 7);

  function subjectCode(rph) {
    const s = RPH.store && RPH.store.subject ? RPH.store.subject(rph.subjectId) : null;
    return code((s && s.code) || rph.subjectId || 'RPH').toUpperCase();
  }
  function weekOf(rph) {
    if (rph.week != null && rph.week !== '') return +rph.week;
    try { return RPH.cal.schoolWeek(rph.date); } catch (e) { return null; }
  }

  /**
   * Nama fail output (§61):
   *  1 RPH          → RPH_<KOD>_<KELAS>_<DD-MM-YYYY>.<ext>   (cth. RPH_BA_3UTM_27-07-2026.docx; PI → kod subjek "PI", PI/QRN → "PI-QRN")
   *  1 hari         → RPH_<DD-MM-YYYY>.<ext>
   *  1 minggu       → RPH_MINGGU<NN>_<YYYY>.<ext>              (cth. RPH_MINGGU33_2026.pdf)
   *  1 bulan        → RPH_<BULAN>_<YYYY>.<ext>                  (cth. RPH_JULAI_2026.docx)
   *  lain-lain      → RPH_<DD-MM-YYYY>_<DD-MM-YYYY>.<ext>       (tarikh pertama & terakhir)
   */
  function filename(rphs, ext = 'pdf') {
    const list = (Array.isArray(rphs) ? rphs : [rphs]).filter(Boolean);
    const e = String(ext || 'pdf').replace(/^\./, '');
    if (!list.length) return `RPH.${e}`;
    const sorted = list.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const first = sorted[0], last = sorted[sorted.length - 1];
    const d = iso => U().fmtDate(iso, 'DD-MM-YYYY');
    if (list.length === 1) return `RPH_${subjectCode(first)}_${cls(first.classId || first.className)}_${d(first.date)}.${e}`;
    if (sorted.every(r => r.date === first.date)) return `RPH_${d(first.date)}.${e}`;
    const w = weekOf(first);
    if (w != null && sorted.every(r => weekOf(r) === w && String(r.date).slice(0, 4) === String(first.date).slice(0, 4))) {
      return `RPH_MINGGU${U().pad(w)}_${String(first.date).slice(0, 4)}.${e}`;
    }
    if (sorted.every(r => monthOf(r.date) === monthOf(first.date))) {
      const [y, m] = String(first.date).split('-');
      return `RPH_${U().monthName(+m).toUpperCase()}_${y}.${e}`;
    }
    return `RPH_${d(first.date)}_${d(last.date)}.${e}`;
  }

  let cleanupFn = null;
  function cleanup() { if (cleanupFn) { const f = cleanupFn; cleanupFn = null; f(); } }

  /**
   * Isi #print-root dengan RPH, tetapkan document.title = nama fail (dialog "Simpan sebagai PDF"
   * mencadangkan nama itu), panggil window.print(), kemudian kemas semula.
   * opts: {title, variant, header}
   */
  async function rphs(list, opts = {}) {
    list = (Array.isArray(list) ? list : [list]).filter(Boolean);
    if (!list.length) throw new Error('Tiada RPH untuk dicetak.');
    cleanup();
    let root = document.getElementById('print-root');
    if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
    RPH.ui.clear(root);
    root.appendChild(RPH.render.list(list, { mode: 'print', variant: opts.variant, header: opts.header }));
    root.removeAttribute('aria-hidden');
    document.body.classList.add('rph-printing');
    const prevTitle = document.title;
    const name = (opts.title || filename(list, 'pdf')).replace(/\.pdf$/i, '');
    document.title = name;

    let timer = null;
    const onAfter = () => cleanup();
    cleanupFn = () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', onAfter);
      document.title = prevTitle;
      document.body.classList.remove('rph-printing');
      RPH.ui.clear(root);
      root.setAttribute('aria-hidden', 'true');
    };
    window.addEventListener('afterprint', onAfter);
    // Pastikan fon Arab/Jawi dimuatkan sebelum dialog cetak dibuka.
    try { if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]); } catch (e) { /* abaikan */ }
    window.print();
    // Pelayar tanpa 'afterprint': kemas selepas dialog (yang menyekat) ditutup.
    if (!('onafterprint' in window)) timer = setTimeout(cleanup, 1500);
    return name;
  }

  RPH.print = { rphs, filename, cleanup, subjectCode };
})(window.RPH = window.RPH || {});
