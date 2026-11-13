import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { diagramFields, diagramOccurrences } from './diagramText';

const nothing = (r: ReturnType<typeof diagramOccurrences>): void => {
  expect(r.ok).toBe(false);
  expect(r.occurrences).toEqual([]);
  expect(r.declared.size).toBe(0);
};
const project = (path: string): string => readFileSync(new URL(`../../projects/${path}`, import.meta.url), 'utf8');
const file = (path: string, content: string) => ({ path, language: 'LD' as const, content });
const sealIn = file('src/SealIn.ld.json', project('seal_in_ladder/src/SealIn.ld.json'));

const doc = (variables: unknown, rungs: unknown): string => JSON.stringify({ name: 'D', variables, rungs });

describe('Ladder document text', () => {
  test('FND-003 a variable used in a rung is an occurrence of its contact with the cell element', () => {
    const { occurrences, ok } = diagramOccurrences(sealIn);
    expect(ok).toBe(true);
    const start = occurrences.find((o) => o.text === 'StartPB' && o.place.kind === 'element');
    expect(start).toEqual({
      language: 'LD',
      place: { kind: 'element', file: 'src/SealIn.ld.json', element: 'rung:rung_1/cell:0,1', field: 'variable' },
      role: 'use',
      text: 'StartPB',
    });
    expect(diagramFields(sealIn).some((f) => f.kind === 'variable' && f.text === 'StartPB' && f.place.kind === 'element')).toBe(true);
  });

  test('FND-003 a comment is an occurrence of kind comment text and an identifier inside it is not a reference', () => {
    const fields = diagramFields(sealIn);
    const rungComment = fields.find((f) => f.place.kind === 'element' && f.place.element === 'rung:rung_1' && f.field === 'comment');
    expect(rungComment?.kind).toBe('comment');
    expect(rungComment?.text).toContain('seal-in');
    // "Motor" is written inside the rung comment and is not an occurrence there.
    const inComment = diagramOccurrences(sealIn).occurrences.filter((o) => o.place.kind === 'element' && o.place.element === 'rung:rung_1');
    expect(inComment).toEqual([]);
  });

  test('FND-004 a coil is a write and a contact is a use', () => {
    const { occurrences } = diagramOccurrences(sealIn);
    const at = (variable: string, element: string) =>
      occurrences.find((o) => o.text === variable && o.place.kind === 'element' && o.place.element === element);
    expect(at('Motor', 'rung:rung_1/cell:0,7')?.role).toBe('write');
    expect(at('Motor', 'rung:rung_1/cell:1,1')?.role).toBe('use');
    expect(at('StopPB', 'rung:rung_1/cell:0,0')?.role).toBe('use');
  });

  test('FND-004 a function block instance is a use, its output binding a write, a member is not a name', () => {
    const content = doc({ local: [{ name: 'T1', type: 'TON' }], outputs: [{ name: 'Q1', type: 'BOOL' }] }, [
      {
        id: 'r1',
        number: 1,
        grid: [
          [
            {
              element: {
                id: 'fb',
                type: 'function_block',
                fbType: 'TON',
                instance: 'T1',
                parameters: { IN: 'CONNECTED', PT: 'T#1s' },
                outputs: { Q: 'Q1' },
              },
            },
            { element: { id: 'c', type: 'contact_no', variable: 'T1.Q' } },
          ],
        ],
      },
    ]);
    const { occurrences } = diagramOccurrences(file('a.ld.json', content));
    const byField = (field: string) => occurrences.find((o) => o.place.kind === 'element' && o.place.field === field);
    expect(byField('instance')).toMatchObject({ text: 'T1', role: 'use' });
    expect(byField('outputs.Q')).toMatchObject({ text: 'Q1', role: 'write' });
    expect(occurrences.filter((o) => o.text === 'T1' && o.place.kind === 'element' && o.place.element.endsWith('cell:0,1'))).toHaveLength(
      1,
    );
    expect(occurrences.some((o) => o.text === 'Q' || o.text === 'CONNECTED')).toBe(false);
    expect(byField('parameters.PT')).toBeUndefined();
  });

  test('FND-004 a variable table row is a declaration with its address', () => {
    const { occurrences, declared } = diagramOccurrences(sealIn);
    const row = { kind: 'table', file: 'src/SealIn.ld.json', section: 'inputs', name: 'StartPB' } as const;
    expect(occurrences).toContainEqual({ language: 'LD', place: row, role: 'declaration', text: 'StartPB' });
    expect(occurrences).toContainEqual({ language: 'LD', place: row, role: 'binding', text: '%I0.0' });
    expect(declared.get('STARTPB')).toEqual({ name: 'StartPB', type: 'BOOL', address: '%I0.0' });
    expect(diagramFields(sealIn)).toContainEqual({ place: row, field: 'address', kind: 'name', text: '%I0.0' });
  });

  test('FND-004 a document that does not parse gives no occurrences and ok false', () => {
    for (const content of ['', '{"name":"D","variables":', '{"name":"D"}', '[]']) {
      const f = file('broken.ld.json', content);
      nothing(diagramOccurrences(f));
      expect(diagramFields(f)).toEqual([]);
    }
  });

  test('FND-004 Start is not found inside StartLamp', () => {
    const content = doc({ local: [], outputs: [{ name: 'StartLamp', type: 'BOOL' }] }, [
      { id: 'r1', number: 1, grid: [[{ element: { id: 'c', type: 'coil', variable: 'StartLamp' } }]] },
      {
        id: 'r2',
        number: 2,
        grid: [[{ element: { id: 'f', type: 'function', functionName: 'GT', operands: ['StartLamp + Start', '3'], output: 'Start' } }]],
      },
    ]);
    const { occurrences } = diagramOccurrences(file('a.ld.json', content));
    const starts = occurrences.filter((o) => o.text === 'Start');
    expect(starts.map((o) => (o.place.kind === 'element' ? o.place.field : ''))).toEqual(['operands.0:13', 'output']);
    expect(occurrences.filter((o) => o.text === 'StartLamp').length).toBeGreaterThanOrEqual(3);
  });
});
