/**
 * @file zplc_debug.c
 * @brief ZPLC Hardware-in-the-Loop Debug Implementation
 *
 * SPDX-License-Identifier: MIT
 *
 * Implements the HIL debug output functions for trace and diagnostics.
 * All output is JSON-formatted, line-based, via the Zephyr shell.
 *
 * This file is only compiled when CONFIG_ZPLC_HIL_DEBUG is enabled.
 */

#include "zplc_debug.h"
#include "zplc_isa.h"

#ifdef CONFIG_ZPLC_HIL_DEBUG

#include <zephyr/shell/shell.h>
#include <zephyr/kernel.h>
#include <stdio.h>
#include <string.h>

/* ============================================================================
 * Static State (No Malloc)
 * ============================================================================ */

/** Static buffer for JSON output formatting */
static char hil_buf[256];

/** Current debug mode */
static hil_mode_t hil_mode = HIL_MODE_OFF;

/** Shell instance for output */
static const struct shell *hil_shell = NULL;

/* ============================================================================
 * Opcode Name Lookup Table
 * ============================================================================ */

/**
 * @brief Opcode name lookup table.
 *
 * Maps opcode values to human-readable names for trace output.
 * Uses a sparse approach with switch for memory efficiency.
 */
const char *hil_opcode_name(uint8_t op)
{
    switch (op) {
    /* System Operations */
    case OP_NOP:       return "NOP";
    case OP_HALT:      return "HALT";
    case OP_BREAK:     return "BREAK";
    case OP_GET_TICKS: return "GET_TICKS";

    /* Stack Operations */
    case OP_DUP:       return "DUP";
    case OP_DROP:      return "DROP";
    case OP_SWAP:      return "SWAP";
    case OP_OVER:      return "OVER";
    case OP_ROT:       return "ROT";

    /* Indirect Memory Access */
    case OP_LOADI8:    return "LOADI8";
    case OP_LOADI16:   return "LOADI16";
    case OP_LOADI32:   return "LOADI32";
    case OP_STOREI8:   return "STOREI8";
    case OP_STOREI16:  return "STOREI16";
    case OP_STOREI32:  return "STOREI32";

    /* String Operations */
    case OP_STRLEN:    return "STRLEN";
    case OP_STRCPY:    return "STRCPY";
    case OP_STRCAT:    return "STRCAT";
    case OP_STRCMP:    return "STRCMP";
    case OP_STRCLR:    return "STRCLR";

    /* Integer Arithmetic */
    case OP_ADD:       return "ADD";
    case OP_SUB:       return "SUB";
    case OP_MUL:       return "MUL";
    case OP_DIV:       return "DIV";
    case OP_MOD:       return "MOD";
    case OP_NEG:       return "NEG";
    case OP_ABS:       return "ABS";

    /* Float Arithmetic */
    case OP_ADDF:      return "ADDF";
    case OP_SUBF:      return "SUBF";
    case OP_MULF:      return "MULF";
    case OP_DIVF:      return "DIVF";
    case OP_NEGF:      return "NEGF";
    case OP_ABSF:      return "ABSF";

    /* Logical/Bitwise */
    case OP_AND:       return "AND";
    case OP_OR:        return "OR";
    case OP_XOR:       return "XOR";
    case OP_NOT:       return "NOT";
    case OP_SHL:       return "SHL";
    case OP_SHR:       return "SHR";
    case OP_SAR:       return "SAR";

    /* Comparison */
    case OP_EQ:        return "EQ";
    case OP_NE:        return "NE";
    case OP_LT:        return "LT";
    case OP_LE:        return "LE";
    case OP_GT:        return "GT";
    case OP_GE:        return "GE";
    case OP_LTU:       return "LTU";
    case OP_GTU:       return "GTU";

    /* 8-bit operand */
    case OP_PUSH8:     return "PUSH8";
    case OP_PICK:      return "PICK";
    case OP_JR:        return "JR";
    case OP_JRZ:       return "JRZ";
    case OP_JRNZ:      return "JRNZ";

    /* 16-bit operand */
    case OP_LOAD8:     return "LOAD8";
    case OP_LOAD16:    return "LOAD16";
    case OP_LOAD32:    return "LOAD32";
    case OP_LOAD64:    return "LOAD64";
    case OP_STORE8:    return "STORE8";
    case OP_STORE16:   return "STORE16";
    case OP_STORE32:   return "STORE32";
    case OP_STORE64:   return "STORE64";
    case OP_PUSH16:    return "PUSH16";
    case OP_JMP:       return "JMP";
    case OP_JZ:        return "JZ";
    case OP_JNZ:       return "JNZ";
    case OP_CALL:      return "CALL";
    case OP_RET:       return "RET";

    /* Type Conversion */
    case OP_I2F:       return "I2F";
    case OP_F2I:       return "F2I";
    case OP_I2B:       return "I2B";
    case OP_EXT8:      return "EXT8";
    case OP_EXT16:     return "EXT16";
    case OP_ZEXT8:     return "ZEXT8";
    case OP_ZEXT16:    return "ZEXT16";

    /* 32-bit operand */
    case OP_PUSH32:    return "PUSH32";

    default:           return "???";
    }
}

/* ============================================================================
 * Error Name Lookup Table
 * ============================================================================ */

const char *hil_error_name(uint8_t code)
{
    switch (code) {
    case 0x00: return "OK";
    case 0x01: return "STACK_OVERFLOW";
    case 0x02: return "STACK_UNDERFLOW";
    case 0x03: return "DIV_BY_ZERO";
    case 0x04: return "INVALID_OPCODE";
    case 0x05: return "OUT_OF_BOUNDS";
    case 0x06: return "CALL_OVERFLOW";
    case 0x07: return "INVALID_JUMP";
    case 0x08: return "WATCHDOG";
    case 0x09: return "HALTED";
    case 0x0A: return "PAUSED";
    default:   return "UNKNOWN";
    }
}

/* ============================================================================
 * Mode Control
 * ============================================================================ */

void hil_set_mode(hil_mode_t mode)
{
    hil_mode = mode;
}

hil_mode_t hil_get_mode(void)
{
    return hil_mode;
}

void hil_set_shell(const struct shell *sh)
{
    hil_shell = sh;
}

/* ============================================================================
 * Internal Output Helper
 * ============================================================================ */

/**
 * @brief Print the buffer contents to the shell.
 *
 * Uses shell_print which adds a newline automatically.
 */
static inline void hil_output(void)
{
    if (hil_shell != NULL) {
        shell_print(hil_shell, "%s", hil_buf);
    } else {
        printk("%s\n", hil_buf);
    }
}

/* ============================================================================
 * Trace Functions
 * ============================================================================ */

void hil_trace_opcode(uint8_t op, uint16_t pc, uint8_t sp, int32_t tos)
{
    if (hil_mode != HIL_MODE_VERBOSE || hil_shell == NULL) {
        return;
    }

    snprintf(hil_buf, sizeof(hil_buf),
             "{\"t\":\"opcode\",\"op\":\"%s\",\"pc\":%u,\"sp\":%u,\"tos\":%d}",
             hil_opcode_name(op), pc, sp, tos);
    hil_output();
}

void hil_trace_fb(const char *name, uint8_t id, bool q, int32_t et_or_cv)
{
    if (hil_mode == HIL_MODE_OFF || hil_shell == NULL) {
        return;
    }

    if (et_or_cv >= 0) {
        snprintf(hil_buf, sizeof(hil_buf),
                 "{\"t\":\"fb\",\"name\":\"%s\",\"id\":%u,\"q\":%s,\"et\":%d}",
                 name, id, q ? "true" : "false", et_or_cv);
    } else {
        snprintf(hil_buf, sizeof(hil_buf),
                 "{\"t\":\"fb\",\"name\":\"%s\",\"id\":%u,\"q\":%s}",
                 name, id, q ? "true" : "false");
    }
    hil_output();
}

void hil_trace_task(uint8_t id, uint32_t start_ms, uint32_t end_ms,
                    uint32_t us, bool overrun)
{
    if (hil_mode == HIL_MODE_OFF || hil_shell == NULL) {
        return;
    }

    snprintf(hil_buf, sizeof(hil_buf),
             "{\"t\":\"task\",\"id\":%u,\"start\":%u,\"end\":%u,\"us\":%u,\"ovr\":%s}",
             id, start_ms, end_ms, us, overrun ? "true" : "false");
    hil_output();
}

void hil_trace_cycle(uint32_t n, uint32_t us, uint8_t tasks)
{
    if (hil_mode == HIL_MODE_OFF || hil_shell == NULL) {
        return;
    }

    snprintf(hil_buf, sizeof(hil_buf),
             "{\"t\":\"cycle\",\"n\":%u,\"us\":%u,\"tasks\":%u}",
             n, us, tasks);
    hil_output();
}

void hil_trace_error(uint8_t code, const char *msg, uint16_t pc)
{
    /* Errors are always output regardless of mode */
    if (hil_shell == NULL) {
        return;
    }

    snprintf(hil_buf, sizeof(hil_buf),
             "{\"t\":\"error\",\"code\":%u,\"msg\":\"%s\",\"pc\":%u}",
             code, msg ? msg : hil_error_name(code), pc);
    hil_output();
}

void hil_trace_break(uint16_t pc)
{
    /* Breakpoints are always output regardless of mode */
    if (hil_shell == NULL) {
        return;
    }

    snprintf(hil_buf, sizeof(hil_buf),
             "{\"t\":\"break\",\"pc\":%u}", pc);
    hil_output();
}

void hil_trace_watch(uint16_t addr, const char *type, int32_t val)
{
    if (hil_mode == HIL_MODE_OFF || hil_shell == NULL) {
        return;
    }

    snprintf(hil_buf, sizeof(hil_buf),
             "{\"t\":\"watch\",\"addr\":%u,\"type\":\"%s\",\"val\":%d}",
             addr, type, val);
    hil_output();
}

void hil_send_ready(const char *fw_version, const char *caps)
{
    if (hil_shell == NULL) {
        return;
    }

    /* Build caps array: convert comma-separated to JSON array */
    char caps_json[128] = "[";
    if (caps != NULL && caps[0] != '\0') {
        const char *p = caps;
        bool first = true;
        while (*p) {
            /* Find end of current cap */
            const char *end = p;
            while (*end && *end != ',') {
                end++;
            }

            /* Add to JSON array */
            size_t len = strlen(caps_json);
            if (!first) {
                strncat(caps_json, ",", sizeof(caps_json) - len - 1);
                len++;
            }
            strncat(caps_json, "\"", sizeof(caps_json) - len - 1);
            len++;
            size_t cap_len = end - p;
            if (cap_len > 0 && len + cap_len + 2 < sizeof(caps_json)) {
                strncat(caps_json, p, cap_len);
                len += cap_len;
            }
            strncat(caps_json, "\"", sizeof(caps_json) - len - 1);

            first = false;
            p = (*end) ? end + 1 : end;
        }
    }
    strncat(caps_json, "]", sizeof(caps_json) - strlen(caps_json) - 1);

    snprintf(hil_buf, sizeof(hil_buf),
             "{\"t\":\"ready\",\"fw\":\"%s\",\"caps\":%s}",
             fw_version ? fw_version : "0.0.0", caps_json);
    hil_output();
}

void hil_send_ack(const char *cmd, const char *val, bool ok, const char *err)
{
    if (hil_shell == NULL) {
        return;
    }

    if (ok) {
        snprintf(hil_buf, sizeof(hil_buf),
                 "{\"t\":\"ack\",\"cmd\":\"%s\",\"val\":\"%s\",\"ok\":true}",
                 cmd ? cmd : "", val ? val : "");
    } else {
        snprintf(hil_buf, sizeof(hil_buf),
                 "{\"t\":\"ack\",\"cmd\":\"%s\",\"val\":\"%s\",\"ok\":false,\"err\":\"%s\"}",
                 cmd ? cmd : "", val ? val : "", err ? err : "unknown");
    }
    hil_output();
}

#endif /* CONFIG_ZPLC_HIL_DEBUG */
