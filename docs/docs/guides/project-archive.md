---
slug: /guides/project-archive
id: project-archive
title: Export and import a project archive
sidebar_label: Project archives
description: "Move a project to another computer as one file, and open a project that someone sent you, with the checks ZPLC makes before it writes anything."
tags: [how-to, projects, archive]
---

# Export and import a project archive

A project is a folder. A project archive is that folder as one file, so that you
can send it, store it or open it on another computer, and get the same project
back byte for byte.

## Export

1. Save the modified files of the project: the archive holds the files as they are
   on disk, so ZPLC asks you to save first.
2. Open the **Build** menu of the toolbar and choose **Export Project Archive**.
3. Choose where to write the file in the system save dialog.

Output says how many files were written. The archive leaves out what the project
tree hides (`node_modules`, `.git`, `build`, `dist` and `.vscode`) and links.

An archive made on one computer is the same bytes as one made on another from the
same project: entries are sorted by path, stored without compression, dated
1980-01-01, with names in UTF-8. You can list what an archive holds with any zip
tool, or with Python on any system:

```bash
python3 -m zipfile -l my-project.zip
```

**Export Project**, next to it, writes a JSON document of the files and the
configuration without its secrets. That document is for reading; it does not import.

## Import

1. On the Welcome screen, choose **Import a project archive** and select the file.
   Nothing is written yet: a dialog says what the archive holds (its files, folders
   and size), whose project it is and, for a version 1 project, the lines that
   migrating it changes in `zplc.json`.
2. Choose **Choose a folder and import** and select an empty folder. ZPLC writes
   the files there byte for byte and opens the project.

A folder that is not empty is refused, and an import that fails leaves the folder
empty again.

## What ZPLC refuses

ZPLC reads archives that other tools wrote, stored or deflated, and refuses one
that holds an absolute path, a `..`, a name that two systems read differently, a
link, an encrypted entry, two files that differ only by case, a file that does not
match its checksum, more than 4096 files, a file over 16 MiB or more than 64 MiB in
all. Nothing from a refused archive is written.

## What is verified, and what is not

| Part | Verified | Level |
| --- | --- | --- |
| The format, the refusals, and a round trip on real folders | Unit tests of the archive reader and writer | Host |
| Export, then import into an empty folder, gives equal folders and a byte-equal `zplc.json` | Journey 30 in the real application | Host |
| An archive that a different tool wrote, stored or deflated | Unit tests with archives written by another tool | Host |

## See also

- [ZPLC workbench](../ide/features.md#project-archives): the full description.
- [Migrate a version 1 project](../ide/migration-v1-to-v2.md): what the import shows for an old project.
