/* ============================================================
   student/enrollment.js — In-App Auto-Sectioning Enrollment Flow
   - Gated by settings.enrollment_open (IT Admin control)
   - Auto-fills Name & Student ID (Read-only)
   - Only required input: Target Grade Level
   - Auto-sectioning: assigns Section A, spills to Section B when full
   - Overflow fallback: Waitlist + automated IT Admin alert
   - Read-only section & grade level display upon enrollment
   ============================================================ */
(function () {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);

  let cachedUser = null;
  let _unsubSettings = null;
  let _unsubUserDoc = null;
  let _settingsLoaded = false;
  let _settingsOpen = false;
  let _settingsCapacity = 45;
  let _masterSections = [];
  let _academicYear = "";

  function escHtml(str) {
    return typeof ClassCareUI?.escapeHtml === "function"
      ? ClassCareUI.escapeHtml(str)
      : String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function gradeLevels() {
    return [
      "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6",
      "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"
    ];
  }

  function syncIdCardAndProfile(user) {
    if (!user) return;
    const assignedSection = user.section || user.section_name || "";
    // Update ID card section and status badge
    const secEl = $("#id-section");
    if (secEl) {
      if (assignedSection) {
        secEl.replaceChildren(document.createTextNode(assignedSection));
      } else if (user.enrollment_status === "waitlist" || user.enrollment_status === "Waitlisted") {
        secEl.replaceChildren(document.createTextNode(user.grade_level ? `Waitlisted (${user.grade_level})` : "Waitlisted"));
      } else {
        secEl.replaceChildren(document.createTextNode("Not Enrolled"));
      }
    }

    const statusWrap = $("#id-status");
    if (statusWrap) {
      if (assignedSection && (user.enrollment_status === "enrolled" || user.enrollment_status === "Approved")) {
        statusWrap.innerHTML = '<span class="status-badge status-present">Enrolled</span>';
      } else if (user.enrollment_status === "waitlist" || user.enrollment_status === "Waitlisted") {
        statusWrap.innerHTML = '<span class="status-badge status-late">Waitlisted</span>';
      } else {
        statusWrap.innerHTML = '<span class="status-badge status-absent">Not Enrolled</span>';
      }
    }

    // Update Profile Grade and Section fields (Read-Only)
    const gradeEl = $("#profile-student-grade");
    const pSecEl = $("#profile-student-section");
    if (gradeEl) gradeEl.value = user.grade_level || "Not Enrolled";
    if (pSecEl) {
      if (assignedSection) {
        pSecEl.value = assignedSection;
      } else if (user.enrollment_status === "waitlist" || user.enrollment_status === "Waitlisted") {
        pSecEl.value = "Waitlisted (Pending section provision)";
      } else {
        pSecEl.value = "Not Enrolled";
      }
    }
  }

  function updatePeriodBadge() {
    const badge = $("#enrollment-period-badge");
    if (!badge) return;
    if (!_settingsLoaded) {
      badge.textContent = "CHECKING…";
      badge.className = "status-badge";
      badge.title = "Checking enrollment period status with school server…";
    } else if (_settingsOpen) {
      badge.textContent = "OPEN";
      badge.className = "status-badge status-present";
      badge.title = "Enrollment period is officially open.";
    } else {
      badge.textContent = "CLOSED";
      badge.className = "status-badge status-absent";
      badge.title = "Enrollment period is currently closed.";
    }
  }

  function renderEnrollment() {
    updatePeriodBadge();
    const viewContainer = $("#enrollment-view");
    const requestsContainer = $("#enrollment-requests");
    const formWrap = $("#enrollment-form-wrap");
    if (!viewContainer) return;

    if (!cachedUser) {
      viewContainer.innerHTML = '<div class="state-panel state-empty"><strong>Sign in to access enrollment.</strong><span>Please sign in with your student account to view the enrollment page.</span></div>';
      if (requestsContainer) requestsContainer.innerHTML = "";
      if (formWrap) formWrap.innerHTML = "";
      return;
    }

    syncIdCardAndProfile(cachedUser);

    const assignedSection = cachedUser.section || cachedUser.section_name || "";
    const isEnrolled = !!(assignedSection && (cachedUser.enrollment_status === "enrolled" || cachedUser.enrollment_status === "Approved"));
    const isWaitlisted = !isEnrolled && (cachedUser.enrollment_status === "waitlist" || cachedUser.enrollment_status === "Waitlisted");

    // Case 1: Student is already officially enrolled
    if (isEnrolled) {
      viewContainer.innerHTML = `
        <div style="padding:1.5rem;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:12px;display:flex;flex-direction:column;gap:1rem;">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:gap;gap:12px;">
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="width:44px;height:44px;border-radius:50%;background:rgba(21,128,61,0.15);color:#15803d;display:flex;align-items:center;justify-content:center;font-size:1.4rem;">
                ✓
              </div>
              <div>
                <h3 style="margin:0;font-size:1.15rem;font-weight:700;">Officially Enrolled</h3>
                <p style="margin:2px 0 0 0;font-size:0.85rem;color:var(--text-muted);">Academic Year: ${escHtml(_academicYear || "Current AY")}</p>
              </div>
            </div>
            <span class="status-badge status-present" style="font-size:0.85rem;padding:6px 12px;">Active Enrollment</span>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:1rem;margin-top:0.5rem;padding:1rem;background:var(--panel-muted);border-radius:8px;">
            <div>
              <span style="font-size:0.75rem;color:var(--text-muted);display:block;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Assigned Section</span>
              <strong style="font-size:1.1rem;color:var(--text-primary);">${escHtml(assignedSection || "—")}</strong>
            </div>
            <div>
              <span style="font-size:0.75rem;color:var(--text-muted);display:block;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Grade Level</span>
              <strong style="font-size:1.1rem;color:var(--text-primary);">${escHtml(cachedUser.grade_level || "—")}</strong>
            </div>
            <div>
              <span style="font-size:0.75rem;color:var(--text-muted);display:block;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Student ID</span>
              <strong style="font-size:1.1rem;color:var(--text-primary);font-family:monospace;">${escHtml(cachedUser.student_id || "—")}</strong>
            </div>
          </div>

          <div style="display:flex;align-items:center;gap:8px;font-size:0.85rem;color:var(--text-muted);margin-top:0.25rem;">
            <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            <span>Your section and grade level are official DepEd-verified records and strictly read-only. For section transfers, please contact the School IT Administrator.</span>
          </div>
        </div>
      `;
      if (requestsContainer) requestsContainer.innerHTML = "";
      if (formWrap) formWrap.innerHTML = "";
      return;
    }

    // Case 2: Student is placed on the enrollment waitlist
    if (isWaitlisted) {
      viewContainer.innerHTML = `
        <div style="padding:1.5rem;background:var(--bg-card);border:1px solid #ca8a04;border-radius:12px;display:flex;flex-direction:column;gap:1rem;">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="width:44px;height:44px;border-radius:50%;background:rgba(202,138,4,0.15);color:#ca8a04;display:flex;align-items:center;justify-content:center;font-size:1.3rem;font-weight:700;">
                !
              </div>
              <div>
                <h3 style="margin:0;font-size:1.15rem;font-weight:700;">Enrollment Status: Waitlisted</h3>
                <p style="margin:2px 0 0 0;font-size:0.85rem;color:var(--text-muted);">Target: ${escHtml(cachedUser.grade_level || "—")} · Academic Year: ${escHtml(_academicYear || "Current AY")}</p>
              </div>
            </div>
            <span class="status-badge status-late" style="font-size:0.85rem;padding:6px 12px;">Waitlisted</span>
          </div>

          <div style="padding:1rem;background:var(--panel-muted);border-radius:8px;font-size:0.9rem;line-height:1.5;color:var(--text-primary);">
            <strong>Notice: Section Capacity Reached (${_settingsCapacity}/${_settingsCapacity})</strong>
            <p style="margin:6px 0 0 0;color:var(--text-muted);">
              All active sections for <strong>${escHtml(cachedUser.grade_level || "your target grade")}</strong> have reached the maximum capacity limit (${_settingsCapacity} students per section).
              An automated notification has been dispatched to the School IT Administrator to provision a new section.
              You will be automatically placed into the next section as soon as it is opened.
            </p>
          </div>

          ${_settingsOpen ? `
            <div style="display:flex;justify-content:flex-end;margin-top:0.5rem;">
              <button type="button" id="btn-reapply-grade" class="btn btn-secondary btn-sm">Change Target Grade Level</button>
            </div>
          ` : ""}
        </div>
      `;
      if (requestsContainer) requestsContainer.innerHTML = "";
      if (formWrap) formWrap.innerHTML = "";

      $("#btn-reapply-grade")?.addEventListener("click", () => {
        renderFormView();
      });
      return;
    }

    // Case 3: Settings are still synchronizing (prevent false premature 'Closed' display)
    if (!_settingsLoaded) {
      viewContainer.innerHTML = `
        <div class="state-panel state-loading" style="padding:2.5rem 1.5rem;">
          <strong>Checking enrollment status…</strong>
          <span>Synchronizing latest enrollment period status with school administration. Please wait…</span>
        </div>
      `;
      if (requestsContainer) requestsContainer.innerHTML = "";
      if (formWrap) formWrap.innerHTML = "";
      return;
    }

    // Case 4: Enrollment Period is Closed & Not Enrolled
    if (!_settingsOpen) {
      viewContainer.innerHTML = `
        <div class="state-panel state-empty" style="padding:2.5rem 1.5rem;">
          <div style="width:52px;height:52px;border-radius:50%;background:var(--panel-muted);color:var(--text-muted);display:flex;align-items:center;justify-content:center;margin:0 auto 1rem auto;">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          </div>
          <strong style="font-size:1.15rem;display:block;margin-bottom:6px;">Enrollment Period is Currently Closed</strong>
          <span style="max-width:520px;margin:0 auto;display:block;color:var(--text-muted);line-height:1.5;">
            The School Administrator has not opened the enrollment window for Academic Year ${escHtml(_academicYear || "the upcoming term")}.
            Once the administration opens enrollment, you can select your Target Grade Level here and the auto-sectioning engine will assign you a section.
          </span>
        </div>
      `;
      if (requestsContainer) requestsContainer.innerHTML = "";
      if (formWrap) formWrap.innerHTML = "";
      return;
    }

    // Case 5: Enrollment Period is Open & Student Needs to Enroll
    renderFormView();
  }

  function renderFormView() {
    const viewContainer = $("#enrollment-view");
    const formWrap = $("#enrollment-form-wrap");
    if (!viewContainer) return;

    const studentFullName = `${cachedUser.first_name || ""} ${cachedUser.last_name || ""}`.trim() || "Student";
    const studentIdVal = cachedUser.student_id || "—";

    viewContainer.innerHTML = `
      <div style="margin-bottom:1.25rem;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <div>
            <h3 style="margin:0;font-size:1.15rem;font-weight:700;">Student In-App Enrollment</h3>
            <p style="margin:2px 0 0 0;font-size:0.85rem;color:var(--text-muted);">
              Powered by the ClassCare Auto-Sectioning Engine · AY ${escHtml(_academicYear || "2025-2026")}
            </p>
          </div>
          <span class="status-badge status-present">Enrollment Open</span>
        </div>
      </div>
    `;

    if (!formWrap) return;
    formWrap.innerHTML = `
      <form id="form-auto-enrollment" class="form-stack" style="background:var(--bg-card);padding:1.5rem;border:1px solid var(--border-subtle);border-radius:12px;">
        <div style="padding:1rem;background:var(--panel-muted);border-radius:8px;margin-bottom:1rem;font-size:0.85rem;color:var(--text-muted);line-height:1.5;">
          <strong style="color:var(--text-primary);display:block;margin-bottom:4px;">How Auto-Sectioning Works:</strong>
          Sections have a fixed capacity of <strong>${_settingsCapacity} students</strong>. The system automatically places you into the first available section in alphabetical order (Section A first). When Section A reaches capacity (${_settingsCapacity}/${_settingsCapacity}), subsequent students automatically spill over into Section B.
        </div>

        <div class="field-row cols-2">
          <div>
            <label class="field-label" for="enroll-auto-name">Student name</label>
            <input id="enroll-auto-name" class="field" value="${escHtml(studentFullName)}" readonly disabled style="opacity:0.85;cursor:not-allowed;" />
            <span class="field-help">Verified from your student account.</span>
          </div>
          <div>
            <label class="field-label" for="enroll-auto-studentid">Student ID</label>
            <input id="enroll-auto-studentid" class="field" value="${escHtml(studentIdVal)}" readonly disabled style="opacity:0.85;cursor:not-allowed;font-family:monospace;" />
            <span class="field-help">Unique official identification number.</span>
          </div>
        </div>

        <div style="margin-top:0.5rem;">
          <label class="field-label" for="enroll-target-grade" style="font-weight:600;font-size:0.95rem;">
            Target Grade Level <span style="color:var(--c-danger);">*</span>
          </label>
          <select id="enroll-target-grade" name="grade_level" class="field" required style="font-size:1rem;padding:0.65rem 0.85rem;">
            <option value="">Select your target grade level…</option>
            ${gradeLevels().map(g => `<option value="${escHtml(g)}" ${cachedUser.grade_level === g ? "selected" : ""}>${escHtml(g)}</option>`).join("")}
          </select>
          <span class="field-help">Select the grade level you are entering for this academic year.</span>
        </div>

        <div style="margin-top:1rem;display:flex;justify-content:flex-end;">
          <button type="submit" id="btn-submit-auto-enroll" class="btn btn-primary" style="padding:0.75rem 1.5rem;font-size:0.95rem;display:inline-flex;align-items:center;gap:8px;">
            <span>Enroll Now (Auto-Assign Section)</span>
            <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
      </form>
    `;

    $("#form-auto-enrollment")?.addEventListener("submit", handleAutoEnrollmentSubmit);
  }

  async function handleAutoEnrollmentSubmit(event) {
    event.preventDefault();
    if (!cachedUser?.uid) {
      return Toast.error("Please sign in first to submit your enrollment.");
    }
    if (!_settingsOpen) {
      return Toast.warn("Enrollment Period is currently closed by the School Administrator.");
    }

    const selectEl = $("#enroll-target-grade");
    const targetGrade = String(selectEl?.value || "").trim();
    if (!targetGrade) {
      return Toast.warn("Please select your target grade level.");
    }

    const btn = $("#btn-submit-auto-enroll");
    Utils.setLoading(btn, true);
    if (btn) btn.textContent = "Processing section assignment…";

    try {
      const result = await ClassCare.DB.autoEnrollStudent({
        studentUid: cachedUser.uid,
        gradeLevel: targetGrade,
        studentInfo: {
          name: `${cachedUser.first_name || ""} ${cachedUser.last_name || ""}`.trim(),
          student_id: cachedUser.student_id || ""
        }
      });

      if (!result.success) {
        Toast.error(result.error || "Enrollment could not be completed.");
        return;
      }

      if (result.status === "enrolled") {
        cachedUser.section = result.section;
        cachedUser.section_name = result.section;
        cachedUser.section_id = result.section_id || String(result.section).replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
        cachedUser.grade_level = result.grade_level;
        cachedUser.enrollment_status = "enrolled";
        Toast.success(result.message || `Successfully enrolled into ${result.section}!`);
      } else if (result.status === "waitlist") {
        cachedUser.section = "";
        cachedUser.section_name = "";
        cachedUser.section_id = "";
        cachedUser.grade_level = result.grade_level;
        cachedUser.enrollment_status = "waitlist";
        Toast.warn(result.message || "Placed on enrollment waitlist. Administrator notified.");
      }

      syncIdCardAndProfile(cachedUser);
      renderEnrollment();
    } catch (error) {
      console.error("[enrollment-auto] failed:", error);
      Toast.error(error?.message || "Enrollment submission failed. Check your connection.");
    } finally {
      Utils.setLoading(btn, false);
    }
  }

  function stopListeners() {
    if (_unsubSettings) { try { _unsubSettings(); } catch (_) {} _unsubSettings = null; }
    if (_unsubUserDoc) { try { _unsubUserDoc(); } catch (_) {} _unsubUserDoc = null; }
  }

  function applySettingsData(data) {
    if (!data) return;
    _settingsOpen = ClassCare.isEnrollmentOpen ? ClassCare.isEnrollmentOpen(data) : (ClassCare.DB?.isEnrollmentOpen ? ClassCare.DB.isEnrollmentOpen(data) : false);
    _settingsCapacity = Number(data.section_capacity) || ClassCare.DB?.SECTION_CAPACITY_LIMIT || 45;
    _masterSections = Array.isArray(data.master_sections) ? data.master_sections : [];
    _academicYear = data.academic_year || "";
    _settingsLoaded = true;
    renderEnrollment();
  }

  function startListeners() {
    stopListeners();
    try {
      // 1. Immediate direct fetch to ensure instant response without listener delay
      ClassCare.DB.getSettings().then(settings => {
        applySettingsData(settings);
      }).catch(err => {
        console.warn("[student-enrollment] direct settings fetch error:", err);
      });

      // 2. Real-time listener for instant reactive sync when Admin toggles Open/Close
      _unsubSettings = ClassCare.DB.settings.onSnapshot(snap => {
        const data = snap.exists ? snap.data() : {};
        applySettingsData(data);
      }, err => {
        console.warn("[student-enrollment] settings snapshot error; falling back to direct fetch:", err);
        ClassCare.DB.getSettings().then(applySettingsData).catch(() => {});
      });

      // 3. Real-time listener for current student user doc (updates section / waitlist changes)
      if (cachedUser?.uid) {
        _unsubUserDoc = ClassCare.DB.users.doc(cachedUser.uid).onSnapshot(snap => {
          if (!snap.exists) return;
          const u = snap.data() || {};
          const prevSection = cachedUser.section;
          const prevStatus = cachedUser.enrollment_status;
          Object.assign(cachedUser, u);
          syncIdCardAndProfile(cachedUser);

          // If section was just assigned by Admin or teacher
          if (cachedUser.section && cachedUser.section !== prevSection) {
            Toast.success(`Section updated: You are assigned to ${cachedUser.section}.`);
          }
          renderEnrollment();
        }, err => console.warn("[student-enrollment] user doc listener:", err));
      }
    } catch (e) {
      console.warn("[student-enrollment] listener error:", e);
    }
  }

  ClassCare.onCurrentUser(user => {
    stopListeners();
    cachedUser = (user?.uid && !user.__profileError) ? user : null;
    if (cachedUser) {
      startListeners();
    }
    renderEnrollment();
  });

  // Instant Cross-Portal Synchronization via BroadcastChannel and Storage Events
  try {
    const syncChannel = new BroadcastChannel("classcare-sync");
    syncChannel.onmessage = (event) => {
      if (event.data?.type === "enrollment_toggle") {
        _settingsOpen = !!event.data.isOpen;
        _settingsLoaded = true;
        renderEnrollment();
        updatePeriodBadge();
      }
    };
  } catch (_) {}

  window.addEventListener("storage", (e) => {
    if (e.key === "classcare_enrollment_open") {
      _settingsOpen = e.newValue === "true";
      _settingsLoaded = true;
      renderEnrollment();
      updatePeriodBadge();
    }
  });

  window.addEventListener("classcare:enrollment-changed", (e) => {
    if (typeof e.detail?.isOpen === "boolean") {
      _settingsOpen = e.detail.isOpen;
      _settingsLoaded = true;
      renderEnrollment();
      updatePeriodBadge();
    }
  });

  window.addEventListener("pagehide", stopListeners);
  window.addEventListener("beforeunload", stopListeners);
})();
