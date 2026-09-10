const fs = require('node:fs'); const read = p => fs.readFileSync(p,'utf8'), write = (p,s) => fs.writeFileSync(p,s);
let config = read('config/firebase-config.js');
config = config.replace(/master_sections: \["Grade 1 - Section A"[^\n]+/, 'master_sections: [],');
config = config.replace('academic_year: new Date().getFullYear() + "-" + (new Date().getFullYear() + 1)', 'academic_year: ""');
const local = config.indexOf('    // LocalStorage cross-tab fallback'), localEnd = config.indexOf('    // Default strictly to closed',local);
if (local>=0) config=config.slice(0,local)+config.slice(localEnd);
const errorStart=config.indexOf('      console.warn("[settings] using defaults:'), errorEnd=config.indexOf('\n  async getSectionCount',errorStart);
if(errorStart>=0) config=config.slice(0,errorStart)+`      throw error;
    }
  },`+config.slice(errorEnd);
write('config/firebase-config.js',config);
let assignments=read('teacher/assignments.js');
const a=assignments.indexOf('  async function loadMasterSections()'), b=assignments.indexOf('  function renderAssignmentsSection',a);
assignments=assignments.slice(0,a)+`  let stopMasterSections;
  function loadMasterSections() {
    stopMasterSections?.();
    return new Promise(resolve => {
      stopMasterSections = ClassCare.DB.settings.onSnapshot(snap => {
        const data = snap.exists ? snap.data() : {};
        State.masterSections = [...new Set([...(Array.isArray(data.master_sections) ? data.master_sections : []), ...(State.teacher?.assigned_sections || [])])].sort();
        renderAssignmentsSection(); resolve();
      }, error => { State.masterSections = []; Toast.error('Sections unavailable: '+error.message); resolve(); });
    });
  }

`+assignments.slice(b);
assignments=assignments.replace('role: "teacher",\n        teaching_assignments:', 'role: teacher.role,\n        teaching_assignments:');
assignments=assignments.replace('})();', `  ClassCare.onCurrentUser(user => { if (!user || !['teacher','admin'].includes(user.role) || user.pending_approval) { stopMasterSections?.(); _unsubAssignments?.(); } });\n})();`);
write('teacher/assignments.js',assignments);
let html=read('teacher/index.html');
for(const [id,value] of Object.entries({'col-earlier-date':'—','col-latest-date':'—','metric-att-earlier':'Not recorded','metric-attendance-text':'Not recorded','metric-score-early':'—','metric-score-late':'—','metric-support-early':'Not recorded','metric-support-late':'Not recorded'})) html=html.replace(new RegExp('(id="'+id+'">)[^<]*'), '$1'+value);
html=html.replaceAll('Teacher-held scores','Summative scores').replaceAll('Earlier · Aug 24','Previous recorded assessment').replaceAll('Latest · Sep 4','Latest recorded assessment');
html=html.replace('Mathematics · 1st Term','<span id="metric-score-early-meta">Not recorded</span>').replace('Mathematics · 2nd Term','<span id="metric-score-late-meta">Not recorded</span>');
html=html.replaceAll('Safety &amp; support','Student-reported feelings');
write('teacher/index.html',html);
let scanner=read('teacher/scanner.js');
scanner=scanner.replaceAll('sampleStudents','rosterStudents');
const s=scanner.indexOf('    const earlierDateEl =',scanner.indexOf('  async function updateRecordOverviewCard')), e=scanner.indexOf('    const btnAction =',s);
scanner=scanner.slice(0,s)+`    const data = State.holisticData || {};
    const recent = records => records.slice().sort((a,b) => String(b.assessmentDate || b.date).localeCompare(String(a.assessmentDate || a.date)) || ((b.updatedAt?.seconds || b.created_at?.seconds || b.submitted_at?.seconds || 0)-(a.updatedAt?.seconds || a.created_at?.seconds || a.submitted_at?.seconds || 0)));
    const attendance = recent((data.attendance || []).filter(r => r.student_uid === uid));
    const scores = recent((data.scores || []).filter(r => r.studentId === uid));
    const checks = recent((data.checks || []).filter(r => r.student_uid === uid));
    const put = (id,text) => { const el = document.getElementById(id); if(el) el.textContent=text; };
    put('col-earlier-date',attendance[1]?.date || '—'); put('col-latest-date',attendance[0]?.date || '—');
    put('metric-att-earlier', attendance[1] ? attendance[1].status+' · '+(attendance[1].time_in || '—') : 'Not recorded');
    put('metric-attendance-text',attendance[0] ? attendance[0].status+' · '+(attendance[0].time_in || '—') : 'Not recorded');
    ['late','early'].forEach((side,i) => {
      const score=scores[i], check=checks[i];
      put('metric-score-'+side,score ? ClassCareHolistic.percent(score.score,score.maxScore)?.toFixed(1) || '—' : '—');
      put('metric-score-'+side+'-meta',score ? score.subject+' · '+score.assessmentDate+' ('+score.score+'/'+score.maxScore+')' : 'Not recorded');
      put('metric-support-'+side,check ? (check.emotion_label || check.emotion)+' · '+check.date : 'Not recorded');
    });

`+scanner.slice(e);
const r1=scanner.indexOf('  function renderEmotionReport()'), r2=scanner.indexOf('  async function recordTimeOut',r1);
scanner=scanner.slice(0,r1)+`  function renderEmotionReport() {
    const report=$('#emotion-report'); if(!report) return;
    const checks=(State.holisticData?.checks || []).filter(c => c.recorded_via === 'deep_kiosk' && c.date === Utils.todayIso() && studentBelongsToTeacher(c.section));
    report.innerHTML='<h2>Today’s deep emotional checks</h2><p>'+checks.length+' completed assessments</p>'+ClassCareHolistic.QUESTIONS.map(q => {
      const counts=[0,0,0,0]; checks.forEach(c => { const option=c.answers?.[q.id]?.option; if(Number.isInteger(option) && option>=1 && option<=4) counts[option-1]++; });
      return '<div class="emotion-report-item"><strong>'+escapeHtml(q.text)+'</strong><p>'+q.options.map((label,i) => escapeHtml(label)+': '+counts[i]).join(' · ')+'</p></div>';
    }).join('');
  }
`+scanner.slice(r2);
scanner=scanner.replace('    const data = event.detail;', '    const data = event.detail; State.holisticData = data;');
scanner=scanner.replace('    renderAttendanceTable();\n  });\n  window.TeacherScannerState', '    renderAttendanceTable(); renderStats(); renderEmotionReport();\n    const modal = $("#student-emotion-timeline-modal");\n    if (modal?.classList.contains("is-open") && modal.dataset.studentUid) openStudentEmotionTimelineModal(modal.dataset.studentUid);\n  });\n  window.TeacherScannerState');
scanner=scanner.replace('    modal.classList.add("flex", "is-open");', '    modal.classList.add("flex", "is-open"); modal.dataset.studentUid = studentUid;');
const m1=scanner.indexOf('      let checkins = [];',scanner.indexOf('  async function openStudentEmotionTimelineModal')), m2=scanner.indexOf('\n      const total =',m1);
scanner=scanner.slice(0,m1)+`      const checkins = (State.holisticData?.checks || []).filter(c => c.student_uid === studentUid).slice()
        .sort((a,b) => String(b.date).localeCompare(String(a.date)));
`+scanner.slice(m2);
// There is no skip-with-default-answer path in either new kiosk.
scanner=scanner.replace('void skipWellbeingSurvey();', 'teardownWellbeingSurvey();');
write('teacher/scanner.js',scanner);
console.log('Removed synthetic section lists and sample comparison metrics; bound comparisons to actual recorded values.');
