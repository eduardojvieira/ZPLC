/*
 * The line splitting of the stdin readers (host_line_buffer.c), on any host. The
 * POSIX reader and the Windows pipe reader both fill a pending buffer with whatever
 * one read returned and take lines from it here; only the Windows nightly proves
 * the Windows read itself.
 */
#include "host_line_buffer.h"

#include <stdio.h>
#include <string.h>

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

#define CAPACITY 64U

static char data[CAPACITY];
static size_t length;

static void feed(const char *text) {
  const size_t n = strlen(text);

  memcpy(data + length, text, n);
  length += n;
}

static void test_partial_line_waits(void) {
  char buffer[32];
  zplc_host_stdio_result_t result = ZPLC_HOST_STDIO_TIMEOUT;

  printf("\n=== Test: a partial line waits for its newline ===\n");
  length = 0U;
  feed("{\"id\":\"a\"");
  TEST_ASSERT(zplc_host_take_line(data, &length, CAPACITY, buffer, sizeof(buffer), 0, &result) == 0, "no line yet");
  TEST_ASSERT(length == 9U, "the partial line is kept");
}

static void test_joined_lines(void) {
  char buffer[32];
  zplc_host_stdio_result_t result = ZPLC_HOST_STDIO_TIMEOUT;

  printf("\n=== Test: several lines in one read come out one at a time, in order ===\n");
  length = 0U;
  feed("one\ntwo\nthr");
  TEST_ASSERT(zplc_host_take_line(data, &length, CAPACITY, buffer, sizeof(buffer), 0, &result) == 1, "first line taken");
  TEST_ASSERT(result == ZPLC_HOST_STDIO_READY && strcmp(buffer, "one\n") == 0, "first line is one");
  TEST_ASSERT(zplc_host_take_line(data, &length, CAPACITY, buffer, sizeof(buffer), 0, &result) == 1, "second line taken");
  TEST_ASSERT(result == ZPLC_HOST_STDIO_READY && strcmp(buffer, "two\n") == 0, "second line is two");
  TEST_ASSERT(zplc_host_take_line(data, &length, CAPACITY, buffer, sizeof(buffer), 0, &result) == 0, "the tail waits");
  TEST_ASSERT(length == 3U && memcmp(data, "thr", 3U) == 0, "the tail is kept");
}

static void test_line_split_across_reads(void) {
  char buffer[32];
  zplc_host_stdio_result_t result = ZPLC_HOST_STDIO_TIMEOUT;

  printf("\n=== Test: a line split across reads is joined ===\n");
  length = 0U;
  feed("{\"id\":");
  TEST_ASSERT(zplc_host_take_line(data, &length, CAPACITY, buffer, sizeof(buffer), 0, &result) == 0, "first piece waits");
  feed("\"b\"}\n");
  TEST_ASSERT(zplc_host_take_line(data, &length, CAPACITY, buffer, sizeof(buffer), 0, &result) == 1, "joined line taken");
  TEST_ASSERT(result == ZPLC_HOST_STDIO_READY && strcmp(buffer, "{\"id\":\"b\"}\n") == 0, "the joined line is whole");
  TEST_ASSERT(length == 0U, "nothing is left");
}

static void test_line_longer_than_buffer(void) {
  char buffer[5];
  zplc_host_stdio_result_t result = ZPLC_HOST_STDIO_TIMEOUT;

  printf("\n=== Test: a line longer than the buffer comes out in pieces marked ERROR ===\n");
  length = 0U;
  feed("abcdefg\n");
  TEST_ASSERT(zplc_host_take_line(data, &length, CAPACITY, buffer, sizeof(buffer), 0, &result) == 1, "a piece is taken");
  TEST_ASSERT(result == ZPLC_HOST_STDIO_ERROR && strcmp(buffer, "abcd") == 0, "the piece fills the buffer without a newline");
  TEST_ASSERT(zplc_host_take_line(data, &length, CAPACITY, buffer, sizeof(buffer), 0, &result) == 1, "the tail is taken");
  TEST_ASSERT(result == ZPLC_HOST_STDIO_READY && strcmp(buffer, "efg\n") == 0, "the tail ends the line");
}

static void test_unterminated_tail_at_eof(void) {
  char buffer[32];
  zplc_host_stdio_result_t result = ZPLC_HOST_STDIO_TIMEOUT;

  printf("\n=== Test: an unterminated tail at end of input is an ERROR piece ===\n");
  length = 0U;
  feed("half");
  TEST_ASSERT(zplc_host_take_line(data, &length, CAPACITY, buffer, sizeof(buffer), 1, &result) == 1, "the tail is taken at eof");
  TEST_ASSERT(result == ZPLC_HOST_STDIO_ERROR && strcmp(buffer, "half") == 0, "the tail has no newline");
  TEST_ASSERT(zplc_host_take_line(data, &length, CAPACITY, buffer, sizeof(buffer), 1, &result) == 0, "nothing more at eof");
}

int main(void) {
  test_partial_line_waits();
  test_joined_lines();
  test_line_split_across_reads();
  test_line_longer_than_buffer();
  test_unterminated_tail_at_eof();

  printf("\n%d tests, %d failures\n", test_count, fail_count);
  return (fail_count == 0) ? 0 : 1;
}
