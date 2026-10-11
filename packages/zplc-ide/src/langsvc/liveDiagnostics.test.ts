// LNG-015: every syntax and semantic error of the open project is shown while typing, from the compiler's front end.
import { describe, expect, it } from 'bun:test';
import { diagnosticsOf, LIVE_CHECK_FILE_LIMIT, liveDiagnostics } from './liveDiagnostics';

const MAIN = `PROGRAM Main
VAR
  Count : INT;
  M : Motor;
END_VAR
  Count := Count + 1;
  M(Start := TRUE);
END_PROGRAM
`;
const LIB = `FUNCTION_BLOCK Motor
VAR_INPUT
  Start : BOOL;
END_VAR
VAR_OUTPUT
  Running : BOOL;
END_VAR
  Running := Start;
END_FUNCTION_BLOCK
`;

describe('the live diagnostics of the project (LNG-015)', () => {
  it('has none for a project that builds', () => {
    expect(liveDiagnostics([{ path: 'src/main.st', content: MAIN }, { path: 'src/lib/motor.st', content: LIB }], 'src/main.st')).toEqual([]);
  });

  it('shows every syntax error of the buffer, with its range, and then the errors of the other files', () => {
    const typing = MAIN.replace('Count := Count + 1;', 'Count := ;\n  Count := 1 +;');
    const other = `PROGRAM Other\nVAR\n  Flag : BOOL;\nEND_VAR\n  Flag := Nope;\nEND_PROGRAM\n`;
    const found = liveDiagnostics([
      { path: 'src/lib/motor.st', content: LIB },
      { path: 'src/other.st', content: other },
      { path: 'src/main.st', content: typing },
    ], 'src/main.st');
    expect(found.map((each) => [each.file, each.line, each.code, each.type])).toEqual([
      ['src/main.st', 6, 'ST_PARSER', 'error'],
      ['src/main.st', 7, 'ST_PARSER', 'error'],
      ['src/other.st', 5, 'ST_SEMANTIC', 'error'],
    ]);
    expect(found[0]!.column).toBeGreaterThan(0);
    expect(found[0]!.endColumn).toBeGreaterThan(0);
    expect(found[2]!.message).toContain('Nope');
  });

  it('finds the semantic error that an edit in one file causes in another, and clears it when the edit is undone', () => {
    const renamed = LIB.replace('Running : BOOL;', 'IsRunning : BOOL;').replace('Running := Start;', 'IsRunning := Start;');
    const uses = MAIN.replace('Count : INT;', 'Count : INT;\n  Ready : BOOL;').replace('M(Start := TRUE);', 'M(Start := TRUE);\n  Ready := M.Running;');
    const broken = liveDiagnostics([{ path: 'src/main.st', content: uses }, { path: 'src/lib/motor.st', content: renamed }], 'src/lib/motor.st');
    expect(broken.map((each) => [each.file, each.code])).toEqual([['src/main.st', 'ST_SEMANTIC']]);
    const fixed = liveDiagnostics([{ path: 'src/main.st', content: uses }, { path: 'src/lib/motor.st', content: LIB }], 'src/lib/motor.st');
    expect(fixed).toEqual([]);
  });

  it('reports a warning of a project that builds', () => {
    const unused = MAIN.replace('Count : INT;', 'Count : INT;\n  Spare : INT;');
    const found = liveDiagnostics([{ path: 'src/main.st', content: unused }, { path: 'src/lib/motor.st', content: LIB }], 'src/main.st');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ code: 'ST_WARNING', type: 'warning', file: 'src/main.st' });
  });

  it('says that a file over the limit was not analysed, for the file that is open', () => {
    const huge = `(* ${'x'.repeat(LIVE_CHECK_FILE_LIMIT)} *)\nPROGRAM Big\nEND_PROGRAM\n`;
    const found = liveDiagnostics([{ path: 'src/big.st', content: huge }, { path: 'src/main.st', content: MAIN.replace('M : Motor;', '').replace('M(Start := TRUE);', '') }], 'src/big.st');
    expect(found).toMatchObject([{ code: 'ST_SOURCE_LIMIT', type: 'warning', file: 'src/big.st' }]);
  });

  it('selects the diagnostics of one file', () => {
    const all = liveDiagnostics([{ path: 'src/main.st', content: MAIN.replace('Count + 1', 'Count + Nope') }, { path: 'src/lib/motor.st', content: LIB.replace('Running := Start;', 'Running := ;') }], 'src/main.st');
    expect(diagnosticsOf(all, 'src/lib/motor.st').map((each) => each.code)).toEqual(['ST_PARSER']);
    expect(diagnosticsOf(all, 'src/main.st').map((each) => each.code)).toEqual(['ST_SEMANTIC']);
  });
});
