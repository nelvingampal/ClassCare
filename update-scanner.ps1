
$content = Get-Content -Path 'teacher/scanner.js' -Raw

$startMarker = '  async function stopScanner() {'
$endMarker = '  async function fireTelegramAlert(student, status, meta) {'

$startPos = $content.IndexOf($startMarker)
$endPos = $content.IndexOf($endMarker)

if ($startPos -lt 0 -or $endPos -lt 0) {
    Write-Error "Markers not found! startPos: $startPos, endPos: $endPos"
    exit 1
}

$replacement = @'
  async function stopScanner() {
    clearEmotionFlow();
    if (!State.scanner || State.transitioning) return;
    State.transitioning = true; const button = $("#btn-stop-scan"); Utils.setLoading(button, true);
    try { await withTimeout(Promise.resolve().then(() => State.scanner.stop()), 2500); } catch (_) {} try { State.scanner.clear(); } catch (_) {}
    State.scanner = null; State.scanning = false; State.transitioning = false; setScannerState("stopped", "Start the camera again when you are ready."); Utils.setLoading(button, false);
  }
  function cleanupScanner() {
    State.unsubscribeAttendance?.(); State.unsubscribeAttendance = null;
    if (State._unsubUsers) { State._unsubUsers(); State._unsubUsers = null; }
    if (State.nextDayTimer) { clearTimeout(State.nextDayTimer); State.nextDayTimer = null; }
    if (State.scanner) { State.scanner.stop().catch(() => {}); State.scanner.clear?.(); State.scanner = null; }
    State.scanning = false; State.scanInFlight = false;
    stopEmotionDetection();
    clearEmotionFlow();
  }

  function applyCameraOrientation(video) {
    const target = video || document.querySelector("#scanner-root video");
    if (!target) return;
    target.style.transform = "none";
    target.style.webkitTransform = "none";
    target.style.objectFit = "cover";
    target.style.mirror = "none";
  }

  function stopEmotionDetection() {
    if (State.emotion?.detector) {
      clearInterval(State.emotion.detector);
      State.emotion.detector = null;
    }
    if (State.emotion?.handTracker) {
      try { State.emotion.handTracker.close?.(); } catch (_) {}
      State.emotion.handTracker = null;
    }
  }

  function startEmotionDetection(student) {
    if (!student?.uid || !window.Hands) return;
    stopEmotionDetection();
    const panel = document.querySelector("#emotion-panel");
    if (!panel || panel.classList.contains("hidden")) return;
    const video = document.querySelector("#scanner-root video");
    if (!video) return;
    let candidateSide = "";
    let candidateFrames = 0;
    let candidateSince = 0;
    let lastAnswerAt = 0;
    let waitingForCenter = false;
    const handDetector = new window.Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    handDetector.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.6
    });

    handDetector.onResults((results) => {
      const handPoints = results.multiHandLandmarks && results.multiHandLandmarks[0];
      if (!handPoints || !panel || panel.classList.contains("hidden")) {
        candidateSide = "";
        candidateFrames = 0;
        return;
      }

      const palmPoints = [handPoints[0], handPoints[5], handPoints[9], handPoints[13], handPoints[17]].filter(Boolean);
      if (palmPoints.length < 3) return;
      const palmX = palmPoints.reduce((total, point) => total + Number(point.x || 0), 0) / palmPoints.length;

      const side = palmX < 0.40 ? "no" : palmX > 0.58 ? "yes" : "";
      if (!side) {
        candidateSide = "";
        candidateFrames = 0;
        candidateSince = 0;
        waitingForCenter = false;
        return;
      }
      if (waitingForCenter) return;
      const now = Date.now();
      if (candidateSide === side) candidateFrames += 1;
      else { candidateSide = side; candidateFrames = 1; candidateSince = now; }
      const holdMs = side === "yes" ? 1350 : 1150;
      if (candidateFrames < 6 || now - candidateSince < holdMs || now - lastAnswerAt < 1400) return;

      const button = panel.querySelector(side === "no" ? ".emotion-choice-left" : ".emotion-choice-right");
      if (!button || button.disabled) return;
      lastAnswerAt = Date.now();
      candidateSide = "";
      candidateFrames = 0;
      candidateSince = 0;
      waitingForCenter = true;
      button.click();
    });

    State.emotion.handTracker = handDetector;
    State.emotion.detector = setInterval(async () => {
      if (!panel || panel.classList.contains("hidden") || !video || video.readyState < 2) return;
      try {
        await handDetector.send({ image: video });
      } catch (_) {}
    }, 180);
  }

  function clearEmotionFlow() {
    if (State.emotion?.timer) clearTimeout(State.emotion.timer);
    stopEmotionDetection();
    const panel = $("#emotion-panel");
    panel?.classList.add("hidden");
    if (panel) panel.innerHTML = "";
    State.emotion = { studentUid: "", questionIndex: 0, answers: Array(EMOTION_QUESTIONS.length).fill(null), timer: null, detector: null, handTracker: null };
  }

  function renderEmotionPrompt(student, questionIndex) {
    if (!student || !student.uid) return;
    const panel = $("#emotion-panel");
    if (!panel) return;
    const question = EMOTION_QUESTIONS[questionIndex];
    if (!question) {
      panel.classList.add("hidden");
      panel.innerHTML = "";
      stopEmotionDetection();
      return;
    }
    State.emotion.questionIndex = questionIndex;
    State.emotion.studentUid = student.uid;
    panel.classList.remove("hidden");
    panel.innerHTML = `
      <div class="emotion-header">
        <div>
          <div class="emotion-label">Quick check-in</div>
          <div class="emotion-title">${questionIndex + 1}/${EMOTION_QUESTIONS.length}</div>
        </div>
        <span class="emotion-counter">${questionIndex + 1}/${EMOTION_QUESTIONS.length}</span>
      </div>
      <div class="emotion-question">
        <div class="emotion-question-text">${escapeHtml(question)}</div>
        <div class="emotion-answer-row">
          <button type="button" class="emotion-choice emotion-choice-left" data-emotion-answer="no" aria-label="No for ${escapeAttr(question)}"><span class="emotion-head emotion-head-left" aria-hidden="true"></span></button>
          <button type="button" class="emotion-choice emotion-choice-right" data-emotion-answer="yes" aria-label="Yes for ${escapeAttr(question)}"><span class="emotion-head emotion-head-right" aria-hidden="true"></span></button>
        </div>
      </div>
    `;
    panel.querySelectorAll(".emotion-choice").forEach(button => {
      button.addEventListener("click", () => {
        const answer = button.dataset.emotionAnswer;
        State.emotion.answers[questionIndex] = answer;
        panel.querySelectorAll(".emotion-choice").forEach(item => item.classList.toggle("is-selected", item.dataset.emotionAnswer === answer));
        saveEmotionSurvey(student, State.emotion.answers);
        const nextQuestion = questionIndex + 1;
        if (nextQuestion < EMOTION_QUESTIONS.length) {
          setTimeout(() => renderEmotionPrompt(student, nextQuestion), 380);
        } else {
          setTimeout(() => { panel.classList.add("hidden"); panel.innerHTML = ""; stopEmotionDetection(); }, 700);
        }
      });
    });
    applyCameraOrientation();
    startEmotionDetection(student);
  }

  async function saveEmotionSurvey(student, answers) {
    if (!student?.uid || !Array.isArray(answers) || !answers.length) return;
    const payload = {
      student_uid: student.uid,
      date: Utils.todayIso(),
      answers,
      checked_by: State.teacher?.uid,
      checked_at: firebase.firestore.FieldValue.serverTimestamp()
    };
    try {
      const docId = CampusApp.DB.attendanceDocId(student.uid, payload.date);
      await CampusApp.DB.attendance.doc(docId).set({ emotion_checkin: answers }, { merge: true });
      const record = State.attendance.get(student.uid);
      if (record) {
        State.attendance.set(student.uid, { ...record, emotion_checkin: [...answers] });
        renderAttendanceTable();
        renderEmotionReport();
      }
    } catch (error) {
      console.warn("[teacher] emotion survey not saved:", error);
    }
  }

  async function handleDecodedText(raw, { fromScanner = false } = {}) {
    let payload; try { payload = JSON.parse(String(raw || "").trim()); if (!payload || payload.t !== "campus_id" || !payload.uid) throw new Error("invalid"); } catch (_) { return showResultError("Invalid QR code", "This QR code is not a Campus student ID."); }
    const student = State.students.get(payload.uid) || await lookupStudent(payload.uid);
    if (!student || student.role !== "student") return showResultError("Unknown student", "No record for this ID is in the school roster.");
    if (payload.sid && student.student_id && payload.sid !== student.student_id) return showResultError("QR mismatch", "The Student ID does not match the school roster.");
    State.students.set(student.uid, student);
    if (student.section) State.sections.add(student.section);
    const existing = State.attendance.get(student.uid);
    if (existing?.time_in) {
      showResult(student, existing.status || "Present", existing.time_in, existing.minutes_late || 0, "duplicate", existing);
      if (Date.now() - State.lastDuplicateAlertTs > 45000) { State.lastDuplicateAlertTs = Date.now(); fireTelegramAlert(student, existing.status || "Present", existing); }
      return;
    }
    const timeIn = Utils.nowHhMm(); const status = Utils.computeStatus(timeIn, State.settings.school_start_time, State.settings.late_grace_period); const minutesLate = status === "Late" ? Math.max(0, Utils.minutesBetween(timeIn, State.settings.school_start_time) - State.settings.late_grace_period) : 0;
    const record = {
      student_uid: student.uid,
      student_name: `${student.first_name || ""} ${student.last_name || ""}`.trim() || student.email || "Student",
      student_id: student.student_id || "",
      photo_data: student.photo_data || "",
      date: Utils.todayIso(),
      time_in: timeIn,
      status,
      minutes_late: minutesLate,
      section: student.section || State.section || "",
      scanned_by: State.teacher?.uid
    };
    let saved = false;
    if (navigator.onLine) { try { await CampusApp.DB.attendance.doc(CampusApp.DB.attendanceDocId(student.uid, record.date)).set({ ...record, scanned_at: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }); saved = true; } catch (error) { console.warn("[teacher] attendance write failed:", error); } }
    if (!saved) { try { await OfflineSync.enqueueAttendance(record); record._pending = true; } catch (error) { return showResultError("Attendance not saved", "The record could not be saved locally. Try again."); } }
    State.attendance.set(student.uid, record); renderAttendanceTable(); renderStats(); updateChooser(); showResult(student, status, timeIn, minutesLate, record._pending ? "queued" : "saved", record); fireTelegramAlert(student, status, record);
  }
  async function lookupStudent(uid) { try { const snapshot = await CampusApp.DB.users.doc(uid).get(); if (!snapshot.exists) return null; const student = studentFromDoc(snapshot); State.students.set(student.uid, student); if (student.section) State.sections.add(student.section); return student; } catch (_) { return null; } }

  function showResult(student, status, timeIn, minutesLate, kind = "saved", record = {}) {
    currentScanKey = `${student.uid || ""}_${timeIn}`;
    const line = $("#scan-status-strip"); const icon = $("#scan-emoji"); const label = $("#scan-status-label"); const sub = $("#scan-status-sub");
    line.className = `scan-status-line status-${status.toLowerCase() === "present" ? "present" : status.toLowerCase() === "late" ? "late" : "error"}`;
    icon.replaceChildren(document.createTextNode(status === "Present" ? "✓" : status === "Late" ? "!" : "i"));
    label.textContent = kind === "duplicate" ? "Already recorded" : status; sub.textContent = kind === "duplicate" ? `Already recorded at ${timeIn}.` : kind === "queued" ? "Saved locally and waiting to sync." : "Attendance recorded.";
    setStudentResult(student); $("#scan-time").textContent = timeIn || "—"; $("#scan-late-by").textContent = status === "Late" && minutesLate ? `Late by ${minutesLate} minutes` : kind === "duplicate" ? "No new record created" : "Within the expected arrival window";
    const alert = $("#scan-alert-row"); alert.className = `scan-alert ${kind === "queued" ? "alert-warning" : ""}`; $("#scan-alert-text").textContent = kind === "queued" ? "Waiting to sync. Parent alert will be attempted when connected." : kind === "duplicate" ? "No parent alert sent for a duplicate scan." : "Parent alert status will appear here.";
    if (kind === "duplicate") { $("#scan-alert-icon")?.replaceChildren(document.createTextNode("i")); alert.className = "scan-alert"; $("#scan-alert-text").textContent = "Attendance already recorded. Parent alert delivery is being retried."; }
    if (record?.status) renderAttendanceTable();
    clearEmotionFlow();
    State.emotion = { studentUid: student.uid, questionIndex: 0, answers: Array(EMOTION_QUESTIONS.length).fill(null), timer: null, detector: null, handTracker: null };
    State.emotion.timer = setTimeout(() => renderEmotionPrompt(student, 0), EMOTION_DELAY_MS);
  }
  function setStudentResult(student) {
    const avatar = $("#scan-avatar"); if (avatar) { avatar.replaceChildren(); if (student.photo_data) { const image = document.createElement("img"); image.src = student.photo_data; image.alt = `${student.first_name || "Student"} photo`; avatar.appendChild(image); } else avatar.appendChild(document.createTextNode(initialsOf(student))); }
    $("#scan-name").textContent = `${student.first_name || ""} ${student.last_name || ""}`.trim() || "Student"; $("#scan-id").textContent = `Student ID ${student.student_id || "—"}`; $("#scan-section").textContent = `Section ${student.section || "—"}`;
  }
  function showResultError(title, message) {
    clearEmotionFlow();
    const line = $("#scan-status-strip"); line.className = "scan-status-line status-error"; $("#scan-emoji").replaceChildren(document.createTextNode("!")); $("#scan-status-label").textContent = title; $("#scan-status-sub").textContent = message; $("#scan-name").textContent = "No attendance recorded"; $("#scan-id").textContent = "Student ID —"; $("#scan-section").textContent = "Section —"; $("#scan-time").textContent = Utils.nowHhMm(); $("#scan-late-by").textContent = "Try another code"; const alert = $("#scan-alert-row"); alert.className = "scan-alert alert-warning"; $("#scan-alert-text").textContent = "No attendance record was created.";
  }

'@

$newContent = $content.Substring(0, $startPos) + $replacement + "`n  " + $content.Substring($endPos)
[System.IO.File]::WriteAllText('teacher/scanner.js', $newContent, [System.Text.Encoding]::UTF8)
Write-Host "Successfully updated teacher/scanner.js"
