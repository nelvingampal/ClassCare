/* ============================================================
   admin/users.js — people filters and attendance correction modal
   ============================================================ */
(function () {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  let overrideTarget = { uid: null, name: null }; let State = null;
  function escape(value) { return ClassCareUI.escapeHtml(value); }
  let filtersInitialized = false;
  function initFilters(state) {
    State = state;
    const select = $("#users-section");
    if (select) {
      const currentVal = select.value;
      const options = Array.from(state.sections || []).sort();
      select.innerHTML = `<option value="">All sections</option>${options.map(section => `<option value="${escape(section).replace(/"/g, "&quot;")}" ${section === currentVal ? "selected" : ""}>${escape(section)}</option>`).join("")}`;
    }
    const roleSelect = $("#users-role");
    if (roleSelect && !roleSelect.querySelector('option[value="pending"]')) {
      const opt = document.createElement("option");
      opt.value = "pending";
      opt.textContent = "Pending Approval";
      roleSelect.insertBefore(opt, roleSelect.querySelector('option[value="admin"]') || null);
    }
    if (roleSelect && !roleSelect.querySelector('option[value="pending_teacher"]')) {
      const opt = document.createElement("option");
      opt.value = "pending_teacher";
      opt.textContent = "Pending Teachers";
      roleSelect.insertBefore(opt, roleSelect.querySelector('option[value="admin"]') || null);
    }
    if (roleSelect && !roleSelect.querySelector('option[value="pending_student"]')) {
      const opt = document.createElement("option");
      opt.value = "pending_student";
      opt.textContent = "Pending Students";
      roleSelect.insertBefore(opt, roleSelect.querySelector('option[value="admin"]') || null);
    }
    if (!filtersInitialized) {
      filtersInitialized = true;
      ["#users-search", "#users-role", "#users-section"].forEach(selector => $(selector)?.addEventListener("input", () => render(State)));
      $("#users-role")?.addEventListener("change", () => render(State));
      $("#users-section")?.addEventListener("change", () => render(State));
      $("#users-clear")?.addEventListener("click", () => {
        if ($("#users-search")) $("#users-search").value = "";
        if ($("#users-role")) $("#users-role").value = "";
        if ($("#users-section")) $("#users-section").value = "";
        render(State);
      });
      wireOverrideModal(state);
      wireReassignModal(state);
    } else {
      // If already initialized, update the state references in the modals if they depend on the old state pointer.
      // But we use the global `State` variable inside the event listeners!
    }
    render(state);
  }
  function allUsers(state) {
    const users = [...Array.from(state.students.values()), ...Array.from(state.teachers.values())];
    if (state.otherAdmins) users.push(...Array.from(state.otherAdmins.values()));
    if (state.admin && !users.some(u => u.uid === state.admin.uid)) users.push(state.admin);
    return users;
  }
  function closeContactModal() { $("#contact-modal")?.remove(); }
  function closeTeacherAssignmentsModal() { $("#teacher-assignments-modal")?.remove(); }

  function openTeacherAssignmentsModal(state, teacher) {
    if (teacher.role !== "teacher") return;
    closeTeacherAssignmentsModal();
    const modal = document.createElement("div");
    modal.id = "teacher-assignments-modal";
    modal.className = "modal flex";
    const name = `${teacher.first_name || ""} ${teacher.last_name || ""}`.trim() || teacher.email || "Teacher";
    let assignments = Array.isArray(teacher.teaching_assignments) ? teacher.teaching_assignments.slice() : [];
    if (!assignments.length && (teacher.assigned_sections?.length || teacher.section)) {
      const secs = teacher.assigned_sections?.length ? teacher.assigned_sections : (teacher.section ? [teacher.section] : []);
      const subs = teacher.subject ? teacher.subject.split(/[,;&]+/).map(s => s.trim()).filter(Boolean) : ["General Subject"];
      secs.forEach(sec => subs.forEach(sub => assignments.push({ subject: sub, section: sec })));
    }
    const sectionOptions = Array.from(state.sections || []).sort();

    function renderList() {
      const listEl = modal.querySelector("#modal-assignment-list");
      if (!listEl) return;
      if (!assignments.length) {
        listEl.innerHTML = '<div class="state-panel state-empty" style="padding:12px;"><span>No subjects or sections assigned yet.</span></div>';
        return;
      }
      listEl.innerHTML = assignments.map((item, idx) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--panel-muted);border:1px solid var(--border-subtle);border-radius:6px;margin-bottom:6px;">
          <div>
            <strong>${escape(item.subject)}</strong>
            <span style="color:var(--text-muted);font-size:0.85rem;margin-left:8px;">in ${escape(item.section)}</span>
          </div>
          <button type="button" class="btn btn-ghost btn-icon-sm text-danger" data-modal-remove-idx="${idx}" style="padding:2px;width:22px;height:22px;">×</button>
        </div>
      `).join("");
      listEl.querySelectorAll("[data-modal-remove-idx]").forEach(btn => {
        btn.addEventListener("click", () => {
          const idx = parseInt(btn.dataset.modalRemoveIdx, 10);
          assignments.splice(idx, 1);
          renderList();
        });
      });
    }

    modal.innerHTML = `
      <div class="modal-backdrop" data-close-assignments></div>
      <div class="modal-card form-stack" style="max-width:540px;">
        <div class="modal-header">
          <div>
            <h2 class="modal-title">Teacher Assignments</h2>
            <p class="modal-copy">Manage subjects and assigned sections for ${escape(name)}.</p>
          </div>
          <button type="button" class="modal-close-btn" data-close-assignments aria-label="Close">×</button>
        </div>
        <div style="margin-bottom:12px;">
          <label class="field-label">Active Assignments</label>
          <div id="modal-assignment-list" style="max-height:180px;overflow-y:auto;border:1px solid var(--border);padding:8px;border-radius:6px;"></div>
        </div>
        <div style="background:var(--bg-muted);padding:12px;border-radius:6px;border:1px solid var(--border);">
          <strong style="font-size:0.9rem;display:block;margin-bottom:8px;">Add New Assignment</strong>
          <div class="field-row cols-2" style="gap:8px;margin-bottom:8px;">
            <input id="modal-new-sub" class="field" placeholder="Subject (e.g. Mathematics)" />
            <select id="modal-new-sec" class="field">
              <option value="">Select section…</option>
              ${sectionOptions.map(sec => `<option value="${escape(sec).replace(/"/g, "&quot;")}">${escape(sec)}</option>`).join("")}
            </select>
          </div>
          <button type="button" id="modal-btn-add-asg" class="btn btn-secondary btn-sm">+ Add Assignment</button>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;">
          <button type="button" class="btn btn-secondary" data-close-assignments>Cancel</button>
          <button type="button" id="modal-btn-save-asg" class="btn btn-primary">Save Changes</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.querySelectorAll("[data-close-assignments]").forEach(b => b.addEventListener("click", closeTeacherAssignmentsModal));
    renderList();

    modal.querySelector("#modal-btn-add-asg")?.addEventListener("click", () => {
      const sub = Utils.sanitizeText(modal.querySelector("#modal-new-sub")?.value, { max: 60 }).trim();
      const sec = String(modal.querySelector("#modal-new-sec")?.value || "").trim();
      if (!sub) return Toast.warn("Enter a subject name.");
      if (!sec) return Toast.warn("Select a section.");
      if (assignments.some(a => a.subject.toLowerCase() === sub.toLowerCase() && a.section.toLowerCase() === sec.toLowerCase())) {
        return Toast.warn("That subject & section pair is already added.");
      }
      assignments.push({ subject: sub, section: sec });
      modal.querySelector("#modal-new-sub").value = "";
      renderList();
    });

    modal.querySelector("#modal-btn-save-asg")?.addEventListener("click", async () => {
      const saveBtn = modal.querySelector("#modal-btn-save-asg");
      Utils.setLoading(saveBtn, true);
      try {
        const uniqueSecs = Array.from(new Set(assignments.map(a => a.section)));
        const uniqueSubs = Array.from(new Set(assignments.map(a => a.subject)));
        const cleanAssignments = assignments.map(a => ({
          subject: a.subject,
          section: a.section,
          custom_quota: a.custom_quota === true,
          start_time: a.start_time || "",
          late_grace_period: Number(a.late_grace_period ?? 15),
          out_start_time: a.out_start_time || ""
        }));
        const updates = {
          teaching_assignments: cleanAssignments,
          assigned_sections: uniqueSecs,
          section: uniqueSecs[0] || "",
          subject: uniqueSubs.join(", ")
        };
        await ClassCare.DB.users.doc(teacher.uid).set(updates, { merge: true });
        try {
          await ClassCare.DB.teacher_subjects.doc(teacher.uid).set({
            assignments: cleanAssignments,
            subjects: uniqueSubs,
            updated_at: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        } catch (_) {}
        Object.assign(teacher, updates);
        await ClassCare.DB.logAudit(state.admin?.uid || "", "teacher_assignments_updated", { teacher_uid: teacher.uid, count: cleanAssignments.length });
        Toast.success("Teacher assignments updated.");
        closeTeacherAssignmentsModal();
        render(state);
      } catch (err) {
        Toast.error("Failed to update teacher assignments.");
      } finally {
        Utils.setLoading(saveBtn, false);
      }
    });
  }

  function openContactModal(state, user) {
    if (user.role !== "student") return Toast.warn("Parent contacts can only be updated for students.");
    closeContactModal();
    const modal = document.createElement("div"); modal.id = "contact-modal"; modal.className = "modal flex"; modal.innerHTML = `<div class="modal-backdrop" data-close-contact></div><form id="form-contact" class="modal-card form-stack"><div class="modal-header"><div><h2 class="modal-title">Update parent contacts</h2><p class="modal-copy">These details are used for attendance alerts.</p></div><button type="button" class="modal-close-btn" data-close-contact aria-label="Close contacts">×</button></div><p class="detail-panel-copy">Student: <strong>${escape(`${user.first_name || ""} ${user.last_name || ""}`.trim() || user.uid)}</strong></p><div><label class="field-label" for="contact-email">Parent or guardian email</label><input id="contact-email" name="parent_email" type="email" class="field" maxlength="120" placeholder="parent@example.com" value="${escape(user.parent_email || "").replace(/"/g, "&quot;")}" /></div><div><label class="field-label" for="contact-telegram">Parent or guardian Telegram</label><input id="contact-telegram" name="parent_contact" class="field" maxlength="40" placeholder="Chat ID or @username" value="${escape(user.parent_contact || "").replace(/"/g, "&quot;")}" /></div><button type="submit" id="btn-save-contact" class="btn btn-primary btn-block">Save contacts</button></form>`;
    document.body.appendChild(modal); modal.querySelectorAll("[data-close-contact]").forEach(item => item.addEventListener("click", closeContactModal));
    modal.querySelector("#form-contact")?.addEventListener("submit", async event => { event.preventDefault(); const values = new FormData(event.target); const email = String(values.get("parent_email") || "").trim().toLowerCase(); const telegram = String(values.get("parent_contact") || "").trim(); if (email && !Utils.isEmail(email)) return Toast.error("Enter a valid parent email."); if (!email && !telegram) return Toast.error("Enter an email or Telegram contact."); const button = modal.querySelector("#btn-save-contact"); Utils.setLoading(button, true); try { await ClassCare.DB.users.doc(user.uid).set({ parent_email: email, parent_contact: telegram }, { merge: true }); Object.assign(user, { parent_email: email, parent_contact: telegram }); render(state); closeContactModal(); Toast.success("Parent contacts updated."); } catch (error) { Toast.error(error?.code === "permission-denied" ? "You do not have permission to update contacts." : "Contacts could not be saved."); } finally { Utils.setLoading(button, false); } });
  }
  async function approveTeacher(state, user) {
    try {
      await ClassCare.DB.users.doc(user.uid).set({ pending_approval: false }, { merge: true });
      user.pending_approval = false;
      await ClassCare.DB.logAudit(state.admin?.uid || "", "teacher_approved", { teacher_uid: user.uid, teacher_email: user.email });
      Toast.success(`Approved ${user.first_name || user.email}.`);
      render(state);
    } catch (error) {
      Toast.error(error?.code === "permission-denied" ? "Permission denied." : "Could not approve teacher.");
    }
  }

  async function approveStudent(state, user) {
    try {
      const targetSection = user.section || (Array.from(state.sections || [])[0] || "General Section");
      const cleanSectionId = String(targetSection).replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
      await ClassCare.DB.users.doc(user.uid).set({
        status: "enrolled",
        enrollment_status: "enrolled",
        pending_approval: false,
        section: targetSection,
        section_name: targetSection,
        section_id: cleanSectionId,
        enrollment_approved_at: firebase.firestore.FieldValue.serverTimestamp(),
        enrollment_approved_by: state.admin?.uid || "admin"
      }, { merge: true });

      user.status = "enrolled";
      user.enrollment_status = "enrolled";
      user.pending_approval = false;
      user.section = targetSection;

      // Link to enrollments collection so it immediately populates Teacher grading & attendance
      try {
        const enrDocId = ClassCare.DB.enrollmentDocId ? ClassCare.DB.enrollmentDocId(user.uid, targetSection, "General") : `${user.uid}_${cleanSectionId}_general`;
        await ClassCare.DB.enrollments.doc(enrDocId).set({
          student_uid: user.uid,
          student_id: user.student_id || "",
          student_name: `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email,
          section: targetSection,
          section_id: cleanSectionId,
          subject: "General",
          status: "enrolled",
          enrolled_at: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (_) {}

      await ClassCare.DB.logAudit(state.admin?.uid || "", "student_enrollment_approved", { student_uid: user.uid, student_email: user.email, section: targetSection });
      Toast.success(`Approved enrollment for ${user.first_name || user.email} into ${targetSection}.`);
      render(state);
      document.dispatchEvent(new CustomEvent("classcare:admin-refresh"));
      window.dispatchEvent(new CustomEvent("classcare:enrollment-updated"));
    } catch (error) {
      Toast.error(error?.code === "permission-denied" ? "Permission denied." : "Could not approve student enrollment.");
    }
  }

  async function removeUser(state, user) {
    const name = `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email || user.uid;
    if (!confirm(`Are you sure you want to remove ${name} (${user.role}) from the system? This action cannot be undone.`)) return;
    try {
      await ClassCare.DB.users.doc(user.uid).delete();
      State.students.delete(user.uid);
      State.teachers.delete(user.uid);
      await ClassCare.DB.logAudit(state.admin?.uid || "", "user_removed", { removed_uid: user.uid, email: user.email, role: user.role });
      Toast.success(`Removed ${name}.`);
      render(state);
      document.dispatchEvent(new CustomEvent("classcare:admin-refresh"));
    } catch (error) {
      console.error("[admin-users] delete failed:", error);
      Toast.error(error?.code === "permission-denied" ? "Permission denied to remove user." : "User could not be removed.");
    }
  }
  function render(state) {
    const search = String($("#users-search")?.value || "").trim().toLowerCase();
    const role = $("#users-role")?.value || "";
    const section = $("#users-section")?.value || "";
    const rows = allUsers(state).filter(user => {
      const isPendingStudent = user.role === "student" && (user.pending_approval === true || user.status === "pending" || user.enrollment_status === "pending" || user.enrollment_status === "not_enrolled");
      const isPendingTeacher = user.role === "teacher" && user.pending_approval === true;
      if (role === "pending") {
        if (!isPendingTeacher && !isPendingStudent) return false;
      } else if (role === "pending_teacher") {
        if (user.role !== "teacher" || !user.pending_approval) return false;
      } else if (role === "pending_student") {
        if (!isPendingStudent) return false;
      } else if (role && user.role !== role) {
        return false;
      }
      if (section && user.section !== section && (!user.assigned_sections || !user.assigned_sections.includes(section))) return false;
      if (search && !`${user.first_name || ""} ${user.last_name || ""} ${user.student_id || ""} ${user.email || ""}`.toLowerCase().includes(search)) return false;
      return true;
    }).sort((a, b) => `${a.last_name || ""} ${a.first_name || ""}`.localeCompare(`${b.last_name || ""} ${b.first_name || ""}`));
    const body = $("#users-tbody");
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6"><div class="state-panel state-empty"><strong>No people match these filters.</strong><span>${escape(search || section || role ? `Current filter: ${search || section || role}` : "Try another search or clear the filters.")}</span><button type="button" class="btn btn-ghost btn-sm" data-clear-users>Clear filters</button></div></td></tr>`;
      body.querySelector("[data-clear-users]")?.addEventListener("click", () => $("#users-clear")?.click());
      return;
    }
    body.innerHTML = rows.map(user => {
      const isSelf = user.uid === state.admin?.uid;
      const isPendingTeacher = user.role === "teacher" && user.pending_approval;
      const isPendingStudent = user.role === "student" && (user.pending_approval || user.status === "pending" || user.enrollment_status === "pending" || user.enrollment_status === "not_enrolled");
      const name = `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Unnamed user";
      const actionButtons = [];
      if (isPendingTeacher) {
        actionButtons.push(`<button type="button" class="btn btn-primary btn-sm" data-approve-uid="${escape(user.uid).replace(/"/g, "&quot;")}">Approve Teacher</button>`);
        actionButtons.push(`<button type="button" class="btn btn-ghost btn-sm" data-assign-uid="${escape(user.uid).replace(/"/g, "&quot;")}">Assignments</button>`);
      } else if (user.role === "teacher") {
        actionButtons.push(`<button type="button" class="btn btn-ghost btn-sm" data-assign-uid="${escape(user.uid).replace(/"/g, "&quot;")}">Assignments</button>`);
      }
      if (user.role === "student") {
        if (isPendingStudent) {
          actionButtons.push(`<button type="button" class="btn btn-primary btn-sm" data-approve-student-uid="${escape(user.uid).replace(/"/g, "&quot;")}">Approve</button>`);
        }
        actionButtons.push(`<button type="button" class="btn btn-ghost btn-sm" data-qr-uid="${escape(user.uid).replace(/"/g, "&quot;")}">ID QR</button>`);
        actionButtons.push(`<button type="button" class="btn btn-ghost btn-sm" data-reassign-uid="${escape(user.uid).replace(/"/g, "&quot;")}">Reassign</button>`);
        actionButtons.push(`<button type="button" class="btn btn-ghost btn-sm" data-contact-uid="${escape(user.uid).replace(/"/g, "&quot;")}">Contacts</button>`);
        actionButtons.push(`<button type="button" class="btn btn-ghost btn-sm" data-override-uid="${escape(user.uid).replace(/"/g, "&quot;")}">Correct</button>`);
      }
      // Password reset email action for users with email
      if (user.email) {
        actionButtons.push(`<button type="button" class="btn btn-ghost btn-sm" data-reset-pw="${escape(user.email).replace(/"/g, "&quot;")}">Reset PW</button>`);
      }
      if (!isSelf) {
        actionButtons.push(`<button type="button" class="btn btn-ghost btn-sm text-danger" data-delete-uid="${escape(user.uid).replace(/"/g, "&quot;")}">Remove</button>`);
      }
      const sectionDisplay = user.role === "teacher"
        ? (user.assigned_sections?.length ? user.assigned_sections.join(", ") : user.section || "—")
        : (user.section || "—");
      const parentContactDisplay = user.role === "student"
        ? (user.parent_email
            ? `<span style="font-size:0.82rem;">${escape(user.parent_email)}</span>`
            : (user.parent_contact
                ? `<span style="font-size:0.8rem;">${escape(user.parent_contact)}</span> <span class="status-badge status-late" style="font-size:0.7rem;" title="Parent email missing — digest unavailable">No Email</span>`
                : `<span class="status-badge status-absent" style="font-size:0.72rem;" title="Parent email and phone contact are both missing">⚠️ Missing Email</span>`))
        : (escape(user.parent_email || user.parent_contact || "—"));
      const statusBadge = isPendingTeacher || isPendingStudent ? ' <span class="status-badge status-absent">Pending Approval</span>' : "";
      return `<tr><td><div class="identity-cell"><span class="identity-avatar">${escape([user.first_name?.[0], user.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "?")}</span><span><span class="identity-name">${escape(name)}${statusBadge}</span><span class="identity-meta">${escape(user.email || "No email")}</span></span></div></td><td>${ClassCareUI.roleBadge(user.role)}</td><td>${escape(sectionDisplay)}</td><td class="tabular">${escape(user.student_id || "—")}</td><td class="tabular">${parentContactDisplay}</td><td class="align-right" style="white-space:nowrap;">${actionButtons.join(" ") || "—"}</td></tr>`;
    }).join("");

    body.querySelectorAll("[data-qr-uid]").forEach(button => button.addEventListener("click", () => openStudentQrModal(state.students.get(button.dataset.qrUid))));
    body.querySelectorAll("[data-reassign-uid]").forEach(button => button.addEventListener("click", () => openReassignModal(state.students.get(button.dataset.reassignUid))));
    body.querySelectorAll("[data-contact-uid]").forEach(button => button.addEventListener("click", () => openContactModal(state, state.students.get(button.dataset.contactUid))));
    body.querySelectorAll("[data-override-uid]").forEach(button => button.addEventListener("click", () => { const uid = button.dataset.overrideUid; const student = state.students.get(uid); openOverride(state, uid, `${student?.first_name || ""} ${student?.last_name || ""}`.trim() || uid); }));
    body.querySelectorAll("[data-approve-uid]").forEach(button => button.addEventListener("click", () => { const uid = button.dataset.approveUid; const teacher = state.teachers.get(uid); if (teacher) approveTeacher(state, teacher); }));
    body.querySelectorAll("[data-approve-student-uid]").forEach(button => button.addEventListener("click", () => { const uid = button.dataset.approveStudentUid; const student = state.students.get(uid); if (student) approveStudent(state, student); }));
    body.querySelectorAll("[data-assign-uid]").forEach(button => button.addEventListener("click", () => { const uid = button.dataset.assignUid; const teacher = state.teachers.get(uid); if (teacher) openTeacherAssignmentsModal(state, teacher); }));
    body.querySelectorAll("[data-delete-uid]").forEach(button => button.addEventListener("click", () => { const uid = button.dataset.deleteUid; const user = state.students.get(uid) || state.teachers.get(uid); if (user) removeUser(state, user); }));
    body.querySelectorAll("[data-reset-pw]").forEach(button => button.addEventListener("click", () => triggerPasswordReset(button.dataset.resetPw)));
  }

  function openStudentQrModal(user) {
    if (!user || user.role !== "student") return;
    const modal = $("#admin-walkin-qr-modal");
    if (!modal) return;

    const name = `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email || "Student";
    const nameEl = $("#admin-walkin-qr-name");
    const sidEl = $("#admin-walkin-qr-sid");
    const secEl = $("#admin-walkin-qr-sec");

    if (nameEl) nameEl.textContent = name;
    if (sidEl) sidEl.textContent = `Student ID: ${user.student_id || "—"}`;
    if (secEl) secEl.textContent = `Assigned: ${user.section || "Unassigned"}`;

    const canvasWrap = $("#admin-walkin-qr-canvas");
    if (canvasWrap) {
      canvasWrap.innerHTML = "";
      if (typeof QRCode !== "undefined") {
        const payload = user.qr_payload || {
          student_id: user.student_id || "",
          student_uid: user.uid,
          first_name: user.first_name || "",
          last_name: user.last_name || "",
          section: user.section || "",
          app: "ClassCare"
        };
        new QRCode(canvasWrap, {
          text: JSON.stringify(payload),
          width: 240,
          height: 240,
          colorDark: "#0f172a",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.M
        });
      } else {
        canvasWrap.innerHTML = '<div class="state-panel state-error"><span>QR Code generator not loaded</span></div>';
      }
    }
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }

  let activeReassignStudent = null;

  function openReassignModal(user) {
    if (!user || user.role !== "student") return;
    activeReassignStudent = user;
    const modal = $("#admin-reassign-modal");
    if (!modal) return;

    const name = `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email || "Student";
    const nameEl = $("#modal-reassign-student-name");
    const metaEl = $("#modal-reassign-student-meta");
    const curEl = $("#modal-reassign-current-sec");

    if (nameEl) nameEl.textContent = name;
    if (metaEl) metaEl.textContent = `ID: ${user.student_id || "—"} · Email: ${user.email || "No email"}`;
    if (curEl) curEl.textContent = user.section || "None (Unassigned)";

    const secSelect = $("#modal-reassign-new-sec");
    if (secSelect) {
      const sections = new Set();
      if (State?.sections) State.sections.forEach(s => s && sections.add(s));
      if (State?.settings?.master_sections) State.settings.master_sections.forEach(s => s && sections.add(s));
      secSelect.innerHTML = '<option value="">Select target section…</option>' +
        Array.from(sections).sort().map(s => `<option value="${escape(s).replace(/"/g, "&quot;")}" ${s === user.section ? 'selected' : ''}>${escape(s)}</option>`).join("");
    }
    const reasonInput = $("#modal-reassign-reason");
    if (reasonInput) reasonInput.value = "";

    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }

  function closeReassignModal() {
    const modal = $("#admin-reassign-modal");
    modal?.classList.add("hidden");
    modal?.classList.remove("flex");
    activeReassignStudent = null;
  }

  function wireReassignModal(state) {
    document.querySelectorAll("[data-close-reassign]").forEach(el => {
      el.addEventListener("click", closeReassignModal);
    });

    $("#form-admin-reassign")?.addEventListener("submit", async event => {
      event.preventDefault();
      if (!activeReassignStudent || !state?.admin) return;

      const newSection = String($("#modal-reassign-new-sec")?.value || "").trim();
      const reason = String($("#modal-reassign-reason")?.value || "").trim() || "Administrative reassignment";

      if (!newSection) return Toast.warn("Please select a target section.");
      if (newSection === activeReassignStudent.section) {
        return Toast.warn("Student is already assigned to this section.");
      }

      const btn = $("#btn-save-admin-reassign");
      Utils.setLoading(btn, true);
      try {
        const res = await ClassCare.DB.reassignStudentSection({
          studentUid: activeReassignStudent.uid,
          newSection,
          reason,
          adminUid: state.admin.uid,
          bypassCapacity: true // Admin overrides standard capacity limit
        });

        if (!res.success) {
          Toast.error(res.error || "Failed to reassign student.");
          return;
        }

        activeReassignStudent.section = newSection;
        activeReassignStudent.enrollment_status = "enrolled";
        state.students.set(activeReassignStudent.uid, activeReassignStudent);
        state.sections.add(newSection);

        closeReassignModal();
        render(state);
        document.dispatchEvent(new CustomEvent("classcare:admin-refresh"));
        Toast.success(`Reassigned ${activeReassignStudent.first_name || 'student'} to ${newSection}.`);
      } catch (err) {
        console.error("[admin-reassign] error:", err);
        Toast.error(err?.code === "permission-denied" ? "Permission denied to reassign section." : "Failed to reassign student.");
      } finally {
        Utils.setLoading(btn, false);
      }
    });
  }

  async function triggerPasswordReset(email) {
    if (!email) return Toast.warn("No email found for this user.");
    if (!confirm(`Send password reset email to ${email}?`)) return;
    try {
      const fb = ClassCare.getFirebase();
      if (!fb?.auth) throw new Error("Authentication service is unavailable.");
      await fb.auth.sendPasswordResetEmail(email);
      Toast.success(`Password reset link sent to ${email}.`);
    } catch (err) {
      console.error("[admin] reset pw failed:", err);
      Toast.error(err?.message || "Failed to send password reset email.");
    }
  }

  function openOverride(state, uid, name, customDate = null) {
    const date = customDate || Utils.todayIso();
    overrideTarget = { uid, name, date };
    $("#ov-student").textContent = name || uid;
    $("#ov-date").textContent = date;
    const existing = state.attendance.get(`${uid}_${date}`);
    const form = $("#form-override");
    form.time_in.value = existing?.time_in || Utils.nowHhMm();
    form.status.value = existing?.status || "Present";
    form.time_out.value = existing?.time_out || "";
    $("#override-modal")?.classList.remove("hidden");
    $("#override-modal")?.classList.add("flex");
    $("#override-time-in")?.focus();
  }

  function closeOverride() {
    $("#override-modal")?.classList.add("hidden");
    $("#override-modal")?.classList.remove("flex");
  }

  function wireOverrideModal(state) {
    $("#form-override")?.addEventListener("submit", async event => {
      event.preventDefault();
      if (!overrideTarget.uid) return Toast.error("Select a person first.");
      const values = new FormData(event.target);
      const timeIn = String(values.get("time_in") || "");
      const status = String(values.get("status") || "");
      const timeOut = String(values.get("time_out") || "");
      if (!timeIn || !["Present", "Late", "Absent"].includes(status)) return Toast.error("Enter a time and valid status.");
      const admin = state.admin;
      const targetDate = overrideTarget.date || Utils.todayIso();
      const oldRecord = state.attendance.get(`${overrideTarget.uid}_${targetDate}`);
      const oldStatus = oldRecord?.status || "Not recorded";
      const button = $("#btn-save-ov");
      Utils.setLoading(button, true);
      try {
        let minutesLate = 0;
        if (status === "Present" || status === "Late") {
          const startTime = state.settings.morning_start || state.settings.school_start_time || "07:30";
          const grace = state.settings.late_grace_period ?? 15;
          minutesLate = Math.max(0, Utils.minutesBetween(timeIn, startTime) - grace);
        }
        const payload = {
          student_uid: overrideTarget.uid,
          date: targetDate,
          time_in: timeIn,
          status,
          section: state.students.get(overrideTarget.uid)?.section || "",
          minutes_late: minutesLate,
          overridden: true,
          overridden_by: admin.uid,
          overridden_by_name: `${admin.first_name || ""} ${admin.last_name || ""}`.trim() || admin.email,
          overridden_at: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (timeOut) payload.time_out = timeOut;
        await ClassCare.DB.attendance.doc(ClassCare.DB.attendanceDocId(overrideTarget.uid, targetDate)).set(payload, { merge: true });
        state.attendance.set(`${overrideTarget.uid}_${targetDate}`, { ...payload, time_out: timeOut });
        await ClassCare.DB.logAudit(admin.uid, "attendance_override", {
          actor_name: payload.overridden_by_name,
          student_uid: overrideTarget.uid,
          student_name: overrideTarget.name,
          date: targetDate,
          old_status: oldStatus,
          new_status: status,
          new_time_in: timeIn
        });
        render(state);
        document.dispatchEvent(new CustomEvent("classcare:admin-refresh"));
        closeOverride();
        Toast.success(`Attendance correction saved for ${targetDate}.`);
      } catch (error) {
        console.error("[admin-override] failed:", error);
        Toast.error(error?.code === "permission-denied" ? "You do not have permission to correct attendance." : "Correction could not be saved. Try again.");
      } finally {
        Utils.setLoading(button, false);
      }
    });
    document.addEventListener("click", event => { if (event.target.closest("[data-close-ov]")) closeOverride(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape") closeOverride(); });
  }

  window.AdminShared = {
    initFilters,
    openOverrideWithDate: (state, uid, name, date) => openOverride(state, uid, name, date)
  };
})();
