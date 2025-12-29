/**
 * @file main.c
 * @brief ZPLC Zephyr Runtime - Multitask Scheduler Demo
 *
 * SPDX-License-Identifier: MIT
 *
 * This demonstrates the ZPLC multitask scheduler with two tasks:
 *   - FastTask: 10ms interval, high priority, increments counter at Work[0]
 *   - SlowTask: 100ms interval, low priority, increments counter at Work[4]
 *
 * Expected result after 10 seconds:
 *   - FastCounter: ~1000 cycles
 *   - SlowCounter: ~100 cycles
 *   - Ratio: 10:1
 *
 * The LED blinks on FastTask cycles (toggles OPI[0]).
 */

#include <zephyr/kernel.h>
#include <zplc_hal.h>
#include <zplc_core.h>
#include <zplc_isa.h>

#ifdef CONFIG_ZPLC_SCHEDULER
#include <zplc_scheduler.h>
#endif

#include <string.h>

/* ============================================================================
 * Configuration
 * ============================================================================ */

/** @brief Test duration in seconds */
#define TEST_DURATION_SEC   10

/** @brief Report interval in seconds */
#define REPORT_INTERVAL_SEC 2

/** @brief Number of GPIO output channels */
#define ZPLC_GPIO_OUTPUT_COUNT  4

/* ============================================================================
 * Test Programs (bytecode)
 * ============================================================================ */

/**
 * FastTask Program - 10ms interval
 *
 * Increments counter at Work Memory [0x2000] (32-bit)
 * Toggles LED at OPI[0] (0x1000)
 *
 * Assembly:
 *     ; Increment counter at WORK[0]
 *     LOAD32  0x2000      ; Load counter
 *     PUSH8   1           ; Push 1
 *     ADD                 ; counter++
 *     STORE32 0x2000      ; Store back
 *
 *     ; Toggle LED at OPI[0]
 *     LOAD8   0x1000      ; Load OPI[0]
 *     PUSH8   1           ; Push toggle mask
 *     XOR                 ; Toggle bit 0
 *     STORE8  0x1000      ; Store back
 *
 *     HALT
 */
static const uint8_t fast_task_code[] = {
    /* LOAD32 0x2000 */
    0x82, 0x00, 0x20,
    /* PUSH8 1 */
    0x40, 0x01,
    /* ADD */
    0x20,
    /* STORE32 0x2000 */
    0x86, 0x00, 0x20,
    
    /* LOAD8 0x1000 */
    0x80, 0x00, 0x10,
    /* PUSH8 1 */
    0x40, 0x01,
    /* XOR */
    0x32,
    /* STORE8 0x1000 */
    0x84, 0x00, 0x10,
    
    /* HALT */
    0x01
};

/**
 * SlowTask Program - 100ms interval
 *
 * Increments counter at Work Memory [0x2004] (32-bit)
 * Sets OPI[1] to indicate activity
 *
 * Assembly:
 *     ; Increment counter at WORK[4]
 *     LOAD32  0x2004      ; Load counter
 *     PUSH8   1           ; Push 1
 *     ADD                 ; counter++
 *     STORE32 0x2004      ; Store back
 *
 *     ; Toggle activity indicator at OPI[1]
 *     LOAD8   0x1001      ; Load OPI[1]
 *     PUSH8   1           ; Push toggle mask
 *     XOR                 ; Toggle
 *     STORE8  0x1001      ; Store back
 *
 *     HALT
 */
static const uint8_t slow_task_code[] = {
    /* LOAD32 0x2004 */
    0x82, 0x04, 0x20,
    /* PUSH8 1 */
    0x40, 0x01,
    /* ADD */
    0x20,
    /* STORE32 0x2004 */
    0x86, 0x04, 0x20,
    
    /* LOAD8 0x1001 */
    0x80, 0x01, 0x10,
    /* PUSH8 1 */
    0x40, 0x01,
    /* XOR */
    0x32,
    /* STORE8 0x1001 */
    0x84, 0x01, 0x10,
    
    /* HALT */
    0x01
};

/* ============================================================================
 * Legacy Single-Task Mode (when scheduler is disabled)
 * ============================================================================ */

#ifndef CONFIG_ZPLC_SCHEDULER

/** @brief Program buffer for dynamic loading */
uint8_t program_buffer[4096];
size_t program_buffer_size = 4096;
volatile size_t program_expected_size = 0;
volatile size_t program_received_size = 0;
volatile uint32_t cycle_count = 0;
volatile int step_requested = 0;

typedef enum {
    ZPLC_STATE_IDLE = 0,
    ZPLC_STATE_LOADING,
    ZPLC_STATE_READY,
    ZPLC_STATE_RUNNING,
    ZPLC_STATE_PAUSED,
    ZPLC_STATE_ERROR,
} zplc_runtime_state_t;

volatile zplc_runtime_state_t runtime_state = ZPLC_STATE_IDLE;

static const uint8_t blinky_demo[] = {
    0x80, 0x00, 0x10,   /* LOAD8   0x1000 */
    0x40, 0x01,         /* PUSH8   1      */
    0x32,               /* XOR            */
    0x84, 0x00, 0x10,   /* STORE8  0x1000 */
    0x01                /* HALT           */
};

static void sync_opi_to_gpio(void)
{
    for (int i = 0; i < ZPLC_GPIO_OUTPUT_COUNT; i++) {
        uint8_t opi_value = (uint8_t)zplc_core_get_opi(i);
        zplc_hal_gpio_write(i, opi_value & 0x01);
    }
}

static int run_legacy_mode(void)
{
    int ret;
    uint32_t tick_start, tick_end, elapsed;
    int instructions_executed;

    zplc_hal_log("[LEGACY] Single-task mode (scheduler disabled)\n");
    
    /* Load demo */
    memcpy(program_buffer, blinky_demo, sizeof(blinky_demo));
    program_received_size = sizeof(blinky_demo);
    
    ret = zplc_core_load_raw(program_buffer, program_received_size);
    if (ret != 0) {
        zplc_hal_log("[INIT] ERROR: Failed to load demo: %d\n", ret);
        return ret;
    }
    
    runtime_state = ZPLC_STATE_RUNNING;
    zplc_hal_log("[INIT] Demo loaded, starting execution.\n");

    while (1) {
        tick_start = zplc_hal_tick();

        if (runtime_state == ZPLC_STATE_RUNNING) {
            instructions_executed = zplc_core_run_cycle();
            
            if (instructions_executed < 0) {
                zplc_hal_log("[ERR] Cycle %u: VM error %d\n",
                             cycle_count, zplc_core_get_error());
                runtime_state = ZPLC_STATE_ERROR;
            }
            
            sync_opi_to_gpio();
            
            if (cycle_count % 50 == 0) {
                zplc_hal_log("[RUN] Cycle %u: OPI[0]=%u\n",
                             cycle_count, (uint8_t)zplc_core_get_opi(0));
            }
            
            cycle_count++;
        }

        tick_end = zplc_hal_tick();
        elapsed = tick_end - tick_start;
        
        if (elapsed < 100) {
            zplc_hal_sleep(100 - elapsed);
        }
    }

    return 0;
}

#endif /* !CONFIG_ZPLC_SCHEDULER */

/* ============================================================================
 * Scheduler Mode
 * ============================================================================ */

#ifdef CONFIG_ZPLC_SCHEDULER

/**
 * @brief Sync OPI to GPIO (called periodically from main thread)
 */
static void sync_opi_to_gpio(void)
{
    for (int i = 0; i < ZPLC_GPIO_OUTPUT_COUNT; i++) {
        uint8_t opi_value = zplc_opi_read8((uint16_t)i);
        zplc_hal_gpio_write(i, opi_value & 0x01);
    }
}

/**
 * @brief Read counters from Work Memory
 */
static void read_counters(uint32_t *fast_count, uint32_t *slow_count)
{
    uint8_t *work = zplc_mem_get_region(ZPLC_MEM_WORK_BASE);
    
    if (work == NULL) {
        *fast_count = 0;
        *slow_count = 0;
        return;
    }
    
    /* Read 32-bit little-endian counters */
    *fast_count = (uint32_t)work[0] | ((uint32_t)work[1] << 8) |
                  ((uint32_t)work[2] << 16) | ((uint32_t)work[3] << 24);
    
    *slow_count = (uint32_t)work[4] | ((uint32_t)work[5] << 8) |
                  ((uint32_t)work[6] << 16) | ((uint32_t)work[7] << 24);
}

static int run_scheduler_mode(void)
{
    int ret;
    int fast_task_id, slow_task_id;
    zplc_task_def_t fast_task_def, slow_task_def;
    zplc_sched_stats_t stats;
    zplc_task_t task_info;
    uint32_t fast_count, slow_count;
    uint32_t start_time, elapsed_sec;
    uint32_t last_report = 0;

    zplc_hal_log("[SCHED] Multitask scheduler mode\n");
    zplc_hal_log("[SCHED] Test duration: %d seconds\n", TEST_DURATION_SEC);

    /* Initialize scheduler */
    ret = zplc_sched_init();
    if (ret != 0) {
        zplc_hal_log("[SCHED] ERROR: Scheduler init failed: %d\n", ret);
        return ret;
    }

    /* Register FastTask: 10ms interval, priority 0 (highest) */
    memset(&fast_task_def, 0, sizeof(fast_task_def));
    fast_task_def.id = 1;
    fast_task_def.type = ZPLC_TASK_CYCLIC;
    fast_task_def.priority = 0;
    fast_task_def.interval_us = 10000;  /* 10ms = 10000us */
    fast_task_def.entry_point = 0;
    fast_task_def.stack_size = 64;

    fast_task_id = zplc_sched_register_task(&fast_task_def, 
                                             fast_task_code, 
                                             sizeof(fast_task_code));
    if (fast_task_id < 0) {
        zplc_hal_log("[SCHED] ERROR: Failed to register FastTask: %d\n", fast_task_id);
        return fast_task_id;
    }
    zplc_hal_log("[SCHED] FastTask registered (id=%d, slot=%d)\n", 
                 fast_task_def.id, fast_task_id);

    /* Register SlowTask: 100ms interval, priority 2 (lower) */
    memset(&slow_task_def, 0, sizeof(slow_task_def));
    slow_task_def.id = 2;
    slow_task_def.type = ZPLC_TASK_CYCLIC;
    slow_task_def.priority = 2;
    slow_task_def.interval_us = 100000; /* 100ms = 100000us */
    slow_task_def.entry_point = 0;
    slow_task_def.stack_size = 64;

    slow_task_id = zplc_sched_register_task(&slow_task_def, 
                                             slow_task_code, 
                                             sizeof(slow_task_code));
    if (slow_task_id < 0) {
        zplc_hal_log("[SCHED] ERROR: Failed to register SlowTask: %d\n", slow_task_id);
        return slow_task_id;
    }
    zplc_hal_log("[SCHED] SlowTask registered (id=%d, slot=%d)\n", 
                 slow_task_def.id, slow_task_id);

    /* Start scheduler */
    zplc_hal_log("[SCHED] Starting scheduler...\n");
    ret = zplc_sched_start();
    if (ret != 0) {
        zplc_hal_log("[SCHED] ERROR: Scheduler start failed: %d\n", ret);
        return ret;
    }

    /* Record start time */
    start_time = zplc_hal_tick();
    zplc_hal_log("[SCHED] Scheduler running. Monitoring for %d seconds...\n\n", 
                 TEST_DURATION_SEC);

    /* Main monitoring loop */
    while (1) {
        k_msleep(500); /* Check every 500ms */

        /* Sync outputs (not inside scheduler - we do it from main thread) */
        zplc_sched_lock(-1);
        sync_opi_to_gpio();
        read_counters(&fast_count, &slow_count);
        zplc_sched_unlock();

        /* Calculate elapsed time */
        elapsed_sec = (zplc_hal_tick() - start_time) / 1000;

        /* Periodic report */
        if (elapsed_sec >= last_report + REPORT_INTERVAL_SEC) {
            last_report = elapsed_sec;
            
            zplc_sched_get_stats(&stats);
            
            zplc_hal_log("[REPORT] Time: %u sec\n", elapsed_sec);
            zplc_hal_log("[REPORT]   FastCounter: %u (expected ~%u)\n", 
                         fast_count, elapsed_sec * 100);
            zplc_hal_log("[REPORT]   SlowCounter: %u (expected ~%u)\n", 
                         slow_count, elapsed_sec * 10);
            
            if (slow_count > 0) {
                zplc_hal_log("[REPORT]   Ratio: %.1f:1 (expected 10:1)\n", 
                             (float)fast_count / (float)slow_count);
            }
            
            zplc_hal_log("[REPORT]   Total cycles: %u, Overruns: %u\n\n",
                         stats.total_cycles, stats.total_overruns);
        }

        /* Check test duration */
        if (elapsed_sec >= TEST_DURATION_SEC) {
            break;
        }
    }

    /* Stop scheduler */
    zplc_sched_stop();

    /* Final report */
    zplc_hal_log("\n================================================\n");
    zplc_hal_log("  MULTITASK SCHEDULER TEST COMPLETE\n");
    zplc_hal_log("================================================\n");
    
    read_counters(&fast_count, &slow_count);
    
    zplc_hal_log("  FastTask cycles:  %u\n", fast_count);
    zplc_hal_log("  SlowTask cycles:  %u\n", slow_count);
    
    if (slow_count > 0) {
        float ratio = (float)fast_count / (float)slow_count;
        zplc_hal_log("  Ratio:            %.2f:1\n", ratio);
        
        if (ratio >= 9.0f && ratio <= 11.0f) {
            zplc_hal_log("  Result:           PASS (within 10%% of expected 10:1)\n");
        } else {
            zplc_hal_log("  Result:           FAIL (expected ratio ~10:1)\n");
        }
    } else {
        zplc_hal_log("  Result:           FAIL (no SlowTask cycles)\n");
    }

    /* Get individual task stats */
    if (zplc_sched_get_task(fast_task_id, &task_info) == 0) {
        zplc_hal_log("\n  FastTask Stats:\n");
        zplc_hal_log("    Cycles:    %u\n", task_info.stats.cycle_count);
        zplc_hal_log("    Overruns:  %u\n", task_info.stats.overrun_count);
        zplc_hal_log("    Max time:  %u us\n", task_info.stats.max_exec_time_us);
        zplc_hal_log("    Avg time:  %u us\n", task_info.stats.avg_exec_time_us);
    }

    if (zplc_sched_get_task(slow_task_id, &task_info) == 0) {
        zplc_hal_log("\n  SlowTask Stats:\n");
        zplc_hal_log("    Cycles:    %u\n", task_info.stats.cycle_count);
        zplc_hal_log("    Overruns:  %u\n", task_info.stats.overrun_count);
        zplc_hal_log("    Max time:  %u us\n", task_info.stats.max_exec_time_us);
        zplc_hal_log("    Avg time:  %u us\n", task_info.stats.avg_exec_time_us);
    }

    zplc_hal_log("================================================\n\n");

    /* Keep running (LED should stop blinking) */
    zplc_hal_log("[SCHED] Test complete. Entering idle loop.\n");
    zplc_hal_log("[SCHED] Shell available. Use 'zplc help' for commands.\n");

    while (1) {
        k_msleep(1000);
    }

    return 0;
}

#endif /* CONFIG_ZPLC_SCHEDULER */

/* ============================================================================
 * Main Entry Point
 * ============================================================================ */

int main(void)
{
    int ret;

    /* ===== Banner ===== */
    zplc_hal_log("\n");
    zplc_hal_log("================================================\n");
    zplc_hal_log("  ZPLC Runtime - Zephyr Target\n");
    zplc_hal_log("  Core Version: %s\n", zplc_core_version());
#ifdef CONFIG_ZPLC_SCHEDULER
    zplc_hal_log("  Mode: Multitask Scheduler\n");
#else
    zplc_hal_log("  Mode: Single Task (Legacy)\n");
#endif
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

    zplc_hal_log("[INIT] Shell ready. Use 'zplc help' for commands.\n\n");

    /* ===== Run appropriate mode ===== */
#ifdef CONFIG_ZPLC_SCHEDULER
    return run_scheduler_mode();
#else
    return run_legacy_mode();
#endif
}
