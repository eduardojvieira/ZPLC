import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadFBDFile, loadLDFile, loadSFCFile } from './visualFileLoad';

// LNG-011: a file that is JSON but not a model of its language is refused when it is opened, with its name and the
// first violations, instead of reaching an editor that reads fields the file does not have.
const projects = join(import.meta.dir, '../../projects');
const read = <T>(path: string): T => JSON.parse(readFileSync(join(projects, path), 'utf8')) as T;
// only the parts these tests change are typed
interface LdDocument {
  variables: { local: unknown };
  rungs: Array<{ grid: Array<Array<{ element: { variable?: unknown } | null }>> }>;
}
interface FbdDocument {
  variables: { local: unknown };
}
interface SfcDocument {
  variables?: unknown;
  actions?: unknown;
  steps: Array<{ position?: unknown; actions?: unknown }>;
  transitions: Array<{ condition?: unknown }>;
}
const ld = () => read<LdDocument>('blinky/src/main.ld.json');
const fbd = () => read<FbdDocument>('blinky_fbd/src/main.fbd.json');
const sfc = () => read<SfcDocument>('blinky_sfc/src/main.sfc.json');

function violations(result: ReturnType<typeof loadLDFile> | ReturnType<typeof loadFBDFile> | ReturnType<typeof loadSFCFile>): string[] {
  if (result.ok) throw new Error('the file was accepted');
  return result.error.violations;
}

describe('LNG-011 a variable is an object with a name and a type, in every language', () => {
  it('FBD', () => {
    const model = fbd();
    model.variables.local = [1];
    expect(violations(loadFBDFile('a.fbd.json', JSON.stringify(model)))[0]).toMatch(/^variables\.local\[0\]: /);
    model.variables.local = [{ name: 'Ok', type: 'BOOL' }, { name: 'NoType' }];
    expect(violations(loadFBDFile('a.fbd.json', JSON.stringify(model)))[0]).toMatch(/^variables\.local\[1\]\.type: /);
  });

  it('SFC', () => {
    const model = sfc();
    model.variables = { local: [{ name: 'X' }], outputs: [] };
    expect(violations(loadSFCFile('a.sfc.json', JSON.stringify(model)))[0]).toMatch(/^variables\.local\[0\]\.type: /);
    model.variables = 5;
    expect(violations(loadSFCFile('a.sfc.json', JSON.stringify(model)))[0]).toMatch(/^variables: /);
  });
});

describe('LNG-011 the parts of an SFC chart have the shape the editor reads', () => {
  it('actions is a list of objects with an id, a name and a body', () => {
    const model = sfc();
    model.actions = 'none';
    expect(violations(loadSFCFile('a.sfc.json', JSON.stringify(model)))[0]).toMatch(/^actions: /);
    model.actions = [{ id: 'a1', name: 'A' }];
    expect(violations(loadSFCFile('a.sfc.json', JSON.stringify(model)))[0]).toMatch(/^actions\[0\]\.body: /);
  });

  it('a step lists its actions as objects that name an action and a qualifier', () => {
    const model = sfc();
    model.steps[0]!.actions = 5;
    expect(violations(loadSFCFile('a.sfc.json', JSON.stringify(model)))[0]).toMatch(/^steps\[0\]\.actions: /);
    model.steps[0]!.actions = [{ actionName: 'x' }];
    expect(violations(loadSFCFile('a.sfc.json', JSON.stringify(model)))[0]).toMatch(/^steps\[0\]\.actions\[0\]\.qualifier: /);
  });

  it('a step and a transition have a position the canvas can place', () => {
    const model = sfc();
    model.steps[0]!.position = { x: 'left' };
    expect(violations(loadSFCFile('a.sfc.json', JSON.stringify(model)))[0]).toMatch(/^steps\[0\]\.position\./);
  });

  it('a transition has a condition', () => {
    const model = sfc();
    delete model.transitions[0]!.condition;
    expect(violations(loadSFCFile('a.sfc.json', JSON.stringify(model)))[0]).toMatch(/^transitions\[0\]\.condition: /);
  });
});

describe('LNG-011 the parts of a Ladder file have the shape the editor reads', () => {
  it('an element names its variable in text', () => {
    const model = ld();
    const cell = model.rungs[0]!.grid[0]!.find((candidate) => typeof candidate.element?.variable === 'string')!;
    cell.element!.variable = 7;
    expect(violations(loadLDFile('a.ld.json', JSON.stringify(model)))[0]).toMatch(/^rungs\[0\]\.grid\[0\]\[\d+\]\.element\.variable: /);
  });

  it('a variable is an object with a name and a type', () => {
    const model = ld();
    model.variables.local = [null];
    expect(violations(loadLDFile('a.ld.json', JSON.stringify(model)))[0]).toMatch(/^variables\.local\[0\]: /);
  });
});
