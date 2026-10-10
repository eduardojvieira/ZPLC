/* Host stand-in for the Zephyr logging macros used by the handlers. */
#ifndef ZPLC_TEST_STUB_ZEPHYR_LOG_H
#define ZPLC_TEST_STUB_ZEPHYR_LOG_H

#define LOG_LEVEL_INF 3
#define LOG_MODULE_REGISTER(...) extern int zplc_test_stub_log_unused
#define LOG_INF(...) ((void)0)
#define LOG_WRN(...) ((void)0)
#define LOG_ERR(...) ((void)0)
#define LOG_DBG(...) ((void)0)

#endif
