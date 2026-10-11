import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { DeclaredInput } from '../runtime/declaredInputs';
import { inputAddressLabel } from '../runtime/declaredInputs';
import { auditMarkup } from '../ui/audit';
import { SimulationInputsList, type SimulationInputRow } from './SimulationInputsList';

const input = (patch: Partial<DeclaredInput>): DeclaredInput => ({ path: 'Plant.SensorWest', pou: 'Plant', name: 'SensorWest', type: 'BOOL', region: 'IPI', address: 0, size: 1, bitOffset: 3, origin: 'mapped', ...patch });
const row = (patch: Partial<Omit<SimulationInputRow, 'input'>> & { input?: Partial<DeclaredInput> } = {}): SimulationInputRow => ({ value: false, forced: false, forceable: true, ...patch, input: input(patch.input ?? {}) });
const noop = () => undefined;

describe('the simulation inputs list (IDE-024)', () => {
  it('names the direct address as the program wrote it', () => {
    expect(inputAddressLabel(input({}))).toBe('%IX0.3');
    expect(inputAddressLabel(input({ type: 'INT', size: 2, address: 4, bitOffset: undefined }))).toBe('%IW2');
    expect(inputAddressLabel(input({ type: 'DINT', size: 4, address: 8, bitOffset: undefined }))).toBe('%ID2');
    expect(inputAddressLabel(input({ type: 'BYTE', size: 1, address: 9, bitOffset: undefined }))).toBe('%IB9');
    expect(inputAddressLabel(input({ type: 'BOOL', region: 'WORK', address: 0x2000, bitOffset: undefined, origin: 'program-input' }))).toBe('WORK 0x2000');
  });

  it('lists every input by its own name with its type, address and value, and a control that fits the type', () => {
    const html = renderToStaticMarkup(<SimulationInputsList
      rows={[row({ value: true }), row({ input: { path: 'Plant.Setpoint', name: 'Setpoint', type: 'INT', size: 2, address: 4, bitOffset: undefined }, value: 1234 })]}
      onSet={noop} onForce={noop}
    />);
    expect(html).toContain('data-input="Plant.SensorWest"');
    expect(html).toContain('data-input="Plant.Setpoint"');
    expect(html).toContain('%IX0.3');
    expect(html).toContain('%IW2');
    expect(html).toContain('TRUE');
    expect(html).toContain('1234');
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-label="Value of Setpoint"');
    // The checkbox is named by its label, which only a screen reader reads (a hidden label of the kit's Checkbox).
    expect(html).toContain('>Force input Setpoint<');
    expect(auditMarkup(html)).toEqual([]);
  });

  it('says in words that there is nothing to set, and why the inputs are read-only', () => {
    expect(renderToStaticMarkup(<SimulationInputsList rows={[]} onSet={noop} onForce={noop} />)).toContain('The program declares no inputs.');
    expect(renderToStaticMarkup(<SimulationInputsList rows={[]} unavailable="Connect the simulator to set inputs." onSet={noop} onForce={noop} />)).toContain('Connect the simulator to set inputs.');
    const html = renderToStaticMarkup(<SimulationInputsList rows={[row({})]} unavailable="Connect the simulator to set inputs." onSet={noop} onForce={noop} />);
    expect(html).toContain('Connect the simulator to set inputs.');
    expect(html).toContain('disabled=""');
  });

  it('shows a forced input as forced, and a type that a force cannot carry as not forceable', () => {
    const html = renderToStaticMarkup(<SimulationInputsList rows={[row({ forced: true }), row({ input: { path: 'Plant.Big', name: 'Big', type: 'LINT', size: 8, address: 16, bitOffset: undefined }, value: 5, forceable: false })]} onSet={noop} onForce={noop} />);
    expect(html).toContain('checked=""');
    expect(html).toContain('A force carries up to 32 bits');
  });
});
