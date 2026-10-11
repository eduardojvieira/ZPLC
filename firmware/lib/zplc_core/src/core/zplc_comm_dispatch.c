#include "zplc_comm_dispatch.h"
#include "zplc_bytes.h"
#include <errno.h>
#include <stddef.h>

#define MAX_HANDLERS 16

typedef struct {
  zplc_comm_fb_kind_t kind;
  zplc_comm_handler_t handler;
} handler_entry_t;

static handler_entry_t s_handlers[MAX_HANDLERS];
static int s_num_handlers = 0;

static zplc_comm_handler_t get_handler(zplc_comm_fb_kind_t kind) {
  for (int i = 0; i < s_num_handlers; i++) {
    if (s_handlers[i].kind == kind) {
      return s_handlers[i].handler;
    }
  }
  return NULL;
}

int zplc_comm_register_handler(zplc_comm_fb_kind_t kind,
                               zplc_comm_handler_t fn) {
  if (!fn)
    return -EINVAL;
  if (kind == ZPLC_COMM_FB_NONE || kind >= ZPLC_COMM_FB_KIND_MAX)
    return -EINVAL; /* reject NONE and unknown kinds */

  // Update existing if present
  for (int i = 0; i < s_num_handlers; i++) {
    if (s_handlers[i].kind == kind) {
      s_handlers[i].handler = fn;
      return 0;
    }
  }

  if (s_num_handlers >= MAX_HANDLERS)
    return -ENOMEM;
  s_handlers[s_num_handlers].kind = kind;
  s_handlers[s_num_handlers].handler = fn;
  s_num_handlers++;
  return 0;
}

/* The block must hold the handshake the dispatcher touches and the whole
 * layout of its kind: a handler never receives less than the table says
 * (RT-002). A kind without a layout is the handshake alone. */
static int block_fits(zplc_comm_fb_kind_t kind, const uint8_t *fb_mem,
                      uint16_t fb_len) {
  uint16_t needed = zplc_comm_fb_size((uint32_t)kind);

  if (needed < ZPLC_COMM_FB_HANDSHAKE_SIZE) {
    needed = ZPLC_COMM_FB_HANDSHAKE_SIZE;
  }
  return fb_mem != NULL && fb_len >= needed;
}

int zplc_comm_fb_is_service(zplc_comm_fb_kind_t kind) {
  return kind == ZPLC_COMM_FB_MQTT_CONNECT ||
         kind == ZPLC_COMM_FB_MQTT_SUBSCRIBE ||
         kind == ZPLC_COMM_FB_AZURE_C2D_RECV;
}

/* The handshake bytes of the block: the dispatcher is their only writer. */
enum { EN = 0, BUSY = 1, DONE = 2, ERROR = 3, STATUS = 4 };

static void set_status(uint8_t *fb_mem, uint32_t status) {
  zplc_put_u32_le(&fb_mem[STATUS], status);
}

static void clear_outputs(uint8_t *fb_mem) {
  fb_mem[BUSY] = 0;
  fb_mem[DONE] = 0;
  fb_mem[ERROR] = 0;
}

static int has_state(const uint8_t *fb_mem) {
  return fb_mem[BUSY] != 0 || fb_mem[DONE] != 0 || fb_mem[ERROR] != 0;
}

/* A failure code of a handler: -(zplc_comm_status_t), or UNKNOWN for any
 * other negative value (the codes 0 and 1 are not failures). */
static uint32_t failure_status(int result) {
  if (result <= -(int)ZPLC_COMM_TIMEOUT && result >= -(int)ZPLC_COMM_UNAVAILABLE) {
    return (uint32_t)(-result);
  }
  return (uint32_t)ZPLC_COMM_UNKNOWN;
}

/* Publish what a handler returned: the three outputs and STATUS. */
static void publish(uint8_t *fb_mem, int result) {
  if (result == ZPLC_COMM_HANDLER_PENDING) {
    fb_mem[BUSY] = 1;
    fb_mem[DONE] = 0;
    fb_mem[ERROR] = 0;
    set_status(fb_mem, (uint32_t)ZPLC_COMM_BUSY);
  } else if (result == ZPLC_COMM_HANDLER_DONE) {
    fb_mem[BUSY] = 0;
    fb_mem[DONE] = 1;
    fb_mem[ERROR] = 0;
    set_status(fb_mem, (uint32_t)ZPLC_COMM_OK);
  } else {
    fb_mem[BUSY] = 0;
    fb_mem[DONE] = 0;
    fb_mem[ERROR] = 1;
    set_status(fb_mem, result < 0 ? failure_status(result)
                                  : (uint32_t)ZPLC_COMM_UNKNOWN);
  }
}

static void publish_no_handler(uint8_t *fb_mem) {
  publish(fb_mem, ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_NO_HANDLER));
}

/* The dispatcher's byte of a block: the last one of the layout of its kind (ZPLC_COMM_FB_TAIL_BYTES). It holds the
 * EN of the previous call, which is what tells a rising edge from an EN that stays TRUE. A kind without a layout
 * has none. */
static uint8_t *latch_of(zplc_comm_fb_kind_t kind, uint8_t *fb_mem) {
  const uint16_t size = zplc_comm_fb_size((uint32_t)kind);

  return size > ZPLC_COMM_FB_TAIL_BYTES ? &fb_mem[size - ZPLC_COMM_FB_TAIL_BYTES]
                                        : NULL;
}

int zplc_comm_fb_exec(zplc_comm_fb_kind_t kind, uint8_t *fb_mem,
                      uint16_t fb_len) {
  zplc_comm_handler_t handler;
  uint8_t *latch;
  int enabled;
  int rising;

  if (!block_fits(kind, fb_mem, fb_len)) {
    return -1;
  }
  enabled = fb_mem[EN] != 0;
  handler = get_handler(kind);

  /* A service block: its state can change on any scan. */
  if (zplc_comm_fb_is_service(kind)) {
    if (!enabled) {
      if (has_state(fb_mem)) {
        if (handler != NULL) {
          (void)handler(kind, fb_mem, fb_len, ZPLC_COMM_CALL_RESET);
        }
        clear_outputs(fb_mem);
      }
      return 0;
    }
    if (handler == NULL) {
      publish_no_handler(fb_mem);
      return 0;
    }
    publish(fb_mem, handler(kind, fb_mem, fb_len, ZPLC_COMM_CALL_POLL));
    return 0;
  }

  /* A request block. The EN of this call is what the next one compares with. */
  latch = latch_of(kind, fb_mem);
  rising = latch != NULL ? (enabled && *latch == 0)
                         : (enabled && fb_mem[DONE] == 0 && fb_mem[ERROR] == 0);
  if (latch != NULL) {
    *latch = enabled ? 1U : 0U;
  }

  /* In flight: polled on every scan, whatever EN does. */
  if (fb_mem[BUSY] != 0) {
    if (handler == NULL) {
      publish_no_handler(fb_mem);
      return 0;
    }
    publish(fb_mem, handler(kind, fb_mem, fb_len, ZPLC_COMM_CALL_POLL));
    return 0;
  }

  if (!enabled) {
    /* EN is FALSE: the result of the last operation goes with it. */
    clear_outputs(fb_mem);
    return 0;
  }

  /* EN is TRUE and a result is held: one trigger is one operation. A new rising edge is a new trigger. */
  if (!rising && (fb_mem[DONE] != 0 || fb_mem[ERROR] != 0)) {
    return 0;
  }

  /* EN rose, or is TRUE on a block with no state: begin one operation. */
  if (handler == NULL) {
    publish_no_handler(fb_mem);
    return 0;
  }
  publish(fb_mem, handler(kind, fb_mem, fb_len, ZPLC_COMM_CALL_START));
  return 0;
}

int zplc_comm_fb_reset(zplc_comm_fb_kind_t kind, uint8_t *fb_mem,
                       uint16_t fb_len) {
  zplc_comm_handler_t handler;
  uint8_t *latch;

  if (!block_fits(kind, fb_mem, fb_len)) {
    return -1;
  }

  fb_mem[EN] = 0;
  clear_outputs(fb_mem);
  set_status(fb_mem, 0);
  latch = latch_of(kind, fb_mem);
  if (latch != NULL) {
    *latch = 0U;
  }

  handler = get_handler(kind);
  if (handler) {
    (void)handler(kind, fb_mem, fb_len, ZPLC_COMM_CALL_RESET);
  }
  return 0;
}
