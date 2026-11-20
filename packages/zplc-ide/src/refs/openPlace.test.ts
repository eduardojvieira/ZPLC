import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mock } from 'bun:test';
import { projectLoaderStub } from '../test/projectLoaderStub';
import type { ProjectFileWithHandle } from '../types';

await mock.module('../utils/projectLoader', () => projectLoaderStub());
const { useIDEStore } = await import('../store/useIDEStore');
const { useConfigEditors } = await import('../store/useConfigEditors');
const { pendingElementSelection, clearElementSelection } = await import('../editors/elementSelectionRequests');
const { openPlace } = await import('./openPlace');

const opened: Array<[string, number, number]> = [];
const before = { ...useIDEStore.getState() };
afterEach(() => {
  // the store outlives this file in the one test process: put back what the tests replaced
  useIDEStore.setState({ loadedFiles: before.loadedFiles, navigateToCompilerDiagnostic: before.navigateToCompilerDiagnostic });
  useConfigEditors.getState().reset();
});
beforeEach(() => {
  opened.length = 0;
  clearElementSelection();
  useConfigEditors.getState().reset();
  useIDEStore.setState({
    loadedFiles: new Map([
      ['tests/a.scenario.json', { content: '{\n  "expectations": [\n    {},\n    { "kind": "x" }\n  ]\n}' } as ProjectFileWithHandle],
    ]),
    navigateToCompilerDiagnostic: async (file: string, line: number, column: number) => {
      opened.push([file, line, column]);
      return true;
    },
  } as never);
});

describe('openPlace', () => {
  test('FND-004 a text occurrence opens its file at the line', async () => {
    await openPlace({ kind: 'text', file: 'src/Main.st', line: 6, column: 11, length: 5 });
    expect(opened).toEqual([['src/Main.st', 6, 11]]);
  });

  test('FND-004 an element occurrence requests the selection of that element', async () => {
    await openPlace({ kind: 'element', file: 'src/SealIn.ld.json', element: 'rung:rung_1/cell:0,0', field: 'variable' });
    expect(pendingElementSelection('src/SealIn.ld.json')?.element).toBe('rung:rung_1/cell:0,0');
    expect(opened).toEqual([['src/SealIn.ld.json', 1, 1]]);
  });

  test('FND-004 a configuration occurrence opens the I/O mapping editor', async () => {
    await openPlace({ kind: 'config', editor: 'io', row: 'io.inputs[3]' });
    expect(useConfigEditors.getState().active).toBe('io');
    expect(opened).toEqual([]);
  });

  test('FND-005 a scenario occurrence opens the file at its JSON pointer', async () => {
    await openPlace({ kind: 'scenario', file: 'tests/a.scenario.json', pointer: '/expectations/1' });
    expect(opened).toEqual([['tests/a.scenario.json', 4, 5]]);
  });
});
