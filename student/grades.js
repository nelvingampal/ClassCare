/* ============================================================
   student/grades.js — Real-time Subjects & Grades viewer
   Phase 5: Student portal grades integration
   ============================================================ */
(function () {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);

  let _unsubGrades = null;
  let _unsubEnrollments = null;
  let _gradesMap = new Map();
  let _enrollmentsMap = new Map();
  let _currentUid = null;
  let _currentUser = null;
  let _currentRows = [];

  function escHtml(str) {
    return typeof ClassCareUI?.escapeHtml === "function"
      ? ClassCareUI.escapeHtml(str)
      : String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // NEW: Compute numeric average of valid term grades
  function computeAverage(t1, t2, t3, t4) {
    const nums = [t1, t2, t3, t4].map(v => (v !== null && v !== "" && v !== undefined && !isNaN(Number(v))) ? Number(v) : null).filter(v => v !== null);
    if (!nums.length) return null;
    const sum = nums.reduce((a, b) => a + b, 0);
    return Number((sum / nums.length).toFixed(1));
  }

  // NEW: DepEd standard grade descriptor mapper
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

  function gradeDisplay(val) {
    if (val === null || val === undefined || val === "") return '<span style="color:var(--text-muted);">—</span>';
    const n = Number(val);
    if (isNaN(n)) return '<span style="color:var(--text-muted);">—</span>';
    const cls = n < 75 ? "status-absent" : n < 80 ? "status-late" : "status-present";
    return '<span class="status-badge ' + cls + '" style="min-width:42px;text-align:center;">' + (n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)) + '</span>';
  }

  // MODIFIED: Render student grades table with Final Grade and Remarks columns
  function renderGradesTable() {
    const tbody = $("#student-grades-tbody");
    const countBadge = $("#student-grades-count");
    if (!tbody) return;

    const rows = [];
    _enrollmentsMap.forEach(function(enrollment) {
      var gradeDocId = ClassCare.DB.gradeDocId(enrollment.student_uid, enrollment.section, enrollment.subject);
      var grade = _gradesMap.get(gradeDocId) || {};
      rows.push({ enrollment: enrollment, grade: grade });
    });

    _gradesMap.forEach(function(grade, docId) {
      var alreadyCovered = false;
      _enrollmentsMap.forEach(function(e) {
        if (e.section === grade.section && e.subject === grade.subject) alreadyCovered = true;
      });
      if (!alreadyCovered && (grade.student_uid === _currentUid || (_currentUser?.student_id && grade.student_id === _currentUser.student_id))) {
        rows.push({ enrollment: null, grade: grade });
      }
    });

    // Fallback: If officially assigned to a section, show standard curriculum subjects
    if (!rows.length && (_currentUser?.section || _currentUser?.section_name)) {
      const sec = _currentUser.section || _currentUser.section_name;
      const defaultSubjects = [
        "Mathematics", "Science", "English", "Filipino",
        "Araling Panlipunan", "Edukasyon sa Pagpapakatao (ESP)",
        "MAPEH", "EPP / TLE"
      ];
      defaultSubjects.forEach(function(sub) {
        var gradeDocId = ClassCare.DB.gradeDocId(_currentUid, sec, sub);
        var grade = _gradesMap.get(gradeDocId) || { section: sec, subject: sub, student_uid: _currentUid };
        rows.push({
          enrollment: { section: sec, subject: sub, teacher_name: "Assigned Teacher" },
          grade: grade
        });
      });
    }

    if (countBadge) countBadge.textContent = rows.length + " Subject" + (rows.length !== 1 ? "s" : "");

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="9"><div class="state-panel state-empty"><strong>No subjects enrolled yet.</strong><span>Your teacher will enroll you in your subjects. Check back here once your enrollment is confirmed.</span></div></td></tr>';
      _currentRows = [];
      return;
    }

    rows.sort(function(a, b) {
      var secA = String(a.enrollment && a.enrollment.section || a.grade && a.grade.section || "");
      var secB = String(b.enrollment && b.enrollment.section || b.grade && b.grade.section || "");
      var secCmp = secA.localeCompare(secB);
      if (secCmp !== 0) return secCmp;
      return String(a.enrollment && a.enrollment.subject || a.grade && a.grade.subject || "").localeCompare(String(b.enrollment && b.enrollment.subject || b.grade && b.grade.subject || ""));
    });

    _currentRows = rows;

    tbody.innerHTML = rows.map(function(item) {
      var enrollment = item.enrollment;
      var grade = item.grade;
      var subject = escHtml(enrollment && enrollment.subject || grade && grade.subject || "—");
      var section = escHtml(enrollment && enrollment.section || grade && grade.section || "—");
      var teacher = escHtml(enrollment && enrollment.teacher_name || grade && grade.teacher_name || "—");
      var t1Val = grade && grade.term1 !== undefined && grade.term1 !== null && grade.term1 !== "" ? Number(grade.term1) : null;
      var t2Val = grade && grade.term2 !== undefined && grade.term2 !== null && grade.term2 !== "" ? Number(grade.term2) : null;
      var t3Val = grade && grade.term3 !== undefined && grade.term3 !== null && grade.term3 !== "" ? Number(grade.term3) : null;
      var t4Val = grade && grade.term4 !== undefined && grade.term4 !== null && grade.term4 !== "" ? Number(grade.term4) : null;
      var finalGrade = grade && grade.final_grade !== undefined && grade.final_grade !== null && grade.final_grade !== ""
        ? Number(grade.final_grade)
        : computeAverage(t1Val, t2Val, t3Val, t4Val);

      var t1 = gradeDisplay(t1Val);
      var t2 = gradeDisplay(t2Val);
      var t3 = gradeDisplay(t3Val);
      var t4 = gradeDisplay(t4Val);
      var finalCol = gradeDisplay(finalGrade);
      var remarksCol = finalGrade === null
        ? '<span class="status-badge status-late" style="white-space:nowrap;">In Progress</span>'
        : finalGrade >= 75
          ? '<span class="status-badge status-present" style="white-space:nowrap;">PASSED</span>'
          : '<span class="status-badge status-absent" style="white-space:nowrap;">FAILED</span>';

      return '<tr>' +
        '<td><strong>' + subject + '</strong></td>' +
        '<td>' + section + '</td>' +
        '<td>' + teacher + '</td>' +
        '<td style="text-align:center;">' + t1 + '</td>' +
        '<td style="text-align:center;">' + t2 + '</td>' +
        '<td style="text-align:center;">' + t3 + '</td>' +
        '<td style="text-align:center;">' + t4 + '</td>' +
        '<td style="text-align:center;">' + finalCol + '</td>' +
        '<td style="text-align:center;">' + remarksCol + '</td>' +
        '</tr>';
    }).join("");
  }

  // Generate and open official DepEd Print Report Card / Grade Slip
  function openPrintGradeSlipModal() {
    const modal = $("#print-grade-slip-modal");
    const container = $("#grade-slip-printable");
    if (!modal || !container) return;

    const user = _currentUser || {};
    const studentName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.username || "Student";
    const studentId = user.student_id || "—";
    const studentSection = user.section || user.section_name || (_currentRows[0]?.enrollment?.section || _currentRows[0]?.grade?.section || "—");
    const academicYear = new Date().getFullYear() + " - " + (new Date().getFullYear() + 1);

    if (!_currentRows.length) {
      container.innerHTML = `<div class="state-panel state-empty"><strong>No encoded grades found.</strong><span>Your teacher has not finalized subjects for this term yet.</span></div>`;
      modal.classList.remove("hidden");
      modal.classList.add("flex");
      return;
    }

    let finalSum = 0;
    let finalCount = 0;

    const tableRows = _currentRows.map(function(item, idx) {
      const g = item.grade || {};
      const sub = item.enrollment?.subject || g.subject || "Subject " + (idx + 1);
      const t1 = g.term1 !== undefined && g.term1 !== null && g.term1 !== "" ? Number(g.term1) : null;
      const t2 = g.term2 !== undefined && g.term2 !== null && g.term2 !== "" ? Number(g.term2) : null;
      const t3 = g.term3 !== undefined && g.term3 !== null && g.term3 !== "" ? Number(g.term3) : null;
      const t4 = g.term4 !== undefined && g.term4 !== null && g.term4 !== "" ? Number(g.term4) : null;
      const finalVal = g.final_grade !== undefined && g.final_grade !== null && g.final_grade !== ""
        ? Number(g.final_grade)
        : computeAverage(t1, t2, t3, t4);

      if (finalVal !== null) {
        finalSum += finalVal;
        finalCount += 1;
      }

      const remarks = finalVal === null ? "In Progress" : finalVal >= 75 ? "PASSED" : "FAILED";
      const remarksCls = finalVal === null ? "color:#eab308" : finalVal >= 75 ? "color:#15803d;font-weight:700" : "color:#b91c1c;font-weight:700";

      return `<tr>
        <td style="padding:8px 10px;border:1px solid #cbd5e1;font-weight:600;">${escHtml(sub)}</td>
        <td style="padding:8px 6px;text-align:center;border:1px solid #cbd5e1;">${t1 !== null ? t1.toFixed(1) : "—"}</td>
        <td style="padding:8px 6px;text-align:center;border:1px solid #cbd5e1;">${t2 !== null ? t2.toFixed(1) : "—"}</td>
        <td style="padding:8px 6px;text-align:center;border:1px solid #cbd5e1;">${t3 !== null ? t3.toFixed(1) : "—"}</td>
        <td style="padding:8px 6px;text-align:center;border:1px solid #cbd5e1;">${t4 !== null ? t4.toFixed(1) : "—"}</td>
        <td style="padding:8px 8px;text-align:center;border:1px solid #cbd5e1;font-weight:700;">${finalVal !== null ? finalVal.toFixed(1) : "—"}</td>
        <td style="padding:8px 10px;text-align:center;border:1px solid #cbd5e1;${remarksCls};">${remarks}</td>
      </tr>`;
    }).join("");

    const genAvg = finalCount > 0 ? Number((finalSum / finalCount).toFixed(1)) : null;
    const genDesc = genAvg !== null ? depedDescriptor(genAvg).label : "No Grade";
    const genRemarks = genAvg === null ? "In Progress" : genAvg >= 75 ? "PROMOTED / PASSED" : "RETAINED";
    const genRemarksColor = genAvg === null ? "#eab308" : genAvg >= 75 ? "#15803d" : "#b91c1c";

    container.innerHTML = `
      <div class="grade-slip-printable-area" style="background:#ffffff;color:#0f172a;padding:1.5rem;border-radius:8px;border:1px solid #e2e8f0;">
        <div style="text-align:center;border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:16px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b;">Republic of the Philippines · Department of Education</div>
          <div style="font-size:20px;font-weight:800;color:#1d4ed8;margin:4px 0;">ClassCare Learner's Progress Report</div>
          <div style="font-size:12px;color:#475569;">Official Grade Transcript &amp; Evaluation Card</div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px 16px;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:16px;font-size:13px;">
          <div><span style="color:#64748b;">Learner:</span> <strong>${escHtml(studentName)}</strong></div>
          <div><span style="color:#64748b;">Student ID:</span> <strong class="tabular">${escHtml(studentId)}</strong></div>
          <div><span style="color:#64748b;">Grade &amp; Section:</span> <strong>${escHtml(studentSection)}</strong></div>
          <div><span style="color:#64748b;">Academic Year:</span> <strong>${escHtml(academicYear)}</strong></div>
          <div><span style="color:#64748b;">Date Issued:</span> <strong>${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</strong></div>
        </div>

        <table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:13px;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="padding:8px 10px;text-align:left;border:1px solid #cbd5e1;">Learning Areas</th>
              <th style="padding:8px 6px;text-align:center;border:1px solid #cbd5e1;width:60px;">Q1</th>
              <th style="padding:8px 6px;text-align:center;border:1px solid #cbd5e1;width:60px;">Q2</th>
              <th style="padding:8px 6px;text-align:center;border:1px solid #cbd5e1;width:60px;">Q3</th>
              <th style="padding:8px 6px;text-align:center;border:1px solid #cbd5e1;width:60px;">Q4</th>
              <th style="padding:8px 8px;text-align:center;border:1px solid #cbd5e1;width:75px;">Final</th>
              <th style="padding:8px 10px;text-align:center;border:1px solid #cbd5e1;width:95px;">Remarks</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
            <tr style="background:#f8fafc;font-weight:700;">
              <td style="padding:8px 10px;border:1px solid #cbd5e1;">General Average</td>
              <td colspan="4" style="padding:8px 6px;border:1px solid #cbd5e1;text-align:center;color:#64748b;font-size:11px;">${escHtml(genDesc)}</td>
              <td style="padding:8px 8px;text-align:center;border:1px solid #cbd5e1;font-size:14px;color:#1d4ed8;">${genAvg !== null ? genAvg.toFixed(1) : "—"}</td>
              <td style="padding:8px 10px;text-align:center;border:1px solid #cbd5e1;color:${genRemarksColor};">${genRemarks}</td>
            </tr>
          </tbody>
        </table>

        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:11px;color:#64748b;padding:6px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;margin-bottom:28px;">
          <span><strong>Descriptors:</strong> Outstanding (90-100) · Very Satisfactory (85-89) · Satisfactory (80-84) · Fairly Satisfactory (75-79) · Did Not Meet (&lt;75)</span>
          <span><strong>DepEd Passing:</strong> 75.0</span>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-top:24px;text-align:center;font-size:12px;">
          <div>
            <div style="border-bottom:1px solid #334155;height:28px;margin-bottom:6px;"></div>
            <strong>Class Adviser</strong>
            <div style="color:#64748b;font-size:11px;">Signature Over Printed Name</div>
          </div>
          <div>
            <div style="border-bottom:1px solid #334155;height:28px;margin-bottom:6px;"></div>
            <strong>School Principal / Head</strong>
            <div style="color:#64748b;font-size:11px;">Official Seal &amp; Approval</div>
          </div>
          <div>
            <div style="border-bottom:1px solid #334155;height:28px;margin-bottom:6px;"></div>
            <strong>Parent / Guardian</strong>
            <div style="color:#64748b;font-size:11px;">Signature &amp; Date Received</div>
          </div>
        </div>
      </div>
    `;

    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }

  function closePrintGradeSlipModal() {
    const modal = $("#print-grade-slip-modal");
    if (modal) {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    }
  }

  function initPrintModalEvents() {
    $("#btn-print-grades")?.addEventListener("click", openPrintGradeSlipModal);
    $("#btn-do-print-slip")?.addEventListener("click", () => window.print());
    document.querySelectorAll("[data-close-grade-slip]").forEach(el => {
      el.addEventListener("click", closePrintGradeSlipModal);
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") closePrintGradeSlipModal();
    });
  }

  let _unsubNotifications = null;
  let _unsubSummativeScores = null;
  let _summativeScoresMap = new Map();

  // Requirement 2: Render confidential individual student summative scores
  function renderSummativeScoresTable() {
    const tbody = $("#student-summative-tbody");
    if (!tbody) return;

    const scoresList = Array.from(_summativeScoresMap.values());
    if (!scoresList.length) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="state-panel state-empty"><strong>No summative test records yet.</strong><span>Your individual test scores will appear here in real time as your teacher records them.</span></div></td></tr>';
      return;
    }

    scoresList.sort((a, b) => String(b.assessmentDate || "").localeCompare(String(a.assessmentDate || "")) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

    tbody.innerHTML = scoresList.map(item => {
      const date = escHtml(item.assessmentDate || "—");
      const sub = escHtml(item.subject || "General");
      const title = escHtml(item.assessmentTitle || item.title || item.assessmentId || "Summative Test");
      const scoreNum = Number(item.score);
      const maxScore = Number(item.maxScore || 100);
      const thresholdPct = Number(item.thresholdPercent || 75);
      const passingMin = Number(((maxScore * thresholdPct) / 100).toFixed(1));
      const pct = maxScore > 0 && !isNaN(scoreNum) ? (scoreNum / maxScore) * 100 : null;
      const isPassed = pct !== null && pct >= thresholdPct;

      const scoreBadge = !isNaN(scoreNum)
        ? `<strong style="font-size:14px;color:${isPassed ? '#15803d' : '#b91c1c'}">${scoreNum} / ${maxScore}</strong>`
        : '<span style="color:var(--text-muted);">—</span>';

      const pctBadge = pct !== null
        ? `<span class="status-badge ${isPassed ? 'status-present' : 'status-absent'}">${pct.toFixed(1)}%</span>`
        : '<span style="color:var(--text-muted);">—</span>';

      const evalBadge = pct === null
        ? '<span class="status-badge status-late">Pending</span>'
        : isPassed
          ? '<span class="status-badge status-present" style="font-weight:700;">PASSED</span>'
          : '<span class="status-badge status-absent" style="font-weight:700;">NEEDS ATTENTION</span>';

      return `<tr>
        <td class="tabular">${date}</td>
        <td><strong>${sub}</strong></td>
        <td>${title}</td>
        <td style="text-align:center;">${scoreBadge}</td>
        <td style="text-align:center;" class="tabular">${passingMin}</td>
        <td style="text-align:center;">${pctBadge}</td>
        <td style="text-align:center;">${evalBadge}</td>
      </tr>`;
    }).join("");
  }

  // Requirement 2: Real-time onSnapshot listener for upcoming summative tests
  function listenSummativeNotifications(user) {
    if (_unsubNotifications) { try { _unsubNotifications(); } catch (_) {} _unsubNotifications = null; }
    if (!user || !user.uid) return;
    const section = user.section || user.section_name || "";
    const banner = $("#student-summative-alert");
    const titleEl = $("#summative-alert-title");
    const msgEl = $("#summative-alert-message");

    try {
      const notifsRef = ClassCare.DB.collection("notifications");
      const q = section ? notifsRef.where("section", "==", section) : notifsRef.where("studentId", "==", user.uid);
      _unsubNotifications = q.onSnapshot(snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(n => n.type === "summative_scheduled")
          .sort((a, b) => String(b.scheduledDate || "").localeCompare(String(a.scheduledDate || "")));

        if (docs.length && banner) {
          const latest = docs[0];
          const passMin = latest.passingScore !== undefined ? latest.passingScore : Math.round((Number(latest.maxScore || 100) * Number(latest.thresholdPercent || 75)) / 100);
          if (titleEl) titleEl.textContent = `Upcoming Summative Test: ${latest.title || "Assessment"} (${latest.subject || "Subject"})`;
          if (msgEl) msgEl.textContent = `Scheduled on ${latest.scheduledDate || "soon"}. Section: ${latest.section || section}. Passing score: ${passMin} / ${latest.maxScore || 100}.`;
          banner.style.display = "flex";
        } else if (banner) {
          banner.style.display = "none";
        }
      }, err => {
        console.warn("[student-notifications] onSnapshot notice:", err);
      });
    } catch (err) {
      console.warn("[student-notifications] setup notice:", err);
    }
  }

  // Requirement 2: Real-time onSnapshot strictly queried for current student only
  function listenSummativeScores(user) {
    if (_unsubSummativeScores) { try { _unsubSummativeScores(); } catch (_) {} _unsubSummativeScores = null; }
    if (!user || !user.uid) return;

    try {
      _unsubSummativeScores = ClassCare.DB.collection("summativeScores")
        .where("studentId", "==", user.uid)
        .onSnapshot(snapshot => {
          snapshot.docChanges().forEach(change => {
            if (change.type === "removed") {
              _summativeScoresMap.delete(change.doc.id);
            } else {
              _summativeScoresMap.set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
            }
          });
          renderSummativeScoresTable();
        }, err => {
          console.warn("[student-summative] private score listener notice:", err);
        });
    } catch (err) {
      console.warn("[student-summative] setup notice:", err);
    }
  }

  function stopListeners() {
    if (_unsubGrades) { try { _unsubGrades(); } catch (_) {} _unsubGrades = null; }
    if (_unsubEnrollments) { try { _unsubEnrollments(); } catch (_) {} _unsubEnrollments = null; }
    if (_unsubNotifications) { try { _unsubNotifications(); } catch (_) {} _unsubNotifications = null; }
    if (_unsubSummativeScores) { try { _unsubSummativeScores(); } catch (_) {} _unsubSummativeScores = null; }
    _gradesMap.clear();
    _enrollmentsMap.clear();
    _summativeScoresMap.clear();
    _currentRows = [];
    _currentUid = null;
    _currentUser = null;
  }

  function initStudentGrades(user) {
    stopListeners();
    if (!user || !user.uid) return;
    _currentUid = user.uid;
    _currentUser = user;

    initPrintModalEvents();
    listenSummativeNotifications(user);
    listenSummativeScores(user);

    var tbody = $("#student-grades-tbody");
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="9"><div class="state-panel state-loading"><strong>Loading subjects\u2026</strong></div></td></tr>';
    }

    try {
      _unsubGrades = ClassCare.DB.grades
        .where("student_uid", "==", user.uid)
        .onSnapshot(function(snapshot) {
          snapshot.docChanges().forEach(function(change) {
            if (change.type === "removed") {
              _gradesMap.delete(change.doc.id);
            } else {
              var data = Object.assign({ id: change.doc.id }, change.doc.data());
              _gradesMap.set(change.doc.id, data);
            }
          });
          renderGradesTable();
        }, function(err) {
          console.warn("[student-grades] grades listener error:", err);
        });
    } catch (err) {
      console.warn("[student-grades] grades listener setup failed:", err);
    }

    try {
      _unsubEnrollments = ClassCare.DB.enrollments
        .where("student_uid", "==", user.uid)
        .onSnapshot(function(snapshot) {
          snapshot.docChanges().forEach(function(change) {
            if (change.type === "removed") {
              _enrollmentsMap.delete(change.doc.id);
            } else {
              var data = Object.assign({ id: change.doc.id }, change.doc.data());
              _enrollmentsMap.set(change.doc.id, data);
            }
          });
          renderGradesTable();
        }, function(err) {
          console.warn("[student-grades] enrollments listener error:", err);
        });
    } catch (err) {
      console.warn("[student-grades] enrollments listener setup failed:", err);
    }
  }

  ClassCare.onCurrentUser(function(user) {
    if (user && user.role === "student") {
      initStudentGrades(user);
    } else {
      stopListeners();
      var tbody = $("#student-grades-tbody");
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="9"><div class="state-panel state-empty"><strong>Sign in to view your grades.</strong></div></td></tr>';
      }
      var sumTbody = $("#student-summative-tbody");
      if (sumTbody) {
        sumTbody.innerHTML = '<tr><td colspan="7"><div class="state-panel state-empty"><strong>Sign in to view summative assessment records.</strong></div></td></tr>';
      }
      var banner = $("#student-summative-alert");
      if (banner) banner.style.display = "none";
    }
  });

  window.addEventListener("pagehide", stopListeners);
  window.addEventListener("beforeunload", stopListeners);
})();
