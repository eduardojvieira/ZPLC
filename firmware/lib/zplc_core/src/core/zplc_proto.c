/**
 * @file zplc_proto.c
 * @brief The codec of the device link protocol (COM-019). See zplc_proto.h.
 *
 * SPDX-License-Identifier: MIT
 */

#include "zplc_proto.h"

#include <string.h>

#include "zplc_bytes.h"
#include "zplc_crc32.h"

/*
 * What the first bytes of a buffer are. Returns 0 when more bytes are needed, a positive number (the size of the
 * whole frame) when the header is valid, or a ZPLC_PROTO_PARSE_* code when the candidate is not a frame.
 * `available` counts the bytes of the buffer; the sync pair is looked at as soon as its bytes are there.
 */
static int header_check(const uint8_t *buf, size_t available, size_t payload_max, size_t *total) {
  uint8_t flags;
  size_t length;

  if (available >= 1U && buf[ZPLC_PROTO_OFFSET_SYNC] != ZPLC_PROTO_SYNC0) {
    return ZPLC_PROTO_PARSE_SYNC;
  }
  if (available >= 2U && buf[ZPLC_PROTO_OFFSET_SYNC + 1U] != ZPLC_PROTO_SYNC1) {
    return ZPLC_PROTO_PARSE_SYNC;
  }
  if (available < ZPLC_PROTO_HEADER_BYTES) {
    return 0;
  }
  if (buf[ZPLC_PROTO_OFFSET_VERSION] != ZPLC_PROTO_VERSION) {
    return ZPLC_PROTO_PARSE_VERSION;
  }
  flags = buf[ZPLC_PROTO_OFFSET_FLAGS];
  if ((flags & ZPLC_PROTO_FLAGS_RESERVED) != 0U || (flags & ZPLC_PROTO_KIND_MASK) == ZPLC_PROTO_KIND_MASK) {
    return ZPLC_PROTO_PARSE_MALFORMED;
  }
  length = zplc_get_u16_le(buf + ZPLC_PROTO_OFFSET_LENGTH);
  if (length > payload_max) {
    return ZPLC_PROTO_PARSE_OVERSIZE;
  }
  *total = zplc_proto_frame_size(length, (flags & ZPLC_PROTO_FLAG_AUTH) != 0U);
  return (int)*total;
}

static int checksum_ok(const uint8_t *buf, size_t total) {
  return zplc_crc32(buf, total - ZPLC_PROTO_CRC_BYTES) == zplc_get_u32_le(buf + total - ZPLC_PROTO_CRC_BYTES);
}

static void open_frame(const uint8_t *buf, size_t total, zplc_proto_frame_t *frame) {
  const uint8_t flags = buf[ZPLC_PROTO_OFFSET_FLAGS];
  const uint16_t length = zplc_get_u16_le(buf + ZPLC_PROTO_OFFSET_LENGTH);

  frame->kind = (uint8_t)(flags & ZPLC_PROTO_KIND_MASK);
  frame->message = buf[ZPLC_PROTO_OFFSET_MESSAGE];
  frame->authenticated = (uint8_t)((flags & ZPLC_PROTO_FLAG_AUTH) != 0U);
  frame->sequence = zplc_get_u32_le(buf + ZPLC_PROTO_OFFSET_SEQUENCE);
  frame->length = length;
  frame->payload = buf + ZPLC_PROTO_HEADER_BYTES;
  frame->covered = buf;
  frame->covered_length = (size_t)ZPLC_PROTO_HEADER_BYTES + length;
  frame->mac = frame->authenticated != 0U ? buf + frame->covered_length : NULL;
  (void)total;
}

size_t zplc_proto_write_header(uint8_t *out, uint8_t kind, uint8_t message, uint32_t sequence, uint16_t length, int authenticated) {
  out[ZPLC_PROTO_OFFSET_SYNC] = ZPLC_PROTO_SYNC0;
  out[ZPLC_PROTO_OFFSET_SYNC + 1U] = ZPLC_PROTO_SYNC1;
  out[ZPLC_PROTO_OFFSET_VERSION] = (uint8_t)ZPLC_PROTO_VERSION;
  out[ZPLC_PROTO_OFFSET_FLAGS] = (uint8_t)((kind & ZPLC_PROTO_KIND_MASK) | (authenticated != 0 ? ZPLC_PROTO_FLAG_AUTH : 0U));
  out[ZPLC_PROTO_OFFSET_MESSAGE] = message;
  zplc_put_u32_le(out + ZPLC_PROTO_OFFSET_SEQUENCE, sequence);
  zplc_put_u16_le(out + ZPLC_PROTO_OFFSET_LENGTH, length);
  return ZPLC_PROTO_HEADER_BYTES;
}

size_t zplc_proto_begin(uint8_t *out, size_t capacity, uint8_t kind, uint8_t message, uint32_t sequence, const uint8_t *payload,
                        uint16_t length, int authenticated) {
  if (out == NULL || length > ZPLC_PROTO_PAYLOAD_MAX_HARD || (length != 0U && payload == NULL) ||
      capacity < zplc_proto_frame_size(length, authenticated)) {
    return 0U;
  }
  (void)zplc_proto_write_header(out, kind, message, sequence, length, authenticated);
  if (length != 0U) {
    (void)memcpy(out + ZPLC_PROTO_HEADER_BYTES, payload, length);
  }
  return (size_t)ZPLC_PROTO_HEADER_BYTES + length;
}

size_t zplc_proto_finish(uint8_t *out, size_t used, const uint8_t *mac) {
  size_t end = used;

  if ((out[ZPLC_PROTO_OFFSET_FLAGS] & ZPLC_PROTO_FLAG_AUTH) != 0U) {
    if (mac != NULL) {
      (void)memcpy(out + end, mac, ZPLC_PROTO_MAC_BYTES);
    } else {
      (void)memset(out + end, 0, ZPLC_PROTO_MAC_BYTES);
    }
    end += ZPLC_PROTO_MAC_BYTES;
  }
  zplc_put_u32_le(out + end, zplc_crc32(out, end));
  return end + ZPLC_PROTO_CRC_BYTES;
}

size_t zplc_proto_encode(uint8_t *out, size_t capacity, uint8_t kind, uint8_t message, uint32_t sequence, const uint8_t *payload,
                         uint16_t length) {
  const size_t used = zplc_proto_begin(out, capacity, kind, message, sequence, payload, length, 0);

  return used == 0U ? 0U : zplc_proto_finish(out, used, NULL);
}

int zplc_proto_parse(const uint8_t *data, size_t length, size_t payload_max, zplc_proto_frame_t *frame) {
  size_t total = 0U;
  int checked;

  if (data == NULL || frame == NULL) {
    return ZPLC_PROTO_PARSE_SHORT;
  }
  checked = header_check(data, length, payload_max, &total);
  if (checked < 0) {
    return checked;
  }
  if (checked == 0 || length < total) {
    return ZPLC_PROTO_PARSE_SHORT;
  }
  if (length > total) {
    return ZPLC_PROTO_PARSE_LENGTH;
  }
  if (!checksum_ok(data, total)) {
    return ZPLC_PROTO_PARSE_CRC;
  }
  open_frame(data, total, frame);
  return 0;
}

void zplc_proto_decoder_init(zplc_proto_decoder_t *decoder, size_t payload_max) {
  (void)memset(decoder, 0, sizeof(*decoder));
  decoder->payload_max = payload_max > ZPLC_PROTO_PAYLOAD_MAX ? ZPLC_PROTO_PAYLOAD_MAX : payload_max;
}

void zplc_proto_decoder_reset(zplc_proto_decoder_t *decoder) { decoder->fill = 0U; }

static void discard_first(zplc_proto_decoder_t *decoder) {
  decoder->fill -= 1U;
  if (decoder->fill != 0U) {
    (void)memmove(decoder->buf, decoder->buf + 1U, decoder->fill);
  }
}

static void abandon_candidate(zplc_proto_decoder_t *decoder, int reason) {
  switch (reason) {
  case ZPLC_PROTO_PARSE_VERSION:
    decoder->stats.version_errors++;
    break;
  case ZPLC_PROTO_PARSE_MALFORMED:
    decoder->stats.malformed++;
    break;
  case ZPLC_PROTO_PARSE_OVERSIZE:
    decoder->stats.oversize++;
    break;
  default:
    decoder->stats.crc_errors++;
    break;
  }
  decoder->stats.resyncs++;
  discard_first(decoder);
}

void zplc_proto_decoder_feed(zplc_proto_decoder_t *decoder, const uint8_t *data, size_t length, zplc_proto_frame_fn on_frame,
                             void *context) {
  size_t index;

  for (index = 0U; index < length; index++) {
    decoder->buf[decoder->fill] = data[index];
    decoder->fill += 1U;
    for (;;) {
      size_t total = 0U;
      int checked;

      if (decoder->fill == 0U) {
        break;
      }
      checked = header_check(decoder->buf, decoder->fill, decoder->payload_max, &total);
      if (checked == ZPLC_PROTO_PARSE_SYNC) {
        discard_first(decoder); /* noise: not a candidate, not counted */
        continue;
      }
      if (checked < 0) {
        abandon_candidate(decoder, checked);
        continue;
      }
      if (checked == 0 || decoder->fill < total) {
        break;
      }
      if (!checksum_ok(decoder->buf, total)) {
        abandon_candidate(decoder, ZPLC_PROTO_PARSE_CRC);
        continue;
      }
      {
        zplc_proto_frame_t frame;

        open_frame(decoder->buf, total, &frame);
        decoder->stats.frames++;
        if (on_frame != NULL) {
          on_frame(context, &frame);
        }
      }
      decoder->fill -= total;
      if (decoder->fill != 0U) {
        (void)memmove(decoder->buf, decoder->buf + total, decoder->fill);
      }
    }
  }
}
