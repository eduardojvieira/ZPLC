---
title: "Keyboard reference of the visual editors"
sidebar_label: "Visual editor keys"
description: "Every key of the Ladder, Function Block Diagram and Sequential Function Chart editors, generated from the table the editors read."
tags: [reference, generated]
---

# Keyboard reference of the visual editors

{/* >>> GENERATED (tools/docs/generate_keyboard_reference.ts): reference/visual-editor-keyboard. Do not edit. >>> */}

Every editing action of the three graphical editors can be done from the keyboard: moving a cursor, inserting an element, binding a variable from the declared symbols, connecting, and deleting. The palettes can be reached with Tab and are searchable, and each editor lists its own commands with F1.

`Ctrl` is `Cmd` on macOS. A question that a key asks (the element to insert, the variable to bind, the wire to draw) is a search list: type to search, Up and Down choose, Enter takes the choice, Escape leaves. Where the list allows it, typing a name that is not in the list offers it as typed. A command that changes the document is one step of the undo history, and the selection comes back with undo and redo.

## Ladder Diagram editor

The cursor is a cell of a rung, drawn as a blue frame. Clicking a cell puts it there. Insert, bind and delete act on the cell under it.

### Moving the cursor

| Keys | What it does |
| --- | --- |
| `ArrowLeft` | Move the cursor one cell to the left |
| `ArrowRight` | Move the cursor one cell to the right |
| `ArrowUp` | Move the cursor one row up, into the rung above when it is on the first row |
| `ArrowDown` | Move the cursor one row down, into the next rung when it is on the last row |
| `Home` | Move the cursor to the first cell of the row |
| `End` | Move the cursor to the last cell of the row |
| `PageUp` | Move the cursor to the previous rung |
| `PageDown` | Move the cursor to the next rung |
| `Ctrl+Home` | Move the cursor to the first cell of the first rung |
| `Ctrl+End` | Move the cursor to the last cell of the last rung |

### Inserting elements

| Keys | What it does |
| --- | --- |
| `C` | Insert a normally open contact at the cursor and ask which variable it reads |
| `N` | Insert a normally closed contact at the cursor |
| `P` | Insert a positive transition contact at the cursor |
| `O` | Insert a coil at the cursor and ask which variable it writes |
| `S` | Insert a set coil at the cursor |
| `R` | Insert a reset coil at the cursor |
| `B` | Start a parallel branch at the cursor |
| `Insert` or `I` | Open the element palette: type to search, Up and Down to choose, Enter to insert |
| `Enter` | On an empty cell open the element palette; on an element select it and show its properties |

### Binding variables

| Keys | What it does |
| --- | --- |
| `F2` | Bind the element under the cursor to a variable chosen from the declared symbols |

### Editing

| Keys | What it does |
| --- | --- |
| `Shift+F2` | Edit the comment of the rung of the cursor |

### Structure

| Keys | What it does |
| --- | --- |
| `Ctrl+ArrowLeft` | Move the element under the cursor one cell to the left |
| `Ctrl+ArrowRight` | Move the element under the cursor one cell to the right |
| `Ctrl+ArrowUp` | Move the element under the cursor one row up |
| `Ctrl+ArrowDown` | Move the element under the cursor one row down |
| `Ctrl+Enter` | Add a rung after the rung of the cursor |
| `Ctrl+Shift+Enter` | Add an empty row to the rung of the cursor |
| `Alt+ArrowUp` | Move the rung of the cursor up |
| `Alt+ArrowDown` | Move the rung of the cursor down |
| `Alt+ArrowRight` | Widen the innermost branch at the cursor by one column |
| `Alt+ArrowLeft` | Narrow the innermost branch at the cursor by one column |
| `Shift+B` | Remove the innermost branch at the cursor |

### Deleting

| Keys | What it does |
| --- | --- |
| `Delete` or `Backspace` | Delete the element under the cursor |
| `Shift+Delete` | Delete the rung of the cursor |

### Clipboard, breakpoints and help

| Keys | What it does |
| --- | --- |
| `Ctrl+C` | Copy the selected rung |
| `Ctrl+V` | Paste the copied rung after the selected rung |
| `F9` | Set or clear the breakpoint of the selected rung |
| `F1` | List every command of the editor with its keys, searchable |
| `Escape` | Clear the selection and close the properties |

## Function Block Diagram editor

The cursor is the selected block. The arrow keys without a modifier nudge the selected block on the canvas, as the canvas does; Tab moves between the blocks in the order of the file.

### Moving the cursor

| Keys | What it does |
| --- | --- |
| `Alt+ArrowLeft` | Select the nearest block to the left of the selected block |
| `Alt+ArrowRight` | Select the nearest block to the right |
| `Alt+ArrowUp` | Select the nearest block above |
| `Alt+ArrowDown` | Select the nearest block below |
| `Home` | Select the first block, the top left one |

### Inserting elements

| Keys | What it does |
| --- | --- |
| `V` | Insert a variable block next to the selected block and ask which variable it holds |
| `K` | Insert a constant block next to the selected block and ask its value |
| `Insert` or `I` | Open the block palette: type to search, Up and Down to choose, Enter to insert next to the selected block |

### Binding variables

| Keys | What it does |
| --- | --- |
| `F2` or `Enter` | Bind the selected variable block, or name the selected function block instance, from the declared symbols; set the value of a constant |

### Connecting

| Keys | What it does |
| --- | --- |
| `C` | List the wires the selected block can have, and draw the chosen one |
| `Shift+C` | List the wires of the selected block, and remove the chosen one |

### Editing

| Keys | What it does |
| --- | --- |
| `Shift+F2` | Edit the comment of the selected block |

### Deleting

| Keys | What it does |
| --- | --- |
| `Delete` or `Backspace` | Delete the selected blocks and wires |

### Clipboard, breakpoints and help

| Keys | What it does |
| --- | --- |
| `Ctrl+C` | Copy the selected blocks and the wires between them |
| `Ctrl+V` | Paste the copied blocks |
| `F9` | Set or clear the breakpoint of the selected blocks |
| `F1` | List every command of the editor with its keys, searchable |

## Sequential Function Chart editor

The cursor is the selected step or transition. The arrow keys without a modifier nudge the selected element on the canvas, as the canvas does; Tab moves between the elements in the order of the file.

### Moving the cursor

| Keys | What it does |
| --- | --- |
| `Alt+ArrowLeft` | Select the nearest step or transition to the left of the selected one |
| `Alt+ArrowRight` | Select the nearest step or transition to the right |
| `Alt+ArrowUp` | Select the nearest step or transition above |
| `Alt+ArrowDown` | Select the nearest step or transition below |
| `Home` | Select the first element, the top left one |

### Inserting elements

| Keys | What it does |
| --- | --- |
| `S` | Insert a step below the selected element, wired to it when it is a transition |
| `Shift+S` | Insert the initial step |
| `T` | Insert a transition below the selected element, wired to it when it is a step |
| `Insert` or `I` | Open the element palette: type to search, Up and Down to choose, Enter to insert |

### Binding variables

| Keys | What it does |
| --- | --- |
| `F2` or `Enter` | Name the selected step, or set the condition of the selected transition from the declared symbols or by typing an expression |

### Connecting

| Keys | What it does |
| --- | --- |
| `C` | List the wires the selected element can have, and draw the chosen one |
| `Shift+C` | List the wires of the selected element, and remove the chosen one |

### Editing

| Keys | What it does |
| --- | --- |
| `Shift+F2` | Edit the comment of the selected element |

### Deleting

| Keys | What it does |
| --- | --- |
| `Delete` or `Backspace` | Delete the selected elements and wires |

### Clipboard, breakpoints and help

| Keys | What it does |
| --- | --- |
| `Ctrl+C` | Copy the selected steps and transitions |
| `Ctrl+V` | Paste the copied steps and transitions |
| `F9` | Set or clear the breakpoint of the selected elements |
| `F1` | List every command of the editor with its keys, searchable |

{/* <<< END GENERATED: reference/visual-editor-keyboard <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
