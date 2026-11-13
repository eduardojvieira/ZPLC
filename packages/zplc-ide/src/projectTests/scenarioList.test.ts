import { describe, expect, it } from 'bun:test';
import { listProjectTests, type TestsRoot } from './scenarioList';

/** A project folder with a `tests` folder holding these files. */
export function fakeRoot(files: Record<string, string>, otherEntries: Array<{ kind: string; name: string }> = []): TestsRoot {
  return {
    async getDirectoryHandle(name) {
      if (name !== 'tests') throw new Error('NotFoundError');
      return {
        async *values() {
          for (const [fileName, text] of Object.entries(files))
            yield { kind: 'file', name: fileName, getFile: async () => ({ text: async () => text }) };
          for (const entry of otherEntries) yield entry;
        },
      };
    },
  };
}

const scenario = (id: string) =>
  JSON.stringify({
    id,
    expectations: [
      { kind: 'AT', atMs: 250, condition: {} },
      { kind: 'FOR', fromMs: 20, forMs: 380, condition: {} },
      { kind: 'NEVER', condition: {} },
    ],
  });

describe('project tests list', () => {
  it('TST-001 the list has one row per scenario file with its id and expectations', async () => {
    const root = fakeRoot({ 'b.scenario.json': scenario('Beta'), 'a.scenario.json': scenario('Alpha'), 'notes.txt': 'x' });
    const tests = await listProjectTests(root, new Map());
    expect(tests.map((test) => [test.path, test.id, test.valid])).toEqual([
      ['tests/a.scenario.json', 'Alpha', true],
      ['tests/b.scenario.json', 'Beta', true],
    ]);
    expect(tests[0]!.expectations).toEqual([
      { index: 0, kind: 'AT', atMs: 250 },
      { index: 1, kind: 'FOR', atMs: 20 },
      { index: 2, kind: 'NEVER' },
    ]);
  });

  it('TST-001 a project without a tests folder, or without a folder, has no tests', async () => {
    expect(await listProjectTests(null)).toEqual([]);
    const noFolder: TestsRoot = {
      getDirectoryHandle: async () => {
        throw new Error('NotFoundError');
      },
    };
    expect(await listProjectTests(noFolder)).toEqual([]);
  });

  it('TST-001 an invalid scenario file is listed as invalid', async () => {
    const root = fakeRoot({ 'broken.scenario.json': '{not json', 'empty.scenario.json': '{"id":"","expectations":[]}' });
    const tests = await listProjectTests(root, new Map());
    expect(tests.map((test) => [test.id, test.valid, test.expectations.length])).toEqual([
      ['broken', false, 0],
      ['empty', false, 0],
    ]);
  });

  it('TST-001 an unsaved scenario buffer is read, not the disk', async () => {
    const root = fakeRoot({ 'a.scenario.json': scenario('OnDisk') });
    const tests = await listProjectTests(root, new Map([['tests/a.scenario.json', scenario('InEditor')]]));
    expect(tests.map((test) => test.id)).toEqual(['InEditor']);
  });
});
