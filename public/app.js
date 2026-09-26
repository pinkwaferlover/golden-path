// Golden Path page. Renders what the local server reports; runs nothing itself.
const STOPS = [
  { n: "Changed", cmd: "edit files", tip: "You’ve edited files. Git sees the difference but hasn’t recorded it.", ref: "Pro Git · Recording changes", href: "https://git-scm.com/book/en/v2/Git-Basics-Recording-Changes-to-the-Repository" },
  { n: "Staged", cmd: "git add", tip: "You’ve picked which changes go in the next snapshot. They wait in the “staging area”.", ref: "Pro Git · Recording changes", href: "https://git-scm.com/book/en/v2/Git-Basics-Recording-Changes-to-the-Repository" },
  { n: "Committed", cmd: "git commit", tip: "A snapshot is saved with a message — but only on this computer.", ref: "Pro Git · Recording changes", href: "https://git-scm.com/book/en/v2/Git-Basics-Recording-Changes-to-the-Repository" },
  { n: "Pushed", cmd: "git push", tip: "Your commits are uploaded to GitHub, so they’re safe and others can see them.", ref: "Pro Git · Working with remotes", href: "https://git-scm.com/book/en/v2/Git-Basics-Working-with-Remotes" },
  { n: "Pull request", cmd: "gh pr create", tip: "A request to merge your branch into main, where it can be checked and discussed. A draft one says “not finished yet”.", ref: "GitHub Docs · About pull requests", href: "https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests" },
  { n: "Checks pass", cmd: "automatic", auto: true, tip: "GitHub runs the tests and a preview is built. Nothing for you to do but wait.", ref: "GitHub Docs · About status checks", href: "https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks" },
  { n: "Merged", cmd: "gh pr merge", tip: "The branch’s work joins main. With “squash”, its commits become one new commit.", ref: "GitHub Docs · About merges", href: "https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/about-pull-request-merges" },
  { n: "Live", cmd: "automatic", auto: true, tip: "Your hosting (Vercel, for example) sees main change and deploys it to the live site.", ref: "Vercel Docs · Deployments", href: "https://vercel.com/docs/deployments" },
];
const COL = { green: "#2E7D4F", blue: "#2F5E9E", grey: "#8C877B", slate: "#4F5E78", red: "#A8402F" };
// Tracks are drawn at their column's real width, never stretched, so dots keep their size and sit
// under their column headings. Below BASE_W the drawing is BASE_W wide and scaled down to fit.
const BASE_W = 650;
const stopXs = (w) => { const pad = 46, gap = 40, step = (w - pad - 24 - gap) / 7; return STOPS.map((_, i) => Math.round(pad + i * step + (i === 7 ? gap : 0))); };
const GROUPS = { done: "Done today", next: "Start here", also: "Also reasonable", waiting: "Waiting on something earlier" };

const params = new URLSearchParams(location.search);
const bundleParam = params.get("bundle");
let state = null;
let current = params.get("repo") || localStorage.getItem("gp.repo") || null;
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } },
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const whoHtml = (segs) => (segs || []).map((s) => (s.b ? `<strong>${esc(s.t)}</strong>` : esc(s.t))).join("");
const icon = (kind, c) => {
  const g = {
    pr: `<circle cx="-5" cy="-6" r="2.4"/><circle cx="-5" cy="6" r="2.4"/><circle cx="5" cy="6" r="2.4"/><path d="M-5 -3.6 V3.6 M5 3.6 V-3 C5 -5, 3 -6, 1 -6 M2.5 -8 L0.5 -6 L2.5 -4"/>`,
    merged: `<circle cx="-5" cy="-6" r="2.4"/><circle cx="-5" cy="6" r="2.4"/><circle cx="5" cy="2" r="2.4"/><path d="M-5 -3.6 V3.6 M-5 -3 C-5 1, 0 2, 2.6 2"/>`,
    folder: `<path d="M-7 -5 H-2 L0 -3 H7 V6 H-7 Z"/>`,
    branch: `<circle cx="-4" cy="-6" r="2.4"/><circle cx="-4" cy="6" r="2.4"/><circle cx="5" cy="-4" r="2.4"/><path d="M-4 -3.6 V3.6 M5 -1.6 C5 3, -4 1, -4 3.6"/>`,
  };
  const k = kind === "draft" ? "pr" : g[kind] ? kind : "branch";
  return `<svg width="26" height="26" viewBox="-13 -13 26 26" aria-hidden="true"><circle r="13" fill="#F1EDE3"/><g fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"${kind === "draft" ? ' stroke-dasharray="2 2"' : ""}>${g[k]}</g></svg>`;
};

function track(r, px) {
  const W = Math.max(BASE_W, px), XS = stopXs(W), svg = (s) => `<svg width="${px}" height="${Math.round((88 * px) / W)}" viewBox="0 0 ${W} 88" aria-hidden="true">${s}</svg>`;
  const c = COL[r.colour], y = 34, live = XS[7], PR = 4;
  let s = `<line x1="${live}" y1="0" x2="${live}" y2="88" stroke="#B08A2E" stroke-width="6"/>`;
  const dbl = (x1, x2) => `<line x1="${x1}" y1="${y - 3}" x2="${x2}" y2="${y - 3}" stroke="${c}" stroke-width="2.6"/><line x1="${x1}" y1="${y + 3}" x2="${x2}" y2="${y + 3}" stroke="${c}" stroke-width="2.6"/>`;
  const reached = r.reached;
  if (r.kind === "merged") {
    s += `<line x1="${XS[0]}" y1="${y}" x2="${XS[PR]}" y2="${y}" stroke="${c}" stroke-width="4"/>` + dbl(XS[PR], XS[6]);
    if (r.live === "deploying") s += `<defs><linearGradient id="w${esc(r.id).replace(/[^\w]/g, "")}" gradientUnits="userSpaceOnUse" x1="${XS[6]}" x2="${live}"><stop offset="0" stop-color="${c}"/><stop offset="0" stop-color="${c}"><animate attributeName="offset" values="0;1" dur="1.8s" repeatCount="indefinite"/></stop><stop offset="0" stop-color="#CFE5D6"><animate attributeName="offset" values="0;1" dur="1.8s" repeatCount="indefinite"/></stop><stop offset="1" stop-color="#CFE5D6"/></linearGradient></defs><line x1="${XS[6] + 7}" y1="${y}" x2="${live - 3}" y2="${y}" stroke="url(#w${esc(r.id).replace(/[^\w]/g, "")})" stroke-width="5"/>`;
    else if (r.live === "live") s += `<line x1="${XS[6]}" y1="${y}" x2="${live}" y2="${y}" stroke="${c}" stroke-width="4"/><circle cx="${live}" cy="${y}" r="10" fill="${c}" stroke="#FFFDF8" stroke-width="3"/>`;
    for (let i = 0; i <= 6; i++) s += `<circle cx="${XS[i]}" cy="${y}" r="6.5" fill="${c}"/>`;
    s += `<text x="${XS[6] - 8}" y="${y + 30}" font-size="12" fill="${c}" text-anchor="end">${esc(r.note)}</text>`;
    return svg(s);
  }
  const xr = XS[reached];
  s += `<line x1="${XS[0]}" y1="${y}" x2="${Math.min(xr, XS[PR])}" y2="${y}" stroke="${c}" stroke-width="4"/>`;
  if (reached > PR) s += dbl(XS[PR], xr);
  const next = r.next;
  if (next != null) {
    const xn = XS[next];
    s += r.running
      ? `<line x1="${xr + 8}" y1="${y}" x2="${xn - 12}" y2="${y}" stroke="${c}" stroke-width="4" opacity=".5"/>`
      : `<line class="gp-flow" x1="${xr + 8}" y1="${y}" x2="${xn - 12}" y2="${y}" stroke="${c}" stroke-width="4" stroke-dasharray="8 4"${r.dim ? ' opacity=".45"' : ""}/>`;
    s += `<line x1="${xn + 12}" y1="${y}" x2="${live}" y2="${y}" stroke="#D9D3C4" stroke-width="3.5" stroke-dasharray="3 6"/>`;
  } else s += `<line x1="${xr + 8}" y1="${y}" x2="${live}" y2="${y}" stroke="#D9D3C4" stroke-width="3.5" stroke-dasharray="3 6"/>`;
  for (let i = 0; i <= reached; i++) s += `<circle cx="${XS[i]}" cy="${y}" r="6.5" fill="${c}"/>`;
  if (r.conflict) { const cx = (XS[5] + XS[6]) / 2; s += `<g transform="translate(${cx} ${y})"><circle r="11" fill="#FFFDF8" stroke="${c}" stroke-width="3"/><path d="M-4.5 -4.5 L4.5 4.5 M4.5 -4.5 L-4.5 4.5" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/></g>`; }
  if (next != null) {
    const xn = XS[next];
    if (!r.dim && r.colour === "green") s += `<circle class="gp-pulse" cx="${xn}" cy="${y}" r="11" fill="none" stroke="${c}" stroke-width="3"/>`;
    s += `<circle cx="${xn}" cy="${y}" r="10" fill="#FFFDF8" stroke="${c}" stroke-width="4"/>`;
  }
  if (r.note) {
    const early = next != null && next <= 2;
    const x = next == null ? xr + 20 : early ? XS[0] : XS[next];
    const anchor = next == null || early ? "start" : "middle";
    s += `<text x="${x}" y="${y + 32}" font-size="12" fill="${r.colour === "grey" ? "#5E5A50" : c}" text-anchor="${anchor}">${esc(r.note)}</text>`;
  }
  return svg(s);
}

// The phone strip: a fixed 34px high, drawn at its real width.
function miniSvg(r, px) {
  const c = COL[r.colour], step = (px - 8 - 14) / (6 + 52 / 42), xs = STOPS.map((_, i) => 8 + (i === 7 ? 6 + 52 / 42 : i) * step);
  const reached = r.kind === "merged" ? (r.live === "live" ? 7 : 6) : r.reached;
  let s = `<line x1="${xs[7]}" y1="4" x2="${xs[7]}" y2="30" stroke="#B08A2E" stroke-width="4"/><line x1="${xs[0]}" y1="17" x2="${xs[7]}" y2="17" stroke="#D9D3C4" stroke-width="2.5" stroke-dasharray="2 4"/><line x1="${xs[0]}" y1="17" x2="${xs[Math.min(reached, 7)]}" y2="17" stroke="${c}" stroke-width="3"/>`;
  for (let i = 0; i <= Math.min(reached, 6); i++) s += `<circle cx="${xs[i]}" cy="17" r="4.5" fill="${c}"/>`;
  if (r.next != null) s += `<circle cx="${xs[r.next]}" cy="17" r="7" fill="#FFFDF8" stroke="${c}" stroke-width="3"/>`;
  return `<svg width="${px}" height="34" aria-hidden="true">${s}</svg>`;
}

function mini(r) {
  const c = COL[r.colour], reached = r.kind === "merged" ? (r.live === "live" ? 7 : 6) : r.reached;
  const at = STOPS[Math.min(reached, 7)].n, nx = r.next != null ? STOPS[r.next].n : null;
  return `<div class="mini"><div class="mini-track" data-id="${esc(r.id)}"></div><div style="display:flex;justify-content:space-between;font-size:12px"><span style="color:#5E5A50">At: <strong style="color:#1D1B16">${esc(at)}</strong></span>${nx ? `<span style="color:${c}">Next: <strong>${esc(nx)}</strong></span>` : ""}</div>${r.note ? `<div style="font-size:12px;color:${c};margin-top:4px">${esc(r.note)}</div>` : ""}</div>`;
}

function actionHtml(r) {
  const a = r.action || {};
  const c = COL[r.colour];
  const sub = r.sub ? (r.sub.href ? `<a href="${esc(r.sub.href)}" target="_blank" rel="noopener" style="font-size:12px">${esc(r.sub.label)}</a>` : `<small>${esc(r.sub.text)}</small>`) : "";
  if (a.kind === "wait") return `<div class="act"><div class="wait">${esc(a.label)}</div></div>`;
  if (a.kind === "link") return `<div class="act"><a class="btn" style="color:${c}" href="${esc(a.href)}" target="_blank" rel="noopener">${esc(a.label)}</a>${sub}</div>`;
  const primary = r.best && a.kind === "copy";
  return `<div class="act"><button type="button" class="btn${primary ? " primary" : ""}" style="color:${c}" data-act="${esc(r.id)}">${esc(a.label)}</button>${sub}</div>`;
}

function factsHtml(r) {
  const f = r.facts;
  if (!f) return "";
  const links = [r.preview, r.buildLog, r.compare ? { href: r.compare, label: "Compare with main" } : null].filter(Boolean);
  return `<details class="facts${r.best ? "" : " other"}"${r.best ? " open" : ""}><summary>${r.best ? "Why this is the best next step" : "Why, and what happens"} ›</summary><div class="panel">
<div><h3>${r.best ? "Start here — why it’s safe" : "The facts"}</h3><ul>${f.why.map((w) => `<li class="${w.ok ? "" : "no"}">${w.ok ? "✓" : "✗"} ${esc(w.t)}</li>`).join("")}</ul></div>
<div><h3>What happens</h3><code class="cmd">${esc(f.command)}</code><div>${esc(f.happens)}</div></div>
<div><h3>If you don’t</h3><div>${esc(f.ifNot)}</div>${links.length ? `<div class="links">${links.map((l) => `<a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join("")}</div>` : ""}</div>
</div></details>`;
}

function rowHtml(r) {
  const c = COL[r.colour];
  const title = r.href ? `<a class="title" href="${esc(r.href)}" target="_blank" rel="noopener">${esc(r.title)}</a>` : `<span class="title" style="${r.colour === "grey" ? "color:#5E5A50" : ""}">${esc(r.title)}</span>`;
  const kind = r.kind === "merged" ? "merged" : r.kind;
  return `<div class="row ${r.kind === "folder" ? "folder" : ""}" data-id="${esc(r.id)}">
<div class="label">${icon(kind, c)}<div class="txt"><span class="tag" style="color:${r.colour === "grey" ? "#6B665B" : c}">${esc(r.tag)}</span>${title}<span class="branch">${esc(r.branchLine)}</span><span class="who">${whoHtml(r.who)}</span></div></div>
<div class="track" data-id="${esc(r.id)}"></div>${mini(r)}
${actionHtml(r)}
${factsHtml(r)}
</div>`;
}

function headerHtml() {
  return `<div class="hdr"><div class="hint">Filled = done · ring = next · dashed words explain themselves</div><div class="stops">${STOPS.map((s, i) => `<div class="stop${i === 7 ? " live-stop" : ""}"><button type="button" aria-describedby="tip${i}">${esc(s.n)}</button><span class="cmd${s.auto ? " auto" : ""}">${esc(s.cmd)}</span><div class="tip" role="tooltip" id="tip${i}"><b>${esc(s.n)}${s.auto ? "" : ` <code>${esc(s.cmd)}</code>`}</b>${esc(s.tip)}<br><a href="${esc(s.href)}" target="_blank" rel="noopener">Read more: ${esc(s.ref)} ↗</a></div></div>`).join("")}</div><div class="you">Your move</div></div>`;
}

const dismissedKey = "gp.dismissed";
function repoCounts(repo) {
  const act = repo.rows.filter((r) => r.group !== "stale" && r.group !== "done" && r.colour !== "grey");
  const best = repo.rows.find((r) => r.best);
  if (repo.errors.includes("Not a git repository")) return { n: 0, text: "not a git repo", colour: "#8C877B" };
  if (!act.length) return { n: 0, text: repo.rows.some((r) => r.group === "stale") ? "only older work" : "all clear", colour: "#B08A2E" };
  return { n: act.length, text: `${act.length} waiting`, colour: best ? COL.green : act.some((r) => r.colour === "red") ? COL.red : COL.blue };
}

async function scene() {
  const s = await (await fetch(`/api/scene${params.get("scene") ? `?scene=${encodeURIComponent(params.get("scene"))}` : ""}`)).json();
  document.getElementById("scene-css").textContent = s.css;
  return s;
}

async function render() {
  const repo = state.repos.find((r) => r.name === current) || state.repos[0];
  current = repo.name;
  document.getElementById("repo-list").innerHTML = state.repos.map((r) => {
    const k = repoCounts(r);
    return `<button type="button" class="repo" data-repo="${esc(r.name)}" aria-current="${r.name === current}"><span class="dot" style="background:${k.colour}"></span><span><strong>${esc(r.name)}</strong><small style="color:${k.colour}">${esc(k.text)}</small></span></button>`;
  }).join("");
  document.getElementById("repo-name").textContent = repo.name;
  const p = repo.production;
  const t = (iso) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  document.getElementById("live").innerHTML = p
    ? `<div class="live"><span class="gdot"></span><span><strong>Live now:</strong> ${repo.liveUrl ? `<a href="${esc(repo.liveUrl)}" target="_blank" rel="noopener">${esc(repo.liveUrl.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>` : `<a href="${esc(p.url)}" target="_blank" rel="noopener">production deploy</a>`}</span><span class="meta">${esc(repo.main)} at <code>${esc(p.sha.slice(0, 7))}</code> · ${esc(t(p.created))}</span></div>`
    : repo.hasRemote ? `<div class="live"><span class="gdot" style="background:#D9D3C4"></span><span class="meta">No production deploys reported for this repo — the last stop is <strong>Merged</strong>.</span></div>`
    : `<div class="live"><span class="gdot" style="background:#D9D3C4"></span><span class="meta">This folder isn’t on GitHub.</span></div>`;
  document.getElementById("errors").innerHTML = repo.errors.filter((e) => e !== "Not a git repository").map((e) => `<div class="errors">${esc(e)}</div>`).join("");

  const dismissed = store.get(dismissedKey, []);
  const rows = repo.rows.filter((r) => !dismissed.includes(r.id));
  const active = rows.filter((r) => r.group !== "stale");
  const stale = rows.filter((r) => r.group === "stale");
  let html = "";
  if (!active.length) {
    const s = await scene();
    html = `<div class="allclear">${s.svg}<div class="msg"><span>Nothing waiting. Everything’s in ${esc(repo.main || "main")}${p ? " and live" : ""}.</span><span>last checked ${new Date(state.checkedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span></div></div>`;
  } else {
    html = headerHtml();
    let last = null;
    for (const r of active) {
      if (r.group !== last) { html += `<div class="group-label">${esc(GROUPS[r.group] || "")}</div>`; last = r.group; }
      html += rowHtml(r);
    }
  }
  if (stale.length) html += `<details class="stale-box"><summary>Older work (${stale.length}) — untouched for 14 days or more ›</summary>${active.length ? "" : headerHtml()}${stale.map(rowHtml).join("")}</details>`;
  document.getElementById("board").innerHTML = html;
  layout();
  document.getElementById("legend").innerHTML = `<span><span style="color:${COL.green}">●</span> Best next step</span><span><span style="color:${COL.blue}">○</span> Also reasonable</span><span><span style="color:${COL.grey}">●</span> Waiting on something earlier</span><span><span style="color:${COL.slate}">○</span> Older — decide</span><span><span style="color:${COL.red}">●</span> Needs fixing</span><span>Single line = branch · double line = pull request</span><span class="end">${repo.tidy.length ? `${repo.tidy.length} branches already in ${esc(repo.main)} (tidy-ups)` : ""}${state.bundle ? "" : " · bundle off"}</span>`;
  document.getElementById("checked").textContent = `Checked ${new Date(state.checkedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

// Draw every visible track at its column's width, and put each heading over its dot.
function layout() {
  const repo = state && state.repos.find((r) => r.name === current);
  if (!repo) return;
  const byId = new Map(repo.rows.map((r) => [r.id, r]));
  for (const el of document.querySelectorAll(".track[data-id], .mini-track[data-id]")) {
    const w = el.clientWidth, r = byId.get(el.dataset.id);
    if (!w || !r || el.dataset.w === String(w)) continue;
    el.dataset.w = w;
    el.innerHTML = el.classList.contains("track") ? track(r, w) : miniSvg(r, w);
  }
  for (const stops of document.querySelectorAll(".stops")) {
    const w = stops.clientWidth, d = Math.max(BASE_W, w), xs = stopXs(d);
    if (!w) continue;
    stops.querySelectorAll(".stop").forEach((s, i) => { s.style.left = `${(xs[i] * w) / d}px`; });
    // If neighbouring headings would touch, put every other one on a second line.
    stops.classList.remove("stagger");
    const b = [...stops.querySelectorAll(".stop button")].map((x) => x.getBoundingClientRect());
    if (b.some((r, i) => i && r.width && r.left < b[i - 1].right + 4)) stops.classList.add("stagger");
  }
}
// Redraw when the window resizes or "Older work" opens.
new ResizeObserver(() => layout()).observe(document.getElementById("board"));

async function load(refresh = false) {
  const q = new URLSearchParams();
  if (refresh) q.set("refresh", "1");
  if (bundleParam) q.set("bundle", bundleParam);
  const r = await fetch(`/api/state?${q}`);
  state = await r.json();
  await render();
}

// Actions copy the command or prompt. With actions turned on in the settings, a
// confirmed button can also run it; the server decides what is allowed.
const dlg = document.getElementById("dlg");
const meta = (n) => (document.querySelector(`meta[name="${n}"]`) || {}).content;
const actionsOn = meta("gp-actions") === "on";
const runBtn = document.getElementById("dlg-run"), copyBtn = document.getElementById("dlg-copy");
let toCopy = "", toRun = null;
document.addEventListener("click", async (e) => {
  const repoBtn = e.target.closest("[data-repo]");
  if (repoBtn) { current = repoBtn.dataset.repo; store.set("gp.repo", current); localStorage.setItem("gp.repo", current); closeRail(); return render(); }
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const repo = state.repos.find((r) => r.name === current);
  const row = repo.rows.find((r) => r.id === b.dataset.act);
  const a = row.action;
  if (a.kind === "dismiss") { store.set(dismissedKey, [...store.get(dismissedKey, []), row.id]); return render(); }
  const title = document.getElementById("dlg-title"), body = document.getElementById("dlg-body");
  toRun = actionsOn && a.kind === "copy" ? { repo: repo.name, rowId: row.id } : null;
  runBtn.hidden = !toRun; runBtn.disabled = false; runBtn.textContent = "Run it";
  copyBtn.className = toRun ? "btn" : "btn primary";
  if (a.kind === "copy") {
    title.textContent = a.label;
    toCopy = a.command;
    body.innerHTML = `<p><strong>What this will do:</strong> ${esc(row.facts ? row.facts.happens : "")}</p>${row.facts ? `<p><strong>If you don’t:</strong> ${esc(row.facts.ifNot)}</p>` : ""}<p>Run this in a terminal in <code>${esc(repo.path)}</code>:</p><pre>${esc(a.command)}</pre><p style="color:#5E5A50;font-size:13px">${toRun ? "“Run it” runs exactly this command, once, then Golden Path checks git again." : "Golden Path shows the exact command, so nothing happens without you."}</p>`;
  } else if (a.kind === "prompt") {
    title.textContent = "Hand to Claude";
    toCopy = a.prompt;
    body.innerHTML = `<p>Copy this into your AI coding tool, in a session opened in <code>${esc(repo.path)}</code>:</p><pre>${esc(a.prompt)}</pre>`;
  }
  document.getElementById("dlg-copy").textContent = "Copy";
  dlg.showModal();
});
document.getElementById("dlg-copy").addEventListener("click", async (e) => {
  try { await navigator.clipboard.writeText(toCopy); e.target.textContent = "Copied ✓"; } catch { e.target.textContent = "Select the text above to copy"; }
});
runBtn.addEventListener("click", async () => {
  if (!toRun) return;
  runBtn.disabled = true; runBtn.textContent = "Running…";
  const out = document.createElement("pre");
  try {
    const r = await fetch("/api/action", { method: "POST", headers: { "content-type": "application/json", "x-gp-token": meta("gp-token") }, body: JSON.stringify(toRun) });
    const res = r.headers.get("content-type")?.includes("json") ? await r.json() : { ok: false, output: await r.text() };
    runBtn.textContent = res.ok ? "Done ✓" : "Didn’t work";
    out.textContent = res.output;
    if (res.why) { const why = document.createElement("p"); why.className = "why"; why.textContent = res.why; document.getElementById("dlg-body").append(why); }
  } catch (e) { runBtn.textContent = "Didn’t work"; out.textContent = String(e); }
  document.getElementById("dlg-body").append(out);
  toRun = null;
  load(true);
});
document.getElementById("refresh").addEventListener("click", () => load(true));
const rail = document.getElementById("rail"), scrim = document.getElementById("scrim"), menu = document.getElementById("menu");
function closeRail() { rail.classList.remove("open"); scrim.hidden = true; menu.setAttribute("aria-expanded", "false"); }
menu.addEventListener("click", () => { rail.classList.add("open"); scrim.hidden = false; menu.setAttribute("aria-expanded", "true"); });
scrim.addEventListener("click", closeRail);
// Tap a column header on touch screens to open its explanation.
document.addEventListener("click", (e) => {
  const s = e.target.closest(".stop");
  document.querySelectorAll(".stop.open").forEach((x) => { if (x !== s) x.classList.remove("open"); });
  if (s && e.target.closest("button")) s.classList.toggle("open");
});

function start(tries = 0) { load().catch(() => { document.getElementById("board").innerHTML = `<div class="loading">Can’t reach the Golden Path server yet — trying again…</div>`; setTimeout(() => start(tries + 1), Math.min(10000, 1500 * (tries + 1))); }); }
start();
setInterval(() => { if (!document.hidden && !dlg.open) load(); }, 60_000);
