// Validate the encrypted request *before* acquiring the remote Kernel session.
// There is intentionally no fixed prompt-count ceiling: the actual execution
// horizon is bounded by Kernel / GitHub Actions timeouts and request size.
export const MAX_REQUEST_BYTES = 250_000;
export const MAX_PROMPT_CHARS = 10_000;

export function validateSequenceRequest(input) {
  if (!input || input.mode !== "live" ||
      !Array.isArray(input.prompts) || input.prompts.length === 0 ||
      !input.prompts.every(prompt => typeof prompt === "string" &&
        !!prompt.trim() && prompt.length <= MAX_PROMPT_CHARS))
    throw new Error("invalid_request");
  if (Buffer.byteLength(JSON.stringify(input), "utf8") > MAX_REQUEST_BYTES)
    throw new Error("request_too_large");
  return input.prompts.length;
}
