#include "zplc_loader.h"

#include <stdlib.h>
#include <string.h>

static uint8_t workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];
static uint8_t repaired[ZPLC_MEM_CODE_SIZE + 4096U];

static uint32_t crc32_update(uint32_t crc, const uint8_t *data, size_t length) {
  size_t index;
  for (index = 0U; index < length; index++) {
    uint32_t bit;
    crc ^= data[index];
    for (bit = 0U; bit < 8U; bit++)
      crc = (crc & 1U) != 0U ? (crc >> 1) ^ 0xEDB88320U : crc >> 1;
  }
  return crc;
}

static void verify_once(const uint8_t *data, size_t size) {
  zplc_program_view_t sentinel;
  zplc_program_view_t view;
  int result;

  memset(&sentinel, 0xA5, sizeof(sentinel));
  memset(&view, 0, sizeof(view));
  memcpy(&view, &sentinel, sizeof(view));
  result = zplc_loader_verify(data, size, workspace, sizeof(workspace), &view);
  if (result != ZPLC_LOADER_OK && memcmp(&view, &sentinel, sizeof(view)) != 0)
    abort();
}

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size) {
  verify_once(data, size);

  /* The same bytes with a valid CRC32: a mutated input otherwise stops at the
   * checksum and never reaches the structure, the control-flow and the stack
   * verification behind it. */
  if (size >= ZPLC_FILE_HEADER_SIZE && size <= sizeof(repaired)) {
    uint32_t crc;
    memcpy(repaired, data, size);
    crc = crc32_update(0xFFFFFFFFU, repaired, 12U);
    crc = crc32_update(crc, repaired + 16U, size - 16U) ^ 0xFFFFFFFFU;
    repaired[12] = (uint8_t)crc;
    repaired[13] = (uint8_t)(crc >> 8);
    repaired[14] = (uint8_t)(crc >> 16);
    repaired[15] = (uint8_t)(crc >> 24);
    verify_once(repaired, size);
  }
  return 0;
}
