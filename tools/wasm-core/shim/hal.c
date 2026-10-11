/* What the core needs of the hardware abstraction layer in a WebAssembly module with no host imports: a clock that the
 * embedder sets, the lock of the process image (one thread, so it never waits), and buffers for the artifact and for the
 * verifier of the loader. Nothing else of the HAL is reached by the core (tools/wasm-core). */
#include <stdint.h>
#include <zplc_hal.h>

/* The largest artifact: the code region of the core, its header, task table and tags. */
#define ZPLC_SHIM_ARTIFACT_MAX 0xC000u
/* ZPLC_LOADER_VERIFY_WORKSPACE_SIZE at the default code size is 15,144 bytes. */
#define ZPLC_SHIM_WORKSPACE_MAX 0x4000u

static uint32_t now_ms;
static uint8_t artifact[ZPLC_SHIM_ARTIFACT_MAX];
static uint8_t workspace[ZPLC_SHIM_WORKSPACE_MAX];

void zplc_shim_set_time(uint32_t milliseconds)
{
    now_ms = milliseconds;
}

uint8_t *zplc_shim_artifact(void)
{
    return artifact;
}

uint32_t zplc_shim_artifact_capacity(void)
{
    return ZPLC_SHIM_ARTIFACT_MAX;
}

uint8_t *zplc_shim_workspace(void)
{
    return workspace;
}

uint32_t zplc_shim_workspace_capacity(void)
{
    return ZPLC_SHIM_WORKSPACE_MAX;
}

uint32_t zplc_hal_tick(void)
{
    return now_ms;
}

zplc_hal_mutex_t zplc_hal_mutex_create(void)
{
    return (zplc_hal_mutex_t)1;
}

zplc_hal_result_t zplc_hal_mutex_lock(zplc_hal_mutex_t mutex)
{
    (void)mutex;
    return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_mutex_unlock(zplc_hal_mutex_t mutex)
{
    (void)mutex;
    return ZPLC_HAL_OK;
}
