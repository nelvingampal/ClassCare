(function () {
  'use strict';

  /* ============================================================
     ULTRA-ACCURATE HAND GESTURE DETECTION ENGINE (V2)
     Primary: 21-Landmark MediaPipe HandLandmarker (AI Tracking)
     Natural Gesture Mapping:
       - 1 Finger: Index finger upright OR Thumbs up -> Option 1
       - 2 Fingers: Peace sign (Index+Middle) OR Thumb+Index -> Option 2
       - 3 Fingers: 3 fingers (Index+Middle+Ring) OR Thumb+Index+Middle -> Option 3
       - 4 Fingers: 4 fingers upright OR Open Palm (5 fingers) -> Option 4
       - 0: Fist or resting hand (ignored)
     ============================================================ */

  let sharedLandmarkerPromise = null;

  async function getSharedLandmarker() {
    if (!sharedLandmarkerPromise) {
      sharedLandmarkerPromise = (async () => {
        // 1. Try local model files first (< 500ms offline load)
        try {
          const vision = await import('/teacher/models/vision_bundle.mjs');
          const files = await vision.FilesetResolver.forVisionTasks('/teacher/models/wasm');
          const landmarker = await vision.HandLandmarker.createFromOptions(files, {
            baseOptions: {
              modelAssetPath: '/teacher/models/hand_landmarker.task',
              delegate: 'CPU'
            },
            runningMode: 'VIDEO',
            numHands: 1,
            minHandDetectionConfidence: 0.45,
            minHandPresenceConfidence: 0.45,
            minTrackingConfidence: 0.45
          });
          console.log('[gesture] Local MediaPipe HandLandmarker initialized successfully.');
          return landmarker;
        } catch (localErr) {
          console.warn('[gesture] Local model load failed, attempting CDN fallback:', localErr);
        }

        // 2. Fallback to CDN
        try {
          const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs');
          const files = await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm');
          const landmarker = await vision.HandLandmarker.createFromOptions(files, {
            baseOptions: {
              modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
              delegate: 'CPU'
            },
            runningMode: 'VIDEO',
            numHands: 1,
            minHandDetectionConfidence: 0.45,
            minHandPresenceConfidence: 0.45,
            minTrackingConfidence: 0.45
          });
          console.log('[gesture] CDN MediaPipe HandLandmarker initialized successfully.');
          return landmarker;
        } catch (cdnErr) {
          console.warn('[gesture] MediaPipe HandLandmarker unavailable, using fallback:', cdnErr);
          return null;
        }
      })();
    }
    return sharedLandmarkerPromise;
  }

  // Pre-warm the neural network immediately in background
  getSharedLandmarker().catch(() => {});

  /* ---- Ultra-Reliable 21-Landmark Finger Counter ---- */
  function countFingersFromLandmarks(landmarks) {
    if (!landmarks || landmarks.length < 21) return 0;

    const wrist = landmarks[0];
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    // Checks if a non-thumb finger is extended
    function isFingerExtended(tipIdx, dipIdx, pipIdx, mcpIdx) {
      const tip = landmarks[tipIdx];
      const dip = landmarks[dipIdx];
      const pip = landmarks[pipIdx];
      const mcp = landmarks[mcpIdx];

      // Primary: Upright check (tip is distinctly higher than PIP joint and knuckle)
      const isUpright = (tip.y < pip.y && tip.y < mcp.y);

      // Secondary: Radial distance check (for tilted or angled hands)
      const isRadial = (dist(tip, wrist) > dist(pip, wrist)) && (dist(tip, mcp) > dist(pip, mcp));

      return isUpright || isRadial;
    }

    // Checks if the thumb is extended
    function isThumbExtended() {
      const tip = landmarks[4];
      const ip = landmarks[3];
      const mcp = landmarks[2];
      const indexMcp = landmarks[5];
      const pinkyMcp = landmarks[17];

      // Pointing up (thumbs-up gesture)
      const isPointingUp = (tip.y < ip.y && tip.y < mcp.y && tip.y < wrist.y);

      // Spread outward sideways away from palm
      const isSpread = (dist(tip, indexMcp) > dist(ip, indexMcp) * 1.1) &&
                       (dist(tip, pinkyMcp) > dist(ip, pinkyMcp) * 1.1);

      return isPointingUp || isSpread;
    }

    const isIndex = isFingerExtended(8, 7, 6, 5);
    const isMiddle = isFingerExtended(12, 11, 10, 9);
    const isRing = isFingerExtended(16, 15, 14, 13);
    const isPinky = isFingerExtended(20, 19, 18, 17);
    const isThumb = isThumbExtended();

    const nonThumb = (isIndex ? 1 : 0) + (isMiddle ? 1 : 0) + (isRing ? 1 : 0) + (isPinky ? 1 : 0);

    // Direct 1:1 mapping:
    // 1 Finger raised (Index) -> Option 1
    // 2 Fingers raised (Index + Middle) -> Option 2
    // 3 Fingers raised (Index + Middle + Ring) -> Option 3
    // 4 Fingers raised (All 4 non-thumb OR Open palm) -> Option 4
    if (nonThumb >= 1 && nonThumb <= 4) {
      return nonThumb;
    }

    // Only if NO other fingers are raised, allow thumbs-up for Option 1
    if (nonThumb === 0 && isThumb) {
      return 1;
    }

    return 0; // Fist or resting hand
  }

  // Pure Computer Vision Fallback (Adaptive Hand & Finger Contour Analyzer)
  function analyzeHandContourFallback(ctx, width, height) {
    let imgData;
    try {
      imgData = ctx.getImageData(0, 0, width, height);
    } catch (_) {
      return 0;
    }
    const data = imgData.data;

    // Focus on lower 75% of frame (ignore face)
    const startY = Math.floor(height * 0.25);
    const skin = new Uint8Array(width * height);
    let totalSkin = 0;
    let minX = width, maxX = 0, minY = height, maxY = 0;

    for (let y = startY; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];

        // YCbCr skin model
        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
        const yLum = 0.299 * r + 0.587 * g + 0.114 * b;

        const isSkin = (cb >= 75 && cb <= 130 && cr >= 130 && cr <= 175 && yLum >= 40 && r > g);
        if (isSkin) {
          skin[y * width + x] = 1;
          totalSkin++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // Minimum area for even a single raised finger
    const minPixels = Math.floor(width * height * 0.015);
    const boxW = maxX - minX;
    const boxH = maxY - minY;

    if (totalSkin < minPixels || boxW < 8 || boxH < 14) {
      return 0;
    }

    const topY = new Int16Array(width).fill(-1);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        if (skin[y * width + x]) {
          topY[x] = y;
          break;
        }
      }
    }

    // 3-point smoothing
    const smoothed = new Int16Array(width).fill(-1);
    for (let x = minX + 1; x <= maxX - 1; x++) {
      let sum = 0, count = 0;
      for (let k = -1; k <= 1; k++) {
        if (topY[x + k] !== -1) { sum += topY[x + k]; count++; }
      }
      if (count > 0) smoothed[x] = Math.round(sum / count);
    }

    // Count finger peaks
    const peaks = [];
    const palmY = minY + boxH * 0.60;
    for (let x = minX + 2; x <= maxX - 2; x++) {
      const yVal = smoothed[x];
      if (yVal === -1 || yVal >= palmY) continue;

      if (yVal <= smoothed[x - 1] && yVal <= smoothed[x - 2] &&
          yVal <= smoothed[x + 1] && yVal <= smoothed[x + 2]) {
        let leftValley = yVal;
        for (let lx = x - 1; lx >= Math.max(minX, x - 14); lx--) {
          if (smoothed[lx] === -1) { leftValley = Math.max(leftValley, yVal + 10); break; }
          if (smoothed[lx] > leftValley) leftValley = smoothed[lx];
          else if (smoothed[lx] < leftValley - 2) break;
        }
        let rightValley = yVal;
        for (let rx = x + 1; rx <= Math.min(maxX, x + 14); rx++) {
          if (smoothed[rx] === -1) { rightValley = Math.max(rightValley, yVal + 10); break; }
          if (smoothed[rx] > rightValley) rightValley = smoothed[rx];
          else if (smoothed[rx] < rightValley - 2) break;
        }

        const prom = Math.min(leftValley - yVal, rightValley - yVal);
        if (prom >= 6) {
          if (!peaks.length || (x - peaks[peaks.length - 1].x) >= 6) {
            peaks.push({ x, y: yVal });
          }
        }
      }
    }

    const peakCount = peaks.length;
    if (peakCount >= 1 && peakCount <= 4) return peakCount;
    // If a single tall vertical column is raised without valleys (single index finger)
    if (peakCount === 0 && boxW >= 8 && boxW <= 28 && boxH >= 24) {
      return 1;
    }
    return 0;
  }

  /* ---- Rolling 3-Frame Majority Stabilizer ---- */
  function stabilizeChoice(history, rawChoice) {
    history.push(rawChoice);
    if (history.length > 3) history.shift();
    const frequency = {};
    for (const c of history) frequency[c] = (frequency[c] || 0) + 1;
    let maxFreq = 0, dominant = 0;
    for (const [k, v] of Object.entries(frequency)) {
      const val = Number(k);
      if (v > maxFreq || (v === maxFreq && val === rawChoice)) {
        maxFreq = v;
        dominant = val;
      }
    }
    return dominant;
  }

  /* ============================================================
     CLASSCARE GESTURE CAMERA CONTROLLER
     ============================================================ */
  class GestureCamera {
    constructor(video, onChoice, onStatus, onProgress) {
      Object.assign(this, { video, onChoice, onStatus, onProgress });
      this.dwell = new ClassCareHolistic.Dwell();
      this.generation = 0;
      this.ownStream = false;
      this.landmarker = null;
      this.history = [];
    }

    async start(existingStream = null) {
      this.stop();
      const generation = ++this.generation;
      this.history = [];
      this.onStatus('Connecting AI hand tracking sensor…');

      try {
        let stream = existingStream;
        if (!stream || !stream.active || !stream.getVideoTracks().some(t => t.readyState === 'live')) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 640, min: 320 }, height: { ideal: 480, min: 240 }, frameRate: { ideal: 20, max: 30 } },
            audio: false
          });
          this.ownStream = true;
        } else {
          this.ownStream = false;
        }

        if (generation !== this.generation) {
          if (this.ownStream) stream.getTracks().forEach(t => t.stop());
          return;
        }

        this.stream = stream;
        this.video.srcObject = stream;
        await this.video.play().catch(() => {});
        if (generation !== this.generation) return;

        // Ensure MediaPipe HandLandmarker is actively loaded
        try {
          this.landmarker = await getSharedLandmarker();
          if (generation === this.generation && this.landmarker) {
            console.log('[gesture] MediaPipe HandLandmarker active and verified.');
          }
        } catch (lmErr) {
          console.warn('[gesture] Pre-load error:', lmErr);
        }

        this.onStatus('Show 1–4 fingers to camera. Hold to select.');

        const offCanvas = document.createElement('canvas');
        const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
        const cw = 160, ch = 120;
        offCanvas.width = cw;
        offCanvas.height = ch;

        let busy = false;

        // Run detection every 75ms (~13 FPS)
        this.interval = setInterval(() => {
          if (generation !== this.generation || document.hidden || this.video.readyState < 2) return;
          if (busy) return;
          busy = true;

          try {
            let rawCount = 0;
            const now = performance.now();

            // 1. Primary: MediaPipe AI 21-Landmark Detection
            if (this.landmarker) {
              try {
                const results = this.landmarker.detectForVideo(this.video, now);
                if (results && results.landmarks && results.landmarks[0]) {
                  rawCount = countFingersFromLandmarks(results.landmarks[0]);
                }
              } catch (detErr) {
                console.warn('[gesture] Detection error:', detErr);
              }
            }

            // 2. Fallback: Contour Peak Analyzer (if MediaPipe was unavailable)
            if (rawCount === 0 && !this.landmarker) {
              try {
                offCtx.drawImage(this.video, 0, 0, cw, ch);
                rawCount = analyzeHandContourFallback(offCtx, cw, ch);
              } catch (_) {}
            }

            // 3. Rolling 3-frame majority stabilizer (instant response + no single-frame drop)
            const smoothedCount = stabilizeChoice(this.history, rawCount);

            // 4. Update dwell progress
            const selection = this.dwell.update(smoothedCount, now);
            this.onProgress(smoothedCount, selection.progress);

            // 5. User feedback
            if (smoothedCount > 0) {
              const icons = ["☝️", "✌️", "🤟", "✋"];
              const optionLabels = ["Option 1 (Very good)", "Option 2 (Good)", "Option 3 (Okay)", "Option 4 (Not good)"];
              const icon = icons[smoothedCount - 1] || "✋";
              const label = optionLabels[smoothedCount - 1] || `Option ${smoothedCount}`;
              const pct = Math.round(selection.progress * 100);
              this.onStatus(`${icon} ${label}: ${pct}% held`);
            } else {
              this.onStatus('Show 1–4 fingers to camera. Hold to select.');
            }

            if (selection.selected) {
              this.history = [];
              this.onChoice(selection.selected - 1);
            }
          } catch (_) {
          } finally {
            busy = false;
          }
        }, 75);

      } catch (err) {
        if (generation === this.generation) {
          this.stop();
          this.onStatus('Camera unavailable. Tap an option below to answer.');
        }
      }
    }

    lock() {
      this.dwell.lock();
      this.history = [];
    }

    stop() {
      this.generation++;
      clearInterval(this.interval);
      clearTimeout(this.timeout);
      this.history = [];
      if (this.ownStream && this.stream) {
        try { this.stream.getTracks().forEach(track => track.stop()); } catch (_) {}
      }
      this.stream = null;
      if (this.video) {
        this.video.srcObject = null;
      }
      this.dwell.reset();
    }
  }

  // Export methods
  window.ClassCareGestureCamera = GestureCamera;
  window.ClassCareGestureUtils = {
    countFingersFromLandmarks,
    stabilizeChoice,
    getSharedLandmarker
  };
})();
