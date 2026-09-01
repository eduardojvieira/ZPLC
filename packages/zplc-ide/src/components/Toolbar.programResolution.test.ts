import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { resolveProgramSource } from '../utils/programSourceResolution';

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

});

describe('canonical workspace build failures', () => {
  it('requires an admitted human confirmation for every hardware deploy and leaves cancellation inert', () => {
    expect(toolbarSource).toContain('createHardwareDeployConfirmation');
    expect(toolbarSource).toContain('const confirmation = await createHardwareDeployConfirmation');
    expect(toolbarSource).toContain('if (!window.confirm(confirmation.message)) {');
    expect(toolbarSource).toContain('const current = currentCompileResult();');
    expect(toolbarSource).toContain('const deployProjectSession = useIDEStore.getState().projectSession;');
    expect(toolbarSource).toContain('const deployTargetBoard = useIDEStore.getState().projectConfig?.target?.board;');
    expect(toolbarSource).toContain('latest.projectSession !== deployProjectSession || latest.projectConfig?.target?.board !== deployTargetBoard');
    expect(toolbarSource).toContain('projectBoard: deployTargetBoard');
    expect(toolbarSource).toContain("message: 'Hardware deploy cancelled; no program was sent.'");
    expect(toolbarSource.indexOf('if (!window.confirm(confirmation.message)) {')).toBeLessThan(toolbarSource.indexOf('await loadProgram(dataToUpload'));
    expect(toolbarSource).toContain('programSendStarted && !preflightDenied');
  });

  it('does not label a denied fresh admission as an unknown device state', () => {
    expect(toolbarSource).toContain("error instanceof DeviceAdmissionError && error.code !== DEVICE_ADMISSION_CODE.RESULT_UNKNOWN");
    expect(toolbarSource).toContain("'Hardware deploy preflight failed. No program was sent.'");
  });

  it('claims hardware deploy synchronously before hashing or confirmation can yield', () => {
    expect(toolbarSource).toContain('const uploadInFlightRef = useRef(false);');
    expect(toolbarSource).toContain('if (executionMode !== EXECUTION_MODE.HARDWARE || controlsBusy || uploadInFlightRef.current) return;');
    expect(toolbarSource).toContain('uploadInFlightRef.current = true;');
    expect(toolbarSource.indexOf('uploadInFlightRef.current = true;')).toBeLessThan(toolbarSource.indexOf('await createHardwareDeployConfirmation'));
    expect(toolbarSource).toContain('uploadInFlightRef.current = false;');
  });
  it('reveals Problems for real build failures without changing canonical precondition guidance', () => {
    expect(toolbarSource).toContain("const revealCompileProblems = () => {");
    expect(toolbarSource).toContain("current.setActiveConsoleTab('problems');");
    expect(toolbarSource.match(/revealCompileProblems\(\);/g)?.length).toBeGreaterThanOrEqual(2);
    expect(toolbarSource).toContain("current.setActiveConsoleTab('tests');");
  });

  it('always creates one visible compiler problem when no safe diagnostic is available', () => {
    expect(toolbarSource).toContain('if (canonical.diagnostics.length === 0)');
    expect(toolbarSource.match(/addCompilerMessage\(\{ type: 'error', message: 'Canonical workspace build failed' \}\);/g)?.length).toBe(2);
  });

  it('uses only the canonical workspace compiler and exposes recovery when unavailable', () => {
    expect(toolbarSource).toContain("window.electronAPI !== undefined || navigator.userAgent.includes('Electron/')");
    expect(toolbarSource).toContain("workspaceCompileRoute === 'canonical-unavailable'");
    expect(toolbarSource).toContain('Build requires a saved folder opened in ZPLC Studio.');
    expect(toolbarSource).not.toContain('compileMultiTaskProject');
    expect(toolbarSource).not.toContain('compileSingleFileWithTask');
    expect(toolbarSource).not.toContain('onCreateFile=');
  });

  it('retains keyboard execution focus across Run, Pause, and Resume control replacement only', () => {
    expect(toolbarSource).toContain("const executionButtonRef = useRef<HTMLButtonElement>(null);");
    expect(toolbarSource).toContain("const pendingExecutionFocusRef = useRef<'running' | 'paused' | null>(null);");
    expect(toolbarSource).toContain("pendingExecutionFocusRef.current = keyboardInitiated ? 'running' : null;");
    expect(toolbarSource).toContain("pendingExecutionFocusRef.current = keyboardInitiated ? 'paused' : null;");
    expect(toolbarSource).toContain("handleResume(true);");
    expect(toolbarSource).toContain("handleStart(true);");
    expect(toolbarSource).toContain("handlePause(true);");
    expect(toolbarSource.match(/ref=\{executionButtonRef\}/g)?.length).toBe(3);
    expect(toolbarSource.match(/event\.detail === 0/g)?.length).toBe(3);
    expect(toolbarSource).toContain("requestAnimationFrame(() => executionButtonRef.current?.focus());");
  });
});
