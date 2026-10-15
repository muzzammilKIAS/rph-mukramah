/* Akses bank pilihan + label paparan ikut bahasa templat. */
(function (RPH) {
  'use strict';
  // Pelayar yang disemai sebelum label Inggeris/Arab ditambah: item bank dalam storan tiada `en` / `arg`.
  // Label yang hilang diambil daripada data seed (RPH_SEED_PUBLIC) tanpa menulis semula bank guru.
  const LANG_KEYS = ['en', 'arg', 'jawi']; // jawi: label Jawi baharu bagi templat Jawi generik (2026-10-02)
  const seedMaps = {};
  function seedMap(id) {
    if (seedMaps[id]) return seedMaps[id];
    const pub = typeof window !== 'undefined' ? window.RPH_SEED_PUBLIC : null;
    const b = pub && pub.banks && pub.banks[id];
    seedMaps[id] = new Map((b && Array.isArray(b.items) ? b.items : []).map(x => [x.id, x]));
    return seedMaps[id];
  }
  function withSeedLabels(id, b) {
    const list = b.items || [];
    const seed = seedMap(id);
    if (!seed.size) return list;
    let out = null;
    list.forEach((x, i) => {
      const s = x && !x.custom ? seed.get(x.id) : null;
      if (!s) return;
      let add = null;
      for (const k of LANG_KEYS) if (x[k] == null && s[k] != null) (add = add || {})[k] = s[k];
      if (add) { out = out || list.slice(); out[i] = { ...x, ...add }; }
    });
    return out || list;
  }
  const banks = {
    items(id, filter) {
      const b = RPH.store.bank(id); if (!b) return [];
      let it = withSeedLabels(id, b);
      if (filter && filter.group) it = it.filter(x => x.group === filter.group);
      if (filter && filter.ids) it = filter.ids.map(i => it.find(x => x.id === i)).filter(Boolean);
      return it;
    },
    item(id, itemId) { return banks.items(id).find(x => x.id === itemId) || null; },
    /** Label ikut bahasa: 'jawi' | 'ar' | 'arg' | 'en' | 'ms' | gabungan 'ms ar' | 'name (ms)' | 'name'
        'arg' = templat Arab generik: label Arab baharu (`arg`) → `ar` (disahkan guru) → ms. 'ar' (BA) tidak berubah. */
    label(item, lang = 'ms') {
      if (!item) return '';
      if (typeof item === 'string') return item.startsWith('txt:') ? item.slice(4) : item;
      const name = item.name ? (item.ms ? `${item.name} (${item.ms})` : item.name) : null;
      if (lang === 'jawi') return item.jawi || item.ms || name || item.id;
      if (lang === 'ar') return item.ar || item.ms || name || item.id;
      if (lang === 'arg') return item.arg || item.ar || item.ms || name || item.id;
      // Inggeris: label `en`; bagi PAK-21 nama teknik (Inggeris) tanpa glos Melayu.
      if (lang === 'en') return item.en || item.name || item.ms || item.id;
      if (lang === 'name') return item.name || item.en || item.ms || item.id;
      if (lang === 'ms ar') return [item.ms || name, item.ar].filter(Boolean).join(' ');
      if (lang === 'name (ms)') return name || item.ms || item.id;
      return item.ms || name || item.id;
    },
    /** Nilai tersimpan (id atau "txt:…") → label. */
    valueLabel(bankId, value, lang) {
      if (value == null || value === '') return '';
      if (String(value).startsWith('txt:')) return String(value).slice(4);
      return banks.label(banks.item(bankId, value), lang) || String(value);
    },
    options(id, lang, filter) { return banks.items(id, filter).map(x => ({ value: x.id, label: banks.label(x, lang) })); },
    addItem(id, item) { RPH.store.update('banks', d => { d[id].items.push({ id: item.id || RPH.util.slug(item.ms || item.name || RPH.util.uid('it')), ...item, custom: true }); }); },
    removeItem(id, itemId) { RPH.store.update('banks', d => { d[id].items = d[id].items.filter(x => x.id !== itemId); }); },
  };
  RPH.banks = banks;
})(window.RPH = window.RPH || {});
