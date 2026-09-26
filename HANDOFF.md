# Handoff: make the suggested next step actually work

**Goal:** getting the backlog to zero. The green step Golden Path suggests must succeed when run. At the moment the first suggestion often fails with an error.

**Rule for this work** (from the README): *only claim what you can prove.* If Golden Path can't prove a step will work, the row mustn't be green. It should say plainly what is blocking and offer a working command or a ready "Hand to Claude" prompt.

This session runs on the user's own computer so it can see the real repos, their `golden-path.config.json`, and `gh` signed in.

## Step 1: collect the real errors (do this before changing any code)

1. `npm start`, open http://127.0.0.1:4777, and go through each repo in the config.
2. For each green row (and any blue row the user tries), note:
   - the repo, the row's tag and button label, and the exact command,
   - what happened when it ran: the "Didn't work" output, or the terminal output after running the command by hand in the repo folder.
3. For each failure, also save the git/GitHub state that explains it:
   - `git status -sb`, `git rev-list --left-right --count origin/<branch>...<branch>`
   - `gh pr list --head <branch> --state all --json number,state,headRefName,mergeable,mergeStateStatus,reviewDecision`
   - `gh pr view <n> --json mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,isDraft`
4. Write each case into a table in this file: *row → command → error → cause*.

### Findings (2026-09-26)

Collected with `recommend()` on fresh state for all four configured repos. No step was actually run. `gh pr create --dry-run` and `git push --dry-run` gave the outcome; `gh pr view` gave merge state. gh 2.67.0 on Windows.

| Repo | Row (tag · button) | Command | What happens | Cause |
|---|---|---|---|---|
| wealthflow | BRANCH · NO PULL REQUEST · Open a draft PR (`claude/brand-name-definition-t4tleg`) | `gh pr create --draft --fill --head claude/brand-name-definition-t4tleg` | **Fails:** `could not compute title or body defaults: failed to run git: fatal: ambiguous argument 'origin/main...claude/brand-name-definition-t4tleg'` | Branch exists only on GitHub (`refs/remotes/origin/…`, no local branch). `--fill` reads commits from the *local* branch name. |
| wealthflow | same · `claude/ecstatic-cannon-67atq8` | `gh pr create --draft --fill --head …` | **Fails**, same error | Same: GitHub-only branch |
| wealthflow | same · `claude/haircare-market-research-dhq5ky` | `gh pr create --draft --fill --head …` | **Fails**, same error | Same: GitHub-only branch |
| agent-ketchum | same · `claude/ecstatic-cannon-67atq8` (**the green row**) | `gh pr create --draft --fill --head …` | **Fails**, same error | Same: GitHub-only branch. It's the repo's only candidate, so the green step fails. |
| wealthflow | same · `claude/agi-off-settings-170wqx` | `gh pr create --draft --fill --head …` | Works, but the title is the branch name `claude/agi off settings 170wqx` | 20 commits. With more than one commit, `--fill` uses the branch name as the title. |
| wealthflow | same · `claude/plan-to-atoms-…`, `claude/quirky-hodgkin-…` | `gh pr create --draft --fill --head …` | Works (1 commit each, good title) | |
| golden-path | same · `claude/ollama-local-llm-helper-1rz8ok` | `gh pr create --draft --fill --head …` | Works | |
| wealthflow | BRANCH · ONLY ON THIS COMPUTER · Push 1 commit (**the green row**) | `git push -u origin session/ade-test-side-effects` | By hand: succeeds after wealthflow's **pre-push hook** runs typecheck + lint + ~860 tests, **182 s** in total. **Via Run it: fails.** It's killed at 120 s mid-hook, so nothing is pushed and the output is cut off. | Run it's `execFile` timeout is 120 s. Also, the hook checks the folder Golden Path runs in (`C:/Users/Adam/code/wealthflow`, on another branch with 5 uncommitted files), not the branch being pushed. |
| wealthflow | PULL REQUEST #18 · Merge into main | `gh pr merge 18 --squash` | Expected to work: `MERGEABLE`, `CLEAN`, 3/3 checks passed, squash allowed, viewer ADMIN | Nothing confirmed. Branch protection is unavailable on this plan (private repo, HTTP 403), so review/check rules can't block it today. |

**Fixed (same day):**
- Draft PRs for branches that are only on GitHub, or that have several commits, now name the title outright: `gh pr create --draft --head <b> --title "<newest commit subject>" --body "Opened from Golden Path."`. The title is stripped of `" \ $ \`` and parsed into exact arguments by `allowed()`. All 8 draft rows across the repos now pass `--dry-run`.
- Pushes get 15 minutes (other commands 2) and run from the branch's own worktree when it has one.
- A failed Run it returns a plain-words `why` (timeout, gh/git missing, rejected push, pre-push hook, auth, …), shown above the raw output.
- #18 was merged by hand and worked.

Not seen in these repos: closed PRs under the same head name (none for any candidate), non-fast-forward pushes, `update-branch` rows.

Don't guess at fixes before the table exists. The point is to fix what really fails.

## Step 2: likely causes to check against

From reading the code, and not yet confirmed:

| Suggested step | Possible failure | Missing check | Where |
|---|---|---|---|
| Push (`git push origin <b>`) | Rejected (non-fast-forward): GitHub has commits this computer doesn't | `unpushed` is counted only one way. Behind-remote is ignored | `src/collect.mjs` (branch state), `src/recommend.mjs` push block (~line 214) |
| Push `<b>:<upstream>` | Upstream name clashes with or tracks a different branch | Upstream handling | `recommend.mjs` `pushCmd` |
| `gh pr create --draft --fill --head <b>` | A pull request already exists (closed or under an alias). `--fill` fails with no commits or a bad title. Needs `--base` | Only *open* pull requests are matched by head name | `recommend.mjs` "Pushed, no pull request" block |
| `gh pr merge <n> --squash` | Blocked by branch protection (required review or checks), or squash merges not allowed on the repo | `mergeStateStatus` / `reviewDecision` are not fetched. Only `mergeable` is used | `collect.mjs` `gh pr list --json` fields, `recommend.mjs` merge branch |
| `gh pr update-branch <n>` | Conflict, or no permission | `mergeable` is `UNKNOWN` just after a push | `recommend.mjs` |
| Run it (any) | 2-minute timeout, `gh` not found on PATH (Windows), or auth prompt waiting for input | `server.mjs` `run()` | `server.mjs` |

## Step 3: fix each confirmed cause

For each confirmed cause:
1. **Gather the missing fact** in `src/collect.mjs`, for example `mergeStateStatus` and `reviewDecision`, commits on GitHub that this computer doesn't have, or pull requests for this branch in any state.
2. **Make the row honest** in `src/recommend.mjs`:
   - If the step can't work, it isn't `greenable`, so the next working row becomes green.
   - Show a plain-words note that says why ("Needs a review before it can merge", "GitHub has 2 newer commits — pull first").
   - Offer a working action: an allowed command, a link, or a `prompt` for Claude.
3. **Add any new command** to the allow-list in `src/actions.mjs`, only if it adds or merges (never force, reset, rebase or delete), and test it in `test/actions.test.mjs`.
4. **Add a test** in `test/recommend.test.mjs` that builds the failing state and checks that the row isn't green and has the right note and action.
5. **Improve failure output:** when Run it fails, show the plain-words cause and the next step, not just the raw output.

Then run `npm test` and re-check with the real repos that the green step now runs cleanly.

## Step 4: done when

- On each configured repo, pressing the green step works, and the next green step also works, down to zero or to a row that honestly says it waits on a person.
- Every failure found in Step 1 has a test.
- The README's "What it does and doesn't do" is still true. Update it if new facts or commands are added.

## Access this session needs

- The repos listed in `golden-path.config.json`, on the user's disk.
- `gh auth status` signed in with permission to push, open pull requests and merge on those repos.
- Node 20+. There are no npm dependencies.
- Branch: `claude/ollama-local-llm-helper-1rz8ok`, or start a new one from `main`. Never push to `main`.

## Parked, for later

A local-model helper (Ollama on a 10GB RTX 3080). It would write commit and pull request text and explain errors, while a script does the git work. Fixes would still go to cloud Claude. Not started. Only worth building once the steps above work reliably.
