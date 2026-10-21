// The VF-007 guard: the kit and the surfaces of the spec have render tests in a DOM, and the list of the ones still missing only shrinks.
import { describe, expect, it } from 'bun:test';

import { checkDomRender, checkRepository, specSurfaces, type DomRenderList, type SurfaceEntry, type Tree } from './dom-render-coverage';

const SPEC =
  `### 7.4 Studio surfaces\nPaths.\n\n| Surface | Where | State |\n|---|---|---|\n| Welcome screen | a | b |\n| Explorer | c ` +
  `| d |\n\n### 7.5 MCP\n| Tool | x |\n|---|---|\n| project_inspect | y |\n`;
const UI = 'packages/zplc-ide/src/ui/';
const tree = (files: string[], contents: Record<string, string> = {}): Tree => ({
  files,
  read: (path) => contents[path] ?? '',
  exists: (path) => files.includes(path),
});
const entry = (over: Partial<SurfaceEntry> = {}): SurfaceEntry => ({
  surface: 'Welcome screen',
  where: 'components/WelcomeScreen.tsx',
  state: 'tested',
  tests: ['packages/zplc-ide/src/components/WelcomeScreen.dom.test.tsx'],
  reason: '',
  ...over,
});
const list = (surfaces: SurfaceEntry[], kitInternal: DomRenderList['kitInternal'] = []): DomRenderList => ({ kitInternal, surfaces });
const BOTH = [entry(), entry({ surface: 'Explorer', state: 'remaining', tests: [], reason: 'not written yet' })];
const FILES = ['packages/zplc-ide/src/components/WelcomeScreen.dom.test.tsx'];
const note = '1 surfaces remain';

describe('DOM render coverage guard: the spec table (VF-007)', () => {
  it('reads the surface names from the table of section 7.4 and stops at the next section', () => {
    expect(specSurfaces(SPEC)).toEqual(['Welcome screen', 'Explorer']);
  });

  it('accepts a list that names every surface and a gate note with the right count', () => {
    expect(checkDomRender(list(BOTH), SPEC, tree(FILES), note)).toEqual([]);
  });

  it('fails on a spec surface that is not listed, and on a listed name the spec does not have', () => {
    const errors = checkDomRender(
      list([entry(), entry({ surface: 'Invented', state: 'out-of-scope', tests: [], reason: 'x' })]),
      SPEC,
      tree(FILES),
      '0 surfaces remain',
    ).join('\n');
    expect(errors).toContain('spec surface missing from dom-render-surfaces.json: Explorer');
    expect(errors).toContain('not a row of the spec table: Invented');
  });

  it('fails on a remaining surface whose render test now exists, so the list only shrinks', () => {
    const errors = checkDomRender(
      list([entry({ state: 'remaining', reason: 'later' }), entry({ surface: 'Explorer', state: 'out-of-scope', tests: [], reason: 'x' })]),
      SPEC,
      tree(FILES),
      '1 surfaces remain',
    );
    expect(errors).toEqual([
      expect.stringContaining('is remaining but packages/zplc-ide/src/components/WelcomeScreen.dom.test.tsx exists'),
    ]);
  });

  it('fails on a tested surface whose test file is gone, on a test that is not a dom test, and on a missing reason', () => {
    const errors = checkDomRender(
      list([
        entry({ tests: ['packages/zplc-ide/src/components/Gone.dom.test.tsx', 'packages/zplc-ide/src/components/Plain.test.tsx'] }),
        entry({ surface: 'Explorer', state: 'remaining', tests: [], reason: ' ' }),
      ]),
      SPEC,
      tree([]),
      '1 surfaces remain',
    ).join('\n');
    expect(errors).toContain('Gone.dom.test.tsx does not exist');
    expect(errors).toContain('Plain.test.tsx is not a *.dom.test.tsx');
    expect(errors).toContain('Explorer is remaining without a reason');
  });
});

describe('DOM render coverage guard: the kit, the isolation and the evidence note (VF-007)', () => {
  const kit = [`${UI}Button.tsx`, `${UI}cx.ts`, `${UI}Button.test.tsx`];

  it('fails on a kit component without its own render test', () => {
    expect(checkDomRender(list(BOTH), SPEC, tree([...FILES, ...kit]), note)).toEqual([
      expect.stringContaining(`needs ${UI}Button.dom.test.tsx`),
    ]);
    expect(checkDomRender(list(BOTH), SPEC, tree([...FILES, ...kit, `${UI}Button.dom.test.tsx`]), note)).toEqual([]);
  });

  it('accepts an internal kit module with a reason, and fails when it has none or has gained a test', () => {
    const portal = `${UI}Portal.tsx`;
    expect(checkDomRender(list(BOTH, [{ file: portal, reason: 'covered through Dialog' }]), SPEC, tree([...FILES, portal]), note)).toEqual(
      [],
    );
    expect(checkDomRender(list(BOTH, [{ file: portal, reason: '' }]), SPEC, tree([...FILES, portal]), note).join('\n')).toContain(
      'without a reason',
    );
    expect(
      checkDomRender(list(BOTH, [{ file: portal, reason: 'x' }]), SPEC, tree([...FILES, portal, `${UI}Portal.dom.test.tsx`]), note).join(
        '\n',
      ),
    ).toContain('take it off kitInternal');
  });

  it('fails on a plain test that imports happy-dom or Testing Library, which would leak the DOM into the other tests', () => {
    const plain = 'packages/zplc-ide/src/x/Plain.test.tsx';
    const errors = checkDomRender(
      list(BOTH),
      SPEC,
      tree([...FILES, plain], { [plain]: "import { render } from '@testing-library/react';" }),
      note,
    );
    expect(errors).toEqual([expect.stringContaining('would not stay isolated')]);
    expect(
      checkDomRender(list(BOTH), SPEC, tree([...FILES, plain], { [plain]: "import { render } from 'react-dom/server';" }), note),
    ).toEqual([]);
  });

  it('accepts a browser test as the render test of a surface, and fails on any other file', () => {
    const browser = 'packages/zplc-ide/src/editors/ld/LDEditor.browser.test.ts';
    const list2 = list([entry({ tests: [browser] }), entry({ surface: 'Explorer', tests: [browser] })]);
    expect(checkDomRender(list2, SPEC, tree([browser]), undefined)).toEqual([]);
    const other = list([
      entry({ tests: [browser, 'packages/zplc-ide/src/editors/ld/LDEditor.spec.ts'] }),
      entry({ surface: 'Explorer', tests: [browser] }),
    ]);
    expect(checkDomRender(other, SPEC, tree([browser]), undefined).join('\n')).toContain('is not a *.dom.test.tsx or a *.browser.test.ts');
  });

  it('wants the gate gone once no surface remains, so the requirement is covered by its tests', () => {
    const none = list([entry(), entry({ surface: 'Explorer', state: 'out-of-scope', tests: [], reason: 'a data module' })]);
    expect(checkDomRender(none, SPEC, tree(FILES), undefined)).toEqual([]);
    expect(checkDomRender(none, SPEC, tree(FILES), '0 surfaces remain')).toEqual([expect.stringContaining('take the VF-007 gate out')]);
  });

  it('fails when the gate note of the evidence file miscounts the remaining surfaces', () => {
    expect(checkDomRender(list(BOTH), SPEC, tree(FILES), '3 surfaces remain')).toEqual([
      expect.stringContaining('must say "1 surfaces remain"'),
    ]);
    expect(checkDomRender(list(BOTH), SPEC, tree(FILES), undefined)).toEqual([expect.stringContaining('no VF-007 gate note')]);
  });
});

describe('DOM render coverage guard: this repository (VF-007)', () => {
  it('has a render test for every kit component and a state for every surface of the spec', () => {
    expect(checkRepository()).toEqual([]);
  });
});
