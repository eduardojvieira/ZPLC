/**
 * ZPLC Modbus Server Implementation
 *
 * SPDX-License-Identifier: MIT
 */

#include "zplc_config.h"
#include <zplc_core.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zephyr/devicetree.h>
#include <zephyr/kernel.h>
#include <zephyr/modbus/modbus.h>
#include <zephyr/net/socket.h>

#include <zephyr/logging/log.h>
LOG_MODULE_REGISTER(zplc_modbus, LOG_LEVEL_INF);

int zplc_modbus_client_init(void);

/* 
 * We use Zephyr sockets directly instead of the generic Zephyr Modbus 
 * subsystem, because we need to accept generic TCP connections on port 502 
 * and translate them to ZPLC memory safely, handling the Modbus frame.
 * Wait, actually implementing a basic Modbus TCP parser is trivial:
 * MBAP: [TID (2)][PID (2)][LEN (2)][UID (1)]
 * PDU:  [FC (1)][Data (n)]
 */

#define MODBUS_MAX_ADU 260

/* Supported function codes */
#define FC_READ_COILS 0x01
#define FC_READ_DISCRETE_INPUTS 0x02
#define FC_READ_HOLDING_REGISTERS 0x03
#define FC_READ_INPUT_REGISTERS 0x04
#define FC_WRITE_SINGLE_COIL 0x05
#define FC_WRITE_SINGLE_REGISTER 0x06
#define FC_WRITE_MULTIPLE_COILS 0x0F
#define FC_WRITE_MULTIPLE_REGISTERS 0x10

/* Maximum simultaneous Modbus TCP clients — static, no malloc */
#define MODBUS_TCP_MAX_CLIENTS 4

typedef enum {
    MODBUS_AREA_COIL = 0,
    MODBUS_AREA_DISCRETE_INPUT = 1,
    MODBUS_AREA_INPUT_REGISTER = 2,
    MODBUS_AREA_HOLDING_REGISTER = 3,
} zplc_modbus_area_t;

static struct k_thread modbus_thread_data;
static K_THREAD_STACK_DEFINE(modbus_stack_area, 3072);

/* Client socket table — -1 means slot is free */
static int s_clients[MODBUS_TCP_MAX_CLIENTS];

#if DT_HAS_COMPAT_STATUS_OKAY(zephyr_modbus_serial)
#define ZPLC_MODBUS_RTU_NODE DT_COMPAT_GET_ANY_STATUS_OKAY(zephyr_modbus_serial)
#define ZPLC_HAS_MODBUS_RTU 1
#else
#define ZPLC_HAS_MODBUS_RTU 0
#endif

/**
 * @brief Search for a tag that maps the given modbus address
 */
static uint16_t modbus_register_width(zplc_data_type_t type)
{
    switch (type) {
    case ZPLC_TYPE_REAL:
    case ZPLC_TYPE_DINT:
    case ZPLC_TYPE_UDINT:
    case ZPLC_TYPE_DWORD:
        return 2U;
    default:
        return 1U;
    }
}

static uint32_t get_effective_modbus_address(uint16_t tag_index,
                                             const zplc_tag_entry_t *tag)
{
    uint32_t override_addr = 0U;
    if (zplc_config_get_modbus_tag_override(tag_index, &override_addr)) {
        return override_addr;
    }

    return tag ? tag->value : 0U;
}

static bool modbus_address_matches_area(uint32_t configured_addr,
                                        uint16_t request_addr,
                                        zplc_modbus_area_t area,
                                        uint16_t width,
                                        uint16_t *word_offset_out)
{
    static const uint32_t area_bases[] = { 1U, 10001U, 30001U, 40001U };
    uint32_t candidates[2];
    size_t candidate_count = 1U;

    candidates[0] = (uint32_t)request_addr;
    if ((uint32_t)request_addr + area_bases[area] <= UINT32_MAX) {
        candidates[1] = (uint32_t)request_addr + area_bases[area];
        candidate_count = 2U;
    }

    for (size_t i = 0; i < candidate_count; i++) {
        uint32_t candidate = candidates[i];
        if (candidate < configured_addr || candidate >= configured_addr + width) {
            continue;
        }

        if (word_offset_out != NULL) {
            *word_offset_out = (uint16_t)(candidate - configured_addr);
        }
        return true;
    }

    return false;
}

static zplc_modbus_area_t modbus_area_from_fc(uint8_t fc)
{
    switch (fc) {
    case FC_READ_COILS:
    case FC_WRITE_SINGLE_COIL:
    case FC_WRITE_MULTIPLE_COILS:
        return MODBUS_AREA_COIL;
    case FC_READ_DISCRETE_INPUTS:
        return MODBUS_AREA_DISCRETE_INPUT;
    case FC_READ_INPUT_REGISTERS:
        return MODBUS_AREA_INPUT_REGISTER;
    case FC_READ_HOLDING_REGISTERS:
    case FC_WRITE_SINGLE_REGISTER:
    case FC_WRITE_MULTIPLE_REGISTERS:
    default:
        return MODBUS_AREA_HOLDING_REGISTER;
    }
}

static const zplc_tag_entry_t* find_modbus_tag(uint16_t modbus_addr,
                                                zplc_modbus_area_t area,
                                                uint16_t *tag_index_out,
                                                uint16_t *word_offset_out) {
    uint16_t count = zplc_core_get_tag_count();
    for (uint16_t i = 0; i < count; i++) {
        const zplc_tag_entry_t* tag = zplc_core_get_tag(i);
        if (!tag || tag->tag_id != ZPLC_TAG_MODBUS) {
            continue;
        }

        uint32_t start_addr = get_effective_modbus_address(i, tag);
        uint16_t width = modbus_register_width((zplc_data_type_t)tag->var_type);
        if (!modbus_address_matches_area(start_addr, modbus_addr, area, width, word_offset_out)) {
            continue;
        }

        if (tag_index_out != NULL) {
            *tag_index_out = i;
        }

        return tag;
    }
    return NULL;
}

static uint32_t mem_read_val(uint16_t addr, zplc_data_type_t type) {
    uint16_t base = addr & 0xF000;
    uint16_t offset = addr & 0x0FFF;
    if (base == 0x2000 || base == 0x3000) base = 0x2000; /* Work memory spans 8K */
    
    uint8_t *region = zplc_mem_get_region(base);
    if (!region) return 0;
    
    switch (type) {
        case ZPLC_TYPE_BOOL:
        case ZPLC_TYPE_SINT:
        case ZPLC_TYPE_USINT:
        case ZPLC_TYPE_BYTE:
            return region[offset];
        case ZPLC_TYPE_INT:
        case ZPLC_TYPE_UINT:
        case ZPLC_TYPE_WORD:
            return region[offset] | (region[offset + 1] << 8);
        case ZPLC_TYPE_REAL:
        case ZPLC_TYPE_DINT:
        case ZPLC_TYPE_UDINT:
        case ZPLC_TYPE_DWORD:
            return region[offset] | (region[offset + 1] << 8) | 
                   (region[offset + 2] << 16) | (region[offset + 3] << 24);
        default:
            return 0;
    }
}

static void mem_write_val(uint16_t addr, zplc_data_type_t type, uint32_t val) {
    uint16_t base = addr & 0xF000;
    uint16_t offset = addr & 0x0FFF;
    if (base == 0x2000 || base == 0x3000) base = 0x2000;
    
    uint8_t *region = zplc_mem_get_region(base);
    if (!region) return;
    
    switch (type) {
        case ZPLC_TYPE_BOOL:
        case ZPLC_TYPE_SINT:
        case ZPLC_TYPE_USINT:
        case ZPLC_TYPE_BYTE:
            region[offset] = val & 0xFF;
            break;
        case ZPLC_TYPE_INT:
        case ZPLC_TYPE_UINT:
        case ZPLC_TYPE_WORD:
            region[offset] = val & 0xFF;
            region[offset + 1] = (val >> 8) & 0xFF;
            break;
        case ZPLC_TYPE_REAL:
        case ZPLC_TYPE_DINT:
        case ZPLC_TYPE_UDINT:
        case ZPLC_TYPE_DWORD:
            region[offset] = val & 0xFF;
            region[offset + 1] = (val >> 8) & 0xFF;
            region[offset + 2] = (val >> 16) & 0xFF;
            region[offset + 3] = (val >> 24) & 0xFF;
            break;
        default:
            break;
    }
}

/**
 * @brief Map a memory read from ZPLC to Modbus format
 */
static int handle_read(uint16_t addr, uint16_t count, uint8_t *resp_data, bool is_bit,
                       zplc_modbus_area_t area) {
    zplc_pi_lock();
    
    for (uint16_t i = 0; i < count; i++) {
        uint16_t word_offset = 0U;
        const zplc_tag_entry_t* tag = find_modbus_tag(addr + i, area, NULL, &word_offset);
        if (!tag) {
            zplc_pi_unlock();
            return -1;
        }
        
        uint32_t val = mem_read_val(tag->var_addr, (zplc_data_type_t)tag->var_type);
        
        if (is_bit) {
            uint8_t byte_idx = i / 8;
            uint8_t bit_idx = i % 8;
            if (val) {
                resp_data[byte_idx] |= (1 << bit_idx);
            } else {
                resp_data[byte_idx] &= ~(1 << bit_idx);
            }
        } else {
            uint16_t register_word = 0U;
            if (modbus_register_width((zplc_data_type_t)tag->var_type) == 2U) {
                register_word = (uint16_t)((word_offset == 0U) ? ((val >> 16) & 0xFFFFU)
                                                             : (val & 0xFFFFU));
            } else {
                register_word = (uint16_t)(val & 0xFFFFU);
            }

            /* Modbus is big-endian, ZPLC memory is little-endian */
            resp_data[i * 2] = (register_word >> 8) & 0xFF;
            resp_data[i * 2 + 1] = register_word & 0xFF;
        }
    }
    
    zplc_pi_unlock();
    
    if (is_bit) {
        return (count + 7) / 8;
    } else {
        return count * 2;
    }
}

/**
 * @brief Map a memory write from Modbus to ZPLC format
 */
static int handle_write(uint16_t addr, uint16_t count, const uint8_t *req_data, bool is_bit,
                        bool is_multiple, zplc_modbus_area_t area) {
    zplc_pi_lock();
    
    for (uint16_t i = 0; i < count; i++) {
        uint16_t word_offset = 0U;
        const zplc_tag_entry_t* tag = find_modbus_tag(addr + i, area, NULL, &word_offset);
        if (!tag) {
            zplc_pi_unlock();
            return -1; /* Address not mapped */
        }
        
        uint32_t val = 0;
        
        if (is_bit) {
            if (is_multiple) {
                uint8_t byte_idx = i / 8;
                uint8_t bit_idx = i % 8;
                val = (req_data[byte_idx] & (1 << bit_idx)) ? 1 : 0;
            } else {
                /* Single coil write uses 0xFF00 for ON, 0x0000 for OFF */
                val = (req_data[0] == 0xFF) ? 1 : 0;
            }
        } else {
            /* Modbus is big-endian */
            val = (req_data[i * 2] << 8) | req_data[i * 2 + 1];
        }

        if (!is_bit && modbus_register_width((zplc_data_type_t)tag->var_type) == 2U) {
            uint32_t current = mem_read_val(tag->var_addr, (zplc_data_type_t)tag->var_type);
            if (word_offset == 0U) {
                val = ((uint32_t)val << 16) | (current & 0xFFFFU);
            } else {
                val = (current & 0xFFFF0000U) | val;
            }
        }
        
        mem_write_val(tag->var_addr, (zplc_data_type_t)tag->var_type, val);
    }
    
    zplc_pi_unlock();
    return 0;
}

static int coil_rd_cb(uint16_t addr, bool *state) {
    uint8_t value = 0U;
    int rc = handle_read(addr, 1U, &value, true, MODBUS_AREA_COIL);
    if (rc < 0) {
        return -ENOTSUP;
    }

    *state = (value & 0x01U) != 0U;
    return 0;
}

static int coil_wr_cb(uint16_t addr, bool state) {
    const uint8_t req_data[2] = { state ? 0xFFU : 0x00U, 0x00U };
    int rc = handle_write(addr, 1U, req_data, true, false, MODBUS_AREA_COIL);
    return (rc < 0) ? -ENOTSUP : 0;
}

static int discrete_input_rd_cb(uint16_t addr, bool *state) {
    uint8_t value = 0U;
    int rc = handle_read(addr, 1U, &value, true, MODBUS_AREA_DISCRETE_INPUT);
    if (rc < 0) {
        return -ENOTSUP;
    }

    *state = (value & 0x01U) != 0U;
    return 0;
}

static int input_reg_rd_cb(uint16_t addr, uint16_t *reg) {
    uint8_t resp_data[2] = {0U, 0U};
    int rc = handle_read(addr, 1U, resp_data, false, MODBUS_AREA_INPUT_REGISTER);
    if (rc < 0) {
        return -ENOTSUP;
    }

    *reg = ((uint16_t)resp_data[0] << 8) | (uint16_t)resp_data[1];
    return 0;
}

static int holding_reg_rd_cb(uint16_t addr, uint16_t *reg) {
    uint8_t resp_data[2] = {0U, 0U};
    int rc = handle_read(addr, 1U, resp_data, false, MODBUS_AREA_HOLDING_REGISTER);
    if (rc < 0) {
        return -ENOTSUP;
    }

    *reg = ((uint16_t)resp_data[0] << 8) | (uint16_t)resp_data[1];
    return 0;
}

static int holding_reg_wr_cb(uint16_t addr, uint16_t reg) {
    uint8_t req_data[2];
    req_data[0] = (uint8_t)((reg >> 8) & 0xFFU);
    req_data[1] = (uint8_t)(reg & 0xFFU);
    return (handle_write(addr, 1U, req_data, false, false, MODBUS_AREA_HOLDING_REGISTER) < 0) ? -ENOTSUP : 0;
}

static struct modbus_user_callbacks zplc_modbus_rtu_callbacks = {
    .coil_rd = coil_rd_cb,
    .coil_wr = coil_wr_cb,
    .discrete_input_rd = discrete_input_rd_cb,
    .input_reg_rd = input_reg_rd_cb,
    .holding_reg_rd = holding_reg_rd_cb,
    .holding_reg_wr = holding_reg_wr_cb,
};

/**
 * @brief Handle an incoming Modbus ADU
 */
static void process_modbus_request(int sock, uint8_t *req, int req_len) {
    if (req_len < 8) return; // Minimum length: MBAP (7) + FC (1)

    uint16_t pid = (req[2] << 8) | req[3];
    uint8_t uid = req[6];
    uint8_t fc = req[7];
    
    if (pid != 0) return; // Only Modbus TCP
    
    uint16_t my_id = zplc_config_get_modbus_id();
    if (uid != my_id && uid != 0 && uid != 255) return;
    
    uint8_t resp[MODBUS_MAX_ADU];
    int resp_len = 0;
    
    /* Copy MBAP header (we will fix length later) */
    memcpy(resp, req, 7);
    resp[7] = fc;
    
    if (fc == FC_READ_COILS || fc == FC_READ_DISCRETE_INPUTS || 
        fc == FC_READ_HOLDING_REGISTERS || fc == FC_READ_INPUT_REGISTERS) {
            
        if (req_len < 12) return;
        uint16_t start_addr = (req[8] << 8) | req[9];
        uint16_t count = (req[10] << 8) | req[11];
        
        bool is_bit = (fc == FC_READ_COILS || fc == FC_READ_DISCRETE_INPUTS);
        
        if (count == 0 || (is_bit && count > 2000) || (!is_bit && count > 125)) {
            /* Exception 0x03 (Illegal Data Value) */
            resp[7] = fc | 0x80;
            resp[8] = 0x03;
            resp_len = 9;
        } else {
            memset(&resp[9], 0, 250); // Clear data area
            int data_bytes = handle_read(start_addr, count, &resp[9], is_bit,
                                         modbus_area_from_fc(fc));
            if (data_bytes < 0) {
                /* Exception 0x02 (Illegal Data Address) */
                resp[7] = fc | 0x80;
                resp[8] = 0x02;
                resp_len = 9;
            } else {
                resp[8] = data_bytes;
                resp_len = 9 + data_bytes;
            }
        }
    } else if (fc == FC_WRITE_SINGLE_COIL || fc == FC_WRITE_SINGLE_REGISTER) {
        if (req_len < 12) return;
        uint16_t addr = (req[8] << 8) | req[9];
        
        bool is_bit = (fc == FC_WRITE_SINGLE_COIL);
        
        if (handle_write(addr, 1, &req[10], is_bit, false,
                         modbus_area_from_fc(fc)) < 0) {
            resp[7] = fc | 0x80;
            resp[8] = 0x02;
            resp_len = 9;
        } else {
            /* Echo request */
            memcpy(&resp[8], &req[8], 4);
            resp_len = 12;
        }
    } else if (fc == FC_WRITE_MULTIPLE_COILS || fc == FC_WRITE_MULTIPLE_REGISTERS) {
        if (req_len < 13) return;
        uint16_t start_addr = (req[8] << 8) | req[9];
        uint16_t count = (req[10] << 8) | req[11];
        uint8_t byte_count = req[12];
        
        if (req_len < 13 + byte_count) return;
        
        bool is_bit = (fc == FC_WRITE_MULTIPLE_COILS);
        
        if (count == 0 || (is_bit && count > 1968) || (!is_bit && count > 123)) {
            resp[7] = fc | 0x80;
            resp[8] = 0x03;
            resp_len = 9;
        } else if (handle_write(start_addr, count, &req[13], is_bit, true,
                                modbus_area_from_fc(fc)) < 0) {
            resp[7] = fc | 0x80;
            resp[8] = 0x02;
            resp_len = 9;
        } else {
            memcpy(&resp[8], &req[8], 4);
            resp_len = 12;
        }
    } else {
        /* Exception 0x01 (Illegal Function) */
        resp[7] = fc | 0x80;
        resp[8] = 0x01;
        resp_len = 9;
    }
    
    /* Update MBAP length (from Unit ID to end of ADU) */
    uint16_t pdu_len = resp_len - 6;
    resp[4] = (pdu_len >> 8) & 0xFF;
    resp[5] = pdu_len & 0xFF;
    
    zsock_send(sock, resp, resp_len, 0);
}

/**
 * @brief Find a free slot in the client table. Returns -1 if full.
 */
static int find_free_client_slot(void)
{
    for (int i = 0; i < MODBUS_TCP_MAX_CLIENTS; i++) {
        if (s_clients[i] < 0) {
            return i;
        }
    }
    return -1;
}

/**
 * @brief Close and evict a client from the table.
 */
static void close_client(int slot)
{
    if (s_clients[slot] >= 0) {
        zsock_close(s_clients[slot]);
        s_clients[slot] = -1;
    }
}

/**
 * @brief Modbus TCP server — poll()-based multi-client, single thread, no malloc.
 *
 * Layout of fds[] passed to zsock_poll():
 *   fds[0]         → server (listen) socket
 *   fds[1..N]      → active client sockets (maps 1:1 to s_clients[])
 */
static void modbus_server_thread(void *arg1, void *arg2, void *arg3)
{
    ARG_UNUSED(arg1);
    ARG_UNUSED(arg2);
    ARG_UNUSED(arg3);

    /* Initialise client table */
    for (int i = 0; i < MODBUS_TCP_MAX_CLIENTS; i++) {
        s_clients[i] = -1;
    }

    int serv = zsock_socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (serv < 0) {
        LOG_ERR("Failed to create Modbus socket: %d", errno);
        return;
    }

    /* Allow immediate reuse after reset */
    int opt = 1;
    zsock_setsockopt(serv, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in bind_addr;
    bind_addr.sin_family      = AF_INET;
    bind_addr.sin_addr.s_addr = htonl(INADDR_ANY);
    bind_addr.sin_port        = htons(zplc_config_get_modbus_tcp_port());

    if (zsock_bind(serv, (struct sockaddr *)&bind_addr, sizeof(bind_addr)) < 0) {
        LOG_ERR("Failed to bind Modbus socket: %d", errno);
        zsock_close(serv);
        return;
    }

    if (zsock_listen(serv, MODBUS_TCP_MAX_CLIENTS) < 0) {
        LOG_ERR("Failed to listen on Modbus socket: %d", errno);
        zsock_close(serv);
        return;
    }

    LOG_INF("Modbus TCP Server started on port %u (max %d clients)",
            zplc_config_get_modbus_tcp_port(), MODBUS_TCP_MAX_CLIENTS);

    /* +1 for the server fd itself */
    struct zsock_pollfd fds[MODBUS_TCP_MAX_CLIENTS + 1];
    uint8_t buf[MODBUS_MAX_ADU];

    while (1) {
        /* Rebuild poll set every iteration — cheap and correct */
        fds[0].fd     = serv;
        fds[0].events = ZSOCK_POLLIN;

        for (int i = 0; i < MODBUS_TCP_MAX_CLIENTS; i++) {
            fds[i + 1].fd     = s_clients[i];
            fds[i + 1].events = (s_clients[i] >= 0) ? ZSOCK_POLLIN : 0;
        }

        int ready = zsock_poll(fds, MODBUS_TCP_MAX_CLIENTS + 1, -1 /* block */);
        if (ready < 0) {
            LOG_WRN("Modbus poll error: %d", errno);
            k_msleep(50);
            continue;
        }

        /* --- New connection? --- */
        if (fds[0].revents & ZSOCK_POLLIN) {
            struct sockaddr_in client_addr;
            socklen_t client_addr_len = sizeof(client_addr);
            int client = zsock_accept(serv, (struct sockaddr *)&client_addr,
                                      &client_addr_len);
            if (client >= 0) {
                int slot = find_free_client_slot();
                if (slot < 0) {
                    LOG_WRN("Modbus: max clients reached, rejecting connection");
                    zsock_close(client);
                } else {
                    s_clients[slot] = client;
                    LOG_INF("Modbus client connected (slot %d)", slot);
                }
            }
        }

        /* --- Service existing clients --- */
        for (int i = 0; i < MODBUS_TCP_MAX_CLIENTS; i++) {
            if (s_clients[i] < 0) {
                continue;
            }
            if (!(fds[i + 1].revents & (ZSOCK_POLLIN | ZSOCK_POLLHUP | ZSOCK_POLLERR))) {
                continue;
            }

            int received = zsock_recv(s_clients[i], buf, sizeof(buf), ZSOCK_MSG_DONTWAIT);
            if (received <= 0) {
                LOG_INF("Modbus client disconnected (slot %d)", i);
                close_client(i);
            } else {
                process_modbus_request(s_clients[i], buf, received);
            }
        }
    }
}

static enum uart_config_parity zplc_modbus_parity_to_uart(zplc_modbus_parity_t parity)
{
    switch (parity) {
    case ZPLC_MODBUS_PARITY_EVEN:
        return UART_CFG_PARITY_EVEN;
    case ZPLC_MODBUS_PARITY_ODD:
        return UART_CFG_PARITY_ODD;
    case ZPLC_MODBUS_PARITY_NONE:
    default:
        return UART_CFG_PARITY_NONE;
    }
}

static int zplc_modbus_rtu_init(void)
{
#if ZPLC_HAS_MODBUS_RTU
    struct modbus_iface_param server_param = {
        .mode = MODBUS_MODE_RTU,
        .server = {
            .user_cb = &zplc_modbus_rtu_callbacks,
            .unit_id = (uint8_t)zplc_config_get_modbus_id(),
        },
        .serial = {
            .baud = zplc_config_get_modbus_rtu_baud(),
            .parity = zplc_modbus_parity_to_uart(zplc_config_get_modbus_rtu_parity()),
            .stop_bits = UART_CFG_STOP_BITS_1,
        },
    };
    const char iface_name[] = DEVICE_DT_NAME(ZPLC_MODBUS_RTU_NODE);
    int iface = modbus_iface_get_by_name(iface_name);

    if (iface < 0) {
        LOG_ERR("Failed to get Modbus RTU iface index for %s", iface_name);
        return iface;
    }

    return modbus_init_server(iface, server_param);
#else
    LOG_WRN("Modbus RTU enabled but no zephyr,modbus-serial node is present");
    return -ENODEV;
#endif
}

int zplc_modbus_init(void) {
    if (zplc_config_get_modbus_tcp_enabled()) {
        k_thread_create(&modbus_thread_data, modbus_stack_area,
                        K_THREAD_STACK_SIZEOF(modbus_stack_area),
                        modbus_server_thread,
                        NULL, NULL, NULL,
                        K_PRIO_COOP(7), 0, K_NO_WAIT);
        k_thread_name_set(&modbus_thread_data, "modbus_tcp");
    } else {
        LOG_INF("Modbus TCP disabled by configuration");
    }

    if (zplc_config_get_modbus_rtu_enabled()) {
        int rc = zplc_modbus_rtu_init();
        if (rc < 0) {
            LOG_ERR("Modbus RTU init failed: %d", rc);
            return rc;
        }
        LOG_INF("Modbus RTU server initialized");
    }

    (void)zplc_modbus_client_init();

    return 0;
}
