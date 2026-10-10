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
  editor. The build reads the files in `src`; reading a library folder into the build is the compiler work of CMP-046.

## Compile path

Visual models are validated and transpiled before canonical compilation. Shared
backend use reduces duplicate implementation, but it is not a guarantee that
every language has the same feature set or debugging behavior. Compile and run
the intended project and scenario to establish the behavior you need.

## AI editing

AI edits visual models through typed operations, never raw JSON. The resulting
candidate change stays isolated in the **Changes** tab until you review it,
compile and test it, and save it. See [AI and privacy](./ai-privacy.md).
