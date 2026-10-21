import { describe, expect, it, mock } from 'bun:test';
import { isFocused, setupDom } from '../test/dom';
import { Button, Toolbar } from './index';

const dom = await setupDom();

describe('Toolbar (UX-001) in a DOM', () => {
  it('is a named toolbar and its arrows move between enabled buttons', async () => {
    const { user } = dom.render(<Toolbar label="Editor tools"><Button>Undo</Button><Button disabled>Redo</Button><Button>Run</Button></Toolbar>);
    expect(dom.screen.getByRole('toolbar', { name: 'Editor tools' }).getAttribute('aria-orientation')).toBe('horizontal');
    await user.tab();
    expect(isFocused(dom.screen.getByRole('button', { name: 'Undo' }))).toBe(true);
    await user.keyboard('{ArrowRight}');
    expect(isFocused(dom.screen.getByRole('button', { name: 'Run' }))).toBe(true);
    await user.keyboard('{ArrowRight}');
    expect(isFocused(dom.screen.getByRole('button', { name: 'Undo' }))).toBe(true);
    await user.keyboard('{End}');
    expect(isFocused(dom.screen.getByRole('button', { name: 'Run' }))).toBe(true);
    await user.keyboard('{Home}');
    expect(isFocused(dom.screen.getByRole('button', { name: 'Undo' }))).toBe(true);
  });

  it('a vertical toolbar answers the up and down arrows', async () => {
    const { user } = dom.render(<Toolbar label="Palette" orientation="vertical"><Button>A</Button><Button>B</Button></Toolbar>);
    await user.tab();
    await user.keyboard('{ArrowDown}');
    expect(isFocused(dom.screen.getByRole('button', { name: 'B' }))).toBe(true);
    await user.keyboard('{ArrowUp}');
    expect(isFocused(dom.screen.getByRole('button', { name: 'A' }))).toBe(true);
  });

  it('a button inside it still runs on Enter', async () => {
    const onRun = mock(() => undefined);
    const { user } = dom.render(<Toolbar label="Tools"><Button onClick={onRun}>Run</Button></Toolbar>);
    await user.tab();
    await user.keyboard('{Enter}');
    expect(onRun).toHaveBeenCalledTimes(1);
  });
});
