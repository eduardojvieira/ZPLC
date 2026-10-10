/**
 * @file runtime_boot.h
 * @brief The start-up plan of the runtime: the runtime first, the services after it (RT-024).
 *
 * SPDX-License-Identifier: MIT
 *
 * main() describes the start-up as a list of steps. A step of the runtime class (hardware, core, scheduler,
 * program store, the restore of the stored program, the control link) must succeed: the first one that fails
 * stops the sequence and its error is returned. A step of the service class (network, time synchronisation, the
 * fieldbus servers, MQTT and cloud provisioning) may fail and the sequence goes on: a service that cannot start
 * is logged and counted, and the runtime that has already started keeps running. A plan that puts a runtime
 * step behind a service is refused before any step runs.
 */

#ifndef ZPLC_RUNTIME_BOOT_H
#define ZPLC_RUNTIME_BOOT_H

#include <stddef.h>

typedef enum {
  ZPLC_BOOT_RUNTIME = 0, /**< must succeed; the sequence stops at the first failure */
  ZPLC_BOOT_SERVICE = 1  /**< may fail; the failure is recorded and the sequence goes on */
} zplc_boot_class_t;

typedef struct {
  const char *name;
  zplc_boot_class_t boot_class;
  int (*run)(void); /**< 0 on success, a negative error otherwise */
} zplc_boot_step_t;

typedef struct {
  size_t executed;          /**< steps that ran */
  size_t service_failures;  /**< service steps that returned an error */
  int first_service_error;  /**< the error of the first of them; 0 when none */
  size_t failed_step;       /**< index of the runtime step that stopped the sequence; valid on a non-zero return */
} zplc_boot_report_t;

/**
 * @brief Run a start-up plan in order.
 *
 * @param steps   the plan
 * @param count   number of steps
 * @param report  optional result details
 * @return 0 when every runtime step succeeded (service failures do not count), the error of the runtime step that
 *         failed, or -EINVAL for a missing plan, a step without a function, or a runtime step after a service.
 */
int zplc_boot_run(const zplc_boot_step_t *steps, size_t count,
                  zplc_boot_report_t *report);

#endif /* ZPLC_RUNTIME_BOOT_H */
