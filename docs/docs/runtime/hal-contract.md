---
id: hal-contract
title: Hardware Abstraction Layer
sidebar_label: HAL Contract
description: The HAL contract required to port ZPLC to new hardware.
tags: [runtime, embedded, hal]
---

# Hardware Abstraction Layer (HAL) Contract

The HAL is the boundary between the deterministic ZPLC Virtual Machine and the physical hardware (or OS) it runs on. To port ZPLC to a new target, you *must* implement the functions defined in this contract.

## The Sacred Rule

The Core VM (`firmware/lib/zplc_core/src/core/`) **MUST NEVER** access hardware registers, Zephyr APIs, POSIX, Win32, or browser APIs directly. All platform calls go through the `zplc_hal_*` functions.

## Required Implementations

When creating a new target (e.g., `firmware/targets/my_custom_board`), you must implement a C file that provides definitions for the following:

### 1. Initialization and Timing
*   `void zplc_hal_init(void);`: Called once at startup to initialize hardware peripherals.
*   `uint64_t zplc_hal_get_time_ms(void);`: Returns the system uptime in milliseconds. Crucial for the scheduler.

### 2. Digital I/O
*   `void zplc_hal_gpio_config(uint8_t pin, uint8_t mode);`: Configures a pin as input or output.
*   `bool zplc_hal_gpio_read(uint8_t pin);`: Reads the state of a digital input.
*   `void zplc_hal_gpio_write(uint8_t pin, bool state);`: Sets the state of a digital output.

### 3. Analog I/O (Optional/Target Dependent)
*   `uint16_t zplc_hal_adc_read(uint8_t channel);`
*   `void zplc_hal_dac_write(uint8_t channel, uint16_t value);`

### 4. Logging & Diagnostics
*   `void zplc_hal_log(const char* level, const char* msg);`: Platform-specific logging (e.g., to UART, or `printk` in Zephyr).

## Example: POSIX HAL Stub

```c
#include "zplc_hal.h"
#include <stdio.h>
#include <time.h>

void zplc_hal_init(void) {
    printf("POSIX HAL Initialized.\n");
}

uint64_t zplc_hal_get_time_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)(ts.tv_sec * 1000) + (ts.tv_nsec / 1000000);
}
// ... further implementations
```