import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const html=await readFile(new URL("../native-mcp/widget.html",import.meta.url),"utf8");
test("widget MCP: no duplicate; only one next message after explicit reply acknowledgement",{timeout:60000},async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();
    await page.setContent('<!doctype html><html><body><iframe id="app" style="width:700px;height:650px"></iframe><script>'+
      'window.sent=[];window.addEventListener("message",e=>{const msg=e.data;if(!msg||msg.jsonrpc!=="2.0")return;'+
      'if(msg.method==="ui/initialize"){e.source.postMessage({jsonrpc:"2.0",id:msg.id,result:{hostCapabilities:{},protocolVersion:"2026-01-26"}},"*");'+
      'setTimeout(()=>e.source.postMessage({jsonrpc:"2.0",method:"ui/notifications/tool-input",params:{arguments:{prompts:["ALPHA","BRAVO"]}}},"*"),50);}'+
      'if(msg.method==="ui/message"){window.sent.push(msg.params.content[0].text);e.source.postMessage({jsonrpc:"2.0",id:msg.id,result:{}},"*");}});'+
      '<\/script></body></html>');
    await page.locator("#app").evaluate((frame,source)=>{frame.srcdoc=source},html);
    const frame=page.frameLocator("#app");
    await frame.getByText("ALPHA",{exact:true}).waitFor();
    await frame.locator("#send").click();
    await frame.locator("#confirm").waitFor({state:"visible"});
    assert.deepEqual(await page.evaluate(()=>window.sent),["ALPHA"]);
    assert.equal(await frame.locator("#send").isDisabled(),true);
    await frame.locator("#confirm").click();
    await frame.getByText("BRAVO",{exact:true}).waitFor();
    await frame.locator("#send").click();
    await frame.locator("#confirm").waitFor({state:"visible"});
    assert.deepEqual(await page.evaluate(()=>window.sent),["ALPHA","BRAVO"]);
    await frame.locator("#confirm").click();
    await frame.getByText("Tous les prompts traités.",{exact:true}).waitFor();
    assert.equal(await frame.locator("#send").isDisabled(),true);
  }finally{await browser.close()}
});
