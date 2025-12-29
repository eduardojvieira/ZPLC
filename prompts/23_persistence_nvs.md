# Protocol: Implementing Program Persistence (NVS)

## 1. Context & Objective
Currently, `zplc load` stores the bytecode in a volatile RAM buffer (`program_buffer[]`). If the Zephyr device reboots, the program is lost. 
The goal is to implement **Non-Volatile Storage (NVS)** support so that the loaded ZPLC program survives power cycles.

**Key Features:**
1.  **Save on Upload**: Write valid bytecode to internal Flash.
2.  **Restore on Boot**: Automatically load bytecode from Flash into RAM at startup.
3.  **Retain Variables**: (Optional/Phase 2) Persist the `RETAIN` memory region.

## 2. Technical Strategy (Zephyr)

### 2.1 Storage Backend
Use the **Zephyr Settings Subsystem** (`CONFIG_SETTINGS`) backed by **NVS** or a flat **Flash Circular Buffer (FCB)**.
*   *Recommendation*: `CONFIG_SETTINGS=y` and `CONFIG_SETTINGS_NVS=y` is the easiest integration.
*   **Key**: `zplc/code` (binary blob).

### 2.2 HAL Modifications (`zplc_hal_zephyr.c`)

Implement the missing persistence functions:

```c
/* Save buffer to persistent storage */
int zplc_hal_persist_save(const void *data, size_t size, uint8_t type) {
    if (type == ZPLC_PERSIST_CODE) {
         return settings_save_one("zplc/code", data, size);
    }
    // ... handle RETAIN memory later
    return -1;
}

/* Load buffer from persistent storage */
int zplc_hal_persist_load(void *dest, size_t size, uint8_t type) {
    // register settings handler to read "zplc/code" into dest
}
```

### 2.3 Application Logic (`main.c` / `shell_cmds.c`)

1.  **On Successful Load**:
    *   In `cmd_zplc_start()` or when `zplc data` finishes successfully (CRC check passed):
    *   Call `zplc_hal_persist_save(program_buffer, len, ZPLC_PERSIST_CODE)`.
    *   Log: `[ZPLC] Program retained in Flash.`

2.  **On System Boot**:
    *   In `main()` (after HAL init):
    *   Call `zplc_hal_persist_load(program_buffer, MAX_SIZE, ZPLC_PERSIST_CODE)`.
    *   If valid header found (Magic `ZPLC`), automatically initialize the VM.
    *   Log: `[ZPLC] Restored program from Flash.`

## 3. Configuration (`prj.conf`)

Ensure the Zephyr app enables the necessary subsystems:
```ini
CONFIG_FLASH=y
CONFIG_FLASH_PAGE_LAYOUT=y
CONFIG_NVS=y
CONFIG_SETTINGS=y
CONFIG_SETTINGS_NVS=y
```
*(Note: DeviceTree overlay might be needed to define the `storage_partition`).*

## 4. Verification Plan

1.  **Flash & Monitor**:
    *   `west build -b nrf52840dk/nrf52840` (or similar board with Flash).
    *   `west flash` & `west monitor`.

2.  **Test Cycle**:
    *   **Upload**: `zplc load` ... `zplc data` ... -> "Program retained".
    *   **Verify**: `zplc status` -> "Running".
    *   **Hard Reset**: Press the Reset button on the board.
    *   **Check Output**: Look for `[ZPLC] Restored program...`.
    *   **Verify**: `zplc status` -> "Running" (or "Ready" depending on policy).

3.  **Boundary Check**:
    *   Upload a program larger than NVS partition (should fail gracefully).
