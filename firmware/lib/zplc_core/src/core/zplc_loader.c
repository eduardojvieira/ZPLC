/**
 * @file zplc_loader.c
 * @brief ZPLC Binary File Loader Implementation
 */

#include "zplc_loader.h"
#include "zplc_core.h"
#include "zplc_scheduler.h"
#include <string.h>

/* Packed structures matching the compiler output */
struct __attribute__((packed)) zplc_file_header {
    uint32_t magic;
    uint16_t version_major;
    uint16_t version_minor;
    uint32_t flags;
    uint32_t crc32;
    uint32_t code_size;
    uint32_t data_size;
    uint16_t entry_point;
    uint16_t segment_count;
    uint32_t reserved;
};

struct __attribute__((packed)) zplc_segment_entry {
    uint16_t type;
    uint16_t flags;
    uint32_t size;
};

struct __attribute__((packed)) zplc_task_def_file {
    uint16_t id;
    uint8_t type;
    uint8_t priority;
    uint32_t interval_us;
    uint16_t entry_point;
    uint16_t stack_size;
    uint32_t reserved;
};

int zplc_loader_load(const uint8_t *data, size_t len) {
    if (len < sizeof(struct zplc_file_header)) {
        return ZPLC_LOADER_ERR_SIZE;
    }

    const struct zplc_file_header *hdr = (const struct zplc_file_header *)data;

    /* Verify Magic (Byte-by-byte to avoid endianness confusion) */
    /* "ZPLC" = 0x5A, 0x50, 0x4C, 0x43 */
    if (data[0] != 0x5A || data[1] != 0x50 || data[2] != 0x4C || data[3] != 0x43) {
        return ZPLC_LOADER_ERR_MAGIC;
    }

    /* Process Segments */
    size_t offset = sizeof(struct zplc_file_header);
    size_t segment_table_size = hdr->segment_count * sizeof(struct zplc_segment_entry);
    
    if (len < offset + segment_table_size) {
        return ZPLC_LOADER_ERR_SIZE;
    }

    const struct zplc_segment_entry *segments = (const struct zplc_segment_entry *)(data + offset);
    offset += segment_table_size;

    /* First pass: Load CODE */
    int code_loaded = 0;
    
    for (int i = 0; i < hdr->segment_count; i++) {
        if (segments[i].type == ZPLC_SEGMENT_TYPE_CODE) {
            if (len < offset + segments[i].size) return ZPLC_LOADER_ERR_SIZE;
            
            /* Copy code to VM memory using public API */
            if (zplc_mem_load_code(data + offset, segments[i].size, 0) != 0) {
                return ZPLC_LOADER_ERR_MEMORY;
            }
            code_loaded = 1;
        }
        offset += segments[i].size;
    }

    if (!code_loaded) return ZPLC_LOADER_ERR_NO_CODE;

    /* Second pass: Load TASKS */
    offset = sizeof(struct zplc_file_header) + segment_table_size;
    int tasks_found = 0;

    for (int i = 0; i < hdr->segment_count; i++) {
        if (segments[i].type == ZPLC_SEGMENT_TYPE_TASK) {
            if (len < offset + segments[i].size) return ZPLC_LOADER_ERR_SIZE;
            
            size_t task_count = segments[i].size / sizeof(struct zplc_task_def_file);
            const struct zplc_task_def_file *tasks = (const struct zplc_task_def_file *)(data + offset);
            
            for (size_t t = 0; t < task_count; t++) {
                zplc_task_def_t def;
                def.id = tasks[t].id;
                def.type = tasks[t].type;
                def.priority = tasks[t].priority;
                def.interval_us = tasks[t].interval_us;
                def.entry_point = tasks[t].entry_point;
                def.stack_size = tasks[t].stack_size;
                
                /* Safety limits - Enforce minimum stack for stability */
                if (def.stack_size < 256) def.stack_size = 256;
                if (def.stack_size > 1024) def.stack_size = 1024;
                if (def.interval_us < 1000) def.interval_us = 1000; // Min 1ms

                /* Register task - pass NULL code because we already loaded it */
                zplc_sched_register_task(&def, NULL, 0);
                tasks_found++;
            }
        }
        offset += segments[i].size;
    }

    /* If no tasks defined, register default legacy task from header entry point */
    if (tasks_found == 0) {
        zplc_task_def_t def = {
            .id = 99,
            .type = ZPLC_TASK_CYCLIC,
            .priority = 3,
            .interval_us = 50000, /* 50ms default */
            .entry_point = hdr->entry_point,
            .stack_size = 256
        };
        zplc_sched_register_task(&def, NULL, 0);
    }

    return ZPLC_LOADER_OK;
}
