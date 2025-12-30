/**
 * @file zplc_core.h
 * @brief ZPLC Core Runtime Public API
 *
 * SPDX-License-Identifier: MIT
 *
 * This header declares the public interface for the ZPLC Virtual Machine.
 * 
 * The API supports two usage patterns:
 * 
 * 1. **Legacy Singleton API** (zplc_core_*): Uses a default VM instance.
 *    Simple to use for single-task applications.
 * 
 * 2. **Instance-based API** (zplc_vm_*): Each task gets its own VM instance.
 *    Required for multi-task scheduling where each task has private state.
 *
 * Memory Model:
 *   - IPI/OPI: Shared across all VM instances (synchronized by scheduler)
 *   - Work/Retain: Shared (tasks coordinate via addresses)
 *   - Stack/CallStack/PC: Private per VM instance
 *   - Code: Shared (multiple VMs can reference same code with different entry points)
 */

#ifndef ZPLC_CORE_H
#define ZPLC_CORE_H

#include <stdint.h>
#include <stddef.h>
#include <zplc_isa.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ============================================================================
 * VM Instance Structure
 * ============================================================================
 * 
 * Each zplc_vm_t holds the private execution state for one PLC task.
 * Multiple VMs can execute concurrently (on different threads/work queues)
 * while sharing the same memory regions.
 */

/**
 * @brief VM instance structure.
 *
 * Contains all private state for one VM execution context.
 * Allocate statically or dynamically, then call zplc_vm_init().
 */
typedef struct {
    /* Execution state */
    uint16_t pc;                              /**< Program counter */
    uint16_t sp;                              /**< Stack pointer */
    uint16_t bp;                              /**< Base pointer */
    uint8_t call_depth;                       /**< Current call nesting */
    uint8_t flags;                            /**< Status flags */
    uint8_t error;                            /**< Last error code */
    uint8_t halted;                           /**< Execution stopped */
    
    /* Debugger state */
    uint8_t paused;                           /**< Paused at breakpoint */
    uint8_t breakpoint_count;                 /**< Number of active breakpoints */
    uint16_t breakpoints[ZPLC_MAX_BREAKPOINTS]; /**< Breakpoint PC addresses */
    
    /* Private stacks */
    uint32_t stack[ZPLC_STACK_MAX_DEPTH];     /**< Evaluation stack */
    uint16_t call_stack[ZPLC_CALL_STACK_MAX]; /**< Return addresses */
    
    /* Code reference (points into shared code segment) */
    const uint8_t *code;                      /**< Pointer to bytecode */
    uint32_t code_size;                       /**< Size of bytecode */
    uint16_t entry_point;                     /**< Entry point offset */
    
    /* Task identification (set by scheduler) */
    uint16_t task_id;                         /**< Task ID (0 = default) */
    uint8_t priority;                         /**< Task priority */
    uint8_t reserved;                         /**< Padding */
} zplc_vm_t;

/* ============================================================================
 * Shared Memory Access
 * ============================================================================
 * 
 * These functions access the shared memory regions (IPI, OPI, Work, Retain).
 * In a multi-task environment, the scheduler must synchronize access.
 */

/**
 * @brief Initialize shared memory regions.
 *
 * Zeros IPI, OPI, Work, and Retain memory.
 * Call once at system startup, before creating any VM instances.
 *
 * @return 0 on success
 */
int zplc_mem_init(void);

/**
 * @brief Get pointer to shared memory region.
 *
 * @param base Base address (ZPLC_MEM_IPI_BASE, etc.)
 * @return Pointer to memory region, or NULL if invalid
 */
uint8_t* zplc_mem_get_region(uint16_t base);

/**
 * @brief Load code into the shared code segment.
 *
 * @param code Bytecode to load
 * @param size Size in bytes
 * @param offset Offset within code segment (for multiple programs)
 * @return 0 on success, negative on error
 */
int zplc_mem_load_code(const uint8_t *code, size_t size, uint16_t offset);

/**
 * @brief Get pointer to code segment.
 *
 * @param offset Offset within code segment
 * @param size Size of code to access
 * @return Pointer to code, or NULL if out of bounds
 */
const uint8_t* zplc_mem_get_code(uint16_t offset, size_t size);

/**
 * @brief Get current loaded code size.
 *
 * @return Total bytes loaded in code segment
 */
uint32_t zplc_mem_get_code_size(void);

/* ============================================================================
 * VM Instance API (zplc_vm_*)
 * ============================================================================
 * 
 * Instance-based API for multi-task support.
 * Each task creates and manages its own zplc_vm_t.
 */

/**
 * @brief Initialize a VM instance.
 *
 * Resets all execution state. Does not allocate memory.
 * The zplc_vm_t struct must already be allocated.
 *
 * @param vm Pointer to VM instance
 * @return 0 on success
 */
int zplc_vm_init(zplc_vm_t *vm);

/**
 * @brief Configure VM to execute code at specified entry point.
 *
 * @param vm Pointer to VM instance
 * @param entry_point Offset within code segment
 * @param code_size Size of code for this task
 * @return 0 on success, negative on error
 */
int zplc_vm_set_entry(zplc_vm_t *vm, uint16_t entry_point, uint32_t code_size);

/**
 * @brief Execute a single instruction.
 *
 * @param vm Pointer to VM instance
 * @return ZPLC_VM_OK on success, error code otherwise
 */
int zplc_vm_step(zplc_vm_t *vm);

/**
 * @brief Run VM for a fixed number of instructions or until halted.
 *
 * @param vm Pointer to VM instance
 * @param max_instructions Maximum instructions (0 = unlimited)
 * @return Number of instructions executed, or negative error code
 */
int zplc_vm_run(zplc_vm_t *vm, uint32_t max_instructions);

/**
 * @brief Run one complete PLC scan cycle.
 *
 * Resets PC to entry point, executes until HALT, returns.
 *
 * @param vm Pointer to VM instance
 * @return Number of instructions executed, or negative error code
 */
int zplc_vm_run_cycle(zplc_vm_t *vm);

/**
 * @brief Reset VM for a new cycle without full init.
 *
 * Faster than zplc_vm_init() - only resets PC, SP, and status.
 *
 * @param vm Pointer to VM instance
 */
void zplc_vm_reset_cycle(zplc_vm_t *vm);

/**
 * @brief Get VM error code.
 *
 * @param vm Pointer to VM instance
 * @return Error code
 */
int zplc_vm_get_error(const zplc_vm_t *vm);

/**
 * @brief Check if VM is halted.
 *
 * @param vm Pointer to VM instance
 * @return 1 if halted, 0 if running
 */
int zplc_vm_is_halted(const zplc_vm_t *vm);

/**
 * @brief Get stack value.
 *
 * @param vm Pointer to VM instance
 * @param index Stack index (0 = bottom)
 * @return Stack value, or 0 if out of bounds
 */
uint32_t zplc_vm_get_stack(const zplc_vm_t *vm, uint16_t index);

/**
 * @brief Get stack pointer.
 *
 * @param vm Pointer to VM instance
 * @return Stack pointer
 */
uint16_t zplc_vm_get_sp(const zplc_vm_t *vm);

/**
 * @brief Get program counter.
 *
 * @param vm Pointer to VM instance
 * @return Program counter
 */
uint16_t zplc_vm_get_pc(const zplc_vm_t *vm);

/* ============================================================================
 * Debugger API (zplc_vm_* breakpoints)
 * ============================================================================
 * 
 * Functions for debugging support: breakpoints, pause/resume, single-step.
 * These are used by the IDE debugger (WASM simulation or serial debug).
 */

/**
 * @brief Check if VM is paused at a breakpoint.
 *
 * @param vm Pointer to VM instance
 * @return 1 if paused, 0 if running or halted
 */
int zplc_vm_is_paused(const zplc_vm_t *vm);

/**
 * @brief Resume execution after a breakpoint pause.
 *
 * Clears the paused flag so the next zplc_vm_step() continues execution.
 *
 * @param vm Pointer to VM instance
 * @return 0 on success, -1 if NULL
 */
int zplc_vm_resume(zplc_vm_t *vm);

/**
 * @brief Add a breakpoint at a program counter address.
 *
 * When the VM's PC reaches this address, execution will pause.
 *
 * @param vm Pointer to VM instance
 * @param pc Program counter address to break at
 * @return 0 on success, -1 if NULL, -2 if breakpoint table full, -3 if already exists
 */
int zplc_vm_add_breakpoint(zplc_vm_t *vm, uint16_t pc);

/**
 * @brief Remove a breakpoint at a program counter address.
 *
 * @param vm Pointer to VM instance
 * @param pc Program counter address to remove
 * @return 0 on success, -1 if NULL, -2 if not found
 */
int zplc_vm_remove_breakpoint(zplc_vm_t *vm, uint16_t pc);

/**
 * @brief Clear all breakpoints.
 *
 * @param vm Pointer to VM instance
 * @return 0 on success, -1 if NULL
 */
int zplc_vm_clear_breakpoints(zplc_vm_t *vm);

/**
 * @brief Get the number of active breakpoints.
 *
 * @param vm Pointer to VM instance
 * @return Number of breakpoints, or 0 if NULL
 */
uint8_t zplc_vm_get_breakpoint_count(const zplc_vm_t *vm);

/**
 * @brief Get a breakpoint address by index.
 *
 * @param vm Pointer to VM instance
 * @param index Index in breakpoint array (0 to count-1)
 * @return PC address of breakpoint, or 0xFFFF if invalid
 */
uint16_t zplc_vm_get_breakpoint(const zplc_vm_t *vm, uint8_t index);

/* ============================================================================
 * Shared Memory I/O Helpers
 * ============================================================================ */

/**
 * @brief Write a 32-bit value to IPI.
 *
 * @param offset Byte offset within IPI
 * @param value Value to write
 * @return 0 on success, -1 if out of bounds
 */
int zplc_ipi_write32(uint16_t offset, uint32_t value);

/**
 * @brief Write a 16-bit value to IPI.
 *
 * @param offset Byte offset within IPI
 * @param value Value to write
 * @return 0 on success, -1 if out of bounds
 */
int zplc_ipi_write16(uint16_t offset, uint16_t value);

/**
 * @brief Write an 8-bit value to IPI.
 *
 * @param offset Byte offset within IPI
 * @param value Value to write
 * @return 0 on success, -1 if out of bounds
 */
int zplc_ipi_write8(uint16_t offset, uint8_t value);

/**
 * @brief Read a 32-bit value from OPI.
 *
 * @param offset Byte offset within OPI
 * @return Value at offset, or 0 if out of bounds
 */
uint32_t zplc_opi_read32(uint16_t offset);

/**
 * @brief Read a 16-bit value from OPI.
 *
 * @param offset Byte offset within OPI
 * @return Value at offset, or 0 if out of bounds
 */
uint16_t zplc_opi_read16(uint16_t offset);

/**
 * @brief Read an 8-bit value from OPI.
 *
 * @param offset Byte offset within OPI
 * @return Value at offset, or 0 if out of bounds
 */
uint8_t zplc_opi_read8(uint16_t offset);

/* ============================================================================
 * Legacy Singleton API (zplc_core_*)
 * ============================================================================
 * 
 * These functions use a default VM instance for backward compatibility.
 * Suitable for single-task applications.
 */

/**
 * @brief Get the ZPLC core version string.
 *
 * @return Version string in format "major.minor.patch"
 */
const char* zplc_core_version(void);

/**
 * @brief Initialize the ZPLC core.
 *
 * Initializes shared memory and default VM instance.
 *
 * @return 0 on success
 */
int zplc_core_init(void);

/**
 * @brief Shutdown the ZPLC core.
 *
 * @return 0 on success
 */
int zplc_core_shutdown(void);

/**
 * @brief Load a .zplc binary program.
 *
 * @param binary Pointer to .zplc file contents
 * @param size Size of binary data
 * @return 0 on success, negative error code otherwise
 */
int zplc_core_load(const uint8_t *binary, size_t size);

/**
 * @brief Load raw bytecode directly.
 *
 * @param bytecode Raw bytecode bytes
 * @param size Size of bytecode
 * @return 0 on success
 */
int zplc_core_load_raw(const uint8_t *bytecode, size_t size);

/**
 * @brief Execute a single instruction.
 *
 * @return ZPLC_VM_OK on success, error code otherwise
 */
int zplc_core_step(void);

/**
 * @brief Run VM for a fixed number of instructions.
 *
 * @param max_instructions Maximum instructions (0 = unlimited)
 * @return Number of instructions executed, or negative error code
 */
int zplc_core_run(uint32_t max_instructions);

/**
 * @brief Run one complete PLC scan cycle.
 *
 * @return Number of instructions executed, or negative error code
 */
int zplc_core_run_cycle(void);

/**
 * @brief Get a read-only pointer to the default VM state.
 *
 * @return Pointer to VM state (legacy zplc_vm_state_t)
 * @deprecated Use zplc_vm_* API for new code
 */
const zplc_vm_state_t* zplc_core_get_state(void);

/**
 * @brief Get the current stack pointer.
 *
 * @return Stack pointer value
 */
uint16_t zplc_core_get_sp(void);

/**
 * @brief Get a value from the evaluation stack.
 *
 * @param index Stack index (0 = bottom)
 * @return Stack value
 */
uint32_t zplc_core_get_stack(uint16_t index);

/**
 * @brief Get the last error code.
 *
 * @return Error code
 */
int zplc_core_get_error(void);

/**
 * @brief Check if VM is halted.
 *
 * @return 1 if halted, 0 if running
 */
int zplc_core_is_halted(void);

/**
 * @brief Write to IPI (legacy).
 *
 * @param offset Byte offset
 * @param value 32-bit value
 * @return 0 on success
 */
int zplc_core_set_ipi(uint16_t offset, uint32_t value);

/**
 * @brief Write 16-bit to IPI (legacy).
 *
 * @param offset Byte offset
 * @param value 16-bit value
 * @return 0 on success
 */
int zplc_core_set_ipi16(uint16_t offset, uint16_t value);

/**
 * @brief Read from OPI (legacy).
 *
 * @param offset Byte offset
 * @return 32-bit value
 */
uint32_t zplc_core_get_opi(uint16_t offset);

/**
 * @brief Get pointer to default VM instance.
 *
 * Useful for transitioning code to instance-based API.
 *
 * @return Pointer to default VM
 */
zplc_vm_t* zplc_core_get_default_vm(void);

/* ============================================================================
 * Multi-Task Loading API
 * ============================================================================
 * 
 * Functions for loading programs with multiple tasks (TASK segment).
 */

/**
 * @brief Load tasks from a .zplc binary containing a TASK segment.
 *
 * Parses the TASK segment and populates an array of task definitions.
 * Also loads the code segment into shared memory.
 *
 * @param binary Pointer to .zplc file contents
 * @param size Size of binary data
 * @param tasks Output array to fill with task definitions
 * @param max_tasks Maximum number of tasks to load
 * @return Number of tasks loaded, or negative error code
 */
int zplc_core_load_tasks(const uint8_t *binary, size_t size,
                         zplc_task_def_t *tasks, uint8_t max_tasks);

/**
 * @brief Get entry point for a loaded task.
 *
 * @param task Pointer to task definition
 * @return Entry point offset in code segment
 */
static inline uint16_t zplc_task_get_entry(const zplc_task_def_t *task) {
    return task->entry_point;
}

/**
 * @brief Get interval in microseconds for a task.
 *
 * @param task Pointer to task definition
 * @return Interval in microseconds
 */
static inline uint32_t zplc_task_get_interval_us(const zplc_task_def_t *task) {
    return task->interval_us;
}

/**
 * @brief Get priority for a task.
 *
 * @param task Pointer to task definition
 * @return Priority (0 = highest)
 */
static inline uint8_t zplc_task_get_priority(const zplc_task_def_t *task) {
    return task->priority;
}

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_CORE_H */
