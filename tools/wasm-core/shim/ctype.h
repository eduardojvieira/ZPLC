/* The character classes that the session's request parser uses, in the "C" locale (tools/wasm-core). */
#ifndef ZPLC_WASM_CORE_CTYPE_H
#define ZPLC_WASM_CORE_CTYPE_H

static inline int isdigit(int c) { return c >= '0' && c <= '9'; }
static inline int isxdigit(int c) { return isdigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'); }
static inline int isalpha(int c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'); }
static inline int isalnum(int c) { return isalpha(c) || isdigit(c); }
static inline int isspace(int c) { return c == ' ' || (c >= '\t' && c <= '\r'); }

#endif
