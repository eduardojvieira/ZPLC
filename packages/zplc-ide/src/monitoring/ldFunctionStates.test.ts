/**
 * The power state of a function box (LNG-028, LNG-006, LNG-021), read the way the try-it lab of a reading page reads it: the
 * lab plans its program with `planTryLab` and shows `readElementStates` over the entries of the debug map.
 */
import { describe, expect, it } from 'bun:test';
import { planTryLab } from '../runtime/tryLab';
import { box, coil, contact, ldFile, variable } from '../transpiler/ldFunctionFixture';
import { readElementStates, type Read } from './elementStates';

const SRC = 'reading/level.ld.json';
const declared = {
  local: [variable('Start', 'BOOL'), variable('Level', 'INT'), variable('Sum', 'INT'), variable('Lamp', 'BOOL')],
};
const spec = { src: SRC, inputs: [{ name: 'Start' }], outputs: ['Lamp'] };

const plan = (...series: Array<Record<string, unknown>>) => {
  const planned = planTryLab(JSON.stringify(ldFile(declared, ...series)), spec);
  if (!planned.ok) throw new Error(`the lab did not plan: ${JSON.stringify(planned)}`);
  return planned.plan;
};
const reading =
  (values: Record<string, boolean | number>): Read =>
  (name) =>
    values[name];

describe('LNG-028 LNG-006 the power state of a function box in the try-it lab', () => {
  it('a comparison shows the power that reached it and the power that leaves it: EN AND the comparison', () => {
    const { entries, polled } = plan(contact('c1', 'Start'), box('f1', 'GT', ['Level', '100']), coil('k1', 'Lamp'));
    const power = entries.find((entry) => entry.element === 'rung:r1/cell:0,1' && entry.role === 'power');
    expect(power).toBeDefined();
    const variables = polled.map((variable) => variable.name);
    // the variable that holds the comparison is polled, so the display reads it and does not guess it
    expect(variables).toContain(`${SRC}@_rung1_result`);
    expect(variables).toContain(`${SRC}@Level`);
    const state = (values: Record<string, boolean | number>) => readElementStates(entries, reading(values)).get('rung:r1/cell:0,1');
    expect(state({ Start: true, _rung1_result: true })).toMatchObject({ power: true, powerOut: true });
    expect(state({ Start: true, _rung1_result: false })).toMatchObject({ power: true, powerOut: false });
    // the comparison holds, but no power reaches the box
    expect(state({ Start: false, _rung1_result: true })).toMatchObject({ power: false, powerOut: false });
  });

  it('LNG-021 a coil after a comparison is powered only while the comparison holds', () => {
    const { entries } = plan(contact('c1', 'Start'), box('f1', 'GT', ['Level', '100']), coil('k1', 'Lamp'));
    const coilAt = (hold: boolean) =>
      readElementStates(entries, reading({ Start: true, _rung1_result: hold, _rung1_result_2: hold })).get('rung:r1/cell:0,2');
    expect(coilAt(true)?.power).toBe(true);
    expect(coilAt(false)?.power).toBe(false);
  });

  it('any other function passes the power that reached it, and its pins show the variables they name', () => {
    const { entries } = plan(contact('c1', 'Start'), box('f1', 'ADD', ['Level', '3'], 'Sum'), coil('k1', 'Lamp'));
    const state = readElementStates(entries, reading({ Start: true, _rung1_result: true, Level: 4, Sum: 7 })).get('rung:r1/cell:0,1');
    expect(state).toMatchObject({ power: true, powerOut: true, pins: { IN1: 4, OUT: 7 } });
    // a literal has no value to read: the box draws it as written
    expect(state?.pins).not.toHaveProperty('IN2');
  });

  it('a value that was not read is unavailable, not FALSE', () => {
    const { entries } = plan(contact('c1', 'Start'), box('f1', 'GT', ['Level', '100']), coil('k1', 'Lamp'));
    expect(readElementStates(entries, reading({ Start: true })).get('rung:r1/cell:0,1')).toMatchObject({
      power: true,
      powerOut: undefined,
    });
  });
});
