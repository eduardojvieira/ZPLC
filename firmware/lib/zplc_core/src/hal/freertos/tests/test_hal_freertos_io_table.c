/**
 * @file test_hal_freertos_io_table.c
 * @brief IO-016, IO-007: the I/O table of the FreeRTOS port reaches the process image through the shared accessors, and a
 *        channel the board lacks is a defined result.
 *
 * SPDX-License-Identifier: MIT
 *
 * test_io_table.c holds the accessors every port shares to their contract on a table of its own. This one runs them
 * on the table of this port ("freertos-sim"): eight digital outputs and inputs in byte 0 of their images and one
 * analog word of each direction at byte 2. A pin the test sets on the board must arrive in the input image after a
 * sample and a latch, and the output image must arrive on the pins after a capture and a write.
 */

#include <stdio.h>
#include <string.h>

#include <zplc_core.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_sched_core.h>

#include "zplc_freertos_port.h"

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

static const zplc_io_channel_t *find(const char *id) {
  size_t index;

  for (index = 0U; index < zplc_io_channel_count(); index++) {
    const zplc_io_channel_t *channel = zplc_io_channel_at(index);

    if (strcmp(channel->id, id) == 0) {
      return channel;
    }
  }
  return NULL;
}

static void test_the_table_describes_the_board(void) {
  const zplc_io_table_t *table = zplc_io_table();
  size_t index;
  size_t outputs = 0U;
  size_t inputs = 0U;
  int outputs_first = 1;
  int seen_input = 0;

  printf("\n=== Test: the table describes the simulated board ===\n");
  CHECK(table != NULL && strcmp(table->board_id, "freertos-sim") == 0, "the port names its board");
  CHECK(zplc_io_channel_count() == table->channel_count && table->channel_count == 18U, "eighteen channels");
  CHECK(table->channel_count <= ZPLC_IO_MAX_CHANNELS, "within the limit of a table");
  CHECK(zplc_io_channel_at(table->channel_count) == NULL, "there is none past the end");
  for (index = 0U; index < zplc_io_channel_count(); index++) {
    const zplc_io_channel_t *channel = zplc_io_channel_at(index);

    if (channel->direction == ZPLC_IO_DIR_OUTPUT) {
      outputs++;
      if (seen_input) {
        outputs_first = 0;
      }
    } else {
      inputs++;
      seen_input = 1;
    }
  }
  CHECK(outputs == 9U && inputs == 9U, "nine outputs and nine inputs");
  CHECK(outputs_first, "outputs come first, as the table contract says");
  CHECK(table->input_bytes == 4U && table->output_bytes == 4U, "four bytes of each image");
}

static void test_a_pin_reaches_the_input_image(void) {
  zplc_io_samples_t samples;
  const uint8_t *ipi;

  printf("\n=== Test: a pin of the board reaches the input image ===\n");
  CHECK(zplc_hal_init() == ZPLC_HAL_OK, "the HAL starts");
  CHECK(zplc_core_init() == 0, "the core starts");
  zplc_freertos_sim_reset();
  zplc_freertos_sim_set_input(1U, 1U);
  zplc_freertos_sim_set_input(6U, 1U);
  zplc_freertos_sim_set_adc(0U, 0x1234U);
  memset(&samples, 0, sizeof(samples));
  CHECK(zplc_io_sample(&samples, NULL) == ZPLC_HAL_OK, "every input answers");
  zplc_io_apply_samples(&samples);
  ipi = zplc_mem_get_region(ZPLC_MEM_IPI_BASE);
  CHECK(ipi != NULL && ipi[0] == 0x42U, "DI1 and DI6 are bits 1 and 6 of input byte 0");
  CHECK(ipi != NULL && ipi[2] == 0x34U && ipi[3] == 0x12U, "AI0 is the little-endian word at byte 2");
  CHECK(zplc_io_image_get(ipi, ZPLC_MEM_IPI_SIZE, find("DI6")) == 1U, "the image helper reads DI6 as 1");
  CHECK(zplc_io_image_get(ipi, ZPLC_MEM_IPI_SIZE, find("DI0")) == 0U, "and DI0 as 0");
  CHECK(zplc_io_image_get(ipi, ZPLC_MEM_IPI_SIZE, find("AI0")) == 0x1234U, "and the analog word whole");
  zplc_freertos_sim_set_input(1U, 0U);
  CHECK(zplc_io_sample(&samples, NULL) == ZPLC_HAL_OK, "a second sample");
  zplc_io_apply_samples(&samples);
  CHECK(ipi[0] == 0x40U, "a pin that fell clears its bit and leaves the others");
}

static void test_the_output_image_reaches_the_pins(void) {
  zplc_io_outputs_t outputs;
  uint8_t *opi = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);

  printf("\n=== Test: the output image reaches the pins ===\n");
  CHECK(opi != NULL, "the output image exists");
  if (opi == NULL) {
    return;
  }
  zplc_freertos_sim_reset();
  opi[0] = 0x81U;
  opi[2] = 0xCDU;
  opi[3] = 0xABU;
  zplc_io_capture_outputs(&outputs);
  CHECK(zplc_io_write_outputs(&outputs, NULL) == ZPLC_HAL_OK, "the write succeeds");
  CHECK(zplc_freertos_sim_get_output(0U) == 1U && zplc_freertos_sim_get_output(7U) == 1U &&
            zplc_freertos_sim_get_output(3U) == 0U,
        "DO0 and DO7 are high, the rest low");
  CHECK(zplc_freertos_sim_get_dac(0U) == 0xABCDU, "AO0 holds the word of bytes 2 and 3");
  CHECK(zplc_io_drive_safe(NULL) == ZPLC_HAL_OK, "the safe state is driven");
  CHECK(zplc_freertos_sim_get_output(0U) == 0U && zplc_freertos_sim_get_output(7U) == 0U,
        "every digital output is at its safe level, zero");
  /* The core drives digital outputs only (zplc_io_drive_safe); an analog output keeps its last word. The scheduler
   * resets the output image to zero on a fault or a STOP, and the next write of the image gives the word zero. */
  CHECK(zplc_freertos_sim_get_dac(0U) == 0xABCDU, "an analog output is not touched by the safe state of the core");
}

static void test_a_channel_the_board_lacks_is_a_defined_result(void) {
  uint8_t level = 9U;
  uint16_t word = 9U;

  printf("\n=== Test: a pin the board does not have is a defined result (IO-007) ===\n");
  CHECK(zplc_hal_gpio_read(ZPLC_FREERTOS_SIM_DIGITAL_INPUTS, &level) == ZPLC_HAL_NOT_IMPL && level == 0U,
        "reading past the last digital input is NOT_IMPL and gives 0");
  CHECK(zplc_hal_gpio_write(ZPLC_FREERTOS_SIM_DIGITAL_OUTPUTS, 1U) == ZPLC_HAL_NOT_IMPL, "so is writing past the last output");
  CHECK(zplc_hal_adc_read(ZPLC_FREERTOS_SIM_ANALOG_INPUTS, &word) == ZPLC_HAL_NOT_IMPL && word == 0U,
        "so is an analog input past the last");
  CHECK(zplc_hal_dac_write(ZPLC_FREERTOS_SIM_ANALOG_OUTPUTS, 1U) == ZPLC_HAL_NOT_IMPL, "and an analog output");
  CHECK(zplc_hal_gpio_read(0U, NULL) == ZPLC_HAL_ERROR && zplc_hal_adc_read(0U, NULL) == ZPLC_HAL_ERROR,
        "a read with nowhere to put the value is an error");
  CHECK(zplc_io_read_channel(NULL, &word) == ZPLC_HAL_ERROR && zplc_io_write_channel(find("DI0"), 1U) == ZPLC_HAL_ERROR,
        "reading no channel, and writing an input, are errors");
}

int main(void) {
  printf("ZPLC port conformance: I/O table (FreeRTOS)\n");
  test_the_table_describes_the_board();
  test_a_pin_reaches_the_input_image();
  test_the_output_image_reaches_the_pins();
  test_a_channel_the_board_lacks_is_a_defined_result();
  printf("\n%d checks, %d failed\n", test_count, fail_count);
  return fail_count == 0 ? 0 : 1;
}
