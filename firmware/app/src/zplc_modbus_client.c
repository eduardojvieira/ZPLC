#include "zplc_config.h"
#include "zplc_modbus_map.h"
#include "zplc_modbus_tcp.h"
#include "zplc_modbus_timing.h"

#include <zplc_core.h>
#include <zplc_exchange.h>
#include <zplc_isa.h>

#include <zephyr/devicetree.h>
#include <zephyr/kernel.h>
#include <zephyr/modbus/modbus.h>
#if defined(CONFIG_NET_SOCKETS)
#include <zephyr/net/socket.h>
#include <zephyr/sys/fdtable.h>
#endif
#include <zephyr/sys/byteorder.h>

#include <errno.h>
#include <stdio.h>
#include <string.h>

#include <zephyr/logging/log.h>
LOG_MODULE_REGISTER(zplc_modbus_client, LOG_LEVEL_INF);

#if DT_HAS_COMPAT_STATUS_OKAY(zephyr_modbus_serial)
#define ZPLC_MODBUS_RTU_NODE DT_COMPAT_GET_ANY_STATUS_OKAY(zephyr_modbus_serial)
#define ZPLC_HAS_MODBUS_RTU 1
#else
#define ZPLC_HAS_MODBUS_RTU 0
#endif

static struct k_thread s_rtu_client_thread;
static K_THREAD_STACK_DEFINE(s_rtu_client_stack, 2048);

static int s_rtu_client_iface = -ENODEV;
#if defined(CONFIG_NET_SOCKETS)
static struct k_thread s_tcp_client_thread;
static K_THREAD_STACK_DEFINE(s_tcp_client_stack, 3072);
#endif

static uint16_t modbus_register_width(zplc_data_type_t type) {
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

/* A value polled from a remote device is an external write like any other: it is queued whole and applied by the
 * scan at its next input latch, through the force-aware interface of the core, so a forced variable keeps its
 * forced value and the scan never sees a half-written one (RT-010, RT-011). */
static int mem_write_val(uint16_t addr, zplc_data_type_t type, uint32_t val) {
  uint8_t bytes[4];
  uint16_t size;

  switch (type) {
  case ZPLC_TYPE_BOOL:
  case ZPLC_TYPE_SINT:
  case ZPLC_TYPE_USINT:
  case ZPLC_TYPE_BYTE:
    size = 1U;
    break;
  case ZPLC_TYPE_INT:
  case ZPLC_TYPE_UINT:
  case ZPLC_TYPE_WORD:
    size = 2U;
    break;
  case ZPLC_TYPE_REAL:
  case ZPLC_TYPE_DINT:
  case ZPLC_TYPE_UDINT:
  case ZPLC_TYPE_DWORD:
    size = 4U;
    break;
  default:
    return -EINVAL;
  }
  bytes[0] = (uint8_t)(val & 0xFFU);
  bytes[1] = (uint8_t)((val >> 8) & 0xFFU);
  bytes[2] = (uint8_t)((val >> 16) & 0xFFU);
  bytes[3] = (uint8_t)((val >> 24) & 0xFFU);
  return zplc_exchange_write(addr, bytes, size) == 0 ? 0 : -EINVAL;
}

static enum uart_config_parity zplc_modbus_parity_to_uart(zplc_modbus_parity_t parity) {
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

/**
 * @brief The parameters of the RTU client interface (COM-012).
 *
 * The wait for a response is the configured timeout of the clients, given to the Zephyr client in the unit
 * it reads: microseconds. It is not tied to the devicetree, so a test can read what an interface is given.
 */
void zplc_modbus_rtu_client_params(struct modbus_iface_param *param) {
  memset(param, 0, sizeof(*param));
  param->mode = MODBUS_MODE_RTU;
  param->rx_timeout = zplc_modbus_rtu_rx_timeout_us(zplc_config_get_modbus_tcp_client_timeout_ms());
  param->serial.baud = zplc_config_get_modbus_rtu_baud();
  param->serial.parity = zplc_modbus_parity_to_uart(zplc_config_get_modbus_rtu_parity());
  param->serial.stop_bits = UART_CFG_STOP_BITS_1;
}

static int zplc_modbus_rtu_client_iface_init(void) {
#if ZPLC_HAS_MODBUS_RTU
  const char iface_name[] = DEVICE_DT_NAME(ZPLC_MODBUS_RTU_NODE);
  struct modbus_iface_param client_param;
  int iface = modbus_iface_get_by_name(iface_name);

  zplc_modbus_rtu_client_params(&client_param);
  if (iface < 0) {
    return iface;
  }

  if (modbus_init_client(iface, client_param) < 0) {
    return -EIO;
  }

  s_rtu_client_iface = iface;
  return 0;
#else
  return -ENODEV;
#endif
}

#if defined(CONFIG_NET_SOCKETS)
#include "zplc_modbus_tcp_client.inc"
#endif

int zplc_modbus_rtu_client_read_holding(uint8_t slave_id, uint16_t start_reg, uint16_t count, uint16_t *out) {
  if (out == NULL || count == 0U || count > 125U) {
    return -EINVAL;
  }

  if (s_rtu_client_iface < 0) {
    return -ENODEV;
  }

  return modbus_read_holding_regs(s_rtu_client_iface, slave_id, start_reg, out, count);
}

int zplc_modbus_rtu_client_write_register(uint8_t slave_id, uint16_t reg, uint16_t value) {
  if (s_rtu_client_iface < 0) {
    return -ENODEV;
  }

  return modbus_write_holding_reg(s_rtu_client_iface, slave_id, reg, value);
}

int zplc_modbus_rtu_client_write_multiple(uint8_t slave_id, uint16_t start_reg, uint16_t count, const uint16_t *values) {
  if (values == NULL || count == 0U || count > 123U || s_rtu_client_iface < 0) {
    return -EINVAL;
  }

  return modbus_write_holding_regs(s_rtu_client_iface, slave_id, start_reg, (uint16_t *const)values, count);
}

int zplc_modbus_rtu_client_read_coils(uint8_t slave_id, uint16_t start_addr, uint16_t count, uint8_t *out_bits) {
  if (out_bits == NULL || count == 0U || count > 2000U || s_rtu_client_iface < 0) {
    return -EINVAL;
  }

  return modbus_read_coils(s_rtu_client_iface, slave_id, start_addr, out_bits, count);
}

int zplc_modbus_rtu_client_write_coil(uint8_t slave_id, uint16_t addr, bool state) {
  if (s_rtu_client_iface < 0) {
    return -ENODEV;
  }

  return modbus_write_coil(s_rtu_client_iface, slave_id, addr, state);
}

#if !defined(CONFIG_NET_SOCKETS)
int zplc_modbus_tcp_client_read_holding(const char *host, uint16_t port, uint8_t unit_id, uint16_t start_reg, uint16_t count,
                                        uint16_t *out) {
  ARG_UNUSED(host);
  ARG_UNUSED(port);
  ARG_UNUSED(unit_id);
  ARG_UNUSED(start_reg);
  ARG_UNUSED(count);
  ARG_UNUSED(out);
  return -ENOTSUP;
}

int zplc_modbus_tcp_client_write_register(const char *host, uint16_t port, uint8_t unit_id, uint16_t reg, uint16_t value) {
  ARG_UNUSED(host);
  ARG_UNUSED(port);
  ARG_UNUSED(unit_id);
  ARG_UNUSED(reg);
  ARG_UNUSED(value);
  return -ENOTSUP;
}

int zplc_modbus_tcp_client_write_multiple(const char *host, uint16_t port, uint8_t unit_id, uint16_t start_reg, uint16_t count,
                                          const uint16_t *values) {
  ARG_UNUSED(host);
  ARG_UNUSED(port);
  ARG_UNUSED(unit_id);
  ARG_UNUSED(start_reg);
  ARG_UNUSED(count);
  ARG_UNUSED(values);
  return -ENOTSUP;
}

int zplc_modbus_tcp_client_read_coils(const char *host, uint16_t port, uint8_t unit_id, uint16_t start_addr, uint16_t count,
                                      uint8_t *out_bits) {
  ARG_UNUSED(host);
  ARG_UNUSED(port);
  ARG_UNUSED(unit_id);
  ARG_UNUSED(start_addr);
  ARG_UNUSED(count);
  ARG_UNUSED(out_bits);
  return -ENOTSUP;
}

int zplc_modbus_tcp_client_write_coil(const char *host, uint16_t port, uint8_t unit_id, uint16_t addr, bool state) {
  ARG_UNUSED(host);
  ARG_UNUSED(port);
  ARG_UNUSED(unit_id);
  ARG_UNUSED(addr);
  ARG_UNUSED(state);
  return -ENOTSUP;
}
#endif

int zplc_modbus_client_poll_tags(bool use_tcp) {
  uint16_t count = zplc_core_get_tag_count();
  uint16_t regs[2];
  int rc = 0;
  static bool warned_unreadable;

  for (uint16_t i = 0U; i < count; i++) {
    const zplc_tag_entry_t *tag = zplc_core_get_tag(i);
    zplc_modbus_location_t where;
    uint16_t width;
    uint32_t value;
    char host[128];

    if (tag == NULL || tag->tag_id != ZPLC_TAG_MODBUS) {
      continue;
    }

    /* The number of the tag says where the variable lives, in the notation of zplc_modbus_map.h; the address
         * on the remote device is the address of that area on the wire, not the number (COM-011). The client has
         * a read of holding registers and one of coils: a tag of a discrete input or an input register is a
         * variable the server serves, and is left to it. */
    width = modbus_register_width((zplc_data_type_t)tag->var_type);
    if (!zplc_modbus_locate(tag->value, tag->var_type == ZPLC_TYPE_BOOL, width, &where)) {
      continue;
    }
    if (where.area != ZPLC_MODBUS_AREA_HOLDING_REGISTER && where.area != ZPLC_MODBUS_AREA_COIL) {
      if (!warned_unreadable) {
        warned_unreadable = true;
        LOG_WRN("Modbus client: tag %u is in an area the client cannot read (discrete or input); skipped", i);
      }
      continue;
    }

    host[0] = '\0';
    if (use_tcp) {
      zplc_config_get_modbus_tcp_client_host(host, sizeof(host));
    }
    if (where.area == ZPLC_MODBUS_AREA_COIL) {
      uint8_t bit = 0U;

      rc = use_tcp ? zplc_modbus_tcp_client_read_coils(host, zplc_config_get_modbus_tcp_client_port(),
                                                       zplc_config_get_modbus_tcp_client_unit_id(), where.address, 1U, &bit)
                   : zplc_modbus_rtu_client_read_coils(zplc_config_get_modbus_rtu_client_slave_id(), where.address, 1U, &bit);
      value = bit & 1U;
    } else {
      rc = use_tcp ? zplc_modbus_tcp_client_read_holding(host, zplc_config_get_modbus_tcp_client_port(),
                                                         zplc_config_get_modbus_tcp_client_unit_id(), where.address, width, regs)
                   : zplc_modbus_rtu_client_read_holding(zplc_config_get_modbus_rtu_client_slave_id(), where.address, width, regs);
      value = (width == 2U) ? (((uint32_t)regs[0] << 16) | regs[1]) : regs[0];
    }

    if (rc < 0) {
      return rc;
    }

    rc = mem_write_val(tag->var_addr, (zplc_data_type_t)tag->var_type, value);
    if (rc != 0) {
      return rc;
    }
  }

  return 0;
}

static void modbus_rtu_client_thread(void *arg1, void *arg2, void *arg3) {
  uint32_t delay_ms = zplc_config_get_modbus_rtu_client_poll_ms();

  ARG_UNUSED(arg1);
  ARG_UNUSED(arg2);
  ARG_UNUSED(arg3);

  while (1) {
    int rc = zplc_modbus_client_poll_tags(false);
    if (rc < 0) {
      LOG_WRN("Modbus RTU client poll failed: %d", rc);
      delay_ms = MIN(delay_ms * 2U, 10000U);
    } else {
      delay_ms = zplc_config_get_modbus_rtu_client_poll_ms();
    }
    k_msleep(delay_ms);
  }
}

#if defined(CONFIG_NET_SOCKETS)
static void modbus_tcp_client_thread(void *arg1, void *arg2, void *arg3) {
  uint32_t delay_ms = zplc_config_get_modbus_tcp_client_poll_ms();

  ARG_UNUSED(arg1);
  ARG_UNUSED(arg2);
  ARG_UNUSED(arg3);

  while (1) {
    int rc = zplc_modbus_client_poll_tags(true);
    if (rc < 0) {
      LOG_WRN("Modbus TCP client poll failed: %d", rc);
      delay_ms = MIN(delay_ms * 2U, 10000U);
    } else {
      delay_ms = zplc_config_get_modbus_tcp_client_poll_ms();
    }
    k_msleep(delay_ms);
  }
}
#endif

int zplc_modbus_client_init(void) {
  if (zplc_config_get_modbus_rtu_client_enabled()) {
    if (zplc_modbus_rtu_client_iface_init() == 0) {
      k_thread_create(&s_rtu_client_thread, s_rtu_client_stack, K_THREAD_STACK_SIZEOF(s_rtu_client_stack), modbus_rtu_client_thread, NULL,
                      NULL, NULL, K_PRIO_PREEMPT(ZPLC_COMM_THREAD_PRIORITY), 0, K_NO_WAIT);
      k_thread_name_set(&s_rtu_client_thread, "modbus_rtu_client");
    } else {
      LOG_WRN("Modbus RTU client init skipped");
    }
  }

  if (zplc_config_get_modbus_tcp_client_enabled()) {
#if defined(CONFIG_NET_SOCKETS)
    k_thread_create(&s_tcp_client_thread, s_tcp_client_stack, K_THREAD_STACK_SIZEOF(s_tcp_client_stack), modbus_tcp_client_thread, NULL,
                    NULL, NULL, K_PRIO_PREEMPT(ZPLC_COMM_THREAD_PRIORITY), 0, K_NO_WAIT);
    k_thread_name_set(&s_tcp_client_thread, "modbus_tcp_client");
#else
    LOG_WRN("Modbus TCP client disabled: NET_SOCKETS not enabled");
#endif
  }

  return 0;
}
