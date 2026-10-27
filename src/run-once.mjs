import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { executeSequence } from "./core.mjs";
import { createBrowserAdapter } from "./browser.mjs";

const reportPath = "artifacts/run-report.json";
const fail = (reason) => { throw new Error(reason); };

function parseRequest() {
  let raw;
  let origin;
  if (process.env.INPUT_PROMPTS_JSON?.trim()) {
    origin = "workflow_dispatch";
    raw = JSON.parse(process.env.INPUT_PROMPTS_JSON);
  } else {
    // Le contexte GitHub Actions ne garantit pas les listes head_commit.added.
    // La comparaison Git du commit fait autorité : un fichier de demande par commit.
    const changed = execFileSync("git", [
      "diff", "--name-only", "HEAD^", "HEAD", "--", "requests/"
    ], { encoding: "utf8" });
    const paths = changed.split(/\r?\n/).filter(path =>
      /^requests\/[a-zA-Z0-9_.-]+\.json$/.test(path)
    );
    if (paths.length !== 1) fail("Un commit doit contenir exactement une demande JSON dans requests/.");
    origin = paths[0];
    raw = JSON.parse(awaitRequestFileSync(paths[0]));
  }
  const payload = Array.isArray(raw) ? { prompts: raw } : raw;
  if (!payload || !Array.isArray(payload.prompts) ||
      payload.prompts.length < 1 || payload.prompts.length > 20 ||
      payload.prompts.some(p => typeof p !== "string" || !p.trim() || p.length > 10000)) {
    fail("Demande invalide : de 1 à 20 prompts non vides de 10 000 caractères maximum.");
  }
  if ((payload.mode || "demo") !== "demo") {
    fail("Seul le mode demo, sur une interface locale simulée, est autorisé par ce workflow.");
  }
  return { prompts: payload.prompts, origin };
}
import { readFileSync } from "node:fs";
function awaitRequestFileSync(path) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}
let adapter;
let report = {
  status: "blocked", mode: "demo", completed: 0, total: 0, steps: [],
  runId: process.env.GITHUB_RUN_ID || null,
  timestamp: new Date().toISOString()
};
try {
  const { prompts, origin } = parseRequest();
  report.origin = origin;
  report.total = prompts.length;
  console.log("Séquence demandée : "+prompts.length+" étapes, mode démonstration.");
  adapter = await createBrowserAdapter("demo");
  const result = await executeSequence({
    prompts,
    adapter,
    onProgress: async state => {
      report.status = state.status;
      report.completed = state.completed;
      if (state.status === "sending") console.log("Envoi de l'étape "+state.step);
      if (state.completed > report.steps.length) {
        report.steps.push({ index: state.completed, status: "confirmed" });
        console.log("Réponse simulée confirmée : "+state.completed+"/"+state.total);
      }
    }
  });
  Object.assign(report, result);
  if (result.status !== "completed") throw new Error(result.error || result.status);
  report.audit = await adapter.auditDemo(prompts);
  if (!report.audit.valid) throw new Error("Audit des tours : " + report.audit.reason);
  console.log("Audit terminé : "+report.audit.userMessages+" prompts et "+
    report.audit.assistantMessages+" réponses distinctes.");
} catch (error) {
  report.status = "blocked";
  report.error = String(error?.message || error);
  process.exitCode = 1;
  console.error("Échec : "+report.error);
} finally {
  await adapter?.close().catch(() => {});
  await mkdir("artifacts", { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2)+"\n");
  console.log("Rapport écrit : "+reportPath);
}
