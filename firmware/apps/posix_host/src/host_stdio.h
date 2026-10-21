#ifndef ZPLC_HOST_STDIO_H
#define ZPLC_HOST_STDIO_H

#if !defined(_WIN32) && !defined(_POSIX_C_SOURCE)
#define _POSIX_C_SOURCE 200809L /* NOLINT(bugprone-reserved-identifier,cert-dcl37-c,cert-dcl51-cpp): feature-test macro */
#endif

#include <stddef.h>
#include <stdio.h>

#include "native_runtime_session.h"

/*
 * Bytes read from the descriptor and not yet handed out (see host_stdio.c). It
 * holds one whole request line, so a program.load of the largest program the VM
 * takes is delivered in one piece rather than cut at the buffer's size.
 */
#define ZPLC_HOST_STDIO_PENDING_MAX ZPLC_NATIVE_REQUEST_MAX

typedef enum {
  ZPLC_HOST_STDIO_TIMEOUT = 0,
  ZPLC_HOST_STDIO_READY = 1,
  ZPLC_HOST_STDIO_EOF = 2,
  ZPLC_HOST_STDIO_ERROR = 3,
} zplc_host_stdio_result_t;

/*
 * Wait up to timeout_ms for one newline-terminated request line from input and
 * copy it, newline included, into buffer.
 *
 * READY    a whole line is in buffer. Every line already received is delivered,
 *          in order, even when several arrived in one write.
 * TIMEOUT  no whole line yet (a partial line is kept for the next call).
 * EOF      the input is closed and drained.
 * ERROR    read failure, or the text in buffer has no newline: the line was
 *          longer than buffer, or the input ended in the middle of a line. The
 *          rest of a long line is returned by the following calls.
 *
 * On POSIX the descriptor is read directly, so the same stream must not also be
 * read through stdio.
 */
zplc_host_stdio_result_t zplc_host_wait_for_request_line(FILE *input, char *buffer, size_t buffer_size, unsigned int timeout_ms);

#endif /* ZPLC_HOST_STDIO_H */
