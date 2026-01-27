import { describe, it, expect } from 'bun:test';
import { parse } from './parser.ts';
import { generate } from './codegen.ts';

describe('Standard Library Compilation', () => {
    it('should compile CTD usage', () => {
        const source = `
PROGRAM Main
VAR
    myCtd : CTD;
    cd : BOOL;
    ld : BOOL;
    pv : INT;
    q : BOOL;
    cv : INT;
END_VAR
    myCtd(CD := cd, LD := ld, PV := pv);
    q := myCtd.Q;
    cv := myCtd.CV;
END_PROGRAM`;
        const ast = parse(source);
        const code = generate(ast);
        expect(code).toContain('CTD Count Down Logic');
        expect(code).toContain('SUB'); // Decrement
    });

    it('should compile CTUD usage', () => {
        const source = `
PROGRAM Main
VAR
    myCtud : CTUD;
    cu : BOOL;
    cd : BOOL;
    r : BOOL;
    ld : BOOL;
    pv : INT;
END_VAR
    myCtud(CU := cu, CD := cd, R := r, LD := ld, PV := pv);
END_PROGRAM`;
        const ast = parse(source);
        const code = generate(ast);
        expect(code).toContain('CTUD Count Up/Down Logic');
        expect(code).toContain('ADD');
        expect(code).toContain('SUB');
    });

    it('should compile PID_Compact usage', () => {
        const source = `
PROGRAM Main
VAR
    myPid : PID_Compact;
    sp : REAL;
    pv : REAL;
    out : REAL;
END_VAR
    myPid(SP := sp, PV := pv, KP := 1.0, KI := 0.1, KD := 0.0, DT := 0.01);
    out := myPid.OUT;
END_PROGRAM`;
        const ast = parse(source);
        const code = generate(ast);
        expect(code).toContain('PID_Compact Logic');
        expect(code).toContain('MULF');
        expect(code).toContain('ADDF');
    });

    it('should compile FIFO usage', () => {
        const source = `
PROGRAM Main
VAR
    myFifo : FIFO;
    push : BOOL;
    data : DINT;
END_VAR
    myFifo(PUSH := push, DATA_IN := data, SIZE := 16);
END_PROGRAM`;
        const ast = parse(source);
        const code = generate(ast);
        expect(code).toContain('FIFO Logic');
        expect(code).toContain('STOREI32'); // Indirect store to buffer
    });

    it('should compile HYSTERESIS usage', () => {
        const source = `
PROGRAM Main
VAR
    hyst : HYSTERESIS;
    val : REAL;
END_VAR
    hyst(IN := val, HIGH := 10.0, LOW := 5.0);
END_PROGRAM`;
        const ast = parse(source);
        const code = generate(ast);
        expect(code).toContain('HYSTERESIS Logic');
        expect(code).toContain('GT');
        expect(code).toContain('LT');
    });
});
