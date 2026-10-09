import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createEmptyFileContent } from '../types';
import { parseFBDModel } from './fbd';
import { parseLDModel } from './ld';
import { parseSFCModel } from './sfc';
import { MAX_VIOLATIONS, loadFBDFile, loadLDFile, loadSFCFile } from './visualFileLoad';

const packageRoot = join(import.meta.dir, '../..');
const fixtures = (suffix: string): string[] => ['projects', 'src/examples'].flatMap((directory) => [...new Bun.Glob(`${directory}/**/*.${suffix}.json`).scanSync({ cwd: packageRoot })]).sort();
const read = (path: string): string => readFileSync(join(packageRoot, path), 'utf8');

function failure(result: ReturnType<typeof loadLDFile>) {
  if (result.ok) throw new Error('expected the file to be rejected');
  return result.error;
}

describe('valid visual files load', () => {
  it('finds the example projects it is checked against', () => {
    expect(fixtures('ld').length).toBeGreaterThanOrEqual(5);
    expect(fixtures('fbd').length).toBeGreaterThanOrEqual(2);
    expect(fixtures('sfc').length).toBeGreaterThanOrEqual(2);
  });

  it('loads every Ladder example project to the model the editor already used', () => {
    for (const path of fixtures('ld')) {
      const result = loadLDFile(path, read(path));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.model).toEqual(parseLDModel(read(path)));
    }
  });

  it('loads every FBD example project to the model the editor already used', () => {
    for (const path of fixtures('fbd')) {
      const result = loadFBDFile(path, read(path));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.model).toEqual(parseFBDModel(read(path)));
    }
  });

  it('loads every SFC example project to the model the editor already used', () => {
    for (const path of fixtures('sfc')) {
      const result = loadSFCFile(path, read(path));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.model).toEqual(parseSFCModel(read(path)));
    }
  });

  it('loads the empty file that Studio creates for each language', () => {
    expect(loadLDFile('New.ld.json', createEmptyFileContent('LD')).ok).toBe(true);
    expect(loadFBDFile('New.fbd.json', createEmptyFileContent('FBD')).ok).toBe(true);
    expect(loadSFCFile('New.sfc.json', createEmptyFileContent('SFC')).ok).toBe(true);
  });
});

describe('malformed Ladder files are rejected with the file name and the first violations', () => {
  const valid = () => JSON.parse(read('projects/blinky/src/main.ld.json')) as Record<string, unknown>;

  it('rejects text that is not JSON', () => {
    const error = failure(loadLDFile('src/main.ld.json', '{ "name": '));
    expect(error.fileName).toBe('src/main.ld.json');
    expect(error.violations).toHaveLength(1);
    expect(error.violations[0]).toContain('not valid JSON');
  });

  it('rejects a document that is not an object', () => {
    expect(failure(loadLDFile('a.ld.json', '[]')).violations[0]).toContain('expected object');
    expect(failure(loadLDFile('a.ld.json', 'null')).violations[0]).toContain('expected object');
  });

  it('names the path of a missing or mistyped field', () => {
    const withoutRungs = valid();
    delete withoutRungs.rungs;
    expect(failure(loadLDFile('a.ld.json', JSON.stringify(withoutRungs))).violations).toEqual([expect.stringContaining('rungs')]);
    expect(failure(loadLDFile('a.ld.json', JSON.stringify({ ...valid(), rungs: {} }))).violations[0]).toMatch(/^rungs: /);
  });

  it('rejects an element of an unknown type, with its position', () => {
    const model = valid() as { rungs: Array<{ grid: Array<Array<{ element: { type: string } | null }>> }> };
    const cell = model.rungs[0].grid[0].find((candidate) => candidate.element);
    cell!.element!.type = 'contact_sideways';
    const violations = failure(loadLDFile('a.ld.json', JSON.stringify(model))).violations;
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/^rungs\[0\]\.grid\[0\]\[\d+\]\.element\.type: /);
  });

  it('rejects a rung with neither a grid nor elements, and a grid cell that is not an object', () => {
    const model = valid() as { rungs: Array<Record<string, unknown>> };
    expect(failure(loadLDFile('a.ld.json', JSON.stringify({ ...model, rungs: [{ id: 'r1', number: 1 }] }))).violations[0]).toContain('grid or elements');
    expect(failure(loadLDFile('a.ld.json', JSON.stringify({ ...model, rungs: [{ id: 'r1', number: 1, grid: [[null]] }] }))).violations[0]).toMatch(/^rungs\[0\]\.grid\[0\]\[0\]: /);
  });

  it('reports at most the first few violations and counts the rest', () => {
    const rungs = Array.from({ length: 9 }, (_, index) => ({ number: index + 1, elements: [] }));
    const error = failure(loadLDFile('a.ld.json', JSON.stringify({ ...valid(), rungs })));
    expect(error.violations).toHaveLength(MAX_VIOLATIONS);
    expect(error.violations[0]).toMatch(/^rungs\[0\]\.id: /);
    expect(error.more).toBe(4);
  });
});

describe('malformed FBD and SFC files are rejected the same way', () => {
  it('rejects an FBD file with a mistyped block and reports the path', () => {
    const model = JSON.parse(read('projects/blinky_fbd/src/main.fbd.json')) as { blocks: Array<Record<string, unknown>> };
    model.blocks[1].position = { x: 'left', y: 10 };
    const error = failure(loadFBDFile('src/main.fbd.json', JSON.stringify(model)));
    expect(error.fileName).toBe('src/main.fbd.json');
    expect(error.violations[0]).toMatch(/^blocks\[1\]\.position\.x: /);
  });

  it('rejects an FBD file whose connection points at a block that does not exist', () => {
    const model = JSON.parse(read('projects/blinky_fbd/src/main.fbd.json')) as { connections: Array<{ from: { block: string } }> };
    model.connections[0].from.block = 'no_such_block';
    expect(failure(loadFBDFile('a.fbd.json', JSON.stringify(model))).violations[0]).toContain('unknown source block');
  });

  it('rejects an SFC file without steps and one without an initial step', () => {
    const model = JSON.parse(read('projects/blinky_sfc/src/main.sfc.json')) as { steps: Array<{ isInitial?: boolean }> };
    expect(failure(loadSFCFile('a.sfc.json', JSON.stringify({ ...model, steps: 'none' }))).violations[0]).toMatch(/^steps: /);
    for (const step of model.steps) step.isInitial = false;
    expect(failure(loadSFCFile('a.sfc.json', JSON.stringify(model))).violations[0]).toContain('initial step');
  });

  it('does not accept a Ladder file as an SFC file', () => {
    const error = failure(loadSFCFile('a.sfc.json', read('projects/blinky/src/main.ld.json')));
    expect(error.violations.some((violation) => violation.startsWith('steps: '))).toBe(true);
  });
});

describe('the editor opens visual files through the validating loaders', () => {
  it('no longer parses a visual model inline', () => {
    const source = readFileSync(join(import.meta.dir, '../components/EditorArea.tsx'), 'utf8');
    for (const loader of ['loadLDFile', 'loadFBDFile', 'loadSFCFile']) expect(source).toContain(`${loader}(activeFile.path || activeFile.name, activeFile.content)`);
    for (const parser of ['parseLDModel(', 'parseFBDModel(', 'parseSFCModel(']) expect(source).not.toContain(parser);
    expect(source).toContain('data-file-error');
  });
});
