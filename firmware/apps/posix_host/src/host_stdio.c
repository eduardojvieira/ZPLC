#include "host_stdio.h"

#include <errno.h>
#include <string.h>
#ifdef _WIN32
#include <io.h>
#include <windows.h>
#else
#include <sys/select.h>
#include <unistd.h>
#endif

#ifndef _WIN32
/*
 * Bytes read from the descriptor but not yet handed out. select() only sees the
 * descriptor, so a buffered FILE would hide a second request that arrived in the
 * same read(2) as the first; the lines are therefore split here instead.
 * ponytail: one static buffer for the one input stream the runtime has (stdin);
 * make it a per-stream struct if a second reader ever appears. It holds
 * ZPLC_HOST_STDIO_PENDING_MAX (96 KiB, one whole maximum request line); a
 * caller whose buffer is larger than that gets lines cut at the pending size,
 * so raise the constant together with ZPLC_NATIVE_REQUEST_MAX.
 */
static struct {
    int fd;
    size_t len;
    char data[ZPLC_HOST_STDIO_PENDING_MAX];
} pending = {-1, 0U, {0}};

/*
 * Move the oldest line out of `pending` into `buffer`. A line longer than the
 * buffer comes out in buffer-sized pieces without a newline (ERROR), and so does
 * an unterminated tail at end of input, exactly as fgets() delivered them.
 * Returns 0 when a complete line has not arrived yet.
 */
static int take_pending_line(char *buffer,
                             size_t buffer_size,
                             int at_eof,
                             zplc_host_stdio_result_t *result)
{
    size_t limit = buffer_size - 1U;
    size_t scan;
    size_t take;
    const char *newline;

    if (limit > sizeof(pending.data)) {
        limit = sizeof(pending.data);
    }

    scan = (pending.len < limit) ? pending.len : limit;
    newline = (const char *)memchr(pending.data, '\n', scan);
    if (newline != NULL) {
        take = (size_t)(newline - pending.data) + 1U;
        *result = ZPLC_HOST_STDIO_READY;
    } else if (pending.len >= limit || (at_eof && pending.len > 0U)) {
        take = (pending.len < limit) ? pending.len : limit;
        *result = ZPLC_HOST_STDIO_ERROR;
    } else {
        return 0;
    }

    memcpy(buffer, pending.data, take);
    buffer[take] = '\0';
    pending.len -= take;
    memmove(pending.data, pending.data + take, pending.len);
    return 1;
}
#endif

zplc_host_stdio_result_t zplc_host_wait_for_request_line(FILE *input,
                                                         char *buffer,
                                                         size_t buffer_size,
                                                         unsigned int timeout_ms)
{
    int fd;
#ifndef _WIN32
    fd_set read_fds;
    struct timeval timeout;
    int select_result;
    ssize_t read_result;
    zplc_host_stdio_result_t line_result;
#else
    intptr_t os_handle;
    HANDLE input_handle;
    DWORD wait_result;
#endif

    if (input == NULL || buffer == NULL || buffer_size == 0U) {
        return ZPLC_HOST_STDIO_ERROR;
    }

    #ifdef _WIN32
    fd = _fileno(input);
    #else
    fd = fileno(input);
    #endif
    if (fd < 0) {
        return ZPLC_HOST_STDIO_ERROR;
    }

#ifdef _WIN32
    os_handle = _get_osfhandle(fd);
    if (os_handle == -1) {
        return ZPLC_HOST_STDIO_ERROR;
    }

    input_handle = (HANDLE)os_handle;
    wait_result = WaitForSingleObject(input_handle, (DWORD)timeout_ms);
    if (wait_result == WAIT_TIMEOUT) {
        return ZPLC_HOST_STDIO_TIMEOUT;
    }

    if (wait_result != WAIT_OBJECT_0) {
        return ZPLC_HOST_STDIO_ERROR;
    }
#else
    if (fd != pending.fd) {
        pending.fd = fd;
        pending.len = 0U;
    }

    /* Lines that arrived together with an earlier one are served without waiting. */
    if (take_pending_line(buffer, buffer_size, 0, &line_result) != 0) {
        return line_result;
    }

    FD_ZERO(&read_fds);
    FD_SET(fd, &read_fds);

    timeout.tv_sec = (time_t)(timeout_ms / 1000U);
    timeout.tv_usec = (suseconds_t)((timeout_ms % 1000U) * 1000U);

    select_result = select(fd + 1, &read_fds, NULL, NULL, &timeout);
    if (select_result == 0) {
        return ZPLC_HOST_STDIO_TIMEOUT;
    }

    if (select_result < 0) {
        if (errno == EINTR) {
            return ZPLC_HOST_STDIO_TIMEOUT;
        }

        return ZPLC_HOST_STDIO_ERROR;
    }

    /* select() said readable, so this read does not block; it may carry several lines. */
    read_result = read(fd, pending.data + pending.len, sizeof(pending.data) - pending.len);
    if (read_result < 0) {
        if (errno == EINTR || errno == EAGAIN || errno == EWOULDBLOCK) {
            return ZPLC_HOST_STDIO_TIMEOUT;
        }

        return ZPLC_HOST_STDIO_ERROR;
    }

    pending.len += (size_t)read_result;
    if (take_pending_line(buffer, buffer_size, read_result == 0, &line_result) != 0) {
        return line_result;
    }

    /* Only a prefix of the next line has arrived: keep it and let the caller go on. */
    return (read_result == 0) ? ZPLC_HOST_STDIO_EOF : ZPLC_HOST_STDIO_TIMEOUT;
#endif

#ifdef _WIN32
    if (fgets(buffer, (int)buffer_size, input) == NULL) {
        if (feof(input) != 0) {
            return ZPLC_HOST_STDIO_EOF;
        }

        clearerr(input);
        return ZPLC_HOST_STDIO_ERROR;
    }

    if (strchr(buffer, '\n') == NULL) {
        return ZPLC_HOST_STDIO_ERROR;
    }

    return ZPLC_HOST_STDIO_READY;
#endif
}
