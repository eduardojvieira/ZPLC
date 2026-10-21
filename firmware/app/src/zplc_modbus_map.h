/**
 * @file zplc_modbus_map.h
 * @brief Where a `{modbus:N}` variable is served (COM-011, COM-013).
 *
 * The four areas of a Modbus server are four address spaces: a coil, a
 * discrete input, an input register and a holding register with the same
 * number are four different things. The project says where a variable lives
 * with the number of its `{modbus:N}` tag, in the notation the Modbus world
 * has always used:
 *
 *   N                 area                address on the wire
 *   10001 to 19999    discrete input      N - 10001
 *   30001 to 39999    input register      N - 30001
 *   40001 to 49999    holding register    N - 40001
 *   any other         a BOOL: coil        N
 *                     any other type: holding register   N
 *
 * so a project that never wrote a prefix keeps the addresses it had, and a
 * variable is served in exactly one area. A variable of 32 bits takes two
 * consecutive registers; a bit area carries one bit for any variable.
 *
 * Pure C: the server, the client and the host tests use it.
 *
 * SPDX-License-Identifier: MIT
 */
#ifndef ZPLC_MODBUS_MAP_H
#define ZPLC_MODBUS_MAP_H

#include <stdbool.h>
#include <stdint.h>

#include "zplc_modbus_tcp.h"

/** Where a variable is served: its area, the address of its first item on the wire and how many items it takes. */
typedef struct {
  zplc_modbus_area_t area;
  uint16_t address;
  uint16_t width; /**< items: 1 bit in a bit area; 1 or 2 registers in a register area */
} zplc_modbus_location_t;

/**
 * @brief The place of a variable bound with number `number`.
 *
 * @param number     the `{modbus:N}` of the tag, or the number that overrides it
 * @param is_bool    the variable is a BOOL
 * @param registers  registers a variable of its type takes in a register area (1 or 2)
 * @return false when the tag does not name a place: a prefixed number whose address does not fit the area
 */
static inline bool zplc_modbus_locate(uint32_t number, bool is_bool, uint16_t registers, zplc_modbus_location_t *where) {
  if (number > 0xFFFFU || where == NULL) {
    return false;
  }
  if (number >= 40001U && number <= 49999U) {
    where->area = ZPLC_MODBUS_AREA_HOLDING_REGISTER;
    where->address = (uint16_t)(number - 40001U);
  } else if (number >= 30001U && number <= 39999U) {
    where->area = ZPLC_MODBUS_AREA_INPUT_REGISTER;
    where->address = (uint16_t)(number - 30001U);
  } else if (number >= 10001U && number <= 19999U) {
    where->area = ZPLC_MODBUS_AREA_DISCRETE_INPUT;
    where->address = (uint16_t)(number - 10001U);
  } else {
    where->area = is_bool ? ZPLC_MODBUS_AREA_COIL : ZPLC_MODBUS_AREA_HOLDING_REGISTER;
    where->address = (uint16_t)number;
  }
  where->width =
      (where->area == ZPLC_MODBUS_AREA_COIL || where->area == ZPLC_MODBUS_AREA_DISCRETE_INPUT) ? 1U : (registers == 2U ? 2U : 1U);
  return true;
}

/** The areas a client can write: the others are read-only to the network. */
static inline bool zplc_modbus_area_is_writable(zplc_modbus_area_t area) {
  return area == ZPLC_MODBUS_AREA_COIL || area == ZPLC_MODBUS_AREA_HOLDING_REGISTER;
}

/** True when the item at `request` of `area` is served by a variable located at `where`. */
static inline bool zplc_modbus_location_covers(const zplc_modbus_location_t *where, zplc_modbus_area_t area, uint16_t request,
                                               uint16_t *item) {
  if (where->area != area || request < where->address || (uint32_t)request >= (uint32_t)where->address + where->width) {
    return false;
  }
  if (item != NULL) {
    *item = (uint16_t)(request - where->address);
  }
  return true;
}

#endif /* ZPLC_MODBUS_MAP_H */
