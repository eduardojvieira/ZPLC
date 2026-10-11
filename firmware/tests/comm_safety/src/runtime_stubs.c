/*
 * The program buffers shell_cmds.c reaches into. In the product they belong to
 * main.c, which starts the whole runtime; the shell under test needs only the
 * storage.
 */
#include <stddef.h>
#include <stdint.h>

#include "program_store.h"

static uint8_t s_program_buf[ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE];
static uint8_t s_program_staging_buf[ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE +
                                     ZPLC_PROGRAM_STORE_FOOTER_SIZE];

uint8_t *program_buffer = s_program_buf;
size_t program_buffer_size = ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE;
volatile size_t program_expected_size;
volatile size_t program_received_size;
uint8_t *program_staging_buffer = s_program_staging_buf;
volatile size_t program_staging_received_size;
