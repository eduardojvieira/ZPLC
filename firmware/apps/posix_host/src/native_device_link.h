/**
 * @file native_device_link.h
 * @brief The device link protocol (COM-019) served by the POSIX host runtime.
 *
 * The runtime speaks it on standard input and output with --device-link: binary frames, no JSON. The engine is
 * the one the firmware uses (zplc_proto_dev.c); this file is its port over the session of the simulator, so a
 * request of the link reaches the same code as the same request of the JSON session.
 */

#ifndef ZPLC_NATIVE_DEVICE_LINK_H
#define ZPLC_NATIVE_DEVICE_LINK_H

#include <stddef.h>
#include <stdint.h>

#include <zplc_proto_dev.h>

#include "native_runtime_session.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    zplc_native_runtime_session_t *session;
    uint8_t key[ZPLC_PROTO_KEY_BYTES];
    int key_set;
    /* a program being transferred */
    uint8_t *staged;
    uint32_t staged_expected;
    uint32_t staged_size;
    uint32_t started_ms;
} zplc_native_device_link_port_t;

/** Fill the table of the engine with the session of the simulator. */
void zplc_native_device_link_port_init(zplc_native_device_link_port_t *port,
                                       zplc_native_runtime_session_t *session,
                                       zplc_proto_ops_t *ops);

void zplc_native_device_link_port_release(zplc_native_device_link_port_t *port);

/**
 * Serve the link on standard input and output until the input ends or the session asks to exit.
 *
 * @param network 1 to treat the link as a network link (every session authenticated): the way the host exercises
 *                the rules of a network transport without a socket.
 * @return process exit status
 */
int zplc_native_device_link_run(zplc_native_runtime_session_t *session, int network);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_NATIVE_DEVICE_LINK_H */
