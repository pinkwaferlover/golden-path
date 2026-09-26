// Fixtures are made-up names and numbers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { recommend, prettyModel, whoLine } from "../src/recommend.mjs";

const NOW = Date.parse("2026-09-25T22:30:00Z");
const recent = "2026-09-25T20:00:00Z";
const ok = [{ name: "check:ci", conclusion: "SUCCESS" }, { context: "Vercel", state: "SUCCESS" }, { name: "Vercel Preview Comments", conclusion: "SUCCESS" }];
const branch = (name, extra = {}) => ({ name, remote: true, remoteSha: name + "-sha", remoteDate: recent, date: recent, tip: `origin/${name}`, ahead: 1, behind: 0, subject: `feat: ${name}`, subjects: [`feat: ${name}`], parents: [], who: { commits: 1, authors: { "Sam Example": 1 }, tools: { "claude-code": 1 }, models: { "claude-sonnet-4-5": 1 }, tasks: { "T-1": 1 }, coauthors: { "Claude Sonnet 4.5": 1 }, unrecorded: 0 }, ...extra });
const pr = (number, head, extra = {}) => ({ number, title: `PR ${number}`, headRefName: head, isDraft: false, mergeable: "MERGEABLE", statusCheckRollup: ok, author: { login: "sam-example", is_bot: false }, url: `https://github.com/o/r/pull/${number}`, headRefOid: head + "-sha", ...extra });
const base = (over = {}) => ({ name: "repo", main: "main", mainRef: "origin/main", hasRemote: true, github: { owner: "o", repo: "r" }, worktrees: [], branches: [], prs: [], merged: [], deployments: [{ sha: "x", state: "success" }], previews: {}, ...over });
const run = (s, o = {}) => recommend(s, { now: NOW, people: { "sam-example": "Sam", "Sam Example": "Sam" }, ...o });

test("a clean, passing, up-to-date pull request is the green step, with the exact merge command", () => {
  const { rows } = run(base({ branches: [branch("dependabot/x")], prs: [pr(11, "dependabot/x", { author: { login: "app/dependabot", is_bot: true } })] }));
  const r = rows.find((x) => x.title === "PR 11");
  assert.equal(r.colour, "green");
  assert.equal(r.action.command, "gh pr merge 11 --squash");
  assert.equal(r.reached, 5);
  assert.ok(r.facts.why.every((w) => w.ok), "every safety fact holds");
  assert.match(r.who.map((s) => s.t).join(""), /Dependabot/);
});

test("a branch built on an unmerged pull request waits for it (grey)", () => {
  const parent = branch("next-phase", { ahead: 34 });
  const child = branch("monthly-tax", { ahead: 46, parents: ["next-phase"] });
  const { rows } = run(base({ branches: [parent, child], prs: [pr(9, "next-phase")] }));
  const r = rows.find((x) => x.branchLine.startsWith("monthly-tax"));
  assert.equal(r.colour, "grey");
  assert.match(r.note, /#9/);
});

test("commits only on this computer beat a merge for the green step", () => {
  const local = branch("pay-main", { local: true, localSha: "l", remote: true, ahead: 42, unpushed: 2 });
  const { rows } = run(base({ branches: [local, branch("dep")], prs: [pr(11, "dep")] }));
  const g = rows.find((x) => x.colour === "green");
  assert.equal(g.greenable, "push");
  assert.equal(g.action.command, "git push origin pay-main");
  assert.equal(rows.filter((x) => x.colour === "green").length, 1, "exactly one green");
});

test("a merge conflict is handed to Claude, never merged", () => {
  const { rows } = run(base({ branches: [branch("c")], prs: [pr(12, "c", { mergeable: "CONFLICTING" })] }));
  const r = rows.find((x) => x.title === "PR 12");
  assert.equal(r.conflict, true);
  assert.equal(r.action.kind, "prompt");
  assert.notEqual(r.colour, "green");
});

test("failed checks show red with a link to what failed", () => {
  const { rows } = run(base({ branches: [branch("f")], prs: [pr(2, "f", { statusCheckRollup: [{ name: "check:ci", conclusion: "FAILURE", detailsUrl: "https://ci/1" }] })] }));
  const r = rows.find((x) => x.title === "PR 2");
  assert.equal(r.colour, "red");
  assert.equal(r.action.href, "https://ci/1");
});

test("a branch whose pull request was squash-merged is a tidy-up, not work", () => {
  const { rows, tidy } = run(base({ branches: [branch("done", { ahead: 3 })], merged: [{ number: 13, title: "t", headRefName: "done", mergedAt: "2026-09-20T10:00:00Z", mergeCommit: { oid: "abc" }, url: "u", author: { login: "sam-example" } }] }));
  assert.equal(rows.filter((x) => x.branchLine && x.branchLine.startsWith("done")).length, 0);
  assert.ok(tidy.some((t) => t.name === "done"));
});

test("two names for the same commit show as one row, under the name with the pull request", () => {
  const a = branch("ag/pay-schedule", { local: true, localSha: "same", remote: false, remoteSha: undefined, unpushed: 0, tip: "ag/pay-schedule" });
  const b = branch("claude/next-phase", { remoteSha: "same" });
  const { rows } = run(base({ branches: [a, b], prs: [pr(9, "claude/next-phase")] }));
  const matches = rows.filter((x) => /next-phase|pay-schedule/.test(x.branchLine || ""));
  assert.equal(matches.length, 1);
  assert.match(matches[0].branchLine, /also called ag\/pay-schedule/);
});

test("a pull request merged in the last day shows live once its production deploy succeeds", () => {
  const { rows } = run(base({ merged: [{ number: 11, title: "deps", headRefName: "d", mergedAt: "2026-09-25T21:15:03Z", mergeCommit: { oid: "7028c33ceebd" }, url: "u", author: { login: "app/dependabot", is_bot: true } }], deployments: [{ sha: "7028c33ceebd", state: "success", created: "2026-09-25T21:15:48Z" }] }));
  const r = rows.find((x) => x.kind === "merged");
  assert.equal(r.live, "live");
  assert.equal(r.action.kind, "dismiss");
});

test("without the bundle, tool, model and task are not read from commit notes", () => {
  const who = { commits: 2, authors: { "Sam Example": 2 }, tools: { cursor: 2 }, models: { "example-3.8-mini": 2 }, tasks: { "T-42": 2 }, coauthors: { "Claude Sonnet 4.5": 1 }, unrecorded: 0 };
  const on = whoLine({ who }, { people: { "Sam Example": "Sam" }, bundle: true }).map((s) => s.t).join("");
  const off = whoLine({ who }, { people: { "Sam Example": "Sam" }, bundle: false }).map((s) => s.t).join("");
  assert.match(on, /Cursor/); assert.match(on, /Example 3\.8 Mini/); assert.match(on, /T-42/);
  assert.doesNotMatch(off, /Cursor|3\.8 Mini|T-42/);
  assert.match(off, /with Claude Sonnet 4\.5/);
});

test("model names read plainly, and an unrecorded model is not guessed", () => {
  assert.equal(prettyModel("claude-sonnet-4-5"), "Sonnet 4.5");
  assert.equal(prettyModel("example-3.8-mini"), "Example 3.8 Mini");
  assert.equal(prettyModel("inherit"), null);
});

test("the same generated files changed in several folders show as one row", () => {
  const w = (p) => ({ path: p, branch: "b" + p, changed: 2, staged: 0, unstaged: 2, files: ["product-metrics.json", "test-card.json"], touched: Date.parse(recent) });
  const { rows } = run(base({ worktrees: [w("/a"), w("/b"), w("/c")] }));
  const f = rows.filter((x) => x.kind === "folder");
  assert.equal(f.length, 1);
  assert.match(f[0].title, /3 folders/);
});

test("among drafts, work in a folder touched this week goes green over newer work", () => {
  const older = branch("mine", { date: "2026-09-24T09:00:00Z", remoteDate: "2026-09-24T09:00:00Z" });
  const newer = branch("web-idea", { date: recent });
  const { rows } = run(base({ branches: [older, newer], worktreeByBranch: { mine: { path: "C:/code/app/.worktrees/mine", branch: "mine", touched: NOW - 2 * 3600e3 } } }));
  const g = rows.find((x) => x.colour === "green");
  assert.equal(g.branchLine.split(" ")[0], "mine");
  assert.ok(g.facts.why.some((w) => /folder mine, touched 2 hours ago/.test(w.t)));
});

test("among drafts, a person's commits beat AI-only commits", () => {
  const ai = { commits: 1, authors: { Claude: 1 }, tools: {}, models: {}, tasks: {}, coauthors: {}, unrecorded: 1 };
  const byAi = branch("ai-only", { who: ai });
  const byPerson = branch("by-sam", { date: "2026-09-25T10:00:00Z" });
  const { rows } = run(base({ branches: [byAi, byPerson] }));
  const g = rows.find((x) => x.colour === "green");
  assert.equal(g.branchLine.split(" ")[0], "by-sam");
  assert.ok(g.facts.why.some((w) => w.t === "Commits by Sam"));
});
