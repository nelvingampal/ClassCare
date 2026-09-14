/* ============================================================
   student/register.js — student auth, photo capture, and Student ID
   MODIFIED: Rebranded CampusApp → ClassCare
   ============================================================ */
(function () {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const tabBtnRegister = $("#tab-btn-register");
  const tabBtnLogin = $("#tab-btn-login");
  const formRegister = $("#form-register");
  const formLogin = $("#form-login");
  const publicView = $("#public-view");
  const appShell = $("#app-shell");
  const viewDashboard = $("#view-dashboard");
  const cameraInput = $("#student-photo-camera");
  const libraryInput = $("#student-photo-library");
  const photoPreview = $("#student-photo-preview");
  const photoName = $("#student-photo-name");
  let selectedPhoto = null;
  let photoObjectUrl = "";
  let cameraStream = null;
  let currentUser = null;

  function initialsOf(user) { return [user?.first_name?.[0], user?.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "S"; }
  function normalizeUsername(value) { return String(value || "").trim().toLowerCase(); }
  function firebaseLoginId(username) { return `${normalizeUsername(username)}@students.classcare.local`; }
  function loginIdentifier(value) { const normalized = normalizeUsername(value); return normalized.includes("@") ? normalized : firebaseLoginId(normalized); }

  function showFieldError(key, message) {
    const input = formRegister?.querySelector(`[name="${CSS.escape(key)}"]`);
    if (input) Utils.setFieldError(input, message);
  }
  function clearPhotoError() { const error = $("#student-photo-error"); if (error) error.textContent = ""; }
  function setPhotoError(message) { const error = $("#student-photo-error"); if (error) error.textContent = message || ""; }

  function showSelectedPhoto(input) {
    const file = input?.files?.[0];
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) {
      setPhotoError("Choose an image file.");
      return;
    }
    selectedPhoto = file;
    if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
    photoObjectUrl = URL.createObjectURL(file);
    if (photoPreview) {
      photoPreview.src = photoObjectUrl;
      photoPreview.alt = "Selected student photo";
      photoPreview.classList.remove("hidden");
    }
    if (photoName) photoName.textContent = file.name || "Photo selected";
    clearPhotoError();
  }

  async function openPhotoCamera() {
    const modal = $("#photo-camera-modal");
    const video = $("#photo-camera-video");
    const status = $("#photo-camera-status");
    modal?.classList.remove("hidden"); modal?.classList.add("flex");
    if (!navigator.mediaDevices?.getUserMedia) {
      status.textContent = "Camera access is unavailable. Choose a file instead.";
      return;
    }
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      video.srcObject = cameraStream;
      status.textContent = "Position your face inside the frame.";
    } catch (error) {
      status.textContent = error?.name === "NotAllowedError" ? "Camera access is blocked. Allow it, then try again." : "Camera is unavailable. Choose a file instead.";
      Toast.error(status.textContent);
    }
  }
  function closePhotoCamera() {
    cameraStream?.getTracks?.().forEach(track => track.stop());
    cameraStream = null;
    const video = $("#photo-camera-video");
    if (video) video.srcObject = null;
    const modal = $("#photo-camera-modal");
    modal?.classList.add("hidden"); modal?.classList.remove("flex");
  }
  function capturePhoto() {
    const video = $("#photo-camera-video");
    if (!cameraStream || !video?.videoWidth) return Toast.warn("Wait for the camera preview, then try again.");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return Toast.error("Could not capture the photo.");
      selectedPhoto = new File([blob], "student-camera-photo.jpg", { type: "image/jpeg" });
      if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
      photoObjectUrl = URL.createObjectURL(selectedPhoto);
      photoPreview.src = photoObjectUrl;
      photoPreview.alt = "Captured student photo";
      photoPreview.classList.remove("hidden");
      photoName.textContent = "Photo captured from camera";
      clearPhotoError();
      closePhotoCamera();
    }, "image/jpeg", .88);
  }

  function showTab(which) {
    const register = which === "register";
    tabBtnRegister?.classList.toggle("active", register);
    tabBtnLogin?.classList.toggle("active", !register);
    tabBtnRegister?.setAttribute("aria-selected", register ? "true" : "false");
    tabBtnLogin?.setAttribute("aria-selected", register ? "false" : "true");
    formRegister?.classList.toggle("hidden", !register);
    formLogin?.classList.toggle("hidden", register);
    formRegister?.setAttribute("aria-hidden", register ? "false" : "true");
    formLogin?.setAttribute("aria-hidden", register ? "true" : "false");
    if (register && typeof window.__syncTermsAndConditions === "function") {
      window.__syncTermsAndConditions();
    }
  }

  function showGuest(message = "") {
    currentUser = null;
    publicView?.classList.remove("hidden");
    appShell?.classList.add("hidden");
    viewDashboard?.classList.add("hidden");
    document.body.classList.add("public-page");
    ClassCareUI?.setAuthState(false);
    if (message) Toast.error(message);
  }
  function showDashboard(user) {
    currentUser = user;
    publicView?.classList.add("hidden");
    appShell?.classList.remove("hidden");
    viewDashboard?.classList.remove("hidden");
    document.body.classList.remove("public-page");
    ClassCareUI?.setAuthState(true);
    const chip = $("#user-chip");
    chip?.classList.remove("hidden");
    $("#user-name")?.replaceChildren(document.createTextNode(`${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email || "Student"));
    const avatar = $("#user-avatar"); if (avatar) avatar.textContent = initialsOf(user);
    renderIdCard(user);
    renderProfile(user);
  }

  function isPendingStudent(user) {
    return user?.role === "student" && user.pending_approval === true;
  }

  function showPendingApproval(user) {
    showDashboard(user);
    document.body.dataset.studentApproval = "pending";
    document.querySelectorAll(".classcare-nav-item, .app-sidebar .nav-link").forEach(link => {
      const href = link.getAttribute("href") || "";
      const allowed = href === "#student-profile";
      link.classList.toggle("hidden", !allowed);
      link.setAttribute("aria-hidden", allowed ? "false" : "true");
    });
    document.querySelectorAll(".student-tab-panel").forEach(panel => panel.classList.add("hidden"));
    $("#tab-student-profile")?.classList.remove("hidden");
    document.querySelectorAll(".classcare-nav-item, .app-sidebar .nav-link").forEach(link => {
      link.classList.toggle("active", (link.getAttribute("href") || "") === "#student-profile");
    });
    if (location.hash !== "#student-profile") history.replaceState(null, "", "#student-profile");
    let notice = $("#student-pending-approval-notice");
    if (!notice) {
      notice = document.createElement("div");
      notice.id = "student-pending-approval-notice";
      notice.className = "state-panel state-info";
      notice.style.marginBottom = "16px";
      $("#view-dashboard")?.prepend(notice);
    }
    notice.innerHTML = "<strong>Account pending administrator approval</strong><span>Your account request was received. An administrator must verify your identity and assign your section before Student ID, attendance, check-in, enrollment, and concern tools become available.</span>";
    const saveBtn = $("#btn-save-profile");
    if (saveBtn) saveBtn.disabled = true;
  }

  function clearPendingApprovalState() {
    document.body.dataset.studentApproval = "approved";
    $("#student-pending-approval-notice")?.remove();
    document.querySelectorAll(".classcare-nav-item, .app-sidebar .nav-link").forEach(link => {
      link.classList.remove("hidden");
      link.setAttribute("aria-hidden", "false");
    });
  }

  function authErrorMessage(error, action) {
    const code = String(error?.code || "");
    if (code.includes("configuration-not-found") || code.includes("operation-not-allowed")) return "Email/password sign-in is not enabled in Firebase yet.";
    if (code.includes("unauthorized-domain")) return "This site is not authorized in Firebase. Add localhost to Authorized domains.";
    if (code.includes("network-request-failed")) return "Firebase cannot be reached. Check your connection and try again.";
    if (code.includes("invalid-api-key") || code.includes("app-not-authorized")) return "Firebase configuration is invalid. Check js/config.js.";
    return error?.message || `${action} failed. Check your connection.`;
  }

  function setupTermsAndConditions() {
    const scrollContainer = $("#student-terms-scroll");
    const checkbox = $("#student-terms-checkbox");
    const checkboxRow = $("#student-terms-checkbox-row");
    const hint = $("#student-terms-hint");
    const registerButton = $("#btn-do-register");
    if (!scrollContainer || !checkbox || !checkboxRow || !hint) return;

    let termsRead = false;

    function syncRegisterButton() {
      const isAllowed = termsRead && checkbox.checked;
      if (registerButton) {
        registerButton.disabled = !isAllowed;
        if (!isAllowed) {
          registerButton.setAttribute("aria-disabled", "true");
        } else {
          registerButton.removeAttribute("aria-disabled");
        }
      }
    }

    function checkScrollBottom() {
      if (termsRead) return;
      // Guard against hidden or unrendered state (clientHeight is 0)
      if (!scrollContainer || scrollContainer.clientHeight === 0 || scrollContainer.scrollHeight === 0) return;
      if (scrollContainer.scrollHeight <= scrollContainer.clientHeight + 40) return;

      const threshold = 15;
      const distance = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight;
      // Must scroll significantly down and reach the bottom
      if (distance <= threshold && scrollContainer.scrollTop > 80) {
        termsRead = true;
        checkbox.disabled = false;
        checkboxRow.classList.add("is-enabled");
        hint.classList.add("is-read");
        hint.innerHTML = '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><span>Read</span>';
        syncRegisterButton();
      }
    }

    window.__syncTermsAndConditions = function() {
      if (!termsRead) {
        checkbox.checked = false;
        checkbox.disabled = true;
        checkboxRow.classList.remove("is-enabled");
        hint.classList.remove("is-read");
        hint.innerHTML = '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14m0 0 5-5m-5 5-5-5"/></svg><span>Scroll to read</span>';
      }
      syncRegisterButton();
    };

    // Prevent clicking the disabled or unagreed button
    registerButton?.addEventListener("click", event => {
      if (!termsRead) {
        event.preventDefault();
        event.stopPropagation();
        Toast.warn("Please scroll to the bottom of the Terms and Conditions to read them first.");
        scrollContainer.focus();
        return;
      }
      if (!checkbox.checked) {
        event.preventDefault();
        event.stopPropagation();
        Toast.warn("Please check the box to agree to the Terms and Conditions.");
        checkbox.focus();
        return;
      }
    });

    checkbox.addEventListener("change", syncRegisterButton);
    scrollContainer.addEventListener("scroll", checkScrollBottom, { passive: true });

    // Initial state setup: keep strictly disabled until scrolled
    window.__syncTermsAndConditions();
  }
  setupTermsAndConditions();

  formRegister?.addEventListener("submit", async event => {
    event.preventDefault();
    const termsCheckbox = $("#student-terms-checkbox");
    if (!termsCheckbox || !termsCheckbox.checked || termsCheckbox.disabled) {
      event.preventDefault();
      event.stopImmediatePropagation();
      Toast.warn("Please scroll to the bottom of the Terms and Conditions and check the box to proceed.");
      return;
    }
    const clean = Utils.validateForm(formRegister, {
      first_name: value => !Utils.sanitizeText(value) ? "Enter your first name." : null,
      last_name: value => !Utils.sanitizeText(value) ? "Enter your last name." : null,
      student_id: value => !Utils.isStudentId(value) ? "Use 4–20 letters, numbers, or dashes." : null,
      username: value => !/^[a-zA-Z0-9._-]{3,30}$/.test(normalizeUsername(value)) ? "Use 3–30 letters, numbers, dots, underscores, or dashes." : null,
      password: value => String(value || "").length < 6 ? "Use at least 6 characters." : null,
      parent_name: value => null,
      parent_contact: value => !Utils.sanitizeText(value) ? "Enter a parent or guardian contact." : null,
      parent_email: value => !Utils.isEmail(value) ? "Enter a valid parent or guardian email." : null
    });
    if (!clean) return;
    if (!selectedPhoto || !String(selectedPhoto.type || "").startsWith("image/")) {
      setPhotoError("Add a clear photo before creating your account.");
      Toast.error("Add a clear photo before creating your account.");
      return;
    }
    const button = $("#btn-do-register");
    Utils.setLoading(button, true);
    if (button) button.dataset.defaultLabel = button.textContent;
    button?.replaceChildren(document.createTextNode("Checking details…"));
    try {
      const existingId = await ClassCare.DB.users.where("student_id", "==", Utils.sanitizeText(clean.student_id, { max: 20 })).get();
      if (!existingId.empty) {
        Utils.setLoading(button, false);
        button?.replaceChildren(document.createTextNode("Create account"));
        showFieldError("student_id", "That Student ID is already assigned.");
        Toast.error("That Student ID is already assigned to another account.");
        return;
      }
    } catch (_) {}
    button?.replaceChildren(document.createTextNode("Creating account…"));
    const photoData = await compressPhoto(selectedPhoto);
    if (!photoData) {
      Utils.setLoading(button, false); button?.replaceChildren(document.createTextNode("Create account"));
      return Toast.error("The student photo could not be processed. Choose another image.");
    }
    const username = normalizeUsername(clean.username);
    const authEmail = firebaseLoginId(username);
    const pendingKey = `classcare_pending_student_${authEmail}`;
    let authUserCreated = false;
    sessionStorage.setItem(pendingKey, JSON.stringify({ ...clean, username, photo_data: photoData }));
    try {
      const services = ClassCare.getFirebase();
      if (!services?.auth) throw Object.assign(new Error("Firebase is unavailable."), { code: "service-unavailable" });
      const credential = await services.auth.createUserWithEmailAndPassword(authEmail, clean.password);
      authUserCreated = true;
      await ClassCare.DB.users.doc(credential.user.uid).set({
        uid: credential.user.uid, email: credential.user.email, username,
        first_name: Utils.sanitizeText(clean.first_name, { max: 30 }),
        last_name: Utils.sanitizeText(clean.last_name, { max: 30 }),
        role: "student", student_id: Utils.sanitizeText(clean.student_id, { max: 20 }),
        section: "",
        grade_level: null,
        enrollment_status: "pending",
        pending_approval: true,
        disabled: false,
        parent_name: Utils.sanitizeText(clean.parent_name || "", { max: 60 }),
        parent_contact: Utils.sanitizeTelegramUsername(clean.parent_contact),
        parent_email: String(clean.parent_email || "").trim().toLowerCase(),
        photo_data: photoData, created_at: firebase.firestore.FieldValue.serverTimestamp()
      });
      sessionStorage.removeItem(pendingKey);
      Toast.success("Account request submitted. Please wait for administrator approval.");
    } catch (error) {
      console.error("[student-registration] failed:", error);
      if (!authUserCreated) sessionStorage.removeItem(pendingKey);
      Toast.error(String(error?.code || "").includes("email-already") ? "That username is already registered. Try Sign in." : authErrorMessage(error, "Registration"));
    } finally {
      Utils.setLoading(button, false);
      button?.replaceChildren(document.createTextNode("Create account"));
    }
  });

  formLogin?.addEventListener("submit", async event => {
    event.preventDefault();
    const values = new FormData(formLogin);
    const username = String(values.get("username") || "").trim();
    const password = String(values.get("password") || "");
    if ((!/^[a-zA-Z0-9._-]{3,30}$/.test(normalizeUsername(username)) && !Utils.isEmail(username)) || password.length < 6) return Toast.error("Check your username and password.");
    const button = $("#btn-do-login"); Utils.setLoading(button, true);
    try {
      const services = ClassCare.getFirebase();
      if (!services?.auth) throw Object.assign(new Error("Firebase is unavailable."), { code: "service-unavailable" });
      await services.auth.signInWithEmailAndPassword(loginIdentifier(username), password);
      Toast.success("Signed in.");
    } catch (error) {
      console.error("[student-auth] failed:", error);
      Toast.error(String(error?.code || "").includes("password") || String(error?.code || "").includes("user") ? "Invalid credentials. Check your username and password." : authErrorMessage(error, "Sign-in"));
    } finally { Utils.setLoading(button, false); }
  });

  async function signOut() {
    try { await ClassCare.getFirebase()?.auth?.signOut(); Toast.info("Signed out."); }
    catch (_) { Toast.error("Could not sign out. Check your connection."); }
  }
  $("#btn-logout")?.addEventListener("click", signOut);

  function compressPhoto(file) {
    return new Promise(resolve => {
      if (!file || !String(file.type || "").startsWith("image/")) return resolve("");
      const reader = new FileReader(); reader.onerror = () => resolve("");
      reader.onload = () => {
        const image = new Image(); image.onerror = () => resolve("");
        image.onload = () => {
          const max = 480; const scale = Math.min(1, max / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", .78));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function repairPendingStudentProfile(user) {
    if (!user?.uid || user.__profileError === "permission-denied") return user;
    const key = `classcare_pending_student_${String(user.email || "").toLowerCase()}`;
    const raw = sessionStorage.getItem(key); if (!raw || user.role === "student") return user;
    let pending; try { pending = JSON.parse(raw); } catch (_) { return user; }
    try {
      const profile = {
        uid: user.uid, email: user.email, username: pending.username || String(user.email || "").split("@")[0],
        first_name: Utils.sanitizeText(pending.first_name, { max: 30 }),
        last_name: Utils.sanitizeText(pending.last_name, { max: 30 }),
        student_id: Utils.sanitizeText(pending.student_id, { max: 20 }),
        section: pending.section || user.section || "",
        grade_level: pending.grade_level || user.grade_level || null,
        enrollment_status: pending.enrollment_status || user.enrollment_status || "pending",
        pending_approval: true,
        disabled: false,
        parent_name: Utils.sanitizeText(pending.parent_name || user.parent_name || "", { max: 60 }),
        parent_contact: Utils.sanitizeTelegramUsername(pending.parent_contact),
        parent_email: String(pending.parent_email || "").trim().toLowerCase(),
        photo_data: pending.photo_data || "",
        role: "student", created_at: firebase.firestore.FieldValue.serverTimestamp()
      };
      await ClassCare.DB.users.doc(user.uid).set(profile, { merge: true });
      sessionStorage.removeItem(key); return profile;
    } catch (error) {
      console.error("[student-profile] recovery failed:", error);
      Toast.error(error?.code === "permission-denied" ? "Your account was created, but the profile needs an IT administrator to finish setup." : "Your student profile could not be saved. Try again when connected.");
      return user;
    }
  }

  function renderIdCard(user) {
    $("#id-name")?.replaceChildren(document.createTextNode(`${user.first_name || ""} ${user.last_name || ""}`.trim() || "Student"));
    $("#id-student-id")?.replaceChildren(document.createTextNode(user.student_id || "—"));
    
    // Display assigned section or enrollment status
    const assignedSection = user.section || user.section_name || "";
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

    // Display status badge on ID Card
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

    // Display parent/guardian contact on Student ID
    const rawContact = String(user.parent_contact || user.parent_phone || "").trim();
    const rawName = String(user.parent_name || user.guardian_name || "").trim();
    let emailVal = String(user.parent_email || "").trim();

    let phoneVal = "";
    if (rawContact) {
      if (Utils?.isEmail?.(rawContact) || (rawContact.includes("@") && rawContact.includes("."))) {
        if (!emailVal) emailVal = rawContact;
      } else {
        phoneVal = rawContact;
      }
    }

    let contactLine = "—";
    if (phoneVal && rawName) {
      contactLine = `${phoneVal} (${rawName})`;
    } else if (phoneVal) {
      contactLine = phoneVal;
    } else if (rawName) {
      contactLine = rawName;
    }

    const contactEl = $("#id-parent-contact");
    if (contactEl) {
      contactEl.replaceChildren(document.createTextNode(contactLine));
    }

    const emailEl = $("#id-parent-email");
    if (emailEl) {
      if (emailVal) {
        emailEl.replaceChildren(document.createTextNode(emailVal));
        emailEl.style.display = "block";
      } else {
        emailEl.replaceChildren();
        emailEl.style.display = "none";
      }
    }
    $("#id-uid")?.replaceChildren(document.createTextNode(`uid: ${user.uid || "—"}`));
    const valid = new Date(); const endYear = valid.getMonth() < 5 ? valid.getFullYear() : valid.getFullYear() + 1;
    $("#id-validity")?.replaceChildren(document.createTextNode(`Jun ${endYear}`));
    // Parent email warning banner — warn when no parent_email on file
    const _warnBanner = $("#parent-email-warning");
    if (_warnBanner) {
      const _hasEmail = !!(user.parent_email || "").trim();
      _warnBanner.style.display = _hasEmail ? "none" : "flex";
    }

    const avatar = $("#id-avatar");
    if (avatar) {
      avatar.replaceChildren();
      if (user.photo_data) {
        const image = document.createElement("img");
        image.src = user.photo_data;
        image.alt = `${user.first_name || "Student"} photo`;
        image.className = "w-full h-full object-cover rounded-full";
        image.style.cssText = "width:100%!important;height:100%!important;object-fit:cover!important;border-radius:9999px!important;display:block;";
        avatar.appendChild(image);
      } else {
        avatar.appendChild(document.createTextNode(initialsOf(user)));
      }
    }
    const qr = $("#qr-canvas");
    if (!qr) return;
    qr.replaceChildren();
    if (typeof QRCode !== "function") {
      const state = document.createElement("div"); state.className = "state-panel state-error"; state.textContent = "QR code could not load. Check your connection and reload."; qr.appendChild(state); return;
    }
    // High-resolution, high-contrast QR code for long-distance and low-light camera scanning (152x152, pure black #000000)
    new QRCode(qr, {
      text: JSON.stringify({ v: 1, t: "classcare_id", uid: user.uid, sid: user.student_id || "" }),
      width: 152,
      height: 152,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
    // Remove duplicate <img> element generated by qrcode.js so only the crisp single canvas is displayed
    qr.querySelectorAll("img").forEach(im => im.remove());
    setTimeout(() => { qr.querySelectorAll("img").forEach(im => im.remove()); }, 30);
  }

  async function captureNode(element) {
    if (typeof html2canvas !== "function") throw new Error("ID image export is unavailable while the image library is offline.");
    const previous = element.style.transform;
    element.style.transform = "none";
    element.classList.add("exporting");
    // Ensure duplicate <img> elements inside qr-canvas are removed before capture
    element.querySelectorAll("#qr-canvas img").forEach(im => im.remove());
    try {
      return await html2canvas(element, {
        backgroundColor: "#ffffff",
        scale: 3,
        useCORS: true,
        logging: false,
        ignoreElements: node => node.hasAttribute?.("data-ignore-h2c")
      });
    } finally {
      element.classList.remove("exporting");
      element.style.transform = previous;
    }
  }
  function downloadCanvas(canvas, filename) { const link = document.createElement("a"); link.href = canvas.toDataURL("image/png"); link.download = filename; document.body.appendChild(link); link.click(); link.remove(); }
  $("#btn-dl-qr")?.addEventListener("click", async () => {
    try { Toast.info("Preparing the QR image…"); downloadCanvas(await captureNode($("#qr-wrap")), `${Utils.todayIso()}_QR_ID.png`); Toast.success("QR code downloaded."); }
    catch (error) { console.error(error); Toast.error(error.message || "Could not download the QR code."); }
  });
  $("#btn-dl-id")?.addEventListener("click", async () => {
    try { Toast.info("Preparing the Student ID…"); downloadCanvas(await captureNode($("#id-card-inner")), `${Utils.todayIso()}_ClassCare_ID.png`); Toast.success("Student ID downloaded."); }
    catch (error) { console.error(error); Toast.error(error.message || "Could not download the Student ID."); }
  });

  tabBtnRegister?.addEventListener("click", () => showTab("register"));
  tabBtnLogin?.addEventListener("click", () => showTab("login"));
  $("#link-to-register")?.addEventListener("click", () => showTab("register"));
  $("#link-to-login")?.addEventListener("click", () => showTab("login"));
  showTab("login");
  cameraInput?.addEventListener("change", () => showSelectedPhoto(cameraInput));
  libraryInput?.addEventListener("change", () => showSelectedPhoto(libraryInput));
  $("#btn-take-photo")?.addEventListener("click", openPhotoCamera);
  $("#btn-choose-photo")?.addEventListener("click", () => libraryInput?.click());
  $("#btn-close-camera")?.addEventListener("click", closePhotoCamera);
  $("#btn-cancel-camera")?.addEventListener("click", closePhotoCamera);
  $("#btn-capture-photo")?.addEventListener("click", capturePhoto);
  const cleanupRegisterCamera = () => {
    try { cameraStream?.getTracks?.().forEach(track => track.stop()); } catch (_) {}
    cameraStream = null;
    if (photoObjectUrl) {
      try { URL.revokeObjectURL(photoObjectUrl); } catch (_) {}
      photoObjectUrl = null;
    }
  };
  window.addEventListener("beforeunload", cleanupRegisterCamera);
  window.addEventListener("pagehide", cleanupRegisterCamera);

  function renderProfile(user) {
    if (!user) return;
    const nameEl = $("#profile-student-name");
    const idEl = $("#profile-student-id");
    const gradeEl = $("#profile-student-grade");
    const secEl = $("#profile-student-section");
    const userEl = $("#profile-student-username");
    const parentNameEl = $("#profile-parent-name");
    const emailEl = $("#profile-parent-email");
    const contactEl = $("#profile-parent-contact");
    if (nameEl) nameEl.value = `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Student";
    if (idEl) idEl.value = user.student_id || "—";
    if (gradeEl) gradeEl.value = user.grade_level || "Not Enrolled";
    const assignedSection = user.section || user.section_name || "";
    if (secEl) {
      if (assignedSection) {
        secEl.value = assignedSection;
      } else if (user.enrollment_status === "waitlist" || user.enrollment_status === "Waitlisted") {
        secEl.value = "Waitlisted (Pending section provision)";
      } else {
        secEl.value = "Not Enrolled";
      }
    }
    if (userEl) userEl.value = user.username || user.email || "—";
    if (parentNameEl) parentNameEl.value = user.parent_name || user.guardian_name || "";
    if (emailEl) emailEl.value = user.parent_email || "";
    if (contactEl) contactEl.value = user.parent_contact || "";
  }

  $("#form-student-profile")?.addEventListener("submit", async event => {
    event.preventDefault();
    if (!currentUser?.uid) return Toast.error("Sign in first.");
    if (!ClassCare.canProvisionProfiles()) return Toast.warn('Your profile is read-only. Ask administration to update your contact details.');
    const pName = Utils.sanitizeText($("#profile-parent-name")?.value || "", { max: 60 });
    const pEmail = String($("#profile-parent-email")?.value || "").trim().toLowerCase();
    const pContact = Utils.sanitizeTelegramUsername($("#profile-parent-contact")?.value);
    if (pEmail && !Utils.isEmail(pEmail)) return Toast.error("Please enter a valid parent email address.");
    const btn = $("#btn-save-profile");
    Utils.setLoading(btn, true);
    try {
      await ClassCare.DB.users.doc(currentUser.uid).set({
        parent_name: pName,
        parent_email: pEmail,
        parent_contact: pContact,
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      currentUser.parent_name = pName;
      currentUser.parent_email = pEmail;
      currentUser.parent_contact = pContact;
      renderIdCard(currentUser);
      renderProfile(currentUser);
      Toast.success("Contact details updated successfully.");
    } catch (err) {
      console.error("[student-profile] save failed:", err);
      Toast.error("Could not save contact details. Check your connection.");
    } finally {
      Utils.setLoading(btn, false);
    }
  });

  $("#student-forgot-pwd")?.addEventListener("click", async () => {
    const inputVal = String($("#student-login-username")?.value || "").trim();
    let email = Utils.isEmail(inputVal) ? inputVal : "";
    if (!email) {
      email = prompt("Enter your registered email address (or parent email) to reset your password:", "");
      if (email === null) return;
      email = String(email).trim().toLowerCase();
    }
    if (!email || !Utils.isEmail(email)) {
      return Toast.warn("Please provide a valid email address to receive password reset instructions.");
    }
    try {
      const auth = ClassCare.getFirebase()?.auth;
      if (!auth) throw new Error("Authentication service is unavailable.");
      await auth.sendPasswordResetEmail(email);
      Toast.success("Password reset instructions sent! Check your email inbox.");
    } catch (error) {
      console.error("[student-forgot-pwd] error:", error);
      if (error?.code === "auth/user-not-found") {
        Toast.warn("No account found with that email. If you registered with a username only, ask your teacher or IT administrator to reset your password.");
      } else {
        Toast.error(error?.message || "Could not send reset email. Contact support@classcare.edu.");
      }
    }
  });

  function roleGuard(user) {
    if (!user?.uid || user.role === "student") return true;
    Toast.warn(`This account is assigned to ${user.role || "another workspace"}.`);
    setTimeout(() => location.replace("../index.html"), 700);
    return false;
  }

  ClassCare.onCurrentUser(async user => {
    if (!user) return showGuest();
    // MODIFIED: Error message rebranded from "Campus" → "ClassCare"
    if (user.__profileError) return showGuest("Your ClassCare profile could not be read. Check your connection or ask the IT administrator to verify your access.");
    const repaired = await repairPendingStudentProfile(user);
    if (!roleGuard(repaired)) return;
    if (isPendingStudent(repaired)) return showPendingApproval(repaired);
    clearPendingApprovalState();
    showDashboard(repaired);
  });
})();
