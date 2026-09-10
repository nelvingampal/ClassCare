/* ============================================================
   teacher/assignments.js — Teacher Subject & Section Tagging Module
   Enables approved teachers to select and assign themselves to
   multiple Subjects and Sections (e.g., Math for Grade 5-A, Science for Grade 5-B).
   ============================================================ */
(function () {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const escapeHtml = str => ClassCareUI.escapeHtml(str || "");
  const escapeAttr = str => escapeHtml(str).replace(/"/g, "&quot;");

  const DEPED_STANDARD_SUBJECTS = [
    "Mathematics",
    "Science",
    "English",
    "Filipino",
    "Araling Panlipunan",
    "Edukasyon sa Pagpapakatao (ESP)",
    "MAPEH",
    "EPP / TLE",
    "General Subject"
  ];

  const State = {
    teacher: null,
    assignments: [], // Array of { id, subject, section }
    masterSections: [],
    bound: false
  };

  function genId() {
    return "asg_" + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  }

  let _unsubAssignments = null;

  function parseAssignmentsList(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(a => ({
      id: a.id || genId(),
      subject: String(a.subject || "").trim(),
      section: String(a.section || "").trim(),
      custom_quota: a.custom_quota === true,
      start_time: String(a.start_time || "").trim(),
      late_grace_period: Number(a.late_grace_period ?? 15),
      out_start_time: String(a.out_start_time || "").trim()
    })).filter(a => a.subject && a.section);
  }

  function initAssignments(teacher) {
    if (!teacher || !["teacher", "admin"].includes(teacher.role)) return;
    State.teacher = teacher;

    // 1. Initial pass from in-memory profile
    const rawAssignments = Array.isArray(teacher.teaching_assignments) ? teacher.teaching_assignments : [];
    if (rawAssignments.length > 0) {
      State.assignments = parseAssignmentsList(rawAssignments);
    } else {
      // Legacy migration: check assigned_sections + subject
      const legacySections = Array.isArray(teacher.assigned_sections) && teacher.assigned_sections.length
        ? teacher.assigned_sections
        : (teacher.section ? [teacher.section] : []);
      const legacySubjects = teacher.subject
        ? teacher.subject.split(/[,;&]+/).map(s => s.trim()).filter(Boolean)
        : [];
      
      State.assignments = [];
      if (legacySections.length > 0 && legacySubjects.length > 0) {
        legacySections.forEach(sec => {
          legacySubjects.forEach(sub => {
            State.assignments.push({ id: genId(), subject: sub, section: sec });
          });
        });
      } else if (legacySections.length > 0) {
        legacySections.forEach(sec => {
          State.assignments.push({ id: genId(), subject: "General Subject", section: sec });
        });
      }
    }

    loadMasterSections().then(() => {
      renderAssignmentsSection();
      bindAssignmentEvents();
    });

    // 2. Direct database fetch to guarantee persistence on reload
    fetchPersistedAssignments(teacher.uid);

    // 3. Real-time snapshot synchronization
    subscribeAssignments(teacher.uid);
  }

  async function fetchPersistedAssignments(teacherUid) {
    if (!teacherUid) return;
    try {
      const [tsSnap, userSnap] = await Promise.all([
        ClassCare.DB.teacher_subjects.doc(teacherUid).get().catch(() => null),
        ClassCare.DB.users.doc(teacherUid).get().catch(() => null)
      ]);

      let persisted = [];
      if (tsSnap && tsSnap.exists) {
        const d = tsSnap.data() || {};
        if (Array.isArray(d.assignments) && d.assignments.length) {
          persisted = parseAssignmentsList(d.assignments);
        }
      }

      if (!persisted.length && userSnap && userSnap.exists) {
        const u = userSnap.data() || {};
        if (Array.isArray(u.teaching_assignments) && u.teaching_assignments.length) {
          persisted = parseAssignmentsList(u.teaching_assignments);
        }
      }

      if (persisted.length > 0) {
        State.assignments = persisted;
        if (State.teacher) State.teacher.teaching_assignments = persisted;
        renderAssignmentsSection();
        window.dispatchEvent(new CustomEvent("classcare:assignments-updated", { detail: { teacher: State.teacher, assignments: persisted } }));
      }
    } catch (err) {
      console.warn("[assignments] fetch error:", err);
    }
  }

  function subscribeAssignments(teacherUid) {
    if (!teacherUid) return;
    if (_unsubAssignments) {
      try { _unsubAssignments(); } catch (_) {}
      _unsubAssignments = null;
    }

    try {
      _unsubAssignments = ClassCare.DB.teacher_subjects.doc(teacherUid).onSnapshot(snap => {
        if (!snap.exists) return;
        const d = snap.data() || {};
        if (Array.isArray(d.assignments) && d.assignments.length) {
          const updated = parseAssignmentsList(d.assignments);
          if (JSON.stringify(updated) !== JSON.stringify(State.assignments)) {
            State.assignments = updated;
            if (State.teacher) State.teacher.teaching_assignments = updated;
            renderAssignmentsSection();
            window.dispatchEvent(new CustomEvent("classcare:assignments-updated", { detail: { teacher: State.teacher, assignments: updated } }));
          }
        }
      }, err => console.warn("[assignments] realtime listener notice:", err));
    } catch (err) {
      console.warn("[assignments] subscribe error:", err);
    }
  }

  let stopMasterSections;
  function loadMasterSections() {
    stopMasterSections?.();
    return new Promise(resolve => {
      stopMasterSections = ClassCare.DB.settings.onSnapshot(snap => {
        const data = snap.exists ? snap.data() : {};
        State.masterSections = [...new Set([...(Array.isArray(data.master_sections) ? data.master_sections : []), ...(State.teacher?.assigned_sections || [])])].sort();
        renderAssignmentsSection(); resolve();
      }, error => { State.masterSections = []; Toast.error('Sections unavailable: '+error.message); resolve(); });
    });
  }

  function renderAssignmentsSection() {
    const container = $("#teacher-assignments");
    if (!container) return;

    const hasAssignments = State.assignments.length > 0;
    const uniqueSecs = Array.from(new Set(State.assignments.map(a => a.section)));
    const uniqueSubs = Array.from(new Set(State.assignments.map(a => a.subject)));

    let onboardingHtml = "";
    if (!hasAssignments) {
      onboardingHtml = `
        <div class="onboarding-welcome-card" style="background: linear-gradient(135deg, rgba(37,99,235,0.08), rgba(99,102,241,0.08)); border: 1px solid var(--c-primary, #2563eb); border-radius: var(--radius-md, 10px); padding: 16px 20px; margin-bottom: 20px;">
          <div style="display:flex; gap:12px; align-items:flex-start;">
            <div style="width:36px; height:36px; border-radius:50%; background:var(--c-primary, #2563eb); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:18px; flex-shrink:0;">
              ✓
            </div>
            <div>
              <h3 style="margin:0 0 4px; font-size:1.05rem; font-weight:700; color:var(--text-primary, #0f172a);">
                Account Approved! Complete Your Teaching Setup
              </h3>
              <p style="margin:0; font-size:0.9rem; color:var(--text-secondary, #475569); line-height:1.45;">
                Welcome to ClassCare! Your teacher account has been verified by IT Administration. Please assign the <strong>Subjects and Sections</strong> you teach below (e.g., <em>Mathematics for Grade 5 - Section A</em>). These assignments configure your class attendance rosters and grading sheets.
              </p>
            </div>
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      ${onboardingHtml}
      <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
          <h2 class="card-title" style="margin:0;">My Teaching Assignments & Subjects</h2>
          <p class="card-subtitle" style="margin:4px 0 0;">Tag and manage the specific subjects you teach across each of your assigned class sections.</p>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <span class="status-badge status-present" id="assignment-summary-badge">
            ${State.assignments.length} Assignment${State.assignments.length === 1 ? "" : "s"} (${uniqueSecs.length} Section${uniqueSecs.length === 1 ? "" : "s"})
          </span>
          <button type="button" id="btn-save-assignments" class="btn btn-primary" style="display:inline-flex; align-items:center; gap:6px;">
            <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Save Assignments
          </button>
        </div>
      </div>

      <div class="card-body form-stack" style="margin-top:16px;">
        <!-- Add New Assignment Block -->
        <div style="background:var(--bg-muted, #f8fafc); border:1px solid var(--border, #e2e8f0); border-radius:var(--radius-md, 8px); padding:16px; margin-bottom:18px;">
          <h3 style="margin:0 0 10px; font-size:0.95rem; font-weight:700; color:var(--text-primary, #0f172a);">Add New Teaching Assignment</h3>
          
          <!-- Subject Preset Chips -->
          <div style="margin-bottom:12px;">
            <label class="field-label" style="margin-bottom:6px; font-size:0.8rem;">Quick select subject:</label>
            <div id="subject-preset-chips" style="display:flex; flex-wrap:wrap; gap:6px;">
              ${DEPED_STANDARD_SUBJECTS.map(sub => `
                <button type="button" class="btn btn-ghost btn-sm subject-preset-chip" data-preset-subject="${escapeAttr(sub)}" style="font-size:0.8rem; padding:3px 10px; border-radius:999px; background:var(--panel-muted, #f1f5f9); border:1px solid var(--border-subtle, #cbd5e1);">
                  ${escapeHtml(sub)}
                </button>
              `).join("")}
            </div>
          </div>

          <div class="field-row cols-3" style="gap:10px; align-items:end;">
            <div>
              <label class="field-label" for="assign-subject-input">Subject Name *</label>
              <input id="assign-subject-input" class="field" placeholder="e.g. Mathematics or Science" maxlength="60" />
            </div>
            <div>
              <label class="field-label" for="assign-section-select">Assigned Section *</label>
              <select id="assign-section-select" class="field">
                <option value="">Select section…</option>
                ${State.masterSections.map(sec => `<option value="${escapeAttr(sec)}">${escapeHtml(sec)}</option>`).join("")}
              </select>
            </div>
            <div>
              <button type="button" id="btn-add-assignment" class="btn btn-secondary btn-block" style="display:inline-flex; align-items:center; justify-content:center; gap:6px;">
                <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Assignment
              </button>
            </div>
          </div>

          <!-- Optional Custom Schedule Quota Override for this Subject -->
          <div style="margin-top:12px; padding-top:12px; border-top:1px solid var(--border-subtle, #e2e8f0);">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.88rem; font-weight:600; color:var(--text-primary);">
              <input type="checkbox" id="assign-custom-quota-check" />
              <span>⚡ Set custom class schedule / time quota for this subject (Overrides Admin Master Schedule)</span>
            </label>
            <div id="assign-custom-quota-fields" class="hidden" style="margin-top:10px; padding:12px 14px; background:var(--panel-muted, #f1f5f9); border-radius:6px; border:1px solid var(--border-subtle);">
              <div class="field-row cols-3" style="gap:10px;">
                <div>
                  <label class="field-label" for="assign-start-time">Class Start Time *</label>
                  <input type="time" id="assign-start-time" class="field" value="09:00" />
                  <span class="field-help">Time class starts (e.g. 09:00 AM).</span>
                </div>
                <div>
                  <label class="field-label" for="assign-grace-period">Grace Period (min)</label>
                  <input type="number" id="assign-grace-period" class="field" min="0" max="60" value="15" />
                  <span class="field-help">Arrivals after this are marked Late.</span>
                </div>
                <div>
                  <label class="field-label" for="assign-out-time">Class Dismissal / Out</label>
                  <input type="time" id="assign-out-time" class="field" value="10:00" />
                  <span class="field-help">Time Out scan window start.</span>
                </div>
              </div>
              <span style="font-size:0.8rem; color:var(--text-muted); display:block; margin-top:4px;">
                ℹ️ When taking attendance for this subject, ClassCare will apply this custom quota rather than the school-wide master schedule.
              </span>
            </div>
          </div>
        </div>

        <!-- Current Assignments List -->
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <h3 style="margin:0; font-size:0.95rem; font-weight:700;">Active Teaching Assignments</h3>
            <span style="font-size:0.82rem; color:var(--text-muted, #64748b);">Each assignment pairs a Subject with a Section you teach</span>
          </div>

          <div id="assignments-list-wrap">
            ${renderAssignmentsList()}
          </div>
        </div>
      </div>
    `;

    bindPresetChipClicks();
  }

  function renderAssignmentsList() {
    if (!State.assignments.length) {
      return `
        <div class="state-panel state-empty" style="padding:24px; text-align:center; background:var(--bg-card, #fff); border:1px dashed var(--border, #cbd5e1); border-radius:var(--radius-sm, 6px);">
          <strong style="color:var(--text-primary, #0f172a); display:block; margin-bottom:4px;">No teaching assignments configured yet.</strong>
          <span style="color:var(--text-secondary, #64748b); font-size:0.88rem;">Select a subject and a section above, then click "Add Assignment" to assign your classes.</span>
        </div>
      `;
    }

    // Group by section for clean organization
    const grouped = {};
    State.assignments.forEach(item => {
      if (!grouped[item.section]) grouped[item.section] = [];
      grouped[item.section].push(item);
    });

    return `
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:12px;">
        ${Object.entries(grouped).map(([section, items]) => `
          <div class="assignment-section-group" style="background:var(--bg-card, #fff); border:1px solid var(--border, #e2e8f0); border-radius:var(--radius-sm, 8px); padding:12px 14px; box-shadow:0 1px 2px rgba(0,0,0,0.03);">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid var(--border-subtle, #f1f5f9); padding-bottom:6px;">
              <span style="font-weight:700; font-size:0.92rem; color:var(--c-primary, #2563eb); display:flex; align-items:center; gap:6px;">
                <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                ${escapeHtml(section)}
              </span>
              <span class="status-badge status-not-recorded" style="font-size:0.75rem;">
                ${items.length} Subject${items.length === 1 ? "" : "s"}
              </span>
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
              ${items.map(item => `
                <div style="display:flex; align-items:center; justify-content:space-between; background:var(--panel-muted, #f8fafc); border:1px solid var(--border-subtle, #e2e8f0); border-radius:6px; padding:8px 10px;">
                  <div>
                    <span style="font-size:0.88rem; font-weight:600; color:var(--text-primary, #0f172a); display:block;">
                      ${escapeHtml(item.subject)}
                    </span>
                    <div style="margin-top:2px;">
                      ${item.custom_quota && item.start_time
                        ? `<span class="status-badge status-late" style="font-size:0.72rem; padding:1px 6px;">
                            ⚡ Override: ${escapeHtml(item.start_time)} (${item.late_grace_period || 15}m grace)
                          </span>`
                        : `<span class="status-badge status-not-recorded" style="font-size:0.72rem; padding:1px 6px;">
                            🏛️ Admin Global Quota
                          </span>`
                      }
                    </div>
                  </div>
                  <button type="button" class="btn btn-ghost btn-icon-sm" data-remove-assignment="${escapeAttr(item.id)}" title="Remove assignment" style="padding:2px; width:22px; height:22px; color:var(--text-muted, #94a3b8);">
                    <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                  </button>
                </div>
              `).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function bindPresetChipClicks() {
    const input = $("#assign-subject-input");
    document.querySelectorAll(".subject-preset-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const sub = chip.dataset.presetSubject;
        if (input) {
          input.value = sub;
          input.focus();
        }
      });
    });

    const customCheck = $("#assign-custom-quota-check");
    const customFields = $("#assign-custom-quota-fields");
    if (customCheck && customFields) {
      customCheck.addEventListener("change", () => {
        customFields.classList.toggle("hidden", !customCheck.checked);
      });
    }
  }

  function bindAssignmentEvents() {
    if (State.bound) return;
    State.bound = true;

    // Delegate remove assignment
    $("#teacher-assignments")?.addEventListener("click", event => {
      const removeBtn = event.target.closest("[data-remove-assignment]");
      if (removeBtn) {
        const id = removeBtn.dataset.removeAssignment;
        State.assignments = State.assignments.filter(a => a.id !== id);
        renderAssignmentsSection();
        Toast.info("Assignment removed. Remember to click Save Assignments.");
        return;
      }

      if (event.target.closest("#btn-add-assignment")) {
        const subInput = $("#assign-subject-input");
        const secSelect = $("#assign-section-select");
        const subject = Utils.sanitizeText(subInput?.value, { max: 60 }).trim();
        const section = String(secSelect?.value || "").trim();

        if (!subject) return Toast.warn("Please specify a subject name.");
        if (!section) return Toast.warn("Please select an assigned section.");

        const duplicate = State.assignments.some(
          a => a.subject.toLowerCase() === subject.toLowerCase() && a.section.toLowerCase() === section.toLowerCase()
        );
        if (duplicate) {
          return Toast.warn(`You already have an assignment for ${subject} in ${section}.`);
        }

        const isCustom = $("#assign-custom-quota-check")?.checked === true;
        const startTime = String($("#assign-start-time")?.value || "09:00").trim();
        const grace = Number($("#assign-grace-period")?.value ?? 15);
        const outTime = String($("#assign-out-time")?.value || "10:00").trim();

        State.assignments.push({
          id: genId(),
          subject,
          section,
          custom_quota: isCustom,
          start_time: isCustom ? startTime : "",
          late_grace_period: isCustom ? grace : 15,
          out_start_time: isCustom ? outTime : ""
        });

        if (subInput) subInput.value = "";
        renderAssignmentsSection();
        Toast.success(`Added ${subject} for ${section}. Click Save to apply.`);
        return;
      }

      if (event.target.closest("#btn-save-assignments")) {
        saveAssignments();
      }
    });
  }

  async function saveAssignments() {
    const teacher = State.teacher;
    if (!teacher?.uid) return Toast.error("Authentication expired. Please sign in again.");

    const btn = $("#btn-save-assignments");
    Utils.setLoading(btn, true);

    try {
      const uniqueSections = Array.from(new Set(State.assignments.map(a => a.section)));
      const uniqueSubjects = Array.from(new Set(State.assignments.map(a => a.subject)));
      const cleanAssignments = State.assignments.map(a => ({
        id: a.id,
        subject: a.subject,
        section: a.section,
        custom_quota: a.custom_quota === true,
        start_time: a.start_time || "",
        late_grace_period: Number(a.late_grace_period ?? 15),
        out_start_time: a.out_start_time || ""
      }));

      const updates = {
        uid: teacher.uid,
        role: teacher.role,
        teaching_assignments: cleanAssignments,
        assigned_sections: uniqueSections,
        section: uniqueSections[0] || "",
        subject: uniqueSubjects.join(", ")
      };

      // 1. Update user profile document
      await ClassCare.DB.users.doc(teacher.uid).set(updates, { merge: true });

      // 2. Update teacher_subjects sync collection
      try {
        await ClassCare.DB.teacher_subjects.doc(teacher.uid).set({
          teacher_uid: teacher.uid,
          assignments: cleanAssignments,
          subjects: uniqueSubjects,
          sections: uniqueSections,
          updated_at: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.warn("[assignments] teacher_subjects update:", err);
      }

      // 3. Update local state
      Object.assign(teacher, updates);
      if (window.TeacherScannerState) {
        window.TeacherScannerState.teacher = teacher;
        if (uniqueSections.length) {
          uniqueSections.forEach(s => window.TeacherScannerState.sections.add(s));
          window.TeacherScannerState.section = uniqueSections[0];
        }
      }

      // 4. Trigger global refresh events
      window.dispatchEvent(new CustomEvent("classcare:assignments-updated", { detail: { teacher, assignments: cleanAssignments } }));
      window.dispatchEvent(new CustomEvent("classcare:enrollment-updated"));

      Toast.success("Teaching assignments saved successfully!");
      renderAssignmentsSection();
    } catch (error) {
      console.error("[assignments] save failed:", error);
      Toast.error(error?.message || "Failed to save teaching assignments. Please try again.");
    } finally {
      Utils.setLoading(btn, false);
    }
  }

  if (typeof ClassCare?.onCurrentUser === "function") {
    ClassCare.onCurrentUser(user => {
      if (user && ["teacher", "admin"].includes(user.role)) {
        initAssignments(user);
      }
    });
  }

  window.TeacherAssignments = {
    init: initAssignments,
    getAssignments: () => State.assignments.slice()
  };
  ClassCare.onCurrentUser(user => { if (!user || !['teacher','admin'].includes(user.role)) { stopMasterSections?.(); _unsubAssignments?.(); } });
})();
