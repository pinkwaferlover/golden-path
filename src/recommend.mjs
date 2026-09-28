// Turns the collected state of a repo into rows on the journey to live.
// Pure: no git, no network. Every claim it makes comes from the collected facts;
// anything it can only guess at is worded "looks like" and never goes green.

export const STAGES = ["Changed", "Staged", "Committed", "Pushed", "Pull request", "Checks pass", "Merged", "Live"];
const DAY = 864e5;

const TOOL_NAMES = { "claude-code": "Claude Code", antigravity: "Antigravity", cursor: "Cursor", codex: "Codex" };
// "claude-sonnet-4-5" -> "Sonnet 4.5", "example-3.8-mini" -> "Example 3.8 Mini", "inherit" -> not recorded.
export function prettyModel(m) {
  if (!m || m === "inherit") return null;
  const words = [];
  for (const p of m.replace(/^claude-/, "").split("-")) {
    if (/^\d+$/.test(p) && words.length && /^[\d.]+$/.test(words[words.length - 1])) words[words.length - 1] += "." + p;
    else words.push(p);
  }
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const cleanSubject = (s) => (s || "").replace(/^\w+(\([^)]*\))?!?:\s*/, "").replace(/\s*\([A-Z]+[\w.-]*\)\s*$/, "").replace(/^./, (c) => c.toUpperCase());
const ago = (ms, now) => Math.floor((now - ms) / DAY);
const since = (ms, now) => { const m = Math.max(1, Math.round((now - ms) / 6e4)); return m < 60 ? plural(m, "minute") : m < 1440 ? plural(Math.round(m / 60), "hour") : plural(Math.round(m / 1440), "day"); };

function person(name, people) {
  if (!name) return null;
  return people[name] || people[name.toLowerCase()] || name;
}

// "Who made it" segments. With the bundle, the Tool/Model/Task trailers are read.
export function whoLine({ who, prAuthor }, { people = {}, bundle = true } = {}) {
  const seg = [];
  if (prAuthor && (prAuthor.is_bot || /\[bot\]$|^app\//.test(prAuthor.login || ""))) {
    const bot = (prAuthor.login || "").replace(/^app\//, "").replace(/\[bot\]$/, "");
    seg.push({ t: "Opened by " }, { t: bot.charAt(0).toUpperCase() + bot.slice(1), b: true });
    if (bot === "dependabot") seg.push({ t: ", GitHub’s robot for package updates. No person or AI wrote it." });
    else seg.push({ t: " (a robot account)" });
    return seg;
  }
  if (!who) return [{ t: "Who and which tool: " }, { t: "not recorded", b: true }, { t: " — nothing was ever committed" }];
  const authors = Object.keys(who.authors);
  const humans = authors.filter((a) => a !== "Claude").map((a) => person(a, people));
  const cloud = who.authors.Claude || 0;
  const parts = [];
  if (humans.length) parts.push([{ t: [...new Set(humans)].join(", "), b: true }]);
  if (cloud && humans.length) parts.push([{ t: `Claude on the web (${cloud})` }]);
  if (cloud && !humans.length) parts.push([{ t: "Written by " }, { t: "Claude on the web", b: true }]);
  if (bundle) {
    const tools = Object.entries(who.tools).sort((a, b) => b[1] - a[1]);
    if (tools.length) parts.push([{ t: tools.map(([k, n]) => `${TOOL_NAMES[k] || k}${tools.length > 1 ? " " + n : ""}`).join(", ") }]);
    const models = Object.entries(who.models).map(([m, n]) => [prettyModel(m), n]);
    const named = models.filter(([m]) => m), unknown = models.filter(([m]) => !m).reduce((s, [, n]) => s + n, 0);
    if (named.length) parts.push([{ t: named.map(([m]) => m).join(", ") }]);
    if (unknown) parts.push([{ t: `model not recorded (${unknown})` }]);
    const notes = who.unrecorded;
    if (notes && notes < who.commits) parts.push([{ t: `${plural(notes, "commit")} unrecorded` }]);
    if (notes === who.commits) parts.push([{ t: "tool not recorded" }]);
    const tasks = Object.keys(who.tasks);
    if (tasks.length) parts.push([{ t: `task ${tasks.slice(0, 2).join(", ")}${tasks.length > 2 ? "…" : ""}` }]);
  } else {
    const co = Object.keys(who.coauthors);
    if (co.length) parts.push([{ t: `with ${co.join(", ")}` }]);
  }
  if (prAuthor && !humans.includes(person(prAuthor.login, people)) && cloud) parts.push([{ t: "PR opened by " }, { t: person(prAuthor.login, people), b: true }]);
  parts.forEach((p, i) => { if (i) seg.push({ t: " · " }); seg.push(...p); });
  return seg;
}

function checks(pr) {
  const roll = pr.statusCheckRollup || [];
  const states = roll.map((c) => (c.conclusion || c.state || c.status || "").toUpperCase());
  const failed = roll.filter((c, i) => ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED"].includes(states[i]));
  const pending = states.some((s) => ["PENDING", "IN_PROGRESS", "QUEUED", "EXPECTED", "WAITING", ""].includes(s));
  const passed = roll.length - failed.length;
  return { total: roll.length, failed, pending: !failed.length && pending, passed, ok: roll.length > 0 ? !failed.length && !pending : true, none: roll.length === 0 };
}

export function recommend(state, { people = {}, bundle = true, now = Date.now(), dismissed = [] } = {}) {
  const rows = [];
  const tidy = [];
  const gh = state.github;
  const url = (p) => (gh ? `https://github.com/${gh.owner}/${gh.repo}${p}` : null);
  const main = state.main || "main";

  // Live / deploying: recently merged pull requests.
  for (const m of state.merged || []) {
    const mergedAt = Date.parse(m.mergedAt);
    if (now - mergedAt > DAY || dismissed.includes(`${state.name}#${m.number}`)) continue;
    const sha = m.mergeCommit && m.mergeCommit.oid;
    const dep = (state.deployments || []).find((d) => d.sha === sha);
    const hasDeploys = (state.deployments || []).length > 0;
    let live = "merged";
    if (dep && dep.state === "success") live = "live";
    else if (dep && dep.state === "failure") live = "failed";
    else if (hasDeploys && now - mergedAt < 20 * 60e3) live = "deploying";
    const t = new Date(dep && dep.state === "success" ? dep.created : mergedAt);
    const hhmm = t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    rows.push({
      id: `${state.name}#${m.number}`, kind: "merged", colour: live === "failed" ? "red" : "green", group: "done",
      tag: `PULL REQUEST #${m.number} · MERGED${live === "live" ? " · LIVE" : ""}`, title: m.title, href: m.url,
      branchLine: `branch ${m.headRefName}`,
      who: m.author && (m.author.is_bot || /^app\//.test(m.author.login || "")) ? whoLine({ prAuthor: m.author }, { people, bundle }) : [{ t: "Opened by " }, { t: person(m.author && m.author.login, people) || "someone", b: true }],
      reached: 6, live,
      note: live === "live" ? `Live since ${hhmm} as ${sha.slice(0, 7)}` : live === "deploying" ? "Vercel is deploying…" : live === "failed" ? "The production deploy failed" : hasDeploys ? "Merged, but no production deploy found for it" : "Merged. This repo has no deploy step",
      action: live === "failed" ? { kind: "link", label: "See the failed deploy", href: dep.logUrl || dep.url } : { kind: "dismiss", label: live === "live" ? "✓ Live — Dismiss" : "Dismiss" },
      sub: live === "live" && state.liveUrl ? { href: state.liveUrl, label: "open the live site" } : null,
    });
  }

  // Uncommitted changes in any worktree. Folders with the very same small set of
  // changed files (often generated files) are shown once, not once per folder.
  const seen = new Map();
  const wts = [];
  for (const w of state.worktrees || []) {
    if (!w.changed) continue;
    const key = w.changed <= 3 ? (w.files || []).join("|") : null;
    if (key && seen.has(key)) { seen.get(key).also.push(w); continue; }
    const entry = { ...w, also: [] };
    if (key) seen.set(key, entry);
    wts.push(entry);
  }
  for (const w of wts) {
    const stale = w.touched && ago(w.touched, now) >= 14;
    const shared = (state.worktrees || []).length > 1 && w.path === state.worktrees[0].path;
    const allStaged = w.unstaged === 0;
    const never = state.neverCommitted;
    rows.push({
      id: `${state.name}:wt:${w.path}`, kind: "folder", colour: stale ? "slate" : "blue", group: stale ? "stale" : "also",
      tag: never ? "FOLDER · NEVER COMMITTED" + (state.hasRemote ? "" : " · NOT ON GITHUB") : `CHANGES NOT YET COMMITTED${w.branch ? " · ON " + w.branch : ""}`,
      title: never ? "Work that has never been saved as a commit" : w.also.length ? `The same ${plural(w.changed, "file")} changed in ${w.also.length + 1} folders` : `${plural(w.changed, "changed file")} in ${w.path.split(/[\\/]/).pop()}`,
      folders: [w.path, ...w.also.map((x) => x.path)],
      branchLine: `${w.path}${w.also.length ? ` and ${plural(w.also.length, "other folder")}` : ""}${w.touched ? ` · last touched ${new Date(w.touched).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}`,
      who: never ? whoLine({ who: null }, { people, bundle }) : [{ t: shared ? "Shared folder: other sessions may have work here too" : "Only this folder’s work" }],
      reached: allStaged ? 1 : 0, next: 2,
      note: `${(w.files || []).join(", ")}${w.changed > 3 ? ` and ${w.changed - 3} more` : ""} — ${allStaged ? "staged" : "changed"}, not committed${stale ? ` · untouched for ${ago(w.touched, now)} days` : ""}`,
      action: { kind: "prompt", label: stale ? "Hand to Claude to review" : "Hand to Claude", prompt: `${w.also.length ? `The same files (${(w.files || []).join(", ")}) are changed in ${w.also.length + 1} folders: ${[w.path, ...w.also.map((x) => x.path)].join("; ")}. Tell me whether they are generated files that should be ignored or restored, or real work. ` : ""}In ${w.path}${w.branch ? ` (branch ${w.branch})` : ""} there ${w.changed === 1 ? "is 1 file" : `are ${w.changed} files`} changed but not committed${stale ? `, last touched ${ago(w.touched, now)} days ago` : ""}. Look at what they are, tell me in plain words, then — only with my go-ahead — group them into sensible commits on their own branch, push, and open a draft pull request. ${shared ? "This folder is shared with other sessions: stage by explicit path only and don't touch files you didn't create." : ""}`.trim() },
      sub: { text: "copies a ready prompt" },
      facts: {
        why: [
          { ok: false, t: `${plural(w.changed, "file")} exist only in this folder — not in any commit` },
          { ok: !shared, t: shared ? "This folder is shared, so some changes may belong to another session" : "Only one piece of work lives in this folder" },
        ],
        happens: "Deciding what belongs together needs judgement, so the app hands this to Claude with a ready prompt instead of committing for you.",
        ifNot: "Nothing breaks, but the work exists only on this disk.",
        command: "git status",
      },
    });
  }
  if (!state.mainRef) return { rows: order(rows), tidy };

  // Branches with work not in main.
  const openByHead = new Map((state.prs || []).map((p) => [p.headRefName, p]));
  const mergedHeads = new Set((state.merged || []).map((m) => m.headRefName));
  const bySha = new Map();
  const shown = [];
  for (const b of state.branches || []) {
    if (b.ahead === 0) { tidy.push({ name: b.name, why: "already in main" }); continue; }
    if (mergedHeads.has(b.name) && !(b.unpushed > 0) && !openByHead.has(b.name)) { tidy.push({ name: b.name, why: "its pull request was merged (squashed)" }); continue; }
    const sha = b.localSha || b.remoteSha;
    if (bySha.has(sha) && !(b.unpushed > 0)) { const o = bySha.get(sha); (o.aliases ||= []).push(b.name); continue; }
    bySha.set(sha, b);
    shown.push(b);
  }
  // Prefer the name with a PR when two names point at the same commit.
  for (const b of shown) for (const a of b.aliases || []) if (openByHead.has(a) && !openByHead.has(b.name)) { b.aliases = b.aliases.filter((x) => x !== a).concat(b.name); b.name = a; b.remote = true; b.tip = `origin/${a}`; }

  const shownNames = new Set(shown.map((b) => b.name).concat(shown.flatMap((b) => b.aliases || [])));
  const canonical = new Map();
  for (const b of shown) { canonical.set(b.name, b.name); for (const a of b.aliases || []) canonical.set(a, b.name); }
  const byName = new Map(shown.map((b) => [b.name, b]));
  // Keep only the nearest parents: drop any parent that another parent is itself built on.
  for (const b of shown) b.allParents = [...new Set((b.parents || []).map((p) => canonical.get(p) || p))];
  for (const b of shown) {
    const ps = [...new Set((b.parents || []).filter((p) => canonical.has(p)).map((p) => canonical.get(p)))].filter((p) => p !== b.name);
    b.parents = ps.filter((p) => !ps.some((q) => q !== p && ((byName.get(q) || {}).parents || []).map((x) => canonical.get(x)).includes(p)));
  }
  const nameOf = (n) => { const pr = openByHead.get(n); return pr ? `#${pr.number}` : n; };
  const children = new Map(shown.map((b) => [b.name, []]));
  for (const b of shown) for (const p of b.parents) if (children.has(p)) children.get(p).push(b.name);

  for (const b of shown) {
    const pr = openByHead.get(b.name);
    const parents = (b.parents || []).filter((p) => shownNames.has(p));
    const stale = ago(Date.parse(b.date), now) >= 14;
    // "Looks like an older copy": most of its commit messages reappear on a newer branch.
    let copyOf = null;
    for (const c of shown) {
      if (c === b || !b.subjects || !c.subjects || c.subjects.length < 3 || (b.allParents || []).includes(c.name) || (c.allParents || []).includes(b.name)) continue;
      const set = new Set(c.subjects);
      const shared = b.subjects.filter((s) => set.has(s)).length;
      if (shared / b.subjects.length >= 0.8 && Date.parse(c.date) > Date.parse(b.date)) { copyOf = c.name; break; }
    }
    const who = whoLine({ who: b.who, prAuthor: pr && pr.author }, { people, bundle });
    const alias = b.aliases && b.aliases.length ? ` · also called ${b.aliases.join(", ")}` : "";
    const aheadBehind = `${b.ahead} ahead, ${b.behind} behind ${main}`;
    const preview = state.previews && state.previews[pr ? pr.headRefOid : b.remoteSha];
    // Provable signs that someone is working on it now: a folder with it checked out,
    // touched this week, and commits by a person rather than only by an AI or a robot.
    const wt = (state.worktreeByBranch || {})[b.name];
    const active = wt && wt.touched && now - wt.touched < 7 * DAY ? wt : null;
    const humans = Object.keys((b.who && b.who.authors) || {}).filter((a) => a !== "Claude" && !/\[bot\]$|bot$/i.test(a)).map((a) => person(a, people));
    // What else touches this work. "May clash" is a guess from shared file names, never a proof.
    const related = new Set([...(b.allParents || []), ...shown.filter((c) => (c.allParents || []).includes(b.name)).map((c) => c.name)]);
    const mine = new Set(b.files || []);
    const mayClash = shown.filter((c) => c !== b && !related.has(c.name) && Date.parse(c.date) > now - 14 * DAY)
      .map((c) => ({ name: nameOf(c.name), files: (c.files || []).filter((f) => mine.has(f)) })).filter((c) => c.files.length)
      .sort((x, y) => y.files.length - x.files.length).slice(0, 6);
    const base = {
      id: `${state.name}:${b.name}`, who, stale, date: Date.parse(b.date), branchName: b.name,
      details: {
        builtOn: parents.map(nameOf), builtOnIt: (children.get(b.name) || []).map(nameOf),
        folder: wt ? { path: wt.path, changed: wt.changed || 0 } : null,
        aliases: b.aliases || [], files: (b.files || []).length, mayClash,
      },
      signals: { active: active ? `You’re working on this: folder ${active.path.split(/[\\/]/).pop()}, touched ${since(active.touched, now)} ago` : null, human: humans.length ? `Commits by ${[...new Set(humans)].join(", ")}` : null },
      preview: preview ? { href: preview.url, label: "Preview site" } : null,
      buildLog: preview && preview.logUrl ? { href: preview.logUrl, label: "Vercel build log" } : null,
      compare: url(`/compare/${main}...${encodeURIComponent(b.name)}`),
    };

    if (b.unpushed > 0) {
      const partial = b.unpushed < b.ahead;
      // Never push onto main: a branch that tracks main (made with `-b x origin/main`)
      // gets its own branch on GitHub instead, so the work goes through a pull request.
      const upstreamName = b.upstream ? b.upstream.replace(/^origin\//, "") : null;
      const pushCmd = b.remote ? `git push origin ${b.name}` : upstreamName && upstreamName !== b.name && upstreamName !== main ? `git push origin ${b.name}:${upstreamName}` : `git push -u origin ${b.name}`;
      rows.push({
        ...base, kind: "branch", colour: "blue", greenable: "push", group: "also",
        tag: pr ? `PULL REQUEST #${pr.number} · UNPUSHED WORK` : b.remote ? "BRANCH · NO PULL REQUEST" : "BRANCH · ONLY ON THIS COMPUTER",
        title: pr ? pr.title : cleanSubject(b.subject), href: pr && pr.url,
        branchLine: `${b.name} · ${aheadBehind}${alias}`,
        reached: 2, next: 3,
        note: partial ? `${plural(b.unpushed, "commit")} only on this computer — GitHub has ${b.ahead - b.unpushed} of ${b.ahead}` : `${plural(b.unpushed, "commit")} only on this computer`,
        action: { kind: "copy", label: `Push ${plural(b.unpushed, "commit")}`, command: pushCmd },
        sub: { text: pr ? "the pull request updates itself" : "then: open a draft pull request" },
        facts: {
          why: [
            { ok: true, t: "Pushing only adds — it never changes main or the live site" },
            { ok: false, t: `${plural(b.unpushed, "commit")} ${b.unpushed === 1 ? "exists" : "exist"} only on this computer` },
            { ok: !parents.length, t: parents.length ? `Built on ${parents.map(nameOf).join(", ")}` : "Nothing else is built on it" },
          ],
          happens: `GitHub gets all ${b.ahead} commits${gh ? " and a fresh preview is built" : ""}.${pr ? "" : " Next step: open a draft pull request."}`,
          ifNot: `Nothing breaks, but ${b.unpushed === 1 ? "that commit lives" : "those commits live"} only on this disk and nobody else can see ${b.unpushed === 1 ? "it" : "them"}. ${b.behind} behind ${main} and growing.`,
          command: pushCmd,
        },
      });
      continue;
    }

    if (pr) {
      const c = checks(pr);
      const reached = c.ok ? 5 : 4;
      const row = { ...base, kind: pr.isDraft ? "draft" : "pr", tag: `${pr.isDraft ? "DRAFT " : ""}PULL REQUEST #${pr.number}`, title: pr.title, href: pr.url, branchLine: `branch ${b.name} · ${b.behind} behind${alias}`, reached, next: null, colour: "blue", group: "also", facts: null };
      const checkFact = c.none ? { ok: true, t: "No automatic checks are set up for this repo" } : { ok: c.ok, t: c.ok ? `All checks passed (${c.passed} of ${c.total})` : c.pending ? "Checks are still running" : `${plural(c.failed.length, "check")} failed` };
      const mergeCmd = `gh pr merge ${pr.number} --squash`;
      const mergeFacts = {
        why: [
          { ok: pr.mergeable === "MERGEABLE", t: pr.mergeable === "MERGEABLE" ? `Mergeable — no conflicts with ${main}` : pr.mergeable === "CONFLICTING" ? `Merge conflict with ${main}` : "GitHub is still working out if it can merge" },
          checkFact,
          { ok: b.behind === 0, t: b.behind === 0 ? `0 commits behind ${main} — what was tested is what goes live` : `${plural(b.behind, "commit")} behind ${main} — what was tested isn’t exactly what would go live` },
          { ok: !parents.length, t: parents.length ? `Built on ${parents.map(nameOf).join(", ")}` : "Nothing else is built on it" },
        ],
        happens: `${mergeCmd} → one new commit on ${main}${(state.deployments || []).length ? " → a production deploy runs → live within minutes" : ""}.`,
        ifNot: `Nothing breaks. It falls further behind as ${main} moves, and will need updating and re-checking.`,
        command: mergeCmd,
      };
      if (pr.isDraft) Object.assign(row, { note: "Draft — mark it ready when the work is done", action: { kind: "link", label: "Open on GitHub", href: pr.url }, facts: mergeFacts, group: stale ? "stale" : "also", colour: stale ? "slate" : "blue" });
      else if (parents.length) Object.assign(row, { colour: "grey", group: "waiting", note: `Built on ${parents.map(nameOf).join(", ")} — waits for it`, action: { kind: "wait", label: `Nothing yet — ${parents.map(nameOf).join(", ")} first` }, facts: mergeFacts });
      else if (pr.mergeable === "CONFLICTING") Object.assign(row, { conflict: true, stuck: "conflict", prNumber: pr.number, note: `Conflict — the same lines changed on ${main}`, action: { kind: "prompt", label: "Hand to Claude", prompt: `Pull request #${pr.number} (${pr.url}) has a merge conflict with ${main}. Explain in plain words what clashes, then resolve it on branch ${b.name} and push — ask me before choosing between two versions of the same change.` }, sub: { text: "to resolve the conflict" }, facts: mergeFacts });
      else if (c.failed.length) Object.assign(row, { colour: "red", stuck: "checks", prNumber: pr.number, failed: c.failed.map((x) => x.name || x.context).filter(Boolean), note: `${plural(c.failed.length, "check")} failed`, action: { kind: "link", label: "See what failed", href: c.failed[0].detailsUrl || c.failed[0].targetUrl || pr.url }, facts: mergeFacts });
      else if (c.pending) Object.assign(row, { running: true, note: "GitHub is running checks…", action: { kind: "wait", label: "Wait for the checks" }, facts: mergeFacts });
      else if (copyOf) Object.assign(row, { dim: true, next: 6, note: `Looks like an older copy of ${nameOf(copyOf)}`, action: { kind: "link", label: "Compare first", href: url(`/compare/${encodeURIComponent(b.name)}...${encodeURIComponent(copyOf)}`) }, facts: mergeFacts });
      else if (b.behind > 0 && pr.mergeable === "MERGEABLE") Object.assign(row, { next: 6, note: `${plural(b.behind, "commit")} behind ${main} — update, then merge`, action: { kind: "copy", label: "Update from main", command: `gh pr update-branch ${pr.number}` }, facts: { ...mergeFacts, command: `gh pr update-branch ${pr.number}` } });
      else if (pr.mergeable === "MERGEABLE") Object.assign(row, { next: 6, greenable: "merge", action: { kind: "copy", label: `Merge into ${main}`, command: mergeCmd }, facts: mergeFacts });
      else Object.assign(row, { note: "GitHub is still working out if it can merge", action: { kind: "link", label: "Open on GitHub", href: pr.url }, facts: mergeFacts });
      if (stale && row.colour === "blue" && !row.greenable) Object.assign(row, { colour: "slate", group: "stale", note: `${row.note} · untouched for ${ago(Date.parse(b.date), now)} days` });
      if (row.colour === "grey") row.group = "waiting";
      rows.push(row);
      continue;
    }

    // Pushed, no pull request.
    const row = { ...base, kind: "branch", tag: "BRANCH · NO PULL REQUEST", title: cleanSubject(b.subject), branchLine: `${b.name} · ${aheadBehind}${alias}`, reached: 3, next: 4, colour: "blue", group: "also" };
    const prCmd = `gh pr create --draft --fill --head ${b.name}`;
    const facts = {
      why: [
        { ok: true, t: "A draft pull request changes nothing — it only makes the work visible and checked" },
        { ok: !parents.length, t: parents.length ? `Built on ${parents.map(nameOf).join(", ")}` : "Nothing else is built on it" },
      ],
      happens: `${prCmd} → GitHub runs the checks and shows the changes in one place.`,
      ifNot: "Nothing breaks, but the work sits unreviewed and falls behind main.",
      command: prCmd,
    };
    if (parents.length) Object.assign(row, { colour: "grey", group: "waiting", next: null, note: `Built on ${parents.map(nameOf).join(", ")} — a pull request now would drag that in too`, action: { kind: "wait", label: `Nothing yet — ${parents.map(nameOf).join(", ")} first` }, facts });
    else if (copyOf) Object.assign(row, { dim: true, note: `Looks like an older copy of ${nameOf(copyOf)}`, action: { kind: "link", label: "Compare first", href: url(`/compare/${encodeURIComponent(b.name)}...${encodeURIComponent(copyOf)}`) }, facts });
    else if (stale) Object.assign(row, { colour: "slate", group: "stale", note: `Untouched for ${ago(Date.parse(b.date), now)} days`, action: { kind: "link", label: "Compare, then decide", href: base.compare }, facts });
    else Object.assign(row, { greenable: "draft", action: { kind: "copy", label: "Open a draft PR", command: prCmd }, facts });
    rows.push(row);
  }

  // One green per repo: pushing unsaved work first, then the cleanest merge.
  const prio = { push: 0, merge: 1, draft: 2 };
  // Among drafts, prefer work in a folder touched this week, then work with a person's commits.
  const lean = (r, k) => (r.greenable === "draft" && r.signals && r.signals[k] ? 1 : 0);
  const cands = rows.filter((r) => r.greenable).sort((a, b) => prio[a.greenable] - prio[b.greenable] || lean(b, "active") - lean(a, "active") || lean(b, "human") - lean(a, "human") || (b.date || 0) - (a.date || 0));
  if (cands.length) {
    const g = cands[0];
    g.colour = "green"; g.group = "next"; g.best = true;
    if (g.greenable === "draft" && g.facts) for (const k of ["active", "human"]) if (g.signals[k]) g.facts.why.push({ ok: true, t: g.signals[k] });
    if (g.action && g.action.kind === "copy") g.action.primary = true;
    for (const o of cands.slice(1)) o.alsoFine = true;
  }
  const dependents = (name) => (children.get(name) || []).length;
  for (const r of rows) if (r.stuck) r.dependents = dependents(r.branchName);
  return { rows: order(rows), tidy };
}

// Within a group, work closest to live comes first.
function rank(r) {
  if (r.greenable === "merge") return 0;
  if (r.action && r.action.label === "Update from main") return 1;
  if (r.stuck || r.running) return 2;
  if (r.greenable === "push") return 3;
  if (r.greenable === "draft") return 4;
  if (r.kind === "draft") return 5;
  if (r.kind === "folder") return 7;
  return 6;
}

const GROUP_ORDER = { done: 0, next: 1, also: 2, waiting: 3, stale: 4 };
function order(rows) {
  return rows.sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || rank(a) - rank(b) || (b.date || 0) - (a.date || 0));
}

// Short summary for the terminal and for "Needs you" lines in chat.
export function summarise(repos) {
  return repos.map((r) => {
    const act = r.rows.filter((x) => x.group !== "stale" && x.group !== "done" && x.colour !== "grey");
    const best = r.rows.find((x) => x.best);
    return { name: r.name, needsYou: act.length, stale: r.rows.filter((x) => x.group === "stale").length, best: best ? `${best.action.label}: ${best.title}` : null };
  });
}

// The headline: what has happened today and what is waiting, in facts, never instructions.
export function headline(rows) {
  const done = rows.filter((r) => r.group === "done");
  const live = done.filter((r) => r.live === "live").length;
  const stuck = rows.filter((r) => r.stuck).length;
  const ready = rows.filter((r) => r.greenable === "merge").length;
  const waiting = rows.filter((r) => r.group !== "done" && r.group !== "stale" && r.colour !== "grey").length;
  const first = live ? `${live} went live today.` : done.length ? `${done.length} merged today.` : waiting ? "Nothing new today." : "All clear.";
  const parts = [];
  if (stuck) parts.push(`${stuck} ${stuck === 1 ? "is" : "are"} stuck`);
  if (ready) parts.push(`${ready} ${ready === 1 ? "is" : "are"} ready to merge`);
  if (!parts.length && waiting && waiting !== done.length) parts.push(`${waiting} waiting`);
  const second = parts.length ? parts.join(", ").replace(/, ([^,]*)$/, " and $1") + "." : "";
  return { first, second: second.charAt(0).toUpperCase() + second.slice(1) };
}

// One prompt for every stuck pull request, in a safe order: work that others are
// built on first, then oldest number first. `clashesFor(row)` gives each one's clash text.
export function stuckPrompt(rows, clashesFor = () => "", { path: repoPath = "", main = "main" } = {}) {
  const stuck = rows.filter((r) => r.stuck).sort((a, b) => (b.dependents || 0) - (a.dependents || 0) || a.prNumber - b.prNumber);
  if (!stuck.length) return null;
  const items = stuck.map((r, i) => {
    const why = r.stuck === "conflict" ? `merge conflict with ${main}` : `failed checks${r.failed && r.failed.length ? ` (${r.failed.join(", ")})` : ""}`;
    const clash = r.stuck === "conflict" ? clashesFor(r) : "";
    return `${i + 1}. #${r.prNumber} "${r.title}" on branch ${r.branchName}: ${why}${r.dependents ? `. ${plural(r.dependents, "other branch", "other branches")} built on it` : ""}.${r.href ? ` ${r.href}` : ""}${clash ? `\n   The lines that clash (from a test merge):\n${clash.replace(/^/gm, "   ")}` : ""}`;
  });
  return `These ${plural(stuck.length, "pull request")} in ${repoPath} can't move on. Fix them one at a time, in this order:

${items.join("\n\n")}

For each one: explain in plain words what is wrong, then fix it on its own branch and push. For a conflict, ask me before choosing between two versions of the same change. For failed checks, read the failure first and fix the cause, not the check. Don't merge anything. Stop and tell me if a fix would change what the pull request is for.`;
}
