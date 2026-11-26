#include "host_stdin_handoff.h"
#include "host_line_buffer.h"

#include <string.h>

#ifndef _WIN32
#include <errno.h>
#include <time.h>
#endif

/*
 * The primitives. Every set and reset below runs with the lock held (see the header for why
 * that is what keeps a wake-up from being lost); only the wait itself runs without it.
 */
#ifdef _WIN32
static void handoff_lock(zplc_host_handoff_t *handoff) { EnterCriticalSection(&handoff->lock); }
static void handoff_unlock(zplc_host_handoff_t *handoff) { LeaveCriticalSection(&handoff->lock); }
static void set_ready(zplc_host_handoff_t *handoff, int on) { (void)(on ? SetEvent(handoff->ready) : ResetEvent(handoff->ready)); }
static void set_room(zplc_host_handoff_t *handoff, int on) { (void)(on ? SetEvent(handoff->room) : ResetEvent(handoff->room)); }
#else
static void handoff_lock(zplc_host_handoff_t *handoff) { (void)pthread_mutex_lock(&handoff->lock); }
static void handoff_unlock(zplc_host_handoff_t *handoff) { (void)pthread_mutex_unlock(&handoff->lock); }
static void set_ready(zplc_host_handoff_t *handoff, int on) {
  handoff->ready = on;
  if (on) {
    (void)pthread_cond_broadcast(&handoff->changed);
  }
}
static void set_room(zplc_host_handoff_t *handoff, int on) {
  handoff->room = on;
  if (on) {
    (void)pthread_cond_broadcast(&handoff->changed);
  }
}
#endif

int zplc_host_handoff_init(zplc_host_handoff_t *handoff) {
  handoff->len = 0U;
  handoff->eof = 0;
  handoff->failed = 0;
#ifdef _WIN32
  InitializeCriticalSection(&handoff->lock);
  handoff->ready = CreateEventW(NULL, TRUE, FALSE, NULL);
  handoff->room = CreateEventW(NULL, TRUE, TRUE, NULL);
  if (handoff->ready == NULL || handoff->room == NULL) {
    zplc_host_handoff_destroy(handoff);
    return -1;
  }
#else
  if (pthread_mutex_init(&handoff->lock, NULL) != 0) {
    return -1;
  }
  if (pthread_cond_init(&handoff->changed, NULL) != 0) {
    (void)pthread_mutex_destroy(&handoff->lock);
    return -1;
  }
  handoff->ready = 0;
  handoff->room = 1;
#endif
  return 0;
}

void zplc_host_handoff_destroy(zplc_host_handoff_t *handoff) {
#ifdef _WIN32
  if (handoff->ready != NULL) {
    (void)CloseHandle(handoff->ready);
  }
  if (handoff->room != NULL) {
    (void)CloseHandle(handoff->room);
  }
  DeleteCriticalSection(&handoff->lock);
#else
  (void)pthread_cond_destroy(&handoff->changed);
  (void)pthread_mutex_destroy(&handoff->lock);
#endif
}

size_t zplc_host_handoff_wait_room(zplc_host_handoff_t *handoff) {
  size_t room;

  handoff_lock(handoff);
  while (handoff->len >= sizeof(handoff->data) && handoff->eof == 0) {
    set_room(handoff, 0);
#ifdef _WIN32
    handoff_unlock(handoff);
    (void)WaitForSingleObject(handoff->room, INFINITE);
    handoff_lock(handoff);
#else
    while (handoff->room == 0) {
      (void)pthread_cond_wait(&handoff->changed, &handoff->lock);
    }
#endif
  }
  /* Once closed nothing more is taken in: 0 tells the reader to stop. */
  room = (handoff->eof != 0) ? 0U : sizeof(handoff->data) - handoff->len;
  handoff_unlock(handoff);
  return room;
}

size_t zplc_host_handoff_put(zplc_host_handoff_t *handoff, const char *bytes, size_t count) {
  size_t room;

  handoff_lock(handoff);
  room = (handoff->eof != 0) ? 0U : sizeof(handoff->data) - handoff->len;
  if (count > room) {
    count = room;
  }
  if (count > 0U) {
    memcpy(handoff->data + handoff->len, bytes, count);
    handoff->len += count;
    set_ready(handoff, 1);
  }
  handoff_unlock(handoff);
  return count;
}

void zplc_host_handoff_close(zplc_host_handoff_t *handoff, int failed) {
  handoff_lock(handoff);
  if (handoff->eof == 0) {
    handoff->eof = 1;
    handoff->failed = (failed != 0);
  }
  set_ready(handoff, 1);
  set_room(handoff, 1); /* a reader waiting for room sees the close and stops */
  handoff_unlock(handoff);
}

int zplc_host_handoff_take(zplc_host_handoff_t *handoff, char *buffer, size_t buffer_size, zplc_host_stdio_result_t *result) {
  int taken;

  if (buffer == NULL || buffer_size == 0U || result == NULL) {
    return 0;
  }

  handoff_lock(handoff);
  taken = zplc_host_take_line(handoff->data, &handoff->len, sizeof(handoff->data), buffer, buffer_size, handoff->eof, result);
  if (taken != 0) {
    set_room(handoff, 1);
  } else if (handoff->eof != 0) {
    /* Drained after the close: a read error once, then end of input; `ready` stays set. */
    buffer[0] = '\0';
    *result = (handoff->failed != 0) ? ZPLC_HOST_STDIO_ERROR : ZPLC_HOST_STDIO_EOF;
    handoff->failed = 0;
    taken = 1;
  } else {
    /* Nothing whole to hand out: sleep until the reader appends again. */
    set_ready(handoff, 0);
  }
  handoff_unlock(handoff);
  return taken;
}

int zplc_host_handoff_wait(zplc_host_handoff_t *handoff, unsigned int timeout_ms) {
#ifdef _WIN32
  return (WaitForSingleObject(handoff->ready, (DWORD)timeout_ms) == WAIT_OBJECT_0) ? 1 : 0;
#else
  struct timespec deadline;
  int ready;
  int wait_result = 0;

  (void)clock_gettime(CLOCK_REALTIME, &deadline);
  deadline.tv_sec += (time_t)(timeout_ms / 1000U);
  deadline.tv_nsec += (long)(timeout_ms % 1000U) * 1000000L;
  if (deadline.tv_nsec >= 1000000000L) {
    deadline.tv_sec += 1;
    deadline.tv_nsec -= 1000000000L;
  }

  handoff_lock(handoff);
  while (handoff->ready == 0 && wait_result != ETIMEDOUT) {
    wait_result = pthread_cond_timedwait(&handoff->changed, &handoff->lock, &deadline);
  }
  ready = handoff->ready;
  handoff_unlock(handoff);
  return ready;
#endif
}
