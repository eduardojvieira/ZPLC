/**
 * @file zplc_exchange.c
 * @brief The exchange between the scan and the threads outside it. See zplc_exchange.h.
 *
 * SPDX-License-Identifier: MIT
 */

#include "zplc_exchange.h"

#include <string.h>

#include "zplc_core.h"
#include "zplc_hal.h"
#include "zplc_mem_extent.h"

/* Header of a queued write: address and length, little endian, then the bytes. */
#define RECORD_HEADER 4U

#define SNAPSHOT_IPI 0U
#define SNAPSHOT_OPI ((size_t)ZPLC_MEM_IPI_SIZE)
#define SNAPSHOT_WORK (SNAPSHOT_OPI + (size_t)ZPLC_MEM_OPI_SIZE)
#define SNAPSHOT_RETAIN (SNAPSHOT_WORK + (size_t)ZPLC_MEM_WORK_SIZE)
#define SNAPSHOT_SIZE (SNAPSHOT_RETAIN + (size_t)ZPLC_MEM_RETAIN_SIZE)

static zplc_hal_mutex_t exchange_lock;
static zplc_exchange_hooks_t hooks;
static uint8_t snapshot[SNAPSHOT_SIZE];
static uint8_t queue[ZPLC_EXCHANGE_QUEUE_BYTES];
static size_t queue_used;
static zplc_exchange_stats_t stats;

/* State of the write batch in progress; the lock is held between begin and end. */
static int batch_open;
static int batch_immediate;
static int batch_image_locked;

static int take(void) {
  if (exchange_lock == NULL) {
    return ZPLC_EXCHANGE_ERR_LOCK;
  }
  return zplc_hal_mutex_lock(exchange_lock) == ZPLC_HAL_OK ? 0 : ZPLC_EXCHANGE_ERR_LOCK;
}

static void give(void) {
  if (exchange_lock != NULL) {
    (void)zplc_hal_mutex_unlock(exchange_lock);
  }
}

static int scan_is_active(void) { return hooks.scan_active != NULL && hooks.scan_active() != 0; }

/* Where the extent lives in the snapshot; the extent is already known to be inside one region. */
static size_t snapshot_position(int region, uint32_t offset) {
  static const size_t starts[4] = {SNAPSHOT_IPI, SNAPSHOT_OPI, SNAPSHOT_WORK, SNAPSHOT_RETAIN};

  return starts[region] + (size_t)offset;
}

static void put_u16(uint8_t *p, uint16_t value) {
  p[0] = (uint8_t)value;
  p[1] = (uint8_t)(value >> 8);
}

static uint16_t get_u16(const uint8_t *p) { return (uint16_t)((uint16_t)p[0] | ((uint16_t)p[1] << 8)); }

static void publish_locked(void) {
  memcpy(snapshot + SNAPSHOT_IPI, zplc_mem_get_region(ZPLC_MEM_IPI_BASE), ZPLC_MEM_IPI_SIZE);
  memcpy(snapshot + SNAPSHOT_OPI, zplc_mem_get_region(ZPLC_MEM_OPI_BASE), ZPLC_MEM_OPI_SIZE);
  memcpy(snapshot + SNAPSHOT_WORK, zplc_mem_get_region(ZPLC_MEM_WORK_BASE), ZPLC_MEM_WORK_SIZE);
  memcpy(snapshot + SNAPSHOT_RETAIN, zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE), ZPLC_MEM_RETAIN_SIZE);
  stats.publications++;
}

int zplc_exchange_init(const zplc_exchange_hooks_t *new_hooks) {
  if (exchange_lock == NULL) {
    exchange_lock = zplc_hal_mutex_create();
    if (exchange_lock == NULL) {
      return ZPLC_EXCHANGE_ERR_LOCK;
    }
  }
  memset(&hooks, 0, sizeof(hooks));
  if (new_hooks != NULL) {
    hooks = *new_hooks;
  }
  memset(&stats, 0, sizeof(stats));
  queue_used = 0U;
  batch_open = 0;
  batch_immediate = 0;
  batch_image_locked = 0;
  publish_locked();
  stats.publications = 0U;
  return 0;
}

/* ---------------------------------------------------------------------------
 * Writes
 * ---------------------------------------------------------------------------
 */

static int extent_ok(uint16_t addr, uint16_t size) { return zplc_mem_extent_locate(addr, size, NULL) >= 0; }

static int enqueue_locked(uint16_t addr, const uint8_t *bytes, uint16_t size) {
  put_u16(queue + queue_used, addr);
  put_u16(queue + queue_used + 2U, size);
  memcpy(queue + queue_used + RECORD_HEADER, bytes, size);
  queue_used += RECORD_HEADER + size;
  return 0;
}

int zplc_exchange_write(uint16_t addr, const uint8_t *bytes, uint16_t size) {
  int result;

  if (bytes == NULL || size == 0U || !extent_ok(addr, size)) {
    return ZPLC_EXCHANGE_ERR_RANGE;
  }
  if (scan_is_active()) {
    result = take();
    if (result != 0) {
      return result;
    }
    if (queue_used + RECORD_HEADER + size > sizeof(queue)) {
      stats.refused++;
      give();
      return ZPLC_EXCHANGE_ERR_FULL;
    }
    (void)enqueue_locked(addr, bytes, size);
    give();
    return 0;
  }

  /* No scan runs: there is no latch to wait for. Under the image lock, then the exchange lock. */
  if (hooks.lock_image != NULL && hooks.lock_image() != 0) {
    return ZPLC_EXCHANGE_ERR_LOCK;
  }
  result = take();
  if (result == 0) {
    result = zplc_force_write_bytes(addr, bytes, size) == 0 ? 0 : ZPLC_EXCHANGE_ERR_RANGE;
    if (result == 0) {
      stats.immediate++;
      publish_locked();
    }
    give();
  }
  if (hooks.unlock_image != NULL) {
    hooks.unlock_image();
  }
  return result;
}

int zplc_exchange_write_begin(size_t records, size_t bytes) {
  int result;

  if (batch_open != 0) {
    return ZPLC_EXCHANGE_ERR_LOCK;
  }
  if (scan_is_active()) {
    result = take();
    if (result != 0) {
      return result;
    }
    if (queue_used + records * RECORD_HEADER + bytes > sizeof(queue)) {
      stats.refused++;
      give();
      return ZPLC_EXCHANGE_ERR_FULL;
    }
    batch_immediate = 0;
    batch_image_locked = 0;
  } else {
    if (hooks.lock_image != NULL) {
      if (hooks.lock_image() != 0) {
        return ZPLC_EXCHANGE_ERR_LOCK;
      }
      batch_image_locked = 1;
    } else {
      batch_image_locked = 0;
    }
    result = take();
    if (result != 0) {
      if (batch_image_locked != 0 && hooks.unlock_image != NULL) {
        hooks.unlock_image();
      }
      return result;
    }
    batch_immediate = 1;
  }
  batch_open = 1;
  return 0;
}

int zplc_exchange_write_add(uint16_t addr, const uint8_t *bytes, uint16_t size) {
  if (batch_open == 0) {
    return ZPLC_EXCHANGE_ERR_LOCK;
  }
  if (bytes == NULL || size == 0U || !extent_ok(addr, size)) {
    return ZPLC_EXCHANGE_ERR_RANGE;
  }
  if (batch_immediate != 0) {
    if (zplc_force_write_bytes(addr, bytes, size) != 0) {
      return ZPLC_EXCHANGE_ERR_RANGE;
    }
    stats.immediate++;
    return 0;
  }
  if (queue_used + RECORD_HEADER + size > sizeof(queue)) {
    stats.refused++;
    return ZPLC_EXCHANGE_ERR_FULL; /* only if the reservation was understated */
  }
  return enqueue_locked(addr, bytes, size);
}

void zplc_exchange_write_end(void) {
  if (batch_open == 0) {
    return;
  }
  if (batch_immediate != 0) {
    publish_locked();
  }
  batch_open = 0;
  give();
  if (batch_image_locked != 0 && hooks.unlock_image != NULL) {
    hooks.unlock_image();
  }
  batch_image_locked = 0;
}

/* ---------------------------------------------------------------------------
 * Reads
 * ---------------------------------------------------------------------------
 */

int zplc_exchange_read_lock(void) { return take(); }

void zplc_exchange_read_unlock(void) { give(); }

int zplc_exchange_read_locked(uint16_t addr, uint8_t *out, uint16_t size) {
  uint32_t offset = 0U;
  int region;

  if (out == NULL || size == 0U) {
    return ZPLC_EXCHANGE_ERR_RANGE;
  }
  region = zplc_mem_extent_locate(addr, size, &offset);
  if (region < 0) {
    return ZPLC_EXCHANGE_ERR_RANGE;
  }
  memcpy(out, snapshot + snapshot_position(region, offset), size);
  return 0;
}

int zplc_exchange_read(uint16_t addr, uint8_t *out, uint16_t size) {
  int result = take();

  if (result != 0) {
    return result;
  }
  result = zplc_exchange_read_locked(addr, out, size);
  give();
  return result;
}

/* ---------------------------------------------------------------------------
 * The scan's side
 * ---------------------------------------------------------------------------
 */

size_t zplc_exchange_latch(void) {
  size_t offset = 0U;
  size_t applied = 0U;

  if (take() != 0) {
    return 0U;
  }
  while (offset + RECORD_HEADER <= queue_used) {
    const uint16_t addr = get_u16(queue + offset);
    const uint16_t size = get_u16(queue + offset + 2U);

    /* The extent was checked when the write was queued; a refusal here would be a change of the memory map. */
    (void)zplc_force_write_bytes(addr, queue + offset + RECORD_HEADER, size);
    offset += RECORD_HEADER + size;
    applied++;
  }
  queue_used = 0U;
  stats.latched += (uint32_t)applied;
  give();
  return applied;
}

void zplc_exchange_publish(void) {
  if (take() != 0) {
    return;
  }
  publish_locked();
  give();
}

void zplc_exchange_get_stats(zplc_exchange_stats_t *out) {
  if (out == NULL) {
    return;
  }
  if (take() != 0) {
    memset(out, 0, sizeof(*out));
    return;
  }
  *out = stats;
  give();
}
