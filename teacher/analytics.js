// ClassCare - Classroom Emotional Climate & Behavior Analytics Controller
(function () {
  'use strict';

  let currentPeriod = 'daily'; // 'daily' | 'weekly' | 'monthly'
  let currentSearchQuery = '';

  const $ = id => document.getElementById(id);

  function getEnrolledStudents() {
    const state = window.TeacherScannerState;
    if (!state?.students) return [];
    return Array.from(state.students.values());
  }

  function getHolisticData() {
    const state = window.TeacherScannerState;
    return state?.holisticData || {};
  }

  function getPeriodStartDate(period) {
    const now = new Date();
    if (period === 'daily') {
      return window.Utils?.todayIso() || now.toISOString().slice(0, 10);
    }
    const days = period === 'weekly' ? 7 : 30;
    const start = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const y = start.getFullYear();
    const m = String(start.getMonth() + 1).padStart(2, '0');
    const d = String(start.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function renderAnalytics() {
    const container = $('tab-teacher-analytics');
    if (!container) return;

    const students = getEnrolledStudents();
    const holistic = getHolisticData();
    const startDate = getPeriodStartDate(currentPeriod);
    const today = window.Utils?.todayIso() || new Date().toISOString().slice(0, 10);

    // Filter attendance and emotional check-in records for current period and section
    const studentUids = new Set(students.map(s => s.uid));
    const allAttendance = (holistic.attendance || []).filter(r => studentUids.has(r.student_uid) && String(r.date) >= startDate);
    const allChecks = (holistic.checks || []).filter(r => studentUids.has(r.student_uid) && String(r.date) >= startDate);

    // Merge recent check-in entries from TeacherCareState
    const recentMemoryChecks = (window.TeacherCareState?.recentCheckins || []).filter(r => studentUids.has(r.student_uid) && String(r.date) >= startDate);
    const combinedChecks = [...allChecks];
    recentMemoryChecks.forEach(rc => {
      if (!combinedChecks.some(c => c.id === rc.id || (c.student_uid === rc.student_uid && c.date === rc.date))) {
        combinedChecks.push(rc);
      }
    });

    // Also extract mood/stress/need directly from attendance records (from daily kiosk)
    allAttendance.forEach(att => {
      if ((att.mood || att.emotion_checkin_3step) && !combinedChecks.some(c => c.student_uid === att.student_uid && c.date === att.date)) {
        combinedChecks.push({
          student_uid: att.student_uid,
          date: att.date,
          emotion: att.mood_key || att.mood,
          emotion_label: att.mood,
          mood: att.mood,
          stress: att.stress,
          need: att.need
        });
      }
    });

    // 1. KPI Calculations
    const totalStudents = students.length || 1;
    const checkedInUids = new Set(combinedChecks.map(c => c.student_uid));
    const participationRate = Math.min(100, Math.round((checkedInUids.size / totalStudents) * 100));

    // Mood buckets
    const moodCounts = {
      very_good: 0,
      good: 0,
      okay: 0,
      not_good: 0
    };

    // Need buckets
    const needCounts = {
      encouragement: 0,
      rest: 0,
      someone_to_talk_to: 0,
      time_for_myself: 0
    };

    let totalMoodEntries = 0;
    let positiveMoodEntries = 0;
    const distressStudents = new Set();

    combinedChecks.forEach(c => {
      const rawMood = String(c.emotion_label || c.mood || c.emotion || '').toLowerCase();
      totalMoodEntries += 1;

      if (rawMood.includes('very good') || rawMood.includes('happy') || rawMood.includes('excited') || rawMood.includes('energized')) {
        moodCounts.very_good += 1;
        positiveMoodEntries += 1;
      } else if (rawMood.includes('good') || rawMood.includes('calm') || rawMood.includes('content') || rawMood.includes('ready')) {
        moodCounts.good += 1;
        positiveMoodEntries += 1;
      } else if (rawMood.includes('okay') || rawMood.includes('normal')) {
        moodCounts.okay += 1;
      } else if (rawMood.includes('not good') || rawMood.includes('sad') || rawMood.includes('stressed') || rawMood.includes('upset') || rawMood.includes('tired')) {
        moodCounts.not_good += 1;
        distressStudents.add(c.student_uid);
      } else {
        moodCounts.okay += 1;
      }

      // Check needs
      const rawNeed = String(c.need || '').toLowerCase();
      if (rawNeed.includes('someone to talk to') || rawNeed.includes('talk')) {
        needCounts.someone_to_talk_to += 1;
        distressStudents.add(c.student_uid);
      } else if (rawNeed.includes('encouragement')) {
        needCounts.encouragement += 1;
      } else if (rawNeed.includes('rest')) {
        needCounts.rest += 1;
      } else if (rawNeed.includes('time') || rawNeed.includes('myself')) {
        needCounts.time_for_myself += 1;
      }
    });

    const climateIndex = totalMoodEntries > 0 ? Math.round((positiveMoodEntries / totalMoodEntries) * 100) : (totalStudents ? 85 : 0);

    // Primary Vibe
    const moodEntries = [
      { label: '🤩 Very Good', count: moodCounts.very_good },
      { label: '🙂 Good & Calm', count: moodCounts.good },
      { label: '😐 Okay', count: moodCounts.okay },
      { label: '😔 Challenged', count: moodCounts.not_good }
    ].sort((a, b) => b.count - a.count);

    const primaryVibe = totalMoodEntries > 0 ? moodEntries[0].label : 'Waiting for check-ins';

    // Update KPIs in DOM
    const indexVal = $('climate-index-val');
    if (indexVal) {
      indexVal.textContent = totalMoodEntries > 0 ? `${climateIndex}%` : '—';
      indexVal.style.color = climateIndex >= 75 ? '#10b981' : climateIndex >= 50 ? '#f59e0b' : '#ef4444';
    }

    const partVal = $('climate-participation-val');
    if (partVal) partVal.textContent = `${participationRate}%`;

    const vibeVal = $('climate-primary-vibe');
    if (vibeVal) vibeVal.textContent = primaryVibe;

    const distressVal = $('climate-distress-count');
    if (distressVal) distressVal.textContent = String(distressStudents.size);

    const periodTag = $('climate-period-tag');
    if (periodTag) {
      periodTag.textContent = currentPeriod === 'daily' ? 'Today' : currentPeriod === 'weekly' ? 'Past 7 Days' : 'Past 30 Days';
    }

    // 2. Render Mood Progress Bars
    const moodBarsContainer = $('climate-mood-bars');
    if (moodBarsContainer) {
      const bars = [
        { label: '🤩 Very Good & Energized', count: moodCounts.very_good, color: '#10b981' },
        { label: '🙂 Good & Calm', count: moodCounts.good, color: '#3b82f6' },
        { label: '😐 Okay / Neutral', count: moodCounts.okay, color: '#64748b' },
        { label: '😔 Stressed / Needs Attention', count: moodCounts.not_good, color: '#ef4444' }
      ];

      moodBarsContainer.innerHTML = bars.map(bar => {
        const pct = totalMoodEntries > 0 ? Math.round((bar.count / totalMoodEntries) * 100) : 0;
        return `
          <div>
            <div style="display:flex;justify-content:space-between;font-size:0.85rem;font-weight:750;margin-bottom:4px;">
              <span>${bar.label}</span>
              <span>${pct}% <span style="font-weight:500;color:var(--text-muted);">(${bar.count})</span></span>
            </div>
            <div style="height:8px;background:var(--bg-muted,#f1f5f9);border-radius:4px;overflow:hidden;">
              <div style="width:${pct}%;height:100%;background:${bar.color};border-radius:4px;transition:width 0.4s ease;"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    // 3. Render Needs Progress Bars
    const needsBarsContainer = $('climate-needs-bars');
    if (needsBarsContainer) {
      const totalNeeds = needCounts.encouragement + needCounts.rest + needCounts.someone_to_talk_to + needCounts.time_for_myself;
      const needs = [
        { label: '💬 Someone to talk to (Care Support)', count: needCounts.someone_to_talk_to, color: '#ec4899', isAlert: true },
        { label: '✨ Encouragement & Motivation', count: needCounts.encouragement, color: '#6366f1' },
        { label: '🧘 Rest & Calming Break', count: needCounts.rest, color: '#0ea5e9' },
        { label: '⏳ Quiet Time for Myself', count: needCounts.time_for_myself, color: '#8b5cf6' }
      ];

      needsBarsContainer.innerHTML = needs.map(item => {
        const pct = totalNeeds > 0 ? Math.round((item.count / totalNeeds) * 100) : 0;
        return `
          <div>
            <div style="display:flex;justify-content:space-between;font-size:0.85rem;font-weight:750;margin-bottom:4px;">
              <span>${item.label}</span>
              <span>${pct}% <span style="font-weight:500;color:var(--text-muted);">(${item.count})</span></span>
            </div>
            <div style="height:8px;background:var(--bg-muted,#f1f5f9);border-radius:4px;overflow:hidden;">
              <div style="width:${pct}%;height:100%;background:${item.color};border-radius:4px;transition:width 0.4s ease;"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    // 4. Render Student Table
    const tbody = $('climate-students-tbody');
    if (tbody) {
      const filteredStudents = students.filter(s => {
        if (!currentSearchQuery) return true;
        const q = currentSearchQuery.toLowerCase();
        const fullName = `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase();
        return fullName.includes(q) || String(s.student_id || '').toLowerCase().includes(q);
      });

      if (!filteredStudents.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">No matching students found in this section.</td></tr>`;
        return;
      }

      tbody.innerHTML = filteredStudents.map(student => {
        const fullName = `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Student';
        const sChecks = combinedChecks.filter(c => c.student_uid === student.uid);
        const sAttendance = allAttendance.filter(a => a.student_uid === student.uid);

        // Check-in rate
        const expectedDays = currentPeriod === 'daily' ? 1 : currentPeriod === 'weekly' ? 5 : 20;
        const ratePct = Math.min(100, Math.round((sChecks.length / expectedDays) * 100));

        // Dominant feeling
        let dominantFeeling = '—';
        let isStressed = false;
        if (sChecks.length) {
          const lastCheck = sChecks[sChecks.length - 1];
          dominantFeeling = lastCheck.emotion_label || lastCheck.mood || lastCheck.emotion || 'Checked in';
          isStressed = String(dominantFeeling).toLowerCase().includes('not good') || String(dominantFeeling).toLowerCase().includes('stressed');
        }

        // Needs
        const lastNeed = sChecks[sChecks.length - 1]?.need || '—';
        const needsTalk = String(lastNeed).toLowerCase().includes('someone to talk to');

        return `
          <tr>
            <td>
              <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:34px;height:34px;border-radius:8px;background:var(--bg-muted);display:grid;place-items:center;font-weight:800;font-size:0.85rem;">
                  ${window.Utils?.initialsOf?.(student) || 'ST'}
                </div>
                <div>
                  <strong style="display:block;font-size:0.92rem;">${escapeHtml(fullName)}</strong>
                  <span style="font-size:0.75rem;color:var(--text-muted);">ID: ${escapeHtml(student.student_id || '—')}</span>
                </div>
              </div>
            </td>
            <td>
              <span class="status-badge ${ratePct >= 80 ? 'status-present' : ratePct >= 50 ? 'status-late' : 'status-not-recorded'}" style="font-size:0.78rem;padding:3px 8px;">
                ${ratePct}% (${sChecks.length} checks)
              </span>
            </td>
            <td>
              <span style="font-weight:750;font-size:0.88rem;color:${isStressed ? '#ef4444' : 'inherit'};">
                ${isStressed ? '⚠️ ' : ''}${escapeHtml(dominantFeeling)}
              </span>
            </td>
            <td>
              <span style="font-size:0.82rem;color:${isStressed ? '#dc2626' : 'var(--text-muted)'};font-weight:${isStressed ? '750' : 'normal'};">
                ${isStressed ? 'High Stress Detected' : sChecks.length ? 'Grounded / Calm' : 'No data yet'}
              </span>
            </td>
            <td>
              <span style="font-size:0.82rem;color:${needsTalk ? '#ec4899;font-weight:750;' : 'var(--text-secondary);'}">
                ${needsTalk ? '🚨 Needs to talk' : escapeHtml(lastNeed)}
              </span>
            </td>
            <td>
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.openStudentEmotionTimelineModal?.('${student.uid}')" style="font-size:0.75rem;padding:4px 10px;border-radius:8px;font-weight:700;">
                Timeline
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // -------------------------------------------------------------
  // Automated Weekly Parent Wellness Digest Batch Dispatcher
  // -------------------------------------------------------------
  async function sendWeeklyParentDigestBatch() {
    const students = getEnrolledStudents();
    const withEmail = students.filter(s => s.parent_email || window.Utils?.isEmail?.(s.parent_contact));

    if (!students.length) {
      window.Toast?.warn('No students found in the current section.');
      return;
    }

    if (!withEmail.length) {
      window.Toast?.error('None of the students in this section have a parent email configured.');
      return;
    }

    const config = window.CLASSCARE_CONFIG?.emailjs || window.ClassCare?.EMAILJS_CONFIG || {};
    const publicKey = String(config.publicKey || '').trim();
    const serviceId = String(config.serviceId || '').trim();
    const templateId = String(config.templateWeeklyDigest || config.templateId || '').trim();

    if (!window.emailjs || !publicKey || publicKey.startsWith('YOUR_') || !serviceId || !templateId) {
      window.Toast?.error('EmailJS is not configured yet in js/config.js.');
      return;
    }

    const confirmed = confirm(
      `Send 7-Day Weekly Attendance & Wellness Digest to ${withEmail.length} parent(s)?\n\n` +
      `Students with parent emails on file: ${withEmail.length} / ${students.length}`
    );
    if (!confirmed) return;

    window.Toast?.info(`Dispatching weekly digests to ${withEmail.length} parent(s)…`);

    try {
      if (typeof window.emailjs?.init === 'function') {
        try { window.emailjs.init(publicKey); } catch (_) {}
        try { window.emailjs.init({ publicKey }); } catch (_) {}
      }
    } catch (_) {}

    const holistic = getHolisticData();
    const startDate = getPeriodStartDate('weekly');
    let sentCount = 0;
    let failCount = 0;

    for (const student of withEmail) {
      const recipient = String(student.parent_email || student.parent_contact).trim().toLowerCase();
      const sName = `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Student';

      // 7-day attendance summary
      const sAtt = (holistic.attendance || []).filter(a => a.student_uid === student.uid && String(a.date) >= startDate);
      const presentCount = sAtt.filter(a => a.status === 'Present').length;
      const lateCount = sAtt.filter(a => a.status === 'Late').length;
      const attSummary = `${presentCount} Present, ${lateCount} Late (Past 7 days)`;

      // 7-day wellness summary
      const sChecks = (holistic.checks || []).filter(c => c.student_uid === student.uid && String(c.date) >= startDate);
      let posCount = 0;
      let negCount = 0;
      sChecks.forEach(c => {
        const raw = String(c.emotion_label || c.mood || c.emotion || '').toLowerCase();
        if (raw.includes('good') || raw.includes('happy') || raw.includes('calm')) posCount++;
        else if (raw.includes('not good') || raw.includes('stressed') || raw.includes('upset')) negCount++;
      });
      const wellSummary = `${posCount} positive / grounded day(s), ${negCount} challenging day(s)`;

      try {
        await window.emailjs.send(serviceId, templateId, {
          to_email: recipient,
          recipient_email: recipient,
          email: recipient,
          user_email: recipient,
          parent_email: recipient,
          to_name: sName,
          student_name: sName,
          student_id: student.student_id || '—',
          section: student.section || '—',
          date: `Week of ${startDate}`,
          status: 'Weekly Wellness & Attendance Digest',
          time_in: '—',
          time_out: '—',
          attendance_summary: attSummary,
          wellness_summary: wellSummary,
          message: `Weekly School Summary for ${sName}:\nAttendance: ${attSummary}\nEmotional Wellbeing: ${wellSummary}`
        }, publicKey);
        sentCount++;
      } catch (err) {
        console.warn(`[digest] Failed to email parent for ${sName}:`, err);
        failCount++;
      }
    }

    if (sentCount > 0) {
      window.Toast?.success(`Sent ${sentCount} weekly digest email(s) successfully!`);
    }
    if (failCount > 0) {
      window.Toast?.warn(`${failCount} email(s) could not be delivered. Check EmailJS template & quotas.`);
    }
  }

  // -------------------------------------------------------------
  // Initialization & Event Listeners
  // -------------------------------------------------------------
  function initAnalyticsControls() {
    // Period buttons
    document.querySelectorAll('.analytics-period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.analytics-period-btn').forEach(b => {
          b.classList.remove('active');
          b.style.background = 'transparent';
          b.style.boxShadow = 'none';
        });
        btn.classList.add('active');
        btn.style.background = '#ffffff';
        btn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
        currentPeriod = btn.dataset.period || 'daily';
        renderAnalytics();
      });
    });

    // Search input
    $('climate-search-student')?.addEventListener('input', e => {
      currentSearchQuery = e.target.value.trim();
      renderAnalytics();
    });

    // Send digest button
    $('btn-send-weekly-digest')?.addEventListener('click', sendWeeklyParentDigestBatch);

    // Initial render
    renderAnalytics();
  }

  window.addEventListener('classcare:live-data', () => {
    renderAnalytics();
  });

  window.addEventListener('classcare:roster-updated', () => {
    renderAnalytics();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAnalyticsControls);
  } else {
    initAnalyticsControls();
  }

  window.ClassCareAnalytics = {
    render: renderAnalytics,
    sendWeeklyParentDigestBatch
  };
})();
