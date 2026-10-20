/**
 * @file test_runner_exit_code.c
 * @brief IO-016: a suite that fails must fail the run, because the runner passes the result of main() to the process.
 *
 * SPDX-License-Identifier: MIT
 *
 * zplc_freertos_suite_main.c calls the renamed main() from a task and exits with its result. If it ever dropped the
 * result, every suite of the port would pass whatever it found. This suite returns 1; ctest runs it with WILL_FAIL, so
 * the port's run is green only while the runner reports that failure.
 */

#include <stdio.h>

int main(void) {
  fprintf(stderr, "FAIL: this suite fails on purpose (the runner must pass the failure on)\n");
  return 1;
}
