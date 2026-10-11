/**
 * @file test_hal_posix_io_table.c
 * @brief The POSIX port lists no channel and says so through the shared accessors (IO-007).
 */

#define _POSIX_C_SOURCE 200809L

#include <zplc_hal.h>

#include <stdio.h>
#include <string.h>

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
} while (0)

int main(void) {
    uint16_t value = 7U;

    TEST_ASSERT(zplc_io_table() != NULL, "the table is never NULL");
    TEST_ASSERT(strcmp(zplc_io_table()->board_id, "posix") == 0, "the port names itself");
    TEST_ASSERT(zplc_io_channel_count() == 0U, "no channel is listed: the host exchanges the image with Studio");
    TEST_ASSERT(zplc_io_channel_at(0U) == NULL, "there is no channel 0");
    TEST_ASSERT(zplc_io_read_channel(NULL, &value) == ZPLC_HAL_ERROR, "reading no channel is an error");
    TEST_ASSERT(zplc_io_image_get(NULL, 0U, NULL) == 0U, "an image helper with no channel is zero");

    printf("\n%d checks, %d failed\n", test_count, fail_count);
    return fail_count == 0 ? 0 : 1;
}
