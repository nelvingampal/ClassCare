const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const consoleLogs = [];
  page.on("console", msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", err => {
    consoleLogs.push(`[PAGE ERROR] ${err.message}`);
  });

  console.log("Navigating to http://localhost:5500/admin/index.html...");
  await page.goto("http://localhost:5500/admin/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  // Check if guest view is visible
  const isGuestVisible = await page.evaluate(() => {
    return !document.getElementById("view-guest")?.classList.contains("hidden");
  });
  console.log("Guest view visible (login form):", isGuestVisible);

  // Now simulate mock admin auth by dispatching onCurrentUser or setting state
  await page.evaluate(() => {
    const mockAdmin = {
      uid: "admin-uid-123",
      email: "admin@classcare.edu",
      first_name: "System",
      last_name: "Admin",
      role: "admin",
      pending_approval: false
    };

    // Trigger ClassCare.onCurrentUser
    if (window.ClassCare && window.ClassCare.onCurrentUser) {
      window.ClassCare.onCurrentUser = function(cb) {
        setTimeout(() => cb(mockAdmin), 10);
        return () => {};
      };
    }
  });

  // Re-evaluate auth
  await page.evaluate(() => {
    // If there is a global listener callback or reload
    location.hash = "#tab-users";
  });
  await page.waitForTimeout(1500);

  // Print console logs
  console.log("\nConsole logs captured:");
  consoleLogs.forEach(log => console.log(log));

  await browser.close();
  console.log("Done test.");
})();
