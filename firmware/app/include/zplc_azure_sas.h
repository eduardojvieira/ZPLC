/**
 * ZPLC Azure IoT Hub — SAS Token Generator
 *
 * Generates a SharedAccessSignature token for authenticating to Azure IoT Hub
 * over MQTT. The token is computed entirely on-device using HMAC-SHA256 (via
 * mbedTLS) so no pre-generated secret string needs to be stored in flash.
 *
 * Token format:
 *   SharedAccessSignature sr={uri}&sig={base64(HMAC-SHA256(key, "{uri}\n{expiry}"))}&se={expiry}
 *
 * Where:
 *   uri     = URL-encoded "{hub_host}/devices/{device_id}"
 *   expiry  = Unix timestamp (seconds) after which the token is invalid
 *   key     = base64-decoded SharedAccessKey from the IoT Hub device/policy
 *
 * SPDX-License-Identifier: MIT
 */

#ifndef ZPLC_AZURE_SAS_H
#define ZPLC_AZURE_SAS_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Generate an Azure IoT Hub SAS token.
 *
 * @param hub_host   Hostname of the IoT Hub  (e.g. "myhub.azure-devices.net")
 * @param device_id  Device identifier         (e.g. "zplc-001")
 * @param sas_key_b64 Base64-encoded SharedAccessKey from the Azure portal
 *                    (primary or secondary key — 32-byte key encodes as 44 chars)
 * @param expiry_s   Token validity duration in seconds from now
 * @param out_buf    Output buffer that will receive the null-terminated SAS token
 * @param out_len    Size of out_buf in bytes (recommend >= 512)
 *
 * @return 0 on success, negative errno on failure:
 *         -EINVAL  invalid arguments (NULL pointers or zero lengths)
 *         -ENOMEM  out_buf too small
 *         -EIO     mbedTLS crypto operation failed
 */
int zplc_azure_sas_generate(const char *hub_host,
                             const char *device_id,
                             const char *sas_key_b64,
                             uint32_t    expiry_s,
                             char       *out_buf,
                             size_t      out_len);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_AZURE_SAS_H */
