## Working with Golden Path

These three habits let [Golden Path](https://github.com/pinkwaferlover/golden-path) show what is waiting, who made it and what to do next.

### 1. Note the tool, model and task on every commit

End every commit message with these lines, before any `Co-Authored-By:` line:

```
Tool: <claude-code | antigravity | codex | cursor | …>
Model: <the model id, e.g. claude-sonnet-4-5>
Task: <the plan or ticket id, or T-yyyymmdd-n for ad-hoc work>
```

Never put prompt text, personal data or secrets in these lines.

### 2. Your first push opens a draft pull request

Work on your own branch. The first time you push it, open a draft pull request straight away:

```
git push -u origin <branch>
gh pr create --draft --fill
```

A draft changes nothing on `main`. It makes the work visible, runs the checks and builds a preview. Never commit on someone else's behalf, and never commit files you did not create.

### 3. End with "Needs you" when something is waiting

Before your final reply, run `npm run summary` in the Golden Path folder (or read its page). If anything needs the person, end with one line:

**Needs you:** [what, in plain words](link) · [next thing](link)

Say nothing if nothing is waiting.
