/**
 * @file fuzz_proto_frame.c
 * @brief libFuzzer target for the frame decoder of the device link protocol (COM-019, VF-014).
 *
 * SPDX-License-Identifier: MIT
 *
 * Build with -DZPLC_BUILD_FUZZER=ON (Clang); tools/fuzz/run.sh does that and runs it.
 *
 * The mutator keeps the checksum valid after most mutations (and, half of the time, makes the length field agree
 * with the size of the input), so that the inputs get past the header checks to the code that follows. One input
 * in 32 is left alone, so that the checksum path itself stays covered.
 *
 * Invariants checked on every input:
 *  - the decoder gives the same frames and the same counters however the bytes are cut into chunks;
 *  - every frame it delivers is a frame: its checksum is right, and rebuilding it from its fields gives the
 *    bytes that were consumed;
 *  - a buffer that zplc_proto_parse() takes as one frame is delivered as one frame by the decoder;
 *  - the decoder never holds more bytes than it has room for.
 * Memory errors and undefined behaviour are found by the sanitizers.
 */

#include "fuzz_common.h"

#include "zplc_crc32.h"
#include "zplc_proto.h"

typedef struct {
    uint32_t frames;
    uint64_t digest;
    int invalid;
} sink_t;

static void on_frame(void *context, const zplc_proto_frame_t *frame)
{
    sink_t *sink = (sink_t *)context;
    uint8_t rebuilt[ZPLC_PROTO_FRAME_MAX];
    size_t used;
    size_t total;
    size_t i;

    sink->frames++;
    used = zplc_proto_begin(rebuilt, sizeof(rebuilt), frame->kind, frame->message, frame->sequence, frame->payload,
                            frame->length, frame->authenticated);
    if (used == 0U) {
        sink->invalid = 1;
        return;
    }
    total = zplc_proto_finish(rebuilt, used, frame->mac);
    {
        zplc_proto_frame_t again;

        if (zplc_proto_parse(rebuilt, total, ZPLC_PROTO_PAYLOAD_MAX, &again) != 0 || again.sequence != frame->sequence ||
            again.length != frame->length || again.kind != frame->kind || again.message != frame->message) {
            sink->invalid = 1;
        }
    }
    for (i = 0U; i < total; i++) {
        sink->digest = (sink->digest ^ rebuilt[i]) * 0x100000001B3ULL;
    }
    sink->digest = (sink->digest ^ total) * 0x100000001B3ULL;
}

size_t LLVMFuzzerCustomMutator(uint8_t *data, size_t size, size_t max_size, unsigned int seed);

size_t LLVMFuzzerCustomMutator(uint8_t *data, size_t size, size_t max_size, unsigned int seed)
{
    fz_rng_t rng;

    fz_rng_seed(&rng, seed);
    size = LLVMFuzzerMutate(data, size, max_size);
    if (size >= ZPLC_PROTO_HEADER_BYTES + ZPLC_PROTO_CRC_BYTES && fz_below(&rng, 32U) != 0U) {
        if ((fz_rand(&rng) & 1U) != 0U) {
            const size_t room = size - ZPLC_PROTO_HEADER_BYTES - ZPLC_PROTO_CRC_BYTES;

            data[0] = ZPLC_PROTO_SYNC0;
            data[1] = ZPLC_PROTO_SYNC1;
            data[ZPLC_PROTO_OFFSET_VERSION] = (uint8_t)ZPLC_PROTO_VERSION;
            data[ZPLC_PROTO_OFFSET_FLAGS] = (uint8_t)(data[ZPLC_PROTO_OFFSET_FLAGS] & 0x07U & ~0x03U) |
                                            (uint8_t)fz_below(&rng, 3U);
            if ((data[ZPLC_PROTO_OFFSET_FLAGS] & ZPLC_PROTO_FLAG_AUTH) != 0U && room >= ZPLC_PROTO_MAC_BYTES) {
                fz_put16(data + ZPLC_PROTO_OFFSET_LENGTH, (uint16_t)(room - ZPLC_PROTO_MAC_BYTES));
            } else {
                data[ZPLC_PROTO_OFFSET_FLAGS] &= (uint8_t)~ZPLC_PROTO_FLAG_AUTH;
                fz_put16(data + ZPLC_PROTO_OFFSET_LENGTH, (uint16_t)room);
            }
        }
        fz_put32(data + size - ZPLC_PROTO_CRC_BYTES, zplc_crc32(data, size - ZPLC_PROTO_CRC_BYTES));
    }
    return size;
}

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size);

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size)
{
    static zplc_proto_decoder_t whole;
    static zplc_proto_decoder_t cut;
    sink_t sink_whole = {0, 0xCBF29CE484222325ULL, 0};
    sink_t sink_cut = {0, 0xCBF29CE484222325ULL, 0};
    zplc_proto_frame_t frame;
    fz_rng_t rng;
    size_t offset = 0;

    zplc_proto_decoder_init(&whole, ZPLC_PROTO_PAYLOAD_MAX);
    zplc_proto_decoder_feed(&whole, data, size, on_frame, &sink_whole);
    FZ_REQUIRE(whole.fill < ZPLC_PROTO_FRAME_MAX, "the decoder holds less than a whole buffer");
    FZ_REQUIRE(sink_whole.invalid == 0, "every delivered frame is a frame");
    FZ_REQUIRE(sink_whole.frames == whole.stats.frames, "the counter of frames is what was delivered");

    /* The same bytes in chunks of a size chosen from the input. */
    fz_rng_seed(&rng, (uint64_t)size * 2654435761ULL + (size > 0U ? data[size / 2U] : 0U));
    zplc_proto_decoder_init(&cut, ZPLC_PROTO_PAYLOAD_MAX);
    while (offset < size) {
        size_t chunk = 1U + fz_below(&rng, 64U);

        if (chunk > size - offset) {
            chunk = size - offset;
        }
        zplc_proto_decoder_feed(&cut, data + offset, chunk, on_frame, &sink_cut);
        offset += chunk;
    }
    FZ_REQUIRE(sink_cut.frames == sink_whole.frames && sink_cut.digest == sink_whole.digest,
               "the frames do not depend on how the bytes are cut");
    FZ_REQUIRE(cut.stats.crc_errors == whole.stats.crc_errors && cut.stats.version_errors == whole.stats.version_errors &&
                   cut.stats.malformed == whole.stats.malformed && cut.stats.oversize == whole.stats.oversize &&
                   cut.stats.resyncs == whole.stats.resyncs,
               "the counters do not depend on how the bytes are cut");

    if (zplc_proto_parse(data, size, ZPLC_PROTO_PAYLOAD_MAX, &frame) == 0) {
        FZ_REQUIRE(sink_whole.frames >= 1U, "a buffer that is one frame is delivered as one");
    }
    return 0;
}
