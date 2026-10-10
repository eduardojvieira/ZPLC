/*
 * RETAIN persistence of the Zephyr scheduler (RT-025, RT-026).
 *
 * The real scheduler, core and Zephyr HAL run on native_sim with CONFIG_NVS over
 * the flash simulator, so the record, its chunks and the NVS entry limits are
 * the ones a board uses. A power cycle is zplc_sched_shutdown() followed by
 * zplc_sched_init(): the RAM is zeroed, the flash simulator keeps its content.
 *
 * This is simulator evidence. It shows that the scheduler stores on STOP and
 * periodically, restores at load and says why it did not; it does not show
 * that a board keeps its values across a real power cut.
 */
#include <string.h>
#include <zephyr/kernel.h>
#include <zephyr/ztest.h>
#include <zplc_core.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_retain.h>
#include <zplc_scheduler.h>

#define PROGRAM_CAPACITY 128U
#define SCAN_INTERVAL_US 100000U

#define ADDRESS_LOW(address) ((uint8_t)((address) & 0xFFU))
#define ADDRESS_HIGH(address) ((uint8_t)(((address) >> 8) & 0xFFU))

/* RETAIN[0..3] += 1 once per scan. */
static const uint8_t counter_code[] = {
    OP_LOAD32, ADDRESS_LOW(ZPLC_MEM_RETAIN_BASE), ADDRESS_HIGH(ZPLC_MEM_RETAIN_BASE),
    OP_PUSH32, 1U, 0U, 0U, 0U,
    OP_ADD,
    OP_STORE32, ADDRESS_LOW(ZPLC_MEM_RETAIN_BASE), ADDRESS_HIGH(ZPLC_MEM_RETAIN_BASE),
    OP_HALT,
};

/* Another program: it never touches RETAIN. */
static const uint8_t other_code[] = {
    OP_PUSH8, 0x55U,
    OP_STORE8, ADDRESS_LOW(ZPLC_MEM_WORK_BASE), ADDRESS_HIGH(ZPLC_MEM_WORK_BASE),
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

/* One cyclic task that starts at the first instruction. */
static size_t build_program(uint8_t *program, const uint8_t *code, size_t code_size) {
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
  write_u32_le(program + 20U, ZPLC_TASK_DEF_SIZE);
  write_u16_le(program + 26U, 2U);
  write_u16_le(program + 32U, ZPLC_SEG_CODE);
  write_u32_le(program + 36U, (uint32_t)code_size);
  write_u16_le(program + 40U, ZPLC_SEG_TASK);
  write_u32_le(program + 44U, ZPLC_TASK_DEF_SIZE);
  memcpy(program + code_offset, code, code_size);
  write_u16_le(task, 1U);
  task[2] = ZPLC_TASK_CYCLIC;
  task[3] = 1U;
  write_u32_le(task + 4U, SCAN_INTERVAL_US);
  write_u16_le(task + 8U, 0U);
  write_u16_le(task + 10U, 64U);
  crc = crc32_update(0xFFFFFFFFU, program, 12U);
  crc = crc32_update(crc, program + 16U, total - 16U) ^ 0xFFFFFFFFU;
  write_u32_le(program + 12U, crc);
  return total;
}

static void load(const uint8_t *code, size_t code_size) {
  uint8_t program[PROGRAM_CAPACITY];
  const size_t size = build_program(program, code, code_size);

  zassert_equal(zplc_sched_load(program, size), 1, "load the program");
}

static uint32_t retain_counter(void) {
  const uint8_t *retain = zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE);

  return (uint32_t)retain[0] | ((uint32_t)retain[1] << 8) |
         ((uint32_t)retain[2] << 16) | ((uint32_t)retain[3] << 24);
}

static zplc_retain_status_t retain_status(void) {
  zplc_retain_status_t status;

  zplc_retain_last_status(&status);
  return status;
}

/* RAM is lost, flash is kept. */
static void power_cycle(void) {
  zassert_ok(zplc_sched_shutdown(), "shut the scheduler down");
  zassert_ok(zplc_sched_init(), "start the scheduler again");
}

/* An empty store: the keys of the RETAIN chunks, both slots. */
static void clear_store(void) {
  zassert_ok(zplc_sched_shutdown(), "shut the scheduler down");
  (void)zplc_hal_persist_delete("retain_a0");
  (void)zplc_hal_persist_delete("retain_b0");
  zassert_ok(zplc_sched_init(), "start the scheduler again");
}

static void *retain_setup(void) {
  zassert_equal(zplc_hal_init(), ZPLC_HAL_OK, "initialize HAL");
  zassert_ok(zplc_sched_init(), "initialize scheduler");
  return NULL;
}

static void retain_teardown(void *fixture) {
  ARG_UNUSED(fixture);
  zassert_ok(zplc_sched_shutdown(), "shut the scheduler down");
  zassert_equal(zplc_hal_shutdown(), ZPLC_HAL_OK, "shutdown HAL");
}

/* Runs the counter for about four scans, then stops. */
static uint32_t count_and_stop(void) {
  uint32_t counted;

  zassert_ok(zplc_sched_start(), "start");
  k_msleep(450);
  zassert_ok(zplc_sched_stop(), "stop");
  counted = retain_counter();
  zassert_true(counted >= 2U, "the program counted scans");
  return counted;
}

/* RT-025: STOP stores the region and the next load restores it. Fails without the
 * fix: the region is plain RAM, so the counter restarts from zero. */
ZTEST(zplc_retain_persist, test_stop_stores_and_load_restores) {
  uint32_t counted;
  zplc_retain_status_t status;

  clear_store();
  load(counter_code, sizeof(counter_code));
  status = retain_status();
  zassert_equal(status.reason, ZPLC_RETAIN_NONE, "an empty store says none");
  zassert_equal(retain_counter(), 0U, "the region starts initialised");

  counted = count_and_stop();
  status = retain_status();
  zassert_equal(status.saves, 1U, "STOP stored one record");
  zassert_equal(status.sequence, 1U, "the first record has sequence 1");

  power_cycle();
  zassert_equal(retain_counter(), 0U, "the RAM was lost");
  load(counter_code, sizeof(counter_code));
  status = retain_status();
  zassert_equal(status.reason, ZPLC_RETAIN_RESTORED, "the record is restored");
  zassert_equal(status.sequence, 1U, "it is the first record");
  zassert_equal(retain_counter(), counted, "the counter continues");
}

/* RT-025: a record of another program is not restored, and the status says so. */
ZTEST(zplc_retain_persist, test_another_program_starts_from_an_initialised_region) {
  zplc_retain_status_t status;

  clear_store();
  load(counter_code, sizeof(counter_code));
  (void)count_and_stop();

  power_cycle();
  load(other_code, sizeof(other_code));
  status = retain_status();
  zassert_equal(status.reason, ZPLC_RETAIN_IDENTITY_MISMATCH,
                "the identity of the record is not the identity of the program");
  zassert_equal(retain_counter(), 0U, "the region is initialised");
}

/* RT-025: a damaged record is detected by its checksum. */
ZTEST(zplc_retain_persist, test_a_corrupt_record_initialises_the_region_and_says_why) {
  uint8_t junk[64];
  zplc_retain_status_t status;

  clear_store();
  load(counter_code, sizeof(counter_code));
  (void)count_and_stop();

  power_cycle();
  memset(junk, 0xA5, sizeof(junk));
  zassert_equal(zplc_hal_persist_save("retain_a0", junk, sizeof(junk)), ZPLC_HAL_OK,
                "damage slot a");
  zassert_equal(zplc_hal_persist_save("retain_b0", junk, sizeof(junk)), ZPLC_HAL_OK,
                "damage slot b");
  load(counter_code, sizeof(counter_code));
  status = retain_status();
  zassert_equal(status.reason, ZPLC_RETAIN_CORRUPT, "the damage is reported");
  zassert_equal(retain_counter(), 0U, "the region is initialised");
}

/* RT-026: a periodic save keeps the minimum interval (1 s in this suite), and
 * only a changed region is written. */
ZTEST(zplc_retain_persist, test_periodic_save_respects_the_minimum_interval) {
  zplc_retain_status_t status;

  clear_store();
  load(counter_code, sizeof(counter_code));
  zassert_ok(zplc_sched_start(), "start");

  k_msleep(500);
  status = retain_status();
  zassert_equal(status.saves, 0U, "no save inside the interval");

  k_msleep(1000); /* 1.5 s: one interval has passed */
  status = retain_status();
  zassert_equal(status.saves, 1U, "one periodic save after the interval");

  k_msleep(1000); /* 2.5 s */
  status = retain_status();
  zassert_equal(status.saves, 2U, "the next one a whole interval later");
  zassert_equal(status.save_errors, 0U, "no backend error");

  zassert_ok(zplc_sched_stop(), "stop");
  status = retain_status();
  zassert_equal(status.saves, 3U, "STOP stores what changed since the last save");
}

/* RT-026: STOP of a region that did not change writes nothing. */
ZTEST(zplc_retain_persist, test_stop_of_an_unchanged_region_writes_nothing) {
  zplc_retain_status_t before;
  zplc_retain_status_t after;

  clear_store();
  load(counter_code, sizeof(counter_code));
  (void)count_and_stop();
  before = retain_status();
  zassert_equal(before.saves, 1U, "the first STOP stored the changed region");

  zassert_ok(zplc_sched_start(), "start");
  zassert_ok(zplc_sched_stop(), "stop before the first scan of the new run");
  after = retain_status();
  zassert_equal(after.saves, before.saves, "nothing was written");
  zassert_equal(after.sequence, before.sequence, "the sequence did not move");
}

ZTEST_SUITE(zplc_retain_persist, NULL, retain_setup, NULL, NULL, retain_teardown);
