/**
 * ZPLC Cloud Communication FB Handler
 *
 * Bridges the cloud blocks of the scan (Azure C2D, DPS, Event Grid; AWS Fleet
 * Provisioning; Sparkplug B Rebirth) to the runtime services in
 * zplc_azure_dps.c, zplc_aws_fleet.c and zplc_mqtt.c.
 *
 * Nothing here waits for a service (COM-003). The two provisioning services
 * wait for a broker for up to 30 seconds, so they run on a worker thread of
 * their own: a handler call takes a slot of zplc_comm_req.h and queues it, and
 * the block polls the slot on every scan until the worker has written the
 * result. The other blocks ask the MQTT client, which has a thread of its own,
 * through zplc_mqtt_fb.h. The handshake is the one of zplc_comm_dispatch.h: a
 * rising EN is one request (COM-004); AZURE_C2D_RECV is a service block that
 * reports the session and pulses VALID for each message.
 *
 * SPDX-License-Identifier: MIT
 */

#include "zplc_comm_cloud_handler.h"

#include "zplc_comm_fb_access.h"
#include "zplc_config.h"
#include "zplc_mqtt_fb.h"
#include <errno.h>
#include <string.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zplc_comm_dispatch.h>
#include <zplc_comm_req.h>
#include <zplc_isa.h>

LOG_MODULE_REGISTER(zplc_comm_cloud, LOG_LEVEL_INF);

/* Bytes the layout table reserves for each STRING member (header, up to 80
 * characters, terminator), from the string layout of the contract. Strings are
 * read and written through zplc_comm_fb_access.h, bounded by this and by the
 * block (COM-001, COM-005). */
#define FB_STRING_BYTES ((uint16_t)(ZPLC_STRING_DATA_OFFSET + ZPLC_STRING_DEFAULT_SIZE + 1))
#define FB_STRING_CHARS ((size_t)ZPLC_STRING_DEFAULT_SIZE)

/* The provisioning services wait for the broker for 30 seconds in each of their steps (DPS_TIMEOUT_MS,
 * AWS_FLEET_TIMEOUT_MS); a request that has not finished in this time is reported TIMEOUT (COM-018). */
#define CLOUD_REQ_TIMEOUT_MS 90000U
#define CLOUD_REQ_MAX 4U
/* The TLS handshake of a provisioning service runs on this thread, as the one of the MQTT client runs on its own. */
#define CLOUD_WORKER_STACK_SIZE 8192

struct cloud_req {
  zplc_comm_req_t head; /* first: the pool of zplc_comm_req.h */
  zplc_comm_fb_kind_t kind;
  char input[FB_STRING_CHARS + 1U];  /* DEVICE_ID or TEMPLATE_NAME, as the block holds it */
  char output[FB_STRING_CHARS + 1U]; /* ASSIGNED_HUB or THING_NAME, when the service finished */
};

static struct cloud_req s_reqs[CLOUD_REQ_MAX];
static struct k_spinlock s_lock;
static k_spinlock_key_t s_key;
static struct k_msgq s_queue;
static struct cloud_req *s_queue_buf[CLOUD_REQ_MAX];
static struct k_thread s_worker_thread;
static K_THREAD_STACK_DEFINE(s_worker_stack, CLOUD_WORKER_STACK_SIZE);

static void req_lock(void *context) {
  ARG_UNUSED(context);
  s_key = k_spin_lock(&s_lock);
}

static void req_unlock(void *context) {
  ARG_UNUSED(context);
  k_spin_unlock(&s_lock, s_key);
}

static const zplc_comm_req_pool_t s_pool = {
    .slots = s_reqs,
    .stride = sizeof(struct cloud_req),
    .count = CLOUD_REQ_MAX,
    .lock = req_lock,
    .unlock = req_unlock,
    .context = NULL,
};

/* ============================================================================
 * The worker: the provisioning services, which wait for a broker
 * ============================================================================
 */

static int cloud_run_request(struct cloud_req *req) {
  int rc;

  req->output[0] = '\0';
  switch (req->kind) {
  case ZPLC_COMM_FB_AZURE_DPS_PROV:
    if (req->input[0] != '\0') {
      zplc_config_set_azure_dps_registration_id(req->input);
    }
    rc = zplc_azure_dps_provision();
    if (rc == 0) {
      /* The service stores the hub it was assigned as the broker. */
      zplc_config_get_mqtt_broker(req->output, sizeof(req->output));
    }
    return rc;
  case ZPLC_COMM_FB_AWS_FLEET_PROV:
    if (req->input[0] != '\0') {
      zplc_config_set_aws_fleet_template_name(req->input);
    }
    rc = zplc_aws_fleet_provision();
    if (rc == 0) {
      /* The service stores the thing it registered as the client id. */
      zplc_config_get_mqtt_client_id(req->output, sizeof(req->output));
    }
    return rc;
  default:
    return -ENOTSUP;
  }
}

/* The worker's whole turn for one queued request. */
static void cloud_process(struct cloud_req *req) {
  int rc;

  if (!zplc_comm_req_begin(&s_pool, &req->head)) {
    /* Reset while it waited in the queue: the service is not called. */
    return;
  }
  rc = cloud_run_request(req);
  zplc_comm_req_finish(&s_pool, &req->head, rc == 0 ? ZPLC_COMM_HANDLER_DONE : zplc_comm_fail_from_errno(rc));
}

static void cloud_worker(void *p1, void *p2, void *p3) {
  ARG_UNUSED(p1);
  ARG_UNUSED(p2);
  ARG_UNUSED(p3);

  while (1) {
    struct cloud_req *req = NULL;

    if (k_msgq_get(&s_queue, (void *)&req, K_FOREVER) == 0 && req != NULL) {
      cloud_process(req);
    }
  }
}

/* ============================================================================
 * The blocks, in the scan
 * ============================================================================
 */

/* START: one request, for the provisioning blocks. */
static int provision_start(zplc_comm_fb_kind_t kind, const uint8_t *fb_mem, uint16_t fb_len, uint16_t input_offset) {
  struct cloud_req *req;

  req = (struct cloud_req *)zplc_comm_req_claim(&s_pool, fb_mem, k_uptime_get_32());
  if (req == NULL) {
    return ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_QUEUE_FULL);
  }
  req->kind = kind;
  (void)zplc_fb_string_copy(req->input, sizeof(req->input), fb_mem, fb_len, input_offset, FB_STRING_BYTES);
  req->output[0] = '\0';
  zplc_comm_req_submit(&s_pool, &req->head);
  if (k_msgq_put(&s_queue, (const void *)&req, K_NO_WAIT) != 0) {
    zplc_comm_req_cancel(&s_pool, &req->head);
    return ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_QUEUE_FULL);
  }
  return ZPLC_COMM_HANDLER_PENDING;
}

/* POLL: the result of the request of this block; the output string of a finished one goes to the block. */
static int provision_poll(uint8_t *fb_mem, uint16_t fb_len, uint16_t output_offset) {
  zplc_comm_req_t *slot = NULL;
  const int result = zplc_comm_req_peek(&s_pool, fb_mem, k_uptime_get_32(), CLOUD_REQ_TIMEOUT_MS, &slot);

  if (result == ZPLC_COMM_HANDLER_DONE && slot != NULL) {
    const struct cloud_req *req = (const struct cloud_req *)slot;

    (void)zplc_fb_string_set(fb_mem, fb_len, output_offset, FB_STRING_BYTES, (const uint8_t *)req->output, strlen(req->output));
    zplc_comm_req_release(&s_pool, slot);
  }
  return result;
}

static int event_grid_start(uint8_t *fb_mem, uint16_t fb_len) {
  char topic[FB_STRING_CHARS + 1U];
  char event_type[FB_STRING_CHARS + 1U];
  char payload[FB_STRING_CHARS + 1U];

  (void)zplc_fb_string_copy(topic, sizeof(topic), fb_mem, fb_len, ZPLC_COMM_AZURE_EG_PUB_TOPIC_OFFSET, FB_STRING_BYTES);
  (void)zplc_fb_string_copy(event_type, sizeof(event_type), fb_mem, fb_len, ZPLC_COMM_AZURE_EG_PUB_EVENT_TYPE_OFFSET, FB_STRING_BYTES);
  (void)zplc_fb_string_copy(payload, sizeof(payload), fb_mem, fb_len, ZPLC_COMM_AZURE_EG_PUB_PAYLOAD_OFFSET, FB_STRING_BYTES);
  /* An empty TOPIC or EVENT_TYPE is the configured default of the client. */
  return zplc_mqtt_fb_event_grid(fb_mem, event_type, topic, payload);
}

/* AZURE_C2D_RECV: the session, and a pulse of VALID for each cloud-to-device message. */
static int c2d_poll(uint8_t *fb_mem, uint16_t fb_len) {
  uint8_t message[FB_STRING_CHARS + 1U];
  const int result = zplc_mqtt_fb_subscribe(fb_mem, NULL, 0U);
  const int length = zplc_mqtt_fb_take_message(fb_mem, message, FB_STRING_CHARS);

  fb_mem[ZPLC_COMM_AZURE_C2D_RECV_VALID_OFFSET] = 0U;
  if (length >= 0) {
    (void)zplc_fb_string_set(fb_mem, fb_len, ZPLC_COMM_AZURE_C2D_RECV_PAYLOAD_OFFSET, FB_STRING_BYTES, message, (size_t)length);
    fb_mem[ZPLC_COMM_AZURE_C2D_RECV_VALID_OFFSET] = 1U;
  }
  return result;
}

/* ============================================================================
 * Main dispatch handler
 * ============================================================================
 */

static int zplc_comm_cloud_handler(zplc_comm_fb_kind_t kind, uint8_t *fb_mem, uint16_t fb_len, zplc_comm_call_t call) {
  /* A block of this kind is at least its table size; every offset used below
   * is inside it (COM-001). */
  if (fb_mem == NULL || zplc_comm_fb_size((uint32_t)kind) == 0U || fb_len < zplc_comm_fb_size((uint32_t)kind)) {
    return -EINVAL;
  }

  if (call == ZPLC_COMM_CALL_RESET) {
    switch (kind) {
    case ZPLC_COMM_FB_AZURE_DPS_PROV:
      zplc_comm_req_abort(&s_pool, fb_mem);
      (void)zplc_fb_string_set(fb_mem, fb_len, ZPLC_COMM_AZURE_DPS_PROV_ASSIGNED_HUB_OFFSET, FB_STRING_BYTES, (const uint8_t *)"", 0U);
      break;
    case ZPLC_COMM_FB_AWS_FLEET_PROV:
      zplc_comm_req_abort(&s_pool, fb_mem);
      (void)zplc_fb_string_set(fb_mem, fb_len, ZPLC_COMM_AWS_FLEET_PROV_THING_NAME_OFFSET, FB_STRING_BYTES, (const uint8_t *)"", 0U);
      break;
    case ZPLC_COMM_FB_AZURE_EG_PUB:
    case ZPLC_COMM_FB_SPB_REBIRTH:
      zplc_mqtt_fb_abort(fb_mem);
      break;
    case ZPLC_COMM_FB_AZURE_C2D_RECV:
      zplc_mqtt_fb_unsubscribe(fb_mem);
      fb_mem[ZPLC_COMM_AZURE_C2D_RECV_VALID_OFFSET] = 0U;
      (void)zplc_fb_string_set(fb_mem, fb_len, ZPLC_COMM_AZURE_C2D_RECV_PAYLOAD_OFFSET, FB_STRING_BYTES, (const uint8_t *)"", 0U);
      break;
    default:
      break;
    }
    return ZPLC_COMM_HANDLER_DONE;
  }

  switch (kind) {
  case ZPLC_COMM_FB_AZURE_C2D_RECV:
    return c2d_poll(fb_mem, fb_len);
  case ZPLC_COMM_FB_AZURE_DPS_PROV:
    return call == ZPLC_COMM_CALL_START ? provision_start(kind, fb_mem, fb_len, ZPLC_COMM_AZURE_DPS_PROV_DEVICE_ID_OFFSET)
                                        : provision_poll(fb_mem, fb_len, ZPLC_COMM_AZURE_DPS_PROV_ASSIGNED_HUB_OFFSET);
  case ZPLC_COMM_FB_AWS_FLEET_PROV:
    return call == ZPLC_COMM_CALL_START ? provision_start(kind, fb_mem, fb_len, ZPLC_COMM_AWS_FLEET_PROV_TEMPLATE_NAME_OFFSET)
                                        : provision_poll(fb_mem, fb_len, ZPLC_COMM_AWS_FLEET_PROV_THING_NAME_OFFSET);
  case ZPLC_COMM_FB_AZURE_EG_PUB:
    return call == ZPLC_COMM_CALL_START ? event_grid_start(fb_mem, fb_len) : zplc_mqtt_fb_poll(fb_mem);
  case ZPLC_COMM_FB_SPB_REBIRTH:
    return call == ZPLC_COMM_CALL_START ? zplc_mqtt_fb_rebirth(fb_mem) : zplc_mqtt_fb_poll(fb_mem);
  default:
    return -EINVAL;
  }
}

/* ============================================================================
 * Public API
 * ============================================================================
 */

int zplc_comm_cloud_handler_init(void) {
  int rc;

  k_msgq_init(&s_queue, (char *)s_queue_buf, sizeof(void *), CLOUD_REQ_MAX);
  k_thread_create(&s_worker_thread, s_worker_stack, K_THREAD_STACK_SIZEOF(s_worker_stack), cloud_worker, NULL, NULL, NULL,
                  K_PRIO_PREEMPT(ZPLC_COMM_THREAD_PRIORITY), 0, K_NO_WAIT);
  k_thread_name_set(&s_worker_thread, "cloud_fb_worker");

  rc = zplc_comm_register_handler(ZPLC_COMM_FB_AZURE_C2D_RECV, zplc_comm_cloud_handler);
  if (rc)
    return rc;

  rc = zplc_comm_register_handler(ZPLC_COMM_FB_AZURE_DPS_PROV, zplc_comm_cloud_handler);
  if (rc)
    return rc;

  rc = zplc_comm_register_handler(ZPLC_COMM_FB_AZURE_EG_PUB, zplc_comm_cloud_handler);
  if (rc)
    return rc;

  rc = zplc_comm_register_handler(ZPLC_COMM_FB_AWS_FLEET_PROV, zplc_comm_cloud_handler);
  if (rc)
    return rc;

  rc = zplc_comm_register_handler(ZPLC_COMM_FB_SPB_REBIRTH, zplc_comm_cloud_handler);
  if (rc)
    return rc;

  LOG_INF("Cloud VM handlers registered (Azure C2D/DPS/EG, AWS, SPB)");
  return 0;
}
