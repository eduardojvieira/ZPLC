/*
 * SPDX-License-Identifier: MIT
 *
 * Runs one plain C core suite (selected at build time) and reports its result.
 *
 * With CONFIG_ZTEST the suite runs inside a ztest case, so Twister, the ztest
 * harness and the exit code all see its result. Targets whose RAM cannot hold
 * the ztest thread as well (qemu_cortex_m0, 16 KB) build with CONFIG_ZTEST=n:
 * the suite runs from main(), prints one verdict line the console harness
 * matches, and a failure raises a fatal error so Twister stops at once.
 */
#ifdef CONFIG_ZTEST

#include <zephyr/ztest.h>

extern int zplc_core_suite_main(void);

ZTEST(zplc_core_suite, test_suite_reports_no_failure)
{
  zassert_equal(zplc_core_suite_main(), 0,
                "core suite '" ZPLC_CORE_SUITE_NAME "' reported failures");
}

ZTEST_SUITE(zplc_core_suite, NULL, NULL, NULL, NULL, NULL);

#else

#include <stdio.h>
#include <zephyr/kernel.h>

extern int zplc_core_suite_main(void);

int main(void)
{
  int failures = zplc_core_suite_main();

  if (failures != 0) {
    printf("ZPLC_CORE_SUITE " ZPLC_CORE_SUITE_NAME ": FAIL\n");
    k_oops();
  }
  printf("ZPLC_CORE_SUITE " ZPLC_CORE_SUITE_NAME ": PASS\n");
  return 0;
}

#endif
