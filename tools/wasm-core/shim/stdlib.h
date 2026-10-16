/* The part of <stdlib.h> that the session uses (tools/wasm-core). The allocator is a stack: see libc.c. */
#ifndef ZPLC_WASM_CORE_STDLIB_H
#define ZPLC_WASM_CORE_STDLIB_H

#include <stddef.h>

void *malloc(size_t size);
void free(void *pointer);
/* There is no environment: the session reads its tuning variables and gets the defaults. */
char *getenv(const char *name);
unsigned long strtoul(const char *text, char **end, int base);

#endif
