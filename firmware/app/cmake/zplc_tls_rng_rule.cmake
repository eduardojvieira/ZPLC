# COM-016: a firmware build that enables TLS with a random generator that is
# not cryptographic stops here.
#
#   zplc_check_tls_random(<tls> <test_random_generator> <csprng_enabled>)
#
#   tls                    CONFIG_MQTT_LIB_TLS or CONFIG_NET_SOCKETS_SOCKOPT_TLS
#   test_random_generator  CONFIG_TEST_RANDOM_GENERATOR
#   csprng_enabled         CONFIG_CSPRNG_ENABLED
#
# CONFIG_TEST_RANDOM_GENERATOR does not select a weak generator by itself; it
# allows one. Zephyr then falls back to the timer based generator, or to the
# insecure CSPRNG of the tests, as soon as the entropy driver is not in the
# build, and TLS would keep running on keys and nonces anybody can predict.
# The two together are therefore refused, as is TLS without a cryptographic
# random source at all.
#
# The function is plain CMake so that tools/firmware-test/test_comm_rules.py can
# call it with each combination (cmake -P) and see the build stop.
function(zplc_check_tls_random tls test_random_generator csprng_enabled)
  if(tls AND test_random_generator)
    message(FATAL_ERROR
      "zplc_rule_tls_with_test_random_generator: TLS is enabled together with "
      "CONFIG_TEST_RANDOM_GENERATOR. That option allows a random number "
      "generator that is not random (COM-016). Use the hardware entropy "
      "source of the board and remove CONFIG_TEST_RANDOM_GENERATOR, or turn "
      "TLS off (CONFIG_MQTT_LIB_TLS=n, CONFIG_NET_SOCKETS_SOCKOPT_TLS=n).")
  endif()
  if(tls AND NOT csprng_enabled)
    message(FATAL_ERROR
      "zplc_rule_tls_without_cryptographic_random: TLS is enabled but the "
      "build has no cryptographically secure random source "
      "(CONFIG_CSPRNG_ENABLED is not set: no entropy driver for this board). "
      "Turn TLS off, or add an entropy driver (COM-016).")
  endif()
endfunction()
