/**
 * @file test_freertos_scheduler.c
 * @brief IO-016, RT-008: the FreeRTOS adapter of the scheduler core decides what the other runtimes decide, and
 *        releases on the kernel's timers.
 *
 * SPDX-License-Identifier: MIT
 *
 * Three groups, in the order of how much of the platform they use.
 *
 *   1. Equivalence. The adapter runs the scenario of zplc_sched_trace_cases.h with its timers stopped and the releases
 *      and the clock supplied by the test, and the decisions it writes down are compared with the golden trace that the
 *      host session (test_sched_equivalence.c) and the Zephyr scheduler (firmware/tests/scheduler_equivalence) are held
 *      to. Nothing in this group depends on how well the simulator keeps time.
 *   2. Releases. The kernel's software timers release a task at its interval, a scheduler task runs the batch, and the
 *      inputs of the simulated board reach the program and its outputs reach the pins. The simulator is not a real-time
 *      system, so these checks bound the count of scans: never more than the elapsed time allows (a hard bound), and at
 *      least a third of the ideal count (a generous floor for a loaded machine). They claim no jitter.
 *   3. The fault. A deadline missed the configured number of times in a row latches the fault, stops the releases and
 *      drives the pins to the safe level; the reason and the task are kept.
 *
 * This file runs as the suite of the FreeRTOS port (zplc_freertos_suite_main.c): inside a task, after the kernel started.
 */

#include <stdio.h>
#include <string.h>

#include <zplc_bytes.h>
#include <zplc_core.h>
#include <zplc_crc32.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_sched_core.h>

#include "zplc_freertos_port.h"
#include "zplc_scheduler_freertos.h"
#include "zplc_sched_trace_cases.h"

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

#define PROGRAM_CAPACITY 256U

/* A container with a CODE and a TASK segment. The task t runs the code from entry[t]. */
static size_t build_container(uint8_t *out, size_t capacity, const uint8_t *code, size_t code_size, const zplc_trace_task_t *tasks,
                              const uint16_t *entry, unsigned count) {
  const size_t task_size = (size_t)count * ZPLC_TASK_DEF_SIZE;
  const size_t total = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE + code_size + task_size;
  size_t offset;
  unsigned index;
  uint32_t crc;

  if (total > capacity) {
    return 0U;
  }
  memset(out, 0, total);
  memcpy(out, "ZPLC", 4U);
  zplc_put_u16_le(out + 4U, ZPLC_VERSION_MAJOR);
  zplc_put_u16_le(out + 6U, ZPLC_VERSION_MINOR);
  zplc_put_u32_le(out + 16U, (uint32_t)code_size);
  zplc_put_u32_le(out + 20U, (uint32_t)task_size);
  zplc_put_u16_le(out + 26U, 2U);
  zplc_put_u32_le(out + 28U, ZPLC_DRAFT_COUNTER);
  offset = ZPLC_FILE_HEADER_SIZE;
  zplc_put_u16_le(out + offset, ZPLC_SEG_CODE);
  zplc_put_u32_le(out + offset + 4U, (uint32_t)code_size);
  offset += ZPLC_SEGMENT_ENTRY_SIZE;
  zplc_put_u16_le(out + offset, ZPLC_SEG_TASK);
  zplc_put_u32_le(out + offset + 4U, (uint32_t)task_size);
  offset += ZPLC_SEGMENT_ENTRY_SIZE;
  memcpy(out + offset, code, code_size);
  offset += code_size;
  for (index = 0U; index < count; index++) {
    uint8_t *task = out + offset + (size_t)index * ZPLC_TASK_DEF_SIZE;

    zplc_put_u16_le(task, tasks[index].id);
    task[2] = ZPLC_TASK_CYCLIC;
    task[3] = tasks[index].priority;
    zplc_put_u32_le(task + 4U, tasks[index].interval_ms * 1000U);
    zplc_put_u16_le(task + 8U, entry[index]);
    zplc_put_u16_le(task + 10U, 16U);
  }
  crc = zplc_crc32_update(0xFFFFFFFFU, out, 12U);
  crc = zplc_crc32_update(crc, out + 16U, total - 16U) ^ 0xFFFFFFFFU;
  zplc_put_u32_le(out + 12U, crc);
  return total;
}

#define CODE_PER_TASK 6U /* PUSH8 value, STORE8 address(2), HALT */

/* The tasks of the scenario, each storing its value in its own output byte. */
static size_t build_scenario(uint8_t *out, size_t capacity, const zplc_trace_task_t *tasks, unsigned count) {
  uint8_t code[3U * CODE_PER_TASK];
  uint16_t entry[3];
  unsigned index;

  for (index = 0U; index < count; index++) {
    uint8_t *c = code + index * CODE_PER_TASK;

    c[0] = OP_PUSH8;
    c[1] = tasks[index].output;
    c[2] = OP_STORE8;
    zplc_put_u16_le(c + 3U, (uint16_t)(ZPLC_MEM_OPI_BASE + index));
    c[5] = OP_HALT;
    entry[index] = (uint16_t)(index * CODE_PER_TASK);
  }
  return build_container(out, capacity, code, (size_t)count * CODE_PER_TASK, tasks, entry, count);
}

static void reset_scheduler(void) {
  zplc_fr_sched_test_set_clock(NULL);
  (void)zplc_fr_sched_stop();
}

/* ---- 1. equivalence -------------------------------------------------------------------------------------------- */

static const zplc_trace_batch_t *current_batch;
static unsigned current_read;

static uint64_t scripted_clock_us(void) {
  const uint64_t value = (uint64_t)current_batch->read_ms[current_read] * 1000U;

  if (current_read + 1U < current_batch->read_count) {
    current_read++;
  }
  return value;
}

static const zplc_trace_one_batch_t *one_batch;
static unsigned one_read;

static uint64_t scripted_one_clock_us(void) {
  /* The release instant is given to the admission by the test, so a scan reads the clock twice: when the batch
   * starts and when the task ended. */
  const uint32_t reads[2] = {one_batch->start_ms, one_batch->end_ms};
  const uint64_t value = (uint64_t)reads[one_read] * 1000U;

  if (one_read + 1U < 2U) {
    one_read++;
  }
  return value;
}

static zplc_trace_log_t trace_log;

static int load_and_start(const zplc_trace_task_t *tasks, unsigned count) {
  uint8_t program[PROGRAM_CAPACITY];
  const size_t size = build_scenario(program, sizeof(program), tasks, count);

  reset_scheduler();
  if (size == 0U || zplc_fr_sched_load(program, size) != (int)count) {
    return 0;
  }
  memset(&trace_log, 0, sizeof(trace_log));
  zplc_sched_core_set_trace(zplc_fr_sched_core(), zplc_trace_render, &trace_log);
  if (zplc_fr_sched_start() != 0) {
    return 0;
  }
  /* The releases of this group come from the test: the kernel timers must add none. */
  zplc_fr_sched_test_stop_timers();
  return 1;
}

static int trace_equals(const char *const *golden, unsigned golden_count) {
  unsigned line;
  int equal = trace_log.count == golden_count;

  for (line = 0U; line < trace_log.count && line < golden_count; line++) {
    if (strcmp(trace_log.line[line], golden[line]) != 0) {
      fprintf(stderr, "line %u: got \"%s\", want \"%s\"\n", line, trace_log.line[line], golden[line]);
      equal = 0;
    }
  }
  return equal;
}

static void test_the_adapter_decides_the_golden_trace(void) {
  unsigned batch;
  unsigned slot;
  zplc_task_t task;

  printf("\n=== Test: the FreeRTOS adapter decides the golden trace (RT-008) ===\n");
  CHECK(load_and_start(ZPLC_TRACE_TASKS, ZPLC_TRACE_TASK_COUNT), "the three tasks load and start");
  CHECK(zplc_fr_sched_core()->miss_limit == ZPLC_SCHED_DEFAULT_MISS_LIMIT, "the adapter runs with the default limit");
  zplc_fr_sched_test_set_clock(scripted_clock_us);
  for (batch = 0U; batch < ZPLC_TRACE_BATCH_COUNT; batch++) {
    current_batch = &ZPLC_TRACE_BATCHES[batch];
    current_read = 0U;
    for (slot = 0U; slot < ZPLC_TRACE_TASK_COUNT; slot++) {
      if ((ZPLC_TRACE_BATCHES[batch].due_mask & (1U << slot)) != 0U) {
        CHECK(zplc_fr_sched_test_admit_release_at((int)slot, (uint64_t)ZPLC_TRACE_BATCHES[batch].at_ms * 1000U) == 1,
              "a release is admitted");
      }
    }
    (void)zplc_fr_sched_test_run_batch();
  }
  CHECK(trace_equals(ZPLC_TRACE_GOLDEN, (unsigned)ZPLC_TRACE_GOLDEN_COUNT), "every decision is the golden one");
  CHECK(zplc_fr_sched_state() == ZPLC_SCHED_STATE_ERROR, "the third miss in a row latches the fault");
  CHECK(zplc_fr_sched_core()->fault_reason == (uint8_t)ZPLC_SCHED_FAULT_DEADLINE_MISS && zplc_fr_sched_core()->fault_task_id == 1U,
        "the core names the reason and the task");
  CHECK(zplc_fr_sched_core()->last_overrun_us == 20000U, "the last overrun was 20 ms");
  CHECK(zplc_fr_sched_core()->input_latch_count == 5U && zplc_fr_sched_core()->output_commit_count == 4U,
        "five batches latched their inputs and four of them committed");
  CHECK(zplc_fr_sched_get_task(2, &task) == 0 && task.state == ZPLC_TASK_STATE_ERROR, "the tasks are in error");
  CHECK(zplc_core_get_opi(0U) == 0U, "the fault applies the safe state to the image");
  {
    uint8_t reason = 0U;
    uint16_t id = 0U;

    CHECK(zplc_fr_sched_fault(&reason, &id) == 0 && reason == (uint8_t)ZPLC_SCHED_FAULT_DEADLINE_MISS && id == 1U,
          "the adapter keeps the reason and the task of the fault");
  }
}

static void test_one_task_decides_the_one_task_golden_trace(void) {
  static const zplc_trace_task_t one = {ZPLC_TRACE_ONE_TASK_ID, 0U, ZPLC_TRACE_ONE_INTERVAL_MS, ZPLC_TRACE_ONE_OUTPUT};
  unsigned batch;

  printf("\n=== Test: a program of one task decides the one-task golden trace (RT-018) ===\n");
  CHECK(load_and_start(&one, 1U), "the one task loads and starts");
  zplc_fr_sched_test_set_clock(scripted_one_clock_us);
  for (batch = 0U; batch < ZPLC_TRACE_ONE_BATCH_COUNT; batch++) {
    one_batch = &ZPLC_TRACE_ONE_BATCHES[batch];
    one_read = 0U;
    CHECK(zplc_fr_sched_test_admit_release_at(0, (uint64_t)one_batch->at_ms * 1000U) == 1, "its release is admitted");
    (void)zplc_fr_sched_test_run_batch();
  }
  CHECK(trace_equals(ZPLC_TRACE_ONE_GOLDEN, (unsigned)ZPLC_TRACE_ONE_GOLDEN_COUNT), "every decision is the golden one");
  CHECK(zplc_fr_sched_state() == ZPLC_SCHED_STATE_ERROR, "the third late scan in a row latches the fault");
}

/* ---- 2. releases on the kernel's timers ------------------------------------------------------------------------ */

/* Wait for the kernel, by the clock of the port, up to ms. */
static void wait_ms(uint32_t ms) { zplc_hal_sleep(ms); }

/* LOAD8 IPI0; STORE8 OPI0; HALT: the input byte becomes the output byte. */
static size_t build_copy_program(uint8_t *out, size_t capacity, uint32_t interval_ms) {
  uint8_t code[7];
  const zplc_trace_task_t task = {1U, 0U, interval_ms, 0U};
  const uint16_t entry = 0U;

  code[0] = OP_LOAD8;
  zplc_put_u16_le(code + 1U, ZPLC_MEM_IPI_BASE);
  code[3] = OP_STORE8;
  zplc_put_u16_le(code + 4U, ZPLC_MEM_OPI_BASE);
  code[6] = OP_HALT;
  return build_container(out, capacity, code, sizeof(code), &task, &entry, 1U);
}

static void test_the_timers_release_the_task_and_the_pins_follow(void) {
  uint8_t program[PROGRAM_CAPACITY];
  const size_t size = build_copy_program(program, sizeof(program), 10U);
  uint64_t started_us;
  uint64_t elapsed_us;
  uint32_t started_ticks;
  uint32_t kernel_ms;
  uint32_t batches;
  uint32_t ideal;

  printf("\n=== Test: the kernel timers release the task and the simulated pins follow ===\n");
  reset_scheduler();
  zplc_freertos_sim_reset();
  CHECK(size != 0U && zplc_fr_sched_load(program, size) == 1, "the copy program loads");
  zplc_sched_core_set_trace(zplc_fr_sched_core(), NULL, NULL);
  zplc_freertos_sim_set_input(0U, 1U);
  zplc_freertos_sim_set_input(3U, 1U);
  batches = zplc_fr_sched_test_batches_run();
  started_us = zplc_freertos_now_us();
  started_ticks = zplc_hal_tick();
  CHECK(zplc_fr_sched_start() == 0, "it starts");
  CHECK(zplc_fr_sched_state() == ZPLC_SCHED_STATE_RUNNING, "the runtime is running");
  CHECK(zplc_fr_sched_test_active_timers() == 1U, "its release timer runs");
  wait_ms(300U);
  elapsed_us = zplc_freertos_now_us() - started_us;
  kernel_ms = zplc_hal_tick() - started_ticks;
  batches = zplc_fr_sched_test_batches_run() - batches;
  /* The timers count kernel ticks, so the bounds are in kernel time. On the simulator the tick is a usleep() loop and
   * runs slower than the wall clock under load: the wall time is printed, never asserted. */
  ideal = kernel_ms / 10U;
  printf("  %lu scans in %lu kernel ms (%lu wall ms); an ideal timer gives %lu\n", (unsigned long)batches, (unsigned long)kernel_ms,
         (unsigned long)(elapsed_us / 1000U), (unsigned long)ideal);
  CHECK(batches <= ideal + 1U, "never more scans than the kernel time allows (a hard bound)");
  CHECK(batches >= ideal / 3U && batches > 0U, "at least a third of the ideal count on a loaded host");
  CHECK(zplc_freertos_sim_get_output(0U) == 1U && zplc_freertos_sim_get_output(3U) == 1U && zplc_freertos_sim_get_output(1U) == 0U,
        "the inputs of the board reach the program and its outputs reach the pins");
  zplc_freertos_sim_set_input(0U, 0U);
  wait_ms(150U);
  CHECK(zplc_freertos_sim_get_output(0U) == 0U && zplc_freertos_sim_get_output(3U) == 1U,
        "a pin that changes is followed within a few scans");
  CHECK(zplc_fr_sched_stop() == 0, "stop");
  CHECK(zplc_fr_sched_state() == ZPLC_SCHED_STATE_IDLE, "the runtime is idle");
  CHECK(zplc_fr_sched_test_active_timers() == 0U, "STOP stops the release timer");
  CHECK(zplc_freertos_sim_get_output(3U) == 0U, "the outputs are driven to the safe level on STOP");
  batches = zplc_fr_sched_test_batches_run();
  wait_ms(80U);
  CHECK(zplc_fr_sched_test_batches_run() == batches, "no scan runs after STOP");
}

/* ---- 3. the fault ---------------------------------------------------------------------------------------------- */

static void test_a_missed_deadline_latches_the_fault_and_stops_the_releases(void) {
  uint8_t program[PROGRAM_CAPACITY];
  const size_t size = build_copy_program(program, sizeof(program), 10U);
  uint32_t batches;
  uint8_t reason = 0U;
  uint16_t task_id = 0xFFFFU;

  printf("\n=== Test: the miss limit latches the fault, stops the releases and drives the pins safe ===\n");
  reset_scheduler();
  zplc_freertos_sim_reset();
  CHECK(size != 0U && zplc_fr_sched_load(program, size) == 1, "the copy program loads");
  zplc_freertos_sim_set_input(2U, 1U);
  zplc_fr_sched_test_force_deadline_misses(ZPLC_SCHED_DEFAULT_MISS_LIMIT);
  CHECK(zplc_fr_sched_start() == 0, "it starts");
  wait_ms(300U);
  CHECK(zplc_fr_sched_state() == ZPLC_SCHED_STATE_ERROR, "three misses in a row latch the fault");
  CHECK(zplc_fr_sched_fault(&reason, &task_id) == 0 && reason == (uint8_t)ZPLC_SCHED_FAULT_DEADLINE_MISS && task_id == 1U,
        "the reason and the task are kept");
  CHECK(zplc_freertos_sim_get_output(2U) == 0U, "the pins are at the safe level");
  CHECK(zplc_fr_sched_test_active_timers() == 0U, "the release timers are stopped");
  batches = zplc_fr_sched_test_batches_run();
  wait_ms(80U);
  CHECK(zplc_fr_sched_test_batches_run() == batches, "the releases stopped with the fault");
  CHECK(zplc_fr_sched_start() != 0, "a latched fault refuses a new start until a program is loaded");
  (void)zplc_fr_sched_stop();
  CHECK(zplc_fr_sched_core()->fault_latched != 0U, "the fault stays latched through the stop");
  CHECK(size != 0U && zplc_fr_sched_load(program, size) == 1, "loading a program clears it");
  CHECK(zplc_fr_sched_core()->fault_latched == 0U, "the fault is gone");
  CHECK(zplc_fr_sched_start() == 0, "and the runtime starts again");
  wait_ms(60U);
  CHECK(zplc_fr_sched_state() == ZPLC_SCHED_STATE_RUNNING, "it runs");
  (void)zplc_fr_sched_stop();
}

int main(void) {
  printf("ZPLC port conformance: scheduler adapter (FreeRTOS)\n");
  CHECK(zplc_hal_init() == ZPLC_HAL_OK, "the HAL starts");
  CHECK(zplc_core_init() == 0, "the core starts");
  CHECK(zplc_fr_sched_init() == 0, "the adapter starts");
  test_the_adapter_decides_the_golden_trace();
  test_one_task_decides_the_one_task_golden_trace();
  test_the_timers_release_the_task_and_the_pins_follow();
  test_a_missed_deadline_latches_the_fault_and_stops_the_releases();
  zplc_fr_sched_shutdown();
  CHECK(zplc_fr_sched_state() == ZPLC_SCHED_STATE_UNINIT, "shutdown returns the adapter to its first state");
  printf("\n%d checks, %d failed\n", test_count, fail_count);
  return fail_count == 0 ? 0 : 1;
}
