import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { diagramFields, diagramOccurrences } from './diagramText';

const nothing = (r: ReturnType<typeof diagramOccurrences>): void => {
  expect(r.ok).toBe(false);
  expect(r.occurrences).toEqual([]);
  expect(r.declared.size).toBe(0);
};
const project = (path: string): string => readFileSync(new URL(`../../projects/${path}`, import.meta.url), 'utf8');
const press = { path: 'src/PressCell.sfc.json', language: 'SFC' as const, content: project('sfc_press_cell/src/PressCell.sfc.json') };

const at = (o: { place: { kind: string; element?: string; field?: string } }) => `${o.place.element}#${o.place.field}`;

describe('SFC document text', () => {
  test('FND-003 a variable used in a SFC transition condition is found with its column', () => {
    const { occurrences, ok } = diagramOccurrences(press);
    expect(ok).toBe(true);
    const found = occurrences.filter((o) => o.place.kind === 'element' && o.place.element === 'transition:t_start');
    // "Start AND NOT Fault": Start at column 1, Fault at column 15; AND and NOT are keywords.
    expect(found.map((o) => [o.text, at(o), o.role])).toEqual([
      ['Start', 'transition:t_start#condition:1', 'use'],
      ['Fault', 'transition:t_start#condition:15', 'use'],
    ]);
  });

  test('FND-003 an ST action body yields its names, an assigned one is a write', () => {
    const body = diagramOccurrences(press).occurrences.filter((o) => o.place.kind === 'element' && o.place.element === 'action:A_FEED');
    expect(body.map((o) => [o.text, o.role])).toEqual([
      ['Feeder', 'write'],
      ['Press', 'write'],
      ['Alarm', 'write'],
    ]);
    expect(body[0]?.place).toMatchObject({ field: 'body:1' });
  });

  test('FND-003 step names, action names and comments are fields; a comment holds no reference', () => {
    const fields = diagramFields(press);
    const field = (element: string, name: string) =>
      fields.find((f) => f.place.kind === 'element' && f.place.element === element && f.field === name);
    expect(field('step:step_idle', 'name')).toMatchObject({ kind: 'name', text: 'IDLE' });
    expect(field('step:step_idle', 'actions.0.actionName')).toMatchObject({ kind: 'name', text: 'A_IDLE' });
    expect(field('step:step_idle', 'actions.0.comment')).toMatchObject({ kind: 'comment', text: 'Everything off' });
    expect(diagramOccurrences(press).occurrences.some((o) => o.text === 'Everything' || o.text === 'off')).toBe(false);
  });

  test('FND-004 an IL action body is read as IL and a second line carries its line', () => {
    const model = JSON.parse(press.content);
    model.actions = [{ id: 'A_IL', name: 'A_IL', type: 'IL', body: 'LD Start\nST Feeder' }];
    const { occurrences } = diagramOccurrences({ ...press, content: JSON.stringify(model) });
    const il = occurrences.filter((o) => o.place.kind === 'element' && o.place.element === 'action:A_IL');
    expect(il.map((o) => [o.text, at(o), o.role, o.language])).toEqual([
      ['Start', 'action:A_IL#body:4', 'use', 'SFC'],
      ['Feeder', 'action:A_IL#body:2:4', 'write', 'SFC'],
    ]);
  });

  test('FND-004 a variable table row is a declaration with its address', () => {
    const { occurrences, declared } = diagramOccurrences(press);
    const row = { kind: 'table', file: 'src/PressCell.sfc.json', section: 'inputs', name: 'Start' } as const;
    expect(occurrences).toContainEqual({ language: 'SFC', place: row, role: 'declaration', text: 'Start' });
    expect(occurrences).toContainEqual({ language: 'SFC', place: row, role: 'binding', text: '%I0.0' });
    expect(declared.size).toBe(6);
  });

  test('FND-004 an SFC document that does not parse gives no occurrences and ok false', () => {
    const broken = { ...press, content: '{"name":"x","steps":[],"transitions":[]}' };
    nothing(diagramOccurrences(broken));
    expect(diagramFields(broken)).toEqual([]);
  });
});
