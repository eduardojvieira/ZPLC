#include "zplc_config.h"
#include <string.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/sys/barrier.h>
#include <zplc_comm_dispatch.h>

LOG_MODULE_REGISTER(zplc_comm_modbus, LOG_LEVEL_INF);

/*
 * The Modbus async handler bridges the synchronous VM core to the async
 * Zephyr Modbus client subsystem.
 */

#define MAX_ASYNC_TX 8
#define MAX_MODBUS_REG_COUNT 123
#define MAX_MODBUS_COIL_BYTES 250

typedef enum {
  TX_STATE_FREE = 0,
  TX_STATE_QUEUED,
  TX_STATE_PROCESSING,
  TX_STATE_DONE
} tx_state_t;

struct modbus_async_tx {
  tx_state_t state;
  uint8_t *fb_mem_ptr;
  zplc_comm_fb_kind_t kind;
  uint8_t proto; // 0=RTU, 1=TCP
  uint8_t unit_id;
  uint16_t addr;
  uint16_t count;
  uint16_t write_val_word;
  bool write_val_bool;
  char host[81];
  uint16_t port;
  int status;
  uint16_t read_regs[MAX_MODBUS_REG_COUNT];
  uint8_t read_coils[MAX_MODBUS_COIL_BYTES];
};

static struct modbus_async_tx s_tx_pool[MAX_ASYNC_TX];
static struct k_msgq s_tx_queue;
static struct modbus_async_tx *s_tx_queue_buf[MAX_ASYNC_TX];

static struct k_thread s_handler_thread;
static K_THREAD_STACK_DEFINE(s_handler_stack, 2048);

/* Declarations from zplc_modbus_client.c */
extern int zplc_modbus_rtu_client_read_holding(uint8_t slave_id,
                                               uint16_t start_reg,
                                               uint16_t count, uint16_t *out);
extern int zplc_modbus_rtu_client_write_register(uint8_t slave_id, uint16_t reg,
                                                 uint16_t value);
extern int zplc_modbus_rtu_client_write_multiple(uint8_t slave_id,
                                                 uint16_t start_reg,
                                                 uint16_t count,
                                                 const uint16_t *values);
extern int zplc_modbus_rtu_client_read_coils(uint8_t slave_id,
                                             uint16_t start_addr,
                                             uint16_t count, uint8_t *out_bits);
extern int zplc_modbus_rtu_client_write_coil(uint8_t slave_id, uint16_t addr,
                                             bool state);

extern int zplc_modbus_tcp_client_read_holding(const char *host, uint16_t port,
                                               uint8_t unit_id,
                                               uint16_t start_reg,
                                               uint16_t count, uint16_t *out);
extern int zplc_modbus_tcp_client_write_register(const char *host,
                                                 uint16_t port, uint8_t unit_id,
                                                 uint16_t reg, uint16_t value);
extern int zplc_modbus_tcp_client_write_multiple(const char *host, uint16_t port,
                                                 uint8_t unit_id,
                                                 uint16_t start_reg,
                                                 uint16_t count,
                                                 const uint16_t *values);
extern int zplc_modbus_tcp_client_read_coils(const char *host, uint16_t port,
                                             uint8_t unit_id,
                                             uint16_t start_addr,
                                             uint16_t count, uint8_t *out_bits);
extern int zplc_modbus_tcp_client_write_coil(const char *host, uint16_t port,
                                             uint8_t unit_id, uint16_t addr,
                                             bool state);

static void modbus_async_thread(void *p1, void *p2, void *p3) {
  ARG_UNUSED(p1);
  ARG_UNUSED(p2);
  ARG_UNUSED(p3);

  while (1) {
    struct modbus_async_tx *tx = NULL;
    if (k_msgq_get(&s_tx_queue, (void *)&tx, K_FOREVER) == 0) {
      tx->state = TX_STATE_PROCESSING;

      int rc = -ENOTSUP;

      // Execute the request based on proto and kind
      if (tx->proto == 0) { // RTU
        switch (tx->kind) {
        case ZPLC_COMM_FB_MB_READ_HREG:
          rc = zplc_modbus_rtu_client_read_holding(tx->unit_id, tx->addr,
                                                   tx->count, tx->read_regs);
          break;
        case ZPLC_COMM_FB_MB_WRITE_HREG:
          if (tx->count > 1U) {
            rc = zplc_modbus_rtu_client_write_multiple(tx->unit_id, tx->addr,
                                                       tx->count,
                                                       tx->read_regs);
          } else {
            rc = zplc_modbus_rtu_client_write_register(tx->unit_id, tx->addr,
                                                       tx->write_val_word);
          }
          break;
        case ZPLC_COMM_FB_MB_READ_COIL:
          rc = zplc_modbus_rtu_client_read_coils(tx->unit_id, tx->addr,
                                                 tx->count, tx->read_coils);
          break;
        case ZPLC_COMM_FB_MB_WRITE_COIL:
          rc = zplc_modbus_rtu_client_write_coil(tx->unit_id, tx->addr,
                                                 tx->write_val_bool);
          break;
        default:
          rc = -ENOTSUP;
        }
      } else if (tx->proto == 1) { // TCP
        switch (tx->kind) {
        case ZPLC_COMM_FB_MB_READ_HREG:
          rc = zplc_modbus_tcp_client_read_holding(
              tx->host, tx->port, tx->unit_id, tx->addr, tx->count,
              tx->read_regs);
          break;
        case ZPLC_COMM_FB_MB_WRITE_HREG:
          if (tx->count > 1U) {
            rc = zplc_modbus_tcp_client_write_multiple(
                tx->host, tx->port, tx->unit_id, tx->addr, tx->count,
                tx->read_regs);
          } else {
            rc = zplc_modbus_tcp_client_write_register(
                tx->host, tx->port, tx->unit_id, tx->addr, tx->write_val_word);
          }
          break;
        case ZPLC_COMM_FB_MB_READ_COIL:
          rc = zplc_modbus_tcp_client_read_coils(
              tx->host, tx->port, tx->unit_id, tx->addr, tx->count,
              tx->read_coils);
          break;
        case ZPLC_COMM_FB_MB_WRITE_COIL:
          rc = zplc_modbus_tcp_client_write_coil(
              tx->host, tx->port, tx->unit_id, tx->addr, tx->write_val_bool);
          break;
        default:
          rc = -ENOTSUP;
        }
      }

      // Set result and mark as done
      tx->status = rc;

      // Memory barrier to ensure VM sees the done state after result
      barrier_dmem_fence_full();
      tx->state = TX_STATE_DONE;
    }
  }
}

// Extract string utility
static void extract_string(uint8_t *fb_mem, uint16_t offset, char *dest,
                           size_t max_len) {
  uint16_t len = fb_mem[offset] | (fb_mem[offset + 1] << 8);
  // uint16_t cap = fb_mem[offset + 2] | (fb_mem[offset + 3] << 8);
  uint16_t copy_len = len < (max_len - 1) ? len : (max_len - 1);

  memcpy(dest, &fb_mem[offset + 4], copy_len);
  dest[copy_len] = '\0';
}

static bool validate_modbus_count(zplc_comm_fb_kind_t kind, uint16_t count) {
  if (count == 0U) {
    return false;
  }

  switch (kind) {
  case ZPLC_COMM_FB_MB_READ_HREG:
  case ZPLC_COMM_FB_MB_WRITE_HREG:
    return count <= MAX_MODBUS_REG_COUNT;
  case ZPLC_COMM_FB_MB_READ_COIL:
  case ZPLC_COMM_FB_MB_WRITE_COIL:
    return count <= 2000U;
  default:
    return false;
  }
}

static void copy_modbus_write_words(struct modbus_async_tx *tx,
                                    const uint8_t *fb_mem) {
  for (uint16_t i = 0U; i < tx->count; i++) {
    uint16_t offset = (uint16_t)(15U + (i * 2U));
    tx->read_regs[i] = (uint16_t)(fb_mem[offset] | (fb_mem[offset + 1U] << 8));
  }

  tx->write_val_word = tx->read_regs[0];
}

//
// Handler called by the VM OP_COMM_EXEC instruction.
// This runs in the VM scan loop thread. Zero blocking allowed.
//
int zplc_comm_modbus_handler(zplc_comm_fb_kind_t kind, uint8_t *fb_mem,
                             bool is_reset) {
  // Memory layout offsets:
  // +0: EN, +1: BUSY, +2: DONE, +3: ERROR, +4..7: STATUS
  // +8: PROTO, +9: SLAVE_ID(UINT), +11: ADDR(UINT), +13: COUNT(UINT)
  // +15: VALUE (UINT or BOOL)
  // +18: HOST (STRING)
  // +103: PORT(UINT)

  if (is_reset) {
    fb_mem[1] = 0; // BUSY
    fb_mem[2] = 0; // DONE
    fb_mem[3] = 0; // ERROR
    fb_mem[4] = 0;
    fb_mem[5] = 0;
    fb_mem[6] = 0;
    fb_mem[7] = 0; // STATUS

    // Find and free pending transaction
    for (int i = 0; i < MAX_ASYNC_TX; i++) {
      if (s_tx_pool[i].state != TX_STATE_FREE &&
          s_tx_pool[i].fb_mem_ptr == fb_mem) {
        s_tx_pool[i].state = TX_STATE_FREE;
      }
    }
    return 0;
  }

  bool en = fb_mem[0] != 0;

  // Clear edge pulses
  fb_mem[2] = 0; // DONE
  fb_mem[3] = 0; // ERROR

  // Check if there is an active transaction for this FB
  struct modbus_async_tx *tx = NULL;
  for (int i = 0; i < MAX_ASYNC_TX; i++) {
    if (s_tx_pool[i].state != TX_STATE_FREE &&
        s_tx_pool[i].fb_mem_ptr == fb_mem) {
      tx = &s_tx_pool[i];
      break;
    }
  }

  if (tx != NULL) {
    if (tx->state == TX_STATE_DONE) {
      // Transaction complete!
      fb_mem[1] = 0; // BUSY=false
      fb_mem[2] = 1; // DONE=true

      if (tx->status != 0) {
        fb_mem[3] = 1; // ERROR=true
      } else {
        // Map outputs based on kind
        if (kind == ZPLC_COMM_FB_MB_READ_HREG) {
          for (uint16_t i = 0U; i < tx->count; i++) {
            uint16_t offset = (uint16_t)(15U + (i * 2U));
            fb_mem[offset] = (uint8_t)(tx->read_regs[i] & 0xFFU);
            fb_mem[offset + 1U] = (uint8_t)((tx->read_regs[i] >> 8) & 0xFFU);
          }
        } else if (kind == ZPLC_COMM_FB_MB_READ_COIL) {
          for (uint16_t i = 0U; i < tx->count; i++) {
            uint16_t byte_index = (uint16_t)(i / 8U);
            uint8_t bit_index = (uint8_t)(i % 8U);
            fb_mem[15U + i] =
                (uint8_t)((tx->read_coils[byte_index] >> bit_index) & 0x01U);
          }
        }
      }

      // Map status
      fb_mem[4] = tx->status & 0xFF;
      fb_mem[5] = (tx->status >> 8) & 0xFF;
      fb_mem[6] = (tx->status >> 16) & 0xFF;
      fb_mem[7] = (tx->status >> 24) & 0xFF;

      // Free transaction
      tx->state = TX_STATE_FREE;
    }
    return 0; // Still busy or just completed
  }

  // No active transaction. Should we start one?
  if (en) {
    // Allocate transaction
    for (int i = 0; i < MAX_ASYNC_TX; i++) {
      if (s_tx_pool[i].state == TX_STATE_FREE) {
        tx = &s_tx_pool[i];
        break;
      }
    }

    if (tx == NULL) {
      fb_mem[3] = 1; // ERROR=true
      // Status ZPLC_COMM_QUEUE_FULL = 5
      fb_mem[4] = ZPLC_COMM_QUEUE_FULL;
      fb_mem[5] = 0;
      return 0;
    }

    // Initialize transaction
    tx->fb_mem_ptr = fb_mem;
    tx->kind = kind;
    tx->proto = fb_mem[8];
    tx->unit_id = fb_mem[9] | (fb_mem[10] << 8);
    tx->addr = fb_mem[11] | (fb_mem[12] << 8);
    tx->count = fb_mem[13] | (fb_mem[14] << 8);

    if (!validate_modbus_count(kind, tx->count)) {
      tx->state = TX_STATE_FREE;
      fb_mem[1] = 0;
      fb_mem[3] = 1;
      fb_mem[4] = ZPLC_COMM_INVALID_ADDR;
      fb_mem[5] = 0;
      fb_mem[6] = 0;
      fb_mem[7] = 0;
      return 0;
    }

    if (kind == ZPLC_COMM_FB_MB_WRITE_HREG) {
      copy_modbus_write_words(tx, fb_mem);
    } else if (kind == ZPLC_COMM_FB_MB_WRITE_COIL) {
      tx->write_val_bool = fb_mem[15] != 0;
    }

    extract_string(fb_mem, 18, tx->host, sizeof(tx->host));
    tx->port = fb_mem[103] | (fb_mem[104] << 8);

    tx->state = TX_STATE_QUEUED;

    fb_mem[1] = 1; // BUSY=true

    // Enqueue
    k_msgq_put(&s_tx_queue, (const void *)&tx, K_NO_WAIT);
  }

  return 0;
}

int zplc_comm_modbus_handler_init(void) {
  k_msgq_init(&s_tx_queue, (char *)s_tx_queue_buf, sizeof(void *),
              MAX_ASYNC_TX);

  k_thread_create(&s_handler_thread, s_handler_stack,
                  K_THREAD_STACK_SIZEOF(s_handler_stack), modbus_async_thread,
                  NULL, NULL, NULL, K_PRIO_PREEMPT(8), 0, K_NO_WAIT);
  k_thread_name_set(&s_handler_thread, "modbus_fb_worker");

  zplc_comm_register_handler(ZPLC_COMM_FB_MB_READ_HREG,
                             zplc_comm_modbus_handler);
  zplc_comm_register_handler(ZPLC_COMM_FB_MB_WRITE_HREG,
                             zplc_comm_modbus_handler);
  zplc_comm_register_handler(ZPLC_COMM_FB_MB_READ_COIL,
                             zplc_comm_modbus_handler);
  zplc_comm_register_handler(ZPLC_COMM_FB_MB_WRITE_COIL,
                             zplc_comm_modbus_handler);

  return 0;
}
