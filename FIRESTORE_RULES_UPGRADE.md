# Firebase Rules — ClassCare Real-Time Data & Security Upgrade

Copy this entire block into **Firebase Console > Firestore Database > Rules**, then click **Publish**.

```firestore
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function userExists() {
      return signedIn() && exists(/databases/$(database)/documents/users/$(request.auth.uid));
    }

    function currentUserDoc() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid));
    }

    function getUserRole() {
      return signedIn() && userExists() && ('role' in currentUserDoc().data) && (currentUserDoc().data.role is string)
        ? currentUserDoc().data.role
        : (signedIn() && request.auth.token != null && ('role' in request.auth.token) && (request.auth.token.role is string) ? request.auth.token.role : "");
    }

    function isAdmin() {
      return signedIn() && (
        getUserRole() in ["admin", "Admin", "ADMIN"]
        || (request.auth.token != null && (('admin' in request.auth.token && request.auth.token.admin == true) || ('role' in request.auth.token && request.auth.token.role in ["admin", "Admin", "ADMIN"])))
      );
    }

    function isTeacher() {
      return signedIn() && (
        isAdmin()
        || (getUserRole() in ["teacher", "Teacher", "TEACHER"]
          && (!userExists() || currentUserDoc().data.get('disabled', false) != true))
      );
    }

    function isOwner(userId) {
      return signedIn() && request.auth.uid == userId;
    }

    function sectionMatchesTeacher(section) {
      return isTeacher();
    }

    match /users/{userId} {
      // Authenticated users can read profiles (students see teachers, teachers view student rosters, admins view all)
      allow read: if signedIn();

      // Admins can create any user; teachers can register walk-in students; users can sign up
      allow create: if isAdmin()
        || (isTeacher() && ('role' in request.resource.data) && (request.resource.data.role in ["student", "Student", "STUDENT"]))
        || (isOwner(userId)
          && ('role' in request.resource.data)
          && (request.resource.data.role in ["student", "teacher"]));

      // Admins have full update rights; teachers can update student records; users update their own profile without modifying role
      allow update: if isAdmin()
        || (isTeacher() && ('role' in resource.data) && (resource.data.role in ["student", "Student", "STUDENT"])
          && request.resource.data.role == resource.data.role)
        || (isOwner(userId)
          && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['role', 'disabled']));

      allow delete: if isAdmin();

      match /moods/{moodDate} {
        allow read, write: if isAdmin() || isOwner(userId) || isTeacher();
      }
    }

    match /attendance/{attendanceId} {
      allow read: if isAdmin()
        || isTeacher()
        || (signedIn() && (
          resource.data.student_uid == request.auth.uid
          || resource.data.student_id == request.auth.uid
        ));
      allow create, update: if isAdmin() || isTeacher();
      allow delete: if isAdmin();
    }

    match /enrollments/{enrollmentId} {
      allow read: if isAdmin()
        || isTeacher()
        || (signedIn() && (
          resource.data.student_uid == request.auth.uid
          || resource.data.student_id == request.auth.uid
        ));
      allow create, update: if isAdmin() || isTeacher()
        || (signedIn() && (
          request.resource.data.student_uid == request.auth.uid
          || request.resource.data.student_id == request.auth.uid
        ));
      allow delete: if isAdmin() || isTeacher();
    }

    match /grades/{gradeId} {
      allow read: if isAdmin()
        || isTeacher()
        || (signedIn() && (
          resource.data.student_uid == request.auth.uid
          || resource.data.student_id == request.auth.uid
        ));
      allow create, update: if isAdmin() || isTeacher();
      allow delete: if isAdmin();
    }

    match /helpdesk_tickets/{ticketId} {
      allow read: if isAdmin() || isTeacher() || (signedIn() && (resource.data.sender_uid == request.auth.uid || resource.data.student_uid == request.auth.uid));
      allow create: if signedIn() && (request.resource.data.sender_uid == request.auth.uid || request.resource.data.student_uid == request.auth.uid);
      allow update: if isAdmin() || isTeacher();
      allow delete: if isAdmin() || (signedIn() && (resource.data.sender_uid == request.auth.uid || resource.data.student_uid == request.auth.uid));
    }

    match /settings/{settingId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /pending_alerts/{alertId} {
      allow create: if signedIn();
      allow read, update, delete: if isAdmin();
    }

    match /audit_log/{logId} {
      allow read, delete: if isAdmin();
      allow create, update: if signedIn();
    }

    match /telegram_users/{telegramUserId} {
      allow read: if signedIn();
      allow write: if isAdmin();
    }

    match /section_counters/{counterId} {
      allow read: if signedIn();
      allow create, update: if signedIn();
      allow delete: if isAdmin();
    }

    match /emotional_checkins/{checkinId} {
      allow get: if signedIn();
      allow read: if isAdmin()
        || isTeacher()
        || (signedIn() && resource.data.student_uid == request.auth.uid);
      allow create: if isAdmin() || isTeacher() || (signedIn() && request.resource.data.student_uid == request.auth.uid);
      allow update: if isAdmin() || isTeacher() || (signedIn() && resource.data.student_uid == request.auth.uid);
      allow delete: if isAdmin();
    }

    match /intervention_alerts/{alertId} {
      allow read: if isAdmin()
        || isTeacher()
        || (signedIn() && resource.data.student_uid == request.auth.uid);
      allow create: if isAdmin() || isTeacher();
      allow update: if isAdmin() || isTeacher();
      allow delete: if isAdmin();
    }

    match /teacher_subjects/{subjectDocId} {
      allow read: if signedIn();
      allow create, update: if isAdmin()
        || (isTeacher() && subjectDocId == request.auth.uid);
      allow delete: if isAdmin();
    }

    match /enrollment_requests/{requestId} {
      allow read: if isAdmin()
        || isTeacher()
        || (signedIn() && resource.data.student_uid == request.auth.uid);
      allow create, update: if isAdmin()
        || isTeacher()
        || (signedIn() && request.resource.data.student_uid == request.auth.uid);
      allow delete: if isAdmin();
    }

    match /sections/{sectionId} {
      allow read: if signedIn();
      allow write: if isAdmin() || isTeacher();
    }

    match /students/{studentId} {
      allow read: if signedIn();
      allow write: if isAdmin() || isTeacher();
    }

    // Student "Talk to Someone" concern channel (accessible to Admin & Teacher as Co-Admin)
    match /concern_submissions/{submissionId} {
      // Allow creation for student mental health safety & crisis reporting (authenticated, anonymous, or shared-device)
      allow create: if true;
      // Admin and Teacher can read concerns; students can read their own; signed-in users can listen
      allow read: if isTeacher() || (signedIn() && resource.data.student_uid == request.auth.uid);
      // Admin and Teacher can update (mark resolved, add action notes)
      allow update: if isTeacher();
      allow delete: if isAdmin();
    }

    match /talkToSomeone/{submissionId} {
      allow create: if true;
      allow read: if isTeacher() || (signedIn() && resource.data.student_uid == request.auth.uid);
      allow update: if isTeacher();
      allow delete: if isAdmin();
    }

    // Escalated intervention alerts (teacher → counselor referrals)
    match /concern_referrals/{referralId} {
      allow create: if isAdmin() || isTeacher();
      allow read: if isAdmin() || isTeacher();
      allow update: if isAdmin() || isTeacher();
      allow delete: if isAdmin();
    }

    function assignedSection(section) {
      return isAdmin() || (isTeacher() && section is string && section.size() > 0);
    }
    function validAssessment(d) {
      return d.keys().hasAll(['teacherId', 'section', 'title', 'subject', 'scheduledDate', 'maxScore', 'thresholdPercent', 'createdAt', 'updatedAt'])
        && d.teacherId is string && d.title is string && d.title.size() > 0 && d.title.size() <= 150
        && d.subject is string && d.subject.size() > 0 && d.subject.size() <= 100
        && d.scheduledDate is string && d.scheduledDate.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
        && d.maxScore is number && d.maxScore > 0 && d.maxScore <= 10000
        && d.thresholdPercent is number && d.thresholdPercent >= 0 && d.thresholdPercent <= 100;
    }
    match /summativeAssessments/{assessmentId} {
      allow read: if isAdmin() || isTeacher()
        || (userExists() && resource.data.section == currentUserDoc().data.get('section', ''));
      allow create: if isTeacher() && request.resource.data.teacherId == request.auth.uid
        && assignedSection(request.resource.data.section) && validAssessment(request.resource.data);
      // Published grading scales are immutable so saved percentages stay correct.
      allow update: if isTeacher() && (resource.data.teacherId == request.auth.uid || isAdmin())
        && assignedSection(resource.data.section) && validAssessment(request.resource.data)
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['title', 'subject', 'updatedAt']);
      allow delete: if isAdmin() || (isTeacher() && resource.data.teacherId == request.auth.uid);
    }
    function validScore(d, scoreId) {
      let a = get(/databases/$(database)/documents/summativeAssessments/$(d.assessmentId)).data;
      return d.keys().hasAll(['assessmentId', 'studentId', 'teacherId', 'section', 'score', 'maxScore', 'thresholdPercent', 'assessmentDate', 'updatedAt'])
        && scoreId == d.assessmentId + '_' + d.studentId
        && (d.teacherId == request.auth.uid || isAdmin() || isTeacher())
        && d.section == a.section
        && d.maxScore == a.maxScore && d.thresholdPercent == a.thresholdPercent && d.assessmentDate == a.scheduledDate && d.subject == a.subject
        && d.score is number && d.score >= 0 && d.score <= a.maxScore;
    }
    match /summativeScores/{scoreId} {
      allow get: if isTeacher() || (signedIn() && resource.data.studentId == request.auth.uid);
      allow read: if isAdmin() || isTeacher()
        || (signedIn() && resource.data.studentId == request.auth.uid);
      allow create: if isTeacher() && validScore(request.resource.data, scoreId);
      allow update: if isTeacher()
        && request.resource.data.studentId == resource.data.studentId
        && request.resource.data.assessmentId == resource.data.assessmentId
        && validScore(request.resource.data, scoreId);
      allow delete: if isAdmin() || (isTeacher() && resource.data.teacherId == request.auth.uid);
    }
    match /notifications/{notifId} {
      allow read: if signedIn();
      allow create, update: if isAdmin() || isTeacher();
      allow delete: if isAdmin() || (isTeacher() && resource.data.teacherId == request.auth.uid);
    }

    match /scheduledTests/{testId} {
      allow read: if signedIn();
      allow write: if isAdmin() || isTeacher();
    }

    match /careAlerts/{alertId} {
      allow get: if isTeacher() || isAdmin();
      allow read: if isAdmin() || isTeacher();
      allow create, update: if isTeacher()
        && request.resource.data.studentId is string
        && request.resource.data.status in ['Open', 'Acknowledged', 'Resolved'];
      allow delete: if isAdmin();
    }
  }
}
```
