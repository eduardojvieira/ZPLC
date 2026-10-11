#include "zplc_comm_fb_access.h"
#include "zplc_config.h"
#include <errno.h>
#include <string.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zplc_comm_dispatch.h>
#include <zplc_comm_req.h>

LOG_MODULE_REGISTER(zplc_comm_modbus, LOG_LEVEL_INF);

/*
 * The Modbus blocks of the scan and the Modbus client are two sides of one
 * request slot (zplc_comm_req.h). The scan, in the handler below, takes a
 * slot, fills it in and queues it; the worker thread runs the request on the
 * client, which waits for the peer, and writes the result into the slot; the
 * scan reads it on a later call. A handler call is a lock held for a few
 * instructions and a queue put that does not wait (COM-003).
 *
 * Handshake: zplc_comm_dispatch.h. START queues one request for a rising EN
 * (COM-004), POLL asks for the result of the request of this block on every
 * scan, RESET lets go of it without releasing what the worker still uses
 * (COM-008).
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

/* HOST is the STRING member between ADDR/COUNT/VALUE and PORT */
#define MODBUS_HOST_BYTES                                                      \
  (ZPLC_COMM_MB_READ_HREG_PORT_OFFSET - ZPLC_COMM_MB_READ_HREG_HOST_OFFSET)

/* The TCP and the RTU client wait for the peer for the configured timeout, once
 * to connect and once to read. A request is allowed that twice and a margin,
 * for each request that may be ahead of it in the queue (COM-018). */
#define MODBUS_REQ_MARGIN_MS 100U

struct modbus_req {
  zplc_comm_req_t head; /* first: the pool of zplc_comm_req.h */
  zplc_comm_fb_kind_t kind;
  uint8_t proto; /* 0 = RTU, 1 = TCP */
  uint8_t unit_id;
  uint16_t addr;
  uint16_t count;
  uint16_t write_val_word;
  bool write_val_bool;
  char host[81];
  uint16_t port;
  /* the outputs of a finished read */
  uint16_t read_reg;
  uint8_t read_coil;
};

static struct modbus_req s_tx_pool[MAX_ASYNC_TX];
/* Guards the state of a slot: the scan thread (claim, poll, abort) and the
 * worker (begin, finish) both move it. */
static struct k_spinlock s_tx_lock;
static k_spinlock_key_t s_tx_key;
static struct k_msgq s_tx_queue;
static struct modbus_req *s_tx_queue_buf[MAX_ASYNC_TX];

static struct k_thread s_handler_thread;
static K_THREAD_STACK_DEFINE(s_handler_stack, 3072);

static void tx_lock(void *context) {
  ARG_UNUSED(context);
  s_tx_key = k_spin_lock(&s_tx_lock);
}

static void tx_unlock(void *context) {
  ARG_UNUSED(context);
  k_spin_unlock(&s_tx_lock, s_tx_key);
}

static const zplc_comm_req_pool_t s_pool = {
    .slots = s_tx_pool,
    .stride = sizeof(struct modbus_req),
    .count = MAX_ASYNC_TX,
    .lock = tx_lock,
    .unlock = tx_unlock,
    .context = NULL,
};

/* Declarations from zplc_modbus_client.c */
extern int zplc_modbus_rtu_client_read_holding(uint8_t slave_id,
                                               uint16_t start_reg,
                                               uint16_t count, uint16_t *out);
extern int zplc_modbus_rtu_client_write_register(uint8_t slave_id, uint16_t reg,
                                                 uint16_t value);
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
extern int zplc_modbus_tcp_client_read_coils(const char *host, uint16_t port,
                                             uint8_t unit_id,
                                             uint16_t start_addr,
                                             uint16_t count, uint8_t *out_bits);
extern int zplc_modbus_tcp_client_write_coil(const char *host, uint16_t port,
                                             uint8_t unit_id, uint16_t addr,
                                             bool state);

/* Run one request on the client; returns 0 or a negative errno. */
static int modbus_run_request(struct modbus_req *tx) {
  uint8_t coils[1] = {0U};
  uint16_t regs[1] = {0U};
  int rc = -ENOTSUP;

  if (tx->proto == 0U) { /* RTU */
    switch (tx->kind) {
    case ZPLC_COMM_FB_MB_READ_HREG:
      rc = zplc_modbus_rtu_client_read_holding(tx->unit_id, tx->addr, tx->count,
                                               regs);
      break;
    case ZPLC_COMM_FB_MB_WRITE_HREG:
      rc = zplc_modbus_rtu_client_write_register(tx->unit_id, tx->addr,
                                                 tx->write_val_word);
      break;
    case ZPLC_COMM_FB_MB_READ_COIL:
      rc = zplc_modbus_rtu_client_read_coils(tx->unit_id, tx->addr, tx->count,
                                             coils);
      break;
    case ZPLC_COMM_FB_MB_WRITE_COIL:
      rc = zplc_modbus_rtu_client_write_coil(tx->unit_id, tx->addr,
                                             tx->write_val_bool);
      break;
    default:
      rc = -ENOTSUP;
    }
  } else if (tx->proto == 1U) { /* TCP */
    switch (tx->kind) {
    case ZPLC_COMM_FB_MB_READ_HREG:
      rc = zplc_modbus_tcp_client_read_holding(tx->host, tx->port, tx->unit_id,
                                               tx->addr, tx->count, regs);
      break;
    case ZPLC_COMM_FB_MB_WRITE_HREG:
      rc = zplc_modbus_tcp_client_write_register(
          tx->host, tx->port, tx->unit_id, tx->addr, tx->write_val_word);
      break;
    case ZPLC_COMM_FB_MB_READ_COIL:
      rc = zplc_modbus_tcp_client_read_coils(tx->host, tx->port, tx->unit_id,
                                             tx->addr, tx->count, coils);
      break;
    case ZPLC_COMM_FB_MB_WRITE_COIL:
      rc = zplc_modbus_tcp_client_write_coil(tx->host, tx->port, tx->unit_id,
                                             tx->addr, tx->write_val_bool);
      break;
    default:
      rc = -ENOTSUP;
    }
  }

  if (rc == 0) {
    tx->read_reg = regs[0];
    tx->read_coil = (uint8_t)(coils[0] & 0x01U);
  }
  return rc;
}

/* The worker's whole turn for one queued request. */
static void modbus_process(struct modbus_req *tx) {
  int result;

  if (!zplc_comm_req_begin(&s_pool, &tx->head)) {
    /* Reset while it waited in the queue: nothing is sent. */
    return;
  }
  result = modbus_run_request(tx);
  /* The result is in the slot before the state says so (the lock orders it). */
  zplc_comm_req_finish(&s_pool, &tx->head,
                       result == 0 ? ZPLC_COMM_HANDLER_DONE
                                   : zplc_comm_fail_from_errno(result));
}

static void modbus_async_thread(void *p1, void *p2, void *p3) {
  ARG_UNUSED(p1);
  ARG_UNUSED(p2);
  ARG_UNUSED(p3);

  while (1) {
    struct modbus_req *tx = NULL;

    if (k_msgq_get(&s_tx_queue, (void *)&tx, K_FOREVER) == 0 && tx != NULL) {
      modbus_process(tx);
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

/* How long a request may take from the call that queued it, in milliseconds. */
static uint32_t modbus_request_timeout_ms(void) {
  const uint32_t timeout = zplc_config_get_modbus_tcp_client_timeout_ms();

  return (2U * timeout + MODBUS_REQ_MARGIN_MS) * MAX_ASYNC_TX;
}

/* START: one request for a rising EN. */
static int modbus_start(zplc_comm_fb_kind_t kind, uint8_t *fb_mem,
                        uint16_t fb_len) {
  struct modbus_req *tx;
  const uint16_t slave =
      zplc_fb_get_u16(fb_mem, fb_len, ZPLC_COMM_MB_READ_HREG_SLAVE_ID_OFFSET);
  const uint8_t proto = fb_mem[ZPLC_COMM_MB_READ_HREG_PROTO_OFFSET];
  const uint16_t count =
      zplc_fb_get_u16(fb_mem, fb_len, ZPLC_COMM_MB_READ_HREG_COUNT_OFFSET);
  const uint16_t port =
      zplc_fb_get_u16(fb_mem, fb_len, ZPLC_COMM_MB_READ_HREG_PORT_OFFSET);

  /* A request that can never be served is refused before it takes a slot. */
  if (proto > 1U || slave > 0xFFU || !validate_modbus_count(kind, count)) {
    return ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_INVALID_ADDR);
  }

  tx = (struct modbus_req *)zplc_comm_req_claim(&s_pool, fb_mem,
                                                k_uptime_get_32());
  if (tx == NULL) {
    /* A full queue is an error with a status code, not a silent wait (COM-008). */
    return ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_QUEUE_FULL);
  }

  tx->kind = kind;
  tx->proto = proto;
  tx->unit_id = (uint8_t)slave;
  tx->addr = zplc_fb_get_u16(fb_mem, fb_len, ZPLC_COMM_MB_READ_HREG_ADDR_OFFSET);
  tx->count = count;
  tx->write_val_word = 0U;
  tx->write_val_bool = false;
  tx->read_reg = 0U;
  tx->read_coil = 0U;
  if (kind == ZPLC_COMM_FB_MB_WRITE_HREG) {
    tx->write_val_word = zplc_fb_get_u16(fb_mem, fb_len,
                                         ZPLC_COMM_MB_WRITE_HREG_VALUE_OFFSET);
  } else if (kind == ZPLC_COMM_FB_MB_WRITE_COIL &&
             zplc_fb_fits(fb_len, ZPLC_COMM_MB_WRITE_COIL_VALUE_OFFSET, 1U)) {
    tx->write_val_bool = fb_mem[ZPLC_COMM_MB_WRITE_COIL_VALUE_OFFSET] != 0U;
  }
  (void)zplc_fb_string_copy(tx->host, sizeof(tx->host), fb_mem, fb_len,
                            ZPLC_COMM_MB_READ_HREG_HOST_OFFSET,
                            MODBUS_HOST_BYTES);
  tx->port = port;
  if (proto == 1U && (tx->host[0] == '\0' || port == 0U)) {
    zplc_comm_req_cancel(&s_pool, &tx->head);
    return ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_INVALID_ADDR);
  }

  zplc_comm_req_submit(&s_pool, &tx->head);
  if (k_msgq_put(&s_tx_queue, (const void *)&tx, K_NO_WAIT) != 0) {
    zplc_comm_req_cancel(&s_pool, &tx->head);
    return ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_QUEUE_FULL);
  }
  return ZPLC_COMM_HANDLER_PENDING;
}

/* POLL: the result of the request of this block, and the outputs of a read. */
static int modbus_poll(zplc_comm_fb_kind_t kind, uint8_t *fb_mem,
                       uint16_t fb_len) {
  zplc_comm_req_t *slot = NULL;
  const int result = zplc_comm_req_peek(&s_pool, fb_mem, k_uptime_get_32(),
                                        modbus_request_timeout_ms(), &slot);

  if (result == ZPLC_COMM_HANDLER_DONE && slot != NULL) {
    const struct modbus_req *tx = (const struct modbus_req *)slot;

    /* The result lands in VALUE and nowhere else (COM-001). */
    if (kind == ZPLC_COMM_FB_MB_READ_HREG &&
        zplc_fb_fits(fb_len, ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET, 2U)) {
      fb_mem[ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET] = (uint8_t)(tx->read_reg & 0xFFU);
      fb_mem[ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET + 1U] =
          (uint8_t)((tx->read_reg >> 8) & 0xFFU);
    } else if (kind == ZPLC_COMM_FB_MB_READ_COIL &&
               zplc_fb_fits(fb_len, ZPLC_COMM_MB_READ_COIL_VALUE_OFFSET, 1U)) {
      fb_mem[ZPLC_COMM_MB_READ_COIL_VALUE_OFFSET] = tx->read_coil;
    }
    zplc_comm_req_release(&s_pool, slot);
  }
  return result;
}

/*
 * Handler called by the VM through the dispatcher. It runs in the scan thread:
 * nothing here waits for the network.
 */
int zplc_comm_modbus_handler(zplc_comm_fb_kind_t kind, uint8_t *fb_mem,
                             uint16_t fb_len, zplc_comm_call_t call) {
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

  switch (call) {
  case ZPLC_COMM_CALL_RESET:
    // Let go of the request of this block. One that is queued or running is
    // still in use by the worker (its buffers, and its place in the queue):
    // it is abandoned and the worker frees it; only a finished one is freed
    // here (COM-008).
    zplc_comm_req_abort(&s_pool, fb_mem);
    /* the instance is as new again: the result of a read goes too */
    if (kind == ZPLC_COMM_FB_MB_READ_HREG &&
        zplc_fb_fits(fb_len, ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET, 2U)) {
      fb_mem[ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET] = 0U;
      fb_mem[ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET + 1U] = 0U;
    } else if (kind == ZPLC_COMM_FB_MB_READ_COIL &&
               zplc_fb_fits(fb_len, ZPLC_COMM_MB_READ_COIL_VALUE_OFFSET, 1U)) {
      fb_mem[ZPLC_COMM_MB_READ_COIL_VALUE_OFFSET] = 0U;
    }
    return ZPLC_COMM_HANDLER_DONE;
  case ZPLC_COMM_CALL_START:
    return modbus_start(kind, fb_mem, fb_len);
  case ZPLC_COMM_CALL_POLL:
  default:
    return modbus_poll(kind, fb_mem, fb_len);
  }
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
