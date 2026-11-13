/**
 * @file test_plant.c
 * @brief Plant I/O mode, the module: entry, frame validation, latch, staleness bound, exit (LNK-006, LNK-011,
 *        LNK-015, LNK-018).
 *
 * SPDX-License-Identifier: MIT
 *
 * Everything goes through the public API of zplc_plant.h and the memory API of the core, with a fake clock and a
 * lock hook that can fail. The payloads are those of tools/contract/plant_vectors.json.
 */

#include <stdio.h>
#include <string.h>

#include <zplc_core.h>
#include <zplc_exchange.h>
#include <zplc_isa.h>
#include <zplc_plant.h>
#include <zplc_proto_defs.h>

static int test_count = 0;
static int fail_count = 0;

#define CHECK(cond, msg)                                      \
  do {                                                        \
    test_count++;                                             \
    if (!(cond)) {                                            \
      fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__); \
      fail_count++;                                           \
    } else {                                                  \
      printf("PASS: %s\n", msg);                              \
    }                                                         \
  } while (0)

#define ERR_BAD ((int)ZPLC_PROTO_ERR_BAD_REQUEST)
#define ERR_RANGE ((int)ZPLC_PROTO_ERR_RANGE)
#define ERR_STATE ((int)ZPLC_PROTO_ERR_STATE)

/* tools/contract/plant_vectors.json (payloads, after the status byte for the response) */
#define V_ENTER "f401050200000000000401001c02000104000200000000000c"
#define V_ENTER_RSP "01000700010020f401"
#define V_FRAME "01000201000005feff0000c03f"

static uint32_t clock_ms;
static int lock_fails;
static int lock_calls;
static int unlock_calls;

static int hook_lock(void *ctx) {
  (void)ctx;
  lock_calls++;
  return lock_fails ? -1 : 0;
}
static void hook_unlock(void *ctx) {
  (void)ctx;
  unlock_calls++;
}
static uint32_t hook_now(void *ctx) {
  (void)ctx;
  return clock_ms;
}

static uint8_t *ipi(void) { return zplc_mem_get_region(ZPLC_MEM_IPI_BASE); }
static uint8_t *opi(void) { return zplc_mem_get_region(ZPLC_MEM_OPI_BASE); }

static size_t hex(const char *s, uint8_t *out) {
  size_t n = 0U;
  while (s[0] != '\0') {
    unsigned v = 0U;
    (void)sscanf(s, "%2x", &v);
    out[n++] = (uint8_t)v;
    s += 2;
  }
  return n;
}

/** Fresh memory, exchange and module; the clock at 1000 ms. */
static void start(void) {
  zplc_plant_hooks_t h;
  zplc_exchange_hooks_t eh;

  zplc_core_cold_start();
  memset(&eh, 0, sizeof(eh));
  (void)zplc_exchange_init(&eh);
  memset(&h, 0, sizeof(h));
  h.lock = hook_lock;
  h.unlock = hook_unlock;
  h.now_ms = hook_now;
  clock_ms = 1000U;
  lock_fails = 0;
  lock_calls = 0;
  unlock_calls = 0;
  zplc_plant_init(&h);
}

static int enter_timeout(uint16_t timeout_ms, uint8_t *rsp, uint16_t *rl) {
  uint8_t req[64];
  size_t n = hex(V_ENTER, req);

  req[0] = (uint8_t)timeout_ms;
  req[1] = (uint8_t)(timeout_ms >> 8);
  return zplc_plant_enter(req, (uint16_t)n, rsp, rl);
}

static int enter_vector(void) {
  uint8_t rsp[32];
  uint16_t rl = 0U;
  return enter_timeout(500U, rsp, &rl);
}

/** A frame as the vector, with the plant id, sequence, bitmap and REAL patched and the length changed. */
static int send_frame(uint16_t id, uint32_t seq, uint8_t bitmap, uint32_t real, int len_delta) {
  uint8_t req[64];
  uint8_t rsp[64];
  uint16_t rl = 0U;
  size_t n = hex(V_FRAME, req);

  req[0] = (uint8_t)id;
  req[1] = (uint8_t)(id >> 8);
  for (int i = 0; i < 4; i++) {
    req[2 + i] = (uint8_t)(seq >> (8 * i));
    req[9 + i] = (uint8_t)(real >> (8 * i));
  }
  req[6] = bitmap;
  return zplc_plant_frame(req, (uint16_t)((int)n + len_delta), rsp, &rl);
}

/** The vector frame (BOOLs 1, 0, 1; INT -2; REAL 1.5) with a sequence. */
static int good(uint32_t seq) { return send_frame(1U, seq, 0x05U, 0x3FC00000U, 0); }

static uint16_t late_of(void) {
  zplc_plant_stats_t s;
  zplc_plant_get_stats(&s);
  return s.late;
}
static uint16_t rejected_of(void) {
  zplc_plant_stats_t s;
  zplc_plant_get_stats(&s);
  return s.rejected;
}

/** An entry with descriptors {offset, spec}: n_in inputs then n_out outputs. */
static int enter_with(uint8_t n_in, uint8_t n_out, const uint16_t *offs, const uint8_t *specs) {
  uint8_t req[4 + 3 * 80];
  uint8_t rsp[32];
  uint16_t rl = 0U;
  uint16_t n = (uint16_t)(n_in + n_out);

  req[0] = 0xF4U;
  req[1] = 0x01U;
  req[2] = n_in;
  req[3] = n_out;
  for (uint16_t i = 0U; i < n; i++) {
    req[4 + 3 * i] = (uint8_t)offs[i];
    req[5 + 3 * i] = (uint8_t)(offs[i] >> 8);
    req[6 + 3 * i] = specs[i];
  }
  return zplc_plant_enter(req, (uint16_t)(4U + 3U * n), rsp, &rl);
}

#define T_BOOL(bit) ((uint8_t)((bit) << 2))
#define T_INT 0x01U
#define T_REAL 0x02U

static void plant_enter_accepts_the_vector(void) {
  uint8_t req[64], rsp[32], want[16];
  uint16_t rl = 0U;
  size_t n = hex(V_ENTER, req);
  size_t w = hex(V_ENTER_RSP, want);

  printf("\n=== plant_enter_accepts_the_vector ===\n");
  start();
  CHECK(zplc_plant_enter(req, (uint16_t)n, rsp, &rl) == 0, "the vector entry is accepted");
  CHECK(rl == w && memcmp(rsp, want, w) == 0, "and answers the vector bytes (id 1, 7 in, 1 out, 32 slots, 500 ms)");
  CHECK(zplc_plant_active() == 1, "the mode is active");
  CHECK(zplc_plant_holds_outputs() == 1, "outputs are held: mirror is off at entry");
}

static void plant_enter_rejects_too_many_slots(void) {
  uint16_t offs[80];
  uint8_t specs[80];
  uint8_t req[8], rsp[16];
  uint16_t rl = 0U;

  printf("\n=== plant_enter_rejects_too_many_slots ===\n");
  for (unsigned i = 0U; i < 80U; i++) {
    offs[i] = (uint16_t)(i * 4U);
    specs[i] = T_INT;
  }
  start();
  CHECK(enter_with((uint8_t)(ZPLC_PLANT_MAX_SLOTS + 1U), 0U, offs, specs) == ERR_BAD, "one input slot too many");
  CHECK(enter_with(0U, (uint8_t)(ZPLC_PLANT_MAX_SLOTS + 1U), offs, specs) == ERR_BAD, "one output slot too many");
  CHECK(zplc_plant_active() == 0, "a refused entry leaves the mode inactive");
  CHECK(enter_with((uint8_t)ZPLC_PLANT_MAX_SLOTS, (uint8_t)ZPLC_PLANT_MAX_SLOTS, offs, specs) == 0,
        "the maximum in each direction is accepted");
  start();
  req[0] = 0xF4U;
  req[1] = 0x01U;
  req[2] = 1U;
  req[3] = 0U;
  CHECK(zplc_plant_enter(req, 4U, rsp, &rl) == ERR_BAD, "a request shorter than its descriptors");
  CHECK(zplc_plant_enter(req, 3U, rsp, &rl) == ERR_BAD, "a request shorter than its fixed part");
  CHECK(zplc_plant_active() == 0, "still inactive");
}

static void plant_enter_rejects_input_in_system_registers(void) {
  uint16_t offs[1];
  uint8_t specs[1];

  printf("\n=== plant_enter_rejects_input_in_system_registers ===\n");
  start();
  offs[0] = 0x0FF0U;
  specs[0] = T_BOOL(0);
  CHECK(enter_with(1U, 0U, offs, specs) == ERR_RANGE, "a BOOL input in the system register area");
  offs[0] = 0x0FEFU;
  specs[0] = T_INT;
  CHECK(enter_with(1U, 0U, offs, specs) == ERR_RANGE, "an INT input that reaches into it");
  offs[0] = 0x1000U;
  specs[0] = T_BOOL(0);
  CHECK(enter_with(1U, 0U, offs, specs) == ERR_RANGE, "an input outside IPI");
  CHECK(enter_with(0U, 1U, offs, specs) == ERR_RANGE, "an output outside OPI");
  offs[0] = 0x0FEEU;
  specs[0] = T_INT;
  CHECK(enter_with(1U, 0U, offs, specs) == 0, "an INT input that ends where the area begins is accepted");
  start();
  offs[0] = 0x0FF0U;
  specs[0] = T_BOOL(0);
  CHECK(enter_with(0U, 1U, offs, specs) == 0, "an output at that offset is accepted: the area is in IPI only");
}

static void plant_enter_rejects_overlapping_numeric_slots(void) {
  uint16_t offs[2];
  uint8_t specs[2];

  printf("\n=== plant_enter_rejects_overlapping_numeric_slots ===\n");
  start();
  offs[0] = 0U;
  offs[1] = 1U;
  specs[0] = T_INT;
  specs[1] = T_INT;
  CHECK(enter_with(2U, 0U, offs, specs) == ERR_RANGE, "two INT inputs sharing a byte");
  offs[1] = 3U;
  specs[0] = T_REAL;
  specs[1] = T_INT;
  CHECK(enter_with(2U, 0U, offs, specs) == ERR_RANGE, "a REAL input and an INT on its last byte");
  offs[1] = 0U;
  specs[0] = T_INT;
  specs[1] = T_BOOL(5);
  CHECK(enter_with(2U, 0U, offs, specs) == ERR_RANGE, "a BOOL in a byte a numeric slot owns");
  specs[0] = T_BOOL(2);
  specs[1] = T_BOOL(2);
  CHECK(enter_with(2U, 0U, offs, specs) == ERR_RANGE, "the same bit twice");
  specs[1] = T_BOOL(3);
  CHECK(enter_with(2U, 0U, offs, specs) == 0, "two bits of one byte are fine");
  start();
  offs[1] = 2U;
  specs[0] = T_INT;
  specs[1] = T_INT;
  CHECK(enter_with(0U, 2U, offs, specs) == 0, "adjacent numerics are fine");
  start();
  offs[1] = 1U;
  CHECK(enter_with(0U, 2U, offs, specs) == ERR_RANGE, "output slots overlap as well");
  offs[1] = 0U;
  CHECK(enter_with(1U, 1U, offs, specs) == 0, "an input and an output at one offset are different images");
}

static void plant_enter_rejects_reserved_bits(void) {
  uint16_t offs[1] = {0U};
  uint8_t specs[1];

  printf("\n=== plant_enter_rejects_reserved_bits ===\n");
  start();
  specs[0] = 0x20U;
  CHECK(enter_with(1U, 0U, offs, specs) == ERR_BAD, "bit 5 of the spec");
  specs[0] = 0x80U;
  CHECK(enter_with(1U, 0U, offs, specs) == ERR_BAD, "bit 7 of the spec");
  specs[0] = 0x03U;
  CHECK(enter_with(1U, 0U, offs, specs) == ERR_BAD, "an unknown type");
  specs[0] = (uint8_t)(T_INT | T_BOOL(1));
  CHECK(enter_with(1U, 0U, offs, specs) == ERR_BAD, "a bit index on a numeric slot");
  CHECK(zplc_plant_active() == 0, "nothing is active after the refusals");
  specs[0] = T_BOOL(7);
  CHECK(enter_with(1U, 0U, offs, specs) == 0, "bit index 7 of a BOOL is valid");
}

static void plant_enter_refused_when_active(void) {
  uint8_t req[64], rsp[32];
  uint16_t rl = 0U;
  size_t n = hex(V_ENTER, req);

  printf("\n=== plant_enter_refused_when_active ===\n");
  start();
  CHECK(enter_vector() == 0, "first entry");
  CHECK(zplc_plant_enter(req, (uint16_t)n, rsp, &rl) == ERR_STATE, "a second entry is refused with STATE");
  CHECK(zplc_plant_active() == 1 && good(10U) == 0, "and the first entry is intact");
}

static void plant_frame_applies_vector_values_at_the_latch(void) {
  zplc_plant_stats_t s;
  const uint8_t want_real[4] = {0x00, 0x00, 0xC0, 0x3F};

  printf("\n=== plant_frame_applies_vector_values_at_the_latch ===\n");
  start();
  CHECK(enter_vector() == 0, "entry");
  CHECK(good(258U) == 0, "the vector frame is accepted");
  CHECK(ipi()[0] == 0U && ipi()[1] == 0U && ipi()[2] == 0U, "the image is untouched until the latch");
  zplc_plant_latch();
  CHECK(ipi()[0] == 0x01U, "BOOL 1 set and BOOL 0 clear, in IPI byte 0");
  CHECK(ipi()[1] == 0x80U, "BOOL 1 in bit 7 of IPI byte 1");
  CHECK(ipi()[2] == 0xFEU && ipi()[3] == 0xFFU, "INT -2 little endian");
  CHECK(memcmp(ipi() + 4, want_real, 4U) == 0, "REAL 1.5 little endian");
  zplc_plant_get_stats(&s);
  CHECK(s.frames == 1U && s.applied_seq == 258U && s.late == 0U && s.rejected == 0U,
        "counters: one frame, sequence 258 latched, none late or rejected");
}

static void plant_frame_rejects_wrong_plant_id(void) {
  printf("\n=== plant_frame_rejects_wrong_plant_id ===\n");
  start();
  (void)enter_vector();
  CHECK(send_frame(2U, 5U, 0x05U, 0x3FC00000U, 0) == ERR_BAD, "another plant id");
  CHECK(rejected_of() == 1U, "counted as rejected");
  zplc_plant_latch();
  CHECK(ipi()[0] == 0U && ipi()[2] == 0U, "and nothing reached the image");
}

static void plant_frame_rejects_wrong_length(void) {
  printf("\n=== plant_frame_rejects_wrong_length ===\n");
  start();
  (void)enter_vector();
  CHECK(send_frame(1U, 5U, 0x05U, 0x3FC00000U, 1) == ERR_BAD, "one byte too long");
  CHECK(send_frame(1U, 6U, 0x05U, 0x3FC00000U, -1) == ERR_BAD, "one byte too short");
  CHECK(send_frame(1U, 7U, 0x05U, 0x3FC00000U, -7) == ERR_BAD, "only the header");
  CHECK(send_frame(1U, 8U, 0x05U, 0x3FC00000U, -12) == ERR_BAD, "less than the header");
  CHECK(rejected_of() == 4U, "all counted");
  zplc_plant_latch();
  CHECK(ipi()[2] == 0U, "nothing applied");
}

static void plant_frame_rejects_padding_bits(void) {
  printf("\n=== plant_frame_rejects_padding_bits ===\n");
  start();
  (void)enter_vector();
  CHECK(send_frame(1U, 5U, 0x0DU, 0x3FC00000U, 0) == ERR_BAD, "a bit past the third BOOL");
  CHECK(send_frame(1U, 6U, 0x80U, 0x3FC00000U, 0) == ERR_BAD, "bit 7 of the bitmap");
  zplc_plant_latch();
  CHECK(ipi()[0] == 0U, "nothing applied");
}

static void plant_frame_rejects_nan_and_infinity(void) {
  printf("\n=== plant_frame_rejects_nan_and_infinity ===\n");
  start();
  (void)enter_vector();
  CHECK(send_frame(1U, 5U, 0x05U, 0x7FC00000U, 0) == ERR_BAD, "quiet NaN");
  CHECK(send_frame(1U, 6U, 0x05U, 0x7F800000U, 0) == ERR_BAD, "+infinity");
  CHECK(send_frame(1U, 7U, 0x05U, 0xFF800000U, 0) == ERR_BAD, "-infinity");
  CHECK(send_frame(1U, 8U, 0x05U, 0xFF800001U, 0) == ERR_BAD, "signalling NaN");
  CHECK(send_frame(1U, 9U, 0x05U, 0x00000001U, 0) == 0, "a denormal is finite");
  CHECK(send_frame(1U, 10U, 0x05U, 0x7F7FFFFFU, 0) == 0, "the largest finite value is accepted");
  CHECK(rejected_of() == 4U, "four rejected");
}

static void plant_frame_rejects_replayed_and_old_seq(void) {
  printf("\n=== plant_frame_rejects_replayed_and_old_seq ===\n");
  start();
  (void)enter_vector();
  CHECK(good(258U) == 0, "the first frame, whatever its sequence");
  CHECK(good(258U) == ERR_BAD, "the same sequence again");
  CHECK(good(257U) == ERR_BAD, "an older one");
  CHECK(good(258U + 0x80000000UL) == ERR_BAD, "exactly half the range ahead counts as old");
  CHECK(good(259U) == 0, "the next one");
  CHECK(good(259U + 0x80000000UL) == ERR_BAD, "again half the range: old");
  CHECK(good(259U + 0x7FFFFFFFUL) == 0, "the furthest newer sequence");
  CHECK(rejected_of() == 4U, "four rejected");
}

static void plant_frame_seq_wraps(void) {
  printf("\n=== plant_frame_seq_wraps ===\n");
  start();
  (void)enter_vector();
  CHECK(good(0xFFFFFFFEUL) == 0, "near the top");
  CHECK(good(0xFFFFFFFFUL) == 0, "the top");
  CHECK(good(0U) == 0, "zero is newer than the top");
  CHECK(good(1U) == 0, "and one");
  CHECK(good(0xFFFFFFFFUL) == ERR_BAD, "the top again is old");
}

static void plant_rejected_frame_changes_nothing_and_does_not_refresh_age(void) {
  zplc_plant_stats_t s;

  printf("\n=== plant_rejected_frame_changes_nothing_and_does_not_refresh_age ===\n");
  start();
  (void)enter_vector();
  clock_ms = 1010U;
  CHECK(good(1U) == 0, "a frame at t+10");
  clock_ms = 1050U;
  CHECK(send_frame(1U, 2U, 0x02U, 0x40000000U, 0) == 0, "a frame with other values at t+50");
  CHECK(send_frame(1U, 3U, 0x07U, 0x7FC00000U, 0) == ERR_BAD, "a NaN frame at t+50 is rejected");
  CHECK(send_frame(1U, 2U, 0x07U, 0x3F800000U, 0) == ERR_BAD, "a replay at t+50 is rejected");
  clock_ms = 1060U;
  zplc_plant_get_stats(&s);
  CHECK(s.age_ms == 10U, "the age counts from the last accepted frame");
  CHECK(s.rejected == 2U && s.frames == 2U, "counters");
  zplc_plant_latch();
  CHECK(ipi()[0] == 0x02U && ipi()[4] == 0x00U && ipi()[7] == 0x40U, "the image carries the last accepted frame only");
}

static void plant_eight_rejects_exit_protocol(void) {
  printf("\n=== plant_eight_rejects_exit_protocol ===\n");
  start();
  (void)enter_vector();
  for (int i = 0; i < 7; i++) {
    (void)send_frame(2U, 1U, 0U, 0U, 0);
  }
  CHECK(zplc_plant_tick() == 0, "seven rejected frames do not fire the rule");
  CHECK(good(1U) == 0, "a good frame resets the run");
  for (int i = 0; i < 7; i++) {
    (void)send_frame(2U, 1U, 0U, 0U, 0);
  }
  CHECK(zplc_plant_tick() == 0, "seven more: still not");
  CHECK(send_frame(2U, 1U, 0U, 0U, 0) == ERR_BAD, "the eighth in a row is rejected");
  CHECK(zplc_plant_tick() != 0, "the exit rule fires");
  CHECK(zplc_plant_exit_reason() == ZPLC_PROTO_PLANT_EXIT_REASON_PROTOCOL, "with the reason PROTOCOL");
  CHECK(zplc_plant_holds_outputs() == 1, "outputs are held");
  CHECK(good(2U) == ERR_STATE, "no frame is accepted any more");
  CHECK(zplc_plant_exit(ZPLC_PROTO_PLANT_EXIT_REASON_CLOSED) == 0 && zplc_plant_active() == 0, "the adapter completes the exit");
  CHECK(zplc_plant_exit_reason() == ZPLC_PROTO_PLANT_EXIT_REASON_PROTOCOL, "the reason that fired is kept");
}

static void plant_latch_forced_byte_keeps_forced_value(void) {
  const uint8_t forced_byte = 0x55U;
  const uint8_t forced_int[2] = {0x11U, 0x22U};

  printf("\n=== plant_latch_forced_byte_keeps_forced_value ===\n");
  start();
  (void)enter_vector();
  CHECK(zplc_force_set_bytes(ZPLC_MEM_IPI_BASE + 1U, &forced_byte, 1U) == 0, "IPI byte 1 is forced");
  CHECK(zplc_force_set_bytes(ZPLC_MEM_IPI_BASE + 2U, forced_int, 2U) == 0, "the INT is forced");
  CHECK(good(1U) == 0, "a frame that sets bit 7 of byte 1 and an INT");
  zplc_plant_latch();
  CHECK(ipi()[1] == 0x55U, "the forced byte keeps its value");
  CHECK(ipi()[2] == 0x11U && ipi()[3] == 0x22U, "the forced INT keeps its value");
  CHECK(ipi()[0] == 0x01U && ipi()[7] == 0x3FU, "unforced slots take the plant value");
  zplc_force_clear_all();
}

static void plant_latch_bool_keeps_neighbour_bits(void) {
  printf("\n=== plant_latch_bool_keeps_neighbour_bits ===\n");
  start();
  (void)enter_vector();
  ipi()[0] = 0xFAU; /* bit 1 set, bit 0 clear; bits 2 to 7 are the pins' */
  ipi()[1] = 0x7FU;
  CHECK(good(1U) == 0, "frame");
  zplc_plant_latch();
  CHECK(ipi()[0] == 0xF9U, "bit 0 set and bit 1 cleared; bits 2 to 7 untouched");
  CHECK(ipi()[1] == 0xFFU, "bit 7 set; bits 0 to 6 untouched");
}

static void plant_latch_trylock_never_blocks(void) {
  int locks, unlocks;

  printf("\n=== plant_latch_trylock_never_blocks ===\n");
  start();
  (void)enter_vector();
  CHECK(good(1U) == 0, "frame");
  lock_fails = 1;
  locks = lock_calls;
  unlocks = unlock_calls;
  zplc_plant_latch();
  CHECK(lock_calls == locks + 1, "the latch tries the lock once and returns");
  CHECK(unlock_calls == unlocks, "a lock it did not get is not released");
  CHECK(ipi()[0] == 0U && ipi()[2] == 0U, "the scan goes on with the values in the image");
  CHECK(late_of() == 1U, "and counts late");
  zplc_plant_latch();
  CHECK(late_of() == 2U, "every scan that cannot lock counts");
  lock_fails = 0;
  zplc_plant_latch();
  CHECK(ipi()[0] == 0x01U && ipi()[2] == 0xFEU, "the staged frame is applied at the first latch that gets the lock");
  CHECK(late_of() == 2U, "and that latch is on time");
}

static void plant_latch_nothing_new_counts_late(void) {
  printf("\n=== plant_latch_nothing_new_counts_late ===\n");
  start();
  (void)enter_vector();
  zplc_plant_latch();
  CHECK(late_of() == 1U, "no frame yet: late");
  CHECK(good(1U) == 0, "frame");
  zplc_plant_latch();
  CHECK(late_of() == 1U, "a latch with a new frame is on time");
  ipi()[2] = 0U;
  zplc_plant_latch();
  CHECK(late_of() == 2U, "a latch with nothing new is late");
  CHECK(ipi()[2] == 0U, "and applies nothing: a frame is applied once");
  CHECK(good(2U) == 0, "next frame");
  zplc_plant_latch();
  CHECK(ipi()[2] == 0xFEU && late_of() == 2U, "applied, on time");
}

static void plant_tick_timeout_bound(void) {
  zplc_plant_stats_t s;
  uint8_t rsp[32];
  uint16_t rl = 0U;

  printf("\n=== plant_tick_timeout_bound ===\n");
  start();
  CHECK(enter_timeout(100U, rsp, &rl) == 0 && rsp[7] == 100U && rsp[8] == 0U, "entry grants 100 ms");
  clock_ms = 1030U;
  CHECK(good(1U) == 0, "a frame at t+30");
  clock_ms = 1130U;
  CHECK(zplc_plant_tick() == 0, "exactly the timeout after the frame: not yet");
  zplc_plant_get_stats(&s);
  CHECK(s.age_ms == 100U, "the stats carry the age (100)");
  clock_ms = 1131U;
  CHECK(zplc_plant_tick() != 0, "one millisecond more: the rule fires");
  zplc_plant_get_stats(&s);
  CHECK(s.age_ms == 101U, "the age is 101");
  CHECK(zplc_plant_exit_reason() == ZPLC_PROTO_PLANT_EXIT_REASON_TIMEOUT, "reason TIMEOUT");
  CHECK(zplc_plant_tick() != 0, "it keeps firing until the exit is completed");
  CHECK(zplc_plant_holds_outputs() == 1, "outputs held");
  zplc_plant_latch();
  CHECK(ipi()[2] == 0U, "no stale value is applied once the rule fired");

  start();
  (void)enter_timeout(100U, rsp, &rl);
  clock_ms = 1100U;
  CHECK(zplc_plant_tick() == 0, "with no frame, the age counts from the entry");
  clock_ms = 1101U;
  CHECK(zplc_plant_tick() != 0, "and the entry times out too");

  start();
  CHECK(enter_timeout(1U, rsp, &rl) == 0 && rsp[7] == 50U && rsp[8] == 0U, "a timeout below 50 is clamped to 50");
  start();
  CHECK(enter_timeout(2000U, rsp, &rl) == 0 && rsp[7] == 0xD0U && rsp[8] == 0x07U, "2000 is granted as it is");
  start();
  CHECK(enter_timeout(2001U, rsp, &rl) == 0 && rsp[7] == 0xD0U && rsp[8] == 0x07U, "2001 is clamped to 2000");
}

static void plant_exit_is_idempotent_and_posts_once(void) {
  printf("\n=== plant_exit_is_idempotent_and_posts_once ===\n");
  start();
  CHECK(zplc_plant_exit(ZPLC_PROTO_PLANT_EXIT_REASON_CLOSED) == ERR_STATE, "an exit with no entry does nothing");
  (void)enter_vector();
  zplc_plant_set_mirror(1U);
  CHECK(zplc_plant_holds_outputs() == 0, "mirror on: outputs are not held");
  CHECK(zplc_plant_exit(ZPLC_PROTO_PLANT_EXIT_REASON_SESSION_END) == 0, "the first exit is performed (the one to post)");
  CHECK(zplc_plant_active() == 0 && zplc_plant_holds_outputs() == 0, "the mode is inactive");
  CHECK(zplc_plant_exit_reason() == ZPLC_PROTO_PLANT_EXIT_REASON_SESSION_END, "the reason is kept");
  CHECK(zplc_plant_exit(ZPLC_PROTO_PLANT_EXIT_REASON_LINK_LOST) == ERR_STATE, "the second is a no-op: nothing to post again");
  CHECK(zplc_plant_exit_reason() == ZPLC_PROTO_PLANT_EXIT_REASON_SESSION_END, "and keeps the first reason");
  CHECK(good(1U) == ERR_STATE, "no frame after the exit");
  CHECK(zplc_plant_tick() == 0, "no rule fires on an inactive mode");
  zplc_plant_latch();
  CHECK(ipi()[2] == 0U, "an inactive latch writes nothing");
  CHECK(enter_vector() == 0 && zplc_plant_holds_outputs() == 1, "a new entry starts clean, mirror off");
}

static void plant_mirror_toggles_the_hold_and_the_rule_overrides_it(void) {
  printf("\n=== plant_mirror_toggles_the_hold_and_the_rule_overrides_it ===\n");
  start();
  zplc_plant_set_mirror(1U);
  CHECK(zplc_plant_holds_outputs() == 0, "inactive: no hold");
  (void)enter_vector();
  CHECK(zplc_plant_holds_outputs() == 1, "an entry after a mirror call on an inactive mode starts with mirror off");
  zplc_plant_set_mirror(1U);
  CHECK(zplc_plant_holds_outputs() == 0, "mirror on: no hold");
  zplc_plant_set_mirror(0U);
  CHECK(zplc_plant_holds_outputs() == 1, "mirror off: hold");
  zplc_plant_set_mirror(1U);
  clock_ms += 501U;
  CHECK(zplc_plant_tick() != 0, "the timeout fires");
  CHECK(zplc_plant_holds_outputs() == 1, "from then on the hold is unconditional, mirror or not");
}

static void plant_response_outputs_come_from_one_snapshot(void) {
  uint8_t req[64], rsp[64];
  uint16_t rl = 0U;
  size_t n = hex(V_FRAME, req);

  printf("\n=== plant_response_outputs_come_from_one_snapshot ===\n");
  start();
  (void)enter_vector();
  opi()[0] = 0x08U; /* published: BOOL out 1 (bit 3) set, BOOL out 0 clear */
  zplc_exchange_publish();
  opi()[0] = 0x01U; /* the next scan is in the middle of its cycle: not published */
  CHECK(zplc_plant_frame(req, (uint16_t)n, rsp, &rl) == 0, "frame");
  CHECK(rl == 14U, "response: applied_seq 4, scans 4, flags 1, late 2, rejected 2, one bitmap byte");
  CHECK(rsp[13] == 0x02U, "the bitmap is the published snapshot (0, 1), not the live bytes");
  CHECK(rsp[0] == 0U && rsp[1] == 0U && rsp[2] == 0U && rsp[3] == 0U, "no scan latched the frame yet: applied_seq 0");
  zplc_plant_latch();
  zplc_exchange_publish();
  req[2] = 3U; /* sequence 259 */
  CHECK(zplc_plant_frame(req, (uint16_t)n, rsp, &rl) == 0, "the next frame");
  CHECK(rsp[0] == 0x02U && rsp[1] == 0x01U && rsp[2] == 0U && rsp[3] == 0U, "applied_seq 258: the sequence a scan latched");
  CHECK(rsp[4] == 1U && rsp[5] == 0U && rsp[6] == 0U && rsp[7] == 0U, "one scan counted");
  CHECK(rsp[8] == 0U, "flags: mirror off, no scan missed a frame since the last response");
  CHECK(rsp[13] == 0x01U, "and the bitmap follows the new publication (1, 0)");
  zplc_plant_set_mirror(1U);
  zplc_plant_latch();
  req[2] = 4U;
  CHECK(zplc_plant_frame(req, (uint16_t)n, rsp, &rl) == 0, "a frame with mirror on");
  CHECK((rsp[8] & 0x01U) == 0x01U, "flags bit 0: mirror");
}

int main(void) {
  CHECK(zplc_core_init() == 0, "core init");
  plant_enter_accepts_the_vector();
  plant_enter_rejects_too_many_slots();
  plant_enter_rejects_input_in_system_registers();
  plant_enter_rejects_overlapping_numeric_slots();
  plant_enter_rejects_reserved_bits();
  plant_enter_refused_when_active();
  plant_frame_applies_vector_values_at_the_latch();
  plant_frame_rejects_wrong_plant_id();
  plant_frame_rejects_wrong_length();
  plant_frame_rejects_padding_bits();
  plant_frame_rejects_nan_and_infinity();
  plant_frame_rejects_replayed_and_old_seq();
  plant_frame_seq_wraps();
  plant_rejected_frame_changes_nothing_and_does_not_refresh_age();
  plant_eight_rejects_exit_protocol();
  plant_latch_forced_byte_keeps_forced_value();
  plant_latch_bool_keeps_neighbour_bits();
  plant_latch_trylock_never_blocks();
  plant_latch_nothing_new_counts_late();
  plant_tick_timeout_bound();
  plant_exit_is_idempotent_and_posts_once();
  plant_mirror_toggles_the_hold_and_the_rule_overrides_it();
  plant_response_outputs_come_from_one_snapshot();
  printf("\n%d checks, %d failed\n", test_count, fail_count);
  return fail_count == 0 ? 0 : 1;
}
