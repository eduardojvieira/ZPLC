/**
 * LNG-029: an FBD diagram places every function the compiler registers, and the build translates it. One case per name of
 * `getAllFnNames()`, generated from the record of the standard functions: each input pin is read from a variable of its type
 * (a generic pin from an INT, or a WORD for ANY_BIT), the result is stored in a variable, and the project compiles with no error.
 */
import { describe, expect, it } from 'bun:test';
import { getAllFnNames } from '@zplc/compiler';

import { compileMultiTaskProject } from '../compiler';
import { stdFunction, type StdFunction } from '../catalog/stdFunctions';

const GENERIC_AS: Record<string, string> = { ANY: 'INT', ANY_NUM: 'INT', ANY_INT: 'INT', ANY_BIT: 'WORD' };
const concrete = (type: string): string => GENERIC_AS[type] ?? type;

/** A diagram of one block of the function, every input read from a variable, the result written to `Result`. */
function fbdCallDiagram(record: StdFunction): string {
  const local = record.inputs.map(([pin, type]) => ({ name: `V_${pin}`, type: concrete(type) }));
  const hasResult = record.returns !== 'VOID';
  if (hasResult) local.push({ name: 'Result', type: concrete(record.returns) });
  const blocks: unknown[] = [
    { id: 'fn', type: record.name, position: { x: 200, y: 0 } },
    ...record.inputs.map(([pin], index) => ({
      id: `src${index}`,
      type: 'input',
      variableName: `V_${pin}`,
      position: { x: 0, y: index * 60 },
    })),
  ];
  const connections: unknown[] = record.inputs.map(([pin], index) => ({
    id: `w${index}`,
    from: { block: `src${index}`, port: 'OUT' },
    to: { block: 'fn', port: pin },
  }));
  if (hasResult) {
    blocks.push({ id: 'sink', type: 'output', variableName: 'Result', position: { x: 400, y: 0 } });
    connections.push({ id: 'wout', from: { block: 'fn', port: 'OUT' }, to: { block: 'sink', port: 'IN' } });
  }
  return JSON.stringify({ name: 'Main', variables: { local, inputs: [], outputs: [] }, blocks, connections });
}

function compileDiagram(content: string): unknown[] {
  try {
    const result = compileMultiTaskProject(
      { name: 'P', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main'] }] },
      [{ name: 'main', content, language: 'FBD', sourceRef: 'src/main.fbd.json' }],
    );
    return result.zplcFile.length > 0 ? [] : ['no program'];
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}

describe('LNG-029 every registered function compiles from an FBD diagram', () => {
  const names = [...getAllFnNames()].sort();

  it('covers the 297 registered functions', () => {
    expect(names.length).toBe(297);
  });

  for (const name of names) {
    it(name, () => {
      const record = stdFunction(name);
      expect(record).toBeDefined();
      expect(compileDiagram(fbdCallDiagram(record!))).toEqual([]);
    });
  }
});
