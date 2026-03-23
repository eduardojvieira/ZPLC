/**
 * @file test_hal_posix_persist.c
 * @brief POSIX HAL persistence regression tests.
 */

#define _POSIX_C_SOURCE 200809L

#include <zplc_hal.h>

#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
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
} while (0)

static void remove_tree(const char *path)
{
    char retain_path[512];
    char nested_path[512];

    (void)snprintf(retain_path, sizeof(retain_path), "%s/retain.bin", path);
    (void)snprintf(nested_path, sizeof(nested_path), "%s/foo_bar.bin", path);
    (void)unlink(retain_path);
    (void)unlink(nested_path);
    (void)rmdir(path);
}

static int create_temp_dir(char *buffer, size_t buffer_size)
{
    int pid;

    if (buffer == NULL || buffer_size < 32U) {
        return -1;
    }

    pid = (int)getpid();
    (void)snprintf(buffer, buffer_size, "/tmp/zplc-hal-posix-%d-%d", pid, test_count + fail_count + 1);
    if (mkdir(buffer, 0700) != 0) {
        return -1;
    }

    return 0;
}

static void test_persist_roundtrip(void)
{
    char temp_dir[256];
    uint8_t saved_bytes[4] = {0x2A, 0x00, 0x00, 0x01};
    uint8_t loaded_bytes[4] = {0U, 0U, 0U, 0U};

    printf("\n=== Test: POSIX HAL persistence roundtrip ===\n");

    TEST_ASSERT(create_temp_dir(temp_dir, sizeof(temp_dir)) == 0,
                "temporary persistence directory created");
    if (access(temp_dir, F_OK) != 0) {
        return;
    }

    TEST_ASSERT(setenv("ZPLC_PERSIST_ROOT", temp_dir, 1) == 0,
                "ZPLC_PERSIST_ROOT override applied");
    TEST_ASSERT(zplc_hal_init() == ZPLC_HAL_OK, "HAL initialized successfully");
    TEST_ASSERT(zplc_hal_persist_save("retain", saved_bytes, sizeof(saved_bytes)) == ZPLC_HAL_OK,
                "persist_save stores retain payload");
    TEST_ASSERT(zplc_hal_persist_load("retain", loaded_bytes, sizeof(loaded_bytes)) == ZPLC_HAL_OK,
                "persist_load restores retain payload");
    TEST_ASSERT(memcmp(saved_bytes, loaded_bytes, sizeof(saved_bytes)) == 0,
                "loaded retain payload matches saved bytes");
    TEST_ASSERT(zplc_hal_persist_delete("retain") == ZPLC_HAL_OK,
                "persist_delete removes saved payload");
    TEST_ASSERT(zplc_hal_persist_load("retain", loaded_bytes, sizeof(loaded_bytes)) == ZPLC_HAL_NOT_IMPL,
                "deleted payload is reported as not found");
    TEST_ASSERT(zplc_hal_shutdown() == ZPLC_HAL_OK, "HAL shutdown succeeds");

    remove_tree(temp_dir);
    (void)unsetenv("ZPLC_PERSIST_ROOT");
}

static void test_key_sanitization(void)
{
    char temp_dir[256];
    char expected_file[512];
    uint8_t payload[2] = {0xAA, 0x55};
    struct stat file_info;

    printf("\n=== Test: POSIX HAL persistence key sanitization ===\n");

    TEST_ASSERT(create_temp_dir(temp_dir, sizeof(temp_dir)) == 0,
                "temporary directory created for sanitized keys");
    if (access(temp_dir, F_OK) != 0) {
        return;
    }

    TEST_ASSERT(setenv("ZPLC_PERSIST_ROOT", temp_dir, 1) == 0,
                "ZPLC_PERSIST_ROOT override applied for key sanitization");
    TEST_ASSERT(zplc_hal_init() == ZPLC_HAL_OK, "HAL initialized for key sanitization test");
    TEST_ASSERT(zplc_hal_persist_save("foo/bar", payload, sizeof(payload)) == ZPLC_HAL_OK,
                "persist_save accepts slash-delimited key names");

    (void)snprintf(expected_file, sizeof(expected_file), "%s/foo_bar.bin", temp_dir);
    TEST_ASSERT(stat(expected_file, &file_info) == 0,
                "slash-delimited key is sanitized into a flat filename");

    TEST_ASSERT(zplc_hal_shutdown() == ZPLC_HAL_OK, "HAL shutdown succeeds after key sanitization test");

    remove_tree(temp_dir);
    (void)unsetenv("ZPLC_PERSIST_ROOT");
}

int main(void)
{
    test_persist_roundtrip();
    test_key_sanitization();

    printf("\n=== POSIX HAL persistence tests complete ===\n");
    printf("Tests run: %d\n", test_count);
    printf("Failures:  %d\n", fail_count);

    return (fail_count == 0) ? 0 : 1;
}
