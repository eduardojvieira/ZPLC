/**
 * @file native_device_link.c
 * @brief The POSIX host runtime as a device of the device link protocol (COM-019 to COM-025, COM-028).
 */

#define _POSIX_C_SOURCE 200809L

#include "native_device_link.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifndef _WIN32
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <unistd.h>
#endif

#include <zplc_bytes.h>
#include <zplc_core.h>
#include <zplc_crc32.h>
#include <zplc_ed25519.h>
#include <zplc_fw_identity.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_proto.h>
#include <zplc_sha256.h>

#define LINK_REQUEST_ID "link"

/* ------------------------------------------------------------------------------------------------------------- */
/* Requests of the JSON session, as the one implementation of run control and program loading                    */
/* ------------------------------------------------------------------------------------------------------------- */

/* Returns 0, or the ZPLC_PROTO_ERR_* that the session's error code stands for. */
static int session_call(zplc_native_runtime_session_t *session, const char *method, const char *params)
{
    char request[256];
    char response[ZPLC_NATIVE_RESPONSE_MAX];
    char event[ZPLC_NATIVE_EVENT_MAX];
    const char *code;

    (void)snprintf(request, sizeof(request),
                   "{\"id\":\"" LINK_REQUEST_ID "\",\"type\":\"request\",\"method\":\"%s\",\"params\":%s}", method,
                   params);
    response[0] = '\0';
    event[0] = '\0';
    (void)zplc_native_runtime_session_handle_request(session, request, response, sizeof(response), event,
                                                     sizeof(event));
    code = strstr(response, "\"error\":{\"code\":\"");
    if (code == NULL) {
        return 0;
    }
    code += strlen("\"error\":{\"code\":\"");
    if (strncmp(code, "INVALID_STATE", 13) == 0) {
        return (int)ZPLC_PROTO_ERR_STATE;
    }
    if (strncmp(code, "PROGRAM_LOAD_FAILED", 19) == 0) {
        return (int)ZPLC_PROTO_ERR_PROGRAM_INVALID;
    }
    if (strncmp(code, "INVALID_REQUEST", 15) == 0) {
        return (int)ZPLC_PROTO_ERR_BAD_REQUEST;
    }
    return (int)ZPLC_PROTO_ERR_FAILED;
}

static const char hex_digits[] = "0123456789ABCDEF";

static int load_program(zplc_native_runtime_session_t *session, const uint8_t *bytes, size_t size)
{
    const size_t request_size = size * 2U + 160U;
    char *request = (char *)malloc(request_size);
    char *response = (char *)malloc(ZPLC_NATIVE_RESPONSE_MAX);
    char *event = (char *)malloc(ZPLC_NATIVE_EVENT_MAX);
    size_t used;
    size_t i;
    int result = (int)ZPLC_PROTO_ERR_FAILED;

    if (request == NULL || response == NULL || event == NULL) {
        goto done;
    }
    used = (size_t)snprintf(request, request_size,
                            "{\"id\":\"" LINK_REQUEST_ID "\",\"type\":\"request\",\"method\":\"program.load\","
                            "\"params\":{\"bytecode_hex\":\"");
    for (i = 0U; i < size; i++) {
        request[used++] = hex_digits[bytes[i] >> 4];
        request[used++] = hex_digits[bytes[i] & 0x0FU];
    }
    used += (size_t)snprintf(request + used, request_size - used, "\"}}");
    response[0] = '\0';
    event[0] = '\0';
    (void)zplc_native_runtime_session_handle_request(session, request, response, ZPLC_NATIVE_RESPONSE_MAX, event,
                                                     ZPLC_NATIVE_EVENT_MAX);
    if (strstr(response, "\"error\"") == NULL) {
        result = 0;
    } else if (strstr(response, "INVALID_STATE") != NULL) {
        result = (int)ZPLC_PROTO_ERR_STATE;
    } else if (strstr(response, "PROGRAM_LOAD_FAILED") != NULL) {
        result = (int)ZPLC_PROTO_ERR_PROGRAM_INVALID;
    }
done:
    free(request);
    free(response);
    free(event);
    return result;
}

/* ------------------------------------------------------------------------------------------------------------- */
/* The port                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------- */

static zplc_native_device_link_port_t *port_of(void *context)
{
    return (zplc_native_device_link_port_t *)context;
}

static uint32_t p_now_ms(void *context)
{
    (void)context;
    return zplc_hal_tick();
}

static int p_random(void *context, uint8_t *out, size_t length)
{
#ifndef _WIN32
    const int fd = open("/dev/urandom", O_RDONLY);
    size_t got = 0U;

    (void)context;
    if (fd < 0) {
        return -1;
    }
    while (got < length) {
        const ssize_t n = read(fd, out + got, length - got);

        if (n <= 0) {
            (void)close(fd);
            return -1;
        }
        got += (size_t)n;
    }
    (void)close(fd);
    return 0;
#else
    (void)context;
    (void)out;
    (void)length;
    return -1;
#endif
}

static int p_key_load(void *context, uint8_t key[ZPLC_PROTO_KEY_BYTES])
{
    zplc_native_device_link_port_t *port = port_of(context);

    if (!port->key_set) {
        return 1;
    }
    memcpy(key, port->key, ZPLC_PROTO_KEY_BYTES);
    return 0;
}

static int p_key_store(void *context, const uint8_t key[ZPLC_PROTO_KEY_BYTES])
{
    zplc_native_device_link_port_t *port = port_of(context);

    /* The simulator keeps the key for the life of the process: it has no protected storage to put it in. */
    memcpy(port->key, key, ZPLC_PROTO_KEY_BYTES);
    port->key_set = 1;
    return 0;
}

static int p_key_erase(void *context)
{
    zplc_native_device_link_port_t *port = port_of(context);

    zplc_secure_zero(port->key, ZPLC_PROTO_KEY_BYTES);
    port->key_set = 0;
    return 0;
}

static int p_signing_key_load(void *context, uint8_t key[ZPLC_PROTO_KEY_BYTES])
{
    zplc_native_device_link_port_t *port = port_of(context);

    if (!port->signing_key_set) {
        return 1;
    }
    memcpy(key, port->signing_key, ZPLC_PROTO_KEY_BYTES);
    return 0;
}

static int p_signing_key_store(void *context, const uint8_t key[ZPLC_PROTO_KEY_BYTES])
{
    zplc_native_device_link_port_t *port = port_of(context);

    memcpy(port->signing_key, key, ZPLC_PROTO_KEY_BYTES);
    port->signing_key_set = 1;
    return 0;
}

static int p_signing_key_erase(void *context)
{
    zplc_native_device_link_port_t *port = port_of(context);

    memset(port->signing_key, 0, ZPLC_PROTO_KEY_BYTES);
    port->signing_key_set = 0;
    return 0;
}

/* The bytes that were staged are the bytes the loader is given: the signature is of those. */
static int p_program_verify(void *context, const uint8_t key[ZPLC_PROTO_KEY_BYTES], const uint8_t signature[64])
{
    zplc_native_device_link_port_t *port = port_of(context);

    if (port->staged == NULL) {
        return (int)ZPLC_PROTO_ERR_STATE;
    }
    return zplc_ed25519_verify(signature, key, port->staged, port->staged_size) == 0
               ? 0
               : (int)ZPLC_PROTO_ERR_SIGNATURE_INVALID;
}

static int p_status(void *context, zplc_proto_status_t *status)
{
    const zplc_native_runtime_session_t *s = port_of(context)->session;

    memset(status, 0, sizeof(*status));
    switch (s->state) {
    case ZPLC_NATIVE_SESSION_RUNNING:
        status->state = ZPLC_PROTO_RUN_STATE_RUNNING;
        break;
    case ZPLC_NATIVE_SESSION_PAUSED:
        status->state = ZPLC_PROTO_RUN_STATE_PAUSED;
        break;
    case ZPLC_NATIVE_SESSION_ERROR:
        status->state = ZPLC_PROTO_RUN_STATE_FAULT;
        break;
    default:
        status->state = ZPLC_PROTO_RUN_STATE_STOPPED;
        break;
    }
    switch (s->fault_reason) {
    case ZPLC_NATIVE_FAULT_DEADLINE_MISS:
        status->fault = ZPLC_PROTO_FAULT_DEADLINE;
        break;
    case ZPLC_NATIVE_FAULT_VM:
        status->fault = ZPLC_PROTO_FAULT_VM;
        break;
    case ZPLC_NATIVE_FAULT_RUNTIME:
        status->fault = ZPLC_PROTO_FAULT_RUNTIME;
        break;
    default:
        status->fault = ZPLC_PROTO_FAULT_NONE;
        break;
    }
    status->program_loaded = s->program_loaded;
    status->forces = zplc_force_get_count();
    status->cycles = s->cycle_count;
    status->overruns = s->overrun_count;
    status->program_size = s->program_size;
    status->program_generation = s->program_generation;
    status->uptime_ms = zplc_hal_tick() - port_of(context)->started_ms;
    status->fault_task = (uint8_t)s->fault_task_id;
    return 0;
}

static int p_identity(void *context, zplc_proto_identity_t *id)
{
    const zplc_io_table_t *table = zplc_io_table();

    (void)context;
    id->abi_major = (uint16_t)ZPLC_VERSION_MAJOR;
    id->abi_minor = (uint16_t)ZPLC_VERSION_MINOR;
    id->draft_counter = (uint32_t)ZPLC_DRAFT_COUNTER;
    id->io_hash = table->description_hash;
    id->io_input_bytes = table->input_bytes;
    id->io_output_bytes = table->output_bytes;
    id->io_channels = table->channel_count;
    id->code_size_max = ZPLC_MEM_CODE_SIZE;
    id->work_size = ZPLC_MEM_WORK_SIZE;
    id->retain_size = ZPLC_MEM_RETAIN_SIZE;
    id->ipi_size = ZPLC_MEM_IPI_SIZE;
    id->opi_size = ZPLC_MEM_OPI_SIZE;
    id->product_version = ZPLC_FW_VERSION;
    id->board = "native-posix";
    id->board_profile = ZPLC_FW_BOARD;
    id->io_board_id = table->board_id;
    return 0;
}

/* The engine checked that the extent is inside one region; the region says where its bytes are. */
static uint8_t *bytes_at(uint16_t address, uint16_t *room)
{
    uint16_t base;
    uint16_t size;

    if (address >= ZPLC_MEM_RETAIN_BASE) {
        base = ZPLC_MEM_RETAIN_BASE;
        size = (uint16_t)ZPLC_MEM_RETAIN_SIZE;
    } else if (address >= ZPLC_MEM_WORK_BASE) {
        base = ZPLC_MEM_WORK_BASE;
        size = (uint16_t)ZPLC_MEM_WORK_SIZE;
    } else if (address >= ZPLC_MEM_OPI_BASE) {
        base = ZPLC_MEM_OPI_BASE;
        size = (uint16_t)ZPLC_MEM_OPI_SIZE;
    } else {
        base = ZPLC_MEM_IPI_BASE;
        size = (uint16_t)ZPLC_MEM_IPI_SIZE;
    }
    {
        uint8_t *region = zplc_mem_get_region(base);

        if (region == NULL || (uint16_t)(address - base) >= size) {
            return NULL;
        }
        *room = (uint16_t)(size - (address - base));
        return region + (address - base);
    }
}

static int p_mem_read(void *context, uint16_t address, uint8_t *out, uint16_t length)
{
    uint16_t room = 0U;
    const uint8_t *from = bytes_at(address, &room);

    (void)context;
    if (from == NULL || length > room) {
        return (int)ZPLC_PROTO_ERR_RANGE;
    }
    memcpy(out, from, length);
    return 0;
}

/* The host runtime scans in the thread that serves the link, between two requests: a write is whole with
 * respect to the scan by construction, and it goes through the force-aware write like every other. */
static int p_mem_write(void *context, uint16_t address, const uint8_t *data, uint16_t length)
{
    (void)context;
    return zplc_force_write_bytes(address, data, length) == 0 ? 0 : (int)ZPLC_PROTO_ERR_RANGE;
}

static int p_force_set(void *context, uint16_t address, const uint8_t *data, uint16_t length)
{
    (void)context;
    return zplc_force_set_bytes(address, data, length) == 0 ? 0 : (int)ZPLC_PROTO_ERR_FULL;
}

static int p_force_clear(void *context, uint16_t address)
{
    (void)context;
    return zplc_force_clear(address) == 0 ? 0 : (int)ZPLC_PROTO_ERR_RANGE;
}

static int p_force_clear_all(void *context)
{
    (void)context;
    zplc_force_clear_all();
    return 0;
}

static int p_force_get(void *context, uint8_t index, uint16_t *address, uint16_t *size, uint8_t *data)
{
    (void)context;
    return zplc_force_get(index, address, size, data, ZPLC_FORCE_MAX_BYTES) == 0 ? 0 : (int)ZPLC_PROTO_ERR_FAILED;
}

static int p_run(void *context) { return session_call(port_of(context)->session, "execution.start", "{}"); }
static int p_stop(void *context) { return session_call(port_of(context)->session, "execution.stop", "{}"); }
static int p_pause(void *context) { return session_call(port_of(context)->session, "execution.pause", "{}"); }
static int p_resume(void *context) { return session_call(port_of(context)->session, "execution.resume", "{}"); }
static int p_step(void *context) { return session_call(port_of(context)->session, "execution.step", "{}"); }
static int p_reset(void *context) { return session_call(port_of(context)->session, "execution.reset", "{}"); }

static int p_bp_add(void *context, uint16_t pc)
{
    char params[48];

    (void)snprintf(params, sizeof(params), "{\"pc\":%u}", (unsigned)pc);
    return session_call(port_of(context)->session, "breakpoint.add", params);
}

static int p_bp_remove(void *context, uint16_t pc)
{
    char params[48];

    (void)snprintf(params, sizeof(params), "{\"pc\":%u}", (unsigned)pc);
    return session_call(port_of(context)->session, "breakpoint.remove", params);
}

static int p_bp_clear(void *context) { return session_call(port_of(context)->session, "breakpoint.clear", "{}"); }

static int p_bp_list(void *context, uint16_t *pcs, size_t capacity, size_t *count)
{
    zplc_vm_t *vm = zplc_core_get_default_vm();
    size_t total;
    size_t i;

    (void)context;
    if (vm == NULL) {
        *count = 0U;
        return 0;
    }
    total = zplc_vm_get_breakpoint_count(vm);
    for (i = 0U; i < total && i < capacity; i++) {
        pcs[i] = zplc_vm_get_breakpoint(vm, (uint8_t)i);
    }
    *count = total;
    return 0;
}

static void drop_staged(zplc_native_device_link_port_t *port)
{
    free(port->staged);
    port->staged = NULL;
    port->staged_size = 0U;
    port->staged_expected = 0U;
}

static int p_program_begin(void *context, uint32_t size)
{
    zplc_native_device_link_port_t *port = port_of(context);

    if (port->session->state != ZPLC_NATIVE_SESSION_IDLE) {
        return (int)ZPLC_PROTO_ERR_STATE; /* a program is replaced while the runtime is stopped */
    }
    drop_staged(port);
    port->staged = (uint8_t *)malloc(size);
    if (port->staged == NULL) {
        return (int)ZPLC_PROTO_ERR_FAILED;
    }
    port->staged_expected = size;
    return 0;
}

static int p_program_chunk(void *context, uint32_t offset, const uint8_t *data, uint16_t length)
{
    zplc_native_device_link_port_t *port = port_of(context);

    if (port->staged == NULL || (uint64_t)offset + length > port->staged_expected) {
        return (int)ZPLC_PROTO_ERR_STATE;
    }
    memcpy(port->staged + offset, data, length);
    port->staged_size = offset + length;
    return 0;
}

static int p_program_info(void *context, zplc_proto_program_info_t *info)
{
    const zplc_native_runtime_session_t *s = port_of(context)->session;

    memset(info, 0, sizeof(*info));
    info->loaded = s->program_loaded;
    info->size = s->program_size;
    info->crc32 = s->program_loaded != 0U ? zplc_crc32(s->program, s->program_size) : 0U;
    info->generation = s->program_generation;
    return 0;
}

static int p_program_commit(void *context, zplc_proto_program_info_t *info)
{
    zplc_native_device_link_port_t *port = port_of(context);
    int result;

    if (port->staged == NULL || port->staged_size != port->staged_expected) {
        return (int)ZPLC_PROTO_ERR_STATE;
    }
    result = load_program(port->session, port->staged, port->staged_size);
    drop_staged(port);
    if (result != 0) {
        return result;
    }
    /* what the simulator now holds, read back from its own copy */
    return p_program_info(context, info);
}

static void p_program_abort(void *context)
{
    drop_staged(port_of(context));
}

void zplc_native_device_link_port_init(zplc_native_device_link_port_t *port,
                                       zplc_native_runtime_session_t *session,
                                       zplc_proto_ops_t *ops)
{
    memset(port, 0, sizeof(*port));
    port->session = session;
    port->started_ms = zplc_hal_tick();
    memset(ops, 0, sizeof(*ops));
    ops->context = port;
    ops->now_ms = p_now_ms;
    ops->random = p_random;
    ops->key_load = p_key_load;
    ops->key_store = p_key_store;
    ops->key_erase = p_key_erase;
    ops->status = p_status;
    ops->identity = p_identity;
    ops->mem_read = p_mem_read;
    ops->mem_write = p_mem_write;
    ops->force_set = p_force_set;
    ops->force_clear = p_force_clear;
    ops->force_clear_all = p_force_clear_all;
    ops->force_get = p_force_get;
    ops->run = p_run;
    ops->stop = p_stop;
    ops->pause = p_pause;
    ops->resume = p_resume;
    ops->step = p_step;
    ops->reset = p_reset;
    ops->bp_add = p_bp_add;
    ops->bp_remove = p_bp_remove;
    ops->bp_clear = p_bp_clear;
    ops->bp_list = p_bp_list;
    ops->program_begin = p_program_begin;
    ops->program_chunk = p_program_chunk;
    ops->program_commit = p_program_commit;
    ops->program_abort = p_program_abort;
    ops->program_info = p_program_info;
    ops->signing_key_load = p_signing_key_load;
    ops->signing_key_store = p_signing_key_store;
    ops->signing_key_erase = p_signing_key_erase;
    ops->program_verify = p_program_verify;
    /* no configuration and no credentials: the simulator has neither */
}

void zplc_native_device_link_port_release(zplc_native_device_link_port_t *port)
{
    drop_staged(port);
    zplc_secure_zero(port->key, sizeof(port->key));
}

/* ------------------------------------------------------------------------------------------------------------- */
/* Serving the link on standard input and output                                                                 */
/* ------------------------------------------------------------------------------------------------------------- */

#ifndef _WIN32

static int write_all(void *context, const uint8_t *frame, size_t length)
{
    size_t done = 0U;

    (void)context;
    while (done < length) {
        const ssize_t n = write(STDOUT_FILENO, frame + done, length - done);

        if (n < 0) {
            if (errno == EINTR || errno == EAGAIN) {
                continue;
            }
            return -1;
        }
        done += (size_t)n;
    }
    return 0;
}

int zplc_native_device_link_run(zplc_native_runtime_session_t *session, int network)
{
    static zplc_proto_dev_t dev;
    static zplc_proto_link_t link;
    zplc_native_device_link_port_t port;
    zplc_proto_ops_t ops;
    zplc_proto_link_t *links[1];
    uint8_t buffer[512];
    char event[ZPLC_NATIVE_EVENT_MAX];
    int status = 0;

    zplc_native_device_link_port_init(&port, session, &ops);
    /*
     * A simulator has no serial link beside the one it speaks on, so a test of the rules of a network link
     * cannot provision the key the way a device is provisioned. ZPLC_NATIVE_LINK_KEY_HEX stands in for it: the
     * 32 bytes of the key, as 64 hexadecimal digits. The key never leaves the process.
     */
    {
        const char *text = getenv("ZPLC_NATIVE_LINK_KEY_HEX");
        size_t i;

        if (text != NULL && strlen(text) == 2U * ZPLC_PROTO_KEY_BYTES) {
            uint8_t key[ZPLC_PROTO_KEY_BYTES];
            int good = 1;

            for (i = 0U; i < ZPLC_PROTO_KEY_BYTES && good; i++) {
                unsigned value = 0U;
                size_t k;

                for (k = 0U; k < 2U; k++) {
                    const char ch = text[2U * i + k];
                    unsigned digit = 0U;

                    if (ch >= '0' && ch <= '9') {
                        digit = (unsigned)(ch - '0');
                    } else if (ch >= 'a' && ch <= 'f') {
                        digit = (unsigned)(ch - 'a') + 10U;
                    } else if (ch >= 'A' && ch <= 'F') {
                        digit = (unsigned)(ch - 'A') + 10U;
                    } else {
                        good = 0;
                    }
                    value = (value << 4) | digit;
                }
                key[i] = (uint8_t)value;
            }
            if (good) {
                (void)p_key_store(&port, key);
            }
            zplc_secure_zero(key, sizeof(key));
        }
    }
    if (zplc_proto_dev_init(&dev, &ops, 0U) != 0) {
        return 1;
    }
    zplc_proto_link_init(&link, &dev, network != 0 ? ZPLC_PROTO_TRANSPORT_NETWORK : ZPLC_PROTO_TRANSPORT_SERIAL,
                         write_all, NULL);
    links[0] = &link;

    while (zplc_native_runtime_session_should_exit(session) == 0) {
        const uint32_t now = zplc_hal_tick();
        uint32_t wait = zplc_native_runtime_session_poll_timeout_ms(session, now, 10U);
        struct pollfd pfd;
        int ready;

        event[0] = '\0';
        (void)zplc_native_runtime_session_tick(session, now, event, sizeof(event));
        zplc_proto_dev_service(&dev, links, 1U);

        if (wait > 10U) {
            wait = 10U;
        }
        pfd.fd = STDIN_FILENO;
        pfd.events = POLLIN;
        pfd.revents = 0;
        ready = poll(&pfd, 1, (int)wait);
        if (ready < 0) {
            if (errno == EINTR) {
                continue;
            }
            status = 1;
            break;
        }
        if (ready == 0) {
            continue;
        }
        if ((pfd.revents & POLLIN) != 0) {
            const ssize_t n = read(STDIN_FILENO, buffer, sizeof(buffer));

            if (n > 0) {
                zplc_proto_link_feed(&link, buffer, (size_t)n);
                continue;
            }
            if (n < 0 && (errno == EINTR || errno == EAGAIN)) {
                continue;
            }
            break; /* end of input: the link is gone */
        }
        if ((pfd.revents & (POLLHUP | POLLERR | POLLNVAL)) != 0) {
            break;
        }
    }
    zplc_proto_link_lost(&link);
    zplc_native_device_link_port_release(&port);
    return status;
}

#else

int zplc_native_device_link_run(zplc_native_runtime_session_t *session, int network)
{
    (void)session;
    (void)network;
    (void)fprintf(stderr, "[native-sim] the device link is not available on this platform\n");
    return 1;
}

#endif
