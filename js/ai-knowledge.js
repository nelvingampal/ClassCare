/* ============================================================
   ai-knowledge.js   —   CLASSCARE KNOWLEDGE BASE + INTENT ENGINE
   ------------------------------------------------------------
   The on-device "brain" behind the ClassCare Assistant.  It maps
   free-text student/teacher questions to known ClassCare topics
   using a lightweight keyword/score matcher, then returns a
   friendly, helpful answer.

   The chatbot.js widget consults this engine FIRST.  If a
   Gemini API key is configured in js/config.js, it only calls
   this knowledge base for the "quick chips" and uses Gemini for
   free-form questions (falling back here if Gemini fails).
   ============================================================ */

(function () {
  "use strict";

  /* ------------------------------------------------------------
     INTENTS
     Each intent has:
       id        — stable key
       keywords  — words/phrases that signal this topic
       patterns  — regex that matches likely phrasings
       answer    — string OR function(ctx) => string
       chips     — optional extra quick-suggestion chips
       suggestions — optional follow-up pills
     ------------------------------------------------------------ */
  const INTENTS = [

    /* ---------- ATTENDANCE BASICS ---------- */
    {
      id: "attendance_how",
      keywords: ["attendance", "how to check", "view attendance", "my attendance", "see attendance", "record"],
      patterns: [/how.*(check|view|see).*attendance/i, /attendance/i, /my.*record/i, /check.*scan/i],
      answer: (ctx) => {
        const role = ctx?.role || "student";
        if (role === "student") {
          return "📋 You can view your attendance on your Student Dashboard. Sign in, scroll to **Recent Attendance**, and you'll see your last 14 days with Present / Late / Absent badges. You can also see totals in the quick stats at the top.";
        }
        if (role === "teacher") {
          return "📋 Open the Teacher Portal and pick a **Section**. Today's live table shows everyone's Time In / Time Out / Status. Use the **Excel** or **CSV** buttons to export a report for any period (Daily / Weekly / Monthly).";
        }
        return "📋 Attendance records live in the ClassCare system. Sign in to your portal (student or teacher) and look for the attendance table or dashboard.";
      }
    },

    {
      id: "present",
      keywords: ["present", "marked present", "present now", "how to be present"],
      patterns: [/present/i, /marked as present/i],
      answer: "✅ A student is marked **Present** when the teacher scans their QR ID after school starts, within the grace period. Make sure you show your QR code to the teacher when you arrive."
    },

    {
      id: "late",
      keywords: ["late", "late by", "grace", "late grace", "past grace", "arrival late", "late minutes"],
      patterns: [/late/i, /grace period/i, /come late/i, /arrive late/i],
      answer: "⏰ You're marked **Late** if you scan **after** the school start time plus the grace period. For example, if school starts at 07:30 and the grace period is 15 minutes, you're late once the clock passes 07:45. The system automatically counts how many minutes late you are."
    },

    {
      id: "absent",
      keywords: ["absent", "missing", "not present", "absence", "no attendance", "skip"],
      patterns: [/absent/i, /absence/i, /not scanned today/i, /day absent/i],
      answer: "🚫 **Absent** is recorded when a student has no attendance entry for a school day (or when an admin/teacher explicitly marks it). If you think you were marked absent by mistake, send a **Help Desk** ticket from your student portal and the IT admin can correct it."
    },

    {
      id: "attendance_override",
      keywords: ["override", "correct attendance", "fix attendance", "wrong attendance", "correction", "change attendance"],
      patterns: [/override/i, /wrong attendance/i, /fix.*attendance/i, /correct.*attendance/i],
      answer: "🛠️ Only the **IT Admin** can override an attendance record. If your time-in or status looks wrong, open the **Help Desk** from your portal and say which date + time needs fixing. The admin will review it and log an audit."
    },

    /* ---------- STUDENT ID / QR ---------- */
    {
      id: "student_id",
      keywords: ["student id", "id card", "school id", "digital id", "id number", "student number"],
      patterns: [/student id/i, /id card/i, /digital id/i, /school id/i, /student number/i],
      answer: "🪪 Your **Student ID** is a digital card with a unique **QR code**. It appears on your Student Dashboard after you register. Teachers scan that QR to mark your attendance. You can download either just the QR or the full ID card as an image from the dashboard."
    },

    {
      id: "qr_code",
      keywords: ["qr code", "qr", "scan qr", "download qr", "my qr", "barcode"],
      patterns: [/qr code/i, /\bqr\b/i, /barcode/i],
      answer: "🔳 Your **QR code** is the key to attendance. It's on your Student ID card. Tap **Download QR** on the dashboard to save just the QR image, or **Download Full ID** to grab the whole card. Show it to the teacher when you enter class."
    },

    {
      id: "id_expiry",
      keywords: ["valid until", "expiry", "id expire", "expire", "valid date"],
      patterns: [/valid until/i, /expir/i, /when.*expire/i],
      answer: "🗓️ Your Student ID is valid until **June of the current school year**. The exact date is printed on the top-right of your ID card. If your ID looks expired, contact the IT admin for a renewal."
    },

    /* ---------- SCHEDULE / SECTION ---------- */
    {
      id: "schedule",
      keywords: ["schedule", "start time", "school time", "class time", "when does school", "school starts"],
      patterns: [/schedule/i, /start time/i, /when does school/i, /class time/i],
      answer: "🕖 The school's official start time is set by the admin. You can check it in the **Settings** (admin only). Students are marked Present if they scan within the grace period after that time. Ask your teacher or the admin if you're unsure."
    },

    {
      id: "section",
      keywords: ["section", "my section", "class section", "grade section", "which section"],
      patterns: [/section/i, /what.*section/i, /my class/i],
      answer: "🏫 Your **section** is shown on your Student ID card and in your profile. Teachers pick a section in their portal to scan attendance and run the wheel. If your section is wrong, file a Help Desk ticket so admin can update it."
    },

    /* ---------- HELP DESK ---------- */
    {
      id: "helpdesk",
      keywords: ["help desk", "helpdesk", "ticket", "submit ticket", "issue", "problem", "report", "request"],
      patterns: [/help desk/i, /helpdesk/i, /submit.*ticket/i, /file.*ticket/i, /contact.*admin/i],
      answer: "🎟️ The **Help Desk** is your direct line to the IT Admin. Tap the floating chat/help button on your portal, describe the issue (ID card, attendance, login, etc.), and hit **Send Ticket**. The admin replies there, and you'll see the answer right in your portal."
    },

    /* ---------- MOOD CHECK-IN ---------- */
    {
      id: "mood",
      keywords: ["mood", "how are you", "feeling", "check in", "mood check", "emotion"],
      patterns: [/mood/i, /how.*feeling/i, /check.?in/i, /emotion/i],
      answer: "🌤️ The **Mood Check-in** appears once a day on the Student Dashboard. Pick the face that matches how you feel (Terrible → Amazing). It helps school counselors spot trends early. Your answers are private and only shared with authorized school staff."
    },

    /* ---------- PARENT / TELEGRAM ALERTS ---------- */
    {
      id: "parent_alerts",
      keywords: ["parent", "telegram", "notify parent", "alert", "guardian", "parent notify", "message parent"],
      patterns: [/parent/i, /telegram/i, /notify/i, /guardian/i, /alert.*parent/i],
      answer: "📲 When your attendance is scanned, the system automatically sends a **Telegram alert** to your parent/guardian (if a contact is on file). Parents just need to message your school bot once with `/start` and `/register <student id>` to link their chat. If Telegram isn't set up, the alert is queued and retried."
    },

    /* ---------- TEACHER TOOLS ---------- */
    {
      id: "teacher_decides_status",
      keywords: ["how do teachers", "teacher mark", "scan students", "teacher scan", "teacher portal"],
      patterns: [/teacher.*(scan|mark|record)/i, /how.*teachers/i, /scan students/i],
      answer: "👩‍🏫 Teachers use the **Teacher Portal**'s live camera scanner. They pick a section, click **Allow Camera & Start**, and point the camera at a student's QR. The system instantly looks up the student, computes Present vs Late, saves it, and notifies the parent. Teachers can also paste raw QR text if the camera is blocked."
    },

    {
      id: "wheel",
      keywords: ["wheel", "random", "pick student", "spin", "wheel of names", "random name"],
      patterns: [/wheel/i, /random.*(student|name)/i, /spin/i, /pick.*student/i],
      answer: "🎡 The **Wheel of Names** on the Teacher Portal picks a random student — but only from students who are **Present** today. Teachers spin it to call on someone fairly. It's a fun way to get participation!"
    },

    {
      id: "export",
      keywords: ["export", "excel", "csv", "download report", "spreadsheet", "print attendance"],
      patterns: [/export/i, /excel/i, /\.csv/i, /download.*report/i, /spreadsheet/i],
      answer: "📤 In the Teacher Portal, use the **Excel** or **CSV** buttons next to the Section selector to export the attendance report. You can pick **Daily**, **Weekly**, or **Monthly**, and the file downloads right away, respecting your current section + search filter."
    },

    /* ---------- ACCOUNT / LOGIN ---------- */
    {
      id: "register",
      keywords: ["register", "sign up", "create account", "enroll", "new student", "new account"],
      patterns: [/register/i, /sign up/i, /create.*account/i, /enroll/i],
      answer: "📝 Students register on the **Student Portal**: fill in name, student ID, section, a username + password, and a parent Telegram contact. A 3D ID with QR is generated instantly. Teachers register on the **Teacher Portal** with their school email. Admin accounts are provisioned by the IT admin."
    },

    {
      id: "login",
      keywords: ["login", "sign in", "can't login", "forgot password", "password reset", "cant sign in"],
      patterns: [/login/i, /sign in/i, /forgot password/i, /reset password/i, /can.*t.*(log|sign)/i],
      answer: "🔑 Sign in with the username/email and password you registered. Students use username, teachers use email. If you forgot your password, use Firebase Auth's **Forgot password** flow (ask the admin to enable it), or file a Help Desk ticket for a reset."
    },

    {
      id: "role",
      keywords: ["role", "admin", "teacher account", "student account", "who is admin", "access"],
      patterns: [/role/i, /admin account/i, /teacher account/i, /how.*(student|teacher|admin)/i],
      answer: "🧑‍💼 There are three roles: **Student** (register + view own attendance), **Teacher** (scan + manage sections + export), and **Admin** (global analytics, user management, help desk, settings). The IT admin promotes accounts to teacher/admin from the admin Settings tab."
    },

    /* ---------- FIREBASE / SETUP ---------- */
    {
      id: "firebase",
      keywords: ["firebase", "config", "setup", "api key", "firestore", "database"],
      patterns: [/firebase/i, /firestore/i, /api key/i, /config/i, /setup/i],
      answer: "🛠️ This app runs on **Firebase** (Auth + Firestore). All connections are set in `js/config.js`. If something isn't loading, check that the Firebase SDK script tags are present and the config values are valid. The IT admin handles this."
    },

    /* ---------- GREETINGS / MISC ---------- */
    {
      id: "greeting",
      keywords: ["hi", "hello", "hey", "good morning", "good afternoon", "kumusta", "kamusta", "yo"],
      patterns: [/^(hi|hello|hey|yo|good (morning|afternoon|evening)|kumusta|kamusta)/i],
      answer: "👋 Hello! I'm the ClassCare Assistant. I can help you with attendance, student IDs, schedules, sections, the help desk, parent alerts, and teacher tools. What would you like to know?"
    },

    {
      id: "thanks",
      keywords: ["thanks", "thank you", "salamat", "ty", "appreciate"],
      patterns: [/thank(s| you)?/i, /salamat/i, /\bty\b/i],
      answer: "😊 You're welcome! If you need anything else, just ask. I'm here to help with anything ClassCare-related."
    },

    {
      id: "bye",
      keywords: ["bye", "goodbye", "see you", "paalam", "exit", "quit"],
      patterns: [/^(bye|goodbye|see you|paalam|exit|quit)$/i],
      answer: "👋 Goodbye! Have a great day. Come back anytime you need help with school stuff. 🎒"
    },

    {
      id: "school_name",
      keywords: ["school name", "what school", "school", "which school", "classcare name"],
      patterns: [/school name/i, /which school/i, /what school/i],
      answer: () => {
        const name = (window.CLASSCARE_CONFIG?.branding?.schoolName || "ClassCare").trim();
        return `🏫 This is **${name}** — the next-gen attendance and student management system. Students get 3D digital IDs, teachers use a live QR scanner, and parents get instant alerts.`
      }
    },

    {
      id: "features",
      keywords: ["features", "what can it do", "abilities", "what does classcare do", "function", "tools"],
      patterns: [/features/i, /what can.*do/i, /what does.*(system|classcare)/i, /abilities/i],
      answer: "✨ ClassCare brings together: 🪪 **3D Student IDs** with QR codes, 📷 a **live teacher scanner**, 🧠 **daily mood check-ins** for students, 📊 **admin analytics** with an absence heatmap, 🎟️ a **help desk** inbox, 📲 **parent Telegram alerts**, and 📤 **Excel/CSV export** for reports."
    }
  ];

  /* ------------------------------------------------------------
     SCORE MATCHER
     Scores an intent by how many of its keywords appear in the
     user text (weighted) and whether a regex pattern matches.
     Returns the best intent (or null if nothing scores).
     ------------------------------------------------------------ */
  function bestIntent(text) {
    const q = String(text || "").toLowerCase().trim();
    if (!q) return null;

    let best = null;
    let bestScore = 0;
    for (const intent of INTENTS) {
      let score = 0;

      // Keyword scoring — each keyword found adds 1, longer/more specific words weigh slightly more.
      for (const kw of intent.keywords) {
        if (q.includes(kw.toLowerCase())) {
          score += Math.min(2, 1 + kw.length / 20);
        }
      }

      // Regex pattern scoring — a pattern match is a strong signal (+4).
      for (const re of intent.patterns) {
        if (re.test(q)) {
          score += 4;
          break;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        best = intent;
      }
    }

    // Require a minimum score so we don't answer random noise confidently.
    if (bestScore >= 2) return best;
    return null;
  }

  /* ------------------------------------------------------------
     PUBLIC API
     ------------------------------------------------------------ */
  function answerFor(question, ctx = {}) {
    const intent = bestIntent(question);
    if (!intent) {
      return {
        intent: "unknown",
        answer: "🤔 Hmm, I don't have a specific answer for that yet. Try asking me about **attendance**, **student ID / QR**, **schedules**, **sections**, the **help desk**, **mood check-in**, or **parent alerts**. Or ask your IT admin.",
        chips: defaultChips()
      };
    }
    const raw = typeof intent.answer === "function" ? intent.answer(ctx) : intent.answer;
    return {
      intent: intent.id,
      answer: raw,
      chips: intent.chips || defaultChips(),
      suggestions: intent.suggestions || []
    };
  }

  function defaultChips() {
    return [
      "How do I check attendance?",
      "What does \"Late\" mean?",
      "How do I get my QR ID?",
      "How does the help desk work?",
      "How do parents get alerts?"
    ];
  }

  function listIntents() {
    return INTENTS.map(i => i.id);
  }

  window.ClassCareKnowledge = { answerFor, listIntents, bestIntent };
})();
