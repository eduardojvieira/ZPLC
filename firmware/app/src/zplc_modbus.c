/**
 * ZPLC Modbus Server Implementation
 *
 * SPDX-License-Identifier: MIT
 */

#include "zplc_config.h"
#include <zplc_core.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zephyr/kernel.h>
#include <zephyr/net/socket.h>

#include <zephyr/logging/log.h>
LOG_MODULE_REGISTER(zplc_modbus, LOG_LEVEL_INF);

/* 
 * We use Zephyr sockets directly instead of the generic Zephyr Modbus 
 * subsystem, because we need to accept generic TCP connections on port 502 
 * and translate them to ZPLC memory safely, handling the Modbus frame.
 * Wait, actually implementing a basic Modbus TCP parser is trivial:
 * MBAP: [TID (2)][PID (2)][LEN (2)][UID (1)]
 * PDU:  [FC (1)][Data (n)]
 */

#define MODBUS_TCP_PORT 502
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

static struct k_thread modbus_thread_data;
static K_THREAD_STACK_DEFINE(modbus_stack_area, 2048);

/**
 * @brief Search for a tag that maps the given modbus address
 */
static const zplc_tag_entry_t* find_modbus_tag(uint16_t modbus_addr) {
    uint16_t count = zplc_core_get_tag_count();
    for (uint16_t i = 0; i < count; i++) {
        const zplc_tag_entry_t* tag = zplc_core_get_tag(i);
        if (tag && tag->tag_id == ZPLC_TAG_MODBUS && tag->value == modbus_addr) {
            return tag;
        }
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
static int handle_read(uint16_t addr, uint16_t count, uint8_t *resp_data, bool is_bit) {
    zplc_pi_lock();
    
    for (uint16_t i = 0; i < count; i++) {
        const zplc_tag_entry_t* tag = find_modbus_tag(addr + i);
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
            /* Modbus is big-endian, ZPLC memory is little-endian */
            resp_data[i * 2] = (val >> 8) & 0xFF;
            resp_data[i * 2 + 1] = val & 0xFF;
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
static int handle_write(uint16_t addr, uint16_t count, const uint8_t *req_data, bool is_bit, bool is_multiple) {
    zplc_pi_lock();
    
    for (uint16_t i = 0; i < count; i++) {
        const zplc_tag_entry_t* tag = find_modbus_tag(addr + i);
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
        
        mem_write_val(tag->var_addr, (zplc_data_type_t)tag->var_type, val);
    }
    
    zplc_pi_unlock();
    return 0;
}

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
            int data_bytes = handle_read(start_addr, count, &resp[9], is_bit);
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
        
        if (handle_write(addr, 1, &req[10], is_bit, false) < 0) {
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
        } else if (handle_write(start_addr, count, &req[13], is_bit, true) < 0) {
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

static void modbus_server_thread(void *arg1, void *arg2, void *arg3) {
    ARG_UNUSED(arg1);
    ARG_UNUSED(arg2);
    ARG_UNUSED(arg3);

    int serv;
    struct sockaddr_in bind_addr;

    serv = zsock_socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (serv < 0) {
        LOG_ERR("Failed to create Modbus socket: %d", errno);
        return;
    }

    bind_addr.sin_family = AF_INET;
    bind_addr.sin_addr.s_addr = htonl(INADDR_ANY);
    bind_addr.sin_port = htons(MODBUS_TCP_PORT);

    if (zsock_bind(serv, (struct sockaddr *)&bind_addr, sizeof(bind_addr)) < 0) {
        LOG_ERR("Failed to bind Modbus socket: %d", errno);
        zsock_close(serv);
        return;
    }

    if (zsock_listen(serv, 3) < 0) {
        LOG_ERR("Failed to listen on Modbus socket: %d", errno);
        zsock_close(serv);
        return;
    }

    LOG_INF("Modbus TCP Server started on port %d", MODBUS_TCP_PORT);

    while (1) {
        struct sockaddr_in client_addr;
        socklen_t client_addr_len = sizeof(client_addr);
        int client = zsock_accept(serv, (struct sockaddr *)&client_addr, &client_addr_len);

        if (client < 0) {
            LOG_WRN("Modbus accept error: %d", errno);
            k_msleep(100);
            continue;
        }

        LOG_INF("Modbus client connected");

        uint8_t buf[MODBUS_MAX_ADU];
        while (1) {
            int received = zsock_recv(client, buf, sizeof(buf), 0);
            if (received <= 0) {
                break;
            }
            process_modbus_request(client, buf, received);
        }

        LOG_INF("Modbus client disconnected");
        zsock_close(client);
    }
}

int zplc_modbus_init(void) {
    k_thread_create(&modbus_thread_data, modbus_stack_area,
                    K_THREAD_STACK_SIZEOF(modbus_stack_area),
                    modbus_server_thread,
                    NULL, NULL, NULL,
                    K_PRIO_COOP(7), 0, K_NO_WAIT);
    k_thread_name_set(&modbus_thread_data, "modbus_tcp");
    return 0;
}
