/* The C library functions that the core and the session call, for a build without a C library (tools/wasm-core).
 * Byte loops and a small formatter: the module copies a few hundred bytes at a time and writes JSON lines of a few
 * hundred, and code that a reader can check is worth more here than speed. */
#include <errno.h>
#include <stdarg.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <zplc_hal.h>

int errno;

/* ---------------------------------------------------------------------------------------------------------------- */
/* <string.h>                                                                                                       */
/* ---------------------------------------------------------------------------------------------------------------- */

void *memcpy(void *destination, const void *source, size_t length) {
  unsigned char *out = destination;
  const unsigned char *in = source;
  while (length-- > 0) {
    *out++ = *in++;
  }
  return destination;
}

void *memmove(void *destination, const void *source, size_t length) {
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

void *memset(void *destination, int value, size_t length) {
  unsigned char *out = destination;
  while (length-- > 0) {
    *out++ = (unsigned char)value;
  }
  return destination;
}

int memcmp(const void *left, const void *right, size_t length) {
  const unsigned char *a = left;
  const unsigned char *b = right;
  for (; length > 0; length--, a++, b++) {
    if (*a != *b) {
      return *a - *b;
    }
  }
  return 0;
}

size_t strlen(const char *text) {
  size_t length = 0;
  while (text[length] != '\0') {
    length++;
  }
  return length;
}

int strcmp(const char *left, const char *right) {
  while (*left != '\0' && *left == *right) {
    left++;
    right++;
  }
  return (unsigned char)*left - (unsigned char)*right;
}

int strncmp(const char *left, const char *right, size_t length) {
  for (; length > 0; length--, left++, right++) {
    if (*left != *right || *left == '\0') {
      return (unsigned char)*left - (unsigned char)*right;
    }
  }
  return 0;
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* <stdlib.h>                                                                                                       */
/* ---------------------------------------------------------------------------------------------------------------- */

/* The session allocates a program, its verifier workspace and the buffers of the program store for the length of one
 * request and frees them before it answers. A stack allocator is enough for that: a block is released when it is the
 * last one, and when every block is released the stack is empty. A free out of order leaves a hole until the rest are
 * freed (ponytail: no free list; add one if a caller keeps a block across requests). */
#define ZPLC_ARENA_SIZE (320U * 1024U)
#define ZPLC_ARENA_ALIGN 16U

typedef struct {
  size_t size;     /* rounded to ZPLC_ARENA_ALIGN */
  size_t previous; /* the stack top before this block */
  size_t padding[2];
} arena_header_t;

static unsigned char arena[ZPLC_ARENA_SIZE] __attribute__((aligned(ZPLC_ARENA_ALIGN)));
static size_t arena_top;
static size_t arena_live;

void *malloc(size_t size) {
  size_t rounded = (size + ZPLC_ARENA_ALIGN - 1U) & ~(size_t)(ZPLC_ARENA_ALIGN - 1U);
  arena_header_t *header;

  if (size == 0U || rounded < size || rounded > ZPLC_ARENA_SIZE - arena_top - sizeof(arena_header_t)) {
    return NULL;
  }
  header = (arena_header_t *)(void *)(arena + arena_top);
  header->size = rounded;
  header->previous = arena_top;
  arena_top += sizeof(arena_header_t) + rounded;
  arena_live++;
  return header + 1;
}

void free(void *pointer) {
  arena_header_t *header;

  if (pointer == NULL || arena_live == 0U) {
    return;
  }
  header = (arena_header_t *)pointer - 1;
  arena_live--;
  if (arena_live == 0U) {
    arena_top = 0U;
  } else if ((unsigned char *)(header + 1) + header->size == arena + arena_top) {
    arena_top = header->previous;
  }
}

char *getenv(const char *name) {
  (void)name;
  return NULL;
}

unsigned long strtoul(const char *text, char **end, int base) {
  unsigned long value = 0;
  int any = 0;
  int overflow = 0;

  if (base == 0) {
    base = 10;
  }
  for (;; text++) {
    int digit;
    char c = *text;
    if (c >= '0' && c <= '9') {
      digit = c - '0';
    } else if (c >= 'a' && c <= 'z') {
      digit = c - 'a' + 10;
    } else if (c >= 'A' && c <= 'Z') {
      digit = c - 'A' + 10;
    } else {
      break;
    }
    if (digit >= base) {
      break;
    }
    any = 1;
    if (value > (0xFFFFFFFFUL - (unsigned long)digit) / (unsigned long)base) {
      overflow = 1;
    } else {
      value = value * (unsigned long)base + (unsigned long)digit;
    }
  }
  if (end != NULL) {
    *end = (char *)text;
  }
  (void)any;
  if (overflow != 0) {
    errno = ERANGE;
    return 0xFFFFFFFFUL;
  }
  return value;
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* <stdio.h>                                                                                                        */
/* ---------------------------------------------------------------------------------------------------------------- */

typedef struct {
  char *buffer;
  size_t size;
  size_t length; /* what the text would take, whatever fits */
} sink_t;

static void put(sink_t *sink, char c) {
  if (sink->size != 0U && sink->length + 1U < sink->size) {
    sink->buffer[sink->length] = c;
  }
  sink->length++;
}

static void put_padding(sink_t *sink, char c, int count) {
  while (count-- > 0) {
    put(sink, c);
  }
}

/* The conversions of d i u x X c s p and %, with the flags - and 0, a width, a precision and the length modifiers
 * hh h l ll z j t. Floating point is not formatted: the runtime has no floating point text. */
int vsnprintf(char *out, size_t size, const char *format, va_list arguments) {
  sink_t sink;

  sink.buffer = out;
  sink.size = size;
  sink.length = 0U;
  for (; *format != '\0'; format++) {
    int left = 0;
    int zero = 0;
    int width = 0;
    int precision = -1;
    int longs = 0; /* 0 int, 1 long, 2 long long; size_t, ptrdiff_t and intmax_t are as wide as long long needs */
    int base = 10;
    int is_signed = 0;
    int upper = 0;
    char conversion;
    char digits[24];
    int count = 0;
    int negative = 0;
    const char *text = NULL;
    unsigned long long magnitude = 0;

    if (*format != '%') {
      put(&sink, *format);
      continue;
    }
    format++;
    for (;; format++) {
      if (*format == '-') {
        left = 1;
      } else if (*format == '0') {
        zero = 1;
      } else {
        break;
      }
    }
    if (*format == '*') {
      width = va_arg(arguments, int);
      if (width < 0) {
        left = 1;
        width = -width;
      }
      format++;
    } else {
      while (*format >= '0' && *format <= '9') {
        width = width * 10 + (*format++ - '0');
      }
    }
    if (*format == '.') {
      format++;
      precision = 0;
      if (*format == '*') {
        precision = va_arg(arguments, int);
        format++;
      } else {
        while (*format >= '0' && *format <= '9') {
          precision = precision * 10 + (*format++ - '0');
        }
      }
    }
    for (;; format++) {
      if (*format == 'l') {
        longs = longs == 1 ? 2 : 1;
      } else if (*format == 'z' || *format == 'j' || *format == 't') {
        longs = 2;
      } else if (*format != 'h') {
        break;
      }
    }
    conversion = *format;
    if (conversion == '\0') {
      break;
    }
    switch (conversion) {
    case '%':
      put(&sink, '%');
      continue;
    case 'c':
      put_padding(&sink, ' ', left ? 0 : width - 1);
      put(&sink, (char)va_arg(arguments, int));
      put_padding(&sink, ' ', left ? width - 1 : 0);
      continue;
    case 's': {
      int length = 0;
      text = va_arg(arguments, const char *);
      if (text == NULL) {
        text = "(null)";
      }
      while (text[length] != '\0' && (precision < 0 || length < precision)) {
        length++;
      }
      put_padding(&sink, ' ', left ? 0 : width - length);
      for (count = 0; count < length; count++) {
        put(&sink, text[count]);
      }
      put_padding(&sink, ' ', left ? width - length : 0);
      continue;
    }
    case 'd':
    case 'i':
      is_signed = 1;
      break;
    case 'u':
      break;
    case 'x':
      base = 16;
      break;
    case 'X':
      base = 16;
      upper = 1;
      break;
    case 'p':
      base = 16;
      longs = 1;
      break;
    default:
      /* an unknown conversion is written as it came, so that the mistake is visible in the text */
      put(&sink, '%');
      put(&sink, conversion);
      continue;
    }
    if (is_signed != 0) {
      long long value = longs == 2   ? va_arg(arguments, long long)
                        : longs == 1 ? (long long)va_arg(arguments, long)
                                     : (long long)va_arg(arguments, int);
      negative = value < 0;
      magnitude = negative ? (unsigned long long)0 - (unsigned long long)value : (unsigned long long)value;
    } else {
      magnitude = longs == 2   ? va_arg(arguments, unsigned long long)
                  : longs == 1 ? (unsigned long long)va_arg(arguments, unsigned long)
                               : (unsigned long long)va_arg(arguments, unsigned int);
    }
    do {
      int digit = (int)(magnitude % (unsigned long long)base);
      digits[count++] = (char)(digit < 10 ? '0' + digit : (upper ? 'A' : 'a') + digit - 10);
      magnitude /= (unsigned long long)base;
    } while (magnitude != 0U);
    {
      int zeros = precision > count ? precision - count : 0;
      int total = count + zeros + negative;
      int pad = width > total ? width - total : 0;

      if (left == 0 && (zero == 0 || precision >= 0)) {
        put_padding(&sink, ' ', pad);
        pad = 0;
      }
      if (negative != 0) {
        put(&sink, '-');
      }
      if (left == 0) {
        put_padding(&sink, '0', pad);
        pad = 0;
      }
      put_padding(&sink, '0', zeros);
      while (count > 0) {
        put(&sink, digits[--count]);
      }
      put_padding(&sink, ' ', pad);
    }
  }
  if (size != 0U) {
    sink.buffer[sink.length < size ? sink.length : size - 1U] = '\0';
  }
  return (int)sink.length;
}

int snprintf(char *out, size_t size, const char *format, ...) {
  va_list arguments;
  int length;

  va_start(arguments, format);
  length = vsnprintf(out, size, format, arguments);
  va_end(arguments);
  return length;
}

int fprintf(FILE *stream, const char *format, ...) {
  char line[256];
  va_list arguments;
  int length;

  (void)stream;
  va_start(arguments, format);
  length = vsnprintf(line, sizeof(line), format, arguments);
  va_end(arguments);
  zplc_hal_log("%s", line);
  return length;
}
