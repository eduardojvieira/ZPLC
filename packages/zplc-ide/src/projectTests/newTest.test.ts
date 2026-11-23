import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileSingleFileWithTask } from '../compiler';
import { compileScenario } from '../test-engine';
import type { FileLanguage, FileTreeNode, ZPLCProjectConfig } from '../types';
import { createTest, type NewTestContext } from './newTest';

const example = (file: string) => readFileSync(join(import.meta.dir, '../../projects/first_blink', file), 'utf8');
const BLINK = example('src/FirstBlink.st');
const NO_OUTPUT = 'PROGRAM Quiet\nVAR Count : INT; END_VAR\nCount := Count + 1;\nEND_PROGRAM\n';

const config = (program: string): ZPLCProjectConfig => {
  const task = { name: 'MainTask', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: [program] };
  return { name: 'p', version: '1.0.0', tasks: [task] } as never;
};
const file = (path: string, language: FileLanguage = 'ST'): FileTreeNode => {
  return { id: `file:${path}`, name: path.split('/').pop()!, type: 'file', path, language };
};
const folder = (path: string, children: FileTreeNode[]): FileTreeNode => ({
  id: `dir:${path || '/'}`,
  name: path.split('/').pop() ?? '',
  type: 'directory',
  path,
  children,
});

/** A project in memory: what the context reads and what the store would write. */
function project(source: string, program: string, extra: FileTreeNode[] = []) {
  const written = new Map<string, string>();
  const folders: string[] = [];
  const hasTests = extra.some((node) => node.path === 'tests');
  const tree = folder('', [folder('src', [file(`src/${program}`)]), ...extra]);
  const context: NewTestContext = {
    config: config(program),
    tree,
    read: async (path) => (path === `src/${program}` ? source : null),
    createFolder: async (parent, name) => {
      folders.push(`${parent}/${name}`);
      tree.children!.push(folder(name, []));
    },
    createFile: async (name, language, parent, content) => {
      expect(language).toBe('SCENARIO');
      written.set(`${parent}/${name}`, content);
      return `file:${parent}/${name}`;
    },
  };
  return { context, written, folders, tree, hasTests };
}

describe('the New test action (TST-009)', () => {
  it('TST-009 a new test is valid and opens', async () => {
    const { context, written, folders } = project(BLINK, 'FirstBlink.st');
    const result = await createTest(context);
    expect(result).toMatchObject({
      ok: true,
      path: 'tests/FirstBlink.scenario.json',
      id: 'FirstBlink',
      fileId: 'file:tests/FirstBlink.scenario.json',
    });
    expect(folders).toEqual(['/tests']);
    expect([...written.keys()]).toEqual(['tests/FirstBlink.scenario.json']);
    const scenario = JSON.parse(written.get('tests/FirstBlink.scenario.json')!);
    expect(scenario).toEqual({
      schemaVersion: 1,
      id: 'FirstBlink',
      tickMs: 10,
      durationMs: 1000,
      events: [],
      expectations: [{ kind: 'AT', atMs: 0, condition: { 'FirstBlink.Lamp': false } }],
    });
    const map = compileSingleFileWithTask(BLINK, 'ST', { programName: 'FirstBlink' }).debugMap;
    expect(() => compileScenario(scenario, map)).not.toThrow();
  });

  it('TST-009 a program with no BOOL output is refused with a located message', async () => {
    const { context, written, folders } = project(NO_OUTPUT, 'Quiet.st');
    const result = await createTest(context);
    expect(result).toEqual({ ok: false, message: 'Quiet has no BOOL output to check: add one, or write the test by hand.' });
    expect(written.size).toBe(0);
    expect(folders).toEqual([]);
  });

  it('TST-009 an existing test file is not overwritten', async () => {
    const existing = folder('tests', [
      file('tests/FirstBlink.scenario.json', 'SCENARIO'),
      file('tests/FirstBlink_2.scenario.json', 'SCENARIO'),
    ]);
    const { context, written, folders } = project(BLINK, 'FirstBlink.st', [existing]);
    const result = await createTest(context);
    expect(result).toMatchObject({ ok: true, path: 'tests/FirstBlink_3.scenario.json', id: 'FirstBlink_3' });
    expect([...written.keys()]).toEqual(['tests/FirstBlink_3.scenario.json']);
    expect(JSON.parse(written.get('tests/FirstBlink_3.scenario.json')!).id).toBe('FirstBlink_3');
    expect(folders).toEqual([]);
  });

  it('TST-009 a project with no program or a program that does not build is refused and writes nothing', async () => {
    const none = project(BLINK, 'FirstBlink.st');
    none.context.config = null;
    expect(await createTest(none.context)).toMatchObject({ ok: false });
    const broken = project('PROGRAM Broken\nVAR_OUTPUT X : BOOL; END_VAR\nX := ;\nEND_PROGRAM\n', 'Broken.st');
    const result = await createTest(broken.context);
    expect(result).toEqual({
      ok: false,
      message: 'Broken did not build, so its outputs are not known: fix the build errors, then try again.',
    });
    expect(none.written.size + broken.written.size).toBe(0);
  });
});
