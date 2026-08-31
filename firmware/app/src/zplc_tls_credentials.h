#ifndef ZPLC_TLS_CREDENTIALS_H_
#define ZPLC_TLS_CREDENTIALS_H_

#include <stddef.h>
#include <stdint.h>

#include <zephyr/net/tls_credentials.h>

int zplc_tls_credential_read_pem(const char *path, uint8_t *buf, size_t buf_len);
int zplc_tls_credential_replace(sec_tag_t tag, enum tls_credential_type type,
                                const void *credential, size_t credential_len);

#endif
