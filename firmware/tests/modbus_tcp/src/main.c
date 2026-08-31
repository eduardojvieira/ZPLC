#include <errno.h>
#include <string.h>
#include <zephyr/ztest.h>
#include "zplc_modbus_tcp.h"
#include "zplc_config.h"
#include <zplc_core.h>

static uint8_t process_image[4096];
static zplc_tag_entry_t process_tags[1];
static int process_lock_result;
static uint8_t process_lock_calls;
static uint8_t process_unlock_calls;

int zplc_modbus_client_init(void) { return 0; }
bool zplc_config_get_modbus_tag_override(uint16_t index, uint16_t width, uint32_t *address)
{ ARG_UNUSED(index); ARG_UNUSED(width); ARG_UNUSED(address); return false; }
uint16_t zplc_config_get_modbus_id(void) { return 1U; }
bool zplc_config_get_modbus_tcp_enabled(void) { return false; }
bool zplc_config_get_modbus_rtu_enabled(void) { return false; }
uint8_t *zplc_mem_get_region(uint16_t region) { return region == 0x2000U ? process_image : NULL; }
int zplc_pi_lock(void) { process_lock_calls++; return process_lock_result; }
void zplc_pi_unlock(void) { process_unlock_calls++; }
uint16_t zplc_core_get_tag_count(void) { return 1U; }
const zplc_tag_entry_t *zplc_core_get_tag(uint16_t index) { return index == 0U ? process_tags : NULL; }

struct fake_image { uint16_t registers[2]; uint8_t coils[2]; uint8_t read_calls; uint8_t write_calls; bool second_mapped; };

static void put_be16(uint8_t *b, uint16_t v) { b[0] = (uint8_t)(v >> 8); b[1] = (uint8_t)v; }
static size_t adu(uint8_t *out, uint8_t fc, const uint8_t *body, size_t n)
{
  out[0] = 0U; out[1] = 1U; out[2] = 0U; out[3] = 0U; put_be16(&out[4], (uint16_t)(n + 2U));
  out[6] = 1U; out[7] = fc; memcpy(&out[8], body, n); return n + 8U;
}
static int fake_read(uint16_t address, uint16_t count, uint8_t *out, size_t cap,
                     bool bits, zplc_modbus_area_t area, void *arg)
{
  struct fake_image *image = arg; ARG_UNUSED(area);
  image->read_calls++;
  if (address != 0U || count > 2U || (bits && cap < 1U) || (!bits && cap < (size_t)count * 2U)) return -1;
  if (bits) { out[0] = (uint8_t)(image->coils[0] | (image->coils[1] << 1)); return 1; }
  for (uint16_t i = 0U; i < count; i++) put_be16(&out[(size_t)i * 2U], image->registers[i]);
  return (int)((size_t)count * 2U);
}
static int fake_write(uint16_t address, uint16_t count, const uint8_t *data, bool bits,
                      bool multiple, zplc_modbus_area_t area, void *arg)
{
  struct fake_image *image = arg; ARG_UNUSED(multiple); ARG_UNUSED(area); image->write_calls++;
  if (address > 1U || count > 2U || (count == 2U && !image->second_mapped)) return -1;
  for (uint16_t i = 0U; i < count; i++) {
    if (bits) image->coils[address + i] = (uint8_t)((data[i / 8U] >> (i % 8U)) & 1U);
    else image->registers[address + i] = ((uint16_t)data[(size_t)i * 2U] << 8) | data[(size_t)i * 2U + 1U];
  }
  return 0;
}
static zplc_modbus_tcp_ops_t ops_for(struct fake_image *image)
{
  return (zplc_modbus_tcp_ops_t){ .unit_id = 1U, .read = fake_read, .write = fake_write, .context = image };
}
static int stream_count(const uint8_t *req, size_t len, void *arg)
{
  uint8_t *count = arg; zassert_equal(len, 12U, "complete request length"); zassert_equal(req[7], 3U, "FC"); (*count)++; return 0;
}

struct stream_lengths { size_t lengths[2]; uint8_t count; };
static int record_stream_length(const uint8_t *req, size_t len, void *arg)
{
  struct stream_lengths *record = arg; ARG_UNUSED(req);
  record->lengths[record->count++] = len;
  return 0;
}

ZTEST(modbus_tcp, test_fragment_waits_then_coalesced_frames_consume_in_order)
{
  uint8_t frame[12], joined[24], count = 0U; zplc_modbus_tcp_stream_t stream = { 0 };
  const uint8_t body[] = { 0U, 0U, 0U, 1U };
  zassert_equal(adu(frame, 3U, body, sizeof(body)), sizeof(frame), "fixture");
  zassert_ok(zplc_modbus_tcp_stream_feed(&stream, frame, 5U, stream_count, &count), "fragment");
  zassert_equal(count, 0U, "partial frame waits");
  zassert_ok(zplc_modbus_tcp_stream_feed(&stream, &frame[5], sizeof(frame) - 5U, stream_count, &count), "complete");
  memcpy(joined, frame, sizeof(frame)); memcpy(joined + sizeof(frame), frame, sizeof(frame));
  zassert_ok(zplc_modbus_tcp_stream_feed(&stream, joined, sizeof(joined), stream_count, &count), "coalesced frames");
  zassert_equal(count, 3U, "all frames in order");
}

ZTEST(modbus_tcp, test_full_frame_then_coalesced_frame_in_one_fragment)
{
  uint8_t first[260] = { 0 }, second[12], chunk[22];
  zplc_modbus_tcp_stream_t stream = { 0 };
  struct stream_lengths record = { 0 };
  const uint8_t read[] = { 0U, 0U, 0U, 1U };

  first[4] = 0U; first[5] = 254U; first[6] = 1U; first[7] = 3U;
  zassert_equal(adu(second, 3U, read, sizeof(read)), sizeof(second), "fixture");
  zassert_ok(zplc_modbus_tcp_stream_feed(&stream, first, 250U, record_stream_length, &record), "partial max frame");
  memcpy(chunk, &first[250], 10U); memcpy(&chunk[10], second, sizeof(second));
  zassert_ok(zplc_modbus_tcp_stream_feed(&stream, chunk, sizeof(chunk), record_stream_length, &record), "finish plus coalesced");
  zassert_equal(record.count, 2U, "two callbacks");
  zassert_equal(record.lengths[0], 260U, "maximum frame first");
  zassert_equal(record.lengths[1], 12U, "trailing frame second");
  zassert_equal(stream.used, 0U, "stream drained");
}

ZTEST(modbus_tcp, test_invalid_mbap_lengths_fail_closed)
{
  uint8_t frame[12] = { 0U, 1U, 0U, 0U, 0U, 1U, 1U, 3U, 0U, 0U, 0U, 1U }, count = 0U;
  zplc_modbus_tcp_stream_t stream = { 0 };
  zassert_equal(zplc_modbus_tcp_stream_feed(&stream, frame, sizeof(frame), stream_count, &count), -EPROTO, "LEN 1");
  zplc_modbus_tcp_stream_reset(&stream); frame[4] = 0U; frame[5] = 0U;
  zassert_equal(zplc_modbus_tcp_stream_feed(&stream, frame, 6U, stream_count, &count), -EPROTO, "LEN 0");
  zplc_modbus_tcp_stream_reset(&stream); frame[5] = 255U;
  zassert_equal(zplc_modbus_tcp_stream_feed(&stream, frame, sizeof(frame), stream_count, &count), -EPROTO, "LEN 255");
}

ZTEST(modbus_tcp, test_invalid_mbap_pid_uid_and_length_mismatch_drop_without_write)
{
  struct fake_image image = { .second_mapped = true }; zplc_modbus_tcp_ops_t ops = ops_for(&image);
  uint8_t req[16], resp[ZPLC_MODBUS_TCP_ADU_MAX]; size_t len = 0U;
  const uint8_t body[] = { 0U, 0U, 0U, 1U };
  size_t req_len = adu(req, 3U, body, sizeof(body));
  req[2] = 0U; req[3] = 1U;
  zassert_equal(zplc_modbus_tcp_process_adu(req, req_len, resp, sizeof(resp), &len, &ops), ZPLC_MODBUS_TCP_DROP, "PID");
  req[2] = 0U; req[3] = 0U; req[6] = 2U;
  zassert_equal(zplc_modbus_tcp_process_adu(req, req_len, resp, sizeof(resp), &len, &ops), ZPLC_MODBUS_TCP_DROP, "UID");
  req[6] = 1U; req[5] = 5U;
  zassert_equal(zplc_modbus_tcp_process_adu(req, req_len, resp, sizeof(resp), &len, &ops), ZPLC_MODBUS_TCP_DROP, "length mismatch");
  zassert_equal(image.write_calls, 0U, "drops cannot mutate");
}

ZTEST(modbus_tcp, test_malformed_writes_and_invalid_coil_never_mutate)
{
  struct fake_image image = { .registers = { 10U, 20U }, .second_mapped = true }; zplc_modbus_tcp_ops_t ops = ops_for(&image);
  uint8_t req[32], resp[ZPLC_MODBUS_TCP_ADU_MAX]; size_t len = 0U;
  const uint8_t bad_regs[] = { 0U, 0U, 0U, 2U, 3U, 0U, 1U, 0U, 2U };
  const uint8_t bad_coils[] = { 0U, 0U, 0U, 8U, 2U, 1U };
  const uint8_t bad_coil[] = { 0U, 0U, 0x12U, 0x34U };
  zassert_ok(zplc_modbus_tcp_process_adu(req, adu(req, 0x10U, bad_regs, sizeof(bad_regs)), resp, sizeof(resp), &len, &ops), "FC10");
  zassert_equal(resp[8], 3U, "FC10 byte count");
  zassert_ok(zplc_modbus_tcp_process_adu(req, adu(req, 0x0FU, bad_coils, sizeof(bad_coils)), resp, sizeof(resp), &len, &ops), "FC0F");
  zassert_equal(resp[8], 3U, "FC0F byte count");
  zassert_ok(zplc_modbus_tcp_process_adu(req, adu(req, 5U, bad_coil, sizeof(bad_coil)), resp, sizeof(resp), &len, &ops), "FC05");
  zassert_equal(resp[8], 3U, "FC05 value"); zassert_equal(image.write_calls, 0U, "no mutation");
}

ZTEST(modbus_tcp, test_range_wrap_and_later_unmapped_multi_write_preserve_values)
{
  struct fake_image image = { .registers = { 10U, 20U }, .second_mapped = false }; zplc_modbus_tcp_ops_t ops = ops_for(&image);
  uint8_t req[32], resp[ZPLC_MODBUS_TCP_ADU_MAX]; size_t len = 0U;
  const uint8_t wrap[] = { 0xFFU, 0xFFU, 0U, 2U };
  const uint8_t write_two[] = { 0U, 0U, 0U, 2U, 4U, 0U, 99U, 0U, 88U };
  zassert_ok(zplc_modbus_tcp_process_adu(req, adu(req, 3U, wrap, sizeof(wrap)), resp, sizeof(resp), &len, &ops), "wrap");
  zassert_equal(resp[8], 2U, "wrapped range");
  zassert_ok(zplc_modbus_tcp_process_adu(req, adu(req, 0x10U, write_two, sizeof(write_two)), resp, sizeof(resp), &len, &ops), "multi write");
  zassert_equal(resp[8], 2U, "unmapped address"); zassert_equal(image.registers[0], 10U, "first unchanged"); zassert_equal(image.registers[1], 20U, "second unchanged");
}

ZTEST(modbus_tcp, test_small_response_capacity_never_calls_write)
{
  struct fake_image image = { .registers = { 10U, 20U }, .second_mapped = true }; zplc_modbus_tcp_ops_t ops = ops_for(&image);
  uint8_t req[16], resp[11]; size_t len = 0U;
  const uint8_t write[] = { 0U, 0U, 0U, 1U };
  zassert_equal(zplc_modbus_tcp_process_adu(req, adu(req, 6U, write, sizeof(write)), resp, sizeof(resp), &len, &ops), -ENOSPC, "FC06 capacity");
  zassert_equal(image.write_calls, 0U, "no callback"); zassert_equal(image.registers[0], 10U, "no mutation");
}

ZTEST(modbus_tcp, test_invalid_quantity_is_value_error_before_range_check)
{
  struct fake_image image = { .second_mapped = true }; zplc_modbus_tcp_ops_t ops = ops_for(&image);
  uint8_t req[16], resp[ZPLC_MODBUS_TCP_ADU_MAX]; size_t len = 0U;
  const uint8_t zero_read[] = { 0U, 0U, 0U, 0U };
  const uint8_t zero_write[] = { 0U, 0U, 0U, 0U, 0U };
  const uint8_t too_many[] = { 0xFFU, 0xFFU, 0U, 126U };
  zassert_ok(zplc_modbus_tcp_process_adu(req, adu(req, 3U, zero_read, sizeof(zero_read)), resp, sizeof(resp), &len, &ops), "zero read");
  zassert_equal(resp[8], 3U, "zero read is data value");
  zassert_ok(zplc_modbus_tcp_process_adu(req, adu(req, 0x10U, zero_write, sizeof(zero_write)), resp, sizeof(resp), &len, &ops), "zero write");
  zassert_equal(resp[8], 3U, "zero write is data value");
  zassert_ok(zplc_modbus_tcp_process_adu(req, adu(req, 3U, too_many, sizeof(too_many)), resp, sizeof(resp), &len, &ops), "large read");
  zassert_equal(resp[8], 3U, "over limit wins over endpoint");
  zassert_equal(image.read_calls, 0U, "invalid reads never call"); zassert_equal(image.write_calls, 0U, "invalid writes never call");
}

ZTEST(modbus_tcp, test_small_read_response_capacity_never_calls_read)
{
  struct fake_image image = { .registers = { 10U }, .second_mapped = true }; zplc_modbus_tcp_ops_t ops = ops_for(&image);
  uint8_t req[16], resp[10]; size_t len = 0U;
  const uint8_t read[] = { 0U, 0U, 0U, 1U };
  zassert_equal(zplc_modbus_tcp_process_adu(req, adu(req, 3U, read, sizeof(read)), resp, sizeof(resp), &len, &ops), -ENOSPC, "read capacity");
  zassert_equal(image.read_calls, 0U, "no false address callback"); zassert_equal(len, 0U, "no false exception response");
}

ZTEST(modbus_tcp, test_production_mapped_write_preflights_entire_range)
{
  const uint8_t two[] = { 0x12U, 0x34U, 0x56U, 0x78U };
  const uint8_t one[] = { 0x9AU, 0xBCU };

  memset(process_image, 0, sizeof(process_image));
  process_image[0] = 0x11U; process_image[1] = 0x22U;
  process_lock_result = -EAGAIN; process_lock_calls = 0U; process_unlock_calls = 0U;
  process_tags[0] = (zplc_tag_entry_t){ .var_addr = 0x2000U, .var_type = ZPLC_TYPE_WORD,
                                         .tag_id = ZPLC_TAG_MODBUS, .value = 0U };
  zassert_true(zplc_modbus_write_mapped(0U, 1U, one, false, false,
                                        ZPLC_MODBUS_AREA_HOLDING_REGISTER) < 0,
               "lock failure rejects write");
  zassert_equal(process_image[0], 0x11U, "lock failure low byte unchanged");
  zassert_equal(process_image[1], 0x22U, "lock failure high byte unchanged");
  zassert_equal(process_lock_calls, 1U, "lock attempted once");
  zassert_equal(process_unlock_calls, 0U, "failed lock not unlocked");
  process_lock_result = 0;
  zassert_true(zplc_modbus_write_mapped(0U, 2U, two, false, true,
                                        ZPLC_MODBUS_AREA_HOLDING_REGISTER) < 0,
               "second address unmapped");
  zassert_equal(process_image[0], 0x11U, "first low byte unchanged");
  zassert_equal(process_image[1], 0x22U, "first high byte unchanged");
  zassert_ok(zplc_modbus_write_mapped(0U, 1U, one, false, false,
                                      ZPLC_MODBUS_AREA_HOLDING_REGISTER), "mapped single write");
  zassert_equal(process_image[0], 0xBCU, "little endian low byte");
  zassert_equal(process_image[1], 0x9AU, "little endian high byte");
  zassert_equal(process_lock_calls, 3U, "all attempts counted");
  zassert_equal(process_unlock_calls, 2U, "successful locks balanced");
}

ZTEST(modbus_tcp, test_valid_read_has_exact_mbap_length)
{
  struct fake_image image = { .registers = { 0x1234U }, .second_mapped = true }; zplc_modbus_tcp_ops_t ops = ops_for(&image);
  uint8_t req[16], resp[ZPLC_MODBUS_TCP_ADU_MAX]; size_t len = 0U;
  const uint8_t read[] = { 0U, 0U, 0U, 1U };
  zassert_ok(zplc_modbus_tcp_process_adu(req, adu(req, 3U, read, sizeof(read)), resp, sizeof(resp), &len, &ops), "valid read");
  zassert_equal(len, 11U, "ADU length"); zassert_equal(resp[4], 0U, "MBAP high"); zassert_equal(resp[5], 5U, "MBAP LEN");
  zassert_equal(resp[8], 2U, "byte count"); zassert_equal(resp[9], 0x12U, "high"); zassert_equal(resp[10], 0x34U, "low");
}

ZTEST_SUITE(modbus_tcp, NULL, NULL, NULL, NULL, NULL);
