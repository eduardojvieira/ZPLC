import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CompilerError, compileMultiTaskProject, type ProgramSource } from '../compiler';
import type { PLCLanguage } from '../types';
import { elementOfDiagnostic, elementToSelect } from './diagnosticElement';
import { clearElementSelection, pendingElementSelection, requestElementSelection } from './elementSelectionRequests';

const projects = join(import.meta.dir, '../../projects');
const read = <T>(path: string): T => JSON.parse(readFileSync(join(projects, path), 'utf8')) as T;

/** What Build says about a diagram: the diagnostics of the first failing compile, each with the element the build attached. */
function build(language: PLCLanguage, extension: string, content: string): CompilerError[] {
  const sources: ProgramSource[] = [{ name: 'main', content, language, sourceRef: `src/main${extension}` }];
  try {
    compileMultiTaskProject({ name: 'P', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main'] }] }, sources);
  } catch (error) {
    if (error instanceof CompilerError) return error.errors;
  }
  throw new Error('the build was expected to fail');
}

describe('LNG-003 Problems selects the element that the build named', () => {
  it('finds, from the open file and the message of the problem, the element the Tool API names (FBD, compile phase)', () => {
    const model = read<{ blocks: Array<{ id: string; type: string; variableName?: string }> }>('blinky_fbd/src/main.fbd.json');
    model.blocks.find((block) => block.type === 'variable')!.variableName = 'Undeclared';
    const content = JSON.stringify(model);
    const errors = build('FBD', '.fbd.json', content);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    for (const error of errors) {
      expect(error.element).toMatch(/^block:/);
      expect(elementOfDiagnostic({ language: 'FBD', content }, { message: error.detail, line: error.line })).toBe(error.element);
    }
  });

  it('finds the element of a finding of the translation, which has no position (FBD, transpile phase)', () => {
    const model = read<{ connections: Array<{ id: string; to: { block: string } }> }>('blinky_fbd/src/main.fbd.json');
    const wire = model.connections[0]!;
    model.connections = model.connections.slice(1);
    const content = JSON.stringify(model);
    const [error] = build('FBD', '.fbd.json', content);
    expect(error!.line).toBe(0);
    expect(error!.element).toBe(`block:${wire.to.block}`);
    expect(elementOfDiagnostic({ language: 'FBD', content }, { message: error!.detail })).toBe(error!.element);
  });

  it('finds the action and the transition of an SFC chart', () => {
    const model = read<{ actions: Array<{ id: string; body: string }>; transitions: Array<{ id: string; condition: string }> }>('blinky_sfc/src/main.sfc.json');
    model.actions[0]!.body = 'Undeclared := TRUE;';
    model.transitions[0]!.condition = 'AlsoUndeclared';
    const content = JSON.stringify(model);
    const errors = build('SFC', '.sfc.json', content);
    expect(errors.map((error) => error.element)).toEqual([`action:${model.actions[0]!.id}`, `transition:${model.transitions[0]!.id}`]);
    for (const error of errors) expect(elementOfDiagnostic({ language: 'SFC', content }, { message: error.detail, line: error.line })).toBe(error.element);
  });

  it('finds the rung and the cell of a Ladder diagram', () => {
    const model = read<{ rungs: Array<{ id: string; grid: Array<Array<{ element: { type: string; variable?: string } | null }>> }> }>('blinky/src/main.ld.json');
    const col = model.rungs[0]!.grid[0]!.findIndex((cell) => cell.element?.variable !== undefined && cell.element.type.startsWith('contact'));
    model.rungs[0]!.grid[0]![col]!.element!.variable = 'Missing';
    const content = JSON.stringify(model);
    const [error] = build('LD', '.ld.json', content);
    expect(error!.element).toBe(`rung:${model.rungs[0]!.id}/cell:0,${col}`);
    expect(elementOfDiagnostic({ language: 'LD', content }, { message: error!.detail, line: error!.line })).toBe(error!.element);
  });

  it('says nothing for a text language, whose Problems row opens the line, and for a message it does not know', () => {
    expect(elementOfDiagnostic({ language: 'ST', content: 'PROGRAM P END_PROGRAM' }, { message: 'x', line: 1 })).toBeUndefined();
    expect(elementOfDiagnostic({ language: 'IL', content: 'LD x' }, { message: 'x', line: 1 })).toBeUndefined();
    const model = read<{ connections: unknown[] }>('blinky_fbd/src/main.fbd.json');
    model.connections = [];
    expect(elementOfDiagnostic({ language: 'FBD', content: JSON.stringify(model) }, { message: 'something else entirely' })).toBeUndefined();
  });
});

describe('LNG-003 a request to select an element waits for the editor of its file', () => {
  it('is kept for its file only, and replaced by a later request', () => {
    clearElementSelection();
    requestElementSelection('src/a.fbd.json', 'block:one');
    expect(pendingElementSelection('src/a.fbd.json')).toEqual({ file: 'src/a.fbd.json', element: 'block:one' });
    expect(pendingElementSelection('src/b.fbd.json')).toBeNull();
    requestElementSelection('src/a.fbd.json', 'block:two');
    expect(pendingElementSelection('src/a.fbd.json')?.element).toBe('block:two');
    clearElementSelection();
    expect(pendingElementSelection('src/a.fbd.json')).toBeNull();
  });
});

describe('LNG-003 the element that came with the diagnostic wins over the one the open file gives', () => {
  const model = read<{ blocks: Array<{ id: string; type: string; variableName?: string }> }>('blinky_fbd/src/main.fbd.json');
  model.blocks.find((block) => block.type === 'variable')!.variableName = 'Undeclared';
  const file = { language: 'FBD' as PLCLanguage, content: JSON.stringify(model) };
  const error = build('FBD', '.fbd.json', file.content)[0]!;
  const diagnostic = { message: error.detail, line: error.line };

  it('selects the element the build carried, even when the open file would give another', () => {
    // From the open file the diagnostic is about the block the build named ...
    expect(elementToSelect(diagnostic, file)).toBe(error.element);
    // ... and one that carries its element is about the one it names.
    expect(elementToSelect({ ...diagnostic, element: 'block:somewhere_else' }, file)).toBe('block:somewhere_else');
  });

  it('needs no open file when the element came with the diagnostic, and selects nothing without either', () => {
    expect(elementToSelect({ message: 'm', element: 'rung:r1/cell:0,2' }, undefined)).toBe('rung:r1/cell:0,2');
    expect(elementToSelect(diagnostic, undefined)).toBeUndefined();
  });

  it('ignores a carried value that is not an element id and falls back to the open file', () => {
    expect(elementToSelect({ ...diagnostic, element: '/etc/passwd' }, file)).toBe(error.element);
  });
});
