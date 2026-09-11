(function () {
  'use strict';
  const $ = id => document.getElementById(id), H = ClassCareHolistic, K = ClassCareKioskData;
  const deep = document.body.dataset.kiosk === 'deep';
  let user, settings = {}, settingsReady = false, scanner, cameraWanted = false, scanStarting = false, busy = false, generation = 0;
  let student, answers = [], checkId, gesture, saving = false, resetTimer, lastRaw = '', lastScan = 0;
  const title = deep ? 'Deep Emotional Check' : 'Daily Attendance';
  $('kiosk-title').textContent = title; document.title = `${title} · ClassCare`;
  $('kiosk-description').textContent = deep ? 'Five questions about feelings, stress, motivation, support, and needs.' : 'Scan your student ID and choose how you feel today.';
  const status = text => { $('kiosk-status').textContent = text; };
  function playFeedback(type = 'success') {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.23);
      } else {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(392, now + 0.08);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.26);
      }
    } catch (_) {}
  }

  let kioskMultiScaleId = null;
  let kioskOffscreenCanvas = null;
  let kioskOffscreenCtx = null;
  let kioskNativeDetector = null;

  if (typeof window !== 'undefined' && typeof window.BarcodeDetector === 'function') {
    try {
      kioskNativeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
    } catch (_) {}
  }

  function stopKioskSensitivityLoop() {
    if (kioskMultiScaleId) {
      cancelAnimationFrame(kioskMultiScaleId);
      kioskMultiScaleId = null;
    }
  }

  function startKioskSensitivityLoop(video) {
    stopKioskSensitivityLoop();
    if (!video) return;

    if (!kioskOffscreenCanvas) {
      kioskOffscreenCanvas = document.createElement('canvas');
      kioskOffscreenCtx = kioskOffscreenCanvas.getContext('2d', { willReadFrequently: true });
    }

    let lastScanTs = 0;
    let step = 0;

    async function loop(now) {
      if (!scanner || busy || !video || video.paused || video.ended) {
        kioskMultiScaleId = null;
        return;
      }

      if (now - lastScanTs >= 55) {
        lastScanTs = now;
        step++;
        const vw = video.videoWidth;
        const vh = video.videoHeight;

        if (vw >= 80 && vh >= 80) {
          let detected = null;

          // 1. Hardware BarcodeDetector
          if (kioskNativeDetector) {
            try {
              const res = await kioskNativeDetector.detect(video);
              if (res && res.length > 0 && res[0].rawValue) detected = res[0].rawValue;
            } catch (_) {}
          }

          // 2. Multi-scale jsQR
          if (!detected && window.jsQR) {
            // Pass A: Center 55% Crop (2x Magnified Zoom)
            const cw = Math.floor(vw * 0.55);
            const ch = Math.floor(vh * 0.55);
            const cx = Math.floor((vw - cw) / 2);
            const cy = Math.floor((vh - ch) / 2);
            const targetDim = 440;

            kioskOffscreenCanvas.width = targetDim;
            kioskOffscreenCanvas.height = targetDim;
            kioskOffscreenCtx.drawImage(video, cx, cy, cw, ch, 0, 0, targetDim, targetDim);
            let imgData = kioskOffscreenCtx.getImageData(0, 0, targetDim, targetDim);

            let qr = window.jsQR(imgData.data, targetDim, targetDim, { inversionAttempts: 'attemptBoth' });
            if (qr && qr.data) detected = qr.data;

            // Pass B: Full frame
            if (!detected) {
              const fw = 512;
              const fh = Math.floor((vh / vw) * fw) || 384;
              kioskOffscreenCanvas.width = fw;
              kioskOffscreenCanvas.height = fh;
              kioskOffscreenCtx.drawImage(video, 0, 0, fw, fh);
              imgData = kioskOffscreenCtx.getImageData(0, 0, fw, fh);
              qr = window.jsQR(imgData.data, fw, fh, { inversionAttempts: 'dontInvert' });
              if (qr && qr.data) detected = qr.data;
            }
          }

          if (detected) {
            scan(detected);
          }
        }
      }

      if (scanner && !busy) {
        kioskMultiScaleId = requestAnimationFrame(loop);
      }
    }

    kioskMultiScaleId = requestAnimationFrame(loop);
  }

  async function stopScanner() {
    stopKioskSensitivityLoop();
    if (scanner) {
      const current = scanner; scanner = null;
      try { if (current.isScanning) await current.stop(); current.clear(); } catch (_) {}
    }
  }
  async function startScanner() {
    if (scanner || scanStarting || busy || !user || !cameraWanted) return;
    scanStarting = true; const token = generation;
    try {
      if (!window.Html5Qrcode) throw new Error('QR library unavailable.');
      const formats = window.Html5QrcodeSupportedFormats ? [window.Html5QrcodeSupportedFormats.QR_CODE] : undefined;
      const current = scanner = new Html5Qrcode('qr-camera', {
        formatsToSupport: formats,
        verbose: false,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true }
      });
      const qrbox = (w, h) => {
        const edge = Math.min(w, h);
        const size = Math.max(250, Math.min(Math.floor(edge * 0.90), 520));
        return { width: size, height: size };
      };
      try {
        await current.start(
          { facingMode: 'environment' },
          { fps: 15, qrbox, disableFlip: false, videoConstraints: { facingMode: 'environment', width: { ideal: 1280, min: 640 }, height: { ideal: 720, min: 480 } } },
          text => scan(text),
          () => {}
        );
      } catch (_) {
        await current.start(
          { facingMode: 'user' },
          { fps: 15, qrbox },
          text => scan(text),
          () => {}
        );
      }
      if (token !== generation || !cameraWanted) await stopScanner();
      else {
        status('Camera active. Hold student QR up to the camera.');
        const videoEl = document.querySelector('#qr-camera video');
        if (videoEl) {
          videoEl.style.objectFit = 'cover';
          startKioskSensitivityLoop(videoEl);
        }
      }
    } catch (_) { await stopScanner(); status('QR camera unavailable. Enter the student ID below.'); }
    finally { scanStarting = false; }
  }
  async function reset(message = 'Ready for the next student.') {
    if (saving) return;
    generation++; clearTimeout(resetTimer); gesture?.stop(); gesture = null;
    student = null; answers = []; checkId = null; busy = false;
    $('deep-assessment').hidden = true; $('scan-panel').hidden = false;
    $('student-name').textContent = ''; $('question-options').replaceChildren(); $('manual-id').value = '';
    $('review').hidden = true; $('review-answers').replaceChildren();
    status(message); await startScanner();
    if (!cameraWanted) $('manual-id').focus();
  }
  function renderQuestion() {
    const index = answers.length, question = H.QUESTIONS[index];
    if (!question) { $('review-answers').replaceChildren(); H.QUESTIONS.forEach((q,i) => { const li=document.createElement('li'); li.textContent=q.text+' '+q.options[answers[i]]; $('review-answers').append(li); }); return review(); }
    $('question-title').textContent = question.text; $('question-step').textContent = `Question ${index + 1} of 5`;
    $('question-options').replaceChildren();
    question.options.forEach((option, choice) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'cc-option';
      button.textContent = `${choice + 1}. ${option}`; button.onclick = () => choose(choice); $('question-options').append(button);
    });
    $('question-options').querySelector('button')?.focus();
  }
  function choose(choice) {
    if (!student || saving || answers.length >= 5 || !Number.isInteger(choice) || choice < 0 || choice > 3) return;
    playFeedback('success');
    answers.push(choice); gesture?.lock(); renderQuestion();
  }
  async function autoSubmit() {
    if (saving || !student || answers.length !== 5) return;
    saving = true;
    gesture?.stop();
    $('deep-assessment').querySelectorAll('button').forEach(b => b.disabled = true);
    status('Saving assessment to school records…');
    // Prepare review fallback items in case network error occurs
    $('review-answers').replaceChildren();
    H.QUESTIONS.forEach((q, i) => {
      const li = document.createElement('li');
      li.textContent = `${q.text} ${q.options[answers[i]]}`;
      $('review-answers').append(li);
    });
    try {
      await K.saveDeep(student, user, answers, checkId);
      saving = false;
      playFeedback('success');
      try {
        const bc = new BroadcastChannel('classcare_attendance_sync');
        bc.postMessage({ type: 'deep_check_saved', student_uid: student.uid, date: ClassCareHolistic.schoolDate() });
        bc.close();
      } catch (_) {}
      const successEl = $('kiosk-success-screen');
      const qWrap = $('deep-assessment-wrap') || $('deep-assessment');
      const sName = $('kiosk-success-student-name');
      if (sName) sName.textContent = K.name(student);
      if (successEl) {
        successEl.hidden = false;
        if ($('assessment-questions-area')) $('assessment-questions-area').hidden = true;
      }
      status('Check-in saved. Thank you.');
      await new Promise(r => setTimeout(r, 2000));
      if (successEl) successEl.hidden = true;
      if ($('assessment-questions-area')) $('assessment-questions-area').hidden = false;
      await reset('Assessment saved. Thank you! Ready for the next student.');
    } catch (error) {
      saving = false;
      $('deep-assessment').querySelectorAll('button').forEach(b => b.disabled = false);
      review();
      status(`Not saved: ${error.message} Your answers are still here. Retry Save.`);
    }
  }
  function review() {
    gesture?.stop(); $('question-options').replaceChildren(); $('question-title').textContent = 'Review your answers';
    $('review').hidden = false; $('save-check').focus();
    $('gesture-status').textContent = 'Camera stopped. Save when you are ready.';
  }
  async function scan(raw) {
    if (!user || busy || (raw === lastRaw && Date.now() - lastScan < 3500)) return;
    if (!deep && !settingsReady) return status('Waiting for confirmed attendance settings. Check your connection.');
    busy = true; lastRaw = raw; lastScan = Date.now(); const token = generation;
    $('manual-submit').disabled = true;
    try {
      status('Checking student ID…'); await stopScanner();
      const found = await K.lookup(raw, user);
      if (token !== generation) return;
      student = found;
      playFeedback('success');
      if (!deep) {
        const result = await K.fastMood(student, user, settings);
        if (token !== generation) return;
        const message = !result ? 'Cancelled. No new attendance recorded.' : result.kind === 'duplicate' ? 'Attendance was already recorded today.' : result.kind === 'time_out' ? 'Time out saved.' : 'Attendance and mood saved. Thank you!';
        status(message); resetTimer = setTimeout(() => reset(message), 1100);
      } else {
        checkId = ClassCare.DB.emotional_checkins.doc().id;
        $('scan-panel').hidden = true; $('deep-assessment').hidden = false; $('student-name').textContent = K.name(student);
        renderQuestion();
        gesture = new ClassCareGestureCamera($('gesture-video'), choose, text => { $('gesture-status').textContent = text; }, (count, progress) => {
          [...$('question-options').children].forEach((button, i) => button.classList.toggle('cc-hover', i === count - 1 && progress > 0));
          $('gesture-progress').value = progress;
        });
        status('Camera active! Show 1–4 fingers to answer, or tap below.');
        gesture.start().catch(err => {
          console.warn('[kiosk] auto-camera start error:', err);
          status('Gesture camera unavailable. Answer using buttons or keys 1–4.');
        });
      }
    } catch (error) {
      if (token === generation) {
        playFeedback('error');
        await reset(error.message);
      }
    }
    finally { $('manual-submit').disabled = false; }
  }
  $('manual-form').onsubmit = event => { event.preventDefault(); scan($('manual-id').value); };
  $('start-camera').onclick = () => { cameraWanted = true; startScanner(); };
  $('stop-camera').onclick = () => { cameraWanted = false; stopScanner(); };
  $('enable-gestures').onclick = () => { if (answers.length < 5) gesture?.start(); };
  $('cancel-check').onclick = () => reset('Check cancelled. No assessment saved.');
  $('restart-check').onclick = () => { if (saving) return; answers = []; $('review').hidden = true; renderQuestion(); };
  $('save-check').onclick = () => autoSubmit();
  document.addEventListener('keydown', event => {
    if (event.repeat || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (deep && /^[1-4]$/.test(event.key) && !$('deep-assessment').hidden) { event.preventDefault(); choose(Number(event.key) - 1); }
  });
  let stopSettings;
  const stopAuth = ClassCare.onCurrentUser(next => {
    stopSettings?.(); generation++; gesture?.stop(); stopScanner();
    if (next && !['teacher', 'admin'].includes(next.role)) {
      try { Toast.warn("This kiosk is for teachers and IT administration."); } catch (_) {}
      setTimeout(() => location.replace("../index.html"), 700);
      return;
    }
    user = next && !next.__profileError && ['teacher', 'admin'].includes(next.role) && !next.disabled && (next.role === 'admin' || next.pending_approval === false) ? next : null;
    $('kiosk-content').hidden = !user; $('auth-required').hidden = !!user;
    if (!user) { busy = false; student = null; return; }
    settingsReady = false;
    $('manual-submit').disabled = !deep;
    stopSettings = ClassCare.DB.settings.onSnapshot({ includeMetadataChanges: true }, doc => {
      settingsReady = doc.exists && !doc.metadata.fromCache && !doc.metadata.hasPendingWrites;
      if (!deep) $('manual-submit').disabled = !settingsReady;
      settings = doc.exists ? doc.data() : {};
      if (!doc.exists && !deep) status('Attendance settings are not configured. Ask administration to save the school schedule.');
    }, () => { settingsReady = false; status('Attendance settings unavailable. Check your connection and access.'); });
    reset();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { gesture?.stop(); stopScanner(); }
    else if (!busy) startScanner();
  });
  window.addEventListener('pagehide', () => { generation++; clearTimeout(resetTimer); gesture?.stop(); stopScanner(); stopSettings?.(); stopAuth(); });
})();
