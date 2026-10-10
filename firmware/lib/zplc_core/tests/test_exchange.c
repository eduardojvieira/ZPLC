/**
 * @file test_exchange.c
 * @brief The exchange between the scan and the threads outside it (RT-010, RT-011, RT-012).
 *
 * SPDX-License-Identifier: MIT
 *
 * The write queue is applied at the input latch and through the force-aware interface of the core; reads come
 * from the snapshot published at the commit. The last test runs a scanner and several readers and writers on
 * threads: the scanner writes multi-byte values one byte at a time with the other threads running, which a reader
 * of the live memory would see half written, and a reader of the exchange never does.
 */

#define _POSIX_C_SOURCE 200809L

#include <pthread.h>
#include <sched.h>
#include <stdio.h>
#include <string.h>

#include <zplc_core.h>
#include <zplc_exchange.h>
#include <zplc_hal.h>
#include <zplc_isa.h>

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

#define VAR (ZPLC_MEM_WORK_BASE + 0x40U)
#define OTHER (ZPLC_MEM_WORK_BASE + 0x80U)

static int scanning;
static int scan_active(void) { return scanning; }

static int image_locks;
static int image_unlocks;
static int lock_image(void) {
  image_locks++;
  return 0;
}
static void unlock_image(void) { image_unlocks++; }

static uint8_t *live(uint16_t addr) {
  return zplc_mem_get_region(ZPLC_MEM_WORK_BASE) + (addr - ZPLC_MEM_WORK_BASE);
}

static void start(int active) {
  zplc_exchange_hooks_t hooks;

  zplc_core_cold_start();
  memset(&hooks, 0, sizeof(hooks));
  hooks.scan_active = scan_active;
  hooks.lock_image = lock_image;
  hooks.unlock_image = unlock_image;
  scanning = active;
  image_locks = 0;
  image_unlocks = 0;
  CHECK(zplc_exchange_init(&hooks) == 0, "the exchange initialises");
}

static void test_idle_writes_apply_at_once(void) {
  const uint8_t value[4] = {1U, 2U, 3U, 4U};
  uint8_t back[4];
  zplc_exchange_stats_t stats;

  printf("\n=== Test: with no scan running a write is applied and published at once ===\n");
  start(0);
  CHECK(zplc_exchange_write(VAR, value, 4U) == 0, "a write");
  CHECK(memcmp(live(VAR), value, 4U) == 0, "is in the live memory");
  CHECK(zplc_exchange_read(VAR, back, 4U) == 0 && memcmp(back, value, 4U) == 0, "and in the snapshot");
  CHECK(image_locks == 1 && image_unlocks == 1, "taken under the image lock, which is released");
  zplc_exchange_get_stats(&stats);
  CHECK(stats.immediate == 1U && stats.latched == 0U, "counted as an immediate write");
}

static void test_running_writes_wait_for_the_latch(void) {
  const uint8_t value[4] = {9U, 8U, 7U, 6U};
  uint8_t back[4] = {0};

  printf("\n=== Test: while scans run a write waits for the input latch; a read sees the last commit ===\n");
  start(1);
  CHECK(zplc_exchange_write(VAR, value, 4U) == 0, "a write is accepted");
  CHECK(live(VAR)[0] == 0U, "the live memory is untouched by it");
  CHECK(zplc_exchange_read(VAR, back, 4U) == 0 && back[0] == 0U, "a read still sees the snapshot");
  CHECK(image_locks == 0, "the image lock was not needed");
  CHECK(zplc_exchange_latch() == 1U, "the latch applies one write");
  CHECK(memcmp(live(VAR), value, 4U) == 0, "the live memory has it");
  CHECK(zplc_exchange_read(VAR, back, 4U) == 0 && back[0] == 0U,
        "and a read still sees the commit before it: the snapshot changes at the next publication");
  zplc_exchange_publish();
  CHECK(zplc_exchange_read(VAR, back, 4U) == 0 && memcmp(back, value, 4U) == 0, "published");
}

static void test_a_forced_variable_keeps_its_value(void) {
  const uint8_t forced[2] = {0xAAU, 0xBBU};
  const uint8_t value[2] = {0x01U, 0x02U};
  uint8_t back[2];

  printf("\n=== Test: an external write never changes a forced variable (RT-011) ===\n");
  start(1);
  CHECK(zplc_force_set_bytes(VAR, forced, 2U) == 0, "a variable is forced");
  CHECK(zplc_exchange_write(VAR, value, 2U) == 0, "a write to it is accepted");
  (void)zplc_exchange_latch();
  CHECK(memcmp(live(VAR), forced, 2U) == 0, "and the forced value is what the memory holds");
  zplc_exchange_publish();
  CHECK(zplc_exchange_read(VAR, back, 2U) == 0 && memcmp(back, forced, 2U) == 0, "and what a reader gets");

  /* An idle runtime applies at once, and the force holds as well. */
  scanning = 0;
  CHECK(zplc_exchange_write(VAR, value, 2U) == 0, "an idle write to it is accepted");
  CHECK(memcmp(live(VAR), forced, 2U) == 0, "and does not change it");
}

static void test_extents_are_checked_when_the_write_is_made(void) {
  const uint8_t value[8] = {0};
  uint8_t out[8];

  printf("\n=== Test: an extent outside PLC memory is refused at the call ===\n");
  start(1);
  CHECK(zplc_exchange_write(0xFFFEU, value, 4U) == ZPLC_EXCHANGE_ERR_RANGE, "past the end of the address space");
  CHECK(zplc_exchange_write(ZPLC_MEM_OPI_BASE - 2U, value, 4U) == ZPLC_EXCHANGE_ERR_RANGE,
        "across the boundary of two regions");
  CHECK(zplc_exchange_write(VAR, value, 0U) == ZPLC_EXCHANGE_ERR_RANGE, "of no bytes");
  CHECK(zplc_exchange_write(VAR, NULL, 4U) == ZPLC_EXCHANGE_ERR_RANGE, "with no data");
  CHECK(zplc_exchange_read(0xFFFEU, out, 4U) == ZPLC_EXCHANGE_ERR_RANGE, "the same for a read");
  CHECK(zplc_exchange_latch() == 0U, "and nothing was queued");
}

static void test_the_queue_is_bounded_and_whole(void) {
  uint8_t chunk[200];
  unsigned queued = 0U;
  zplc_exchange_stats_t stats;

  printf("\n=== Test: a full queue refuses a whole write; a reservation is all or nothing ===\n");
  start(1);
  memset(chunk, 0x5A, sizeof(chunk));
  while (zplc_exchange_write(OTHER, chunk, sizeof(chunk)) == 0) {
    queued++;
    if (queued > 100U) {
      break;
    }
  }
  CHECK(queued == ZPLC_EXCHANGE_QUEUE_BYTES / (sizeof(chunk) + 4U), "as many writes as the queue holds");
  zplc_exchange_get_stats(&stats);
  CHECK(stats.refused >= 1U, "the refusals are counted");
  (void)zplc_exchange_latch();
  CHECK(zplc_exchange_write(OTHER, chunk, sizeof(chunk)) == 0, "after a latch there is room again");
  (void)zplc_exchange_latch();

  /* A batch that does not fit queues nothing. */
  CHECK(zplc_exchange_write_begin(1000U, 4000U) == ZPLC_EXCHANGE_ERR_FULL, "a reservation larger than the queue is refused");
  CHECK(zplc_exchange_latch() == 0U, "and nothing of it is queued");

  /* A batch that fits is applied in order at the latch, and a later write to the same bytes wins. */
  {
    const uint8_t first[2] = {1U, 1U};
    const uint8_t second[2] = {2U, 2U};
    const uint8_t third[2] = {3U, 3U};

    CHECK(zplc_exchange_write_begin(3U, 6U) == 0, "a batch of three writes");
    CHECK(zplc_exchange_write_add(VAR, first, 2U) == 0 && zplc_exchange_write_add(VAR + 2U, second, 2U) == 0 &&
              zplc_exchange_write_add(VAR, third, 2U) == 0,
          "is added");
    zplc_exchange_write_end();
    CHECK(zplc_exchange_latch() == 3U, "applied at the latch");
    CHECK(live(VAR)[0] == 3U && live(VAR)[2] == 2U, "in order");
  }
}

/* ------------------------------------------------------------------------- */
/* The concurrency test                                                        */
/* ------------------------------------------------------------------------- */

#define SCANS 6000U

static volatile int stop_threads;
static volatile unsigned torn_through_exchange;
static volatile unsigned torn_live;
static volatile unsigned latched_inconsistent;
static volatile unsigned reads_done;

static void *scanner(void *arg) {
  unsigned scan;
  uint8_t *a = live(VAR);
  uint8_t *b = live(OTHER);
  (void)arg;

  for (scan = 1U; scan <= SCANS; scan++) {
    unsigned index;
    const uint8_t pattern = (uint8_t)scan;

    /* Input latch: queued writes land, whole. A writer's value is four equal bytes. */
    (void)zplc_exchange_latch();
    {
      const uint8_t *written = live(OTHER + 16U);

      if (written[0] != written[1] || written[1] != written[2] || written[2] != written[3]) {
        latched_inconsistent++;
      }
    }
    /* The task: a 4-byte value and its mirror, written one byte at a time with the other threads running. */
    for (index = 0U; index < 4U; index++) {
      a[index] = pattern;
      sched_yield();
    }
    for (index = 0U; index < 4U; index++) {
      b[index] = pattern;
      sched_yield();
    }
    /* Commit: the scan's image is whole, and published. */
    zplc_exchange_publish();
  }
  stop_threads = 1;
  return NULL;
}

static void *exchange_reader(void *arg) {
  (void)arg;
  while (stop_threads == 0) {
    uint8_t value[4];
    uint8_t mirror[4];

    /* One request that reads two tags: both from the same publication. */
    if (zplc_exchange_read_lock() == 0) {
      (void)zplc_exchange_read_locked(VAR, value, 4U);
      (void)zplc_exchange_read_locked(OTHER, mirror, 4U);
      zplc_exchange_read_unlock();
      if (value[0] != value[1] || value[1] != value[2] || value[2] != value[3] ||
          memcmp(value, mirror, 4U) != 0) {
        torn_through_exchange++;
      }
      reads_done++;
    }
    sched_yield();
  }
  return NULL;
}

static void *raw_reader(void *arg) {
  const volatile uint8_t *a = live(VAR);
  const volatile uint8_t *b = live(OTHER);
  (void)arg;

  while (stop_threads == 0) {
    if (a[0] != a[3] || a[1] != a[2] || a[0] != b[0] || a[0] != b[3]) {
      torn_live++;
    }
    sched_yield();
  }
  return NULL;
}

static void *writer(void *arg) {
  uint8_t pattern = 1U;
  (void)arg;

  while (stop_threads == 0) {
    uint8_t value[4];

    memset(value, pattern, sizeof(value));
    (void)zplc_exchange_write(OTHER + 16U, value, 4U);
    pattern++;
    sched_yield();
  }
  return NULL;
}

static void test_no_value_is_observed_half_written(void) {
  pthread_t scan_thread;
  pthread_t readers[2];
  pthread_t raw_thread;
  pthread_t writers[2];
  size_t index;
  zplc_exchange_stats_t stats;

  printf("\n=== Test: no multi-byte value is observed half written (RT-010) ===\n");
  start(1);
  stop_threads = 0;
  torn_through_exchange = 0U;
  torn_live = 0U;
  latched_inconsistent = 0U;
  reads_done = 0U;

  for (index = 0U; index < 2U; index++) {
    (void)pthread_create(&readers[index], NULL, exchange_reader, NULL);
    (void)pthread_create(&writers[index], NULL, writer, NULL);
  }
  (void)pthread_create(&raw_thread, NULL, raw_reader, NULL);
  (void)pthread_create(&scan_thread, NULL, scanner, NULL);
  (void)pthread_join(scan_thread, NULL);
  for (index = 0U; index < 2U; index++) {
    (void)pthread_join(readers[index], NULL);
    (void)pthread_join(writers[index], NULL);
  }
  (void)pthread_join(raw_thread, NULL);

  zplc_exchange_get_stats(&stats);
  CHECK(reads_done > 100U, "the readers ran against the scanner (many reads)");
  CHECK(torn_live > 0U,
        "a reader of the live memory does see half written values: the scanner really interleaves with the others");
  CHECK(torn_through_exchange == 0U, "and a reader of the exchange never does");
  CHECK(latched_inconsistent == 0U, "a queued write lands whole at the latch, never mixed with another");
  CHECK(stats.latched > 0U && stats.publications >= SCANS, "writes were applied at latches, once per scan");
  printf("  reads=%u torn_live=%u latched=%u refused=%u publications=%u\n", reads_done, torn_live,
         (unsigned)stats.latched, (unsigned)stats.refused, (unsigned)stats.publications);
}

int main(void) {
  CHECK(zplc_core_init() == 0, "core init");
  test_idle_writes_apply_at_once();
  test_running_writes_wait_for_the_latch();
  test_a_forced_variable_keeps_its_value();
  test_extents_are_checked_when_the_write_is_made();
  test_the_queue_is_bounded_and_whole();
  test_no_value_is_observed_half_written();
  printf("\n%d checks, %d failed\n", test_count, fail_count);
  return fail_count == 0 ? 0 : 1;
}
