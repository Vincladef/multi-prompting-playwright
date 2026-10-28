import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { inspectChatDom, installChatObserver } from "../src/kernel-dom.mjs";

test("ChatGPT Oct 2026: distinguish user actions from assistant completion", async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    await page.setContent('<main><div role="textbox" contenteditable="true"></div><button aria-label="Start Voice"></button></main>');
    await page.evaluate(installChatObserver);
    let state = await page.evaluate(inspectChatDom);
    assert.equal(state.hasEditor, true);
    assert.equal(state.editorEmpty, true);
    assert.equal(state.userActions, 0);
    assert.equal(state.assistantCompleted, 0);
    await page.locator("main").evaluate(el => {
      el.insertAdjacentHTML("beforeend", '<div><button aria-label="Copy message"></button><button aria-label="Edit message"></button></div>');
    });
    state = await page.evaluate(inspectChatDom);
    assert.equal(state.userActions, 1);
    assert.equal(state.assistantCompleted, 0);
    await page.locator("main").evaluate(el => {
      el.insertAdjacentHTML("beforeend", '<div><button aria-label="Copy"></button><button aria-label="Rate response"></button><button aria-label="Regenerate response"></button></div>');
    });
    state = await page.evaluate(inspectChatDom);
    assert.equal(state.assistantCompleted, 1);
    assert.equal(state.assistantCopies, 1);
    assert.equal(state.assistantRegenerates, 1);
  } finally { await browser.close(); }
});

test("Observer sees conversation DOM changes and ignores editor changes", async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    await page.setContent('<main><div role="textbox" contenteditable="true"></div></main>');
    await page.evaluate(installChatObserver);
    const before = await page.evaluate(inspectChatDom);
    await page.locator('[contenteditable="true"]').fill("Test");
    const afterInput = await page.evaluate(inspectChatDom);
    assert.equal(afterInput.editorEmpty, false);
    assert.equal(afterInput.mutationVersion, before.mutationVersion);
    await page.locator("main").evaluate(el => el.insertAdjacentHTML("beforeend", '<div aria-label="turn"></div>'));
    await page.waitForTimeout(50);
    const afterTurn = await page.evaluate(inspectChatDom);
    assert.ok(afterTurn.mutationVersion > before.mutationVersion);
  } finally { await browser.close(); }
});
