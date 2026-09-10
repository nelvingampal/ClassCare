(function () {
  'use strict';
  class GestureCamera {
    constructor(video, onChoice, onStatus, onProgress) {
      Object.assign(this, { video, onChoice, onStatus, onProgress });
      this.dwell = new ClassCareHolistic.Dwell(); this.generation = 0;
    }
    async start() {
      this.stop(); const generation = this.generation;
      this.onStatus('Starting gesture camera…');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 20 } }, audio: false });
        if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
        this.stream = stream; this.video.srcObject = stream; await this.video.play();
        if (generation !== this.generation) return;
        const worker = this.worker = new Worker('hand-worker.js');
        let busy = false, lastTime = -1;
        const fail = message => { if (generation !== this.generation) return; this.stop(); this.onStatus(message + ' Use touch or keys 1–4.'); };
        this.timeout = setTimeout(() => fail('Gesture model could not load.'), 30000);
        worker.onerror = () => fail('Gesture model is unavailable.');
        worker.onmessage = event => {
          if (generation !== this.generation) return;
          if (event.data.type === 'error') return fail('Gesture detection is unavailable.');
          if (event.data.type === 'ready') {
            clearTimeout(this.timeout);
            this.onStatus('Show 1–4 fingers, palm toward camera (thumb not counted). Hold to select. Lower your hand between answers.');
            this.interval = setInterval(async () => {
              if (busy || document.hidden || this.video.readyState < 2 || this.video.currentTime === lastTime) return;
              busy = true; lastTime = this.video.currentTime;
              try {
                const bitmap = await createImageBitmap(this.video, { resizeWidth: 480, resizeHeight: 360 });
                if (generation !== this.generation) { bitmap.close(); return; }
                worker.postMessage({ type: 'frame', bitmap, timestamp: performance.now() }, [bitmap]);
              } catch (_) { fail('This browser cannot process camera frames.'); }
            }, 125); // 8 fps; only one transferable frame in flight.
          }
          if (event.data.type === 'result') {
            busy = false;
            const count = ClassCareHolistic.countFingers(event.data.landmarks);
            const selection = this.dwell.update(count, performance.now());
            this.onProgress(count, selection.progress);
            if (selection.selected) this.onChoice(selection.selected - 1);
          }
        };
        worker.postMessage({ type: 'init' });
      } catch (_) { if (generation === this.generation) { this.stop(); this.onStatus('Camera unavailable. Use touch or keys 1–4.'); } }
    }
    lock() { this.dwell.lock(); }
    stop() {
      this.generation++; clearInterval(this.interval); clearTimeout(this.timeout);
      this.worker?.terminate(); this.worker = null;
      this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
      this.video.srcObject = null; this.dwell.reset();
    }
  }
  window.ClassCareGestureCamera = GestureCamera;
})();
