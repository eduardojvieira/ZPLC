# Text and Visual Editors

Studio has one workbench for ST, IL, LD, FBD, and SFC, but each visual language
retains its own semantic model.

## Current authoring paths

| Language | Path | Boundary |
| --- | --- | --- |
| ST | Primary text editor with diagnostics and source navigation. | Supported IEC subset is the compiler contract. |
| IL | Text compatibility path. | Availability depends on accepted compiler subset. |
| LD | Rungs, contacts, coils, branches, undo, and visual validation. | Generated ST is read-only output. |
| FBD | Typed ports, blocks, connections, undo, and visual validation. | Generated ST is read-only output. |
| SFC | Steps, transitions, actions, undo, and visual validation. | Generated ST is read-only output. |

## Blocks of the project

The blocks palette of FBD and LD shows, besides the standard blocks, a **Project** group with the function blocks
and functions that the Structured Text files of the project declare (LNG-008). A block of the group has the ports of
its declaration: for a function block its `VAR_INPUT` and `VAR_IN_OUT` are inputs and its `VAR_OUTPUT` are outputs,
and for a function its inputs are the inputs and its result is the output `OUT`. The generated Structured Text calls
the block with named arguments, so the order in which you wire the inputs does not matter.

- **FBD** places both function blocks (with an instance name) and functions. A function whose result nothing uses is
  still called.
- **LD** places function blocks in a rung, like a timer: the element names the type and the instance, and the
  parameters name the inputs of the declaration. A function is not placed in a rung; call it from an FBD or ST file.
- A block that no file declares is refused by name when the diagram is built. A declaration in the project wins over
  a standard block of the same name, as it does in the compiler.
- The palette lists the blocks of the Structured Text files in `src`, of the files in a library folder (see
  [Declarations and library folders](./features.md#declarations-and-library-folders)), and of any file open in the
  editor. The build reads the files in `src` and directly in the library folders that `libraries` of `zplc.json` lists.

## Visual files on disk

A Ladder, FBD or SFC file is JSON. Studio checks it against the shape its editor reads when you open it (LNG-011):
a file that is not JSON, or that is JSON of another shape, shows an error panel that names the file and its first five
violations by path (`rungs[0].grid[1][2].element.type: ...`), counts the rest, and leaves the window and every other
tab as they were. Correct the file and open it again; the build refuses the same file for the same reason.

Opening a visual file and saving it without a change leaves it byte for byte as it was (LNG-014), whatever layout it was
written in. A change that ends where it started, such as dragging an element away and back, does not rewrite the file
either. The first real edit writes the whole file in the one form Studio uses: two-space JSON with a newline at the end
(a number written `2.0` is written `2`; a Ladder rung written as a list of elements is written as a grid).

## Undo, redo and selection in the visual editors

One gesture of yours is one undo step (LNG-010): a drag, a paste, a delete (the nodes and the wires that went with them), a drop
from the palette, a wire drawn, or an edit of a name or a condition. A drag that is 300 pixels long reaches the canvas as
about thirty position changes; the file is written, and the history gets an entry, once, when you put the node down. Letters
typed into one field within a second of each other are one step. The history keeps the last 100 gestures of each file for the
session; the Undo and Redo buttons, `Ctrl+Z` and `Ctrl+Shift+Z` (`Ctrl+Y`) use it.

The selection is not part of the file, and it survives the edit: whatever is selected stays selected when the canvas is
rebuilt from the file after a change. Undo and redo give the selection back with the content: undoing a delete puts the
deleted blocks back and selects them, undoing a paste selects what was selected before the paste.

Evidence level: host. `src/editors/gesture.test.ts` drives the commit rule with a 30-step drag, a delete and a stream of
selection changes, and `src/editors/visualHistory.test.ts` holds 100 gestures, the coalescing and the selection of each step.
Journey 28j of `bun run test:journeys` drags a block with real pointer events, and one `Ctrl+Z` takes the whole drag back.

## The Structured Text language service

The Structured Text editor reads the whole project, not only the file in front of you (LNG-015, LNG-016).

| Feature | What it does |
| --- | --- |
| Diagnostics | Every syntax error and every semantic error of every Structured Text file of the project, while you type (a pause of 0.3 s), with the range the compiler's own front end gave. They appear as squiggles in the files that are open and in **Problems** (Live ST diagnostics), and go away the next time the project is checked and the error is gone. They are not build evidence; **Build** is. |
| Completion | The variables, parameters and methods in scope; after a dot the members of the type of what is before it (a block, a structure, an element of an array of structures, a standard block); the blocks, functions and types of every file; the types where a type goes; the parameters of a call as `Name := `. Project names come before the standard library. |
| Hover | What a name is, its type and where it is declared, also in another file. |
| Go to definition, find references | Across the files of the project. A name is found by what it is, not by its spelling: `Count` of one program is not `Count` of another. |
| Outline | The declarations of the file as a tree (a block holds its inputs, outputs, variables and methods). |
| Signature help | The parameters of the function, method or block being called, and the one the cursor is at, also when the arguments are named. |
| Rename symbol (`F2`) | Renames what a name stands for in every file of the project, by scope and by type, never as text. It is refused, with the reason, when the new name is already declared where the old one is used, when a file of the project has a syntax error (it could hold a use that was not found), when the name is mentioned in a Ladder, FBD, SFC or IL file (rename it there too), or when the name is a program (the tasks of `zplc.json` run it by name). The files that change are open as modified tabs; you save them. |
| Format document (`Shift+Alt+F`) | Indents each line by the depth of its blocks and trims the ends of lines. It changes only white space at the start and end of a line: no line is added or removed (a breakpoint is a line), no token moves, and a comment is left as written. Formatting twice gives the same text. |

Each feature is answered from one index of the project, built from the compiler's lexer and parser, with the text of the
editor in place of its file; a file that does not parse yet still contributes the declarations that its tokens give, so
completion works in the middle of a line.

Not covered: a name used only in a Ladder, FBD, SFC or IL file is not part of the index (rename refuses to guess it, as
the table says); workspace-wide symbol search; code actions.

Evidence level: host. `packages/zplc-compiler/src/compiler/check.test.ts` runs the diagnostics against the build's
errors for the same projects; `src/langsvc/*.test.ts` cover the index, rename, completion, signature help, outline,
formatting (over every example project, token for token), the markers and the Monaco providers; journey 4c of
`bun run test:journeys` types an undeclared variable in the real editor and sees it with its range, and undoes it.

## Pin types in FBD

The FBD canvas refuses a wire between pins whose types do not match, and says why in a message over the canvas
(LNG-013). The rules are the ones the compiler applies to an assignment: integers, bit strings and `REAL` are one
family of numbers (an integer goes into a `REAL` or an `LREAL`, a `REAL` and an `LREAL` into each other, the build warning when an `LREAL` is narrowed, and a `REAL` never into an integer), and `BOOL`, `TIME`,
`DATE`, `TOD`, `DT` and the strings take only their own type. A variable block has the type its variable is
declared with and a constant the type it is written as (`T#2s` is a `TIME`, `0.5` a `REAL`); a pin declared `ANY` is
not judged. So a `BOOL` output cannot feed a numeric input, a `REAL` cannot feed a `BOOL` or an integer input, and
a number cannot feed a `TIME` input; convert it explicitly with a conversion function such as `REAL_TO_INT` first.
An input has one source: a second wire into it is refused too. A wire may be started at either end.

## Where a diagnostic points

A diagnostic of a visual or IL file names the element it is about (LNG-003, LNG-026), not a line of the generated
Structured Text that you never wrote. The build reports it in the `element` field next to `path`, and Studio's
Problems panel selects it when you activate the problem:

| Language | Element | Selected |
| --- | --- | --- |
| IL | `line:12`, a line of the IL source. A finding about the generated code is put on the IL line it came from. | The line. |
| LD | `rung:rung_1`, or `rung:rung_1/cell:0,3` for the cell at row 0, column 3 (`rung:rung_1/element:c1` for a rung stored as a list of elements). | The rung and the element in the cell, scrolled into view. |
| FBD | `block:and_1`, or `connection:w3` for a wire. A block that only reads a variable or holds a constant has no statement: a finding about its name is on the block that is written with it. | The block or the wire. |
| SFC | `step:s1`, `transition:t1` (its condition) and `action:a1` (its body). | The step or the transition; an action is shown on the first step that uses it. |

The line and column of a diagram diagnostic stay those of the generated Structured Text, and the message says so. A
diagram that is not valid yields one diagnostic for each element that is wrong, not one for the whole file.

The element travels with the diagnostic from the build to the Problems panel (the build runs in its own process and
sends it, checked, with the code, the path and the position). The problem therefore selects the element the build
named, also when the file in the editor has changed since the build ran; a diagnostic that came without an element
(an older host, a text that is not an element id) is placed from the file that is open, as before.

Evidence level: host. `electron/workspaceCompileFailure.test.ts` and `src/components/workspaceTestPresentation.test.ts`
cover the element across the two processes, `src/editors/diagnosticElement.test.ts` the choice between the carried
element and the open file, and journey 25 of `bun run test:journeys` puts the wire back on disk after a failed build
and still gets the block the build named.

## Breakpoints on a diagram

A breakpoint can be set on the element of the diagram or the IL line you edited (LNG-004); the debug map relates each
instruction range to that element, and the runtime stops at the first instruction of it. Like the dot on a line of a
text file, it can be set before the program is loaded and is armed when Run or Deploy loads it.

| Language | Where | How |
| --- | --- | --- |
| IL | The IL line. The map states lines of the IL source, as a text editor expects. | The gutter of the editor. |
| LD | The rung: the first statement of its code. | The dot at the left of the rung, or F9 on the selected rung. |
| FBD | The block: the first statement it generates. A constant or a variable read has none. | F9 on the selected block. |
| SFC | A step stops where a transition enters it; a transition stops where it fires. A step that no transition enters has no place to stop. | F9 on the selected step or transition. |

A breakpoint is kept on the element, not on a generated line, so it follows its rung, block or step when the diagram
changes and is built again; one whose element was deleted is forgotten, and one on an element that has no statement is
refused once a program is loaded. The element that the paused program is at is outlined in yellow. The program counters are the
ones the runtime of the simulation and of a board take; stopping on a board has not been checked here.

## Online values from the debug map

While a program runs under Studio, each editor shows what the program holds (LNG-006), read through the debug map of the
build of its file. The build records, for each element of a Ladder, FBD or SFC source, which variable of the generated
program holds its state, so no editor guesses a name from the one it sees: a state that the map does not give is shown as
unavailable (a dash, `UNAVAILABLE`), never as FALSE or IDLE.

| Language | What is shown | Where it comes from |
| --- | --- | --- |
| ST | The value of each variable a line names, after the line (`Count=7  Ready=TRUE`). A member of a block instance or a structure is read through its instance. | The language service resolves what a name is; the map of the program of the file gives its address and type. A function or a function block shows nothing: its names belong to every instance. |
| IL | The value of each declared variable an instruction uses, after the line. | The IL parser, and the map of the program of the file. |
| LD | Power: an element is lit when power reaches it, through series and parallel paths and branches, and after a block it is the block's own output. The value of a contact or a coil, and the outputs of a block, below it. | The rung's power flow as an expression of the variables it is made of (`rung:r/cell:row,col`), evaluated with the values read. |
| FBD | The value on each wire, and the outputs of each block; a variable block shows the value of its variable. | The temporary each consumed output was given, or the member of the instance. |
| SFC | Which steps are active and for how long; for each transition, whether its condition holds and whether it fired in this scan. | The generated state of the chart: the flag and timer of each step, `_C_` and `_F_` of each transition. |

A value is read in the program of its own file: two programs that each have a `_rung1_result` have two values. The
variables an editor shows are read with the Watch table's poll, and only the regions that show a value draw it again
([What is drawn again when a value changes](#what-is-drawn-again-when-a-value-changes)).

Not covered: the wire between two elements of a rung is not lit, only the elements; an element of an array in ST has no
inline value; the values on a board, stepping on hardware. The runtime of the simulation is what the host tests read.

Evidence level: host, against the real runtime. `src/monitoring/runtime.test.ts` builds a Ladder, an FBD and an SFC,
loads them into the native runtime, scans them with inputs and reads the variables the map names, and checks the state of
each element: power through the seal-in branch, the pins of the timers, the active step and the fired transition.
`src/monitoring/elementStates.test.ts` checks that every variable a monitor entry names exists in the map for each example
diagram. Journeys 28b to 28e of `bun run test:journeys` show the values in the real application.

## One vocabulary for signal states

Every place that shows the value of a signal uses the same five states, defined once in `src/theme/signalTone.ts` with the `--signal-*` tokens of `src/theme/tokens.ts`: the inline values of the code editor, the Watch table, Ladder, FBD, SFC, the instance monitor, the controller view and the recorded scenarios of the Lab. Colour never carries a state alone.

| State | Colour | Glyph | Also shown as |
| --- | --- | --- | --- |
| TRUE | Green: a confirmed TRUE, or RUN, and nothing else | `●` | The word TRUE, `T` in a Ladder badge; power flow is a heavier wire |
| FALSE | Neutral grey, never red | `○` | The word FALSE, `F` in a Ladder badge |
| Unknown | Neutral grey, dashed outline | `◌` | A dash or the word UNAVAILABLE; a value that was not read is never shown as FALSE |
| Forced | Amber | `◆` | The word FORCED; a forced value is drawn as forced, not as the value it holds |
| Fault | Red, only for a fault | `▲` | The word FAULT, read by a screen reader as "Fault" |

A number is not a state: it is drawn in the plain value colour with no glyph. A wire in FBD is heavier for TRUE, forced and fault values and dashed for a value that was not read, and a non-zero number is not drawn as TRUE.

Nothing in the visual editors, the controller view, the Watch table or the notification list glows, pulses or animates continuously. A loading spinner may turn, and it stops under reduced motion. `bun tools/ci/ui-kit-guard.ts` fails when a source adds an animation or a shadow there (UX-010), and its list of existing offenders can only shrink.

Evidence level: host. `src/editors/signalVocabulary.test.tsx` renders a Ladder contact and coil, an FBD block, an SFC step and an SFC transition with each of the five states and checks both the token and the glyph, and `src/theme/signalTone.test.ts` checks the contrast of each state in the three themes. The palette and the glyphs are for a person to judge by eye.

## What the palettes offer

A palette offers only what its transpiler translates (LNG-007), and every element it offers is run in the test suite:
placed in a program, built, loaded into the virtual machine and scanned.

- **LD** offers four contacts (normally open, normally closed, rising and falling edge), six coils (normal, negated, set,
  reset, rising and falling edge), the branch and the function blocks of the compiler's library and of the project. The
  communication blocks `COMM_CONNECT`, `COMM_PUBLISH`, `COMM_SUBSCRIBE` and `COMM_MODBUS` are not offered: no Ladder file
  can declare an instance of them.
- **FBD** offers the gates, the comparisons, `ADD`, `SUB`, `MUL`, `DIV`, `MOD`, `ABS`, `MAX`, `MIN`, `LIMIT` and `SEL`,
  the function blocks of the library and of the project with the inputs and outputs they declare, and the blocks that
  carry a value (`constant`, `variable`, `input`, `output`). The functions of the library (`SQRT`, `SIN`, `LEN`,
  `CONCAT`, the conversions...) are not offered yet: a diagram cannot call them, and the build refuses them by name.
- **SFC** offers the step, the initial step and the transition.

## Editing from the keyboard

Every editing action of the Ladder, Function Block Diagram and Sequential Function Chart editors can be done from the keyboard
(LNG-012): moving a cursor, inserting an element, binding a variable from the declared symbols, connecting, and deleting. The
[keyboard reference](../reference/visual-editor-keyboard.md) lists every key. It is generated from the table the editors read
their keys from, so a key that is in it works, and a key that works is in it.

- **The cursor.** In Ladder it is a cell of a rung, drawn as a blue frame; a click on a cell puts it there. In the function
  block and chart editors it is the selected block or element, and `Alt` with an arrow key moves it to the nearest one in that
  direction. The arrow keys without `Alt` nudge the selected block on the canvas, as before.
- **Inserting.** A letter inserts the common elements at the cursor: `C` a contact, `N` an inverted contact, `O` a coil in
  Ladder, `T` a transition and `S` a step in a chart. `Insert` or `I` opens the palette as a search list: type to search, Up and
  Down choose, Enter inserts. The toolbox of each editor is reached with Tab: its items are buttons that insert at the cursor,
  and it has a search box. Dragging an item still works, and it inserts through the same command as the key.
- **Binding.** `F2` asks for the variable of the element under the cursor from the list of symbols the file declares. A contact
  is offered the BOOL variables and the BOOL outputs of declared blocks (`Delay.Q`); a coil the BOOL variables that are not
  inputs; the instance of a function block the variables of its type; the condition of a transition the BOOL variables. Where a
  list allows it, a name that is not declared can be typed and is offered as typed.
- **Connecting.** `C` on a block lists the wires it can have, each from an output to an input that takes it: the rules of the
  pin types apply (LNG-013), and an input that already has a wire is not offered. The wire chosen is drawn. `Shift+C` lists the
  wires of the block and removes the one chosen. In a chart, `T` inserts a transition below the selected step and `S` a step
  below the selected transition, each wired to the one it follows.
- **Deleting.** `Delete` removes the element under the cursor in Ladder, and the selected blocks and wires in a diagram or a
  chart, the wires that were on a block going with it.

A command that changes the file is one step of the undo history, and the selection comes back with undo and redo (LNG-010).
What each command did, or why it refused, is written to a polite live region of the editor, which a screen reader reads.

Four things differ from what the editors did before. A contact or a coil dropped from the toolbox is no longer named `NewVar`:
it is unbound and shows `???` until it is bound. A function block dropped or inserted gets an instance name that nothing else
has, and the instance is declared as a local variable of its type. The properties panel of Ladder opens when an element is
clicked or Enter is pressed on it, not when a command of the keyboard selects it. A double click on a block of a function block
diagram asks what the block holds, as `F2` does.

Evidence level: host, and the real application on the development host. `src/editors/ld/keyboard.test.ts`,
`src/editors/fbd/keyboard.test.ts` and `src/editors/sfc/keyboard.test.ts` press keys on a model, with the key table in between,
and check the document, the cursor, the lists that are offered and that the build reads what was typed;
`src/editors/picker.test.ts` and `src/editors/keymap.test.ts` hold the search list and the table. Journeys 28f, 28g and 28h of
`bun run test:journeys` build a rung, edit a diagram and edit a chart with real key events, save, and build; journey 28i drops
items of the toolbox with DOM drag events. Not covered: a real
screen reader (the live region is there and its text is tested, not its speech), and a keyboard way to place a block at an exact
coordinate (a block is put beside the cursor, then nudged with the arrow keys).

## What is drawn again when a value changes

A watched value is read ten times a second while a program runs. Studio draws again only what shows it (IDE-013): the Watch
table, and the editor of the file that has the variable in it. The Explorer, the toolbar, the settings and the tab bar do not
subscribe to the readings, and a reading that is the value it was publishes nothing. A component that needs five of 200
watched values is drawn again when one of those five changes, not when another does.

`bun tools/ci/ide-structure.ts` (run by `bun run lint:ide`) fails a component or hook outside `src/store/` that subscribes to
the whole store, or to its `debug` slice: each region of the window names the fields it shows
(`src/store/regionSubscriptions.ts`).

Measured on the store with 200 watched values read 100 times and 50 keystrokes in a 2,000-line file: before, each of the
Explorer, the toolbar, the Console, the editor area and the settings was drawn again 150 times and each reader of
watched values 100 times; now the regions that show neither are drawn 0 times, the tab bar and the editor 50 times (once for
each keystroke), and a reader of five values 10 times, for the 10 readings that changed them.

Evidence level: host, at the level of the store and its selectors (`src/store/regionSubscriptions.test.ts`). This
repository has no DOM test environment, so the draws themselves of React are not counted; the Console still renders on each
keystroke, because the Problems tab shows what typing clears and its checks compare the run counter of the build.

## Compile path

Visual models are validated and transpiled before canonical compilation. Shared
backend use reduces duplicate implementation, but it is not a guarantee that
every language has the same feature set or debugging behavior. Compile and run
the intended project and scenario to establish the behavior you need.

## AI editing

AI edits visual models through typed operations, never raw JSON. The resulting
candidate change stays isolated in the **Changes** tab until you review it,
compile and test it, and save it. See [AI and privacy](./ai-privacy.md).
