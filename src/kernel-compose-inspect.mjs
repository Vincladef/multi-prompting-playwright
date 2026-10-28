import Kernel from "@onkernel/sdk";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

// Strictly read-only inspection of generic composer controls; no message submission.
const report = { type: "kernel-composer-diagnostic", status: "started", profile: "multi-prompting" };
let kernel, session, browser;
try {
  if (!process.env.KERNEL_API_KEY) throw new Error("missing_secret");
  kernel = new Kernel({ apiKey: process.env.KERNEL_API_KEY });
  session = await kernel.browsers.create({
    name: "kernel-composer-readonly",
    headless: true, stealth: false, timeout_seconds: 240,
    start_url: "https://chatgpt.com/",
    profile: { name: "multi-prompting", save_changes: false }
  });
  browser = await chromium.connectOverCDP(session.cdp_ws_url, { timeout: 40000 });
  const page = browser.contexts()[0]?.pages()[0] || await browser.contexts()[0].newPage();
  await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.waitFor({state:"visible",timeout:25000});
  await editor.fill("Diagnostic non envoyé");
  report.control = await editor.evaluate(el => {
    const info = { editor_tag: el.tagName, editor_role: el.getAttribute("role"),
      editor_id: el.id, editor_testid: el.getAttribute("data-testid"), ancestors: [] };
    for (let parent = el.parentElement, level = 1; parent && level <= 9; parent = parent.parentElement, level++) {
      const buttons = [...parent.querySelectorAll("button")];
      if (buttons.length) {
        info.ancestors.push({level, button_count: buttons.length, buttons: buttons.slice(0,16).map(b => ({
          aria: b.getAttribute("aria-label"), testid: b.getAttribute("data-testid"),
          title: b.getAttribute("title"), type: b.getAttribute("type"), disabled: b.disabled,
          visible: b.getBoundingClientRect().width > 0
        }))});
        if (buttons.length > 15) break;
      }
    }
    return info;
  });
  // Read only the DOM structure of the first listed conversation, never any text or IDs.
  try {
    const named = page.getByRole("link", {name: /Répondre ALPHA|Réponds exactement ALPHA/i}).first();
    const first = (await named.count()) > 0 ? named : page.locator('a[href^="/c/"]').last();
    if (await first.count()) {
      await first.click();
      try { await page.locator('button[aria-label="Copy message"]').first().waitFor({state:"attached",timeout:15000}); } catch {}
      await page.waitForTimeout(1200);
      report.conversation_structure = await page.evaluate(() => {
        const q = s => document.querySelectorAll(s).length;
        return {
          is_conversation: location.pathname.startsWith("/c/"),
          role_user: q('[data-message-author-role="user"]'),
          role_assistant: q('[data-message-author-role="assistant"]'),
          articles: q("main article"),
          turn_testids: q('[data-testid^="conversation-turn"]'),
          messages: q('[data-testid*="message"]'),
          generic_testids: [...new Set([...document.querySelectorAll("main [data-testid]")]
            .map(e => e.getAttribute("data-testid")).filter(Boolean))].slice(0,18),
          main_children: [...(document.querySelector("main")?.children || [])].slice(0,8)
            .map(el => ({tag:el.tagName, role:el.getAttribute("role"), testid:el.getAttribute("data-testid")})),
          total_nodes: document.querySelectorAll("main *").length,
          buttons: [...document.querySelectorAll("main button")].map(el => ({
            aria: el.getAttribute("aria-label"),
            title: el.getAttribute("title"),
            testid: el.getAttribute("data-testid"),
            type: el.getAttribute("type"),
            disabled: el.disabled,
            visible: !!el.getClientRects().length
          })).slice(-45),
          semantic_nodes: [...document.querySelectorAll("main [role],main [data-testid],main article,main section")].slice(-65).map(el => ({
            tag: el.tagName, role: el.getAttribute("role"),
            testid: el.getAttribute("data-testid"),
            classes: [...el.classList].filter(s => /^[a-zA-Z0-9_:\\[\\]-]{1,60}$/.test(s)).slice(0,6),
            children: el.children.length
          })),
          action_groups: [...document.querySelectorAll('main button[aria-label="Copy message"]')].slice(-4).map(btn=>{
            const result={};
            let el=btn;
            for(let level=0;level<7&&el;level++,el=el.parentElement){
              const buttons=[...el.querySelectorAll('button')].map(b=>b.getAttribute("aria-label")||"unlabeled").slice(0,14);
              result["level_"+level]={tag:el.tagName,role:el.getAttribute("role"),classes:[...el.classList].slice(0,7),buttons,child_count:el.children.length};
            }
            return result;
          }),
          class_frequencies: Object.entries([...document.querySelectorAll("main *")].reduce((a,el)=>{
            for (const token of el.classList) {
              if (!/^(group|prose|markdown|message|turn|relative|flex|items-|justify-|rounded|self-|text-|bg-)/.test(token)) continue;
              if (!/^[a-zA-Z0-9_:\\[\\]-]{1,60}$/.test(token)) continue;
              a[token]=(a[token]||0)+1;
            } return a;
          },{})).sort((a,b)=>b[1]-a[1]).slice(0,35)

        };
      });
    } else report.conversation_structure = {is_conversation:false,reason:"no_visible_chat_link"};
  } catch { report.conversation_structure = {status:"inspection_unavailable"}; }
  report.status = "completed";
} catch(e) {
  report.status = "blocked";
  report.error = ["TimeoutError","APIError"].includes(e?.name) ? e.name : "other";
  process.exitCode = 1;
} finally {
  try { if(browser) await browser.close(); } catch {}
  try { if(session && kernel) await kernel.browsers.deleteByID(session.session_id); } catch { report.cleanup = "failed"; process.exitCode=1; }
  await mkdir("artifacts",{recursive:true});
  await writeFile("artifacts/kernel-compose-diagnostic.json", JSON.stringify(report,null,2)+"\n");
  console.log("COMPOSE_DIAGNOSTIC="+JSON.stringify(report));
}
