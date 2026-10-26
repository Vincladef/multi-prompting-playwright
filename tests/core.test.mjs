import test from "node:test";
import assert from "node:assert/strict";
import { executeSequence } from "../src/core.mjs";

test("les prompts sont envoyés un par un, dans l'ordre", async () => {
  const calls = [];
  const states = [];
  const adapter = {
    async sendAndWait(prompt) { calls.push(prompt); },
    async url() { return "demo://test"; }
  };
  const result = await executeSequence({
    prompts: ["ALPHA", "BRAVO", "CHARLIE"],
    adapter, onProgress: async (state) => states.push(state)
  });
  assert.deepEqual(calls, ["ALPHA", "BRAVO", "CHARLIE"]);
  assert.equal(result.status, "completed");
  assert.equal(result.completed, 3);
  assert.equal(states.at(-1).url, "demo://test");
});

test("un échec bloque la suite sans doublon", async () => {
  const calls = [];
  const adapter = {
    async sendAndWait(prompt) {
      calls.push(prompt);
      if (prompt === "BRAVO") throw new Error("Réponse non confirmée");
    }
  };
  const result = await executeSequence({ prompts: ["ALPHA", "BRAVO", "CHARLIE"], adapter });
  assert.deepEqual(calls, ["ALPHA", "BRAVO"]);
  assert.equal(result.status, "blocked");
  assert.equal(result.completed, 1);
  assert.match(result.error, /non confirmée/);
});

test("une annulation stoppe les étapes suivantes", async () => {
  const controller = new AbortController();
  const calls = [];
  const adapter = {
    async sendAndWait(prompt) {
      calls.push(prompt);
      controller.abort();
    }
  };
  const result = await executeSequence({ prompts: ["ALPHA", "BRAVO"], adapter, signal: controller.signal });
  assert.deepEqual(calls, ["ALPHA"]);
  assert.equal(result.status, "cancelled");
});
