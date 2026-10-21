/*
 * The kernel calls of shim/zephyr/kernel.h, on POSIX (COM-009). See that header.
 *
 * SPDX-License-Identifier: MIT
 */
#define _POSIX_C_SOURCE 200809L /* NOLINT(bugprone-reserved-identifier,cert-dcl37-c,cert-dcl51-cpp): feature-test macro */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>

#include <sched.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

k_spinlock_key_t k_spin_lock(struct k_spinlock *lock) {
  k_spinlock_key_t key = {0};

  while (__atomic_test_and_set(&lock->locked, __ATOMIC_ACQUIRE)) {
    (void)sched_yield();
  }
  return key;
}

void k_spin_unlock(struct k_spinlock *lock, k_spinlock_key_t key) {
  (void)key;
  __atomic_clear(&lock->locked, __ATOMIC_RELEASE);
}

void k_msgq_init(struct k_msgq *queue, char *buffer, size_t item_size, uint32_t capacity) {
  (void)pthread_mutex_init(&queue->lock, NULL);
  (void)pthread_cond_init(&queue->not_empty, NULL);
  queue->buffer = buffer;
  queue->item_size = item_size;
  queue->capacity = capacity;
  queue->head = 0U;
  queue->used = 0U;
}

int k_msgq_put(struct k_msgq *queue, const void *data, int timeout) {
  uint32_t tail;

  (void)timeout; /* a put never waits: the scan calls it */
  (void)pthread_mutex_lock(&queue->lock);
  if (queue->used >= queue->capacity) {
    (void)pthread_mutex_unlock(&queue->lock);
    return -ENOMSG;
  }
  tail = (queue->head + queue->used) % queue->capacity;
  memcpy(queue->buffer + (size_t)tail * queue->item_size, data, queue->item_size);
  queue->used++;
  (void)pthread_cond_signal(&queue->not_empty);
  (void)pthread_mutex_unlock(&queue->lock);
  return 0;
}

int k_msgq_get(struct k_msgq *queue, void *data, int timeout) {
  (void)pthread_mutex_lock(&queue->lock);
  while (queue->used == 0U) {
    if (timeout == K_NO_WAIT) {
      (void)pthread_mutex_unlock(&queue->lock);
      return -ENOMSG;
    }
    (void)pthread_cond_wait(&queue->not_empty, &queue->lock);
  }
  memcpy(data, queue->buffer + (size_t)queue->head * queue->item_size, queue->item_size);
  queue->head = (queue->head + 1U) % queue->capacity;
  queue->used--;
  (void)pthread_mutex_unlock(&queue->lock);
  return 0;
}

struct thread_start {
  k_thread_entry_t entry;
  void *a;
  void *b;
  void *c;
};

static void *thread_main(void *argument) {
  struct thread_start start = *(struct thread_start *)argument;

  free(argument);
  start.entry(start.a, start.b, start.c);
  return NULL;
}

int k_thread_create(struct k_thread *thread, char *stack, size_t size, k_thread_entry_t entry, void *a, void *b, void *c, int priority,
                    uint32_t options, int delay) {
  struct thread_start *start = malloc(sizeof(*start));
  int rc;

  (void)stack;
  (void)size;
  (void)priority;
  (void)options;
  (void)delay;
  if (start == NULL) {
    return -ENOMEM;
  }
  start->entry = entry;
  start->a = a;
  start->b = b;
  start->c = c;
  rc = pthread_create(&thread->id, NULL, thread_main, start);
  if (rc != 0) {
    free(start);
    return -rc;
  }
  (void)pthread_detach(thread->id);
  return 0;
}

int k_thread_name_set(struct k_thread *thread, const char *name) {
  (void)thread;
  (void)name;
  return 0;
}

int64_t k_uptime_get(void) {
  struct timespec now;

  (void)clock_gettime(CLOCK_MONOTONIC, &now);
  return (int64_t)now.tv_sec * 1000 + (int64_t)(now.tv_nsec / 1000000L);
}

uint32_t k_uptime_get_32(void) { return (uint32_t)k_uptime_get(); }

void zplc_host_log(const char *level, const char *format, ...) {
  va_list arguments;

  (void)fprintf(stderr, "[native-sim comm %s] ", level);
  va_start(arguments, format);
  (void)vfprintf(stderr, format, arguments);
  va_end(arguments);
  (void)fputc('\n', stderr);
}
