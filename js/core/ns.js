/* Ruang nama, utiliti asas dan bas acara. */
(function (RPH) {
  'use strict';
  RPH.VERSION = '1.0.0';
  RPH.views = RPH.views || {};

  const DOW_MS = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
  const DOW_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const DOW_JAWI = ['احد', 'اثنين', 'ثلاث', 'رابو', 'خميس', 'جمعة', 'سبتو'];
  const MONTH_MS = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
  const DOW_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

  const util = {
    uid(prefix = 'id') {
      const r = (crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(2)) : [Math.random() * 1e9, Date.now()]);
      return `${prefix}-${Date.now().toString(36)}-${Array.from(r, x => (x >>> 0).toString(36)).join('')}`;
    },
    clone: o => (o == null ? o : JSON.parse(JSON.stringify(o))),
    pad: n => String(n).padStart(2, '0'),
    parseIso(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); },
    iso(d) { return d.toISOString().slice(0, 10); },
    addDays(iso, n) { const d = util.parseIso(iso); d.setUTCDate(d.getUTCDate() + n); return util.iso(d); },
    dow(iso) { return util.parseIso(iso).getUTCDay(); },
    fmtDate(iso, fmt = 'DD/MM/YYYY') {
      if (!iso) return '';
      const [y, m, d] = iso.split('-');
      if (fmt === 'D/M/YYYY') return `${+d}/${+m}/${y}`;
      if (fmt === 'DD-MM-YYYY') return `${d}-${m}-${y}`;
      if (fmt === 'long') return `${+d} ${MONTH_MS[+m - 1]} ${y}`;
      if (fmt === 'long-en') return `${+d} ${MONTH_EN[+m - 1]} ${y}`;
      return `${d}/${m}/${y}`;
    },
    monthName: m => MONTH_MS[m - 1],
    /** Nama bulan Inggeris (RPH bahasa Inggeris). */
    monthNameEn: m => MONTH_EN[m - 1],
    dayNameMs: dow => DOW_MS[dow],
    dayNameEn: dow => DOW_EN[dow],
    dayNameAr: dow => DOW_AR[dow],
    dayNameJawi: dow => DOW_JAWI[dow],
    toArabicDigits: n => String(n).replace(/[0-9]/g, d => AR_DIGITS[d]),
    minutesBetween(a, b) {
      if (!a || !b) return 0;
      const [ah, am] = a.split(':').map(Number); const [bh, bm] = b.split(':').map(Number);
      return bh * 60 + bm - (ah * 60 + am);
    },
    /** "16:30" → "4.30" (format RPH guru). */
    fmtTime12(t) {
      if (!t) return '';
      let [h, m] = t.split(':').map(Number);
      if (h > 12) h -= 12;
      return `${h}.${util.pad(m)}`;
    },
    timeRange(a, b) { return a && b ? `${util.fmtTime12(a)}-${util.fmtTime12(b)}` : '00.00-00.00'; },
    /** Sesi ikut amalan RPH guru (MINGGU 25/33): 11.10 → "Tengah hari"; 12.10, 12.40, 1.40 … → "Petang". */
    session(t) { if (!t) return ''; const h = +t.split(':')[0]; return h < 11 ? 'Pagi' : h < 12 ? 'Tengah hari' : 'Petang'; },
    download(filename, blob) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    },
    debounce(fn, ms = 400) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
    slug: s => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    /** Adakah rentetan mengandungi huruf Arab/Jawi? */
    isArabicScript: s => /[؀-ۿݐ-ݿﷺ]/.test(s || ''),
    groupBy(arr, fn) { return arr.reduce((m, x) => { const k = fn(x); (m[k] = m[k] || []).push(x); return m; }, {}); },
    sum: arr => arr.reduce((a, b) => a + (+b || 0), 0),
    nowIso() { return new Date().toISOString(); },
    hhmm(d = new Date()) { return `${util.pad(d.getHours())}:${util.pad(d.getMinutes())}`; },
    todayLocal() { const d = new Date(); return `${d.getFullYear()}-${util.pad(d.getMonth() + 1)}-${util.pad(d.getDate())}`; },
  };
  RPH.util = util;

  const handlers = {};
  RPH.events = {
    on(evt, fn) { (handlers[evt] = handlers[evt] || []).push(fn); return () => RPH.events.off(evt, fn); },
    off(evt, fn) { handlers[evt] = (handlers[evt] || []).filter(f => f !== fn); },
    emit(evt, data) { (handlers[evt] || []).slice().forEach(f => { try { f(data); } catch (e) { console.error(`[acara ${evt}]`, e); } }); },
  };

  /** Log ralat yang jelas — jangan gagal secara senyap (master prompt §86). */
  RPH.reportError = function (where, err) {
    console.error(`[RPH] ${where}:`, err);
    if (RPH.ui && RPH.ui.toast) RPH.ui.toast(`Ralat (${where}): ${err && err.message ? err.message : err}`, 'error', 8000);
  };
  window.addEventListener('error', e => RPH.reportError('skrip', e.error || e.message));
  window.addEventListener('unhandledrejection', e => RPH.reportError('proses', e.reason));
})(window.RPH = window.RPH || {});
