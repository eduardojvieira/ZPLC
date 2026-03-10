/**
 * ZPLC Azure IoT Hub — SAS Token Generator
 *
 * Computes SharedAccessSignature tokens on-device using mbedTLS HMAC-SHA256.
 * No pre-generated token string needs to be stored; only the base64 key is kept
 * in flash and the token is re-derived at connect time (or periodically).
 *
 * Token anatomy:
 *   SharedAccessSignature sr={uri}&sig={sig}&se={expiry}
 *
 *   uri     = URL-percent-encoded "{hub_host}/devices/{device_id}"
 *   sig     = base64( HMAC-SHA256( base64-decoded-key, "{uri}\n{expiry}" ) )
 *   expiry  = current UTC Unix time (seconds) + expiry_s
 *
 * All buffers are stack-allocated — no heap, no malloc.
 *
 * SPDX-License-Identifier: MIT
 */

#include "zplc_azure_sas.h"
#include "zplc_time.h"

#include <errno.h>
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <stdio.h>

#include <mbedtls/md.h>
#include <mbedtls/base64.h>

#include <zephyr/logging/log.h>
LOG_MODULE_REGISTER(zplc_azure_sas, LOG_LEVEL_INF);

/* ------------------------------------------------------------------ */
/* Internal limits                                                      */
/* ------------------------------------------------------------------ */
#define SAS_KEY_DEC_LEN   48U   /* 32-byte key decoded from ≤44-char b64 */
#define SAS_URI_LEN       256U  /* URL-encoded resource URI               */
#define SAS_STRING_LEN    320U  /* "{uri}\n{expiry}" string to sign        */
#define SAS_HMAC_LEN      32U   /* HMAC-SHA256 output                     */
#define SAS_SIG_B64_LEN   48U   /* base64 of 32 bytes = 44 chars + NUL    */
#define SAS_SIG_PCT_LEN   160U  /* percent-encoded base64 sig             */

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/**
 * @brief Percent-encode a string according to RFC 3986 (unreserved chars pass
 *        through; everything else becomes %XX). Used for the resource URI and
 *        the base64 signature.
 */
static int percent_encode(const char *in, char *out, size_t out_len)
{
    static const char hex[] = "0123456789ABCDEF";
    size_t pos = 0U;

    for (size_t i = 0U; in[i] != '\0'; i++) {
        unsigned char c = (unsigned char)in[i];
        /* RFC 3986 unreserved: A-Z a-z 0-9 - _ . ~ */
        bool unreserved = ((c >= 'A' && c <= 'Z') ||
                           (c >= 'a' && c <= 'z') ||
                           (c >= '0' && c <= '9') ||
                           c == '-' || c == '_' ||
                           c == '.' || c == '~');
        if (unreserved) {
            if (pos + 1U >= out_len) {
                return -ENOMEM;
            }
            out[pos++] = (char)c;
        } else {
            if (pos + 3U >= out_len) {
                return -ENOMEM;
            }
            out[pos++] = '%';
            out[pos++] = hex[(c >> 4U) & 0x0FU];
            out[pos++] = hex[c & 0x0FU];
        }
    }
    out[pos] = '\0';
    return 0;
}

/* ------------------------------------------------------------------ */
/* Public API                                                           */
/* ------------------------------------------------------------------ */

int zplc_azure_sas_generate_resource(const char *resource_uri,
                                     const char *sas_key_b64,
                                     uint32_t expiry_s,
                                     const char *key_name,
                                     char *out_buf,
                                     size_t out_len)
{
    if (!resource_uri || !sas_key_b64 || !out_buf || out_len == 0U) {
        return -EINVAL;
    }

    /* -------------------------------------------------------------- */
    /* 1. Decode the base64 SharedAccessKey → raw 32-byte HMAC key    */
    /* -------------------------------------------------------------- */
    uint8_t key_raw[SAS_KEY_DEC_LEN];
    size_t  key_raw_len = 0U;
    int rc = mbedtls_base64_decode(key_raw, sizeof(key_raw), &key_raw_len,
                                   (const unsigned char *)sas_key_b64,
                                   strlen(sas_key_b64));
    if (rc != 0) {
        LOG_ERR("Azure SAS: base64 key decode failed: %d", rc);
        return -EIO;
    }

    /* -------------------------------------------------------------- */
    /* 2. Percent-encode the resource URI. */
    /* -------------------------------------------------------------- */
    int n;
    if (strlen(resource_uri) >= SAS_URI_LEN) {
        return -ENOMEM;
    }

    char enc_uri[SAS_URI_LEN];
    rc = percent_encode(resource_uri, enc_uri, sizeof(enc_uri));
    if (rc != 0) {
        return rc;
    }

    /* -------------------------------------------------------------- */
    /* 3. Compute expiry epoch = now + expiry_s                        */
    /* -------------------------------------------------------------- */
    uint64_t now_ms = zplc_time_get_unix_ms();
    uint64_t expiry_epoch = (now_ms / 1000ULL) + (uint64_t)expiry_s;

    /* -------------------------------------------------------------- */
    /* 4. Build the string-to-sign: "{enc_uri}\n{expiry}"              */
    /* -------------------------------------------------------------- */
    char sign_str[SAS_STRING_LEN];
    n = snprintf(sign_str, sizeof(sign_str), "%s\n%llu", enc_uri,
                 (unsigned long long)expiry_epoch);
    if (n < 0 || (size_t)n >= sizeof(sign_str)) {
        return -ENOMEM;
    }

    /* -------------------------------------------------------------- */
    /* 5. HMAC-SHA256(key, sign_str)                                   */
    /* -------------------------------------------------------------- */
    uint8_t hmac[SAS_HMAC_LEN];
    const mbedtls_md_info_t *md_info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    if (!md_info) {
        LOG_ERR("Azure SAS: HMAC-SHA256 not available in mbedTLS config");
        return -EIO;
    }
    rc = mbedtls_md_hmac(md_info,
                         key_raw, key_raw_len,
                         (const unsigned char *)sign_str, strlen(sign_str),
                         hmac);
    if (rc != 0) {
        LOG_ERR("Azure SAS: HMAC compute failed: %d", rc);
        return -EIO;
    }

    /* -------------------------------------------------------------- */
    /* 6. base64-encode the HMAC result                                */
    /* -------------------------------------------------------------- */
    uint8_t sig_b64[SAS_SIG_B64_LEN];
    size_t  sig_b64_len = 0U;
    rc = mbedtls_base64_encode(sig_b64, sizeof(sig_b64), &sig_b64_len,
                               hmac, sizeof(hmac));
    if (rc != 0) {
        LOG_ERR("Azure SAS: base64 sig encode failed: %d", rc);
        return -EIO;
    }
    sig_b64[sig_b64_len] = '\0';

    /* -------------------------------------------------------------- */
    /* 7. Percent-encode the base64 signature ('+', '/' and '='       */
    /*    must be escaped for use in a URI query parameter)            */
    /* -------------------------------------------------------------- */
    char sig_pct[SAS_SIG_PCT_LEN];
    rc = percent_encode((const char *)sig_b64, sig_pct, sizeof(sig_pct));
    if (rc != 0) {
        return rc;
    }

    /* -------------------------------------------------------------- */
    /* 8. Assemble final token                                         */
    /* -------------------------------------------------------------- */
    if (key_name != NULL && key_name[0] != '\0') {
        n = snprintf(out_buf, out_len,
                     "SharedAccessSignature sr=%s&sig=%s&se=%llu&skn=%s",
                     enc_uri, sig_pct, (unsigned long long)expiry_epoch, key_name);
    } else {
        n = snprintf(out_buf, out_len,
                     "SharedAccessSignature sr=%s&sig=%s&se=%llu",
                     enc_uri, sig_pct, (unsigned long long)expiry_epoch);
    }
    if (n < 0 || (size_t)n >= out_len) {
        LOG_ERR("Azure SAS: output buffer too small (need %d, have %zu)", n + 1, out_len);
        return -ENOMEM;
    }

    LOG_INF("Azure SAS token generated (expires in %u s)", expiry_s);
    return 0;
}

int zplc_azure_sas_generate(const char *hub_host,
                            const char *device_id,
                            const char *sas_key_b64,
                            uint32_t expiry_s,
                            char *out_buf,
                            size_t out_len)
{
    char raw_uri[SAS_URI_LEN];
    int n;

    if (!hub_host || !device_id) {
        return -EINVAL;
    }

    n = snprintf(raw_uri, sizeof(raw_uri), "%s/devices/%s", hub_host, device_id);
    if (n < 0 || (size_t)n >= sizeof(raw_uri)) {
        return -ENOMEM;
    }

    return zplc_azure_sas_generate_resource(raw_uri, sas_key_b64, expiry_s,
                                            NULL, out_buf, out_len);
}
