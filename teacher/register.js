/* ============================================================
   teacher/register.js — teacher account tab and registration
   ============================================================ */
(function () {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const loginTab = $("#teacher-tab-login"); const registerTab = $("#teacher-tab-register"); const loginForm = $("#form-login"); const registerForm = $("#form-teacher-register");
  function showTab(tab) {
    const login = tab === "login"; loginForm?.classList.toggle("hidden", !login); registerForm?.classList.toggle("hidden", login); loginTab?.classList.toggle("active", login); registerTab?.classList.toggle("active", !login); loginTab?.setAttribute("aria-selected", login ? "true" : "false"); registerTab?.setAttribute("aria-selected", login ? "false" : "true");
    document.querySelector('#public-view .auth-card')?.scrollTo(0, 0);
    document.querySelector('#public-view .public-main')?.scrollTo(0, 0);
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
    const content = scrollContainer.querySelector('.terms-content');
    const english = content.innerHTML;
    const language = $('#teacher-terms-language');
    const filipino = `<h1>MGA TUNTUNIN AT KONDISYON</h1>
<p><strong>Petsa ng bisa:</strong> Setyembre 2026<br><strong>Pangalan ng aplikasyon:</strong> ClassCare</p>
<p>Maligayang pagdating sa ClassCare, isang aplikasyon para sa pagsubaybay sa pagpasok at pagkahuli ng mga mag-aaral. Dinisenyo ito upang matulungan ang mga paaralan, guro, mag-aaral at magulang na maayos na masubaybayan ang pagpasok sa klase. Gumagamit ito ng mga QR code at teknolohiya sa pag-scan ng QR upang itala ang pagpasok at pagkahuli, at maaari itong magpadala ng mga abiso sa email sa mga nakarehistrong magulang o tagapag-alaga.</p>
<p>Sa pag-access o paggamit ng aplikasyon, sumasang-ayon kang sundin ang mga Tuntunin at Kondisyong ito.</p>
<h3>1. Layunin ng Aplikasyon</h3>
<p>Binuo ang aplikasyon upang:</p><ul><li>Itala ang pagpasok ng mga mag-aaral sa pamamagitan ng pag-scan ng QR code;</li><li>Subaybayan at itala ang pagkahuli;</li><li>Magpanatili ng organisadong digital na talaan ng pagpasok;</li><li>Magbigay ng impormasyon sa pagpasok sa mga awtorisadong guro at kawani ng paaralan; at</li><li>Abisuhan ang mga nakarehistrong magulang o tagapag-alaga kapag naitala ang pagpasok ng kanilang anak.</li></ul>
<p>Para lamang sa edukasyon at pagsubaybay sa pagpasok ang aplikasyon.</p>
<h3>2. QR Code para sa Pagpasok at Pagkahuli</h3>
<p>Maaaring bigyan ang bawat mag-aaral ng natatanging QR code para sa pagtatala ng pagpasok. Kapag na-scan ito, maaaring itala ng sistema ang:</p><ul><li>Pangalan ng mag-aaral;</li><li>Klase o asignatura;</li><li>Petsa ng pagpasok;</li><li>Oras ng pag-scan; at</li><li>Katayuan ng pagpasok, gaya ng Present (pumasok), Late (nahuli), o Absent (hindi pumasok), ayon sa mga patakaran ng paaralan.</li></ul>
<p>Dapat gamitin ng mag-aaral ang sarili lamang niyang QR code. Ipinagbabawal ang:</p><ul><li>Paggamit ng QR code ng ibang mag-aaral;</li><li>Pagpapahintulot sa ibang tao na i-scan ang kanyang QR code;</li><li>Pagbabahagi ng QR code para sa pagtatala ng pagpasok;</li><li>Paggawa o pagbabago ng mga QR code;</li><li>Pagtatangkang manipulahin ang mga talaan ng pagpasok o pagkahuli; o</li><li>Pag-iwas sa mga kontrol ng sistema ng QR scanning.</li></ul>
<h3>3. Mga Talaan ng Pagpasok</h3>
<p>Ang mga talaan ng pagpasok at pagkahuli mula sa aplikasyon ay tumutulong sa mga guro at administrador ng paaralan sa pagsubaybay sa pagpasok ng mga mag-aaral.</p>
<p>Nagtatala ang aplikasyon batay sa impormasyong nakukuha sa QR scanning. Gayunman, maaaring maapektuhan ang pagtatala ng mga problemang teknikal gaya ng maling pag-scan, sirang kagamitan, problema sa internet, o pagkaantala ng sistema.</p>
<p>Kung sa palagay ng mag-aaral ay mali ang kanyang tala ng pagpasok o pagkahuli, dapat niya itong agad ipaalam sa kinauukulang guro o administrador ng paaralan upang masuri.</p>
<h3>4. Mga Abiso sa Email para sa Magulang o Tagapag-alaga</h3>
<p>Maaaring awtomatikong magpadala ng abiso sa email sa nakarehistrong magulang o legal na tagapag-alaga kapag matagumpay na naitala ang pagpasok ng anak. Maaaring kasama sa abiso ang:</p><ul><li>Pangalan ng mag-aaral;</li><li>Klase o asignatura;</li><li>Petsa;</li><li>Oras ng pagpasok; at</li><li>Katayuan ng pagpasok.</li></ul>
<p>Ang mga abisong ito ay tumutulong sa mga magulang o tagapag-alaga na subaybayan ang pagpasok ng kanilang anak at para sa lehitimong layuning pang-edukasyon at pagsubaybay.</p>
<p>Responsibilidad ng magulang o tagapag-alaga na magbigay at magpanatili ng wastong email address. Maaaring hindi maihatid ang abiso kung mali, hindi aktibo, o hindi ma-access ang email address, o kung may problemang teknikal o sa internet.</p>
<h3>5. Impormasyong Kinokolekta</h3>
<p>Upang maibigay ang serbisyo sa pagsubaybay sa pagpasok, maaaring kolektahin at iproseso ang:</p><ul><li>Pangalan ng mag-aaral;</li><li>Numero ng pagkakakilanlan ng mag-aaral;</li><li>Klase, seksiyon, o programa;</li><li>QR code o identifier nito;</li><li>Pangalan ng magulang o tagapag-alaga;</li><li>Email address ng magulang o tagapag-alaga;</li><li>Petsa at oras ng pagpasok;</li><li>Katayuan ng pagpasok at pagkahuli; at</li><li>Iba pang impormasyong kailangan sa pagpapatakbo ng aplikasyon.</li></ul>
<p>Dapat mangolekta lamang ang aplikasyon ng impormasyong kailangan at may kaugnayan sa layunin nito.</p>
<h3>6. Pagkapribado at Proteksiyon ng Impormasyon</h3>
<p>Magsasagawa ang aplikasyon ng makatwirang mga hakbang upang protektahan ang impormasyon ng mag-aaral, magulang at pagpasok laban sa hindi awtorisadong pag-access, pagsisiwalat, pagbabago, pagkawala, o maling paggamit.</p>
<p>Mga awtorisadong indibidwal lamang ang dapat magkaroon ng access sa nakolektang impormasyon para sa lehitimong layuning pang-edukasyon, pang-administratibo, o pagsubaybay sa pagpasok.</p>
<p>Kung naaangkop, ang pagkolekta, pagproseso, pag-iimbak at pagbabahagi ng personal na impormasyon ay dapat sumunod sa Philippine Data Privacy Act of 2012 (Republic Act No. 10173) at sa naaangkop na mga patakaran ng institusyong pang-edukasyon.</p>
<h3>7. Paggamit ng Impormasyon</h3>
<p>Maaaring gamitin ang impormasyon sa pagpasok upang:</p><ul><li>Subaybayan ang pagpasok ng mag-aaral;</li><li>Tukuyin ang mga padron ng pagkahuli;</li><li>Maghanda ng mga ulat ng pagpasok;</li><li>Ipaalam ang pagpasok sa mga nakarehistrong magulang o tagapag-alaga;</li><li>Suportahan ang pamamahala ng pagpasok sa paaralan; at</li><li>Isagawa ang iba pang lehitimong gawaing pang-edukasyon at pang-administratibo.</li></ul>
<p>Hindi dapat gamitin ang impormasyon sa mga layuning walang kaugnayan sa tungkulin ng aplikasyon nang walang angkop na pahintulot.</p>
<h3>8. Mga Responsibilidad ng Gumagamit</h3>
<p>Sumasang-ayon ang mga gumagamit na:</p><ul><li>Magbigay ng tamang impormasyon;</li><li>Gamitin ang aplikasyon para lamang sa layunin nito;</li><li>Panatilihing ligtas ang impormasyon ng account at QR code;</li><li>Huwag ibahagi ang QR code o mga kredensiyal sa pag-login sa hindi awtorisadong tao;</li><li>Iulat ang maling tala ng pagpasok sa kinauukulang kawani ng paaralan;</li><li>Igalang ang pagkapribado ng ibang mag-aaral; at</li><li>Sundin ang naaangkop na mga tuntunin at patakaran ng paaralan.</li></ul>
<h3>9. Mga Ipinagbabawal na Gawain</h3>
<p>Hindi dapat:</p><ul><li>Mamemeke ng impormasyon sa pagpasok;</li><li>Mag-scan ng QR code ng ibang mag-aaral;</li><li>Magbahagi o magpahiram ng QR code;</li><li>Magtangkang pumasok sa account ng iba nang walang pahintulot;</li><li>Baguhin ang talaan ng pagpasok nang walang pahintulot;</li><li>Magtangkang lampasan o gambalain ang QR scanning system;</li><li>Magpasok ng mapaminsalang software o code sa aplikasyon; o</li><li>Gamitin ang aplikasyon para sa labag sa batas o hindi awtorisadong layunin.</li></ul>
<h3>10. Pagiging Available ng Sistema at mga Problemang Teknikal</h3>
<p>Dinisenyo ang aplikasyon para sa maaasahang pagsubaybay sa pagpasok. Gayunman, hindi magagarantiya ang tuloy-tuloy na availability. Maaaring magkaroon ng pansamantalang pagkaantala dahil sa:</p><ul><li>Problema sa koneksiyon sa internet;</li><li>Pagkasira ng device o QR scanner;</li><li>Pagpapanatili ng server o sistema;</li><li>Mga update sa software;</li><li>Mga teknikal na error; o</li><li>Iba pang pangyayaring lampas sa makatwirang kontrol ng mga developer o paaralan.</li></ul>
<p>Kapag pumalya ang sistema, maaaring gumamit ang paaralan ng alternatibong paraan ng pagtatala ng pagpasok.</p>
<h3>11. Katumpakan ng mga Abiso sa Magulang</h3>
<p>Ang mga abiso sa email ay batay sa impormasyong naitala ng aplikasyon. Ang abisong nagsasabing pumasok ang mag-aaral sa klase ay hindi, sa sarili nito, kapalit ng opisyal na talaan ng paaralan.</p>
<p>Kung sa palagay ng magulang o tagapag-alaga ay mali ang abiso, dapat siyang makipag-ugnayan sa kinauukulang guro o administrador ng paaralan.</p>
<h3>12. Account at Access</h3>
<p>Maaaring limitahan ang access sa ilang tampok sa mga awtorisadong mag-aaral, guro, magulang, tagapag-alaga at administrador ng paaralan.</p>
<p>Responsibilidad ng gumagamit na panatilihing lihim ang kanyang mga kredensiyal sa pag-login at agad iulat sa administrador ng aplikasyon ang pinaghihinalaang hindi awtorisadong access.</p>
<h3>13. Pagbabago sa Aplikasyon</h3>
<p>Maaaring baguhin, i-update, suspindihin, o ihinto ng mga developer o awtorisadong administrador ng paaralan ang ilang tampok kung kailangan para sa pagpapanatili, seguridad, pagpapabuti, o pagsunod sa mga patakaran ng institusyon.</p><p>Maaaring abisuhan ang mga gumagamit tungkol sa mahahalagang pagbabago kung naaangkop.</p>
<h3>14. Pagsuspinde o Pagwawakas ng Access</h3>
<p>Maaaring suspindihin o wakasan ang access kung ang gumagamit ay:</p><ul><li>Lumabag sa mga Tuntunin at Kondisyong ito;</li><li>Maling gumamit ng QR attendance system;</li><li>Nagtangkang manipulahin ang talaan ng pagpasok;</li><li>Nagkaroon o nagtangkang magkaroon ng hindi awtorisadong access; o</li><li>Lumabag sa naaangkop na mga tuntunin o patakaran ng paaralan.</li></ul>
<h3>15. Limitasyon ng Pananagutan</h3>
<p>Ang aplikasyon ay isang digital na kasangkapan para sa pagsubaybay sa pagpasok at pagkahuli. Bagaman may makatwirang hakbang para sa katumpakan ng mga talaan, hindi ginagarantiya ng mga developer na palaging walang teknikal na error, pagkaantala, o kamalian ang sistema.</p>
<p>Ang mga opisyal na pasya tungkol sa pagpasok, pagkahuli at kaugnay na usaping akademiko ay nananatiling saklaw ng mga patakaran at proseso ng beripikasyon ng institusyong pang-edukasyon.</p>
<h3>16. Pakikipag-ugnayan at Suporta</h3>
<p>Para sa mga tanong, alalahanin, pagwawasto ng talaan, usapin sa pagkapribado, o tulong teknikal, maaaring makipag-ugnayan sa:</p><ul><li><strong>Administrador ng aplikasyon:</strong> School IT Administration Office</li><li><strong>Email:</strong> support@classcare.edu</li><li><strong>Contact desk:</strong> IT Administration Helpdesk</li></ul>
<h3>17. Pagtanggap sa mga Tuntunin</h3>
<p>Sa pag-access o paggamit ng ClassCare, kinikilala mong nabasa, naunawaan, at sinang-ayunan mo ang mga Tuntunin at Kondisyong ito.</p>`;
    language?.addEventListener('change', () => {
      const fil = language.value === 'fil';
      content.innerHTML = fil ? filipino : english;
      content.lang = fil ? 'fil' : 'en';
      scrollContainer.setAttribute('aria-label', fil ? 'Mga Tuntunin at Kondisyon; mag-scroll upang basahin ang lahat' : 'Terms and Conditions text, scroll to read all content');
      $('#teacher-terms-title').textContent = fil ? 'Mga Tuntunin at Kondisyon' : 'Terms and Conditions';
      $('#teacher-terms-agreement').textContent = fil ? 'Nabasa ko at sumasang-ayon ako sa mga Tuntunin at Kondisyon' : 'I have read and agree to the Terms and Conditions';
      $('#teacher-terms-checkbox-sub').textContent = fil ? 'Mag-scroll hanggang sa dulo ng teksto upang mapili ang kahong ito.' : 'Scroll to the bottom of the text above to enable this checkbox.';
      termsRead = false; checkbox.checked = false; checkbox.disabled = true;
      checkboxRow.classList.remove('is-enabled'); hint.classList.remove('is-read');
      hint.textContent = fil ? 'Mag-scroll upang basahin' : 'Scroll to read';
      scrollContainer.scrollTo({top:0,behavior:'instant'}); syncRegisterButton();
    });

    function syncRegisterButton() {
      if (!registerButton) return;
      registerButton.disabled = !(termsRead && checkbox.checked);
    }

    function checkScrollBottom() {
      if (!scrollContainer.clientHeight || registerForm.classList.contains('hidden')) return;
      if (termsRead) return;
      const threshold = 4;
      const distance = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight;
      if (distance <= threshold) {
        termsRead = true;
        checkbox.disabled = false;
        checkboxRow.classList.add("is-enabled");
        hint.classList.add("is-read");
        hint.textContent = language?.value === 'fil' ? 'Nabasa' : 'Read';
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
    if (!ClassCare.canProvisionProfiles()) return Toast.warn('Account creation is managed by your administrator under the current security policy.');
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
