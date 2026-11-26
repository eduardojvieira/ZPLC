#include "host_stdin_handoff.h"

/* RED: the hand-off is not implemented yet. */
int zplc_host_handoff_init(zplc_host_handoff_t *handoff) {
  (void)handoff;
  return 0;
}

void zplc_host_handoff_destroy(zplc_host_handoff_t *handoff) { (void)handoff; }

size_t zplc_host_handoff_wait_room(zplc_host_handoff_t *handoff) {
  (void)handoff;
  return 0U;
}

size_t zplc_host_handoff_put(zplc_host_handoff_t *handoff, const char *bytes, size_t count) {
  (void)handoff;
  (void)bytes;
  (void)count;
  return 0U;
}

void zplc_host_handoff_close(zplc_host_handoff_t *handoff, int failed) {
  (void)handoff;
  (void)failed;
}

int zplc_host_handoff_take(zplc_host_handoff_t *handoff, char *buffer, size_t buffer_size, zplc_host_stdio_result_t *result) {
  (void)handoff;
  (void)buffer;
  (void)buffer_size;
  (void)result;
  return 0;
}

int zplc_host_handoff_wait(zplc_host_handoff_t *handoff, unsigned int timeout_ms) {
  (void)handoff;
  (void)timeout_ms;
  return 0;
}
