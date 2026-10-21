/*
 * COM-014, COM-015, COM-022 and COM-027 on the shell of the product.
 *
 * shell_cmds.c, zplc_config.c and zplc_time.c are the product's own files,
 * compiled into this image; the commands run through the Zephyr shell on its
 * dummy back end, exactly as Studio's text reaches them on a board. What is
 * not here is the radio, the MQTT client and the cloud blocks: the
 * authority of those over the runtime is the subject of the inbound suite.
 */
#include <errno.h>
#include <stdio.h>
#include <string.h>

#include <zephyr/kernel.h>
#include <zephyr/shell/shell.h>
#include <zephyr/shell/shell_dummy.h>
#include <zephyr/storage/flash_map.h>
#include <zephyr/ztest.h>

#include <zephyr/logging/log_backend.h>
#include <zephyr/logging/log_backend_std.h>
#include <zephyr/logging/log_output.h>

#include <zplc_core.h>

#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_scheduler.h>

#include "program_store.h"
#include "zplc_app_test_hooks.h"
#include "zplc_config.h"
#include "zplc_exchange.h"
#include "zplc_parse.h"

#define OUT_MAX 16384

/* ---- a log back end that keeps every message, for the credential test ---- */
static char captured[8192];
static size_t captured_length;
static uint8_t log_line[128];

static int capture_write(uint8_t *data, size_t length, void *context) {
  ARG_UNUSED(context);
  if (captured_length + length < sizeof(captured)) {
    memcpy(&captured[captured_length], data, length);
    captured_length += length;
    captured[captured_length] = '\0';
  }
  return (int)length;
}

LOG_OUTPUT_DEFINE(capture_output, capture_write, log_line, sizeof(log_line));

static void capture_process(const struct log_backend *const backend, union log_msg_generic *msg) {
  log_format_func_t format = log_format_func_t_get(LOG_OUTPUT_TEXT);

  ARG_UNUSED(backend);
  format(&capture_output, &msg->log, log_backend_std_get_flags());
}

static void capture_panic(const struct log_backend *const backend) { ARG_UNUSED(backend); }

static const struct log_backend_api capture_api = {
    .process = capture_process,
    .panic = capture_panic,
};

LOG_BACKEND_DEFINE(capture_backend, capture_api, true);

static char out[OUT_MAX];

/* Runs one shell command line; `out` holds everything it printed. */
static int run(const char *line) {
  const struct shell *sh = shell_backend_dummy_get_ptr();
  const char *text;
  size_t length;
  int rc;

  (void)shell_backend_dummy_get_output(sh, &length); /* clear */
  rc = shell_execute_cmd(NULL, line);
  text = shell_backend_dummy_get_output(sh, &length);
  if (length >= sizeof(out)) {
    length = sizeof(out) - 1U;
  }
  memcpy(out, text, length);
  out[length] = '\0';
  return rc;
}

static void *setup(void) {
  const struct flash_area *area;

  /* A device that has never been configured: nothing stored yet. */
  zassert_ok(flash_area_open(PARTITION_ID(storage_partition), &area), "open storage");
  zassert_ok(flash_area_flatten(area, 0, area->fa_size), "erase storage");
  flash_area_close(area);

  zassert_ok(zplc_mem_init(), "memory");
  zassert_ok(zplc_exchange_init(NULL), "exchange");
  zassert_ok(zplc_config_init(), "config init");
  k_usleep(10); /* let the shell back end initialize */
  return NULL;
}

static void before(void *fixture) {
  ARG_UNUSED(fixture);
  zplc_config_test_fail_store_after(-1, 0);
  zassert_ok(zplc_config_reset(), "defaults");
}

/* ------------------------------------------------------------ COM-014 */

ZTEST(comm_safety, test_there_is_no_default_broker_and_tls_verifies) {
  char broker[32];

  zplc_config_get_mqtt_broker(broker, sizeof(broker));
  zassert_equal(broker[0], '\0', "broker '%s' is a default", broker);
  zassert_false(zplc_config_get_mqtt_enabled(), "MQTT starts off");
  zassert_equal(zplc_config_get_mqtt_transport(), ZPLC_MQTT_TRANSPORT_TLS, "TLS is the default transport");
  zassert_equal(zplc_config_get_mqtt_security(), ZPLC_MQTT_SECURITY_TLS_SERVER_VERIFY, "server verification is the default");
  zassert_equal(zplc_config_get_mqtt_tls_verify(), ZPLC_MQTT_TLS_VERIFY_ON, "verification is on");
  zassert_equal(zplc_config_get_mqtt_port(), 8883U, "TLS port");
  zassert_false(zplc_config_mqtt_tls_verify_off(), "no warning by default");
}

ZTEST(comm_safety, test_turning_verification_off_is_explicit_and_visible) {
  int rc = run("zplc config set mqtt_security 1");

#if defined(CONFIG_ZPLC_MQTT_ALLOW_INSECURE_TLS)
  zassert_ok(rc, "the opt-in is allowed in this build: %d", rc);
  zassert_not_null(strstr(out, "WARNING"), "the opt-in warns: %s", out);
  zassert_equal(zplc_config_get_mqtt_security(), ZPLC_MQTT_SECURITY_TLS_NO_VERIFY, "stored");
  zassert_equal(zplc_config_get_mqtt_tls_verify(), ZPLC_MQTT_TLS_VERIFY_OFF, "reported off");

  zassert_ok(run("zplc mqtt status"), "mqtt status");
  zassert_not_null(strstr(out, "tls-verify: OFF"), "status: %s", out);
  zassert_ok(run("zplc mqtt status --json"), "mqtt status json");
  zassert_not_null(strstr(out, "\"tls_verify\":\"OFF\""), "json: %s", out);

  /* The standing warning of the runtime status is on only while MQTT is
	 * enabled; over plain TCP there is no TLS to be unverified. */
  zassert_ok(run("zplc status"), "status");
  zassert_is_null(strstr(out, "tls-verify"), "MQTT off: %s", out);
  zassert_ok(run("zplc config set mqtt_enabled 1"), "enable");
  zassert_ok(run("zplc status"), "status");
  zassert_not_null(strstr(out, "tls-verify: OFF"), "status: %s", out);
  zassert_ok(run("zplc status --json"), "status json");
  zassert_not_null(strstr(out, "mqtt_tls_verify_off"), "json: %s", out);

  zassert_ok(run("zplc config set mqtt_transport 0"), "plain TCP");
  zassert_ok(run("zplc mqtt status"), "mqtt status");
  zassert_not_null(strstr(out, "tls-verify: n/a"), "plain: %s", out);
  zassert_ok(run("zplc status"), "status");
  zassert_is_null(strstr(out, "tls-verify"), "plain: %s", out);

  /* A stored opt-in comes back after a reboot. */
  zassert_ok(run("zplc config set mqtt_transport 1"), "TLS again");
  zassert_ok(run("zplc config save"), "save");
  zassert_ok(zplc_config_init(), "reboot");
  zassert_equal(zplc_config_get_mqtt_security(), ZPLC_MQTT_SECURITY_TLS_NO_VERIFY, "stored opt-in kept");
#else
  zassert_equal(rc, -EPERM, "refused with -EPERM, got %d: %s", rc, out);
  zassert_not_null(strstr(out, "cannot turn TLS certificate verification off"), "reason: %s", out);
  zassert_equal(zplc_config_get_mqtt_security(), ZPLC_MQTT_SECURITY_TLS_SERVER_VERIFY, "unchanged");

  /* A no-verify value stored by a diagnostic image is not honoured here:
	 * the release image loads it as server verification. */
  zplc_config_set_mqtt_security(ZPLC_MQTT_SECURITY_TLS_NO_VERIFY);
  zassert_ok(zplc_config_save(), "save");
  zassert_ok(zplc_config_init(), "reboot");
  zassert_equal(zplc_config_get_mqtt_security(), ZPLC_MQTT_SECURITY_TLS_SERVER_VERIFY, "a stored no-verify is not applied");
  zassert_equal(zplc_config_get_mqtt_tls_verify(), ZPLC_MQTT_TLS_VERIFY_ON, "verification stays on");
#endif
}

/* ------------------------------------------------------------ COM-015 */

static const char *const secret_markers[] = {
    "PW-7f3a-mqtt-password",
    "PW-7f3a-wifi-password",
    "KEY-7f3a-azure-sas-key",
    "USER-7f3a-mqtt-username",
};

/* Every command of the shell that reports state and could be made to print a
 * stored value; the commands that change state are run too. */
static const char *const reporting_commands[] = {
    "zplc config get",
    "zplc mqtt status",
    "zplc mqtt status --json",
    "zplc status",
    "zplc status --json",
    "zplc sched status",
    "zplc sched tasks",
    "zplc sys info",
    "zplc sys info --json",
    "zplc net status",
    "zplc cert status",
    "zplc wifi connect",
    "zplc ntp status",
    "zplc ntp status --json",
    "zplc comm map",
    "zplc comm map --json",
    "zplc version",
    "zplc dbg info",
    "zplc dbg ticks",
    "zplc dbg force list",
    "zplc dbg bp list",
    "zplc config save",
    "zplc config set mqtt_password",
    "zplc config set mqtt_port notanumber",
    "zplc config set no_such_key PW-7f3a-mqtt-password",
    "help",
};

static void assert_no_secret(const char *what) {
  for (size_t i = 0; i < ARRAY_SIZE(secret_markers); i++) {
    zassert_is_null(strstr(out, secret_markers[i]), "'%s' printed a credential: %s", what, out);
    zassert_is_null(strstr(captured, secret_markers[i]), "'%s' logged a credential: %s", what, captured);
  }
}

ZTEST(comm_safety, test_no_command_prints_a_credential) {
  captured_length = 0U;
  captured[0] = '\0';
  zassert_ok(run("zplc config set mqtt_password PW-7f3a-mqtt-password"), "set");
  assert_no_secret("config set mqtt_password");
  zassert_ok(run("zplc config set wifi_pass PW-7f3a-wifi-password"), "set");
  assert_no_secret("config set wifi_pass");
  zassert_ok(run("zplc config set azure_sas_key KEY-7f3a-azure-sas-key"), "set");
  assert_no_secret("config set azure_sas_key");
  zassert_ok(run("zplc config set mqtt_username USER-7f3a-mqtt-username"), "set");
  assert_no_secret("config set mqtt_username");

  for (size_t i = 0; i < ARRAY_SIZE(reporting_commands); i++) {
    (void)run(reporting_commands[i]);
    assert_no_secret(reporting_commands[i]);
  }

  /* `config get` says that a credential is set, and nothing more. */
  zassert_ok(run("zplc config get"), "config get");
  zassert_not_null(strstr(out, "MQTT Password: (set)"), "%s", out);
  zassert_not_null(strstr(out, "WiFi Password: (set)"), "%s", out);
  zassert_not_null(strstr(out, "Azure SAS Key: (set)"), "%s", out);

  /* And the value is still there for the client that needs it. */
  char value[64];

  zplc_config_get_mqtt_password(value, sizeof(value));
  zassert_str_equal(value, "PW-7f3a-mqtt-password", "stored value intact");

  /* A reboot reads them back, still not printing them. */
  zassert_ok(run("zplc config save"), "save");
  zassert_ok(zplc_config_init(), "reboot");
  zassert_ok(run("zplc config get"), "config get");
  assert_no_secret("config get after reboot");
  zassert_not_null(strstr(out, "MQTT Password: (set)"), "%s", out);

  /* The log was alive for all of it: the reboot above logged. */
  zassert_not_null(strstr(captured, "Config loaded"), "the capture back end saw the config log: '%s'", captured);
}

/* ------------------------------------------------------------ COM-022 */

ZTEST(comm_safety, test_raw_memory_command_exists_only_in_the_diagnostic_image) {
  int rc = run("devmem");

#if defined(CONFIG_ZPLC_SHELL_RAW_MEMORY)
  zassert_not_equal(rc, -ENOEXEC, "devmem is in the diagnostic image: %s", out);
  zassert_is_null(strstr(out, "command not found"), "%s", out);
#else
  zassert_equal(rc, -ENOEXEC, "release firmware has no devmem: %d %s", rc, out);
  zassert_not_null(strstr(out, "not found"), "%s", out);
#endif
}

ZTEST(comm_safety, test_zplc_memory_commands_stop_at_the_plc_regions) {
  /* 0xF000 is past RETAIN: every command that takes an address refuses it. */
  zassert_not_equal(run("zplc dbg peek 0xF000 4"), 0, "peek");
  zassert_not_null(strstr(out, "out of bounds"), "%s", out);
  zassert_not_equal(run("zplc dbg mpeek 0xF000:4"), 0, "mpeek");
  zassert_not_equal(run("zplc dbg poke 0xF000 1"), 0, "poke");
  zassert_not_equal(run("zplc dbg force set 0xF000 01"), 0, "force set");
  zassert_not_equal(run("zplc dbg watch 0xF000 u8"), 0, "watch");
  zassert_not_equal(run("zplc dbg timer 0xF000"), 0, "timer");
  zassert_not_equal(run("zplc dbg mem code"), 0, "mem of a region that is not PLC data");
}

/* The documented commands are implemented (COM-022): none answers that it
 * is not, and each does what it says to PLC memory. */
ZTEST(comm_safety, test_watch_and_timer_read_plc_memory) {
  /* PLC memory is written the way everything outside the scan writes it:
	 * through the exchange, which applies it at once while no scan runs and
	 * publishes the snapshot that the shell reads. */
  static const uint8_t word[] = {0x34U, 0x12U};
  static const uint8_t timer[16] = {
      1U,    0U,            /* IN, Q */
      0xE8U, 0x03U, 0U, 0U, /* PT = 1000 ms */
      0xFAU, 0U,    0U, 0U, /* ET = 250 ms */
      0U,    0U,    0U, 0U, /* _start */
      1U,    0U,            /* running, _prev */
  };

  zassert_ok(zplc_exchange_write(0x2100U, word, sizeof(word)), "word");
  zassert_ok(zplc_exchange_write(0x2200U, timer, sizeof(timer)), "timer instance");
  zassert_ok(run("zplc dbg watch 0x2100 u16"), "watch u16");
  zassert_not_null(strstr(out, "0x2100 u16 = 4660"), "%s", out);
  zassert_ok(run("zplc dbg watch 0x2100"), "watch default type");
  zassert_not_null(strstr(out, "0x2100 u8 = 52"), "%s", out);
  zassert_ok(run("zplc dbg watch 0x2100 bool"), "watch bool");
  zassert_not_null(strstr(out, "true"), "%s", out);
  zassert_not_equal(run("zplc dbg watch 0x2100 q64"), 0, "unknown type");

  zassert_ok(run("zplc dbg timer 0x2200"), "timer");
  zassert_not_null(strstr(out, "IN=1 Q=0 PT=1000 ms ET=250 ms running=1"), "%s", out);

  zassert_ok(run("zplc dbg watch 0x2100 u8"), "watch");
  zassert_is_null(strstr(out, "not yet implemented"), "%s", out);
  zassert_ok(run("zplc dbg timer 0x2200"), "timer");
  zassert_is_null(strstr(out, "not implemented"), "%s", out);
}

/* ------------------------------------------------------------ COM-027 */

/* The keys `zplc config set` takes, and the row of the persisted table each
 * one sets: the same name, but for the three that carry a unit. */
static const struct {
  const char *key;
  const char *row;
} shell_keys[] = {
    {"hostname", "hostname"},
    {"dhcp", "dhcp"},
    {"ip", "ip"},
    {"wifi_ssid", "wifi_ssid"},
    {"wifi_pass", "wifi_pass"},
    {"wifi_security", "wifi_security"},
    {"ntp_enabled", "ntp_enabled"},
    {"ntp_server", "ntp_server"},
    {"modbus_id", "modbus_id"},
    {"modbus_tcp_enabled", "modbus_tcp_enabled"},
    {"modbus_tcp_port", "modbus_tcp_port"},
    {"modbus_rtu_enabled", "modbus_rtu_enabled"},
    {"modbus_rtu_baud", "modbus_rtu_baud"},
    {"modbus_rtu_parity", "modbus_rtu_parity"},
    {"modbus_rtu_client_enabled", "modbus_rtu_client_enabled"},
    {"modbus_rtu_client_slave_id", "modbus_rtu_client_slave_id"},
    {"modbus_rtu_client_poll_ms", "modbus_rtu_client_poll_ms"},
    {"modbus_tcp_client_enabled", "modbus_tcp_client_enabled"},
    {"modbus_tcp_client_host", "modbus_tcp_client_host"},
    {"modbus_tcp_client_port", "modbus_tcp_client_port"},
    {"modbus_tcp_client_unit_id", "modbus_tcp_client_unit_id"},
    {"modbus_tcp_client_poll_ms", "modbus_tcp_client_poll_ms"},
    {"modbus_tcp_client_timeout_ms", "modbus_tcp_client_timeout_ms"},
    {"mqtt_enabled", "mqtt_enabled"},
    {"mqtt_broker", "mqtt_broker"},
    {"mqtt_client_id", "mqtt_client_id"},
    {"mqtt_group_id", "mqtt_group_id"},
    {"mqtt_topic_namespace", "mqtt_topic_namespace"},
    {"mqtt_profile", "mqtt_profile"},
    {"mqtt_protocol", "mqtt_protocol"},
    {"mqtt_transport", "mqtt_transport"},
    {"mqtt_port", "mqtt_port"},
    {"mqtt_username", "mqtt_username"},
    {"mqtt_password", "mqtt_password"},
    {"mqtt_keepalive", "mqtt_keepalive_sec"},
    {"mqtt_publish_interval", "mqtt_publish_interval_ms"},
    {"mqtt_publish_qos", "mqtt_publish_qos"},
    {"mqtt_subscribe_qos", "mqtt_subscribe_qos"},
    {"mqtt_publish_retain", "mqtt_publish_retain"},
    {"mqtt_clean_session", "mqtt_clean_session"},
    {"mqtt_session_expiry", "mqtt_session_expiry_sec"},
    {"mqtt_security", "mqtt_security"},
    {"mqtt_websocket_path", "mqtt_websocket_path"},
    {"mqtt_alpn", "mqtt_alpn"},
    {"mqtt_lwt_enabled", "mqtt_lwt_enabled"},
    {"mqtt_lwt_topic", "mqtt_lwt_topic"},
    {"mqtt_lwt_payload", "mqtt_lwt_payload"},
    {"mqtt_lwt_qos", "mqtt_lwt_qos"},
    {"mqtt_lwt_retain", "mqtt_lwt_retain"},
    {"mqtt_ca_cert_path", "mqtt_ca_cert_path"},
    {"mqtt_client_cert_path", "mqtt_client_cert_path"},
    {"mqtt_client_key_path", "mqtt_client_key_path"},
    {"azure_sas_key", "azure_sas_key"},
    {"azure_sas_expiry_s", "azure_sas_expiry_s"},
    {"azure_twin_enabled", "azure_twin_enabled"},
    {"azure_direct_methods_enabled", "azure_direct_methods_enabled"},
    {"azure_c2d_enabled", "azure_c2d_enabled"},
    {"azure_dps_enabled", "azure_dps_enabled"},
    {"azure_dps_id_scope", "azure_dps_id_scope"},
    {"azure_dps_registration_id", "azure_dps_registration_id"},
    {"azure_dps_endpoint", "azure_dps_endpoint"},
    {"azure_event_grid_topic", "azure_event_grid_topic"},
    {"azure_event_grid_source", "azure_event_grid_source"},
    {"azure_event_grid_event_type", "azure_event_grid_event_type"},
    {"aws_shadow_enabled", "aws_shadow_enabled"},
    {"aws_jobs_enabled", "aws_jobs_enabled"},
    {"aws_fleet_enabled", "aws_fleet_enabled"},
    {"aws_fleet_template_name", "aws_fleet_template_name"},
    {"aws_claim_cert_path", "aws_claim_cert_path"},
    {"aws_claim_key_path", "aws_claim_key_path"},
};

#define ROW_MAX 70
#define VALUE_MAX 520

struct snapshot {
  size_t count;
  const char *name[ROW_MAX];
  size_t length[ROW_MAX];
  uint8_t value[ROW_MAX][VALUE_MAX];
};

static void take(struct snapshot *s) {
  s->count = zplc_config_test_row_count();
  zassert_true(s->count <= ROW_MAX, "ROW_MAX covers the table");
  for (size_t i = 0; i < s->count; i++) {
    s->name[i] = zplc_config_test_row(i, s->value[i], &s->length[i]);
    zassert_not_null(s->name[i], "row %zu", i);
  }
}

static size_t row_of(const struct snapshot *s, const char *name) {
  for (size_t i = 0; i < s->count; i++) {
    if (strcmp(s->name[i], name) == 0) {
      return i;
    }
  }
  return SIZE_MAX;
}

static bool same_row(const struct snapshot *a, const struct snapshot *b, size_t i) {
  return a->length[i] == b->length[i] && memcmp(a->value[i], b->value[i], a->length[i]) == 0;
}

static bool is_flag(const char *key) {
  size_t n = strlen(key);

  return strcmp(key, "dhcp") == 0 || strcmp(key, "mqtt_clean_session") == 0 || (n > 8 && strcmp(&key[n - 8], "_enabled") == 0) ||
         (n > 7 && strcmp(&key[n - 7], "_retain") == 0);
}

/* A value for `key` that differs from the previous candidate each time: a
 * number inside the key's range, a flag, or a string made of the key. */
static size_t candidates(const char *key, const char *out_values[4], char *text, size_t text_size) {
  static const char *const numbers[] = {"2", "1", "0", "3"};
  static const char *const flags[] = {"1", "0"};
  uint32_t max;

  if (zplc_config_number_max(key, &max) == 0) {
    for (size_t i = 0; i < ARRAY_SIZE(numbers); i++) {
      out_values[i] = numbers[i];
    }
    return ARRAY_SIZE(numbers);
  }
  if (is_flag(key)) {
    for (size_t i = 0; i < ARRAY_SIZE(flags); i++) {
      out_values[i] = flags[i];
    }
    return ARRAY_SIZE(flags);
  }
  snprintf(text, text_size, "v-%s", key);
  out_values[0] = text;
  return 1;
}

static struct snapshot defaults, changed, rebooted;

ZTEST(comm_safety, test_save_persists_every_setting_across_a_reboot) {
  take(&defaults);

  /* Every persisted row has a key that sets it, and every key a row. */
  for (size_t i = 0; i < defaults.count; i++) {
    bool found = false;

    for (size_t k = 0; k < ARRAY_SIZE(shell_keys); k++) {
      found = found || strcmp(shell_keys[k].row, defaults.name[i]) == 0;
    }
    zassert_true(found, "row '%s' has no `config set` key", defaults.name[i]);
  }
  zassert_equal(defaults.count, ARRAY_SIZE(shell_keys), "%zu rows, %zu keys", defaults.count, ARRAY_SIZE(shell_keys));

  for (size_t k = 0; k < ARRAY_SIZE(shell_keys); k++) {
    const char *key = shell_keys[k].key;
    size_t row = row_of(&defaults, shell_keys[k].row);
    const char *values[4];
    char text[64];
    size_t n = candidates(key, values, text, sizeof(text));
    bool moved = false;

    zassert_true(row != SIZE_MAX, "row '%s'", shell_keys[k].row);
    for (size_t c = 0; c < n && !moved; c++) {
      char cmd[160];

      snprintf(cmd, sizeof(cmd), "zplc config set %s %s", key, values[c]);
      if (run(cmd) != 0) {
        continue; /* out of range, or refused by this build */
      }
      take(&changed);
      moved = !same_row(&defaults, &changed, row);
    }
    zassert_true(moved, "`config set %s` did not change its row", key);
  }

  take(&changed);
  zassert_ok(run("zplc config save"), "save: %s", out);
  zassert_not_null(strstr(out, "OK: Config saved"), "%s", out);

  /* A reboot: memory back to the defaults, the store read. */
  zassert_ok(zplc_config_init(), "reboot");
  take(&rebooted);
  for (size_t i = 0; i < changed.count; i++) {
    zassert_true(same_row(&changed, &rebooted, i), "setting '%s' was not kept across the reboot", changed.name[i]);
    zassert_false(same_row(&defaults, &rebooted, i), "setting '%s' came back as its default", changed.name[i]);
  }
}

/* The value a flag key takes is not the same for every key, and a refactor of the command is where that gets lost:
 * `dhcp` is true for "true" and "1" only, the rest also for "on", and any other text is false without an error. The
 * expected texts are what the command printed before its key table (WS-42). */
static const char *const flag_keys[] = {
    "dhcp",
    "ntp_enabled",
    "modbus_tcp_enabled",
    "modbus_rtu_enabled",
    "modbus_rtu_client_enabled",
    "modbus_tcp_client_enabled",
    "mqtt_enabled",
    "mqtt_publish_retain",
    "mqtt_clean_session",
    "mqtt_lwt_enabled",
    "mqtt_lwt_retain",
    "azure_twin_enabled",
    "azure_direct_methods_enabled",
    "azure_c2d_enabled",
    "azure_dps_enabled",
    "aws_shadow_enabled",
    "aws_jobs_enabled",
    "aws_fleet_enabled",
};

static bool flag_row(const char *row) {
  uint8_t value[VALUE_MAX];
  size_t length = 0U;

  for (size_t i = 0; i < zplc_config_test_row_count(); i++) {
    const char *name = zplc_config_test_row(i, value, &length);

    if (name != NULL && strcmp(name, row) == 0) {
      zassert_equal(length, 1U, "%s is one byte", row);
      return value[0] != 0U;
    }
  }
  zassert_unreachable("row %s", row);
  return false;
}

static bool set_flag(const char *key, const char *value) {
  char cmd[96];

  snprintf(cmd, sizeof(cmd), "zplc config set %s %s", key, value);
  zassert_ok(run(cmd), "%s: %s", cmd, out);
  zassert_not_null(strstr(out, "OK: Config updated"), "%s", out);
  return flag_row(key);
}

ZTEST(comm_safety, test_config_set_flags_keep_the_values_they_accept) {
  for (size_t i = 0; i < ARRAY_SIZE(flag_keys); i++) {
    const char *key = flag_keys[i];
    const bool takes_on = strcmp(key, "dhcp") != 0;

    zassert_true(set_flag(key, "1"), "%s 1", key);
    zassert_false(set_flag(key, "0"), "%s 0", key);
    zassert_true(set_flag(key, "true"), "%s true", key);
    zassert_false(set_flag(key, "false"), "%s false", key);
    zassert_equal(set_flag(key, "on"), takes_on, "%s on", key);
    (void)set_flag(key, "1");
    zassert_false(set_flag(key, "yes"), "%s yes is false, not an error", key);
    (void)set_flag(key, "1");
    zassert_false(set_flag(key, "TRUE"), "%s TRUE is false: the match is exact", key);
  }
}

ZTEST(comm_safety, test_config_set_keeps_its_messages) {
  /* The shell asks for the key and the value before the handler runs: one argument short never reaches it. */
  zassert_not_equal(run("zplc config set mqtt_port"), 0, "a value is required");
  zassert_not_null(strstr(out, "set: wrong parameter count"), "%s", out);
  zassert_is_null(strstr(out, "Keys:"), "%s", out);

  zassert_equal(run("zplc config set no_such_key 1"), -EINVAL, "unknown key");
  zassert_not_null(strstr(out, "ERROR: Unknown config key: no_such_key"), "%s", out);

  /* A number is checked before anything is stored, and the value a setter clamps is still clamped by it. */
  zassert_equal(run("zplc config set mqtt_port 70000"), -EINVAL, "range");
  zassert_not_null(strstr(out, "ERROR: mqtt_port must be a whole number from 0 to 65535, got '70000'"), "%s", out);
  zassert_equal(run("zplc config set mqtt_port 12x"), -EINVAL, "not a number");
  zassert_not_null(strstr(out, "ERROR: mqtt_port must be a whole decimal number, got '12x'"), "%s", out);
  zassert_ok(run("zplc config set azure_sas_expiry_s 10"), "clamped, not refused");
  zassert_equal(zplc_config_get_azure_sas_expiry_s(), 300U, "the setter's lower bound");
}

/* ------------------------------------------------------------ WS-42 */

static uint32_t upload_crc32(const uint8_t *data, size_t length, uint32_t crc) {
  for (size_t i = 0; i < length; i++) {
    crc ^= data[i];
    for (unsigned bit = 0; bit < 8U; bit++) {
      crc = (crc & 1U) != 0U ? (crc >> 1) ^ 0xEDB88320U : crc >> 1;
    }
  }
  return crc;
}

/* One cyclic task of 10 ms over six bytes of code: PUSH8 <tag>, STORE8 OPI, HALT. */
static size_t upload_program(uint8_t *out, uint8_t tag) {
  const size_t header = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE;
  const size_t total = header + 6U + ZPLC_TASK_DEF_SIZE;
  uint8_t *code = out + header;
  uint8_t *task = code + 6U;
  uint32_t crc;

  memset(out, 0, total);
  memcpy(out, "ZPLC", 4U);
  out[4] = (uint8_t)ZPLC_VERSION_MAJOR;
  out[5] = (uint8_t)(ZPLC_VERSION_MAJOR >> 8);
  out[6] = (uint8_t)ZPLC_VERSION_MINOR;
  out[7] = (uint8_t)(ZPLC_VERSION_MINOR >> 8);
  out[28] = (uint8_t)ZPLC_DRAFT_COUNTER;
  out[29] = (uint8_t)(ZPLC_DRAFT_COUNTER >> 8);
  out[30] = (uint8_t)(ZPLC_DRAFT_COUNTER >> 16);
  out[31] = (uint8_t)(ZPLC_DRAFT_COUNTER >> 24);
  out[16] = 6U;
  out[20] = (uint8_t)ZPLC_TASK_DEF_SIZE;
  out[26] = 2U;
  out[32] = (uint8_t)ZPLC_SEG_CODE;
  out[36] = 6U;
  out[40] = (uint8_t)ZPLC_SEG_TASK;
  out[44] = (uint8_t)ZPLC_TASK_DEF_SIZE;
  code[0] = OP_PUSH8;
  code[1] = tag;
  code[2] = OP_STORE8;
  code[3] = (uint8_t)ZPLC_MEM_OPI_BASE;
  code[4] = (uint8_t)(ZPLC_MEM_OPI_BASE >> 8);
  code[5] = OP_HALT;
  task[2] = ZPLC_TASK_CYCLIC;
  task[3] = 1U;
  task[4] = 0x10U; /* 10000 us */
  task[5] = 0x27U;
  task[10] = 64U;
  crc = upload_crc32(out, 12U, 0xFFFFFFFFU);
  crc = upload_crc32(out + 16U, total - 16U, crc) ^ 0xFFFFFFFFU;
  out[12] = (uint8_t)crc;
  out[13] = (uint8_t)(crc >> 8);
  out[14] = (uint8_t)(crc >> 16);
  out[15] = (uint8_t)(crc >> 24);
  return total;
}

/* `zplc sched load` and `zplc sched data`, 16 bytes a line, as Studio's text upload sends them. */
static int upload(const uint8_t *program, size_t size) {
  static const char digits[] = "0123456789abcdef";
  char cmd[96];
  int rc;

  snprintf(cmd, sizeof(cmd), "zplc sched load %zu", size);
  rc = run(cmd);
  if (rc != 0) {
    return rc;
  }
  for (size_t at = 0; at < size; at += 16U) {
    size_t n = size - at < 16U ? size - at : 16U;
    size_t len = (size_t)snprintf(cmd, sizeof(cmd), "zplc sched data ");

    for (size_t i = 0; i < n; i++) {
      cmd[len++] = digits[program[at + i] >> 4];
      cmd[len++] = digits[program[at + i] & 0x0FU];
    }
    cmd[len] = '\0';
    rc = run(cmd);
    if (rc != 0) {
      return rc;
    }
  }
  return 0;
}

/* The store has no buffer of the code size for its rollback check: the shell finds the rollback when the upload
 * starts, and the commit at the end of it has to go through, for a first program and for a replacement, and
 * has to refuse (writing nothing) when the store cannot be verified. */
ZTEST(comm_safety, test_a_text_upload_is_stored_and_a_second_one_replaces_it) {
  static uint8_t first[128];
  static uint8_t second[128];
  static uint8_t restored[ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE + ZPLC_PROGRAM_STORE_FOOTER_SIZE];
  size_t first_size = upload_program(first, 0x11U);
  size_t second_size = upload_program(second, 0x22U);
  size_t restored_size = 0U;

  zassert_equal(zplc_hal_init(), ZPLC_HAL_OK, "HAL");
  zassert_ok(zplc_sched_init(), "scheduler");
  zassert_ok(upload(first, first_size), "first upload: %s", out);
  zassert_not_null(strstr(out, "OK: Program loaded"), "%s", out);
  zassert_equal(zplc_program_store_restore(restored, sizeof(restored), &restored_size), ZPLC_PROGRAM_STORE_OK, "the program is stored");
  zassert_equal(restored_size, first_size, "at its size");
  zassert_mem_equal(restored, first, first_size, "byte for byte");

  zassert_ok(upload(second, second_size), "second upload: %s", out);
  zassert_not_null(strstr(out, "OK: Program loaded"), "%s", out);
  zassert_equal(zplc_program_store_restore(restored, sizeof(restored), &restored_size), ZPLC_PROGRAM_STORE_OK, "the replacement is stored");
  zassert_mem_equal(restored, second, second_size, "and it is the one that restores");
}

ZTEST(comm_safety, test_a_failed_store_is_reported_and_never_ok) {
  zplc_config_test_fail_store_after(5, -EIO);
  zassert_equal(run("zplc config save"), -EIO, "save returns the error");
  zassert_not_null(strstr(out, "ERROR"), "%s", out);
  zassert_is_null(strstr(out, "OK: Config saved"), "%s", out);

  zplc_config_test_fail_store_after(0, -ENOTSUP);
  zassert_equal(run("zplc config save"), -ENOTSUP, "no storage");
  zassert_is_null(strstr(out, "OK: Config saved"), "%s", out);

  zassert_equal(run("zplc config reset"), -ENOTSUP, "reset reports it too");
  zassert_is_null(strstr(out, "OK:"), "%s", out);

  zplc_config_test_fail_store_after(-1, 0);
  zassert_ok(run("zplc config save"), "save works again");
}

ZTEST(comm_safety, test_modbus_overrides_survive_a_reboot) {
  uint32_t address = 0U;

  zassert_ok(zplc_config_set_modbus_tag_override(3U, 1234U, 1U), "set");
  zassert_ok(zplc_config_save(), "save");
  zassert_ok(zplc_config_clear_modbus_tag_override(3U), "clear");
  zassert_ok(zplc_config_init(), "reboot");
  /* The cleared override is back from the store. */
  zassert_true(zplc_config_get_modbus_tag_override(3U, 1U, &address), "override restored");
  zassert_equal(address, 1234U, "address");
  zassert_false(zplc_config_get_modbus_tag_override(4U, 1U, &address), "an override that was never set stays off");
}

ZTEST_SUITE(comm_safety, NULL, setup, before, NULL, NULL);
