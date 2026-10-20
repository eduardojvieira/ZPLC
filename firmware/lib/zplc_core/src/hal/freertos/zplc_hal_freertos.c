/**
 * @file zplc_hal_freertos.c
 * @brief ZPLC Hardware Abstraction Layer - FreeRTOS implementation (POSIX/GCC simulator build)
 *
 * SPDX-License-Identifier: MIT
 *
 * The second embedded port of the runtime, and the first that is not Zephyr (decision D-06 of the 2.0 remediation).
 * It uses only the public API of FreeRTOS-Kernel: the tick count for the clock, vTaskDelay for the sleep and mutex
 * semaphores for the locks. The scheduler adapter is zplc_scheduler_freertos.c, the storage zplc_persist_freertos.c.
 *
 *   clock     the tick of the kernel, 1 kHz (FreeRTOSConfig.h): the resolution is one millisecond
 *   sleep     vTaskDelay: it blocks the calling task, never the kernel
 *   locks     non-recursive mutex semaphores; a lock that cannot be taken is an error, not a retry
 *   pins      the simulated board of zplc_freertos_port.h; a board port replaces this block with its drivers
 *   network   not provided: the communication blocks bring their own transport
 *
 * Time on the simulator is the host's. Each FreeRTOS task is a pthread and the tick is a Linux timer signal, so the
 * clock is as steady as the machine's scheduler lets it be; nothing here makes it deterministic. The port timing
 * suite measures the clock against itself and bounds the result generously (IO-013).
 */

#include <zplc_hal.h>
#include <zplc_hal_posix.h>

#include "zplc_freertos_port.h"

#include <FreeRTOS.h>
#include <semphr.h>
#include <task.h>

#include <stdarg.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

/* ============================================================================
 * Clock
 * ============================================================================ */

static int tick_override_active = 0;
static uint32_t tick_override_ms = 0U;

/* The logical clock of a scenario: the session sets it for the length of a scenario step and clears it after, as it
 * does on the POSIX port (zplc_hal_posix.h). */
void zplc_hal_posix_set_tick_override(uint32_t tick_ms)
{
    tick_override_ms = tick_ms;
    tick_override_active = 1;
}

void zplc_hal_posix_clear_tick_override(void)
{
    tick_override_active = 0;
    tick_override_ms = 0U;
}

uint32_t zplc_hal_tick(void)
{
    if (tick_override_active != 0) {
        return tick_override_ms;
    }
    /* One tick is portTICK_PERIOD_MS milliseconds (1 at 1 kHz); the count is 32 bits and wraps like the HAL's tick. */
    return (uint32_t)(xTaskGetTickCount() * portTICK_PERIOD_MS);
}

void zplc_hal_sleep(uint32_t ms)
{
    /* Round up to whole ticks: a sleep is never shorter than it was asked to be, by the clock of the port. */
    const uint64_t ticks = ((uint64_t)ms + portTICK_PERIOD_MS - 1U) / portTICK_PERIOD_MS;

    if (ticks == 0U) {
        taskYIELD();
        return;
    }
    /* vTaskDelay takes a TickType_t: a longer sleep is taken in pieces. */
    {
        uint64_t left = ticks;

        while (left != 0U) {
            const TickType_t piece = left > 0x7FFFFFFFU ? (TickType_t)0x7FFFFFFFU : (TickType_t)left;

            vTaskDelay(piece);
            left -= piece;
        }
    }
}

uint64_t zplc_freertos_now_us(void)
{
    struct timespec ts;

    /* The simulator's stand-in for the cycle counter of a board. */
    if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) {
        return (uint64_t)zplc_hal_tick() * 1000U;
    }
    return (uint64_t)ts.tv_sec * 1000000ULL + (uint64_t)ts.tv_nsec / 1000ULL;
}

/* ============================================================================
 * Simulated pins
 * ============================================================================
 * The process image of a real board comes from its pins; on the simulator it comes from these arrays, which a test (or
 * a host tool) writes and reads through zplc_freertos_port.h.
 */

static volatile uint8_t sim_digital_in[ZPLC_FREERTOS_SIM_DIGITAL_INPUTS];
static volatile uint8_t sim_digital_out[ZPLC_FREERTOS_SIM_DIGITAL_OUTPUTS];
static volatile uint16_t sim_analog_in[ZPLC_FREERTOS_SIM_ANALOG_INPUTS];
static volatile uint16_t sim_analog_out[ZPLC_FREERTOS_SIM_ANALOG_OUTPUTS];
static volatile uint32_t sim_writes;

void zplc_freertos_sim_set_input(uint8_t channel, uint8_t level)
{
    if (channel < ZPLC_FREERTOS_SIM_DIGITAL_INPUTS) {
        sim_digital_in[channel] = level != 0U ? 1U : 0U;
    }
}

uint8_t zplc_freertos_sim_get_output(uint8_t channel)
{
    return channel < ZPLC_FREERTOS_SIM_DIGITAL_OUTPUTS ? sim_digital_out[channel] : 0U;
}

void zplc_freertos_sim_set_adc(uint8_t channel, uint16_t value)
{
    if (channel < ZPLC_FREERTOS_SIM_ANALOG_INPUTS) {
        sim_analog_in[channel] = value;
    }
}

uint16_t zplc_freertos_sim_get_dac(uint8_t channel)
{
    return channel < ZPLC_FREERTOS_SIM_ANALOG_OUTPUTS ? sim_analog_out[channel] : 0U;
}

void zplc_freertos_sim_reset(void)
{
    (void)memset((void *)sim_digital_in, 0, sizeof(sim_digital_in));
    (void)memset((void *)sim_digital_out, 0, sizeof(sim_digital_out));
    (void)memset((void *)sim_analog_in, 0, sizeof(sim_analog_in));
    (void)memset((void *)sim_analog_out, 0, sizeof(sim_analog_out));
    sim_writes = 0U;
}

uint32_t zplc_freertos_sim_write_count(void)
{
    return sim_writes;
}

zplc_hal_result_t zplc_hal_gpio_read(uint8_t channel, uint8_t *value)
{
    if (value == NULL) {
        return ZPLC_HAL_ERROR;
    }
    *value = 0U;
    if (channel >= ZPLC_FREERTOS_SIM_DIGITAL_INPUTS) {
        return ZPLC_HAL_NOT_IMPL;
    }
    *value = sim_digital_in[channel];
    return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_gpio_write(uint8_t channel, uint8_t value)
{
    if (channel >= ZPLC_FREERTOS_SIM_DIGITAL_OUTPUTS) {
        return ZPLC_HAL_NOT_IMPL;
    }
    sim_digital_out[channel] = value != 0U ? 1U : 0U;
    sim_writes++;
    return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_adc_read(uint8_t channel, uint16_t *value)
{
    if (value == NULL) {
        return ZPLC_HAL_ERROR;
    }
    *value = 0U;
    if (channel >= ZPLC_FREERTOS_SIM_ANALOG_INPUTS) {
        return ZPLC_HAL_NOT_IMPL;
    }
    *value = sim_analog_in[channel];
    return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_dac_write(uint8_t channel, uint16_t value)
{
    if (channel >= ZPLC_FREERTOS_SIM_ANALOG_OUTPUTS) {
        return ZPLC_HAL_NOT_IMPL;
    }
    sim_analog_out[channel] = value;
    sim_writes++;
    return ZPLC_HAL_OK;
}

/* ============================================================================
 * Synchronization
 * ============================================================================ */

zplc_hal_mutex_t zplc_hal_mutex_create(void)
{
    return (zplc_hal_mutex_t)xSemaphoreCreateMutex();
}

zplc_hal_result_t zplc_hal_mutex_lock(zplc_hal_mutex_t mutex)
{
    if (mutex == NULL) {
        return ZPLC_HAL_ERROR;
    }
    return xSemaphoreTake((SemaphoreHandle_t)mutex, portMAX_DELAY) == pdTRUE ? ZPLC_HAL_OK : ZPLC_HAL_ERROR;
}

zplc_hal_result_t zplc_hal_mutex_unlock(zplc_hal_mutex_t mutex)
{
    if (mutex == NULL) {
        return ZPLC_HAL_ERROR;
    }
    return xSemaphoreGive((SemaphoreHandle_t)mutex) == pdTRUE ? ZPLC_HAL_OK : ZPLC_HAL_ERROR;
}

zplc_hal_result_t zplc_hal_mutex_destroy(zplc_hal_mutex_t mutex)
{
    if (mutex == NULL) {
        return ZPLC_HAL_ERROR;
    }
    vSemaphoreDelete((SemaphoreHandle_t)mutex);
    return ZPLC_HAL_OK;
}

/* ============================================================================
 * Network (not provided)
 * ============================================================================
 * The portable core does not call these; the applications that need a network bring their own transport.
 */

zplc_hal_result_t zplc_hal_net_init(void)
{
    return ZPLC_HAL_NOT_IMPL;
}

zplc_hal_result_t zplc_hal_net_get_ip(char *buf, size_t len)
{
    if (buf != NULL && len > 0U) {
        buf[0] = '\0';
    }
    return ZPLC_HAL_NOT_IMPL;
}

/* ============================================================================
 * Logging
 * ============================================================================ */

void zplc_hal_log(const char *fmt, ...)
{
    va_list args;

    va_start(args, fmt);
    (void)vfprintf(stderr, fmt, args); /* a log line that cannot be written has nowhere else to go */
    va_end(args);
    (void)fflush(stderr);
}

/* ============================================================================
 * Life cycle
 * ============================================================================ */

zplc_hal_result_t zplc_hal_init(void)
{
    zplc_hal_posix_clear_tick_override();
    zplc_freertos_sim_reset();
    return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_shutdown(void)
{
    zplc_hal_posix_clear_tick_override();
    return ZPLC_HAL_OK;
}

/* ============================================================================
 * I/O table (IO-001, IO-007)
 * ============================================================================
 * The simulated board: outputs first, then inputs, each by image address. The digital channels share byte 0 of their
 * image, the analog ones are the 16-bit word at byte 2.
 */

static const zplc_io_channel_t zplc_io_sim_channels[] = {
    /* id     pin     offset kind                   direction             bit hal safe required */
    {"DO0", "SIM_O0", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_OUTPUT, 0U, 0U, 0U, 1U},
    {"DO1", "SIM_O1", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_OUTPUT, 1U, 1U, 0U, 1U},
    {"DO2", "SIM_O2", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_OUTPUT, 2U, 2U, 0U, 1U},
    {"DO3", "SIM_O3", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_OUTPUT, 3U, 3U, 0U, 1U},
    {"DO4", "SIM_O4", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_OUTPUT, 4U, 4U, 0U, 1U},
    {"DO5", "SIM_O5", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_OUTPUT, 5U, 5U, 0U, 1U},
    {"DO6", "SIM_O6", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_OUTPUT, 6U, 6U, 0U, 1U},
    {"DO7", "SIM_O7", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_OUTPUT, 7U, 7U, 0U, 1U},
    {"AO0", "SIM_AO0", 2U, ZPLC_IO_KIND_ANALOG, ZPLC_IO_DIR_OUTPUT, 0U, 0U, 0U, 1U},
    {"DI0", "SIM_I0", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_INPUT, 0U, 0U, 0U, 1U},
    {"DI1", "SIM_I1", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_INPUT, 1U, 1U, 0U, 1U},
    {"DI2", "SIM_I2", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_INPUT, 2U, 2U, 0U, 1U},
    {"DI3", "SIM_I3", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_INPUT, 3U, 3U, 0U, 1U},
    {"DI4", "SIM_I4", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_INPUT, 4U, 4U, 0U, 1U},
    {"DI5", "SIM_I5", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_INPUT, 5U, 5U, 0U, 1U},
    {"DI6", "SIM_I6", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_INPUT, 6U, 6U, 0U, 1U},
    {"DI7", "SIM_I7", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_INPUT, 7U, 7U, 0U, 1U},
    {"AI0", "SIM_AI0", 2U, ZPLC_IO_KIND_ANALOG, ZPLC_IO_DIR_INPUT, 0U, 0U, 0U, 1U},
};

/* The hash is a constant: this board has no description in boards.json for Studio to compare. */
static const zplc_io_table_t zplc_io_sim_description = {
    "freertos-sim", 0xF3EE0001U, 4U, 4U, (uint16_t)(sizeof(zplc_io_sim_channels) / sizeof(zplc_io_sim_channels[0])),
    zplc_io_sim_channels};

const zplc_io_table_t *zplc_io_table(void)
{
    return &zplc_io_sim_description;
}

#include "../common/zplc_io_common.inc"
