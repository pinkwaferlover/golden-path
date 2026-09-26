// The only commands Golden Path will ever run for you. Each one adds or merges;
// none can force, reset, rebase or delete unmerged work. Anything that doesn't
// match one of these shapes exactly is refused.

// A branch name as git allows it, minus anything a shell or a flag could use.
const B = "(?!-)[\\w./-]+";
const N = "[1-9]\\d{0,6}";
const SHAPES = [
  new RegExp(`^git push origin ${B}$`),
  new RegExp(`^git push -u origin ${B}$`),
  new RegExp(`^git push origin ${B}:${B}$`),
  new RegExp(`^gh pr create --draft --fill --head ${B}$`),
  new RegExp(`^gh pr merge ${N} --squash$`),
  new RegExp(`^gh pr update-branch ${N}$`),
];

// Returns the argument list to run, or null if the command isn't allowed.
// A push may never land on main (or master): that is what pull requests are for.
export function allowed(command, { main = "main" } = {}) {
  if (typeof command !== "string" || !SHAPES.some((re) => re.test(command))) return null;
  const argv = command.split(" ");
  if (argv[1] === "push") {
    const dest = argv[argv.length - 1].split(":").pop();
    if ([main, "main", "master", "HEAD"].includes(dest)) return null;
  }
  return argv;
}
