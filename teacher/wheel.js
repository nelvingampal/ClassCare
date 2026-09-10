/* ============================================================
   teacher/wheel.js — calm roster chooser (compatibility API: Wheel)
   ============================================================ */
(function () {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const list = $("#wheel-list"); const result = $("#wheel-winner"); const chooseButton = $("#btn-spin"); const refreshButton = $("#btn-rebuild");
  if (!list || !chooseButton) return;
  let students = []; let selectedUid = "";

  function escape(value) { return ClassCareUI.escapeHtml(value); }
  function rebuild(nextStudents = []) {
    students = Array.isArray(nextStudents) ? nextStudents : [];
    selectedUid = "";
    if (!students.length) { list.innerHTML = `<div class="state-panel state-empty"><strong>No students ready</strong><span>Students appear here after their arrival is recorded.</span></div>`; result.textContent = "No student selected."; chooseButton.disabled = true; return; }
    chooseButton.disabled = false;
    list.innerHTML = students.map(student => `<button type="button" class="choose-item" data-choose-uid="${escape(student.uid)}"><span><span class="choose-item-name">${escape(`${student.first_name || ""} ${student.last_name || ""}`.trim())}</span><span class="choose-item-meta">${escape(student.student_id || "—")} · ${escape(student.section || "—")}</span></span><span class="icon-sm" aria-hidden="true">+</span></button>`).join("");
    list.querySelectorAll("[data-choose-uid]").forEach(button => button.addEventListener("click", () => { selectedUid = button.dataset.chooseUid; list.querySelectorAll(".choose-item").forEach(item => item.classList.toggle("is-selected", item === button)); const student = students.find(item => item.uid === selectedUid); result.textContent = student ? `${student.first_name || ""} ${student.last_name || ""}`.trim() : "No student selected."; }));
  }
  function choose() {
    if (!students.length) return Toast.warn("No students with a recorded arrival yet.");
    const student = selectedUid ? students.find(item => item.uid === selectedUid) : students[Math.floor(Math.random() * students.length)];
    if (!student) return;
    selectedUid = student.uid; list.querySelectorAll("[data-choose-uid]").forEach(button => button.classList.toggle("is-selected", button.dataset.chooseUid === selectedUid)); result.textContent = `Selected: ${student.first_name || ""} ${student.last_name || ""}`.trim();
  }
  chooseButton.addEventListener("click", choose); refreshButton?.addEventListener("click", () => { rebuild(window._studentsPresent?.() || []); Toast.info("Student list refreshed."); });
  window.addEventListener("classcare:roster-updated", event => rebuild(event.detail?.students || []));
  rebuild(window._studentsPresent?.() || []);
  window.Wheel = { rebuild, spin: choose };
})();
