# Visual Editors

ZPLC IDE provides graphical editors for the three most popular IEC 61131-3 visual languages. All editors share a common architecture and seamlessly integrate with the ST compiler backend.

## Ladder Diagram (LD)

Ladder Diagram is the most widely used PLC programming language, derived from relay logic schematics. It's ideal for discrete control logic.

### Editor Features

- **Drag-and-drop components**: Contacts, coils, function blocks
- **Automatic rung layout**: Components snap to power rails
- **Real-time syntax validation**: Invalid connections are highlighted
- **Online debugging**: Watch values flow through the ladder in real-time

### Components

| Symbol | Name | Description |
|--------|------|-------------|
| `--[ ]--` | NO Contact | Normally Open contact (passes power when TRUE) |
| `--[/]--` | NC Contact | Normally Closed contact (passes power when FALSE) |
| `--( )--` | Coil | Output coil (energized when power reaches it) |
| `--(S)--` | Set Coil | Latching set coil |
| `--(R)--` | Reset Coil | Latching reset coil |

### Example

A motor start/stop circuit with seal-in logic:

```
     Start_PB     Stop_PB                    Motor_Run
+-------[ ]--------[/]--------+------( )-------+
|                             |                |
|     Motor_Run               |                |
+-------[ ]-------------------+                |
```

### Transpilation

The LD editor internally represents the ladder as a graph structure, which is then topologically sorted and converted to Structured Text:

```
LD Graph → Topological Sort → ST Code → Bytecode
```

---

## Function Block Diagram (FBD)

FBD uses a data-flow model where function blocks are connected by signals. It's excellent for continuous control, signal processing, and complex logic.

### Editor Features

- **Block palette**: Standard IEC function blocks (TON, CTU, ADD, etc.)
- **Wire routing**: Automatic or manual signal wire placement
- **Block parameters**: Configure presets directly on the block
- **Execution order**: Visual indicators show evaluation sequence

### Standard Blocks

| Category | Blocks |
|----------|--------|
| Logic | AND, OR, XOR, NOT, RS, SR |
| Timers | TON, TOF, TP |
| Counters | CTU, CTD, CTUD |
| Compare | EQ, NE, LT, LE, GT, GE |
| Math | ADD, SUB, MUL, DIV, ABS, SQRT |
| Select | SEL, MUX, LIMIT, MIN, MAX |

### Example

Temperature alarm logic:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Temp_PV    ├────►│     GT      ├────►│     TON     ├────►│ Alarm_High │
│             │     │  IN2: 80.0  │     │  PT: T#5s   │     │            │
└─────────────┘     └─────────────┘     └─────────────┘     └────────────┘
```

This triggers an alarm if temperature exceeds 80.0 for more than 5 seconds.

---

## Sequential Function Chart (SFC)

SFC provides a state-machine view of sequential processes. It's ideal for batch processes, startup sequences, and complex multi-step operations.

### Editor Features

- **Step blocks**: Define discrete states
- **Transitions**: Boolean conditions between steps
- **Actions**: ST code or FB calls associated with steps
- **Divergence/Convergence**: Parallel and alternative paths

### Elements

| Element | Description |
|---------|-------------|
| Step | A state in the sequence (rectangle) |
| Initial Step | Starting state (double border) |
| Transition | Condition to move between steps (horizontal line) |
| Action | Code executed in a step (attached block) |
| Divergence | Split into parallel or alternative paths |
| Convergence | Join parallel or alternative paths |

### Action Qualifiers

| Qualifier | Behavior |
|-----------|----------|
| N | Non-stored: executes while step is active |
| S | Set: latched on when step activates |
| R | Reset: clears a latched action |
| P | Pulse: executes once on step entry |
| D | Delayed: executes after specified time |
| L | Limited: executes for specified duration |

### Example

A simple fill/heat/drain sequence:

```
        ┌───────────┐
        │  INITIAL  │
        └─────┬─────┘
              │ Start_Cmd
        ┌─────▼─────┐
        │   FILL    │──► [N] Open_Valve
        └─────┬─────┘
              │ Level_High
        ┌─────▼─────┐
        │   HEAT    │──► [N] Heater_On
        └─────┬─────┘
              │ Temp_Reached
        ┌─────▼─────┐
        │   DRAIN   │──► [N] Drain_Valve
        └─────┬─────┘
              │ Level_Low
              ▼
        ┌───────────┐
        │  INITIAL  │
        └───────────┘
```

---

## Common Features

All visual editors share these capabilities:

### Undo/Redo
Full history of edits with keyboard shortcuts (Ctrl+Z / Ctrl+Y).

### Copy/Paste
Copy elements within the same editor or between projects.

### Zoom & Pan
Navigate large programs with mouse wheel zoom and drag panning.

### Grid Snap
Optional grid alignment for precise component placement.

### Symbol Browser
Quick access to variables and function blocks defined in the project.

### Online Mode
When connected to hardware:
- Variable values update in real-time
- Force values directly from the editor
- Highlight active rungs/paths

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+C` | Copy |
| `Ctrl+V` | Paste |
| `Delete` | Remove selected element |
| `Ctrl+A` | Select all |
| `Ctrl+S` | Save project |
| `F5` | Compile |
| `F6` | Start simulation |
| `F7` | Connect to hardware |
