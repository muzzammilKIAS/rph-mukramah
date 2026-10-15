/* Enjin minggu sekolah (ikut takwim sekolah, BUKAN ISO) + jadual waktu berversi. */
(function (RPH) {
  'use strict';
  const U = () => RPH.util;
  const calData = () => RPH.store.get('calendar') || { weeks: [], days: [] };
  let dayIndex = null, dayIndexFor = null;

  function index() {
    const c = calData();
    if (dayIndexFor !== c) { dayIndex = new Map((c.days || []).map(d => [d.date, d])); dayIndexFor = c; }
    return dayIndex;
  }

  const cal = {
    today() { const s = RPH.store.get('settings') || {}; return s.debugToday || U().todayLocal(); },
    day(iso) {
      const d = index().get(iso);
      if (d) return d;
      // Tarikh di luar takwim: kira minggu daripada julat minggu jika ada.
      const dow = U().dow(iso);
      return { date: iso, dow, week: cal.schoolWeek(iso), schoolDay: false, holiday: null, events: [], outside: true };
    },
    /** getSchoolWeek(date) — nombor minggu ikut takwim sekolah. */
    schoolWeek(iso) {
      const d = index().get(iso);
      if (d && d.week != null) return d.week;
      const w = (calData().weeks || []).find(x => iso >= x.start && iso <= U().addDays(x.start, 6));
      return w ? w.week : null;
    },
    weeks: () => calData().weeks || [],
    week: n => (calData().weeks || []).find(w => w.week === +n) || null,
    weekDates(n) { const w = cal.week(n); if (!w) return []; return [0, 1, 2, 3, 4, 5, 6].map(i => U().addDays(w.start, i)); },
    /** Minggu RPT bagi minggu sekolah (pemetaan A/B; subjek boleh override). */
    rptWeek(schoolWeek, subjectId) {
      const c = calData(); if (schoolWeek == null) return null;
      const ay = RPH.store.academicYear();
      const subj = subjectId && RPH.store.subject(subjectId);
      const mode = (subj && subj.rptWeekMapping) || (ay && ay.rptWeekMapping) || (c.rptWeekMap && c.rptWeekMap.default) || 'A';
      const map = c.rptWeekMap && c.rptWeekMap[mode] && c.rptWeekMap[mode].map;
      return map && map[schoolWeek] != null ? +map[schoolWeek] : schoolWeek;
    },
    timetableVersionFor(iso) {
      const tt = RPH.store.get('timetable') || { versions: [] };
      const ok = v => (!v.effectiveFrom || iso >= v.effectiveFrom) && (!v.effectiveTo || iso <= v.effectiveTo);
      const cands = tt.versions.filter(ok);
      // Utamakan versi lengkap yang paling lewat berkuat kuasa.
      return cands.sort((a, b) => (b.partial ? 0 : 1) - (a.partial ? 0 : 1) || String(b.effectiveFrom || '').localeCompare(String(a.effectiveFrom || '')))[0] || null;
    },
    /** Slot hari itu. Slot bertanda rph:false (cth. PAI Tahun 3 — keputusan guru) tidak dirancang/dijana kecuali includeNoRph. */
    slotsFor(iso, { includeNonPdP = false, includeNoRph = false } = {}) {
      const v = cal.timetableVersionFor(iso); if (!v) return [];
      const d = cal.day(iso);
      const dow = d.followsDow != null ? +d.followsDow : U().dow(iso); // Sabtu ganti ikut hari yang digantikan
      return v.slots.filter(s => s.day === dow && (includeNonPdP || s.kind === 'PdP') && (includeNoRph || s.rph !== false)).map(s => ({ ...s, versionId: v.id }))
        .sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
    },
    slotsForWeek(n) {
      return cal.weekDates(n).flatMap(date => { const d = cal.day(date); return d.schoolDay ? cal.slotsFor(date).map(slot => ({ date, slot })) : []; });
    },
    isSchoolDay: iso => !!cal.day(iso).schoolDay,
    eventsFor: iso => cal.day(iso).events || [],
    termOf(iso) { const w = cal.week(cal.schoolWeek(iso)); return w ? w.term : null; },
  };
  RPH.cal = cal;
})(window.RPH = window.RPH || {});
