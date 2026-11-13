import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { setupDom, stubProjectLoader } from '../test/dom';
import type { FileTreeNode, ProjectFileWithHandle } from '../types';

const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../store/useIDEStore');
const { pendingElementSelection, clearElementSelection } = await import('../editors/elementSelectionRequests');
const { SearchView } = await import('./SearchView');

const PATH = 'src/SealIn.ld.json';
const content = readFileSync(new URL('../../projects/seal_in_ladder/src/SealIn.ld.json', import.meta.url), 'utf8');
const tree: FileTreeNode = {
  id: 'root',
  name: 'P',
  type: 'directory',
  path: '',
  children: [{ id: PATH, name: 'SealIn.ld.json', type: 'file', path: PATH, language: 'LD' }],
};

function prepare(): Array<[string, number, number]> {
  const opened: Array<[string, number, number]> = [];
  clearElementSelection();
  dom.patchStore(useIDEStore, {
    fileTree: tree,
    loadedFiles: new Map([[PATH, { content } as ProjectFileWithHandle]]),
    navigateToCompilerDiagnostic: async (file: string, line: number, column: number) => {
      opened.push([file, line, column]);
      return true;
    },
  } as never);
  return opened;
}

describe('the Search view over diagrams (FND-003) in a DOM', () => {
  it('FND-003 choosing a diagram match selects its element and opens the file', async () => {
    const opened = prepare();
    const { user } = dom.render(<SearchView />);
    await user.type(dom.screen.getByLabelText(dom.t('search.query')), 'StopPB');
    const row = await dom.screen.findByRole('button', {
      name: dom.t('search.openPlace', { file: PATH, place: "LD rung 'rung_1', cell 0,0" }),
    });
    await user.click(row);
    expect(pendingElementSelection(PATH)?.element).toBe('rung:rung_1/cell:0,0');
    expect(opened).toEqual([[PATH, 1, 1]]);
  });

  it('FND-003 a row of a variable table opens the file without selecting an element', async () => {
    const opened = prepare();
    const { user } = dom.render(<SearchView />);
    await user.type(dom.screen.getByLabelText(dom.t('search.query')), 'StopPB');
    const row = await dom.screen.findByRole('button', {
      name: dom.t('search.openPlace', { file: PATH, place: dom.t('search.table', { name: 'StopPB' }) }),
    });
    await user.click(row);
    expect(pendingElementSelection(PATH)).toBeNull();
    expect(opened).toEqual([[PATH, 1, 1]]);
  });

  it('FND-003 the Search view says "No results" and the count of files searched', async () => {
    prepare();
    const { user } = dom.render(<SearchView />);
    await user.type(dom.screen.getByLabelText(dom.t('search.query')), 'zzzabsent');
    expect(await dom.screen.findByText(dom.t('search.noneSearched', { files: 1 }))).toBeTruthy();
  });
});
