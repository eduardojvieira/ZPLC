---
slug: /ide/find-and-references
id: find-and-references
title: Search, Find All References and the Place of a Document
sidebar_label: Search and references
description: How ZPLC searches the five languages, lists the references of a variable or an I/O address, and moves back and forward through the places you visited.
tags: [ide, user-guide]
---

# Search, find all references and the place of a document

ZPLC finds things in a project three ways: **Search** finds text, **Find all references** lists where a name or an I/O address is used, and **Go back** and **Go forward** return to the places you visited. All three work across the five languages, the I/O mapping and the Watch table.

## Search in the project

Choose **Search** in the activity rail, or press `Ctrl+Shift+F` (**Search in the project**). Search reads the text of the Structured Text and Instruction List files, and the names, variables, comments and expressions of the Ladder, Function Block Diagram and Sequential Function Chart diagrams, with the changes that are not saved. Matching case is an option. The matches are listed by file, each with its place in words, for example "LD rung 'rung_1', cell 0,0" or "Variable table, row 'StartPB'".

Choosing a match opens its file there. In a text file the cursor goes to the line; in a diagram the element is selected, as when you open a problem. With no match the view says how many files it searched.

## Find all references and Go to definition

**Find all references** (`Shift+F12`) lists every use of a variable, a function block instance or an I/O address. **Go to definition** (`F12`) opens the place where it is declared. Both take their target in this order:

1. the element selected in a diagram; when the element carries several names, ZPLC asks "Which name?";
2. the name under the cursor of the open text editor, where `F12` and `Shift+F12` run the same commands;
3. otherwise a notice says that nothing is selected and what to select.

Each row of the I/O mapping and each row of the Watch table also has a **Find references** button.

The references open in the **References** mode of the Search view, which has two modes, **Search** and **References**. The list starts with a line such as "References to Start: 4 uses in 4 files" and groups the uses by file. Each use says:

| Part     | Values                                                                                                     |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Language | ST, IL, LD, FBD, SFC, I/O mapping, Watch table or Test scenario                                            |
| Place    | A line, a rung, a block, a transition, a row of the I/O mapping or of the Watch table, or a step of a test |
| Role     | Declaration, Write, Use, or Address for the address a variable is mapped to                                |

Choosing a use opens it, with the element selected in a diagram. A name the project does not declare is reported as such, and a name with no use says "No uses of" and the name. A very long list shows the first uses and says so.

## I/O addresses

An I/O point can be written more than one way. Find all references reads every way as the same point, so the references of one form list the others:

| Written as        | Read as                                                      |
| ----------------- | ------------------------------------------------------------ |
| `%IX0.0`, `%I0.0` | Input bit 0 of byte 0. The `X` is optional for a bit.        |
| `%QX1.7`          | Output bit 7 of byte 1. A bit number above 7 is no address.  |
| `%IB0`            | Input byte 0, 8 bits.                                        |
| `%IW1`            | Input word 1: bytes 2 and 3, 16 bits.                        |
| `%MD2`, `%ML1`    | A double word (32 bits) and a long word (64 bits) of memory. |

The areas are `I` (inputs), `Q` (outputs) and `M` (memory). An address that overlaps another one is not matched with it: `%IB0` does not find `%IX0.0`, although that bit is part of the byte.

## Back, Forward and the place of the document

**Go back** (`Alt+Left`) and **Go forward** (`Alt+Right`) move through the places you visited: a file and the position in it, however you arrived there (a tab, the navigator, a problem, a search result or a reference). The last 50 places are kept.

Above a document that belongs to the project, the place bar shows where it sits among the PLC objects: the project, its group and the object. Each step is a button that shows that group in the navigator. The review of a change, Preferences, Project settings and the plant document have no place bar.

## What is verified

Evidence level: simulation on this computer. `packages/zplc-ide/src/shell/projectSearch.test.ts`, `packages/zplc-ide/src/refs/addresses.test.ts`, `packages/zplc-ide/src/refs/referenceIndex.test.ts`, `packages/zplc-ide/src/refs/ReferencesPanel.dom.test.tsx` and `packages/zplc-ide/src/components/PlaceBar.dom.test.tsx` cover the search, the addresses, the index, the list and the place bar. Journeys of `bun run test:journeys` search and list the references of a variable used in a rung, a block and a transition in the real application, open each of them, go to its definition and go back and forward with the keyboard. The window was measured on Linux only.
