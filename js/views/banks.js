/* Bank Aktiviti & bank pilihan (master prompt §33–§38, §48 Kegemaran, §49 Bank Aktiviti Saya).
   Kegemaran disimpan dalam store 'favourites' {activities[], pak21[], bbm[], reflection[]}:
   activities/pak21/bbm = id item bank; reflection = ayat refleksi (string). */
(function (RPH) {
  'use strict';
  const { h, icon, button, confirm, toast, clear, empty, tabs, chip } = RPH.ui;
  const U = RPH.util;
  const K = () => RPH.adminKit;
  const st = () => RPH.store;

  const TABS = [
    { id: 'activities', label: 'Bank Aktiviti Saya' }, { id: 'pak21', label: 'PAK21' }, { id: 'bbm', label: 'BBM' }, { id: 'kbat', label: 'KBAT' },
    { id: 'emk', label: 'EMK' }, { id: 'assessment', label: 'Pentaksiran' }, { id: 'strategies', label: 'Strategi' }, { id: 'values', label: 'Nilai' },
    { id: 'aspirasi-murid', label: 'Aspirasi Murid' }, { id: 'sekolahku-sejahtera', label: 'Sekolahku Sejahtera' }, { id: 'pendekatan-bertema', label: 'Pendekatan Bertema' },
    { id: 'tp', label: 'TP' }, { id: 'pi-bidang', label: 'Bidang PI' }, { id: 'status', label: 'Status RPH' }, { id: 'reflection', label: 'Refleksi Kegemaran' },
  ];
  const FAV = { activities: 'activities', pak21: 'pak21', bbm: 'bbm' };
  const READONLY = new Set(['status']);
  const CATEGORIES = ['Permainan', 'Perbincangan', 'Lisan', 'Bacaan', 'Penulisan', 'Nyanyian / Nasyid', 'Main peranan', 'Projek', 'Digital', 'Amali', 'Lain-lain'];
  const PHASES = [{ value: 'induction', label: 'Set Induksi' }, { value: 'development', label: 'Perkembangan' }, { value: 'closure', label: 'Penutup' }];
  const state = { tab: 'activities', q: '', favOnly: false };

  const bank = id => st().bank(id);
  const favs = () => st().get('favourites') || { activities: [], pak21: [], bbm: [], reflection: [] };
  const isFav = (key, id) => (favs()[key] || []).includes(id);
  function toggleFav(key, id) {
    let on = false;
    st().update('favourites', d => { d[key] = d[key] || []; const i = d[key].indexOf(id); if (i >= 0) d[key].splice(i, 1); else { d[key].push(id); on = true; } });
    toast(on ? 'Ditambah ke kegemaran.' : 'Dibuang daripada kegemaran.', 'success', 1500);
    draw();
  }
  const mutateBank = (id, fn) => st().update('banks', d => { if (!d[id]) throw new Error(`Bank ${id} tiada.`); d[id].items = d[id].items || []; fn(d[id]); d[id].updatedAt = U.nowIso(); });

  // ------------------------------------------------------------------ Borang
  function itemForm(bid, item) {
    const b = bank(bid);
    const isNew = !item;
    const items = b.items || [];
    const has = k => items.some(x => x[k] != null && x[k] !== '') || (item && item[k] != null);
    const groups = [...new Set([...(b.groups || []).map(g => g.id), ...items.map(x => x.group).filter(Boolean)])];
    const fields = [
      { key: 'id', label: 'ID', readonly: !isNew, hint: isNew ? 'Kosongkan untuk dijana daripada nama.' : 'Dirujuk oleh RPH — tidak boleh diubah.' },
      bid === 'pak21' || has('name') ? { key: 'name', label: 'Nama (asal)', placeholder: 'cth. Gallery Walk' } : null,
      { key: 'ms', label: 'Label (Bahasa Melayu)', required: bid !== 'pak21' && bid !== 'pi-bidang' },
      { key: 'ar', label: 'Label (Arab)', dir: 'rtl' },
      { key: 'jawi', label: 'Label (Jawi)', dir: 'rtl' },
      groups.length || has('group') ? { key: 'group', label: 'Kumpulan', suggestions: groups } : null,
      bid === 'kbat' || bid === 'tp' || has('level') ? { key: 'level', label: 'Aras / tahap', type: 'number', min: 0 } : null,
      bid === 'kbat' ? { key: 'isKBAT', type: 'checkbox', text: 'Aras KBAT (aplikasi ke atas)' } : null,
      bid === 'pak21' || has('tags') ? { key: 'tags', label: 'Tag (pisahkan koma)', type: 'list', full: true, placeholder: 'cth. kumpulan, lisan' } : null,
      { key: 'note', label: 'Catatan', type: 'textarea', rows: 2, full: true },
    ].filter(Boolean);
    K().formModal({ title: isNew ? `Tambah item — ${(b.title && b.title.ms) || bid}` : `Sunting item — ${RPH.banks.label(item)}`, size: 'md', fields,
      values: item ? { ...item, tags: item.tags || [] } : {},
      onSave(v) {
        if (!v.ms && !v.name && !v.ar && !v.jawi) return 'Isi sekurang-kurangnya satu label.';
        let id = isNew ? (v.id || U.slug(v.ms || v.name || v.jawi || v.ar) || U.uid('item')) : item.id;
        if (isNew && items.some(x => x.id === id)) { if (v.id) return `ID "${id}" sudah wujud.`; id = K().uniqueId(id, x => items.some(z => z.id === x)); }
        const rec = { ...(item ? U.clone(item) : {}), id };
        ['name', 'ms', 'ar', 'jawi', 'group', 'note'].forEach(k => { if (k in v) { if (v[k]) rec[k] = v[k]; else delete rec[k]; } });
        if ('level' in v) { if (v.level != null) rec.level = v.level; else delete rec.level; }
        if ('isKBAT' in v) rec.isKBAT = !!v.isKBAT;
        if ('tags' in v) { if (v.tags.length) rec.tags = v.tags; else delete rec.tags; }
        if (isNew) { rec.custom = true; rec.createdAt = U.nowIso(); } else rec.updatedAt = U.nowIso();
        mutateBank(bid, bb => { const i = bb.items.findIndex(x => x.id === id); if (i >= 0) bb.items[i] = rec; else bb.items.push(rec); });
        toast(isNew ? 'Item ditambah.' : 'Item disimpan.', 'success'); draw();
      } });
  }

  function activityForm(item) {
    const isNew = !item;
    const subjOpts = [{ value: 'ALL', label: 'Semua subjek' }, ...st().subjects().map(s => ({ value: s.id, label: s.name.ms }))];
    K().formModal({ title: isNew ? 'Tambah aktiviti' : `Sunting aktiviti — ${item.name}`, size: 'md',
      values: item ? { ...item, phase: item.phase || '' } : { subjectIds: ['ALL'], minutes: 10, category: '' },
      fields: [
        { key: 'name', label: 'Nama aktiviti', required: true, full: true, placeholder: 'cth. Wordwall Matching' },
        { key: 'category', label: 'Kategori', suggestions: CATEGORIES, placeholder: 'cth. Permainan' },
        { key: 'minutes', label: 'Tempoh (minit)', type: 'number', min: 1, max: 120, required: true },
        { key: 'phase', label: 'Fasa (pilihan)', type: 'select', options: PHASES, placeholder: '— Mana-mana —' },
        { key: 'subjectIds', label: 'Subjek', type: 'checks', full: true, required: true, options: subjOpts },
        { key: 'description', label: 'Keterangan / langkah', type: 'textarea', rows: 4, full: true, placeholder: 'Langkah ringkas aktiviti. Teks Arab/Jawi dibenarkan.' },
        { key: 'ar', label: 'Teks aktiviti (Arab, pilihan)', type: 'textarea', rows: 2, dir: 'rtl', full: true },
        { key: 'jawi', label: 'Teks aktiviti (Jawi, pilihan)', type: 'textarea', rows: 2, dir: 'rtl', full: true },
      ],
      onSave(v) {
        if (!(v.minutes > 0)) return 'Tempoh mesti lebih daripada 0 minit.';
        const items = (bank('activities') || { items: [] }).items || [];
        const id = isNew ? K().uniqueId(`akt-${U.slug(v.name) || 'baharu'}`, x => items.some(z => z.id === x)) : item.id;
        const subjectIds = v.subjectIds.includes('ALL') ? ['ALL'] : v.subjectIds;
        const rec = { ...(item ? U.clone(item) : { custom: true, createdAt: U.nowIso() }), id, name: v.name, ms: v.name, category: v.category || 'Lain-lain', subjectIds, minutes: v.minutes, description: v.description || '' };
        if (v.phase) rec.phase = v.phase; else delete rec.phase;
        ['ar', 'jawi'].forEach(k => { if (v[k]) rec[k] = v[k]; else delete rec[k]; });
        if (!isNew) rec.updatedAt = U.nowIso();
        mutateBank('activities', bb => { const i = bb.items.findIndex(x => x.id === id); if (i >= 0) bb.items[i] = rec; else bb.items.push(rec); });
        toast(isNew ? 'Aktiviti disimpan ke Bank Aktiviti Saya.' : 'Aktiviti dikemas kini.', 'success'); draw();
      } });
  }

  async function removeItem(bid, item) {
    if (!(await confirm({ title: 'Padam item', danger: true, confirmLabel: 'Padam', message: `Padam "${RPH.banks.label(item)}" daripada bank?${item.custom ? '' : '\nItem ini daripada data asal (sumber rasmi/contoh guru).'}\nRPH sedia ada yang menggunakannya tidak diubah.` }))) return;
    mutateBank(bid, bb => { bb.items = bb.items.filter(x => x.id !== item.id); });
    if (FAV[bid]) st().update('favourites', d => { d[FAV[bid]] = (d[FAV[bid]] || []).filter(x => x !== item.id); });
    toast('Item dipadam.', 'success'); draw();
  }

  function reflectionForm(idx) {
    const list = favs().reflection || [];
    const isNew = idx == null;
    K().formModal({ title: isNew ? 'Tambah refleksi kegemaran' : 'Sunting refleksi', size: 'md',
      intro: 'Ayat refleksi yang kerap digunakan. Gunakan {n} dan {total} sebagai pemegang tempat bilangan murid jika perlu.',
      values: { text: isNew ? '' : list[idx] },
      fields: [{ key: 'text', label: 'Ayat refleksi', type: 'textarea', rows: 3, full: true, required: true, placeholder: 'cth. {n}/{total} murid dapat menyebut kosa kata dengan betul.' }],
      onSave(v) {
        st().update('favourites', d => { d.reflection = d.reflection || []; if (isNew) d.reflection.push(v.text); else d.reflection[idx] = v.text; });
        toast('Refleksi disimpan.', 'success'); draw();
      } });
  }

  // ------------------------------------------------------------------ Paparan
  let root = null, alive = () => false, listHost = null;

  function starBtn(bid, item) {
    const key = FAV[bid]; if (!key) return null;
    const on = isFav(key, item.id);
    return h('button', { type: 'button', class: ['adm-star', on ? 'is-on' : null], title: on ? 'Buang daripada kegemaran' : 'Tandakan kegemaran', 'aria-pressed': String(on), 'aria-label': on ? 'Buang kegemaran' : 'Tandakan kegemaran', onClick: () => toggleFav(key, item.id) }, icon('star', 16));
  }
  const textMatch = (it, q) => !q || JSON.stringify([it.id, it.name, it.ms, it.ar, it.jawi, it.tags, it.category, it.description, it.group]).toLowerCase().includes(q.toLowerCase()) || RPH.jawi.normalizeForMatch(JSON.stringify([it.ar, it.jawi])).includes(RPH.jawi.normalizeForMatch(q));

  function genericTable(bid) {
    const b = bank(bid);
    if (!b) return empty(`Bank "${bid}" tiada dalam data.`);
    const ro = READONLY.has(bid);
    let items = (b.items || []).filter(it => textMatch(it, state.q));
    if (state.favOnly && FAV[bid]) items = items.filter(it => isFav(FAV[bid], it.id));
    const hasName = (b.items || []).some(x => x.name);
    const hasGroup = (b.items || []).some(x => x.group) || (b.groups || []).length;
    const hasTags = (b.items || []).some(x => (x.tags || []).length);
    const cols = [
      FAV[bid] ? { label: '', cls: 'adm-starcol', render: it => starBtn(bid, it) } : null,
      hasName ? { label: 'Nama', render: it => h('strong', null, it.name || '—') } : null,
      { label: 'Melayu', render: it => it.ms || h('span', { class: 'muted' }, '—') },
      { label: 'Arab', render: it => (it.ar ? K().rtl(it.ar) : h('span', { class: 'muted' }, '—')) },
      { label: 'Jawi', render: it => (it.jawi ? K().rtl(it.jawi, 'jawi') : h('span', { class: 'muted' }, '—')) },
      hasGroup ? { label: 'Kumpulan', render: it => (it.group ? chip(it.group, 'slate') : '—') } : null,
      bid === 'kbat' ? { label: 'Aras', render: it => h('span', null, String(it.level ?? '—'), it.isKBAT ? [' ', chip('KBAT', 'gold')] : null) } : null,
      bid === 'status' ? { label: 'Paparan', render: it => RPH.ui.badge(it.id, it.ms) } : null,
      hasTags ? { label: 'Tag', render: it => h('div', { class: 'pill-list' }, (it.tags || []).map(t => h('span', { class: 'adm-tag' }, t))) } : null,
      { label: 'Sumber', render: it => (it.custom ? chip('Tersuai', 'violet') : (it.sources || []).length ? h('span', { class: 'muted small', title: it.sources.join('\n') }, `${it.sources.length} sumber`) : h('span', { class: 'muted small' }, '—')) },
      ro ? null : { label: '', cls: 'adm-actions-cell', render: it => h('div', { class: 'row adm-tight' }, K().iconBtn('edit', 'Sunting', () => itemForm(bid, it)), K().iconBtn('trash', 'Padam', () => removeItem(bid, it), 'danger')) },
    ].filter(Boolean);
    return RPH.ui.table(cols, items, { emptyText: state.q || state.favOnly ? 'Tiada item sepadan.' : 'Bank ini kosong.' });
  }

  function activitiesView() {
    const b = bank('activities');
    if (!b) return empty('Bank aktiviti tiada dalam data.');
    let items = (b.items || []).filter(it => textMatch(it, state.q));
    if (state.favOnly) items = items.filter(it => isFav('activities', it.id));
    if (!(b.items || []).length) return empty('Belum ada aktiviti sendiri. Simpan aktiviti kegemaran anda (cth. "Wordwall Matching", Permainan, Semua subjek, 10 minit) untuk digunakan semula semasa menjana RPH.', button('Tambah Aktiviti', { kind: 'primary', icon: 'plus', onClick: () => activityForm(null) }));
    if (!items.length) return empty('Tiada aktiviti sepadan.');
    const subjName = id => (id === 'ALL' ? 'Semua' : (st().subject(id) || { name: { ms: id } }).name.ms);
    return h('div', { class: 'adm-act-grid' }, items.map(it => h('article', { class: 'card adm-act' },
      h('div', { class: 'adm-act-head' }, starBtn('activities', it), h('h3', null, it.name || it.ms || it.id), h('span', { class: 'badge badge-gold' }, `${it.minutes || '?'} min`)),
      h('div', { class: 'pill-list' }, chip(it.category || 'Lain-lain', 'blue'), it.phase ? chip((PHASES.find(p => p.value === it.phase) || {}).label || it.phase, 'violet') : null, (it.subjectIds || []).map(s => chip(subjName(s), 'slate'))),
      it.description ? K().mixed(it.description, 'p', 'adm-act-desc') : null,
      it.ar ? h('p', { class: 'adm-act-desc' }, K().rtl(it.ar)) : null,
      it.jawi ? h('p', { class: 'adm-act-desc' }, K().rtl(it.jawi, 'jawi')) : null,
      h('div', { class: 'row adm-act-foot' }, K().iconBtn('edit', 'Sunting', () => activityForm(it)), K().iconBtn('copy', 'Salin', () => {
        const items2 = bank('activities').items;
        const copy = { ...U.clone(it), id: K().uniqueId(`${it.id}-salinan`, x => items2.some(z => z.id === x)), name: `${it.name} (salinan)`, ms: `${it.name} (salinan)`, createdAt: U.nowIso(), custom: true };
        mutateBank('activities', bb => { bb.items.splice(bb.items.findIndex(x => x.id === it.id) + 1, 0, copy); });
        toast('Aktiviti disalin.', 'success'); draw();
      }), K().iconBtn('trash', 'Padam', () => removeItem('activities', it), 'danger')))));
  }

  function reflectionView() {
    const list = favs().reflection || [];
    if (!list.length) return empty('Tiada refleksi kegemaran.', button('Tambah Refleksi', { kind: 'primary', icon: 'plus', onClick: () => reflectionForm(null) }));
    return h('ol', { class: 'adm-refl' }, list.map((t, i) => h('li', null, K().mixed(t, 'span', 'adm-refl-text'),
      h('span', { class: 'row adm-tight' }, K().iconBtn('edit', 'Sunting', () => reflectionForm(i)), K().iconBtn('trash', 'Padam', async () => {
        if (!(await confirm({ title: 'Padam refleksi', danger: true, confirmLabel: 'Padam', message: 'Padam ayat refleksi ini?' }))) return;
        st().update('favourites', d => { d.reflection.splice(i, 1); }); toast('Dipadam.', 'success'); draw();
      }, 'danger')))));
  }

  function drawList() {
    if (!listHost) return;
    clear(listHost);
    listHost.appendChild(state.tab === 'activities' ? activitiesView() : state.tab === 'reflection' ? reflectionView() : genericTable(state.tab));
  }

  function draw() {
    if (!alive()) return;
    clear(root);
    const f = favs();
    const nFav = (f.activities || []).length + (f.pak21 || []).length + (f.bbm || []).length + (f.reflection || []).length;
    root.append(RPH.ui.pageHeader('Bank Aktiviti', `Bank pilihan untuk penjana RPH. ${nFav} kegemaran disimpan.`, []));
    const tabItems = TABS.filter(t => t.id === 'reflection' || bank(t.id)).map(t => {
      const n = t.id === 'reflection' ? (f.reflection || []).length : ((bank(t.id) || {}).items || []).length;
      return { id: t.id, label: `${t.label} (${n})` };
    });
    if (!tabItems.some(t => t.id === state.tab)) state.tab = 'activities';
    const tabBar = tabs(tabItems, state.tab, id => { state.tab = id; state.q = ''; state.favOnly = false; draw(); });
    tabBar.classList.add('adm-wrap-tabs');
    root.appendChild(tabBar);
    const b = bank(state.tab);
    const ro = READONLY.has(state.tab);
    const search = RPH.ui.input({ type: 'search', value: state.q, placeholder: 'Cari…', onInput: U.debounce(v => { state.q = v; drawList(); }, 250) });
    search.setAttribute('aria-label', 'Cari dalam bank');
    const favCb = h('input', { type: 'checkbox', checked: state.favOnly, onChange: () => { state.favOnly = favCb.checked; drawList(); } });
    const addBtn = state.tab === 'activities' ? button('Tambah Aktiviti', { kind: 'primary', icon: 'plus', onClick: () => activityForm(null) })
      : state.tab === 'reflection' ? button('Tambah Refleksi', { kind: 'primary', icon: 'plus', onClick: () => reflectionForm(null) })
        : ro ? null : button('Tambah Item', { kind: 'primary', icon: 'plus', onClick: () => itemForm(state.tab, null) });
    const notes = b ? [b.note, b.rule, b.tagsNote].filter(Boolean) : [];
    listHost = h('div', { class: 'adm-bank-host' });
    root.appendChild(RPH.ui.card({
      title: state.tab === 'reflection' ? 'Refleksi Kegemaran' : (b && b.title ? [b.title.ms, b.title.ar ? h('span', { class: 'muted' }, ' · ', K().rtl(b.title.ar)) : null, b.title.jawi ? h('span', { class: 'muted' }, ' · ', K().rtl(b.title.jawi, 'jawi')) : null] : state.tab),
      subtitle: ro ? 'Baca sahaja — ditetapkan sistem.' : state.tab === 'activities' ? 'Aktiviti sendiri untuk digunakan semula (§49).' : null,
      actions: [state.tab !== 'reflection' ? search : null, FAV[state.tab] ? h('label', { class: 'check small' }, favCb, h('span', null, 'Kegemaran sahaja')) : null, addBtn].filter(Boolean),
      body: h('div', { class: 'stack' }, notes.map(n => h('div', { class: 'notice notice-info' }, icon('info'), K().mixed(n))), listHost),
    }));
    drawList();
  }

  RPH.views.bank = {
    title: 'Bank Aktiviti', icon: 'bank',
    render(el, params) {
      root = el; alive = K().mount(el, 'bank');
      if (params && params.tab) state.tab = params.tab;
      draw();
    },
  };
})(window.RPH = window.RPH || {});
