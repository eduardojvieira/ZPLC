#ifndef ZPLC_HOST_STDIO_H
#define ZPLC_HOST_STDIO_H

#include <stddef.h>
#include <stdio.h>

typedef enum {
    ZPLC_HOST_STDIO_TIMEOUT = 0,
    ZPLC_HOST_STDIO_READY = 1,
    ZPLC_HOST_STDIO_EOF = 2,
    ZPLC_HOST_STDIO_ERROR = 3,
} zplc_host_stdio_result_t;

zplc_host_stdio_result_t zplc_host_wait_for_request_line(FILE *input,
                                                         char *buffer,
                                                         size_t buffer_size,
                                                         unsigned int timeout_ms);

#endif /* ZPLC_HOST_STDIO_H */
