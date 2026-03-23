#include "host_stdio.h"

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

int main(void)
{
    test_wait_times_out_without_input();
    test_wait_reads_complete_line();

    printf("\n=== Host stdio tests complete ===\n");
    printf("Tests run: %d\n", test_count);
    printf("Failures:  %d\n", fail_count);

    return (fail_count == 0) ? 0 : 1;
}
