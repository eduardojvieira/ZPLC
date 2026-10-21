/*
 * Host stand-in for the part of the Zephyr kernel API that the communication
 * handlers of firmware/app use, so that the handler sources themselves are
 * compiled and run on the host (COM-001 tests). Nothing here schedules or
 * blocks: the handlers' worker threads are not started.
 */
#ifndef ZPLC_TEST_STUB_ZEPHYR_KERNEL_H
#define ZPLC_TEST_STUB_ZEPHYR_KERNEL_H

#include <errno.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

struct k_msgq {
  int unused;
};
struct k_thread {
  int unused;
};
typedef void (*k_thread_entry_t)(void *, void *, void *);

/* The handler's slot states are guarded by a spinlock; the host test is one
 * thread, so locking has nothing to do here. */
struct k_spinlock {
  int unused;
};
typedef struct {
  int key;
} k_spinlock_key_t;

static inline k_spinlock_key_t k_spin_lock(struct k_spinlock *lock) {
  k_spinlock_key_t key = {0};

  (void)lock;
  return key;
}

static inline void k_spin_unlock(struct k_spinlock *lock, k_spinlock_key_t key) {
  (void)lock;
  (void)key;
}

/* The tick of the handlers' request ages: the host test sets it by defining this function. */
uint32_t k_uptime_get_32(void);

#define K_FOREVER 0
#define K_NO_WAIT 0
#define K_PRIO_PREEMPT(priority) (priority)
#define K_THREAD_STACK_DEFINE(name, size) char name[size]
#define K_THREAD_STACK_SIZEOF(stack) sizeof(stack)
#define ARG_UNUSED(value) (void)(value)

int k_msgq_get(struct k_msgq *queue, void *data, int timeout);
int k_msgq_put(struct k_msgq *queue, const void *data, int timeout);
void k_msgq_init(struct k_msgq *queue, char *buffer, size_t size, uint32_t count);
int k_thread_create(struct k_thread *thread, char *stack, size_t size, k_thread_entry_t entry, void *a, void *b, void *c, int priority,
                    uint32_t options, int delay);
int k_thread_name_set(struct k_thread *thread, const char *name);

#endif
