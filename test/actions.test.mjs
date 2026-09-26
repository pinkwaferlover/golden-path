import { test } from "node:test";
import assert from "node:assert/strict";
import { allowed } from "../src/actions.mjs";
import { createServer } from "../server.mjs";

test("every command the app offers to run is allowed, as an argument list", () => {
  for (const c of ["git push origin feat/x", "git push -u origin feat/x", "git push origin wip:feat/x", "gh pr create --draft --fill --head feat/x", "gh pr merge 11 --squash", "gh pr update-branch 12"]) {
    assert.deepEqual(allowed(c), c.split(" "), c);
  }
});

test("look-alikes and anything risky are refused", () => {
  for (const c of [
    "git push --force origin main", "git push -f origin main", "git push origin +main", "git push origin main --force",
    "git branch -D x", "git reset --hard", "gh pr merge 11 --admin --squash", "gh pr merge 11 --squash --delete-branch",
    "git push origin x; rm -rf /", "git push origin $(whoami)", "git push origin -x", "gh pr merge 0 --squash", "", null,
  ]) assert.equal(allowed(c), null, String(c));
});

async function withServer(cfg, fn) {
  const port = 4790 + Math.floor(Math.random() * 100);
  const srv = createServer({ repos: [], ...cfg }, port);
  await new Promise((r) => srv.listen(port, "127.0.0.1", r));
  try { await fn(`http://127.0.0.1:${port}`); } finally { srv.close(); }
}
const post = (base, headers = {}) => fetch(`${base}/api/action`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ repo: "r", rowId: "x" }) });
const tokenOf = async (base) => (await (await fetch(base + "/")).text()).match(/name="gp-token" content="(\w+)"/)[1];

test("with actions off, nothing runs", () => withServer({ actions: false }, async (base) => {
  assert.equal((await post(base, { origin: base })).status, 405);
}));

test("with actions on, only the page itself may ask: right origin and right token", () => withServer({ actions: true }, async (base) => {
  const token = await tokenOf(base);
  assert.equal((await post(base, { origin: base })).status, 403, "no token");
  assert.equal((await post(base, { origin: "http://evil.example", "x-gp-token": token })).status, 403, "foreign origin");
  assert.equal((await post(base, { origin: base, "x-gp-token": "wrong" })).status, 403, "wrong token");
  assert.equal((await post(base, { origin: base, "x-gp-token": token })).status, 404, "passes the guards, then finds no such repo");
}));
