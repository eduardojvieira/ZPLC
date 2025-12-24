/**
 * @file zplc_hal.h
 * @brief ZPLC Hardware Abstraction Layer Interface
 *
 * SPDX-License-Identifier: MIT
 *
 * This header defines the contract between the ZPLC Core and the underlying
 * platform. The Core NEVER calls hardware directly - all access goes through
 * these functions.
 *
 * Each target platform (POSIX, Zephyr, WASM, Windows) provides its own
 * implementation of this interface.
 *
 * @note All functions prefixed with zplc_hal_ are platform-dependent and
 *       must be implemented by the HAL layer.
 */

#ifndef ZPLC_HAL_H
#define ZPLC_HAL_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ============================================================================
 * Return Codes
 * ============================================================================ */

/** @brief HAL operation result codes */
typedef enum {
    ZPLC_HAL_OK         = 0,    /**< Operation successful */
    ZPLC_HAL_ERROR      = -1,   /**< Generic error */
    ZPLC_HAL_TIMEOUT    = -2,   /**< Operation timed out */
    ZPLC_HAL_BUSY       = -3,   /**< Resource busy */
    ZPLC_HAL_NOT_IMPL   = -4    /**< Function not implemented */
} zplc_hal_result_t;

/* ============================================================================
 * Timing Functions
 * ============================================================================
 * Critical for deterministic execution. The scheduler depends on accurate
 * timing to maintain cycle consistency.
 */

/**
 * @brief Get the current system tick in milliseconds.
 *
 * This is the primary timekeeping function for the runtime scheduler.
 * Must be monotonically increasing (no rollover handling required for
 * at least 49 days with uint32_t).
 *
 * @return Current tick count in milliseconds since system start.
 *
 * @note Platform implementations:
 *       - POSIX: clock_gettime(CLOCK_MONOTONIC)
 *       - Zephyr: k_uptime_get()
 *       - WASM: performance.now()
 */
uint32_t zplc_hal_tick(void);

/**
 * @brief Sleep for the specified number of milliseconds.
 *
 * Blocking sleep - use only for cycle timing, never in logic execution.
 *
 * @param ms Number of milliseconds to sleep.
 *
 * @note Platform implementations:
 *       - POSIX: nanosleep()
 *       - Zephyr: k_msleep()
 *       - WASM: Atomics.wait() or async yield
 */
void zplc_hal_sleep(uint32_t ms);

/* ============================================================================
 * GPIO Functions
 * ============================================================================
 * Digital I/O abstraction. The logical channel maps to physical pins via
 * the IOMap in the .zplc binary.
 */

/**
 * @brief Read a digital input channel.
 *
 * @param channel Logical channel number (0-based).
 * @param value   Pointer to store the read value (0 or 1).
 *
 * @return ZPLC_HAL_OK on success, error code otherwise.
 */
zplc_hal_result_t zplc_hal_gpio_read(uint8_t channel, uint8_t *value);

/**
 * @brief Write to a digital output channel.
 *
 * @param channel Logical channel number (0-based).
 * @param value   Value to write (0 or 1).
 *
 * @return ZPLC_HAL_OK on success, error code otherwise.
 */
zplc_hal_result_t zplc_hal_gpio_write(uint8_t channel, uint8_t value);

/* ============================================================================
 * Analog I/O Functions (Phase 3+)
 * ============================================================================ */

/**
 * @brief Read an analog input channel.
 *
 * @param channel Logical channel number (0-based).
 * @param value   Pointer to store the read value (raw ADC counts or scaled).
 *
 * @return ZPLC_HAL_OK on success, error code otherwise.
 */
zplc_hal_result_t zplc_hal_adc_read(uint8_t channel, uint16_t *value);

/**
 * @brief Write to an analog output channel (DAC).
 *
 * @param channel Logical channel number (0-based).
 * @param value   Value to write (raw DAC counts or scaled).
 *
 * @return ZPLC_HAL_OK on success, error code otherwise.
 */
zplc_hal_result_t zplc_hal_dac_write(uint8_t channel, uint16_t value);

/* ============================================================================
 * Persistence Functions
 * ============================================================================
 * Retentive memory support - survives power cycles.
 * Maps to NVS/EEPROM on embedded, file on desktop, localStorage on WASM.
 */

/**
 * @brief Save data to persistent storage.
 *
 * @param key    Identifier string for the data block.
 * @param data   Pointer to data to save.
 * @param len    Length of data in bytes.
 *
 * @return ZPLC_HAL_OK on success, error code otherwise.
 */
zplc_hal_result_t zplc_hal_persist_save(const char *key,
                                         const void *data,
                                         size_t len);

/**
 * @brief Load data from persistent storage.
 *
 * @param key    Identifier string for the data block.
 * @param data   Buffer to load data into.
 * @param len    Maximum length to read.
 *
 * @return ZPLC_HAL_OK on success, error code otherwise.
 */
zplc_hal_result_t zplc_hal_persist_load(const char *key,
                                         void *data,
                                         size_t len);

/* ============================================================================
 * Network Functions (Phase 4+)
 * ============================================================================ */

/** @brief Opaque socket handle */
typedef void* zplc_hal_socket_t;

/**
 * @brief Create a TCP socket and connect to a remote host.
 *
 * @param host   Hostname or IP address string.
 * @param port   Port number.
 *
 * @return Socket handle on success, NULL on failure.
 */
zplc_hal_socket_t zplc_hal_socket_connect(const char *host, uint16_t port);

/**
 * @brief Send data over a socket.
 *
 * @param sock   Socket handle.
 * @param data   Data buffer to send.
 * @param len    Length of data.
 *
 * @return Number of bytes sent, or negative error code.
 */
int32_t zplc_hal_socket_send(zplc_hal_socket_t sock,
                              const void *data,
                              size_t len);

/**
 * @brief Receive data from a socket.
 *
 * @param sock   Socket handle.
 * @param buf    Buffer to receive into.
 * @param len    Maximum bytes to receive.
 *
 * @return Number of bytes received, or negative error code.
 */
int32_t zplc_hal_socket_recv(zplc_hal_socket_t sock,
                              void *buf,
                              size_t len);

/**
 * @brief Close a socket.
 *
 * @param sock   Socket handle to close.
 *
 * @return ZPLC_HAL_OK on success, error code otherwise.
 */
zplc_hal_result_t zplc_hal_socket_close(zplc_hal_socket_t sock);

/* ============================================================================
 * Logging / Debug Output
 * ============================================================================
 * Runtime diagnostics. Maps to printf on host, RTT/UART on embedded.
 */

/**
 * @brief Log a formatted message.
 *
 * Printf-style logging for runtime diagnostics.
 *
 * @param fmt   Format string (printf-style).
 * @param ...   Variable arguments.
 *
 * @note Platform implementations:
 *       - POSIX: fprintf(stderr, ...)
 *       - Zephyr: printk() or LOG_INF()
 *       - WASM: console.log() via JS bridge
 */
void zplc_hal_log(const char *fmt, ...);

/* ============================================================================
 * System Initialization
 * ============================================================================ */

/**
 * @brief Initialize the HAL layer.
 *
 * Must be called before any other HAL functions.
 * Sets up hardware peripherals, timers, and communication channels.
 *
 * @return ZPLC_HAL_OK on success, error code otherwise.
 */
zplc_hal_result_t zplc_hal_init(void);

/**
 * @brief Shutdown the HAL layer.
 *
 * Clean shutdown - close sockets, flush persistence, release resources.
 *
 * @return ZPLC_HAL_OK on success, error code otherwise.
 */
zplc_hal_result_t zplc_hal_shutdown(void);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_HAL_H */
