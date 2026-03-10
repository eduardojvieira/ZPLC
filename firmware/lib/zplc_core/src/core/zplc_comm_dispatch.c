#include "zplc_comm_dispatch.h"
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

int zplc_comm_fb_exec(zplc_comm_fb_kind_t kind, uint8_t *fb_mem) {
  uint8_t *en = &fb_mem[0];
  uint8_t *busy = &fb_mem[1];
  uint8_t *done = &fb_mem[2];
  uint8_t *error = &fb_mem[3];
  uint32_t *status = (uint32_t *)&fb_mem[4];

  if (!*en) {
    *busy = 0;
    *done = 0;
    *error = 0;
    return 0;
  }

  // Clear pulse outputs from previous scan
  if (*done)
    *done = 0;
  if (*error)
    *error = 0;

  zplc_comm_handler_t handler = get_handler(kind);
  if (!handler) {
    if (!*busy) { // Only report if not already waiting for response
      *error = 1;
      *status = ZPLC_COMM_NO_HANDLER;
    }
    return 0;
  }

  // Only call handler if not already busy
  if (!*busy) {
    *busy = 1;
    int res = handler(kind, fb_mem, false);
    if (res < 0) {
      *busy = 0;
      *error = 1;
      *status = ZPLC_COMM_UNKNOWN;
    }
  }

  return 0; // Handler is responsible for clearing BUSY and setting DONE/ERROR
            // in subsequent scans via async result
}

int zplc_comm_fb_reset(zplc_comm_fb_kind_t kind, uint8_t *fb_mem) {
  uint8_t *en = &fb_mem[0];
  uint8_t *busy = &fb_mem[1];
  uint8_t *done = &fb_mem[2];
  uint8_t *error = &fb_mem[3];
  uint32_t *status = (uint32_t *)&fb_mem[4];

  *en = 0;
  *busy = 0;
  *done = 0;
  *error = 0;
  *status = 0;

  zplc_comm_handler_t handler = get_handler(kind);
  if (handler) {
    handler(kind, fb_mem, true);
  }
  return 0;
}
