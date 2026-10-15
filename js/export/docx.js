/* Eksport DOCX sebenar (docx.js v9, global `docx`) — §57, §60–§63.
   Dibina daripada model susun atur yang sama dengan pratonton (RPH.render.model), jadi DOCX
   mencerminkan paparan: A4, jadual native, label di kanan untuk templat RTL (bidiVisual),
   perenggan `bidi` + larian `rtl` untuk Arab/Jawi, larian Latin/nombor diasingkan dengan LRM
   supaya "PAK-21", "TP 5", "28 / 32", "12.40-1.40" tidak terbalik. Fon Noto Naskh Arabic dibenamkan. */
(function (RPH) {
  'use strict';
  const PAGE = { w: 11906, h: 16838, margin: 680, header: 340 }; // twip; 680 ≈ 12 mm
  const CONTENT_W = PAGE.w - 2 * PAGE.margin;
  const FONT_AR = 'Noto Naskh Arabic';
  const FONT_LAT = 'Calibri';
  const FONTS = { ascii: FONT_LAT, hAnsi: FONT_LAT, eastAsia: FONT_LAT, cs: FONT_AR };
  // Bahasa Arab → Traditional Arabic (fon sistem Windows/Office; tidak dibenamkan — lesen Microsoft). Jawi kekal Noto Naskh Arabic.
  const FONT_TRAD = 'Traditional Arabic';
  const FONTS_TRAD = { ascii: FONT_LAT, hAnsi: FONT_LAT, eastAsia: FONT_LAT, cs: FONT_TRAD };
  const FONT_SYM = { ascii: 'Segoe UI Symbol', hAnsi: 'Segoe UI Symbol', eastAsia: 'Segoe UI Symbol', cs: 'Segoe UI Symbol' };
  const LRM = '‎', RLM = '‏';
  // [Latin, skrip kompleks] dalam separuh-poin
  const SZ = { base: [20, 24], sm: [16, 20], lg: [24, 28], week: [22, 26] };
  const CELL_MARGIN = { top: 28, bottom: 28, left: 80, right: 80 };

  function lib() {
    const D = (typeof window !== 'undefined' && window.docx) || (typeof docx !== 'undefined' ? docx : null); // eslint-disable-line no-undef
    if (!D || !D.Document) throw new Error('Pustaka docx tidak dimuatkan (assets/vendor/docx.iife.js).');
    return D;
  }
  function b64(s) {
    if (typeof atob === 'function') {
      const bin = atob(s); const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return u;
    }
    return Uint8Array.from(Buffer.from(s, 'base64')); // eslint-disable-line no-undef
  }
  let fontCache = null;
  function fontBytes() {
    if (fontCache) return fontCache;
    const f = typeof window !== 'undefined' && window.RPH_FONT_TTF;
    if (!f || !f.regular) return null;
    fontCache = b64(f.regular);
    return fontCache;
  }

  // ---------- Imej (logo, data URL) ----------
  function imgSize(type, u) {
    if (type === 'png' && u.length > 24) return { w: ((u[16] << 24) | (u[17] << 16) | (u[18] << 8) | u[19]) >>> 0, h: ((u[20] << 24) | (u[21] << 16) | (u[22] << 8) | u[23]) >>> 0 };
    if (type === 'gif' && u.length > 10) return { w: u[6] | (u[7] << 8), h: u[8] | (u[9] << 8) };
    if (type === 'bmp' && u.length > 26) return { w: u[18] | (u[19] << 8) | (u[20] << 16) | (u[21] << 24), h: Math.abs(u[22] | (u[23] << 8) | (u[24] << 16) | (u[25] << 24)) };
    if (type === 'jpg') {
      let i = 2;
      while (i + 9 < u.length) {
        if (u[i] !== 0xFF) return null;
        const mk = u[i + 1], len = (u[i + 2] << 8) | u[i + 3];
        if (mk >= 0xC0 && mk <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(mk)) return { h: (u[i + 5] << 8) | u[i + 6], w: (u[i + 7] << 8) | u[i + 8] };
        i += 2 + len;
      }
    }
    return null;
  }
  function imageFromDataUrl(url) {
    const m = /^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i.exec(url || '');
    if (!m) return null;
    const type = m[1].toLowerCase().replace('jpeg', 'jpg');
    const data = b64(m[2]);
    const dim = imgSize(type, data) || { w: 100, h: 100 };
    return { type, data, w: dim.w || 100, h: dim.h || 100 };
  }

  // ---------- Teks ----------
  function textRuns(D, b, m, base) {
    const R = RPH.render;
    const out = [];
    const size = b.lg ? SZ.lg : SZ.base;
    for (const r of b.runs) {
      const sz = r.sm ? SZ.sm : size;
      const common = { bold: r.b || undefined, underline: r.u ? { type: D.UnderlineType.SINGLE } : undefined, color: r.muted ? '444444' : undefined, size: sz[0], sizeComplexScript: sz[1] };
      if (r.box) { out.push(new D.TextRun({ ...common, text: r.text, font: FONT_SYM })); continue; }
      for (const sg of R.runSegments(r, base)) {
        if (!sg.text) continue;
        const rtl = base === 'rtl' ? !sg.iso : sg.iso;
        let t = sg.text;
        // Larian diasingkan yang mengandungi aksara neutral/lemah → bungkus dengan tanda arah (LRM/RLM).
        if (sg.iso && /[^\p{L}\p{M}]/u.test(t)) { const mk = base === 'rtl' ? LRM : RLM; t = mk + t + mk; }
        // RPH Inggeris: larian Latin = en-GB (semakan ejaan Word), Arab = ar-SA. Templat lain tidak berubah.
        const lang = m.lang === 'en'
          ? (rtl && sg.script === 'ar' ? (m.arLang === 'ar' ? { value: 'en-GB', bidirectional: 'ar-SA' } : undefined) : { value: 'en-GB' })
          : rtl && sg.script === 'ar' ? (m.arLang === 'ar' ? { value: 'ms-MY', bidirectional: 'ar-SA' } : undefined) : undefined;
        const font = R.arFont(m, sg.text) === 'trad' ? FONTS_TRAD : FONTS;
        // Kotak bilangan kosong (refleksi): larian bersempadan yang boleh ditaip dalam Word.
        t.split(R.NBOX).forEach((piece, i) => {
          if (i) out.push(new D.TextRun({ ...common, text: R.NBOX_FILL, font: FONTS, border: { style: D.BorderStyle.SINGLE, size: 6, color: '000000', space: 0 }, rightToLeft: rtl || undefined }));
          if (piece) out.push(new D.TextRun({
            ...common, text: piece, font,
            rightToLeft: rtl || undefined,
            language: lang,
            noProof: rtl && m.arLang !== 'ar' ? true : undefined, // Jawi: elak semakan ejaan Arab
          }));
        });
      }
    }
    return out;
  }
  function para(D, b, m, cellAlign) {
    const base = RPH.render.baseDir(b, m);
    const align = b.align || cellAlign;
    let alignment;
    if (align === 'center') alignment = D.AlignmentType.CENTER;
    else if (base === 'ltr' && m.dir === 'rtl') alignment = D.AlignmentType.RIGHT;
    // Perenggan bidi tanpa jc → jajar ke permulaan (kanan), seperti dokumen guru.
    return new D.Paragraph({
      children: textRuns(D, b, m, base),
      bidirectional: base === 'rtl' || undefined,
      alignment,
      spacing: { before: 0, after: 0 },
    });
  }
  const emptyPara = (D, half = 2) => new D.Paragraph({ children: [new D.TextRun({ text: '', size: half, sizeComplexScript: half })], spacing: { before: 0, after: 0, line: 120, lineRule: D.LineRuleType ? D.LineRuleType.EXACT : 'exact' } });

  function checksTable(D, b, m, cellW) {
    const n = Math.max(1, Math.min(b.cols || 2, b.items.length || 1));
    const inner = Math.max(600, cellW - CELL_MARGIN.left - CELL_MARGIN.right);
    const cw = Math.floor(inner / n);
    const rows = [];
    for (let i = 0; i < b.items.length; i += n) {
      const slice = b.items.slice(i, i + n);
      while (slice.length < n) slice.push(null);
      rows.push(new D.TableRow({
        cantSplit: true,
        children: slice.map(it => new D.TableCell({
          width: { size: cw, type: D.WidthType.DXA },
          margins: { top: 0, bottom: 0, left: 20, right: 20 },
          children: [it ? para(D, { t: 'p', runs: [{ text: it.on ? '☑' : '☐', box: true }, { text: ' ' + it.label }] }, m) : new D.Paragraph({ children: [] })],
        })),
      }));
    }
    return new D.Table({
      rows, width: { size: cw * n, type: D.WidthType.DXA }, columnWidths: Array(n).fill(cw),
      layout: D.TableLayoutType.FIXED, borders: D.TableBorders.NONE,
      visuallyRightToLeft: m.dir === 'rtl' || undefined,
    });
  }

  function cellOf(D, c, m, colsTw) {
    const w = colsTw.slice(c.col, c.col + c.span).reduce((a, x) => a + x, 0);
    const children = [];
    for (const b of c.blocks) {
      if (b.t === 'checks') { if (b.items.length) children.push(checksTable(D, b, m, w), emptyPara(D)); }
      else children.push(para(D, b, m, c.align));
    }
    if (!children.length) children.push(new D.Paragraph({ children: [] }));
    return new D.TableCell({
      children,
      columnSpan: c.span > 1 ? c.span : undefined,
      rowSpan: c.rowSpan > 1 ? c.rowSpan : undefined,
      width: { size: w, type: D.WidthType.DXA },
      shading: c.fill ? { type: D.ShadingType.CLEAR, color: 'auto', fill: c.fill } : undefined,
      verticalAlign: c.valign === 'center' ? D.VerticalAlignTable.CENTER : D.VerticalAlignTable.TOP,
      margins: CELL_MARGIN,
    });
  }
  function colTwips(cols) {
    const tw = cols.map(p => Math.round((p * CONTENT_W) / 100));
    tw[tw.length - 1] += CONTENT_W - tw.reduce((a, x) => a + x, 0);
    return tw;
  }
  function tableOf(D, m) {
    const colsTw = colTwips(m.cols);
    const line = { style: D.BorderStyle.SINGLE, size: 4, color: '000000' };
    return new D.Table({
      rows: m.rows.map(r => new D.TableRow({ cantSplit: !r.tall || undefined, children: r.cells.map(c => cellOf(D, c, m, colsTw)) })),
      width: { size: CONTENT_W, type: D.WidthType.DXA },
      columnWidths: colsTw,
      layout: D.TableLayoutType.FIXED,
      visuallyRightToLeft: m.dir === 'rtl' || undefined,
      borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
    });
  }
  function heading(D, text, kind, pageBreak) {
    const sz = SZ.week;
    return new D.Paragraph({
      children: [new D.TextRun({ text, bold: true, size: sz[0], sizeComplexScript: sz[1], font: FONTS })],
      alignment: kind === 'week' ? D.AlignmentType.CENTER : D.AlignmentType.LEFT,
      indent: kind === 'day' ? { left: 220 } : undefined,
      spacing: { before: 0, after: kind === 'week' ? 200 : 140 },
      pageBreakBefore: pageBreak || undefined,
      keepNext: true,
    });
  }
  function headerOf(D, hd) {
    if (!hd) return null;
    const runs = [];
    const img = hd.logo ? imageFromDataUrl(hd.logo) : null;
    if (img) {
      const hpx = 40;
      runs.push(new D.ImageRun({ type: img.type, data: img.data, transformation: { width: Math.round((hpx * img.w) / img.h), height: hpx } }));
      runs.push(new D.TextRun({ text: '   ' }));
    }
    if (hd.schoolName) runs.push(new D.TextRun({ text: hd.schoolName, bold: true, size: 20, font: FONTS }));
    if (hd.teacherName) runs.push(new D.TextRun({ text: `${hd.teacherLabel || 'Guru'}: ${hd.teacherName}`, size: 17, color: '333333', font: FONTS, break: hd.schoolName ? 1 : undefined }));
    return new D.Header({
      children: [new D.Paragraph({ children: runs, spacing: { after: 60 }, border: { bottom: { style: D.BorderStyle.SINGLE, size: 4, color: '999999', space: 2 } } })],
    });
  }

  /**
   * Bina dokumen docx (tiada DOM; boleh diuji dalam Node).
   * 1 RPH → satu jadual; beberapa → dokumen mingguan dengan tajuk minggu/hari, setiap RPH pada halaman baharu.
   * opts: {variant, header:false, weekly:true|false, title}
   */
  function build(list, opts = {}) {
    const D = lib();
    const R = RPH.render;
    list = (Array.isArray(list) ? list : [list]).filter(Boolean);
    if (!list.length) throw new Error('Tiada RPH untuk dieksport.');
    const weekly = opts.weekly != null ? opts.weekly : list.length > 1;
    const entries = weekly ? R.plan(list) : R.sortRphs(list).map(rph => ({ rph }));
    const children = [];
    let hd = null;
    entries.forEach((e, i) => {
      const m = R.model(e.rph, opts);
      if (!hd && m.header) hd = m.header;
      const brk = i > 0;
      const pre = [];
      if (e.weekHeading) pre.push(heading(D, e.weekHeading, 'week', brk && !pre.length));
      if (e.dayHeading) pre.push(heading(D, e.dayHeading, 'day', brk && !pre.length));
      if (brk && !pre.length) pre.push(new D.Paragraph({ children: [], pageBreakBefore: true, spacing: { before: 0, after: 0 } }));
      children.push(...pre, tableOf(D, m));
    });
    children.push(emptyPara(D));
    const teacher = (RPH.store && RPH.store.get('teacher')) || {};
    // Noto Naskh Arabic hanya dibenamkan jika dokumen ada teks Jawi (BA sahaja → Traditional Arabic, tiada benaman).
    const needNaskh = entries.some(e => { const m = R.model(e.rph, opts); return m.arLang !== 'ar' || R.JAWI_ONLY.test(JSON.stringify(m.rows)); });
    const fonts = needNaskh ? fontBytes() : null;
    const header = headerOf(D, hd);
    return new D.Document({
      creator: teacher.fullName || teacher.name || 'Smart RPH Generator',
      lastModifiedBy: 'Smart RPH Generator',
      title: opts.title || (RPH.print ? RPH.print.filename(list, 'docx').replace(/\.docx$/, '') : 'RPH'),
      description: 'Rancangan Pengajaran Harian — dijana oleh Smart RPH Generator',
      styles: { default: { document: { run: { font: FONTS, size: SZ.base[0], sizeComplexScript: SZ.base[1] }, paragraph: { spacing: { before: 0, after: 0 } } } } },
      fonts: fonts ? [{ name: FONT_AR, data: fonts, characterSet: D.CharacterSet.ARABIC }] : [],
      sections: [{
        properties: {
          page: {
            size: { width: PAGE.w, height: PAGE.h, orientation: D.PageOrientation.PORTRAIT },
            margin: { top: PAGE.margin, right: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin, header: PAGE.header, footer: PAGE.header },
          },
        },
        headers: header ? { default: header } : undefined,
        children,
      }],
    });
  }

  const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  /**
   * Bungkus dokumen. Jika boleh, tetapkan <w:embedTrueTypeFonts/> dalam settings.xml supaya Word
   * mengekalkan fon Arab terbenam apabila guru menyimpan semula (docx.js tiada pilihan ini).
   * type: 'blob' | 'nodebuffer' | 'uint8array' | 'arraybuffer'
   */
  async function pack(doc, type = 'blob') {
    const D = lib();
    const C = D.Packer && D.Packer.compiler;
    if (C && typeof C.compile === 'function') {
      try {
        const zip = C.compile(doc, undefined, []);
        const f = zip.file('word/settings.xml');
        if (f && Object.keys(zip.files).some(n => /^word\/fonts\//.test(n))) {
          let xml = await f.async('string');
          if (!/<w:embedTrueTypeFonts\b/.test(xml)) {
            // Susunan skema CT_Settings: … displayBackgroundShape, print*, embedTrueTypeFonts, …
            xml = /<w:displayBackgroundShape\/>/.test(xml)
              ? xml.replace('<w:displayBackgroundShape/>', '<w:displayBackgroundShape/><w:embedTrueTypeFonts/>')
              : xml.replace(/(<w:settings\b[^>]*>)/, '$1<w:embedTrueTypeFonts/>');
            zip.file('word/settings.xml', xml);
          }
        }
        return await zip.generateAsync({ type, mimeType: MIME, compression: 'DEFLATE' });
      } catch (e) { console.warn('[docx] pembungkus tersuai gagal, guna Packer biasa:', e); }
    }
    const P = D.Packer;
    if (type === 'blob') return P.toBlob(doc);
    if (type === 'arraybuffer') return P.toArrayBuffer(doc);
    return P.toBuffer(doc);
  }
  async function toBlob(list, opts) { return pack(build(list, opts), 'blob'); }

  /** Eksport & muat turun. → {filename, blob} */
  async function exportDocx(list, filename, opts = {}) {
    list = (Array.isArray(list) ? list : [list]).filter(Boolean);
    const name = filename || RPH.print.filename(list, 'docx');
    const blob = await toBlob(list, { ...opts, title: name.replace(/\.docx$/i, '') });
    RPH.util.download(name, blob);
    return { filename: name, blob };
  }

  RPH.docx = { build, pack, toBlob, export: exportDocx, PAGE, CONTENT_W, FONT_AR, FONT_TRAD };
})(window.RPH = window.RPH || {});
