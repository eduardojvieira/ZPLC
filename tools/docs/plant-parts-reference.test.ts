import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import type { PartDefinition } from '../../packages/zplc-ide/src/plant/contracts.ts';
import { PARTS, outputsFor, partsBody } from './plant-parts-reference';
import { LANGS, staleOutputs } from './reference-lib';

const headings = (text: string) => [...text.matchAll(/^(#{2,6}) /gm)].map((m) => m[1]!.length);
const rows = (text: string) =>
  text
    .split('\n')
    .filter((l) => l.startsWith('|'))
    .map((l) => l.split(' | ').length);

describe('PRT-002 parts reference generated from the part definitions', () => {
  it('PRT-002 the reference lists every catalogue part with its signals, ranges and fault actions', () => {
    expect(PARTS.length).toBeGreaterThan(0);
    for (const lang of LANGS) {
      const body = partsBody(PARTS, lang);
      for (const part of PARTS) {
        expect(body).toContain(`\`${part.id}\``);
        expect(body).toContain(part.names[lang]);
        for (const [key, field] of Object.entries(part.config)) {
          expect(body).toContain(`\`${key}\``);
          if (field.min !== undefined) expect(body).toContain(String(field.min));
          if (field.max !== undefined) expect(body).toContain(String(field.max));
        }
        for (const action of part.actions) expect(body).toContain(`\`${action}\``);
        const sample = { id: 'x', part: part.id, name: 'Name', position: [0, 0, 0], rotationYDeg: 0, config: {} } as const;
        for (const s of part.signals(sample as never)) {
          const short = s.name.replace(/^Name\./, '');
          expect(body).toContain(`| \`${short}\` | ${s.direction} | ${s.type} |`);
        }
      }
    }
  });

  it('PRT-002 --check fails when a part definition changes and the page does not', () => {
    const root = mkdtempSync(join(tmpdir(), 'parts-ref-'));
    for (const { file, content } of outputsFor(PARTS)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), content);
    }
    expect(staleOutputs(outputsFor(PARTS), root)).toEqual([]);
    const changed: PartDefinition[] = [{ ...PARTS[0]!, actions: [...PARTS[0]!.actions, 'newFault'] }, ...PARTS.slice(1)];
    expect(staleOutputs(outputsFor(changed), root).length).toBe(2);
  });

  it('PRT-002 English and Spanish pages have the same table structure', () => {
    expect(headings(partsBody(PARTS, 'es'))).toEqual(headings(partsBody(PARTS, 'en')));
    expect(rows(partsBody(PARTS, 'es'))).toEqual(rows(partsBody(PARTS, 'en')));
  });

  it('PRT-002 the parts reference orders a Process section after the others in both languages', () => {
    const process: PartDefinition = { ...PARTS[0]!, id: 'zz-process', family: 'process' };
    const titles = { en: 'Process', es: 'Proceso' } as const;
    for (const lang of LANGS) {
      const body = partsBody([process, ...PARTS], lang);
      const at = body.indexOf(`## ${titles[lang]}`);
      expect(at).toBeGreaterThan(-1);
      expect(body.indexOf('`zz-process`')).toBeGreaterThan(at);
      for (const other of body.matchAll(/^## (.+)$/gm)) if (other[1] !== titles[lang]) expect(other.index!).toBeLessThan(at);
    }
  });
});
