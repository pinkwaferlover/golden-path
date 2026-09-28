# Clashes come from a test merge, not from a working folder

To show the lines that clash, Golden Path runs `git merge-tree --write-tree` between main and the branch. This merges in git's object store only: no folder, branch or index changes. The one side effect is unused internal data in that store, which git removes by itself later. We accepted that, instead of checking the branch out somewhere, because checking out would change files you or another session may be working in.
