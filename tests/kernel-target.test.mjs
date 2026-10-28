import test from "node:test";
import assert from "node:assert/strict";
import { resolveTarget } from "../src/kernel-target.mjs";

const caller = "https://chatgpt.com/c/6ae1d4b1-5d14-83eb-b7ee-b9b6abdd4d15";
test("New threads remain available", () => {
  assert.equal(resolveTarget({target:"new"}), null);
  assert.equal(resolveTarget({}), null);
});
test("Existing conversation and caller use exact URL", () => {
  assert.equal(resolveTarget({target:"existing",target_url:caller}), caller);
  assert.equal(resolveTarget({target:"caller",target_url:caller}), caller);
});
test("Never guess caller URL or accept a lookalike URL", () => {
  for (const input of [
    {target:"caller"}, {target:"existing"},
    {target:"new",target_url:caller},
    {target:"existing",target_url:"https://chatgpt.com.evil.com/c/6ae1d4b1-5d14-83eb-b7ee-b9b6abdd4d15"},
    {target:"existing",target_url:"https://chatgpt.com/c/6ae1d4b1-5d14-83eb-b7ee-b9b6abdd4d15?x=1"},
    {target:"existing",target_url:"https://chatgpt.com/share/6ae1d4b1-5d14-83eb-b7ee-b9b6abdd4d15"},
    {target:"some-other-target",target_url:caller}
  ]) assert.throws(() => resolveTarget(input));
});

test("Title targeting is supported without a URL and never auto-guessed", () => {
  assert.deepEqual(resolveTarget({target:"caller",target_title:"  Ma conversation  "}), {title:"Ma conversation"});
  assert.deepEqual(resolveTarget({target:"existing",target_title:"Étude ergonomique"}), {title:"Étude ergonomique"});
  assert.throws(()=>resolveTarget({target:"caller",target_title:""}), /invalid_target_title/);
  assert.throws(()=>resolveTarget({target:"caller",target_title:"A\\nB"}), /invalid_target_title/);
  assert.throws(()=>resolveTarget({target:"caller",target_url:caller,target_title:"Mon fil"}), /conflicting_target_identifiers/);
  assert.throws(()=>resolveTarget({target:"new",target_title:"Mon fil"}), /invalid_target/);
});
