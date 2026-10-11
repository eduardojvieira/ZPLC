/*
 * RT-024: the start-up plan. The scheduler, the program store and the control link start before any network or
 * cloud service, and a service that fails does not stop the runtime.
 *
 * zplc_boot_run() is the sequencer main() hands its plan to. These cases drive it with recording steps: the order
 * a plan runs in, what a failing step does to the steps after it, and the refusal of a plan that puts a runtime
 * step behind a service.
 */
#include <errno.h>
#include <string.h>

#include <zephyr/ztest.h>

#include <zplc_hal.h>

#include "runtime_boot.h"

/* The sequencer logs through the HAL; the suite does not link the HAL. */
void zplc_hal_log(const char *format, ...) { ARG_UNUSED(format); }

#define MAX_TRACE 16

static const char *trace[MAX_TRACE];
static size_t trace_count;

static void record(const char *name) {
  if (trace_count < MAX_TRACE) {
    trace[trace_count++] = name;
  }
}

#define STEP_FN(fn_name, label)                                                \
  static int fn_name(void) {                                                   \
    record(label);                                                             \
    return 0;                                                                  \
  }
STEP_FN(step_hal, "hal")
STEP_FN(step_core, "core")
STEP_FN(step_scheduler, "scheduler")
STEP_FN(step_store, "program_store")
STEP_FN(step_control, "control_link")
STEP_FN(step_network, "network")
STEP_FN(step_modbus, "modbus")
STEP_FN(step_cloud, "cloud")

static int step_failing_cloud(void) {
  record("cloud");
  return -EIO;
}

static int step_failing_network(void) {
  record("network");
  return -ENETDOWN;
}

static int step_failing_scheduler(void) {
  record("scheduler");
  return -ENOMEM;
}

static void before_each(void *fixture) {
  ARG_UNUSED(fixture);
  memset(trace, 0, sizeof(trace));
  trace_count = 0U;
}

static void assert_trace(const char *const *expected, size_t count) {
  size_t index;

  zassert_equal(trace_count, count, "ran %u steps, expected %u",
                (unsigned)trace_count, (unsigned)count);
  for (index = 0U; index < count; index++) {
    zassert_true(strcmp(trace[index], expected[index]) == 0,
                 "step %u was %s, expected %s", (unsigned)index, trace[index],
                 expected[index]);
  }
}

ZTEST(runtime_boot, test_runtime_steps_run_before_services_in_plan_order) {
  static const zplc_boot_step_t plan[] = {
      {"hal", ZPLC_BOOT_RUNTIME, step_hal},
      {"core", ZPLC_BOOT_RUNTIME, step_core},
      {"scheduler", ZPLC_BOOT_RUNTIME, step_scheduler},
      {"program_store", ZPLC_BOOT_RUNTIME, step_store},
      {"control_link", ZPLC_BOOT_RUNTIME, step_control},
      {"network", ZPLC_BOOT_SERVICE, step_network},
      {"modbus", ZPLC_BOOT_SERVICE, step_modbus},
      {"cloud", ZPLC_BOOT_SERVICE, step_cloud},
  };
  static const char *const expected[] = {"hal",     "core",         "scheduler", "program_store",
                                         "control_link", "network", "modbus",    "cloud"};
  zplc_boot_report_t report;

  zassert_equal(zplc_boot_run(plan, ARRAY_SIZE(plan), &report), 0, "plan runs");
  assert_trace(expected, ARRAY_SIZE(expected));
  zassert_equal(report.executed, ARRAY_SIZE(plan), "all steps executed");
  zassert_equal(report.service_failures, 0U, "no service failed");
}

ZTEST(runtime_boot, test_failing_services_do_not_stop_the_runtime) {
  static const zplc_boot_step_t plan[] = {
      {"hal", ZPLC_BOOT_RUNTIME, step_hal},
      {"scheduler", ZPLC_BOOT_RUNTIME, step_scheduler},
      {"network", ZPLC_BOOT_SERVICE, step_failing_network},
      {"modbus", ZPLC_BOOT_SERVICE, step_modbus},
      {"cloud", ZPLC_BOOT_SERVICE, step_failing_cloud},
  };
  static const char *const expected[] = {"hal", "scheduler", "network", "modbus", "cloud"};
  zplc_boot_report_t report;

  zassert_equal(zplc_boot_run(plan, ARRAY_SIZE(plan), &report), 0,
                "a service that fails is not a boot failure");
  assert_trace(expected, ARRAY_SIZE(expected));
  zassert_equal(report.executed, ARRAY_SIZE(plan), "every step still ran");
  zassert_equal(report.service_failures, 2U, "both failures are counted");
  zassert_equal(report.first_service_error, -ENETDOWN, "the first service error is kept");
}

ZTEST(runtime_boot, test_runtime_failure_stops_before_any_service) {
  static const zplc_boot_step_t plan[] = {
      {"hal", ZPLC_BOOT_RUNTIME, step_hal},
      {"scheduler", ZPLC_BOOT_RUNTIME, step_failing_scheduler},
      {"control_link", ZPLC_BOOT_RUNTIME, step_control},
      {"network", ZPLC_BOOT_SERVICE, step_network},
  };
  static const char *const expected[] = {"hal", "scheduler"};
  zplc_boot_report_t report;

  zassert_equal(zplc_boot_run(plan, ARRAY_SIZE(plan), &report), -ENOMEM,
                "the runtime failure is returned");
  assert_trace(expected, ARRAY_SIZE(expected));
  zassert_equal(report.failed_step, 1U, "the report names the step that failed");
}

ZTEST(runtime_boot, test_a_service_ahead_of_a_runtime_step_is_refused_before_anything_runs) {
  static const zplc_boot_step_t plan[] = {
      {"hal", ZPLC_BOOT_RUNTIME, step_hal},
      {"network", ZPLC_BOOT_SERVICE, step_network},
      {"scheduler", ZPLC_BOOT_RUNTIME, step_scheduler},
  };
  zplc_boot_report_t report;

  zassert_equal(zplc_boot_run(plan, ARRAY_SIZE(plan), &report), -EINVAL,
                "a plan that starts a service before the scheduler is refused");
  zassert_equal(trace_count, 0U, "and nothing of it ran");
}

ZTEST(runtime_boot, test_bad_arguments_are_refused) {
  static const zplc_boot_step_t plan[] = {{"hal", ZPLC_BOOT_RUNTIME, step_hal}};
  static const zplc_boot_step_t missing_fn[] = {{"hal", ZPLC_BOOT_RUNTIME, NULL}};

  zassert_equal(zplc_boot_run(NULL, 1U, NULL), -EINVAL, "no plan");
  zassert_equal(zplc_boot_run(missing_fn, 1U, NULL), -EINVAL, "a step without a function");
  zassert_equal(zplc_boot_run(plan, 1U, NULL), 0, "a report is optional");
}

ZTEST_SUITE(runtime_boot, NULL, NULL, before_each, NULL, NULL);
