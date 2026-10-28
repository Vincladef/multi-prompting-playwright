// Deterministic title lookup in the already-authenticated ChatGPT UI.
// This module inspects search-result titles and hrefs only, never chat messages.
const CHAT_PATH = /^\/c\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateExactTitle(title) {
  if (typeof title !== "string" || !title.trim() ||
      title.length > 200 || /[\r\n\x00-\x1f]/.test(title))
    throw new Error("invalid_target_title");
  return title.normalize("NFC").trim();
}

export function chooseUniqueExactTitle(results, title) {
  const expected = validateExactTitle(title);
  const exact = new Set();
  for (const result of results) {
    if (typeof result.title !== "string" || typeof result.href !== "string") continue;
    if (result.title.normalize("NFC").trim() !== expected) continue;
    let url;
    try { url = new URL(result.href, "https://chatgpt.com"); } catch { continue; }
    if (url.origin !== "https://chatgpt.com" ||
        url.search || url.hash || !CHAT_PATH.test(url.pathname)) continue;
    exact.add(url.origin + url.pathname);
  }
  if (exact.size === 0) throw new Error("conversation_title_not_found");
  if (exact.size !== 1) throw new Error("conversation_title_ambiguous");
  return [...exact][0];
}

async function visibleSearchInput(page, timeoutMs) {
  const choices = [
    page.getByRole("dialog").getByRole("searchbox"),
    page.getByRole("dialog").getByRole("textbox"),
    page.getByRole("searchbox"),
    page.getByPlaceholder(/search chats|search conversations|rechercher des discussions|rechercher dans les discussions/i)
  ];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const choice of choices) {
      if (await choice.filter({visible:true}).count() === 1)
        return choice.filter({visible:true}).first();
    }
    await page.waitForTimeout(200);
  }
  throw new Error("search_input_not_found");
}

function resultRegion(page) {
  const dialog = page.getByRole("dialog").filter({visible:true});
  return { dialog, main:page.locator("main") };
}
async function matchingLinks(page, title) {
  const {dialog, main} = resultRegion(page);
  const region = await dialog.count() === 1 ? dialog.first() :
    /^\/search(?:\/|$)/.test(new URL(page.url()).pathname) ? main : null;
  if (!region) throw new Error("search_results_region_missing");
  const anchors = region.locator('a[href*="/c/"]');
  return anchors.evaluateAll((links, expected) => {
    const norm = value => (value || "").normalize("NFC").trim();
    const out = [];
    for (const a of links) {
      if (!a.getClientRects().length) continue;
      // Only exact leaf-node titles, never snippets or arbitrary chat content.
      const nodes = [a, ...a.querySelectorAll("*")];
      if (!nodes.some(el => el.children.length === 0 && norm(el.textContent) === expected))
        continue;
      out.push({title:expected, href:a.href});
    }
    return out;
  }, title);
}

export async function openConversationByTitle(page, providedTitle, options = {}) {
  const title = validateExactTitle(providedTitle);
  const timeoutMs = options.timeoutMs ?? 30000;
  const stableSamples = options.stableSamples ?? 5;
  await page.keyboard.press("ControlOrMeta+k");
  let input;
  try { input = await visibleSearchInput(page, Math.min(timeoutMs, 6000)); }
  catch (error) {
    // Some ChatGPT layouts expose a search button instead of the shortcut.
    const button = page.getByRole("button", {name:/search chats|search conversations|rechercher des discussions|rechercher/i}).filter({visible:true});
    if (await button.count() !== 1) throw error;
    await button.click();
    input = await visibleSearchInput(page, Math.min(timeoutMs, 6000));
  }
  await input.fill(title);

  let selected = null, stable = 0;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const candidates = await matchingLinks(page, title);
    if (candidates.length) {
      // Duplicates are errors, never select the first search hit.
      const next = chooseUniqueExactTitle(candidates, title);
      stable = next === selected ? stable + 1 : 1;
      selected = next;
      if (stable >= stableSamples) break;
    } else {
      selected = null; stable = 0;
    }
    await page.waitForTimeout(400);
  }
  if (!selected || stable < stableSamples) throw new Error("conversation_title_not_found");

  // Re-evaluate immediately before clicking to close the selection race.
  if (chooseUniqueExactTitle(await matchingLinks(page, title), title) !== selected)
    throw new Error("conversation_search_changed");
  const dialog = page.getByRole("dialog").filter({visible:true});
  const region = await dialog.count() === 1 ? dialog.first() : page.locator("main");
  const path = new URL(selected).pathname;
  const matchingAnchor = region.locator('a[href="/c/' + path.slice(3) + '"], a[href="' + selected + '"]');
  if (await matchingAnchor.count() !== 1) throw new Error("conversation_title_ambiguous");
  await matchingAnchor.click();
  await page.waitForURL(selected, {timeout:30000});
  if (page.url() !== selected) throw new Error("conversation_search_changed");
  return selected; // Keep the private URL in memory, not in logs/artifacts.
}
