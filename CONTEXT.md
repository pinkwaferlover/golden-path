# Golden Path

A calm local page that shows what git work is waiting across your repos, and the one best thing to do next.

## Language

**Row**:
One piece of work (a folder with changes, a branch, or a pull request) shown travelling along the line to live.
_Avoid_: item, card, entry

**Stop**:
One of the eight points on the line: Changed, Staged, Committed, Pushed, Pull request, Checks pass, Merged, Live.
_Avoid_: stage, step, column

**Green step**:
The single row per repo that the page recommends doing next. Only something git or GitHub can prove is safe may be the green step.
_Avoid_: best row, top pick

**Stuck**:
A pull request that cannot move on without a fix: a merge conflict, a failed check, or a failed deploy.
_Avoid_: broken, blocked, failing

**Waiting**:
A row that is built on another piece of work that must go first.
_Avoid_: blocked, dependent

**Older work**:
A row untouched for 14 days or more, left for you to decide on.
_Avoid_: stale, abandoned

**Done today**:
Pull requests merged in the last day, shown as one line you can open.
_Avoid_: recent, shipped

**Stuck banner**:
The line above the board that counts stuck pull requests and hands them all to Claude at once.
_Avoid_: alert, warning bar

**Details**:
The panel that opens under a row, showing what else touches it and, when it is stuck, the lines that clash.
_Avoid_: drawer, inspector

**Clash**:
A place where main and a branch changed the same lines, found by a test merge that touches no folder or branch.
_Avoid_: conflict hunk, merge error

**May clash**:
Another open branch that changes some of the same files. It is a guess, not a proof, so it is always worded as one.
_Avoid_: will conflict, overlaps
