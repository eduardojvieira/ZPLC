/**
 * ZPLC Structured Text Parser
 *
 * SPDX-License-Identifier: MIT
 *
 * Recursive descent parser for IEC 61131-3 Structured Text.
 * Converts token stream to AST.
 */

import { tokenizeWithErrors, TokenType } from './lexer.ts';
import type { Token, TokenTypeValue, LexerError } from './lexer.ts';
import { orderedUniqueErrors } from './diagnostics.ts';
import type { SourceSpan, SourceWarning, SyntaxIssue } from './diagnostics.ts';
import { resolveTypeNames } from './type-names.ts';
import { DataType, NameMap, VarSection, parseTimeLiteral, parseIOAddress } from './ast.ts';
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
    CaseLabel,
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
    ArrayRepeat,
    StructInitializer,
    InitialValue,
    // Extended types
    GlobalVarBlock,
    AliasDecl,
    BitAccess,
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
    /** Position just after the offending token. */
    endLine: number;
    endColumn: number;
    /** The message without the position prefix. */
    detail: string;
    /** Every syntax error of the source, in order; the thrown error is the first of them. */
    errors: SyntaxIssue[] = [this];
    /** Index of the token the error was found at (error recovery only). */
    tokenIndex = -1;

    constructor(message: string, line: number, column: number, endLine = line, endColumn = column + 1) {
        super(`Parse error at ${line}:${column}: ${message}`);
        this.name = 'ParseError';
        this.detail = message;
        this.line = line;
        this.column = column;
        this.endLine = endLine;
        this.endColumn = endColumn;
    }
}

/** What reading a source produced: the tree (complete only when `errors` is empty), every error, the warnings. */
export interface ParseOutcome {
    unit: CompilationUnit;
    errors: Array<LexerError | ParseError>;
    warnings: SourceWarning[];
}

/**
 * Parse ST source code and report every syntax error it holds (CMP-007).
 *
 * The parser recovers from an error at the next statement, declaration or program organisation unit,
 * so independent errors are all reported. The tree it returns when `errors` is not empty is incomplete:
 * a build must stop.
 */
export function parseWithDiagnostics(source: string): ParseOutcome {
    const lexed = tokenizeWithErrors(source);
    const parser = new Parser(lexed.tokens);
    const unit = parser.parseCompilationUnit();
    return {
        unit,
        errors: orderedUniqueErrors<LexerError | ParseError>([...lexed.errors, ...parser.errors]),
        warnings: lexed.warnings,
    };
}

/**
 * Parse ST source code to AST.
 *
 * @param source - ST source code
 * @returns Compilation unit with parsed programs
 * @throws LexerError or ParseError: the first error, with every error of the source in `errors`
 */
export function parse(source: string): CompilationUnit {
    const { unit, errors } = parseWithDiagnostics(source);
    if (errors.length > 0) {
        const first = errors[0]!;
        first.errors = errors;
        throw first;
    }
    return unit;
}

/** Tokens at which a statement list ends: the end of the enclosing program organisation unit, or the start of the next one. */
const BLOCK_END_TOKENS = new Set<TokenTypeValue>([
    TokenType.END_PROGRAM, TokenType.END_FUNCTION, TokenType.END_FUNCTION_BLOCK, TokenType.END_METHOD,
    TokenType.END_INTERFACE, TokenType.END_TYPE, TokenType.END_STRUCT,
    TokenType.PROGRAM, TokenType.FUNCTION, TokenType.FUNCTION_BLOCK, TokenType.INTERFACE, TokenType.TYPE,
    TokenType.VAR_GLOBAL,
]);
/** Tokens that start a program organisation unit or a global declaration. */
const TOP_LEVEL_TOKENS = new Set<TokenTypeValue>([
    TokenType.PROGRAM, TokenType.FUNCTION, TokenType.FUNCTION_BLOCK, TokenType.INTERFACE, TokenType.TYPE,
    TokenType.VAR_GLOBAL,
]);
const STATEMENT_OPENERS = new Set<TokenTypeValue>([
    TokenType.IF, TokenType.WHILE, TokenType.FOR, TokenType.REPEAT, TokenType.CASE,
]);
const STATEMENT_CLOSERS = new Set<TokenTypeValue>([
    TokenType.END_IF, TokenType.END_WHILE, TokenType.END_FOR, TokenType.END_REPEAT, TokenType.END_CASE,
]);
/** Words in the middle of a compound statement: they belong to the statement that is open. */
const STATEMENT_MIDDLES = new Set<TokenTypeValue>([TokenType.ELSE, TokenType.ELSIF, TokenType.UNTIL]);
/** The word that closes each compound statement. */
const STATEMENT_CLOSER_OF: Record<string, string> = {
    [TokenType.IF]: 'END_IF',
    [TokenType.WHILE]: 'END_WHILE',
    [TokenType.FOR]: 'END_FOR',
    [TokenType.REPEAT]: 'END_REPEAT',
    [TokenType.CASE]: 'END_CASE',
};
const VAR_BLOCK_STARTS = new Set<TokenTypeValue>([
    TokenType.VAR, TokenType.VAR_INPUT, TokenType.VAR_OUTPUT, TokenType.VAR_IN_OUT, TokenType.VAR_TEMP,
    TokenType.VAR_GLOBAL, TokenType.VAR_EXTERNAL,
]);
/** After this many errors the parser gives up: the rest would only bury the first ones. */
const MAX_SYNTAX_ERRORS = 100;

/**
 * Recursive descent parser for Structured Text.
 */
class Parser {
    private tokens: Token[];
    private pos = 0;
    /** The syntax errors the parser recovered from, in the order they were found (CMP-007). */
    errors: ParseError[] = [];
    private lastErrorIndex = -2;
    /** Integer constants declared so far: the bounds of an array may name them (CMP-022). */
    private constants = new NameMap<number>();
    /** The token of the type name parseTypeName read last (the element type of an array): where a diagnostic about it points. */
    private lastTypeToken: Token | null = null;

    constructor(tokens: Token[]) {
        this.tokens = tokens;
    }

    // ========================================================================
    // Utility methods
    // ========================================================================

    private current(): Token {
        return this.tokens[this.pos] ?? { type: TokenType.EOF, value: '', line: 0, column: 0, endLine: 0, endColumn: 0 };
    }

    private previous(): Token {
        return this.tokens[this.pos - 1];
    }

    private isAtEnd(): boolean {
        return this.current().type === TokenType.EOF;
    }

    private peek(offset = 1): Token {
        return this.tokens[this.pos + offset] ?? { type: TokenType.EOF, value: '', line: 0, column: 0, endLine: 0, endColumn: 0 };
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
        throw this.syntaxError(`${message}, got ${curr.type} '${curr.value}'`);
    }

    private error(message: string): never {
        throw this.syntaxError(message);
    }

    /** A syntax error at the current token. */
    private syntaxError(message: string): ParseError {
        const curr = this.current();
        const error = new ParseError(message, curr.line, curr.column, curr.endLine, curr.endColumn);
        error.tokenIndex = this.pos;
        return error;
    }

    /** Where the type name that parseTypeName read last was written. */
    private typeSpan(): SourceSpan | undefined {
        const token = this.lastTypeToken;
        return token ? { line: token.line, column: token.column, endLine: token.endLine, endColumn: token.endColumn } : undefined;
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

        const typeAliases: AliasDecl[] = [];

        while (!this.isAtEnd()) {
            const itemStart = this.pos;
            if (this.skipUnsupportedBlock()) continue;
            try {
                if (this.check(TokenType.VAR_GLOBAL)) {
                    globalVars.push(this.parseGlobalVarBlock());
                } else if (this.check(TokenType.FUNCTION)) {
                    functions.push(this.parseFunctionDecl());
                } else if (this.check(TokenType.FUNCTION_BLOCK)) {
                    functionBlocks.push(this.parseFunctionBlockDecl());
                } else if (this.check(TokenType.PROGRAM)) {
                    programs.push(this.parseProgram());
                } else if (this.check(TokenType.TYPE)) {
                    for (const definition of this.parseTypeBlock()) {
                        if (definition.kind === 'AliasDecl') typeAliases.push(definition);
                        else typeDefinitions.push(definition);
                    }
                } else if (this.check(TokenType.INTERFACE)) {
                    interfaces.push(this.parseInterfaceDecl());
                } else {
                    this.error(`Expected VAR_GLOBAL, FUNCTION, FUNCTION_BLOCK, PROGRAM, TYPE or INTERFACE, got ${this.current().type}`);
                }
            } catch (caught) {
                if (!(caught instanceof ParseError)) throw caught;
                // The unit that failed is lost; the next one is read from its first word
                this.record(caught);
                while (!this.isAtEnd() && !TOP_LEVEL_TOKENS.has(this.current().type)) this.advance();
                if (this.pos === itemStart) this.advance();
            }
        }

        const unit: CompilationUnit = {
            kind: 'CompilationUnit',
            globalVars,
            functions,
            functionBlocks,
            programs,
            typeDefinitions,
            typeAliases,
            interfaces,
            line: start.line,
            column: start.column,
        };
        // Replace every use of an alias by the type it stands for, and name the library blocks (CMP-030, CMP-033)
        for (const issue of resolveTypeNames(unit)) {
            this.record(new ParseError(issue.message, issue.line, issue.column, issue.endLine, issue.endColumn));
        }
        return unit;
    }

    /**
     * program := PROGRAM identifier var_block* statement* END_PROGRAM
     */
    private parseProgram(): Program {
        const start = this.expect(TokenType.PROGRAM, 'Expected PROGRAM');
        const nameToken = this.expect(TokenType.IDENTIFIER, 'Expected program name');

        const varBlocks: VarBlock[] = [];
        while (this.startsVarBlock()) {
            varBlocks.push(this.parseVarBlock());
        }

        const statements: Statement[] = [];
        while (!this.check(TokenType.END_PROGRAM) && !this.isAtEnd()) {
            this.parseStatementInto(statements);
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
        // FUNCTION_BLOCK [ABSTRACT] [FINAL] name (CMP-041)
        let isAbstract = false;
        let isFinal = false;
        while (this.check(TokenType.ABSTRACT) || this.check(TokenType.FINAL)) {
            if (this.match(TokenType.ABSTRACT)) isAbstract = true;
            else if (this.match(TokenType.FINAL)) isFinal = true;
        }
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
            this.check(TokenType.VAR_EXTERNAL) ||
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
                    case VarSection.CONSTANT:
                        locals.push(...block.variables);
                        break;
                }
            }
        }

        // Parse body statements (legacy FB body, executed on call)
        const body: Statement[] = [];
        while (!this.check(TokenType.END_FUNCTION_BLOCK) && !this.isAtEnd()) {
            this.parseStatementInto(body);
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
            ...(isAbstract ? { isAbstract } : {}),
            ...(isFinal ? { isFinal } : {}),
            line: start.line,
            column: start.column,
        };
    }

    /**
     * type_block := TYPE type_declaration+ END_TYPE
     */
    private parseTypeBlock(): Array<TypeDefinition | AliasDecl> {
        const typeToken = this.expect(TokenType.TYPE, "Expected 'TYPE'");
        const definitions: Array<TypeDefinition | AliasDecl> = [];
        do {
            // the first declaration of the block is positioned at the TYPE word, as a block of one always was
            definitions.push(this.parseTypeDecl(definitions.length === 0 ? typeToken : undefined));
        } while (!this.check(TokenType.END_TYPE) && !this.isAtEnd());
        this.expect(TokenType.END_TYPE, "Expected 'END_TYPE'");
        return definitions;
    }

    /**
     * type_declaration := identifier [':'] (STRUCT ... END_STRUCT | '(' enum_values ')' | type_name [':=' value]) [';']
     */
    private parseTypeDecl(blockStart?: Token): TypeDefinition | AliasDecl {
        const start = blockStart ?? this.current();
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
                const typeAt = this.typeSpan();

                let initialValue: InitialValue | null = null;
                if (this.match(TokenType.ASSIGN)) {
                    initialValue = this.parseInitialValue();
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
                        tags: {},
                        ...(typeAt ? { typeAt } : {}),
                        line: start.line,
                        column: start.column,
                    });
                }
            }

            this.expect(TokenType.END_STRUCT, "Expected 'END_STRUCT'");
            if (this.match(TokenType.SEMICOLON)) { }

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
            
            return {
                kind: 'EnumDecl',
                name: nameToken.value,
                baseType: 'INT',
                values,
                line: start.line,
                column: start.column
            };
        } else {
            // Type alias: TYPE Speed : INT; END_TYPE (CMP-030)
            const baseType = this.parseTypeName();
            let initialValue: Expression | null = null;
            if (this.match(TokenType.ASSIGN)) {
                initialValue = this.parseExpression();
            }
            this.expect(TokenType.SEMICOLON, "Expected ';' after the type alias");
            return {
                kind: 'AliasDecl',
                name: nameToken.value,
                baseType,
                initialValue,
                line: start.line,
                column: start.column,
            };
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
        let returnTypeAt: SourceSpan | undefined;
        if (this.match(TokenType.COLON)) {
            returnType = this.parseTypeName();
            returnTypeAt = this.typeSpan();
        }

        const inputs: VarDecl[] = [];
        const outputs: VarDecl[] = [];
        const locals: VarDecl[] = [];

        // Parse variable blocks
        while (
            this.check(TokenType.VAR) ||
            this.check(TokenType.VAR_INPUT) ||
            this.check(TokenType.VAR_OUTPUT) ||
            this.check(TokenType.VAR_TEMP) ||
            this.check(TokenType.VAR_EXTERNAL)
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
                case VarSection.CONSTANT:
                    locals.push(...block.variables);
                    break;
            }
        }

        // Parse body (unless abstract)
        const body: Statement[] = [];
        if (!isAbstract) {
            while (!this.check(TokenType.END_METHOD) && !this.isAtEnd()) {
                this.parseStatementInto(body);
            }
        }

        this.expect(TokenType.END_METHOD, 'Expected END_METHOD');

        return {
            kind: 'MethodDecl',
            name: nameToken.value,
            returnType,
            ...(returnTypeAt ? { returnTypeAt } : {}),
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
        const retain = this.parseRetainQualifier();

        const variables: VarDecl[] = [];
        while (!this.check(TokenType.END_VAR) && !this.isAtEnd()) {
            this.parseVarDeclInto(variables, isConstant ? VarSection.CONSTANT : VarSection.VAR_GLOBAL);
        }

        this.expect(TokenType.END_VAR, 'Expected END_VAR');
        if (retain !== undefined) for (const variable of variables) variable.retain = retain;

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
        const returnTypeAt = this.typeSpan();

        // Return type must be elementary, not array
        if (typeof returnType !== 'string') {
            this.error('Function return type must be an elementary type, not ARRAY');
        }

        const inputs: VarDecl[] = [];
        const locals: VarDecl[] = [];
        const outputs: VarDecl[] = [];
        const inouts: VarDecl[] = [];

        // Parse VAR_INPUT, VAR_OUTPUT, VAR_IN_OUT, VAR, VAR_TEMP and VAR_EXTERNAL blocks
        while (this.startsVarBlock()) {
            const block = this.parseVarBlock();
            if (block.section === VarSection.VAR_INPUT) {
                inputs.push(...block.variables);
            } else {
                // a function keeps its outputs and in-out variables in static storage, like its locals (CMP-030)
                locals.push(...block.variables);
                if (block.section === VarSection.VAR_OUTPUT) outputs.push(...block.variables);
                if (block.section === VarSection.VAR_IN_OUT) inouts.push(...block.variables);
            }
        }

        // Parse body statements
        const body: Statement[] = [];
        while (!this.check(TokenType.END_FUNCTION) && !this.isAtEnd()) {
            this.parseStatementInto(body);
        }

        this.expect(TokenType.END_FUNCTION, 'Expected END_FUNCTION');

        return {
            kind: 'FunctionDecl',
            name: nameToken.value,
            returnType: returnType as any,
            ...(returnTypeAt ? { returnTypeAt } : {}),
            inputs,
            locals,
            outputs,
            inouts,
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
            // VAR CONSTANT holds a value that no statement may assign (CMP-026)
            section = this.match(TokenType.CONSTANT) ? VarSection.CONSTANT : VarSection.VAR;
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
        } else if (this.match(TokenType.VAR_EXTERNAL)) {
            section = VarSection.VAR_EXTERNAL;
        } else {
            this.error('Expected VAR, VAR_OUTPUT, VAR_INPUT, VAR_IN_OUT, VAR_GLOBAL, or VAR_TEMP');
        }

        const retain = this.parseRetainQualifier();

        const variables: VarDecl[] = [];
        while (!this.check(TokenType.END_VAR) && !this.isAtEnd()) {
            this.parseVarDeclInto(variables, section);
        }

        this.expect(TokenType.END_VAR, 'Expected END_VAR');
        if (retain !== undefined) for (const variable of variables) variable.retain = retain;

        return {
            kind: 'VarBlock',
            section,
            variables,
            ...(retain === undefined ? {} : { retain }),
            line: start.line,
            column: start.column,
        };
    }

    /** `RETAIN` (true) or `NON_RETAIN` (false) after the VAR keyword; undefined when neither is written (CMP-029). */
    private parseRetainQualifier(): boolean | undefined {
        let retain: boolean | undefined;
        // `VAR RETAIN PERSISTENT` and `VAR PERSISTENT RETAIN` are both read to their end, so one error says it all
        for (let qualifiers = 0; qualifiers < 2; qualifiers += 1) {
            const token = this.current();
            if (token.type !== TokenType.IDENTIFIER) break;
            // `retain : BOOL;` declares a variable named retain
            const next = this.peek().type;
            if (next === TokenType.COLON || next === TokenType.COMMA || next === TokenType.AT) break;
            const word = token.value.toUpperCase();
            if (word === 'PERSISTENT') {
                // VAR PERSISTENT is left to 2.x (decision D-04); RETAIN keeps a value across a restart.
                // The block is read as an ordinary one, so the errors after it are found too.
                this.record(new ParseError(`'PERSISTENT' is not supported in this release: declare the variables RETAIN`, token.line, token.column, token.endLine, token.endColumn));
                this.advance();
            } else if ((word === 'RETAIN' || word === 'NON_RETAIN') && retain === undefined) {
                this.advance();
                retain = word === 'RETAIN';
            } else {
                break;
            }
        }
        return retain;
    }

    private startsVarBlock(): boolean {
        return VAR_BLOCK_STARTS.has(this.current().type) && !this.check(TokenType.VAR_GLOBAL);
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
            try {
                ioAddress = parseIOAddress(addrToken.value);
            } catch (e) {
                throw new ParseError((e as Error).message, addrToken.line, addrToken.column, addrToken.endLine, addrToken.endColumn);
            }
        }

        this.expect(TokenType.COLON, 'Expected : after variable name');

        const dataType = this.parseTypeName();
        const typeAt = this.typeSpan();

        // Optional initial value
        let initialValue: InitialValue | null = null;
        if (this.match(TokenType.ASSIGN)) {
            initialValue = this.parseInitialValue();
        }

        if (section === VarSection.CONSTANT && initialValue) {
            const value = this.foldInteger(initialValue as Expression);
            if (value !== undefined) this.constants.set(nameToken.value, value);
        }

        // Optional tags: {publish}, {modbus:40001}
        const tags: Record<string, string | true> = {};
        while (this.match(TokenType.LCURLY)) {
            const tagId = this.expect(TokenType.IDENTIFIER, 'Expected tag name').value;
            if (this.match(TokenType.COLON)) {
                const tagVal = this.advance().value; // Could be identifier or number
                tags[tagId] = tagVal;
            } else {
                tags[tagId] = true;
            }
            this.expect(TokenType.RCURLY, 'Expected } to close tag');
        }

        this.expect(TokenType.SEMICOLON, 'Expected ; after variable declaration');

        return {
            kind: 'VarDecl',
            name: nameToken.value,
            dataType,
            initialValue,
            ioAddress,
            section,
            tags,
            ...(typeAt ? { typeAt } : {}),
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

        this.lastTypeToken = this.current();

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
        if (this.match(TokenType.STRING)) return this.parseStringCapacity('STRING');
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

        // A library function block (TON, CTU, PULSE...) is a name here, not a reserved word (CMP-033):
        // type-names.ts turns the name into the library block once the program's own types are known.
        // User defined type (Struct or FB)
        if (this.check(TokenType.IDENTIFIER)) {
            const token = this.advance();
            return token.value.toUpperCase() === 'WSTRING' ? this.parseStringCapacity(token.value) : token.value;
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
        const lower = this.parseBound('lower');

        this.expect(TokenType.DOTDOT, 'Expected .. between array bounds');

        const upper = this.parseBound('upper');

        if (upper < lower) {
            this.error(`Invalid array bounds: ${lower}..${upper} (upper must be >= lower)`);
        }

        return { lowerBound: lower, upperBound: upper };
    }

    /** A bound of an array: an integer constant expression (a literal, a declared constant, `-`, `+`, `*`). */
    private parseBound(which: 'lower' | 'upper'): number {
        const at = this.current();
        const expr = this.parseAdditiveExpr();
        const value = this.foldInteger(expr);
        if (value === undefined) {
            throw new ParseError(`The ${which} bound of an array must be an integer constant expression`, at.line, at.column);
        }
        return value;
    }

    /** The value of an integer constant expression, or undefined when it is not one. */
    private foldInteger(expr: Expression): number | undefined {
        switch (expr.kind) {
            case 'IntLiteral':
                return expr.value;
            case 'Identifier':
                return this.constants.get(expr.name);
            case 'UnaryExpr': {
                const operand = this.foldInteger(expr.operand);
                return operand === undefined || expr.operator !== 'NEG' ? undefined : -operand;
            }
            case 'BinaryExpr': {
                const left = this.foldInteger(expr.left);
                const right = this.foldInteger(expr.right);
                if (left === undefined || right === undefined) return undefined;
                switch (expr.operator) {
                    case 'ADD': return left + right;
                    case 'SUB': return left - right;
                    case 'MUL': return left * right;
                    case 'DIV': return right === 0 ? undefined : Math.trunc(left / right);
                    case 'MOD': return right === 0 ? undefined : left % right;
                    default: return undefined;
                }
            }
            default:
                return undefined;
        }
    }

    /** STRING, STRING[n] or STRING(n); the capacity is part of the type name: `STRING[20]` (CMP-021). */
    private parseStringCapacity(base: string): string {
        const open = this.check(TokenType.LBRACKET) ? TokenType.LBRACKET : this.check(TokenType.LPAREN) ? TokenType.LPAREN : null;
        if (open === null) return base;
        this.advance();
        const at = this.current();
        const capacity = this.foldInteger(this.parseAdditiveExpr());
        if (capacity === undefined || capacity < 1 || capacity > 0xFFFF) {
            throw new ParseError(`The capacity of ${base} must be an integer constant of 1 or more`, at.line, at.column);
        }
        this.expect(open === TokenType.LBRACKET ? TokenType.RBRACKET : TokenType.RPAREN, `Expected ${open === TokenType.LBRACKET ? ']' : ')'} after the string capacity`);
        return `${base.toUpperCase()}[${capacity}]`;
    }

    /**
     * initial_value := array_literal | struct_initialiser | expression
     * struct_initialiser := '(' identifier ':=' value (',' identifier ':=' value)* ')'
     */
    private parseInitialValue(): InitialValue {
        if (this.check(TokenType.LBRACKET)) {
            return this.parseArrayLiteral();
        }
        if (this.check(TokenType.LPAREN) && this.peek().type === TokenType.IDENTIFIER && this.peek(2).type === TokenType.ASSIGN) {
            return this.parseStructInitializer();
        }
        return this.parseExpression();
    }

    private parseStructInitializer(): StructInitializer {
        const start = this.expect(TokenType.LPAREN, 'Expected (');
        const fields: StructInitializer['fields'] = [];
        do {
            const name = this.expect(TokenType.IDENTIFIER, 'Expected field name');
            this.expect(TokenType.ASSIGN, "Expected := after the field name");
            fields.push({ name: name.value, value: this.parseInitialValue(), line: name.line, column: name.column });
        } while (this.match(TokenType.COMMA));
        this.expect(TokenType.RPAREN, 'Expected ) after the initialiser');
        return { kind: 'StructInitializer', fields, line: start.line, column: start.column };
    }

    /**
     * array_literal := '[' element (',' element)* ']'
     * element := initial_value | INTEGER '(' initial_value ')'
     */
    private parseArrayLiteral(): ArrayLiteral {
        const start = this.expect(TokenType.LBRACKET, 'Expected [');
        const elements: ArrayLiteral['elements'] = [];

        if (!this.check(TokenType.RBRACKET)) {
            elements.push(this.parseArrayElement());
            while (this.match(TokenType.COMMA)) {
                elements.push(this.parseArrayElement());
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

    private parseArrayElement(): ArrayLiteral['elements'][number] {
        // 4(7): a repeat count, written before a parenthesised value
        if (this.check(TokenType.INTEGER) && this.peek().type === TokenType.LPAREN) {
            const count = this.advance();
            this.advance(); // (
            const value = this.parseInitialValue() as ArrayRepeat['value'];
            this.expect(TokenType.RPAREN, 'Expected ) after the repeated value');
            return { kind: 'ArrayRepeat', count: parseInt(count.value, 10), value, line: count.line, column: count.column };
        }
        return this.parseInitialValue() as ArrayLiteral['elements'][number];
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

        // SUPER^( ): the body of the base function block runs here (CMP-041)
        if (this.check(TokenType.IDENTIFIER) && this.current().value.toUpperCase() === 'SUPER'
            && this.peek().type === TokenType.CARET && this.peek(2).type === TokenType.LPAREN) {
            const ident = this.advance();
            this.advance(); // ^
            return this.parseFBCallStatement({ ...ident, value: 'SUPER^' }, startToken);
        }

        // Must be an assignment (possibly with nested access) or a method call statement
        const target = this.parsePrimaryExpr();

        // A call of an instance that is an array element: timers[2](IN := x) (CMP-038)
        if (target.kind === 'ArrayAccess' && this.check(TokenType.LPAREN)) {
            const call = this.parseFBCallStatement({ ...startToken, value: describeInstance(target) }, startToken);
            call.instance = target;
            return call;
        }

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
            this.parseStatementInto(thenBranch);
        }

        // Parse ELSIF branches
        const elsifBranches: ElsifClause[] = [];
        while (this.match(TokenType.ELSIF)) {
            const elsifCondition = this.parseExpression();
            this.expect(TokenType.THEN, 'Expected THEN after ELSIF condition');

            const elsifStatements: Statement[] = [];
            while (!this.check(TokenType.ELSIF) && !this.check(TokenType.ELSE) && !this.check(TokenType.END_IF) && !this.isAtEnd()) {
                this.parseStatementInto(elsifStatements);
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
                this.parseStatementInto(elseBranch);
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
            this.parseStatementInto(body);
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
            this.parseStatementInto(body);
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
            this.parseStatementInto(body);
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
                this.parseStatementInto(elseBranch);
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
     * value := constant | constant..constant   (constant: integer, -integer, or a constant or enumeration name)
     */
    private parseCaseBranch(): CaseBranch {
        const values: CaseLabel[] = [];

        // Parse comma-separated list of values or ranges
        do {
            const first = this.current();
            const start = this.parseUnaryExpr();
            const end = this.match(TokenType.DOTDOT) ? this.parseUnaryExpr() : null;
            values.push({ kind: 'CaseLabel', start, end, line: first.line, column: first.column });
        } while (this.match(TokenType.COMMA));

        this.expect(TokenType.COLON, 'Expected : after CASE values');

        const statements: Statement[] = [];
        // Parse statements until we see another case label, ELSE, or END_CASE
        while (!this.startsCaseLabel() && !this.check(TokenType.ELSE) && !this.check(TokenType.END_CASE) && !this.isAtEnd()) {
            this.parseStatementInto(statements);
        }

        return { values, statements };
    }

    /**
     * A label starts with a number, a minus sign, or a name followed by `:`, `,` or `..`
     * (a statement never starts that way, and `:=` is a different token).
     */
    private startsCaseLabel(): boolean {
        if (this.check(TokenType.INTEGER) || this.check(TokenType.MINUS)) return true;
        if (!this.check(TokenType.IDENTIFIER)) return false;
        const next = this.peek().type;
        return next === TokenType.COLON || next === TokenType.COMMA || next === TokenType.DOTDOT;
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
     * parameter := identifier ASSIGN expression      an input: IN := x
     *            | identifier OUTPUT_ASSIGN variable  an output: Q => y (CMP-037)
     *            | expression                         a positional argument of a function call
     */
    private parseFBParameter(): FBParameter {
        const first = this.current();
        if (first.type === TokenType.IDENTIFIER && this.peek().type === TokenType.ASSIGN) {
            this.advance();
            this.advance();
            const value = this.parseExpression();
            return { name: first.value, value, line: first.line, column: first.column, endLine: first.endLine, endColumn: first.endColumn };
        }
        if (first.type === TokenType.IDENTIFIER && this.peek().type === TokenType.OUTPUT_ASSIGN) {
            this.advance();
            this.advance();
            const target = this.current();
            const value = this.parseExpression();
            if (value.kind !== 'Identifier' && value.kind !== 'MemberAccess' && value.kind !== 'ArrayAccess' && value.kind !== 'DereferenceExpr') {
                throw new ParseError(`An output binding names the variable that receives '${first.value}'`, target.line, target.column, target.endLine, target.endColumn);
            }
            return { name: first.value, value, output: true, line: first.line, column: first.column, endLine: first.endLine, endColumn: first.endColumn };
        }
        // A positional argument: a function takes it; a function block call is formal only (decision D-04)
        const value = this.parseExpression();
        return { name: '', value, line: first.line, column: first.column };
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

        return this.parsePowerExpr();
    }

    /**
     * power_expr := primary_expr (** (+|-)? primary_expr)*
     *
     * `**` binds tighter than the unary minus and NOT, as in the precedence table of IEC 61131-3 (CMP-032),
     * and is left associative.
     */
    private parsePowerExpr(): Expression {
        let left = this.parsePrimaryExpr();

        while (this.match(TokenType.POWER)) {
            const right = this.parsePowerOperand();
            left = {
                kind: 'BinaryExpr',
                operator: 'POW',
                left,
                right,
                line: left.line,
                column: left.column,
                endLine: right.endLine,
                endColumn: right.endColumn,
            };
        }

        return left;
    }

    /** The exponent: a primary expression that may carry a sign (`2 ** -1`). */
    private parsePowerOperand(): Expression {
        if (this.match(TokenType.MINUS)) {
            const startToken = this.previous();
            const operand = this.parsePrimaryExpr();
            return { kind: 'UnaryExpr', operator: 'NEG', operand, line: startToken.line, column: startToken.column, endLine: operand.endLine, endColumn: operand.endColumn } as UnaryExpr;
        }
        this.match(TokenType.PLUS);
        return this.parsePrimaryExpr();
    }

    /**
     * primary_expr := TRUE | FALSE | INTEGER | TIME_LITERAL | identifier (. member)? | LPAREN expression RPAREN
     */
    private parsePrimaryExpr(): Expression {
        const expr = this.parsePrimaryExprNode();
        // the position just after the last token of the expression, for the diagnostics that point at it
        if (expr.endLine === undefined && this.pos > 0) {
            const last = this.tokens[this.pos - 1]!;
            expr.endLine = last.endLine;
            expr.endColumn = last.endColumn;
        }
        return expr;
    }

    private parsePrimaryExprNode(): Expression {
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
            // the lexer hands over decimal digits, or 0x, 0o and 0b digits for a based literal (16#FF, 8#17, 2#1010)
            const exact = BigInt(curr.value);
            const value = Number(exact);
            return {
                kind: 'IntLiteral',
                value,
                // beyond 2^53 a number is rounded: keep the exact value for a 64-bit literal
                ...(Number.isSafeInteger(value) ? {} : { big: exact }),
                line: curr.line,
                column: curr.column,
            } as IntLiteral;
        }

        // Typed literal: INT#5, SINT#-3, WORD#16#FF, REAL#1.5, BOOL#TRUE (CMP-031)
        if (this.match(TokenType.TYPED_LITERAL)) {
            return this.typedLiteral(curr);
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
            let valueMs: number;
            try {
                valueMs = parseTimeLiteral(curr.value);
            } catch (e) {
                throw new ParseError((e as Error).message, curr.line, curr.column);
            }
            return {
                kind: 'TimeLiteral',
                valueMs,
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
                if (this.check(TokenType.DOT) && this.peek().type === TokenType.INTEGER) {
                    // Bit access: w.0 (CMP-032)
                    this.advance(); // .
                    const bitToken = this.advance();
                    if (!/^\d+$/.test(bitToken.value) || Number(bitToken.value) > 63) {
                        throw new ParseError(`A bit number is a decimal number from 0 to 63, got '${bitToken.value}'`, bitToken.line, bitToken.column, bitToken.endLine, bitToken.endColumn);
                    }
                    expr = {
                        kind: 'BitAccess',
                        operand: expr,
                        bit: Number(bitToken.value),
                        line: startToken.line,
                        column: startToken.column,
                        endLine: bitToken.endLine,
                        endColumn: bitToken.endColumn,
                    } as BitAccess;
                } else if (this.match(TokenType.DOT)) {
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
            
            // THIS can have suffixes: THIS.member, THIS.Method(); THIS^ is the instance itself
            while (true) {
                if (this.match(TokenType.CARET)) {
                    continue;
                }
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

    // ========================================================================
    // Typed literals (CMP-031)
    // ========================================================================

    /** `INT#5`, `SINT#-3`, `WORD#0xFF`, `REAL#1.5`, `BOOL#1`: the value is written TYPE#text by the lexer. */
    private typedLiteral(token: Token): Expression {
        const hash = token.value.indexOf('#');
        const typeName = token.value.slice(0, hash);
        const text = token.value.slice(hash + 1);
        const negative = text.startsWith('-');
        const digits = negative ? text.slice(1) : text;
        const at = { line: token.line, column: token.column, endLine: token.endLine, endColumn: token.endColumn };

        if (typeName === 'BOOL') {
            if (digits !== '0' && digits !== '1') {
                throw new ParseError(`BOOL# takes 0, 1, TRUE or FALSE, got ${text}`, at.line, at.column, at.endLine, at.endColumn);
            }
            return { kind: 'BoolLiteral', value: digits === '1' && !negative, literalType: undefined, ...at } as BoolLiteral;
        }

        if (typeName === 'REAL' || typeName === 'LREAL') {
            const magnitude = /^0[xob]/.test(digits) ? Number(BigInt(digits)) : parseFloat(digits);
            return { kind: 'RealLiteral', value: negative ? -magnitude : magnitude, literalType: typeName, ...at } as RealLiteral;
        }

        if (/[.eE]/.test(digits) && !/^0x/.test(digits)) {
            throw new ParseError(`${typeName}#${text}: an integer literal has no fraction or exponent`, at.line, at.column, at.endLine, at.endColumn);
        }
        const exact = negative ? -BigInt(digits) : BigInt(digits);
        const [low, high] = INTEGER_TYPE_RANGES[typeName]!;
        if (exact < low || exact > high) {
            throw new ParseError(`The literal ${typeName}#${text} is out of range: ${typeName} holds ${low} to ${high}`, at.line, at.column, at.endLine, at.endColumn);
        }
        const value = Number(exact);
        return {
            kind: 'IntLiteral',
            value,
            ...(Number.isSafeInteger(value) ? {} : { big: exact }),
            literalType: typeName,
            ...at,
        } as IntLiteral;
    }

    // ========================================================================
    // Error recovery (CMP-007)
    //
    // An error in a statement, a declaration or a program organisation unit is
    // recorded and the parser goes on after it, so that a file with several
    // independent errors reports all of them. The tree built after an error is
    // incomplete: a build never uses it.
    // ========================================================================

    /** Keep a recovered error, unless it repeats an earlier one at the same token or one the lexer reported. */
    private record(error: ParseError): void {
        if (this.errors.length >= MAX_SYNTAX_ERRORS) {
            // stop reading: every loop ends at the end of the file
            this.pos = this.tokens.length - 1;
            return;
        }
        const index = error.tokenIndex;
        if (index >= 0) {
            if (index === this.lastErrorIndex) return;
            // text the lexer could not read, or what follows it: the lexical error says it already
            if (this.tokens[index]?.type === TokenType.ERROR || this.tokens[index - 1]?.type === TokenType.ERROR) return;
            this.lastErrorIndex = index;
        }
        this.errors.push(error);
    }

    /**
     * A construct of IEC 61131-3 this compiler does not have, written `WORD name ... END_WORD` (ACTION, PROPERTY,
     * NAMESPACE, CONFIGURATION, RESOURCE): one error at its first word, and the whole construct is skipped, so
     * that what is inside it is not reported as a dozen errors of its own. Returns true when one was skipped.
     */
    private skipUnsupportedBlock(): boolean {
        const first = this.current();
        if (first.type !== TokenType.IDENTIFIER || this.peek().type !== TokenType.IDENTIFIER) return false;
        const closer = `END_${first.value.toUpperCase()}`;
        for (let index = this.pos + 2; index < this.tokens.length; index++) {
            const token = this.tokens[index]!;
            if (token.type !== TokenType.IDENTIFIER || token.value.toUpperCase() !== closer) continue;
            const error = this.syntaxError(`${first.value.toUpperCase()} ... ${closer} is not supported`);
            this.record(error);
            this.pos = index + 1;
            this.match(TokenType.SEMICOLON);
            return true;
        }
        return false;
    }

    /** At the end of the enclosing unit: a statement list must not read on into the next one. */
    private atBlockEnd(): boolean {
        return BLOCK_END_TOKENS.has(this.current().type);
    }

    /**
     * Parse one statement of a list into `into`. A statement with an error is recorded and skipped; an
     * empty statement (`;`) is accepted and produces nothing (CMP-032).
     */
    private parseStatementInto(into: Statement[]): void {
        if (this.match(TokenType.SEMICOLON)) return;
        if (this.skipUnsupportedBlock()) return;
        // The list ended without the word that closes it: the error belongs to the construct around it
        if (this.atBlockEnd()) {
            const open = this.innermostOpenStatement();
            if (open !== undefined) {
                const here = this.current();
                throw this.syntaxError(`Expected ${STATEMENT_CLOSER_OF[open]}, got ${here.type} '${here.value}'`);
            }
            into.push(this.parseStatement());
            return;
        }
        const start = this.pos;
        const opener = this.current().type;
        try {
            const statement = this.parseStatement();
            // the position just after the statement, for the diagnostics that point at it
            const last = this.tokens[this.pos - 1]!;
            statement.endLine ??= last.endLine;
            statement.endColumn ??= last.endColumn;
            into.push(statement);
        } catch (caught) {
            if (!(caught instanceof ParseError)) throw caught;
            this.record(caught);
            this.skipStatement(opener, this.unterminatedStringLine(caught));
            if (this.pos === start) this.advance();
        }
    }

    /**
     * When `error` was found at the text of an unterminated string, the line that text ends on: the string
     * ran to the end of the line and took the semicolon of the statement with it.
     */
    private unterminatedStringLine(error: ParseError): number | undefined {
        const token = this.tokens[error.tokenIndex];
        if (token?.type !== TokenType.ERROR || !/^['"]/.test(token.value)) return undefined;
        return token.endLine;
    }

    /** The opening word of the innermost compound statement that has not been closed at the current token, if any. */
    private innermostOpenStatement(): TokenTypeValue | undefined {
        const open: TokenTypeValue[] = [];
        for (let index = 0; index < this.pos; index++) {
            const type = this.tokens[index]!.type;
            if (STATEMENT_OPENERS.has(type)) open.push(type);
            else if (STATEMENT_CLOSERS.has(type)) open.pop();
            else if (TOP_LEVEL_TOKENS.has(type)) open.length = 0;
        }
        return open.pop();
    }

    /**
     * After an error: skip to the end of the statement that began with `opener`. A compound statement
     * (IF, WHILE, FOR, REPEAT, CASE) is skipped up to its END word, so that the words inside it are not
     * read as statements. The words that close the construct around it are left for its own parser.
     */
    private skipStatement(opener: TokenTypeValue, stopAfterLine?: number): void {
        let depth = STATEMENT_OPENERS.has(opener) ? 1 : 0;
        while (!this.isAtEnd()) {
            const type = this.current().type;
            if (BLOCK_END_TOKENS.has(type)) return;
            // the line of an unterminated string ends the statement: its semicolon is inside the string
            if (stopAfterLine !== undefined && this.current().line > stopAfterLine) return;
            if (VAR_BLOCK_STARTS.has(type)) {
                // a declaration block where a statement should be: skip it whole
                while (!this.isAtEnd() && !this.check(TokenType.END_VAR) && !BLOCK_END_TOKENS.has(this.current().type)) this.advance();
                this.match(TokenType.END_VAR);
                return;
            }
            if (type === TokenType.SEMICOLON && depth === 0) {
                this.advance();
                return;
            }
            if (STATEMENT_OPENERS.has(type)) {
                depth++;
            } else if (STATEMENT_CLOSERS.has(type)) {
                if (depth === 0) return;
                depth--;
                this.advance();
                if (depth === 0) {
                    this.match(TokenType.SEMICOLON);
                    return;
                }
                continue;
            } else if (depth === 0 && STATEMENT_MIDDLES.has(type)) {
                return;
            }
            this.advance();
        }
    }

    /**
     * Parse one declaration of a VAR block into `into`; `a, b : INT;` declares both (CMP-030).
     * A declaration with an error is recorded and skipped.
     */
    private parseVarDeclInto(into: VarDecl[], section: VarSectionValue): void {
        if (this.atBlockEnd()) {
            // END_VAR is missing: the error is that of the unit
            into.push(this.parseVarDecl(section));
            return;
        }
        const start = this.pos;
        try {
            // Names after the first are taken out of the token list and declared again with the first one's type
            const extra: Token[] = [];
            let at = this.pos + 1;
            while (this.tokens[at]?.type === TokenType.COMMA && this.tokens[at + 1]?.type === TokenType.IDENTIFIER) {
                extra.push(this.tokens[at + 1]!);
                at += 2;
            }
            if (extra.length > 0 && this.tokens[at]?.type === TokenType.COLON && this.tokens[this.pos]?.type === TokenType.IDENTIFIER) {
                this.tokens.splice(this.pos + 1, extra.length * 2);
                const first = this.parseVarDecl(section);
                into.push(first);
                for (const name of extra) {
                    into.push({ ...first, name: name.value, line: name.line, column: name.column, tags: { ...first.tags } });
                }
            } else {
                into.push(this.parseVarDecl(section));
            }
        } catch (caught) {
            if (!(caught instanceof ParseError)) throw caught;
            this.record(caught);
            // the declaration ends at its semicolon; the block at END_VAR
            const stopAfterLine = this.unterminatedStringLine(caught);
            while (!this.isAtEnd() && !this.check(TokenType.END_VAR) && !this.atBlockEnd()) {
                if (this.match(TokenType.SEMICOLON)) break;
                if (stopAfterLine !== undefined && this.current().line > stopAfterLine) break;
                this.advance();
            }
            if (this.pos === start && !this.check(TokenType.END_VAR)) this.advance();
        }
    }
}

/** Text that stands for an instance expression, for messages and annotations. */
function describeInstance(expr: Expression): string {
    switch (expr.kind) {
        case 'Identifier': return expr.name;
        case 'MemberAccess': return `${describeInstance(expr.object)}.${expr.member}`;
        case 'ArrayAccess': return `${describeInstance(expr.array)}[...]`;
        default: return '<instance>';
    }
}

/** What an integer type holds, for the range check of a typed literal. */
const INTEGER_TYPE_RANGES: Record<string, [bigint, bigint]> = {
    SINT: [-128n, 127n],
    USINT: [0n, 255n],
    BYTE: [0n, 255n],
    INT: [-32768n, 32767n],
    UINT: [0n, 65535n],
    WORD: [0n, 65535n],
    DINT: [-2147483648n, 2147483647n],
    UDINT: [0n, 4294967295n],
    DWORD: [0n, 4294967295n],
    LINT: [-(2n ** 63n), 2n ** 63n - 1n],
    ULINT: [0n, 2n ** 64n - 1n],
    LWORD: [0n, 2n ** 64n - 1n],
};
