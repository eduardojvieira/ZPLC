/**
 * @file main.c
 * @brief ZPLC Zephyr Runtime - Phase 3 Integration
 *
 * SPDX-License-Identifier: MIT
 *
 * This is the real ZPLC execution engine running on Zephyr.
 * It supports dynamic program loading via shell commands and
 * synchronizes the Output Process Image (OPI) to physical GPIO.
 *
 * Features:
 *   - Dynamic bytecode loading via UART shell
 *   - Cyclic VM execution with configurable timing
 *   - OPI to GPIO synchronization (outputs 0-3)
 *   - GPIO to IPI synchronization (inputs 4-7)
 */

#include <zephyr/kernel.h>
#include <zplc_hal.h>
#include <zplc_core.h>
#include <zplc_isa.h>

#include <string.h>

/* ============================================================================
 * Configuration
 * ============================================================================ */

/** @brief Cycle time in milliseconds */
#define ZPLC_CYCLE_TIME_MS      100

/** @brief Maximum instructions per cycle (watchdog budget) */
#define ZPLC_MAX_INSTRUCTIONS   1000

/** @brief Program buffer size (4 KB) */
#define ZPLC_PROGRAM_BUFFER_SIZE    4096

/** @brief Number of GPIO output channels */
#define ZPLC_GPIO_OUTPUT_COUNT  4

/** @brief Number of GPIO input channels */
#define ZPLC_GPIO_INPUT_COUNT   4

/* ============================================================================
 * Runtime State (shared with shell_cmds.c)
 * ============================================================================ */

/**
 * @brief Runtime state enumeration
 */
typedef enum {
    ZPLC_STATE_IDLE = 0,    /**< No program loaded or stopped */
    ZPLC_STATE_LOADING,     /**< Receiving bytecode over serial */
    ZPLC_STATE_READY,       /**< Program loaded, ready to run */
    ZPLC_STATE_RUNNING,     /**< VM executing cyclically */
    ZPLC_STATE_PAUSED,      /**< VM paused (for debugging) */
    ZPLC_STATE_ERROR,       /**< Error occurred */
} zplc_runtime_state_t;

/** @brief Program buffer for dynamic loading */
uint8_t program_buffer[ZPLC_PROGRAM_BUFFER_SIZE];

/** @brief Size of program buffer (for shell_cmds.c) */
size_t program_buffer_size = ZPLC_PROGRAM_BUFFER_SIZE;

/** @brief Current runtime state */
volatile zplc_runtime_state_t runtime_state = ZPLC_STATE_IDLE;

/** @brief Expected program size (set by 'zplc load') */
volatile size_t program_expected_size = 0;

/** @brief Actually received program size */
volatile size_t program_received_size = 0;

/** @brief Cycle counter */
volatile uint32_t cycle_count = 0;

/** @brief Step request flag (set by 'zplc dbg step', cleared after one cycle) */
volatile int step_requested = 0;

/* ============================================================================
 * Embedded Demo Programs (used when no program loaded)
 * ============================================================================ */

/**
 * Blinky program - toggles OPI[0] bit 0 each cycle
 *
 * Assembly:
 *     LOAD8   0x1000      ; Load current state from OPI[0]
 *     PUSH8   1           ; Push toggle mask
 *     XOR                 ; Toggle bit 0
 *     STORE8  0x1000      ; Store back
 *     HALT
 */
static const uint8_t blinky_demo[] = {
    0x80, 0x00, 0x10,   /* LOAD8   0x1000 */
    0x40, 0x01,         /* PUSH8   1      */
    0x32,               /* XOR            */
    0x84, 0x00, 0x10,   /* STORE8  0x1000 */
    0x01                /* HALT           */
};

/* ============================================================================
 * I/O Synchronization
 * ============================================================================ */

/**
 * @brief Sync inputs from GPIO to IPI (Input Process Image)
 *
 * Reads physical inputs (buttons/switches) and writes to IPI[0..3]
 * so the VM can access them via LOAD instructions from address 0x0000.
 */
static void sync_gpio_to_ipi(void)
{
    uint8_t value;
    
    for (int i = 0; i < ZPLC_GPIO_INPUT_COUNT; i++) {
        /* GPIO inputs are channels 4-7 in HAL, mapped to IPI bytes 0-3 */
        if (zplc_hal_gpio_read(4 + i, &value) == ZPLC_HAL_OK) {
            zplc_core_set_ipi(i, value);
        }
    }
}

/**
 * @brief Sync outputs from OPI (Output Process Image) to GPIO
 *
 * Reads OPI bytes and writes to physical outputs (LEDs).
 * OPI[0] bit 0 -> LED0, OPI[1] bit 0 -> LED1, etc.
 */
static void sync_opi_to_gpio(void)
{
    for (int i = 0; i < ZPLC_GPIO_OUTPUT_COUNT; i++) {
        /* Read OPI byte and write bit 0 to corresponding GPIO */
        uint8_t opi_value = (uint8_t)zplc_core_get_opi(i);
        zplc_hal_gpio_write(i, opi_value & 0x01);
    }
}

/* ============================================================================
 * Main Entry Point
 * ============================================================================ */

int main(void)
{
    int ret;
    uint32_t tick_start, tick_end, elapsed;
    int instructions_executed;

    /* ===== Banner ===== */
    zplc_hal_log("================================================\n");
    zplc_hal_log("  ZPLC Runtime - Zephyr Target\n");
    zplc_hal_log("  Core Version: %s\n", zplc_core_version());
    zplc_hal_log("  Phase 3: Hardware Integration\n");
    zplc_hal_log("================================================\n");
    zplc_hal_log("  Stack Depth:  %d\n", ZPLC_STACK_MAX_DEPTH);
    zplc_hal_log("  Call Depth:   %d\n", ZPLC_CALL_STACK_MAX);
    zplc_hal_log("  Work Memory:  %u bytes\n", (unsigned)ZPLC_MEM_WORK_SIZE);
    zplc_hal_log("  Code Max:     %u bytes\n", (unsigned)ZPLC_MEM_CODE_SIZE);
    zplc_hal_log("  Buffer:       %u bytes\n", (unsigned)ZPLC_PROGRAM_BUFFER_SIZE);
    zplc_hal_log("================================================\n\n");

    /* ===== System Initialization ===== */
    zplc_hal_log("[INIT] Initializing HAL...\n");
    ret = zplc_hal_init();
    if (ret != ZPLC_HAL_OK) {
        zplc_hal_log("[INIT] ERROR: HAL init failed: %d\n", ret);
        return ret;
    }

    zplc_hal_log("[INIT] Initializing VM Core...\n");
    ret = zplc_core_init();
    if (ret != 0) {
        zplc_hal_log("[INIT] ERROR: Core init failed: %d\n", ret);
        return ret;
    }

    /* ===== Load Demo Program ===== */
    zplc_hal_log("[INIT] Loading blinky demo (%u bytes)...\n",
                 (unsigned)sizeof(blinky_demo));
    
    memcpy(program_buffer, blinky_demo, sizeof(blinky_demo));
    program_received_size = sizeof(blinky_demo);
    
    ret = zplc_core_load_raw(program_buffer, program_received_size);
    if (ret != 0) {
        zplc_hal_log("[INIT] ERROR: Failed to load demo: %d\n", ret);
        runtime_state = ZPLC_STATE_ERROR;
    } else {
        runtime_state = ZPLC_STATE_RUNNING;
        zplc_hal_log("[INIT] Demo loaded, starting execution.\n");
    }

    zplc_hal_log("[INIT] Shell ready. Use 'zplc help' for commands.\n\n");

    /* ===== Main Execution Loop ===== */
    while (1) {
        tick_start = zplc_hal_tick();

        switch (runtime_state) {
            case ZPLC_STATE_RUNNING:
                /* === Phase 1: Read Inputs === */
                sync_gpio_to_ipi();
                
                /* === Phase 2: Execute Program === */
                instructions_executed = zplc_core_run_cycle();
                
                if (instructions_executed < 0) {
                    zplc_hal_log("[ERR] Cycle %u: VM error %d\n",
                                 cycle_count, zplc_core_get_error());
                    runtime_state = ZPLC_STATE_ERROR;
                    break;
                }
                
                /* === Phase 3: Write Outputs === */
                sync_opi_to_gpio();
                
                /* === Phase 4: Logging (periodic) === */
                if (cycle_count % 50 == 0) {
                    zplc_hal_log("[RUN] Cycle %u: OPI[0]=%u, Instrs=%d\n",
                                 cycle_count,
                                 (uint8_t)zplc_core_get_opi(0),
                                 instructions_executed);
                }
                
                cycle_count++;
                break;

            case ZPLC_STATE_PAUSED:
                /* Paused state - execute one cycle only if step requested */
                if (step_requested) {
                    step_requested = 0;
                    
                    /* Execute one cycle */
                    sync_gpio_to_ipi();
                    instructions_executed = zplc_core_run_cycle();
                    
                    if (instructions_executed < 0) {
                        zplc_hal_log("[DBG] Step error: %d\n", zplc_core_get_error());
                        runtime_state = ZPLC_STATE_ERROR;
                        break;
                    }
                    
                    sync_opi_to_gpio();
                    cycle_count++;
                    
                    zplc_hal_log("[DBG] Step: cycle=%u, OPI[0]=%u\n",
                                 cycle_count, (uint8_t)zplc_core_get_opi(0));
                }
                /* Keep outputs active while paused (for debugging) */
                break;

            case ZPLC_STATE_IDLE:
            case ZPLC_STATE_LOADING:
            case ZPLC_STATE_READY:
            case ZPLC_STATE_ERROR:
            default:
                /* Turn off outputs when not running */
                for (int i = 0; i < ZPLC_GPIO_OUTPUT_COUNT; i++) {
                    zplc_hal_gpio_write(i, 0);
                }
                break;
        }

        /* === Timing: Maintain cycle time === */
        tick_end = zplc_hal_tick();
        elapsed = tick_end - tick_start;
        
        if (elapsed < ZPLC_CYCLE_TIME_MS) {
            zplc_hal_sleep(ZPLC_CYCLE_TIME_MS - elapsed);
        } else if (runtime_state == ZPLC_STATE_RUNNING && elapsed > ZPLC_CYCLE_TIME_MS) {
            /* Only warn on overruns when actively running */
            zplc_hal_log("[WARN] Cycle overrun: %u ms > %d ms\n",
                         elapsed, ZPLC_CYCLE_TIME_MS);
        }
    }

    /* Never reached in normal operation */
    zplc_core_shutdown();
    zplc_hal_shutdown();
    
    return 0;
}
