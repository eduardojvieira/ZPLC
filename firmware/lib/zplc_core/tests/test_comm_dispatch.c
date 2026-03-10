#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "zplc_comm_dispatch.h"

static int dummy_handler_calls = 0;
static zplc_comm_fb_kind_t last_kind;
static uint8_t *last_fb_mem;
static bool last_reset;

static int dummy_handler(zplc_comm_fb_kind_t kind, uint8_t *fb_mem,
                         bool reset) {
  dummy_handler_calls++;
  last_kind = kind;
  last_fb_mem = fb_mem;
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
  int res = zplc_comm_fb_exec(ZPLC_COMM_FB_MB_READ_HREG, &mem[10]);
  assert(res == 0);
  assert(dummy_handler_calls == 0);

  // Trigger
  mem[10] = 1; // EN=1
  res = zplc_comm_fb_exec(ZPLC_COMM_FB_MB_READ_HREG, &mem[10]);
  assert(res == 0);
  assert(dummy_handler_calls == 1);
  assert(last_kind == ZPLC_COMM_FB_MB_READ_HREG);
  assert(last_fb_mem == &mem[10]);
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
  zplc_comm_fb_exec(ZPLC_COMM_FB_MB_READ_HREG, &mem[10]);
  assert(mem[12] == 0);
}

static void test_no_handler(void) {
  printf("test_no_handler...\n");
  uint8_t mem[256] = {0};
  mem[20] = 1; // EN=1

  // Call unregistered FB kind
  int res = zplc_comm_fb_exec(ZPLC_COMM_FB_MB_WRITE_HREG, &mem[20]);
  assert(res == 0);
  assert(mem[20 + 3] == 1); // ERROR should be 1
  // Read STATUS (DINT = 4 bytes)
  uint32_t status = *(uint32_t *)&mem[20 + 4];
  assert(status == ZPLC_COMM_NO_HANDLER);
}

int main(void) {
  printf("Running zplc_comm_dispatch tests...\n");
  test_registration();
  test_exec_handler_call();
  test_auto_reset_pulse();
  test_no_handler();
  printf("All zplc_comm_dispatch tests passed.\n");
  return 0;
}
