# Protocol: Advanced IEC 61131-3 Architecture Implementation

## 1. Objective
Upgrade the ZPLC ecosystem (Compiler, Runtime, IDE) to support professional, high-level IEC 61131-3 (3rd Edition) constructs. This moves the project from a basic logic solver to a full-featured Industrial Controller runtime.

## 2. Implementation Scope

### 2.1 POU (Program Organization Units)
The compiler and runtime must strictly differentiate these execution contexts:

*   **FUNCTION (FUN)**:
    *   *Semantics*: Stateless. No internal memory.
    *   *Implementation*: Compiles to a standard subroutine. Local variables are strictly temporary (Stack).
*   **FUNCTION_BLOCK (FB)**:
    *   *Semantics*: Stateful (Instance-based).
    *   *Implementation*: Requires a `DATA_BLOCK` (Instance Memory) allocated in the Global/Static memory. The `CALL` instruction must pass the `THIS` pointer (Instance Address).
*   **PROGRAM (PRG)**:
    *   *Semantics*: Root execution unit.
    *   *Implementation*: Declared in `Task Configuration`. Persists for the lifetime of the runtime.

### 2.2 Data Types (DUT)
Implement complex type support in the Symbol Table and Memory Manager:

*   **STRUCT**: Contiguous memory block. Compiler must handle offsets.
    *   Example: `Drive: STRUCT Speed: REAL; State: INT; END_STRUCT`.
*   **ENUM**: Compile-time constant replacement (Symbol -> Int/Byte).
*   **ARRAY**: Indexed memory access.
    *   *Runtime*: `OP_ARRAY_LOAD`, `OP_ARRAY_STORE` instructions with bounds checking.
    *   *Compiler*: multi-dimensional support `[1..10, 0..5]`.
*   **ALIAS**: Simple type aliasing (`TYPE Pressure : REAL; END_TYPE`).

### 2.3 Variable Scopes & Keywords
*   **Scopes**:
    *   `GVL`: Global memory (0x0000+ offset).
    *   `VAR_INPUT/OUTPUT`: Parameter passing protocols (Copy-in/Copy-out or Reference).
    *   `VAR_STAT`: Static memory behaves like Global but scoped visibility.
    *   `VAR_TEMP`: Stack memory.
    *   `VAR_CONFIG`: Hardware mapping (Alias to `%I`/`%Q`).
*   **Memory Modifiers**:
    *   `RETAIN`: Map to the Retentive Memory Region (`0x4000`).
    *   `PERSISTENT`: Requires NVS backing (Flash).

### 2.4 Object Oriented Programming (OOP - 3rd Ed)
Enable "Modern PLC" features:
*   **METHODS**: Subroutines bound to an FB instance. Implicit access to FB's `VAR` variables.
*   **PROPERTIES**: Getter/Setter logic for variables.
*   **INTERFACES**: VTable-based dispatch. Allows polymorphic FBs.

### 2.5 Task Configuration
Current: Single Cyclic Task.
Future:
*   **Cyclic**: Priority-based preemptive scheduling (using RTOS threads).
*   **Event**: Triggered by Interrupt (GPIO) or Variable (Software Event).
*   **Freewheeling**: Lowest priority, runs continuously in background.

## 3. Execution Plan

### Step 1: Compiler & Type System (TypeScript)
Update the ST Compiler to parse `TYPE` definitions and generate specific Layout Maps for Structs/FBs.
*   Define `TypeDefinition` interface (Size, Alignment, Fields).
*   Implement `StructLayout` calculator.

### Step 2: Runtime Extensions (C)
Update `zplc_core` to handle:
*   **Instance Calls**: `CALL_FB <InstancePtr> <CodeAddr>`.
*   **Array Ops**: `LOAD_ARR <Base> <Index> <ElemSize>`.
*   **OOP**: Method dispatch tables (if supporting interfaces).

### Step 3: IDE Project Structure
*   Add "Add DUT" (Data Unit Type) to project tree.
*   Add "Add GVL" to project tree.
*   Update **Task Configuration** editor to allow mapping `PRG` `PowerControl` to `Task_HighPriority`.

### Step 4: Verification
*   **Test 1 (FB)**: Create `FB_Counter`. Instantiate twice (`C1`, `C2`). Verify they count independently.
*   **Test 2 (Struct/Array)**: Create `ARRAY [0..5] OF MotorStruct`. Iterate and set values.
*   **Test 3 (OOP)**: Create `I_Sensor` interface. Implement in `FB_Temp` and `FB_Press`. Call via interface.

## 4. Deliverables
1.  Updated **Compiler** with DUT/POU support.
2.  Updated **VM Core** with complex memory addressing instructions.
3.  **IDE UI** for defining Types and Task Configuration.
