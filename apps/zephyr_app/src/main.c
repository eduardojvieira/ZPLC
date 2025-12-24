/**
 * @file main.c
 * @brief ZPLC Zephyr Runtime - Phase 2.5 Integration
 *
 * SPDX-License-Identifier: MIT
 *
 * This is the real ZPLC execution engine running on Zephyr.
 * It loads embedded bytecode and executes it cyclically.
 */

#include <zephyr/kernel.h>
#include <zplc_hal.h>
#include <zplc_core.h>
#include <zplc_isa.h>

/* ============================================================================
 * Configuration
 * ============================================================================ */

/** @brief Cycle time in milliseconds */
#define ZPLC_CYCLE_TIME_MS      100

/** @brief Maximum instructions per cycle (watchdog budget) */
#define ZPLC_MAX_INSTRUCTIONS   1000

/** @brief Number of demo cycles to run (0 = infinite) */
#define ZPLC_DEMO_CYCLES        50

/* ============================================================================
 * Embedded Program: Counter
 * ============================================================================
 *
 * This program increments a counter in OPI[0] each cycle.
 * It demonstrates the VM is actually executing real bytecode.
 *
 * Assembly:
 *     LOAD32  0x1000      ; Load counter from OPI[0]
 *     PUSH8   1           ; Push increment value
 *     ADD                 ; counter = counter + 1
 *     STORE32 0x1000      ; Store back to OPI[0]
 *     HALT                ; End this cycle
 *
 * Bytecode breakdown:
 *     82 00 10    LOAD32  0x1000  (opcode=0x82, addr=0x1000 little-endian)
 *     40 01       PUSH8   1       (opcode=0x40, imm8=0x01)
 *     20          ADD             (opcode=0x20)
 *     86 00 10    STORE32 0x1000  (opcode=0x86, addr=0x1000 little-endian)
 *     01          HALT            (opcode=0x01)
 *
 * Total: 12 bytes
 */
static const uint8_t counter_program[] = {
    0x82, 0x00, 0x10,   /* LOAD32  0x1000 */
    0x40, 0x01,         /* PUSH8   1      */
    0x20,               /* ADD            */
    0x86, 0x00, 0x10,   /* STORE32 0x1000 */
    0x01                /* HALT           */
};

/* ============================================================================
 * Embedded Program: Blinky Simulation
 * ============================================================================
 *
 * This program toggles a "LED" bit in OPI[0] each cycle.
 * More visual feedback for debugging.
 *
 * Assembly:
 *     LOAD8   0x1000      ; Load current LED state from OPI[0]
 *     PUSH8   1           ; Push toggle mask
 *     XOR                 ; Toggle the bit
 *     STORE8  0x1000      ; Store back
 *     HALT
 *
 * Bytecode:
 *     80 00 10    LOAD8   0x1000
 *     40 01       PUSH8   1
 *     32          XOR
 *     84 00 10    STORE8  0x1000
 *     01          HALT
 */
static const uint8_t blinky_program[] = {
    0x80, 0x00, 0x10,   /* LOAD8   0x1000 */
    0x40, 0x01,         /* PUSH8   1      */
    0x32,               /* XOR            */
    0x84, 0x00, 0x10,   /* STORE8  0x1000 */
    0x01                /* HALT           */
};

/* Select which program to run */
#define USE_COUNTER_PROGRAM 1

#if USE_COUNTER_PROGRAM
    #define PROGRAM_NAME    "Counter"
    #define PROGRAM_DATA    counter_program
    #define PROGRAM_SIZE    sizeof(counter_program)
#else
    #define PROGRAM_NAME    "Blinky"
    #define PROGRAM_DATA    blinky_program
    #define PROGRAM_SIZE    sizeof(blinky_program)
#endif

/* ============================================================================
 * Main Entry Point
 * ============================================================================ */

int main(void)
{
    int ret;
    uint32_t tick_start, tick_end, elapsed;
    uint32_t cycle_count = 0;
    int instructions_executed;
    const zplc_vm_state_t *state;

    /* ===== Banner ===== */
    zplc_hal_log("================================================\n");
    zplc_hal_log("  ZPLC Runtime - Zephyr Target\n");
    zplc_hal_log("  Core Version: %s\n", zplc_core_version());
    zplc_hal_log("  Phase 2.5: Runtime Integration\n");
    zplc_hal_log("================================================\n");
    zplc_hal_log("  Stack Depth:  %d\n", ZPLC_STACK_MAX_DEPTH);
    zplc_hal_log("  Call Depth:   %d\n", ZPLC_CALL_STACK_MAX);
    zplc_hal_log("  Work Memory:  %u bytes\n", (unsigned)ZPLC_MEM_WORK_SIZE);
    zplc_hal_log("  Code Max:     %u bytes\n", (unsigned)ZPLC_MEM_CODE_SIZE);
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

    /* ===== Load Program ===== */
    zplc_hal_log("[LOAD] Loading program: %s (%u bytes)\n", 
                 PROGRAM_NAME, (unsigned)PROGRAM_SIZE);
    
    ret = zplc_core_load_raw(PROGRAM_DATA, PROGRAM_SIZE);
    if (ret != 0) {
        zplc_hal_log("[LOAD] ERROR: Failed to load program: %d\n", ret);
        return ret;
    }
    zplc_hal_log("[LOAD] Program loaded successfully.\n\n");

    /* ===== Execution Loop ===== */
    zplc_hal_log("[RUN] Starting execution loop...\n");
    zplc_hal_log("[RUN] Cycle time: %d ms, Max instructions: %d\n\n",
                 ZPLC_CYCLE_TIME_MS, ZPLC_MAX_INSTRUCTIONS);

    while (ZPLC_DEMO_CYCLES == 0 || cycle_count < ZPLC_DEMO_CYCLES) {
        tick_start = zplc_hal_tick();

        /* Run one scan cycle */
        instructions_executed = zplc_core_run_cycle();
        
        if (instructions_executed < 0) {
            /* VM error occurred */
            zplc_hal_log("[ERR] Cycle %u: VM error %d\n", 
                         cycle_count, zplc_core_get_error());
            break;
        }

        /* Get VM state for diagnostics */
        state = zplc_core_get_state();

        /* Read output for display */
        uint32_t opi_value = zplc_core_get_opi(0);

        /* Periodic status log (every 10 cycles) */
        if (cycle_count % 10 == 0) {
            zplc_hal_log("[CYCLE %3u] OPI[0]=%u, Instructions=%d, PC=%u, SP=%u\n",
                         cycle_count, opi_value, instructions_executed,
                         state->pc, state->sp);
        }

        cycle_count++;

        /* Calculate time spent and sleep for remainder of cycle */
        tick_end = zplc_hal_tick();
        elapsed = tick_end - tick_start;
        
        if (elapsed < ZPLC_CYCLE_TIME_MS) {
            zplc_hal_sleep(ZPLC_CYCLE_TIME_MS - elapsed);
        } else {
            /* Cycle overrun - log warning but continue */
            zplc_hal_log("[WARN] Cycle overrun: %u ms > %d ms\n", 
                         elapsed, ZPLC_CYCLE_TIME_MS);
        }
    }

    /* ===== Summary ===== */
    zplc_hal_log("\n================================================\n");
    zplc_hal_log("  Execution Complete\n");
    zplc_hal_log("  Total Cycles: %u\n", cycle_count);
    zplc_hal_log("  Final OPI[0]: %u\n", zplc_core_get_opi(0));
    zplc_hal_log("  VM Status:    %s\n", 
                 zplc_core_is_halted() ? "HALTED" : "RUNNING");
    zplc_hal_log("================================================\n");

    /* ===== Shutdown ===== */
    zplc_core_shutdown();
    zplc_hal_shutdown();

    return 0;
}
