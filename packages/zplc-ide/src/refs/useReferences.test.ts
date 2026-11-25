import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import type { FileTreeNode, ProjectFileWithHandle } from '../types';
import { referenceIndexFor, readReferenceInputFrom } from './sources';
import { summarize, useReferences } from './useReferences';

const SOURCE = [
  'PROGRAM Main',
  'VAR',
  '  Start : BOOL;',
  '  Lamp : BOOL;',
  'END_VAR',
  '  Lamp := Start;',
  '  IF Start THEN Lamp := TRUE; END_IF;',
  'END_PROGRAM',
].join('\n');
const tree: FileTreeNode = {
  id: 'root',
  name: 'p',
  type: 'directory',
  path: '',
  children: [{ id: 'src/Main.st', name: 'Main.st', type: 'file', path: 'src/Main.st', language: 'ST' }],
};
const load = async () =>
  referenceIndexFor(
    await readReferenceInputFrom({
      tree,
      loaded: new Map<string, ProjectFileWithHandle>(),
      sources: [{ path: 'src/Main.st', content: SOURCE }],
      config: null,
      watch: [],
      read: async () => SOURCE,
    }),
  );

describe('useReferences', () => {
  beforeEach(() => useReferences.getState().clear());
  // the store is shared by the files after this one (the Search view reads its mode)
  afterAll(() => useReferences.getState().clear());

  test('FND-004 finding references of a variable fills the result and the header counts', async () => {
    const target = { kind: 'symbol', scope: 'src/Main.st#Main', name: 'Start' } as const;
    await useReferences.getState().find(target, load);
    const state = useReferences.getState();
    expect(state.status).toBe('ready');
    expect(state.mode).toBe('references');
    expect(state.target).toEqual(target);
    expect(state.result?.definition?.role).toBe('declaration');
    expect(state.result?.uses.map((use) => use.place.kind === 'text' && use.place.line)).toEqual([6, 7]);
    expect(summarize(state.result!)).toEqual({ uses: 2, files: 1 });
    state.clear();
    expect(useReferences.getState().result).toBeNull();
    expect(useReferences.getState().mode).toBe('search');
  });

  test('FND-004 a name that is declared nowhere says so and offers nothing to open', async () => {
    await useReferences.getState().find({ kind: 'symbol', scope: '', name: 'Ghost' }, load);
    const { result, status } = useReferences.getState();
    expect(status).toBe('ready');
    expect(result?.definition).toBeUndefined();
    expect(result?.uses).toEqual([]);
    expect(summarize(result!)).toEqual({ uses: 0, files: 0 });
  });
});
