/*
 * The cloud function blocks on the real worker thread, queue and spinlock
 * (COM-002, COM-003, COM-004, COM-008, COM-018).
 *
 * The handler of the product (zplc_comm_cloud_handler.c) runs with its real
 * worker thread, behind the real dispatcher of the core. The two provisioning
 * services are replaced by ones that wait for the better part of a second, as
 * the real ones wait for a broker, and the MQTT client by a stand-in the test
 * controls. The scan of the test is a loop of 10 ms: a block that waited for
 * a service inside the scan would take the loop out of its period.
 */
#include <errno.h>
#include <string.h>

#include <zephyr/kernel.h>
#include <zephyr/ztest.h>

#include <zplc_comm_dispatch.h>

#include "zplc_config.h"
#include "zplc_mqtt_fb.h"

int zplc_comm_cloud_handler_init(void);

/* ---- the services the worker calls ---- */
#define SERVICE_MS 800
static int dps_calls;
static int dps_rc;
static int fleet_calls;
static int fleet_rc;
static char registration_id[64];
static char broker[64];
static char client_id[64];

int zplc_azure_dps_provision(void)
{
	dps_calls++;
	k_msleep(SERVICE_MS); /* a broker that answers late */
	if (dps_rc == 0) {
		strcpy(broker, "hub-1.azure-devices.net");
	}
	return dps_rc;
}
int zplc_aws_fleet_provision(void)
{
	fleet_calls++;
	k_msleep(SERVICE_MS);
	if (fleet_rc == 0) {
		strcpy(client_id, "thing-7");
	}
	return fleet_rc;
}
bool zplc_aws_fleet_is_provisioned(void) { return false; }
void zplc_config_set_azure_dps_registration_id(const char *id)
{
	strncpy(registration_id, id, sizeof(registration_id) - 1U);
}
void zplc_config_set_aws_fleet_template_name(const char *name) { ARG_UNUSED(name); }
void zplc_config_get_mqtt_broker(char *buf, size_t len) { strncpy(buf, broker, len); buf[len - 1U] = '\0'; }
void zplc_config_get_mqtt_client_id(char *buf, size_t len) { strncpy(buf, client_id, len); buf[len - 1U] = '\0'; }

/* ---- the MQTT client the other blocks ask ---- */
static int eg_calls;
static int rebirth_calls;
static int poll_result;
static int session_up = 1;
zplc_mqtt_fb_session_t zplc_mqtt_fb_session(int *last_error)
{
	if (last_error != NULL) {
		*last_error = 0;
	}
	return session_up ? ZPLC_MQTT_FB_UP : ZPLC_MQTT_FB_DOWN;
}
int zplc_mqtt_fb_publish(const void *o, const char *t, const uint8_t *p, size_t l, uint8_t q, bool r)
{ ARG_UNUSED(o); ARG_UNUSED(t); ARG_UNUSED(p); ARG_UNUSED(l); ARG_UNUSED(q); ARG_UNUSED(r);
  return ZPLC_COMM_HANDLER_PENDING; }
int zplc_mqtt_fb_event_grid(const void *o, const char *a, const char *b, const char *c)
{ ARG_UNUSED(o); ARG_UNUSED(a); ARG_UNUSED(b); ARG_UNUSED(c); eg_calls++; return ZPLC_COMM_HANDLER_PENDING; }
int zplc_mqtt_fb_rebirth(const void *o)
{ ARG_UNUSED(o); rebirth_calls++; return ZPLC_COMM_HANDLER_PENDING; }
int zplc_mqtt_fb_poll(const void *o) { ARG_UNUSED(o); return poll_result; }
void zplc_mqtt_fb_abort(const void *o) { ARG_UNUSED(o); }
int zplc_mqtt_fb_subscribe(const void *o, const char *t, uint8_t q)
{ ARG_UNUSED(o); ARG_UNUSED(t); ARG_UNUSED(q); return ZPLC_COMM_HANDLER_DONE; }
int zplc_mqtt_fb_take_message(const void *o, uint8_t *p, size_t c)
{ ARG_UNUSED(o); ARG_UNUSED(p); ARG_UNUSED(c); return -1; }
void zplc_mqtt_fb_unsubscribe(const void *o) { ARG_UNUSED(o); }
bool zplc_mqtt_fb_c2d_available(void) { return true; }
bool zplc_mqtt_fb_sparkplug(void) { return true; }

/* ---- block helpers ---- */
static uint8_t dps[ZPLC_COMM_AZURE_DPS_PROV_SIZE];
static uint8_t fleet[ZPLC_COMM_AWS_FLEET_PROV_SIZE];
static uint8_t eg[ZPLC_COMM_AZURE_EG_PUB_SIZE];
static uint8_t spb[ZPLC_COMM_SPB_REBIRTH_SIZE];

static void set_string(uint8_t *block, unsigned offset, const char *text)
{
	const size_t n = strlen(text);

	block[offset] = (uint8_t)n;
	block[offset + 2] = 80;
	memcpy(&block[offset + 4], text, n + 1U);
}

static void scan(zplc_comm_fb_kind_t kind, uint8_t *block)
{
	zassert_ok(zplc_comm_fb_exec(kind, block, zplc_comm_fb_size(kind)), "dispatch");
}

static uint32_t status_of(const uint8_t *block)
{
	return (uint32_t)block[4] | ((uint32_t)block[5] << 8) | ((uint32_t)block[6] << 16) |
	       ((uint32_t)block[7] << 24);
}

static void *setup(void)
{
	zassert_ok(zplc_comm_cloud_handler_init(), "init");
	return NULL;
}

static void before(void *fixture)
{
	ARG_UNUSED(fixture);
	memset(dps, 0, sizeof(dps));
	memset(fleet, 0, sizeof(fleet));
	memset(eg, 0, sizeof(eg));
	memset(spb, 0, sizeof(spb));
	zplc_comm_fb_reset(ZPLC_COMM_FB_AZURE_DPS_PROV, dps, sizeof(dps));
	zplc_comm_fb_reset(ZPLC_COMM_FB_AWS_FLEET_PROV, fleet, sizeof(fleet));
	zplc_comm_fb_reset(ZPLC_COMM_FB_AZURE_EG_PUB, eg, sizeof(eg));
	zplc_comm_fb_reset(ZPLC_COMM_FB_SPB_REBIRTH, spb, sizeof(spb));
	k_msleep(SERVICE_MS + 100); /* a service from an earlier test is through */
	dps_calls = fleet_calls = eg_calls = rebirth_calls = 0;
	dps_rc = fleet_rc = 0;
	poll_result = ZPLC_COMM_HANDLER_PENDING;
	session_up = 1;
	broker[0] = client_id[0] = '\0';
}

/* COM-003: a provisioning service that waits for the better part of a second does not hold up the scan. */
ZTEST(comm_cloud_fb, test_provisioning_does_not_delay_the_scan_and_runs_once)
{
	int64_t worst_call_ms = 0;
	int64_t start = k_uptime_get();
	int64_t baseline_ms;
	int64_t with_block_ms;
	int busy_scans = 0;

	for (int i = 0; i < 150; i++) {
		k_msleep(10);
	}
	baseline_ms = k_uptime_get() - start;

	dps[0] = 1;
	set_string(dps, ZPLC_COMM_AZURE_DPS_PROV_DEVICE_ID_OFFSET, "device-0042");
	start = k_uptime_get();
	for (int i = 0; i < 150; i++) {
		const int64_t before_call = k_uptime_get();

		scan(ZPLC_COMM_FB_AZURE_DPS_PROV, dps);
		if (k_uptime_get() - before_call > worst_call_ms) {
			worst_call_ms = k_uptime_get() - before_call;
		}
		if (dps[1] != 0) {
			busy_scans++;
		}
		k_msleep(10);
	}
	with_block_ms = k_uptime_get() - start;

	zassert_equal(worst_call_ms, 0, "a call of the block took %lld ms of the clock", worst_call_ms);
	zassert_true(with_block_ms - baseline_ms < 30, "the loop with the block took %lld ms, without it %lld ms",
		     with_block_ms, baseline_ms);
	zassert_true(busy_scans > 20, "BUSY is seen across scans, not just once: %d", busy_scans);
	zassert_equal(dps[2], 1, "DONE is held");
	zassert_equal(dps[3], 0, "no ERROR");
	zassert_equal(status_of(dps), ZPLC_COMM_OK, "STATUS");
	zassert_equal(dps_calls, 1, "one trigger, one provisioning, got %d", dps_calls);
	zassert_str_equal(registration_id, "device-0042", "the DEVICE_ID pin is the registration id");
	zassert_equal(dps[ZPLC_COMM_AZURE_DPS_PROV_ASSIGNED_HUB_OFFSET], 23, "ASSIGNED_HUB length");
	zassert_mem_equal(&dps[ZPLC_COMM_AZURE_DPS_PROV_ASSIGNED_HUB_OFFSET + 4], "hub-1.azure-devices.net", 23,
			  "ASSIGNED_HUB");
	zassert_mem_equal(&dps[ZPLC_COMM_AZURE_DPS_PROV_DEVICE_ID_OFFSET + 4], "device-0042", 11,
			  "DEVICE_ID is intact");
}

ZTEST(comm_cloud_fb, test_a_failed_provisioning_is_an_error_with_a_status_and_is_not_repeated)
{
	fleet_rc = -ETIMEDOUT;
	fleet[0] = 1;
	set_string(fleet, ZPLC_COMM_AWS_FLEET_PROV_TEMPLATE_NAME_OFFSET, "plant");
	for (int i = 0; i < 120; i++) {
		scan(ZPLC_COMM_FB_AWS_FLEET_PROV, fleet);
		k_msleep(10);
	}
	zassert_equal(fleet[3], 1, "ERROR");
	zassert_equal(fleet[2], 0, "no DONE");
	zassert_equal(status_of(fleet), ZPLC_COMM_TIMEOUT, "TIMEOUT");
	zassert_equal(fleet_calls, 1, "a failure is not retried while EN stays, got %d", fleet_calls);
	zassert_equal(fleet[ZPLC_COMM_AWS_FLEET_PROV_THING_NAME_OFFSET], 0, "no thing");
}

/* COM-008: the block is reset while the service runs; the result is dropped, not delivered to whoever asks next. */
ZTEST(comm_cloud_fb, test_reset_while_the_service_runs_drops_its_result)
{
	dps[0] = 1;
	scan(ZPLC_COMM_FB_AZURE_DPS_PROV, dps);
	k_msleep(100); /* the worker is inside the service */
	zassert_equal(dps_calls, 1, "the service started");
	zassert_ok(zplc_comm_fb_reset(ZPLC_COMM_FB_AZURE_DPS_PROV, dps, sizeof(dps)), "reset");
	zassert_equal(dps[1], 0, "not busy");

	k_msleep(SERVICE_MS); /* the service finishes; its result belongs to nobody */
	dps[0] = 0;
	scan(ZPLC_COMM_FB_AZURE_DPS_PROV, dps);
	zassert_equal(dps[2], 0, "no DONE from the old request");
	zassert_equal(dps[ZPLC_COMM_AZURE_DPS_PROV_ASSIGNED_HUB_OFFSET], 0, "ASSIGNED_HUB is untouched");
}

ZTEST(comm_cloud_fb, test_event_grid_and_rebirth_ask_the_client_once_per_trigger)
{
	eg[0] = 1;
	set_string(eg, ZPLC_COMM_AZURE_EG_PUB_TOPIC_OFFSET, "t");
	set_string(eg, ZPLC_COMM_AZURE_EG_PUB_EVENT_TYPE_OFFSET, "e");
	set_string(eg, ZPLC_COMM_AZURE_EG_PUB_PAYLOAD_OFFSET, "{}");
	spb[0] = 1;
	for (int i = 0; i < 30; i++) {
		scan(ZPLC_COMM_FB_AZURE_EG_PUB, eg);
		scan(ZPLC_COMM_FB_SPB_REBIRTH, spb);
		if (i == 10) {
			poll_result = ZPLC_COMM_HANDLER_DONE;
		}
	}
	zassert_equal(eg_calls, 1, "one event for one trigger, got %d", eg_calls);
	zassert_equal(rebirth_calls, 1, "one rebirth for one trigger, got %d", rebirth_calls);
	zassert_equal(eg[2], 1, "DONE");
	zassert_equal(spb[2], 1, "DONE");
}

ZTEST_SUITE(comm_cloud_fb, NULL, setup, before, NULL, NULL);
