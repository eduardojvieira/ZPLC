/**
 * @file zplc_core.h
 * @brief ZPLC Core Runtime Public API
 *
 * SPDX-License-Identifier: MIT
 *
 * This header declares the public interface for the ZPLC Virtual Machine.
 * Application code (runtime, tests) should include this header.
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
 * Lifecycle Functions
 * ============================================================================ */

/**
 * @brief Get the ZPLC core version string.
 *
 * @return Version string in format "major.minor.patch"
 */
const char* zplc_core_version(void);

/**
 * @brief Initialize the ZPLC core.
 *
 * Zeros all memory regions and resets VM state.
 * Must be called before loading any program.
 *
 * @return 0 on success, negative error code otherwise.
 */
int zplc_core_init(void);

/**
 * @brief Shutdown the ZPLC core.
 *
 * Flushes retentive memory and stops execution.
 *
 * @return 0 on success, negative error code otherwise.
 */
int zplc_core_shutdown(void);

/* ============================================================================
 * Program Loading
 * ============================================================================ */

/**
 * @brief Load a .zplc binary program.
 *
 * Validates the header, checks CRC, and copies code to memory.
 *
 * @param binary Pointer to .zplc file contents
 * @param size Size of binary data in bytes
 * @return 0 on success, negative error code:
 *         -1: Invalid input
 *         -2: Bad magic number
 *         -3: Incompatible version
 *         -4: Code too large
 *         -5: File truncated
 */
int zplc_core_load(const uint8_t *binary, size_t size);

/**
 * @brief Load raw bytecode directly (for testing).
 *
 * Bypasses .zplc header validation. Use only for unit tests.
 *
 * @param bytecode Raw bytecode bytes
 * @param size Size of bytecode
 * @return 0 on success, -1 on error
 */
int zplc_core_load_raw(const uint8_t *bytecode, size_t size);

/* ============================================================================
 * Execution
 * ============================================================================ */

/**
 * @brief Execute a single VM instruction.
 *
 * @return ZPLC_VM_OK on success, error code otherwise
 */
int zplc_core_step(void);

/**
 * @brief Run the VM for a fixed number of instructions.
 *
 * @param max_instructions Maximum instructions to execute (0 = unlimited)
 * @return Number of instructions executed, or negative error code
 */
int zplc_core_run(uint32_t max_instructions);

/**
 * @brief Run one complete PLC scan cycle.
 *
 * Resets PC, executes program until HALT, then returns.
 *
 * @return Number of instructions executed, or negative error code
 */
int zplc_core_run_cycle(void);

/* ============================================================================
 * State Inspection (for testing and debugging)
 * ============================================================================ */

/**
 * @brief Get a read-only pointer to the VM state.
 *
 * @return Pointer to VM state structure
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
 * @return Stack value, or 0 if out of bounds
 */
uint32_t zplc_core_get_stack(uint16_t index);

/**
 * @brief Get the last error code.
 *
 * @return Error code (ZPLC_VM_OK if no error)
 */
int zplc_core_get_error(void);

/**
 * @brief Check if VM is halted.
 *
 * @return 1 if halted, 0 if running
 */
int zplc_core_is_halted(void);

/* ============================================================================
 * I/O Access (for testing - simulates HAL)
 * ============================================================================ */

/**
 * @brief Write a 32-bit value to the Input Process Image.
 *
 * Used by tests to simulate HAL input before running code.
 *
 * @param offset Byte offset within IPI
 * @param value Value to write
 * @return 0 on success, -1 if out of bounds
 */
int zplc_core_set_ipi(uint16_t offset, uint32_t value);

/**
 * @brief Write a 16-bit value to the Input Process Image.
 *
 * Used by tests to simulate HAL input before running code.
 *
 * @param offset Byte offset within IPI
 * @param value Value to write
 * @return 0 on success, -1 if out of bounds
 */
int zplc_core_set_ipi16(uint16_t offset, uint16_t value);

/**
 * @brief Read a 32-bit value from the Output Process Image.
 *
 * Used by tests to verify output after running code.
 *
 * @param offset Byte offset within OPI
 * @return Value at offset, or 0 if out of bounds
 */
uint32_t zplc_core_get_opi(uint16_t offset);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_CORE_H */
