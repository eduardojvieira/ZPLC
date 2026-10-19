/**
 * @file test_io_unsupported.c
 * @brief An I/O operation a board cannot perform is counted and reported, not swallowed (IO-007).
 *
 * SPDX-License-Identifier: MIT
 *
 * The scan skips a channel whose HAL answers ZPLC_HAL_NOT_IMPL, so that one missing converter does not stop the
 * controller. Skipping must not hide it: zplc_io_unsupported_get() says how many inputs and outputs the board could
 * not serve, so that the ports can tell the user. The board below is its own table with a recording pin driver.
 */

#define _POSIX_C_SOURCE 200809L

#include <stdio.h>
#include <string.h>

#include <zplc_core.h>
#include <zplc_hal.h>
#include <zplc_sched_core.h>

static int test_count = 0;
static int fail_count = 0;

#define CHECK(cond, msg)                                                       \
  do {                                                                         \
    test_count++;                                                              \
    if (!(cond)) {                                                             \
      fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__);                  \
      fail_count++;                                                            \
    } else {                                                                   \
      printf("PASS: %s\n", msg);                                               \
    }                                                                          \
  } while (0)

/* DO0 works; AO0 (analog output) and AI0 (analog input) have no converter on this board; DI0 works. */
static const zplc_io_channel_t channels[] = {
    /* id    pin    offset kind                   dir                   bit hal safe req */
    {"DO0", "GP0", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_OUTPUT, 0U, 0U, 0U, 1U},
    {"AO0", "GP20", 4U, ZPLC_IO_KIND_ANALOG, ZPLC_IO_DIR_OUTPUT, 0U, 0U, 0U, 1U},
    {"DI0", "GP15", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_INPUT, 0U, 1U, 0U, 1U},
    {"AI0", "GP26", 8U, ZPLC_IO_KIND_ANALOG, ZPLC_IO_DIR_INPUT, 0U, 0U, 0U, 1U},
};

static const zplc_io_table_t table = {"unsupported-board", 0x10ADU, 1U, 2U, 4U, channels};

const zplc_io_table_t *zplc_io_table(void) { return &table; }

zplc_hal_result_t zplc_hal_gpio_read(uint8_t channel, uint8_t *value) {
  (void)channel;
  *value = 1U;
  return ZPLC_HAL_OK;
}
zplc_hal_result_t zplc_hal_gpio_write(uint8_t channel, uint8_t value) {
  (void)channel;
  (void)value;
  return ZPLC_HAL_OK;
}
zplc_hal_result_t zplc_hal_adc_read(uint8_t channel, uint16_t *value) {
  (void)channel;
  *value = 0U;
  return ZPLC_HAL_NOT_IMPL;
}
zplc_hal_result_t zplc_hal_dac_write(uint8_t channel, uint16_t value) {
  (void)channel;
  (void)value;
  return ZPLC_HAL_NOT_IMPL;
}

static int mutex_object;
zplc_hal_mutex_t zplc_hal_mutex_create(void) { return &mutex_object; }
zplc_hal_result_t zplc_hal_mutex_lock(zplc_hal_mutex_t mutex) {
  (void)mutex;
  return ZPLC_HAL_OK;
}
zplc_hal_result_t zplc_hal_mutex_destroy(zplc_hal_mutex_t mutex) {
  (void)mutex;
  return ZPLC_HAL_OK;
}
zplc_hal_result_t zplc_hal_mutex_unlock(zplc_hal_mutex_t mutex) {
  (void)mutex;
  return ZPLC_HAL_OK;
}
uint32_t zplc_hal_tick(void) { return 0U; }

#include "../src/hal/common/zplc_io_common.inc"

static void test_a_board_that_serves_everything_reports_nothing(void) {
  zplc_io_unsupported_t u;

  zplc_io_unsupported_reset();
  zplc_io_unsupported_get(&u);
  CHECK(u.inputs == 0U && u.outputs == 0U, "nothing is reported before an operation was tried");
}

static void test_a_missing_input_converter_is_counted_once_however_many_scans(void) {
  zplc_io_samples_t samples;
  zplc_io_unsupported_t u;
  int scan;

  zplc_io_unsupported_reset();
  for (scan = 0; scan < 5; scan++) {
    CHECK(zplc_io_sample(&samples, NULL) == ZPLC_HAL_OK, "the scan goes on without the converter");
  }
  zplc_io_unsupported_get(&u);
  CHECK(u.inputs == 1U && u.outputs == 0U, "the analog input is reported, once, and no output is");
}

static void test_a_missing_output_converter_is_counted_when_written_and_when_driven_safe(void) {
  zplc_io_outputs_t outputs;
  zplc_io_unsupported_t u;

  memset(&outputs, 0, sizeof(outputs));
  zplc_io_unsupported_reset();
  CHECK(zplc_io_write_outputs(&outputs, NULL) == ZPLC_HAL_OK, "the write phase goes on without the converter");
  zplc_io_unsupported_get(&u);
  CHECK(u.outputs == 1U && u.inputs == 0U, "the analog output is reported by the write phase");

  zplc_io_unsupported_reset();
  CHECK(zplc_io_drive_safe(NULL) == ZPLC_HAL_OK, "driving the safe state is not an error for an analog output");
  zplc_io_unsupported_get(&u);
  CHECK(u.outputs == 0U, "an analog output is not driven to a safe level, so it is not reported there");
}

static zplc_hal_result_t digital_write_not_supported(const zplc_io_channel_t *channel, uint16_t value) {
  (void)channel;
  (void)value;
  return ZPLC_HAL_NOT_IMPL;
}

static void test_a_digital_output_that_cannot_be_driven_safe_is_reported(void) {
  const zplc_io_ops_t ops = {NULL, digital_write_not_supported};
  zplc_io_unsupported_t u;

  zplc_io_unsupported_reset();
  CHECK(zplc_io_drive_safe(&ops) == ZPLC_HAL_OK, "the safe-state drive attempts every channel");
  zplc_io_unsupported_get(&u);
  CHECK(u.outputs == 1U, "a pin that cannot be driven to its safe level is reported");
}

int main(void) {
  printf("==== test_io_unsupported ====\n");
  test_a_board_that_serves_everything_reports_nothing();
  test_a_missing_input_converter_is_counted_once_however_many_scans();
  test_a_missing_output_converter_is_counted_when_written_and_when_driven_safe();
  test_a_digital_output_that_cannot_be_driven_safe_is_reported();
  printf("\n%d checks, %d failed\n", test_count, fail_count);
  return fail_count == 0 ? 0 : 1;
}
