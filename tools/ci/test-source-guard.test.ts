import { describe, expect, it } from 'bun:test';

import { checkOffenders, productReads, runGuard, validatePinned, type Pinned } from './test-source-guard';

// The fixtures are built, not written out, so that this file holds no read call of its own for the guard to see.
const read = (path: string) => `const text = ${'readFile'}Sync(${path}, 'utf8');`;
const tracked = [
  'packages/zplc-ide/src/components/Console.tsx',
  'packages/zplc-ide/src/components/Console.tabNavigation.test.ts',
  'packages/zplc-ide/src/components/learnContent.en.v1.ts',
  'packages/zplc-ide/src/index.css',
  'packages/zplc-ide/electron/main.ts',
  'packages/zplc-ide/projects/blinky_st/src/main.st',
  'packages/zplc-ide/projects/blinky_st/zplc.json',
  'packages/zplc-ide/zplc.schema.json',
  '.github/workflows/ci.yml',
  'scripts/release-version.ts',
  'firmware/lib/zplc_core/include/zplc_isa.h',
  'firmware/lib/zplc_core/src/core/vm.c',
  'firmware/lib/zplc_core/tests/fixtures/zplc-v1-code-task-tags.hex',
  'firmware/app/CMakeLists.txt',
  'examples/02_addition.asm',
  'conformance/arithmetic/001-add.st',
  'packages/zplc-compiler/src/assembler/assembler.test.ts',
  'packages/zplc-compiler/src/compiler/codegen.ts',
  'packages/zplc-compiler/src/compiler/stdlib/timers.ts',
  'packages/zplc-compiler/src/compiler/index.ts',
  'packages/zplc-ide/src/index.ts',
  'firmware/app/src/zplc_modbus.c',
  'firmware/lib/zplc_core/CMakeLists.txt',
  'tools/hil/validate_release_evidence.py',
  '.github/workflows/release.yml',
  'scripts/release-version.test.ts',
  'packages/zplc-ide/src/data/catalog.json',
  'firmware/lib/zplc_core/tests/fixtures/loader_fixture.c',
  'packages/zplc-ide/src/cli/fixtures/legacy_manifest.ts',
];
const reads = (path: string, body: string) => productReads({ path, text: body }, tracked);

describe('test source guard: a test that reads a product source file (VF-006)', () => {
  it('flags a component source read next to the test', () => {
    const body = `import { join } from 'node:path';\n${read("join(import.meta.dir, 'Console.tsx')")}`;
    expect(reads('packages/zplc-ide/src/components/Console.tabNavigation.test.ts', body)).toEqual([
      'packages/zplc-ide/src/components/Console.tsx',
    ]);
  });

  it('flags a style sheet reached by a URL relative to the test', () => {
    const body = read("new URL('../index.css', import.meta.url)");
    expect(reads('packages/zplc-ide/src/theme/contrast.test.ts', body)).toEqual(['packages/zplc-ide/src/index.css']);
  });

  it('flags a workflow read by a path relative to the repository root', () => {
    const body = read("new URL('../.github/workflows/ci.yml', import.meta.url)");
    expect(reads('scripts/workflow.test.mjs', body)).toEqual(['.github/workflows/ci.yml']);
  });

  it('follows a directory constant and a loop variable to the files that are read', () => {
    const body = [
      'const electronDir = path.join(import.meta.dir);',
      "for (const name of ['main.ts']) {",
      `  ${read('path.join(electronDir, name)')}`,
      '}',
    ].join('\n');
    expect(reads('packages/zplc-ide/electron/preload.test.ts', body)).toEqual(['packages/zplc-ide/electron/main.ts']);
  });

  it('flags a C header and a firmware CMake file read by a Python test', () => {
    const body = [
      'ROOT = Path(__file__).resolve().parents[2]',
      'header = (ROOT / "firmware/lib/zplc_core/include/zplc_isa.h").read_text()',
      'cmake = (ROOT /',
      '    "firmware/app/CMakeLists.txt").read_text()',
    ].join('\n');
    expect(reads('tools/hil/test_boards.py', body)).toEqual(['firmware/app/CMakeLists.txt', 'firmware/lib/zplc_core/include/zplc_isa.h']);
  });

  it('follows a helper parameter to the arguments of the helper calls, a rest parameter included', () => {
    const body = [
      'const header = (path: string) => readFile' + "Sync(new URL(`../../../${path}`, import.meta.url), 'utf8');",
      'const sourceOf = (...parts: string[]) => readFile' + "Sync(join(import.meta.dir, '..', ...parts), 'utf8');",
      "header('firmware/lib/zplc_core/include/zplc_isa.h');",
      "sourceOf('components', 'Console.tsx');",
    ].join('\n');
    expect(reads('packages/zplc-ide/src/store/wiring.test.ts', body)).toEqual([
      'firmware/lib/zplc_core/include/zplc_isa.h',
      'packages/zplc-ide/src/components/Console.tsx',
    ]);
  });

  it('follows a callback parameter to the array it maps over', () => {
    const body =
      "const text = ['Console.tsx'].map((name) => " + read('join(import.meta.dir, name)').replace('const text = ', '').replace(';', ')');
    expect(reads('packages/zplc-ide/src/components/x.test.ts', body)).toEqual(['packages/zplc-ide/src/components/Console.tsx']);
  });

  it('follows a path constant that the test imports from a tracked module', () => {
    const body = [
      "import { SOURCE } from './release-version';",
      "const root = join(import.meta.dir, '..');",
      read('join(root, SOURCE)'),
    ].join('\n');
    const modules: Record<string, string> = {
      'scripts/release-version.ts': "export const SOURCE = 'firmware/lib/zplc_core/src/core/vm.c';",
    };
    expect(productReads({ path: 'scripts/release-version.test.ts', text: body }, tracked, (path) => modules[path])).toEqual([
      'firmware/lib/zplc_core/src/core/vm.c',
    ]);
  });

  it('reports the directory when a listing of it feeds a read', () => {
    const body = [
      'const files = readdir' + "Sync(join(import.meta.dir, 'stdlib')).map((name) => join(import.meta.dir, 'stdlib', name));",
      'const offenders = files.filter((file) => ' + read('file').replace('const text = ', '').replace(';', ')') + ';',
    ].join('\n');
    expect(reads('packages/zplc-compiler/src/compiler/x.test.ts', body)).toEqual(['packages/zplc-compiler/src/compiler/stdlib/']);
  });

  it('flags a Python test that loads the module under test and reads the file that module names', () => {
    const validator = 'RELEASE_WORKFLOW = ROOT / ".github/workflows/release.yml"\n';
    const body =
      'MODULE_PATH = Path(__file__).with_name("validate_release_evidence.py")\ndef workflow():\n    return ' +
      'validator.RELEASE_WORKFLOW.read_text()\n';
    const modules: Record<string, string> = { 'tools/hil/validate_release_evidence.py': validator };
    expect(productReads({ path: 'tools/hil/test_validate_release_evidence.py', text: body }, tracked, (path) => modules[path])).toEqual([
      '.github/workflows/release.yml',
    ]);
  });

  it('flags a Python helper that reads the path it is given, from the paths it is called with', () => {
    const body = [
      'ROOT = Path(__file__).resolve().parents[2]',
      'def defines(path):',
      '    return path.read_text()',
      'defines(ROOT / "firmware/app/src/zplc_modbus.c")',
    ].join('\n');
    expect(reads('tools/contract/test_contract.py', body)).toEqual(['firmware/app/src/zplc_modbus.c']);
  });

  it('flags a C test that opens a source file by a literal path', () => {
    const body = '  FILE *file = fo' + 'pen("../src/core/vm.c", "r");\n#include "zplc_isa.h"\n';
    expect(reads('firmware/lib/zplc_core/tests/test_x.c', body)).toEqual(['firmware/lib/zplc_core/src/core/vm.c']);
  });

  it('flags a test outside the assembler that asserts on generated assembly text', () => {
    const body = [
      'const result = compileToBinary(source);',
      'expect(result.' + 'assembly).toContain("STORE16 0x2000");',
      'expect(' + 'asm).not.toMatch(/PUSH/);',
    ].join('\n');
    expect(reads('packages/zplc-compiler/src/compiler/numeric.test.ts', body)).toEqual(['generated assembly text']);
  });

  it('flags a raw import of a product source file', () => {
    const body = "import css from '../index.css" + "?raw';";
    expect(reads('packages/zplc-ide/src/theme/raw.test.ts', body)).toEqual(['packages/zplc-ide/src/index.css']);
  });
});

describe('test source guard: reads that are not product source (VF-006)', () => {
  it.each([
    ['a project source', "join(import.meta.dir, '..', '..', 'projects', 'blinky_st', 'src', 'main.st')"],
    ['a project manifest', "join(root, 'zplc.json')"],
    ['the manifest schema', "new URL('../../zplc.schema.json', import.meta.url)"],
    ['a conformance case', "join(root, 'conformance', 'arithmetic', '001-add.st')"],
    ['an assembly example', "join(root, 'examples', '02_addition.asm')"],
    ['a loader fixture', "join(here, 'tests', 'fixtures', 'zplc-v1-code-task-tags.hex')"],
    ['a C file kept among the fixtures of a test', "join(import.meta.dir, 'fixtures', 'loader_fixture.c')"],
    ['a TypeScript file kept among the fixtures of a test', "join(import.meta.dir, 'fixtures', 'legacy_manifest.ts')"],
    ['a data file that lives beside the product source', "join(import.meta.dir, '..', 'data', 'catalog.json')"],
    ['a file the test wrote to a temporary folder', "join(folder, 'src', 'main.st')"],
    ['a path that is only known at run time', 'tempPath'],
  ])('ignores %s', (_name, path) => {
    expect(reads('packages/zplc-ide/src/store/x.test.ts', read(path))).toEqual([]);
  });

  it('ignores a bare file name that several product files share: it does not say which one is read', () => {
    const body = read("join(fixture.root, 'firmware', 'app', 'CMakeLists.txt')") + read("join(dir, 'index.ts')");
    expect(reads('packages/zplc-ide/src/cli/index.test.ts', body)).toEqual([]);
  });

  it('ignores repository-relative paths read from a temporary folder: only a chain anchored at the test is the repository', () => {
    const body = [
      'const root = await makeTemporaryRepository();',
      "const before = ['firmware/app/CMakeLists.txt'].map((name) => " +
        read('join(root, name)').replace('const text = ', '').replace(';', ')') +
        ';',
    ].join('\n');
    expect(reads('packages/zplc-ide/src/cli/toolApi.test.ts', body)).toEqual([]);
  });

  it('ignores a read of a path that only the test knows, even when it names a product file elsewhere', () => {
    const body = [
      "const cli = join(import.meta.dir, 'index.ts');",
      'const out = ' + 'readFile' + "Sync(artifact, 'utf8');",
      'Bun.spawn([cli]);',
    ].join('\n');
    expect(reads('packages/zplc-ide/src/cli/run.test.ts', body)).toEqual([]);
  });

  it('ignores a test that names a product file but never reads a file', () => {
    expect(reads('packages/zplc-ide/src/x.test.ts', "const name = 'Console.tsx'; expect(label(name)).toBe('Console');")).toEqual([]);
  });

  it('ignores a read that is only mentioned in a comment', () => {
    const body = `// ${read("join(import.meta.dir, 'Console.tsx')")}\n/* ${read("'index.css'")} */`;
    expect(reads('packages/zplc-ide/src/components/x.test.ts', body)).toEqual([]);
  });

  it('lets the assembler tests read what they like: assembly text may be asserted there', () => {
    const body = read("join(import.meta.dir, '..', 'compiler', 'Console.tsx')") + '\nexpect(output.' + 'assembly).toContain("NOP");';
    expect(reads('packages/zplc-compiler/src/assembler/assembler.test.ts', body)).toEqual([]);
  });

  it('does not take the bytes or the diagnostics of a build for assembly text', () => {
    const body = [
      'expect(result.bytecode.length).toBeGreaterThan(0);',
      'expect(result.diagnostics).toEqual([]);',
      'expect(assembled).toBe(true);',
      'expect(result.' + 'assembly).toEqual(expect.any(String));',
      "expect(label).toContain('assemble');",
    ].join('\n');
    expect(reads('packages/zplc-compiler/src/compiler/x.test.ts', body)).toEqual([]);
  });
});

describe('test source guard: the list of known offenders (VF-006)', () => {
  const entry = (overrides: Partial<Pinned> = {}): Pinned => ({
    file: 'packages/zplc-ide/src/components/Console.tabNavigation.test.ts',
    requirement: 'VF-006',
    added: '2026-10-10',
    reads: ['packages/zplc-ide/src/components/Console.tsx'],
    replacement: 'dom',
    reason: 'pins the tab markup as text; replaced by a render test once the DOM environment exists',
    ...overrides,
  });
  const offenders = new Map([
    ['packages/zplc-ide/src/components/Console.tabNavigation.test.ts', ['packages/zplc-ide/src/components/Console.tsx']],
  ]);

  it('accepts a list that matches what the tests read', () => {
    expect(checkOffenders(offenders, [entry()])).toEqual([]);
  });

  it('fails on a test that reads product source and is not listed', () => {
    expect(checkOffenders(offenders, [])).toEqual([
      expect.stringContaining('new offender: packages/zplc-ide/src/components/Console.tabNavigation.test.ts'),
    ]);
  });

  it('fails on a listed test that no longer reads product source, so the list only shrinks', () => {
    expect(checkOffenders(new Map(), [entry()])).toEqual([
      expect.stringContaining('stale entry: packages/zplc-ide/src/components/Console.tabNavigation.test.ts no longer reads product source'),
    ]);
  });

  it('fails on a listed test that stops reading one of its files, and on one that starts reading another', () => {
    expect(
      checkOffenders(offenders, [entry({ reads: ['packages/zplc-ide/src/components/Console.tsx', 'packages/zplc-ide/src/App.tsx'] })]),
    ).toEqual([expect.stringContaining('no longer reads packages/zplc-ide/src/App.tsx')]);
    expect(checkOffenders(offenders, [entry({ reads: ['packages/zplc-ide/src/App.tsx'] })]).join('\n')).toContain(
      'does not name: packages/zplc-ide/src/components/Console.tsx',
    );
  });

  it('rejects an entry that has no requirement, reason, replacement or date, or is listed twice', () => {
    const errors = validatePinned([
      entry({ requirement: 'later', reason: ' ', replacement: 'someday', added: '10/10', reads: [] }),
      entry(),
      entry(),
    ]);
    expect(errors.join('\n')).toContain('requirement must look like VF-006');
    expect(errors.join('\n')).toContain('reason must say');
    expect(errors.join('\n')).toContain('replacement must be one of');
    expect(errors.join('\n')).toContain('added must be a valid');
    expect(errors.join('\n')).toContain('reads must list');
    expect(errors.join('\n')).toContain('duplicate entry');
    expect(validatePinned([entry()], new Set(['VF-006']))).toEqual([]);
    expect(validatePinned([entry()], new Set(['VF-007']))).toEqual([expect.stringContaining('not in tools/ci/requirements-index.json')]);
  });
});

describe('test source guard: this repository (VF-006)', () => {
  it('has no test file that reads product source without a pinned entry, and no stale entry', () => {
    const { errors, tests } = runGuard();
    expect(tests).toBeGreaterThan(100);
    expect(errors).toEqual([]);
  });
});
