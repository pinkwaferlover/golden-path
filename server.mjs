#!/usr/bin/env node
// Golden Path: a local page showing what git work is waiting, and what to do next.
// Listens on this computer only. By default it is read-only: buttons copy the command
// for you to run. With "actions": true in the settings, a button can run its own
// command after you confirm, but only commands on the allowlist in src/actions.mjs.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { collectRepo } from "./src/collect.mjs";
import { recommend } from "./src/recommend.mjs";
import { allowed, timeoutFor, explain } from "./src/actions.mjs";
import { renderScene, renderVignette } from "./src/scene/scene.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export async function loadConfig() {
  const candidates = [process.env.GOLDEN_PATH_CONFIG, path.join(here, "golden-path.config.json"), path.join(os.homedir(), ".golden-path.json")].filter(Boolean);
  for (const p of candidates) if (existsSync(p)) return { ...JSON.parse(await readFile(p, "utf8")), _from: p };
  return { repos: [{ path: process.cwd() }], people: {}, bundle: true, _from: null };
}

let cache = { at: 0, data: null, pending: null };
export async function gather(cfg, { refresh = false } = {}) {
  if (!refresh && cache.data && Date.now() - cache.at < 30_000) return cache.data;
  if (cache.pending) return cache.pending;
  cache.pending = (async () => {
    const repos = await Promise.all(cfg.repos.map(async (r) => {
      try {
        const s = await collectRepo(r, { fetch: true });
        return { ...s, liveUrl: r.liveUrl || null };
      } catch (e) {
        return { name: r.name || path.basename(r.path), path: r.path, errors: [String(e.message || e)] };
      }
    }));
    cache = { at: Date.now(), data: { repos, checkedAt: new Date().toISOString() }, pending: null };
    return cache.data;
  })();
  return cache.pending;
}

function view(data, cfg, { bundle, dismissed }) {
  return {
    checkedAt: data.checkedAt,
    configFrom: cfg._from,
    bundle,
    repos: data.repos.map((s) => {
      const { rows, tidy } = s.errors && s.errors.includes("Not a git repository") ? { rows: [], tidy: [] } : recommend(s, { people: cfg.people || {}, bundle, dismissed });
      return {
        name: s.name, path: s.path, main: s.main, github: s.github, errors: s.errors || [], hasRemote: s.hasRemote,
        liveUrl: s.liveUrl, production: s.production || null, hasDeploys: !!(s.deployments && s.deployments.length),
        rows, tidy,
      };
    }),
  };
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };

const run = (argv, cwd, command) => new Promise((resolve) => {
  const timeout = timeoutFor(argv);
  execFile(argv[0], argv.slice(1), { cwd, timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
    const output = `${stdout || ""}${stderr || ""}`.trim() || (err ? String(err.message) : "Done.");
    if (!err) return resolve({ ok: true, output });
    const why = explain(`${output}\n${err.code || ""}`, { timedOut: !!err.killed, minutes: timeout / 60_000, command });
    resolve({ ok: false, output, why });
  });
});

async function readJson(req, limit = 4096) {
  let body = "";
  for await (const chunk of req) { body += chunk; if (body.length > limit) throw Object.assign(new Error("Too large"), { code: 413 }); }
  return JSON.parse(body || "{}");
}

// Runs the command of one row, rebuilt from fresh state. The page never sends a command.
async function action(cfg, { repo: name, rowId }, busy, jobs) {
  const repoCfg = cfg.repos.find((r) => (r.name || path.basename(r.path)) === name);
  if (!repoCfg) return { code: 404, body: { ok: false, output: "No such repo." } };
  if (busy.has(name)) return { code: 409, body: { ok: false, output: "Something is already running in this repo." } };
  busy.add(name);
  let started = false;
  try {
    const data = await gather(cfg, { refresh: true });
    const state = view(data, cfg, { bundle: cfg.bundle !== false, dismissed: [] }).repos.find((r) => r.name === name);
    const row = state && state.rows.find((r) => r.id === rowId);
    if (!row) return { code: 409, body: { ok: false, output: "That item has changed since the page loaded. Refresh and look again." } };
    const argv = row.action && row.action.kind === "copy" ? allowed(row.action.command, { main: state.main }) : null;
    if (!argv) return { code: 403, body: { ok: false, output: "Golden Path doesn’t run this one. Copy the command instead." } };
    // Push from the branch's own folder when it has one, so the repo's pre-push checks
    // test the code being pushed, not whatever the main folder has checked out.
    const src = argv[1] === "push" ? argv[argv.length - 1].split(":")[0] : null;
    const collected = data.repos.find((r) => r.name === name) || {};
    const wt = src && (collected.worktreeByBranch || {})[src];
    // Start it and answer at once: a push's checks can take minutes, longer than a phone
    // or a proxy will hold one request open. The page asks after the job until it's done.
    const id = randomBytes(8).toString("hex");
    const job = { command: row.action.command, started: Date.now(), done: false };
    jobs.set(id, job);
    run(argv, wt && existsSync(wt.path) ? wt.path : repoCfg.path, row.action.command).then((result) => {
      Object.assign(job, result, { done: true });
      cache.at = 0; // the next read sees what git says now
      busy.delete(name);
      setTimeout(() => jobs.delete(id), 60 * 60_000).unref();
    });
    started = true;
    return { code: 202, body: { job: id, command: row.action.command } };
  } finally {
    if (!started) busy.delete(name);
  }
}

export function createServer(cfg, port) {
  // This computer, plus any private names you list (e.g. a Tailscale address served
  // over HTTPS by `tailscale serve`). Each host's page may only call its own origin.
  const origins = new Map([[`127.0.0.1:${port}`, "http"], [`localhost:${port}`, "http"], ...(cfg.extraHosts || []).map((h) => [h, "https"])]);
  const allowedHosts = new Set(origins.keys());
  const token = randomBytes(16).toString("hex");
  const busy = new Set();
  const jobs = new Map();
  return http.createServer(async (req, res) => {
    // Refuse requests addressed to any other host name (guards against DNS rebinding).
    if (!allowedHosts.has(req.headers.host)) { res.writeHead(403); res.end("Forbidden"); return; }
    const u = new URL(req.url, `http://${req.headers.host}`);
    const send = (code, type, body) => { res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" }); res.end(body); };
    try {
      if (req.method === "POST" && u.pathname === "/api/action") {
        if (!cfg.actions) return send(405, "text/plain", "Actions are off. Set \"actions\": true in golden-path.config.json to turn them on.");
        // Only this page may ask: same origin, and the token it was served with.
        if (req.headers.origin !== `${origins.get(req.headers.host)}://${req.headers.host}` || req.headers["x-gp-token"] !== token) return send(403, "text/plain", "Forbidden");
        const r = await action(cfg, await readJson(req), busy, jobs);
        return send(r.code, "application/json", JSON.stringify(r.body));
      }
      if (req.method === "GET" && u.pathname === "/api/job") {
        if (!cfg.actions || req.headers["x-gp-token"] !== token) return send(403, "text/plain", "Forbidden");
        const job = jobs.get(u.searchParams.get("id") || "");
        if (!job) return send(404, "application/json", JSON.stringify({ done: true, ok: false, output: "Golden Path no longer has this run (it restarted, or it finished over an hour ago). Refresh to see what git says now." }));
        return send(200, "application/json", JSON.stringify({ ...job, seconds: Math.round((Date.now() - job.started) / 1000) }));
      }
      if (req.method !== "GET") return send(405, "text/plain", "Method not allowed");
      if (u.pathname === "/api/state") {
        const data = await gather(cfg, { refresh: u.searchParams.get("refresh") === "1" });
        const bundle = u.searchParams.has("bundle") ? u.searchParams.get("bundle") !== "off" : cfg.bundle !== false;
        const dismissed = (u.searchParams.get("dismissed") || "").split(",").filter(Boolean);
        return send(200, "application/json", JSON.stringify(view(data, cfg, { bundle, dismissed })));
      }
      if (u.pathname === "/api/scene") {
        const s = renderScene({ scene: u.searchParams.get("scene") || null, id: "s" });
        return send(200, "application/json", JSON.stringify(s));
      }
      if (u.pathname === "/api/vignette") return send(200, "image/svg+xml", renderVignette());
      const file = u.pathname === "/" ? "index.html" : u.pathname === "/compare" ? "compare.html" : u.pathname.slice(1);
      if (!/^[\w.-]+$/.test(file)) return send(404, "text/plain", "Not found");
      const full = path.join(here, "public", file);
      if (!existsSync(full)) return send(404, "text/plain", "Not found");
      if (file === "index.html") {
        const meta = `<meta name="gp-token" content="${token}"><meta name="gp-actions" content="${cfg.actions ? "on" : "off"}">`;
        return send(200, TYPES[".html"], (await readFile(full, "utf8")).replace("</head>", `${meta}
</head>`));
      }
      return send(200, TYPES[path.extname(full)] || "application/octet-stream", await readFile(full));
    } catch (e) {
      return send(e && e.code === 413 ? 413 : e instanceof SyntaxError ? 400 : 500, "text/plain", String(e && e.stack || e));
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cfg = await loadConfig();
  const port = Number(process.env.PORT || cfg.port || 4777);
  createServer(cfg, port).listen(port, "127.0.0.1", () => {
    console.log(`Golden Path is running: http://127.0.0.1:${port}`);
    console.log(cfg._from ? `Settings: ${cfg._from}` : "No settings file found — showing the current folder. Copy golden-path.config.example.json to golden-path.config.json to add your repos.");
  });
}
