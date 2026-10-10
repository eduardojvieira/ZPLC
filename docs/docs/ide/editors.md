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
- The palette lists the files that are loaded in the editor; the build reads every Structured Text file of the project.

## Visual files on disk

A Ladder, FBD or SFC file is JSON. Studio checks it against the shape its editor reads when you open it (LNG-011):
a file that is not JSON, or that is JSON of another shape, shows an error panel that names the file and its first five
violations by path (`rungs[0].grid[1][2].element.type: ...`), counts the rest, and leaves the window and every other
tab as they were. Correct the file and open it again; the build refuses the same file for the same reason.

Opening a visual file and saving it without a change leaves it byte for byte as it was (LNG-014), whatever layout it was
written in. A change that ends where it started, such as dragging an element away and back, does not rewrite the file
either. The first real edit writes the whole file in the one form Studio uses: two-space JSON with a newline at the end
(a number written `2.0` is written `2`; a Ladder rung written as a list of elements is written as a grid).

## Pin types in FBD

The FBD canvas refuses a wire between pins whose types do not match, and says why in a message over the canvas
(LNG-013). The rules are the ones the compiler applies to an assignment: integers, bit strings and `REAL` are one
family of numbers (an integer goes into a `REAL`, a `REAL` into an `LREAL`, never the other way), and `BOOL`, `TIME`,
`DATE`, `TOD`, `DT` and the strings take only their own type. A variable block has the type its variable is
declared with and a constant the type it is written as (`T#2s` is a `TIME`, `0.5` a `REAL`); a pin declared `ANY` is
not judged. So a `BOOL` output cannot feed a numeric input, a `REAL` cannot feed a `BOOL` or an integer input, and
a number cannot feed a `TIME` input; convert it explicitly with a conversion function such as `REAL_TO_INT` first.
An input has one source: a second wire into it is refused too. A wire may be started at either end.

## Compile path

Visual models are validated and transpiled before canonical compilation. Shared
backend use reduces duplicate implementation, but it is not a guarantee that
every language has the same feature set or debugging behavior. Compile and run
the intended project and scenario to establish the behavior you need.

## AI editing

AI edits visual models through typed operations, never raw JSON. The resulting
candidate change stays isolated in the **Changes** tab until you review it,
compile and test it, and save it. See [AI and privacy](./ai-privacy.md).
