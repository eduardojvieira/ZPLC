import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('CodeEditor local Monaco bootstrap', () => {
  it('installs the bundled Monaco and its worker, through the runtime module, before mounting an editor', () => {
    const source = readFileSync(join(import.meta.dir, 'CodeEditor.tsx'), 'utf8');

    expect(source.indexOf("from './monacoRuntime';")).toBeGreaterThan(-1);
    expect(source.indexOf("from './monacoRuntime';")).toBeLessThan(source.indexOf("from '@monaco-editor/react'"));
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
    // the live markers are the project's: their ranges and files are set by `langsvc/markers.ts` (markers.test.ts)
    expect(source).toContain('applyProjectMarkers(monaco, ST_LIVE_MARKER_OWNER,');
    expect(source).toContain('ST_LIVE_ANALYSIS_DELAY_MS = 300');
    expect(source).toContain('setSTBufferDiagnostics({ ...identity, diagnostics }, content)');
  });
  it('gives every open text file its own kept Monaco model and reads the current file id in editor handlers', () => {
    const source = readFileSync(join(import.meta.dir, 'CodeEditor.tsx'), 'utf8');

    expect(source).toContain('const modelPath = editorModelPath(projectSession, fileId);');
    expect(source).toContain('path={modelPath}');
    expect(source).toContain('keepCurrentModel');
    expect(source).toContain('const fileId = fileIdRef.current;');
    expect(source).toContain('new WeakMap<MonacoEditor.editor.ITextModel, string[]>()');
  });
});
