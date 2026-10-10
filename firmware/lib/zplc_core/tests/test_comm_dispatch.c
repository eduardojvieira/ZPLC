/* Keep the test assertions enabled in CMake Release builds. */
#ifdef NDEBUG
#undef NDEBUG
#endif
#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "zplc_comm_dispatch.h"

static int dummy_handler_calls = 0;
static zplc_comm_fb_kind_t last_kind;
static uint8_t *last_fb_mem;
static uint16_t last_fb_len;
static bool last_reset;

static int dummy_handler(zplc_comm_fb_kind_t kind, uint8_t *fb_mem,
                         uint16_t fb_len, bool reset) {
  dummy_handler_calls++;
  last_kind = kind;
  last_fb_mem = fb_mem;
  last_fb_len = fb_len;
  last_reset = reset;
  return 0;
}

static void test_registration(void) {
  printf("test_registration...\n");
  int res =
      zplc_comm_register_handler(ZPLC_COMM_FB_MB_READ_HREG, dummy_handler);
  assert(res == 0);

  // Test invalid kind
  res = zplc_comm_register_handler(0xFFFF, dummy_handler);
  assert(res < 0);

  // Test NULL handler
  res = zplc_comm_register_handler(ZPLC_COMM_FB_MB_WRITE_HREG, NULL);
  assert(res < 0);
}

static void test_exec_handler_call(void) {
  printf("test_exec_handler_call...\n");
  uint8_t mem[256] = {0};
  dummy_handler_calls = 0;

  // Register and call
  zplc_comm_register_handler(ZPLC_COMM_FB_MB_READ_HREG, dummy_handler);

  // Ensure EN=0 does not trigger handler
  mem[10] = 0; // EN mapped to offset 0 within FB at base 10
  int res = zplc_comm_fb_exec(ZPLC_COMM_FB_MB_READ_HREG, &mem[10],
                              ZPLC_COMM_MB_READ_HREG_SIZE);
  assert(res == 0);
  assert(dummy_handler_calls == 0);

  // Trigger
  mem[10] = 1; // EN=1
  res = zplc_comm_fb_exec(ZPLC_COMM_FB_MB_READ_HREG, &mem[10],
                          ZPLC_COMM_MB_READ_HREG_SIZE);
  assert(res == 0);
  assert(dummy_handler_calls == 1);
  assert(last_kind == ZPLC_COMM_FB_MB_READ_HREG);
  assert(last_fb_mem == &mem[10]);
  assert(last_fb_len == ZPLC_COMM_MB_READ_HREG_SIZE); /* RT-002: a length */
  assert(last_reset == false);
  assert(mem[11] == 1); // BUSY should be flipped to 1
}

static void test_auto_reset_pulse(void) {
  printf("test_auto_reset_pulse...\n");
  uint8_t mem[256] = {0};
  // Mock done state
  mem[10] = 1; // EN
  mem[11] = 0; // BUSY
  mem[12] = 1; // DONE
  // Executing while DONE is 1 should clear DONE because it's a pulse
  zplc_comm_fb_exec(ZPLC_COMM_FB_MB_READ_HREG, &mem[10],
                    ZPLC_COMM_MB_READ_HREG_SIZE);
  assert(mem[12] == 0);
}

static void test_no_handler(void) {
  printf("test_no_handler...\n");
  uint8_t mem[256] = {0};
  mem[20] = 1; // EN=1

  // Call unregistered FB kind
  int res = zplc_comm_fb_exec(ZPLC_COMM_FB_MB_WRITE_HREG, &mem[20],
                              ZPLC_COMM_MB_WRITE_HREG_SIZE);
  assert(res == 0);
  assert(mem[20 + 3] == 1); // ERROR should be 1
  // Read STATUS (DINT = 4 bytes)
  uint32_t status = *(uint32_t *)&mem[20 + 4];
  assert(status == ZPLC_COMM_NO_HANDLER);
}

static int failing_handler(zplc_comm_fb_kind_t kind, uint8_t *fb_mem,
                           uint16_t fb_len, bool reset) {
  (void)kind;
  (void)fb_mem;
  (void)fb_len;
  (void)reset;
  return -1;
}

static void test_handler_error_sets_status(void) {
  printf("test_handler_error_sets_status...\n");
  uint8_t mem[ZPLC_COMM_MQTT_PUBLISH_SIZE] = {0};

  zplc_comm_register_handler(ZPLC_COMM_FB_MQTT_PUBLISH, failing_handler);
  mem[0] = 1;

  int res = zplc_comm_fb_exec(ZPLC_COMM_FB_MQTT_PUBLISH, mem,
                              ZPLC_COMM_MQTT_PUBLISH_SIZE);
  assert(res == 0);
  assert(mem[1] == 0);
  assert(mem[3] == 1);
  assert(*(uint32_t *)&mem[4] == ZPLC_COMM_UNKNOWN);
}

static void test_reset_clears_handshake_state(void) {
  printf("test_reset_clears_handshake_state...\n");
  uint8_t mem[ZPLC_COMM_MQTT_SUBSCRIBE_SIZE] = {0};

  mem[0] = 1;
  mem[1] = 1;
  mem[2] = 1;
  mem[3] = 1;
  *(uint32_t *)&mem[4] = 123;

  int res = zplc_comm_fb_reset(ZPLC_COMM_FB_MQTT_SUBSCRIBE, mem,
                               ZPLC_COMM_MQTT_SUBSCRIBE_SIZE);
  assert(res == 0);
  assert(mem[0] == 0);
  assert(mem[1] == 0);
  assert(mem[2] == 0);
  assert(mem[3] == 0);
  assert(*(uint32_t *)&mem[4] == 0);
}

/* RT-004: the STATUS field is written byte by byte, little endian, at any
 * address. The block starts at an odd offset, so STATUS is misaligned for a
 * 32-bit store; under UBSan a wide store through a cast pointer is reported. */
static void test_status_written_bytewise_at_unaligned_address(void) {
  printf("test_status_written_bytewise_at_unaligned_address...\n");
  union {
    uint32_t force_alignment;
    uint8_t bytes[256];
  } image;
  uint8_t *fb;

  memset(&image, 0xA5, sizeof(image));
  fb = &image.bytes[1];

  /* No handler for this kind: STATUS = ZPLC_COMM_NO_HANDLER (3). */
  memset(fb, 0, 8);
  fb[0] = 1;
  assert(zplc_comm_fb_exec(ZPLC_COMM_FB_MB_WRITE_HREG, fb,
                           ZPLC_COMM_MB_WRITE_HREG_SIZE) == 0);
  assert(fb[3] == 1);
  assert(fb[4] == ZPLC_COMM_NO_HANDLER && fb[5] == 0 && fb[6] == 0 && fb[7] == 0);

  /* A failing handler: STATUS = ZPLC_COMM_UNKNOWN (0xFF). */
  memset(fb, 0, 8);
  fb[0] = 1;
  zplc_comm_register_handler(ZPLC_COMM_FB_MQTT_PUBLISH, failing_handler);
  assert(zplc_comm_fb_exec(ZPLC_COMM_FB_MQTT_PUBLISH, fb,
                           ZPLC_COMM_MQTT_PUBLISH_SIZE) == 0);
  assert(fb[4] == ZPLC_COMM_UNKNOWN && fb[5] == 0 && fb[6] == 0 && fb[7] == 0);

  /* Reset clears all four STATUS bytes and touches nothing outside the block. */
  fb[4] = 0x78;
  fb[5] = 0x56;
  fb[6] = 0x34;
  fb[7] = 0x12;
  assert(zplc_comm_fb_reset(ZPLC_COMM_FB_MQTT_SUBSCRIBE, fb,
                            ZPLC_COMM_MQTT_SUBSCRIBE_SIZE) == 0);
  assert(fb[4] == 0 && fb[5] == 0 && fb[6] == 0 && fb[7] == 0);
  assert(image.bytes[0] == 0xA5 && image.bytes[9] == 0xA5);
}

/* RT-002: the dispatcher hands a handler no less than the layout of its
 * kind, and touches nothing of a block that is too short for the handshake. */
static void test_block_shorter_than_its_layout_is_refused(void) {
  printf("test_block_shorter_than_its_layout_is_refused...\n");
  uint8_t mem[256];

  memset(mem, 0, sizeof(mem));
  mem[0] = 1; /* EN */
  dummy_handler_calls = 0;
  zplc_comm_register_handler(ZPLC_COMM_FB_MB_READ_HREG, dummy_handler);

  /* one byte short of the table size: refused, handler not called, no write */
  assert(zplc_comm_fb_exec(ZPLC_COMM_FB_MB_READ_HREG, mem,
                           ZPLC_COMM_MB_READ_HREG_SIZE - 1U) == -1);
  assert(dummy_handler_calls == 0);
  assert(mem[1] == 0 && mem[3] == 0);
  /* the reset of a short block clears nothing either */
  mem[1] = 1;
  assert(zplc_comm_fb_reset(ZPLC_COMM_FB_MB_READ_HREG, mem,
                            ZPLC_COMM_MB_READ_HREG_SIZE - 1U) == -1);
  assert(mem[0] == 1 && mem[1] == 1);
  /* no block at all */
  assert(zplc_comm_fb_exec(ZPLC_COMM_FB_MB_READ_HREG, NULL,
                           ZPLC_COMM_MB_READ_HREG_SIZE) == -1);
  /* exactly the table size is accepted */
  mem[1] = 0; /* not busy */
  assert(zplc_comm_fb_exec(ZPLC_COMM_FB_MB_READ_HREG, mem,
                           ZPLC_COMM_MB_READ_HREG_SIZE) == 0);
  assert(dummy_handler_calls == 1);
  assert(last_fb_len == ZPLC_COMM_MB_READ_HREG_SIZE);
}

/* A kind without a layout is the 8-byte handshake and nothing more. */
static void test_kind_without_layout_is_the_handshake(void) {
  printf("test_kind_without_layout_is_the_handshake...\n");
  uint8_t mem[64];

  memset(mem, 0, sizeof(mem));
  mem[0] = 1;
  dummy_handler_calls = 0;
  assert(zplc_comm_fb_size(ZPLC_COMM_FB_COMM_STATUS) == 0);
  zplc_comm_register_handler(ZPLC_COMM_FB_COMM_STATUS, dummy_handler);
  assert(zplc_comm_fb_exec(ZPLC_COMM_FB_COMM_STATUS, mem,
                           ZPLC_COMM_FB_HANDSHAKE_SIZE - 1U) == -1);
  assert(dummy_handler_calls == 0);
  assert(zplc_comm_fb_exec(ZPLC_COMM_FB_COMM_STATUS, mem,
                           ZPLC_COMM_FB_HANDSHAKE_SIZE) == 0);
  assert(dummy_handler_calls == 1);
  assert(last_fb_len == ZPLC_COMM_FB_HANDSHAKE_SIZE);
}

int main(void) {
  printf("Running zplc_comm_dispatch tests...\n");
  test_registration();
  test_exec_handler_call();
  test_auto_reset_pulse();
  test_no_handler();
  test_handler_error_sets_status();
  test_reset_clears_handshake_state();
  test_status_written_bytewise_at_unaligned_address();
  test_block_shorter_than_its_layout_is_refused();
  test_kind_without_layout_is_the_handshake();
  printf("All zplc_comm_dispatch tests passed.\n");
  return 0;
}
