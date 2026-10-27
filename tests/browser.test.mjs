import test from "node:test";
import assert from "node:assert/strict";
import { createBrowserAdapter } from "../src/browser.mjs";
import { executeSequence } from "../src/core.mjs";

test("Chromium sends three separate turns in the local demo", { timeout: 30000 }, async () => {
  const adapter = await createBrowserAdapter("demo");
  try {
    const result = await executeSequence({
      prompts: ["ALPHA", "BRAVO", "CHARLIE"],
      adapter
    });
    assert.equal(result.status, "completed", result.error);
    assert.equal(result.completed, 3);
    assert.equal(result.url, "demo://local-fixture");
  } finally {
    await adapter.close();
  }
});
