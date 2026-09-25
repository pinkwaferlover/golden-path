#!/usr/bin/env node
// One-line summary for the terminal, and for the "Needs you" line AI sessions end with.
//   npm run summary            -> "my-app: 3 things need you — start here: Push 2 commits … → http://127.0.0.1:4777/?repo=my-app"
import { loadConfig } from "./server.mjs";
import { collectRepo } from "./src/collect.mjs";
import { recommend, summarise } from "./src/recommend.mjs";

const cfg = await loadConfig();
const port = cfg.port || 4777;
const repos = await Promise.all(cfg.repos.map(async (r) => {
  const s = await collectRepo(r, { fetch: !process.argv.includes("--no-fetch") });
  return { name: s.name, ...recommend(s, { people: cfg.people || {}, bundle: cfg.bundle !== false }) };
}));
let any = false;
for (const s of summarise(repos)) {
  if (!s.needsYou) continue;
  any = true;
  console.log(`${s.name}: ${s.needsYou} ${s.needsYou === 1 ? "thing needs" : "things need"} you${s.best ? ` — start here: ${s.best}` : ""} → http://127.0.0.1:${port}/?repo=${encodeURIComponent(s.name)}`);
}
if (!any) console.log("Nothing waiting. Everything’s in main.");
