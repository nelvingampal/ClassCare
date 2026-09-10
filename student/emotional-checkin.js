/* ============================================================
   student/emotional-checkin.js — Student Emotion Tap &
   Constructivist Self-Reflection Timeline.
   Writes to `emotional_checkins` collection and synchronizes
   instantaneously across portals in real time.
   ============================================================ */
(function () {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  let cachedUser = null;
  let _unsubToday = null;
  let _unsubTimeline = null;
  let _recentCheckins = [];

  const POSITIVE = [
    { key: "happy",     label: "Happy",       emoji: "😊", desc: "Joyful & positive" },
    { key: "calm",      label: "Calm",        emoji: "😌", desc: "Peaceful & centered" },
    { key: "excited",   label: "Excited",     emoji: "🤩", desc: "Eager & energized" },
    { key: "content",   label: "Content",     emoji: "🙂", desc: "Satisfied & steady" },
    { key: "motivated", label: "Motivated",   emoji: "💪", desc: "Ready to achieve" },
    { key: "grateful",  label: "Grateful",    emoji: "🙏", desc: "Thankful & appreciative" },
    { key: "hopeful",   label: "Hopeful",     emoji: "🌟", desc: "Looking forward" },
    { key: "proud",     label: "Proud",       emoji: "🥰", desc: "Proud of progress" }
  ];

  const CHALLENGING = [
    { key: "tired",        label: "Tired",         emoji: "😴", desc: "Low energy or sleepy" },
    { key: "stressed",     label: "Stressed",      emoji: "😰", desc: "Under pressure" },
    { key: "anxious",      label: "Anxious",       emoji: "😟", desc: "Nervous or uneasy" },
    { key: "sad",          label: "Sad",           emoji: "😢", desc: "Down or grieving" },
    { key: "overwhelmed",  label: "Overwhelmed",   emoji: "😵", desc: "Too much to handle" },
    { key: "worried",      label: "Worried",       emoji: "🥺", desc: "Concerned about something" }
  ];

  const ALL = POSITIVE.concat(CHALLENGING);
  const LABEL_MAP = new Map(ALL.map(e => [e.key, e]));

  function escHtml(str) {
    return typeof ClassCareUI?.escapeHtml === "function"
      ? ClassCareUI.escapeHtml(str)
      : String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function todayIso() { return Utils.todayIso(); }

  function negativeSet() {
    return typeof ClassCare?.DB?.NEGATIVE_EMOTIONS !== "undefined"
      ? ClassCare.DB.NEGATIVE_EMOTIONS
      : new Set(CHALLENGING.map(e => e.key));
  }

  async function getCurrentUser() {
    if (cachedUser) return cachedUser;
    return new Promise(resolve => {
      let finished = false;
      const unsubscribe = ClassCare.onCurrentUser(user => {
        if (user?.uid && !user.__profileError && !finished) {
          finished = true; cachedUser = user; unsubscribe(); resolve(user);
        }
      });
      setTimeout(() => { if (!finished) { finished = true; unsubscribe(); resolve(null); } }, 2000);
    });
  }

  function stopListeners() {
    if (_unsubToday) { try { _unsubToday(); } catch (_) {} _unsubToday = null; }
    if (_unsubTimeline) { try { _unsubTimeline(); } catch (_) {} _unsubTimeline = null; }
  }

  // ─── Real-time Today Listener ──────────────────────────────
  function startTodayListener() {
    if (!cachedUser) return;
    const today = todayIso();
    const docId = ClassCare.DB.emotionalCheckinDocId(cachedUser.uid, today);
    try {
      _unsubToday = ClassCare.DB.emotional_checkins.doc(docId).onSnapshot(snap => {
        const d = snap.exists ? snap.data() : null;
        renderCheckinPanel(d);
      }, err => {
        console.warn("[emotional-checkin] today snapshot:", err);
        ClassCare.DB.emotional_checkins.doc(docId).get()
          .then(snap => renderCheckinPanel(snap.exists ? snap.data() : null))
          .catch(() => renderCheckinPanel(null));
      });
    } catch (e) {
      ClassCare.DB.emotional_checkins.doc(docId).get()
        .then(snap => renderCheckinPanel(snap.exists ? snap.data() : null))
        .catch(() => renderCheckinPanel(null));
    }
  }

  // ─── Real-time 14-day Timeline Listener ─────────────────────
  function startTimelineListener() {
    if (!cachedUser) return;
    _unsubTimeline = ClassCare.DB.emotional_checkins.where('student_uid','==',cachedUser.uid).onSnapshot(snap => {
      const now = new Date(); now.setDate(now.getDate()-13);
      const cutoff = ClassCareHolistic.schoolDate(now);
      _recentCheckins = snap.docs.map(doc => ({ ...doc.data(), id: doc.id })).filter(c => c.date >= cutoff)
        .sort((a,b) => String(b.date).localeCompare(String(a.date)) || ((b.created_at?.seconds || b.submitted_at?.seconds || 0) - (a.created_at?.seconds || a.submitted_at?.seconds || 0)));
      renderTimeline();
    }, error => { _recentCheckins = []; renderTimeline(); Toast.error('Emotional history unavailable: ' + error.message); });
  }

  function renderCheckinPanel(existing) {
    const wrap = $("#emotional-checkin-view");
    if (!wrap) return;

    if (!cachedUser) {
      wrap.innerHTML = '<div class="state-panel state-empty"><strong>Sign in to access your emotional check-in.</strong></div>';
      return;
    }

    const today = todayIso();

    if (existing && (existing.emotion || existing.emotion_label)) {
      const emoKey = String(existing.emotion || "").toLowerCase();
      const meta = LABEL_MAP.get(emoKey) || {
        label: existing.emotion_label || "Recorded",
        emoji: existing.emotion_emoji || "✨"
      };
      const isNeg = existing.is_negative || negativeSet().has(emoKey);

      wrap.innerHTML = `
        <div class="emotion-confirmed-card">
          <div class="emotion-confirmed-left">
            <span class="emotion-confirmed-emoji">${escHtml(meta.emoji)}</span>
            <div>
              <div class="emotion-confirmed-title">You're feeling <strong>${escHtml(meta.label)}</strong> today.</div>
              <div class="emotion-confirmed-time">Recorded at ${escHtml(existing.submitted_at_time || "Morning Arrival")} · ${escHtml(today)}</div>
              ${existing.note ? `<div style="margin-top:6px;font-size:0.84rem;color:var(--text-secondary);">"${escHtml(existing.note)}"</div>` : ""}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="priority-pill ${isNeg ? "moderate" : "resolved"}">${isNeg ? "Support Noted" : "Positive State"}</span>
            <button type="button" id="btn-update-checkin" class="btn btn-secondary btn-sm" style="font-size:0.8rem;padding:6px 12px;">Update feeling</button>
          </div>
        </div>`;

      $("#btn-update-checkin")?.addEventListener("click", () => renderTapGrid());
      return;
    }

    renderTapGrid();
  }

  // ─── Render Frictionless 1-Tap Grid ─────────────────────────
  function renderTapGrid() {
    const wrap = $("#emotional-checkin-view");
    if (!wrap) return;

    const firstName = cachedUser?.first_name || "Student";

    wrap.innerHTML = `
      <div class="emotion-tap-container">
        <div class="emotion-tap-header">
          <div>
            <h2 class="emotion-tap-prompt">How are you feeling right now, ${escHtml(firstName)}?</h2>
            <p class="emotion-tap-sub">Your reflection is private. It helps you recognize your feelings and helps teachers guide your day with care.</p>
          </div>
          <span class="priority-pill moderate" style="align-self:flex-start;">Daily Check-In</span>
        </div>

        <div style="margin-top:4px;">
          <div style="font-size:0.75rem;font-weight:750;text-transform:uppercase;letter-spacing:0.04em;color:var(--c-present);margin-bottom:8px;">
            ✦ Uplifting &amp; Steady
          </div>
          <div class="emotion-tap-grid">
            ${POSITIVE.slice(0, 6).map(e => `
              <button type="button" class="emotion-tap-btn" data-emotion="${escHtml(e.key)}" data-tone="positive">
                <span class="emo-emoji">${escHtml(e.emoji)}</span>
                <span class="emo-label">${escHtml(e.label)}</span>
                <span class="emo-desc">${escHtml(e.desc)}</span>
              </button>`).join("")}
          </div>
        </div>

        <div style="margin-top:8px;">
          <div style="font-size:0.75rem;font-weight:750;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-muted);margin-bottom:8px;">
            ✦ Reflective or Needs Support
          </div>
          <div class="emotion-tap-grid">
            ${CHALLENGING.map(e => `
              <button type="button" class="emotion-tap-btn" data-emotion="${escHtml(e.key)}" data-tone="support">
                <span class="emo-emoji">${escHtml(e.emoji)}</span>
                <span class="emo-label">${escHtml(e.label)}</span>
                <span class="emo-desc">${escHtml(e.desc)}</span>
              </button>`).join("")}
          </div>
        </div>

        <div id="checkin-note-drawer" style="margin-top:4px;display:flex;flex-direction:column;gap:6px;">
          <label class="field-label" for="student-checkin-note" style="font-size:0.8rem;color:var(--text-muted);">
            Optional personal note (only you &amp; counselor can read this)
          </label>
          <input id="student-checkin-note" class="field" placeholder="Anything specific on your mind today?" maxlength="180" style="min-height:38px;padding:8px 12px;font-size:0.85rem;" />
        </div>
      </div>`;

    wrap.querySelectorAll(".emotion-tap-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const emoKey = btn.dataset.emotion;
        submitEmotionTap(emoKey, $("#student-checkin-note")?.value || "");
      });
    });
  }

  // ─── 1-Tap Submission Pipeline ──────────────────────────────
  let _isSubmittingEmotion = false;
  async function submitEmotionTap(emotionKey, noteText = "") {
    if (_isSubmittingEmotion) return;
    const user = await getCurrentUser();
    if (!user) return Toast.error("Please sign in first.");

    _isSubmittingEmotion = true;
    const btns = document.querySelectorAll(".student-emotion-tap-btn");
    btns.forEach(b => b.disabled = true);

    const norm = (typeof ClassCare?.DB?.normalizeEmotion === "function")
      ? ClassCare.DB.normalizeEmotion(emotionKey)
      : {
          key: emotionKey,
          label: LABEL_MAP.get(emotionKey)?.label || emotionKey,
          emoji: LABEL_MAP.get(emotionKey)?.emoji || "✨",
          is_negative: negativeSet().has(emotionKey)
        };

    const today = todayIso();
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const docId = ClassCare.DB.emotionalCheckinDocId(user.uid, today);

    const payload = {
      uid: user.uid,
      student_uid: user.uid,
      student_name: `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email || "Student",
      student_id: user.student_id || "",
      section: user.section || "",
      emotion: norm.key,
      emotion_label: norm.label,
      emotion_emoji: norm.emoji,
      is_negative: norm.is_negative,
      note: String(noteText || "").trim().slice(0, 280),
      date: today,
      submitted_at: firebase.firestore.FieldValue.serverTimestamp(),
      submitted_at_time: `${hh}:${mm}`
    };

    try {
      await ClassCare.DB.emotional_checkins.doc(docId).set(payload, { merge: true });
      Toast.success(`Feeling recorded: ${norm.emoji} ${norm.label}`);
    } catch (err) {
      Toast.error('Feeling not saved: ' + err.message + '. Please try again.');
    } finally {
      _isSubmittingEmotion = false;
      btns.forEach(b => b.disabled = false);
    }
  }

  // ─── Render Constructivist Self-Reflection Timeline ─────────
  function renderTimeline() {
    const wrap = $("#self-reflection-timeline-view");
    if (!wrap) return;

    if (!cachedUser) {
      wrap.innerHTML = "";
      return;
    }

    // Generate last 14 days dates
    const days = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }

    const checkinByDate = new Map();
    _recentCheckins.forEach(c => {
      if (c.date && !checkinByDate.has(c.date)) {
        checkinByDate.set(c.date, c);
      }
    });

    // Compute constructivist reflective narrative
    const totalRecorded = _recentCheckins.length;
    const positiveCount = _recentCheckins.filter(c => !c.is_negative).length;
    const negativeCount = totalRecorded - positiveCount;

    let narrativeTitle = "Constructivist Learning & Emotional Awareness";
    let narrativeBody = "Noticing how you feel before and after class builds self-regulation. When you understand your emotions, you have greater agency over your learning.";

    if (totalRecorded >= 3) {
      if (positiveCount > negativeCount * 1.5) {
        narrativeTitle = "Strong, Positive Learning Momentum";
        narrativeBody = `You've recorded mostly positive and calm check-ins (${positiveCount} of ${totalRecorded} entries). Steady feelings support deep focus and constructive curiosity.`;
      } else if (negativeCount >= 3) {
        narrativeTitle = "Navigating Challenges with Agency";
        narrativeBody = "You've experienced a few challenging moments recently. Recognizing when you are stressed or tired is a valuable strength. Don't hesitate to reach out in 'Talk to Someone'.";
      } else {
        narrativeTitle = "Balanced Emotional Journey";
        narrativeBody = `You have a balanced mix of steady and reflective days. Taking time to notice these shifts helps you adapt your study habits and daily rhythms.`;
      }
    }

    const todayStr = todayIso();

    wrap.innerHTML = `
      <div class="self-reflection-wrap">
        <div class="reflection-prompt-box">
          <span class="reflection-prompt-icon">🌱</span>
          <div>
            <h4 class="reflection-prompt-title">${escHtml(narrativeTitle)}</h4>
            <p class="reflection-prompt-text">${escHtml(narrativeBody)}</p>
          </div>
        </div>

        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <strong style="font-size:0.86rem;color:var(--text-secondary);">Your 14-Day Emotional Journey</strong>
            <span style="font-size:0.75rem;color:var(--text-muted);">${totalRecorded} check-ins recorded</span>
          </div>
          <div class="timeline-track" role="region" aria-label="14-day emotional reflection timeline">
            ${days.map(d => {
              const entry = checkinByDate.get(d);
              const isToday = d === todayStr;
              const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" }).format(new Date(`${d}T00:00:00`));

              if (entry) {
                const emoKey = String(entry.emotion || "").toLowerCase();
                const meta = LABEL_MAP.get(emoKey) || {
                  label: entry.emotion_label || "Checked In",
                  emoji: entry.emotion_emoji || "•"
                };
                const isNeg = entry.is_negative;
                return `
                  <div class="timeline-node ${isToday ? "is-today" : ""}" title="${escHtml(dayLabel)}: ${escHtml(meta.label)}${entry.note ? ` - "${escHtml(entry.note)}"` : ""}">
                    <span class="timeline-node-date">${escHtml(dayLabel)}</span>
                    <span class="timeline-node-emoji">${escHtml(meta.emoji)}</span>
                    <span class="timeline-node-label">${escHtml(meta.label)}</span>
                    <span class="timeline-node-status ${isNeg ? "late" : "present"}">${isNeg ? "Care" : "Steady"}</span>
                  </div>`;
              }

              return `
                <div class="timeline-node ${isToday ? "is-today" : ""}" title="${escHtml(dayLabel)}: No check-in recorded">
                  <span class="timeline-node-date">${escHtml(dayLabel)}</span>
                  <span class="timeline-node-emoji" style="opacity:0.35;">—</span>
                  <span class="timeline-node-label" style="color:var(--text-faint); font-weight:500;">No entry</span>
                  <span class="timeline-node-status empty">Rest</span>
                </div>`;
            }).join("")}
          </div>
        </div>
      </div>`;
  }

  // ─── Initialize ─────────────────────────────────────────────
  ClassCare.onCurrentUser(async user => {
    stopListeners();
    cachedUser = user?.uid && !user.__profileError ? user : null;
    if (cachedUser) {
      startTodayListener();
      startTimelineListener();
    } else {
      renderCheckinPanel(null);
      renderTimeline();
    }
  });

  window.addEventListener("beforeunload", stopListeners, { once: true });
  window.addEventListener("pagehide", stopListeners);
})();
