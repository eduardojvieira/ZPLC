/**
 * ZPLC OOP Extensions Tests
 * 
 * Tests for IEC 61131-3 3rd Edition OOP features:
 * - INTERFACE declarations
 * - FUNCTION_BLOCK with EXTENDS and IMPLEMENTS
 * - METHOD declarations
 * - THIS keyword
 * - Method calls
 * 
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect } from 'bun:test';
import { tokenize, TokenType } from './lexer.ts';
import { parse } from './parser.ts';
import { generate } from './codegen.ts';
import { buildSymbolTable } from './symbol-table.ts';
import type { InterfaceDecl, FunctionBlockDecl, MethodDecl } from './ast.ts';

// ============================================================================
// Lexer Tests
// ============================================================================

describe('OOP Lexer', () => {
    it('should tokenize INTERFACE keyword', () => {
        const tokens = tokenize('INTERFACE');
        expect(tokens[0].type).toBe(TokenType.INTERFACE);
    });

    it('should tokenize END_INTERFACE keyword', () => {
        const tokens = tokenize('END_INTERFACE');
        expect(tokens[0].type).toBe(TokenType.END_INTERFACE);
    });

    it('should tokenize METHOD keyword', () => {
        const tokens = tokenize('METHOD');
        expect(tokens[0].type).toBe(TokenType.METHOD);
    });

    it('should tokenize END_METHOD keyword', () => {
        const tokens = tokenize('END_METHOD');
        expect(tokens[0].type).toBe(TokenType.END_METHOD);
    });

    it('should tokenize EXTENDS keyword', () => {
        const tokens = tokenize('EXTENDS');
        expect(tokens[0].type).toBe(TokenType.EXTENDS);
    });

    it('should tokenize IMPLEMENTS keyword', () => {
        const tokens = tokenize('IMPLEMENTS');
        expect(tokens[0].type).toBe(TokenType.IMPLEMENTS);
    });

    it('should tokenize THIS keyword', () => {
        const tokens = tokenize('THIS');
        expect(tokens[0].type).toBe(TokenType.THIS);
    });

    it('should tokenize access specifiers', () => {
        expect(tokenize('PUBLIC')[0].type).toBe(TokenType.PUBLIC);
        expect(tokenize('PRIVATE')[0].type).toBe(TokenType.PRIVATE);
        expect(tokenize('PROTECTED')[0].type).toBe(TokenType.PROTECTED);
    });

    it('should tokenize method modifiers', () => {
        expect(tokenize('FINAL')[0].type).toBe(TokenType.FINAL);
        expect(tokenize('ABSTRACT')[0].type).toBe(TokenType.ABSTRACT);
        expect(tokenize('OVERRIDE')[0].type).toBe(TokenType.OVERRIDE);
    });
});

// ============================================================================
// Parser Tests - INTERFACE
// ============================================================================

describe('INTERFACE Parser', () => {
    it('should parse simple interface declaration', () => {
        const source = `
INTERFACE IMotor
    METHOD Start : BOOL
    END_METHOD
    METHOD Stop : BOOL
    END_METHOD
END_INTERFACE`;
        const ast = parse(source);

        expect(ast.interfaces.length).toBe(1);
        const iface = ast.interfaces[0] as InterfaceDecl;
        expect(iface.name).toBe('IMotor');
        expect(iface.methods.length).toBe(2);
        expect(iface.methods[0].name).toBe('Start');
        expect(iface.methods[0].returnType).toBe('BOOL');
        expect(iface.methods[1].name).toBe('Stop');
    });

    it('should parse interface with EXTENDS', () => {
        const source = `
INTERFACE IExtendedMotor EXTENDS IMotor
    METHOD GetSpeed : INT
    END_METHOD
END_INTERFACE`;
        const ast = parse(source);

        const iface = ast.interfaces[0] as InterfaceDecl;
        expect(iface.name).toBe('IExtendedMotor');
        expect(iface.extends).toEqual(['IMotor']);
    });

    it('should parse interface with multiple extends', () => {
        const source = `
INTERFACE IAdvanced EXTENDS IMotor, ISensor
    METHOD Calibrate : BOOL
    END_METHOD
END_INTERFACE`;
        const ast = parse(source);

        const iface = ast.interfaces[0] as InterfaceDecl;
        expect(iface.extends).toEqual(['IMotor', 'ISensor']);
    });

    it('should parse interface method with inputs', () => {
        const source = `
INTERFACE IController
    METHOD SetSpeed : BOOL
    VAR_INPUT
        Speed : INT;
        Acceleration : INT;
    END_VAR
    END_METHOD
END_INTERFACE`;
        const ast = parse(source);

        const method = ast.interfaces[0].methods[0];
        expect(method.inputs.length).toBe(2);
        expect(method.inputs[0].name).toBe('Speed');
        expect(method.inputs[1].name).toBe('Acceleration');
    });
});

// ============================================================================
// Parser Tests - FUNCTION_BLOCK with OOP
// ============================================================================

describe('FUNCTION_BLOCK OOP Parser', () => {
    it('should parse FB with IMPLEMENTS', () => {
        const source = `
FUNCTION_BLOCK FB_Motor IMPLEMENTS IMotor
VAR
    Running : BOOL;
END_VAR

METHOD PUBLIC Start : BOOL
    Running := TRUE;
    Start := TRUE;
END_METHOD

METHOD PUBLIC Stop : BOOL
    Running := FALSE;
    Stop := TRUE;
END_METHOD

END_FUNCTION_BLOCK`;
        const ast = parse(source);

        expect(ast.functionBlocks.length).toBe(1);
        const fb = ast.functionBlocks[0] as FunctionBlockDecl;
        expect(fb.name).toBe('FB_Motor');
        expect(fb.implements).toEqual(['IMotor']);
        expect(fb.methods.length).toBe(2);
    });

    it('should parse FB with EXTENDS', () => {
        const source = `
FUNCTION_BLOCK FB_AdvancedMotor EXTENDS FB_Motor
VAR
    Speed : INT;
END_VAR

METHOD PUBLIC SetSpeed : BOOL
VAR_INPUT
    NewSpeed : INT;
END_VAR
    Speed := NewSpeed;
    SetSpeed := TRUE;
END_METHOD

END_FUNCTION_BLOCK`;
        const ast = parse(source);

        const fb = ast.functionBlocks[0] as FunctionBlockDecl;
        expect(fb.name).toBe('FB_AdvancedMotor');
        expect(fb.extends).toBe('FB_Motor');
    });

    it('should parse FB with both EXTENDS and IMPLEMENTS', () => {
        const source = `
FUNCTION_BLOCK FB_SmartMotor EXTENDS FB_Motor IMPLEMENTS IController, IDiagnostics
VAR
    DiagCode : INT;
END_VAR
END_FUNCTION_BLOCK`;
        const ast = parse(source);

        const fb = ast.functionBlocks[0] as FunctionBlockDecl;
        expect(fb.extends).toBe('FB_Motor');
        expect(fb.implements).toEqual(['IController', 'IDiagnostics']);
    });

    it('should parse METHOD with access specifier', () => {
        const source = `
FUNCTION_BLOCK FB_Test
VAR
    Value : INT;
END_VAR

METHOD PUBLIC GetValue : INT
    GetValue := Value;
END_METHOD

METHOD PRIVATE InternalCalc : INT
    InternalCalc := Value * 2;
END_METHOD

END_FUNCTION_BLOCK`;
        const ast = parse(source);

        const fb = ast.functionBlocks[0];
        expect(fb.methods[0].accessSpecifier).toBe('PUBLIC');
        expect(fb.methods[1].accessSpecifier).toBe('PRIVATE');
    });

    it('should parse METHOD with OVERRIDE modifier', () => {
        const source = `
FUNCTION_BLOCK FB_Child EXTENDS FB_Parent
METHOD PUBLIC OVERRIDE Calculate : INT
    Calculate := 42;
END_METHOD
END_FUNCTION_BLOCK`;
        const ast = parse(source);

        const method = ast.functionBlocks[0].methods[0];
        expect(method.isOverride).toBe(true);
        expect(method.accessSpecifier).toBe('PUBLIC');
    });

    it('should parse METHOD with FINAL modifier', () => {
        const source = `
FUNCTION_BLOCK FB_Base
METHOD PUBLIC FINAL Lock : BOOL
    Lock := TRUE;
END_METHOD
END_FUNCTION_BLOCK`;
        const ast = parse(source);

        const method = ast.functionBlocks[0].methods[0];
        expect(method.isFinal).toBe(true);
    });
});

// ============================================================================
// Parser Tests - THIS keyword
// ============================================================================

describe('THIS Keyword Parser', () => {
    it('should parse THIS.member access', () => {
        const source = `
FUNCTION_BLOCK FB_Counter
VAR
    Count : INT;
END_VAR

METHOD PUBLIC Increment : INT
    THIS.Count := THIS.Count + 1;
    Increment := THIS.Count;
END_METHOD

END_FUNCTION_BLOCK`;
        const ast = parse(source);

        const method = ast.functionBlocks[0].methods[0];
        expect(method.body.length).toBe(2);
        // The first statement should be an assignment with THIS.Count on both sides
    });
});

// ============================================================================
// Symbol Table Tests
// ============================================================================

describe('OOP Symbol Table', () => {
    it('should register interface definitions', () => {
        const source = `
INTERFACE ITest
    METHOD DoSomething : BOOL
    END_METHOD
END_INTERFACE

PROGRAM Main
VAR
    x : BOOL;
END_VAR
END_PROGRAM`;
        const ast = parse(source);
        const symbols = buildSymbolTable(ast);

        const iface = symbols.getInterfaceDefinition('ITest');
        expect(iface).toBeDefined();
        expect(iface!.name).toBe('ITest');
        expect(iface!.methods.has('DoSomething')).toBe(true);
    });

    it('should register FB with OOP info', () => {
        const source = `
FUNCTION_BLOCK FB_Counter
VAR
    Count : INT;
END_VAR

METHOD PUBLIC Increment : INT
    Count := Count + 1;
    Increment := Count;
END_METHOD

END_FUNCTION_BLOCK

PROGRAM Main
VAR
    counter : FB_Counter;
END_VAR
END_PROGRAM`;
        const ast = parse(source);
        const symbols = buildSymbolTable(ast);

        const fb = symbols.getFBDefinition('FB_Counter');
        expect(fb).toBeDefined();
        expect(fb!.methods.has('Increment')).toBe(true);

        const methodInfo = symbols.getMethodInfo('FB_Counter', 'Increment');
        expect(methodInfo).toBeDefined();
        expect(methodInfo!.returnType).toBe('INT');
        expect(methodInfo!.label).toBe('FB_Counter__Increment');
    });

    it('should check if FB has method', () => {
        const source = `
FUNCTION_BLOCK FB_Test
METHOD PUBLIC Test : BOOL
    Test := TRUE;
END_METHOD
END_FUNCTION_BLOCK

PROGRAM Main
END_PROGRAM`;
        const ast = parse(source);
        const symbols = buildSymbolTable(ast);

        expect(symbols.hasMethod('FB_Test', 'Test')).toBe(true);
        expect(symbols.hasMethod('FB_Test', 'NonExistent')).toBe(false);
    });

    it('should handle FB inheritance (EXTENDS) in Symbol Table', () => {
        const source = `
FUNCTION_BLOCK FB_Base
VAR
    BaseVal : INT;
END_VAR
METHOD PUBLIC BaseMethod : BOOL
    BaseMethod := TRUE;
END_METHOD
END_FUNCTION_BLOCK

FUNCTION_BLOCK FB_Child EXTENDS FB_Base
VAR
    ChildVal : INT;
END_VAR
METHOD PUBLIC ChildMethod : BOOL
    ChildMethod := TRUE;
END_METHOD
END_FUNCTION_BLOCK

PROGRAM Main
END_PROGRAM`;
        const ast = parse(source);
        const symbols = buildSymbolTable(ast);

        const child = symbols.getFBDefinition('FB_Child');
        expect(child).toBeDefined();
        
        // Check inherited members
        expect(child!.members.has('BaseVal')).toBe(true);
        expect(child!.members.has('ChildVal')).toBe(true);
        
        // Check inherited methods
        expect(child!.methods.has('BaseMethod')).toBe(true);
        expect(child!.methods.has('ChildMethod')).toBe(true);
        
        // Check offsets
        const baseVal = child!.members.get('BaseVal')!;
        const childVal = child!.members.get('ChildVal')!;
        expect(baseVal.offset).toBe(0);
        expect(childVal.offset).toBeGreaterThanOrEqual(2); // After BaseVal
    });

    it('should validate that FB implements interface methods', () => {
        const source = `
INTERFACE IMotor
    METHOD Start : BOOL
    END_METHOD
END_INTERFACE

FUNCTION_BLOCK FB_Motor IMPLEMENTS IMotor
    METHOD PUBLIC Start : BOOL
        Start := TRUE;
    END_METHOD
END_FUNCTION_BLOCK

PROGRAM Main
END_PROGRAM`;
        const ast = parse(source);
        expect(() => buildSymbolTable(ast)).not.toThrow();
    });

    it('should throw error if FB does not implement interface method', () => {
        const source = `
INTERFACE IMotor
    METHOD Start : BOOL
    END_METHOD
END_INTERFACE

FUNCTION_BLOCK FB_BrokenMotor IMPLEMENTS IMotor
    (* Missing Start method *)
END_FUNCTION_BLOCK

PROGRAM Main
END_PROGRAM`;
        const ast = parse(source);
        expect(() => buildSymbolTable(ast)).toThrow(/missing required method 'Start'/);
    });

    it('should throw error if method signature does not match interface', () => {
        const source = `
INTERFACE IMotor
    METHOD Start : BOOL
    END_METHOD
END_INTERFACE

FUNCTION_BLOCK FB_WrongMotor IMPLEMENTS IMotor
    METHOD PUBLIC Start : INT (* Wrong return type *)
        Start := 1;
    END_METHOD
END_FUNCTION_BLOCK

PROGRAM Main
END_PROGRAM`;
        const ast = parse(source);
        expect(() => buildSymbolTable(ast)).toThrow(/requires 'BOOL'/);
    });

    it('should validate method OVERRIDE', () => {
        const source = `
FUNCTION_BLOCK FB_Base
METHOD PUBLIC Test : BOOL
    Test := TRUE;
END_METHOD
END_FUNCTION_BLOCK

FUNCTION_BLOCK FB_Child EXTENDS FB_Base
METHOD PUBLIC OVERRIDE Test : BOOL
    Test := FALSE;
END_METHOD
END_FUNCTION_BLOCK

PROGRAM Main
END_PROGRAM`;
        const ast = parse(source);
        expect(() => buildSymbolTable(ast)).not.toThrow();
    });

    it('should throw error if OVERRIDE missing on existing method', () => {
        const source = `
FUNCTION_BLOCK FB_Base
METHOD PUBLIC Test : BOOL
END_METHOD
END_FUNCTION_BLOCK

FUNCTION_BLOCK FB_Child EXTENDS FB_Base
METHOD PUBLIC Test : BOOL (* Missing OVERRIDE *)
END_METHOD
END_FUNCTION_BLOCK

PROGRAM Main
END_PROGRAM`;
        const ast = parse(source);
        expect(() => buildSymbolTable(ast)).toThrow(/hides inherited method/);
    });

    it('should throw error if OVERRIDE on non-existent method', () => {
        const source = `
FUNCTION_BLOCK FB_Base
END_FUNCTION_BLOCK

FUNCTION_BLOCK FB_Child EXTENDS FB_Base
METHOD PUBLIC OVERRIDE Test : BOOL
END_METHOD
END_FUNCTION_BLOCK

PROGRAM Main
END_PROGRAM`;
        const ast = parse(source);
        expect(() => buildSymbolTable(ast)).toThrow(/no base method found/);
    });

    it('should throw error if overriding FINAL method', () => {
        const source = `
FUNCTION_BLOCK FB_Base
METHOD PUBLIC FINAL Test : BOOL
END_METHOD
END_FUNCTION_BLOCK

FUNCTION_BLOCK FB_Child EXTENDS FB_Base
METHOD PUBLIC OVERRIDE Test : BOOL
END_METHOD
END_FUNCTION_BLOCK

PROGRAM Main
END_PROGRAM`;
        const ast = parse(source);
        expect(() => buildSymbolTable(ast)).toThrow(/Cannot override FINAL method/);
    });
});

// ============================================================================
// CodeGen Tests
// ============================================================================

describe('OOP CodeGen', () => {
    it('should generate code for method call', () => {
        const source = `
FUNCTION_BLOCK FB_Simple
VAR
    Value : INT;
END_VAR

METHOD PUBLIC GetValue : INT
    GetValue := Value;
END_METHOD

END_FUNCTION_BLOCK

PROGRAM Main
VAR
    obj : FB_Simple;
    result : INT;
END_VAR
    result := obj.GetValue();
END_PROGRAM`;
        const ast = parse(source);
        const code = generate(ast);

        // Should contain method call inline
        expect(code).toContain('Method call');
        expect(code).toContain('FB_Simple.GetValue');
    });

    it('should generate code for inherited method call', () => {
        const source = `
FUNCTION_BLOCK FB_Base
METHOD PUBLIC BaseMethod : INT
    BaseMethod := 123;
END_METHOD
END_FUNCTION_BLOCK

FUNCTION_BLOCK FB_Child EXTENDS FB_Base
END_FUNCTION_BLOCK

PROGRAM Main
VAR
    obj : FB_Child;
    res : INT;
END_VAR
    res := obj.BaseMethod();
END_PROGRAM`;
        const ast = parse(source);
        const code = generate(ast);

        // Should contain method call inline
        expect(code).toContain('Method call: obj.BaseMethod()');
        // It should use FB_Child.BaseMethod logic (inherited copy)
        expect(code).toContain('FB_Child.BaseMethod'); 
        expect(code).toContain('PUSH8 123');
    });

    it('should handle METHOD inputs (VAR_INPUT)', () => {
        const source = `
FUNCTION_BLOCK FB_Calc
METHOD PUBLIC Add : INT
VAR_INPUT
    A : INT;
    B : INT;
END_VAR
    Add := A + B;
END_METHOD
END_FUNCTION_BLOCK

PROGRAM Main
VAR
    calc : FB_Calc;
    res : INT;
END_VAR
    res := calc.Add(10, 20);
END_PROGRAM`;
        const ast = parse(source);
        const code = generate(ast);

        // Should store args to mangled vars
        // __M_FB_Calc_Add_A
        // __M_FB_Calc_Add_B
        
        expect(code).toContain('Arg A := ...');
        expect(code).toContain('PUSH8 10');
        expect(code).toContain('STORE'); // Storing A
        
        expect(code).toContain('Arg B := ...');
        expect(code).toContain('PUSH8 20');
        expect(code).toContain('STORE'); // Storing B
        
        expect(code).toContain('ADD');
    });

    it('should handle METHOD named parameters', () => {
        const source = `
FUNCTION_BLOCK FB_Calc
METHOD PUBLIC Sub : INT
VAR_INPUT
    A : INT;
    B : INT;
END_VAR
    Sub := A - B;
END_METHOD
END_FUNCTION_BLOCK

PROGRAM Main
VAR
    calc : FB_Calc;
    res : INT;
END_VAR
    res := calc.Sub(A := 10, B := 5);
    res := calc.Sub(B := 5, A := 10);
END_PROGRAM`;
        const ast = parse(source);
        const code = generate(ast);

        expect(code).toContain('Arg A := ...');
        expect(code).toContain('Arg B := ...');
    });
});
