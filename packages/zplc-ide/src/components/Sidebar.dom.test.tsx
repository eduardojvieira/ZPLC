import { describe, expect, it, mock } from 'bun:test';
import { isFocused, setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../store/useIDEStore');
const { Sidebar } = await import('./Sidebar');

const file = (id: string, name: string) => ({ id, name, type: 'file' as const, path: `src/${name}`, language: 'ST' as const });
const tree = (expanded: boolean) => ({
  id: 'root',
  name: 'Boiler',
  type: 'directory' as const,
  path: '',
  isExpanded: true,
  children: [
    {
      id: 'src',
      name: 'src',
      type: 'directory' as const,
      path: 'src',
      isExpanded: expanded,
      children: [file('main', 'main.st'), file('motor', 'motor.st')],
    },
    { id: 'readme', name: 'README.md', type: 'file' as const, path: 'README.md' },
  ],
});

/** A tree item by node id: a folder's accessible name holds the names of its children, so a name query would match it and them. */
const item = (id: string) => document.querySelector(`[data-tree-node-id="${id}"]`) as HTMLElement;

function prepare(expanded = true) {
  const openFile = mock<(id: string) => Promise<unknown>>(async () => undefined);
  const toggleDirectory = mock<(path: string) => unknown>(() => undefined);
  const refreshFileTree = mock(async () => undefined);
  dom.patchStore(useIDEStore, {
    fileTree: tree(expanded) as never,
    projectName: 'Boiler',
    activeFileId: 'main',
    openFile,
    toggleDirectory,
    refreshFileTree,
  } as never);
  return { openFile, toggleDirectory, refreshFileTree };
}

describe('Explorer (UX-012, IDE-004) in a DOM', () => {
  it('has a named actions toolbar and a named tree with levels, selection and expansion', () => {
    prepare();
    dom.render(<Sidebar />);
    expect(dom.screen.getByRole('toolbar', { name: dom.t('explorer.actions') })).toBeTruthy();
    expect(dom.screen.getByRole('tree', { name: dom.t('explorer.files') })).toBeTruthy();
    const folder = item('src');
    expect(folder.getAttribute('aria-expanded')).toBe('true');
    expect(folder.getAttribute('aria-level')).toBe('1');
    expect(item('main').getAttribute('aria-selected')).toBe('true');
    expect(item('motor').getAttribute('aria-selected')).toBe('false');
  });

  it('a click on a file opens it and a click on a folder toggles it', async () => {
    const { openFile, toggleDirectory } = prepare();
    const { user } = dom.render(<Sidebar />);
    await user.click(dom.screen.getByText('motor.st'));
    expect(openFile).toHaveBeenCalledWith('motor');
    await user.click(dom.screen.getByText('src'));
    expect(toggleDirectory).toHaveBeenCalledWith('src');
  });

  it('one item is in the tab order, the arrows move between visible items, Enter opens, ArrowLeft goes to the parent', async () => {
    const { openFile } = prepare();
    const { user } = dom.render(<Sidebar />);
    const stops = dom.screen.getAllByRole('treeitem').filter((item) => item.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0]!.getAttribute('data-tree-node-id')).toBe('main');
    stops[0]!.focus();
    await user.keyboard('{ArrowDown}');
    expect(isFocused(item('motor'))).toBe(true);
    await user.keyboard('{Enter}');
    expect(openFile).toHaveBeenCalledWith('motor');
    await user.keyboard('{ArrowLeft}');
    expect(isFocused(item('src'))).toBe(true);
    await user.keyboard('{End}');
    expect(isFocused(item('readme'))).toBe(true);
    await user.keyboard('{Home}');
    expect(isFocused(item('src'))).toBe(true);
  });

  it('ArrowRight on a collapsed folder expands it', async () => {
    const { toggleDirectory } = prepare(false);
    const { user } = dom.render(<Sidebar />);
    const folder = item('src');
    folder.focus();
    await user.keyboard('{ArrowRight}');
    expect(toggleDirectory).toHaveBeenCalledWith('src');
    expect(folder.getAttribute('aria-expanded')).toBe('false');
  });

  it('the new file button opens a dialog that is named and that Escape closes', async () => {
    prepare();
    const { user } = dom.render(<Sidebar />);
    await user.click(dom.screen.getByRole('button', { name: dom.t('explorer.newFile') }));
    expect(dom.screen.getByRole('dialog')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(dom.screen.queryByRole('dialog')).toBeNull();
  });

  it('refresh asks the store to read the project folder again', async () => {
    const { refreshFileTree } = prepare();
    const { user } = dom.render(<Sidebar />);
    await user.click(dom.screen.getByRole('button', { name: dom.t('explorer.refresh') }));
    expect(refreshFileTree).toHaveBeenCalledTimes(1);
  });

  it('F2 on a file asks for a new name in a dialog', async () => {
    prepare();
    const { user } = dom.render(<Sidebar />);
    item('motor').focus();
    await user.keyboard('{F2}');
    expect(dom.screen.getByRole('dialog', { name: dom.t('explorer.renameTitle', { name: 'motor.st' }) })).toBeTruthy();
  });

  it('shows the empty state with a next action when the project has no file', () => {
    dom.patchStore(useIDEStore, {
      fileTree: { id: 'root', name: 'Boiler', type: 'directory', path: '', children: [] } as never,
      projectName: 'Boiler',
    });
    dom.render(<Sidebar />);
    expect(dom.screen.getByText(dom.t('panel.explorer.empty.title'))).toBeTruthy();
  });

  it('shows nothing but a loading state, after its delay, while the tree is not read yet', async () => {
    dom.patchStore(useIDEStore, { fileTree: null, projectName: 'Boiler' });
    dom.render(<Sidebar />);
    await dom.waitFor(() => expect(dom.screen.getByRole('status').textContent).toBe(dom.t('explorer.loading')));
  });
});
