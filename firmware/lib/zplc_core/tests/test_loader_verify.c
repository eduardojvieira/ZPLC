#include "zplc_isa.h"
#include "zplc_loader.h"

#include <stdio.h>
#include <string.h>

#ifndef ZPLC_LOADER_FIXTURE_PATH
#error "ZPLC_LOADER_FIXTURE_PATH must be defined"
#endif

static int failures;
static uint8_t workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];
static uint8_t original[1024];

#define CHECK(condition, message)                                              \
  do {                                                                         \
    if (!(condition)) {                                                        \
      fprintf(stderr, "FAIL: %s (line %d)\n", message, __LINE__);              \
      failures++;                                                              \
    }                                                                          \
  } while (0)

static int hex_value(int character) {
  if (character >= '0' && character <= '9')
    return character - '0';
  if (character >= 'a' && character <= 'f')
    return character - 'a' + 10;
  if (character >= 'A' && character <= 'F')
    return character - 'A' + 10;
  return -1;
}

static size_t read_fixture(uint8_t *out, size_t capacity) {
  FILE *file = fopen(ZPLC_LOADER_FIXTURE_PATH, "r");
  int high = -1;
  int character;
  size_t count = 0;

  if (file == NULL)
    return 0;
  while ((character = fgetc(file)) != EOF) {
    int value = hex_value(character);
    if (value < 0)
      continue;
    if (high < 0) {
      high = value;
    } else {
      if (count == capacity) {
        (void)fclose(file);
        return 0;
      }
      out[count++] = (uint8_t)((high << 4) | value);
      high = -1;
    }
  }
  (void)fclose(file);
  return high < 0 ? count : 0;
}

static uint32_t crc32_update(uint32_t crc, const uint8_t *data, size_t length) {
  size_t index;

  for (index = 0U; index < length; index++) {
    uint32_t bit;
    crc ^= data[index];
    for (bit = 0U; bit < 8U; bit++) {
      crc = (crc & 1U) != 0U ? (crc >> 1) ^ 0xEDB88320U : crc >> 1;
    }
  }
  return crc;
}

static void refresh_crc(uint8_t *file, size_t length) {
  uint32_t crc;

  crc = crc32_update(0xFFFFFFFFU, file, 12U);
  crc = crc32_update(crc, file + 16U, length - 16U) ^ 0xFFFFFFFFU;
  file[12] = (uint8_t)crc;
  file[13] = (uint8_t)(crc >> 8);
  file[14] = (uint8_t)(crc >> 16);
  file[15] = (uint8_t)(crc >> 24);
}

static void write_u16_le(uint8_t *data, uint16_t value) {
  data[0] = (uint8_t)value;
  data[1] = (uint8_t)(value >> 8);
}

static void write_u32_le(uint8_t *data, uint32_t value) {
  data[0] = (uint8_t)value;
  data[1] = (uint8_t)(value >> 8);
  data[2] = (uint8_t)(value >> 16);
  data[3] = (uint8_t)(value >> 24);
}

static size_t make_program(uint8_t *file, const uint8_t *code,
                           size_t code_size) {
  size_t code_offset = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE;
  size_t task_offset = code_offset + code_size;
  size_t length = task_offset + ZPLC_TASK_DEF_SIZE;
  memset(file, 0, length);
  memcpy(file, "ZPLC", 4U);
  write_u16_le(file + 4U, ZPLC_VERSION_MAJOR);
  write_u16_le(file + 6U, ZPLC_VERSION_MINOR);
  write_u32_le(file + 16U, (uint32_t)code_size);
  write_u32_le(file + 20U, ZPLC_TASK_DEF_SIZE);
  write_u16_le(file + 26U, 2U);
  file[32] = ZPLC_SEG_CODE;
  write_u32_le(file + 36U, (uint32_t)code_size);
  file[40] = ZPLC_SEG_TASK;
  write_u32_le(file + 44U, ZPLC_TASK_DEF_SIZE);
  memcpy(file + code_offset, code, code_size);
  write_u32_le(file + task_offset + 4U, 10000U);
  write_u16_le(file + task_offset + 10U, 64U);
  refresh_crc(file, length);
  return length;
}

static size_t make_tag_program(uint8_t *file, uint16_t address, uint8_t type,
                               uint8_t tag_id, uint32_t value) {
  const size_t code_offset =
      ZPLC_FILE_HEADER_SIZE + 3U * ZPLC_SEGMENT_ENTRY_SIZE;
  const size_t task_offset = code_offset + 1U;
  const size_t tags_offset = task_offset + ZPLC_TASK_DEF_SIZE;
  const size_t length = tags_offset + ZPLC_TAG_ENTRY_SIZE;

  memset(file, 0, length);
  memcpy(file, "ZPLC", 4U);
  write_u16_le(file + 4U, ZPLC_VERSION_MAJOR);
  write_u16_le(file + 6U, ZPLC_VERSION_MINOR);
  write_u32_le(file + 16U, 1U);
  write_u32_le(file + 20U, ZPLC_TASK_DEF_SIZE + ZPLC_TAG_ENTRY_SIZE);
  write_u16_le(file + 26U, 3U);
  file[32U] = ZPLC_SEG_CODE;
  write_u32_le(file + 36U, 1U);
  file[40U] = ZPLC_SEG_TASK;
  write_u32_le(file + 44U, ZPLC_TASK_DEF_SIZE);
  file[48U] = ZPLC_SEG_TAGS;
  write_u32_le(file + 52U, ZPLC_TAG_ENTRY_SIZE);
  file[code_offset] = OP_RET;
  write_u32_le(file + task_offset + 4U, 10000U);
  write_u16_le(file + task_offset + 10U, 64U);
  write_u16_le(file + tags_offset, address);
  file[tags_offset + 2U] = type;
  file[tags_offset + 3U] = tag_id;
  write_u32_le(file + tags_offset + 4U, value);
  refresh_crc(file, length);
  return length;
}

static void expect_rejection(const uint8_t *file, size_t length, int expected,
                             const char *message) {
  zplc_program_view_t view;
  zplc_program_view_t sentinel;

  CHECK(length <= sizeof(original), "test input fits purity buffer");
  memcpy(original, file, length);
  memset(&sentinel, 0xA5, sizeof(sentinel));
  view = sentinel;
  CHECK(zplc_loader_verify(file, length, workspace, sizeof(workspace), &view) ==
            expected,
        message);
  CHECK(memcmp(file, original, length) == 0,
        "rejected input remains unchanged");
  CHECK(memcmp(&view, &sentinel, sizeof(view)) == 0,
        "rejected verification leaves output unchanged");
}

static void expect_rejection_with_workspace(const uint8_t *file, size_t length,
                                            size_t workspace_size, int expected,
                                            const char *message) {
  zplc_program_view_t view;
  zplc_program_view_t sentinel;

  memset(&sentinel, 0xA5, sizeof(sentinel));
  view = sentinel;
  CHECK(zplc_loader_verify(file, length, workspace, workspace_size, &view) ==
            expected,
        message);
  CHECK(memcmp(&view, &sentinel, sizeof(view)) == 0,
        "rejected verification leaves output unchanged");
}

static void test_valid_fixture_and_purity(void) {
  uint8_t file[128];
  uint8_t original[128];
  zplc_program_view_t view;
  zplc_program_view_t sentinel;
  const size_t length = read_fixture(file, sizeof(file));

  CHECK(length == 82U, "shared assembler fixture has expected length");
  memcpy(original, file, length);
  memset(&sentinel, 0xA5, sizeof(sentinel));
  view = sentinel;
  CHECK(zplc_loader_verify(file, length, workspace, sizeof(workspace), &view) ==
            ZPLC_LOADER_OK,
        "valid CODE+TASK+TAGS fixture verifies");
  CHECK(memcmp(file, original, length) == 0, "verifier does not mutate input");
  CHECK(view.binary == file && view.code_size == 2U && view.code[0] == 0U,
        "view exposes code");
  CHECK(view.task_count == 1U && view.tag_count == 1U,
        "view exposes task and tag counts");
  CHECK(view.segment_count == 3U && view.segments[2].type == 0x30U,
        "view exposes segments");

  file[0] ^= 1U;
  view = sentinel;
  CHECK(zplc_loader_verify(file, length, workspace, sizeof(workspace), &view) ==
            ZPLC_LOADER_ERR_MAGIC,
        "invalid binary is rejected");
  CHECK(memcmp(&view, &sentinel, sizeof(view)) == 0,
        "failed verification does not mutate output");
}

static void test_structural_rejections(void) {
  uint8_t file[128];
  const size_t length = read_fixture(file, sizeof(file));

  CHECK(zplc_loader_verify(NULL, length, workspace, sizeof(workspace), NULL) ==
            ZPLC_LOADER_ERR_SIZE,
        "null input is rejected");
  CHECK(zplc_loader_verify(file, length, workspace, sizeof(workspace), NULL) ==
            ZPLC_LOADER_ERR_SIZE,
        "null output is rejected");
  expect_rejection(file, 31U, ZPLC_LOADER_ERR_SIZE, "short header is rejected");
  file[4] = 2U;
  refresh_crc(file, length);
  expect_rejection(file, length, ZPLC_LOADER_ERR_VERSION,
                   "unknown ABI version is rejected");
  (void)read_fixture(file, sizeof(file));
  file[8] = 0x08U;
  refresh_crc(file, length);
  expect_rejection(file, length, ZPLC_LOADER_ERR_FLAGS,
                   "signed flag is unsupported without signature verification");
  (void)read_fixture(file, sizeof(file));
  file[28] = 1U;
  refresh_crc(file, length);
  expect_rejection(file, length, ZPLC_LOADER_ERR_SIZE,
                   "non-zero header reserved is rejected");
  (void)read_fixture(file, sizeof(file));
  file[16] = 3U;
  expect_rejection(file, length, ZPLC_LOADER_ERR_CRC32,
                   "CRC covers bytes after the CRC field");
  (void)read_fixture(file, sizeof(file));
  file[36] = 1U;
  expect_rejection(file, length, ZPLC_LOADER_ERR_CRC32,
                   "CRC covers segment table");
  (void)read_fixture(file, sizeof(file));
  file[34] = 1U;
  refresh_crc(file, length);
  expect_rejection(file, length, ZPLC_LOADER_ERR_SEGMENT,
                   "segment flags are unsupported");
  (void)read_fixture(file, sizeof(file));
  file[40] = 0x7FU;
  refresh_crc(file, length);
  expect_rejection(file, length, ZPLC_LOADER_ERR_SEGMENT,
                   "unknown ABI v1 segment type is rejected");
  (void)read_fixture(file, sizeof(file));
  file[16] = 1U;
  refresh_crc(file, length);
  expect_rejection(file, length, ZPLC_LOADER_ERR_NO_CODE,
                   "header code size must match CODE segment");
  (void)read_fixture(file, sizeof(file));
  file[20] = 0U;
  refresh_crc(file, length);
  expect_rejection(file, length, ZPLC_LOADER_ERR_SEGMENT,
                   "header data size must match metadata segments");
  (void)read_fixture(file, sizeof(file));
  file[24] = 2U;
  refresh_crc(file, length);
  expect_rejection(file, length, ZPLC_LOADER_ERR_ENTRY_POINT,
                   "entry point must lie in CODE");
  (void)read_fixture(file, sizeof(file));
  file[length] = 0U;
  refresh_crc(file, length + 1U);
  expect_rejection(file, length + 1U, ZPLC_LOADER_ERR_SIZE,
                   "trailing bytes are rejected");
  (void)read_fixture(file, sizeof(file));
  file[26] = 7U;
  refresh_crc(file, length);
  expect_rejection(file, length, ZPLC_LOADER_ERR_SIZE,
                   "truncated segment table is rejected");
  (void)read_fixture(file, sizeof(file));
  file[36] = 0xFFU;
  file[37] = 0xFFU;
  file[38] = 0xFFU;
  file[39] = 0xFFU;
  refresh_crc(file, length);
  expect_rejection(file, length, ZPLC_LOADER_ERR_SEGMENT,
                   "oversized segment payload is rejected");
  (void)read_fixture(file, sizeof(file));
  file[36] = 3U;
  refresh_crc(file, length);
  expect_rejection(file, length, ZPLC_LOADER_ERR_SEGMENT,
                   "truncated segment payload is rejected");
  (void)read_fixture(file, sizeof(file));
  file[40] = 1U;
  refresh_crc(file, length);
  expect_rejection(file, length, ZPLC_LOADER_ERR_SEGMENT,
                   "duplicate CODE segment is rejected");
  (void)read_fixture(file, sizeof(file));
  file[16] = 0U;
  file[36] = 0U;
  refresh_crc(file, length - 2U);
  expect_rejection(file, length - 2U, ZPLC_LOADER_ERR_NO_CODE,
                   "empty CODE segment is rejected");
  (void)read_fixture(file, sizeof(file));
  file[20] = 23U;
  file[44] = 15U;
  refresh_crc(file, length - 1U);
  expect_rejection(file, length - 1U, ZPLC_LOADER_ERR_SEGMENT,
                   "TASK size must be a multiple of 16");
  (void)read_fixture(file, sizeof(file));
  file[20] = 23U;
  file[52] = 7U;
  refresh_crc(file, length - 1U);
  expect_rejection(file, length - 1U, ZPLC_LOADER_ERR_SEGMENT,
                   "TAGS size must be a multiple of 8");
  (void)read_fixture(file, sizeof(file));
  file[40] = 2U;
  refresh_crc(file, length);
  expect_rejection(file, length, ZPLC_LOADER_ERR_SEGMENT,
                   "known but unsupported DATA segment is rejected");
  (void)read_fixture(file, sizeof(file));
  file[16] = (uint8_t)(ZPLC_MEM_CODE_SIZE + 1U);
  file[17] = (uint8_t)((ZPLC_MEM_CODE_SIZE + 1U) >> 8);
  file[36] = file[16];
  file[37] = file[17];
  refresh_crc(file, length);
  expect_rejection(file, length, ZPLC_LOADER_ERR_SIZE,
                   "CODE larger than the configured memory limit is rejected");
  (void)read_fixture(file, sizeof(file));
  file[16] = (uint8_t)ZPLC_MEM_CODE_SIZE;
  file[17] = (uint8_t)(ZPLC_MEM_CODE_SIZE >> 8);
  file[36] = file[16];
  file[37] = file[17];
  refresh_crc(file, length);
  expect_rejection(
      file, length, ZPLC_LOADER_ERR_SEGMENT,
      "CODE at the configured memory limit reaches payload validation");
  (void)read_fixture(file, sizeof(file));
  file[44] = 0U;
  refresh_crc(file, length);
  expect_rejection(file, length, ZPLC_LOADER_ERR_SEGMENT,
                   "empty TASK segment is rejected");
  (void)read_fixture(file, sizeof(file));
  file[52] = 0U;
  refresh_crc(file, length);
  expect_rejection(file, length, ZPLC_LOADER_ERR_SEGMENT,
                   "empty TAGS segment is rejected");
}

static void test_semantic_rejections_and_acceptance(void) {
  uint8_t file[512];
  uint8_t code[] = {OP_I2F, OP_EXT8, OP_COMM_EXEC, 1U, 0U, 0U, 0U, OP_RET};
  size_t length = make_program(file, code, sizeof(code));
  size_t task_offset = 32U + 16U + sizeof(code);

  {
    zplc_program_view_t view;
    CHECK(zplc_loader_verify(file, length, NULL, 0U, &view) ==
              ZPLC_LOADER_ERR_WORKSPACE,
          "null workspace is rejected");
    CHECK(zplc_loader_verify(file, length, workspace, sizeof(workspace) - 1U,
                             &view) == ZPLC_LOADER_ERR_WORKSPACE,
          "small workspace is rejected");
    CHECK(zplc_loader_verify(file, length, workspace, sizeof(workspace),
                             &view) == ZPLC_LOADER_OK,
          "RET conversions and COMM are valid");
  }

  {
    const uint8_t ending[] = {OP_NOP};
    length = make_program(file, ending, sizeof(ending));
  }
  expect_rejection(file, length, ZPLC_LOADER_ERR_CONTROL_FLOW,
                   "final NOP cannot fall through past CODE");
  {
    const uint8_t ending[] = {OP_PUSH8, 0U};
    length = make_program(file, ending, sizeof(ending));
  }
  expect_rejection(file, length, ZPLC_LOADER_ERR_CONTROL_FLOW,
                   "final PUSH cannot fall through past CODE");
  {
    const uint8_t ending[] = {OP_JRZ, 0xFEU};
    length = make_program(file, ending, sizeof(ending));
  }
  expect_rejection(file, length, ZPLC_LOADER_ERR_CONTROL_FLOW,
                   "final conditional jump cannot fall through past CODE");
  {
    const uint8_t ending[] = {OP_CALL, 0U, 0U};
    length = make_program(file, ending, sizeof(ending));
  }
  expect_rejection(file, length, ZPLC_LOADER_ERR_CONTROL_FLOW,
                   "final CALL cannot fall through past CODE");
  {
    const uint8_t ending[] = {OP_HALT};
    length = make_program(file, ending, sizeof(ending));
  }
  CHECK(zplc_loader_verify(file, length, workspace, sizeof(workspace),
                           &(zplc_program_view_t){0}) == ZPLC_LOADER_OK,
        "final HALT is accepted");
  {
    const uint8_t ending[] = {OP_RET};
    length = make_program(file, ending, sizeof(ending));
  }
  CHECK(zplc_loader_verify(file, length, workspace, sizeof(workspace),
                           &(zplc_program_view_t){0}) == ZPLC_LOADER_OK,
        "final RET is accepted");
  {
    const uint8_t ending[] = {OP_JMP, 0U, 0U};
    length = make_program(file, ending, sizeof(ending));
  }
  CHECK(zplc_loader_verify(file, length, workspace, sizeof(workspace),
                           &(zplc_program_view_t){0}) == ZPLC_LOADER_OK,
        "final unconditional JMP is accepted");
  {
    const uint8_t ending[] = {OP_JR, 0xFEU};
    length = make_program(file, ending, sizeof(ending));
  }
  CHECK(zplc_loader_verify(file, length, workspace, sizeof(workspace),
                           &(zplc_program_view_t){0}) == ZPLC_LOADER_OK,
        "final unconditional JR is accepted");
  {
    const uint8_t ending[] = {OP_RET};
    length = make_program(file, ending, sizeof(ending));
  }
  expect_rejection_with_workspace(file, length, sizeof(workspace) - 1U,
                                  ZPLC_LOADER_ERR_WORKSPACE,
                                  "one byte below exact workspace is rejected");

  code[0] = 0x04U;
  length = make_program(file, code, sizeof(code));
  expect_rejection(file, length, ZPLC_LOADER_ERR_OPCODE,
                   "unknown opcode with valid CRC is rejected");
  code[0] = OP_PUSH32;
  length = make_program(file, code, 2U);
  expect_rejection(file, length, ZPLC_LOADER_ERR_OPCODE,
                   "truncated operand is rejected");

  {
    const uint8_t jump[] = {OP_JMP, 9U, 0U, OP_RET};
    length = make_program(file, jump, sizeof(jump));
  }
  expect_rejection(file, length, ZPLC_LOADER_ERR_CONTROL_FLOW,
                   "absolute jump outside CODE is rejected");
  {
    const uint8_t jump[] = {OP_JR, 0x7FU, OP_RET};
    length = make_program(file, jump, sizeof(jump));
  }
  expect_rejection(file, length, ZPLC_LOADER_ERR_CONTROL_FLOW,
                   "relative jump outside CODE is rejected");
  {
    const uint8_t jump[] = {OP_JR, 0x80U, OP_RET};
    length = make_program(file, jump, sizeof(jump));
  }
  expect_rejection(file, length, ZPLC_LOADER_ERR_CONTROL_FLOW,
                   "relative jump underflow is rejected");
  {
    const uint8_t jump[] = {OP_PUSH16, 0U, 0U, OP_JMP, 1U, 0U, OP_RET};
    length = make_program(file, jump, sizeof(jump));
  }
  expect_rejection(file, length, ZPLC_LOADER_ERR_CONTROL_FLOW,
                   "jump into operand is rejected");
  {
    const uint8_t jump[] = {OP_PUSH16, 0U, 0U, OP_RET};
    length = make_program(file, jump, sizeof(jump));
  }
  write_u16_le(file + 24U, 1U);
  refresh_crc(file, length);
  expect_rejection(file, length, ZPLC_LOADER_ERR_CONTROL_FLOW,
                   "header entry inside operand is rejected");
  {
    const uint8_t jump[] = {OP_PUSH16, 0U, 0U, OP_RET};
    length = make_program(file, jump, sizeof(jump));
  }
  write_u16_le(file + 32U + 16U +
                   sizeof((uint8_t[]){OP_PUSH16, 0U, 0U, OP_RET}) + 8U,
               1U);
  refresh_crc(file, length);
  expect_rejection(file, length, ZPLC_LOADER_ERR_CONTROL_FLOW,
                   "task entry inside operand is rejected");
  {
    const uint8_t jump[] = {OP_RET};
    length = make_program(file, jump, sizeof(jump));
  }
  write_u16_le(file + 49U + 8U, 1U);
  refresh_crc(file, length);
  expect_rejection(file, length, ZPLC_LOADER_ERR_CONTROL_FLOW,
                   "task entry outside CODE is rejected");
  {
    const uint8_t jump[] = {OP_JR, 0xFEU, OP_RET};
    length = make_program(file, jump, sizeof(jump));
  }
  CHECK(zplc_loader_verify(file, length, workspace, sizeof(workspace),
                           &(zplc_program_view_t){0}) == ZPLC_LOADER_OK,
        "backward relative jump to instruction boundary is valid");

  {
    const uint8_t load[] = {OP_LOAD16, 0xFFU, 0x0FU, OP_RET};
    length = make_program(file, load, sizeof(load));
  }
  expect_rejection(file, length, ZPLC_LOADER_ERR_MEMORY,
                   "direct read across IPI boundary is rejected");
  {
    const uint8_t store[] = {OP_STORE8, 0U, 0U, OP_RET};
    length = make_program(file, store, sizeof(store));
  }
  expect_rejection(file, length, ZPLC_LOADER_ERR_MEMORY,
                   "direct store to IPI is rejected");
  {
    const uint8_t load[] = {OP_LOAD32, 0U,    0x20U, OP_STORE16,
                            0U,        0x10U, OP_RET};
    length = make_program(file, load, sizeof(load));
  }
  CHECK(zplc_loader_verify(file, length, workspace, sizeof(workspace),
                           &(zplc_program_view_t){0}) == ZPLC_LOADER_OK,
        "direct accesses in valid regions are accepted");

  code[0] = OP_COMM_EXEC;
  code[1] = 0U;
  code[2] = 0U;
  code[3] = 0U;
  code[4] = 0U;
  length = make_program(file, code, 5U);
  expect_rejection(file, length, ZPLC_LOADER_ERR_COMM,
                   "zero COMM kind is rejected");
  code[1] = 0xFFU;
  length = make_program(file, code, 5U);
  expect_rejection(file, length, ZPLC_LOADER_ERR_COMM,
                   "out-of-range COMM kind is rejected");

  code[0] = OP_RET;
  length = make_program(file, code, 1U);
  task_offset = 49U;
  write_u16_le(file + task_offset, 1U);
  write_u16_le(file + task_offset + ZPLC_TASK_DEF_SIZE, 1U);
  /* A second task is appended only for duplicate-id validation. */
  memcpy(file + task_offset + ZPLC_TASK_DEF_SIZE, file + task_offset,
         ZPLC_TASK_DEF_SIZE);
  write_u32_le(file + 20U, 2U * ZPLC_TASK_DEF_SIZE);
  write_u32_le(file + 44U, 2U * ZPLC_TASK_DEF_SIZE);
  length += ZPLC_TASK_DEF_SIZE;
  refresh_crc(file, length);
  expect_rejection(file, length, ZPLC_LOADER_ERR_TASK,
                   "duplicate task id is rejected");

  {
    const uint8_t task_code[] = {OP_RET};
    const size_t task_offset = 32U + 16U + sizeof(task_code);
    uint32_t index;

    length = make_program(file, task_code, sizeof(task_code));
    for (index = 1U; index < ZPLC_LOADER_MAX_TASKS; index++) {
      memcpy(file + task_offset + index * ZPLC_TASK_DEF_SIZE,
             file + task_offset, ZPLC_TASK_DEF_SIZE);
      write_u16_le(file + task_offset + index * ZPLC_TASK_DEF_SIZE,
                   (uint16_t)(UINT16_MAX - index));
    }
    write_u32_le(file + 20U, ZPLC_LOADER_MAX_TASKS * ZPLC_TASK_DEF_SIZE);
    write_u32_le(file + 44U, ZPLC_LOADER_MAX_TASKS * ZPLC_TASK_DEF_SIZE);
    length += (ZPLC_LOADER_MAX_TASKS - 1U) * ZPLC_TASK_DEF_SIZE;
    refresh_crc(file, length);
    CHECK(zplc_loader_verify(file, length, workspace, sizeof(workspace),
                             &(zplc_program_view_t){0}) == ZPLC_LOADER_OK,
          "16 unique far-apart task ids are accepted");

    memcpy(file + task_offset + ZPLC_LOADER_MAX_TASKS * ZPLC_TASK_DEF_SIZE,
           file + task_offset, ZPLC_TASK_DEF_SIZE);
    write_u32_le(file + 20U, (ZPLC_LOADER_MAX_TASKS + 1U) * ZPLC_TASK_DEF_SIZE);
    write_u32_le(file + 44U, (ZPLC_LOADER_MAX_TASKS + 1U) * ZPLC_TASK_DEF_SIZE);
    length += ZPLC_TASK_DEF_SIZE;
    refresh_crc(file, length);
    expect_rejection(file, length, ZPLC_LOADER_ERR_TASK,
                     "more than the loader task maximum is rejected");
  }

  length = make_program(file, code, 1U);
  task_offset = 49U;
  file[task_offset + 2U] = 3U;
  refresh_crc(file, length);
  expect_rejection(file, length, ZPLC_LOADER_ERR_TASK,
                   "invalid task type is rejected");
  length = make_program(file, code, 1U);
  write_u32_le(file + 49U + 4U, 0U);
  refresh_crc(file, length);
  expect_rejection(file, length, ZPLC_LOADER_ERR_TASK,
                   "zero task interval is rejected");
  length = make_program(file, code, 1U);
  write_u16_le(file + 49U + 10U, 0U);
  refresh_crc(file, length);
  expect_rejection(file, length, ZPLC_LOADER_ERR_TASK,
                   "zero task stack is rejected");
  length = make_program(file, code, 1U);
  write_u16_le(file + 49U + 10U, (uint16_t)(ZPLC_STACK_MAX_DEPTH + 1U));
  refresh_crc(file, length);
  expect_rejection(file, length, ZPLC_LOADER_ERR_TASK,
                   "oversized task stack is rejected");
  length = make_program(file, code, 1U);
  file[49U + 12U] = 1U;
  refresh_crc(file, length);
  expect_rejection(file, length, ZPLC_LOADER_ERR_TASK,
                   "reserved task bytes are rejected");

  {
    uint8_t tags_file[1024];
    const size_t code_offset = 32U + 3U * 8U;
    const size_t task_offset = code_offset + 1U;
    const size_t tags_offset = task_offset + 16U;
    const size_t tag_size = (ZPLC_MAX_TAGS + 1U) * ZPLC_TAG_ENTRY_SIZE;
    const size_t tags_length = tags_offset + tag_size;
    memset(tags_file, 0, tags_length);
    memcpy(tags_file, "ZPLC", 4U);
    write_u16_le(tags_file + 4U, ZPLC_VERSION_MAJOR);
    write_u16_le(tags_file + 6U, ZPLC_VERSION_MINOR);
    write_u32_le(tags_file + 16U, 1U);
    write_u32_le(tags_file + 20U, 16U + (uint32_t)tag_size);
    write_u16_le(tags_file + 26U, 3U);
    tags_file[32U] = ZPLC_SEG_CODE;
    write_u32_le(tags_file + 36U, 1U);
    tags_file[40U] = ZPLC_SEG_TASK;
    write_u32_le(tags_file + 44U, 16U);
    tags_file[48U] = ZPLC_SEG_TAGS;
    write_u32_le(tags_file + 52U, (uint32_t)tag_size);
    tags_file[code_offset] = OP_RET;
    write_u32_le(tags_file + task_offset + 4U, 10000U);
    write_u16_le(tags_file + task_offset + 10U, 64U);
    refresh_crc(tags_file, tags_length);
    expect_rejection(tags_file, tags_length, ZPLC_LOADER_ERR_TAGS,
                     "too many tags are rejected");
  }
}

static void test_tag_semantics(void) {
  uint8_t file[128];
  size_t length;

  length = make_tag_program(file, ZPLC_MEM_IPI_BASE + ZPLC_MEM_IPI_SIZE - 1U,
                            ZPLC_TYPE_BOOL, ZPLC_TAG_PUBLISH, 0U);
  CHECK(zplc_loader_verify(file, length, workspace, sizeof(workspace),
                           &(zplc_program_view_t){0}) == ZPLC_LOADER_OK,
        "PUBLISH BOOL at the IPI boundary is valid");
  length = make_tag_program(file, ZPLC_MEM_OPI_BASE, ZPLC_TYPE_BOOL,
                            ZPLC_TAG_PUBLISH, 0U);
  CHECK(zplc_loader_verify(file, length, workspace, sizeof(workspace),
                           &(zplc_program_view_t){0}) == ZPLC_LOADER_OK,
        "PUBLISH can read OPI");
  length = make_tag_program(file, ZPLC_MEM_WORK_BASE,
                            ZPLC_TYPE_DINT, ZPLC_TAG_MODBUS, 40001U);
  CHECK(zplc_loader_verify(file, length, workspace, sizeof(workspace),
                           &(zplc_program_view_t){0}) == ZPLC_LOADER_OK,
        "MODBUS 32-bit value in WORK is valid");
  length =
      make_tag_program(file, ZPLC_MEM_RETAIN_BASE + ZPLC_MEM_RETAIN_SIZE - 4U,
                       ZPLC_TYPE_REAL, ZPLC_TAG_SUBSCRIBE, 0U);
  CHECK(zplc_loader_verify(file, length, workspace, sizeof(workspace),
                           &(zplc_program_view_t){0}) == ZPLC_LOADER_OK,
        "SUBSCRIBE REAL at the retain boundary is valid");
  length =
      make_tag_program(file, 0x2FFCU, ZPLC_TYPE_REAL, ZPLC_TAG_PUBLISH, 0U);
  CHECK(zplc_loader_verify(file, length, workspace, sizeof(workspace),
                           &(zplc_program_view_t){0}) == ZPLC_LOADER_OK,
        "WORK boundary-crossing PUBLISH address resolved by current adapters "
        "is valid");

  length = make_tag_program(file, ZPLC_MEM_WORK_BASE, ZPLC_TYPE_BOOL,
                            ZPLC_TAG_NONE, 0U);
  expect_rejection(file, length, ZPLC_LOADER_ERR_TAGS, "TAG_NONE is rejected");
  length =
      make_tag_program(file, ZPLC_MEM_WORK_BASE, ZPLC_TYPE_BOOL, 0xFFU, 0U);
  expect_rejection(file, length, ZPLC_LOADER_ERR_TAGS,
                   "unknown tag id is rejected");
  length = make_tag_program(file, ZPLC_MEM_WORK_BASE, ZPLC_TYPE_SINT,
                            ZPLC_TAG_PUBLISH, 0U);
  expect_rejection(file, length, ZPLC_LOADER_ERR_TAGS,
                   "PUBLISH type without an encoder is rejected");
  length = make_tag_program(file, ZPLC_MEM_WORK_BASE, ZPLC_TYPE_DINT,
                            ZPLC_TAG_SUBSCRIBE, 0U);
  expect_rejection(file, length, ZPLC_LOADER_ERR_TAGS,
                   "SUBSCRIBE type without a decoder is rejected");
  length = make_tag_program(file, ZPLC_MEM_WORK_BASE, ZPLC_TYPE_LINT,
                            ZPLC_TAG_MODBUS, 40001U);
  expect_rejection(file, length, ZPLC_LOADER_ERR_TAGS,
                   "MODBUS type without a memory operation is rejected");
  length = make_tag_program(file, ZPLC_MEM_WORK_BASE, ZPLC_TYPE_STRING,
                            ZPLC_TAG_MODBUS, 40001U);
  expect_rejection(file, length, ZPLC_LOADER_ERR_TAGS,
                   "variable-length MODBUS STRING is rejected");
  length = make_tag_program(file, ZPLC_MEM_CODE_BASE, ZPLC_TYPE_BOOL,
                            ZPLC_TAG_PUBLISH, 0U);
  expect_rejection(file, length, ZPLC_LOADER_ERR_TAGS,
                   "CODE address is rejected for tags");
  length = make_tag_program(file, ZPLC_MEM_IPI_BASE + ZPLC_MEM_IPI_SIZE - 1U,
                            ZPLC_TYPE_INT, ZPLC_TAG_PUBLISH, 0U);
  expect_rejection(file, length, ZPLC_LOADER_ERR_TAGS,
                   "16-bit tag crossing an IPI boundary is rejected");
  length = make_tag_program(file, ZPLC_MEM_OPI_BASE + ZPLC_MEM_OPI_SIZE - 3U,
                            ZPLC_TYPE_DINT, ZPLC_TAG_MODBUS, 40001U);
  expect_rejection(file, length, ZPLC_LOADER_ERR_TAGS,
                   "32-bit tag crossing an OPI boundary is rejected");
  length = make_tag_program(file, ZPLC_MEM_IPI_BASE, ZPLC_TYPE_BOOL,
                            ZPLC_TAG_MODBUS, 40001U);
  expect_rejection(file, length, ZPLC_LOADER_ERR_TAGS,
                   "MODBUS write-capable tag cannot target IPI");
  length = make_tag_program(file, ZPLC_MEM_IPI_BASE, ZPLC_TYPE_BOOL,
                            ZPLC_TAG_SUBSCRIBE, 0U);
  expect_rejection(file, length, ZPLC_LOADER_ERR_TAGS,
                   "SUBSCRIBE write-capable tag cannot target IPI");
  length = make_tag_program(file, ZPLC_MEM_OPI_BASE, ZPLC_TYPE_BOOL,
                            ZPLC_TAG_MODBUS, 40001U);
  expect_rejection(file, length, ZPLC_LOADER_ERR_TAGS,
                   "MODBUS write-capable tag cannot target OPI");
  length = make_tag_program(file, ZPLC_MEM_OPI_BASE, ZPLC_TYPE_BOOL,
                            ZPLC_TAG_SUBSCRIBE, 0U);
  expect_rejection(file, length, ZPLC_LOADER_ERR_TAGS,
                   "SUBSCRIBE write-capable tag cannot target OPI");
  length =
      make_tag_program(file, 0x3000U, ZPLC_TYPE_BOOL, ZPLC_TAG_PUBLISH, 0U);
  expect_rejection(
      file, length, ZPLC_LOADER_ERR_TAGS,
      "WORK 0x3000 alias is rejected until adapters preserve its offset");
  length = make_tag_program(file, ZPLC_MEM_WORK_BASE, ZPLC_TYPE_BOOL,
                            ZPLC_TAG_MODBUS, UINT16_MAX + 1U);
  expect_rejection(
      file, length, ZPLC_LOADER_ERR_TAGS,
      "MODBUS address outside the consumer's uint16 range is rejected");
}

int main(void) {
  test_valid_fixture_and_purity();
  test_structural_rejections();
  test_semantic_rejections_and_acceptance();
  test_tag_semantics();
  if (failures != 0)
    return 1;
  puts("All loader verifier tests passed.");
  return 0;
}
