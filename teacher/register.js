/* ============================================================
   teacher/register.js — teacher account tab and registration
   ============================================================ */
(function () {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const loginTab = $("#teacher-tab-login"); const registerTab = $("#teacher-tab-register"); const loginForm = $("#form-login"); const registerForm = $("#form-teacher-register");
  function showTab(tab) {
    const login = tab === "login"; loginForm?.classList.toggle("hidden", !login); registerForm?.classList.toggle("hidden", login); loginTab?.classList.toggle("active", login); registerTab?.classList.toggle("active", !login); loginTab?.setAttribute("aria-selected", login ? "true" : "false"); registerTab?.setAttribute("aria-selected", login ? "false" : "true");
  }
  loginTab?.addEventListener("click", () => showTab("login")); registerTab?.addEventListener("click", () => showTab("register"));
  showTab("login");

  function setupTermsAndConditions() {
    const scrollContainer = $("#teacher-terms-scroll");
    const checkbox = $("#teacher-terms-checkbox");
    const checkboxRow = $("#teacher-terms-checkbox-row");
    const hint = $("#teacher-terms-hint");
    const registerButton = $("#btn-teacher-register");
    if (!scrollContainer || !checkbox || !checkboxRow || !hint) return;

    let termsRead = false;

    function syncRegisterButton() {
      if (!registerButton) return;
      registerButton.disabled = !(termsRead && checkbox.checked);
    }

    function checkScrollBottom() {
      if (termsRead) return;
      const threshold = 4;
      const distance = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight;
      if (distance <= threshold) {
        termsRead = true;
        checkbox.disabled = false;
        checkboxRow.classList.add("is-enabled");
        hint.classList.add("is-read");
        hint.innerHTML = '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><span>Read</span>';
        syncRegisterButton();
      }
    }

    checkbox.addEventListener("change", syncRegisterButton);
    scrollContainer.addEventListener("scroll", checkScrollBottom, { passive: true });
    requestAnimationFrame(() => { syncRegisterButton(); checkScrollBottom(); });
    window.addEventListener("load", () => setTimeout(() => { checkScrollBottom(); syncRegisterButton(); }, 120));
  }
  setupTermsAndConditions();

  registerForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const termsCheckbox = $("#teacher-terms-checkbox");
    if (!termsCheckbox || !termsCheckbox.checked) {
      event.stopImmediatePropagation();
      Toast.warn("Please scroll to the bottom of the Terms and Conditions and check the box to proceed.");
      return;
    }
    const values = Utils.validateForm(registerForm, {
      first_name: value => !Utils.sanitizeText(value) ? "Enter your first name." : null,
      last_name: value => !Utils.sanitizeText(value) ? "Enter your last name." : null,
      username: value => !/^[a-zA-Z0-9._-]{3,30}$/.test(String(value || "").trim()) ? "Use a valid username." : null,
      position: value => !Utils.sanitizeText(value) ? "Enter your position." : null,
      subject: value => !Utils.sanitizeText(value) ? "Enter subjects handled." : null,
      email: value => !Utils.isEmail(value) ? "Enter a valid email address." : null,
      password: value => String(value || "").length < 6 ? "Use at least 6 characters." : null
    });
    if (!values) return;

    const button = $("#btn-teacher-register");
    Utils.setLoading(button, true);
    try {
      const services = ClassCare.getFirebase();
      if (!services?.auth) throw Object.assign(new Error("Firebase is unavailable."), { code: "service-unavailable" });

      // Use an isolated Firebase app instance to avoid overwriting/resetting active Admin sessions in other tabs
      let regApp = null;
      try {
        const config = window.CLASSCARE_CONFIG?.firebase;
        if (config && typeof firebase !== "undefined" && typeof firebase.initializeApp === "function") {
          regApp = firebase.apps?.find(a => a.name === "SecondaryTeacherReg") || firebase.initializeApp(config, "SecondaryTeacherReg");
        }
      } catch (appErr) {
        console.warn("[teacher-reg] secondary app initialization notice:", appErr);
      }

      const authInstance = regApp ? regApp.auth() : services.auth;
      const dbInstance = regApp ? regApp.firestore() : services.db;

      const credential = await authInstance.createUserWithEmailAndPassword(
        String(values.email).trim().toLowerCase(),
        String(values.password)
      );

      await dbInstance.collection("users").doc(credential.user.uid).set({
        uid: credential.user.uid,
        email: credential.user.email,
        username: String(values.username).trim().toLowerCase(),
        first_name: Utils.sanitizeText(values.first_name, { max: 30 }),
        last_name: Utils.sanitizeText(values.last_name, { max: 30 }),
        subject: Utils.sanitizeText(values.subject, { max: 120 }),
        position: Utils.sanitizeText(values.position, { max: 40 }),
        section: "",
        assigned_sections: [],
        role: "teacher",
        pending_approval: false,
        created_at: firebase.firestore.FieldValue.serverTimestamp()
      });

      if (regApp) {
        await authInstance.signOut().catch(() => {});
      }

      registerForm.reset();
      const termsBox = $("#teacher-terms-checkbox");
      if (termsBox) termsBox.checked = false;
      const termsRow = $("#teacher-terms-checkbox-row");
      if (termsRow) termsRow.classList.remove("is-enabled");

      Toast.success("Teacher account created! You can now log in to the Teacher portal.");
      setTimeout(() => {
        showTab("login");
        const loginEmail = $("#teacher-login-email");
        if (loginEmail) loginEmail.value = String(values.email).trim().toLowerCase();
      }, 1200);
    } catch (error) {
      console.error("[teacher-registration] failed:", error);
      Toast.error(String(error?.code || "").includes("email-already") ? "That email is already registered. Sign in instead." : error.message || "Teacher registration failed.");
    } finally {
      Utils.setLoading(button, false);
    }
  });
})();
