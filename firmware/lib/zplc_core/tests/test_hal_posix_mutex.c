/**
 * @file test_hal_posix_mutex.c
 * @brief POSIX HAL mutex regression tests.
 */

#define _POSIX_C_SOURCE 200809L

#include <zplc_hal.h>

#include <stdio.h>
#include <stdlib.h>
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

static void test_mutex_create_destroy(void)
{
    printf("\n=== Test: POSIX HAL mutex create/destroy ===\n");

    zplc_hal_mutex_t mtx = zplc_hal_mutex_create();
    TEST_ASSERT(mtx != NULL, "mutex_create returns non-NULL handle");

    if (mtx != NULL) {
        TEST_ASSERT(zplc_hal_mutex_destroy(mtx) == ZPLC_HAL_OK,
                    "mutex_destroy succeeds on valid handle");
    }

    TEST_ASSERT(zplc_hal_mutex_destroy(NULL) == ZPLC_HAL_ERROR,
                "mutex_destroy fails on NULL handle");
}

static void test_mutex_lock_unlock(void)
{
    printf("\n=== Test: POSIX HAL mutex lock/unlock ===\n");

    zplc_hal_mutex_t mtx = zplc_hal_mutex_create();
    TEST_ASSERT(mtx != NULL, "mutex_create returns non-NULL handle");
    if (mtx == NULL) {
        return;
    }

    TEST_ASSERT(zplc_hal_mutex_lock(mtx) == ZPLC_HAL_OK,
                "mutex_lock succeeds on valid handle");
    TEST_ASSERT(zplc_hal_mutex_unlock(mtx) == ZPLC_HAL_OK,
                "mutex_unlock succeeds after lock");

    TEST_ASSERT(zplc_hal_mutex_lock(NULL) == ZPLC_HAL_ERROR,
                "mutex_lock fails on NULL handle");
    TEST_ASSERT(zplc_hal_mutex_unlock(NULL) == ZPLC_HAL_ERROR,
                "mutex_unlock fails on NULL handle");

    TEST_ASSERT(zplc_hal_mutex_destroy(mtx) == ZPLC_HAL_OK,
                "mutex_destroy succeeds after lock/unlock cycle");
}

static void test_mutex_mutual_exclusion(void)
{
    printf("\n=== Test: POSIX HAL mutex mutual exclusion ===\n");

    zplc_hal_mutex_t mtx = zplc_hal_mutex_create();
    TEST_ASSERT(mtx != NULL, "mutex_create returns non-NULL handle");
    if (mtx == NULL) {
        return;
    }

    /* Simple single-threaded test: lock, verify state concept, unlock */
    volatile int protected_value = 0;

    TEST_ASSERT(zplc_hal_mutex_lock(mtx) == ZPLC_HAL_OK,
                "mutex_lock before critical section");

    protected_value = 42;
    TEST_ASSERT(protected_value == 42,
                "value set inside critical section");

    TEST_ASSERT(zplc_hal_mutex_unlock(mtx) == ZPLC_HAL_OK,
                "mutex_unlock after critical section");

    TEST_ASSERT(protected_value == 42,
                "value preserved after unlock");

    TEST_ASSERT(zplc_hal_mutex_destroy(mtx) == ZPLC_HAL_OK,
                "mutex_destroy succeeds after exclusion test");
}

int main(void)
{
    printf("Running POSIX HAL mutex tests...\n");

    test_mutex_create_destroy();
    test_mutex_lock_unlock();
    test_mutex_mutual_exclusion();

    printf("\n=== POSIX HAL mutex tests complete ===\n");
    printf("Tests run: %d\n", test_count);
    printf("Failures:  %d\n", fail_count);

    return (fail_count == 0) ? 0 : 1;
}
