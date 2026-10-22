---
slug: /development/history-rewrite
title: One-time history rewrite
sidebar_label: History rewrite
description: What the single history rewrite of decision D-05 removes, why, where the mirror of the old history lives, and how a contributor resets or re-clones an existing clone.
---

# One-time history rewrite

Decision D-05 (requirement DOC-027) rewrites the Git history once, to drop a
third-party board schematic and several build trees that were committed by
mistake. This page says what goes, why, where the old history is kept, and what
a contributor does with an existing clone.

:::caution Status
The maintainer's repository was rewritten on 2026-10-22: the baseline commit
`b379d82` is now `6b73a0c`, and 1688 commits were rewritten one for one. The
mirror of the old history and its bundle are kept on the maintainer's machine
until they are published as a read-only repository. The force-push to GitHub
has not been made yet; until it is, the commands for contributors below do not
apply.
:::

## What is removed, and why

The list lives in `tools/history/removed-paths.txt`, one path per line with its
reason. Only two kinds of content are removed.

| Path                                                                                                                     | Kind                                              | Size in history                 | Why                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `Screenshots/mb1940-n657x0q-c02-schematic.pdf`                                                                           | Third-party schematic                             | 34 MB                           | The file is not ours to redistribute.                                                                    |
| Four Zephyr build directories under `firmware/app`: `build_esp32s3`, `build_verify_esp32s3`, `build_disco`, `build_giga` | Zephyr build trees (ELF, map, libraries, objects) | about 390 MB before compression | Build outputs are never source. They were committed once and remain in the history of the `v1.5.0` tags. |
| The `build_tests` directory under `firmware/app`                                                                         | CMake configure output                            | 8 KB                            | A build directory; it is still tracked on some branches.                                                 |

Everything else stays, including the documentation images, the fixtures that
tests read, the `Screenshots/` captures and the generated site on the
`gh-pages` branch. After the rewrite the repository is about a quarter of its
size (a rehearsal on a full copy went from 213 MiB to 53 MiB on disk).

The rewrite keeps every commit: the same number of commits on every branch, the
same messages and authors, the same trees minus the paths above. Only the commit
SHAs change.

## Where the old history is

Before the rewrite, the tool makes a full mirror (`git clone --mirror`) and a
bundle (`git bundle create --all`) outside the repository, verifies that every
branch tip and the old baseline `b379d82` resolve in both, and saves the table
that maps each old commit SHA to its new SHA (`commit-map`) beside them. An
old SHA quoted in an issue, a record or the specification therefore stays
resolvable:

```bash
git clone --mirror <mirror-location> zplc-pre-rewrite.git
git -C zplc-pre-rewrite.git show b379d82
grep ^b379d82 zplc-pre-rewrite.meta/commit-map   # old SHA, then new SHA
```

The mirror is read-only history. Do not push from it.

## Reset or re-clone an existing clone

The simplest and safest way is a fresh clone:

```bash
git clone https://github.com/eduardojvieira/ZPLC.git ZPLC-new
```

To keep a clone you already have, and you have no local work that is not pushed:

```bash
git fetch --all --tags --force --prune
git checkout master
git reset --hard origin/master
git reflog expire --expire=now --all && git gc --prune=now
```

If you have local branches with work that was never pushed, move each one onto
the new history before you clean up. `<old-base>` is the old SHA of the commit
your branch started from, which your clone still has:

```bash
git rebase --onto origin/master <old-base> my-branch
```

A worktree needs no special step: after the fetch, run `git reset` (mixed) in it
if `git status` shows files as changed that you did not touch. Files from the
removed paths stay on disk as untracked files; delete them if you do not need
them.

## For the maintainer

Run the tool from the repository root, on the main checkout, after every other
branch is merged and every worktree is clean (the one tolerated change is
`.atl/skill-registry.md` in the main checkout):

```bash
tools/history/rewrite-history.sh --rehearse ~/.cache/zplc-history/rehearsal   # a copy; changes nothing real
tools/history/rewrite-history.sh --apply                                      # the real rewrite
```

`--apply` checks the pinned `git-filter-repo`, refuses a dirty worktree, an
unfinished merge or rebase and a stash, makes the mirror and the bundle under
`~/Backups/zplc-pre-rewrite-<date>`, backs up the main checkout's local files,
rewrites every branch and tag without dropping any commit, refreshes every
worktree, verifies the result and prints the push commands. It never pushes:
the force-push, and publishing the mirror, are the owner's decision.

`git-filter-repo` removes the `origin` remote by default. The tool runs it with
`--partial` so the remote and the remote-tracking branches stay as they were.

Between the rewrite and the force-push, do not run `git fetch` or `git pull`
from `origin` in the rewritten repository: the remote still holds the old
history, and a fetch brings it back into the remote-tracking branches and a pull
merges it into a local branch. Force-push first, then fetch.
