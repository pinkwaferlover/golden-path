// Fixtures are made-up names and numbers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { recommend, headline, stuckPrompt } from "../src/recommend.mjs";
import { clashes, clashText } from "../src/clash.mjs";

const NOW = Date.parse("2026-09-25T22:30:00Z");
const recent = "2026-09-25T20:00:00Z";
const ok = [{ name: "check:ci", conclusion: "SUCCESS" }];
const branch = (name, extra = {}) => ({ name, remote: true, remoteSha: name + "-sha", remoteDate: recent, date: recent, tip: `origin/${name}`, ahead: 1, behind: 0, subject: `feat: ${name}`, subjects: [`feat: ${name}`], parents: [], files: [], who: { commits: 1, authors: { "Sam Example": 1 }, tools: {}, models: {}, tasks: {}, coauthors: {}, unrecorded: 1 }, ...extra });
const pr = (number, head, extra = {}) => ({ number, title: `PR ${number}`, headRefName: head, isDraft: false, mergeable: "MERGEABLE", statusCheckRollup: ok, author: { login: "sam-example" }, url: `https://github.com/o/r/pull/${number}`, headRefOid: head + "-sha", ...extra });
const base = (over = {}) => ({ name: "repo", main: "main", mainRef: "origin/main", hasRemote: true, github: { owner: "o", repo: "r" }, worktrees: [], branches: [], prs: [], merged: [], deployments: [{ sha: "x", state: "success" }], previews: {}, ...over });
const run = (s) => recommend(s, { now: NOW });

test("also-reasonable rows run closest to live first", () => {
  const { rows } = run(base({
    branches: [branch("merge-a"), branch("merge-b"), branch("behind", { behind: 3 }), branch("no-pr"), branch("no-pr-2"), branch("draft"), branch("clash")],
    prs: [pr(1, "merge-a"), pr(2, "merge-b"), pr(3, "behind"), pr(4, "draft", { isDraft: true }), pr(5, "clash", { mergeable: "CONFLICTING" })],
    worktrees: [{ path: "/w/one", changed: 2, unstaged: 2, files: ["a"], touched: NOW }],
  }));
  const also = rows.filter((r) => r.group === "also").map((r) => r.title || r.kind);
  const at = (t) => also.indexOf(t);
  assert.ok(at("PR 3") < at("PR 5"), "update from main before stuck");
  assert.ok(at("PR 1") < at("PR 3") || at("PR 2") < at("PR 3"), "ready to merge first");
  assert.ok(at("PR 5") < also.findIndex((t) => /^No-pr/.test(t)), "stuck before opening a PR");
  assert.ok(at("PR 4") < also.findIndex((t) => /changed file/.test(t)), "drafts before folders");
});

test("a conflict and a failed check are stuck; the green step never is", () => {
  const { rows } = run(base({ branches: [branch("c"), branch("f"), branch("ok")], prs: [pr(7, "c", { mergeable: "CONFLICTING" }), pr(8, "f", { statusCheckRollup: [{ name: "check:ci", conclusion: "FAILURE" }] }), pr(9, "ok")] }));
  assert.deepEqual(rows.filter((r) => r.stuck).map((r) => r.prNumber).sort(), [7, 8]);
  assert.equal(rows.find((r) => r.best).prNumber, undefined);
  assert.equal(rows.find((r) => r.best).title, "PR 9");
});

test("the stuck prompt puts work others are built on first, and includes the clashing lines", () => {
  const { rows } = run(base({
    branches: [branch("late"), branch("root"), branch("kid", { ahead: 2, parents: ["root"] })],
    prs: [pr(3, "late", { mergeable: "CONFLICTING" }), pr(10, "root", { mergeable: "CONFLICTING" })],
  }));
  const p = stuckPrompt(rows, (r) => (r.prNumber === 10 ? "- a.js: main has x" : ""), { path: "/code/r" });
  assert.ok(p.indexOf("#10") < p.indexOf("#3"), "#10 has a branch built on it, so it goes first");
  assert.match(p, /1 other branch built on it/);
  assert.match(p, /a\.js: main has x/);
  assert.match(p, /ask me before choosing/);
  assert.equal(stuckPrompt([]), null);
});

test("the headline states facts, and says all clear when nothing waits", () => {
  const live = { group: "done", live: "live" };
  assert.deepEqual(headline([live, live, { stuck: "conflict", group: "also", colour: "blue" }, { greenable: "merge", group: "next", colour: "green" }]), { first: "2 went live today.", second: "1 is stuck and 1 is ready to merge." });
  assert.deepEqual(headline([{ group: "also", colour: "blue" }]), { first: "Nothing new today.", second: "1 waiting." });
  assert.deepEqual(headline([]), { first: "All clear.", second: "" });
});

test("may clash lists other open work touching the same files, but not work it is built on", () => {
  const { rows } = run(base({ branches: [branch("a", { files: ["x.js", "y.js"] }), branch("b", { files: ["y.js"] }), branch("c", { files: ["x.js"], ahead: 2, parents: ["a"] })] }));
  const a = rows.find((r) => r.branchName === "a");
  assert.deepEqual(a.details.mayClash, [{ name: "b", files: ["y.js"] }]);
  assert.deepEqual(a.details.builtOnIt, ["c"]);
});

test("clashes keep only the clashing lines, main beside the branch, with context and main's line number", () => {
  const text = ["one", "two", "<<<<<<< origin/main", "rate = 0.2", "=======", "rate = taxRate()", ">>>>>>> origin/fix", "three", "<<<<<<< origin/main", "=======", "extra()", ">>>>>>> origin/fix", "four"].join("\n");
  const cs = clashes(text, { context: 1 });
  assert.equal(cs.length, 2);
  assert.deepEqual(cs[0], { line: 3, before: ["two"], main: ["rate = 0.2"], branch: ["rate = taxRate()"], after: ["three"] });
  assert.equal(cs[1].line, 5);
  assert.deepEqual(cs[1].main, []);
  assert.match(clashText([{ path: "gone.js", text: "no markers" }]), /can't be merged line by line/);
});

test("the clash text for a prompt stays short enough to paste", () => {
  const big = { path: "big.js", text: ["<<<<<<< main", "x".repeat(500), "=======", "y", ">>>>>>> b"].join("\n") };
  const t = clashText(Array.from({ length: 40 }, (_, i) => ({ ...big, path: `f${i}.js` })));
  assert.ok(t.length < 3600, `was ${t.length}`);
  assert.match(t, /and \d+ more files clash/);
  assert.match(t, /x{160}…/);
});
