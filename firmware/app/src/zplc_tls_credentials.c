#include "zplc_tls_credentials.h"

#include <zplc_hal.h>

#include <zephyr/fs/fs.h>
#include <errno.h>
#include <limits.h>
#include <string.h>

static int read_persisted_pem(const char *key, uint8_t *buf, size_t buf_len)
{
    const uint8_t *terminator;
    size_t len;

    if (key[0] == '\0') {
        return -EINVAL;
    }
    if (zplc_hal_persist_load(key, buf, buf_len - 1U) != ZPLC_HAL_OK) {
        return -ENOENT;
    }
    buf[buf_len - 1U] = '\0';
    terminator = memchr(buf, '\0', buf_len - 1U);
    len = terminator == NULL ? buf_len - 1U : (size_t)(terminator - buf);
    return len == 0U ? -EINVAL : (int)len;
}

int zplc_tls_credential_read_pem(const char *path, uint8_t *buf, size_t buf_len)
{
    static const char persist_prefix[] = "persist://";
    struct fs_dirent entry;
    struct fs_file_t file;
    size_t size;
    size_t offset = 0U;
    int rc;

    if (path == NULL || buf == NULL || buf_len < 2U) {
        return -EINVAL;
    }
    memset(buf, 0, buf_len);
    if (strncmp(path, persist_prefix, sizeof(persist_prefix) - 1U) == 0) {
        rc = read_persisted_pem(path + sizeof(persist_prefix) - 1U, buf, buf_len);
        if (rc < 0) {
            memset(buf, 0, buf_len);
        }
        return rc;
    }

    rc = fs_stat(path, &entry);
    if (rc < 0) {
        return rc;
    }
    if (entry.type != FS_DIR_ENTRY_FILE || entry.size == 0U) {
        return -EINVAL;
    }
    size = entry.size;
    if (size >= buf_len || size > INT_MAX) {
        return -EFBIG;
    }

    fs_file_t_init(&file);
    rc = fs_open(&file, path, FS_O_READ);
    if (rc < 0) {
        return rc;
    }
    while (offset < size) {
        ssize_t read_len = fs_read(&file, buf + offset, size - offset);

        if (read_len < 0) {
            rc = (int)read_len;
            goto close;
        }
        if (read_len == 0) {
            rc = -EIO;
            goto close;
        }
        offset += (size_t)read_len;
    }
    {
        uint8_t extra;
        ssize_t read_len = fs_read(&file, &extra, sizeof(extra));

        if (read_len < 0) {
            rc = (int)read_len;
            goto close;
        }
        if (read_len != 0) {
            rc = -EFBIG;
            goto close;
        }
    }
    rc = (int)size;

close:
    {
        int close_rc = fs_close(&file);

        if (rc >= 0 && close_rc < 0) {
            rc = close_rc;
        }
    }
    if (rc < 0) {
        memset(buf, 0, buf_len);
        return rc;
    }
    buf[size] = '\0';
    return rc;
}

int zplc_tls_credential_replace(sec_tag_t tag, enum tls_credential_type type,
                                const void *credential, size_t credential_len)
{
    int rc;

    if (tag < 0 || type == TLS_CREDENTIAL_NONE || credential == NULL || credential_len == 0U) {
        return -EINVAL;
    }
    rc = tls_credential_delete(tag, type);
    if (rc != 0 && rc != -ENOENT) {
        return rc;
    }
    return tls_credential_add(tag, type, credential, credential_len);
}
