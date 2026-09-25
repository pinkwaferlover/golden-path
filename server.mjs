#!/usr/bin/env node
// Golden Path: a local page showing what git work is waiting, and what to do next.
// Listens on this computer only. Phase 1 is read-only: it never runs a git command
// that changes anything; buttons copy the command for you to run.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { collectRepo } from "./src/collect.mjs";
import { recommend } from "./src/recommend.mjs";
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

export function createServer(cfg, port) {
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  return http.createServer(async (req, res) => {
    // Refuse requests addressed to any other host name (guards against DNS rebinding).
    if (!allowedHosts.has(req.headers.host)) { res.writeHead(403); res.end("Forbidden"); return; }
    const u = new URL(req.url, `http://${req.headers.host}`);
    const send = (code, type, body) => { res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" }); res.end(body); };
    try {
      if (req.method !== "GET") return send(405, "text/plain", "Golden Path is read-only in this version.");
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
      return send(200, TYPES[path.extname(full)] || "application/octet-stream", await readFile(full));
    } catch (e) {
      return send(500, "text/plain", String(e && e.stack || e));
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
