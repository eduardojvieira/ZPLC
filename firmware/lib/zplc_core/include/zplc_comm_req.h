/**
 * @file zplc_comm_req.h
 * @brief Request slots between the scan and a worker (COM-003, COM-004, COM-008, COM-018).
 *
 * A communication block never waits for a peer. When it begins an operation
 * it takes a slot, fills in what the worker needs and queues the slot; the
 * worker (a thread, the MQTT client, a transport callback) runs it and writes
 * the result into the slot; the scan reads the result on a later call. The
 * slot is the only thing the two sides share, and it is only ever changed
 * under the lock of its pool:
 *
 *   FREE --claim--> CLAIMED --submit--> QUEUED --begin--> RUNNING --finish--> DONE --release--> FREE
 *                                          |                 |
 *                                          +--- abandon -----+--> ABANDONED --(worker is through)--> FREE
 *
 * A block that is reset, a request that outlives its timeout, or a program
 * that is replaced abandons its slot. An abandoned slot is not released:
 * the worker may be reading its payload, so it stays taken until the worker
 * has finished with it (COM-008). The result of an abandoned request belongs
 * to nobody and is dropped, never delivered to the next block that uses the
 * slot (COM-018).
 *
 * The header has no state of its own and no dependency on an operating
 * system: a pool is an array of structures whose first member is a
 * zplc_comm_req_t, and a pair of lock functions. The host tests drive it
 * with a pthread mutex or none; the firmware uses a spinlock.
 *
 * SPDX-License-Identifier: MIT
 */

#ifndef ZPLC_COMM_REQ_H
#define ZPLC_COMM_REQ_H

#include <errno.h>
#include <stddef.h>
#include <stdint.h>

#include "zplc_comm_dispatch.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
  ZPLC_COMM_REQ_FREE = 0,
  /** Taken by the scan and being filled in; the worker does not know it yet. */
  ZPLC_COMM_REQ_CLAIMED,
  /** Handed to the worker, not started. */
  ZPLC_COMM_REQ_QUEUED,
  /** The worker is using the payload. */
  ZPLC_COMM_REQ_RUNNING,
  /** Finished; the result is valid and the block has not taken it yet. */
  ZPLC_COMM_REQ_DONE,
  /** Let go by the block while queued or running; the worker frees it. */
  ZPLC_COMM_REQ_ABANDONED
} zplc_comm_req_state_t;

/** The head of every slot of a pool. */
typedef struct {
  uint8_t state;       /**< zplc_comm_req_state_t */
  const void *owner;   /**< the block instance (its address); NULL when the block let go */
  int32_t result;      /**< ZPLC_COMM_HANDLER_DONE or ZPLC_COMM_HANDLER_FAIL(status); valid in DONE */
  uint32_t started_ms; /**< tick of the submit: the age of the request */
} zplc_comm_req_t;

typedef struct {
  void *slots; /**< `count` structures of `stride` bytes, each starting with a zplc_comm_req_t */
  size_t stride;
  size_t count;
  void (*lock)(void *context); /**< NULL when one thread uses the pool */
  void (*unlock)(void *context);
  void *context;
} zplc_comm_req_pool_t;

static inline zplc_comm_req_t *zplc_comm_req_at(const zplc_comm_req_pool_t *pool, size_t index) {
  return (zplc_comm_req_t *)((uint8_t *)pool->slots + index * pool->stride);
}

static inline void zplc_comm_req_lock(const zplc_comm_req_pool_t *pool) {
  if (pool->lock != NULL) {
    pool->lock(pool->context);
  }
}

static inline void zplc_comm_req_unlock(const zplc_comm_req_pool_t *pool) {
  if (pool->unlock != NULL) {
    pool->unlock(pool->context);
  }
}

/** The status code a failure of the platform maps to (the documented codes of the blocks). */
static inline int zplc_comm_status_from_errno(int error) {
  if (error < 0) {
    error = -error;
  }
  switch (error) {
  case 0:
    return ZPLC_COMM_OK;
  case ETIMEDOUT:
  case EAGAIN:
#if defined(EWOULDBLOCK) && EWOULDBLOCK != EAGAIN
  case EWOULDBLOCK:
#endif
    return ZPLC_COMM_TIMEOUT;
  case ENOTCONN:
  case ECONNREFUSED:
  case ECONNRESET:
  case ECONNABORTED:
  case ENETUNREACH:
  case ENETDOWN:
  case EHOSTUNREACH:
  case EPIPE:
  case ESHUTDOWN:
    return ZPLC_COMM_NOT_CONNECTED;
  case ENOMEM:
  case EBUSY:
  case ENOBUFS:
    return ZPLC_COMM_QUEUE_FULL;
  case EINVAL:
  case ERANGE:
  case EFAULT:
    return ZPLC_COMM_INVALID_ADDR;
  case EMSGSIZE:
  case ENAMETOOLONG:
  case E2BIG:
    return ZPLC_COMM_STRING_OVERFLOW;
  case EIO:
  case EPROTO:
  case EBADMSG:
  case EILSEQ:
    return ZPLC_COMM_PROTO_ERROR;
  case EACCES:
  case EPERM:
    return ZPLC_COMM_AUTH_FAILED;
  case ENOTSUP:
  case ENODEV:
  case ENOSYS:
    return ZPLC_COMM_UNAVAILABLE;
  default:
    return ZPLC_COMM_UNKNOWN;
  }
}

/** A handler result for a failure of the platform, as a -errno or a zplc_comm_status_t. */
static inline int zplc_comm_fail_from_errno(int error) { return ZPLC_COMM_HANDLER_FAIL(zplc_comm_status_from_errno(error)); }

/**
 * @brief Take a free slot for a request of the block `owner` (scan side).
 *
 * A slot that this block still holds is let go first: a request in flight is
 * abandoned, a finished one is freed. A request therefore never sees the
 * result of an earlier one. Returns NULL when every slot is taken: the block
 * reports ZPLC_COMM_QUEUE_FULL (COM-008).
 */
static inline zplc_comm_req_t *zplc_comm_req_claim(const zplc_comm_req_pool_t *pool, const void *owner, uint32_t now_ms) {
  zplc_comm_req_t *found = NULL;
  size_t i;

  zplc_comm_req_lock(pool);
  for (i = 0U; i < pool->count; i++) {
    zplc_comm_req_t *slot = zplc_comm_req_at(pool, i);

    if (slot->owner == owner && slot->state != ZPLC_COMM_REQ_FREE) {
      if (slot->state == ZPLC_COMM_REQ_QUEUED || slot->state == ZPLC_COMM_REQ_RUNNING) {
        slot->state = ZPLC_COMM_REQ_ABANDONED;
        slot->owner = NULL;
      } else if (slot->state == ZPLC_COMM_REQ_CLAIMED || slot->state == ZPLC_COMM_REQ_DONE) {
        slot->state = ZPLC_COMM_REQ_FREE;
        slot->owner = NULL;
      }
    }
  }
  for (i = 0U; i < pool->count; i++) {
    zplc_comm_req_t *slot = zplc_comm_req_at(pool, i);

    if (slot->state == ZPLC_COMM_REQ_FREE) {
      slot->state = ZPLC_COMM_REQ_CLAIMED;
      slot->owner = owner;
      slot->result = ZPLC_COMM_HANDLER_DONE;
      slot->started_ms = now_ms;
      found = slot;
      break;
    }
  }
  zplc_comm_req_unlock(pool);
  return found;
}

/** The slot is filled in: hand it to the worker (scan side). */
static inline void zplc_comm_req_submit(const zplc_comm_req_pool_t *pool, zplc_comm_req_t *slot) {
  zplc_comm_req_lock(pool);
  if (slot->state == ZPLC_COMM_REQ_CLAIMED) {
    slot->state = ZPLC_COMM_REQ_QUEUED;
  }
  zplc_comm_req_unlock(pool);
}

/** The request could not be queued after all: give the slot back (scan side). */
static inline void zplc_comm_req_cancel(const zplc_comm_req_pool_t *pool, zplc_comm_req_t *slot) {
  zplc_comm_req_lock(pool);
  if (slot->state == ZPLC_COMM_REQ_CLAIMED || slot->state == ZPLC_COMM_REQ_QUEUED) {
    slot->state = ZPLC_COMM_REQ_FREE;
    slot->owner = NULL;
  }
  zplc_comm_req_unlock(pool);
}

/**
 * @brief The worker takes the request (worker side).
 *
 * Returns 1 when the request is to be run. Returns 0 when its block let go of
 * it while it waited: the slot is free again and nothing is sent.
 */
static inline int zplc_comm_req_begin(const zplc_comm_req_pool_t *pool, zplc_comm_req_t *slot) {
  int run = 0;

  zplc_comm_req_lock(pool);
  if (slot->state == ZPLC_COMM_REQ_QUEUED) {
    slot->state = ZPLC_COMM_REQ_RUNNING;
    run = 1;
  } else if (slot->state == ZPLC_COMM_REQ_ABANDONED) {
    slot->state = ZPLC_COMM_REQ_FREE;
  }
  zplc_comm_req_unlock(pool);
  return run;
}

/**
 * @brief The worker is through (worker side).
 *
 * The result is kept for the block, or dropped, and the slot freed, when the
 * block let go of the request while it ran.
 */
static inline void zplc_comm_req_finish(const zplc_comm_req_pool_t *pool, zplc_comm_req_t *slot, int result) {
  zplc_comm_req_lock(pool);
  if (slot->state == ZPLC_COMM_REQ_ABANDONED) {
    slot->state = ZPLC_COMM_REQ_FREE;
    slot->owner = NULL;
  } else {
    slot->result = result;
    slot->state = ZPLC_COMM_REQ_DONE;
  }
  zplc_comm_req_unlock(pool);
}

/**
 * @brief Where the request of a block stands (scan side).
 *
 * Returns ZPLC_COMM_HANDLER_PENDING while the request is queued or running
 * and younger than `timeout_ms`; ZPLC_COMM_HANDLER_DONE with *slot set when it
 * finished (the caller reads the outputs from the slot and then calls
 * zplc_comm_req_release); ZPLC_COMM_HANDLER_FAIL(...) when it failed (the slot is
 * freed here). A request older than the timeout is abandoned and reported as
 * ZPLC_COMM_TIMEOUT: its late result is dropped, not replayed (COM-018). A
 * block that has no request, which is the case of a block that was BUSY across a
 * program reload, is reported as ZPLC_COMM_UNKNOWN.
 */
static inline int zplc_comm_req_peek(const zplc_comm_req_pool_t *pool, const void *owner, uint32_t now_ms, uint32_t timeout_ms,
                                     zplc_comm_req_t **slot) {
  int result = ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_UNKNOWN);
  size_t i;

  *slot = NULL;
  zplc_comm_req_lock(pool);
  for (i = 0U; i < pool->count; i++) {
    zplc_comm_req_t *candidate = zplc_comm_req_at(pool, i);

    if (candidate->owner != owner || candidate->state == ZPLC_COMM_REQ_FREE || candidate->state == ZPLC_COMM_REQ_ABANDONED) {
      continue;
    }
    if (candidate->state == ZPLC_COMM_REQ_DONE) {
      if (candidate->result == ZPLC_COMM_HANDLER_DONE) {
        *slot = candidate;
        result = ZPLC_COMM_HANDLER_DONE;
      } else {
        result = candidate->result;
        candidate->state = ZPLC_COMM_REQ_FREE;
        candidate->owner = NULL;
      }
    } else if (now_ms - candidate->started_ms > timeout_ms) {
      /* queued, running or still being filled in: too old */
      candidate->state = candidate->state == ZPLC_COMM_REQ_CLAIMED ? ZPLC_COMM_REQ_FREE : ZPLC_COMM_REQ_ABANDONED;
      candidate->owner = NULL;
      result = ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_TIMEOUT);
    } else {
      result = ZPLC_COMM_HANDLER_PENDING;
    }
    break;
  }
  zplc_comm_req_unlock(pool);
  return result;
}

/** The block has read the result: free the slot (scan side). */
static inline void zplc_comm_req_release(const zplc_comm_req_pool_t *pool, zplc_comm_req_t *slot) {
  zplc_comm_req_lock(pool);
  if (slot->state == ZPLC_COMM_REQ_DONE) {
    slot->state = ZPLC_COMM_REQ_FREE;
    slot->owner = NULL;
  }
  zplc_comm_req_unlock(pool);
}

/**
 * @brief The block is reset, or its program is going away (scan side).
 *
 * A request in flight is abandoned, a finished one freed. Nothing the worker
 * is using is released before the worker is through with it (COM-008).
 */
static inline void zplc_comm_req_abort(const zplc_comm_req_pool_t *pool, const void *owner) {
  size_t i;

  zplc_comm_req_lock(pool);
  for (i = 0U; i < pool->count; i++) {
    zplc_comm_req_t *slot = zplc_comm_req_at(pool, i);

    if (slot->owner != owner || slot->state == ZPLC_COMM_REQ_FREE) {
      continue;
    }
    if (slot->state == ZPLC_COMM_REQ_QUEUED || slot->state == ZPLC_COMM_REQ_RUNNING) {
      slot->state = ZPLC_COMM_REQ_ABANDONED;
    } else if (slot->state != ZPLC_COMM_REQ_ABANDONED) {
      slot->state = ZPLC_COMM_REQ_FREE;
    }
    slot->owner = NULL;
  }
  zplc_comm_req_unlock(pool);
}

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_COMM_REQ_H */
