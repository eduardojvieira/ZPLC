import { describe, expect, it, mock } from 'bun:test';
import { Plus } from 'lucide-react';
import { isFocused, setupDom } from '../test/dom';
import { Button, IconButton } from './index';

const dom = await setupDom();

describe('Button (UX-001) in a DOM', () => {
  it('is a named button that runs its handler on click, Enter and Space', async () => {
    const onClick = mock(() => undefined);
    const { user } = dom.render(<Button onClick={onClick}>Save</Button>);
    const button = dom.screen.getByRole('button', { name: 'Save' });
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('is reached by Tab and does not submit a form', async () => {
    const onSubmit = mock((event: { preventDefault: () => void }) => event.preventDefault());
    const { user } = dom.render(<form onSubmit={onSubmit}><Button>Plain</Button></form>);
    await user.tab();
    expect(isFocused(dom.screen.getByRole('button', { name: 'Plain' }))).toBe(true);
    await user.keyboard('{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('a disabled button leaves the tab order and ignores the pointer', async () => {
    const onClick = mock(() => undefined);
    const { user } = dom.render(<><Button disabled onClick={onClick}>Off</Button><Button>On</Button></>);
    const off = dom.screen.getByRole('button', { name: 'Off' });
    expect((off as HTMLButtonElement).disabled).toBe(true);
    await user.tab();
    expect(isFocused(dom.screen.getByRole('button', { name: 'On' }))).toBe(true);
    await user.click(off);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps the decorative icon out of the accessible name', () => {
    dom.render(<Button icon={<Plus />}>Add task</Button>);
    expect(dom.screen.getByRole('button', { name: 'Add task' })).toBeTruthy();
  });

  it('an icon button is named by its label and acts on click', async () => {
    const onClick = mock(() => undefined);
    const { user } = dom.render(<IconButton label="Remove task" icon={<Plus />} onClick={onClick} />);
    await user.click(dom.screen.getByRole('button', { name: 'Remove task' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows its tooltip on keyboard focus and hides it on Escape', async () => {
    const { user } = dom.render(<IconButton label="Remove task" tooltip="Remove the selected task" icon={<Plus />} />);
    await user.tab();
    // keyboard focus opens the tooltip at once, so a person without a pointer reads it too
    expect(dom.screen.getByRole('tooltip').textContent).toBe('Remove the selected task');
    expect(dom.screen.getByRole('button', { name: 'Remove task' }).getAttribute('aria-describedby')).toBe(dom.screen.getByRole('tooltip').id);
    await user.keyboard('{Escape}');
    expect(dom.screen.queryByRole('tooltip')).toBeNull();
  });
});
