/**
 * ZPLC Azure IoT Hub — SAS Token Generator
 *
 * Computes SharedAccessSignature tokens on-device using PSA HMAC-SHA256.
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

#include <mbedtls/base64.h>
#include <mbedtls/platform_util.h>

#include <psa/crypto.h>

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
    uint8_t key_raw[SAS_KEY_DEC_LEN] = { 0U };
    uint8_t hmac[SAS_HMAC_LEN] = { 0U };
    psa_key_attributes_t key_attributes = PSA_KEY_ATTRIBUTES_INIT;
    psa_key_id_t key = 0;
    bool key_imported = false;
    psa_status_t status;
    int rc = -EIO;
    size_t key_raw_len = 0U;

    if (out_buf != NULL && out_len > 0U) {
        out_buf[0] = '\0';
    }
    if (!resource_uri || !sas_key_b64 || !out_buf || out_len == 0U) {
        return -EINVAL;
    }

    /* -------------------------------------------------------------- */
    /* 1. Decode the base64 SharedAccessKey → raw 32-byte HMAC key    */
    /* -------------------------------------------------------------- */
    rc = mbedtls_base64_decode(key_raw, sizeof(key_raw), &key_raw_len,
                               (const unsigned char *)sas_key_b64,
                               strlen(sas_key_b64));
    if (rc != 0) {
        LOG_ERR("Azure SAS: base64 key decode failed: %d", rc);
        rc = -EIO;
        goto cleanup;
    }

    /* -------------------------------------------------------------- */
    /* 2. Percent-encode the resource URI. */
    /* -------------------------------------------------------------- */
    int n;
    if (strlen(resource_uri) >= SAS_URI_LEN) {
        rc = -ENOMEM;
        goto cleanup;
    }

    char enc_uri[SAS_URI_LEN];
    rc = percent_encode(resource_uri, enc_uri, sizeof(enc_uri));
    if (rc != 0) {
        goto cleanup;
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
        rc = -ENOMEM;
        goto cleanup;
    }

    /* -------------------------------------------------------------- */
    /* 5. HMAC-SHA256(key, sign_str)                                   */
    /* -------------------------------------------------------------- */
    status = psa_crypto_init();
    if (status != PSA_SUCCESS) {
        LOG_ERR("Azure SAS: PSA initialization failed: %d", (int)status);
        goto cleanup;
    }
    psa_set_key_usage_flags(&key_attributes, PSA_KEY_USAGE_SIGN_MESSAGE);
    psa_set_key_algorithm(&key_attributes, PSA_ALG_HMAC(PSA_ALG_SHA_256));
    psa_set_key_type(&key_attributes, PSA_KEY_TYPE_HMAC);
    psa_set_key_bits(&key_attributes, key_raw_len * 8U);
    status = psa_import_key(&key_attributes, key_raw, key_raw_len, &key);
    if (status != PSA_SUCCESS) {
        LOG_ERR("Azure SAS: HMAC key import failed: %d", (int)status);
        goto cleanup;
    }
    key_imported = true;
    {
        size_t hmac_len = 0U;

        status = psa_mac_compute(key, PSA_ALG_HMAC(PSA_ALG_SHA_256),
                                 (const uint8_t *)sign_str, strlen(sign_str),
                                 hmac, sizeof(hmac), &hmac_len);
        if (status != PSA_SUCCESS || hmac_len != sizeof(hmac)) {
            LOG_ERR("Azure SAS: HMAC compute failed: %d", (int)status);
            goto cleanup;
        }
    }
    status = psa_destroy_key(key);
    if (status != PSA_SUCCESS) {
        LOG_ERR("Azure SAS: HMAC key destroy failed: %d", (int)status);
        goto cleanup;
    }
    key_imported = false;

    /* -------------------------------------------------------------- */
    /* 6. base64-encode the HMAC result                                */
    /* -------------------------------------------------------------- */
    uint8_t sig_b64[SAS_SIG_B64_LEN];
    size_t  sig_b64_len = 0U;
    rc = mbedtls_base64_encode(sig_b64, sizeof(sig_b64), &sig_b64_len,
                               hmac, sizeof(hmac));
    if (rc != 0) {
        LOG_ERR("Azure SAS: base64 sig encode failed: %d", rc);
        rc = -EIO;
        goto cleanup;
    }
    sig_b64[sig_b64_len] = '\0';

    /* -------------------------------------------------------------- */
    /* 7. Percent-encode the base64 signature ('+', '/' and '='       */
    /*    must be escaped for use in a URI query parameter)            */
    /* -------------------------------------------------------------- */
    char sig_pct[SAS_SIG_PCT_LEN];
    rc = percent_encode((const char *)sig_b64, sig_pct, sizeof(sig_pct));
    if (rc != 0) {
        goto cleanup;
    }

    /* -------------------------------------------------------------- */
    /* 8. Assemble final token                                         */
    /* -------------------------------------------------------------- */
    if (key_name != NULL && key_name[0] != '\0') {
        n = snprintf(NULL, 0U,
                     "SharedAccessSignature sr=%s&sig=%s&se=%llu&skn=%s",
                     enc_uri, sig_pct, (unsigned long long)expiry_epoch, key_name);
    } else {
        n = snprintf(NULL, 0U,
                     "SharedAccessSignature sr=%s&sig=%s&se=%llu",
                     enc_uri, sig_pct, (unsigned long long)expiry_epoch);
    }
    if (n < 0 || (size_t)n >= out_len) {
        LOG_ERR("Azure SAS: output buffer too small (need %d, have %zu)", n + 1, out_len);
        rc = -ENOMEM;
        goto cleanup;
    }
    if (key_name != NULL && key_name[0] != '\0') {
        (void)snprintf(out_buf, out_len,
                       "SharedAccessSignature sr=%s&sig=%s&se=%llu&skn=%s",
                       enc_uri, sig_pct, (unsigned long long)expiry_epoch, key_name);
    } else {
        (void)snprintf(out_buf, out_len,
                       "SharedAccessSignature sr=%s&sig=%s&se=%llu",
                       enc_uri, sig_pct, (unsigned long long)expiry_epoch);
    }

    LOG_INF("Azure SAS token generated (expires in %u s)", expiry_s);
    rc = 0;

cleanup:
    if (key_imported) {
        (void)psa_destroy_key(key);
    }
    psa_reset_key_attributes(&key_attributes);
    mbedtls_platform_zeroize(key_raw, sizeof(key_raw));
    mbedtls_platform_zeroize(hmac, sizeof(hmac));
    return rc;
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

    if (out_buf != NULL && out_len > 0U) {
        out_buf[0] = '\0';
    }
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
