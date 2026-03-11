/**
 * @file main.c
 * @brief ZPLC Runtime Entry Point
 *
 * SPDX-License-Identifier: MIT
 *
 * Phase 0: Dummy runtime that prints "Tick" every 100ms.
 * This validates the build system and HAL timing functions.
 *
 * Future phases will:
 * - Load a .zplc binary
 * - Initialize the VM
 * - Run the scan cycle
 */

#include <zplc_hal.h>
#include <signal.h>

/* ============================================================================
 * Signal Handling
 * ============================================================================
 * Industrial code needs clean shutdown. Ctrl+C should not leave IO in
 * an undefined state.
 */

static volatile int running = 1;

/**
 * @brief Signal handler for graceful shutdown.
 *
 * Catches SIGINT (Ctrl+C) and SIGTERM to allow clean exit.
 */
static void signal_handler(int sig)
{
    (void)sig;
    running = 0;
    zplc_hal_log("\n[RUNTIME] Shutdown requested...\n");
}

/* ============================================================================
 * Main Entry Point
 * ============================================================================ */

int main(void)
{
    uint32_t tick;
    uint32_t last_tick;
    uint32_t cycle_count = 0;

    /* Banner */
    zplc_hal_log("================================================\n");
    zplc_hal_log("  ZPLC Runtime v0.1.0\n");
    zplc_hal_log("  Phase 0: Build System Validation\n");
    zplc_hal_log("================================================\n");

    /* Set up signal handlers for clean shutdown */
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);

    /* Initialize HAL */
    if (zplc_hal_init() != ZPLC_HAL_OK) {
        zplc_hal_log("[RUNTIME] ERROR: HAL initialization failed!\n");
        return 1;
    }

    /* Get initial tick for relative timing */
    last_tick = zplc_hal_tick();
    zplc_hal_log("[RUNTIME] Starting scan loop (100ms cycle)...\n");
    zplc_hal_log("[RUNTIME] Press Ctrl+C to stop.\n\n");

    /*
     * Main scan loop.
     *
     * In a real PLC runtime, this would be:
     * 1. Read inputs (HAL_IO_Read -> Process Image)
     * 2. Execute tasks (VM cycle)
     * 3. Write outputs (Process Image -> HAL_IO_Write)
     * 4. Handle comms/debug
     *
     * For Phase 0, we just tick and log.
     */
    while (running) {
        /* Get current tick */
        tick = zplc_hal_tick();

        /* Log the tick - this is our "proof of life" */
        zplc_hal_log("Tick at %u ms (cycle #%u)\n", tick, cycle_count);

        /*
         * Store for jitter calculation in future phases.
         * For now, just track it.
         */
        last_tick = tick;
        cycle_count++;

        /*
         * Sleep for 100ms.
         * In production, we'd calculate remaining time based on
         * cycle execution duration to maintain precise timing.
         */
        zplc_hal_sleep(100);
    }

    /* Suppress unused variable warning */
    (void)last_tick;

    /* Clean shutdown */
    zplc_hal_log("\n[RUNTIME] Completed %u cycles.\n", cycle_count);
    zplc_hal_log("[RUNTIME] Shutting down...\n");

    zplc_hal_shutdown();

    zplc_hal_log("[RUNTIME] Goodbye.\n");

    return 0;
}
