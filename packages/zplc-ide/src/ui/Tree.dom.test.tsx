import { describe, expect, it, mock } from 'bun:test';
import { isFocused, setupDom } from '../test/dom';
import { Tree } from './index';

const dom = await setupDom();

const NODES = [
  {
    id: 'src',
    label: 'src',
    children: [
      { id: 'main', label: 'main.st' },
      { id: 'motor', label: 'motor.st' },
    ],
  },
  { id: 'readme', label: 'README' },
];

describe('Tree (UX-001) in a DOM', () => {
  it('is a named tree whose folder is collapsed and whose levels and positions are exposed', () => {
    dom.render(<Tree label="Project" nodes={NODES} />);
    expect(dom.screen.getByRole('tree', { name: 'Project' })).toBeTruthy();
    const folder = dom.screen.getByRole('treeitem', { name: 'src' });
    expect(folder.getAttribute('aria-expanded')).toBe('false');
    expect(folder.getAttribute('aria-level')).toBe('1');
    expect(folder.getAttribute('aria-setsize')).toBe('2');
    expect(dom.screen.queryByRole('treeitem', { name: 'main.st' })).toBeNull();
  });

  it('ArrowRight expands, ArrowDown walks into the children, ArrowLeft goes back to the parent and collapses', async () => {
    const { user } = dom.render(<Tree label="Project" nodes={NODES} />);
    await user.tab();
    expect(isFocused(dom.screen.getByRole('treeitem', { name: 'src' }))).toBe(true);
    await user.keyboard('{ArrowRight}');
    expect(dom.screen.getByRole('treeitem', { name: 'src' }).getAttribute('aria-expanded')).toBe('true');
    await user.keyboard('{ArrowDown}');
    await dom.waitFor(() => expect(isFocused(dom.screen.getByRole('treeitem', { name: 'main.st' }))).toBe(true));
    expect(dom.screen.getByRole('treeitem', { name: 'main.st' }).getAttribute('aria-level')).toBe('2');
    await user.keyboard('{ArrowLeft}');
    await dom.waitFor(() => expect(isFocused(dom.screen.getByRole('treeitem', { name: 'src' }))).toBe(true));
    await user.keyboard('{ArrowLeft}');
    expect(dom.screen.getByRole('treeitem', { name: 'src' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('Enter and Space select the focused item; a click selects it and toggles a folder', async () => {
    const onSelect = mock((id: string) => id);
    const { user } = dom.render(<Tree label="Project" nodes={NODES} onSelect={onSelect} selected="readme" />);
    expect(dom.screen.getByRole('treeitem', { name: 'README' }).getAttribute('aria-selected')).toBe('true');
    await user.tab(); // the tab stop is the selected item
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith('readme');
    await user.keyboard('{Home}');
    await dom.waitFor(() => expect(isFocused(dom.screen.getByRole('treeitem', { name: 'src' }))).toBe(true));
    await user.keyboard(' ');
    expect(onSelect).toHaveBeenLastCalledWith('src');
    await user.click(dom.screen.getByRole('treeitem', { name: 'src' }));
    expect(dom.screen.getByRole('treeitem', { name: 'src' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('Home and End jump to the first and last visible item', async () => {
    const { user } = dom.render(<Tree label="Project" nodes={NODES} />);
    await user.tab();
    await user.keyboard('{End}');
    await dom.waitFor(() => expect(isFocused(dom.screen.getByRole('treeitem', { name: 'README' }))).toBe(true));
    await user.keyboard('{Home}');
    await dom.waitFor(() => expect(isFocused(dom.screen.getByRole('treeitem', { name: 'src' }))).toBe(true));
  });
});
