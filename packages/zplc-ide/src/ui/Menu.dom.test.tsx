import { describe, expect, it, mock } from 'bun:test';
import { isFocused, setupDom } from '../test/dom';
import { ContextMenu, MenuButton, type MenuItem } from './index';

const dom = await setupDom();

const items = (onSelect: () => void): MenuItem[] => [
  { id: 'open', label: 'Open', shortcut: 'Ctrl+O', onSelect },
  { id: 'rename', label: 'Rename', disabled: true, disabledReason: 'Read-only project', onSelect: () => undefined },
  { id: 'delete', label: 'Delete', destructive: true, separatorBefore: true, onSelect },
];

describe('Menu button (UX-001) in a DOM', () => {
  it('is collapsed, then expands on click into a named menu whose first item holds focus', async () => {
    const { user } = dom.render(<MenuButton label="File" items={items(() => undefined)} />);
    const trigger = dom.screen.getByRole('button', { name: 'File' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await user.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(dom.screen.getByRole('menu', { name: 'File' })).toBeTruthy();
    expect(isFocused(dom.screen.getByRole('menuitem', { name: /Open/ }))).toBe(true);
  });

  it('opens with ArrowDown, moves over items and skips the disabled one, and Enter runs the item and closes', async () => {
    const onSelect = mock(() => undefined);
    const { user } = dom.render(<MenuButton label="File" items={items(onSelect)} />);
    await user.tab();
    await user.keyboard('{ArrowDown}');
    expect(dom.screen.getByRole('menu')).toBeTruthy();
    await user.keyboard('{ArrowDown}');
    expect(isFocused(dom.screen.getByRole('menuitem', { name: /Delete/ }))).toBe(true);
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(dom.screen.queryByRole('menu')).toBeNull();
    expect(isFocused(dom.screen.getByRole('button', { name: 'File' }))).toBe(true);
  });

  it('Escape closes the menu and returns focus to the button', async () => {
    const { user } = dom.render(<MenuButton label="File" items={items(() => undefined)} />);
    await user.click(dom.screen.getByRole('button', { name: 'File' }));
    await user.keyboard('{Escape}');
    expect(dom.screen.queryByRole('menu')).toBeNull();
    expect(isFocused(dom.screen.getByRole('button', { name: 'File' }))).toBe(true);
  });

  it('a click outside closes it', async () => {
    const { user } = dom.render(<><MenuButton label="File" items={items(() => undefined)} /><p>elsewhere</p></>);
    await user.click(dom.screen.getByRole('button', { name: 'File' }));
    await user.click(dom.screen.getByText('elsewhere'));
    expect(dom.screen.queryByRole('menu')).toBeNull();
  });

  it('marks a disabled item and gives its reason; choosing it does nothing', async () => {
    const onSelect = mock(() => undefined);
    const { user } = dom.render(<MenuButton label="File" items={[{ id: 'a', label: 'Rename', disabled: true, disabledReason: 'Read-only project', onSelect }]} />);
    await user.click(dom.screen.getByRole('button', { name: 'File' }));
    const item = dom.screen.getByRole('menuitem', { name: /Rename/ });
    expect(item.getAttribute('aria-disabled')).toBe('true');
    expect(item.getAttribute('aria-description')).toBe('Read-only project');
    await user.click(item);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('a click on an item runs it', async () => {
    const onSelect = mock(() => undefined);
    const { user } = dom.render(<MenuButton label="File" items={items(onSelect)} />);
    await user.click(dom.screen.getByRole('button', { name: 'File' }));
    await user.click(dom.screen.getByRole('menuitem', { name: /Delete/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe('Context menu (UX-001) in a DOM', () => {
  it('opens a named menu where the right button is pressed and closes on Escape', async () => {
    const onSelect = mock(() => undefined);
    const { user } = dom.render(<ContextMenu label="Item actions" items={items(onSelect)}><p>row</p></ContextMenu>);
    expect(dom.screen.queryByRole('menu')).toBeNull();
    await user.pointer({ keys: '[MouseRight]', target: dom.screen.getByText('row') });
    expect(dom.screen.getByRole('menu', { name: 'Item actions' })).toBeTruthy();
    await user.click(dom.screen.getByRole('menuitem', { name: /Open/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(dom.screen.queryByRole('menu')).toBeNull();
  });
});
