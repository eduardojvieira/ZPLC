/**
 * @file zplc_exchange.h
 * @brief The exchange between the scan and everything outside it: a write queue and a published snapshot
 *        (RT-010, RT-011, RT-012).
 *
 * SPDX-License-Identifier: MIT
 *
 * Fieldbus servers, MQTT and the debug link run on their own threads. They must never see a value the scan is in
 * the middle of writing, never change one in the middle of a scan, and never make the scan wait for them. The
 * exchange gives them two things, and nothing else touches the live regions from outside the scan:
 *
 *   - a READ comes from the snapshot: a copy of IPI, OPI, WORK and RETAIN that the scan publishes once per scan,
 *     at the output commit, and after every control-plane change of the memory (stop, load, force). A multi-byte
 *     value in the snapshot is whole: it was copied between scans, and the copy and every read are made under one
 *     short lock;
 *   - a WRITE is queued, whole, and applied by the scan at the input latch of its next scan, through the
 *     force-aware interface of the core (zplc_force_write_bytes): a forced variable keeps its forced value. While
 *     no scan is running (STOP, pause, fault) there is no latch to wait for, and the write is applied at once,
 *     under the lock of the image, and published.
 *
 * The lock of the exchange is held for a bounded copy and for nothing else: not across hardware I/O, not across a
 * log line, not across the execution of a task.
 *
 * Lock order, everywhere: image lock (the scheduler's), then exchange lock. The exchange never takes the image
 * lock while it holds its own.
 */

#ifndef ZPLC_EXCHANGE_H
#define ZPLC_EXCHANGE_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/** @brief Bytes of the write queue: the data of the queued writes and four bytes of header for each. */
#ifdef CONFIG_ZPLC_EXCHANGE_QUEUE_BYTES
#define ZPLC_EXCHANGE_QUEUE_BYTES ((size_t)CONFIG_ZPLC_EXCHANGE_QUEUE_BYTES)
#else
#define ZPLC_EXCHANGE_QUEUE_BYTES ((size_t)1024U)
#endif

/** @brief Error: the queue has no room for the write; nothing was queued. */
#define ZPLC_EXCHANGE_ERR_FULL (-28)
/** @brief Error: the extent is not inside one region of PLC memory, or has no bytes. */
#define ZPLC_EXCHANGE_ERR_RANGE (-22)
/** @brief Error: the exchange has no lock (not initialised), or the lock could not be taken. */
#define ZPLC_EXCHANGE_ERR_LOCK (-16)

/** @brief What the scheduler lends the exchange. All three are optional. */
typedef struct {
  /** Takes the lock of the image; returns 0 when held. Used to apply a write when no scan is running. */
  int (*lock_image)(void);
  void (*unlock_image)(void);
  /** Returns non-zero while scans are running, so that writes are queued for the next input latch. */
  int (*scan_active)(void);
} zplc_exchange_hooks_t;

/**
 * @brief Create the lock and empty the queue and the snapshot. Safe to call again: it resets.
 * @return 0, or ZPLC_EXCHANGE_ERR_LOCK when the lock could not be created.
 */
int zplc_exchange_init(const zplc_exchange_hooks_t *hooks);

/**
 * @brief Write PLC memory from outside the scan.
 *
 * Queued for the next input latch while scans run; applied at once otherwise. The extent has to lie inside one
 * region (see zplc_mem_extent.h); a write that does not is refused here and not later. A write is whole: it is
 * queued with all its bytes or not at all.
 *
 * @return 0, ZPLC_EXCHANGE_ERR_RANGE, ZPLC_EXCHANGE_ERR_FULL or ZPLC_EXCHANGE_ERR_LOCK
 */
int zplc_exchange_write(uint16_t addr, const uint8_t *bytes, uint16_t size);

/**
 * @brief Several writes that succeed or fail together (a Modbus write of several registers).
 *
 * zplc_exchange_write_begin() reserves room for @p records writes of @p bytes bytes in all and takes the lock;
 * zplc_exchange_write_add() queues one of them; zplc_exchange_write_end() releases the lock. A reservation that
 * does not fit is refused with nothing queued, so the adds that follow cannot fail for lack of room. While no scan
 * is running the adds apply at once (under the image lock the begin took).
 *
 * @return begin: 0, ZPLC_EXCHANGE_ERR_FULL or ZPLC_EXCHANGE_ERR_LOCK; add: 0 or ZPLC_EXCHANGE_ERR_RANGE
 */
int zplc_exchange_write_begin(size_t records, size_t bytes);
int zplc_exchange_write_add(uint16_t addr, const uint8_t *bytes, uint16_t size);
void zplc_exchange_write_end(void);

/**
 * @brief Read PLC memory from the snapshot published at the last commit.
 * @return 0, ZPLC_EXCHANGE_ERR_RANGE or ZPLC_EXCHANGE_ERR_LOCK
 */
int zplc_exchange_read(uint16_t addr, uint8_t *out, uint16_t size);

/**
 * @brief Several reads of one publication (a Modbus read of several tags, an MQTT payload).
 *
 * Between lock and unlock no scan publishes, so every read is of the same scan. Do not call
 * zplc_exchange_read() or a write inside the pair.
 */
int zplc_exchange_read_lock(void);
int zplc_exchange_read_locked(uint16_t addr, uint8_t *out, uint16_t size);
void zplc_exchange_read_unlock(void);

/**
 * @brief The scan's input latch: apply every queued write, in order, through the force-aware interface.
 *
 * Called by the scan with the image lock held, before the inputs of the cycle are written.
 * @return number of writes applied
 */
size_t zplc_exchange_latch(void);

/**
 * @brief Publish the live regions as the snapshot. Called with the image lock held, at the output commit and
 *        after a control-plane change of the memory.
 */
void zplc_exchange_publish(void);

/** @brief Writes applied at a latch, writes applied at once, and writes refused for lack of room, since init. */
typedef struct {
  uint32_t latched;
  uint32_t immediate;
  uint32_t refused;
  uint32_t publications;
} zplc_exchange_stats_t;

void zplc_exchange_get_stats(zplc_exchange_stats_t *stats);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_EXCHANGE_H */
