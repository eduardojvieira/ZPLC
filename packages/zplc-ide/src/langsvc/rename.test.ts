// LNG-016: rename symbol is scope-correct across programs and files, and never a text replace.
import { describe, expect, it } from 'bun:test';
import { buildProjectIndex } from './projectIndex';
import { applyRenameEdits, isRenameableName, prepareRename, renameSymbol } from './rename';

const LIB = `FUNCTION_BLOCK Motor
VAR_INPUT
  Start : BOOL;
END_VAR
VAR_OUTPUT
  Running : BOOL;
END_VAR
VAR
  Count : INT;
END_VAR
  Running := Start;
  Count := Count + 1;
END_FUNCTION_BLOCK

FUNCTION_BLOCK Pump EXTENDS Motor
VAR
  Boost : BOOL;
END_VAR
  Running := Start AND Boost;
  Count := 0;
END_FUNCTION_BLOCK
`;

const MAIN = `PROGRAM Main
VAR
  M : Motor;
  P : Pump;
  Count : INT;
  Run : BOOL;
END_VAR
  M(Start := Run);
  P(Start := Run);
  Count := Count + 1;
  Run := M.Running OR P.Running;
  IF Count > 3 THEN Count := 0; END_IF;
END_PROGRAM
`;

const OTHER = `PROGRAM Other
VAR
  Count : DINT;
  Run : BOOL;
  Motor_Count : INT;
END_VAR
  Count := Count + 1;
  Run := TRUE;
  Motor_Count := 0;
END_PROGRAM
`;

const files = [
  { path: 'src/lib/blocks.st', content: LIB },
  { path: 'src/main.st', content: MAIN },
  { path: 'src/other.st', content: OTHER },
];
const index = buildProjectIndex(files);
const where = (file: string, text: string, nth = 1): { line: number; column: number } => {
  const content = files.find((entry) => entry.path === file)!.content;
  let from = -1;
  for (let count = 0; count < nth; count++) from = content.indexOf(text, from + 1);
  const before = content.slice(0, from);
  return { line: before.split('\n').length, column: from - before.lastIndexOf('\n') };
};
const renamed = (file: string, text: string, name: string, nth = 1) => {
  const at = where(file, text, nth);
  const result = renameSymbol(index, file, at.line, at.column, name);
  if (!result.ok) return result;
  const out: Record<string, string> = {};
  for (const entry of files) {
    const own = result.edits.filter((edit) => edit.file === entry.path);
    if (own.length > 0) out[entry.path] = applyRenameEdits(entry.content, own);
  }
  return { ok: true as const, result, out };
};

describe('rename symbol (LNG-016)', () => {
  it('renames a variable of one program and leaves the same name in another program alone', () => {
    const done = renamed('src/main.st', 'Count : INT', 'Total');
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(Object.keys(done.out)).toEqual(['src/main.st']);
    expect(done.out['src/main.st']).toContain('Total : INT');
    expect(done.out['src/main.st']).toContain('Total := Total + 1;');
    expect(done.out['src/main.st']).toContain('IF Total > 3 THEN Total := 0;');
    // the program that has its own Count is untouched, and the block's Count is not the program's
    expect(done.result.edits.every((edit) => edit.file === 'src/main.st')).toBe(true);
    expect(done.result.edits).toHaveLength(5);
  });

  it('renames a member of a block where it is read through the block and through one that extends it', () => {
    const done = renamed('src/lib/blocks.st', 'Running : BOOL', 'IsRunning');
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.result.files).toEqual(['src/lib/blocks.st', 'src/main.st']);
    expect(done.out['src/lib/blocks.st']).toContain('IsRunning := Start;');
    expect(done.out['src/lib/blocks.st']).toContain('IsRunning := Start AND Boost;');
    expect(done.out['src/main.st']).toContain('Run := M.IsRunning OR P.IsRunning;');
    expect(done.out['src/main.st']).toContain('Run : BOOL;');
  });

  it('renames a block at its declaration and at every use, in every file', () => {
    const done = renamed('src/main.st', 'Motor;', 'Drive');
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.out['src/lib/blocks.st']).toContain('FUNCTION_BLOCK Drive\n');
    expect(done.out['src/lib/blocks.st']).toContain('FUNCTION_BLOCK Pump EXTENDS Drive\n');
    expect(done.out['src/main.st']).toContain('M : Drive;');
  });

  it('renames the label of a named argument with the parameter', () => {
    const done = renamed('src/lib/blocks.st', 'Start : BOOL', 'Enable');
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.out['src/main.st']).toContain('M(Enable := Run);');
    expect(done.out['src/main.st']).toContain('P(Enable := Run);');
  });

  it('does not change a longer name that contains the old one', () => {
    const done = renamed('src/other.st', 'Count : DINT', 'Tally');
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.out['src/other.st']).toContain('Motor_Count : INT;');
    expect(done.out['src/other.st']).toContain('Tally := Tally + 1;');
  });

  it('refuses a name that the scope already has', () => {
    const at = where('src/main.st', 'Count : INT');
    const result = renameSymbol(index, 'src/main.st', at.line, at.column, 'Run');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('already declared');
  });

  it('refuses a name that is another member of the block or of one that extends it', () => {
    const at = where('src/lib/blocks.st', 'Running : BOOL');
    const result = renameSymbol(index, 'src/lib/blocks.st', at.line, at.column, 'Boost');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('Boost');
  });

  it('refuses what is not a name, a keyword, the standard library, a program, and a name with nothing declared', () => {
    const at = where('src/main.st', 'Count : INT');
    for (const bad of ['1abc', 'a-b', 'IF', '', 'END_VAR']) {
      const result = renameSymbol(index, 'src/main.st', at.line, at.column, bad);
      expect(result.ok).toBe(false);
    }
    const program = where('src/main.st', 'Main');
    expect(prepareRename(index, 'src/main.st', program.line, program.column).ok).toBe(false);
    expect(prepareRename(index, 'src/main.st', 1, 1).ok).toBe(false);
    expect(isRenameableName('Total_2')).toBe(true);
    expect(isRenameableName('while')).toBe(false);
  });

  it('refuses while a file of the project has a syntax error, because it could hold a reference', () => {
    const broken = buildProjectIndex([...files.slice(0, 2), { path: 'src/other.st', content: OTHER.replace('Run := TRUE;', 'Run := ;') }]);
    const at = where('src/main.st', 'Count : INT');
    const result = renameSymbol(broken, 'src/main.st', at.line, at.column, 'Total');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('src/other.st');
  });

  it('allows a change of case alone', () => {
    const done = renamed('src/main.st', 'Run : BOOL', 'RUN');
    expect(done.ok).toBe(true);
  });
});
