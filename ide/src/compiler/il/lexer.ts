/**
 * ZPLC Instruction List (IL) Lexer
 *
 * SPDX-License-Identifier: MIT
 *
 * Tokenizes IEC 61131-3 Instruction List source code.
 * IL is an assembly-like language with operators, operands, labels, and modifiers.
 */

// =============================================================================
// Token Types
// =============================================================================

export const ILTokenType = {
    // Program structure
    PROGRAM: 'PROGRAM',
    END_PROGRAM: 'END_PROGRAM',
    FUNCTION_BLOCK: 'FUNCTION_BLOCK',
    END_FUNCTION_BLOCK: 'END_FUNCTION_BLOCK',
    FUNCTION: 'FUNCTION',
    END_FUNCTION: 'END_FUNCTION',

    // Variable blocks
    VAR: 'VAR',
    VAR_INPUT: 'VAR_INPUT',
    VAR_OUTPUT: 'VAR_OUTPUT',
    VAR_IN_OUT: 'VAR_IN_OUT',
    VAR_TEMP: 'VAR_TEMP',
    END_VAR: 'END_VAR',
    AT: 'AT',
    RETAIN: 'RETAIN',

    // Data types
    BOOL: 'BOOL',
    BYTE: 'BYTE',
    WORD: 'WORD',
    DWORD: 'DWORD',
    SINT: 'SINT',
    INT: 'INT',
    DINT: 'DINT',
    USINT: 'USINT',
    UINT: 'UINT',
    UDINT: 'UDINT',
    REAL: 'REAL',
    LREAL: 'LREAL',
    TIME: 'TIME',
    STRING: 'STRING',

    // Function block types
    TON: 'TON',
    TOF: 'TOF',
    TP: 'TP',
    CTU: 'CTU',
    CTD: 'CTD',
    CTUD: 'CTUD',
    R_TRIG: 'R_TRIG',
    F_TRIG: 'F_TRIG',
    RS: 'RS',
    SR: 'SR',

    // IL Operators - Load/Store
    LD: 'LD',       // Load value to CR
    LDN: 'LDN',     // Load negated value to CR
    ST: 'ST',       // Store CR to variable
    STN: 'STN',     // Store negated CR to variable
    S: 'S',         // Set variable TRUE if CR is TRUE
    R: 'R',         // Reset variable FALSE if CR is TRUE

    // IL Operators - Logical
    AND: 'AND',
    ANDN: 'ANDN',
    OR: 'OR',
    ORN: 'ORN',
    XOR: 'XOR',
    XORN: 'XORN',
    NOT: 'NOT',

    // IL Operators - Arithmetic
    ADD: 'ADD',
    SUB: 'SUB',
    MUL: 'MUL',
    DIV: 'DIV',
    MOD: 'MOD',
    NEG: 'NEG',

    // IL Operators - Comparison
    GT: 'GT',
    GE: 'GE',
    EQ: 'EQ',
    NE: 'NE',
    LT: 'LT',
    LE: 'LE',

    // IL Operators - Control flow
    JMP: 'JMP',
    JMPC: 'JMPC',
    JMPCN: 'JMPCN',
    CAL: 'CAL',
    CALC: 'CALC',
    CALCN: 'CALCN',
    RET: 'RET',
    RETC: 'RETC',
    RETCN: 'RETCN',

    // Literals
    INTEGER: 'INTEGER',
    FLOAT: 'FLOAT',
    TIME_LITERAL: 'TIME_LITERAL',
    STRING_LITERAL: 'STRING_LITERAL',
    BOOL_TRUE: 'BOOL_TRUE',
    BOOL_FALSE: 'BOOL_FALSE',

    // Identifiers and addresses
    IDENTIFIER: 'IDENTIFIER',
    IO_ADDRESS: 'IO_ADDRESS',
    LABEL: 'LABEL',

    // Punctuation
    COLON: 'COLON',
    SEMICOLON: 'SEMICOLON',
    COMMA: 'COMMA',
    DOT: 'DOT',
    LPAREN: 'LPAREN',
    RPAREN: 'RPAREN',
    LBRACKET: 'LBRACKET',
    RBRACKET: 'RBRACKET',
    ASSIGN: 'ASSIGN',
    ARROW: 'ARROW',

    // Special
    NEWLINE: 'NEWLINE',
    COMMENT: 'COMMENT',
    EOF: 'EOF',
} as const;

export type ILTokenTypeValue = typeof ILTokenType[keyof typeof ILTokenType];

export interface ILToken {
    type: ILTokenTypeValue;
    value: string;
    line: number;
    column: number;
}

// =============================================================================
// Keywords Lookup
// =============================================================================

const KEYWORDS: Record<string, ILTokenTypeValue> = {
    // Program structure
    'PROGRAM': ILTokenType.PROGRAM,
    'END_PROGRAM': ILTokenType.END_PROGRAM,
    'FUNCTION_BLOCK': ILTokenType.FUNCTION_BLOCK,
    'END_FUNCTION_BLOCK': ILTokenType.END_FUNCTION_BLOCK,
    'FUNCTION': ILTokenType.FUNCTION,
    'END_FUNCTION': ILTokenType.END_FUNCTION,

    // Variable blocks
    'VAR': ILTokenType.VAR,
    'VAR_INPUT': ILTokenType.VAR_INPUT,
    'VAR_OUTPUT': ILTokenType.VAR_OUTPUT,
    'VAR_IN_OUT': ILTokenType.VAR_IN_OUT,
    'VAR_TEMP': ILTokenType.VAR_TEMP,
    'END_VAR': ILTokenType.END_VAR,
    'AT': ILTokenType.AT,
    'RETAIN': ILTokenType.RETAIN,

    // Data types
    'BOOL': ILTokenType.BOOL,
    'BYTE': ILTokenType.BYTE,
    'WORD': ILTokenType.WORD,
    'DWORD': ILTokenType.DWORD,
    'SINT': ILTokenType.SINT,
    'INT': ILTokenType.INT,
    'DINT': ILTokenType.DINT,
    'USINT': ILTokenType.USINT,
    'UINT': ILTokenType.UINT,
    'UDINT': ILTokenType.UDINT,
    'REAL': ILTokenType.REAL,
    'LREAL': ILTokenType.LREAL,
    'TIME': ILTokenType.TIME,
    'STRING': ILTokenType.STRING,

    // Function block types
    'TON': ILTokenType.TON,
    'TOF': ILTokenType.TOF,
    'TP': ILTokenType.TP,
    'CTU': ILTokenType.CTU,
    'CTD': ILTokenType.CTD,
    'CTUD': ILTokenType.CTUD,
    'R_TRIG': ILTokenType.R_TRIG,
    'F_TRIG': ILTokenType.F_TRIG,
    'RS': ILTokenType.RS,
    'SR': ILTokenType.SR,

    // IL Operators
    'LD': ILTokenType.LD,
    'LDN': ILTokenType.LDN,
    'ST': ILTokenType.ST,
    'STN': ILTokenType.STN,
    'S': ILTokenType.S,
    'R': ILTokenType.R,
    'AND': ILTokenType.AND,
    'ANDN': ILTokenType.ANDN,
    'OR': ILTokenType.OR,
    'ORN': ILTokenType.ORN,
    'XOR': ILTokenType.XOR,
    'XORN': ILTokenType.XORN,
    'NOT': ILTokenType.NOT,
    'ADD': ILTokenType.ADD,
    'SUB': ILTokenType.SUB,
    'MUL': ILTokenType.MUL,
    'DIV': ILTokenType.DIV,
    'MOD': ILTokenType.MOD,
    'NEG': ILTokenType.NEG,
    'GT': ILTokenType.GT,
    'GE': ILTokenType.GE,
    'EQ': ILTokenType.EQ,
    'NE': ILTokenType.NE,
    'LT': ILTokenType.LT,
    'LE': ILTokenType.LE,
    'JMP': ILTokenType.JMP,
    'JMPC': ILTokenType.JMPC,
    'JMPCN': ILTokenType.JMPCN,
    'CAL': ILTokenType.CAL,
    'CALC': ILTokenType.CALC,
    'CALCN': ILTokenType.CALCN,
    'RET': ILTokenType.RET,
    'RETC': ILTokenType.RETC,
    'RETCN': ILTokenType.RETCN,

    // Boolean literals
    'TRUE': ILTokenType.BOOL_TRUE,
    'FALSE': ILTokenType.BOOL_FALSE,
};

// =============================================================================
// Lexer Error
// =============================================================================

export class ILLexerError extends Error {
    line: number;
    column: number;

    constructor(message: string, line: number, column: number) {
        super(`IL Lexer error at ${line}:${column}: ${message}`);
        this.name = 'ILLexerError';
        this.line = line;
        this.column = column;
    }
}

// =============================================================================
// Lexer Implementation
// =============================================================================

export function tokenizeIL(source: string): ILToken[] {
    const tokens: ILToken[] = [];
    let pos = 0;
    let line = 1;
    let column = 1;

    const peek = (offset = 0): string => source[pos + offset] ?? '';
    const advance = (): string => {
        const ch = source[pos++];
        column++;
        return ch;
    };
    const isAtEnd = (): boolean => pos >= source.length;
    const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9';
    const isAlpha = (ch: string): boolean =>
        (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
    const isAlphaNumeric = (ch: string): boolean => isAlpha(ch) || isDigit(ch);

    const addToken = (type: ILTokenTypeValue, value: string, startColumn: number): void => {
        tokens.push({ type, value, line, column: startColumn });
    };

    const skipWhitespace = (): void => {
        while (!isAtEnd()) {
            const ch = peek();
            if (ch === ' ' || ch === '\t' || ch === '\r') {
                advance();
            } else if (ch === '\n') {
                advance();
                line++;
                column = 1;
            } else {
                break;
            }
        }
    };

    const skipComment = (): boolean => {
        // Block comment (* ... *)
        if (peek() === '(' && peek(1) === '*') {
            advance(); // (
            advance(); // *
            while (!isAtEnd()) {
                if (peek() === '*' && peek(1) === ')') {
                    advance(); // *
                    advance(); // )
                    return true;
                }
                if (peek() === '\n') {
                    line++;
                    column = 0;
                }
                advance();
            }
            throw new ILLexerError('Unterminated block comment', line, column);
        }
        // Line comment //
        if (peek() === '/' && peek(1) === '/') {
            while (!isAtEnd() && peek() !== '\n') {
                advance();
            }
            return true;
        }
        return false;
    };

    const readNumber = (): void => {
        const startColumn = column;
        let value = '';

        // Check for hex/binary prefix
        if (peek() === '1' && peek(1) === '6' && peek(2) === '#') {
            // Hex literal: 16#FF
            value += advance(); // 1
            value += advance(); // 6
            value += advance(); // #
            while (!isAtEnd() && /[0-9A-Fa-f]/.test(peek())) {
                value += advance();
            }
            addToken(ILTokenType.INTEGER, value, startColumn);
            return;
        }

        if (peek() === '2' && peek(1) === '#') {
            // Binary literal: 2#1010
            value += advance(); // 2
            value += advance(); // #
            while (!isAtEnd() && /[01]/.test(peek())) {
                value += advance();
            }
            addToken(ILTokenType.INTEGER, value, startColumn);
            return;
        }

        // Regular number
        while (!isAtEnd() && isDigit(peek())) {
            value += advance();
        }

        // Check for decimal
        if (peek() === '.' && isDigit(peek(1))) {
            value += advance(); // .
            while (!isAtEnd() && isDigit(peek())) {
                value += advance();
            }
            // Check for exponent
            if (peek().toLowerCase() === 'e') {
                value += advance();
                if (peek() === '+' || peek() === '-') {
                    value += advance();
                }
                while (!isAtEnd() && isDigit(peek())) {
                    value += advance();
                }
            }
            addToken(ILTokenType.FLOAT, value, startColumn);
        } else {
            addToken(ILTokenType.INTEGER, value, startColumn);
        }
    };

    const readTimeLiteral = (): void => {
        const startColumn = column;
        let value = 'T#';
        advance(); // T
        advance(); // #

        // Read time value: digits followed by unit(s)
        while (!isAtEnd()) {
            const ch = peek();
            if (isDigit(ch) || isAlpha(ch) || ch === '.' || ch === '_') {
                value += advance();
            } else {
                break;
            }
        }
        addToken(ILTokenType.TIME_LITERAL, value, startColumn);
    };

    const readIOAddress = (): void => {
        const startColumn = column;
        let value = '';
        value += advance(); // %

        // Read memory type (I, Q, M)
        if (/[IQMiqm]/.test(peek())) {
            value += advance();
        } else {
            throw new ILLexerError(`Invalid I/O address: expected I, Q, or M after %`, line, column);
        }

        // Read optional size (X, B, W, D, L)
        if (/[XBWDLxbwdl]/.test(peek())) {
            value += advance();
        }

        // Read address numbers
        while (!isAtEnd() && (isDigit(peek()) || peek() === '.')) {
            value += advance();
        }

        addToken(ILTokenType.IO_ADDRESS, value.toUpperCase(), startColumn);
    };

    const readIdentifierOrKeyword = (): void => {
        const startColumn = column;
        let value = '';

        while (!isAtEnd() && (isAlphaNumeric(peek()) || peek() === '_')) {
            value += advance();
        }

        const upper = value.toUpperCase();

        // Check if it's a label (identifier followed by :)
        // But NOT if it's a FB parameter assignment like PT :=
        if (peek() === ':' && peek(1) !== '=') {
            advance(); // consume :
            addToken(ILTokenType.LABEL, upper, startColumn);
            return;
        }

        // Check keywords
        const keyword = KEYWORDS[upper];
        if (keyword) {
            addToken(keyword, upper, startColumn);
        } else {
            addToken(ILTokenType.IDENTIFIER, value, startColumn);
        }
    };

    const readString = (): void => {
        const startColumn = column;
        const quote = advance(); // ' or "
        let value = '';

        while (!isAtEnd() && peek() !== quote) {
            if (peek() === '\n') {
                throw new ILLexerError('Unterminated string literal', line, column);
            }
            if (peek() === '$' && peek(1)) {
                // Escape sequence
                value += advance(); // $
                value += advance(); // escaped char
            } else {
                value += advance();
            }
        }

        if (isAtEnd()) {
            throw new ILLexerError('Unterminated string literal', line, column);
        }

        advance(); // Closing quote
        addToken(ILTokenType.STRING_LITERAL, value, startColumn);
    };

    // Main tokenization loop
    while (!isAtEnd()) {
        skipWhitespace();
        if (isAtEnd()) break;

        // Skip comments
        if (skipComment()) continue;

        skipWhitespace();
        if (isAtEnd()) break;

        const startColumn = column;
        const ch = peek();

        // I/O addresses
        if (ch === '%') {
            readIOAddress();
            continue;
        }

        // Time literals
        if ((ch === 'T' || ch === 't') && peek(1) === '#') {
            readTimeLiteral();
            continue;
        }

        // Numbers
        if (isDigit(ch)) {
            readNumber();
            continue;
        }

        // Strings
        if (ch === "'" || ch === '"') {
            readString();
            continue;
        }

        // Identifiers and keywords
        if (isAlpha(ch)) {
            readIdentifierOrKeyword();
            continue;
        }

        // Single/multi-character tokens
        switch (ch) {
            case ':':
                advance();
                if (peek() === '=') {
                    advance();
                    addToken(ILTokenType.ASSIGN, ':=', startColumn);
                } else {
                    addToken(ILTokenType.COLON, ':', startColumn);
                }
                break;
            case ';':
                advance();
                addToken(ILTokenType.SEMICOLON, ';', startColumn);
                break;
            case ',':
                advance();
                addToken(ILTokenType.COMMA, ',', startColumn);
                break;
            case '.':
                advance();
                addToken(ILTokenType.DOT, '.', startColumn);
                break;
            case '(':
                advance();
                addToken(ILTokenType.LPAREN, '(', startColumn);
                break;
            case ')':
                advance();
                addToken(ILTokenType.RPAREN, ')', startColumn);
                break;
            case '[':
                advance();
                addToken(ILTokenType.LBRACKET, '[', startColumn);
                break;
            case ']':
                advance();
                addToken(ILTokenType.RBRACKET, ']', startColumn);
                break;
            case '=':
                advance();
                if (peek() === '>') {
                    advance();
                    addToken(ILTokenType.ARROW, '=>', startColumn);
                } else {
                    // Standalone = not typically used in IL, treat as error
                    throw new ILLexerError(`Unexpected character: ${ch}`, line, column);
                }
                break;
            default:
                throw new ILLexerError(`Unexpected character: ${ch}`, line, startColumn);
        }
    }

    addToken(ILTokenType.EOF, '', column);
    return tokens;
}
