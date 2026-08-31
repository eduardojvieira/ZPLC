/** @file zplc_loader.c @brief Pure structural and semantic ZPLC v1 verifier. */
#include "zplc_loader.h"
#include "zplc_comm_dispatch.h"
#include "zplc_isa.h"
#include <string.h>

#define ZPLC_CRC_OFFSET 12U
#define ZPLC_CRC_SIZE 4U
#define ZPLC_HEADER_FLAGS_SUPPORTED 0U

static uint16_t read_u16_le(const uint8_t *data) {
  return (uint16_t)((uint16_t)data[0] | ((uint16_t)data[1] << 8));
}
static uint32_t read_u32_le(const uint8_t *data) {
  return (uint32_t)data[0] | ((uint32_t)data[1] << 8) |
         ((uint32_t)data[2] << 16) | ((uint32_t)data[3] << 24);
}
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
static int validate_crc32(const uint8_t *data, size_t length) {
  uint32_t crc = crc32_update(0xFFFFFFFFU, data, ZPLC_CRC_OFFSET);
  crc = crc32_update(crc, data + ZPLC_CRC_OFFSET + ZPLC_CRC_SIZE,
                     length - ZPLC_CRC_OFFSET - ZPLC_CRC_SIZE);
  return (crc ^ 0xFFFFFFFFU) == read_u32_le(data + ZPLC_CRC_OFFSET)
             ? ZPLC_LOADER_OK
             : ZPLC_LOADER_ERR_CRC32;
}
static void bit_set(uint8_t *bits, uint32_t value) {
  bits[value / 8U] |= (uint8_t)(1U << (value % 8U));
}
static int bit_test(const uint8_t *bits, uint32_t value) {
  return (bits[value / 8U] & (uint8_t)(1U << (value % 8U))) != 0U;
}
static void bit_clear(uint8_t *bits, uint32_t value) {
  bits[value / 8U] &= (uint8_t)~(uint8_t)(1U << (value % 8U));
}

static int memory_access_valid(uint16_t address, uint8_t width, int writable) {
  const uint32_t start = address, end = start + width;
  if (end <= ZPLC_MEM_IPI_BASE + ZPLC_MEM_IPI_SIZE)
    return !writable;
  if (start >= ZPLC_MEM_OPI_BASE &&
      end <= ZPLC_MEM_OPI_BASE + ZPLC_MEM_OPI_SIZE)
    return 1;
  if (start >= ZPLC_MEM_WORK_BASE &&
      end <= ZPLC_MEM_WORK_BASE + ZPLC_MEM_WORK_SIZE)
    return 1;
  if (start >= ZPLC_MEM_RETAIN_BASE &&
      end <= ZPLC_MEM_RETAIN_BASE + ZPLC_MEM_RETAIN_SIZE)
    return 1;
  return 0;
}
static int verify_direct_memory(uint8_t opcode, uint16_t address) {
  uint8_t width;
  int writable;
  switch (opcode) {
  case OP_LOAD8:
    width = 1U;
    writable = 0;
    break;
  case OP_LOAD16:
    width = 2U;
    writable = 0;
    break;
  case OP_LOAD32:
    width = 4U;
    writable = 0;
    break;
  case OP_LOAD64:
    width = 8U;
    writable = 0;
    break;
  case OP_STORE8:
    width = 1U;
    writable = 1;
    break;
  case OP_STORE16:
    width = 2U;
    writable = 1;
    break;
  case OP_STORE32:
    width = 4U;
    writable = 1;
    break;
  case OP_STORE64:
    width = 8U;
    writable = 1;
    break;
  default:
    return ZPLC_LOADER_OK;
  }
  return memory_access_valid(address, width, writable) ? ZPLC_LOADER_OK
                                                       : ZPLC_LOADER_ERR_MEMORY;
}
static int mark_target(uint8_t *targets, uint32_t code_size, int32_t target) {
  if (target < 0 || (uint32_t)target >= code_size)
    return ZPLC_LOADER_ERR_CONTROL_FLOW;
  bit_set(targets, (uint32_t)target);
  return ZPLC_LOADER_OK;
}
static int verify_tasks(const zplc_program_view_t *view) {
  uint32_t index;

  if (view->task_count > ZPLC_LOADER_MAX_TASKS)
    return ZPLC_LOADER_ERR_TASK;
  for (index = 0U; index < view->task_count; index++) {
    const uint8_t *task = view->tasks + index * ZPLC_TASK_DEF_SIZE;
    uint16_t id = read_u16_le(task);
    uint16_t stack_size = read_u16_le(task + 10U);
    uint32_t previous;

    for (previous = 0U; previous < index; previous++)
      if (id == read_u16_le(view->tasks + previous * ZPLC_TASK_DEF_SIZE))
        return ZPLC_LOADER_ERR_TASK;
    if (task[2U] > ZPLC_TASK_INIT || read_u32_le(task + 4U) == 0U ||
        stack_size == 0U || stack_size > ZPLC_STACK_MAX_DEPTH ||
        read_u32_le(task + 12U) != 0U)
      return ZPLC_LOADER_ERR_TASK;
  }
  return ZPLC_LOADER_OK;
}
static uint8_t tag_type_width(uint8_t tag_id, uint8_t type) {
  switch (tag_id) {
  case ZPLC_TAG_PUBLISH:
  case ZPLC_TAG_SUBSCRIBE:
    switch (type) {
    case ZPLC_TYPE_BOOL:
      return 1U;
    case ZPLC_TYPE_INT:
    case ZPLC_TYPE_UINT:
    case ZPLC_TYPE_WORD:
      return 2U;
    case ZPLC_TYPE_REAL:
      return 4U;
    default:
      return 0U;
    }
  case ZPLC_TAG_MODBUS:
    switch (type) {
    case ZPLC_TYPE_BOOL:
    case ZPLC_TYPE_SINT:
    case ZPLC_TYPE_USINT:
    case ZPLC_TYPE_BYTE:
      return 1U;
    case ZPLC_TYPE_INT:
    case ZPLC_TYPE_UINT:
    case ZPLC_TYPE_WORD:
      return 2U;
    case ZPLC_TYPE_REAL:
    case ZPLC_TYPE_DINT:
    case ZPLC_TYPE_UDINT:
    case ZPLC_TYPE_DWORD:
      return 4U;
    default:
      return 0U;
    }
  default:
    return 0U;
  }
}
static int tag_memory_access_valid(uint16_t address, uint8_t width,
                                   int writable) {
  const uint32_t start = address, end = start + width;

  if (!memory_access_valid(address, width, writable))
    return 0;
  if (!writable)
    return 1;
  return (start >= ZPLC_MEM_WORK_BASE &&
          end <= ZPLC_MEM_WORK_BASE + ZPLC_MEM_WORK_SIZE) ||
         (start >= ZPLC_MEM_RETAIN_BASE &&
          end <= ZPLC_MEM_RETAIN_BASE + ZPLC_MEM_RETAIN_SIZE);
}
static int verify_tags(const zplc_program_view_t *view) {
  uint32_t index;

  for (index = 0U; index < view->tag_count; index++) {
    const uint8_t *tag = view->tags + index * ZPLC_TAG_ENTRY_SIZE;
    const uint16_t address = read_u16_le(tag);
    const uint8_t tag_id = tag[3U];
    const uint8_t width = tag_type_width(tag_id, tag[2U]);
    const int writable = tag_id != ZPLC_TAG_PUBLISH;

    if (width == 0U ||
        !tag_memory_access_valid(address, width, writable) ||
        /* Current communication adapters discard this high WORK offset. */
        (address & 0xF000U) == 0x3000U ||
        (tag_id == ZPLC_TAG_MODBUS && read_u32_le(tag + 4U) > UINT16_MAX))
      return ZPLC_LOADER_ERR_TAGS;
  }
  return ZPLC_LOADER_OK;
}
static int instruction_has_no_fallthrough(uint8_t opcode) {
  return opcode == OP_HALT || opcode == OP_RET || opcode == OP_JMP ||
         opcode == OP_JR;
}
static int verify_code(const zplc_program_view_t *view, uint8_t *workspace) {
  const uint8_t *code = view->code;
  uint32_t pc = 0U, task_index;
  uint8_t last_opcode = 0U;
  int result;
  memset(workspace, 0, (view->code_size + 7U) / 8U);
  if (mark_target(workspace, view->code_size, view->entry_point) !=
      ZPLC_LOADER_OK)
    return ZPLC_LOADER_ERR_ENTRY_POINT;
  for (task_index = 0U; task_index < view->task_count; task_index++) {
    result = mark_target(
        workspace, view->code_size,
        read_u16_le(view->tasks + task_index * ZPLC_TASK_DEF_SIZE + 8U));
    if (result != ZPLC_LOADER_OK)
      return result;
  }
  while (pc < view->code_size) {
    uint8_t opcode = code[pc], operand_size;
    if (!zplc_opcode_is_valid(opcode))
      return ZPLC_LOADER_ERR_OPCODE;
    operand_size = zplc_opcode_operand_size(opcode);
    if (operand_size > view->code_size - pc - 1U)
      return ZPLC_LOADER_ERR_OPCODE;
    if (opcode == OP_JMP || opcode == OP_JZ || opcode == OP_JNZ ||
        opcode == OP_CALL)
      result =
          mark_target(workspace, view->code_size, read_u16_le(code + pc + 1U));
    else if (opcode == OP_JR || opcode == OP_JRZ || opcode == OP_JRNZ)
      result = mark_target(workspace, view->code_size,
                           (int32_t)pc + 2 + (int8_t)code[pc + 1U]);
    else if (opcode >= OP_LOAD8 && opcode <= OP_STORE64)
      result = verify_direct_memory(opcode, read_u16_le(code + pc + 1U));
    else if (opcode == OP_COMM_EXEC || opcode == OP_COMM_STATUS ||
             opcode == OP_COMM_RESET) {
      uint32_t kind = read_u32_le(code + pc + 1U);
      result = (kind == ZPLC_COMM_FB_NONE || kind >= ZPLC_COMM_FB_KIND_MAX)
                   ? ZPLC_LOADER_ERR_COMM
                   : ZPLC_LOADER_OK;
    } else
      result = ZPLC_LOADER_OK;
    if (result != ZPLC_LOADER_OK)
      return result;
    last_opcode = opcode;
    pc += 1U + operand_size;
  }
  if (!instruction_has_no_fallthrough(last_opcode))
    return ZPLC_LOADER_ERR_CONTROL_FLOW;
  pc = 0U;
  while (pc < view->code_size) {
    bit_clear(workspace, pc);
    pc += 1U + zplc_opcode_operand_size(code[pc]);
  }
  for (pc = 0U; pc < view->code_size; pc++)
    if (bit_test(workspace, pc))
      return ZPLC_LOADER_ERR_CONTROL_FLOW;
  return ZPLC_LOADER_OK;
}
int zplc_loader_verify(const uint8_t *data, size_t length, uint8_t *workspace,
                       size_t workspace_size, zplc_program_view_t *out) {
  zplc_program_view_t candidate;
  size_t table_size, offset;
  uint16_t index;
  uint32_t data_size = 0U;
  int result;
  if (data == NULL || out == NULL || length < ZPLC_FILE_HEADER_SIZE)
    return ZPLC_LOADER_ERR_SIZE;
  if (workspace == NULL || workspace_size < ZPLC_LOADER_VERIFY_WORKSPACE_SIZE)
    return ZPLC_LOADER_ERR_WORKSPACE;
  if (data[0] != 0x5AU || data[1] != 0x50U || data[2] != 0x4CU ||
      data[3] != 0x43U)
    return ZPLC_LOADER_ERR_MAGIC;
  if (read_u16_le(data + 4U) != ZPLC_VERSION_MAJOR ||
      read_u16_le(data + 6U) != ZPLC_VERSION_MINOR)
    return ZPLC_LOADER_ERR_VERSION;
  if ((read_u32_le(data + 8U) & ~ZPLC_HEADER_FLAGS_SUPPORTED) != 0U)
    return ZPLC_LOADER_ERR_FLAGS;
  if (read_u32_le(data + 28U) != 0U)
    return ZPLC_LOADER_ERR_SIZE;
  if (validate_crc32(data, length) != ZPLC_LOADER_OK)
    return ZPLC_LOADER_ERR_CRC32;
  memset(&candidate, 0, sizeof(candidate));
  candidate.binary = data;
  candidate.binary_size = length;
  candidate.code_size = read_u32_le(data + 16U);
  candidate.entry_point = read_u16_le(data + 24U);
  candidate.flags = read_u32_le(data + 8U);
  candidate.segment_count = read_u16_le(data + 26U);
  if (candidate.code_size > ZPLC_MEM_CODE_SIZE ||
      candidate.code_size > UINT16_MAX)
    return ZPLC_LOADER_ERR_SIZE;
  if ((size_t)candidate.segment_count >
      (length - ZPLC_FILE_HEADER_SIZE) / ZPLC_SEGMENT_ENTRY_SIZE)
    return ZPLC_LOADER_ERR_SIZE;
  table_size = (size_t)candidate.segment_count * ZPLC_SEGMENT_ENTRY_SIZE;
  offset = ZPLC_FILE_HEADER_SIZE + table_size;
  for (index = 0U; index < candidate.segment_count; index++) {
    const uint8_t *entry = data + ZPLC_FILE_HEADER_SIZE +
                           ((size_t)index * ZPLC_SEGMENT_ENTRY_SIZE);
    uint16_t type = read_u16_le(entry), flags = read_u16_le(entry + 2U);
    uint32_t size = read_u32_le(entry + 4U);
    zplc_program_segment_t *segment;
    if (flags != 0U || size > length - offset)
      return ZPLC_LOADER_ERR_SEGMENT;
    if (type == ZPLC_SEG_CODE) {
      if (candidate.code != NULL)
        return ZPLC_LOADER_ERR_SEGMENT;
      candidate.code = data + offset;
      segment = &candidate.segments[0];
    } else if (type == ZPLC_SEG_TASK) {
      if (candidate.tasks != NULL || size == 0U ||
          size % ZPLC_TASK_DEF_SIZE != 0U)
        return ZPLC_LOADER_ERR_SEGMENT;
      candidate.tasks = data + offset;
      candidate.task_count = size / ZPLC_TASK_DEF_SIZE;
      if (candidate.task_count > ZPLC_LOADER_MAX_TASKS)
        return ZPLC_LOADER_ERR_TASK;
      segment = &candidate.segments[1];
    } else if (type == ZPLC_SEG_TAGS) {
      if (candidate.tags != NULL || size == 0U ||
          size % ZPLC_TAG_ENTRY_SIZE != 0U)
        return ZPLC_LOADER_ERR_SEGMENT;
      candidate.tags = data + offset;
      candidate.tag_count = size / ZPLC_TAG_ENTRY_SIZE;
      segment = &candidate.segments[2];
    } else
      return ZPLC_LOADER_ERR_SEGMENT;
    segment->type = type;
    segment->flags = flags;
    segment->data = data + offset;
    segment->size = size;
    if (type != ZPLC_SEG_CODE) {
      if (UINT32_MAX - data_size < size)
        return ZPLC_LOADER_ERR_SIZE;
      data_size += size;
    }
    offset += size;
  }
  if (offset != length)
    return ZPLC_LOADER_ERR_SIZE;
  if (candidate.code == NULL || candidate.code_size == 0U ||
      candidate.segments[0].size != candidate.code_size)
    return ZPLC_LOADER_ERR_NO_CODE;
  if (data_size != read_u32_le(data + 20U))
    return ZPLC_LOADER_ERR_SEGMENT;
  if ((uint32_t)candidate.entry_point >= candidate.code_size)
    return ZPLC_LOADER_ERR_ENTRY_POINT;
  if (candidate.tag_count > ZPLC_MAX_TAGS)
    return ZPLC_LOADER_ERR_TAGS;
  result = verify_tags(&candidate);
  if (result != ZPLC_LOADER_OK)
    return result;
  result = verify_tasks(&candidate);
  if (result != ZPLC_LOADER_OK)
    return result;
  result = verify_code(&candidate, workspace);
  if (result != ZPLC_LOADER_OK)
    return result;
  *out = candidate;
  return ZPLC_LOADER_OK;
}
