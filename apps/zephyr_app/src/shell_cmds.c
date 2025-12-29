/**
 * @file shell_cmds.c
 * @brief ZPLC Shell Commands for Serial Upload and Debugging
 *
 * SPDX-License-Identifier: MIT
 *
 * This file provides shell commands for loading, running, and debugging ZPLC
 * programs over a serial connection. This enables the "Click-to-Run"
 * workflow from the IDE.
 *
 * Commands:
 *   zplc load <size>   - Prepare to receive <size> bytes of bytecode
 *   zplc data <hex>    - Receive a chunk of hex-encoded bytecode
 *   zplc start         - Start VM execution
 *   zplc stop          - Stop VM execution
 *   zplc status        - Show VM state and statistics
 *   zplc reset         - Reset VM to initial state
 *
 * Debug Commands:
 *   zplc dbg pause     - Pause VM at next cycle boundary
 *   zplc dbg resume    - Resume VM execution
 *   zplc dbg step      - Execute exactly one cycle
 *   zplc dbg peek <addr> [len] - Read memory (hex dump)
 *   zplc dbg poke <addr> <val> - Write byte to IPI memory
 *   zplc dbg info      - Show detailed VM state
 *
 * Scheduler Commands (when CONFIG_ZPLC_SCHEDULER=y):
 *   zplc sched status  - Show scheduler statistics
 *   zplc sched tasks   - List all registered tasks
 */

#include <zephyr/kernel.h>
#include <zephyr/shell/shell.h>
#include <zplc_core.h>
#include <zplc_hal.h>

#ifdef CONFIG_ZPLC_SCHEDULER
#include <zplc_scheduler.h>
#endif

#include <stdlib.h>
#include <string.h>
#include <ctype.h>

/* ============================================================================
 * Mode-specific Definitions
 * ============================================================================ */

#ifdef CONFIG_ZPLC_SCHEDULER

/*
 * SCHEDULER MODE
 * 
 * In scheduler mode, the shell commands provide status info about
 * the scheduler and tasks. Dynamic program loading goes through the
 * scheduler API, not the legacy buffer system.
 */

/** @brief Persistence keys for saving program to NVS */
#define ZPLC_PERSIST_KEY_CODE   "code"
#define ZPLC_PERSIST_KEY_LEN    "code_len"

/* Local state for dynamic task loading */
static uint8_t shell_program_buffer[4096];
static size_t shell_buffer_size = sizeof(shell_program_buffer);
static size_t shell_expected_size = 0;
static size_t shell_received_size = 0;

typedef enum {
    SHELL_STATE_IDLE = 0,
    SHELL_STATE_LOADING,
    SHELL_STATE_READY,
} shell_load_state_t;

static shell_load_state_t shell_load_state = SHELL_STATE_IDLE;

/* Dynamic task ID (for shell-loaded programs) */
static int shell_task_id = -1;

#else /* Legacy mode */

/*
 * LEGACY MODE
 * 
 * In legacy mode, shell commands control the single-task execution
 * loop in main.c via shared extern variables.
 */

/** @brief Persistence keys for saving program to NVS */
#define ZPLC_PERSIST_KEY_CODE   "code"
#define ZPLC_PERSIST_KEY_LEN    "code_len"

/* VM state enum - must match main.c */
typedef enum {
    ZPLC_STATE_IDLE = 0,    /* No program loaded or stopped */
    ZPLC_STATE_LOADING,     /* Receiving bytecode */
    ZPLC_STATE_READY,       /* Program loaded, ready to run */
    ZPLC_STATE_RUNNING,     /* VM executing */
    ZPLC_STATE_PAUSED,      /* Paused for debugging */
    ZPLC_STATE_ERROR,       /* Error occurred */
} zplc_runtime_state_t;

/* Functions and variables exposed by main.c (legacy mode only) */
extern uint8_t program_buffer[];
extern size_t program_buffer_size;
extern volatile zplc_runtime_state_t runtime_state;
extern volatile size_t program_expected_size;
extern volatile size_t program_received_size;
extern volatile uint32_t cycle_count;
extern volatile int step_requested;

#endif /* CONFIG_ZPLC_SCHEDULER */

/* ============================================================================
 * Helper Functions
 * ============================================================================ */

/**
 * @brief Convert a hex character to its nibble value.
 * @return 0-15 on success, -1 on invalid character
 */
static int hex_char_to_nibble(char c)
{
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

/**
 * @brief Decode a hex string into binary data.
 * @param hex Input hex string (must be even length)
 * @param out Output buffer
 * @param max_out Maximum bytes to write
 * @return Number of bytes decoded, or -1 on error
 */
static int hex_decode(const char *hex, uint8_t *out, size_t max_out)
{
    size_t hex_len = strlen(hex);
    size_t out_len = 0;
    
    /* Hex string must have even length */
    if (hex_len % 2 != 0) {
        return -1;
    }
    
    for (size_t i = 0; i < hex_len && out_len < max_out; i += 2) {
        int hi = hex_char_to_nibble(hex[i]);
        int lo = hex_char_to_nibble(hex[i + 1]);
        
        if (hi < 0 || lo < 0) {
            return -1;
        }
        
        out[out_len++] = (uint8_t)((hi << 4) | lo);
    }
    
    return (int)out_len;
}

#ifndef CONFIG_ZPLC_SCHEDULER
/**
 * @brief Get human-readable state name (legacy mode).
 */
static const char *state_name(zplc_runtime_state_t state)
{
    switch (state) {
        case ZPLC_STATE_IDLE:    return "IDLE";
        case ZPLC_STATE_LOADING: return "LOADING";
        case ZPLC_STATE_READY:   return "READY";
        case ZPLC_STATE_RUNNING: return "RUNNING";
        case ZPLC_STATE_PAUSED:  return "PAUSED";
        case ZPLC_STATE_ERROR:   return "ERROR";
        default:                 return "UNKNOWN";
    }
}
#endif

/* ============================================================================
 * Shell Command Handlers - Common
 * ============================================================================ */

/**
 * @brief Handler for 'zplc version'
 *
 * Shows version information.
 */
static int cmd_zplc_version(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);
    
    shell_print(sh, "ZPLC Runtime v%s", zplc_core_version());
#ifdef CONFIG_ZPLC_SCHEDULER
    shell_print(sh, "Mode: Multitask Scheduler");
    shell_print(sh, "Max Tasks: %d", CONFIG_ZPLC_MAX_TASKS);
#else
    shell_print(sh, "Mode: Single Task (Legacy)");
    shell_print(sh, "Buffer: %zu bytes", program_buffer_size);
#endif
    return 0;
}

/* ============================================================================
 * Shell Command Handlers - Scheduler Mode
 * ============================================================================ */

#ifdef CONFIG_ZPLC_SCHEDULER

/**
 * @brief Handler for 'zplc load <size>' (scheduler mode)
 */
static int cmd_zplc_load(const struct shell *sh, size_t argc, char **argv)
{
    if (argc != 2) {
        shell_error(sh, "Usage: zplc load <size>");
        return -EINVAL;
    }
    
    char *endptr;
    unsigned long size = strtoul(argv[1], &endptr, 10);
    
    if (*endptr != '\0' || size == 0) {
        shell_error(sh, "ERROR: Invalid size");
        return -EINVAL;
    }
    
    if (size > shell_buffer_size) {
        shell_error(sh, "ERROR: Size %lu exceeds buffer (%zu bytes)",
                    size, shell_buffer_size);
        return -ENOMEM;
    }
    
    /* Clear buffer and prepare for loading */
    memset(shell_program_buffer, 0, shell_buffer_size);
    shell_expected_size = size;
    shell_received_size = 0;
    shell_load_state = SHELL_STATE_LOADING;
    
    shell_print(sh, "OK: Ready to receive %lu bytes", size);
    return 0;
}

/**
 * @brief Handler for 'zplc data <hex>' (scheduler mode)
 */
static int cmd_zplc_data(const struct shell *sh, size_t argc, char **argv)
{
    if (argc != 2) {
        shell_error(sh, "Usage: zplc data <hex>");
        return -EINVAL;
    }
    
    if (shell_load_state != SHELL_STATE_LOADING) {
        shell_error(sh, "ERROR: Not in loading state (use 'zplc load' first)");
        return -EINVAL;
    }
    
    const char *hex = argv[1];
    size_t remaining = shell_expected_size - shell_received_size;
    
    int decoded = hex_decode(hex, 
                             shell_program_buffer + shell_received_size,
                             remaining);
    
    if (decoded < 0) {
        shell_error(sh, "ERROR: Invalid hex data");
        shell_load_state = SHELL_STATE_IDLE;
        return -EINVAL;
    }
    
    shell_received_size += decoded;
    
    if (shell_received_size >= shell_expected_size) {
        shell_load_state = SHELL_STATE_READY;
        shell_print(sh, "OK: Received %zu/%zu bytes (complete)",
                    shell_received_size, shell_expected_size);
    } else {
        shell_print(sh, "OK: Received %zu/%zu bytes",
                    shell_received_size, shell_expected_size);
    }
    
    return 0;
}

/**
 * @brief Handler for 'zplc start' (scheduler mode)
 *
 * Registers the loaded program as a new task and starts it.
 * If the program is a .zplc file with TASK segment, loads all tasks.
 */
static int cmd_zplc_start(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);
    
    if (shell_load_state != SHELL_STATE_READY) {
        shell_error(sh, "ERROR: No program loaded");
        return -EINVAL;
    }
    
    /* Check if this is a .zplc file with TASK segment */
    /* Magic: "ZPLC" = 0x5A504C43 (little-endian: 0x434C505A) */
    if (shell_received_size >= 32 &&
        shell_program_buffer[0] == 'Z' &&
        shell_program_buffer[1] == 'P' &&
        shell_program_buffer[2] == 'L' &&
        shell_program_buffer[3] == 'C') {
        
        /* Use zplc_sched_load to parse TASK segment and load all tasks */
        int task_count = zplc_sched_load(shell_program_buffer, shell_received_size);
        
        if (task_count < 0) {
            shell_error(sh, "ERROR: Failed to parse .zplc file: %d", task_count);
            return task_count;
        }
        
        if (task_count == 0) {
            shell_error(sh, "ERROR: No tasks found in .zplc file");
            return -EINVAL;
        }
        
        /* Start the scheduler */
        zplc_sched_start();
        
        /* Save program to NVS for persistence across power cycles */
        {
            uint32_t len32 = (uint32_t)shell_received_size;
            if (zplc_hal_persist_save(ZPLC_PERSIST_KEY_LEN, &len32, sizeof(len32)) == ZPLC_HAL_OK &&
                zplc_hal_persist_save(ZPLC_PERSIST_KEY_CODE, shell_program_buffer, shell_received_size) == ZPLC_HAL_OK) {
                shell_print(sh, "OK: Program retained in Flash");
            } else {
                shell_warn(sh, "WARN: Failed to save program to Flash (will not persist)");
            }
        }
        
        shell_load_state = SHELL_STATE_IDLE;
        shell_print(sh, "OK: Loaded %d tasks from .zplc file", task_count);
        return 0;
    }
    
    /* Legacy single-task mode: register raw bytecode as a single task */
    
    /* Remove old shell task if exists */
    if (shell_task_id >= 0) {
        zplc_sched_unregister_task(shell_task_id);
        shell_task_id = -1;
    }
    
    /* Create task definition for shell-loaded program */
    zplc_task_def_t task_def = {
        .id = 99,  /* Shell task ID */
        .type = ZPLC_TASK_CYCLIC,
        .priority = 3,
        .interval_us = 100000,  /* 100ms default */
        .entry_point = 0,
        .stack_size = 64,
    };
    
    /* Register the task */
    shell_task_id = zplc_sched_register_task(&task_def, 
                                              shell_program_buffer, 
                                              shell_received_size);
    if (shell_task_id < 0) {
        shell_error(sh, "ERROR: Failed to register task: %d", shell_task_id);
        return shell_task_id;
    }
    
    /* Ensure scheduler is running */
    zplc_sched_start();
    
    /* Save program to NVS for persistence across power cycles */
    {
        uint32_t len32 = (uint32_t)shell_received_size;
        if (zplc_hal_persist_save(ZPLC_PERSIST_KEY_LEN, &len32, sizeof(len32)) == ZPLC_HAL_OK &&
            zplc_hal_persist_save(ZPLC_PERSIST_KEY_CODE, shell_program_buffer, shell_received_size) == ZPLC_HAL_OK) {
            shell_print(sh, "OK: Program retained in Flash");
        } else {
            shell_warn(sh, "WARN: Failed to save program to Flash (will not persist)");
        }
    }
    
    shell_load_state = SHELL_STATE_IDLE;
    shell_print(sh, "OK: Task started (slot=%d, %zu bytes)", 
                shell_task_id, shell_received_size);
    return 0;
}

/**
 * @brief Handler for 'zplc stop' (scheduler mode)
 */
static int cmd_zplc_stop(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);
    
    if (shell_task_id >= 0) {
        zplc_sched_unregister_task(shell_task_id);
        shell_task_id = -1;
        shell_print(sh, "OK: Shell task stopped");
    } else {
        shell_print(sh, "OK: No shell task running");
    }
    
    return 0;
}

/**
 * @brief Handler for 'zplc status' (scheduler mode)
 */
static int cmd_zplc_status(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);
    
    zplc_sched_stats_t stats;
    zplc_sched_get_stats(&stats);
    
    shell_print(sh, "=== ZPLC Scheduler Status ===");
    shell_print(sh, "Active Tasks:   %u", stats.active_tasks);
    shell_print(sh, "Total Cycles:   %u", stats.total_cycles);
    shell_print(sh, "Total Overruns: %u", stats.total_overruns);
    shell_print(sh, "Shell Task:     %s", shell_task_id >= 0 ? "active" : "none");
    
    /* Show OPI outputs */
    shell_print(sh, "--- Outputs (OPI) ---");
    shell_print(sh, "OPI[0..3]:  0x%02X 0x%02X 0x%02X 0x%02X",
                zplc_opi_read8(0),
                zplc_opi_read8(1),
                zplc_opi_read8(2),
                zplc_opi_read8(3));
    
    return 0;
}

/**
 * @brief Handler for 'zplc reset' (scheduler mode)
 */
static int cmd_zplc_reset(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);
    
    /* Stop all tasks */
    zplc_sched_stop();
    
    /* Clear shell state */
    if (shell_task_id >= 0) {
        zplc_sched_unregister_task(shell_task_id);
        shell_task_id = -1;
    }
    shell_load_state = SHELL_STATE_IDLE;
    shell_expected_size = 0;
    shell_received_size = 0;
    
    /* Clear memory */
    zplc_mem_init();
    
    /* Turn off all outputs */
    for (int i = 0; i < 4; i++) {
        zplc_hal_gpio_write(i, 0);
    }
    
    shell_print(sh, "OK: Reset complete");
    return 0;
}

/**
 * @brief Handler for 'zplc sched status'
 */
static int cmd_sched_status(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);
    
    zplc_sched_stats_t stats;
    zplc_sched_get_stats(&stats);
    
    shell_print(sh, "=== Scheduler Statistics ===");
    shell_print(sh, "Active Tasks:   %u / %d", stats.active_tasks, CONFIG_ZPLC_MAX_TASKS);
    shell_print(sh, "Total Cycles:   %u", stats.total_cycles);
    shell_print(sh, "Total Overruns: %u", stats.total_overruns);
    shell_print(sh, "Uptime:         %u ms", k_uptime_get_32());
    
    return 0;
}

/**
 * @brief Handler for 'zplc sched tasks'
 */
static int cmd_sched_tasks(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);
    
    shell_print(sh, "=== Registered Tasks ===");
    shell_print(sh, "Slot  ID    Prio  Interval   Cycles    Overruns");
    shell_print(sh, "----  ----  ----  ---------  --------  --------");
    
    for (int i = 0; i < CONFIG_ZPLC_MAX_TASKS; i++) {
        zplc_task_t task;
        if (zplc_sched_get_task(i, &task) == 0) {
            shell_print(sh, "%4d  %4d  %4d  %7u us  %8u  %8u",
                        i,
                        task.config.id,
                        task.config.priority,
                        task.config.interval_us,
                        task.stats.cycle_count,
                        task.stats.overrun_count);
        }
    }
    
    return 0;
}

/* Scheduler subcommands */
SHELL_STATIC_SUBCMD_SET_CREATE(sub_sched,
    SHELL_CMD(status, NULL, "Show scheduler statistics", cmd_sched_status),
    SHELL_CMD(tasks, NULL, "List registered tasks", cmd_sched_tasks),
    SHELL_SUBCMD_SET_END
);

/* ============================================================================
 * Persistence Command Handlers
 * ============================================================================ */

/**
 * @brief Handler for 'zplc persist clear'
 *
 * Erases the saved program from Flash/NVS so it won't auto-load on next boot.
 */
static int cmd_persist_clear(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);
    
    zplc_hal_result_t ret1, ret2;
    
    /* Delete both code and length keys */
    ret1 = zplc_hal_persist_delete(ZPLC_PERSIST_KEY_CODE);
    ret2 = zplc_hal_persist_delete(ZPLC_PERSIST_KEY_LEN);
    
    if (ret1 == ZPLC_HAL_OK || ret2 == ZPLC_HAL_OK) {
        shell_print(sh, "OK: Cleared saved program from Flash");
    } else if (ret1 == ZPLC_HAL_NOT_IMPL && ret2 == ZPLC_HAL_NOT_IMPL) {
        shell_print(sh, "OK: No saved program found");
    } else {
        shell_error(sh, "ERROR: Failed to clear persistence");
        return -EIO;
    }
    
    return 0;
}

/**
 * @brief Handler for 'zplc persist info'
 *
 * Shows information about saved program in Flash/NVS.
 */
static int cmd_persist_info(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);
    
    uint32_t saved_len = 0;
    zplc_hal_result_t ret;
    
    ret = zplc_hal_persist_load(ZPLC_PERSIST_KEY_LEN, &saved_len, sizeof(saved_len));
    
    if (ret == ZPLC_HAL_OK && saved_len > 0) {
        shell_print(sh, "Saved program: %u bytes", saved_len);
        shell_print(sh, "Will auto-load on next boot");
    } else {
        shell_print(sh, "No saved program in Flash");
    }
    
    return 0;
}

/* Persist subcommands */
SHELL_STATIC_SUBCMD_SET_CREATE(sub_persist,
    SHELL_CMD(clear, NULL, "Erase saved program from Flash", cmd_persist_clear),
    SHELL_CMD(info, NULL, "Show saved program info", cmd_persist_info),
    SHELL_SUBCMD_SET_END
);

/* Debug commands - scheduler mode (simplified) */
static int cmd_dbg_peek(const struct shell *sh, size_t argc, char **argv)
{
    if (argc < 2) {
        shell_error(sh, "Usage: zplc dbg peek <addr> [len]");
        return -EINVAL;
    }
    
    char *endptr;
    unsigned long addr = strtoul(argv[1], &endptr, 0);
    if (*endptr != '\0') {
        shell_error(sh, "ERROR: Invalid address");
        return -EINVAL;
    }
    
    unsigned long len = 16;
    if (argc >= 3) {
        len = strtoul(argv[2], &endptr, 0);
        if (*endptr != '\0' || len == 0 || len > 256) {
            shell_error(sh, "ERROR: Invalid length (1-256)");
            return -EINVAL;
        }
    }
    
    shell_print(sh, "Memory at 0x%04lX (%lu bytes):", addr, len);
    
    /* Get memory region pointer */
    uint8_t *base = NULL;
    uint16_t offset = 0;
    
    if (addr < ZPLC_MEM_OPI_BASE) {
        base = zplc_mem_get_region(ZPLC_MEM_IPI_BASE);
        offset = (uint16_t)addr;
    } else if (addr < ZPLC_MEM_WORK_BASE) {
        base = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
        offset = (uint16_t)(addr - ZPLC_MEM_OPI_BASE);
    } else if (addr < ZPLC_MEM_RETAIN_BASE) {
        base = zplc_mem_get_region(ZPLC_MEM_WORK_BASE);
        offset = (uint16_t)(addr - ZPLC_MEM_WORK_BASE);
    } else {
        base = zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE);
        offset = (uint16_t)(addr - ZPLC_MEM_RETAIN_BASE);
    }
    
    if (base == NULL) {
        shell_error(sh, "ERROR: Invalid memory region");
        return -EINVAL;
    }
    
    /* Print in rows of 16 bytes */
    for (unsigned long i = 0; i < len; i += 16) {
        char line[80];
        int pos = 0;
        
        pos += snprintf(line + pos, sizeof(line) - pos, "%04lX: ", addr + i);
        
        for (unsigned long j = 0; j < 16 && (i + j) < len; j++) {
            pos += snprintf(line + pos, sizeof(line) - pos, "%02X ", 
                           base[offset + i + j]);
        }
        
        shell_print(sh, "%s", line);
    }
    
    return 0;
}

static int cmd_dbg_poke(const struct shell *sh, size_t argc, char **argv)
{
    if (argc != 3) {
        shell_error(sh, "Usage: zplc dbg poke <addr> <value>");
        return -EINVAL;
    }
    
    char *endptr;
    unsigned long addr = strtoul(argv[1], &endptr, 0);
    if (*endptr != '\0') {
        shell_error(sh, "ERROR: Invalid address");
        return -EINVAL;
    }
    
    unsigned long value = strtoul(argv[2], &endptr, 0);
    if (*endptr != '\0' || value > 255) {
        shell_error(sh, "ERROR: Invalid value (0-255)");
        return -EINVAL;
    }
    
    /* Write to IPI region */
    if (addr < ZPLC_MEM_OPI_BASE) {
        zplc_ipi_write8((uint16_t)addr, (uint8_t)value);
        shell_print(sh, "OK: Wrote 0x%02X to IPI[0x%04lX]", (uint8_t)value, addr);
    } else {
        shell_error(sh, "ERROR: Can only poke IPI region (0x0000-0x0FFF)");
        return -EINVAL;
    }
    
    return 0;
}

static int cmd_dbg_info(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);
    
    zplc_sched_stats_t stats;
    zplc_sched_get_stats(&stats);
    
    shell_print(sh, "=== Debug Info (Scheduler Mode) ===");
    shell_print(sh, "Active Tasks: %u", stats.active_tasks);
    shell_print(sh, "Total Cycles: %u", stats.total_cycles);
    shell_print(sh, "Overruns:     %u", stats.total_overruns);
    shell_print(sh, "Uptime:       %u ms", k_uptime_get_32());
    
    /* Show OPI bytes 0-7 */
    shell_print(sh, "OPI[0..7]: %02X %02X %02X %02X %02X %02X %02X %02X",
                zplc_opi_read8(0), zplc_opi_read8(1),
                zplc_opi_read8(2), zplc_opi_read8(3),
                zplc_opi_read8(4), zplc_opi_read8(5),
                zplc_opi_read8(6), zplc_opi_read8(7));
    
    return 0;
}

/* Stub commands for scheduler mode (pause/resume/step not applicable) */
static int cmd_dbg_pause(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);
    shell_print(sh, "WARN: Pause not supported in scheduler mode (use task-level control)");
    return 0;
}

static int cmd_dbg_resume(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);
    shell_print(sh, "WARN: Resume not supported in scheduler mode");
    return 0;
}

static int cmd_dbg_step(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);
    shell_print(sh, "WARN: Step not supported in scheduler mode");
    return 0;
}

#else /* Legacy mode implementations */

/* ============================================================================
 * Shell Command Handlers - Legacy Mode
 * ============================================================================ */

/**
 * @brief Handler for 'zplc load <size>'
 *
 * Prepares the system to receive bytecode of the specified size.
 */
static int cmd_zplc_load(const struct shell *sh, size_t argc, char **argv)
{
    if (argc != 2) {
        shell_error(sh, "Usage: zplc load <size>");
        return -EINVAL;
    }
    
    /* Parse size */
    char *endptr;
    unsigned long size = strtoul(argv[1], &endptr, 10);
    
    if (*endptr != '\0' || size == 0) {
        shell_error(sh, "ERROR: Invalid size");
        return -EINVAL;
    }
    
    if (size > program_buffer_size) {
        shell_error(sh, "ERROR: Size %lu exceeds buffer (%zu bytes)",
                    size, program_buffer_size);
        return -ENOMEM;
    }
    
    /* Stop any running program first */
    if (runtime_state == ZPLC_STATE_RUNNING) {
        runtime_state = ZPLC_STATE_IDLE;
        k_msleep(10);  /* Let main loop notice */
    }
    
    /* Clear buffer and prepare for loading */
    memset(program_buffer, 0, program_buffer_size);
    program_expected_size = size;
    program_received_size = 0;
    runtime_state = ZPLC_STATE_LOADING;
    
    shell_print(sh, "OK: Ready to receive %lu bytes", size);
    return 0;
}

/**
 * @brief Handler for 'zplc data <hex>'
 *
 * Receives a chunk of hex-encoded bytecode and appends to the buffer.
 * Multiple data commands can be used to send larger programs.
 */
static int cmd_zplc_data(const struct shell *sh, size_t argc, char **argv)
{
    if (argc != 2) {
        shell_error(sh, "Usage: zplc data <hex>");
        return -EINVAL;
    }
    
    if (runtime_state != ZPLC_STATE_LOADING) {
        shell_error(sh, "ERROR: Not in loading state (use 'zplc load' first)");
        return -EINVAL;
    }
    
    /* Decode hex data */
    const char *hex = argv[1];
    size_t remaining = program_expected_size - program_received_size;
    
    int decoded = hex_decode(hex, 
                             program_buffer + program_received_size,
                             remaining);
    
    if (decoded < 0) {
        shell_error(sh, "ERROR: Invalid hex data");
        runtime_state = ZPLC_STATE_ERROR;
        return -EINVAL;
    }
    
    program_received_size += decoded;
    
    /* Check if complete */
    if (program_received_size >= program_expected_size) {
        runtime_state = ZPLC_STATE_READY;
        shell_print(sh, "OK: Received %zu/%zu bytes (complete)",
                    program_received_size, program_expected_size);
    } else {
        shell_print(sh, "OK: Received %zu/%zu bytes",
                    program_received_size, program_expected_size);
    }
    
    return 0;
}

/**
 * @brief Handler for 'zplc start'
 *
 * Loads the received bytecode into the VM and starts execution.
 */
static int cmd_zplc_start(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);
    
    if (runtime_state == ZPLC_STATE_RUNNING) {
        shell_warn(sh, "WARN: Already running");
        return 0;
    }
    
    if (runtime_state != ZPLC_STATE_READY) {
        shell_error(sh, "ERROR: No program loaded (state=%s)",
                    state_name(runtime_state));
        return -EINVAL;
    }
    
    /* Re-initialize the VM core */
    int ret = zplc_core_init();
    if (ret != 0) {
        shell_error(sh, "ERROR: Core init failed (%d)", ret);
        runtime_state = ZPLC_STATE_ERROR;
        return ret;
    }
    
    /* Load the program */
    ret = zplc_core_load_raw(program_buffer, program_received_size);
    if (ret != 0) {
        shell_error(sh, "ERROR: Load failed (%d)", ret);
        runtime_state = ZPLC_STATE_ERROR;
        return ret;
    }
    
    /* Reset cycle count and start */
    cycle_count = 0;
    runtime_state = ZPLC_STATE_RUNNING;
    
    /* Save program to NVS for persistence across power cycles */
    {
        uint32_t len32 = (uint32_t)program_received_size;
        if (zplc_hal_persist_save(ZPLC_PERSIST_KEY_LEN, &len32, sizeof(len32)) == ZPLC_HAL_OK &&
            zplc_hal_persist_save(ZPLC_PERSIST_KEY_CODE, program_buffer, program_received_size) == ZPLC_HAL_OK) {
            shell_print(sh, "OK: Program retained in Flash");
        } else {
            shell_warn(sh, "WARN: Failed to save program to Flash (will not persist)");
        }
    }
    
    shell_print(sh, "OK: Started (%zu bytes loaded)", program_received_size);
    return 0;
}

/**
 * @brief Handler for 'zplc stop'
 *
 * Stops VM execution.
 */
static int cmd_zplc_stop(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);
    
    if (runtime_state != ZPLC_STATE_RUNNING) {
        shell_warn(sh, "WARN: Not running (state=%s)", state_name(runtime_state));
        return 0;
    }
    
    runtime_state = ZPLC_STATE_IDLE;
    
    /* Turn off all outputs for safety */
    for (int i = 0; i < 4; i++) {
        zplc_hal_gpio_write(i, 0);
    }
    
    shell_print(sh, "OK: Stopped");
    return 0;
}

/**
 * @brief Handler for 'zplc status'
 *
 * Displays current VM state and statistics.
 */
static int cmd_zplc_status(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);
    
    const zplc_vm_state_t *vm = zplc_core_get_state();
    
    shell_print(sh, "=== ZPLC Runtime Status ===");
    shell_print(sh, "State:      %s", state_name(runtime_state));
    shell_print(sh, "Cycles:     %u", cycle_count);
    shell_print(sh, "Program:    %zu bytes", program_received_size);
    
    if (runtime_state == ZPLC_STATE_RUNNING || runtime_state == ZPLC_STATE_READY) {
        shell_print(sh, "--- VM State ---");
        shell_print(sh, "PC:         %u", vm->pc);
        shell_print(sh, "SP:         %u", vm->sp);
        shell_print(sh, "Halted:     %s", zplc_core_is_halted() ? "yes" : "no");
        shell_print(sh, "Error:      %d", zplc_core_get_error());
        
        /* Show OPI output bytes */
        shell_print(sh, "--- Outputs ---");
        shell_print(sh, "OPI[0..3]:  0x%02X 0x%02X 0x%02X 0x%02X",
                    (uint8_t)zplc_core_get_opi(0),
                    (uint8_t)zplc_core_get_opi(1),
                    (uint8_t)zplc_core_get_opi(2),
                    (uint8_t)zplc_core_get_opi(3));
    }
    
    return 0;
}

/**
 * @brief Handler for 'zplc reset'
 *
 * Resets the VM to initial state.
 */
static int cmd_zplc_reset(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);
    
    /* Stop if running */
    runtime_state = ZPLC_STATE_IDLE;
    
    /* Clear program buffer */
    memset(program_buffer, 0, program_buffer_size);
    program_expected_size = 0;
    program_received_size = 0;
    cycle_count = 0;
    
    /* Turn off all outputs */
    for (int i = 0; i < 4; i++) {
        zplc_hal_gpio_write(i, 0);
    }
    
    /* Re-init core */
    zplc_core_init();
    
    shell_print(sh, "OK: Reset complete");
    return 0;
}

/* ============================================================================
 * Debug Command Handlers - Legacy Mode
 * ============================================================================ */

/**
 * @brief Handler for 'zplc dbg pause'
 *
 * Pauses VM execution at the next cycle boundary.
 */
static int cmd_dbg_pause(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);
    
    if (runtime_state != ZPLC_STATE_RUNNING) {
        shell_warn(sh, "WARN: Not running (state=%s)", state_name(runtime_state));
        return 0;
    }
    
    runtime_state = ZPLC_STATE_PAUSED;
    shell_print(sh, "OK: Paused at cycle %u", cycle_count);
    return 0;
}

/**
 * @brief Handler for 'zplc dbg resume'
 *
 * Resumes VM execution from paused state.
 */
static int cmd_dbg_resume(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);
    
    if (runtime_state != ZPLC_STATE_PAUSED) {
        shell_warn(sh, "WARN: Not paused (state=%s)", state_name(runtime_state));
        return 0;
    }
    
    runtime_state = ZPLC_STATE_RUNNING;
    shell_print(sh, "OK: Resumed");
    return 0;
}

/**
 * @brief Handler for 'zplc dbg step'
 *
 * Executes exactly one PLC cycle while paused.
 */
static int cmd_dbg_step(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);
    
    if (runtime_state == ZPLC_STATE_RUNNING) {
        /* Auto-pause first */
        runtime_state = ZPLC_STATE_PAUSED;
        k_msleep(10);  /* Let main loop notice */
    }
    
    if (runtime_state != ZPLC_STATE_PAUSED && runtime_state != ZPLC_STATE_READY) {
        shell_error(sh, "ERROR: Cannot step (state=%s)", state_name(runtime_state));
        return -EINVAL;
    }
    
    /* If READY, transition to PAUSED first */
    if (runtime_state == ZPLC_STATE_READY) {
        /* Re-initialize and load */
        int ret = zplc_core_init();
        if (ret != 0) {
            shell_error(sh, "ERROR: Core init failed (%d)", ret);
            return ret;
        }
        ret = zplc_core_load_raw(program_buffer, program_received_size);
        if (ret != 0) {
            shell_error(sh, "ERROR: Load failed (%d)", ret);
            return ret;
        }
        cycle_count = 0;
        runtime_state = ZPLC_STATE_PAUSED;
    }
    
    /* Request a single step */
    step_requested = 1;
    shell_print(sh, "OK: Step requested");
    return 0;
}

/**
 * @brief Handler for 'zplc dbg peek <addr> [len]'
 *
 * Reads memory from the VM and displays as hex.
 * Default length is 16 bytes.
 */
static int cmd_dbg_peek(const struct shell *sh, size_t argc, char **argv)
{
    if (argc < 2) {
        shell_error(sh, "Usage: zplc dbg peek <addr> [len]");
        return -EINVAL;
    }
    
    /* Parse address */
    char *endptr;
    unsigned long addr = strtoul(argv[1], &endptr, 0);
    if (*endptr != '\0') {
        shell_error(sh, "ERROR: Invalid address");
        return -EINVAL;
    }
    
    /* Parse optional length (default 16) */
    unsigned long len = 16;
    if (argc >= 3) {
        len = strtoul(argv[2], &endptr, 0);
        if (*endptr != '\0' || len == 0 || len > 256) {
            shell_error(sh, "ERROR: Invalid length (1-256)");
            return -EINVAL;
        }
    }
    
    /* Read and display memory using OPI/IPI access based on address */
    shell_print(sh, "Memory at 0x%04lX (%lu bytes):", addr, len);
    
    /* Print in rows of 16 bytes */
    for (unsigned long offset = 0; offset < len; offset += 16) {
        char line[80];
        int pos = 0;
        
        pos += snprintf(line + pos, sizeof(line) - pos, "%04lX: ", addr + offset);
        
        for (unsigned long i = 0; i < 16 && (offset + i) < len; i++) {
            uint32_t val = 0;
            uint16_t a = (uint16_t)(addr + offset + i);
            
            /* Use core API to read from different memory regions */
            if (a >= 0x1000 && a < 0x2000) {
                /* OPI region */
                val = zplc_core_get_opi(a - 0x1000);
            } else {
                /* For other regions, we'd need direct access */
                /* For now, just show OPI and return 0 for others */
                val = 0;
            }
            
            pos += snprintf(line + pos, sizeof(line) - pos, "%02X ", (uint8_t)val);
        }
        
        shell_print(sh, "%s", line);
    }
    
    return 0;
}

/**
 * @brief Handler for 'zplc dbg poke <addr> <value>'
 *
 * Writes a byte value to memory (useful for forcing I/O values).
 */
static int cmd_dbg_poke(const struct shell *sh, size_t argc, char **argv)
{
    if (argc != 3) {
        shell_error(sh, "Usage: zplc dbg poke <addr> <value>");
        return -EINVAL;
    }
    
    /* Parse address */
    char *endptr;
    unsigned long addr = strtoul(argv[1], &endptr, 0);
    if (*endptr != '\0') {
        shell_error(sh, "ERROR: Invalid address");
        return -EINVAL;
    }
    
    /* Parse value */
    unsigned long value = strtoul(argv[2], &endptr, 0);
    if (*endptr != '\0' || value > 255) {
        shell_error(sh, "ERROR: Invalid value (0-255)");
        return -EINVAL;
    }
    
    /* Write to appropriate region */
    if (addr < 0x1000) {
        /* IPI region - use set_ipi */
        int ret = zplc_core_set_ipi((uint16_t)addr, (uint32_t)value);
        if (ret < 0) {
            shell_error(sh, "ERROR: Write failed");
            return -EINVAL;
        }
    } else {
        shell_error(sh, "ERROR: Can only poke IPI region (0x0000-0x0FFF)");
        return -EINVAL;
    }
    
    shell_print(sh, "OK: Wrote 0x%02X to 0x%04lX", (uint8_t)value, addr);
    return 0;
}

/**
 * @brief Handler for 'zplc dbg info'
 *
 * Shows detailed VM state for debugging.
 */
static int cmd_dbg_info(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);
    
    const zplc_vm_state_t *vm = zplc_core_get_state();
    
    shell_print(sh, "=== Debug Info ===");
    shell_print(sh, "State:   %s", state_name(runtime_state));
    shell_print(sh, "Cycles:  %u", cycle_count);
    shell_print(sh, "PC:      0x%04X", vm->pc);
    shell_print(sh, "SP:      %u", vm->sp);
    shell_print(sh, "Halted:  %s", zplc_core_is_halted() ? "yes" : "no");
    shell_print(sh, "Error:   %d", zplc_core_get_error());
    
    /* Show stack top */
    if (vm->sp > 0) {
        shell_print(sh, "TOS:     0x%08X (%u)", 
                    zplc_core_get_stack(vm->sp - 1),
                    zplc_core_get_stack(vm->sp - 1));
    }
    
    /* Show OPI bytes 0-7 */
    shell_print(sh, "OPI[0..7]: %02X %02X %02X %02X %02X %02X %02X %02X",
                (uint8_t)zplc_core_get_opi(0),
                (uint8_t)zplc_core_get_opi(1),
                (uint8_t)zplc_core_get_opi(2),
                (uint8_t)zplc_core_get_opi(3),
                (uint8_t)zplc_core_get_opi(4),
                (uint8_t)zplc_core_get_opi(5),
                (uint8_t)zplc_core_get_opi(6),
                (uint8_t)zplc_core_get_opi(7));
    
    return 0;
}

#endif /* CONFIG_ZPLC_SCHEDULER */

/* ============================================================================
 * Shell Command Registration
 * ============================================================================ */

/* Debug subcommands under 'zplc dbg' */
SHELL_STATIC_SUBCMD_SET_CREATE(sub_dbg,
    SHELL_CMD(pause, NULL,
        "Pause VM execution",
        cmd_dbg_pause),
    SHELL_CMD(resume, NULL,
        "Resume VM execution",
        cmd_dbg_resume),
    SHELL_CMD(step, NULL,
        "Execute one cycle",
        cmd_dbg_step),
    SHELL_CMD_ARG(peek, NULL,
        "Read memory: dbg peek <addr> [len]",
        cmd_dbg_peek, 2, 1),
    SHELL_CMD_ARG(poke, NULL,
        "Write memory: dbg poke <addr> <value>",
        cmd_dbg_poke, 3, 0),
    SHELL_CMD(info, NULL,
        "Show detailed VM state",
        cmd_dbg_info),
    SHELL_SUBCMD_SET_END
);

/* Subcommands under 'zplc' */
SHELL_STATIC_SUBCMD_SET_CREATE(sub_zplc,
    SHELL_CMD_ARG(load, NULL, 
        "Prepare to receive <size> bytes: zplc load <size>",
        cmd_zplc_load, 2, 0),
    SHELL_CMD_ARG(data, NULL,
        "Receive hex-encoded chunk: zplc data <hex>",
        cmd_zplc_data, 2, 0),
    SHELL_CMD(start, NULL,
        "Start VM execution",
        cmd_zplc_start),
    SHELL_CMD(stop, NULL,
        "Stop VM execution",
        cmd_zplc_stop),
    SHELL_CMD(status, NULL,
        "Show runtime status",
        cmd_zplc_status),
    SHELL_CMD(reset, NULL,
        "Reset VM to initial state",
        cmd_zplc_reset),
    SHELL_CMD(version, NULL,
        "Show version info",
        cmd_zplc_version),
    SHELL_CMD(dbg, &sub_dbg,
        "Debug commands (pause/resume/step/peek/poke/info)",
        NULL),
#ifdef CONFIG_ZPLC_SCHEDULER
    SHELL_CMD(sched, &sub_sched,
        "Scheduler commands (status/tasks)",
        NULL),
    SHELL_CMD(persist, &sub_persist,
        "Persistence commands (clear/info)",
        NULL),
#endif
    SHELL_SUBCMD_SET_END
);

/* Root 'zplc' command */
SHELL_CMD_REGISTER(zplc, &sub_zplc, "ZPLC runtime commands", NULL);
