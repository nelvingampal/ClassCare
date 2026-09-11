/* ============================================================
   js/config.js   —   CENTRAL CONFIGURATION  (EDIT THIS FILE!)
   ------------------------------------------------------------
   ⚠️  THIS IS THE ONLY FILE YOU NEED TO EDIT TO SET UP THE APP.  ⚠️

   Follow the setup guide printed at the bottom of the file, OR
   the numbered step-by-step instructions shown in the chat.

   Replace every "YOUR_XXX_HERE" string with your real credentials.
   ============================================================ */

// MODIFIED: Renamed from CAMPUS_CONFIG → CLASSCARE_CONFIG (global rebrand)
window.CLASSCARE_CONFIG = {

  /* ╔══════════════════════════════════════════════════════════════╗
     ║  🔥 FIREBASE CONFIG                                        ║
     ╠══════════════════════════════════════════════════════════════╣
     ║  HOW TO GET THESE VALUES:                                  ║
     ║  1. Go to https://console.firebase.google.com and open     ║
     ║     your project.                                          ║
     ║  2. Click the ⚙️ gear icon → "Project settings".           ║
     ║  3. At the bottom of the "General" tab find "Your apps",  ║
     ║     click the "</>" Web App icon (or add one if none).     ║
     ║  4. After adding, the popup shows the SDK snippet with     ║
     ║     the `firebaseConfig = { ... }` object.  Copy each     ║
     ║     field into the matching field below.                   ║
     ╚══════════════════════════════════════════════════════════════╝ */
  firebase: {
    apiKey: "AIzaSyDdGM_24r860-QKrousCyhvBfUsBT8hBKA",
    authDomain: "studentmanagement-system-3dc67.firebaseapp.com",
    projectId: "studentmanagement-system-3dc67",
    storageBucket: "studentmanagement-system-3dc67.firebasestorage.app",
    messagingSenderId: "106967417117",
    appId: "1:106967417117:web:46636c52021d68c26b21f4"
  },

  /* ╔══════════════════════════════════════════════════════════════╗
     ║  🤖 TELEGRAM BOT TOKEN  (for parent alerts)                ║
     ╠══════════════════════════════════════════════════════════════╣
     ║  HOW TO GET A BOT TOKEN:                                   ║
     ║  1. Open Telegram, search for the user "@BotFather".       ║
     ║  2. Send:    /newbot                                       ║
     ║  3. Follow prompts: pick a name + username (must end       ║
     ║     in "bot", e.g. "ClassCareAlerts_bot").                 ║
     ║  4. BotFather replies with a long token like:              ║
     ║        123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ0123456789      ║
     ║     Paste the WHOLE THING (including the ":" part) below.  ║
     ║  5. Parents must message your bot "/start" once so the    ║
     ║     bot is allowed to DM them.  To link Telegram usernames ║
     ║     to students, they run  /register 2024-1001  (their ID).║
     ╚══════════════════════════════════════════════════════════════╝ */
  telegram: {
    botToken: ""
  },

  /* ╔══════════════════════════════════════════════════════════════╗
     ║  📧 EMAILJS FALLBACK (MANUAL CONFIGURATION ONLY)           ║
     ╠══════════════════════════════════════════════════════════════╣
     ║  SECURITY RULE: DO NOT create UI input fields for API keys. ║
     ║  If updating EmailJS keys, update them manually right here  ║
     ║  in `js/config.js` (or in `.env` based on `.env.example`).   ║
     ║  Sign up free at https://www.emailjs.com and set values:    ║
     ║    - publicKey: Found in Account -> General                 ║
     ║    - serviceId: Found in Email Services                     ║
     ║    - templateId: Found in Email Templates                   ║
     ╚══════════════════════════════════════════════════════════════╝ */
  emailjs: {
    publicKey: "oUql9H9PuBblymdqY",
    serviceId: "service_yrg7r4h",
    templateId: "template_zw9k7cl",                 // Pang-reserba (katugma ng Daily Attendance)
    templateDailyAttendance: "template_zw9k7cl",    // TEMPLATE 1: Daily Attendance (Time In & Time Out pinagsama)
    templateWeeklyDigest: "template_b9vuh23"  // TEMPLATE 2: Weekly Digest (Weekly Emotional Summary)
  },

  /* ╔══════════════════════════════════════════════════════════════╗
     ║  🤖 AI / CHATBOT CONFIG  (optional)                          ║
     ╠══════════════════════════════════════════════════════════════╣
     ║  The ClassCare Assistant works OUT OF THE BOX without any    ║
     ║  key, using a built-in knowledge base. For free-form AI      ║
     ║  answers, paste a FREE Gemini API key below (get one at      ║
     ║  https://aistudio.google.com/apikey).  If you leave it as    ║
     ║  "YOUR_GEMINI_API_KEY_HERE", the assistant falls back to the ║
     ║  smart on-device knowledge base.                             ║
     ╚══════════════════════════════════════════════════════════════╝ */
  ai: {
    // Paste a free Gemini API key to enable free-form AI answers.
    geminiApiKey: "",

    // Which Gemini model to use (free tier).
    geminiModel: "gemini-2.0-flash",

    // MODIFIED: Assistant name + persona updated to ClassCare branding
    assistantName: "ClassCare Assistant",
    persona: "You are the friendly ClassCare Assistant for a school attendance, student wellness, and academic management system. You help students, teachers, and parents with simple, clear answers about: attendance, being late or absent, student IDs and QR codes, sections and schedules, the help desk, emotional check-ins, parent alerts via Telegram, grade reports, enrollment, and the teacher QR scanner. Keep answers short, friendly, and practical. If you don't know something, say so honestly and suggest asking the IT administrator."
  },

  /* ╔══════════════════════════════════════════════════════════════╗
     ║  🎨 APP BRANDING / DEFAULTS                                ║
     ║  (Optional — tweak any time)                                ║
     ╚══════════════════════════════════════════════════════════════╝ */
  branding: {
    // MODIFIED: Fixed double-space typo in school name
    schoolName: "FATIMA CENTRAL ELEMENTARY SCHOOL",
    schoolNameShort: "FCES",
    validUntilMonth: "JANUARY",
    validUntilAddYears: 1,  // add N years from today to the ID card "valid until" date
    defaultSchoolStartTime: "07:30",   // HH:MM  24h
    defaultLateGraceMinutes: 15         // minutes
  }
};

window.CONFIG = window.CLASSCARE_CONFIG;
if (typeof window.ClassCare === "undefined") window.ClassCare = {};
window.ClassCare.EMAILJS_CONFIG = window.CLASSCARE_CONFIG.emailjs;
