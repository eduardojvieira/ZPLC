// The structural rules of Studio's source (IDE-014, IDE-033): layering, import cycles and module size.
// The fixtures are small in-memory projects; the last block runs the rules over the repository itself.
import { describe, expect, it } from 'bun:test';

import { checkIdeStructure, checkRepository, ratchetOffenders, wholeStoreSubscriptions, type LayeringException, type Offender, type SourceModule } from './ide-structure';

const IDE = 'packages/zplc-ide/';
const mod = (path: string, text = ''): SourceModule => ({ path: `${IDE}${path}`, text });
const lines = (count: number): string => `${'export const x = 1;\n'.repeat(count)}`;
const offender = (file: string, count: number): Offender => ({ file: `${IDE}${file}`, requirement: 'IDE-014', added: '2026-10-10', lines: count, reason: 'split it' });
const check = (modules: SourceModule[], offenders: Offender[] = [], limit = 100) => checkIdeStructure(modules, { limit, offenders });

describe('layering stopgap (IDE-033): one command-line import of electron/ is listed', () => {
  it('reports a store module that imports a component, naming both files', () => {
    const problems = check([
      mod('src/store/useThing.ts', "import { helper } from '../components/helper';\n"),
      mod('src/components/helper.ts', 'export const helper = 1;\n'),
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('src/store/useThing.ts');
    expect(problems[0]).toContain('src/components/helper.ts');
    expect(problems[0]).toContain('IDE-033');
  });

  it('reports a type-only import of a component from the store as well', () => {
    const problems = check([
      mod('src/store/useThing.ts', "import type { Shape } from '../components/shape';\n"),
      mod('src/components/shape.ts', 'export interface Shape { a: number }\n'),
    ]);
    expect(problems).toHaveLength(1);
  });

  it('reports a command-line module that imports from the electron folder', () => {
    const problems = check([
      mod('src/cli/run.ts', "import { supervise } from '../../electron/supervisor';\n"),
      mod('electron/supervisor.ts', 'export const supervise = 1;\n'),
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('src/cli/run.ts');
    expect(problems[0]).toContain('electron/supervisor.ts');
  });

  it('accepts the other directions: a component using the store and the electron folder using the store of nobody', () => {
    expect(check([
      mod('src/components/Panel.tsx', "import { useThing } from '../store/useThing';\n"),
      mod('src/store/useThing.ts', 'export const useThing = 1;\n'),
      mod('src/cli/run.ts', "import { shared } from '../project/shared';\n"),
      mod('src/project/shared.ts', 'export const shared = 1;\n'),
    ])).toEqual([]);
  });
});

describe('a component must not subscribe to the whole store (IDE-013)', () => {
  it('finds the three forms of a subscription to everything', () => {
    const text = [
      'const all = useIDEStore();',
      'const { a } = useIDEStore();',
      'const state = useIDEStore((s) => s);',
      'const debug = useIDEStore((state) => state.debug);',
      'const ok = useIDEStore((state) => state.debug.mpeekEnabled);',
      'const fields = useIDEStore(useShallow(selectToolbarState));',
      'const stateOf = useIDEStore.getState();',
      '// const commented = useIDEStore();',
    ].join('\n');
    expect(wholeStoreSubscriptions(text)).toEqual([1, 2, 3, 4]);
  });

  it('is reported with the module and the line, for a module outside the store', () => {
    const problems = check([mod('src/components/Panel.tsx', "import { useIDEStore } from '../store/useIDEStore';\nexport const P = () => useIDEStore();\n"), mod('src/store/useIDEStore.ts', 'export const useIDEStore = () => 1;\n')]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('IDE-013');
    expect(problems[0]).toContain('src/components/Panel.tsx:2');
  });

  it('accepts a module of the store that reads its own state', () => {
    expect(check([mod('src/store/other.ts', 'const state = useIDEStore();\n')])).toEqual([]);
  });
});

describe('ratchetOffenders', () => {
  const sizes = new Map([[`${IDE}src/shrunk.ts`, 120], [`${IDE}src/grown.ts`, 200], [`${IDE}src/split.ts`, 40], [`${IDE}src/same.ts`, 150]]);

  it('lowers an entry that shrank, drops one that is within the limit or gone, and never raises one', () => {
    const entries = [offender('src/shrunk.ts', 150), offender('src/grown.ts', 150), offender('src/split.ts', 150), offender('src/gone.ts', 150), offender('src/same.ts', 150)];
    expect(ratchetOffenders(entries, sizes, 100).map((entry) => `${entry.file.slice(IDE.length)}:${entry.lines}`)).toEqual(['src/shrunk.ts:120', 'src/grown.ts:150', 'src/same.ts:150']);
  });
});

describe('layering exceptions stopgap (IDE-033)', () => {
  const modules = [
    mod('src/cli/run.ts', "import { supervise } from '../../electron/supervisor';\n"),
    mod('electron/supervisor.ts', 'export const supervise = 1;\n'),
  ];
  const exception = (file: string, imports: string): LayeringException => ({ file: `${IDE}${file}`, imports: `${IDE}${imports}`, requirement: 'IDE-033', added: '2026-10-10', reason: 'cannot move yet' });

  it('accepts the listed import and only that one', () => {
    expect(checkIdeStructure(modules, { limit: 100, offenders: [], exceptions: [exception('src/cli/run.ts', 'electron/supervisor.ts')] })).toEqual([]);
    const other = [...modules, mod('src/cli/other.ts', "import { supervise } from '../../electron/supervisor';\n")];
    const problems = checkIdeStructure(other, { limit: 100, offenders: [], exceptions: [exception('src/cli/run.ts', 'electron/supervisor.ts')] });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('src/cli/other.ts');
  });

  it('fails an exception whose import is gone', () => {
    const problems = checkIdeStructure([mod('src/cli/run.ts', 'export const run = 1;\n')], { limit: 100, offenders: [], exceptions: [exception('src/cli/run.ts', 'electron/supervisor.ts')] });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('matches no import');
  });
});

describe('import cycles stopgap (IDE-033)', () => {
  it('reports a cycle with its path, once', () => {
    const problems = check([
      mod('src/a.ts', "import { b } from './b';\nexport const a = b;\n"),
      mod('src/b.ts', "import { c } from './c';\nexport const b = c;\n"),
      mod('src/c.ts', "import { a } from './a';\nexport const c = a;\n"),
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(`${IDE}src/a.ts -> ${IDE}src/b.ts -> ${IDE}src/c.ts -> ${IDE}src/a.ts`);
  });

  it('follows index files and the tsx extension', () => {
    const problems = check([
      mod('src/ui/index.ts', "export * from './Panel';\n"),
      mod('src/ui/Panel.tsx', "import { thing } from '.';\nexport const panel = thing;\n"),
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('import cycle');
  });

  it('ignores type-only and dynamic imports, which cannot create an initialisation cycle', () => {
    expect(check([
      mod('src/a.ts', "import type { B } from './b';\nexport const a = 1;\nexport type A = B;\n"),
      mod('src/b.ts', "export const load = () => import('./a');\nexport type B = number;\n"),
      mod('src/c.ts', "import { type B } from './b';\nexport const c = 1;\n"),
    ])).toEqual([]);
  });

  it('does not follow a package import with the same name as a module', () => {
    expect(check([
      mod('src/zod.ts', "import { z } from 'zod';\nexport const schema = z;\n"),
    ])).toEqual([]);
  });
});

describe('module size stopgap (IDE-014): listed modules may stay above the limit until they are split', () => {
  it('reports a hand-written module above the limit that is not listed', () => {
    const problems = check([mod('src/big.ts', lines(101))]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('src/big.ts has 101 lines');
    expect(problems[0]).toContain('limit of 100');
  });

  it('accepts a module at the limit, and ignores tests and declaration files', () => {
    expect(check([
      mod('src/edge.ts', lines(100)),
      mod('src/big.test.ts', lines(500)),
      mod('src/big.test.tsx', lines(500)),
      mod('src/types/globals.d.ts', lines(500)),
    ])).toEqual([]);
  });

  it('accepts a listed offender at exactly its recorded size', () => {
    expect(check([mod('src/big.ts', lines(150))], [offender('src/big.ts', 150)])).toEqual([]);
  });

  it('fails a listed offender that grew', () => {
    const problems = check([mod('src/big.ts', lines(151))], [offender('src/big.ts', 150)]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('grew from 150 to 151');
  });

  it('fails a listed offender that shrank but is still above the limit, so the list ratchets down', () => {
    const problems = check([mod('src/big.ts', lines(120))], [offender('src/big.ts', 150)]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('now has 120 lines');
    expect(problems[0]).toContain('lower the entry');
  });

  it('fails a stale entry: the module is within the limit, or no longer exists', () => {
    const problems = check([mod('src/small.ts', lines(10))], [offender('src/small.ts', 150), offender('src/gone.ts', 150)]);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('src/small.ts');
    expect(problems[0]).toContain('remove the entry');
    expect(problems[1]).toContain('src/gone.ts');
  });

  it('refuses an entry that names no requirement of the rule', () => {
    const entry: Offender = { ...offender('src/big.ts', 150), requirement: '' };
    const problems = check([mod('src/big.ts', lines(150))], [entry]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('requirement');
  });
});

describe('the repository', () => {
  it('has no layering violation, no import cycle and no module above the limit that is not listed', () => {
    expect(checkRepository()).toEqual([]);
  });
});
