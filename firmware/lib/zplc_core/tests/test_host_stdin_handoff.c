/*
 * The stdin hand-off between the Windows reader thread and the request waiter
 * (host_stdin_handoff.c). The same rules run here on POSIX primitives: a wake-up is never
 * lost between the check and the wait, end of input wakes a waiter, and bytes come out in
 * order across partial reads, also when the buffer fills up.
 */
#include "host_stdin_handoff.h"

#include <pthread.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

static int test_count = 0;
static int fail_count = 0;

#define TEST_ASSERT(cond, msg)                                \
  do {                                                        \
    test_count++;                                             \
    if (!(cond)) {                                            \
      fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__); \
      fail_count++;                                           \
    } else {                                                  \
      printf("PASS: %s\n", msg);                              \
    }                                                         \
  } while (0)

static zplc_host_handoff_t handoff;
static char line[ZPLC_HOST_STDIO_PENDING_MAX];

static long now_ms(void) {
  struct timespec now;

  (void)clock_gettime(CLOCK_MONOTONIC, &now);
  return ((long)now.tv_sec * 1000L) + ((long)now.tv_nsec / 1000000L);
}

static void sleep_ms(long ms) {
  struct timespec pause;

  pause.tv_sec = (time_t)(ms / 1000L);
  pause.tv_nsec = (ms % 1000L) * 1000000L;
  (void)nanosleep(&pause, NULL);
}

static void put_all(const char *text) {
  const size_t count = strlen(text);

  TEST_ASSERT(zplc_host_handoff_put(&handoff, text, count) == count, "the reader appends the bytes");
}

static void test_wake_up_between_check_and_wait(void) {
  zplc_host_stdio_result_t result = ZPLC_HOST_STDIO_TIMEOUT;

  printf("\n=== Test: a wake-up between the check and the wait is not lost ===\n");
  TEST_ASSERT(zplc_host_handoff_init(&handoff) == 0, "init succeeds");
  TEST_ASSERT(zplc_host_handoff_take(&handoff, line, sizeof(line), &result) == 0, "nothing to take yet");
  TEST_ASSERT(zplc_host_handoff_wait(&handoff, 0U) == 0, "an empty hand-off does not signal");

  /* The waiter checked and found nothing; the bytes land before it waits. */
  TEST_ASSERT(zplc_host_handoff_take(&handoff, line, sizeof(line), &result) == 0, "the check finds nothing");
  put_all("{\"id\":1}\n");
  TEST_ASSERT(zplc_host_handoff_wait(&handoff, 0U) == 1, "the wait after the check still sees the append");
  TEST_ASSERT(zplc_host_handoff_take(&handoff, line, sizeof(line), &result) == 1 && result == ZPLC_HOST_STDIO_READY &&
                  strcmp(line, "{\"id\":1}\n") == 0,
              "the line is handed out");

  /* A partial line wakes once, then the waiter sleeps until more arrives instead of spinning. */
  put_all("{\"id\"");
  TEST_ASSERT(zplc_host_handoff_wait(&handoff, 0U) == 1, "a partial line signals");
  TEST_ASSERT(zplc_host_handoff_take(&handoff, line, sizeof(line), &result) == 0, "a partial line is not handed out");
  TEST_ASSERT(zplc_host_handoff_wait(&handoff, 0U) == 0, "a checked partial line does not signal again");
  put_all(":2}\n");
  TEST_ASSERT(zplc_host_handoff_wait(&handoff, 0U) == 1, "the rest of the line signals");
  TEST_ASSERT(zplc_host_handoff_take(&handoff, line, sizeof(line), &result) == 1 && result == ZPLC_HOST_STDIO_READY &&
                  strcmp(line, "{\"id\":2}\n") == 0,
              "the joined line is handed out");
  zplc_host_handoff_destroy(&handoff);
}

static void *close_later(void *arg) {
  (void)arg;
  sleep_ms(50L);
  zplc_host_handoff_close(&handoff, 0);
  return NULL;
}

static void test_eof_wakes_a_waiter(void) {
  pthread_t closer;
  long started;
  long waited;
  int woke;
  zplc_host_stdio_result_t result = ZPLC_HOST_STDIO_TIMEOUT;

  printf("\n=== Test: end of input wakes a blocked waiter ===\n");
  TEST_ASSERT(zplc_host_handoff_init(&handoff) == 0, "init succeeds");
  TEST_ASSERT(pthread_create(&closer, NULL, close_later, NULL) == 0, "the closing thread starts");
  started = now_ms();
  woke = zplc_host_handoff_wait(&handoff, 5000U);
  waited = now_ms() - started;
  (void)pthread_join(closer, NULL);
  TEST_ASSERT(woke == 1, "the waiter is woken");
  TEST_ASSERT(waited < 2000L, "the waiter wakes on the close, not on its timeout");
  TEST_ASSERT(zplc_host_handoff_take(&handoff, line, sizeof(line), &result) == 1 && result == ZPLC_HOST_STDIO_EOF,
              "the waiter sees end of input");
  TEST_ASSERT(zplc_host_handoff_wait(&handoff, 0U) == 1, "end of input stays signalled");
  zplc_host_handoff_destroy(&handoff);

  printf("\n=== Test: an unfinished line at end of input, then a read error ===\n");
  TEST_ASSERT(zplc_host_handoff_init(&handoff) == 0, "init succeeds");
  put_all("half");
  zplc_host_handoff_close(&handoff, 1);
  TEST_ASSERT(zplc_host_handoff_take(&handoff, line, sizeof(line), &result) == 1 && result == ZPLC_HOST_STDIO_ERROR &&
                  strcmp(line, "half") == 0,
              "the unfinished tail is an ERROR piece");
  TEST_ASSERT(zplc_host_handoff_take(&handoff, line, sizeof(line), &result) == 1 && result == ZPLC_HOST_STDIO_ERROR && line[0] == '\0',
              "the read error is reported once");
  TEST_ASSERT(zplc_host_handoff_take(&handoff, line, sizeof(line), &result) == 1 && result == ZPLC_HOST_STDIO_EOF, "then end of input");
  zplc_host_handoff_destroy(&handoff);
}

/* 3000 lines of 100 bytes: three times the buffer, so the reader must wait for room. */
#define LINE_COUNT 3000
#define LINE_BYTES 100
#define CHUNK_BYTES 7U

static void *produce(void *arg) {
  char text[LINE_BYTES + 1];
  size_t offset;
  int index;

  (void)arg;
  for (index = 0; index < LINE_COUNT; index++) {
    (void)snprintf(text, sizeof(text), "%06d%093d\n", index, 0);
    offset = 0U;
    while (offset < LINE_BYTES) {
      size_t room = zplc_host_handoff_wait_room(&handoff);
      size_t count = LINE_BYTES - offset;

      if (room == 0U) {
        return NULL;
      }
      if (count > CHUNK_BYTES) {
        count = CHUNK_BYTES;
      }
      if (count > room) {
        count = room;
      }
      if (zplc_host_handoff_put(&handoff, text + offset, count) != count) {
        return NULL;
      }
      offset += count;
    }
  }
  zplc_host_handoff_close(&handoff, 0);
  return NULL;
}

static void test_bytes_in_order(void) {
  pthread_t producer;
  char expected[LINE_BYTES + 1];
  int index = 0;
  int in_order = 1;
  int ended = 0;
  const long deadline = now_ms() + 10000L;
  zplc_host_stdio_result_t result = ZPLC_HOST_STDIO_TIMEOUT;

  printf("\n=== Test: bytes come out in order across partial reads and a full buffer ===\n");
  TEST_ASSERT(zplc_host_handoff_init(&handoff) == 0, "init succeeds");
  TEST_ASSERT(pthread_create(&producer, NULL, produce, NULL) == 0, "the reader thread starts");
  sleep_ms(50L); /* let the reader fill the buffer */
  while (ended == 0 && now_ms() < deadline) {
    if (zplc_host_handoff_take(&handoff, line, sizeof(line), &result) == 0) {
      (void)zplc_host_handoff_wait(&handoff, 100U);
      continue;
    }
    if (result == ZPLC_HOST_STDIO_EOF) {
      ended = 1;
      continue;
    }
    (void)snprintf(expected, sizeof(expected), "%06d%093d\n", index, 0);
    if (result != ZPLC_HOST_STDIO_READY || strcmp(line, expected) != 0) {
      in_order = 0;
    }
    index++;
  }
  if (ended == 0) {
    zplc_host_handoff_close(&handoff, 0); /* unblock a stuck reader before joining */
  }
  (void)pthread_join(producer, NULL);
  TEST_ASSERT(ended == 1, "end of input arrives after the last line");
  TEST_ASSERT(index == LINE_COUNT, "every line arrives");
  TEST_ASSERT(in_order == 1, "every line arrives whole and in order");
  zplc_host_handoff_destroy(&handoff);
}

int main(void) {
  test_wake_up_between_check_and_wait();
  test_eof_wakes_a_waiter();
  test_bytes_in_order();

  printf("\n%d tests, %d failures\n", test_count, fail_count);
  return (fail_count == 0) ? 0 : 1;
}
