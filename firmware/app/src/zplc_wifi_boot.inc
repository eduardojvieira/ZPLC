/*
 * The Wi-Fi link of the ESP32-S3 profile, kept up by a work item (HIL-010.32, .33).
 *
 * Included by main.c (the application's source list is fixed by firmware/app/CMakeLists.txt, as with
 * zplc_modbus_tcp_client.inc). The decision is zplc_wifi_link_poll() in zplc_wifi_link.h, tested on native_sim with
 * a fake network layer. This file is the glue: the stored credentials, the net_mgmt request and the delayable work
 * item on the system work queue, which runs below the scan coordinator (CONFIG_SYSTEM_WORKQUEUE_PRIORITY) and so
 * never delays a scan. The radio itself is only exercised on a board.
 */

#ifdef CONFIG_WIFI

static zplc_wifi_link_t wifi_link;
static struct k_work_delayable wifi_work;
K_MUTEX_DEFINE(wifi_request_lock);
/* The request is built here, under wifi_request_lock: the system work queue has a small stack. */
static char wifi_request_ssid[64];
static char wifi_request_pass[64];

int zplc_wifi_request_connect(void) {
  struct net_if *iface = net_if_get_default();
  struct wifi_connect_req_params params = {0};
  uint8_t security;
  int rc;

  if (iface == NULL) {
    return -ENODEV;
  }
  k_mutex_lock(&wifi_request_lock, K_FOREVER);
  zplc_config_get_wifi_ssid(wifi_request_ssid, sizeof(wifi_request_ssid));
  zplc_config_get_wifi_pass(wifi_request_pass, sizeof(wifi_request_pass));
  security = zplc_config_get_wifi_security();
  if (wifi_request_ssid[0] == '\0') {
    k_mutex_unlock(&wifi_request_lock);
    return -EINVAL;
  }
  params.ssid = (const uint8_t *)wifi_request_ssid;
  params.ssid_length = (uint8_t)strlen(wifi_request_ssid);
  params.security = (enum wifi_security_type)security;
  if (security != WIFI_SECURITY_TYPE_NONE && wifi_request_pass[0] != '\0') {
    params.psk = (const uint8_t *)wifi_request_pass;
    params.psk_length = (uint8_t)strlen(wifi_request_pass);
  }
  params.channel = WIFI_CHANNEL_ANY;
  params.band = WIFI_FREQ_BAND_UNKNOWN;
  params.mfp = WIFI_MFP_OPTIONAL;
  rc = net_mgmt(NET_REQUEST_WIFI_CONNECT, iface, &params, sizeof(params));
  memset(wifi_request_pass, 0, sizeof(wifi_request_pass)); /* the password stays in the configuration only */
  k_mutex_unlock(&wifi_request_lock);
  return rc == -EALREADY ? 0 : rc;
}

static int wifi_connect_for_work(void *ctx) {
  ARG_UNUSED(ctx);
  return zplc_wifi_request_connect();
}

static void wifi_work_handler(struct k_work *work) {
  char text[64];
  char ip[16];
  zplc_wifi_state_t before = zplc_wifi_link_state(&wifi_link);
  zplc_wifi_state_t after;
  uint32_t next;
  bool configured;
  bool online;

  ARG_UNUSED(work);
  zplc_config_get_wifi_ssid(text, sizeof(text));
  configured = text[0] != '\0';
  online = zplc_hal_net_get_ip(ip, sizeof(ip)) == ZPLC_HAL_OK && ip[0] != '\0';
  next = zplc_wifi_link_poll(&wifi_link, configured, online, wifi_connect_for_work, NULL);
  after = zplc_wifi_link_state(&wifi_link);
  if (after != before) { /* the state only, never the SSID or the password */
    zplc_hal_log("[WIFI] link %s (failures %u, next look in %u ms)\n", zplc_wifi_state_name(after),
                 (unsigned)wifi_link.failures, (unsigned)next);
  }
  (void)k_work_reschedule(&wifi_work, K_MSEC(next));
}

void zplc_wifi_boot_start(void) {
  zplc_wifi_link_init(&wifi_link);
  k_work_init_delayable(&wifi_work, wifi_work_handler);
  (void)k_work_reschedule(&wifi_work, K_NO_WAIT);
}

const char *zplc_wifi_status_name(void) { return zplc_wifi_state_name(zplc_wifi_link_state(&wifi_link)); }

#else /* a build without Wi-Fi: the Pico profile */

int zplc_wifi_request_connect(void) { return -ENOTSUP; }

void zplc_wifi_boot_start(void) {}

const char *zplc_wifi_status_name(void) { return "unsupported"; }

#endif
