import { describe, expect, it } from 'bun:test';
import { setupDom } from '../test/dom';
import { Button, Tooltip } from './index';

const dom = await setupDom();

describe('Tooltip (UX-001) in a DOM', () => {
  it('opens on keyboard focus after its delay, describes the target, and closes on Escape', async () => {
    const { user } = dom.render(<Tooltip content="Build the project" shortcut="Ctrl+B"><Button>Build</Button></Tooltip>);
    expect(dom.screen.queryByRole('tooltip')).toBeNull();
    await user.tab();
    await dom.waitFor(() => expect(dom.screen.getByRole('tooltip').textContent).toContain('Build the project'));
    expect(dom.screen.getByRole('tooltip').textContent).toContain('Ctrl+B');
    expect(dom.screen.getByRole('button', { name: 'Build' }).getAttribute('aria-describedby')).toBe(dom.screen.getByRole('tooltip').id);
    await user.keyboard('{Escape}');
    expect(dom.screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens when the pointer rests on the target and closes when it leaves', async () => {
    const { user } = dom.render(<Tooltip content="Stop the run"><Button>Stop</Button></Tooltip>);
    await user.hover(dom.screen.getByRole('button', { name: 'Stop' }));
    await dom.waitFor(() => expect(dom.screen.getByRole('tooltip').textContent).toBe('Stop the run'));
    await user.unhover(dom.screen.getByRole('button', { name: 'Stop' }));
    await dom.waitFor(() => expect(dom.screen.queryByRole('tooltip')).toBeNull());
  });

  it('a press on the target closes it', async () => {
    const { user } = dom.render(<Tooltip content="Save"><Button>Save</Button></Tooltip>);
    await user.tab();
    await dom.waitFor(() => expect(dom.screen.getByRole('tooltip')).toBeTruthy());
    await user.click(dom.screen.getByRole('button', { name: 'Save' }));
    expect(dom.screen.queryByRole('tooltip')).toBeNull();
  });

  it('without content it renders only its child', async () => {
    const { user } = dom.render(<Tooltip content=""><Button>Plain</Button></Tooltip>);
    await user.tab();
    expect(dom.screen.queryByRole('tooltip')).toBeNull();
  });
});
