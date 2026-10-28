import Kernel from "@onkernel/sdk";
import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { unsealRequest } from "./kernel-sealed.mjs";
import { resolveTarget } from "./kernel-target.mjs";
import { openConversationByTitle } from "./kernel-search-title.mjs";

// Read-only positive integration test: URL and title decrypted in memory.
// Never print or persist private title, URL, message text or DOM content.
const report={kind:"kernel-title-positive-readonly",status:"initializing",cleanup:"not_needed"};
let kernel,session,browser;
try {
  const secret=process.env.KERNEL_API_KEY;
  if (!secret) throw new Error("missing_kernel_secret");
  const path=process.env.TITLE_MATCH_REQUEST || "";
  if (!/^requests\/kernel-title-[a-zA-Z0-9_-]{1,70}\.sealed\.json$/.test(path))
    throw new Error("invalid_request_path");
  const data=unsealRequest(JSON.parse(await readFile(path,"utf8")),secret);
  if (data.kind !== "title-readonly-match") throw new Error("invalid_request");
  const expected=resolveTarget({target:"existing",target_url:data.expected_target_url});
  const title=resolveTarget({target:"existing",target_title:data.target_title}).title;
  kernel=new Kernel({apiKey:secret});
  session=await kernel.browsers.create({
    name:"multi-prompting-title-readonly-match",headless:true,stealth:false,
    timeout_seconds:300,start_url:"https://chatgpt.com/",
    profile:{name:"multi-prompting",save_changes:false}
  });
  browser=await chromium.connectOverCDP(session.cdp_ws_url,{timeout:45000});
  const context=browser.contexts()[0];
  if (!context) throw new Error("missing_context");
  const page=context.pages()[0] || await context.newPage();
  await page.goto("https://chatgpt.com/",{waitUntil:"domcontentloaded",timeout:45000});
  const selected=await openConversationByTitle(page,title);
  if (selected !== expected) throw new Error("wrong_conversation");
  report.status="completed";
  report.exact_title_resolved=true;
  report.expected_url_matched=true;
} catch(e) {
  report.status="blocked";
  const safe=new Set(["missing_kernel_secret","invalid_request_path","invalid_request",
    "invalid_envelope","invalid_target_title","invalid_target_url","missing_context",
    "search_input_not_found","search_results_region_missing","conversation_title_not_found",
    "conversation_title_ambiguous","conversation_search_changed","wrong_conversation"]);
  report.error=safe.has(e?.message)?e.message:"browser_or_dom_failure";
  report.error_type=["TimeoutError","APIError","APIConnectionError"].includes(e?.name)?e.name:"other";
  process.exitCode=1;
} finally {
  try {if(browser)await browser.close();}catch{report.browser_close="failed";}
  if(session&&kernel){try{await kernel.browsers.deleteByID(session.session_id);report.cleanup="deleted";}
    catch{report.cleanup="delete_failed";process.exitCode=1;}}
  await mkdir("artifacts",{recursive:true});
  await writeFile("artifacts/kernel-title-positive.json",JSON.stringify(report,null,2)+"\n");
  console.log("KERNEL_TITLE_POSITIVE="+JSON.stringify(report));
}
