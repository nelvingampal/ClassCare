/* ============================================================
   teacher/enrollment.js — Teacher-led student enrollment module
   ============================================================ */
(function () {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  let State = {
    teacher: null,
    enrolledList: [],
    unsubscribe: null,
    currentFoundStudent: null
  };
  let _settingsOpen = false;
  let _settingsLoaded = false;
  let _unsubSettings = null;

  function updateTeacherEnrollmentBadge() {
    const badge = $("#teacher-enrollment-period-badge");
    if (!badge) return;
    if (!_settingsLoaded) {
      badge.textContent = "CHECKING…";
      badge.className = "status-badge status-not-recorded";
      badge.title = "Checking enrollment period status from database…";
    } else if (_settingsOpen) {
      badge.textContent = "ENROLLMENT OPEN";
      badge.className = "status-badge status-present";
      badge.title = "Enrollment period is currently open.";
    } else {
      badge.textContent = "ENROLLMENT CLOSED";
      badge.className = "status-badge status-absent";
      badge.title = "Enrollment period is currently closed.";
    }
  }

  function listenToSettings() {
    if (_unsubSettings) { _unsubSettings(); _unsubSettings = null; }
    updateTeacherEnrollmentBadge();

    const applyData = (data) => {
      _settingsOpen = ClassCare.isEnrollmentOpen ? ClassCare.isEnrollmentOpen(data) : (ClassCare.DB?.isEnrollmentOpen ? ClassCare.DB.isEnrollmentOpen(data) : false);
      _settingsLoaded = true;
      updateTeacherEnrollmentBadge();
    };

    if (ClassCare.DB?.getSettings) {
      ClassCare.DB.getSettings().then(applyData).catch(err => {
        console.warn("[teacher-enrollment] getSettings error:", err);
      });
    }

    try {
      _unsubSettings = ClassCare.DB.settings.onSnapshot(doc => {
        const data = doc.exists ? doc.data() : {};
        applyData(data);
      }, err => {
        console.warn("[teacher-enrollment] settings snapshot error:", err);
        _settingsLoaded = true;
        updateTeacherEnrollmentBadge();
      });
    } catch (err) {
      console.warn("[teacher-enrollment] setup settings listener error:", err);
    }

    // Instant Cross-Portal Synchronization via BroadcastChannel and Storage Events
    try {
      const syncChannel = new BroadcastChannel("classcare-sync");
      syncChannel.onmessage = (event) => {
        if (event.data?.type === "enrollment_toggle") {
          _settingsOpen = !!event.data.isOpen;
          _settingsLoaded = true;
          updateTeacherEnrollmentBadge();
        }
      };
    } catch (_) {}

    window.addEventListener("storage", (e) => {
      if (e.key === "classcare_enrollment_open") {
        _settingsOpen = e.newValue === "true";
        _settingsLoaded = true;
        updateTeacherEnrollmentBadge();
      }
    });

    window.addEventListener("classcare:enrollment-changed", (e) => {
      if (typeof e.detail?.isOpen === "boolean") {
        _settingsOpen = e.detail.isOpen;
        _settingsLoaded = true;
        updateTeacherEnrollmentBadge();
      }
    });
  }

  function escapeHtml(str) { return ClassCareUI.escapeHtml(str); }
  function escapeAttr(str) { return escapeHtml(str).replace(/"/g, "&quot;"); }

  function getTeacherSections() {
    const t = State.teacher;
    if (!t) return [];
    const list = [];
    if (Array.isArray(t.assigned_sections) && t.assigned_sections.length) {
      t.assigned_sections.forEach(s => {
        const v = String(s || "").trim();
        if (v && !list.includes(v)) list.push(v);
      });
    }
    if (t.section) {
      const v = String(t.section || "").trim();
      if (v && !list.includes(v)) list.push(v);
    }
    return list;
  }

  function getTeacherSubjects() {
    const t = State.teacher;
    if (!t || !t.subject) return ["General Subject"];
    return t.subject.split(/[,;&]+/).map(s => s.trim()).filter(Boolean);
  }

  function getTeacherAuthorizedGrades() {
    const sections = getTeacherSections();
    const grades = new Set();
    sections.forEach(sec => {
      const match = sec.match(/Grade\s*(\d+)/i);
      if (match) {
        grades.add(`Grade ${match[1]}`);
      } else {
        const numMatch = sec.match(/(\d+)/);
        if (numMatch) grades.add(`Grade ${numMatch[1]}`);
      }
    });
    // If teacher is admin or has no specific grade sections assigned, provide standard 1-12
    if (State.teacher?.role === "admin" || !grades.size) {
      for (let i = 1; i <= 12; i++) grades.add(`Grade ${i}`);
    }
    return Array.from(grades).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(b.replace(/\D/g, ""), 10) || 0;
      return numA - numB;
    });
  }

  function initEnrollment(teacher) {
    State.teacher = teacher;
    listenToSettings();
    populateEnrollmentControls();
    listenToTeacherEnrollments();
    bindEvents();
  }

  function populateEnrollmentControls() {
    const secSelect = $("#enroll-section-select");
    const subSelect = $("#enroll-subject-select");
    const filterSec = $("#enroll-filter-section");
    const sections = getTeacherSections();
    const subjects = getTeacherSubjects();

    if (secSelect) {
      secSelect.innerHTML = sections.length
        ? sections.map(sec => `<option value="${escapeAttr(sec)}">${escapeHtml(sec)}</option>`).join("")
        : '<option value="">No sections assigned</option>';
    }

    if (filterSec) {
      filterSec.innerHTML = `<option value="">All my sections</option>` +
        sections.map(sec => `<option value="${escapeAttr(sec)}">${escapeHtml(sec)}</option>`).join("");
    }

    if (subSelect) {
      subSelect.innerHTML = subjects.length
        ? subjects.map(sub => `<option value="${escapeAttr(sub)}">${escapeHtml(sub)}</option>`).join("")
        : '<option value="General">General</option>';
    }

    // Populate walk-in form grade and subject selects
    const walkinGradeSelect = $("#teacher-walkin-grade");
    const walkinSubSelect = $("#teacher-walkin-subject");
    const authorizedGrades = getTeacherAuthorizedGrades();

    if (walkinGradeSelect) {
      walkinGradeSelect.innerHTML = `<option value="">Select Grade Level</option>` +
        authorizedGrades.map(g => `<option value="${escapeAttr(g)}">${escapeHtml(g)}</option>`).join("");
    }

    if (walkinSubSelect) {
      walkinSubSelect.innerHTML = subjects.length
        ? subjects.map(sub => `<option value="${escapeAttr(sub)}">${escapeHtml(sub)}</option>`).join("")
        : '<option value="General">General</option>';
    }
  }

  function switchEnrollmentTab(tabKey) {
    const tabSearch = $("#tab-enroll-search");
    const tabWalkin = $("#tab-enroll-walkin");
    const panelSearch = $("#panel-enroll-search");
    const panelWalkin = $("#panel-enroll-walkin");

    if (tabKey === "walkin") {
      tabSearch?.classList.remove("active");
      tabSearch?.setAttribute("aria-selected", "false");
      tabWalkin?.classList.add("active");
      tabWalkin?.setAttribute("aria-selected", "true");
      panelSearch?.classList.add("hidden");
      panelWalkin?.classList.remove("hidden");
    } else {
      tabWalkin?.classList.remove("active");
      tabWalkin?.setAttribute("aria-selected", "false");
      tabSearch?.classList.add("active");
      tabSearch?.setAttribute("aria-selected", "true");
      panelWalkin?.classList.add("hidden");
      panelSearch?.classList.remove("hidden");
    }
  }

  let activeWalkinQrCode = null;
  let currentWalkinStudent = null;
  let walkinSelectedPhoto = null;
  let walkinPhotoObjectUrl = "";
  let walkinCameraStream = null;

  function showSelectedWalkinPhoto(fileOrBlob) {
    if (!fileOrBlob) return;
    walkinSelectedPhoto = fileOrBlob;
    const preview = $("#teacher-walkin-photo-preview");
    const nameEl = $("#teacher-walkin-photo-name");
    const removeBtn = $("#btn-walkin-remove-photo");
    const errorEl = $("#teacher-walkin-photo-error");
    if (errorEl) errorEl.textContent = "";

    if (walkinPhotoObjectUrl) {
      try { URL.revokeObjectURL(walkinPhotoObjectUrl); } catch (_) {}
    }
    walkinPhotoObjectUrl = URL.createObjectURL(fileOrBlob);

    if (preview) {
      preview.src = walkinPhotoObjectUrl;
      preview.classList.remove("hidden");
    }
    if (nameEl) {
      nameEl.textContent = fileOrBlob.name || "Photo ready for ID card";
    }
    if (removeBtn) {
      removeBtn.classList.remove("hidden");
    }
  }

  function clearWalkinPhoto() {
    walkinSelectedPhoto = null;
    if (walkinPhotoObjectUrl) {
      try { URL.revokeObjectURL(walkinPhotoObjectUrl); } catch (_) {}
      walkinPhotoObjectUrl = "";
    }
    const preview = $("#teacher-walkin-photo-preview");
    const nameEl = $("#teacher-walkin-photo-name");
    const removeBtn = $("#btn-walkin-remove-photo");
    const cameraInput = $("#teacher-walkin-photo-camera");
    const libraryInput = $("#teacher-walkin-photo-library");
    const errorEl = $("#teacher-walkin-photo-error");

    if (preview) {
      preview.src = "";
      preview.classList.add("hidden");
    }
    if (nameEl) {
      nameEl.textContent = "Take or upload a clear photo for the official Student ID.";
    }
    if (removeBtn) {
      removeBtn.classList.add("hidden");
    }
    if (cameraInput) cameraInput.value = "";
    if (libraryInput) libraryInput.value = "";
    if (errorEl) errorEl.textContent = "";
  }

  function compressWalkinPhoto(fileOrBlob, maxDim = 480, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          if (w > maxDim || h > maxDim) {
            if (w >= h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(fileOrBlob);
    });
  }

  async function openWalkinCamera() {
    const modal = $("#walkin-camera-modal");
    const video = $("#walkin-camera-video");
    const status = $("#walkin-camera-status");
    if (!modal || !video) return;

    modal.classList.remove("hidden");
    modal.classList.add("flex");
    if (status) status.textContent = "Requesting camera access...";

    try {
      if (walkinCameraStream) {
        walkinCameraStream.getTracks().forEach(t => t.stop());
      }
      walkinCameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false
      });
      video.srcObject = walkinCameraStream;
      await video.play();
      if (status) status.textContent = "Camera active. Center student's face and click capture.";
    } catch (err) {
      console.warn("[openWalkinCamera] camera error:", err);
      if (status) status.textContent = "Could not access camera: " + (err.message || "Permission denied");
      Toast.error("Camera access failed. Please allow camera permissions or upload an image file.");
    }
  }

  function closeWalkinCamera() {
    const modal = $("#walkin-camera-modal");
    const video = $("#walkin-camera-video");
    if (walkinCameraStream) {
      walkinCameraStream.getTracks().forEach(t => t.stop());
      walkinCameraStream = null;
    }
    if (video) video.srcObject = null;
    modal?.classList.add("hidden");
    modal?.classList.remove("flex");
  }

  function captureWalkinPhoto() {
    const video = $("#walkin-camera-video");
    if (!video || !walkinCameraStream) {
      return Toast.error("Camera is not running.");
    }
    const canvas = document.createElement("canvas");
    const w = video.videoWidth || 480;
    const h = video.videoHeight || 480;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);

    canvas.toBlob(blob => {
      if (!blob) return Toast.error("Failed to capture image.");
      const file = new File([blob], `student-photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      showSelectedWalkinPhoto(file);
      closeWalkinCamera();
      Toast.success("Student photo captured successfully!");
    }, "image/jpeg", 0.85);
  }

  function autoSuggestWalkinUsername() {
    const userField = $("#teacher-walkin-username");
    if (!userField || userField.dataset.customized === "true") return;
    const fname = String($("#teacher-walkin-fname")?.value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const lname = String($("#teacher-walkin-lname")?.value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (fname || lname) {
      userField.value = `${fname}${lname}`.slice(0, 25);
    }
  }

  async function handleWalkinEnroll(event) {
    event?.preventDefault();
    if (!_settingsLoaded && State.teacher?.role !== "admin") {
      return Toast.info("Verifying enrollment period status. Please wait a moment...");
    }
    if (!_settingsOpen && State.teacher?.role !== "admin") {
      return Toast.error("Enrollment period is currently closed. Only an IT Admin can bypass this restriction.");
    }
    const fname = String($("#teacher-walkin-fname")?.value || "").trim();
    const lname = String($("#teacher-walkin-lname")?.value || "").trim();
    const sid = String($("#teacher-walkin-id")?.value || "").trim();
    const grade = String($("#teacher-walkin-grade")?.value || "").trim();
    const subject = String($("#teacher-walkin-subject")?.value || "").trim();
    const parentName = String($("#teacher-walkin-parent-name")?.value || "").trim();
    const parentEmail = String($("#teacher-walkin-parent-email")?.value || "").trim();
    const parentContact = String($("#teacher-walkin-parent-contact")?.value || "").trim();
    const username = String($("#teacher-walkin-username")?.value || "").trim();
    const password = String($("#teacher-walkin-password")?.value || "").trim() || "student123";

    if (!fname || !lname) return Toast.error("Please enter the student's first and last name.");
    if (!grade) return Toast.error("Please select a target grade level.");
    if (!subject) return Toast.error("Please select a subject.");
    if (password.length < 6) return Toast.error("Password must be at least 6 characters.");

    const authUser = ClassCare.getFirebase()?.auth?.currentUser;
    const teacher = State.teacher || {};
    const teacherUid = authUser?.uid || teacher?.uid;
    if (!teacherUid) {
      return Toast.error("Teacher authentication required. Please sign in again.");
    }
    const btn = $("#btn-teacher-walkin-enroll");
    Utils.setLoading(btn, true);

    try {
      let photoData = "";
      if (walkinSelectedPhoto) {
        try {
          photoData = await compressWalkinPhoto(walkinSelectedPhoto);
        } catch (err) {
          console.warn("[walkin-enroll] photo compression warning:", err);
        }
      }

      const authorizedGrades = getTeacherAuthorizedGrades();
      const res = await ClassCare.DB.manualEnrollStudent({
        studentData: {
          first_name: fname,
          last_name: lname,
          student_id: sid,
          grade_level: grade,
          subject: subject,
          username: username,
          password: password,
          photo_data: photoData,
          parent_name: parentName,
          parent_email: parentEmail,
          parent_contact: parentContact
        },
        enrolledBy: {
          uid: teacherUid,
          name: `${teacher.first_name || ""} ${teacher.last_name || ""}`.trim() || teacher.email || authUser?.email || "Teacher",
          role: teacher.role || "teacher",
          authorized_grades: authorizedGrades,
          subject: subject
        }
      });

      if (!res.success) {
        throw new Error(res.error || "Enrollment could not be completed.");
      }

      if (res.status === "waitlist") {
        Toast.warn(`All sections for ${grade} are at maximum capacity (45/45). Student ${res.student_name} (${res.student_id}) has been placed on the official waitlist. IT Admin has been notified.`);
        $("#form-teacher-walkin-enroll")?.reset();
        clearWalkinPhoto();
        const userField = $("#teacher-walkin-username");
        if (userField) delete userField.dataset.customized;
        populateEnrollmentControls();
        return;
      }

      // Enrolled successfully: display QR Code & ID Card modal
      Toast.success(`Student ${res.student_name} successfully enrolled into ${res.section} (${subject})!`);
      showWalkinQrModal(res);
      $("#form-teacher-walkin-enroll")?.reset();
      clearWalkinPhoto();
      const userField = $("#teacher-walkin-username");
      if (userField) delete userField.dataset.customized;
      populateEnrollmentControls();

      // Update TeacherScannerState if present
      if (window.TeacherScannerState) {
        window.TeacherScannerState.students.set(res.uid, {
          uid: res.uid,
          first_name: fname,
          last_name: lname,
          student_id: res.student_id,
          section: res.section,
          role: "student",
          photo_data: res.photo_data || photoData || ""
        });
        if (res.section) window.TeacherScannerState.sections.add(res.section);
      }

      window.dispatchEvent(new CustomEvent("classcare:enrollment-updated"));
    } catch (err) {
      console.error("[walkin-enroll] error:", err);
      Toast.error(err.message || "Failed to complete walk-in enrollment.");
    } finally {
      Utils.setLoading(btn, false);
    }
  }

  function showWalkinQrModal(studentInfo) {
    currentWalkinStudent = studentInfo;
    const modal = $("#walkin-qr-modal");
    if (!modal) return;

    // Show modal first so layout dimensions and DOM elements exist
    modal.classList.remove("hidden");
    modal.classList.add("flex");

    // 1. Populate Credentials Box
    const credUserEl = $("#walkin-cred-username");
    const credPassEl = $("#walkin-cred-password");
    if (credUserEl) credUserEl.textContent = studentInfo.username || "—";
    if (credPassEl) credPassEl.textContent = studentInfo.password || "student123";

    // 2. Populate Official Student ID Card Elements
    const cardNameEl = $("#walkin-card-name");
    const cardSidEl = $("#walkin-card-sid");
    const cardSecEl = $("#walkin-card-sec");
    const cardStatusEl = $("#walkin-card-status");
    const cardValidityEl = $("#walkin-card-validity");
    const cardAvatarEl = $("#walkin-card-avatar");
    const cardContactEl = $("#walkin-card-parent-contact");
    const cardEmailEl = $("#walkin-card-parent-email");
    const cardUidEl = $("#walkin-card-uid");

    if (cardNameEl) cardNameEl.textContent = studentInfo.student_name || "Student";
    if (cardSidEl) cardSidEl.textContent = studentInfo.student_id || "—";
    if (cardSecEl) cardSecEl.textContent = `${studentInfo.section || "—"}${studentInfo.grade_level ? " (" + studentInfo.grade_level + ")" : ""}`;
    if (cardStatusEl) cardStatusEl.innerHTML = `<span class="status-badge ${studentInfo.status === "waitlist" ? "status-late" : "status-present"}">${studentInfo.status === "waitlist" ? "Waitlisted" : "Enrolled"}</span>`;

    const valid = new Date();
    const endYear = valid.getMonth() < 5 ? valid.getFullYear() : valid.getFullYear() + 1;
    if (cardValidityEl) cardValidityEl.textContent = `Jun ${endYear}`;

    if (cardAvatarEl) {
      if (studentInfo.photo_data) {
        cardAvatarEl.innerHTML = `<img src="${studentInfo.photo_data}" alt="Student Photo" class="w-full h-full object-cover rounded-full" style="width:100%!important;height:100%!important;object-fit:cover!important;border-radius:9999px!important;display:block;" />`;
      } else {
        const initials = [studentInfo.first_name?.[0], studentInfo.last_name?.[0]].filter(Boolean).join("").toUpperCase() || studentInfo.student_name?.slice(0, 2).toUpperCase() || "S";
        cardAvatarEl.textContent = initials;
      }
    }

    // Guardian Contact Hierarchy: Line 1: Phone / Telegram (Name), Line 2: Email
    const rawContact = String(studentInfo.parent_contact || "").trim();
    const rawName = String(studentInfo.parent_name || "").trim();
    const rawEmail = String(studentInfo.parent_email || "").trim();

    let contactLine = "—";
    if (rawContact && rawName) {
      contactLine = `${rawContact} (${rawName})`;
    } else if (rawContact) {
      contactLine = rawContact;
    } else if (rawName) {
      contactLine = rawName;
    }
    if (cardContactEl) cardContactEl.textContent = contactLine;

    if (cardEmailEl) {
      if (rawEmail) {
        cardEmailEl.textContent = rawEmail;
        cardEmailEl.style.display = "block";
      } else {
        cardEmailEl.textContent = "—";
        cardEmailEl.style.display = "none";
      }
    }

    if (cardUidEl) cardUidEl.textContent = `uid: ${studentInfo.uid || "—"}`;

    // 3. Render High-Contrast 152x152 Single QR Code
    const canvasWrap = $("#walkin-qr-canvas");
    if (canvasWrap) {
      canvasWrap.innerHTML = "";
      if (typeof QRCode === "function") {
        const qrText = typeof studentInfo.qr_payload === "string" ? studentInfo.qr_payload : JSON.stringify(studentInfo.qr_payload);
        const tempDiv = document.createElement("div");
        activeWalkinQrCode = new QRCode(tempDiv, {
          text: qrText,
          width: 152,
          height: 152,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.M
        });

        const syncQrImage = () => {
          const cvs = tempDiv.querySelector("canvas");
          const img = tempDiv.querySelector("img");
          let dataUrl = "";
          if (cvs && cvs.width > 0) {
            try { dataUrl = cvs.toDataURL("image/png"); } catch (_) {}
          }
          if (!dataUrl && img && img.src && img.src.startsWith("data:")) {
            dataUrl = img.src;
          }

          if (dataUrl) {
            canvasWrap.innerHTML = `<img src="${dataUrl}" alt="Student QR Code" class="w-[152px] h-[152px] block mx-auto" style="width:152px!important;height:152px!important;display:block!important;margin:0 auto!important;image-rendering:pixelated!important;" />`;
          } else if (cvs) {
            canvasWrap.innerHTML = "";
            cvs.style.display = "block";
            cvs.style.margin = "0 auto";
            canvasWrap.appendChild(cvs);
          } else if (img) {
            canvasWrap.innerHTML = "";
            img.style.display = "block";
            img.style.margin = "0 auto";
            canvasWrap.appendChild(img);
          }
        };

        syncQrImage();
        setTimeout(syncQrImage, 30);
        setTimeout(syncQrImage, 100);
      } else {
        canvasWrap.innerHTML = `<div class="state-panel state-error"><span>QR Code generator not loaded</span></div>`;
      }
    }
  }

  function closeWalkinQrModal() {
    const modal = $("#walkin-qr-modal");
    modal?.classList.add("hidden");
    modal?.classList.remove("flex");
  }

  function downloadWalkinQrPng() {
    const canvasWrap = $("#walkin-qr-canvas");
    const imgOrCanvas = canvasWrap?.querySelector("img") || canvasWrap?.querySelector("canvas");
    if (!imgOrCanvas) return Toast.error("QR Code image is not ready yet.");

    let dataUrl = "";
    if (imgOrCanvas.tagName === "CANVAS") {
      dataUrl = imgOrCanvas.toDataURL("image/png");
    } else if (imgOrCanvas.src) {
      dataUrl = imgOrCanvas.src;
    }

    if (!dataUrl) return Toast.error("Could not capture QR code image.");
    const sid = String(currentWalkinStudent?.student_id || $("#walkin-card-sid")?.textContent || "student").replace(/[^0-9A-Za-z_-]/g, "");
    const link = document.createElement("a");
    link.download = `ClassCare-QR-${sid}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    Toast.success("QR Code downloaded as PNG.");
  }

  async function downloadWalkinIdCardPng() {
    const cardEl = $("#walkin-id-card-inner");
    if (!cardEl) return Toast.error("ID Card preview element not found.");
    if (typeof html2canvas !== "function") return Toast.error("Image export library is unavailable. Refresh the page.");

    const btn = $("#btn-download-walkin-id");
    Utils.setLoading(btn, true);
    Toast.info("Preparing official Student ID Card PNG...");

    try {
      const canvas = await html2canvas(cardEl, {
        backgroundColor: "#ffffff",
        scale: 3,
        useCORS: true,
        allowTaint: true,
        logging: false
      });

      const sid = String(currentWalkinStudent?.student_id || $("#walkin-card-sid")?.textContent || "student").replace(/[^0-9A-Za-z_-]/g, "");
      const link = document.createElement("a");
      link.download = `ClassCare_ID_${sid}.png`;
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      Toast.success("Official Student ID Card downloaded as PNG!");
    } catch (err) {
      console.error("[downloadWalkinIdCardPng] error:", err);
      Toast.error("Could not download Student ID. Please try again.");
    } finally {
      Utils.setLoading(btn, false);
    }
  }

  let _eventsBound = false;
  function bindEvents() {
    if (_eventsBound) return;
    _eventsBound = true;

    $("#tab-enroll-search")?.addEventListener("click", () => switchEnrollmentTab("search"));
    $("#tab-enroll-walkin")?.addEventListener("click", () => switchEnrollmentTab("walkin"));
    $("#form-teacher-walkin-enroll")?.addEventListener("submit", handleWalkinEnroll);
    
    // Auto-suggest username when teacher enters student's name
    $("#teacher-walkin-fname")?.addEventListener("input", autoSuggestWalkinUsername);
    $("#teacher-walkin-lname")?.addEventListener("input", autoSuggestWalkinUsername);
    $("#teacher-walkin-username")?.addEventListener("input", function() {
      this.dataset.customized = "true";
    });

    // Walk-in student photo capture and selection
    $("#btn-walkin-take-photo")?.addEventListener("click", () => {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        openWalkinCamera();
      } else {
        $("#teacher-walkin-photo-camera")?.click();
      }
    });
    $("#btn-walkin-choose-photo")?.addEventListener("click", () => {
      $("#teacher-walkin-photo-library")?.click();
    });
    $("#teacher-walkin-photo-camera")?.addEventListener("change", function () {
      if (this.files && this.files[0]) {
        showSelectedWalkinPhoto(this.files[0]);
      }
    });
    $("#teacher-walkin-photo-library")?.addEventListener("change", function () {
      if (this.files && this.files[0]) {
        showSelectedWalkinPhoto(this.files[0]);
      }
    });
    $("#btn-walkin-remove-photo")?.addEventListener("click", clearWalkinPhoto);
    $("#btn-capture-walkin-photo")?.addEventListener("click", captureWalkinPhoto);
    $("#btn-cancel-walkin-camera")?.addEventListener("click", closeWalkinCamera);
    document.querySelectorAll("[data-close-walkin-camera]").forEach(el => {
      el.addEventListener("click", closeWalkinCamera);
    });

    document.querySelectorAll("[data-close-walkin-qr]").forEach(el => {
      el.addEventListener("click", closeWalkinQrModal);
    });
    $("#btn-download-walkin-qr")?.addEventListener("click", downloadWalkinQrPng);
    $("#btn-download-walkin-id")?.addEventListener("click", downloadWalkinIdCardPng);

    $("#btn-search-student")?.addEventListener("click", handleSearch);
    $("#enroll-student-search")?.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleSearch();
      }
    });
    $("#btn-confirm-enroll")?.addEventListener("click", handleEnroll);
    $("#enroll-filter-section")?.addEventListener("change", renderEnrolledTable);
    $("#enroll-filter-search")?.addEventListener("input", renderEnrolledTable);
  }

  async function handleSearch() {
    const query = String($("#enroll-student-search")?.value || "").trim();
    if (!query) return Toast.warn("Enter a Student ID or name to search.");
    const btn = $("#btn-search-student");
    Utils.setLoading(btn, true);
    State.currentFoundStudent = null;
    hideStudentPreview();

    try {
      let match = null;
      // 1. Try exact student_id lookup
      const idSnap = await ClassCare.DB.users
        .where("role", "==", "student")
        .where("student_id", "==", query)
        .limit(1)
        .get();

      if (!idSnap.empty) {
        match = { uid: idSnap.docs[0].id, ...idSnap.docs[0].data() };
      } else {
        // 2. Try query all students or search in TeacherScannerState
        const queryLower = query.toLowerCase();
        if (window.TeacherScannerState?.students?.size) {
          for (const s of window.TeacherScannerState.students.values()) {
            const fullName = `${s.first_name || ""} ${s.last_name || ""}`.toLowerCase();
            if (String(s.student_id || "").toLowerCase() === queryLower || fullName.includes(queryLower)) {
              match = s;
              break;
            }
          }
        }
        if (!match) {
          const fallbackSnap = await ClassCare.DB.users
            .where("role", "==", "student")
            .limit(100)
            .get();
          fallbackSnap.forEach(doc => {
            const data = doc.data() || {};
            const fullName = `${data.first_name || ""} ${data.last_name || ""}`.toLowerCase();
            const sid = String(data.student_id || "").toLowerCase();
            if (!match && (sid === queryLower || fullName.includes(queryLower))) {
              match = { uid: doc.id, ...data };
            }
          });
        }
      }

      if (!match) {
        Toast.warn(`No registered student found matching "${query}".`);
        return;
      }

      State.currentFoundStudent = match;
      showStudentPreview(match);
      Toast.success(`Found ${match.first_name || ""} ${match.last_name || ""} (${match.student_id || "No ID"})`);
    } catch (err) {
      console.error("[enrollment] search failed:", err);
      Toast.error("Error searching for student. Please try again.");
    } finally {
      Utils.setLoading(btn, false);
    }
  }

  function showStudentPreview(student) {
    const card = $("#enroll-student-card");
    if (!card) return;
    const avatar = $("#enroll-student-avatar");
    const name = $("#enroll-student-name");
    const idEl = $("#enroll-student-id");
    const secEl = $("#enroll-student-curr-sec");

    if (avatar) {
      avatar.innerHTML = student.photo_data
        ? `<img src="${escapeAttr(student.photo_data)}" alt="${escapeAttr(student.first_name || "Student")}" />`
        : escapeHtml([student.first_name?.[0], student.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "S");
    }
    if (name) name.textContent = `${student.first_name || ""} ${student.last_name || ""}`.trim() || "Student";
    if (idEl) idEl.textContent = `Student ID: ${student.student_id || "—"}`;
    if (secEl) secEl.textContent = `Registered Section: ${student.section || "Not assigned"}`;

    card.classList.remove("hidden");
  }

  function hideStudentPreview() {
    const card = $("#enroll-student-card");
    if (card) card.classList.add("hidden");
  }

  async function handleEnroll() {
    if (!_settingsLoaded && State.teacher?.role !== "admin") {
      return Toast.info("Verifying enrollment period status. Please wait a moment...");
    }
    if (!_settingsOpen && State.teacher?.role !== "admin") {
      return Toast.error("Enrollment period is currently closed. Only an IT Admin can bypass this restriction.");
    }
    const student = State.currentFoundStudent;
    if (!student) return Toast.warn("Please search and select a student first.");
    const secSelect = $("#enroll-section-select");
    const subSelect = $("#enroll-subject-select");
    const preferredSection = secSelect?.value || "";
    const subject = subSelect?.value || "";

    if (!preferredSection) return Toast.warn("Select an assigned section for enrollment.");
    if (!subject) return Toast.warn("Select or enter a subject for enrollment.");

    const authUser = ClassCare.getFirebase()?.auth?.currentUser;
    const teacher = State.teacher || {};
    const teacherUid = authUser?.uid || teacher?.uid;
    if (!teacherUid) {
      return Toast.error("Teacher authentication required. Please sign in again.");
    }
    const btn = $("#btn-confirm-enroll");
    Utils.setLoading(btn, true);

    const gradeMatch = preferredSection.match(/Grade\s*(\d+)/i);
    const gradeLevel = gradeMatch ? gradeMatch[1] : "";
    const gradeStr = gradeMatch ? gradeMatch[0] : preferredSection;

    let finalSection = preferredSection;
    let wasRerouted = false;

    try {
      // 1. Capacity check + spill-over routing
      const prefInfo = await ClassCare.DB.getSectionCount(preferredSection);
      if (prefInfo.available <= 0) {
        if (!gradeLevel) {
          Toast.error(`Section ${preferredSection} is full and no grade-level spill routing is available.`);
          return;
        }
        const spill = await ClassCare.DB.findAvailableSectionForGrade(gradeLevel, preferredSection);
        if (!spill || !spill.section) {
          Toast.error(`All sections for ${gradeStr} are at full capacity. Cannot enroll.`);
          return;
        }
        finalSection = spill.section;
        wasRerouted = finalSection !== preferredSection;
        Toast.warn(`${preferredSection} is full (${prefInfo.count}/${prefInfo.capacity}). Student routed to ${finalSection}.`);
      }

      // 2. Detect existing enrollment so we don't double-increment counters
      const docId = ClassCare.DB.enrollmentDocId(student.uid, finalSection, subject);
      let alreadyEnrolled = false;
      try {
        const existingSnap = await ClassCare.DB.enrollments.doc(docId).get();
        alreadyEnrolled = existingSnap.exists;
      } catch (_) { /* ignore */ }

      const payload = {
        studentId: student.uid,
        student_uid: student.uid,
        student_id: student.student_id || "",
        student_name: `${student.first_name || ""} ${student.last_name || ""}`.trim() || student.email || "Student",
        photo_data: student.photo_data || "",
        teacher_uid: teacherUid,
        teacher_id: teacherUid,
        teacher_name: `${teacher.first_name || ""} ${teacher.last_name || ""}`.trim() || teacher.email || authUser?.email || "Teacher",
        section: finalSection,
        grade: gradeStr,
        subject: subject,
        enrolled_at: firebase.firestore.FieldValue.serverTimestamp()
      };

      await ClassCare.DB.enrollments.doc(docId).set(payload, { merge: true });

      // 3. Increment section counter (only if this is a NEW enrollment)
      if (!alreadyEnrolled) {
        try { await ClassCare.DB.incrementSectionCount(finalSection); } catch (cErr) { console.warn("[enrollment] counter increment:", cErr); }
      }

      // Update student user record section so it reflects the new assignment
      try {
        await ClassCare.DB.users.doc(student.uid).set({ section: finalSection }, { merge: true });
      } catch (_) {}

      // Update teacher scanner state immediately
      if (window.TeacherScannerState) {
        window.TeacherScannerState.students.set(student.uid, {
          ...student,
          section: finalSection
        });
        window.TeacherScannerState.sections.add(finalSection);
      }

      // Also create placeholder grade entry in `grades` collection if not existing
      const gradeDocId = ClassCare.DB.gradeDocId(student.uid, finalSection, subject);
      try {
        const gradeSnap = await ClassCare.DB.grades.doc(gradeDocId).get();
        if (!gradeSnap.exists) {
          await ClassCare.DB.grades.doc(gradeDocId).set({
            studentId: student.uid,
            student_uid: student.uid,
            student_id: student.student_id || "",
            student_name: payload.student_name,
            teacher_uid: teacherUid,
            teacher_id: teacherUid,
            teacher_name: payload.teacher_name,
            section: finalSection,
            subject: subject,
            term1: null,
            term2: null,
            term3: null,
            term4: null,
            written_work: null,
            performance_task: null,
            quarterly_assessment: null,
            deped_grade: null,
            updated_at: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      } catch (gErr) {
        console.warn("[enrollment] placeholder grade initialization:", gErr);
      }

      Toast.success(wasRerouted
        ? `Enrolled ${payload.student_name} in ${finalSection} (${subject}) (routed from ${preferredSection}).`
        : `Enrolled ${payload.student_name} in ${finalSection} (${subject})!`);
      hideStudentPreview();
      const searchInput = $("#enroll-student-search");
      if (searchInput) searchInput.value = "";
      window.dispatchEvent(new CustomEvent("classcare:enrollment-updated"));
    } catch (err) {
      console.error("[enrollment] write failed:", err);
      Toast.error(err?.code === "permission-denied"
        ? "Permission denied. Check your teacher permissions."
        : "Failed to enroll student. Please try again.");
    } finally {
      Utils.setLoading(btn, false);
    }
  }

  function listenToTeacherEnrollments() {
    if (State.unsubscribe) { State.unsubscribe(); State.unsubscribe = null; }
    if (State._unsubSectionEnrollments) { State._unsubSectionEnrollments(); State._unsubSectionEnrollments = null; }
    if (State._unsubSectionUsers) { State._unsubSectionUsers(); State._unsubSectionUsers = null; }
    const authUid = ClassCare.getFirebase()?.auth?.currentUser?.uid;
    const teacher = State.teacher;
    const teacherUid = authUid || teacher?.uid;
    if (!teacherUid) return;

    const teacherSections = getTeacherSections();
    const sections = teacherSections;
    const enrolledMap = new Map();

    function syncAndRender() {
      State.enrolledList = Array.from(enrolledMap.values());

      // Merge newly enrolled students into TeacherScannerState.students
      if (window.TeacherScannerState) {
        State.enrolledList.forEach(item => {
          if (!window.TeacherScannerState.students.has(item.student_uid)) {
            window.TeacherScannerState.students.set(item.student_uid, {
              uid: item.student_uid,
              first_name: item.student_name || "Student",
              last_name: "",
              student_id: item.student_id || "—",
              section: item.section || "—",
              role: "student",
              photo_data: item.photo_data || ""
            });
          }
          if (item.section) window.TeacherScannerState.sections.add(item.section);
        });
      }

      renderEnrolledTable();
      window.dispatchEvent(new CustomEvent("classcare:enrollment-updated"));
    }

    try {
      // 1. Listen to enrollments with teacher_uid
      State.unsubscribe = ClassCare.DB.enrollments
        .where("teacher_uid", "==", teacherUid)
        .onSnapshot(snapshot => {
          snapshot.forEach(doc => {
            const data = doc.data() || {};
            const uid = data.student_uid || doc.id;
            enrolledMap.set(uid, { id: doc.id, student_uid: uid, ...data });
          });
          syncAndRender();
        }, err => console.warn("[enrollment] teacher_uid listener:", err));

      // 2. Also listen / fetch for all teacher's sections from enrollments
      if (teacherSections.length) {
        teacherSections.forEach(sec => {
          try {
            ClassCare.DB.enrollments.where("section", "==", sec).onSnapshot(snap => {
              snap.forEach(doc => {
                const data = doc.data() || {};
                const uid = data.student_uid || doc.id;
                if (!enrolledMap.has(uid)) {
                  enrolledMap.set(uid, { id: doc.id, student_uid: uid, ...data });
                }
              });
              syncAndRender();
            }, e => console.warn("[enrollment] section listener:", e));
          } catch (_) {}

          // 3. Also fetch approved / enrolled students from users collection for this section
          try {
            ClassCare.DB.users.where("section", "==", sec).onSnapshot(snap => {
              snap.forEach(doc => {
                const u = doc.data() || {};
                if (u.role && u.role !== "student") return;
                // Only include approved or enrolled students
                if (u.status && u.status !== "approved" && u.status !== "enrolled") return;
                const uid = doc.id;
                if (!enrolledMap.has(uid)) {
                  enrolledMap.set(uid, {
                    id: doc.id,
                    student_uid: uid,
                    student_name: `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.email || "Student",
                    student_id: u.student_id || "—",
                    section: sec,
                    subject: u.subject || "General",
                    photo_data: u.photo_data || "",
                    enrolled_at: u.created_at || null
                  });
                }
              });
              syncAndRender();
            }, e => console.warn("[enrollment] users section listener:", e));
          } catch (_) {}
        });
      }
    } catch (err) {
      console.error("[enrollment] listenToTeacherEnrollments error:", err);
    }
  }

  function renderEnrolledTable() {
    const tbody = $("#enroll-tbody");
    if (!tbody) return;
    const filterSec = String($("#enroll-filter-section")?.value || "").trim().toLowerCase();
    const filterQuery = String($("#enroll-filter-search")?.value || "").trim().toLowerCase();

    let list = State.enrolledList.filter(item => {
      if (filterSec && String(item.section || "").toLowerCase() !== filterSec) return false;
      if (filterQuery) {
        const str = `${item.student_name || ""} ${item.student_id || ""} ${item.subject || ""} ${item.section || ""}`.toLowerCase();
        if (!str.includes(filterQuery)) return false;
      }
      return true;
    });

    // Sort by section then name
    list.sort((a, b) => {
      const secComp = String(a.section || "").localeCompare(String(b.section || ""));
      if (secComp !== 0) return secComp;
      return String(a.student_name || "").localeCompare(String(b.student_name || ""));
    });

    const countEl = $("#enroll-count-badge");
    if (countEl) countEl.textContent = `${list.length} Enrolled`;

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="state-panel state-empty"><strong>No students enrolled yet.</strong><span>Use the search bar above to find and enroll students in your subjects.</span></div></td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(item => {
      const avatar = item.photo_data
        ? `<img src="${escapeAttr(item.photo_data)}" alt="" />`
        : escapeHtml((item.student_name?.[0] || "S").toUpperCase());
      const enrolledDate = item.enrolled_at?.toDate ? item.enrolled_at.toDate().toLocaleDateString() : "Active";

      return `<tr>
        <td>
          <div class="identity-cell">
            <span class="identity-avatar">${avatar}</span>
            <span>
              <span class="identity-name">${escapeHtml(item.student_name || "Student")}</span>
              <span class="identity-meta">${escapeHtml(item.section || "—")}</span>
            </span>
          </div>
        </td>
        <td class="tabular">${escapeHtml(item.student_id || "—")}</td>
        <td><strong>${escapeHtml(item.subject || "General")}</strong></td>
        <td>${escapeHtml(item.section || "—")}</td>
        <td class="tabular">${escapeHtml(enrolledDate)}</td>
        <td class="align-right">
          <button type="button" class="btn btn-ghost btn-sm text-danger" data-drop-enroll="${escapeAttr(item.id)}">Drop</button>
        </td>
      </tr>`;
    }).join("");

    tbody.querySelectorAll("[data-drop-enroll]").forEach(btn => {
      btn.addEventListener("click", () => dropEnrollment(btn.dataset.dropEnroll));
    });
  }

  async function dropEnrollment(enrollmentId) {
    const item = State.enrolledList.find(i => i.id === enrollmentId);
    const label = item ? `${item.student_name} from ${item.subject}` : "this student";
    if (!confirm(`Are you sure you want to drop ${label}?`)) return;

    const section = item?.section || "";
    try {
      await ClassCare.DB.enrollments.doc(enrollmentId).delete();
      // Decrement section counter after successful delete
      if (section) {
        try { await ClassCare.DB.decrementSectionCount(section); } catch (cErr) { console.warn("[enrollment] counter decrement:", cErr); }
      }
      Toast.success(`Dropped ${label}.`);
    } catch (err) {
      console.error("[enrollment] drop failed:", err);
      Toast.error("Failed to drop enrollment.");
    }
  }

  // Hook into teacher login lifecycle
  ClassCare.onCurrentUser(user => {
    if (user?.role === "teacher" || user?.role === "admin") {
      initEnrollment(user);
    }
  });

  window.TeacherEnrollment = {
    getEnrolledList: () => State.enrolledList
  };

  window.addEventListener("pagehide", () => {
    try { closeWalkinCamera(); } catch (_) {}
    try { clearWalkinPhoto(); } catch (_) {}
  });
  window.addEventListener("beforeunload", () => {
    try { closeWalkinCamera(); } catch (_) {}
    try { clearWalkinPhoto(); } catch (_) {}
  });
})();
