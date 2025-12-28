# Hardware Abstraction Layer (HAL)

The ZPLC Hardware Abstraction Layer provides a portable interface between the VM core and the underlying platform. This design allows the same bytecode to run on embedded RTOS, desktop operating systems, and web browsers.

## Architecture

```mermaid
graph TB
    subgraph "ZPLC Core"
        VM[Virtual Machine]
        Scheduler[Task Scheduler]
    end
    
    subgraph "HAL Interface"
        HAL[zplc_hal.h]
    end
    
    subgraph "Platform Implementations"
        Zephyr[Zephyr HAL]
        POSIX[POSIX HAL]
        WASM[WASM HAL]
    end
    
    VM --> HAL
    Scheduler --> HAL
    HAL --> Zephyr
    HAL --> POSIX
    HAL --> WASM
```

## HAL Functions

The HAL defines a contract of functions that each platform must implement:

### Lifecycle

| Function | Description |
|----------|-------------|
| `zplc_hal_init()` | Initialize the HAL (called once at startup) |
| `zplc_hal_shutdown()` | Clean shutdown of HAL resources |

### Timing

| Function | Description |
|----------|-------------|
| `zplc_hal_tick()` | Returns current system time in milliseconds |
| `zplc_hal_sleep(ms)` | Sleeps for the specified duration |

### GPIO (Digital I/O)

| Function | Description |
|----------|-------------|
| `zplc_hal_gpio_read(channel)` | Read digital input state (0 or 1) |
| `zplc_hal_gpio_write(channel, value)` | Write digital output state |

### Analog I/O

| Function | Description |
|----------|-------------|
| `zplc_hal_adc_read(channel)` | Read analog input (12-bit typical) |
| `zplc_hal_dac_write(channel, value)` | Write analog output |

### Persistence

| Function | Description |
|----------|-------------|
| `zplc_hal_persist_save(addr, data, len)` | Save data to non-volatile storage |
| `zplc_hal_persist_load(addr, data, len)` | Load data from non-volatile storage |

### Logging

| Function | Description |
|----------|-------------|
| `zplc_hal_log(level, msg)` | Output a log message |

## Platform Implementations

### Zephyr RTOS (Primary Target)

The Zephyr HAL leverages Zephyr's device driver model and kernel services:

```c
// Timing uses Zephyr kernel
uint32_t zplc_hal_tick(void) {
    return k_uptime_get_32();
}

void zplc_hal_sleep(uint32_t ms) {
    k_sleep(K_MSEC(ms));
}

// GPIO uses DeviceTree bindings
int zplc_hal_gpio_read(uint8_t channel) {
    return gpio_pin_get_dt(&io_channels[channel]);
}
```

**Configuration via Kconfig:**

```ini
# Enable ZPLC module
CONFIG_ZPLC=y

# Memory configuration
CONFIG_ZPLC_STACK_DEPTH=256
CONFIG_ZPLC_WORK_MEMORY_SIZE=8192
CONFIG_ZPLC_RETAIN_MEMORY_SIZE=4096

# I/O channel count
CONFIG_ZPLC_GPIO_CHANNELS=16
CONFIG_ZPLC_ADC_CHANNELS=8
```

**DeviceTree Overlay:**

```dts
/ {
    zplc {
        compatible = "zplc,runtime";
        digital-inputs = <&gpio0 0>, <&gpio0 1>, <&gpio0 2>;
        digital-outputs = <&gpio1 0>, <&gpio1 1>;
        analog-inputs = <&adc0 0>, <&adc0 1>;
    };
};
```

### POSIX (Linux/macOS/Windows)

The POSIX HAL is designed for development and testing:

```c
uint32_t zplc_hal_tick(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (ts.tv_sec * 1000) + (ts.tv_nsec / 1000000);
}

void zplc_hal_sleep(uint32_t ms) {
    usleep(ms * 1000);
}

// GPIO is simulated via shared memory or file
int zplc_hal_gpio_read(uint8_t channel) {
    return simulated_inputs[channel];
}
```

### WebAssembly (Browser)

The WASM HAL interfaces with JavaScript:

```c
// Imported from JavaScript environment
extern uint32_t js_performance_now(void);
extern void js_set_output(uint8_t channel, int value);
extern int js_get_input(uint8_t channel);

uint32_t zplc_hal_tick(void) {
    return js_performance_now();
}

int zplc_hal_gpio_read(uint8_t channel) {
    return js_get_input(channel);
}
```

## Adding a New Platform

To port ZPLC to a new platform:

1. **Create HAL implementation file:**
   ```
   src/hal/myplatform/zplc_hal_myplatform.c
   ```

2. **Implement all HAL functions:**
   - Start with timing (`tick`, `sleep`)
   - Add GPIO support
   - Add persistence if needed

3. **Update build system:**
   - Add platform detection
   - Link correct HAL implementation

4. **Test with the POSIX test suite:**
   ```bash
   make test HAL=myplatform
   ```

## Implementation Status

| HAL | Timing | GPIO | Analog | Persist | Network |
|-----|--------|------|--------|---------|---------|
| Zephyr | Complete | Complete | Planned | Planned | Planned |
| POSIX | Complete | Simulated | Simulated | File-based | Planned |
| WASM | Complete | JS Bridge | JS Bridge | localStorage | WebSocket |
