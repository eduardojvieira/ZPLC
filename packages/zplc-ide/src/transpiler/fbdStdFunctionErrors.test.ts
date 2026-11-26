/**
 * LNG-029 with LNG-002 and LNG-003: what FBD does with a standard function that cannot be called as drawn. Every error names the
 * block and the pin, and no Structured Text is produced in its place.
 */
import { describe, expect, it } from 'bun:test';

import { transpileFBDToST } from './fbdToST';
import { getDefaultPorts, type FBDModel } from '../models/fbd';

type Wire = [from: string, to: string, port: string];

/** A diagram of one block `fn` of `type`, fed by variable reads (`V:<name>`) or constants (`C:<json>`), its OUT stored in Result. */
function diagram(
  type: string,
  feeds: Record<string, string>,
  local: Array<[string, string]>,
  extra: { inputs?: Array<{ name: string; type: string }>; result?: string } = {},
): FBDModel {
  const blocks: FBDModel['blocks'] = [{ id: 'fn', type, position: { x: 200, y: 0 }, ...(extra.inputs ? { inputs: extra.inputs } : {}) }];
  const wires: Wire[] = [];
  for (const [pin, feed] of Object.entries(feeds)) {
    const id = `src_${pin}`;
    if (feed.startsWith('V:')) blocks.push({ id, type: 'input', variableName: feed.slice(2), position: { x: 0, y: 0 } });
    else blocks.push({ id, type: 'constant', value: JSON.parse(feed.slice(2)), position: { x: 0, y: 0 } });
    wires.push([id, 'fn', pin]);
  }
  if (extra.result) {
    blocks.push({ id: 'sink', type: 'output', variableName: 'Result', position: { x: 400, y: 0 } });
    wires.push(['fn', 'sink', 'IN']);
  }
  return {
    name: 'Main',
    variables: {
      local: [...local, ...(extra.result ? [['Result', extra.result]] : [])].map(([name, t]) => ({ name, type: t })),
      outputs: [],
    },
    blocks,
    connections: wires.map(([from, to, port], index) => ({
      id: `w${index}`,
      from: { block: from, port: 'OUT' },
      to: { block: to, port },
    })),
  };
}

function refused(model: FBDModel): string[] {
  const result = transpileFBDToST(model);
  expect(result.success).toBe(false);
  expect(result.source).toBe('');
  return result.errors;
}

describe('LNG-029 a standard function is a call with no instance', () => {
  it('emits OUT := NAME(args), with a generic result typed by its inputs', () => {
    const result = transpileFBDToST(diagram('SHL', { IN: 'V:W', N: 'C:2' }, [['W', 'WORD']], { result: 'WORD' }));
    expect(result.errors).toEqual([]);
    expect(result.source).toContain('_fn_OUT : WORD;');
    expect(result.source).toContain('_fn_OUT := SHL(W, 2);');
  });

  it('emits a VOID function as a statement, with no output', () => {
    expect(getDefaultPorts('WATCHDOG_RESET').outputs).toEqual([]);
    const result = transpileFBDToST(diagram('WATCHDOG_RESET', {}, []));
    expect(result.errors).toEqual([]);
    expect(result.source).toContain('WATCHDOG_RESET();');
  });

  it('writes COPY into a variable', () => {
    const result = transpileFBDToST(
      diagram('COPY', { SRC: 'V:A', DST: 'V:B' }, [
        ['A', 'STRING'],
        ['B', 'STRING'],
      ]),
    );
    expect(result.errors).toEqual([]);
    expect(result.source).toContain('COPY(A, B);');
  });
});

describe('LNG-002, LNG-003 the errors of a standard function name the block and the pin', () => {
  it('an unwired pin', () => {
    expect(refused(diagram('ATAN2', { Y: 'V:A' }, [['A', 'REAL']], { result: 'REAL' }))).toEqual([
      "FBD block 'fn' (ATAN2): input 'X' is not wired",
    ]);
  });

  it('a type clash on a pin of one type', () => {
    expect(refused(diagram('LEN', { S: 'V:A' }, [['A', 'INT']], { result: 'INT' }))).toEqual([
      expect.stringContaining("FBD block 'fn' (LEN): input 'S': INT is an integer (INT)"),
    ]);
  });

  it('a class mismatch on a generic pin', () => {
    expect(refused(diagram('SHL', { IN: 'V:R', N: 'C:1' }, [['R', 'REAL']], { result: 'REAL' }))).toEqual([
      "FBD block 'fn' (SHL): input 'IN' is REAL, and SHL takes a bit string (BYTE, WORD, DWORD or LWORD) there",
    ]);
  });

  it('a written pin wired from a constant', () => {
    expect(refused(diagram('COPY', { SRC: 'V:A', DST: 'C:"x"' }, [['A', 'STRING']]))).toEqual([
      "FBD block 'fn' (COPY): input 'DST' is written by COPY, so it has to be wired from a variable block, not from 'src_DST.OUT'",
    ]);
  });

  it('MUX and SEL on STRING', () => {
    const strings: Array<[string, string]> = [
      ['A', 'STRING'],
      ['B', 'STRING'],
      ['G', 'BOOL'],
      ['K', 'INT'],
    ];
    expect(refused(diagram('MUX', { K: 'V:K', IN0: 'V:A', IN1: 'V:B' }, strings, { result: 'STRING' }))).toEqual([
      "FBD block 'fn' (MUX): input 'IN0' is STRING, and MUX takes any elementary type but a STRING there",
      "FBD block 'fn' (MUX): input 'IN1' is STRING, and MUX takes any elementary type but a STRING there",
    ]);
    expect(refused(diagram('SEL', { G: 'V:G', IN0: 'V:A', IN1: 'V:B' }, strings, { result: 'STRING' }))).toEqual([
      "FBD block 'fn' (SEL): SEL does not select STRING values: the code generator selects numbers, BOOL and TIME only",
    ]);
  });

  it('a MUX with fewer than two data inputs', () => {
    const inputs = [
      { name: 'K', type: 'INT' },
      { name: 'IN0', type: 'ANY' },
    ];
    expect(
      refused(
        diagram(
          'MUX',
          { K: 'V:K', IN0: 'V:A' },
          [
            ['K', 'INT'],
            ['A', 'INT'],
          ],
          { inputs, result: 'INT' },
        ),
      ),
    ).toEqual(["FBD block 'fn' (MUX): its inputs are K, IN0; MUX takes K, then IN0, IN1 and more inputs in order"]);
  });
});
