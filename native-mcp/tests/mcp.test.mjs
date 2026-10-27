import test from "node:test";
import assert from "node:assert/strict";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMultiPromptServer, validatePrompts } from "../server.mjs";

async function connected() {
  const appServer = createMultiPromptServer();
  const client = new Client({ name: "multi-prompting-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await appServer.connect(serverTransport);
  await client.connect(clientTransport);
  return { appServer, client, async close() { await client.close(); await appServer.close(); } };
}

test("validation : prompts conservés dans l'ordre, aucun ajout implicite", () => {
  const prompts = ["ALPHA", "BRAVO", "Troisième prompt, avec\n plusieurs lignes"];
  assert.deepEqual(validatePrompts(prompts), prompts);
  for (const bad of [[], [""], Array.from({length:51},()=> "x"), [4]]) {
    assert.throws(()=>validatePrompts(bad));
  }
});

test("l'outil MCP open_sequence est réellement exposé et accepte trois messages", async () => {
  const {client, close} = await connected();
  try {
    const listed = await client.listTools();
    const tool = listed.tools.find(t=>t.name==="open_sequence");
    assert.ok(tool, "L'outil doit être exposé dans tools/list");
    assert.equal(tool._meta?.ui?.resourceUri, "ui://multi-prompting/sequence-v2.html");
    const prompts = ["ALPHA","BRAVO","Résume"];
    const r = await client.callTool({ name:"open_sequence", arguments:{prompts} });
    assert.equal(r.isError, undefined);
    assert.deepEqual(r.structuredContent.prompts, prompts);
  } finally { await close(); }
});

test("la ressource MCP UI est accessible et contient la commande native ui/message", async () => {
  const {client, close} = await connected();
  try {
    const r = await client.readResource({uri:"ui://multi-prompting/sequence-v2.html"});
    const data=r.contents?.[0];
    assert.match(data.mimeType, /html/);
    assert.match(data.text, /ui\/message/);
    assert.doesNotMatch(data.text, /run_web_automation/);
  } finally { await close(); }
});
