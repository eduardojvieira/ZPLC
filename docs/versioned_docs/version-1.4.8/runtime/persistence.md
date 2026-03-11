---
sidebar_position: 3
---

# Persistence & Retain Memory

ZPLC provides mechanisms to ensure your data and program survive power cycles and resets. This is critical for industrial applications where setpoints, counters, and calibration data must be preserved.

## Program Persistence

When you upload a program to a ZPLC controller, it is automatically saved to the device's non-volatile storage (Flash memory).

*   **Mechanism**: Uses Zephyr's **NVS (Non-Volatile Storage)** subsystem.
*   **Behavior**: On boot, the runtime checks NVS. If a valid program is found (verified by CRC), it is loaded into RAM and executed.
*   **Storage Partition**: Requires a dedicated partition in the device's Flash map (usually labeled `storage_partition`).

### Shell Commands

You can manage stored programs via the serial shell:

```bash
zplc persist info    # Show size and version of saved program
zplc persist clear   # Erase the saved program (device will boot empty)
```

## Retentive Memory (RETAIN)

Retentive memory is a special data region used for variables declared with the `RETAIN` keyword. These variables are saved to non-volatile storage during power-down or at specific intervals.

### Declaration (ST)

```st
VAR RETAIN
    setpoint : REAL := 25.5;
    run_hours : UDINT;
END_VAR
```

### How It Works

1.  **Memory Region**: The VM allocates a dedicated 4KB block (default) at `0x4000` for RETAIN variables.
2.  **Auto-Save**: The runtime monitors the power supply (if hardware supports PFI - Power Fail Interrupt) or saves periodically.
3.  **Restore**: On boot, this memory block is re-populated from NVS before the program starts.

### Best Practices

*   **Minimize Writes**: Flash memory has limited write cycles (typically 10k-100k). Avoid writing to RETAIN variables in every cycle. Only update them when values actually change.
*   **Critical Data Only**: Use RETAIN only for data that *must* survive a reboot (e.g., totalizers, configuration parameters). Use standard `VAR` for everything else.

## Hardware Support

| Platform | Storage Backend | Status |
|---|---|---|
| **Zephyr (Embedded)** | NVS (Flash) | ✅ Supported |
| **POSIX (Sim/Desktop)** | File System (`zplc_nv.bin`) | ✅ Supported |
| **WASM (Web)** | `localStorage` | ✅ Supported |

:::info Raspberry Pi Pico Note
On the RP2040 (Pico), the last 64KB of flash is reserved for the file system. Ensure your board definition includes the correct partition layout.
:::
