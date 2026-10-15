/* Penukar Jawi (versi pelayar bagi tools/jawi.mjs). Leksikon dari store / seed. */
(function (RPH) {
  'use strict';
  const WORD_RE = /[ء-ي٠-ۿݐ-ݿ]+/g;
  const TASHKIL = /[ً-ْٰ]/g;
  let lex = null;
  const L = () => lex || (lex = (window.RPH_SEED_PUBLIC && window.RPH_SEED_PUBLIC.jawiLexicon) || { words: {}, charMapDefault: {}, toLegacyMap: {} });

  /** Ejaan diseragamkan (keputusan guru 2026-10-02): "تيك س" (fon lama/DSKP bersela ruang) → "تيكس". */
  const seragam = t => String(t).replace(/تيك س(?=$|[\s.,،؛:)\]])/g, 'تيكس');
  
  RPH.jawi = {
    setLexicon(l) { lex = l; },
    toLegacy(text) { const m = L().toLegacyMap; return text == null ? text : [...text].map(c => m[c] ?? c).join(''); },
    /** Ejaan gantian → Jawi Unicode; perkataan tidak dikenali dilaporkan (tiada penukaran senyap). */
    fromLegacy(text) {
      const { words, charMapDefault } = L();
      const unknown = new Set();
      const out = String(text || '').replace(WORD_RE, w => {
        const bare = w.replace(TASHKIL, '');
        if (words[bare] !== undefined) return bare === w ? words[bare] : w;
        if (![...bare].some(c => charMapDefault[c])) return w;
        unknown.add(bare);
        return [...w].map(c => charMapDefault[c] ?? c).join('');
      });
      return { text: seragam(out), unknown: [...unknown] };
    },
    normalizeForMatch(s) {
      return RPH.jawi.toLegacy(seragam(s || '')).replace(TASHKIL, '').replace(/ـ/g, '')
        .replace(/[یى]/g, 'ي').replace(/ک/g, 'ك')
        .replace(/[آأإٱ]/g, 'ا').replace(/[\s.,:;،؛()\-–]/g, '');
    },
    /** Ada ejaan gantian yang belum ditukar? (untuk amaran semasa menyunting) */
    legacyWords(text) {
      const { words } = L();
      return (String(text || '').match(WORD_RE) || []).map(w => w.replace(TASHKIL, '')).filter(w => w.length > 1 && words[w] !== undefined && words[w] !== w);
    },
  };
})(window.RPH = window.RPH || {});
