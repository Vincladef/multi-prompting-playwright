import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const script=readFileSync(new URL("../browser-extension/content.js", import.meta.url), "utf8");
const fixture = '<!doctype html><html><head><meta charset="utf-8"></head><body>'+
'<main><section id="thread"></section></main>'+
'<div id="prompt-textarea" contenteditable="true" role="textbox"></div>'+
'<button data-testid="send-button">Envoyer</button>'+
'<button data-testid="stop-button" hidden>Stop</button>'+
'<script>'+
'const send=document.querySelector("[data-testid=send-button]");'+
'const stop=document.querySelector("[data-testid=stop-button]");'+
'const thread=document.querySelector("#thread");'+
'send.onclick=()=>{'+
'const input=document.querySelector("#prompt-textarea");'+
'const prompt=input.innerText.trim();'+
'if(!prompt||!stop.hidden)return;'+
'input.innerText="";'+
'const user=document.createElement("article");user.dataset.messageAuthorRole="user";user.textContent=prompt;thread.append(user);'+
'stop.hidden=false;send.disabled=true;'+
'setTimeout(()=>{const assistant=document.createElement("article");assistant.dataset.messageAuthorRole="assistant";assistant.textContent="Réponse simulée "+prompt;'+
'const toolbar=document.createElement("button");toolbar.setAttribute("aria-label","Copy");toolbar.textContent="Copy";assistant.append(toolbar);'+
'thread.append(assistant);stop.hidden=true;send.disabled=false;},180);'+
'};'+
'</script></body></html>';

test("Extension: 3 tours DOM distincts et réponses stables, sans agent", {timeout:50000}, async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();
    await page.route("https://chatgpt.com/", route=>route.fulfill({status:200,contentType:"text/html",body:fixture}));
    await page.goto("https://chatgpt.com/");
    await page.addScriptTag({content:script});
    await page.locator("#mp-sequence").fill("ALPHA\n--- PROMPT ---\nBRAVO\n--- PROMPT ---\nCHARLIE");
    await page.locator("#mp-start").click();
    try{
      await page.waitForFunction(()=>document.querySelector("#mp-status")?.textContent?.includes("Terminé"),null,{timeout:30000});
    }catch(e){throw Error("Statut: "+await page.locator("#mp-status").innerText());}
    assert.deepEqual(
      await page.locator('[data-message-author-role="user"]').allTextContents(),
      ["ALPHA","BRAVO","CHARLIE"]
    );
    assert.equal(await page.locator('[data-message-author-role="assistant"]').count(),3);
  } finally { await browser.close();}
});
