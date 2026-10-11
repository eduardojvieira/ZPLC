/*
 * The part of the Zephyr kernel API that the communication handlers of firmware/app use, on POSIX threads
 * (COM-009). The simulation runtime compiles the handler sources of the application unchanged against this
 * header, so a block behaves in simulation as it does on a controller: the same slots, the same worker, the
 * same handshake. Nothing here is a general kernel: it is exactly what those sources call.
 *
 * SPDX-License-Identifier: MIT
 */
#ifndef ZPLC_HOST_SHIM_ZEPHYR_KERNEL_H
#define ZPLC_HOST_SHIM_ZEPHYR_KERNEL_H

#include <errno.h>
#include <pthread.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define ARG_UNUSED(value) (void)(value)
#ifndef MIN
#define MIN(a, b) ((a) < (b) ? (a) : (b))
#endif

/* A timeout is a number of milliseconds here; K_FOREVER waits for ever. */
#define K_FOREVER (-1)
#define K_NO_WAIT 0
#define K_PRIO_PREEMPT(priority) (priority)
#define K_THREAD_STACK_DEFINE(name, size) char name[size]
#define K_THREAD_STACK_SIZEOF(stack) sizeof(stack)

/* The locks that guard a slot are held for a few instructions: a spin lock, as on the controller. */
struct k_spinlock {
  volatile unsigned char locked;
};
typedef struct {
  int key;
} k_spinlock_key_t;

k_spinlock_key_t k_spin_lock(struct k_spinlock *lock);
void k_spin_unlock(struct k_spinlock *lock, k_spinlock_key_t key);

struct k_msgq {
  pthread_mutex_t lock;
  pthread_cond_t not_empty;
  char *buffer;
  size_t item_size;
  uint32_t capacity;
  uint32_t head;
  uint32_t used;
};

void k_msgq_init(struct k_msgq *queue, char *buffer, size_t item_size, uint32_t capacity);
int k_msgq_put(struct k_msgq *queue, const void *data, int timeout);
int k_msgq_get(struct k_msgq *queue, void *data, int timeout);

struct k_thread {
  pthread_t id;
};
typedef void (*k_thread_entry_t)(void *, void *, void *);

int k_thread_create(struct k_thread *thread, char *stack, size_t size, k_thread_entry_t entry,
                    void *a, void *b, void *c, int priority, uint32_t options, int delay);
int k_thread_name_set(struct k_thread *thread, const char *name);

/* The monotonic clock of the machine, in milliseconds: the time limits of a request are real time. */
int64_t k_uptime_get(void);
uint32_t k_uptime_get_32(void);

#endif
