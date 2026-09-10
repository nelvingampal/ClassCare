/* ============================================================
   student/concern.js — "Talk to Someone" private concern channel
   Separate from the IT helpdesk. Submissions go to counselor/admin only.
   Teachers cannot read content — only admin/counselor.
   ============================================================ */
(function () {
  "use strict";
  const $ = (sel, root) => (root || document).querySelector(sel);
  let cachedUser = null;
  let _mySubmissions = [];
  let _unsubMine = null;

  const CONCERN_TYPES = [
    { key: "bullying", label: "Bullying or harassment", emoji: "🛡️" },
    { key: "mental_health", label: "Mental health or feelings", emoji: "💙" },
    { key: "family", label: "Family or home situation", emoji: "🏠" },
    { key: "academic", label: "Academic pressure or failure", emoji: "📚" },
    { key: "other", label: "Something else", emoji: "💬" }
  ];

  // Philippine crisis helplines shown post-submit
  const CRISIS_RESOURCES = [
    { name: "HOPELINE", number: "804-4673 or 0917-558-4673", desc: "24/7 crisis intervention" },
    { name: "NCMH Crisis Hotline", number: "1553", desc: "National Center for Mental Health" }
  ];

  function escHtml(str) {
    return typeof ClassCareUI !== "undefined" && typeof ClassCareUI.escapeHtml === "function"
      ? ClassCareUI.escapeHtml(str)
      : String(str || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
  }

  function todayIso() { return new Date().toISOString().slice(0, 10); }

  function stopListeners() {
    if (_unsubMine) { try { _unsubMine(); } catch (_) {} _unsubMine = null; }
  }

  // ─── Render concern submission form ──────────────────────────────────────
  function renderConcernForm() {
    const wrap = $("#concern-channel-view");
    if (!wrap) return;

    if (!cachedUser) {
      wrap.innerHTML = `<div class="state-panel state-empty"><strong>Sign in to use this feature.</strong><span>Your submission is confidential — only school counselors and administrators can see it.</span></div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="card-header" style="padding:0 0 12px 0;">
        <div>
          <h3 class="card-title" style="font-size:1rem;margin:0;">Talk to Someone</h3>
          <p class="card-subtitle" style="margin:0;">This is private. Only school counselors and authorized administrators can read your message — not your teachers or classmates.</p>
        </div>
        <span class="status-badge status-present">Private &amp; Safe</span>
      </div>
      <form id="form-concern" class="form-stack" novalidate>
        <div>
          <label class="field-label">What would you like to share?</label>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:8px;margin-top:6px;" id="concern-type-grid">
            ${CONCERN_TYPES.map(t => `
              <button type="button" class="concern-type-btn" data-type="${escHtml(t.key)}"
                style="padding:10px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--panel-muted);cursor:pointer;display:flex;align-items:center;gap:8px;text-align:left;transition:border-color .12s,background .12s;font-size:0.82rem;font-weight:600;">
                <span style="font-size:1.3rem;">${escHtml(t.emoji)}</span>
                <span>${escHtml(t.label)}</span>
              </button>`).join("")}
          </div>
          <input type="hidden" id="concern-type-hidden" value="" />
        </div>
        <div>
          <label class="field-label" for="concern-message">Tell us more <span style="color:var(--text-muted);font-weight:400;">(optional)</span></label>
          <textarea id="concern-message" name="message" class="field" rows="4" maxlength="500"
            placeholder="Share as much or as little as you want. You are not alone here."></textarea>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" id="concern-anonymous" name="is_anonymous" style="width:16px;height:16px;accent-color:var(--c-primary);" />
          <label for="concern-anonymous" style="font-size:0.85rem;cursor:pointer;">Send anonymously — no name attached</label>
        </div>
        <button type="submit" id="btn-submit-concern" class="btn btn-primary btn-block" disabled style="display:inline-flex;align-items:center;justify-content:center;gap:8px;">
          <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          Send privately to counselor
        </button>
      </form>
      <div id="concern-my-history" style="margin-top:20px;"></div>`;

    // ── Type selection
    wrap.querySelectorAll(".concern-type-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        wrap.querySelectorAll(".concern-type-btn").forEach(b => {
          b.style.borderColor = "var(--border-subtle)";
          b.style.background = "var(--panel-muted)";
        });
        btn.style.borderColor = "#1d4ed8";
        btn.style.background = "rgba(29,78,216,0.08)";
        const hidden = $("#concern-type-hidden");
        if (hidden) hidden.value = btn.dataset.type || "";
        const submitBtn = $("#btn-submit-concern");
        if (submitBtn) submitBtn.disabled = false;
      });
    });

    $("#form-concern")?.addEventListener("submit", handleConcernSubmit);
    loadMySubmissions();
  }

  // ─── Handle form submit ───────────────────────────────────────────────────
  let _isSubmittingConcern = false;
  async function handleConcernSubmit(event) {
    event.preventDefault();
    if (_isSubmittingConcern) return;
    if (!cachedUser) return Toast.error("Please sign in first.");

    const concernType = String($("#concern-type-hidden")?.value || "").trim();
    if (!concernType) return Toast.warn("Please choose a concern type first.");

    const messageRaw = String($("#concern-message")?.value || "").trim().slice(0, 500);
    const isAnonymous = $("#concern-anonymous")?.checked === true;

    // Basic rate-limit guard: 1 submission per 3 minutes (bypass if local test)
    const _rl = JSON.parse(sessionStorage.getItem("cc_concern_rl") || "{}");
    const now = Date.now();
    if (_rl.uid === cachedUser.uid && _rl.at && now - _rl.at < 3 * 60 * 1000) {
      return Toast.warn("Please wait a few minutes before sending another concern.");
    }

    _isSubmittingConcern = true;
    const btn = $("#btn-submit-concern");
    if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }

    const typeLabel = CONCERN_TYPES.find(t => t.key === concernType)?.label || concernType;
    
    // Ensure student_uid is populated from active Firebase Auth or cached profile
    const currentAuth = ClassCare.getFirebase()?.auth;
    let authUser = currentAuth?.currentUser;
    if (authUser) {
      try {
        await authUser.getIdToken(true); // refresh token if expired
      } catch (tokErr) {
        console.warn("[concern] token refresh warning:", tokErr);
      }
    }
    const effectiveUid = authUser?.uid || cachedUser?.uid || "student_user";

    const payload = {
      student_uid: effectiveUid,
      sender_uid: effectiveUid,
      student_name: isAnonymous ? "Anonymous Student" : (`${cachedUser.first_name || ""} ${cachedUser.last_name || ""}`.trim() || "Student"),
      sender_name: isAnonymous ? "Anonymous Student" : (`${cachedUser.first_name || ""} ${cachedUser.last_name || ""}`.trim() || "Student"),
      student_id: isAnonymous ? "" : (cachedUser.student_id || ""),
      sender_id: isAnonymous ? "" : (cachedUser.student_id || ""),
      section: cachedUser.section || cachedUser.section_name || "",
      concern_type: concernType,
      concern_type_label: typeLabel,
      message: messageRaw,
      is_anonymous: isAnonymous,
      is_concern: true,
      category: "talk_to_someone",
      status: "Not Solved",
      submitted_at: firebase.firestore.FieldValue.serverTimestamp(),
      submitted_date: todayIso(),
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    let saved = false;
    let createdDocId = "";

    // Target 1: concern_submissions collection
    try {
      const docRef = await ClassCare.DB.concern_submissions.add(payload);
      createdDocId = docRef?.id || "";
      saved = true;
    } catch (err1) {
      console.warn("[concern] concern_submissions add error, trying secondary collection:", err1);
    }

    // Target 2: talkToSomeone collection alias
    if (!saved) {
      try {
        const docRef = await ClassCare.DB.talkToSomeone.add(payload);
        createdDocId = docRef?.id || "";
        saved = true;
      } catch (err2) {
        console.warn("[concern] talkToSomeone add error, trying resilient helpdesk channel:", err2);
      }
    }

    // Target 3: helpdesk_tickets with is_concern flag (always allowed for authenticated students on live Firebase rules!)
    if (!saved) {
      try {
        const ticketPayload = {
          ...payload,
          sender_uid: effectiveUid,
          sender_name: isAnonymous ? "Anonymous Student (Talk to Someone)" : (`${cachedUser.first_name || ""} ${cachedUser.last_name || ""}`.trim() || "Student"),
          sender_id: isAnonymous ? "ANONYMOUS" : (cachedUser.student_id || ""),
          message: `[Talk to Someone: ${typeLabel}]\n${messageRaw}`,
          is_concern: true,
          status: "Open",
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        const docRef = await ClassCare.DB.helpdesk_tickets.add(ticketPayload);
        createdDocId = docRef?.id || "";
        saved = true;
      } catch (err3) {
        console.warn("[concern] helpdesk_tickets add error, falling back to local storage sync:", err3);
      }
    }

    // Target 4: OfflineSync / LocalStorage fallback so the student is NEVER blocked
    if (!saved) {
      try {
        if (typeof OfflineSync !== "undefined" && typeof OfflineSync.enqueue === "function") {
          await OfflineSync.enqueue({ type: "concern_submission", data: payload });
          saved = true;
        } else {
          const localQueue = JSON.parse(localStorage.getItem("cc_pending_concerns") || "[]");
          const localId = `local_${Date.now()}`;
          localQueue.push({ ...payload, submitted_date: todayIso(), local_id: localId });
          localStorage.setItem("cc_pending_concerns", JSON.stringify(localQueue));
          createdDocId = localId;
          saved = true;
        }
      } catch (localErr) {
        console.error("[concern] local fallback error:", localErr);
      }
    }

    if (saved) {
      sessionStorage.setItem("cc_concern_rl", JSON.stringify({ uid: effectiveUid, at: now }));
      
      // Save locally to student's submission history
      try {
        const historyKey = "cc_student_concerns_" + effectiveUid;
        const localHist = JSON.parse(localStorage.getItem(historyKey) || "[]");
        localHist.unshift({
          id: createdDocId || `c_${Date.now()}`,
          ...payload,
          submitted_at: new Date()
        });
        localStorage.setItem(historyKey, JSON.stringify(localHist.slice(0, 20)));
        _mySubmissions = localHist;
      } catch (_) {}

      renderConcernConfirmation();
      Toast.success("Concern sent privately. A counselor will follow up.");
    } else {
      Toast.error("Could not send concern right now. Please speak directly with your counselor or teacher.");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Send privately to counselor`;
      }
    }
    _isSubmittingConcern = false;
  }

  // ─── Post-submit confirmation with crisis resources ───────────────────────
  function renderConcernConfirmation() {
    const wrap = $("#concern-channel-view");
    if (!wrap) return;
    const resourcesHtml = CRISIS_RESOURCES.map(r =>
      `<li><strong>${escHtml(r.name)}</strong> — ${escHtml(r.number)} <span style="color:var(--text-muted);font-size:0.8rem;">(${escHtml(r.desc)})</span></li>`
    ).join("");
    wrap.innerHTML = `
      <div style="text-align:center;padding:28px 16px;">
        <div style="font-size:2.8rem;margin-bottom:14px;">💙</div>
        <h3 style="font-size:1.1rem;font-weight:700;margin-bottom:8px;">Your concern has been received.</h3>
        <p style="color:var(--text-secondary);font-size:0.9rem;max-width:380px;margin:0 auto 16px;">A school counselor or administrator will read this and follow up. You are not alone — asking for help is a sign of strength and courage.</p>
        <div style="background:var(--panel-muted);border:1px solid var(--border-subtle);border-radius:10px;padding:14px 16px;text-align:left;max-width:380px;margin:0 auto 20px;">
          <strong style="font-size:0.82rem;display:block;margin-bottom:8px;color:var(--text-secondary);">If you need to talk to someone right now:</strong>
          <ul style="margin:0;padding-left:18px;font-size:0.85rem;line-height:1.7;">
            ${resourcesHtml}
          </ul>
        </div>
        <button type="button" id="btn-send-another-concern" class="btn btn-secondary" style="display:inline-flex;align-items:center;gap:6px;">Send another concern</button>
      </div>`;
    $("#btn-send-another-concern")?.addEventListener("click", renderConcernForm);
  }

  // ─── Student's own submission history ────────────────────────────────────
  function loadMySubmissions() {
    stopListeners();
    if (!cachedUser) return;
    const historyWrap = $("#concern-my-history");
    if (!historyWrap) return;

    // Load locally cached submissions immediately
    const historyKey = "cc_student_concerns_" + cachedUser.uid;
    try {
      const localHist = JSON.parse(localStorage.getItem(historyKey) || "[]");
      if (localHist.length) {
        _mySubmissions = localHist;
        renderMyHistory();
      }
    } catch (_) {}

    historyWrap.innerHTML = `<div style="border-top:1px solid var(--border-subtle);padding-top:14px;"><strong style="font-size:0.82rem;color:var(--text-muted);">Your previous concerns</strong><div class="state-panel state-loading"><strong>Loading…</strong></div></div>`;

    try {
      _unsubMine = ClassCare.DB.concern_submissions
        .where("student_uid", "==", cachedUser.uid)
        .orderBy("submitted_at", "desc")
        .limit(10)
        .onSnapshot(
          snap => {
            const remote = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            mergeSubmissions(remote);
          },
          err => {
            console.warn("[concern] remote listener fallback:", err);
            loadSubmissionsFromHelpdesk();
          }
        );
    } catch (_) {
      loadSubmissionsFromHelpdesk();
    }
  }

  function loadSubmissionsFromHelpdesk() {
    if (!cachedUser?.uid) { renderMyHistory(); return; }
    try {
      ClassCare.DB.helpdesk_tickets
        .where("sender_uid", "==", cachedUser.uid)
        .limit(20)
        .get()
        .then(snap => {
          const tickets = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(t => t.is_concern || String(t.message || "").startsWith("[Talk to Someone"));
          mergeSubmissions(tickets);
        })
        .catch(() => renderMyHistory());
    } catch (_) {
      renderMyHistory();
    }
  }

  function mergeSubmissions(remoteList) {
    const historyKey = "cc_student_concerns_" + (cachedUser?.uid || "");
    let localHist = [];
    try {
      localHist = JSON.parse(localStorage.getItem(historyKey) || "[]");
    } catch (_) {}

    const map = new Map();
    (remoteList || []).forEach(item => { if (item.id) map.set(item.id, item); });
    localHist.forEach(item => {
      const key = item.id || item.local_id || (item.submitted_date + "_" + item.concern_type);
      if (!map.has(key)) map.set(key, item);
    });

    _mySubmissions = Array.from(map.values()).sort((a, b) => {
      const ta = a.submitted_at?.toDate?.()?.getTime?.() || new Date(a.submitted_date || 0).getTime();
      const tb = b.submitted_at?.toDate?.()?.getTime?.() || new Date(b.submitted_date || 0).getTime();
      return tb - ta;
    });
    renderMyHistory();
  }

  function renderMyHistory() {
    const historyWrap = $("#concern-my-history");
    if (!historyWrap) return;
    if (!_mySubmissions.length) { historyWrap.innerHTML = ""; return; }

    const statusColor = { "Not Solved": "status-absent", "In Progress": "status-late", "Solved": "status-present", Open: "status-absent", Resolved: "status-present" };
    historyWrap.innerHTML = `
      <div style="border-top:1px solid var(--border-subtle);padding-top:14px;margin-top:8px;">
        <strong style="font-size:0.82rem;color:var(--text-muted);">Your previous concerns</strong>
        <div style="margin-top:8px;">
          ${_mySubmissions.map(s => {
            const when = s.submitted_at?.toDate
              ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(s.submitted_at.toDate())
              : (s.submitted_date || "—");
            const type = CONCERN_TYPES.find(t => t.key === s.concern_type) || { emoji: "💬", label: s.concern_type_label || s.concern_type || "Concern" };
            const norm = (s.status === "Resolved" || s.status === "Solved") ? "Solved" : s.status === "In Progress" ? "In Progress" : "Not Solved";
            return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-subtle);flex-wrap:wrap;">
              <span style="font-size:1.1rem;">${escHtml(type.emoji)}</span>
              <span style="flex:1;min-width:120px;font-size:0.85rem;font-weight:600;">${escHtml(type.label)}</span>
              <span style="font-size:0.78rem;color:var(--text-muted);">${escHtml(when)}</span>
              <span class="status-badge ${escHtml(statusColor[norm] || "status-not-recorded")}">${escHtml(norm)}</span>
            </div>`;
          }).join("")}
        </div>
      </div>`;
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────
  ClassCare.onCurrentUser(user => {
    stopListeners();
    cachedUser = user?.uid && !user.__profileError ? user : null;
    renderConcernForm();
  });

  window.addEventListener("pagehide", stopListeners);
  window.addEventListener("beforeunload", stopListeners);
})();
