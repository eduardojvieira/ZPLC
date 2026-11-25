import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../test/dom';
import type { FileTreeNode, ZPLCProjectConfig } from '../types';

const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../store/useIDEStore');
const { useProjectSources } = await import('../store/projectSources');
const { useConfigEditors } = await import('../store/useConfigEditors');
const { CommandPalette } = await import('./CommandPalette');
const { openPalette, closeSurfaces } = await import('./surfaces');

const tree: FileTreeNode = {
  id: 'root',
  name: 'P',
  type: 'directory',
  path: '',
  children: [{ id: 'src/Motor.st', name: 'Motor.st', type: 'file', path: 'src/Motor.st', language: 'ST' }],
};

/** A project folder as the File System Access API hands it over: only what the scene listing reads. */
type Entry = { kind: 'file'; name: string } | FakeFolder;
interface FakeFolder {
  kind: 'directory';
  name: string;
  values: () => AsyncGenerator<Entry>;
  getFileHandle: (name: string) => Promise<Entry>;
  getDirectoryHandle: (name: string) => Promise<Entry>;
}
const folder = (name: string, entries: Entry[]): FakeFolder => {
  const find = async (kind: Entry['kind'], wanted: string) => {
    const entry = entries.find((item) => item.kind === kind && item.name === wanted);
    if (!entry) throw new DOMException(`${wanted} was not found`, 'NotFoundError');
    return entry;
  };
  return {
    kind: 'directory',
    name,
    values: async function* () {
      yield* entries;
    },
    getFileHandle: (wanted) => find('file', wanted),
    getDirectoryHandle: (wanted) => find('directory', wanted),
  };
};

function prepare(): string[] {
  const opened: string[] = [];
  dom.patchStore(useIDEStore, {
    directoryHandle: null,
    fileTree: tree,
    projectConfig: { tasks: [], io: { inputs: [{ name: 'StartPB', address: '%I0.0' }] } } as unknown as ZPLCProjectConfig,
    navigateToCompilerDiagnostic: async (path: string) => {
      opened.push(path);
      return true;
    },
  } as never);
  dom.patchStore(useProjectSources, { declarations: [] });
  return opened;
}

const show = async () => {
  const view = dom.render(<CommandPalette />);
  dom.act(() => openPalette());
  return view;
};

describe('the command palette in a DOM (FND-001)', () => {
  it('FND-001 choosing an I/O point opens the I/O mapping editor', async () => {
    prepare();
    const { user } = await show();
    await user.type(dom.screen.getByRole('combobox'), 'StartPB');
    await user.click(await dom.screen.findByRole('option', { name: /StartPB/ }));
    await dom.waitFor(() => expect(useConfigEditors.getState().active).toBe('io'));
    dom.act(() => closeSurfaces());
  });

  it('FND-001 choosing a file opens it', async () => {
    const opened = prepare();
    const { user } = await show();
    await user.type(dom.screen.getByRole('combobox'), 'Motor.st');
    await user.keyboard('{ArrowDown}');
    await user.click(await dom.screen.findByRole('option', { name: /Motor\.st/ }));
    await dom.waitFor(() => expect(opened).toEqual(['src/Motor.st']));
    dom.act(() => closeSurfaces());
  });

  // The file tree lists no scene (it keeps programs, global lists and tests), so the scenes come from the project folder.
  it('FND-001 the palette lists the scenes of the open project folder in the Scenes group', async () => {
    prepare();
    const file = (name: string): Entry => ({ kind: 'file', name });
    const project = folder('P', [file('zplc.json'), file('scene.json'), folder('scenes', [file('line.scene.json'), file('notes.txt')])]);
    dom.patchStore(useIDEStore, { directoryHandle: project } as never);
    const { user } = await show();
    await user.type(dom.screen.getByRole('combobox'), 'scene');
    const group = await dom.screen.findByRole('group', { name: 'Scenes' });
    await dom.waitFor(() =>
      expect(dom.within(group).getAllByRole('option').map((option) => option.textContent)).toEqual([
        expect.stringContaining('scene.json'),
        expect.stringContaining('scenes/line.scene.json'),
      ]),
    );
    expect(dom.screen.queryByRole('option', { name: /notes\.txt/ })).toBeNull();
    dom.act(() => closeSurfaces());
  });

  it('FND-001 the listbox exposes its groups and the arrow keys cross them', async () => {
    prepare();
    const { user } = await show();
    const input = dom.screen.getByRole('combobox');
    await user.type(input, 'o');
    const groups = dom.screen.getAllByRole('group');
    expect(groups.length).toBeGreaterThan(1);
    for (const group of groups) expect(group.getAttribute('aria-labelledby')).toBeTruthy();
    const first = input.getAttribute('aria-activedescendant');
    const count = dom.screen.getAllByRole('option').length;
    for (let step = 0; step < count - 1; step += 1) await user.keyboard('{ArrowDown}');
    const last = input.getAttribute('aria-activedescendant');
    expect(last).not.toBe(first);
    expect(dom.screen.getAllByRole('option').at(-1)!.id).toBe(last!);
    dom.act(() => closeSurfaces());
  });
});
