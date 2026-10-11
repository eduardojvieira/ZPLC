/*
 * RT-029: a translation unit that only evaluates the build-time rules of the configuration.
 *
 * CMakeLists.txt compiles this file many times, each time with one value that breaks one rule, and expects the
 * compiler to stop with the name of that rule (zplc_config_rule_<name>). The build that defines nothing, and the
 * build with every value at its limit, must compile.
 *
 * RT-013: a communication, shell or log priority that the scan coordinator does not outrank stops the build.
 * The rules of the scheduler threads are built the same way, and every board profile is built by the size run.
 */
#include "zplc_config_check.h"

int zplc_config_probe_unused;
