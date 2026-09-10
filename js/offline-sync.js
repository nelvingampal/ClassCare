/* ============================================================
   offline-sync.js — durable IndexedDB queue with observable retries
   MODIFIED: Rebranded CampusApp → ClassCare
   ============================================================ */
(function () {
  "use strict";
  // MODIFIED: Renamed IndexedDB from CampusOfflineSync → ClassCareOfflineSync
  const DB_NAME = "ClassCareOfflineSync";
  const DB_VERSION = 3;
  const STORES = { ATTENDANCE: "pending_attendance", TICKETS: "pending_tickets", MOODS: "pending_moods", EMOTIONS: "pending_emotions" };
  let flushPromise = null;
  let lastState = { status: "idle", counts: { attendance: 0, tickets: 0, moods: 0, emotions: 0 }, error: null };

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(Object.assign(new Error("Offline storage is unavailable."), { code: "storage-unavailable" }));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = event => {
        const db = event.target.result;
        Object.values(STORES).forEach(store => {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: "id", autoIncrement: true });
        });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  function transaction(store, mode, operation) {
    return openDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = operation(tx.objectStore(store));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Offline transaction aborted."));
    }));
  }
  const readAll = store => transaction(store, "readonly", objectStore => objectStore.getAll());
  const remove = (store, id) => transaction(store, "readwrite", objectStore => objectStore.delete(id));
  const put = (store, record) => transaction(store, "readwrite", objectStore => objectStore.put(record));
  const add = (store, record) => transaction(store, "readwrite", objectStore => objectStore.add(record));

  async function counts() {
    const [attendance, tickets, moods, emotions] = await Promise.all([readAll(STORES.ATTENDANCE), readAll(STORES.TICKETS), readAll(STORES.MOODS), readAll(STORES.EMOTIONS)]);
    return { attendance: attendance.length, tickets: tickets.length, moods: moods.length, emotions: emotions.length };
  }
  async function emit(status = lastState.status, error = null) {
    try { lastState = { status, counts: await counts(), error: error ? String(error.message || error) : null }; }
    catch (countError) { lastState = { status: "error", counts: lastState.counts, error: String(countError.message || countError) }; }
    // MODIFIED: Event name campus:sync → classcare:sync
    window.dispatchEvent(new CustomEvent("classcare:sync", { detail: lastState }));
    listeners.slice().forEach(listener => { try { listener(lastState.counts, lastState); } catch (_) {} });
    return lastState;
  }

  const listeners = [];
  const OfflineSync = {
    STORES,
    async enqueueAttendance(payload) {
      const key = `${payload.student_uid || ""}_${payload.date || ""}`;
      const existing = await readAll(STORES.ATTENDANCE);
      if (existing.some(record => record.dedupe_key === key)) return false;
      await add(STORES.ATTENDANCE, { ...payload, dedupe_key: key, _pending: true, _source: "scanner", _retryCount: 0, _ts: Date.now() });
      await emit("offline");
      window.ClassCareSW?.requestSync?.("classcare-sync");
      return true;
    },
    async queueTicket(payload) {
      await add(STORES.TICKETS, { ...payload, _pending: true, _retryCount: 0, _ts: Date.now() });
      await emit("offline");
      window.ClassCareSW?.requestSync?.("classcare-sync");
      return true;
    },
    async queueMood(payload) {
      await add(STORES.MOODS, { ...payload, _pending: true, _retryCount: 0, _ts: Date.now() });
      await emit("offline");
      window.ClassCareSW?.requestSync?.("classcare-sync");
      return true;
    },
    async enqueueEmotion(payload) {
      const key = `${payload.student_uid || ""}_${payload.date || ""}`;
      const existing = await readAll(STORES.EMOTIONS);
      const match = existing.find(record => record.dedupe_key === key);
      if (match) {
        await put(STORES.EMOTIONS, { ...match, ...payload, dedupe_key: key, _pending: true, _ts: Date.now(), _retryCount: Number(match._retryCount || 0) });
      } else {
        await add(STORES.EMOTIONS, { ...payload, dedupe_key: key, _pending: true, _source: "scanner", _retryCount: 0, _ts: Date.now() });
      }
      await emit("offline");
      window.ClassCareSW?.requestSync?.("classcare-sync");
      return true;
    },
    pendingCount: counts,
    getState: () => ({ ...lastState, counts: { ...lastState.counts } }),
    on(listener) { listeners.push(listener); return () => { const index = listeners.indexOf(listener); if (index >= 0) listeners.splice(index, 1); }; },
    _emit: () => emit(lastState.status),
    async flushAll(options = {}) {
      if (!navigator.onLine) { await emit("offline"); return false; }
      if (flushPromise) return flushPromise;
      flushPromise = (async () => {
        await emit("syncing");
        const results = [];
        try { results.push(await this._flushAttendance(options.triggerTelegram !== false)); }
        catch (error) { results.push(0); console.warn("[offline] attendance flush failed:", error); }
        try { results.push(await this._flushTickets()); }
        catch (error) { results.push(0); console.warn("[offline] ticket flush failed:", error); }
        try { results.push(await this._flushMoods()); }
        catch (error) { results.push(0); console.warn("[offline] mood flush failed:", error); }
        try { results.push(await this._flushEmotions()); }
        catch (error) { results.push(0); console.warn("[offline] emotion flush failed:", error); }
        const remaining = await counts();
        const hasPending = remaining.attendance || remaining.tickets || remaining.moods || remaining.emotions;
        await emit(hasPending ? "error" : "synced");
        return results;
      })().finally(() => { flushPromise = null; });
      return flushPromise;
    },
    async _markFailure(store, record, error) {
      await put(store, { ...record, _retryCount: Number(record._retryCount || 0) + 1, _lastError: String(error?.message || error), _lastAttempt: Date.now() });
    },
    async _flushAttendance(triggerTelegram) {
      const list = await readAll(STORES.ATTENDANCE); let ok = 0;
      for (const record of list) {
        try {
          const payload = { student_uid: record.student_uid, date: record.date, time_in: record.time_in, status: record.status, section: record.section || "", minutes_late: record.minutes_late || 0, scanned_by: record.scanned_by || "", synced_from_offline: true, synced_at: firebase.firestore.FieldValue.serverTimestamp() };
          await ClassCare.DB.attendance.doc(ClassCare.DB.attendanceDocId(record.student_uid, record.date)).set(payload, { merge: true });
          if (triggerTelegram && window.TelegramAlert) {
            try { const student = await ClassCare.DB.users.doc(record.student_uid).get(); if (student.exists) await TelegramAlert.sendAttendanceAlert(student.data(), record.status, record); }
            catch (alertError) { console.warn("[offline] parent alert failed:", alertError); }
          }
          await remove(STORES.ATTENDANCE, record.id); ok++;
        } catch (error) { await this._markFailure(STORES.ATTENDANCE, record, error); }
      }
      return ok;
    },
    async _flushTickets() {
      const list = await readAll(STORES.TICKETS); let ok = 0;
      for (const record of list) {
        try {
          await ClassCare.DB.helpdesk_tickets.add({ sender_uid: record.sender_uid, sender_name: record.sender_name, sender_id: record.sender_id, section: record.section, message: record.message, status: "Open", timestamp: firebase.firestore.FieldValue.serverTimestamp(), synced_from_offline: true });
          await remove(STORES.TICKETS, record.id); ok++;
        } catch (error) { await this._markFailure(STORES.TICKETS, record, error); }
      }
      return ok;
    },
    async _flushMoods() {
      const list = await readAll(STORES.MOODS); let ok = 0;
      for (const record of list) {
        try {
          const date = record.date || Utils.todayIso();
          await ClassCare.DB.users.doc(record.sender_uid || record.student_uid).collection("moods").doc(date).set({ mood: record.mood, synced_from_offline: true, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
          await remove(STORES.MOODS, record.id); ok++;
        } catch (error) { await this._markFailure(STORES.MOODS, record, error); }
      }
      return ok;
    },
    async _flushEmotions() {
      const list = await readAll(STORES.EMOTIONS); let ok = 0;
      for (const record of list) {
        try {
          const docId = ClassCare.DB.attendanceDocId(record.student_uid, record.date);
          const emoDocId = ClassCare.DB.emotionalCheckinDocId ? ClassCare.DB.emotionalCheckinDocId(record.student_uid, record.date) : `${record.student_uid}_${record.date}`;
          const norm = typeof ClassCare?.normalizeEmotion === "function"
            ? ClassCare.normalizeEmotion(record.emotion || "content")
            : { emotion: record.emotion || "content", emotion_label: record.emotion_label || "Content", emotion_emoji: record.emotion_emoji || "😊", is_negative: Boolean(record.is_negative) };

          const attPayload = {
            emotion: norm.emotion,
            emotion_label: norm.emotion_label,
            emotion_emoji: norm.emotion_emoji,
            is_negative: norm.is_negative,
            wellbeing_data: record.wellbeing_data || {
              emotion: norm.emotion,
              emotion_label: norm.emotion_label,
              emotion_emoji: norm.emotion_emoji,
              is_negative: norm.is_negative,
              recorded_at: record.date
            },
            wellbeing_surveyed_by: record.recorded_by || record.surveyed_by || record.checked_by || "",
            wellbeing_surveyed_at: firebase.firestore.FieldValue.serverTimestamp(),
            wellbeing_synced_from_offline: true
          };
          const checkinPayload = {
            student_uid: record.student_uid,
            student_name: record.student_name || "Student",
            student_id: record.student_id || "",
            date: record.date,
            section: record.section || "",
            emotion: norm.emotion,
            emotion_label: norm.emotion_label,
            emotion_emoji: norm.emotion_emoji,
            is_negative: norm.is_negative,
            recorded_by: record.recorded_by || "",
            recorded_via: "qr_scanner_offline_synced",
            synced_from_offline: true,
            created_at: firebase.firestore.FieldValue.serverTimestamp()
          };
          await Promise.all([
            ClassCare.DB.attendance.doc(docId).set(attPayload, { merge: true }),
            ClassCare.DB.emotional_checkins.doc(emoDocId).set(checkinPayload, { merge: true })
          ]);
          await remove(STORES.EMOTIONS, record.id); ok++;
        } catch (error) { await this._markFailure(STORES.EMOTIONS, record, error); }
      }
      return ok;
    }
  };

  window.addEventListener("online", () => { emit("syncing"); setTimeout(() => OfflineSync.flushAll(), 350); });
  window.addEventListener("offline", () => emit("offline"));
  setTimeout(() => { if (navigator.onLine) OfflineSync.flushAll(); else emit("offline"); }, 1800);
  window.OfflineSync = OfflineSync;
})();
