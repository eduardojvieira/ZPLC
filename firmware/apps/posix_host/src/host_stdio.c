#include "host_stdio.h"
#include "host_line_buffer.h"

#include <errno.h>
#include <stdlib.h>
#include <string.h>
#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#include <windows.h>
#else
#include <sys/select.h>
#include <unistd.h>
#endif

/*
 * Bytes read from the descriptor but not yet handed out. A wait on the descriptor
 * (select() here, PeekNamedPipe() on Windows) only sees the descriptor, so a buffered
 * FILE would hide a second request that arrived in the same read as the first; the
 * lines are therefore split here (host_line_buffer.c) instead.
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

#ifdef _WIN32
/* Whether the stream in `pending` is read through PeekNamedPipe() and ReadFile(). */
static int pending_is_pipe = 0;
#endif

/*
 * ZPLC_STDIO_TRACE=1 prints, once per input stream, which read path serves it, so a
 * test (the Windows nightly) can prove the path the runtime took.
 */
static void trace_read_path(const char *path) {
  const char *trace = getenv("ZPLC_STDIO_TRACE");

  if (trace != NULL && strcmp(trace, "1") == 0) {
    (void)fprintf(stderr, "[native-sim] stdio: stdin is read through %s\n", path);
  }
}

static int take_pending_line(char *buffer, size_t buffer_size, int at_eof, zplc_host_stdio_result_t *result) {
  return zplc_host_take_line(pending.data, &pending.len, sizeof(pending.data), buffer, buffer_size, at_eof, result);
}

#ifdef _WIN32
/*
 * A handle PeekNamedPipe() refuses (a console, a file) is waited on and read
 * through the FILE as before.
 */
static zplc_host_stdio_result_t wait_on_console(FILE *input, HANDLE input_handle, char *buffer, size_t buffer_size,
                                                unsigned int timeout_ms) {
  const DWORD wait_result = WaitForSingleObject(input_handle, (DWORD)timeout_ms);

  if (wait_result == WAIT_TIMEOUT) {
    return ZPLC_HOST_STDIO_TIMEOUT;
  }
  if (wait_result != WAIT_OBJECT_0) {
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

/*
 * A pipe: PeekNamedPipe() says how many bytes are waiting, ReadFile() takes them
 * into `pending` without blocking, and lines come only from `pending`.
 * ponytail: polls every millisecond; Sleep() rounds up to the system timer (about
 * 15 ms by default), which the 10 ms poll of the session tolerates. Use an
 * overlapped read with an event if a tighter wait is ever needed.
 */
static zplc_host_stdio_result_t wait_on_pipe(HANDLE input_handle, char *buffer, size_t buffer_size, unsigned int timeout_ms) {
  const ULONGLONG deadline = GetTickCount64() + (ULONGLONG)timeout_ms;
  DWORD available = 0U;
  DWORD got = 0U;
  DWORD room;
  zplc_host_stdio_result_t line_result;

  for (;;) {
    if (PeekNamedPipe(input_handle, NULL, 0U, NULL, &available, NULL) == 0) {
      if (GetLastError() == ERROR_BROKEN_PIPE) {
        /* The writer closed its end: hand out what is left, then end of input. */
        if (take_pending_line(buffer, buffer_size, 1, &line_result) != 0) {
          return line_result;
        }
        return ZPLC_HOST_STDIO_EOF;
      }
      return ZPLC_HOST_STDIO_ERROR;
    }
    if (available > 0U) {
      break;
    }
    if (GetTickCount64() >= deadline) {
      return ZPLC_HOST_STDIO_TIMEOUT;
    }
    Sleep(1U);
  }

  /* take_pending_line() empties a full buffer, so this cannot happen. */
  if (pending.len >= sizeof(pending.data)) {
    return ZPLC_HOST_STDIO_ERROR;
  }

  room = (DWORD)(sizeof(pending.data) - pending.len);
  if (available < room) {
    room = available;
  }

  /* PeekNamedPipe() said `available` bytes wait, so this read does not block. */
  if (ReadFile(input_handle, pending.data + pending.len, room, &got, NULL) == 0) {
    return (GetLastError() == ERROR_BROKEN_PIPE) ? ZPLC_HOST_STDIO_EOF : ZPLC_HOST_STDIO_ERROR;
  }

  pending.len += (size_t)got;
  if (take_pending_line(buffer, buffer_size, 0, &line_result) != 0) {
    return line_result;
  }

  /* Only a prefix of the next line has arrived: keep it and let the caller go on. */
  return ZPLC_HOST_STDIO_TIMEOUT;
}
#endif

zplc_host_stdio_result_t zplc_host_wait_for_request_line(FILE *input, char *buffer, size_t buffer_size, unsigned int timeout_ms) {
  int fd;
  zplc_host_stdio_result_t line_result;
#ifdef _WIN32
  intptr_t os_handle;
  HANDLE input_handle;
#else
  fd_set read_fds;
  struct timeval timeout;
  int select_result;
  ssize_t read_result;
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
#endif

  if (fd != pending.fd) {
    pending.fd = fd;
    pending.len = 0U;
#ifdef _WIN32
    {
      DWORD available = 0U;

      /*
       * Decided once, while `pending` is empty, so the two paths never share a stream. A handle
       * PeekNamedPipe() refuses (a console, a file) keeps the FILE path; a closed pipe is still a pipe.
       */
      pending_is_pipe = (PeekNamedPipe(input_handle, NULL, 0U, NULL, &available, NULL) != 0 || GetLastError() == ERROR_BROKEN_PIPE);
    }
    /*
     * The messages are bytes: no CR/LF translation and no Ctrl-Z end of file, on the
     * input and on the responses. stdout is flushed first so nothing already written
     * changes mode halfway.
     */
    (void)fflush(stdout);
    (void)_setmode(fd, _O_BINARY);
    (void)_setmode(_fileno(stdout), _O_BINARY);
    trace_read_path(pending_is_pipe ? "the pipe handle (PeekNamedPipe, ReadFile)" : "the FILE stream (WaitForSingleObject, fgets)");
#else
    trace_read_path("the descriptor (select, read)");
#endif
  }

  /* Lines that arrived together with an earlier one are served without waiting. */
  if (take_pending_line(buffer, buffer_size, 0, &line_result) != 0) {
    return line_result;
  }

#ifdef _WIN32
  if (pending_is_pipe) {
    return wait_on_pipe(input_handle, buffer, buffer_size, timeout_ms);
  }
  return wait_on_console(input, input_handle, buffer, buffer_size, timeout_ms);
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

  /*
   * take_pending_line() empties a full buffer, so this cannot happen; the test states the bound
   * to GCC 13, which otherwise reads sizeof - len as a wrapped size and stops on
   * -Werror=stringop-overflow in the fortified read().
   */
  if (pending.len >= sizeof(pending.data)) {
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
}
