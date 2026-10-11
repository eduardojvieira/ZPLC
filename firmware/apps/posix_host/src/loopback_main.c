/*
 * zplc_loopback: the loopback endpoints of a simulation as a program (COM-009).
 *
 *   zplc_loopback [--modbus PORT] [--mqtt PORT]
 *
 * Starts a Modbus TCP server and an MQTT broker on 127.0.0.1 (port 0, the default, takes a free port), prints
 * one line of JSON with the ports that were bound, and runs until its standard input closes or it is
 * terminated: the program that started it owns its life, so the endpoints end with the session that wanted them.
 *
 * SPDX-License-Identifier: MIT
 */
#define _POSIX_C_SOURCE 200809L

#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include "loopback_endpoints.h"

static volatile sig_atomic_t g_terminated;

static void on_signal(int signal_number) {
  (void)signal_number;
  g_terminated = 1;
}

int main(int argc, char **argv) {
  uint16_t modbus_port = 0U;
  uint16_t mqtt_port = 0U;
  uint16_t modbus_bound = 0U;
  uint16_t mqtt_bound = 0U;
  zplc_loopback_modbus_t *modbus;
  zplc_loopback_mqtt_t *mqtt;
  int i;

  for (i = 1; i + 1 < argc; i += 2) {
    const long value = strtol(argv[i + 1], NULL, 10);

    if (value < 0 || value > 65535L) {
      (void)fprintf(stderr, "zplc_loopback: bad port %s\n", argv[i + 1]);
      return 2;
    }
    if (strcmp(argv[i], "--modbus") == 0) {
      modbus_port = (uint16_t)value;
    } else if (strcmp(argv[i], "--mqtt") == 0) {
      mqtt_port = (uint16_t)value;
    } else {
      (void)fprintf(stderr, "usage: zplc_loopback [--modbus PORT] [--mqtt PORT]\n");
      return 2;
    }
  }

  (void)signal(SIGINT, on_signal);
  (void)signal(SIGTERM, on_signal);
  (void)signal(SIGPIPE, SIG_IGN);

  modbus = zplc_loopback_modbus_start(modbus_port, &modbus_bound);
  mqtt = zplc_loopback_mqtt_start(mqtt_port, &mqtt_bound);
  if (modbus == NULL || mqtt == NULL) {
    (void)fprintf(stderr, "zplc_loopback: could not listen on the loopback interface\n");
    zplc_loopback_modbus_stop(modbus);
    zplc_loopback_mqtt_stop(mqtt);
    return 1;
  }
  (void)printf("{\"modbus\":%u,\"mqtt\":%u}\n", (unsigned)modbus_bound, (unsigned)mqtt_bound);
  (void)fflush(stdout);

  while (g_terminated == 0) {
    char drain[64];
    const ssize_t n = read(STDIN_FILENO, drain, sizeof(drain));

    if (n == 0) {
      break; /* the session closed our input: it is over */
    }
    if (n < 0 && g_terminated != 0) {
      break;
    }
  }
  zplc_loopback_modbus_stop(modbus);
  zplc_loopback_mqtt_stop(mqtt);
  return 0;
}
