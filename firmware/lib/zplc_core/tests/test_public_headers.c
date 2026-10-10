/**
 * @file test_public_headers.c
 * @brief RT-033: the public headers declare no test-only entry point.
 *
 * Every public header of the core is included with the macros that used to switch the test hooks on. Each name of
 * zplc_test_hook_names.def is then declared again as a type name. The compiler refuses a name that a public header
 * already declared as a function, so a hook that comes back into a public header stops this file from compiling.
 * The test hooks live in tests/include/zplc_test_hooks.h, which no product source includes.
 */

#define CONFIG_ZTEST 1
#define ZPLC_CORE_TESTING 1
#define ZPLC_HAL_PERSIST_TESTING 1

#include <stdio.h>

#include <zplc_comm_dispatch.h>
#include <zplc_core.h>
#include <zplc_debug.h>
#include <zplc_hal.h>
#include <zplc_hal_posix.h>
#include <zplc_isa.h>
#include <zplc_loader.h>
#include <zplc_retain.h>
#include <zplc_scheduler.h>

#define ZPLC_TEST_HOOK(name) typedef int name;
#include "zplc_test_hook_names.def"
#undef ZPLC_TEST_HOOK

int main(void) {
  printf("PASS: no public header declares a test-only entry point\n");
  return 0;
}
