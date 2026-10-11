/* The memory functions that the core calls, for a build without a C library (tools/wasm-core). Byte loops: the core
 * copies a few hundred bytes at a time, and a loop that a reader can check is worth more here than speed. */
#include <stddef.h>

void *memcpy(void *destination, const void *source, size_t length)
{
    unsigned char *out = destination;
    const unsigned char *in = source;
    while (length-- > 0) {
        *out++ = *in++;
    }
    return destination;
}

void *memmove(void *destination, const void *source, size_t length)
{
    unsigned char *out = destination;
    const unsigned char *in = source;
    if (out < in) {
        while (length-- > 0) {
            *out++ = *in++;
        }
    } else {
        out += length;
        in += length;
        while (length-- > 0) {
            *--out = *--in;
        }
    }
    return destination;
}

void *memset(void *destination, int value, size_t length)
{
    unsigned char *out = destination;
    while (length-- > 0) {
        *out++ = (unsigned char)value;
    }
    return destination;
}

int memcmp(const void *left, const void *right, size_t length)
{
    const unsigned char *a = left;
    const unsigned char *b = right;
    for (; length > 0; length--, a++, b++) {
        if (*a != *b) {
            return *a - *b;
        }
    }
    return 0;
}
