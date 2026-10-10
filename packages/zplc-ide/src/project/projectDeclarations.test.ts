/**
 * The declarations of a project, read from the compiler's parse of each Structured Text file (IDE-023): the programs,
 * function blocks, functions, interfaces and data types that the project tree lists under their file and that the
 * editors offer.
 */
import { describe, expect, it } from 'bun:test';

import { declarationsOf, projectDeclarations } from './projectDeclarations';

const LIBRARY = `FUNCTION_BLOCK Debounce
VAR_INPUT
  In : BOOL;
END_VAR
VAR_OUTPUT
  Out : BOOL;
END_VAR
END_FUNCTION_BLOCK

FUNCTION Scale : REAL
VAR_INPUT
  Raw : INT;
END_VAR
Scale := INT_TO_REAL(Raw) / 10.0;
END_FUNCTION

TYPE Point :
STRUCT
  X : INT;
  Y : INT;
END_STRUCT
END_TYPE

TYPE Mode : (Idle, Run, Fault);
END_TYPE
`;

describe('declarationsOf (IDE-023)', () => {
  it('lists function blocks, functions and data types with the line they are declared on', () => {
    const found = declarationsOf('lib/Library.st', LIBRARY).map(({ name, kind, line }) => `${kind} ${name}@${line}`);
    expect(found).toEqual(['FUNCTION_BLOCK Debounce@1', 'FUNCTION Scale@10', 'STRUCT Point@17', 'ENUM Mode@24']);
  });

  it('lists a program, an interface and a type alias too, in the order of the file', () => {
    const source = 'INTERFACE IMotor\nMETHOD Start : BOOL\nEND_METHOD\nEND_INTERFACE\n\nTYPE Speed : INT;\nEND_TYPE\n\nPROGRAM Main\nEND_PROGRAM\n';
    expect(declarationsOf('src/Main.st', source).map(({ name, kind }) => `${kind} ${name}`)).toEqual(['INTERFACE IMotor', 'TYPE Speed', 'PROGRAM Main']);
  });

  it('names the file on every declaration, so that activating one can open it', () => {
    expect(declarationsOf('lib/Library.st', LIBRARY).every((entry) => entry.file === 'lib/Library.st')).toBe(true);
  });

  it('is empty for a file that does not parse: its diagnostics come from the build', () => {
    expect(declarationsOf('src/Broken.st', 'FUNCTION_BLOCK Oops\nVAR_INPUT\n')).toEqual([]);
    expect(declarationsOf('src/Empty.st', '')).toEqual([]);
  });
});

describe('projectDeclarations (IDE-023)', () => {
  it('groups by file in path order, leaves out files that declare nothing and files of other languages', () => {
    const groups = projectDeclarations([
      { path: 'src/Main.st', content: 'PROGRAM Main\nEND_PROGRAM\n', language: 'ST' },
      { path: 'lib/Library.st', content: LIBRARY, language: 'ST' },
      { path: 'src/empty.st', content: '(* nothing *)', language: 'ST' },
      { path: 'src/pump.ld.json', content: '{"rungs":[]}', language: 'LD' },
    ]);
    expect(groups.map((group) => group.file)).toEqual(['lib/Library.st', 'src/Main.st']);
    expect(groups[0]!.declarations.map((entry) => entry.name)).toEqual(['Debounce', 'Scale', 'Point', 'Mode']);
  });
});
