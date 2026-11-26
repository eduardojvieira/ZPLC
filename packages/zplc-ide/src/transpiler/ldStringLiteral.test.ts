/**
 * LNG-030, LNG-002: a STRING literal operand of a Ladder box is passed to the ST as it is, so it must be one the compiler's lexer reads
 * as one literal (`lexer.ts`, readStringLiteral): it ends at a quote, a quote inside it is written `''`, and it holds no line break.
 * Anything else could close the literal and add statements to the program; it is refused at the rung and cell of the box.
 */
import { describe, expect, it } from 'bun:test';

import { compileMultiTaskProject } from '../compiler';
import { transpileFBDToST } from './fbdToST';
import { transpileLDToST } from './ldToST';
import { box, coil, contact, ldFile, variable } from './ldFunctionFixture';
import type { FBDModel } from '../models/fbd';

const declared = {
  local: [variable('Start', 'BOOL'), variable('Lamp', 'BOOL'), variable('Count', 'INT'), variable('X', 'INT'), variable('Text', 'STRING')],
};
const file = (element: Record<string, unknown>) => ldFile(declared, contact('c1', 'Start'), element, coil('k1', 'Lamp'));

function build(content: Record<string, unknown>): string[] {
  try {
    compileMultiTaskProject(
      { name: 'P', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main'] }] },
      [{ name: 'main', content: JSON.stringify(content), language: 'LD', sourceRef: 'src/main.ld.json' }],
    );
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}

describe('LNG-030 LNG-002 a STRING operand cannot close its literal', () => {
  it.each([
    ['a dollar before the closing quote', "'a$'); X := 1; END_IF; //'"],
    ['a line break inside the literal', "'a\nX := 1;'"],
    ['a carriage return inside the literal', "'a\rX := 1;'"],
    ['a lone quote inside the literal', "'a'b'"],
  ])('%s is refused at the rung and cell of the box, and no ST is written', (_name, operand) => {
    const result = transpileLDToST(file(box('f1', 'LEN', [operand], 'Count')));
    expect(result.success).toBe(false);
    expect(result.source).toBe('');
    expect(result.diagnostics).toEqual([
      { message: expect.stringContaining("Function 'f1' (LEN) operand S"), element: 'rung:r1/cell:0,1' },
    ]);
    expect(result.diagnostics![0]!.message).toContain("write a quote inside a string as ''");
  });

  it("a quoted quote, 'it''s', transpiles verbatim and builds", () => {
    const content = file(box('f1', 'CONCAT', ["'AB'", "'it''s'"], 'Text'));
    const result = transpileLDToST(content);
    expect(result.errors).toEqual([]);
    expect(result.source).toContain("Text := CONCAT('AB', 'it''s');");
    expect(build(content)).toEqual([]);
  });

  it('an FBD constant that starts with T# is a TIME literal, or it is refused naming the block: it is never passed as ST text', () => {
    const model = {
      name: 'Main',
      variables: {
        local: [
          { name: 'D', type: 'TIME' },
          { name: 'Count', type: 'INT' },
        ],
        outputs: [],
      },
      blocks: [
        { id: 'k', type: 'constant', value: 'T#1s; Count := 1; (', position: { x: 0, y: 0 } },
        { id: 'out', type: 'output', variableName: 'D', position: { x: 400, y: 0 } },
      ],
      connections: [{ id: 'w', from: { block: 'k', port: 'OUT' }, to: { block: 'out', port: 'IN' } }],
    } as unknown as FBDModel;
    const result = transpileFBDToST(model);
    expect(result.success).toBe(false);
    expect(result.source).toBe('');
    expect(result.diagnostics).toEqual([{ message: expect.stringContaining("FBD block 'k' (constant)"), element: 'block:k' }]);
    const valid = transpileFBDToST({ ...model, blocks: [{ ...model.blocks[0]!, value: 'T#1s' }, model.blocks[1]!] });
    expect(valid.source).toContain('D := T#1s;');
  });
});
