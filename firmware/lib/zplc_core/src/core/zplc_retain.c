/**
 * @file zplc_retain.c
 * @brief Persistence of the RETAIN region: two alternating checksummed records.
 *
 * SPDX-License-Identifier: MIT
 *
 * See zplc_retain.h for the record layout, the layout hash and the rules. This
 * file is portable C99: the only services it uses are the HAL persistence
 * calls and zplc_hal_log().
 */

#include "zplc_retain.h"

#include <string.h>

#include "zplc_hal.h"

/* One whole record, and never less than one chunk (a chunk is read in one piece). */
#define RECORD_MAX (ZPLC_RETAIN_HEADER_SIZE + ZPLC_RETAIN_CAPACITY + ZPLC_RETAIN_TRAILER_SIZE)
#define BUF_SIZE (RECORD_MAX > ZPLC_RETAIN_CHUNK_SIZE ? RECORD_MAX : ZPLC_RETAIN_CHUNK_SIZE)

/* The largest record the keys can name. */
#define KEY_RECORD_MAX ((uint32_t)ZPLC_RETAIN_MAX_CHUNKS * ZPLC_RETAIN_CHUNK_SIZE)

/* A build whose region does not fit the eight chunks of a slot must fail here. */
typedef char zplc_retain_region_fits_the_keys[(RECORD_MAX <= KEY_RECORD_MAX) ? 1 : -1];

/* The running CRC-32 state after the message and its own CRC, little-endian:
 * a whole valid record leaves this constant, whatever the payload. */
#define CRC_RESIDUE 0xDEBB20E3U

static const uint8_t record_magic[4] = { 0x5AU, 0x52U, 0x54U, 0x4EU }; /* "ZRTN" */

typedef struct {
  uint32_t sequence;
  uint32_t id_crc32;
  uint32_t id_code_size;
  uint32_t layout;
  uint32_t length;
} header_t;

typedef enum {
  SLOT_ABSENT,    /* no chunk 0 under the key */
  SLOT_INVALID,   /* present, but not a record of this format */
  SLOT_IO,        /* the backend failed */
  SLOT_PLAUSIBLE  /* the header is well formed; the checksum is not checked yet */
} slot_state_t;

static struct {
  int configured;
  uint8_t *region;
  uint32_t region_size;
  void (*lock)(void);
  void (*unlock)(void);
  uint32_t min_interval_ms;
  int restored;            /* restore ran since init */
  int writable;            /* the backend answered, so the next sequence can be trusted */
  int image_valid;         /* s_buf holds exactly the record last restored or written */
  zplc_retain_identity_t image_id;
  uint32_t newest_sequence;
  int newest_slot;         /* slot of the newest valid record; -1 = none */
  uint32_t last_write_ms;  /* clock at the last restore or write: the interval origin */
  zplc_retain_status_t status;
} s;

static uint8_t s_buf[BUF_SIZE];

static void put_u16(uint8_t *p, uint16_t v)
{
  p[0] = (uint8_t)v;
  p[1] = (uint8_t)(v >> 8);
}

static void put_u32(uint8_t *p, uint32_t v)
{
  p[0] = (uint8_t)v;
  p[1] = (uint8_t)(v >> 8);
  p[2] = (uint8_t)(v >> 16);
  p[3] = (uint8_t)(v >> 24);
}

static uint32_t get_u32(const uint8_t *p)
{
  return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

static uint32_t crc_update(uint32_t crc, const uint8_t *data, size_t length)
{
  size_t index;

  for (index = 0U; index < length; index++) {
    unsigned bit;

    crc ^= data[index];
    for (bit = 0U; bit < 8U; bit++) {
      crc = (crc & 1U) != 0U ? (crc >> 1) ^ 0xEDB88320U : crc >> 1;
    }
  }
  return crc;
}

static uint32_t layout_hash(const zplc_retain_identity_t *identity, uint32_t region_size)
{
  uint8_t bytes[24];

  put_u32(bytes + 0, region_size);
  put_u32(bytes + 4, (uint32_t)ZPLC_MEM_RETAIN_BASE);
  put_u16(bytes + 8, (uint16_t)ZPLC_VERSION_MAJOR);
  put_u16(bytes + 10, (uint16_t)ZPLC_VERSION_MINOR);
  put_u32(bytes + 12, (uint32_t)ZPLC_DRAFT_COUNTER);
  put_u32(bytes + 16, identity->crc32);
  put_u32(bytes + 20, identity->code_size);
  return crc_update(0xFFFFFFFFU, bytes, sizeof(bytes)) ^ 0xFFFFFFFFU;
}

/* a is newer than b, with the sequence read as a 32-bit serial number. */
static int sequence_newer(uint32_t a, uint32_t b)
{
  uint32_t distance = a - b;

  return distance != 0U && distance < 0x80000000U;
}

static uint32_t next_sequence(uint32_t sequence)
{
  uint32_t next = sequence + 1U;

  return next == 0U ? 1U : next; /* 0 never names a record */
}

static void chunk_key(unsigned slot, unsigned chunk, char *key)
{
  memcpy(key, "retain_", 7U);
  key[7] = slot == 0U ? 'a' : 'b';
  key[8] = (char)('0' + chunk);
  key[9] = '\0';
}

static void lock_region(void)
{
  if (s.lock != NULL) {
    s.lock();
  }
}

static void unlock_region(void)
{
  if (s.unlock != NULL) {
    s.unlock();
  }
}

/* Reads chunk 0 of a slot into s_buf and checks what does not need the checksum. */
static slot_state_t read_header(unsigned slot, header_t *header)
{
  char key[10];
  zplc_hal_result_t result;

  chunk_key(slot, 0U, key);
  memset(s_buf, 0, ZPLC_RETAIN_CHUNK_SIZE);
  result = zplc_hal_persist_load(key, s_buf, ZPLC_RETAIN_CHUNK_SIZE);
  if (result == ZPLC_HAL_NOT_IMPL) {
    return SLOT_ABSENT;
  }
  if (result == ZPLC_HAL_CORRUPT) {
    return SLOT_INVALID;
  }
  if (result != ZPLC_HAL_OK) {
    s.status.last_error = (int32_t)result;
    return SLOT_IO;
  }
  if (memcmp(s_buf, record_magic, sizeof(record_magic)) != 0 ||
      s_buf[4] != (uint8_t)ZPLC_RETAIN_FORMAT_VERSION || s_buf[5] != 0U ||
      s_buf[6] != 0U || s_buf[7] != 0U) {
    return SLOT_INVALID;
  }
  header->sequence = get_u32(s_buf + 8);
  header->id_crc32 = get_u32(s_buf + 12);
  header->id_code_size = get_u32(s_buf + 16);
  header->layout = get_u32(s_buf + 20);
  header->length = get_u32(s_buf + 24);
  if (header->sequence == 0U || header->length == 0U ||
      header->length > KEY_RECORD_MAX - ZPLC_RETAIN_HEADER_SIZE - ZPLC_RETAIN_TRAILER_SIZE) {
    return SLOT_INVALID;
  }
  return SLOT_PLAUSIBLE;
}

/*
 * Reads every chunk of a plausible record and checks the checksum as a stream.
 * A record that fits the buffer stays there; a bigger one (written by a build
 * with a bigger region) only passes through it. Returns 1 valid, 0 invalid,
 * -1 backend failure.
 */
static int read_record(unsigned slot, const header_t *header)
{
  const uint32_t total = ZPLC_RETAIN_HEADER_SIZE + header->length + ZPLC_RETAIN_TRAILER_SIZE;
  uint32_t crc = 0xFFFFFFFFU;
  uint32_t offset;
  unsigned chunk = 0U;

  for (offset = 0U; offset < total; offset += ZPLC_RETAIN_CHUNK_SIZE) {
    const uint32_t remaining = total - offset;
    const size_t length = remaining < ZPLC_RETAIN_CHUNK_SIZE ? remaining : ZPLC_RETAIN_CHUNK_SIZE;
    uint8_t *destination = (offset + length <= BUF_SIZE) ? s_buf + offset : s_buf;
    zplc_hal_result_t result;
    char key[10];

    chunk_key(slot, chunk++, key);
    memset(destination, 0, length);
    result = zplc_hal_persist_load(key, destination, length);
    if (result == ZPLC_HAL_NOT_IMPL || result == ZPLC_HAL_CORRUPT) {
      return 0; /* a chunk is missing, empty or longer than the record says */
    }
    if (result != ZPLC_HAL_OK) {
      s.status.last_error = (int32_t)result;
      return -1;
    }
    crc = crc_update(crc, destination, length);
  }
  return crc == CRC_RESIDUE ? 1 : 0;
}

static zplc_retain_reason_t classify(const header_t *header, const zplc_retain_identity_t *identity)
{
  if (header->id_crc32 != identity->crc32 || header->id_code_size != identity->code_size) {
    return ZPLC_RETAIN_IDENTITY_MISMATCH;
  }
  if (header->length != s.region_size || header->layout != layout_hash(identity, s.region_size)) {
    return ZPLC_RETAIN_LAYOUT_MISMATCH;
  }
  return ZPLC_RETAIN_RESTORED;
}

const char *zplc_retain_reason_string(zplc_retain_reason_t reason)
{
  switch (reason) {
  case ZPLC_RETAIN_RESTORED:
    return "restored";
  case ZPLC_RETAIN_NONE:
    return "none";
  case ZPLC_RETAIN_IDENTITY_MISMATCH:
    return "identity_mismatch";
  case ZPLC_RETAIN_LAYOUT_MISMATCH:
    return "layout_mismatch";
  case ZPLC_RETAIN_CORRUPT:
    return "corrupt";
  case ZPLC_RETAIN_IO_ERROR:
    return "io_error";
  case ZPLC_RETAIN_RESET:
    return "reset";
  case ZPLC_RETAIN_NOT_RESTORED:
  default:
    return "not_restored";
  }
}

int zplc_retain_init(const zplc_retain_config_t *config)
{
  memset(&s, 0, sizeof(s));
  s.newest_slot = -1;
  if (config == NULL || config->region == NULL || config->region_size == 0U ||
      config->region_size > ZPLC_RETAIN_CAPACITY) {
    return -1;
  }
  s.region = config->region;
  s.region_size = config->region_size;
  s.lock = config->lock;
  s.unlock = config->unlock;
  s.min_interval_ms = config->min_interval_ms;
  s.configured = 1;
  return 0;
}

int zplc_retain_identity_from_artifact(const uint8_t *artifact, size_t size,
                                       zplc_retain_identity_t *out)
{
  if (artifact == NULL || out == NULL || size < ZPLC_FILE_HEADER_SIZE ||
      get_u32(artifact) != (uint32_t)ZPLC_MAGIC) {
    return -1;
  }
  out->crc32 = get_u32(artifact + 12);
  out->code_size = get_u32(artifact + 16);
  return 0;
}

zplc_retain_reason_t zplc_retain_restore(const zplc_retain_identity_t *identity, uint32_t now_ms)
{
  header_t header[2];
  slot_state_t state[2];
  unsigned order[2];
  unsigned candidates = 0U;
  unsigned index;
  int failed[2] = { 0, 0 };  /* the backend failed on this slot */
  int backend_down;
  int invalid_seen = 0;
  int valid_seen = 0;
  int matched = -1;
  zplc_retain_reason_t newest_reason = ZPLC_RETAIN_NONE;
  zplc_retain_reason_t reason;

  if (s.configured == 0 || identity == NULL) {
    return ZPLC_RETAIN_NOT_RESTORED;
  }
  s.restored = 0;
  s.writable = 0;
  s.image_valid = 0;
  s.newest_sequence = 0U;
  s.newest_slot = -1;
  s.status.reason = ZPLC_RETAIN_NOT_RESTORED;
  s.status.sequence = 0U;
  memset(header, 0, sizeof(header));

  for (index = 0U; index < 2U; index++) {
    state[index] = read_header(index, &header[index]);
    failed[index] = state[index] == SLOT_IO;
    invalid_seen |= state[index] == SLOT_INVALID;
  }
  /* Newest first, so the first valid record is the newest valid one. */
  for (index = 0U; index < 2U; index++) {
    if (state[index] == SLOT_PLAUSIBLE) {
      order[candidates++] = index;
    }
  }
  if (candidates == 2U && sequence_newer(header[order[1]].sequence, header[order[0]].sequence)) {
    const unsigned swap = order[0];

    order[0] = order[1];
    order[1] = swap;
  }

  for (index = 0U; index < candidates && matched < 0; index++) {
    const unsigned slot = order[index];
    const int valid = read_record(slot, &header[slot]);

    if (valid < 0) {
      failed[slot] = 1;
      continue;
    }
    if (valid == 0) {
      invalid_seen = 1;
      continue;
    }
    if (valid_seen == 0) {
      valid_seen = 1;
      s.newest_sequence = header[slot].sequence;
      s.newest_slot = (int)slot;
      newest_reason = classify(&header[slot], identity);
    }
    if (classify(&header[slot], identity) == ZPLC_RETAIN_RESTORED) {
      matched = (int)slot;
    }
  }

  /* One unreadable slot is a damaged record: the next save repairs it. Both
   * slots failing means the backend itself is down, and nothing can be decided. */
  backend_down = failed[0] != 0 && failed[1] != 0;
  invalid_seen |= (failed[0] | failed[1]) != 0;

  if (matched >= 0) {
    lock_region();
    memcpy(s.region, s_buf + ZPLC_RETAIN_HEADER_SIZE, s.region_size);
    unlock_region();
    s.image_valid = 1;
    s.image_id = *identity;
    s.status.sequence = header[matched].sequence;
    reason = ZPLC_RETAIN_RESTORED;
  } else {
    if (backend_down != 0) {
      reason = ZPLC_RETAIN_IO_ERROR;
    } else if (valid_seen != 0) {
      reason = newest_reason;
    } else if (invalid_seen != 0) {
      reason = ZPLC_RETAIN_CORRUPT;
    } else {
      reason = ZPLC_RETAIN_NONE;
    }
    lock_region();
    memset(s.region, 0, s.region_size);
    unlock_region();
    s.status.sequence = s.newest_sequence;
  }

  s.restored = 1;
  s.writable = backend_down == 0;
  s.last_write_ms = now_ms;
  s.status.reason = reason;
  zplc_hal_log("[RETAIN] restore: %s, sequence %u\n", zplc_retain_reason_string(reason),
               (unsigned)s.status.sequence);
  return reason;
}

zplc_retain_save_result_t zplc_retain_save(const zplc_retain_identity_t *identity,
                                           uint32_t now_ms,
                                           zplc_retain_save_mode_t mode)
{
  const uint32_t total = ZPLC_RETAIN_HEADER_SIZE + s.region_size + ZPLC_RETAIN_TRAILER_SIZE;
  const unsigned target = s.newest_slot == 0 ? 1U : 0U;
  uint32_t sequence;
  uint32_t crc;
  uint32_t offset;
  unsigned chunk = 0U;
  int unchanged;

  if (s.configured == 0 || identity == NULL || s.restored == 0) {
    return ZPLC_RETAIN_SAVE_NOT_READY;
  }
  if (s.writable == 0) {
    /* The backend did not answer at restore, so the newest sequence is unknown:
     * writing could hide a newer record. Say so in the status, not by silence. */
    s.status.save_errors++;
    return ZPLC_RETAIN_SAVE_NOT_READY;
  }
  if (mode == ZPLC_RETAIN_SAVE_PERIODIC) {
    if (s.min_interval_ms == 0U) {
      return ZPLC_RETAIN_SAVE_DISABLED;
    }
    if ((now_ms - s.last_write_ms) < s.min_interval_ms) {
      return ZPLC_RETAIN_SAVE_TOO_SOON;
    }
  }

  /* One coherent copy of the region, under the hook, and no backend call under it. */
  lock_region();
  unchanged = s.image_valid != 0 && s.image_id.crc32 == identity->crc32 &&
              s.image_id.code_size == identity->code_size &&
              memcmp(s.region, s_buf + ZPLC_RETAIN_HEADER_SIZE, s.region_size) == 0;
  if (unchanged == 0) {
    memcpy(s_buf + ZPLC_RETAIN_HEADER_SIZE, s.region, s.region_size);
  }
  unlock_region();
  if (unchanged != 0) {
    return ZPLC_RETAIN_SAVE_UNCHANGED;
  }

  sequence = next_sequence(s.newest_sequence);
  memcpy(s_buf, record_magic, sizeof(record_magic));
  put_u16(s_buf + 4, (uint16_t)ZPLC_RETAIN_FORMAT_VERSION);
  put_u16(s_buf + 6, 0U);
  put_u32(s_buf + 8, sequence);
  put_u32(s_buf + 12, identity->crc32);
  put_u32(s_buf + 16, identity->code_size);
  put_u32(s_buf + 20, layout_hash(identity, s.region_size));
  put_u32(s_buf + 24, s.region_size);
  crc = crc_update(0xFFFFFFFFU, s_buf, total - ZPLC_RETAIN_TRAILER_SIZE) ^ 0xFFFFFFFFU;
  put_u32(s_buf + total - ZPLC_RETAIN_TRAILER_SIZE, crc);

  for (offset = 0U; offset < total; offset += ZPLC_RETAIN_CHUNK_SIZE) {
    const uint32_t remaining = total - offset;
    const size_t length = remaining < ZPLC_RETAIN_CHUNK_SIZE ? remaining : ZPLC_RETAIN_CHUNK_SIZE;
    zplc_hal_result_t result;
    char key[10];

    chunk_key(target, chunk++, key);
    result = zplc_hal_persist_save(key, s_buf + offset, length);
    if (result != ZPLC_HAL_OK) {
      /* The other slot is untouched and still the newest valid record. The
       * sequence and the slot are not consumed, so the retry reuses them. */
      s.image_valid = 0;
      s.status.save_errors++;
      s.status.last_error = (int32_t)result;
      zplc_hal_log("[RETAIN] save failed: HAL result %d\n", (int)result);
      return ZPLC_RETAIN_SAVE_IO_ERROR;
    }
  }

  s.newest_sequence = sequence;
  s.newest_slot = (int)target;
  s.image_valid = 1;
  s.image_id = *identity;
  s.last_write_ms = now_ms;
  s.status.sequence = sequence;
  s.status.saves++;
  s.status.saved_at_ms = now_ms;
  return ZPLC_RETAIN_SAVE_WRITTEN;
}

zplc_retain_save_result_t zplc_retain_cold_reset(const zplc_retain_identity_t *identity,
                                                 uint32_t now_ms)
{
  zplc_retain_save_result_t result;

  if (s.configured == 0 || identity == NULL) {
    return ZPLC_RETAIN_SAVE_NOT_READY;
  }
  lock_region();
  memset(s.region, 0, s.region_size);
  unlock_region();
  result = zplc_retain_save(identity, now_ms, ZPLC_RETAIN_SAVE_FORCED);
  s.status.reason = ZPLC_RETAIN_RESET;
  return result;
}

void zplc_retain_last_status(zplc_retain_status_t *out)
{
  if (out != NULL) {
    *out = s.status;
  }
}
