/**
 * @file zplc_program_store.h
 * @brief The durable store of the admitted program: two slots, one active pointer (RT-028, RT-031, RT-032).
 *
 * SPDX-License-Identifier: MIT
 *
 * One implementation (zplc_pstore_commit, zplc_pstore_restore), used by the firmware
 * (firmware/app/src/program_store.c) and by the host runtime (firmware/apps/posix_host/src/native_program_store.c). It sits on the HAL persistence calls, so it runs on NVS
 * on a board and on files on the host, and it holds no state of its own: the caller supplies the buffers and
 * serialises the calls.
 *
 * What is stored
 * --------------
 * Two slots, A and B. A slot is a payload (the artifact, then an 8 byte footer "ZPE1" + length) and a 32 byte
 * metadata record. A 16 byte active record names the slot that holds the program to run and its generation. All
 * records carry a CRC-32 and the format version of the runtime.
 *
 *   key                              content
 *   program_v1_slot_a_payload        payload of slot A, chunk 0
 *   program_v1_slot_a_payload_N      chunk N (1, 2, ...) of the payload of slot A, when it is longer than one chunk
 *   program_v1_slot_a_meta           "ZPS1", slot, state (1 prepared, 2 committed), generation, length, header CRC
 *   (the same three for slot B)
 *   program_v1_active                "ZPA1", slot, generation
 *   code_len, code                   the single-key program of the first firmware, read and migrated, never written
 *
 * A payload is cut into chunks of ZPLC_PROGRAM_STORE_CHUNK_SIZE bytes, each stored under its own key, because a
 * flash key-value store keeps an entry inside one erase sector (RT-028: an artifact as large as the code region,
 * 45056 bytes by default, does not fit one 4 KB sector). A payload of at most one chunk is one key, which is
 * exactly the layout of the first version of the store: a store written by it is read as it is.
 *
 * The commit
 * ----------
 * The new program is written to the slot that is not active, read back and verified; its metadata is written as
 * PREPARED and read back; then the active record is written, which is the single point at which the new program
 * becomes the one to restore; last the metadata is rewritten as COMMITTED (best effort). A power cut at any step
 * leaves the previous program restorable or the new one complete:
 *
 *   - before the active record: restore finds the previous program through the active record, or, if that
 *     record is damaged, through the newest COMMITTED slot;
 *   - a half-written slot (some chunks new, some old) is never accepted: its metadata still describes the old
 *     program, the header CRC and the footer of the payload then disagree with it, and the artifact fails its
 *     own CRC-32 and the admission check;
 *   - a PREPARED slot that the active record does not name is not a program;
 *   - an active record that names a PREPARED slot is a deploy whose last metadata write was lost: the slot is
 *     complete (it was read back) and is restored.
 *
 * The first commit of a store that has never held a program can be interrupted too: nothing was published, and
 * restore reports ZPLC_PROGRAM_STORE_EMPTY. Records that exist and verify as nothing are never mistaken for an
 * empty store: restore reports ZPLC_PROGRAM_STORE_UNVERIFIABLE and commit refuses to write over them.
 */

#ifndef ZPLC_CORE_PROGRAM_STORE_H
#define ZPLC_CORE_PROGRAM_STORE_H

#include <stddef.h>
#include <stdint.h>

#include <zplc_isa.h>

#ifdef __cplusplus
extern "C" {
#endif

/** @brief Bytes after the artifact in a payload: "ZPE1" and the artifact length. */
#define ZPLC_PROGRAM_STORE_FOOTER_SIZE 8U

/**
 * @brief The largest artifact the store keeps: the code region (RT-028).
 *
 * This is the one value the board advertises as its program size, the loader accepts, the host runtime accepts
 * and the staging buffers have room for.
 */
#define ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE ((size_t)ZPLC_MEM_CODE_SIZE)

/** @brief Largest piece of a payload stored under one key, in bytes. */
#ifdef CONFIG_ZPLC_PROGRAM_STORE_CHUNK_SIZE
#define ZPLC_PROGRAM_STORE_CHUNK_SIZE ((size_t)CONFIG_ZPLC_PROGRAM_STORE_CHUNK_SIZE)
#else
#define ZPLC_PROGRAM_STORE_CHUNK_SIZE ((size_t)1024U)
#endif

/** @brief Keys a payload of the largest artifact is stored under, per slot. */
#define ZPLC_PROGRAM_STORE_MAX_CHUNKS                                          \
  ((ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE + ZPLC_PROGRAM_STORE_FOOTER_SIZE +    \
    ZPLC_PROGRAM_STORE_CHUNK_SIZE - 1U) /                                      \
   ZPLC_PROGRAM_STORE_CHUNK_SIZE)

/**
 * @brief Backend bytes one stored entry takes beyond its data: the entry header and the padding to the write
 *        block. An engineering estimate used by the build-time capacity rule of the Zephyr HAL.
 */
#define ZPLC_PROGRAM_STORE_ENTRY_OVERHEAD 64U

/**
 * @brief Storage, in bytes, the two slots of the largest artifact and their records take, worst case.
 */
#define ZPLC_PROGRAM_STORE_WORST_CASE_BYTES                                    \
  (2U * ((size_t)ZPLC_PROGRAM_STORE_MAX_CHUNKS *                               \
         (ZPLC_PROGRAM_STORE_CHUNK_SIZE + ZPLC_PROGRAM_STORE_ENTRY_OVERHEAD)) +\
   3U * (32U + ZPLC_PROGRAM_STORE_ENTRY_OVERHEAD))

/** @brief The longest key the store uses, with its terminator. */
#define ZPLC_PROGRAM_STORE_KEY_MAX 40U

typedef enum {
  ZPLC_PROGRAM_STORE_OK = 0,      /**< a program was restored */
  ZPLC_PROGRAM_STORE_EMPTY = 1,   /**< the store never held a program, or a first deploy was interrupted */
  ZPLC_PROGRAM_STORE_LEGACY = 2,  /**< the single-key program of the first firmware was restored; commit it */
  ZPLC_PROGRAM_STORE_ERROR = -1,  /**< the persistence backend failed; nothing can be said about the store */
  /** Records exist and none of them verifies: never treated as an empty store. */
  ZPLC_PROGRAM_STORE_UNVERIFIABLE = -3,
} zplc_program_store_restore_t;

typedef enum {
  ZPLC_PROGRAM_STORE_COMMIT_OK = 0,
  ZPLC_PROGRAM_STORE_COMMIT_ERROR = -1,
  /** The active pointer may already be visible. Callers must fail safe rather than continuing with either
   *  in-memory program. */
  ZPLC_PROGRAM_STORE_COMMIT_UNKNOWN = -2,
} zplc_program_store_commit_result_t;

/**
 * @brief Decides whether an artifact may be run: the loader's verification and the policy of the runtime.
 * @return 0 admits.
 */
typedef int (*zplc_pstore_admit_fn)(const uint8_t *artifact, size_t size,
                                           void *context);

/** @brief What the store needs from the runtime that uses it. */
typedef struct {
  zplc_pstore_admit_fn admit; /**< required */
  void *admit_context;
  /** Working buffer for rollback discovery and slot reads, at least
   *  ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE + ZPLC_PROGRAM_STORE_FOOTER_SIZE bytes. */
  uint8_t *scratch;
  size_t scratch_capacity;
  /** When set, a restore that read the program from the newest slot or from a PREPARED record rewrites the active
   *  and metadata records as COMMITTED (the host runtime does; the firmware keeps its flash writes for deploys). */
  uint8_t repair_on_restore;
} zplc_pstore_config_t;

/**
 * @brief Make an admitted artifact the program to restore.
 *
 * @param workspace          the artifact in its first @p program_size bytes, with at least
 *                           ZPLC_PROGRAM_STORE_FOOTER_SIZE bytes after it; the store writes the footer and uses
 *                           the buffer to read the payload back, so its content is not preserved
 * @param program_size       1 .. ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE
 * @param workspace_capacity bytes the buffer holds
 * @return ZPLC_PROGRAM_STORE_COMMIT_OK, _ERROR (nothing was published), or _UNKNOWN
 */
int zplc_pstore_commit(const zplc_pstore_config_t *config,
                              uint8_t *workspace, size_t program_size,
                              size_t workspace_capacity);

/** @brief What the rollback of a commit is: a value of zplc_pstore_rollback_t.kind. 0 is "nothing found". */
#define ZPLC_PSTORE_ROLLBACK_NONE 0U
#define ZPLC_PSTORE_ROLLBACK_SLOT 1U   /**< a v1 slot that read back and was admitted */
#define ZPLC_PSTORE_ROLLBACK_EMPTY 2U  /**< a store that never held a program */
#define ZPLC_PSTORE_ROLLBACK_LEGACY 3U /**< the single-key program of the first firmware, read and admitted */

/**
 * @brief The rollback a commit relies on, found before the upload and checked again when it is committed.
 *
 * A commit must know, before it writes, that there is a real program to fall back to (or that the store is empty),
 * and that costs a buffer of the code size to read it into and admit it. zplc_pstore_commit() does that at the time
 * of the commit, so every caller owns a second buffer of the code size for it. A caller that has a buffer that is
 * free at the start of an upload (the staging buffer, before the first byte arrives) finds the rollback there with
 * zplc_pstore_probe(), and commits with zplc_pstore_commit_probed(), which needs no scratch: it checks that the
 * records the answer was read from are unchanged (a digest of the active record, both metadata records and what the
 * backend said for the keys of the first version) and goes on exactly as zplc_pstore_commit() does. The
 * only writer of those records is a commit, so unchanged records are an unchanged rollback; what the probe verified
 * is the payload as it was at the start of the upload.
 *
 * Zero-initialised is "nothing found", which a commit refuses. The members are the store's, not the caller's.
 */
typedef struct {
  uint32_t digest;     /**< of the records the answer was read from */
  uint32_t generation; /**< of the rollback slot, for ZPLC_PSTORE_ROLLBACK_SLOT */
  uint8_t kind;        /**< ZPLC_PSTORE_ROLLBACK_* */
  uint8_t slot;        /**< the rollback slot, for ZPLC_PSTORE_ROLLBACK_SLOT */
} zplc_pstore_rollback_t;

/**
 * @brief Find the rollback of the next commit, using @p buffer as the working buffer (the one of
 *        zplc_pstore_config_t::scratch, which this call does not need and ignores).
 *
 * Reads and admits the program that a commit would fall back to, exactly as zplc_pstore_commit() does before it
 * writes. @p buffer is overwritten.
 *
 * @param capacity  at least ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE + ZPLC_PROGRAM_STORE_FOOTER_SIZE
 * @return 0 and the rollback, or ZPLC_PROGRAM_STORE_COMMIT_ERROR with @p rollback left as "nothing found": the
 *         backend failed, or records exist and none verifies (a commit then refuses to write over them)
 */
int zplc_pstore_probe(const zplc_pstore_config_t *config, uint8_t *buffer, size_t capacity,
                      zplc_pstore_rollback_t *rollback);

/**
 * @brief zplc_pstore_commit() with the rollback of zplc_pstore_probe(), which has to be the answer for the store as
 *        it is now: when a record changed in between, nothing is written.
 */
int zplc_pstore_commit_probed(const zplc_pstore_config_t *config, const zplc_pstore_rollback_t *rollback,
                              uint8_t *workspace, size_t program_size, size_t workspace_capacity);

/**
 * @brief Find the program to run after a reset.
 *
 * @param workspace          receives the artifact; needs room for the footer after it
 * @param workspace_capacity bytes the buffer holds (an artifact of the largest size needs
 *                           ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE + ZPLC_PROGRAM_STORE_FOOTER_SIZE)
 * @param program_size       receives the artifact length when the result is OK or LEGACY, otherwise 0
 */
zplc_program_store_restore_t zplc_pstore_restore(
    const zplc_pstore_config_t *config, uint8_t *workspace,
    size_t workspace_capacity, size_t *program_size);

/**
 * @brief zplc_pstore_restore() that also leaves the rollback of the commit that follows a LEGACY result.
 *
 * The program of the first firmware was read and admitted into @p workspace by the call, so it is the rollback of
 * the commit that migrates it. For any other result @p rollback is "nothing found": the commit of an upload finds
 * its rollback with zplc_pstore_probe() when the upload starts.
 */
zplc_program_store_restore_t zplc_pstore_restore_probed(const zplc_pstore_config_t *config, uint8_t *workspace,
                                                        size_t workspace_capacity, size_t *program_size,
                                                        zplc_pstore_rollback_t *rollback);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_CORE_PROGRAM_STORE_H */
