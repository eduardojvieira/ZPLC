import { describe, it, expect } from 'bun:test';
import { parse } from './parser.ts';
import { generate } from './codegen.ts';

describe('New Data Types', () => {
    it('should compile WSTRING literal', () => {
        const source = `
PROGRAM Main
VAR
    w : WSTRING;
END_VAR
    w := "Hello";
END_PROGRAM`;
        const ast = parse(source);
        const code = generate(ast);
        expect(code).toContain('PUSH32'); // Address of string (pointer)
        expect(code).toContain('STORE'); 
    });

    it('should compile DATE literal', () => {
        const source = `
PROGRAM Main
VAR
    d : DATE;
END_VAR
    d := D#1990-01-01;
END_PROGRAM`;
        const ast = parse(source);
        const code = generate(ast);
        // Date.parse('1990-01-01') / 1000 = 631152000 (UTC)
        expect(code).toContain('PUSH32 631152000');
    });

    it('should compile TOD literal', () => {
        const source = `
PROGRAM Main
VAR
    t : TOD;
END_VAR
    t := TOD#12:00:00;
END_PROGRAM`;
        const ast = parse(source);
        const code = generate(ast);
        // 12*3600*1000 = 43200000
        expect(code).toContain('PUSH32 43200000');
    });

    it('should compile DT literal', () => {
        const source = `
PROGRAM Main
VAR
    dt_val : DT;
END_VAR
    dt_val := DT#1990-01-01-12:00:00;
END_PROGRAM`;
        const ast = parse(source);
        const code = generate(ast);
        // 631195200000 = 0x92FA8C9D80
        // Low 32-bit:  0xFA8C9D80 = -92704384 (signed) or 4202262912 (unsigned)
        // High 32-bit: 0x92 = 146
        // ISA doesn't have PUSH64, so we use two PUSH32 (low first, then high)
        // Then STORE64 pops high first, then low
        expect(code).toContain('PUSH32');  // Two PUSH32 for 64-bit value
        expect(code).toContain('STORE64 0x2000'); // 64-bit store
    });
});
