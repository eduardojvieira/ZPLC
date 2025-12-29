# Protocol: Multitask Scheduling Verification (Raspberry Pi Pico)

## 1. Context & Objective
The goal is to verify that the ZPLC Runtime (`apps/zephyr_app`) correctly handles multiple PLC tasks with different priorities and cycle times on a real embedded target (**Raspberry Pi Pico** / `rp2040`).

**Key Requirements to Verify:**
1.  **Periodicity**: Tasks run at their defined intervals (e.g., 10ms vs 100ms).
2.  **Preemption**: A high-priority task interrupts a lower-priority task (if supported by config).
3.  **Concurrency**: Safe access to global variables shared between tasks.

## 2. Environment Setup

### 2.1 Hardware
*   **Board**: Raspberry Pi Pico (`rpi_pico`).
*   **Connection**: USB Serial (Zephyr Console + ZPLC Shell).

### 2.2 Firmware Build
The agent must verify the firmware is built and flashed correctly:
```bash
cd apps/zephyr_app
west build -b rpi_pico --pristine
west flash
```

## 3. Test Cases (IEC 61131-3)

### Case A: Fast vs. Slow Task (Rate Monotonic)
*   **Config**:
    *   `Task_Fast`: Interval=10ms, Priority=1, POU=`FastPRG`
    *   `Task_Slow`: Interval=100ms, Priority=2, POU=`SlowPRG`
*   **Code (`FastPRG`)**:
    ```pascal
    (* Increments every 10ms *)
    Global.FastCount := Global.FastCount + 1;
    ```
*   **Code (`SlowPRG`)**:
    ```pascal
    (* Increments every 100ms *)
    Global.SlowCount := Global.SlowCount + 1;
    (* Simulate work: Burn CPU cycles for 2ms *)
    BUSY_WAIT(2000); 
    ```
*   **Verification**:
    *   Run for 10 seconds.
    *   `FastCount` should be ~1000.
    *   `SlowCount` should be ~100.
    *   Ratio must be close to 10:1. If `FastCount` is significantly lower, the slow task is blocking the fast one (Preemption Failure).

### Case B: Shared Resource Integrity
*   **Config**: Two tasks writing to the same Global Variable.
*   **Code**:
    ```pascal
    (* Both tasks do atomic add if supported, or read-modify-write *)
    Global.SharedCounter := Global.SharedCounter + 1;
    ```
*   **Verification**:
    *   Check for race conditions (lost updates) if tasks run on different cores (SMP schedulers).

## 4. Execution Protocol for the Agent

The agent should follow these steps:

1.  **Compile & Flash**:
    *   Use `west build` to create the ZPLC firmware for `rpi_pico`.
    *   Flash it to the device.
    *   Verify boot message via Serial Monitor (`minicom` or `tio`).

2.  **Generate Bytecode**:
    *   Create a ZPLC project (`zplc.json`) incorporating Case A.
    *   Use the IDE/Compiler to generate `test_multitask.zplc`.

3.  **Deploy & Run**:
    *   Use `zplc load` (via `ide/src/uploader/webserial.ts` or raw python script) to upload the binary.
    *   Send `zplc start`.

4.  **Monitor**:
    *   Use `zplc stats` output if available to see cycle jitter.
    *   Alternatively, define `OPI` mapping to physical GPIOs:
        *   `FastTask` toggles LED (GP25).
        *   Measure frequency with oscilloscope or Logic Analyzer (Expect 50Hz for 10ms toggle).

## 5. Success Criteria
*   [ ] Firmware builds and boots on Pico.
*   [ ] `zplc start` initiates execution.
*   [ ] Tasks execute close to defined periods (±10% jitter acceptable depending on USB logging overhead).
*   [ ] No Hard Faults or Stack Overflows reported by Zephyr.
