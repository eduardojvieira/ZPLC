import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('CodeEditor local Monaco bootstrap', () => {
  it('configures the installed Monaco module and Vite worker before mounting an editor', () => {
    const source = readFileSync(join(import.meta.dir, 'CodeEditor.tsx'), 'utf8');

    expect(source).toContain("import * as monaco from 'monaco-editor';");
    expect(source).toContain("import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';");
    expect(source).toContain('MonacoEnvironment ??= { getWorker: () => new EditorWorker() }');
    expect(source.indexOf('loader.config({ monaco });')).toBeLessThan(source.indexOf('export function CodeEditor'));
  });

  it('labels a non-paused debug editor as context rather than a running runtime', () => {
    const source = readFileSync(join(import.meta.dir, 'CodeEditor.tsx'), 'utf8');

    expect(source).toContain("debugMode === 'simulation' ? 'Simulation' : 'Hardware'");
    expect(source).not.toContain("isPaused ? 'Paused' : 'Running'");
    expect(source).not.toContain("bg-green-500 animate-pulse");
  });

  it('keeps live ST markers isolated from canonical build markers', () => {
    const source = readFileSync(join(import.meta.dir, 'CodeEditor.tsx'), 'utf8');

    expect(source).toContain("const ST_LIVE_MARKER_OWNER = 'zplc.st-live';");
    expect(source).toContain("setModelMarkers(model, 'zplc.compiler', markers)");
    expect(source).toContain('setModelMarkers(model, ST_LIVE_MARKER_OWNER, markers)');
    expect(source).toContain('setModelMarkers(model, ST_LIVE_MARKER_OWNER, [])');
    expect(source).toContain('ST_LIVE_ANALYSIS_DELAY_MS = 300');
    expect(source).toContain('setSTBufferDiagnostics({ ...identity, diagnostics }, content)');
  });
});
