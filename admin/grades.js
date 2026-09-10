/* ============================================================
   admin/grades.js — School-Wide Grades Management (God Mode)
   Enables IT Administration to inspect, search, filter, and
   override student grades across all teachers, sections, and subjects.
   ============================================================ */
(function () {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  let State = null;
  let gradesMap = new Map();
  let unsubGrades = null;
  let activeOverrideGrade = null;
  let booted = false;

  const prevInit = window.AdminShared?.initFilters;
  window.AdminShared = window.AdminShared || {};
  window.AdminShared.initFilters = function (state) {
    prevInit?.(state);
    State = state;
    initGrades(state);
  };

  const DEPED_MIN = 60;
  const DEPED_MAX = 100;
  const DEPED_PASS = 75;

  function escapeHtml(value) {
    return ClassCareUI?.escapeHtml
      ? ClassCareUI.escapeHtml(value)
      : String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function computeAverage(t1, t2, t3, t4) {
    const nums = [t1, t2, t3, t4]
      .map(v => (v !== null && v !== "" && v !== undefined && !isNaN(Number(v))) ? Number(v) : null)
      .filter(v => v !== null);
    if (!nums.length) return null;
    const sum = nums.reduce((a, b) => a + b, 0);
    return Number((sum / nums.length).toFixed(1));
  }

  function depedDescriptor(grade) {
    if (typeof ClassCare?.DB?.getDepedGradeDescriptor === "function") {
      return ClassCare.DB.getDepedGradeDescriptor(grade);
    }
    const g = Number(grade);
    if (isNaN(g) || grade === null || grade === undefined || grade === "") {
      return { label: "No Grade", color: "muted" };
    }
    if (g >= 90) return { label: "Outstanding", color: "outstanding" };
    if (g >= 85) return { label: "Very Satisfactory", color: "very-satisfactory" };
    if (g >= 80) return { label: "Satisfactory", color: "satisfactory" };
    if (g >= 75) return { label: "Fairly Satisfactory", color: "fairly-satisfactory" };
    return { label: "Did Not Meet Expectations", color: "failed" };
  }

  function descriptorBadge(grade) {
    const d = depedDescriptor(grade);
    const tone = d.color === "outstanding" || d.color === "very-satisfactory" || d.color === "satisfactory"
      ? "status-present"
      : d.color === "fairly-satisfactory"
        ? "status-late"
        : d.color === "failed"
          ? "status-absent"
          : "not-recorded";
    const label = grade === null || isNaN(Number(grade)) ? d.label : `${d.label} (${Number(grade).toFixed(1)})`;
    return `<span class="status-badge ${tone}" style="white-space:nowrap;">${escapeHtml(label)}</span>`;
  }

  function gradePill(v) {
    if (v === null || v === undefined || v === "" || isNaN(Number(v))) {
      return '<span style="color:var(--text-muted);">—</span>';
    }
    const num = Number(v);
    const tone = num >= 75 ? "color:var(--c-present);font-weight:600;" : "color:var(--c-absent);font-weight:700;";
    return `<span style="${tone}">${num.toFixed(1)}</span>`;
  }

  function initGrades(state) {
    if (booted) {
      populateFilterControls();
      render();
      return;
    }
    booted = true;
    listenToAllGrades();
    bindEvents();
    populateFilterControls();
  }

  function listenToAllGrades() {
    if (unsubGrades) {
      try { unsubGrades(); } catch (_) {}
      unsubGrades = null;
    }
    try {
      unsubGrades = ClassCare.DB.grades.onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
          const docId = change.doc.id;
          if (change.type === "removed") {
            gradesMap.delete(docId);
          } else {
            gradesMap.set(docId, { id: docId, ...change.doc.data() });
          }
        });
        populateFilterControls();
        render();
      }, error => {
        console.warn("[admin-grades] listener failed:", error);
      });
    } catch (err) {
      console.warn("[admin-grades] realtime setup:", err);
    }
  }

  function populateFilterControls() {
    const secSelect = $("#admin-grades-sec-filter");
    const subSelect = $("#admin-grades-sub-filter");
    if (!secSelect || !subSelect) return;

    // Collect all sections
    const sections = new Set();
    if (State?.sections) State.sections.forEach(s => s && sections.add(s));
    if (State?.settings?.master_sections) State.settings.master_sections.forEach(s => s && sections.add(s));
    gradesMap.forEach(g => g.section && sections.add(g.section));

    const currentSec = secSelect.value;
    secSelect.innerHTML = '<option value="">All Sections</option>' +
      Array.from(sections).sort().map(s => `<option value="${escapeHtml(s).replace(/"/g, "&quot;")}">${escapeHtml(s)}</option>`).join("");
    if (currentSec && sections.has(currentSec)) secSelect.value = currentSec;

    // Collect all subjects
    const subjects = new Set([
      "Mathematics", "Science", "English", "Filipino",
      "Araling Panlipunan", "Edukasyon sa Pagpapakatao (ESP)",
      "MAPEH", "EPP / TLE"
    ]);
    gradesMap.forEach(g => g.subject && subjects.add(g.subject));

    const currentSub = subSelect.value;
    subSelect.innerHTML = '<option value="">All Subjects</option>' +
      Array.from(subjects).sort().map(s => `<option value="${escapeHtml(s).replace(/"/g, "&quot;")}">${escapeHtml(s)}</option>`).join("");
    if (currentSub && subjects.has(currentSub)) subSelect.value = currentSub;
  }

  function bindEvents() {
    $("#admin-grades-search")?.addEventListener("input", render);
    $("#admin-grades-sec-filter")?.addEventListener("change", render);
    $("#admin-grades-sub-filter")?.addEventListener("change", render);
    $("#admin-grades-status-filter")?.addEventListener("change", render);

    $("#admin-grades-clear-filter")?.addEventListener("click", () => {
      if ($("#admin-grades-search")) $("#admin-grades-search").value = "";
      if ($("#admin-grades-sec-filter")) $("#admin-grades-sec-filter").value = "";
      if ($("#admin-grades-sub-filter")) $("#admin-grades-sub-filter").value = "";
      if ($("#admin-grades-status-filter")) $("#admin-grades-status-filter").value = "";
      render();
    });

    $("#btn-export-admin-grades-csv")?.addEventListener("click", exportGradesCsv);

    wireOverrideModal();
  }

  function resolveGradeStudentName(g) {
    if (g.student_name && g.student_name !== "undefined" && g.student_name !== "null" && g.student_name !== "Student") {
      return g.student_name;
    }
    if (g.student_uid && State?.students?.has(g.student_uid)) {
      const s = State.students.get(g.student_uid);
      const name = `${s.first_name || ""} ${s.last_name || ""}`.trim() || s.student_id;
      if (name) {
        g.student_name = name;
        if (!g.student_id && s.student_id) g.student_id = s.student_id;
        return name;
      }
    }
    return (g.student_name && g.student_name !== "undefined" && g.student_name !== "null") ? g.student_name : "Student";
  }

  function getFilteredRows() {
    const search = String($("#admin-grades-search")?.value || "").trim().toLowerCase();
    const section = $("#admin-grades-sec-filter")?.value || "";
    const subject = $("#admin-grades-sub-filter")?.value || "";
    const status = $("#admin-grades-status-filter")?.value || "";

    const list = Array.from(gradesMap.values());

    return list.filter(g => {
      resolveGradeStudentName(g);
      if (section && String(g.section || "").toLowerCase() !== section.toLowerCase()) return false;
      if (subject && String(g.subject || "").toLowerCase() !== subject.toLowerCase()) return false;

      const avg = computeAverage(g.term1, g.term2, g.term3, g.term4);

      if (status === "passing" && (avg === null || avg < DEPED_PASS)) return false;
      if (status === "failing" && (avg === null || avg >= DEPED_PASS)) return false;
      if (status === "honors" && (avg === null || avg < 90)) return false;
      if (status === "overridden" && !g.overridden) return false;

      if (search) {
        const hay = `${g.student_name || ""} ${g.student_id || ""} ${g.teacher_name || ""} ${g.subject || ""} ${g.section || ""}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    }).sort((a, b) => {
      const secCmp = String(a.section || "").localeCompare(String(b.section || ""));
      if (secCmp !== 0) return secCmp;
      const subCmp = String(a.subject || "").localeCompare(String(b.subject || ""));
      if (subCmp !== 0) return subCmp;
      return String(a.student_name || "").localeCompare(String(b.student_name || ""));
    });
  }

  function render() {
    const tbody = $("#admin-grades-tbody");
    if (!tbody) return;

    const rows = getFilteredRows();
    updateSummaryStats(rows);

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="10">
        <div class="state-panel state-empty">
          <strong>No grade records match this filter.</strong>
          <span>Adjust your search keywords, section, or subject filter above.</span>
        </div>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(g => {
      const avg = computeAverage(g.term1, g.term2, g.term3, g.term4);
      const isOverridden = g.overridden === true;
      const resolvedName = resolveGradeStudentName(g);
      const cleanSid = g.student_id || (g.student_uid && State?.students?.get(g.student_uid)?.student_id) || "No ID";
      const initials = (resolvedName || "S").split(" ").map(n => n[0]).filter(Boolean).join("").toUpperCase().slice(0, 2) || "S";

      const remarksBadge = avg === null
        ? '<span style="color:var(--text-muted);">—</span>'
        : avg >= DEPED_PASS
          ? '<span class="status-badge status-present">Passed</span>'
          : '<span class="status-badge status-absent">Failed</span>';

      const overrideBadge = isOverridden
        ? `<span class="status-badge status-late" title="Overridden by ${escapeHtml(g.overridden_by_name || 'Admin')}${g.override_reason ? ': ' + escapeHtml(g.override_reason) : ''}" style="font-size:0.75rem;">Admin Override</span>`
        : "";

      return `<tr data-doc-id="${escapeHtml(g.id).replace(/"/g, "&quot;")}">
        <td>
          <div class="identity-cell">
            <span class="identity-avatar">${escapeHtml(initials)}</span>
            <span>
              <span class="identity-name" data-student-name-for="${escapeHtml(g.student_uid || g.id)}">${escapeHtml(resolvedName || "Student")}</span>
              <span class="identity-meta tabular" data-student-id-for="${escapeHtml(g.student_uid || g.id)}">${escapeHtml(cleanSid)}</span>
            </span>
          </div>
        </td>
        <td><strong>${escapeHtml(g.section || "—")}</strong></td>
        <td>${escapeHtml(g.subject || "—")}</td>
        <td><span class="identity-meta">${escapeHtml(g.teacher_name || "Assigned Teacher")}</span></td>
        <td class="tabular" style="text-align:center;">${gradePill(g.term1)}</td>
        <td class="tabular" style="text-align:center;">${gradePill(g.term2)}</td>
        <td class="tabular" style="text-align:center;">${gradePill(g.term3)}</td>
        <td class="tabular" style="text-align:center;">${gradePill(g.term4)}</td>
        <td class="tabular" style="text-align:center;font-weight:700;">${avg !== null ? avg.toFixed(1) : '<span style="color:var(--text-muted);">—</span>'}</td>
        <td style="text-align:center;">
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
            ${descriptorBadge(avg)}
            <div style="display:flex;gap:4px;align-items:center;">
              ${remarksBadge}
              ${overrideBadge}
            </div>
          </div>
        </td>
        <td class="align-right">
          <button type="button" class="btn btn-ghost btn-sm" data-admin-edit-grade="${escapeHtml(g.id).replace(/"/g, "&quot;")}" style="white-space:nowrap;">
            <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            Override
          </button>
        </td>
      </tr>`;
    }).join("");

    tbody.querySelectorAll("[data-admin-edit-grade]").forEach(btn => {
      btn.addEventListener("click", () => {
        const docId = btn.dataset.adminEditGrade;
        const gradeDoc = gradesMap.get(docId);
        if (gradeDoc) openOverrideModal(gradeDoc);
      });
    });

    // Asynchronously resolve any still-missing student profiles from DB and self-heal
    rows.forEach(g => {
      if (g.student_uid && (!g.student_name || g.student_name === "Student" || g.student_name === "undefined" || g.student_name === "null")) {
        if (typeof ClassCare?.DB?.resolveStudentProfile === "function") {
          ClassCare.DB.resolveStudentProfile(g.student_uid).then(prof => {
            if (prof?.student_name && prof.student_name !== "Student" && prof.student_name !== "undefined") {
              g.student_name = prof.student_name;
              if (prof.student_id) g.student_id = prof.student_id;
              const nameEl = tbody.querySelector(`[data-student-name-for="${g.student_uid || g.id}"]`);
              if (nameEl) nameEl.textContent = prof.student_name;
              const sidEl = tbody.querySelector(`[data-student-id-for="${g.student_uid || g.id}"]`);
              if (sidEl && (sidEl.textContent === "No ID" || !sidEl.textContent.trim())) {
                sidEl.textContent = prof.student_id;
              }
              // Also self-heal the Firestore record so future reads have the correct name
              if (g.id) {
                ClassCare.DB.grades.doc(g.id).update({
                  student_name: prof.student_name,
                  student_id: prof.student_id || ""
                }).catch(() => {});
              }
            }
          }).catch(() => {});
        }
      }
    });
  }

  function updateSummaryStats(rows) {
    const totalEl = $("#admin-grades-stat-total");
    const passEl = $("#admin-grades-stat-pass");
    const honorsEl = $("#admin-grades-stat-honors");
    const needEl = $("#admin-grades-stat-needs");

    if (!totalEl) return;

    let passCount = 0;
    let honorsCount = 0;
    let failCount = 0;

    rows.forEach(g => {
      const avg = computeAverage(g.term1, g.term2, g.term3, g.term4);
      if (avg !== null) {
        if (avg >= 90) honorsCount++;
        if (avg >= DEPED_PASS) passCount++;
        else failCount++;
      }
    });

    const evaluated = passCount + failCount;
    const passRate = evaluated > 0 ? Math.round((passCount / evaluated) * 100) : 0;

    totalEl.textContent = String(rows.length);
    if (passEl) passEl.textContent = evaluated > 0 ? `${passRate}% (${passCount})` : "—";
    if (honorsEl) honorsEl.textContent = String(honorsCount);
    if (needEl) needEl.textContent = String(failCount);
  }

  function openOverrideModal(gradeDoc) {
    const resolvedName = resolveGradeStudentName(gradeDoc);
    gradeDoc.student_name = resolvedName;
    if (!gradeDoc.student_id && gradeDoc.student_uid && State?.students?.has(gradeDoc.student_uid)) {
      gradeDoc.student_id = State.students.get(gradeDoc.student_uid).student_id || "";
    }
    activeOverrideGrade = gradeDoc;
    const modal = $("#admin-grade-override-modal");
    if (!modal) return;

    $("#modal-ov-student-name").textContent = resolvedName || "Student";
    $("#modal-ov-student-meta").textContent = `ID: ${gradeDoc.student_id || "—"} · Section: ${gradeDoc.section || "—"} · Subject: ${gradeDoc.subject || "—"}`;
    $("#modal-ov-teacher").textContent = gradeDoc.teacher_name || "Teacher";

    const t1Input = $("#modal-ov-t1");
    const t2Input = $("#modal-ov-t2");
    const t3Input = $("#modal-ov-t3");
    const t4Input = $("#modal-ov-t4");
    const reasonInput = $("#modal-ov-reason");

    if (t1Input) t1Input.value = gradeDoc.term1 ?? "";
    if (t2Input) t2Input.value = gradeDoc.term2 ?? "";
    if (t3Input) t3Input.value = gradeDoc.term3 ?? "";
    if (t4Input) t4Input.value = gradeDoc.term4 ?? "";
    if (reasonInput) reasonInput.value = gradeDoc.override_reason || "";

    recalcModalPreview();

    modal.classList.remove("hidden");
    modal.classList.add("flex");
    t1Input?.focus();
  }

  function closeOverrideModal() {
    const modal = $("#admin-grade-override-modal");
    modal?.classList.add("hidden");
    modal?.classList.remove("flex");
    activeOverrideGrade = null;
  }

  function recalcModalPreview() {
    const t1 = $("#modal-ov-t1")?.value;
    const t2 = $("#modal-ov-t2")?.value;
    const t3 = $("#modal-ov-t3")?.value;
    const t4 = $("#modal-ov-t4")?.value;

    const avg = computeAverage(t1, t2, t3, t4);
    const prevAvgEl = $("#modal-ov-preview-avg");
    const prevDescEl = $("#modal-ov-preview-desc");

    if (prevAvgEl) {
      prevAvgEl.textContent = avg !== null ? `${avg.toFixed(1)} / 100` : "No Grades Entered";
    }
    if (prevDescEl) {
      prevDescEl.innerHTML = descriptorBadge(avg);
    }
  }

  function wireOverrideModal() {
    document.querySelectorAll("[data-close-admin-ov-modal]").forEach(el => {
      el.addEventListener("click", closeOverrideModal);
    });

    ["#modal-ov-t1", "#modal-ov-t2", "#modal-ov-t3", "#modal-ov-t4"].forEach(sel => {
      $(sel)?.addEventListener("input", recalcModalPreview);
    });

    $("#form-admin-grade-override")?.addEventListener("submit", async event => {
      event.preventDefault();
      const admin = State?.admin || State?.currentUser || { uid: ClassCare.getFirebase()?.auth?.currentUser?.uid || "admin" };
      if (!activeOverrideGrade || !admin?.uid) return;

      const parseTerm = val => {
        val = String(val || "").trim();
        if (!val) return null;
        const n = Number(val);
        if (isNaN(n) || n < DEPED_MIN || n > DEPED_MAX) {
          throw new Error(`Grades must be between ${DEPED_MIN} and ${DEPED_MAX}.`);
        }
        return Number(n.toFixed(1));
      };

      let t1, t2, t3, t4;
      try {
        t1 = parseTerm($("#modal-ov-t1")?.value);
        t2 = parseTerm($("#modal-ov-t2")?.value);
        t3 = parseTerm($("#modal-ov-t3")?.value);
        t4 = parseTerm($("#modal-ov-t4")?.value);
      } catch (err) {
        return Toast.error(err.message);
      }

      const reason = String($("#modal-ov-reason")?.value || "").trim() || "Administrative grade correction";
      const avg = computeAverage(t1, t2, t3, t4);
      const saveBtn = $("#btn-save-admin-grade-ov");

      Utils.setLoading(saveBtn, true);
      try {
        const cleanSubId = activeOverrideGrade.subject_id || String(activeOverrideGrade.subject || "").replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
        const cleanSecId = activeOverrideGrade.section_id || String(activeOverrideGrade.section || "").replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
        const teacherId = activeOverrideGrade.teacher_id || activeOverrideGrade.teacher_uid || "";

        const payload = {
          student_name: activeOverrideGrade.student_name,
          student_id: activeOverrideGrade.student_id || "",
          teacher_id: teacherId,
          section_id: cleanSecId,
          subject_id: cleanSubId,
          term1: t1,
          term2: t2,
          term3: t3,
          term4: t4,
          final_grade: avg,
          term_average: avg,
          deped_grade: avg,
          overridden: true,
          overridden_by: admin.uid,
          overridden_by_name: `${admin.first_name || ""} ${admin.last_name || ""}`.trim() || admin.email || "IT Admin",
          overridden_at: firebase.firestore.FieldValue.serverTimestamp(),
          override_reason: reason,
          updated_at: firebase.firestore.FieldValue.serverTimestamp()
        };

        await ClassCare.DB.grades.doc(activeOverrideGrade.id).set(payload, { merge: true });

        await ClassCare.DB.logAudit(admin.uid, "admin_grade_override", {
          doc_id: activeOverrideGrade.id,
          student_name: activeOverrideGrade.student_name,
          student_id: activeOverrideGrade.student_id,
          subject: activeOverrideGrade.subject,
          section: activeOverrideGrade.section,
          new_average: avg,
          reason: reason
        });

        // Update local map
        gradesMap.set(activeOverrideGrade.id, { ...activeOverrideGrade, ...payload });

        closeOverrideModal();
        render();
        Toast.success(`Grade override saved for ${activeOverrideGrade.student_name}.`);
      } catch (err) {
        console.error("[admin-grade-override] error:", err);
        Toast.error(err?.code === "permission-denied" ? "Permission denied to override grade." : "Failed to save override.");
      } finally {
        Utils.setLoading(saveBtn, false);
      }
    });
  }

  function exportGradesCsv() {
    const rows = getFilteredRows();
    if (!rows.length) return Toast.warn("No grade records to export.");

    const headers = [
      "Student ID",
      "Student Name",
      "Section",
      "Subject",
      "Teacher",
      "1st Quarter",
      "2nd Quarter",
      "3rd Quarter",
      "4th Quarter",
      "Final Average",
      "DepEd Descriptor",
      "Remarks",
      "Overridden By Admin",
      "Override Reason"
    ];

    const escapeCsv = val => `"${String(val ?? "").replace(/"/g, '""')}"`;

    const lines = [headers.map(escapeCsv).join(",")];

    rows.forEach(g => {
      const avg = computeAverage(g.term1, g.term2, g.term3, g.term4);
      const desc = depedDescriptor(avg).label;
      const remarks = avg === null ? "No Grade" : avg >= DEPED_PASS ? "Passed" : "Failed";

      lines.push([
        escapeCsv(g.student_id || ""),
        escapeCsv(g.student_name || ""),
        escapeCsv(g.section || ""),
        escapeCsv(g.subject || ""),
        escapeCsv(g.teacher_name || ""),
        escapeCsv(g.term1 ?? ""),
        escapeCsv(g.term2 ?? ""),
        escapeCsv(g.term3 ?? ""),
        escapeCsv(g.term4 ?? ""),
        escapeCsv(avg !== null ? avg.toFixed(1) : ""),
        escapeCsv(desc),
        escapeCsv(remarks),
        escapeCsv(g.overridden ? "YES" : "NO"),
        escapeCsv(g.override_reason || "")
      ].join(","));
    });

    const csvBlob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(csvBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ClassCare_School_Grades_${Utils.todayIso()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    Toast.success("Grades exported to CSV.");
  }

  window.AdminGrades = {
    init: initGrades,
    render,
    exportCsv: exportGradesCsv
  };
})();
