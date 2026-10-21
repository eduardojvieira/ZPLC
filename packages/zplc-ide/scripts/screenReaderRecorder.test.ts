import { describe, expect, it } from 'bun:test';
import { judgeStops, spoken, type Focus, type Stop } from './screenReaderRecorder';

const focus = (over: Partial<Focus>): Focus => ({
  role: 'button',
  name: 'Build',
  description: '',
  value: '',
  states: [],
  within: [],
  spoken: '',
  element: 'button',
  ...over,
});
const stop = (how: string, f: Focus | null, optional = false): Stop => ({
  how,
  focus: f,
  announced: [],
  ...(optional ? { optional } : {}),
});

describe('the recorder of the screen reader check (UX-028)', () => {
  it('builds the words from the name, the role, the state, the value and the description', () => {
    expect(spoken({ role: 'switch', name: 'Start', description: 'Turns the motor on', value: '', states: ['checked'] })).toBe(
      'Start, switch, checked. Turns the motor on',
    );
    expect(spoken({ role: 'textbox', name: 'Name', description: '', value: 'Pump', states: [] })).toBe('Name, textbox, value Pump');
    expect(spoken({ role: 'button', name: '', description: '', value: '', states: [] })).toBe('(no name), button');
  });

  it('fails a control without a name and a focus that fell to the page body', () => {
    const checks = judgeStops([stop('Tab', focus({ name: '' })), stop('Tab', null)]);
    expect(checks.map((check) => check.ok)).toEqual([false, false]);
    expect(checks[1]!.detail).toContain('button');
  });

  it('accepts named controls, a nameless container, and a window that has just opened with nothing focused', () => {
    const checks = judgeStops([stop('open', null, true), stop('Tab', focus({})), stop('Tab', focus({ role: 'region', name: '' }))]);
    expect(checks.every((check) => check.ok)).toBe(true);
  });
});
