/* The part of <stdio.h> that the core and the session use, for a build without a C library (tools/wasm-core).
 * There are no streams: a line written to one goes to the log of the host (zplc_hal_log). */
#ifndef ZPLC_WASM_CORE_STDIO_H
#define ZPLC_WASM_CORE_STDIO_H

#include <stdarg.h>
#include <stddef.h>

typedef struct zplc_wasm_stream FILE;

#define stdout ((FILE *)1)
#define stderr ((FILE *)2)

int vsnprintf(char *out, size_t size, const char *format, va_list arguments);
int snprintf(char *out, size_t size, const char *format, ...);
int fprintf(FILE *stream, const char *format, ...);

#endif
