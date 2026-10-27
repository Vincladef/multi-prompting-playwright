import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const replySelector = '[data-message-author-role="assistant"]';
const userSelector = '[data-message-author-role="user"]';
const composerSelector = '#prompt-textarea[contenteditable="true"], [data-testid="composer-input"][contenteditable="true"]';
const stopSelector = '[data-testid="stop-button"], [data-testid="composer-stop-button"]';
const responseTimeoutMs = Math.max(180000, Math.min(Number(process.env.RESPONSE_TIMEOUT_MS || 2700000), 3600000));

function fixtureHtml() {
  return '<!DOCTYPE html><html><body><main id="conversation"></main>' +
    '<div id="prompt-textarea" contenteditable="true" role="textbox"></div>' +
    '<button data-testid="send-button">Envoyer</button><button data-testid="stop-button" hidden>Stop</button>' +
    '<script>' +
    'const conversation=document.querySelector("#conversation");' +
    'const composer=document.querySelector("#prompt-textarea");' +
    'const stop=document.querySelector("[data-testid=stop-button]");' +
    'document.querySelector("[data-testid=send-button]").onclick=()=>{' +
    'const value=composer.textContent.trim();if(!value)return;composer.textContent="";' +
    'const user=document.createElement("article");user.dataset.messageAuthorRole="user";user.textContent=value;conversation.append(user);' +
    'stop.hidden=false;setTimeout(()=>{const assistant=document.createElement("article");' +
    'assistant.dataset.messageAuthorRole="assistant";assistant.textContent="Réponse simulée "+value;conversation.append(assistant);stop.hidden=true;},300);' +
    '};</script></body></html>';
}

export async function createBrowserAdapter(mode) {
  let context;
  let browser;
  if (mode === "demo") {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
  } else if (mode === "chatgpt" && process.env.ALLOW_LIVE_CHATGPT === "true") {
    const profile = process.env.PROFILE_DIR || "/app/profile";
    await mkdir(profile, { recursive: true });
    context = await chromium.launchPersistentContext(profile, { headless: true });
  } else {
    throw new Error("Mode non autorisé : ChatGPT désactivé par défaut.");
  }
  const page = await context.newPage();
  try {
    if (mode === "demo") {
      await page.setContent(fixtureHtml());
    } else {
      await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.locator(composerSelector).first().waitFor({ state: "visible", timeout: 20000 });
    }
  } catch (error) {
    await context.close();
    if (browser) await browser.close();
    throw new Error("Navigateur inaccessible ou session non authentifiée : " + error.message);
  }

  return {
    async sendAndWait(prompt, { signal }) {
      if (signal?.aborted) throw new Error("Cancelled");
      const assistantBefore = await page.locator(replySelector).count();
      const userBefore = await page.locator(userSelector).count();
      const composer = page.locator(composerSelector).first();
      await composer.waitFor({ state: "visible", timeout: 20000 });
      await composer.fill(prompt);
      const send = page.locator('[data-testid="send-button"]').first();
      await send.waitFor({ state: "visible", timeout: 15000 });
      await send.click();
      await page.waitForFunction(
        (expected) => document.querySelectorAll('[data-message-author-role="user"]').length >= expected,
        userBefore + 1,
        { timeout: 15000 }
      );
      await page.waitForFunction(
        (expected) => document.querySelectorAll('[data-message-author-role="assistant"]').length >= expected,
        assistantBefore + 1,
        { timeout: responseTimeoutMs }
      );
      // Only checks DOM completion signals; intentionally never reads or extracts response text.
      await page.waitForFunction(() => {
        const stopButtons = [...document.querySelectorAll('[data-testid="stop-button"],[data-testid="composer-stop-button"]')];
        return stopButtons.every((element) => element.hidden || getComputedStyle(element).display === "none");
      }, null, { timeout: responseTimeoutMs });
      await page.waitForTimeout(900);
      if (signal?.aborted) throw new Error("Cancelled");
      if (await page.locator(replySelector).count() !== assistantBefore + 1) {
        throw new Error("Nombre de réponses inattendu ; arrêt sans réémission.");
      }
      if (await page.locator(stopSelector).evaluateAll((items) => items.some((x) => !x.hidden && getComputedStyle(x).display !== "none"))) {
        throw new Error("Génération encore active ; arrêt sans réémission.");
      }
    },
    async auditDemo(prompts) {
      if (mode !== "demo") throw new Error("Audit réservé au mode démonstration.");
      const users = await page.locator(userSelector).allTextContents();
      const assistants = await page.locator(replySelector).allTextContents();
      if (users.length !== prompts.length || assistants.length !== prompts.length) {
        return { valid: false, reason: "Nombre de messages inattendu", userMessages: users.length, assistantMessages: assistants.length };
      }
      const valid = prompts.every((prompt, i) => users[i] === prompt && assistants[i] === "Réponse simulée " + prompt);
      return {
        valid,
        reason: valid ? null : "Ordre ou contenu de la conversation simulée incorrect",
        userMessages: users.length,
        assistantMessages: assistants.length
      };
    },
    url: async () => mode === "demo" ? "demo://local-fixture" : page.url(),
    async close() {
      await context.close();
      if (browser) await browser.close();
    }
  };
}
