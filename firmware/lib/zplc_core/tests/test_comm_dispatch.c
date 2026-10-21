/* Keep the test assertions enabled in CMake Release builds. */
#ifdef NDEBUG
#undef NDEBUG
#endif
#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "zplc_comm_dispatch.h"

/* A handler that plays a script: each START or POLL takes the next result, and the last one repeats. */
typedef struct {
  int starts;
  int polls;
  int resets;
  int results[8];
  int count;
  int next;
  zplc_comm_call_t last_call;
  zplc_comm_fb_kind_t last_kind;
  uint8_t *last_fb_mem;
  uint16_t last_fb_len;
} script_t;

static script_t script;

static void script_play(int count, const int *results) {
  int i;

  memset(&script, 0, sizeof(script));
  script.count = count;
  for (i = 0; i < count; i++) {
    script.results[i] = results[i];
  }
}

static int scripted_handler(zplc_comm_fb_kind_t kind, uint8_t *fb_mem, uint16_t fb_len, zplc_comm_call_t call) {
  int result;

  script.last_call = call;
  script.last_kind = kind;
  script.last_fb_mem = fb_mem;
  script.last_fb_len = fb_len;
  if (call == ZPLC_COMM_CALL_RESET) {
    script.resets++;
    return ZPLC_COMM_HANDLER_DONE;
  }
  if (call == ZPLC_COMM_CALL_START) {
    script.starts++;
  } else {
    script.polls++;
  }
  result = script.results[script.next];
  if (script.next + 1 < script.count) {
    script.next++;
  }
  return result;
}

#define EXEC(kind, mem) assert(zplc_comm_fb_exec((kind), (mem), zplc_comm_fb_size((kind))) == 0)

static uint32_t status_of(const uint8_t *mem) {
  return (uint32_t)mem[4] | ((uint32_t)mem[5] << 8) | ((uint32_t)mem[6] << 16) | ((uint32_t)mem[7] << 24);
}

/* BUSY, DONE, ERROR of a block as one number: 100 is busy, 10 done, 1 error. */
static int state_of(const uint8_t *mem) { return mem[1] * 100 + mem[2] * 10 + mem[3]; }

static void test_registration(void) {
  printf("test_registration...\n");
  int res = zplc_comm_register_handler(ZPLC_COMM_FB_MB_READ_HREG, scripted_handler);
  assert(res == 0);

  // Test invalid kind. The value is wider than the enum on targets that
  // compile with -fshort-enums, so it goes through a variable: the narrowed
  // result (0xFF) is the kind-count sentinel and is rejected as well.
  volatile int invalid_kind = 0xFFFF;
  res = zplc_comm_register_handler((zplc_comm_fb_kind_t)invalid_kind, scripted_handler);
  assert(res < 0);

  // Test NULL handler
  res = zplc_comm_register_handler(ZPLC_COMM_FB_MB_WRITE_HREG, NULL);
  assert(res < 0);
}

static void test_the_handler_gets_the_block_and_its_length(void) {
  printf("test_the_handler_gets_the_block_and_its_length...\n");
  uint8_t mem[256] = {0};
  const int results[] = {ZPLC_COMM_HANDLER_DONE};

  zplc_comm_register_handler(ZPLC_COMM_FB_MB_READ_HREG, scripted_handler);
  script_play(1, results);
  mem[10] = 0; /* EN off: the handler is not called */
  assert(zplc_comm_fb_exec(ZPLC_COMM_FB_MB_READ_HREG, &mem[10], ZPLC_COMM_MB_READ_HREG_SIZE) == 0);
  assert(script.starts == 0 && script.polls == 0 && script.resets == 0);

  mem[10] = 1;
  assert(zplc_comm_fb_exec(ZPLC_COMM_FB_MB_READ_HREG, &mem[10], ZPLC_COMM_MB_READ_HREG_SIZE) == 0);
  assert(script.starts == 1);
  assert(script.last_call == ZPLC_COMM_CALL_START);
  assert(script.last_kind == ZPLC_COMM_FB_MB_READ_HREG);
  assert(script.last_fb_mem == &mem[10]);
  assert(script.last_fb_len == ZPLC_COMM_MB_READ_HREG_SIZE); /* RT-002: a length */
}

/* COM-002: BUSY sticks while the handler is pending, the handler is called on
 * every scan until it finishes, and the result is published. */
static void test_a_pending_handler_is_polled_on_every_scan_until_it_finishes(void) {
  printf("test_a_pending_handler_is_polled_on_every_scan_until_it_finishes...\n");
  uint8_t mem[ZPLC_COMM_MB_READ_HREG_SIZE] = {0};
  const int results[] = {ZPLC_COMM_HANDLER_PENDING, ZPLC_COMM_HANDLER_PENDING, ZPLC_COMM_HANDLER_PENDING, ZPLC_COMM_HANDLER_DONE};

  script_play(4, results);
  mem[0] = 1;

  EXEC(ZPLC_COMM_FB_MB_READ_HREG, mem); /* scan 1: START */
  assert(state_of(mem) == 100 && status_of(mem) == ZPLC_COMM_BUSY);
  assert(script.starts == 1 && script.polls == 0);

  EXEC(ZPLC_COMM_FB_MB_READ_HREG, mem); /* scan 2: POLL */
  EXEC(ZPLC_COMM_FB_MB_READ_HREG, mem); /* scan 3: POLL */
  assert(state_of(mem) == 100);
  assert(script.starts == 1 && script.polls == 2);

  EXEC(ZPLC_COMM_FB_MB_READ_HREG, mem); /* scan 4: the result */
  assert(state_of(mem) == 10 && status_of(mem) == ZPLC_COMM_OK);
  assert(script.starts == 1 && script.polls == 3);
}

/* COM-004: one rising edge, one operation; a held EN does not repeat it. */
static void test_a_result_is_held_and_nothing_repeats_while_en_stays(void) {
  printf("test_a_result_is_held_and_nothing_repeats_while_en_stays...\n");
  uint8_t mem[ZPLC_COMM_MQTT_PUBLISH_SIZE] = {0};
  const int results[] = {ZPLC_COMM_HANDLER_DONE};
  int scan;

  zplc_comm_register_handler(ZPLC_COMM_FB_MQTT_PUBLISH, scripted_handler);
  script_play(1, results);
  mem[0] = 1;

  for (scan = 0; scan < 20; scan++) {
    EXEC(ZPLC_COMM_FB_MQTT_PUBLISH, mem);
    assert(state_of(mem) == 10); /* DONE, held */
  }
  assert(script.starts == 1 && script.polls == 0);
}

/* The falling edge clears the result; the next rising edge is a new operation
 * and cannot replay the finished one (COM-002). */
static void test_en_falling_clears_the_result_and_the_next_rise_starts_again(void) {
  printf("test_en_falling_clears_the_result_and_the_next_rise_starts_again...\n");
  uint8_t mem[ZPLC_COMM_MB_READ_HREG_SIZE] = {0};
  const int results[] = {ZPLC_COMM_HANDLER_DONE};

  script_play(1, results);
  mem[0] = 1;
  EXEC(ZPLC_COMM_FB_MB_READ_HREG, mem);
  assert(state_of(mem) == 10 && script.starts == 1);

  mem[0] = 0;
  EXEC(ZPLC_COMM_FB_MB_READ_HREG, mem);
  assert(state_of(mem) == 0);
  assert(script.starts == 1 && script.polls == 0 && script.resets == 0);

  mem[0] = 1;
  EXEC(ZPLC_COMM_FB_MB_READ_HREG, mem);
  assert(state_of(mem) == 10);
  assert(script.starts == 2); /* a new operation, not the old result */
}

/* A trigger that is a one-scan pulse still completes: the operation runs on,
 * and its result is shown for exactly one scan. */
static void test_a_pulse_trigger_completes_and_shows_its_result_for_one_scan(void) {
  printf("test_a_pulse_trigger_completes_and_shows_its_result_for_one_scan...\n");
  uint8_t mem[ZPLC_COMM_MB_READ_HREG_SIZE] = {0};
  const int results[] = {ZPLC_COMM_HANDLER_PENDING, ZPLC_COMM_HANDLER_PENDING, ZPLC_COMM_HANDLER_DONE};

  script_play(3, results);
  mem[0] = 1;
  EXEC(ZPLC_COMM_FB_MB_READ_HREG, mem); /* START */
  mem[0] = 0;                           /* the pulse is over */
  EXEC(ZPLC_COMM_FB_MB_READ_HREG, mem); /* POLL: still pending */
  assert(state_of(mem) == 100);
  EXEC(ZPLC_COMM_FB_MB_READ_HREG, mem); /* POLL: the result */
  assert(state_of(mem) == 10);
  EXEC(ZPLC_COMM_FB_MB_READ_HREG, mem); /* one scan later it is gone */
  assert(state_of(mem) == 0);
  assert(script.starts == 1 && script.polls == 2 && script.resets == 0);

  /* a rising EN while BUSY starts nothing: the trigger is absorbed, and the result is held while EN stays */
  {
    const int busy[] = {ZPLC_COMM_HANDLER_PENDING, ZPLC_COMM_HANDLER_PENDING, ZPLC_COMM_HANDLER_DONE};

    memset(mem, 0, sizeof(mem));
    script_play(3, busy);
    mem[0] = 1;
    EXEC(ZPLC_COMM_FB_MB_READ_HREG, mem); /* START */
    mem[0] = 0;
    EXEC(ZPLC_COMM_FB_MB_READ_HREG, mem); /* POLL */
    mem[0] = 1;
    EXEC(ZPLC_COMM_FB_MB_READ_HREG, mem); /* rising while BUSY: POLL, the result */
    assert(state_of(mem) == 10 && script.starts == 1 && script.polls == 2);
    EXEC(ZPLC_COMM_FB_MB_READ_HREG, mem);
    assert(state_of(mem) == 10 && script.starts == 1 && script.polls == 2);
  }

  /* a trigger on the scan after a result that was shown with EN low is a new trigger: the old result is not its
   * result and it is not swallowed */
  {
    const int quick[] = {ZPLC_COMM_HANDLER_PENDING, ZPLC_COMM_HANDLER_DONE};

    memset(mem, 0, sizeof(mem));
    script_play(2, quick);
    mem[0] = 1;
    EXEC(ZPLC_COMM_FB_MB_READ_HREG, mem); /* START */
    mem[0] = 0;
    EXEC(ZPLC_COMM_FB_MB_READ_HREG, mem); /* POLL: the result, with EN low */
    assert(state_of(mem) == 10 && script.starts == 1);
    mem[0] = 1;
    EXEC(ZPLC_COMM_FB_MB_READ_HREG, mem); /* rising edge: a second operation */
    assert(script.starts == 2);
    assert(state_of(mem) == 10); /* the handler is at its last result, DONE */
  }
}

/* A failed operation: ERROR, with the status code the handler named, held. */
static void test_a_failure_is_published_with_its_status_code(void) {
  printf("test_a_failure_is_published_with_its_status_code...\n");
  uint8_t mem[ZPLC_COMM_MQTT_PUBLISH_SIZE] = {0};
  static const struct {
    int result;
    uint32_t status;
  } cases[] = {
      {ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_TIMEOUT), ZPLC_COMM_TIMEOUT},
      {ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_NOT_CONNECTED), ZPLC_COMM_NOT_CONNECTED},
      {ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_QUEUE_FULL), ZPLC_COMM_QUEUE_FULL},
      {ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_INVALID_ADDR), ZPLC_COMM_INVALID_ADDR},
      {ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_STRING_OVERFLOW), ZPLC_COMM_STRING_OVERFLOW},
      {ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_PROTO_ERROR), ZPLC_COMM_PROTO_ERROR},
      {ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_AUTH_FAILED), ZPLC_COMM_AUTH_FAILED},
      {ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_UNAVAILABLE), ZPLC_COMM_UNAVAILABLE},
      {-1, ZPLC_COMM_UNKNOWN},    /* not a status */
      {-1000, ZPLC_COMM_UNKNOWN}, /* not a status */
      {7, ZPLC_COMM_UNKNOWN},     /* a positive value that is not PENDING */
  };
  size_t i;

  zplc_comm_register_handler(ZPLC_COMM_FB_MQTT_PUBLISH, scripted_handler);
  for (i = 0; i < sizeof(cases) / sizeof(cases[0]); i++) {
    int scan;

    memset(mem, 0xA5, sizeof(mem));
    mem[0] = 1;
    mem[1] = mem[2] = mem[3] = 0;
    script_play(1, &cases[i].result);
    for (scan = 0; scan < 3; scan++) {
      EXEC(ZPLC_COMM_FB_MQTT_PUBLISH, mem);
      assert(state_of(mem) == 1);
      assert(status_of(mem) == cases[i].status);
    }
    assert(script.starts == 1); /* a failure is not retried while EN stays */
    assert(mem[8] == 0xA5);     /* nothing beyond the handshake is the dispatcher's */
  }
}

static void test_a_service_block_is_polled_on_every_scan_while_enabled(void) {
  printf("test_a_service_block_is_polled_on_every_scan_while_enabled...\n");
  uint8_t mem[ZPLC_COMM_MQTT_SUBSCRIBE_SIZE] = {0};
  const int results[] = {ZPLC_COMM_HANDLER_PENDING, ZPLC_COMM_HANDLER_DONE, ZPLC_COMM_HANDLER_DONE,
                         ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_NOT_CONNECTED), ZPLC_COMM_HANDLER_DONE};

  assert(zplc_comm_fb_is_service(ZPLC_COMM_FB_MQTT_SUBSCRIBE));
  assert(zplc_comm_fb_is_service(ZPLC_COMM_FB_MQTT_CONNECT));
  assert(zplc_comm_fb_is_service(ZPLC_COMM_FB_AZURE_C2D_RECV));
  assert(!zplc_comm_fb_is_service(ZPLC_COMM_FB_MQTT_PUBLISH));
  assert(!zplc_comm_fb_is_service(ZPLC_COMM_FB_MB_READ_HREG));

  zplc_comm_register_handler(ZPLC_COMM_FB_MQTT_SUBSCRIBE, scripted_handler);
  script_play(5, results);
  mem[0] = 1;

  EXEC(ZPLC_COMM_FB_MQTT_SUBSCRIBE, mem);
  assert(state_of(mem) == 100 && status_of(mem) == ZPLC_COMM_BUSY);
  EXEC(ZPLC_COMM_FB_MQTT_SUBSCRIBE, mem);
  assert(state_of(mem) == 10 && status_of(mem) == ZPLC_COMM_OK);
  EXEC(ZPLC_COMM_FB_MQTT_SUBSCRIBE, mem);
  assert(state_of(mem) == 10);
  EXEC(ZPLC_COMM_FB_MQTT_SUBSCRIBE, mem); /* the session went down */
  assert(state_of(mem) == 1 && status_of(mem) == ZPLC_COMM_NOT_CONNECTED);
  EXEC(ZPLC_COMM_FB_MQTT_SUBSCRIBE, mem); /* and came back */
  assert(state_of(mem) == 10);
  assert(script.starts == 0 && script.polls == 5);

  /* EN falls: the handler is told once and the outputs clear */
  mem[0] = 0;
  EXEC(ZPLC_COMM_FB_MQTT_SUBSCRIBE, mem);
  assert(state_of(mem) == 0);
  assert(script.resets == 1 && script.last_call == ZPLC_COMM_CALL_RESET);
  EXEC(ZPLC_COMM_FB_MQTT_SUBSCRIBE, mem);
  assert(script.resets == 1 && script.polls == 5); /* a disabled block is not called */
}

static void test_a_kind_without_a_handler_reports_no_handler(void) {
  printf("test_a_kind_without_a_handler_reports_no_handler...\n");
  uint8_t request[ZPLC_COMM_AZURE_EG_PUB_SIZE] = {0};
  uint8_t service[ZPLC_COMM_AZURE_C2D_RECV_SIZE] = {0};
  int scan;

  /* nothing registers a handler for these two in this test */
  request[0] = 1;
  service[0] = 1;
  for (scan = 0; scan < 3; scan++) {
    EXEC(ZPLC_COMM_FB_AZURE_EG_PUB, request);
    EXEC(ZPLC_COMM_FB_AZURE_C2D_RECV, service);
    assert(state_of(request) == 1 && status_of(request) == ZPLC_COMM_NO_HANDLER);
    assert(state_of(service) == 1 && status_of(service) == ZPLC_COMM_NO_HANDLER);
  }
}

static void test_reset_clears_the_handshake_and_tells_the_handler(void) {
  printf("test_reset_clears_the_handshake_and_tells_the_handler...\n");
  uint8_t mem[ZPLC_COMM_MQTT_SUBSCRIBE_SIZE] = {0};
  const int results[] = {ZPLC_COMM_HANDLER_DONE};

  zplc_comm_register_handler(ZPLC_COMM_FB_MQTT_PUBLISH, scripted_handler);
  script_play(1, results);

  mem[0] = 1;
  mem[1] = 1;
  mem[2] = 1;
  mem[3] = 1;
  mem[4] = 123;

  assert(zplc_comm_fb_reset(ZPLC_COMM_FB_MQTT_PUBLISH, mem, ZPLC_COMM_MQTT_PUBLISH_SIZE) == 0);
  assert(mem[0] == 0 && state_of(mem) == 0 && status_of(mem) == 0);
  assert(script.resets == 1 && script.last_call == ZPLC_COMM_CALL_RESET);
  assert(script.starts == 0 && script.polls == 0);
}

/* RT-004: the STATUS field is written byte by byte, little endian, at any
 * address. The block starts at an odd offset, so STATUS is misaligned for a
 * 32-bit store; under UBSan a wide store through a cast pointer is reported. */
static void test_status_written_bytewise_at_unaligned_address(void) {
  printf("test_status_written_bytewise_at_unaligned_address...\n");
  union {
    uint32_t force_alignment;
    uint8_t bytes[512];
  } image;
  uint8_t *fb;
  const int fail[] = {ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_AUTH_FAILED)};

  memset(&image, 0xA5, sizeof(image));
  fb = &image.bytes[1];

  /* A kind with no handler: STATUS = ZPLC_COMM_NO_HANDLER (3). */
  memset(fb, 0, 8);
  fb[0] = 1;
  assert(zplc_comm_fb_exec(ZPLC_COMM_FB_AWS_FLEET_PROV, fb, ZPLC_COMM_AWS_FLEET_PROV_SIZE) == 0);
  assert(fb[3] == 1);
  assert(fb[4] == ZPLC_COMM_NO_HANDLER && fb[5] == 0 && fb[6] == 0 && fb[7] == 0);

  /* A failing handler: STATUS = ZPLC_COMM_AUTH_FAILED (9). */
  memset(fb, 0, 8);
  fb[0] = 1;
  zplc_comm_register_handler(ZPLC_COMM_FB_MQTT_PUBLISH, scripted_handler);
  script_play(1, fail);
  assert(zplc_comm_fb_exec(ZPLC_COMM_FB_MQTT_PUBLISH, fb, ZPLC_COMM_MQTT_PUBLISH_SIZE) == 0);
  assert(fb[4] == ZPLC_COMM_AUTH_FAILED && fb[5] == 0 && fb[6] == 0 && fb[7] == 0);

  /* Reset clears all four STATUS bytes and touches nothing outside the block. */
  fb[4] = 0x78;
  fb[5] = 0x56;
  fb[6] = 0x34;
  fb[7] = 0x12;
  assert(zplc_comm_fb_reset(ZPLC_COMM_FB_MQTT_SUBSCRIBE, fb, ZPLC_COMM_MQTT_SUBSCRIBE_SIZE) == 0);
  assert(fb[4] == 0 && fb[5] == 0 && fb[6] == 0 && fb[7] == 0);
  assert(image.bytes[0] == 0xA5 && image.bytes[ZPLC_COMM_MQTT_SUBSCRIBE_SIZE + 1] == 0xA5);
}

/* RT-002: the dispatcher hands a handler no less than the layout of its
 * kind, and touches nothing of a block that is too short for the handshake. */
static void test_block_shorter_than_its_layout_is_refused(void) {
  printf("test_block_shorter_than_its_layout_is_refused...\n");
  uint8_t mem[256];
  const int results[] = {ZPLC_COMM_HANDLER_DONE};

  memset(mem, 0, sizeof(mem));
  mem[0] = 1; /* EN */
  zplc_comm_register_handler(ZPLC_COMM_FB_MB_READ_HREG, scripted_handler);
  script_play(1, results);

  /* one byte short of the table size: refused, handler not called, no write */
  assert(zplc_comm_fb_exec(ZPLC_COMM_FB_MB_READ_HREG, mem, ZPLC_COMM_MB_READ_HREG_SIZE - 1U) == -1);
  assert(script.starts == 0);
  assert(mem[1] == 0 && mem[3] == 0);
  /* the reset of a short block clears nothing either */
  mem[1] = 1;
  assert(zplc_comm_fb_reset(ZPLC_COMM_FB_MB_READ_HREG, mem, ZPLC_COMM_MB_READ_HREG_SIZE - 1U) == -1);
  assert(mem[0] == 1 && mem[1] == 1);
  /* no block at all */
  assert(zplc_comm_fb_exec(ZPLC_COMM_FB_MB_READ_HREG, NULL, ZPLC_COMM_MB_READ_HREG_SIZE) == -1);
  /* exactly the table size is accepted */
  mem[1] = 0; /* not busy */
  assert(zplc_comm_fb_exec(ZPLC_COMM_FB_MB_READ_HREG, mem, ZPLC_COMM_MB_READ_HREG_SIZE) == 0);
  assert(script.starts == 1);
  assert(script.last_fb_len == ZPLC_COMM_MB_READ_HREG_SIZE);
}

/* A kind without a layout is the 8-byte handshake and nothing more. */
static void test_kind_without_layout_is_the_handshake(void) {
  printf("test_kind_without_layout_is_the_handshake...\n");
  uint8_t mem[64];
  const int results[] = {ZPLC_COMM_HANDLER_DONE};

  memset(mem, 0, sizeof(mem));
  mem[0] = 1;
  script_play(1, results);
  assert(zplc_comm_fb_size(ZPLC_COMM_FB_COMM_STATUS) == 0);
  zplc_comm_register_handler(ZPLC_COMM_FB_COMM_STATUS, scripted_handler);
  assert(zplc_comm_fb_exec(ZPLC_COMM_FB_COMM_STATUS, mem, ZPLC_COMM_FB_HANDSHAKE_SIZE - 1U) == -1);
  assert(script.starts == 0);
  assert(zplc_comm_fb_exec(ZPLC_COMM_FB_COMM_STATUS, mem, ZPLC_COMM_FB_HANDSHAKE_SIZE) == 0);
  assert(script.starts == 1);
  assert(script.last_fb_len == ZPLC_COMM_FB_HANDSHAKE_SIZE);
}

int main(void) {
  printf("Running zplc_comm_dispatch tests...\n");
  test_registration();
  test_the_handler_gets_the_block_and_its_length();
  test_a_pending_handler_is_polled_on_every_scan_until_it_finishes();
  test_a_result_is_held_and_nothing_repeats_while_en_stays();
  test_en_falling_clears_the_result_and_the_next_rise_starts_again();
  test_a_pulse_trigger_completes_and_shows_its_result_for_one_scan();
  test_a_failure_is_published_with_its_status_code();
  test_a_service_block_is_polled_on_every_scan_while_enabled();
  test_a_kind_without_a_handler_reports_no_handler();
  test_reset_clears_the_handshake_and_tells_the_handler();
  test_status_written_bytewise_at_unaligned_address();
  test_block_shorter_than_its_layout_is_refused();
  test_kind_without_layout_is_the_handshake();
  printf("All zplc_comm_dispatch tests passed.\n");
  return 0;
}
