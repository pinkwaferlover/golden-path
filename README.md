# Golden Path

**A calm local page that shows what git work is waiting across your repos, and the one thing to do next, in plain words.**

Every piece of work is a row travelling along the same line to your users:

**Changed → Staged → Committed → Pushed → Pull request → Checks pass → Merged → Live**

- **Green** is the best next step. Its reasons are facts, not adjectives: no conflicts with main, all checks passed, nothing built on it.
- **Blue** means also reasonable, **grey** means waiting on something earlier, and **slate** means older work to decide on.
- Every button shows the **exact git command** it stands for, what will happen, and what happens if you don't.
- The headline says what happened today and what is waiting, in facts: "2 went live today. 1 is stuck and 1 is ready to merge."
- **Stuck** pull requests (a merge conflict or failed checks) get a banner at the top, with one button that copies a prompt for all of them, in a safe order, with the lines that clash. They are never the green step: see [docs/adr/0001](docs/adr/0001-stuck-work-is-never-the-green-step.md).
- **Details** under any branch or pull request shows what it is built on, what is built on it, which folder has it checked out, and other open work that may clash. For a conflict, it shows only the lines that clash, main's version beside the branch's, from a test merge that touches no folder or branch.
- Hover a dashed column heading to see what that git word means, with a link to *Pro Git*, GitHub Docs or Vercel Docs.
- Work already in `main` is hidden, including branches whose pull request was squash-merged.
- When nothing is waiting, you get a quiet little scene instead.

It was made for people who find git's words disorienting, and who work alongside AI coding tools that create a lot of branches.

## Run it

You need [Node.js](https://nodejs.org) 20 or newer, `git`, and the [GitHub CLI](https://cli.github.com) signed in (`gh auth login`).

```
git clone https://github.com/pinkwaferlover/golden-path
cd golden-path
cp golden-path.config.example.json golden-path.config.json   # then list your repos in it
npm start
```

Open <http://127.0.0.1:4777>. There is nothing to install: it has no dependencies.

**On your phone, privately.** With [Tailscale](https://tailscale.com) on your computer and phone, run `tailscale serve --bg 4777`, then add your computer's Tailscale name to the settings: `"extraHosts": ["my-pc.tailnet-name.ts.net"]`. Open `https://my-pc.tailnet-name.ts.net` on your phone. Only your own devices can reach it, and Golden Path still listens on this computer only.

- `npm run summary` prints one line per repo: what needs you, and a link.
- `npm test` runs the tests.

## What it does and doesn't do

- **It only reads, unless you turn actions on.** Out of the box it never commits, pushes or merges for you. Each button copies the exact command, or a ready-written prompt for Claude or another AI tool. The one thing it runs that touches your repo is `git fetch`, which refreshes your local copy of what is on GitHub. Opening a conflict's details also runs `git merge-tree`, a test merge that leaves only unused data in git's store, which git later removes by itself.
- **Actions, if you want them.** Add `"actions": true` to `golden-path.config.json` and the confirm box gains a **Run it** button. It runs only these commands, each checked against [`src/actions.mjs`](src/actions.mjs): push a branch, open a draft pull request, squash-merge a pull request, and update a pull request from main. It never force-pushes, resets, rebases or deletes. Commits stay with you or your AI tool. The server rebuilds the command from fresh git state rather than trusting the page, and it only accepts requests from its own page.
- **It stays on your computer.** The server listens on `127.0.0.1` only and refuses requests addressed to any other host. It talks to GitHub through your own `gh` login, and to nothing else.
- **It only claims what it can prove.** "Mergeable", "checks passed" and "built on #9" come straight from git and GitHub. Anything it can only guess, such as "looks like an older copy of…", says so and is never the green step.

## No AI runs inside Golden Path

- **Everything on the page is worked out the same way every time.** The facts come from `git` and `gh`: ahead and behind, mergeable, checks, deployments, and which branch is built on which. The words are fixed templates in [`src/recommend.mjs`](src/recommend.mjs). There are no calls to an AI model, and no network traffic apart from GitHub through `gh`.
- **It works for anyone using git and GitHub**, whether or not they use AI tools.
- **The "Hand to Claude" button only copies a prompt.** It is useful if you use an AI coding tool, and harmless if you don't.

## The optional bundle

Three habits for you and your AI tools make the page more useful: commit notes naming the tool and model, a draft pull request on first push, and a "Needs you" line at the end of each session. See [`bundle/`](bundle/) and the side-by-side comparison at `/compare`.

- **The bundle only changes what gets written into your commits** (`Tool:`, `Model:` and `Task:` lines), plus those two habits. Golden Path reads the lines the same fixed way it reads everything else. You can type them by hand. AI tools add them automatically when your `AGENTS.md` tells them to.
- **Without the bundle you lose only the tool, model and task** in "who made it". Some tools (Antigravity, for example) don't add a `Co-Authored-By:` line. Without the notes, their work doesn't show in "who made it", so it can look as if only the tools that do add one helped.

## Licence

**MIT with the Commons Clause.**
- You may use, copy, change and share it freely, including at work in a commercial setting.
- You may **not** sell it, or charge to host or support it, where the value comes entirely or substantially from Golden Path itself.
- There is no warranty and no liability.

Because of that one condition it is *source-available*, not "open source" as the Open Source Initiative defines it. See [LICENSE](LICENSE).

Suggestions and pull requests are welcome.
