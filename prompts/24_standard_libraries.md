# Protocol: ZPLC Standard Libraries Implementation

## 1. Objective
Implement a comprehensive suite of IEC 61131-3 compliant standard libraries for ZPLC. This involves implementing the logic in the **C Runtime** and exposing the blocks in the **IDE** (Toolbox, Type Definitions, Simulation).

## 2. Library Structure

Organize the libraries into the following modules:

### 2.1 ZPLC_Standard (Foundational Logic)
*   **Selection**: `SEL`, `MUX`, `LIMIT`, `MAX`, `MIN`.
*   **Comparison**: `GT`, `GE`, `EQ`, `LE`, `LT`, `NE`.
*   **Bitwise**: `SHL`, `SHR`, `ROL`, `ROR`, `AND_WORD`, `OR_WORD`, `XOR_WORD`, `NOT_WORD`.
*   **Generators**: `BLINK` (Asymmetric Pulse), `PWM` (Pulse Width Modulation).

### 2.2 ZPLC_Process (Analog & Control)
*   **Scaling**: `NORM_X` (Normalize), `SCALE_X` (Scale).
*   **Control**: `PID_Compact` (Anti-windup PID), `HYSTERESIS`, `DEADBAND`.
*   **Signal Processing**: `LAG_FILTER` (PT1), `RAMP_REAL`, `INTEGRAL`, `DERIVATIVE`.
*   **Math**: `EXPT`, `LN`, `LOG`, `EXP`, `TRUNC`, `ROUND`.
*   **Trigonometry**: `ASIN`, `ACOS`, `ATAN`, `ATAN2` (plus existing SIN/COS/TAN).

### 2.3 ZPLC_Strings (Text Handling)
*   **Manipulation**: `LEN`, `LEFT`, `RIGHT`, `MID`, `CONCAT`.
*   **Editing**: `INSERT`, `DELETE`, `REPLACE`.
*   **Search**: `FIND`.

### 2.4 ZPLC_System (Diagnostics & Utils)
*   **RTC**: `RTC_GET`, `RTC_SET`, `CALENDAR`, `WEEKLY_TIMER`.
*   **System**: `UPTIME`, `GET_TASK_INFO`, `GET_ERROR_ID`, `WATCHDOG_CONFIG`.
*   **Diagnostics**: `LOG_EVENT`.
*   **Memory**: `FIFO`, `LIFO`, `MEM_CPY`, `MEM_SET`, `RETAIN_HANDLER`.

### 2.5 ZPLC_Motion (PLCopen Lite)
*   **Admin**: `MC_Power`, `MC_Stop`, `MC_Halt`.
*   **Movement**: `MC_MoveAbsolute`, `MC_MoveRelative`, `MC_MoveVelocity`, `MC_Home`.

## 3. Implementation Steps

The agent should execute this iteratively.

### Step 1: Runtime Implementation (C)
Create/Update `src/libs/` with generic C implementations.
*   **File**: `src/libs/zplc_standard.c`, `zplc_process.c`, etc.
*   **Header**: `include/zplc_libs.h` exposing the Function Block configs.
*   **Integration**: Register these functions in `zplc_core.c` so opcodes `CALL_LIB` (suggested extension) or standard `CALL` can reach them.

**Example `SEL` implementation:**
```c
int32_t zplc_lib_sel(int32_t g, int32_t in0, int32_t in1) {
    return (g) ? in1 : in0;
}
```

### Step 2: IDE Definition (TypeScript)
Update the IDE to recognize these blocks.
*   **Block Registry**: Update `ide/src/compiler/lib/standard.ts` (or similar) to define the specific Interface (Inputs/Outputs) for each block.
*   **Toolbox**: Add them to `ide/src/editors/fbd/FBDToolbox.tsx` / `LDToolbox.tsx`.
*   **Transpiler**:
    *   For **ST**: Ensure `SEL(G, A, B)` transpiles to the correct `CALL` instruction or inline logic.
    *   For **WASM Simulation**: Implement the JS/TS equivalent for immediate simulation in `ide/src/runtime/wasmAdapter.ts` (or link the updated C core to WASM).

### Step 3: Verification
*   **Unit Tests (C)**: Add tests in `tests/test_libs.c` to verify logic correctness (e.g., PID loop behavior, String concatenation).
*   **Integration**: Create a project in the IDE using `PID_Compact` and `BLINK`, simulate it, and verify the output graph.

## 4. Priority Order
1.  **ZPLC_Standard** (Essential for basic logic).
2.  **ZPLC_Process** (Essential for analog control).
3.  **ZPLC_System** (Diagnostics).
4.  **ZPLC_Strings** (UI/Logging).
5.  **ZPLC_Motion** (Advanced).
