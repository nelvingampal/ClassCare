/* ============================================================
   admin/settings.js — timing controls and role provisioning
   ============================================================ */
(function () {
  "use strict";
  const $ = selector => document.querySelector(selector); let State = null; let promotedTarget = null; let booted = false;
  function getAdminUid() {
    return State?.admin?.uid || State?.currentUser?.uid || ClassCare.getFirebase()?.auth?.currentUser?.uid || "admin";
  }
  const previousInit = window.AdminShared?.initFilters;
  window.AdminShared = window.AdminShared || {};
  window.AdminShared.initFilters = function (state) { previousInit?.(state); State = state; boot(state); };
  function boot(state) {
    if (booted) return; booted = true; State = state;
    if ($("#set-morning-start")) $("#set-morning-start").value = state.settings.morning_start || "07:30";
    if ($("#set-morning-late")) $("#set-morning-late").value = state.settings.late_threshold_time || state.settings.morning_late_cutoff || "07:45";
    if ($("#set-morning-out-start")) $("#set-morning-out-start").value = state.settings.morning_out_start || "11:30";
    if ($("#set-morning-out-end")) $("#set-morning-out-end").value = state.settings.morning_out_end || "12:00";

    if ($("#set-afternoon-start")) $("#set-afternoon-start").value = state.settings.afternoon_start || "13:00";
    if ($("#set-afternoon-late")) $("#set-afternoon-late").value = state.settings.afternoon_late_cutoff || "13:15";
    if ($("#set-afternoon-out-start")) $("#set-afternoon-out-start").value = state.settings.afternoon_out_start || "15:00";
    if ($("#set-afternoon-out-end")) $("#set-afternoon-out-end").value = state.settings.afternoon_out_end || "17:00";

    if ($("#set-start")) $("#set-start").value = state.settings.morning_start || state.settings.school_start_time || "07:30";
    if ($("#set-grace")) $("#set-grace").value = state.settings.late_grace_period ?? 15;
    $("#set-capacity")?.setAttribute("value", state.settings.section_capacity ?? 45);

    $("#btn-deped-preset")?.addEventListener("click", () => {
      if ($("#set-morning-start")) $("#set-morning-start").value = "07:30";
      if ($("#set-morning-late")) $("#set-morning-late").value = "07:45";
      if ($("#set-morning-out-start")) $("#set-morning-out-start").value = "11:30";
      if ($("#set-morning-out-end")) $("#set-morning-out-end").value = "12:00";
      if ($("#set-afternoon-start")) $("#set-afternoon-start").value = "13:00";
      if ($("#set-afternoon-late")) $("#set-afternoon-late").value = "13:15";
      if ($("#set-afternoon-out-start")) $("#set-afternoon-out-start").value = "15:00";
      if ($("#set-afternoon-out-end")) $("#set-afternoon-out-end").value = "17:00";
      Toast.info("DepEd standard timetable restored. Click 'Save all settings' to apply.");
    });
    const enrollToggle = $("#toggle-enrollment");
    if (enrollToggle) {
      const isInitiallyOpen = ClassCare.isEnrollmentOpen ? ClassCare.isEnrollmentOpen(state.settings) : ClassCare.DB.isEnrollmentOpen(state.settings);
      enrollToggle.checked = isInitiallyOpen;
      updateEnrollmentBadge(isInitiallyOpen);
      enrollToggle.addEventListener("change", handleEnrollmentToggle);
    }
    try {
      ClassCare.DB.settings.onSnapshot(doc => {
        if (!doc.exists) return;
        const data = doc.data() || {};
        const isOpen = ClassCare.isEnrollmentOpen ? ClassCare.isEnrollmentOpen(data) : ClassCare.DB.isEnrollmentOpen(data);
        if (enrollToggle && enrollToggle !== document.activeElement) {
          enrollToggle.checked = isOpen;
          updateEnrollmentBadge(isOpen);
        }
        if (State) {
          State.settings = Object.assign(State.settings || {}, data);
        }
      }, err => {
        console.warn("[admin-settings] settings snapshot listener error:", err);
      });
    } catch (err) {
      console.warn("[admin-settings] setup snapshot listener error:", err);
    }
    $("#set-ay")?.setAttribute("value", state.settings.academic_year || "");
    $("#set-term")?.setAttribute("value", state.settings.current_school_term ?? 1);
    $("#btn-save-settings")?.addEventListener("click", saveSettings);
    $("#btn-add-section")?.addEventListener("click", addSection);
    renderSectionsList();
    loadSectionCapacityDashboard();
    loadEnrollmentRequests();
    populateAdminWalkinGrades();

    $("#form-admin-walkin-enroll")?.addEventListener("submit", handleAdminWalkinEnroll);
    document.querySelectorAll("[data-close-admin-walkin-qr]").forEach(el => {
      el.addEventListener("click", closeAdminWalkinQrModal);
    });
    $("#btn-download-admin-walkin-qr")?.addEventListener("click", downloadAdminWalkinQrPng);

    let timer;
    $("#promote-email")?.addEventListener("input", event => { clearTimeout(timer); const email = String(event.target.value || "").trim().toLowerCase(); if (!Utils.isEmail(email)) return hidePromote(); timer = setTimeout(() => lookupUser(email), 300); });
    $("#btn-promote")?.addEventListener("click", promoteCurrent);
    document.addEventListener("classcare:admin-refresh", () => {
      loadSectionCapacityDashboard();
      loadEnrollmentRequests();
      populateAdminWalkinGrades();
    });
  }

  function populateAdminWalkinGrades() {
    const select = $("#admin-walkin-grade");
    if (!select) return;
    const grades = new Set();
    const sections = Array.from(State?.settings?.master_sections || []);
    sections.forEach(sec => {
      const match = sec.match(/Grade\s*(\d+)/i);
      if (match) {
        grades.add(`Grade ${match[1]}`);
      } else {
        const numMatch = sec.match(/(\d+)/);
        if (numMatch) grades.add(`Grade ${numMatch[1]}`);
      }
    });
    for (let i = 1; i <= 12; i++) {
      grades.add(`Grade ${i}`);
    }
    const sorted = Array.from(grades).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(b.replace(/\D/g, ""), 10) || 0;
      return numA - numB;
    });
    select.innerHTML = `<option value="">Select Grade Level</option>` +
      sorted.map(g => `<option value="${ClassCareUI.escapeHtml(g).replace(/"/g, "&quot;")}">${ClassCareUI.escapeHtml(g)}</option>`).join("");
  }

  let activeAdminWalkinQrCode = null;

  async function handleAdminWalkinEnroll(event) {
    event?.preventDefault();
    const fname = String($("#admin-walkin-fname")?.value || "").trim();
    const lname = String($("#admin-walkin-lname")?.value || "").trim();
    const sid = String($("#admin-walkin-id")?.value || "").trim();
    const grade = String($("#admin-walkin-grade")?.value || "").trim();
    const parentEmail = String($("#admin-walkin-parent-email")?.value || "").trim();
    const parentContact = String($("#admin-walkin-parent-contact")?.value || "").trim();

    if (!fname || !lname) return Toast.error("Please enter the student's first and last name.");
    if (!grade) return Toast.error("Please select a target grade level.");

    const btn = $("#btn-admin-walkin-enroll");
    Utils.setLoading(btn, true);

    try {
      const res = await ClassCare.DB.manualEnrollStudent({
        studentData: {
          first_name: fname,
          last_name: lname,
          student_id: sid,
          grade_level: grade,
          parent_email: parentEmail,
          parent_contact: parentContact
        },
        enrolledBy: {
          uid: getAdminUid(),
          name: `${State?.admin?.first_name || ""} ${State?.admin?.last_name || ""}`.trim() || State?.admin?.email || "IT Admin",
          role: "admin"
        }
      });

      if (!res.success) {
        throw new Error(res.error || "Enrollment could not be completed.");
      }

      if (res.status === "waitlist") {
        Toast.warn(`All sections for ${grade} are at maximum capacity (${ClassCare.DB.SECTION_CAPACITY_LIMIT}/${ClassCare.DB.SECTION_CAPACITY_LIMIT}). Walk-in student ${res.student_name} (${res.student_id}) has been added to the waitlist. Please provision an additional section.`);
        $("#form-admin-walkin-enroll")?.reset();
        loadEnrollmentRequests();
        loadSectionCapacityDashboard();
        return;
      }

      Toast.success(`Student ${res.student_name} successfully enrolled into ${res.section}!`);
      showAdminWalkinQrModal(res);
      $("#form-admin-walkin-enroll")?.reset();
      loadEnrollmentRequests();
      loadSectionCapacityDashboard();
      document.dispatchEvent(new CustomEvent("classcare:admin-refresh"));
    } catch (err) {
      console.error("[admin-walkin-enroll] error:", err);
      Toast.error(err.message || "Failed to complete walk-in enrollment.");
    } finally {
      Utils.setLoading(btn, false);
    }
  }

  function showAdminWalkinQrModal(studentInfo) {
    const modal = $("#admin-walkin-qr-modal");
    if (!modal) return;
    const nameEl = $("#admin-walkin-qr-name");
    const sidEl = $("#admin-walkin-qr-sid");
    const secEl = $("#admin-walkin-qr-sec");
    const canvasWrap = $("#admin-walkin-qr-canvas");

    if (nameEl) nameEl.textContent = studentInfo.student_name || "Student";
    if (sidEl) sidEl.textContent = `Student ID: ${studentInfo.student_id || "—"}`;
    if (secEl) secEl.textContent = `Assigned Section: ${studentInfo.section || "—"} (${studentInfo.grade_level || ""})`;

    if (canvasWrap) {
      canvasWrap.innerHTML = "";
      if (typeof QRCode === "function") {
        activeAdminWalkinQrCode = new QRCode(canvasWrap, {
          text: JSON.stringify(studentInfo.qr_payload),
          width: 240,
          height: 240,
          colorDark: "#0f172a",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.M
        });
      } else {
        canvasWrap.innerHTML = `<div class="state-panel state-error"><span>QR Code generator not loaded</span></div>`;
      }
    }

    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }

  function closeAdminWalkinQrModal() {
    const modal = $("#admin-walkin-qr-modal");
    modal?.classList.add("hidden");
    modal?.classList.remove("flex");
  }

  function downloadAdminWalkinQrPng() {
    const canvasWrap = $("#admin-walkin-qr-canvas");
    const imgOrCanvas = canvasWrap?.querySelector("canvas") || canvasWrap?.querySelector("img");
    if (!imgOrCanvas) return Toast.error("QR Code image is not ready yet.");

    let dataUrl = "";
    if (imgOrCanvas.tagName === "CANVAS") {
      dataUrl = imgOrCanvas.toDataURL("image/png");
    } else if (imgOrCanvas.src) {
      dataUrl = imgOrCanvas.src;
    }

    if (!dataUrl) return Toast.error("Could not capture QR code image.");
    const sid = $("#admin-walkin-qr-sid")?.textContent.replace(/[^0-9A-Za-z_-]/g, "") || "student";
    const link = document.createElement("a");
    link.download = `ClassCare-ID-${sid}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    Toast.success("QR Code downloaded as PNG.");
  }

  function updateEnrollmentBadge(isOpen) {
    const badge = $("#enrollment-status-badge");
    if (!badge) return;
    if (isOpen) {
      badge.textContent = "OPEN";
      badge.className = "status-badge status-present";
      badge.title = "Enrollment period is open. Students can submit enrollment requests.";
    } else {
      badge.textContent = "CLOSED";
      badge.className = "status-badge status-absent";
      badge.title = "Enrollment period is closed. Students cannot submit enrollment requests.";
    }
  }

  async function handleEnrollmentToggle(event) {
    const isOpen = event.target.checked;
    const btn = event.target;
    const adminUid = getAdminUid();
    try {
      btn.disabled = true;

      // 1. Immediately store in localStorage and broadcast across browser tabs
      try {
        localStorage.setItem("classcare_enrollment_open", isOpen ? "true" : "false");
        const channel = new BroadcastChannel("classcare-sync");
        channel.postMessage({ type: "enrollment_toggle", isOpen, timestamp: Date.now() });
      } catch (_) {}
      window.dispatchEvent(new CustomEvent("classcare:enrollment-changed", { detail: { isOpen } }));

      const payload = {
        enrollment_open: isOpen,
        enrollment_status: isOpen ? "OPEN" : "CLOSED",
        enrollment_toggled_by: adminUid,
        enrollment_toggled_at: firebase.firestore.FieldValue.serverTimestamp()
      };
      await ClassCare.DB.settings.set(payload, { merge: true });
      if (State?.settings) {
        State.settings.enrollment_open = isOpen;
        State.settings.enrollment_status = isOpen ? "OPEN" : "CLOSED";
      }
      updateEnrollmentBadge(isOpen);
      await ClassCare.DB.logAudit(adminUid, "enrollment_period_toggle", {
        enrollment_open: isOpen,
        enrollment_status: isOpen ? "OPEN" : "CLOSED"
      });
      Toast.success(`Enrollment period is now ${isOpen ? "OPEN" : "CLOSED"}.`);
    } catch (err) {
      console.error("[enrollment-toggle] failed:", err);
      btn.checked = !isOpen;
      updateEnrollmentBadge(!isOpen);
      try {
        localStorage.setItem("classcare_enrollment_open", (!isOpen) ? "true" : "false");
      } catch (_) {}
      Toast.error(err?.code === "permission-denied"
        ? "You do not have permission to toggle enrollment."
        : "Failed to update enrollment period.");
    } finally {
      btn.disabled = false;
    }
  }

  async function loadSectionCapacityDashboard() {
    const container = $("#section-capacity-list");
    if (!container || !State) return;
    const sections = Array.from(State.settings?.master_sections || []).sort();
    if (!sections.length) {
      container.innerHTML = '<div class="state-panel state-empty"><span>No sections defined yet. Add sections above.</span></div>';
      return;
    }
    container.innerHTML = sections.map(sec => `
      <div class="capacity-row" data-section-load="${ClassCareUI.escapeHtml(sec).replace(/"/g, "&quot;")}">
        <div style="flex:1;">
          <strong style="font-weight:600;">${ClassCareUI.escapeHtml(sec)}</strong>
          <div class="capacity-bar-wrap">
            <div class="capacity-bar" style="width:0%;"></div>
          </div>
          <span class="capacity-count u-sr-only">Loading…</span>
        </div>
      </div>
    `).join("");
    for (const section of sections) {
      try {
        const info = await ClassCare.DB.getSectionCount(section);
        const row = container.querySelector(`[data-section-load="${section.replace(/"/g, "&quot;")}"]`);
        if (!row) continue;
        const pct = info.capacity ? Math.min(100, Math.round((info.count / info.capacity) * 100)) : 0;
        const barColor = pct >= 100 ? "#b91c1c" : pct >= 85 ? "#a16207" : pct >= 70 ? "#1d4ed8" : "#15803d";
        const bar = row.querySelector(".capacity-bar");
        const count = row.querySelector(".capacity-count");
        if (bar) {
          bar.style.width = pct + "%";
          bar.style.background = barColor;
        }
        if (count) {
          count.classList.remove("u-sr-only");
          count.textContent = `${info.count} / ${info.capacity} · ${info.available} slots`;
          count.style.fontSize = "12px";
          count.style.color = "var(--text-muted)";
          count.style.marginTop = "4px";
          count.style.display = "block";
        }
      } catch (err) {
        console.warn("[capacity] failed for", section, err);
      }
    }
  }

  let stopEnrollmentRequests;
  async function loadEnrollmentRequests() {
    const tbody = $("#enrollment-requests-tbody");
    if (!tbody) return;
    try {
      stopEnrollmentRequests?.();
      stopEnrollmentRequests = ClassCare.DB.enrollment_requests.onSnapshot(snap => {
      const requests = [];
      snap.forEach(doc => requests.push({ id: doc.id, ...doc.data() }));
      const badge = $("#enrollment-requests-count");
      const actionableCount = requests.filter(r => r.status === "Pending" || r.status === "Waitlisted").length;
      if (badge) badge.textContent = `${actionableCount} pending/waitlist`;
      if (!requests.length) {
        tbody.innerHTML = `<tr><td colspan="7"><div class="state-panel state-empty"><strong>No enrollment records yet.</strong><span>Records appear here when students enroll or are waitlisted during the open period.</span></div></td></tr>`;
        return;
      }
      tbody.innerHTML = requests.map(r => {
        const isEnrolled = r.status === "Approved" || r.status === "Enrolled";
        const isWaitlisted = r.status === "Waitlisted";
        const statusColor = isEnrolled ? "status-present"
          : r.status === "Rejected" ? "status-absent"
          : isWaitlisted ? "status-late"
          : r.status === "Pending" ? "status-late"
          : "status-not-recorded";
        let actions = "—";
        if (r.status === "Pending") {
          actions = `<button type="button" class="btn btn-primary btn-sm" data-approve="${ClassCareUI.escapeHtml(r.id).replace(/"/g, "&quot;")}">Approve</button>
                     <button type="button" class="btn btn-ghost btn-sm text-danger" data-reject="${ClassCareUI.escapeHtml(r.id).replace(/"/g, "&quot;")}">Reject</button>`;
        } else if (isWaitlisted) {
          actions = `<button type="button" class="btn btn-primary btn-sm" data-approve="${ClassCareUI.escapeHtml(r.id).replace(/"/g, "&quot;")}"><svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14m-7-7h14"/></svg>Assign Section</button>
                     <button type="button" class="btn btn-ghost btn-sm text-danger" data-reject="${ClassCareUI.escapeHtml(r.id).replace(/"/g, "&quot;")}">Reject</button>`;
        } else if (isEnrolled) {
          actions = `<span class="status-badge status-present" style="font-size:11px;">Enrolled</span>`;
        } else {
          actions = `<span class="tabular">${r.reviewed_at ? new Date(r.reviewed_at.seconds * 1000).toLocaleDateString() : "—"}</span>`;
        }
        return `<tr>
          <td><strong>${ClassCareUI.escapeHtml(r.student_name || "—")}</strong><div style="font-size:11px;color:var(--text-muted);">${ClassCareUI.escapeHtml(r.email || "")}</div></td>
          <td class="tabular">${ClassCareUI.escapeHtml(r.student_id || "—")}</td>
          <td>${ClassCareUI.escapeHtml(r.target_grade_level || r.grade_level || "—")}</td>
          <td>${ClassCareUI.escapeHtml(r.assigned_section || r.preferred_section || (isWaitlisted ? "Waitlist (Pending Section)" : "—"))}</td>
          <td>${ClassCareUI.escapeHtml(r.enrollment_type === "auto_sectioning" ? "In-App Auto-Enrollment" : (r.personal_info?.address || "Direct Enrollment"))}</td>
          <td><span class="status-badge ${statusColor}">${ClassCareUI.escapeHtml(r.status || "Pending")}</span></td>
          <td class="align-right">${actions}</td>
        </tr>`;
      }).join("");
      tbody.querySelectorAll("[data-approve]").forEach(btn => {
        btn.addEventListener("click", () => approveEnrollmentRequest(btn.dataset.approve));
      });
      tbody.querySelectorAll("[data-reject]").forEach(btn => {
        btn.addEventListener("click", () => rejectEnrollmentRequest(btn.dataset.reject));
      });
      }, error => { tbody.textContent = 'Enrollment requests unavailable: ' + error.message; });
    } catch (err) {
      console.error("[enrollment-requests] load failed:", err);
      tbody.innerHTML = `<tr><td colspan="7"><div class="state-panel state-error"><strong>Requests unavailable</strong><span>${ClassCareUI.escapeHtml(err?.code === "permission-denied" ? "Permission denied." : "Check connection and retry.")}</span></div></td></tr>`;
    }
  }

  async function approveEnrollmentRequest(requestId) {
    if (!confirm("Assign/Approve section for this student? Their user profile will be updated with the assigned section.")) return;
    try {
      const doc = await ClassCare.DB.enrollment_requests.doc(requestId).get();
      if (!doc.exists) return Toast.warn("Request not found.");
      const req = doc.data() || {};
      const gradeRaw = req.target_grade_level || req.grade_level || "";
      const gradeNum = String(gradeRaw).replace(/\D/g, "");
      const targetGradeFormatted = gradeNum ? `Grade ${gradeNum}` : (gradeRaw || "Grade 5");
      
      let assignedSection = req.assigned_section || req.preferred_section || "";
      if (!assignedSection) {
        const available = await ClassCare.DB.findAvailableSectionForGrade(targetGradeFormatted, req.preferred_section);
        if (available?.section) {
          assignedSection = available.section;
        } else {
          // Fallback: assign to an active section matching the grade or default
          const existingSec = Array.from(State?.sections || []).find(s => s.toLowerCase().includes(String(gradeNum || "5")));
          assignedSection = existingSec || (targetGradeFormatted ? `${targetGradeFormatted} - Section A` : (req.preferred_section || "Section A"));
        }
      }

      const adminUid = getAdminUid();
      const updates = {
        status: "Approved",
        assigned_section: assignedSection,
        reviewed_by: adminUid,
        reviewed_at: firebase.firestore.FieldValue.serverTimestamp()
      };
      await ClassCare.DB.enrollment_requests.doc(requestId).set(updates, { merge: true });

      if (req.student_uid) {
        try {
          const cleanSectionId = String(assignedSection).replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
          await ClassCare.DB.users.doc(req.student_uid).set({
            section: assignedSection,
            section_name: assignedSection,
            section_id: cleanSectionId,
            grade_level: targetGradeFormatted,
            status: "enrolled",
            enrollment_status: "enrolled",
            pending_approval: false,
            enrollment_approved_at: firebase.firestore.FieldValue.serverTimestamp(),
            enrollment_approved_by: adminUid
          }, { merge: true });
          await ClassCare.DB.incrementSectionCount(assignedSection);

          // Link to enrollments collection so student immediately maps to Teacher grading & attendance
          const enrDocId = ClassCare.DB.enrollmentDocId ? ClassCare.DB.enrollmentDocId(req.student_uid, assignedSection, "General") : `${req.student_uid}_${cleanSectionId}_general`;
          await ClassCare.DB.enrollments.doc(enrDocId).set({
            student_uid: req.student_uid,
            student_id: req.student_id || "",
            student_name: req.student_name || "Student",
            section: assignedSection,
            section_id: cleanSectionId,
            grade: targetGradeFormatted,
            subject: "General",
            status: "enrolled",
            enrolled_at: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        } catch (updateErr) {
          console.warn("[enrollment-approve] user sync error:", updateErr);
        }
      }

      await ClassCare.DB.logAudit(adminUid, "enrollment_approve", {
        request_id: requestId,
        student_uid: req.student_uid,
        student_name: req.student_name,
        assigned_section: assignedSection
      });
      Toast.success(`Assigned: ${req.student_name || "Student"} assigned to ${assignedSection}.`);
      loadEnrollmentRequests();
      loadSectionCapacityDashboard();
      document.dispatchEvent(new CustomEvent("classcare:admin-refresh"));
      window.dispatchEvent(new CustomEvent("classcare:enrollment-updated"));
    } catch (err) {
      console.error("[approve] failed:", err);
      Toast.error(err?.code === "permission-denied" ? "Permission denied." : "Failed to assign section.");
    }
  }

  async function rejectEnrollmentRequest(requestId) {
    const reason = prompt("Enter a reason for rejection (shown to the student):");
    if (reason === null) return;
    const adminUid = getAdminUid();
    try {
      const doc = await ClassCare.DB.enrollment_requests.doc(requestId).get();
      const req = doc.exists ? doc.data() : {};
      await ClassCare.DB.enrollment_requests.doc(requestId).set({
        status: "Rejected",
        rejection_reason: reason || "No reason provided.",
        reviewed_by: adminUid,
        reviewed_at: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      if (req.student_uid) {
        try {
          await ClassCare.DB.users.doc(req.student_uid).set({
            enrollment_status: "Rejected",
            enrollment_rejection_reason: reason || "No reason provided."
          }, { merge: true });
        } catch (_) {}
      }
      await ClassCare.DB.logAudit(adminUid, "enrollment_reject", {
        request_id: requestId,
        student_uid: req.student_uid,
        student_name: req.student_name,
        reason: reason || ""
      });
      Toast.success("Request rejected.");
      loadEnrollmentRequests();
    } catch (err) {
      console.error("[reject] failed:", err);
      Toast.error(err?.code === "permission-denied" ? "Permission denied." : "Failed to reject request.");
    }
  }
  function renderSectionsList() {
    const container = $("#sections-manage-list"); if (!container || !State) return;
    const sections = Array.from(State.settings?.master_sections || []).sort();
    if (!sections.length) {
      container.innerHTML = '<div class="state-panel state-empty"><span>No sections defined yet.</span></div>';
      return;
    }
    container.innerHTML = sections.map(sec => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0.4rem 0.6rem;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:6px;gap:0.5rem;">
        <span style="font-weight:600;flex:1;">${ClassCareUI.escapeHtml(sec)}</span>
        <div style="display:flex;gap:0.25rem;">
          <button type="button" class="btn btn-ghost btn-sm" data-edit-section="${ClassCareUI.escapeHtml(sec).replace(/"/g, "&quot;")}">Edit</button>
          <button type="button" class="btn btn-ghost btn-sm text-danger" data-remove-section="${ClassCareUI.escapeHtml(sec).replace(/"/g, "&quot;")}">Remove</button>
        </div>
      </div>
    `).join("");
    container.querySelectorAll("[data-edit-section]").forEach(btn => {
      btn.addEventListener("click", () => editSection(btn.dataset.editSection));
    });
    container.querySelectorAll("[data-remove-section]").forEach(btn => {
      btn.addEventListener("click", () => removeSection(btn.dataset.removeSection));
    });
  }
  async function editSection(oldSecName) {
    const updated = prompt(`Edit section name:`, oldSecName);
    if (!updated || updated.trim() === oldSecName) return;
    const cleanUpdated = updated.trim();
    const list = Array.from(State.settings?.master_sections || []);
    if (list.includes(cleanUpdated)) return Toast.warn("A section with that name already exists.");
    const idx = list.indexOf(oldSecName);
    if (idx >= 0) list[idx] = cleanUpdated;
    try {
      await ClassCare.DB.settings.set({ master_sections: list }, { merge: true });
      State.settings.master_sections = list;
      Toast.success(`Updated to ${cleanUpdated}`);
      renderSectionsList();
      loadSectionCapacityDashboard();
      document.dispatchEvent(new CustomEvent("classcare:admin-refresh"));
    } catch (err) { Toast.error("Failed to update section."); }
  }
  async function addSection() {
    const grade = String($("#new-section-grade")?.value || "").trim();
    const name = String($("#new-section-name")?.value || "").trim();
    if (!grade || !name) return Toast.error("Enter both grade/level and section name.");
    const fullSection = `${grade} - ${name}`;
    const list = Array.from(State.settings?.master_sections || []);
    if (list.includes(fullSection)) return Toast.warn("That section already exists.");
    list.push(fullSection);
    const btn = $("#btn-add-section"); Utils.setLoading(btn, true);
    try {
      await ClassCare.DB.settings.set({ master_sections: list }, { merge: true });
      State.settings.master_sections = list;
      $("#new-section-grade").value = ""; $("#new-section-name").value = "";
      Toast.success(`Added ${fullSection}`);
      renderSectionsList();
      loadSectionCapacityDashboard();
      document.dispatchEvent(new CustomEvent("classcare:admin-refresh"));
    } catch (err) {
      Toast.error("Failed to save section.");
    } finally { Utils.setLoading(btn, false); }
  }
  async function removeSection(secName) {
    if (!confirm(`Remove ${secName} from master sections list?`)) return;
    const list = Array.from(State.settings?.master_sections || []).filter(s => s !== secName);
    try {
      await ClassCare.DB.settings.set({ master_sections: list }, { merge: true });
      State.settings.master_sections = list;
      Toast.success(`Removed ${secName}`);
      renderSectionsList();
      loadSectionCapacityDashboard();
      document.dispatchEvent(new CustomEvent("classcare:admin-refresh"));
    } catch (err) { Toast.error("Failed to remove section."); }
  }

  function showSettingsError(message) { const target = $("#settings-state"); if (target) { target.textContent = message || ""; target.className = message ? "field-error" : "field-error hidden"; } }
  async function saveSettings() {
    showSettingsError("");
    const mStart = String($("#set-morning-start")?.value || "07:30");
    const mLate = String($("#set-morning-late")?.value || "07:45");
    const mOutStart = String($("#set-morning-out-start")?.value || "11:30");
    const mOutEnd = String($("#set-morning-out-end")?.value || "12:00");

    const aStart = String($("#set-afternoon-start")?.value || "13:00");
    const aLate = String($("#set-afternoon-late")?.value || "13:15");
    const aOutStart = String($("#set-afternoon-out-start")?.value || "15:00");
    const aOutEnd = String($("#set-afternoon-out-end")?.value || "17:00");

    const capacity = Number($("#set-capacity")?.value);
    const academicYear = String($("#set-ay")?.value || "").trim();
    const term = Number($("#set-term")?.value);

    if (!/^\d{2}:\d{2}$/.test(mStart) || !/^\d{2}:\d{2}$/.test(mLate)) return showSettingsError("Enter valid 24-hour morning session times.");
    if (!/^\d{2}:\d{2}$/.test(aStart) || !/^\d{2}:\d{2}$/.test(aLate)) return showSettingsError("Enter valid 24-hour afternoon session times.");
    if (!Number.isFinite(capacity) || capacity < 1 || capacity > 100) return showSettingsError("Section capacity must be between 1 and 100.");
    if (!Number.isFinite(term) || term < 1 || term > 4) return showSettingsError("Term must be 1-4.");

    const button = $("#btn-save-settings");
    Utils.setLoading(button, true);
    try {
      const grace = Math.max(0, Utils.minutesBetween(mLate, mStart));
      const adminUid = getAdminUid();
      const payload = {
        morning_start: mStart,
        morning_late_cutoff: mLate,
        late_threshold_time: mLate,
        morning_out_start: mOutStart,
        morning_out_end: mOutEnd,
        afternoon_start: aStart,
        afternoon_late_cutoff: aLate,
        afternoon_out_start: aOutStart,
        afternoon_out_end: aOutEnd,
        school_start_time: mStart,
        late_grace_period: grace,
        section_capacity: capacity,
        academic_year: academicYear,
        current_school_term: term,
        updated_by: adminUid,
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (State?.settings?.enrollment_status) {
        payload.enrollment_status = State.settings.enrollment_status;
      }
      if (typeof State?.settings?.enrollment_open === "boolean") {
        payload.enrollment_open = State.settings.enrollment_open;
      }
      await ClassCare.DB.settings.set(payload, { merge: true });
      Object.assign(State.settings, payload);
      ClassCare.DB.SECTION_CAPACITY_LIMIT = capacity;

      await ClassCare.DB.logAudit(adminUid, "settings_update", payload);
      Toast.success("Master school attendance quotas and settings updated.");
    } catch (error) {
      console.error("[admin-settings] failed:", error);
      showSettingsError(error?.code === "permission-denied"
        ? "You do not have permission to update settings."
        : "Settings could not be saved. Check your connection and try again.");
    } finally {
      Utils.setLoading(button, false);
    }
  }
  async function lookupUser(email) { const card = $("#promote-card"); card?.classList.add("hidden"); promotedTarget = null; try { const query = await ClassCare.DB.users.where("email", "==", email).limit(1).get(); if (!query.empty) promotedTarget = { uid: query.docs[0].id, doc: { uid: query.docs[0].id, ...query.docs[0].data() } }; } catch (error) { console.warn("[admin-role] lookup failed:", error); } if (!promotedTarget) return Toast.warn("No ClassCare profile was found for that email."); const user = promotedTarget.doc; $("#promote-avatar").textContent = [user.first_name?.[0], user.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "U"; $("#promote-name").textContent = `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Unnamed user"; $("#promote-meta").textContent = `${user.role || "student"} · ${user.section || "no section"} · ${user.email || email}`; $("#promote-role").value = user.role || "student"; card?.classList.remove("hidden"); }
  function hidePromote() { $("#promote-card")?.classList.add("hidden"); promotedTarget = null; }
  async function promoteCurrent() { if (!promotedTarget) return; const role = $("#promote-role")?.value; if (!["student", "teacher", "admin"].includes(role)) return Toast.error("Choose a valid role."); const button = $("#btn-promote"); Utils.setLoading(button, true); const oldRole = promotedTarget.doc.role || "student"; const adminUid = getAdminUid(); try { await ClassCare.DB.users.doc(promotedTarget.uid).update({ role, role_updated_at: firebase.firestore.FieldValue.serverTimestamp(), role_updated_by: adminUid }); await ClassCare.DB.logAudit(adminUid, "role_change", { target_uid: promotedTarget.uid, target_name: $("#promote-name").textContent, old_role: oldRole, new_role: role }); Toast.success("User role updated."); hidePromote(); $("#promote-email").value = ""; document.dispatchEvent(new CustomEvent("classcare:admin-refresh")); } catch (error) { console.error("[admin-role] update failed:", error); Toast.error(error?.code === "permission-denied" ? "You do not have permission to update roles." : "Role update failed. Try again."); } finally { Utils.setLoading(button, false); } }
  ClassCare.onCurrentUser(user => { if (!user || user.role !== 'admin') { stopEnrollmentRequests?.(); stopEnrollmentRequests = null; } });
})();
