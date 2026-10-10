/*
 * RT-029: a translation unit that only evaluates the build-time rules of the configuration.
 *
 * CMakeLists.txt compiles this file many times, each time with one value that breaks one rule, and expects the
 * compiler to stop with the name of that rule (zplc_config_rule_<name>). The build that defines nothing, and the
 * build with every value at its limit, must compile.
 */
#include "zplc_config_check.h"

int zplc_config_probe_unused;
