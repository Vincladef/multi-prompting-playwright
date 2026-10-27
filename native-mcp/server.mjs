import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
const widgetHtml = readFileSync(join(__dirname, "widget.html"), "utf8");
const URI = "ui://multi-prompting/sequence-v2.html";

export function validatePrompts(prompts) {
  if (!Array.isArray(prompts) || prompts.length < 1 || prompts.length > 50 ||
      prompts.some(x => typeof x !== "string" || !x.trim() || x.length > 12000)) {
    throw new Error("Fournis de 1 à 50 prompts non vides de 12 000 caractères maximum.");
  }
  return prompts;
}

export function createMultiPromptServer() {
  const server = new McpServer({name:"multi-prompting-native",version:"0.2.0"});
  registerAppResource(server,"multi-prompting-widget",URI,{},async()=>({
    contents:[{uri:URI,mimeType:RESOURCE_MIME_TYPE,text:widgetHtml}]
  }));
  registerAppTool(server,"open_sequence",{
    title:"Ouvrir une séquence Multi-Prompting native",
    description:"Prépare dans la conversation ChatGPT actuelle une séquence de vrais messages natifs, sans simulation. Le composant exige une confirmation explicite de la fin de chaque réponse faute de notification hôte de fin de génération.",
    inputSchema:{prompts:z.array(z.string().min(1).max(12000)).min(1).max(50)},
    outputSchema:{prompts:z.array(z.string())},
    _meta:{ui:{resourceUri:URI}}
  },async({prompts})=>{
    try {
      validatePrompts(prompts);
      return {
        content:[{type:"text",text:"Séquence prête. Le panneau permet d'envoyer un tour utilisateur natif à la fois. L'hôte n'expose pas de signal fiable de fin de réponse ; une confirmation est requise pour l'étape suivante."}],
        structuredContent:{prompts}
      };
    }catch(err){
      return {isError:true,content:[{type:"text",text:String(err.message)}]};
    }
  });
  return server;
}

const server=createServer(async(req,res)=>{
  const path = new URL(req.url||"/","http://localhost").pathname;
  if(req.method==="GET"&&path==="/health"){
    res.writeHead(200,{"content-type":"application/json"}).end(JSON.stringify({ok:true,service:"multi-prompting-native",mode:"user-confirmed-native-chat"}));
    return;
  }
  if(req.method==="OPTIONS"&&path==="/mcp"){
    res.writeHead(204,{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST, GET, DELETE, OPTIONS","Access-Control-Allow-Headers":"content-type,mcp-session-id,mcp-protocol-version,authorization,accept","Access-Control-Expose-Headers":"Mcp-Session-Id"}).end();
    return;
  }
  if(path==="/mcp"&&["GET","POST","DELETE"].includes(req.method)){
    res.setHeader("Access-Control-Allow-Origin","*");
    res.setHeader("Access-Control-Expose-Headers","Mcp-Session-Id");
    res.setHeader("Cache-Control","no-store");
    const mcp=createMultiPromptServer();
    const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    res.on("close",()=>{transport.close().catch(()=>{});mcp.close().catch(()=>{});});
    try{await mcp.connect(transport);await transport.handleRequest(req,res);}
    catch(err){console.error("MCP request failed",err.message);if(!res.headersSent)res.writeHead(500).end("MCP error");}
    return;
  }
  res.writeHead(404).end("Not found");
});
const port=Number(process.env.PORT||3000);
if(process.env.NODE_ENV!=="test")server.listen(port,"0.0.0.0",()=>console.log("MCP native listening",port));
