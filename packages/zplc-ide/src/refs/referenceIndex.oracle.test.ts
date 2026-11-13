import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compilerCompile } from '../cli/toolApi';
import { buildProjectIndex } from '../langsvc/projectIndex';
import { diagramFields, diagramOccurrences } from './diagramText';
import { buildReferenceIndex } from './referenceIndex';

// The oracle of the design (plan-u2.md, FND-004, point 1): what the build binds to an element, the walker finds.
const root = (name: string): string => fileURLToPath(new URL(`../../projects/${name}`, import.meta.url));
const CASES = [
  { project: 'seal_in_ladder', file: 'SealIn.ld.json', language: 'LD' as const },
  { project: 'batch_count_fbd', file: 'BatchCount.fbd.json', language: 'FBD' as const },
  { project: 'sfc_press_cell', file: 'PressCell.sfc.json', language: 'SFC' as const },
];

describe('the reference index against the debug map', () => {
  for (const { project, file, language } of CASES) {
    test(`FND-004 every monitor entry of the build of a ${language} project is an occurrence of the walker`, async () => {
      const built = await compilerCompile(root(project));
      if (!built.ok) throw new Error(`${project} did not build`);
      const path = `src/${file}`;
      const content = readFileSync(`${root(project)}/${path}`, 'utf8');
      const index = buildReferenceIndex({
        st: buildProjectIndex([]),
        files: [{ path, language, content }],
        config: null,
        watch: [],
        scenarios: [],
      });
      const { declared } = diagramOccurrences({ path, language, content });
      let bound = 0;
      for (const [pou, info] of Object.entries(built.debugMap!.pou)) {
        for (const entry of info.monitor ?? []) {
          // `Motor.Running` binds the instance `Motor`. A name the build generated (`X_s1`, `_C_t1`) is not written in the
          // source, so an SFC condition is bound through the names its text holds.
          const named = entry.variable?.split('.')[0];
          const text = diagramFields({ path, language, content }).find(
            (f) => f.place.kind === 'element' && f.place.element === entry.element && f.field === 'condition',
          )?.text;
          const names = index.namesOfElement(path, entry.element).map((n) => n.toUpperCase());
          const wanted =
            entry.role === 'condition' && text !== undefined
              ? [...declared.keys()].filter((d) => new RegExp(`\\b${d}\\b`, 'i').test(text))
              : named && declared.has(named.toUpperCase())
                ? [named.toUpperCase()]
                : [];
          if (wanted.length === 0) continue;
          bound += 1;
          expect({ at: `${pou} ${entry.element}`, names }).toEqual({
            at: `${pou} ${entry.element}`,
            names: expect.arrayContaining(wanted),
          });
        }
      }
      expect(bound).toBeGreaterThan(0);
    });
  }
});
