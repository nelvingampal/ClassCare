const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, doc, getDoc } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyDdGM_24r860-QKrousCyhvBfUsBT8hBKA",
  authDomain: "studentmanagement-system-3dc67.firebaseapp.com",
  projectId: "studentmanagement-system-3dc67",
  storageBucket: "studentmanagement-system-3dc67.firebasestorage.app",
  messagingSenderId: "106967417117",
  appId: "1:106967417117:web:46636c52021d68c26b21f4"
};

async function check() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  console.log("--- FETCHING SETTINGS ---");
  try {
    const sDoc = await getDoc(doc(db, "settings", "global"));
    console.log("Settings exists:", sDoc.exists());
    if (sDoc.exists()) {
      console.log("Settings data:", JSON.stringify(sDoc.data(), null, 2));
    }
  } catch (err) {
    console.error("Error fetching settings:", err.message);
  }

  console.log("\n--- FETCHING USERS ---");
  try {
    const uSnap = await getDocs(collection(db, "users"));
    console.log("Total users found:", uSnap.size);
    uSnap.forEach(d => {
      const u = d.data();
      console.log(`- UID: ${d.id} | Email: ${u.email} | Role: ${u.role} | Pending: ${u.pending_approval} | Name: ${u.first_name} ${u.last_name} | Section: ${u.section} | Assigned: ${JSON.stringify(u.assigned_sections)}`);
    });
  } catch (err) {
    console.error("Error fetching users:", err.message);
  }

  process.exit(0);
}

check();
