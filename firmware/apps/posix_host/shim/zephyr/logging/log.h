/* The logging macros of the communication handlers, on stderr (stdout carries the session protocol). */
#ifndef ZPLC_HOST_SHIM_ZEPHYR_LOG_H
#define ZPLC_HOST_SHIM_ZEPHYR_LOG_H

#define LOG_LEVEL_INF 3
#define LOG_MODULE_REGISTER(...) extern int zplc_host_log_unused

void zplc_host_log(const char *level, const char *format, ...);

#define LOG_INF(...) zplc_host_log("inf", __VA_ARGS__)
#define LOG_WRN(...) zplc_host_log("wrn", __VA_ARGS__)
#define LOG_ERR(...) zplc_host_log("err", __VA_ARGS__)
#define LOG_DBG(...) ((void)0)

#endif
