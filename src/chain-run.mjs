import {readFile,mkdir,writeFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {newState,decode,chunk,advance,encode,validateState} from "./chain-state.mjs";
import {executeSequence} from "./core.mjs";
import {createBrowserAdapter} from "./browser.mjs";

const reportPath="artifacts/chain-report.json";
const mode="demo-only";
let report={mode,status:"blocked",runId:process.env.GITHUB_RUN_ID||null,
  step:0,total:0,hop:0,timestamp:new Date().toISOString()};
let adapter;
async function loadState() {
  if(process.env.CHAIN_STATE?.trim()) return decode(process.env.CHAIN_STATE.trim());
  const changed=execFileSync("git",["diff-tree","--no-commit-id","--name-only","-r","HEAD"],{encoding:"utf8"}).trim().split(/\r?\n/);
  const matches=changed.filter(x=>/^requests\/chain-[A-Za-z0-9_.-]+\.json$/.test(x));
  if(matches.length!==1)throw Error("Un commit doit creer une seule demande chain-*.json");
  const request=JSON.parse(await readFile(matches[0],"utf8"));
  if(request.mode!=="demo")throw Error("Workflow limite aux tests de demonstration");
  return newState(request);
}
async function checkpoint(next) {
  await mkdir("artifacts",{recursive:true});
  await writeFile(reportPath,JSON.stringify(report,null,2)+"\n");
}
async function dispatch(state) {
  const token=process.env.GH_TOKEN;
  const repo=process.env.GITHUB_REPOSITORY;
  if(!token||!repo||!/^[-_a-zA-Z0-9.]+\/[-_a-zA-Z0-9.]+$/.test(repo))throw Error("Jeton/repo GitHub indisponible");
  const url="https://api.github.com/repos/"+repo+"/actions/workflows/chain-sequence.yml/dispatches";
  const response=await fetch(url,{method:"POST",headers:{
    "authorization":"Bearer "+token,"accept":"application/vnd.github+json",
    "x-github-api-version":"2022-11-28","content-type":"application/json",
    "user-agent":"multi-prompting-deterministic-chain"},
    body:JSON.stringify({ref:"main",inputs:{state:encode(state)}})});
  if(response.status!==204)throw Error("Relais GitHub refuse : HTTP "+response.status+
    " "+(await response.text()).slice(0,300));
}
try {
  const state=await loadState();
  validateState(state);
  report={...report,id:state.id,step:state.next,total:state.prompts.length,hop:state.hop,status:"running"};
  const prompts=chunk(state);
  if(!prompts.length){
    report.status="completed";
  }else {
    adapter=await createBrowserAdapter("demo");
    const result=await executeSequence({prompts,adapter});
    if(result.status!=="completed"||result.completed!==prompts.length)
      throw Error("Execution non integralement confirmee");
    const audit=await adapter.auditDemo(prompts);
    if(!audit.valid||audit.userMessages!==prompts.length||audit.assistantMessages!==prompts.length)
      throw Error("Audit DOM non conforme");
    // The model/conversation content is never captured; checkpoints are counters and indexes only.
    report={...report,status:"verified",verified:prompts.length,step:state.next+prompts.length,
      audit:{valid:true,users:audit.userMessages,assistants:audit.assistantMessages}};
    const next=advance(state,prompts.length);
    if(next.next===next.prompts.length){
      report.status="completed";
    }else {
      // Abort instead of emitting a duplicate if a dispatch error or ambiguous acknowledgement arises.
      if(next.hop>=next.maxHops)throw Error("Limite de relais atteinte, aucun nouveau job lance");
      report.status="handoff_pending";report.nextHop=next.hop;
      await checkpoint(next);
      await dispatch(next);
      report.status="handoff_dispatched";
    }
  }
} catch(e){
  report.status="blocked";report.error=String(e?.message||e);
  console.error(report.error);process.exitCode=1;
} finally {
  await adapter?.close().catch(()=>{});
  await checkpoint();
  console.log(JSON.stringify(report));
}
