/* Durable, account-scoped queues. Replays only in an authenticated foreground tab. */
(function () {
  "use strict";
  const DB_NAME = "ClassCareOfflineSync";
  const DB_VERSION = 4;
  const STORES = { ATTENDANCE: "pending_attendance", TICKETS: "pending_tickets", MOODS: "pending_moods", EMOTIONS: "pending_emotions" };
  const listeners = [];
  let flushPromise = null;
  let lastState = { status: "idle", counts: emptyCounts(), error: null };

  function emptyCounts() { return { attendance: 0, tickets: 0, moods: 0, emotions: 0 }; }
  function currentUid() { return window.ClassCare?.getFirebase?.()?.auth?.currentUser?.uid || ""; }
  function requireOwner() {
    const uid = currentUid();
    if (!uid) throw Object.assign(new Error("Sign in before saving offline work."), { code: "unauthenticated" });
    return uid;
  }
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
      tx.oncomplete = () => { db.close(); resolve(request?.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error("Offline transaction aborted.")); };
    }));
  }
  const readAll = store => transaction(store, "readonly", objectStore => objectStore.getAll());
  const remove = (store, id) => transaction(store, "readwrite", objectStore => objectStore.delete(id));
  const put = (store, record) => transaction(store, "readwrite", objectStore => objectStore.put(record));
  const add = (store, record) => transaction(store, "readwrite", objectStore => objectStore.add(record));
  const owned = (records, uid = currentUid()) => uid ? records.filter(record => record.owner_uid === uid) : [];
  function atomicUpsert(store, ownerUid, key, payload, source) {
    return openDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      const objectStore = tx.objectStore(store);
      let created = false;
      const request = objectStore.getAll();
      request.onsuccess = () => {
        const match = request.result.find(record => record.owner_uid === ownerUid && record.dedupe_key === key);
        const next = {
          ...(match || {}), ...payload, owner_uid: ownerUid, dedupe_key: key,
          _pending: true, _source: source, _retryCount: Number(match?._retryCount || 0),
          _rev: Number(match?._rev || 0) + 1, _ts: Date.now()
        };
        created = !match;
        if (match) objectStore.put(next); else objectStore.add(next);
      };
      tx.oncomplete = () => { db.close(); resolve(created); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error("Offline upsert aborted.")); };
    }));
  }
  function updateIfRevision(store, record, update) {
    return openDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      const objectStore = tx.objectStore(store);
      let changed = false;
      const request = objectStore.get(record.id);
      request.onsuccess = () => {
        const current = request.result;
        if (!current || current.owner_uid !== record.owner_uid || Number(current._rev || 0) !== Number(record._rev || 0)) return;
        changed = true;
        if (update === null) objectStore.delete(record.id); else objectStore.put({ ...current, ...update });
      };
      tx.oncomplete = () => { db.close(); resolve(changed); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error("Offline acknowledgement aborted.")); };
    }));
  }

  async function counts() {
    const uid = currentUid();
    if (!uid) return emptyCounts();
    const [attendance, tickets, moods, emotions] = await Promise.all(Object.values(STORES).map(readAll));
    return {
      attendance: owned(attendance, uid).length,
      tickets: owned(tickets, uid).length,
      moods: owned(moods, uid).length,
      emotions: owned(emotions, uid).length
    };
  }
  async function emit(status = lastState.status, error = null) {
    try { lastState = { status, counts: await counts(), error: error ? String(error.message || error) : null }; }
    catch (countError) { lastState = { status: "error", counts: lastState.counts, error: String(countError.message || countError) }; }
    window.dispatchEvent(new CustomEvent("classcare:sync", { detail: lastState }));
    listeners.slice().forEach(listener => { try { listener(lastState.counts, lastState); } catch (_) {} });
    return lastState;
  }
  function assertSameUser(uid) {
    if (!uid || currentUid() !== uid) throw Object.assign(new Error("The signed-in account changed during synchronization."), { code: "account-changed" });
  }
  async function upsertByKey(store, payload, key, source) {
    const ownerUid = requireOwner();
    const created = await atomicUpsert(store, ownerUid, key, payload, source);
    await emit("offline");
    return created;
  }

  const OfflineSync = {
    STORES,
    enqueueAttendance(payload) {
      const key = `${payload.student_uid || ""}_${payload.date || ""}`;
      return upsertByKey(STORES.ATTENDANCE, payload, key, "scanner");
    },
    async queueTicket(payload) {
      const ownerUid = requireOwner();
      await add(STORES.TICKETS, { ...payload, owner_uid: ownerUid, _pending: true, _retryCount: 0, _ts: Date.now() });
      await emit("offline"); return true;
    },
    async queueMood(payload) {
      const ownerUid = requireOwner();
      await add(STORES.MOODS, { ...payload, owner_uid: ownerUid, _pending: true, _retryCount: 0, _ts: Date.now() });
      await emit("offline"); return true;
    },
    enqueueEmotion(payload) {
      const key = `${payload.student_uid || ""}_${payload.date || ""}`;
      return upsertByKey(STORES.EMOTIONS, payload, key, "scanner");
    },
    pendingCount: counts,
    getState: () => ({ ...lastState, counts: { ...lastState.counts } }),
    on(listener) { listeners.push(listener); return () => { const index = listeners.indexOf(listener); if (index >= 0) listeners.splice(index, 1); }; },
    _emit: () => emit(lastState.status),
    async flushAll() {
      const ownerUid = currentUid();
      if (!ownerUid) { await emit("signed-out"); return false; }
      if (!navigator.onLine) { await emit("offline"); return false; }
      if (flushPromise) return flushPromise;
      flushPromise = (async () => {
        await emit("syncing");
        const results = [];
        for (const [label, flusher] of [["attendance", this._flushAttendance], ["ticket", this._flushTickets], ["mood", this._flushMoods], ["emotion", this._flushEmotions]]) {
          try { results.push(await flusher.call(this, ownerUid)); }
          catch (error) { results.push(0); console.warn(`[offline] ${label} flush failed:`, error); }
        }
        const remaining = await counts();
        const hasPending = Object.values(remaining).some(Boolean);
        await emit(hasPending ? "error" : "synced");
        return results;
      })().finally(() => { flushPromise = null; });
      return flushPromise;
    },
    async _markFailure(store, record, error) {
      await updateIfRevision(store, record, { _retryCount: Number(record._retryCount || 0) + 1, _lastError: String(error?.message || error), _lastAttempt: Date.now() });
    },
    async _flushAttendance(ownerUid) {
      const list = owned(await readAll(STORES.ATTENDANCE), ownerUid); let ok = 0;
      for (const record of list) {
        try {
          assertSameUser(ownerUid);
          const payload = {
            student_uid: record.student_uid, date: record.date, time_in: record.time_in,
            status: record.status, section: record.section || "", minutes_late: record.minutes_late || 0,
            scanned_by: record.scanned_by || ownerUid, synced_from_offline: true,
            synced_at: firebase.firestore.FieldValue.serverTimestamp()
          };
          for (const field of ['student_id','student_name','subject','emotion','emotion_label','emotion_emoji','is_negative','wellbeing_data','checkin_skipped']) {
            if (record[field] !== undefined) payload[field] = record[field];
          }
          if (record.time_out) Object.assign(payload, { time_out: record.time_out, timed_out_by: ownerUid, timed_out_at: firebase.firestore.FieldValue.serverTimestamp() });
          await ClassCare.DB.attendance.doc(ClassCare.DB.attendanceDocId(record.student_uid, record.date)).set(payload, { merge: true });
          assertSameUser(ownerUid); if (await updateIfRevision(STORES.ATTENDANCE, record, null)) ok++;
        } catch (error) { await this._markFailure(STORES.ATTENDANCE, record, error); if (error?.code === "account-changed") break; }
      }
      return ok;
    },
    async _flushTickets(ownerUid) { return this._flushOwned(STORES.TICKETS, ownerUid, async record => {
      await ClassCare.DB.helpdesk_tickets.add({ sender_uid: record.sender_uid, sender_name: record.sender_name, sender_id: record.sender_id, section: record.section, message: record.message, status: "Open", timestamp: firebase.firestore.FieldValue.serverTimestamp(), synced_from_offline: true });
    }); },
    async _flushMoods(ownerUid) { return this._flushOwned(STORES.MOODS, ownerUid, async record => {
      const date = record.date || Utils.todayIso();
      await ClassCare.DB.users.doc(record.sender_uid || record.student_uid).collection("moods").doc(date).set({ mood: record.mood, synced_from_offline: true, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
    }); },
    async _flushEmotions(ownerUid) { return this._flushOwned(STORES.EMOTIONS, ownerUid, async record => {
      // Preserve the recorded response; never substitute a positive answer for missing input.
      const answers = record.wellbeing_data || record.answers || null;
      const fields = {emotion: record.emotion || null, emotion_label: record.emotion_label || null,
        emotion_emoji: record.emotion_emoji || null, is_negative: record.is_negative === true};
      const batch = ClassCare.getFirebase().db.batch();
      const stamp = firebase.firestore.FieldValue.serverTimestamp();
      batch.set(ClassCare.DB.attendance.doc(ClassCare.DB.attendanceDocId(record.student_uid, record.date)), {
        ...fields, wellbeing_data: answers, wellbeing_surveyed_by: ownerUid,
        wellbeing_surveyed_at: stamp, wellbeing_synced_from_offline: true
      }, {merge:true});
      const id = ClassCare.DB.emotionalCheckinDocId(record.student_uid,record.date);
      batch.set(ClassCare.DB.emotional_checkins.doc(id), {
        ...fields, student_uid:record.student_uid, student_id:record.student_id || '',
        student_name:record.student_name || 'Student', section:record.section || '', date:record.date,
        wellbeing_data:answers, recorded_by:ownerUid, recorded_via:'qr_scanner_offline_synced',
        created_at:stamp, synced_from_offline:true
      }, {merge:true});
      await batch.commit();
    }); },
    async _flushOwned(store, ownerUid, write) {
      const list = owned(await readAll(store), ownerUid); let ok = 0;
      for (const record of list) {
        try { assertSameUser(ownerUid); await write(record); assertSameUser(ownerUid); if (await updateIfRevision(store, record, null)) ok++; }
        catch (error) { await this._markFailure(store, record, error); if (error?.code === "account-changed") break; }
      }
      return ok;
    },
    _readAll: readAll
  };

  window.addEventListener("online", () => { if (currentUid()) void OfflineSync.flushAll(); else void emit("signed-out"); });
  window.addEventListener("offline", () => { void emit("offline"); });
  const services = window.ClassCare?.getFirebase?.();
  services?.auth?.onAuthStateChanged(user => {
    void emit(user ? (navigator.onLine ? "idle" : "offline") : "signed-out");
    if (user && navigator.onLine) void OfflineSync.flushAll();
  });
  window.OfflineSync = OfflineSync;
})();
