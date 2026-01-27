import { describe, it, expect } from 'bun:test';
import { parse } from './parser.ts';
import { generate } from './codegen.ts';

describe('VAR_TEMP', () => {
    it('should initialize VAR_TEMP on method call', () => {
        const source = `
FUNCTION_BLOCK FB_Temp
METHOD PUBLIC Test : INT
VAR_TEMP
    tmp : INT := 10;
END_VAR
    tmp := tmp + 1;
    Test := tmp;
END_METHOD
END_FUNCTION_BLOCK

PROGRAM Main
VAR
    fb : FB_Temp;
    res1 : INT;
    res2 : INT;
END_VAR
    res1 := fb.Test(); (* Should be 11 *)
    res2 := fb.Test(); (* Should be 11 again, not 12 *)
END_PROGRAM`;
        const ast = parse(source);
        const code = generate(ast);

        // Check for init code
        expect(code).toContain('; Init tmp := ...');
        expect(code).toContain('PUSH8 10');
        expect(code).toContain('STORE16');
    });
    
    it('should default initialize VAR_TEMP to 0', () => {
        const source = `
FUNCTION_BLOCK FB_TempZero
METHOD PUBLIC Test : INT
VAR_TEMP
    tmp : INT;
END_VAR
    Test := tmp;
END_METHOD
END_FUNCTION_BLOCK

PROGRAM Main
VAR
    fb : FB_TempZero;
    res : INT;
END_VAR
    res := fb.Test();
END_PROGRAM`;
        const ast = parse(source);
        const code = generate(ast);

        expect(code).toContain('; Init tmp := 0');
        expect(code).toContain('PUSH32 0');
        expect(code).toContain('STORE16');
    });
});
