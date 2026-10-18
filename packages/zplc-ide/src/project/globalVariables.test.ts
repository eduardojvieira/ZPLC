import { describe, expect, it } from 'bun:test';
import { globalVariablesOf, projectGlobalVariables } from './globalVariables';

const SOURCE = `VAR_GLOBAL
  Counter : INT;
  Running : BOOL;
END_VAR
VAR_GLOBAL CONSTANT
  Limit : INT := 10;
END_VAR
PROGRAM Main
VAR x : INT; END_VAR
  x := Limit;
END_PROGRAM
`;

describe('global variables of a source file (UX-012)', () => {
  it('UX-012 lists every variable of every VAR_GLOBAL block with its position and whether the block is constant', () => {
    const found = globalVariablesOf('src/Globals.st', SOURCE);
    expect(found.map((entry) => [entry.name, entry.constant])).toEqual([['Counter', false], ['Running', false], ['Limit', true]]);
    expect(found.every((entry) => entry.file === 'src/Globals.st' && entry.line >= 2)).toBe(true);
  });

  it('UX-012 reads nothing from a file that does not parse, and nothing from a file that is not Structured Text', () => {
    expect(globalVariablesOf('src/Broken.st', 'VAR_GLOBAL x : ;;')).toEqual([]);
    expect(projectGlobalVariables([{ path: 'src/A.fbd.json', content: SOURCE, language: 'FBD' }])).toEqual([]);
  });

  it('UX-012 orders the project by file path', () => {
    const found = projectGlobalVariables([
      { path: 'src/B.st', content: 'VAR_GLOBAL b : INT; END_VAR', language: 'ST' },
      { path: 'src/A.st', content: 'VAR_GLOBAL a : INT; END_VAR', language: 'ST' },
    ]);
    expect(found.map((entry) => entry.name)).toEqual(['a', 'b']);
  });
});
