/* What the C test suites of firmware/lib/zplc_core/tests call beyond the C library of the runtime (libc.c), for the
 * port conformance suite on WebAssembly (tools/wasm-core/suites.ts, IO-013). It is linked into a suite, never into the
 * runtime module that the IDE ships.
 *
 * Text goes to the host a line at a time, through the log import of the HAL port (src/hal/wasm), so that a suite's
 * PASS and FAIL lines reach the runner in the order the suite printed them. */
#include <stdarg.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>

#include <zplc_hal.h>

__attribute__((import_module("zplc_host"), import_name("log"))) extern void zplc_host_log(const char *line);

static char pending[512];
static size_t pending_length;

/** Hands the line written so far to the host; the runner calls it after the suite returns. */
void zplc_wasm_suite_flush(void)
{
    if (pending_length > 0U) {
        pending[pending_length] = '\0';
        zplc_host_log(pending);
        pending_length = 0U;
    }
}

static void emit(const char *text, size_t length)
{
    size_t index;

    for (index = 0U; index < length; index++) {
        if (text[index] == '\n') {
            pending[pending_length] = '\0';
            zplc_host_log(pending);
            pending_length = 0U;
        } else {
            if (pending_length == sizeof(pending) - 1U) {
                zplc_wasm_suite_flush();
            }
            pending[pending_length++] = text[index];
        }
    }
}

int vfprintf(FILE *stream, const char *format, va_list arguments)
{
    char text[1024];
    va_list copy;
    int length;

    (void)stream;
    va_copy(copy, arguments);
    length = vsnprintf(text, sizeof(text), format, copy);
    va_end(copy);
    emit(text, strlen(text));
    return length;
}

int printf(const char *format, ...)
{
    va_list arguments;
    int length;

    va_start(arguments, format);
    length = vfprintf(stdout, format, arguments);
    va_end(arguments);
    return length;
}

int puts(const char *text)
{
    emit(text, strlen(text));
    emit("\n", 1U);
    return 0;
}

int putchar(int c)
{
    char character = (char)c;
    emit(&character, 1U);
    return c;
}

int fputc(int c, FILE *stream)
{
    (void)stream;
    return putchar(c);
}

char *strstr(const char *text, const char *word)
{
    size_t length = strlen(word);

    for (; *text != '\0'; text++) {
        if (strncmp(text, word, length) == 0) {
            return (char *)text;
        }
    }
    return length == 0U ? (char *)text : NULL;
}

char *strcpy(char *destination, const char *source)
{
    char *out = destination;
    while ((*out++ = *source++) != '\0') {
    }
    return destination;
}

char *strcat(char *destination, const char *source)
{
    strcpy(destination + strlen(destination), source);
    return destination;
}

/* The C library of the runtime writes fprintf through zplc_hal_log. A suite that links no HAL (the I/O table accessors
 * with a table of their own) gets this one; a suite with the HAL port gets the port's. */
__attribute__((weak)) void zplc_hal_log(const char *format, ...)
{
    char line[256];
    va_list arguments;

    va_start(arguments, format);
    (void)vsnprintf(line, sizeof(line), format, arguments);
    va_end(arguments);
    zplc_wasm_suite_flush();
    zplc_host_log(line);
}
