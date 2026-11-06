import { describe, expect, it } from 'bun:test';

import { translatorFor } from '../../i18n';
import { createEmptyRung, type LDElement, type LDModel } from '../../models/ld';
import { LD_FUNCTIONS } from '../../models/ldSupport';
import { filterItems } from '../picker';
import { bindingChoices, runLDCommand } from './keyboard';
import { functionItems, functionSlots, withFunction } from './ldFunctions';
import { paletteItems } from './palette';

const model = (): LDModel => ({
  name: 'Main',
  variables: {
    inputs: [
      { name: 'Level', type: 'INT' },
      { name: 'Start', type: 'BOOL' },
    ],
    outputs: [{ name: 'Lamp', type: 'BOOL' }],
    local: [{ name: 'Sum', type: 'INT' }],
  },
  rungs: [createEmptyRung(1)],
});
const cell = (m: LDModel): LDElement => m.rungs[0]!.grid![0]![0]!.element!;
const insertFn = (functionName: string) =>
  runLDCommand(model(), null, 'insertElement', { insert: { type: 'function', functionName, category: 'function' } });

describe('LNG-028 LNG-012 the Functions group of the palette', () => {
  it('lists every function of the table with its kind, and the keyboard palette finds them by name and by kind', () => {
    expect(functionItems().map((item) => item.functionName)).toEqual(Object.keys(LD_FUNCTIONS));
    expect(new Set(functionItems().map((item) => item.kind))).toEqual(new Set(['compare', 'math', 'move', 'select']));
    const palette = paletteItems([]);
    expect(palette.find((item) => item.id === 'function:GT')?.insert).toEqual({
      type: 'function',
      functionName: 'GT',
      category: 'function',
    });
    const found = (query: string) => filterItems(palette, query).map((item) => item.id);
    expect(found('LIMIT')).toContain('function:LIMIT');
    expect(found('comparison')).toEqual(expect.arrayContaining(['function:GT', 'function:LT']));
    expect(found('comparison')).not.toContain('function:ADD');
  });
});

describe('LNG-028 LNG-012 inserting and binding a function box from the keyboard', () => {
  it('inserts a comparison with two empty operands and no output, and asks for the first operand', () => {
    const outcome = insertFn('GT');
    expect(cell(outcome.model)).toMatchObject({ type: 'function', functionName: 'GT', operands: ['', ''] });
    expect(cell(outcome.model).output).toBeUndefined();
    expect(outcome.prompt).toEqual({ kind: 'bind', elementId: cell(outcome.model).id, slot: 0 });
  });

  it('binds the operands one after the other, from the declared symbols or a typed literal, then the output', () => {
    let outcome = insertFn('ADD');
    for (const [slot, variable] of [
      [0, 'Level'],
      [1, '3'],
      [2, 'Sum'],
    ] as const) {
      expect(outcome.prompt).toMatchObject({ kind: 'bind', slot });
      outcome = runLDCommand(outcome.model, outcome.cursor, 'bindVariable', { variable, slot });
      expect(outcome.changed).toBe(true);
    }
    expect(cell(outcome.model)).toMatchObject({ functionName: 'ADD', operands: ['Level', '3'], output: 'Sum' });
    expect(outcome.prompt).toBeUndefined();
  });

  it('offers the declared symbols for an operand, lets a literal be typed, and keeps inputs out of the output', () => {
    const outcome = insertFn('ADD');
    const element = cell(outcome.model);
    const operand = bindingChoices(outcome.model, element, undefined, 0);
    expect(operand.free).toBe(true);
    expect(operand.items.map((item) => item.id)).toEqual(['Level', 'Start', 'Lamp', 'Sum']);
    expect(bindingChoices(outcome.model, element, undefined, 2).items.map((item) => item.id)).toEqual(['Lamp', 'Sum']);
  });

  it('rebinds a box that is full from its first operand', () => {
    let outcome = insertFn('MOVE');
    outcome = runLDCommand(outcome.model, outcome.cursor, 'bindVariable', { variable: 'Level', slot: 0 });
    outcome = runLDCommand(outcome.model, outcome.cursor, 'bindVariable', { variable: 'Sum', slot: 1 });
    const again = runLDCommand(outcome.model, outcome.cursor, 'bindVariable');
    expect(again.prompt).toMatchObject({ kind: 'bind', slot: 0 });
  });

  it('deletes the box like any other element', () => {
    const outcome = insertFn('GT');
    const deleted = runLDCommand(outcome.model, outcome.cursor, 'deleteElement');
    expect(deleted.changed).toBe(true);
    expect(deleted.model.rungs[0]!.grid![0]![0]!.element).toBeNull();
  });

  it('still inserts a contact (asking its variable) and a TON (declaring its instance) as before', () => {
    const contact = runLDCommand(model(), null, 'insertElement', { insert: { type: 'contact_no', category: 'contact' } });
    expect(cell(contact.model)).toMatchObject({ type: 'contact_no' });
    expect(contact.prompt).toEqual({ kind: 'bind', elementId: cell(contact.model).id });
    const ton = runLDCommand(model(), null, 'insertElement', {
      insert: { type: 'function_block', fbType: 'TON', category: 'function_block' },
    });
    expect(cell(ton.model)).toMatchObject({ type: 'function_block', fbType: 'TON', instance: 'TON_1' });
    expect(ton.prompt).toBeUndefined();
  });
});

describe('LNG-028 the operand count follows the function', () => {
  const box = (functionName: string, operands: string[], output?: string): LDElement => ({
    id: 'f',
    type: 'function',
    functionName,
    operands,
    ...(output === undefined ? {} : { output }),
  });

  it('keeps the operands that fit, pads the new pins and adds or drops the output', () => {
    expect(withFunction(box('ADD', ['A', '3'], 'Sum'), 'LIMIT')).toMatchObject({ operands: ['A', '3', ''], output: 'Sum' });
    expect(withFunction(box('ADD', ['A', '3'], 'Sum'), 'MOVE')).toMatchObject({ operands: ['A'], output: 'Sum' });
    const comparison = withFunction(box('ADD', ['A', '3'], 'Sum'), 'GT');
    expect(comparison.operands).toEqual(['A', '3']);
    expect('output' in comparison).toBe(false);
    expect(withFunction(box('GT', ['A', '3']), 'SUB')).toMatchObject({ operands: ['A', '3'], output: '' });
    expect(functionSlots(box('LIMIT', ['', '', ''], ''))).toEqual(['MN', 'IN', 'MX', 'OUT']);
  });
});

describe('LNG-028 the kind and the description of a function box, in both languages', () => {
  it('have their own text, not the one of a function block', () => {
    for (const language of ['en', 'es'] as const) {
      const { t } = translatorFor(language);
      expect(t('ld.kind.function')).not.toBe(t('ld.kind.function_block'));
      expect(t('ld.desc.function')).not.toBe(t('ld.desc.function_block'));
      expect(t('editors.ld.functions')).not.toBe('editors.ld.functions');
    }
    expect(translatorFor('es').t('ld.kind.function')).not.toBe(translatorFor('en').t('ld.kind.function'));
  });
});
