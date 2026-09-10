/* Run MediaPipe WASM inference off the UI thread; camera images never leave the device. */
let landmarker;
self.onmessage = async event => {
  const { type, bitmap, timestamp } = event.data;
  try {
    if (type === 'init') {
      const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs');
      const files = await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm');
      landmarker = await vision.HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: 0.65, minHandPresenceConfidence: 0.65, minTrackingConfidence: 0.65
      });
      self.postMessage({ type: 'ready' });
    } else if (type === 'frame' && landmarker) {
      try {
        const result = landmarker.detectForVideo(bitmap, timestamp);
        self.postMessage({ type: 'result', landmarks: result.landmarks[0] || null });
      } finally { bitmap.close(); }
    }
  } catch (error) { bitmap?.close(); self.postMessage({ type: 'error', message: error.message }); }
};
