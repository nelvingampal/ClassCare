import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { indexedDB } from "fake-indexeddb";

const source = readFileSync("js/offline-sync.js", "utf8");
const auth = { currentUser: { uid: "teacher-a" }, onAuthStateChanged() { return () => {}; } };
const writes = [];
let attendanceWriter = async payload => { writes.push(payload); };
const attendanceDoc = { set: payload => attendanceWriter(payload) };
const windowTarget = new EventTarget();
const window = Object.assign(windowTarget, {
  indexedDB,
  ClassCare: {
    getFirebase: () => ({ auth }),
    DB: {
      attendance: { doc: () => attendanceDoc }, attendanceDocId: (uid, date) => `${uid}_${date}`,
      helpdesk_tickets: { add: async payload => writes.push(payload) },
      users: { doc: () => ({ collection: () => ({ doc: () => ({ set: async payload => writes.push(payload) }) }) }) }
    }
  }
});
const context = {
  window, indexedDB, navigator: { onLine: true }, CustomEvent: class CustomEvent extends Event { constructor(type, init) { super(type); this.detail = init?.detail; } },
  ClassCare: window.ClassCare,
  firebase: { firestore: { FieldValue: { serverTimestamp: () => "SERVER_TIME" } } }, Utils: { todayIso: () => "2026-09-06" },
  console, setTimeout, clearTimeout
};
vm.runInNewContext(source, context, { filename: "offline-sync.js" });
const sync = window.OfflineSync;

async function clearStores() {
  for (const store of Object.values(sync.STORES)) {
    const rows = await sync._readAll(store);
    await Promise.all(rows.map(row => new Promise((resolve, reject) => {
      const request = indexedDB.open("ClassCareOfflineSync", 4);
      request.onsuccess = () => { const db = request.result; const tx = db.transaction(store, "readwrite"); tx.objectStore(store).delete(row.id); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
      request.onerror = () => reject(request.error);
    })));
  }
  writes.length = 0;
  auth.currentUser = { uid: "teacher-a" };
  attendanceWriter = async payload => { writes.push(payload); };
}

test.beforeEach(clearStores);

test("same-day arrival and time-out merge into one durable queue record", async () => {
  await sync.enqueueAttendance({ student_uid: "student-1", date: "2026-09-06", time_in: "07:31", status: "Present", section: "A", scanned_by: "teacher-a" });
  await sync.enqueueAttendance({ student_uid: "student-1", date: "2026-09-06", time_in: "07:31", time_out: "15:10", status: "Present", section: "A", scanned_by: "teacher-a" });
  const rows = await sync._readAll(sync.STORES.ATTENDANCE);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].time_out, "15:10");
});

test("parallel enqueues serialize without duplicate records", async () => {
  await Promise.all([
    sync.enqueueAttendance({ student_uid: "student-1", date: "2026-09-06", time_in: "07:31", status: "Present", section: "A" }),
    sync.enqueueAttendance({ student_uid: "student-1", date: "2026-09-06", time_in: "07:31", time_out: "15:12", status: "Present", section: "A" })
  ]);
  const rows = await sync._readAll(sync.STORES.ATTENDANCE);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].time_out, "15:12");
  assert.equal(rows[0]._rev, 2);
});

test("failed writes retain the record and increment retry metadata", async () => {
  attendanceWriter = async () => { throw new Error("synthetic failure"); };
  await sync.enqueueAttendance({ student_uid: "student-1", date: "2026-09-06", time_in: "07:31", status: "Present", section: "A" });
  await sync.flushAll();
  const [row] = await sync._readAll(sync.STORES.ATTENDANCE);
  assert.equal(row._retryCount, 1);
  assert.match(row._lastError, /synthetic failure/);
});

test("records are isolated by signed-in account", async () => {
  await sync.enqueueAttendance({ student_uid: "student-1", date: "2026-09-06", time_in: "07:31", status: "Present", section: "A" });
  auth.currentUser = { uid: "teacher-b" };
  assert.equal(Object.values(await sync.pendingCount()).reduce((sum, value) => sum + value, 0), 0);
  await sync.flushAll();
  assert.equal(writes.length, 0);
  auth.currentUser = { uid: "teacher-a" };
  await sync.flushAll();
  assert.equal(writes.length, 1);
});

test("a time-out enqueued during flush survives the stale acknowledgement", async () => {
  let release;
  attendanceWriter = payload => { writes.push(payload); return new Promise(resolve => { release = resolve; }); };
  await sync.enqueueAttendance({ student_uid: "student-1", date: "2026-09-06", time_in: "07:31", status: "Present", section: "A" });
  const flushing = sync.flushAll();
  while (!release) await new Promise(resolve => setTimeout(resolve, 0));
  await sync.enqueueAttendance({ student_uid: "student-1", date: "2026-09-06", time_in: "07:31", time_out: "15:15", status: "Present", section: "A" });
  release();
  await flushing;
  let rows = await sync._readAll(sync.STORES.ATTENDANCE);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].time_out, "15:15");
  attendanceWriter = async payload => { writes.push(payload); };
  await sync.flushAll();
  rows = await sync._readAll(sync.STORES.ATTENDANCE);
  assert.equal(rows.length, 0);
  assert.equal(writes.at(-1).time_out, "15:15");
});
