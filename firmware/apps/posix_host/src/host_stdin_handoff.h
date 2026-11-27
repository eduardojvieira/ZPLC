#ifndef ZPLC_HOST_STDIN_HANDOFF_H
#define ZPLC_HOST_STDIN_HANDOFF_H

#include "host_stdio.h"

#include <stddef.h>

#ifdef _WIN32
#include <windows.h>
#else
#include <pthread.h>
#endif

/*
 * The hand-off between the thread that reads stdin (a blocking ReadFile() on Windows) and the
 * thread that waits for request lines. The reader appends bytes; the waiter takes whole lines
 * (host_line_buffer.c) and sleeps on the `ready` event until there is something to take.
 *
 * Both events are manual-reset, and both are set and reset only while `lock` is held:
 * - the reader sets `ready` after every append and at end of input;
 * - the waiter resets `ready` only when, under the lock, it found nothing to hand out.
 * An append that lands between the waiter's check and its wait therefore leaves `ready` set
 * (the reset came before it, under the same lock), and the wait returns at once: no wake-up is
 * lost. An auto-reset event would also keep that signal, but a waiter that wakes and finds only
 * a partial line would then need to loop and re-check; with manual reset the state of the event
 * is simply "the last check is stale". `room` works the same way for the reader when the
 * buffer is full.
 *
 * Windows uses CRITICAL_SECTION and CreateEvent(); other hosts emulate the manual-reset
 * events with a flag and a condition variable, so the rules are tested on every host.
 */
typedef struct {
#ifdef _WIN32
  CRITICAL_SECTION lock;
  HANDLE ready;
  HANDLE room;
#else
  pthread_mutex_t lock;
  pthread_cond_t changed;
  int ready;
  int room;
#endif
  size_t len;
  int eof;
  int failed;
  char data[ZPLC_HOST_STDIO_PENDING_MAX];
} zplc_host_handoff_t;

/* 0 on success. The struct is large: keep it static. */
int zplc_host_handoff_init(zplc_host_handoff_t *handoff);
void zplc_host_handoff_destroy(zplc_host_handoff_t *handoff);

/*
 * Reader side. wait_room() blocks until the buffer has room and returns how many bytes fit;
 * only the reader adds bytes, so put() of at most that many copies them all. put() returns the
 * number copied. close() marks end of input (failed != 0: a read error) and wakes the waiter.
 */
size_t zplc_host_handoff_wait_room(zplc_host_handoff_t *handoff);
size_t zplc_host_handoff_put(zplc_host_handoff_t *handoff, const char *bytes, size_t count);
void zplc_host_handoff_close(zplc_host_handoff_t *handoff, int failed);

/*
 * Waiter side. take() returns 1 with *result set (READY, an ERROR piece as in
 * zplc_host_take_line(), then ERROR once after a read error, then EOF) or 0 when nothing can be
 * handed out yet. wait() returns 1 when `ready` is set within timeout_ms, 0 on timeout.
 */
int zplc_host_handoff_take(zplc_host_handoff_t *handoff, char *buffer, size_t buffer_size, zplc_host_stdio_result_t *result);
int zplc_host_handoff_wait(zplc_host_handoff_t *handoff, unsigned int timeout_ms);

#endif /* ZPLC_HOST_STDIN_HANDOFF_H */
