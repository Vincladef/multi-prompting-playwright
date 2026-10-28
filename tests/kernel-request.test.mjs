import test from "node:test";
import assert from "node:assert/strict";
import { MAX_REQUEST_BYTES, validateSequenceRequest } from "../src/kernel-request.mjs";

const request = prompts => ({mode:"live",target:"new",prompts});

test("accepts a numbered sequence of more than twenty prompts", () => {
  const prompts=Array.from({length:75},(_,i)=>"Prompt " + (i+1));
  assert.equal(validateSequenceRequest(request(prompts)),75);
});

test("accepts a single prompt and a larger short-prompt sequence", () => {
  assert.equal(validateSequenceRequest(request(["Bonjour"])),1);
  assert.equal(validateSequenceRequest(request(Array.from({length:300},()=> "Continue"))),300);
});

test("rejects empty or malformed prompts", () => {
  for(const prompts of [[],[" "],["ok", 3],["x".repeat(10001)]]) {
    assert.throws(()=>validateSequenceRequest(request(prompts)),/invalid_request/);
  }
  assert.throws(()=>validateSequenceRequest({mode:"draft",target:"new",prompts:["ok"]}),/invalid_request/);
});

test("rejects oversized encrypted-request payloads without exposing content", () => {
  const prompts=Array.from({length:50},()=> "x".repeat(9000));
  assert.ok(Buffer.byteLength(JSON.stringify(request(prompts)), "utf8")>MAX_REQUEST_BYTES);
  assert.throws(()=>validateSequenceRequest(request(prompts)),/request_too_large/);
});
