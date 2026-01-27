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
    Assignment,
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
    NamedArgument,
    FBCallStatement,
    Identifier,
    TypeDefinition,
    EnumDecl,
    EnumValue,
    StructDecl,
    // OOP Extensions
    InterfaceDecl,
    MethodDecl,
    AccessSpecifier,
    MethodCall,
    ThisExpr,
    StringLiteral,
    WStringLiteral,
    DateLiteral,
    TODLiteral,
    DTLiteral,
    BoolLiteral,
    IntLiteral,
    RealLiteral,
    TimeLiteral,
    UnaryExpr,
    BinaryExpr,
    FunctionCall,
    ArrayAccess,
    MemberAccess,
    DereferenceExpr,
    ReferenceExpr,
    ArrayLiteral,
    // Extended types
    GlobalVarBlock,
    FunctionDecl,
    FunctionBlockDecl,
    FBParameter,
    STDataType,
    ArrayType,
    ArrayDimension,
    DataTypeValue,
    VarSectionValue,
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

    private previous(): Token {
        return this.tokens[this.pos - 1];
    }

    private isAtEnd(): boolean {
        return this.current().type === TokenType.EOF;
    }

    private peek(offset = 1): Token {
        return this.tokens[this.pos + offset] ?? { type: TokenType.EOF, value: '', line: 0, column: 0 };
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
     * compilation_unit := (function | program | function_block | interface | type)*
     */
    parseCompilationUnit(): CompilationUnit {
        const globalVars: GlobalVarBlock[] = [];
        const functions: FunctionDecl[] = [];
        const programs: Program[] = [];
        const functionBlocks: FunctionBlockDecl[] = [];
        const typeDefinitions: TypeDefinition[] = [];
        const interfaces: InterfaceDecl[] = [];
        const start = this.current();

        while (!this.isAtEnd()) {
            if (this.check(TokenType.VAR_GLOBAL)) {
                globalVars.push(this.parseGlobalVarBlock());
            } else if (this.check(TokenType.FUNCTION)) {
                functions.push(this.parseFunctionDecl());
            } else if (this.check(TokenType.FUNCTION_BLOCK)) {
                functionBlocks.push(this.parseFunctionBlockDecl());
            } else if (this.check(TokenType.PROGRAM)) {
                programs.push(this.parseProgram());
            } else if (this.check(TokenType.TYPE)) {
                typeDefinitions.push(this.parseTypeDecl());
            } else if (this.check(TokenType.INTERFACE)) {
                interfaces.push(this.parseInterfaceDecl());
            } else {
                this.error(`Expected VAR_GLOBAL, FUNCTION, FUNCTION_BLOCK, PROGRAM, TYPE or INTERFACE, got ${this.current().type}`);
            }
        }

        return {
            kind: 'CompilationUnit',
            globalVars,
            functions,
            functionBlocks,
            programs,
            typeDefinitions,
            interfaces,
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
     * function_block_decl := FUNCTION_BLOCK identifier [EXTENDS base_fb] [IMPLEMENTS iface, ...]
     *                        var_block* method* statement* END_FUNCTION_BLOCK
     */
    private parseFunctionBlockDecl(): FunctionBlockDecl {
        const start = this.expect(TokenType.FUNCTION_BLOCK, 'Expected FUNCTION_BLOCK');
        const nameToken = this.expect(TokenType.IDENTIFIER, 'Expected function block name');

        // Parse optional EXTENDS clause
        let extendsName: string | null = null;
        if (this.match(TokenType.EXTENDS)) {
            extendsName = this.expect(TokenType.IDENTIFIER, 'Expected base FB name after EXTENDS').value;
        }

        // Parse optional IMPLEMENTS clause
        const implementsList: string[] = [];
        if (this.match(TokenType.IMPLEMENTS)) {
            implementsList.push(this.expect(TokenType.IDENTIFIER, 'Expected interface name').value);
            while (this.match(TokenType.COMMA)) {
                implementsList.push(this.expect(TokenType.IDENTIFIER, 'Expected interface name').value);
            }
        }

        const inputs: VarDecl[] = [];
        const outputs: VarDecl[] = [];
        const inouts: VarDecl[] = [];
        const locals: VarDecl[] = [];
        const methods: MethodDecl[] = [];

        // Parse variable blocks and methods
        while (
            this.check(TokenType.VAR) ||
            this.check(TokenType.VAR_INPUT) ||
            this.check(TokenType.VAR_OUTPUT) ||
            this.check(TokenType.VAR_IN_OUT) ||
            this.check(TokenType.VAR_TEMP) ||
            this.check(TokenType.METHOD)
        ) {
            // Check for method (starts with METHOD keyword)
            if (this.check(TokenType.METHOD)) {
                methods.push(this.parseMethodDecl());
            } else {
                const block = this.parseVarBlock();
                switch (block.section) {
                    case VarSection.VAR_INPUT:
                        inputs.push(...block.variables);
                        break;
                    case VarSection.VAR_OUTPUT:
                        outputs.push(...block.variables);
                        break;
                    case VarSection.VAR_IN_OUT:
                        inouts.push(...block.variables);
                        break;
                    case VarSection.VAR:
                    case VarSection.VAR_TEMP:
                        locals.push(...block.variables);
                        break;
                }
            }
        }

        // Parse body statements (legacy FB body, executed on call)
        const body: Statement[] = [];
        while (!this.check(TokenType.END_FUNCTION_BLOCK) && !this.isAtEnd()) {
            body.push(this.parseStatement());
        }

        this.expect(TokenType.END_FUNCTION_BLOCK, 'Expected END_FUNCTION_BLOCK');

        return {
            kind: 'FunctionBlockDecl',
            name: nameToken.value,
            extends: extendsName,
            implements: implementsList,
            inputs,
            outputs,
            inouts,
            locals,
            methods,
            body,
            line: start.line,
            column: start.column,
        };
    }

    /**
     * global_var_block := VAR_GLOBAL (CONSTANT)? var_decl* END_VAR
     */
    private parseTypeDecl(): TypeDefinition {
        const start = this.expect(TokenType.TYPE, "Expected 'TYPE'");
        const nameToken = this.expect(TokenType.IDENTIFIER, "Expected type name");

        // Handle optional colon (TYPE MotorData : STRUCT)
        if (this.match(TokenType.COLON)) {
            // just skip
        }

        if (this.check(TokenType.STRUCT)) {
            this.advance(); // consume STRUCT
            const members: VarDecl[] = [];
            while (!this.check(TokenType.END_STRUCT) && !this.isAtEnd()) {
                const memberNames: string[] = [];
                memberNames.push(this.expect(TokenType.IDENTIFIER, "Expected member name").value);
                while (this.match(TokenType.COMMA)) {
                    memberNames.push(this.expect(TokenType.IDENTIFIER, "Expected member name").value);
                }

                this.expect(TokenType.COLON, "Expected ':' after member name");
                const dataType = this.parseTypeName();

                let initialValue: Expression | ArrayLiteral | null = null;
                if (this.match(TokenType.ASSIGN)) {
                    initialValue = this.parseExpression() as any; 
                }

                this.expect(TokenType.SEMICOLON, "Expected ';' after member declaration");

                for (const mName of memberNames) {
                    members.push({
                        kind: 'VarDecl',
                        name: mName,
                        dataType,
                        initialValue,
                        ioAddress: null,
                        section: 'VAR', 
                        line: start.line,
                        column: start.column,
                    });
                }
            }

            this.expect(TokenType.END_STRUCT, "Expected 'END_STRUCT'");
            if (this.match(TokenType.SEMICOLON)) { }
            this.expect(TokenType.END_TYPE, "Expected 'END_TYPE'");

            return {
                kind: 'StructDecl',
                name: nameToken.value,
                members,
                line: start.line,
                column: start.column,
            };
        } else if (this.check(TokenType.LPAREN)) {
            // Enum declaration
            this.advance(); // consume (
            const values: EnumValue[] = [];
            let nextVal = 0;
            
            do {
                const enumName = this.expect(TokenType.IDENTIFIER, "Expected enum value name").value;
                let val = nextVal;
                
                if (this.match(TokenType.ASSIGN)) {
                    const lit = this.parseExpression(); 
                    if (lit.kind === 'IntLiteral') {
                        val = lit.value;
                    } else {
                        this.error("Enum value must be an integer literal");
                    }
                }
                
                values.push({ name: enumName, value: val });
                nextVal = val + 1;
            } while (this.match(TokenType.COMMA));
            
            this.expect(TokenType.RPAREN, "Expected ')' after enum values");
            if (this.match(TokenType.SEMICOLON)) { }
            this.expect(TokenType.END_TYPE, "Expected 'END_TYPE'");
            
            return {
                kind: 'EnumDecl',
                name: nameToken.value,
                baseType: 'INT',
                values,
                line: start.line,
                column: start.column
            };
        } else {
            this.error("Expected 'STRUCT' or '(' for type definition");
            // Unreachable
            return {} as any;
        }
    }

    /**
     * interface_decl := INTERFACE identifier [EXTENDS iface, ...] method_signature* END_INTERFACE
     */
    private parseInterfaceDecl(): InterfaceDecl {
        const start = this.expect(TokenType.INTERFACE, 'Expected INTERFACE');
        const nameToken = this.expect(TokenType.IDENTIFIER, 'Expected interface name');

        // Parse optional EXTENDS clause (multiple inheritance for interfaces)
        const extendsList: string[] = [];
        if (this.match(TokenType.EXTENDS)) {
            extendsList.push(this.expect(TokenType.IDENTIFIER, 'Expected base interface name').value);
            while (this.match(TokenType.COMMA)) {
                extendsList.push(this.expect(TokenType.IDENTIFIER, 'Expected base interface name').value);
            }
        }

        // Parse method signatures (abstract methods only)
        const methods: MethodDecl[] = [];
        while (!this.check(TokenType.END_INTERFACE) && !this.isAtEnd()) {
            if (this.check(TokenType.METHOD)) {
                methods.push(this.parseMethodDecl(true)); // isAbstract = true
            } else {
                this.error(`Expected METHOD in interface, got ${this.current().type}`);
            }
        }

        this.expect(TokenType.END_INTERFACE, 'Expected END_INTERFACE');

        return {
            kind: 'InterfaceDecl',
            name: nameToken.value,
            extends: extendsList,
            methods,
            line: start.line,
            column: start.column,
        };
    }

    /**
     * method_decl := METHOD [access] [FINAL|ABSTRACT|OVERRIDE] name [: return_type]
     *                var_block* statement* END_METHOD
     * 
     * Note: IEC 61131-3 syntax has METHOD before the access specifier
     * 
     * @param forceAbstract - If true (for interfaces), method has no body
     */
    private parseMethodDecl(forceAbstract: boolean = false): MethodDecl {
        const start = this.expect(TokenType.METHOD, 'Expected METHOD');

        // Parse optional access specifier (after METHOD keyword)
        let accessSpecifier: AccessSpecifier = 'PUBLIC';
        if (this.match(TokenType.PUBLIC)) {
            accessSpecifier = 'PUBLIC';
        } else if (this.match(TokenType.PRIVATE)) {
            accessSpecifier = 'PRIVATE';
        } else if (this.match(TokenType.PROTECTED)) {
            accessSpecifier = 'PROTECTED';
        }

        // Parse optional modifiers
        let isFinal = false;
        let isAbstract = forceAbstract;
        let isOverride = false;

        while (this.check(TokenType.FINAL) || this.check(TokenType.ABSTRACT) || this.check(TokenType.OVERRIDE)) {
            if (this.match(TokenType.FINAL)) {
                isFinal = true;
            } else if (this.match(TokenType.ABSTRACT)) {
                isAbstract = true;
            } else if (this.match(TokenType.OVERRIDE)) {
                isOverride = true;
            }
        }

        const nameToken = this.expect(TokenType.IDENTIFIER, 'Expected method name');

        // Parse optional return type
        let returnType: STDataType | null = null;
        if (this.match(TokenType.COLON)) {
            returnType = this.parseTypeName();
        }

        const inputs: VarDecl[] = [];
        const outputs: VarDecl[] = [];
        const locals: VarDecl[] = [];

        // Parse variable blocks
        while (
            this.check(TokenType.VAR) ||
            this.check(TokenType.VAR_INPUT) ||
            this.check(TokenType.VAR_OUTPUT) ||
            this.check(TokenType.VAR_TEMP)
        ) {
            const block = this.parseVarBlock();
            switch (block.section) {
                case VarSection.VAR_INPUT:
                    inputs.push(...block.variables);
                    break;
                case VarSection.VAR_OUTPUT:
                    outputs.push(...block.variables);
                    break;
                case VarSection.VAR:
                case VarSection.VAR_TEMP:
                    locals.push(...block.variables);
                    break;
            }
        }

        // Parse body (unless abstract)
        const body: Statement[] = [];
        if (!isAbstract) {
            while (!this.check(TokenType.END_METHOD) && !this.isAtEnd()) {
                body.push(this.parseStatement());
            }
        }

        this.expect(TokenType.END_METHOD, 'Expected END_METHOD');

        return {
            kind: 'MethodDecl',
            name: nameToken.value,
            returnType,
            accessSpecifier,
            isFinal,
            isAbstract,
            isOverride,
            inputs,
            outputs,
            locals,
            body,
            line: start.line,
            column: start.column,
        };
    }

    private parseGlobalVarBlock(): GlobalVarBlock {
        const start = this.expect(TokenType.VAR_GLOBAL, 'Expected VAR_GLOBAL');
        const isConstant = this.match(TokenType.CONSTANT);

        const variables: VarDecl[] = [];
        while (!this.check(TokenType.END_VAR) && !this.isAtEnd()) {
            variables.push(this.parseVarDecl(isConstant ? VarSection.VAR : VarSection.VAR_GLOBAL));
        }

        this.expect(TokenType.END_VAR, 'Expected END_VAR');

        return {
            kind: 'GlobalVarBlock',
            isConstant,
            variables,
            line: start.line,
            column: start.column,
        };
    }

    /**
     * function_decl := FUNCTION identifier COLON type_name var_block* statement* END_FUNCTION
     */
    private parseFunctionDecl(): FunctionDecl {
        const start = this.expect(TokenType.FUNCTION, 'Expected FUNCTION');
        const nameToken = this.expect(TokenType.IDENTIFIER, 'Expected function name');
        this.expect(TokenType.COLON, 'Expected : after function name');
        const returnType = this.parseTypeName();

        // Return type must be elementary, not array
        if (typeof returnType !== 'string') {
            this.error('Function return type must be an elementary type, not ARRAY');
        }

        const inputs: VarDecl[] = [];
        const locals: VarDecl[] = [];

        // Parse VAR_INPUT, VAR, and VAR_TEMP blocks
        while (this.check(TokenType.VAR) || this.check(TokenType.VAR_INPUT) || this.check(TokenType.VAR_TEMP)) {
            const block = this.parseVarBlock();
            if (block.section === VarSection.VAR_INPUT) {
                inputs.push(...block.variables);
            } else {
                locals.push(...block.variables);
            }
        }

        // Parse body statements
        const body: Statement[] = [];
        while (!this.check(TokenType.END_FUNCTION) && !this.isAtEnd()) {
            body.push(this.parseStatement());
        }

        this.expect(TokenType.END_FUNCTION, 'Expected END_FUNCTION');

        return {
            kind: 'FunctionDecl',
            name: nameToken.value,
            returnType: returnType as any,
            inputs,
            locals,
            body,
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
        } else if (this.match(TokenType.VAR_IN_OUT)) {
            section = VarSection.VAR_IN_OUT;
        } else if (this.match(TokenType.VAR_GLOBAL)) {
            section = VarSection.VAR_GLOBAL;
        } else if (this.match(TokenType.VAR_TEMP)) {
            section = VarSection.VAR_TEMP;
        } else {
            this.error('Expected VAR, VAR_OUTPUT, VAR_INPUT, VAR_IN_OUT, VAR_GLOBAL, or VAR_TEMP');
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
     * type_name := BOOL | ... | REF_TO type_name | ...
     */
    private parseTypeName(): STDataType | ArrayType {
        // Check for ARRAY type
        if (this.check(TokenType.ARRAY)) {
            return this.parseArrayType();
        }

        // Check for POINTER type
        if (this.match(TokenType.REF_TO)) {
            const baseType = this.parseTypeName();
            return {
                kind: 'PointerType',
                baseType
            };
        }

        // Elementary types
        if (this.match(TokenType.BOOL)) return DataType.BOOL;
        if (this.match(TokenType.SINT)) return DataType.SINT;
        if (this.match(TokenType.USINT)) return DataType.USINT;
        if (this.match(TokenType.INT)) return DataType.INT;
        if (this.match(TokenType.UINT)) return DataType.UINT;
        if (this.match(TokenType.DINT)) return DataType.DINT;
        if (this.match(TokenType.UDINT)) return DataType.UDINT;
        if (this.match(TokenType.LINT)) return DataType.LINT;
        if (this.match(TokenType.ULINT)) return DataType.ULINT;
        if (this.match(TokenType.REAL)) return DataType.REAL;
        if (this.match(TokenType.LREAL)) return DataType.LREAL;
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

        // User defined type (Struct or FB)
        if (this.check(TokenType.IDENTIFIER)) {
            const token = this.advance();
            return token.value;
        }

        this.error(`Expected type name, got ${this.current().type}`);
    }

    /**
     * array_type := ARRAY '[' dimension (',' dimension)* ']' OF type_name
     * dimension := INTEGER '..' INTEGER
     */
    private parseArrayType(): ArrayType {
        this.expect(TokenType.ARRAY, 'Expected ARRAY');
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

        // Must be identifier-based (assignment or FB call) or THIS-based
        if (!this.check(TokenType.IDENTIFIER) && !this.check(TokenType.THIS)) {
            this.error(`Expected statement, got ${this.current().type}`);
        }

        const startToken = this.current();

        // Special case: FB call with ( ) - only for identifiers, not THIS
        if (this.check(TokenType.IDENTIFIER) && this.peek().type === TokenType.LPAREN) {
            const ident = this.advance();
            return this.parseFBCallStatement(ident, startToken);
        }

        // Must be an assignment (possibly with nested access) or a method call statement
        const target = this.parsePrimaryExpr();

        // Check if this is a standalone method call (no assignment needed)
        if (target.kind === 'MethodCall') {
            this.expect(TokenType.SEMICOLON, 'Expected ; after method call');
            // Wrap the method call in an assignment to a dummy variable
            // Actually, we need a proper statement type for this
            // For now, treat it as an assignment to itself (result discarded)
            return {
                kind: 'Assignment',
                target: { kind: 'Identifier', name: '_', line: startToken.line, column: startToken.column } as Identifier,
                value: target,
                line: startToken.line,
                column: startToken.column,
            } as Assignment;
        }

        if (this.match(TokenType.ASSIGN)) {
            // Assignment: target := value;
            const value = this.parseExpression();
            this.expect(TokenType.SEMICOLON, 'Expected ; after assignment');

            return {
                kind: 'Assignment',
                target: target as any,
                value,
                line: startToken.line,
                column: startToken.column,
            } as Assignment;
        }

        this.error(`Expected := after assignment target, got ${this.current().type}`);
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
            const startToken = this.tokens[this.pos - 1];
            const operand = this.parseUnaryExpr();
            return {
                kind: 'UnaryExpr',
                operator: 'NOT',
                operand,
                line: startToken.line,
                column: startToken.column,
            } as UnaryExpr;
        }

        // Unary minus
        if (this.match(TokenType.MINUS)) {
            const startToken = this.tokens[this.pos - 1];
            const operand = this.parseUnaryExpr();
            return {
                kind: 'UnaryExpr',
                operator: 'NEG',
                operand,
                line: startToken.line,
                column: startToken.column,
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

        // WString literal
        if (this.match(TokenType.WSTRING_LITERAL)) {
            return {
                kind: 'WStringLiteral',
                value: curr.value,
                line: curr.line,
                column: curr.column,
            } as WStringLiteral;
        }

        // Date literal
        if (this.match(TokenType.DATE_LITERAL)) {
            return {
                kind: 'DateLiteral',
                value: curr.value,
                line: curr.line,
                column: curr.column,
            } as DateLiteral;
        }

        // TOD literal
        if (this.match(TokenType.TOD_LITERAL)) {
            return {
                kind: 'TODLiteral',
                value: curr.value,
                line: curr.line,
                column: curr.column,
            } as TODLiteral;
        }

        // DT literal
        if (this.match(TokenType.DT_LITERAL)) {
            return {
                kind: 'DTLiteral',
                value: curr.value,
                line: curr.line,
                column: curr.column,
            } as DTLiteral;
        }

        // Identifier, member access, array access, or function call
        if (this.match(TokenType.IDENTIFIER)) {
            const startToken = curr;

            // Check for function call: IDENTIFIER(args)
            // Function calls are currently only supported as top-level identifiers
            if (this.check(TokenType.LPAREN)) {
                this.advance(); // consume (
                const args: (Expression | NamedArgument)[] = [];

                // Parse comma-separated arguments
                if (!this.check(TokenType.RPAREN)) {
                    do {
                        if (this.check(TokenType.IDENTIFIER) && this.peek().type === TokenType.ASSIGN) {
                            const argNameToken = this.advance();
                            this.advance(); // consume :=
                            const argValue = this.parseExpression();
                            args.push({
                                kind: 'NamedArgument',
                                name: argNameToken.value,
                                value: argValue,
                                line: argNameToken.line,
                                column: argNameToken.column,
                            });
                        } else {
                            args.push(this.parseExpression());
                        }
                    } while (this.match(TokenType.COMMA));
                }

                this.expect(TokenType.RPAREN, 'Expected ) after function arguments');

                return {
                    kind: 'FunctionCall',
                    name: startToken.value,
                    args,
                    line: startToken.line,
                    column: startToken.column,
                } as FunctionCall;
            }

            // Normal identifier (could be start of member/array access/method call)
            let expr: Expression = {
                kind: 'Identifier',
                name: startToken.value,
                line: startToken.line,
                column: startToken.column,
            };

            // Parse suffixes recursively (.member, .method(), [indices], ^)
            while (true) {
                if (this.match(TokenType.DOT)) {
                    const memberToken = this.expect(TokenType.IDENTIFIER, 'Expected member name after .');
                    
                    // Check if this is a method call: instance.Method(args)
                    if (this.check(TokenType.LPAREN)) {
                        this.advance(); // consume (
                        const args: (Expression | NamedArgument)[] = [];
                        
                        // Parse comma-separated arguments
                        if (!this.check(TokenType.RPAREN)) {
                            do {
                                if (this.check(TokenType.IDENTIFIER) && this.peek().type === TokenType.ASSIGN) {
                                    const argNameToken = this.advance();
                                    this.advance(); // consume :=
                                    const argValue = this.parseExpression();
                                    args.push({
                                        kind: 'NamedArgument',
                                        name: argNameToken.value,
                                        value: argValue,
                                        line: argNameToken.line,
                                        column: argNameToken.column,
                                    });
                                } else {
                                    args.push(this.parseExpression());
                                }
                            } while (this.match(TokenType.COMMA));
                        }
                        
                        this.expect(TokenType.RPAREN, 'Expected ) after method arguments');
                        
                        expr = {
                            kind: 'MethodCall',
                            object: expr,
                            methodName: memberToken.value,
                            args,
                            line: startToken.line,
                            column: startToken.column,
                        } as MethodCall;
                    } else {
                        // Regular member access
                        expr = {
                            kind: 'MemberAccess',
                            object: expr,
                            member: memberToken.value,
                            line: startToken.line,
                            column: startToken.column,
                        } as MemberAccess;
                    }
                } else if (this.match(TokenType.LBRACKET)) {
                    const indices: Expression[] = [];
                    indices.push(this.parseExpression());

                    while (this.match(TokenType.COMMA)) {
                        if (indices.length >= 3) {
                            this.error('Maximum 3 indices supported for array access');
                        }
                        indices.push(this.parseExpression());
                    }

                    this.expect(TokenType.RBRACKET, 'Expected ] after array indices');

                    expr = {
                        kind: 'ArrayAccess',
                        array: expr,
                        indices,
                        line: startToken.line,
                        column: startToken.column,
                    } as ArrayAccess;
                } else if (this.match(TokenType.CARET)) {
                    // Dereference: ptr^
                    expr = {
                        kind: 'DereferenceExpr',
                        operand: expr,
                        line: startToken.line,
                        column: startToken.column
                    } as DereferenceExpr;
                } else {
                    break;
                }
            }
            return expr;
        }

        // THIS keyword (used inside methods)
        if (this.match(TokenType.THIS)) {
            let expr: Expression = {
                kind: 'ThisExpr',
                line: curr.line,
                column: curr.column,
            } as ThisExpr;
            
            // THIS can have suffixes: THIS.member, THIS.Method()
            while (true) {
                if (this.match(TokenType.DOT)) {
                    const memberToken = this.expect(TokenType.IDENTIFIER, 'Expected member name after THIS.');
                    
                    // Check if this is a method call: THIS.Method(args)
                    if (this.check(TokenType.LPAREN)) {
                        this.advance(); // consume (
                        const args: Expression[] = [];
                        
                        if (!this.check(TokenType.RPAREN)) {
                            args.push(this.parseExpression());
                            while (this.match(TokenType.COMMA)) {
                                args.push(this.parseExpression());
                            }
                        }
                        
                        this.expect(TokenType.RPAREN, 'Expected ) after method arguments');
                        
                        expr = {
                            kind: 'MethodCall',
                            object: expr,
                            methodName: memberToken.value,
                            args,
                            line: curr.line,
                            column: curr.column,
                        } as MethodCall;
                    } else {
                        expr = {
                            kind: 'MemberAccess',
                            object: expr,
                            member: memberToken.value,
                            line: curr.line,
                            column: curr.column,
                        } as MemberAccess;
                    }
                } else {
                    break;
                }
            }
            return expr;
        }

        // Parenthesized expression
        if (this.match(TokenType.LPAREN)) {
            const expr = this.parseExpression();
            this.expect(TokenType.RPAREN, 'Expected ) after expression');
            return expr;
        }

        // Reference operator: REF(variable)
        if (this.match(TokenType.REF)) {
            const startToken = this.previous();
            this.expect(TokenType.LPAREN, 'Expected ( after REF');
            const operand = this.parseExpression();
            this.expect(TokenType.RPAREN, 'Expected ) after REF operand');
            
            return {
                kind: 'ReferenceExpr',
                operand: operand as any, // Cast for type safety, semantic check later
                line: startToken.line,
                column: startToken.column
            } as ReferenceExpr;
        }

        this.error(`Expected expression, got ${this.current().type}`);
    }

}
