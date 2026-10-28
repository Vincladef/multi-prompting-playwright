import { validateExactTitle } from "./kernel-search-title.mjs";

// Preserve the legacy null / URL return types. A title is represented as
// {title}, so the caller must explicitly resolve it in the authenticated UI.
function raise(code) { throw new Error(code); }
export function resolveTarget(input) {
  const target = input.target || "new";
  const hasUrl = input.target_url !== undefined && input.target_url !== null;
  const hasTitle = input.target_title !== undefined && input.target_title !== null;

  if (target === "new") {
    if (hasUrl || hasTitle) raise("invalid_target");
    return null;
  }
  if (target !== "existing" && target !== "caller") raise("invalid_target");
  if (hasUrl && hasTitle) raise("conflicting_target_identifiers");
  if (!hasUrl && !hasTitle) raise("target_identifier_required");

  if (hasTitle) return {title:validateExactTitle(input.target_title)};
  if (typeof input.target_url !== "string") raise("invalid_target_url");
  let url;
  try { url = new URL(input.target_url); } catch { raise("invalid_target_url"); }
  if (url.protocol !== "https:" || url.hostname !== "chatgpt.com" ||
      url.port || url.username || url.password || url.search || url.hash ||
      !/^\/c\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(url.pathname))
    raise("invalid_target_url");
  return url.origin + url.pathname;
}
