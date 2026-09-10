/* ============================================================
   utils.js — shared pure helpers and form state utilities
   ============================================================ */
(function () {
  "use strict";

  function sanitizeText(raw, { max = 120 } = {}) {
    if (raw == null) return "";
    let value = String(raw).trim();
    value = value.replace(/[\u0000-\u001F\u007F]/g, "");
    value = value.replace(/<\/?[^>]+(>|$)/g, "");
    value = value.replace(/\s+/g, " ");
    return max && value.length > max ? value.slice(0, max) : value;
  }

  function sanitizeTelegramUsername(raw) {
    const value = String(raw || "").trim();
    if (/^([+-]?\d+[\d\s\-()]*)$/.test(value)) return value;
    const username = sanitizeText(value, { max: 40 }).replace(/^@+/, "");
    return username ? `@${username}` : "";
  }

  function isEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim()); }
  function isStudentId(value) { return /^[A-Za-z0-9\-]{4,20}$/.test(String(value || "").trim()); }
  function isSection(value) { return /^[A-Za-z0-9\- ]{2,30}$/.test(String(value || "").trim()); }

  function todayIso() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date());
    const part = type => parts.find(p => p.type === type).value;
    return part('year') + '-' + part('month') + '-' + part('day');
  }
  function nowHhMm() { return new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Manila', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).format(new Date()); }
  function computeStatus(clockTime, schoolStart, graceMin) {
    const [sh, sm] = String(schoolStart || "08:00").split(":").map(Number);
    const [ch, cm] = String(clockTime || "00:00").split(":").map(Number);
    const start = sh * 60 + sm;
    const clock = ch * 60 + cm;
    return clock - start <= Number(graceMin || 0) ? "Present" : "Late";
  }
  function parseHhMmToMinutes(hhMm) {
    if (!hhMm || typeof hhMm !== "string") return null;
    const parts = hhMm.split(":").map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
    return parts[0] * 60 + parts[1];
  }
  function computeHierarchicalAttendance(clockTime, globalSettings = {}, activeAssignment = null, existingRecord = null) {
    const clock = parseHhMmToMinutes(clockTime || nowHhMm()) ?? (8 * 60);

    // 1. Teacher Override (Subject-level quota)
    if (activeAssignment?.custom_quota && activeAssignment?.start_time) {
      const start = parseHhMmToMinutes(activeAssignment.start_time) ?? (8 * 60);
      const grace = Number(activeAssignment.late_grace_period ?? 15);
      const lateCutoff = start + grace;
      const outStart = parseHhMmToMinutes(activeAssignment.out_start_time) ?? (start + 50);
      const outEnd = parseHhMmToMinutes(activeAssignment.out_end_time) ?? (outStart + 30);

      if (existingRecord?.time_in && !existingRecord?.time_out && clock >= (outStart - 5)) {
        return {
          action: "time_out",
          status: "Time Out",
          minutes_late: existingRecord.minutes_late || 0,
          quota_source: `Teacher Override: ${activeAssignment.subject || "Subject"}`,
          quota_type: "teacher_override",
          session: "subject_class",
          subject: activeAssignment.subject || ""
        };
      }

      if (clock <= lateCutoff) {
        return {
          action: "time_in",
          status: "Present",
          minutes_late: 0,
          quota_source: `Teacher Override: ${activeAssignment.subject || "Subject"}`,
          quota_type: "teacher_override",
          session: "subject_class",
          subject: activeAssignment.subject || ""
        };
      } else {
        const minutesLate = Math.max(1, clock - lateCutoff);
        return {
          action: "time_in",
          status: "Late",
          minutes_late: minutesLate,
          quota_source: `Teacher Override: ${activeAssignment.subject || "Subject"}`,
          quota_type: "teacher_override",
          session: "subject_class",
          subject: activeAssignment.subject || ""
        };
      }
    }

    // 2. Admin Global Quota (DepEd Master Schedule)
    const morningStart = parseHhMmToMinutes(globalSettings.morning_start) ?? (7 * 60 + 30);
    const morningLateCutoff = parseHhMmToMinutes(globalSettings.morning_late_cutoff) ?? (7 * 60 + 45);
    const morningOutStart = parseHhMmToMinutes(globalSettings.morning_out_start) ?? (11 * 60 + 30);
    const morningOutEnd = parseHhMmToMinutes(globalSettings.morning_out_end) ?? (12 * 60);

    const afternoonStart = parseHhMmToMinutes(globalSettings.afternoon_start) ?? (13 * 60);
    const afternoonLateCutoff = parseHhMmToMinutes(globalSettings.afternoon_late_cutoff) ?? (13 * 60 + 15);
    const afternoonOutStart = parseHhMmToMinutes(globalSettings.afternoon_out_start) ?? (15 * 60);
    const afternoonOutEnd = parseHhMmToMinutes(globalSettings.afternoon_out_end) ?? (17 * 60);

    if (existingRecord?.time_in && !existingRecord?.time_out) {
      const isMorningOut = clock >= (morningOutStart - 5) && clock <= (morningOutEnd + 15);
      const isAfternoonOut = clock >= (afternoonOutStart - 10) && clock <= (afternoonOutEnd + 30);
      if (isMorningOut || isAfternoonOut) {
        return {
          action: "time_out",
          status: "Time Out",
          minutes_late: existingRecord.minutes_late || 0,
          quota_source: "Admin Global Quota",
          quota_type: "admin_global",
          session: isMorningOut ? "morning" : "afternoon"
        };
      }
    }

    const isAfternoon = clock >= 750;
    if (isAfternoon) {
      if (clock <= afternoonLateCutoff) {
        return {
          action: "time_in",
          status: "Present",
          minutes_late: 0,
          quota_source: "Admin Global Quota (Afternoon)",
          quota_type: "admin_global",
          session: "afternoon"
        };
      } else {
        const minutesLate = Math.max(1, clock - afternoonLateCutoff);
        return {
          action: "time_in",
          status: "Late",
          minutes_late: minutesLate,
          quota_source: "Admin Global Quota (Afternoon)",
          quota_type: "admin_global",
          session: "afternoon"
        };
      }
    } else {
      if (clock <= morningLateCutoff) {
        return {
          action: "time_in",
          status: "Present",
          minutes_late: 0,
          quota_source: "Admin Global Quota (Morning)",
          quota_type: "admin_global",
          session: "morning"
        };
      } else {
        const minutesLate = Math.max(1, clock - morningLateCutoff);
        return {
          action: "time_in",
          status: "Late",
          minutes_late: minutesLate,
          quota_source: "Admin Global Quota (Morning)",
          quota_type: "admin_global",
          session: "morning"
        };
      }
    }
  }
  function minutesBetween(aHhmm, bHhmm) {
    const [ah, am] = String(aHhmm || "00:00").split(":").map(Number);
    const [bh, bm] = String(bHhmm || "00:00").split(":").map(Number);
    return (ah * 60 + am) - (bh * 60 + bm);
  }

  function fieldFor(form, key) {
    return form?.querySelector(`[name="${CSS.escape(key)}"]`);
  }
  function errorFor(input) {
    if (!input) return null;
    const describedBy = String(input.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
    return describedBy.map(id => document.getElementById(id)).find(el => el?.classList.contains("field-error")) || input.parentElement?.querySelector(".field-error");
  }
  function clearFieldError(input) {
    if (!input) return;
    input.removeAttribute("aria-invalid");
    const message = errorFor(input);
    if (message) message.textContent = "";
  }
  function setFieldError(input, message) {
    if (!input) return;
    input.setAttribute("aria-invalid", "true");
    const error = errorFor(input);
    if (error) error.textContent = message || "Check this field.";
  }
  function clearFormErrors(form) {
    form?.querySelectorAll(".field").forEach(clearFieldError);
  }

  function validateForm(formEl, rules = {}) {
    const form = typeof formEl === "string" ? document.querySelector(formEl) : formEl;
    if (!form) return null;
    clearFormErrors(form);
    const data = {};
    for (const [key, value] of new FormData(form).entries()) data[key] = value;
    for (const [key, rule] of Object.entries(rules)) {
      const message = rule(data[key], data);
      if (!message) continue;
      const input = fieldFor(form, key);
      setFieldError(input, message);
      input?.focus();
      if (window.Toast) Toast.error(message);
      return null;
    }
    return data;
  }

  function setLoading(element, loading = true) {
    const node = typeof element === "string" ? document.querySelector(element) : element;
    if (!node) return;
    node.dataset.loading = loading ? "1" : "0";
    node.disabled = loading;
    node.classList.toggle("btn-loading", loading);
    node.classList.toggle("opacity-60", loading);
    node.classList.toggle("cursor-not-allowed", loading);
  }

  const rateLimitBuckets = new Map();
  function rateLimit(key, maxCalls, windowMs) {
    const now = Date.now();
    const kept = (rateLimitBuckets.get(key) || []).filter(time => now - time < windowMs);
    if (kept.length >= maxCalls) return false;
    kept.push(now);
    rateLimitBuckets.set(key, kept);
    return true;
  }

  window.Utils = {
    sanitizeText, sanitizeTelegramUsername, isEmail, isStudentId, isSection,
    todayIso, nowHhMm, computeStatus, parseHhMmToMinutes, computeHierarchicalAttendance, minutesBetween,
    validateForm, setLoading, rateLimit, setFieldError, clearFieldError, clearFormErrors
  };
})();
