/* The four functions of <string.h> that the core uses, for a build without a C library (tools/wasm-core). */
#ifndef ZPLC_WASM_CORE_STRING_H
#define ZPLC_WASM_CORE_STRING_H

#include <stddef.h>

void *memcpy(void *destination, const void *source, size_t length);
void *memmove(void *destination, const void *source, size_t length);
void *memset(void *destination, int value, size_t length);
int memcmp(const void *left, const void *right, size_t length);

#endif
