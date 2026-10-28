import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { validateExactTitle, chooseUniqueExactTitle, openConversationByTitle } from "../src/kernel-search-title.mjs";

const a = "https://chatgpt.com/c/12345678-1234-1234-1234-123456789abc";
const b = "https://chatgpt.com/c/12345678-1234-1234-1234-123456789abd";

test("Exact title matching, canonical URLs and ambiguity rejection", () => {
  assert.equal(validateExactTitle("  Bonjour  "), "Bonjour");
  assert.equal(chooseUniqueExactTitle([{title:"Bonjour",href:a},{title:"Bonjour étendu",href:b}], "Bonjour"), a);
  assert.throws(()=>chooseUniqueExactTitle([{title:"Bonjour",href:a},{title:"Bonjour",href:b}], "Bonjour"), /ambiguous/);
  assert.throws(()=>chooseUniqueExactTitle([{title:"Bonjour",href:a+"?share=1"}], "Bonjour"), /not_found/);
  assert.throws(()=>chooseUniqueExactTitle([{title:"Bonjour",href:"https://chatgpt.com.evil.test/c/12345678-1234-1234-1234-123456789abc"}], "Bonjour"), /not_found/);
  assert.throws(()=>validateExactTitle("A\nB"), /invalid_target_title/);
});

function fixture(links) {
  const items = links.map(([title,href]) =>
    '<a href="'+href+'"><span>'+title+'</span></a>').join("");
  return `<!doctype html><html><body>
    <main><button type="button" id="search">Search chats</button></main>
    <div role="dialog" style="display:none" id="dialog"><input role="searchbox" aria-label="Search chats"><section id="results">${items}</section></div>
    <script>
      const dialog = document.getElementById("dialog");
      const input = dialog.querySelector("input");
      document.addEventListener("keydown", e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
          e.preventDefault(); dialog.style.display="block"; input.focus();
        }
      });
      document.getElementById("search").onclick=()=>{dialog.style.display="block";input.focus();};
    </script></body></html>`;
}

test("Browser integration: select only one exact title, then navigate", {timeout:20000}, async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.route("https://chatgpt.com/**", route => route.fulfill({status:200, contentType:"text/html",
      body:fixture([["Le bon fil",a],["Le bon fil encore",b]])}));
    await page.goto("https://chatgpt.com/");
    const url = await openConversationByTitle(page,"Le bon fil",{timeoutMs:3500,stableSamples:2});
    assert.equal(url,a);
    assert.equal(page.url(),a);
  } finally { await browser.close(); }
});

test("Browser integration: identical titles fail closed without navigation", {timeout:20000}, async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.route("https://chatgpt.com/**", route => route.fulfill({status:200, contentType:"text/html",
      body:fixture([["Doublon",a],["Doublon",b]])}));
    await page.goto("https://chatgpt.com/");
    await assert.rejects(openConversationByTitle(page,"Doublon",{timeoutMs:1500,stableSamples:2}), /ambiguous/);
    assert.equal(page.url(),"https://chatgpt.com/");
  } finally { await browser.close(); }
});

test("Browser integration: Search button and combobox fallback", {timeout:20000}, async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    const html = `<!doctype html><html><body><main><button id="search" aria-label="Search">Search</button></main>
      <div role="dialog" id="dialog" style="display:none">
      <input role="combobox" placeholder="Search…">
      <a href="${a}"><span>Le titre voulu</span></a></div>
      <script>
        document.getElementById("search").addEventListener("click",()=>{
          document.getElementById("dialog").style.display="block";
        });
      </script></body></html>`;
    await page.route("https://chatgpt.com/**", route => route.fulfill({status:200,contentType:"text/html",body:html}));
    await page.goto("https://chatgpt.com/");
    assert.equal(await openConversationByTitle(page,"Le titre voulu",{timeoutMs:7500,stableSamples:2}),a);
  } finally {await browser.close();}
});
