// LNG-006: online monitoring reads what the debug map says, and shows a value that it cannot read as unavailable.
import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Glob } from 'bun';
import { compileMultiTaskProject, compileSingleFileWithTask, type DebugMap, type PLCLanguage } from '../compiler';
import type { MonitorEntry, PowerExpr } from '../models/sourceElements';
import { evaluatePower, readElementStates, truthy, variablesOf, type Read } from './elementStates';
import { monitorKey, parseMonitorKey, resolveVariable } from './debugVariables';

const reads =
  (values: Record<string, number | boolean | string>): Read =>
  (variable) =>
    values[variable];

describe('the power of a rung from the values read (LNG-006)', () => {
  const start: PowerExpr = { op: 'var', variable: 'Start' };
  const stop: PowerExpr = { op: 'var', variable: 'Stop', not: true };

  it('follows series (AND) and parallel (OR), with a contact that is normally closed', () => {
    const rung: PowerExpr = { op: 'and', terms: [{ op: 'or', terms: [start, { op: 'var', variable: 'Latch' }] }, stop] };
    expect(evaluatePower(rung, reads({ Start: true, Latch: false, Stop: false }))).toBe(true);
    expect(evaluatePower(rung, reads({ Start: false, Latch: true, Stop: false }))).toBe(true);
    expect(evaluatePower(rung, reads({ Start: true, Latch: false, Stop: true }))).toBe(false);
    expect(evaluatePower(rung, reads({ Start: false, Latch: false, Stop: false }))).toBe(false);
  });

  it('reads a number as TRUE when it is not zero, and a TIME the same way', () => {
    expect(truthy(0)).toBe(false);
    expect(truthy(250)).toBe(true);
    expect(truthy('TRUE')).toBe(true);
    expect(truthy(undefined)).toBeUndefined();
  });

  it('is unavailable when a value it needs was not read and nothing decides it', () => {
    const rung: PowerExpr = { op: 'and', terms: [start, { op: 'var', variable: 'Unread' }] };
    expect(evaluatePower(rung, reads({ Start: true }))).toBeUndefined();
    // a FALSE decides an AND, a TRUE decides an OR, whatever else could not be read
    expect(evaluatePower(rung, reads({ Start: false }))).toBe(false);
    expect(evaluatePower({ op: 'or', terms: [start, { op: 'var', variable: 'Unread' }] }, reads({ Start: true }))).toBe(true);
    expect(evaluatePower({ op: 'or', terms: [start, { op: 'var', variable: 'Unread' }] }, reads({ Start: false }))).toBeUndefined();
  });
});

describe('the states of elements from monitor entries (LNG-006)', () => {
  const entries: MonitorEntry[] = [
    { element: 'rung:r1/cell:0,0', role: 'power', in: { op: 'true' }, out: { op: 'var', variable: 'Start' } },
    { element: 'rung:r1/cell:0,0', role: 'value', variable: 'Start' },
    { element: 'block:t1', role: 'output', port: 'Q', variable: 'T1.Q' },
    { element: 'block:t1', role: 'output', port: 'ET', variable: 'T1.ET' },
    { element: 'step:s1', role: 'step', variable: 'X_s1' },
    { element: 'step:s1', role: 'time', variable: 'T_s1.ET' },
    { element: 'transition:t1', role: 'condition', variable: '_C_t1' },
    { element: 'transition:t1', role: 'fired', variable: '_F_t1' },
  ];

  it('reads each state from the variable the entry names', () => {
    const states = readElementStates(
      entries,
      reads({ Start: true, 'T1.Q': false, 'T1.ET': 1200, X_s1: true, 'T_s1.ET': 340, _C_t1: false, _F_t1: false }),
    );
    expect(states.get('rung:r1/cell:0,0')).toMatchObject({ power: true, powerOut: true, value: true });
    expect(states.get('block:t1')!.pins).toEqual({ Q: false, ET: 1200 });
    expect(states.get('step:s1')).toMatchObject({ active: true, time: 340 });
    expect(states.get('transition:t1')).toMatchObject({ condition: false, fired: false });
  });

  it('shows what was not read as unavailable, never as FALSE', () => {
    const states = readElementStates(entries, reads({}));
    expect(states.get('rung:r1/cell:0,0')!.power).toBe(true);
    expect(states.get('rung:r1/cell:0,0')!.powerOut).toBeUndefined();
    expect(states.get('step:s1')!.active).toBeUndefined();
    expect(states.get('transition:t1')!.condition).toBeUndefined();
    expect(states.get('block:t1')!.pins).toEqual({ Q: undefined, ET: undefined });
  });

  it('lists each variable the entries need, once, including those inside a power expression', () => {
    expect(variablesOf(entries).sort()).toEqual(['Start', 'T1.ET', 'T1.Q', 'T_s1.ET', 'X_s1', '_C_t1', '_F_t1']);
  });
});

describe('a variable is read from the program of its own file (LNG-006)', () => {
  const programOf = (name: string, extra: string) =>
    `PROGRAM ${name}\nVAR\n  Local : INT;\n${extra}END_VAR\n  Local := Local + 1;\nEND_PROGRAM\n`;
  const map = compileSingleFileWithTask(programOf('Main', ''), 'ST', { sourceRef: 'src/main.st', programName: 'Main' }).debugMap;

  it('finds a variable of the file, and a member of a block instance, by the program of the file', () => {
    const withTimer = compileSingleFileWithTask(programOf('Main', '  T : TON;\n'), 'ST', {
      sourceRef: 'src/main.st',
      programName: 'Main',
    }).debugMap;
    expect(resolveVariable(withTimer, 'src/main.st', 'Local')).toMatchObject({ path: 'Local', type: 'INT' });
    expect(resolveVariable(withTimer, './src/main.st', 'T.Q')).toMatchObject({ path: 'T.Q', type: 'BOOL' });
  });

  it('does not find a name that the program does not have, nor a program that is not the file', () => {
    expect(resolveVariable(map, 'src/main.st', 'Nope')).toBeUndefined();
    expect(resolveVariable(map, 'src/other.st', 'Local')).toBeUndefined();
    expect(resolveVariable(null, 'src/main.st', 'Local')).toBeUndefined();
  });

  it('keys a variable by its file, so the same name in two programs is two values', () => {
    expect(parseMonitorKey(monitorKey('src/a.ld.json', '_rung1_result'))).toEqual({
      sourceRef: 'src/a.ld.json',
      variable: '_rung1_result',
    });
    expect(monitorKey('src/a.ld.json', 'X')).not.toBe(monitorKey('src/b.ld.json', 'X'));
    expect(parseMonitorKey('Count')).toBeNull();
  });
});

describe('every variable that a translated source says it reads exists in the debug map (LNG-006)', () => {
  const root = join(import.meta.dir, '../..');
  const sources = [...new Glob('projects/**/*.{ld,fbd,sfc}.json').scanSync({ cwd: root })].sort();

  it('has example diagrams to check', () => {
    expect(sources.length).toBeGreaterThanOrEqual(5);
  });

  // A diagram is built with the Structured Text files beside it, as its project builds it (CMP-042): a function block that
  // one of them declares is a block the diagram may place.
  const declarationsBeside = (path: string) =>
    readdirSync(join(root, dirname(path)))
      .filter((file) => file.endsWith('.st'))
      .map((file) => {
        const sourceRef = `${dirname(path)}/${file}`;
        return { name: sourceRef, content: readFileSync(join(root, sourceRef), 'utf8'), language: 'ST' as PLCLanguage, sourceRef };
      });
  const project = {
    name: 'Diagram',
    version: '1.0.0',
    tasks: [{ name: 'MainTask', trigger: 'cyclic' as const, interval_ms: 10, priority: 1, programs: ['Main'] }],
  };

  for (const path of sources) {
    it(`${path}: each entry names a variable of its program`, () => {
      const language: PLCLanguage = path.includes('.ld.') ? 'LD' : path.includes('.fbd.') ? 'FBD' : 'SFC';
      const diagram = { name: 'Main', content: readFileSync(join(root, path), 'utf8'), language, sourceRef: path };
      const map: DebugMap = compileMultiTaskProject(project, [diagram, ...declarationsBeside(path)]).debugMap;
      const pou = Object.values(map.pou).find((candidate) => candidate.sourceRef === path)!;
      expect(pou.monitor?.length).toBeGreaterThan(0);
      const missing = variablesOf(pou.monitor!).filter((variable) => resolveVariable(map, path, variable) === undefined);
      expect(missing).toEqual([]);
    });
  }
});

describe('forced and faulted variables reach the state of the element that shows them (UX-009, LNG-006)', () => {
  const entries: MonitorEntry[] = [
    { element: 'block:b', role: 'output', port: 'Q', variable: 'Run' },
    { element: 'block:b', role: 'output', port: 'ET', variable: 'T1.ET' },
    { element: 'block:v', role: 'value', variable: 'Lamp' },
    { element: 'step:s', role: 'step', variable: 'X_s' },
    { element: 'step:s', role: 'time', variable: 'T_s.ET' },
    { element: 'transition:t', role: 'condition', variable: '_C_t' },
    { element: 'transition:t', role: 'fired', variable: '_F_t' },
  ];
  const flags: Record<string, { forced?: boolean; fault?: boolean }> = {
    Run: { forced: true },
    'T1.ET': { fault: true },
    Lamp: { forced: true },
    X_s: { fault: true },
    _C_t: { forced: true },
    'T_s.ET': { fault: true },
  };

  it('puts the flags of the variable each pin, value, step and condition names on that element', () => {
    const states = readElementStates(entries, reads({ Run: true, Lamp: false }), (variable) => flags[variable]);
    expect(states.get('block:b')!.pinFlags).toEqual({ Q: { forced: true }, ET: { fault: true } });
    expect(states.get('block:v')!.flags).toEqual({ forced: true });
    expect(states.get('step:s')!.flags).toEqual({ fault: true });
    expect(states.get('transition:t')!.flags).toEqual({ forced: true });
  });

  it('does not let the time or the fired flag of an element stand for the state it shows', () => {
    const states = readElementStates(entries, reads({}), (variable) => flags[variable]);
    // T_s.ET is faulted, but the step is shown by X_s; _F_t has no flag and the condition is forced
    expect(states.get('step:s')!.flags).toEqual({ fault: true });
    expect(states.get('transition:t')!.flags).toEqual({ forced: true });
  });

  it('has no flags at all when none are given, so an unflagged diagram renders as it did', () => {
    const states = readElementStates(entries, reads({ Run: true }));
    expect(states.get('block:b')!.pinFlags).toEqual({});
    expect(states.get('block:v')!.flags).toBeUndefined();
    expect(states.get('step:s')!.flags).toBeUndefined();
  });
});
