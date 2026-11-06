# Text and Visual Editors

ZPLC edits all five languages in one workbench. Structured Text and Instruction List are text. Ladder, Function Block Diagram and Sequential Function Chart are visual models, and each keeps its own model. This page covers what the editors share: the language service, the palettes, the keyboard, undo, diagnostics, breakpoints and online values. To learn to write in a language, use its guide: [Structured Text](../languages/st.md), [Instruction List](../languages/il.md), [Ladder Diagram](../languages/ld.md), [Function Block Diagram](../languages/fbd.md) or [Sequential Function Chart](../languages/sfc.md).

| Language | Editor | Boundary |
| --- | --- | --- |
| ST | The primary text editor, with diagnostics and source navigation. | The supported IEC subset is the compiler contract. |
| IL | A text editor. | What it accepts depends on the compiler subset. |
| LD | Rungs, contacts, coils, branches, undo and visual validation. | The generated ST is read-only output. |
| FBD | Typed ports, blocks, connections, undo and visual validation. | The generated ST is read-only output. |
| SFC | Steps, transitions, actions, undo and visual validation. | The generated ST is read-only output. |

Visual models are validated and translated before the canonical compilation ([Compiler workflow](./compiler.md)). A shared backend does not give every language the same features or the same debugging, so build and run the project to learn what you get.

## The Structured Text language service

The Structured Text editor reads the whole project, not only the file in front of you (LNG-015, LNG-016).

| Feature | What it does |
| --- | --- |
| Diagnostics | Every syntax and semantic error of every Structured Text file of the project, while you type (after a pause of 0.3 s), with the range the compiler's own front end gave. They appear as squiggles in the open files and in **Problems**, and go away the next time the project is checked and the error is gone. They are not build evidence; **Build** is. |
| Completion | The variables, parameters and methods in scope; after a dot, the members of the type of what is before it; the blocks, functions and types of every file; the parameters of a call as `Name := `. Project names come before the standard library. |
| Hover | What a name is, its type and where it is declared, also in another file. |
| Go to definition, find references | Across the files of the project. A name is found by what it is, not by its spelling: `Count` of one program is not `Count` of another. |
| Outline | The declarations of the file as a tree. |
| Signature help | The parameters of the function, method or block being called, and the one the cursor is at, also when the arguments are named. |
| Rename symbol (`F2`) | Renames what a name stands for in every file of the project, by scope and by type, never as text. It is refused, with the reason, when the new name is already declared where the old one is used, when a file of the project has a syntax error, when the name is mentioned in a Ladder, FBD, SFC or IL file (rename it there too), or when the name is a program, because the tasks of `zplc.json` run it by name. The changed files open as modified tabs; you save them. |
| Format document (`Shift+Alt+F`) | Indents each line by the depth of its blocks and trims the ends of lines. It changes only white space at the start and end of a line: no line is added or removed, no token moves, and a comment is left as written. Formatting twice gives the same text. |

Each feature is answered from one index of the project, built from the compiler's lexer and parser, with the text of the editor in place of its file. A file that does not parse yet still contributes the declarations its tokens give, so completion works in the middle of a line.

Not covered: a name used only in a Ladder, FBD, SFC or IL file is not part of the index; workspace-wide symbol search; code actions.

Evidence level: host. `packages/zplc-compiler/src/compiler/check.test.ts` runs the diagnostics against the build's errors for the same projects, the tests under `packages/zplc-ide/src/langsvc/` cover the index, rename, completion, signature help, outline and formatting (over every example project, token for token), and journey 4c of `bun run test:journeys` types an undeclared variable in the real editor and sees it with its range.

## Project blocks in the palettes

The block palette of Function Block Diagram and Ladder shows, besides the standard blocks, a **Project** group with the function blocks and functions that the Structured Text files of the project declare (LNG-008). A block of the group has the ports of its declaration: for a function block, its `VAR_INPUT` and `VAR_IN_OUT` are inputs and its `VAR_OUTPUT` are outputs, and for a function the inputs are the inputs and the result is the output `OUT`. The generated Structured Text calls the block with named arguments, so the order in which you wire the inputs does not matter.

- **Function Block Diagram** places both function blocks (with an instance name) and functions. A function whose result nothing uses is still called.
- **Ladder** places function blocks in a rung, like a timer: the element names the type and the instance, and the parameters name the inputs of the declaration. A function is not placed in a rung; call it from a Function Block Diagram or from Structured Text.
- A block that no file declares is refused by name when the diagram is built. A declaration in the project wins over a standard block of the same name, as in the compiler.
- The palette lists the blocks of the Structured Text files in `src`, of the files in a library folder (see [Declarations and library folders](./features.md#declarations-and-library-folders)), and of any file open in the editor. The build reads the files in `src` and directly in the library folders that `libraries` of `zplc.json` lists.

## What the palettes offer

A palette offers only what its translator translates (LNG-007), and every element it offers is run in the test suite: placed in a program, built, loaded into the virtual machine and scanned.

- **Ladder** offers four contacts (normally open, normally closed, rising and falling edge), six coils (normal, negated, set, reset, rising and falling edge), the branch, the function blocks of the library and of the project, and the fifteen IEC function boxes of the **Functions** group. The communication blocks `COMM_CONNECT`, `COMM_PUBLISH`, `COMM_SUBSCRIBE` and `COMM_MODBUS` are not offered: no Ladder file can declare an instance of them.
- **Function Block Diagram** offers the gates, the comparisons, `ADD`, `SUB`, `MUL`, `DIV`, `MOD`, `ABS`, `MAX`, `MIN`, `LIMIT` and `SEL`, the function blocks of the library and of the project, and the blocks that carry a value (`constant`, `variable`, `input`, `output`). The functions of the library (`SQRT`, `SIN`, `LEN`, `CONCAT`, the conversions) are not offered: a diagram cannot call them, and the build refuses them by name.
- **Sequential Function Chart** offers the step, the initial step and the transition.

## Visual files on disk

A Ladder, FBD or SFC file is JSON. ZPLC checks it against the shape its editor reads when you open it (LNG-011). A file that is not JSON, or that is JSON of another shape, shows an error panel that names the file and its first five violations by path (`rungs[0].grid[1][2].element.type: ...`), counts the rest, and leaves the window and every other tab as they were. Correct the file and open it again; the build refuses the same file for the same reason.

Opening a visual file and saving it without a change leaves it byte for byte as it was (LNG-014), whatever layout it was written in. A change that ends where it started, such as dragging an element away and back, does not rewrite the file either. The first real edit writes the whole file in the one form ZPLC uses: two-space JSON with a newline at the end.

## Editing from the keyboard

Every editing action of the Ladder, Function Block Diagram and Sequential Function Chart editors can be done from the keyboard (LNG-012): moving a cursor, inserting an element, binding a variable from the declared symbols, connecting and deleting. The [keyboard reference](../reference/visual-editor-keyboard.md) lists every key. It is generated from the table the editors read their keys from, so a key that is in it works, and a key that works is in it.

- **The cursor.** In Ladder it is a cell of a rung, drawn as a blue frame; a click on a cell puts it there. In the function block and chart editors it is the selected block or element, and `Alt` with an arrow key moves it to the nearest one in that direction. The arrow keys without `Alt` nudge the selected block on the canvas.
- **Inserting.** A letter inserts the common elements at the cursor: `C` a contact, `N` an inverted contact and `O` a coil in Ladder, `T` a transition and `S` a step in a chart. `Insert` or `I` opens the palette as a search list: type to search, Up and Down choose, Enter inserts. The toolbox is reached with Tab, its items are buttons that insert at the cursor, and it has a search box. Dragging an item still works and inserts through the same command as the key.
- **Binding.** `F2` asks for the variable of the element under the cursor from the list of symbols the file declares. A contact is offered the `BOOL` variables and the `BOOL` outputs of declared blocks (`Delay.Q`); a coil the `BOOL` variables that are not inputs; the instance of a function block the variables of its type; the condition of a transition the `BOOL` variables. Where a list allows it, a name that is not declared can be typed and is offered as typed.
- **Connecting.** `C` on a block lists the wires it can have, each from an output to an input that takes it; the pin type rules apply, and an input that already has a wire is not offered. `Shift+C` lists the wires of the block and removes the one chosen. In a chart, `T` inserts a transition below the selected step and `S` a step below the selected transition, each wired to the one it follows.
- **Deleting.** `Delete` removes the element under the cursor in Ladder, and the selected blocks and wires in a diagram or a chart, with the wires that were on a block.

A command that changes the file is one step of the undo history, and what each command did, or why it refused, is written to a polite live region that a screen reader reads. A contact or coil dropped from the toolbox is unbound and shows `???` until it is bound. A function block dropped or inserted gets an instance name that nothing else has, and the instance is declared as a local variable of its type. The properties panel of Ladder opens when an element is clicked or Enter is pressed on it, and a double click on a block of a function block diagram asks what the block holds, as `F2` does.

Evidence level: host, and the real application on the development host. The tests `packages/zplc-ide/src/editors/ld/keyboard.test.ts`, `packages/zplc-ide/src/editors/fbd/keyboard.test.ts` and `packages/zplc-ide/src/editors/sfc/keyboard.test.ts` press keys on a model and check the document, the cursor, the lists offered and that the build reads what was typed, and journeys 28f, 28g and 28h of `bun run test:journeys` build a rung, edit a diagram and edit a chart with real key events. Not covered: a real screen reader (the live region is tested, not its speech), and a keyboard way to place a block at an exact coordinate.

## Undo, redo and selection

One gesture of yours is one undo step (LNG-010): a drag, a paste, a delete (the nodes and the wires that went with them), a drop from the palette, a wire drawn, or an edit of a name or a condition. A drag of 300 pixels reaches the canvas as about thirty position changes, but the file is written, and the history gets an entry, once, when you put the node down. Letters typed into one field within a second of each other are one step. The history keeps the last 100 gestures of each file for the session; the Undo and Redo buttons, `Ctrl+Z` and `Ctrl+Shift+Z` (`Ctrl+Y`) use it.

The selection is not part of the file, and it survives the edit. Undo and redo give the selection back with the content: undoing a delete puts the deleted blocks back and selects them, and undoing a paste selects what was selected before the paste.

Evidence level: host. `packages/zplc-ide/src/editors/gesture.test.ts` and `packages/zplc-ide/src/editors/visualHistory.test.ts` cover the commit rule, the coalescing and the selection of each step, and journey 28j of `bun run test:journeys` drags a block with real pointer events and takes the whole drag back with one `Ctrl+Z`.

## Pin types in FBD

The Function Block Diagram canvas refuses a wire between pins whose types do not match, and says why in a message over the canvas (LNG-013). The rules are the ones the compiler applies to an assignment: integers, bit strings and `REAL` are one family of numbers (an integer goes into a `REAL` or an `LREAL`, a `REAL` and an `LREAL` go into each other with the build warning when an `LREAL` is narrowed, and a `REAL` never goes into an integer), and `BOOL`, `TIME`, `DATE`, `TOD`, `DT` and the strings take only their own type. A variable block has the type its variable is declared with and a constant the type it is written as (`T#2s` is a `TIME`, `0.5` a `REAL`); a pin declared `ANY` is not judged. A `BOOL` output therefore cannot feed a numeric input, a `REAL` cannot feed a `BOOL` or an integer input, and a number cannot feed a `TIME` input; convert it with a conversion function such as `REAL_TO_INT` first. An input has one source, so a second wire into it is refused, and a wire may be started at either end.

## Fit, zoom and alignment

Ladder, FBD and SFC share these gestures (UX-033). Every one is a command of the key table, so it is also in the command list (`F1`) of the editor, and each says what it did through the shared announcer.

- **Fit to view** (`Ctrl+Alt+0`, or the Fit to view button). FBD and SFC fit the whole diagram in the window with a margin and never zoom in past 100%. Ladder has no zoom: its rungs already use the width of the view, so fit shows every rung from its left edge.
- **Zoom range.** FBD and SFC zoom from 10% to 400%. At 10% a diagram nine times wider than the window is still whole on the screen; at 400% a pin is as large as a button.
- **Alignment and distribution** in FBD and SFC, on the selected blocks, steps and transitions: left (`Alt+Shift+Left`), right (`Alt+Shift+Right`), top (`Alt+Shift+Up`), bottom (`Alt+Shift+Down`), centre on a vertical line (`Alt+Shift+H`), centre on a horizontal line (`Alt+Shift+V`), and an even gap between three or more elements, from left to right (`Ctrl+Alt+Shift+H`) or from top to bottom (`Ctrl+Alt+Shift+V`). One command is one undo step. Aligning needs two selected elements and distributing needs three; with fewer, the command changes nothing and says why.
- **Context menus** on the canvas, on a block, step or transition, on a wire, and on a Ladder rung. Right click, the context-menu key or `Shift+F10` opens the menu of what has the focus, and the element is selected first. Each item shows the key of the same command in the key table. An item that cannot run is shown disabled with its reason under its name, for example "Select at least two elements to align them". A function block also offers the instance monitor in its menu.
- **Ladder rungs use the width of the view.** A rung is as wide as the view when the view is wider than its content; when the content is wider, the rung scrolls sideways, and only then.

Evidence level: host. `packages/zplc-ide/src/editors/arrange.test.ts`, `packages/zplc-ide/src/editors/viewBounds.test.ts` and `packages/zplc-ide/src/editors/contextMenus.test.ts` check the arithmetic, the range and the menu items, and journey 51c measures a rung against its view, fits and zooms with the real buttons and opens menus with `Shift+F10`. Aligning two selected elements is checked by the tests of the commands and not by a journey.

## Where a diagnostic points

A diagnostic of a visual or IL file names the element it is about (LNG-003, LNG-026), not a line of the generated Structured Text that you never wrote. The build reports it in the `element` field next to `path`, and the Problems panel selects it when you activate the problem:

| Language | Element | Selected |
| --- | --- | --- |
| IL | `line:12`, a line of the IL source. A finding about the generated code is put on the IL line it came from. | The line. |
| LD | `rung:rung_1`, or `rung:rung_1/cell:0,3` for the cell at row 0, column 3 (`rung:rung_1/element:c1` for a rung stored as a list of elements). | The rung and the element in the cell, scrolled into view. |
| FBD | `block:and_1`, or `connection:w3` for a wire. A block that only reads a variable or holds a constant has no statement: a finding about its name is on the block that is written with it. | The block or the wire. |
| SFC | `step:s1`, `transition:t1` (its condition) and `action:a1` (its body). | The step or the transition; an action is shown on the first step that uses it. |

The line and column of a diagram diagnostic stay those of the generated Structured Text, and the message says so. A diagram that is not valid yields one diagnostic for each element that is wrong, not one for the whole file. The element travels with the diagnostic from the build to the Problems panel, so the problem selects the element the build named even when the file in the editor has changed since the build ran.

Evidence level: host. `packages/zplc-ide/src/editors/diagnosticElement.test.ts` covers the choice between the carried element and the open file, and journey 25 of `bun run test:journeys` puts the wire back on disk after a failed build and still gets the block the build named.

## Breakpoints on a diagram

A breakpoint can be set on the element of the diagram or the IL line you edited (LNG-004). The debug map relates each instruction range to that element, and the runtime stops at the first instruction of it. Like the dot on a line of a text file, it can be set before the program is loaded and is armed when Run or Deploy loads it.

| Language | Where | How |
| --- | --- | --- |
| IL | The IL line. The map states lines of the IL source, as a text editor expects. | The gutter of the editor. |
| LD | The rung: the first statement of its code. | The dot at the left of the rung, or `F9` on the selected rung. |
| FBD | The block: the first statement it generates. A constant or a variable read has none. | `F9` on the selected block. |
| SFC | A step stops where a transition enters it; a transition stops where it fires. A step that no transition enters has no place to stop. | `F9` on the selected step or transition. |

A breakpoint is kept on the element, not on a generated line, so it follows its rung, block or step when the diagram changes and is built again. One whose element was deleted is forgotten, and one on an element with no statement is refused once a program is loaded. The element where the paused program is at is outlined in yellow. The program counters are the ones the runtime of the simulation and of a board take; stopping on a board has not been checked here.

## Online values from the debug map

While a program runs under ZPLC, each editor shows what the program holds (LNG-006), read through the debug map of the build of its file. The build records, for each element of a Ladder, FBD or SFC source, which variable of the generated program holds its state, so no editor guesses a name. A state that the map does not give is shown as unavailable (a dash, `UNAVAILABLE`), never as FALSE or IDLE.

| Language | What is shown | Where it comes from |
| --- | --- | --- |
| ST | The value of each variable a line names, after the line (`Count=7  Ready=TRUE`). A member of a block instance or a structure is read through its instance. | The language service resolves what a name is; the map of the program of the file gives its address and type. A function or a function block shows nothing: its names belong to every instance. |
| IL | The value of each declared variable an instruction uses, after the line. | The IL parser, and the map of the program of the file. |
| LD | Power: an element is lit when power reaches it, through series and parallel paths and branches, and after a block it is the block's own output. The value of a contact or a coil, and the outputs of a block, below it. | The rung's power flow as an expression of the variables it is made of, evaluated with the values read. |
| FBD | The value on each wire, and the outputs of each block; a variable block shows the value of its variable. | The temporary each consumed output was given, or the member of the instance. |
| SFC | Which steps are active and for how long; for each transition, whether its condition holds and whether it fired in this scan. | The generated state of the chart: the flag and timer of each step, and the condition and fired flags of each transition. |

A value is read in the program of its own file: two programs that each have a `_rung1_result` have two values. The variables an editor shows are read with the poll of the Watch table, and only the regions that show a value draw it again.

Not covered: the wire between two elements of a rung is not lit, only the elements; an element of an array in ST has no inline value; the values on a board and stepping on hardware.

Evidence level: host, against the real runtime. `packages/zplc-ide/src/monitoring/runtime.test.ts` builds a Ladder, an FBD and an SFC, loads them into the native runtime, scans them with inputs and reads the variables the map names, and checks the state of each element. Journeys 28b to 28e of `bun run test:journeys` show the values in the real application.

## One vocabulary for signal states

Every place that shows the value of a signal uses the same five states: the inline values of the code editor, the Watch table, Ladder, FBD, SFC, the instance monitor, the controller view and the recorded scenarios of the Lab. Colour never carries a state alone.

| State | Colour | Glyph | Also shown as |
| --- | --- | --- | --- |
| TRUE | Green: a confirmed TRUE, or RUN, and nothing else | `●` | The word TRUE, `T` in a Ladder badge; power flow is a heavier wire |
| FALSE | Neutral grey, never red | `○` | The word FALSE, `F` in a Ladder badge |
| Unknown | Neutral grey, dashed outline | `◌` | A dash or the word UNAVAILABLE; a value that was not read is never shown as FALSE |
| Forced | Amber | `◆` | The word FORCED; a forced value is drawn as forced, not as the value it holds |
| Fault | Red, only for a fault | `▲` | The word FAULT, read by a screen reader as "Fault" |

A number is not a state: it is drawn in the plain value colour with no glyph. A wire in FBD is heavier for TRUE, forced and fault values and dashed for a value that was not read.

### Forced and fault states in the diagrams

A variable is drawn as forced in Ladder, FBD and SFC when the force table holds it at the address the debug map gives that variable in the file being shown; a variable of the same name in another program is not marked. It is drawn as a fault when the poll of the debugger asked the runtime for it and got no value, or the read failed, and it stays a fault until a later poll reads it.

| Editor | What carries the cue |
| --- | --- |
| Ladder | The contact or coil that names the variable. |
| FBD | The pin of a block whose variable is forced or unreadable (an input pin takes the state of the output wired to it), the wire from that pin, and a variable block, which also says FORCED or FAULT in words. |
| SFC | A step whose flag is forced or unreadable; a transition when its own condition variable is, or when a variable named in its condition is forced. |

Nothing in the visual editors, the controller view, the Watch table or the notification list glows, pulses or animates continuously (UX-010). A loading spinner may turn, and it stops under reduced motion.

Evidence level: host. `packages/zplc-ide/src/editors/signalVocabulary.test.tsx` renders each state in each editor and checks the token and the glyph, and journeys 51 and 51b force a variable from the Watch table against the native simulator and read the cue in the FBD and the SFC. A read fault cannot be made to happen in the simulator, so the fault cue is checked by the render tests only.

## Look and feel of the editors

The three visual editors and the code editor follow the light, dark and high-contrast themes, the forced-colours mode of the system and the reduced-motion setting. They are drawn only from the tokens of the theme, and a node, an edge, a toolbox button and the field that edits a name show the same focus ring as every other control: two pixels in the light and dark themes, three in high contrast, and the system highlight colour in forced-colours mode. Under reduced motion every transition shortens, the camera of a diagram does not animate, and a wire is never animated.

The minimap of the code editor is off until you turn it on in Settings, Preferences, "Show the minimap in the code editor", and the choice is kept for your user. While you debug, the state is in the status bar under the toolbar, as "Debug: Paused at line N" or "Debug: Attached, not paused", and nothing is drawn over the code. The breakpoints stay in the margin.

Evidence level: host, in the real application. Journey 46 opens a Ladder, an FBD, an SFC and a Structured Text file, switches the theme, and reads the computed colours against the tokens of that theme. It emulates forced colours and reduced motion, and focuses a node by keyboard to read the computed outline. No screenshot is compared.

## AI editing

An AI assistant edits visual models through typed operations, never raw JSON. The resulting candidate change stays isolated in the **Changes** tab until you review it, build and test it, and save it. See [AI and privacy](./ai-privacy.md).
