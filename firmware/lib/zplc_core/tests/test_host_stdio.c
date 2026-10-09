#include "host_stdio.h"
#include "native_runtime_session.h"

#include <stdio.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

static int test_count = 0;
static int fail_count = 0;

#define TEST_ASSERT(cond, msg) do { \
    test_count++; \
    if (!(cond)) { \
        fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__); \
        fail_count++; \
    } else { \
        printf("PASS: %s\n", msg); \
    } \
} while(0)

static long elapsed_ms(const struct timespec *start, const struct timespec *end)
{
    const long seconds_ms = (long)(end->tv_sec - start->tv_sec) * 1000L;
    const long nanoseconds_ms = (long)(end->tv_nsec - start->tv_nsec) / 1000000L;
    return seconds_ms + nanoseconds_ms;
}

static void test_wait_times_out_without_input(void)
{
    int pipe_fds[2];
    FILE *read_stream;
    char buffer[128];
    struct timespec start;
    struct timespec end;
    zplc_host_stdio_result_t result;

    printf("\n=== Test: wait times out without input ===\n");

    TEST_ASSERT(pipe(pipe_fds) == 0, "pipe() succeeds");
    read_stream = fdopen(pipe_fds[0], "r");
    TEST_ASSERT(read_stream != NULL, "fdopen() succeeds for read stream");

    if (read_stream == NULL) {
        close(pipe_fds[0]);
        close(pipe_fds[1]);
        return;
    }

    (void)clock_gettime(CLOCK_MONOTONIC, &start);
    result = zplc_host_wait_for_request_line(read_stream, buffer, sizeof(buffer), 25U);
    (void)clock_gettime(CLOCK_MONOTONIC, &end);

    TEST_ASSERT(result == ZPLC_HOST_STDIO_TIMEOUT, "wait returns timeout when no stdin data arrives");
    TEST_ASSERT(elapsed_ms(&start, &end) >= 15L, "wait respects timeout instead of spinning");

    fclose(read_stream);
    close(pipe_fds[1]);
}

static void test_wait_reads_complete_line(void)
{
    int pipe_fds[2];
    FILE *read_stream;
    char buffer[128];
    const char *request_line = "{\"id\":\"req-1\"}\n";
    zplc_host_stdio_result_t result;

    printf("\n=== Test: wait reads complete line ===\n");

    TEST_ASSERT(pipe(pipe_fds) == 0, "pipe() succeeds");
    read_stream = fdopen(pipe_fds[0], "r");
    TEST_ASSERT(read_stream != NULL, "fdopen() succeeds for read stream");

    if (read_stream == NULL) {
        close(pipe_fds[0]);
        close(pipe_fds[1]);
        return;
    }

    TEST_ASSERT(write(pipe_fds[1], request_line, strlen(request_line)) == (ssize_t)strlen(request_line),
                "write() sends complete request line");

    result = zplc_host_wait_for_request_line(read_stream, buffer, sizeof(buffer), 25U);

    TEST_ASSERT(result == ZPLC_HOST_STDIO_READY, "wait reports ready when a complete line arrives");
    TEST_ASSERT(strcmp(buffer, request_line) == 0, "wait reads the exact request line");

    fclose(read_stream);
    close(pipe_fds[1]);
}

/* Open a pipe and wrap its read end in a stream, as the runtime does with stdin. */
static FILE *open_pipe_stream(int pipe_fds[2])
{
    FILE *stream;

    if (pipe(pipe_fds) != 0) {
        return NULL;
    }

    stream = fdopen(pipe_fds[0], "r");
    if (stream == NULL) {
        close(pipe_fds[0]);
        close(pipe_fds[1]);
    }

    return stream;
}

static void write_all(int fd, const char *data)
{
    const size_t length = strlen(data);

    TEST_ASSERT(write(fd, data, length) == (ssize_t)length, "write() sends the whole chunk");
}

/* One call that must return `expected_result`, with `expected_text` in the buffer when non-NULL. */
static void expect_call(FILE *stream,
                        char *buffer,
                        size_t buffer_size,
                        zplc_host_stdio_result_t expected_result,
                        const char *expected_text,
                        const char *msg)
{
    const zplc_host_stdio_result_t result =
        zplc_host_wait_for_request_line(stream, buffer, buffer_size, 25U);

    if (result != expected_result) {
        fprintf(stderr, "  got result %d, expected %d\n", (int)result, (int)expected_result);
    }
    TEST_ASSERT(result == expected_result, msg);
    if (expected_text != NULL && result == expected_result) {
        TEST_ASSERT(strcmp(buffer, expected_text) == 0, "buffer holds the expected text");
    }
}

static void test_pipelined_lines_are_all_delivered(void)
{
    int pipe_fds[2];
    FILE *read_stream;
    char buffer[128];

    printf("\n=== Test: lines that arrive in one write are all delivered ===\n");

    read_stream = open_pipe_stream(pipe_fds);
    TEST_ASSERT(read_stream != NULL, "pipe stream opens");
    if (read_stream == NULL) {
        return;
    }

    write_all(pipe_fds[1], "{\"id\":\"a\"}\n{\"id\":\"b\"}\n{\"id\":\"c\"}\n");

    expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_READY,
                "{\"id\":\"a\"}\n", "first pipelined line is ready");
    expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_READY,
                "{\"id\":\"b\"}\n", "second pipelined line is ready without more input");
    expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_READY,
                "{\"id\":\"c\"}\n", "third pipelined line is ready without more input");
    expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_TIMEOUT, NULL,
                "nothing left times out");

    fclose(read_stream);
    close(pipe_fds[1]);
}

static void test_large_pipelined_lines(void)
{
    int pipe_fds[2];
    FILE *read_stream;
    char first[8000];
    char second[8000];
    char request[sizeof(first) + sizeof(second)];
    char buffer[8192];

    printf("\n=== Test: two near-maximum lines in one write ===\n");

    read_stream = open_pipe_stream(pipe_fds);
    TEST_ASSERT(read_stream != NULL, "pipe stream opens");
    if (read_stream == NULL) {
        return;
    }

    memset(first, 'x', sizeof(first) - 2U);
    first[sizeof(first) - 2U] = '\n';
    first[sizeof(first) - 1U] = '\0';
    memset(second, 'y', sizeof(second) - 2U);
    second[sizeof(second) - 2U] = '\n';
    second[sizeof(second) - 1U] = '\0';
    (void)snprintf(request, sizeof(request), "%s%s", first, second);

    write_all(pipe_fds[1], request);

    expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_READY, first,
                "first large line is delivered intact");
    expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_READY, second,
                "second large line is delivered intact without more input");

    fclose(read_stream);
    close(pipe_fds[1]);
}

static void test_partial_line_waits_for_its_newline(void)
{
    int pipe_fds[2];
    FILE *read_stream;
    char buffer[128];

    printf("\n=== Test: a partial trailing line is held until it completes ===\n");

    read_stream = open_pipe_stream(pipe_fds);
    TEST_ASSERT(read_stream != NULL, "pipe stream opens");
    if (read_stream == NULL) {
        return;
    }

    write_all(pipe_fds[1], "one\ntwo\nthr");

    expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_READY, "one\n",
                "first line is ready");
    expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_READY, "two\n",
                "second line is ready");
    expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_TIMEOUT, NULL,
                "the unfinished third line times out");

    write_all(pipe_fds[1], "ee\n");
    expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_READY, "three\n",
                "the third line completes from the held prefix");

    fclose(read_stream);
    close(pipe_fds[1]);
}

static void test_partial_line_alone_does_not_block(void)
{
    int pipe_fds[2];
    FILE *read_stream;
    char buffer[128];
    struct timespec start;
    struct timespec end;
    zplc_host_stdio_result_t result;

    printf("\n=== Test: a partial line alone does not stall the caller ===\n");

    read_stream = open_pipe_stream(pipe_fds);
    TEST_ASSERT(read_stream != NULL, "pipe stream opens");
    if (read_stream == NULL) {
        return;
    }

    write_all(pipe_fds[1], "par");

    (void)clock_gettime(CLOCK_MONOTONIC, &start);
    result = zplc_host_wait_for_request_line(read_stream, buffer, sizeof(buffer), 25U);
    (void)clock_gettime(CLOCK_MONOTONIC, &end);

    TEST_ASSERT(result == ZPLC_HOST_STDIO_TIMEOUT, "a line without its newline times out");
    TEST_ASSERT(elapsed_ms(&start, &end) < 1000L, "the caller is not blocked waiting for the newline");

    write_all(pipe_fds[1], "tial\n");
    expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_READY, "partial\n",
                "the line completes from the held prefix");

    fclose(read_stream);
    close(pipe_fds[1]);
}

static void test_line_arriving_one_byte_at_a_time(void)
{
    int pipe_fds[2];
    FILE *read_stream;
    char buffer[128];
    const char *request = "ab\ncd\n";
    size_t i;

    printf("\n=== Test: lines arriving one byte at a time ===\n");

    read_stream = open_pipe_stream(pipe_fds);
    TEST_ASSERT(read_stream != NULL, "pipe stream opens");
    if (read_stream == NULL) {
        return;
    }

    for (i = 0U; request[i] != '\0'; i++) {
        const char piece[2] = {request[i], '\0'};
        const int completes_line = (request[i] == '\n');

        write_all(pipe_fds[1], piece);
        if (!completes_line) {
            expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_TIMEOUT, NULL,
                        "a line is not ready before its newline");
        } else {
            expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_READY,
                        (i == 2U) ? "ab\n" : "cd\n", "a line is ready at its newline");
        }
    }

    fclose(read_stream);
    close(pipe_fds[1]);
}

static void test_line_longer_than_buffer(void)
{
    int pipe_fds[2];
    FILE *read_stream;
    char buffer[8];

    printf("\n=== Test: line that does not fit the buffer ===\n");

    read_stream = open_pipe_stream(pipe_fds);
    TEST_ASSERT(read_stream != NULL, "pipe stream opens");
    if (read_stream == NULL) {
        return;
    }

    /* Seven characters plus the newline fit an 8-byte buffer with its terminator. */
    write_all(pipe_fds[1], "123456\n");
    expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_READY, "123456\n",
                "a line that exactly fills the buffer is ready");

    /* Longer lines come back in buffer-sized pieces, each piece without a newline is an error. */
    write_all(pipe_fds[1], "0123456789ABCDEF\nok\n");
    expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_ERROR, "0123456",
                "first piece of an over-long line is an error");
    expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_ERROR, "789ABCD",
                "second piece of an over-long line is an error");
    expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_READY, "EF\n",
                "the tail of an over-long line ends at its newline");
    expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_READY, "ok\n",
                "the next line is not lost behind an over-long one");

    /* A newline just past the limit leaves a bare newline line, as fgets did. */
    write_all(pipe_fds[1], "1234567\n");
    expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_ERROR, "1234567",
                "seven characters without room for the newline is an error");
    expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_READY, "\n",
                "the lone newline is the next line");

    fclose(read_stream);
    close(pipe_fds[1]);
}

static void test_end_of_input(void)
{
    int pipe_fds[2];
    FILE *read_stream;
    char buffer[128];

    printf("\n=== Test: end of input ===\n");

    read_stream = open_pipe_stream(pipe_fds);
    TEST_ASSERT(read_stream != NULL, "pipe stream opens");
    if (read_stream == NULL) {
        return;
    }

    write_all(pipe_fds[1], "a\nb\n");
    close(pipe_fds[1]);
    expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_READY, "a\n",
                "first line is ready before the writer closed");
    expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_READY, "b\n",
                "second line is ready after the writer closed");
    expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_EOF, NULL,
                "end of input is reported once the lines are drained");
    expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_EOF, NULL,
                "end of input stays reported");
    fclose(read_stream);

    read_stream = open_pipe_stream(pipe_fds);
    TEST_ASSERT(read_stream != NULL, "second pipe stream opens");
    if (read_stream == NULL) {
        return;
    }

    /* The prefix is held like any other; the close shows it will never be completed. */
    write_all(pipe_fds[1], "tail");
    close(pipe_fds[1]);
    expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_TIMEOUT, NULL,
                "an unterminated last line is held first");
    expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_ERROR, "tail",
                "an unterminated last line is an error once the input ends");
    expect_call(read_stream, buffer, sizeof(buffer), ZPLC_HOST_STDIO_EOF, NULL,
                "end of input follows the unterminated line");
    fclose(read_stream);
}

/*
 * A pipe holds 64 KiB, so a write that long with nobody reading would block. The IDE's
 * line reaches the runtime in several reads; feed it the same way, reading after each chunk.
 * Returns the result of the last read. Every read before the last must find no whole line.
 */
#define FEED_CHUNK 30000U

static zplc_host_stdio_result_t feed_line(int write_fd,
                                          FILE *stream,
                                          const char *data,
                                          size_t length,
                                          char *buffer,
                                          size_t buffer_size)
{
    zplc_host_stdio_result_t result = ZPLC_HOST_STDIO_TIMEOUT;
    size_t sent = 0U;

    while (sent < length) {
        const size_t chunk = ((length - sent) < FEED_CHUNK) ? (length - sent) : FEED_CHUNK;
        const ssize_t written = write(write_fd, data + sent, chunk);

        if (written != (ssize_t)chunk) {
            TEST_ASSERT(0, "write() sends the whole chunk");
            return ZPLC_HOST_STDIO_ERROR;
        }
        sent += chunk;
        result = zplc_host_wait_for_request_line(stream, buffer, buffer_size, 25U);
        if (sent < length && result != ZPLC_HOST_STDIO_TIMEOUT) {
            TEST_ASSERT(0, "a long line is not ready before its last chunk");
            return result;
        }
    }

    return result;
}

static char large_line[ZPLC_NATIVE_REQUEST_MAX];
static char large_buffer[ZPLC_NATIVE_REQUEST_MAX];

static void test_largest_program_load_is_delivered_whole(void)
{
    static const char tail[] = "\"}}\n";
    int pipe_fds[2];
    FILE *read_stream;
    char id[64];
    size_t length;

    printf("\n=== Test: the largest program.load request is delivered whole ===\n");

    /* The longest legal request: a 63-character id and a program of ZPLC_MEM_CODE_SIZE bytes in hex. */
    memset(id, 'a', 63U);
    id[63] = '\0';
    length = (size_t)snprintf(large_line, sizeof(large_line),
                              "{\"id\":\"%s\",\"type\":\"request\",\"method\":\"program.load\","
                              "\"params\":{\"bytecode_hex\":\"", id);
    TEST_ASSERT(length > 0U && length < 256U, "the request envelope is a few hundred bytes at most");
    TEST_ASSERT(length + (ZPLC_MEM_CODE_SIZE * 2U) + sizeof(tail) <= ZPLC_NATIVE_REQUEST_MAX,
                "the request buffer holds the largest program.load line, newline and terminator included");
    TEST_ASSERT(ZPLC_NATIVE_REQUEST_MAX >= (ZPLC_MEM_CODE_SIZE * 2U) + ZPLC_NATIVE_REQUEST_ENVELOPE_MAX,
                "the request buffer is the hex of a full program plus the envelope allowance");
    TEST_ASSERT(ZPLC_HOST_STDIO_PENDING_MAX >= ZPLC_NATIVE_REQUEST_MAX,
                "the pending buffer holds one whole request line");
    TEST_ASSERT(ZPLC_NATIVE_RESPONSE_MAX >= 8192U && ZPLC_NATIVE_EVENT_MAX >= 8192U,
                "the response and event buffers are not smaller than before");

    memset(large_line + length, 'A', ZPLC_MEM_CODE_SIZE * 2U);
    length += ZPLC_MEM_CODE_SIZE * 2U;
    memcpy(large_line + length, tail, sizeof(tail));
    length += sizeof(tail) - 1U;

    read_stream = open_pipe_stream(pipe_fds);
    TEST_ASSERT(read_stream != NULL, "pipe stream opens");
    if (read_stream == NULL) {
        return;
    }

    TEST_ASSERT(feed_line(pipe_fds[1], read_stream, large_line, length,
                          large_buffer, sizeof(large_buffer)) == ZPLC_HOST_STDIO_READY,
                "the largest program.load line is ready in one piece");
    TEST_ASSERT(strlen(large_buffer) == length && strcmp(large_buffer, large_line) == 0,
                "the largest program.load line arrives intact");

    fclose(read_stream);
    close(pipe_fds[1]);
}

static void test_request_buffer_boundary(void)
{
    int pipe_fds[2];
    FILE *read_stream;
    size_t length;

    printf("\n=== Test: a line fills the request buffer exactly, one more byte is cut ===\n");

    read_stream = open_pipe_stream(pipe_fds);
    TEST_ASSERT(read_stream != NULL, "pipe stream opens");
    if (read_stream == NULL) {
        return;
    }

    /* The buffer takes the newline and the terminator: ZPLC_NATIVE_REQUEST_MAX - 1 bytes of line. */
    length = ZPLC_NATIVE_REQUEST_MAX - 1U;
    memset(large_line, 'x', length - 1U);
    large_line[length - 1U] = '\n';
    large_line[length] = '\0';
    TEST_ASSERT(feed_line(pipe_fds[1], read_stream, large_line, length,
                          large_buffer, sizeof(large_buffer)) == ZPLC_HOST_STDIO_READY,
                "a line that exactly fills the request buffer is ready");
    TEST_ASSERT(strcmp(large_buffer, large_line) == 0, "the exact-fit line arrives intact");

    length = ZPLC_NATIVE_REQUEST_MAX;
    memset(large_line, 'y', length - 1U);
    large_line[length - 1U] = '\n';
    TEST_ASSERT(feed_line(pipe_fds[1], read_stream, large_line, length,
                          large_buffer, sizeof(large_buffer)) == ZPLC_HOST_STDIO_ERROR,
                "a line one byte too long is an error");
    TEST_ASSERT(strlen(large_buffer) == ZPLC_NATIVE_REQUEST_MAX - 1U &&
                strchr(large_buffer, '\n') == NULL,
                "the error carries a full buffer without the newline");
    expect_call(read_stream, large_buffer, sizeof(large_buffer), ZPLC_HOST_STDIO_READY, "\n",
                "the newline of the cut line is the next line");

    fclose(read_stream);
    close(pipe_fds[1]);
}

int main(void)
{
    /* Keep the log when the alarm below kills the run. */
    (void)setvbuf(stdout, NULL, _IOLBF, 0);

    /* A reader that blocks for a newline would hang here; fail the run instead. */
    (void)alarm(10U);

    test_wait_times_out_without_input();
    test_wait_reads_complete_line();
    test_pipelined_lines_are_all_delivered();
    test_large_pipelined_lines();
    test_partial_line_waits_for_its_newline();
    test_line_arriving_one_byte_at_a_time();
    test_line_longer_than_buffer();
    test_end_of_input();
    test_partial_line_alone_does_not_block();
    /* Last: the pending buffer is shared by every stream, so a failure here must not leak into another test. */
    test_largest_program_load_is_delivered_whole();
    test_request_buffer_boundary();

    printf("\n=== Host stdio tests complete ===\n");
    printf("Tests run: %d\n", test_count);
    printf("Failures:  %d\n", fail_count);

    return (fail_count == 0) ? 0 : 1;
}
