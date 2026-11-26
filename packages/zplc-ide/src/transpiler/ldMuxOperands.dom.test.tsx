/**
 * LNG-030: a MUX box in a rung takes more inputs, and a person adds and removes them in the slot editor of the box or with the
 * commands `addOperand` and `removeOperand` of the keyboard; the transpiler reads the operands of the document.
 */
import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../test/dom';
import type { LDElement, LDModel } from '../models/ld';

const dom = await setupDom();
await stubProjectLoader();
const { ElementProperties } = await import('../editors/ld/LDEditor');
const { LD_OPERAND_COMMANDS, runLDCommand } = await import('../editors/ld/keyboard');
const { functionSlots, withOperandAdded, withOperandRemoved } = await import('../editors/ld/ldFunctions');
const { transpileLDToST } = await import('./ldToST');
const { box, contact, ldFile, variable } = await import('./ldFunctionFixture');

const mux = (operands: string[]): LDElement => ({
  id: 'f1',
  type: 'function',
  functionName: 'MUX',
  operands,
  output: 'Out',
  row: 0,
  col: 1,
});

describe('LNG-030 the operands of a MUX box', () => {
  it('adds IN2 after IN1 and removes it again, never below K, IN0 and IN1', () => {
    const added = withOperandAdded(mux(['K', 'A', 'B']))!;
    expect(added.operands).toEqual(['K', 'A', 'B', '']);
    expect(functionSlots(added)).toEqual(['K', 'IN0', 'IN1', 'IN2', 'OUT']);
    expect(withOperandRemoved(added)!.operands).toEqual(['K', 'A', 'B']);
    expect(withOperandRemoved(mux(['K', 'A', 'B']))).toBeUndefined();
    expect(withOperandAdded({ ...mux(['X']), functionName: 'SQRT' })).toBeUndefined();
  });

  it('the transpiler calls MUX with the operands of the document', () => {
    const file = ldFile(
      {
        local: ['Start', 'Lamp']
          .map((name) => variable(name, 'BOOL'))
          .concat(['K', 'A', 'B', 'C', 'Out'].map((name) => variable(name, 'INT'))),
      },
      contact('c1', 'Start'),
      box('f1', 'MUX', ['K', 'A', 'B', 'C'], 'Out'),
    );
    expect(transpileLDToST(file).source).toContain('IF _rung1_result THEN Out := MUX(K, A, B, C); END_IF;');
  });

  it('the keyboard commands act on the box under the cursor, and refuse a box of fixed operands', () => {
    expect(LD_OPERAND_COMMANDS).toEqual(['addOperand', 'removeOperand']);
    const model = ldFile({}, contact('c1', 'Start'), box('f1', 'MUX', ['K', 'A', 'B'], 'Out')) as unknown as LDModel;
    const cursor = { rungId: 'r1', row: 0, col: 1 };
    const added = runLDCommand(model, cursor, 'addOperand');
    expect(added.changed).toBe(true);
    expect(added.model.rungs[0]!.grid![0]![1]!.element!.operands).toEqual(['K', 'A', 'B', '']);
    expect(added.say).toBe('Added input IN2 to MUX.');
    const removed = runLDCommand(added.model, cursor, 'removeOperand');
    expect(removed.model.rungs[0]!.grid![0]![1]!.element!.operands).toEqual(['K', 'A', 'B']);
    expect(runLDCommand(removed.model, cursor, 'removeOperand').refused).toBe(true);
    const sqrt = ldFile({}, contact('c1', 'Start'), box('f1', 'SQRT', ['A'], 'Out')) as unknown as LDModel;
    expect(runLDCommand(sqrt, cursor, 'addOperand').refused).toBe(true);
  });

  it('the slot editor of the box has Add input and Remove input, and saves the operands', async () => {
    let saved: LDElement | undefined;
    const { user } = dom.render(
      <ElementProperties element={mux(['K', 'A', 'B'])} onChange={(element) => (saved = element)} onClose={() => undefined} />,
    );
    const remove = dom.screen.getByRole('button', { name: 'Remove input' }) as HTMLButtonElement;
    expect(remove.disabled).toBe(true);
    await user.click(dom.screen.getByRole('button', { name: 'Add input' }));
    expect(dom.screen.getByLabelText('Operand IN2')).toBeDefined();
    await user.type(dom.screen.getByLabelText('Operand IN2'), 'C');
    await user.click(dom.screen.getByRole('button', { name: 'Save' }));
    expect(saved?.operands).toEqual(['K', 'A', 'B', 'C']);
  });

  it('the slot editor of a box of fixed operands has no such buttons', () => {
    dom.render(
      <ElementProperties element={{ ...mux(['A']), functionName: 'SQRT' }} onChange={() => undefined} onClose={() => undefined} />,
    );
    expect(dom.screen.queryByRole('button', { name: 'Add input' })).toBeNull();
  });
});
