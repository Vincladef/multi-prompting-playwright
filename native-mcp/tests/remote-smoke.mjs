import assert from "node:assert/strict";
const base="https://multi-prompting-native-mcp.onrender.com";
const stop=new AbortController();
const timeout=setTimeout(()=>stop.abort("timeout"),90000);
async function req(method,params={}) {
  const id=Date.now()+Math.floor(Math.random()*999);
  const r=await fetch(base+"/mcp",{method:"POST",signal:stop.signal,headers:{"content-type":"application/json","accept":"application/json, text/event-stream","mcp-protocol-version":"2025-06-18"},body:JSON.stringify({jsonrpc:"2.0",id,method,params})});
  const body=await r.text();
  if(!r.ok)throw Error(method+": HTTP "+r.status+" "+body.slice(0,300));
  const events=(r.headers.get("content-type")||"").includes("text/event-stream")?
    body.split(/\r?\n/).filter(s=>s.startsWith("data: ")).map(s=>JSON.parse(s.slice(6))):[JSON.parse(body)];
  const item=events.find(x=>x.id===id);
  if(!item)throw Error(method+" missing reply "+body.slice(0,250));
  if(item.error)throw Error(method+" RPC error "+JSON.stringify(item.error));
  return item.result;
}
try {
  const h=await fetch(base+"/health",{signal:stop.signal});
  assert.equal(h.status,200); assert.equal((await h.json()).ok,true);
  console.log("Health OK");
  const init=await req("initialize",{protocolVersion:"2025-06-18",capabilities:{},clientInfo:{name:"github-mcp-smoke",version:"1.0"}});
  assert.ok(init.serverInfo?.name);console.log("Initialize OK",init.serverInfo.name);
  const list=await req("tools/list");
  assert.ok(list.tools?.some(x=>x.name==="open_sequence"));console.log("Tool discovery OK");
  const call=await req("tools/call",{name:"open_sequence",arguments:{prompts:["ALPHA","BRAVO"]}});
  assert.deepEqual(call.structuredContent?.prompts,["ALPHA","BRAVO"]);
  console.log("Tool invocation OK (prepares native widget; does not send chat messages)");
  const resources=await req("resources/list");
  console.log("Resource discovery",resources.resources?.map(x=>x.uri));
  const uri=resources.resources?.find(x=>x.uri?.startsWith("ui://multi-prompting/sequence"))?.uri;
  assert.ok(uri,"sequence UI missing");
  const read=await req("resources/read",{uri});
  const html=read.contents?.find(x=>x.uri===uri)?.text||"";
  assert.match(html,/<html/i);
  assert.match(html,/sendFollowUpMessage|ui\/message/);
  console.log("Widget HTML resource read OK",html.length,"characters");
  console.log("MCP SMOKE PASS; ChatGPT-host dispatch not assessed");
}catch(e){console.error("MCP SMOKE FAILED:",String(e.stack||e));process.exitCode=1;}finally{clearTimeout(timeout);}
