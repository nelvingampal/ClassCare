/* ============================================================
   telegram-alert.js — structured parent and support notifications
   MODIFIED: Rebranded CampusApp → ClassCare
   ============================================================ */
(function () {
  "use strict";

  async function resolveChatId(parentContact) {
    if (!parentContact) return null;
    const contact = String(parentContact).trim();
    if (/^-?\d+$/.test(contact)) return Number(contact);
    try {
      // MODIFIED: CampusApp → ClassCare
      const services = ClassCare.getFirebase();
      if (!services?.db) return null;
      const snap = await services.db.collection("telegram_users").where("username", "==", contact.replace(/^@/, "").toLowerCase()).limit(1).get();
      const chatId = snap.docs[0]?.data()?.chat_id;
      return chatId == null ? null : Number(chatId);
    } catch (error) {
      console.warn("[telegram] chat ID lookup failed:", error);
      return null;
    }
  }

  function escapeTelegram(value) { return String(value ?? "-").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  async function sendToChat(chatId, text) {
    // MODIFIED: CampusApp → ClassCare
    const token = String(ClassCare.TELEGRAM_CONFIG?.botToken || "").trim();
    if (!token || token.startsWith("YOUR_")) return { ok: false, queued: false, reason: "not-configured" };
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, parse_mode: "HTML", disable_web_page_preview: true, text }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.description || `Telegram API ${response.status}`);
      return { ok: true, queued: false, reason: "sent" };
    } catch (error) {
      return { ok: false, queued: false, reason: "request-failed", error };
    }
  }

  async function queueFailedAlert(student, status, meta, reason) {
    try {
      // MODIFIED: CampusApp → ClassCare
      await ClassCare.DB.pending_alerts.add({ created_by: window.ClassCare?.getFirebase?.()?.auth?.currentUser?.uid || "", student_uid: student.uid, student_id: student.student_id, parent_contact: student.parent_contact, status, meta, reason, attempts: 1, created_at: firebase.firestore.FieldValue.serverTimestamp() });
      return true;
    } catch (error) {
      console.warn("[telegram] failed-alert queue unavailable:", error);
      return false;
    }
  }

  async function sendAttendanceAlert(student, status, meta = {}) {
    if (!student?.parent_contact) return { ok: false, queued: false, reason: "no-contact" };
    const chatId = await resolveChatId(student.parent_contact);
    if (!chatId) {
      const queued = await queueFailedAlert(student, status, meta, "parent-contact-unresolved");
      return { ok: false, queued, reason: "contact-unresolved" };
    }
    const name = `${student.first_name || ""} ${student.last_name || ""}`.trim() || "Student";
    // MODIFIED: "Campus" → "ClassCare" in Telegram message footer
    const text = ` <b>Attendance Update</b>\n<b>Student:</b> ${escapeTelegram(name)}\n<b>ID:</b> ${escapeTelegram(student.student_id)} · <b>Section:</b> ${escapeTelegram(student.section)}\n<b>Date:</b> ${escapeTelegram(meta.date || Utils.todayIso())}\n<b>Status:</b> ${escapeTelegram(status)}\n<b>Time in:</b> ${escapeTelegram(meta.time_in || "-")}\n— <b>ClassCare</b>`;
    const result = await sendToChat(chatId, text);
    if (!result.ok) {
      const queued = await queueFailedAlert(student, status, meta, result.reason);
      return { ...result, queued };
    }
    return result;
  }

  async function sendEmailAttendanceAlert(student, status, meta = {}) {
    const config = window.CLASSCARE_CONFIG?.emailjs || window.CONFIG?.emailjs || ClassCare.EMAILJS_CONFIG || {};
    const publicKey = String(config.publicKey || "").trim();
    const serviceId = String(config.serviceId || "").trim();
    const isTimeOut = String(status || "").toLowerCase() === "time out" || !!meta.time_out;
    const isDigest = String(status || "").toLowerCase().includes("digest");
    
    // Support 2-template setup: Template 1 for Daily Attendance (Time In & Time Out) and Template 2 for Weekly Digest
    const templateId = String(
      (isDigest && (config.templateWeeklyDigest || config.templateId)) ||
      (isTimeOut && (config.templateTimeOut || config.templateDailyAttendance || config.templateTimeIn || config.templateId)) ||
      (!isTimeOut && !isDigest && (config.templateTimeIn || config.templateDailyAttendance || config.templateId)) ||
      config.templateId || ""
    ).trim();

    const contactEmail = String(student?.parent_contact || "").trim();
    const recipient = String(
      student?.parent_email ||
      (Utils.isEmail(contactEmail) ? contactEmail : "") ||
      (Utils.isEmail(student?.email) ? student.email : "") ||
      (Utils.isEmail(student?.contact_email) ? student.contact_email : "") ||
      config.fallbackEmail ||
      ""
    ).trim().toLowerCase();
    
    if (!window.emailjs || !publicKey || publicKey.startsWith("YOUR_") || !serviceId || serviceId.startsWith("YOUR_") || !templateId || templateId.startsWith("YOUR_")) {
      console.warn("[emailjs] Alert skipped: EmailJS is not configured in js/config.js.");
      return { ok: false, queued: false, reason: "not-configured" };
    }
    if (!recipient) {
      console.warn(`[emailjs] Alert skipped: No parent email configured for student ${student?.first_name || ""} (UID: ${student?.uid || "unknown"}).`);
      return { ok: false, queued: false, reason: "no-email", student_name: `${student?.first_name || ""} ${student?.last_name || ""}`.trim() };
    }

    const name = `${student.first_name || ""} ${student.last_name || ""}`.trim() || "Student";
    try {
      try {
        if (typeof emailjs.init === "function") {
          try { emailjs.init(publicKey); } catch (_) {}
          try { emailjs.init({ publicKey }); } catch (_) {}
        }
      } catch (_) {}

      const timeStr = isTimeOut ? (meta.time_out || meta.time_in || "-") : (meta.time_in || "-");
      const actionMsg = isDigest
        ? (meta.message || `Weekly Wellness & Attendance Digest for ${name}.`)
        : isTimeOut
        ? `Dismissal / Time Out update for ${name}: Left school at ${timeStr}.`
        : `Attendance update for ${name}: ${status} at ${timeStr}.`;

      const templateParams = {
        to_email: recipient,
        recipient_email: recipient,
        email: recipient,
        user_email: recipient,
        parent_email: recipient,
        to_name: name,
        student_name: name,
        student_id: student.student_id || "-",
        section: student.section || "-",
        date: meta.date || Utils.todayIso(),
        status,
        time_in: meta.time_in || "-",
        time_out: meta.time_out || "-",
        message: meta.message || actionMsg,
        attendance_summary: meta.attendance_summary || `${status} at ${timeStr}`,
        wellness_summary: meta.wellness_summary || (meta.mood ? `Mood: ${meta.mood}` : "-")
      };

      console.log(`[emailjs] Dispatching ${isTimeOut ? "Time Out" : isDigest ? "Digest" : "Time In"} email to: ${recipient}...`);
      await emailjs.send(serviceId, templateId, templateParams, publicKey);
      console.log(`[emailjs] Successfully delivered parent email to: ${recipient}`);
      return { ok: true, queued: false, reason: "sent", recipient, template_id: templateId };
    } catch (error) {
      console.error("[emailjs] Alert delivery error:", error);
      return { ok: false, queued: false, reason: "request-failed", error, recipient };
    }
  }

  async function sendText(student, message) {
    if (!student?.parent_contact) return { ok: false, queued: false, reason: "no-contact" };
    const chatId = await resolveChatId(student.parent_contact);
    if (!chatId) {
      const queued = await queueFailedAlert(student, "Support reply", { message }, "contact-unresolved");
      return { ok: false, queued, reason: "contact-unresolved" };
    }
    // MODIFIED: "Campus support reply" → "ClassCare support reply"
    const result = await sendToChat(chatId, `<b>ClassCare support reply</b>\n${escapeTelegram(message)}`);
    if (!result.ok) {
      const queued = await queueFailedAlert(student, "Support reply", { message }, result.reason);
      return { ...result, queued };
    }
    return result;
  }

  window.TelegramAlert = { resolveChatId, sendAttendanceAlert, sendEmailAttendanceAlert, sendText };
})();
