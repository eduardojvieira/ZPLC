# ZPLC Zephyr Runtime Application

This is the reference implementation of the ZPLC runtime for Zephyr RTOS targets. It provides a shell-driven environment for dynamic bytecode loading, multitask execution, and persistent program storage.

## 🚀 Features

- **Dynamic Loading**: Use the `zplc load` command to inject bytecode over UART into RAM. No re-flashing required to change PLC logic.
- **Shell Integration**: Full control via Zephyr Shell (Stop/Start/Reset/Monitor).
- **IO Sync**: Automatically maps `IPI` (Inputs) and `OPI` (Outputs) to physical GPIO defined in the DeviceTree.
- **Multitask Scheduler**: Run multiple concurrent tasks with different intervals and priorities.
- **Program Persistence**: Programs are saved to NVS and automatically restored on boot.

## 🛠️ Build & Flash

Ensure you have the Zephyr environment activated.

```bash
# Activate environment
source ~/zephyrproject/activate.sh

# Build for Raspberry Pi Pico
west build -b rpi_pico $ZEPLC_PATH/apps/zephyr_app --pristine

# Flash via BOOTSEL mode
cp build/zephyr/zephyr.uf2 /Volumes/RPI-RP2/

# Or build for QEMU
west build -b mps2/an385 $ZEPLC_PATH/apps/zephyr_app
west build -t run
```

## 🐚 Shell Commands

### Program Management

| Command                 | Description                                            |
| ----------------------- | ------------------------------------------------------ |
| `zplc version`          | Show Core and ISA version.                             |
| `zplc load <size>`      | Prepare to receive `<size>` bytes of bytecode.         |
| `zplc data <hex_bytes>` | Send a chunk of bytecode (64 chars max).               |
| `zplc start`            | Initialize VM and start execution (auto-saves to NVS). |
| `zplc stop`             | Stop VM execution.                                     |
| `zplc status`           | Show current VM state (Running/Halted/Error).          |
| `zplc reset`            | Clear all memory regions (IPI/OPI/Work/RETAIN).        |

### Persistence (NVS)

| Command              | Description                                       |
| -------------------- | ------------------------------------------------- |
| `zplc persist info`  | Show saved program info (size, auto-load status). |
| `zplc persist clear` | Erase saved program from Flash.                   |

### Debugging

| Command                          | Description                                                 |
| -------------------------------- | ----------------------------------------------------------- |
| `zplc dbg pause`                 | Pause execution at next cycle.                              |
| `zplc dbg resume`                | Resume execution.                                           |
| `zplc dbg step`                  | Execute one cycle.                                          |
| `zplc dbg peek <addr>`           | Read memory (hex dump).                                     |
| `zplc dbg poke <addr> <val>`     | Write byte to IPI.                                          |
| `zplc dbg info`                  | Detailed VM state.                                          |
| `zplc dbg ticks`                 | Show current system tick (ms).                              |
| `zplc dbg mem <region> [offset]` | Dump memory region (ipi/opi/work/retain).                   |
| `zplc dbg task <id>`             | Show task details by ID.                                    |
| `zplc dbg watch <addr> [type]`   | Read typed value from address (u8/u16/u32/i8/i16/i32/bool). |
| `zplc dbg timer <addr>`          | Inspect TON/TOF/TP timer at address.                        |

### Scheduler (Multitask)

| Command             | Description                |
| ------------------- | -------------------------- |
| `zplc sched status` | Scheduler statistics.      |
| `zplc sched tasks`  | List all registered tasks. |

## 📤 Uploading Programs

Programs are uploaded in chunks via serial. Example using Python:

```python
import serial
import time

ser = serial.Serial('/dev/cu.usbmodem11401', 115200)

# 1. Load (specify total size)
ser.write(b'zplc load 167\r\n')
time.sleep(0.3)

# 2. Send hex data in 64-char chunks
hex_data = "5a504c4301000100..."  # Your bytecode
for i in range(0, len(hex_data), 64):
    chunk = hex_data[i:i+64]
    ser.write(f'zplc data {chunk}\r\n'.encode())
    time.sleep(0.3)

# 3. Start (also saves to NVS)
ser.write(b'zplc start\r\n')
```

## 💾 Program Persistence

Programs are automatically saved to Flash (NVS) when you run `zplc start`. On the next boot, the program is automatically restored and started.

```bash
# Check if a program is saved
uart:~$ zplc persist info
Saved program: 167 bytes
Will auto-load on next boot

# Clear saved program
uart:~$ zplc persist clear
Program cleared from NVS
```

### NVS Configuration

Boards must define a `storage_partition` in their DeviceTree overlay:

```dts
&flash0 {
    partitions {
        compatible = "fixed-partitions";
        #address-cells = <1>;
        #size-cells = <1>;

        storage_partition: partition@1f0000 {
            label = "storage";
            reg = <0x1f0000 0x10000>;  /* 64KB at end of flash */
        };
    };
};
```

## 📐 Memory Configuration

Default memory sizes are configured in `prj.conf`. Override in board-specific overlays if needed:

```ini
# Core memory sizes
CONFIG_ZPLC_WORK_MEMORY_SIZE=8192
CONFIG_ZPLC_RETAIN_MEMORY_SIZE=4096
CONFIG_ZPLC_CODE_SIZE_MAX=4096

# Scheduler
CONFIG_ZPLC_SCHEDULER=y
CONFIG_ZPLC_MAX_TASKS=4

# Persistence
CONFIG_FLASH=y
CONFIG_FLASH_PAGE_LAYOUT=y
CONFIG_FLASH_MAP=y
CONFIG_NVS=y
```

## 🎯 Supported Boards

| Board               | Zephyr ID                        | Notes                     |
| ------------------- | -------------------------------- | ------------------------- |
| Raspberry Pi Pico   | `rpi_pico`                       | Tested, persistence works |
| STM32 Nucleo-H743ZI | `nucleo_h743zi`                  | High-performance          |
| STM32F746G-DISCO    | `stm32f746g_disco`               | TFT display, touch, audio |
| Arduino Giga R1     | `arduino_giga_r1/stm32h747xx/m7` | Dual-core                 |
| ESP32-S3 DevKit     | `esp32s3_devkitc`                | WiFi/BLE capable          |
| QEMU                | `mps2/an385`                     | For CI/testing            |
