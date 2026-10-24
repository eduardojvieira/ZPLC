import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prepareChangeSet } from './changeSetPrepare';

const project = (...parts: string[]) => readFileSync(join(import.meta.dir, '../../projects', ...parts), 'utf8');
const ld = project('blinky', 'src', 'main.ld.json');
const fbd = project('blinky_fbd', 'src', 'main.fbd.json');
const sfc = project('blinky_sfc', 'src', 'main.sfc.json');
const manifest = JSON.stringify({
  name: 'Plant',
  version: '1.0.0',
  tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main.st'] }],
});
const change = (path: string, content: string, kind: 'modify' | 'create' = 'modify') => ({ path, kind, content });

describe('what an assistant proposes is checked and normalized before a person reviews it (S5)', () => {
  test('a text program is kept as it is', () => {
    const st = 'PROGRAM A\nEND_PROGRAM\n';
    expect(prepareChangeSet([change('src/A.st', st, 'create'), change('src/B.il', 'LD 1\n', 'create')])).toEqual({
      ok: true,
      changes: [change('src/A.st', st, 'create'), change('src/B.il', 'LD 1\n', 'create')],
    });
  });

  test('a ladder, FBD and SFC file that loads is written in the byte-stable form of the editors', () => {
    for (const [path, source] of [
      ['src/Seal.ld.json', ld],
      ['src/Blink.fbd.json', fbd],
      ['src/Seq.sfc.json', sfc],
    ] as const) {
      const compact = JSON.stringify(JSON.parse(source));
      const prepared = prepareChangeSet([change(path, compact, 'create')]);
      expect(prepared.ok, path).toBe(true);
      if (prepared.ok) {
        const text = prepared.changes[0]!.content;
        // two-space JSON with a final newline, the same whether the model sent it compact or laid out, and stable when done again
        expect(text, path).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
        expect(prepareChangeSet([change(path, source, 'create')])).toEqual(prepared);
        expect(prepareChangeSet([change(path, text, 'create')])).toEqual(prepared);
        expect(prepared.changes[0]!.kind).toBe('create');
      }
    }
  });

  test('a visual file that does not load comes back as the violations the person can read, with its path', () => {
    const notJson = prepareChangeSet([change('src/Seal.ld.json', '{ nope')]);
    expect(notJson).toMatchObject({ ok: false, reason: 'invalid-file', path: 'src/Seal.ld.json' });
    const shape = JSON.parse(ld) as Record<string, unknown>;
    delete shape.rungs;
    const missing = prepareChangeSet([change('src/Seal.ld.json', JSON.stringify(shape))]);
    expect(missing).toMatchObject({ ok: false, reason: 'invalid-file', path: 'src/Seal.ld.json' });
    if (!missing.ok) {
      expect(missing.violations.length).toBeGreaterThan(0);
      expect(missing.violations.length).toBeLessThanOrEqual(5);
    }
    const sfcBroken = prepareChangeSet([change('src/Seq.sfc.json', '[]')]);
    expect(sfcBroken).toMatchObject({ ok: false, reason: 'invalid-file', path: 'src/Seq.sfc.json' });
    // one bad file makes the whole set invalid: nothing is reviewed half-way
    expect(prepareChangeSet([change('src/A.st', 'x', 'create'), change('src/Seq.fbd.json', '1')])).toMatchObject({ ok: false });
  });

  test('the manifest is written as Studio writes it, and one that does not parse or holds a credential is refused', () => {
    const prepared = prepareChangeSet([change('zplc.json', manifest)]);
    expect(prepared.ok).toBe(true);
    if (prepared.ok) {
      const written = JSON.parse(prepared.changes[0]!.content) as { schemaVersion: number; name: string };
      expect(written).toMatchObject({ schemaVersion: 2, name: 'Plant' });
      expect(prepared.changes[0]!.content).toBe(JSON.stringify(written, null, 2));
    }
    expect(prepareChangeSet([change('zplc.json', '{')])).toMatchObject({ ok: false, reason: 'invalid-file', path: 'zplc.json' });
    expect(prepareChangeSet([change('zplc.json', JSON.stringify({ name: 'P', version: '1.0.0', tasks: [] }))])).toMatchObject({
      ok: false,
      reason: 'invalid-file',
      path: 'zplc.json',
    });
    const withPassword = JSON.stringify({ ...JSON.parse(manifest), network: { wifi: { password: 'hunter2' } } });
    const refused = prepareChangeSet([change('zplc.json', withPassword)]);
    expect(refused).toMatchObject({ ok: false, reason: 'sensitive-field', path: 'zplc.json' });
    expect(JSON.stringify(refused)).not.toContain('hunter2');
  });
});
