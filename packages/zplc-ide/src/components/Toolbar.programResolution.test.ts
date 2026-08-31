import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { getProgramSourceReadMode, resolveProgramSource, resolveProgramSourceForCompilation } from '../utils/programSourceResolution';

const toolbarSource = readFileSync(fileURLToPath(new URL('./Toolbar.tsx', import.meta.url)), 'utf8');

describe('resolveProgramSource', () => {
  it('resolves LD task references to visual editor json files', () => {
    const result = resolveProgramSource('main.ld', [
      {
        name: 'main.ld.json',
        content: '{"nodes":[],"edges":[]}',
        language: 'LD',
      },
    ]);

    expect(result).toEqual({
      name: 'main',
      content: '{"nodes":[],"edges":[]}',
      language: 'LD',
      sourceRef: 'main.ld.json',
    });
  });

  it('resolves exact ST task references unchanged', () => {
    const result = resolveProgramSource('main.st', [
      {
        name: 'main.st',
        content: 'PROGRAM Main\nEND_PROGRAM',
        language: 'ST',
      },
    ]);

    expect(result).toEqual({
      name: 'main',
      content: 'PROGRAM Main\nEND_PROGRAM',
      language: 'ST',
      sourceRef: 'main.st',
    });
  });

  it('keeps the exact project-relative path separate from the logical task reference', () => {
    const result = resolveProgramSource('MotorTask', [
      {
        name: 'MotorTask',
        path: 'src/Motor.st',
        content: 'PROGRAM Motor\nEND_PROGRAM',
        language: 'ST',
      },
      {
        name: 'other.st',
        path: 'src/other.st',
        content: 'PROGRAM Other\nEND_PROGRAM',
        language: 'ST',
      },
    ]);

    expect(result).toEqual({
      name: 'MotorTask',
      content: 'PROGRAM Motor\nEND_PROGRAM',
      language: 'ST',
      sourceRef: 'src/Motor.st',
    });
  });

  it('returns null when no alias matches', () => {
    const result = resolveProgramSource('main.ld', [
      {
        name: 'other.ld.json',
        content: '{}',
        language: 'LD',
      },
    ]);

    expect(result).toBeNull();
  });

  it('uses a matching modified buffer before reading the project file', async () => {
    let diskReads = 0;
    const result = await resolveProgramSourceForCompilation(
      'main.ld',
      () => [
        { name: 'other.ld.json', content: '{"disk":"unrelated"}', language: 'LD', isModified: true },
        { name: 'main.ld.json', content: '{"buffer":"new"}', language: 'LD', isModified: true },
      ],
      async () => {
        diskReads += 1;
        return { name: 'main.ld.json', content: '{"disk":"old"}', language: 'LD' };
      },
    );

    expect(result).toEqual({ name: 'main', content: '{"buffer":"new"}', language: 'LD', sourceRef: 'main.ld.json' });
    expect(diskReads).toBe(0);
  });

  it('keeps FBD and SFC visual-file aliases when preferring a modified buffer', async () => {
    for (const [reference, fileName, language] of [
      ['main.fbd', 'main.fbd.json', 'FBD'],
      ['main.sfc', 'main.sfc.json', 'SFC'],
    ] as const) {
      const result = await resolveProgramSourceForCompilation(
        reference,
        () => [{ name: fileName, content: '{}', language, isModified: true }],
        async () => { throw new Error('must not read disk'); },
      );
      expect(result).toEqual({ name: 'main', content: '{}', language, sourceRef: fileName });
    }
  });

  it('reads the project file when the matching buffer is not modified', async () => {
    let diskReads = 0;
    const result = await resolveProgramSourceForCompilation(
      'main.st',
      () => [{ name: 'main.st', content: 'PROGRAM Main // old buffer', language: 'ST', isModified: false }],
      async () => {
        diskReads += 1;
        return { name: 'main.st', content: 'PROGRAM Main // disk', language: 'ST' };
      },
    );

    expect(result).toEqual({ name: 'main', content: 'PROGRAM Main // disk', language: 'ST', sourceRef: 'main.st' });
    expect(diskReads).toBe(1);
  });

  it('aborts a local compilation when reading disk fails', async () => {
    await expect(resolveProgramSourceForCompilation(
      'main.st',
      () => [{ name: 'main.st', content: 'PROGRAM Main // fallback', language: 'ST', isModified: false }],
      async () => { throw new Error('disk unavailable'); },
    )).rejects.toThrow('disk unavailable');
  });

  it('uses the latest loaded-file snapshot when compilation begins', async () => {
    let files = [{ name: 'main.st', content: 'PROGRAM Main // stale', language: 'ST', isModified: false }];
    const readFresh = async () => ({ name: 'main.st', content: 'PROGRAM Main // disk', language: 'ST' });
    const resolve = () => resolveProgramSourceForCompilation('main.st', () => files, readFresh);
    files = [{ name: 'main.st', content: 'PROGRAM Main // edited', language: 'ST', isModified: true }];

    await expect(resolve()).resolves.toEqual({ name: 'main', content: 'PROGRAM Main // edited', language: 'ST', sourceRef: 'main.st' });
  });

  it('uses a clean loaded file only when no local file reader exists', async () => {
    await expect(resolveProgramSourceForCompilation(
      'main.st',
      () => [{ name: 'main.st', content: 'PROGRAM Main // virtual', language: 'ST', isModified: false }],
      null,
    )).resolves.toEqual({ name: 'main', content: 'PROGRAM Main // virtual', language: 'ST', sourceRef: 'main.st' });
  });

  it('treats a virtual project with a display tree as virtual and rejects local projects without a tree', () => {
    expect(getProgramSourceReadMode(true, true)).toBe('loaded');
    expect(() => getProgramSourceReadMode(false, false)).toThrow('Local project file tree is unavailable');
  });
});

describe('canonical workspace build failures', () => {
  it('reveals Problems for real build failures without changing canonical precondition guidance', () => {
    expect(toolbarSource).toContain("const revealCompileProblems = () => {");
    expect(toolbarSource).toContain("current.setActiveConsoleTab('problems');");
    expect(toolbarSource.match(/revealCompileProblems\(\);/g)?.length).toBeGreaterThanOrEqual(6);
    expect(toolbarSource).toContain("current.setActiveConsoleTab('tests');");
  });

  it('always creates one visible compiler problem when no safe diagnostic is available', () => {
    expect(toolbarSource).toContain('if (canonical.diagnostics.length === 0)');
    expect(toolbarSource.match(/addCompilerMessage\(\{ type: 'error', message: 'Canonical workspace build failed' \}\);/g)?.length).toBe(2);
  });

  it('blocks a partial Electron compiler bridge before renderer compilation', () => {
    expect(toolbarSource).toContain("window.electronAPI !== undefined || navigator.userAgent.includes('Electron/')");
    expect(toolbarSource).toContain("workspaceCompileRoute === 'canonical-unavailable'");
    expect(toolbarSource.indexOf("workspaceCompileRoute === 'canonical-unavailable'"))
      .toBeLessThan(toolbarSource.indexOf('const useProjectMode = hasValidProjectConfig();'));
  });
});
