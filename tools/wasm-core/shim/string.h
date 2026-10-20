/* The functions of <string.h> that the core and the session use, for a build without a C library (tools/wasm-core). */
#ifndef ZPLC_WASM_CORE_STRING_H
#define ZPLC_WASM_CORE_STRING_H

#include <stddef.h>

void *memcpy(void *destination, const void *source, size_t length);
void *memmove(void *destination, const void *source, size_t length);
void *memset(void *destination, int value, size_t length);
int memcmp(const void *left, const void *right, size_t length);
size_t strlen(const char *text);
int strcmp(const char *left, const char *right);
int strncmp(const char *left, const char *right, size_t length);

/* Only the C test suites call these; suite_libc.c defines them and is not linked into the runtime (suites.ts). */
char *strstr(const char *text, const char *word);
char *strcpy(char *destination, const char *source);
char *strcat(char *destination, const char *source);

#endif
