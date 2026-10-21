import { describe, expect, it } from 'bun:test';
import { isFocused, setupDom } from '../test/dom';
import { Button, Popover } from './index';

const dom = await setupDom();

const page = (
  <>
    <Popover label="Filter" trigger={<Button>Filter</Button>}>
      <button type="button">Errors only</button>
    </Popover>
    <p>elsewhere</p>
  </>
);

describe('Popover (UX-001) in a DOM', () => {
  it('a trigger announces a dialog popup, collapsed, then expanded with the named dialog open and focus inside', async () => {
    const { user } = dom.render(page);
    const trigger = dom.screen.getByRole('button', { name: 'Filter' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await user.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const dialog = dom.screen.getByRole('dialog', { name: 'Filter' });
    expect(trigger.getAttribute('aria-controls')).toBe(dialog.id);
    expect(isFocused(dom.screen.getByRole('button', { name: 'Errors only' }))).toBe(true);
  });

  it('Escape closes it and returns focus to the trigger', async () => {
    const { user } = dom.render(page);
    await user.click(dom.screen.getByRole('button', { name: 'Filter' }));
    await user.keyboard('{Escape}');
    expect(dom.screen.queryByRole('dialog')).toBeNull();
    expect(isFocused(dom.screen.getByRole('button', { name: 'Filter' }))).toBe(true);
  });

  it('a click outside closes it, and a second click on the trigger toggles it', async () => {
    const { user } = dom.render(page);
    await user.click(dom.screen.getByRole('button', { name: 'Filter' }));
    await user.click(dom.screen.getByText('elsewhere'));
    expect(dom.screen.queryByRole('dialog')).toBeNull();
    await user.click(dom.screen.getByRole('button', { name: 'Filter' }));
    expect(dom.screen.getByRole('dialog')).toBeTruthy();
    await user.click(dom.screen.getByRole('button', { name: 'Filter' }));
    expect(dom.screen.queryByRole('dialog')).toBeNull();
  });
});
