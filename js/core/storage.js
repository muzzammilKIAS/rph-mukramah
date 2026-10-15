/* Adapter storan. Versi 1: localStorage. Antara muka sama boleh diganti dengan
   IndexedDB / Supabase / Firebase / API kemudian (master prompt §79). */
(function (RPH) {
  'use strict';
  // Semua fail file:// berkongsi SATU storan pelayar (Chrome). Setiap edisi mesti ada awalan sendiri supaya
  // app kosong tidak menindih data app guru (pepijat 2026-10-02). Edisi asal kekal 'rph:' (data sedia ada).
  const EDITION = (window.RPH_SEED_PUBLIC && window.RPH_SEED_PUBLIC.edition) || 'asal';
  const PREFIX = EDITION === 'asal' ? 'rph:' : `rph-${EDITION}:`;
  let mem = null; // sandaran memori jika localStorage tidak tersedia (mod peribadi dll.)

  /**
   * Pemulihan: jika storan 'rph:' (milik edisi asal) telah disemai oleh edisi lain sebelum pembetulan ini,
   * pindahkan data itu ke awalan edisinya (cth. 'rph-kosong:') — tiada data dipadam — supaya edisi asal disemai semula.
   */
  (function relocateForeign() {
    if (EDITION !== 'asal') return;
    let s; try { s = localStorage; s.getItem('x'); } catch (e) { return; }
    let meta = null; try { meta = JSON.parse(s.getItem('rph:meta') || 'null'); } catch (e) { return; }
    const foreign = meta && meta.edition && meta.edition !== 'asal' ? meta.edition : null;
    if (!foreign) return;
    const dest = `rph-${foreign}:`;
    const already = s.getItem(dest + 'meta') != null;
    const target = already ? `rph-${foreign}-dipindah-${Date.now()}:` : dest;
    Object.keys(s).filter(k => k.startsWith('rph:')).forEach(k => { s.setItem(target + k.slice(4), s.getItem(k)); s.removeItem(k); });
    console.warn(`[RPH] Data edisi "${foreign}" dalam storan app ini dipindahkan ke ${target}* — app ini disemai semula.`);
    window.__RPH_RELOCATED = { from: 'rph:', to: target, edition: foreign };
  })();

  function ls() {
    if (mem) return null;
    try { const t = '__rph_t'; localStorage.setItem(t, '1'); localStorage.removeItem(t); return localStorage; }
    catch (e) { mem = new Map(); console.warn('localStorage tidak tersedia — data hanya dalam memori sesi ini.'); return null; }
  }

  RPH.storage = {
    prefix: PREFIX,
    get backend() { return ls() ? 'localStorage' : 'memory'; },
    read(key) {
      const s = ls();
      const raw = s ? s.getItem(PREFIX + key) : mem.get(PREFIX + key);
      if (raw == null) return undefined;
      try { return JSON.parse(raw); } catch (e) { RPH.reportError(`baca ${key}`, e); return undefined; }
    },
    write(key, value) {
      const raw = JSON.stringify(value);
      const s = ls();
      try { s ? s.setItem(PREFIX + key, raw) : mem.set(PREFIX + key, raw); }
      catch (e) {
        const quota = e && (e.name === 'QuotaExceededError' || e.code === 22);
        throw new Error(quota ? 'Storan pelayar penuh. Buat Backup dan buang data lama (Tetapan → Data).' : e.message);
      }
    },
    remove(key) { const s = ls(); s ? s.removeItem(PREFIX + key) : mem.delete(PREFIX + key); },
    keys() {
      const s = ls();
      const all = s ? Object.keys(s) : [...mem.keys()];
      return all.filter(k => k.startsWith(PREFIX)).map(k => k.slice(PREFIX.length));
    },
    clear() { this.keys().forEach(k => this.remove(k)); },
    usageKB() {
      const s = ls(); if (!s) return 0;
      return Math.round(this.keys().reduce((n, k) => n + (s.getItem(PREFIX + k) || '').length * 2, 0) / 1024);
    },
  };
})(window.RPH = window.RPH || {});
