import http from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { executeSequence } from "./core.mjs";
import { createBrowserAdapter } from "./browser.mjs";

const token = process.env.SERVICE_TOKEN || "";
const jobs = new Map();
const queue = [];
let processing = false;

const send = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};
const authorize = (req) => {
  if (token.length < 24) return false;
  const supplied = (req.headers.authorization || "").replace(/^Bearer /i, "");
  const a = Buffer.from(supplied);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
};
const expose = (job) => ({
  id: job.id, mode: job.mode, status: job.status,
  total: job.prompts.length, completed: job.completed,
  step: job.step, error: job.error, url: job.url
});

async function processQueue() {
  if (processing) return;
  processing = true;
  try {
    while (queue.length) {
      const job = queue.shift();
      if (job.controller.signal.aborted) { job.status = "cancelled"; continue; }
      let adapter;
      try {
        adapter = await createBrowserAdapter(job.mode);
        await executeSequence({
          prompts: job.prompts, adapter, signal: job.controller.signal,
          onProgress: async (state) => Object.assign(job, state)
        });
      } catch (error) {
        job.status = "blocked";
        job.error = String(error?.message || error);
      } finally {
        if (adapter) await adapter.close().catch(() => {});
      }
    }
  } finally {
    processing = false;
  }
}

async function readJSON(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 200000) throw new Error("Payload too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  if (req.method === "GET" && path === "/health") {
    return send(res, 200, { ok: true, mode: "prototype", version: "0.1.0" });
  }
  if (!authorize(req)) return send(res, 401, { error: "Unauthorized" });
  if (req.method === "POST" && path === "/jobs") {
    try {
      const data = await readJSON(req);
      const prompts = data.prompts;
      const mode = data.mode || "demo";
      if (!Array.isArray(prompts) || prompts.length < 1 || prompts.length > 20 ||
        prompts.some((s) => typeof s !== "string" || s.trim().length === 0 || s.length > 10000)) {
        return send(res, 400, { error: "1-20 nonempty prompts, max 10000 characters each" });
      }
      if (mode !== "demo" && !(mode === "chatgpt" && process.env.ALLOW_LIVE_CHATGPT === "true")) {
        return send(res, 403, { error: "Mode disabled" });
      }
      const job = { id: randomUUID(), mode, prompts, status: "queued", completed: 0, controller: new AbortController() };
      jobs.set(job.id, job);
      queue.push(job);
      setImmediate(() => processQueue().catch(console.error));
      return send(res, 202, expose(job));
    } catch (error) {
      return send(res, 400, { error: String(error?.message || error) });
    }
  }
  const match = path.match(/^\/jobs\/([a-f0-9-]+)(\/cancel)?$/);
  if (match && jobs.has(match[1])) {
    const job = jobs.get(match[1]);
    if (req.method === "GET" && !match[2]) return send(res, 200, expose(job));
    if (req.method === "POST" && match[2]) {
      job.controller.abort();
      if (job.status === "queued") job.status = "cancelled";
      return send(res, 200, expose(job));
    }
  }
  return send(res, 404, { error: "Not found" });
});
server.listen(Number(process.env.PORT || 3000), "0.0.0.0", () => {
  console.log("Multi-Prompting prototype listening");
});
