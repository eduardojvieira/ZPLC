/**
 * @file test_comm_handler_modbus.c
 * @brief The Modbus function-block handler against crafted blocks (COM-001).
 *
 * The handler source of firmware/app is compiled here against a stand-in for
 * the few Zephyr calls it makes, and called with blocks allocated at exactly
 * the length the core passes: a read or a write outside the block is trapped
 * by the address sanitizer. The worker thread is not started; the test plays
 * its part by completing the queued transaction.
 *
 * This is host evidence about the handler logic. It is not target evidence:
 * the Zephyr build, the scheduler interplay and the Modbus link are not run.
 *
 * SPDX-License-Identifier: MIT
 */
#ifdef NDEBUG
#undef NDEBUG
#endif
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../../../app/src/zplc_comm_modbus_handler.c"

/* --- stand-ins for what the handler links against ------------------------- */
int k_msgq_get(struct k_msgq *queue, void *data, int timeout) {
  (void)queue; (void)data; (void)timeout;
  return -1;
}
static int queued;
int k_msgq_put(struct k_msgq *queue, const void *data, int timeout) {
  (void)queue; (void)data; (void)timeout;
  queued++;
  return 0;
}
void k_msgq_init(struct k_msgq *queue, char *buffer, size_t size,
                 uint32_t count) {
  (void)queue; (void)buffer; (void)size; (void)count;
}
int k_thread_create(struct k_thread *thread, char *stack, size_t size,
                    k_thread_entry_t entry, void *a, void *b, void *c,
                    int priority, uint32_t options, int delay) {
  (void)thread; (void)stack; (void)size; (void)entry; (void)a; (void)b;
  (void)c; (void)priority; (void)options; (void)delay;
  return 0;
}
int k_thread_name_set(struct k_thread *thread, const char *name) {
  (void)thread; (void)name;
  return 0;
}
int zplc_modbus_rtu_client_read_holding(uint8_t s, uint16_t r, uint16_t c, uint16_t *o) {
  (void)s; (void)r; (void)c; (void)o; return 0;
}
int zplc_modbus_rtu_client_write_register(uint8_t s, uint16_t r, uint16_t v) {
  (void)s; (void)r; (void)v; return 0;
}
int zplc_modbus_rtu_client_write_multiple(uint8_t s, uint16_t r, uint16_t c, const uint16_t *v) {
  (void)s; (void)r; (void)c; (void)v; return 0;
}
int zplc_modbus_rtu_client_read_coils(uint8_t s, uint16_t a, uint16_t c, uint8_t *o) {
  (void)s; (void)a; (void)c; (void)o; return 0;
}
int zplc_modbus_rtu_client_write_coil(uint8_t s, uint16_t a, bool v) {
  (void)s; (void)a; (void)v; return 0;
}
int zplc_modbus_tcp_client_read_holding(const char *h, uint16_t p, uint8_t u, uint16_t r, uint16_t c, uint16_t *o) {
  (void)h; (void)p; (void)u; (void)r; (void)c; (void)o; return 0;
}
int zplc_modbus_tcp_client_write_register(const char *h, uint16_t p, uint8_t u, uint16_t r, uint16_t v) {
  (void)h; (void)p; (void)u; (void)r; (void)v; return 0;
}
int zplc_modbus_tcp_client_write_multiple(const char *h, uint16_t p, uint8_t u, uint16_t r, uint16_t c, const uint16_t *v) {
  (void)h; (void)p; (void)u; (void)r; (void)c; (void)v; return 0;
}
int zplc_modbus_tcp_client_read_coils(const char *h, uint16_t p, uint8_t u, uint16_t a, uint16_t c, uint8_t *o) {
  (void)h; (void)p; (void)u; (void)a; (void)c; (void)o; return 0;
}
int zplc_modbus_tcp_client_write_coil(const char *h, uint16_t p, uint8_t u, uint16_t a, bool v) {
  (void)h; (void)p; (void)u; (void)a; (void)v; return 0;
}

/* --- helpers ------------------------------------------------------------- */
static const zplc_comm_fb_kind_t kinds[4] = {
    ZPLC_COMM_FB_MB_READ_HREG, ZPLC_COMM_FB_MB_WRITE_HREG,
    ZPLC_COMM_FB_MB_READ_COIL, ZPLC_COMM_FB_MB_WRITE_COIL};

static uint8_t *block(void) {
  uint8_t *memory = (uint8_t *)malloc(ZPLC_COMM_MB_READ_HREG_SIZE);
  assert(memory != NULL);
  memset(memory, 0, ZPLC_COMM_MB_READ_HREG_SIZE);
  return memory;
}

static void set_u16(uint8_t *memory, unsigned offset, uint16_t value) {
  memory[offset] = (uint8_t)value;
  memory[offset + 1U] = (uint8_t)(value >> 8);
}

static void reset_pool(void) {
  memset(s_tx_pool, 0, sizeof(s_tx_pool));
  queued = 0;
}

static uint32_t status_of(const uint8_t *memory) {
  return (uint32_t)memory[4] | ((uint32_t)memory[5] << 8) |
         ((uint32_t)memory[6] << 16) | ((uint32_t)memory[7] << 24);
}

static int call(zplc_comm_fb_kind_t kind, uint8_t *memory, uint16_t length) {
  return zplc_comm_modbus_handler(kind, memory, length, false);
}

/* A count the VALUE member cannot hold is refused with a defined status and
 * nothing is queued; a count it can hold is accepted. */
static void test_count_is_validated_against_the_result_member(void) {
  static const uint16_t counts[] = {2U, 3U, 47U, 48U, 110U, 123U, 124U,
                                    250U, 2000U, 2001U, 0xFFFFU};
  size_t kind, index;
  printf("test_count_is_validated_against_the_result_member...\n");

  for (kind = 0U; kind < 4U; kind++) {
    for (index = 0U; index < sizeof(counts) / sizeof(counts[0]); index++) {
      uint8_t *memory = block();
      reset_pool();
      memory[0] = 1; /* EN */
      set_u16(memory, ZPLC_COMM_MB_READ_HREG_COUNT_OFFSET, counts[index]);
      assert(call(kinds[kind], memory, ZPLC_COMM_MB_READ_HREG_SIZE) == 0);
      assert(memory[1] == 0);                      /* not busy */
      assert(memory[3] == 1);                      /* ERROR */
      assert(status_of(memory) == ZPLC_COMM_INVALID_ADDR);
      assert(queued == 0);
      free(memory);
    }

    {
      uint8_t *memory = block();
      reset_pool();
      memory[0] = 1;
      set_u16(memory, ZPLC_COMM_MB_READ_HREG_COUNT_OFFSET, 1U);
      assert(call(kinds[kind], memory, ZPLC_COMM_MB_READ_HREG_SIZE) == 0);
      assert(memory[1] == 1 && memory[3] == 0);    /* busy, no error */
      assert(queued == 1);
      free(memory);
    }
  }
}

/* The limits are what VALUE holds: the result ends before HOST begins. */
static void test_result_buffer_does_not_overlap_the_parameters(void) {
  printf("test_result_buffer_does_not_overlap_the_parameters...\n");
  assert(ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET + 2U * MAX_MODBUS_REG_COUNT <=
         ZPLC_COMM_MB_READ_HREG_HOST_OFFSET);
  assert(ZPLC_COMM_MB_READ_COIL_VALUE_OFFSET + MAX_MODBUS_COIL_COUNT <=
         ZPLC_COMM_MB_READ_COIL_HOST_OFFSET);
}

/* The completed read lands in VALUE and nowhere else. */
static void test_read_result_stays_in_value(void) {
  uint8_t *memory = block();
  size_t i;
  printf("test_read_result_stays_in_value...\n");

  reset_pool();
  memory[0] = 1;
  memory[ZPLC_COMM_MB_READ_HREG_HOST_OFFSET - 1U] = 0x77;
  set_u16(memory, ZPLC_COMM_MB_READ_HREG_HOST_OFFSET, 3U);
  memcpy(&memory[ZPLC_COMM_MB_READ_HREG_HOST_OFFSET + 4U], "abc", 3U);
  set_u16(memory, ZPLC_COMM_MB_READ_HREG_COUNT_OFFSET, 1U);
  assert(call(ZPLC_COMM_FB_MB_READ_HREG, memory, ZPLC_COMM_MB_READ_HREG_SIZE) == 0);
  assert(queued == 1);
  for (i = 0U; i < MAX_ASYNC_TX; i++) {
    if (s_tx_pool[i].state == TX_STATE_QUEUED) {
      assert(strcmp(s_tx_pool[i].host, "abc") == 0);
      s_tx_pool[i].read_regs[0] = 0xBEEFU;
      s_tx_pool[i].status = 0;
      s_tx_pool[i].state = TX_STATE_DONE;
    }
  }
  assert(call(ZPLC_COMM_FB_MB_READ_HREG, memory, ZPLC_COMM_MB_READ_HREG_SIZE) == 0);
  assert(memory[2] == 1 && memory[1] == 0);        /* DONE */
  assert(memory[ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET] == 0xEF);
  assert(memory[ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET + 1] == 0xBE);
  assert(memory[ZPLC_COMM_MB_READ_HREG_HOST_OFFSET - 1U] == 0x77); /* padding */
  assert(memory[ZPLC_COMM_MB_READ_HREG_HOST_OFFSET] == 3U);        /* HOST */
  assert(memcmp(&memory[ZPLC_COMM_MB_READ_HREG_HOST_OFFSET + 4U], "abc", 3U) == 0);
  free(memory);
}

/* HOST claims a length far beyond its member and the block. */
static void test_host_length_is_bounded(void) {
  uint8_t *memory = block();
  size_t i;
  printf("test_host_length_is_bounded...\n");

  reset_pool();
  memory[0] = 1;
  set_u16(memory, ZPLC_COMM_MB_READ_HREG_COUNT_OFFSET, 1U);
  set_u16(memory, ZPLC_COMM_MB_READ_HREG_HOST_OFFSET, 0xFFFFU);
  set_u16(memory, ZPLC_COMM_MB_READ_HREG_HOST_OFFSET + 2U, 0xFFFFU);
  memset(&memory[ZPLC_COMM_MB_READ_HREG_HOST_OFFSET + 4U], 'h',
         ZPLC_COMM_MB_READ_HREG_PORT_OFFSET -
             ZPLC_COMM_MB_READ_HREG_HOST_OFFSET - 4U);
  assert(call(ZPLC_COMM_FB_MB_READ_HREG, memory, ZPLC_COMM_MB_READ_HREG_SIZE) == 0);
  for (i = 0U; i < MAX_ASYNC_TX; i++) {
    if (s_tx_pool[i].state == TX_STATE_QUEUED) {
      assert(strlen(s_tx_pool[i].host) == sizeof(s_tx_pool[i].host) - 1U);
    }
  }
  free(memory);
}

/* A block shorter than its kind is refused before anything is read. */
static void test_short_block_is_refused(void) {
  uint8_t *memory = (uint8_t *)malloc(ZPLC_COMM_MB_READ_HREG_SIZE - 1U);
  printf("test_short_block_is_refused...\n");

  assert(memory != NULL);
  memset(memory, 0, ZPLC_COMM_MB_READ_HREG_SIZE - 1U);
  memory[0] = 1;
  reset_pool();
  assert(call(ZPLC_COMM_FB_MB_READ_HREG, memory,
              ZPLC_COMM_MB_READ_HREG_SIZE - 1U) < 0);
  assert(zplc_comm_modbus_handler(ZPLC_COMM_FB_MB_READ_HREG, memory,
                                  ZPLC_COMM_MB_READ_HREG_SIZE - 1U, true) < 0);
  assert(zplc_comm_modbus_handler(ZPLC_COMM_FB_MQTT_CONNECT, memory, 12U,
                                  false) < 0);
  assert(queued == 0 && memory[1] == 0);
  free(memory);
}

int main(void) {
  printf("Running Modbus handler tests...\n");
  test_count_is_validated_against_the_result_member();
  test_result_buffer_does_not_overlap_the_parameters();
  test_read_result_stays_in_value();
  test_host_length_is_bounded();
  test_short_block_is_refused();
  printf("All Modbus handler tests passed.\n");
  return 0;
}
