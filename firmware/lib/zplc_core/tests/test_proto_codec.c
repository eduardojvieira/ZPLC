/**
 * @file test_proto_codec.c
 * @brief The codec of the device link protocol against the generated frames (COM-019).
 *
 * SPDX-License-Identifier: MIT
 *
 * zplc_proto_vectors.h is written by tools/contract/generate_protocol.py from tools/contract/protocol.json, with
 * its own encoder and decoder. This test holds the C codec to those bytes and to those results; the TypeScript
 * codec of Studio runs the same frames (tools/contract/protocol.test.ts). Every stream is also fed one byte at a
 * time: where the bytes are cut must not change what comes out.
 */

#include <stdio.h>
#include <string.h>

#include <zplc_crc32.h>
#include <zplc_proto.h>

#include "zplc_proto_vectors.h"

static int test_count = 0;
static int fail_count = 0;

#define CHECK(cond, msg)                                      \
  do {                                                        \
    test_count++;                                             \
    if (!(cond)) {                                            \
      fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__); \
      fail_count++;                                           \
    }                                                         \
  } while (0)

/* What a decoder delivered, as the names of the vector frames, to compare with the expected list. */
typedef struct {
  char names[512];
  unsigned count;
} delivered_t;

static void on_frame(void *context, const zplc_proto_frame_t *frame) {
  delivered_t *delivered = (delivered_t *)context;
  size_t i;

  delivered->count++;
  for (i = 0U; i < ZPLC_PROTO_VECTOR_FRAME_COUNT; i++) {
    const zplc_proto_vector_frame_t *vf = &zplc_proto_vector_frames[i];

    if (vf->kind == frame->kind && vf->message == frame->message && vf->sequence == frame->sequence && vf->auth == frame->authenticated &&
        vf->payload_len == frame->length && memcmp(vf->payload, frame->payload, frame->length) == 0) {
      if (delivered->names[0] != '\0') {
        (void)strncat(delivered->names, " ", sizeof(delivered->names) - strlen(delivered->names) - 1U);
      }
      (void)strncat(delivered->names, vf->name, sizeof(delivered->names) - strlen(delivered->names) - 1U);
      return;
    }
  }
  /* A frame no vector names (built for one stream): the expected list says "stream:<name>". */
  if (delivered->names[0] != '\0') {
    (void)strncat(delivered->names, " ", sizeof(delivered->names) - strlen(delivered->names) - 1U);
  }
  (void)strncat(delivered->names, "stream:?", sizeof(delivered->names) - strlen(delivered->names) - 1U);
}

/* ---- COM-019: every frame of the definition is encoded to the bytes the generator computed ---- */
static void test_every_frame_is_encoded_to_the_generated_bytes(void) {
  size_t i;

  for (i = 0U; i < ZPLC_PROTO_VECTOR_FRAME_COUNT; i++) {
    const zplc_proto_vector_frame_t *vf = &zplc_proto_vector_frames[i];
    uint8_t out[ZPLC_PROTO_FRAME_MAX];
    zplc_proto_frame_t frame;
    size_t used;
    size_t total;

    CHECK(zplc_proto_parse(vf->wire, vf->wire_len, ZPLC_PROTO_VECTOR_PAYLOAD_MAX, &frame) == 0, vf->name);
    CHECK(frame.kind == vf->kind && frame.message == vf->message && frame.sequence == vf->sequence && frame.authenticated == vf->auth &&
              frame.length == vf->payload_len && memcmp(frame.payload, vf->payload, vf->payload_len) == 0,
          "a parsed frame has the fields of the vector");
    used = zplc_proto_begin(out, sizeof(out), vf->kind, vf->message, vf->sequence, vf->payload, (uint16_t)vf->payload_len, vf->auth);
    CHECK(used == (size_t)ZPLC_PROTO_HEADER_BYTES + vf->payload_len, "the header and the payload are written");
    total = zplc_proto_finish(out, used, frame.mac);
    CHECK(total == vf->wire_len && memcmp(out, vf->wire, total) == 0, "the encoder writes the bytes of the generated frame");
    if (vf->auth == 0U) {
      total = zplc_proto_encode(out, sizeof(out), vf->kind, vf->message, vf->sequence, vf->payload, (uint16_t)vf->payload_len);
      CHECK(total == vf->wire_len && memcmp(out, vf->wire, total) == 0, "zplc_proto_encode agrees");
    }
  }
}

/* ---- COM-019: a stream gives the generated frames and counters, whole and one byte at a time ---- */
static void test_streams_give_the_generated_result(void) {
  size_t i;

  for (i = 0U; i < ZPLC_PROTO_VECTOR_STREAM_COUNT; i++) {
    const zplc_proto_vector_stream_t *vs = &zplc_proto_vector_streams[i];
    zplc_proto_decoder_t decoder;
    delivered_t delivered;
    size_t cut;

    /* the whole stream at once */
    memset(&delivered, 0, sizeof(delivered));
    zplc_proto_decoder_init(&decoder, ZPLC_PROTO_VECTOR_PAYLOAD_MAX);
    zplc_proto_decoder_feed(&decoder, vs->bytes, vs->length, on_frame, &delivered);
    if (strncmp(vs->delivered, "stream:", 7) != 0) {
      CHECK(strcmp(delivered.names, vs->delivered) == 0, vs->name);
    }
    CHECK(decoder.stats.crc_errors == vs->crc_errors && decoder.stats.version_errors == vs->version_errors &&
              decoder.stats.malformed == vs->malformed && decoder.stats.oversize == vs->oversize && decoder.stats.resyncs == vs->resyncs,
          "the counters of the stream are the generated ones");

    /* one byte at a time */
    memset(&delivered, 0, sizeof(delivered));
    zplc_proto_decoder_init(&decoder, ZPLC_PROTO_VECTOR_PAYLOAD_MAX);
    for (cut = 0U; cut < vs->length; cut++) {
      zplc_proto_decoder_feed(&decoder, vs->bytes + cut, 1U, on_frame, &delivered);
    }
    CHECK(strcmp(delivered.names, vs->delivered) == 0 || strncmp(vs->delivered, "stream:", 7) == 0,
          "one byte at a time gives the same frames");
    CHECK(decoder.stats.crc_errors == vs->crc_errors && decoder.stats.resyncs == vs->resyncs, "and the same counters");
  }
}

static void test_parse_names_why_a_buffer_is_not_a_frame(void) {
  const zplc_proto_vector_frame_t *vf = &zplc_proto_vector_frames[0];
  uint8_t copy[ZPLC_PROTO_FRAME_MAX + 8U];
  zplc_proto_frame_t frame;

  memcpy(copy, vf->wire, vf->wire_len);
  CHECK(zplc_proto_parse(copy, vf->wire_len - 1U, ZPLC_PROTO_PAYLOAD_MAX, &frame) == ZPLC_PROTO_PARSE_SHORT, "a truncated frame is short");
  CHECK(zplc_proto_parse(copy, 3U, ZPLC_PROTO_PAYLOAD_MAX, &frame) == ZPLC_PROTO_PARSE_SHORT, "so is the start of one");
  copy[vf->wire_len] = 0U;
  CHECK(zplc_proto_parse(copy, vf->wire_len + 1U, ZPLC_PROTO_PAYLOAD_MAX, &frame) == ZPLC_PROTO_PARSE_LENGTH,
        "a byte more than the frame is refused");
  copy[0] ^= 0xFFU;
  CHECK(zplc_proto_parse(copy, vf->wire_len, ZPLC_PROTO_PAYLOAD_MAX, &frame) == ZPLC_PROTO_PARSE_SYNC, "bad sync");
  copy[0] ^= 0xFFU;
  copy[ZPLC_PROTO_OFFSET_VERSION] = 2U;
  CHECK(zplc_proto_parse(copy, vf->wire_len, ZPLC_PROTO_PAYLOAD_MAX, &frame) == ZPLC_PROTO_PARSE_VERSION, "another version");
  copy[ZPLC_PROTO_OFFSET_VERSION] = (uint8_t)ZPLC_PROTO_VERSION;
  copy[ZPLC_PROTO_OFFSET_FLAGS] |= 0x08U;
  CHECK(zplc_proto_parse(copy, vf->wire_len, ZPLC_PROTO_PAYLOAD_MAX, &frame) == ZPLC_PROTO_PARSE_MALFORMED, "a reserved flag bit");
  copy[ZPLC_PROTO_OFFSET_FLAGS] = 0x03U;
  CHECK(zplc_proto_parse(copy, vf->wire_len, ZPLC_PROTO_PAYLOAD_MAX, &frame) == ZPLC_PROTO_PARSE_MALFORMED, "kind 3");
  memcpy(copy, vf->wire, vf->wire_len);
  CHECK(zplc_proto_parse(copy, vf->wire_len, 2U, &frame) == ZPLC_PROTO_PARSE_OVERSIZE, "a payload above the limit of the link");
  copy[vf->wire_len - 1U] ^= 0x01U;
  CHECK(zplc_proto_parse(copy, vf->wire_len, ZPLC_PROTO_PAYLOAD_MAX, &frame) == ZPLC_PROTO_PARSE_CRC, "a flipped bit of the checksum");
  memcpy(copy, vf->wire, vf->wire_len);
  copy[ZPLC_PROTO_HEADER_BYTES] ^= 0x01U;
  CHECK(zplc_proto_parse(copy, vf->wire_len, ZPLC_PROTO_PAYLOAD_MAX, &frame) == ZPLC_PROTO_PARSE_CRC, "a flipped bit of the payload");
}

static void test_the_encoder_refuses_what_does_not_fit(void) {
  uint8_t out[ZPLC_PROTO_HEADER_BYTES + 4U];
  const uint8_t payload[8] = {1, 2, 3, 4, 5, 6, 7, 8};

  CHECK(zplc_proto_encode(out, sizeof(out), ZPLC_PROTO_KIND_REQUEST, 1U, 1U, payload, 8U) == 0U, "a buffer too small for the frame");
  CHECK(zplc_proto_begin(out, sizeof(out), ZPLC_PROTO_KIND_REQUEST, 1U, 1U, payload, 0U, 1) == 0U, "a buffer too small for the code");
  CHECK(zplc_proto_encode(out, sizeof(out), ZPLC_PROTO_KIND_REQUEST, 1U, 1U, payload, 0U) == zplc_proto_frame_size(0U, 0),
        "an empty payload fits");
}

/* ---- COM-019: the decoder is bounded under hostile input ---- */
static void test_the_decoder_is_bounded_under_hostile_input(void) {
  zplc_proto_decoder_t decoder;
  delivered_t delivered;
  uint8_t chunk[256];
  uint32_t state = 0x12345678U;
  unsigned round;
  size_t i;

  /* Pseudo-random bytes, many of them sync pairs and headers with large lengths: nothing is delivered by chance
   * (the checksum), nothing overflows (the sanitizers), and the decoder is still usable afterwards. */
  memset(&delivered, 0, sizeof(delivered));
  zplc_proto_decoder_init(&decoder, ZPLC_PROTO_PAYLOAD_MAX);
  for (round = 0U; round < 400U; round++) {
    for (i = 0U; i < sizeof(chunk); i++) {
      state = state * 1664525U + 1013904223U;
      chunk[i] = (uint8_t)(state >> 24);
      if ((state & 0x30U) == 0U) {
        chunk[i] = ZPLC_PROTO_SYNC0;
      } else if ((state & 0x30U) == 0x10U) {
        chunk[i] = ZPLC_PROTO_SYNC1;
      }
    }
    zplc_proto_decoder_feed(&decoder, chunk, sizeof(chunk), on_frame, &delivered);
  }
  CHECK(delivered.count == 0U, "random bytes are not frames");
  CHECK(decoder.fill < ZPLC_PROTO_FRAME_MAX, "the buffer of the decoder never overruns");
  zplc_proto_decoder_reset(&decoder);
  zplc_proto_decoder_feed(&decoder, zplc_proto_vector_frames[0].wire, zplc_proto_vector_frames[0].wire_len, on_frame, &delivered);
  CHECK(delivered.count == 1U, "a frame is found after the garbage");
}

int main(void) {
  test_every_frame_is_encoded_to_the_generated_bytes();
  test_streams_give_the_generated_result();
  test_parse_names_why_a_buffer_is_not_a_frame();
  test_the_encoder_refuses_what_does_not_fit();
  test_the_decoder_is_bounded_under_hostile_input();
  printf("%d checks, %d failed\n", test_count, fail_count);
  return fail_count == 0 ? 0 : 1;
}
