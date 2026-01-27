import { describe, it, expect } from 'bun:test';
import { parse } from './parser.ts';
import { generate } from './codegen.ts';
import { buildSymbolTable } from './symbol-table.ts';

describe('ENUM Types', () => {
    it('should parse and compile ENUM declaration and usage', () => {
        const source = `
TYPE Color : (Red, Green, Blue); END_TYPE

PROGRAM Main
VAR
    c : Color;
    val : INT;
END_VAR
    c := Green;
    val := c;
END_PROGRAM`;
        const ast = parse(source);
        const symbols = buildSymbolTable(ast);
        const code = generate(ast);

        // Check symbols
        const enumDef = symbols.getEnumDefinition('Color');
        expect(enumDef).toBeDefined();
        expect(enumDef!.values.get('Red')).toBe(0);
        expect(enumDef!.values.get('Green')).toBe(1);
        expect(enumDef!.values.get('Blue')).toBe(2);

        // Check globals (Red, Green, Blue)
        expect(symbols.get('Red')).toBeDefined();
        
        // Check code
        // c := Green -> Green is 1 -> PUSH8 1
        expect(code).toContain('PUSH8 1');
    });

    it('should handle explicit ENUM values', () => {
        const source = `
TYPE Status : (Idle := 0, Running := 10, Error := 99); END_TYPE

PROGRAM Main
VAR
    s : Status;
END_VAR
    s := Error;
END_PROGRAM`;
        const ast = parse(source);
        const symbols = buildSymbolTable(ast);
        const code = generate(ast);

        const enumDef = symbols.getEnumDefinition('Status');
        expect(enumDef!.values.get('Running')).toBe(10);
        expect(enumDef!.values.get('Error')).toBe(99);

        // Error is 99
        expect(code).toContain('PUSH8 99');
    });
});
