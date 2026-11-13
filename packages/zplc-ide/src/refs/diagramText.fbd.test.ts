import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { diagramFields, diagramOccurrences } from './diagramText';

const nothing = (r: ReturnType<typeof diagramOccurrences>): void => {
  expect(r.ok).toBe(false);
  expect(r.occurrences).toEqual([]);
  expect(r.declared.size).toBe(0);
};
const project = (path: string): string => readFileSync(new URL(`../../projects/${path}`, import.meta.url), 'utf8');
const batch = { path: 'src/BatchCount.fbd.json', language: 'FBD' as const, content: project('batch_count_fbd/src/BatchCount.fbd.json') };

describe('FBD document text', () => {
  test('FND-003 a variable used in an FBD block is found with its block element', () => {
    const { occurrences, ok } = diagramOccurrences(batch);
    expect(ok).toBe(true);
    expect(occurrences).toContainEqual({
      language: 'FBD',
      place: { kind: 'element', file: 'src/BatchCount.fbd.json', element: 'block:var_sensor', field: 'variableName' },
      role: 'use',
      text: 'PartSensor',
    });
    expect(occurrences).toContainEqual({
      language: 'FBD',
      place: { kind: 'element', file: 'src/BatchCount.fbd.json', element: 'block:ctu', field: 'instanceName' },
      role: 'use',
      text: 'Count',
    });
  });

  test('FND-004 an output block writes its variable and a variable block reads it', () => {
    const { occurrences } = diagramOccurrences(batch);
    const of = (element: string) => occurrences.find((o) => o.place.kind === 'element' && o.place.element === element);
    expect(of('block:out_full')).toMatchObject({ text: 'BatchFull', role: 'write' });
    expect(of('block:var_reset')).toMatchObject({ text: 'Reset', role: 'use' });
  });

  test('FND-003 a constant, a block type and a comment are fields; a comment holds no reference', () => {
    const fields = diagramFields(batch);
    const at = (element: string, field: string) =>
      fields.find((f) => f.place.kind === 'element' && f.place.element === element && f.field === field);
    expect(at('block:const_pv', 'value')).toMatchObject({ kind: 'expression', text: '3' });
    expect(at('block:ctu', 'type')).toMatchObject({ kind: 'name', text: 'CTU' });
    expect(at('block:var_sensor', 'comment')?.kind).toBe('comment');
    // "TRUE" and "part" are words of that comment and are not occurrences.
    expect(diagramOccurrences(batch).occurrences.some((o) => o.text === 'TRUE' || o.text === 'part')).toBe(false);
  });

  test('FND-004 a variable table row is a declaration with its address', () => {
    const { occurrences, declared } = diagramOccurrences(batch);
    const row = { kind: 'table', file: 'src/BatchCount.fbd.json', section: 'outputs', name: 'BatchFull' } as const;
    expect(occurrences).toContainEqual({ language: 'FBD', place: row, role: 'declaration', text: 'BatchFull' });
    expect(occurrences).toContainEqual({ language: 'FBD', place: row, role: 'binding', text: '%Q0.0' });
    expect(declared.get('BATCHFULL')?.address).toBe('%Q0.0');
  });

  test('FND-004 an FBD document that does not parse gives no occurrences and ok false', () => {
    const broken = { path: 'x.fbd.json', language: 'FBD' as const, content: batch.content.slice(0, 200) };
    nothing(diagramOccurrences(broken));
    expect(diagramFields(broken)).toEqual([]);
  });
});
