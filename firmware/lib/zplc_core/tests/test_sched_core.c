/**
 * @file test_sched_core.c
 * @brief The portable scheduler core: admission, order, scan phases, deadlines, fault latch and safe state
 *        (RT-008, RT-014, RT-018).
 *
 * SPDX-License-Identifier: MIT
 *
 * The core is driven through a fake port: a clock that returns values the test scripted, one per read, and
 * callbacks that write what they did to a log. The log is the evidence of the order of the phases (RT-009,
 * RT-010, RT-012): the image lock is taken before the latch and released before the pins are written.
 */

#include <stdio.h>
#include <string.h>

#include <zplc_core.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_sched_core.h>
#include <zplc_test_hooks.h>

static int test_count = 0;
static int fail_count = 0;

#define CHECK(cond, msg)                                      \
  do {                                                        \
    test_count++;                                             \
    if (!(cond)) {                                            \
      fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__); \
      fail_count++;                                           \
    } else {                                                  \
      printf("PASS: %s\n", msg);                              \
    }                                                         \
  } while (0)

/* ----------------------------------------------------------------------------
 * The fake port
 * ----------------------------------------------------------------------------
 */

#define LOG_CAPACITY 2048U
#define SCRIPT_CAPACITY 64U
#define TRACE_CAPACITY 128U

typedef struct {
  /* time: values returned by now_us, one per read; the last one repeats */
  uint64_t script[SCRIPT_CAPACITY];
  size_t script_length;
  size_t script_next;
  /* what the callbacks did, as one string of space-terminated words */
  char log[LOG_CAPACITY];
  /* failures to inject */
  int sample_result;
  int write_result;
  int feed_result;
  int lock_image_result;
  int lock_io_result;
  int reset_image_result;
  int drive_safe_result;
  int force_miss;
  /* the faults the port was told about, by reason, in order */
  int latched_count;
  int latched_reason;
  uint16_t latched_task;
  /* depth of the locks, to check that I/O never runs under the image lock */
  int image_locked;
  int io_locked;
  int io_under_image_lock;
  /* the trace the core wrote */
  char trace[TRACE_CAPACITY][48];
  size_t trace_count;
} fake_t;

static fake_t fake;

static void log_word(const char *word) {
  const size_t used = strlen(fake.log);

  if (used + strlen(word) + 2U < LOG_CAPACITY) {
    strcpy(fake.log + used, word);
    strcat(fake.log, " ");
  }
}

static uint64_t fake_now(void *ctx) {
  uint64_t value;

  (void)ctx;
  if (fake.script_length == 0U) {
    return 0U;
  }
  value = fake.script[fake.script_next];
  if (fake.script_next + 1U < fake.script_length) {
    fake.script_next++;
  }
  return value;
}

static int fake_lock_image(void *ctx) {
  (void)ctx;
  if (fake.lock_image_result != 0) {
    log_word("lock_image_failed");
    return fake.lock_image_result;
  }
  fake.image_locked = 1;
  log_word("lock_image");
  return 0;
}

static void fake_unlock_image(void *ctx) {
  (void)ctx;
  fake.image_locked = 0;
  log_word("unlock_image");
}

static int fake_lock_io(void *ctx) {
  (void)ctx;
  if (fake.lock_io_result != 0) {
    log_word("lock_io_failed");
    return fake.lock_io_result;
  }
  fake.io_locked = 1;
  log_word("lock_io");
  return 0;
}

static void fake_unlock_io(void *ctx) {
  (void)ctx;
  fake.io_locked = 0;
  log_word("unlock_io");
}

static int fake_sample(void *ctx) {
  (void)ctx;
  if (fake.image_locked != 0) {
    fake.io_under_image_lock = 1;
  }
  log_word("sample");
  return fake.sample_result;
}

static void fake_latch(void *ctx) {
  (void)ctx;
  log_word("latch");
}

static void fake_capture(void *ctx) {
  (void)ctx;
  log_word("capture");
}

static void fake_publish(void *ctx) {
  (void)ctx;
  log_word("publish");
}

static int fake_write(void *ctx) {
  (void)ctx;
  if (fake.image_locked != 0) {
    fake.io_under_image_lock = 1;
  }
  log_word("write");
  return fake.write_result;
}

static int fake_feed(void *ctx) {
  (void)ctx;
  log_word("feed");
  return fake.feed_result;
}

static int fake_reset_image(void *ctx) {
  (void)ctx;
  if (fake.image_locked == 0) {
    log_word("reset_without_image_lock");
  }
  log_word("reset");
  return fake.reset_image_result;
}

static int fake_drive_safe(void *ctx) {
  (void)ctx;
  if (fake.image_locked != 0) {
    fake.io_under_image_lock = 1;
  }
  log_word("safe");
  return fake.drive_safe_result;
}

static int fake_watchdog_state(void *ctx, zplc_wdt_state_t state) {
  (void)ctx;
  log_word(state == ZPLC_WDT_STATE_FAULT ? "wdt_fault" : "wdt_pause");
  return 0;
}

static void fake_stop_releases(void *ctx) {
  (void)ctx;
  log_word("stop_releases");
}

static int fake_probe(void *ctx, zplc_sched_probe_t point, uint16_t task_id) {
  (void)ctx;
  (void)task_id;
  if (point == ZPLC_SCHED_PROBE_FORCE_MISS) {
    const int forced = fake.force_miss;

    fake.force_miss = 0;
    return forced;
  }
  return 0;
}

static void fake_fault_latched(void *ctx, zplc_sched_fault_reason_t reason, uint16_t task_id) {
  (void)ctx;
  fake.latched_count++;
  fake.latched_reason = (int)reason;
  fake.latched_task = task_id;
}

static const zplc_sched_port_t port = {
    NULL,
    fake_now,
    NULL,
    NULL,
    fake_lock_image,
    fake_unlock_image,
    fake_lock_io,
    fake_unlock_io,
    fake_sample,
    fake_latch,
    fake_capture,
    fake_publish,
    fake_write,
    fake_feed,
    fake_reset_image,
    fake_drive_safe,
    fake_watchdog_state,
    fake_stop_releases,
    fake_probe,
    fake_fault_latched,
};

static void fake_trace(void *ctx, zplc_sched_trace_kind_t kind, uint16_t task_id, uint64_t a, uint64_t b) {
  (void)ctx;
  if (fake.trace_count < TRACE_CAPACITY) {
    snprintf(fake.trace[fake.trace_count], sizeof(fake.trace[0]), "%d t%u %llu %llu", (int)kind, (unsigned)task_id, (unsigned long long)a,
             (unsigned long long)b);
    fake.trace_count++;
  }
}

static void script(const uint64_t *values, size_t length) {
  memcpy(fake.script, values, length * sizeof(values[0]));
  fake.script_length = length;
  fake.script_next = 0U;
}

static void reset_fake(void) { memset(&fake, 0, sizeof(fake)); }

/* ----------------------------------------------------------------------------
 * Tasks: three tiny programs. Task i stores 10+i in OPI byte i and halts.
 * ----------------------------------------------------------------------------
 */

#define TASKS 3U
#define SLOT_BYTES 6U /* PUSH8 v, STORE8 addr(2), HALT */

static zplc_sched_slot_t slots[TASKS];
static zplc_vm_t vms[TASKS];
static zplc_sched_core_t core;

static void write_u16(uint8_t *out, uint16_t value) {
  out[0] = (uint8_t)value;
  out[1] = (uint8_t)(value >> 8);
}

/* kind 0: store and halt; 1: fault (a stack underflow); 2: stop at a breakpoint, then store and halt */
static void load_programs(uint8_t kind_of_task1) {
  uint8_t code[TASKS * 16U];
  uint8_t index;

  memset(code, OP_NOP, sizeof(code));
  for (index = 0U; index < TASKS; index++) {
    uint8_t *at = code + (size_t)index * 16U;
    size_t n = 0U;

    if (index == 1U && kind_of_task1 == 1U) {
      at[n++] = OP_ADD; /* nothing on the stack: a VM fault */
      at[n++] = OP_HALT;
    } else {
      if (index == 1U && kind_of_task1 == 2U) {
        at[n++] = OP_BREAK;
      }
      at[n++] = OP_PUSH8;
      at[n++] = (uint8_t)(10U + index);
      at[n++] = OP_STORE8;
      write_u16(at + n, (uint16_t)(ZPLC_MEM_OPI_BASE + index));
      n += 2U;
      at[n++] = OP_HALT;
    }
  }
  zplc_core_init();
  CHECK(zplc_test_load_raw(code, sizeof(code)) == 0, "the programs are loaded");
}

static void setup(uint32_t miss_limit, uint8_t kind_of_task1) {
  uint8_t index;

  reset_fake();
  load_programs(kind_of_task1);
  zplc_sched_core_init(&core, slots, TASKS, miss_limit);
  zplc_sched_core_set_trace(&core, fake_trace, NULL);
  for (index = 0U; index < TASKS; index++) {
    zplc_task_def_t def;
    int added;

    memset(&def, 0, sizeof(def));
    def.id = (uint16_t)(index + 1U);
    def.type = ZPLC_TASK_CYCLIC;
    def.priority = (uint8_t)(TASKS - index); /* task 1 has the highest number: runs last when tied */
    def.interval_us = 10000U;
    def.entry_point = (uint16_t)(index * 16U);
    def.stack_size = 16U;
    zplc_vm_init(&vms[index]);
    zplc_vm_set_entry(&vms[index], def.entry_point, 16U);
    vms[index].task_id = def.id;
    added = zplc_sched_core_add_task(&core, &def, &vms[index]);
    CHECK(added == (int)index, "a task is registered in the next slot");
  }
}

static void run_all(void) { zplc_sched_core_set_running(&core); }

static int admit_all(uint64_t release) {
  int admitted = 0;
  uint8_t index;

  for (index = 0U; index < TASKS; index++) {
    admitted += zplc_sched_core_admit(&core, index, release, release);
  }
  return admitted;
}

/* ----------------------------------------------------------------------------
 * Tests
 * ----------------------------------------------------------------------------
 */

static void test_admission_coalesces_and_refuses(void) {
  printf("\n=== Test: admission ===\n");
  setup(0U, 0U);

  CHECK(core.miss_limit == ZPLC_SCHED_DEFAULT_MISS_LIMIT, "a limit of 0 selects the default");
  CHECK(zplc_sched_core_admit(&core, 0, 100U, 100U) == 0, "a task that is not running admits no release");
  run_all();
  CHECK(zplc_sched_core_admit(&core, 0, 100U, 100U) == 1, "a release is admitted");
  CHECK(zplc_sched_core_admit(&core, 0, 110U, 110U) == 0, "a release of a pending task coalesces");
  CHECK(core.slot[0].release_us == 100U, "the pending release keeps its instant");
  CHECK(zplc_sched_core_admit(&core, 7, 100U, 100U) == 0, "an unknown slot admits nothing");
  zplc_sched_core_latch_fault_image(&core, &port, ZPLC_SCHED_FAULT_RUNTIME, 0U);
  CHECK(zplc_sched_core_admit(&core, 1, 100U, 100U) == 0, "a latched fault admits nothing");
}

static void test_order_is_release_then_priority_then_id(void) {
  uint8_t order[TASKS];
  uint8_t count;

  printf("\n=== Test: order ===\n");
  setup(0U, 0U);
  run_all();

  /* Tied: priorities are 3, 2, 1 for tasks 1, 2, 3, so the highest number last... lowest number first. */
  admit_all(500U);
  count = zplc_sched_core_collect(&core, order, TASKS);
  CHECK(count == 3U && order[0] == 2U && order[1] == 1U && order[2] == 0U, "a tie is ordered by priority number");

  /* An earlier release goes first whatever its priority. */
  setup(0U, 0U);
  run_all();
  zplc_sched_core_admit(&core, 0, 300U, 300U);
  zplc_sched_core_admit(&core, 1, 200U, 200U);
  zplc_sched_core_admit(&core, 2, 100U, 100U);
  count = zplc_sched_core_collect(&core, order, TASKS);
  CHECK(count == 3U && order[0] == 2U && order[1] == 1U && order[2] == 0U, "an earlier release goes first");

  /* Same release, same priority: the lower id. */
  setup(0U, 0U);
  core.slot[0].task.config.priority = 5U;
  core.slot[1].task.config.priority = 5U;
  core.slot[2].task.config.priority = 5U;
  core.slot[0].task.config.id = 9U;
  core.slot[1].task.config.id = 4U;
  core.slot[2].task.config.id = 6U;
  run_all();
  admit_all(0U);
  count = zplc_sched_core_collect(&core, order, TASKS);
  CHECK(count == 3U && order[0] == 1U && order[1] == 2U && order[2] == 0U, "a full tie is ordered by id");
  CHECK(zplc_sched_core_before(&core.slot[1], &core.slot[2]) != 0 && zplc_sched_core_before(&core.slot[2], &core.slot[1]) == 0,
        "the comparison is directional");
}

static void test_scan_phases_are_ordered(void) {
  uint8_t order[TASKS];
  uint8_t count;
  zplc_sched_scan_report_t report;
  /* one read when the batch starts and one after each task */
  const uint64_t times[] = {1000U, 1100U, 1200U, 1300U};

  printf("\n=== Test: phases of a scan (RT-009, RT-010, RT-012) ===\n");
  setup(0U, 0U);
  run_all();
  admit_all(1000U);
  count = zplc_sched_core_collect(&core, order, TASKS);
  script(times, sizeof(times) / sizeof(times[0]));

  CHECK(zplc_sched_core_scan(&core, &port, order, count, 0, &report) == 0, "the batch runs");
  CHECK(strcmp(fake.log, "sample lock_image latch capture publish unlock_image lock_io write feed unlock_io ") == 0,
        "inputs are sampled before the image lock, latched under it, outputs written after it is released");
  CHECK(fake.io_under_image_lock == 0, "no hardware I/O runs under the image lock");
  CHECK(report.committed == 1U && report.faulted == 0U && report.paused == 0U, "the report says committed");
  CHECK(core.input_latch_count == 1U && core.output_commit_count == 1U, "one latch and one commit per batch");
  CHECK(zplc_opi_read8(0U) == 10U && zplc_opi_read8(1U) == 11U && zplc_opi_read8(2U) == 12U, "every task ran");
  CHECK(core.slot[0].pending == 0U && core.slot[1].pending == 0U && core.slot[2].pending == 0U, "no release is pending afterwards");
  CHECK(core.slot[0].task.stats.cycle_count == 1U && core.slot[0].task.stats.last_exec_time_us == 100U,
        "a task's duration runs from where the previous one ended");
  CHECK(core.state == ZPLC_SCHED_STATE_RUNNING, "the runtime keeps running");
}

static void test_idle_core_does_nothing(void) {
  uint8_t order[1] = {0U};

  printf("\n=== Test: a core that is not running reads nothing ===\n");
  setup(0U, 0U);
  CHECK(zplc_sched_core_scan(&core, &port, order, 1U, 0, NULL) == 0 && fake.log[0] == '\0', "an idle core samples nothing");
  run_all();
  zplc_sched_core_latch_fault_image(&core, &port, ZPLC_SCHED_FAULT_RUNTIME, 0U);
  fake.log[0] = '\0';
  CHECK(zplc_sched_core_scan(&core, &port, order, 1U, 0, NULL) == 0 && fake.log[0] == '\0', "a faulted core samples nothing");
}

static void miss_scenario(uint32_t limit, uint64_t end_offset, int expected_fault, const char *what) {
  uint8_t order[1];
  zplc_sched_scan_report_t report;
  uint64_t times[2];
  int result;

  (void)limit;
  setup(limit, 0U);
  run_all();
  zplc_sched_core_admit(&core, 0, 1000U, 1000U);
  order[0] = 0U;
  times[0] = 1000U;
  times[1] = 1000U + 10000U + end_offset;
  script(times, 2U); /* batch start, end of the task */
  result = zplc_sched_core_scan(&core, &port, order, 1U, 0, &report);
  CHECK((result == ZPLC_SCHED_ERR_DEADLINE) == (expected_fault != 0), what);
}

static void test_deadline_accounting(void) {
  uint8_t order[1] = {0U};
  zplc_sched_scan_report_t report;
  uint64_t times[2];
  int round;

  printf("\n=== Test: deadlines and the miss limit (RT-014) ===\n");
  miss_scenario(1U, 0U, 0, "ending exactly on the deadline is in time");
  miss_scenario(1U, 1U, 1, "one microsecond late with a limit of one latches the fault");

  setup(3U, 0U);
  run_all();
  for (round = 1; round <= 3; round++) {
    int result;

    zplc_sched_core_admit(&core, 0, 1000U, 1000U);
    times[0] = 1000U;
    times[1] = 1000U + 10000U + 2500U;
    script(times, 2U);
    result = zplc_sched_core_scan(&core, &port, order, 1U, 0, &report);
    if (round < 3) {
      CHECK(result == 0 && core.fault_latched == 0U && core.slot[0].consecutive_misses == (uint32_t)round,
            "a miss below the limit is a warning, not a fault");
      CHECK(report.warning_task == 1 && core.last_overrun_us == 2500U, "the warning and the overrun are recorded");
    } else {
      CHECK(result == ZPLC_SCHED_ERR_DEADLINE && core.fault_latched == 1U && core.fault_reason == (uint8_t)ZPLC_SCHED_FAULT_DEADLINE_MISS &&
                core.fault_task_id == 1U,
            "the third consecutive miss latches the fault with its task");
      CHECK(report.deadline_task == 1 && core.state == ZPLC_SCHED_STATE_ERROR, "the report names the task");
    }
  }
  CHECK(core.slot[0].task.stats.overrun_count == 3U && zplc_sched_core_total_misses(&core) == 3U, "every miss is counted");

  /* An in-time scan ends the run of misses. */
  setup(3U, 0U);
  run_all();
  for (round = 0; round < 2; round++) {
    zplc_sched_core_admit(&core, 0, 1000U, 1000U);
    times[0] = 1000U;
    times[1] = 1000U + 10000U + 1U;
    script(times, 2U);
    (void)zplc_sched_core_scan(&core, &port, order, 1U, 0, &report);
  }
  CHECK(core.slot[0].consecutive_misses == 2U && zplc_sched_core_consecutive_misses(&core) == 2U, "two in a row");
  zplc_sched_core_admit(&core, 0, 1000U, 1000U);
  times[0] = 1000U;
  times[1] = 1500U;
  script(times, 2U);
  (void)zplc_sched_core_scan(&core, &port, order, 1U, 0, &report);
  CHECK(core.slot[0].consecutive_misses == 0U && core.slot[0].task.stats.overrun_count == 2U && core.fault_latched == 0U,
        "a scan in time ends the run; the count stays");
  zplc_sched_core_reset_counters(&core);
  CHECK(core.slot[0].task.stats.overrun_count == 0U && core.last_overrun_us == 0U, "a reload forgets the misses");
}

/* HIL-010: the period of a task, from the start of one of its scans to the start of the next: its shortest and longest
 * since RUN, so the scan jitter of a long run is the runtime's own measure and not a mean over minutes. */
static void test_scan_period_statistics(void) {
  uint8_t order[1] = {0U};
  zplc_sched_scan_report_t report;
  const uint64_t starts[6] = {1000U, 11000U, 21500U, 30800U, 100000U, 110000U};
  uint64_t times[2];
  int i;

  printf("\n=== Test: the scan period, shortest and longest (HIL-010) ===\n");
  setup(3U, 0U);
  run_all();
  for (i = 0; i < 6; i++) {
    if (i == 4) {
      zplc_sched_core_begin_run(&core); /* STOP and RUN again: the time between is not a period */
    }
    zplc_sched_core_admit(&core, 0, starts[i], starts[i]);
    times[0] = starts[i];
    times[1] = starts[i] + 100U;
    script(times, 2U);
    (void)zplc_sched_core_scan(&core, &port, order, 1U, 0, &report);
    if (i == 0) {
      CHECK(core.slot[0].task.stats.min_period_us == 0U && core.slot[0].task.stats.max_period_us == 0U, "one scan has no period yet");
    }
  }
  CHECK(core.slot[0].task.stats.min_period_us == 9300U, "the shortest period is the shortest start to start");
  CHECK(core.slot[0].task.stats.max_period_us == 10500U, "the longest, and a new RUN does not count the time stopped");
}

static void test_deadline_reference_is_separate_from_release(void) {
  uint8_t order[1] = {0U};
  uint64_t times[2];

  printf("\n=== Test: the deadline is counted from its reference instant ===\n");
  setup(1U, 0U);
  run_all();
  /* Released at 1000, dispatched late at 9000: the host counts from the dispatch. */
  zplc_sched_core_admit(&core, 0, 1000U, 9000U);
  times[0] = 9000U;
  times[1] = 9000U + 10000U;
  script(times, 2U);
  CHECK(zplc_sched_core_scan(&core, &port, order, 1U, 0, NULL) == 0, "ending an interval after the dispatch is in time");
}

static void test_batch_start_reference_is_the_dispatch(void) {
  uint8_t order[1] = {0U};
  uint64_t times[2];

  printf("\n=== Test: a host counts the deadline from the instant it dispatched the batch ===\n");
  setup(1U, 0U);
  run_all();
  zplc_sched_core_admit(&core, 0, 1000U, ZPLC_SCHED_REF_BATCH_START);
  times[0] = 50000U; /* the batch starts 49 ms after the release: that lateness is not a miss */
  times[1] = 50000U + 10000U;
  script(times, 2U);
  CHECK(zplc_sched_core_scan(&core, &port, order, 1U, 0, NULL) == 0, "an interval from the batch start is in time");
  zplc_sched_core_admit(&core, 0, 1000U, ZPLC_SCHED_REF_BATCH_START);
  times[0] = 60000U;
  times[1] = 60000U + 10001U;
  script(times, 2U);
  CHECK(zplc_sched_core_scan(&core, &port, order, 1U, 0, NULL) == ZPLC_SCHED_ERR_DEADLINE, "and one microsecond more is a miss");
}

static void test_vm_fault_latches_and_settles(void) {
  uint8_t order[TASKS];
  uint8_t count;
  zplc_sched_scan_report_t report;
  const uint64_t times[] = {1000U, 1010U, 1020U};
  int result;

  printf("\n=== Test: a VM fault drives the outputs safe (RT-007) ===\n");
  setup(0U, 1U);
  run_all();
  admit_all(1000U);
  count = zplc_sched_core_collect(&core, order, TASKS);
  script(times, sizeof(times) / sizeof(times[0]));
  result = zplc_sched_core_scan(&core, &port, order, count, 0, &report);

  CHECK(result < 0 && core.fault_latched == 1U && core.fault_reason == (uint8_t)ZPLC_SCHED_FAULT_VM, "the fault latches");
  CHECK(core.fault_task_id == 2U && report.error_task == 2, "with the task that failed");
  CHECK(strcmp(fake.log, "sample lock_image latch reset publish unlock_image safe wdt_fault stop_releases ") == 0,
        "the image is reset under the lock, the pins are driven after it is released, then the watchdog");
  CHECK(report.committed == 0U && core.output_commit_count == 0U, "nothing is committed");
  CHECK(core.state == ZPLC_SCHED_STATE_ERROR && core.slot[0].task.state == ZPLC_TASK_STATE_ERROR, "every task is in ERROR");
  CHECK(fake.latched_count == 1 && fake.latched_reason == (int)ZPLC_SCHED_FAULT_VM && fake.latched_task == 2U,
        "the platform was told of the fault once, with its reason and task, to keep where a reset will not erase it");
  CHECK(zplc_sched_core_latch_fault_image(&core, &port, ZPLC_SCHED_FAULT_IO, 3U) == 0 &&
            core.fault_reason == (uint8_t)ZPLC_SCHED_FAULT_VM && core.fault_task_id == 2U,
        "the first reason is the one kept");
  CHECK(fake.latched_count == 1, "and a later fault is not told: the first is what a reset must not erase");
}

static void test_sample_failure_is_an_io_fault(void) {
  uint8_t order[1] = {0U};
  int result;

  printf("\n=== Test: an input that cannot be read ===\n");
  setup(0U, 0U);
  run_all();
  admit_all(1000U);
  fake.sample_result = -5;
  result = zplc_sched_core_scan(&core, &port, order, 1U, 0, NULL);
  CHECK(result == -5 && core.fault_reason == (uint8_t)ZPLC_SCHED_FAULT_IO,
        "the fault is an I/O fault and the caller gets the failure the port returned");
  CHECK(strstr(fake.log, "latch ") == NULL && strstr(fake.log, "write") == NULL, "no input was latched, no output written");
}

static void test_write_and_feed_failures(void) {
  uint8_t order[1] = {0U};
  int result;

  printf("\n=== Test: an output or the watchdog that fails ===\n");
  setup(0U, 0U);
  run_all();
  admit_all(1000U);
  fake.write_result = -5;
  result = zplc_sched_core_scan(&core, &port, order, 1U, 0, NULL);
  CHECK(result == -5 && core.fault_latched == 1U && core.fault_reason == (uint8_t)ZPLC_SCHED_FAULT_IO,
        "a write that fails latches an I/O fault");
  CHECK(strstr(fake.log, "feed") == NULL, "the watchdog is not fed after a failed write");

  setup(0U, 0U);
  run_all();
  admit_all(1000U);
  fake.feed_result = -5;
  result = zplc_sched_core_scan(&core, &port, order, 1U, 0, NULL);
  CHECK(result == ZPLC_SCHED_ERR_IO && core.fault_latched == 1U, "a feed that fails latches the fault");
  CHECK(strstr(fake.log, "write feed unlock_io") != NULL, "the feed is made under the output lock");
}

static void test_lock_failures(void) {
  uint8_t order[1] = {0U};
  int result;

  printf("\n=== Test: a lock that cannot be taken (RT-030) ===\n");
  setup(0U, 0U);
  run_all();
  admit_all(1000U);
  fake.lock_image_result = -16;
  result = zplc_sched_core_scan(&core, &port, order, 1U, 0, NULL);
  CHECK(result == ZPLC_SCHED_ERR_LOCK && core.fault_reason == (uint8_t)ZPLC_SCHED_FAULT_LOCK, "no image lock: the fault latches");
  CHECK(strstr(fake.log, "safe") != NULL && strstr(fake.log, "stop_releases") != NULL, "the pins are driven safe anyway");
  CHECK(strstr(fake.log, "latch") == NULL && strstr(fake.log, "reset") == NULL, "no scan and no image reset ran");

  setup(0U, 0U);
  run_all();
  admit_all(1000U);
  fake.lock_io_result = -16;
  result = zplc_sched_core_scan(&core, &port, order, 1U, 0, NULL);
  CHECK(result == ZPLC_SCHED_ERR_LOCK && core.fault_latched == 1U && strstr(fake.log, "write") == NULL,
        "no output lock: nothing is written and the fault latches");
}

static void test_step_and_breakpoint(void) {
  uint8_t order[TASKS];
  uint8_t count;
  zplc_sched_scan_report_t report;
  const uint64_t slow[] = {1000U, 900000U};
  /* Task 3 runs first and is quick; task 2 stops at its breakpoint after nearly a second. */
  const uint64_t slow_breakpoint[] = {1000U, 1100U, 900000U};
  int result;

  printf("\n=== Test: a step and a breakpoint pause the runtime (RT-017) ===\n");
  setup(1U, 0U);
  core.state = ZPLC_SCHED_STATE_PAUSED;
  core.slot[0].task.state = ZPLC_TASK_STATE_PAUSED;
  core.slot[1].task.state = ZPLC_TASK_STATE_PAUSED;
  core.slot[2].task.state = ZPLC_TASK_STATE_PAUSED;
  count = zplc_sched_core_begin_step(&core, 1000U, order, TASKS);
  CHECK(count == 3U && core.state == ZPLC_SCHED_STATE_RUNNING, "a step releases every paused task");
  script(slow, 2U);
  result = zplc_sched_core_scan(&core, &port, order, count, 1, &report);
  CHECK(result == 0 && report.paused == 1U && core.state == ZPLC_SCHED_STATE_PAUSED,
        "the step ends paused, and a slow task is not a deadline miss");
  CHECK(core.slot[0].task.stats.overrun_count == 0U, "no deadline accounting in a step");
  CHECK(strstr(fake.log, "write unlock_io safe stop_releases wdt_pause") != NULL && strstr(fake.log, "feed") == NULL,
        "the batch is committed once, then the pins are driven safe; the watchdog is not fed");
  CHECK(zplc_opi_read8(0U) == 10U, "the image is kept (RT-017)");

  /* A breakpoint in task 2: the batch stops there, the scan is not checked for a deadline. */
  setup(1U, 2U);
  run_all();
  admit_all(1000U);
  count = zplc_sched_core_collect(&core, order, TASKS);
  script(slow_breakpoint, 3U);
  fake.log[0] = '\0';
  result = zplc_sched_core_scan(&core, &port, order, count, 0, &report);
  CHECK(result == 0 && report.paused == 1U && report.paused_task == 2, "a breakpoint pauses the runtime");
  CHECK(core.state == ZPLC_SCHED_STATE_PAUSED && core.fault_latched == 0U, "paused, not faulted, though the part was slow");
  CHECK(core.slot[1].first_scan_interrupted == 1U, "the interrupted scan is still the task's first");
}

static void test_control_path_safe_state(void) {
  printf("\n=== Test: the safe state from the control path ===\n");
  setup(0U, 0U);
  run_all();
  CHECK(zplc_sched_core_apply_safe_outputs(&core, &port) == 0, "stop: safe outputs");
  CHECK(strcmp(fake.log, "lock_image reset unlock_image safe ") == 0, "image under the lock, pins after it");
  fake.log[0] = '\0';
  fake.drive_safe_result = -5;
  CHECK(zplc_sched_core_apply_safe_outputs(&core, &port) == -5 && core.fault_latched == 1U, "pins that cannot be driven latch the fault");
  setup(0U, 0U);
  run_all();
  CHECK(zplc_sched_core_drive_safe_outputs(&core, &port) == 0 && strcmp(fake.log, "safe ") == 0, "pause: the pins only");
  CHECK(strcmp(zplc_sched_fault_reason_name(ZPLC_SCHED_FAULT_DEADLINE_MISS), "deadline_miss") == 0 &&
            strcmp(zplc_sched_fault_reason_name(ZPLC_SCHED_FAULT_VM), "vm_fault") == 0 &&
            strcmp(zplc_sched_fault_reason_name(ZPLC_SCHED_FAULT_NONE), "none") == 0,
        "the reasons have the names the status reports");
}

static void test_system_registers_and_first_scan(void) {
  uint8_t order[1] = {0U};
  const uint64_t times[] = {5000000U, 5000100U, 5010000U, 5010100U};

  printf("\n=== Test: the system registers are written for every runtime ===\n");
  setup(0U, 0U);
  run_all();
  admit_all(5000000U);
  script(times, sizeof(times) / sizeof(times[0]));
  (void)zplc_sched_core_scan(&core, &port, order, 1U, 0, NULL);
  CHECK((zplc_ipi_read8(ZPLC_SYS_REG_OFFSET + 9U) & ZPLC_SYS_FLAG_FIRST_SCAN) != 0U, "the first scan has its flag");
  CHECK((zplc_ipi_read8(ZPLC_SYS_REG_OFFSET + 9U) & ZPLC_SYS_FLAG_RUNNING) != 0U, "and the running flag");
  CHECK(zplc_ipi_read8(ZPLC_SYS_REG_OFFSET + 8U) == 1U, "and the task id");
  admit_all(5010000U);
  (void)zplc_sched_core_scan(&core, &port, order, 1U, 0, NULL);
  CHECK((zplc_ipi_read8(ZPLC_SYS_REG_OFFSET + 9U) & ZPLC_SYS_FLAG_FIRST_SCAN) == 0U, "the second scan does not");
}

int main(void) {
  printf("==== test_sched_core ====\n");
  test_admission_coalesces_and_refuses();
  test_order_is_release_then_priority_then_id();
  test_scan_phases_are_ordered();
  test_idle_core_does_nothing();
  test_deadline_accounting();
  test_scan_period_statistics();
  test_deadline_reference_is_separate_from_release();
  test_batch_start_reference_is_the_dispatch();
  test_vm_fault_latches_and_settles();
  test_sample_failure_is_an_io_fault();
  test_write_and_feed_failures();
  test_lock_failures();
  test_step_and_breakpoint();
  test_control_path_safe_state();
  test_system_registers_and_first_scan();
  printf("\n%d checks, %d failed\n", test_count, fail_count);
  return fail_count == 0 ? 0 : 1;
}
