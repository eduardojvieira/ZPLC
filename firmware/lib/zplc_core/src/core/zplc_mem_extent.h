/**
 * @file zplc_mem_extent.h
 * @brief The one range check of PLC memory (RT-001).
 *
 * Every memory access a program can cause is placed with this function: the
 * VM loads and stores, the string operations and the communication opcodes,
 * and the loader's static check of the same accesses. An access is valid only
 * when its whole extent [addr, addr + len) lies inside ONE region; the
 * arithmetic cannot wrap, so a huge length or an address near 2^32 is simply
 * outside every region.
 *
 * A region is its window of the address space, from its base to the base of
 * the next region, or its configured size where that is smaller. A WORK or
 * RETAIN memory larger than its window (Kconfig does not bound it) does not
 * shift the regions after it: address 0x4000 is retentive memory, whatever the
 * size of WORK, and the bytes of a region beyond its window are not reachable.
 *
 * Internal header: not part of the public API.
 *
 * SPDX-License-Identifier: MIT
 */

#ifndef ZPLC_MEM_EXTENT_H
#define ZPLC_MEM_EXTENT_H

#include "zplc_isa.h"
#include <stddef.h>
#include <stdint.h>

/** Region indices returned by zplc_mem_extent_locate(). */
enum {
  ZPLC_MEM_REGION_IPI = 0,
  ZPLC_MEM_REGION_OPI = 1,
  ZPLC_MEM_REGION_WORK = 2,
  ZPLC_MEM_REGION_RETAIN = 3
};

/**
 * @brief Find the region that wholly contains [addr, addr + len).
 *
 * @param addr   Logical address (any 32-bit value)
 * @param len    Extent in bytes (any 32-bit value; 0 never fits)
 * @param offset Receives the offset of addr inside the region, or NULL
 * @return ZPLC_MEM_REGION_* index, or -1 when the extent is not inside one
 *         region (partly or wholly outside PLC memory, or crossing two)
 */
static inline int zplc_mem_extent_locate(uint32_t addr, uint32_t len,
                                         uint32_t *offset) {
  static const uint32_t bases[4] = {ZPLC_MEM_IPI_BASE, ZPLC_MEM_OPI_BASE,
                                    ZPLC_MEM_WORK_BASE, ZPLC_MEM_RETAIN_BASE};
  static const uint32_t sizes[4] = {ZPLC_MEM_IPI_SIZE, ZPLC_MEM_OPI_SIZE,
                                    ZPLC_MEM_WORK_SIZE, ZPLC_MEM_RETAIN_SIZE};
  static const uint32_t ends[4] = {ZPLC_MEM_OPI_BASE, ZPLC_MEM_WORK_BASE,
                                   ZPLC_MEM_RETAIN_BASE, ZPLC_MEM_CODE_BASE};
  uint32_t region;

  if (len == 0U) {
    return -1;
  }
  for (region = 0U; region < 4U; region++) {
    uint32_t size = sizes[region];

    if (size > ends[region] - bases[region]) {
      size = ends[region] - bases[region];
    }
    if (addr >= bases[region] && addr - bases[region] < size &&
        len <= size - (addr - bases[region])) {
      if (offset != NULL) {
        *offset = addr - bases[region];
      }
      return (int)region;
    }
  }
  return -1;
}

#endif /* ZPLC_MEM_EXTENT_H */
