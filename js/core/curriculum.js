/* Akses kurikulum DSKP: SK/SP/TP/tema + provenance (master prompt §51). */
(function (RPH) {
  'use strict';
  const C = (subjectId, year) => RPH.store.curriculum(subjectId, year);

  function walk(c, fn) {
    if (!c) return;
    for (const d of c.domains || []) for (const sk of d.contentStandards || []) {
      fn('SK', sk, d, null);
      for (const sp of sk.learningStandards || []) fn('SP', sp, d, sk);
    }
  }
  function prov(c, item) {
    if (!c || !item) return null;
    return { source: c.source && c.source.title, file: c.source && c.source.file, pdfPage: item.page && item.page.pdf, printedPage: item.page && item.page.printed };
  }

  const curr = {
    get: C,
    sk(subjectId, year, code) { const c = C(subjectId, year); let r = null; walk(c, (k, it, d) => { if (k === 'SK' && it.code === code) r = { ...it, domain: d, provenance: prov(c, it) }; }); return r; },
    sp(subjectId, year, code) { const c = C(subjectId, year); let r = null; walk(c, (k, it, d, sk) => { if (k === 'SP' && it.code === code) r = { ...it, domain: d, sk, provenance: prov(c, it) }; }); return r; },
    listSk(subjectId, year) { const c = C(subjectId, year); const out = []; walk(c, (k, it, d) => { if (k === 'SK') out.push({ ...it, domain: d }); }); return out; },
    listSp(subjectId, year, skCode) { const c = C(subjectId, year); const out = []; walk(c, (k, it, d, sk) => { if (k === 'SP' && (!skCode || sk.code === skCode)) out.push({ ...it, domain: d, skCode: sk.code }); }); return out; },
    domains: (subjectId, year) => (C(subjectId, year) || { domains: [] }).domains,
    themes: (subjectId, year) => (C(subjectId, year) || { themes: [] }).themes || [],
    theme(subjectId, year, name) { return curr.themes(subjectId, year).find(t => t.name && (t.name.ar === name || t.name.ms === name)) || null; },
    tp(subjectId, year, skCode) {
      const c = C(subjectId, year); if (!c) return [];
      const sk = curr.sk(subjectId, year, skCode);
      if (sk && sk.performanceStandards && sk.performanceStandards.length) return sk.performanceStandards;
      const dom = skCode ? skCode.split('.')[0] : null;
      const t = ((c.performanceStandards || {}).tables || []).find(t => !t.appliesToDomains || t.appliesToDomains.includes(dom));
      return t ? t.levels : [];
    },
    script: (subjectId, year) => (C(subjectId, year) || {}).script || null,
    /** Provenance untuk senarai kod (disimpan dalam RPH.provenance). */
    provenanceFor(subjectId, year, codes) {
      const c = C(subjectId, year);
      return (codes || []).map(code => {
        const isSp = code.split('.').length === 3;
        const it = isSp ? curr.sp(subjectId, year, code) : curr.sk(subjectId, year, code);
        return it ? { code, kind: isSp ? 'SP' : 'SK', ...prov(c, it) } : { code, kind: isSp ? 'SP' : 'SK', missing: true };
      });
    },
    /** Semak SP berada di bawah salah satu SK yang dipilih. */
    orphanSp(skCodes, spCodes) { return (spCodes || []).filter(sp => !(skCodes || []).some(sk => sp.startsWith(sk + '.'))); },
    text: it => (it ? it.text : ''),
  };
  RPH.curr = curr;
})(window.RPH = window.RPH || {});
