/* Explicit projection: never copy entire clinical/profile documents into analytics. */
(function(root) {
  function projectCheck(record) {
    const result = {};
    for (const key of ['id','student_uid','date','emotion','emotion_label','mood','mood_key','stress','need','emotion_checkin_3step']) {
      const value = record[key];
      if (['string','number','boolean'].includes(typeof value)) result[key] = value;
    }
    return result;
  }
  function completedByDate(records, dates) {
    const counts = Object.fromEntries(dates.map(date => [date, 0]));
    for (const record of records) {
      if (!Object.hasOwn(counts, record.date)) continue;
      const survey = record.wellbeing_data;
      if (record.emotion || survey?.emotion || (survey && typeof survey === 'object' && Object.keys(survey).length)) counts[record.date]++;
    }
    return counts;
  }
  root.AnalyticsPrivacy = { projectCheck, completedByDate };
  if (typeof module !== 'undefined') module.exports = root.AnalyticsPrivacy;
})(typeof window === 'undefined' ? globalThis : window);
