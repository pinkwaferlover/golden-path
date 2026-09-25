# The optional bundle

Golden Path works on any git repo without this. The bundle is three habits for you and your AI coding tools. With them, Golden Path can tell you more. See both side by side at <http://127.0.0.1:4777/compare>.

| Habit | What you get in Golden Path | Without it |
|---|---|---|
| **Commit notes.** Every commit an AI tool makes ends with `Tool:`, `Model:` and `Task:` lines | "Who made it" names the tool, the model and the task: *[your name] · [your tool] 37, [another tool] 3 · [your model], [another model] · task [task id]* | Only the commit author, plus any `Co-Authored-By:` line a tool adds by itself |
| **First push opens a draft pull request** | Work in progress appears early, with its checks and preview site | Work appears only when someone remembers to open a pull request |
| **"Needs you" at the end of each AI session** | The session ends with links straight to the next thing to do, from `npm run summary` | You open Golden Path yourself to find out |

## Installing it

1. **The instructions for your AI tools.** Copy [`AGENTS.snippet.md`](AGENTS.snippet.md) into your repo's `AGENTS.md` or `CLAUDE.md`. Claude Code, Antigravity, Codex and Cursor all read one of these.
2. **The commit-note reminder (optional).** Copy [`hooks/commit-msg`](hooks/commit-msg) into `.git/hooks/commit-msg` and make it executable. It **warns** when a commit has no `Tool:` line. It never blocks a commit.
3. **Turn it on.** In `golden-path.config.json`, `"bundle": true` (the default) reads the notes. `"bundle": false` ignores them.

Nothing in the bundle sends data anywhere. The notes are plain text in your own commits.
