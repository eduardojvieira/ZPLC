import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { DeclaredInput } from '../runtime/declaredInputs';
import type { DeclaredOutput } from '../runtime/ioMap';
import { auditMarkup } from '../ui/audit';
import { Faceplate, type FaceplateInputRow, type FaceplateOutputRow } from './Faceplate';

const input = (patch: Partial<DeclaredInput>): DeclaredInput => ({ path: 'Plant.SensorWest', pou: 'Plant', name: 'SensorWest', type: 'BOOL', region: 'IPI', address: 0, size: 1, bitOffset: 3, origin: 'mapped', ...patch });
const row = (patch: Partial<Omit<FaceplateInputRow, 'input'>> & { input?: Partial<DeclaredInput> } = {}): FaceplateInputRow => ({ value: false, phase: 'idle', forced: false, forceable: true, ...patch, input: input(patch.input ?? {}) });
const output = (patch: Partial<DeclaredOutput> = {}): DeclaredOutput => ({ path: 'Plant.Beacon', pou: 'Plant', name: 'Beacon', type: 'BOOL', region: 'OPI', address: 0x1000, size: 1, bitOffset: 5, ...patch });
const outputRow = (patch: Partial<Omit<FaceplateOutputRow, 'output'>> & { output?: Partial<DeclaredOutput> } = {}): FaceplateOutputRow => ({ value: false, forced: false, ...patch, output: output(patch.output ?? {}) });
const noop = () => undefined;
const render = (props: Partial<Parameters<typeof Faceplate>[0]> = {}) => renderToStaticMarkup(<Faceplate inputs={[]} outputs={[]} onSet={noop} onHold={noop} onForce={noop} {...props} />);

describe('the live I/O faceplate (LRN-017)', () => {
  it('lists every input and every output by its own name, with type, address and value', () => {
    const html = render({
      inputs: [row({ value: true }), row({ input: { path: 'Plant.Setpoint', name: 'Setpoint', type: 'INT', size: 2, address: 4, bitOffset: undefined }, value: 1234 })],
      outputs: [outputRow({ value: true }), outputRow({ output: { path: 'Plant.Level', name: 'Level', type: 'INT', size: 2, address: 0x1004, bitOffset: undefined }, value: 77 })],
    });
    for (const text of ['data-input="Plant.SensorWest"', 'data-input="Plant.Setpoint"', 'data-output="Plant.Beacon"', 'data-output="Plant.Level"', '%IX0.3', '%IW2', '%QX0.5', '%QW2', '1234', '77']) expect(html).toContain(text);
    expect(auditMarkup(html)).toEqual([]);
  });

  it('gives a BOOL a switch and a push button, and a small number a slider over the range of its type and a number box', () => {
    const html = render({ inputs: [row({}), row({ input: { path: 'Plant.Setpoint', name: 'Setpoint', type: 'INT', size: 2, address: 4, bitOffset: undefined }, value: 3 })] });
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-label="SensorWest: FALSE"');
    expect(html).toContain('aria-label="Hold SensorWest"');
    expect(html).toContain('type="range"');
    expect(html).toContain('min="-32768"');
    expect(html).toContain('max="32767"');
    expect(html).toContain('aria-label="Slider for Setpoint"');
    expect(html).toContain('aria-label="Value of Setpoint"');
    expect(html).toContain('aria-label="Set Setpoint"');
  });

  it('gives a wide number and a REAL a number box only, because their type gives no range to point at', () => {
    const html = render({ inputs: [row({ input: { path: 'Plant.Big', name: 'Big', type: 'DINT', size: 4, address: 8, bitOffset: undefined }, value: 5 }), row({ input: { path: 'Plant.Gain', name: 'Gain', type: 'REAL', size: 4, address: 12, bitOffset: undefined }, value: 1.5 })] });
    expect(html).not.toContain('type="range"');
    expect(html).toContain('aria-label="Value of Big"');
    expect(html).toContain('aria-label="Value of Gain"');
  });

  it('says in words that a change is pending until the next scan and then applied, with a glyph and not by colour alone', () => {
    const pending = render({ inputs: [row({ phase: 'pending' })] });
    expect(pending).toContain('data-input-phase="pending"');
    expect(pending).toContain('Pending until next scan');
    expect(pending).toContain('aria-hidden="true">… </span>');
    const applied = render({ inputs: [row({ phase: 'applied', value: true })] });
    expect(applied).toContain('data-input-phase="applied"');
    expect(applied).toContain('Applied');
    expect(render({ inputs: [row({})] })).not.toContain('data-input-phase');
  });

  it('shows an output in the shared signal vocabulary: TRUE with its glyph, FALSE as its own state, an unread value as unknown', () => {
    const html = render({ outputs: [outputRow({ value: true }), outputRow({ output: { path: 'Plant.Off', name: 'Off' }, value: false }), outputRow({ output: { path: 'Plant.Unread', name: 'Unread' }, value: null }), outputRow({ output: { path: 'Plant.Held', name: 'Held' }, value: true, forced: true })] });
    expect(html).toContain('data-signal="true"');
    expect(html).toContain('● ');
    expect(html).toContain('data-signal="false"');
    expect(html).toContain('data-signal="unknown"');
    expect(html).toContain('Not read yet: ');
    expect(html).toContain('data-signal="forced"');
    expect(html).toContain('Forced by the user: ');
  });

  it('disables every control and says why in words when the runtime cannot apply a change', () => {
    const reason = 'The simulation is not running. Start it to operate the inputs.';
    const html = render({ inputs: [row({}), row({ input: { path: 'Plant.Setpoint', name: 'Setpoint', type: 'INT', size: 2, address: 4, bitOffset: undefined } })], unavailable: reason });
    expect(html).toContain(reason);
    expect(html).toContain('data-faceplate-reason');
    expect(html.match(/<button[^>]*disabled=""/g)?.length).toBeGreaterThanOrEqual(3);
    expect(html).toContain('type="range"');
    expect(html).toMatch(/<input[^>]*type="range"[^>]*disabled=""|<input[^>]*disabled=""[^>]*type="range"/);
  });

  it('says in words that there is nothing to operate, and keeps the outputs of a program that has no inputs', () => {
    const html = render({ outputs: [outputRow({})] });
    expect(html).toContain('The program declares no inputs.');
    expect(html).toContain('data-output="Plant.Beacon"');
    expect(render({})).not.toContain('The program declares no inputs.');
  });

  it('shows a forced input as forced, and a type that a force cannot carry as not forceable', () => {
    const html = render({ inputs: [row({ forced: true }), row({ input: { path: 'Plant.Big', name: 'Big', type: 'LINT', size: 8, address: 16, bitOffset: undefined }, value: 5, forceable: false })] });
    expect(html).toContain('checked=""');
    expect(html).toContain('A force carries up to 32 bits');
    expect(html).toContain('aria-label="Force input Big"');
  });
});
