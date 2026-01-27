/**
 * @file zplc_loader.h
 * @brief ZPLC Binary File Loader
 *
 * Handles loading of .zplc files, parsing headers/segments,
 * and registering tasks with the scheduler.
 */

#ifndef ZPLC_LOADER_H
#define ZPLC_LOADER_H

#include <stdint.h>
#include <stddef.h>

/* File Constants */
#define ZPLC_FILE_MAGIC 0x5A504C43 /* "ZPLC" */
#define ZPLC_SEGMENT_TYPE_CODE 1
#define ZPLC_SEGMENT_TYPE_TASK 2

/* Error Codes */
#define ZPLC_LOADER_OK 0
#define ZPLC_LOADER_ERR_MAGIC -1
#define ZPLC_LOADER_ERR_VERSION -2
#define ZPLC_LOADER_ERR_SIZE -3
#define ZPLC_LOADER_ERR_NO_CODE -4
#define ZPLC_LOADER_ERR_MEMORY -5

/**
 * @brief Load a ZPLC binary file from memory buffer.
 *
 * This function parses the header, loads the code segment into VM memory,
 * and registers any defined tasks with the scheduler.
 *
 * @param data Pointer to the file data
 * @param len Length of the data in bytes
 * @return 0 on success, negative error code on failure
 */
int zplc_loader_load(const uint8_t *data, size_t len);

#endif /* ZPLC_LOADER_H */
