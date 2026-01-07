/**
 * ZPLC Structured Text Parser
 *
 * SPDX-License-Identifier: MIT
 *
 * Recursive descent parser for IEC 61131-3 Structured Text.
 * Converts token stream to AST.
 */

import { tokenize, TokenType } from './lexer.ts';
import type { Token, TokenTypeValue } from './lexer.ts';
import { DataType, VarSection, parseTimeLiteral, parseIOAddress } from './ast.ts';
import type {
    CompilationUnit,
    Program,
    VarBlock,
    VarDecl,
    Statement,
    Expression,
    IfStatement,
    ElsifClause,
    WhileStatement,
    ForStatement,
    RepeatStatement,
    CaseStatement,
    CaseBranch,
    ExitStatement,
    ContinueStatement,
    ReturnStatement,
    FBCallStatement,
    FBParameter,
    Identifier,
    MemberAccess,
    BoolLiteral,
    IntLiteral,
    RealLiteral,
    TimeLiteral,
    StringLiteral,
    UnaryExpr,
    FunctionCall,
    DataTypeValue,
    VarSectionValue,
    ArrayType,
    ArrayDimension,
    ArrayAccess,
    ArrayLiteral,
} from './ast.ts';

/**
 * Parser error with location information.
 */
export class ParseError extends Error {
    line: number;
    column: number;

    constructor(message: string, line: number, column: number) {
        super(`Parse error at ${line}:${column}: ${message}`);
        this.name = 'ParseError';
        this.line = line;
        this.column = column;
    }
}

/**
 * Parse ST source code to AST.
 *
 * @param source - ST source code
 * @returns Compilation unit with parsed programs
 */
export function parse(source: string): CompilationUnit {
    const tokens = tokenize(source);
    const parser = new Parser(tokens);
    return parser.parseCompilationUnit();
}

/**
 * Recursive descent parser for Structured Text.
 */
class Parser {
    private tokens: Token[];
    private pos = 0;

    constructor(tokens: Token[]) {
        this.tokens = tokens;
    }

    // ========================================================================
    // Utility methods
    // ========================================================================

    private current(): Token {
        return this.tokens[this.pos] ?? { type: TokenType.EOF, value: '', line: 0, column: 0 };
    }

    private isAtEnd(): boolean {
        return this.current().type === TokenType.EOF;
    }

    private check(type: TokenTypeValue): boolean {
        return this.current().type === type;
    }

    private match(...types: TokenTypeValue[]): boolean {
        for (const type of types) {
            if (this.check(type)) {
                this.advance();
                return true;
            }
        }
        return false;
    }

    private advance(): Token {
        if (!this.isAtEnd()) {
            this.pos++;
        }
        return this.tokens[this.pos - 1];
    }

    private expect(type: TokenTypeValue, message: string): Token {
        if (this.check(type)) {
            return this.advance();
        }
        const curr = this.current();
        throw new ParseError(`${message}, got ${curr.type} '${curr.value}'`, curr.line, curr.column);
    }

    private error(message: string): never {
        const curr = this.current();
        throw new ParseError(message, curr.line, curr.column);
    }

    // ========================================================================
    // Grammar rules
    // ========================================================================

    /**
     * compilation_unit := program*
     */
    parseCompilationUnit(): CompilationUnit {
        const programs: Program[] = [];
        const start = this.current();

        while (!this.isAtEnd()) {
            if (this.check(TokenType.PROGRAM)) {
                programs.push(this.parseProgram());
            } else {
                this.error(`Expected PROGRAM, got ${this.current().type}`);
            }
        }

        return {
            kind: 'CompilationUnit',
            programs,
            line: start.line,
            column: start.column,
        };
    }

    /**
     * program := PROGRAM identifier var_block* statement* END_PROGRAM
     */
    private parseProgram(): Program {
        const start = this.expect(TokenType.PROGRAM, 'Expected PROGRAM');
        const nameToken = this.expect(TokenType.IDENTIFIER, 'Expected program name');

        const varBlocks: VarBlock[] = [];
        while (this.check(TokenType.VAR) || this.check(TokenType.VAR_OUTPUT) || this.check(TokenType.VAR_INPUT)) {
            varBlocks.push(this.parseVarBlock());
        }

        const statements: Statement[] = [];
        while (!this.check(TokenType.END_PROGRAM) && !this.isAtEnd()) {
            statements.push(this.parseStatement());
        }

        this.expect(TokenType.END_PROGRAM, 'Expected END_PROGRAM');

        return {
            kind: 'Program',
            name: nameToken.value,
            varBlocks,
            statements,
            line: start.line,
            column: start.column,
        };
    }

    /**
     * var_block := (VAR | VAR_OUTPUT | VAR_INPUT) var_decl* END_VAR
     */
    private parseVarBlock(): VarBlock {
        const start = this.current();
        let section: VarSectionValue;

        if (this.match(TokenType.VAR)) {
            section = VarSection.VAR;
        } else if (this.match(TokenType.VAR_OUTPUT)) {
            section = VarSection.VAR_OUTPUT;
        } else if (this.match(TokenType.VAR_INPUT)) {
            section = VarSection.VAR_INPUT;
        } else {
            this.error('Expected VAR, VAR_OUTPUT, or VAR_INPUT');
        }

        const variables: VarDecl[] = [];
        while (!this.check(TokenType.END_VAR) && !this.isAtEnd()) {
            variables.push(this.parseVarDecl(section));
        }

        this.expect(TokenType.END_VAR, 'Expected END_VAR');

        return {
            kind: 'VarBlock',
            section,
            variables,
            line: start.line,
            column: start.column,
        };
    }

    /**
     * var_decl := identifier (AT io_address)? COLON type_name (:= expression)? SEMICOLON
     */
    private parseVarDecl(section: VarSectionValue): VarDecl {
        const start = this.current();
        const nameToken = this.expect(TokenType.IDENTIFIER, 'Expected variable name');

        // Optional AT for I/O mapping
        let ioAddress = null;
        if (this.match(TokenType.AT)) {
            const addrToken = this.expect(TokenType.IO_ADDRESS, 'Expected I/O address after AT');
            ioAddress = parseIOAddress(addrToken.value);
        }

        this.expect(TokenType.COLON, 'Expected : after variable name');

        const dataType = this.parseTypeName();

        // Optional initial value
        let initialValue: Expression | ArrayLiteral | null = null;
        if (this.match(TokenType.ASSIGN)) {
            // Check if it's an array literal initializer
            if (this.check(TokenType.LBRACKET)) {
                initialValue = this.parseArrayLiteral();
            } else {
                initialValue = this.parseExpression();
            }
        }

        this.expect(TokenType.SEMICOLON, 'Expected ; after variable declaration');

        return {
            kind: 'VarDecl',
            name: nameToken.value,
            dataType,
            initialValue,
            ioAddress,
            section,
            line: start.line,
            column: start.column,
        };
    }

    /**
     * type_name := BOOL | INT | DINT | REAL | TIME | TON | TOF | TP | ... | ARRAY [...] OF type_name
     */
    private parseTypeName(): DataTypeValue | ArrayType {
        // Check for ARRAY type
        if (this.check(TokenType.ARRAY)) {
            return this.parseArrayType();
        }

        const curr = this.current();

        if (this.match(TokenType.BOOL)) return DataType.BOOL;
        if (this.match(TokenType.INT)) return DataType.INT;
        if (this.match(TokenType.DINT)) return DataType.DINT;
        if (this.match(TokenType.REAL)) return DataType.REAL;
        if (this.match(TokenType.TIME)) return DataType.TIME;
        if (this.match(TokenType.STRING)) return DataType.STRING;
        // Timers
        if (this.match(TokenType.TON)) return DataType.TON;
        if (this.match(TokenType.TOF)) return DataType.TOF;
        if (this.match(TokenType.TP)) return DataType.TP;
        // Edge detectors and bistables
        if (this.match(TokenType.R_TRIG)) return DataType.R_TRIG;
        if (this.match(TokenType.F_TRIG)) return DataType.F_TRIG;
        if (this.match(TokenType.RS)) return DataType.RS;
        if (this.match(TokenType.SR)) return DataType.SR;
        // Counters
        if (this.match(TokenType.CTU)) return DataType.CTU;
        if (this.match(TokenType.CTD)) return DataType.CTD;
        if (this.match(TokenType.CTUD)) return DataType.CTUD;
        // Generators
        if (this.match(TokenType.BLINK)) return DataType.BLINK;
        if (this.match(TokenType.PWM)) return DataType.PWM;
        if (this.match(TokenType.PULSE)) return DataType.PULSE;
        // Process Control
        if (this.match(TokenType.HYSTERESIS)) return DataType.HYSTERESIS;
        if (this.match(TokenType.DEADBAND)) return DataType.DEADBAND;
        if (this.match(TokenType.LAG_FILTER)) return DataType.LAG_FILTER;
        if (this.match(TokenType.RAMP_REAL)) return DataType.RAMP_REAL;
        if (this.match(TokenType.INTEGRAL)) return DataType.INTEGRAL;
        if (this.match(TokenType.DERIVATIVE)) return DataType.DERIVATIVE;
        if (this.match(TokenType.PID_Compact)) return DataType.PID_Compact;
        // System Buffers
        if (this.match(TokenType.FIFO)) return DataType.FIFO;
        if (this.match(TokenType.LIFO)) return DataType.LIFO;

        this.error(`Expected type name, got ${curr.type}`);
    }

    /**
     * array_type := ARRAY '[' dimension (',' dimension)* ']' OF type_name
     * dimension := INTEGER '..' INTEGER
     */
    private parseArrayType(): ArrayType {
        const start = this.expect(TokenType.ARRAY, 'Expected ARRAY');
        this.expect(TokenType.LBRACKET, 'Expected [ after ARRAY');

        const dimensions: ArrayDimension[] = [];

        // Parse first dimension
        dimensions.push(this.parseArrayDimension());

        // Parse additional dimensions (comma-separated)
        while (this.match(TokenType.COMMA)) {
            if (dimensions.length >= 3) {
                this.error('Maximum 3 dimensions supported for arrays');
            }
            dimensions.push(this.parseArrayDimension());
        }

        this.expect(TokenType.RBRACKET, 'Expected ] after array dimensions');
        this.expect(TokenType.OF, 'Expected OF after array bounds');

        const elementType = this.parseTypeName();

        // Nested arrays not supported - use multi-dimensional
        if (typeof elementType === 'object' && 'kind' in elementType) {
            this.error('Nested arrays not supported, use multi-dimensional array syntax: ARRAY[a..b, c..d] OF TYPE');
        }

        return {
            kind: 'ArrayType',
            dimensions,
            elementType: elementType as DataTypeValue,
        };
    }

    /**
     * dimension := INTEGER '..' INTEGER
     */
    private parseArrayDimension(): ArrayDimension {
        const lowerToken = this.expect(TokenType.INTEGER, 'Expected lower bound integer');
        const lower = parseInt(lowerToken.value, 10);

        this.expect(TokenType.DOTDOT, 'Expected .. between array bounds');

        const upperToken = this.expect(TokenType.INTEGER, 'Expected upper bound integer');
        const upper = parseInt(upperToken.value, 10);

        if (upper < lower) {
            this.error(`Invalid array bounds: ${lower}..${upper} (upper must be >= lower)`);
        }

        return { lowerBound: lower, upperBound: upper };
    }

    /**
     * array_literal := '[' expression (',' expression)* ']'
     */
    private parseArrayLiteral(): ArrayLiteral {
        const start = this.expect(TokenType.LBRACKET, 'Expected [');
        const elements: (Expression | ArrayLiteral)[] = [];

        if (!this.check(TokenType.RBRACKET)) {
            // Check if first element is also a bracket (nested array)
            if (this.check(TokenType.LBRACKET)) {
                elements.push(this.parseArrayLiteral());
            } else {
                elements.push(this.parseExpression());
            }

            while (this.match(TokenType.COMMA)) {
                if (this.check(TokenType.LBRACKET)) {
                    elements.push(this.parseArrayLiteral());
                } else {
                    elements.push(this.parseExpression());
                }
            }
        }

        this.expect(TokenType.RBRACKET, 'Expected ] after array elements');

        return {
            kind: 'ArrayLiteral',
            elements,
            line: start.line,
            column: start.column,
        };
    }

    /**
     * statement := assignment | if_statement | while_statement | for_statement |
     *              repeat_statement | case_statement | exit_statement |
     *              continue_statement | return_statement | fb_call_statement
     */
    private parseStatement(): Statement {
        // Check for control flow statements
        if (this.check(TokenType.IF)) {
            return this.parseIfStatement();
        }
        if (this.check(TokenType.WHILE)) {
            return this.parseWhileStatement();
        }
        if (this.check(TokenType.FOR)) {
            return this.parseForStatement();
        }
        if (this.check(TokenType.REPEAT)) {
            return this.parseRepeatStatement();
        }
        if (this.check(TokenType.CASE)) {
            return this.parseCaseStatement();
        }
        if (this.check(TokenType.EXIT)) {
            return this.parseExitStatement();
        }
        if (this.check(TokenType.CONTINUE)) {
            return this.parseContinueStatement();
        }
        if (this.check(TokenType.RETURN)) {
            return this.parseReturnStatement();
        }

        // Must be identifier-based (assignment or FB call)
        if (!this.check(TokenType.IDENTIFIER)) {
            this.error(`Expected statement, got ${this.current().type}`);
        }

        const identToken = this.advance();
        const start = identToken;

        // Check what follows the identifier
        if (this.check(TokenType.LPAREN)) {
            // FB call: Timer(IN := TRUE, ...)
            return this.parseFBCallStatement(identToken, start);
        }

        if (this.check(TokenType.DOT)) {
            // Member assignment: Timer.IN := value
            this.advance(); // consume .
            const memberToken = this.expect(TokenType.IDENTIFIER, 'Expected member name after .');

            this.expect(TokenType.ASSIGN, 'Expected := after member access');
            const value = this.parseExpression();
            this.expect(TokenType.SEMICOLON, 'Expected ; after assignment');

            const target: MemberAccess = {
                kind: 'MemberAccess',
                object: { kind: 'Identifier', name: identToken.value, line: identToken.line, column: identToken.column },
                member: memberToken.value,
                line: identToken.line,
                column: identToken.column,
            };

            return {
                kind: 'Assignment',
                target,
                value,
                line: start.line,
                column: start.column,
            };
        }

        if (this.check(TokenType.LBRACKET)) {
            // Array element assignment: arr[i] := value or arr[i, j] := value
            return this.parseArrayAssignment(identToken, start);
        }

        if (this.check(TokenType.ASSIGN)) {
            // Simple assignment: x := value
            this.advance(); // consume :=
            const value = this.parseExpression();
            this.expect(TokenType.SEMICOLON, 'Expected ; after assignment');

            const target: Identifier = {
                kind: 'Identifier',
                name: identToken.value,
                line: identToken.line,
                column: identToken.column,
            };

            return {
                kind: 'Assignment',
                target,
                value,
                line: start.line,
                column: start.column,
            };
        }

        this.error(`Unexpected token ${this.current().type} after identifier`);
    }

    /**
     * array_assignment := identifier '[' expression (',' expression)* ']' ASSIGN expression SEMICOLON
     */
    private parseArrayAssignment(identToken: Token, start: Token): Statement {
        this.expect(TokenType.LBRACKET, 'Expected [');

        const indices: Expression[] = [];
        indices.push(this.parseExpression());

        while (this.match(TokenType.COMMA)) {
            if (indices.length >= 3) {
                this.error('Maximum 3 indices supported for array access');
            }
            indices.push(this.parseExpression());
        }

        this.expect(TokenType.RBRACKET, 'Expected ] after array indices');
        this.expect(TokenType.ASSIGN, 'Expected := after array access');

        const value = this.parseExpression();
        this.expect(TokenType.SEMICOLON, 'Expected ; after assignment');

        const target: ArrayAccess = {
            kind: 'ArrayAccess',
            array: {
                kind: 'Identifier',
                name: identToken.value,
                line: identToken.line,
                column: identToken.column,
            },
            indices,
            line: identToken.line,
            column: identToken.column,
        };

        return {
            kind: 'Assignment',
            target,
            value,
            line: start.line,
            column: start.column,
        };
    }

    /**
     * if_statement := IF expression THEN statement*
     *                 (ELSIF expression THEN statement*)*
     *                 (ELSE statement*)?
     *                 END_IF SEMICOLON?
     */
    private parseIfStatement(): IfStatement {
        const start = this.expect(TokenType.IF, 'Expected IF');
        const condition = this.parseExpression();
        this.expect(TokenType.THEN, 'Expected THEN after IF condition');

        const thenBranch: Statement[] = [];
        while (!this.check(TokenType.ELSIF) && !this.check(TokenType.ELSE) && !this.check(TokenType.END_IF) && !this.isAtEnd()) {
            thenBranch.push(this.parseStatement());
        }

        // Parse ELSIF branches
        const elsifBranches: ElsifClause[] = [];
        while (this.match(TokenType.ELSIF)) {
            const elsifCondition = this.parseExpression();
            this.expect(TokenType.THEN, 'Expected THEN after ELSIF condition');

            const elsifStatements: Statement[] = [];
            while (!this.check(TokenType.ELSIF) && !this.check(TokenType.ELSE) && !this.check(TokenType.END_IF) && !this.isAtEnd()) {
                elsifStatements.push(this.parseStatement());
            }

            elsifBranches.push({
                condition: elsifCondition,
                statements: elsifStatements,
            });
        }

        // Parse ELSE branch
        let elseBranch: Statement[] | null = null;
        if (this.match(TokenType.ELSE)) {
            elseBranch = [];
            while (!this.check(TokenType.END_IF) && !this.isAtEnd()) {
                elseBranch.push(this.parseStatement());
            }
        }

        this.expect(TokenType.END_IF, 'Expected END_IF');
        this.match(TokenType.SEMICOLON); // Optional semicolon

        return {
            kind: 'IfStatement',
            condition,
            thenBranch,
            elsifBranches,
            elseBranch,
            line: start.line,
            column: start.column,
        };
    }

    /**
     * while_statement := WHILE expression DO statement* END_WHILE SEMICOLON?
     */
    private parseWhileStatement(): WhileStatement {
        const start = this.expect(TokenType.WHILE, 'Expected WHILE');
        const condition = this.parseExpression();
        this.expect(TokenType.DO, 'Expected DO after WHILE condition');

        const body: Statement[] = [];
        while (!this.check(TokenType.END_WHILE) && !this.isAtEnd()) {
            body.push(this.parseStatement());
        }

        this.expect(TokenType.END_WHILE, 'Expected END_WHILE');
        this.match(TokenType.SEMICOLON); // Optional semicolon

        return {
            kind: 'WhileStatement',
            condition,
            body,
            line: start.line,
            column: start.column,
        };
    }

    /**
     * for_statement := FOR identifier := expression TO expression (BY expression)? DO
     *                  statement*
     *                  END_FOR SEMICOLON?
     */
    private parseForStatement(): ForStatement {
        const start = this.expect(TokenType.FOR, 'Expected FOR');
        const counterToken = this.expect(TokenType.IDENTIFIER, 'Expected loop counter variable');
        this.expect(TokenType.ASSIGN, 'Expected := after counter variable');
        const startExpr = this.parseExpression();
        this.expect(TokenType.TO, 'Expected TO after start value');
        const endExpr = this.parseExpression();

        // Optional BY clause
        let stepExpr: Expression | null = null;
        if (this.match(TokenType.BY)) {
            stepExpr = this.parseExpression();
        }

        this.expect(TokenType.DO, 'Expected DO after FOR header');

        const body: Statement[] = [];
        while (!this.check(TokenType.END_FOR) && !this.isAtEnd()) {
            body.push(this.parseStatement());
        }

        this.expect(TokenType.END_FOR, 'Expected END_FOR');
        this.match(TokenType.SEMICOLON); // Optional semicolon

        return {
            kind: 'ForStatement',
            counter: counterToken.value,
            start: startExpr,
            end: endExpr,
            step: stepExpr,
            body,
            line: start.line,
            column: start.column,
        };
    }

    /**
     * repeat_statement := REPEAT statement* UNTIL expression END_REPEAT SEMICOLON?
     */
    private parseRepeatStatement(): RepeatStatement {
        const start = this.expect(TokenType.REPEAT, 'Expected REPEAT');

        const body: Statement[] = [];
        while (!this.check(TokenType.UNTIL) && !this.isAtEnd()) {
            body.push(this.parseStatement());
        }

        this.expect(TokenType.UNTIL, 'Expected UNTIL');
        const condition = this.parseExpression();
        this.expect(TokenType.END_REPEAT, 'Expected END_REPEAT');
        this.match(TokenType.SEMICOLON); // Optional semicolon

        return {
            kind: 'RepeatStatement',
            body,
            condition,
            line: start.line,
            column: start.column,
        };
    }

    /**
     * case_statement := CASE expression OF
     *                   (case_branch)+
     *                   (ELSE statement*)?
     *                   END_CASE SEMICOLON?
     *
     * case_branch := (INTEGER | INTEGER..INTEGER) (, ...)* : statement*
     */
    private parseCaseStatement(): CaseStatement {
        const start = this.expect(TokenType.CASE, 'Expected CASE');
        const selector = this.parseExpression();
        this.expect(TokenType.OF, 'Expected OF after CASE selector');

        const branches: CaseBranch[] = [];

        // Parse case branches until we hit ELSE or END_CASE
        while (!this.check(TokenType.ELSE) && !this.check(TokenType.END_CASE) && !this.isAtEnd()) {
            const branch = this.parseCaseBranch();
            branches.push(branch);
        }

        // Parse ELSE branch
        let elseBranch: Statement[] | null = null;
        if (this.match(TokenType.ELSE)) {
            elseBranch = [];
            while (!this.check(TokenType.END_CASE) && !this.isAtEnd()) {
                elseBranch.push(this.parseStatement());
            }
        }

        this.expect(TokenType.END_CASE, 'Expected END_CASE');
        this.match(TokenType.SEMICOLON); // Optional semicolon

        return {
            kind: 'CaseStatement',
            selector,
            branches,
            elseBranch,
            line: start.line,
            column: start.column,
        };
    }

    /**
     * case_branch := value_list : statement*
     * value_list := value (, value)*
     * value := INTEGER | INTEGER..INTEGER
     */
    private parseCaseBranch(): CaseBranch {
        const values: (number | { start: number; end: number })[] = [];

        // Parse comma-separated list of values or ranges
        do {
            const valueToken = this.expect(TokenType.INTEGER, 'Expected integer value in CASE branch');
            const startValue = parseInt(valueToken.value, 10);

            // Check for range: value..value
            if (this.check(TokenType.DOT)) {
                this.advance(); // first .
                this.expect(TokenType.DOT, 'Expected .. for range');
                const endToken = this.expect(TokenType.INTEGER, 'Expected end of range');
                const endValue = parseInt(endToken.value, 10);
                values.push({ start: startValue, end: endValue });
            } else {
                values.push(startValue);
            }
        } while (this.match(TokenType.COMMA));

        this.expect(TokenType.COLON, 'Expected : after CASE values');

        const statements: Statement[] = [];
        // Parse statements until we see another case value, ELSE, or END_CASE
        while (!this.check(TokenType.INTEGER) && !this.check(TokenType.ELSE) && !this.check(TokenType.END_CASE) && !this.isAtEnd()) {
            statements.push(this.parseStatement());
        }

        return { values, statements };
    }

    /**
     * exit_statement := EXIT SEMICOLON
     */
    private parseExitStatement(): ExitStatement {
        const start = this.expect(TokenType.EXIT, 'Expected EXIT');
        this.expect(TokenType.SEMICOLON, 'Expected ; after EXIT');

        return {
            kind: 'ExitStatement',
            line: start.line,
            column: start.column,
        };
    }

    /**
     * continue_statement := CONTINUE SEMICOLON
     */
    private parseContinueStatement(): ContinueStatement {
        const start = this.expect(TokenType.CONTINUE, 'Expected CONTINUE');
        this.expect(TokenType.SEMICOLON, 'Expected ; after CONTINUE');

        return {
            kind: 'ContinueStatement',
            line: start.line,
            column: start.column,
        };
    }

    /**
     * return_statement := RETURN SEMICOLON
     */
    private parseReturnStatement(): ReturnStatement {
        const start = this.expect(TokenType.RETURN, 'Expected RETURN');
        this.expect(TokenType.SEMICOLON, 'Expected ; after RETURN');

        return {
            kind: 'ReturnStatement',
            line: start.line,
            column: start.column,
        };
    }

    /**
     * fb_call_statement := identifier LPAREN (parameter (COMMA parameter)*)? RPAREN SEMICOLON
     */
    private parseFBCallStatement(identToken: Token, start: Token): FBCallStatement {
        this.expect(TokenType.LPAREN, 'Expected ( after function block name');

        const parameters: FBParameter[] = [];
        if (!this.check(TokenType.RPAREN)) {
            do {
                const param = this.parseFBParameter();
                parameters.push(param);
            } while (this.match(TokenType.COMMA));
        }

        this.expect(TokenType.RPAREN, 'Expected ) after parameters');
        this.expect(TokenType.SEMICOLON, 'Expected ; after function block call');

        return {
            kind: 'FBCallStatement',
            fbName: identToken.value,
            parameters,
            line: start.line,
            column: start.column,
        };
    }

    /**
     * parameter := identifier ASSIGN expression
     */
    private parseFBParameter(): FBParameter {
        const nameToken = this.expect(TokenType.IDENTIFIER, 'Expected parameter name');
        this.expect(TokenType.ASSIGN, 'Expected := after parameter name');
        const value = this.parseExpression();

        return {
            name: nameToken.value,
            value,
        };
    }

    // ========================================================================
    // Expression parsing (precedence climbing)
    // Precedence (lowest to highest):
    //   OR
    //   XOR
    //   AND
    //   comparison (=, <>, <, <=, >, >=)
    //   additive (+, -)
    //   multiplicative (*, /, MOD)
    //   unary (NOT, -)
    //   primary
    // ========================================================================

    /**
     * expression := or_expr
     */
    private parseExpression(): Expression {
        return this.parseOrExpr();
    }

    /**
     * or_expr := xor_expr (OR xor_expr)*
     */
    private parseOrExpr(): Expression {
        let left = this.parseXorExpr();

        while (this.match(TokenType.OR)) {
            const right = this.parseXorExpr();
            left = {
                kind: 'BinaryExpr',
                operator: 'OR',
                left,
                right,
                line: left.line,
                column: left.column,
            };
        }

        return left;
    }

    /**
     * xor_expr := and_expr (XOR and_expr)*
     */
    private parseXorExpr(): Expression {
        let left = this.parseAndExpr();

        while (this.match(TokenType.XOR)) {
            const right = this.parseAndExpr();
            left = {
                kind: 'BinaryExpr',
                operator: 'XOR',
                left,
                right,
                line: left.line,
                column: left.column,
            };
        }

        return left;
    }

    /**
     * and_expr := comparison_expr (AND comparison_expr)*
     */
    private parseAndExpr(): Expression {
        let left = this.parseComparisonExpr();

        while (this.match(TokenType.AND)) {
            const right = this.parseComparisonExpr();
            left = {
                kind: 'BinaryExpr',
                operator: 'AND',
                left,
                right,
                line: left.line,
                column: left.column,
            };
        }

        return left;
    }

    /**
     * comparison_expr := additive_expr ((= | <> | < | <= | > | >=) additive_expr)?
     */
    private parseComparisonExpr(): Expression {
        let left = this.parseAdditiveExpr();

        // Comparison operators (non-associative, only one allowed)
        if (this.check(TokenType.EQ) || this.check(TokenType.NE) ||
            this.check(TokenType.LT) || this.check(TokenType.LE) ||
            this.check(TokenType.GT) || this.check(TokenType.GE)) {

            const opToken = this.advance();
            const right = this.parseAdditiveExpr();

            const opMap: Record<string, 'EQ' | 'NE' | 'LT' | 'LE' | 'GT' | 'GE'> = {
                '=': 'EQ',
                '<>': 'NE',
                '<': 'LT',
                '<=': 'LE',
                '>': 'GT',
                '>=': 'GE',
            };

            left = {
                kind: 'BinaryExpr',
                operator: opMap[opToken.value],
                left,
                right,
                line: left.line,
                column: left.column,
            };
        }

        return left;
    }

    /**
     * additive_expr := multiplicative_expr ((+ | -) multiplicative_expr)*
     */
    private parseAdditiveExpr(): Expression {
        let left = this.parseMultiplicativeExpr();

        while (this.check(TokenType.PLUS) || this.check(TokenType.MINUS)) {
            const opToken = this.advance();
            const right = this.parseMultiplicativeExpr();
            const operator = opToken.value === '+' ? 'ADD' : 'SUB';
            left = {
                kind: 'BinaryExpr',
                operator,
                left,
                right,
                line: left.line,
                column: left.column,
            };
        }

        return left;
    }

    /**
     * multiplicative_expr := unary_expr ((* | / | MOD) unary_expr)*
     */
    private parseMultiplicativeExpr(): Expression {
        let left = this.parseUnaryExpr();

        while (this.check(TokenType.STAR) || this.check(TokenType.SLASH) || this.check(TokenType.MOD)) {
            const opToken = this.advance();
            const right = this.parseUnaryExpr();

            let operator: 'MUL' | 'DIV' | 'MOD';
            if (opToken.value === '*') {
                operator = 'MUL';
            } else if (opToken.value === '/') {
                operator = 'DIV';
            } else {
                operator = 'MOD';
            }

            left = {
                kind: 'BinaryExpr',
                operator,
                left,
                right,
                line: left.line,
                column: left.column,
            };
        }

        return left;
    }

    /**
     * unary_expr := NOT unary_expr | - unary_expr | primary_expr
     */
    private parseUnaryExpr(): Expression {
        if (this.match(TokenType.NOT)) {
            const start = this.tokens[this.pos - 1];
            const operand = this.parseUnaryExpr();
            return {
                kind: 'UnaryExpr',
                operator: 'NOT',
                operand,
                line: start.line,
                column: start.column,
            } as UnaryExpr;
        }

        // Unary minus
        if (this.match(TokenType.MINUS)) {
            const start = this.tokens[this.pos - 1];
            const operand = this.parseUnaryExpr();
            return {
                kind: 'UnaryExpr',
                operator: 'NEG',
                operand,
                line: start.line,
                column: start.column,
            } as UnaryExpr;
        }

        return this.parsePrimaryExpr();
    }

    /**
     * primary_expr := TRUE | FALSE | INTEGER | TIME_LITERAL | identifier (. member)? | LPAREN expression RPAREN
     */
    private parsePrimaryExpr(): Expression {
        const curr = this.current();

        // Boolean literals
        if (this.match(TokenType.TRUE)) {
            return {
                kind: 'BoolLiteral',
                value: true,
                line: curr.line,
                column: curr.column,
            } as BoolLiteral;
        }

        if (this.match(TokenType.FALSE)) {
            return {
                kind: 'BoolLiteral',
                value: false,
                line: curr.line,
                column: curr.column,
            } as BoolLiteral;
        }

        // Integer literal
        if (this.match(TokenType.INTEGER)) {
            let value: number;
            if (curr.value.toLowerCase().startsWith('0x')) {
                value = parseInt(curr.value, 16);
            } else {
                value = parseInt(curr.value, 10);
            }
            return {
                kind: 'IntLiteral',
                value,
                line: curr.line,
                column: curr.column,
            } as IntLiteral;
        }

        // Real (floating-point) literal
        if (this.match(TokenType.REAL_LITERAL)) {
            return {
                kind: 'RealLiteral',
                value: parseFloat(curr.value),
                line: curr.line,
                column: curr.column,
            } as RealLiteral;
        }

        // Time literal
        if (this.match(TokenType.TIME_LITERAL)) {
            return {
                kind: 'TimeLiteral',
                valueMs: parseTimeLiteral(curr.value),
                rawValue: curr.value,
                line: curr.line,
                column: curr.column,
            } as TimeLiteral;
        }

        // String literal
        if (this.match(TokenType.STRING_LITERAL)) {
            return {
                kind: 'StringLiteral',
                value: curr.value,
                line: curr.line,
                column: curr.column,
            } as StringLiteral;
        }

        // Identifier, member access, or function call
        if (this.match(TokenType.IDENTIFIER)) {
            const ident: Identifier = {
                kind: 'Identifier',
                name: curr.value,
                line: curr.line,
                column: curr.column,
            };

            // Check for function call: IDENTIFIER(args)
            if (this.match(TokenType.LPAREN)) {
                const args: Expression[] = [];

                // Parse comma-separated arguments
                if (!this.check(TokenType.RPAREN)) {
                    args.push(this.parseExpression());
                    while (this.match(TokenType.COMMA)) {
                        args.push(this.parseExpression());
                    }
                }

                this.expect(TokenType.RPAREN, 'Expected ) after function arguments');

                return {
                    kind: 'FunctionCall',
                    name: curr.value,
                    args,
                    line: curr.line,
                    column: curr.column,
                } as FunctionCall;
            }

            // Check for member access
            if (this.match(TokenType.DOT)) {
                const memberToken = this.expect(TokenType.IDENTIFIER, 'Expected member name after .');
                return {
                    kind: 'MemberAccess',
                    object: ident,
                    member: memberToken.value,
                    line: curr.line,
                    column: curr.column,
                } as MemberAccess;
            }

            // Check for array access: IDENTIFIER[index]
            if (this.match(TokenType.LBRACKET)) {
                const indices: Expression[] = [];
                indices.push(this.parseExpression());

                while (this.match(TokenType.COMMA)) {
                    if (indices.length >= 3) {
                        this.error('Maximum 3 indices supported for array access');
                    }
                    indices.push(this.parseExpression());
                }

                this.expect(TokenType.RBRACKET, 'Expected ] after array indices');

                return {
                    kind: 'ArrayAccess',
                    array: ident,
                    indices,
                    line: curr.line,
                    column: curr.column,
                } as ArrayAccess;
            }

            return ident;
        }

        // Parenthesized expression
        if (this.match(TokenType.LPAREN)) {
            const expr = this.parseExpression();
            this.expect(TokenType.RPAREN, 'Expected ) after expression');
            return expr;
        }

        this.error(`Unexpected token in expression: ${curr.type} '${curr.value}'`);
    }
}
