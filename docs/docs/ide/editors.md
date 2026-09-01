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

## Compile path

Visual models are validated and transpiled before canonical compilation. Shared
backend use reduces duplicate implementation, but it is not a guarantee that
every language has the same feature set or debugging behavior. Compile and run
the intended project and scenario to establish the behavior you need.

## AI editing

AI edits visual models through typed operations, never raw JSON. The resulting
