/**
 * @file zplc_proto.h
 * @brief The codec of the device link protocol: frames, and a decoder that finds them in a byte stream (COM-019).
 *
 * SPDX-License-Identifier: MIT
 *
 * A frame is a header (sync, version, flags, message, sequence, length), a payload, an optional 32-byte message
 * authentication code and a CRC-32. The numbers and layouts are in zplc_proto_defs.h, generated from
 * tools/contract/protocol.json; the rules (what a decoder discards and counts) are written there too, and the
 * TypeScript codec of the ZPLC application follows the same rules. Both run the same generated frames (zplc_proto_vectors.h).
 *
 * Portable C99: no Zephyr header, no allocation, no clock. A decoder owns one buffer of ZPLC_PROTO_FRAME_MAX bytes.
 */

#ifndef ZPLC_PROTO_H
#define ZPLC_PROTO_H

#include <stddef.h>
#include <stdint.h>

#include "zplc_proto_defs.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief The largest payload this build accepts in one frame.
 *
 * Kconfig sets it per board (a small board takes less RAM); it is between ZPLC_PROTO_PAYLOAD_MAX_MIN and
 * ZPLC_PROTO_PAYLOAD_MAX_HARD. A payload large enough for the largest force (ZPLC_PROTO_FORCE_BYTES_MAX plus an
 * address) is needed to force a long STRING.
 */
#ifdef CONFIG_ZPLC_PROTO_PAYLOAD_MAX
#define ZPLC_PROTO_PAYLOAD_MAX_CONFIGURED CONFIG_ZPLC_PROTO_PAYLOAD_MAX
#else
#define ZPLC_PROTO_PAYLOAD_MAX_CONFIGURED ZPLC_PROTO_PAYLOAD_MAX_DEFAULT
#endif

#if (ZPLC_PROTO_PAYLOAD_MAX_CONFIGURED < ZPLC_PROTO_PAYLOAD_MAX_MIN) || (ZPLC_PROTO_PAYLOAD_MAX_CONFIGURED > ZPLC_PROTO_PAYLOAD_MAX_HARD)
#error "ZPLC_PROTO_PAYLOAD_MAX is outside the limits of the protocol"
#endif

#define ZPLC_PROTO_PAYLOAD_MAX ((size_t)ZPLC_PROTO_PAYLOAD_MAX_CONFIGURED)

/** @brief Bytes of the largest frame: header, payload, code and checksum. */
#define ZPLC_PROTO_FRAME_MAX (ZPLC_PROTO_HEADER_BYTES + ZPLC_PROTO_PAYLOAD_MAX + ZPLC_PROTO_MAC_BYTES + ZPLC_PROTO_CRC_BYTES)

/** @brief Why a buffer is not a frame (zplc_proto_parse). */
#define ZPLC_PROTO_PARSE_SHORT (-1)     /**< fewer bytes than the header and the length need */
#define ZPLC_PROTO_PARSE_SYNC (-2)      /**< the buffer does not start with the sync pair */
#define ZPLC_PROTO_PARSE_VERSION (-3)   /**< another protocol version */
#define ZPLC_PROTO_PARSE_MALFORMED (-4) /**< reserved flag bits, or the kind 3 */
#define ZPLC_PROTO_PARSE_OVERSIZE (-5)  /**< the payload is above the limit */
#define ZPLC_PROTO_PARSE_LENGTH (-6)    /**< more bytes than one frame */
#define ZPLC_PROTO_PARSE_CRC (-7)       /**< the checksum does not match */

/** @brief A frame that passed the checks of the codec. The pointers point into the buffer that was parsed. */
typedef struct {
  uint8_t kind;          /**< ZPLC_PROTO_KIND_* */
  uint8_t message;       /**< the message number */
  uint8_t authenticated; /**< 1 when a code follows the payload */
  uint32_t sequence;
  uint16_t length; /**< bytes of the payload */
  const uint8_t *payload;
  const uint8_t *mac;     /**< ZPLC_PROTO_MAC_BYTES bytes, or NULL */
  const uint8_t *covered; /**< the bytes the code covers: the header and the payload */
  size_t covered_length;
} zplc_proto_frame_t;

/** @brief What a decoder discarded, and why. Counted since init. */
typedef struct {
  uint32_t frames;         /**< valid frames delivered */
  uint32_t crc_errors;     /**< candidates whose checksum did not match */
  uint32_t version_errors; /**< candidates of another protocol version */
  uint32_t malformed;      /**< candidates with reserved flag bits or kind 3 */
  uint32_t oversize;       /**< candidates that announced a payload above the limit */
  uint32_t resyncs;        /**< candidates abandoned for any of the four reasons above */
} zplc_proto_decoder_stats_t;

typedef struct {
  uint8_t buf[ZPLC_PROTO_FRAME_MAX];
  size_t fill;
  size_t payload_max;
  zplc_proto_decoder_stats_t stats;
} zplc_proto_decoder_t;

/** @brief Called once for each valid frame. The frame is valid until the callback returns. */
typedef void (*zplc_proto_frame_fn)(void *context, const zplc_proto_frame_t *frame);

/** @brief Bytes of a frame with a payload of @p length bytes. */
static inline size_t zplc_proto_frame_size(size_t length, int authenticated) {
  return (size_t)ZPLC_PROTO_HEADER_BYTES + length + (authenticated != 0 ? (size_t)ZPLC_PROTO_MAC_BYTES : 0U) + (size_t)ZPLC_PROTO_CRC_BYTES;
}

/**
 * @brief Write the header of a frame whose payload is already at out + ZPLC_PROTO_HEADER_BYTES.
 *
 * For a sender that builds the payload in place. Returns the number of header bytes.
 */
size_t zplc_proto_write_header(uint8_t *out, uint8_t kind, uint8_t message, uint32_t sequence, uint16_t length, int authenticated);

/**
 * @brief Write the header and the payload of a frame.
 *
 * @return bytes used (the header and the payload), or 0 when @p capacity cannot hold the whole frame (with the
 *         code, when @p authenticated) or @p length is above ZPLC_PROTO_PAYLOAD_MAX_HARD.
 *
 * The caller computes the code over the returned bytes and hands it to zplc_proto_finish().
 */
size_t zplc_proto_begin(uint8_t *out, size_t capacity, uint8_t kind, uint8_t message, uint32_t sequence, const uint8_t *payload,
                        uint16_t length, int authenticated);

/**
 * @brief Append the code (when the frame was begun authenticated) and the checksum.
 *
 * @param used  bytes zplc_proto_begin() returned
 * @param mac   ZPLC_PROTO_MAC_BYTES bytes for an authenticated frame, NULL otherwise
 * @return the size of the whole frame
 */
size_t zplc_proto_finish(uint8_t *out, size_t used, const uint8_t *mac);

/** @brief A frame without a code in one call; returns its size, or 0 when it does not fit. */
size_t zplc_proto_encode(uint8_t *out, size_t capacity, uint8_t kind, uint8_t message, uint32_t sequence, const uint8_t *payload,
                         uint16_t length);

/**
 * @brief Check and open one whole frame (a transport that frames its own lines).
 *
 * @return 0 and @p frame filled, or a ZPLC_PROTO_PARSE_* code
 */
int zplc_proto_parse(const uint8_t *data, size_t length, size_t payload_max, zplc_proto_frame_t *frame);

/** @brief Start a decoder. @p payload_max is the limit of this link (at most ZPLC_PROTO_PAYLOAD_MAX). */
void zplc_proto_decoder_init(zplc_proto_decoder_t *decoder, size_t payload_max);

/** @brief Forget the bytes of a frame that is being assembled (a link that was reopened). Counters stay. */
void zplc_proto_decoder_reset(zplc_proto_decoder_t *decoder);

/**
 * @brief Take bytes from the stream.
 *
 * Discards noise, assembles candidates and calls @p on_frame for each frame whose header and checksum are valid,
 * in order. A candidate that is not valid costs its first byte and the decoder looks for the next sync pair
 * among the bytes it holds, so a frame inside a damaged one is delivered and a damaged frame costs nothing
 * after itself. The work per input byte is bounded by ZPLC_PROTO_FRAME_MAX.
 */
void zplc_proto_decoder_feed(zplc_proto_decoder_t *decoder, const uint8_t *data, size_t length, zplc_proto_frame_fn on_frame,
                             void *context);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_PROTO_H */
