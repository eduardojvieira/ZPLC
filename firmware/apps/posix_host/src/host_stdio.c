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
#endif

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
