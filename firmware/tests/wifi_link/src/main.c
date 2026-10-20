/*
 * HIL-010.32, .33 (COM-012): the Wi-Fi link the firmware keeps up by itself.
 *
 * zplc_wifi_link_poll() is the decision the background work item makes each time it runs: connect when credentials
 * are configured and there is no address, wait for the association, back off after a failure, and start again when
 * the link drops. These cases drive it with a fake network layer; the radio itself is silicon and is not run here.
 */
#include <errno.h>

#include <zephyr/ztest.h>

#include "zplc_wifi_link.h"

struct fake_net {
  int calls;
  int result;
};

static int fake_connect(void *ctx) {
  struct fake_net *net = ctx;

  net->calls++;
  return net->result;
}

static zplc_wifi_link_t link_state;
static struct fake_net net;

static void before(void *fixture) {
  ARG_UNUSED(fixture);
  zplc_wifi_link_init(&link_state);
  net.calls = 0;
  net.result = 0;
}

ZTEST_SUITE(wifi_link, NULL, NULL, before, NULL, NULL);

ZTEST(wifi_link, test_without_credentials_nothing_is_requested_and_the_state_says_so) {
  uint32_t next = zplc_wifi_link_poll(&link_state, false, false, fake_connect, &net);

  zassert_equal(net.calls, 0, "a board with no SSID must not try to connect");
  zassert_equal(zplc_wifi_link_state(&link_state), ZPLC_WIFI_UNCONFIGURED);
  zassert_equal(next, ZPLC_WIFI_IDLE_MS);
}

ZTEST(wifi_link, test_credentials_make_the_first_poll_request_one_connection_and_wait_for_it) {
  uint32_t next = zplc_wifi_link_poll(&link_state, true, false, fake_connect, &net);

  zassert_equal(net.calls, 1);
  zassert_equal(zplc_wifi_link_state(&link_state), ZPLC_WIFI_CONNECTING);
  zassert_equal(next, ZPLC_WIFI_CONNECT_WAIT_MS);
}

ZTEST(wifi_link, test_an_address_means_connected_and_the_link_is_only_watched) {
  (void)zplc_wifi_link_poll(&link_state, true, false, fake_connect, &net);
  uint32_t next = zplc_wifi_link_poll(&link_state, true, true, fake_connect, &net);

  zassert_equal(net.calls, 1, "a connected link requests nothing more");
  zassert_equal(zplc_wifi_link_state(&link_state), ZPLC_WIFI_CONNECTED);
  zassert_equal(next, ZPLC_WIFI_WATCH_MS);
}

ZTEST(wifi_link, test_a_refused_request_backs_off_with_a_doubling_delay_that_stops_at_the_bound) {
  static const uint32_t expected[] = {2000U, 4000U, 8000U, 16000U, 32000U, 60000U, 60000U, 60000U};

  net.result = -EIO;
  for (size_t i = 0; i < ARRAY_SIZE(expected); i++) {
    uint32_t next = zplc_wifi_link_poll(&link_state, true, false, fake_connect, &net);

    zassert_equal(next, expected[i], "failure %u waits %u ms", (unsigned)(i + 1U), (unsigned)expected[i]);
    zassert_equal(zplc_wifi_link_state(&link_state), ZPLC_WIFI_RETRYING);
    zassert_equal(net.calls, (int)(i + 1U), "one request per poll, never a loop");
  }
}

ZTEST(wifi_link, test_an_association_that_never_gets_an_address_counts_as_a_failure) {
  uint32_t next;

  (void)zplc_wifi_link_poll(&link_state, true, false, fake_connect, &net);
  next = zplc_wifi_link_poll(&link_state, true, false, fake_connect, &net);
  zassert_equal(net.calls, 1, "the wait ended: back off first, request again after");
  zassert_equal(zplc_wifi_link_state(&link_state), ZPLC_WIFI_RETRYING);
  zassert_equal(next, 2000U);
  (void)zplc_wifi_link_poll(&link_state, true, false, fake_connect, &net);
  zassert_equal(net.calls, 2);
  zassert_equal(zplc_wifi_link_state(&link_state), ZPLC_WIFI_CONNECTING);
}

ZTEST(wifi_link, test_a_dropped_link_is_requested_again_at_once_and_the_backoff_starts_over) {
  net.result = -EIO;
  (void)zplc_wifi_link_poll(&link_state, true, false, fake_connect, &net);
  (void)zplc_wifi_link_poll(&link_state, true, false, fake_connect, &net);
  net.result = 0;
  (void)zplc_wifi_link_poll(&link_state, true, false, fake_connect, &net);
  (void)zplc_wifi_link_poll(&link_state, true, true, fake_connect, &net);
  zassert_equal(zplc_wifi_link_state(&link_state), ZPLC_WIFI_CONNECTED);

  net.calls = 0;
  zassert_equal(zplc_wifi_link_poll(&link_state, true, false, fake_connect, &net), ZPLC_WIFI_CONNECT_WAIT_MS);
  zassert_equal(net.calls, 1, "the drop is answered in the same poll, not after a backoff");
  net.result = -EIO;
  (void)zplc_wifi_link_poll(&link_state, true, false, fake_connect, &net); /* the wait ends */
  zassert_equal(zplc_wifi_link_poll(&link_state, true, false, fake_connect, &net), 4000U,
                "the failures before the recovery are forgotten: the second failure of this drop");
}

ZTEST(wifi_link, test_removing_the_credentials_stops_the_attempts) {
  (void)zplc_wifi_link_poll(&link_state, true, false, fake_connect, &net);
  net.calls = 0;
  (void)zplc_wifi_link_poll(&link_state, false, false, fake_connect, &net);
  zassert_equal(net.calls, 0);
  zassert_equal(zplc_wifi_link_state(&link_state), ZPLC_WIFI_UNCONFIGURED);
}

ZTEST(wifi_link, test_the_state_names_are_those_of_the_status) {
  zassert_str_equal(zplc_wifi_state_name(ZPLC_WIFI_UNCONFIGURED), "unconfigured");
  zassert_str_equal(zplc_wifi_state_name(ZPLC_WIFI_CONNECTING), "connecting");
  zassert_str_equal(zplc_wifi_state_name(ZPLC_WIFI_CONNECTED), "connected");
  zassert_str_equal(zplc_wifi_state_name(ZPLC_WIFI_RETRYING), "retrying");
}
