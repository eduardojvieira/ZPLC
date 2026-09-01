#include <errno.h>
#include <string.h>
#include <zephyr/ztest.h>
#include <zplc_core.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_scheduler.h>

#include "process_image_differential.h"

#define PROGRAM_CAPACITY 256U

K_THREAD_STACK_DEFINE(control_thread_stack, 1024);
static struct k_thread control_thread;
static struct k_sem control_started;
static struct k_sem control_done;
static int control_result;
static int control_task_id;
static int control_unregistration;
static uint16_t control_breakpoint;

static void control_thread_entry(void *arg1, void *arg2, void *arg3) {
  ARG_UNUSED(arg1);
  ARG_UNUSED(arg2);
  ARG_UNUSED(arg3);

  k_sem_give(&control_started);
  if (control_unregistration == 1) {
    control_result = zplc_sched_unregister_task(control_task_id);
  } else if (control_unregistration == 2) {
    control_result =
        zplc_sched_debug_add_breakpoint(control_task_id, control_breakpoint);
  } else {
    control_result = zplc_sched_stop();
  }
  k_sem_give(&control_done);
}

static void start_control_thread(int unregister_task, int task_id) {
  k_sem_reset(&control_started);
  k_sem_reset(&control_done);
  control_result = -99;
  control_unregistration = unregister_task;
  control_task_id = task_id;
  (void)k_thread_create(&control_thread, control_thread_stack,
                        K_THREAD_STACK_SIZEOF(control_thread_stack),
                        control_thread_entry, NULL, NULL, NULL,
                        K_PRIO_PREEMPT(5), 0U, K_NO_WAIT);
  zassert_ok(k_sem_take(&control_started, K_MSEC(100)),
             "control thread did not start");
}

static void start_debug_thread(int task_id, uint16_t pc) {
  control_breakpoint = pc;
  start_control_thread(2, task_id);
}

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

static size_t build_program(uint8_t *program, uint8_t task_count,
                            uint8_t task_type, uint32_t interval_us,
                            uint8_t output_value) {
  uint8_t code[3U * 6U];
  size_t task_bytes = (size_t)task_count * ZPLC_TASK_DEF_SIZE;
  size_t offset = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE;
  size_t task_offset;
  size_t total = offset + sizeof(code) + task_bytes;
  uint8_t index;
  uint32_t crc;

  zassert_true(total <= PROGRAM_CAPACITY, "program buffer overflow");
  memset(program, 0, total);
  memcpy(program, "ZPLC", 4U);
  write_u16_le(program + 4U, ZPLC_VERSION_MAJOR);
  write_u16_le(program + 6U, ZPLC_VERSION_MINOR);
  write_u32_le(program + 16U, sizeof(code));
  write_u32_le(program + 20U, (uint32_t)task_bytes);
  write_u16_le(program + 26U, 2U);
  write_u16_le(program + 32U, ZPLC_SEG_CODE);
  write_u32_le(program + 36U, sizeof(code));
  write_u16_le(program + 40U, ZPLC_SEG_TASK);
  write_u32_le(program + 44U, (uint32_t)task_bytes);
  for (index = 0U; index < 3U; index++) {
    uint8_t *task_code = code + (size_t)index * 6U;

    if (output_value == 0xFFU) {
      task_code[0] = OP_JMP;
      write_u16_le(task_code + 1U, (uint16_t)(index * 6U));
      task_code[3] = OP_NOP;
      task_code[4] = OP_NOP;
    } else if (output_value == 0U) {
      memset(task_code, OP_NOP, 5U);
    } else {
      task_code[0] = OP_PUSH8;
      task_code[1] = output_value;
      task_code[2] = OP_STORE8;
      write_u16_le(task_code + 3U, ZPLC_MEM_OPI_BASE);
    }
    task_code[5] = OP_HALT;
  }
  memcpy(program + offset, code, sizeof(code));
  task_offset = offset + sizeof(code);
  for (index = 0U; index < task_count; index++) {
    uint8_t *task = program + task_offset + (size_t)index * ZPLC_TASK_DEF_SIZE;

    write_u16_le(task, index);
    task[2] = task_type;
    task[3] = index;
    write_u32_le(task + 4U, interval_us);
    write_u16_le(task + 8U, (uint16_t)(index * 6U));
    write_u16_le(task + 10U, 64U);
  }
  crc = crc32_update(0xFFFFFFFFU, program, 12U);
  crc = crc32_update(crc, program + 16U, total - 16U) ^ 0xFFFFFFFFU;
  write_u32_le(program + 12U, crc);
  return total;
}

static void rewrite_program_crc(uint8_t *program, size_t size) {
  uint32_t crc = crc32_update(0xFFFFFFFFU, program, 12U);

  crc = crc32_update(crc, program + 16U, size - 16U) ^ 0xFFFFFFFFU;
  write_u32_le(program + 12U, crc);
}

static void set_task_output(uint8_t *program, uint8_t slot, uint8_t value) {
  size_t code_offset = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE;
  uint8_t *code = program + code_offset + (size_t)slot * 6U;

  code[0] = OP_PUSH8;
  code[1] = value;
  code[2] = OP_STORE8;
  write_u16_le(code + 3U, ZPLC_MEM_OPI_BASE);
  code[5] = OP_HALT;
}

static void set_task_loop(uint8_t *program, uint8_t slot) {
  size_t code_offset = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE;
  uint8_t *code = program + code_offset + (size_t)slot * 6U;

  code[0] = OP_JMP;
  write_u16_le(code + 1U, (uint16_t)(slot * 6U));
  code[3] = OP_NOP;
  code[4] = OP_NOP;
  code[5] = OP_HALT;
}

static void set_task_two_pushes(uint8_t *program, uint8_t slot) {
  size_t code_offset = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE;
  uint8_t *code = program + code_offset + (size_t)slot * 6U;

  code[0] = OP_PUSH8;
  code[1] = 1U;
  code[2] = OP_PUSH8;
  code[3] = 2U;
  code[4] = OP_HALT;
  code[5] = OP_NOP;
}

static void set_task_stack_size(uint8_t *program, uint8_t slot,
                                uint16_t stack_size) {
  size_t code_offset = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE;
  size_t task_offset = code_offset + 3U * 6U;
  uint8_t *task = program + task_offset + (size_t)slot * ZPLC_TASK_DEF_SIZE;

  write_u16_le(task + 10U, stack_size);
}

static void set_task_order(uint8_t *program, uint8_t slot, uint16_t id,
                           uint8_t priority) {
  size_t code_offset = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE;
  size_t task_offset = code_offset + 3U * 6U;
  uint8_t *task = program + task_offset + (size_t)slot * ZPLC_TASK_DEF_SIZE;

  write_u16_le(task, id);
  task[3] = priority;
}

static void clear_scheduler(void) {
  int index;

#ifdef CONFIG_ZTEST
  zplc_sched_test_fail_next_output_commit(0U, ZPLC_HAL_OK);
  zplc_sched_test_fail_next_gpio_read(0U, ZPLC_HAL_OK);
  zplc_sched_test_fail_safe_outputs(ZPLC_HAL_OK);
  zplc_sched_test_fail_next_watchdog_setup(0);
  zplc_sched_test_fail_next_watchdog_disarm(0);
#endif
  zassert_ok(zplc_sched_stop(), "stop scheduler");
  for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; index++) {
    int result = zplc_sched_unregister_task(index);

    zassert_true(result == 0 || result == -2, "unregister task");
  }
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE,
                "scheduler must be idle");
}

static void assert_rejected_without_mutation(const uint8_t *program,
                                             size_t size) {
  zplc_sched_stats_t before;
  zplc_sched_stats_t after;
  uint32_t code_size = zplc_mem_get_code_size();

  zassert_ok(zplc_sched_get_stats(&before), "read initial stats");
  zassert_true(zplc_sched_load(program, size) < 0, "program must be rejected");
  zassert_ok(zplc_sched_get_stats(&after), "read final stats");
  zassert_equal(after.active_tasks, before.active_tasks, "task count changed");
  zassert_equal(zplc_mem_get_code_size(), code_size, "core code changed");
}

static void *scheduler_setup(void) {
  k_sem_init(&control_started, 0U, 1U);
  k_sem_init(&control_done, 0U, 1U);
  zassert_equal(zplc_hal_init(), ZPLC_HAL_OK, "initialize HAL");
  zassert_ok(zplc_sched_init(), "initialize scheduler");
  return NULL;
}

static void scheduler_teardown(void *fixture) {
  ARG_UNUSED(fixture);
  clear_scheduler();
  zassert_equal(zplc_hal_shutdown(), ZPLC_HAL_OK, "shutdown HAL");
}

ZTEST(zplc_scheduler_admission, test_admits_exact_capacity) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;
  zplc_sched_stats_t stats;

  clear_scheduler();
  size = build_program(program, CONFIG_ZPLC_MAX_TASKS, ZPLC_TASK_CYCLIC, 1000U,
                       1U);
  zassert_equal(zplc_sched_validate_program(program, size), ZPLC_LOADER_OK,
                "valid program rejected");
  zassert_equal(zplc_sched_load(program, size), CONFIG_ZPLC_MAX_TASKS,
                "exact capacity must load");
  zassert_ok(zplc_sched_get_stats(&stats), "read stats");
  zassert_equal(stats.active_tasks, CONFIG_ZPLC_MAX_TASKS, "wrong task count");
}

ZTEST(zplc_scheduler_admission, test_load_stays_idle_until_explicit_start) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;
  zplc_task_t task;

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 0x5AU);
  zassert_equal(zplc_sched_load(program, size), 1, "load program");
  k_msleep(20);
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE,
                "load must not start scheduler");
  zassert_ok(zplc_sched_get_task(0, &task), "read loaded task");
  zassert_equal(task.state, ZPLC_TASK_STATE_READY, "loaded task must be ready");
  zassert_equal(task.stats.cycle_count, 0U, "task ran before explicit start");
  zassert_equal(zplc_opi_read8(0U), 0U, "load must leave OPI safe");
  zassert_equal(zplc_force_get_count(), 0U, "load must leave no forces");
  zassert_ok(zplc_sched_start(), "explicit start");
  k_msleep(20);
  zassert_equal(zplc_opi_read8(0U), 0x5AU, "task did not execute after start");
  zassert_ok(zplc_sched_stop(), "stop scheduler");
}

ZTEST(zplc_scheduler_admission, test_empty_start_stays_idle_and_safe) {
  zplc_sched_stats_t before;
  zplc_sched_stats_t after;
  uint8_t *opi;

  clear_scheduler();
  zassert_ok(zplc_sched_get_stats(&before), "read empty baseline");
  zassert_equal(zplc_sched_start(), -2, "empty scheduler must reject start");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE,
                "empty start must remain idle");
  zassert_ok(zplc_sched_get_stats(&after), "read empty final state");
  zassert_equal(after.total_cycles, before.total_cycles, "empty start cycles");
  zassert_equal(after.input_latch_count, before.input_latch_count,
                "empty start input latches");
  zassert_equal(after.output_commit_count, before.output_commit_count,
                "empty start output commits");
  opi = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
  zassert_not_null(opi, "OPI exists");
  zassert_equal(opi[0], 0U, "empty start leaves OPI safe");
  zassert_equal(zplc_force_get_count(), 0U, "empty start leaves no forces");
}

ZTEST(zplc_scheduler_admission,
      test_rejects_invalid_admission_without_mutation) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;
  const uint32_t intervals[] = {999U, 1001U, 1000001U};
  size_t index;

  clear_scheduler();
  size = build_program(program, CONFIG_ZPLC_MAX_TASKS + 1U, ZPLC_TASK_CYCLIC,
                       1000U, 1U);
  assert_rejected_without_mutation(program, size);
  for (index = 0U; index < ARRAY_SIZE(intervals); index++) {
    size = build_program(program, 1U, ZPLC_TASK_CYCLIC, intervals[index], 1U);
    assert_rejected_without_mutation(program, size);
  }
  size = build_program(program, 1U, ZPLC_TASK_EVENT, 1000U, 1U);
  assert_rejected_without_mutation(program, size);
  size = build_program(program, 1U, ZPLC_TASK_INIT, 1000U, 1U);
  assert_rejected_without_mutation(program, size);
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 1U);
  program[size - 1U] ^= 1U;
  assert_rejected_without_mutation(program, size);
}

ZTEST(zplc_scheduler_admission, test_rejects_noncyclic_manual_registration) {
  zplc_task_def_t definition = {
      .id = 7U,
      .type = ZPLC_TASK_EVENT,
      .priority = 0U,
      .interval_us = 1000U,
      .entry_point = 0U,
      .stack_size = 64U,
      .reserved = 0U,
  };

  clear_scheduler();
  zassert_equal(zplc_sched_register_task(&definition, NULL, 0U), -4,
                "manual event task must be rejected");
}

ZTEST(zplc_scheduler_admission,
      test_rejects_raw_manual_registration_without_mutation) {
  uint8_t program[PROGRAM_CAPACITY];
  static const uint8_t raw[] = {OP_NOP, OP_HALT};
  zplc_task_def_t definition = {
      .id = 7U,
      .type = ZPLC_TASK_CYCLIC,
      .priority = 0U,
      .interval_us = 1000U,
      .entry_point = 0U,
      .stack_size = 64U,
      .reserved = 0U,
  };
  zplc_sched_stats_t before;
  zplc_sched_stats_t after;
  uint32_t code_size;
  size_t size;

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 1U);
  zassert_equal(zplc_sched_load(program, size), 1, "load baseline program");
  clear_scheduler();
  code_size = zplc_mem_get_code_size();
  zassert_ok(zplc_sched_get_stats(&before), "read initial stats");
  zassert_equal(zplc_sched_register_task(&definition, raw, sizeof(raw)), -2,
                "raw registration must be rejected");
  zassert_ok(zplc_sched_get_stats(&after), "read final stats");
  zassert_equal(after.active_tasks, before.active_tasks, "task count changed");
  zassert_equal(zplc_mem_get_code_size(), code_size, "core code changed");
}

ZTEST(zplc_scheduler_admission, test_task_stack_limit_faults_safely) {
  uint8_t program[PROGRAM_CAPACITY];
  uint8_t force = 1U;
  size_t size;

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 0U);
  set_task_two_pushes(program, 0U);
  set_task_stack_size(program, 0U, 1U);
  rewrite_program_crc(program, size);
  zassert_equal(zplc_sched_load(program, size), 1, "load stack-limited task");
  zassert_ok(zplc_force_set_bytes(ZPLC_MEM_OPI_BASE, &force, 1U),
             "set force before stack fault");
  zassert_equal(zplc_sched_step(), -ZPLC_VM_STACK_OVERFLOW,
                "task stack limit faults on second push");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR,
                "stack overflow latches scheduler error");
  zassert_equal(zplc_opi_read8(0U), 0U, "stack fault leaves OPI safe");
  zassert_equal(zplc_force_get_count(), 0U, "stack fault clears forces");
}

ZTEST(zplc_scheduler_admission, test_task_stack_limit_allows_configured_depth) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 0U);
  set_task_two_pushes(program, 0U);
  set_task_stack_size(program, 0U, 2U);
  rewrite_program_crc(program, size);
  zassert_equal(zplc_sched_load(program, size), 1, "load depth-two task");
  zassert_ok(zplc_sched_step(), "task with matching stack depth completes");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_PAUSED,
                "successful single step pauses after completing the task");
}

ZTEST(zplc_scheduler_admission,
      test_manual_registration_rejects_invalid_stack_bounds) {
  uint8_t program[PROGRAM_CAPACITY];
  zplc_task_def_t definition = {
      .id = 7U,
      .type = ZPLC_TASK_CYCLIC,
      .priority = 0U,
      .interval_us = 1000U,
      .entry_point = 0U,
      .stack_size = 0U,
      .reserved = 0U,
  };
  zplc_sched_stats_t before;
  zplc_sched_stats_t after;
  size_t size;

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 0U);
  zassert_equal(zplc_sched_load(program, size), 1, "load baseline program");
  clear_scheduler();
  zassert_ok(zplc_sched_get_stats(&before), "read initial stats");
  zassert_equal(zplc_sched_register_task(&definition, NULL, 0U), -4,
                "zero stack size is rejected");
  definition.stack_size = ZPLC_STACK_MAX_DEPTH + 1U;
  zassert_equal(zplc_sched_register_task(&definition, NULL, 0U), -4,
                "oversized stack is rejected");
  zassert_ok(zplc_sched_get_stats(&after), "read final stats");
  zassert_equal(after.active_tasks, before.active_tasks,
                "invalid stack registration does not materialize task");
  zassert_equal(zplc_opi_read8(0U), 0U,
                "invalid stack registration leaves OPI safe");
  zassert_equal(zplc_force_get_count(), 0U,
                "invalid stack registration leaves no forces");
}

ZTEST(zplc_scheduler_admission, test_bounded_fault_latches_safe_scheduler) {
  uint8_t loop_program[PROGRAM_CAPACITY];
  uint8_t healthy_program[PROGRAM_CAPACITY];
  size_t loop_size;
  size_t healthy_size;
  uint8_t force = 1U;
  uint8_t *opi;
  zplc_task_t second_task;

  clear_scheduler();
  loop_size = build_program(loop_program, 2U, ZPLC_TASK_CYCLIC, 1000U, 0xFFU);
  zassert_equal(zplc_sched_load(loop_program, loop_size), 2,
                "load looping program");
  zassert_ok(zplc_force_set_bytes(ZPLC_MEM_OPI_BASE, &force, 1U),
             "set force before fault");
  zassert_equal(zplc_sched_step(), -ZPLC_VM_WATCHDOG,
                "first step faults at bounded loop");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR,
                "bounded fault latches scheduler error");
  zassert_ok(zplc_sched_get_task(1, &second_task),
             "read unexecuted second task");
  zassert_equal(second_task.stats.cycle_count, 0U,
                "second task does not execute after first task fault");
  zassert_equal(second_task.state, ZPLC_TASK_STATE_ERROR,
                "fault makes second task non-executable");
  opi = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
  zassert_not_null(opi, "OPI exists");
  zassert_equal(opi[0], 0U, "fault clears OPI");
  zassert_equal(zplc_force_get_count(), 0U, "fault clears forces");
  zassert_true(zplc_sched_start() < 0, "faulted scheduler rejects start");
  zassert_true(zplc_sched_resume() < 0, "faulted scheduler rejects resume");
  zassert_true(zplc_sched_step() < 0, "faulted scheduler rejects step");
  zassert_ok(zplc_sched_stop(), "stop keeps outputs safe after fault");
  zassert_true(zplc_sched_start() < 0, "stop does not clear fault latch");
  clear_scheduler();
  healthy_size =
      build_program(healthy_program, 1U, ZPLC_TASK_CYCLIC, 1000U, 1U);
  zassert_equal(zplc_sched_load(healthy_program, healthy_size), 1,
                "validated replacement clears fault latch");
  zassert_ok(zplc_sched_start(), "healthy replacement starts");
  clear_scheduler();
}

ZTEST(zplc_scheduler_admission,
      test_control_plane_safe_error_latches_and_requires_replacement) {
  uint8_t program[PROGRAM_CAPACITY];
  uint8_t replacement[PROGRAM_CAPACITY];
  size_t size;
  size_t replacement_size;
  uint8_t force = 1U;
  uint8_t *opi;

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 1U);
  replacement_size =
      build_program(replacement, 1U, ZPLC_TASK_CYCLIC, 1000U, 1U);
  zassert_equal(zplc_sched_load(program, size), 1, "load resident program");
  zassert_ok(zplc_force_set_bytes(ZPLC_MEM_OPI_BASE, &force, sizeof(force)),
             "force output before ambiguous control-plane result");
  zassert_ok(zplc_sched_enter_safe_error(), "enter safe error");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR,
                "safe error must latch scheduler state");
  opi = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
  zassert_not_null(opi, "OPI exists");
  zassert_equal(opi[0], 0U, "safe error clears OPI");
  zassert_equal(zplc_force_get_count(), 0U, "safe error clears forces");
  zassert_true(zplc_sched_start() < 0, "safe error rejects start");
  zassert_true(zplc_sched_load(replacement, replacement_size) < 0,
               "safe error rejects replacement before explicit reset");
  zassert_ok(zplc_sched_stop(), "stop remains safe while latched");
  zassert_true(zplc_sched_start() < 0, "stop cannot clear safe error latch");

  clear_scheduler();
  zassert_equal(zplc_sched_load(replacement, replacement_size), 1,
                "validated replacement is explicit recovery");
  zassert_ok(zplc_sched_start(), "replacement starts after recovery");
  clear_scheduler();
}

ZTEST(zplc_scheduler_admission,
      test_empty_safe_error_recovers_only_with_verified_replacement) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 1U);
  zassert_ok(zplc_sched_enter_safe_error(), "latch empty scheduler safely");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR,
                "safe error is latched");
  zassert_equal(zplc_sched_load(program, size), 1,
                "verified replacement recovers empty scheduler");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE,
                "only materialized replacement clears error");
  zassert_ok(zplc_sched_start(), "recovered scheduler starts explicitly");
  clear_scheduler();
}

ZTEST(zplc_scheduler_admission, test_async_bounded_fault_stops_future_cycles) {
  uint8_t loop_program[PROGRAM_CAPACITY];
  size_t loop_size;
  zplc_sched_stats_t before;
  zplc_sched_stats_t after;

  clear_scheduler();
  loop_size = build_program(loop_program, 1U, ZPLC_TASK_CYCLIC, 1000U, 0xFFU);
  zassert_equal(zplc_sched_load(loop_program, loop_size), 1,
                "load async looping program");
  zassert_ok(zplc_sched_start(), "start async looping program");
  k_msleep(20);
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR,
                "timer work latches bounded fault");
  zassert_ok(zplc_sched_get_stats(&before), "read faulted scheduler stats");
  k_msleep(20);
  zassert_ok(zplc_sched_get_stats(&after), "read stable scheduler stats");
  zassert_equal(after.total_cycles, before.total_cycles,
                "no task cycles execute after fault latch");
  zassert_equal(zplc_mem_get_region(ZPLC_MEM_OPI_BASE)[0], 0U,
                "async bounded fault keeps OPI safe");
  zassert_ok(zplc_sched_stop(), "stop after async fault");
  clear_scheduler();
}

ZTEST(zplc_scheduler_admission,
      test_rejects_when_occupied_or_running_then_reloads) {
  uint8_t program_a[PROGRAM_CAPACITY];
  uint8_t program_b[PROGRAM_CAPACITY];
  uint8_t saved_code[18U];
  size_t a_size;
  size_t b_size;
  uint32_t saved_code_size;
  zplc_sched_stats_t stats;
  zplc_task_t task_before;
  zplc_task_t task_after;

  clear_scheduler();
  a_size = build_program(program_a, 1U, ZPLC_TASK_CYCLIC, 1000U, 0x5AU);
  b_size = build_program(program_b, 1U, ZPLC_TASK_CYCLIC, 2000U, 0x33U);
  zassert_equal(zplc_sched_load(program_a, a_size), 1, "initial load failed");
  zassert_ok(zplc_sched_get_task(0, &task_before), "read task A");
  saved_code_size = zplc_mem_get_code_size();
  memcpy(saved_code, zplc_mem_get_code(0U, saved_code_size), saved_code_size);
  assert_rejected_without_mutation(program_b, b_size);
  zassert_equal(memcmp(zplc_mem_get_code(0U, saved_code_size), saved_code,
                       saved_code_size),
                0, "occupied load replaced A");
  zassert_ok(zplc_sched_get_task(0, &task_after), "read preserved task A");
  zassert_equal(task_after.config.id, task_before.config.id, "A id changed");
  zassert_equal(task_after.config.type, task_before.config.type,
                "A type changed");
  zassert_equal(task_after.config.interval_us, task_before.config.interval_us,
                "A interval changed");
  zassert_ok(zplc_sched_start(), "start scheduler");
  assert_rejected_without_mutation(program_b, b_size);
  zassert_equal(memcmp(zplc_mem_get_code(0U, saved_code_size), saved_code,
                       saved_code_size),
                0, "running load replaced A");
  zassert_ok(zplc_sched_get_task(0, &task_after), "read running task A");
  zassert_equal(task_after.config.id, task_before.config.id,
                "running A id changed");
  zassert_equal(task_after.config.type, task_before.config.type,
                "running A type changed");
  zassert_equal(task_after.config.interval_us, task_before.config.interval_us,
                "running A interval changed");
  zassert_ok(zplc_sched_get_stats(&stats), "read running stats");
  zassert_equal(stats.active_tasks, 1U, "running task count changed");
  clear_scheduler();
  zassert_equal(zplc_sched_load(program_b, b_size), 1,
                "reload after unregister failed");
}

ZTEST(zplc_scheduler_admission, test_stop_and_reload_leave_no_stale_scan) {
  uint8_t program_a[PROGRAM_CAPACITY];
  uint8_t program_b[PROGRAM_CAPACITY];
  size_t a_size;
  size_t b_size;
  zplc_sched_stats_t before;
  zplc_sched_stats_t after;

  clear_scheduler();
  a_size = build_program(program_a, 1U, ZPLC_TASK_CYCLIC, 1000U, 0x5AU);
  zassert_equal(zplc_sched_load(program_a, a_size), 1, "load A");
  zassert_ok(zplc_sched_start(), "start A");
  k_sleep(K_MSEC(100));
  zassert_equal(zplc_opi_read8(0U), 0x5AU, "A did not execute");
  zassert_ok(zplc_sched_stop(), "stop A");
  zassert_ok(zplc_sched_get_stats(&before), "read stopped stats");
  k_sleep(K_MSEC(20));
  zassert_ok(zplc_sched_get_stats(&after), "read final stats");
  zassert_equal(after.total_cycles, before.total_cycles,
                "cycle ran after stop returned");
  zassert_ok(zplc_sched_unregister_task(0), "unregister A");
  b_size = build_program(program_b, 1U, ZPLC_TASK_CYCLIC, 1000U, 0U);
  zassert_equal(zplc_sched_load(program_b, b_size), 1, "load B");
  zassert_not_null(zplc_mem_get_region(ZPLC_MEM_OPI_BASE), "get output image");
  zplc_mem_get_region(ZPLC_MEM_OPI_BASE)[0] = 0U;
  zassert_ok(zplc_sched_start(), "start B");
  k_sleep(K_MSEC(20));
  zassert_ok(zplc_sched_stop(), "stop B");
  zassert_equal(zplc_opi_read8(0U), 0U,
                "stale A work executed after slot reuse");
}

ZTEST(zplc_scheduler_admission,
      test_stop_clears_outputs_and_forces_while_idle_or_running) {
  uint8_t program[PROGRAM_CAPACITY];
  uint8_t forced = 0xA5U;
  size_t size;

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 0x5AU);
  zassert_equal(zplc_sched_load(program, size), 1, "load safe-output program");
  zassert_ok(zplc_force_set_bytes(ZPLC_MEM_OPI_BASE, &forced, sizeof(forced)),
             "set output force");
  zassert_equal(zplc_force_get_count(), 1U, "force must be active");
  zassert_ok(zplc_sched_start(), "start scheduler");
  zassert_ok(zplc_sched_stop(), "stop scheduler");
  zassert_equal(zplc_opi_read8(0U), 0U, "stop must clear OPI");
  zassert_equal(zplc_force_get_count(), 0U, "stop must clear forces");
  zassert_ok(zplc_force_set_bytes(ZPLC_MEM_OPI_BASE, &forced, sizeof(forced)),
             "set idle output force");
  zassert_ok(zplc_sched_stop(), "idle stop must remain safe");
  zassert_equal(zplc_opi_read8(0U), 0U, "idle stop must clear OPI");
  zassert_equal(zplc_force_get_count(), 0U, "idle stop must clear forces");
}

ZTEST(zplc_scheduler_admission,
      test_external_pause_stops_cycles_and_resume_restarts) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;
  zplc_sched_stats_t paused;
  zplc_sched_stats_t after_pause;
  zplc_sched_stats_t resumed;

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 1U);
  zassert_equal(zplc_sched_load(program, size), 1, "load pause program");
  zassert_ok(zplc_sched_start(), "start pause program");
  k_sleep(K_MSEC(20));
  zassert_ok(zplc_sched_pause(), "pause scheduler");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_PAUSED,
                "scheduler did not pause");
  zassert_ok(zplc_sched_get_stats(&paused), "read paused stats");
  k_sleep(K_MSEC(20));
  zassert_ok(zplc_sched_get_stats(&after_pause), "read stable paused stats");
  zassert_equal(after_pause.total_cycles, paused.total_cycles,
                "cycle ran after pause returned");
  zassert_ok(zplc_sched_resume(), "resume scheduler");
  k_sleep(K_MSEC(20));
  zassert_ok(zplc_sched_get_stats(&resumed), "read resumed stats");
  zassert_true(resumed.total_cycles > after_pause.total_cycles,
               "resume did not restart cycles");
  zassert_ok(zplc_sched_stop(), "stop resumed scheduler");
}

ZTEST(zplc_scheduler_admission, test_step_orders_batch_and_commits_once) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;
  zplc_sched_stats_t before;
  zplc_sched_stats_t after;
  zplc_task_t task;

  clear_scheduler();
  size = build_program(program, 3U, ZPLC_TASK_CYCLIC, 1000U, 1U);
  set_task_output(program, 0U, 0x11U);
  set_task_output(program, 1U, 0x22U);
  set_task_output(program, 2U, 0x33U);
  /* Slot order is deliberately unlike priority/id order: 1, 2, 0. */
  set_task_order(program, 0U, 30U, 2U);
  set_task_order(program, 1U, 10U, 1U);
  set_task_order(program, 2U, 20U, 1U);
  rewrite_program_crc(program, size);
  zassert_equal(zplc_sched_load(program, size), 3, "load ordered batch");
  zassert_ok(zplc_sched_get_stats(&before), "read batch baseline");
  zassert_ok(zplc_sched_step(), "step ordered batch");
  zassert_equal(zplc_opi_read8(0U), 0U,
                "single-step pause returns the process image to safe output");
  zassert_ok(zplc_sched_get_stats(&after), "read batch result");
  zassert_equal(after.input_latch_count - before.input_latch_count, 1U,
                "one process-image input latch");
  zassert_equal(after.output_commit_count - before.output_commit_count, 1U,
                "one process-image output commit");
  zassert_ok(zplc_sched_get_task(0, &task), "read first task");
  zassert_equal(task.stats.cycle_count, 1U, "first task ran once");
  zassert_ok(zplc_sched_get_task(1, &task), "read second task");
  zassert_equal(task.stats.cycle_count, 1U, "second task ran once");
  zassert_ok(zplc_sched_get_task(2, &task), "read third task");
  zassert_equal(task.stats.cycle_count, 1U, "third task ran once");
}

ZTEST(zplc_scheduler_admission,
      test_process_image_differential_ordered_artifact) {
  zplc_sched_stats_t before;
  zplc_sched_stats_t after;
  zplc_task_t task;

  clear_scheduler();
  zassert_equal(zplc_sched_validate_program(
                    zplc_process_image_ordered_program,
                    ZPLC_PROCESS_IMAGE_ORDERED_PROGRAM_SIZE),
                ZPLC_LOADER_OK, "shared ordered artifact verifies");
  zassert_equal(zplc_sched_load(zplc_process_image_ordered_program,
                                ZPLC_PROCESS_IMAGE_ORDERED_PROGRAM_SIZE),
                3, "shared ordered artifact loads");
  zassert_ok(zplc_sched_get_stats(&before), "read ordered baseline");
  zassert_ok(zplc_sched_step(), "step shared ordered artifact");
  zassert_equal(zplc_mem_get_region(ZPLC_MEM_WORK_BASE)[0], 0x11U,
                "priority then task ID determines the final process image");
  zassert_equal(zplc_opi_read8(0U), 0U,
                "single-step teardown returns OPI to its safe state");
  zassert_ok(zplc_sched_get_stats(&after), "read ordered result");
  zassert_equal(after.input_latch_count - before.input_latch_count, 1U,
                "one input latch for the shared ordered artifact");
  zassert_equal(after.output_commit_count - before.output_commit_count, 1U,
                "one output commit for the shared ordered artifact");
  zassert_ok(zplc_sched_get_task(0, &task), "read source slot zero");
  zassert_equal(task.config.id, 30U, "source slot zero remains task 30");
  zassert_equal(task.stats.cycle_count, 1U, "source slot zero ran once");
  zassert_ok(zplc_sched_get_task(1, &task), "read source slot one");
  zassert_equal(task.config.id, 10U, "source slot one remains task 10");
  zassert_equal(task.stats.cycle_count, 1U, "source slot one ran once");
  zassert_ok(zplc_sched_get_task(2, &task), "read source slot two");
  zassert_equal(task.config.id, 20U, "source slot two remains task 20");
  zassert_equal(task.stats.cycle_count, 1U, "source slot two ran once");
}

ZTEST(zplc_scheduler_admission,
      test_process_image_differential_fault_artifact) {
  zplc_sched_stats_t before;
  zplc_sched_stats_t after;
  zplc_task_t later;
  uint8_t force = 1U;

  clear_scheduler();
  zassert_equal(zplc_sched_validate_program(
                    zplc_process_image_fault_program,
                    ZPLC_PROCESS_IMAGE_FAULT_PROGRAM_SIZE),
                ZPLC_LOADER_OK, "shared fault artifact verifies");
  zassert_equal(zplc_sched_load(zplc_process_image_fault_program,
                                ZPLC_PROCESS_IMAGE_FAULT_PROGRAM_SIZE),
                3, "shared fault artifact loads");
  zassert_ok(zplc_force_set_bytes(ZPLC_MEM_OPI_BASE, &force, sizeof(force)),
             "force output before fault");
  zassert_ok(zplc_sched_get_stats(&before), "read fault baseline");
  zassert_equal(zplc_sched_step(), -ZPLC_VM_WATCHDOG,
                "middle shared task faults by instruction watchdog");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR,
                "watchdog fault latches scheduler error");
  zassert_equal(zplc_mem_get_region(ZPLC_MEM_WORK_BASE)[0], 0x11U,
                "first ordered task ran before the watchdog fault");
  zassert_equal(zplc_mem_get_region(ZPLC_MEM_WORK_BASE)[7], 0U,
                "later ordered task did not write its sentinel");
  zassert_equal(zplc_opi_read8(0U), 0U, "fault clears OPI");
  zassert_equal(zplc_mem_get_region(ZPLC_MEM_IPI_BASE)[0], 0U,
                "fault clears IPI");
  zassert_equal(zplc_force_get_count(), 0U, "fault clears forces");
  zassert_ok(zplc_sched_get_task(0, &later), "read later source slot");
  zassert_equal(later.config.id, 30U, "sentinel belongs to task 30");
  zassert_equal(later.stats.cycle_count, 0U, "later task never ran");
  zassert_ok(zplc_sched_get_stats(&after), "read fault result");
  zassert_equal(after.input_latch_count - before.input_latch_count, 1U,
                "fault batch latches input once");
  zassert_equal(after.output_commit_count - before.output_commit_count, 0U,
                "fault batch has no normal output commit");
}

ZTEST(zplc_scheduler_admission,
      test_step_after_uptime_does_not_count_a_deadline_overrun) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;
  zplc_sched_stats_t before;
  zplc_sched_stats_t after;

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 1U);
  zassert_equal(zplc_sched_load(program, size), 1, "load step program");
  k_msleep(2);
  zassert_ok(zplc_sched_get_stats(&before), "read step baseline");
  zassert_true(before.uptime_ms > 0U, "uptime must be positive before step");
  zassert_ok(zplc_sched_step(), "step task");
  zassert_ok(zplc_sched_get_stats(&after), "read step result");
  zassert_equal(after.total_cycles, before.total_cycles + 1U,
                "manual step executes one cycle");
  zassert_equal(after.total_overruns, before.total_overruns,
                "manual step is not a periodic deadline overrun");
}

ZTEST(zplc_scheduler_admission,
      test_pending_periodic_release_coalesces_without_an_overrun) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;
  zplc_task_t before;
  zplc_task_t after;

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 1U);
  zassert_equal(zplc_sched_load(program, size), 1, "load periodic task");
  zassert_ok(zplc_sched_get_task(0, &before), "read initial task stats");
  zassert_equal(zplc_sched_test_admit_release(0), 1,
                "first periodic release admits one activation");
  zassert_equal(zplc_sched_test_admit_release(0), 0,
                "pending periodic release coalesces");
  zassert_ok(zplc_sched_get_task(0, &after), "read coalesced task stats");
  zassert_equal(after.stats.overrun_count, before.stats.overrun_count,
                "coalescing does not count an activation overrun");
}

ZTEST(zplc_scheduler_admission,
      test_output_commit_fault_latches_safe_scheduler) {
  uint8_t program[PROGRAM_CAPACITY];
  uint8_t replacement[PROGRAM_CAPACITY];
  uint8_t force = 1U;
  size_t size;
  size_t replacement_size;
  zplc_sched_stats_t before;
  zplc_sched_stats_t after;
  zplc_sched_stats_t stable;
  zplc_task_t task;

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 0x5AU);
  zassert_equal(zplc_sched_load(program, size), 1, "load output program");
  zassert_ok(zplc_force_set_bytes(ZPLC_MEM_OPI_BASE, &force, sizeof(force)),
             "set output force");
  zassert_ok(zplc_sched_get_stats(&before), "read output baseline");
  zplc_sched_test_fail_next_output_commit(1U, ZPLC_HAL_ERROR);
  zassert_equal(zplc_sched_step(), ZPLC_HAL_ERROR, "output commit fault");
  zassert_equal(zplc_sched_test_output_commit_write_count(), 1U,
                "channel zero writes before channel one fault");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR,
                "fault latches");
  zassert_equal(zplc_opi_read8(0U), 0U, "fault clears OPI");
  zassert_equal(zplc_force_get_count(), 0U, "fault clears forces");
  zassert_ok(zplc_sched_get_task(0, &task), "read faulted task");
  zassert_equal(task.stats.cycle_count, 1U,
                "task cycle occurred before commit");
  zassert_ok(zplc_sched_get_stats(&after), "read output fault evidence");
  zassert_equal(after.input_latch_count - before.input_latch_count, 1U,
                "fault batch latches input once");
  zassert_equal(after.output_commit_count - before.output_commit_count, 0U,
                "fault batch has no normal output commit");
  zassert_true(zplc_sched_start() < 0, "faulted scheduler rejects start");
  zassert_true(zplc_sched_resume() < 0, "faulted scheduler rejects resume");
  zassert_true(zplc_sched_step() < 0, "faulted scheduler rejects step");
  zassert_ok(zplc_sched_get_stats(&stable), "read stable fault evidence");
  zassert_equal(stable.total_cycles, after.total_cycles, "no later task cycle");
  zassert_equal(stable.input_latch_count, after.input_latch_count,
                "no later input latch");
  zassert_equal(stable.output_commit_count, after.output_commit_count,
                "no later output commit");
  clear_scheduler();
  replacement_size =
      build_program(replacement, 1U, ZPLC_TASK_CYCLIC, 1000U, 1U);
  zassert_equal(zplc_sched_load(replacement, replacement_size), 1,
                "validated replacement clears fault latch");
  zassert_ok(zplc_sched_start(), "replacement starts after output fault");
  clear_scheduler();
}

ZTEST(zplc_scheduler_admission,
      test_input_read_fault_latches_before_batch_execution) {
  uint8_t program[PROGRAM_CAPACITY];
  uint8_t replacement[PROGRAM_CAPACITY];
  uint8_t force = 1U;
  size_t size;
  size_t replacement_size;
  zplc_sched_stats_t before;
  zplc_sched_stats_t after;
  zplc_sched_stats_t stable;
  zplc_task_t task;

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 0x5AU);
  zassert_equal(zplc_sched_load(program, size), 1, "load input program");
  zassert_ok(zplc_force_set_bytes(ZPLC_MEM_OPI_BASE, &force, sizeof(force)),
             "set output force");
  zassert_ok(zplc_sched_get_stats(&before), "read input baseline");
  zplc_sched_test_fail_next_gpio_read(0U, ZPLC_HAL_ERROR);
  zassert_equal(zplc_sched_step(), ZPLC_HAL_ERROR, "input read fault");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR,
                "fault latches");
  zassert_equal(zplc_opi_read8(0U), 0U, "fault clears OPI");
  zassert_equal(zplc_force_get_count(), 0U, "fault clears forces");
  zassert_ok(zplc_sched_get_task(0, &task), "read faulted task");
  zassert_equal(task.state, ZPLC_TASK_STATE_ERROR, "task enters error");
  zassert_equal(task.stats.cycle_count, 0U, "input failure executes no task");
  zassert_ok(zplc_sched_get_stats(&after), "read input fault evidence");
  zassert_equal(after.total_cycles, before.total_cycles,
                "fault has no task cycles");
  zassert_equal(after.input_latch_count, before.input_latch_count,
                "fault has no input latch");
  zassert_equal(after.output_commit_count, before.output_commit_count,
                "fault has no output commit");
  zassert_true(zplc_sched_start() < 0, "faulted scheduler rejects start");
  zassert_true(zplc_sched_resume() < 0, "faulted scheduler rejects resume");
  zassert_true(zplc_sched_step() < 0, "faulted scheduler rejects step");
  zassert_ok(zplc_sched_get_stats(&stable), "read stable fault evidence");
  zassert_equal(stable.total_cycles, after.total_cycles, "no later task cycle");
  zassert_equal(stable.input_latch_count, after.input_latch_count,
                "no later input latch");
  zassert_equal(stable.output_commit_count, after.output_commit_count,
                "no later output commit");
  clear_scheduler();
  replacement_size =
      build_program(replacement, 1U, ZPLC_TASK_CYCLIC, 1000U, 1U);
  zassert_equal(zplc_sched_load(replacement, replacement_size), 1,
                "validated replacement clears fault latch");
  zassert_ok(zplc_sched_start(), "replacement starts after input fault");
  clear_scheduler();
}

ZTEST(zplc_scheduler_admission,
      test_watchdog_prepare_failure_never_enters_run_or_feeds) {
  uint8_t program[PROGRAM_CAPACITY];
  uint8_t force = 1U;
  size_t size;
  uint32_t feeds_before;

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 0x5AU);
  zassert_equal(zplc_sched_load(program, size), 1, "load watchdog program");
  zassert_ok(zplc_force_set_bytes(ZPLC_MEM_OPI_BASE, &force, sizeof(force)),
             "stage force before prepare failure");
  feeds_before = zplc_sched_test_watchdog_feed_count();
  zplc_sched_test_fail_next_watchdog_prepare(-EIO);
  zassert_equal(zplc_sched_start(), -3, "prepare failure rejects start");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE,
                "prepare failure leaves scheduler idle");
  zassert_equal(zplc_opi_read8(0U), 0U, "prepare failure applies safe OPI");
  zassert_equal(zplc_force_get_count(), 0U, "prepare failure clears forces");
  k_msleep(10);
  zassert_equal(zplc_sched_test_watchdog_feed_count(), feeds_before,
                "prepare failure must not feed");
}

ZTEST(zplc_scheduler_admission,
      test_watchdog_timeout_rejects_a_task_without_two_periods_of_margin) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;
  uint32_t feeds_before;

  clear_scheduler();
  /* The native_sim seam has a fixed 1000ms WDT timeout. */
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 600000000U, 0x5AU);
  zassert_equal(zplc_sched_load(program, size), 1, "load long-period task");
  feeds_before = zplc_sched_test_watchdog_feed_count();
  zassert_equal(zplc_sched_start(), -3,
                "timeout must exceed twice the largest task interval");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE,
                "rejected watchdog admission remains idle");
  zassert_equal(zplc_sched_test_watchdog_feed_count(), feeds_before,
                "rejected watchdog admission does not feed");
}

ZTEST(zplc_scheduler_admission,
      test_watchdog_feeds_once_per_clean_normal_commit_then_disarms_on_stop) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;
  zplc_sched_stats_t before;
  zplc_sched_stats_t after;
  uint32_t feeds_before;
  uint32_t disarms_before;

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 0x5AU);
  zassert_equal(zplc_sched_load(program, size), 1, "load clean watchdog task");
  zassert_ok(zplc_sched_get_stats(&before), "read clean baseline");
  feeds_before = zplc_sched_test_watchdog_feed_count();
  disarms_before = zplc_sched_test_watchdog_disarm_count();
  zassert_ok(zplc_sched_start(), "start clean watchdog task");
  k_msleep(20);
  zassert_ok(zplc_sched_stop(), "stop clean watchdog task");
  zassert_ok(zplc_sched_get_stats(&after), "read clean result");
  zassert_true(after.output_commit_count > before.output_commit_count,
               "clean task produces normal commits");
  zassert_equal(zplc_sched_test_watchdog_feed_count() - feeds_before,
                after.output_commit_count - before.output_commit_count,
                "every and only normal commits feed once");
  zassert_true(zplc_sched_test_watchdog_disarm_count() > disarms_before,
               "stop disarms after safe outputs");
  feeds_before = zplc_sched_test_watchdog_feed_count();
  k_msleep(10);
  zassert_equal(zplc_sched_test_watchdog_feed_count(), feeds_before,
                "stop leaves no continuing feeder");
}

ZTEST(zplc_scheduler_admission,
      test_deadline_overrun_faults_before_normal_commit_or_watchdog_feed) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;
  zplc_sched_stats_t before;
  zplc_sched_stats_t after;
  uint32_t feeds_before;

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 0x5AU);
  zassert_equal(zplc_sched_load(program, size), 1, "load overrun task");
  zassert_ok(zplc_sched_get_stats(&before), "read overrun baseline");
  feeds_before = zplc_sched_test_watchdog_feed_count();
  zplc_sched_test_force_next_deadline_miss();
  zassert_ok(zplc_sched_start(), "start overrun task");
  k_msleep(20);
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR,
                "deadline overrun latches error");
  zassert_equal(zplc_opi_read8(0U), 0U, "overrun leaves safe OPI");
  zassert_ok(zplc_sched_get_stats(&after), "read overrun result");
  zassert_true(after.total_overruns > before.total_overruns,
               "overrun is recorded");
  zassert_equal(after.output_commit_count, before.output_commit_count,
                "overrun faults before normal output commit");
  zassert_equal(zplc_sched_test_watchdog_feed_count(), feeds_before,
                "overrun does not feed watchdog");
}

ZTEST(zplc_scheduler_admission,
      test_watchdog_feed_failure_latches_safe_and_pause_stops_feeding) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;
  uint32_t feeds_before;
  uint32_t disarms_before;

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 0x5AU);
  zassert_equal(zplc_sched_load(program, size), 1, "load feed-failure task");
  feeds_before = zplc_sched_test_watchdog_feed_count();
  zplc_sched_test_fail_next_watchdog_feed(-EIO);
  zassert_ok(zplc_sched_start(), "start feed-failure task");
  k_msleep(20);
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR,
                "feed failure latches error");
  zassert_equal(zplc_opi_read8(0U), 0U, "feed failure applies safe OPI");
  zassert_equal(zplc_sched_test_watchdog_feed_count(), feeds_before + 1U,
                "failed feed is attempted once");

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 0x5AU);
  zassert_equal(zplc_sched_load(program, size), 1, "load pause task");
  zassert_ok(zplc_sched_start(), "start pause task");
  k_msleep(10);
  feeds_before = zplc_sched_test_watchdog_feed_count();
  disarms_before = zplc_sched_test_watchdog_disarm_count();
  zassert_ok(zplc_sched_pause(), "pause applies safe state");
  zassert_equal(zplc_opi_read8(0U), 0U, "pause applies safe OPI");
  zassert_true(zplc_sched_test_watchdog_disarm_count() > disarms_before,
               "pause disarms hardware watchdog");
  k_msleep(10);
  zassert_equal(zplc_sched_test_watchdog_feed_count(), feeds_before,
                "paused scheduler has no continuing feeder");
}

ZTEST(zplc_scheduler_admission,
      test_watchdog_disarm_failure_latches_error_after_safe_pause) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 0x5AU);
  zassert_equal(zplc_sched_load(program, size), 1, "load disarm-failure task");
  zassert_ok(zplc_sched_start(), "start disarm-failure task");
  k_msleep(10);
  zplc_sched_test_fail_next_watchdog_disarm(-EIO);
  zassert_equal(zplc_sched_pause(), -EIO, "disarm failure is reported");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR,
                "disarm failure is an honest safe error");
  zassert_equal(zplc_opi_read8(0U), 0U, "disarm failure keeps outputs safe");
}

ZTEST(zplc_scheduler_admission,
      test_armed_async_faults_never_feed_watchdog) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;
  uint32_t feeds_before;

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 0xFFU);
  zassert_equal(zplc_sched_load(program, size), 1, "load VM fault task");
  feeds_before = zplc_sched_test_watchdog_feed_count();
  zassert_ok(zplc_sched_start(), "start VM fault task");
  k_msleep(20);
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR,
                "VM fault latches error");
  zassert_equal(zplc_sched_test_watchdog_feed_count(), feeds_before,
                "VM fault has no feed");

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 0x5AU);
  zassert_equal(zplc_sched_load(program, size), 1, "load input fault task");
  feeds_before = zplc_sched_test_watchdog_feed_count();
  zplc_sched_test_fail_next_gpio_read(0U, ZPLC_HAL_ERROR);
  zassert_ok(zplc_sched_start(), "start input fault task");
  k_msleep(20);
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR,
                "input fault latches error");
  zassert_equal(zplc_sched_test_watchdog_feed_count(), feeds_before,
                "input fault has no feed");

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 0x5AU);
  zassert_equal(zplc_sched_load(program, size), 1, "load output fault task");
  feeds_before = zplc_sched_test_watchdog_feed_count();
  zplc_sched_test_fail_next_output_commit(0U, ZPLC_HAL_ERROR);
  zassert_ok(zplc_sched_start(), "start output fault task");
  k_msleep(20);
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR,
                "output fault latches error");
  zassert_equal(zplc_sched_test_watchdog_feed_count(), feeds_before,
                "output fault has no feed");
}

ZTEST(zplc_scheduler_admission,
      test_watchdog_setup_failure_cleans_up_before_run) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;
  uint32_t disarms_before;
  uint32_t feeds_before;

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 0x5AU);
  zassert_equal(zplc_sched_load(program, size), 1, "load setup-failure task");
  disarms_before = zplc_sched_test_watchdog_disarm_count();
  feeds_before = zplc_sched_test_watchdog_feed_count();
  zplc_sched_test_fail_next_watchdog_setup(-EIO);
  zassert_equal(zplc_sched_start(), -3, "setup failure rejects start");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE,
                "setup failure remains idle after safe outputs");
  zassert_true(zplc_sched_test_watchdog_disarm_count() > disarms_before,
               "post-install setup failure attempts cleanup");
  zassert_equal(zplc_sched_test_watchdog_feed_count(), feeds_before,
                "setup failure never feeds");

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 0x5AU);
  zassert_equal(zplc_sched_load(program, size), 1,
                "reload setup plus safe-failure task");
  disarms_before = zplc_sched_test_watchdog_disarm_count();
  feeds_before = zplc_sched_test_watchdog_feed_count();
  zplc_sched_test_fail_next_watchdog_setup(-EIO);
  zplc_sched_test_fail_safe_outputs(ZPLC_HAL_ERROR);
  zassert_equal(zplc_sched_start(), -3,
                "setup plus safe-output failure rejects start");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR,
                "unsafe start cleanup latches error");
  zassert_equal(zplc_sched_test_watchdog_disarm_count(), disarms_before,
                "unsafe start cleanup does not disarm watchdog");
  zassert_equal(zplc_sched_test_watchdog_feed_count(), feeds_before,
                "unsafe start cleanup never feeds");
  zplc_sched_test_fail_safe_outputs(ZPLC_HAL_OK);
}

ZTEST(zplc_scheduler_admission,
      test_safe_output_failure_keeps_watchdog_armed_and_latches_error) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;
  uint32_t disarms_before;

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 0x5AU);
  zassert_equal(zplc_sched_load(program, size), 1, "load pause safe-failure task");
  zassert_ok(zplc_sched_start(), "start pause safe-failure task");
  k_msleep(10);
  disarms_before = zplc_sched_test_watchdog_disarm_count();
  zplc_sched_test_fail_safe_outputs(ZPLC_HAL_ERROR);
  zassert_equal(zplc_sched_pause(), ZPLC_HAL_ERROR, "pause reports safe failure");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR,
                "pause safe failure latches error");
  zassert_equal(zplc_sched_test_watchdog_disarm_count(), disarms_before,
                "pause does not disarm before safe outputs succeed");
  zplc_sched_test_fail_safe_outputs(ZPLC_HAL_OK);
  clear_scheduler();

  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 0x5AU);
  zassert_equal(zplc_sched_load(program, size), 1, "load stop safe-failure task");
  zassert_ok(zplc_sched_start(), "start stop safe-failure task");
  k_msleep(10);
  disarms_before = zplc_sched_test_watchdog_disarm_count();
  zplc_sched_test_fail_safe_outputs(ZPLC_HAL_ERROR);
  zassert_equal(zplc_sched_stop(), ZPLC_HAL_ERROR, "stop reports safe failure");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR,
                "stop safe failure latches error");
  zassert_equal(zplc_sched_test_watchdog_disarm_count(), disarms_before,
                "stop does not disarm before safe outputs succeed");
  zplc_sched_test_fail_safe_outputs(ZPLC_HAL_OK);
}

ZTEST(zplc_scheduler_admission,
      test_resume_prepare_failure_stays_paused_without_feed) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;
  uint32_t feeds_before;

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 0x5AU);
  zassert_equal(zplc_sched_load(program, size), 1, "load resume task");
  zassert_ok(zplc_sched_start(), "start resume task");
  k_msleep(10);
  zassert_ok(zplc_sched_pause(), "pause resume task");
  feeds_before = zplc_sched_test_watchdog_feed_count();
  zplc_sched_test_fail_next_watchdog_setup(-EIO);
  zassert_equal(zplc_sched_resume(), -2, "resume prepare failure is reported");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_PAUSED,
                "resume prepare failure remains paused");
  k_msleep(10);
  zassert_equal(zplc_sched_test_watchdog_feed_count(), feeds_before,
                "failed resume starts no feeder");
}

ZTEST(zplc_scheduler_admission,
      test_last_running_task_unregisters_to_safe_idle_without_feeder) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;
  uint32_t feeds_before;

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 0x5AU);
  zassert_equal(zplc_sched_load(program, size), 1, "load last-task fixture");
  zassert_ok(zplc_sched_start(), "start last-task fixture");
  k_msleep(10);
  zassert_ok(zplc_sched_unregister_task(0), "unregister final running task");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE,
                "last task unregister leaves safe idle");
  zassert_equal(zplc_opi_read8(0U), 0U, "last task unregister applies safe OPI");
  feeds_before = zplc_sched_test_watchdog_feed_count();
  k_msleep(10);
  zassert_equal(zplc_sched_test_watchdog_feed_count(), feeds_before,
                "last task leaves no feeder");
}

ZTEST(zplc_scheduler_admission,
      test_shutdown_retains_error_on_stop_failure_and_reinitializes_cleanly) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 0x5AU);
  zassert_equal(zplc_sched_load(program, size), 1, "load shutdown fixture");
  zassert_ok(zplc_sched_start(), "start shutdown fixture");
  k_msleep(10);
  zplc_sched_test_fail_next_watchdog_disarm(-EIO);
  zassert_equal(zplc_sched_shutdown(), -EIO, "shutdown reports disarm failure");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR,
                "failed shutdown retains safe error state");
  clear_scheduler();

  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 0x5AU);
  zassert_equal(zplc_sched_load(program, size), 1,
                "reload shutdown safe-failure fixture");
  zassert_ok(zplc_sched_start(), "start shutdown safe-failure fixture");
  k_msleep(10);
  zplc_sched_test_fail_safe_outputs(ZPLC_HAL_ERROR);
  zassert_equal(zplc_sched_shutdown(), ZPLC_HAL_ERROR,
                "shutdown reports safe-output failure");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR,
                "safe-output shutdown failure retains error state");
  zplc_sched_test_fail_safe_outputs(ZPLC_HAL_OK);
  clear_scheduler();
  zassert_ok(zplc_sched_shutdown(), "clean shutdown succeeds after recovery");
  zassert_ok(zplc_sched_init(), "scheduler reinitializes after clean shutdown");
}

ZTEST(zplc_scheduler_admission, test_empty_step_keeps_scheduler_idle) {
  clear_scheduler();
  zassert_equal(zplc_sched_step(), -2, "empty step must report no work");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE,
                "empty step must not enter running state");
}

ZTEST(zplc_scheduler_admission,
      test_unregister_running_task_drains_target_and_keeps_other_task_running) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;
  zplc_task_t removed;
  zplc_task_t peer_before;
  zplc_task_t peer_after;

  clear_scheduler();
  size = build_program(program, 2U, ZPLC_TASK_CYCLIC, 10000U, 1U);
  zassert_equal(zplc_sched_load(program, size), 2, "load two running tasks");
  zassert_ok(zplc_sched_get_task(1, &peer_before), "observe peer baseline");
  zplc_sched_test_hold_before_commit();
  zassert_ok(zplc_sched_start(), "start two running tasks");
  zassert_ok(zplc_sched_test_wait_before_commit(100),
             "batch did not reach hold");
  start_control_thread(1, 0);
  k_msleep(10);
  zassert_equal(k_sem_count_get(&control_done), 0U,
                "unregister must wait for in-flight coordinator");
  zplc_sched_test_release_before_commit();
  zassert_ok(k_sem_take(&control_done, K_MSEC(100)),
             "unregister did not drain");
  zassert_ok(k_thread_join(&control_thread, K_MSEC(100)),
             "unregister thread did not terminate");
  zassert_ok(control_result, "unregister running target");
  zassert_equal(zplc_sched_get_task(0, &removed), -3,
                "target must remain inaccessible after drain");
  zassert_ok(zplc_sched_get_task(1, &peer_after), "observe peer after drain");
  zassert_true(peer_after.stats.cycle_count > peer_before.stats.cycle_count,
               "pending peer work must continue after coordinator drain");
  k_msleep(20);
  zassert_ok(zplc_sched_get_task(1, &peer_before), "observe later peer cycle");
  zassert_true(peer_before.stats.cycle_count > peer_after.stats.cycle_count,
               "peer continues after target unregister returns");
  zassert_ok(zplc_sched_stop(), "stop remaining task");
}

ZTEST(zplc_scheduler_admission,
      test_stop_waits_for_batch_and_leaves_safe_outputs) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;
  zplc_sched_stats_t before;
  zplc_sched_stats_t after;

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 0x5AU);
  zassert_equal(zplc_sched_load(program, size), 1, "load stop-admission task");
  zassert_ok(zplc_sched_get_stats(&before), "read baseline evidence");
  zplc_sched_test_hold_before_commit();
  zassert_ok(zplc_sched_start(), "start stop-admission task");
  zassert_ok(zplc_sched_test_wait_before_commit(100),
             "batch did not reach hold");
  start_control_thread(0, 0);
  k_msleep(10);
  zassert_equal(k_sem_count_get(&control_done), 0U,
                "stop must wait for in-flight coordinator");
  zplc_sched_test_release_before_commit();
  zassert_ok(k_sem_take(&control_done, K_MSEC(100)), "stop did not complete");
  zassert_ok(k_thread_join(&control_thread, K_MSEC(100)),
             "stop thread did not terminate");
  zassert_ok(control_result, "stop scheduler");
  zassert_equal(zplc_opi_read8(0U), 0U, "stop must leave OPI safe");
  zassert_ok(zplc_sched_get_stats(&after), "read stopped evidence");
  k_msleep(20);
  zassert_ok(zplc_sched_get_stats(&before), "read stable stopped evidence");
  zassert_equal(before.total_cycles, after.total_cycles,
                "no cycle executes after stop returns");
  zassert_equal(before.output_commit_count, after.output_commit_count,
                "no normal commit occurs after stop returns");
}

ZTEST(zplc_scheduler_admission, test_release_comparator_is_wrap_safe_and_tied) {
  zassert_true(
      zplc_sched_test_release_before(100U, 20U, 1U, 1U, 100U, 30U, 0U, 0U),
      "earlier release wins before priority");
  zassert_true(
      zplc_sched_test_release_before(101U, 1U, 1U, 1U, 102U, 0U, 0U, 0U),
      "coarse uptime ordering is monotonic");
  zassert_true(zplc_sched_test_release_before(100U, UINT32_MAX - 10U, 1U, 1U,
                                              100U, 5U, 0U, 0U),
               "cycle32 ordering wraps safely within one uptime millisecond");
  zassert_true(zplc_sched_test_release_before(7U, 10U, 0U, 9U, 7U, 10U, 1U, 1U),
               "lower priority value wins tied release");
  zassert_true(zplc_sched_test_release_before(7U, 10U, 1U, 2U, 7U, 10U, 1U, 3U),
               "lower task id wins complete tie");
  zassert_false(
      zplc_sched_test_release_before(7U, 10U, 1U, 3U, 7U, 10U, 1U, 2U),
      "comparator is directional");
}

ZTEST(zplc_scheduler_admission,
      test_cycle_stamp_duration_and_deadline_boundaries_are_microsecond_exact) {
  uint32_t at_750_us = (uint32_t)k_us_to_cyc_floor64(750U);
  uint32_t at_1000_us = (uint32_t)k_us_to_cyc_floor64(1000U);
  uint32_t at_1001_us = (uint32_t)k_us_to_cyc_floor64(1001U);

  zassert_equal(zplc_sched_test_elapsed_us(0U, 0U, 0U, at_750_us), 750U,
                "750us execution must not publish as a millisecond");
  zassert_false(zplc_sched_test_deadline_missed(0U, 0U, 0U, at_750_us, 1000U),
                "deadline before interval is not an overrun");
  zassert_false(zplc_sched_test_deadline_missed(0U, 0U, 0U, at_1000_us, 1000U),
                "deadline equal to interval is not an overrun");
  zassert_true(zplc_sched_test_deadline_missed(0U, 0U, 0U, at_1001_us, 1000U),
               "deadline after interval is an overrun");
}

ZTEST(zplc_scheduler_admission,
      test_cycle_stamp_handles_cycle32_wrap_and_long_elapsed_duration) {
  uint32_t start_cycle = UINT32_MAX - 999U;
  uint32_t wrapped_end = start_cycle + (uint32_t)k_us_to_cyc_floor64(750U);
  uint64_t cycles_per_ms = k_ms_to_cyc_floor64(1U);
  uint64_t long_ms;
  uint64_t expected_cycles;

  zassert_equal(zplc_sched_test_elapsed_us(0U, start_cycle, 0U, wrapped_end),
                750U, "cycle32 wrap must preserve a sub-millisecond duration");
  zassert_true(cycles_per_ms > 0U, "target must expose a cycle clock");
  long_ms = UINT32_MAX / cycles_per_ms + 2U;
  expected_cycles = k_ms_to_cyc_floor64(long_ms);
  zassert_true(expected_cycles > UINT32_MAX,
               "test duration must exceed one cycle32 epoch");
  zassert_equal(
      zplc_sched_test_elapsed_us(0U, 0U, long_ms, (uint32_t)expected_cycles),
      k_cyc_to_us_floor64(expected_cycles) > UINT32_MAX
          ? UINT32_MAX
          : (uint32_t)k_cyc_to_us_floor64(expected_cycles),
      "coarse uptime reconstructs durations beyond one cycle32 wrap");
}

ZTEST(zplc_scheduler_admission,
      test_step_fault_has_latch_without_normal_commit) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;
  zplc_sched_stats_t before;
  zplc_sched_stats_t after;
  zplc_task_t later;
  uint8_t force = 1U;

  clear_scheduler();
  size = build_program(program, 3U, ZPLC_TASK_CYCLIC, 1000U, 1U);
  set_task_output(program, 0U, 0x11U);
  set_task_loop(program, 1U);
  set_task_output(program, 2U, 0x33U);
  set_task_order(program, 0U, 10U, 0U);
  set_task_order(program, 1U, 20U, 1U);
  set_task_order(program, 2U, 30U, 2U);
  rewrite_program_crc(program, size);
  zassert_equal(zplc_sched_load(program, size), 3, "load fault batch");
  zassert_ok(zplc_force_set_bytes(ZPLC_MEM_OPI_BASE, &force, 1U),
             "force output");
  zassert_ok(zplc_sched_get_stats(&before), "read fault baseline");
  zassert_equal(zplc_sched_step(), -ZPLC_VM_WATCHDOG, "middle task faults");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR,
                "fault latches");
  zassert_equal(zplc_opi_read8(0U), 0U, "fault applies safe OPI");
  zassert_equal(zplc_force_get_count(), 0U, "fault clears forces");
  zassert_ok(zplc_sched_get_task(2, &later), "read later task");
  zassert_equal(later.stats.cycle_count, 0U, "later task never ran");
  zassert_ok(zplc_sched_get_stats(&after), "read fault result");
  zassert_equal(after.input_latch_count - before.input_latch_count, 1U,
                "fault batch latches input once");
  zassert_equal(after.output_commit_count - before.output_commit_count, 0U,
                "fault batch has no normal output commit");
}

ZTEST(zplc_scheduler_admission,
      test_breakpoint_pauses_batch_before_later_task) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;
  zplc_task_t later;
  zplc_sched_stats_t before;
  zplc_sched_stats_t after;

  clear_scheduler();
  size = build_program(program, 2U, ZPLC_TASK_CYCLIC, 1000U, 1U);
  set_task_order(program, 0U, 10U, 0U);
  set_task_order(program, 1U, 20U, 1U);
  rewrite_program_crc(program, size);
  zassert_equal(zplc_sched_load(program, size), 2, "load breakpoint batch");
  zassert_ok(zplc_sched_debug_add_breakpoint(0, 0U), "add first breakpoint");
  zassert_ok(zplc_sched_get_stats(&before), "read breakpoint baseline");
  zassert_ok(zplc_sched_step(), "step pauses without deadlock");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_PAUSED,
                "breakpoint pauses scheduler");
  zassert_ok(zplc_sched_get_task(1, &later), "read later task");
  zassert_equal(later.stats.cycle_count, 0U, "later task did not execute");
  zassert_ok(zplc_sched_get_stats(&after), "read breakpoint result");
  zassert_equal(after.output_commit_count - before.output_commit_count, 1U,
                "breakpoint batch commits outputs once");
  zassert_ok(zplc_sched_debug_remove_breakpoint(0, 0U), "remove breakpoint");
  zassert_ok(zplc_sched_step(), "step progresses after breakpoint removal");
  zassert_ok(zplc_sched_get_task(0, &later), "read recovered first task");
  zassert_equal(later.stats.cycle_count, 2U,
                "recovered task executes exactly one later step");
}

ZTEST(zplc_scheduler_admission,
      test_debug_snapshot_drops_unregistered_slot_state) {
  uint8_t first[PROGRAM_CAPACITY];
  uint8_t second[PROGRAM_CAPACITY];
  zplc_sched_vm_snapshot_t snapshot;
  size_t first_size;
  size_t second_size;

  clear_scheduler();
  first_size = build_program(first, 1U, ZPLC_TASK_CYCLIC, 1000U, 1U);
  zassert_equal(zplc_sched_load(first, first_size), 1, "load first program");
  zassert_ok(zplc_sched_debug_add_breakpoint(0, 0U), "set first breakpoint");
  zassert_ok(zplc_sched_unregister_task(0), "unregister first task");
  zassert_equal(zplc_sched_debug_snapshot(0, &snapshot), -2,
                "unregistered slot has no snapshot");
  second_size = build_program(second, 1U, ZPLC_TASK_CYCLIC, 1000U, 2U);
  zassert_equal(zplc_sched_load(second, second_size), 1, "reuse task slot");
  zassert_ok(zplc_sched_debug_snapshot(0, &snapshot), "snapshot replacement");
  zassert_equal(snapshot.breakpoint_count, 0U,
                "replacement must not inherit breakpoints");
}

ZTEST(zplc_scheduler_admission, test_debug_mutation_waits_for_active_batch) {
  uint8_t program[PROGRAM_CAPACITY];
  zplc_sched_vm_snapshot_t snapshot;
  size_t size;

  clear_scheduler();
  size = build_program(program, 1U, ZPLC_TASK_CYCLIC, 1000U, 1U);
  zassert_equal(zplc_sched_load(program, size), 1, "load debug lock program");
  zplc_sched_test_hold_before_commit();
  zassert_ok(zplc_sched_start(), "start debug lock program");
  zassert_ok(zplc_sched_test_wait_before_commit(100),
             "batch did not reach hold");
  zplc_sched_test_reset_debug_before_mem();
  start_debug_thread(0, 0U);
  zassert_ok(zplc_sched_test_wait_debug_before_mem(100),
             "debug operation did not acquire control lock");
  zassert_equal(k_sem_count_get(&control_done), 0U,
                "debug mutation must wait for batch memory ownership");
  zplc_sched_test_release_before_commit();
  zassert_ok(k_sem_take(&control_done, K_MSEC(100)),
             "debug mutation did not drain");
  zassert_ok(k_thread_join(&control_thread, K_MSEC(100)),
             "debug thread did not terminate");
  zassert_ok(control_result, "add breakpoint after batch");
  zassert_ok(zplc_sched_debug_snapshot(0, &snapshot), "snapshot debug result");
  zassert_equal(snapshot.breakpoint_count, 1U, "breakpoint was not stored");
  zassert_equal(snapshot.breakpoints[0], 0U, "wrong breakpoint stored");
  zassert_ok(zplc_sched_stop(), "stop debug lock program");
}

ZTEST_SUITE(zplc_scheduler_admission, NULL, scheduler_setup, NULL, NULL,
            scheduler_teardown);
