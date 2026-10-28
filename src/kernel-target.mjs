// A destination is an exact ChatGPT conversation URL, never a guessed chat title.
function raise(code) { throw new Error(code); }
export function resolveTarget(input) {
  const target = input.target || "new";
  if (target === "new") {
    if (input.target_url) raise("invalid_target");
    return null;
  }
  if (target !== "existing" && target !== "caller") raise("invalid_target");
  if (typeof input.target_url !== "string") raise("target_url_required");
  let url;
  try { url = new URL(input.target_url); } catch { raise("invalid_target_url"); }
  if (url.protocol !== "https:" || url.hostname !== "chatgpt.com" ||
      url.port || url.username || url.password || url.search || url.hash ||
      !/^\/c\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(url.pathname))
    raise("invalid_target_url");
  return url.origin + url.pathname;
}

