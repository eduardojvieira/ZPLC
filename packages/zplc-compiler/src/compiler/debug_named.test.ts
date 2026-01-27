import { describe, it, expect } from 'bun:test';
import { parse } from './parser.ts';
import { generate } from './codegen.ts';
import { buildSymbolTable } from './symbol-table.ts';

describe('Debug Named Params', () => {
    it('should compile named params correctly', () => {
        const source = `
FUNCTION_BLOCK FB_Calc
    METHOD PUBLIC Add : REAL
        VAR_INPUT A : REAL; B : REAL; END_VAR
        Add := A + B;
    END_METHOD
END_FUNCTION_BLOCK

PROGRAM NamedParamsTest
    VAR
        calc : FB_Calc;
        res : REAL;
    END_VAR
    res := calc.Add(A := 10.0, B := 20.0);
END_PROGRAM`;
        const ast = parse(source);
        const symbols = buildSymbolTable(ast);
        const code = generate(ast);
        
        console.log(code);
        console.log(symbols.dump());
    });
});
