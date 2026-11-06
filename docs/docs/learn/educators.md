---
slug: /learn/educators
id: educators
title: Educators
sidebar_label: Educators
description: "What Learn offers a teacher: a classroom setting that hides the reference solutions, a command that verifies a student's exported progress against the lesson hashes, and a printable course outline. No account, no server."
tags: [learn, lessons, educators, classroom]
---

# Educators

This page is for a teacher who runs the Learn course for a class. It gives you three tools: a setting that hides the reference solutions, a command that checks a student's exported progress file, and a printable outline of the course. All of it runs on your own computer. Learn needs no account and no server, and nothing here sends a student's data anywhere.

The two commands run from a checkout of the repository with [Bun](https://bun.sh). They read the lesson index that ships with ZPLC.

## Hide the reference solutions

1. Open the Learn home.
2. Turn on **Classroom: hide reference solutions**.

While the setting is on, the lesson panel offers no reference solution and says that the classroom setting hides it. Hints still work. The setting belongs to that computer and is off by default; turn it off in the same place.

## Check a student's progress file

1. The student opens the Learn home and chooses **Export progress**.
2. The student gives you the file.
3. You run:

```text
bun tools/ci/learn-educator.ts verify student-progress.json
```

The command prints one line per lesson, in the form `<lesson id>: <result>`, with a detail in parentheses for a mismatch. A last line says `ok` or `failed`.

| Result           | Meaning                                                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verified`       | The lesson is passed and its grade record was taken in simulation against the lesson's current scenario: same scenario id, same SHA-256, same number of assertions.       |
| `mismatch`       | The grade record was taken against another scenario, another track or another number of assertions. The detail says which.                                                  |
| `unverified`     | The lesson is passed with no grade record, as in progress migrated from the first release.                                                                                  |
| `in-progress`    | The lesson was started and not passed.                                                                                                                                       |
| `unknown-lesson` | The file names a lesson this build does not have. It is kept and ignored.                                                                                                    |

### Exit codes

| Code | When                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | No lesson is a `mismatch`.                                                                                                            |
| 1    | A lesson is a `mismatch`, the file is not a progress file, or the file cannot be read.                                                |
| 2    | The command line is wrong: no file name after `verify`, or a command other than `verify` and `outline`.                              |

Add `--strict` to make an `unverified` lesson fail too (exit 1).

:::note What the check proves
It compares the grade records with the lesson hashes. It does not defend against a student who edits the file by hand: a grade record is evidence of what ZPLC recorded on the student's computer. When the result matters, ask the student to press **Check** in front of you.
:::

## Print the course outline

```text
bun tools/ci/learn-educator.ts outline --locale es --format html > curso.html
```

The outline lists every module and, under it, every lesson in course order with its time, languages, tracks, prerequisites and objectives.

| Option     | Values                         | Default    |
| ---------- | ------------------------------ | ---------- |
| `--locale` | `en`, `es`                     | `en`       |
| `--format` | `markdown`, `html`             | `markdown` |

Another value for either option exits with code 2. The HTML page is self-contained: it has print styles, no script and no external file, so you can open it in a browser and print it.

## What there is not

There is no class roster, no shared dashboard and no automatic collection of progress. A student's progress stays in their own user-data folder until they export it.

## Evidence

Evidence level: host. `tools/ci/learn-educator.test.ts` covers the verifier and the outline. The classroom setting is covered by `src/components/LearnHomeView.test.tsx` and the Learn journey.
