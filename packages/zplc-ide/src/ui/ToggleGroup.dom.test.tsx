import { describe, expect, it } from 'bun:test';
import { useState } from 'react';
import { isFocused, setupDom } from '../test/dom';
import { ToggleGroup } from './index';

const dom = await setupDom();

function Harness() {
  const [value, setValue] = useState('st');
  return <ToggleGroup label="Language" value={value} onValueChange={setValue} options={[{ value: 'st', label: 'ST' }, { value: 'il', label: 'IL', disabled: true }, { value: 'ld', label: 'LD' }]} />;
}

describe('ToggleGroup (UX-001) in a DOM', () => {
  it('is a named group of buttons with exactly one pressed', () => {
    dom.render(<Harness />);
    expect(dom.screen.getByRole('group', { name: 'Language' })).toBeTruthy();
    expect(dom.screen.getAllByRole('button').map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
  });

  it('a click presses another option and releases the first', async () => {
    const { user } = dom.render(<Harness />);
    await user.click(dom.screen.getByRole('button', { name: 'LD' }));
    expect(dom.screen.getAllByRole('button').map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);
  });

  it('Space and Enter press the focused option; the arrows skip the disabled one', async () => {
    const { user } = dom.render(<Harness />);
    await user.tab();
    expect(isFocused(dom.screen.getByRole('button', { name: 'ST' }))).toBe(true);
    await user.keyboard('{ArrowRight}');
    expect(isFocused(dom.screen.getByRole('button', { name: 'LD' }))).toBe(true);
    await user.keyboard(' ');
    expect(dom.screen.getByRole('button', { name: 'LD' }).getAttribute('aria-pressed')).toBe('true');
    await user.keyboard('{ArrowLeft}{Enter}');
    expect(dom.screen.getByRole('button', { name: 'ST' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('a disabled option stays unpressed when clicked', async () => {
    const { user } = dom.render(<Harness />);
    await user.click(dom.screen.getByRole('button', { name: 'IL' }));
    expect(dom.screen.getByRole('button', { name: 'IL' }).getAttribute('aria-pressed')).toBe('false');
  });
});
