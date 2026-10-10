/* Host stand-in for the Zephyr barrier used by the Modbus handler. */
#ifndef ZPLC_TEST_STUB_ZEPHYR_BARRIER_H
#define ZPLC_TEST_STUB_ZEPHYR_BARRIER_H

static inline void barrier_dmem_fence_full(void) {}

#endif
