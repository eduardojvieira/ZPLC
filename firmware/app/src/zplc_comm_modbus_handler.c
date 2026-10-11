#include "zplc_comm_fb_access.h"
#include "zplc_config.h"
#include <errno.h>
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
/*
 * The result of a read goes to VALUE, the only member of the block that holds
 * one: a UINT for registers, a BOOL for coils (COM-001). A count above what
 * VALUE holds would run the result over HOST and PORT, and with a large count
 * past the end of the block, so it is refused. Reading several registers
 * needs a result member the block layout does not have yet.
 */
#define MAX_MODBUS_REG_COUNT 1U
#define MAX_MODBUS_COIL_COUNT 1U
#define MAX_MODBUS_COIL_BYTES ((MAX_MODBUS_COIL_COUNT + 7U) / 8U)

/* HOST is the STRING member between ADDR/COUNT/VALUE and PORT */
#define MODBUS_HOST_BYTES                                                      \
  (ZPLC_COMM_MB_READ_HREG_PORT_OFFSET - ZPLC_COMM_MB_READ_HREG_HOST_OFFSET)

typedef enum {
  TX_STATE_FREE = 0,
  /* Taken by the scan thread, being filled in; not yet in the queue. */
  TX_STATE_CLAIMED,
  TX_STATE_QUEUED,
  TX_STATE_PROCESSING,
  TX_STATE_DONE,
  /* The block was reset while the request was queued or running: the worker
   * still owns the slot, and frees it itself when it is through (COM-008). */
  TX_STATE_ABANDONED
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
/* Guards the state of a slot: the scan thread (reset, allocate, complete) and
 * the worker both move it. */
static struct k_spinlock s_tx_lock;
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
      k_spinlock_key_t key = k_spin_lock(&s_tx_lock);

      if (tx->state == TX_STATE_ABANDONED) {
        /* Reset while it waited in the queue: nothing is sent. */
        tx->state = TX_STATE_FREE;
        k_spin_unlock(&s_tx_lock, key);
        continue;
      }
      tx->state = TX_STATE_PROCESSING;
      k_spin_unlock(&s_tx_lock, key);

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
      key = k_spin_lock(&s_tx_lock);
      /* The block was reset while this request ran: its result belongs to
       * nobody, and the slot is free again only now that the worker has
       * stopped using it. */
      tx->state = (tx->state == TX_STATE_ABANDONED) ? TX_STATE_FREE
                                                    : TX_STATE_DONE;
      k_spin_unlock(&s_tx_lock, key);
    }
  }
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
    return count <= MAX_MODBUS_COIL_COUNT;
  default:
    return false;
  }
}

/* The count has been validated against what VALUE holds; the words are read
 * through the bounded accessor all the same. */
static void copy_modbus_write_words(struct modbus_async_tx *tx,
                                    const uint8_t *fb_mem, uint16_t fb_len) {
  for (uint16_t i = 0U; i < tx->count && i < MAX_MODBUS_REG_COUNT; i++) {
    tx->read_regs[i] = zplc_fb_get_u16(
        fb_mem, fb_len,
        (uint16_t)(ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET + (i * 2U)));
  }

  tx->write_val_word = tx->read_regs[0];
}

//
// Handler called by the VM OP_COMM_EXEC instruction.
// This runs in the VM scan loop thread. Zero blocking allowed.
//
int zplc_comm_modbus_handler(zplc_comm_fb_kind_t kind, uint8_t *fb_mem,
                             uint16_t fb_len, bool is_reset) {
  // The block is the instance of one of the four Modbus kinds; every offset
  // below is inside the layout the table gives that kind (COM-001).
  switch (kind) {
  case ZPLC_COMM_FB_MB_READ_HREG:
  case ZPLC_COMM_FB_MB_WRITE_HREG:
  case ZPLC_COMM_FB_MB_READ_COIL:
  case ZPLC_COMM_FB_MB_WRITE_COIL:
    break;
  default:
    return -EINVAL;
  }
  if (fb_mem == NULL || fb_len < zplc_comm_fb_size((uint32_t)kind)) {
    return -EINVAL;
  }

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

    // Release the transaction of this block. A slot that is queued or being
    // processed is still in use by the worker (its buffers, and its place in
    // the queue): it is abandoned and the worker frees it; only a finished
    // one is freed here (COM-008).
    for (int i = 0; i < MAX_ASYNC_TX; i++) {
      k_spinlock_key_t key = k_spin_lock(&s_tx_lock);

      if (s_tx_pool[i].fb_mem_ptr == fb_mem) {
        if (s_tx_pool[i].state == TX_STATE_QUEUED ||
            s_tx_pool[i].state == TX_STATE_PROCESSING) {
          s_tx_pool[i].state = TX_STATE_ABANDONED;
        } else if (s_tx_pool[i].state == TX_STATE_DONE) {
          s_tx_pool[i].state = TX_STATE_FREE;
        }
      }
      k_spin_unlock(&s_tx_lock, key);
    }
    return 0;
  }

  bool en = fb_mem[0] != 0;

  // Clear edge pulses
  fb_mem[2] = 0; // DONE
  fb_mem[3] = 0; // ERROR

  // Check if there is an active transaction for this FB. An abandoned one
  // belongs to the worker until it frees it, and is not this block's.
  struct modbus_async_tx *tx = NULL;
  for (int i = 0; i < MAX_ASYNC_TX; i++) {
    if (s_tx_pool[i].state != TX_STATE_FREE &&
        s_tx_pool[i].state != TX_STATE_ABANDONED &&
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
          for (uint16_t i = 0U; i < tx->count && i < MAX_MODBUS_REG_COUNT;
               i++) {
            uint16_t offset = (uint16_t)(15U + (i * 2U));
            if (!zplc_fb_fits(fb_len, offset, 2U)) {
              break;
            }
            fb_mem[offset] = (uint8_t)(tx->read_regs[i] & 0xFFU);
            fb_mem[offset + 1U] = (uint8_t)((tx->read_regs[i] >> 8) & 0xFFU);
          }
        } else if (kind == ZPLC_COMM_FB_MB_READ_COIL) {
          for (uint16_t i = 0U; i < tx->count && i < MAX_MODBUS_COIL_COUNT;
               i++) {
            uint16_t byte_index = (uint16_t)(i / 8U);
            uint8_t bit_index = (uint8_t)(i % 8U);
            if (!zplc_fb_fits(fb_len, 15U + i, 1U)) {
              break;
            }
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
    {
      k_spinlock_key_t key = k_spin_lock(&s_tx_lock);

      for (int i = 0; i < MAX_ASYNC_TX; i++) {
        if (s_tx_pool[i].state == TX_STATE_FREE) {
          tx = &s_tx_pool[i];
          /* Taken before the lock is released: a slot is free or owned. */
          tx->state = TX_STATE_CLAIMED;
          break;
        }
      }
      k_spin_unlock(&s_tx_lock, key);
    }

    if (tx == NULL) {
      // A full queue is an error with a status code, not a silent wait
      // (COM-008). The whole STATUS word is written, so no byte of an
      // earlier status stays in it.
      fb_mem[1] = 0; // BUSY=false
      fb_mem[3] = 1; // ERROR=true
      fb_mem[4] = ZPLC_COMM_QUEUE_FULL;
      fb_mem[5] = 0;
      fb_mem[6] = 0;
      fb_mem[7] = 0;
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
      copy_modbus_write_words(tx, fb_mem, fb_len);
    } else if (kind == ZPLC_COMM_FB_MB_WRITE_COIL) {
      tx->write_val_bool = fb_mem[15] != 0;
    }

    (void)zplc_fb_string_copy(tx->host, sizeof(tx->host), fb_mem, fb_len,
                              ZPLC_COMM_MB_READ_HREG_HOST_OFFSET,
                              MODBUS_HOST_BYTES);
    tx->port = zplc_fb_get_u16(fb_mem, fb_len,
                               ZPLC_COMM_MB_READ_HREG_PORT_OFFSET);

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
                  NULL, NULL, NULL,
                  K_PRIO_PREEMPT(ZPLC_COMM_THREAD_PRIORITY), 0,
                  K_NO_WAIT);
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
