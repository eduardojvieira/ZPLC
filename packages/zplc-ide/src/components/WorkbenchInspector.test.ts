import { describe, expect, it } from 'bun:test';
import { presentWorkbenchInspector } from './workbenchInspectorPresentation';

describe('presentWorkbenchInspector', () => {
  it('states only current store facts and keeps host trace distinct from hardware evidence', () => {
    const result = presentWorkbenchInspector({
      activeFile: { name: 'main.st', path: 'src/main.st', language: 'ST' },
      projectName: 'Conveyor 01',
      target: 'native_posix',
      connectionStatus: 'connected',
      controllerBoard: null,
      compilerMessages: [{ type: 'warning' }],
      compilerMessagesChecked: true,
      forcedValuesCount: 1,
      forcesUnconfirmed: false,
      nativeTraceCount: 3,
    });

    expect(result).toMatchObject({
      file: { name: 'main.st', language: 'ST', path: 'src/main.st' },
      project: 'Conveyor 01', target: 'native_posix', device: 'Connected',
      diagnostics: '0 errors · 1 warning', forces: '1 active force', evidence: '3 native POSIX trace samples',
    });
    expect(result.evidence).toContain('POSIX');
    expect(result.evidence).not.toContain('HIL');
  });

  it('does not invent a selected symbol, controller, diagnostics, or evidence', () => {
    const result = presentWorkbenchInspector({
      activeFile: null, projectName: null, target: null, connectionStatus: 'disconnected', controllerBoard: null,
      compilerMessages: [], compilerMessagesChecked: false, forcedValuesCount: 0, forcesUnconfirmed: true, nativeTraceCount: 0,
    });

    expect(result.file).toBeNull();
    expect(result.project).toBe('No project metadata');
    expect(result.device).toBe('Disconnected');
    expect(result.diagnostics).toBe('Not checked');
    expect(result.forces).toContain('unconfirmed');
    expect(result.evidence).toBe('No recorded host trace');
  });

  it('preserves every connection state and adds a board only when one exists', () => {
    const base = {
      activeFile: null, projectName: null, target: null, controllerBoard: null,
      compilerMessages: [], compilerMessagesChecked: true, forcedValuesCount: 0, forcesUnconfirmed: false, nativeTraceCount: 0,
    };
    expect([
      'disconnected', 'connecting', 'connected', 'error',
    ].map((connectionStatus) => presentWorkbenchInspector({ ...base, connectionStatus: connectionStatus as 'disconnected' | 'connecting' | 'connected' | 'error' }).device)).toEqual([
      'Disconnected', 'Connecting', 'Connected', 'Connection error',
    ]);
    expect(presentWorkbenchInspector({ ...base, connectionStatus: 'connecting', controllerBoard: 'Nucleo H743ZI' }).device).toBe('Connecting · Nucleo H743ZI');
  });
});
