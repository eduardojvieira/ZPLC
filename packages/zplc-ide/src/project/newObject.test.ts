import { describe, expect, it } from 'bun:test';
import { compileProject } from '../compiler';
import type { PLCLanguage, TaskDefinition } from '../types';
import { createObject, objectNameProblem, renameTaskRow, type CreateContext, type ObjectKind } from './newObject';

const LANGUAGES: PLCLanguage[] = ['ST', 'IL', 'LD', 'FBD', 'SFC'];
const MAIN = 'PROGRAM Main\nVAR\n    Counter : INT;\nEND_VAR\nCounter := Counter + 1;\nEND_PROGRAM\n';

interface Made {
  files: Map<string, { language: PLCLanguage; content: string }>;
  tasks: TaskDefinition[];
  opened: Array<{ path: string; line: number }>;
}

function fixture(taken: string[] = [], tasks: TaskDefinition[] = []): { ctx: CreateContext; made: Made } {
  const made: Made = { files: new Map(), tasks, opened: [] };
  const ctx: CreateContext = {
    takenNames: new Set(taken.map((name) => name.toLowerCase())),
    programFiles: ['main.st'],
    tasks: () => made.tasks,
    // the file opens as soon as it exists (the store opens its tab): it is born with its skeleton, never written after
    createFile: async (fileName, language, content) => {
      const path = `src/${fileName}`;
      made.files.set(path, { language, content });
      return path;
    },
    setTasks: (next) => {
      made.tasks = next;
    },
    open: async (path, line) => {
      made.opened.push({ path, line });
    },
  };
  return { ctx, made };
}

describe('create from the navigator (SHL-013)', () => {
  it('SHL-013 each kind creates its skeleton and the skeleton builds', async () => {
    const cases: Array<[ObjectKind, PLCLanguage]> = [
      ...LANGUAGES.map((language): [ObjectKind, PLCLanguage] => ['program', language]),
      ['functionBlock', 'ST'],
      ['function', 'ST'],
      ['dataType', 'ST'],
      ['globals', 'ST'],
    ];
    for (const [kind, language] of cases) {
      const { ctx, made } = fixture();
      const { path, line } = await createObject(kind, language, 'Thing', ctx);
      const file = made.files.get(path)!;
      expect(file.language).toBe(language);
      expect(file.content.length).toBeGreaterThan(0);
      expect(line).toBeGreaterThanOrEqual(1);
      // a diagram or a list names its program after the file; a text program, function block or function after the object
      if (kind !== 'program' || language === 'ST' || language === 'IL') expect(file.content).toContain('Thing');
      expect(made.opened).toEqual([{ path, line }]);
      // a kind that is not a program builds next to a program; the program itself builds alone
      const source = kind === 'program' ? file.content : `${MAIN}\n${file.content}`;
      expect(() => compileProject(source, kind === 'program' ? language : 'ST')).not.toThrow();
    }
  });

  it('SHL-013 a name that is not an identifier or is in use is refused with a located message', async () => {
    expect(objectNameProblem('', new Set())).toContain('name');
    expect(objectNameProblem('1Pump', new Set())).toContain('1Pump');
    expect(objectNameProblem('My Pump', new Set())).toContain('My Pump');
    expect(objectNameProblem('IF', new Set())).toContain('IF');
    expect(objectNameProblem('Pump', new Set(['pump']))).toContain('Pump');
    expect(objectNameProblem('Pump_2', new Set(['pump']))).toBeNull();
    const { ctx, made } = fixture(['Pump']);
    await expect(createObject('program', 'ST', 'Pump', ctx)).rejects.toThrow('Pump');
    await expect(createObject('program', 'ST', 'a-b', ctx)).rejects.toThrow('a-b');
    expect(made.files.size).toBe(0);
  });

  it('SHL-013 a task is a row of zplc.json', async () => {
    const existing: TaskDefinition = { name: 'MainTask', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main.st'] };
    const { ctx, made } = fixture([], [existing]);
    const created = await createObject('task', 'ST', 'Fast', ctx);
    expect(created.path).toBe('zplc.json');
    expect(made.tasks).toHaveLength(2);
    expect(made.tasks[0]).toBe(existing);
    expect(made.tasks[1]).toMatchObject({ name: 'Fast', trigger: 'cyclic', programs: ['main.st'] });
    expect(made.files.size).toBe(0);
    expect(made.opened).toEqual([{ path: 'zplc.json', line: 1 }]);
    await expect(createObject('task', 'ST', 'fast', ctx)).rejects.toThrow('fast');
    expect(made.tasks).toHaveLength(2);
  });

  it('SHL-013 a task is renamed in place and keeps its programs; a taken name is refused', () => {
    const tasks: TaskDefinition[] = [
      { name: 'A', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main.st'] },
      { name: 'B', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['b.st'] },
    ];
    const renamed = renameTaskRow(tasks, 1, 'Slow');
    expect(renamed.map((task) => task.name)).toEqual(['A', 'Slow']);
    expect(renamed[1].programs).toEqual(['b.st']);
    expect(renameTaskRow(tasks, 0, 'a')[0].name).toBe('a');
    expect(() => renameTaskRow(tasks, 1, 'a')).toThrow('a');
  });
});
