import Kernel from "@onkernel/sdk";
import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { basename } from "node:path";

// Deterministic, text-free DOM observation: never extracts ChatGPT output,
// logs prompts, captures screenshots, or emits signed Kernel URLs.
const MAX_PROMPTS = 20;
const REPLY_TIMEOUT = Math.max(180000, Math.min(Number(process.env.REPLY_TIMEOUT_MS || 900000), 2700000));
const ASSISTANT = '[data-message-author-role="assistant"]';
const USER = '[data-message-author-role="user"]';
const COMPOSER = '#prompt-textarea, [data-testid="composer-input"], [role="textbox"][contenteditable="true"], [contenteditable="true"], [role="textbox"], textarea[placeholder]';
const STOP = '[data-testid="stop-button"], [data-testid="composer-stop-button"]';
const SEND = '[data-testid="send-button"]';

const report = { kind: "kernel-sequence", mode: "live", status: "initializing", phase: "initialization",
  prompts_total: 0, prompts_submitted: 0, responses_confirmed: 0,
  profile: "multi-prompting", cleanup: "not_needed" };
let session;
let browser;
let kernel;
let page;

function stopVisible() {
  return Array.from(document.querySelectorAll(
    '[data-testid="stop-button"], [data-testid="composer-stop-button"]'
  )).some(el => !el.hidden && getComputedStyle(el).display !== "none" &&
    getComputedStyle(el).visibility !== "hidden");
}

async function reportFile() {
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/kernel-sequence.json", JSON.stringify(report, null, 2) + "\n");
}
async function assertReady() {
  const title = await page.title();
  if (/just a moment|attention required|verification/i.test(title))
    throw new Error("security_challenge");
  if (await page.locator(COMPOSER).count() === 0)
    throw new Error("composer_missing");
}
async function sendOne(prompt) {
  report.phase = "locating_composer";
  await assertReady();
  const usersBefore = await page.locator(USER).count();
  const assistantsBefore = await page.locator(ASSISTANT).count();
  if (await page.evaluate(stopVisible)) throw new Error("previous_generation_active");
  const composer = page.locator(COMPOSER).first();
  report.phase = "filling_composer";
  await composer.fill(prompt);
  report.phase = "finding_send";
  const button = page.locator(SEND).first();
  await button.waitFor({ state: "visible", timeout: 20000 });
  if (!(await button.isEnabled())) throw new Error("send_button_disabled");
  await button.click();
  report.phase = "clicked_send";
  // From this point, sending may have occurred: NEVER auto-retry.
  report.prompts_submitted += 1;
  report.phase = "checking_user_message";
  await page.waitForFunction(expected => document.querySelectorAll(
    '[data-message-author-role="user"]').length >= expected,
    usersBefore + 1, { timeout: 30000 });
  if (await page.locator(USER).count() !== usersBefore + 1)
    throw new Error("ambiguous_user_message_count");
  report.phase = "checking_assistant_message";
  await page.waitForFunction(expected => document.querySelectorAll(
    '[data-message-author-role="assistant"]').length >= expected,
    assistantsBefore + 1, { timeout: REPLY_TIMEOUT });
  report.phase = "checking_completion";
  await page.waitForFunction(() => {
    const els = Array.from(document.querySelectorAll(
      '[data-testid="stop-button"], [data-testid="composer-stop-button"]'));
    return els.every(el => el.hidden || getComputedStyle(el).display === "none" ||
      getComputedStyle(el).visibility === "hidden");
  }, null, { timeout: REPLY_TIMEOUT });
  // Stable completion window; no response text is read.
  await page.waitForTimeout(2300);
  if (await page.evaluate(stopVisible)) throw new Error("generation_resumed");
  if (await page.locator(ASSISTANT).count() !== assistantsBefore + 1)
    throw new Error("ambiguous_assistant_message_count");
  report.responses_confirmed += 1;
  report.phase = "response_confirmed";
}
try {
  if (!process.env.KERNEL_API_KEY) throw new Error("missing_kernel_secret");
  const path = process.env.SEQUENCE_REQUEST || "";
  if (!/^requests\/kernel-[a-zA-Z0-9_-]{1,70}\.json$/.test(path) ||
      basename(path).includes("..")) throw new Error("invalid_request_path");
  const data = JSON.parse(await readFile(path, "utf8"));
  if (data.mode !== "live" || !Array.isArray(data.prompts) ||
      data.prompts.length < 1 || data.prompts.length > MAX_PROMPTS ||
      !data.prompts.every(p => typeof p === "string" && p.trim() &&
        p.length <= 10000))
    throw new Error("invalid_prompt_request");
  if (data.target !== undefined && data.target !== "new")
    throw new Error("unsupported_target"); // Only a fresh conversation. Do not expose private thread IDs.
  report.prompts_total = data.prompts.length;
  kernel = new Kernel({ apiKey: process.env.KERNEL_API_KEY });
  session = await kernel.browsers.create({
    name: "multi-prompting-sequence",
    headless: true,
    stealth: false,
    timeout_seconds: 10800,
    start_url: "https://chatgpt.com/",
    profile: { name: "multi-prompting", save_changes: true }
  });
  report.status = "browser_created";
  report.phase = "cdp";
  browser = await chromium.connectOverCDP(session.cdp_ws_url, { timeout: 45000 });
  report.phase = "context";
  const context = browser.contexts()[0];
  if (!context) throw new Error("no_context");
  page = context.pages()[0] || await context.newPage();
  report.phase = "navigation";
  await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 45000 });
  report.phase = "composer";
  await page.locator(COMPOSER).first().waitFor({ state: "visible", timeout: 30000 });
  report.phase = "sending";
  for (const prompt of data.prompts) await sendOne(prompt);
  report.status = "completed";
  report.phase = "completed";
} catch (error) {
  report.status = "blocked";
  // Controlled error category only, no exception messages that may contain signed URLs.
  const allowed = ["security_challenge","composer_missing","previous_generation_active",
   "send_button_disabled","ambiguous_user_message_count","ambiguous_assistant_message_count",
   "generation_resumed","invalid_request_path","invalid_prompt_request","unsupported_target",
   "missing_kernel_secret","no_context"];
  report.error = allowed.includes(error?.message) ? error.message : "browser_or_dom_failure";
  report.error_type = ["TimeoutError", "APIError", "APIConnectionError"].includes(error?.name) ? error.name : "other";
  if (page) {
    try {
      report.ui_probe = {
        prompt_id: await page.locator("#prompt-textarea").count(),
        composer_testid: await page.locator('[data-testid="composer-input"]').count(),
        editable: await page.locator('[contenteditable="true"]').count(),
        role_textbox: await page.getByRole("textbox").count(),
        textarea: await page.locator("textarea").count(),
        send_testid: await page.locator('[data-testid="send-button"]').count(),
        login_button: await page.getByRole("button", { name: /log in|se connecter/i }).count(),
        challenge_title: /just a moment|attention required|verification/i.test(await page.title())
      };
    } catch { report.ui_probe = { status: "unavailable" }; }
  }
  process.exitCode = 1;
} finally {
  // Do not record the page URL: it can identify the user's private conversation.
  try { if (browser) await browser.close(); } catch { report.close_error = true; }
  if (session && kernel) {
    try { await kernel.browsers.deleteByID(session.session_id); report.cleanup = "deleted"; }
    catch { report.cleanup = "delete_failed"; process.exitCode = 1; }
  }
  await reportFile();
  console.log("KERNEL_SEQUENCE_REPORT=" + JSON.stringify(report));
}
