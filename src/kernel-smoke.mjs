import Kernel from "@onkernel/sdk";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

// Safe smoke test: never clicks Send, reads message bodies, exports cookies,
// captures screenshots, or logs CDP/live-view URLs (they contain bearer JWTs).
const report = {
  mode: "kernel-readonly-smoke",
  profile: "multi-prompting",
  kernel_created: false,
  cdp_connected: false,
  public_page_ok: false,
  chatgpt_navigation_ok: false,
  authenticated_ui: "not_checked",
  cleanup: "not_needed",
};

let kernel;
let session;
let browser;

async function saveReport() {
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/kernel-smoke.json", JSON.stringify(report, null, 2) + "\n");
}

try {
  if (!process.env.KERNEL_API_KEY) {
    throw new Error("missing_kernel_api_key");
  }
  kernel = new Kernel({ apiKey: process.env.KERNEL_API_KEY });
  session = await kernel.browsers.create({
    name: "multi-prompting-readonly-smoke",
    headless: true,
    stealth: false,
    timeout_seconds: 180,
    start_url: "https://example.com",
    profile: { name: "multi-prompting", save_changes: false },
  });
  report.kernel_created = true;

  browser = await chromium.connectOverCDP(session.cdp_ws_url, { timeout: 30000 });
  report.cdp_connected = true;

  const context = browser.contexts()[0];
  if (!context) throw new Error("no_browser_context");
  const page = context.pages()[0] || await context.newPage();

  await page.goto("https://example.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
  report.public_page_ok = (await page.title()) === "Example Domain";

  // Read-only check. Do not inspect personal content or message text.
  await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 45000 });
  report.chatgpt_navigation_ok = new URL(page.url()).hostname === "chatgpt.com";
  if (report.chatgpt_navigation_ok) {
    const proof = page.locator('a[href*="/c/"], [data-testid="profile-button"], [data-testid="user-menu-button"]');
    const login = page.getByRole("button", { name: /log in|se connecter|connexion/i });
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (await proof.count() > 0) {
        report.authenticated_ui = "detected";
        break;
      }
      if (await login.count() > 0) {
        report.authenticated_ui = "login_required";
        break;
      }
      await page.waitForTimeout(750);
    }
    if (report.authenticated_ui === "not_checked") report.authenticated_ui = "inconclusive";
  }
  if (!report.public_page_ok || !report.chatgpt_navigation_ok) process.exitCode = 1;
} catch (error) {
  // Never print raw errors, which could contain signed CDP URLs or private session data.
  const safeKinds = new Set(["missing_kernel_api_key", "no_browser_context"]);
  report.error = safeKinds.has(error?.message) ? error.message : "connection_or_navigation_failure";
  report.error_type = ["APIConnectionError", "APIError", "TimeoutError"].includes(error?.name) ? error.name : "other";
  process.exitCode = 1;
} finally {
  try {
    if (browser) await browser.close();
  } catch {
    report.browser_close = "failed";
  }
  if (session && kernel) {
    try {
      await kernel.browsers.deleteByID(session.session_id);
      report.cleanup = "deleted";
    } catch {
      report.cleanup = "delete_failed";
      process.exitCode = 1;
    }
  }
  await saveReport();
  // Emit only booleans and controlled statuses; no URLs, cookies, or page text.
  console.log("KERNEL_SMOKE_REPORT=" + JSON.stringify(report));
}
