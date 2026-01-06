/**
 * ZPLC Instruction List (IL) Parser
 *
 * SPDX-License-Identifier: MIT
 *
 * Parses IEC 61131-3 Instruction List source code into an AST.
 * The AST is then used by the IL-to-ST transpiler.
 */

import { tokenizeIL, ILLexerError, ILTokenType } from './lexer';
import type { ILToken, ILTokenTypeValue } from './lexer';

// =============================================================================
// AST Types
// =============================================================================

/**
 * IL Operator categories for semantic analysis
 */
export type ILOperatorCategory =
    | 'load'      // LD, LDN
    | 'store'     // ST, STN, S, R
    | 'logical'   // AND, ANDN, OR, ORN, XOR, XORN, NOT
    | 'arithmetic'// ADD, SUB, MUL, DIV, MOD, NEG
    | 'comparison'// GT, GE, EQ, NE, LT, LE
    | 'jump'      // JMP, JMPC, JMPCN
    | 'call'      // CAL, CALC, CALCN
    | 'return';   // RET, RETC, RETCN

/**
 * IL Operator type
 */
export type ILOperator =
    | 'LD' | 'LDN' | 'ST' | 'STN' | 'S' | 'R'
    | 'AND' | 'ANDN' | 'OR' | 'ORN' | 'XOR' | 'XORN' | 'NOT'
    | 'ADD' | 'SUB' | 'MUL' | 'DIV' | 'MOD' | 'NEG'
    | 'GT' | 'GE' | 'EQ' | 'NE' | 'LT' | 'LE'
    | 'JMP' | 'JMPC' | 'JMPCN'
    | 'CAL' | 'CALC' | 'CALCN'
    | 'RET' | 'RETC' | 'RETCN';

/**
 * Operand types in IL
 */
export interface ILOperand {
    type: 'identifier' | 'literal' | 'io_address' | 'member_access' | 'label_ref';
    value: string;
    /** For member access, the base variable */
    base?: string;
    /** For member access, the member name */
    member?: string;
    /** For literals, the data type */
    dataType?: 'BOOL' | 'INT' | 'REAL' | 'TIME' | 'STRING';
}

/**
 * Function block call parameter
 */
export interface ILFBParam {
    name: string;
    value: ILOperand;
}

/**
 * An IL instruction with optional label
 */
export interface ILInstruction {
    /** Optional label before this instruction */
    label?: string;
    /** The operator (LD, ST, AND, etc.) */
    operator: ILOperator;
    /** The operand (variable, literal, address) */
    operand?: ILOperand;
    /** Modifier: opening parenthesis for deferred evaluation */
    hasOpenParen?: boolean;
    /** Modifier: closing parenthesis for deferred evaluation */
    hasCloseParen?: boolean;
    /** For CAL: function block parameters */
    fbParams?: ILFBParam[];
    /** Source line number */
    line: number;
}

/**
 * Variable declaration
 */
export interface ILVarDecl {
    name: string;
    dataType: string;
    ioAddress?: string;
    initialValue?: string;
    isRetain?: boolean;
}

/**
 * Variable block (VAR, VAR_INPUT, etc.)
 */
export interface ILVarBlock {
    section: 'VAR' | 'VAR_INPUT' | 'VAR_OUTPUT' | 'VAR_IN_OUT' | 'VAR_TEMP';
    variables: ILVarDecl[];
}

/**
 * Complete IL Program AST
 */
export interface ILProgram {
    name: string;
    varBlocks: ILVarBlock[];
    instructions: ILInstruction[];
    /** All labels defined in the program */
    labels: Set<string>;
}

// =============================================================================
// Parser Error
// =============================================================================

export class ILParseError extends Error {
    line: number;
    column: number;

    constructor(message: string, line: number, column: number) {
        super(`IL Parse error at ${line}:${column}: ${message}`);
        this.name = 'ILParseError';
        this.line = line;
        this.column = column;
    }
}

// =============================================================================
// Operator Classification
// =============================================================================

const OPERATORS_REQUIRING_OPERAND = new Set<ILOperator>([
    'LD', 'LDN', 'ST', 'STN', 'S', 'R',
    'AND', 'ANDN', 'OR', 'ORN', 'XOR', 'XORN',
    'ADD', 'SUB', 'MUL', 'DIV', 'MOD',
    'GT', 'GE', 'EQ', 'NE', 'LT', 'LE',
    'JMP', 'JMPC', 'JMPCN',
    'CAL', 'CALC', 'CALCN',
]);

const OPERATORS_NO_OPERAND = new Set<ILOperator>([
    'NOT', 'NEG', 'RET', 'RETC', 'RETCN',
]);
void OPERATORS_NO_OPERAND; // Silence unused warning - reserved for future validation

function isILOperator(token: ILToken): boolean {
    const opTokens: ILTokenTypeValue[] = [
        ILTokenType.LD, ILTokenType.LDN, ILTokenType.ST, ILTokenType.STN,
        ILTokenType.S, ILTokenType.R,
        ILTokenType.AND, ILTokenType.ANDN, ILTokenType.OR, ILTokenType.ORN,
        ILTokenType.XOR, ILTokenType.XORN, ILTokenType.NOT,
        ILTokenType.ADD, ILTokenType.SUB, ILTokenType.MUL, ILTokenType.DIV,
        ILTokenType.MOD, ILTokenType.NEG,
        ILTokenType.GT, ILTokenType.GE, ILTokenType.EQ, ILTokenType.NE,
        ILTokenType.LT, ILTokenType.LE,
        ILTokenType.JMP, ILTokenType.JMPC, ILTokenType.JMPCN,
        ILTokenType.CAL, ILTokenType.CALC, ILTokenType.CALCN,
        ILTokenType.RET, ILTokenType.RETC, ILTokenType.RETCN,
    ];
    return opTokens.includes(token.type);
}

// =============================================================================
// Parser Implementation
// =============================================================================

export function parseIL(source: string): ILProgram {
    const tokens = tokenizeIL(source);
    let pos = 0;

    const current = (): ILToken => tokens[pos] ?? { type: ILTokenType.EOF, value: '', line: 0, column: 0 };
    const peek = (offset = 0): ILToken => tokens[pos + offset] ?? { type: ILTokenType.EOF, value: '', line: 0, column: 0 };
    const isAtEnd = (): boolean => current().type === ILTokenType.EOF;
    const advance = (): ILToken => tokens[pos++];
    const check = (type: ILTokenTypeValue): boolean => current().type === type;

    const expect = (type: ILTokenTypeValue, message: string): ILToken => {
        if (check(type)) {
            return advance();
        }
        const tok = current();
        throw new ILParseError(`${message}, got ${tok.type} '${tok.value}'`, tok.line, tok.column);
    };

    const match = (...types: ILTokenTypeValue[]): boolean => {
        if (types.includes(current().type)) {
            advance();
            return true;
        }
        return false;
    };

    // Parse data type
    const parseDataType = (): string => {
        const typeTokens: ILTokenTypeValue[] = [
            ILTokenType.BOOL, ILTokenType.BYTE, ILTokenType.WORD, ILTokenType.DWORD,
            ILTokenType.SINT, ILTokenType.INT, ILTokenType.DINT,
            ILTokenType.USINT, ILTokenType.UINT, ILTokenType.UDINT,
            ILTokenType.REAL, ILTokenType.LREAL, ILTokenType.TIME, ILTokenType.STRING,
            ILTokenType.TON, ILTokenType.TOF, ILTokenType.TP,
            ILTokenType.CTU, ILTokenType.CTD, ILTokenType.CTUD,
            ILTokenType.R_TRIG, ILTokenType.F_TRIG, ILTokenType.RS, ILTokenType.SR,
        ];
        if (typeTokens.includes(current().type)) {
            return advance().value;
        }
        // Could be a user-defined type
        if (check(ILTokenType.IDENTIFIER)) {
            return advance().value;
        }
        const tok = current();
        throw new ILParseError(`Expected data type`, tok.line, tok.column);
    };

    // Parse variable declaration
    const parseVarDecl = (): ILVarDecl => {
        const nameTok = expect(ILTokenType.IDENTIFIER, 'Expected variable name');

        let ioAddress: string | undefined;
        if (match(ILTokenType.AT)) {
            const addrTok = expect(ILTokenType.IO_ADDRESS, 'Expected I/O address after AT');
            ioAddress = addrTok.value;
        }

        expect(ILTokenType.COLON, 'Expected : after variable name');
        const dataType = parseDataType();

        let initialValue: string | undefined;
        if (match(ILTokenType.ASSIGN)) {
            // Parse initial value (simple for now)
            const valTok = current();
            if (valTok.type === ILTokenType.INTEGER ||
                valTok.type === ILTokenType.FLOAT ||
                valTok.type === ILTokenType.TIME_LITERAL ||
                valTok.type === ILTokenType.STRING_LITERAL ||
                valTok.type === ILTokenType.BOOL_TRUE ||
                valTok.type === ILTokenType.BOOL_FALSE) {
                initialValue = advance().value;
            } else if (valTok.type === ILTokenType.IDENTIFIER) {
                initialValue = advance().value;
            }
        }

        expect(ILTokenType.SEMICOLON, 'Expected ; after variable declaration');

        return { name: nameTok.value, dataType, ioAddress, initialValue };
    };

    // Parse variable block
    const parseVarBlock = (): ILVarBlock => {
        let section: ILVarBlock['section'] = 'VAR';
        if (match(ILTokenType.VAR)) section = 'VAR';
        else if (match(ILTokenType.VAR_INPUT)) section = 'VAR_INPUT';
        else if (match(ILTokenType.VAR_OUTPUT)) section = 'VAR_OUTPUT';
        else if (match(ILTokenType.VAR_IN_OUT)) section = 'VAR_IN_OUT';
        else if (match(ILTokenType.VAR_TEMP)) section = 'VAR_TEMP';

        const variables: ILVarDecl[] = [];

        while (!check(ILTokenType.END_VAR) && !isAtEnd()) {
            // Skip RETAIN keyword if present
            match(ILTokenType.RETAIN);
            variables.push(parseVarDecl());
        }

        expect(ILTokenType.END_VAR, 'Expected END_VAR');

        return { section, variables };
    };

    // Parse operand (variable, literal, address, member access)
    const parseOperand = (): ILOperand => {
        const tok = current();

        // I/O address
        if (tok.type === ILTokenType.IO_ADDRESS) {
            advance();
            return { type: 'io_address', value: tok.value };
        }

        // Literals
        if (tok.type === ILTokenType.INTEGER) {
            advance();
            return { type: 'literal', value: tok.value, dataType: 'INT' };
        }
        if (tok.type === ILTokenType.FLOAT) {
            advance();
            return { type: 'literal', value: tok.value, dataType: 'REAL' };
        }
        if (tok.type === ILTokenType.TIME_LITERAL) {
            advance();
            return { type: 'literal', value: tok.value, dataType: 'TIME' };
        }
        if (tok.type === ILTokenType.STRING_LITERAL) {
            advance();
            return { type: 'literal', value: `'${tok.value}'`, dataType: 'STRING' };
        }
        if (tok.type === ILTokenType.BOOL_TRUE) {
            advance();
            return { type: 'literal', value: 'TRUE', dataType: 'BOOL' };
        }
        if (tok.type === ILTokenType.BOOL_FALSE) {
            advance();
            return { type: 'literal', value: 'FALSE', dataType: 'BOOL' };
        }

        // Identifier (possibly with member access)
        if (tok.type === ILTokenType.IDENTIFIER) {
            const base = advance().value;

            // Check for member access (e.g., Timer.Q)
            if (check(ILTokenType.DOT)) {
                advance(); // consume .
                const memberTok = expect(ILTokenType.IDENTIFIER, 'Expected member name after .');
                return {
                    type: 'member_access',
                    value: `${base}.${memberTok.value}`,
                    base,
                    member: memberTok.value,
                };
            }

            return { type: 'identifier', value: base };
        }

        throw new ILParseError(`Expected operand, got ${tok.type} '${tok.value}'`, tok.line, tok.column);
    };

    // Parse FB call parameters: CAL FB( PT := T#500ms, IN := TRUE )
    const parseFBCallParams = (): ILFBParam[] => {
        const params: ILFBParam[] = [];

        if (!check(ILTokenType.LPAREN)) {
            return params;
        }
        advance(); // consume (

        while (!check(ILTokenType.RPAREN) && !isAtEnd()) {
            const nameTok = expect(ILTokenType.IDENTIFIER, 'Expected parameter name');
            expect(ILTokenType.ASSIGN, 'Expected := after parameter name');
            const value = parseOperand();

            params.push({ name: nameTok.value, value });

            if (!check(ILTokenType.RPAREN)) {
                // Allow comma or newline as separator
                match(ILTokenType.COMMA);
            }
        }

        expect(ILTokenType.RPAREN, 'Expected ) after FB parameters');
        return params;
    };

    // Parse a single instruction
    const parseInstruction = (): ILInstruction | null => {
        let label: string | undefined;

        // Check for label
        if (current().type === ILTokenType.LABEL) {
            label = advance().value;
        }

        // Check for operator
        if (!isILOperator(current())) {
            // If we have a label but no operator, that's valid (label-only line)
            if (label) {
                // Return a NOP-like instruction with just a label
                return {
                    label,
                    operator: 'LD' as ILOperator, // Placeholder, will be handled specially
                    line: peek(-1).line,
                };
            }
            return null;
        }

        const opTok = advance();
        const operator = opTok.value as ILOperator;
        const line = opTok.line;

        // Check for opening parenthesis modifier: AND(
        let hasOpenParen = false;
        if (check(ILTokenType.LPAREN) &&
            !['CAL', 'CALC', 'CALCN'].includes(operator)) {
            advance();
            hasOpenParen = true;
        }

        // Parse operand if required
        let operand: ILOperand | undefined;
        let fbParams: ILFBParam[] | undefined;

        if (OPERATORS_REQUIRING_OPERAND.has(operator)) {
            if (['CAL', 'CALC', 'CALCN'].includes(operator)) {
                // FB call: CAL FB_Name( params )
                const fbNameTok = expect(ILTokenType.IDENTIFIER, 'Expected function block name');
                operand = { type: 'identifier', value: fbNameTok.value };

                // Check for member access (shouldn't happen for CAL, but handle it)
                if (check(ILTokenType.DOT)) {
                    advance();
                    const memberTok = expect(ILTokenType.IDENTIFIER, 'Expected member name');
                    operand = {
                        type: 'member_access',
                        value: `${fbNameTok.value}.${memberTok.value}`,
                        base: fbNameTok.value,
                        member: memberTok.value,
                    };
                }

                fbParams = parseFBCallParams();
            } else if (['JMP', 'JMPC', 'JMPCN'].includes(operator)) {
                // Jump to label
                const labelTok = expect(ILTokenType.IDENTIFIER, 'Expected label name');
                operand = { type: 'label_ref', value: labelTok.value };
            } else {
                // Normal operand
                operand = parseOperand();
            }
        }

        // Check for closing parenthesis modifier
        let hasCloseParen = false;
        if (check(ILTokenType.RPAREN)) {
            advance();
            hasCloseParen = true;
        }

        return {
            label,
            operator,
            operand,
            hasOpenParen,
            hasCloseParen,
            fbParams,
            line,
        };
    };

    // Main parse function
    const parseProgram = (): ILProgram => {
        // Expect PROGRAM keyword
        expect(ILTokenType.PROGRAM, 'Expected PROGRAM');
        const nameTok = expect(ILTokenType.IDENTIFIER, 'Expected program name');

        const varBlocks: ILVarBlock[] = [];
        const instructions: ILInstruction[] = [];
        const labels = new Set<string>();

        // Parse variable blocks
        while (
            check(ILTokenType.VAR) ||
            check(ILTokenType.VAR_INPUT) ||
            check(ILTokenType.VAR_OUTPUT) ||
            check(ILTokenType.VAR_IN_OUT) ||
            check(ILTokenType.VAR_TEMP)
        ) {
            varBlocks.push(parseVarBlock());
        }

        // Parse instructions until END_PROGRAM
        while (!check(ILTokenType.END_PROGRAM) && !isAtEnd()) {
            const instr = parseInstruction();
            if (instr) {
                if (instr.label) {
                    labels.add(instr.label);
                }
                instructions.push(instr);
            }
        }

        expect(ILTokenType.END_PROGRAM, 'Expected END_PROGRAM');

        return {
            name: nameTok.value,
            varBlocks,
            instructions,
            labels,
        };
    };

    try {
        return parseProgram();
    } catch (e) {
        if (e instanceof ILLexerError) {
            throw new ILParseError(e.message, e.line, e.column);
        }
        throw e;
    }
}
