/**
 * @file test_comm_req.c
 * @brief The request slots between the scan and a worker (COM-003, COM-004, COM-008, COM-018).
 *
 * The state machine of zplc_comm_req.h is driven one step at a time, then by
 * two threads that use one pool the way the scan and a worker do. Whatever the
 * interleaving, a request is delivered to the block that made it at most once,
 * the result of a request that was let go of is never delivered to the next
 * block that takes the slot, and a slot the worker still uses is not given
 * away.
 *
 * SPDX-License-Identifier: MIT
 */
#ifdef NDEBUG
#undef NDEBUG
#endif
#include <assert.h>
#include <pthread.h>
#include <stdio.h>
#include <string.h>

#include "zplc_comm_req.h"

#define SLOTS 4

typedef struct {
  zplc_comm_req_t head;
  int serial; /* the payload: which request it is */
  int answer; /* what the worker wrote */
} slot_t;

static slot_t slots[SLOTS];
static const zplc_comm_req_pool_t pool = {slots, sizeof(slot_t), SLOTS, NULL, NULL, NULL};

static void clear(void) { memset(slots, 0, sizeof(slots)); }

static size_t in_use(void) {
  size_t i, n = 0U;

  for (i = 0U; i < SLOTS; i++) {
    if (slots[i].head.state != ZPLC_COMM_REQ_FREE) {
      n++;
    }
  }
  return n;
}

static void test_the_life_of_a_request(void) {
  const int a = 1;
  zplc_comm_req_t *slot = NULL;
  zplc_comm_req_t *got = NULL;
  printf("test_the_life_of_a_request...\n");

  clear();
  slot = zplc_comm_req_claim(&pool, &a, 100U);
  assert(slot != NULL && slot->state == ZPLC_COMM_REQ_CLAIMED && slot->owner == &a);
  /* still being filled in: the block is pending, not yet visible to a worker */
  assert(zplc_comm_req_peek(&pool, &a, 100U, 1000U, &got) == ZPLC_COMM_HANDLER_PENDING);
  zplc_comm_req_submit(&pool, slot);
  assert(slot->state == ZPLC_COMM_REQ_QUEUED);
  assert(zplc_comm_req_peek(&pool, &a, 500U, 1000U, &got) == ZPLC_COMM_HANDLER_PENDING);
  assert(zplc_comm_req_begin(&pool, slot) == 1 && slot->state == ZPLC_COMM_REQ_RUNNING);
  assert(zplc_comm_req_peek(&pool, &a, 500U, 1000U, &got) == ZPLC_COMM_HANDLER_PENDING);
  zplc_comm_req_finish(&pool, slot, ZPLC_COMM_HANDLER_DONE);
  assert(zplc_comm_req_peek(&pool, &a, 500U, 1000U, &got) == ZPLC_COMM_HANDLER_DONE);
  assert(got == slot);
  zplc_comm_req_release(&pool, got);
  assert(in_use() == 0U);
  /* nothing is left for the block: a block that is BUSY with no request is a lost one */
  assert(zplc_comm_req_peek(&pool, &a, 500U, 1000U, &got) == ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_UNKNOWN));
}

static void test_a_failed_request_is_freed_with_its_status(void) {
  const int a = 1;
  zplc_comm_req_t *slot;
  zplc_comm_req_t *got = NULL;
  printf("test_a_failed_request_is_freed_with_its_status...\n");

  clear();
  slot = zplc_comm_req_claim(&pool, &a, 0U);
  zplc_comm_req_submit(&pool, slot);
  assert(zplc_comm_req_begin(&pool, slot) == 1);
  zplc_comm_req_finish(&pool, slot, ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_NOT_CONNECTED));
  assert(zplc_comm_req_peek(&pool, &a, 1U, 1000U, &got) == ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_NOT_CONNECTED));
  assert(got == NULL && in_use() == 0U);
}

/* COM-018: older than its timeout, a request is TIMEOUT and its late result is dropped. */
static void test_a_request_older_than_its_timeout_is_dropped(void) {
  const int a = 1, b = 2;
  zplc_comm_req_t *slot;
  zplc_comm_req_t *got = NULL;
  printf("test_a_request_older_than_its_timeout_is_dropped...\n");

  clear();
  slot = zplc_comm_req_claim(&pool, &a, 1000U);
  zplc_comm_req_submit(&pool, slot);
  assert(zplc_comm_req_begin(&pool, slot) == 1);
  assert(zplc_comm_req_peek(&pool, &a, 1000U + 500U, 500U, &got) == ZPLC_COMM_HANDLER_PENDING);
  assert(zplc_comm_req_peek(&pool, &a, 1000U + 501U, 500U, &got) == ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_TIMEOUT));
  assert(slot->state == ZPLC_COMM_REQ_ABANDONED && slot->owner == NULL);
  /* the worker answers late: nothing is delivered, the slot is free, another block cannot get the answer */
  zplc_comm_req_finish(&pool, slot, ZPLC_COMM_HANDLER_DONE);
  assert(slot->state == ZPLC_COMM_REQ_FREE);
  {
    zplc_comm_req_t *other = zplc_comm_req_claim(&pool, &b, 2000U);
    assert(other == slot && other->result == ZPLC_COMM_HANDLER_DONE); /* reinitialised, not an old answer */
    assert(zplc_comm_req_peek(&pool, &b, 2000U, 500U, &got) == ZPLC_COMM_HANDLER_PENDING);
  }
  /* the age is measured on a clock that wraps */
  clear();
  slot = zplc_comm_req_claim(&pool, &a, 0xFFFFFF00U);
  zplc_comm_req_submit(&pool, slot);
  assert(zplc_comm_req_peek(&pool, &a, 0x00000010U, 1000U, &got) == ZPLC_COMM_HANDLER_PENDING);
  assert(zplc_comm_req_peek(&pool, &a, 0x00000500U, 1000U, &got) == ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_TIMEOUT));
}

/* COM-008: let go of while running, the slot stays taken until the worker is through. */
static void test_a_slot_the_worker_uses_is_not_given_away(void) {
  int owners[SLOTS + 1];
  zplc_comm_req_t *running;
  zplc_comm_req_t *claimed[SLOTS];
  size_t i;
  printf("test_a_slot_the_worker_uses_is_not_given_away...\n");

  clear();
  running = zplc_comm_req_claim(&pool, &owners[0], 0U);
  zplc_comm_req_submit(&pool, running);
  assert(zplc_comm_req_begin(&pool, running) == 1);
  zplc_comm_req_abort(&pool, &owners[0]);
  assert(running->state == ZPLC_COMM_REQ_ABANDONED);

  /* everything else can be taken; the abandoned slot cannot */
  for (i = 0U; i < SLOTS - 1U; i++) {
    claimed[i] = zplc_comm_req_claim(&pool, &owners[i + 1U], 1U);
    assert(claimed[i] != NULL && claimed[i] != running);
  }
  assert(zplc_comm_req_claim(&pool, &owners[SLOTS], 1U) == NULL); /* full: QUEUE_FULL */

  zplc_comm_req_finish(&pool, running, ZPLC_COMM_HANDLER_DONE);
  assert(running->state == ZPLC_COMM_REQ_FREE);
  assert(zplc_comm_req_claim(&pool, &owners[SLOTS], 1U) == running);
}

/* A request abandoned while it waited in the queue is never started. */
static void test_a_request_let_go_of_while_queued_is_not_started(void) {
  const int a = 1;
  zplc_comm_req_t *slot;
  printf("test_a_request_let_go_of_while_queued_is_not_started...\n");

  clear();
  slot = zplc_comm_req_claim(&pool, &a, 0U);
  zplc_comm_req_submit(&pool, slot);
  zplc_comm_req_abort(&pool, &a);
  assert(zplc_comm_req_begin(&pool, slot) == 0);
  assert(slot->state == ZPLC_COMM_REQ_FREE);
}

/* A block that asks again gets a request of its own, never the finished one: no replay (COM-002). */
static void test_a_new_request_never_sees_the_result_of_the_old_one(void) {
  const int a = 1;
  zplc_comm_req_t *first, *second, *got = NULL;
  printf("test_a_new_request_never_sees_the_result_of_the_old_one...\n");

  clear();
  first = zplc_comm_req_claim(&pool, &a, 0U);
  zplc_comm_req_submit(&pool, first);
  assert(zplc_comm_req_begin(&pool, first) == 1);
  zplc_comm_req_finish(&pool, first, ZPLC_COMM_HANDLER_DONE); /* finished, nobody has taken it */
  second = zplc_comm_req_claim(&pool, &a, 10U);
  assert(second != NULL && second->state == ZPLC_COMM_REQ_CLAIMED);
  assert(in_use() == 1U); /* the first was freed */
  zplc_comm_req_submit(&pool, second);
  assert(zplc_comm_req_peek(&pool, &a, 10U, 1000U, &got) == ZPLC_COMM_HANDLER_PENDING);
}

static void test_the_platform_errors_map_to_the_documented_codes(void) {
  printf("test_the_platform_errors_map_to_the_documented_codes...\n");
  assert(zplc_comm_status_from_errno(0) == ZPLC_COMM_OK);
  assert(zplc_comm_status_from_errno(-ETIMEDOUT) == ZPLC_COMM_TIMEOUT);
  assert(zplc_comm_status_from_errno(ETIMEDOUT) == ZPLC_COMM_TIMEOUT);
  assert(zplc_comm_status_from_errno(-ECONNREFUSED) == ZPLC_COMM_NOT_CONNECTED);
  assert(zplc_comm_status_from_errno(-ENOTCONN) == ZPLC_COMM_NOT_CONNECTED);
  assert(zplc_comm_status_from_errno(-EHOSTUNREACH) == ZPLC_COMM_NOT_CONNECTED);
  assert(zplc_comm_status_from_errno(-ENOMEM) == ZPLC_COMM_QUEUE_FULL);
  assert(zplc_comm_status_from_errno(-EINVAL) == ZPLC_COMM_INVALID_ADDR);
  assert(zplc_comm_status_from_errno(-EMSGSIZE) == ZPLC_COMM_STRING_OVERFLOW);
  assert(zplc_comm_status_from_errno(-EIO) == ZPLC_COMM_PROTO_ERROR);
  assert(zplc_comm_status_from_errno(-EACCES) == ZPLC_COMM_AUTH_FAILED);
  assert(zplc_comm_status_from_errno(-ENOTSUP) == ZPLC_COMM_UNAVAILABLE);
  assert(zplc_comm_status_from_errno(-9999) == ZPLC_COMM_UNKNOWN);
  assert(zplc_comm_fail_from_errno(-ETIMEDOUT) == ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_TIMEOUT));
}

/* --- two threads: the scan and a worker on one pool ------------------------- */
static pthread_mutex_t mutex = PTHREAD_MUTEX_INITIALIZER;
static void lock_fn(void *context) {
  (void)context;
  pthread_mutex_lock(&mutex);
}
static void unlock_fn(void *context) {
  (void)context;
  pthread_mutex_unlock(&mutex);
}
static const zplc_comm_req_pool_t shared = {slots, sizeof(slot_t), SLOTS, lock_fn, unlock_fn, NULL};

#define OWNERS 3
#define ROUNDS 40000
static int owners_storage[OWNERS];
static volatile int stop;
static int delivered_wrong;
static int delivered;
static int worker_runs;

static void *worker(void *arg) {
  size_t cursor = 0U;

  (void)arg;
  while (!stop) {
    zplc_comm_req_t *r = zplc_comm_req_at(&shared, cursor++ % SLOTS);

    if (zplc_comm_req_begin(&shared, r)) {
      slot_t *s = (slot_t *)r;
      const int serial = s->serial; /* the payload is stable while RUNNING */

      s->answer = serial * 2 + 1;
      worker_runs++;
      zplc_comm_req_finish(&shared, r, ZPLC_COMM_HANDLER_DONE);
    }
  }
  return NULL;
}

static void test_scan_and_worker_on_one_pool(void) {
  pthread_t thread;
  int serial = 0;
  int pending[OWNERS];
  int round;
  printf("test_scan_and_worker_on_one_pool...\n");

  clear();
  stop = 0;
  memset(pending, 0, sizeof(pending));
  pthread_create(&thread, NULL, worker, NULL);
  for (round = 0; round < ROUNDS; round++) {
    const int o = round % OWNERS;
    zplc_comm_req_t *got = NULL;

    if (pending[o] == 0) {
      zplc_comm_req_t *slot = zplc_comm_req_claim(&shared, &owners_storage[o], (uint32_t)round);
      if (slot != NULL) {
        ((slot_t *)slot)->serial = ++serial;
        ((slot_t *)slot)->answer = 0;
        pending[o] = serial;
        zplc_comm_req_submit(&shared, slot);
      }
    } else {
      const int r = zplc_comm_req_peek(&shared, &owners_storage[o], (uint32_t)round, 1000000U, &got);

      if (r == ZPLC_COMM_HANDLER_DONE) {
        /* the answer is the answer to *this* block's request, and only once */
        if (((slot_t *)got)->answer != ((slot_t *)got)->serial * 2 + 1 || ((slot_t *)got)->serial != pending[o]) {
          delivered_wrong++;
        }
        delivered++;
        zplc_comm_req_release(&shared, got);
        pending[o] = 0;
      } else if (r != ZPLC_COMM_HANDLER_PENDING) {
        pending[o] = 0;
      } else if (round % 7 == 0) {
        zplc_comm_req_abort(&shared, &owners_storage[o]); /* a reset while it is in flight */
        pending[o] = 0;
      }
    }
  }
  stop = 1;
  pthread_join(thread, NULL);
  assert(delivered_wrong == 0);
  assert(delivered > 100);
  assert(worker_runs > 100);
  printf("  %d requests delivered, %d run by the worker\n", delivered, worker_runs);
}

int main(void) {
  printf("Running zplc_comm_req tests...\n");
  test_the_life_of_a_request();
  test_a_failed_request_is_freed_with_its_status();
  test_a_request_older_than_its_timeout_is_dropped();
  test_a_slot_the_worker_uses_is_not_given_away();
  test_a_request_let_go_of_while_queued_is_not_started();
  test_a_new_request_never_sees_the_result_of_the_old_one();
  test_the_platform_errors_map_to_the_documented_codes();
  test_scan_and_worker_on_one_pool();
  printf("All zplc_comm_req tests passed.\n");
  return 0;
}
