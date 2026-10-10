/**
 * ZPLC Structured Text Lexer
 *
 * SPDX-License-Identifier: MIT
 *
 * Tokenizes IEC 61131-3 Structured Text source code.
 */

import type { SyntaxIssue } from './diagnostics.ts';

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
    VAR_EXTERNAL: 'VAR_EXTERNAL',
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

    POWER: 'POWER',             // ** (exponentiation; `&` is lexed as AND)

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
    TYPED_LITERAL: 'TYPED_LITERAL', // INT#5, SINT#-3, WORD#16#FF, REAL#1.5, BOOL#1 (value is TYPE#text)

    // Special
    ERROR: 'ERROR',             // text the lexer could not read; its error is in the list of errors
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
    /** Position just after the last character of the token. */
    endLine: number;
    endColumn: number;
}

/**
 * Lexer error with location information.
 */
export class LexerError extends Error {
    line: number;
    column: number;
    /** Position just after the offending text. */
    endLine: number;
    endColumn: number;
    /** The message without the position prefix. */
    detail: string;
    /** Every lexical error of the source, in order; the thrown error is the first of them. */
    errors: SyntaxIssue[] = [this];

    constructor(message: string, line: number, column: number, endLine = line, endColumn = column + 1) {
        super(`Lexer error at ${line}:${column}: ${message}`);
        this.name = 'LexerError';
        this.detail = message;
        this.line = line;
        this.column = column;
        this.endLine = endLine;
        this.endColumn = endColumn;
    }
}

/** A construct the lexer accepts that IEC 61131-3 does not define (CMP-031: the `0x` form). */
export interface LexerWarning {
    message: string;
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
}

/** The tokens of a source and what went wrong reading it. */
export interface LexResult {
    tokens: Token[];
    errors: LexerError[];
    warnings: LexerWarning[];
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
    'VAR_EXTERNAL': TokenType.VAR_EXTERNAL,
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
    // The library function blocks (TON, CTU, PULSE, ...) are not reserved words (CMP-033):
    // the parser takes them as type names by their position in a declaration.
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
 * Elementary types that may prefix a numeric literal: `INT#5`, `WORD#16#FF`, `REAL#1.5`, `BOOL#1`.
 */
const TYPED_NUMERIC_PREFIXES = new Set([
    'BOOL', 'SINT', 'INT', 'DINT', 'LINT', 'USINT', 'UINT', 'UDINT', 'ULINT',
    'BYTE', 'WORD', 'DWORD', 'LWORD', 'REAL', 'LREAL',
]);

/** The number bases IEC 61131-3 writes with a `#`, and the digits each takes. */
const BASED_DIGITS: Record<string, { prefix: string; valid: (ch: string) => boolean }> = {
    '2': { prefix: '0b', valid: (ch) => ch === '0' || ch === '1' },
    '8': { prefix: '0o', valid: (ch) => ch >= '0' && ch <= '7' },
    '16': { prefix: '0x', valid: isHexDigit },
};

/**
 * Tokenize Structured Text source code, reporting every lexical error instead of stopping at the first.
 *
 * A character or literal the lexer cannot read becomes an ERROR token and the scan goes on after it,
 * so the parser can skip that statement without reporting a second, false error for it.
 *
 * @param source - ST source code
 */
export function tokenizeWithErrors(source: string): LexResult {
    const tokens: Token[] = [];
    const errors: LexerError[] = [];
    const warnings: LexerWarning[] = [];
    // a UTF-8 byte order mark is not part of the program and takes no column
    let pos = source.charCodeAt(0) === 0xFEFF ? 1 : 0;
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
        } else if (ch === '\r' && source[pos] !== '\n') {
            // a lone carriage return ends a line, as it does in the editor; CR LF is one line break
            line++;
            column = 1;
        } else {
            column++;
        }
        return ch;
    };

    /** An error that ends at the current position and starts at `startLine:startColumn`. */
    const error = (message: string, startLine: number, startColumn: number): LexerError =>
        new LexerError(message, startLine, startColumn, line, column);

    const skipWhitespace = (): void => {
        while (!isAtEnd()) {
            const ch = current();
            if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
                advance();
            } else if (ch === '(' && peek() === '*') {
                // ST block comment (* ... *)
                const openLine = line;
                const openColumn = column;
                advance(); // (
                advance(); // *
                let closed = false;
                while (!isAtEnd()) {
                    if (current() === '*' && peek() === ')') {
                        advance(); // *
                        advance(); // )
                        closed = true;
                        break;
                    }
                    advance();
                }
                if (!closed) {
                    // CMP-009: reported where the comment opens, not where the file ends
                    throw new LexerError('Unterminated comment: the comment opened by (* is never closed with *)', openLine, openColumn, openLine, openColumn + 2);
                }
            } else if (ch === '/' && peek() === '*') {
                // C-style block comment /* ... */
                const openLine = line;
                const openColumn = column;
                advance(); // /
                advance(); // *
                let closed = false;
                while (!isAtEnd()) {
                    if (current() === '*' && peek() === '/') {
                        advance(); // *
                        advance(); // /
                        closed = true;
                        break;
                    }
                    advance();
                }
                if (!closed) {
                    throw new LexerError('Unterminated comment: the comment opened by /* is never closed with */', openLine, openColumn, openLine, openColumn + 2);
                }
            } else if (ch === '/' && peek() === '/') {
                // C-style line comment // ...
                while (!isAtEnd() && current() !== '\n' && current() !== '\r') {
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

    /**
     * A run of digits, with a single `_` allowed between two digits (1_000, 16#FF_FF).
     * `startLine`/`startColumn` is where the literal starts, for the error of a misplaced separator.
     */
    const readDigits = (valid: (ch: string) => boolean, startLine: number, startColumn: number): string => {
        let result = '';
        while (!isAtEnd()) {
            const ch = current();
            if (valid(ch)) {
                result += advance();
            } else if (ch === '_' && result !== '') {
                advance();
                if (!valid(current())) {
                    throw error('A digit separator _ must stand between two digits', startLine, startColumn);
                }
            } else {
                break;
            }
        }
        return result;
    };

    /**
     * A number: `42`, `1_000`, `0xFF` (not IEC, with a warning), `2#1010`, `8#17`, `16#FF`, `1.5`, `2.5e-3`.
     * A based literal is returned as `0b...`, `0o...` or `0x...` and a decimal one without separators.
     */
    const readNumber = (): { value: string; isReal: boolean } => {
        const startLine = line;
        const startColumn = column;

        // 0x...: the form C uses; IEC 61131-3 writes 16#...
        if (current() === '0' && (peek() === 'x' || peek() === 'X')) {
            advance(); // 0
            advance(); // x
            const digits = readDigits(isHexDigit, startLine, startColumn);
            if (digits === '') {
                throw error('A hexadecimal literal needs at least one digit after 0x', startLine, startColumn);
            }
            warnings.push({
                message: `The hexadecimal literal 0x${digits} is not IEC 61131-3 syntax: write 16#${digits}`,
                line: startLine, column: startColumn, endLine: line, endColumn: column,
            });
            return { value: `0x${digits}`, isReal: false };
        }

        // Integer part
        const whole = readDigits(isDigit, startLine, startColumn);

        // Based literal: 2#1010, 8#17, 16#FF
        if (current() === '#') {
            const base = BASED_DIGITS[whole];
            advance(); // #
            if (!base) {
                throw error(`The number base ${whole}# is not supported: use 2#, 8# or 16#`, startLine, startColumn);
            }
            const digits = readDigits(base.valid, startLine, startColumn);
            if (digits === '') {
                throw error(`A base-${whole} literal needs at least one digit after ${whole}#`, startLine, startColumn);
            }
            if (isAlphaNumeric(current())) {
                const bad = advance();
                throw error(`The digit '${bad}' is not valid in a base-${whole} literal`, startLine, startColumn);
            }
            return { value: `${base.prefix}${digits}`, isReal: false };
        }

        let result = whole;
        let isReal = false;

        // Check for decimal point followed by a digit (REAL literal)
        if (current() === '.' && isDigit(peek())) {
            isReal = true;
            advance(); // .
            result += `.${readDigits(isDigit, startLine, startColumn)}`;
        }

        // Optional exponent (e.g., 1.5e10, 2E-3)
        if (current() === 'e' || current() === 'E') {
            const next = peek();
            if (isDigit(next) || ((next === '+' || next === '-') && isDigit(peek(2)))) {
                isReal = true;
                result += advance(); // e or E
                if (current() === '+' || current() === '-') {
                    result += advance(); // sign
                }
                result += readDigits(isDigit, startLine, startColumn);
            }
        }

        return { value: result, isReal };
    };

    const readIOAddress = (): string => {
        // Expecting %Qx.y or %Ix.y
        let result = advance(); // %
        while (!isAtEnd() && (isAlphaNumeric(current()) || current() === '.')) {
            result += advance();
        }
        return result;
    };

    const readStringLiteral = (startLine: number, startColumn: number): string => {
        // Expecting 'string content'
        advance(); // consume opening quote
        let result = '';
        while (!isAtEnd()) {
            if (current() === '\n' || current() === '\r') {
                throw error('Unterminated string literal (newline in string)', startLine, startColumn);
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
            throw error('Unterminated string literal', startLine, startColumn);
        }
        advance(); // consume closing quote
        return result;
    };

    const readWStringLiteral = (startLine: number, startColumn: number): string => {
        advance(); // consume opening quote "
        let result = '';
        while (!isAtEnd()) {
            if (current() === '\n' || current() === '\r') {
                throw error('Unterminated wstring literal (newline in string)', startLine, startColumn);
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
        if (isAtEnd()) throw error('Unterminated wstring literal', startLine, startColumn);
        advance(); // consume closing quote
        return result;
    };

    /**
     * The value of a TIME literal after `T#`: an optional sign, then components such as
     * `1h30m`, `1.5s` or `1h_30m`. A `-` anywhere else ends the literal, so `T#5s-T#3s` is a subtraction.
     */
    const readTimeLiteralValue = (): string => {
        let result = '';
        if (current() === '-' || current() === '+') {
            result += advance();
        }
        while (!isAtEnd()) {
            const ch = current();
            if (isAlphaNumeric(ch) || ch === '_') {
                result += advance();
            } else if (ch === '.' && isDigit(peek())) {
                result += advance();
            } else {
                break;
            }
        }
        return result;
    };

    const readTypedLiteralValue = (): string => {
        let result = '';
        while (!isAtEnd() && (isAlphaNumeric(current()) || current() === '_' || current() === '-' || current() === ':' || current() === '.')) {
            result += advance();
        }
        return result;
    };

    /**
     * The value of a typed numeric literal after `TYPE#`: a sign, then a decimal, based or real number
     * (`INT#-5`, `WORD#16#FF`, `REAL#1.5e3`), or TRUE or FALSE after `BOOL#`.
     */
    const readTypedNumericValue = (typeName: string, startLine: number, startColumn: number): string => {
        let sign = '';
        if (current() === '-' || current() === '+') {
            sign = advance() === '-' ? '-' : '';
        }
        if (typeName === 'BOOL' && isAlpha(current())) {
            const word = readIdentifier().toUpperCase();
            if (word !== 'TRUE' && word !== 'FALSE') {
                throw error(`Expected 0, 1, TRUE or FALSE after BOOL#, got '${word}'`, startLine, startColumn);
            }
            return word === 'TRUE' ? '1' : '0';
        }
        if (!isDigit(current())) {
            throw error(`Expected a number after ${typeName}#`, startLine, startColumn);
        }
        const number = readNumber();
        return `${sign}${number.value}`;
    };

    const addToken = (type: TokenTypeValue, value: string, startLine: number, startColumn: number): void => {
        tokens.push({ type, value, line: startLine, column: startColumn, endLine: line, endColumn: column });
    };

    /** A name followed (after white space) by `_`: the old spelling `END _IF` and `VAR _INPUT`. */
    const underscoreFollows = (): boolean => /^\s*_/.test(source.slice(pos, pos + 64));

    /** Scan one token (white space has been skipped); the lexer errors it throws are recovered by the caller. */
    const scanToken = (): void => {
        const startLine = line;
        const startColumn = column;
        const ch = current();

        // Single character tokens
        if (ch === ';') {
            advance();
            addToken(TokenType.SEMICOLON, ';', startLine, startColumn);
            return;
        }
        if (ch === ',') {
            advance();
            addToken(TokenType.COMMA, ',', startLine, startColumn);
            return;
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
            return;
        }
        if (ch === '[') {
            advance();
            addToken(TokenType.LBRACKET, '[', startLine, startColumn);
            return;
        }
        if (ch === ']') {
            advance();
            addToken(TokenType.RBRACKET, ']', startLine, startColumn);
            return;
        }
        if (ch === '{') {
            advance();
            addToken(TokenType.LCURLY, '{', startLine, startColumn);
            return;
        }
        if (ch === '}') {
            advance();
            addToken(TokenType.RCURLY, '}', startLine, startColumn);
            return;
        }
        if (ch === '(') {
            advance();
            addToken(TokenType.LPAREN, '(', startLine, startColumn);
            return;
        }
        if (ch === ')') {
            advance();
            addToken(TokenType.RPAREN, ')', startLine, startColumn);
            return;
        }
        if (ch === '^') {
            advance();
            addToken(TokenType.CARET, '^', startLine, startColumn);
            return;
        }

        // Arithmetic operators
        if (ch === '+') {
            advance();
            addToken(TokenType.PLUS, '+', startLine, startColumn);
            return;
        }
        if (ch === '-') {
            advance();
            addToken(TokenType.MINUS, '-', startLine, startColumn);
            return;
        }
        if (ch === '*') {
            advance();
            if (current() === '*') {
                advance();
                addToken(TokenType.POWER, '**', startLine, startColumn);
            } else {
                addToken(TokenType.STAR, '*', startLine, startColumn);
            }
            return;
        }
        if (ch === '/') {
            advance();
            addToken(TokenType.SLASH, '/', startLine, startColumn);
            return;
        }
        // `&` is AND (IEC 61131-3 gives both the same precedence)
        if (ch === '&') {
            advance();
            addToken(TokenType.AND, '&', startLine, startColumn);
            return;
        }

        // Comparison operators
        if (ch === '=') {
            advance();
            addToken(TokenType.EQ, '=', startLine, startColumn);
            return;
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
            return;
        }
        if (ch === '>') {
            advance();
            if (current() === '=') {
                advance();
                addToken(TokenType.GE, '>=', startLine, startColumn);
            } else {
                addToken(TokenType.GT, '>', startLine, startColumn);
            }
            return;
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
            return;
        }

        // I/O address
        if (ch === '%') {
            const addr = readIOAddress();
            addToken(TokenType.IO_ADDRESS, addr, startLine, startColumn);
            return;
        }

        // Identifiers and keywords
        if (isAlpha(ch) || ch === '_') {
            const ident = readIdentifier();
            const upper = ident.toUpperCase();

            // Check for typed literals: prefix#value
            if (current() === '#') {
                advance(); // Consume #

                if (upper === 'T' || upper === 'TIME') {
                    const val = readTimeLiteralValue();
                    addToken(TokenType.TIME_LITERAL, val, startLine, startColumn);
                    return;
                }

                // INT#5, WORD#16#FF, REAL#1.5, BOOL#1
                if (TYPED_NUMERIC_PREFIXES.has(upper) && (isDigit(current()) || current() === '-' || current() === '+' || (upper === 'BOOL' && isAlpha(current())))) {
                    const val = readTypedNumericValue(upper, startLine, startColumn);
                    addToken(TokenType.TYPED_LITERAL, `${upper}#${val}`, startLine, startColumn);
                    return;
                }

                if (upper === 'D' || upper === 'DATE') {
                    const val = readTypedLiteralValue();
                    addToken(TokenType.DATE_LITERAL, val, startLine, startColumn);
                    return;
                }

                if (upper === 'TOD' || upper === 'TIME_OF_DAY') {
                    const val = readTypedLiteralValue();
                    addToken(TokenType.TOD_LITERAL, val, startLine, startColumn);
                    return;
                }

                if (upper === 'DT' || upper === 'DATE_AND_TIME') {
                    const val = readTypedLiteralValue();
                    addToken(TokenType.DT_LITERAL, val, startLine, startColumn);
                    return;
                }

                if (upper === 'STRING') {
                    if (current() === "'") {
                        const val = readStringLiteral(startLine, startColumn);
                        addToken(TokenType.STRING_LITERAL, val, startLine, startColumn);
                        return;
                    }
                }

                if (upper === 'WSTRING') {
                    if (current() === '"') {
                        const val = readWStringLiteral(startLine, startColumn);
                        addToken(TokenType.WSTRING_LITERAL, val, startLine, startColumn);
                        return;
                    }
                }

                // Type#Value: the value of an enumeration written with its type (CMP-020); the
                // symbol table declares each value under that qualified name too.
                if (isAlpha(current()) || current() === '_') {
                    const value = readIdentifier();
                    addToken(TokenType.IDENTIFIER, `${ident}#${value}`, startLine, startColumn);
                    return;
                }

                throw error(`Unknown typed literal prefix '${ident}'`, startLine, startColumn);
            }

            // Compound keywords written with a space before the underscore: END _IF
            if (upper === 'END' && underscoreFollows()) {
                const savedPos = pos;
                const savedLine = line;
                const savedColumn = column;
                while (/\s/.test(current())) advance();
                advance(); // _
                const compound = `END_${readIdentifier().toUpperCase()}`;
                if (compound in KEYWORDS) {
                    addToken(KEYWORDS[compound], compound, startLine, startColumn);
                    return;
                }
                // Not a keyword: END is a name and the rest is read again
                pos = savedPos;
                line = savedLine;
                column = savedColumn;
            }

            // VAR _INPUT, VAR _OUTPUT
            if (upper === 'VAR' && underscoreFollows()) {
                const savedPos = pos;
                const savedLine = line;
                const savedColumn = column;
                while (/\s/.test(current())) advance();
                advance(); // _
                const compound = `VAR_${readIdentifier().toUpperCase()}`;
                if (compound in KEYWORDS) {
                    addToken(KEYWORDS[compound], compound, startLine, startColumn);
                    return;
                }
                pos = savedPos;
                line = savedLine;
                column = savedColumn;
            }

            // REF _TO
            if (upper === 'REF' && underscoreFollows()) {
                const savedPos = pos;
                const savedLine = line;
                const savedColumn = column;
                while (/\s/.test(current())) advance();
                advance(); // _
                if (readIdentifier().toUpperCase() === 'TO') {
                    addToken(TokenType.REF_TO, 'REF_TO', startLine, startColumn);
                    return;
                }
                pos = savedPos;
                line = savedLine;
                column = savedColumn;
            }

            // Check if it's a keyword
            if (upper in KEYWORDS) {
                addToken(KEYWORDS[upper], upper, startLine, startColumn);
            } else {
                addToken(TokenType.IDENTIFIER, ident, startLine, startColumn);
            }
            return;
        }

        // Numbers (INTEGER or REAL_LITERAL)
        if (isDigit(ch)) {
            const { value, isReal } = readNumber();
            addToken(isReal ? TokenType.REAL_LITERAL : TokenType.INTEGER, value, startLine, startColumn);
            return;
        }

        // String literal 'Hello World'
        if (ch === "'") {
            const str = readStringLiteral(startLine, startColumn);
            addToken(TokenType.STRING_LITERAL, str, startLine, startColumn);
            return;
        }

        // WString literal "Hello World"
        if (ch === '"') {
            const str = readWStringLiteral(startLine, startColumn);
            addToken(TokenType.WSTRING_LITERAL, str, startLine, startColumn);
            return;
        }

        advance();
        throw error(`Unexpected character: '${ch}'`, startLine, startColumn);
    };

    while (true) {
        const before = pos;
        try {
            skipWhitespace();
            if (isAtEnd()) break;
            scanToken();
        } catch (caught) {
            if (!(caught instanceof LexerError)) throw caught;
            errors.push(caught);
            // The text the error covers becomes one ERROR token; the scan goes on after it
            if (pos === before) advance();
            tokens.push({
                type: TokenType.ERROR,
                value: source.slice(before, pos).trim(),
                line: caught.line,
                column: caught.column,
                endLine: caught.endLine,
                endColumn: caught.endColumn,
            });
        }
    }

    // Add EOF token
    tokens.push({ type: TokenType.EOF, value: '', line, column, endLine: line, endColumn: column });
    return { tokens, errors, warnings };
}

/**
 * Tokenize Structured Text source code.
 *
 * @param source - ST source code
 * @returns Array of tokens
 * @throws LexerError on invalid input: the first error, with every error of the source in `errors`
 */
export function tokenize(source: string): Token[] {
    const { tokens, errors } = tokenizeWithErrors(source);
    if (errors.length > 0) {
        const first = errors[0]!;
        first.errors = errors;
        throw first;
    }
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
