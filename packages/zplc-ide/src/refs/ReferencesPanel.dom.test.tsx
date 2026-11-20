import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../test/dom';
import type { Occurrence, References } from './contracts';

const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../store/useIDEStore');
const { useReferences } = await import('./useReferences');
const { ReferencesPanel } = await import('./ReferencesPanel');

const at = (file: string, line: number): Occurrence => ({
  language: 'ST',
  place: { kind: 'text', file, line, column: 3, length: 5 },
  role: 'use',
  text: 'Start',
});
const result: References = {
  target: { kind: 'symbol', scope: '', name: 'Start' },
  definition: {
    language: 'ST',
    place: { kind: 'text', file: 'src/Main.st', line: 3, column: 3, length: 5 },
    role: 'declaration',
    text: 'Start',
  },
  uses: [
    at('src/Main.st', 6),
    {
      language: 'LD',
      place: { kind: 'element', file: 'src/SealIn.ld.json', element: 'rung:rung_1/cell:0,0', field: 'variable' },
      role: 'use',
      text: 'Start',
    },
    { language: 'IO', place: { kind: 'config', editor: 'io', row: 'io.inputs[0]' }, role: 'binding', text: '%IX0.0' },
  ],
  truncated: false,
  broken: [],
};
const opened: Array<[string, number, number]> = [];

beforeEach(() => {
  opened.length = 0;
  dom.patchStore(useIDEStore, {
    navigateToCompilerDiagnostic: async (file: string, line: number, column: number) => {
      opened.push([file, line, column]);
      return true;
    },
  } as never);
  useReferences.setState({ target: result.target, result, status: 'ready', mode: 'references', choice: null, notice: null });
});

describe('ReferencesPanel in a DOM', () => {
  afterEach(() => useReferences.getState().clear());

  it('FND-004 references are grouped by file with the language and the place in words', () => {
    dom.render(<ReferencesPanel />);
    expect(dom.screen.getByText(dom.t('refs.header', { name: 'Start', count: 3, files: 3 }))).toBeTruthy();
    for (const file of ['src/Main.st', 'src/SealIn.ld.json', 'zplc.json'])
      expect(dom.screen.getByRole('heading', { name: file })).toBeTruthy();
    expect(
      dom.screen.getByRole('button', {
        name: dom.t('refs.open', {
          file: 'src/SealIn.ld.json',
          language: 'LD',
          place: "LD rung 'rung_1', cell 0,0",
          role: dom.t('refs.role.use'),
        }),
      }),
    ).toBeTruthy();
    expect(dom.screen.getByText(dom.t('refs.language.IO'))).toBeTruthy();
    expect(dom.screen.getByText(dom.t('refs.role.declaration'))).toBeTruthy();
  });

  it('FND-004 a row is operable by keyboard', async () => {
    const { user } = dom.render(<ReferencesPanel />);
    const rows = dom.screen.getAllByRole('button');
    rows[0]!.focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(rows[1]);
    await user.keyboard('{Enter}');
    await dom.settle();
    expect(opened).toEqual([['src/Main.st', 6, 3]]);
    await user.keyboard('{Escape}');
    expect(useReferences.getState().mode).toBe('search');
  });

  it('FND-004 a name that is declared nowhere says so', () => {
    useReferences.setState({ result: { ...result, definition: undefined, uses: [] } });
    dom.render(<ReferencesPanel />);
    expect(dom.screen.getByText(dom.t('refs.notDeclared', { name: 'Start' }))).toBeTruthy();
    expect(dom.screen.queryAllByRole('button')).toHaveLength(0);
  });
});
