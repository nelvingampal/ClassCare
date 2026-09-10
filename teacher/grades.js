/* ============================================================
   teacher/grades.js — Teacher grading system for term grades
   DepEd Standard: 60-100 range, Written(30%)/Performance(50%)/
   Quarterly(20%) weighted, with standard grade descriptors.
   ============================================================ */
(function () {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  let State = {
    teacher: null,
    gradesMap: new Map(),
    sectionStudentsMap: new Map(),
    unsubscribe: null,
    unsubscribeSubjects: null,
    selectedSection: "",
    selectedSubject: "",
    teacherSavedSubjects: []
  };

  function escapeHtml(str) { return ClassCareUI.escapeHtml(str); }
  function escapeAttr(str) { return escapeHtml(str).replace(/"/g, "&quot;"); }

  function getTeacherSections() {
    const t = State.teacher;
    const list = [];
    if (Array.isArray(t?.teaching_assignments) && t.teaching_assignments.length) {
      t.teaching_assignments.forEach(a => {
        const v = String(a.section || "").trim();
        if (v && !list.includes(v)) list.push(v);
      });
    }
    if (Array.isArray(t?.assigned_sections) && t.assigned_sections.length) {
      t.assigned_sections.forEach(s => {
        const v = String(s || "").trim();
        if (v && !list.includes(v)) list.push(v);
      });
    }
    if (t?.section) {
      const v = String(t.section || "").trim();
      if (v && !list.includes(v)) list.push(v);
    }
    // Also include sections from enrolled list if teacher has none explicitly assigned
    if (!list.length && window.TeacherEnrollment?.getEnrolledList) {
      const allEnrolled = window.TeacherEnrollment.getEnrolledList();
      allEnrolled.forEach(e => {
        const sec = String(e.section || "").trim();
        if (sec && !list.includes(sec)) list.push(sec);
      });
    }
    // Also check window.TeacherScannerState?.sections
    if (window.TeacherScannerState?.sections) {
      const secSet = window.TeacherScannerState.sections;
      const arr = secSet instanceof Set ? Array.from(secSet) : (Array.isArray(secSet) ? secSet : []);
      arr.forEach(sec => {
        const v = String(sec || "").trim();
        if (v && !list.includes(v)) list.push(v);
      });
    }
    return list;
  }

  function getTeacherSubjects() {
    const t = State.teacher;
    const list = [];
    if (Array.isArray(t?.teaching_assignments) && t.teaching_assignments.length) {
      const currentSection = State.selectedSection;
      t.teaching_assignments.forEach(a => {
        if (!currentSection || String(a.section || "").toLowerCase() === currentSection.toLowerCase()) {
          const s = String(a.subject || "").trim();
          if (s && !list.includes(s)) list.push(s);
        }
      });
    }
    if (Array.isArray(State.teacherSavedSubjects) && State.teacherSavedSubjects.length) {
      State.teacherSavedSubjects.forEach(s => {
        if (!list.includes(s)) list.push(s);
      });
    }
    if (!list.length && t?.subject) {
      t.subject.split(/[,;&]+/).map(s => s.trim()).filter(Boolean).forEach(s => {
        if (!list.includes(s)) list.push(s);
      });
    }
    return list.length ? list : ["General Subject"];
  }

  const DEPED_MIN = 60, DEPED_MAX = 100, DEPED_PASS = 75;

  function clampGrade(v) {
    const n = Number(v);
    if (v === "" || v === null || isNaN(n)) return null;
    if (n < DEPED_MIN) return DEPED_MIN;
    if (n > DEPED_MAX) return DEPED_MAX;
    return Number(n.toFixed(1));
  }

  function validateGrade(v) {
    if (v === "" || v === null || v === undefined) return { ok: true, value: null };
    const n = Number(v);
    if (isNaN(n)) return { ok: false, message: "Grade must be a number." };
    if (n < DEPED_MIN) return { ok: false, message: `Grade cannot be below ${DEPED_MIN}.` };
    if (n > DEPED_MAX) return { ok: false, message: `Grade cannot be above ${DEPED_MAX}.` };
    return { ok: true, value: Number(n.toFixed(1)) };
  }

  function depedDescriptor(grade) {
    if (typeof ClassCare?.DB?.getDepedGradeDescriptor === "function") {
      return ClassCare.DB.getDepedGradeDescriptor(grade);
    }
    const g = Number(grade);
    if (isNaN(g)) return { label: "No Grade", color: "muted" };
    if (g >= 90) return { label: "Outstanding", color: "outstanding" };
    if (g >= 85) return { label: "Very Satisfactory", color: "very-satisfactory" };
    if (g >= 80) return { label: "Satisfactory", color: "satisfactory" };
    if (g >= 75) return { label: "Fairly Satisfactory", color: "fairly-satisfactory" };
    return { label: "Did Not Meet Expectations", color: "failed" };
  }

  function weightedDeped(w, p, q) {
    if (typeof ClassCare?.DB?.depedWeightedAverage === "function") {
      return ClassCare.DB.depedWeightedAverage(w, p, q);
    }
    const vals = [w, p, q].map(v => (v === "" || v === null || isNaN(Number(v))) ? null : Number(v)).filter(v => v !== null);
    if (!vals.length) return null;
    return Number((((Number(w)||0) * 0.30) + ((Number(p)||0) * 0.50) + ((Number(q)||0) * 0.20)).toFixed(1));
  }

  function descriptorBadge(g) {
    const d = depedDescriptor(g);
    const tone = d.color === "outstanding" ? "status-present"
      : d.color === "very-satisfactory" ? "status-present"
      : d.color === "satisfactory" ? "status-present"
      : d.color === "fairly-satisfactory" ? "status-late"
      : d.color === "failed" ? "status-absent" : "not-recorded";
    const label = g === null || isNaN(Number(g)) ? d.label : `${d.label} (${Number(g).toFixed(1)})`;
    return `<span class="status-badge ${tone}" style="white-space:nowrap;">${escapeHtml(label)}</span>`;
  }

  function initGrades(teacher) {
    State.teacher = teacher;
    populateSavedSubjects();
    populateGradeControls();
    if (State.selectedSection) {
      fetchSectionStudents(State.selectedSection);
    }
    listenToTeacherGrades();
    bindEvents();
    renderSubjectManager();
    renderGradesTable();
  }

  function populateSavedSubjects() {
    const teacher = State.teacher;
    if (!teacher?.uid) return;
    if (State.unsubscribeSubjects) { try { State.unsubscribeSubjects(); } catch (_) {} State.unsubscribeSubjects = null; }
    try {
      State.unsubscribeSubjects = ClassCare.DB.teacher_subjects.doc(teacher.uid)
        .onSnapshot(snap => {
          const data = snap.exists ? snap.data() : null;
          State.teacherSavedSubjects = Array.isArray(data?.subjects) ? data.subjects : [];
          populateGradeControls();
          renderSubjectManager();
          renderGradesTable();
        }, err => console.warn("[grades] teacher_subjects listener:", err));
    } catch (e) { console.warn(e); }
  }

  function populateGradeControls() {
    const secSelect = $("#grades-section-select");
    const subSelect = $("#grades-subject-select");
    const sections = getTeacherSections();
    const subjects = getTeacherSubjects();

    if (secSelect) {
      secSelect.innerHTML = sections.length
        ? sections.map(sec => `<option value="${escapeAttr(sec)}">${escapeHtml(sec)}</option>`).join("")
        : '<option value="">No assigned sections</option>';
      if (!State.selectedSection || !sections.includes(State.selectedSection)) {
        State.selectedSection = secSelect.value || "";
        if (State.selectedSection) fetchSectionStudents(State.selectedSection);
      } else {
        secSelect.value = State.selectedSection;
      }
    }

    if (subSelect) {
      subSelect.innerHTML = subjects.length
        ? subjects.map(sub => `<option value="${escapeAttr(sub)}">${escapeHtml(sub)}</option>`).join("")
        : '<option value="General">General</option>';
      if (!State.selectedSubject || !subjects.includes(State.selectedSubject)) State.selectedSubject = subSelect.value || "";
      else subSelect.value = State.selectedSubject;
    }
  }

  function bindEvents() {
    $("#grades-section-select")?.addEventListener("change", event => {
      State.selectedSection = event.target.value;
      populateGradeControls();
      if (State.selectedSection) {
        fetchSectionStudents(State.selectedSection);
      }
      listenToTeacherGrades();
      renderGradesTable();
    });
    $("#grades-subject-select")?.addEventListener("change", event => {
      State.selectedSubject = event.target.value; renderGradesTable();
    });
    $("#btn-save-all-grades")?.addEventListener("click", saveAllGrades);
    // NEW: Wire export grades to Excel & CSV
    $("#btn-export-grades-excel")?.addEventListener("click", exportGradesExcel);
    $("#btn-export-grades-csv")?.addEventListener("click", exportGradesCsv);
    $("#btn-save-teacher-subjects")?.addEventListener("click", saveTeacherSubjects);
    $("#btn-add-teacher-subject")?.addEventListener("click", () => {
      const input = $("#teacher-subject-new-input");
      const val = Utils.sanitizeText(input?.value, { max: 60 }).trim();
      if (!val) return Toast.warn("Enter a subject name first.");
      const list = $("#teacher-subject-list");
      if (!list) return;
      const curr = Array.from(list.querySelectorAll("[data-subject-chip]")).map(el => el.dataset.subjectChip);
      if (curr.includes(val)) { Toast.warn("That subject is already listed."); return; }
      curr.push(val); input.value = "";
      renderSubjectChipList(curr);
    });
    window.addEventListener("classcare:enrollment-updated", () => renderGradesTable());
    window.addEventListener("classcare:assignments-updated", event => {
      if (event.detail?.teacher) State.teacher = event.detail.teacher;
      populateGradeControls();
      renderGradesTable();
    });
  }

  function renderSubjectManager() {
    const wrap = $("#teacher-subject-manager");
    if (!wrap) return;
    const current = Array.isArray(State.teacherSavedSubjects) && State.teacherSavedSubjects.length
      ? State.teacherSavedSubjects.slice()
      : State.teacher?.subject ? State.teacher.subject.split(/[,;&]+/).map(s => s.trim()).filter(Boolean) : [];
    wrap.innerHTML = `<div class="card-header"><div><h3 class="card-title" style="font-size:1rem;margin:0;">My Subjects (DepEd)</h3><p class="card-subtitle" style="margin:0;">Add or remove the subjects you teach. Saved subjects appear in the dropdown and sync to your students as blank grade entries.</p></div></div>
      <div class="card-body">
        <div id="teacher-subject-list" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;min-height:32px;"></div>
        <div class="field-row cols-3" style="gap:8px;margin-bottom:10px;">
          <input id="teacher-subject-new-input" class="field" maxlength="60" placeholder="e.g. Mathematics, EPP, GMRC, Filipino, English, Science" />
          <button type="button" id="btn-add-teacher-subject" class="btn btn-secondary">Add subject</button>
          <button type="button" id="btn-save-teacher-subjects" class="btn btn-primary">Save subjects</button>
        </div>
        <p class="form-note" style="margin:0;">DepEd grades range: 60 (lowest) – 100 (highest). Passing grade is 75.</p>
      </div>`;
    renderSubjectChipList(current);
    // Rebind buttons because innerHTML replaced them
    $("#btn-add-teacher-subject")?.addEventListener("click", () => {
      const input = $("#teacher-subject-new-input");
      const val = Utils.sanitizeText(input?.value, { max: 60 }).trim();
      if (!val) return Toast.warn("Enter a subject name first.");
      const list = $("#teacher-subject-list");
      if (!list) return;
      const curr = Array.from(list.querySelectorAll("[data-subject-chip]")).map(el => el.dataset.subjectChip);
      if (curr.includes(val)) { Toast.warn("That subject is already listed."); return; }
      curr.push(val); input.value = ""; renderSubjectChipList(curr);
    });
    $("#btn-save-teacher-subjects")?.addEventListener("click", saveTeacherSubjects);
  }

  function renderSubjectChipList(list) {
    const container = $("#teacher-subject-list");
    if (!container) return;
    if (!list.length) { container.innerHTML = '<span class="field-help">No subjects added yet. Add at least one subject to enable grading.</span>'; return; }
    container.innerHTML = list.map(s => `<span class="subject-chip" data-subject-chip="${escapeAttr(s)}" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:var(--panel-muted);border:1px solid var(--border-subtle);font-size:0.85rem;">${escapeHtml(s)}<button type="button" data-remove-subject="${escapeAttr(s)}" aria-label="Remove subject" class="btn btn-ghost btn-icon-sm" style="padding:0;width:18px;height:18px;"><svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></span>`).join("");
    container.querySelectorAll("[data-remove-subject]").forEach(btn => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.removeSubject;
        const curr = Array.from(container.querySelectorAll("[data-subject-chip]")).map(el => el.dataset.subjectChip).filter(s => s !== target);
        renderSubjectChipList(curr);
      });
    });
  }

  async function saveTeacherSubjects() {
    const teacher = State.teacher;
    if (!teacher?.uid) return;
    const container = $("#teacher-subject-list");
    const subjects = Array.from(container?.querySelectorAll("[data-subject-chip]") || []).map(el => el.dataset.subjectChip).filter(Boolean);
    if (!subjects.length) return Toast.warn("Add at least one subject before saving.");
    const btn = $("#btn-save-teacher-subjects");
    Utils.setLoading(btn, true);
    try {
      await ClassCare.DB.teacher_subjects.doc(teacher.uid).set({
        teacher_uid: teacher.uid,
        teacher_name: `${teacher.first_name || ""} ${teacher.last_name || ""}`.trim() || teacher.email,
        sections: getTeacherSections(),
        subjects: subjects,
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      // Also sync back to teacher user.subject for other modules
      try { await ClassCare.DB.users.doc(teacher.uid).set({ subject: subjects.join(", ") }, { merge: true }); } catch (_) {}

      // Now ensure every enrolled student has blank grade docs for the new subjects
      await ensureBlankGradeDocsForSubjects(subjects);
      Toast.success(`Saved ${subjects.length} subject${subjects.length !== 1 ? "s" : ""}. Student grade entries are now visible.`);
    } catch (err) {
      console.error("[grades] save subjects:", err);
      Toast.error(err?.code === "permission-denied" ? "Permission denied." : "Failed to save subjects.");
    } finally { Utils.setLoading(btn, false); }
  }

  async function ensureBlankGradeDocsForSubjects(subjects) {
    const teacher = State.teacher;
    if (!teacher?.uid) return;
    const sections = getTeacherSections();
    const allEnrolled = window.TeacherEnrollment?.getEnrolledList() || [];
    const studentMap = new Map();

    allEnrolled.forEach(e => {
      if (e.teacher_uid && e.teacher_uid !== teacher.uid) return;
      if (sections.length && !sections.includes(e.section)) return;
      if (!e.student_uid) return;
      if (!studentMap.has(e.student_uid)) {
        studentMap.set(e.student_uid, {
          student_uid: e.student_uid,
          section: e.section,
          student_name: (e.student_name && e.student_name !== "undefined" && e.student_name !== "null") ? e.student_name : "",
          student_id: e.student_id || "",
          photo_data: e.photo_data || ""
        });
      }
    });

    if (!studentMap.size && window.TeacherScannerState?.students?.size && sections.length) {
      window.TeacherScannerState.students.forEach(s => {
        if (s.role === "student" && s.section && sections.includes(s.section)) {
          studentMap.set(s.uid, {
            student_uid: s.uid,
            section: s.section,
            student_name: `${s.first_name || ""} ${s.last_name || ""}`.trim() || s.student_id || "Student",
            student_id: s.student_id || "",
            photo_data: s.photo_data || ""
          });
        }
      });
    }

    for (const [uid, info] of studentMap.entries()) {
      let resolved = info;
      if (typeof ClassCare?.DB?.resolveStudentProfile === "function") {
        try {
          resolved = await ClassCare.DB.resolveStudentProfile(uid, info);
        } catch (_) {}
      }

      const cleanName = (resolved?.student_name && resolved.student_name !== "undefined" && resolved.student_name !== "null")
        ? resolved.student_name
        : "Student";
      const cleanSid = resolved?.student_id || "";
      const cleanPhoto = resolved?.photo_data || "";
      const sec = info.section;

      for (const subject of subjects) {
        const docId = ClassCare.DB.gradeDocId(uid, sec, subject);
        const cleanSubId = String(subject || "").replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
        const cleanSecId = String(sec || "").replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
        try {
          const snap = await ClassCare.DB.grades.doc(docId).get();
          if (!snap.exists) {
            await ClassCare.DB.grades.doc(docId).set({
              student_uid: uid,
              student_id: cleanSid,
              student_name: cleanName,
              photo_data: cleanPhoto,
              teacher_uid: teacher.uid,
              teacher_id: teacher.uid,
              teacher_name: `${teacher.first_name || ""} ${teacher.last_name || ""}`.trim() || teacher.email,
              section: sec,
              section_id: cleanSecId,
              subject: subject,
              subject_id: cleanSubId,
              term1: null, term2: null, term3: null, term4: null,
              written_work: null, performance_task: null, quarterly_assessment: null, deped_grade: null,
              updated_at: firebase.firestore.FieldValue.serverTimestamp()
            });
          } else {
            // Self-heal: if student_name is missing or corrupted, or relational keys missing
            const existing = snap.data() || {};
            const patch = {};
            if (!existing.teacher_id) patch.teacher_id = teacher.uid;
            if (!existing.section_id) patch.section_id = cleanSecId;
            if (!existing.subject_id) patch.subject_id = cleanSubId;
            if (!existing.student_name || existing.student_name === "undefined" || existing.student_name === "null" || existing.student_name === "Student") {
              if (cleanName && cleanName !== "Student") {
                patch.student_name = cleanName;
                patch.student_id = cleanSid || existing.student_id || "";
              }
            }
            if (Object.keys(patch).length) {
              await ClassCare.DB.grades.doc(docId).update(patch);
            }
          }
        } catch (_) { /* ignore */ }
      }
    }
  }

  let _unsubSectionGrades = null;

  async function fetchSectionStudents(section) {
    if (!section) return;
    try {
      // Avoid composite index query (section + role) which causes Firestore index error
      const userSnap = await ClassCare.DB.users
        .where("section", "==", section)
        .get();
      userSnap.forEach(doc => {
        const data = doc.data() || {};
        if (data.role && data.role !== "student") return;
        State.sectionStudentsMap.set(doc.id, {
          student_uid: doc.id,
          student_id: data.student_id || "",
          student_name: `${data.first_name || ""} ${data.last_name || ""}`.trim() || data.email || "Student",
          section: section,
          photo_data: data.photo_data || ""
        });
      });

      // Also query enrollments collection for this section to catch enrolled students
      try {
        const enrollSnap = await ClassCare.DB.enrollments
          .where("section", "==", section)
          .get();
        enrollSnap.forEach(doc => {
          const data = doc.data() || {};
          const uid = data.student_uid || doc.id;
          if (!State.sectionStudentsMap.has(uid)) {
            State.sectionStudentsMap.set(uid, {
              student_uid: uid,
              student_id: data.student_id || "",
              student_name: data.student_name || "Student",
              section: section,
              photo_data: data.photo_data || ""
            });
          }
        });
      } catch (enrollErr) {
        console.warn("[grades] enrollments fetch:", enrollErr);
      }

      // Auto-ensure blank grade docs exist for all students in this section for the active subjects
      const subjects = getTeacherSubjects();
      if (subjects.length) {
        await ensureBlankGradeDocsForSubjects(subjects);
      }

      renderGradesTable();
    } catch (err) {
      console.warn("[grades] fetchSectionStudents notice:", err);
    }
  }

  function listenToTeacherGrades() {
    if (State.unsubscribe) { State.unsubscribe(); State.unsubscribe = null; }
    if (_unsubSectionGrades) { _unsubSectionGrades(); _unsubSectionGrades = null; }
    const teacher = State.teacher;
    if (!teacher?.uid) return;

    try {
      State.unsubscribe = ClassCare.DB.grades
        .where("teacher_uid", "==", teacher.uid)
        .onSnapshot(snapshot => {
          snapshot.forEach(doc => {
            State.gradesMap.set(doc.id, { id: doc.id, ...doc.data() });
          });
          renderGradesTable();
        }, err => console.warn("[grades] teacher grades listener failed:", err));

      if (State.selectedSection) {
        _unsubSectionGrades = ClassCare.DB.grades
          .where("section", "==", State.selectedSection)
          .onSnapshot(snapshot => {
            snapshot.forEach(doc => {
              State.gradesMap.set(doc.id, { id: doc.id, ...doc.data() });
            });
            renderGradesTable();
          }, err => console.warn("[grades] section grades listener notice:", err));
      }
    } catch (err) { console.warn("[grades] setup:", err); }
  }

  function getEnrolledForCurrentSelection() {
    const section = State.selectedSection;
    const subject = State.selectedSubject;
    const studentMap = new Map();

    // 1. From TeacherEnrollment module
    const allEnrolled = window.TeacherEnrollment?.getEnrolledList() || [];
    allEnrolled.forEach(item => {
      if (section && String(item.section || "").trim().toLowerCase() !== section.trim().toLowerCase()) return;
      if (subject && String(item.subject || "").trim().toLowerCase() !== subject.trim().toLowerCase()) return;
      if (item.student_uid) {
        studentMap.set(item.student_uid, {
          student_uid: item.student_uid,
          student_id: item.student_id || "",
          student_name: item.student_name || "Student",
          section: section,
          subject: subject || item.subject || "General",
          photo_data: item.photo_data || ""
        });
      }
    });

    // 2. From sectionStudentsMap (queried directly from users collection)
    if (section) {
      State.sectionStudentsMap.forEach((st, uid) => {
        if (st.section && String(st.section).trim().toLowerCase() === section.trim().toLowerCase()) {
          if (!studentMap.has(uid)) {
            studentMap.set(uid, {
              student_uid: uid,
              student_id: st.student_id || "",
              student_name: st.student_name || "Student",
              section: section,
              subject: subject || "General",
              photo_data: st.photo_data || ""
            });
          }
        }
      });
    }

    // 3. From TeacherScannerState
    if (window.TeacherScannerState?.students?.size && section) {
      window.TeacherScannerState.students.forEach(s => {
        if (s.role === "student" && String(s.section || "").toLowerCase() === section.toLowerCase()) {
          if (!studentMap.has(s.uid)) {
            studentMap.set(s.uid, {
              student_uid: s.uid,
              student_id: s.student_id || "",
              student_name: `${s.first_name || ""} ${s.last_name || ""}`.trim() || "Student",
              section: section,
              subject: subject || "General",
              photo_data: s.photo_data || ""
            });
          }
        }
      });
    }

    // 4. From existing grade records for this section
    State.gradesMap.forEach(g => {
      if (g.student_uid && !studentMap.has(g.student_uid)) {
        if (section && String(g.section || "").trim().toLowerCase() === section.trim().toLowerCase()) {
          if (!subject || String(g.subject || "").trim().toLowerCase() === subject.trim().toLowerCase()) {
            studentMap.set(g.student_uid, {
              student_uid: g.student_uid,
              student_id: g.student_id || "",
              student_name: g.student_name || "Student",
              section: section,
              subject: subject || g.subject || "General",
              photo_data: g.photo_data || ""
            });
          }
        }
      }
    });

    const result = Array.from(studentMap.values());

    // Resolve any remaining missing names from profiles
    result.forEach(item => {
      if (!item.student_name || item.student_name === "undefined" || item.student_name === "null" || item.student_name === "Student") {
        if (window.TeacherScannerState?.students?.has(item.student_uid)) {
          const s = window.TeacherScannerState.students.get(item.student_uid);
          const fullName = `${s.first_name || ""} ${s.last_name || ""}`.trim();
          if (fullName) item.student_name = fullName;
          if (!item.student_id && s.student_id) item.student_id = s.student_id;
          if (!item.photo_data && s.photo_data) item.photo_data = s.photo_data;
        }
      }
    });

    return result;
  }

  function computeAverage(t1, t2, t3, t4) {
    const nums = [t1, t2, t3, t4].map(v => v !== null && v !== "" && !isNaN(Number(v)) ? Number(v) : null).filter(v => v !== null);
    if (!nums.length) return null;
    const sum = nums.reduce((a, b) => a + b, 0);
    return Number((sum / nums.length).toFixed(1));
  }

  function renderGradesTable() {
    const tbody = $("#grades-tbody");
    if (!tbody) return;
    const students = getEnrolledForCurrentSelection();
    const section = State.selectedSection;
    const subject = State.selectedSubject;

    const countBadge = $("#grades-count-badge");
    if (countBadge) countBadge.textContent = `${students.length} Students`;

    if (!students.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="state-panel state-empty"><strong>No students found for ${escapeHtml(section || "this section")} (${escapeHtml(subject || "All")}).</strong><span>Enroll students first, or make sure you have saved your subject list in the My Subjects panel above.</span></div></td></tr>`;
      return;
    }

    tbody.innerHTML = students.map(st => {
      const gradeDocId = ClassCare.DB.gradeDocId(st.student_uid, section, subject);
      const g = State.gradesMap.get(gradeDocId) || {};
      const t1 = g.term1 !== undefined && g.term1 !== null ? g.term1 : "";
      const t2 = g.term2 !== undefined && g.term2 !== null ? g.term2 : "";
      const t3 = g.term3 !== undefined && g.term3 !== null ? g.term3 : "";
      const t4 = g.term4 !== undefined && g.term4 !== null ? g.term4 : "";
      const ww = g.written_work !== undefined && g.written_work !== null ? g.written_work : "";
      const pt = g.performance_task !== undefined && g.performance_task !== null ? g.performance_task : "";
      const qa = g.quarterly_assessment !== undefined && g.quarterly_assessment !== null ? g.quarterly_assessment : "";
      const avg = computeAverage(t1, t2, t3, t4);
      const deped = weightedDeped(ww, pt, qa);
      const finalGrade = deped !== null ? deped : avg;

      const rawName = (st.student_name && st.student_name !== "undefined" && st.student_name !== "null")
        ? st.student_name
        : ((g.student_name && g.student_name !== "undefined" && g.student_name !== "null") ? g.student_name : "");
      const displayName = rawName || "Student";
      const displaySid = st.student_id || g.student_id || "—";
      const avatar = (st.photo_data || g.photo_data)
        ? `<img src="${escapeAttr(st.photo_data || g.photo_data)}" alt="" />`
        : escapeHtml((displayName[0] || "S").toUpperCase());

      return `<tr data-student-uid="${escapeAttr(st.student_uid)}" data-doc-id="${escapeAttr(gradeDocId)}">
        <td>
          <div class="identity-cell">
            <span class="identity-avatar">${avatar}</span>
            <span>
              <span class="identity-name" data-student-name-for="${escapeAttr(st.student_uid)}">${escapeHtml(displayName)}</span>
              <span class="identity-meta">${escapeHtml(section)}</span>
            </span>
          </div>
        </td>
        <td class="tabular" data-student-id-for="${escapeAttr(st.student_uid)}">${escapeHtml(displaySid)}</td>
        <td style="text-align:center;"><input type="number" min="${DEPED_MIN}" max="${DEPED_MAX}" step="0.1" class="grade-input deped-range" data-term="term1" value="${escapeAttr(t1)}" placeholder="--" style="width:70px;text-align:center;" /></td>
        <td style="text-align:center;"><input type="number" min="${DEPED_MIN}" max="${DEPED_MAX}" step="0.1" class="grade-input deped-range" data-term="term2" value="${escapeAttr(t2)}" placeholder="--" style="width:70px;text-align:center;" /></td>
        <td style="text-align:center;"><input type="number" min="${DEPED_MIN}" max="${DEPED_MAX}" step="0.1" class="grade-input deped-range" data-term="term3" value="${escapeAttr(t3)}" placeholder="--" style="width:70px;text-align:center;" /></td>
        <td style="text-align:center;"><input type="number" min="${DEPED_MIN}" max="${DEPED_MAX}" step="0.1" class="grade-input deped-range" data-term="term4" value="${escapeAttr(t4)}" placeholder="--" style="width:70px;text-align:center;" /></td>
        <td class="tabular grade-average" data-avg-cell style="text-align:center;">${avg === null ? "—" : avg.toFixed(1)}<div style="margin-top:4px;">${avg === null ? '<span class="status-badge not-recorded">No Grade</span>' : descriptorBadge(avg)}</div></td>
        <td class="align-right">
          <button type="button" class="btn btn-primary btn-sm" data-save-grade="${escapeAttr(st.student_uid)}">Save</button>
        </td>
      </tr>`;
    }).join("");

    // Wire live re-compute on any input
    tbody.querySelectorAll("tr").forEach(row => {
      const inputs = Array.from(row.querySelectorAll(".grade-input"));
      const avgCell = row.querySelector("[data-avg-cell]");
      const recompute = () => {
        const t1 = row.querySelector('[data-term="term1"]')?.value;
        const t2 = row.querySelector('[data-term="term2"]')?.value;
        const t3 = row.querySelector('[data-term="term3"]')?.value;
        const t4 = row.querySelector('[data-term="term4"]')?.value;
        const avg = computeAverage(t1, t2, t3, t4);
        if (avgCell) {
          avgCell.innerHTML = `${avg === null ? "—" : avg.toFixed(1)}<div style="margin-top:4px;">${avg === null ? '<span class="status-badge not-recorded">No Grade</span>' : descriptorBadge(avg)}</div>`;
        }
      };
      inputs.forEach(inp => inp.addEventListener("input", recompute));
      const saveBtn = row.querySelector("[data-save-grade]");
      saveBtn?.addEventListener("click", () => saveStudentGradeRow(row));
    });

    // Asynchronously resolve missing or fallback student profiles and update UI
    students.forEach(st => {
      const isMissing = !st.student_name || st.student_name === "Student" || st.student_name === "undefined" || st.student_name === "null";
      if (isMissing && typeof ClassCare?.DB?.resolveStudentProfile === "function") {
        ClassCare.DB.resolveStudentProfile(st.student_uid, st).then(prof => {
          if (prof?.student_name && prof.student_name !== "Student" && prof.student_name !== "undefined") {
            const nameEl = tbody.querySelector(`[data-student-name-for="${st.student_uid}"]`);
            if (nameEl) nameEl.textContent = prof.student_name;
            st.student_name = prof.student_name;
            if (prof.student_id) {
              const sidEl = tbody.querySelector(`[data-student-id-for="${st.student_uid}"]`);
              if (sidEl && (sidEl.textContent === "—" || !sidEl.textContent.trim())) {
                sidEl.textContent = prof.student_id;
              }
              st.student_id = prof.student_id;
            }
          }
        }).catch(() => {});
      }
    });
  }

  async function saveStudentGradeRow(row) {
    const studentUid = row.dataset.studentUid;
    const docId = row.dataset.docId;
    const section = State.selectedSection;
    const subject = State.selectedSubject;
    const teacher = State.teacher;
    const saveBtn = row.querySelector("[data-save-grade]");
    if (!studentUid || !teacher) return;

    const termFields = ["term1", "term2", "term3", "term4"];
    const parsed = {};
    for (const term of termFields) {
      const inp = row.querySelector(`[data-term="${term}"]`);
      const v = validateGrade(inp?.value?.trim());
      if (!v.ok) { Toast.error(`${term.toUpperCase()}: ${v.message}`); return; }
      parsed[term] = v.value;
    }
    const avg = computeAverage(parsed.term1, parsed.term2, parsed.term3, parsed.term4);

    let studentName = row.querySelector(".identity-name")?.textContent.trim() || "Student";
    let studentId = row.querySelector("td.tabular")?.textContent.trim() || "";
    if (studentId === "—") studentId = "";

    // If student name is still placeholder, attempt resolving from DB before saving
    if ((!studentName || studentName === "Student" || studentName === "undefined") && typeof ClassCare?.DB?.resolveStudentProfile === "function") {
      try {
        const prof = await ClassCare.DB.resolveStudentProfile(studentUid);
        if (prof?.student_name && prof.student_name !== "Student") {
          studentName = prof.student_name;
          if (prof.student_id && !studentId) studentId = prof.student_id;
        }
      } catch (_) {}
    }

    const photoEl = row.querySelector(".identity-avatar img");
    const photo_data = photoEl?.getAttribute("src") || "";
    const cleanSubId = String(subject || "").replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
    const cleanSecId = String(section || "").replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();

    const payload = {
      student_uid: studentUid,
      student_id: studentId,
      student_name: studentName,
      photo_data,
      teacher_uid: teacher.uid,
      teacher_id: teacher.uid,
      teacher_name: `${teacher.first_name || ""} ${teacher.last_name || ""}`.trim() || teacher.email,
      section: section,
      section_id: cleanSecId,
      subject: subject,
      subject_id: cleanSubId,
      term1: parsed.term1, term2: parsed.term2, term3: parsed.term3, term4: parsed.term4,
      final_grade: avg,
      term_average: avg,
      deped_grade: avg,
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    };

    Utils.setLoading(saveBtn, true);
    try {
      await ClassCare.DB.grades.doc(docId).set(payload, { merge: true });
      State.gradesMap.set(docId, { id: docId, ...payload });
      Toast.success(`Grades saved for ${studentName}!`);
    } catch (err) {
      console.error("[grades] save failed:", err);
      Toast.error(err?.code === "permission-denied" ? "Permission denied saving grades." : "Failed to save grades. Please try again.");
    } finally { Utils.setLoading(saveBtn, false); }
  }

  async function saveAllGrades() {
    const tbody = $("#grades-tbody");
    const rows = Array.from(tbody?.querySelectorAll("tr[data-student-uid]") || []);
    if (!rows.length) return Toast.warn("No students to save grades for.");
    const btn = $("#btn-save-all-grades");
    Utils.setLoading(btn, true);
    let saved = 0, failed = 0;
    for (const row of rows) {
      try { await saveStudentGradeRow(row); saved++; } catch (_) { failed++; }
    }
    Utils.setLoading(btn, false);
    if (failed === 0) Toast.success(`Saved all ${saved} grade records.`);
    else Toast.warn(`Saved ${saved}; ${failed} failed.`);
  }

  // Generate export rows formatted for official DepEd Progress / Form 137 reports
  function getExportGradeRows() {
    const students = getEnrolledForCurrentSelection();
    if (!students.length) return null;
    const section = State.selectedSection || "All_Sections";
    const subject = State.selectedSubject || "General";

    const rows = students.map((st, idx) => {
      const gradeDocId = ClassCare.DB.gradeDocId(st.student_uid, section, subject);
      const g = State.gradesMap.get(gradeDocId) || {};
      const t1 = g.term1 !== undefined && g.term1 !== null && g.term1 !== "" ? Number(g.term1) : null;
      const t2 = g.term2 !== undefined && g.term2 !== null && g.term2 !== "" ? Number(g.term2) : null;
      const t3 = g.term3 !== undefined && g.term3 !== null && g.term3 !== "" ? Number(g.term3) : null;
      const t4 = g.term4 !== undefined && g.term4 !== null && g.term4 !== "" ? Number(g.term4) : null;
      const avg = computeAverage(t1, t2, t3, t4);
      const desc = avg !== null ? depedDescriptor(avg).label : "No Grade";
      const remarks = avg === null ? "PENDING" : avg >= 75 ? "PASSED" : "FAILED";

      return {
        "#": idx + 1,
        "Student Name": st.student_name || "Student",
        "Student ID": st.student_id || "—",
        "Grade & Section": section,
        "Subject": subject,
        "Teacher": State.teacher ? `${State.teacher.first_name || ""} ${State.teacher.last_name || ""}`.trim() : "—",
        "1st Term": t1 !== null ? t1.toFixed(1) : "—",
        "2nd Term": t2 !== null ? t2.toFixed(1) : "—",
        "3rd Term": t3 !== null ? t3.toFixed(1) : "—",
        "4th Term": t4 !== null ? t4.toFixed(1) : "—",
        "Final Grade": avg !== null ? avg.toFixed(1) : "—",
        "DepEd Descriptor": desc,
        "Remarks": remarks
      };
    });

    return { rows, section, subject };
  }

  // NEW: Export student grades to CSV
  function exportGradesCsv() {
    const data = getExportGradeRows();
    if (!data || !data.rows.length) return Toast.warn("No student grades found to export for the current selection.");
    const headers = Object.keys(data.rows[0]);
    const quote = value => {
      const text = String(value ?? "");
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csv = [headers.join(","), ...data.rows.map(row => headers.map(key => quote(row[key])).join(","))].join("\r\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const cleanSection = String(data.section).replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_");
    const cleanSubject = String(data.subject).replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_");
    link.href = url;
    link.download = `ClassCare_Grades_${cleanSection}_${cleanSubject}_${Utils.todayIso()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    Toast.success(`Exported ${data.rows.length} grade records to CSV.`);
  }

  // NEW: Export student grades to Excel (.xlsx) using SheetJS
  function exportGradesExcel() {
    const data = getExportGradeRows();
    if (!data || !data.rows.length) return Toast.warn("No student grades found to export for the current selection.");
    if (!window.XLSX) {
      exportGradesCsv();
      return Toast.info("Excel library offline; exported as CSV instead.");
    }
    try {
      const workbook = XLSX.utils.book_new();
      const headers = ["#", "Student Name", "Student ID", "Grade & Section", "Subject", "Teacher", "1st Term", "2nd Term", "3rd Term", "4th Term", "Final Grade", "DepEd Descriptor", "Remarks"];
      const sheet = XLSX.utils.json_to_sheet(data.rows, { header: headers });
      sheet["!cols"] = [
        { wch: 5 }, { wch: 24 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 22 },
        { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 24 }, { wch: 12 }
      ];
      XLSX.utils.book_append_sheet(workbook, sheet, "DepEd Grades");
      const cleanSection = String(data.section).replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_");
      const cleanSubject = String(data.subject).replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_");
      XLSX.writeFile(workbook, `ClassCare_Grades_${cleanSection}_${cleanSubject}_${Utils.todayIso()}.xlsx`);
      Toast.success(`Exported ${data.rows.length} grade records to Excel.`);
    } catch (err) {
      console.error("[grades-export] xlsx failed:", err);
      exportGradesCsv();
    }
  }

  ClassCare.onCurrentUser(user => {
    if (user?.role === "teacher" || user?.role === "admin") initGrades(user);
  });

  function stopTeacherGradesListeners() {
    try { State.unsubscribe?.(); } catch (_) {}
    State.unsubscribe = null;
    try { State.unsubscribeSubjects?.(); } catch (_) {}
    State.unsubscribeSubjects = null;
    try { _unsubSectionGrades?.(); } catch (_) {}
    _unsubSectionGrades = null;
  }

  window.addEventListener("pagehide", stopTeacherGradesListeners);
  window.addEventListener("beforeunload", stopTeacherGradesListeners);

  window.TeacherGrades = {
    getGradesMap: () => State.gradesMap
  };
})();
