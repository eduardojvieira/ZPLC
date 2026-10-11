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
Dragging with a real pointer is not covered: there is no DOM test environment in this repository.

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
