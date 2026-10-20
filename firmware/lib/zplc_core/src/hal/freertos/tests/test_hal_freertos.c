/**
 * @file test_hal_freertos.c
 * @brief IO-016, IO-013: the HAL of the FreeRTOS port on the kernel: the clock, the sleep, the locks and the storage.
 *
 * SPDX-License-Identifier: MIT
 *
 * The port timing suite measures the clock against itself (test_port_timing.c); the program store and the retentive
 * memory suites cut the power at every operation of the storage. This file holds the rest of the HAL contract that
 * a port can get wrong without those noticing: that the tick is the kernel's, that a sleep blocks only the task that
 * made it, that a mutex excludes another task, and the result codes of the storage.
 */

#define _POSIX_C_SOURCE 200809L

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#include <FreeRTOS.h>
#include <task.h>

#include <zplc_hal.h>
#include <zplc_hal_posix.h>

#include "zplc_freertos_port.h"

static int test_count = 0;
static int fail_count = 0;

#define CHECK(cond, msg)                                                       \
  do {                                                                         \
    test_count++;                                                              \
    if (!(cond)) {                                                             \
      fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__);                  \
      fail_count++;                                                            \
    } else {                                                                   \
      printf("PASS: %s\n", msg);                                               \
    }                                                                          \
  } while (0)

/* ---- the clock ---------------------------------------------------------------------------------------------------- */

static void test_the_tick_is_the_kernels(void) {
  const uint32_t before = zplc_hal_tick();
  const TickType_t kernel_before = xTaskGetTickCount();
  uint32_t after;

  printf("\n=== Test: the tick is the tick of the kernel ===\n");
  zplc_hal_sleep(25U);
  after = zplc_hal_tick();
  CHECK((uint32_t)(after - before) >= 25U, "a sleep of 25 ms advances the tick by at least 25 ms");
  CHECK((uint32_t)(xTaskGetTickCount() - kernel_before) >= 25U, "and the tick count of the kernel by at least 25 ticks");
  CHECK(portTICK_PERIOD_MS == 1U, "the tick is 1 ms (FreeRTOSConfig.h)");
  zplc_hal_posix_set_tick_override(123456U);
  CHECK(zplc_hal_tick() == 123456U, "the logical clock of a scenario replaces it");
  zplc_hal_posix_clear_tick_override();
  CHECK(zplc_hal_tick() != 123456U, "and clearing it restores the kernel's");
  zplc_hal_sleep(0U);
  CHECK(1, "a sleep of 0 returns");
}

/* The microsecond clock of the scheduler counts the same time as the tick, within what the simulator can promise. */
static void test_the_microsecond_clock_is_monotonic(void) {
  const uint64_t a = zplc_freertos_now_us();
  uint64_t b;

  printf("\n=== Test: the microsecond clock ===\n");
  zplc_hal_sleep(5U);
  b = zplc_freertos_now_us();
  CHECK(b > a, "it advances");
  CHECK(b - a >= 1000U, "by at least a millisecond across a sleep of five kernel ticks");
}

/* ---- the sleep blocks only its task --------------------------------------------------------------------------------- */

static volatile uint32_t spinner_counter;
static volatile int spinner_stop;

static void spinner_task(void *arg) {
  (void)arg;
  while (spinner_stop == 0) {
    spinner_counter++;
    taskYIELD();
  }
  spinner_stop = 2;
  vTaskDelete(NULL);
}

static void test_a_sleep_lets_another_task_run(void) {
  uint32_t seen;

  printf("\n=== Test: a sleeping task leaves the processor to the others ===\n");
  spinner_counter = 0U;
  spinner_stop = 0;
  CHECK(xTaskCreate(spinner_task, "spinner", 4096, NULL, tskIDLE_PRIORITY + 1U, NULL) == pdPASS, "a second task starts");
  zplc_hal_sleep(30U);
  seen = spinner_counter;
  spinner_stop = 1;
  zplc_hal_sleep(20U);
  CHECK(seen > 0U, "it ran while this task slept");
  CHECK(spinner_stop == 2, "and it ended when told to");
}

/* ---- the locks ------------------------------------------------------------------------------------------------------ */

static zplc_hal_mutex_t shared_lock;
static volatile int holder_has_lock;
static volatile int holder_release;
static volatile int holder_done;

static void holder_task(void *arg) {
  (void)arg;
  (void)zplc_hal_mutex_lock(shared_lock);
  holder_has_lock = 1;
  while (holder_release == 0) {
    zplc_hal_sleep(2U);
  }
  (void)zplc_hal_mutex_unlock(shared_lock);
  holder_done = 1;
  vTaskDelete(NULL);
}

static volatile uint32_t release_delay_ms;

static void releaser_task(void *arg) {
  (void)arg;
  zplc_hal_sleep(release_delay_ms);
  holder_release = 1;
  vTaskDelete(NULL);
}

static void release_holder_after(uint32_t ms) {
  release_delay_ms = ms;
  (void)xTaskCreate(releaser_task, "releaser", 4096, NULL, tskIDLE_PRIORITY + 1U, NULL);
}

static void test_a_mutex_excludes_another_task(void) {
  uint32_t waited_from;
  uint32_t waited;

  printf("\n=== Test: a mutex excludes another task ===\n");
  shared_lock = zplc_hal_mutex_create();
  CHECK(shared_lock != NULL, "a mutex is created");
  holder_has_lock = 0;
  holder_release = 0;
  holder_done = 0;
  CHECK(xTaskCreate(holder_task, "holder", 4096, NULL, tskIDLE_PRIORITY + 1U, NULL) == pdPASS, "the holder starts");
  while (holder_has_lock == 0) {
    zplc_hal_sleep(1U);
  }
  waited_from = zplc_hal_tick();
  /* This task cannot both wait for the lock and release its holder: a third task lets the holder go after 40 ms. */
  release_holder_after(40U);
  CHECK(zplc_hal_mutex_lock(shared_lock) == ZPLC_HAL_OK, "the lock is taken once the holder lets go");
  waited = zplc_hal_tick() - waited_from;
  CHECK(waited >= 30U, "this task waited for the holder, at least most of its 40 ms");
  CHECK(zplc_hal_mutex_unlock(shared_lock) == ZPLC_HAL_OK, "and unlocks");
  CHECK(zplc_hal_mutex_lock(NULL) == ZPLC_HAL_ERROR && zplc_hal_mutex_unlock(NULL) == ZPLC_HAL_ERROR &&
            zplc_hal_mutex_destroy(NULL) == ZPLC_HAL_ERROR,
        "a NULL mutex is an error");
  while (holder_done == 0) {
    zplc_hal_sleep(1U);
  }
  CHECK(zplc_hal_mutex_destroy(shared_lock) == ZPLC_HAL_OK, "the mutex is destroyed");
}

/* ---- the storage ---------------------------------------------------------------------------------------------------- */

static void remove_tree(const char *dir) {
  char path[300];
  const char *names[] = {"alpha.bin", "foo_bar.bin", "empty.bin", "alpha.bin.tmp"};
  size_t index;

  for (index = 0U; index < sizeof(names) / sizeof(names[0]); index++) {
    (void)snprintf(path, sizeof(path), "%s/%s", dir, names[index]);
    (void)unlink(path);
  }
  (void)rmdir(dir);
}

static void test_the_storage_result_codes(void) {
  char dir[] = "/tmp/zplc-freertos-persist-XXXXXX";
  char path[300];
  uint8_t saved[4] = {0x2AU, 0x00U, 0x00U, 0x01U};
  uint8_t loaded[8] = {0};
  uint8_t small[2] = {0};
  struct stat info;
  FILE *file;

  printf("\n=== Test: the storage keeps a record whole and reports what it cannot ===\n");
  CHECK(mkdtemp(dir) != NULL, "a directory for the records");
  CHECK(setenv("ZPLC_PERSIST_ROOT", dir, 1) == 0, "ZPLC_PERSIST_ROOT names it");

  CHECK(zplc_hal_persist_load("alpha", loaded, sizeof(loaded)) == ZPLC_HAL_NOT_IMPL, "a key never saved is not found");
  CHECK(zplc_hal_persist_save("alpha", saved, sizeof(saved)) == ZPLC_HAL_OK, "a record is saved");
  CHECK(zplc_hal_persist_load("alpha", loaded, sizeof(loaded)) == ZPLC_HAL_OK && memcmp(loaded, saved, 4U) == 0,
        "and loaded into a larger buffer");
  (void)snprintf(path, sizeof(path), "%s/alpha.bin.tmp", dir);
  CHECK(stat(path, &info) != 0, "no temporary file is left behind");
  CHECK(zplc_hal_persist_load("alpha", small, sizeof(small)) == ZPLC_HAL_CORRUPT, "a record larger than the buffer is corrupt");
  saved[0] = 0x2BU;
  CHECK(zplc_hal_persist_save("alpha", saved, sizeof(saved)) == ZPLC_HAL_OK, "a second save replaces the first");
  CHECK(zplc_hal_persist_load("alpha", loaded, sizeof(loaded)) == ZPLC_HAL_OK && loaded[0] == 0x2BU, "whole");

  CHECK(zplc_hal_persist_save("foo/bar", saved, 2U) == ZPLC_HAL_OK, "a key with a slash is accepted");
  (void)snprintf(path, sizeof(path), "%s/foo_bar.bin", dir);
  CHECK(stat(path, &info) == 0, "it is stored under a flat name");

  (void)snprintf(path, sizeof(path), "%s/empty.bin", dir);
  file = fopen(path, "wb");
  CHECK(file != NULL, "an empty record is made by hand");
  if (file != NULL) {
    (void)fclose(file);
  }
  CHECK(zplc_hal_persist_load("empty", loaded, sizeof(loaded)) == ZPLC_HAL_CORRUPT, "an empty record is corrupt");

  CHECK(zplc_hal_persist_save(NULL, saved, 4U) == ZPLC_HAL_ERROR && zplc_hal_persist_save("alpha", NULL, 4U) == ZPLC_HAL_ERROR &&
            zplc_hal_persist_save("alpha", saved, 0U) == ZPLC_HAL_ERROR,
        "a save with no key, no data or no length is an error");
  CHECK(zplc_hal_persist_delete("alpha") == ZPLC_HAL_OK, "a record is deleted");
  CHECK(zplc_hal_persist_delete("alpha") == ZPLC_HAL_NOT_IMPL, "deleting it again says it is not there");
  CHECK(zplc_hal_persist_load("alpha", loaded, sizeof(loaded)) == ZPLC_HAL_NOT_IMPL, "and loading it says so");
  remove_tree(dir);
  (void)unsetenv("ZPLC_PERSIST_ROOT");
}

int main(void) {
  printf("ZPLC port conformance: HAL on the kernel (FreeRTOS)\n");
  CHECK(zplc_hal_init() == ZPLC_HAL_OK, "the HAL starts");
  test_the_tick_is_the_kernels();
  test_the_microsecond_clock_is_monotonic();
  test_a_sleep_lets_another_task_run();
  test_a_mutex_excludes_another_task();
  test_the_storage_result_codes();
  CHECK(zplc_hal_shutdown() == ZPLC_HAL_OK, "the HAL stops");
  printf("\n%d checks, %d failed\n", test_count, fail_count);
  return fail_count == 0 ? 0 : 1;
}
