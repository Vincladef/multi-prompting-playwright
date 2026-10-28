import Kernel from "@onkernel/sdk";
import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { inspectChatDom, installChatObserver } from "./kernel-dom.mjs";
import { unsealRequest } from "./kernel-sealed.mjs";

// No message text extraction, screenshots, cookies, signed URLs or private thread URLs.
// Only generic DOM actions of the currently authenticated ChatGPT interface.
const USER_CONFIRM_MS = 45000;
const RESPONSE_TIMEOUT_MS = Math.max(180000, Math.min(Number(process.env.REPLY_TIMEOUT_MS || 900000), 2700000));
const POLL_MS = 350;
const QUIET_MS = 2100;
const EDITOR = 'main [role="textbox"][contenteditable="true"]';
const SEND = 'main button[aria-label="Send"]';

const report = {
  kind: "kernel-sequence-v2",
  status: "initializing",
  phase: "initialization",
  prompts_total: 0,
  send_attempts: 0,
  prompts_submitted: 0,
  responses_confirmed: 0,
  profile: "multi-prompting",
  cleanup: "not_needed",
  steps: []
};
let kernel, session, browser, page;
let threadPath = null;
let baseline = { userActions: 0, assistantCompleted: 0 };

function resolveTarget(input) {
  const target = input.target || "new";
  if (target === "new") {
    if (input.target_url) fail("invalid_target");
    return null;
  }
  if (target !== "existing" && target !== "caller") fail("invalid_target");
  if (typeof input.target_url !== "string") fail("target_url_required");
  let url;
  try { url = new URL(input.target_url); } catch { fail("invalid_target_url"); }
  if (url.protocol !== "https:" || url.hostname !== "chatgpt.com" ||
      url.port || url.username || url.password || url.search || url.hash ||
      !/^\\/c\\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(url.pathname))
    fail("invalid_target_url");
  return url.origin + url.pathname;
}

function fail(code) { throw new Error(code); }
async function waitForState(stage, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let state;
    try {
      state = await page.evaluate(inspectChatDom);
    } catch {
      await page.waitForTimeout(POLL_MS);
      continue;
    }
    if (state.userActions > baseline.userActions + report.prompts_submitted + 1)
      fail("unexpected_user_turns");
    if (predicate(state)) return state;
    await page.waitForTimeout(POLL_MS);
  }
  fail("timeout_" + stage);
}
async function ensureReady() {
  if (/just a moment|attention required|verification/i.test(await page.title())) fail("security_challenge");
  try {
    await page.locator(EDITOR).first().waitFor({ state: "visible", timeout: 25000 });
  } catch { fail("composer_missing"); }
  const current = await page.evaluate(inspectChatDom);
  if (current.stop) fail("generation_already_active");
  if (!current.hasEditor) fail("composer_missing");
  if (!current.editorEmpty) fail("composer_not_empty");
  return current;
}
async function sendAndConfirm(prompt, index) {
  report.phase = "ready_" + (index + 1);
  const before = await ensureReady();
  if (index > 0 && (!before.inConversation || !threadPath ||
      new URL(page.url()).pathname !== threadPath)) fail("wrong_conversation");
  if (before.userActions !== baseline.userActions + index ||
      before.assistantCompleted !== baseline.assistantCompleted + index)
    fail("unexpected_turn_counts");

  report.phase = "filling_" + (index + 1);
  const editor = page.locator(EDITOR).first();
  await editor.fill(prompt);
  const send = page.locator(SEND).first();
  try {
    await send.waitFor({ state: "visible", timeout: 20000 });
  } catch { fail("send_button_missing"); }
  if (!(await send.isEnabled())) fail("send_disabled");

  // Record intention BEFORE clicking: if navigation interrupts click,
  // we cannot prove whether the message was submitted. Never replay it.
  report.phase = "sending_" + (index + 1);
  report.send_attempts += 1;
  await send.click();

  report.phase = "user_confirmation_" + (index + 1);
  await waitForState("user", state =>
    state.inConversation && state.userActions === before.userActions + 1,
    USER_CONFIRM_MS);
  if (index === 0) threadPath = new URL(page.url()).pathname;
  if (new URL(page.url()).pathname !== threadPath) fail("conversation_changed");
  report.prompts_submitted += 1;
  console.log("KERNEL_STATE=" + JSON.stringify({turn:index+1,phase:"user_confirmed",sent:report.prompts_submitted,completed:report.responses_confirmed}));
  report.steps.push({number:index + 1, state:"user_confirmed"});

  report.phase = "reply_confirmation_" + (index + 1);
  const after = await waitForState("assistant", state =>
    state.userActions === before.userActions + 1 &&
    state.assistantCompleted === before.assistantCompleted + 1 &&
    state.assistantCopies === before.assistantCopies + 1 &&
    state.assistantRegenerates === before.assistantRegenerates + 1 &&
    state.assistantRates === before.assistantRates + 1 &&
    !state.stop && state.hasEditor &&
    state.mutationQuietMs !== null && state.mutationQuietMs >= QUIET_MS,
    RESPONSE_TIMEOUT_MS);

  // Final idempotence guard: the conversation is the same and the counters
  // still refer to exactly one new user message and one finished assistant.
  if (new URL(page.url()).pathname !== threadPath ||
    after.userActions !== baseline.userActions + index + 1 ||
    after.assistantCompleted !== baseline.assistantCompleted + index + 1)
    fail("ambiguous_completion");

  report.responses_confirmed += 1;
  console.log("KERNEL_STATE=" + JSON.stringify({turn:index+1,phase:"response_confirmed",sent:report.prompts_submitted,completed:report.responses_confirmed}));
  report.steps[index] = {number:index + 1, state:"response_confirmed"};
  report.phase = "reply_confirmed_" + (index + 1);
}

try {
  if (!process.env.KERNEL_API_KEY) fail("missing_kernel_secret");
  const path = process.env.SEQUENCE_REQUEST || "";
  if (!/^requests\/kernel-[a-zA-Z0-9_-]{1,70}\.sealed\.json$/.test(path) ||
      basename(path).includes("..")) fail("invalid_request_path");
  report.phase = "decrypting_request";
  const envelope = JSON.parse(await readFile(path, "utf8"));
  const input = unsealRequest(envelope, process.env.KERNEL_API_KEY);
  if (input.mode !== "live" ||
      !Array.isArray(input.prompts) || input.prompts.length < 1 ||
      input.prompts.length > 20 ||
      !input.prompts.every(s => typeof s === "string" && !!s.trim() && s.length <= 10000))
    fail("invalid_request");
  report.prompts_total = input.prompts.length;
  const destination = resolveTarget(input);

  kernel = new Kernel({ apiKey: process.env.KERNEL_API_KEY });
  session = await kernel.browsers.create({
    name: "multi-prompting-sequence",
    headless: true, stealth: false, timeout_seconds: 10800,
    start_url: "https://chatgpt.com/",
    profile: { name: "multi-prompting", save_changes: true }
  });
  report.phase = "connecting_cdp";
  browser = await chromium.connectOverCDP(session.cdp_ws_url, { timeout: 45000 });
  const context = browser.contexts()[0];
  if (!context) fail("missing_context");
  page = context.pages()[0] || await context.newPage();
  report.phase = "opening_chatgpt";
  await page.goto(destination || "https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.evaluate(installChatObserver);
  if (destination) {
    // Never add a prompt while the invoking assistant may still be replying.
    // The destination URL is inside the encrypted request, never written to logs.
    baseline = await waitForState("existing_idle", state =>
      state.inConversation && !state.stop && state.hasEditor && state.editorEmpty &&
      state.userActions > 0 && state.userActions === state.assistantCompleted &&
      state.mutationQuietMs !== null && state.mutationQuietMs >= QUIET_MS,
      180000);
    if (new URL(page.url()).pathname !== new URL(destination).pathname)
      fail("wrong_conversation");
    threadPath = new URL(destination).pathname;
  } else {
    await ensureReady();
    baseline = await page.evaluate(inspectChatDom);
    if (baseline.userActions || baseline.assistantCompleted)
      fail("not_new_conversation");
  }
  report.status = "running";

  for (let i = 0; i < input.prompts.length; i++) {
    await sendAndConfirm(input.prompts[i], i);
  }
  report.status = "completed";
  report.phase = "completed";
} catch (error) {
  report.status = report.send_attempts > report.responses_confirmed ? "ambiguous" : "blocked";
  const safe = new Set([
    "missing_kernel_secret", "invalid_request_path", "invalid_request",
    "missing_context", "composer_missing", "send_button_missing", "send_disabled",
    "security_challenge", "generation_already_active", "wrong_conversation",
    "conversation_changed", "unexpected_turn_counts", "unexpected_user_turns",
    "timeout_user", "timeout_assistant", "ambiguous_completion",
    "not_new_conversation", "invalid_envelope", "invalid_secret_length",
    "invalid_target", "target_url_required", "invalid_target_url", "composer_not_empty",
    "timeout_existing_idle"
  ]);
  report.error = safe.has(error?.message) ? error.message : "browser_or_dom_failure";
  report.error_type = ["TimeoutError","APIError","APIConnectionError"].includes(error?.name)
    ? error.name : "other";
  process.exitCode = 1;
} finally {
  try { if (browser) await browser.close(); } catch { report.browser_close = "failed"; }
  if (session && kernel) {
    try {
      await kernel.browsers.deleteByID(session.session_id);
      report.cleanup = "deleted";
    } catch {
      report.cleanup = "delete_failed";
      process.exitCode = 1;
    }
  }
  await mkdir("artifacts", {recursive:true});
  await writeFile("artifacts/kernel-sequence.json", JSON.stringify(report,null,2)+"\n");
  console.log("KERNEL_SEQUENCE_REPORT="+JSON.stringify(report));
}
