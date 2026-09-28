// Turns the conflict-marked text from a test merge into clashes: only the lines
// that clash, main's version beside the branch's, with a little context. Pure.

const CONTEXT = 3;

export function clashes(text, { context = CONTEXT } = {}) {
  if (typeof text !== "string") return [];
  const lines = text.split(/\r?\n/);
  const out = [];
  let shift = 0; // marker and branch-only lines so far, so "line" counts lines in main's version
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("<<<<<<< ")) continue;
    const start = i, main = [], branch = [];
    let side = main;
    for (i++; i < lines.length && !lines[i].startsWith(">>>>>>> "); i++) {
      if (lines[i].startsWith("||||||| ")) side = null; // the common ancestor, if diff3 is on: skip it
      else if (lines[i] === "=======") side = branch;
      else if (side) side.push(lines[i]);
    }
    const prevEnd = out.length ? out[out.length - 1].end : 0;
    out.push({
      line: start + 1 - shift,
      before: lines.slice(Math.max(prevEnd, start - context), start),
      main, branch,
      after: lines.slice(i + 1, i + 1 + context).filter((l) => !l.startsWith("<<<<<<< ")),
      end: i + 1,
    });
    shift += i + 1 - start - main.length;
  }
  return out.map(({ end, ...c }) => c);
}

// Plain words for the clashes of one pull request, for a prompt. Kept short enough to
// paste: long lines are cut, and past `budget` characters the rest is only counted.
export function clashText(files, { budget = 3000, width = 160 } = {}) {
  const out = [];
  let used = 0, left = 0;
  for (const f of files) {
    const cs = clashes(f.text);
    const part = !cs.length
      ? `- ${f.path}: changed in a way that can't be merged line by line (for example, deleted on one side and edited on the other)`
      : `- ${f.path}:\n${cs.map((c) => `  around line ${c.line}\n  main has:\n${indent(c.main, width)}\n  this branch has:\n${indent(c.branch, width)}`).join("\n")}`;
    if (out.length && used + part.length > budget) { left++; continue; }
    out.push(part.length > budget ? part.slice(0, budget) + "\n  …" : part);
    used += part.length;
  }
  if (left) out.push(`- and ${left} more ${left === 1 ? "file clashes" : "files clash"}. Run a test merge to see them all.`);
  return out.join("\n");
}
const indent = (ls, width) => (ls.length ? ls.slice(0, 12).map((l) => `    ${l.length > width ? l.slice(0, width) + "…" : l}`).concat(ls.length > 12 ? [`    … ${ls.length - 12} more lines`] : []).join("\n") : "    (nothing)");
