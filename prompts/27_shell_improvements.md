# Protocol: Runtime Shell Improvements & IDE Deep Integration

## 1. Context & Objective
The current ZPLC Runtime Shell is functional but basic. It is designed for human interaction (`minicom`), making automated parsing in the IDE fragile (regex matching).
**The Goal**: 
1.  Make the Shell **Machine-Readable** (JSON Mode).
2.  Expose rich **System Diagnostics** (CPU, Heap, Tasks).
3.  Integrate a real **Terminal** and **Controller Dashboard** in the IDE.

## 2. Runtime Improvements (C / Zephyr)

### 2.1 JSON Output Mode
Modify `cmd_zplc_status` and `cmd_dbg_info` to support a `--json` flag.

**Example Output (`zplc status --json`):**
```json
{
  "state": "RUNNING",
  "uptime_ms": 15402,
  "stats": {
    "cycles": 124500,
    "jitter_us": 45,
    "cpu_load_pct": 12
  },
  "tasks": [
    {"id": 1, "name": "MainTask", "prio": 1, "stack_used": 240, "stack_max": 1024}
  ],
  "memory": {
    "work_used": 1024,
    "work_total": 8192,
    "retain_used": 12,
    "retain_total": 4096
  }
}
```

### 2.2 New Diagnostic Commands
*   `zplc sys info`: Board Name, Zephyr Version, Clock Speed, Capabilities (FPU, DSP).
*   `zplc sys heap`: Detailed heap usage (if `CONFIG_SYS_HEAP_RUNTIME_STATS=y`).
*   `zplc log follow`: Stream kernel logs to the shell until Ctrl+C.

## 3. IDE Integration (TypeScript / React)

### 3.1 Update `SerialAdapter`
*   Refactor `getInfo()` to use `zplc status --json` instead of regex.
*   Reliability: If JSON parse fails (e.g., partial line), retry silently.

### 3.2 Add "Terminal" Tab
Add a new tab to the **Console Panel**:
*   **Component**: `SerialTerminal.tsx`.
*   **Implementation**: 
    *   Connects to the shared `SerialConnection`.
    *   **Passthrough Mode**: When active, IDE polling (getInfo) should be **PAUSED** to avoid interfering with user commands.
    *   UI: A simple dark-themed terminal (Xterm.js is heavy, a simple React implementation is fine for now). Allows user to type `help`, `kernel stacks`, etc.

### 3.3 Add "Controller Dashboard"
A dedicated view (sidebar or modal) showing real-time stats:
*   **Connection**: Enabled/Disabled.
*   **Device**: Board Name, FW Version.
*   **Health**: CPU Load (Gauge), Memory Usage (Bar), Cycle Time (Sparkline graph).
*   **Tasks**: Table showing active tasks and their priorities.

## 4. Execution Plan

### Step 1: Runtime (C)
1.  Add `min_json_printer` (simple helper helper to print JSON without massive malloc overhead).
2.  Update `shell_cmds.c`.

### Step 2: Adapter (TS)
1.  Update `SerialAdapter.ts` to support parsing the new JSON format.
2.  Add `setPassthrough(enabled: boolean)` method to pause background polling.

### Step 3: UI (React)
1.  Create `ide/src/components/Console/TerminalTab.tsx`.
2.  Create `ide/src/components/Sidebar/ControllerView.tsx`.
3.  Hook up data from `useIDEStore`.

## 5. Verification
1.  **Manual**: Open IDE Terminal, type `zplc status` -> plain text. Type `zplc status --json` -> JSON.
2.  **Dashboard**: Connect board, see CPU gauge move.
3.  **Stability**: Ensure IDE doesn't crash if board sends garbage data.
