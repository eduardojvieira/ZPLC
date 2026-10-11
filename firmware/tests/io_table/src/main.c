/*
 * The board I/O description drives the firmware I/O (IO-001, IO-002, IO-005, IO-018).
 *
 * The build generates the I/O table from io_<variant>.json. This test reads that
 * table and nothing else about the board: it drives every emulated input pin high,
 * runs a scan of a program that copies the input image and sets the output image,
 * and checks that
 *   - a described input lands in the input image at its address;
 *   - a described output reaches its pin;
 *   - a pin the devicetree has but the description does not list is left alone.
 * The base and the extended description run the same code, so the extra channels
 * of the extended one (an output in a second byte, an input in a third) reach the
 * image and the pins without a line of C that names them.
 */
#include <stdbool.h>
#include <string.h>
#include <zephyr/devicetree.h>
#include <zephyr/drivers/gpio/gpio_emul.h>
#include <zephyr/ztest.h>
#include <zplc_core.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_scheduler.h>

#include "zplc_io_zephyr.h"

#define GPIO_CONTROLLER DEVICE_DT_GET(DT_NODELABEL(gpio0))

/* The candidate pins of the devicetree overlay: outputs 0 to 6, inputs 8 to 12. */
#define OUTPUT_PIN_COUNT 7U
#define INPUT_PIN_FIRST 8U
#define INPUT_PIN_COUNT 5U

#define PROGRAM_CAPACITY 128U
#define INTERVAL_US 100000U
#define INPUT_BYTES_COPIED 3U

#define WORK_COPY (ZPLC_MEM_WORK_BASE + 0U)
#define ADDRESS_LOW(address) ((uint8_t)((address) & 0xFFU))
#define ADDRESS_HIGH(address) ((uint8_t)(((address) >> 8) & 0xFFU))

/* IPI[0..2] are copied to WORK[0..2]; OPI[0] and OPI[1] are set to the values
 * patched at VALUE_0_INDEX and VALUE_1_INDEX. */
static const uint8_t program_code[] = {
    OP_LOAD8, ADDRESS_LOW(ZPLC_MEM_IPI_BASE + 0U), ADDRESS_HIGH(ZPLC_MEM_IPI_BASE + 0U),
    OP_STORE8, ADDRESS_LOW(WORK_COPY + 0U), ADDRESS_HIGH(WORK_COPY + 0U),
    OP_LOAD8, ADDRESS_LOW(ZPLC_MEM_IPI_BASE + 1U), ADDRESS_HIGH(ZPLC_MEM_IPI_BASE + 1U),
    OP_STORE8, ADDRESS_LOW(WORK_COPY + 1U), ADDRESS_HIGH(WORK_COPY + 1U),
    OP_LOAD8, ADDRESS_LOW(ZPLC_MEM_IPI_BASE + 2U), ADDRESS_HIGH(ZPLC_MEM_IPI_BASE + 2U),
    OP_STORE8, ADDRESS_LOW(WORK_COPY + 2U), ADDRESS_HIGH(WORK_COPY + 2U),
    OP_PUSH8, 0U, /* VALUE_0_INDEX */
    OP_STORE8, ADDRESS_LOW(ZPLC_MEM_OPI_BASE + 0U), ADDRESS_HIGH(ZPLC_MEM_OPI_BASE + 0U),
    OP_PUSH8, 0U, /* VALUE_1_INDEX */
    OP_STORE8, ADDRESS_LOW(ZPLC_MEM_OPI_BASE + 1U), ADDRESS_HIGH(ZPLC_MEM_OPI_BASE + 1U),
    OP_HALT,
};
#define VALUE_0_INDEX 19U
#define VALUE_1_INDEX 24U

static uint32_t crc32_update(uint32_t crc, const uint8_t *data, size_t length) {
  size_t index;

  for (index = 0U; index < length; index++) {
    uint32_t bit;

    crc ^= data[index];
    for (bit = 0U; bit < 8U; bit++) {
      crc = (crc & 1U) != 0U ? (crc >> 1) ^ 0xEDB88320U : crc >> 1;
    }
  }
  return crc;
}

static void write_u16_le(uint8_t *data, uint16_t value) {
  data[0] = (uint8_t)value;
  data[1] = (uint8_t)(value >> 8);
}

static void write_u32_le(uint8_t *data, uint32_t value) {
  data[0] = (uint8_t)value;
  data[1] = (uint8_t)(value >> 8);
  data[2] = (uint8_t)(value >> 16);
  data[3] = (uint8_t)(value >> 24);
}

static size_t build_program(uint8_t *program, uint8_t value_0, uint8_t value_1) {
  const size_t code_size = sizeof(program_code);
  const size_t code_offset = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE;
  const size_t task_offset = code_offset + code_size;
  const size_t total = task_offset + ZPLC_TASK_DEF_SIZE;
  uint8_t *task = program + task_offset;
  uint32_t crc;

  zassert_true(total <= PROGRAM_CAPACITY, "program buffer overflow");
  zassert_equal(program_code[VALUE_0_INDEX - 1U], OP_PUSH8, "value 0 follows a push");
  zassert_equal(program_code[VALUE_1_INDEX - 1U], OP_PUSH8, "value 1 follows a push");
  memset(program, 0, total);
  memcpy(program, "ZPLC", 4U);
  write_u16_le(program + 4U, ZPLC_VERSION_MAJOR);
  write_u16_le(program + 6U, ZPLC_VERSION_MINOR);
  write_u32_le(program + 28U, ZPLC_DRAFT_COUNTER);
  write_u32_le(program + 16U, (uint32_t)code_size);
  write_u32_le(program + 20U, (uint32_t)ZPLC_TASK_DEF_SIZE);
  write_u16_le(program + 26U, 2U);
  write_u16_le(program + 32U, ZPLC_SEG_CODE);
  write_u32_le(program + 36U, (uint32_t)code_size);
  write_u16_le(program + 40U, ZPLC_SEG_TASK);
  write_u32_le(program + 44U, (uint32_t)ZPLC_TASK_DEF_SIZE);
  memcpy(program + code_offset, program_code, code_size);
  program[code_offset + VALUE_0_INDEX] = value_0;
  program[code_offset + VALUE_1_INDEX] = value_1;
  write_u16_le(task, 1U);
  task[2] = ZPLC_TASK_CYCLIC;
  task[3] = 1U;
  write_u32_le(task + 4U, INTERVAL_US);
  write_u16_le(task + 8U, 0U);
  write_u16_le(task + 10U, 64U);
  crc = crc32_update(0xFFFFFFFFU, program, 12U);
  crc = crc32_update(crc, program + 16U, total - 16U) ^ 0xFFFFFFFFU;
  write_u32_le(program + 12U, crc);
  return total;
}

static void clear_scheduler(void) {
  int index;

  zassert_ok(zplc_sched_stop(), "stop scheduler");
  for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; index++) {
    int result = zplc_sched_unregister_task(index);

    zassert_true(result == 0 || result == -2, "unregister task");
  }
}

/* The pin of a digital channel of the table, from the generated bindings. */
static uint8_t channel_pin(const zplc_io_channel_t *channel) {
  zassert_true(channel->hal_channel < zplc_io_gpio_binding_count, "HAL number in range");
  return (uint8_t)zplc_io_gpio_bindings[channel->hal_channel].spec.pin;
}

static bool output_pin_is_described(uint8_t pin) {
  size_t index;

  for (index = 0U; index < zplc_io_channel_count(); index++) {
    const zplc_io_channel_t *channel = zplc_io_channel_at(index);

    if (channel->direction == ZPLC_IO_DIR_OUTPUT && channel_pin(channel) == pin) {
      return true;
    }
  }
  return false;
}

/* Runs the program until one scan committed its outputs and leaves the pins and the
 * copied input image where the scan put them (a stop would drive the pins safe). */
static void run_scan(uint8_t value_0, uint8_t value_1, uint8_t *input_copy) {
  uint8_t program[PROGRAM_CAPACITY];
  zplc_sched_stats_t stats;
  uint32_t before;
  size_t size;
  int waited_ms = 0;

  clear_scheduler();
  size = build_program(program, value_0, value_1);
  zassert_equal(zplc_sched_load(program, size), 1, "load the program");
  zassert_ok(zplc_sched_get_stats(&stats), "read the commit count");
  before = stats.output_commit_count; /* the count survives a load: wait for a scan of this program */
  zassert_ok(zplc_sched_start(), "start scheduler");
  do {
    k_msleep(5);
    waited_ms += 5;
    zassert_ok(zplc_sched_get_stats(&stats), "read the commit count");
  } while (stats.output_commit_count <= before && waited_ms < 2000);
  zassert_true(stats.output_commit_count > before, "no output commit");
  memcpy(input_copy, zplc_mem_get_region(ZPLC_MEM_WORK_BASE), INPUT_BYTES_COPIED);
}

static bool input_pin_is_described(uint8_t pin) {
  size_t index;

  for (index = 0U; index < zplc_io_channel_count(); index++) {
    const zplc_io_channel_t *channel = zplc_io_channel_at(index);

    if (channel->direction == ZPLC_IO_DIR_INPUT && channel_pin(channel) == pin) {
      return true;
    }
  }
  return false;
}

/* The emulator accepts a level only on a pin that the HAL configured as an input, so a pin of the
 * devicetree that the description does not list is refused: the HAL never touched it. */
static void drive_all_inputs(int level) {
  uint8_t pin;

  for (pin = INPUT_PIN_FIRST; pin < INPUT_PIN_FIRST + INPUT_PIN_COUNT; pin++) {
    int result = gpio_emul_input_set(GPIO_CONTROLLER, pin, level);

    if (input_pin_is_described(pin)) {
      zassert_ok(result, "a described input pin is configured as an input");
    } else {
      zassert_true(result != 0, "an undescribed pin is not configured as an input");
    }
  }
}

static void *setup(void) {
  /* IO-018: the peripherals are configured here, before any task runs */
  zassert_equal(zplc_hal_init(), ZPLC_HAL_OK, "initialize HAL from the description");
  zassert_ok(zplc_sched_init(), "initialize scheduler");
  return NULL;
}

static void teardown(void *fixture) {
  ARG_UNUSED(fixture);
  clear_scheduler();
  zassert_equal(zplc_hal_shutdown(), ZPLC_HAL_OK, "shutdown HAL");
}

ZTEST(zplc_io_table, test_the_table_is_the_description_of_the_build) {
  const zplc_io_table_t *table = zplc_io_table();

  zassert_equal(strcmp(table->board_id, "io-test-" ZPLC_IO_VARIANT_STR), 0, "board id");
  zassert_equal(table->channel_count, EXPECT_CHANNEL_COUNT, "channel count");
  /* IO-005: the image sizes are what the channels need */
  zassert_equal(table->input_bytes, EXPECT_INPUT_BYTES, "input image bytes");
  zassert_equal(table->output_bytes, EXPECT_OUTPUT_BYTES, "output image bytes");
  /* outputs first, then inputs, as the HAL numbers them: all channels are digital here */
  {
    bool seen_input = false;

    for (size_t index = 0U; index < table->channel_count; index++) {
      const zplc_io_channel_t *channel = zplc_io_channel_at(index);

      zassert_equal(channel->hal_channel, (uint8_t)index,
                    "HAL gpio channel is the position in the table");
      if (channel->direction == ZPLC_IO_DIR_INPUT) {
        seen_input = true;
      } else {
        zassert_false(seen_input, "an output after an input");
      }
    }
  }
}

ZTEST(zplc_io_table, test_described_outputs_reach_their_pins_and_nothing_else) {
  uint8_t input_copy[INPUT_BYTES_COPIED];
  uint8_t pin;

  drive_all_inputs(0);
  run_scan(0xFFU, 0xFFU, input_copy);
  for (pin = 0U; pin < OUTPUT_PIN_COUNT; pin++) {
    zassert_equal(gpio_emul_output_get(GPIO_CONTROLLER, pin),
                  output_pin_is_described(pin) ? 1 : 0,
                  "a described output follows the image; an undescribed pin is untouched");
  }
  run_scan(0x00U, 0x00U, input_copy);
  for (pin = 0U; pin < OUTPUT_PIN_COUNT; pin++) {
    zassert_equal(gpio_emul_output_get(GPIO_CONTROLLER, pin), 0, "outputs go low with the image");
  }
}

ZTEST(zplc_io_table, test_described_inputs_land_in_the_image_at_their_address) {
  uint8_t input_copy[INPUT_BYTES_COPIED];
  size_t index;
  uint8_t pin;
  int described_inputs = 0;

  drive_all_inputs(1);
  run_scan(0x00U, 0x00U, input_copy);
  for (index = 0U; index < zplc_io_channel_count(); index++) {
    const zplc_io_channel_t *channel = zplc_io_channel_at(index);

    if (channel->direction == ZPLC_IO_DIR_INPUT) {
      zassert_equal(zplc_io_image_get(input_copy, sizeof(input_copy), channel), 1U,
                    "a described input is high at its address");
      described_inputs++;
    }
  }
  zassert_equal(described_inputs, EXPECT_INPUT_CHANNELS, "input channel count");
  /* every bit of the copied bytes that no channel describes is still zero */
  for (pin = 0U; pin < 8U * INPUT_BYTES_COPIED; pin++) {
    bool described = false;

    for (index = 0U; index < zplc_io_channel_count(); index++) {
      const zplc_io_channel_t *channel = zplc_io_channel_at(index);

      if (channel->direction == ZPLC_IO_DIR_INPUT &&
          (size_t)channel->image_offset * 8U + channel->bit == pin) {
        described = true;
      }
    }
    if (!described) {
      zassert_equal((input_copy[pin / 8U] >> (pin % 8U)) & 1U, 0U,
                    "an image bit without a channel stays zero");
    }
  }

  drive_all_inputs(0);
  run_scan(0x00U, 0x00U, input_copy);
  zassert_equal(input_copy[0], 0U, "inputs go low in the image");
  zassert_equal(input_copy[2], 0U, "inputs of the third byte go low");
}

ZTEST_SUITE(zplc_io_table, NULL, setup, NULL, NULL, teardown);
