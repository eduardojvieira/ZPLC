/*
 * The Modbus client of the simulation runtime (COM-009).
 *
 * The TCP client is the one of the controller: its transaction code is the file
 * firmware/app/src/zplc_modbus_tcp_client.inc, compiled here on the BSD socket API under the names that file
 * uses, so a block asks a server the same way, waits the same time and reports the same status for the same
 * failure. A simulation has no serial device: a request on RTU is answered "not available in this runtime".
 *
 * SPDX-License-Identifier: MIT
 */
#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <fcntl.h>
#include <netdb.h>
#include <netinet/in.h>
#include <poll.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>

#include <zephyr/kernel.h>

#include "host_comm.h"
#include "zplc_modbus_tcp.h"

/* the names of the Zephyr socket API, on the BSD one */
#define zsock_addrinfo addrinfo
#define zsock_pollfd pollfd
#define zsock_getaddrinfo getaddrinfo
#define zsock_freeaddrinfo freeaddrinfo
#define zsock_socket socket
#define zsock_fcntl fcntl
#define zsock_connect connect
#define zsock_poll poll
#define zsock_getsockopt getsockopt
#define zsock_send send
#define zsock_recv recv
#define zsock_close close
#define ZSOCK_POLLIN POLLIN
#define ZSOCK_POLLOUT POLLOUT
#define ZSOCK_POLLERR POLLERR
#define ZSOCK_POLLHUP POLLHUP
#define ZVFS_F_GETFL F_GETFL
#define ZVFS_F_SETFL F_SETFL
#define ZVFS_O_NONBLOCK O_NONBLOCK

static uint32_t s_timeout_ms = ZPLC_HOST_MODBUS_TIMEOUT_MS_DEFAULT;

void zplc_host_modbus_set_timeout_ms(uint32_t timeout_ms) { s_timeout_ms = timeout_ms; }

uint32_t zplc_config_get_modbus_tcp_client_timeout_ms(void) { return s_timeout_ms; }

#include "zplc_modbus_tcp_client.inc"

/* No serial device in a simulation. */
int zplc_modbus_rtu_client_read_holding(uint8_t slave_id, uint16_t start_reg, uint16_t count, uint16_t *out) {
  (void)slave_id;
  (void)start_reg;
  (void)count;
  (void)out;
  return -ENOTSUP;
}

int zplc_modbus_rtu_client_write_register(uint8_t slave_id, uint16_t reg, uint16_t value) {
  (void)slave_id;
  (void)reg;
  (void)value;
  return -ENOTSUP;
}

int zplc_modbus_rtu_client_write_multiple(uint8_t slave_id, uint16_t start_reg, uint16_t count,
                                          const uint16_t *values) {
  (void)slave_id;
  (void)start_reg;
  (void)count;
  (void)values;
  return -ENOTSUP;
}

int zplc_modbus_rtu_client_read_coils(uint8_t slave_id, uint16_t start_addr, uint16_t count,
                                      uint8_t *out_bits) {
  (void)slave_id;
  (void)start_addr;
  (void)count;
  (void)out_bits;
  return -ENOTSUP;
}

int zplc_modbus_rtu_client_write_coil(uint8_t slave_id, uint16_t addr, bool state) {
  (void)slave_id;
  (void)addr;
  (void)state;
  return -ENOTSUP;
}

int zplc_host_tcp_connect(const char *host, uint16_t port, uint32_t timeout_ms) {
  return tcp_connect_socket(host, port, k_uptime_get() + (int64_t)timeout_ms);
}
