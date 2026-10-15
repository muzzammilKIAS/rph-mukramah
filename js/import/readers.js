/* Lapisan pembaca fail (import): PDF, DOCX, PPTX, XLSX/XLS/CSV, imej, TXT, JSON → objek Doc seragam.
   Luar talian sepenuhnya (pdf.js, JSZip, SheetJS dibundel). Tiada fetch() fail tempatan.
   Kontrak: lihat RPH.readers di bawah dan docs/ARCHITECTURE.md (bahagian Import).

   Nota PDF Arab/Jawi: pdf.js getTextContent() menterbalikkan rentetan glif berbilang aksara
   (ligatur لا / لم / تج …) apabila menukar susunan visual → logik. Oleh itu halaman yang
   mengandungi tulisan Arab dibaca pada aras GLIF daripada senarai operator (setiap glif dengan
   kedudukan sebenar), kemudian disusun semula kanan→kiri tanpa memecahkan ligatur. */
(function (RPH) {
  'use strict';

  const SUPPORTED = ['.pdf', '.docx', '.pptx', '.xlsx', '.xls', '.csv', '.png', '.jpg', '.jpeg', '.webp', '.txt', '.json'];
  const KIND_BY_EXT = {
    pdf: 'pdf', docx: 'docx', docm: 'docx', dotx: 'docx', pptx: 'pptx', ppsx: 'pptx',
    xlsx: 'xlsx', xlsm: 'xlsx', xls: 'xlsx', ods: 'xlsx', csv: 'csv', tsv: 'csv',
    png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', bmp: 'image',
    txt: 'txt', text: 'txt', md: 'txt', json: 'json',
  };
  const LIMITS = {
    maxPdfPages: 600,          // halaman PDF dibaca (lebih → amaran)
    maxEmbeddedImages: 12,     // imej terbenam DOCX/PPTX
    maxEmbeddedBytes: 2.5e6,   // saiz maksimum satu imej terbenam
    maxEmbeddedTotal: 12e6,    // jumlah imej terbenam
    maxRenderPixels: 16e6,     // kanvas render halaman PDF
  };

  // ---------------------------------------------------------------------------
  // Utiliti teks Arab / Jawi
  // ---------------------------------------------------------------------------
  const RE_ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  const RE_ARABIC_LETTER = /[\u0620-\u064A\u066E-\u06D3\u06D5\u06EE\u06EF\u06FA-\u06FC\u06FF\u0750-\u077F\u08A0-\u08C9\uFB50-\uFDFF\uFE70-\uFEFC]/;
  const RE_LATIN_LETTER = /[A-Za-z\u00C0-\u024F]/;
  const RE_DIGIT = /[0-9\u0660-\u0669\u06F0-\u06F9]/;
  const RE_MARK = /^[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\u08D3-\u08E1\u08E3-\u08FF\uFE70\uFE72\uFE74\uFE76\uFE78\uFE7A\uFE7C\uFE7E]+$/;
  const RE_PRESENTATION = /[\uFB50-\uFDF9\uFDFB-\uFDFF\uFE70-\uFEFF]+/g; // U+FDFA ﷺ dikekalkan
  const RE_BIDI_CTRL = /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g;
  const MIRROR = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', '«': '»', '»': '«' };
  const isArabic = s => RE_ARABIC.test(s || '');

  /** Bentuk persembahan (FE70–FEFC): 0=asing, 1=akhir, 2=awal, 3=tengah. Untuk mengesan susunan visual. */
  const FORM = (() => {
    const m = {};
    // [mula, bilangan bentuk] mengikut blok Arabic Presentation Forms-B
    const groups = [[0xFE80, 1], [0xFE81, 2], [0xFE83, 2], [0xFE85, 2], [0xFE87, 2], [0xFE89, 4], [0xFE8D, 2], [0xFE8F, 4], [0xFE93, 2],
      [0xFE95, 4], [0xFE99, 4], [0xFE9D, 4], [0xFEA1, 4], [0xFEA5, 4], [0xFEA9, 2], [0xFEAB, 2], [0xFEAD, 2], [0xFEAF, 2],
      [0xFEB1, 4], [0xFEB5, 4], [0xFEB9, 4], [0xFEBD, 4], [0xFEC1, 4], [0xFEC5, 4], [0xFEC9, 4], [0xFECD, 4], [0xFED1, 4],
      [0xFED5, 4], [0xFED9, 4], [0xFEDD, 4], [0xFEE1, 4], [0xFEE5, 4], [0xFEE9, 4], [0xFEED, 2], [0xFEEF, 2], [0xFEF1, 4],
      [0xFEF5, 2], [0xFEF7, 2], [0xFEF9, 2], [0xFEFB, 2]];
    for (const [start, n] of groups) for (let i = 0; i < n; i++) m[start + i] = i;
    return m;
  })();

  /** Adakah satu larian Arab kelihatan dalam susunan visual (terbalik)? Hanya boleh dikesan jika ada bentuk persembahan. */
  function looksVisual(s) {
    let good = 0, bad = 0;
    for (const w of String(s).split(/[^\uFE70-\uFEFF]+/)) {
      if (w.length < 2) continue;
      const first = FORM[w.codePointAt(0)], last = FORM[w.codePointAt(w.length - 1)];
      if (first === 2 || last === 1) good++;       // awal di depan / akhir di belakang = logik
      if (first === 1 || last === 2) bad++;        // akhir di depan / awal di belakang = visual
    }
    return bad > good && bad >= 2;
  }

  /**
   * Normalkan teks Arab/Jawi:
   *  - bentuk persembahan (U+FB50–U+FDFF, U+FE70–U+FEFF) → huruf asas (NFKC), KECUALI ﷺ (U+FDFA)
   *  - buang tatweel (ـ) dan aksara kawalan bidi
   *  - jika larian kelihatan dalam susunan visual (terbalik), terbalikkan setiap larian Arab
   */
  function normalizeArabic(s) {
    if (s == null) return '';
    let t = String(s);
    if (!isArabic(t)) return t.replace(RE_BIDI_CTRL, '');
    if (looksVisual(t)) {
      t = t.split('\n').map(line => line.replace(/[\uFB50-\uFDFF\uFE70-\uFEFF\u0600-\u06FF\u0750-\u077F]+(?:[ \u00A0]+[\uFB50-\uFDFF\uFE70-\uFEFF\u0600-\u06FF\u0750-\u077F]+)*/g,
        run => [...run].reverse().join(''))).join('\n');
    }
    t = t.replace(RE_PRESENTATION, m => m.normalize('NFKC'));
    return t.replace(/ـ/g, '').replace(RE_BIDI_CTRL, '');
  }

  // Senarai sandaran perkataan ejaan fon lama yang sangat kerap (jika leksikon tidak dimuatkan).
  const LEGACY_FALLBACK = ['دغن', 'يغ', 'كفد', 'فد', 'اورغ', 'ضورو', 'فلاجر', 'فلاجرن', 'ممباخ', 'مغ', 'باخاءن', 'فركارا', 'ساغت', 'كهيدوفن', 'مغيكوت', 'بيمبيغن'];
  const RE_STD_JAWI = /[\u06A0\u06A4\u0762\u0686\u06BD\u06CF\u06AC\u0674]/; // ڠ ڤ ݢ چ ڽ ۏ ڬ ٴ

  /** Kesan teks Jawi ejaan fon lama (غ untuk ڠ, ف untuk ڤ …). Tidak menukar apa-apa. */
  function detectLegacyJawi(text) {
    const words = String(text || '').match(/[\u0621-\u064A\u0660-\u0669\u0671-\u06FF\u0750-\u077F]+/g) || [];
    if (words.length < 5) return { legacy: false, legacyWords: 0, standardWords: 0, arabicWords: words.length };
    let legacyWords = 0;
    if (RPH.jawi && RPH.jawi.legacyWords) legacyWords = RPH.jawi.legacyWords(words.join(' ')).length;
    if (!legacyWords) { const set = new Set(LEGACY_FALLBACK); legacyWords = words.filter(w => set.has(w.replace(/[\u064B-\u065F\u0670]/g, ''))).length; }
    const standardWords = words.filter(w => RE_STD_JAWI.test(w)).length;
    const legacy = legacyWords >= 3 && legacyWords >= 2 * standardWords && legacyWords / words.length >= 0.005;
    return { legacy, legacyWords, standardWords, arabicWords: words.length };
  }

  const dirOf = s => {
    let ar = 0, la = 0;
    for (const ch of String(s || '')) { if (RE_ARABIC_LETTER.test(ch)) ar++; else if (RE_LATIN_LETTER.test(ch)) la++; }
    return ar > 0 && ar >= la ? 'rtl' : 'ltr';
  };
  const cleanText = s => String(s || '').replace(/\u00A0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();

  // ---------------------------------------------------------------------------
  // Asas fail
  // ---------------------------------------------------------------------------
  const extOf = name => { const m = /\.([A-Za-z0-9]+)$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };

  function readAsArrayBuffer(blob) {
    if (blob.arrayBuffer) return blob.arrayBuffer();
    return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsArrayBuffer(blob); });
  }
  function readAsDataURL(blob) {
    return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob); });
  }
  function decodeText(buf) {
    const u = new Uint8Array(buf);
    if (u[0] === 0xFF && u[1] === 0xFE) return new TextDecoder('utf-16le').decode(u.subarray(2));
    if (u[0] === 0xFE && u[1] === 0xFF) return new TextDecoder('utf-16be').decode(u.subarray(2));
    const body = (u[0] === 0xEF && u[1] === 0xBB && u[2] === 0xBF) ? u.subarray(3) : u;
    try { return new TextDecoder('utf-8', { fatal: true }).decode(body); }
    catch (e) { return new TextDecoder('windows-1252').decode(body); }
  }
  /** Kesan jenis daripada bait permulaan (fail tanpa sambungan / sambungan salah). */
  async function sniff(buf) {
    const u = new Uint8Array(buf, 0, Math.min(8, buf.byteLength));
    const s = String.fromCharCode(...u);
    if (s.startsWith('%PDF')) return 'pdf';
    if (u[0] === 0x89 && s.slice(1, 4) === 'PNG') return 'image';
    if (u[0] === 0xFF && u[1] === 0xD8) return 'image';
    if (s.startsWith('RIFF')) return 'image';
    if (u[0] === 0xD0 && u[1] === 0xCF) return 'xlsx'; // OLE (xls lama)
    if (s.startsWith('PK') && window.JSZip) {
      try {
        const zip = await JSZip.loadAsync(buf);
        if (zip.file('word/document.xml')) return 'docx';
        if (zip.file('ppt/presentation.xml')) return 'pptx';
        if (zip.file('xl/workbook.xml')) return 'xlsx';
      } catch (e) { /* bukan zip sah */ }
    }
    return null;
  }

  function newDoc(file) {
    const name = file.name || 'fail';
    const ext = extOf(name);
    return {
      name, ext: ext ? '.' + ext : '', mime: file.type || '', size: file.size || 0,
      kind: KIND_BY_EXT[ext] || 'unknown',
      text: '', paragraphs: [], tables: [], pages: [], sheets: [], images: [],
      scanned: false, legacyJawi: false, warnings: [], file,
    };
  }

  function need(lib, label) {
    if (!window[lib]) throw new Error(`Pustaka ${label} tidak dimuatkan (assets/vendor). Import fail jenis ini tidak tersedia.`);
    return window[lib];
  }

  // ---------------------------------------------------------------------------
  // PDF
  // ---------------------------------------------------------------------------
  const pdfCache = new WeakMap(); // File → Promise<PDFDocumentProxy>

  function pdfjs() {
    const lib = need('pdfjsLib', 'PDF (pdf.js)');
    if (!window.pdfjsWorker) throw new Error('Pustaka PDF tidak lengkap: assets/vendor/pdf.worker.min.js mesti dimuatkan sebelum readers.js.');
    return lib;
  }
  async function openPdf(file, buf) {
    if (file && pdfCache.has(file)) return pdfCache.get(file);
    const lib = pdfjs();
    const p = (async () => {
      const data = new Uint8Array(buf || await readAsArrayBuffer(file));
      try {
        return await lib.getDocument({ data, isEvalSupported: false, useSystemFonts: true, verbosity: 0 }).promise;
      } catch (e) {
        if (e && e.name === 'PasswordException') throw new Error('PDF ini dilindungi kata laluan. Buka dan simpan semula tanpa kata laluan, kemudian cuba lagi.');
        throw new Error(`PDF tidak dapat dibuka (${e && e.message ? e.message : e}). Fail mungkin rosak.`);
      }
    })();
    if (file) pdfCache.set(file, p);
    p.catch(() => file && pdfCache.delete(file));
    return p;
  }

  const mul = (m1, m2) => [
    m1[0] * m2[0] + m1[1] * m2[2], m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2], m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4], m1[4] * m2[1] + m1[5] * m2[3] + m2[5]];
  const apply = (m, x, y) => [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];
  const ID = [1, 0, 0, 1, 0, 0];

  /**
   * Tafsir senarai operator pdf.js → glif berkedudukan (koordinat viewport, y ke bawah) + garisan jadual.
   * Meniru semantik CanvasGraphics.showText (pdf.js 3.11).
   */
  function interpretOps(ol, page, vp) {
    const OPS = window.pdfjsLib.OPS;
    const glyphs = [], rules = [], images = [];
    const vt = vp.transform;
    let st = { ctm: ID, tm: ID, x: 0, y: 0, lineX: 0, lineY: 0, leading: 0, font: null, fm: [0.001, 0, 0, 0.001, 0, 0], size: 0, dir: 1, tc: 0, tw: 0, th: 1, rise: 0 };
    const stack = [];
    const fontInfo = {};
    const getFont = name => {
      if (name in fontInfo) return fontInfo[name];
      let fm = [0.001, 0, 0, 0.001, 0, 0], vertical = false;
      try { const f = page.commonObjs.get(name); if (f) { if (f.fontMatrix) fm = f.fontMatrix; vertical = !!f.vertical; } } catch (e) { /* belum diselesaikan */ }
      return (fontInfo[name] = { fm, vertical });
    };
    const setFont = (name, size) => {
      const f = getFont(name);
      st.font = name; st.fm = f.fm; st.vertical = f.vertical;
      st.dir = size < 0 ? -1 : 1; st.size = Math.abs(size);
    };
    let seq = 0;
    const fn = ol.fnArray, args = ol.argsArray;
    for (let i = 0; i < fn.length; i++) {
      const op = fn[i], a = args[i];
      switch (op) {
        case OPS.save: stack.push(Object.assign({}, st)); break;
        case OPS.restore: if (stack.length) st = stack.pop(); break;
        case OPS.transform: st.ctm = mul(a, st.ctm); break;
        case OPS.paintFormXObjectBegin: stack.push(Object.assign({}, st)); if (Array.isArray(a[0]) && a[0].length === 6) st.ctm = mul(a[0], st.ctm); break;
        case OPS.paintFormXObjectEnd: if (stack.length) st = stack.pop(); break;
        case OPS.beginText: st.tm = ID; st.x = st.lineX = 0; st.y = st.lineY = 0; break;
        case OPS.setTextMatrix: st.tm = a.length >= 6 ? a.slice(0, 6) : a[0]; st.x = st.lineX = 0; st.y = st.lineY = 0; break;
        case OPS.moveText: st.x = st.lineX += a[0]; st.y = st.lineY += a[1]; break;
        case OPS.setLeadingMoveText: st.leading = -a[1]; st.x = st.lineX += a[0]; st.y = st.lineY += a[1]; break;
        case OPS.nextLine: st.x = st.lineX += 0; st.y = st.lineY += -st.leading; break;
        case OPS.setLeading: st.leading = a[0]; break;
        case OPS.setCharSpacing: st.tc = a[0]; break;
        case OPS.setWordSpacing: st.tw = a[0]; break;
        case OPS.setHScale: st.th = a[0] / 100; break;
        case OPS.setTextRise: st.rise = a[0]; break;
        case OPS.setFont: setFont(a[0], a[1]); break;
        case OPS.setGState:
          for (const [k, v] of (a[0] || [])) if (k === 'Font' && Array.isArray(v)) setFont(v[0], v[1]);
          break;
        case OPS.showText: {
          if (!st.size || st.vertical) break;
          const m = mul(mul(st.tm, st.ctm), vt);
          const u = st.th * st.dir;
          const b = st.size * st.fm[0];
          const h = st.size * Math.hypot(m[2], m[3]);
          let E = 0;
          for (const g of a[0]) {
            if (g == null) { E += st.dir * st.tw; continue; }
            if (typeof g === 'number') { E -= g * st.size / 1000; continue; }
            const spacing = (g.isSpace ? st.tw : 0) + st.tc;
            const adv = g.width * b + spacing * st.dir;
            const s = g.unicode;
            if (s) {
              const p0 = apply(m, st.x + E * u, st.y + st.rise);
              const p1 = apply(m, st.x + (E + g.width * b) * u, st.y + st.rise);
              glyphs.push({ s, x0: Math.min(p0[0], p1[0]), x1: Math.max(p0[0], p1[0]), y: p0[1], ox: p0[0], oy: p0[1], h, dx: p1[0] - p0[0], dy: p1[1] - p0[1], sp: !!g.isSpace || /^\s+$/.test(s), seq: seq++, font: st.font });
            }
            E += adv;
          }
          st.x += E * u;
          break;
        }
        case OPS.paintImageXObject:
        case OPS.paintInlineImageXObject:
        case OPS.paintImageMaskXObject:
        case OPS.paintImageXObjectRepeat:
        case OPS.paintSolidColorImageMask: {
          // Imej diletak dalam segi empat unit × CTM. Disimpan untuk mengesan perkataan yang ditampal sebagai gambar.
          const m = mul(st.ctm, vt);
          const pts = [apply(m, 0, 0), apply(m, 1, 0), apply(m, 0, 1), apply(m, 1, 1)];
          const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
          images.push({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), seq: seq++ });
          break;
        }
        case OPS.constructPath: {
          // Garisan jadual: segi empat nipis / garisan paksi.
          const [ops, pa] = a; let k = 0; let cx = 0, cy = 0;
          const m = mul(st.ctm, vt);
          const push = (x0, y0, x1, y1) => {
            const p = apply(m, x0, y0), q = apply(m, x1, y1);
            rules.push({ x0: Math.min(p[0], q[0]), y0: Math.min(p[1], q[1]), x1: Math.max(p[0], q[0]), y1: Math.max(p[1], q[1]) });
          };
          for (const o of ops) {
            if (o === OPS.rectangle) { const [x, y, w, hh] = pa.slice(k, k + 4); k += 4; push(x, y, x + w, y + hh); }
            else if (o === OPS.moveTo) { cx = pa[k++]; cy = pa[k++]; }
            else if (o === OPS.lineTo) { const x = pa[k++], y = pa[k++]; push(cx, cy, x, y); cx = x; cy = y; }
            else if (o === OPS.curveTo) { k += 6; } else if (o === OPS.curveTo2 || o === OPS.curveTo3) { k += 4; }
          }
          break;
        }
        default: break;
      }
    }
    return { glyphs, rules, images };
  }

  /** Garisan paksi daripada segi empat/garisan: { h: [{y,x0,x1}], v: [{x,y0,y1}] } */
  function axisRules(rules) {
    const H = [], V = [];
    for (const r of rules) {
      const w = r.x1 - r.x0, hh = r.y1 - r.y0;
      if (w < 0.2 && hh < 0.2) continue;
      if (hh <= 2.5 && w > 2) H.push({ y: (r.y0 + r.y1) / 2, x0: r.x0, x1: r.x1 });
      else if (w <= 2.5 && hh > 2) V.push({ x: (r.x0 + r.x1) / 2, y0: r.y0, y1: r.y1 });
      else if (w > 2 && hh > 2) { // segi empat sel: 4 sisi
        H.push({ y: r.y0, x0: r.x0, x1: r.x1 }, { y: r.y1, x0: r.x0, x1: r.x1 });
        V.push({ x: r.x0, y0: r.y0, y1: r.y1 }, { x: r.x1, y0: r.y0, y1: r.y1 });
      }
    }
    return { H, V };
  }

  const charClass = s => {
    if (s === '\uFFFC') return 'O';
    if (RE_ARABIC_LETTER.test(s)) return 'R';
    if (RE_LATIN_LETTER.test(s) || RE_DIGIT.test(s)) return 'L';
    return 'N';
  };

  /**
   * Bina teks satu segmen (kluster dalam satu baris).
   * RTL: kluster disusun kanan→kiri; larian LTR (Latin/angka) diterbalikkan semula. Sempadan larian LTR
   * ditentukan oleh susunan LUKISAN (seq): glif yang dilukis kiri→kanan berturut-turut ialah satu larian LTR.
   * Ini mengikut tingkah laku Word: "(21-31)" dilukis sebagai dua larian nombor dalam susunan RTL,
   * manakala "[1.1]" dilukis sebagai satu larian LTR termasuk kurungan.
   */
  function segmentText(cl, ctxDir) {
    let ar = 0, la = 0;
    for (const c of cl) for (const ch of c.s) { if (RE_ARABIC_LETTER.test(ch)) ar++; else if (RE_LATIN_LETTER.test(ch)) la++; }
    const rtl = (ar > 0 && ar >= la) || (ar === 0 && la === 0 && ctxDir === 'rtl');
    const ord = cl.slice().sort(rtl ? (a, b) => (b.x0 + b.x1) - (a.x0 + a.x1) || a.seq - b.seq : (a, b) => (a.x0 + a.x1) - (b.x0 + b.x1) || a.seq - b.seq);
    // Sisip ruang mengikut jurang
    const toks = [];
    let prev = null;
    for (const c of ord) {
      if (prev) {
        const gap = rtl ? prev.x0 - c.x1 : c.x0 - prev.x1;
        const thr = 0.16 * Math.min(prev.h || 10, c.h || 10);
        if (gap > thr && !prev.sp && !c.sp) toks.push({ s: ' ', sp: true, cls: 'N', seq: null });
      }
      toks.push({ s: c.sp ? ' ' : c.s, sp: c.sp, cls: c.sp ? 'N' : charClass(c.s), seq: c.seq });
      prev = c;
    }
    if (rtl) {
      // ltr(i, j): token j (di kiri) dan i (di kanan) dilukis kiri→kanan (j dahulu) → sebahagian larian LTR.
      const ltrLink = (right, left) => right.seq == null || left.seq == null || left.seq < right.seq;
      let i = 0;
      while (i < toks.length) {
        if (toks[i].cls !== 'L') { i++; continue; }
        // Lanjut ke kiri (indeks bertambah) selagi bukan huruf Arab dan dilukis kiri→kanan.
        let z = i, lastReal = i;
        for (let k = i + 1; k < toks.length; k++) {
          const t = toks[k];
          if (t.cls === 'R' || t.cls === 'O') break;
          if (t.seq == null) continue; // ruang sisipan: telus
          if (!ltrLink(toks[lastReal], t)) break;
          lastReal = k; z = k;
        }
        // Lanjut ke kanan (indeks berkurang) bagi neutral (cth. "[" atau ruang) yang dilukis bersama larian.
        let a = i;
        for (let k = i - 1; k >= 0; k--) {
          const t = toks[k];
          if (t.cls !== 'N' || t.seq == null) break;
          if (!ltrLink(t, toks[a])) break;
          a = k;
        }
        // Neutral di hujung larian (selain kurungan) kekal di tempatnya.
        while (z > i && toks[z].cls === 'N' && !MIRROR[toks[z].s]) z--;
        while (a < i && toks[a].cls === 'N' && !MIRROR[toks[a].s]) a++;
        const run = toks.slice(a, z + 1).reverse();
        toks.splice(a, run.length, ...run);
        i = z + 1;
      }
    }
    const text = normalizeArabic(toks.map(t => t.s).join('').replace(/\s+/g, ' ').trim());
    return { text, dir: rtl ? 'rtl' : 'ltr' };
  }

  const IMAGE_PLACEHOLDER = '\uFFFC';
  /** Imej kecil sebaris dengan teks (saiz ≈ tinggi huruf) → kluster penanda; imej bersebelahan digabung. */
  function inlineImages(images, clusters) {
    const hs = clusters.filter(c => !c.sp).map(c => c.h).sort((a, b) => a - b);
    if (!hs.length || !images.length) return [];
    const th = hs[Math.floor(hs.length / 2)];
    const cand = images.filter(im => { const h = im.y1 - im.y0, w = im.x1 - im.x0; return h >= 0.6 * th && h <= 2.6 * th && w > 1 && w <= 25 * th; })
      .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
    const merged = [];
    for (const im of cand) {
      const m = merged.find(o => Math.abs(o.y0 - im.y0) < 0.3 * th && Math.abs(o.y1 - im.y1) < 0.3 * th && im.x0 <= o.x1 + 0.3 * th && im.x1 >= o.x0 - 0.3 * th);
      if (m) { m.x0 = Math.min(m.x0, im.x0); m.x1 = Math.max(m.x1, im.x1); m.seq = Math.min(m.seq, im.seq); }
      else merged.push(Object.assign({}, im));
    }
    return merged.map(im => ({ s: IMAGE_PLACEHOLDER, x0: im.x0, x1: im.x1, y: im.y1 - 0.3 * (im.y1 - im.y0), h: th, sp: false, img: true, seq: im.seq, font: '#img' }));
  }

  /** Glif → kluster (tanda baris dilekatkan pada huruf asas) → baris visual → segmen. */
  function buildLines(glyphs, rules, images) {
    // 1) Kluster. Tanda (harakat/syaddah) dilekatkan pada jiran aliran (sebelum/selepas) yang kotaknya
    //    mengandungi kedudukan tanda itu (Word melukis syaddah sebelum atau selepas huruf asasnya).
    const horiz = g => Math.abs(g.dy) <= Math.abs(g.dx) * 0.2 + 0.01;
    const list = glyphs.filter(horiz);
    const clusters = [];
    const byIdx = new Array(list.length).fill(null);
    list.forEach((g, i) => {
      if (RE_MARK.test(g.s)) return;
      const c = { s: g.s, x0: g.x0, x1: g.x1, y: g.y, h: g.h || 10, sp: g.sp, seq: g.seq, font: g.font };
      byIdx[i] = c; clusters.push(c);
    });
    list.forEach((g, i) => {
      if (byIdx[i]) return;
      const mx = (g.x0 + g.x1) / 2;
      const near = [];
      for (let k = i - 1; k >= 0 && near.length < 1; k--) if (byIdx[k] && !byIdx[k].sp) near.push(byIdx[k]);
      for (let k = i + 1; k < list.length && near.length < 2; k++) if (byIdx[k] && !byIdx[k].sp) near.push(byIdx[k]);
      const ok = near.filter(c => Math.abs(c.y - g.y) < c.h * 0.8);
      if (!ok.length) { const c = { s: g.s, x0: g.x0, x1: g.x1, y: g.y, h: g.h || 10, sp: false, seq: g.seq, font: g.font }; clusters.push(c); return; }
      const inside = ok.filter(c => mx >= c.x0 - 0.3 && mx <= c.x1 + 0.3);
      const pick = (inside.length ? inside : ok).sort((a, b) => Math.abs((a.x0 + a.x1) / 2 - mx) - Math.abs((b.x0 + b.x1) / 2 - mx))[0];
      pick.s += g.s;
    });
    // 1a) Imej sebaris (perkataan yang ditampal sebagai gambar) → kluster penanda U+FFFC.
    const inline = inlineImages(images || [], clusters);
    inline.forEach(c => clusters.push(c));
    // 1b) Glif ruang yang hampir sepenuhnya di dalam kotak satu huruf (artifak justifikasi Word) dibuang.
    const solid = clusters.filter(c => !c.sp);
    const inLetter = sp => solid.some(c => Math.abs(c.y - sp.y) < c.h * 0.5 && Math.min(c.x1, sp.x1) - Math.max(c.x0, sp.x0) >= 0.85 * Math.max(0.1, sp.x1 - sp.x0));
    for (let i = clusters.length - 1; i >= 0; i--) if (clusters[i].sp && inLetter(clusters[i])) clusters.splice(i, 1);
    // 2) Baris: kumpul ikut garis dasar.
    clusters.sort((a, b) => a.y - b.y || a.seq - b.seq);
    const tolOf = (h1, h2) => Math.max(1, 0.45 * Math.min(h1, h2));
    let lines = [];
    for (const c of clusters) {
      const L = lines.length ? lines[lines.length - 1] : null;
      if (L && Math.abs(c.y - L.y) <= tolOf(L.h, c.h)) {
        L.items.push(c);
        if (!c.sp) { L.n++; L.sum += c.y; L.y = L.sum / L.n; L.h = Math.max(L.h, c.h); }
      } else lines.push({ y: c.y, h: c.h, items: [c], n: c.sp ? 0 : 1, sum: c.sp ? 0 : c.y });
    }
    // Gabung baris bersebelahan yang garis dasarnya hampir sama (huruf sedikit terangkat/turun).
    const merged = [];
    for (const L of lines) {
      const P = merged.length ? merged[merged.length - 1] : null;
      if (P && Math.abs(P.y - L.y) <= tolOf(P.h, L.h)) { P.items.push(...L.items); P.sum += L.sum; P.n += L.n; P.y = P.n ? P.sum / P.n : P.y; P.h = Math.max(P.h, L.h); }
      else merged.push(L);
    }
    lines = merged;
    // Arah konteks halaman (untuk segmen tanpa huruf, cth. "(21-31)" atau "1.1.1").
    let arN = 0, laN = 0;
    for (const c of clusters) { if (RE_ARABIC_LETTER.test(c.s)) arN++; else if (RE_LATIN_LETTER.test(c.s)) laN++; }
    const ctxDir = arN > laN ? 'rtl' : 'ltr';
    // 3) Segmen: pecah pada jurang besar atau garisan menegak jadual.
    const { V } = axisRules(rules || []);
    const out = [];
    for (const L of lines) {
      const items = L.items.slice().sort((a, b) => a.x0 - b.x0 || a.seq - b.seq);
      const top = L.y - L.h * 0.8, bot = L.y + L.h * 0.2;
      const vx = V.filter(v => v.y0 <= bot && v.y1 >= top).map(v => v.x);
      let seg = [], maxX = -Infinity;
      const flush = () => {
        const real = seg.filter(c => !c.sp);
        if (real.length) {
          const { text, dir } = segmentText(seg, ctxDir);
          if (text) {
            const x0 = Math.min(...real.map(c => c.x0)), x1 = Math.max(...real.map(c => c.x1));
            out.push({ text, dir, x: round1(x0), y: round1(L.y - L.h * 0.8), w: round1(x1 - x0), h: round1(L.h), base: L.y });
          }
        }
        seg = []; maxX = -Infinity;
      };
      for (const c of items) {
        if (seg.length && !c.sp) {
          const gap = c.x0 - maxX;
          const ruled = vx.some(x => x > maxX - 0.5 && x < c.x0 + 0.5);
          if (gap > Math.max(2.2 * L.h, 18) || (ruled && gap > -0.5)) flush();
        }
        seg.push(c); if (!c.sp) maxX = Math.max(maxX, c.x1);
      }
      flush();
    }
    // 3b) Teks berputar (cth. pengepala hari menegak): putar ke bingkai sendiri, bina baris, petakan kotak semula.
    const rot = glyphs.filter(g => !horiz(g) && g.ox != null);
    if (rot.length) {
      const byAngle = {};
      for (const g of rot) { const q = Math.round(Math.atan2(g.dy, g.dx) / (Math.PI / 2)); (byAngle[q] = byAngle[q] || []).push(g); }
      for (const [q, gs] of Object.entries(byAngle)) {
        const th = +q * Math.PI / 2, ca = Math.cos(-th), sa = Math.sin(-th);
        const R = (x, y) => [x * ca - y * sa, x * sa + y * ca];
        const Ri = (x, y) => [x * ca + y * sa, -x * sa + y * ca];
        const rg = gs.map(g => {
          const a = R(g.ox, g.oy), b = R(g.ox + g.dx, g.oy + g.dy);
          return { s: g.s, x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y: a[1], ox: null, h: g.h, dx: b[0] - a[0], dy: b[1] - a[1], sp: g.sp, seq: g.seq, font: g.font };
        });
        for (const l of buildLines(rg, [], []).lines) {
          const cs = [Ri(l.x, l.y), Ri(l.x + l.w, l.y), Ri(l.x, l.y + l.h), Ri(l.x + l.w, l.y + l.h)];
          const xs = cs.map(p => p[0]), ys = cs.map(p => p[1]);
          const x0 = Math.min(...xs), y0 = Math.min(...ys);
          out.push({ text: l.text, dir: l.dir, x: round1(x0), y: round1(y0), w: round1(Math.max(...xs) - x0), h: round1(Math.max(...ys) - y0), rotated: Math.round(th * 180 / Math.PI), base: y0 + (Math.max(...ys) - y0) * 0.8 });
        }
      }
    }
    // 4) Susunan bacaan: atas→bawah; dalam baris sama, ikut arah majoriti halaman.
    const rtlPage = out.filter(l => l.dir === 'rtl').length > out.length / 2;
    const groups = [];
    for (const l of out.sort((a, b) => a.base - b.base)) {
      const g = groups.length ? groups[groups.length - 1] : null;
      if (g && Math.abs(l.base - g.base) <= Math.max(1, 0.45 * Math.min(g.h, l.h))) g.items.push(l); else groups.push({ base: l.base, h: l.h, items: [l] });
    }
    const ordered = [];
    for (const g of groups) g.items.sort((a, b) => rtlPage ? (b.x + b.w) - (a.x + a.w) : a.x - b.x).forEach(l => ordered.push(l));
    ordered.forEach(l => delete l.base);
    return { lines: ordered, rtlPage };
  }
  const round1 = n => Math.round(n * 10) / 10;

  /**
   * Jadual PDF (mod "lattice"): bina grid daripada garisan mendatar/menegak, kemudian masukkan baris teks ke sel.
   * Sel bergabung (tiada garisan pemisah) mengulang teks sel asal; `merges` direkodkan.
   */
  function detectTables(rules, lines, pageNo, rtlPage) {
    const { H, V } = axisRules(rules || []);
    if (H.length < 2 || V.length < 2) return [];
    const tol = 1.5;
    const cluster = (vals) => { const s = vals.slice().sort((a, b) => a - b); const out = []; for (const v of s) { if (out.length && v - out[out.length - 1].v <= tol) { const c = out[out.length - 1]; c.n++; c.v += (v - c.v) / c.n; } else out.push({ v, n: 1 }); } return out.map(c => c.v); };
    // Komponen bersambung: kotak sempadan setiap kumpulan garisan yang bersilang.
    const segs = H.map(h => ({ k: 'h', x0: h.x0, x1: h.x1, y0: h.y, y1: h.y })).concat(V.map(v => ({ k: 'v', x0: v.x, x1: v.x, y0: v.y0, y1: v.y1 })));
    const parent = segs.map((_, i) => i);
    const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const touch = (a, b) => a.x0 <= b.x1 + tol && b.x0 <= a.x1 + tol && a.y0 <= b.y1 + tol && b.y0 <= a.y1 + tol;
    const idxH = segs.map((s, i) => i).filter(i => segs[i].k === 'h'), idxV = segs.map((s, i) => i).filter(i => segs[i].k === 'v');
    for (const i of idxH) for (const j of idxV) if (touch(segs[i], segs[j])) parent[find(i)] = find(j);
    const comps = {};
    segs.forEach((s, i) => { const r = find(i); (comps[r] = comps[r] || []).push(s); });
    const tables = [];
    const area = comp => { const xs = comp.flatMap(q => [q.x0, q.x1]), ys = comp.flatMap(q => [q.y0, q.y1]); return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)); };
    const assigned = new Set();
    // Komponen kecil dahulu: baris teks milik jadual paling dalam (bingkai halaman tidak "mencuri" teks).
    for (const comp of Object.values(comps).sort((a, b) => area(a) - area(b))) {
      const hs = comp.filter(s => s.k === 'h'), vs = comp.filter(s => s.k === 'v');
      if (hs.length < 2 || vs.length < 2) continue;
      const ys = cluster(hs.map(s => s.y0)), xs = cluster(vs.map(s => s.x0));
      if (ys.length < 2 || xs.length < 2) continue;
      const nR = ys.length - 1, nC = xs.length - 1;
      if (nR * nC < 2) continue;
      const hasH = (y, xa, xb) => hs.some(s => Math.abs(s.y0 - y) <= tol && s.x0 <= xa + tol && s.x1 >= xb - tol);
      const hasV = (x, ya, yb) => vs.some(s => Math.abs(s.x0 - x) <= tol && s.y0 <= ya + tol && s.y1 >= yb - tol);
      // Sel asal: id grid; gabung kanan jika tiada garisan menegak, gabung bawah jika tiada garisan mendatar.
      const owner = Array.from({ length: nR }, () => new Array(nC).fill(null));
      for (let r = 0; r < nR; r++) for (let c = 0; c < nC; c++) {
        if (c > 0 && !hasV(xs[c], ys[r], ys[r + 1])) { owner[r][c] = owner[r][c - 1]; continue; }
        if (r > 0 && !hasH(ys[r], xs[c], xs[c + 1])) { owner[r][c] = owner[r - 1][c]; continue; }
        owner[r][c] = { r, c, texts: [] };
      }
      // Masukkan baris teks ke sel (ikut titik tengah).
      const x0 = xs[0], x1 = xs[nC], y0 = ys[0], y1 = ys[nR];
      let used = 0;
      for (const l of lines) {
        const cx = l.x + l.w / 2, cy = l.y + l.h * 0.55;
        if (cx < x0 || cx > x1 || cy < y0 || cy > y1 || assigned.has(l)) continue;
        const r = ys.findIndex((y, i) => i < nR && cy >= y && cy <= ys[i + 1]);
        const c = xs.findIndex((x, i) => i < nC && cx >= x && cx <= xs[i + 1]);
        if (r < 0 || c < 0) continue;
        owner[r][c].texts.push(l); assigned.add(l); used++;
      }
      if (!used) continue;
      const textOf = o => {
        if (o._t != null) return o._t;
        const ls = o.texts.slice().sort((a, b) => a.y - b.y || (rtlPage ? b.x - a.x : a.x - b.x));
        const rowsT = []; // gabung segmen pada garis dasar sama
        for (const l of ls) { const last = rowsT[rowsT.length - 1]; if (last && Math.abs(last.y - l.y) < l.h * 0.45) last.parts.push(l); else rowsT.push({ y: l.y, parts: [l] }); }
        return (o._t = rowsT.map(rr => rr.parts.sort((a, b) => rtlPage ? (b.x - a.x) : (a.x - b.x)).map(p => p.text).join(' ')).join('\n'));
      };
      // Lajur/baris grid yang lewah (setiap baris bergabung merentasinya) dibuang — tiada maklumat hilang.
      const keepC = [...Array(nC).keys()].filter(c => c === 0 || owner.some(row => row[c] !== row[c - 1]));
      const keepR = [...Array(nR).keys()].filter(r => r === 0 || owner[r].some((o, c) => o !== owner[r - 1][c]));
      // Lajur dalam susunan visual (kiri→kanan); untuk halaman RTL diterbalikkan supaya lajur 0 = paling kanan.
      const colOrder = keepC.slice(); if (rtlPage) colOrder.reverse();
      const rows = [], merges = [], seen = new Set();
      keepR.forEach((r, ri) => {
        rows.push(colOrder.map(c => textOf(owner[r][c])));
        colOrder.forEach((c, ci) => {
          const o = owner[r][c];
          if (seen.has(o)) return; seen.add(o);
          let rs = 1, cs = 1;
          while (ri + rs < keepR.length && owner[keepR[ri + rs]][c] === o) rs++;
          while (ci + cs < colOrder.length && owner[r][colOrder[ci + cs]] === o) cs++;
          if (rs > 1 || cs > 1) merges.push({ r: ri, c: ci, rowSpan: rs, colSpan: cs });
        });
      });
      if (rows.length * (rows[0] || []).length < 2) continue; // bingkai satu sel, bukan jadual
      if (!rows.some(row => row.some(t => t))) continue;
      tables.push({ source: 'pdf', page: pageNo, rows, merges, dir: rtlPage ? 'rtl' : 'ltr', bbox: { x: round1(x0), y: round1(y0), w: round1(x1 - x0), h: round1(y1 - y0) } });
    }
    const inside = (a, b) => a !== b && a.bbox.x >= b.bbox.x - 1 && a.bbox.y >= b.bbox.y - 1 && a.bbox.x + a.bbox.w <= b.bbox.x + b.bbox.w + 1 && a.bbox.y + a.bbox.h <= b.bbox.y + b.bbox.h + 1;
    return tables.filter(t => !((t.rows[0] || []).length === 1 && tables.some(o => inside(o, t))))
      .sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
  }

  /** Fon hiasan yang memetakan glif kepada huruf Latin (cth. AGA Arabesque: "H" dipaparkan sebagai ﷺ). */
  const DECOR_FONTS = [{ re: /arabesque/i, map: { H: '\uFDFA' } }];
  function fixFontGlyphs(glyphs, page) {
    const names = {};
    for (const g of glyphs) {
      if (!(g.font in names)) { let nm = ''; try { nm = (page.commonObjs.get(g.font) || {}).name || ''; } catch (e) { /* */ } names[g.font] = DECOR_FONTS.find(d => d.re.test(nm)) || null; }
      const d = names[g.font];
      if (d && d.map[g.s]) g.s = d.map[g.s];
    }
  }

  async function readPdf(doc, buf, opts) {
    const pdf = await openPdf(doc.file, buf);
    const total = pdf.numPages;
    const maxPages = Math.min(total, opts.maxPages || LIMITS.maxPdfPages);
    if (maxPages < total) doc.warnings.push(`PDF mempunyai ${total} halaman; hanya ${maxPages} halaman pertama dibaca.`);
    doc.numPages = total;
    const noText = [], inlineImgPages = [];
    for (let n = 1; n <= maxPages; n++) {
      const page = await pdf.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent({ disableNormalization: true });
      const raw = tc.items.map(it => it.str || '').join('');
      const hasText = /\S/.test(raw);
      let lines = [], tables = [], rtlPage = false;
      if (hasText) {
        const glyphMode = opts.pdfMode !== 'textContent';
        if (glyphMode) {
          const ol = await page.getOperatorList();
          const { glyphs, rules, images } = interpretOps(ol, page, vp);
          fixFontGlyphs(glyphs, page);
          ({ lines, rtlPage } = buildLines(glyphs, rules, images));
          if (opts.pdfTables !== false) tables = detectTables(rules, lines, n, rtlPage);
        } else {
          // Laluan ringkas (ujian/perbandingan): item getTextContent pdf.js.
          const gl = tc.items.filter(it => it.str).map((it, i) => {
            const m = mul(it.transform, vp.transform);
            return { s: it.str, x0: m[4], x1: m[4] + it.width, y: m[5], h: it.height || Math.hypot(m[2], m[3]), dx: 1, dy: 0, sp: !/\S/.test(it.str), seq: i };
          });
          ({ lines, rtlPage } = buildLines(gl, []));
        }
      } else noText.push(n);
      page.cleanup();
      const text = lines.map(l => l.text).join('\n');
      const imgWords = (text.match(/\uFFFC/g) || []).length;
      if (imgWords) inlineImgPages.push(`${n} (${imgWords})`);
      doc.pages.push({ n, text, hasText, width: round1(vp.width), height: round1(vp.height), dir: rtlPage ? 'rtl' : 'ltr', lines, inlineImages: imgWords });
      lines.forEach(l => doc.paragraphs.push({ text: l.text, dir: l.dir, page: n }));
      tables.forEach(t => doc.tables.push(t));
      if (opts.onProgress) opts.onProgress({ phase: 'pdf', done: n, total: maxPages });
    }
    doc.scanned = noText.length > 0 && noText.length >= Math.ceil(maxPages / 2);
    if (noText.length) {
      doc.warnings.push(doc.scanned
        ? `PDF ini kelihatan seperti imej imbasan (${noText.length}/${maxPages} halaman tiada lapisan teks). Teks perlu dibaca melalui OCR atau AI.`
        : `Halaman tanpa lapisan teks (imbasan): ${compactRanges(noText)}. Halaman ini perlu OCR/AI.`);
    }
    doc.pagesWithoutText = noText;
    if (inlineImgPages.length) doc.warnings.push(`Sebahagian perkataan dalam PDF ini ialah GAMBAR, bukan teks (ditanda ${IMAGE_PLACEHOLDER} dalam teks). Halaman (bilangan): ${inlineImgPages.join(', ')}. Perkataan itu perlu disemak/diisi melalui OCR, AI atau secara manual.`);
    doc.text = doc.pages.map(p => p.text).join('\n\n');
  }
  function compactRanges(ns) {
    const out = []; let a = null, b = null;
    for (const n of ns) { if (a == null) { a = b = n; } else if (n === b + 1) b = n; else { out.push(a === b ? `${a}` : `${a}–${b}`); a = b = n; } }
    if (a != null) out.push(a === b ? `${a}` : `${a}–${b}`);
    return out.join(', ');
  }

  // ---------------------------------------------------------------------------
  // XML (DOCX / PPTX)
  // ---------------------------------------------------------------------------
  function parseXml(str) {
    const d = new DOMParser().parseFromString(str, 'application/xml');
    if (d.getElementsByTagName('parsererror').length) throw new Error('XML rosak dalam fail Office.');
    return d;
  }
  const kids = el => Array.prototype.filter.call(el.childNodes, n => n.nodeType === 1);
  const child = (el, name) => el && kids(el).find(k => k.localName === name) || null;
  const attr = (el, name) => {
    if (!el) return null;
    for (const a of el.attributes) if (a.localName === name) return a.value;
    return null;
  };
  const onOff = el => { if (!el) return false; const v = attr(el, 'val'); return v == null || !/^(0|false|off)$/i.test(v); };

  async function zipText(zip, path) { const f = zip.file(path); return f ? f.async('string') : null; }
  function relsMap(xmlStr, baseDir) {
    const map = {};
    if (!xmlStr) return map;
    const d = parseXml(xmlStr);
    for (const r of d.getElementsByTagName('Relationship')) {
      let t = r.getAttribute('Target') || '';
      if (r.getAttribute('TargetMode') === 'External') { map[r.getAttribute('Id')] = { external: t, type: r.getAttribute('Type') }; continue; }
      if (t.startsWith('/')) t = t.slice(1); else t = normPath(baseDir + t);
      map[r.getAttribute('Id')] = { path: t, type: r.getAttribute('Type') || '' };
    }
    return map;
  }
  function normPath(p) {
    const out = [];
    for (const s of p.split('/')) { if (s === '..') out.pop(); else if (s && s !== '.') out.push(s); }
    return out.join('/');
  }

  const WINGDINGS = { F0FC: '✓', F0FB: '✗', F0FE: '☑', F0FD: '☒', F0A8: '☐', F06F: '☐', F06E: '■', F0A7: '▪', F09F: '•', F0D8: '➢', F0E8: '➔' };

  // Imej terbenam (dengan had)
  async function collectImages(zip, prefix, doc) {
    const files = Object.keys(zip.files).filter(p => p.startsWith(prefix) && /\.(png|jpe?g|gif|webp|bmp)$/i.test(p)).sort();
    let total = 0, skipped = 0;
    for (const p of files) {
      if (doc.images.length >= LIMITS.maxEmbeddedImages) { skipped++; continue; }
      const f = zip.file(p);
      const u8 = await f.async('uint8array');
      if (u8.length > LIMITS.maxEmbeddedBytes || total + u8.length > LIMITS.maxEmbeddedTotal) { skipped++; continue; }
      total += u8.length;
      const ext = p.split('.').pop().toLowerCase();
      const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      const dataUrl = await readAsDataURL(new Blob([u8], { type: mime }));
      const dim = await imageSize(dataUrl).catch(() => ({ width: 0, height: 0 }));
      doc.images.push({ name: p.split('/').pop(), dataUrl, width: dim.width, height: dim.height, embedded: true });
    }
    if (skipped) doc.warnings.push(`${skipped} imej terbenam tidak diambil (had saiz/bilangan).`);
  }

  // ---------------------------------------------------------------------------
  // DOCX
  // ---------------------------------------------------------------------------
  async function readDocx(doc, buf, opts) {
    const JSZipLib = need('JSZip', 'ZIP (JSZip)');
    const zip = await JSZipLib.loadAsync(buf);
    const main = await zipText(zip, 'word/document.xml');
    if (!main) throw new Error('Fail DOCX tidak sah (word/document.xml tiada).');
    // Gaya: id → {name, bidi, basedOn}
    const styles = {};
    const stylesXml = await zipText(zip, 'word/styles.xml');
    if (stylesXml) {
      const sd = parseXml(stylesXml);
      for (const s of sd.getElementsByTagNameNS('*', 'style')) {
        if (attr(s, 'type') !== 'paragraph') continue;
        const ppr = child(s, 'pPr');
        styles[attr(s, 'styleId')] = { name: attr(child(s, 'name'), 'val') || attr(s, 'styleId'), bidi: ppr ? (child(ppr, 'bidi') ? onOff(child(ppr, 'bidi')) : null) : null, basedOn: attr(child(s, 'basedOn'), 'val') };
      }
    }
    const styleBidi = id => { for (let i = 0; id && styles[id] && i < 10; i++) { if (styles[id].bidi != null) return styles[id].bidi; id = styles[id].basedOn; } return null; };

    const d = parseXml(main);
    const body = d.getElementsByTagNameNS('*', 'body')[0];
    const paragraphs = [];
    const tables = [];

    function runText(el, out, boxes) {
      for (const n of kids(el)) {
        const ln = n.localName;
        if (ln === 't') out.push(n.textContent);
        else if (ln === 'tab' || ln === 'ptab') out.push('\t');
        else if (ln === 'br' || ln === 'cr') out.push('\n');
        else if (ln === 'noBreakHyphen') out.push('-');
        else if (ln === 'softHyphen') { /* abaikan */ }
        else if (ln === 'sym') { const c = (attr(n, 'char') || '').toUpperCase(); out.push(WINGDINGS[c] || (/^[0-9A-F]{4}$/.test(c) && !c.startsWith('F0') ? String.fromCharCode(parseInt(c, 16)) : '')); }
        else if (ln === 'delText' || ln === 'instrText' || ln === 'del' || ln === 'rPr' || ln === 'pPr' || ln === 'moveFrom') { /* abaikan */ }
        else if (ln === 'txbxContent') boxes.push(n);
        else if (ln === 'AlternateContent') { const ch = child(n, 'Choice') || child(n, 'Fallback'); if (ch) runText(ch, out, boxes); }
        else if (ln === 'Fallback') { /* sudah diambil daripada Choice */ }
        else runText(n, out, boxes); // r, hyperlink, ins, smartTag, fldSimple, sdt/sdtContent, drawing, …
      }
    }
    function paraInfo(p, extra) {
      const out = [], boxes = [];
      runText(p, out, boxes);
      const text = out.join('').replace(/\u00A0/g, ' ');
      const ppr = child(p, 'pPr');
      const styleId = attr(child(ppr, 'pStyle'), 'val');
      const b = ppr && child(ppr, 'bidi');
      let dir = b ? (onOff(b) ? 'rtl' : 'ltr') : (styleBidi(styleId) ? 'rtl' : null);
      if (!dir) dir = dirOf(text);
      const para = Object.assign({ text: text.replace(/[ \t]+$/g, ''), dir }, extra || {});
      if (styleId) para.style = (styles[styleId] && styles[styleId].name) || styleId;
      return { para, boxes };
    }
    /** Jalan blok dalam susunan dokumen. Perenggan ditambah ke `paragraphs` mengikut susunan; pulangkan senarai blok. */
    function walkBlocks(el, cellCtx) {
      const blocks = [];
      for (const n of kids(el)) {
        const ln = n.localName;
        if (ln === 'p') {
          const { para, boxes } = paraInfo(n, cellCtx);
          paragraphs.push(para); blocks.push({ para });
          for (const bx of boxes) blocks.push(...walkBlocks(bx, Object.assign({ textbox: true }, cellCtx || {})));
        } else if (ln === 'tbl') blocks.push({ table: readTable(n, cellCtx) });
        else if (ln === 'sdt') blocks.push(...walkBlocks(child(n, 'sdtContent') || n, cellCtx));
        else if (ln === 'customXml' || ln === 'ins' || ln === 'smartTag') blocks.push(...walkBlocks(n, cellCtx));
      }
      return blocks;
    }
    function readTable(tbl, parentCtx) {
      const ti = tables.length;
      const tblPr = child(tbl, 'tblPr');
      const table = { source: 'docx', rows: [], merges: [], dir: tblPr && child(tblPr, 'bidiVisual') && onOff(child(tblPr, 'bidiVisual')) ? 'rtl' : 'ltr' };
      if (parentCtx && parentCtx.cell) table.parent = parentCtx.cell;
      tables.push(table);
      const grid = [];
      const vOrigin = {}; // lajur → {r, text, merge}
      const trs = [];
      for (const k of kids(tbl)) {
        if (k.localName === 'tr') trs.push(k);
        else if (k.localName === 'sdt' || k.localName === 'customXml') kids(child(k, 'sdtContent') || k).filter(x => x.localName === 'tr').forEach(tr => trs.push(tr));
      }
      trs.forEach((tr, r) => {
        const row = [];
        const trPr = child(tr, 'trPr');
        let col = +(attr(child(trPr, 'gridBefore'), 'val') || 0);
        for (let i = 0; i < col; i++) row.push('');
        const tcs = [];
        for (const k of kids(tr)) {
          if (k.localName === 'tc') tcs.push(k);
          else if (k.localName === 'sdt' || k.localName === 'customXml') kids(child(k, 'sdtContent') || k).filter(x => x.localName === 'tc').forEach(x => tcs.push(x));
        }
        for (const tc of tcs) {
          const tcPr = child(tc, 'tcPr');
          const span = Math.max(1, +(attr(child(tcPr, 'gridSpan'), 'val') || 1));
          const vm = child(tcPr, 'vMerge');
          const vmVal = vm ? (attr(vm, 'val') || 'continue') : null;
          const hm = child(tcPr, 'hMerge');
          const blocks = walkBlocks(tc, { cell: { t: ti, r, c: col } });
          const parts = blocks.map(b => (b.table
            ? b.table.rows.map(rw => uniq(rw).filter(Boolean).join(' | ')).filter(Boolean).join('\n')
            : b.para.text));
          let text = cleanText(parts.join('\n').replace(/\n{3,}/g, '\n\n'));
          if (hm && (attr(hm, 'val') || 'continue') === 'continue' && row.length) {
            // hMerge (format lama): sambungan sel di kiri
            const left = row[row.length - 1];
            for (let i = 0; i < span; i++) row.push(left);
            const m = table.merges.find(mm => mm.r === r && mm.c + mm.colSpan === col);
            if (m) m.colSpan += span; else table.merges.push({ r, c: col - 1, rowSpan: 1, colSpan: span + 1 });
            col += span; continue;
          }
          if (vmVal === 'continue' && vOrigin[col]) {
            const o = vOrigin[col];
            text = o.text;
            o.merge.rowSpan = r - o.r + 1;
          } else if (vmVal === 'restart') {
            const merge = { r, c: col, rowSpan: 1, colSpan: span };
            vOrigin[col] = { r, text, merge };
            table.merges.push(merge);
          } else {
            delete vOrigin[col];
            if (span > 1) table.merges.push({ r, c: col, rowSpan: 1, colSpan: span });
          }
          for (let i = 0; i < span; i++) row.push(text);
          col += span;
        }
        grid.push(row);
      });
      table.merges = table.merges.filter(m => m.rowSpan > 1 || m.colSpan > 1);
      const width = Math.max(0, ...grid.map(rw => rw.length));
      table.rows = grid.map(rw => rw.concat(new Array(width - rw.length).fill('')));
      return table;
    }

    walkBlocks(body, null);
    doc.paragraphs = paragraphs.filter(p => /\S/.test(p.text));
    doc.tables = tables;
    doc.text = paragraphs.map(p => p.text).join('\n');
    if (opts.images !== false) await collectImages(zip, 'word/media/', doc);
  }
  const uniq = arr => arr.filter((v, i) => i === 0 || v !== arr[i - 1]);

  // ---------------------------------------------------------------------------
  // PPTX
  // ---------------------------------------------------------------------------
  async function readPptx(doc, buf, opts) {
    const JSZipLib = need('JSZip', 'ZIP (JSZip)');
    const zip = await JSZipLib.loadAsync(buf);
    const pres = await zipText(zip, 'ppt/presentation.xml');
    if (!pres) throw new Error('Fail PPTX tidak sah (ppt/presentation.xml tiada).');
    const rels = relsMap(await zipText(zip, 'ppt/_rels/presentation.xml.rels'), 'ppt/');
    const pd = parseXml(pres);
    let slidePaths = [];
    for (const s of pd.getElementsByTagNameNS('*', 'sldId')) {
      const rid = attr(s, 'id') && [...s.attributes].find(a => a.localName === 'id' && a.prefix === 'r');
      const r = rid ? rels[rid.value] : null;
      if (r && r.path) slidePaths.push(r.path);
    }
    if (!slidePaths.length) slidePaths = Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);

    const paraText = p => {
      const out = [];
      (function walk(el) {
        for (const n of kids(el)) {
          if (n.localName === 't') out.push(n.textContent);
          else if (n.localName === 'br') out.push('\n');
          else if (n.localName !== 'pPr' && n.localName !== 'rPr' && n.localName !== 'endParaRPr') walk(n);
        }
      })(p);
      return out.join('').replace(/\u00A0/g, ' ');
    };
    const txBodyParas = (tx, slide, extra) => kids(tx).filter(k => k.localName === 'p').map(p => {
      const text = paraText(p);
      const ppr = child(p, 'pPr');
      const rtlAttr = ppr ? attr(ppr, 'rtl') : null;
      const dir = rtlAttr === '1' || rtlAttr === 'true' ? 'rtl' : (rtlAttr === '0' ? (dirOf(text) === 'rtl' && !RE_LATIN_LETTER.test(text) ? 'rtl' : 'ltr') : dirOf(text));
      return Object.assign({ text, dir, slide }, extra || {});
    });

    for (let si = 0; si < slidePaths.length; si++) {
      const slideNo = si + 1;
      const xml = await zipText(zip, slidePaths[si]);
      if (!xml) continue;
      const sd = parseXml(xml);
      const tree = sd.getElementsByTagNameNS('*', 'spTree')[0];
      if (!tree) continue;
      const walkShapes = el => {
        for (const n of kids(el)) {
          const ln = n.localName;
          if (ln === 'sp') {
            const tx = child(n, 'txBody');
            if (tx) txBodyParas(tx, slideNo).forEach(p => doc.paragraphs.push(p));
          } else if (ln === 'grpSp') walkShapes(n);
          else if (ln === 'graphicFrame') {
            const tbl = n.getElementsByTagNameNS('*', 'tbl')[0];
            if (tbl) readPptTable(tbl, slideNo);
          } else if (ln === 'AlternateContent') { const ch = child(n, 'Choice') || child(n, 'Fallback'); if (ch) walkShapes(ch); }
        }
      };
      const readPptTable = (tbl, slideNo) => {
        const ti = doc.tables.length;
        const tblPr = child(tbl, 'tblPr');
        const table = { source: 'pptx', slide: slideNo, rows: [], merges: [], dir: tblPr && /^(1|true)$/.test(attr(tblPr, 'rtl') || '') ? 'rtl' : 'ltr' };
        doc.tables.push(table);
        const trs = kids(tbl).filter(k => k.localName === 'tr');
        const grid = trs.map(() => []);
        trs.forEach((tr, r) => {
          const tcs = kids(tr).filter(k => k.localName === 'tc');
          tcs.forEach((tc, c) => {
            const tx = child(tc, 'txBody');
            const ps = tx ? txBodyParas(tx, slideNo, { cell: { t: ti, r, c } }) : [];
            ps.forEach(p => doc.paragraphs.push(p));
            const text = cleanText(ps.map(p => p.text).join('\n'));
            const gs = +(attr(tc, 'gridSpan') || 1), rs = +(attr(tc, 'rowSpan') || 1);
            const hMerge = attr(tc, 'hMerge') === '1' || attr(tc, 'hMerge') === 'true';
            const vMerge = attr(tc, 'vMerge') === '1' || attr(tc, 'vMerge') === 'true';
            grid[r][c] = { text, gs, rs, hMerge, vMerge };
          });
        });
        // Isi sel sambungan dengan teks sel asal
        const rows = grid.map(row => row.map(cell => (cell ? cell.text : '')));
        grid.forEach((row, r) => row.forEach((cell, c) => {
          if (!cell) return;
          if (!cell.hMerge && !cell.vMerge && (cell.gs > 1 || cell.rs > 1)) {
            table.merges.push({ r, c, rowSpan: cell.rs, colSpan: cell.gs });
            for (let dr = 0; dr < cell.rs; dr++) for (let dc = 0; dc < cell.gs; dc++) if (rows[r + dr] && c + dc < rows[r + dr].length) rows[r + dr][c + dc] = cell.text;
          }
        }));
        const width = Math.max(0, ...rows.map(r => r.length));
        table.rows = rows.map(r => r.concat(new Array(width - r.length).fill('')));
      };
      walkShapes(tree);
    }
    doc.numSlides = slidePaths.length;
    doc.paragraphs = doc.paragraphs.filter(p => /\S/.test(p.text));
    doc.text = doc.paragraphs.map(p => p.text).join('\n');
    if (opts.images !== false) await collectImages(zip, 'ppt/media/', doc);
  }

  // ---------------------------------------------------------------------------
  // XLSX / XLS / CSV (SheetJS)
  // ---------------------------------------------------------------------------
  const pad2 = n => String(n).padStart(2, '0');
  function cellValue(cell, XLSXLib) {
    if (!cell) return '';
    if (cell.t === 'd' && cell.v instanceof Date) { const d = cell.v; return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
    if (cell.t === 'n') {
      const fmt = cell.z || '';
      if (fmt && XLSXLib.SSF.is_date(fmt)) {
        const p = XLSXLib.SSF.parse_date_code(cell.v);
        if (p) {
          const hasDate = cell.v >= 1, hasTime = /[hs]/i.test(fmt.replace(/"[^"]*"/g, '')) && (p.H || p.M || p.S || !hasDate);
          const date = `${p.y}-${pad2(p.m)}-${pad2(p.d)}`, time = `${pad2(p.H)}:${pad2(p.M)}`;
          return hasDate ? (hasTime ? `${date} ${time}` : date) : time;
        }
      }
      return cell.v;
    }
    if (cell.t === 'b') return cell.v ? 'TRUE' : 'FALSE';
    if (cell.t === 'e') return cell.w || '#ERR';
    if (cell.t === 'z') return '';
    return cell.v == null ? '' : String(cell.v);
  }
  async function readSheet(doc, buf, opts) {
    const XLSXLib = need('XLSX', 'Excel (SheetJS)');
    let wb;
    if (doc.kind === 'csv') {
      const text = decodeText(buf);
      const sep = doc.ext === '.tsv' ? '\t' : undefined;
      wb = XLSXLib.read(text, { type: 'string', raw: true, FS: sep, dense: false });
    } else {
      wb = XLSXLib.read(new Uint8Array(buf), { type: 'array', cellNF: true, cellDates: false, cellText: false, dense: false });
    }
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      if (!ws || !ws['!ref']) { doc.sheets.push({ name, rows: [], merges: [] }); continue; }
      const range = XLSXLib.utils.decode_range(ws['!ref']);
      const rows = [];
      for (let r = range.s.r; r <= range.e.r; r++) {
        const row = [];
        for (let c = range.s.c; c <= range.e.c; c++) row.push(cellValue(ws[XLSXLib.utils.encode_cell({ r, c })], XLSXLib));
        rows.push(row);
      }
      // Pangkas baris/lajur kosong di hujung
      while (rows.length && rows[rows.length - 1].every(v => v === '')) rows.pop();
      let width = 0; rows.forEach(rw => { for (let c = rw.length - 1; c >= 0; c--) if (rw[c] !== '') { width = Math.max(width, c + 1); break; } });
      rows.forEach((rw, i) => { rows[i] = rw.slice(0, width); });
      const merges = (ws['!merges'] || []).map(m => ({ r: m.s.r - range.s.r, c: m.s.c - range.s.c, rowSpan: m.e.r - m.s.r + 1, colSpan: m.e.c - m.s.c + 1 }));
      doc.sheets.push({ name, rows, merges });
      // Jadual seragam: teks rentetan, sel bergabung diulang.
      const trows = rows.map(rw => rw.map(v => (v === '' || v == null ? '' : String(v))));
      for (const m of merges) {
        const v = (trows[m.r] || [])[m.c] || '';
        for (let dr = 0; dr < m.rowSpan; dr++) for (let dc = 0; dc < m.colSpan; dc++) if (trows[m.r + dr] && m.c + dc < trows[m.r + dr].length) trows[m.r + dr][m.c + dc] = v;
      }
      doc.tables.push({ source: 'sheet', sheet: name, rows: trows, merges });
      trows.forEach((rw, r) => { const t = rw.filter(Boolean).join('\t'); if (t) doc.paragraphs.push({ text: t, dir: dirOf(t), sheet: name, row: r }); });
    }
    doc.text = doc.sheets.map(s => `# ${s.name}\n` + s.rows.map(rw => rw.join('\t')).join('\n')).join('\n\n');
  }

  // ---------------------------------------------------------------------------
  // Imej, TXT, JSON
  // ---------------------------------------------------------------------------
  function imageSize(src) {
    return new Promise((res, rej) => { const im = new Image(); im.onload = () => res({ width: im.naturalWidth, height: im.naturalHeight }); im.onerror = () => rej(new Error('Imej tidak dapat dibaca.')); im.src = src; });
  }
  async function readImage(doc, buf) {
    const ext = doc.ext.slice(1);
    const mime = doc.mime || (ext === 'jpg' ? 'image/jpeg' : ext ? `image/${ext}` : 'image/png');
    const dataUrl = await readAsDataURL(new Blob([buf], { type: mime }));
    let dim;
    try { dim = await imageSize(dataUrl); }
    catch (e) { throw new Error(`Format imej tidak disokong oleh pelayar (${doc.ext || mime}). Simpan semula sebagai PNG atau JPG.`); }
    doc.images.push({ name: doc.name, dataUrl, width: dim.width, height: dim.height });
    doc.scanned = true; // tiada lapisan teks — perlu OCR/AI
    doc.warnings.push('Imej tiada lapisan teks. Gunakan OCR (luar talian, jika tersedia) atau AI untuk membaca kandungannya.');
  }
  function readTxt(doc, buf) {
    const text = decodeText(buf).replace(/\r\n?/g, '\n');
    doc.text = text;
    doc.paragraphs = text.split('\n').map(t => ({ text: t, dir: dirOf(t) }));
  }
  function readJson(doc, buf) {
    const text = decodeText(buf);
    doc.text = text;
    try { doc.json = JSON.parse(text.replace(/^\uFEFF/, '')); }
    catch (e) { doc.warnings.push(`JSON tidak sah: ${e.message}`); }
    doc.paragraphs = text.split(/\r?\n/).map(t => ({ text: t, dir: dirOf(t) }));
  }

  // ---------------------------------------------------------------------------
  // API awam
  // ---------------------------------------------------------------------------
  /**
   * Baca satu fail → Doc.
   * @param {File|Blob} file  (Blob mesti ada .name)
   * @param {{onProgress?:Function, maxPages?:number, images?:boolean, pdfTables?:boolean, pdfMode?:'glyph'|'textContent'}} [opts]
   */
  async function read(file, opts) {
    opts = opts || {};
    if (!file) throw new Error('Tiada fail dipilih.');
    const t0 = (window.performance || Date).now();
    const doc = newDoc(file);
    const buf = await readAsArrayBuffer(file);
    if (!buf.byteLength) throw new Error(`Fail "${doc.name}" kosong.`);
    const sniffed = await sniff(buf);
    if (doc.kind === 'unknown' || (sniffed && sniffed !== doc.kind && !(doc.kind === 'csv' || doc.kind === 'txt' || doc.kind === 'json'))) {
      if (sniffed) { if (doc.kind !== 'unknown') doc.warnings.push(`Sambungan fail ${doc.ext} tidak sepadan dengan kandungan; dibaca sebagai ${sniffed.toUpperCase()}.`); doc.kind = sniffed; }
    }
    if (doc.ext === '.doc' || doc.ext === '.ppt') throw new Error(`Format lama ${doc.ext} tidak disokong. Buka dalam Word/PowerPoint dan "Simpan Sebagai" ${doc.ext}x, kemudian cuba lagi.`);
    if (/^\.(heic|heif)$/.test(doc.ext)) throw new Error('Format HEIC (foto iPhone) tidak disokong oleh pelayar. Tukar kepada JPG (cth. hantar sebagai "Most Compatible") dan cuba lagi.');
    switch (doc.kind) {
      case 'pdf': await readPdf(doc, buf, opts); break;
      case 'docx': await readDocx(doc, buf, opts); break;
      case 'pptx': await readPptx(doc, buf, opts); break;
      case 'xlsx': case 'csv': await readSheet(doc, buf, opts); break;
      case 'image': await readImage(doc, buf); break;
      case 'txt': readTxt(doc, buf); break;
      case 'json': readJson(doc, buf); break;
      default:
        throw new Error(`Jenis fail tidak disokong: ${doc.ext || '(tiada sambungan)'}. Jenis yang disokong: ${SUPPORTED.join(', ')}.`);
    }
    // Normalkan bentuk persembahan Arab bagi semua jenis (DOCX/PPTX kadangkala mengandunginya).
    if (doc.kind !== 'pdf') {
      if (/[\uFB50-\uFDF9\uFDFB-\uFDFF\uFE70-\uFEFF]/.test(doc.text)) {
        doc.paragraphs.forEach(p => { p.text = normalizeArabic(p.text); });
        doc.tables.forEach(t => { t.rows = t.rows.map(r => r.map(c => normalizeArabic(c))); });
        doc.text = normalizeArabic(doc.text);
      }
    }
    const lj = detectLegacyJawi(doc.text);
    doc.legacyJawi = lj.legacy;
    doc.jawiStats = lj;
    if (lj.legacy) doc.warnings.push(`Teks Jawi menggunakan ejaan fon lama (cth. غ untuk ڠ, ف untuk ڤ): ${lj.legacyWords} perkataan dikesan. Penukaran ke Jawi Unicode standard dibuat semasa import.`);
    if (!doc.text.trim() && !doc.images.length && doc.kind !== 'pdf') doc.warnings.push('Tiada teks ditemui dalam fail ini.');
    doc.ms = Math.round((window.performance || Date).now() - t0);
    return doc;
  }

  /** Render satu halaman PDF → data URL PNG (untuk OCR / AI). */
  async function renderPdfPage(fileOrDoc, pageNo, scale) {
    const file = fileOrDoc && fileOrDoc.file ? fileOrDoc.file : fileOrDoc;
    if (!file) throw new Error('Tiada fail PDF.');
    const pdf = await openPdf(file);
    if (pageNo < 1 || pageNo > pdf.numPages) throw new Error(`Halaman ${pageNo} tiada (PDF ada ${pdf.numPages} halaman).`);
    const page = await pdf.getPage(pageNo);
    let s = scale || 2;
    let vp = page.getViewport({ scale: s });
    if (vp.width * vp.height > LIMITS.maxRenderPixels) { s *= Math.sqrt(LIMITS.maxRenderPixels / (vp.width * vp.height)); vp = page.getViewport({ scale: s }); }
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const url = canvas.toDataURL('image/png');
    canvas.width = canvas.height = 0;
    page.cleanup();
    return url;
  }

  /** Lepaskan cache PDF bagi fail (selepas import selesai). */
  function release(fileOrDoc) {
    const file = fileOrDoc && fileOrDoc.file ? fileOrDoc.file : fileOrDoc;
    const p = file && pdfCache.get(file);
    if (p) { pdfCache.delete(file); p.then(pdf => pdf.destroy()).catch(() => {}); }
  }

  // ---------------------------------------------------------------------------
  // OCR luar talian (Tesseract.js 7, dimuat malas daripada assets/vendor/ocr/ — lihat _build.mjs)
  //  - Aset dimuat dengan <script> (dibenarkan pada file://) hanya apabila OCR mula-mula digunakan.
  //  - Worker = Blob [shim fetch traineddata + teras wasm (base64 terbenam) + worker.min.js] → new Worker(blob:).
  //    Tiada fetch fail tempatan, tiada importScripts, tiada IndexedDB, tiada rangkaian.
  // ---------------------------------------------------------------------------
  const OCR_LANGS = ['eng', 'msa', 'ara'];
  const OCR_BASE = (() => {
    try { const src = document.currentScript && document.currentScript.src; if (src) return new URL('../../assets/vendor/ocr/', src).href; } catch (e) { /* */ }
    return 'assets/vendor/ocr/';
  })();
  const ocrState = { failed: null, loading: {}, worker: null, key: '', idle: null, onProgress: null, queue: Promise.resolve() };
  const OCR_UNAVAILABLE = 'OCR luar talian tidak tersedia pada pelayar/pemasangan ini. Gunakan ciri AI (kunci API Gemini percuma) untuk membaca imej/imbasan.';
  const ocrEnvOk = () => typeof Worker === 'function' && typeof WebAssembly === 'object' && typeof Blob === 'function' && !!(window.URL && URL.createObjectURL);
  function ocrAvailable() { return ocrEnvOk() && !ocrState.failed; }
  function loadScript(src) {
    return new Promise((res, rej) => {
      const el = document.createElement('script');
      el.src = src; el.async = false;
      el.onload = () => res(); el.onerror = () => rej(new Error(`Aset OCR tiada: ${src.split('/').pop()}`));
      document.head.appendChild(el);
    });
  }
  // Ujian WebAssembly SIMD (sama seperti wasm-feature-detect)
  const hasSimd = () => { try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); } catch (e) { return false; } };
  async function ocrLoad(langs) {
    if (!ocrEnvOk()) throw new Error(OCR_UNAVAILABLE);
    const R = () => window.RPH_OCR || {};
    const files = [];
    if (!window.Tesseract) files.push('tesseract.min.js');
    if (!R().worker) files.push('ocr-worker.js');
    if (!R().core) files.push(hasSimd() ? 'ocr-core-simd.js' : 'ocr-core.js');
    for (const l of langs) if (!(R().lang || {})[l]) files.push(`ocr-lang-${l}.js`);
    for (const f of files) {
      if (!ocrState.loading[f]) ocrState.loading[f] = loadScript(OCR_BASE + f);
      try { await ocrState.loading[f]; }
      catch (e) {
        delete ocrState.loading[f];
        if (!/^ocr-lang-/.test(f)) ocrState.failed = `${OCR_UNAVAILABLE} (${e.message})`;
        throw new Error(/^ocr-lang-/.test(f) ? `Data bahasa OCR "${f.slice(9, -3)}" tiada (${e.message}).` : ocrState.failed);
      }
    }
  }
  function ocrShim(langs) {
    const data = {};
    langs.forEach(l => { data[l] = window.RPH_OCR.lang[l]; });
    // Mesej makluman Tesseract (cth. "Estimating resolution as 138") dicetak sebagai console.error — disenyapkan.
    return '(function(){var q=/^(Estimating resolution|Detected \\d+ diacritics|Warning: Invalid resolution|Empty page)/;' +
      '["error","warn","log"].forEach(function(k){var o=console[k].bind(console);console[k]=function(a){if(typeof a==="string"&&q.test(a))return;return o.apply(null,arguments);};});})();' +
      'self.__RPH_LANG=' + JSON.stringify(data) + ';(function(){var of=self.fetch?self.fetch.bind(self):null;' +
      'self.fetch=function(u,o){var m=/\\/([a-z_]+)\\.traineddata(\\.gz)?$/.exec(String(u));' +
      'if(m&&self.__RPH_LANG[m[1]]){var b=atob(self.__RPH_LANG[m[1]]),a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);' +
      'return Promise.resolve(new Response(a,{status:200}));}' +
      'return of?of(u,o):Promise.reject(new Error("luar talian"));};})();\n';
  }
  async function ocrWorker(langs) {
    const key = langs.join('+');
    if (ocrState.worker && ocrState.key === key) return ocrState.worker;
    await ocrTerminate();
    await ocrLoad(langs);
    const O = window.RPH_OCR;
    const url = URL.createObjectURL(new Blob([ocrShim(langs), O.core, '\n;\n', O.worker], { type: 'application/javascript' }));
    try {
      ocrState.worker = await window.Tesseract.createWorker(langs, 1 /* OEM LSTM */, {
        workerPath: url, workerBlobURL: false, corePath: 'tesseract-core-lstm.wasm.js',
        langPath: 'https://luar-talian.invalid/tessdata', cacheMethod: 'none', gzip: true,
        logger: m => { if (ocrState.onProgress) { try { ocrState.onProgress({ status: m.status, progress: m.progress }); } catch (e) { /* */ } } },
        errorHandler: () => {},
      });
      ocrState.key = key;
    } catch (e) {
      ocrState.failed = `${OCR_UNAVAILABLE} (${e && e.message ? e.message : e})`;
      throw new Error(ocrState.failed);
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
    return ocrState.worker;
  }
  async function ocrTerminate() {
    clearTimeout(ocrState.idle);
    const w = ocrState.worker; ocrState.worker = null; ocrState.key = '';
    if (w) { try { await w.terminate(); } catch (e) { /* */ } }
  }
  /** Muat & mulakan OCR lebih awal (cth. semasa guru memilih imej). Pulangkan true jika sedia. */
  function ocrPrepare(langs) {
    const ls = (langs || ['eng', 'msa']).filter(l => OCR_LANGS.includes(l));
    const p = ocrState.queue.then(() => ocrWorker(ls)).then(() => true, () => false);
    ocrState.queue = p;
    return p;
  }
  /**
   * OCR satu imej (data URL, kanvas, Blob/File, <img>, ImageBitmap, atau Doc imej).
   * @param {*} input
   * @param {{langs?:string[], psm?:number, onProgress?:Function}} [opts]  langs lalai ['eng','msa']; tambah 'ara' untuk Arab/Jawi
   * @returns {Promise<{text, lines:[{text,bbox,confidence,dir}], words:[{text,bbox,confidence}], confidence, langs, ms}>}
   */
  function ocr(input, opts) {
    opts = opts || {};
    const langs = (opts.langs || ['eng', 'msa']).filter(l => OCR_LANGS.includes(l));
    const run = async () => {
      if (!langs.length) throw new Error(`Bahasa OCR tidak disokong. Pilih daripada: ${OCR_LANGS.join(', ')}.`);
      if (!ocrAvailable()) throw new Error(ocrState.failed || OCR_UNAVAILABLE);
      const t0 = (window.performance || Date).now();
      let img = input;
      if (img && img.kind && Array.isArray(img.images)) {
        if (!img.images.length) throw new Error(img.kind === 'pdf' ? 'Render halaman PDF dahulu (RPH.readers.renderPdfPage), kemudian OCR imej itu.' : 'Tiada imej dalam dokumen ini.');
        img = img.images[0].dataUrl;
      }
      if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) {
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; cv.getContext('2d').drawImage(img, 0, 0); img = cv;
      }
      if (!img) throw new Error('Tiada imej untuk OCR.');
      const w = await ocrWorker(langs);
      clearTimeout(ocrState.idle);
      await w.setParameters({ tessedit_pageseg_mode: String(opts.psm || 3), preserve_interword_spaces: '1' });
      ocrState.onProgress = opts.onProgress || null;
      let r;
      try { r = await w.recognize(img, {}, { text: true, blocks: true }); }
      finally { ocrState.onProgress = null; }
      const lines = [], words = [];
      for (const b of r.data.blocks || []) for (const pg of b.paragraphs || []) for (const ln of pg.lines || []) {
        const t = normalizeArabic(String(ln.text || '').replace(/\s+$/, ''));
        if (t.trim()) lines.push({ text: t, bbox: ln.bbox, confidence: Math.round(ln.confidence), dir: dirOf(t) });
        for (const wd of ln.words || []) words.push({ text: normalizeArabic(wd.text), bbox: wd.bbox, confidence: Math.round(wd.confidence) });
      }
      return { text: normalizeArabic(r.data.text || ''), lines, words, confidence: Math.round(r.data.confidence || 0), langs, ms: Math.round((window.performance || Date).now() - t0) };
    };
    const p = ocrState.queue.then(run, run);
    ocrState.queue = p.catch(() => {}).then(() => { clearTimeout(ocrState.idle); ocrState.idle = setTimeout(ocrTerminate, 120000); });
    return p;
  }

  RPH.readers = {
    supported: SUPPORTED.slice(),
    accept: SUPPORTED.join(','),
    LIMITS,
    read,
    renderPdfPage,
    release,
    normalizeArabic,
    detectLegacyJawi,
    IMAGE_PLACEHOLDER,
    dirOf,
    // OCR luar talian (Tesseract.js, dimuat malas)
    ocrAvailable,
    ocr,
    ocrPrepare,
    ocrTerminate,
    OCR_LANGS: OCR_LANGS.slice(),
    _internal: { buildLines, segmentText, interpretOps, detectTables, looksVisual, sniff },
  };
})(window.RPH = window.RPH || {});
