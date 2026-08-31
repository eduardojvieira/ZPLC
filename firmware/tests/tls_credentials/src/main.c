#include <errno.h>
#include <string.h>

#include <zephyr/fs/fs.h>
#include <zephyr/net/tls_credentials.h>
#include <zephyr/ztest.h>

#include <zplc_hal.h>
#include "zplc_tls_credentials.h"

zplc_hal_result_t zplc_hal_persist_load(const char *key, void *data, size_t len)
{
    static const char value[] = "stored";

    if (key != NULL && strcmp(key, "pem") == 0 && len >= sizeof(value)) {
        memcpy(data, value, sizeof(value));
        return ZPLC_HAL_OK;
    }
    return ZPLC_HAL_NOT_IMPL;
}

static void write_file(const char *path, const uint8_t *data, size_t len)
{
    struct fs_file_t file;
    int rc;

    rc = fs_unlink(path);
    zassert_true(rc == 0 || rc == -ENOENT, "unlink %s", path);
    fs_file_t_init(&file);
    zassert_ok(fs_open(&file, path, FS_O_CREATE | FS_O_WRITE), "open %s", path);
    zassert_equal(fs_write(&file, data, len), len, "write %s", path);
    zassert_ok(fs_close(&file), "close %s", path);
}

ZTEST(tls_credentials, test_reader_rejects_stale_and_truncated_files)
{
    const uint8_t exact[] = "1234567";
    const uint8_t too_big[] = "12345678";
    uint8_t out[8];

    write_file("/certs/exact.pem", exact, sizeof(exact) - 1U);
    memset(out, 0xA5, sizeof(out));
    zassert_equal(zplc_tls_credential_read_pem("/certs/exact.pem", out, sizeof(out)),
                  7, "cap-1 must fit");
    zassert_mem_equal(out, exact, sizeof(exact) - 1U, "exact bytes");
    zassert_equal(out[7], '\0', "terminated");

    write_file("/certs/too-big.pem", too_big, sizeof(too_big) - 1U);
    memset(out, 0xA5, sizeof(out));
    zassert_equal(zplc_tls_credential_read_pem("/certs/too-big.pem", out, sizeof(out)),
                  -EFBIG, "cap must fail");
    zassert_mem_equal(out, (uint8_t[8]){0}, sizeof(out), "failed output cleared");

    write_file("/certs/empty.pem", NULL, 0U);
    memset(out, 0xA5, sizeof(out));
    zassert_true(zplc_tls_credential_read_pem("/certs/empty.pem", out, sizeof(out)) < 0,
                 "empty must fail");
    zassert_mem_equal(out, (uint8_t[8]){0}, sizeof(out), "empty output cleared");
}

ZTEST(tls_credentials, test_replace_replaces_long_credential_exactly)
{
    static const uint8_t long_value[] = "long credential";
    static const uint8_t short_value[] = "short";
    uint8_t credential[sizeof(short_value)];
    size_t credential_len = sizeof(credential);
    const sec_tag_t tag = 4811;

    zassert_equal(tls_credential_delete(tag, TLS_CREDENTIAL_CA_CERTIFICATE), -ENOENT,
                  "must start absent");
    zassert_ok(zplc_tls_credential_replace(tag, TLS_CREDENTIAL_CA_CERTIFICATE,
                                           long_value, sizeof(long_value)),
               "install long");
    zassert_ok(zplc_tls_credential_replace(tag, TLS_CREDENTIAL_CA_CERTIFICATE,
                                           short_value, sizeof(short_value)),
               "replace short");
    zassert_ok(tls_credential_get(tag, TLS_CREDENTIAL_CA_CERTIFICATE,
                                  credential, &credential_len), "get short");
    zassert_equal(credential_len, sizeof(short_value), "no stale suffix");
    zassert_mem_equal(credential, short_value, sizeof(short_value), "exact short bytes");
    zassert_ok(tls_credential_delete(tag, TLS_CREDENTIAL_CA_CERTIFICATE), "cleanup");
}

ZTEST(tls_credentials, test_persisted_reader_requires_a_nonempty_key)
{
    uint8_t out[8];

    memset(out, 0xA5, sizeof(out));
    zassert_equal(zplc_tls_credential_read_pem("persist://pem", out, sizeof(out)), 6,
                  "persisted PEM");
    zassert_str_equal((char *)out, "stored", "persisted bytes");
    memset(out, 0xA5, sizeof(out));
    zassert_equal(zplc_tls_credential_read_pem("persist://", out, sizeof(out)),
                  -EINVAL, "empty key");
    zassert_mem_equal(out, (uint8_t[8]){0}, sizeof(out), "empty key clears output");
}

ZTEST_SUITE(tls_credentials, NULL, NULL, NULL, NULL, NULL);
