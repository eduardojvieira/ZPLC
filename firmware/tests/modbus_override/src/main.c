#include <errno.h>

#include <zephyr/kernel.h>
#include <zephyr/settings/settings.h>
#include <zephyr/ztest.h>

#include "zplc_config.h"

K_THREAD_STACK_DEFINE(writer_stack, 2048);
K_THREAD_STACK_DEFINE(reader_stack, 2048);

static struct k_sem writer_at_publish;
static struct k_sem allow_writer_publish;
static struct k_sem reader_done;
static uint32_t reader_address;
static bool reader_visible;
static int writer_result;
static int publish_wait_result;

static void *modbus_override_suite_setup(void)
{
  zassert_ok(zplc_config_init(), "config init");
  return NULL;
}

static void modbus_override_before(void *fixture)
{
  ARG_UNUSED(fixture);
  for (uint16_t index = 0U; index < ZPLC_MAX_TAGS; ++index) {
    zassert_ok(zplc_config_clear_modbus_tag_override(index), "clear");
  }
  zplc_config_test_set_modbus_override_publish_hook(NULL);
}

static void pause_writer_before_publish(void)
{
  k_sem_give(&writer_at_publish);
  publish_wait_result = k_sem_take(&allow_writer_publish, K_SECONDS(1));
}

static void override_writer(void *arg1, void *arg2, void *arg3)
{
  ARG_UNUSED(arg1);
  ARG_UNUSED(arg2);
  ARG_UNUSED(arg3);
  writer_result = zplc_config_set_modbus_tag_override(5U, 200U, 1U);
}

static void override_reader(void *arg1, void *arg2, void *arg3)
{
  ARG_UNUSED(arg1);
  ARG_UNUSED(arg2);
  ARG_UNUSED(arg3);
  reader_visible = zplc_config_get_modbus_tag_override(5U, 1U, &reader_address);
  k_sem_give(&reader_done);
}

ZTEST(modbus_override, test_valid_set_get_and_clear)
{
  uint32_t address = 0U;

  zassert_ok(zplc_config_set_modbus_tag_override(2U, 65535U, 1U),
             "one-register endpoint is valid");
  zassert_true(zplc_config_get_modbus_tag_override(2U, 1U, &address),
               "stored override");
  zassert_equal(address, 65535U, "stored address");
  zassert_ok(zplc_config_clear_modbus_tag_override(2U), "clear");
  zassert_false(zplc_config_get_modbus_tag_override(2U, 1U, &address),
                "clear must hide override");
}

ZTEST(modbus_override, test_width_boundary_preserves_previous_value)
{
  uint32_t address = 0U;

  zassert_ok(zplc_config_set_modbus_tag_override(3U, 65534U, 2U),
             "two-register endpoint is valid");
  zassert_equal(zplc_config_set_modbus_tag_override(3U, 65535U, 2U), -ERANGE,
                "overflow must be rejected");
  zassert_true(zplc_config_get_modbus_tag_override(3U, 2U, &address),
               "previous valid override remains visible");
  zassert_equal(address, 65534U, "failed set must not mutate state");
  zassert_equal(zplc_config_set_modbus_tag_override(3U, 65536U, 1U), -ERANGE,
                "address beyond uint16 must be rejected");
}

ZTEST(modbus_override, test_getter_fails_closed_on_width_change)
{
  uint32_t address = 0U;

  zassert_ok(zplc_config_set_modbus_tag_override(4U, 65535U, 1U),
             "one-register endpoint is valid");
  zassert_false(zplc_config_get_modbus_tag_override(4U, 2U, &address),
                "type widening must not expose an invalid endpoint");
  zassert_true(zplc_config_get_modbus_tag_override(4U, 1U, &address),
               "original width remains valid");
  zassert_equal(address, 65535U, "stored address remains intact");
}

ZTEST(modbus_override, test_reader_cannot_observe_partially_published_pair)
{
  struct k_thread writer;
  struct k_thread reader;

  zassert_ok(zplc_config_set_modbus_tag_override(5U, 100U, 1U), "initial set");
  k_sem_init(&writer_at_publish, 0U, 1U);
  k_sem_init(&allow_writer_publish, 0U, 1U);
  k_sem_init(&reader_done, 0U, 1U);
  reader_visible = false;
  reader_address = 0U;
  writer_result = -1;
  publish_wait_result = -1;
  zplc_config_test_set_modbus_override_publish_hook(pause_writer_before_publish);
  k_thread_create(&writer, writer_stack, K_THREAD_STACK_SIZEOF(writer_stack),
                  override_writer, NULL, NULL, NULL, 5, 0U, K_NO_WAIT);
  zassert_ok(k_sem_take(&writer_at_publish, K_SECONDS(1)), "writer paused");
  k_thread_create(&reader, reader_stack, K_THREAD_STACK_SIZEOF(reader_stack),
                  override_reader, NULL, NULL, NULL, 5, 0U, K_NO_WAIT);
  zassert_equal(k_sem_take(&reader_done, K_MSEC(20)), -EAGAIN,
                "reader must wait for the published pair");
  k_sem_give(&allow_writer_publish);
  zassert_ok(k_sem_take(&reader_done, K_SECONDS(1)), "reader completes");
  zassert_ok(k_thread_join(&writer, K_SECONDS(1)), "writer joins");
  zassert_ok(k_thread_join(&reader, K_SECONDS(1)), "reader joins");
  zassert_ok(publish_wait_result, "writer release");
  zassert_ok(writer_result, "writer set");
  zassert_true(reader_visible, "published pair remains valid");
  zassert_equal(reader_address, 200U, "reader must observe the new address");
  zplc_config_test_set_modbus_override_publish_hook(NULL);
}

ZTEST(modbus_override, test_settings_requires_complete_current_pair)
{
  bool valid[ZPLC_MAX_TAGS] = { false };
  uint32_t addresses[ZPLC_MAX_TAGS] = { 0U };
  uint32_t address = 0U;

  valid[0] = true;
  addresses[0] = 123U;
  zassert_ok(settings_runtime_set("zplc/modbus_tag_override_valid", valid,
                                  sizeof(valid)), "valid array");
  zassert_ok(settings_runtime_set("zplc/modbus_tag_override_addr", addresses,
                                  sizeof(addresses)), "address array");
  zassert_ok(settings_runtime_commit("zplc"), "complete commit");
  zassert_true(zplc_config_get_modbus_tag_override(0U, 1U, &address),
               "complete pair published");
  zassert_equal(address, 123U, "loaded address");

  valid[0] = true;
  zassert_ok(settings_runtime_set("zplc/modbus_tag_override_valid", valid,
                                  sizeof(valid)), "partial valid array");
  zassert_ok(settings_runtime_commit("zplc"), "partial commit");
  zassert_false(zplc_config_get_modbus_tag_override(0U, 1U, &address),
                "partial load must not reuse prior address array");
}

ZTEST(modbus_override, test_settings_rejects_truncation_and_out_of_range)
{
  bool valid[ZPLC_MAX_TAGS] = { false };
  uint32_t addresses[ZPLC_MAX_TAGS] = { 0U };
  uint32_t address = 0U;

  valid[1] = true;
  addresses[1] = 456U;
  zassert_equal(settings_runtime_set("zplc/modbus_tag_override_valid", valid,
                                     sizeof(valid) - 1U), -EINVAL,
                "truncated valid array rejected");
  zassert_ok(settings_runtime_set("zplc/modbus_tag_override_addr", addresses,
                                  sizeof(addresses)), "address array");
  zassert_ok(settings_runtime_commit("zplc"), "truncated commit");
  zassert_false(zplc_config_get_modbus_tag_override(1U, 1U, &address),
                "truncated pair stays disabled");

  valid[1] = true;
  addresses[1] = UINT16_MAX + 1U;
  zassert_ok(settings_runtime_set("zplc/modbus_tag_override_valid", valid,
                                  sizeof(valid)), "valid array");
  zassert_ok(settings_runtime_set("zplc/modbus_tag_override_addr", addresses,
                                  sizeof(addresses)), "out of range address array");
  zassert_ok(settings_runtime_commit("zplc"), "range commit");
  zassert_false(zplc_config_get_modbus_tag_override(1U, 1U, &address),
                "out of range loaded address stays disabled");
}

ZTEST_SUITE(modbus_override, NULL, modbus_override_suite_setup,
            modbus_override_before, NULL, NULL);
