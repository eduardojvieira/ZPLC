/**
 * What the ST editor offers from the rest of the project (IDE-023): the function blocks, functions and data types that
 * other files and library folders declare, in completion and in hover. The standard library and the variables of the
 * buffer are covered by stLanguageService.test.ts.
 */
import { afterEach, describe, expect, it } from 'bun:test';

import { projectDeclarations, setProjectDeclarations } from '../project/projectDeclarations';
import { getSTCompletions, getSTHover } from './stLanguageService';

const LIBRARY = `FUNCTION_BLOCK Debounce
VAR_INPUT In : BOOL; END_VAR
VAR_OUTPUT Out : BOOL; END_VAR
END_FUNCTION_BLOCK

FUNCTION Scale : REAL
VAR_INPUT Raw : INT; END_VAR
Scale := INT_TO_REAL(Raw);
END_FUNCTION

TYPE Point :
STRUCT
  X : INT;
END_STRUCT
END_TYPE
`;
const declarations = () => projectDeclarations([{ path: 'lib/Library.st', content: LIBRARY, language: 'ST' }]).flatMap((group) => group.declarations);

afterEach(() => setProjectDeclarations([]));

describe('completion from the project (IDE-023)', () => {
  const MAIN = 'PROGRAM Main\nVAR\n  Local : BOOL;\nEND_VAR\n\nEND_PROGRAM\n';

  it('offers nothing of a library until the project has declarations', () => {
    expect(getSTCompletions(MAIN, 5).map((item) => item.label)).not.toContain('Debounce');
  });

  it('offers the function blocks, functions and types the project declares, with their kind and file', () => {
    setProjectDeclarations(declarations());
    const items = getSTCompletions(MAIN, 5);
    expect(items.find((item) => item.label === 'Debounce')).toMatchObject({ kind: 'functionBlock', detail: 'Project function block, lib/Library.st' });
    expect(items.find((item) => item.label === 'Scale')).toMatchObject({ kind: 'function', detail: 'Project function, lib/Library.st' });
    expect(items.find((item) => item.label === 'Point')).toMatchObject({ kind: 'type', detail: 'Project structure, lib/Library.st' });
  });

  it('keeps the variable of the buffer when a project declaration has the same name', () => {
    setProjectDeclarations([{ name: 'Local', kind: 'FUNCTION', file: 'lib/x.st', line: 1, column: 10 }]);
    expect(getSTCompletions(MAIN, 5).find((item) => item.label === 'Local')?.kind).toBe('variable');
  });
});

describe('hover over a name of the project (IDE-023)', () => {
  it('says what it is and where it is declared', () => {
    setProjectDeclarations(declarations());
    const hover = getSTHover('PROGRAM Main\nEND_PROGRAM\n', 'Debounce', 1);
    expect(hover?.value).toContain('**Debounce**');
    expect(hover?.value).toContain('function block');
    expect(hover?.value).toContain('lib/Library.st:1');
  });

  it('answers nothing for a name nobody declares', () => {
    setProjectDeclarations(declarations());
    expect(getSTHover('PROGRAM Main\nEND_PROGRAM\n', 'Nobody', 1)).toBeNull();
  });
});
