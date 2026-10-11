// LNG-015: the diagnostics of the project are markers with the range the front end gave, on the model of each open file.
import { describe, expect, it } from 'bun:test';
import { applyProjectMarkers } from './markers';
import type { STLiveDiagnostic } from '../types';

interface Marker { message: string; severity: number; startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }

function fakeMonaco(files: Record<string, string>) {
  const set = new Map<string, Marker[]>();
  const models = Object.entries(files).map(([path, text]) => {
    const rows = text.split('\n');
    return {
      uri: { path: `/3/file:${path}` },
      getLineCount: () => rows.length,
      getLineMaxColumn: (line: number) => (rows[line - 1]?.length ?? 0) + 1,
      isDisposed: () => false,
    };
  });
  const monaco = {
    MarkerSeverity: { Error: 8, Warning: 4 },
    editor: {
      getModels: () => [...models, { uri: { path: '/3/untitled' }, getLineCount: () => 1, getLineMaxColumn: () => 1, isDisposed: () => false }],
      setModelMarkers: (model: { uri: { path: string } }, owner: string, markers: Marker[]) => { set.set(`${owner}:${model.uri.path}`, markers); },
    },
  };
  return { monaco: monaco as unknown as Parameters<typeof applyProjectMarkers>[0], set };
}

const diagnostic = (patch: Partial<STLiveDiagnostic>): STLiveDiagnostic => ({ code: 'ST_PARSER', type: 'error', message: 'bad', ...patch });

describe('the diagnostics of the project as markers (LNG-015)', () => {
  const files = { 'src/main.st': 'PROGRAM Main\n  X := ;\nEND_PROGRAM\n', 'src/lib.st': 'FUNCTION F : INT\nEND_FUNCTION\n' };

  it('puts each diagnostic on the model of its file, with the range of the front end', () => {
    const { monaco, set } = fakeMonaco(files);
    applyProjectMarkers(monaco, 'live', [
      diagnostic({ file: 'src/main.st', line: 2, column: 8, endLine: 2, endColumn: 9, message: 'Expected expression' }),
      diagnostic({ file: 'src/lib.st', line: 1, column: 10, endLine: 1, endColumn: 11, type: 'warning', code: 'ST_WARNING', message: 'unused' }),
    ], 'src/main.st');
    expect(set.get('live:/3/file:src/main.st')).toEqual([{ message: 'Expected expression', severity: 8, startLineNumber: 2, startColumn: 8, endLineNumber: 2, endColumn: 9 }]);
    expect(set.get('live:/3/file:src/lib.st')).toEqual([{ message: 'unused', severity: 4, startLineNumber: 1, startColumn: 10, endLineNumber: 1, endColumn: 11 }]);
    expect(set.has('live:/3/untitled')).toBe(false);
  });

  it('gives the marker the stable code of the problem, the one a build reports (CMP-006)', () => {
    const { monaco, set } = fakeMonaco(files);
    applyProjectMarkers(monaco, 'live', [diagnostic({ file: 'src/main.st', line: 2, column: 8, endLine: 2, endColumn: 9, errorCode: 'UNEXPECTED_TOKEN' })], 'src/main.st');
    expect(set.get('live:/3/file:src/main.st')).toEqual([{ message: 'bad', code: 'UNEXPECTED_TOKEN', severity: 8, startLineNumber: 2, startColumn: 8, endLineNumber: 2, endColumn: 9 }]);
  });

  it('clears the markers of a file that has none now, and everything when the effect is cleaned up', () => {
    const { monaco, set } = fakeMonaco(files);
    const clear = applyProjectMarkers(monaco, 'live', [diagnostic({ file: 'src/main.st', line: 2, column: 3 })], 'src/main.st');
    expect(set.get('live:/3/file:src/lib.st')).toEqual([]);
    clear();
    expect(set.get('live:/3/file:src/main.st')).toEqual([]);
  });

  it('keeps a position inside its file and gives a one-character range when the front end gave no extent', () => {
    const { monaco, set } = fakeMonaco(files);
    applyProjectMarkers(monaco, 'live', [diagnostic({ file: 'src/main.st', line: 99, column: 99 }), diagnostic({ line: 2, column: 3 })], 'src/main.st');
    expect(set.get('live:/3/file:src/main.st')).toEqual([
      { message: 'bad', severity: 8, startLineNumber: 4, startColumn: 1, endLineNumber: 4, endColumn: 1 },
      { message: 'bad', severity: 8, startLineNumber: 2, startColumn: 3, endLineNumber: 2, endColumn: 4 },
    ]);
  });
});
