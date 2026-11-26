#include "host_line_buffer.h"

#include <string.h>

int zplc_host_take_line(char *data, size_t *length, size_t capacity, char *buffer, size_t buffer_size, int at_eof,
                        zplc_host_stdio_result_t *result) {
  size_t limit;
  size_t scan;
  size_t take;
  const char *newline;

  if (data == NULL || length == NULL || buffer == NULL || buffer_size == 0U || result == NULL) {
    return 0;
  }

  limit = buffer_size - 1U;
  if (limit > capacity) {
    limit = capacity;
  }

  scan = (*length < limit) ? *length : limit;
  newline = (const char *)memchr(data, '\n', scan);
  if (newline != NULL) {
    take = (size_t)(newline - data) + 1U;
    *result = ZPLC_HOST_STDIO_READY;
  } else if (*length >= limit || (at_eof && *length > 0U)) {
    take = (*length < limit) ? *length : limit;
    *result = ZPLC_HOST_STDIO_ERROR;
  } else {
    return 0;
  }

  memcpy(buffer, data, take);
  buffer[take] = '\0';
  *length -= take;
  memmove(data, data + take, *length);
  return 1;
}
