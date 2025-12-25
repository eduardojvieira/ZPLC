# ZPLC Zephyr Runtime Application

This is the reference implementation of the ZPLC runtime for Zephyr RTOS targets. It provides a shell-driven environment for dynamic bytecode loading and execution.

## 🚀 Features
- **Dynamic Loading**: Use the `zplc load` command to inject bytecode over UART into RAM. No re-flashing required to change PLC logic.
- **Shell Integration**: Full control via Zephyr Shell (Stop/Start/Reset/Monitor).
- **IO Sync**: Automatically maps `IPI` (Inputs) and `OPI` (Outputs) to physical GPIO defined in the DeviceTree.

## 🛠️ Build & Flash

Ensure you have the Zephyr environment activated.

```bash
# Build for your board (e.g. nRF52840 DK)
west build -b nrf52840dk/nrf52840

# Flash to target
west flash

# Monitor via serial
west espressif monitor # (or your preferred tool like screen/minicom)
```

## 🐚 Shell Commands

| Command | Description |
|---------|-------------|
| `zplc version` | Show Core and ISA version. |
| `zplc load <size>` | Prepare to receive `<size>` bytes of bytecode. |
| `zplc data <hex_bytes>`| Send a chunk of bytecode. (Used internally by the IDE). |
| `zplc start` | Initialize VM and start the scan cycle. |
| `zplc stop` | Kill the VM execution. |
| `zplc status` | Show current VM state (Running/Halted/Error). |
| `zplc reset` | Clear all memory regions (IPI/OPI/Work/RETAIN). |

## 📐 Memory Configuration

Default memory sizes are configured in `prj.conf`. You can override these in your board-specific `overlay` if needed:
- `CONFIG_ZPLC_WORK_MEMORY_SIZE`: 8KB
- `CONFIG_ZPLC_RETAIN_MEMORY_SIZE`: 4KB
- `CONFIG_ZPLC_CODE_SIZE_MAX`: 44KB
