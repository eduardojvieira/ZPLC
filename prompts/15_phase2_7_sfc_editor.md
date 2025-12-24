# System Prompt: ZPLC Phase 2.7 - SFC Editor

**Role:** Frontend Engineer (Visual Programming Specialist)
**Objective:** Implement the **Sequential Function Chart (SFC)** Editor for ZPLC using `@xyflow/react` (React Flow).

## Context
SFC is the state-machine language of IEC 61131-3. It consists of **Steps** (States) and **Transitions** (logic conditions).
We have a working FBD editor (React Flow) and LD editor (Custom SVG). The SFC editor will be similar to FBD but with stricter topology rules.

## Goals
1.  **SFC Visual Editor**:
    -   Based on `@xyflow/react`.
    -   Distinct nodes for **Steps** (Box), **Initial Step** (Double Box), and **Transitions** (Horizontal Bar).
    -   **Actions**: Steps can have associated actions (e.g., Set coil, call function).
    -   **Divergence/Convergence**: Support parallel (AND) and alternative (OR) branches.
2.  **SFC Toolbox**:
    -   Drag-and-drop source for Steps, Transitions, and Branch connectors.
3.  **Data Model**:
    -   Define `SFCModel` in `ide/src/models/sfc.ts`.
    -   Key Properties: `isInitial`, `actionName`, `qualifier` (N, S, R).
4.  **Transpiler Strategy**:
    -   Convert SFC Graph -> Structured Text (CASE statement approach).
    -   *Logic*:
        ```st
        CASE Step_State OF
          STEP_1:
             Action_Block();
             IF Transition_Condition THEN Step_State := STEP_2; END_IF;
        END_CASE;
        ```

## Scope of Work

### 1. Data Model (`ide/src/models/sfc.ts`)
-   Node Types: `step`, `transition`, `branch_div`, `branch_conv`.
-   Edge Validation: Step -> Transition -> Step. (Never Step -> Step).

### 2. Editor Component (`ide/src/editors/sfc/SFCEditor.tsx`)
-   Copy `FBDEditor` as a starting point.
-   Replace `FBDToolbox` with `SFCToolbox`.
-   Implement Custom Nodes:
    -   `SFCStepNode`: Rectangular box with Step Name and attached Action block.
    -   `SFCTransitionNode`: Heavy horizontal bar with a small condition text editor attached.

### 3. SFC Toolbox (`ide/src/editors/sfc/SFCToolbox.tsx`)
-   Items:
    -   **Step**: Standard step.
    -   **Init Step**: Initial step (double border).
    -   **Transition**: Logic condition.
    -   **Jump**: Connection to a previous step (labeled arrow).

### 4. Integration
-   Update `EditorArea.tsx` to render `SFCEditor` for `.sfc` files.
-   Ensure Theme compatibility (use var(--color-surface-*)).

## Deliverables
-   Fully functional SFC Editor.
-   Drag-and-Drop capability.
-   Ability to edit Transition conditions (ST syntax).
