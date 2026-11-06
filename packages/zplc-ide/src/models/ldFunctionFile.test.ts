/**
 * The `function` element in a .ld.json file (LNG-028, LNG-011): a file that holds one opens and saves with its fields, a
 * malformed one is refused with the name of the file and the violation, and a file without one loads as it always did.
 */
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { box, coil, ldFile, variable } from '../transpiler/ldFunctionFixture';
import { loadLDFile } from './visualFileLoad';
import { parseLDModel, serializeLDModel } from './ld';

const declared = { inputs: [variable('A', 'INT', '%IW0')], local: [variable('Sum', 'INT')], outputs: [variable('Lamp', 'BOOL', '%QX0.0')] };
const text = (file: Record<string, unknown>) => JSON.stringify(file);

describe('LNG-028 LNG-011 a Ladder file with a function box', () => {
  it('opens, and the box keeps its function, its operands in order and its output through a save', () => {
    const content = text(ldFile(declared, box('f1', 'ADD', ['A', '3'], 'Sum'), coil('k1', 'Lamp')));
    const loaded = loadLDFile('sum.ld.json', content);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.model.rungs[0].grid?.[0][0].element).toMatchObject({
      type: 'function',
      functionName: 'ADD',
      operands: ['A', '3'],
      output: 'Sum',
    });
    const saved = JSON.parse(serializeLDModel(parseLDModel(content)));
    expect(saved.rungs[0].grid[0][0].element).toMatchObject({ functionName: 'ADD', operands: ['A', '3'], output: 'Sum' });
  });

  it('opens a box whose operands are not bound yet: the editor saves it so, and the build reports it', () => {
    const content = text(ldFile(declared, box('f1', 'GT', ['', '']), coil('k1', 'Lamp')));
    expect(loadLDFile('compare.ld.json', content).ok).toBe(true);
  });

  it.each([
    ['has no function name', { id: 'f1', type: 'function', operands: [] }, 'functionName'],
    ['has an empty function name', { id: 'f1', type: 'function', functionName: '', operands: [] }, 'functionName'],
    ['has no operands', { id: 'f1', type: 'function', functionName: 'ADD' }, 'operands'],
    ['has operands that are not a list', { id: 'f1', type: 'function', functionName: 'ADD', operands: 'A' }, 'operands'],
    ['has an operand that is not text', { id: 'f1', type: 'function', functionName: 'ADD', operands: ['A', 3] }, 'operands[1]'],
    ['has an output that is not text', { id: 'f1', type: 'function', functionName: 'ADD', operands: [], output: 4 }, 'output'],
  ])('refuses a box that %s, naming the file and the place of the violation', (_name, element, place) => {
    const loaded = loadLDFile('bad.ld.json', text(ldFile(declared, element, coil('k1', 'Lamp'))));
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error.fileName).toBe('bad.ld.json');
    expect(loaded.error.violations.join('\n')).toContain(`rungs[0].grid[0][0].element.${place}`);
  });

  it('a file without a function box loads and saves exactly as before', () => {
    const path = join(
      import.meta.dir,
      '..',
      '..',
      '..',
      '..',
      'conformance',
      'lng',
      'lng-021-ld-logic-after-a-block-uses-its-output.ld.json',
    );
    const content = readFileSync(path, 'utf8');
    const loaded = loadLDFile('legacy.ld.json', content);
    expect(loaded.ok).toBe(true);
    // the model of a file with no function box has none of the fields of the new element
    expect(JSON.stringify(parseLDModel(content))).not.toMatch(/functionName|operands|"output"/);
  });
});
