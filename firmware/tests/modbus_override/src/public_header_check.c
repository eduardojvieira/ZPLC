/*
 * RT-033: zplc_config.h, a public header of the application, declares no test-only entry point.
 *
 * The name below is the hook that used to be declared here under CONFIG_ZTEST. It is declared again as a type
 * after the product header: the compiler refuses the file when the header declares it as a function.
 */
#include "zplc_config.h"

typedef int zplc_config_test_set_modbus_override_publish_hook;
