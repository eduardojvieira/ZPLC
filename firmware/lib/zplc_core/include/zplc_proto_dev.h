/**
 * @file zplc_proto_dev.h
 * @brief The device side of the device link protocol: sessions, authenticated frames, atomic writes, events
 *        (COM-020, COM-021, COM-023, COM-025, COM-028).
 *
 * SPDX-License-Identifier: MIT
 *
 * The engine takes frames from one or more links (a UART, a USB serial port, a TCP connection), answers them, and
 * turns them into calls of the port it was given (zplc_proto_ops_t). It knows nothing of Zephyr, of the scheduler
 * or of the host runtime: a port fills the table, so the same engine runs on a board, on the host runtime and in
 * the tests, and the rules below are proved once.
 *
 * The rules:
 *
 *  - Everything that changes the device (download, RUN/STOP, memory write, force, configuration, credentials, the
 *    key) needs a session that is open on the link it arrives on. One session is open at a time. A session ends
 *    when its client closes it, when nothing arrives for the idle time, when the link is lost, when a person at
 *    the serial link takes it over, and when the key is changed. The forces the session set end with it and the
 *    outputs follow the program again.
 *  - A link is SERIAL (whoever holds the cable holds the device) or NETWORK. On a network link every message
 *    except HELLO, IDENTITY, CHALLENGE and LINK_STATS needs a session that was opened with a code under the key
 *    that was provisioned over the serial link, and every frame of that session carries a code (HMAC-SHA-256) that
 *    covers its header, its payload and so its sequence number. A frame with a wrong or missing code, a repeated
 *    sequence number or one that is not the next, is dropped, counted and not answered.
 *  - A write of a multi-byte value goes through ops->mem_write, which a port binds to the write queue of the
 *    exchange: it is applied at the input latch of the next scan, whole.
 *  - The engine is called from one thread at a time (the port serialises it); zplc_proto_log() and
 *    zplc_proto_event_post() may be called from any thread when the port gives the event try-lock.
 *  - Nothing the engine does is on the scan: it has no hook in the scheduler. Telemetry is read by the engine's
 *    own service call, from a low priority context, and a queue that is full drops and counts.
 *
 * Portable C99: no Zephyr header, no allocation.
 */

#ifndef ZPLC_PROTO_DEV_H
#define ZPLC_PROTO_DEV_H

#include <stddef.h>
#include <stdint.h>

#include "zplc_proto.h"
#include "zplc_sha256.h"

#ifdef __cplusplus
extern "C" {
#endif

/** @brief Events the engine can hold until the link pump sends them. Kconfig sets it per board. */
#ifdef CONFIG_ZPLC_PROTO_EVENT_QUEUE
#define ZPLC_PROTO_EVENT_QUEUE ((size_t)CONFIG_ZPLC_PROTO_EVENT_QUEUE)
#else
#define ZPLC_PROTO_EVENT_QUEUE ((size_t)ZPLC_PROTO_EVENT_QUEUE_DEFAULT)
#endif

/** @brief Forces one session can own (the force table of the core has this many entries). */
#define ZPLC_PROTO_OWNED_FORCES 8U

/** @brief What the port tells about the runtime. The engine compares successive values to produce events. */
typedef struct {
  uint8_t state;              /**< ZPLC_PROTO_RUN_STATE_* */
  uint8_t fault;              /**< ZPLC_PROTO_FAULT_* */
  uint8_t program_loaded;
  uint8_t forces;
  uint32_t cycles;
  uint32_t overruns;
  uint32_t program_size;
  uint32_t program_generation;
  uint32_t uptime_ms;
  uint8_t break_hit;          /**< 1 while the runtime is stopped at a breakpoint */
  uint8_t break_task;
  uint16_t break_pc;
  uint8_t fault_task;
  uint16_t fault_code;
} zplc_proto_status_t;

typedef struct {
  uint16_t abi_major;
  uint16_t abi_minor;
  uint32_t draft_counter;
  uint32_t io_hash;
  uint16_t io_input_bytes;
  uint16_t io_output_bytes;
  uint16_t io_channels;
  uint32_t code_size_max;
  uint32_t work_size;
  uint32_t retain_size;
  uint32_t ipi_size;
  uint32_t opi_size;
  const char *product_version;
  const char *board;
  const char *board_profile;
  const char *io_board_id;
} zplc_proto_identity_t;

typedef struct {
  uint8_t loaded;
  uint32_t size;
  uint32_t crc32;
  uint32_t generation;
} zplc_proto_program_info_t;

/** @brief One extent of a batched read. */
typedef struct {
  uint16_t address;
  uint16_t length;
} zplc_proto_extent_t;

/**
 * @brief What a port gives the engine. Every call returns 0, or a ZPLC_PROTO_ERR_* number that the engine sends
 *        as the status of the response. A member that is NULL means the capability is not there: the engine clears
 *        its bit in the hello and answers ERR_UNSUPPORTED.
 */
typedef struct {
  void *context;

  uint32_t (*now_ms)(void *context);                                    /**< required */
  int (*random)(void *context, uint8_t *out, size_t length);            /**< cryptographic bytes; NULL: no authenticated sessions */

  int (*key_load)(void *context, uint8_t key[ZPLC_PROTO_KEY_BYTES]);    /**< 0 when a key is held */
  int (*key_store)(void *context, const uint8_t key[ZPLC_PROTO_KEY_BYTES]);
  int (*key_erase)(void *context);

  int (*status)(void *context, zplc_proto_status_t *status);
  int (*identity)(void *context, zplc_proto_identity_t *identity);

  /** Snapshot read: the memory as the last scan published it. */
  int (*mem_read)(void *context, uint16_t address, uint8_t *out, uint16_t length);
  /** Every extent from one scan; NULL makes the engine call mem_read for each. Returns the scan counter. */
  int (*mem_read_many)(void *context, const zplc_proto_extent_t *extents, size_t count, uint8_t *out,
                       uint32_t *scan);
  /** Whole with respect to the scan: queued and applied at the next input latch (zplc_exchange_write). */
  int (*mem_write)(void *context, uint16_t address, const uint8_t *data, uint16_t length);

  int (*force_set)(void *context, uint16_t address, const uint8_t *data, uint16_t length);
  int (*force_clear)(void *context, uint16_t address);
  int (*force_clear_all)(void *context);
  int (*force_get)(void *context, uint8_t index, uint16_t *address, uint16_t *size, uint8_t *data);

  int (*run)(void *context);
  int (*stop)(void *context);
  int (*pause)(void *context);
  int (*resume)(void *context);
  int (*step)(void *context);
  int (*reset)(void *context);

  int (*bp_add)(void *context, uint16_t pc);
  int (*bp_remove)(void *context, uint16_t pc);
  int (*bp_clear)(void *context);
  int (*bp_list)(void *context, uint16_t *pcs, size_t capacity, size_t *count);

  int (*program_begin)(void *context, uint32_t size);
  int (*program_chunk)(void *context, uint32_t offset, const uint8_t *data, uint16_t length);
  /** Verify, store and activate; the program stays stopped. Fills what the device holds, read back. */
  int (*program_commit)(void *context, zplc_proto_program_info_t *info);
  void (*program_abort)(void *context);
  int (*program_info)(void *context, zplc_proto_program_info_t *info);

  int (*config_set)(void *context, const char *key, const uint8_t *value, uint16_t length);
  int (*config_save)(void *context);
  int (*config_reset)(void *context);

  int (*cred_begin)(void *context, uint8_t kind, uint16_t size);
  int (*cred_chunk)(void *context, const uint8_t *data, uint16_t length);
  int (*cred_commit)(void *context);
  int (*cred_erase)(void *context, uint8_t kind);
  void (*cred_abort)(void *context);

  /** Optional: a try-lock for the event queue, so that zplc_proto_log() may be called from any thread. */
  int (*event_lock)(void *context);
  void (*event_unlock)(void *context);
} zplc_proto_ops_t;

typedef struct zplc_proto_dev zplc_proto_dev_t;
typedef struct zplc_proto_link zplc_proto_link_t;

/** @brief Send one whole frame; returns 0 when it was handed to the transport. */
typedef int (*zplc_proto_write_fn)(void *context, const uint8_t *frame, size_t length);

/** @brief The counters of one link (the LINK_STATS message). */
typedef struct {
  uint32_t frames_in;
  uint32_t frames_out;
  uint32_t auth_drops;
  uint32_t replay_drops;
  uint32_t order_drops;
  uint32_t events_sent;
  uint32_t events_dropped;
  uint32_t sessions_opened;
} zplc_proto_link_stats_t;

typedef struct {
  uint8_t id;
  uint8_t length;
  uint8_t data[ZPLC_PROTO_EVENT_PAYLOAD_MAX];
} zplc_proto_event_t;

struct zplc_proto_link {
  zplc_proto_dev_t *dev;
  uint8_t transport;
  zplc_proto_write_fn write;
  void *write_context;
  /** The largest payload this link takes in a response: the smaller of the two maxima of the hello. */
  size_t payload_max;
  uint32_t event_mask;
  uint32_t event_seq;
  uint32_t rx_seq;
  zplc_proto_link_stats_t stats;
  zplc_proto_decoder_t decoder;
};

struct zplc_proto_dev {
  const zplc_proto_ops_t *ops;
  uint32_t capabilities;
  uint16_t idle_timeout_s;

  /* session */
  uint8_t session_open;
  uint8_t session_authenticated;
  zplc_proto_link_t *owner;
  uint32_t session_id;
  uint32_t last_session_id;
  uint32_t last_activity_ms;
  uint8_t session_key[ZPLC_PROTO_KEY_BYTES];
  uint16_t owned[ZPLC_PROTO_OWNED_FORCES];
  uint8_t owned_count;

  /* challenge */
  uint8_t challenge[ZPLC_PROTO_NONCE_BYTES];
  uint8_t challenge_valid;
  uint32_t challenge_ms;

  /* program transfer and credential upload */
  uint8_t transfer_active;
  uint32_t transfer_size;
  uint32_t transfer_received;
  uint32_t transfer_crc;
  uint32_t transfer_crc_state;
  uint8_t cred_active;
  uint16_t cred_size;
  uint16_t cred_received;

  /* watch */
  uint8_t watch_count;
  uint16_t watch_period_ms;
  uint32_t watch_last_ms;
  zplc_proto_link_t *watch_link;
  zplc_proto_extent_t watch_extents[ZPLC_PROTO_WATCH_ENTRIES_MAX];
  uint8_t watch_last[ZPLC_PROTO_EVENT_PAYLOAD_MAX];
  uint8_t watch_have_last;

  /* events */
  zplc_proto_event_t queue[ZPLC_PROTO_EVENT_QUEUE];
  size_t queue_head;
  size_t queue_count;
  uint32_t dropped_since_report;
  uint32_t dropped_total;
  zplc_proto_status_t previous;
  uint8_t have_previous;
  uint8_t known_forces;

  /* the response being built: a handler writes its fields straight into it, so no handler needs stack for a frame */
  uint8_t tx[ZPLC_PROTO_FRAME_MAX];
};

/**
 * @brief Start the engine over a port.
 * @return 0, or -1 when the port has no clock
 */
int zplc_proto_dev_init(zplc_proto_dev_t *dev, const zplc_proto_ops_t *ops, uint16_t idle_timeout_s);

/** @brief Attach a link. `write` is called once per frame. */
void zplc_proto_link_init(zplc_proto_link_t *link, zplc_proto_dev_t *dev, uint8_t transport,
                          zplc_proto_write_fn write, void *write_context);

/** @brief Bytes that arrived on a stream link. */
void zplc_proto_link_feed(zplc_proto_link_t *link, const uint8_t *data, size_t length);

/**
 * @brief One whole frame that arrived on a link that frames its own lines.
 *
 * The payload of a KEY_SET frame is overwritten once it has been used: the caller's buffer does not keep a key.
 * @return 0 when the frame was valid and handled (a refusal is a valid frame), or a ZPLC_PROTO_PARSE_* code
 */
int zplc_proto_link_feed_frame(zplc_proto_link_t *link, uint8_t *frame, size_t length);

/** @brief The link is gone: its session ends, its forces are released. */
void zplc_proto_link_lost(zplc_proto_link_t *link);

/**
 * @brief Time passes: idle timeouts, telemetry produced from the runtime's status, watch batches, and the events
 *        in the queue sent to the links that asked for them.
 *
 * Call it about every 20 ms from a context that is not the scan. @p links is an array of @p link_count links.
 */
void zplc_proto_dev_service(zplc_proto_dev_t *dev, zplc_proto_link_t *const *links, size_t link_count);

/** @brief Queue an event. Returns 0, or -1 when it was dropped (and counted). Callable from any thread. */
int zplc_proto_event_post(zplc_proto_dev_t *dev, uint8_t id, const uint8_t *data, size_t length);

/** @brief Queue a log line (cut to fit). Callable from any thread. */
void zplc_proto_log(zplc_proto_dev_t *dev, uint8_t level, const char *text);

/** @brief Whether a session is open (a port uses it to apply the same rule to its own commands). */
int zplc_proto_session_is_open(const zplc_proto_dev_t *dev);

/** @brief End the session now (a port that must, for example before a reboot). */
void zplc_proto_session_end(zplc_proto_dev_t *dev, uint8_t reason);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_PROTO_DEV_H */
