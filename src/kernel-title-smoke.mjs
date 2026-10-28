import Kernel from "@onkernel/sdk";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { openConversationByTitle } from "./kernel-search-title.mjs";

// Read-only live probe. Never selects any real chat or sends a user message.
// The random-looking sentinel has no correspondence to the user's chats.
const report = {kind:"kernel-title-ui-smoke", status:"started", profile:"multi-prompting"};
let kernel, session, browser;
try {
  if (!process.env.KERNEL_API_KEY) throw new Error("missing_kernel_secret");
  kernel = new Kernel({apiKey:process.env.KERNEL_API_KEY});
  session = await kernel.browsers.create({
    name:"multi-prompting-title-readonly", headless:true, stealth:false,
    timeout_seconds:300, start_url:"https://chatgpt.com/",
    profile:{name:"multi-prompting",save_changes:false}
  });
  browser = await chromium.connectOverCDP(session.cdp_ws_url,{timeout:45000});
  const context = browser.contexts()[0];
  if (!context) throw new Error("missing_context");
  const page = context.pages()[0] || await context.newPage();
  await page.goto("https://chatgpt.com/",{waitUntil:"domcontentloaded",timeout:45000});
  try {
    await openConversationByTitle(page,"MPK-PROBE-UNMATCHABLE-28OCT2026",{timeoutMs:3500,stableSamples:2});
    throw new Error("unexpected_sentinel_match");
  } catch (error) {
    if (error?.message !== "conversation_title_not_found") throw error;
  }
  report.status = "completed";
  report.search_ui_reachable = true;
} catch (error) {
  report.status = "blocked";
  const safe = new Set(["missing_kernel_secret","missing_context","search_input_not_found",
    "search_results_region_missing","conversation_title_ambiguous","conversation_search_changed",
    "unexpected_sentinel_match","security_challenge"]);
  report.error = safe.has(error?.message) ? error.message : "browser_or_dom_failure";
  report.error_type = ["TimeoutError","APIError","APIConnectionError"].includes(error?.name)
    ? error.name : "other";
  process.exitCode=1;
} finally {
  try { if(browser) await browser.close(); } catch {report.browser_close="failed";}
  if (session && kernel) {
    try {await kernel.browsers.deleteByID(session.session_id);report.cleanup="deleted";}
    catch {report.cleanup="delete_failed";process.exitCode=1;}
  }
  await mkdir("artifacts",{recursive:true});
  await writeFile("artifacts/kernel-title-smoke.json",JSON.stringify(report,null,2)+"\n");
  console.log("KERNEL_TITLE_SMOKE="+JSON.stringify(report));
}
