/**
 * @file zplc_retain.h
 * @brief Persistence of the RETAIN region across power cycles (RT-025, RT-026, RT-027).
 *
 * SPDX-License-Identifier: MIT
 *
 * Portable C99: no operating-system header. The module reads and writes the
 * RETAIN region through the pointer the caller gives to zplc_retain_init() and
 * stores records only through the HAL persistence API (zplc_hal_persist_*), so
 * the POSIX host, the WASM runtime and the Zephyr firmware apply the same rules.
 *
 * ## Record
 *
 * A record is one little-endian byte string. It is stored under two alternating
 * slots, "a" and "b", and every slot is cut into fixed-size chunks so that a
 * backend with a small maximum entry (Zephyr NVS on a 4 KB sector) can hold it:
 *
 *   key = "retain_" + ('a' | 'b') + chunk number ('0'..'7'), for example "retain_a0"
 *
 *   offset  size  field
 *        0     4  magic "ZRTN" (bytes 5A 52 54 4E)
 *        4     2  format version (ZPLC_RETAIN_FORMAT_VERSION)
 *        6     2  reserved, zero
 *        8     4  sequence number, monotonic, never 0
 *       12     4  program identity: CRC32 word of the artifact header (byte 12)
 *       16     4  program identity: code size word of the artifact header (byte 16)
 *       20     4  layout hash (see below)
 *       24     4  payload length in bytes (the size of the RETAIN region)
 *       28     n  payload: the RETAIN region bytes
 *     28+n     4  CRC-32 (IEEE 802.3, as in the artifact header) of bytes 0 .. 28+n-1
 *
 * ## Layout hash
 *
 * CRC-32 over these 24 bytes, little-endian:
 *
 *    0  u32  RETAIN region size in bytes (the runtime value, not the maximum)
 *    4  u32  ZPLC_MEM_RETAIN_BASE
 *    8  u16  ZPLC_VERSION_MAJOR
 *   10  u16  ZPLC_VERSION_MINOR
 *   12  u32  ZPLC_DRAFT_COUNTER
 *   16  u32  program identity, CRC32 word
 *   20  u32  program identity, code size word
 *
 * The region size and the address of the region decide where a retained value
 * lives; the version and the draft counter decide what the program image means;
 * the program identity decides which program wrote the values. Any change of one
 * of them makes a stored record unusable.
 *
 * ## Rules
 *
 *   - save writes the OLDER slot with sequence = newest + 1, so a power cut
 *     during a save never destroys the last good record;
 *   - restore picks the valid record with the highest sequence whose identity
 *     and layout match, and otherwise initialises (zeroes) the region and keeps
 *     the reason;
 *   - a periodic save is skipped when the region did not change since the last
 *     record and when the minimum interval has not passed (flash wear, RT-026);
 *   - a slot the backend cannot read counts as a damaged record, and the next
 *     save rewrites it; when the backend fails on both slots nothing can be
 *     decided: the reason is io_error and saves are refused until a restore
 *     reads the backend again.
 *
 * The module is not re-entrant. The caller serialises its calls, and gives lock
 * hooks that make the copy of the region coherent with the scan; the hooks are
 * never held across a HAL call (RT-012).
 */

#ifndef ZPLC_RETAIN_H
#define ZPLC_RETAIN_H

#include <stddef.h>
#include <stdint.h>

#include "zplc_isa.h"

#ifdef __cplusplus
extern "C" {
#endif

/** @brief Record format version written and accepted. */
#define ZPLC_RETAIN_FORMAT_VERSION 1U

/** @brief Bytes before the payload. */
#define ZPLC_RETAIN_HEADER_SIZE 28U

/** @brief Bytes after the payload (the CRC-32). */
#define ZPLC_RETAIN_TRAILER_SIZE 4U

/** @brief Largest chunk stored under one key. A backend entry must hold this. */
#ifndef ZPLC_RETAIN_CHUNK_SIZE
#ifdef CONFIG_ZPLC_RETAIN_CHUNK_SIZE
#define ZPLC_RETAIN_CHUNK_SIZE CONFIG_ZPLC_RETAIN_CHUNK_SIZE
#else
#define ZPLC_RETAIN_CHUNK_SIZE 1024U
#endif
#endif

/** @brief Chunks per slot; the keys use the digits '0'..'7'. */
#define ZPLC_RETAIN_MAX_CHUNKS 8U

/** @brief Largest region the module can persist: the region of the runtime build. */
#define ZPLC_RETAIN_CAPACITY ((uint32_t)ZPLC_MEM_RETAIN_SIZE)

/** @brief Outcome of the last restore (or of a cold reset). */
typedef enum {
  ZPLC_RETAIN_NOT_RESTORED = 0,  /**< restore has not run since init */
  ZPLC_RETAIN_RESTORED,          /**< a valid record matched and was applied */
  ZPLC_RETAIN_NONE,              /**< no record in either slot (first start, erased) */
  ZPLC_RETAIN_IDENTITY_MISMATCH, /**< valid records exist, written by another program */
  ZPLC_RETAIN_LAYOUT_MISMATCH,   /**< same program, other region size, address or runtime layout */
  ZPLC_RETAIN_CORRUPT,           /**< records exist, none passes the format and checksum checks */
  ZPLC_RETAIN_IO_ERROR,          /**< the backend failed; nothing could be decided */
  ZPLC_RETAIN_RESET              /**< the region was initialised by a cold reset command */
} zplc_retain_reason_t;

/** @brief Whether a save is bound by the minimum interval. */
typedef enum {
  ZPLC_RETAIN_SAVE_PERIODIC = 0, /**< skipped inside the minimum interval */
  ZPLC_RETAIN_SAVE_FORCED = 1    /**< STOP, shutdown, cold reset: ignores the interval */
} zplc_retain_save_mode_t;

/** @brief Result of zplc_retain_save(). */
typedef enum {
  ZPLC_RETAIN_SAVE_WRITTEN = 0,   /**< a new record is stored */
  ZPLC_RETAIN_SAVE_UNCHANGED = 1, /**< the region equals the last record: nothing written */
  ZPLC_RETAIN_SAVE_TOO_SOON = 2,  /**< periodic, inside the minimum interval */
  ZPLC_RETAIN_SAVE_DISABLED = 3,  /**< periodic, and the minimum interval is 0 */
  ZPLC_RETAIN_SAVE_NOT_READY = -1,/**< init or restore has not run, or restore ended in io_error */
  ZPLC_RETAIN_SAVE_IO_ERROR = -2  /**< the backend failed; the previous record is intact */
} zplc_retain_save_result_t;

/** @brief Identity of the program that owns the retained values. */
typedef struct {
  uint32_t crc32;     /**< artifact header word at byte 12 */
  uint32_t code_size; /**< artifact header word at byte 16 */
} zplc_retain_identity_t;

/** @brief Module configuration; the module keeps its own copy. */
typedef struct {
  uint8_t *region;        /**< the RETAIN bytes, valid for the life of the module */
  uint32_t region_size;   /**< 1 .. ZPLC_RETAIN_CAPACITY */
  int (*lock)(void);      /**< optional: makes the region coherent with the scan; 0 when taken (RT-030) */
  void (*unlock)(void);   /**< optional, with lock; called only after a lock that returned 0 */
  uint32_t min_interval_ms; /**< periodic saves closer than this are skipped; 0 disables them */
} zplc_retain_config_t;

/** @brief What the status of the runtime reports (RT-025: "the status says why"). */
typedef struct {
  zplc_retain_reason_t reason; /**< outcome of the last restore or cold reset */
  uint32_t sequence;           /**< newest sequence this module restored or wrote; 0 = none */
  uint32_t saves;              /**< records written since init */
  uint32_t save_errors;        /**< writes that failed since init */
  uint32_t saved_at_ms;        /**< caller clock at the last record written; valid when saves > 0 */
  int32_t last_error;          /**< HAL result of the last failed backend call; 0 = none */
} zplc_retain_status_t;

/**
 * @brief Reset the module and set its region, hooks and minimum interval.
 * @return 0 on success, -1 on a NULL region, a size of 0 or above the capacity.
 */
int zplc_retain_init(const zplc_retain_config_t *config);

/**
 * @brief Read the program identity from a .zplc artifact header.
 *
 * Reads the magic, the CRC word and the code size word; the loader verified the
 * rest. @return 0 on success, -1 when the buffer is too short or has no magic.
 */
int zplc_retain_identity_from_artifact(const uint8_t *artifact, size_t size,
                                       zplc_retain_identity_t *out);

/**
 * @brief Restore the region from the stored records, or initialise it.
 *
 * Call after the program is loaded and before the first scan. The region is
 * zeroed whenever the result is not ZPLC_RETAIN_RESTORED.
 *
 * @param now_ms the caller's monotonic millisecond clock
 */
zplc_retain_reason_t zplc_retain_restore(const zplc_retain_identity_t *identity,
                                         uint32_t now_ms);

/**
 * @brief Store the region as the next record when it changed.
 *
 * Reads the region under the lock hook, then writes with no lock held.
 */
zplc_retain_save_result_t zplc_retain_save(const zplc_retain_identity_t *identity,
                                           uint32_t now_ms,
                                           zplc_retain_save_mode_t mode);

/**
 * @brief Cold reset: zero the region and store it, so a restart does not bring
 *        the old values back. The reason becomes ZPLC_RETAIN_RESET.
 */
zplc_retain_save_result_t zplc_retain_cold_reset(const zplc_retain_identity_t *identity,
                                                 uint32_t now_ms);

/** @brief Copy the status. */
void zplc_retain_last_status(zplc_retain_status_t *out);

/** @brief Stable token for a reason: restored, none, identity_mismatch, ... */
const char *zplc_retain_reason_string(zplc_retain_reason_t reason);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_RETAIN_H */
