/* ============================================================
   teacher/export.js — filtered attendance reports
   ============================================================ */
(function () {
  "use strict";
  const $ = selector => document.querySelector(selector);

  function dateIsoLocal(date) { return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-"); }
  function dateRange(period) {
    const end = new Date(); const start = new Date(end);
    if (period === "weekly") start.setDate(start.getDate() - 6);
    if (period === "monthly") start.setDate(start.getDate() - 29);
    return { start, end, startDate: dateIsoLocal(start), endDate: dateIsoLocal(end) };
  }
  function dateRangeList(start, end) {
    const dates = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      dates.push(dateIsoLocal(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }
  function wellbeingValue(record, index) {
    const answers = record?.wellbeing_data && typeof record.wellbeing_data === "object" ? record.wellbeing_data : {};
    const value = answers[`q${index + 1}`];
    return typeof value === "string" ? value.trim() : "";
  }
  async function getExportRows() {
    if (typeof window._teacherExportData !== "function") { Toast.error("The register is not ready yet. Sign in first."); return null; }
    const source = window._teacherExportData();
    const period = $("#export-period")?.value || "daily";
    const range = dateRange(period);
    const records = new Map();
    const dates = period === "daily" ? [range.endDate] : dateRangeList(range.start, range.end);

    if (period === "daily") {
      source.attMap.forEach((record, uid) => {
        const recordDate = record?.date || range.endDate;
        records.set(`${uid}_${recordDate}`, record);
      });
    } else {
      try {
        const snapshot = await ClassCare.DB.attendance.where("date", ">=", range.startDate).where("date", "<=", range.endDate).get();
        snapshot.forEach(doc => {
          const record = doc.data();
          if (record.student_uid) records.set(`${record.student_uid}_${record.date}`, record);
        });
      } catch (error) {
        console.error("[export] query failed:", error);
        Toast.error(error?.code === "permission-denied" ? "You do not have permission to export this report." : "The report could not load. Try again.");
        return null;
      }
    }

    const rows = [];
    source.list.forEach((student, index) => {
      dates.forEach(date => {
        const record = records.get(`${student.uid}_${date}`) || null;
        rows.push({
          "#": index + 1,
          "Last Name": student.last_name || "",
          "First Name": student.first_name || "",
          "Student ID": student.student_id || "",
          Section: student.section || "",
          Date: date,
          "Time In": record?.time_in || "",
          "Time Out": record?.time_out || "",
          Status: record?.status || "Not recorded",
          "Minutes Late": Number(record?.minutes_late) || 0,
          "Legacy check-in: happiness": wellbeingValue(record, 0),
          "Legacy check-in: class enjoyment": wellbeingValue(record, 1),
          "Legacy check-in: safety and support": wellbeingValue(record, 2),
          "Legacy check-in: activity completion": wellbeingValue(record, 3),
          "Legacy check-in: readiness": wellbeingValue(record, 4),
          "Mood": record?.emotion_checkin_3step?.mood || record?.emotion_label || '',
          "Stress": record?.emotion_checkin_3step?.stress || '',
          "Requested support": record?.emotion_checkin_3step?.need || ''
        });
      });
    });
    return { rows, section: source.section, period, endDate: range.endDate };
  }
  function filenameFor(section) { return `ClassCare_Attendance_${String(section || "all-sections").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-")}`; }
  function csvExport(data) {
    if (!data.rows.length) return Toast.warn("There are no register rows to export.");
    const headers = Object.keys(data.rows[0]); const quote = value => { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
    const csv = [headers.join(","), ...data.rows.map(row => headers.map(key => quote(row[key])).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = `${filenameFor(data.section)}_${data.period}_${data.endDate}.csv`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 500); Toast.success(`Downloaded ${data.rows.length} register row(s).`);
  }
  async function exportCsv() { const data = await getExportRows(); if (data) csvExport(data); }
  async function exportExcel() {
    if (!window.XLSX) return Toast.error("Excel export is unavailable. Use CSV while the spreadsheet library is offline.");
    const data = await getExportRows(); if (!data || !data.rows.length) return Toast.warn("There are no register rows to export.");
    try {
      const workbook = XLSX.utils.book_new(); const headers = ["#", "Last Name", "First Name", "Student ID", "Section", "Date", "Time In", "Time Out", "Status", "Minutes Late", "Feeling", "Stress", "Motivation", "Comfort Talking", "Needs Today"]; const sheet = XLSX.utils.json_to_sheet(data.rows, { header: headers });
      sheet["!cols"] = [{ wch: 4 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 20 }]; sheet["!autofilter"] = { ref: `A1:O${Math.max(data.rows.length + 1, 2)}` }; XLSX.utils.book_append_sheet(workbook, sheet, "Attendance"); XLSX.writeFile(workbook, `${filenameFor(data.section)}_${data.period}_${data.endDate}.xlsx`); Toast.success(`Downloaded ${data.rows.length} register row(s) as Excel.`);
    } catch (error) { console.error("[export] xlsx failed:", error); Toast.error("Excel export failed. Use CSV instead."); }
  }
  document.addEventListener("DOMContentLoaded", () => { $("#btn-export-excel")?.addEventListener("click", exportExcel); $("#btn-export-csv")?.addEventListener("click", exportCsv); });
  window.registerTeacherExportSource = fn => { window._teacherExportData = fn; };
})();
