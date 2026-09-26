import { test } from "node:test";
import assert from "node:assert/strict";
import { allowed, prTitle, timeoutFor, explain } from "../src/actions.mjs";
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

test("an extra private host is accepted over HTTPS only, and nothing else is", () => withServer({ actions: true, extraHosts: ["pc.tailnet.ts.net"] }, async (base) => {
  const http = await import("node:http");
  const req = (headers, method = "GET", p = "/") => new Promise((resolve) => {
    const u = new URL(base);
    const r = http.request({ host: u.hostname, port: u.port, path: p, method, headers }, (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode, body: b })); });
    r.end(method === "POST" ? JSON.stringify({ repo: "r", rowId: "x" }) : undefined);
  });
  const page = await req({ host: "pc.tailnet.ts.net" });
  assert.equal(page.status, 200);
  const token = page.body.match(/name="gp-token" content="(\w+)"/)[1];
  assert.equal((await req({ host: "evil.example" })).status, 403, "unlisted host");
  const post = (origin) => req({ host: "pc.tailnet.ts.net", origin, "x-gp-token": token, "content-type": "application/json" }, "POST", "/api/action");
  assert.equal((await post("http://pc.tailnet.ts.net")).status, 403, "plain http origin");
  assert.equal((await post("https://pc.tailnet.ts.net")).status, 404, "https origin passes the guards");
}));

test("a push can never land on main, whatever the branch tracks", () => {
  for (const c of ["git push origin x:main", "git push origin x:master", "git push origin main", "git push -u origin main", "git push origin x:trunk"]) {
    assert.equal(allowed(c, { main: "trunk" }), null, c);
  }
  assert.deepEqual(allowed("git push origin x:feat/y", { main: "main" }), ["git", "push", "origin", "x:feat/y"]);
});

test("a draft pull request with its title given is allowed, parsed into exact arguments", () => {
  const c = 'gh pr create --draft --head claude/x-1 --title "fix(intake): stop guessing salaries" --body "Opened from Golden Path."';
  assert.deepEqual(allowed(c), ["gh", "pr", "create", "--draft", "--head", "claude/x-1", "--title", "fix(intake): stop guessing salaries", "--body", "Opened from Golden Path."]);
  for (const bad of [
    'gh pr create --draft --head x --title "a $(whoami)" --body "Opened from Golden Path."',
    'gh pr create --draft --head x --title "a `id`" --body "Opened from Golden Path."',
    'gh pr create --draft --head x --title "a" --body "anything else"',
    'gh pr create --head x --title "a" --body "Opened from Golden Path."',
    'gh pr create --draft --head x --title "a" --body "Opened from Golden Path." --base main',
  ]) assert.equal(allowed(bad), null, bad);
});

test("a title is stripped of anything a shell would read", () => {
  assert.equal(prTitle('feat: say "hi" for $5 `now`'), "feat: say hi for 5 now");
  assert.equal(prTitle("  "), null);
  assert.equal(prTitle("fix: C:\\path"), "fix: C:path");
  assert.ok(allowed(`gh pr create --draft --head x --title "${prTitle('a "b" \\ $c')}" --body "Opened from Golden Path."`));
});

test("a push gets long enough for the repo's own checks; other commands don't", () => {
  assert.ok(timeoutFor(["git", "push", "origin", "x"]) >= 10 * 60_000);
  assert.equal(timeoutFor(["gh", "pr", "merge", "1", "--squash"]), 2 * 60_000);
});

test("a failed run says why in plain words, and what to do next", () => {
  assert.match(explain("", { timedOut: true, minutes: 15, command: "git push origin x" }), /Stopped after 15 minutes.*git push origin x/);
  assert.match(explain("could not compute title or body defaults: failed to run git"), /isn’t on this computer/);
  assert.match(explain(" ! [rejected]        x -> x (non-fast-forward)"), /newer commits/);
  assert.match(explain("error: failed to push some refs\nhusky - pre-push hook exited with code 1"), /pre-push hook/);
  assert.match(explain("spawn gh ENOENT"), /couldn’t find git or gh/);
  assert.equal(explain("something nobody has seen"), null);
});

test("a refused push says why in plain words: private email, or which check failed", () => {
  const email = "remote: error: GH007: Your push would publish a private email address.\n ! [remote rejected] x -> x (push declined due to email privacy restrictions)";
  assert.match(explain(email), /private email address/);
  const hook = "✔ fine (1ms)\n✖ failing tests:\n\ntest at scripts\roadshow\build.test.mjs:19:1\n✖ the page renders the fixtures to the committed snapshot (22.0765ms)\nerror: failed to push some refs to 'https://github.com/o/r.git'";
  assert.match(explain(hook), /First failure: the page renders the fixtures to the committed snapshot\./);
});
