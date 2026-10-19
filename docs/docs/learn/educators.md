---
slug: /learn/educators
id: educators
title: Educators
sidebar_label: Educators
description: "What Learn offers a teacher: a classroom setting that hides the reference solutions, a command that verifies a student's exported progress against the lesson hashes, and a printable course outline. No account, no server."
tags: [learn, lessons, educators, classroom]
---

# Educators

Everything on this page works on a teacher's own computer. Learn needs no account
and no server, and nothing here sends a student's data anywhere. The commands run
from a checkout of the repository with [Bun](https://bun.sh), and they read the
lesson index that ships with Studio.

## Hide the reference solutions

In the Learn home, turn on **Classroom: hide reference solutions**. While it is on,
the lesson panel offers no reference solution and says that the classroom setting
hides it. The setting is saved on that computer, is off by default, and you can turn
it off again in the same place. Hints are not affected.

## Verify a student's progress file

A student exports their progress with **Export progress** in the Learn home and
gives you the file. Check it with:

```text
bun tools/ci/learn-educator.ts verify student-progress.json
```

The command prints one line per lesson:

| Result | Meaning |
|---|---|
| `verified` | The lesson is passed, and its grade record was taken in simulation against the current scenario of the lesson: same scenario id, same SHA-256 and same number of assertions. |
| `mismatch` | The grade record was taken against another scenario, another track or another number of assertions. The line says which. |
| `unverified` | The lesson is passed without a grade record, as happens for progress migrated from the first release. |
| `in-progress` | The lesson was started and not passed. |
| `unknown-lesson` | The file names a lesson this build does not have; it is kept and ignored. |

The exit code is 0 when no lesson is a `mismatch`, 1 when one is or when the file
is not a progress file, and 2 for a wrong command line. Add `--strict` to also fail
on `unverified` lessons.

This is a consistency check against the lesson hashes, not a defence against a
student who edits the file by hand: a grade record is evidence of what Studio
recorded on the student's computer. Ask for a live **Check** when it matters.

## Print the course outline

```text
bun tools/ci/learn-educator.ts outline --locale es --format html > curso.html
```

The outline lists every module and, under it, every lesson in course order with
its time, languages, tracks, what it requires and its objectives. `--locale` is
`en` or `es`; `--format` is `markdown` (the default) or `html`. The HTML page is
self-contained, with print styles, no script and no external file: open it in a
browser and print it.

## What this does not do

There is no class roster, no shared dashboard and no automatic collection of
progress. A student's progress stays in their own user-data folder until they
export it.

Evidence level: host. `tools/ci/learn-educator.test.ts` covers the verifier and the
outline; the classroom setting is covered by `src/components/LearnHomeView.test.tsx`
and the Learn journey.
