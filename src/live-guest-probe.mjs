import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

/**
 * Sonde sur le vrai site chatgpt.com, en session invitée.
 * Aucun cookie, mot de passe ou jeton de l'utilisateur n'est chargé.
 * Aucune réponse n'est extraite ou enregistrée, seulement le nombre de tours.
 * Ne contourne jamais les écrans d'authentification ou de protection.
 */
const report = {
  source: "chatgpt.com",
  mode: "guest",
  status: "not_started",
  requested: 3,
  confirmed: 0,
  authenticated: false,
  outputExtracted: false,
  startedAt: new Date().toISOString()
};
const prompts = ["Réponds uniquement ALPHA.", "Réponds uniquement BRAVO.", "Réponds uniquement CHARLIE."];
const composerSelector = '#prompt-textarea[contenteditable="true"], [data-testid="composer-input"][contenteditable="true"]';
const userSelector = '[data-message-author-role="user"]';
const assistantSelector = '[data-message-author-role="assistant"]';
const stopSelector = '[data-testid="stop-button"], [data-testid="composer-stop-button"]';
let browser;

try {
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"]
  });
  const context = await browser.newContext({ locale: "en-US" });
  const page = await context.newPage();
  page.setDefaultTimeout(18000);
  console.log("Navigation vers chatgpt.com sans identifiants.");
  await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 45000 });
  // Attendre l'hydratation de l'interface sans contourner les protections.
  const composer = page.locator(composerSelector).first();
  await composer.waitFor({ state: "visible", timeout: 25000 }).catch(() => {});
  report.pageUrl = page.url().slice(0, 120);
  report.pageTitle = (await page.title().catch(() => "")).slice(0, 120);
  report.textFields = await page.locator('textarea, [role="textbox"], [contenteditable="true"]').count();
  report.signInLinks = await page.getByRole("link", { name: /log in|sign in|connexion|se connecter/i }).count();
  if (!(await composer.isVisible().catch(() => false))) {
    report.status = "blocked";
    report.reason = "Champ de saisie indisponible : authentification, protection, région ou changement d'interface.";
  } else {
    report.status = "running";
    for (let i = 0; i < prompts.length; i++) {
      const nUser = await page.locator(userSelector).count();
      const nAssistant = await page.locator(assistantSelector).count();
      console.log("Message réel " + (i+1) + " : envoi en mode invité");
      await composer.fill(prompts[i]);
      const send = page.locator('[data-testid="send-button"]').first();
      if (await send.isVisible().catch(() => false)) await send.click();
      else await composer.press("Enter");
      await page.waitForFunction(n =>
        document.querySelectorAll('[data-message-author-role="user"]').length > n,
        nUser, {timeout: 20000}
      );
      // Vérifier seulement l'existence du message, jamais lire son contenu.
      await page.waitForFunction(n =>
        document.querySelectorAll('[data-message-author-role="assistant"]').length > n,
        nAssistant, { timeout: 180000 }
      );
      // Le bouton Stop peut ne pas exister sur certains clients.
      await page.waitForFunction(() =>
        [...document.querySelectorAll('[data-testid="stop-button"],[data-testid="composer-stop-button"]')]
        .every(x => x.hidden || getComputedStyle(x).display === "none"),
        null, { timeout: 180000 }
      );
      await page.waitForTimeout(1500);
      const count = await page.locator(assistantSelector).count();
      if (count !== nAssistant + 1) throw new Error("Nombre de messages assistants inattendu.");
      report.confirmed = i + 1;
      console.log("Réponse réelle confirmée par les états de l'interface : " + report.confirmed + "/3.");
    }
    report.status = "completed";
    // Conversation invitée : l'URL n'est pas assimilée à un chat sauvegardé.
    report.guestChatSaved = false;
  }
} catch (error) {
  report.status = "blocked";
  report.reason = String(error?.message || error).slice(0,480);
  console.error("Sonde interrompue : " + report.reason);
} finally {
  await browser?.close().catch(() => {});
  report.finishedAt = new Date().toISOString();
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/live-guest-probe.json", JSON.stringify(report, null, 2) + "\n");
  console.log("Statut vérifié : " + report.status + ", messages confirmés : " + report.confirmed + "/3.");
}
