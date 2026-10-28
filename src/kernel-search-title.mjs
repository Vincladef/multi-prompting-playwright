// Deterministic title lookup, opt-in only. Never log a private chat title or URL.
// This module is intentionally independent of new-chat execution.
// Run browser interactions only in an environment authorized to access the target.
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

async function visibleSearchInput(page) {
  // Prefer semantic controls. Do not guess the user's open conversation.
  const choices = [
    page.getByRole("dialog").getByRole("searchbox"),
    page.getByRole("dialog").getByRole("textbox"),
    page.getByRole("searchbox"),
    page.getByPlaceholder(/search chats|search conversations|rechercher des discussions|rechercher dans les discussions/i)
  ];
  for (const choice of choices) {
    const visible = choice.filter({visible:true});
    if (await visible.count() === 1) return visible.first();
  }
  throw new Error("search_input_not_found");
}

async function matchingLinks(page, title) {
  // Search-result anchors only, never sidebar history or arbitrary buttons.
  const dialog = page.getByRole("dialog").filter({visible:true});
  const region = await dialog.count() === 1 ? dialog.first() :
    /^\/search(?:\/|$)/.test(new URL(page.url()).pathname) ? page.locator("main") : null;
  if (!region) throw new Error("search_results_region_missing");
  const anchors = region.locator('a[href*="/c/"]');
  // Only inspect text in search-result link elements, not conversation bodies.
  return await anchors.evaluateAll((links, expected) => {
    const norm = value => (value || "").normalize("NFC").trim();
    const out = [];
    for (const a of links) {
      if (!a.getClientRects().length) continue;
      const titleNodes = [a, ...a.querySelectorAll("*")];
      if (!titleNodes.some(el =>
        el.children.length === 0 && norm(el.textContent) === expected)) continue;
      out.push({title:expected, href:a.href});
    }
    return out;
  }, title);
}

export async function openConversationByTitle(page, providedTitle) {
  const title = validateExactTitle(providedTitle);
  await page.keyboard.press("ControlOrMeta+k");
  const input = await visibleSearchInput(page);
  await input.fill(title);

  // Require stable results, and reject duplicate exact titles.
  let selected = null, stable = 0;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const candidates = await matchingLinks(page, title);
    if (candidates.length) {
      const next = chooseUniqueExactTitle(candidates, title);
      stable = next === selected ? stable + 1 : 1;
      selected = next;
      if (stable >= 5) break;
    } else {
      selected = null;
      stable = 0;
    }
    await page.waitForTimeout(500);
  }
  if (!selected || stable < 5) throw new Error("conversation_title_not_found");

  // Click only an anchor whose href was independently validated.
  const region = await page.getByRole("dialog").filter({visible:true}).count() === 1
    ? page.getByRole("dialog").filter({visible:true}).first()
    : page.locator("main");
  const target = region.locator('a[href*="/c/"]').filter({
    has:page.getByText(title, {exact:true})
  });
  if (await target.count() !== 1) throw new Error("conversation_title_ambiguous");
  const href = await target.first().getAttribute("href");
  if (new URL(href, "https://chatgpt.com").href !== selected)
    throw new Error("conversation_search_changed");
  await target.first().click();
  await page.waitForURL(selected, {timeout:30000});
  if (page.url() !== selected) throw new Error("conversation_search_changed");
  return selected;  // Caller may keep in memory only; never print it.
}
