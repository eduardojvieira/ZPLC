/**
 * @file test_hil_debug.c
 * @brief The HIL debug formatter is portable: it runs on the host with a line sink (RT-029).
 *
 * SPDX-License-Identifier: MIT
 *
 * src/core/zplc_debug.c used to print through the Zephyr shell, so it could only be compiled for a Zephyr target.
 * It now hands each finished JSON line to a sink that the target registers; here the sink is a buffer.
 */

#include <stdio.h>
#include <string.h>

#include <zplc_debug.h>
#include <zplc_isa.h>

static int test_count = 0;
static int fail_count = 0;

#define CHECK(cond, msg)                                                      \
  do {                                                                        \
    test_count++;                                                             \
    if (!(cond)) {                                                            \
      fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__);                 \
      fail_count++;                                                           \
    } else {                                                                  \
      printf("PASS: %s\n", msg);                                              \
    }                                                                         \
  } while (0)

static char captured[256];
static int lines;
static void *seen_context;

static void sink(void *context, const char *line) {
  seen_context = context;
  lines++;
  strncpy(captured, line, sizeof(captured) - 1U);
  captured[sizeof(captured) - 1U] = '\0';
}

int main(void) {
  int token = 7;

  printf("=== HIL debug formatter, host sink (RT-029) ===\n");

  /* No sink: nothing is printed and nothing crashes. */
  hil_set_mode(HIL_MODE_VERBOSE);
  hil_trace_opcode(OP_NOP, 4U, 1U, 5);
  CHECK(lines == 0, "without a sink a trace produces no line");

  hil_set_sink(sink, &token);
  hil_trace_opcode(OP_NOP, 4U, 1U, 5);
  CHECK(lines == 1, "a verbose opcode trace produces one line");
  CHECK(strcmp(captured, "{\"t\":\"opcode\",\"op\":\"NOP\",\"pc\":4,\"sp\":1,\"tos\":5}") == 0,
        "the line is the documented JSON object");
  CHECK(seen_context == &token, "the sink receives the registered context");

  hil_set_mode(HIL_MODE_SUMMARY);
  hil_trace_opcode(OP_NOP, 4U, 1U, 5);
  CHECK(lines == 1, "summary mode does not trace opcodes");
  hil_trace_cycle(3U, 250U, 2U);
  CHECK(lines == 2 && strcmp(captured, "{\"t\":\"cycle\",\"n\":3,\"us\":250,\"tasks\":2}") == 0,
        "a cycle summary is one JSON line");

  hil_trace_error(0x03U, NULL, 9U);
  CHECK(lines == 3 && strstr(captured, "\"msg\":\"DIV_BY_ZERO\"") != NULL,
        "an error names its code when no message is given");

  hil_set_sink(NULL, NULL);
  hil_trace_cycle(4U, 1U, 1U);
  CHECK(lines == 3, "a NULL sink silences the output again");

  printf("\n%d checks, %d failed\n", test_count, fail_count);
  return fail_count == 0 ? 0 : 1;
}
