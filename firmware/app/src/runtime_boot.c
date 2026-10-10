/**
 * @file runtime_boot.c
 * @brief The start-up sequencer (RT-024). See runtime_boot.h.
 */

#include "runtime_boot.h"

#include <errno.h>
#include <string.h>

#include <zplc_hal.h>

int zplc_boot_run(const zplc_boot_step_t *steps, size_t count,
                  zplc_boot_report_t *report) {
  zplc_boot_report_t local;
  zplc_boot_report_t *out = report != NULL ? report : &local;
  size_t index;
  int seen_service = 0;

  memset(out, 0, sizeof(*out));
  if (steps == NULL || count == 0U) {
    return -EINVAL;
  }
  /* The whole plan is checked before the first step runs: a misordered plan starts nothing. */
  for (index = 0U; index < count; index++) {
    if (steps[index].run == NULL || steps[index].name == NULL) {
      return -EINVAL;
    }
    if (steps[index].boot_class == ZPLC_BOOT_SERVICE) {
      seen_service = 1;
    } else if (seen_service != 0) {
      zplc_hal_log("[BOOT] plan error: runtime step '%s' follows a service\n",
                   steps[index].name);
      return -EINVAL;
    }
  }

  for (index = 0U; index < count; index++) {
    const zplc_boot_step_t *step = &steps[index];
    int result = step->run();

    out->executed++;
    if (result == 0) {
      zplc_hal_log("[BOOT] %zu/%zu %s: ok\n", index + 1U, count, step->name);
      continue;
    }
    if (step->boot_class == ZPLC_BOOT_RUNTIME) {
      zplc_hal_log("[BOOT] %zu/%zu %s: FAILED (%d); the runtime cannot start\n",
                   index + 1U, count, step->name, result);
      out->failed_step = index;
      return result;
    }
    zplc_hal_log("[BOOT] %zu/%zu %s: failed (%d); the runtime goes on without it\n",
                 index + 1U, count, step->name, result);
    if (out->service_failures == 0U) {
      out->first_service_error = result;
    }
    out->service_failures++;
  }
  return 0;
}
