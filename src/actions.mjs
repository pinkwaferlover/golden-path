// The only commands Golden Path will ever run for you. Each one adds or merges;
// none can force, reset, rebase or delete unmerged work. Anything that doesn't
// match one of these shapes exactly is refused.

// A branch name as git allows it, minus anything a shell or a flag could use.
const B = "(?!-)[\\w./-]+";
const N = "[1-9]\\d{0,6}";
// A pull request title in double quotes: nothing a shell would expand or end early.
const T = '"([^"\\\\`$\\r\\n]{1,200})"';
export const PR_BODY = "Opened from Golden Path.";
const SHAPES = [
  new RegExp(`^git push origin ${B}$`),
  new RegExp(`^git push -u origin ${B}$`),
  new RegExp(`^git push origin ${B}:${B}$`),
  new RegExp(`^gh pr create --draft --fill --head ${B}$`),
  new RegExp(`^gh pr merge ${N} --squash$`),
  new RegExp(`^gh pr update-branch ${N}$`),
];
// gh can't --fill a branch that isn't on this computer, so those get a title given outright.
const TITLED = new RegExp(`^gh pr create --draft --head (${B}) --title ${T} --body "${PR_BODY}"$`);

// A commit subject made safe to sit inside TITLED's quotes.
export function prTitle(subject) {
  const t = String(subject || "").replace(/["\\`$\r\n]/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
  return t || null;
}

// Returns the argument list to run, or null if the command isn't allowed.
// A push may never land on main (or master): that is what pull requests are for.
export function allowed(command, { main = "main" } = {}) {
  if (typeof command !== "string") return null;
  const t = command.match(TITLED);
  if (t) return ["gh", "pr", "create", "--draft", "--head", t[1], "--title", t[2], "--body", PR_BODY];
  if (!SHAPES.some((re) => re.test(command))) return null;
  const argv = command.split(" ");
  if (argv[1] === "push") {
    const dest = argv[argv.length - 1].split(":").pop();
    if ([main, "main", "master", "HEAD"].includes(dest)) return null;
  }
  return argv;
}

// How long each kind of command may run. A push can set off the repo's own checks
// (a pre-push hook), which take minutes; the rest only talk to GitHub.
export const timeoutFor = (argv) => (argv[1] === "push" ? 15 * 60_000 : 2 * 60_000);

// The plain-words cause of a failed run, and what to do next. Null when unknown.
export function explain(output, { timedOut = false, minutes = 0, command = "" } = {}) {
  const o = String(output || "");
  if (timedOut) return `Stopped after ${minutes} minutes and nothing was changed on GitHub. Run it in a terminal in the repo folder instead: ${command}`;
  if (/GH007|email privacy/i.test(o)) return "GitHub refused: the commit has your private email address, and your GitHub settings block that. Nothing was pushed. Give the commit your no-reply address (git commit --amend --reset-author --no-edit in its folder), then run it again.";
  const failed = o.match(/^\s*✖ (?!failing tests)(.+?)(?: \([\d.]+ms\))?$/m) || o.match(/FAIL\s+(\S+\.test\.\w+)/);
  if (failed && /failed to push|hook/i.test(o)) return `The repo’s own checks failed before pushing, so nothing was pushed. First failure: ${failed[1].trim()}. Fix it (or ask Claude to), then run it again.`;
  if (/ENOENT/.test(o)) return "This computer couldn’t find git or gh. Check they are installed and on PATH, then restart Golden Path.";
  if (/non-fast-forward|fetch first|\[rejected\]/.test(o)) return "GitHub has newer commits on this branch than this computer. Pull them in first (git pull), then push again.";
  if (/could not compute title or body defaults/.test(o)) return "This branch isn’t on this computer, so gh couldn’t read its commits. Refresh: Golden Path now offers a command that names the title itself.";
  if (/pre-push hook|hook declined|husky/i.test(o)) return "The repo’s own checks (a pre-push hook) failed, so nothing was pushed. Read the output above for which check, fix it, and push again.";
  if (/already exists/.test(o) && /pull request/i.test(o)) return "A pull request for this branch already exists. Refresh to see it.";
  if (/auth|credential|401|403|not logged/i.test(o)) return "GitHub refused the sign-in. Run gh auth status in a terminal and sign in again.";
  if (/not mergeable|merge conflict/i.test(o)) return "GitHub says it can’t merge this yet. Refresh to see why.";
  if (/(protected branch|review|required status)/i.test(o)) return "The repo’s rules block this until a review or checks are done. Open it on GitHub to see what’s missing.";
  return null;
}
