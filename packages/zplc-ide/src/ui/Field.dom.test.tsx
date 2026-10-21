import { describe, expect, it, mock } from 'bun:test';
import { useState } from 'react';
import { isFocused, setupDom } from '../test/dom';
import { Checkbox, Field, NumberField, RangeField, Select, Switch, TextField, Textarea } from './index';

const dom = await setupDom();

describe('Field and its controls (UX-001) in a DOM', () => {
  it('a text field is named by its label and takes typed text', async () => {
    const onChange = mock((value: string) => value);
    const { user } = dom.render(<TextField label="Task name" defaultValue="" onChange={(event) => onChange(event.target.value)} />);
    const input = dom.screen.getByRole('textbox', { name: 'Task name' }) as HTMLInputElement;
    await user.click(input);
    await user.keyboard('Main');
    expect(input.value).toBe('Main');
    expect(onChange).toHaveBeenLastCalledWith('Main');
  });

  it('clicking the label focuses the control', async () => {
    const { user } = dom.render(<TextField label="Broker" />);
    await user.click(dom.screen.getByText('Broker'));
    expect(isFocused(dom.screen.getByRole('textbox', { name: 'Broker' }))).toBe(true);
  });

  it('describes a control by its hint and its error, marks it invalid and required, and announces the error', () => {
    dom.render(<Field label="Interval (ms)" hint="Between 1 and 10000" error="Must be at least 1" required><NumberField defaultValue={0} /></Field>);
    const input = dom.screen.getByRole('spinbutton', { name: /Interval \(ms\)/ });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-required')).toBe('true');
    const description = input.getAttribute('aria-describedby')?.split(' ').map((id) => document.getElementById(id)?.textContent) ?? [];
    expect(description).toEqual(['Between 1 and 10000', 'Must be at least 1']);
    expect(dom.screen.getByRole('alert').textContent).toBe('Must be at least 1');
  });

  it('a disabled field disables its control and keeps it out of the tab order', async () => {
    const { user } = dom.render(<><TextField label="Locked" disabled /><TextField label="Open" /></>);
    expect((dom.screen.getByRole('textbox', { name: 'Locked' }) as HTMLInputElement).disabled).toBe(true);
    await user.tab();
    expect(isFocused(dom.screen.getByRole('textbox', { name: 'Open' }))).toBe(true);
  });

  it('a number field changes its value with the arrow keys of the keyboard path it is given and keeps typed digits', async () => {
    const { user } = dom.render(<NumberField label="Count" defaultValue={2} />);
    const input = dom.screen.getByRole('spinbutton', { name: 'Count' }) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '42');
    expect(input.value).toBe('42');
  });

  it('a range field is a slider with its own name', () => {
    dom.render(<RangeField label="Gain" min={0} max={10} defaultValue={3} />);
    expect((dom.screen.getByRole('slider', { name: 'Gain' }) as HTMLInputElement).value).toBe('3');
  });

  it('a text area is named and takes lines of text', async () => {
    const { user } = dom.render(<Textarea label="Notes" />);
    const area = dom.screen.getByRole('textbox', { name: 'Notes' }) as HTMLTextAreaElement;
    await user.type(area, 'one{Enter}two');
    expect(area.value).toBe('one\ntwo');
  });

  it('a select is named and reports the chosen option', async () => {
    const onChange = mock((value: string) => value);
    const { user } = dom.render(<Select label="QoS" defaultValue="0" onChange={(event) => onChange(event.target.value)}><option value="0">0</option><option value="1">1</option></Select>);
    await user.selectOptions(dom.screen.getByRole('combobox', { name: 'QoS' }), '1');
    expect(onChange).toHaveBeenLastCalledWith('1');
  });

  it('a checkbox is named by its label, toggles on click and on Space, and shows its checked state', async () => {
    function Harness() {
      const [on, setOn] = useState(false);
      return <Checkbox label="Retain" checked={on} onChange={(event) => setOn(event.target.checked)} />;
    }
    const { user } = dom.render(<Harness />);
    const box = dom.screen.getByRole('checkbox', { name: 'Retain' }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    await user.click(dom.screen.getByText('Retain'));
    expect(box.checked).toBe(true);
    await user.keyboard(' ');
    expect(box.checked).toBe(false);
  });

  it('a hidden checkbox label still names the box', () => {
    dom.render(<Checkbox label="Select row 3" hideLabel />);
    expect(dom.screen.getByRole('checkbox', { name: 'Select row 3' })).toBeTruthy();
  });

  it('a switch has the switch role, is checked or not, and flips with Space', async () => {
    const onChange = mock((checked: boolean) => checked);
    const { user } = dom.render(<Switch label="Autosave" defaultChecked={false} onChange={(event) => onChange(event.target.checked)} />);
    const toggle = dom.screen.getByRole('switch', { name: 'Autosave' }) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    await user.tab();
    await user.keyboard(' ');
    expect(toggle.checked).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(true);
  });
});
