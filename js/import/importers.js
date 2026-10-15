/* RPH.importers — pemeta import: Doc (RPH.readers.read) → data aplikasi dalam format storan yang TEPAT.
   Fungsi TULEN (tiada DOM, tiada storan) — boleh diuji dalam Node (vm).

   Setiap pengimport <jenis>(doc, ctx) memulangkan
     { kind, data, model, issues:[{level:'error'|'warn', msg, ref}], stats, method }
   - model  : perwakilan boleh sunting untuk grid semakan (senarai baris + medan meta).
   - build(kind, model, ctx) membina semula { data, issues, stats } selepas guru menyunting.
   - Prinsip: TIADA rekaan. Kod SK/SP, teks, tarikh dan slot hanya diambil daripada fail; yang tidak pasti
     ditanda (row._issues) dan guru mesti menyemak sebelum menyimpan. Tiada apa-apa disimpan di sini.

   ctx: { yearId, year, subjects[], classes[], subjectId, subjectYear, script, periodGrid[], bidang[], themes[],
          fileName, today, shape:'weeks'|'rows', deriveCandidates } */
(function (RPH) {
  'use strict';
  const VERSION = '1.0.0';
  const TEMPLATE_MARK = 'TEMPLAT IMPORT SMART RPH';

  // =====================================================================================
  // A. Teks
  // =====================================================================================
  const RE_BIDI = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\u061C\uFEFF]/g;
  const RE_PRES = /[\uFB50-\uFDF9\uFDFB-\uFDFF\uFE70-\uFEFF]+/g; // \uFDFA (U+FDFA) dikekalkan
  const RE_AR = /[\u0600-ۿݐ-ݿ\uFB50-\uFDFF\uFE70-\uFEFF]/;
  const str = v => (v == null ? '' : typeof v === 'string' ? v : String(v));
  const isAr = s => RE_AR.test(str(s));
  /** Buang kawalan bidi, ruang berlebihan; kekalkan baris baharu. */
  function clean(v) {
    return str(v).replace(RE_BIDI, '').replace(/[\u00A0\u2007\u202F]/g, ' ').replace(/\r\n?/g, '\n')
      .split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter((l, i, a) => l || (i > 0 && a[i - 1])).join('\n').trim();
  }
  /** Satu baris (baris baharu → ruang). */
  const line = v => clean(v).replace(/\s*\n\s*/g, ' ').trim();
  /** Digit Arab-India (٠-٩, ۰-۹) → ASCII. */
  const digits = v => str(v).replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6F0)).replace(/٫/g, '.');
  /** Normalisasi aksara Arab/Jawi tanpa mengubah ejaan (bentuk persembahan → asas, ی→ي, ک→ك, tatweel dibuang). */
  function arText(v) {
    let s = clean(v);
    if (!isAr(s)) return s;
    if (RPH.readers && typeof RPH.readers.normalizeArabic === 'function') { try { s = RPH.readers.normalizeArabic(s); } catch (e) { /* biar */ } }
    s = s.replace(RE_PRES, m => m.normalize('NFKC'));
    // Artifak bidi lapisan PDF: ")31-21(" (kurungan dicermin + nombor terbalik) → "(21-31)".
    s = s.replace(/\)\s*(\d+)\s*-\s*(\d+)\s*\(/g, (m, a, b) => `(${b}-${a})`);
    return s.replace(/ی/g, 'ي').replace(/ک/g, 'ك').replace(/ـ/g, '');
  }
  /** Kunci padanan (huruf kecil; Arab/Jawi melalui jawi.normalizeForMatch). */
  function key(v) {
    const s = line(digits(v));
    if (isAr(s)) return RPH.jawi && RPH.jawi.normalizeForMatch ? RPH.jawi.normalizeForMatch(s) : s.replace(/\s+/g, '');
    return s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036F]/g, '').replace(/[^a-z0-9@&/]+/g, ' ').trim();
  }
  const compact = v => line(v).replace(/\s+/g, '').toUpperCase();
  const uniq = arr => [...new Set(arr)];
  const clone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));
  const isInt = v => /^\d{1,3}$/.test(line(digits(v)));

  /** Teks Jawi fon lama → Jawi Unicode (leksikon). Perkataan tidak dikenali dilaporkan. */
  function jawiFix(text) {
    const t = arText(text);
    if (!t || !isAr(t) || !RPH.jawi || !RPH.jawi.fromLegacy) return { text: t, legacy: t, unknown: [] };
    const r = RPH.jawi.fromLegacy(t);
    let out = r.text;
    // Perkataan tidak dikenali yang bermula "ال" (lazimnya Arab, cth. الكافرون) dikekalkan seperti asal — tetap ditanda untuk semakan.
    for (const u of r.unknown || []) {
      if (!/^ال/.test(u)) continue;
      const conv = RPH.jawi.fromLegacy(u).text;
      if (conv && conv !== u) out = out.split(conv).join(u);
    }
    return { text: out, legacy: t, unknown: r.unknown || [] };
  }

  // =====================================================================================
  // B. Tarikh & masa
  // =====================================================================================
  const MONTHS = {
    januari: 1, jan: 1, january: 1, februari: 2, feb: 2, febuari: 2, february: 2, mac: 3, mar: 3, march: 3, april: 4, apr: 4,
    mei: 5, may: 5, jun: 6, june: 6, julai: 7, jul: 7, july: 7, ogos: 8, ogo: 8, ogs: 8, aug: 8, august: 8, september: 9, sep: 9, sept: 9,
    oktober: 10, okt: 10, oct: 10, october: 10, november: 11, nov: 11, disember: 12, dis: 12, dec: 12, december: 12,
  };
  const MONTH_NAMES = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
  const monthOf = w => MONTHS[str(w).toLowerCase().replace(/\.$/, '')] || null;
  const DAY_WORDS = [
    ['ahad', 'ahd', 'sunday', 'sun', 'الأحد', 'الاحد', 'احد'],
    ['isnin', 'isn', 'monday', 'mon', 'الإثنين', 'الاثنين', 'اثنين', 'إثنين'],
    ['selasa', 'sel', 'tuesday', 'tue', 'tues', 'الثلاثاء', 'ثلاثاء', 'ثلاث', 'سلاسا'],
    ['rabu', 'rab', 'wednesday', 'wed', 'الأربعاء', 'الاربعاء', 'رابو'],
    ['khamis', 'kha', 'kham', 'thursday', 'thu', 'thur', 'الخميس', 'خميس'],
    ['jumaat', 'jumat', 'jum', 'friday', 'fri', 'الجمعة', 'جمعة', 'جمعه'],
    ['sabtu', 'sab', 'saturday', 'sat', 'السبت', 'سبتو'],
  ];
  const DAY_MAP = {}; DAY_WORDS.forEach((ws, d) => ws.forEach(w => { DAY_MAP[w] = d; }));
  /** Nama hari → 0..6 (Ahad=0) atau null. */
  function dayOf(v) {
    const s = line(v).toLowerCase().replace(/[^a-z\u0600-ۿ']/g, '');
    if (!s) return null;
    if (DAY_MAP[s] != null) return DAY_MAP[s];
    for (const [w, d] of Object.entries(DAY_MAP)) if (w.length >= 4 && s.startsWith(w)) return d;
    return null;
  }
  const pad = n => String(n).padStart(2, '0');
  function isoOf(y, m, d) {
    y = +y; m = +m; d = +d;
    if (!(y > 1900 && y < 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCMonth() === m - 1 ? dt.toISOString().slice(0, 10) : null;
  }
  const yy = n => (n < 100 ? 2000 + n : n);
  function serialDate(n) { if (!(n > 59 && n < 80000)) return null; return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10); }
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const dowOf = iso => new Date(iso + 'T00:00:00Z').getUTCDay();
  const mondayOf = iso => addDays(iso, -((dowOf(iso) + 6) % 7));
  const DOW_MS = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];

  /** Satu tarikh → ISO. Menerima ISO, DD/MM/YYYY, DD.MM.YYYY, DD-MM-YY, "12 Januari 2026", "12 Jan", nombor siri Excel, Date. */
  function parseDate(v, { year } = {}) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) return isoOf(v.getFullYear(), v.getMonth() + 1, v.getDate());
    if (typeof v === 'number') return serialDate(v);
    const s = line(digits(v)).toLowerCase().replace(/[–—−]/g, '-');
    let m;
    if (/^\d{5}(\.\d+)?$/.test(s)) return serialDate(+s);
    if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return isoOf(m[1], m[2], m[3]);
    if ((m = s.match(/(?:^|[^\d])(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4}|\d{2})(?!\d)/))) return isoOf(yy(+m[3]), m[2], m[1]);
    if ((m = s.match(/(?:^|[^\d])(\d{1,2})(?:hb)?\s*([a-z]{3,9})\.?,?\s*(\d{4})?/))) { const mo = monthOf(m[2]); if (mo && (m[3] || year)) return isoOf(m[3] ? +m[3] : year, mo, m[1]); }
    if ((m = s.match(/^([a-z]{3,9})\.?\s+(\d{1,2}),?\s*(\d{4})?$/))) { const mo = monthOf(m[1]); if (mo && (m[3] || year)) return isoOf(m[3] ? +m[3] : year, mo, m[2]); }
    if ((m = s.match(/^(\d{1,2})\s*[/.]\s*(\d{1,2})$/)) && year) return isoOf(year, m[2], m[1]);
    return null;
  }
  /** Julat tarikh: "1-5 Feb", "17—21 FEB", "28-2 MEI", "31 MAC -4 APRIL 2025", "01/01 – 11/01/2026", "18 APRIL". → {start, end} */
  function parseRange(v, { year } = {}) {
    const s = line(digits(v)).toLowerCase().replace(/[–—−]/g, '-').replace(/\s+(hingga|sehingga|sampai|to|until)\s+/g, ' - ');
    if (!s) return null;
    const nums = [...s.matchAll(/(\d{1,2})\s*[/.](\d{1,2})(?:\s*[/.](\d{4}|\d{2}))?(?![\d])/g)];
    if (nums.length >= 2) {
      const y2 = nums[1][3] ? yy(+nums[1][3]) : (nums[0][3] ? yy(+nums[0][3]) : year);
      const y1 = nums[0][3] ? yy(+nums[0][3]) : y2;
      const a = isoOf(y1, nums[0][2], nums[0][1]), b = isoOf(y2, nums[1][2], nums[1][1]);
      if (a && b) return a <= b ? { start: a, end: b } : { start: a, end: isoOf(y2 + 1, nums[1][2], nums[1][1]) || b };
    }
    let m = s.match(/(\d{1,2})\s*([a-z]{3,9})?\.?\s*(\d{4})?\s*-\s*(\d{1,2})\s*([a-z]{3,9})\.?\s*(\d{4})?/);
    if (m && monthOf(m[5])) {
      const m2 = monthOf(m[5]); let m1 = m[2] ? monthOf(m[2]) : null;
      const y2 = m[6] ? +m[6] : (m[3] ? +m[3] : year); let y1 = m[3] ? +m[3] : y2;
      if (!m1) { m1 = +m[1] > +m[4] ? m2 - 1 : m2; if (m1 < 1) { m1 = 12; y1 = y2 - 1; } }
      if (y1 && y2) { const a = isoOf(y1, m1, m[1]), b = isoOf(y2, m2, m[4]); if (a && b && a <= b) return { start: a, end: b }; }
    }
    const one = parseDate(s, { year });
    return one ? { start: one, end: one } : null;
  }
  /** "11:10", "11.10", "1:10 PM", "16:30" → minit sejak 00:00 (+ ampm). */
  function parseTime(v) {
    const s = line(digits(v)).toLowerCase();
    const m = s.match(/(\d{1,2})\s*[:.h]\s*(\d{2})\s*(am|pm|a\.m\.|p\.m\.|pagi|ptg|petang|tgh|malam)?/) || s.match(/^(\d{1,2})\s*(am|pm)$/);
    if (!m) return null;
    let h = +m[1]; const mi = m[2] && /^\d+$/.test(m[2]) ? +m[2] : 0; const ap = m[3] || (m[2] && !/^\d+$/.test(m[2]) ? m[2] : null);
    if (h > 23 || mi > 59) return null;
    if (ap && /^(pm|p\.m\.|ptg|petang|malam)$/.test(ap) && h < 12) h += 12;
    if (ap && /^(am|a\.m\.)$/.test(ap) && h === 12) h = 0;
    return { min: h * 60 + mi, ampm: !!ap };
  }
  const hm = min => (min == null ? '' : `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`);
  /** "11:10 - 11:40" → [t1, t2] (masa tanpa am/pm dilaraskan oleh normTimes). */
  function parseTimeRange(v) {
    const s = line(digits(v)).replace(/[–—−]/g, '-');
    const parts = [...s.matchAll(/(\d{1,2}\s*[:.]\s*\d{2}\s*(?:am|pm|AM|PM|pagi|ptg|petang)?)/g)].map(m => parseTime(m[1])).filter(Boolean);
    return parts.length >= 2 ? [parts[0], parts[1]] : null;
  }
  /** Laraskan senarai masa (minit) supaya menaik: jam 1–6 tanpa am/pm → petang; jika menurun → +12 jam. */
  function normTimes(list) {
    let prev = null;
    return list.map(t => {
      if (!t) return null;
      let v = t.min;
      if (!t.ampm && v < 7 * 60 && v >= 60) v += 12 * 60;
      if (prev != null && v < prev && !t.ampm && v + 720 < 24 * 60) v += 720;
      prev = v;
      return v;
    });
  }

  // =====================================================================================
  // C. Kod SK/SP
  // =====================================================================================
  const CODE_RE = /(?:^|[^\d.])(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)(?=$|[^\d.]|\.(?!\d))/g;
  const okCode = c => { const p = c.split('.').map(Number); return p[0] >= 1 && p[0] <= 20 && p[1] >= 1 && p[1] <= 30 && (p.length < 3 || (p[2] >= 1 && p[2] <= 30)); };
  /** Kod SK (N.n) dan SP (N.n.n) yang benar-benar tertulis dalam teks. Tiada pengembangan julat. */
  function extractCodes(v) {
    const s = digits(clean(v));
    const all = [];
    CODE_RE.lastIndex = 0;
    let m;
    while ((m = CODE_RE.exec(s))) { const c = m[1]; if (okCode(c) && !all.includes(c)) all.push(c); }
    const range = /\d+\.\d+(?:\.\d+)?\s*[-–—]\s*\d+\.\d+(?:\.\d+)?/.test(s);
    return { all, sk: all.filter(c => c.split('.').length === 2), sp: all.filter(c => c.split('.').length === 3), range };
  }
  const codeSort = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
  /** Sel yang hanya mengandungi kod (cth. "1.1.1 / 1.1.2")? */
  const codeOnly = v => { const s = line(digits(v)); return !!s && /^[\s\d.,;/|\-–\[\]()]+$/.test(s) && extractCodes(s).all.length > 0; };

  // =====================================================================================
  // D. Doc → jadual/helaian/baris
  // =====================================================================================
  /** Senarai jadual seragam: [{rows:string[][], raw?, ref, page, sheet, index, merges, dir}] */
  function tablesOf(doc) {
    const out = [];
    const sheetRaw = {};
    (doc.sheets || []).forEach(s => { sheetRaw[s.name] = s.rows || []; });
    (doc.tables || []).forEach((t, i) => {
      if (!t || !Array.isArray(t.rows)) return;
      const where = t.sheet != null ? `helaian "${t.sheet}"` : t.page != null ? `hlm ${t.page}` : t.slide != null ? `slaid ${t.slide}` : null;
      out.push({ rows: t.rows.map(r => (r || []).map(str)), raw: t.sheet != null ? sheetRaw[t.sheet] : null, ref: `Jadual ${i + 1}${where ? ` (${where})` : ''}`, page: t.page, slide: t.slide, sheet: t.sheet, index: i, merges: t.merges || [], dir: t.dir, bbox: t.bbox, source: t.source });
    });
    // Jadual "bingkai" (1×1 yang memuatkan seluruh halaman) diabaikan jika ada jadual lain pada halaman sama.
    for (let i = out.length - 1; i >= 0; i--) {
      const t = out[i];
      const single = t.rows.length === 1 && t.rows[0].filter(c => line(c)).length <= 1 && (t.rows[0].find(c => line(c)) || '').split('\n').length >= 4;
      if (single && out.some(o => o !== t && o.page === t.page && o.rows.length > 1)) out.splice(i, 1);
    }
    // Helaian tanpa jadual seragam (Doc lama) → jadual.
    (doc.sheets || []).forEach(s => { if (!out.some(t => t.sheet === s.name)) out.push({ rows: (s.rows || []).map(r => r.map(str)), raw: s.rows, ref: `helaian "${s.name}"`, sheet: s.name, index: out.length, merges: s.merges || [] }); });
    return out;
  }
  const rowRef = (t, r) => `${t.ref}, baris ${r + 1}`;
  /** Nilai mentah sel helaian (nombor tarikh Excel dsb.) jika ada. */
  const rawCell = (t, r, c) => (t.raw && t.raw[r] && t.raw[r][c] !== undefined ? t.raw[r][c] : (t.rows[r] || [])[c]);
  function textLines(doc) {
    if (Array.isArray(doc.paragraphs) && doc.paragraphs.length) return doc.paragraphs.map(p => ({ text: str(p.text), page: p.page, dir: p.dir }));
    return str(doc.text).split('\n').map(t => ({ text: t }));
  }
  /** Adakah Doc ialah templat Excel kita (dan jenis apa)? */
  function templateKind(doc) {
    for (const s of doc.sheets || []) {
      const first = (s.rows || []).slice(0, 3).map(r => r.map(str).join(' ')).join(' ');
      if (first.includes(TEMPLATE_MARK)) {
        const all = (s.rows || []).map(r => r.map(str).join(' ')).join('\n');
        const m = all.match(/rph-template:([a-z]+)/);
        if (m) return m[1];
      }
    }
    return null;
  }
  const isExampleRow = row => row.some(c => /^\s*CONTOH\b/i.test(str(c)));

  // =====================================================================================
  // E. Pengesanan baris tajuk
  // =====================================================================================
  /** spec: [[kunci, [regex|string…]], …] (ikut keutamaan). Pulangkan kunci pertama yang sepadan dengan sel. */
  function headerKeyOf(cell, spec) {
    const raw = line(cell); if (!raw || raw.length > 60) return null;
    const low = raw.toLowerCase(); const k = key(raw);
    for (const [name, pats] of spec) {
      for (const p of pats) {
        if (p instanceof RegExp) { if (p.test(raw) || p.test(low)) return name; }
        else if (isAr(p)) { const kp = key(p); if (k === kp || (kp.length >= 4 && k.includes(kp) && raw.split(/\s+/).length <= p.split(/\s+/).length + 1)) return name; }
        else if (low === p || k === key(p)) return name;
      }
    }
    return null;
  }
  /** Cari baris tajuk dalam scan baris pertama. → {row, map:{kunci:[lajur…]}, n} */
  function findHeader(rows, spec, { scan = 12, min = 2, need = [] } = {}) {
    let best = null;
    for (let r = 0; r < Math.min(rows.length, scan); r++) {
      const map = {};
      (rows[r] || []).forEach((c, i) => { const k = headerKeyOf(c, spec); if (k) (map[k] = map[k] || []).push(i); });
      const n = Object.keys(map).length;
      if (n >= min && need.every(x => map[x]) && (!best || n > best.n)) best = { row: r, map, n };
    }
    return best;
  }
  /** Lajur → peranan ikut tajuk terdekat (untuk sel tajuk bergabung yang tidak meliputi semua lajur). */
  function rolesByNearest(headerRow, spec, width) {
    const at = [];
    (headerRow || []).forEach((c, i) => { const k = headerKeyOf(c, spec); if (k) at.push({ i, k }); });
    if (!at.length) return null;
    return Array.from({ length: width }, (_, i) => { let best = null; for (const a of at) { const d = Math.abs(a.i - i); if (!best || d < best.d) best = { d, k: a.k }; } return best.k; });
  }

  // =====================================================================================
  // F. Isu
  // =====================================================================================
  function flag(row, level, msg) { (row._issues = row._issues || []).push({ level, msg }); return row; }
  const rowLevel = row => (row._issues || []).some(i => i.level === 'error') ? 'error' : (row._issues || []).length ? 'warn' : null;
  function collectIssues(list, label, refKey = '_ref') {
    const out = [];
    (list || []).forEach((r, i) => (r._issues || []).forEach(x => out.push({ level: x.level, msg: `${label ? label + ' ' : ''}${x.msg}`, ref: r[refKey] || null, row: i })));
    return out;
  }
  const result = (kind, model, built, method) => ({ kind, model, data: built.data, issues: built.issues, stats: built.stats, extra: built.extra || null, method });

  // =====================================================================================
  // G. TAKWIM
  // =====================================================================================
  const OFF_KINDS = new Set(['cuti', 'cuti-peristiwa']);
  const CAL_KINDS = ['cuti', 'cuti-peristiwa', 'acara', 'peperiksaan', 'sabtu-ganti', 'sabtu-3', 'sabtu-oren'];
  const CAL_CATS = ['pentadbiran', 'kurikulum', 'hem', 'kokurikulum', 'peperiksaan', 'umum'];
  const CAT_RULES = [['kokurikulum', /KOKURIKULUM|KOKUM|KOKO\b/i], ['pentadbiran', /PENTADBIR|KELAB\s*STAFF|STAF\b/i], ['hem', /HAL\s*EHWAL|\bHEM\b/i], ['peperiksaan', /PEPERIKSAAN|PENTAKSIRAN/i], ['kurikulum', /KURIKULUM/i]];
  const catOf = h => { const s = line(h); for (const [c, re] of CAT_RULES) if (re.test(s)) return c; return null; };
  function eventKind(title) {
    const t = line(title).replace(/^[*•●▪\-\s]+/, '');
    if (/^CUTI\s+PERISTIWA/i.test(t)) return 'cuti-peristiwa';
    if (/^(CUTI|HARI CUTI|PUBLIC HOLIDAY)\b/i.test(t)) return 'cuti';
    if (/sabtu\s*ke-?\s*3/i.test(t)) return 'sabtu-3';
    if (/sabtu\s*gant|hari persekolahan gantian|persekolahan ganti/i.test(t)) return 'sabtu-ganti';
    return 'acara';
  }
  const evTitle = t => line(t).replace(/^[*•●▪◦\s]+/, '').replace(/\s+([,.;:])/g, '$1').trim();
  function monthHeader(text) {
    const s = line(text).toLowerCase();
    const m = s.match(/^([a-z]{3,9})\s*(\d{4})?$/) || s.match(/^(?:bulan\s+)?([a-z]{3,9})\s+(\d{4})$/);
    if (m && monthOf(m[1]) && (m[2] || s.length <= 10)) return { m: monthOf(m[1]), y: m[2] ? +m[2] : null };
    return null;
  }
  const CAL_TPL_WEEKS = [
    ['week', [/^(no\.?\s*)?minggu( ke)?$/i, /^week$/i, 'minggu persekolahan']], ['start', [/tarikh\s*mula|^mula$|^dari$|^start/i]],
    ['end', [/tarikh\s*(akhir|tamat)|^(akhir|tamat|hingga)$|^end/i]], ['term', [/^penggal$|^term$/i]], ['kpm', [/kpm/i]], ['note', [/^catatan|^nota/i]],
  ];
  const CAL_TPL_ENTRIES = [
    ['start', [/tarikh\s*mula|^mula$|^dari$|^start|^tarikh$/i]], ['end', [/tarikh\s*(akhir|tamat)|^(akhir|tamat|hingga)$|^end/i]],
    ['kind', [/^jenis$|^kind$/i]], ['category', [/^kategori$|^category$/i]], ['title', [/^tajuk$|^nama$|cuti\s*\/\s*acara|^acara$|^perkara$|^keterangan$|^title$/i]], ['note', [/^catatan|^nota/i]],
  ];

  /** Takwim daripada templat Excel (helaian Minggu + Cuti_Acara) atau senarai minggu dalam jadual mana-mana. */
  function calendarFromLists(tables, ctx) {
    const weeks = [], entries = [];
    let found = false;
    for (const t of tables) {
      const hw = findHeader(t.rows, CAL_TPL_WEEKS, { need: ['week', 'start'] });
      const he = !hw && findHeader(t.rows, CAL_TPL_ENTRIES, { need: ['start', 'title'] });
      if (!hw && !he) continue;
      found = true;
      const h = hw || he; const col = k => (h.map[k] || [])[0];
      for (let r = h.row + 1; r < t.rows.length; r++) {
        const row = t.rows[r];
        if (!row.some(c => line(c))) continue;
        if (isExampleRow(row)) continue;
        const get = k => (col(k) == null ? '' : rawCell(t, r, col(k)));
        const ref = rowRef(t, r);
        if (hw) {
          const w = { week: isInt(get('week')) ? +line(digits(get('week'))) : null, start: parseDate(get('start'), ctx), end: parseDate(get('end'), ctx), term: isInt(get('term')) ? +line(digits(get('term'))) : null, kpmWeek: isInt(get('kpm')) ? +line(digits(get('kpm'))) : null, note: line(get('note')) || null, _ref: ref };
          if (w.week == null) flag(w, 'error', `Nombor minggu tidak sah ("${line(get('week'))}").`);
          if (!w.start) flag(w, 'error', `Tarikh mula tidak sah ("${line(get('start'))}").`);
          weeks.push(w);
          // Lajur "Cuti/Acara" dalam helaian minggu (pilihan)
        } else {
          const title = evTitle(get('title'));
          const kindRaw = key(get('kind'));
          const kind = CAL_KINDS.find(k => k === kindRaw.replace(/\s+/g, '-')) || (kindRaw ? null : eventKind(title));
          const e = { start: parseDate(get('start'), ctx), end: parseDate(get('end'), ctx), kind: kind || 'acara', category: CAL_CATS.includes(key(get('category'))) ? key(get('category')) : 'umum', title, note: line(get('note')) || null, _ref: ref };
          if (!e.end) e.end = e.start;
          if (!e.start) flag(e, 'error', `Tarikh mula tidak sah ("${line(get('start'))}").`);
          if (!title) flag(e, 'error', 'Tajuk kosong.');
          if (!kind) flag(e, 'warn', `Jenis "${line(get('kind'))}" tidak dikenali — dianggap "acara".`);
          if (e.start && e.end && e.end < e.start) flag(e, 'error', 'Tarikh akhir sebelum tarikh mula.');
          entries.push(e);
        }
      }
    }
    if (!found) return null;
    weeks.forEach(w => { if (w.start && !w.end) w.end = addDays(w.start, 4); });
    return { weeks, entries, stated: {}, meta: {} };
  }

  /** Lajur takwim harian (MINGGU | TARIKH | HARI | kategori…) daripada baris tajuk. */
  function dayTableHeader(row) {
    const c = row.map(compact);
    const week = [], date = [], day = [];
    c.forEach((x, i) => {
      if (/^(MINGGU|MINGG|MGG|WEEK|M)$/.test(x)) week.push(i);
      else if (/^(TARIKH|TARIK|TKH|DATE)$/.test(x)) date.push(i);
      else if (/^(HARI|DAY)$/.test(x)) day.push(i);
    });
    if (!date.length || !day.length) return null;
    const used = new Set([...week, ...date, ...day]);
    const cats = [];
    let lastCat = null;
    row.forEach((h, i) => {
      if (used.has(i)) return;
      const cat = line(h) ? (catOf(h) || 'umum') : lastCat;
      if (line(h)) lastCat = cat;
      cats.push({ i, category: cat || 'umum' });
    });
    return { week, date, day, cats };
  }
  const firstOf = (row, cols) => { for (const i of cols || []) { const v = line(row[i]); if (v) return v; } return ''; };

  /** Baris pseudo-jadual daripada baris visual PDF (tiada jadual bergaris): lajur ikut kedudukan x tajuk. */
  function pseudoRowsFromPage(page, isHeaderSeg) {
    const segs = (page.lines || []).filter(l => line(l.text)).map(l => ({ text: line(l.text), x: +l.x || 0, y: +l.y || 0, w: +l.w || 0, h: +l.h || 10 }));
    if (!segs.length) return [];
    const rows = [];
    segs.sort((a, b) => a.y - b.y || a.x - b.x);
    for (const s of segs) { const r = rows[rows.length - 1]; if (r && Math.abs(r.y - s.y) <= Math.max(2, 0.5 * s.h)) r.segs.push(s); else rows.push({ y: s.y, segs: [s] }); }
    const hdr = rows.find(r => isHeaderSeg(r.segs));
    if (!hdr) return [];
    const cols = hdr.segs.slice().sort((a, b) => a.x - b.x).map(s => ({ cx: s.x + s.w / 2, text: s.text }));
    const colOf = s => { const cx = s.x + s.w / 2; let bi = 0, bd = Infinity; cols.forEach((c, i) => { const d = Math.abs(c.cx - cx); if (d < bd) { bd = d; bi = i; } }); return bi; };
    return rows.map(r => {
      if (r === hdr) return cols.map(c => c.text);
      const out = cols.map(() => '');
      r.segs.forEach(s => { const i = colOf(s); out[i] = out[i] ? `${out[i]} ${s.text}` : s.text; });
      return out;
    });
  }

  /** Takwim harian (format takwim sekolah biasa: MINGGU | TARIKH | HARI | kategori…) daripada jadual DOCX/XLSX/PDF. */
  function calendarFromDayTables(tables, ctx) {
    let cur = { y: ctx.year || null, m: null };
    let cols = null, current = null, lastDay = null, headerSeen = false;
    const days = new Map();
    const stated = {};
    const dayIssues = [];
    for (const t of tables) {
      for (let r = 0; r < t.rows.length; r++) {
        const row = t.rows[r];
        const vals = uniq(row.map(line).filter(Boolean));
        if (!vals.length) continue;
        if (vals.length === 1) {
          const mh = monthHeader(vals[0]);
          if (mh) { cur = { y: mh.y || cur.y, m: mh.m }; current = null; lastDay = null; continue; }
        }
        const st = vals.join(' ').match(/BILANGAN\s+HARI\s+PERSEKOLAHAN\s*:?\s*(\d+)/i);
        if (st) { if (cur.m) stated[cur.m] = +st[1]; continue; }
        if (/TAKWIM|KALENDAR/i.test(vals.join(' ')) && vals.length === 1) { const y = vals[0].match(/(20\d\d)/); if (y && !cur.y) cur.y = +y[1]; continue; }
        const hdr = dayTableHeader(row);
        if (hdr) { cols = hdr; headerSeen = true; continue; }
        if (!cols) continue;
        const dTxt = digits(firstOf(row, cols.date)), dayTxt = firstOf(row, cols.day), wTxt = digits(firstOf(row, cols.week));
        const ref = rowRef(t, r);
        if (/^\d{1,2}$/.test(dTxt) && cur.m && cur.y) {
          let dnum = +dTxt;
          let iso = isoOf(cur.y, cur.m, dnum);
          if (lastDay && iso && iso <= lastDay.date && !(dnum === +lastDay.date.slice(8))) {
            // Tarikh berundur tanpa tajuk bulan → bulan seterusnya
            cur = cur.m === 12 ? { y: cur.y + 1, m: 1 } : { y: cur.y, m: cur.m + 1 };
            iso = isoOf(cur.y, cur.m, dnum);
            dayIssues.push({ level: 'warn', msg: `Bulan bertukar tanpa tajuk bulan sebelum ${iso}.`, ref });
          }
          if (!iso) { dayIssues.push({ level: 'error', msg: `Tarikh ${dnum}/${cur.m}/${cur.y} tidak wujud.`, ref }); continue; }
          if (lastDay && iso === lastDay.date) current = lastDay;
          else {
            current = days.get(iso) || { date: iso, labels: [], texts: [], ref, page: t.page };
            days.set(iso, current);
            const dw = dayOf(dayTxt);
            if (dayTxt && dw != null && dw !== dowOf(iso)) dayIssues.push({ level: 'error', msg: `Hari "${dayTxt}" tidak sepadan dengan tarikh ${iso} (${DOW_MS[dowOf(iso)]}).`, ref, date: iso });
            lastDay = current;
          }
        } else if (!current) continue;
        if (/^\d{1,2}$/.test(wTxt)) current.labels.push({ n: +wTxt, ref });
        const seenRow = new Set();
        for (const { i, category } of cols.cats) {
          const v = clean(row[i]);
          if (!v) continue;
          const k = line(v);
          if (seenRow.has(k)) continue;
          seenRow.add(k);
          if (current.texts.some(x => x.key === k)) continue;
          current.texts.push({ text: v, key: k, category, ref });
        }
      }
    }
    if (!headerSeen || days.size < 7) return null;
    return { days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)), stated, dayIssues, year: cur.y };
  }

  /** Hari → model takwim (minggu daripada label MINGGU; cuti/acara; cuti panjang disimpulkan untuk minggu tanpa nombor). */
  function calendarModelFromDays(parsed, ctx) {
    const { days, stated } = parsed;
    const issues = parsed.dayIssues.slice();
    // --- Minggu: label → Isnin minggu itu (majoriti)
    const byN = new Map();
    for (const d of days) for (const l of d.labels) {
      if (!byN.has(l.n)) byN.set(l.n, { n: l.n, mondays: {}, refs: [] });
      const g = byN.get(l.n); const mon = mondayOf(d.date);
      g.mondays[mon] = (g.mondays[mon] || 0) + (dowOf(d.date) >= 1 && dowOf(d.date) <= 5 ? 2 : 1);
      g.refs.push(l.ref);
    }
    const weeks = [...byN.values()].map(g => {
      const ranked = Object.entries(g.mondays).sort((a, b) => b[1] - a[1]);
      const w = { week: g.n, start: ranked[0][0], end: addDays(ranked[0][0], 4), term: null, kpmWeek: null, note: null, _ref: g.refs[0] };
      if (ranked.length > 1) flag(w, 'warn', `Label minggu ${g.n} muncul pada lebih daripada satu minggu kalendar (${ranked.map(x => x[0]).join(', ')}).`);
      return w;
    }).sort((a, b) => a.start.localeCompare(b.start) || a.week - b.week);
    for (let i = 1; i < weeks.length; i++) {
      const a = weeks[i - 1], b = weeks[i];
      if (b.start === a.start) flag(b, 'error', `Minggu ${a.week} dan ${b.week} jatuh pada minggu kalendar yang sama.`);
      else if (b.week !== a.week + 1) flag(b, 'warn', b.week > a.week ? `Nombor minggu melompat dari ${a.week} ke ${b.week} — semak.` : `Nombor minggu menurun (${a.week} → ${b.week}) — semak.`);
    }
    // --- Cuti / acara harian
    const entries = [];
    const add = (e) => {
      const same = entries.find(x => x.title === e.title && x.kind === e.kind && x.category === e.category && addDays(x.end, 1) === e.start && !x._range);
      if (same && !e._range) { same.end = e.end; return same; }
      if (entries.some(x => x.title === e.title && x.kind === e.kind && x.start === e.start && x.end === e.end)) return null;
      entries.push(e); return e;
    };
    const year = parsed.year || ctx.year;
    for (const d of days) {
      for (const tx of d.texts) {
        const parts = tx.text.split(/\s*[●•▪◦]\s*/).map(evTitle).filter(Boolean);
        for (const title of parts) {
          const kind = eventKind(title);
          const e = { start: d.date, end: d.date, kind, category: OFF_KINDS.has(kind) || kind.startsWith('sabtu') ? 'umum' : (tx.category || 'umum'), title, note: null, _ref: tx.ref };
          if (OFF_KINDS.has(kind)) {
            const par = title.match(/\(([^)]*\d[^)]*)\)/);
            const rg = par ? parseRange(par[1], { year }) : null;
            if (rg && rg.start <= d.date && rg.end >= d.date) { e.start = rg.start; e.end = rg.end; e._range = true; }
          }
          add(e);
        }
      }
    }
    // --- Hari bekerja tanpa nombor minggu: cuti panjang (sel bergabung yang tidak diulang) disimpulkan.
    const offOn = iso => entries.some(e => OFF_KINDS.has(e.kind) && e.start <= iso && e.end >= iso);
    const dayDates = new Set(days.map(d => d.date));
    if (weeks.length) {
      const first = days.length ? days[0].date : weeks[0].start;
      const last = days.length ? days[days.length - 1].date : weeks[weeks.length - 1].end;
      const gaps = [];
      let gs = first;
      for (const w of weeks) { if (w.start > gs) gaps.push([gs, addDays(w.start, -1)]); gs = addDays(w.start, 5); }
      if (gs <= last) gaps.push([gs, last]);
      for (const [a, b] of gaps) {
        const wd = []; for (let x = a; x <= b; x = addDays(x, 1)) { const dw = dowOf(x); if (dw >= 1 && dw <= 5 && dayDates.has(x)) wd.push(x); }
        const bare = wd.filter(x => !offOn(x));
        if (!bare.length) continue;
        const firstOff = entries.filter(e => OFF_KINDS.has(e.kind) && e.start >= a && e.start <= b).sort((p, q) => p.start.localeCompare(q.start))[0];
        if (firstOff) {
          const start = firstOff.start < bare[0] ? firstOff.start : bare[0];
          const e = { start, end: b, kind: 'cuti', category: 'umum', title: firstOff.title, note: null, _ref: firstOff._ref, _inferred: true };
          if (firstOff.start === firstOff.end && firstOff.start >= start) entries.splice(entries.indexOf(firstOff), 1);
          flag(e, 'warn', `Julat cuti ${start} – ${b} disimpulkan: hari bekerja tanpa nombor minggu selepas "${firstOff.title}". Semak tarikh akhir.`);
          entries.push(e);
        } else {
          issues.push({ level: 'error', msg: `${bare.length} hari bekerja (${bare[0]} – ${bare[bare.length - 1]}) tiada nombor minggu dan tiada cuti. Semak takwim atau tambah minggu/cuti.`, ref: null });
        }
      }
    }
    entries.sort((a, b) => a.start.localeCompare(b.start) || CAL_KINDS.indexOf(a.kind) - CAL_KINDS.indexOf(b.kind));
    entries.forEach(e => { delete e._range; });
    // --- Penggal: bertambah selepas cuti pertengahan tahun / akhir penggal
    inferTerms(weeks, entries);
    return { model: { year, weeks, entries, stated, meta: {} }, issues };
  }
  function inferTerms(weeks, entries) {
    const brk = entries.filter(e => OFF_KINDS.has(e.kind) && /PERTENGAHAN\s+TAHUN|AKHIR\s+PENGGAL|CUTI\s+PENGGAL\s+[12]\b.*AKHIR/i.test(e.title) && e.end > e.start).map(e => e.end).sort();
    let term = 1;
    weeks.forEach(w => { if (w.term == null) { while (brk.length && brk[0] < w.start) { brk.shift(); term++; } w.term = term; w._termInferred = true; } });
  }

  /** model → objek takwim penuh (bentuk storan koleksi "calendar"). */
  function buildCalendar(model, ctx = {}) {
    const issues = [];
    (model.weeks || []).forEach(w => { w._issues = (w._issues || []).filter(x => !x.auto); });
    const weeks = (model.weeks || []).filter(w => w.week != null && w.start).sort((a, b) => a.start.localeCompare(b.start));
    const seen = new Map();
    weeks.forEach(w => {
      if (!w.end) w.end = addDays(w.start, 4);
      if (dowOf(w.start) !== 1) (w._issues = w._issues || []).push({ level: 'warn', msg: `Minggu ${w.week} bermula pada ${DOW_MS[dowOf(w.start)]}, bukan Isnin.`, auto: true });
      if (seen.has(w.week)) (w._issues = w._issues || []).push({ level: 'error', msg: `Nombor minggu ${w.week} berganda.`, auto: true });
      seen.set(w.week, w);
    });
    const entries = (model.entries || []).filter(e => e.start && (e.title || e.kind)).map(e => ({ ...e, end: e.end && e.end >= e.start ? e.end : e.start }));
    if (!weeks.length) issues.push({ level: 'error', msg: 'Tiada minggu persekolahan bernombor. Takwim memerlukan sekurang-kurangnya satu minggu.', ref: null });
    const session = weeks.length ? { start: weeks[0].start, end: weeks[weeks.length - 1].end } : (model.session || null);
    const y0 = +(session ? session.start : `${ctx.year || model.year || new Date().getFullYear()}`).slice(0, 4);
    const y1 = +(session ? session.end : `${y0}`).slice(0, 4);
    const weekOf = iso => { const w = weeks.find(x => iso >= x.start && iso <= addDays(x.start, 6)); return w ? w.week : null; };
    const days = [];
    for (let d = `${y0}-01-01`; d <= `${y1}-12-31`; d = addDays(d, 1)) {
      const evs = entries.filter(e => e.start <= d && d <= e.end);
      const off = evs.filter(e => OFF_KINDS.has(e.kind));
      const ganti = evs.find(e => e.kind === 'sabtu-ganti');
      const dow = dowOf(d);
      const inSession = !!session && d >= session.start && d <= session.end;
      const weekday = dow >= 1 && dow <= 5;
      const day = {
        date: d, dow, dayName: DOW_MS[dow], week: weekOf(d),
        schoolDay: inSession && !off.length && (weekday || !!ganti),
        holiday: off.length ? uniq(off.map(e => e.title)).join('; ') : null,
        events: evs.filter(e => !OFF_KINDS.has(e.kind)).map(e => ({ kind: e.kind, category: e.category || 'umum', title: e.title })),
      };
      if (ganti && ganti.followsDow != null) day.followsDow = +ganti.followsDow;
      days.push(day);
    }
    weeks.forEach(w => { const end = addDays(w.start, 6); w.schoolDays = days.filter(x => x.date >= w.start && x.date <= end && x.schoolDay).length; if (!w.schoolDays) (w._issues = w._issues || []).push({ level: 'warn', msg: `Minggu ${w.week} tiada hari persekolahan (semua cuti?).`, auto: true }); });
    issues.unshift(...collectIssues(model.weeks, 'Minggu:'), ...collectIssues(model.entries, 'Cuti/acara:'));
    const allKpm = weeks.length && weeks.every(w => w.kpmWeek != null);
    const rptWeekMap = {
      default: 'A',
      A: { description: 'RPT minggu N = minggu sekolah N', map: Object.fromEntries(weeks.map(w => [w.week, w.week])) },
      B: { description: allKpm ? 'RPT ikut nombor minggu KPM' : 'Tiada data minggu KPM dalam fail import — sama seperti A', map: Object.fromEntries(weeks.map(w => [w.week, allKpm ? w.kpmWeek : w.week])) },
    };
    const breaks = entries.filter(e => e.kind === 'cuti' && (e.end > e.start || /Penggal|Pertengahan|Akhir/i.test(e.title))).map(e => ({ name: e.title, start: e.start, end: e.end }));
    const monthly = [];
    for (let m = 1; m <= 12; m++) {
      const computed = days.filter(x => +x.date.slice(5, 7) === m && x.schoolDay && x.date.slice(0, 4) === String(y1 === y0 ? y0 : x.date.slice(0, 4))).length;
      const st = model.stated && model.stated[m] != null ? +model.stated[m] : null;
      if (st != null || computed) monthly.push({ month: m, stated: st, computed });
      if (st != null && st !== computed) issues.push({ level: 'warn', msg: `Bilangan hari persekolahan ${MONTH_NAMES[m - 1]}: tercetak ${st}, dikira ${computed}. Semak cuti/minggu bulan ini.`, ref: null });
    }
    const outWeeks = weeks.map(w => ({ week: w.week, start: w.start, end: w.end, term: w.term == null ? 1 : +w.term, kpmWeek: w.kpmWeek != null ? +w.kpmWeek : null, schoolDays: w.schoolDays }));
    const data = {
      schemaVersion: '1.0.0', type: 'calendar', academicYearId: ctx.yearId || String(y0),
      school: (model.meta && model.meta.school) || ctx.schoolName || null,
      workweek: [1, 2, 3, 4, 5], session,
      source: { file: ctx.fileName || (model.meta && model.meta.file) || null, importedAt: ctx.now || null, method: model.meta && model.meta.method || 'import', verifiedBy: 'semakan guru semasa import' },
      weeks: outWeeks, rptWeekMap, breaks,
      monthlySchoolDays: monthly,
      days,
    };
    const stats = { weeks: outWeeks.length, schoolDays: days.filter(d => d.schoolDay).length, holidayDays: days.filter(d => d.holiday).length, events: entries.filter(e => !OFF_KINDS.has(e.kind)).length, entries: entries.length };
    return { data, issues, stats };
  }

  function calendar(doc, ctx = {}) {
    ctx = { ...ctx, year: ctx.year || guessYear(doc) };
    if (doc.json && doc.json.type === 'calendar') return fromJson('calendar', doc.json, ctx);
    const tables = tablesOf(doc);
    const lists = calendarFromLists(tables, ctx);
    if (lists && (lists.weeks.length || lists.entries.length)) {
      const model = { ...lists, year: ctx.year, meta: { method: 'templat' } };
      inferTerms(model.weeks, model.entries);
      return result('calendar', model, buildCalendar(model, ctx), 'templat');
    }
    let parsed = calendarFromDayTables(tables, ctx);
    let method = 'jadual';
    if (!parsed && (doc.pages || []).length) {
      const isHdr = segs => segs.some(s => /^TARIKH$/i.test(compact(s.text))) && segs.some(s => /^HARI$/i.test(compact(s.text)));
      const pseudo = doc.pages.map((p, i) => ({ rows: pseudoRowsFromPage(p, isHdr), ref: `hlm ${p.n || i + 1}`, page: p.n || i + 1, index: i, merges: [] })).filter(t => t.rows.length);
      parsed = calendarFromDayTables(pseudo, ctx);
      method = 'kedudukan teks';
    }
    if (!parsed) {
      const model = { year: ctx.year, weeks: [], entries: [], stated: {}, meta: {} };
      const built = buildCalendar(model, ctx);
      built.issues.unshift({ level: 'error', msg: doc.scanned ? 'Fail ini imej/imbasan tanpa lapisan teks. Guna "Ekstrak dengan AI" atau isi templat Excel takwim.' : 'Struktur takwim tidak dikenali (perlu lajur MINGGU | TARIKH | HARI, atau templat Excel takwim).', ref: null });
      return result('calendar', model, built, 'tiada');
    }
    const { model, issues } = calendarModelFromDays(parsed, ctx);
    model.meta.method = method;
    const sch = (doc.text || '').match(/TAKWIM\s+(SEKOLAH\s+[A-Z][A-Z .'-]+?)(?:,|\s+TAHUN|\n)/i);
    if (sch) model.meta.school = line(sch[1]);
    const built = buildCalendar(model, ctx);
    built.issues = [...issues, ...built.issues];
    return result('calendar', model, built, method);
  }
  function guessYear(doc) {
    const s = `${doc.name || ''} ${str(doc.text).slice(0, 4000)}`;
    const m = s.match(/(?:TAHUN|SESI|SESSION|TAKWIM|KALENDAR)[^\d]{0,30}(20\d\d)/i) || s.match(/\b(20[2-4]\d)\b/);
    return m ? +m[1] : null;
  }

  // =====================================================================================
  // H. JADUAL WAKTU
  // =====================================================================================
  const TT_TPL = [
    ['day', [/^hari$/i, /^day$/i]], ['start', [/^(masa\s*)?mula$|^start/i]], ['end', [/^(masa\s*)?(tamat|akhir)$|^end/i]],
    ['subject', [/^subjek$|^mata pelajaran$|^subject$|^label$/i]], ['class', [/^kelas$|^class$/i]], ['year', [/^tahun$|^year$|^darjah$/i]],
    ['kind', [/^jenis$/i]], ['co', [/guru\s*bersama|^co-?teacher/i]], ['note', [/^catatan|^nota/i]],
  ];
  const TT_VER = [['id', [/nombor\s*versi|^versi$|^bil\.?$/i]], ['label', [/^label$|^nama$/i]], ['from', [/berkuat\s*kuasa|mula\s*berkuat|^mulai$/i]], ['to', [/^tamat|hingga/i]]];
  const NON_PDP = /^(PH|PERHIMPUNAN|REHAT|REST|RECESS|BREAK|SOLAT|ASSEMBLY|MESYUARAT|BERTUGAS|LDP)$/i;
  const UNAVAIL = /^(-|–|—|X|TIADA|N\/?A|TIDAK TERSEDIA)$/i;
  const CLASS_RE = /(^|[\s,/(])([1-6])\s*([A-Za-z][A-Za-z0-9'’\-]{1,14})\b/;
  /** "BA 3 UKM" → {label:'BA', className:'3 UKM', year:3} */
  function splitCell(text) {
    const s = line(text);
    if (!s) return null;
    const m = s.match(CLASS_RE);
    if (!m) return { label: s, className: null, year: null };
    const className = `${m[2]} ${/^[a-z]{2,4}$/.test(m[3]) ? m[3].toUpperCase() : m[3]}`;
    const label = line(s.slice(0, m.index + m[1].length) + ' ' + s.slice(m.index + m[0].length)).replace(/^[\s,/]+|[\s,/]+$/g, '');
    return { label: label || null, className, year: +m[2] };
  }
  const classIdOf = name => line(name).replace(/\s+/g, '').toUpperCase();
  const normLabel = s => compact(s).replace(/[^A-Z0-9/]/g, '');
  const LABEL_ALIAS = { 'PI/QRN': ['PAI/QRN', 'PIQRN', 'PAIQRN', 'PI/Q', 'PAI/Q'], PAI: ['PI', 'PENDIDIKANISLAM', 'PAI'], TAS: ['TASMIK', 'TAS'], BA: ['BAHASAARAB', 'B.ARAB', 'BARAB'] };
  /** Label jadual → subjek (timetableLabel, kod, id, singkatan nama). Pulangkan id atau null. */
  function matchSubject(label, subjects) {
    const L = normLabel(label); if (!L) return null;
    const cands = [];
    for (const s of subjects || []) {
      const keys = uniq([s.timetableLabel, s.code, s.id, s.name && s.name.ms, s.name && s.name.ms && s.name.ms.split(/\s+/).map(w => w[0]).join('')].filter(Boolean).map(normLabel));
      const alias = Object.entries(LABEL_ALIAS).filter(([k]) => keys.includes(normLabel(k))).flatMap(([, v]) => v.map(normLabel));
      if (keys.includes(L)) cands.push({ id: s.id, score: normLabel(s.timetableLabel) === L ? 3 : 2 });
      else if (alias.includes(L)) cands.push({ id: s.id, score: 1 });
    }
    cands.sort((a, b) => b.score - a.score);
    return cands.length ? cands[0].id : null;
  }
  function matchClass(name, classes) {
    const id = classIdOf(name);
    const c = (classes || []).find(x => classIdOf(x.id) === id || classIdOf(x.name) === id);
    return c || null;
  }
  /** Grid (hari × waktu) → model slot. rows: string[][]; baris tajuk mengandungi julat masa atau nombor waktu. */
  function timetableFromGrid(rows, ctx = {}, src = {}) {
    const issues = [];
    // Baris tajuk: paling banyak sel berjulat masa.
    let hr = -1, best = 0;
    rows.slice(0, 8).forEach((r, i) => { const n = r.filter(c => parseTimeRange(c)).length; if (n > best) { best = n; hr = i; } });
    const grid = (ctx.periodGrid || []).filter(p => !p.break);
    let header = hr >= 0 ? rows[hr] : null;
    if (!header) {
      // Tiada masa → nombor waktu + periodGrid sedia ada
      rows.slice(0, 5).forEach((r, i) => { const n = r.filter(c => isInt(c)).length; if (n > best) { best = n; hr = i; } });
      header = hr >= 0 ? rows[hr] : null;
    }
    if (!header) return { slots: [], periodGrid: [], issues: [{ level: 'error', msg: 'Baris tajuk waktu (julat masa) tidak ditemui dalam jadual.', ref: src.ref || null }] };
    const colTimes = header.map(c => { const tr = parseTimeRange(c); if (tr) return tr; const n = isInt(c) ? +line(digits(c)) : null; const p = n != null ? grid.find(g => +g.no === n) : null; return p ? [parseTime(p.start), parseTime(p.end)] : null; });
    const flat = normTimes(colTimes.flatMap(t => (t ? [t[0], t[1]] : [null, null])));
    const cols = header.map((c, i) => ({ i, start: flat[2 * i], end: flat[2 * i + 1], brk: /REHAT|REST|RECESS|BREAK/i.test(line(c)), label: line(c) })).filter(c => c.start != null && c.end != null);
    if (!cols.length) return { slots: [], periodGrid: [], issues: [{ level: 'error', msg: 'Masa waktu tidak dapat dibaca daripada baris tajuk.', ref: src.ref || null }] };
    const periodGrid = cols.map(c => (c.brk ? { no: null, label: 'REHAT', start: hm(c.start), end: hm(c.end), break: true } : { no: isInt(c.label.split(/\s/)[0]) ? +c.label.split(/\s/)[0] : null, start: hm(c.start), end: hm(c.end) }));
    const slots = [];
    for (let r = 0; r < rows.length; r++) {
      if (r === hr) continue;
      const row = rows[r];
      let dIdx = -1, dow = null;
      for (let i = 0; i < Math.min(row.length, 3); i++) { const d = dayOf(row[i]); if (d != null && line(row[i]).length <= 12) { dIdx = i; dow = d; break; } }
      if (dow == null) continue;
      let run = null;
      const flush = () => {
        if (!run) return;
        const sp = splitCell(run.text);
        const start = hm(run.start), end = hm(run.end);
        const ref = src.ref ? `${src.ref}, ${DOW_MS[dow]} ${start}` : `${DOW_MS[dow]} ${start}`;
        let kind = 'PdP';
        if (UNAVAIL.test(line(run.text))) kind = 'unavailable';
        else if (!sp.className && (NON_PDP.test(compact(sp.label)) || !sp.label)) kind = 'non-PdP';
        const slot = { day: dow, start, end, label: sp.label || (kind === 'unavailable' ? '–' : ''), className: sp.className || null, year: sp.year, kind, subjectId: null, coTeachers: [], note: null, text: line(run.text), _ref: ref };
        if (kind === 'PdP' && !sp.className) { slot.kind = 'non-PdP'; flag(slot, 'warn', `Sel "${slot.text}" tiada kelas — dianggap bukan PdP. Tukar jenis jika perlu.`); }
        slots.push(slot);
        run = null;
      };
      cols.forEach(c => {
        if (c.i === dIdx) return;
        const v = line(row[c.i]);
        if (c.brk || !v || (c.brk && v.length <= 2)) { flush(); return; }
        if (/^[A-Z]$/.test(v) && cols.some(x => x.brk && x.i === c.i)) { flush(); return; }
        if (run && compact(run.text) === compact(v) && run.end === c.start) { run.end = c.end; return; }
        flush();
        run = { text: v, start: c.start, end: c.end };
      });
      flush();
    }
    if (!slots.length) issues.push({ level: 'error', msg: 'Tiada slot ditemui (baris hari Isnin–Jumaat tidak dikesan).', ref: src.ref || null });
    return { slots, periodGrid, issues };
  }
  /** Templat senarai slot (Hari | Mula | Tamat | Subjek | Kelas | Tahun | Jenis | Guru bersama | Catatan). */
  function timetableFromList(t, h, ctx) {
    const col = k => (h.map[k] || [])[0];
    const slots = [];
    for (let r = h.row + 1; r < t.rows.length; r++) {
      const row = t.rows[r];
      if (!row.some(c => line(c)) || isExampleRow(row)) continue;
      const get = k => (col(k) == null ? '' : rawCell(t, r, col(k)));
      const ref = rowRef(t, r);
      const dow = dayOf(get('day'));
      const tt = normTimes([parseTime(str(get('start'))), parseTime(str(get('end')))]);
      const cls = line(get('class'));
      const kindRaw = line(get('kind'));
      const kind = /bukan|non/i.test(kindRaw) ? 'non-PdP' : /tidak tersedia|unavailable/i.test(kindRaw) ? 'unavailable' : 'PdP';
      const yearV = isInt(get('year')) ? +line(digits(get('year'))) : (splitCell(cls) || {}).year || null;
      const slot = { day: dow, start: hm(tt[0]), end: hm(tt[1]), label: line(get('subject')), className: cls ? (splitCell(cls).className || cls) : null, year: yearV, kind, subjectId: null, coTeachers: line(get('co')) ? line(get('co')).split(/\s*[,;]\s*/).filter(Boolean) : [], note: line(get('note')) || null, text: null, _ref: ref };
      if (dow == null) flag(slot, 'error', `Hari "${line(get('day'))}" tidak dikenali.`);
      if (!slot.start || !slot.end) flag(slot, 'error', 'Masa mula/tamat tidak sah.');
      slots.push(slot);
    }
    return slots;
  }
  /** Padanan label → subjek & kelas; isu bagi yang belum dipadankan. */
  function resolveSlots(slots, ctx) {
    for (const s of slots) {
      s._issues = (s._issues || []).filter(x => !x.auto);
      if (s.kind === 'PdP') {
        if (!s.subjectId) s.subjectId = matchSubject(s.label, ctx.subjects) || null;
        if (!s.subjectId) (s._issues = s._issues || []).push({ level: 'error', msg: `Label "${s.label}" belum dipadankan dengan subjek. Pilih subjek, "subjek baharu" atau tukar jenis.`, auto: true });
        if (!s.className) (s._issues = s._issues || []).push({ level: 'error', msg: 'Slot PdP tiada kelas.', auto: true });
      }
      if (s.start && s.end && s.end <= s.start) (s._issues = s._issues || []).push({ level: 'error', msg: 'Masa tamat mesti selepas masa mula.', auto: true });
    }
    return slots;
  }
  function buildTimetable(model, ctx = {}) {
    const issues = [];
    const v = model.version || {};
    const vid = line(v.id) || 'import';
    const slots = resolveSlots((model.slots || []).filter(s => s.day != null || s.start || s.label), ctx);
    // Pertindihan
    const byDay = {};
    slots.forEach((s, i) => (byDay[s.day] = byDay[s.day] || []).push({ s, i }));
    Object.values(byDay).forEach(list => list.sort((a, b) => str(a.s.start).localeCompare(str(b.s.start))).forEach((a, k) => { const b = list[k + 1]; if (b && a.s.end && b.s.start && b.s.start < a.s.end) (b.s._issues = b.s._issues || []).push({ level: 'warn', msg: `Bertindih dengan slot ${a.s.start}–${a.s.end} ${a.s.label || ''}.`, auto: true }); }));
    issues.push(...collectIssues(slots, 'Slot:'));
    const newClasses = [], newSubjects = [];
    const ids = new Set();
    const out = slots.filter(s => s.day != null && s.start && s.end).map(s => {
      let classId = null, className = s.className || null, year = s.year != null ? +s.year : null;
      if (className) {
        const c = matchClass(className, ctx.classes);
        if (c) { classId = c.id; className = c.name; if (year == null) year = c.year; }
        else { classId = classIdOf(className); if (!newClasses.some(x => x.id === classId)) newClasses.push({ id: classId, name: className, year: year || (+(className.match(/^\d/) || [0])[0] || null), enrolment: null }); }
      }
      let subjectId = s.subjectId || null;
      if (subjectId && String(subjectId).startsWith('new:')) {
        const lbl = String(subjectId).slice(4);
        subjectId = lbl.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase() || 'SUBJEK';
        if (!newSubjects.some(x => x.id === subjectId) && !(ctx.subjects || []).some(x => x.id === subjectId)) newSubjects.push({ id: subjectId, code: subjectId, timetableLabel: lbl, name: { ms: lbl } });
      }
      let id = `${vid}-${s.day}-${s.start}-${classId || line(s.label).replace(/[^A-Za-z0-9]+/g, '') || 'slot'}`;
      for (let n = 2; ids.has(id); n++) id = `${vid}-${s.day}-${s.start}-${classId || 'slot'}-${n}`;
      ids.add(id);
      const rec = { id, day: +s.day, dayName: DOW_MS[s.day], start: s.start, end: s.end, minutes: (+s.end.slice(0, 2) * 60 + +s.end.slice(3)) - (+s.start.slice(0, 2) * 60 + +s.start.slice(3)), kind: s.kind || 'PdP',
        subjectId: s.kind === 'PdP' ? subjectId : null, label: s.label || '', year: s.kind === 'PdP' ? year : null, classId: s.kind === 'PdP' ? classId : null, className: s.kind === 'PdP' ? className : null,
        coTeachers: Array.isArray(s.coTeachers) ? s.coTeachers : line(s.coTeachers) ? line(s.coTeachers).split(/\s*[,;]\s*/) : [], source: ctx.fileName || 'import', note: s.note || null };
      if (s.rph === false) rec.rph = false;
      return rec;
    }).sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
    const data = { id: vid, label: line(v.label) || `Jadual Waktu ${vid}`, effectiveFrom: parseDate(v.effectiveFrom) || null, effectiveTo: parseDate(v.effectiveTo) || null, generatedOn: ctx.today || null,
      source: ctx.fileName || 'import', partial: false, declaredTotals: {}, slots: out };
    if (!data.effectiveFrom) issues.push({ level: 'warn', msg: 'Tarikh berkuat kuasa kosong — versi ini digunakan untuk semua tarikh sehingga versi lain ditetapkan.', ref: null });
    if (!out.length) issues.push({ level: 'error', msg: 'Tiada slot untuk disimpan.', ref: null });
    const stats = { slots: out.length, pdp: out.filter(s => s.kind === 'PdP').length, newClasses: newClasses.length, newSubjects: newSubjects.length };
    return { data, issues, stats, extra: { periodGrid: model.periodGrid || [], newClasses, newSubjects } };
  }
  function timetable(doc, ctx = {}) {
    if (doc.json && doc.json.type === 'timetable') return fromJson('timetable', doc.json, ctx);
    const tables = tablesOf(doc);
    const version = { id: '', label: '', effectiveFrom: '', effectiveTo: '' };
    const m = `${doc.name || ''} ${str(doc.text).slice(0, 2000)}`.match(/(?:BIL\.?|VERSI)\s*(\d+(?:\.\d+)?)/i);
    if (m) { version.id = m[1]; version.label = `Jadual Waktu Bil ${m[1]}`; }
    const eff = str(doc.text).match(/(?:Berkuatkuasa|Berkuat\s*kuasa)\s*:?\s*([^\n]+)/i);
    if (eff) { const d = parseDate(eff[1], { year: ctx.year }); if (d) version.effectiveFrom = d; else version.note = `Berkuat kuasa (dicetak): ${line(eff[1])}`; }
    // 1) templat / senarai
    for (const t of tables) {
      const hv = findHeader(t.rows, TT_VER, { need: ['id'] });
      if (hv) { const r = t.rows[hv.row + 1] || []; const g = k => (hv.map[k] ? rawCell(t, hv.row + 1, hv.map[k][0]) : ''); if (r.some(c => line(c)) && !isExampleRow(r)) { version.id = line(g('id')) || version.id; version.label = line(g('label')) || version.label; version.effectiveFrom = parseDate(g('from'), ctx) || version.effectiveFrom; version.effectiveTo = parseDate(g('to'), ctx) || ''; } }
    }
    for (const t of tables) {
      const h = findHeader(t.rows, TT_TPL, { need: ['day', 'start', 'end'], min: 3 });
      if (h) {
        const slots = resolveSlots(timetableFromList(t, h, ctx), ctx);
        const model = { version, periodGrid: [], slots };
        return result('timetable', model, buildTimetable(model, ctx), 'templat');
      }
    }
    // 2) grid hari × waktu
    for (const t of tables) {
      if (!t.rows.some(r => r.slice(0, 3).some(c => dayOf(c) != null))) continue;
      const g = timetableFromGrid(t.rows, ctx, { ref: t.ref });
      if (g.slots.length) {
        const model = { version, periodGrid: g.periodGrid, slots: resolveSlots(g.slots, ctx) };
        const built = buildTimetable(model, ctx);
        built.issues = [...g.issues, ...built.issues];
        return result('timetable', model, built, 'grid');
      }
    }
    // 3) PDF tanpa jadual bergaris → baris pseudo ikut tajuk masa
    for (const p of doc.pages || []) {
      const rows = pseudoRowsFromPage(p, segs => segs.filter(s => parseTimeRange(s.text)).length >= 3);
      if (rows.length) { const g = timetableFromGrid(rows, ctx, { ref: `hlm ${p.n}` }); if (g.slots.length) { const model = { version, periodGrid: g.periodGrid, slots: resolveSlots(g.slots, ctx) }; const built = buildTimetable(model, ctx); built.issues = [...g.issues, ...built.issues]; return result('timetable', model, built, 'kedudukan teks'); } }
    }
    const model = { version, periodGrid: (ctx.periodGrid || []).slice(), slots: [] };
    const built = buildTimetable(model, ctx);
    built.issues = [{ level: doc.kind === 'image' || doc.scanned ? 'warn' : 'error', msg: doc.kind === 'image' || doc.scanned ? 'Gambar/imbasan: isi grid jadual secara manual berpandukan imej, atau guna "Ekstrak dengan AI".' : 'Jadual waktu tidak dikenali (perlu grid hari × waktu dengan julat masa, atau templat Excel jadual).', ref: null }];
    return { ...result('timetable', model, built, 'manual'), needsManual: true };
  }

  // =====================================================================================
  // I. KELAS & BILANGAN MURID
  // =====================================================================================
  const CL_SPEC = [['name', [/^(nama\s*)?kelas$|^class( name)?$/i]], ['id', [/^id\b/i]], ['year', [/^tahun$|^year$|^darjah$/i]], ['count', [/bilangan\s*murid|^enrolmen|^jumlah\s*murid|^bil\.?\s*murid|^murid$/i]], ['note', [/^catatan|^nota/i]]];
  const SC_SPEC = [['subject', [/^subjek$|^mata pelajaran$|^subject$/i]], ['year', [/^tahun$|^year$/i]], ['count', [/bilangan\s*murid|^jumlah|^murid$/i]], ['note', [/^catatan/i]]];
  function classes(doc, ctx = {}) {
    if (doc.json && doc.json.type === 'classes') return fromJson('classes', doc.json, ctx);
    const tables = tablesOf(doc);
    const list = [], counts = [];
    let method = 'templat', headerFound = false;
    for (const t of tables) {
      const hs = findHeader(t.rows, SC_SPEC, { need: ['subject', 'count'] });
      const hc = !hs && findHeader(t.rows, CL_SPEC, { need: ['name'], min: 1 });
      const h = hs || hc; if (!h) continue;
      headerFound = true;
      const col = k => (h.map[k] || [])[0];
      for (let r = h.row + 1; r < t.rows.length; r++) {
        const row = t.rows[r];
        if (!row.some(c => line(c)) || isExampleRow(row)) continue;
        const get = k => (col(k) == null ? '' : line(digits(rawCell(t, r, col(k)))));
        if (hs) {
          const c = { subject: get('subject'), subjectId: matchSubject(get('subject'), ctx.subjects) || null, year: isInt(get('year')) ? +get('year') : null, count: isInt(get('count')) ? +get('count') : null, _ref: rowRef(t, r) };
          if (!c.subjectId) flag(c, 'error', `Subjek "${c.subject}" tidak dikenali.`);
          if (c.year == null) flag(c, 'error', 'Tahun tidak sah.');
          if (c.count == null) flag(c, 'warn', 'Bilangan murid kosong.');
          counts.push(c);
        } else {
          const name = get('name'); if (!name) continue;
          const sp = splitCell(name);
          const c = { name: sp && sp.className ? sp.className : name, id: get('id') || classIdOf(sp && sp.className ? sp.className : name), year: isInt(get('year')) ? +get('year') : (sp && sp.year) || null, enrolment: isInt(get('count')) ? +get('count') : null, note: get('note') || null, _ref: rowRef(t, r) };
          if (c.year == null) flag(c, 'error', 'Tahun kelas tidak diketahui.');
          list.push(c);
        }
      }
    }
    if (!list.length && !counts.length && !headerFound && !templateKind(doc)) {
      method = 'senarai teks';
      textLines(doc).forEach((l, i) => {
        const s = line(digits(l.text)); if (!s) return;
        const sp = splitCell(s); if (!sp || !sp.className) return;
        const rest = s.replace(CLASS_RE, ' ');
        const n = rest.match(/(\d{1,3})/);
        list.push({ name: sp.className, id: classIdOf(sp.className), year: sp.year, enrolment: n ? +n[1] : null, note: null, _ref: `baris ${i + 1}` });
      });
    }
    const model = { classes: list, counts };
    const built = buildClasses(model, ctx);
    if (!list.length && !counts.length) built.issues.unshift({ level: 'error', msg: 'Tiada kelas ditemui (perlu lajur "Kelas"/"Tahun" atau senarai seperti "3 UKM 30").', ref: null });
    return result('classes', model, built, method);
  }
  function buildClasses(model, ctx = {}) {
    const issues = [...collectIssues(model.classes, 'Kelas:'), ...collectIssues(model.counts, 'Bilangan murid:')];
    const seen = new Set();
    const cl = [];
    (model.classes || []).forEach(c => {
      const name = line(c.name); if (!name) return;
      const id = line(c.id) || classIdOf(name);
      if (seen.has(id)) { issues.push({ level: 'error', msg: `ID kelas "${id}" berganda.`, ref: c._ref || null }); return; }
      seen.add(id);
      cl.push({ id, name, year: c.year != null && c.year !== '' ? +c.year : null, enrolment: c.enrolment != null && c.enrolment !== '' && +c.enrolment > 0 ? +c.enrolment : null });
    });
    cl.sort((a, b) => (a.year || 0) - (b.year || 0) || a.name.localeCompare(b.name));
    const studentCounts = {};
    (model.counts || []).forEach(c => { if (c.subjectId && c.year != null && +c.count > 0) studentCounts[`${c.subjectId}-${+c.year}`] = Math.round(+c.count); });
    const data = { schemaVersion: '1.0.0', type: 'classes', academicYearId: ctx.yearId || null, classes: cl, studentCounts };
    return { data, issues, stats: { classes: cl.length, withEnrolment: cl.filter(c => c.enrolment).length, studentCounts: Object.keys(studentCounts).length } };
  }

  // =====================================================================================
  // J. KURIKULUM (DSKP)
  // =====================================================================================
  const DSKP_ROLES = [
    ['sk', ['معيار المحتوى', 'معيارالمحتوى', 'ستندرد كاندوڠن', 'ستندرد كاندوغن', /standard\s*kandungan|content standard/i]],
    ['sp', ['معيار التعلم', 'معيارالتعلم', 'ستندرد ڤمبلاجرن', 'ستندرد فمبلاجرن', 'ستندرد فمبالجرن', /standard\s*pembelajaran|learning standard/i]],
    ['tp', ['ستندرد ڤرستاسي', 'ستندرد فريستاسي', 'ستندرد فرستاسي', 'تفصيل المستويات', 'المستويات', /standard\s*prestasi|tahap\s*penguasaan|performance standard|^tafsiran$/i]],
    ['note', ['الملاحظة', 'ملاحظة', /^catatan$|^nota$|^notes?$/i]],
  ];
  const DSKP_TPL = [
    ['dcode', [/^bidang\s*kod$|^kod\s*bidang$/i]], ['dname', [/^bidang\s*nama$|^nama\s*bidang$/i]], ['skcode', [/^sk\s*kod$|^kod\s*sk$/i]], ['sktext', [/^sk\s*teks$|^teks\s*sk$/i]],
    ['spcode', [/^sp\s*kod$|^kod\s*sp$/i]], ['sptext', [/^sp\s*teks$|^teks\s*sp$/i]], ['ppdf', [/halaman\s*pdf|^hlm\s*pdf/i]], ['pprint', [/halaman\s*bercetak|^hlm\s*cetak/i]],
    ['tp1', [/^tp\s*1$/i]], ['tp2', [/^tp\s*2$/i]], ['tp3', [/^tp\s*3$/i]], ['tp4', [/^tp\s*4$/i]], ['tp5', [/^tp\s*5$/i]], ['tp6', [/^tp\s*6$/i]], ['note', [/^catatan|^nota/i]],
  ];
  const BOILER = /^(موريد\s*(د[اأ]فت|داڤت|بوليه)\s*:?|murid\s*(dapat|boleh)\s*:?)\s*/i;
  const LEVELS = ['bidang', 'SK', 'SP', 'TP1', 'TP2', 'TP3', 'TP4', 'TP5', 'TP6'];
  /** Teks + nota daripada sel SK/SP: baris selepas ayat pertama yang berakhir dengan titik → nota (cth. senarai kosa kata, nota kaki *). */
  function splitTextNotes(cellText) {
    const ls = clean(cellText).split('\n').map(x => x.trim()).filter(Boolean);
    const text = [], notes = [];
    let done = false;
    for (const l of ls) {
      if (!done && /^\*/.test(l) && text.length) done = true;
      if (done) notes.push(l); else { text.push(l); if (/[.؟!]$/.test(l)) done = true; }
    }
    return { text: text.join(' ').replace(/\s+/g, ' ').trim(), notes: notes.length ? [notes.join(' ').replace(/\s+/g, ' ').trim()] : [] };
  }
  /** Kod di awal/akhir teks: "[1.1] …", "1.1 …", "… 1.1.1" → {code, rest}. */
  function leadingCode(text) {
    const s = digits(clean(text));
    let m = s.match(/^\s*[\[(]?\s*(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)\s*[\])]?[\s.:-]*/);
    if (m && okCode(m[1])) return { code: m[1], rest: s.slice(m[0].length) };
    m = s.match(/[\s\[(]+(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)\s*[\])]?\s*$/);
    if (m && okCode(m[1]) && isAr(s)) return { code: m[1], rest: s.slice(0, m.index) };
    return { code: null, rest: s };
  }
  function pageInfo(doc, page) {
    if (page == null) return null;
    return { pdf: page, printed: null };
  }
  function curriculumFromTables(doc, tables, ctx) {
    const rows = [];
    const bySk = new Map(), spSeen = new Set();
    let roles = null, width = 0, lastSk = null;
    const jawi = ctx.script === 'jawi';
    const T = s => (jawi ? jawiFix(s) : { text: arText(s), legacy: null, unknown: [] });
    const tpTables = [];
    for (const t of tables) {
      const hdrIdx = t.rows.findIndex((r, i) => i < 3 && rolesByNearest(r, DSKP_ROLES, r.length) && r.filter(c => headerKeyOf(c, DSKP_ROLES)).length >= 2);
      if (hdrIdx >= 0) { roles = rolesByNearest(t.rows[hdrIdx], DSKP_ROLES, t.rows[hdrIdx].length); width = t.rows[hdrIdx].length; }
      else if (!roles || (t.rows[0] || []).length !== width) continue;
      const pg = t.page || null;
      // Jadual TP umum (tiada lajur SK/SP): tahap 1–6 + huraian (Arab/Jawi + Melayu)
      if (!roles.includes('sk') && !roles.includes('sp')) {
        if (roles.includes('tp')) {
          const levels = [];
          for (let r = hdrIdx + 1; r < t.rows.length; r++) {
            const cells = uniq(t.rows[r].map(c => clean(c)).filter(Boolean));
            const lv = cells.find(c => /^[1-6]$/.test(line(digits(c))));
            const txt = cells.filter(c => c !== lv).join('\n');
            if (!lv || !txt) continue;
            const ls = clean(txt).split('\n');
            const alt = ls.filter(isAr).join(' '), ms = ls.filter(x => !isAr(x)).join(' ');
            const text = {}; if (alt) text[jawi ? 'jawi' : 'ar'] = T(alt).text; if (ms) text.ms = ms.replace(/\s+/g, ' ');
            if (!levels.some(x => x.tp === +line(digits(lv)))) levels.push({ tp: +line(digits(lv)), text });
          }
          if (levels.length) tpTables.push({ title: null, appliesToDomains: [], page: pg ? { pdf: pg, printed: null } : null, levels: levels.sort((a, b) => a.tp - b.tp), _ref: t.ref });
        }
        continue;
      }
      const hasSk = roles.includes('sk');
      for (let r = hdrIdx + 1; r < t.rows.length; r++) {
        const row = t.rows[r];
        const byRole = {};
        row.forEach((c, i) => { const k = roles[i]; if (!k) return; const v = clean(c); if (!v) return; (byRole[k] = byRole[k] || []); if (!byRole[k].includes(v)) byRole[k].push(v); });
        const ref = rowRef(t, r);
        // Sel kod SP yang jatuh dalam lajur SK (sel bergabung) → SP
        (byRole.sk || []).slice().forEach(v => { if (codeOnly(v) && extractCodes(v).sp.length && !extractCodes(v).sk.length) { byRole.sk = byRole.sk.filter(x => x !== v); (byRole.sp = byRole.sp || []).unshift(v); } });
        // SK
        for (const v of byRole.sk || []) {
          const vl = clean(v).split('\n');
          const pre = vl.length > 1 && /:$/.test(vl[0]) && vl[0].length < 24 && !leadingCode(vl[0]).code ? vl[0].replace(/:$/, '').trim() : null;
          const lc = leadingCode(pre ? vl.slice(1).join('\n') : v);
          const k = lc.code && lc.code.split('.').length === 2 ? lc.code : null;
          const id = k || `?${key(v).slice(0, 40)}`;
          if (bySk.has(id)) { lastSk = bySk.get(id); continue; }
          const tn = splitTextNotes(lc.rest);
          const strand = pre ? [null, pre, tn.text] : tn.text.match(/^([^:.،]{2,20}):\s*(.+)$/);
          const tx = T(strand ? strand[2] : tn.text);
          const rec = { level: 'SK', code: k || '', text: tx.text, textLegacy: jawi ? tx.legacy : undefined, strand: strand ? T(strand[1]).text : undefined, page: pageInfo(doc, pg), notes: tn.notes.map(n => T(n).text), _ref: ref };
          if (!k) flag(rec, 'error', 'Kod SK tidak ditemui dalam lapisan teks (mungkin imej). Isi kod berpandukan halaman asal atau guna AI.');
          if (tx.unknown.length) flag(rec, 'warn', `Perkataan Jawi perlu semakan: ${tx.unknown.slice(0, 6).join('، ')}`);
          bySk.set(id, rec); rows.push(rec); lastSk = rec;
        }
        // SP: sel kod + sel teks, atau sel teks berkod sebaris, atau beberapa SP dalam satu sel
        const spCells = byRole.sp || [];
        const codeCells = spCells.filter(codeOnly), textCells = spCells.filter(c => !codeOnly(c) && !/^\d{1,2}$/.test(line(digits(c))));
        const codes = uniq(codeCells.flatMap(c => extractCodes(c).sp));
        let items = [];
        textCells.forEach(tc => {
          const body = clean(tc).replace(BOILER, '').trim();
          // pecah ikut kod sebaris
          const parts = body.split(/\n(?=\s*\d{1,2}\.\d{1,2}\.\d{1,2}\b)/);
          parts.forEach(p => {
            const lc = leadingCode(p.replace(BOILER, ''));
            const segs = lc.code ? [{ code: lc.code, text: lc.rest }] : splitSentences(lc.rest).map(s => ({ code: null, text: s }));
            items.push(...segs);
          });
        });
        if (codes.length && items.length && items.every(i => !i.code)) {
          if (codes.length === items.length) items = items.map((it, i) => ({ ...it, code: codes[i] }));
          else if (items.length === 1) items = [{ code: codes[0], text: items[0].text, extraCodes: codes.slice(1) }];
          else { items = items.map((it, i) => ({ ...it, code: codes[i] || null })); }
        }
        if (!items.length && codes.length) items = codes.map(c => ({ code: c, text: '' }));
        for (const it of items) {
          if (!it.text && !it.code) continue;
          const dupKey = it.code || `?${key(it.text).slice(0, 60)}`;
          if (spSeen.has(dupKey)) continue;
          spSeen.add(dupKey);
          const tn = splitTextNotes(it.text);
          const tx = T(tn.text || it.text);
          const notesTxt = (byRole.note || []).map(n => T(line(n)).text);
          const rec = { level: 'SP', code: it.code || '', text: tx.text, textLegacy: jawi ? tx.legacy : undefined, page: pageInfo(doc, pg), notes: uniq([...tn.notes.map(n => T(n).text), ...notesTxt]), _ref: ref, _sk: lastSk ? lastSk.code : '' };
          if (!it.code) flag(rec, 'error', 'Kod SP tidak ditemui dalam lapisan teks. Isi kod berpandukan halaman asal atau guna AI.');
          else if (lastSk && lastSk.code && !it.code.startsWith(lastSk.code + '.')) flag(rec, 'warn', `SP ${it.code} berada dalam baris SK ${lastSk.code} — semak.`);
          if (!tx.text) flag(rec, 'error', 'Teks SP kosong.');
          if (it.extraCodes && it.extraCodes.length) flag(rec, 'warn', `Sel mengandungi kod lain (${it.extraCodes.join(', ')}) tanpa teks berasingan.`);
          if (tx.unknown.length) flag(rec, 'warn', `Perkataan Jawi perlu semakan: ${tx.unknown.slice(0, 6).join('، ')}`);
          rows.push(rec);
        }
        // TP per SK (PI): nombor tahap (jika ada) + teks
        if (hasSk && (byRole.tp || []).length && lastSk) {
          const lvlCell = row.find(c => /^[1-6]$/.test(line(digits(c))));
          const lvl = lvlCell ? +line(digits(lvlCell)) : null;
          for (const v of byRole.tp) {
            if (/^[1-6]$/.test(line(digits(v)))) continue;
            const existing = rows.filter(x => x.level.startsWith('TP') && x._skRef === lastSk);
            const n = lvl || existing.length + 1;
            if (n > 6 || existing.some(x => key(x.text) === key(T(line(v)).text))) continue;
            const tx = T(line(v));
            const rec = { level: `TP${n}`, code: lastSk.code, text: tx.text, textLegacy: jawi ? tx.legacy : undefined, page: pageInfo(doc, pg), notes: [], _ref: ref, _skRef: lastSk };
            if (!lvl) flag(rec, 'warn', `Nombor tahap tidak tercetak dalam lapisan teks — diandaikan TP${n} ikut susunan.`);
            rows.push(rec);
          }
        }
      }
    }
    rows.forEach(r => { delete r._skRef; });
    // Baris tanpa kod dalam dokumen yang kebanyakannya berkod (cth. jadual definisi SK/SP/TP) → dibuang.
    const coded = rows.filter(r => (r.level === 'SK' || r.level === 'SP') && r.code).length;
    const uncoded = rows.filter(r => (r.level === 'SK' || r.level === 'SP') && !r.code).length;
    let out = rows;
    if (coded >= 5 && coded >= 3 * uncoded) out = rows.filter(r => !((r.level === 'SK' || r.level === 'SP' || /^TP/.test(r.level)) && !r.code));
    out.tpTables = tpTables;
    out.dropped = rows.length - out.length;
    return out;
  }
  function splitSentences(text) {
    const ls = clean(text).split('\n').map(x => x.trim()).filter(Boolean);
    const out = []; let cur = [];
    for (const l of ls) { cur.push(l); if (/[.؟!]$/.test(l)) { out.push(cur.join(' ')); cur = []; } }
    if (cur.length) out.push(cur.join(' '));
    return out.map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }
  /** Nama bidang daripada tajuk halaman: "(1) مهارة …", "1. القرءان", "BIDANG 1: …". */
  function domainNames(doc) {
    const names = {};
    for (const p of doc.pages || []) {
      const ls = (p.lines || []).filter(l => !l.inTable);
      for (const l of ls) {
        const s = line(digits(l.text));
        const m = s.match(/^\(?\s*(\d{1,2})\s*\)?\s*[.:]?\s*(\S.{2,80})$/) || s.match(/^(\S.{2,60}?)\s*[.:]?\s*\(?\s*(\d{1,2})\s*\)?$/);
        if (!m || !isAr(s)) continue;
        const [n, name] = /^\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
        if (+n > 15 || names[n]) continue;
        if (/KSSR|DSKP|معيار|ستندرد/.test(name)) continue;
        const ms = ls.find(o => o !== l && !isAr(o.text) && Math.abs((+o.y || 0) - (+l.y || 0)) < 16 && /[a-z]/.test(o.text) && !/KSSR|^\d+$/.test(o.text));
        names[n] = { alt: arText(name), ms: ms ? line(ms.text).replace(/\s+/g, ' ') : null, page: p.n };
      }
    }
    return names;
  }
  function curriculumFromTemplate(t, h, ctx) {
    const col = k => (h.map[k] || [])[0];
    const rows = [];
    const doms = new Set(), sks = new Set();
    let lastDom = '', lastSk = '';
    const jawi = ctx.script === 'jawi';
    const T = s => { if (!s) return { text: '', legacy: undefined, unknown: [] }; if (!jawi) return { text: arText(s), legacy: undefined, unknown: [] }; const fx = RPH.jawi && RPH.jawi.legacyWords && RPH.jawi.legacyWords(s).length ? jawiFix(s) : { text: arText(s), legacy: undefined, unknown: [] }; return fx; };
    for (let r = h.row + 1; r < t.rows.length; r++) {
      const row = t.rows[r];
      if (!row.some(c => line(c)) || isExampleRow(row)) continue;
      const get = k => (col(k) == null ? '' : clean(digits(rawCell(t, r, col(k)))));
      const getT = k => (col(k) == null ? '' : clean(rawCell(t, r, col(k))));
      const ref = rowRef(t, r);
      const dcode = get('dcode') || lastDom; const skc = get('skcode') || lastSk; const spc = get('spcode');
      const page = isInt(get('ppdf')) || isInt(get('pprint')) ? { pdf: isInt(get('ppdf')) ? +get('ppdf') : null, printed: isInt(get('pprint')) ? +get('pprint') : null } : null;
      if (dcode && !doms.has(dcode)) {
        doms.add(dcode);
        const nm = getT('dname');
        rows.push({ level: 'bidang', code: dcode, text: isAr(nm) ? arText(nm) : '', textMs: isAr(nm) ? '' : nm, page: null, notes: [], _ref: ref });
      }
      if (skc && !sks.has(skc) && getT('sktext')) {
        sks.add(skc);
        const tx = T(getT('sktext'));
        const rec = { level: 'SK', code: skc, text: tx.text, textLegacy: tx.legacy, page, notes: [], _ref: ref };
        rows.push(rec);
        for (let n = 1; n <= 6; n++) { const v = getT(`tp${n}`); if (v) { const tt = T(v); rows.push({ level: `TP${n}`, code: skc, text: tt.text, textLegacy: tt.legacy, page, notes: [], _ref: ref }); } }
      } else if (skc && !sks.has(skc)) {
        sks.add(skc);
        rows.push(flag({ level: 'SK', code: skc, text: '', page, notes: [], _ref: ref }, 'error', `Teks SK ${skc} kosong.`));
      }
      if (spc || getT('sptext')) {
        const tx = T(getT('sptext'));
        const rec = { level: 'SP', code: spc, text: tx.text, textLegacy: tx.legacy, page, notes: getT('note') ? [getT('note')] : [], _ref: ref };
        rows.push(rec);
      }
      lastDom = dcode; lastSk = skc;
    }
    return rows;
  }
  /** Perenggan berkod (DOCX/teks tanpa jadual): "1.1 …" / "1.1.1 …". */
  function curriculumFromParagraphs(doc, ctx) {
    const rows = []; let cur = null;
    const jawi = ctx.script === 'jawi';
    const T = s => (jawi ? jawiFix(s) : { text: arText(s), legacy: undefined, unknown: [] });
    textLines(doc).forEach((l, i) => {
      const s = clean(l.text); if (!s) return;
      const lc = leadingCode(s);
      if (lc.code) {
        const tx = T(lc.rest);
        cur = { level: lc.code.split('.').length === 2 ? 'SK' : 'SP', code: lc.code, text: tx.text, textLegacy: jawi ? tx.legacy : undefined, page: l.page ? { pdf: l.page, printed: null } : null, notes: [], _ref: `perenggan ${i + 1}${l.page ? ` (hlm ${l.page})` : ''}` };
        flag(cur, 'warn', 'Diambil daripada perenggan (bukan jadual) — semak sempadan teks.');
        rows.push(cur);
      } else if (cur && !/[.؟!]$/.test(cur.text) && s.length < 200) {
        const tx = T(s); cur.text = `${cur.text} ${tx.text}`.trim(); if (jawi) cur.textLegacy = `${cur.textLegacy || ''} ${tx.legacy}`.trim();
      }
    });
    return rows;
  }
  function curriculum(doc, ctx = {}) {
    if (doc.json && doc.json.type === 'curriculum') return fromJson('curriculum', doc.json, ctx);
    ctx = { ...ctx };
    if (!ctx.script) ctx.script = doc.legacyJawi ? 'jawi' : (isAr(doc.text) ? 'arabic' : 'rumi');
    const tables = tablesOf(doc);
    let rows = null, method = 'jadual';
    for (const t of tables) {
      const h = findHeader(t.rows, DSKP_TPL, { need: ['skcode', 'spcode'], min: 3 });
      if (h) {
        // Helaian "Maklumat": subjek/tahun/skrip
        rows = curriculumFromTemplate(t, h, ctx); method = 'templat';
        break;
      }
    }
    if (!rows) {
      rows = curriculumFromTables(doc, tables, ctx);
      var tpTables = rows.tpTables || [], dropped = rows.dropped || 0;
      if (!rows.length) { rows = curriculumFromParagraphs(doc, ctx); method = 'perenggan'; }
    }
    // Bidang daripada tajuk halaman + kod SK
    if (method !== 'templat') {
      const names = domainNames(doc);
      const codes = uniq(rows.filter(r => r.level === 'SK' && r.code).map(r => r.code.split('.')[0]));
      const doms = codes.map(c => {
        const n = names[c];
        const rec = { level: 'bidang', code: c, text: n ? n.alt : '', textMs: n && n.ms ? n.ms : '', page: n ? { pdf: n.page, printed: null } : null, notes: [], _ref: n ? `hlm ${n.page}` : null };
        if (!n) flag(rec, 'warn', `Nama bidang ${c} tidak ditemui — isi nama bidang.`);
        return rec;
      });
      // sisip rekod bidang sebelum SK pertamanya
      const out = [];
      rows.forEach(r => { if (r.level === 'SK' && r.code) { const d = doms.find(x => x.code === r.code.split('.')[0]); if (d && !out.includes(d)) out.push(d); } out.push(r); });
      rows = out;
    }
    const meta = { subjectId: ctx.subjectId || null, year: ctx.subjectYear || null, script: ctx.script, title: (doc.name || '').replace(/\.[^.]+$/, ''), file: doc.name || null, pdfPages: doc.numPages || (doc.pages || []).length || null };
    const fn = `${doc.name || ''} ${str(doc.text).slice(0, 3000)}`;
    const ym = fn.match(/TAHUN\s*(\d)/i); if (!meta.year && ym) meta.year = +ym[1];
    if (typeof tpTables !== 'undefined' && tpTables.length) meta.tpTables = tpTables;
    const model = { meta, rows };
    const built = buildCurriculum(model, ctx);
    if (typeof dropped !== 'undefined' && dropped) built.issues.push({ level: 'warn', msg: `${dropped} baris tanpa kod (cth. jadual definisi) diabaikan.`, ref: null });
    if (!rows.length) built.issues.unshift({ level: 'error', msg: doc.scanned ? 'PDF imbasan tanpa lapisan teks. Guna "Ekstrak dengan AI" atau templat Excel DSKP.' : 'Tiada SK/SP ditemui. Pastikan fail mempunyai jadual Standard Kandungan / Standard Pembelajaran, atau guna templat Excel DSKP.', ref: null });
    return result('curriculum', model, built, method);
  }
  function buildCurriculum(model, ctx = {}) {
    const meta = model.meta || {};
    const subjectId = meta.subjectId || ctx.subjectId;
    const year = +(meta.year || ctx.subjectYear) || null;
    const script = meta.script || ctx.script || 'rumi';
    const altKey = script === 'jawi' ? 'jawi' : 'ar';
    const rows = model.rows || [];
    rows.forEach(r => { r._issues = (r._issues || []).filter(i => !i.auto); });
    const issues = [];
    const domains = [], seen = new Set();
    const dom = (code, rec) => {
      let d = domains.find(x => x.code === String(code));
      if (!d) { d = { code: String(code), name: {}, contentStandards: [] }; domains.push(d); if (!rec) issues.push({ level: 'warn', msg: `Bidang ${code} tiada nama.`, ref: null }); }
      return d;
    };
    const skOf = code => { for (const d of domains) { const s = d.contentStandards.find(x => x.code === code); if (s) return s; } return null; };
    const autoFlag = (r, level, msg) => (r._issues = r._issues || []).push({ level, msg, auto: true });
    let tpAny = false, lastSkCode = '';
    const hasErr = r => (r._issues || []).some(i => i.level === 'error');
    for (const r of rows) {
      const lv = String(r.level || '').trim();
      let code = line(digits(r.code));
      if (/^TP/i.test(lv) && !code) code = lastSkCode;
      if (lv === 'SK') lastSkCode = code;
      const page = r.page && (r.page.pdf != null || r.page.printed != null) ? { pdf: r.page.pdf != null && r.page.pdf !== '' ? +r.page.pdf : null, printed: r.page.printed != null && r.page.printed !== '' ? +r.page.printed : null } : null;
      if (lv === 'bidang') {
        if (!code) { autoFlag(r, 'error', 'Kod bidang kosong.'); continue; }
        const d = dom(code, r);
        const nm = {}; if (line(r.text)) nm[isAr(r.text) ? altKey : 'ms'] = line(r.text); if (line(r.textMs)) nm.ms = line(r.textMs);
        d.name = { ...d.name, ...nm };
        if (!Object.keys(d.name).length) autoFlag(r, 'warn', 'Nama bidang kosong.');
        continue;
      }
      if (lv === 'SK') {
        if (!/^\d+\.\d+$/.test(code)) { if (code || !hasErr(r)) autoFlag(r, 'error', code ? `Kod SK "${code}" tidak sah (format N.n).` : 'Kod SK kosong.'); continue; }
        if (seen.has(code)) { autoFlag(r, 'error', `Kod ${code} berganda.`); continue; }
        seen.add(code);
        if (!line(r.text)) autoFlag(r, 'warn', `Teks SK ${code} kosong.`);
        const it = { code, displayCode: line(r.displayCode) || code, text: line(r.text) || null, page, notes: (r.notes || []).filter(Boolean), learningStandards: [], performanceStandards: [] };
        if (r.strand) it.strand = { [altKey]: r.strand };
        if (r.textLegacy) it.textLegacy = line(r.textLegacy);
        dom(code.split('.')[0]).contentStandards.push(it);
        continue;
      }
      if (lv === 'SP') {
        if (!/^\d+\.\d+\.\d+$/.test(code)) { if (code || !hasErr(r)) autoFlag(r, 'error', code ? `Kod SP "${code}" tidak sah (format N.n.n).` : 'Kod SP kosong.'); continue; }
        if (seen.has(code)) { autoFlag(r, 'error', `Kod ${code} berganda.`); continue; }
        const sk = skOf(code.split('.').slice(0, 2).join('.'));
        if (!sk) { autoFlag(r, 'error', `SK induk ${code.split('.').slice(0, 2).join('.')} bagi SP ${code} tiada.`); continue; }
        seen.add(code);
        if (!line(r.text)) autoFlag(r, 'warn', `Teks SP ${code} kosong.`);
        const it = { code, displayCode: line(r.displayCode) || code, text: line(r.text) || null, page, notes: (r.notes || []).filter(Boolean) };
        if (r.textLegacy) it.textLegacy = line(r.textLegacy);
        sk.learningStandards.push(it);
        continue;
      }
      const tp = lv.match(/^TP\s*([1-6])$/i);
      if (tp) {
        const sk = skOf(code);
        if (!sk) { if (code) autoFlag(r, 'error', `TP${tp[1]}: SK "${code}" tiada.`); continue; }
        tpAny = true;
        const p = { tp: +tp[1], label: null, text: line(r.text) || null, page };
        if (r.textLegacy) p.textLegacy = line(r.textLegacy);
        sk.performanceStandards = sk.performanceStandards.filter(x => x.tp !== p.tp).concat(p).sort((a, b) => a.tp - b.tp);
        continue;
      }
      autoFlag(r, 'error', `Jenis baris "${lv}" tidak dikenali (Bidang, SK, SP, TP1–TP6).`);
    }
    // Jawi: ejaan fon lama yang belum ditukar
    if (script === 'jawi' && RPH.jawi && RPH.jawi.legacyWords) rows.forEach(r => { const lw = RPH.jawi.legacyWords(r.text); if (lw.length) autoFlag(r, 'warn', `Ejaan Jawi fon lama belum ditukar: ${uniq(lw).slice(0, 5).join('، ')}`); });
    domains.sort((a, b) => codeSort(`${a.code}.0`, `${b.code}.0`));
    domains.forEach(d => { d.contentStandards.sort((a, b) => codeSort(a.code, b.code)); d.contentStandards.forEach(s => s.learningStandards.sort((a, b) => codeSort(a.code, b.code))); });
    issues.push(...collectIssues(rows));
    if (!subjectId) issues.push({ level: 'error', msg: 'Subjek belum dipilih.', ref: null });
    if (!year) issues.push({ level: 'error', msg: 'Tahun (darjah) belum dipilih.', ref: null });
    let nSk = 0, nSp = 0; domains.forEach(d => d.contentStandards.forEach(s => { nSk++; nSp += s.learningStandards.length; }));
    const pendingRows = rows.filter(r => (r._issues || []).some(i => i.level === 'error')).length;
    const data = {
      schemaVersion: '1.0.0', type: 'curriculum', id: `${subjectId || 'SUBJEK'}-T${year || 0}-IMPORT`, subjectId: subjectId || null,
      subjectName: ctx.subjectName || null, year, framework: meta.framework || ctx.framework || '', script, direction: script === 'rumi' || script === 'latin' ? 'ltr' : 'rtl',
      source: { title: meta.title || null, file: meta.file || ctx.fileName || null, pdfPages: meta.pdfPages || null, importedAt: ctx.now || null, method: meta.method || 'import' },
      domains,
      performanceStandards: tpAny ? { scope: 'perContentStandard', tables: [] } : { scope: 'generic', tables: (meta.tpTables || []).map(t => ({ title: t.title, appliesToDomains: t.appliesToDomains || [], page: t.page, levels: t.levels })) },
      themes: meta.themes || [],
      verification: { method: 'import + semakan guru', date: (ctx.now || '').slice(0, 10) || null, counts: { contentStandards: nSk, learningStandards: nSp }, issues: [] },
    };
    rows.forEach(r => (r._issues || []).forEach(i => { if (i.level === 'warn' && r.code) data.verification.issues.push({ ref: r.code, type: 'perlu-semakan', detail: i.msg }); }));
    if (!tpAny && !(meta.tpTables || []).length) issues.push({ level: 'warn', msg: 'Jadual Tahap Penguasaan (TP) tidak diimport — boleh ditambah kemudian (templat Excel lajur TP1–TP6 atau JSON).', ref: null });
    else if (!tpAny) issues.push({ level: 'warn', msg: `${meta.tpTables.length} jadual TP umum diimport tanpa padanan bidang — tetapkan bidang bagi setiap jadual di halaman DSKP jika perlu.`, ref: null });
    return { data, issues, stats: { domains: domains.length, sk: nSk, sp: nSp, tp: tpAny, rowsWithErrors: pendingRows } };
  }

  // =====================================================================================
  // K. RPT
  // =====================================================================================
  const RPT_ROLES = [
    ['week', [/^(minggu|mgg|week|no\.?\s*minggu)$/i, 'الأسبوع', 'الاسبوع', 'أسبوع', 'ميڠݢو', 'ميغضو']],
    ['dates', [/^tarikh$|^date$/i, 'التاريخ', 'تاريخ', 'تاريخ']],
    ['theme', [/^tema$|^theme$|^tema\s*\/\s*unit$/i, 'المحور', 'محور', 'تيما']],
    ['unit', [/^unit$|^modul$/i, 'الموضوع', 'موضوع', 'الوحدة', 'اونيت']],
    ['bidang', [/^bidang$|^domain$|^tunjang$|^kemahiran$/i, 'بيدڠ', 'بيدغ', 'المجال', 'المهارة']],
    ['topic', [/^tajuk$|^topik$|^topic$|^tajuk\s*\/\s*topik$/i, 'توڤيك', 'توفيك', 'تاجوق', 'العنوان', 'عنوان']],
    ['content', [/^kandungan$|^isi\s*pelajaran$|^aktiviti$|^content$/i, 'المحتويات الدرس', 'محتويات الدرس', 'المحتويات', 'محتوى الدرس']],
    ['skText', [/^teks\s*sk$/i]], ['spText', [/^teks\s*sp$/i]],
    ['sk', [/^(sk|standard\s*kandungan)$/i, 'معيار المحتوى', 'ستندرد كاندوڠن', 'ستندرد كاندوغن']],
    ['sp', [/^(sp|standard\s*pembelajaran)$/i, 'معيار التعلم', 'ستندرد ڤمبلاجرن', 'ستندرد فمبلاجرن']],
    ['kind', [/^jenis$/i]],
    ['note', [/^catatan$|^nota$|^ulasan$|^note$/i, 'الملاحظة', 'ملاحظة', 'چاتتن', 'خاتتن']],
  ];
  const RPT_ROLE_LABELS = { week: 'Minggu', dates: 'Tarikh', theme: 'Tema', unit: 'Unit', bidang: 'Bidang', topic: 'Tajuk', content: 'Kandungan', sk: 'Kod SK', sp: 'Kod SP', skText: 'Teks SK', spText: 'Teks SP', kind: 'Jenis', note: 'Catatan', ignore: '— Abaikan —' };
  const RPT_KINDS = ['lesson', 'khatam', 'program', 'cuti', 'ulangkaji', 'peperiksaan'];
  function kindFromText(t) {
    const s = line(t);
    if (/^(cuti|الإجازة|إجازة|عطلة)|cuti\s+(hari|penggal|pertengahan|akhir|perayaan|tambahan)|hari raya/i.test(s) || /الإجازة/.test(s)) return 'cuti';
    if (/peperiksaan|pentaksiran|\bUASA\b|\bUPSA\b|\bPSAT\b|ujian|الامتحان|الإمتحان|ڤڤريقساءن|فقريقساءن/i.test(s)) return 'peperiksaan';
    if (/ulang\s*kaji|مراجعة|اولڠكاجي|اولغكاجي/i.test(s)) return 'ulangkaji';
    if (/program|aktiviti pembukaan|minggu (orientasi|transisi)|sukan|ڤروݢرم|فروضرم|البرامج/i.test(s)) return 'program';
    return null;
  }
  /** Profil BA: jenis kandungan baris RPT (deskriptif) + calon SK (hanya jika diminta; ditanda diterbitkan sistem). */
  function baContentKind(text) {
    const t = text.join(' ');
    if (/الإجازة|CUTI|Cuti|Hari Raya/.test(t) && !/[ء-ي]{3,}.*:/.test(t.replace(/الإجازة المدرسية/, ''))) return { kind: 'cuti', sk: [] };
    if (/AKTIVITI PEMBUKAAN|SUAL KENAL/i.test(t)) return { kind: 'program', sk: [] };
    if (/مراجعة/.test(t)) return { kind: 'ulangkaji', sk: [] };
    if (/الإمتحان|الامتحان|PSAT/.test(t) && !/البرامج/.test(t)) return { kind: 'peperiksaan', sk: [] };
    if (/البرامج الخاصة/.test(t)) return { kind: 'program-pasca-peperiksaan', sk: [] };
    if (/إنتاج ملصقات/.test(t)) return { kind: 'projek', sk: ['1.3'], sp: ['1.3.5'], rule: 'إنتاج الملصقات → SP 1.3.5' };
    if (/الأرقام والأعداد/.test(t)) return { kind: 'nombor', sk: ['1.5', '2.5', '3.5'], rule: 'الأرقام والأعداد → SK x.5' };
    if (/التراكيب/.test(t)) return { kind: 'tarkib', sk: ['1.4', '2.4', '3.4'], rule: 'التراكيب → SK x.4' };
    if (/المقاطع الكلمات|مقاطع الكلمات المحاور/.test(t)) return { kind: 'kosa-kata', sk: ['1.3', '2.3', '3.3'], rule: 'كلمات المحاور → SK x.3' };
    if (/الحروف المركزة/.test(t) && /بالحركات المختلفة/.test(t) && /الساكنة والمشددة/.test(t)) return { kind: 'huruf+suku-kata', sk: ['1.1', '2.1', '3.1', '1.2', '2.2', '3.2'], rule: 'huruf berbaris + الساكنة والمشددة → SK x.1 dan x.2' };
    if (/الساكنة والمشددة|^مقاطع|الطويلة|الطويلتين/.test(t) || /^مقاطع/.test(text[0] || '')) return { kind: 'suku-kata', sk: ['1.2', '2.2', '3.2'], rule: 'المقاطع / الساكنة والمشددة → SK x.2' };
    if (/الحروف المركزة|^صوت/.test(t)) return { kind: 'huruf', sk: ['1.1', '2.1', '3.1'], rule: 'الحروف بالحركات المختلفة → SK x.1' };
    return { kind: 'lain', sk: [] };
  }
  /** Cadangan pemetaan lajur bagi satu jadual RPT. → {header, roles[], score} */
  function rptDetect(rows) {
    for (let r = 0; r < Math.min(rows.length, 6); r++) {
      const row = rows[r];
      const roles = row.map(c => headerKeyOf(c, RPT_ROLES) || null);
      const got = roles.filter(Boolean);
      if (!got.includes('week') || got.length < 2) continue;
      // Peranan berganda → kod vs teks / minggu vs tarikh ikut kandungan
      const body = rows.slice(r + 1, r + 40);
      const frac = (i, test) => { const v = body.map(b => line(b[i])).filter(Boolean); return v.length ? v.filter(test).length / v.length : 0; };
      const fixDup = (role, aRole, bRole, test) => {
        const idx = roles.map((x, i) => (x === role ? i : -1)).filter(i => i >= 0);
        if (idx.length < 2) return;
        const scored = idx.map(i => ({ i, f: frac(i, test) })).sort((a, b) => b.f - a.f);
        scored.forEach((s, k) => { roles[s.i] = k === 0 && s.f > 0.5 ? aRole : (k === 0 ? bRole : (roles.slice(0, s.i).includes(bRole) ? 'ignore' : bRole)); });
        if (!roles.includes(aRole)) roles[scored[0].i] = aRole;
      };
      fixDup('week', 'week', 'dates', v => isInt(v));
      fixDup('sk', 'sk', 'skText', v => codeOnly(v));
      fixDup('sp', 'sp', 'spText', v => codeOnly(v));
      ['sk', 'sp'].forEach(k => { roles.forEach((x, i) => { if (x === k && frac(i, v => codeOnly(v)) < 0.3) roles[i] = k === 'sk' ? 'skText' : 'spText'; }); });
      // Lajur teks SK/SP bersebelahan kod tanpa tajuk sendiri
      roles.forEach((x, i) => { if (!x) roles[i] = 'ignore'; });
      return { header: r, roles, score: got.length };
    }
    return null;
  }
  /** Baris jadual RPT → rekod pelajaran (format perantaraan). */
  function rptRecords(tables, mapping, ctx) {
    const recs = [];
    const jawi = ctx.script === 'jawi';
    const T = s => (jawi ? jawiFix(s) : { text: arText(s), legacy: null, unknown: [] });
    let lastWeek = null, lastUnit = null;
    for (const t of tables) {
      const mp = mapping[t.index] || rptDetect(t.rows);
      if (!mp) continue;
      const roles = mp.roles;
      for (let r = (mp.header ?? -1) + 1; r < t.rows.length; r++) {
        const row = t.rows[r];
        if (!row.some(c => line(c)) || isExampleRow(row)) continue;
        const get = role => uniq(roles.map((x, i) => (x === role ? clean(row[i]) : '')).filter(Boolean));
        const one = role => get(role).join('\n');
        // ulang tajuk (jadual berbilang halaman)
        if (row.filter((c, i) => roles[i] !== 'ignore' && headerKeyOf(c, RPT_ROLES)).length >= 2) continue;
        const ref = rowRef(t, r);
        const wkTxt = line(digits(one('week')));
        let weeks = [];
        const wr = wkTxt.match(/^(?:m(?:inggu)?\s*)?(\d{1,2})\s*(?:-|–|hingga)\s*(\d{1,2})$/i);
        if (wr && +wr[2] >= +wr[1] && +wr[2] - +wr[1] < 6) for (let n = +wr[1]; n <= +wr[2]; n++) weeks.push(n);
        else { const m1 = wkTxt.match(/^(?:m(?:inggu)?\s*)?(\d{1,2})$/i); if (m1) weeks.push(+m1[1]); }
        const nonWeek = roles.map((x, i) => (x !== 'week' && x !== 'dates' && x !== 'ignore' ? line(row[i]) : null)).filter(x => x != null);
        const spanning = nonWeek.filter(Boolean).length >= 2 && uniq(nonWeek.filter(Boolean)).length === 1;
        const content = one('content');
        const contentKeys = new Set(get('content').map(line));
        const unitLabels = spanning || !(/^\d/.test(wkTxt)) ? [] : uniq(get('unit').filter(v => !contentKeys.has(line(v))).flatMap(v => clean(v).split('\n')).map(x => x.trim()).filter(Boolean));
        const unitRaw = unitLabels[0] || '';
        if (unitRaw) lastUnit = unitRaw;
        const skCodes = uniq([...get('sk'), ...get('skText')].flatMap(v => extractCodes(v).sk));
        const spCodes = uniq([...get('sp'), ...get('spText')].flatMap(v => extractCodes(v).sp));
        const topicRaw = clean(one('topic'));
        const tl = topicRaw.split('\n').map(x => x.trim()).filter(Boolean);
        const strand = tl.length > 1 && /:$/.test(tl[0]) && tl[0].length < 24 ? tl[0].replace(/:$/, '').trim() : null;
        const topicTxt = strand ? tl.slice(1).join(' ') : tl.join(' ');
        const bid = T(line(one('bidang'))); const top = T(topicTxt); const str2 = strand ? T(strand) : null;
        const skT = T(line(get('skText').filter(v => !codeOnly(v)).join(' ')));
        const spLines = get('spText').filter(v => !codeOnly(v)).flatMap(v => splitSentences(v));
        const rec = {
          rptWeek: weeks.length === 1 ? weeks[0] : (weeks.length ? weeks[0] : null), weeks, weekText: wkTxt, dates: line(one('dates')),
          theme: line(one('theme')), unit: unitRaw, unitLabels, bidang: bid.text, bidangLegacy: jawi ? bid.legacy : undefined,
          strand: str2 ? str2.text : '', topic: top.text, topicLegacy: jawi ? tl.join(' ') : undefined,
          content: clean(content).split('\n').map(x => (isAr(x) ? arText(x) : x).trim()).filter(Boolean),
          sk: skCodes, sp: spCodes, skText: skT.text, spText: spLines.map(s => T(s).text).join('\n'), skTextLegacy: jawi ? skT.legacy : undefined, spTextLegacy: jawi ? spLines.join('\n') : undefined,
          note: line(one('note')) || '', kind: '', spanning, _ref: ref,
        };
        if (!rec.unit && lastUnit && rec.rptWeek != null && !spanning) { rec.unit = lastUnit; rec._unitCarried = true; }
        // Jenis
        const kindCell = line(one('kind'));
        const allText = [rec.topic, rec.bidang, rec.content.join(' '), rec.skText].join(' ');
        if (kindCell) rec.kind = RPT_KINDS.find(k => key(k) === key(kindCell)) || ({ pelajaran: 'lesson', 'ulang kaji': 'ulangkaji' }[kindCell.toLowerCase()]) || kindCell.toLowerCase();
        else if (/ختم\s*القر|khatam|تسميع/i.test(`${rec.bidang} ${rec.bidangLegacy || ''}`)) rec.kind = 'khatam';
        else if (spanning) rec.kind = kindFromText(nonWeek[0]) || 'program';
        else if (!skCodes.length && !spCodes.length) rec.kind = kindFromText(allText) || 'lesson';
        else rec.kind = 'lesson';
        if (spanning) {
          const tx = T(nonWeek.find(Boolean));
          Object.assign(rec, { bidang: '', bidangLegacy: undefined, strand: '', skText: '', spText: '', skTextLegacy: undefined, spTextLegacy: undefined, note: '', sk: [], sp: [] });
          if (roles.includes('content')) { rec.content = [tx.text]; rec.topic = ''; } else { rec.content = []; rec.topic = tx.text; if (jawi) rec.topicLegacy = tx.legacy; }
        }
        if (rec.rptWeek == null && rec.kind !== 'cuti') flag(rec, wkTxt ? 'error' : 'warn', wkTxt ? `Minggu "${wkTxt}" tidak dikenali.` : 'Baris tanpa nombor minggu.');
        if (weeks.length > 1) flag(rec, 'warn', `Julat minggu ${wkTxt} — pelajaran diulang untuk setiap minggu.`);
        if ([...get('sk'), ...get('sp')].some(v => extractCodes(v).range)) flag(rec, 'warn', 'Julat kod (cth. 1.1.1–1.1.3) dikesan — hanya kod yang tertulis diambil. Semak.');
        [bid, top, skT].forEach(x => { if (x.unknown && x.unknown.length) flag(rec, 'warn', `Perkataan Jawi perlu semakan: ${x.unknown.slice(0, 5).join('، ')}`); });
        recs.push(rec);
        lastWeek = rec.rptWeek ?? lastWeek;
      }
    }
    return recs;
  }
  function bidangIdOf(text, legacy, list) {
    const k = key(text), kl = key(legacy || '');
    for (const b of list || []) {
      const names = [b.jawi, b.ms, b.ar, b.id, ...(b.aliases || [])].filter(Boolean);
      if (names.some(n => { const kn = key(n); return kn && (kn === k || kn === kl); })) return b.id;
    }
    const FALLBACK = { 'ختم القرءان': 'khatam', 'القرءان': 'quran', 'عقيدة': 'akidah', 'عبادة': 'ibadah', 'سيرة': 'sirah', 'ادب': 'adab', 'جاوي': 'jawi', 'حديث': 'hadis' };
    for (const [n, id] of Object.entries(FALLBACK)) if (key(n) === k || key(n) === kl) return id;
    return null;
  }
  /** Padanan unit → tema DSKP (perbendaharaan kata / nama). Cadangan sahaja (ditanda). */
  function themeFor(unit, recs, themes) {
    if (!unit || !(themes || []).length) return null;
    const words = new Set(recs.filter(r => r.unit === unit).flatMap(r => r.content.join(' ').split(/[\s،,:.؛/()-]+/)).filter(w => w.length > 1).map(w => w.replace(/^ال/, '')));
    let best = null;
    for (const th of themes) {
      const name = (th.name && (th.name.ar || th.name.jawi || th.name.ms)) || '';
      const voc = (th.vocabulary || []).map(w => w.replace(/^ال/, ''));
      const hits = voc.filter(w => words.has(w)).length;
      const strip = s => s.split(/\s+/).map(w => w.replace(/^(ال|و)/, '').replace(/[يه]$/, ''));
      const nameHit = strip(unit).some(w => w.length > 2 && strip(name).includes(w)) ? 3 : 0;
      const score = hits + nameHit;
      if (score >= 2 && (!best || score > best.score)) best = { name, score };
    }
    return best ? best.name : null;
  }
  /** Tema DSKP bagi satu baris RPT ikut kosa kata kandungan (≥ 2 perkataan sepadan). */
  function rowTheme(r, themes) {
    const words = new Set((r.content || []).join(' ').split(/[\s،,:.؛/()-]+/).filter(w => w.length > 1).map(w => w.replace(/^ال/, '')));
    let best = null;
    for (const th of themes || []) {
      const hits = (th.vocabulary || []).map(w => w.replace(/^ال/, '')).filter(w => words.has(w)).length;
      if (hits >= 2 && (!best || hits > best.hits)) best = { name: (th.name && (th.name.ar || th.name.jawi || th.name.ms)) || null, hits };
    }
    return best ? best.name : null;
  }
  function rpt(doc, ctx = {}) {
    if (doc.json && doc.json.type === 'rpt') return fromJson('rpt', doc.json, ctx);
    ctx = { ...ctx };
    if (!ctx.script) ctx.script = doc.legacyJawi ? 'jawi' : (isAr(doc.text) ? 'arabic' : 'rumi');
    const tables = tablesOf(doc);
    const mapping = {};
    let first = null;
    tables.forEach(t => { const d = rptDetect(t.rows); if (d) { mapping[t.index] = d; if (!first) first = d; } });
    // Jadual sambungan tanpa tajuk dengan lebar sama → guna pemetaan pertama
    if (first) tables.forEach(t => { if (!mapping[t.index] && t.rows.length && t.rows[0].length === first.roles.length && t.rows.length > 1) mapping[t.index] = { header: -1, roles: first.roles.slice(), inherited: true }; });
    const model = { meta: { subjectId: ctx.subjectId || null, year: ctx.subjectYear || null, academicYearId: ctx.yearId || null, file: doc.name || null, title: (doc.name || '').replace(/\.[^.]+$/, ''), shape: ctx.shape || null, script: ctx.script }, mapping, records: [] };
    model.records = rptRecords(tables, mapping, ctx);
    const ym = `${doc.name || ''} ${str(doc.text).slice(0, 2000)}`.match(/TAHUN\s*(\d)\b/i); if (!model.meta.year && ym) model.meta.year = +ym[1];
    const built = buildRpt(model, ctx);
    if (!Object.keys(mapping).length) built.issues.unshift({ level: 'error', msg: doc.scanned ? 'Imbasan/imej: guna "Ekstrak dengan AI" atau templat Excel RPT.' : 'Jadual RPT tidak dikesan (perlu lajur Minggu). Tetapkan pemetaan lajur secara manual atau guna templat Excel RPT.', ref: null });
    return result('rpt', model, built, 'jadual');
  }
  /** Bina semula rekod daripada Doc dengan pemetaan lajur baharu (langkah padanan lajur). */
  function rptRemap(doc, mapping, ctx = {}) {
    ctx = { ...ctx }; if (!ctx.script) ctx.script = doc.legacyJawi ? 'jawi' : (isAr(doc.text) ? 'arabic' : 'rumi');
    return rptRecords(tablesOf(doc).filter(t => mapping[t.index]), mapping, ctx);
  }
  function buildRpt(model, ctx = {}) {
    const meta = model.meta || {};
    const subjectId = meta.subjectId || ctx.subjectId || null;
    const year = +(meta.year || ctx.subjectYear) || null;
    const shape = meta.shape || ctx.shape || (subjectId === 'BA' ? 'rows' : 'weeks');
    const jawi = (meta.script || ctx.script) === 'jawi';
    const recs = (model.records || []).map(r => ({ ...r, _issues: (r._issues || []).filter(i => !i.auto) }));
    const issues = [];
    const auto = (r, level, msg) => r._issues.push({ level, msg, auto: true });
    // Semak kod terhadap DSKP (jika ada)
    const known = ctx.curriculumCodes ? new Set(ctx.curriculumCodes) : null;
    recs.forEach(r => {
      r.sk = (Array.isArray(r.sk) ? r.sk : extractCodes(r.sk).sk).filter(Boolean);
      r.sp = (Array.isArray(r.sp) ? r.sp : extractCodes(r.sp).sp).filter(Boolean);
      if (known) { const bad = [...r.sk, ...r.sp].filter(c => !known.has(c)); if (bad.length) auto(r, 'warn', `Kod tiada dalam DSKP: ${bad.join(', ')}`); }
      const orphan = r.sk.length ? r.sp.filter(c => !r.sk.includes(c.split('.').slice(0, 2).join('.'))) : [];
      if (orphan.length) auto(r, 'warn', `SP ${orphan.join(', ')} bukan di bawah SK ${r.sk.join(', ')}.`);
    });
    // Tema automatik (BA): unit → tema DSKP
    if (shape === 'rows' && (ctx.themes || []).length) {
      // 1) tema ikut kosa kata baris itu; 2) tema unit; 3) bawa dari baris sebelum. Unit berbilang label → pilih label yang sepadan tema.
      const labels = uniq(recs.flatMap(r => r.unitLabels && r.unitLabels.length ? r.unitLabels : (r.unit ? [r.unit] : [])));
      const unitTheme = {}; labels.forEach(u => { unitTheme[u] = themeFor(u, recs.filter(r => (r.unitLabels || []).length <= 1), ctx.themes) || themeFor(u, [], ctx.themes); });
      let prev = null;
      recs.forEach(r => {
        if (r.rptWeek == null || r.kind === 'cuti') return;
        if (!r.theme) {
          const own = rowTheme(r, ctx.themes);
          const multi = (r.unitLabels || []).length > 1;
          r.theme = own || (!multi && r.unit ? unitTheme[r.unit] : null) || prev || null;
          if (r.theme) r._themeAuto = true;
        }
        if ((r.unitLabels || []).length > 1) {
          const pick = r.unitLabels.find(u => unitTheme[u] && unitTheme[u] === r.theme);
          if (pick) r.unit = pick;
          (r._issues = r._issues || []).push({ level: 'warn', msg: `Sel unit bergabung mengandungi beberapa label (${r.unitLabels.join(' / ')}) — unit "${r.unit}" dipilih ikut tema; semak.`, auto: true });
        }
        if (r._themeAuto) (r._issues = r._issues || []).push({ level: 'warn', msg: `Tema "${r.theme}" dipadankan automatik — semak.`, auto: true });
        prev = r.theme || prev;
      });
    }
    let data;
    if (shape === 'rows') {
      const rows = recs.map(r => {
        const prof = subjectId === 'BA' ? baContentKind(r.content.length ? r.content : [r.topic]) : null;
        const kind = prof && prof.kind !== 'lain' ? prof.kind : (r.kind || 'lesson');
        const out = { rptWeek: r.rptWeek, datesAsPrinted: r.dates || undefined, unit: r.unit || null, theme: r.theme || null, kind, content: r.content.length ? r.content : (r.topic ? [r.topic] : []), note: r.note || null,
          skCandidates: r.sk.slice(), spCandidates: r.sp.slice(), derivation: null };
        if (r.topic && r.content.length) out.topic = r.topic;
        if (!r.sk.length && !r.sp.length && ctx.deriveCandidates && prof && prof.sk.length) { out.skCandidates = prof.sk.slice(); out.spCandidates = (prof.sp || []).slice(); out.derivation = `diterbitkan sistem: ${prof.rule}`; }
        return out;
      });
      // Ulang kaji (cth. "مراجعة الدرس للإمتحان") tanpa kod: SK/SP = calon baris RPT terdahulu bagi unit (atau tema) yang sama.
      // Kod hanya daripada RPT itu sendiri — tiada kod baharu direka.
      if (ctx.deriveCandidates) rows.forEach((o, i) => {
        if (o.skCandidates.length || o.spCandidates.length || !/ulangkaji|peperiksaan|pentaksiran/.test(o.kind || '')) return;
        const same = rows.slice(0, i).filter(p => p.skCandidates.length && ((o.unit && p.unit === o.unit) || (!o.unit && o.theme && p.theme === o.theme)));
        if (!same.length) return;
        o.skCandidates = uniq(same.flatMap(p => p.skCandidates)); o.spCandidates = uniq(same.flatMap(p => p.spCandidates));
        const wk = uniq(same.map(p => p.rptWeek).filter(x => x != null));
        o.derivation = `diterbitkan sistem: ulang kaji ${o.unit ? `unit «${o.unit}»` : `tema «${o.theme}»`} — SK/SP daripada baris RPT unit itu (minggu ${wk[0]}${wk.length > 1 ? `–${wk[wk.length - 1]}` : ''})`;
      });
      data = { schemaVersion: '1.0.0', type: 'rpt', id: `RPT-${subjectId || 'X'}-T${year || 0}-${ctx.yearId || 'IMPORT'}`, subjectId, year, academicYearId: ctx.yearId || meta.academicYearId || null,
        source: { file: meta.file || ctx.fileName || null, titleAsPrinted: meta.title || null, importedAt: ctx.now || null }, codePolicy: 'Kod SK/SP hanya seperti tertulis dalam RPT; calon sistem ditanda "derivation".', rows };
    } else {
      const weeks = new Map();
      recs.forEach(r => {
        const list = r.weeks && r.weeks.length ? r.weeks : (r.rptWeek != null ? [r.rptWeek] : []);
        if (!list.length) { if (r.kind !== 'cuti') auto(r, 'warn', 'Baris tanpa minggu tidak disimpan dalam format minggu.'); return; }
        list.forEach(n => {
          if (!weeks.has(n)) weeks.set(n, { rptWeek: n, term: null, lessons: [] });
          const bidangId = r.bidang ? bidangIdOf(r.bidang, r.bidangLegacy, ctx.bidang) : null;
          const l = { kind: r.kind || 'lesson' };
          if (bidangId) l.bidangId = bidangId;
          if (r.bidang) { l.bidang = r.bidang; if (jawi && r.bidangLegacy) l.bidangLegacy = r.bidangLegacy; }
          if (r.strand) l.strand = r.strand;
          l.topic = r.topic || (r.content || []).join(' ') || '';
          if (jawi && r.topicLegacy) l.topicLegacy = r.topicLegacy;
          if (r.theme) l.theme = r.theme;
          l.sk = r.sk.slice(); l.sp = r.sp.slice();
          if (r.skText) l.skText = r.skText; if (r.spText) l.spText = r.spText;
          if (jawi && r.skTextLegacy) l.skTextLegacy = r.skTextLegacy;
          if (jawi && r.spTextLegacy) l.spTextLegacy = r.spTextLegacy;
          if (r.content && r.content.length && r.topic) l.content = r.content.slice();
          l.note = r.note || null;
          weeks.get(n).lessons.push(l);
          if (r.bidang && !bidangId && ctx.bidang && ctx.bidang.length) auto(r, 'warn', `Bidang "${r.bidang}" tidak dipadankan dengan senarai bidang.`);
        });
      });
      const list = [...weeks.values()].sort((a, b) => a.rptWeek - b.rptWeek);
      // Penggal: ikut takwim (minggu sekolah) jika ada
      list.forEach(w => { const cw = (ctx.calendarWeeks || []).find(x => x.week === w.rptWeek); w.term = cw ? cw.term : null; if (w.term == null) delete w.term; });
      data = { schemaVersion: '1.0.0', type: 'rpt', id: `RPT-${subjectId || 'X'}-T${year || 0}-${ctx.yearId || 'IMPORT'}`, subjectId, year, academicYearId: ctx.yearId || meta.academicYearId || null,
        source: { file: meta.file || ctx.fileName || null, titleAsPrinted: meta.title || null, importedAt: ctx.now || null }, textPolicy: 'Teks SK/SP dalam RPH diambil dari DSKP ikut kod; teks RPT disimpan untuk rujukan.', weeks: list };
    }
    issues.push(...collectIssues(recs));
    if (!subjectId) issues.push({ level: 'error', msg: 'Subjek belum dipilih.', ref: null });
    if (!year) issues.push({ level: 'error', msg: 'Tahun (darjah) belum dipilih.', ref: null });
    const nums = uniq(recs.map(r => r.rptWeek).filter(x => x != null)).sort((a, b) => a - b);
    for (let i = 1; i < nums.length; i++) if (nums[i] - nums[i - 1] > 1) issues.push({ level: 'warn', msg: `Minggu RPT ${nums[i - 1] + 1}${nums[i] - nums[i - 1] > 2 ? `–${nums[i] - 1}` : ''} tiada dalam fail.`, ref: null });
    model.records = recs;
    return { data, issues, stats: { records: recs.length, weeks: nums.length, firstWeek: nums[0] || null, lastWeek: nums[nums.length - 1] || null, withCodes: recs.filter(r => r.sk.length || r.sp.length).length, shape } };
  }

  // =====================================================================================
  // L. SEJARAH RPH (contoh RPH lama)
  // =====================================================================================
  const HIST_LABELS = [
    ['date', [/^tarikh$|^hari\s*\/\s*tarikh$|^date$/i, 'التاريخ', 'هاري / تاريخ', 'هاري/تاريخ', 'تاريخ']],
    ['week', [/^minggu$/i, 'الأسبوع', 'ڤڠݢل / ميڠݢو', 'فغضل / ميغضو', 'ميغضو', 'ميڠݢو']],
    ['class', [/^kelas$/i, 'الفصل', 'كلس', 'كلاس']],
    ['time', [/^masa$|^waktu$/i, 'الوقت', 'ماس', 'ماسا']],
    ['topic', [/^tajuk$|^topik$/i, 'الموضوع', 'تاجوق', 'تاجوك']],
    ['theme', [/^tema$/i, 'المحاور', 'المحور', 'تيما']],
    ['subject', [/^mata pelajaran|^subjek$/i, 'المادة', 'مات ڤلاجرن', 'مات فلاجرن', 'مات فلاجرن/ بيدغ']],
  ];
  function history(doc, ctx = {}) {
    if (doc.json && doc.json.type === 'rph-history') return fromJson('history', doc.json, ctx);
    const tables = tablesOf(doc);
    const entries = [];
    const subjects = ctx.subjects || [];
    const subjKeys = subjects.map(s => ({ id: s.id, keys: [s.name && s.name.ms, s.name && s.name.ar, s.name && s.name.jawi, s.name && s.name.jawi && RPH.jawi && RPH.jawi.toLegacy ? RPH.jawi.toLegacy(s.name.jawi) : null].filter(Boolean).map(key).filter(k => k.length > 3) }));
    const guessSubj = txt => { const k = key(txt); const hit = subjKeys.find(s => s.keys.some(x => k.includes(x))); return hit ? hit.id : null; };
    for (const t of tables) {
      const flat = t.rows.flat().map(line).filter(Boolean);
      const all = uniq(flat).join('\n');
      if (all.length < 30) continue;
      const val = (role, test) => {
        for (const raw of t.rows) {
          const row = raw.map(line).filter((v, j, a) => j === 0 || v !== a[j - 1]);
          for (let i = 0; i < row.length; i++) {
          if (headerKeyOf(row[i], HIST_LABELS) !== role) continue;
          const near = uniq([row[i - 1], row[i + 1], row[i - 2], row[i + 2], row[i - 3], row[i + 3]].filter(v => v && !headerKeyOf(v, HIST_LABELS)));
          const ok = test ? near.filter(test) : near;
          if (ok.length) return role === 'week' ? String(Math.max(...ok.map(v => +line(digits(v))))) : ok[0];
          }
        }
        return '';
      };
      let date = parseDate(val('date', v => !!parseDate(v, ctx)), ctx);
      if (!date) { const m = all.match(/\b(\d{1,2}\s*[/.]\s*\d{1,2}\s*[/.]\s*\d{4})\b/); if (m) date = parseDate(m[1]); }
      const cls = splitCell(val('class') || (all.match(CLASS_RE) || [''])[0]);
      if (!date && !(cls && cls.className)) continue;
      const tm = parseTimeRange(val('time', v => !!parseTimeRange(v)));
      const times = tm ? normTimes(tm) : [null, null];
      // Kod hanya daripada baris berlabel Standard Kandungan / Standard Pembelajaran
      const codeRows = t.rows.filter(r => r.some(c => ['sk', 'sp'].includes(headerKeyOf(c, DSKP_ROLES))));
      const codes = extractCodes(uniq(codeRows.flatMap(r => r.filter(c => line(c) && !headerKeyOf(c, DSKP_ROLES)).map(c => clean(c).split('\n').map(l => (leadingCode(l).code || '')).join(' ')))).join(' '));
      const wk = line(digits(val('week', v => isInt(v) && +line(digits(v)) <= 53))).match(/\b(\d{1,2})\b/);
      const topicRaw = val('topic') || val('theme');
      const tx = doc.legacyJawi ? jawiFix(topicRaw) : { text: arText(topicRaw), unknown: [] };
      const e = { week: wk ? +wk[1] : null, date, class: cls && cls.className ? cls.className : null, classId: cls && cls.className ? classIdOf(cls.className) : null, year: cls ? cls.year : null,
        start: hm(times[0]) || null, end: hm(times[1]) || null, subjectId: guessSubj(all) || null, topic: tx.text, sk: codes.sk, sp: codes.sp, text: all.slice(0, 4000), source: doc.name || null, _ref: t.ref };
      if (!e.subjectId) flag(e, 'warn', 'Subjek tidak dikenal pasti.');
      if (!e.date) flag(e, 'warn', 'Tarikh tidak ditemui.');
      if (tx.unknown && tx.unknown.length) flag(e, 'warn', `Perkataan Jawi perlu semakan: ${tx.unknown.slice(0, 5).join('، ')}`);
      entries.push(e);
    }
    const model = { entries };
    const built = buildHistory(model, ctx);
    if (!entries.length) built.issues.unshift({ level: 'error', msg: 'Tiada RPH dikenal pasti (perlu jadual dengan tarikh dan kelas).', ref: null });
    return result('history', model, built, 'jadual');
  }
  function buildHistory(model, ctx = {}) {
    const entries = (model.entries || []).filter(e => e.date || e.class).map(e => {
      const o = { week: e.week != null && e.week !== '' ? +e.week : null, date: parseDate(e.date) || null, class: e.class || null, classId: e.classId || (e.class ? classIdOf(e.class) : null), year: e.year != null && e.year !== '' ? +e.year : null,
        start: e.start || null, end: e.end || null, subjectId: e.subjectId || null, topic: e.topic || '', sk: Array.isArray(e.sk) ? e.sk : extractCodes(e.sk).sk, sp: Array.isArray(e.sp) ? e.sp : extractCodes(e.sp).sp, status: e.status || 'diimport', source: e.source || ctx.fileName || null };
      if (e.text) o.text = e.text;
      return o;
    }).sort((a, b) => str(a.date).localeCompare(str(b.date)) || str(a.start).localeCompare(str(b.start)));
    const data = { schemaVersion: '1.0.0', type: 'rph-history', academicYearId: ctx.yearId || null, note: 'Contoh RPH lama diimport sebagai rujukan.', entries };
    return { data, issues: collectIssues(model.entries, 'RPH:'), stats: { entries: entries.length, withCodes: entries.filter(e => e.sk.length || e.sp.length).length } };
  }

  // =====================================================================================
  // M. PROFIL (cadangan sahaja)
  // =====================================================================================
  function profile(doc) {
    const text = str(doc.text);
    const out = [];
    const sm = text.match(/\b(SEKOLAH\s+(?:KEBANGSAAN|JENIS\s+KEBANGSAAN(?:\s*\([CT]\))?|RENDAH(?:\s+AGAMA)?|AGAMA)\s+[A-Z][A-Z .'’-]{2,50}?)(?=\s*(?:,|\n|TAHUN|$|\d))/);
    if (sm) out.push({ field: 'school.name', label: 'Nama sekolah', value: line(sm[1]), ref: 'teks fail' });
    const short = text.match(/\b(SK|SJKC|SJKT|SRA)\s+([A-Z][A-Za-z .'-]{2,40}?)(?=\s*(?:\n|,|$|\d))/);
    if (short) out.push({ field: 'school.shortName', label: 'Nama ringkas sekolah', value: line(`${short[1]} ${short[2]}`).replace(/\s+(SESI|TAHUN|KSSR|BIL|PETI)\b.*$/i, ''), ref: 'teks fail' });
    const em = text.match(/\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/i); if (em) out.push({ field: 'school.email', label: 'E-mel', value: em[1], ref: 'teks fail' });
    const ad = text.match(/(PETI SURAT[^\n]{4,60})/i); if (ad) out.push({ field: 'school.address', label: 'Alamat', value: line(ad[1]), ref: 'teks fail' });
    const tn = text.match(/(?:Disediakan\s+oleh|Nama\s+Guru)[\s\S]{0,120}?\(?\s*([A-Z][A-Za-z'’@.-]+(?:\s+[A-Z][A-Za-z'’@.-]+)*\s+(?:Binti|Bin|binti|bin|BINTI|BIN|A\/P|A\/L)\s+[A-Z][A-Za-z'’ .-]+?)\s*\)/);
    if (tn) out.push({ field: 'teacher.fullName', label: 'Nama penuh guru', value: line(tn[1]), ref: 'teks fail' });
    const gb = text.match(/\(\s*((?:Pn|Puan|En|Encik|Tn|Dr)\.?\s+[A-Z][A-Za-z'’ .-]+?)\s*\)\s*\n?\s*Guru Besar/i); if (gb) out.push({ field: 'school.headmaster', label: 'Guru Besar', value: line(gb[1]), ref: 'teks fail' });
    return { kind: 'profile', suggestions: out };
  }

  // =====================================================================================
  // M2. KALENDAR AKADEMIK KPM (Lampiran A/B: Kumpulan A dan B)
  // =====================================================================================
  const KPM_RANGE = /^(\d{2})\.(\d{2})\.(\d{4})\s*[-–—]\s*(\d{2})\.(\d{2})\.(\d{4})$/;
  const KPM_DATE = /^(\d{2})\.(\d{2})\.(\d{4})$/;
  const kpmIso = (d, m, y) => `${y}-${m}-${d}`;
  const weekdaysBetween = (a, b, startDow) => { let n = 0; for (let d = a; d <= b; d = addDays(d, 1)) { const w = dowOf(d); if (startDow === 0 ? w <= 4 : (w >= 1 && w <= 5)) n++; } return n; };

  /** Jadual kalendar akademik KPM → {group, terms, blocks, breaks, kpmWeeks}. Pilih kumpulan melalui ctx.group ('A'|'B'). */
  function calendarKpm(doc, ctx = {}) {
    const issues = [];
    const lines = str(doc.text).split(/\n/).map(l => line(l)).filter(Boolean);
    const groups = {};
    let g = null, pendingName = null, cur = null;
    const newBlock = () => ({ segments: [], statedDays: null });
    const open = k => { if (!groups[k]) groups[k] = { blocks: [], breaks: [], cur: newBlock() }; return groups[k]; };
    const nextInt = i => { const m = (lines[i + 1] || '').match(/^\d{1,3}$/); return m ? +m[0] : null; };
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      const gm = L.match(/^KUMPULAN\s*([AB])\b/i);
      if (gm) { g = gm[1].toUpperCase(); cur = open(g); pendingName = null; continue; }
      if (/^Lampiran\s+[A-Z]\b/i.test(L) && g) { if (!/^Lampiran\s+[AB]\b/i.test(L)) { g = null; cur = null; } continue; }
      if (!cur) continue;
      if (/^CUTI\s+(PENGGAL\s*\d|PERTENGAHAN\s+TAHUN|AKHIR\s+PERSEKOLAHAN)/i.test(L)) { pendingName = L.replace(/,\s*TAHUN\s*\d{4}\s*$/i, '').replace(/(PERTENGAHAN\s+TAHUN)\s*\d{4}\s*$/i, '$1').replace(/(AKHIR\s+PERSEKOLAHAN)\s+TAHUN\s*\d{4}\s*$/i, '$1').replace(/\s+/g, ' ').trim(); continue; }
      let m = L.match(KPM_RANGE);
      if (m) {
        if (cur.cur.segments.length) { cur.blocks.push(cur.cur); cur.cur = newBlock(); }
        cur.breaks.push({ name: pendingName || 'Cuti', start: kpmIso(m[1], m[2], m[3]), end: kpmIso(m[4], m[5], m[6]), days: nextInt(i) });
        pendingName = null; continue;
      }
      m = L.match(KPM_DATE);
      if (m && KPM_DATE.test(lines[i + 1] || '')) {
        const m2 = lines[i + 1].match(KPM_DATE);
        cur.cur.segments.push({ start: kpmIso(m[1], m[2], m[3]), end: kpmIso(m2[1], m2[2], m2[3]), days: nextInt(i + 1) });
        i += 1; continue;
      }
      if (/^JUMLAH\s+HARI$/i.test(L)) { const n = nextInt(i); if (cur.cur.segments.length) { cur.cur.statedDays = n; cur.blocks.push(cur.cur); cur.cur = newBlock(); } continue; }
    }
    for (const k of Object.keys(groups)) if (groups[k].cur.segments.length) { groups[k].blocks.push(groups[k].cur); groups[k].cur = newBlock(); }

    const keys = Object.keys(groups).filter(k => groups[k].blocks.length);
    if (!keys.length) {
      issues.push({ level: 'error', msg: doc.scanned ? 'Fail ini imej/imbasan tanpa lapisan teks. Kalendar akademik KPM tidak dapat dibaca.' : 'Jadual Kumpulan A/B (Lampiran A/B Kalendar Akademik KPM) tidak dijumpai dalam fail ini.', ref: doc.name });
      return { kind: 'calendar-kpm', data: null, model: { groups: {} }, issues, stats: { groups: 0 }, method: 'tiada' };
    }
    let group = String(ctx.group || (ctx.school && ctx.school.calendarGroup) || ctx.calendarGroup || '').toUpperCase();
    if (!groups[group]) {
      if (group) issues.push({ level: 'warn', msg: `Kumpulan ${group} tiada dalam fail; Kumpulan ${keys[0]} digunakan — sila sahkan.`, ref: doc.name });
      else issues.push({ level: 'warn', msg: `Kumpulan sekolah (A/B) belum ditetapkan; Kumpulan ${keys.includes('B') ? 'B' : keys[0]} digunakan — sila sahkan (A: Kedah, Kelantan, Terengganu; B: negeri lain).`, ref: doc.name });
      group = keys.includes('B') ? 'B' : keys[0];
    }
    const build = k => {
      const G = groups[k];
      const firstStart = G.blocks[0].segments[0].start;
      const weekStartDow = dowOf(firstStart) === 0 ? 0 : 1; // Kumpulan A: Ahad–Khamis
      const blocks = []; let kpmWeek = 0; const kpmWeeks = [];
      G.blocks.forEach((b, bi) => {
        const start = b.segments[0].start, end = b.segments[b.segments.length - 1].end;
        const days = b.segments.reduce((a, s) => a + (s.days || 0), 0);
        const ws = weekStartDow === 0 ? addDays(start, -dowOf(start)) : mondayOf(start);
        const wk = [];
        for (let d = ws; d <= end; d = addDays(d, 7)) wk.push(d);
        if (b.statedDays != null && b.statedDays !== days) issues.push({ level: 'warn', msg: `Kumpulan ${k}, blok ${bi + 1}: jumlah hari tercetak ${b.statedDays} ≠ hasil tambah ${days}.`, ref: `${start}…${end}` });
        const wdays = weekdaysBetween(start, end, weekStartDow);
        if (days > wdays) issues.push({ level: 'warn', msg: `Kumpulan ${k}, blok ${bi + 1}: ${days} hari melebihi ${wdays} hari bekerja dalam julat.`, ref: `${start}…${end}` });
        const brAfter = G.breaks[bi] || null;
        const penggal = bi < 3 ? 1 : 2; // lajur PENGGAL KPM: Penggal 1 = blok 1–3, Penggal 2 = blok 4
        wk.forEach(w => { kpmWeek++; kpmWeeks.push({ kpmWeek, start: w, end: addDays(w, 4), term: penggal, block: bi + 1 }); });
        blocks.push({ block: bi + 1, term: penggal, start, end, days, weeks: wk.length, statedDays: b.statedDays, after: brAfter && brAfter.name });
      });
      const terms = [1, 2].map(t => { const bs = blocks.filter(b => b.term === t); return bs.length ? { term: t, start: bs[0].start, end: bs[bs.length - 1].end, days: bs.reduce((a, b) => a + b.days, 0), weeks: bs.reduce((a, b) => a + b.weeks, 0) } : null; }).filter(Boolean);
      return { group: k, terms, blocks, breaks: G.breaks.map(b => ({ name: b.name, start: b.start, end: b.end, days: b.days })), kpmWeeks, weekStartDow };
    };
    const data = build(group);
    const model = { groups: Object.fromEntries(keys.map(k => [k, k === group ? data : build(k)])), selected: group };
    const stats = { group, blocks: data.blocks.length, weeks: data.kpmWeeks.length, days: data.blocks.reduce((a, b) => a + b.days, 0), breaks: data.breaks.length, groups: keys.length };
    return { kind: 'calendar-kpm', data, model, issues, stats, method: 'teks' };
  }

  /** Bina objek takwim asas (format koleksi `calendar`) daripada data KPM — hari Isnin–Jumaat (Ahad–Khamis bagi Kumpulan A) dalam blok persekolahan.
      Cuti perayaan Lampiran C tidak dimasukkan (guru tandakan). Nombor minggu = minggu KPM berturutan. */
  function calendarFromKpm(kpm, ctx = {}) {
    if (!kpm || !(kpm.kpmWeeks || []).length) return null;
    const first = kpm.blocks && kpm.blocks[0] ? kpm.blocks[0].start : kpm.kpmWeeks[0].start;
    const last = kpm.blocks && kpm.blocks.length ? kpm.blocks[kpm.blocks.length - 1].end : kpm.kpmWeeks[kpm.kpmWeeks.length - 1].end;
    const DN = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
    const midBreak = (kpm.breaks || []).find(b => /PERTENGAHAN\s+TAHUN/i.test(b.name));
    const termOf = d => (midBreak && d > midBreak.end ? 2 : 1);
    const inBlock = d => (kpm.blocks || []).some(b => d >= b.start && d <= b.end);
    const wsd = kpm.weekStartDow === 0 ? [0, 1, 2, 3, 4] : [1, 2, 3, 4, 5];
    const yearStart = `${first.slice(0, 4)}-01-01`, yearEnd = `${last.slice(0, 4)}-12-31`;
    const weeks = (kpm.kpmWeeks || []).map((w, i) => ({ week: i + 1, start: w.start, end: w.end, term: termOf(w.start), kpmWeek: w.kpmWeek, schoolDays: 0 }));
    const days = [];
    for (let d = yearStart; d <= yearEnd; d = addDays(d, 1)) {
      const dow = dowOf(d);
      const wk = weeks.find(w => d >= w.start && d <= addDays(w.start, 6));
      const school = inBlock(d) && wsd.includes(dow) && !!wk;
      const br = (kpm.breaks || []).find(b => d >= b.start && d <= b.end);
      if (school && wk) wk.schoolDays++;
      days.push({ date: d, dow, dayName: DN[dow], week: school ? wk.week : null, schoolDay: school, holiday: br ? br.name : null, events: [] });
    }
    return {
      schemaVersion: '1.0.0', type: 'calendar', academicYearId: ctx.yearId || first.slice(0, 4), group: kpm.group, workweek: wsd,
      session: { start: first, end: last }, source: { file: 'Kalendar Akademik KPM', derivedFrom: 'calendar.kpm' }, weeks: weeks.filter(w => w.schoolDays > 0),
      breaks: (kpm.breaks || []).map(b => ({ name: b.name, start: b.start, end: b.end })), days, kpm,
    };
  }

  // =====================================================================================
  // N. KLASIFIKASI FAIL
  // =====================================================================================
  const SUBJECT_HINTS = [['BA', /BAHASA\s*ARAB|اللغة\s*العربية|\bB\.?\s?ARAB\b/i], ['PI', /PENDIDIKAN\s*(AGAMA\s*)?ISLAM|ڤنديديقن\s*اسلام|فنديديقن\s*إسلام|فنديديقن\s*اسلام|\bPAI\b/i], ['BM', /BAHASA\s*MELAYU|\bBM\b/i], ['BI', /BAHASA\s*INGGERIS|ENGLISH/i], ['MT', /MATEMATIK/i], ['SN', /\bSAINS\b/i]];
  function classify(doc, ctx = {}) {
    const name = str(doc.name);
    const head = `${name}\n${str(doc.text).slice(0, 6000)}`;
    const reasons = [];
    let kind = null, confidence = 0;
    const tk = templateKind(doc);
    if (tk) { kind = tk; confidence = 1; reasons.push('templat Excel Smart RPH'); }
    const j = doc.json;
    if (!kind && j && typeof j === 'object') {
      const map = { calendar: 'calendar', timetable: 'timetable', classes: 'classes', curriculum: 'curriculum', rpt: 'rpt', 'rph-history': 'history', template: 'template', 'rph-backup': 'backup', 'rph-private-pack': 'backup', 'rph-year-archive': 'backup', 'rph-pakej-guru': 'backup' };
      if (map[j.type]) { kind = map[j.type]; confidence = 0.95; reasons.push(`JSON type "${j.type}"`); }
    }
    const kpmCal = /KALENDAR\s*AKADEMIK/i.test(name) && /KPM|KEMENTERIAN/i.test(name) || (/KALENDAR\s*AKADEMIK\s*(TAHUN|SESI)?\s*\d{0,4}/i.test(head) && /KUMPULAN\s*[AB]\b/i.test(head) && /JUMLAH\s*HARI/i.test(head) && /Lampiran\s*A/i.test(head));
    if (!kind && kpmCal) { kind = 'calendar-kpm'; confidence = 0.9; reasons.push('Kalendar Akademik KPM (Kumpulan A/B)'); }
    const rules = [
      ['calendar', /TAKWIM|KALENDAR\s*(AKADEMIK|PERSEKOLAHAN|SEKOLAH)/i, 0.9], ['timetable', /JADUAL\s*WAKTU|TIME\s*TABLE|TIMETABLE/i, 0.85],
      ['curriculum', /\bDSKP\b|DOKUMEN\s*STANDARD\s*KURIKULUM/i, 0.9], ['rpt', /\bRPT\b|RANCANGAN\s*(PENGAJARAN|PELAJARAN)\s*TAHUNAN|خطة\s*الدرس\s*السنوي/i, 0.9],
      ['history', /\bRPH\b|RANCANGAN\s*(PENGAJARAN|PEMBELAJARAN)\s*(DAN\s*PEMBELAJARAN\s*)?HARIAN|MINGGU\s*\d{1,2}\b|خطة\s*التدريس\s*اليومية/i, 0.7],
      ['classes', /BILANGAN\s*MURID|SENARAI\s*KELAS|ENROLMEN/i, 0.7],
    ];
    if (!kind) for (const [k, re, c] of rules) { if (re.test(name)) { kind = k; confidence = c; reasons.push(`nama fail sepadan "${re.source.split('|')[0].replace(/\\[bs]\*?/g, ' ').trim()}"`); break; } }
    if (!kind) for (const [k, re, c] of rules) { if (re.test(head)) { kind = k; confidence = c - 0.15; reasons.push('kandungan fail'); break; } }
    if (!kind) {
      if (/معيار\s*المحتوى|معيار\s*التعلم|STANDARD\s*KANDUNGAN|ستندرد\s*كاندو/i.test(head)) { kind = 'curriculum'; confidence = 0.6; reasons.push('jadual Standard Kandungan'); }
      else if (doc.kind === 'image') { kind = 'timetable'; confidence = 0.3; reasons.push('gambar (lazimnya jadual waktu) — sahkan'); }
      else if (/\b(ISNIN|SELASA|RABU|KHAMIS|JUMAAT)\b/i.test(head) && /\d{1,2}[:.]\d{2}/.test(head)) { kind = 'timetable'; confidence = 0.5; reasons.push('hari + masa dalam kandungan'); }
    }
    if (kind === 'history' && /\bRPT\b/i.test(name)) kind = 'rpt';
    let subjectId = null;
    for (const [id, re] of SUBJECT_HINTS) if (re.test(head)) { subjectId = id; break; }
    if (subjectId && ctx.subjects && !ctx.subjects.some(s => s.id === subjectId)) { const alt = matchSubject(subjectId, ctx.subjects); subjectId = alt || subjectId; }
    const ym = name.match(/\bTAHUN\s*(\d)\b/i) || name.match(/\bT(\d)\b/) || head.match(/\bTAHUN\s*(\d)\b/i) || head.match(/YEAR\s*(\d)\b/i) || (/الصف الثالث/.test(head) ? [0, '3'] : null);
    const year = ym && ['curriculum', 'rpt', 'history', null].includes(kind) ? +ym[1] : null;
    return { kind, subjectId, year, confidence: Math.max(0, Math.min(1, confidence)), reasons };
  }

  // =====================================================================================
  // O. TEMPLAT EXCEL
  // =====================================================================================
  const TEMPLATES = {
    calendar: {
      label: 'Takwim', file: 'Templat_Takwim.xlsx',
      guide: [
        '1. Helaian "Minggu": satu baris bagi setiap minggu persekolahan bernombor (Isnin–Jumaat). Minggu cuti panjang tidak perlu diberi nombor.',
        '2. Helaian "Cuti_Acara": satu baris bagi setiap cuti (umum, peristiwa, penggal) atau acara sekolah. Cuti panjang: isi tarikh mula dan tarikh akhir.',
        '3. Tarikh: DD/MM/YYYY (cth. 12/01/2026) atau sel tarikh Excel.',
        '4. Jenis: cuti | cuti-peristiwa | acara | peperiksaan | sabtu-ganti (Sabtu yang menjadi hari persekolahan).',
        '5. Kategori (pilihan): pentadbiran | kurikulum | hem | kokurikulum | peperiksaan | umum.',
        '6. Penggal: 1 atau 2. Minggu KPM (pilihan) untuk padanan minggu RPT ikut tarikh KPM.',
      ],
      sheets: [
        { name: 'Minggu', header: ['Minggu', 'Tarikh mula', 'Tarikh akhir', 'Penggal', 'Minggu KPM (pilihan)', 'Catatan'], example: [1, '12/01/2026', '16/01/2026', 1, 1, 'CONTOH — padam baris ini'], widths: [9, 13, 13, 9, 18, 26] },
        { name: 'Cuti_Acara', header: ['Tarikh mula', 'Tarikh akhir', 'Jenis', 'Kategori', 'Tajuk', 'Catatan'], example: ['16/02/2026', '20/02/2026', 'cuti', 'umum', 'Cuti Tahun Baru Cina', 'CONTOH — padam baris ini'], widths: [13, 13, 15, 14, 44, 26] },
      ],
    },
    timetable: {
      label: 'Jadual Waktu', file: 'Templat_Jadual_Waktu.xlsx',
      guide: [
        '1. Helaian "Versi": nombor versi (cth. 4.1), label dan tarikh berkuat kuasa (DD/MM/YYYY).',
        '2. Helaian "Slot": satu baris bagi setiap slot mengajar. Slot dua waktu (60 minit) = satu baris.',
        '3. Hari: Isnin | Selasa | Rabu | Khamis | Jumaat. Masa: 24 jam (cth. 13:40) atau 1:40 (jam 1–6 dibaca sebagai petang).',
        '4. Subjek: label seperti dalam jadual (cth. BA, PAI, PAI/QRN, TAS) — dipadankan dengan senarai Subjek semasa import.',
        '5. Kelas: cth. 3 UKM. Tahun: 1–6 (pilihan jika nama kelas bermula dengan tahun).',
        '6. Jenis: PdP | bukan PdP (cth. perhimpunan) | tidak tersedia. Guru bersama: pisahkan dengan koma.',
      ],
      sheets: [
        { name: 'Versi', header: ['Nombor versi', 'Label', 'Berkuat kuasa mulai', 'Tamat (pilihan)', 'Catatan'], example: ['4.1', 'Jadual Waktu Bil 4.1 2026', '07/09/2026', '', 'CONTOH — tukar kepada maklumat sebenar'], widths: [14, 32, 20, 16, 34] },
        { name: 'Slot', header: ['Hari', 'Mula', 'Tamat', 'Subjek', 'Kelas', 'Tahun', 'Jenis', 'Guru bersama', 'Catatan'], example: ['Isnin', '12:40', '13:40', 'PAI', '2 UKM', 2, 'PdP', '', 'CONTOH — padam baris ini'], widths: [10, 8, 8, 12, 10, 7, 12, 22, 26] },
      ],
    },
    classes: {
      label: 'Kelas & Bilangan Murid', file: 'Templat_Kelas_Bilangan_Murid.xlsx',
      guide: [
        '1. Helaian "Kelas": satu baris bagi setiap kelas yang anda ajar (cth. 3 UKM, Tahun 3). Bilangan murid kelas (pilihan) digunakan dalam refleksi.',
        '2. Helaian "Bilangan_Murid" (pilihan): bilangan murid ikut subjek dan tahun, cth. BA, 3, 30. Diguna jika kelas tiada bilangan sendiri.',
        '3. ID kelas (pilihan) dijana daripada nama jika kosong (3 UKM → 3UKM).',
      ],
      sheets: [
        { name: 'Kelas', header: ['Nama kelas', 'ID (pilihan)', 'Tahun', 'Bilangan murid', 'Catatan'], example: ['3 UKM', '3UKM', 3, 30, 'CONTOH — padam baris ini'], widths: [14, 12, 8, 15, 26] },
        { name: 'Bilangan_Murid', header: ['Subjek', 'Tahun', 'Bilangan murid', 'Catatan'], example: ['BA', 3, 30, 'CONTOH — padam baris ini'], widths: [12, 8, 15, 26] },
      ],
    },
    curriculum: {
      label: 'DSKP', file: 'Templat_DSKP.xlsx',
      guide: [
        '1. Satu fail untuk SATU subjek dan SATU tahun. Pilih subjek dan tahun semasa import.',
        '2. Satu baris bagi setiap Standard Pembelajaran (SP). Lajur bidang dan SK boleh diulang atau dibiarkan kosong pada baris seterusnya (dibawa dari atas).',
        '3. Kod SK: N.n (cth. 1.1). Kod SP: N.n.n (cth. 1.1.1). Salin teks TEPAT seperti dicetak dalam DSKP — jangan betulkan ejaan.',
        '4. TP1–TP6 (pilihan): tahap penguasaan bagi SK (isi pada baris pertama SK itu).',
        '5. Halaman PDF / bercetak (pilihan) untuk rujukan sumber.',
        '6. Jawi: guna Jawi Unicode (ڤ ݢ ڠ چ ڽ ۏ). Teks fon lama (ف/ض/غ/خ/ث) ditukar semasa import dan perkataan tidak dikenali ditanda.',
        'Nota hak cipta: DSKP ialah bahan KPM. Simpan fail ini untuk kegunaan sendiri sahaja.',
      ],
      sheets: [
        { name: 'DSKP', header: ['Bidang kod', 'Bidang nama', 'SK kod', 'SK teks', 'SP kod', 'SP teks', 'Halaman PDF', 'Halaman bercetak', 'TP1', 'TP2', 'TP3', 'TP4', 'TP5', 'TP6', 'Catatan'],
          example: ['1', 'Kemahiran Mendengar dan Bertutur', '1.1', 'Teks SK seperti dicetak', '1.1.1', 'Teks SP seperti dicetak', 29, 17, '', '', '', '', '', '', 'CONTOH — padam baris ini'], widths: [10, 30, 8, 46, 8, 46, 11, 15, 20, 20, 20, 20, 20, 20, 26] },
      ],
    },
    rpt: {
      label: 'RPT', file: 'Templat_RPT.xlsx',
      guide: [
        '1. Satu fail untuk SATU subjek dan SATU tahun. Pilih subjek dan tahun semasa import.',
        '2. Satu baris bagi setiap pelajaran. Minggu yang ada beberapa pelajaran (cth. PI: Al-Quran, Akidah, Jawi) = beberapa baris dengan nombor minggu sama.',
        '3. SK / SP: tulis kod seperti dalam RPT, dipisahkan koma (cth. 1.1.1, 1.1.2). Biarkan kosong jika RPT tiada kod — sistem TIDAK mereka kod.',
        '4. Jenis: pelajaran | khatam | program | cuti | ulangkaji | peperiksaan.',
        '5. Baris cuti tanpa nombor minggu dibenarkan (biarkan Minggu kosong).',
      ],
      sheets: [
        { name: 'RPT', header: ['Minggu', 'Tarikh', 'Tema/Unit', 'Bidang', 'Tajuk', 'Kandungan', 'SK', 'SP', 'Teks SK', 'Teks SP', 'Jenis', 'Catatan'],
          example: [1, '12-16 JAN', 'Tema 1', 'Bidang 1', 'Tajuk pelajaran', 'Kandungan / aktiviti', '1.1', '1.1.1, 1.1.2', '', '', 'pelajaran', 'CONTOH — padam baris ini'], widths: [8, 13, 18, 16, 30, 40, 9, 16, 30, 30, 12, 26] },
      ],
    },
  };
  /** Bina workbook XLSX (perlu global XLSX — SheetJS). */
  function templateWorkbook(kind) {
    const X = (typeof XLSX !== 'undefined' && XLSX) || (typeof window !== 'undefined' && window.XLSX);
    if (!X) throw new Error('Pustaka Excel (SheetJS) tidak dimuatkan.');
    const t = TEMPLATES[kind]; if (!t) throw new Error(`Templat "${kind}" tiada.`);
    const wb = X.utils.book_new();
    const guide = [[`${TEMPLATE_MARK} — ${t.label.toUpperCase()}`], [''], ['Cara mengisi:'], ...t.guide.map(g => [g]), [''],
      ['Baris bertanda CONTOH diabaikan semasa import — padam atau tulis ganti.'], ['Simpan sebagai .xlsx, kemudian buka Smart RPH → Import Data dan pilih fail ini.'], [''], [`Kod templat: rph-template:${kind} v${VERSION}`]];
    const ws0 = X.utils.aoa_to_sheet(guide); ws0['!cols'] = [{ wch: 110 }];
    X.utils.book_append_sheet(wb, ws0, 'Panduan');
    for (const s of t.sheets) {
      const ws = X.utils.aoa_to_sheet([s.header, s.example]);
      ws['!cols'] = (s.widths || []).map(w => ({ wch: w }));
      X.utils.book_append_sheet(wb, ws, s.name);
    }
    wb.Props = { Title: `Templat Import Smart RPH: ${t.label}`, Subject: `rph-template:${kind}` };
    return wb;
  }
  function templateArray(kind) {
    const X = (typeof XLSX !== 'undefined' && XLSX) || (typeof window !== 'undefined' && window.XLSX);
    return X.write(templateWorkbook(kind), { type: 'array', bookType: 'xlsx' });
  }

  // =====================================================================================
  // P. AI (Google Gemini melalui RPH.ai.extract) — skema output + penukaran ke model
  // =====================================================================================
  const S = (type, extra) => Object.assign({ type }, extra || {});
  const RULES = 'STRICT RULES: Copy text EXACTLY as printed (same spelling, same script, keep Arabic/Jawi letters and diacritics as printed). Never invent, guess, translate, summarise or correct anything. Never invent SK/SP codes, dates, times or numbers that are not visibly printed. If something is unreadable or uncertain, use null and set "uncertain": true. Jawi must be written with standard Unicode letters (ڤ ݢ ڠ چ ڽ ۏ). Output only data that appears in the document.';
  const AI_SPECS = {
    calendar: () => ({ task: 'takwim', instructions: `Extract the school calendar (takwim). List every NUMBERED school week (MINGGU) with its Monday start date and Friday end date, and every holiday (cuti) and school event with dates. Dates as YYYY-MM-DD. kind: cuti | cuti-peristiwa | acara | peperiksaan | sabtu-ganti. category: pentadbiran | kurikulum | hem | kokurikulum | umum. ${RULES}`,
      schema: S('object', { properties: { year: S('integer', { nullable: true }), weeks: S('array', { items: S('object', { properties: { week: S('integer'), start: S('string'), end: S('string', { nullable: true }), term: S('integer', { nullable: true }), uncertain: S('boolean', { nullable: true }) }, required: ['week', 'start'] }) }),
        entries: S('array', { items: S('object', { properties: { start: S('string'), end: S('string', { nullable: true }), kind: S('string'), category: S('string', { nullable: true }), title: S('string'), uncertain: S('boolean', { nullable: true }) }, required: ['start', 'title'] }) }) }, required: ['weeks', 'entries'] }) }),
    timetable: () => ({ task: 'jadual-waktu', instructions: `Extract the teacher's timetable grid. For every filled cell give day (Isnin/Selasa/Rabu/Khamis/Jumaat), start and end time in 24-hour HH:MM (afternoon session: 1:10 means 13:10), the subject label exactly as printed (e.g. BA, PAI, PAI/QRN, TAS, PH) and the class exactly as printed (e.g. 3 UKM). A cell spanning several periods is ONE slot. Ignore the REHAT column. Also give the version number (e.g. 4.1) and effective date if printed. ${RULES}`,
      schema: S('object', { properties: { version: S('string', { nullable: true }), effectiveFrom: S('string', { nullable: true }), slots: S('array', { items: S('object', { properties: { day: S('string'), start: S('string'), end: S('string'), label: S('string'), className: S('string', { nullable: true }), coTeachers: S('array', { items: S('string') }), uncertain: S('boolean', { nullable: true }) }, required: ['day', 'start', 'end', 'label'] }) }) }, required: ['slots'] }) }),
    classes: () => ({ task: 'kelas', instructions: `Extract the list of classes (e.g. 3 UKM) with year (1-6) and number of pupils if printed. ${RULES}`,
      schema: S('object', { properties: { classes: S('array', { items: S('object', { properties: { name: S('string'), year: S('integer', { nullable: true }), enrolment: S('integer', { nullable: true }) }, required: ['name'] }) }) }, required: ['classes'] }) }),
    curriculum: ctx => ({ task: 'dskp', instructions: `Extract the DSKP standards table${ctx && ctx.subjectName ? ` for ${ctx.subjectName}` : ''}${ctx && ctx.subjectYear ? ` Year ${ctx.subjectYear}` : ''}. For each domain (bidang) give its code and name. For each Content Standard (SK, code N.n) and Learning Standard (SP, code N.n.n) give the code exactly as printed and the full text exactly as printed (join wrapped lines with a single space). Codes printed with Arabic-Indic digits must be written with 0-9. Give the PDF page number where it appears. If a code is not printed, set code null and uncertain true — do NOT number items yourself. ${RULES}`,
      schema: S('object', { properties: { domains: S('array', { items: S('object', { properties: { code: S('string'), name: S('string', { nullable: true }), nameMs: S('string', { nullable: true }) }, required: ['code'] }) }),
        items: S('array', { items: S('object', { properties: { level: S('string', { enum: ['SK', 'SP'] }), code: S('string', { nullable: true }), text: S('string'), page: S('integer', { nullable: true }), uncertain: S('boolean', { nullable: true }) }, required: ['level', 'text'] }) }) }, required: ['items'] }) }),
    rpt: () => ({ task: 'rpt', instructions: `Extract the yearly lesson plan (RPT) table row by row. For each row give the week number (MINGGU) as printed, dates as printed, theme/unit, bidang, topic, lesson content lines, SK codes and SP codes ONLY if printed in the row, and notes. Rows that span all columns (holidays/programmes) are one row with kind cuti/program/peperiksaan. ${RULES}`,
      schema: S('object', { properties: { rows: S('array', { items: S('object', { properties: { week: S('integer', { nullable: true }), dates: S('string', { nullable: true }), theme: S('string', { nullable: true }), unit: S('string', { nullable: true }), bidang: S('string', { nullable: true }), topic: S('string', { nullable: true }), content: S('array', { items: S('string') }), sk: S('array', { items: S('string') }), sp: S('array', { items: S('string') }), note: S('string', { nullable: true }), kind: S('string', { nullable: true }), uncertain: S('boolean', { nullable: true }) } }) }) }, required: ['rows'] }) }),
  };
  function aiSpec(kind, ctx = {}) { const f = AI_SPECS[kind]; if (!f) throw new Error(`AI tidak disokong untuk "${kind}".`); return f(ctx); }
  /** Output AI → model (setiap baris ditanda "Dijana AI — semak") → result. */
  function fromAi(kind, obj, ctx = {}) {
    const AI = row => flag(row, 'warn', obj && row.uncertain ? 'AI menandakan tidak pasti — semak dengan dokumen asal.' : 'Dijana AI — semak dengan dokumen asal.');
    obj = obj || {};
    if (kind === 'calendar') {
      const weeks = (obj.weeks || []).map(w => AI({ week: +w.week || null, start: parseDate(w.start) || null, end: parseDate(w.end) || null, term: w.term != null ? +w.term : null, kpmWeek: null, note: null, uncertain: w.uncertain, _ref: 'AI' }));
      const entries = (obj.entries || []).map(e => AI({ start: parseDate(e.start) || null, end: parseDate(e.end) || parseDate(e.start) || null, kind: CAL_KINDS.includes(e.kind) ? e.kind : eventKind(e.title || ''), category: CAL_CATS.includes(e.category) ? e.category : 'umum', title: evTitle(e.title || ''), note: null, uncertain: e.uncertain, _ref: 'AI' }));
      const model = { year: obj.year || ctx.year, weeks, entries, stated: {}, meta: { method: 'ai' } };
      inferTerms(model.weeks, model.entries);
      return result('calendar', model, buildCalendar(model, ctx), 'ai');
    }
    if (kind === 'timetable') {
      const slots = (obj.slots || []).map(s => { const tt = normTimes([parseTime(s.start), parseTime(s.end)]); const sp = splitCell(s.className || ''); return AI({ day: dayOf(s.day), start: hm(tt[0]), end: hm(tt[1]), label: line(s.label), className: sp && sp.className ? sp.className : (line(s.className) || null), year: sp ? sp.year : null, kind: s.className ? 'PdP' : (NON_PDP.test(compact(s.label)) ? 'non-PdP' : 'PdP'), subjectId: null, coTeachers: s.coTeachers || [], note: null, uncertain: s.uncertain, _ref: 'AI' }); });
      const model = { version: { id: line(obj.version) || '', label: obj.version ? `Jadual Waktu Bil ${line(obj.version)}` : '', effectiveFrom: parseDate(obj.effectiveFrom) || '', effectiveTo: '' }, periodGrid: (ctx.periodGrid || []).slice(), slots: resolveSlots(slots, ctx) };
      return result('timetable', model, buildTimetable(model, ctx), 'ai');
    }
    if (kind === 'classes') {
      const model = { classes: (obj.classes || []).map(c => { const sp = splitCell(c.name); return AI({ name: sp && sp.className ? sp.className : line(c.name), id: classIdOf(sp && sp.className ? sp.className : c.name), year: c.year || (sp && sp.year) || null, enrolment: c.enrolment || null, note: null, _ref: 'AI' }); }), counts: [] };
      return result('classes', model, buildClasses(model, ctx), 'ai');
    }
    if (kind === 'curriculum') {
      const jawi = ctx.script === 'jawi';
      const T = s => { if (!jawi) return { text: arText(s), legacy: undefined }; const fx = RPH.jawi && RPH.jawi.legacyWords && RPH.jawi.legacyWords(s).length ? jawiFix(s) : { text: arText(s) }; return fx; };
      const rows = [];
      (obj.domains || []).forEach(d => rows.push(AI({ level: 'bidang', code: line(digits(d.code)), text: isAr(d.name) ? arText(d.name) : '', textMs: d.nameMs || (!isAr(d.name) ? line(d.name) : ''), page: null, notes: [], _ref: 'AI' })));
      (obj.items || []).forEach(it => { const tx = T(it.text || ''); const r = AI({ level: it.level === 'SK' ? 'SK' : 'SP', code: it.code ? line(digits(it.code)) : '', text: tx.text, textLegacy: tx.legacy, page: it.page ? { pdf: +it.page, printed: null } : null, notes: [], uncertain: it.uncertain, _ref: it.page ? `AI · hlm ${it.page}` : 'AI' }); if (!it.code) flag(r, 'error', 'Kod tidak dibaca oleh AI — isi berpandukan dokumen.'); rows.push(r); });
      const model = { meta: { subjectId: ctx.subjectId || null, year: ctx.subjectYear || null, script: ctx.script || null, title: ctx.fileName || null, file: ctx.fileName || null, method: 'ai' }, rows };
      return result('curriculum', model, buildCurriculum(model, ctx), 'ai');
    }
    if (kind === 'rpt') {
      const jawi = ctx.script === 'jawi';
      const T = s => (jawi && s ? jawiFix(s) : { text: arText(s || ''), legacy: undefined });
      const recs = (obj.rows || []).map(r => { const top = T(r.topic); const bid = T(r.bidang); const rec = AI({ rptWeek: r.week != null ? +r.week : null, weeks: r.week != null ? [+r.week] : [], weekText: r.week != null ? String(r.week) : '', dates: line(r.dates), theme: line(r.theme), unit: line(r.unit), bidang: bid.text, bidangLegacy: jawi ? bid.legacy : undefined, strand: '', topic: top.text, topicLegacy: jawi ? top.legacy : undefined, content: (r.content || []).map(x => arText(x)).filter(Boolean), sk: (r.sk || []).flatMap(c => extractCodes(c).sk), sp: (r.sp || []).flatMap(c => extractCodes(c).sp), skText: '', spText: '', note: line(r.note), kind: RPT_KINDS.includes(r.kind) ? r.kind : (kindFromText(`${r.topic || ''} ${(r.content || []).join(' ')}`) || 'lesson'), uncertain: r.uncertain, _ref: 'AI' }); return rec; });
      const model = { meta: { subjectId: ctx.subjectId || null, year: ctx.subjectYear || null, academicYearId: ctx.yearId || null, file: ctx.fileName || null, title: ctx.fileName || null, shape: ctx.shape || null, script: ctx.script }, mapping: {}, records: recs };
      return result('rpt', model, buildRpt(model, ctx), 'ai');
    }
    throw new Error(`AI tidak disokong untuk "${kind}".`);
  }

  // =====================================================================================
  // Q. JSON sedia ada (format aplikasi) → model
  // =====================================================================================
  function fromJson(kind, j, ctx = {}) {
    if (kind === 'calendar') {
      const entries = [];
      (j.days || []).forEach(d => { if (d.holiday) entries.push({ start: d.date, end: d.date, kind: /peristiwa/i.test(d.holiday) ? 'cuti-peristiwa' : 'cuti', category: 'umum', title: d.holiday, note: null, _ref: d.date }); (d.events || []).forEach(e => entries.push({ start: d.date, end: d.date, kind: e.kind || 'acara', category: e.category || 'umum', title: e.title, note: null, _ref: d.date })); });
      const merged = [];
      entries.forEach(e => { const p = merged.find(x => x.title === e.title && x.kind === e.kind && x.category === e.category && addDays(x.end, 1) === e.start); if (p) p.end = e.end; else merged.push(e); });
      const model = { year: +(j.session && j.session.start ? j.session.start.slice(0, 4) : ctx.year), weeks: (j.weeks || []).map(w => ({ week: w.week, start: w.start, end: w.end, term: w.term, kpmWeek: w.kpmWeek ?? null, note: null, _ref: `minggu ${w.week}` })), entries: merged, stated: Object.fromEntries((j.monthlySchoolDays || []).filter(m => m.stated != null).map(m => [m.month, m.stated])), meta: { method: 'json', school: j.school } };
      return result('calendar', model, buildCalendar(model, ctx), 'json');
    }
    if (kind === 'timetable') {
      const v = (j.versions || [])[0] || {};
      const model = { version: { id: v.id || '', label: v.label || '', effectiveFrom: v.effectiveFrom || '', effectiveTo: v.effectiveTo || '' }, periodGrid: j.periodGrid || [], slots: (v.slots || []).map(s => ({ ...s, _ref: s.id })) };
      return result('timetable', model, buildTimetable(model, ctx), 'json');
    }
    if (kind === 'classes') { const model = { classes: (j.classes || []).map(c => ({ ...c, _ref: c.id })), counts: Object.entries(j.studentCounts || {}).map(([k, n]) => { const m = /^(.+)-(\d+)$/.exec(k); return { subject: m ? m[1] : k, subjectId: m ? m[1] : null, year: m ? +m[2] : null, count: n, _ref: k }; }) }; return result('classes', model, buildClasses(model, ctx), 'json'); }
    if (kind === 'curriculum') {
      const rows = [];
      (j.domains || []).forEach(d => { rows.push({ level: 'bidang', code: d.code, text: (d.name && (d.name.ar || d.name.jawi)) || '', textMs: (d.name && d.name.ms) || '', page: null, notes: [], _ref: `bidang ${d.code}` }); (d.contentStandards || []).forEach(s => { rows.push({ level: 'SK', code: s.code, displayCode: s.displayCode, text: s.text || '', textLegacy: s.textLegacy, page: s.page || null, notes: s.notes || [], _ref: s.code }); (s.performanceStandards || []).forEach(p => rows.push({ level: `TP${p.tp}`, code: s.code, text: p.text || '', textLegacy: p.textLegacy, page: p.page || null, notes: [], _ref: `${s.code} TP${p.tp}` })); (s.learningStandards || []).forEach(p => rows.push({ level: 'SP', code: p.code, displayCode: p.displayCode, text: p.text || '', textLegacy: p.textLegacy, page: p.page || null, notes: p.notes || [], _ref: p.code })); }); });
      const model = { meta: { subjectId: j.subjectId, year: j.year, script: j.script, title: j.source && j.source.title, file: j.source && j.source.file, themes: j.themes || [], framework: j.framework, method: 'json' }, rows };
      const built = buildCurriculum(model, { ...ctx, subjectName: j.subjectName || ctx.subjectName });
      if (j.performanceStandards && j.performanceStandards.tables && j.performanceStandards.tables.length) built.data.performanceStandards = clone(j.performanceStandards);
      if (j.glossary) built.data.glossary = clone(j.glossary);
      return result('curriculum', model, built, 'json');
    }
    if (kind === 'rpt') {
      // RPT JSON format aplikasi disimpan seadanya (tiada penukaran) — hanya disemak.
      const issues = [];
      if (!j.subjectId) issues.push({ level: 'error', msg: 'Medan "subjectId" tiada.', ref: null });
      if (!Array.isArray(j.weeks) && !Array.isArray(j.rows)) issues.push({ level: 'error', msg: 'Perlu "weeks" atau "rows".', ref: null });
      return { kind: 'rpt', model: { meta: { subjectId: j.subjectId, year: j.year, shape: Array.isArray(j.weeks) ? 'weeks' : 'rows' }, records: [], passthrough: clone(j) }, data: clone(j), issues, stats: { weeks: (j.weeks || j.rows || []).length }, method: 'json' };
    }
    if (kind === 'history') { const model = { entries: (j.entries || []).map(e => ({ ...e, class: e.class, _ref: e.date })) }; return result('history', model, buildHistory(model, ctx), 'json'); }
    throw new Error(`JSON jenis "${kind}" tidak disokong.`);
  }

  // =====================================================================================
  // Pendaftaran
  // =====================================================================================
  const KINDS = {
    calendar: { label: 'Takwim sekolah', perYear: true, collection: 'calendar', accept: '.pdf,.docx,.xlsx,.xls,.csv,.json,.png,.jpg,.jpeg', template: true, ai: true },
    timetable: { label: 'Jadual waktu', perYear: true, collection: 'timetable', accept: '.xlsx,.xls,.csv,.docx,.pdf,.png,.jpg,.jpeg,.json', template: true, ai: true },
    classes: { label: 'Kelas & bilangan murid', perYear: true, collection: 'classes', accept: '.xlsx,.xls,.csv,.txt,.docx,.json', template: true, ai: true },
    curriculum: { label: 'DSKP', perYear: false, collection: 'curriculum', accept: '.pdf,.docx,.xlsx,.xls,.csv,.json', template: true, ai: true },
    rpt: { label: 'RPT', perYear: true, collection: 'rpt', accept: '.docx,.xlsx,.xls,.csv,.pdf,.pptx,.json', template: true, ai: true },
    history: { label: 'Contoh RPH lama', perYear: true, collection: 'history', accept: '.docx,.pdf,.json', template: false, ai: false },
    // Tidak menggantikan takwim sekolah: disimpan sebagai calendar.kpm (lihat docs/RPT_GENERATOR_CONTRACT.md, lampiran).
    'calendar-kpm': { label: 'Kalendar akademik KPM', perYear: true, collection: 'calendar', merge: 'kpm', accept: '.pdf,.json', template: false, ai: false },
  };
  /** Bina semula data KPM selepas guru menukar kumpulan (A/B): model.groups mengandungi kedua-dua kumpulan. */
  function buildKpm(model, ctx = {}) {
    const g = String(ctx.group || (model && model.selected) || 'B').toUpperCase();
    const data = model && model.groups && model.groups[g] ? model.groups[g] : null;
    const issues = data ? [] : [{ level: 'error', msg: `Kumpulan ${g} tiada dalam fail kalendar KPM.` }];
    return { data, issues, stats: data ? { group: g, blocks: data.blocks.length, weeks: data.kpmWeeks.length, days: data.blocks.reduce((a, b) => a + b.days, 0), breaks: data.breaks.length } : {} };
  }
  const BUILD = { calendar: buildCalendar, timetable: buildTimetable, classes: buildClasses, curriculum: buildCurriculum, rpt: buildRpt, history: buildHistory, 'calendar-kpm': buildKpm };

  RPH.importers = {
    VERSION, KINDS, TEMPLATES, TEMPLATE_MARK,
    calendar, timetable, classes, curriculum, rpt, history, profile, classify, calendarKpm, calendarFromKpm,
    build(kind, model, ctx) { const f = BUILD[kind]; if (!f) throw new Error(`Jenis "${kind}" tiada.`); return f(model, ctx || {}); },
    run(kind, doc, ctx) { const f = { calendar, timetable, classes, curriculum, rpt, history, 'calendar-kpm': calendarKpm }[kind]; if (!f) throw new Error(`Jenis "${kind}" tiada.`); return f(doc, ctx || {}); },
    rptDetect, rptRemap, RPT_ROLE_LABELS, RPT_KINDS, CAL_KINDS, CAL_CATS,
    timetableFromGrid, matchSubject, matchClass, splitCell,
    templateWorkbook, templateArray,
    aiSpec, fromAi, fromJson,
    util: { clean, line, digits, arText, key, isAr, jawiFix, parseDate, parseRange, parseTime, parseTimeRange, normTimes, hm, extractCodes, codeOnly, codeSort, dayOf, monthOf, mondayOf, addDays, dowOf, tablesOf, findHeader, headerKeyOf, templateKind, rowLevel, classIdOf, baContentKind, themeFor, bidangIdOf },
  };
})(window.RPH = window.RPH || {});
