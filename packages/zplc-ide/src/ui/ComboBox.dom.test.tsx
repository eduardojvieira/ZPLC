import { describe, expect, it, mock } from 'bun:test';
import { useState } from 'react';
import { setupDom } from '../test/dom';
import { ComboBox } from './index';

const dom = await setupDom();

const OPTIONS = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Bravo' }, { value: 'c', label: 'Charlie' }];

function Harness({ onChange = () => undefined }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState('a');
  return <ComboBox label="Target" options={OPTIONS} value={value} onChange={(next) => { onChange(next); setValue(next); }} />;
}

describe('ComboBox (UX-001) in a DOM', () => {
  it('is a named, collapsed combobox that shows the selected label', () => {
    dom.render(<Harness />);
    const box = dom.screen.getByRole('combobox', { name: 'Target' }) as HTMLInputElement;
    expect(box.getAttribute('aria-expanded')).toBe('false');
    expect(box.value).toBe('Alpha');
  });

  it('ArrowDown opens the list with the first option active; arrows move; Enter chooses and closes', async () => {
    const onChange = mock((value: string) => value);
    const { user } = dom.render(<Harness onChange={onChange} />);
    await user.tab();
    await user.keyboard('{ArrowDown}');
    const box = dom.screen.getByRole('combobox', { name: 'Target' });
    expect(box.getAttribute('aria-expanded')).toBe('true');
    expect(dom.screen.getAllByRole('option').map((o) => o.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('b');
    expect(box.getAttribute('aria-expanded')).toBe('false');
    expect((box as HTMLInputElement).value).toBe('Bravo');
  });

  it('typing filters the options and Escape closes the list', async () => {
    const { user } = dom.render(<Harness />);
    const box = dom.screen.getByRole('combobox', { name: 'Target' });
    await user.click(box);
    await user.clear(box);
    await user.keyboard('char');
    expect(dom.screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Charlie']);
    await user.keyboard('{Escape}');
    expect(box.getAttribute('aria-expanded')).toBe('false');
  });

  it('a click on an option chooses it', async () => {
    const onChange = mock((value: string) => value);
    const { user } = dom.render(<Harness onChange={onChange} />);
    await user.click(dom.screen.getByRole('combobox', { name: 'Target' }));
    await user.keyboard('{ArrowDown}');
    await user.click(dom.screen.getByRole('option', { name: 'Charlie' }));
    expect(onChange).toHaveBeenLastCalledWith('c');
  });
});
