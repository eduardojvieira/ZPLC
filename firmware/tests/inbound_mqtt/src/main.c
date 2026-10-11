/*
 * COM-017: no message that arrives over MQTT changes RUN/STOP, sets or clears
 * a force, or downloads a program.
 *
 * The MQTT client of the product (zplc_mqtt.c, with its Sparkplug B protobuf
 * files and the real configuration) receives hostile topics and payloads for
 * every profile, through the dispatch that a PUBLISH from the network goes
 * through. Behind it is a core that is not the real one: the entry points
 * that start, stop, force or load are traps that count a call, the direct
 * way into PLC memory (the live region, the image lock, the force-aware
 * write) is a trap too, because a client reaches memory through the exchange
 * only (zplc_exchange.h), and the one write that a message may cause, the queued write
 * to a subscribed variable, is a spy that records what it was asked to write.
 */
#include <errno.h>
#include <string.h>

#include <zephyr/kernel.h>
#include <zephyr/ztest.h>

#include <pb_encode.h>
#include "proto/sparkplug_b.pb.h"

#include <zplc_core.h>
#include <zplc_exchange.h>
#include <zplc_hal.h>
#include <zplc_isa.h>

#include "zplc_config.h"
#include "zplc_mqtt_command.h"

int zplc_mqtt_test_inject(const char *topic, const uint8_t *payload, size_t payload_len);

/* ---- the core ------------------------------------------------------------ */
static uint8_t image[0x4000];
static zplc_tag_entry_t tags[6];
static int authority_calls;
static int lock_depth;

struct write_record {
	uint16_t addr;
	uint16_t size;
	uint8_t bytes[4];
};
static struct write_record writes[4096];
static int write_count;

uint16_t zplc_core_get_tag_count(void) { return ARRAY_SIZE(tags); }
const zplc_tag_entry_t *zplc_core_get_tag(uint16_t index)
{ return index < ARRAY_SIZE(tags) ? &tags[index] : NULL; }

/* The exchange: a write is recorded, a read is answered from the small image. */
int zplc_exchange_write(uint16_t addr, const uint8_t *bytes, uint16_t size)
{
	if (write_count < (int)ARRAY_SIZE(writes)) {
		writes[write_count].addr = addr;
		writes[write_count].size = size;
		memcpy(writes[write_count].bytes, bytes, size <= 4U ? size : 4U);
	}
	write_count++;
	return 0;
}
int zplc_exchange_read(uint16_t addr, uint8_t *out, uint16_t size)
{
	if (addr < ZPLC_MEM_WORK_BASE || (size_t)addr - ZPLC_MEM_WORK_BASE + size > sizeof(image)) {
		return ZPLC_EXCHANGE_ERR_RANGE;
	}
	memcpy(out, &image[addr - ZPLC_MEM_WORK_BASE], size);
	return 0;
}
int zplc_exchange_read_lock(void) { lock_depth++; return 0; }
int zplc_exchange_read_locked(uint16_t addr, uint8_t *out, uint16_t size)
{ return zplc_exchange_read(addr, out, size); }
void zplc_exchange_read_unlock(void) { lock_depth--; }

#define TRAP_INT(name, ...) int name(__VA_ARGS__) { authority_calls++; return -EPERM; }
#define TRAP_VOID(name, ...) void name(__VA_ARGS__) { authority_calls++; }
TRAP_INT(zplc_sched_start, void)
TRAP_INT(zplc_sched_stop, void)
TRAP_INT(zplc_sched_pause, void)
TRAP_INT(zplc_sched_resume, void)
TRAP_INT(zplc_sched_step, void)
TRAP_INT(zplc_sched_enter_safe_error, void)
TRAP_INT(zplc_sched_load, const uint8_t *binary, size_t size)
TRAP_INT(zplc_force_set_bytes, uint16_t addr, const uint8_t *bytes, uint16_t size)
TRAP_INT(zplc_force_clear, uint16_t addr)
TRAP_VOID(zplc_force_clear_all, void)
TRAP_INT(zplc_core_load, const uint8_t *binary, size_t size, uint8_t *workspace, size_t workspace_size)
/* The direct way into PLC memory, round the exchange. */
TRAP_INT(zplc_force_write_bytes, uint16_t addr, const uint8_t *bytes, uint16_t size)
TRAP_INT(zplc_pi_lock, void)
TRAP_VOID(zplc_pi_unlock, void)
uint8_t *zplc_mem_get_region(uint16_t region) { authority_calls++; ARG_UNUSED(region); return NULL; }

/* ---- the rest of what the client links against --------------------------- */
int zplc_azure_sas_generate(const char *hub, const char *device, const char *key, uint32_t expiry_s,
			    char *out, size_t out_len)
{ ARG_UNUSED(hub); ARG_UNUSED(device); ARG_UNUSED(key); ARG_UNUSED(expiry_s); ARG_UNUSED(out); ARG_UNUSED(out_len); return -ENOTSUP; }
int64_t zplc_time_get_unix_ms(void) { return 1700000000000LL; }
zplc_hal_result_t zplc_hal_persist_save(const char *key, const void *data, size_t len)
{ ARG_UNUSED(key); ARG_UNUSED(data); ARG_UNUSED(len); return ZPLC_HAL_NOT_IMPL; }
zplc_hal_result_t zplc_hal_persist_load(const char *key, void *data, size_t len)
{ ARG_UNUSED(key); ARG_UNUSED(data); ARG_UNUSED(len); return ZPLC_HAL_NOT_IMPL; }
zplc_hal_result_t zplc_hal_persist_delete(const char *key)
{ ARG_UNUSED(key); return ZPLC_HAL_NOT_IMPL; }

/* ---- fixtures ------------------------------------------------------------ */
static void before(void *fixture)
{
	ARG_UNUSED(fixture);
	memset(image, 0, sizeof(image));
	memset(tags, 0, sizeof(tags));
	/* Three variables that are subscribed, one that is not, and two whose
	 * address a hostile project could pick: the input image and the code
	 * region. */
	tags[0] = (zplc_tag_entry_t){ .var_addr = 0x2000U, .var_type = ZPLC_TYPE_BOOL, .tag_id = ZPLC_TAG_SUBSCRIBE };
	tags[1] = (zplc_tag_entry_t){ .var_addr = 0x2002U, .var_type = ZPLC_TYPE_INT, .tag_id = ZPLC_TAG_SUBSCRIBE };
	tags[2] = (zplc_tag_entry_t){ .var_addr = 0x2004U, .var_type = ZPLC_TYPE_REAL, .tag_id = ZPLC_TAG_SUBSCRIBE };
	tags[3] = (zplc_tag_entry_t){ .var_addr = 0x2010U, .var_type = ZPLC_TYPE_BOOL, .tag_id = ZPLC_TAG_PUBLISH };
	tags[4] = (zplc_tag_entry_t){ .var_addr = 0x0000U, .var_type = ZPLC_TYPE_BOOL, .tag_id = ZPLC_TAG_SUBSCRIBE };
	tags[5] = (zplc_tag_entry_t){ .var_addr = 0x5000U, .var_type = ZPLC_TYPE_REAL, .tag_id = ZPLC_TAG_SUBSCRIBE };
	authority_calls = 0;
	write_count = 0;
	lock_depth = 0;
	memset(writes, 0, sizeof(writes));

	zplc_config_set_mqtt_client_id("dev1");
	zplc_config_set_mqtt_group_id("G");
	zplc_config_set_mqtt_topic_namespace("ns");
	zplc_config_set_azure_c2d_enabled(true);
	zplc_config_set_azure_twin_enabled(true);
	zplc_config_set_azure_direct_methods_enabled(true);
	zplc_config_set_aws_shadow_enabled(true);
	zplc_config_set_aws_jobs_enabled(true);
}

static const struct {
	zplc_mqtt_profile_t profile;
	const char *name;
	const char *tag_topic_fmt; /* %04x is the variable address */
	const char *node_topic;
} profiles[] = {
	{ ZPLC_MQTT_PROFILE_SPARKPLUG_B, "sparkplug", "spBv1.0/G/DCMD/dev1/tag_%04x", "spBv1.0/G/NCMD/dev1" },
	{ ZPLC_MQTT_PROFILE_GENERIC_BROKER, "generic", "ns/cmd/dev1/tag_%04x", "ns/cmd/dev1" },
	{ ZPLC_MQTT_PROFILE_AWS_IOT_CORE, "aws", "$aws/things/dev1/jobs/notify", "$aws/things/dev1/shadow/update/delta" },
	{ ZPLC_MQTT_PROFILE_AZURE_IOT_HUB, "azure", "devices/dev1/messages/devicebound/#", "$iothub/methods/POST/stop/?$rid=1" },
	{ ZPLC_MQTT_PROFILE_AZURE_EVENT_GRID, "eventgrid", "ns/commands/tag_%04x", "ns/commands/stop" },
};

/* What an operator, a SCADA host or an attacker could send to a controller to
 * make it stop, run, force or take a program. */
static const char *const hostile_payloads[] = {
	"STOP", "stop", "RUN", "run", "start", "pause", "resume", "step", "reset", "reboot", "restart",
	"force 2000 01", "force set 0x2000 FF", "unforce", "clear", "clear_all", "zplc stop", "zplc start",
	"zplc dbg force set 0x2000 01", "zplc load 100", "zplc data 5a504c43", "load", "download",
	"tag_2000=1", "tag_0000=1", "tag_5000=1.5", "{\"cmd\":\"stop\"}", "{\"method\":\"reboot\"}",
	"{\"jobDocument\":{\"operation\":\"stop\"}}", "{\"state\":{\"desired\":{\"run\":false}}}",
	"1", "0", "true", "false", "32767", "-32768", "3.5", "1e38", "nan", "inf", "",
	" 1", "1 ", "1\n", "0x2000", "../../etc/passwd", "%s%s%s%n", "\xff\xfe\xfd",
};

static void inject_all(const char *topic)
{
	uint8_t big[ZPLC_MQTT_COMMAND_MAX_PAYLOAD + 1];

	for (size_t i = 0; i < ARRAY_SIZE(hostile_payloads); i++) {
		(void)zplc_mqtt_test_inject(topic, (const uint8_t *)hostile_payloads[i],
					    strlen(hostile_payloads[i]));
		zassert_equal(authority_calls, 0, "'%s' on '%s' reached the runtime",
			      hostile_payloads[i], topic);
	}
	/* Binary: every byte value, a NUL in the middle, the longest and one
	 * over. */
	for (unsigned int value = 0U; value < 256U; value++) {
		uint8_t byte = (uint8_t)value;

		(void)zplc_mqtt_test_inject(topic, &byte, 1U);
	}
	memset(big, '1', sizeof(big));
	(void)zplc_mqtt_test_inject(topic, big, ZPLC_MQTT_COMMAND_MAX_PAYLOAD);
	(void)zplc_mqtt_test_inject(topic, big, sizeof(big));
	zassert_equal(authority_calls, 0, "binary payloads on '%s' reached the runtime", topic);
}

ZTEST(inbound_mqtt, test_hostile_payloads_reach_no_authority_in_any_profile)
{
	char topic[160];

	for (size_t p = 0; p < ARRAY_SIZE(profiles); p++) {
		zplc_config_set_mqtt_profile(profiles[p].profile);

		/* Each subscribed variable's topic, a topic of a variable that is not
		 * subscribed, and the node topic of the profile. */
		for (size_t t = 0; t < ARRAY_SIZE(tags); t++) {
			snprintf(topic, sizeof(topic), profiles[p].tag_topic_fmt, tags[t].var_addr);
			inject_all(topic);
		}
		inject_all(profiles[p].node_topic);
		inject_all("$iothub/twin/res/200/?$rid=1");
		inject_all("$iothub/twin/PATCH/properties/desired/?$version=2");
		inject_all("$aws/things/dev1/shadow/update/delta");
		inject_all("zplc/command/stop");
		inject_all("");
		zassert_equal(lock_depth, 0, "process image lock balanced (%s)", profiles[p].name);
	}
}

/* Every write a message caused is a legitimate one: the address is the one of
 * a subscribed variable inside WORK or RETAIN, and the size is the size of its
 * type. */
ZTEST(inbound_mqtt, test_the_only_write_a_message_causes_is_to_a_subscribed_variable)
{
	char topic[160];

	for (size_t p = 0; p < ARRAY_SIZE(profiles); p++) {
		zplc_config_set_mqtt_profile(profiles[p].profile);
		for (size_t t = 0; t < ARRAY_SIZE(tags); t++) {
			snprintf(topic, sizeof(topic), profiles[p].tag_topic_fmt, tags[t].var_addr);
			inject_all(topic);
		}
		inject_all(profiles[p].node_topic);
	}
	zassert_true(write_count <= (int)ARRAY_SIZE(writes), "the spy kept every write");
	for (int i = 0; i < write_count; i++) {
		bool subscribed = false;

		for (size_t t = 0; t < ARRAY_SIZE(tags); t++) {
			subscribed = subscribed || (tags[t].tag_id == ZPLC_TAG_SUBSCRIBE &&
						    tags[t].var_addr == writes[i].addr);
		}
		zassert_true(subscribed, "write %d went to 0x%04x, which is not subscribed", i,
			     writes[i].addr);
		zassert_true(writes[i].addr >= ZPLC_MEM_WORK_BASE, "0x%04x is below WORK", writes[i].addr);
		zassert_true(writes[i].size == 1U || writes[i].size == 2U || writes[i].size == 4U,
			     "write size %u", writes[i].size);
	}
	zassert_equal(authority_calls, 0, "no authority");
}

/* The control: the same path does write when it is allowed to, so a run that
 * shows no authority call is not a run in which nothing ever happened. */
ZTEST(inbound_mqtt, test_control_a_payload_for_a_subscribed_variable_is_written)
{
	zplc_config_set_mqtt_profile(ZPLC_MQTT_PROFILE_GENERIC_BROKER);
	zassert_ok(zplc_mqtt_test_inject("ns/cmd/dev1/tag_2000", (const uint8_t *)"1", 1U), "bool");
	zassert_equal(write_count, 1, "one write");
	zassert_equal(writes[0].addr, 0x2000U, "address");
	zassert_equal(writes[0].size, 1U, "size");
	zassert_equal(writes[0].bytes[0], 1U, "value");
	zassert_equal(authority_calls, 0, "no authority");

	/* The input image and the code region are not writable by a message,
	 * even when a project subscribes a variable there. */
	write_count = 0;
	(void)zplc_mqtt_test_inject("ns/cmd/dev1/tag_0000", (const uint8_t *)"1", 1U);
	(void)zplc_mqtt_test_inject("ns/cmd/dev1/tag_5000", (const uint8_t *)"1.5", 3U);
	zassert_equal(write_count, 0, "no write outside WORK and RETAIN");
}

/* Sparkplug B: a well-formed NCMD that asks for what the specification
 * defines as node control, apart from the rebirth, has no effect on the
 * controller. */
ZTEST(inbound_mqtt, test_sparkplug_node_control_other_than_rebirth_is_ignored)
{
	static const char *const names[] = {"Node Control/Reboot", "Node Control/Next Server",
					    "Node Control/Scan Rate", "Device Control/Reboot",
					    "Properties/Stop", "RUN", "STOP"};
	uint8_t buffer[128];

	zplc_config_set_mqtt_profile(ZPLC_MQTT_PROFILE_SPARKPLUG_B);
	for (size_t i = 0; i < ARRAY_SIZE(names); i++) {
		org_eclipse_tahu_protobuf_Payload payload = org_eclipse_tahu_protobuf_Payload_init_zero;
		pb_ostream_t stream = pb_ostream_from_buffer(buffer, sizeof(buffer));

		payload.metrics_count = 1;
		strncpy(payload.metrics[0].name, names[i], sizeof(payload.metrics[0].name) - 1U);
		payload.metrics[0].which_value = org_eclipse_tahu_protobuf_Metric_boolean_value_tag;
		payload.metrics[0].value.boolean_value = true;
		zassert_true(pb_encode(&stream, org_eclipse_tahu_protobuf_Payload_fields, &payload),
			     "encode %s", names[i]);
		(void)zplc_mqtt_test_inject("spBv1.0/G/NCMD/dev1", buffer, stream.bytes_written);
		(void)zplc_mqtt_test_inject("spBv1.0/G/DCMD/dev1/tag_2000", buffer, stream.bytes_written);
		zassert_equal(authority_calls, 0, "'%s' reached the runtime", names[i]);
	}
	zassert_equal(write_count, 0, "and wrote nothing");
}

ZTEST_SUITE(inbound_mqtt, NULL, NULL, before, NULL, NULL);
