/*
 * COM-006: the MQTT client of the controller, and the blocks that use it, against a broker written for the test.
 *
 * zplc_mqtt.c and the handlers of the communication blocks are the files a board runs. The broker is a thread of
 * this test on the loopback interface of the network stack: it answers a CONNECT, a SUBSCRIBE and a PUBLISH, and
 * it can be made to stay silent, to refuse, to drop the connection and to deliver a message. A double proves the
 * behaviour of the blocks and of the protocol; it does not prove that a real broker accepts the exchange.
 */
#include <errno.h>
#include <string.h>

#include <zephyr/kernel.h>
#include <zephyr/net/socket.h>
#include <zephyr/ztest.h>

#include <zplc_comm_dispatch.h>

#include "zplc_comm_fb_access.h"
#include "zplc_comm_mqtt_handler.h"
#include "zplc_config.h"
#include "zplc_mqtt_fb.h"

int zplc_mqtt_init(void);
int zplc_core_init(void);
int zplc_exchange_init(const void *hooks);
int zplc_comm_cloud_handler_init(void);

/* ---- what the client links against and the real core does not give ---- */
int zplc_azure_sas_generate(const char *hub, const char *device, const char *key, uint32_t expiry_s, char *out,
			    size_t out_len)
{
	ARG_UNUSED(hub); ARG_UNUSED(device); ARG_UNUSED(key); ARG_UNUSED(expiry_s);
	strncpy(out, "SharedAccessSignature test", out_len);
	return 0;
}
int64_t zplc_time_get_unix_ms(void) { return 1700000000000LL; }

#define PORT 18830

/* ---- the broker double ---- */
enum bmode { B_GOOD, B_NO_CONNACK, B_REFUSE };
static volatile enum bmode bmode;
static volatile bool drop_now;
static volatile int connects;
static volatile int publishes;
static volatile int subscribes;
static char last_topic[128];
static char last_payload[128];
static char last_filter[128];
static volatile int inject_pending;
static char inject_topic[128];
static char inject_payload[64];
static struct k_thread broker_thread;
static K_THREAD_STACK_DEFINE(broker_stack, 6144);

static void send_all(int conn, const uint8_t *b, size_t n) { (void)zsock_send(conn, b, n, 0); }

static void handle(int conn, const uint8_t *p, size_t len, bool *v5)
{
	const uint8_t type = p[0] >> 4;
	size_t i = 1U;
	uint32_t rl = 0U, mult = 1U;

	do {
		rl += (p[i] & 0x7FU) * mult;
		mult *= 128U;
	} while (p[i++] & 0x80U);
	const uint8_t *body = p + i;

	ARG_UNUSED(len);
	switch (type) {
	case 1: { /* CONNECT: protocol name length 2 + 4, then the level */
		uint8_t ack[5] = {0x20, 0x02, 0, 0, 0};
		size_t n = 4U;

		*v5 = body[6] == 5U;
		connects++;
		if (bmode == B_NO_CONNACK) {
			return;
		}
		if (bmode == B_REFUSE) {
			ack[3] = *v5 ? 0x87 : 0x05;
		}
		if (*v5) {
			ack[1] = 3U;
			n = 5U;
		}
		send_all(conn, ack, n);
		break;
	}
	case 3: { /* PUBLISH */
		const uint8_t qos = (p[0] >> 1) & 3U;
		uint16_t tl = (uint16_t)((body[0] << 8) | body[1]);
		size_t o = 2U + tl;
		uint16_t id = 0U;

		memset(last_topic, 0, sizeof(last_topic));
		memcpy(last_topic, body + 2, tl < sizeof(last_topic) - 1U ? tl : sizeof(last_topic) - 1U);
		if (qos > 0U) {
			id = (uint16_t)((body[o] << 8) | body[o + 1]);
			o += 2U;
		}
		if (*v5) {
			o += 1U + body[o];
		}
		memset(last_payload, 0, sizeof(last_payload));
		if (rl >= o) {
			size_t pl = rl - o;

			memcpy(last_payload, body + o, pl < sizeof(last_payload) - 1U ? pl : sizeof(last_payload) - 1U);
		}
		publishes++;
		if (qos == 1U) {
			uint8_t ack[4] = {0x40, 0x02, (uint8_t)(id >> 8), (uint8_t)id};

			send_all(conn, ack, 4U);
		}
		break;
	}
	case 8: { /* SUBSCRIBE */
		uint16_t id = (uint16_t)((body[0] << 8) | body[1]);
		size_t o = 2U + (*v5 ? 1U + body[2] : 0U);
		uint16_t fl = (uint16_t)((body[o] << 8) | body[o + 1]);
		uint8_t ack[6] = {0x90, 3, (uint8_t)(id >> 8), (uint8_t)id, 0, 0};
		size_t n = 5U;

		memset(last_filter, 0, sizeof(last_filter));
		memcpy(last_filter, body + o + 2, fl < sizeof(last_filter) - 1U ? fl : sizeof(last_filter) - 1U);
		subscribes++;
		if (*v5) {
			ack[1] = 4U;
			ack[4] = 0U; /* no properties */
			ack[5] = 0U; /* granted QoS 0 */
			n = 6U;
		}
		send_all(conn, ack, n);
		break;
	}
	case 12: {
		const uint8_t pong[2] = {0xD0, 0};

		send_all(conn, pong, 2U);
		break;
	}
	default:
		break;
	}
}

static void deliver(int conn, bool v5)
{
	uint8_t out[300];
	size_t tl = strlen(inject_topic), pl = strlen(inject_payload), o = 0U;
	size_t rl = 2U + tl + (v5 ? 1U : 0U) + pl;

	out[o++] = 0x30;
	out[o++] = (uint8_t)rl;
	out[o++] = (uint8_t)(tl >> 8);
	out[o++] = (uint8_t)tl;
	memcpy(out + o, inject_topic, tl);
	o += tl;
	if (v5) {
		out[o++] = 0U;
	}
	memcpy(out + o, inject_payload, pl);
	o += pl;
	send_all(conn, out, o);
}

static void broker(void *a, void *b, void *c)
{
	struct sockaddr_in addr = {0};
	int listener, one = 1;

	ARG_UNUSED(a); ARG_UNUSED(b); ARG_UNUSED(c);
	listener = zsock_socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
	zsock_setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, &one, sizeof(one));
	addr.sin_family = AF_INET;
	addr.sin_port = htons(PORT);
	zsock_inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);
	if (zsock_bind(listener, (struct sockaddr *)&addr, sizeof(addr)) < 0 || zsock_listen(listener, 2) < 0) {
		return;
	}
	for (;;) {
		struct zsock_pollfd lf = {.fd = listener, .events = ZSOCK_POLLIN};
		int conn;
		bool v5 = false;

		if (zsock_poll(&lf, 1, 50) <= 0) {
			continue;
		}
		conn = zsock_accept(listener, NULL, NULL);
		if (conn < 0) {
			continue;
		}
		drop_now = false;
		while (!drop_now) {
			struct zsock_pollfd cf = {.fd = conn, .events = ZSOCK_POLLIN};
			uint8_t buf[600];
			int n;

			if (inject_pending) {
				deliver(conn, v5);
				inject_pending = 0;
			}
			if (zsock_poll(&cf, 1, 20) <= 0) {
				continue;
			}
			n = (int)zsock_recv(conn, buf, sizeof(buf), 0);
			if (n <= 0) {
				break;
			}
			for (size_t at = 0U; at + 2U <= (size_t)n;) { /* several packets may arrive in one read */
				size_t j = at + 1U, total;
				uint32_t rem = 0U, m = 1U;

				do {
					rem += (buf[j] & 0x7FU) * m;
					m *= 128U;
				} while (buf[j++] & 0x80U);
				total = (j - at) + rem;
				if (at + total > (size_t)n) {
					break;
				}
				handle(conn, buf + at, total, &v5);
				at += total;
			}
		}
		zsock_close(conn);
	}
}

/* ---- blocks ---- */
#define STRING_ROOM ((uint16_t)(ZPLC_STRING_DATA_OFFSET + ZPLC_STRING_DEFAULT_SIZE + 1))
#define BUSY(m) ((m)[1])
#define DONE(m) ((m)[2])
#define ERR(m) ((m)[3])

static uint8_t con[ZPLC_COMM_MQTT_CONNECT_SIZE];
static uint8_t pub[ZPLC_COMM_MQTT_PUBLISH_SIZE];
static uint8_t sub[ZPLC_COMM_MQTT_SUBSCRIBE_SIZE];

static void scan(zplc_comm_fb_kind_t kind, uint8_t *b)
{
	zassert_ok(zplc_comm_fb_exec(kind, b, zplc_comm_fb_size(kind)), "dispatch");
}

static uint32_t status_of(const uint8_t *b)
{
	return (uint32_t)b[4] | ((uint32_t)b[5] << 8) | ((uint32_t)b[6] << 16) | ((uint32_t)b[7] << 24);
}

static void set_text(zplc_comm_fb_kind_t kind, uint8_t *b, unsigned off, const char *t)
{
	zassert_equal(zplc_fb_string_set(b, zplc_comm_fb_size(kind), (uint16_t)off, STRING_ROOM,
					 (const uint8_t *)t, strlen(t)), strlen(t), "string");
}

/* Scan until `cond` holds, at most `ms`. */
#define WAIT(kind, b, cond, ms)                                                                                     \
	({                                                                                                          \
		int64_t end_ = k_uptime_get() + (ms);                                                               \
		bool ok_ = false;                                                                                   \
		for (;;) {                                                                                          \
			scan(kind, b);                                                                              \
			if (cond) {                                                                                 \
				ok_ = true;                                                                         \
				break;                                                                              \
			}                                                                                           \
			if (k_uptime_get() > end_) {                                                                \
				break;                                                                              \
			}                                                                                           \
			k_msleep(10);                                                                               \
		}                                                                                                   \
		ok_;                                                                                                \
	})

static void *setup(void)
{
	k_thread_create(&broker_thread, broker_stack, K_THREAD_STACK_SIZEOF(broker_stack), broker, NULL, NULL, NULL,
			K_PRIO_PREEMPT(7), 0, K_NO_WAIT);
	k_msleep(100);
	zplc_config_set_mqtt_broker("127.0.0.1");
	zplc_config_set_mqtt_port(PORT);
	zplc_config_set_mqtt_client_id("dev1");
	zplc_config_set_mqtt_profile(ZPLC_MQTT_PROFILE_GENERIC_BROKER);
	zplc_config_set_mqtt_protocol(ZPLC_MQTT_PROTOCOL_3_1_1);
	zplc_config_set_mqtt_security(ZPLC_MQTT_SECURITY_NONE);
	zplc_config_set_mqtt_transport(ZPLC_MQTT_TRANSPORT_TCP);
	zplc_config_set_mqtt_keepalive_sec(30);
	zplc_config_set_mqtt_publish_interval_ms(600000);
	zplc_config_set_mqtt_lwt_enabled(false);
	zplc_config_set_mqtt_clean_session(true);
	zplc_config_set_mqtt_enabled(true);
	zassert_ok(zplc_core_init(), "core");
	zassert_ok(zplc_exchange_init(NULL), "exchange");
	zassert_ok(zplc_comm_mqtt_handler_init(), "mqtt handler");
	zassert_ok(zplc_comm_cloud_handler_init(), "cloud handler");
	zassert_ok(zplc_mqtt_init(), "client");
	return NULL;
}

static void before(void *f)
{
	ARG_UNUSED(f);
	memset(con, 0, sizeof(con));
	memset(pub, 0, sizeof(pub));
	memset(sub, 0, sizeof(sub));
	zplc_comm_fb_reset(ZPLC_COMM_FB_MQTT_CONNECT, con, sizeof(con));
	zplc_comm_fb_reset(ZPLC_COMM_FB_MQTT_PUBLISH, pub, sizeof(pub));
	zplc_comm_fb_reset(ZPLC_COMM_FB_MQTT_SUBSCRIBE, sub, sizeof(sub));
}

/* The session is up with the broker in its good mode, whatever an earlier test did. */
static void session_up(void)
{
	bmode = B_GOOD;
	zplc_mqtt_request_backoff_reset();
	con[0] = 1U;
	zassert_true(WAIT(ZPLC_COMM_FB_MQTT_CONNECT, con, DONE(con) == 1U, 30000), "the session comes up");
	con[0] = 0U;
	scan(ZPLC_COMM_FB_MQTT_CONNECT, con);
}

ZTEST(mqtt_broker_double, test_a_connect_reports_the_session)
{
	int before_connects = connects;

	session_up();
	zassert_true(connects >= 1 && connects >= before_connects, "the broker saw the client connect");
}

ZTEST(mqtt_broker_double, test_b_a_message_is_published_once_per_request)
{
	int n;

	session_up();
	set_text(ZPLC_COMM_FB_MQTT_PUBLISH, pub, ZPLC_COMM_MQTT_PUBLISH_TOPIC_OFFSET, "plant/a");
	set_text(ZPLC_COMM_FB_MQTT_PUBLISH, pub, ZPLC_COMM_MQTT_PUBLISH_PAYLOAD_OFFSET, "hello");
	n = publishes;
	pub[0] = 1U;
	zassert_true(WAIT(ZPLC_COMM_FB_MQTT_PUBLISH, pub, DONE(pub) == 1U, 5000), "done");
	k_msleep(300);
	for (int i = 0; i < 20; i++) {
		scan(ZPLC_COMM_FB_MQTT_PUBLISH, pub);
		k_msleep(5);
	}
	zassert_equal(publishes, n + 1, "one message on the wire for a held enable");
	zassert_str_equal(last_topic, "plant/a", "topic");
	zassert_str_equal(last_payload, "hello", "payload");
	pub[0] = 0U;
	scan(ZPLC_COMM_FB_MQTT_PUBLISH, pub);
	pub[0] = 1U;
	zassert_true(WAIT(ZPLC_COMM_FB_MQTT_PUBLISH, pub, DONE(pub) == 1U, 5000), "second request");
	k_msleep(300);
	zassert_equal(publishes, n + 2, "a new rising edge is one more message");
}

ZTEST(mqtt_broker_double, test_c_a_subscription_delivers_a_message_for_one_scan)
{
	session_up();
	set_text(ZPLC_COMM_FB_MQTT_SUBSCRIBE, sub, ZPLC_COMM_MQTT_SUBSCRIBE_TOPIC_OFFSET, "plant/in");
	sub[0] = 1U;
	zassert_true(WAIT(ZPLC_COMM_FB_MQTT_SUBSCRIBE, sub, subscribes > 0 && DONE(sub) == 1U, 5000), "subscribed");
	zassert_str_equal(last_filter, "plant/in", "the filter reached the broker");
	strcpy(inject_topic, "plant/in");
	strcpy(inject_payload, "go");
	inject_pending = 1;
	zassert_true(WAIT(ZPLC_COMM_FB_MQTT_SUBSCRIBE, sub, sub[ZPLC_COMM_MQTT_SUBSCRIBE_VALID_OFFSET] == 1U, 5000),
		     "the message is valid");
	scan(ZPLC_COMM_FB_MQTT_SUBSCRIBE, sub);
	zassert_equal(sub[ZPLC_COMM_MQTT_SUBSCRIBE_VALID_OFFSET], 0U, "valid for one scan only");
}

ZTEST(mqtt_broker_double, test_d_reset_while_busy_sends_nothing)
{
	int n;

	session_up();
	set_text(ZPLC_COMM_FB_MQTT_PUBLISH, pub, ZPLC_COMM_MQTT_PUBLISH_TOPIC_OFFSET, "plant/never");
	n = publishes;
	k_sched_lock(); /* the client thread cannot take the request between the scan and the reset */
	pub[0] = 1U;
	scan(ZPLC_COMM_FB_MQTT_PUBLISH, pub);
	zassert_equal(BUSY(pub), 1U, "busy");
	zassert_ok(zplc_comm_fb_reset(ZPLC_COMM_FB_MQTT_PUBLISH, pub, sizeof(pub)), "reset");
	k_sched_unlock();
	pub[0] = 0U;
	k_msleep(400);
	scan(ZPLC_COMM_FB_MQTT_PUBLISH, pub);
	zassert_equal(publishes, n, "nothing was sent");
	zassert_equal(DONE(pub), 0U, "no late result");
}

ZTEST(mqtt_broker_double, test_e_a_lost_session_is_an_error_and_a_publish_is_refused)
{
	session_up();
	con[0] = 1U;
	bmode = B_NO_CONNACK; /* the reconnection finds a broker that does not answer */
	drop_now = true;
	zassert_true(WAIT(ZPLC_COMM_FB_MQTT_CONNECT, con, ERR(con) == 1U || BUSY(con) == 1U, 5000), "session leaves up");
	zassert_true(WAIT(ZPLC_COMM_FB_MQTT_CONNECT, con, ERR(con) == 1U && DONE(con) == 0U, 15000),
		     "no CONNACK is an error, not success");
	zassert_not_equal(status_of(con), ZPLC_COMM_OK, "with a status code");
	set_text(ZPLC_COMM_FB_MQTT_PUBLISH, pub, ZPLC_COMM_MQTT_PUBLISH_TOPIC_OFFSET, "plant/a");
	pub[0] = 1U;
	zassert_true(WAIT(ZPLC_COMM_FB_MQTT_PUBLISH, pub, ERR(pub) == 1U, 2000), "a publish with no session fails");
	zassert_equal(status_of(pub), ZPLC_COMM_NOT_CONNECTED, "not connected");
}

ZTEST(mqtt_broker_double, test_f_a_refused_connection_is_an_error_and_the_client_recovers)
{
	con[0] = 1U;
	bmode = B_REFUSE;
	zplc_mqtt_request_backoff_reset();
	drop_now = true;
	zassert_true(WAIT(ZPLC_COMM_FB_MQTT_CONNECT, con, ERR(con) == 1U && DONE(con) == 0U, 30000), "refused is an error");
	bmode = B_GOOD;
	zplc_mqtt_request_backoff_reset();
	zassert_true(WAIT(ZPLC_COMM_FB_MQTT_CONNECT, con, DONE(con) == 1U, 40000), "the session comes back");
}

/* ---- the cloud blocks that ride on the MQTT client: each needs the profile of its service ---- */
static uint8_t c2d[ZPLC_COMM_AZURE_C2D_RECV_SIZE];
static uint8_t eg[ZPLC_COMM_AZURE_EG_PUB_SIZE];
static uint8_t spb[ZPLC_COMM_SPB_REBIRTH_SIZE];

/* Reconfigure the client for `profile` and make it reconnect to the broker in its good mode. */
static void reconnect_as(zplc_mqtt_profile_t profile, zplc_mqtt_protocol_t protocol)
{
	const int before_connects = connects;

	bmode = B_GOOD;
	zplc_config_set_mqtt_profile(profile);
	zplc_config_set_mqtt_protocol(protocol);
	zplc_mqtt_request_backoff_reset();
	drop_now = true;
	zassert_true(WAIT(ZPLC_COMM_FB_MQTT_CONNECT, con,
			  connects > before_connects && zplc_mqtt_fb_session(NULL) == ZPLC_MQTT_FB_UP, 30000),
		     "the client reconnects with the new profile");
}

ZTEST(mqtt_broker_double, test_g_a_cloud_to_device_message_arrives_and_other_profiles_say_unavailable)
{
	memset(c2d, 0, sizeof(c2d));
	reconnect_as(ZPLC_MQTT_PROFILE_GENERIC_BROKER, ZPLC_MQTT_PROTOCOL_3_1_1);
	c2d[0] = 1U;
	scan(ZPLC_COMM_FB_AZURE_C2D_RECV, c2d);
	zassert_equal(ERR(c2d), 1U, "a profile with no cloud-to-device channel is an error");
	zassert_equal(status_of(c2d), ZPLC_COMM_UNAVAILABLE, "unavailable");
	zassert_ok(zplc_comm_fb_reset(ZPLC_COMM_FB_AZURE_C2D_RECV, c2d, sizeof(c2d)), "reset");

	zplc_config_set_azure_c2d_enabled(true);
	reconnect_as(ZPLC_MQTT_PROFILE_AZURE_IOT_HUB, ZPLC_MQTT_PROTOCOL_3_1_1);
	c2d[0] = 1U;
	zassert_true(WAIT(ZPLC_COMM_FB_AZURE_C2D_RECV, c2d, DONE(c2d) == 1U, 5000), "the channel is up");
	strcpy(inject_topic, "devices/dev1/messages/devicebound/%24.to=%2Fdevices%2Fdev1");
	strcpy(inject_payload, "start-lot-7");
	inject_pending = 1;
	zassert_true(WAIT(ZPLC_COMM_FB_AZURE_C2D_RECV, c2d, c2d[ZPLC_COMM_AZURE_C2D_RECV_VALID_OFFSET] == 1U, 5000),
		     "the message is valid");
	zassert_equal(c2d[ZPLC_COMM_AZURE_C2D_RECV_PAYLOAD_OFFSET + ZPLC_FB_STR_DATA], 's', "its text");
	zassert_ok(zplc_comm_fb_reset(ZPLC_COMM_FB_AZURE_C2D_RECV, c2d, sizeof(c2d)), "reset releases the subscription");
	zassert_equal(c2d[ZPLC_COMM_AZURE_C2D_RECV_VALID_OFFSET], 0U, "and clears the message");
}

ZTEST(mqtt_broker_double, test_h_an_event_grid_publish_is_one_message_and_a_wrong_profile_is_unavailable)
{
	int n;

	memset(eg, 0, sizeof(eg));
	reconnect_as(ZPLC_MQTT_PROFILE_GENERIC_BROKER, ZPLC_MQTT_PROTOCOL_3_1_1);
	set_text(ZPLC_COMM_FB_AZURE_EG_PUB, eg, ZPLC_COMM_AZURE_EG_PUB_TOPIC_OFFSET, "eg/topic");
	set_text(ZPLC_COMM_FB_AZURE_EG_PUB, eg, ZPLC_COMM_AZURE_EG_PUB_EVENT_TYPE_OFFSET, "plant.lot.done");
	set_text(ZPLC_COMM_FB_AZURE_EG_PUB, eg, ZPLC_COMM_AZURE_EG_PUB_PAYLOAD_OFFSET, "{\"n\":1}");
	eg[0] = 1U;
	scan(ZPLC_COMM_FB_AZURE_EG_PUB, eg);
	zassert_equal(ERR(eg), 1U, "wrong profile is an error");
	zassert_equal(status_of(eg), ZPLC_COMM_UNAVAILABLE, "unavailable");
	zassert_ok(zplc_comm_fb_reset(ZPLC_COMM_FB_AZURE_EG_PUB, eg, sizeof(eg)), "reset");

	zplc_config_set_azure_event_grid_source("/plant/a");
	reconnect_as(ZPLC_MQTT_PROFILE_AZURE_EVENT_GRID, ZPLC_MQTT_PROTOCOL_5_0);
	n = publishes;
	/* reset while busy: the request the client has not taken is let go of */
	k_sched_lock();
	eg[0] = 1U;
	scan(ZPLC_COMM_FB_AZURE_EG_PUB, eg);
	zassert_equal(BUSY(eg), 1U, "busy");
	zassert_ok(zplc_comm_fb_reset(ZPLC_COMM_FB_AZURE_EG_PUB, eg, sizeof(eg)), "reset");
	k_sched_unlock();
	k_msleep(300);
	zassert_equal(publishes, n, "nothing sent after the reset");
	/* success: one message */
	memset(eg + 1, 0, 7);
	eg[0] = 1U;
	zassert_true(WAIT(ZPLC_COMM_FB_AZURE_EG_PUB, eg, DONE(eg) == 1U, 5000), "done");
	k_msleep(300);
	zassert_equal(publishes, n + 1, "one message per request");
	zassert_str_equal(last_topic, "eg/topic", "topic");
	zassert_not_null(strstr(last_payload, "plant.lot.done"), "the event type is in the cloud event");
	/* error: the session is down */
	bmode = B_NO_CONNACK;
	drop_now = true;
	zassert_true(WAIT(ZPLC_COMM_FB_MQTT_CONNECT, con, zplc_mqtt_fb_session(NULL) != ZPLC_MQTT_FB_UP, 5000), "down");
	eg[0] = 0U;
	scan(ZPLC_COMM_FB_AZURE_EG_PUB, eg);
	eg[0] = 1U;
	zassert_true(WAIT(ZPLC_COMM_FB_AZURE_EG_PUB, eg, ERR(eg) == 1U, 2000), "no session is an error");
	zassert_equal(status_of(eg), ZPLC_COMM_NOT_CONNECTED, "not connected");
}

ZTEST(mqtt_broker_double, test_i_a_rebirth_publishes_the_birth_certificate_once)
{
	int n;

	memset(spb, 0, sizeof(spb));
	reconnect_as(ZPLC_MQTT_PROFILE_GENERIC_BROKER, ZPLC_MQTT_PROTOCOL_3_1_1);
	spb[0] = 1U;
	scan(ZPLC_COMM_FB_SPB_REBIRTH, spb);
	zassert_equal(ERR(spb), 1U, "no Sparkplug profile is an error");
	zassert_equal(status_of(spb), ZPLC_COMM_UNAVAILABLE, "unavailable");
	zassert_ok(zplc_comm_fb_reset(ZPLC_COMM_FB_SPB_REBIRTH, spb, sizeof(spb)), "reset");

	zplc_config_set_mqtt_group_id("G");
	reconnect_as(ZPLC_MQTT_PROFILE_SPARKPLUG_B, ZPLC_MQTT_PROTOCOL_3_1_1);
	k_msleep(300);
	n = publishes;
	k_sched_lock();
	spb[0] = 1U;
	scan(ZPLC_COMM_FB_SPB_REBIRTH, spb);
	zassert_ok(zplc_comm_fb_reset(ZPLC_COMM_FB_SPB_REBIRTH, spb, sizeof(spb)), "reset while busy");
	k_sched_unlock();
	k_msleep(300);
	zassert_equal(publishes, n, "a reset request sends nothing");
	spb[0] = 0U;
	scan(ZPLC_COMM_FB_SPB_REBIRTH, spb);
	spb[0] = 1U;
	zassert_true(WAIT(ZPLC_COMM_FB_SPB_REBIRTH, spb, DONE(spb) == 1U, 5000), "done");
	k_msleep(300);
	zassert_equal(publishes, n + 1, "one NBIRTH per request");
	zassert_str_equal(last_topic, "spBv1.0/G/NBIRTH/dev1", "the birth topic");
	bmode = B_NO_CONNACK;
	drop_now = true;
	zassert_true(WAIT(ZPLC_COMM_FB_MQTT_CONNECT, con, zplc_mqtt_fb_session(NULL) != ZPLC_MQTT_FB_UP, 5000), "down");
	spb[0] = 0U;
	scan(ZPLC_COMM_FB_SPB_REBIRTH, spb);
	spb[0] = 1U;
	zassert_true(WAIT(ZPLC_COMM_FB_SPB_REBIRTH, spb, ERR(spb) == 1U, 2000), "no session is an error");
	zassert_equal(status_of(spb), ZPLC_COMM_NOT_CONNECTED, "not connected");
}

ZTEST_SUITE(mqtt_broker_double, NULL, setup, before, NULL, NULL);
