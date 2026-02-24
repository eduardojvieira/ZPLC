/**
 * ZPLC Structured Text Lexer
 *
 * SPDX-License-Identifier: MIT
 *
 * Tokenizes IEC 61131-3 Structured Text source code.
 */

/**
 * Token types for Structured Text.
 */
export const TokenType = {
    // Keywords - Program structure
    PROGRAM: 'PROGRAM',
    END_PROGRAM: 'END_PROGRAM',
    FUNCTION: 'FUNCTION',
    END_FUNCTION: 'END_FUNCTION',
    VAR: 'VAR',
    END_VAR: 'END_VAR',
    VAR_OUTPUT: 'VAR_OUTPUT',
    VAR_INPUT: 'VAR_INPUT',
    VAR_TEMP: 'VAR_TEMP',
    VAR_GLOBAL: 'VAR_GLOBAL',
    VAR_IN_OUT: 'VAR_IN_OUT',
    CONSTANT: 'CONSTANT',
    FUNCTION_BLOCK: 'FUNCTION_BLOCK',
    END_FUNCTION_BLOCK: 'END_FUNCTION_BLOCK',
    TYPE: 'TYPE',
    END_TYPE: 'END_TYPE',
    STRUCT: 'STRUCT',
    END_STRUCT: 'END_STRUCT',

    // OOP Extensions (IEC 61131-3 3rd Edition)
    METHOD: 'METHOD',
    END_METHOD: 'END_METHOD',
    INTERFACE: 'INTERFACE',
    END_INTERFACE: 'END_INTERFACE',
    IMPLEMENTS: 'IMPLEMENTS',
    EXTENDS: 'EXTENDS',
    THIS: 'THIS',
    PUBLIC: 'PUBLIC',
    PRIVATE: 'PRIVATE',
    PROTECTED: 'PROTECTED',
    FINAL: 'FINAL',
    ABSTRACT: 'ABSTRACT',
    OVERRIDE: 'OVERRIDE',

    // Keywords - Control flow
    IF: 'IF',
    THEN: 'THEN',
    ELSE: 'ELSE',
    ELSIF: 'ELSIF',
    END_IF: 'END_IF',
    WHILE: 'WHILE',
    DO: 'DO',
    END_WHILE: 'END_WHILE',
    FOR: 'FOR',
    TO: 'TO',
    BY: 'BY',
    END_FOR: 'END_FOR',
    REPEAT: 'REPEAT',
    UNTIL: 'UNTIL',
    END_REPEAT: 'END_REPEAT',
    CASE: 'CASE',
    OF: 'OF',
    END_CASE: 'END_CASE',
    EXIT: 'EXIT',
    CONTINUE: 'CONTINUE',
    RETURN: 'RETURN',

    // Keywords - Types
    BOOL: 'BOOL',
    TIME: 'TIME',
    SINT: 'SINT',
    USINT: 'USINT',
    INT: 'INT',
    UINT: 'UINT',
    DINT: 'DINT',
    UDINT: 'UDINT',
    LINT: 'LINT',
    ULINT: 'ULINT',
    REAL: 'REAL',
    LREAL: 'LREAL',
    STRING: 'STRING',
    ARRAY: 'ARRAY',

    // Keywords - Function blocks
    TON: 'TON',
    TOF: 'TOF',
    TP: 'TP',
    R_TRIG: 'R_TRIG',
    F_TRIG: 'F_TRIG',
    RS: 'RS',
    SR: 'SR',
    CTU: 'CTU',
    CTD: 'CTD',
    CTUD: 'CTUD',
    BLINK: 'BLINK',
    PWM: 'PWM',
    PULSE: 'PULSE',

    // Keywords - Process Control Function blocks
    HYSTERESIS: 'HYSTERESIS',
    DEADBAND: 'DEADBAND',
    LAG_FILTER: 'LAG_FILTER',
    RAMP_REAL: 'RAMP_REAL',
    INTEGRAL: 'INTEGRAL',
    DERIVATIVE: 'DERIVATIVE',
    PID_Compact: 'PID_Compact',

    // Keywords - System Function blocks
    FIFO: 'FIFO',
    LIFO: 'LIFO',

    // Keywords - Literals
    TRUE: 'TRUE',
    FALSE: 'FALSE',

    // Keywords - Operators
    NOT: 'NOT',
    AND: 'AND',
    OR: 'OR',
    XOR: 'XOR',
    MOD: 'MOD',
    
    // Symbols
    ASSIGN: 'ASSIGN',           // :=
    COLON: 'COLON',             // :
    SEMICOLON: 'SEMICOLON',     // ;
    DOT: 'DOT',                 // .
    COMMA: 'COMMA',             // ,
    LPAREN: 'LPAREN',           // (
    RPAREN: 'RPAREN',           // )
    LBRACKET: 'LBRACKET',       // [
    RBRACKET: 'RBRACKET',       // ]
    LCURLY: 'LCURLY',           // {
    RCURLY: 'RCURLY',           // }
    DOTDOT: 'DOTDOT',           // ..
    AT: 'AT',                   // AT (for I/O mapping)
    
    // Pointers
    REF_TO: 'REF_TO',
    REF: 'REF',
    CARET: 'CARET',             // ^

    // Arithmetic operators
    PLUS: 'PLUS',               // +
    MINUS: 'MINUS',             // -
    STAR: 'STAR',               // *
    SLASH: 'SLASH',             // /

    // Comparison operators
    EQ: 'EQ',                   // =
    NE: 'NE',                   // <>
    LT: 'LT',                   // <
    LE: 'LE',                   // <=
    GT: 'GT',                   // >
    GE: 'GE',                   // >=

    // Literals and identifiers
    IDENTIFIER: 'IDENTIFIER',
    INTEGER: 'INTEGER',
    REAL_LITERAL: 'REAL_LITERAL',  // 3.14, 0.5, 100.0
    TIME_LITERAL: 'TIME_LITERAL',  // T#500ms, T#1s, etc.
    DATE_LITERAL: 'DATE_LITERAL',  // D#1990-01-01
    TOD_LITERAL: 'TOD_LITERAL',    // TOD#12:00:00
    DT_LITERAL: 'DT_LITERAL',      // DT#1990-01-01-12:00:00
    STRING_LITERAL: 'STRING_LITERAL',  // 'Hello World'
    WSTRING_LITERAL: 'WSTRING_LITERAL', // "Hello World"
    IO_ADDRESS: 'IO_ADDRESS',      // %Q0.0, %I0.0, etc.

    // Special
    EOF: 'EOF',
} as const;

export type TokenTypeValue = typeof TokenType[keyof typeof TokenType];

/**
 * A token from the lexer.
 */
export interface Token {
    type: TokenTypeValue;
    value: string;
    line: number;
    column: number;
}

/**
 * Lexer error with location information.
 */
export class LexerError extends Error {
    line: number;
    column: number;

    constructor(message: string, line: number, column: number) {
        super(`Lexer error at ${line}:${column}: ${message}`);
        this.name = 'LexerError';
        this.line = line;
        this.column = column;
    }
}

/**
 * Keywords lookup table (case-insensitive).
 */
const KEYWORDS: Record<string, TokenTypeValue> = {
    'PROGRAM': TokenType.PROGRAM,
    'END_PROGRAM': TokenType.END_PROGRAM,
    'FUNCTION': TokenType.FUNCTION,
    'END_FUNCTION': TokenType.END_FUNCTION,
    'VAR': TokenType.VAR,
    'END_VAR': TokenType.END_VAR,
    'VAR_OUTPUT': TokenType.VAR_OUTPUT,
    'VAR_INPUT': TokenType.VAR_INPUT,
    'VAR_TEMP': TokenType.VAR_TEMP,
    'VAR_GLOBAL': TokenType.VAR_GLOBAL,
    'VAR_IN_OUT': TokenType.VAR_IN_OUT,
    'CONSTANT': TokenType.CONSTANT,
    'FUNCTION_BLOCK': TokenType.FUNCTION_BLOCK,
    'END_FUNCTION_BLOCK': TokenType.END_FUNCTION_BLOCK,
    'TYPE': TokenType.TYPE,
    'END_TYPE': TokenType.END_TYPE,
    'STRUCT': TokenType.STRUCT,
    'END_STRUCT': TokenType.END_STRUCT,
    // OOP Extensions
    'METHOD': TokenType.METHOD,
    'END_METHOD': TokenType.END_METHOD,
    'INTERFACE': TokenType.INTERFACE,
    'END_INTERFACE': TokenType.END_INTERFACE,
    'IMPLEMENTS': TokenType.IMPLEMENTS,
    'EXTENDS': TokenType.EXTENDS,
    'THIS': TokenType.THIS,
    'PUBLIC': TokenType.PUBLIC,
    'PRIVATE': TokenType.PRIVATE,
    'PROTECTED': TokenType.PROTECTED,
    'FINAL': TokenType.FINAL,
    'ABSTRACT': TokenType.ABSTRACT,
    'OVERRIDE': TokenType.OVERRIDE,
    'IF': TokenType.IF,
    'THEN': TokenType.THEN,
    'ELSE': TokenType.ELSE,
    'ELSIF': TokenType.ELSIF,
    'END_IF': TokenType.END_IF,
    'WHILE': TokenType.WHILE,
    'DO': TokenType.DO,
    'END_WHILE': TokenType.END_WHILE,
    'FOR': TokenType.FOR,
    'TO': TokenType.TO,
    'BY': TokenType.BY,
    'END_FOR': TokenType.END_FOR,
    'REPEAT': TokenType.REPEAT,
    'UNTIL': TokenType.UNTIL,
    'END_REPEAT': TokenType.END_REPEAT,
    'CASE': TokenType.CASE,
    'OF': TokenType.OF,
    'END_CASE': TokenType.END_CASE,
    'EXIT': TokenType.EXIT,
    'CONTINUE': TokenType.CONTINUE,
    'RETURN': TokenType.RETURN,
    'BOOL': TokenType.BOOL,
    'TIME': TokenType.TIME,
    'SINT': TokenType.SINT,
    'USINT': TokenType.USINT,
    'INT': TokenType.INT,
    'UINT': TokenType.UINT,
    'DINT': TokenType.DINT,
    'UDINT': TokenType.UDINT,
    'LINT': TokenType.LINT,
    'ULINT': TokenType.ULINT,
    'REAL': TokenType.REAL,
    'LREAL': TokenType.LREAL,
    'STRING': TokenType.STRING,
    'ARRAY': TokenType.ARRAY,
    'TON': TokenType.TON,
    'TOF': TokenType.TOF,
    'TP': TokenType.TP,
    'R_TRIG': TokenType.R_TRIG,
    'F_TRIG': TokenType.F_TRIG,
    'RS': TokenType.RS,
    'SR': TokenType.SR,
    'CTU': TokenType.CTU,
    'CTD': TokenType.CTD,
    'CTUD': TokenType.CTUD,
    'BLINK': TokenType.BLINK,
    'PWM': TokenType.PWM,
    'PULSE': TokenType.PULSE,
    'HYSTERESIS': TokenType.HYSTERESIS,
    'DEADBAND': TokenType.DEADBAND,
    'LAG_FILTER': TokenType.LAG_FILTER,
    'RAMP_REAL': TokenType.RAMP_REAL,
    'INTEGRAL': TokenType.INTEGRAL,
    'DERIVATIVE': TokenType.DERIVATIVE,
    'PID_COMPACT': TokenType.PID_Compact,
    'FIFO': TokenType.FIFO,
    'LIFO': TokenType.LIFO,
    'TRUE': TokenType.TRUE,
    'FALSE': TokenType.FALSE,
    'NOT': TokenType.NOT,
    'AND': TokenType.AND,
    'OR': TokenType.OR,
    'XOR': TokenType.XOR,
    'MOD': TokenType.MOD,
    'AT': TokenType.AT,
    'REF_TO': TokenType.REF_TO,
    'REF': TokenType.REF,
};

/**
 * Tokenize Structured Text source code.
 *
 * @param source - ST source code
 * @returns Array of tokens
 * @throws LexerError on invalid input
 */
export function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let pos = 0;
    let line = 1;
    let column = 1;

    const current = (): string => source[pos] ?? '\0';
    const peek = (offset = 1): string => source[pos + offset] ?? '\0';
    const isAtEnd = (): boolean => pos >= source.length;

    const advance = (): string => {
        const ch = current();
        pos++;
        if (ch === '\n') {
            line++;
            column = 1;
        } else {
            column++;
        }
        return ch;
    };

    const skipWhitespace = (): void => {
        while (!isAtEnd()) {
            const ch = current();
            if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
                advance();
            } else if (ch === '(' && peek() === '*') {
                // ST block comment (* ... *)
                advance(); // (
                advance(); // *
                while (!isAtEnd()) {
                    if (current() === '*' && peek() === ')') {
                        advance(); // *
                        advance(); // )
                        break;
                    }
                    advance();
                }
            } else if (ch === '/' && peek() === '/') {
                // C-style line comment // ...
                while (!isAtEnd() && current() !== '\n') {
                    advance();
                }
            } else {
                break;
            }
        }
    };

    const readIdentifier = (): string => {
        let result = '';
        while (!isAtEnd() && (isAlphaNumeric(current()) || current() === '_')) {
            result += advance();
        }
        return result;
    };

    const readNumber = (): { value: string; isReal: boolean } => {
        let result = '';
        let isReal = false;

        // Handle hex: 0x...
        if (current() === '0' && (peek() === 'x' || peek() === 'X')) {
            result += advance(); // 0
            result += advance(); // x
            while (!isAtEnd() && isHexDigit(current())) {
                result += advance();
            }
            return { value: result, isReal: false };
        }

        // Integer part
        while (!isAtEnd() && isDigit(current())) {
            result += advance();
        }

        // Check for decimal point followed by a digit (REAL literal)
        if (current() === '.' && isDigit(peek())) {
            isReal = true;
            result += advance(); // .
            while (!isAtEnd() && isDigit(current())) {
                result += advance();
            }
        }

        // Optional exponent (e.g., 1.5e10, 2E-3)
        if (current() === 'e' || current() === 'E') {
            const nextChar = peek();
            if (isDigit(nextChar) || nextChar === '+' || nextChar === '-') {
                isReal = true;
                result += advance(); // e or E
                if (current() === '+' || current() === '-') {
                    result += advance(); // sign
                }
                while (!isAtEnd() && isDigit(current())) {
                    result += advance();
                }
            }
        }

        return { value: result, isReal };
    };

    const readTimeLiteral = (): string => {
        // Expecting T#...
        let result = advance(); // T
        if (current() !== '#') {
            throw new LexerError(`Expected '#' after 'T' in time literal`, line, column);
        }
        result += advance(); // #

        // Read the time value: digits + unit (ms, s, m, h, d)
        while (!isAtEnd() && (isAlphaNumeric(current()) || current() === '_')) {
            result += advance();
        }
        return result;
    };

    const readIOAddress = (): string => {
        // Expecting %Qx.y or %Ix.y
        let result = advance(); // %
        while (!isAtEnd() && (isAlphaNumeric(current()) || current() === '.')) {
            result += advance();
        }
        return result;
    };

    const readStringLiteral = (): string => {
        // Expecting 'string content'
        advance(); // consume opening quote
        let result = '';
        while (!isAtEnd()) {
            if (current() === '\n') {
                throw new LexerError('Unterminated string literal (newline in string)', line, column);
            }
            // Handle escape sequences: '' for single quote
            if (current() === "'") {
                if (peek() === "'") {
                    // Escaped quote: '' becomes '
                    result += "'";
                    advance(); // consume first '
                    advance(); // consume second '
                } else {
                    // End of string
                    break;
                }
            } else {
                result += advance();
            }
        }
        if (isAtEnd()) {
            throw new LexerError('Unterminated string literal', line, column);
        }
        advance(); // consume closing quote
        return result;
    };

    const readWStringLiteral = (): string => {
        advance(); // consume opening quote "
        let result = '';
        while (!isAtEnd()) {
            if (current() === '\n') {
                throw new LexerError('Unterminated wstring literal (newline in string)', line, column);
            }
            if (current() === '"') {
                if (peek() === '"') {
                    result += '"';
                    advance(); advance();
                } else {
                    break;
                }
            } else {
                result += advance();
            }
        }
        if (isAtEnd()) throw new LexerError('Unterminated wstring literal', line, column);
        advance(); // consume closing quote
        return result;
    };

    const readTypedLiteralValue = (): string => {
        let result = '';
        while (!isAtEnd() && (isAlphaNumeric(current()) || current() === '_' || current() === '-' || current() === ':' || current() === '.')) {
            result += advance();
        }
        return result;
    };

    const addToken = (type: TokenTypeValue, value: string, startLine: number, startColumn: number): void => {
        tokens.push({ type, value, line: startLine, column: startColumn });
    };

    while (!isAtEnd()) {
        skipWhitespace();
        if (isAtEnd()) break;

        const startLine = line;
        const startColumn = column;
        const ch = current();

        // Single character tokens
        if (ch === ';') {
            advance();
            addToken(TokenType.SEMICOLON, ';', startLine, startColumn);
            continue;
        }
        if (ch === ',') {
            advance();
            addToken(TokenType.COMMA, ',', startLine, startColumn);
            continue;
        }
        if (ch === '.') {
            // Check for DOTDOT (..)
            if (peek() === '.') {
                advance();
                advance();
                addToken(TokenType.DOTDOT, '..', startLine, startColumn);
            } else {
                advance();
                addToken(TokenType.DOT, '.', startLine, startColumn);
            }
            continue;
        }
        if (ch === '[') {
            advance();
            addToken(TokenType.LBRACKET, '[', startLine, startColumn);
            continue;
        }
        if (ch === ']') {
            advance();
            addToken(TokenType.RBRACKET, ']', startLine, startColumn);
            continue;
        }
        if (ch === '{') {
            advance();
            addToken(TokenType.LCURLY, '{', startLine, startColumn);
            continue;
        }
        if (ch === '}') {
            advance();
            addToken(TokenType.RCURLY, '}', startLine, startColumn);
            continue;
        }
        if (ch === '(') {
            advance();
            addToken(TokenType.LPAREN, '(', startLine, startColumn);
            continue;
        }
        if (ch === ')') {
            advance();
            addToken(TokenType.RPAREN, ')', startLine, startColumn);
            continue;
        }
        if (ch === '^') {
            advance();
            addToken(TokenType.CARET, '^', startLine, startColumn);
            continue;
        }

        // Arithmetic operators
        if (ch === '+') {
            advance();
            addToken(TokenType.PLUS, '+', startLine, startColumn);
            continue;
        }
        if (ch === '-') {
            advance();
            addToken(TokenType.MINUS, '-', startLine, startColumn);
            continue;
        }
        if (ch === '*') {
            advance();
            addToken(TokenType.STAR, '*', startLine, startColumn);
            continue;
        }
        if (ch === '/') {
            advance();
            addToken(TokenType.SLASH, '/', startLine, startColumn);
            continue;
        }

        // Comparison operators
        if (ch === '=') {
            advance();
            addToken(TokenType.EQ, '=', startLine, startColumn);
            continue;
        }
        if (ch === '<') {
            advance();
            if (current() === '=') {
                advance();
                addToken(TokenType.LE, '<=', startLine, startColumn);
            } else if (current() === '>') {
                advance();
                addToken(TokenType.NE, '<>', startLine, startColumn);
            } else {
                addToken(TokenType.LT, '<', startLine, startColumn);
            }
            continue;
        }
        if (ch === '>') {
            advance();
            if (current() === '=') {
                advance();
                addToken(TokenType.GE, '>=', startLine, startColumn);
            } else {
                addToken(TokenType.GT, '>', startLine, startColumn);
            }
            continue;
        }

        // Two character tokens
        if (ch === ':') {
            advance();
            if (current() === '=') {
                advance();
                addToken(TokenType.ASSIGN, ':=', startLine, startColumn);
            } else {
                addToken(TokenType.COLON, ':', startLine, startColumn);
            }
            continue;
        }

        // I/O address
        if (ch === '%') {
            const addr = readIOAddress();
            addToken(TokenType.IO_ADDRESS, addr, startLine, startColumn);
            continue;
        }

        // Identifiers and keywords
        if (isAlpha(ch) || ch === '_') {
            const ident = readIdentifier();
            const upper = ident.toUpperCase();

            // Check for typed literals: prefix#value
            if (current() === '#') {
                advance(); // Consume #
                
                if (upper === 'T' || upper === 'TIME') {
                    const val = readTypedLiteralValue();
                    addToken(TokenType.TIME_LITERAL, val, startLine, startColumn);
                    continue;
                }
                
                if (upper === 'D' || upper === 'DATE') {
                    const val = readTypedLiteralValue();
                    addToken(TokenType.DATE_LITERAL, val, startLine, startColumn);
                    continue;
                }
                
                if (upper === 'TOD' || upper === 'TIME_OF_DAY') {
                    const val = readTypedLiteralValue();
                    addToken(TokenType.TOD_LITERAL, val, startLine, startColumn);
                    continue;
                }
                
                if (upper === 'DT' || upper === 'DATE_AND_TIME') {
                    const val = readTypedLiteralValue();
                    addToken(TokenType.DT_LITERAL, val, startLine, startColumn);
                    continue;
                }
                
                if (upper === 'STRING') {
                    if (current() === "'") {
                        const val = readStringLiteral();
                        addToken(TokenType.STRING_LITERAL, val, startLine, startColumn);
                        continue;
                    }
                }
                
                if (upper === 'WSTRING') {
                    if (current() === '"') {
                        const val = readWStringLiteral();
                        addToken(TokenType.WSTRING_LITERAL, val, startLine, startColumn);
                        continue;
                    }
                }
                
                throw new LexerError(`Unknown typed literal prefix '${ident}'`, line, column);
            }

            // Check for compound keywords like END_PROGRAM, END_VAR, END_IF
            if (upper === 'END') {
                skipWhitespace();
                if (current() === '_') {
                    const savedPos = pos;
                    const savedLine = line;
                    const savedColumn = column;
                    advance();
                    const suffix = readIdentifier().toUpperCase();
                    const compound = `END_${suffix}`;
                    if (compound in KEYWORDS) {
                        addToken(KEYWORDS[compound], compound, startLine, startColumn);
                        continue;
                    }
                    // Not a valid compound keyword, backtrack and treat as separate
                    // Actually, treating as separate tokens is safer if the user wrote "END_SOMETHING"
                    // But here we consumed the underscore and suffix.
                    // Let's just restore if not found? No, better logic:
                    // If it's END_PROGRAM, match it. If END_FOO (not keyword), it's an identifier.
                    
                    // The original code was simpler but risky. Let's keep it robust.
                    // Since I replaced the file, I'll stick to the original logic which worked fine.
                    // Oh wait, I am rewriting it now.
                    if (compound in KEYWORDS) {
                        addToken(KEYWORDS[compound], compound, startLine, startColumn);
                        continue;
                    } else {
                        // Backtrack to just after END
                        pos = savedPos;
                        line = savedLine;
                        column = savedColumn;
                        // Fall through to emit IDENTIFIER 'END'
                    }
                }
            }

            // Check for VAR_OUTPUT, VAR_INPUT
            if (upper === 'VAR') {
                const savedPos = pos;
                const savedLine = line;
                const savedColumn = column;
                skipWhitespace();
                if (current() === '_') {
                    advance();
                    const suffix = readIdentifier().toUpperCase();
                    const compound = `VAR_${suffix}`;
                    if (compound in KEYWORDS) {
                        addToken(KEYWORDS[compound], compound, startLine, startColumn);
                        continue;
                    }
                    // Not a valid compound, restore and emit VAR
                    pos = savedPos;
                    line = savedLine;
                    column = savedColumn;
                }
            }
            
            // Check REF_TO
            if (upper === 'REF') {
                const savedPos = pos;
                const savedLine = line;
                const savedColumn = column;
                skipWhitespace();
                if (current() === '_') {
                    advance();
                    const suffix = readIdentifier().toUpperCase();
                    if (suffix === 'TO') {
                        addToken(TokenType.REF_TO, 'REF_TO', startLine, startColumn);
                        continue;
                    }
                    // Backtrack
                    pos = savedPos;
                    line = savedLine;
                    column = savedColumn;
                }
            }

            // Check if it's a keyword
            if (upper in KEYWORDS) {
                addToken(KEYWORDS[upper], upper, startLine, startColumn);
            } else {
                addToken(TokenType.IDENTIFIER, ident, startLine, startColumn);
            }
            continue;
        }

        // Numbers (INTEGER or REAL_LITERAL)
        if (isDigit(ch)) {
            const { value, isReal } = readNumber();
            if (isReal) {
                addToken(TokenType.REAL_LITERAL, value, startLine, startColumn);
            } else {
                addToken(TokenType.INTEGER, value, startLine, startColumn);
            }
            continue;
        }

        // String literal 'Hello World'
        if (ch === "'") {
            const str = readStringLiteral();
            addToken(TokenType.STRING_LITERAL, str, startLine, startColumn);
            continue;
        }

        // WString literal "Hello World"
        if (ch === '"') {
            const str = readWStringLiteral();
            addToken(TokenType.WSTRING_LITERAL, str, startLine, startColumn);
            continue;
        }

        throw new LexerError(`Unexpected character: '${ch}'`, line, column);
    }

    // Add EOF token
    tokens.push({ type: TokenType.EOF, value: '', line, column });
    return tokens;
}

// ============================================================================
// Helper functions
// ============================================================================

function isAlpha(ch: string): boolean {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
}

function isDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9';
}

function isHexDigit(ch: string): boolean {
    return isDigit(ch) || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
}

function isAlphaNumeric(ch: string): boolean {
    return isAlpha(ch) || isDigit(ch);
}
