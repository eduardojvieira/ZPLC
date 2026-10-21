---
slug: /development/code-style
title: Code style and line length
sidebar_label: Code style
description: The formatter of each language, its pinned version, the 140-column limit and what the limit does not cover, with the numbers that chose it.
---

# Code style and line length

ZPLC has one formatter for each language, and CI refuses a change that is not
formatted or that has a hand-written source line over the limit (VF-017). This
page records what is configured, why, and the decisions a contributor meets.

## The commands

| Command                     | What it does                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `bun run format`            | Writes the layout of every tracked file the formatters own                                 |
| `bun run format:check`      | Checks it without writing, then runs the line-length guard; this is the `format` job of CI |
| `bun run check:line-length` | Only the guard: lists every hand-written source line over the limit                        |

`format` is a fixed point. It runs Prettier, then `tools/ci/wrap-long-lines.ts`
(which cuts what Prettier cannot), then Prettier again on the cuts, until no file
changes.

## The tools and their versions

| Language                                    | Tool                                           | Version                                                                            | Settings           |
| ------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------ |
| TypeScript, JavaScript, CSS, JSON, Markdown | Prettier (MIT)                                 | 3.9.10, an exact `devDependency` of the root `package.json` (about 10 MB unpacked) | `.prettierrc.json` |
| C and headers                               | clang-format (Apache-2.0 with LLVM exceptions) | 23.1.3, the PyPI wheel (about 2 MB); `pipx install clang-format==23.1.3`           | `.clang-format`    |
| Editors                                     | EditorConfig                                   |                                                                                    | `.editorconfig`    |

The output of both tools changes between versions, so the versions are exact.
`tools/ci/format.ts` refuses another clang-format. The `format` job of
`.github/workflows/ci.yml` installs the same wheel; that job is authored but has
not run on a hosted runner in this repository yet, so the first hosted run is the
proof that the install step works there.

The style is the one the code already had. TypeScript uses single quotes,
semicolons, trailing commas and two spaces, and four spaces in
`packages/zplc-compiler`. C uses the LLVM base: two spaces, attached braces, no
include sorting, and comments that are never re-flowed.

## The limit: 140 columns

The limit applies to hand-written source code: TypeScript, TSX, JavaScript, CSS, C
and headers. It is 140 and not 120 because of what each choice costs. Measured on
the 1522 guarded files (297,933 lines) before formatting:

| Lines longer than | Lines  | Share |
| ----------------- | ------ | ----- |
| 100 columns       | 33,724 | 11.3% |
| 120 columns       | 16,843 | 5.7%  |
| 140 columns       | 9,083  | 3.0%  |
| 160 columns       | 5,618  | 1.9%  |

After Prettier and clang-format, the lines that no formatter can wrap (long
strings, comments, test titles) were 4163 at 120 columns and 1476 at 140. The
wrapper cuts almost all of them, and the guard reports the rest. At 140 columns
the rest was 41 lines (regular expressions, comments with aligned columns, data
URLs), wrapped by hand.

The wrapper never changes what the code does. A string is cut at a space into
`'a ' + 'b'`, only where an argument, an initializer, an operand of `+`, a return
or an array element takes a concatenation, and never for a property name, a
module specifier, a type, a tagged template or a string shorter than 40
characters (a key). A comment is re-wrapped under the same indent, and a trailing
comment moves above its code.

## What the limit does not cover

- **Markdown prose.** Markdown is formatted with `proseWrap: preserve`, so no
  paragraph is re-wrapped, and it is not held to the limit: prose is not source
  code, and a table or a link reads better whole. Pages of `docs/` are read with
  Prettier's MDX parser, because Docusaurus compiles them as MDX; a `*/}` marker
  of a generated block would be broken by the plain Markdown parser.
- **JSON.** Formatted, and not held to the limit: a string in it cannot be
  wrapped.
- **Interface messages.** The catalogs `src/i18n/catalog/*.ts`, `en.ts` and
  `es.ts` of the IDE hold one literal per message, and `t()` reads its `{name}`
  placeholders from the literal type. A message cut in two would be a `string`
  and the check of every `t(key, { name })` call would be lost.
- **Generated files.** `.prettierignore` lists the files a generator writes whole,
  each with the generator that owns it. The generated blocks inside a hand-written
  page are protected while Prettier runs (`protect` in `tools/ci/format.ts`), and
  inside a C file they sit between `/* clang-format off */` and `/* clang-format on */`.
  The guard skips them as well.

## Changing the style

Change `.prettierrc.json` or `.clang-format` together with `LIMIT` in
`tools/ci/line-length-guard.ts` and `max_line_length` in `.editorconfig`; a test
(`tools/ci/line-length-guard.test.ts`) fails when they differ. Then run
`bun run format` and commit the result alone, as a `style:` commit.
