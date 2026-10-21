/**
 * @file zplc_ed25519.h
 * @brief Ed25519 signature verification (RFC 8032), for the signed artifact of COM-026.
 *
 * SPDX-License-Identifier: MIT
 *
 * A device that holds a public key accepts a program only when its signature verifies under that key. This is
 * verification only: it holds no secret, so it is neither constant-time nor does it need to be. It is the
 * field arithmetic of TweetNaCl (16 limbs of 16 bits) with the checks of RFC 8032 (the point must decode, and the
 * scalar of the signature must be below the order of the group), about 2 KB of stack and no table.
 *
 * Time: a verification is two scalar multiplications; on a Cortex-M0+ at 125 MHz it takes seconds, which a
 * deploy can afford and a scan cannot: it runs in the command that commits a program, never in the scan.
 */

#ifndef ZPLC_ED25519_H
#define ZPLC_ED25519_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define ZPLC_ED25519_PUBLIC_BYTES 32U
#define ZPLC_ED25519_SIGNATURE_BYTES 64U

/**
 * @brief Verify the signature of a message.
 * @return 0 when it is valid under the key, a negative number when it is not (or the key is not a point)
 */
int zplc_ed25519_verify(const uint8_t signature[ZPLC_ED25519_SIGNATURE_BYTES], const uint8_t public_key[ZPLC_ED25519_PUBLIC_BYTES],
                        const uint8_t *message, size_t length);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_ED25519_H */
