#ifndef ZPLC_HOST_STDIO_H
#define ZPLC_HOST_STDIO_H

#if !defined(_WIN32) && !defined(_POSIX_C_SOURCE)
#define _POSIX_C_SOURCE 200809L
#endif

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
