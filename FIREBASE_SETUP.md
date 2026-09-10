# Firebase Setup Guide for Testing

This guide will help you create a test teacher account in Firebase so you can test the QR scanner and emotion check flow.

---

## Step 1: Access Firebase Console

1. Go to https://console.firebase.google.com
2. Sign in with your Google account
3. Select your project: **studentmanagement-system-3dc67**

---

## Step 2: Enable Email/Password Authentication

1. In the Firebase Console sidebar, click **Authentication**
2. Click the **Sign-in method** tab
3. Find **Email/Password** in the list
4. Click the toggle to **Enable** it
5. Click **Save**

---

## Step 3: Create a Test Teacher User

1. Still in **Authentication**, click the **Users** tab
2. Click **Add user** (or the **+** button)
3. Fill in:
   - **Email:** `teacher@test.com` (or your preferred email)
   - **Password:** `Test@123456` (meet Firebase requirements: 6+ chars)
4. Click **Add user**
5. You should see the new user listed

---

## Step 4: Create Teacher Profile in Firestore

Your teacher account also needs a profile document in Firestore. Let's create it:

1. In the Firebase Console sidebar, click **Firestore Database**
2. Click **Start collection** (or click `users` if it already exists, then **Add document**)
3. Collection ID: `users`
4. Click **Next**
5. For **Document ID**:
   - **Recommended:** Copy the **User UID** from Authentication (Step 3) and paste it here as the Document ID.
   - *Alternative:* You can also click **Auto ID** (the system will automatically resolve the account via email fallback).
6. Add these fields (click **Add field** for each):

| Field Name | Type | Value |
|---|---|---|
| email | string | `teacher@test.com` (must match Auth email) |
| role | string | `teacher` |
| first_name | string | `Test` |
| last_name | string | `Teacher` |
| pending_approval | boolean | `false` (set to `false` for immediate access) |
| grades_handled | array | `["Grade 1"]` (optional, can also be configured in portal) |
| created_at | timestamp | (current time) |

7. Click **Save**

---

## Step 5: Publish Firestore Security Rules (CRITICAL FOR PERMISSIONS)

To allow teachers to enroll students, view rosters, and record attendance without `"Permission denied. Check your teacher permissions."`:

1. In the Firebase Console sidebar, click **Firestore Database**.
2. Click the **Rules** tab at the top.
3. Open [`firestore.rules`](./firestore.rules) in this project folder and copy its **entire contents**.
4. Select everything in the Firebase Console Rules editor, delete it, and paste the code from `firestore.rules`.
5. Click **Publish**.
6. Wait 5–10 seconds for the rules to propagate across Google servers.

---

## Step 6: Link Teacher to Sections (Optional but Recommended)

To fully test the scanner, create some class sections:

1. In Firestore, create a new collection: `sections`
2. Add a document with ID like `sec_001`:

| Field Name | Type | Value |
|---|---|---|
| name | string | `Grade 1 - Section A` |
| grade | number | `1` |
| subject | string | `General` |
| teacher_id | string | (your teacher user's UID from step 3) |
| students | array | [] (empty for now) |

---

## Step 6: Create Test Student QR Codes (Optional)

If you want to test QR scanning, create student records:

1. In Firestore, create a collection: `students`
2. Add a document with any ID, like `2024-1001`:

| Field Name | Type | Value |
|---|---|---|
| id | string | `2024-1001` |
| first_name | string | `Juan` |
| last_name | string | `Student` |
| section | string | `sec_001` |
| guardian_phone | string | `+63912345678` |

3. Generate a QR code for this JSON:
```json
{
  "v": 1,
  "t": "classcare_id",
  "uid": "student_user_uid_here",
  "sid": "2024-1001"
}
```

Use an online QR generator: https://www.qr-code-generator.com/

---

## Step 7: Test Login

1. Go to http://localhost:5500/teacher/index.html
2. Sign in with:
   - **Email:** `teacher@test.com`
   - **Password:** `Test@123456`
3. If successful, you should see the teacher dashboard
4. If it fails, check:
   - Firebase project ID in `js/config.js` matches your console
   - Email/Password sign-in is enabled in Firebase Auth
   - User exists in Firebase Users tab

---

## Step 8: Test QR Scanner Flow

1. After logging in, click **Take Attendance**
2. Select your section (`Grade 1 - Section A`)
3. Click **Start Camera**
4. Point at a QR code containing student data
5. Scanner should decode it
6. Click **Record Attendance**
7. **Wait 2 seconds** ← This is when the emotion check should appear
8. Wellbeing survey should overlay on top
9. Try to point your finger at an emotion button
10. Hand tracking should detect your hand (if lighting is good)

---

## Troubleshooting

### "Incorrect teacher email or password"
- Verify the email and password match what you created in Firebase
- Make sure Email/Password sign-in is **enabled** in Firebase Auth
- Check that your teacher account exists in the **Users** tab

### "Firebase configuration is invalid"
- Go to Firebase Console → Project Settings
- Copy all credentials and paste into `js/config.js`
- Make sure you copied from the correct project (studentmanagement-system-3dc67)

### "This website is not authorized in Firebase"
- Go to Firebase Console → Authentication → Settings
- Scroll to "Authorized domains"
- Add: `localhost:5500`
- Save and refresh your browser

### Hand tracking not working during emotion check
- Check browser console (F12) for errors with prefix `[wellbeing]`
- Make sure camera permission was granted
- Try a brighter room (MediaPipe works better with good lighting)
- Ensure your hand is fully visible in the camera
- If camera fails, the survey should fall back to button mode

### "Permission denied. Check your teacher permissions." / "Missing or insufficient permissions"
- **Cause 1: Firestore Security Rules not published or outdated.**
  - **Fix:** Follow **Step 5** above! Go to Firebase Console → Firestore Database → **Rules** tab. Copy all code from [`firestore.rules`](./firestore.rules), paste it, and click **Publish**.
- **Cause 2: Teacher document missing in Firestore `users` collection.**
  - **Fix:** In Firebase Console → Firestore Database → `users` collection, ensure there is a document whose Document ID is the teacher's Auth UID (or has field `email` matching the teacher's email).
- **Cause 3: Missing `role` field on teacher document.**
  - **Fix:** Verify the teacher's document has field `role` with value `teacher` (string, lowercase) and `pending_approval: false`.

---

## Quick Checklist

- [ ] Firebase project console accessed
- [ ] Email/Password authentication enabled
- [ ] Test teacher user created (`teacher@test.com`)
- [ ] Teacher profile document created in Firestore
- [ ] (Optional) Sections created
- [ ] (Optional) Student records created
- [ ] (Optional) QR codes generated for students
- [ ] Local server running on http://localhost:5500
- [ ] Teacher login successful
- [ ] QR scanner loads and shows camera feed
- [ ] Emotion check appears after scanning
- [ ] Hand tracking or button mode works

---

## Next Steps

Once you can log in and see the teacher dashboard:

1. Test the complete flow as described in [TEST_FIXES.md](./TEST_FIXES.md)
2. Report any camera errors during the QR→emotion transition
3. Try on different browsers (Chrome, Firefox, Safari) if possible
4. Test on mobile devices if available

Good luck! 📚🎓
