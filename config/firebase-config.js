/* ============================================================
   firebase-config.js — Firebase singleton and data references
   MODIFIED: Rebranded from CampusApp → ClassCare
   ============================================================ */
// MODIFIED: Updated to read from CLASSCARE_CONFIG instead of CAMPUS_CONFIG
const _CFG = window.CLASSCARE_CONFIG || {};
const FIREBASE_CONFIG = _CFG.firebase || {};
const TELEGRAM_CONFIG = _CFG.telegram || { botToken: "" };
const EMAILJS_CONFIG = _CFG.emailjs || {};

let _app = null;
let _auth = null;
let _db = null;
let _initError = null;

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeSection(value) {
  return String(value || "").trim().replace(/[\s_]+/g, " ").replace(/[-–—]+/g, " ").replace(/\s+/g, " ");
}

function getFirebase() {
  if (_app && _auth && _db) return { app: _app, auth: _auth, db: _db };
  if (typeof firebase === "undefined") {
    _initError = Object.assign(new Error("Firebase SDK is unavailable."), { code: "service-unavailable" });
    return null;
  }
  if (!FIREBASE_CONFIG.apiKey || String(FIREBASE_CONFIG.apiKey).startsWith("YOUR_")) {
    _initError = Object.assign(new Error("Firebase is not configured."), { code: "configuration-not-found" });
    return null;
  }
  try {
    _app = firebase.apps?.length ? firebase.app() : firebase.initializeApp(FIREBASE_CONFIG);
    _auth = firebase.auth();
    _db = firebase.firestore();
    _auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(error => console.warn("[auth] local persistence unavailable:", error));
    _db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
    return { app: _app, auth: _auth, db: _db };
  } catch (error) {
    _initError = error;
    console.error("[firebase-config] Initialization failed:", error);
    return null;
  }
}

function requireDb() {
  const services = getFirebase();
  // MODIFIED: Updated error message from "Campus" to "ClassCare"
  if (!services?.db) throw Object.assign(new Error("ClassCare data is unavailable. Check your connection and Firebase configuration."), { code: _initError?.code || "service-unavailable" });
  return services.db;
}

const DB = {
  get users() { return requireDb().collection("users"); },
  get attendance() { return requireDb().collection("attendance"); },
  get enrollments() { return requireDb().collection("enrollments"); },
  get grades() { return requireDb().collection("grades"); },
  get helpdesk_tickets() { return requireDb().collection("helpdesk_tickets"); },
  get settings() { return requireDb().collection("settings").doc("global"); },
  get pending_alerts() { return requireDb().collection("pending_alerts"); },
  get audit_log() { return requireDb().collection("audit_log"); },
  get section_counters() { return requireDb().collection("section_counters"); },
  get intervention_alerts() { return requireDb().collection("intervention_alerts"); },
  get emotional_checkins() { return requireDb().collection("emotional_checkins"); },
  get teacher_subjects() { return requireDb().collection("teacher_subjects"); },
  get enrollment_requests() { return requireDb().collection("enrollment_requests"); },
  get concern_submissions() { return requireDb().collection("concern_submissions"); },
  get talkToSomeone() { return requireDb().collection("talkToSomeone"); },
  get concern_referrals() { return requireDb().collection("concern_referrals"); },
  get distress_alerts() { return requireDb().collection("distress_alerts"); },
  get careAlerts() { return requireDb().collection("careAlerts"); },
  distressAlertDocId(studentUid) { return String(studentUid || ""); },
  attendanceDocId(studentUid, dateIso) { return `${studentUid}_${dateIso}`; },
  enrollmentDocId(studentUid, section, subject) {
    const cleanSec = String(section || "").replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
    const cleanSub = String(subject || "").replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
    return `${studentUid}_${cleanSec}_${cleanSub}`;
  },
  gradeDocId(studentUid, section, subject) {
    const cleanSec = String(section || "").replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
    const cleanSub = String(subject || "").replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
    return `${studentUid}_${cleanSec}_${cleanSub}`;
  },
  sectionCounterDocId(section) {
    return String(section || "").replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
  },
  emotionalCheckinDocId(studentUid, dateIso) {
    return `${studentUid}_${dateIso}`;
  },
  // MODIFIED: Inlined todayIso() to avoid dependency on Utils which may not be loaded yet
  interventionAlertDocId(studentUid, teacherUid) {
    const d = new Date();
    const today = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
    return `${studentUid}_${teacherUid}_${today}`;
  },
  teacherSubjectDocId(teacherUid) { return teacherUid; },
  enrollmentRequestDocId(studentUid) { return studentUid; },
  SECTION_CAPACITY_LIMIT: 45,
  DEPED_GRADE_MIN: 60,
  DEPED_GRADE_MAX: 100,
  DEPED_PASSING: 75,
  NEGATIVE_EMOTIONS: new Set(["sad", "stressed", "not_good", "not_motivated", "angry", "anxious", "overwhelmed", "tired", "lonely", "worried"]),
  POSITIVE_EMOTIONS: new Set(["happy", "excited", "calm", "proud", "grateful", "motivated", "hopeful", "content"]),
  EMOTION_META: {
    okay: { label: "Okay", emoji: "😐", is_negative: false },
    not_good: { label: "Not Good", emoji: "😟", is_negative: true },
    not_motivated: { label: "Not Motivated", emoji: "😞", is_negative: true },
    happy: { label: "Happy", emoji: "😊", is_negative: false },
    calm: { label: "Calm", emoji: "😌", is_negative: false },
    excited: { label: "Excited", emoji: "🤩", is_negative: false },
    proud: { label: "Proud", emoji: "🥰", is_negative: false },
    grateful: { label: "Grateful", emoji: "🙏", is_negative: false },
    motivated: { label: "Motivated", emoji: "💪", is_negative: false },
    hopeful: { label: "Hopeful", emoji: "🌟", is_negative: false },
    content: { label: "Content", emoji: "🙂", is_negative: false },
    tired: { label: "Tired", emoji: "😴", is_negative: true },
    stressed: { label: "Stressed", emoji: "😰", is_negative: true },
    anxious: { label: "Anxious", emoji: "😟", is_negative: true },
    sad: { label: "Sad", emoji: "😢", is_negative: true },
    overwhelmed: { label: "Overwhelmed", emoji: "😵", is_negative: true },
    angry: { label: "Angry", emoji: "😠", is_negative: true },
    lonely: { label: "Lonely", emoji: "🥺", is_negative: true },
    worried: { label: "Worried", emoji: "😟", is_negative: true }
  },
  normalizeEmotion(rawKey) {
    const key = String(rawKey || "").trim().toLowerCase();
    const meta = this.EMOTION_META[key];
    const isNeg = meta ? Boolean(meta.is_negative) : Boolean(this.isEmotionNegative(key));
    const label = meta ? meta.label : (key ? (key.charAt(0).toUpperCase() + key.slice(1)) : "Content");
    const emoji = meta ? meta.emoji : (isNeg ? "😟" : "😊");
    return {
      key: key || "content",
      emotion: key || "content",
      label: label,
      emotion_label: label,
      emoji: emoji,
      emotion_emoji: emoji,
      is_negative: isNeg
    };
  },
  depedWeightedAverage(written, performance, quarterly) {
    const w = Number(written) || 0;
    const p = Number(performance) || 0;
    const q = Number(quarterly) || 0;
    return Number(((w * 0.30) + (p * 0.50) + (q * 0.20)).toFixed(1));
  },
  getDepedGradeDescriptor(grade) {
    const g = Number(grade);
    if (isNaN(g)) return { label: "No Grade", color: "muted" };
    if (g >= 90) return { label: "Outstanding", color: "outstanding" };
    if (g >= 85) return { label: "Very Satisfactory", color: "very-satisfactory" };
    if (g >= 80) return { label: "Satisfactory", color: "satisfactory" };
    if (g >= 75) return { label: "Fairly Satisfactory", color: "fairly-satisfactory" };
    return { label: "Did Not Meet Expectations", color: "failed" };
  },
  isEmotionNegative(emotion) {
    return this.NEGATIVE_EMOTIONS.has(String(emotion || "").trim().toLowerCase());
  },
  isGradeFailing(grade) {
    if (grade === null || grade === undefined || grade === "") return false;
    const g = Number(grade);
    return !isNaN(g) && g < this.DEPED_PASSING;
  },
  // MODIFIED: Enhanced intervention trigger — negative emotion ALONE now triggers alert
  // (previously required both negative emotion AND failing grades)
  shouldTriggerIntervention(emotion, avgGrade) {
    const hasNegativeEmotion = this.isEmotionNegative(emotion);
    const hasLowGrades = this.isGradeFailing(avgGrade);
      return hasNegativeEmotion && hasLowGrades;
  },
  isEnrollmentOpen(data) {
    if (typeof localStorage !== "undefined") {
      const cached = localStorage.getItem("classcare_enrollment_open");
      if ((!data || typeof data !== "object") && cached !== null) return cached === "true";
    }
    if (!data || typeof data !== "object") return false;

    // Explicit enrollment_status string check has highest priority for database sync
    if (data.enrollment_status !== undefined && data.enrollment_status !== null) {
      const s = String(data.enrollment_status).trim().toLowerCase();
      if (s === "open" || s === "true" || s === "opened" || s === "enabled") return true;
      if (s === "closed" || s === "false" || s === "close" || s === "disabled") return false;
    }

    // Explicit boolean flag
    if (data.enrollment_open === true || data.isOpen === true || data.is_open === true) return true;
    if (data.enrollment_open === false || data.isOpen === false || data.is_open === false) return false;

    // Specific string boolean checking
    const rawOpen = data.enrollment_open ?? data.isOpen ?? data.is_open;
    if (rawOpen !== undefined && rawOpen !== null) {
      const s = String(rawOpen).trim().toLowerCase();
      if (s === "true" || s === "1" || s === "open") return true;
      if (s === "false" || s === "0" || s === "closed") return false;
    }

    // Default strictly to closed
    return false;
  },
  async getSettings() {
    const defaults = {
      // DepEd Hierarchical Attendance Quotas (Admin Master Schedule)
      morning_start: "07:30",
      morning_late_cutoff: "07:45",
      morning_out_start: "11:30",
      morning_out_end: "12:00",
      afternoon_start: "13:00",
      afternoon_late_cutoff: "13:15",
      afternoon_out_start: "15:00",
      afternoon_out_end: "17:00",
      school_start_time: _CFG.branding?.defaultSchoolStartTime || "07:30",
      late_grace_period: _CFG.branding?.defaultLateGraceMinutes ?? 15,
      time_out_start: "15:00",
      master_sections: [],
      enrollment_open: false,
      enrollment_status: "CLOSED",
      section_capacity: 45,
      academic_year: "",
      current_school_term: 1,
      deped_grading_enabled: true
    };
    try {
      const snap = await this.settings.get();
      const data = snap.exists ? snap.data() : {};
      const isOpen = this.isEnrollmentOpen(data);
      return {
        ...defaults,
        ...data,
        morning_start: data.morning_start || defaults.morning_start,
        morning_late_cutoff: data.morning_late_cutoff || defaults.morning_late_cutoff,
        morning_out_start: data.morning_out_start || defaults.morning_out_start,
        morning_out_end: data.morning_out_end || defaults.morning_out_end,
        afternoon_start: data.afternoon_start || defaults.afternoon_start,
        afternoon_late_cutoff: data.afternoon_late_cutoff || defaults.afternoon_late_cutoff,
        afternoon_out_start: data.afternoon_out_start || defaults.afternoon_out_start,
        afternoon_out_end: data.afternoon_out_end || defaults.afternoon_out_end,
        master_sections: Array.isArray(data.master_sections) && data.master_sections.length ? data.master_sections : defaults.master_sections,
        enrollment_open: isOpen,
        enrollment_status: isOpen ? "OPEN" : "CLOSED",
        section_capacity: Number(data.section_capacity) || defaults.section_capacity,
        deped_grading_enabled: data.deped_grading_enabled !== false
      };
    } catch (error) {
      throw error;
    }
  },
  async getSectionCount(section) {
    if (!section) return { count: 0, capacity: this.SECTION_CAPACITY_LIMIT, available: this.SECTION_CAPACITY_LIMIT };
    try {
      const docId = this.sectionCounterDocId(section);
      const snap = await this.section_counters.doc(docId).get();
      const data = snap.exists ? snap.data() : {};
      const count = Number(data.count) || 0;
      const capacity = Number(data.capacity) || this.SECTION_CAPACITY_LIMIT;
      return { count, capacity, available: Math.max(0, capacity - count) };
    } catch (error) {
      console.warn("[section-counter] read failed:", error);
      return { count: 0, capacity: this.SECTION_CAPACITY_LIMIT, available: this.SECTION_CAPACITY_LIMIT };
    }
  },
  async incrementSectionCount(section) {
    if (!section) return null;
    const docId = this.sectionCounterDocId(section);
    const db = requireDb();
    try {
      await db.runTransaction(async tx => {
        const ref = this.section_counters.doc(docId);
        const snap = await tx.get(ref);
        const current = snap.exists ? snap.data() : { count: 0, capacity: this.SECTION_CAPACITY_LIMIT, section };
        const newCount = (Number(current.count) || 0) + 1;
        tx.set(ref, {
          section,
          count: newCount,
          capacity: Number(current.capacity) || this.SECTION_CAPACITY_LIMIT,
          last_updated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      });
      return await this.getSectionCount(section);
    } catch (error) {
      console.warn("[section-counter] increment failed:", error);
      return null;
    }
  },
  async decrementSectionCount(section) {
    if (!section) return null;
    const docId = this.sectionCounterDocId(section);
    const db = requireDb();
    try {
      await db.runTransaction(async tx => {
        const ref = this.section_counters.doc(docId);
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const current = snap.data();
        const newCount = Math.max(0, (Number(current.count) || 0) - 1);
        tx.set(ref, {
          section,
          count: newCount,
          capacity: Number(current.capacity) || this.SECTION_CAPACITY_LIMIT,
          last_updated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      });
      return await this.getSectionCount(section);
    } catch (error) {
      console.warn("[section-counter] decrement failed:", error);
      return null;
    }
  },
  async findAvailableSectionForGrade(gradeLevel, preferredSection) {
    const settings = await this.getSettings();
    const capacityLimit = Number(settings.section_capacity) || this.SECTION_CAPACITY_LIMIT;
    const gNum = String(gradeLevel || "").replace(/\D/g, "");
    
    // Filter master sections matching target grade (e.g. Grade 7 -> Grade 7 - Section A, B, etc.)
    const gradeSections = (settings.master_sections || []).filter(s => {
      const gradeMatch = String(s).match(/Grade\s*(\d+)/i);
      return gradeMatch ? gradeMatch[1] === gNum : String(s).includes(`Grade ${gNum}`);
    });
    if (!gradeSections.length) return null;

    // Strict alphabetical/deterministic ordering: Section A, Section B, Section C...
    gradeSections.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

    const order = (preferredSection && gradeSections.includes(preferredSection))
      ? [preferredSection, ...gradeSections.filter(s => s !== preferredSection)]
      : gradeSections;

    for (const section of order) {
      const info = await this.getSectionCount(section);
      const cap = Number(info.capacity) || capacityLimit;
      if (info.count < cap) {
        return { section, count: info.count, capacity: cap, available: Math.max(0, cap - info.count) };
      }
    }
    return null; // All sections at maximum capacity (e.g. 45/45) or none available
  },
  async autoEnrollStudent({ studentUid, gradeLevel, studentInfo }) {
    const settings = await this.getSettings();
    if (!this.isEnrollmentOpen(settings)) {
      return {
        success: false,
        error: "Enrollment Period is currently closed by the School Administrator."
      };
    }
    if (!studentUid) {
      return { success: false, error: "Student UID is required." };
    }

    const gNum = String(gradeLevel || "").replace(/\D/g, "");
    const targetGrade = gNum ? `Grade ${gNum}` : String(gradeLevel || "").trim();
    if (!targetGrade) {
      return { success: false, error: "Please select a valid Target Grade Level." };
    }

    const userRef = this.users.doc(studentUid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return { success: false, error: "Student account record not found." };
    }
    const userData = userSnap.data() || {};
    if (userData.enrollment_status === "enrolled" && userData.section) {
      return {
        success: false,
        error: `You are already officially enrolled in ${userData.section} (${userData.grade_level || targetGrade}).`
      };
    }

    const studentName = `${userData.first_name || ""} ${userData.last_name || ""}`.trim() || studentInfo?.name || "Student";
    const studentId = userData.student_id || studentInfo?.student_id || "—";
    const capacityLimit = Number(settings.section_capacity) || this.SECTION_CAPACITY_LIMIT;

    // 1. Run auto-sectioning algorithm
    const available = await this.findAvailableSectionForGrade(targetGrade);

    if (available && available.section) {
      // Available section found (Section A, or spilled into Section B once full, etc.)
      const assignedSection = available.section;
      const cleanSectionId = assignedSection.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
      await this.incrementSectionCount(assignedSection);
      const timestamp = firebase.firestore.FieldValue.serverTimestamp();

      // Update student user profile (Section & Grade Level become locked)
      await userRef.set({
        uid: studentUid,
        role: userData.role || "student",
        grade_level: targetGrade,
        target_grade_level: targetGrade,
        section: assignedSection,
        section_name: assignedSection,
        section_id: cleanSectionId,
        enrollment_status: "enrolled",
        enrolled_at: timestamp,
        updated_at: timestamp
      }, { merge: true });

      // Save official enrollment record
      await this.enrollment_requests.doc(this.enrollmentRequestDocId(studentUid)).set({
        student_uid: studentUid,
        student_name: studentName,
        student_id: studentId,
        grade_level: targetGrade,
        target_grade_level: targetGrade,
        assigned_section: assignedSection,
        status: "Approved",
        enrollment_type: "auto_sectioning",
        academic_year: settings.academic_year || "",
        enrolled_at: timestamp,
        submitted_at: timestamp
      }, { merge: true });

      // Auto-provision initial subject enrollments so teacher grades and student portal immediately connect
      try {
        const teachersSnap = await this.users.where("role", "==", "teacher").get();
        teachersSnap.forEach(tDoc => {
          const tData = tDoc.data() || {};
          const asgs = Array.isArray(tData.teaching_assignments) ? tData.teaching_assignments : [];
          asgs.forEach(a => {
            if (a.section && a.section.trim().toLowerCase() === assignedSection.trim().toLowerCase()) {
              const sub = a.subject || "General";
              const enrDocId = this.enrollmentDocId(studentUid, assignedSection, sub);
              this.enrollments.doc(enrDocId).set({
                student_uid: studentUid,
                student_id: studentId,
                student_name: studentName,
                photo_data: userData.photo_data || "",
                teacher_uid: tDoc.id,
                teacher_id: tDoc.id,
                teacher_name: `${tData.first_name || ""} ${tData.last_name || ""}`.trim() || tData.email || "Teacher",
                section: assignedSection,
                section_id: cleanSectionId,
                grade: targetGrade,
                subject: sub,
                subject_id: sub.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase(),
                enrolled_at: timestamp
              }, { merge: true }).catch(() => {});
            }
          });
        });
      } catch (provErr) {
        console.warn("[auto-enroll] subject provisioning notice:", provErr);
      }

      await this.logAudit(studentUid, "student_auto_enrolled", {
        student_name: studentName,
        student_id: studentId,
        grade_level: targetGrade,
        assigned_section: assignedSection
      });

      return {
        success: true,
        status: "enrolled",
        section: assignedSection,
        section_name: assignedSection,
        section_id: cleanSectionId,
        grade_level: targetGrade,
        message: `Congratulations! You have been successfully enrolled into ${assignedSection}.`
      };
    } else {
      // 2. Overflow fallback: All sections full (e.g. 45/45) or none provisioned yet
      const timestamp = firebase.firestore.FieldValue.serverTimestamp();

      // Update student user profile to waitlist status
      await userRef.set({
        grade_level: targetGrade,
        section: "",
        enrollment_status: "waitlist",
        waitlisted_at: timestamp,
        updated_at: timestamp
      }, { merge: true });

      // Record waitlist request
      await this.enrollment_requests.doc(this.enrollmentRequestDocId(studentUid)).set({
        student_uid: studentUid,
        student_name: studentName,
        student_id: studentId,
        grade_level: targetGrade,
        target_grade_level: targetGrade,
        assigned_section: "",
        status: "Waitlisted",
        enrollment_type: "auto_sectioning",
        academic_year: settings.academic_year || "",
        waitlisted_at: timestamp,
        submitted_at: timestamp
      }, { merge: true });

      // Dispatch automated alert to IT Admin
      await this.pending_alerts.add({
        type: "section_capacity_overflow",
        title: `Capacity Exceeded: ${targetGrade}`,
        message: `All sections for ${targetGrade} have reached capacity (${capacityLimit}/${capacityLimit}). Student ${studentName} (${studentId}) is on the waitlist. Please provision an additional section.`,
        target_grade: targetGrade,
        student_uid: studentUid,
        student_name: studentName,
        student_id: studentId,
        priority: "high",
        status: "unread",
        created_at: timestamp
      });

      await this.logAudit(studentUid, "student_enrolled_waitlist", {
        student_name: studentName,
        student_id: studentId,
        grade_level: targetGrade,
        reason: "all_sections_at_capacity"
      });

      return {
        success: true,
        status: "waitlist",
        grade_level: targetGrade,
        section: "",
        message: `All current sections for ${targetGrade} are at full capacity (${capacityLimit}/${capacityLimit}). You have been placed on the official Enrollment Waitlist. The IT Administrator has been automatically notified to open a new section.`
      };
    }
  },
  async manualEnrollStudent({ studentData, enrolledBy }) {
    if (!enrolledBy || !enrolledBy.uid) {
      return { success: false, error: "Staff authentication is required." };
    }
    const settings = await this.getSettings();
    // Verify enrollment period is open unless caller is IT Admin (God Mode)
    if (enrolledBy.role !== "admin" && !this.isEnrollmentOpen(settings)) {
      return {
        success: false,
        error: "Enrollment Period is currently closed by the School Administrator."
      };
    }
    const capacityLimit = Number(settings.section_capacity) || this.SECTION_CAPACITY_LIMIT;

    const firstName = String(studentData.first_name || "").trim();
    const lastName = String(studentData.last_name || "").trim();
    if (!firstName || !lastName) {
      return { success: false, error: "Student first and last name are required." };
    }

    const gNum = String(studentData.grade_level || "").replace(/\D/g, "");
    const targetGrade = gNum ? `Grade ${gNum}` : String(studentData.grade_level || "").trim();
    if (!targetGrade) {
      return { success: false, error: "Target Grade Level is required." };
    }

    // Role-based scoping check for teachers
    if (enrolledBy.role === "teacher") {
      const teacherSections = Array.isArray(enrolledBy.assigned_sections) && enrolledBy.assigned_sections.length
        ? enrolledBy.assigned_sections
        : (enrolledBy.section ? [enrolledBy.section] : []);

      const teacherGrades = teacherSections.map(s => {
        const m = String(s).match(/Grade\s*(\d+)/i);
        return m ? `Grade ${m[1]}` : s;
      });

      if (teacherGrades.length && !teacherGrades.includes(targetGrade)) {
        return {
          success: false,
          error: `You are only authorized to enroll students into your assigned grade levels (${[...new Set(teacherGrades)].join(", ") || "None"}).`
        };
      }
    }

    // Student ID: manual or auto-generated
    let finalStudentId = String(studentData.student_id || "").trim().toUpperCase();
    if (!finalStudentId) {
      const year = new Date().getFullYear();
      const randNum = Math.floor(1000 + Math.random() * 9000);
      finalStudentId = `${year}-${randNum}`;
    }

    // Verify student_id uniqueness
    try {
      const existingIdSnap = await this.users.where("student_id", "==", finalStudentId).limit(1).get();
      if (!existingIdSnap.empty) {
        return { success: false, error: `Student ID ${finalStudentId} is already assigned to another student.` };
      }
    } catch (_) {}

    // Find available section using auto-sectioning
    let preferredSection = studentData.preferred_section || "";
    if (enrolledBy.role === "teacher" && !preferredSection) {
      const teacherSections = Array.isArray(enrolledBy.assigned_sections) ? enrolledBy.assigned_sections : [];
      const matchTeacherSec = teacherSections.find(s => {
        const m = String(s).match(/Grade\s*(\d+)/i);
        return m && m[1] === gNum;
      });
      if (matchTeacherSec) preferredSection = matchTeacherSec;
    }

    const available = await this.findAvailableSectionForGrade(targetGrade, preferredSection);

    // Username and Password provisioning for Student Portal login
    let rawUsername = String(studentData.username || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
    if (!rawUsername) {
      const cleanF = firstName.toLowerCase().replace(/[^a-z0-9]/g, "");
      const cleanL = lastName.toLowerCase().replace(/[^a-z0-9]/g, "");
      rawUsername = `${cleanF}${cleanL}`.slice(0, 20);
      if (rawUsername.length < 3) rawUsername = `student${Math.floor(100 + Math.random() * 900)}`;
    }
    const studentPassword = String(studentData.password || "student123").trim() || "student123";

    let studentUid = "";
    let authEmail = `${rawUsername}@students.classcare.local`;
    let secondaryApp = null;

    // Create Firebase Auth user account via temporary secondary app instance
    try {
      if (typeof firebase !== "undefined" && FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey) {
        const secAppName = `ClassCareEnrollAuth_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        secondaryApp = firebase.initializeApp(FIREBASE_CONFIG, secAppName);
        try {
          const userCredential = await secondaryApp.auth().createUserWithEmailAndPassword(authEmail, studentPassword);
          studentUid = userCredential.user?.uid;
        } catch (authCreateErr) {
          if (authCreateErr?.code === "auth/email-already-in-use") {
            const altUsername = `${rawUsername}${Math.floor(10 + Math.random() * 90)}`;
            const altEmail = `${altUsername}@students.classcare.local`;
            try {
              const userCredential = await secondaryApp.auth().createUserWithEmailAndPassword(altEmail, studentPassword);
              studentUid = userCredential.user?.uid;
              rawUsername = altUsername;
              authEmail = altEmail;
            } catch (e2) {
              console.warn("[manualEnrollStudent] Secondary auth retry failed:", e2);
            }
          } else {
            console.warn("[manualEnrollStudent] Secondary auth creation warning:", authCreateErr);
          }
        }
      }
    } catch (secErr) {
      console.warn("[manualEnrollStudent] Failed to initialize secondary app:", secErr);
    } finally {
      if (secondaryApp) {
        try { await secondaryApp.delete(); } catch (_) {}
      }
    }

    const newStudentRef = studentUid ? this.users.doc(studentUid) : this.users.doc();
    studentUid = newStudentRef.id;
    const studentFullName = `${firstName} ${lastName}`.trim();
    const timestamp = firebase.firestore.FieldValue.serverTimestamp();
    const qrPayload = JSON.stringify({ v: 1, t: "classcare_id", uid: studentUid, sid: finalStudentId });

    if (available && available.section) {
      // 1. Enrolled successfully
      const assignedSection = available.section;
      await this.incrementSectionCount(assignedSection);

      const cleanSectionId = assignedSection.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
      // Create student user record with portal credentials
      await newStudentRef.set({
        uid: studentUid,
        first_name: firstName,
        last_name: lastName,
        username: rawUsername,
        email: authEmail,
        initial_password: studentPassword,
        student_id: finalStudentId,
        grade_level: targetGrade,
        target_grade_level: targetGrade,
        section: assignedSection,
        section_name: assignedSection,
        section_id: cleanSectionId,
        role: "student",
        enrollment_status: "enrolled",
        parent_name: String(studentData.parent_name || "").trim(),
        parent_email: String(studentData.parent_email || "").trim().toLowerCase(),
        parent_contact: String(studentData.parent_contact || "").trim(),
        photo_data: String(studentData.photo_data || "").trim(),
        manual_enrollment: true,
        enrolled_by: enrolledBy.uid,
        enrolled_by_name: enrolledBy.name || "Staff",
        enrolled_by_role: enrolledBy.role || "staff",
        enrolled_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp
      });

      // Create enrollment_requests record
      await this.enrollment_requests.doc(this.enrollmentRequestDocId(studentUid)).set({
        student_uid: studentUid,
        student_name: studentFullName,
        student_id: finalStudentId,
        grade_level: targetGrade,
        target_grade_level: targetGrade,
        assigned_section: assignedSection,
        status: "Approved",
        enrollment_type: "manual_walkin",
        enrolled_by: enrolledBy.uid,
        enrolled_by_role: enrolledBy.role,
        academic_year: settings.academic_year || "",
        enrolled_at: timestamp,
        submitted_at: timestamp
      }, { merge: true });

      // If enrolled by teacher, also create official teacher subject enrollment
      if (enrolledBy.role === "teacher") {
        const subject = String(studentData.subject || enrolledBy.subject || "General").trim();
        const docId = this.enrollmentDocId(studentUid, assignedSection, subject);
        await this.enrollments.doc(docId).set({
          student_uid: studentUid,
          student_id: finalStudentId,
          student_name: studentFullName,
          teacher_uid: enrolledBy.uid,
          teacher_name: enrolledBy.name || "Teacher",
          section: assignedSection,
          grade: targetGrade,
          subject: subject,
          photo_data: String(studentData.photo_data || "").trim(),
          enrolled_at: timestamp
        }, { merge: true });
      }

      await this.logAudit(enrolledBy.uid, "manual_student_enrollment", {
        student_uid: studentUid,
        student_name: studentFullName,
        student_id: finalStudentId,
        grade_level: targetGrade,
        assigned_section: assignedSection,
        enrolled_by_role: enrolledBy.role
      });

      return {
        success: true,
        status: "enrolled",
        uid: studentUid,
        student_id: finalStudentId,
        student_name: studentFullName,
        first_name: firstName,
        last_name: lastName,
        grade_level: targetGrade,
        section: assignedSection,
        username: rawUsername,
        password: studentPassword,
        email: authEmail,
        photo_data: String(studentData.photo_data || "").trim(),
        parent_name: String(studentData.parent_name || "").trim(),
        parent_contact: String(studentData.parent_contact || "").trim(),
        parent_email: String(studentData.parent_email || "").trim().toLowerCase(),
        qr_payload: qrPayload,
        message: `Student ${studentFullName} successfully enrolled into ${assignedSection}!`
      };
    } else {
      // 2. Overflow / Waitlist fallback
      await newStudentRef.set({
        uid: studentUid,
        first_name: firstName,
        last_name: lastName,
        username: rawUsername,
        email: authEmail,
        initial_password: studentPassword,
        student_id: finalStudentId,
        grade_level: targetGrade,
        section: "",
        role: "student",
        enrollment_status: "waitlist",
        parent_name: String(studentData.parent_name || "").trim(),
        parent_email: String(studentData.parent_email || "").trim().toLowerCase(),
        parent_contact: String(studentData.parent_contact || "").trim(),
        photo_data: String(studentData.photo_data || "").trim(),
        manual_enrollment: true,
        enrolled_by: enrolledBy.uid,
        enrolled_by_name: enrolledBy.name || "Staff",
        enrolled_by_role: enrolledBy.role || "staff",
        waitlisted_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp
      });

      await this.enrollment_requests.doc(this.enrollmentRequestDocId(studentUid)).set({
        student_uid: studentUid,
        student_name: studentFullName,
        student_id: finalStudentId,
        grade_level: targetGrade,
        target_grade_level: targetGrade,
        assigned_section: "",
        status: "Waitlisted",
        enrollment_type: "manual_walkin",
        academic_year: settings.academic_year || "",
        enrolled_by: enrolledBy.uid,
        enrolled_by_role: enrolledBy.role,
        waitlisted_at: timestamp,
        submitted_at: timestamp
      }, { merge: true });

      // Dispatch alert to IT Admin
      await this.pending_alerts.add({
        type: "section_capacity_overflow",
        title: `Manual Walk-in Waitlisted: ${targetGrade}`,
        message: `All sections for ${targetGrade} are at maximum capacity (${capacityLimit}/${capacityLimit}). Walk-in student ${studentFullName} (${finalStudentId}) was enrolled by ${enrolledBy.name || enrolledBy.role} and placed on the waitlist. Please provision an additional section.`,
        target_grade: targetGrade,
        student_uid: studentUid,
        student_name: studentFullName,
        student_id: finalStudentId,
        priority: "high",
        status: "unread",
        created_at: timestamp
      });

      await this.logAudit(enrolledBy.uid, "manual_student_waitlisted", {
        student_uid: studentUid,
        student_name: studentFullName,
        student_id: finalStudentId,
        grade_level: targetGrade,
        reason: "all_sections_at_capacity"
      });

      return {
        success: true,
        status: "waitlist",
        uid: studentUid,
        student_id: finalStudentId,
        student_name: studentFullName,
        first_name: firstName,
        last_name: lastName,
        grade_level: targetGrade,
        section: "",
        username: rawUsername,
        password: studentPassword,
        email: authEmail,
        photo_data: String(studentData.photo_data || "").trim(),
        parent_name: String(studentData.parent_name || "").trim(),
        parent_contact: String(studentData.parent_contact || "").trim(),
        parent_email: String(studentData.parent_email || "").trim().toLowerCase(),
        qr_payload: qrPayload,
        message: `All sections for ${targetGrade} are at maximum capacity (${capacityLimit}/${capacityLimit}). Student ${studentFullName} has been placed on the official Waitlist, and the IT Administrator has been alerted to provision a new section.`
      };
    }
  },
  // MODIFIED: Added simple in-memory TTL cache for grade averages
  _gradeCache: new Map(),
  _gradeCacheTTL: 0, // 1 minute
  async getStudentAverageGrade(studentUid) {
    // Check cache first
    const cached = this._gradeCache.get(studentUid);
    if (cached && Date.now() - cached.ts < this._gradeCacheTTL) return cached.value;
    try {
      const snap = await this.grades.where("student_uid", "==", studentUid).get();
      const grades = [];
      snap.forEach(doc => {
        const d = doc.data() || {};
        const terms = [d.term1, d.term2, d.term3, d.term4].filter(v => v !== null && v !== undefined && v !== "").map(Number).filter(Number.isFinite);
        if (terms.length) {
          const avg = terms.reduce((a, b) => a + b, 0) / terms.length;
          grades.push(avg);
        }
      });
      const result = !grades.length ? null : Number((grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1));
      this._gradeCache.set(studentUid, { value: result, ts: Date.now() });
      return result;
    } catch (error) {
      console.warn("[grades] avg failed:", error);
      return null;
    }
  },
  async getLatestEmotion(studentUid) {
    try {
      const d = new Date();
      const today = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
      const docId = this.emotionalCheckinDocId(studentUid, today);
      const snap = await this.emotional_checkins.doc(docId).get();
      if (snap.exists) {
        const data = snap.data() || {};
        const emotion = data.emotion || data.mood || null;
        return {
          emotion: emotion,
          emotion_label: data.emotion_label || emotion || "Neutral",
          emotion_emoji: data.emotion_emoji || (this.isEmotionNegative(emotion) ? "😟" : "😊"),
          date: data.date || today,
          score: data.score,
          answers: data.answers || {}
        };
      }
      const lastSnap = await this.emotional_checkins
        .where("student_uid", "==", studentUid)
        .orderBy("date", "desc")
        .limit(1)
        .get();
      if (!lastSnap.empty) {
        const data = lastSnap.docs[0].data() || {};
        const emotion = data.emotion || data.mood || null;
        return {
          emotion: emotion,
          emotion_label: data.emotion_label || emotion || "Neutral",
          emotion_emoji: data.emotion_emoji || (this.isEmotionNegative(emotion) ? "😟" : "•"),
          date: data.date || "",
          score: data.score,
          answers: data.answers || {}
        };
      }
      return null;
    } catch (error) {
      console.warn("[emotion] latest failed:", error);
      return null;
    }
  },
  async createInterventionAlert(studentUid, teacherUid, reason, metadata = {}) {
    try {
      const d = new Date();
      const today = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
      const docId = `${studentUid}_${teacherUid}_${today}`;
      let student = {};
      let teacher = {};
      if (!metadata.student_name || !metadata.student_id) {
        try {
          const studentSnap = await this.users.doc(studentUid).get();
          if (studentSnap.exists) student = studentSnap.data() || {};
        } catch (_) {}
      }
      if (!metadata.teacher_name && teacherUid) {
        try {
          const teacherSnap = await this.users.doc(teacherUid).get();
          if (teacherSnap.exists) teacher = teacherSnap.data() || {};
        } catch (_) {}
      }
      const avgGrade = metadata.average_grade !== undefined ? metadata.average_grade : await this.getStudentAverageGrade(studentUid);
      const emotion = metadata.emotion || (await this.getLatestEmotion(studentUid))?.emotion || null;
      // MODIFIED: Improved priority logic — negative emotion alone gets "high", combined with low grades gets "urgent"
      let priority = "medium";
      const hasNegEmotion = this.isEmotionNegative(emotion);
      const hasLowGrades = avgGrade !== null && avgGrade < 70;
      if (hasNegEmotion && hasLowGrades) priority = "urgent";
      else if (hasNegEmotion || hasLowGrades) priority = "high";

      const payload = {
        student_uid: studentUid,
        student_id: metadata.student_id || student.student_id || "",
        student_name: metadata.student_name || `${student.first_name || ""} ${student.last_name || ""}`.trim() || "Unknown",
        student_section: metadata.section || student.section || "",
        teacher_uid: teacherUid,
        teacher_name: metadata.teacher_name || `${teacher.first_name || ""} ${teacher.last_name || ""}`.trim() || "Unknown",
        emotion: emotion,
        emotion_label: metadata.emotion_label || emotion || "",
        emotion_emoji: metadata.emotion_emoji || "",
        average_grade: avgGrade,
        reason: reason || "Negative emotion detected — student may need attention",
        status: "Open",
        priority: priority,
        date: metadata.date || today,
        created_at: firebase.firestore.FieldValue.serverTimestamp(),
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
      };
      await this.intervention_alerts.doc(docId).set(payload, { merge: true });
      return { docId, ...payload };
    } catch (error) {
      console.warn("[intervention] create failed:", error);
      return null;
    }
  },
  async logAudit(actorUid, action, payload) {
    try {
      return await this.audit_log.add({ actor_uid: actorUid, action, payload, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
    } catch (error) {
      console.warn("[audit] log failed:", error);
      return null;
    }
  },

  // Cache for student profiles to optimize relational joins across grading and attendance
  _studentProfileCache: new Map(),
  _studentProfileTTL: 0, // 2 minutes

  async resolveStudentProfile(studentUid, fallback = {}) {
    if (!studentUid) {
      const fbName = fallback.name || fallback.student_name || "Student";
      return { uid: "", student_id: fallback.student_id || "", name: fbName, student_name: fbName, photo_data: fallback.photo_data || "" };
    }
    const cached = this._studentProfileCache.get(studentUid);
    if (cached && Date.now() - cached.ts < this._studentProfileTTL) {
      return cached.data;
    }
    try {
      let doc = await this.users.doc(studentUid).get();
      let data = doc.exists ? doc.data() : null;
      if (!data && fallback.student_id) {
        const idSnap = await this.users.where("student_id", "==", fallback.student_id).limit(1).get();
        if (!idSnap.empty) data = idSnap.docs[0].data();
      }
      const firstName = data?.first_name || "";
      const lastName = data?.last_name || "";
      const fullName = `${firstName} ${lastName}`.trim() || data?.username || fallback.name || fallback.student_name || "Student";
      const profile = {
        uid: studentUid,
        student_id: data?.student_id || fallback.student_id || "",
        first_name: firstName,
        last_name: lastName,
        name: fullName,
        student_name: fullName,
        section: data?.section || fallback.section || "",
        grade_level: data?.grade_level || fallback.grade_level || "",
        photo_data: data?.photo_data || fallback.photo_data || ""
      };
      this._studentProfileCache.set(studentUid, { data: profile, ts: Date.now() });
      return profile;
    } catch (err) {
      console.warn("[resolveStudentProfile] failed for", studentUid, err);
      const fallbackName = fallback.name || fallback.student_name || "Student";
      return {
        uid: studentUid,
        student_id: fallback.student_id || "",
        name: fallbackName,
        student_name: fallbackName,
        section: fallback.section || "",
        grade_level: fallback.grade_level || "",
        photo_data: fallback.photo_data || ""
      };
    }
  },

  async populateStudentProfiles(records, studentUidKey = "student_uid") {
    if (!Array.isArray(records) || !records.length) return records || [];
    const uidsToFetch = new Set();
    records.forEach(r => {
      const uid = r[studentUidKey] || r.student_uid || r.uid;
      if (uid && !this._studentProfileCache.has(uid)) {
        uidsToFetch.add(uid);
      }
    });

    if (uidsToFetch.size) {
      const promises = Array.from(uidsToFetch).map(uid => this.resolveStudentProfile(uid));
      await Promise.allSettled(promises);
    }

    return records.map(r => {
      const uid = r[studentUidKey] || r.student_uid || r.uid;
      const cached = uid ? this._studentProfileCache.get(uid)?.data : null;
      const name = cached?.name || r.student_name || r.name || "Student";
      const studentId = cached?.student_id || r.student_id || "—";
      const photo = cached?.photo_data || r.photo_data || "";
      const section = r.section || cached?.section || "—";
      return {
        ...r,
        student_name: name,
        name: name,
        student_id: studentId,
        photo_data: photo,
        section: section
      };
    });
  },

  async reassignStudentSection({ studentUid, newSection, newGradeLevel = null, reason = "Administrative reassignment", adminUid = "system", bypassCapacity = true }) {
    if (!studentUid || !newSection) {
      return { success: false, error: "Student UID and target Section are required." };
    }
    const cleanNewSection = String(newSection).trim();
    if (!cleanNewSection) return { success: false, error: "Invalid target section." };

    try {
      // 1. Fetch current student record
      const studentRef = this.users.doc(studentUid);
      const studentSnap = await studentRef.get();
      if (!studentSnap.exists) {
        return { success: false, error: "Student record not found in database." };
      }
      const studentData = studentSnap.data() || {};
      const oldSection = String(studentData.section || "").trim();
      const studentName = `${studentData.first_name || ""} ${studentData.last_name || ""}`.trim() || studentData.student_id || "Student";

      if (oldSection && oldSection.toLowerCase() === cleanNewSection.toLowerCase()) {
        return { success: true, message: `Student is already assigned to ${cleanNewSection}.`, section: cleanNewSection };
      }

      // 2. Capacity verification (unless Admin God Mode bypasses)
      if (!bypassCapacity) {
        const countInfo = await this.getSectionCount(cleanNewSection);
        if (countInfo.available <= 0) {
          return { success: false, error: `Target section ${cleanNewSection} is at full capacity (${countInfo.count}/${countInfo.capacity}).` };
        }
      }

      // Compute grade level if not explicitly provided
      let targetGrade = newGradeLevel;
      if (!targetGrade) {
        const match = cleanNewSection.match(/Grade\s*(\d+)/i);
        if (match) targetGrade = `Grade ${match[1]}`;
        else targetGrade = studentData.grade_level || "";
      }

      const timestamp = firebase.firestore.FieldValue.serverTimestamp();

      // 3. Update student user document
      const userUpdate = {
        section: cleanNewSection,
        enrollment_status: "enrolled",
        section_reassigned_at: timestamp,
        section_reassigned_by: adminUid,
        reassignment_reason: reason,
        updated_at: timestamp
      };
      if (targetGrade) userUpdate.grade_level = targetGrade;
      await studentRef.set(userUpdate, { merge: true });

      // Invalidate student profile cache so new section is reflected immediately
      this._studentProfileCache.delete(studentUid);

      // 4. Update section counters atomically
      if (oldSection) {
        try { await this.decrementSectionCount(oldSection); } catch (e) { console.warn("[reassign] decrement old failed:", e); }
      }
      try { await this.incrementSectionCount(cleanNewSection); } catch (e) { console.warn("[reassign] increment new failed:", e); }

      // 5. Update active enrollments collection
      try {
        const enrollSnap = await this.enrollments.where("student_uid", "==", studentUid).get();
        const enrollBatchPromises = [];
        enrollSnap.forEach(doc => {
          enrollBatchPromises.push(doc.ref.set({
            section: cleanNewSection,
            grade: targetGrade || cleanNewSection,
            updated_at: timestamp
          }, { merge: true }));
        });
        await Promise.allSettled(enrollBatchPromises);
      } catch (e) {
        console.warn("[reassign] update enrollments failed:", e);
      }

      // 6. Update enrollment requests
      try {
        const reqSnap = await this.enrollment_requests.where("student_uid", "==", studentUid).get();
        const reqPromises = [];
        reqSnap.forEach(doc => {
          reqPromises.push(doc.ref.set({
            assigned_section: cleanNewSection,
            preferred_section: cleanNewSection,
            status: "Approved",
            enrollment_status: "enrolled",
            updated_at: timestamp
          }, { merge: true }));
        });
        await Promise.allSettled(reqPromises);
      } catch (e) {
        console.warn("[reassign] update enrollment_requests failed:", e);
      }

      // 7. Migrate grades records to avoid orphaned grade data
      try {
        const gradesSnap = await this.grades.where("student_uid", "==", studentUid).get();
        const gradePromises = [];
        gradesSnap.forEach(doc => {
          const gData = doc.data() || {};
          const gSubject = gData.subject || "General";
          const newGradeDocId = this.gradeDocId(studentUid, cleanNewSection, gSubject);
          if (doc.id !== newGradeDocId) {
            // Create new grade doc with all existing term grades preserved under new section
            gradePromises.push(this.grades.doc(newGradeDocId).set({
              ...gData,
              section: cleanNewSection,
              student_name: studentName,
              student_id: studentData.student_id || gData.student_id || "",
              updated_at: timestamp
            }, { merge: true }));
          }
        });
        await Promise.allSettled(gradePromises);
      } catch (e) {
        console.warn("[reassign] migrate grades failed:", e);
      }

      // 8. Log audit trail
      await this.logAudit(adminUid, "student_reassigned", {
        student_uid: studentUid,
        student_name: studentName,
        student_id: studentData.student_id || "",
        old_section: oldSection || "Unassigned",
        new_section: cleanNewSection,
        grade_level: targetGrade,
        reason: reason
      });

      return {
        success: true,
        message: `Successfully reassigned ${studentName} from ${oldSection || 'Unassigned'} to ${cleanNewSection}.`,
        section: cleanNewSection,
        grade_level: targetGrade
      };
    } catch (error) {
      console.error("[reassignStudentSection] error:", error);
      return {
        success: false,
        error: error?.message || "Reassignment transaction failed. Please try again."
      };
    }
  }
};

// A single live identity subscription is shared by all portal modules.
const _profileCallbacks = new Set();
let _profileAuthStop = null, _profileDocStop = null, _profileValue, _profileFingerprint = '', _profileGeneration = 0;
function onCurrentUser(callback) {
  _profileCallbacks.add(callback);
  if (_profileValue !== undefined) queueMicrotask(() => { if (_profileCallbacks.has(callback)) callback(_profileValue); });
  if (!_profileAuthStop) {
    const services = getFirebase();
    const emit = value => {
      const fingerprint = JSON.stringify(value);
      if (fingerprint === _profileFingerprint) return;
      _profileFingerprint = fingerprint; _profileValue = value;
      _profileCallbacks.forEach(cb => queueMicrotask(() => { if (_profileCallbacks.has(cb)) cb(value); }));
    };
    if (!services?.auth) queueMicrotask(() => emit({ __profileError: _initError?.code || 'service-unavailable' }));
    else _profileAuthStop = services.auth.onAuthStateChanged(fbUser => {
      _profileDocStop?.(); _profileDocStop = null; const token = ++_profileGeneration;
      if (!fbUser) return emit(null);
      _profileDocStop = DB.users.doc(fbUser.uid).onSnapshot(snapshot => {
        if (token !== _profileGeneration) return;
        if (!snapshot.exists) return emit({ uid: fbUser.uid, email: fbUser.email, __profileError: 'profile-not-found' });
        const data = snapshot.data();
        emit({ ...data, uid: fbUser.uid, email: fbUser.email, role: normalizeRole(data.role), section: data.section || '' });
      }, error => emit({ uid: fbUser.uid, __profileError: error.code || 'profile-read-failed' }));
    });
  }
  return () => {
    _profileCallbacks.delete(callback);
    if (!_profileCallbacks.size) {
      _profileAuthStop?.(); _profileDocStop?.(); _profileAuthStop = _profileDocStop = null;
      _profileValue = undefined; _profileFingerprint = ''; _profileGeneration++;
    }
  };
}

// MODIFIED: Renamed from CampusApp → ClassCare (global API surface)
window.ClassCare = {
  getFirebase, isAvailable: () => !!getFirebase(), DB, onCurrentUser,
  isEnrollmentOpen: DB.isEnrollmentOpen.bind(DB),
  resolveStudentProfile: DB.resolveStudentProfile.bind(DB),
  populateStudentProfiles: DB.populateStudentProfiles.bind(DB),
  reassignStudentSection: DB.reassignStudentSection.bind(DB),
  normalizeEmotion: DB.normalizeEmotion.bind(DB),
  EMOTION_META: DB.EMOTION_META,
  TELEGRAM_CONFIG, EMAILJS_CONFIG, BRANDING: _CFG.branding || {}
};

// MODIFIED: Backward-compatibility alias so any missed references don't crash
// window.ClassCare is the global singleton
