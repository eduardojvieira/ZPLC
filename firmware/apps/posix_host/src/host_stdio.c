#include "host_stdio.h"

#include <errno.h>
#include <string.h>
#include <sys/select.h>
#include <unistd.h>

zplc_host_stdio_result_t zplc_host_wait_for_request_line(FILE *input,
                                                         char *buffer,
                                                         size_t buffer_size,
                                                         unsigned int timeout_ms)
{
    int fd;
    fd_set read_fds;
    struct timeval timeout;
    int select_result;

    if (input == NULL || buffer == NULL || buffer_size == 0U) {
        return ZPLC_HOST_STDIO_ERROR;
    }

    fd = fileno(input);
    if (fd < 0) {
        return ZPLC_HOST_STDIO_ERROR;
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
}
