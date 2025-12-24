/**
 * ZPLC Structured Text Lexer
 *
 * SPDX-License-Identifier: MIT
 *
 * Tokenizes IEC 61131-3 Structured Text source code.
 * Supports the subset needed for blinky.st:
 *   - PROGRAM/END_PROGRAM, VAR/END_VAR, VAR_OUTPUT
 *   - IF/THEN/END_IF
 *   - Types: BOOL, TIME, TON
 *   - Literals: TRUE, FALSE, T#500ms, integers
 *   - Operators: :=, NOT, .
 *   - I/O addresses: %Q0.0, %I0.0
 */

/**
 * Token types for Structured Text.
 */
export const TokenType = {
    // Keywords - Program structure
    PROGRAM: 'PROGRAM',
    END_PROGRAM: 'END_PROGRAM',
    VAR: 'VAR',
    END_VAR: 'END_VAR',
    VAR_OUTPUT: 'VAR_OUTPUT',
    VAR_INPUT: 'VAR_INPUT',

    // Keywords - Control flow
    IF: 'IF',
    THEN: 'THEN',
    ELSE: 'ELSE',
    ELSIF: 'ELSIF',
    END_IF: 'END_IF',

    // Keywords - Types
    BOOL: 'BOOL',
    TIME: 'TIME',
    INT: 'INT',
    DINT: 'DINT',
    REAL: 'REAL',

    // Keywords - Function blocks
    TON: 'TON',
    TOF: 'TOF',
    TP: 'TP',

    // Keywords - Literals
    TRUE: 'TRUE',
    FALSE: 'FALSE',

    // Keywords - Operators
    NOT: 'NOT',
    AND: 'AND',
    OR: 'OR',
    XOR: 'XOR',

    // Keywords - Arithmetic (MOD is a keyword in ST)
    MOD: 'MOD',

    // Symbols
    ASSIGN: 'ASSIGN',           // :=
    COLON: 'COLON',             // :
    SEMICOLON: 'SEMICOLON',     // ;
    DOT: 'DOT',                 // .
    COMMA: 'COMMA',             // ,
    LPAREN: 'LPAREN',           // (
    RPAREN: 'RPAREN',           // )
    AT: 'AT',                   // AT (for I/O mapping)

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
    TIME_LITERAL: 'TIME_LITERAL',  // T#500ms, T#1s, etc.
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
    'VAR': TokenType.VAR,
    'END_VAR': TokenType.END_VAR,
    'VAR_OUTPUT': TokenType.VAR_OUTPUT,
    'VAR_INPUT': TokenType.VAR_INPUT,
    'IF': TokenType.IF,
    'THEN': TokenType.THEN,
    'ELSE': TokenType.ELSE,
    'ELSIF': TokenType.ELSIF,
    'END_IF': TokenType.END_IF,
    'BOOL': TokenType.BOOL,
    'TIME': TokenType.TIME,
    'INT': TokenType.INT,
    'DINT': TokenType.DINT,
    'REAL': TokenType.REAL,
    'TON': TokenType.TON,
    'TOF': TokenType.TOF,
    'TP': TokenType.TP,
    'TRUE': TokenType.TRUE,
    'FALSE': TokenType.FALSE,
    'NOT': TokenType.NOT,
    'AND': TokenType.AND,
    'OR': TokenType.OR,
    'XOR': TokenType.XOR,
    'MOD': TokenType.MOD,
    'AT': TokenType.AT,
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

    const readNumber = (): string => {
        let result = '';
        // Handle hex: 0x...
        if (current() === '0' && (peek() === 'x' || peek() === 'X')) {
            result += advance(); // 0
            result += advance(); // x
            while (!isAtEnd() && isHexDigit(current())) {
                result += advance();
            }
        } else {
            while (!isAtEnd() && isDigit(current())) {
                result += advance();
            }
        }
        return result;
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
            advance();
            addToken(TokenType.DOT, '.', startLine, startColumn);
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

        // Time literal T#...
        if ((ch === 'T' || ch === 't') && peek() === '#') {
            const timeLit = readTimeLiteral();
            addToken(TokenType.TIME_LITERAL, timeLit, startLine, startColumn);
            continue;
        }

        // Identifiers and keywords
        if (isAlpha(ch) || ch === '_') {
            const ident = readIdentifier();
            const upper = ident.toUpperCase();

            // Check for compound keywords like END_PROGRAM, END_VAR, END_IF
            if (upper === 'END') {
                skipWhitespace();
                if (current() === '_') {
                    advance();
                    const suffix = readIdentifier().toUpperCase();
                    const compound = `END_${suffix}`;
                    if (compound in KEYWORDS) {
                        addToken(KEYWORDS[compound], compound, startLine, startColumn);
                        continue;
                    }
                    // Not a valid compound keyword, treat as two separate tokens
                    addToken(TokenType.IDENTIFIER, 'END', startLine, startColumn);
                    addToken(TokenType.IDENTIFIER, suffix, line, column);
                    continue;
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

            // Check if it's a keyword
            if (upper in KEYWORDS) {
                addToken(KEYWORDS[upper], upper, startLine, startColumn);
            } else {
                addToken(TokenType.IDENTIFIER, ident, startLine, startColumn);
            }
            continue;
        }

        // Numbers
        if (isDigit(ch)) {
            const num = readNumber();
            addToken(TokenType.INTEGER, num, startLine, startColumn);
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
