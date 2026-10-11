/**
 * @file zplc_modbus_timing.h
 * @brief The units of the Modbus client timeouts (COM-012).
 *
 * The configured timeout of the Modbus clients is in milliseconds. The
 * Zephyr Modbus client of an RTU interface waits for a response for
 * `rx_timeout` microseconds (subsys/modbus/modbus_core.c waits on
 * K_USEC(rxwait_to)); a value in milliseconds there is a thousandth of the
 * wait that was asked for, and every request to a responsive device timed
 * out before its first byte could arrive.
 *
 * SPDX-License-Identifier: MIT
 */
#ifndef ZPLC_MODBUS_TIMING_H
#define ZPLC_MODBUS_TIMING_H

#include <stdint.h>

/** The shortest wait for a response the client is configured with, in milliseconds. */
#define ZPLC_MODBUS_CLIENT_MIN_TIMEOUT_MS 100U

/** The `rx_timeout` of a Zephyr Modbus client interface for a configured timeout in milliseconds. */
static inline uint32_t zplc_modbus_rtu_rx_timeout_us(uint32_t timeout_ms)
{
  if (timeout_ms < ZPLC_MODBUS_CLIENT_MIN_TIMEOUT_MS) {
    timeout_ms = ZPLC_MODBUS_CLIENT_MIN_TIMEOUT_MS;
  }
  if (timeout_ms > UINT32_MAX / 1000U) {
    return UINT32_MAX;
  }
  return timeout_ms * 1000U;
}

#endif /* ZPLC_MODBUS_TIMING_H */
