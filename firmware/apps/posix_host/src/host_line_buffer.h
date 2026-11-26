#ifndef ZPLC_HOST_LINE_BUFFER_H
#define ZPLC_HOST_LINE_BUFFER_H

#include <stddef.h>

#include "host_stdio.h"

/*
 * Move the oldest line out of data[0..*length) into buffer, newline included, and
 * shift the rest down. Pure: no I/O, so the line splitting that both the POSIX and
 * the Windows readers use is tested on any host.
 *
 * READY  a whole line is in buffer.
 * ERROR  a piece without a newline: the line is longer than buffer (or than
 *        capacity), or input ended (at_eof) in the middle of a line.
 * Returns 0, leaving everything as it was, when no whole line has arrived yet.
 */
int zplc_host_take_line(char *data, size_t *length, size_t capacity, char *buffer, size_t buffer_size, int at_eof,
                        zplc_host_stdio_result_t *result);

#endif /* ZPLC_HOST_LINE_BUFFER_H */
