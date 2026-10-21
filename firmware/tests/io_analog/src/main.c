/*
 * Analog inputs of the board description (IO-006, IO-018).
 *
 * The description lists two analog inputs, %IW4 on converter channel 0 and %IW5
 * on channel 1, over the native_sim ADC emulator (3.3 V reference, 12 bits).
 *
 *   ok       zplc_hal_init() configures both channels before any scan; the
 *            scheduler writes the raw converter value of each, little endian, at
 *            its word of the input image, and the value follows the voltage.
 *   missing  the second channel names converter channel 5, which the emulator
 *            does not have: the configuration fails when the HAL initializes,
 *            not on the first scan, and the HAL is not ready for RUN.
 */
#include <string.h>
#include <zephyr/devicetree.h>
#include <zephyr/drivers/adc/adc_emul.h>
#include <zephyr/ztest.h>
#include <zplc_core.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_scheduler.h>

#define ADC_DEVICE DEVICE_DT_GET(DT_NODELABEL(adc))
#define PROGRAM_CAPACITY 128U
#define INTERVAL_US 100000U

#define ADDRESS_LOW(address) ((uint8_t)((address) & 0xFFU))
#define ADDRESS_HIGH(address) ((uint8_t)(((address) >> 8) & 0xFFU))
#define WORK_COPY (ZPLC_MEM_WORK_BASE + 0U)

#ifndef ZPLC_IO_ANALOG_MISSING

/* IPI[8..11] (words %IW4 and %IW5) are copied to WORK[0..3]. */
static const uint8_t program_code[] = {
    OP_LOAD8,  ADDRESS_LOW(ZPLC_MEM_IPI_BASE + 8U),  ADDRESS_HIGH(ZPLC_MEM_IPI_BASE + 8U),
    OP_STORE8, ADDRESS_LOW(WORK_COPY + 0U),          ADDRESS_HIGH(WORK_COPY + 0U),
    OP_LOAD8,  ADDRESS_LOW(ZPLC_MEM_IPI_BASE + 9U),  ADDRESS_HIGH(ZPLC_MEM_IPI_BASE + 9U),
    OP_STORE8, ADDRESS_LOW(WORK_COPY + 1U),          ADDRESS_HIGH(WORK_COPY + 1U),
    OP_LOAD8,  ADDRESS_LOW(ZPLC_MEM_IPI_BASE + 10U), ADDRESS_HIGH(ZPLC_MEM_IPI_BASE + 10U),
    OP_STORE8, ADDRESS_LOW(WORK_COPY + 2U),          ADDRESS_HIGH(WORK_COPY + 2U),
    OP_LOAD8,  ADDRESS_LOW(ZPLC_MEM_IPI_BASE + 11U), ADDRESS_HIGH(ZPLC_MEM_IPI_BASE + 11U),
    OP_STORE8, ADDRESS_LOW(WORK_COPY + 3U),          ADDRESS_HIGH(WORK_COPY + 3U),
    OP_HALT,
};

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

static size_t build_program(uint8_t *program) {
  const size_t code_size = sizeof(program_code);
  const size_t code_offset = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE;
  const size_t task_offset = code_offset + code_size;
  const size_t total = task_offset + ZPLC_TASK_DEF_SIZE;
  uint8_t *task = program + task_offset;
  uint32_t crc;

  zassert_true(total <= PROGRAM_CAPACITY, "program buffer overflow");
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

#endif /* !ZPLC_IO_ANALOG_MISSING */

#ifdef ZPLC_IO_ANALOG_MISSING

ZTEST(zplc_io_analog, test_a_converter_channel_that_cannot_be_configured_fails_the_hal_at_initialization) {
  uint16_t value = 0xFFFFU;

  /* IO-018: the failure is the HAL's, before any task exists. */
  zassert_equal(zplc_hal_init(), ZPLC_HAL_ERROR, "a required analog input that cannot be set up fails initialization");
  zassert_equal(zplc_hal_adc_read(0U, &value), ZPLC_HAL_OK, "the channel that could be set up still reads");
  zassert_equal(zplc_hal_adc_read(1U, &value), ZPLC_HAL_NOT_IMPL, "the channel that could not is not available");
  zassert_equal(zplc_hal_shutdown(), ZPLC_HAL_OK, "shutdown after a failed initialization");
}

#else

static void *setup(void) {
  zassert_equal(zplc_hal_init(), ZPLC_HAL_OK, "initialize HAL: both analog channels configure");
  zassert_ok(zplc_sched_init(), "initialize scheduler");
  return NULL;
}

static void teardown(void *fixture) {
  int index;

  ARG_UNUSED(fixture);
  (void)zplc_sched_stop();
  for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; index++) {
    (void)zplc_sched_unregister_task(index);
  }
  zassert_equal(zplc_hal_shutdown(), ZPLC_HAL_OK, "shutdown HAL");
}

/* One scan with the two converter channels at the given millivolts; returns the two words the program saw. */
static void scan_with(unsigned int mv0, unsigned int mv1, uint16_t words[2]) {
  uint8_t program[PROGRAM_CAPACITY];
  zplc_sched_stats_t stats;
  uint32_t before;
  const uint8_t *work;
  int waited_ms = 0;

  zassert_ok(adc_emul_const_value_set(ADC_DEVICE, 0U, mv0), "set channel 0");
  zassert_ok(adc_emul_const_value_set(ADC_DEVICE, 1U, mv1), "set channel 1");
  zassert_ok(zplc_sched_stop(), "stop scheduler");
  zassert_true(zplc_sched_unregister_task(0) == 0 || zplc_sched_unregister_task(0) == -2, "clear task 0");
  zassert_equal(zplc_sched_load(program, build_program(program)), 1, "load the program");
  zassert_ok(zplc_sched_get_stats(&stats), "read the commit count");
  before = stats.output_commit_count;
  zassert_ok(zplc_sched_start(), "start scheduler");
  do {
    k_msleep(5);
    waited_ms += 5;
    zassert_ok(zplc_sched_get_stats(&stats), "read the commit count");
  } while (stats.output_commit_count <= before && waited_ms < 2000);
  zassert_true(stats.output_commit_count > before, "no scan completed");
  work = zplc_mem_get_region(ZPLC_MEM_WORK_BASE);
  words[0] = (uint16_t)(work[0] | (work[1] << 8));
  words[1] = (uint16_t)(work[2] | (work[3] << 8));
}

ZTEST(zplc_io_analog, test_the_description_is_the_table_and_its_image_is_two_words) {
  const zplc_io_table_t *table = zplc_io_table();

  zassert_equal(strcmp(table->board_id, "io-analog-ok"), 0, "board id");
  zassert_equal(table->channel_count, 2U, "two channels");
  zassert_equal(table->input_bytes, 12U, "%IW4 and %IW5 end at byte 12 of the input image");
  zassert_equal(table->output_bytes, 0U, "no output");
  zassert_equal(zplc_io_channel_at(0U)->image_offset, 8U, "AI0 is at byte 8");
  zassert_equal(zplc_io_channel_at(1U)->image_offset, 10U, "AI1 is at byte 10");
}

ZTEST(zplc_io_analog, test_a_reading_is_configured_before_the_first_scan) {
  uint16_t value = 0xFFFFU;

  /* setup() only called zplc_hal_init(): no scan has run, and a read already works. */
  zassert_ok(adc_emul_const_value_set(ADC_DEVICE, 0U, 1000U), "set channel 0");
  zassert_equal(zplc_hal_adc_read(0U, &value), ZPLC_HAL_OK, "channel 0 reads before any scan");
  zassert_true(value > 0U, "and returns the converted voltage");
}

ZTEST(zplc_io_analog, test_the_scan_writes_each_raw_value_at_its_word_and_follows_the_voltage) {
  uint16_t low[2];
  uint16_t high[2];
  uint16_t mid[2];

  scan_with(0U, 3300U, low);
  zassert_equal(low[0], 0U, "0 V reads 0");
  zassert_true(low[1] >= 4090U, "the reference reads full scale, got %u", (unsigned)low[1]);
  scan_with(3300U, 0U, high);
  zassert_true(high[0] >= 4090U && high[1] == 0U, "the channels are not swapped");
  scan_with(1650U, 825U, mid);
  zassert_true(mid[0] > 2000U && mid[0] < 2100U, "half the reference is about half scale, got %u", (unsigned)mid[0]);
  zassert_true(mid[1] > 1000U && mid[1] < 1100U, "a quarter is about a quarter, got %u", (unsigned)mid[1]);
}

#endif

#ifdef ZPLC_IO_ANALOG_MISSING
ZTEST_SUITE(zplc_io_analog, NULL, NULL, NULL, NULL, NULL);
#else
ZTEST_SUITE(zplc_io_analog, NULL, setup, NULL, NULL, teardown);
#endif
