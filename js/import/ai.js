/* Pengekstrakan AI PILIHAN melalui Google Gemini API (peringkat PERCUMA, kunci dari https://aistudio.google.com/apikey).
   Hanya digunakan jika guru menetapkan kunci API. Import luar talian (RPH.readers) tidak bergantung pada modul ini.

   Keselamatan kunci:
   - Disimpan dalam localStorage "rphSecret:ai" (BUKAN awalan "rph:" — RPH.store.exportAll() menyandarkan semua
     kunci "rph:", jadi kunci API tidak pernah masuk ke fail backup), atau sessionStorage jika remember = false.
   - Dihantar dalam pengepala x-goog-api-key sahaja (tidak dalam URL), tidak pernah dilog atau dipaparkan.
   - getConfig() tidak memulangkan kunci. */
(function (RPH) {
  'use strict';

  const STORE_KEY = 'rphSecret:ai';
  const BASE = 'https://generativelanguage.googleapis.com/v1beta';
  const KEY_URL = 'https://aistudio.google.com/apikey';
  const PREFERRED = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash'];
  const MODELS = [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (percuma, disyorkan)' },
    { id: 'gemini-flash-latest', label: 'Gemini Flash terkini (percuma)' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite (percuma, paling pantas)' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (percuma)' },
  ];
  const PRIVACY_NOTE = 'Peringkat percuma Gemini: Google boleh menggunakan kandungan yang dihantar untuk menambah baik produknya. Jangan hantar data peribadi murid. DSKP/RPT berhak cipta — tanggungjawab guru.';
  const MAX_REQUEST_BYTES = 19.5 * 1024 * 1024; // had permintaan inline ~20 MB
  const MAX_TEXT_CHARS = 1500000;               // ~ <1J token; lebih besar → pecahkan
  const MAX_PAGES_AS_IMAGES = 30;

  const MSG = {
    noKey: 'Kunci API Gemini belum ditetapkan. Dapatkan kunci percuma di aistudio.google.com/apikey, kemudian masukkan di Tetapan → AI.',
    badKey: 'Kunci API Gemini tidak sah',
    quota: 'Had penggunaan percuma dicapai — cuba lagi sebentar / esok',
    busy: 'Pelayan Gemini sibuk, cuba lagi',
    offline: 'Tiada sambungan internet — ciri AI memerlukan internet; import luar talian masih boleh digunakan',
    noKeyCustom: 'Kunci API pembekal tersuai belum ditetapkan (Import Data → Kunci API).',
    offlineCustom: 'Tidak dapat menghubungi pembekal: tiada internet, atau pelayan pembekal tidak membenarkan permintaan dari pelayar (CORS — pelayan perlu menghantar Access-Control-Allow-Origin)',
  };

  const SYSTEM_PROMPT = [
    'Anda ialah pembantu pengekstrakan data untuk guru sekolah di Malaysia. Anda menyalin data daripada dokumen yang diberi ke dalam JSON mengikut skema.',
    'PERATURAN WAJIB:',
    '1. Salin teks TEPAT seperti dicetak dalam dokumen: ejaan, tanda baca, nombor, harakat dan huruf Arab/Jawi. Jangan terjemah, jangan betulkan, jangan ringkaskan, jangan tambah.',
    '2. JANGAN reka kod (SK/SP/TP), tarikh, masa, nama, kelas atau apa-apa data yang tiada dalam dokumen.',
    '3. Jika tidak pasti, tidak terbaca atau tiada dalam dokumen: isi null, dan tambah satu nota dalam "_semakan" berbentuk "perlu semakan: <medan> — <sebab>".',
    '4. Tulisan Jawi: gunakan huruf Unicode standard seperti yang kelihatan (ڤ ݢ ڠ چ ڽ ۏ). Teks Arab: kekalkan ﷺ dan harakat seperti dicetak.',
    '5. Tarikh dalam format ISO YYYY-MM-DD; masa dalam format HH:MM (24 jam).',
    '6. Jawab dengan JSON sahaja yang mematuhi skema. Tiada teks lain.',
    'English summary: copy text exactly as printed; never invent codes, dates or data; use null plus a "perlu semakan" note in "_semakan" when unsure.',
  ].join('\n');

  // ---------------------------------------------------------------------------
  // Storan konfigurasi (tanpa awalan rph:)
  // ---------------------------------------------------------------------------
  const safe = fn => { try { return fn(); } catch (e) { return null; } };
  const readStore = s => safe(() => { const raw = s.getItem(STORE_KEY); return raw ? JSON.parse(raw) : null; });
  const writeStore = (s, v) => safe(() => { if (v) s.setItem(STORE_KEY, JSON.stringify(v)); else s.removeItem(STORE_KEY); return true; });
  const LS = () => safe(() => window.localStorage);
  const SS = () => safe(() => window.sessionStorage);

  function load() {
    const ses = SS() && readStore(SS());
    const loc = LS() && readStore(LS());
    const key = (ses && ses.apiKey) || (loc && loc.apiKey) || '';
    const model = (ses && ses.model) || (loc && loc.model) || '';
    const remember = loc ? loc.remember !== false : !(ses && ses.apiKey);
    const provider = (loc && loc.provider === 'openai') || (ses && ses.provider === 'openai') ? 'openai' : 'gemini';
    const baseUrl = (loc && loc.baseUrl) || (ses && ses.baseUrl) || '';
    return { key, model, remember, provider, baseUrl };
  }
  let cachedModels = null;

  function defaultModel(list) {
    const ids = (list || cachedModels || []).map(m => m.id);
    if (ids.length) return PREFERRED.find(p => ids.includes(p)) || ids.find(i => /flash/.test(i) && !/lite/.test(i)) || ids[0];
    return load().provider === 'openai' ? '' : PREFERRED[0];
  }

  function getConfig() {
    const c = load();
    return { provider: c.provider, baseUrl: c.baseUrl || null, model: c.model || defaultModel(), hasKey: !!c.key, remember: c.remember };
  }
  function configured() { const c = load(); return !!c.key && (c.provider !== 'openai' || !!c.baseUrl); }
  /** Base URL pembekal tersuai: https:// (atau http://localhost untuk ujian), tanpa garis miring di hujung. */
  function normBaseUrl(u) {
    const v = String(u || '').trim().replace(/\/+$/, '');
    if (!v) return '';
    if (!/^https:\/\/[^\s/]+(\/\S*)?$/i.test(v) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/\S*)?$/i.test(v)) throw new Error('Base URL mesti bermula dengan https:// (contoh: https://rootsys.cloud/v1).');
    return v;
  }

  /** setConfig({ provider?, baseUrl?, apiKey?, model?, remember }) — apiKey '' memadam kunci; tiada apiKey = kekalkan kunci sedia ada.
   *  provider: 'gemini' (Google, lalai) | 'openai' (pembekal tersuai serasi OpenAI: baseUrl + kunci Bearer). Tukar pembekal = kunci & model lama dibuang. */
  function setConfig(opts) {
    opts = opts || {};
    const cur = load();
    const provider = opts.provider === undefined ? cur.provider : (opts.provider === 'openai' ? 'openai' : 'gemini');
    const switched = provider !== cur.provider;
    const baseUrl = provider === 'openai' ? normBaseUrl(opts.baseUrl === undefined ? cur.baseUrl : opts.baseUrl) : '';
    const key = opts.apiKey === undefined ? (switched ? '' : cur.key) : String(opts.apiKey || '').trim();
    const model = opts.model === undefined ? (switched ? '' : cur.model) : String(opts.model || '').replace(/^models\//, '').trim();
    const remember = opts.remember === undefined ? cur.remember : !!opts.remember;
    if (provider === 'openai' && !baseUrl) throw new Error('Isi Base URL pembekal (contoh: https://rootsys.cloud/v1).');
    if (key && provider === 'gemini' && !/^[\x21-\x7e]{10,200}$/.test(key)) throw new Error('Format kunci API tidak sah (salin semula dari aistudio.google.com/apikey).');
    if (key && provider === 'openai' && !/^[\x21-\x7e]{8,500}$/.test(key)) throw new Error('Format kunci API tidak sah (tiada ruang; salin semula daripada pembekal).');
    if (switched) cachedModels = null;
    const base = { provider, baseUrl: baseUrl || undefined };
    if (remember) {
      writeStore(LS(), { ...base, apiKey: key || undefined, model: model || undefined, remember: true });
      if (SS()) writeStore(SS(), null);
    } else {
      // Kunci dalam sessionStorage sahaja (hilang apabila tab ditutup); pilihan pembekal/model kekal.
      if (SS()) writeStore(SS(), key ? { ...base, apiKey: key, model: model || undefined } : null);
      writeStore(LS(), { ...base, model: model || undefined, remember: false });
    }
    if (RPH.events) RPH.events.emit('ai:config', getConfig());
    return getConfig();
  }
  function clear() {
    if (LS()) writeStore(LS(), null);
    if (SS()) writeStore(SS(), null);
    cachedModels = null;
    if (RPH.events) RPH.events.emit('ai:config', getConfig());
  }

  // ---------------------------------------------------------------------------
  // HTTP
  // ---------------------------------------------------------------------------
  function aiError(message, extra) { const e = new Error(message); Object.assign(e, extra || {}); e.isAiError = true; return e; }

  async function call(method, path, body, opts) {
    const c = load(), key = c.key;
    if (!key) throw aiError(c.provider === 'openai' ? MSG.noKeyCustom : MSG.noKey, { code: 'NO_KEY' });
    const custom = c.provider === 'openai';
    const init = { method, headers: custom ? { authorization: `Bearer ${key}` } : { 'x-goog-api-key': key } };
    if (body !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(body); }
    if (opts && opts.signal) init.signal = opts.signal;
    let res;
    try { res = await window.fetch((custom ? c.baseUrl : BASE) + path, init); }
    catch (e) {
      if (e && e.name === 'AbortError') throw aiError('Dibatalkan.', { code: 'ABORTED' });
      // Pembekal tersuai: "Failed to fetch" lazimnya bermaksud pelayan tidak menghantar Access-Control-Allow-Origin (CORS).
      throw aiError(custom ? `${MSG.offlineCustom} (${c.baseUrl})` : MSG.offline, { code: 'OFFLINE' });
    }
    let data = null;
    const txt = await res.text().catch(() => '');
    try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
    if (!res.ok) throw mapError(res.status, data, txt, custom);
    return data;
  }

  function mapError(status, data, txt, custom) {
    const err = data && typeof data.error === 'string' ? { message: data.error } : (data && data.error) || {};
    const msg = String(err.message || txt || '').slice(0, 300);
    const reasons = (err.details || []).map(d => d && d.reason).filter(Boolean);
    const isKey = reasons.includes('API_KEY_INVALID') || /api key (not valid|invalid|expired)/i.test(msg) || err.status === 'UNAUTHENTICATED';
    if ((status === 400 && isKey) || status === 401 || status === 403) return aiError(custom ? 'Kunci API pembekal tidak sah atau tiada kebenaran (semak kunci dan Base URL)' : MSG.badKey, { code: 'BAD_KEY', status });
    if (status === 429) return aiError(MSG.quota, { code: 'QUOTA', status });
    if (status >= 500) return aiError(MSG.busy, { code: 'BUSY', status });
    if (status === 404) return aiError(`Model AI tidak ditemui atau tidak tersedia untuk kunci ini. Pilih model lain di Tetapan → AI. (${msg})`, { code: 'NO_MODEL', status });
    if (status === 413) return aiError('Fail terlalu besar untuk dihantar (had ~20 MB). Pilih julat halaman yang lebih kecil.', { code: 'TOO_LARGE', status });
    const schema = status === 400 && /schema|response_?schema|responseSchema|generation_?config|properties|enum|nullable|items/i.test(msg);
    return aiError(`Permintaan ditolak oleh ${custom ? 'pembekal' : 'Gemini'} (${status}): ${msg}`, { code: schema ? 'SCHEMA' : 'BAD_REQUEST', status });
  }

  // ---------------------------------------------------------------------------
  // Model
  // ---------------------------------------------------------------------------
  const EXCLUDE = /embedding|aqa|imagen|veo|tts|image-generation|-image|native-audio|audio|live|robotics|computer-use|learnlm/i;
  function labelFor(m) {
    const id = m.id;
    const pref = PREFERRED.indexOf(id);
    let label = m.displayName || id;
    if (/flash/i.test(id)) label += pref === 0 || (pref < 0 && /latest/.test(id)) ? ' (percuma, disyorkan)' : ' (percuma)';
    else if (/pro/i.test(id)) label += ' (had percuma kecil)';
    return label;
  }
  /** Senarai model yang menyokong generateContent; model flash (peringkat percuma) didahulukan. */
  async function listModels(opts) {
    if (load().provider === 'openai') {
      const data = await call('GET', '/models', undefined, opts);
      const arr = (data && (data.data || data.models)) || [];
      const list = arr.map(m => (typeof m === 'string' ? m : m && (m.id || m.name))).filter(Boolean)
        .filter(id => !/embed|whisper|tts|dall-e|moderation|image|audio|rerank/i.test(id)).sort()
        .map(id => ({ id, label: id }));
      cachedModels = list;
      return list;
    }
    const out = [];
    let token = '';
    for (let i = 0; i < 5; i++) {
      const data = await call('GET', `/models?pageSize=1000${token ? '&pageToken=' + encodeURIComponent(token) : ''}`, undefined, opts);
      for (const m of (data && data.models) || []) {
        const id = String(m.name || '').replace(/^models\//, '');
        if (!id || !(m.supportedGenerationMethods || []).includes('generateContent') || EXCLUDE.test(id)) continue;
        out.push({ id, displayName: m.displayName || id, inputTokenLimit: m.inputTokenLimit || null, outputTokenLimit: m.outputTokenLimit || null });
      }
      token = data && data.nextPageToken;
      if (!token) break;
    }
    const rank = m => {
      const p = PREFERRED.indexOf(m.id);
      if (p >= 0) return p;
      if (/flash/i.test(m.id) && !/lite/i.test(m.id)) return 10 + (/preview|exp/i.test(m.id) ? 5 : 0);
      if (/flash/i.test(m.id)) return 20 + (/preview|exp/i.test(m.id) ? 5 : 0);
      if (/gemma/i.test(m.id)) return 40;
      return 30; // pro / lain-lain
    };
    out.sort((a, b) => rank(a) - rank(b) || b.id.localeCompare(a.id));
    const list = out.map(m => ({ id: m.id, label: labelFor(m), inputTokenLimit: m.inputTokenLimit, outputTokenLimit: m.outputTokenLimit }));
    cachedModels = list;
    return list;
  }

  /** Uji kunci: senarai model + satu permintaan kecil. Tidak membaling ralat. */
  async function test(opts) {
    const model = getConfig().model;
    if (load().provider === 'openai') {
      try {
        let list = [];
        try { list = await listModels(opts); } catch (e) { if (e.code === 'BAD_KEY' || e.code === 'OFFLINE') throw e; }
        const chosen = model && (!list.length || list.some(m => m.id === model)) ? model : (list[0] && list[0].id);
        if (!chosen) return { ok: false, model, error: 'Tiada model — taip nama model pembekal.' };
        const data = await call('POST', '/chat/completions', { model: chosen, messages: [{ role: 'user', content: 'Balas dengan perkataan OK sahaja.' }], temperature: 0, max_tokens: 5 }, opts);
        const ok = !!(data && data.choices && data.choices.length);
        const res = { ok, model: chosen, models: list.length };
        if (model && chosen !== model) res.warning = `Model "${model}" tiada; "${chosen}" digunakan.`;
        if (!ok) res.error = 'Pembekal tidak memberi jawapan.';
        return res;
      } catch (e) { return { ok: false, model, error: e.message, code: e.code }; }
    }
    try {
      const list = await listModels(opts);
      const chosen = list.some(m => m.id === model) ? model : defaultModel(list);
      const data = await call('POST', `/models/${encodeURIComponent(chosen)}:generateContent`, {
        contents: [{ role: 'user', parts: [{ text: 'Balas dengan perkataan OK sahaja.' }] }],
        generationConfig: { temperature: 0 },
      }, opts);
      const ok = !!(data && data.candidates && data.candidates.length);
      const res = { ok, model: chosen, models: list.length };
      if (chosen !== model) res.warning = `Model "${model}" tiada untuk kunci ini; "${chosen}" digunakan.`;
      if (!ok) res.error = 'Gemini tidak memberi jawapan.';
      return res;
    } catch (e) {
      return { ok: false, model, error: e.message, code: e.code };
    }
  }

  // ---------------------------------------------------------------------------
  // Skema JSON → subset OpenAPI Gemini
  // ---------------------------------------------------------------------------
  /**
   * Tukar JSON Schema kepada responseSchema Gemini (TYPE huruf besar, nullable, propertyOrdering).
   * Kunci tidak disokong dibuang (additionalProperties, $schema, $id …). Pulangkan { schema, lossy }.
   * lossy = true jika skema tidak dapat diwakili dengan setia (objek bebas tanpa properties, $ref rekursif …):
   * pemanggil kemudian menghantar skema sebagai teks dalam arahan sahaja.
   */
  function toGeminiSchema(root) {
    let lossy = false;
    const defs = (root && (root.$defs || root.definitions)) || {};
    const seen = new Set();
    const TYPES = { object: 'OBJECT', array: 'ARRAY', string: 'STRING', integer: 'INTEGER', number: 'NUMBER', boolean: 'BOOLEAN' };
    function conv(s, depth) {
      if (depth > 12) { lossy = true; return { type: 'STRING' }; }
      if (s === true || s == null || typeof s !== 'object') return { type: 'STRING' };
      if (s.$ref) {
        const m = /^#\/(?:\$defs|definitions)\/(.+)$/.exec(s.$ref);
        if (!m || !defs[m[1]] || seen.has(s.$ref)) { lossy = true; return { type: 'STRING' }; }
        seen.add(s.$ref); const r = conv(Object.assign({}, defs[m[1]], { description: s.description || defs[m[1]].description }), depth + 1); seen.delete(s.$ref);
        return r;
      }
      if (Array.isArray(s.allOf) && s.allOf.length === 1 && !s.properties) return conv(Object.assign({}, s.allOf[0], { description: s.description || s.allOf[0].description }), depth + 1);
      if (Array.isArray(s.allOf) && s.allOf.length > 1) lossy = true;
      const out = {};
      let nullable = false;
      let type = s.type;
      if (Array.isArray(type)) { nullable = type.includes('null'); type = type.filter(t => t !== 'null'); type = type.length === 1 ? type[0] : (type.length ? (lossy = true, 'string') : 'string'); }
      const alts = s.anyOf || s.oneOf;
      if (Array.isArray(alts)) {
        const nonNull = alts.filter(a => !(a && a.type === 'null'));
        if (nonNull.length !== alts.length) nullable = true;
        if (nonNull.length === 1) { const r = conv(Object.assign({}, nonNull[0], { description: s.description || nonNull[0].description }), depth + 1); if (nullable) r.nullable = true; return r; }
        if (nonNull.length > 1) { out.anyOf = nonNull.map(a => conv(a, depth + 1)); if (s.description) out.description = String(s.description); if (nullable) out.nullable = true; return out; }
      }
      if (s.const !== undefined) { out.type = 'STRING'; out.enum = [String(s.const)]; }
      else if (Array.isArray(s.enum)) {
        const vals = s.enum.filter(v => v !== null);
        if (vals.length !== s.enum.length) nullable = true;
        out.type = 'STRING'; out.format = 'enum'; out.enum = vals.map(String);
        if (type && type !== 'string') lossy = true; // nombor enum → teks
      } else {
        if (!type) type = s.properties ? 'object' : (s.items ? 'array' : 'string');
        out.type = TYPES[type] || 'STRING';
        if (!TYPES[type]) lossy = true;
      }
      if (s.title) out.title = String(s.title);
      if (s.description) out.description = String(s.description);
      if (out.type === 'OBJECT') {
        const props = s.properties || {};
        const keys = Object.keys(props);
        if (!keys.length) { lossy = true; return { type: 'STRING', description: (s.description ? s.description + ' ' : '') + '(objek JSON sebagai teks)', nullable: nullable || undefined }; }
        out.properties = {};
        for (const k of keys) out.properties[k] = conv(props[k], depth + 1);
        out.propertyOrdering = keys;
        if (Array.isArray(s.required)) { const req = s.required.filter(k => keys.includes(k)); if (req.length) out.required = req; }
        if (s.additionalProperties && typeof s.additionalProperties === 'object') lossy = true;
      } else if (out.type === 'ARRAY') {
        out.items = conv(s.items || { type: 'string' }, depth + 1);
        if (Number.isInteger(s.minItems)) out.minItems = s.minItems;
        if (Number.isInteger(s.maxItems)) out.maxItems = s.maxItems;
      } else if (out.type === 'STRING' && !out.enum) {
        if (s.format === 'date-time') out.format = 'date-time';
      } else if (out.type === 'NUMBER' || out.type === 'INTEGER') {
        if (typeof s.minimum === 'number') out.minimum = s.minimum;
        if (typeof s.maximum === 'number') out.maximum = s.maximum;
      }
      if (nullable) out.nullable = true;
      return out;
    }
    const schema = conv(root, 0);
    Object.keys(schema).forEach(k => schema[k] === undefined && delete schema[k]);
    return { schema, lossy };
  }

  /** Tambah medan "_semakan" (nota "perlu semakan") pada objek akar jika belum ada. */
  function withReviewField(schema) {
    if (!schema || typeof schema !== 'object' || (schema.type && schema.type !== 'object') || !schema.properties || schema.properties._semakan) return schema;
    const s = Object.assign({}, schema, { properties: Object.assign({}, schema.properties, { _semakan: { type: 'array', items: { type: 'string' }, description: 'Senarai nota "perlu semakan: <medan> — <sebab>" bagi data yang tidak pasti atau tiada dalam dokumen. Kosong jika semua pasti.' } }) });
    return s;
  }

  // ---------------------------------------------------------------------------
  // Kandungan (fail → bahagian Gemini)
  // ---------------------------------------------------------------------------
  function bytesToBase64(u8) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  }
  async function fileToBase64(file) { return bytesToBase64(new Uint8Array(await file.arrayBuffer())); }
  function parseDataUrl(url) {
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(String(url || ''));
    if (!m) throw aiError('Imej tidak sah (data URL dijangka).');
    return { mime: m[1], data: m[2] ? m[3] : btoa(unescape(encodeURIComponent(decodeURIComponent(m[3])))) };
  }
  /** Kecilkan imej besar (foto telefon) supaya muat had permintaan: sisi terpanjang ≤ maxSide, JPEG. */
  async function shrinkImage(dataUrl, maxSide, quality) {
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(aiError('Imej tidak dapat dibaca.')); i.src = dataUrl; });
    const scale = Math.min(1, maxSide / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(im.naturalWidth * scale); c.height = Math.round(im.naturalHeight * scale);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(im, 0, 0, c.width, c.height);
    const out = c.toDataURL('image/jpeg', quality || 0.9);
    c.width = c.height = 0;
    return out;
  }
  async function imagePart(dataUrl) {
    let url = dataUrl;
    if (url.length > 5.5e6) url = await shrinkImage(url, 3072, 0.9);
    const { mime, data } = parseDataUrl(url);
    return { inline_data: { mime_type: mime, data } };
  }
  const isPdf = (doc, file) => (doc && doc.kind === 'pdf') || (file && (/pdf/i.test(file.type || '') || /\.pdf$/i.test(file.name || '')));
  const isImageFile = (doc, file) => (doc && doc.kind === 'image') || (file && /^image\//i.test(file.type || ''));

  /** Doc bukan-PDF → teks + jadual (setiap baris jadual sebagai tatasusunan JSON — lajur jelas). */
  function docToText(doc) {
    const out = [];
    out.push(`Fail: ${doc.name} (${doc.kind})`);
    const tableParas = new Set();
    doc.paragraphs.forEach(p => { if (p.cell) tableParas.add(p); });
    const body = doc.paragraphs.filter(p => !tableParas.has(p)).map(p => p.text).join('\n').trim();
    if (body) out.push('=== TEKS ===\n' + body);
    doc.tables.forEach((t, i) => {
      const where = t.page ? `, halaman ${t.page}` : t.slide ? `, slaid ${t.slide}` : t.sheet ? `, helaian "${t.sheet}"` : '';
      out.push(`=== JADUAL ${i + 1} (${t.source}${where}${t.dir === 'rtl' ? ', lajur 0 = paling kanan' : ''}; sel bergabung diulang) ===\n` + t.rows.map(r => JSON.stringify(r)).join('\n'));
    });
    if (doc.legacyJawi) out.push('Nota: teks Jawi dalam fail ini menggunakan ejaan fon lama (غ = ڠ, ف = ڤ, ض = ݢ, خ = چ, ث = ڽ, ؤ = ۏ). Tukar kepada Jawi Unicode standard.');
    return out.join('\n\n');
  }

  async function buildParts(o, onProgress) {
    const parts = [];
    let bytes = 0;
    const add = p => { parts.push(p); bytes += p.text ? p.text.length * 2 : p.inline_data.data.length; };
    const doc = o.doc || null;
    const file = o.file || (doc && doc.file) || null;
    add({ text: `${o.task ? 'TUGAS: ' + o.task + '\n' : ''}${o.instructions || 'Ekstrak data daripada dokumen mengikut skema.'}` });

    if (o.pages && (isPdf(doc, file))) {
      // Julat halaman PDF → imej PNG (pdf.js) + lapisan teks halaman itu (jika ada) sebagai rujukan.
      if (!RPH.readers || !RPH.readers.renderPdfPage) throw aiError('Pembaca PDF tidak dimuatkan.');
      const from = Math.max(1, o.pages[0] | 0), to = Math.max(from, (o.pages[1] || o.pages[0]) | 0);
      if (to - from + 1 > MAX_PAGES_AS_IMAGES) throw aiError(`Terlalu banyak halaman sekaligus (${to - from + 1}). Hantar paling banyak ${MAX_PAGES_AS_IMAGES} halaman setiap kali.`);
      for (let n = from; n <= to; n++) {
        if (onProgress) onProgress({ phase: 'render', done: n - from, total: to - from + 1 });
        const url = await RPH.readers.renderPdfPage(file || doc, n, 2);
        add({ text: `--- Halaman PDF ${n} ---` });
        add(await imagePart(url));
        const pg = doc && doc.pages && doc.pages.find(p => p.n === n);
        if (pg && pg.text) add({ text: `Lapisan teks halaman ${n} (rujukan; susunan/huruf mungkin tidak sempurna, ${RPH.readers.IMAGE_PLACEHOLDER || '\uFFFC'} = perkataan gambar):\n${pg.text}` });
      }
    } else if (isPdf(doc, file) && o._provider === 'openai') {
      // API serasi OpenAI tidak menerima PDF terus: lapisan teks; PDF imbasan → imej halaman (hingga 10).
      const n = (doc && (doc.numPages || (doc.pages || []).length)) || 0;
      const textLen = doc ? String(doc.text || '').replace(/\s/g, '').length : 0;
      if (doc && textLen > 200 && !doc.scanned) add({ text: docToText(doc) });
      else {
        if (!RPH.readers || !RPH.readers.renderPdfPage) throw aiError('Pembaca PDF tidak dimuatkan.');
        if (n > 10) throw aiError(`PDF imbasan ${n} halaman — pilih julat halaman (cth. 1–10); halaman dihantar sebagai imej.`, { code: 'TOO_LARGE' });
        for (let k = 1; k <= Math.max(1, n); k++) { if (onProgress) onProgress({ phase: 'render', done: k - 1, total: n }); add({ text: `--- Halaman PDF ${k} ---` }); add(await imagePart(await RPH.readers.renderPdfPage(file || doc, k, 2))); }
      }
    } else if (isPdf(doc, file)) {
      if (!file) throw aiError('Fail PDF asal tiada untuk dihantar.');
      const est = Math.ceil(file.size / 3) * 4;
      if (est > MAX_REQUEST_BYTES) throw aiError(`Fail PDF terlalu besar untuk dihantar terus (${(file.size / 1048576).toFixed(1)} MB; had ~20 MB). Pilih julat halaman (cth. 10–20) — halaman itu akan dihantar sebagai imej.`, { code: 'TOO_LARGE' });
      add({ inline_data: { mime_type: 'application/pdf', data: await fileToBase64(file) } });
    } else if (isImageFile(doc, file)) {
      const url = doc && doc.images && doc.images[0] ? doc.images[0].dataUrl : await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(file); });
      add(await imagePart(url));
    } else if (doc) {
      const t = docToText(doc);
      if (t.length > MAX_TEXT_CHARS) throw aiError(`Dokumen terlalu panjang untuk satu permintaan (${Math.round(t.length / 1000)} ribu aksara). Pecahkan kepada bahagian lebih kecil.`, { code: 'TOO_LARGE' });
      add({ text: t });
      // Dokumen yang hampir tiada teks (cth. DOCX berisi gambar jadual) → hantar imej terbenam.
      if (doc.text.replace(/\s/g, '').length < 200) for (const im of (doc.images || []).slice(0, 3)) add(await imagePart(im.dataUrl));
    } else if (file) {
      throw aiError('Baca fail dengan RPH.readers.read() dahulu, kemudian hantar objek Doc kepada AI.');
    }
    for (const url of o.images || []) add(await imagePart(url));
    if (o.text) add({ text: String(o.text) });
    if (bytes > MAX_REQUEST_BYTES) throw aiError(`Kandungan terlalu besar untuk satu permintaan (${(bytes / 1048576).toFixed(1)} MB; had ~20 MB). Pilih julat halaman yang lebih kecil.`, { code: 'TOO_LARGE' });
    return parts;
  }

  function parseJsonText(text) {
    let t = String(text || '').trim();
    const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
    if (fence) t = fence[1];
    return JSON.parse(t);
  }

  /**
   * Ekstrak data berstruktur.
   * @param {{task?:string, instructions:string, schema:object, doc?:object, file?:File, images?:string[], text?:string,
   *          pages?:[number,number], maxTokens?:number, signal?:AbortSignal, onProgress?:Function, model?:string}} o
   * @returns {Promise<object>} objek JSON (+ harta tidak terhitung `_ai` {model, finishReason, usage, schemaMode})
   */
  async function extract(o) {
    o = o || {};
    if (!configured()) throw aiError(MSG.noKey, { code: 'NO_KEY' });
    if (!o.schema || typeof o.schema !== 'object') throw aiError('Skema JSON diperlukan untuk pengekstrakan AI.');
    const model = (o.model || getConfig().model).replace(/^models\//, '');
    const onProgress = o.onProgress;
    if (load().provider === 'openai') return extractOpenAI(o, model, onProgress);
    const parts = await buildParts(o, onProgress);
    const schemaFull = withReviewField(o.schema);
    const conv = toGeminiSchema(schemaFull);
    const gen = { temperature: 0, responseMimeType: 'application/json' };
    if (o.maxTokens) gen.maxOutputTokens = o.maxTokens | 0;
    const body = (useSchema) => {
      const p = parts.slice();
      if (!useSchema) p.push({ text: 'Skema JSON yang WAJIB dipatuhi (JSON Schema):\n' + JSON.stringify(schemaFull) });
      return {
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: p }],
        generationConfig: useSchema ? Object.assign({}, gen, { responseSchema: conv.schema }) : Object.assign({}, gen),
      };
    };
    let useSchema = !conv.lossy;
    let data;
    const path = `/models/${encodeURIComponent(model)}:generateContent`;
    if (onProgress) onProgress({ phase: 'send', model });
    try {
      data = await call('POST', path, body(useSchema), o);
    } catch (e) {
      if (e.code === 'SCHEMA' && useSchema) { useSchema = false; data = await call('POST', path, body(false), o); }
      else if (e.code === 'BUSY') { await new Promise(r => setTimeout(r, 1500)); data = await call('POST', path, body(useSchema), o); }
      else throw e;
    }
    if (onProgress) onProgress({ phase: 'parse' });
    const block = data && data.promptFeedback && data.promptFeedback.blockReason;
    if (block) throw aiError(`Permintaan disekat oleh penapis Gemini (${block}). Cuba bahagian dokumen yang lain atau import secara manual.`, { code: 'BLOCKED' });
    const cand = data && data.candidates && data.candidates[0];
    if (!cand) throw aiError('Gemini tidak memberi jawapan (tiada calon). Cuba lagi.', { code: 'EMPTY' });
    const finish = cand.finishReason || 'STOP';
    if (finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT' || finish === 'BLOCKLIST' || finish === 'SPII') throw aiError(`Jawapan disekat oleh penapis keselamatan Gemini (${finish}).`, { code: 'BLOCKED' });
    if (finish === 'RECITATION') throw aiError('Gemini enggan menyalin teks ini kerana dikesan sebagai petikan berhak cipta (RECITATION). Cuba julat halaman yang lebih kecil, atau gunakan import luar talian.', { code: 'RECITATION' });
    const text = ((cand.content && cand.content.parts) || []).filter(p => p && typeof p.text === 'string' && !p.thought).map(p => p.text).join('');
    if (!text.trim()) throw aiError(finish === 'MAX_TOKENS' ? 'Jawapan AI terpotong (had token) sebelum sebarang data. Pilih julat halaman yang lebih kecil.' : 'Jawapan AI kosong. Cuba lagi.', { code: finish === 'MAX_TOKENS' ? 'MAX_TOKENS' : 'EMPTY' });
    let obj;
    try { obj = parseJsonText(text); }
    catch (e) {
      if (finish === 'MAX_TOKENS') throw aiError('Jawapan AI terpotong (had token). Pilih julat halaman yang lebih kecil atau naikkan maxTokens.', { code: 'MAX_TOKENS' });
      throw aiError('Jawapan AI bukan JSON yang sah. Cuba lagi.', { code: 'BAD_JSON' });
    }
    if (obj && typeof obj === 'object') {
      Object.defineProperty(obj, '_ai', { value: { model: data.modelVersion || model, finishReason: finish, usage: data.usageMetadata || null, schemaMode: useSchema ? 'responseSchema' : 'prompt' }, enumerable: false });
    }
    return obj;
  }

  /** Pembekal tersuai serasi OpenAI: POST {baseUrl}/chat/completions; skema dihantar dalam arahan + response_format json_object. */
  async function extractOpenAI(o, model, onProgress) {
    if (!model) throw aiError('Pilih atau taip nama model pembekal (Import Data → Kunci API).', { code: 'NO_MODEL' });
    const parts = await buildParts({ ...o, _provider: 'openai' }, onProgress);
    const schemaFull = withReviewField(o.schema);
    const content = parts.map(p => (p.inline_data ? { type: 'image_url', image_url: { url: `data:${p.inline_data.mime_type};base64,${p.inline_data.data}` } } : { type: 'text', text: p.text }));
    content.push({ type: 'text', text: 'Pulangkan SATU objek JSON sahaja (tanpa teks lain) yang WAJIB mematuhi JSON Schema ini:\n' + JSON.stringify(schemaFull) });
    const body = (fmt) => {
      const b = { model, temperature: 0, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content }] };
      if (fmt) b.response_format = { type: 'json_object' };
      if (o.maxTokens) b.max_tokens = o.maxTokens | 0;
      return b;
    };
    if (onProgress) onProgress({ phase: 'send', model });
    let data, fmt = true;
    try { data = await call('POST', '/chat/completions', body(true), o); }
    catch (e) {
      if (e.code === 'BAD_REQUEST' || e.code === 'SCHEMA') { fmt = false; data = await call('POST', '/chat/completions', body(false), o); } // pembekal tanpa response_format
      else if (e.code === 'BUSY') { await new Promise(r => setTimeout(r, 1500)); data = await call('POST', '/chat/completions', body(true), o); }
      else throw e;
    }
    if (onProgress) onProgress({ phase: 'parse' });
    const ch = data && data.choices && data.choices[0];
    if (!ch) throw aiError('Pembekal tidak memberi jawapan. Cuba lagi.', { code: 'EMPTY' });
    const finish = ch.finish_reason || 'stop';
    if (finish === 'content_filter') throw aiError('Jawapan disekat oleh penapis pembekal.', { code: 'BLOCKED' });
    const msg = ch.message || {};
    const text = typeof msg.content === 'string' ? msg.content : (msg.content || []).map(x => (x && (x.text || '')) || '').join('');
    if (!String(text).trim()) throw aiError(finish === 'length' ? 'Jawapan AI terpotong (had token). Pilih julat halaman yang lebih kecil.' : 'Jawapan AI kosong. Cuba lagi.', { code: finish === 'length' ? 'MAX_TOKENS' : 'EMPTY' });
    let obj;
    try { obj = parseJsonText(String(text).replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1')); }
    catch (e) { throw aiError(finish === 'length' ? 'Jawapan AI terpotong (had token). Pilih julat halaman yang lebih kecil.' : 'Jawapan AI bukan JSON yang sah. Cuba lagi.', { code: finish === 'length' ? 'MAX_TOKENS' : 'BAD_JSON' }); }
    if (obj && typeof obj === 'object') Object.defineProperty(obj, '_ai', { value: { model: data.model || model, finishReason: finish, usage: data.usage || null, schemaMode: fmt ? 'json_object' : 'prompt', provider: 'openai' }, enumerable: false });
    return obj;
  }

  RPH.ai = {
    get provider() { return load().provider; },
    MODELS: MODELS.slice(),
    PREFERRED: PREFERRED.slice(),
    PRIVACY_NOTE,
    KEY_URL,
    STORE_KEY,
    configured,
    getConfig,
    setConfig,
    clear,
    listModels,
    test,
    extract,
    toGeminiSchema,
    normBaseUrl,
    _internal: { docToText, buildParts, mapError, withReviewField, SYSTEM_PROMPT, extractOpenAI },
  };
})(window.RPH = window.RPH || {});
