/* ============================================================
   app.js — landing role router
   MODIFIED: Rebranded CampusApp → ClassCare
   ============================================================ */
(function () {
  "use strict";
  const userChip = document.getElementById("user-chip");
  const guestCta = document.getElementById("guest-cta");
  let redirectScheduled = false;

  function initialsOf(user) {
    return [user?.first_name?.[0], user?.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "?";
  }
  function showChip(user) {
    userChip?.classList.remove("hidden");
    document.getElementById("user-name")?.replaceChildren(document.createTextNode(`${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email || "Signed in"));
    const avatar = document.getElementById("user-avatar");
    if (avatar) avatar.textContent = initialsOf(user);
    guestCta?.classList.add("hidden");
  }
  function hideChip() {
    userChip?.classList.add("hidden");
    guestCta?.classList.remove("hidden");
  }
  function showRouterMessage(message) {
    let node = document.getElementById("router-message");
    if (!node) {
      node = document.createElement("div");
      node.id = "router-message";
      node.className = "state-panel state-error";
      guestCta?.parentElement?.appendChild(node);
    }
    node.textContent = message;
  }
  function redirectByRole(user) {
    if (!user || redirectScheduled) return;
    if (user.__profileError) {
      // MODIFIED: Updated error messages from "Campus" to "ClassCare"
      showRouterMessage(user.__profileError === "profile-not-found"
        ? "Your account is signed in, but your ClassCare profile is not ready yet. Please contact the IT administrator to complete your setup."
        : "Your ClassCare profile could not be loaded. Please check your connection and try again.");
      return;
    }
    const routes = { student: "./student/index.html", teacher: "./teacher/index.html", admin: "./admin/index.html" };
    const target = routes[String(user.role || "").toLowerCase()];
    if (!target) {
      // MODIFIED: Improved copy — clearer instructions for unassigned users
      showRouterMessage("Your account does not have an assigned role. Please contact the IT administrator to set up your Student, Teacher, or Admin access.");
      return;
    }
    redirectScheduled = true;
    location.replace(target);
  }

  document.getElementById("btn-logout")?.addEventListener("click", async () => {
    // MODIFIED: CampusApp → ClassCare
    try { await ClassCare.getFirebase()?.auth?.signOut(); Toast.info("Signed out."); }
    catch (error) { Toast.error("Could not sign out. Please check your connection."); }
  });

  // MODIFIED: CampusApp → ClassCare
  ClassCare.onCurrentUser(user => {
    if (!user) return hideChip();
    showChip(user);
    redirectByRole(user);
  });
})();
