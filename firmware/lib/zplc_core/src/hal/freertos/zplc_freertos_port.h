/**
 * @file zplc_freertos_port.h
 * @brief What the FreeRTOS port of ZPLC adds to the HAL contract: the simulated pins, the clock in microseconds and
 *        the persistence root.
 *
 * SPDX-License-Identifier: MIT
 *
 * The portable core talks to a port through zplc_hal.h and zplc_sched_core.h. A FreeRTOS board port also needs a
 * few things that are not part of that contract, and the simulator needs a way to drive them from a test:
 *
 *   - the simulated board ("freertos-sim"): eight digital outputs, eight digital inputs, one analog input and one
 *     analog output, with accessors for the pins a real board has wired to the world;
 *   - the microsecond clock that the scheduler adapter reads (a board uses its cycle counter; the simulator reads
 *     CLOCK_MONOTONIC);
 *   - the directory the storage keeps its records in (ZPLC_PERSIST_ROOT, as on the POSIX host).
 */

#ifndef ZPLC_FREERTOS_PORT_H
#define ZPLC_FREERTOS_PORT_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/** @brief Monotonic microseconds: the clock of the scheduler adapter. */
uint64_t zplc_freertos_now_us(void);

/** @brief Channels of the simulated board, by kind. */
#define ZPLC_FREERTOS_SIM_DIGITAL_OUTPUTS 8U
#define ZPLC_FREERTOS_SIM_DIGITAL_INPUTS 8U
#define ZPLC_FREERTOS_SIM_ANALOG_INPUTS 1U
#define ZPLC_FREERTOS_SIM_ANALOG_OUTPUTS 1U

/** @brief Drive a digital input pin of the simulated board (the world writes it). Out of range: ignored. */
void zplc_freertos_sim_set_input(uint8_t channel, uint8_t level);
/** @brief The level the program last drove on a digital output pin. Out of range: 0. */
uint8_t zplc_freertos_sim_get_output(uint8_t channel);
/** @brief Set the converter word of an analog input. Out of range: ignored. */
void zplc_freertos_sim_set_adc(uint8_t channel, uint16_t value);
/** @brief The word the program last gave an analog output. Out of range: 0. */
uint16_t zplc_freertos_sim_get_dac(uint8_t channel);
/** @brief Every pin to 0, every word to 0. */
void zplc_freertos_sim_reset(void);
/** @brief Number of pin writes the program made since the last reset (digital and analog outputs). */
uint32_t zplc_freertos_sim_write_count(void);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_FREERTOS_PORT_H */
