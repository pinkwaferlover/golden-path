// Reads the state of one repository from git and the GitHub CLI.
// Nothing here writes to the repository except `git fetch`, which only
// updates the local copy of what is on GitHub.
import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";

function run(cmd, args, cwd, { timeout = 30000 } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: stdout ? stdout.toString() : "", err: stderr ? stderr.toString() : err ? String(err.message) : "" });
    });
  });
}
const git = (cwd, ...args) => run("git", args, cwd);
const gh = (cwd, ...args) => run("gh", args, cwd);

const lastFetch = new Map();

// Parse the trailers our usage-tagging protocol adds (Tool, Model, Task),
// plus the Co-Authored-By trailer AI tools add on their own.
export function parseTrailers(body) {
  const t = {};
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^(Tool|Model|Task|Tool-Version|Co-Authored-By):\s*(.+)$/i);
    if (m) {
      const k = m[1].toLowerCase();
      (t[k] ||= []).push(m[2].trim());
    }
  }
  return t;
}

async function authorship(cwd, range) {
  const r = await git(cwd, "log", "--format=%an%x1f%ae%x1f%B%x1e", range);
  if (!r.ok) return null;
  const commits = r.out.split("\x1e").map((s) => s.trim()).filter(Boolean).map((s) => {
    const [name, email, body = ""] = s.split("\x1f");
    return { name, email, trailers: parseTrailers(body) };
  });
  const count = (fn) => commits.reduce((m, c) => { for (const v of fn(c)) m[v] = (m[v] || 0) + 1; return m; }, {});
  return {
    commits: commits.length,
    authors: count((c) => [c.name]),
    tools: count((c) => c.trailers.tool || []),
    models: count((c) => c.trailers.model || []),
    tasks: count((c) => c.trailers.task || []),
    coauthors: count((c) => (c.trailers["co-authored-by"] || []).map((v) => v.replace(/\s*<.*>$/, ""))),
    unrecorded: commits.filter((c) => !c.trailers.tool).length,
  };
}

function parseGithub(url) {
  const m = url && url.trim().match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

export async function collectRepo(repoCfg, { fetch = true } = {}) {
  const cwd = repoCfg.path;
  const name = repoCfg.name || path.basename(cwd);
  const out = { name, path: cwd, errors: [], rows: [], hasRemote: false };

  const inside = await git(cwd, "rev-parse", "--is-inside-work-tree");
  if (!inside.ok) { out.errors.push("Not a git repository"); return out; }

  const remoteUrl = (await git(cwd, "remote", "get-url", "origin")).out.trim();
  out.github = parseGithub(remoteUrl);
  out.hasRemote = !!remoteUrl;

  if (out.hasRemote && fetch) {
    const last = lastFetch.get(cwd) || 0;
    if (Date.now() - last > 60_000) {
      const f = await run("git", ["fetch", "--prune", "--quiet", "origin"], cwd, { timeout: 60000 });
      if (!f.ok) out.errors.push("Could not reach GitHub to refresh (showing the last known state)");
      else lastFetch.set(cwd, Date.now());
    }
  }

  // Which branch is "main"?
  let main = "main";
  const head = await git(cwd, "symbolic-ref", "--short", "refs/remotes/origin/HEAD");
  if (head.ok) main = head.out.trim().replace(/^origin\//, "");
  out.main = main;
  const mainRef = out.hasRemote ? `origin/${main}` : main;
  const hasMain = (await git(cwd, "rev-parse", "--verify", "--quiet", mainRef)).ok;
  out.mainRef = hasMain ? mainRef : null;

  // Worktrees and their uncommitted changes.
  const wt = await git(cwd, "worktree", "list", "--porcelain");
  const worktrees = [];
  for (const block of wt.out.split(/\n\n+/)) {
    const p = block.match(/^worktree (.+)$/m), b = block.match(/^branch refs\/heads\/(.+)$/m);
    if (p) worktrees.push({ path: p[1].trim(), branch: b ? b[1].trim() : null });
  }
  for (const w of worktrees) {
    // Read "last touched" before anything else, and use --no-optional-locks so
    // `git status` doesn't rewrite the index (which would also reset that date).
    const idx = await git(w.path, "rev-parse", "--git-path", "index");
    try { w.touched = idx.ok ? (await stat(path.resolve(w.path, idx.out.trim()))).mtimeMs : null; } catch { w.touched = null; }
    const st = await git(w.path, "--no-optional-locks", "status", "--porcelain");
    const lines = st.out.split(/\r?\n/).filter(Boolean);
    w.changed = lines.length;
    w.files = lines.slice(0, 3).map((l) => l.slice(3).trim().replace(/\/$/, "").split("/").pop());
    w.staged = lines.filter((l) => l[0] !== " " && l[0] !== "?").length;
    w.unstaged = lines.filter((l) => l[1] !== " " || l[0] === "?").length;
  }
  out.worktrees = worktrees;
  const commitsOnHead = (await git(cwd, "rev-list", "--count", "HEAD")).ok;
  out.neverCommitted = !commitsOnHead;

  if (!out.mainRef) return out; // nothing to compare against (e.g. a folder with no commits)

  // Branches, local and on GitHub.
  const refs = await git(cwd, "for-each-ref", "--format=%(refname)%00%(objectname)%00%(committerdate:iso-strict)%00%(upstream:short)%00%(subject)", "refs/heads", "refs/remotes/origin");
  const branches = new Map();
  for (const line of refs.out.split(/\r?\n/).filter(Boolean)) {
    const [ref, sha, date, upstream, subject] = line.split("\0");
    let local = null, remote = null;
    if (ref.startsWith("refs/heads/")) local = ref.slice(11);
    else { remote = ref.slice("refs/remotes/origin/".length); if (remote === "HEAD") continue; }
    const key = local || remote;
    if (key === main) continue;
    const b = branches.get(key) || { name: key };
    if (local) Object.assign(b, { local: true, localSha: sha, localDate: date, upstream: upstream || null, subject });
    else Object.assign(b, { remote: true, remoteSha: sha, remoteDate: date, subject: b.subject || subject });
    branches.set(key, b);
  }
  const list = [...branches.values()];
  await Promise.all(list.map(async (b) => {
    const tip = b.local ? b.name : `origin/${b.name}`;
    b.tip = tip;
    const lr = await git(cwd, "rev-list", "--left-right", "--count", `${out.mainRef}...${tip}`);
    const [behind, ahead] = lr.out.trim().split(/\s+/).map(Number);
    Object.assign(b, { behind, ahead });
    if (b.local) {
      // Commits on this branch that are on no branch on GitHub at all.
      const up = await git(cwd, "rev-list", "--count", b.name, "--not", "--remotes=origin");
      b.unpushed = up.ok ? Number(up.out.trim()) : ahead;
    }
    b.date = b.localDate || b.remoteDate;
  }));

  // Pull requests.
  let prs = [], merged = [];
  if (out.github) {
    const fields = "number,title,headRefName,isDraft,mergeable,statusCheckRollup,author,url,createdAt,headRefOid";
    const o = await gh(cwd, "pr", "list", "--state", "open", "--limit", "100", "--json", fields);
    if (o.ok) prs = JSON.parse(o.out); else out.errors.push("Could not read pull requests (is the GitHub CLI signed in?)");
    const m = await gh(cwd, "pr", "list", "--state", "merged", "--limit", "30", "--json", "number,title,headRefName,mergedAt,mergeCommit,url,author");
    if (m.ok) merged = JSON.parse(m.out);
  }
  out.prs = prs;
  out.merged = merged;

  // Production deployment (Vercel and others report through GitHub deployments).
  if (out.github) {
    const { owner, repo } = out.github;
    const d = await gh(cwd, "api", `repos/${owner}/${repo}/deployments?environment=Production&per_page=5`);
    if (d.ok) {
      const deps = JSON.parse(d.out);
      const withStatus = await Promise.all(deps.map(async (dep) => {
        const s = await gh(cwd, "api", `repos/${owner}/${repo}/deployments/${dep.id}/statuses?per_page=1`);
        const st = s.ok ? JSON.parse(s.out)[0] : null;
        return { sha: dep.sha, created: dep.created_at, state: st ? st.state : "unknown", url: st ? st.environment_url : null, logUrl: st ? st.log_url || st.target_url : null };
      }));
      out.deployments = withStatus;
      out.production = withStatus.find((x) => x.state === "success") || null;
    }
    // Preview deployments for branch tips we will show.
    const shas = new Set();
    for (const p of prs) shas.add(p.headRefOid);
    for (const b of list) if (b.remote && b.ahead > 0) shas.add(b.remoteSha);
    out.previews = {};
    await Promise.all([...shas].slice(0, 40).map(async (sha) => {
      const r = await gh(cwd, "api", `repos/${owner}/${repo}/deployments?sha=${sha}&per_page=1`);
      if (!r.ok) return;
      const dep = JSON.parse(r.out)[0];
      if (!dep) return;
      const s = await gh(cwd, "api", `repos/${owner}/${repo}/deployments/${dep.id}/statuses?per_page=1`);
      const st = s.ok ? JSON.parse(s.out)[0] : null;
      if (st && st.state === "success") out.previews[sha] = { url: st.environment_url, logUrl: st.log_url || st.target_url };
    }));
  }

  // Who made each branch's work, and whether one branch is built on another.
  const shown = list.filter((b) => b.ahead > 0);
  await Promise.all(shown.map(async (b) => {
    b.who = await authorship(cwd, `${out.mainRef}..${b.tip}`);
    const s = await git(cwd, "log", "--format=%s", `${out.mainRef}..${b.tip}`);
    b.subjects = s.out.split(/\r?\n/).filter(Boolean);
    // Files the branch changes since it left main, for "may clash" hints.
    const f = await git(cwd, "diff", "--name-only", `${out.mainRef}...${b.tip}`);
    b.files = f.ok ? f.out.split(/\r?\n/).filter(Boolean) : [];
  }));
  for (const b of shown) {
    b.parents = [];
    for (const a of shown) {
      if (a === b || a.ahead >= b.ahead) continue;
      const isAnc = await git(cwd, "merge-base", "--is-ancestor", a.tip, b.tip);
      if (isAnc.ok) b.parents.push(a.name);
    }
  }
  out.branches = list;
  out.worktreeByBranch = Object.fromEntries(worktrees.filter((w) => w.branch).map((w) => [w.branch, w]));
  return out;
}

// A test merge of a branch into main, done inside git's object store only: no folder,
// branch or index changes. Returns the clashing files with their conflict-marked text.
export async function testMerge(cwd, mainRef, tip) {
  const m = await git(cwd, "merge-tree", "--write-tree", "--name-only", "--no-messages", mainRef, tip);
  const lines = m.out.split(/\r?\n/).filter(Boolean);
  if (m.ok) return { clean: true, files: [] };
  if (!lines.length || !/^[0-9a-f]{40,64}$/.test(lines[0])) return { error: m.err.trim() || "git could not test the merge" };
  const tree = lines[0];
  const files = await Promise.all([...new Set(lines.slice(1))].slice(0, 20).map(async (p) => {
    const f = await git(cwd, "show", `${tree}:${p}`);
    return { path: p, text: f.ok ? f.out : null };
  }));
  return { clean: false, files };
}
