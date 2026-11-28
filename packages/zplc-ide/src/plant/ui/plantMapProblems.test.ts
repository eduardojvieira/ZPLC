import { describe, expect, it } from 'bun:test';
import { stubProjectLoader } from '../../test/dom';

await stubProjectLoader();
const { applyDeclarations } = await import('./plantMapProblems');

const block = 'VAR_INPUT\n  Belt1_run : BOOL;\nEND_VAR\n';
const text = { kind: 'text' as const, language: 'ST' as const, block };

describe('applyDeclarations in a text program (SCN-013)', () => {
  it('only a VAR-block declaration counts as declared, not an assignment', () => {
    const body = 'PROGRAM Main\n  VAR\n    Counter : INT;\n  END_VAR\n  belt1_run := TRUE;\nEND_PROGRAM\n';
    expect(applyDeclarations(body, text)?.added).toBe(1);
    const declared = 'PROGRAM Main\n  VAR\n    belt1_run : BOOL;\n  END_VAR\nEND_PROGRAM\n';
    expect(applyDeclarations(declared, text)?.added).toBe(0);
  });

  it('the block goes into the program of the map, not into a function block that comes first', () => {
    const body = 'FUNCTION_BLOCK Fb\nEND_FUNCTION_BLOCK\nPROGRAM Main\nEND_PROGRAM\n';
    const out = applyDeclarations(body, text, 'Main')!.content;
    expect(out.indexOf('Belt1_run')).toBeGreaterThan(out.indexOf('PROGRAM Main'));
    // with no program named, the first PROGRAM takes it, and a function block never does
    const first = applyDeclarations(body, text)!.content;
    expect(first.indexOf('Belt1_run')).toBeGreaterThan(first.indexOf('PROGRAM Main'));
    const other = 'PROGRAM A\nEND_PROGRAM\nPROGRAM B\nEND_PROGRAM\n';
    const inB = applyDeclarations(other, text, 'b')!.content;
    expect(inB.indexOf('Belt1_run')).toBeGreaterThan(inB.indexOf('PROGRAM B'));
  });

  it('a file with no PROGRAM cannot take the declarations', () => {
    expect(applyDeclarations('FUNCTION_BLOCK Fb\nEND_FUNCTION_BLOCK\n', text)).toBeNull();
    expect(applyDeclarations('x := 1;\n', text)).toBeNull();
  });

  it('the line ending of the file is kept', () => {
    const body = 'PROGRAM Main\r\nEND_PROGRAM\r\n';
    const out = applyDeclarations(body, text)!.content;
    expect(out).toContain('Belt1_run');
    expect(out.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('only a declaration inside the target program counts, not one of a function block before it', () => {
    const body = 'FUNCTION_BLOCK Fb\n  VAR_INPUT\n    Belt1_run : BOOL;\n  END_VAR\nEND_FUNCTION_BLOCK\nPROGRAM Main\nEND_PROGRAM\n';
    const out = applyDeclarations(body, text, 'Main')!;
    expect(out.added).toBe(1);
    expect(out.content.indexOf('Belt1_run', out.content.indexOf('PROGRAM Main'))).toBeGreaterThan(0);
  });
});
